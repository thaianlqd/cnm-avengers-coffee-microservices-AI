"""Offline production planning qualification, with forbidden live transports."""
import argparse
import json
import os
import time
from pathlib import Path
from collections import Counter
from datetime import date
from unittest.mock import Mock,patch
from common import AiTextToReportRequest, AiReportRefineRequest
from services.analysis_pipeline import AnalysisPipeline,safe_failure
from services.analysis_catalog import AnalysisCatalog
from services.analysis_intent import AnalysisIntentEnvelope
from services.analytical_resolver import AnalyticalResolver
from services.hybrid_analyst_planner import apply_delta
from tests.analysis_fixtures import physical_metadata
from tests.test_hybrid_v28 import scripted, approve
from tests.agent_fixtures import ScriptedProvider, call
from evals.fixture_warehouse import FixtureWarehouse
from evals.golden_v28 import load_cases


def run_case(case):
    provider=scripted(*case['provider_envelopes'])
    executor=Mock(side_effect=AssertionError('Planning qualification cannot execute SQL'))
    p=AnalysisPipeline(metadata_loader=physical_metadata,provider=provider,executor=executor,value_lookup=Mock(return_value=[]),owner_id='offline')
    request=AiTextToReportRequest(question=case['question'],reference_date=date(2026,10,8),**({'time':case['time']} if case.get('time') else {}))
    started=time.perf_counter();warehouse=None;planning_executed=False
    try:
        report=p.propose(request)
        planning_executed=bool(executor.call_count)
        if case.get('delta'):
            warehouse=FixtureWarehouse(p._active_catalog.overlay)
            p.executor=warehouse
            approve(request,report)
            generated=p.generate(request)
            p.provider=ScriptedProvider([call('submit_analysis_delta',case['delta'])])
            limit=case['delta']['changes'][0]['changes']['ranking']['limit']
            refined=p.refine(AiReportRefineRequest(session_id=request.session_id,current_report={'revision':generated['revision']},feedback=f'Top {limit}'))
            assert refined['quality_assessment']['status'] in {'verified','partially_verified'}
            assert refined['quality_assessment']['score'] <= 90
            assert refined['quality_assessment']['accuracy_assessment']['status']=='not_measured'
            report={'status':'proposal_ready','proposal':{'analytical_queries':refined['analytical_queries']}}
    except Exception as error:
        report=safe_failure(error,p.calls,p.semantic_info)
    finally:
        if warehouse:warehouse.close()
    failures=[]
    if report['status']!=case['expected']:failures.append('outcome')
    if case.get('expected_outcome') and report.get('outcome')!=case['expected_outcome']:failures.append('business_outcome')
    if provider.call_count!=case.get('expected_calls',1):failures.append('provider_count')
    queries=report.get('proposal',{}).get('analytical_queries',[])
    if case.get('expected_metrics') and {m for q in queries for m in q['metrics']}!=set(case['expected_metrics']):failures.append('metric_meaning')
    if case.get('expected_operations') is not None and len(queries)!=case['expected_operations']:failures.append('minimal_operations')
    if case.get('frozen'):
        payload=json.loads(provider.requests[1]['messages'][0]['content'])
        if payload.get('frozen_requirement_ids')!=case['frozen']:failures.append('repair_freezing')
    if planning_executed or executor.call_count:failures.append('planning_executed_sql')
    if case.get('delta') and p.provider.call_count!=1:failures.append('delta_provider_count')
    return dict(id=case['id'],group=case['group'],passed=not failures,failures=failures,status=report['status'],provider_calls=provider.call_count,
        failure_stage=report.get('diagnostics',{}).get('failure_stage'),
        latency_ms=round((time.perf_counter()-started)*1000,2),**{k:p.semantic_info.get(k) for k in ('total_context_chars','repair_context_chars','schema_chars','resolver_latency_ms','compiler_latency_ms')})


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--output',type=Path,default=Path('/app/evaluation/v28'));args=parser.parse_args()
    with patch.dict(os.environ,{'AI_OFFLINE':'1','DATA_ANALYST_ENV':'development','DATA_ANALYST_SESSION_STORE':'memory','DATA_ANALYST_MAX_PROVIDER_CALLS_PER_TURN':'3','DATA_ANALYST_ENABLE_CONTRACT_REPAIR':'1'}),patch('requests.sessions.Session.request',side_effect=AssertionError('HTTP forbidden')),patch('psycopg2.connect',side_effect=AssertionError('Live DB forbidden')):
        cases=load_cases();rows=[run_case(c) for c in cases]
    args.output.mkdir(parents=True,exist_ok=True)
    (args.output/'golden_cases.json').write_text(json.dumps(cases,ensure_ascii=False,indent=2)+'\n')
    summary=dict(version='2.8',case_count=len(rows),passed=sum(r['passed'] for r in rows),groups=dict(Counter(r['group'] for r in rows)),
        LIVE_PROVIDER_REQUESTS=0,model_accuracy_measured=False,provider_latency_measured=False,
        failures=[r for r in rows if not r['passed']],rows=rows)
    (args.output/'evaluation_summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({k:v for k,v in summary.items() if k!='rows'},ensure_ascii=False))
    return bool(summary['failures'])


if __name__=='__main__':raise SystemExit(main())
