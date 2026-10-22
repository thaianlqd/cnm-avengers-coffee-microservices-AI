"""Independent PostgreSQL fixture for production BI status/denominator/totals.

Shares only the disposable explicit v34_ownership database, never the warehouse.
Expected300/150/20 are hand-authored, not derived from compiler/route helpers.
"""
from datetime import datetime
import json
from pathlib import Path
from unittest import TestCase
from unittest.mock import patch,Mock

from psycopg2 import sql
import psycopg2.extras
from integration_sync_pg import connect
from routers import marts,products,stores,customers
from services.analysis_catalog import CATALOG_PATH


class MetricParityPostgresTests(TestCase):
    @classmethod
    def setUpClass(cls):
        from acceptance_api_ownership import ApiOwnershipPostgresTests
        ApiOwnershipPostgresTests.setUpClass()
        cls.overlay=json.loads(Path(CATALOG_PATH).read_text())
        connection=connect('v34_ownership',autocommit=True)
        with connection.cursor() as cursor:
            cursor.execute('CREATE SCHEMA IF NOT EXISTS silver')
            for name in ['don_hang','chi_tiet_don_hang','chi_nhanh','san_pham','danh_muc','nguoi_dung']:
                fields=cls.overlay['silver_tables']['silver.'+name]['columns']
                definitions=[]
                for field,meta in fields.items():
                    declared=str(meta.get('type','text')).lower()
                    physical='numeric' if any(n in declared for n in ['numeric','decimal','integer','smallint','bigint','double','float']) else 'timestamp' if 'timestamp' in declared else 'text'
                    definitions.append(sql.SQL('{} {}').format(sql.Identifier(field),sql.SQL(physical)))
                cursor.execute(sql.SQL('CREATE TABLE IF NOT EXISTS silver.{} ({})').format(sql.Identifier(name),sql.SQL(',').join(definitions)))
        connection.close()

    def connection(self):
        value=connect('v34_ownership');value.cursor_factory=psycopg2.extras.RealDictCursor
        self.addCleanup(value.close)
        return value

    def setUp(self):
        c=self.connection()
        with c.cursor() as q:
            for name in ['chi_tiet_don_hang','don_hang','san_pham','chi_nhanh','danh_muc','nguoi_dung']:
                q.execute(sql.SQL('DELETE FROM silver.{}').format(sql.Identifier(name)))
            q.execute("INSERT INTO silver.chi_nhanh(ma_chi_nhanh,ten_chi_nhanh,thanh_pho,trang_thai) VALUES ('sA','Fixture A','Hà Nội','ACTIVE'),('sB','Fixture B','Hồ Chí Minh','ACTIVE')")
            q.execute("INSERT INTO silver.danh_muc(ma_danh_muc,ten_danh_muc,cap_bac) VALUES (1,'Fixture category',1)")
            for identity,status,amount,store in [('o1','HOAN_THANH',100,'sA'),('o2','DANG_GIAO',200,'sB'),('o3','DA_XAC_NHAN',900,'sA')]:
                q.execute('INSERT INTO silver.don_hang(ma_don_hang,trang_thai_don_hang,tong_tien,ngay_tao,co_so_ma,phuong_thuc_thanh_toan,loai_don_hang) VALUES (%s,%s,%s,%s,%s,%s,%s)',(identity,status,amount,datetime.now(),store,'TIEN_MAT','DUNG_TAI_CHO'))
            for i in range(21):
                q.execute('INSERT INTO silver.san_pham(ma_san_pham,ten_san_pham,ma_danh_muc,gia_ban) VALUES (%s,%s,%s,%s)',(i+1,'Fixture product '+str(i),1,100))
                if i<20:
                    q.execute('INSERT INTO silver.chi_tiet_don_hang(id,ma_don_hang,ma_san_pham,ten_san_pham,so_luong,gia_ban,thanh_tien) VALUES (%s,%s,%s,%s,1,100,%s)',(i+1,'o1' if i<10 else 'o2',i+1,'Fixture product '+str(i),5 if i<10 else 10))
            q.execute("INSERT INTO silver.chi_tiet_don_hang(id,ma_don_hang,ma_san_pham,ten_san_pham,so_luong,gia_ban,thanh_tien) VALUES (999,'o3',1,'Fixture product 0',99,100,900)")
            q.execute("INSERT INTO silver.nguoi_dung(ma_nguoi_dung,vai_tro,ho_ten,email,so_dien_thoai,tong_chi_tieu,diem_loyalty) VALUES ('uA','CUSTOMER','Private fixture person','private@example.invalid','000-fixture',1000000,9999),('uB','CUSTOMER',NULL,NULL,NULL,1000000,0),('uC','FRANCHISEE',NULL,NULL,NULL,0,0),('uD','ADMIN',NULL,NULL,NULL,0,0)")
            q.execute("UPDATE silver.don_hang SET ma_nguoi_dung='uA' WHERE ma_don_hang='o1'")
        c.commit()
        for module in (marts,products,stores,customers):self.enterContext(patch.object(module,'get_db_conn',side_effect=self.connection))

    def test_aov_uses_revenue_population_and_confirmed_orders_never_become_revenue(self):
        result=marts.get_all_marts('all','all','all')
        self.assertEqual(result['kpi']['revenue_all_time'],300)
        self.assertEqual(result['kpi']['total_orders_all_time'],3)
        self.assertEqual(result['kpi']['revenue_orders'],2)
        self.assertEqual(result['kpi']['aov'],150)
        self.assertEqual(sum(row['revenue'] for row in result['revenue_daily']),300)
        self.assertEqual(sum(row['revenue'] for row in result['category_sales']),150)

    def test_product_totals_use_full_line_amount_population_not_top15_or_quantity_times_price(self):
        result=products.get_products_overview('all','all')
        self.assertEqual(len(result['top_products']),15)
        self.assertEqual(len(result['all_products']),21)
        self.assertEqual(result['kpi']['total_revenue'],150)
        self.assertEqual(result['kpi']['total_sold'],20)
        self.assertNotEqual(sum(row['total_revenue'] for row in result['top_products']),150)
        self.assertEqual(sum(row['total_revenue'] for row in result['all_products']),150)
        self.assertEqual(sum(row['revenue'] for row in result['revenue_trend']),150)

    def test_store_totals_reconcile_to_whole_scope_without_summing_aov(self):
        result=stores.get_stores_overview('','all','all','all','all')
        self.assertEqual(result['summary']['total_stores'],2)
        self.assertEqual(sum(row['revenue'] for row in result['revenue_by_city']),300)
        self.assertEqual(result['summary']['avg_revenue_per_store'],150)

    def test_customer_identity_population_and_no_fabricated_membership_or_private_fields(self):
        result=customers.get_customers_overview('all','all')
        self.assertEqual(result['kpi']['total_registered'],2)
        self.assertEqual(result['kpi']['total_orders'],2)
        self.assertEqual(result['kpi']['identified_orders'],1)
        self.assertEqual(result['kpi']['anonymous_orders'],1)
        self.assertEqual(result['kpi']['active_accounts'],1)
        self.assertIsNone(result['kpi']['new_customers'])
        self.assertEqual(result['membership_tiers'],[])
        self.assertEqual(result['membership_status']['status'],'not_measured')
        serialized=json.dumps(result,default=str)
        self.assertNotIn('Private fixture person',serialized)
        self.assertNotIn('private@example.invalid',serialized)
        self.assertNotIn('000-fixture',serialized)
        self.assertNotIn('Giảm 15%',serialized)

    def export_client(self,permissions=None):
        import os
        from fastapi import FastAPI
        from routers import reports
        from services import access_policy as access
        from tests.http_fixture import ASGIClient
        from tests.test_v34_access_policy import SECRET,token
        self.enterContext(patch.dict(os.environ,{'DATA_ANALYST_ENV':'development','DATA_ANALYST_ALLOW_BROWSER_OWNER':'0',
            'DATA_ANALYST_AUTH_ALLOW_LEGACY_JWT':'1','DATA_ANALYST_IDENTITY_JWT_SECRET':SECRET}))
        policy={'version':'fixture-export-v1','roles':{'ANALYST':{'permissions':permissions if permissions is not None else ['analytics.read','reports.export'],
            'datasets':['*'],'national':True}},'subjects':{}}
        self.enterContext(patch.object(access,'load_policy',return_value=policy))
        self.enterContext(patch('db.get_report_writer_conn',side_effect=self.connection))
        app=FastAPI();app.add_middleware(access.AccessMiddleware);app.include_router(reports.router)
        return ASGIClient(app),{'Authorization':'Bearer '+token({'sub':'fixture-exporter','role':'ANALYST','exp':4000000000})}

    def test_actual_http_csv_uses_server_rows_and_correct_full_product_population(self):
        import csv,io
        from decimal import Decimal
        client,headers=self.export_client()
        reply=client.post('/api/reports/export-data',headers=headers,json={'kind':'products','date_range':'all','branch':'all'})
        self.assertEqual(reply.status_code,200,reply.text[:100])
        rows=list(csv.reader(io.StringIO(reply.text.lstrip('\ufeff'))))
        self.assertEqual(len(rows)-1,21)
        self.assertEqual(sum(Decimal(row[4]) for row in rows[1:]),150)
        self.assertEqual(sum(Decimal(row[3]) for row in rows[1:]),20)
        self.assertIn(b'text/csv',reply.headers[b'content-type'])
        c=self.connection()
        with c.cursor() as q:
            q.execute("SELECT decision FROM analytics.audit_events WHERE resource_key='bi_products' ORDER BY occurred_at DESC LIMIT 2")
            self.assertEqual({row['decision'] for row in q.fetchall()},{'allowed','completed'})

    def test_actual_http_export_denies_client_rows_missing_permission_and_audit_failure_before_select(self):
        client,headers=self.export_client(permissions=['analytics.read'])
        with patch.object(marts,'get_db_conn',side_effect=AssertionError('Denied export read')) as reader:
            denied=client.post('/api/reports/export-data',headers=headers,json={'kind':'revenue'})
            self.assertEqual(denied.status_code,403)
            reader.assert_not_called()
        # A new synthetic client with permission still cannot export when its
        # durable audit reservation fails, or supply its own successful rows.
        client,headers=self.export_client()
        invalid=client.post('/api/reports/export-data',headers=headers,json={'kind':'revenue','rows':[{'revenue':999}]})
        self.assertEqual(invalid.status_code,422)
        with patch('db.get_report_writer_conn',side_effect=RuntimeError('fixture audit unavailable')),patch.object(marts,'get_db_conn') as reader:
            unavailable=client.post('/api/reports/export-data',headers=headers,json={'kind':'revenue'})
            self.assertEqual(unavailable.status_code,503)
            reader.assert_not_called()

    def test_actual_csv_spreadsheet_formula_labels_are_escaped(self):
        import csv,io
        c=self.connection()
        with c.cursor() as q:q.execute("UPDATE silver.san_pham SET ten_san_pham='=1+1' WHERE ma_san_pham=1")
        c.commit()
        client,headers=self.export_client()
        reply=client.post('/api/reports/export-data',headers=headers,json={'kind':'products','date_range':'all'})
        self.assertEqual(reply.status_code,200)
        rows=list(csv.reader(io.StringIO(reply.text.lstrip('\ufeff'))))
        self.assertTrue(any(row[1]=="'=1+1" for row in rows[1:]))
