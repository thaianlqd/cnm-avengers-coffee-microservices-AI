"""Codex continuation: regressions reproduced after the handoff baseline."""
import json
from tests import test_hybrid_v28 as f
from tests.test_v32_mission_reliability import Guarded, ScriptedProvider


class RepairAnchorSerializationTests(f.unittest.TestCase):
    setUp = f.HybridTests.setUp
    pipeline = f.HybridTests.pipeline
    request = f.HybridTests.request

    def test_non_cohort_metadata_lists_and_scalar_values_are_preserved(self):
        from services.hybrid_analyst_planner import repair_anchor_context
        source = dict(coordinated_dimensions=[['category', 'product']],
            dimensions=[dict(start=1, end=8, phrase='category', candidate_ids=['category'])],
            other_values=['month', 3, None], ui={'private': 'not forwarded'})
        actual = repair_anchor_context(source)
        self.assertEqual(actual, dict(coordinated_dimensions=[['category', 'product']],
            dimensions=[dict(candidate_ids=['category'])], other_values=['month', 3, None]))
        actual['coordinated_dimensions'][0].append('city')
        self.assertEqual(source['coordinated_dimensions'], [['category', 'product']])

    def test_draft_diagnostics_never_echo_unknown_ids_or_raw_filter_values(self):
        from services.hybrid_analyst_planner import draft_shapes
        raw={'requirements':[{'id':'safe','analysis_kind':[],
            'metric_ids':['revenue','do-not-echo'],'dimension_ids':[{},'city'],
            'filters':[{'dimension':[],'operator':{},'value':'do-not-echo'}]}]}
        shape=draft_shapes(raw,self.catalog)
        self.assertEqual(shape[0]['metric_ids'],['revenue'])
        self.assertEqual(shape[0]['analysis_kind'],'invalid')
        self.assertNotIn('do-not-echo',json.dumps(shape))

    def test_malformed_dependent_filter_can_repair_with_coordinated_axes(self):
        # Live receipt: malformed req_2.filters + two missing explicit axes
        # caused AttributeError while serializing coordinated_dimensions.
        # Raw malformed provider body was not retained; this recreates that
        # validation/repair boundary without claiming to be the exact body.
        sept = dict(kind='range', start='2026-09-01', end='2026-09-30')
        rank = f.requirement(id='req_1', metric_ids=['revenue'], dimension_ids=['city'],
            analysis_kind='ranking', ranking=dict(limit=5, metric_id='revenue', direction='bottom'),
            derived_features=[], time=sept)
        bad = f.requirement(id='req_2', metric_ids=['revenue'], dimension_ids=['store'],
            analysis_kind='aggregate', ranking=None, derived_features=[], time=sept,
            filters=[dict(dimension='city', operator='in', value='5 tỉnh này')])
        repaired = dict(decision='analyze', requirements=[
            dict(id='req_2', filters=[]),
            f.requirement(id='repair_add_payment', metric_ids=['revenue'], dimension_ids=['payment_method'],
                analysis_kind='aggregate', ranking=None, derived_features=[], time=sept)])
        provider = f.scripted(f.envelope(rank, bad), repaired)
        pipeline = self.pipeline(provider)
        proposal = pipeline.propose(self.request(
            'Top 5 tỉnh doanh thu thấp nhất tháng 9 năm 2026; phân tích chi nhánh và phương thức thanh toán chỉ trong 5 tỉnh này',
            analysis_depth='focused'))
        self.assertEqual(proposal['status'], 'proposal_ready')
        self.assertEqual(provider.call_count, 2)
        payload = json.loads(provider.requests[1]['messages'][0]['content'])
        primary_payload=json.loads(provider.requests[0]['messages'][0]['content'])
        self.assertEqual(primary_payload['cohort_contract']['references'][0]['dimension'],'city')
        self.assertEqual(set(primary_payload['cohort_contract']['references'][0]['goal_dimensions']),{'store','payment_method'})
        shapes=pipeline.semantic_info['draft_shapes']
        self.assertEqual(shapes[0]['phase'],'primary')
        self.assertEqual(shapes[0]['requirements'][1]['filters'][0]['value_kind'],'str')
        self.assertNotIn('5 tỉnh này',json.dumps(shapes,ensure_ascii=False))
        self.assertIn(['store', 'payment_method'], payload['request_anchors']['coordinated_dimensions'])
        queries = proposal['proposal']['analytical_queries']
        primary = next(q for q in queries if q['operation'] == 'ranking')
        dependent = [q for q in queries if q['role'] == 'requested' and q['operation'] != 'ranking']
        self.assertEqual({tuple(q['group_by']) for q in dependent}, {('store',), ('payment_method',)})
        self.assertTrue(all(q['cohort_scope_query_id'] == primary['id'] for q in dependent))
        pipeline.executor.assert_not_called()

    def test_repaired_multi_axis_ranking_is_bound_to_original_cohort(self):
        from evals.fixture_warehouse import FixtureWarehouse
        sept = dict(kind='range', start='2026-09-01', end='2026-09-30')
        ranking = dict(limit=5, metric_id='revenue', direction='bottom')
        rank = f.requirement(id='req_1', metric_ids=['revenue'], dimension_ids=['city'],
            analysis_kind='ranking', ranking=ranking, derived_features=[], time=sept)
        # Shape observed in codex-t3-multi-replay-1's server-owned intent:
        # dependent cross-tab carries a ranking after its malformed filter repairs.
        dependent = f.requirement(id='req_2', metric_ids=['revenue'],
            dimension_ids=['city', 'payment_method', 'store'], analysis_kind='cross_tab',
            ranking=ranking, derived_features=[], time=sept,
            filters=[dict(dimension='city', operator='in', value='5 tỉnh này')])
        provider = f.scripted(f.envelope(rank, dependent),
            dict(decision='analyze', requirements=[dict(id='req_2', filters=[])]))
        warehouse = FixtureWarehouse(self.catalog.overlay)
        self.addCleanup(warehouse.close)
        pipeline = self.pipeline(provider, executor=warehouse)
        request = self.request(
            'Top 5 tỉnh doanh thu thấp nhất tháng 9 năm 2026; phân tích chi nhánh và phương thức thanh toán chỉ trong 5 tỉnh này',
            analysis_depth='focused')
        proposal = pipeline.propose(request)
        queries = proposal['proposal']['analytical_queries']
        ranks = [q for q in queries if q['operation'] == 'ranking']
        self.assertEqual([q['group_by'] for q in ranks], [['city']])
        dependents = [q for q in queries if q['role'] == 'requested' and q['operation'] != 'ranking']
        self.assertEqual({tuple(q['group_by']) for q in dependents}, {('store',), ('payment_method',)})
        self.assertTrue(all(q.get('cohort_scope_query_id') == ranks[0]['id'] for q in dependents))
        report = pipeline.generate(f.approve(request, proposal))
        total = lambda q: sum(row['revenue'] or 0 for row in report['result_sets'][q['id']]['rows'])
        for query in dependents:
            self.assertAlmostEqual(total(query), total(ranks[0]))
        self.assertEqual(provider.call_count, 2)


class CohortRepairShapeTests(f.unittest.TestCase):
    setUp = f.HybridTests.setUp
    pipeline = f.HybridTests.pipeline
    request = f.HybridTests.request

    def case(self, axes, repaired_time=None, draft_features=(), repair_features=None, explicit_share=False):
        sept = dict(kind='range', start='2026-09-01', end='2026-09-30')
        rank = f.requirement(id='req_1', metric_ids=['revenue'], dimension_ids=['city'],
            analysis_kind='ranking', ranking=dict(limit=5, metric_id='revenue', direction='bottom'),
            derived_features=[], time=sept)
        malformed = f.requirement(id='req_2', metric_ids=['revenue'], dimension_ids=axes,
            analysis_kind='cross_tab', ranking=None, derived_features=list(draft_features), time=sept,
            filters=[dict(dimension='city', operator='in', value='5 tỉnh này')])
        patch = dict(id='req_2', filters=[], analysis_kind='aggregate', dimension_ids=['store'])
        if repaired_time: patch['time'] = repaired_time
        if repair_features is not None:patch['derived_features'] = repair_features
        provider = f.scripted(f.envelope(rank, malformed), dict(decision='analyze', requirements=[patch]))
        pipeline = self.pipeline(provider)
        return pipeline, provider, self.request(
            'Top 5 tỉnh doanh thu thấp nhất tháng 9 năm 2026; phân tích chi nhánh và phương thức thanh toán chỉ trong 5 tỉnh này'
            + ('; kèm tỷ trọng đóng góp doanh thu' if explicit_share else ''),
            analysis_depth='focused')

    def test_repair_equivalent_cohort_shape_is_canonicalized_before_frozen_field_guard(self):
        # Captured root: req_2 malformed filter, missing store/payment axes;
        # repair changed analysis_kind or dimension_ids and was blocked. The
        # raw provider bodies were not retained; cover both plausible shapes.
        for axes in (['city', 'store', 'payment_method'], ['store', 'payment_method']):
            with self.subTest(axes=axes):
                pipeline, provider, request = self.case(axes)
                proposal = pipeline.propose(request)
                operations = proposal['proposal']['analytical_queries']
                rank = next(q for q in operations if q['operation']=='ranking')
                dependent = [q for q in operations if q['role']=='requested' and q['operation']!='ranking']
                self.assertEqual({tuple(q['group_by']) for q in dependent}, {('store',), ('payment_method',)})
                self.assertTrue(all(q['cohort_scope_query_id']==rank['id'] for q in dependent))
                self.assertEqual(provider.call_count,2)
                pipeline.executor.assert_not_called()

    def test_cohort_shape_equivalence_never_unlocks_protected_period(self):
        pipeline, provider, request = self.case(['city', 'store', 'payment_method'],
            dict(kind='range', start='2026-08-01', end='2026-08-31'))
        with self.assertRaises(f.AnalysisError):pipeline.propose(request)
        self.assertEqual(pipeline.semantic_info['failure_code'],'untargeted_field_changed')
        pipeline.executor.assert_not_called()

    def test_malformed_sibling_may_drop_only_model_added_optional_features(self):
        pipeline, provider, request = self.case(['city', 'store', 'payment_method'],
            draft_features=['contribution_share'], repair_features=[])
        proposal=pipeline.propose(request)
        self.assertEqual(proposal['status'],'proposal_ready')
        self.assertEqual(provider.call_count,2)
        pipeline.executor.assert_not_called()

    def test_repair_cannot_drop_user_requested_feature_with_cohort_shape_change(self):
        pipeline, provider, request = self.case(['city', 'store', 'payment_method'],
            draft_features=['contribution_share'], repair_features=[], explicit_share=True)
        with self.assertRaises(f.AnalysisError):pipeline.propose(request)
        pipeline.executor.assert_not_called()


class CanonicalCompanionTests(f.unittest.TestCase):
    setUp = f.HybridTests.setUp
    pipeline = f.HybridTests.pipeline
    request = f.HybridTests.request

    def test_metric_suffix_and_calendar_month_cannot_become_recurring_cadence(self):
        from services.request_anchors import request_anchors
        question='Số khách mua hàng tháng 9 năm 2026 tại Hồ Chí Minh'
        anchors=request_anchors(question,self.catalog,{})
        self.assertEqual(anchors['granularities'],[])
        provider=f.scripted()
        proposal=self.pipeline(provider).propose(self.request(question,input_mode='guided',
            analysis_mission='overview',guided_contract={'metric':'purchasing_customer_count'},
            time={'mode':'custom','start':'2026-09-01','end':'2026-09-30'},analysis_depth='focused'))
        self.assertEqual(proposal['status'],'proposal_ready')
        self.assertEqual(provider.call_count,0)
        # The repeated noun/cadence boundary is an actual monthly request.
        recurring=request_anchors('Số khách mua hàng hàng tháng trong năm 2026',self.catalog,{})
        self.assertEqual({g for a in recurring['granularities'] for g in a['candidate_ids']},{'month'})

    def test_canonical_comparison_cannot_spawn_specialized_companion(self):
        # Exact bounded draft shape retained in final policy26 compare receipt.
        for metric, axis, members in [('store_revenue','city',['Hồ Chí Minh','Hà Nội']),
                                      ('payment_revenue','payment_method',['COD','VNPAY'])]:
            with self.subTest(metric=metric):
                from services.request_anchors import request_anchors
                from services.semantic_preflight_contract import metric_locks,enforce_metric_locks
                from services.analysis_intent import AnalysisIntentEnvelope
                dim_label='tỉnh/thành' if axis=='city' else 'phương thức thanh toán'
                question=f'So sánh doanh thu theo {dim_label} giữa {members[0]} và {members[1]} tháng 9 năm 2026'
                req=f.requirement(analysis_kind='comparison',metric_ids=['revenue',metric],
                    dimension_ids=[axis],ranking=None,derived_features=['group_gap'],
                    filters=[dict(dimension=axis,operator='in',value=members)])
                intent=AnalysisIntentEnvelope.model_validate(f.envelope(req))
                anchors=request_anchors(question,self.catalog,{})
                out,_,_=enforce_metric_locks(intent,metric_locks(anchors,self.catalog.registry),self.catalog)
                self.assertEqual(out.requirements[0].metric_ids,['revenue'])

    def test_explicit_qualified_companion_is_preserved(self):
        from services.request_anchors import request_anchors
        from services.semantic_preflight_contract import metric_locks,enforce_metric_locks
        from services.analysis_intent import AnalysisIntentEnvelope
        req=f.requirement(analysis_kind='comparison',metric_ids=['revenue','store_revenue'],
            dimension_ids=['city'],ranking=None,derived_features=['group_gap'])
        anchors=request_anchors('So sánh doanh thu và doanh thu chi nhánh theo tỉnh/thành',self.catalog,{})
        out,_,_=enforce_metric_locks(AnalysisIntentEnvelope.model_validate(f.envelope(req)),
            metric_locks(anchors,self.catalog.registry),self.catalog)
        self.assertEqual(out.requirements[0].metric_ids,['revenue','store_revenue'])

    def test_grouping_or_filter_does_not_qualify_a_replacement_definition(self):
        from services.request_anchors import request_anchors
        from services.semantic_preflight_contract import metric_locks,enforce_metric_locks
        from services.analysis_intent import AnalysisIntentEnvelope
        cases=[('Top 5 cửa hàng có doanh thu cao nhất tháng 9 năm 2026','store_revenue','store'),
               ('So sánh doanh thu kiosk với chi nhánh chính tại Hà Nội năm 2026','store_revenue','store_type'),
               ('Doanh thu theo phương thức thanh toán năm 2026','payment_revenue','payment_method')]
        for question,metric,axis in cases:
            with self.subTest(axis=axis):
                req=f.requirement(metric_ids=[metric],dimension_ids=[axis],analysis_kind='aggregate',
                    ranking=None,derived_features=[])
                anchors=request_anchors(question,self.catalog,{})
                intent=AnalysisIntentEnvelope.model_validate(f.envelope(req))
                out,changes,_=enforce_metric_locks(intent,metric_locks(anchors,self.catalog.registry),self.catalog)
                self.assertEqual(out.requirements[0].metric_ids,['revenue'])
                self.assertTrue(changes)
                self.assertEqual(out.requirements[0].dimension_ids,[axis])

    def test_explicit_specialized_definition_protects_only_exact_declared_equivalents(self):
        from services.request_anchors import request_anchors
        from services.semantic_preflight_contract import metric_locks,enforce_metric_locks
        from services.analysis_intent import AnalysisIntentEnvelope
        from unittest.mock import patch
        anchors=request_anchors('Doanh thu và doanh thu sản phẩm trong 90 ngày gần nhất',self.catalog,{})
        locks=metric_locks(anchors,self.catalog.registry)
        intent=AnalysisIntentEnvelope.model_validate(f.envelope(f.requirement(
            metric_ids=['revenue','item_revenue'],dimension_ids=[],analysis_kind='aggregate',
            ranking=None,derived_features=[])))
        out,_,_=enforce_metric_locks(intent,locks,self.catalog)
        self.assertEqual(out.requirements[0].metric_ids,['revenue','item_revenue'])
        # A shared noun or group tag cannot protect a measure with a different
        # expression/grain; the existing exact-equivalence contract is required.
        with patch.dict(self.catalog.registry['metrics']['item_revenue'],{'expression':'COUNT(*)'}):
            changed,_,_=enforce_metric_locks(intent,locks,self.catalog)
            self.assertEqual(changed.requirements[0].metric_ids,['revenue'])

    def test_governed_population_qualifier_preserves_non_null_cohort(self):
        from services.request_anchors import request_anchors
        from services.semantic_preflight_contract import metric_locks,enforce_metric_locks
        from services.analysis_intent import AnalysisIntentEnvelope
        from unittest.mock import patch
        anchors=request_anchors('Số đơn dùng từng voucher trong 60 ngày gần nhất',self.catalog,{})
        locks=metric_locks(anchors,self.catalog.registry)
        intent=AnalysisIntentEnvelope.model_validate(f.envelope(f.requirement(
            metric_ids=['voucher_order_count'],dimension_ids=['promotion'],analysis_kind='aggregate',
            ranking=None,derived_features=[])))
        out,_,_=enforce_metric_locks(intent,locks,self.catalog)
        self.assertEqual(out.requirements[0].metric_ids,['voucher_order_count'])
        with patch.dict(self.catalog.registry['metrics']['voucher_order_count'],{'required_non_null':[]}):
            changed,_,_=enforce_metric_locks(intent,locks,self.catalog)
            self.assertEqual(changed.requirements[0].metric_ids,['order_count'])


class CohortSelectionIdentityTests(f.unittest.TestCase):
    setUp = f.HybridTests.setUp
    pipeline = f.HybridTests.pipeline
    request = f.HybridTests.request

    def test_repeated_cohort_references_keep_raw_clause_boundaries(self):
        from services.request_anchors import request_anchors
        from services.input_integrity_service import validate
        question=('Bottom 5 tỉnh theo doanh thu tháng 9 năm 2026; '
            'tổng doanh thu, số đơn và giá trị đơn trung bình chỉ trong 5 tỉnh này; '
            'doanh thu theo phương thức thanh toán chỉ trong các tỉnh này; '
            'doanh thu theo ngày chỉ trong các tỉnh này')
        self.assertTrue(validate(question,self.catalog)['can_submit'])
        refs=request_anchors(question,self.catalog,{})['cohort_references']
        self.assertEqual(len(refs),3)
        self.assertFalse(any(r['independent_scalar_metrics'] for r in refs))
        for unknown in ['Trên Mây','Này Khác']:
            self.assertFalse(validate('Doanh thu tỉnh '+unknown+'; doanh thu tháng 9 năm 2026',self.catalog)['can_submit'])

    def proposal(self, duplicate=False, scalar=False, independent=False, supporting=False):
        period=dict(kind='range',start='2026-09-01',end='2026-09-30')
        rank=f.requirement(id='rank',metric_ids=['revenue'],dimension_ids=['city'],
            analysis_kind='ranking',ranking=dict(limit=5,metric_id='revenue',direction='bottom'),
            derived_features=[],time=period)
        reqs=[rank]
        if duplicate:reqs.append(dict(rank,id='rank_copy',derived_features=['selected_total','leader']))
        reqs.append(f.requirement(id='children',metric_ids=['revenue'],dimension_ids=['city','store','payment_method'],
            analysis_kind='cross_tab',ranking=None,derived_features=[],time=period,
            **({'supporting_for':'rank'} if supporting else {})))
        if scalar:reqs.append(f.requirement(id='scalar',metric_ids=['revenue'],dimension_ids=[],
            analysis_kind='aggregate',ranking=None,derived_features=['scalar'],time=period))
        question=('Tổng doanh thu toàn quốc tháng 9 năm 2026; ' if independent else '')+(
            'Bottom 5 tỉnh theo doanh thu tháng 9 năm 2026; phân tích chi nhánh và phương thức thanh toán chỉ trong 5 tỉnh này')
        return self.pipeline(f.scripted(f.envelope(*reqs))).propose(self.request(question,analysis_depth='focused'))

    def test_equivalent_rank_requirements_do_not_disable_cohort_binding(self):
        # Recreates the retained post-repair shape from policy24 replay1,
        # including different optional features on the duplicate selection.
        queries=self.proposal(duplicate=True)['proposal']['analytical_queries']
        ranks=[q for q in queries if q['operation']=='ranking']
        children=[q for q in queries if q['role']=='requested' and q['operation']!='ranking']
        self.assertEqual(len(ranks),1)
        self.assertEqual({tuple(q['group_by']) for q in children},{('store',),('payment_method',)})
        self.assertTrue(all(q.get('cohort_scope_query_id')==ranks[0]['id'] for q in children))

    def test_explicit_dependent_axes_cannot_be_downgraded_to_optional_work(self):
        queries=self.proposal(supporting=True)['proposal']['analytical_queries']
        children=[q for q in queries if q['role']=='requested' and q['operation']!='ranking']
        self.assertEqual({tuple(q['group_by']) for q in children},{('store',),('payment_method',)})

    def test_unasked_scalar_in_cohort_request_cannot_become_a_national_total(self):
        queries=self.proposal(scalar=True)['proposal']['analytical_queries']
        rank=next(q for q in queries if q['operation']=='ranking')
        scalar=next(q for q in queries if q['role']=='requested' and not q['group_by'])
        self.assertEqual(scalar.get('cohort_scope_query_id'),rank['id'])

    def test_explicit_independent_scalar_remains_national(self):
        queries=self.proposal(scalar=True,independent=True)['proposal']['analytical_queries']
        scalar=next(q for q in queries if q['role']=='requested' and not q['group_by'])
        self.assertIsNone(scalar.get('cohort_scope_query_id'))

    def test_different_ranked_selections_require_clarification_before_execution(self):
        from services.analytical_resolver import AnalyticalResolver
        from services.analysis_catalog import AnalysisError
        from copy import deepcopy
        resolver=AnalyticalResolver(self.catalog,f.REFERENCE,
            {'cohort_references':[{'dimension':'city','goal_dimensions':['store'],'goal_metrics':[]}]})
        a={'id':'a','operation':'ranking','subject':'orders','group_by':['city'],
            'ranking':{'metric':'revenue','direction':'ASC','top_n':5,'per_group':[]},
            'filters':[],'time':{'kind':'range','start':'2026-09-01','end':'2026-09-30'}}
        b=deepcopy(a);b['id']='b';b['ranking']['direction']='DESC'
        with self.assertRaises(AnalysisError) as caught:resolver.bind_dependent_goals([a,b],{'a':[a],'b':[b]})
        self.assertEqual(caught.exception.category,'ranking_scope_ambiguous')


class RiskSnapshotClockTests(Guarded):
    def test_mission_hint_cannot_admit_budget_or_change_it_during_execution(self):
        from services.analytical_capacity_planner import QueryBudget, AnalyticalCapacityContract, request_sql_budget
        from services.mission_contract_service import admit_guided_sql_budget
        from services.analysis_catalog import AnalysisError
        budget = QueryBudget(AnalyticalCapacityContract(operations=8))
        token = request_sql_budget.set(budget)
        self.addCleanup(lambda: request_sql_budget.reset(token))
        for context in [dict(analysis_mission='risk_watch', guided_intent={'requirements': []}),
                        dict(analysis_mission='risk_watch', guided_mission_id='overview', guided_intent={'requirements': []})]:
            admit_guided_sql_budget(self.catalog, context)
            self.assertEqual(budget.limit, 19)
            self.assertIsNone(budget.mission_binding)
        budget.reserve('execute')
        with self.assertRaises(AnalysisError) as caught:
            budget.admit_governed_mission('risk_watch', self.catalog.fingerprint, 12)
        self.assertEqual(caught.exception.category, 'capacity_requires_choice')

    def test_validated_server_mission_and_sql_budget_share_the_declared_ceiling(self):
        import os
        from unittest.mock import patch
        from common import AiTextToReportRequest
        from tests.test_v32_mission_reliability import REFERENCE
        from services.analytical_capacity_planner import QueryBudget, AnalyticalCapacityContract, request_sql_budget
        provider = ScriptedProvider()
        budget = QueryBudget(AnalyticalCapacityContract(operations=8))
        token = request_sql_budget.set(budget)
        self.addCleanup(lambda: request_sql_budget.reset(token))
        with patch.dict(os.environ, {'DATA_ANALYST_CAPACITY_OPERATIONS': '8'}):
            proposal = self.pipeline(provider).propose(AiTextToReportRequest(
                question='Kiểm tra rủi ro vận hành tháng 9 năm 2026', reference_date=REFERENCE,
                analysis_mission='risk_watch', analysis_depth='deep',
                time={'mode': 'custom', 'start': '2026-09-01', 'end': '2026-09-30'}))
        queries = proposal['proposal']['analytical_queries']
        mission = next(m for m in self.registry['analysis_missions'] if m['id'] == 'risk_watch')
        self.assertLessEqual(len(queries), mission['max_operations'])
        self.assertGreaterEqual(budget.limit, 2 * len(queries) + 3)
        # Admitting the governed physical attempt ceiling changes no row/byte
        # capacity and does not rewrite the generic model operation contract.
        self.assertEqual(budget.contract.operations, 8)
        requested = {m for q in queries if q['role'] == 'requested' for m in q['metrics']}
        self.assertEqual(requested, {s['metric'] for s in self.registry['risk_signals']})
        self.assertEqual(provider.call_count, 0)

    def test_bounded_risk_includes_labeled_current_snapshot_without_partial_approval(self):
        from unittest.mock import patch
        from evals import fixture_warehouse as warehouse
        from evals.rich_fixture import rich_world
        # The minimal fixture has no delivery assignments. This acceptance
        # requires observed terminal deliveries and every other risk source.
        self.enterContext(patch.dict(warehouse.DATA, rich_world()))
        provider = ScriptedProvider()
        _, report = self.report(provider,
            question='Kiểm tra rủi ro vận hành tháng 9 năm 2026',
            analysis_mission='risk_watch', analysis_depth='deep',
            time={'mode': 'custom', 'start': '2026-09-01', 'end': '2026-09-30'},
            analysis_scope={'mode': 'selected', 'filters': [
                {'dimension': 'city', 'operator': 'in', 'value': ['Hồ Chí Minh']}]})
        self.assertEqual(provider.call_count, 0)
        snapshot_metrics = {s['metric'] for s in self.registry['risk_signals']
                            if self.registry['metrics'][s['metric']].get('historical_capability') == 'snapshot'}
        snapshots = [q for q in report['analytical_queries'] if set(q['metrics']) & snapshot_metrics]
        self.assertTrue(snapshots)
        for query in snapshots:
            self.assertEqual({k: v for k, v in query['time'].items() if v is not None},
                             {'kind': 'relative', 'mode': 'all_time'})
            self.assertTrue(all(f['value'] == ['Hồ Chí Minh'] for f in query['filters'] if f['dimension'] == 'city'))
            charts = [c for c in report['charts'] if c.get('query_id') == query['id']]
            self.assertTrue(charts)
            self.assertTrue(all('hiện trạng' in c['title'].lower() for c in charts))
        for query in report['analytical_queries']:
            if not set(query['metrics']) & snapshot_metrics:
                self.assertEqual((query['time']['start'], query['time']['end']), ('2026-09-01', '2026-09-30'))

    def test_snapshot_exception_requires_server_mission_and_declared_clock(self):
        from services.mission_contract_service import allows_current_risk_snapshot
        metric = next(s['metric'] for s in self.registry['risk_signals']
                      if self.registry['metrics'][s['metric']].get('historical_capability') == 'snapshot')
        context = dict(analysis_mission='risk_watch', risk_snapshot_metrics=[metric], guided_intent={
            'requirements': [dict(metric_ids=[metric], time=dict(kind='relative', mode='all_time'))]})
        self.assertTrue(allows_current_risk_snapshot(context, self.registry['metrics'], [metric]))
        for update in [dict(analysis_mission='overview'), dict(risk_snapshot_metrics=[]), dict(guided_intent={})]:
            self.assertFalse(allows_current_risk_snapshot({**context, **update}, self.registry['metrics'], [metric]))
