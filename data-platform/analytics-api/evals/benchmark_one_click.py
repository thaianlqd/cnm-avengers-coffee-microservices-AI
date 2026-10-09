"""Scripted provider + real Redis/PostgreSQL, bounded 1/5/10 job load.

No model calls. Reports sample size and percentile; never model success rates.
"""
from datetime import date
import json
import logging
import math
from pathlib import Path
import statistics
import time
from uuid import uuid4

from common import AiTextToReportRequest
from evals.one_click_cases import CASES, intent
from services.agent_pipeline import AnalysisPipeline
from services.analysis_job_service import AnalysisJobs, JobRepository, TERMINAL
from services.session_service import storage
from tests.agent_fixtures import ScriptedProvider, call


def main():
    logging.getLogger('ai-analytics').setLevel(logging.WARNING)
    results=[]
    for size in (1,5,10):
        definitions={}
        def factory(owner):
            provider=ScriptedProvider([call('submit_analysis_intent',intent(definitions[owner]))])
            return AnalysisPipeline(provider=provider,owner_id=owner)
        jobs=AnalysisJobs(JobRepository(storage().client),factory)
        pending={}
        for i in range(size):
            owner='load-'+uuid4().hex;case=CASES[i%len(CASES)];definitions[owner]=case
            request=AiTextToReportRequest(question=case['question'],reference_date=date(2026,10,9),refresh=True)
            started=time.perf_counter();job=jobs.submit(request,owner,uuid4().hex)
            pending[job['job_id']]=(owner,started,case)
        samples=[]
        while pending:
            for id,(owner,started,case) in list(pending.items()):
                job=jobs.status(id,owner)
                if job['state'] in TERMINAL:
                    report=job.get('result') or {};diagnostics=report.get('diagnostics',{})
                    samples.append(dict(case=case['id'],state=job['state'],
                        latency_ms=round((time.perf_counter()-started)*1000,2),
                        timings=job.get('stage_timings_ms'),queries=diagnostics.get('db_query_count'),
                        charts=len(report.get('charts',[])),error=diagnostics.get('error_category')))
                    del pending[id]
            if pending:time.sleep(.05)
        jobs.pool.shutdown(wait=True)
        latencies=sorted(s['latency_ms'] for s in samples)
        results.append(dict(concurrent_jobs=size,sample_size=size,p50_ms=statistics.median(latencies),
            p95_ms=latencies[math.ceil(.95*len(latencies))-1],
            samples=samples))
        print(json.dumps(results[-1],ensure_ascii=False),flush=True)
    Path('/tmp/one-click-load.json').write_text(json.dumps(dict(provider='scripted',warehouse='real',
        actual_provider_sends=0,workers=4,query_concurrency_per_job=2,connection_pool_max=12,
        groups=results),ensure_ascii=False))


if __name__=='__main__':main()
