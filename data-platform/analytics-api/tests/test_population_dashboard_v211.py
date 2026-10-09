"""Kiosk scope and meaningful broad dashboards; forbid provider/DB transports."""
from copy import deepcopy
from unittest.mock import patch
from datetime import date
from tests import test_hybrid_v28 as f
from services.analysis_intent import AnalysisIntentEnvelope
from services.request_anchors import request_anchors, population_filters, verify_anchors, complete_population_filters
from services.analytical_resolver import ResolutionIssues, AnalyticalResolver
from services.analysis_quality_service import verify_saved_report, chart_checks
from services.analysis_catalog import AnalysisCatalog, AnalysisError
from services.verification_score import verification_score
from evals import fixture_warehouse as w

QUESTION='Đánh giá doanh thu và xếp hạng hiệu suất các chi nhánh các kisok'
KIOSKS=['KIOSK_NHUONG_QUYEN','KIOSK_VE_TINH']


def kiosk_requirement(**updates):
    return f.requirement(domain_id='stores',metric_ids=['store_revenue'],dimension_ids=['store'],
        ranking=dict(limit=10,metric_id='store_revenue'),derived_features=[],time=None,**updates)


class PopulationDashboardTests(f.unittest.TestCase):
    setUp=f.HybridTests.setUp
    pipeline=f.HybridTests.pipeline
    request=f.HybridTests.request

    def warehouse(self):
        stores=[dict(w.STORES[0],loai_diem_ban='CHI_NHANH_CHINH',ten_chi_nhanh='Kiosk tên giả'),
                dict(w.STORES[1],loai_diem_ban='KIOSK_VE_TINH',ten_chi_nhanh='Điểm B'),
                dict(w.STORES[1],ma_chi_nhanh='s3',loai_diem_ban='KIOSK_NHUONG_QUYEN',ten_chi_nhanh='Điểm C',thanh_pho='Hồ Chí Minh')]
        orders=[]
        for sid in ('s1','s2','s3'):
            for i,day in enumerate(('2026-09-01','2026-09-15','2026-09-29')):
                orders.append(dict(w.ORDERS[0],ma_don_hang=f'{sid}_{i}',co_so_ma=sid,
                    tong_tien=99999 if sid=='s1' else (i+1)*(100 if sid=='s2' else 200),
                    ngay_tao=day+'T10:00:00',loai_don_hang=('DUNG_TAI_CHO','MANG_DI','GIAO_HANG')[i],
                    trang_thai_don_hang='DANG_GIAO' if i==1 else 'HOAN_THANH'))
        orders.append(dict(orders[-1],ma_don_hang='cancelled',tong_tien=88888,trang_thai_don_hang='DA_HUY'))
        self.enterContext(patch.object(w,'STORES',stores)); self.enterContext(patch.object(w,'ORDERS',orders))
        self.enterContext(patch.dict(w.DATA,chi_nhanh=stores,don_hang=orders))
        warehouse=w.FixtureWarehouse(self.catalog.overlay);self.addCleanup(warehouse.close)
        return warehouse

    def test_metadata_scope_spellings_subtypes_unions_and_exclusions(self):
        for question,expected in [('Doanh thu kiosk',KIOSKS),('Doanh thu kisok',KIOSKS),('Doanh thu kiốt',KIOSKS),
            ('Doanh thu kiosk nhượng quyền',['KIOSK_NHUONG_QUYEN']),('Doanh thu kiosk vệ tinh',['KIOSK_VE_TINH']),
            ('Doanh thu chi nhánh chính',['CHI_NHANH_CHINH']),
            ('Doanh thu cả chi nhánh chính và kiosk',['CHI_NHANH_CHINH',*KIOSKS]),
            ('Doanh thu kiosk, không tính chi nhánh chính',KIOSKS),
            ('Doanh thu kiosk, loại trừ kiosk vệ tinh',['KIOSK_NHUONG_QUYEN'])]:
            with self.subTest(question=question):
                filters=population_filters(request_anchors(question,self.catalog,{}),self.catalog)
                actual=filters[0]['value']; self.assertEqual(set(actual if isinstance(actual,list) else [actual]),set(expected))
        self.assertEqual(population_filters(request_anchors('Doanh thu các chi nhánh',self.catalog,{}),self.catalog),[])

    def test_filter_cannot_be_satisfied_by_only_one_requested_or_supporting_sibling(self):
        anchors=request_anchors(QUESTION,self.catalog,{})
        intent=AnalysisIntentEnvelope.model_validate(f.envelope(kiosk_requirement(),kiosk_requirement(id='r2')))
        good,changes=complete_population_filters(intent,anchors,self.catalog)
        self.assertEqual(len(changes),2)
        self.assertEqual(verify_anchors(anchors,good.requirements,f.REFERENCE,self.catalog),[])
        good.requirements[1].filters=[]
        issues=verify_anchors(anchors,good.requirements,f.REFERENCE,self.catalog)
        self.assertTrue(any(i['requirement_id']=='r2' and i['code']=='population_filter_mismatch' for i in issues))
        good.requirements[1].supporting_for='r1'
        self.assertTrue(any(i['requirement_id']=='r2' and i['code']=='population_filter_mismatch' for i in verify_anchors(anchors,good.requirements,f.REFERENCE,self.catalog)))

    def test_explicit_conflicting_model_filter_is_repaired_not_silently_overridden(self):
        intent=AnalysisIntentEnvelope.model_validate(f.envelope(kiosk_requirement(filters=[dict(dimension='store_type',value='CHI_NHANH_CHINH')])))
        with self.assertRaises(ResolutionIssues) as caught:
            complete_population_filters(intent,request_anchors(QUESTION,self.catalog,{}),self.catalog)
        self.assertEqual(caught.exception.issues[0]['field'],'filters')
        self.assertEqual(intent.requirements[0].filters[0].value,'CHI_NHANH_CHINH')

    def test_unknown_physical_classification_never_silently_broadens(self):
        physical=f.physical_metadata()
        physical['table_map']['silver.chi_nhanh']['columns']=[c for c in physical['table_map']['silver.chi_nhanh']['columns'] if c['name']!='loai_diem_ban']
        catalog=AnalysisCatalog(physical)
        with self.assertRaises(AnalysisError): population_filters(request_anchors(QUESTION,catalog,{}),catalog)

    def test_kiosk_report_has_four_distinct_verified_views_and_correct_sql_cohort(self):
        warehouse=self.warehouse()
        p=self.pipeline(f.scripted(f.envelope(kiosk_requirement())),executor=warehouse)
        request=self.request(QUESTION)
        proposal=p.propose(request)
        self.assertEqual(p.provider.call_count,1)
        self.assertEqual(proposal['diagnostics']['analysis_depth'],'deep')
        self.assertEqual(proposal['diagnostics']['minimum_visuals'],4)
        self.assertLessEqual(len(proposal['proposal']['analytical_queries']),8)
        for q in proposal['proposal']['analytical_queries']:
            self.assertTrue(any(f['dimension']=='store_type' and set(f['value'])==set(KIOSKS) for f in q['filters']))
            self.assertEqual(q['time']['mode'],'all_time')
        f.approve(request,proposal);report=p.generate(request)
        self.assertGreaterEqual(len(report['charts']),4)
        self.assertEqual(len({c['semantic_view_key'] for c in report['charts']}),len(report['charts']))
        self.assertTrue(any(c['x_field']=='period' for c in report['charts']))
        self.assertTrue(any(c.get('selection')=='Top N' for c in report['charts']))
        self.assertEqual(report['quality_assessment'],verify_saved_report(report,self.catalog))
        check=next(c for c in report['quality_assessment']['verification_checks'] if c['id']=='analysis_depth_coverage')
        self.assertEqual(check['status'],'passed')
        ranking=next(q for q in report['analytical_queries'] if q['role']=='requested')
        rows=report['result_sets'][ranking['id']]['rows']
        self.assertEqual({r['store'] for r in rows},{'Điểm B','Điểm C'})
        self.assertEqual(sum(r['store_revenue'] for r in rows),1800)
        self.assertNotIn('Kiosk tên giả',{r['store'] for r in rows})
        self.assertIn('loai_diem_ban',report['sql_by_query'][ranking['id']])
        self.assertEqual(p.provider.call_count,1)

    def test_saved_wrong_scope_never_gets_a_numeric_score(self):
        warehouse=self.warehouse();p=self.pipeline(f.scripted(f.envelope(kiosk_requirement())),executor=warehouse)
        request=self.request('Xếp hạng 10 chi nhánh theo doanh thu');proposal=p.propose(request);f.approve(request,proposal)
        report=p.generate(request)
        report['provenance']['user_request']=QUESTION
        verdict=verify_saved_report(report,self.catalog)
        self.assertEqual(verdict['status'],'not_scored');self.assertIsNone(verdict['score'])

    def test_missing_views_is_partial_and_score_is_recomputed(self):
        warehouse=self.warehouse();p=self.pipeline(f.scripted(f.envelope(kiosk_requirement())),executor=warehouse)
        request=self.request(QUESTION);proposal=p.propose(request);f.approve(request,proposal);report=p.generate(request)
        report['charts']=report['charts'][:1]
        verdict=verify_saved_report(report,self.catalog)
        self.assertEqual(verdict['status'],'partially_verified')
        self.assertLess(verdict['score'],90)
        check=next(c for c in verdict['verification_checks'] if c['id']=='analysis_depth_coverage')
        self.assertEqual((check['passed'],check['total']),(1,4))
