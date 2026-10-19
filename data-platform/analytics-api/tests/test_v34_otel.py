"""Real OTel API context propagation; test tracer has no exporter or I/O."""
import asyncio
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from contextvars import copy_context
import json
import os
from unittest import TestCase
from unittest.mock import Mock,patch

from opentelemetry import trace
from services import telemetry


class TestTracer:
    def __init__(self):self.records=[]

    @contextmanager
    def start_as_current_span(self,name,*,context=None,attributes=None,record_exception=True,set_status_on_exception=True):
        parent=trace.get_current_span(context).get_span_context()
        span_context=trace.SpanContext(parent.trace_id if parent.is_valid else 1234,len(self.records)+1,
            is_remote=False,trace_flags=trace.TraceFlags(1))
        current=trace.NonRecordingSpan(span_context)
        record={'name':name,'parent':parent.span_id,'context':span_context,'attributes':attributes,
            'record_exception':record_exception,'set_status_on_exception':set_status_on_exception,'statuses':[]}
        current.set_status=record['statuses'].append
        current.set_attribute=lambda key,value:record['attributes'].update({key:value})
        self.records.append(record)
        with trace.use_span(current,end_on_exit=False,record_exception=False,set_status_on_exception=False):
            yield current


class OTelTests(TestCase):
    def setUp(self):
        self.enterContext(patch.dict(os.environ,{'DATA_ANALYST_OTEL_ENABLED':'1'}))
        self.tracer=TestTracer()
        self.get_tracer=self.enterContext(patch.object(trace,'get_tracer',return_value=self.tracer))

    def test_middleware_and_sql_worker_join_valid_parent_without_baggage_or_values(self):
        private='fixture-private-prompt-token-row'
        parent='00-'+'1'*32+'-'+'2'*16+'-01'
        async def app(scope,receive,send):
            token=telemetry.job_id.set('aj_fixture_job')
            try:
                def worker():
                    with telemetry.span('sql') as counts:counts['rows']=2
                with ThreadPoolExecutor(max_workers=1) as pool:pool.submit(copy_context().run,worker).result()
                await send({'type':'http.response.start','status':200,'headers':[]})
                await send({'type':'http.response.body','body':b'{}'})
            finally:telemetry.job_id.reset(token)
        sent=[]
        async def send(message):sent.append(message)
        scope={'type':'http','path':'/api/preflight','headers':[(b'traceparent',parent.encode()),
            (b'baggage',private.encode()),(b'authorization',private.encode())],'query_string':private.encode()}
        with self.assertLogs('analytics.events',level='INFO') as logs:
            asyncio.run(telemetry.TelemetryMiddleware(app)(scope,None,send))
        root,sql=self.tracer.records
        self.assertEqual(root['context'].trace_id,int('1'*32,16))
        self.assertEqual(root['parent'],int('2'*16,16))
        self.assertEqual(sql['parent'],root['context'].span_id)
        self.assertEqual(sql['attributes']['analytics.job_id'],'aj_fixture_job')
        events=[json.loads(record.message) for record in logs.records]
        self.assertTrue(all(e['trace_id']=='1'*32 for e in events))
        self.assertTrue(all(e['request_id']==events[0]['request_id'] for e in events))
        self.assertNotIn(private,str(self.tracer.records)+str(logs.output))
        self.assertNotIn('trace_id',str(telemetry.snapshot()))
        self.assertIsNone(telemetry.request_id.get())
        self.assertFalse(trace.get_current_span().get_span_context().is_valid)

    def test_disabled_is_noop_and_failure_never_records_exception_message(self):
        with patch.dict(os.environ,{'DATA_ANALYST_OTEL_ENABLED':'0'}),telemetry.span('sql'):pass
        self.get_tracer.assert_not_called()
        with self.assertRaisesRegex(ValueError,'private-error'):
            with telemetry.span('sql'):raise ValueError('private-error')
        record=self.tracer.records[-1]
        self.assertFalse(record['record_exception']);self.assertFalse(record['set_status_on_exception'])
        self.assertEqual(record['statuses'][0].status_code,trace.StatusCode.ERROR)
        self.assertIsNone(record['statuses'][0].description)
        self.assertNotIn('private-error',str(record))

    def test_invalid_or_duplicate_traceparents_do_not_attach_external_context(self):
        for headers in [[(b'traceparent',b'private-invalid')],
                        [(b'traceparent',b'00-'+b'0'*32+b'-'+b'0'*16+b'-01')],
                        [(b'traceparent',b'x'),(b'traceparent',b'y')]]:
            parent=telemetry._request_parent({'headers':headers})
            self.assertFalse(trace.get_current_span(parent).get_span_context().is_valid)

    def test_optional_tracer_failure_does_not_replace_business_result_or_exception(self):
        before=telemetry.snapshot()['dropped_events']
        self.get_tracer.side_effect=RuntimeError('private SDK failure')
        with telemetry.span('sql') as count:count['rows']=1
        with self.assertRaisesRegex(ValueError,'business failure'):
            with telemetry.span('sql'):raise ValueError('business failure')
        self.assertEqual(telemetry.snapshot()['dropped_events']-before,2)
