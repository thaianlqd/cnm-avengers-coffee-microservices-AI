"""Actual FastAPI report routes + account policy + PostgreSQL ownership/audit.

Run explicitly with the API image, no provider or real database configuration.
Semantic SQL validation is covered separately; this fixture tests persistence
boundaries with an explicitly stubbed approved SQL policy decision.
"""
from copy import deepcopy
import json
from pathlib import Path
import os
import sys
from unittest import TestCase
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'pipeline-tests'))
import integration_sync_pg as pg
import psycopg2.extras
from fastapi import FastAPI
from routers import reports
from services import access_policy as access
from tests.http_fixture import ASGIClient
from tests.test_v34_access_policy import SECRET,token


class ApiOwnershipPostgresTests(TestCase):
    @classmethod
    def setUpClass(cls):
        admin=pg.connect('postgres',autocommit=True)
        with admin.cursor() as cursor:
            cursor.execute("SELECT 1 FROM pg_database WHERE datname='v34_ownership'")
            if cursor.fetchone() is None:cursor.execute('CREATE DATABASE v34_ownership')
        admin.close()
        conn=pg.connect('v34_ownership',autocommit=True)
        try:
            with conn.cursor() as cursor:
                cursor.execute('CREATE SCHEMA IF NOT EXISTS analytics; CREATE SCHEMA IF NOT EXISTS silver; '
                    'CREATE TABLE IF NOT EXISTS analytics.saved_reports ('
                    'id text PRIMARY KEY,title text NOT NULL,description text,category text,query_type text,sql_query text,'
                    'visualization_type text,x_key text,y_key text,ai_summary text,created_by text,module_config jsonb,'
                    'created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now())')
                for migration in ('026_analysis_modules.sql','027_platform_governance.sql'):
                    cursor.execute((ROOT/'analytics-api/migrations'/migration).read_text())
        finally:conn.close()

    def connection(self):
        conn=pg.connect('v34_ownership')
        conn.cursor_factory=psycopg2.extras.RealDictCursor
        self.connections.append(conn)
        return conn

    def setUp(self):
        self.connections=[]
        self.addCleanup(lambda:[conn.close() for conn in self.connections])
        conn=self.connection()
        with conn.cursor() as cursor:cursor.execute('DELETE FROM analytics.saved_reports; DELETE FROM analytics.audit_events')
        conn.commit()
        self.policy={'version':'fixture-ownership-v1','roles':{
            'ANALYST':{'permissions':['analytics.read','reports.save','reports.export','sql.explore'],
                'datasets':['*'],'national':True}},'subjects':{}}
        for target,value in [('services.access_policy.load_policy',lambda:self.policy),
                ('routers.reports.get_db_conn',self.connection),('db.get_report_writer_conn',self.connection)]:
            patcher=patch(target,side_effect=value);patcher.start();self.addCleanup(patcher.stop)
        approved=patch('services.report_sql_policy.validate_saved_payload',return_value=None)
        approved.start();self.addCleanup(approved.stop)
        environment=patch.dict(os.environ,{'DATA_ANALYST_ALLOW_BROWSER_OWNER':'0',
            'DATA_ANALYST_AUTH_ALLOW_LEGACY_JWT':'1','DATA_ANALYST_IDENTITY_JWT_SECRET':SECRET})
        environment.start();self.addCleanup(environment.stop)
        app=FastAPI();app.add_middleware(access.AccessMiddleware);app.include_router(reports.router)
        self.client=ASGIClient(app)

    def headers(self,subject='account-A'):
        return {'Authorization':'Bearer '+token({'sub':subject,'role':'ANALYST','exp':4000000000})}

    def save(self,subject='account-A'):
        response=self.client.request('POST','/api/reports/saved',headers=self.headers(subject),json={
            'title':'Fixture owned report','sql_query':'SELECT COUNT(*) FROM silver.don_hang',
            'created_by':'account-B-client-spoof'})
        self.assertEqual(response.status_code,200,response.text)
        return response.json()['id']

    def test_data_epoch_stays_pinned_in_repeatable_read_and_detects_next_generation(self):
        from services.query_execution_batch import read_data_epoch
        from services.verification_reconciliation_service import compare_epochs
        writer = self.connection()
        with writer.cursor() as cursor:
            cursor.execute("INSERT INTO analytics.ingestion_checkpoints(dataset_id,generation,schema_fingerprint) "
                "VALUES ('replica.orders.don_hang',10,%s) ON CONFLICT(dataset_id) "
                "DO UPDATE SET generation=10,schema_fingerprint=EXCLUDED.schema_fingerprint", ('a'*64,))
        writer.commit()
        reader = self.connection()
        reader.set_session(isolation_level='REPEATABLE READ', readonly=True)
        with reader.cursor() as cursor:
            cursor.execute('SET LOCAL ROLE avengers_analytics_reader')
            before = read_data_epoch(cursor, ['silver.don_hang'])
            self.assertEqual(before['sources'][0]['generation'], 10)
            with writer.cursor() as changed:
                changed.execute("UPDATE analytics.ingestion_checkpoints SET generation=11 "
                    "WHERE dataset_id='replica.orders.don_hang'")
            writer.commit()
            pinned = read_data_epoch(cursor, ['silver.don_hang'])
            self.assertEqual(pinned['fingerprint'], before['fingerprint'])
        reader.rollback()
        with reader.cursor() as cursor:
            cursor.execute('SET LOCAL ROLE avengers_analytics_reader')
            after = read_data_epoch(cursor, ['silver.don_hang'])
        reader.rollback()
        self.assertEqual(after['sources'][0]['generation'], 11)
        self.assertEqual(compare_epochs(before, after)['status'], 'incomparable_snapshot')

    def test_missing_generation_is_not_measured_and_keeps_transaction_usable(self):
        from services.query_execution_batch import read_data_epoch
        connection = self.connection()
        with connection.cursor() as cursor:
            cursor.execute("DELETE FROM analytics.ingestion_checkpoints WHERE dataset_id='replica.orders.chi_tiet_don_hang'")
            actual = read_data_epoch(cursor, ['silver.chi_tiet_don_hang'])
            self.assertEqual(actual['status'], 'not_measured')
            cursor.execute('SELECT 1 AS still_usable')
            self.assertEqual(cursor.fetchone()['still_usable'], 1)
        connection.rollback()

    def test_user_a_cannot_list_read_delete_or_download_user_b_report(self):
        identity=self.save('account-B')
        self.assertEqual(self.client.get('/api/reports/saved',headers=self.headers()).json()['total'],0)
        for method,suffix in [('GET',''),('DELETE',''),('GET','/download-docx')]:
            with self.subTest(method=method,suffix=suffix):
                response=self.client.request(method,'/api/reports/saved/'+identity+suffix,headers=self.headers())
                self.assertEqual(response.status_code,404,response.text)
        self.assertEqual(self.client.get('/api/reports/saved/'+identity,headers=self.headers('account-B')).status_code,200)

    def test_created_by_spoof_is_ignored_and_owner_policy_are_persisted_with_durable_audit(self):
        identity=self.save()
        conn=self.connection()
        with conn.cursor() as cursor:
            cursor.execute('SELECT owner_key,owner_type,access_policy_fingerprint,created_by FROM analytics.saved_reports WHERE id=%s',(identity,))
            row=cursor.fetchone()
            self.assertEqual(row['owner_type'],'account')
            self.assertEqual(row['owner_key'],row['created_by'])
            self.assertNotEqual(row['created_by'],'account-B-client-spoof')
            self.assertEqual(len(row['access_policy_fingerprint']),64)
            cursor.execute("SELECT actor_key,action,decision,details FROM analytics.audit_events WHERE resource_key=%s",(identity,))
            audit=cursor.fetchone()
            self.assertEqual(audit['actor_key'],row['owner_key'])
            self.assertEqual(audit['action'],'report.save')
            self.assertEqual(audit['decision'],'allowed')
            self.assertEqual(audit['details'],{})

    def test_audit_lost_commit_ack_replays_once_with_insert_only_writer_and_original_time(self):
        from services import telemetry
        from tempfile import TemporaryDirectory
        principal=access.principal_for({'subject':'fixture-audit','role':'ANALYST','expires_at':4000000000},self.policy)
        context=access.active_principal.set(principal);self.addCleanup(access.active_principal.reset,context)
        def writer():
            conn=self.connection()
            with conn.cursor() as cursor:cursor.execute('SET ROLE avengers_report_writer')
            return conn
        class LostAck:
            def __init__(self):self.conn=writer()
            def cursor(self):return self.conn.cursor()
            def commit(self):self.conn.commit();raise OSError('fixture commit acknowledgement lost')
            def rollback(self):self.conn.rollback()
            def close(self):self.conn.close()
        with TemporaryDirectory() as folder,patch.dict(os.environ,{'DATA_ANALYST_AUDIT_SPOOL_DIR':folder}):
            identity=telemetry.audit('report.export','report',connection_factory=LostAck)
            pending=Path(folder)/(identity+'.json');record=json.loads(pending.read_text())
            telemetry.audit('report.export','report',connection_factory=writer)
            self.assertFalse(pending.exists())
            admin=self.connection()
            with admin.cursor() as cursor:
                cursor.execute('SELECT count(*) AS n,min(occurred_at) AS clock FROM analytics.audit_events WHERE event_id=%s',(identity,))
                row=cursor.fetchone();self.assertEqual(row['n'],1)
                self.assertEqual(row['clock'].isoformat(),record['occurred_at'])
        restricted=writer();restricted.commit()
        for statement in ('SELECT event_id FROM analytics.audit_events','DELETE FROM analytics.audit_events'):
            with self.subTest(statement=statement):
                with self.assertRaises(Exception) as caught:
                    with restricted.cursor() as cursor:cursor.execute(statement)
                self.assertEqual(caught.exception.pgcode,'42501');restricted.rollback()

    def test_legacy_reports_are_quarantined_and_first_login_does_not_claim_them(self):
        conn=self.connection()
        with conn.cursor() as cursor:
            cursor.execute("INSERT INTO analytics.saved_reports(id,title,created_by) VALUES ('legacy','Legacy','account-A')")
        conn.commit()
        self.assertEqual(self.client.get('/api/reports/saved',headers=self.headers()).json()['total'],0)
        self.assertEqual(self.client.get('/api/reports/saved/legacy',headers=self.headers()).status_code,404)
        self.policy['roles']['ANALYST']['permissions'].append('reports.legacy')
        self.assertEqual(self.client.get('/api/reports/saved/legacy',headers=self.headers()).status_code,200)
        self.assertEqual(self.client.request('DELETE','/api/reports/saved/legacy',headers=self.headers()).status_code,404)

    def test_policy_revocation_invalidates_saved_download_and_report_cache_ownership(self):
        identity=self.save()
        self.policy['subjects']['account-A']={'datasets':['silver.chi_nhanh']}
        self.assertEqual(self.client.get('/api/reports/saved/'+identity,headers=self.headers()).status_code,404)
        self.assertEqual(self.client.get('/api/reports/saved/'+identity+'/download-docx',headers=self.headers()).status_code,404)

    def test_privileged_audit_failure_prevents_actual_report_write(self):
        with patch('db.get_report_writer_conn',side_effect=RuntimeError('fixture audit down')):
            response=self.client.post('/api/reports/saved',headers=self.headers(),json={'title':'Blocked','sql_query':'SELECT 1'})
        self.assertEqual(response.status_code,503,response.text)
        conn=self.connection()
        with conn.cursor() as cursor:
            cursor.execute('SELECT count(*) AS total FROM analytics.saved_reports')
            self.assertEqual(cursor.fetchone()['total'],0)

    def test_client_cannot_export_arbitrary_or_foreign_session_payload(self):
        with patch('services.docx_service.generate_report_docx',side_effect=AssertionError('deny before document render')):
            response=self.client.post('/api/reports/export-docx',headers=self.headers(),json={
                'save_to_db':False,'report_data':{'session_id':'foreign-session','title':'forged','total':999}})
        self.assertEqual(response.status_code,404,response.text)
