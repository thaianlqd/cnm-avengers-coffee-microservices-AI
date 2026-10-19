"""Bounded structured telemetry and durable, append-only privileged audit.

No raw prompt, SQL, tokens, headers or data rows enter these contracts.
Privileged work needs an acknowledged audit reservation; no memory fallback.
"""
from collections import Counter
from contextlib import contextmanager
from contextvars import ContextVar
import json
import logging
import os
import re
import threading
import time
from uuid import uuid4

from fastapi import HTTPException

request_id=ContextVar('analytics_request_id',default=None)
job_id=ContextVar('analytics_job_id',default=None)
_lock=threading.Lock()
_counts=Counter()
_durations={}
_dropped_events=0
_audit_delivery=Counter()
_STAGES={'request','preflight','planning','repairing','validating','executing','verifying','persisting',
         'provider','sql','sql_dry_run','sql_metadata','sql_reader','db_acquire','db_fetch','job_lookup','audit','queue','data_refresh','shutdown'}
_STATUS={'started','completed','denied','failed','cancelled','timeout','rejected'}
_ACTIONS={'report.save','report.delete','report.export','pipeline.trigger','sql.explore','policy.claim'}
_HASH=re.compile(r'^[a-f0-9]{64}$')


def _otel():
    # API only: no SDK/exporter, endpoint, background thread or network is
    # configured by this module. Disabled means no OTel work at all.
    if os.getenv('DATA_ANALYST_OTEL_ENABLED','0')!='1':return None
    from opentelemetry import trace
    return trace


def _trace_ids():
    api=_otel()
    if api is None:return {}
    try:
        context=api.get_current_span().get_span_context()
        return {'trace_id':format(context.trace_id,'032x'),'span_id':format(context.span_id,'016x')} if context.is_valid else {}
    except Exception:
        _record_drop()
        return {}


@contextmanager
def _otel_span(stage, *, parent=None):
    if stage not in _STAGES:raise ValueError('Unbounded telemetry label')
    api=_otel()
    if api is None:
        yield None
        return
    attributes={'analytics.stage':stage}
    for name,var in [('request_id',request_id),('job_id',job_id)]:
        value=var.get()
        if isinstance(value,str) and re.fullmatch(r'(req_|aj_)[A-Za-z0-9_]{1,100}',value):
            attributes['analytics.'+name]=value
    # Default OTel exception recording includes exception messages and stacks.
    # Keep only a controlled status so SQL, prompts and rows cannot be exported.
    try:
        manager=api.get_tracer('avengers.analytics','3.4.0').start_as_current_span('analytics.'+stage,
            context=parent,attributes=attributes,record_exception=False,set_status_on_exception=False)
        current=manager.__enter__()
    except Exception:
        _record_drop()
        yield None
        return
    try:yield current
    except BaseException:
        try:current.set_status(api.Status(api.StatusCode.ERROR))
        except Exception:_record_drop()
        raise
    finally:
        # Exceptions from an optional SDK/exporter must not replace business
        # outcomes. Automatic exception recording is disabled above.
        try:manager.__exit__(None,None,None)
        except Exception:_record_drop()


def _request_parent(scope):
    if _otel() is None:return None
    from opentelemetry.trace.propagation.tracecontext import TraceContextTextMapPropagator
    # Admit only a valid W3C traceparent. Never forward baggage, tracestate,
    # cookies, authorization, URLs or arbitrary header attributes.
    headers=[v.decode('ascii',errors='ignore') for k,v in scope.get('headers',[]) if k.lower()==b'traceparent']
    value=headers[0] if len(headers)==1 else ''
    if not re.fullmatch(r'00-[a-f0-9]{32}-[a-f0-9]{16}-0[01]',value):return None
    return TraceContextTextMapPropagator().extract({'traceparent':value})


def failure_diagnostic(error, *, action):
    """Server-only stack locations, never exception messages or local values."""
    if action not in {'propose','generate','refine','feedback','job'}:
        raise ValueError('Unbounded failure action')
    from pathlib import Path
    import traceback
    root=Path(__file__).resolve().parent.parent
    frames=[]
    for frame in traceback.extract_tb(error.__traceback__)[-12:]:
        try:relative=Path(frame.filename).resolve().relative_to(root)
        except ValueError:continue
        frames.append({'file':str(relative),'line':frame.lineno,'function':frame.name})
    codes=[]
    cause=error
    for _ in range(6):
        if cause is None:break
        code=getattr(cause,'pgcode',None) or getattr(cause,'sqlstate',None)
        if isinstance(code,str) and re.fullmatch(r'[A-Z0-9]{5}',code):codes.append(code)
        cause=cause.__cause__
    kind=type(error).__name__
    details={'event':'analysis_failure','action':action,'request_id':request_id.get(),'job_id':job_id.get(),
        'exception_type':kind if re.fullmatch(r'[A-Za-z_][A-Za-z_0-9]{0,79}',kind) else 'Exception',
        'sqlstates':sorted(set(codes)),'locations':frames}
    try:logging.getLogger('analytics.failures').error('%s',json.dumps(details,separators=(',',':')))
    except Exception:_record_drop()
    return details


def _record_drop():
    global _dropped_events
    with _lock:_dropped_events+=1


def event(stage,status,*,duration_ms=None,rows=None):
    if stage not in _STAGES or status not in _STATUS: raise ValueError('Unbounded telemetry label')
    details={'stage':stage,'status':status,'request_id':request_id.get(),'job_id':job_id.get()}
    details.update(_trace_ids())
    if duration_ms is not None:
        if not isinstance(duration_ms,(float,int)) or not 0<=duration_ms<=86400000: raise ValueError('Invalid timing')
        details['duration_ms']=round(duration_ms,3)
    if rows is not None:
        if type(rows) is not int or rows<0: raise ValueError('Invalid count')
        details['rows']=rows
    with _lock:
        _counts[(stage,status)]+=1
        if duration_ms is not None:
            hist=_durations.setdefault(stage,Counter())
            hist['count']+=1
            hist['sum_ms']+=duration_ms
            for bound in (10,50,100,500,1000,5000,12000,40000,70000):
                if duration_ms<=bound: hist[str(bound)]+=1
    try:logging.getLogger('analytics.events').info('%s',json.dumps(details,separators=(',',':')))
    except Exception:_record_drop()
    return details


@contextmanager
def span(stage):
    with _otel_span(stage):
        started=time.monotonic();event(stage,'started');counts={}
        try:yield counts
        except BaseException:
            event(stage,'failed',duration_ms=(time.monotonic()-started)*1000)
            raise
        else:event(stage,'completed',duration_ms=(time.monotonic()-started)*1000,rows=counts.get('rows'))


def snapshot():
    with _lock:
        return {'version':'1','counts':[{'stage':s,'status':r,'count':n} for (s,r),n in sorted(_counts.items())],
                'duration_histograms_ms':{k:dict(v) for k,v in _durations.items()},'dropped_events':_dropped_events,
                'audit_delivery':dict(_audit_delivery),
                'scope':'Current API process observations; no sustained SLO claim'}


class TelemetryMiddleware:
    def __init__(self,app):self.app=app

    async def __call__(self,scope,receive,send):
        if scope['type']!='http' or not scope.get('path','').startswith('/api/'):
            return await self.app(scope,receive,send)
        token=request_id.set('req_'+uuid4().hex)
        from services.analytical_capacity_planner import QueryBudget,request_sql_budget
        sql_token=request_sql_budget.set(QueryBudget())
        started=time.monotonic()
        status=['failed']
        try:
            async def traced_send(message):
                if message['type']=='http.response.start':
                    code=message.get('status',500)
                    status[0]='denied' if code in {401,403,404} else 'failed' if code>=400 else 'completed'
                    message={**message,'headers':[*message.get('headers',[]),(b'x-request-id',request_id.get().encode())]}
                await send(message)
            with _otel_span('request',parent=_request_parent(scope)) as current:
                try:await self.app(scope,receive,traced_send)
                finally:
                    event('request',status[0],duration_ms=(time.monotonic()-started)*1000)
                    if current is not None:
                        try:current.set_attribute('analytics.status',status[0])
                        except Exception:_record_drop()
        finally:
            request_sql_budget.reset(sql_token)
            request_id.reset(token)


_AUDIT_FIELDS=('event_id','actor_key','action','resource_type','resource_key','decision','policy_fingerprint',
    'scope_fingerprint','query_fingerprint','request_id','job_id','occurred_at','details')
_AUDIT_SPOOL_MAX_EVENTS=1000
_AUDIT_SPOOL_MAX_BYTES=4*1024*1024


def _audit_count(name,amount=1):
    with _lock:_audit_delivery[name]+=amount


def _validate_audit_record(record):
    from datetime import datetime
    from uuid import UUID
    if not isinstance(record,dict) or set(record)!=set(_AUDIT_FIELDS):raise ValueError('Invalid audit envelope')
    if str(UUID(record['event_id']))!=record['event_id']:raise ValueError('Invalid audit ID')
    if not re.fullmatch(r'account:[a-f0-9]{64}',record['actor_key']):raise ValueError('Invalid audit actor')
    if record['action'] not in _ACTIONS or record['resource_type'] not in {'report','query','pipeline','policy'}:
        raise ValueError('Invalid audit action')
    if record['decision'] not in {'allowed','denied','failed','completed'}:raise ValueError('Invalid audit decision')
    for name in ('policy_fingerprint','scope_fingerprint','query_fingerprint'):
        if record[name] is not None and not _HASH.fullmatch(record[name]):raise ValueError('Invalid audit hash')
    for name,maximum in [('resource_key',100),('request_id',64),('job_id',100)]:
        if record[name] is not None and not re.fullmatch(r'[A-Za-z0-9_-]{1,'+str(maximum)+'}',record[name]):
            raise ValueError('Invalid opaque audit identity')
    if datetime.fromisoformat(record['occurred_at']).utcoffset() is None:raise ValueError('Audit clock needs timezone')
    if not isinstance(record['details'],dict):raise ValueError('Invalid audit details')
    for name,value in record['details'].items():
        if name in {'duration_ms','rows'} and type(value) in (int,float) and 0<=value<=86400000:continue
        if name=='status' and value in _STATUS:continue
        if name=='reason' and isinstance(value,str) and re.fullmatch(r'[a-z_]{1,80}',value):continue
        raise ValueError('Private or unbounded audit detail')


@contextmanager
def _audit_spool():
    """Operator-configured persistent directory; no implicit memory fallback.

    The lock and every file are private, regular and opened without following
    symlinks. Wait, file count, bytes and replay batch are bounded. An unacked
    disk write, corruption or full spool denies privileged work.
    """
    import os,stat,fcntl
    from pathlib import Path
    path=os.getenv('DATA_ANALYST_AUDIT_SPOOL_DIR')
    if not path:
        yield None
        return
    folder=Path(path)
    if not folder.is_absolute():raise ValueError('Audit spool must be an absolute persistent path')
    folder.mkdir(mode=0o700,parents=True,exist_ok=True)
    directory=os.open(folder,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
    lock=None
    try:
        attributes=os.fstat(directory)
        if attributes.st_uid!=os.getuid() or attributes.st_mode&0o077:raise ValueError('Audit spool is not private')
        lock=os.open('.lock',os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW,0o600,dir_fd=directory)
        attributes=os.fstat(lock)
        if (not stat.S_ISREG(attributes.st_mode) or attributes.st_mode&0o077 or
                attributes.st_uid!=os.getuid()):raise ValueError('Audit lock is not private')
        deadline=time.monotonic()+.25
        while True:
            try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB);break
            except BlockingIOError:
                if time.monotonic()>=deadline:raise TimeoutError('Audit spool admission exhausted')
                time.sleep(.005)
        names=os.listdir(directory)
        if len(names)>_AUDIT_SPOOL_MAX_EVENTS+1:raise ValueError('Audit spool capacity exceeded')
        records=[];size=0
        for name in sorted(names):
            if name=='.lock':continue
            attributes=os.stat(name,dir_fd=directory,follow_symlinks=False)
            if not stat.S_ISREG(attributes.st_mode) or attributes.st_mode&0o077 or attributes.st_uid!=os.getuid():
                raise ValueError('Unsafe audit spool entry')
            size+=attributes.st_size
            if size>_AUDIT_SPOOL_MAX_BYTES or attributes.st_size>8192:raise ValueError('Audit spool byte capacity exceeded')
            if not re.fullmatch(r'[a-f0-9-]{36}\.json',name):raise ValueError('Incomplete audit spool entry needs operator review')
            descriptor=os.open(name,os.O_RDONLY|os.O_NOFOLLOW,dir_fd=directory)
            with os.fdopen(descriptor,'r') as stream:record=json.load(stream)
            _validate_audit_record(record)
            if name!=record['event_id']+'.json':raise ValueError('Audit identity differs from file')
            records.append(record)
        yield {'directory':directory,'records':records,'bytes':size}
    finally:
        if lock is not None:os.close(lock)
        os.close(directory)


def _spool_audit(spool,record):
    import os
    if spool is None:raise ValueError('Durable audit spool is not configured')
    _validate_audit_record(record)
    body=json.dumps(record,sort_keys=True,separators=(',',':')).encode()
    if (len(body)>8192 or len(spool['records'])>=_AUDIT_SPOOL_MAX_EVENTS or
            spool['bytes']+len(body)>_AUDIT_SPOOL_MAX_BYTES):raise ValueError('Audit spool is full')
    temporary='.'+record['event_id']+'.tmp';directory=spool['directory']
    try:
        descriptor=os.open(temporary,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600,dir_fd=directory)
        with os.fdopen(descriptor,'wb') as stream:
            stream.write(body);stream.flush();os.fsync(stream.fileno())
        os.rename(temporary,record['event_id']+'.json',src_dir_fd=directory,dst_dir_fd=directory)
        os.fsync(directory)  # No privileged work before the directory entry is durable.
    except BaseException:
        try:os.unlink(temporary,dir_fd=directory)
        except FileNotFoundError:pass
        raise
    _audit_count('spooled')


def _write_audit(connection,records):
    with connection.cursor() as cursor:
        for record in records:
            cursor.execute('INSERT INTO analytics.audit_events ('+','.join(_AUDIT_FIELDS)+') '
                'VALUES ('+','.join(['%s']*(len(_AUDIT_FIELDS)-1))+',%s::jsonb) ON CONFLICT DO NOTHING',
                tuple(json.dumps(record[name]) if name=='details' else record[name] for name in _AUDIT_FIELDS))


def audit(action,resource_type,*,resource_key=None,decision='allowed',query_hash=None,details=None,connection_factory=None):
    from services.access_policy import current_principal
    principal=current_principal(required=True)
    if action not in _ACTIONS or resource_type not in {'report','query','pipeline','policy'}:
        raise ValueError('Unknown privileged audit action')
    if decision not in {'allowed','denied','failed','completed'}: raise ValueError('Invalid audit decision')
    if query_hash is not None and not _HASH.fullmatch(query_hash): raise ValueError('Invalid query hash')
    if resource_key is not None and not re.fullmatch(r'[A-Za-z0-9_-]{1,100}',resource_key):
        raise ValueError('Audit resource identity must be opaque')
    safe={}
    for key,value in (details or {}).items():
        if key in {'duration_ms','rows'} and type(value) in (int,float) and 0<=value<=86400000: safe[key]=value
        elif key=='status' and value in _STATUS: safe[key]=value
        elif key=='reason' and isinstance(value,str) and re.fullmatch(r'[a-z_]{1,80}',value): safe[key]=value
        else: raise ValueError('Audit detail outside controlled schema')
    if connection_factory is None:
        from db import get_report_writer_conn
        connection_factory=get_report_writer_conn
    connection=None
    identity=str(uuid4())
    from datetime import datetime,timezone
    record=dict(zip(_AUDIT_FIELDS,(identity,principal.owner_key,action,resource_type,resource_key,decision,
        principal.access_fingerprint,principal.access_fingerprint,query_hash,request_id.get(),job_id.get(),
        datetime.now(timezone.utc).isoformat(),safe)))
    try:
        with _audit_spool() as spool:
            pending=(spool['records'][:25] if spool else [])
            try:
                connection=connection_factory()
                _write_audit(connection,[*pending,record])
                connection.commit()
            except Exception:
                if connection is not None:
                    try:connection.rollback()
                    except Exception:pass
                _spool_audit(spool,record)
            else:
                # A lost acknowledgement or cleanup crash replays the same UUID;
                # INSERT-only writer needs no SELECT/UPDATE/DELETE audit grants.
                if pending:
                    import os
                    try:
                        for previous in pending:os.unlink(previous['event_id']+'.json',dir_fd=spool['directory'])
                        os.fsync(spool['directory'])
                        _audit_count('replayed',len(pending))
                    except OSError:_audit_count('cleanup_failed')
            event('audit','completed')
    except Exception:
        _audit_count('failed')
        event('audit','failed')
        raise HTTPException(503,'Nhật ký bảo mật chưa sẵn sàng; thao tác chưa được thực hiện.') from None
    finally:
        if connection is not None: connection.close()
    return identity
