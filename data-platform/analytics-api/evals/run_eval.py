"""python -m evals.run_eval --mode offline|observations --output /tmp/eval

Offline scripts are contract/fixture qualification, NEVER model accuracy.
Observations are explicitly collected reports: this CLI contains no provider.
"""
import argparse
import json
import hashlib
import os
from pathlib import Path
from datetime import date
from unittest.mock import patch, Mock
from services.analysis_catalog import AnalysisCatalog
from services.analysis_pipeline import AnalysisPipeline, safe_failure
from common import AiTextToReportRequest
from tests.analysis_fixtures import physical_metadata
from tests.test_one_shot_v24 import scripted
from evals.fixture_warehouse import FixtureWarehouse
from evals.golden import load_cases, VERSION
from evals.scorers import assess_case, aggregate, stability

CRITICAL_IDS=['sales_overview_1','product_volume_1','product_sales_1','category_mix_1','product_trend_1','voucher_usage_1','payment_mix_1','store_performance_1','buying_customers_1','spend_snapshot_1','inventory_alerts_1','shipper_relationship_1','multi_1','multi_8','profit','roi','ambiguous_store','history_shipper','unsafe_metric','unknown_city']


def run_offline(case,catalog):
    warehouse=FixtureWarehouse(catalog.overlay)
    if case.get('scripted_decisions'):
        from tests.agent_fixtures import ScriptedProvider,call
        provider=ScriptedProvider(*[[call('submit_analyst_decision',d)] for d in case['scripted_decisions']])
    else:provider=scripted(case['scripted_decision'])
    p=AnalysisPipeline(metadata_loader=physical_metadata,provider=provider,executor=warehouse,value_lookup=Mock(return_value=[]))
    request=AiTextToReportRequest(**case['input'],reference_date=date(2026,10,7))
    try:
        with patch.dict(os.environ,{'DATA_ANALYST_MAX_PROVIDER_CALLS_PER_TURN':'2' if case.get('scripted_decisions') else '1','DATA_ANALYST_ENABLE_CONTRACT_REPAIR':'1' if case.get('scripted_decisions') else '0'}):
            proposal=p.propose(request)
        request.session_id=proposal['session_id']
        if proposal['outcome']=='PARTIAL_AVAILABLE':request.accept_partial_scope=True
        report=p.generate(request)
    except Exception as exc:report=safe_failure(exc,p.calls,p.semantic_info)
    finally:warehouse.close()
    row=assess_case(case,report,catalog);row['scripted_provider_calls']=provider.call_count
    return row


def main(argv=None):
    parser=argparse.ArgumentParser();parser.add_argument('--mode',choices=['offline','observations'],default='offline')
    parser.add_argument('--observations',type=Path);parser.add_argument('--output',type=Path,default=Path('/tmp/data-analyst-v27-eval'))
    parser.add_argument('--split',choices=['dev','holdout','all'],default='all');args=parser.parse_args(argv)
    cases=[c for c in load_cases() if args.split=='all' or c['split']==args.split];catalog=AnalysisCatalog(physical_metadata());rows=[]
    with patch.dict(os.environ,{'AI_OFFLINE':'1','DATA_ANALYST_MAX_PROVIDER_CALLS_PER_TURN':'1','DATA_ANALYST_ENABLE_CONTRACT_REPAIR':'0'}),patch('requests.sessions.Session.request',side_effect=AssertionError('HTTP forbidden')),patch('psycopg2.connect',side_effect=AssertionError('Live DB forbidden')):
        if args.mode=='offline':rows=[run_offline(c,catalog) for c in cases]
        else:
            if not args.observations:parser.error('--observations is required')
            by_id={c['id']:c for c in cases};seen=set()
            for line in args.observations.read_text().splitlines():
                record=json.loads(line);key=(record.get('model_id','unspecified'),record['case_id'],record['run_id'])
                if key in seen:raise ValueError('Duplicate observation')
                seen.add(key)
                if record['case_id'] not in by_id:continue
                row=assess_case(by_id[record['case_id']],record['report'],catalog);row['run_id']=record['run_id'];row['model_id']=record.get('model_id','unspecified');rows.append(row)
    summary=dict(version=VERSION,dataset_sha256=hashlib.sha256(json.dumps(load_cases(),ensure_ascii=False,sort_keys=True).encode()).hexdigest(),catalog_fingerprint=catalog.fingerprint,mode=args.mode,interpretation='Scripted contract and independent fixture qualification; model semantic accuracy NOT MEASURED.' if args.mode=='offline' else 'Imported observations against a fixed synthetic fixture schema; report per split, model and run independently.',
        real_provider_calls=0,real_embedding_calls=0,live_database_mutations=0,model_accuracy_measured=args.mode=='observations' and bool(rows) and all(r.get('model_id')!='unspecified' for r in rows),
        aggregate=aggregate(rows),by_split={s:aggregate([r for r in rows if r['split']==s]) for s in ('dev','holdout')},
        by_difficulty={d:aggregate([r for r in rows if r['difficulty']==d]) for d in sorted({r['difficulty'] for r in rows})},
        by_domain={d:aggregate([r for r in rows if d in r['domains']]) for d in sorted({d for r in rows for d in r['domains']})},
        failures=[{'id':r['id'],'reasons':r['failures']} for r in rows if not r['passed']],
        by_model={m:aggregate([r for r in rows if r.get('model_id')==m]) for m in sorted({r['model_id'] for r in rows if 'model_id' in r})},
        by_model_run={m:{run:aggregate([r for r in rows if r.get('model_id')==m and r.get('run_id')==run]) for run in sorted({r['run_id'] for r in rows if r.get('model_id')==m})} for m in sorted({r['model_id'] for r in rows if 'model_id' in r})},
        stability_by_model={m:stability([r for r in rows if r.get('model_id')==m and r['id'] in CRITICAL_IDS],required_case_ids=CRITICAL_IDS) for m in sorted({r['model_id'] for r in rows if 'model_id' in r})},
        stability={'status':'see_stability_by_model','critical_case_count':len(CRITICAL_IDS),'required_manual_runs':3} if args.mode=='observations' else {'status':'not_measured','critical_case_count':len(CRITICAL_IDS),'required_manual_runs':3})
    args.output.mkdir(parents=True,exist_ok=True)
    (args.output/'evaluation_summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
    a=summary['aggregate'];lines=['# Data Analyst V2.7 Evaluation',summary['interpretation'],f"Cases: {len(rows)}; real provider calls: 0; live database mutations: 0."]
    for field in ('pass_rate','semantic_pass','plan_valid','first_attempt_valid','result_exact','dashboard_correct','grounded','clarification_correct','refusal_correct'):
        v=a[field];lines.append(f"- {field}: {v['passed']}/{v['total']} · Wilson 95%: {v['wilson_95']}")
    lines.append(f"- Safety violations: {a['safety_violations']}")
    lines.append('Missing token usage stays null; scripted transport latency is not provider latency.')
    lines+=['','## Failures']+[f"- {r['id']}: {', '.join(r['reasons'])}" for r in summary['failures']]
    (args.output/'evaluation_summary.md').write_text('\n'.join(lines)+'\n')
    print(json.dumps({'mode':args.mode,'cases':len(rows),'passed':a['pass_rate']['passed'],'failures':summary['failures'],'output':str(args.output)},ensure_ascii=False))
    return 0 if not summary['failures'] else 1

if __name__=='__main__':raise SystemExit(main())
