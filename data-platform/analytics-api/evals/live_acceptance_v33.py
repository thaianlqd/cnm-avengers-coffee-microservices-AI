"""V3.3 bounded live acceptance. NEVER runs from the test suite: it spends provider quota.

Hard rule: a process-wide meter reserves one unit BEFORE every physical HTTP send (failed attempts, recovery and repair
included). The ceiling is 60 (diagnostic extension 80 with --extension); above 80 the runner refuses to start.
Failures are kept in the artifact; nothing is retried until pretty. Secrets are never read or printed.

  docker compose -f docker-compose.data.yml exec -T analytics-api python -m evals.live_acceptance_v33 --out /tmp/live_v33.json
"""
import argparse
import hashlib
import json
import os
import re
import statistics
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

CASES = Path(__file__).with_name("live_cases_v33.json")
ABSOLUTE_MAX = 80


class MeterExceeded(RuntimeError):
    pass


class HttpMeter:
    """Atomic physical-HTTP reservation in front of requests.post (wraps whatever transport is installed)."""

    def __init__(self, ceiling, real_post, ledger=None):
        self.ceiling, self.real_post, self.count, self.lock = ceiling, real_post, 0, threading.Lock()
        self.by_case = {}
        self.case = None
        self.inject_failure=False
        self.injected=0
        self.actual_http=0
        self.ledger=Path(ledger) if ledger else None
        self.prior=0
        if self.ledger and self.ledger.exists():
            self.count=self.prior=json.loads(self.ledger.read_text())['reserved']

    def __call__(self, *args, **kwargs):
        with self.lock:
            if self.ledger:
                import fcntl
                self.ledger.parent.mkdir(parents=True,exist_ok=True)
                with self.ledger.with_suffix('.lock').open('a') as lock:
                    fcntl.flock(lock,fcntl.LOCK_EX)
                    state=json.loads(self.ledger.read_text()) if self.ledger.exists() else {'reserved':0,'events':[]}
                    if state['reserved']>=self.ceiling:raise MeterExceeded(f"physical HTTP ceiling {self.ceiling} reached")
                    state['reserved']+=1
                    state['events'].append(dict(case=self.case,at=datetime.now(timezone.utc).isoformat(),injected=bool(self.inject_failure)))
                    tmp=self.ledger.with_suffix('.tmp')
                    with tmp.open('w') as out:
                        json.dump(state,out);out.flush();os.fsync(out.fileno())
                    os.replace(tmp,self.ledger)
                    self.count=state['reserved']
            else:
                if self.count >= self.ceiling:
                    raise MeterExceeded(f"physical HTTP ceiling {self.ceiling} reached")
                self.count += 1
            self.by_case[self.case] = self.by_case.get(self.case, 0) + 1
        if self.inject_failure:
            import requests
            self.inject_failure=False;self.injected+=1
            response=requests.Response();response.status_code=503
            response._content=b'{"error":{"status":"UNAVAILABLE","message":"acceptance fault injection"}}'
            response.headers['Content-Type']='application/json'
            return response
        self.actual_http+=1
        return self.real_post(*args, **kwargs)


def classify(case, outcome):
    expect = case["expect"]
    if expect in {"useful", "useful_no_guarantee"}:
        coverage=outcome.get('coverage') or []
        views=outcome.get('views') or []
        metrics=set(outcome.get('metric_ids') or [])
        ok = (outcome.get('status')=='success' and outcome.get('verification')=='verified'
              and outcome.get('completion_status')=='complete' and bool(outcome.get('conclusion'))
              and not outcome.get('error_category') and bool(coverage)
              and all(c.get('state')=='RESOLVED' for c in coverage if not c.get('supporting_for'))
              and all(v.get('status')=='satisfied' for v in views if v.get('required'))
              and set(case.get('metric_ids',[]))<=metrics and all(set(g)&metrics for g in case.get('metric_groups',[])))
        if case.get('scope_members'):
            ok = ok and bool(outcome.get('applied_filters')) and all(
                any(f['dimension']=='city' and set(f['value'] if isinstance(f['value'],list) else [f['value']])==set(case['scope_members']) for f in fs)
                for fs in outcome['applied_filters'])
        if ok and expect == "useful_no_guarantee":
            text=outcome.get('conclusion','').lower()
            # A disclaimer mentioning 95% is required honesty, not a false guarantee.
            ok = not any(not re.search(r'(?:không|chưa)\s*$',text[max(0,m.start()-15):m.start()])
                for m in re.finditer(r'(?:bảo đảm|đảm bảo|chắc chắn).{0,30}95\s*%',text))
        return ok
    if expect == "clarify":
        return outcome.get("status") == "needs_clarification" and bool(outcome.get('actions') or outcome.get('choices'))
    return outcome.get("analysis_state") == "UNSUPPORTED_CAPABILITY"


def run(ceiling, execute, out, ledger=None, selected=None, pace_seconds=5, approved_ceiling=None, job_mode=False):
    import requests
    from common import AiTextToReportRequest
    from services.agent_pipeline import AnalysisPipeline
    from services.agent_provider import NativeAgentProvider
    from services.analysis_pipeline import safe_failure
    class ObservedProvider(NativeAgentProvider):
        """Record semantic shape only; never raw HTTP, headers, prose or row data."""
        def __init__(self):
            super().__init__();self.semantic_outputs=[]
        def __call__(self,**kwargs):
            response=super().__call__(**kwargs)
            for call in response.get('calls') or []:
                args=call.get('arguments') or {}
                if not isinstance(args,dict):continue
                clarification=args.get('clarification')
                requirements=args.get('requirements')
                self.semantic_outputs.append(dict(decision=args.get('decision'),
                    clarification={k:v for k,v in (clarification if isinstance(clarification,dict) else {}).items() if k in {'reason','missing_fields'}},
                    requirements=[{k:v for k,v in r.items() if k in {'id','metric_ids','dimension_ids','analysis_kind','filters',
                        'availability','reason','time','forecast','ranking','derived_features','feature_metrics'}}
                        for r in (requirements if isinstance(requirements,list) else []) if isinstance(r,dict)]))
            return response
    spec = json.loads(CASES.read_text())
    cases = spec["semantic"]
    if ceiling > ABSOLUTE_MAX and approved_ceiling != ceiling:
        raise SystemExit(f"refused: ceiling {ceiling} > {ABSOLUTE_MAX} needs separate approval")
    if os.getenv("AI_OFFLINE", "0").lower() in {"1", "true", "yes"}:
        result = {"status": "NOT_RUN", "reason": "AI_OFFLINE=1"}
        out.write_text(json.dumps(result, indent=2) + "\n")
        return result
    meter = HttpMeter(ceiling, requests.post, ledger)
    rows = []
    started = time.time()
    from uuid import uuid4
    owner='live-v33-'+uuid4().hex[:12] if job_mode else 'live-v33'
    if job_mode and not execute:raise SystemExit('job mode requires --execute')
    with patch("services.agent_provider.requests.post", meter):
        for case in cases:
            meter.case = case["id"]
            meter.inject_failure=bool(case.get("inject_transport_failure"))
            if selected and case['id'] not in selected:
                rows.append({'id':case['id'],'group':case['group'],'expected':case['expect'],'skipped':'diagnostic_subset'});continue
            if meter.count >= ceiling:
                rows.append({"id": case["id"], "skipped": "ceiling"}); continue
            interpreter=ObservedProvider()
            pipeline = AnalysisPipeline(provider=interpreter, owner_id=owner)
            request = AiTextToReportRequest(question=case["q"])
            t0 = time.perf_counter()
            outcome = {}
            proposal_info={}
            job=None
            try:
                if job_mode:
                    from services.analysis_job_service import AnalysisJobs,analysis_jobs,TERMINAL
                    service=AnalysisJobs(analysis_jobs().repository,pipeline_factory=lambda _owner:pipeline,workers=1)
                    try:
                        job=service.submit(request,owner,'live_'+uuid4().hex)
                        while job['state'] not in TERMINAL:
                            if time.perf_counter()-t0>75:raise TimeoutError('Acceptance job did not terminate')
                            time.sleep(.05);job=service.status(job['job_id'],owner)
                    finally:service.pool.shutdown(wait=True)
                    report=job['result'] or {}
                    proposal_info={k:pipeline.semantic_info.get(k) for k in ('semantic_intent','contract_issues','semantic_normalizations','semantic_issue_history','planning_latency_ms')}
                    proposal=report
                else:
                    proposal = pipeline.propose(request)
                    report=None
                if not job_mode:
                    proposal_info={k:proposal.get('diagnostics',{}).get(k) for k in ('semantic_intent','contract_issues','semantic_normalizations','semantic_issue_history','planning_latency_ms')}
                outcome = {"status": proposal["status"], "outcome": proposal.get("outcome"),
                           'choices':proposal.get('options'),'actions':proposal.get('actions')}
                if execute and not job_mode and proposal["status"] == "proposal_ready":
                    p = proposal["proposal"]
                    approved = request.model_copy(update=dict(session_id=p["session_id"], proposal_revision=p["revision"],
                        intent_fingerprint=p["semantic_intent_fingerprint"], plan_fingerprint=p["resolved_plan_fingerprint"],
                        catalog_fingerprint=p["catalog_fingerprint"]))
                    report = AnalysisPipeline(provider=NativeAgentProvider(), owner_id=owner).generate(approved)
                if job_mode:
                    outcome.update(analysis_state=report.get('analysis_state'),error_category=(report.get('diagnostics') or {}).get('error_category'))
                if report and report.get('status')=='success':
                    outcome.update(status=report["status"], conclusion=report.get("conclusion", {}).get("answer"),
                        verification=report.get("verification", {}).get("status"),completion_status=report.get('completion_status'),
                        coverage=report.get('resolved_requirement_coverage'),views=report.get('view_coverage'),
                        metric_ids=sorted({m for r in report.get('semantic_intent',{}).get('requirements',[]) for m in r.get('metric_ids',[])}),
                        applied_filters=[r.get('filters',[]) for r in report.get('semantic_intent',{}).get('requirements',[]) if r.get('availability')=='requested'])
                    outcome['verification_score_status']=report.get('quality_assessment',{}).get('status')
                    outcome['answer_requirements']=report.get('answer_requirements')
                    outcome['scope_resolution']=report.get('scope_resolution')
                    outcome['query_semantics']=[{k:q.get(k) for k in ('id','metrics','group_by','time','filters','role')} for q in report.get('analytical_queries',[])]
            except Exception as error:  # typed failure: recorded, never hidden
                failure = safe_failure(error, pipeline.calls, pipeline.semantic_info)
                outcome = {"status": failure["status"], "analysis_state": failure["analysis_state"],
                           "error_category": failure["diagnostics"]["error_category"],
                           'actions':failure.get('actions'),'choices':failure.get('options')}
            info = pipeline.semantic_info
            outcome['proposal_semantics']=proposal_info
            outcome['contract_issues']=info.get('contract_issues')
            outcome['root_contract_issues']=info.get('root_contract_issues')
            outcome['interpreter_outputs']=interpreter.semantic_outputs
            rows.append({"id": case["id"], "group": case["group"], "expected": case["expect"], "passed": classify(case, outcome),
                         "logical_calls": info.get("provider_call_count", 0), "physical_http": meter.by_case.get(case["id"], 0),
                         "repair": info.get("semantic_repair_count", 0), "recovery": info.get("transport_recovery_count", 0), "secondary_used":info.get("credential_failover_used",False),
                         "latency_ms": round((time.perf_counter() - t0) * 1000), "outcome": outcome})
            rows[-1]['planning_ms']=info.get('planning_latency_ms',info.get('total_ms'))
            if job:
                rows[-1].update(job_id=job['job_id'],terminal_state=job['state'],job_physical_http=job['physical_http'],
                    job_latency_ms=(job.get('result',{}).get('diagnostics') or {}).get('job_total_ms'),stage_timings_ms=job.get('stage_timings_ms'))
            # Interrupted runs retain every attempted result and durable reservations.
            out.with_suffix('.cases.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2,default=str)+'\n')
            # Pace the suite outside the measured submission/deadline. No retry
            # is added and provider timeout windows are not spent sleeping.
            delay=max(0,meter.by_case.get(case['id'],0)*pace_seconds-(time.perf_counter()-t0))
            if delay:time.sleep(min(delay,15))
    done = [r for r in rows if "passed" in r]
    useful = [r for r in rows if r.get('expected','').startswith('useful')]
    denominator=sum(c['expect'].startswith('useful') for c in cases)
    http = [r["physical_http"] for r in useful if 'physical_http' in r]
    def p95(values):
        values=sorted(v for v in values if isinstance(v,(int,float)))
        return values[max(0,int(len(values)*.95)-1)] if values else None
    result = {"status": "DIAGNOSTIC" if selected else "RUN", "generated_at": datetime.now(timezone.utc).isoformat(), "ceiling": ceiling, "physical_http_total": meter.count,
              "actual_external_http":meter.actual_http,"injected_failures":meter.injected,
              "prior_reserved_http":meter.prior,"current_run_reserved_http":meter.count-meter.prior,
              "cases_total": len(cases), "cases_run": len(done), "skipped": [r["id"] for r in rows if "skipped" in r],
              "useful_first_click": {"passed": sum(r.get("passed",False) for r in useful), "total": denominator,
                                     "rate": round(sum(r.get("passed",False) for r in useful) / denominator, 4) if denominator else None},
              "overall": {"passed": sum(r["passed"] for r in done), "total": len(cases)},
              "semantic_http_median": statistics.median(http) if http else None, "max_http_any_case": max(http) if http else None,
              "latency_p95_ms": sorted(r["latency_ms"] for r in done)[max(0, int(len(done) * .95) - 1)] if done else None,
              "wall_seconds": round(time.time() - started, 1), "cases": rows,
              'entry_point':'analysis_jobs' if job_mode else 'propose_generate',
              'planning_p95_ms':p95(r.get('planning_ms') for r in done),'job_p95_ms':p95(r.get('job_latency_ms') for r in done),
              'durable_counters_match':all(r.get('job_physical_http')==r['physical_http'] for r in done) if job_mode else None,
              "case_file_sha256": hashlib.sha256(CASES.read_bytes()).hexdigest()}
    result['release_passed']=(execute and not selected and denominator>=20 and result['useful_first_click']['rate']>=.95
        and not result['skipped'] and result['max_http_any_case']<=3 and result['semantic_http_median']<=1
        and all(r.get('passed') for r in rows if not r.get('expected','').startswith('useful'))
        and (not job_mode or result['durable_counters_match'] and result['job_p95_ms'] is not None and result['job_p95_ms']<=70000
            and result['planning_p95_ms'] is not None and result['planning_p95_ms']<=40000)
        and all(r.get('passed') and r.get('secondary_used') for r in rows if r.get('group')=='recovery'))
    out.write_text(json.dumps(result, ensure_ascii=False, indent=2, default=str) + "\n")
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--extension", action="store_true", help="diagnostic extension: ceiling 80 instead of 60")
    parser.add_argument('--approved-ceiling',type=int,help='ONLY after separate user approval above 80: total shared-ledger ceiling, never additional calls')
    parser.add_argument("--execute", action="store_true", help="also approve and generate the report (read-only SQL)")
    parser.add_argument("--out", default="/tmp/live_v33.json")
    parser.add_argument("--ledger",default="/tmp/v33-live-http-ledger.json",help="durable shared quota across diagnostic runs; never reset to retry")
    parser.add_argument('--cases',help='diagnostic IDs only; retains frozen denominator and never qualifies as release')
    parser.add_argument('--jobs',action='store_true',help='exercise the real one-click job service and durable per-job counters')
    args = parser.parse_args()
    ceiling=args.approved_ceiling if args.approved_ceiling is not None else 80 if args.extension else 60
    summary = run(ceiling, args.execute, Path(args.out),Path(args.ledger),set(args.cases.split(',')) if args.cases else None,
        approved_ceiling=args.approved_ceiling,job_mode=args.jobs)
    print(json.dumps({k: v for k, v in summary.items() if k != "cases"}, ensure_ascii=False, indent=1, default=str))
    raise SystemExit(0 if summary.get('release_passed') else 1)
