"""Real resolution/repair contracts; no provider or warehouse transport."""
from unittest.mock import patch
from datetime import date
from services.analysis_intent import intent_tool, AnalysisIntentEnvelope
from services.analysis_catalog import AnalysisError
from services.analytical_resolver import AnalyticalResolver, ResolutionIssues
from services.time_resolution_service import resolve_time
from services.analysis_pipeline import safe_failure
from tests import test_hybrid_v28 as f


class SemanticRecoveryBoundaries(f.unittest.TestCase):
    setUp = f.HybridTests.setUp
    pipeline = f.HybridTests.pipeline
    request = f.HybridTests.request

    def test_provider_time_grammar_is_complete_in_primary_delta_and_repair(self):
        from services.analysis_intent import repair_tool
        for tool, path in [(intent_tool(), ('requirements','items')),
                           (intent_tool(delta=True), ('changes','items')),
                           (repair_tool([dict(requirement_id='r1',field='time',code='invalid_time_shape')]), ('requirements','items'))]:
            item = tool['parameters']['properties'][path[0]][path[1]]['properties']
            time = item['changes']['properties']['time'] if path[0]=='changes' else item['time']
            branches = {b['properties']['kind']['enum'][0]: b for b in time['anyOf']}
            self.assertEqual(branches['relative']['required'], ['kind','mode'])
            self.assertNotIn('custom', branches['relative']['properties']['mode']['enum'])
            self.assertEqual(branches['range']['required'], ['kind','start','end'])
            self.assertNotIn('mode', branches['range']['properties'])

    def test_invalid_calendar_inputs_are_precise_time_issues(self):
        for time in [dict(kind='relative'), dict(kind='relative',mode='custom'),
                     dict(kind='quarter'), dict(kind='range',start='2026-10-01'),
                     dict(kind='day',year=2026,month=2,day=30),
                     dict(kind='rolling',amount=121,unit='month'),
                     dict(kind='relative',mode='all_time',month=2)]:
            with self.subTest(time=time):
                intent = AnalysisIntentEnvelope.model_validate(f.envelope(f.requirement(time=time)))
                with self.assertRaises(ResolutionIssues) as caught:
                    AnalyticalResolver(self.catalog,f.REFERENCE).resolve(intent)
                self.assertEqual(caught.exception.issues[0]['field'], 'time')
                self.assertEqual(caught.exception.issues[0]['code'], 'invalid_time_shape')

    def test_business_errors_preserve_category_without_repair(self):
        p = self.pipeline(f.scripted(f.envelope()))
        with patch.object(AnalyticalResolver,'resolve_requirement', side_effect=AnalysisError('capacity_requires_choice','smaller scope')):
            with self.assertRaises(AnalysisError) as caught: p.propose(self.request())
        self.assertEqual(caught.exception.category,'capacity_requires_choice')
        self.assertEqual(p.provider.call_count,1)
        p.executor.assert_not_called()

    def test_internal_errors_never_request_time_repair_or_expose_exception_text(self):
        for error in [KeyError('secret-example'),TypeError('secret-example'),ValueError('secret-example')]:
            p = self.pipeline(f.scripted(f.envelope()))
            with patch.object(AnalyticalResolver,'resolve_requirement', side_effect=error):
                with self.assertRaises(AnalysisError) as caught: p.propose(self.request())
            self.assertEqual(caught.exception.category,'resolver_internal')
            self.assertEqual(p.provider.call_count,1)
            self.assertEqual(p.semantic_info['failure_stage'],'ANALYTICAL_RESOLUTION')
            failure = safe_failure(caught.exception,p.calls,p.semantic_info)
            self.assertNotIn('secret-example',str(failure))
            self.assertEqual(failure['outcome'],'SYSTEM_ERROR')
            p.executor.assert_not_called()

    def test_time_repair_preserves_metrics_grouping_and_ranking(self):
        broken = f.envelope(f.requirement(time=dict(kind='relative')))
        fixed = dict(decision='analyze',requirements=[dict(id='r1',time=dict(kind='rolling',amount=30,unit='day'))])
        p = self.pipeline(f.scripted(broken,fixed))
        proposal = p.propose(self.request())
        self.assertEqual(p.provider.call_count,2)
        self.assertEqual(proposal['status'],'proposal_ready')
        query = proposal['proposal']['analytical_queries'][0]
        self.assertEqual(query['ranking']['metric'],'product_revenue')
        self.assertEqual(query['group_by'],['product'])
        self.assertEqual(query['metrics'],['product_revenue','quantity_sold'])
        p.executor.assert_not_called()

    def test_default_partial_calendar_and_rolling_scopes_remain_supported(self):
        for time in [dict(kind='relative',mode='all_time'),dict(kind='quarter',quarter=3),
                     dict(kind='month',month=9),dict(kind='rolling',amount=30,unit='day')]:
            scope,_,period = resolve_time(time,date(2026,10,9),'Asia/Ho_Chi_Minh')
            self.assertEqual(scope.mode,'all_time' if time['kind']=='relative' else 'custom')
            self.assertEqual(period['timezone'],'Asia/Ho_Chi_Minh')

    def test_unspecified_time_is_consistent_across_domains_and_repair_additions(self):
        from services.request_anchors import request_anchors, complete_default_time
        for question, metrics, dimension in [('Đánh giá doanh thu và xếp hạng hiệu suất các chi nhánh',['store_revenue'],'store'),
                                               ('Số giao dịch theo cổng thanh toán',['transaction_count'],'payment_gateway'),
                                               ('Số lượng bán theo sản phẩm',['quantity_sold'],'product')]:
            original = AnalysisIntentEnvelope.model_validate(f.envelope(f.requirement(
                metric_ids=metrics,dimension_ids=[dimension],time=dict(kind='relative',mode='current_month'))))
            normalized,changes = complete_default_time(original,request_anchors(question,self.catalog,{}),question,self.catalog,f.REFERENCE)
            self.assertEqual(normalized.requirements[0].time.mode,'all_time')
            self.assertEqual(changes[0]['rule'],'unspecified_time_all_time')
            self.assertEqual(original.requirements[0].time.mode,'current_month')

    def test_explicit_calendar_and_ui_time_never_receive_default_policy(self):
        from services.request_anchors import request_anchors, complete_default_time
        intent = AnalysisIntentEnvelope.model_validate(f.envelope())
        for question, ui in [('Doanh thu tháng 9',{}),('Doanh thu tháng trước',{}),
                             ('Doanh thu trong 30 ngày gần nhất',{}),
                             ('Doanh thu',dict(required_period=dict(start='2026-10-01',end='2026-10-09')))]:
            normalized,changes = complete_default_time(intent,request_anchors(question,self.catalog,ui),question,self.catalog,f.REFERENCE)
            self.assertEqual(normalized,intent)
            self.assertEqual(changes,[])

    def test_stored_redundant_bounds_are_admitted_only_when_exact(self):
        req = f.requirement(time=dict(kind='rolling',amount=30,unit='day',start='2026-09-09',end='2026-10-08'))
        resolver = AnalyticalResolver(self.catalog,f.REFERENCE)
        intent = AnalysisIntentEnvelope.model_validate(f.envelope(req))
        self.assertTrue(resolver.resolve(intent)['operations'])
        intent.requirements[0].time.start = date(2026,9,1)
        with self.assertRaises(ResolutionIssues) as caught: resolver.resolve(intent)
        self.assertEqual(caught.exception.issues[0]['code'],'invalid_time_shape')

    def test_observed_branch_question_repair_executes_and_renders_verified_chart(self):
        from evals.fixture_warehouse import FixtureWarehouse
        from services.analysis_quality_service import verify_saved_report
        warehouse = FixtureWarehouse(self.catalog.overlay)
        self.addCleanup(warehouse.close)
        branch = f.requirement(domain_id='stores',metric_ids=['store_revenue'],dimension_ids=['store'],
            ranking=dict(limit=10,metric_id='store_revenue'),derived_features=[],
            time=dict(kind='relative',mode='current_month'))
        p = self.pipeline(f.scripted(dict(decision='clarification'),f.envelope(branch)), executor=warehouse)
        request = self.request('Đánh giá doanh thu và xếp hạng hiệu suất các chi nhánh')
        proposal = p.propose(request)
        self.assertEqual(p.provider.call_count,2)
        self.assertTrue(all(q['time']['mode']=='all_time' for q in proposal['proposal']['analytical_queries']))
        f.approve(request,proposal)
        report = p.generate(request)
        self.assertEqual(report['outcome'],'SUCCESS')
        self.assertTrue(report['charts'])
        self.assertTrue(any(c['metric']=='store_revenue' for c in report['charts']))
        self.assertEqual(report['quality_assessment'],verify_saved_report(report,self.catalog))
        self.assertEqual(p.provider.call_count,2)
