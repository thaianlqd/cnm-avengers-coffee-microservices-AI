"""Fixed 15-minute HTTP/metrics fixture workload, zero external provider/DB access."""
import json, os, re, time, urllib.request
from uuid import uuid4
if os.getenv('V35_TWO_API_FIXTURE')!='1':raise RuntimeError('Explicit isolated fixture required')
DURATION=900
TARGETS=('http://127.0.0.1:18881','http://127.0.0.1:18882')
latencies=[];outcomes={'completed':0,'failed':0};request_counts={target:0 for target in TARGETS}

def http(target,path,body=None,key=None,eligible=True):
    start=time.monotonic()
    headers={'Cookie':'analysis_browser='+'c'*43,'Content-Type':'application/json'}
    if key:headers['Idempotency-Key']=key
    req=urllib.request.Request(target+path,data=None if body is None else json.dumps(body).encode(),headers=headers)
    try:
        with urllib.request.urlopen(req,timeout=10) as response:
            raw=response.read(1_200_001)
            if len(raw)>1_200_000:raise ValueError('Bounded response exceeded')
            value=json.loads(raw) if response.headers.get_content_type()=='application/json' else raw.decode()
        if eligible:outcomes['completed']+=1
        return value
    except Exception:
        if eligible:outcomes['failed']+=1
        raise
    finally:
        if eligible:
            request_counts[target]+=1
            latencies.append((time.monotonic()-start)*1000)

def counter(text):
    return sum(int(match.group(1)) for match in re.finditer(r'^analytics_events_total\{stage="request",status="completed"\} (\d+)$',text,re.M))

def scrape():return {target:counter(http(target,'/metrics',eligible=False)) for target in TARGETS}
# Warmup is explicit and outside the measurement window.
for target in TARGETS:
    for attempt in range(30):
        try:http(target,'/fixture/identity',eligible=False);break
        except Exception:
            if attempt==29:raise
            time.sleep(.2)
identities=[http(target,'/fixture/identity',eligible=False) for target in TARGETS]
baseline=scrape();start=time.monotonic();tick=0;jobs=0;traces=0;maxima={target:0 for target in TARGETS}
print(json.dumps({'event':'soak_started','duration_seconds':DURATION,'interval_seconds':5}),flush=True)
errors=[]
while time.monotonic()-start<DURATION:
    for target in TARGETS:
        try:http(target,'/api/auth/session')
        except Exception as error:errors.append(type(error).__name__)
    if tick%3==0:
        target=TARGETS[(tick//3)%2]
        try:
            record=http(target,'/api/ai/analysis-jobs',{'dashboard_id':'D01','dashboard_version':'1.0.0',
                'time':{'mode':'all_time'},'analysis_depth':'focused'},uuid4().hex)
            until=time.monotonic()+20
            while record['state'] not in {'completed','failed','cancelled','partial_available','insufficient_data','needs_input','unsupported'}:
                if time.monotonic()>until:raise TimeoutError('Soak job timeout')
                time.sleep(.05)
                record=http(TARGETS[1] if target==TARGETS[0] else TARGETS[0],'/api/ai/analysis-jobs/'+record['job_id'])
            jobs+=1
            if record['state']!='completed' or record['provider_call_count'] or record['physical_http']:
                raise AssertionError('Controlled job did not complete without provider')
            if record['result'].get('diagnostics',{}).get('request_id'):traces+=1
        except Exception as error:errors.append(type(error).__name__)
    observed=scrape()
    if any(observed[target]<baseline[target] for target in TARGETS):errors.append('unexpected_counter_reset')
    if tick%12==0:print(json.dumps({'event':'soak_tick','elapsed_seconds':round(time.monotonic()-start),'jobs':jobs,'failures':outcomes['failed']}),flush=True)
    tick+=1
    time.sleep(max(0,min(start+tick*5-start,DURATION)-(time.monotonic()-start)))
time.sleep(.1)
final=scrape();deltas={target:final[target]-baseline[target] for target in TARGETS}
ordered=sorted(latencies)
percentile=lambda fraction:ordered[min(len(ordered)-1,int((len(ordered)-1)*fraction))] if ordered else None
passed=not errors and outcomes['failed']==0 and deltas==request_counts and traces==jobs
print(json.dumps({'event':'soak_complete','status':'passed' if passed else 'failed','duration_seconds':round(time.monotonic()-start,3),
    'sample_interval_seconds':5,'instances':identities,'eligible_operations':sum(outcomes.values()),'outcomes':outcomes,
    'request_counter_deltas':deltas,'expected_request_counts':request_counts,'p95_ms':percentile(.95),'p99_ms':percentile(.99),
    'controlled_jobs':jobs,'jobs_with_request_context':traces,'external_http':0,'physical_provider_sends':0,
    'shared_gauge_aggregation':'max; never summed','errors':errors[:20],
    'limitations':['Local isolated fixture measurement; not a production SLO','Source freshness and worker restarts captured separately','No deployed multi-API traffic claim']}),flush=True)
raise SystemExit(0 if passed else 1)
