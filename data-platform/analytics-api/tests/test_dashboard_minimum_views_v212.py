"""Every domain uses the dashboard floor, including focused/simple questions."""
from copy import deepcopy
from unittest.mock import patch
from tests import test_hybrid_v28 as f
from evals.fixture_warehouse import FixtureWarehouse
from services.analysis_quality_service import verify_saved_report
from services.analysis_expansion_service import dashboard_policy


class DashboardMinimumTests(f.unittest.TestCase):
    setUp=f.HybridTests.setUp
    pipeline=f.HybridTests.pipeline
    request=f.HybridTests.request

    def report(self, req, question='Theo lựa chọn', **options):
        warehouse=FixtureWarehouse(self.catalog.overlay);self.addCleanup(warehouse.close)
        p=self.pipeline(f.scripted(f.envelope(req)),executor=warehouse)
        from evals.fixture_warehouse import DATA
        p.value_lookup=lambda table,column,reference,**kw: [reference] if any(
            row.get(column)==reference for row in DATA.get(table.split('.')[-1],[])) else []
        request=self.request(question,**options)
        proposal=p.propose(request)
        f.approve(request,proposal)
        return p,proposal,p.generate(request)

    def check_dashboard(self, report):
        self.assertGreaterEqual(len(report['charts']),4)
        self.assertEqual(len({c['semantic_view_key'] for c in report['charts']}),len(report['charts']))
        self.assertLessEqual(len(report['analytical_queries']),8)
        self.assertEqual(verify_saved_report(report,self.catalog),report['quality_assessment'])
        depth=next(c for c in report['quality_assessment']['verification_checks'] if c['id']=='analysis_depth_coverage')
        self.assertEqual(depth['status'],'passed')

    def test_payment_cross_tab_gets_timeline_and_marginal_views_with_identical_scope(self):
        req=f.requirement(domain_id='payments',metric_ids=['payment_count','payment_revenue'],
            dimension_ids=['payment_gateway','payment_transaction_status'],analysis_kind='cross_tab',
            ranking=None,derived_features=[],filters=[dict(dimension='payment_gateway',operator='in',value=['VNPAY','MOMO'])])
        p,proposal,report=self.report(req,'Thống kê số giao dịch và doanh thu thanh toán theo cổng thanh toán và trạng thái giao dịch trong 30 ngày gần nhất.')
        self.check_dashboard(report)
        self.assertTrue(any(c['chart_type']=='heatmap' for c in report['charts']))
        self.assertTrue(any(c['x_field']=='period' for c in report['charts']))
        self.assertEqual(p.provider.call_count,1)
        for q in report['analytical_queries']:
            self.assertEqual(q['filters'],report['analytical_queries'][0]['filters'])
            self.assertEqual(q['time'],report['analytical_queries'][0]['time'])

    def test_all_sixteen_domain_default_lenses_have_four_verified_views(self):
        from services.domain_intelligence_service import DomainIntelligence
        profiles=DomainIntelligence(self.catalog).available()
        self.assertEqual(len(profiles),16)
        for domain,profile in profiles.items():
            with self.subTest(domain=domain):
                b=profile['analytical_lenses'][0]['blueprint']
                ms=b['default_metric_refs'];ds=b['default_grouping'] or []
                req=f.requirement(domain_id=domain,metric_ids=ms,dimension_ids=ds,
                    analysis_kind=b['default_operation'],time=None,derived_features=[],ranking=None)
                if b['default_operation']=='ranking':req['ranking']=dict(limit=10,metric_id=ms[0])
                p,proposal,report=self.report(req)
                self.check_dashboard(report)
                self.assertEqual(p.provider.call_count,1)
                self.assertGreaterEqual(proposal['diagnostics']['minimum_visuals'],4)
                if not any(self.catalog.registry['metrics'][m].get('time_column') for m in ms):
                    self.assertFalse(any(q['operation']=='trend' for q in report['analytical_queries']))

    def test_explicit_focused_setting_cannot_bypass_the_floor(self):
        p,proposal,report=self.report(f.requirement(),analysis_depth='focused')
        self.check_dashboard(report)
        self.assertEqual(proposal['diagnostics']['minimum_visuals'],4)

    def test_old_or_truncated_simple_report_cannot_hide_missing_views(self):
        p,proposal,report=self.report(f.requirement())
        forged=deepcopy(report);forged['charts']=forged['charts'][:2]
        forged['diagnostics']['minimum_visuals']=0
        verdict=verify_saved_report(forged,self.catalog)
        self.assertEqual(verdict['status'],'partially_verified')
        self.assertLess(verdict['score'],90)
        check=next(c for c in verdict['verification_checks'] if c['id']=='analysis_depth_coverage')
        self.assertEqual((check['passed'],check['total']),(2,4))

    def test_empty_data_keeps_floor_and_declares_missing_views(self):
        from evals import fixture_warehouse as w
        from services.analysis_catalog import AnalysisError
        with patch.dict(w.DATA,{name:[] for name in w.DATA}):
            with self.assertRaises(AnalysisError) as caught:
                self.report(f.requirement())
        self.assertEqual(caught.exception.category,'insufficient_data')
