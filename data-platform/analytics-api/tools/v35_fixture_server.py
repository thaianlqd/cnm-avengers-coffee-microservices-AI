"""Two-process fixture: real jobs/Redis/session/artifacts, no external warehouse/provider.

Never imported by the production server. Use only network-none fixture namespace.
"""
import os
if os.getenv('V35_FIXTURE_SERVER') != '1' or os.getenv('DATA_ANALYST_REDIS_URL') != 'redis://127.0.0.1:16379/15':
    raise RuntimeError('Explicit isolated V35 fixture required')
os.environ['V33_FIXTURE_SERVER']='1'
from tools import v33_fixture_server as fixture
import threading
import time
from fastapi import Body
from fastapi.responses import Response
from services import analysis_job_service,telemetry
from services.analysis_job_service import AnalysisJobs,JobRepository
from services.provider_budget import check_request_deadline
from services.session_service import storage

held=threading.Event()
original_pipeline=fixture.pipeline

def pipeline(owner_id=None):
    result=original_pipeline(owner_id)
    propose=result.propose
    def controlled(request):
        while held.is_set():
            check_request_deadline()
            time.sleep(.02)
        return propose(request)
    result.propose=controlled
    return result

jobs=AnalysisJobs(JobRepository(storage().client),pipeline_factory=pipeline,workers=2)
analysis_job_service._jobs=jobs
app=fixture.app
app.add_middleware(telemetry.TelemetryMiddleware)

@app.get('/metrics')
def metrics():
    return Response(telemetry.prometheus_export(),media_type='text/plain; version=0.0.4')

@app.post('/fixture/hold')
def hold(value:dict=Body(...)):
    held.set() if value.get('enabled') else held.clear()
    return {'held':held.is_set()}

@app.get('/fixture/identity')
def identity():
    import resource
    return {'instance':os.getenv('V35_INSTANCE'),'pid':os.getpid(),'redis_db':15,
            'session_backend':'redis','artifact_backend':'redis','physical_http':0,
            'peak_rss_kib':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss}

@app.on_event('shutdown')
def shutdown():
    jobs.shutdown(grace_seconds=1)

@app.post('/fixture/session-cas')
def session_cas(value:dict=Body(...)):
    from services.analysis_catalog import AnalysisError
    session=storage().get(value['session_id'])
    if session is None:raise RuntimeError('Fixture session missing')
    session._storage_version=value['expected_version']
    try:
        storage().save(session)
        return {'status':'saved','version':session._storage_version}
    except AnalysisError as error:
        return {'status':error.category}

@app.get('/fixture/session-version/{identity}')
def session_version(identity:str):
    session=storage().get(identity)
    return {'version':getattr(session,'_storage_version',None)}

@app.post('/fixture/reserve-before-crash')
def reserve_before_crash(value:dict=Body(...)):
    from services.analysis_job_service import apply_ledger_event
    def reserve(record):
        if record['state'] not in {'planning','accepted'}:raise RuntimeError('Fixture job not held')
        apply_ledger_event(record,'provider_physical_reserved')
        record['deadline_at']=time.time()+5
    record=jobs.repository.mutate(value['job_id'],reserve)
    return {'physical_http':record['physical_http'],'fault':'injected reservation before transport; no provider request'}

@app.post('/fixture/crash')
def crash():
    os._exit(99)


@app.get('/fixture/admission')
def admission():
    from services.analysis_job_service import TERMINAL
    from collections import Counter
    active=[jobs.repository.read(identity) for identity in (jobs.repository.read('active') or [])]
    active=[j for j in active if j and j['state'] not in TERMINAL and j['deadline_at']>time.time()]
    return {'active':len(active),'per_owner':sorted(Counter(j['owner'] for j in active).values()),
            'local_futures':len(jobs.futures),'local_slots_available':jobs.slots._value,
            'logical_calls':sum(j['provider_call_count'] for j in active),
            'physical_http':sum(j['physical_http'] for j in active)}

# Extra fault barriers live only in this explicitly isolated fixture server.
# PostgreSQL is permitted only at the fixed disposable namespace address.
import psycopg2
from psycopg2.pool import ThreadedConnectionPool
from services import query_execution_batch as sql_batch, access_policy as access
from services.provider_budget import request_observer, ProviderBudget
from services.agent_provider import NativeAgentProvider
from unittest.mock import patch
from contextvars import ContextVar
import json
import urllib.request

scenario_context = ContextVar('v35_fixture_scenario', default=None)
redis_client = storage().client
original_pg_connect = psycopg2._connect

def fixed_pg_connect(*args, **kwargs):
    # _connect is psycopg2's native primitive; no DSN supplied by an HTTP client.
    dsn = 'host=127.0.0.1 port=5432 user=postgres password=fixture-only dbname=postgres connect_timeout=2 application_name=v35_fixture_reader'
    return original_pg_connect(dsn)

class FixedReaderPool(ThreadedConnectionPool):
    def _connect(self, key=None):
        connection = fixed_pg_connect()
        if key is not None:
            self._used[key] = connection
            self._rused[id(connection)] = key
        else:
            self._pool.append(connection)
        return connection

sql_batch._pool = FixedReaderPool(1, sql_batch.SQL_CONNECTIONS)
sql_batch._pool_reader = 'postgres'
fixture.stack.enter_context(patch('db.connection_credentials', return_value=('postgres','fixture-only')))

base_policy = access.load_policy

def fixture_policy(path=None):
    policy = json.loads(json.dumps(base_policy(path)))
    policy['roles']['V35_FIXTURE'] = {'permissions':['analytics.read','reports.read','reports.write','reports.export'], 'datasets':['*'], 'national':True}
    if redis_client.get('v35:revoked'):
        policy.setdefault('subjects', {})['v35-actor'] = {'disabled':True}
    return policy

fixture.stack.enter_context(patch.object(access, 'load_policy', side_effect=fixture_policy))

@app.middleware('http')
async def fixture_account(request, call_next):
    actor = request.headers.get('X-V35-Account')
    if actor is None:
        return await call_next(request)
    if actor not in {'v35-actor','v35-other'}:
        return Response(status_code=403)
    try:
        principal = access.principal_for({'subject':actor, 'role':'V35_FIXTURE', 'expires_at':time.time()+600}, fixture_policy())
    except Exception:
        return Response(status_code=403)
    token = access.active_principal.set(principal)
    try:
        return await call_next(request)
    finally:
        access.active_principal.reset(token)


def fault_barrier(stage, scenario):
    if not scenario or scenario.get('stage') != stage:
        return
    redis_client.set('v35:hit:'+scenario['run_id'], stage, ex=120)
    while redis_client.get('v35:release:'+scenario['run_id']) != '1':
        check_request_deadline()
        time.sleep(.02)

class MeteredInterpreter(NativeAgentProvider):
    def __init__(self, scenario):
        super().__init__(legacy_policy=False)
        self.scenario = scenario
    def __call__(self, call_budget=None, **kwargs):
        call_budget.consume()
        fault_barrier('before_send', self.scenario)
        for _ in range(4 if self.scenario['stage'] == 'ceiling' else 1):
            call_budget.record_physical({'fixture_run':self.scenario['run_id']})
            fault_barrier('reserved', self.scenario)
            payload = json.dumps({'run_id':self.scenario['run_id']}).encode()
            request = urllib.request.Request('http://127.0.0.1:18882/fixture/provider', data=payload, headers={'Content-Type':'application/json'})
            with urllib.request.urlopen(request, timeout=2) as response:
                if response.status != 200: raise RuntimeError('Fake provider refused')
        fault_barrier('sent', self.scenario)
        return fixture.FixtureInterpreter()(**kwargs)

previous_pipeline = pipeline

def fault_pipeline(owner_id=None):
    result = previous_pipeline(owner_id)
    raw = redis_client.get('v35:scenario')
    scenario = json.loads(raw) if raw else None
    if not scenario:
        return result
    result.provider = MeteredInterpreter(scenario)
    catalog = result.catalog
    generate = result.generate
    def measured_catalog():
        fault_barrier('claimed', scenario)
        return catalog()
    def measured_generate(request):
        fault_barrier('before_sql', scenario)
        if scenario['stage'] == 'sql':
            with sql_batch.connection() as connection:
                connection.set_session(readonly=True)
                with connection.cursor() as cursor:
                    cursor.execute('SET LOCAL statement_timeout=30000')
                    cursor.execute("SELECT set_config('application_name', %s, true)", ('v35_fixture_reader_'+scenario['run_id'],))
                    redis_client.set('v35:hit:'+scenario['run_id'], 'sql', ex=120)
                    cursor.execute('SELECT pg_sleep(25)')
        value = generate(request)
        fault_barrier('persist', scenario)
        return value
    result.catalog = measured_catalog
    result.generate = measured_generate
    return result

jobs.pipeline_factory = fault_pipeline

@app.post('/fixture/provider')
def fake_provider(value:dict=Body(...)):
    count = redis_client.incr('v35:meter:'+value['run_id'])
    redis_client.expire('v35:meter:'+value['run_id'], 600)
    return {'accepted':True,'count':count}

@app.post('/fixture/scenario')
def configure_scenario(value:dict=Body(...)):
    if value.get('stage') not in {'claimed','reserved','sent','sql','persist','ceiling','before_send','before_sql',None}:
        return Response(status_code=400)
    if value.get('stage'):
        redis_client.set('v35:scenario', json.dumps(value), ex=120)
    else:
        redis_client.delete('v35:scenario')
    redis_client.delete('v35:revoked')
    return {'configured':True}

@app.post('/fixture/revoke')
def revoke():
    redis_client.set('v35:revoked', '1', ex=120)
    return {'revoked':True}

@app.post('/fixture/deadline')
def shorten_deadline(value:dict=Body(...)):
    record = jobs.repository.mutate(value['job_id'], lambda job:job.update(deadline_at=time.time()+3))
    return {'state':record['state']}

@app.post('/fixture/release')
def release_barrier(value:dict=Body(...)):
    redis_client.set('v35:release:'+value['run_id'], '1', ex=120)
    return {'released':True}

@app.get('/fixture/observation/{run_id}')
def observe_scenario(run_id:str):
    connection = fixed_pg_connect()
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT count(*) FROM pg_stat_activity WHERE application_name=%s AND wait_event='PgSleep'", ('v35_fixture_reader_'+run_id,))
            sleeping = cursor.fetchone()[0]
    finally:
        connection.close()
    return {'hit':redis_client.get('v35:hit:'+run_id), 'sends':int(redis_client.get('v35:meter:'+run_id) or 0),
        'sql_sleeping':sleeping, 'pool_used':len(sql_batch._pool._used), 'pool_max':sql_batch.SQL_CONNECTIONS}

@app.post('/fixture/circuit')
def circuit_action(value:dict=Body(...)):
    from services import provider_credential_router as circuit
    from services.error_taxonomy import AnalysisError
    if value['action'] == 'open':
        circuit._shared_transition('failure', {'error_category':'provider_rate_limited'})
        # Move only this fixture's cooldown to its half-open boundary.
        with redis_client.lock(circuit._CIRCUIT_KEY+':lock', timeout=5):
            state = json.loads(redis_client.get(circuit._CIRCUIT_KEY))
            seconds, micros = redis_client.time()
            state['until'] = seconds + micros/1_000_000 - 1
            redis_client.set(circuit._CIRCUIT_KEY, json.dumps(state), ex=1200)
        return {'opened':True}
    try:
        state = circuit._shared_transition('plan')
        slot = 'secondary' if state['cooling'] or state['occupied'] else 'primary'
        if value.get('complete') and slot == 'primary': circuit._shared_transition('success')
        return {'slot':slot}
    except AnalysisError as error:
        return {'error':error.category}

@app.post('/fixture/drain')
def drain():
    jobs.shutdown(grace_seconds=1)
    return {'draining':True}

@app.post('/fixture/stale-finish')
def stale_finish(value:dict=Body(...)):
    before = jobs.repository.read(value['job_id'])
    jobs.finish(value['job_id'], 'expired-fixture-token', 'completed', {'status':'success'}, {})
    return {'unchanged':before == jobs.repository.read(value['job_id'])}

@app.get('/fixture/job/{identity}')
def fixture_job_state(identity:str):
    value = jobs.repository.read(identity)
    return {'state':value['state'] if value else None}

@app.post('/fixture/pool-pressure')
def reader_pool_pressure():
    from contextlib import ExitStack
    from services.error_taxonomy import AnalysisError
    exhausted = False
    with ExitStack() as held_connections:
        for index in range(sql_batch.SQL_CONNECTIONS):
            connection = held_connections.enter_context(sql_batch.connection())
            connection.set_session(readonly=True)
            with connection.cursor() as cursor:
                cursor.execute('SHOW transaction_read_only')
                if cursor.fetchone()[0] != 'on': raise RuntimeError('Fixture reader must be read only')
        try:
            with sql_batch.connection(): raise RuntimeError('Reader pool exceeded its cap')
        except AnalysisError as error:
            if error.category != 'execution': raise
            exhausted = True
    return {'connections':sql_batch.SQL_CONNECTIONS, 'exhausted_typed':exhausted, 'pool_used_after':len(sql_batch._pool._used)}
