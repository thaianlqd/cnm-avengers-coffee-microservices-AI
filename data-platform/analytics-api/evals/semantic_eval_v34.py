"""Frozen deterministic V3.4 corpus. Never reported as provider accuracy.

Expected IDs/finite sets/periods come from the fixture labels, not from the
function being evaluated. Network and warehouse remain forbidden by the caller.
"""
import hashlib
import json
from datetime import date
from pathlib import Path

CASES=Path(__file__).with_name('semantic_cases_v34.json')


def run_cases(catalog):
    from services.preflight_service import run
    from services.request_anchors import request_anchors
    from common import AiTextToReportRequest
    from pydantic import ValidationError
    data=json.loads(CASES.read_text())
    reference=date.fromisoformat(data['reference_date'])
    coverage={'status':'ready','overall':{'min_date':'2025-01-01','max_date':'2026-10-16'},
              'facts':{},'freshness':{'mode':'batch','stale':False}}
    results=[]
    for case in data['cases']:
        expected=case['expected'];failures=[]
        if expected.get('request_rejected'):
            try:
                AiTextToReportRequest.model_validate(case['request'])
                failures.append('conflicting_request_accepted')
            except ValidationError:pass
            result={'id':case['id'],'category':case['category'],'split':case['split'],
                    'ok':not failures,'failures':failures,'provider_calls':0,'warehouse_queries':0}
            results.append(result);continue
        preflight=run(case['q'],analysis_scope=case.get('scope'),analysis_mission=case.get('mission'),
                      reference=reference,catalog=catalog,coverage=coverage)
        actual=preflight['capability']['decision']
        if actual!=expected['decision']:failures.append('decision')
        anchors=request_anchors(case['q'],catalog,{})
        actual_metrics={m for mention in anchors.get('metrics',[]) for m in mention['candidate_ids']}
        if not set(expected.get('metrics',[]))<=actual_metrics:failures.append('metric_anchors')
        if 'members' in expected:
            actual_members={v for binding in anchors.get('scope_resolution',{}).get('bindings',[])
                            if binding['dimension']=='city' for v in binding['members']}
            if actual_members!=set(expected['members']):failures.append('exact_scope_members')
        period=preflight.get('understood',{}).get('time') or {}
        if any(period.get(key)!=value for key,value in expected.get('period',{}).items()):failures.append('period')
        if preflight.get('provider_calls')!=0 or preflight.get('warehouse_queries')!=0:failures.append('unexpected_io')
        results.append({'id':case['id'],'category':case['category'],'split':case['split'],'ok':not failures,
            'expected_decision':expected['decision'],'actual_decision':actual,'failures':failures,
            'actual_metric_anchors':sorted(actual_metrics),'expected_metric_anchors':expected.get('metrics',[]),
            'blocking_codes':[f['code'] for f in preflight['findings'] if f['level']=='block'],
            'provider_calls':preflight.get('provider_calls'),'warehouse_queries':preflight.get('warehouse_queries')})
    return {'version':'3.4.0','mode':'offline_deterministic','case_count':len(results),
        'corpus_sha256':hashlib.sha256(CASES.read_bytes()).hexdigest(),'rows':results,
        'passed':sum(r['ok'] for r in results),'failed':sum(not r['ok'] for r in results),
        'claim':'Deterministic safety/meaning-anchor contracts; no measured LLM understanding or paid-provider accuracy'}


if __name__=='__main__':
    import argparse
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out',required=True)
    args=parser.parse_args()
    from services.analysis_catalog import AnalysisCatalog
    from tests.analysis_fixtures import physical_metadata
    from unittest.mock import patch
    with patch('psycopg2.connect',side_effect=RuntimeError('Offline evaluation forbids warehouse')), \
         patch('requests.sessions.Session.request',side_effect=RuntimeError('Offline evaluation forbids HTTP')):
        result=run_cases(AnalysisCatalog(physical_metadata()))
    Path(args.out).write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({k:v for k,v in result.items() if k!='rows'},ensure_ascii=False))
    for row in result['rows']:
        if not row['ok']:print(json.dumps(row,ensure_ascii=False))
    raise SystemExit(bool(result['failed']))
