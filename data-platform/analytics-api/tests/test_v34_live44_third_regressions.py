"""Run3 failures stay failures; offline fixes never rewrite paid evidence."""
from copy import deepcopy
import json
from pathlib import Path

from tests import test_hybrid_v28 as f
from tests import test_v34_ranked_companion as ranked_fixture
from services.analysis_intent import AnalysisIntentEnvelope
from services.analytical_resolver import AnalyticalResolver,ResolutionIssues
from services.domain_intelligence_service import DomainIntelligence
from services.semantic_candidate_service import candidate_packet
from services.request_anchors import request_anchors,complete_governed_roles

CAPTURES={r['id']:r for r in json.loads((Path(__file__).parent/'fixtures/v34_live44_rerun3_failed_intents.json').read_text())['cases']}


class ThirdRunRegressions(f.unittest.TestCase):
    setUp=f.HybridTests.setUp
    pipeline=f.HybridTests.pipeline
    request=f.HybridTests.request
    warehouse=ranked_fixture.RankedCompanionTests.warehouse

    def packet(self,question,ui=None):
        anchors=request_anchors(question,self.catalog,ui or {})
        before=deepcopy(anchors)
        packet,_=candidate_packet(self.catalog,AnalyticalResolver(self.catalog,f.REFERENCE).index,
            DomainIntelligence(self.catalog),anchors,question,ui or {})
        self.assertEqual(anchors,before)
        return packet.wire()

    def test_canonical_menu_does_not_offer_alias_claimants_as_six_requested_metrics(self):
        for id in ('L01','L03','L20','L32','L33'):
            with self.subTest(case=id):
                packet=self.packet(CAPTURES[id]['question'])
                expected=['revenue','store_revenue'] if id=='L32' else ['revenue']
                self.assertEqual(packet['explicit_metric_ids'],expected)
                self.assertEqual([r['id'] for r in packet['metrics']],expected)
                self.assertTrue(all(a['candidate_ids']==expected for a in packet['protected_input_facts']['metrics']))
                self.assertFalse({'product_revenue','item_revenue'} &
                    {r[0] for r in packet.get('related_metrics',[])})

    def test_precise_metrics_incompatible_product_axis_and_frozen_refinement_stay_available(self):
        packet=self.packet('Top 5 sản phẩm theo doanh thu')
        self.assertIn('product_revenue',packet['explicit_metric_ids'])
        packet=self.packet('Doanh thu thanh toán và doanh thu tháng 9 năm 2026')
        self.assertIn('payment_revenue',packet['explicit_metric_ids'])
        stored=f.envelope(f.requirement(metric_ids=['store_revenue'],dimension_ids=['city'],
            analysis_kind='aggregate',ranking=None,derived_features=[]))
        packet=self.packet('Doanh thu tháng 9 năm 2026',{'semantic_intent':stored})
        self.assertIn('store_revenue',packet['explicit_metric_ids'])

    def test_reasonless_limitation_targets_only_its_coupled_classification(self):
        raw=f.requirement(metric_ids=['revenue'],dimension_ids=[],analysis_kind='aggregate',ranking=None,
            derived_features=[],availability='needs_input',reason=None,time={'kind':'month','month':9,'year':2026})
        req=AnalysisIntentEnvelope.model_validate(f.envelope(raw)).requirements[0]
        resolver=AnalyticalResolver(self.catalog,f.REFERENCE)
        with self.assertRaises(ResolutionIssues) as caught:resolver.resolve_requirement(req)
        self.assertEqual({i['field'] for i in caught.exception.issues},{'availability','reason'})
        from services.hybrid_analyst_planner import HybridAnalystPlanner
        from types import SimpleNamespace
        planner=SimpleNamespace(catalog=self.catalog,reference=f.REFERENCE)
        before=AnalysisIntentEnvelope.model_validate(f.envelope(raw))
        after=AnalysisIntentEnvelope.model_validate(f.envelope({**raw,'availability':'requested'}))
        merged=HybridAnalystPlanner.merge_repair(planner,before,after,caught.exception.issues)
        self.assertEqual(merged.requirements[0].availability,'requested')
        changed=after.model_copy(deep=True);changed.requirements[0].time.month=8
        with self.assertRaises(ResolutionIssues):
            HybridAnalystPlanner.merge_repair(planner,before,changed,caught.exception.issues)

    def test_observed_reasonless_trend_repairs_explicit_metric_and_time_in_one_bounded_turn(self):
        capture=CAPTURES['L01'];outputs=deepcopy(capture['outputs'])
        for raw in outputs:raw.pop('clarification',None)
        pipeline=self.pipeline(f.scripted(*outputs))
        proposal=pipeline.propose(self.request(capture['question'],analysis_depth='focused'))
        self.assertEqual(pipeline.provider.call_count,2)
        req=proposal['diagnostics']['semantic_intent']['requirements'][0]
        self.assertEqual(req['metric_ids'],['revenue'])
        self.assertEqual(req['time']['amount'],30)
        self.assertEqual(req['time']['unit'],'day')
        self.assertEqual(req['granularity'],'week')
        self.assertEqual(req['availability'],'requested')
        self.assertTrue({'metric_ids','time','availability','reason'} <=
            {i['field'] for i in pipeline.semantic_info['root_contract_issues']})
        self.assertLessEqual(pipeline.semantic_info['repair_context_chars'],24000)

    def test_bottom_ranking_repair_targets_orphan_feature_binding_and_keeps_frozen_scope(self):
        capture=CAPTURES['L32'];outputs=deepcopy(capture['outputs'])
        for raw in outputs:raw.pop('clarification',None)
        # The historical repair omitted this field and must still fail. A
        # controlled correction explicitly clears the now-targeted orphan map.
        historical=self.pipeline(f.scripted(*deepcopy(outputs)))
        with self.assertRaises(f.AnalysisError):
            historical.propose(self.request(capture['question'],analysis_depth='focused'))
        historical.executor.assert_not_called()
        outputs[1]['requirements'][0]['feature_metrics']={}
        pipeline=self.pipeline(f.scripted(*outputs))
        proposal=pipeline.propose(self.request(capture['question'],analysis_depth='focused'))
        self.assertEqual(pipeline.provider.call_count,2)
        req=proposal['diagnostics']['semantic_intent']['requirements'][0]
        self.assertEqual(req['dimension_ids'],['city'])
        self.assertEqual(req['ranking']['direction'],'bottom')
        self.assertEqual(req['ranking']['limit'],3)
        self.assertEqual(req['time']['month'],9)
        self.assertIn('feature_metrics',{i['field'] for i in pipeline.semantic_info['root_contract_issues']})

    def test_captured_rate_ranking_discards_only_unrequested_invalid_total_and_keeps_companion(self):
        capture=CAPTURES['L43'];raw=deepcopy(capture['outputs'][0])
        raw.pop('clarification',None)  # Observer encoded a missing/null clarification as {}.
        pipeline=self.pipeline(f.scripted(raw),executor=self.warehouse())
        request=self.request(capture['question'],analysis_depth='focused')
        try:proposal=pipeline.propose(request)
        except f.AnalysisError:
            self.fail(json.dumps({k:pipeline.semantic_info.get(k) for k in
                ('root_contract_issues','contract_issues','semantic_normalizations')},ensure_ascii=False))
        report=pipeline.generate(f.approve(request,proposal))
        self.assertEqual(pipeline.provider.call_count,1)
        self.assertEqual(report['completion_status'],'complete')
        self.assertEqual(report['verification']['status'],'verified')
        requested=[q for q in report['analytical_queries'] if q['role']=='requested']
        self.assertEqual(len(requested),2)
        self.assertTrue(any(q.get('cohort_query_id') for q in requested))
        self.assertFalse(any(e['feature']=='selected_total' for e in report['evidence']))
        intent=AnalysisIntentEnvelope.model_validate(raw)
        anchors=request_anchors(capture['question'],self.catalog,{})
        anchors['features'].append({'candidate_ids':['selected_total']})
        preserved,_=complete_governed_roles(intent,anchors,self.catalog,capture['question'])
        self.assertIn('selected_total',preserved.requirements[0].derived_features)

    def test_scalar_comparison_shape_repair_targets_cadence_and_keeps_both_periods_frozen(self):
        from tests.test_v34_period_comparison import intent,QUESTION,PeriodComparisonTests
        from services.analysis_intent import repair_tool
        raw=intent();raw['requirements'][0]['granularity']='month'
        previous=AnalysisIntentEnvelope.model_validate(raw)
        resolver=AnalyticalResolver(self.catalog,f.REFERENCE)
        with self.assertRaises(ResolutionIssues) as caught:resolver.resolve(previous)
        self.assertEqual({i['field'] for i in caught.exception.issues},{'granularity'})
        tool=repair_tool(caught.exception.issues,previous)
        properties=tool['parameters']['properties']['requirements']['items']['properties']
        self.assertEqual(set(properties),{'id','granularity'})
        self.assertIn({'type':'null'},properties['granularity']['anyOf'])
        pipeline=self.pipeline(f.scripted(raw,f.envelope({'id':'r1','granularity':None})),
            executor=PeriodComparisonTests.warehouse(self))
        request=self.request(QUESTION,analysis_depth='focused')
        report=pipeline.generate(f.approve(request,pipeline.propose(request)))
        self.assertEqual(pipeline.provider.call_count,2)
        self.assertEqual(report['verification']['status'],'verified')
        self.assertEqual(len([q for q in report['analytical_queries'] if q['role']=='requested']),2)
        changed=f.envelope({'id':'r1','granularity':None,'comparison_time':{'kind':'month','month':7,'year':2026}})
        pipeline=self.pipeline(f.scripted(raw,changed))
        with self.assertRaises(f.AnalysisError):pipeline.propose(self.request(QUESTION))
        pipeline.executor.assert_not_called()

    def test_early_comparison_shape_guard_repairs_kind_without_unlocking_either_period(self):
        from tests import test_v34_period_comparison as periods
        raw=periods.intent();raw['requirements'][0].update(analysis_kind='trend',granularity='month')
        resolver=AnalyticalResolver(self.catalog,f.REFERENCE)
        with self.assertRaises(ResolutionIssues) as caught:
            resolver.resolve(AnalysisIntentEnvelope.model_validate(raw))
        self.assertEqual({i['field'] for i in caught.exception.issues},{'analysis_kind','granularity'})
        patch=f.envelope({'id':'r1','analysis_kind':'aggregate','granularity':None})
        pipeline=self.pipeline(f.scripted(raw,patch),executor=periods.PeriodComparisonTests.warehouse(self))
        request=self.request(periods.QUESTION,analysis_depth='focused')
        report=pipeline.generate(f.approve(request,pipeline.propose(request)))
        self.assertEqual(report['verification']['status'],'verified')
        self.assertEqual(pipeline.provider.call_count,2)
        self.assertNotIn('comparison_time',{i['field'] for i in pipeline.semantic_info['root_contract_issues']})
        bad=deepcopy(patch);bad['requirements'][0]['comparison_time']={'kind':'month','month':7,'year':2026}
        pipeline=self.pipeline(f.scripted(raw,bad))
        with self.assertRaises(f.AnalysisError):pipeline.propose(self.request(periods.QUESTION))
        pipeline.executor.assert_not_called()

    def test_repair_can_explicitly_remove_an_invented_baseline_but_omission_inherits_it(self):
        from services.analysis_intent import repair_tool
        from services.hybrid_analyst_planner import HybridAnalystPlanner
        from types import SimpleNamespace
        raw=f.envelope(f.requirement(metric_ids=['revenue'],dimension_ids=[],analysis_kind='aggregate',ranking=None,
            derived_features=[],time={'kind':'range','start':'2026-09-10','end':'2026-09-20'},
            comparison_time={'kind':'range','start':'2026-09-10','end':'2026-09-20'}))
        previous=AnalysisIntentEnvelope.model_validate(raw)
        planner=SimpleNamespace(parse=lambda d:AnalysisIntentEnvelope.model_validate(d))
        cleared=HybridAnalystPlanner.parse_repair(planner,{'decision':'analyze','requirements':[{'id':'r1','comparison_time':None}]},previous)
        inherited=HybridAnalystPlanner.parse_repair(planner,{'decision':'analyze','requirements':[{'id':'r1'}]},previous)
        self.assertIsNone(cleared.requirements[0].comparison_time)
        self.assertEqual(inherited.requirements[0].comparison_time,previous.requirements[0].comparison_time)
        self.assertEqual(cleared.requirements[0].time,previous.requirements[0].time)
        tool=repair_tool([{'requirement_id':'r1','field':'comparison_time','code':'explicit_comparison_time_conflict'}],previous)
        props=tool['parameters']['properties']['requirements']['items']['properties']
        self.assertEqual(set(props),{'id','comparison_time'})
        self.assertIn({'type':'null'},props['comparison_time']['anyOf'])
