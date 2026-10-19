"""Thread propagation and real SQL boundary telemetry without raw values."""
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from contextvars import copy_context
import json
from unittest import TestCase
from unittest.mock import MagicMock,patch

from fastapi import HTTPException
from services import telemetry
from services import sql_service as sql


class ObservabilityTests(TestCase):
    def setUp(self):
        for variable,value in [(telemetry.request_id,'req_trace_fixture'),(telemetry.job_id,'aj_trace_fixture')]:
            token=variable.set(value);self.addCleanup(variable.reset,token)
        @contextmanager
        def connection():
            conn=MagicMock();cursor=conn.cursor.return_value.__enter__.return_value
            cursor.description=[('value',None)]
            cursor.fetchmany.return_value=[{'value':'fixture-private-row'}]
            yield conn
        self.enterContext(patch.object(sql,'analytical_connection',connection))
        self.enterContext(patch('services.access_policy.authorize_sql',side_effect=lambda text:text))

    def test_physical_sql_dryrun_and_fetch_in_copied_threads_share_request_and_job_ids_without_values(self):
        with self.assertLogs('analytics.events',level='INFO') as logs:
            with ThreadPoolExecutor(max_workers=2) as workers:
                first=workers.submit(copy_context().run,sql.execute_read_only,"SELECT 'fixture-private-literal' AS value")
                second=workers.submit(copy_context().run,sql.dry_run_sql,'SELECT 1 AS value')
                self.assertEqual(first.result()['count'],1);self.assertTrue(second.result()[0])
        records=[json.loads(row.message) for row in logs.records]
        self.assertEqual({row['stage'] for row in records},{'sql','sql_dry_run','db_fetch'})
        self.assertTrue(all(row['request_id']=='req_trace_fixture' and row['job_id']=='aj_trace_fixture' for row in records))
        for stage in ['sql','sql_dry_run','db_fetch']:
            self.assertEqual([r['status'] for r in records if r['stage']==stage],['started','completed'])
        self.assertNotIn('fixture-private-literal',str(logs.output));self.assertNotIn('fixture-private-row',str(logs.output))
        metrics=telemetry.snapshot();self.assertNotIn('req_trace_fixture',str(metrics));self.assertNotIn('aj_trace_fixture',str(metrics))

    def test_authorization_and_readonly_rejection_have_zero_physical_sql_events(self):
        with patch('services.access_policy.authorize_sql',side_effect=HTTPException(403,'fixture deny')),patch.object(telemetry,'event') as event:
            with self.assertRaises(HTTPException):sql.execute_read_only('SELECT 1')
            event.assert_not_called()
        with patch.object(telemetry,'event') as event:
            with self.assertRaises(sql.SqlSafetyError):sql.execute_read_only('DELETE FROM forbidden_fixture')
            event.assert_not_called()

    def test_logging_outage_records_drops_without_breaking_readonly_result_or_exception_identity(self):
        before=telemetry.snapshot()['dropped_events']
        with patch('services.telemetry.logging.getLogger') as logger:
            logger.return_value.info.side_effect=RuntimeError('fixture logger unavailable')
            logger.return_value.error.side_effect=RuntimeError('fixture logger unavailable')
            self.assertEqual(sql.execute_read_only('SELECT 1 AS value')['count'],1)
            try:raise ValueError('private raw exception')
            except ValueError as error:
                self.assertEqual(telemetry.failure_diagnostic(error,action='generate')['exception_type'],'ValueError')
        self.assertEqual(telemetry.snapshot()['dropped_events']-before,5)

    def test_failed_sql_span_is_failed_and_preserves_exception_without_logging_message(self):
        with self.assertLogs('analytics.events',level='INFO') as logs:
            with self.assertRaisesRegex(ValueError,'fixture private failure'):
                with telemetry.span('sql'):raise ValueError('fixture private failure')
        records=[json.loads(row.message) for row in logs.records]
        self.assertEqual([r['status'] for r in records],['started','failed'])
        self.assertNotIn('fixture private failure',str(logs.output))


class QueryBudgetTests(TestCase):
    setUp=ObservabilityTests.setUp

    def budget(self,contract=None):
        from services.analytical_capacity_planner import QueryBudget,request_sql_budget
        budget=QueryBudget(contract);token=request_sql_budget.set(budget)
        self.addCleanup(request_sql_budget.reset,token)
        return budget

    def test_dry_run_and_execution_have_distinct_reserved_attempts_and_only_counts_are_reported(self):
        budget=self.budget()
        self.assertTrue(sql.dry_run_sql('SELECT 1 AS value')[0])
        self.assertEqual(sql.execute_read_only('SELECT 1 AS value')['count'],1)
        result=budget.snapshot()
        self.assertEqual((result['attempted'],result['dry_run_attempts'],result['execute_attempts']),(2,1,1))
        self.assertEqual((result['successful'],result['failed'],result['reserved']),(2,0,0))
        self.assertEqual(result['fetched_rows'],1);self.assertGreater(result['fetched_bytes'],0)
        self.assertEqual(result['metadata_attempts'],0);self.assertNotIn('fixture-private-row',str(result))

    def test_failed_attempts_exhaust_allowance_and_a_hidden_next_attempt_is_rejected_before_connection(self):
        from services.analytical_capacity_planner import AnalyticalCapacityContract
        from services.analysis_catalog import AnalysisError
        budget=self.budget(AnalyticalCapacityContract(operations=1))
        with patch.object(sql,'analytical_connection',side_effect=TimeoutError('fixture pool timeout')) as connection:
            for _ in range(5):self.assertFalse(sql.dry_run_sql('SELECT 1')[0])
            with self.assertRaises(AnalysisError) as caught:sql.execute_read_only('SELECT 1')
            self.assertEqual(caught.exception.category,'capacity_requires_choice')
            self.assertEqual(connection.call_count,5)
        result=budget.snapshot();self.assertEqual(result['attempted'],5);self.assertEqual(result['failed'],5)
        self.assertTrue(result['limited'])

    def test_concurrent_sql_workers_share_one_reservation_allowance(self):
        from services.analytical_capacity_planner import AnalyticalCapacityContract,query_attempt
        from services.analysis_catalog import AnalysisError
        budget=self.budget(AnalyticalCapacityContract())
        def attempt():
            try:
                with query_attempt('execute') as measured:measured.update(rows=1,bytes=8)
                return True
            except AnalysisError:return False
        with ThreadPoolExecutor(max_workers=8) as workers:
            results=[workers.submit(copy_context().run,attempt) for _ in range(100)]
            self.assertEqual(sum(f.result() for f in results),19)
        self.assertEqual(budget.snapshot()['attempted'],19)
        self.assertEqual(budget.snapshot()['fetched_rows'],19)

    def test_authorization_denial_reserves_no_sql_and_invalid_capacity_cannot_block_liveness_construction(self):
        from services.analysis_catalog import AnalysisError
        with patch.dict('os.environ',{'DATA_ANALYST_CAPACITY_OPERATIONS':'invalid'}):
            budget=self.budget()
            self.assertEqual(budget.snapshot()['attempted'],0)
            with patch.object(sql,'analytical_connection') as connection:
                with self.assertRaises(AnalysisError) as caught:sql.execute_read_only('SELECT 1')
                self.assertEqual(caught.exception.category,'capacity_configuration');connection.assert_not_called()
        budget=self.budget()
        with patch('services.access_policy.authorize_sql',side_effect=HTTPException(403,'fixture deny')):
            with self.assertRaises(HTTPException):sql.execute_read_only('SELECT 1')
        self.assertEqual(budget.snapshot()['attempted'],0)

    def test_result_capacity_refuses_publication_without_truncating_or_replaying_population(self):
        from services.analytical_capacity_planner import AnalyticalCapacityContract,query_attempt
        from services.analysis_catalog import AnalysisError
        budget=self.budget(AnalyticalCapacityContract(operations=1,execution_rows=1))
        with self.assertRaises(AnalysisError) as caught:
            with query_attempt('execute') as measured:measured.update(rows=2,bytes=2)
        self.assertEqual(caught.exception.category,'capacity_requires_choice')
        result=budget.snapshot();self.assertEqual(result['fetched_rows'],2);self.assertEqual(result['successful'],1)
        self.assertTrue(result['limited'])
