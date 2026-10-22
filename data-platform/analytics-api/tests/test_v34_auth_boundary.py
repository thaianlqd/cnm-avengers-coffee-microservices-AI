"""Actual HTTP default-deny boundary and independent row-scope SQL execution."""
from contextlib import contextmanager, nullcontext
from copy import deepcopy
import os
import sqlite3
from unittest import TestCase
from unittest.mock import patch, MagicMock

from fastapi import FastAPI,HTTPException
from tests.http_fixture import ASGIClient as TestClient
from services import access_policy as access
from tests.test_v34_access_policy import POLICY,SECRET,token


class AuthBoundaryTests(TestCase):
    def setUp(self):
        self.policy=deepcopy(POLICY)
        self.policy['roles']['ANALYST']['datasets']=['silver.don_hang','silver.chi_nhanh','silver.chi_tiet_don_hang']
        self.policy['roles']['ANALYST']['permissions']+=['reports.export']
        self.policy['roles']['ADMIN']['permissions']+=['platform.read','pipeline.trigger','system.read','reports.export']
        self.environ=patch.dict(os.environ,{'DATA_ANALYST_ALLOW_BROWSER_OWNER':'0',
            'DATA_ANALYST_AUTH_ALLOW_LEGACY_JWT':'1','DATA_ANALYST_IDENTITY_JWT_SECRET':SECRET})
        self.environ.start();self.addCleanup(self.environ.stop)
        self.policy_patch=patch.object(access,'load_policy',side_effect=lambda:self.policy)
        self.policy_patch.start();self.addCleanup(self.policy_patch.stop)

    @contextmanager
    def account(self,*,admin=False):
        principal=access.principal_for({'subject':'fixture-user','role':'ADMIN' if admin else 'ANALYST','expires_at':4000000000},self.policy)
        value=access.active_principal.set(principal)
        try:yield principal
        finally:access.active_principal.reset(value)

    def app(self):
        app=FastAPI()
        app.add_middleware(access.AccessMiddleware)
        @app.get('/api/ai/status')
        def private():return {'owner':access.current_principal(required=True).bound_owner}
        @app.post('/api/ai/preflight')
        def mutate():return {'ok':True}
        @app.get('/api/system/users')
        def users():return {'users':[]}
        return TestClient(app)

    def test_actual_server_all_registered_api_routes_reject_missing_identity_before_io(self):
        import server
        client=TestClient(server.app)
        public={'/api/health','/api/readiness','/api/auth/session','/api/auth/login','/api/auth/logout'}
        tested=0
        with patch('psycopg2.connect',side_effect=AssertionError('unauthorized must not access DB')):
            for route in server.app.routes:
                path=getattr(route,'path','')
                if not path.startswith('/api/') or path in public:continue
                for method in (getattr(route,'methods',set())-{'HEAD','OPTIONS'}):
                    with self.subTest(path=path,method=method):
                        result=client.request(method,path,json={})
                        self.assertEqual(result.status_code,401,result.text[:200])
                        tested+=1
        self.assertGreater(tested,40)

    def test_roles_and_runtime_revocation_are_rechecked_on_every_http_request(self):
        client=self.app()
        headers={'Authorization':'Bearer '+token()}
        self.assertEqual(client.get('/api/ai/status',headers=headers).status_code,200)
        self.assertEqual(client.get('/api/system/users',headers=headers).status_code,403)
        self.policy['subjects']['fixture-user']['disabled']=True
        self.assertEqual(client.get('/api/ai/status',headers=headers).status_code,403)

    def test_cookie_writes_require_explicit_allowed_origin_and_production_cannot_enable_browser_fallback(self):
        client=self.app()
        client.cookies.set(access.AUTH_COOKIE,token())
        self.assertEqual(client.post('/api/ai/preflight').status_code,403)
        self.assertEqual(client.post('/api/ai/preflight',headers={'Origin':'https://evil.example'}).status_code,403)
        self.assertEqual(client.post('/api/ai/preflight',headers={'Origin':'http://testserver'}).status_code,200)
        with patch.dict(os.environ,{'DATA_ANALYST_ENV':'production','DATA_ANALYST_ALLOW_BROWSER_OWNER':'1'}):
            self.assertFalse(access.development_fallback())

    def test_mandatory_scope_is_server_owned_and_cannot_be_removed_by_or_predicate(self):
        conn=sqlite3.connect(':memory:')
        self.addCleanup(conn.close)
        conn.executescript("ATTACH DATABASE ':memory:' AS silver; CREATE TABLE silver.don_hang(ma_don_hang text,co_so_ma text,tong_tien numeric); "
            "INSERT INTO silver.don_hang VALUES ('o1','s1',10),('o2','s2',20),('o3','denied',900);")
        with self.account():
            for query in ('SELECT SUM(tong_tien) FROM silver.don_hang',
                'SELECT SUM(d.tong_tien) FROM silver.don_hang d WHERE 1=1 OR co_so_ma=\'denied\'',
                'SELECT SUM(silver.don_hang.tong_tien) FROM silver.don_hang'):
                with self.subTest(query=query):
                    narrowed=access.authorize_sql(query)
                    self.assertEqual(conn.execute(narrowed).fetchone()[0],30)

    def test_indirect_order_scope_and_dataset_denial_have_no_national_fallback(self):
        conn=sqlite3.connect(':memory:')
        self.addCleanup(conn.close)
        conn.executescript("ATTACH DATABASE ':memory:' AS silver; CREATE TABLE silver.don_hang(ma_don_hang text,co_so_ma text); "
            "CREATE TABLE silver.chi_tiet_don_hang(id integer,ma_don_hang text,gia_ban numeric); "
            "INSERT INTO silver.don_hang VALUES ('o1','s1'),('o2','denied'); "
            "INSERT INTO silver.chi_tiet_don_hang VALUES (1,'o1',10),(2,'o2',900);")
        with self.account():
            sql=access.authorize_sql('SELECT SUM(gia_ban) FROM silver.chi_tiet_don_hang')
            self.assertEqual(conn.execute(sql).fetchone()[0],10)
            with self.assertRaises(HTTPException):access.authorize_sql('SELECT * FROM silver.nguoi_dung')
            with self.assertRaises(HTTPException):access.authorize_sql('SELECT * FROM orders.don_hang')
            with self.assertRaises(HTTPException):access.authorize_route(access.active_principal.get(),'/api/stores/list','GET')

    def test_policy_change_invalidates_inflight_context_and_cache_owner(self):
        with self.account() as before:
            self.assertEqual(access.cache_identity(),before.bound_owner)
            self.policy['subjects']['fixture-user']['store_ids']=['s1']
            with self.assertRaises(HTTPException):access.current_principal(required=True)
        with self.account() as after:self.assertNotEqual(before.bound_owner,after.bound_owner)

    def test_revocation_during_fetch_discards_rows_and_remains_http_forbidden(self):
        from services.sql_service import execute_read_only
        connection = MagicMock()
        cursor = connection.cursor.return_value.__enter__.return_value
        cursor.description = [('tong_tien',)]
        def fetched(*args):
            self.policy['subjects']['fixture-user']['disabled'] = True
            return [{'tong_tien': 300}]
        cursor.fetchmany.side_effect = fetched
        with self.account(), patch('services.sql_service.analytical_connection', return_value=nullcontext(connection)):
            with self.assertRaises(HTTPException) as caught:
                execute_read_only('SELECT tong_tien FROM silver.don_hang')
        self.assertEqual(caught.exception.status_code, 403)
        self.assertNotIn('300', caught.exception.detail)

    def test_national_bi_domain_grant_cannot_read_joined_datasets_before_db(self):
        import server
        self.policy={'version':'fixture-subset','roles':{'ANALYST':{'permissions':['analytics.read','platform.read'],
            'datasets':['orders','stores','products','customers','silver.don_hang'],'national':True}},'subjects':{}}
        client=TestClient(server.app)
        with patch('psycopg2.connect',side_effect=AssertionError('Denied BI must not reach DB')) as database:
            for path in ('/api/marts/all','/api/stores/overview','/api/products/overview','/api/customers/overview','/api/platform/overview'):
                with self.subTest(path=path):
                    response=client.get(path,headers={'Authorization':'Bearer '+token()})
                    self.assertEqual(response.status_code,403)
            database.assert_not_called()

    def test_national_bi_requires_each_physical_dependency_instead_of_a_domain_alias(self):
        self.policy={'version':'fixture-subset','roles':{'ANALYST':{'permissions':['analytics.read'],
            'datasets':['orders','silver.don_hang','silver.chi_nhanh','silver.chi_tiet_don_hang','silver.san_pham','silver.danh_muc'],
            'national':True}},'subjects':{}}
        principal=access.principal_for({'subject':'fixture-user','role':'ANALYST','expires_at':4000000000},self.policy)
        self.assertIsNone(access.authorize_route(principal,'/api/marts/all','GET'))
        for dataset in access.BI_DATASET_DEPENDENCIES['/api/marts/']:
            self.policy['roles']['ANALYST']['datasets'].remove(dataset)
            restricted=access.principal_for({'subject':'fixture-user','role':'ANALYST','expires_at':4000000000},self.policy)
            with self.assertRaises(HTTPException) as failure:access.authorize_route(restricted,'/api/marts/all','GET')
            self.assertEqual(failure.exception.status_code,403)
            self.policy['roles']['ANALYST']['datasets'].append(dataset)
