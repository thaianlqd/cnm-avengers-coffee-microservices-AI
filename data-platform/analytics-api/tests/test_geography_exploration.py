"""Province/store drills preserve owned scope, exact metric populations and zero-order stores."""
from datetime import date
from copy import copy
from unittest import TestCase
from unittest.mock import patch
from fastapi import HTTPException
from services.analysis_catalog import AnalysisCatalog
from services.session_service import ReportSession
from services import geography_exploration_service as geo
from tests.analysis_fixtures import physical_metadata
from evals.fixture_warehouse import FixtureWarehouse, DATA


class GeographyExplorationTests(TestCase):
    def setUp(self):
        self.catalog=AnalysisCatalog(physical_metadata())
        self.session=ReportSession(session_id='geo-test',original_prompt='Địa bàn',owner_id='owner',approved=True,
            schema_fingerprint=self.catalog.fingerprint,agent_reference_date='2026-10-20',
            resolved_operations=[{'role':'requested','time':{'kind':'relative','mode':'all_time'},'filters':[]}])

    def run_geo(self,city=None,store=None,executor=None):
        with patch.object(geo,'get_session',return_value=self.session):
            return geo.explore('geo-test','owner',1,city,store,catalog=self.catalog,executor=executor)

    def test_directory_includes_zero_order_store_and_sales_reconcile_between_province_and_stores(self):
        extra={**DATA,'chi_nhanh':[*DATA['chi_nhanh'],dict(ma_chi_nhanh='idle',ten_chi_nhanh='Quán chưa bán',thanh_pho='Hà Nội',loai_diem_ban='CHI_NHANH_CHINH',trang_thai='ACTIVE')]}
        with patch.dict(DATA,extra):
            warehouse=FixtureWarehouse(self.catalog.overlay)
            try:
                summary=self.run_geo(executor=warehouse);detail=self.run_geo('Hà Nội',executor=warehouse)
                province=next(p for p in summary['provinces'] if p['city']=='Hà Nội')
                self.assertEqual(province['store_count'],2);self.assertEqual(len(detail['stores']),2)
                self.assertEqual(province['revenue'],detail['summary']['revenue'])
                self.assertEqual(province['orders'],sum(s['orders'] for s in detail['stores']))
                idle=next(s for s in detail['stores'] if s['store_id']=='idle')
                self.assertEqual(idle['revenue'],0);self.assertEqual(idle['orders'],0);self.assertIsNone(idle['aov'])
                self.assertFalse(idle['has_sales']);self.assertEqual(summary['provider_calls'],0)
                self.assertNotIn('dia_chi',str(detail));self.assertNotIn('so_dien_thoai',str(detail))
            finally:warehouse.close()

    def test_store_drill_is_bound_to_its_province_and_returns_trend_and_ranked_products(self):
        warehouse=FixtureWarehouse(self.catalog.overlay)
        try:
            result=self.run_geo('Hà Nội','s2',warehouse)
            self.assertEqual(len(result['stores']),1);self.assertEqual(result['stores'][0]['store_id'],'s2')
            self.assertTrue(result['trend']);self.assertLessEqual(len(result['products']),8)
            self.assertEqual([p['product_revenue'] for p in result['products']],sorted((p['product_revenue'] for p in result['products']),reverse=True))
            with self.assertRaises(HTTPException) as error:self.run_geo('Hà Nội','s1',warehouse)
            self.assertEqual(error.exception.status_code,404)
        finally:warehouse.close()

    def test_root_directory_returns_recorded_locations_and_keeps_unlocated_stores_in_totals(self):
        directory=[{**row,'vi_do':21.02851,'kinh_do':105.804817} if row['ma_chi_nhanh']=='s2' else row for row in DATA['chi_nhanh']]
        with patch.dict(DATA,{'chi_nhanh':directory}):
            warehouse=FixtureWarehouse(self.catalog.overlay)
            try:
                root=self.run_geo(executor=warehouse)
                self.assertEqual(len(root['stores']),root['summary']['store_count'])
                self.assertEqual(root['summary']['revenue'],sum(p['revenue'] for p in root['provinces']))
                located=next(s for s in root['stores'] if s['store_id']=='s2')
                self.assertEqual(located['latitude'],21.02851)
                self.assertEqual(located['longitude'],105.804817)
                self.assertEqual(located['location_status'],'recorded')
                unlocated=next(s for s in root['stores'] if s['store_id']=='s1')
                self.assertIsNone(unlocated['latitude'])
                self.assertEqual(unlocated['location_status'],'missing')
                self.session.resolved_operations[0]['filters']=[{'dimension':'city','operator':'eq','value':'Hà Nội'}]
                scoped=self.run_geo(executor=warehouse)
                self.assertEqual([s['store_id'] for s in scoped['stores']],['s2'])
                self.assertEqual(scoped['provider_calls'],0)
            finally:warehouse.close()

    def test_ownership_revision_schema_and_mixed_filter_scopes_fail_before_queries(self):
        def blocked(*args,**kwargs):raise AssertionError('No SQL before scope validation')
        for change,status in [({'owner_id':'someone'},404),({'approved':False},404),({'revision':2},409),({'schema_fingerprint':'changed'},409),
            ({'resolved_operations':[{'filters':[{'dimension':'product','operator':'eq','value':'x'}]}]},409),
            ({'resolved_operations':[{'filters':[]},{'filters':[{'dimension':'city','operator':'eq','value':'Hà Nội'}]}]},409)]:
            candidate=copy(self.session)
            for field,value in change.items():setattr(candidate,field,value)
            with self.subTest(change=change),patch.object(geo,'get_session',return_value=candidate):
                with self.assertRaises(HTTPException) as error:
                    geo.explore('geo-test','owner',1,catalog=self.catalog,executor=blocked)
                self.assertEqual(error.exception.status_code,status)

    def test_selected_city_scope_cannot_be_widened_and_empty_province_is_not_regional_revenue(self):
        self.session.resolved_operations[0]['filters']=[{'dimension':'city','operator':'eq','value':'Hà Nội'}]
        warehouse=FixtureWarehouse(self.catalog.overlay)
        try:
            summary=self.run_geo(executor=warehouse)
            self.assertEqual([p['city'] for p in summary['provinces']],['Hà Nội'])
            with self.assertRaises(HTTPException) as error:self.run_geo('Hồ Chí Minh',executor=warehouse)
            self.assertEqual(error.exception.status_code,404)
            self.session.resolved_operations[0]['filters']=[]
            empty=self.run_geo('An Giang',executor=warehouse)
            self.assertEqual(empty['summary']['store_count'],0);self.assertEqual(empty['summary']['revenue'],0)
        finally:warehouse.close()

    def test_truncated_directory_is_rejected_instead_of_showing_a_partial_ranking(self):
        def truncated(*args,**kwargs):return {'rows':[],'truncated':True}
        with self.assertRaises(HTTPException) as error:self.run_geo(executor=truncated)
        self.assertEqual(error.exception.status_code,422)

    def test_directory_proves_a_historical_city_outside_reference_enum_without_mutating_catalog(self):
        directory=[{**row,'thanh_pho':'An Giang'} if row['ma_chi_nhanh']=='s2' else row for row in DATA['chi_nhanh']]
        with patch.dict(DATA,{'chi_nhanh':directory}):
            warehouse=FixtureWarehouse(self.catalog.overlay)
            try:
                result=self.run_geo('An Giang',executor=warehouse)
                self.assertEqual(result['summary']['store_count'],1)
                self.assertGreater(result['summary']['revenue'],0)
                self.assertNotIn('An Giang',self.catalog.registry['dimensions']['city']['enum'])
            finally:warehouse.close()

    def test_approved_period_excludes_other_sales_while_retaining_current_directory(self):
        self.session.resolved_operations[0]['time']={'kind':'range','start':'2020-01-01','end':'2020-01-31'}
        warehouse=FixtureWarehouse(self.catalog.overlay)
        try:
            result=self.run_geo('Hà Nội',executor=warehouse)
            self.assertEqual(result['period']['start'],'2020-01-01')
            self.assertEqual(result['summary']['store_count'],1)
            self.assertEqual(result['summary']['revenue'],0)
            self.assertEqual(result['summary']['orders'],0)
            self.assertIsNone(result['summary']['aov'])
        finally:warehouse.close()

    def test_city_is_an_exact_escaped_value_and_never_sql_or_a_wildcard(self):
        warehouse=FixtureWarehouse(self.catalog.overlay)
        try:
            for city in ("Hà Nội' OR 1=1 --",'%'):
                with self.subTest(city=city):
                    result=self.run_geo(city,executor=warehouse)
                    self.assertEqual(result['stores'],[])
                    self.assertEqual(result['summary']['store_count'],0)
        finally:warehouse.close()
