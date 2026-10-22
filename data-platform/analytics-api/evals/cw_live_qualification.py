"""Live qualification for the comparison-workspace goal (H.9/H.10).

Runs every frozen case of evals/cw_live_cases.json through the production pipeline in-process
(configured provider + READ ONLY warehouse), serially, with per-request budgets unchanged. Each
attempt is kept in the ledger (no re-run cherry-picking). Checks are structural (frame, selection,
census) plus an independent oracle: hand-written SQL over silver tables, never the compiler.

Usage (inside the analytics-api container):
  python -m evals.cw_live_qualification --out /app/evaluation/cw-live/<run>.json [--cases P01,N01]
Secrets are never printed: only categories, counts, tokens and latencies are recorded.
"""
import argparse
import hashlib
import json
import time
import traceback
from datetime import date, datetime, timezone
from pathlib import Path
from statistics import mean, pstdev

from common import AiTextToReportRequest
from services.analysis_catalog import AnalysisError
from services.analysis_pipeline import AnalysisPipeline
from services.sql_service import execute_read_only

CASES = Path(__file__).with_name('cw_live_cases.json')
OUTCOME = {'clarification': 'clarification', 'filter_value_unknown': 'clarification', 'filter_value_ambiguous': 'clarification',
           'metric_ambiguous': 'clarification', 'approval_required': 'clarification',
           'unsupported_metric': 'unsupported', 'selection_unsupported': 'unsupported', 'historical_metric_unavailable': 'unsupported',
           'unsupported': 'unsupported', 'forecast_unsupported': 'unsupported', 'insufficient_data': 'insufficient'}
VALID = "('HOAN_THANH','DANG_GIAO')"


def oracle_by_city(metric, start, end, members):
    names = ', '.join("'" + m.replace("'", "''") + "'" for m in members)
    sql = (f"SELECT c.thanh_pho AS city, SUM(d.tong_tien) AS revenue, COUNT(*) AS n FROM silver.don_hang d "
           f"JOIN silver.chi_nhanh c ON c.ma_chi_nhanh = d.co_so_ma WHERE d.trang_thai_don_hang IN {VALID} "
           f"AND d.ngay_tao >= '{start}' AND d.ngay_tao < '{end}' AND c.thanh_pho IN ({names}) GROUP BY c.thanh_pho")
    rows = execute_read_only(sql, row_limit=100)['rows']
    out = {}
    for r in rows:
        rev, n = float(r['revenue'] or 0), int(r['n'])
        out[r['city']] = {'revenue': rev, 'valid_order_count': n, 'aov': rev / n if n else None}[metric]
    return out


def oracle_selection(criterion, limit, start, end):
    sql = (f"SELECT c.thanh_pho AS city, DATE_TRUNC('month', d.ngay_tao) AS m, SUM(d.tong_tien) AS v FROM silver.don_hang d "
           f"JOIN silver.chi_nhanh c ON c.ma_chi_nhanh = d.co_so_ma WHERE d.trang_thai_don_hang IN {VALID} "
           f"AND d.ngay_tao >= '{start}' AND d.ngay_tao < '{end}' GROUP BY 1, 2")
    series = {}
    for r in execute_read_only(sql, row_limit=5000)['rows']:
        series.setdefault(r['city'], {})[str(r['m'])[:7]] = float(r['v'])
    months = sorted({m for s in series.values() for m in s})
    scores = {}
    for city, s in series.items():
        if len(s) != len(months) or len(months) < 3:
            continue
        values = [s[m] for m in months]
        if criterion in ('stability', 'volatility'):
            if mean(values) > 0:
                scores[city] = pstdev(values) / mean(values)
        elif values[0] > 0:
            scores[city] = (values[-1] - values[0]) / values[0]
    reverse = criterion != 'stability'
    return sorted(scores, key=lambda c: (-scores[c] if reverse else scores[c], c))[:limit], scores


def primary_values(report):
    chart = next((c for c in report.get('charts', []) if c.get('relevance_role') == 'primary' and c.get('view_modes')), None)
    if not chart:
        return None
    variant = next(v for v in chart['view_modes']['variants'] if v['id'] == chart['view_modes']['default_variant'])
    data = variant['payload']['data']
    if variant['payload'].get('series'):
        return None
    return {row['label']: row['value'] for row in data}


checks_detail = {}


def reference_epoch(report):
    """Observe the reference read's replica vector; never assert source atomicity."""
    observed = (report.get('provenance') or {}).get('data_epoch') or {}
    sources = observed.get('sources') or []
    if observed.get('status') != 'observed' or not sources:
        return dict(status='not_measured',reason='report_generation_not_pinned',report_epoch=observed)
    names = ','.join("'"+s['dataset_id'].replace("'","''")+"'" for s in sources)
    try:
        rows = execute_read_only('SELECT dataset_id,generation,schema_fingerprint FROM analytics.ingestion_checkpoints '
            f'WHERE dataset_id IN ({names}) ORDER BY dataset_id',row_limit=200)['rows']
        canonical=lambda rs:sorted([{k:r[k] for k in ('dataset_id','generation','schema_fingerprint')} for r in rs],key=lambda r:r['dataset_id'])
        return dict(status='observed',same_observed_generations=canonical(rows)==canonical(sources),
                    report_epoch=observed,reference_sources=rows,
                    limitation='Replica generation vector only; not source transaction or completeness proof.')
    except Exception as exc:
        return dict(status='not_measured',reason=type(exc).__name__,report_epoch=observed)


def check_meaning(expected, report):
    """Independent authored rubric: success/verification alone cannot prove meaning.

    Read public semantic/executable output, never call the resolver/compiler to
    construct an expected plan. Denominator components are permitted as evidence
    columns, but do not become extra user-requested metrics.
    """
    reqs = [r for r in (report.get('semantic_intent') or {}).get('requirements', [])
            if not r.get('supporting_for') and r.get('availability', 'requested') == 'requested']
    queries = [q for q in report.get('analytical_queries', []) if q.get('role') == 'requested']
    ids = {q['id'] for q in queries}
    plans = [p for p in report.get('query_plans', []) if p['id'] in ids]
    metrics = {m for r in reqs for m in r.get('metric_ids', [])}
    metric = expected['metric']
    valid_statuses = {'HOAN_THANH', 'DANG_GIAO'}
    def values(f):
        v = f.get('value'); return set(v if isinstance(v, list) else [v])
    def valid_twin(r):
        return any(f.get('dimension') == 'order_status' and f.get('operator') in {'eq','in'}
                   and values(f) == valid_statuses for f in r.get('filters', []))
    metric_ok = metrics == {metric} or (metric == 'valid_order_count' and metrics == {'order_count'}
                  and bool(reqs) and all(valid_twin(r) for r in reqs))
    checks = {'meaning_metric': metric_ok,
              'meaning_dimensions': bool(reqs) and all(set(expected['dimensions']) <= set(r.get('dimension_ids', [])) for r in reqs)}
    periods = {(str((p.get('period') or {}).get('start'))[:10] if (p.get('period') or {}).get('start') else None,
                str((p.get('period') or {}).get('end'))[:10] if (p.get('period') or {}).get('end') else None) for p in plans}
    wanted = {tuple(expected['period'])}
    if expected.get('baseline_period'):wanted.add(tuple(expected['baseline_period']))
    checks['meaning_period'] = bool(plans) and periods == wanted
    if expected.get('baseline_period'):
        # Target must be September, baseline August; a set of dates alone would
        # accept reversing the direction of the user's comparison.
        target_ids = {b['query_id'] for b in report.get('derived_feature_bindings', []) if b.get('feature') == 'period_comparison'}
        checks['meaning_baseline_direction'] = any(p['id'] in target_ids and
            tuple(str((p.get('period') or {}).get(k))[:10] for k in ('start','end')) == tuple(expected['period']) for p in plans)
    if expected.get('granularity'):
        checks['meaning_cadence'] = any(q.get('operation') == 'trend' and q.get('granularity') == expected['granularity'] for q in queries)
    if expected.get('ranking'):
        rank = expected['ranking']
        checks['meaning_ranking'] = any(r.get('ranking') and
            all(r['ranking'].get(k) == v for k,v in {'metric_id':rank['metric'],'direction':rank['direction'],'limit':rank['limit']}.items()) for r in reqs)
    if expected.get('city_scope'):
        checks['meaning_city_scope'] = bool(reqs) and all(any(f.get('dimension') == 'city' and
            f.get('operator') in {'eq','in'} and values(f) == {expected['city_scope']} for f in r.get('filters', [])) for r in reqs)
    if expected.get('exclude'):
        e=expected['exclude']
        def excluded(r):
            return any(f.get('dimension') == e['dimension'] and (
                f.get('operator') in {'neq','not_in'} and e['value'] in values(f) or
                f.get('operator') in {'eq','in'} and bool(values(f)) and e['value'] not in values(f)) for f in r.get('filters', []))
        checks['meaning_exclusion'] = bool(reqs) and all(excluded(r) for r in reqs)
    if not all(checks.values()):
        checks_detail['meaning'] = {'expected':expected,'metrics':sorted(metrics),'periods':sorted(periods,key=str),
            'requested':[dict(id=r['id'],dims=r.get('dimension_ids'),filters=r.get('filters'),ranking=r.get('ranking')) for r in reqs]}
    return checks


def check(case, report, error):
    exp, checks = case['expect'], {}
    checks_detail.clear()
    frames = None
    allowed = exp['outcome'] if isinstance(exp['outcome'], list) else [exp['outcome']]
    got = 'success' if report and report.get('status') == 'success' else OUTCOME.get(getattr(error, 'category', None), 'error')
    checks['outcome'] = got in allowed
    if got != 'success' or not report:
        if 'choices_include' in exp:
            ids = {c.get('criterion') or c.get('id') for c in getattr(error, 'choices', []) or []}
            checks['choices'] = set(exp['choices_include']) <= ids
        return got, checks
    frames = report.get('comparison_frames') or []
    checks['verified'] = (report.get('verification') or {}).get('status') == 'verified'
    if exp.get('meaning'):
        checks.update(check_meaning(exp['meaning'], report))
    if exp.get('no_frame'):
        checks['no_frame'] = not frames
    if exp.get('axis'):
        frame = next((f for f in frames if f['axis_dimension_id'] == exp['axis']), None)
        checks['frame_axis'] = frame is not None
        if frame and exp.get('members'):
            checks['members'] = sorted(m['key'] for m in frame['members']) == sorted(exp['members'])
        if frame and exp.get('composite'):
            checks['composite'] = bool(frame.get('composite'))
        if frame:
            axis_charts = [c for c in report['charts'] if exp['axis'] in (c.get('dimension_ids') or [])]
            supporting = [c for c in report['charts'] if c.get('relevance_role') == 'supporting' and c.get('metric') in frame['metric_ids']]
            checks['supporting_keep_axis'] = all(exp['axis'] in (c.get('dimension_ids') or []) for c in supporting)
            checks['view_modes'] = bool(axis_charts) and all(c.get('view_modes') for c in axis_charts)
            if exp.get('total_unavailable'):
                primary = next((c for c in axis_charts if c.get('relevance_role') == 'primary'), None)
                checks['distinct_total_unavailable'] = bool(primary) and all(
                    v['availability'] == 'unavailable' for v in primary['view_modes']['variants'] if v['spec']['mode'] == 'total')
    if exp.get('selection'):
        intent = report.get('semantic_intent') or {}
        sel = next((r.get('selection') for r in intent.get('requirements', []) if r.get('selection')), None)
        checks['selection_criterion'] = bool(sel) and sel['criterion'] == exp['selection'] and sel['limit'] == exp['limit']
        if sel and exp.get('oracle_selection'):
            o = exp['oracle_selection']
            chosen, scores = oracle_selection(exp['selection'], exp['limit'], o['start'], o['end'])
            checks['selection_oracle'] = sel.get('selected_keys') == chosen
            checks_detail['selection_oracle'] = dict(expected=chosen,shown=sel.get('selected_keys'),scores=scores)
    if exp.get('ranking_census'):
        checks['ranking_census'] = any(c.get('ranking_census') for c in report['charts'])
    if exp.get('exposure'):
        checks['exposure'] = any('denominator' in row for c in report['charts'] for row in c.get('data') or [])
    if exp.get('oracle') and exp.get('members'):
        o = exp['oracle']
        expected = oracle_by_city(o['metric'], o['start'], o['end'], exp['members'])
        shown = primary_values(report) or {}
        checks['oracle_values'] = bool(shown) and all(abs(shown.get(k, float('nan')) - v) <= 1e-6 * max(1, abs(v)) for k, v in expected.items())
        checks_detail['oracle'] = dict(expected=expected, shown=shown, window=o)
    if frames is not None and not all(checks.values()):
        checks_detail['frames'] = [dict(axis=f.get('axis_dimension_id'), members=[m['key'] for m in f.get('members', [])]) for f in frames]
        checks_detail['charts'] = [dict(role=c.get('relevance_role'), dims=c.get('dimension_ids'), type=c.get('chart_type'), metric=c.get('metric')) for c in report.get('charts', [])][:8]
    return got, checks


def attempt(case, reference):
    pipeline = AnalysisPipeline(owner_id='cw-live-qualification')
    started = time.perf_counter()
    report = error = None
    phase = 'propose'
    try:
        req = AiTextToReportRequest(question=case['q'], reference_date=reference, analysis_depth='deep',refresh=True)
        proposal = pipeline.propose(req)
        if proposal.get('status') == 'proposal_ready':
            p = proposal['proposal']
            req.session_id = proposal['session_id']; req.proposal_revision = p['revision']
            req.intent_fingerprint = p['semantic_intent_fingerprint']; req.plan_fingerprint = p['resolved_plan_fingerprint']
            req.catalog_fingerprint = p['catalog_fingerprint']; req.accept_partial_scope = bool(p.get('partial_scope'))
            phase = 'generate'
            report = AnalysisPipeline(owner_id='cw-live-qualification').generate(req)
        else:
            report = proposal
    except AnalysisError as exc:
        error = exc
    except Exception as exc:  # noqa: BLE001 - recorded as an infrastructure error, never retried silently
        error = exc
        error.category = 'internal_error'
        error.trace = traceback.format_exc(limit=3)[-600:]
    info = pipeline.semantic_info
    return report, error, dict(
        phase=phase, latency_ms=round((time.perf_counter() - started) * 1000), error_category=getattr(error, 'category', None),
        error_message=str(error)[:300] if error else None, logical_calls=info.get('logical_provider_calls', 0),
        http_attempts=info.get('provider_http_attempts', 0), repairs=info.get('semantic_repair_count', 0),
        input_tokens=info.get('input_tokens'), output_tokens=info.get('output_tokens'),
        provider_attempts=[{k:v for k,v in a.items() if k in {
            'provider','model','status','tokens','latency_ms','error_category','credential_slot',
            'credential_failover','transport_resend'}} for a in info.get('provider_calls',[])],
        request_id=info.get('request_id'), contract_issues=getattr(error, 'issues', None), issues=info.get('semantic_issue_history'), draft_shapes=info.get('draft_shapes'), session_id=(report or {}).get('session_id'), trace=getattr(error, 'trace', None))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--out', required=True)
    parser.add_argument('--cases')
    parser.add_argument('--manifest',default=str(CASES))
    args = parser.parse_args()
    manifest_path=Path(args.manifest)
    manifest = json.loads(manifest_path.read_text())
    reference = date.fromisoformat(manifest['reference_date'])
    wanted = set(args.cases.split(',')) if args.cases else None
    out = Path(args.out)
    ledger = json.loads(out.read_text()) if out.exists() else dict(manifest_version=manifest['version'], runs=[])
    source_files=[p for d in ('services','routers','metadata','evals') for p in Path(d).rglob('*')
                  if p.is_file() and p.suffix in {'.py','.json'} and '__pycache__' not in p.parts]
    run = dict(started_at=datetime.now(timezone.utc).isoformat(), cases=[],
               manifest_sha256=hashlib.sha256(manifest_path.read_bytes()).hexdigest(),
               source_hashes={str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(source_files)})
    ledger['runs'].append(run)
    for case in manifest['cases']:
        if wanted and case['id'] not in wanted:
            continue
        report, error, meta = attempt(case, reference)
        if report and report.get('status')=='success':
            artifact_dir=out.parent/(out.stem+'-reports')
            artifact_dir.mkdir(parents=True,exist_ok=True)
            report_path=artifact_dir/(str(len(ledger['runs']))+'-'+case['id']+'.json')
            report_path.write_text(json.dumps(report,ensure_ascii=False,indent=1,default=str))
            meta['report_ref']=str(report_path)
            meta['report_sha256']=hashlib.sha256(report_path.read_bytes()).hexdigest()
        try:
            got, checks = check(case, report, error)
        except Exception as exc:  # noqa: BLE001
            got, checks = 'check_error', {'check_error': False}
            meta['check_trace'] = traceback.format_exc(limit=2)[-400:]
        if report and ('oracle' in case['expect'] or 'oracle_selection' in case['expect']):
            meta['independent_reference_epoch'] = reference_epoch(report)
        passed = all(checks.values())
        run['cases'].append(dict(id=case['id'], set=case['set'], outcome=got, checks=checks, passed=passed,
                                 first_pass=passed and meta['repairs'] == 0, detail=dict(checks_detail), **meta))
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(ledger, ensure_ascii=False, indent=1, default=str))
        print(case['id'], got, 'PASS' if passed else 'FAIL', {k: v for k, v in checks.items() if not v}, meta['logical_calls'], meta['latency_ms'], flush=True)
    run['finished_at'] = datetime.now(timezone.utc).isoformat()
    out.write_text(json.dumps(ledger, ensure_ascii=False, indent=1, default=str))


if __name__ == '__main__':
    main()
