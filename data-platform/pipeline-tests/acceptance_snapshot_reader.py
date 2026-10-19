"""Real column-only reader, recursive locks, TRUNCATE race, captured intent.

Only the explicitly isolated v34_snapshot fixture database is used. Source
fixtures include a private column to prove that fixing locks adds no PII read.
"""
from contextlib import contextmanager
from datetime import date
import json
from pathlib import Path
import threading
import time
from unittest import TestCase
from unittest.mock import patch, Mock

import psycopg2
from psycopg2 import sql
import psycopg2.extras
from integration_sync_pg import connect
from services import query_execution_batch as batch
from tools.deploy_v34_governance import snapshot_guard_sql


class SnapshotReaderPostgresTests(TestCase):
    @classmethod
    def setUpClass(cls):
        admin=connect('postgres',autocommit=True)
        with admin.cursor() as q:
            q.execute("SELECT 1 FROM pg_database WHERE datname='v34_snapshot'")
            if q.fetchone() is None:q.execute('CREATE DATABASE v34_snapshot')
            q.execute("SELECT 1 FROM pg_roles WHERE rolname='v34_snapshot_reader'")
            if q.fetchone() is None:q.execute("CREATE ROLE v34_snapshot_reader LOGIN PASSWORD 'fixture-only' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS")
            q.execute("SELECT 1 FROM pg_roles WHERE rolname='avengers_analytics_reader'")
            if q.fetchone() is None:q.execute('CREATE ROLE avengers_analytics_reader NOLOGIN')
            q.execute('GRANT avengers_analytics_reader TO v34_snapshot_reader')
        admin.close()
        from services.analysis_catalog import CATALOG_PATH
        overlay=json.loads(Path(CATALOG_PATH).read_text())
        c=connect('v34_snapshot',autocommit=True)
        with c.cursor() as q:
            q.execute('CREATE SCHEMA IF NOT EXISTS analytics; CREATE SCHEMA IF NOT EXISTS silver; CREATE SCHEMA IF NOT EXISTS v34_snapshot_raw')
            for name, definition in overlay['silver_tables'].items():
                columns=[]
                for field,meta in definition['columns'].items():
                    declared=str(meta.get('type','text')).lower()
                    physical='numeric' if any(n in declared for n in ['numeric','decimal','integer','smallint','bigint','double','float']) else 'timestamp' if 'timestamp' in declared else 'text'
                    columns.append(sql.SQL('{} {}').format(sql.Identifier(field),sql.SQL(physical)))
                columns.append(sql.SQL('private_fixture_secret text'))
                leaf=name.split('.')[1]
                q.execute(sql.SQL('CREATE TABLE IF NOT EXISTS v34_snapshot_raw.{} ({})').format(sql.Identifier(leaf),sql.SQL(',').join(columns)))
                q.execute(sql.SQL('CREATE OR REPLACE VIEW silver.{} AS SELECT * FROM v34_snapshot_raw.{}').format(sql.Identifier(leaf),sql.Identifier(leaf)))
                safe=[field for field in definition['columns'] if field not in {'email','so_dien_thoai','ho_ten','dia_chi'}]
                q.execute(sql.SQL('GRANT SELECT ({}) ON {} TO avengers_analytics_reader').format(sql.SQL(',').join(map(sql.Identifier,safe)),sql.Identifier('silver',leaf)))
            q.execute('GRANT USAGE ON SCHEMA silver,analytics TO avengers_analytics_reader')
            q.execute('CREATE TABLE IF NOT EXISTS analytics.ingestion_checkpoints(dataset_id text,generation bigint,schema_fingerprint text)')
            q.execute('GRANT SELECT ON analytics.ingestion_checkpoints TO avengers_analytics_reader')
            q.execute(snapshot_guard_sql())
        c.close()

    def reader(self):
        c=psycopg2.connect(host='127.0.0.1',port=5432,user='v34_snapshot_reader',password='fixture-only',dbname='v34_snapshot',
            cursor_factory=psycopg2.extras.RealDictCursor,options='-c default_transaction_read_only=on',connect_timeout=2)
        self.addCleanup(c.close)
        return c

    def setUp(self):
        c=connect('v34_snapshot')
        with c.cursor() as q:
            q.execute('DELETE FROM v34_snapshot_raw.don_hang; DELETE FROM v34_snapshot_raw.chi_nhanh')
            q.execute("INSERT INTO v34_snapshot_raw.chi_nhanh(ma_chi_nhanh,ten_chi_nhanh,thanh_pho) VALUES ('sA','Fixture A','Hà Nội'),('sB','Fixture B','Hồ Chí Minh')")
            q.execute("INSERT INTO v34_snapshot_raw.don_hang(ma_don_hang,co_so_ma,tong_tien,trang_thai_don_hang,ngay_tao,phuong_thuc_thanh_toan,loai_don_hang,private_fixture_secret) VALUES ('a','sA',100,'HOAN_THANH','2026-09-03','TIEN_MAT','DUNG_TAI_CHO','private-value'),('b','sB',200,'DANG_GIAO','2026-09-12','TIEN_MAT','DUNG_TAI_CHO','private-value'),('c','sB',900,'DA_XAC_NHAN','2026-09-13','TIEN_MAT','DUNG_TAI_CHO','private-value')")
        c.commit();c.close()
        @contextmanager
        def connection():
            value=self.reader()
            try:yield value
            finally:value.rollback()
        self.enterContext(patch.object(batch,'connection',connection))
        self.enterContext(patch('db.connection_credentials',return_value=('v34_snapshot_reader','fixture-only')))
        self.enterContext(patch('db.DB_HOST','127.0.0.1'))
        self.enterContext(patch('db.DB_NAME','v34_snapshot'))
        self.enterContext(patch('services.data_coverage_service.peek',return_value={}))

    def sql_budget(self,contract=None):
        from services.analytical_capacity_planner import QueryBudget,request_sql_budget
        budget=QueryBudget(contract)
        token=request_sql_budget.set(budget)
        self.addCleanup(request_sql_budget.reset,token)
        return budget

    def test_catalog_structure_is_readable_while_replica_replacement_holds_exclusive_lock(self):
        from services.metadata_service import _introspect
        writer=connect('v34_snapshot')
        self.addCleanup(writer.close)
        with writer.cursor() as cursor:
            cursor.execute('CREATE TABLE IF NOT EXISTS v34_snapshot_raw.v35_metadata_demo (id integer PRIMARY KEY,amount numeric)')
            cursor.execute('CREATE OR REPLACE VIEW silver.v35_metadata_demo AS SELECT id,amount FROM v34_snapshot_raw.v35_metadata_demo')
        writer.commit()
        with writer.cursor() as cursor:
            cursor.execute('LOCK TABLE v34_snapshot_raw.v35_metadata_demo IN ACCESS EXCLUSIVE MODE')
        @contextmanager
        def reader():
            connection=connect('v34_snapshot')
            connection.cursor_factory=psycopg2.extras.RealDictCursor
            with connection.cursor() as cursor:
                cursor.execute("SET lock_timeout='100ms'; SET statement_timeout='1s'")
            connection.commit()
            try:yield connection
            finally:connection.close()
        try:
            metadata=_introspect(reader,['v34_snapshot_raw','silver'])
            self.assertIn('silver.v35_metadata_demo',metadata['table_map'])
            self.assertEqual(metadata['table_map']['v34_snapshot_raw.v35_metadata_demo']['primary_key'],['id'])
        finally:
            writer.rollback()

    def test_reader_metadata_cache_and_executor_share_budget_without_double_count(self):
        import db
        from services import metadata_service,sql_service
        budget=self.sql_budget()
        with patch.object(metadata_service,'_cache',{}):
            metadata_service.get_local_metadata(force=True)
            self.assertEqual(budget.snapshot()['metadata_attempts'],5)
            metadata_service.get_local_metadata()
            self.assertEqual(budget.snapshot()['metadata_attempts'],5)
        with db.get_db_conn() as c:
            with c.cursor() as q:
                q.execute('SET LOCAL statement_timeout=1000')
                q.execute('SELECT generate_series(1,3) AS value')
                self.assertEqual(len(q.fetchmany(1)),1)
                self.assertEqual(len(list(q)),2)
                self.assertIsNone(q.fetchone())
        with db.get_db_conn() as c:
            with c.cursor() as q:
                with self.assertRaises(psycopg2.errors.UndefinedColumn):q.execute('SELECT missing_fixture_column')
            c.rollback()
        self.assertTrue(sql_service.dry_run_sql('SELECT 1 AS value')[0])
        self.assertEqual(sql_service.execute_read_only('SELECT 1 AS value')['count'],1)
        measured=budget.snapshot()
        self.assertEqual(measured['attempted'],9)
        self.assertEqual(measured['direct_reader_attempts'],2)
        self.assertEqual((measured['execute_attempts'],measured['dry_run_attempts']),(1,1))
        self.assertEqual((measured['successful'],measured['failed'],measured['reserved']),(8,1,0))
        self.assertNotIn('missing_fixture_column',str(measured))
        self.assertGreater(measured['fetched_rows'],4)

    def test_reader_attempt_failure_fetch_failure_and_population_bounds_are_counted(self):
        import db
        from services.analytical_capacity_planner import AnalyticalCapacityContract
        from services.analysis_catalog import AnalysisError
        budget=self.sql_budget(AnalyticalCapacityContract(execution_rows=1,operations=1))
        with db.get_db_conn() as c:
            with c.cursor() as q:q.execute('SELECT 1')
            with self.assertRaises(psycopg2.InterfaceError):q.fetchone()
            for _ in range(3):
                with c.cursor() as q:
                    with self.assertRaises(psycopg2.errors.UndefinedColumn):q.execute('SELECT missing_fixture_column')
                c.rollback()
            with c.cursor() as q:
                q.execute('SELECT generate_series(1,3) AS value')
                with self.assertRaises(AnalysisError):q.fetchall()
            with c.cursor() as q:
                with self.assertRaises(AnalysisError):q.execute('SELECT 99')
                self.assertIsNone(q.query)  # Rejected before sending to PostgreSQL.
        measured=budget.snapshot()
        self.assertEqual(measured['attempted'],5)
        self.assertEqual(measured['failed'],5)
        self.assertEqual(measured['fetched_rows'],2)
        self.assertTrue(measured['limited'])

    def test_direct_lock_fails_but_guard_locks_underlying_relations_without_private_read(self):
        c=self.reader()
        with c.cursor() as q:
            q.execute('SELECT tong_tien FROM silver.don_hang')
            self.assertEqual(len(q.fetchall()),3)
        c.rollback()
        with self.assertRaises(psycopg2.errors.InsufficientPrivilege):
            with c.cursor() as q:q.execute('LOCK TABLE silver.don_hang IN ACCESS SHARE MODE')
        c.rollback()
        with self.assertRaises(psycopg2.errors.InsufficientPrivilege):
            with c.cursor() as q:q.execute('SELECT private_fixture_secret FROM silver.don_hang')
        c.rollback()
        with batch.report_snapshot({'silver.don_hang','silver.chi_nhanh'}) as snapshot:
            self.assertTrue(snapshot)
            # Inspect only fixture-owned lock metadata using the fixture admin.
            observer=connect('v34_snapshot')
            with observer.cursor() as q:
                q.execute("SELECT c.relname FROM pg_locks l JOIN pg_class c ON c.oid=l.relation JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='v34_snapshot_raw' AND l.mode='AccessShareLock' AND l.granted")
                self.assertTrue({'don_hang','chi_nhanh'} <= {row[0] for row in q.fetchall()})
            observer.close()
        with c.cursor() as q:
            q.execute('SELECT * FROM analytics.snapshot_lock__don_hang')
            self.assertEqual(q.fetchall(),[])
        c.rollback()
        with self.assertRaises(psycopg2.errors.InsufficientPrivilege):
            with c.cursor() as q:q.execute('SELECT tong_tien FROM v34_snapshot_raw.don_hang')

    def test_snapshot_lock_blocks_truncate_until_report_ends(self):
        with batch.report_snapshot({'silver.don_hang'}):
            writer=connect('v34_snapshot')
            with writer.cursor() as q:
                q.execute("SET LOCAL lock_timeout='100ms'")
                with self.assertRaises(psycopg2.errors.LockNotAvailable):q.execute('TRUNCATE v34_snapshot_raw.don_hang')
            writer.rollback();writer.close()

    def test_waiting_guard_does_not_establish_a_snapshot_before_concurrent_replace_commits(self):
        writer=connect('v34_snapshot')
        with writer.cursor() as q:
            q.execute('TRUNCATE v34_snapshot_raw.don_hang')
            q.execute("INSERT INTO v34_snapshot_raw.don_hang(ma_don_hang,tong_tien) VALUES ('replacement',777)")
        observed=[];errors=[]
        def read():
            try:
                with batch.report_snapshot({'silver.don_hang'}):
                    # Import the exported snapshot into another real reader.
                    c=self.reader();batch.begin(c,1000)
                    with c.cursor() as q:
                        q.execute('SELECT sum(tong_tien) AS total FROM silver.don_hang')
                        observed.append(q.fetchone()['total'])
                    c.rollback()
            except Exception as exc:errors.append(type(exc).__name__)
        worker=threading.Thread(target=read);worker.start()
        time.sleep(.15)
        self.assertTrue(worker.is_alive(),errors)
        writer.commit();writer.close();worker.join(3)
        self.assertFalse(worker.is_alive());self.assertEqual(errors,[])
        self.assertEqual(observed,[777])

    def test_all_captured_server_compiled_queries_execute_on_column_only_reader(self):
        from tests import test_hybrid_v28 as f
        from services.analysis_pipeline import AnalysisPipeline
        from services.sql_service import execute_read_only
        from services.analysis_catalog import AnalysisCatalog
        capture=json.loads((Path('/app/tests/fixtures/v34_runtime_overview_intent.json')).read_text())
        catalog=AnalysisCatalog(f.physical_metadata())
        # Proposal preparation and final execution use the production compiler
        # and production run_batch; the provider is never invoked here.
        pipeline=AnalysisPipeline(metadata_loader=f.physical_metadata,executor=execute_read_only,
            provider=f.scripted(capture['intent']),value_lookup=Mock(return_value=[]),owner_id='fixture-snapshot')
        agent=pipeline.agent(catalog,date(2026,10,18))
        agent.queries.proposal=False
        agent.queries.enforce_discovery=False  # Captured server plans, not fresh model input.
        with patch('services.sql_service.get_db_conn',side_effect=self.reader):
            prepared={item['id']:agent.queries.prepare(item) for item in capture['queries']}
            artifacts,omitted=agent.queries.run_batch(prepared,allow_supporting_failure=True)
        self.assertEqual(omitted,{})
        self.assertEqual(len(artifacts),len(capture['queries']))
        requested=[artifact for artifact in artifacts.values() if artifact.query.role=='requested']
        self.assertEqual(requested[0].result['rows'],[{'revenue':300.0}])
        self.assertEqual(pipeline.provider.call_count,0)

    def test_period_comparison_and_ranked_companion_on_real_column_only_reader(self):
        from tests import test_hybrid_v28 as f
        from services.analysis_pipeline import AnalysisPipeline
        from services.sql_service import execute_read_only
        from services.analytical_capacity_planner import QueryBudget,request_sql_budget
        admin=connect('v34_snapshot')
        with admin.cursor() as q:
            q.execute("INSERT INTO v34_snapshot_raw.don_hang(ma_don_hang,co_so_ma,tong_tien,trang_thai_don_hang,ngay_tao) VALUES ('aug','sA',40,'HOAN_THANH','2026-08-15'),('cancel','sB',80,'DA_HUY','2026-09-15')")
            for i in range(10):
                q.execute("INSERT INTO v34_snapshot_raw.don_hang(ma_don_hang,co_so_ma,tong_tien,trang_thai_don_hang,ngay_tao) VALUES (%s,'sA',1,'DANG_GIAO','2026-09-15')",('pending_'+str(i),))
        admin.commit();admin.close()
        scenarios=[
            ('So sánh doanh thu tháng 8 với tháng 9 năm 2026',f.requirement(
                metric_ids=['revenue'],dimension_ids=[],analysis_kind='aggregate',ranking=None,
                derived_features=[],time={'kind':'month','year':2026,'month':9},
                comparison_time={'kind':'range','start':'2026-08-01','end':'2026-08-31'})),
            ('Top 1 chi nhánh có tỷ lệ hủy đơn cao nhất tháng 9 năm 2026, kèm số đơn để xem quy mô.',
                f.requirement(metric_ids=['order_cancellation_rate','order_count'],dimension_ids=['store'],
                    analysis_kind='ranking',ranking={'limit':1,'metric_id':'order_cancellation_rate'},
                    derived_features=[],time={'kind':'month','year':2026,'month':9}))]
        for question,requirement in scenarios:
            token=request_sql_budget.set(QueryBudget())
            try:
                pipeline=AnalysisPipeline(metadata_loader=f.physical_metadata,executor=execute_read_only,
                    provider=f.scripted(f.envelope(requirement)),value_lookup=Mock(return_value=[]),owner_id='fixture-snapshot')
                request=f.AiTextToReportRequest(question=question,reference_date=date(2026,10,18),refresh=True,analysis_depth='focused')
                with patch('services.sql_service.get_db_conn',side_effect=self.reader), \
                     patch('requests.sessions.Session.request',side_effect=AssertionError('External HTTP forbidden')):
                    report=pipeline.generate(f.approve(request,pipeline.propose(request)))
                self.assertEqual(report['verification']['status'],'verified')
                if requirement.get('comparison_time'):
                    evidence=next(e for e in report['evidence'] if e['feature']=='period_comparison')
                    # September includes ten additional valid DANG_GIAO rows.
                    self.assertEqual((evidence['values']['current'],evidence['values']['baseline'],evidence['values']['delta']),
                        (310,40,270))
                else:
                    companion=next(q for q in report['analytical_queries'] if q.get('cohort_query_id'))
                    rows=report['result_sets'][companion['id']]['rows']
                    self.assertEqual(len(rows),1)
                    self.assertEqual((rows[0]['store_id'],rows[0]['order_count']),('sB',3))
                    primary=report['result_sets'][companion['cohort_query_id']]['rows']
                    self.assertEqual(primary[0]['order_cancellation_rate'],100)
                self.assertEqual(pipeline.provider.call_count,1)
            finally:request_sql_budget.reset(token)

    def test_public_propose_generate_with_recorded_interpretation_and_real_restricted_reader(self):
        from tests import test_hybrid_v28 as f
        from services.analysis_pipeline import AnalysisPipeline
        from services.sql_service import execute_read_only
        from services.analytical_capacity_planner import QueryBudget,request_sql_budget
        from services import telemetry
        for variable,value in [(request_sql_budget,QueryBudget()),(telemetry.request_id,'req_snapshot_trace'),
                (telemetry.job_id,'aj_snapshot_trace')]:
            token=variable.set(value);self.addCleanup(variable.reset,token)
        capture=json.loads(Path('/app/tests/fixtures/v34_runtime_overview_intent.json').read_text())
        pipeline=AnalysisPipeline(metadata_loader=f.physical_metadata,executor=execute_read_only,
            provider=f.scripted(capture['intent']),value_lookup=Mock(return_value=[]),owner_id='fixture-snapshot')
        request=f.AiTextToReportRequest(question=capture['question'],reference_date=date(2026,10,18),refresh=True)
        with patch('services.sql_service.get_db_conn',side_effect=self.reader),self.assertLogs('analytics.events',level='INFO') as trace:
            proposal=pipeline.propose(request)
            report=pipeline.generate(f.approve(request,proposal))
        self.assertEqual(report['status'],'success')
        self.assertEqual(report['verification']['status'],'verified')
        self.assertIn('300',report['conclusion']['answer'])
        self.assertEqual(pipeline.provider.call_count,1)  # One offline scripted response, zero HTTP.
        self.assertEqual(report['diagnostics']['request_id'],'req_snapshot_trace')
        budget=report['diagnostics']['sql_budget']
        self.assertGreater(budget['execute_attempts'],0)
        self.assertEqual(budget['execute_attempts'],report['diagnostics']['db_query_count'])
        self.assertEqual(budget['dry_run_attempts'],report['diagnostics']['dry_run_count'])
        self.assertEqual(budget['attempted'],budget['successful']);self.assertEqual(budget['reserved'],0)
        self.assertEqual(budget['metadata_attempts'],0)
        events=[json.loads(row.getMessage()) for row in trace.records]
        self.assertTrue({'sql','sql_dry_run','db_fetch'} <= {row['stage'] for row in events})
        self.assertTrue(all(row['request_id']=='req_snapshot_trace' and row['job_id']=='aj_snapshot_trace' for row in events))
        from routers import reports
        from types import SimpleNamespace
        from services.session_service import get_session
        session=get_session(report['session_id'])
        self.assertTrue(all('data' not in c for c in session.report_response['charts']))
        with patch('routers.reports._principal',return_value=SimpleNamespace(bound_owner='fixture-snapshot')), \
             patch('services.access_policy.current_principal',return_value=SimpleNamespace()), \
             patch('services.analysis_pipeline.AnalysisPipeline.catalog',return_value=pipeline.catalog()), \
             patch('services.sql_service.execute_read_only',side_effect=AssertionError('Save restoration must not execute SQL')):
            restored=reports._authoritative_report({'session_id':report['session_id'],'charts':[]})
        self.assertEqual(restored['charts'],report['charts'])
        self.assertEqual(restored['conclusion'],report['conclusion'])
        self.assertTrue(all('data' not in c for c in session.report_response['charts']))

