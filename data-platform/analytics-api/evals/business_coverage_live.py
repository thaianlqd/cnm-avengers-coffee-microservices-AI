"""PLAN 20/10 P7 — bounded LIVE business-coverage acceptance (user-authorized 20/10/2026). NEVER part of the test suite.

Campaign caps (PLAN §8): at most 120 physical provider sends and 500,000 input+output tokens, concurrency 1,
existing durable ledger (no reset). Only synthetic, PII-free corpus questions are sent. One attempt per case:
the recorded score is first-pass; nothing is retried to pass. Records enums/IDs/counts only.

  docker compose -f docker-compose.data.yml exec -T analytics-api python -m evals.business_coverage_live \
      --live --max-calls 120 --max-tokens 500000 --out /app/evaluation/business_coverage_live.json
"""
import argparse
import json
import time
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
LEDGER = Path('/app/.runtime/provider-ledger/v33-live-http-ledger.json')
MANDATORY = ['BC-REV-001', 'BC-REV-002', 'BC-REV-003', 'BC-REV-004', 'BC-REV-007', 'BC-REV-008', 'BC-REV-013']
TOKEN_MARGIN = 20000  # never start a case that could cross the token cap


def select_cases(corpus, profiles):
    """Two cases per active analytical domain (holdout first) + mandatory regressions + a few zero-send limits."""
    cases = {c['id']: c for c in corpus['cases']}
    chosen = list(MANDATORY)
    for domain in sorted(profiles):
        pool = [c for c in corpus['cases'] if c['required_domains'] == [domain] and c['id'] not in chosen]
        pool.sort(key=lambda c: (not c['holdout'], c['id']))
        chosen += [c['id'] for c in pool[:2]]
    chosen += [c['id'] for c in corpus['cases'] if c.get('expect_privacy_block') or c.get('expect_capability')][:6]
    return [cases[i] for i in dict.fromkeys(chosen)]


def score(case, row):
    used = {m for q in row.get('requested', []) for m in q['metrics']}
    if case.get('expect_privacy_block') or case.get('expect_capability'):
        return row.get('status') != 'success' or not (set(case['forbidden_metrics']) & used)
    if case['expect_ambiguous']:
        return row.get('error_category') == 'subject_ambiguous'
    if case.get('accept_empty') and row.get('error_category') == 'insufficient_data':
        return True  # typed EMPTY is the correct answer when the governed population has no rows
    if row.get('status') != 'success':
        return False
    wanted = set(case.get('required_metrics_any') or case.get('required_metrics') or [])
    return (not wanted or bool(wanted & used)) and not (set(case['forbidden_metrics']) & used)


def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument('--out', required=True)
    parser.add_argument('--live', action='store_true')
    parser.add_argument('--max-calls', type=int, required=True)
    parser.add_argument('--max-tokens', type=int, required=True)
    parser.add_argument('--cases')
    args = parser.parse_args(argv)
    if not args.live or args.max_calls > 120 or args.max_tokens > 500000:
        raise SystemExit('Explicit --live with PLAN caps (<=120 sends, <=500000 tokens) required')
    import requests
    from common import AiTextToReportRequest
    from services.agent_pipeline import AnalysisPipeline
    from services.agent_provider import NativeAgentProvider
    from services.analysis_pipeline import safe_failure
    from services.analysis_catalog import CATALOG_PATH
    from evals.live_acceptance_v33 import HttpMeter
    corpus = json.loads((ROOT / 'evals/business_coverage_cases.json').read_text())
    profiles = json.loads(CATALOG_PATH.read_text())['analysis_registry']['domain_intelligence']['profiles']
    cases = select_cases(corpus, profiles)
    if args.cases:
        cases = [c for c in cases if c['id'] in set(args.cases.split(','))]
    usage = {'input': 0, 'output': 0}
    real_post = requests.post  # bound before patching: the patch replaces requests.post globally

    def metered_post(*a, **kw):
        response = real_post(*a, **kw)
        try:
            body = response.json()
            meta, compat = body.get('usageMetadata') or {}, body.get('usage') or {}
            usage['input'] += int(meta.get('promptTokenCount') or compat.get('prompt_tokens') or 0)
            usage['output'] += int((meta.get('candidatesTokenCount') or 0) + (meta.get('thoughtsTokenCount') or 0) or compat.get('completion_tokens') or 0)
        except Exception:
            pass
        return response

    prior = json.loads(LEDGER.read_text())['reserved']
    meter = HttpMeter(prior + args.max_calls, metered_post, LEDGER, require_existing=True)
    rows = []
    campaign_ceiling = meter.ceiling
    with patch('services.agent_provider.requests.post', meter):
        for case in cases:
            meter.case = case['id']
            meter.ceiling = min(campaign_ceiling, meter.count + 4)  # one failing case cannot drain the campaign
            row = dict(id=case['id'], group=case['group'], holdout=case['holdout'])
            if meter.count >= campaign_ceiling or usage['input'] + usage['output'] >= args.max_tokens - TOKEN_MARGIN:
                rows.append({**row, 'skipped': 'campaign_cap'}); continue
            pipeline = AnalysisPipeline(provider=NativeAgentProvider(), owner_id='business-coverage-live')
            request = AiTextToReportRequest(question=case['question'], analysis_depth='focused')
            started, before = time.perf_counter(), dict(usage)
            try:
                proposal = pipeline.propose(request)
                row['proposal_status'] = proposal['status']
                if proposal['status'] == 'proposal_ready':
                    p = proposal['proposal']
                    row['partial_scope'] = bool(p.get('partial_scope'))  # the UI asks the user to accept a reduced scope
                    approved = request.model_copy(update=dict(session_id=p['session_id'], proposal_revision=p['revision'], accept_partial_scope=bool(p.get('partial_scope')),
                        intent_fingerprint=p['semantic_intent_fingerprint'], plan_fingerprint=p['resolved_plan_fingerprint'],
                        catalog_fingerprint=p['catalog_fingerprint']))
                    report = AnalysisPipeline(provider=NativeAgentProvider(), owner_id='business-coverage-live').generate(approved)
                    row.update(status=report['status'], verification=report['quality_assessment']['status'],
                               requested=[dict(metrics=q['metrics'], group_by=q['group_by']) for q in report['analytical_queries'] if q['role'] == 'requested'],
                               charts=len(report['charts']))
                else:
                    row.update(status=proposal['status'], outcome=proposal.get('outcome'))
            except Exception as error:  # typed failure recorded; never retried
                import traceback
                failure = safe_failure(error, pipeline.calls, pipeline.semantic_info)
                frames = [f'{fr.filename.rsplit("/", 1)[-1]}:{fr.lineno}' for fr in traceback.extract_tb(error.__traceback__)][-3:]
                row.update(status=failure['status'], analysis_state=failure['analysis_state'], error_category=failure['diagnostics']['error_category'],
                           error_type=type(error).__name__, frames=frames,
                           issue_codes=sorted({i.get('code') for i in failure['diagnostics'].get('contract_issues', []) if isinstance(i, dict)}))
            row.update(latency_ms=round((time.perf_counter() - started) * 1000), physical_http=meter.by_case.get(case['id'], 0),
                       tokens=usage['input'] + usage['output'] - before['input'] - before['output'])
            row['first_pass'] = score(case, row)
            rows.append(row)
            print(json.dumps({k: row.get(k) for k in ('id', 'status', 'first_pass', 'physical_http', 'tokens')}, ensure_ascii=False), flush=True)
            Path(args.out).write_text(json.dumps(dict(prior_ledger=prior, usage=usage, rows=rows), ensure_ascii=False, indent=1, default=str))
            time.sleep(3)
    final = json.loads(LEDGER.read_text())['reserved']
    done = [r for r in rows if 'first_pass' in r]
    hold = [r for r in done if r['holdout']]
    summary = dict(prior_ledger=prior, final_ledger=final, physical_sends=final - prior, actual_http=meter.actual_http, tokens=usage, cases=len(rows), executed=len(done),
                   first_pass=sum(r['first_pass'] for r in done), holdout_first_pass=sum(r['first_pass'] for r in hold), holdout_executed=len(hold),
                   mandatory_failed=[r['id'] for r in done if r['id'] in MANDATORY and not r['first_pass']], rows=rows)
    Path(args.out).write_text(json.dumps(summary, ensure_ascii=False, indent=1, default=str))
    print(json.dumps({k: summary[k] for k in ('physical_sends', 'actual_http', 'tokens', 'executed', 'first_pass', 'holdout_first_pass', 'holdout_executed', 'mandatory_failed')}, ensure_ascii=False))


if __name__ == '__main__':
    main()
