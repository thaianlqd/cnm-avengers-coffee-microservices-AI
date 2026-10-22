"""Owned, bounded one-click jobs. Redis is authoritative in production.

No worker retries after an uncertain crash. Provider reservations are durable
before transport, so a reconnect/restart cannot reset a paid-call allowance.
"""
from concurrent.futures import ThreadPoolExecutor
from contextvars import copy_context
from contextlib import contextmanager
from copy import deepcopy
from datetime import date
import hashlib
import json
import os
import re
import threading
import time
from uuid import uuid4

from services.analysis_catalog import AnalysisError
from services.provider_budget import request_deadline, request_cancelled, request_observer

TERMINAL = {'completed', 'needs_input', 'partial_available', 'insufficient_data',
            'unsupported', 'failed', 'cancelled'}
JOB_VERSION = '3'
JOB_SECONDS = 70
TTL = 7200
MAX_ACTIVE_JOBS = 12
MAX_ACTIVE_PER_OWNER = 4


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False,
        separators=(',', ':')).encode()).hexdigest()


class JobRepository:
    def __init__(self, client=None):
        self.client = client
        self.memory = {}
        self.lock = threading.RLock()

    @contextmanager
    def guard(self, key):
        if self.client is None:
            with self.lock:
                yield
        else:
            try:
                with self.client.lock('analyst:{jobs}:lock:' + key, timeout=5,
                                      blocking_timeout=2):
                    yield
            except AnalysisError:
                raise
            except Exception:
                raise AnalysisError('job_storage', 'Job transaction unavailable') from None

    def read(self, key):
        try:
            if self.client is not None:
                raw = self.client.get('analyst:{jobs}:' + key)
                return json.loads(raw) if raw else None
            value = self.memory.get(key)
            if value and value[0] > time.time():
                return deepcopy(value[1])
            return None
        except Exception:
            raise AnalysisError('job_storage', 'Job storage unavailable') from None

    def write(self, key, value, ttl=TTL):
        wire = json.dumps(value, ensure_ascii=False, separators=(',', ':'))
        if len(wire.encode()) > 1_100_000:
            raise AnalysisError('response_capacity', 'Job response exceeds capacity')
        try:
            if self.client is not None:
                self.client.set('analyst:{jobs}:' + key, wire, ex=ttl)
            else:
                self.memory[key] = (time.time() + ttl, deepcopy(value))
        except Exception:
            raise AnalysisError('job_storage', 'Job persistence unavailable') from None

    def register(self, values):
        """Job/idempotency/admission become visible together, or not at all."""
        encoded={key:json.dumps(value,ensure_ascii=False,separators=(',',':')) for key,value in values.items()}
        if any(len(wire.encode())>1_100_000 for wire in encoded.values()):
            raise AnalysisError('response_capacity','Job registration exceeds capacity')
        try:
            if self.client is not None:
                with self.client.pipeline(transaction=True) as transaction:
                    for key,wire in encoded.items():transaction.set('analyst:{jobs}:'+key,wire,ex=TTL)
                    transaction.execute()
            else:
                expires=time.time()+TTL
                self.memory.update({key:(expires,deepcopy(value)) for key,value in values.items()})
        except Exception:
            # EXEC may have committed before a connection failure. Preserve the
            # unknown outcome; the same idempotency key is read before any retry.
            if self.client is not None:
                try:
                    observed=self.client.mget(['analyst:{jobs}:'+key for key in encoded])
                    if isinstance(observed,list) and [v.decode() if isinstance(v,bytes) else v for v in observed]==list(encoded.values()):
                        return  # Exact atomic read-back acknowledges this registration, not a new job.
                except Exception:
                    pass
            raise AnalysisError('job_storage','Atomic job registration unavailable') from None

    def create(self, owner, key, payload):
        signature = digest(payload)
        identity = 'idem:' + digest([owner, key])
        with self.guard('registration'):
            prior = self.read(identity)
            if prior:
                if prior['input_fingerprint'] != signature:
                    raise AnalysisError('idempotency_conflict', 'Key already binds another input')
                job = self.read(prior['job_id'])
                if not job:
                    raise AnalysisError('job_expired', 'Job expired')
                return job, False
            records=[self.read(identity) for identity in (self.read('active') or [])]
            records=[j for j in records if j and j.get('deadline_at',0)>time.time() and j.get('state') not in TERMINAL]
            active=[j['job_id'] for j in records]
            if len(active) >= MAX_ACTIVE_JOBS:
                raise AnalysisError('job_busy', 'Job capacity exhausted')
            if sum(j.get('owner')==owner for j in records)>=MAX_ACTIVE_PER_OWNER:
                raise AnalysisError('job_busy','Principal job capacity exhausted')
            job = dict(job_id='aj_' + uuid4().hex, version=JOB_VERSION, owner=owner,
                input_fingerprint=signature, payload=payload, state='accepted',
                created_at=time.time(), deadline_at=time.time() + JOB_SECONDS,
                provider_call_count=0, physical_http=0, recovery_used=False, worker_token=None, result=None)
            from services.telemetry import request_id
            job['request_id']=request_id.get() or 'req_'+uuid4().hex
            if self.read('cancel:' + digest([owner,key])):
                job['state'] = 'cancelled'
                job['result'] = AnalysisJobs.failure(AnalysisError('job_cancelled', 'Cancelled before registration'))
            self.register({job['job_id']:job,identity:dict(job_id=job['job_id'],input_fingerprint=signature),
                'active':active+[job['job_id']]})
            return job, True

    def mutate(self, job_id, change):
        with self.guard(job_id):
            job = self.read(job_id)
            if not job:
                raise AnalysisError('job_expired', 'Job expired')
            change(job)
            self.write(job_id, job)
            return job


def apply_ledger_event(j, event):
    """Durable physical-HTTP / recovery ledger on the job record (atomic under repository.mutate).

    Reserved BEFORE the send; an attempt whose outcome is unknown stays counted and is never replayed."""
    if event == 'provider_physical_reserved':
        if j.get('physical_http', 0) >= 3:
            raise AnalysisError('provider_call_budget_exceeded', 'Durable physical allowance exhausted')
        j['physical_http'] = j.get('physical_http', 0) + 1
    elif event == 'provider_recovery_claimed':
        if j.get('recovery_used'):
            raise AnalysisError('provider_call_budget_exceeded', 'Transport recovery already used')
        j['recovery_used'] = True


def terminal_state(result, semantic_info):
    """Terminal job state follows the typed taxonomy, never a name prefix.

    A server-side REDIRECT/CLARIFY decision stops as `needs_input` (old clients stop polling)
    and exposes the decision first-class on the result."""
    decision = (semantic_info or {}).get('capability_decision')
    if decision in {'REDIRECT', 'CLARIFY'}:
        result['decision'] = decision
        result['decision_codes'] = list((semantic_info or {}).get('capability_codes') or [])
        return 'needs_input'
    return ({'UNSUPPORTED_CAPABILITY': 'unsupported', 'INSUFFICIENT_DATA': 'insufficient_data'}.get(result.get('analysis_state'))
            or ('needs_input' if result.get('status') == 'needs_clarification' else 'failed'))


class AnalysisJobs:
    def __init__(self, repository, pipeline_factory=None, workers=2):
        self.repository = repository
        self.pipeline_factory = pipeline_factory
        self.pool = ThreadPoolExecutor(max_workers=workers, thread_name_prefix='analysis-job')
        self.slots = threading.BoundedSemaphore(12)
        self.cancellations = {}
        self.connection_registries = {}
        self.futures = {}
        self.stopping = threading.Event()
        self.enqueue_lock = threading.Lock()
        self.local_lock = threading.Lock()

    def pipeline(self, owner):
        if self.pipeline_factory:
            return self.pipeline_factory(owner)
        from services.agent_pipeline import AnalysisPipeline
        return AnalysisPipeline(owner_id=owner)

    @staticmethod
    def public(job):
        return {k:deepcopy(job.get(k)) for k in ('job_id', 'state', 'version',
            'created_at', 'deadline_at', 'provider_call_count', 'physical_http', 'recovery_used', 'result', 'stage_timings_ms')}

    def submit(self, request, owner, key):
        from services.access_policy import active_principal,authorize_meaning
        from services.preflight_service import preflight_catalog
        from services.input_integrity_service import enforce, request_text
        if not getattr(request, 'dashboard_id', None) and (request.prompt or request.input_mode!='guided'):
            enforce(request_text(request), preflight_catalog())
        if getattr(request, 'dashboard_id', None):
            from services.preflight_service import preflight_catalog
            from services.workspace_service import dashboard_template, dashboard_sources
            catalog = preflight_catalog()
            template = dashboard_template(catalog, request.dashboard_id, request.dashboard_version)
            if active_principal.get() is not None:
                from services.access_policy import current_principal
                principal = current_principal(required=True)
                if any(not principal.permits('analytics.read', source) for source in dashboard_sources(catalog, template)):
                    raise AnalysisError('privacy', 'Dashboard source is outside the granted datasets')
        if active_principal.get() is not None:
            from services.preflight_service import preflight_catalog
            from services.request_anchors import request_anchors
            catalog=preflight_catalog()
            authorize_meaning(request_text(request),catalog,analysis_scope=request.analysis_scope,
                              anchors=request_anchors(request_text(request),catalog,{}))
        if not owner or not re.fullmatch(r'[A-Za-z0-9_-]{16,100}', key or ''):
            raise AnalysisError('invalid_job_key', 'Owned idempotency key required')
        if request.session_id:
            raise AnalysisError('invalid_analysis_contract', 'New job cannot bind a client session')
        # exclude_unset keeps defaults (e.g. analysis_depth) from becoming explicit user choices on restore.
        payload = request.model_dump(mode='json', exclude_unset=True)
        # The Pydantic boundary recomputes this excluded flag on restoration.
        payload['natural_input'] = request.natural_input
        with self.enqueue_lock:
            if self.stopping.is_set():raise AnalysisError('job_busy','Instance is draining; no new work accepted')
            job, created = self.repository.create(owner, key, payload)
            if created and job['state'] not in TERMINAL:
                if not self.slots.acquire(blocking=False):
                    self.repository.mutate(job['job_id'], lambda j:j.update(state='failed',
                        result=self.failure(AnalysisError('job_busy', 'Worker capacity exhausted'))))
                else:
                    try:future=self.pool.submit(copy_context().run,self.work,job['job_id'])
                    except Exception:
                        self.slots.release()
                        self.repository.mutate(job['job_id'],lambda j:j.update(state='failed',
                            result=self.failure(AnalysisError('job_storage','Local enqueue failed; no work sent'))))
                    else:
                        with self.local_lock:self.futures[job['job_id']]=future
                        def complete(_future,identity=job['job_id']):
                            with self.local_lock:self.futures.pop(identity,None)
                        future.add_done_callback(complete)
        return self.status(job['job_id'], owner)

    def shutdown(self, grace_seconds=2):
        """Cancel only this instance's jobs; never reset reservations or resume."""
        from concurrent.futures import wait
        with self.enqueue_lock:
            self.stopping.set()
            with self.local_lock:pending=list(self.futures.items())
            for identity,future in pending:
                try:
                    def terminate(job):
                        if job['state'] not in TERMINAL:
                            job.update(state='cancelled',result=self.failure(AnalysisError('job_cancelled','Instance shutdown; paid outcome is not replayed')))
                    self.repository.mutate(identity,terminate)
                except AnalysisError:
                    pass  # Unavailable durable storage never authorizes a resend.
                with self.local_lock:
                    cancelled=self.cancellations.get(identity)
                    connections=self.connection_registries.get(identity)
                if cancelled:cancelled.set()
                if connections:connections.cancel()
                if future.cancel():self.slots.release()  # queued work never enters work.finally
            self.pool.shutdown(wait=False,cancel_futures=False)
        if pending:wait([future for _,future in pending],timeout=max(0,min(float(grace_seconds),5)))

    def owned(self, job_id, owner):
        if not re.fullmatch(r'aj_[a-f0-9]{32}', job_id):
            raise AnalysisError('job_not_found', 'Unknown job')
        job = self.repository.read(job_id)
        if not job or job['owner'] != owner:
            raise AnalysisError('job_not_found', 'Unknown owned job')
        if job.get('version') != JOB_VERSION:
            raise AnalysisError('job_expired', 'Job contract changed; submit a new analysis')
        return job

    def status(self, job_id, owner):
        job = self.owned(job_id, owner)
        if job['state'] not in TERMINAL and time.time() >= job['deadline_at']:
            def expire(j):
                if j['state'] not in TERMINAL:
                    j.update(state='failed', result=self.failure(
                        AnalysisError('job_timeout', 'Job deadline exhausted')))
            job = self.repository.mutate(job_id, expire)
        from services import telemetry
        token=telemetry.job_id.set(job_id)
        try:telemetry.event('job_lookup','completed')
        finally:telemetry.job_id.reset(token)
        return self.public(job)

    def cancel(self, job_id, owner):
        self.owned(job_id, owner)
        def cancelled(j):
            if j['state'] not in TERMINAL:
                j.update(state='cancelled', result=self.failure(
                    AnalysisError('job_cancelled', 'Job cancelled')))
        job = self.repository.mutate(job_id, cancelled)
        with self.local_lock:
            event = self.cancellations.get(job_id)
            connections = self.connection_registries.get(job_id)
        if event:
            event.set()
        if connections:connections.cancel()
        return self.public(job)

    def cancel_key(self, key, owner):
        if not owner or not re.fullmatch(r'[A-Za-z0-9_-]{16,100}',key or ''):
            raise AnalysisError('invalid_job_key', 'Owned key required')
        with self.repository.guard('registration'):
            self.repository.write('cancel:' + digest([owner,key]), True)
            prior = self.repository.read('idem:' + digest([owner,key]))
        return self.cancel(prior['job_id'],owner) if prior else {'state':'cancelled'}

    @staticmethod
    def failure(error, pipeline=None):
        from services.analysis_pipeline import safe_failure
        return safe_failure(error, pipeline.calls if pipeline else [],
            pipeline.semantic_info if pipeline else {'failure_stage':'JOB_LIFECYCLE'})

    def work(self, job_id):
        pipeline = None
        from services.query_execution_batch import Connections, active_connections
        connections = Connections()
        stop, cancelled = threading.Event(), threading.Event()
        tokens = []
        worker = uuid4().hex
        started = time.monotonic()
        stages = {}
        current = ['accepted', started]
        def claim(j):
            if self.stopping.is_set():raise AnalysisError('job_cancelled','Instance is draining')
            if j['state'] != 'accepted' or j['worker_token'] or time.time() >= j['deadline_at']:
                raise AnalysisError('job_expired', 'Job cannot be claimed')
            j.update(worker_token=worker, state='planning', heartbeat_at=time.time())
        def observer(event, details):
            if self.stopping.is_set():
                cancelled.set()
                raise AnalysisError('job_cancelled','Instance is draining')
            from services.access_policy import active_principal, current_principal
            if active_principal.get() is not None: current_principal(required=True)
            def update(j):
                if j['worker_token'] != worker or j['state'] in TERMINAL or time.time() >= j['deadline_at']:
                    cancelled.set()
                    raise AnalysisError('job_cancelled', 'Job no longer active')
                if j['payload'].get('dashboard_id') and event in {'provider_reserved','provider_physical_reserved','provider_recovery_claimed'}:
                    raise AnalysisError('provider_forbidden', 'Dashboard jobs cannot reserve provider calls')
                if event == 'provider_reserved':
                    if j['provider_call_count'] >= 3:
                        raise AnalysisError('provider_call_budget_exceeded', 'Durable allowance exhausted')
                    j['provider_call_count'] += 1
                elif event in {'provider_physical_reserved', 'provider_recovery_claimed'}:
                    apply_ledger_event(j, event)
                elif event in {'planning','repairing','validating','executing','verifying'}:
                    now = time.monotonic()
                    stages[current[0]] = stages.get(current[0], 0) + (now-current[1])*1000
                    current[:] = [event, now]
                    j['state'] = event
                j['heartbeat_at'] = time.time()
            self.repository.mutate(job_id, update)
        def heartbeat():
            from services.access_policy import active_principal, current_principal
            while not stop.wait(1):
                try:
                    if active_principal.get() is not None:
                        current_principal(required=True)
                    j = self.repository.read(job_id)
                    if not j or j['worker_token'] != worker or j['state'] in TERMINAL or time.time() >= j['deadline_at']:
                        cancelled.set(); connections.cancel(); return
                except Exception:
                    cancelled.set(); connections.cancel(); return
        try:
            job = self.repository.mutate(job_id, claim)
            from services.telemetry import job_id as telemetry_job_id,request_id as telemetry_request_id
            tokens.append((telemetry_job_id,telemetry_job_id.set(job_id)))
            tokens.append((telemetry_request_id,telemetry_request_id.set(job.get('request_id') or 'req_'+uuid4().hex)))
            from services.analytical_capacity_planner import QueryBudget,request_sql_budget
            if request_sql_budget.get() is None:
                tokens.append((request_sql_budget,request_sql_budget.set(QueryBudget())))
            from services.access_policy import active_principal, current_principal
            if active_principal.get() is not None: current_principal(required=True)
            queue_ms = max(0, (time.time()-job['created_at'])*1000)
            stages['queue'] = queue_ms
            with self.local_lock:
                self.cancellations[job_id] = cancelled
                self.connection_registries[job_id] = connections
            if self.stopping.is_set():cancelled.set()
            tokens += [(request_deadline, request_deadline.set(started + max(0, job['deadline_at']-time.time()))),
                (request_cancelled, request_cancelled.set(cancelled)),
                (request_observer, request_observer.set(observer)),
                (active_connections, active_connections.set(connections))]
            threading.Thread(target=copy_context().run, args=(heartbeat,), name='analysis-heartbeat', daemon=True).start()
            from common import AiTextToReportRequest
            request = AiTextToReportRequest.model_validate(job['payload'])
            request.natural_input = job['payload']['natural_input']
            pipeline = self.pipeline(job['owner'])
            catalog = pipeline.catalog()
            request.reference_date = pipeline.reference(request, catalog)
            from services import llm_service
            from services.analytical_resolver import PLAN_POLICY_VERSION
            from services.input_integrity_service import policy_fingerprint as input_policy_fingerprint
            cache_key = 'plan:' + digest([job['owner'], pipeline.request_signature(request), bool(getattr(request, 'accept_partial_scope', False)),
                catalog.fingerprint, JOB_VERSION, PLAN_POLICY_VERSION, input_policy_fingerprint(), llm_service.GEMINI_MODELS,
                os.getenv('GEMINI_API_STYLE','native')])
            cached = None if request.refresh else self.repository.read(cache_key)
            from services.session_service import get_session
            session = get_session(cached['session_id']) if cached else None
            if (session and session.owner_id == job['owner'] and session.schema_fingerprint == catalog.fingerprint
                and not session.partial_scope and session.intent_fingerprint == cached.get('intent_fingerprint')
                and session.plan_fingerprint == cached.get('plan_fingerprint')):
                # Cached meaning is immutable for this task. Never share a
                # mutable approval/session revision across concurrent jobs.
                from dataclasses import fields
                from services.session_service import create_session, encode_session, decode_session, save_session
                snapshot = decode_session(encode_session(session))
                fresh = create_session(session.original_prompt,session.domain,owner_id=job['owner'])
                for field in fields(snapshot):
                    if field.name not in {'session_id','analysis_lock','created_at','last_updated'}:
                        setattr(fresh,field.name,deepcopy(getattr(snapshot,field.name)))
                save_session(fresh)
                session = fresh
                proposal = dict(session_id=session.session_id, proposal=dict(revision=session.revision,
                    semantic_intent_fingerprint=session.intent_fingerprint,
                    resolved_plan_fingerprint=session.plan_fingerprint,
                    catalog_fingerprint=catalog.fingerprint))
                pipeline.semantic_info['plan_cache_hit'] = True
            else:
                # One planning deadline, bounded independently of SQL/report.
                planning = request_deadline.set(min(request_deadline.get(), time.monotonic()+40))
                try:
                    proposal = pipeline.propose(request)
                finally:
                    request_deadline.reset(planning)
                if proposal['proposal'].get('partial_scope'):
                    self.finish(job_id, worker, 'partial_available', proposal, stages)
                    return
                self.repository.write(cache_key, {'session_id':proposal['session_id'],
                    'intent_fingerprint':proposal['proposal']['semantic_intent_fingerprint'],
                    'plan_fingerprint':proposal['proposal']['resolved_plan_fingerprint']}, ttl=300)
            p = proposal['proposal']
            request.session_id = proposal['session_id']
            request.proposal_revision = p['revision']
            request.intent_fingerprint = p['semantic_intent_fingerprint']
            request.plan_fingerprint = p['resolved_plan_fingerprint']
            request.catalog_fingerprint = p['catalog_fingerprint']
            request.accept_partial_scope = False
            planning_calls = deepcopy(pipeline.calls)
            planning_tokens = {key:pipeline.semantic_info.get(key) for key in ('input_tokens','output_tokens')}
            observer('executing', {})
            report = pipeline.generate(request)
            from services.provider_budget import check_request_deadline
            check_request_deadline()
            record = self.repository.read(job_id)
            diagnostics = report.setdefault('diagnostics', {})
            diagnostics.update(job_id=job_id, provider_call_count=record['provider_call_count'],
                provider_calls=planning_calls, one_click=True,
                queue_ms=round(queue_ms,2),
                job_total_ms=round(queue_ms+(time.monotonic()-started)*1000, 2))
            if planning_calls:
                diagnostics.update(planning_tokens)
            stages[current[0]] = stages.get(current[0], 0) + (time.monotonic()-current[1])*1000
            self.finish(job_id, worker, 'completed', report, stages)
        except Exception as error:
            from services.telemetry import failure_diagnostic
            failure_diagnostic(error,action='job')
            result = self.failure(error, pipeline)
            state = terminal_state(result, pipeline.semantic_info if pipeline else {})
            try:
                self.finish(job_id, worker, state, result, stages)
            except AnalysisError:
                pass  # Durable storage failure/terminal state never triggers a resend.
        finally:
            stop.set()
            with self.local_lock:
                self.cancellations.pop(job_id, None)
                self.connection_registries.pop(job_id,None)
            for field, token in reversed(tokens):
                field.reset(token)
            self.slots.release()

    def finish(self, job_id, worker, state, result, stages):
        from services.access_policy import active_principal, current_principal
        if active_principal.get() is not None and state=='completed': current_principal(required=True)
        def commit(j):
            if j['state'] in TERMINAL or j['worker_token'] != worker:
                return
            if self.stopping.is_set() and state=='completed':
                j.update(state='cancelled',result=self.failure(AnalysisError('job_cancelled','Instance stopped before publication')))
                return
            if time.time() >= j['deadline_at']:
                j.update(state='failed', result=self.failure(AnalysisError('job_timeout', 'Job deadline exhausted')))
                return
            j.update(state=state, result=result, stage_timings_ms={k:round(v,2) for k,v in stages.items()},
                completed_at=time.time())
        self.repository.mutate(job_id, commit)


_jobs = None
_jobs_lock = threading.Lock()


def shutdown_jobs():
    # Do not construct an executor merely because the API is shutting down.
    with _jobs_lock:current=_jobs
    if current is not None:current.shutdown()


def analysis_jobs():
    global _jobs
    if _jobs is None:
        with _jobs_lock:
            if _jobs is None:
                from services.session_service import storage
                durable = storage()
                _jobs = AnalysisJobs(JobRepository(durable.client if durable else None))
    return _jobs
