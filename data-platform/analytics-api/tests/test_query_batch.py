"""Scheduler isolation/dedup/cache cohorts and PostgreSQL transaction guards."""
from contextlib import contextmanager
from datetime import datetime, timezone, timedelta
from types import SimpleNamespace
from unittest import TestCase
from unittest.mock import Mock, patch
import threading
import time

from services.analytical_query_service import AnalyticalQueries
from services.query_execution_batch import snapshot_id, begin, connection, Connections
from services.provider_budget import request_deadline


class QueryBatchTests(TestCase):
    def queries(self, signatures):
        def transport(*args):raise AssertionError('Only scheduler fixture should run')
        q=AnalyticalQueries.__new__(AnalyticalQueries)
        q.executor=transport;q.proposal=False;q.diagnostics={'db_query_count':0}
        q.artifacts={};q.cache={};q.catalog=SimpleNamespace(fingerprint='catalog')
        artifacts={str(i):SimpleNamespace(signature=s,result_ref=None,
            query=SimpleNamespace(role='requested'),id=str(i),sql='SELECT COUNT(*) FROM silver.don_hang') for i,s in enumerate(signatures)}
        return q,artifacts,transport

    def test_unique_queries_run_at_most_two_and_worker_counters_merge(self):
        q,prepared,transport=self.queries(['a','b','c','a'])
        active=[0,0];lock=threading.Lock();forced=[]
        def run(local,a):
            # Duplicate rebound uses the already obtained result.
            if a.signature in local.cache:
                return a
            with lock:
                active[0]+=1;active[1]=max(active)
                forced.append(local.diagnostics['force_refresh'])
            time.sleep(.03)
            local.diagnostics['db_query_count']+=1
            with lock:active[0]-=1
            return a
        with patch('services.sql_service.execute_read_only',transport),\
             patch('services.query_execution_batch.report_snapshot',return_value=__import__('contextlib').nullcontext()),\
             patch('services.result_artifact_store.artifact_store',return_value=Mock(find=Mock(return_value=None))),\
             patch.object(AnalyticalQueries,'run',run):
            results,errors=q.run_batch(prepared)
        self.assertEqual(set(results),set(prepared));self.assertFalse(errors)
        self.assertEqual(q.diagnostics['db_query_count'],3)
        self.assertEqual(active[1],2);self.assertTrue(all(forced))

    def test_mixed_or_stale_cache_never_supplies_fresh_denominator(self):
        for cohorts,stale,expected in [(['same','same'],False,False),(['old','new'],False,True),(['same','same'],True,True)]:
            q,prepared,transport=self.queries(['a','b']);forced=[]
            for a,cohort in zip(prepared.values(),cohorts):
                a.result_ref={'provenance':dict(data_snapshot=cohort,
                    observed_at=(datetime.now(timezone.utc)-timedelta(days=1 if stale else 0)).isoformat())}
            def run(local,a):forced.append(local.diagnostics['force_refresh']);return a
            with patch('services.sql_service.execute_read_only',transport),\
                 patch('services.query_execution_batch.report_snapshot',return_value=__import__('contextlib').nullcontext()) as snapshot,\
                 patch.object(AnalyticalQueries,'run',run):
                q.run_batch(prepared)
            self.assertEqual(forced,[expected,expected]);self.assertEqual(snapshot.call_count,int(expected))

    def test_import_snapshot_and_timeout_use_remaining_request_budget(self):
        cursor=Mock();conn=Mock();conn.cursor.return_value.__enter__=Mock(return_value=cursor)
        conn.cursor.return_value.__exit__=Mock(return_value=False)
        s=snapshot_id.set('00000001-00000002-1');d=request_deadline.set(time.monotonic()+.1)
        try:begin(conn,4000)
        finally:snapshot_id.reset(s);request_deadline.reset(d)
        self.assertEqual(cursor.execute.call_args_list[1].args,('SET TRANSACTION SNAPSHOT %s',('00000001-00000002-1',)))
        timeout=cursor.execute.call_args_list[-1].args[1][0]
        self.assertGreater(timeout,0);self.assertLessEqual(timeout,100)

    def test_broken_connection_is_discarded_and_cancel_reaches_driver(self):
        conn=Mock(closed=False);conn.rollback.side_effect=RuntimeError('Broken')
        pooled=Mock(getconn=Mock(return_value=conn))
        with patch('services.query_execution_batch.pool',return_value=pooled):
            with connection():pass
        pooled.putconn.assert_called_once_with(conn,close=True)
        registry=Connections();registry.add(conn);registry.cancel();conn.cancel.assert_called_once()
        registry.remove(conn);registry.cancel();self.assertEqual(conn.cancel.call_count,1)
