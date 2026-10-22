"""FINAL AI Data Analyst — bounded LIVE acceptance (user-authorized 2026-10-20). NEVER part of the test suite.

Real provider interpretation + real read-only warehouse, through the production AnalysisPipeline. Every physical HTTP
send is reserved first in the EXISTING durable ledger (no reset, no new history); the ceiling is prior + --budget.
Only enums/counts/IDs and server-built short answers are recorded — no prompt payload, SQL, rows or secrets.

  docker compose -f docker-compose.data.yml exec -T analytics-api python -m evals.ai_final_live --out /tmp/ai_final_live.json --budget 40
"""
import argparse
import json
import time
from pathlib import Path
from unittest.mock import patch

LEDGER = Path('/app/.runtime/provider-ledger/v33-live-http-ledger.json')
CASES = [
    ('L01', 'tỷ lệ hủy đơn tháng 09/2026 tại Hồ Chí Minh', 'focused'),
    ('L02', 'tỷ lệ hủy đơn tháng 09/2026 tại Hồ Chí Minh', 'deep'),
    ('L03', 'tỷ lệ hủy đơn tháng 09/2026 tại Hồ Chí Minh', 'comprehensive'),
    ('L04', 'Doanh thu tháng 9 năm 2026 theo chi nhánh', 'deep'),
    ('L05', 'Top 5 món bán chạy nhất tháng 9 năm 2026', 'comprehensive'),
    ('L06', 'Giá trị đơn trung bình theo hình thức nhận hàng tháng 9 năm 2026', 'deep'),
    ('L07', 'Tỷ lệ giao hàng thành công tháng 9 năm 2026', 'deep'),
    ('L08', 'Tồn kho hiện tại theo danh mục', 'deep'),
    ('L09', 'ty le huy don thang 9 nam 2026 o ha noi', 'deep'),
    ('L10', 'Tỷ lệ ca đi trễ theo chi nhánh tháng 9 năm 2026', 'comprehensive'),
    ('L11', 'So sánh doanh thu Hồ Chí Minh và Hà Nội tháng 9 năm 2026', 'deep'),
    ('L12', 'Số khách mua hàng tháng 9 năm 2026', 'focused'),
]


def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument('--out', required=True)
    parser.add_argument('--budget', type=int, default=40)
    parser.add_argument('--cases')
    args = parser.parse_args(argv)
    import requests
    from common import AiTextToReportRequest
    from services.agent_pipeline import AnalysisPipeline
    from services.agent_provider import NativeAgentProvider
    from services.analysis_pipeline import safe_failure
    from evals.live_acceptance_v33 import HttpMeter
    prior = json.loads(LEDGER.read_text())['reserved']
    meter = HttpMeter(prior + args.budget, requests.post, LEDGER, require_existing=True)
    selected = set(args.cases.split(',')) if args.cases else None
    rows = []
    with patch('services.agent_provider.requests.post', meter):
        for id, question, depth in CASES:
            if selected and id not in selected:
                continue
            meter.case = 'AIFINAL-' + id
            if meter.count >= meter.ceiling:
                rows.append(dict(id=id, skipped='ceiling')); continue
            pipeline = AnalysisPipeline(provider=NativeAgentProvider(), owner_id='ai-final-live')
            request = AiTextToReportRequest(question=question, analysis_depth=depth)
            started, row = time.perf_counter(), dict(id=id, depth=depth)
            try:
                proposal = pipeline.propose(request)
                row['proposal_status'] = proposal['status']
                if proposal['status'] == 'proposal_ready':
                    p = proposal['proposal']
                    approved = request.model_copy(update=dict(session_id=p['session_id'], proposal_revision=p['revision'],
                        intent_fingerprint=p['semantic_intent_fingerprint'], plan_fingerprint=p['resolved_plan_fingerprint'],
                        catalog_fingerprint=p['catalog_fingerprint']))
                    report = AnalysisPipeline(provider=NativeAgentProvider(), owner_id='ai-final-live').generate(approved)
                    cov = report.get('analysis_coverage') or {}
                    row.update(status=report['status'], verification=report['quality_assessment']['status'],
                        breadth=(report['quality_assessment'].get('analysis_breadth') or {}),
                        failed_checks=[(c['id'], c['status'], c['summary'][:160]) for c in report['quality_assessment']['verification_checks']
                                       if c['status'] not in ('passed', 'not_applicable')],
                        unverified=[u['label'][:160] for u in report['quality_assessment'].get('unverified', [])],
                        coverage={k: cov.get(k) for k in ('status', 'gap_kind', 'counted', 'targets', 'selection_origin', 'effective_depth', 'family')},
                        charts=[(c['chart_type'], c.get('analysis_lens_id'), c['metrics']) for c in report['charts']],
                        rejected=[(l['id'], l['reason']) for l in cov.get('lenses', []) if l['status'] == 'rejected'],
                        requested=[dict(metrics=q['metrics'], group_by=q['group_by'], time=q['time'], filters=q['filters'])
                                   for q in report['analytical_queries'] if q['role'] == 'requested'],
                        operations=len(report['analytical_queries']), forecasts=len(report.get('forecasts') or []),
                        short_answer=report.get('short_answer'), conclusion=(report.get('conclusion') or {}).get('answer'))
                else:
                    row.update(status=proposal['status'], outcome=proposal.get('outcome'))
            except Exception as error:  # typed failure: recorded, never retried here
                failure = safe_failure(error, pipeline.calls, pipeline.semantic_info)
                row.update(status=failure['status'], analysis_state=failure['analysis_state'],
                           error_category=failure['diagnostics']['error_category'])
            row.update(latency_ms=round((time.perf_counter() - started) * 1000), physical_http=meter.by_case.get(meter.case, 0),
                       logical_calls=pipeline.semantic_info.get('provider_call_count'))
            rows.append(row)
            print(json.dumps({k: row.get(k) for k in ('id', 'depth', 'status', 'verification', 'coverage', 'physical_http', 'latency_ms')}, ensure_ascii=False, default=str), flush=True)
            Path(args.out).write_text(json.dumps(dict(prior_ledger=prior, ceiling=meter.ceiling, rows=rows), ensure_ascii=False, indent=1, default=str))
            time.sleep(4)
    final = json.loads(LEDGER.read_text())['reserved']
    summary = dict(prior_ledger=prior, final_ledger=final, physical_sends=final - prior, ceiling=meter.ceiling, rows=rows)
    Path(args.out).write_text(json.dumps(summary, ensure_ascii=False, indent=1, default=str))
    print(json.dumps({k: summary[k] for k in ('prior_ledger', 'final_ledger', 'physical_sends', 'ceiling')}))


if __name__ == '__main__':
    main()
