"""Same authored product workload on frozen/candidate images; no provider I/O.

Mount this file and one_click_cases.py at /qualification in BOTH images.
Run sequentially while otherwise idle. This measures the deterministic pipeline,
not live-model latency or general p95; each measured run forces fresh SQL.
"""
import argparse
from copy import deepcopy
from datetime import date
import hashlib
import importlib.util
import json
import logging
import math
from pathlib import Path
import statistics
import time
from unittest.mock import patch
from uuid import uuid4

from common import AiTextToReportRequest
from services.agent_pipeline import AnalysisPipeline
from tests.agent_fixtures import ScriptedProvider,call


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--phase',required=True)
    parser.add_argument('--output',required=True);args=parser.parse_args()
    module=importlib.util.spec_from_file_location('qualification_cases','/qualification/one_click_cases.py')
    definitions=importlib.util.module_from_spec(module);module.loader.exec_module(definitions)
    case=next(c for c in definitions.CASES if c['id']=='products')
    logging.getLogger('ai-analytics').setLevel(logging.WARNING)
    samples=[]
    with patch('requests.post',side_effect=AssertionError('External provider forbidden in paired benchmark')):
        for n in range(6):
            draft=definitions.intent(case)
            for requirement in draft['requirements']:
                requirement['time']=dict(kind='rolling',amount=30,unit='day')
            provider=ScriptedProvider([call('submit_analysis_intent',draft)])
            pipeline=AnalysisPipeline(provider=provider,owner_id='paired-'+uuid4().hex)
            request=AiTextToReportRequest(question=case['question'],reference_date=date(2026,10,9),refresh=True)
            started=time.perf_counter();proposal=pipeline.propose(request);p=proposal['proposal']
            request.session_id=proposal['session_id'];request.proposal_revision=p['revision']
            request.intent_fingerprint=p['semantic_intent_fingerprint']
            request.plan_fingerprint=p['resolved_plan_fingerprint'];request.catalog_fingerprint=p['catalog_fingerprint']
            report=pipeline.generate(request);elapsed=(time.perf_counter()-started)*1000
            assert report['outcome']=='SUCCESS' and len(report['charts'])>=4
            # Compare FULL observations, not generated labels or truncated UI.
            observations=sorted((q['operation'],tuple(sorted(q['metrics'])),tuple(sorted(q.get('group_by',[]))),
                json.dumps(report['result_sets'][q['id']]['rows'],sort_keys=True,ensure_ascii=False,default=str))
                for q in report['analytical_queries'])
            identity=hashlib.sha256(json.dumps(observations,ensure_ascii=False).encode()).hexdigest()
            if n:samples.append(dict(latency_ms=round(elapsed,2),charts=len(report['charts']),
                queries=report['diagnostics']['db_query_count'],scripted_interpretations=len(provider.requests),
                observations_sha256=identity))
    latencies=sorted(s['latency_ms'] for s in samples)
    result=dict(phase=args.phase,case='products',method='scripted_provider_real_warehouse_cold_pipeline',
        excluded_initialization_runs=1,sample_size=len(samples),actual_external_sends=0,
        p50_ms=statistics.median(latencies),p95_ms=latencies[math.ceil(.95*len(latencies))-1],samples=samples)
    Path(args.output).write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(result,ensure_ascii=False))


if __name__=='__main__':main()
