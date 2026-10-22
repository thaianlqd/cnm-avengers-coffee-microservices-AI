"""Offline real ASGI preflight workload:990 warm calls, no warehouse/provider I/O.

Synthetic signed fixture principals rotate30calls each to respect the real
40/10s limiter. This measures serial reference latency, not sustained/multi-
instance capacity or a seven-day SLO. No production credentials are loaded.
"""
import argparse
from contextlib import ExitStack
import json
import logging
import math
import os
import platform
import resource
import statistics
import sys
import time
from pathlib import Path
from unittest.mock import patch


def main():
    if os.getenv('AI_OFFLINE')!='1':raise SystemExit('AI_OFFLINE=1 is required')
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out',type=Path,required=True)
    args=parser.parse_args()
    from tests.http_fixture import ASGIClient
    from tests.test_v34_access_policy import SECRET,token
    from services import access_policy as access
    import server
    for logger in logging.Logger.manager.loggerDict.values():
        if isinstance(logger,logging.Logger):logger.setLevel(logging.ERROR)
    policy={'version':'offline-preflight-workload-v1','roles':{'ANALYST':{
        'permissions':['analytics.read'],'datasets':['*'],'national':True}},'subjects':{}}
    payloads=[{'question':q} for q in ('Doanh thu tháng 9 năm 2026',
        'Top 10 chi nhánh theo doanh thu tháng 9 năm 2026',
        'Dự báo doanh thu 3 tháng tới')]
    durations=[];statuses={};decisions={}
    with ExitStack() as stack:
        stack.enter_context(patch.dict(os.environ,{'DATA_ANALYST_ENV':'development',
            'DATA_ANALYST_ALLOW_BROWSER_OWNER':'0','DATA_ANALYST_AUTH_ALLOW_LEGACY_JWT':'1',
            'DATA_ANALYST_IDENTITY_JWT_SECRET':SECRET}))
        stack.enter_context(patch.object(access,'load_policy',return_value=policy))
        database=stack.enter_context(patch('psycopg2.connect',side_effect=AssertionError('Warehouse I/O forbidden')))
        provider=stack.enter_context(patch('requests.sessions.Session.request',side_effect=AssertionError('External HTTP forbidden')))
        client=ASGIClient(server.app)
        headers=[{'Authorization':'Bearer '+token({'sub':f'fixture-workload-{i}','role':'ANALYST','exp':4000000000})} for i in range(33)]
        before=time.perf_counter()
        cold=client.post('/api/ai/preflight',headers=headers[0],json=payloads[0])
        cold_ms=(time.perf_counter()-before)*1000
        for index in range(990):
            before=time.perf_counter()
            reply=client.post('/api/ai/preflight',headers=headers[index//30],json=payloads[index%3])
            durations.append((time.perf_counter()-before)*1000)
            statuses[str(reply.status_code)]=statuses.get(str(reply.status_code),0)+1
            decision=reply.json().get('state','unspecified')
            decisions[decision]=decisions.get(decision,0)+1
        ordered=sorted(durations)
        percentile=lambda p:ordered[max(0,math.ceil(len(ordered)*p)-1)]
        result={'mode':'offline_actual_ASGI','samples':990,'principals':33,'warm_calls_per_principal':30,
            'cold':{'status':cold.status_code,'ms':round(cold_ms,3)},'warm_ms':{
                'p50':round(statistics.median(durations),3),'p95':round(percentile(.95),3),
                'p99':round(percentile(.99),3),'max':round(max(durations),3)},
            'http_status_counts':statuses,'decision_state_counts':decisions,
            'warehouse_connect_calls':database.call_count,'external_HTTP_calls':provider.call_count,
            'host':{'system':platform.system(),'machine':platform.machine(),'python':sys.version.split()[0],
                'peak_rss_KiB':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss},
            'limitations':['Synthetic signed principals/in-process ASGI, not network transport',
                'Serial requests; not throughput/multi-instance proof','No sustained operational SLO measured'],
            'passed':cold.status_code==200 and statuses=={'200':990} and percentile(.95)<50 and database.call_count==0 and provider.call_count==0}
    args.out.parent.mkdir(parents=True,exist_ok=True)
    args.out.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(result,ensure_ascii=False))
    return 0 if result['passed'] else 1


if __name__=='__main__':raise SystemExit(main())
