"""Finite advertised mission/metric inventory, HTTP preflight and compiler echo.

Run offline inside the isolated container with this file on stdin. No provider
or warehouse transports; this is not model accuracy or a warehouse data audit.
"""
import json
from datetime import date
from unittest.mock import Mock,patch
from types import SimpleNamespace
from fastapi import FastAPI
from tests.test_v32_mission_reliability import Guarded,COVERAGE
from tests.http_fixture import ASGIClient
from tests.agent_fixtures import ScriptedProvider
from services.domain_intelligence_service import DomainIntelligence
from services.value_grounding_service import dimension_values
from services.mission_contract_service import validate_guided,guided_question
from common import AiTextToReportRequest
from routers import ai

t=Guarded();t.setUp();catalog=t.catalog
caps=DomainIntelligence(catalog).capabilities(coverage=COVERAGE)
metrics={m['id']:m for m in caps['metrics']}
manifest=[]
for mission in caps['missions']:
    for metric in mission['metrics']:
        mid=mission['id'];contract={'metric':metric};expected='READY_GUIDED'
        allowed=mission.get('dimensions_by_metric',{}).get(metric)
        dims=[d['id'] for d in metrics[metric]['dimensions'] if not catalog.registry['dimensions'][d['id']].get('identity') and (allowed is None or d['id'] in allowed)]
        dims.sort(key=lambda d:(d!='city',d))
        if mid in {'ranking','composition','compare'}:
            if mid=='compare':dims.sort(key=lambda d:(len(dimension_values(catalog,d))<2,d!='city',d))
            if not dims:raise AssertionError(('Advertised metric lacks grouping',mid,metric))
            contract['dimension']=dims[0]
        if mid=='compare':
            vals=dimension_values(catalog,dims[0])
            if len(vals)<2:
                expected='NEEDS_INPUT'
                if vals:contract['group_a']=vals[0]
            else:contract.update(group_a=vals[0],group_b=vals[1])
        if mid=='ranking':contract.update(n=5,direction='bottom')
        if mid=='trend':contract['granularity']='month'
        if mid=='forecast':
            fc=catalog.registry['metrics'][metric]['forecast'];cadence=fc['cadences'][0]
            contract.update(cadence=cadence,horizon=min(3,fc['max_horizon'][cadence]))
        if mid=='relationship':
            contract=dict(metric='driver_rating',metric_b='total_deliveries',dimension='driver_id')
        if mid=='risk_watch':
            signal=next(s['id'] for s in catalog.registry['risk_signals'] if s['metric']==metric)
            contract={'signals':[signal]}
        if expected=='READY_GUIDED':
            slots=validate_guided(catalog,mid,contract)
            question=guided_question(catalog,slots)
        else:question='So sánh '+metrics[metric]['label']
        manifest.append(dict(id=f'{mid}:{metric}',mission=mid,metric=metric,contract=contract,question=question,expected=expected))
print('ADVERTISED_MANIFEST '+json.dumps(manifest,ensure_ascii=False),flush=True)
app=FastAPI();app.include_router(ai.router);client=ASGIClient(app)
records=[]
with patch('services.preflight_service.preflight_catalog',return_value=catalog), \
     patch.object(ai,'_limiter',return_value=SimpleNamespace(allow=lambda *a:True)), \
     patch('services.data_coverage_service.peek',return_value=COVERAGE):
    for case in manifest:
        metric=catalog.registry['metrics'][case['metric']]
        time={'mode':'all_time'}
        if not metric.get('time_column'):time={'mode':'auto'}
        payload=dict(question=case['question'],input_mode='guided',analysis_mission=case['mission'],
            guided_contract=case['contract'],time=time,reference_date='2026-10-21',analysis_depth='focused')
        record={**case,'passed':False};records.append(record)
        try:
            response=client.post('/api/ai/preflight',json=payload,headers={'origin':'http://testserver'})
            assert response.status_code==200,(response.status_code,response.text)
            pf=response.json();record['preflight_state']=pf['state']
            if case['expected']=='NEEDS_INPUT':
                assert not pf['can_submit'],pf
                record.update(passed=True,outcome='MISSING_COMPARISON_MEMBER',provider_calls=0)
                continue
            assert pf['can_submit'],pf.get('findings')
            provider=ScriptedProvider();pipeline=t.pipeline(provider)
            proposal=pipeline.propose(AiTextToReportRequest.model_validate(payload))
            assert proposal['status']=='proposal_ready',proposal.get('message')
            assert provider.call_count==0
            intent=pipeline.semantic_info['semantic_intent'];requested=[r for r in intent['requirements'] if not r.get('supporting_for')]
            asked={m for r in requested for m in r['metric_ids']}
            expected={'driver_rating','total_deliveries'} if case['mission']=='relationship' else {case['metric']}
            assert asked==expected,(asked,expected)
            if case['mission']=='ranking':
                rank=next(r['ranking'] for r in requested if r.get('ranking'))
                assert (rank['limit'],rank['direction'])==(5,'bottom')
            if case['mission']=='compare':
                assert any(f['dimension']==case['contract']['dimension'] and
                    set(f['value'] if isinstance(f['value'],list) else [f['value']])==
                    {case['contract']['group_a'],case['contract']['group_b']} for r in requested for f in r['filters'])
            record.update(passed=True,queries=len(proposal['proposal']['analytical_queries']),provider_calls=provider.call_count)
        except Exception as error:
            record.update(error_type=type(error).__name__,error=str(error)[:1800])
        print('ADVERTISED_CASE '+json.dumps(record,ensure_ascii=False),flush=True)
print('ADVERTISED_RESULT '+json.dumps(dict(cases=records,passed=all(r['passed'] for r in records)),ensure_ascii=False),flush=True)
t.doCleanups()
raise SystemExit(not all(r['passed'] for r in records))
