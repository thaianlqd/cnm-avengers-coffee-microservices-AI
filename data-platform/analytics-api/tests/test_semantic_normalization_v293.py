"""Catalog-backed draft normalization; no providers or warehouse transports."""
from copy import deepcopy
from unittest.mock import Mock, patch
from services.analysis_catalog import AnalysisError
from services.analysis_intent import AnalysisIntentEnvelope, decompose_scalar_draft
from services.analytical_resolver import AnalyticalResolver
from services.request_anchors import request_anchors, verify_anchors, complete_explicit_share_targets
from services.analysis_quality_service import verify_saved_report
from evals.fixture_warehouse import FixtureWarehouse
from tests import test_hybrid_v28 as f
from tests.test_capacity_v29 import req
from tests.test_final_review_v29 import OVERVIEW_45D, malformed_overview


def shared_requirements():
    combinations = [([],{}),(['contribution_share'],{}),
        (['contribution_share'],{'contribution_share':['revenue']}),(['group_gap'],{}),
        (['group_gap'],{'group_gap':['revenue']}),(['contribution_share','group_gap'],{}),
        (['contribution_share','group_gap'],{'contribution_share':['revenue']}),
        (['contribution_share','group_gap'],{'group_gap':['revenue']}),
        (['contribution_share','group_gap'],{'contribution_share':['revenue'],'group_gap':['revenue']})]
    return f.envelope(*[req('view_'+str(i),['revenue'],['order_type'],days=45,
        features=features,feature_metrics=targets) for i,(features,targets) in enumerate(combinations)])


class NormalizationTests(f.unittest.TestCase):
    setUp = f.HybridTests.setUp
    pipeline = f.HybridTests.pipeline
    request = f.HybridTests.request

    def test_scope_qualifiers_are_generic_catalog_roles_not_grouping(self):
        for qualifier in ('phạm vi','điều kiện','định nghĩa'):
            for alias,dimension in [('trạng thái đơn','order_status'),('trạng thái thanh toán','payment_status')]:
                with self.subTest(qualifier=qualifier,alias=alias):
                    anchors=request_anchors('Giải thích '+qualifier+' '+alias,self.catalog,{})
                    self.assertEqual(anchors['dimensions'],[])
                    self.assertEqual(anchors['population_scopes'][0]['candidate_ids'],[dimension])
        with patch.dict(self.catalog.registry,{'population_scope_qualifiers':['chính sách quan sát cho']}):
            self.assertTrue(request_anchors('Chính sách quan sát cho trạng thái đơn',self.catalog,{})['population_scopes'])

    def test_independent_status_breakdown_still_requires_real_axis(self):
        q='Làm rõ phạm vi trạng thái đơn và thống kê số đơn theo trạng thái đơn.'
        a=request_anchors(q,self.catalog,{})
        self.assertTrue(a['population_scopes']);self.assertTrue(a['dimensions'])
        r=AnalysisIntentEnvelope.model_validate(f.envelope(req('orders',['order_count'],days=45)))
        issues=verify_anchors(a,r.requirements,f.REFERENCE,self.catalog)
        self.assertIn('explicit_dimensions_missing',{i['code'] for i in issues})
        for qualifier in ('phạm vi','điều kiện','định nghĩa'):
            a=request_anchors('Thống kê số đơn theo '+qualifier+' trạng thái đơn',self.catalog,{})
            self.assertFalse(a['population_scopes']);self.assertTrue(a['dimensions'])
            self.assertIn('explicit_dimensions_missing',{i['code'] for i in verify_anchors(a,r.requirements,f.REFERENCE,self.catalog)})

    def test_scope_explanation_requires_available_catalog_population_definition(self):
        a=request_anchors('Làm rõ phạm vi trạng thái đơn',self.catalog,{})
        r=AnalysisIntentEnvelope.model_validate(f.envelope(req('orders',['revenue'],days=45)))
        self.assertEqual(verify_anchors(a,r.requirements,f.REFERENCE,self.catalog),[])
        with patch.dict(self.catalog.registry['metrics']['revenue'],{'population_definition':''}):
            self.assertIn('population_scope_unavailable', {i['code'] for i in verify_anchors(a,r.requirements,f.REFERENCE,self.catalog)})

    def test_new_recorded_overview_variants_complete_reports_on_primary_call(self):
        warehouse=FixtureWarehouse(self.catalog.overlay);self.addCleanup(warehouse.close)
        for binding in (None,[],['aov'],['order_count']):
            raw=malformed_overview();raw['requirements'][0]['derived_features']=[]
            raw['requirements'][0]['feature_metrics']={}
            raw['requirements'][1]['derived_features']=[]
            raw['requirements'][1]['feature_metrics']={} if binding is None else {'contribution_share':binding}
            with self.subTest(binding=binding):
                p=self.pipeline(f.scripted(raw),executor=Mock(wraps=warehouse))
                request=self.request(OVERVIEW_45D);proposal=p.propose(request)
                self.assertEqual(p.provider.call_count,1);p.executor.assert_not_called()
                self.assertEqual(len(proposal['proposal']['analytical_queries']),4)
                f.approve(request,proposal);report=p.generate(request)
                self.assertEqual(report['outcome'],'SUCCESS');self.assertEqual(p.provider.call_count,1)
                self.assertEqual(report['quality_assessment'],verify_saved_report(report,self.catalog))
                self.assertEqual(report['quality_assessment']['score'],90)
                self.assertTrue(any(e['feature']=='contribution_share' for e in report['evidence']))
                self.assertTrue(any('HOAN_THANH' in l['label'] for l in report['quality_limitations']))

    def test_ambiguous_or_unmentioned_share_target_is_not_guessed(self):
        raw=AnalysisIntentEnvelope.model_validate(f.envelope(
            req('types',['revenue'],['order_type']),req('stores',['revenue'],['store'])))
        a=request_anchors('Tỷ trọng doanh thu',self.catalog,{})
        normalized,changes=complete_explicit_share_targets(raw,a,self.catalog)
        self.assertEqual(normalized,raw);self.assertEqual(changes,[])
        raw=AnalysisIntentEnvelope.model_validate(f.envelope(req('avg',['aov'],['store'],
            features=['contribution_share'],feature_metrics={'contribution_share':['aov']})))
        a=request_anchors('Giá trị đơn trung bình theo chi nhánh',self.catalog,{})
        normalized,changes=complete_explicit_share_targets(raw,a,self.catalog)
        self.assertEqual(normalized,raw);self.assertEqual(changes,[])
        self.assertEqual(AnalyticalResolver(self.catalog,f.REFERENCE).resolve(normalized)['coverage'][0]['state'],'UNSUPPORTED')

    def test_scalar_decomposition_preserves_meaning_time_filters_and_input(self):
        raw=AnalysisIntentEnvelope.model_validate(malformed_overview())
        raw.requirements[0].filters=f.IntentRequirement.model_validate(req('f',['revenue'],filters=[dict(dimension='city',value='Hà Nội')])).filters
        baseline=raw.model_copy(deep=True);normalized,changes=decompose_scalar_draft(raw)
        self.assertEqual(raw,baseline);self.assertEqual(len(normalized.requirements),3)
        scalar=normalized.requirements[-1];trend=normalized.requirements[0]
        self.assertEqual(scalar.time,baseline.requirements[0].time)
        self.assertEqual(scalar.filters,baseline.requirements[0].filters)
        self.assertEqual(set(scalar.metric_ids),set(baseline.requirements[0].metric_ids))
        self.assertEqual(trend.dimension_ids,['order_type']);self.assertEqual(trend.granularity,'week')
        self.assertEqual(scalar.dimension_ids,[]);self.assertEqual(scalar.analysis_kind,'aggregate')
        self.assertEqual(changes[0]['rule'],'scalar_scope_decomposition')

    def test_invalid_scalar_targets_and_ranked_cohort_are_not_normalized(self):
        for updates in ({'feature_metrics':{'scalar':['payment_revenue']}},
                {'ranking':{'limit':5,'metric_id':'revenue'},'analysis_kind':'ranking'}):
            raw=malformed_overview();raw['requirements'][0].update(updates)
            raw=AnalysisIntentEnvelope.model_validate(raw)
            normalized,changes=decompose_scalar_draft(raw)
            self.assertEqual(normalized,raw);self.assertEqual(changes,[])

    def test_exact_operations_reused_before_budget_and_all_coverage_retained(self):
        r=AnalyticalResolver(self.catalog,f.REFERENCE).resolve(AnalysisIntentEnvelope.model_validate(shared_requirements()))
        self.assertEqual(len(r['coverage']),9);self.assertEqual(len(r['operations']),2)
        ids={o['id'] for o in r['operations']}
        self.assertTrue(all(set(c['operation_ids'])<=ids for c in r['coverage']))
        self.assertTrue(all(b['query_id'] in ids and b.get('denominator_query_id',b['query_id']) in ids for b in r['feature_bindings']))
        warehouse=FixtureWarehouse(self.catalog.overlay);self.addCleanup(warehouse.close)
        p=self.pipeline(f.scripted(shared_requirements()),executor=Mock(wraps=warehouse))
        request=self.request('So sánh doanh thu theo loại đơn trong 45 ngày gần nhất; tính tỷ trọng doanh thu.')
        proposal=p.propose(request);f.approve(request,proposal);report=p.generate(request)
        self.assertEqual(p.provider.call_count,1);self.assertEqual(p.executor.call_count,2)
        self.assertEqual(report['quality_assessment']['score'],90)
        self.assertEqual(report['quality_assessment'],verify_saved_report(report,self.catalog))
        self.assertEqual(len(report['evidence']),len({e['id'] for e in report['evidence']}))

    def test_distinct_population_metric_filter_and_time_are_not_reused(self):
        r=AnalyticalResolver(self.catalog,f.REFERENCE).resolve(AnalysisIntentEnvelope.model_validate(f.envelope(
            req('a',['revenue'],['order_type'],days=45),req('b',['revenue'],['order_type'],days=60),
            req('c',['revenue'],['order_type'],days=45,filters=[dict(dimension='city',value='Hà Nội')]),
            req('d',['aov'],['store'],days=45),req('e',['store_aov'],['store'],days=45))))
        self.assertEqual(len(r['operations']),5)

    def test_genuine_nine_distinct_operations_still_fail_closed(self):
        raw=f.envelope(*[req('scope_'+str(i),['revenue'],['order_type'],days=i+1) for i in range(9)])
        with self.assertRaises(AnalysisError) as error:
            AnalyticalResolver(self.catalog,f.REFERENCE).resolve(AnalysisIntentEnvelope.model_validate(raw))
        self.assertEqual(error.exception.category,'requested_scope_too_large')
