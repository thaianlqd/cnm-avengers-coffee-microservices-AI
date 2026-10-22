"""Reproductions for AI_DATA_ANALYST_SYSTEM_RELIABILITY_PLAN_20261021 incidents.

Each test names its incident (I03, I07, I11, ...) and carries a positive
control in another family so a phrase-specific patch cannot pass alone.
"""
import json
from datetime import date
from unittest.mock import Mock, patch
import unittest

from services.preflight_service import run, overlay_physical
from services.analysis_catalog import AnalysisCatalog, CATALOG_PATH
from services.semantic_tools import SemanticTools

REF = date(2026, 10, 21)


class ReliabilityIncidentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        overlay = json.loads(CATALOG_PATH.read_text())
        cls.catalog = AnalysisCatalog(overlay_physical(overlay), overlay)

    def setUp(self):
        for target in ('requests.sessions.Session.request', 'psycopg2.connect',
                       'services.sql_service.execute_read_only'):
            self.enterContext(patch(target, side_effect=AssertionError('No external call: ' + target)))

    def preflight(self, q):
        return run(q, catalog=self.catalog, reference=REF, coverage={})

    def test_I07_comparison_template_round_trips_both_members(self):
        for q, members in [
            ('So sánh doanh thu theo tỉnh/thành giữa Hồ Chí Minh và Hà Nội tháng 9/2026', {'Hồ Chí Minh', 'Hà Nội'}),
            ('So sánh số đơn theo tỉnh/thành giữa Đà Nẵng và Cần Thơ tháng 9/2026', {'Đà Nẵng', 'Cần Thơ'}),
        ]:
            with self.subTest(q=q):
                r = self.preflight(q)
                self.assertTrue(r['can_submit'], r['findings'])
                self.assertFalse(any('giữa' in (f.get('message') or '') for f in r['findings']))
                bound = {v for f in r['scope_resolution']['filters'] if f['dimension'] == 'city'
                         for v in (f['value'] if isinstance(f['value'], list) else [f['value']])}
                self.assertEqual(bound, members)
        # Positive control: "giữa các <dimension>" is a grouping, not a value.
        r = self.preflight('So sánh doanh thu theo chi nhánh giữa các tỉnh tháng 9/2026')
        self.assertTrue(r['can_submit'], r['findings'])

    def test_I11_write_requests_are_blocked_before_any_job(self):
        for q in ['Xóa toàn bộ dữ liệu đơn hàng tháng 9/2026', 'Hãy xoá đơn bị hủy của Hà Nội',
                  'DROP TABLE orders', 'Vui lòng cập nhật dữ liệu doanh thu tháng 9/2026 thành 0']:
            with self.subTest(q=q):
                r = self.preflight(q)
                self.assertFalse(r['can_submit'])
                self.assertIn('input_write_unsupported', [f['code'] for f in r['findings']])
                self.assertEqual((r['provider_calls'], r['warehouse_queries']), (0, 0))
        # Controls: the same words used descriptively stay analytical.
        for q in ['Số đơn bị xóa khỏi giỏ tháng 9/2026', 'Doanh thu sau khi cập nhật dữ liệu gần nhất']:
            with self.subTest(control=q):
                self.assertTrue(self.preflight(q)['can_submit'])

    def test_I03_rare_member_outside_curated_enum_is_grounded_by_exact_lookup(self):
        warehouse = {'Ninh Thuận', 'Sóc Trăng', 'Bạc Liêu', 'Trà Vinh', 'Quảng Trị', 'Hồ Chí Minh'}
        calls = []

        def lookup(table, column, search, limit=8):
            calls.append(search)
            return [v for v in warehouse if search.lower() in v.lower()][:limit]

        tools = SemanticTools(self.catalog, lookup)
        for v in ['Ninh Thuận', 'Sóc Trăng', 'Bạc Liêu', 'Trà Vinh', 'Quảng Trị']:
            with self.subTest(v=v):
                self.assertEqual(tools.resolve({'dimension': 'city', 'reference': v}, allow_fallback=True)['value'], v)
                # Model-proposed values never reach the warehouse lookup.
                self.assertNotEqual(SemanticTools(self.catalog, lookup).resolve({'dimension': 'city', 'reference': v})['status'], 'resolved')
        # Curated aliases still resolve without a lookup; unknown names stay unknown.
        before = len(calls)
        self.assertEqual(tools.resolve({'dimension': 'city', 'reference': 'tphcm'})['value'], 'Hồ Chí Minh')
        self.assertEqual(len(calls), before)
        self.assertNotEqual(tools.resolve({'dimension': 'city', 'reference': 'Atlantis'}, allow_fallback=True)['status'], 'resolved')
        # Families without lookup_fallback keep their closed enum.
        no_fallback = [n for n, d in self.catalog.registry['dimensions'].items()
                       if d.get('value_grounding', {}).get('mode') == 'enum' and not d['value_grounding'].get('lookup_fallback')]
        self.assertTrue(no_fallback)


if __name__ == '__main__':
    unittest.main()


class CatalogAuthorityTests(unittest.TestCase):
    def test_I06_preflight_catalog_cache_is_keyed_by_access_projection(self):
        import time
        from services import preflight_service
        from services.access_policy import active_principal, Principal
        from tests.analysis_fixtures import physical_metadata
        meta = physical_metadata()
        with patch('services.metadata_service.peek_local_metadata', return_value=meta):
            preflight_service._catalog.update(key=None, value=None)
            anonymous = preflight_service.preflight_catalog()
            principal = Principal(subject='fixture-a', role='DATA_ANALYST', permissions=frozenset({'analytics.read'}),
                datasets=('silver.don_hang',), store_ids=(), national=True, policy_version='fixture-v1',
                access_fingerprint='access-a', expires_at=time.time() + 600)
            token = active_principal.set(principal)
            try:
                with patch('services.access_policy.current_principal', return_value=principal):
                    scoped = preflight_service.preflight_catalog()
                    fresh = AnalysisCatalog(meta, json.loads(CATALOG_PATH.read_text()))
                    self.assertIsNot(scoped, anonymous)
                    self.assertEqual(scoped.fingerprint, fresh.fingerprint)
                    self.assertIs(preflight_service.preflight_catalog(), scoped)  # still cached per access
            finally:
                active_principal.reset(token)
            self.assertIs(preflight_service.preflight_catalog(), preflight_service.preflight_catalog())


class MetricClockTests(unittest.TestCase):
    def test_I10_snapshot_metric_with_bounded_period_is_not_ready(self):
        from services import mission_contract_service as missions
        overlay = json.loads(CATALOG_PATH.read_text())
        catalog = AnalysisCatalog(overlay_physical(overlay), overlay)
        sept = {'mode': 'custom', 'start': '2026-09-01', 'end': '2026-09-30'}
        def pf(contract, time):
            return run('Liên hệ giữa hai chỉ số', time, None, 'relationship', REF, catalog=catalog, coverage={},
                       input_mode='guided', guided_contract=contract)
        pairs = missions._relationship_pairs(catalog.registry)
        grain = next(g for a, b, g in pairs if (a, b) == ('total_deliveries', 'driver_rating'))
        snap = {'metric': 'total_deliveries', 'metric_b': 'driver_rating', 'dimension': grain[0]}
        r = pf(snap, sept)
        self.assertFalse(r['can_submit']); self.assertIn('guided_contract_invalid', [f['code'] for f in r['findings']])
        # Positive controls: the same pair over all time, and a historical pair over September.
        self.assertNotIn('guided_contract_invalid', [f['code'] for f in pf(snap, {'mode': 'all_time'})['findings']])
        # Free text: the same pair over an explicit month is blocked before any provider call.
        free = run('Liên hệ giữa tổng chuyến giao và điểm hồ sơ tài xế theo mã tài xế tháng 9 năm 2026', None, None, None, REF,
                   catalog=catalog, coverage={})
        self.assertFalse(free['can_submit']); self.assertEqual(free['provider_calls'], 0)
        self.assertTrue(run('Liên hệ giữa tổng chuyến giao và điểm hồ sơ tài xế theo mã tài xế', None, None, None, REF,
                            catalog=catalog, coverage={})['can_submit'])
        # Historical metric over September in another mission is unaffected.
        r = run('Bottom 5 tỉnh theo doanh thu', sept, None, 'ranking', REF, catalog=catalog, coverage={}, input_mode='guided',
                guided_contract={'metric': 'revenue', 'dimension': 'city', 'n': 5, 'direction': 'bottom'})
        self.assertNotIn('guided_contract_invalid', [f['code'] for f in r['findings']], r['findings'])


class CoverageWordingTests(unittest.TestCase):
    def test_I12_single_group_is_reported_as_a_data_limit(self):
        from services.view_requirement_service import gap_kind
        for planned in (False, True):
            self.assertEqual(gap_kind('singleton', planned), 'LIMITED_DATA')
        self.assertEqual(gap_kind('mission_grammar', True), 'LIMITED_BY_MISSION')  # control


class AnaphoraTests(unittest.TestCase):
    def test_demonstrative_after_head_refers_back_not_a_new_name(self):
        from services import input_integrity_service as guard
        overlay = json.loads(CATALOG_PATH.read_text())
        catalog = AnalysisCatalog(overlay_physical(overlay), overlay)
        for q in ['So sánh doanh thu giữa TP.HCM và Hà Nội. Chỉ xét hai thành phố trên.',
                  'Top 5 tỉnh doanh thu thấp nhất tháng 9 năm 2026; phân tích chi nhánh và phương thức thanh toán chỉ trong 5 tỉnh này']:
            with self.subTest(q=q):
                self.assertTrue(guard.validate(q, catalog)['can_submit'])
        # Controls: real unknown names, including one starting with a demonstrative word, still block.
        for q in ['Doanh thu tỉnh Qzxn tháng 9', 'Doanh thu tại thành phố Trên Mây tháng 9']:
            with self.subTest(control=q):
                self.assertFalse(guard.validate(q, catalog)['can_submit'])


class RequestedGoalTests(unittest.TestCase):
    def test_I16_model_added_specialized_ranking_goal_is_dropped(self):
        from services.analysis_intent import AnalysisIntentEnvelope
        from services.request_anchors import request_anchors, normalize_explicit_metrics
        overlay = json.loads(CATALOG_PATH.read_text())
        catalog = AnalysisCatalog(overlay_physical(overlay), overlay)
        q = 'Bottom 5 tỉnh/thành trong dữ liệu theo doanh thu tháng 9 năm 2026'
        anchors = request_anchors(q, catalog, {})
        sept = {'kind': 'range', 'start': '2026-09-01', 'end': '2026-09-30'}
        def req(id, metric):
            return {'id': id, 'goal': 'Bottom 5', 'analysis_kind': 'ranking', 'metric_ids': [metric], 'dimension_ids': ['city'],
                    'time': sept, 'ranking': {'limit': 5, 'metric_id': metric, 'direction': 'bottom'}}
        intent = AnalysisIntentEnvelope.model_validate({'decision': 'analyze', 'requirements': [req('r1', 'revenue'), req('r2', 'store_revenue')]})
        out, changes = normalize_explicit_metrics(intent, anchors, catalog)
        self.assertEqual([r.metric_ids for r in out.requirements], [['revenue']])
        self.assertIn('unrequested_sibling_metric_duplicate', [c['rule'] for c in changes])
        # Control: a user who names "doanh thu chi nhánh" keeps that goal.
        q2 = 'Bottom 5 tỉnh theo doanh thu và doanh thu chi nhánh tháng 9 năm 2026'
        out2, _ = normalize_explicit_metrics(intent, request_anchors(q2, catalog, {}), catalog)
        self.assertEqual(len(out2.requirements), 2)


class FeatureNormalizationTests(unittest.TestCase):
    def test_only_unrequested_unreshapeable_features_are_dropped(self):
        from services.analysis_intent import AnalysisIntentEnvelope
        from services.analytical_resolver import drop_unrequested_feature_conflicts
        intent = AnalysisIntentEnvelope.model_validate({'decision': 'analyze', 'requirements': [{
            'id': 'r1', 'goal': 'g', 'analysis_kind': 'ranking', 'metric_ids': ['revenue', 'order_count'], 'dimension_ids': ['city'],
            'ranking': {'limit': 5, 'metric_id': 'revenue', 'direction': 'bottom'},
            'derived_features': ['selected_total', 'concentration'], 'feature_metrics': {'selected_total': ['order_count']}}]})
        out, changes = drop_unrequested_feature_conflicts(intent, {'features': []})
        r = out.requirements[0]
        self.assertNotIn('concentration', r.derived_features)  # unrequested and wrong shape
        # Binding noise is not silently cleaned: it stays for the governed repair to report.
        self.assertEqual(r.feature_metrics['selected_total'], ['order_count'])
        self.assertEqual({c['rule'] for c in changes}, {'unrequested_feature_shape_conflict'})


class RankingLabelTests(unittest.TestCase):
    def test_I08_bottom_ranking_is_never_named_top(self):
        from types import SimpleNamespace as NS
        from services.dashboard_planner_service import ranking_label
        self.assertEqual(ranking_label(NS(direction='ASC', top_n=5)), 'Bottom 5')
        self.assertEqual(ranking_label(NS(direction='DESC', top_n=3)), 'Top 3')
        import inspect, services.dashboard_planner_service as d, services.derived_chart_service as c
        for module in (d, c):
            self.assertNotIn('f"Top {a.plan.ranking.top_n}', inspect.getsource(module))


from tests.test_v32_mission_reliability import Guarded, ScriptedProvider  # noqa: E402


class RiskOneContractTests(Guarded):
    """I04/I05: Risk Watch with scope keeps the deterministic contract at any depth."""

    def propose(self, **request):
        from common import AiTextToReportRequest
        provider = ScriptedProvider()
        proposal = self.pipeline(provider).propose(AiTextToReportRequest(reference_date=REFERENCE_V32, **request))
        return provider, proposal

    def test_I04_scoped_free_text_risk_stays_on_risk_contract(self):
        base = dict(question='Kiểm tra rủi ro vận hành tháng 9 năm 2026', analysis_mission='risk_watch',
                    time={'mode': 'custom', 'start': '2026-09-01', 'end': '2026-09-30'})
        for depth in ('focused', 'deep', 'comprehensive'):
            for flag in (True, False):
                with self.subTest(depth=depth, upgrade=flag):
                    provider, proposal = self.propose(analysis_depth=depth, allow_deterministic_upgrade=flag,
                        analysis_scope={'mode': 'selected', 'filters': [{'dimension': 'city', 'operator': 'in', 'value': ['Hồ Chí Minh']}]},
                        **base)
                    self.assertEqual(provider.call_count, 0)
                    self.assertEqual(proposal['status'], 'proposal_ready', proposal.get('message'))
                    self.assertEqual(proposal['diagnostics'].get('guided_source'), 'auto_upgrade')
                    queries = proposal['proposal']['analytical_queries']
                    risk_metrics = {s['metric'] for s in self.registry['risk_signals']}
                    self.assertTrue(queries)
                    self.assertTrue({m for q in queries for m in q['metrics']} <= risk_metrics)
        provider, proposal = self.propose(**{**base, 'question': 'Kiểm tra rủi ro vận hành tháng 9 năm 2026 của thành phố hồ chí minh',
                                            'analysis_depth': 'deep'})
        self.assertEqual((provider.call_count, proposal['diagnostics'].get('guided_source')), (0, 'auto_upgrade'))
        # Scope written in the question itself is grounded, not a reason to switch model.
        provider, proposal = self.propose(**{**base, 'question': 'Kiểm tra rủi ro vận hành tại Hà Nội tháng 9 năm 2026'})
        self.assertEqual((provider.call_count, proposal['diagnostics'].get('guided_source')), (0, 'auto_upgrade'))


from tests.test_v32_mission_reliability import REFERENCE as REFERENCE_V32  # noqa: E402


class CohortScopeTests(Guarded):
    """I01/I09/I16: every view of a ranked goal stays inside the selected cohort."""

    def test_I01_supporting_views_never_leave_ranked_cohort(self):
        from common import AiTextToReportRequest
        for dim, direction in (('city', 'bottom'), ('store', 'top')):
            for depth in ('focused', 'deep', 'comprehensive'):
                with self.subTest(dim=dim, direction=direction, depth=depth):
                    provider = ScriptedProvider()
                    proposal = self.pipeline(provider).propose(AiTextToReportRequest(
                        reference_date=REFERENCE_V32, question=f"{direction.title()} 5 theo doanh thu tháng 9 năm 2026",
                        analysis_mission='ranking', input_mode='guided', analysis_depth=depth,
                        time={'mode': 'custom', 'start': '2026-09-01', 'end': '2026-09-30'},
                        guided_contract={'metric': 'revenue', 'dimension': dim, 'n': 5, 'direction': direction}))
                    self.assertEqual((proposal['status'], provider.call_count), ('proposal_ready', 0), proposal.get('message'))
                    ops = proposal['proposal']['analytical_queries']
                    ranking = [q for q in ops if q['operation'] == 'ranking']
                    self.assertEqual(len(ranking), 1)
                    scoped = [q for q in ops if q.get('cohort_scope_query_id') == ranking[0]['id']]
                    if depth != 'focused':
                        self.assertTrue(scoped, 'deeper ranking reports need views of the ranked cohort itself')
                    for q in ops:
                        if q is ranking[0] or q.get('cohort_query_id') == ranking[0]['id'] or q in scoped:
                            continue
                        # A view not bound to the ranked keys is only a supporting benchmark of the cohort.
                        self.assertEqual((q['role'], q.get('parent_id')), ('supporting', ranking[0]['id']), q)
                        self.assertNotEqual(q.get('purpose'), 'answer')
                    # I16: a canonical "doanh thu" request never gains a specialised revenue goal.
                    self.assertEqual({m for q in ops for m in q['metrics']}, {'revenue'})


class RareScopeExecutionTests(Guarded):
    def test_I03_guided_bottom_five_with_rare_selected_members_plans(self):
        from common import AiTextToReportRequest
        from services.agent_pipeline import AnalysisPipeline
        from tests.analysis_fixtures import physical_metadata
        rare = ['Ninh Thuận', 'Sóc Trăng', 'Bạc Liêu', 'Trà Vinh', 'Quảng Trị']
        lookup = Mock(side_effect=lambda t, c, s, limit=8: [v for v in rare if v.lower() == s.lower()])
        provider = ScriptedProvider()
        pipeline = AnalysisPipeline(metadata_loader=physical_metadata, provider=provider,
                                    executor=Mock(side_effect=AssertionError('no execution')), value_lookup=lookup, owner_id='owner-v32')
        proposal = pipeline.propose(AiTextToReportRequest(
            reference_date=REFERENCE_V32, question='Bottom 5 tỉnh/thành trong dữ liệu theo doanh thu tháng 9 năm 2026',
            analysis_mission='ranking', input_mode='guided', time={'mode': 'custom', 'start': '2026-09-01', 'end': '2026-09-30'},
            analysis_scope={'mode': 'selected', 'filters': [{'dimension': 'city', 'operator': 'in', 'value': rare}]},
            guided_contract={'metric': 'revenue', 'dimension': 'city', 'n': 5, 'direction': 'bottom'}))
        self.assertEqual(proposal['status'], 'proposal_ready', (proposal.get('message'), pipeline.semantic_info.get('failure_stage')))
        self.assertEqual(provider.call_count, 0)
        for q in proposal['proposal']['analytical_queries']:
            self.assertEqual({tuple(sorted(f['value'])) for f in q['filters'] if f['dimension'] == 'city'}, {tuple(sorted(rare))})

    def test_I01_cohort_scoped_views_reconcile_with_ranked_total(self):
        for dim, direction, metric in (('city', 'bottom', 'revenue'), ('store', 'top', 'revenue'), ('product', 'top', 'product_revenue')):
            with self.subTest(dim=dim, direction=direction, metric=metric):
                provider = ScriptedProvider()
                _, report = self.report(provider, question=f"{direction.title()} 5 theo doanh thu tháng 9 năm 2026",
                    analysis_mission='ranking', input_mode='guided', analysis_depth='comprehensive',
                    time={'mode': 'custom', 'start': '2026-09-01', 'end': '2026-09-30'},
                    guided_contract={'metric': metric, 'dimension': dim, 'n': 5, 'direction': direction})
                queries = {q['id']: q for q in report['analytical_queries']}
                rank = next(q for q in queries.values() if q['operation'] == 'ranking')
                results = report['result_sets']
                rows = lambda qid: (results.get(qid) or {}).get('rows', [])
                cohort_total = sum(r[metric] or 0 for r in rows(rank['id']))
                self.assertGreater(cohort_total, 0)
                scoped = [q for q in queries.values() if q.get('cohort_scope_query_id') == rank['id']]
                self.assertTrue(scoped)
                if direction == 'bottom':
                    # Comprehensive lenses (distribution/cross-tab) are additive too: none may stay whole-scope.
                    self.assertFalse([q['operation'] for q in queries.values() if q['role'] == 'supporting'
                                      and not q.get('cohort_scope_query_id') and metric in q['metrics']])
                for q in scoped:
                    if metric in q['metrics']:
                        self.assertAlmostEqual(sum(r[metric] or 0 for r in rows(q['id'])), cohort_total, places=2, msg=q)
                text = json.dumps([report.get('key_findings'), report.get('kpi_cards')], ensure_ascii=False)
                if direction == 'bottom':
                    self.assertNotIn('đứng đầu', text); self.assertNotIn('Top N', text)
                    self.assertIn('Tổng của tập Bottom N', text)
                self.assertNotIn('phạm vi complete', text)
                for c in report['charts']:
                    if queries.get(c.get('query_id'), {}).get('cohort_scope_query_id'):
                        self.assertIn(c['scope_note'], (c.get('insight') or {}).get('caveats', []))
                        self.assertEqual(c.get('population_scope'), 'ranked_cohort')
                        self.assertIn(('Bottom 5' if direction == 'bottom' else 'Top 5'), c['title'])

    def test_dependent_goals_run_inside_the_ranked_cohort(self):
        from tests.test_v32_mission_reliability import call, envelope, requirement
        sept = {'kind': 'range', 'start': '2026-09-01', 'end': '2026-09-30'}
        intent = envelope(
            requirement(id='r1', analysis_kind='ranking', metric_ids=['revenue'], dimension_ids=['city'], time=sept,
                        ranking={'limit': 5, 'metric_id': 'revenue', 'direction': 'bottom'}),
            requirement(id='r2', metric_ids=['revenue'], dimension_ids=['store'], time=sept),
            requirement(id='r3', metric_ids=['revenue'], dimension_ids=['payment_method'], time=sept))
        q = ('Top 5 tỉnh doanh thu thấp nhất tháng 9 năm 2026; phân tích chi nhánh và phương thức thanh toán '
             'chỉ trong 5 tỉnh này')
        provider = ScriptedProvider([call('submit_analysis_intent', intent)])
        _, report = self.report(provider, question=q, analysis_depth='focused')
        queries = {x['id']: x for x in report['analytical_queries']}
        rank = next(x for x in queries.values() if x['operation'] == 'ranking')
        rows = lambda i: report['result_sets'].get(i, {}).get('rows', [])
        total = sum(r['revenue'] or 0 for r in rows(rank['id']))
        self.assertGreater(total, 0)
        dependent = [x for x in queries.values() if x['role'] == 'requested' and x['operation'] != 'ranking']
        self.assertEqual({tuple(x['group_by']) for x in dependent}, {('store',), ('payment_method',)})
        for x in dependent:
            self.assertEqual(x.get('cohort_scope_query_id'), rank['id'])
            self.assertAlmostEqual(sum(r['revenue'] or 0 for r in rows(x['id'])), total, places=2)
        # Control: without the back-reference the same goals stay whole-scope requested goals.
        provider = ScriptedProvider([call('submit_analysis_intent', intent)])
        _, report = self.report(provider, question='Top 5 tỉnh doanh thu thấp nhất tháng 9 năm 2026; doanh thu theo chi nhánh và phương thức thanh toán',
                                analysis_depth='focused')
        self.assertFalse(any(x.get('cohort_scope_query_id') for x in report['analytical_queries'] if x['role'] == 'requested'))

    def test_three_axis_cross_tab_with_cohort_reference_splits_inside_cohort(self):
        from tests.test_v32_mission_reliability import call, envelope, requirement
        sept = {'kind': 'range', 'start': '2026-09-01', 'end': '2026-09-30'}
        intent = envelope(  # live Gemini 22/10 shape
            requirement(id='r1', analysis_kind='ranking', metric_ids=['revenue'], dimension_ids=['city'], time=sept,
                        ranking={'limit': 5, 'metric_id': 'revenue', 'direction': 'bottom'}),
            requirement(id='r2', analysis_kind='cross_tab', metric_ids=['revenue'], dimension_ids=['city', 'store', 'payment_method'], time=sept,
                        filters=[{'dimension': 'city', 'operator': 'in', 'value': ['5 tỉnh này']}]))
        q = ('Top 5 tỉnh doanh thu thấp nhất tháng 9 năm 2026; phân tích chi nhánh và phương thức thanh toán '
             'chỉ trong 5 tỉnh này')
        provider = ScriptedProvider([call('submit_analysis_intent', intent)])
        _, report = self.report(provider, question=q, analysis_depth='focused')
        rank = next(x for x in report['analytical_queries'] if x['operation'] == 'ranking')
        dependent = {tuple(x['group_by']): x for x in report['analytical_queries'] if x['role'] == 'requested' and x is not rank}
        self.assertEqual(set(dependent), {('store',), ('payment_method',)})
        self.assertTrue(all(x.get('cohort_scope_query_id') == rank['id'] for x in dependent.values()))
        # Deep: every other view is inside the cohort or a labelled whole-scope benchmark.
        provider = ScriptedProvider([call('submit_analysis_intent', intent)])
        _, report = self.report(provider, question=q, analysis_depth='comprehensive')
        queries = {x['id']: x for x in report['analytical_queries']}
        for c in report['charts']:
            x = queries.get(c.get('query_id'))
            if not x or x['operation'] == 'ranking':
                continue
            self.assertIn(c.get('population_scope'), {'ranked_cohort', 'scope_benchmark'}, c['title'])

    def test_dependent_goal_read_as_multi_axis_ranking_is_rebound(self):
        from tests.test_v32_mission_reliability import call, envelope, requirement
        sept = {'kind': 'range', 'start': '2026-09-01', 'end': '2026-09-30'}
        rank = {'limit': 5, 'metric_id': 'revenue', 'direction': 'bottom'}
        intent = envelope(  # live Gemini 22/10 (third shape)
            requirement(id='r1', analysis_kind='ranking', metric_ids=['revenue'], dimension_ids=['city'], time=sept, ranking=rank),
            requirement(id='r2', analysis_kind='ranking', metric_ids=['revenue'], dimension_ids=['city', 'payment_method', 'store'],
                        time=sept, ranking=rank))
        q = ('Top 5 tỉnh doanh thu thấp nhất tháng 9 năm 2026; phân tích chi nhánh và phương thức thanh toán '
             'chỉ trong 5 tỉnh này')
        _, report = self.report(ScriptedProvider([call('submit_analysis_intent', intent)]), question=q, analysis_depth='focused')
        ranks = [x for x in report['analytical_queries'] if x['operation'] == 'ranking']
        self.assertEqual([x['group_by'] for x in ranks], [['city']])
        dependent = {tuple(x['group_by']) for x in report['analytical_queries'] if x.get('cohort_scope_query_id') == ranks[0]['id']
                     and x['role'] == 'requested'}
        self.assertEqual(dependent, {('store',), ('payment_method',)})

    def test_dropped_coordinated_axis_is_restored_inside_cohort(self):
        from tests.test_v32_mission_reliability import call, envelope, requirement
        sept = {'kind': 'range', 'start': '2026-09-01', 'end': '2026-09-30'}
        # Live Gemini answer shape (21/10 receipt): branches as a cross-tab [city, store], payment missing.
        intent = envelope(
            requirement(id='r1', analysis_kind='ranking', metric_ids=['revenue'], dimension_ids=['city'], time=sept,
                        ranking={'limit': 5, 'metric_id': 'revenue', 'direction': 'bottom'}),
            requirement(id='r2', analysis_kind='cross_tab', metric_ids=['revenue'], dimension_ids=['city', 'store'], time=sept))
        q = ('Top 5 tỉnh doanh thu thấp nhất tháng 9 năm 2026; phân tích chi nhánh và phương thức thanh toán '
             'chỉ trong 5 tỉnh này')
        provider = ScriptedProvider([call('submit_analysis_intent', intent)])
        _, report = self.report(provider, question=q, analysis_depth='focused')
        self.assertEqual(provider.call_count, 1)
        rank = next(x for x in report['analytical_queries'] if x['operation'] == 'ranking')
        dependent = {tuple(x['group_by']): x for x in report['analytical_queries'] if x['role'] == 'requested' and x is not rank}
        self.assertEqual(set(dependent), {('store',), ('payment_method',)})
        self.assertTrue(all(x.get('cohort_scope_query_id') == rank['id'] for x in dependent.values()))
