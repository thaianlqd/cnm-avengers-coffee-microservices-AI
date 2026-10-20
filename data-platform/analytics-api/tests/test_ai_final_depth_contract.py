"""FINAL AI Data Analyst plan (2026-10-19) P0 red→green: depth + relevance on a RICH fixture.

The cancellation question is ONE acceptance scenario of a generic rule, never a special path: this module also checks
that the same contract holds for other metric classes (see test_ai_final_generic_families). Expected numbers come from
an independent oracle (evals.rich_fixture), never from the compiler and never from a constant.
"""
import math
from unittest.mock import patch
from tests import test_hybrid_v28 as f
from evals import fixture_warehouse as w
from evals.fixture_warehouse import FixtureWarehouse
from evals.rich_fixture import rich_orders_data, order_rate_oracle

HCM = 'Hồ Chí Minh'
RATE_FAMILY = {'order_cancellation_rate', 'cancelled_terminal_order_count', 'terminal_order_count'}


class DepthReportMixin:
    setUp = f.HybridTests.setUp
    pipeline = f.HybridTests.pipeline
    request = f.HybridTests.request

    def report(self, req, question, data=None, **options):
        with patch.dict(w.DATA, data or {}):
            warehouse = FixtureWarehouse(self.catalog.overlay); self.addCleanup(warehouse.close)
            p = self.pipeline(f.scripted(f.envelope(req)), executor=warehouse)
            p.value_lookup = lambda table, column, reference, **kw: [reference]
            request = self.request(question, **options)
            proposal = p.propose(request)
            f.approve(request, proposal)
            return p, proposal, p.generate(request)


class CancellationDepthTests(DepthReportMixin, f.unittest.TestCase):
    QUESTION = 'tỷ lệ hủy đơn tháng 09/2026 tại Hồ Chí Minh'

    def req(self):
        return f.requirement(domain_id='orders', metric_ids=['order_cancellation_rate'], dimension_ids=[],
            analysis_kind='aggregate', ranking=None, derived_features=['scalar'],
            filters=[dict(dimension='city', operator='eq', value=HCM)],
            time={'kind': 'range', 'start': '2026-09-01', 'end': '2026-09-30'})

    def run_depth(self, depth):
        data = rich_orders_data()
        _, proposal, report = self.report(self.req(), self.QUESTION, data, **({'analysis_depth': depth} if depth else {}))
        return data, proposal, report

    def test_each_depth_reaches_its_view_floor_with_only_relevant_views(self):
        floors = {'focused': 4, 'deep': 6, 'comprehensive': 8}
        for depth, floor in floors.items():
            with self.subTest(depth=depth):
                data, _, report = self.run_depth(depth)
                self.assertGreaterEqual(len(report['charts']), floor)
                self.assertLessEqual(len(report['charts']), 8)
                for chart in report['charts']:
                    self.assertTrue(set(chart['metrics']) <= RATE_FAMILY, chart['title'])

    def test_depths_are_monotonic_and_keep_the_same_meaning_and_numbers(self):
        runs = {d: self.run_depth(d) for d in ('focused', 'deep', 'comprehensive')}
        lens = {d: {c['analysis_lens_id'] for c in r[2]['charts'] if c.get('analysis_lens_id')} for d, r in runs.items()}
        core = {d: {c['analysis_lens_id'] for c in r[2]['charts'] if c.get('analysis_lens_role') == 'core'} for d, r in runs.items()}
        self.assertTrue(lens['focused'] <= lens['deep'] <= lens['comprehensive'], lens)
        self.assertEqual(core['focused'], core['deep']); self.assertEqual(core['deep'], core['comprehensive'])
        self.assertEqual(len(lens['deep'] - lens['focused']), 2); self.assertEqual(len(lens['comprehensive'] - lens['deep']), 2)
        requested = {d: [q for q in r[2]['analytical_queries'] if q['role'] == 'requested'] for d, r in runs.items()}
        self.assertEqual(requested['focused'], requested['deep']); self.assertEqual(requested['deep'], requested['comprehensive'])
        data = rich_orders_data()
        oracle = order_rate_oracle(data['don_hang'], data['chi_nhanh'], city=HCM, start='2026-09-01', end='2026-09-30')['all']
        for d, (_, _, report) in runs.items():
            q = requested[d][0]['id']
            self.assertAlmostEqual(report['result_sets'][q]['rows'][0]['order_cancellation_rate'], oracle['rate'], places=2)
            cov = report['analysis_coverage']
            self.assertEqual((cov['status'], cov['selection_origin'], cov['effective_depth']), ('complete', 'explicit', d))
            self.assertEqual(report['quality_assessment']['status'], 'verified')
            self.assertEqual(report['quality_assessment']['analysis_breadth']['status'], 'passed')

    def test_grouped_rates_are_recomputed_per_group_and_components_reconcile(self):
        data, _, report = self.run_depth('comprehensive')
        by_store = order_rate_oracle(data['don_hang'], data['chi_nhanh'], city=HCM, start='2026-09-01', end='2026-09-30', group='store')
        total = order_rate_oracle(data['don_hang'], data['chi_nhanh'], city=HCM, start='2026-09-01', end='2026-09-30')['all']
        bar = next(c for c in report['charts'] if c.get('analysis_lens_id') == 'segment:store')
        self.assertEqual({r['label']: r['value'] for r in bar['data']}, {k: v['rate'] for k, v in by_store.items()})
        self.assertNotAlmostEqual(sum(v['rate'] for v in by_store.values()) / len(by_store), total['rate'], places=3)  # no mean of rates
        split = next(c for c in report['charts'] if c.get('analysis_lens_id') == 'composition:order_status')
        self.assertEqual(sum(r['value'] for r in split['data']), total['terminal'])
        share = next(c for c in report['charts'] if c.get('analysis_lens_id') == 'contribution:store')
        self.assertEqual(sum(r['value'] for r in share['data']), total['cancelled'])
        scatter = next(c for c in report['charts'] if c['chart_type'] == 'scatter')
        self.assertEqual(scatter['metrics'], ['terminal_order_count', 'order_cancellation_rate'])  # exposure vs rate
        # Scope stays HCM everywhere; the pinned city never becomes a one-bar "comparison".
        self.assertFalse(any(c.get('x_field') in {'city', 'reporting_region'} for c in report['charts']))
        for q in report['analytical_queries']:
            self.assertIn({'dimension': 'city', 'operator': 'eq', 'value': HCM}, q['filters'])
        self.assertLessEqual(len(report['analytical_queries']), 8)

    def test_deleting_a_counted_view_or_its_lens_record_is_detected(self):
        from copy import deepcopy
        from services.analysis_quality_service import verify_saved_report
        _, _, report = self.run_depth('deep')
        self.assertEqual(verify_saved_report(report, self.catalog), report['quality_assessment'])
        forged = deepcopy(report); forged['charts'] = [c for c in forged['charts'] if c.get('analysis_lens_role') != 'diagnostic']
        verdict = verify_saved_report(forged, self.catalog)
        self.assertEqual(verdict['status'], 'partially_verified')
        self.assertEqual(verdict['analysis_breadth']['status'], 'failed')
        relabelled = deepcopy(report)
        relabelled['analysis_coverage']['status'] = 'limited'
        self.assertEqual(verify_saved_report(relabelled, self.catalog)['analysis_breadth']['status'], 'failed')

    def test_one_day_scope_discloses_missing_time_view_instead_of_drawing_one_point(self):
        req = self.req(); req['time'] = {'kind': 'range', 'start': '2026-09-10', 'end': '2026-09-10'}
        _, _, report = self.report(req, 'tỷ lệ hủy đơn ngày 10/09/2026 tại Hồ Chí Minh', rich_orders_data(), analysis_depth='focused')
        self.assertFalse(any(c.get('x_field') == 'period' for c in report['charts']))
        cov = report['analysis_coverage']
        self.assertIn(cov['status'], {'complete', 'limited'})
        self.assertNotEqual(cov['gap_kind'], 'PLANNING_GAP')
        self.assertEqual(report['quality_assessment']['status'], 'verified')  # honest limits never mark numbers wrong

    def test_pinned_store_axis_is_not_segmented_and_other_axes_fill_core(self):
        req = self.req(); req['filters'] = req['filters'] + [dict(dimension='store', operator='eq', value='Quán Tân Định')]
        _, _, report = self.report(req, 'tỷ lệ hủy đơn tháng 09/2026 tại Quán Tân Định Hồ Chí Minh', rich_orders_data(), analysis_depth='focused')
        self.assertFalse(any(c.get('x_field') in {'store', 'city'} for c in report['charts']))
        self.assertGreaterEqual(len(report['charts']), 4)
        for chart in report['charts']:
            self.assertTrue(set(chart['metrics']) <= RATE_FAMILY)

    def test_conclusion_synthesizes_the_rendered_lenses_with_verified_facts(self):
        _, _, report = self.run_depth('comprehensive')
        conclusion = report['conclusion']
        lens_facts = conclusion['view_findings']
        self.assertTrue(all(f.get('evidence_id') for f in conclusion['findings']))  # evidence-bound findings stay evidence-bound
        self.assertGreaterEqual(len(lens_facts), 3)
        self.assertEqual(lens_facts[0]['lens_role'], 'core')
        facts = {c['analysis_lens_id']: {k['text'] for k in c['insight']['key_facts']} for c in report['charts'] if c.get('analysis_lens_id')}
        for finding in lens_facts:  # every synthesized sentence is a fact already verified on its own chart
            self.assertIn(finding['statement'], facts[finding['lens_id']])
        self.assertTrue(conclusion['synthesis'][0].startswith('Tỷ lệ hủy đơn'))
        self.assertEqual(report['quality_assessment']['status'], 'verified')  # replayed conclusion == stored conclusion
        self.assertEqual(report['verification']['status'], 'verified')

    def test_many_group_contribution_is_a_full_population_pareto(self):
        req = self.req(); req['dimension_ids'] = ['hour']; req['derived_features'] = []
        data = rich_orders_data()
        _, _, report = self.report(req, 'tỷ lệ hủy đơn theo giờ tháng 09/2026 tại Hồ Chí Minh', data, analysis_depth='comprehensive')
        pareto = next(c for c in report['charts'] if c['chart_type'] == 'pareto')
        self.assertEqual(pareto['analysis_lens_kind'], 'contribution')
        cancelled = order_rate_oracle(data['don_hang'], data['chi_nhanh'], city=HCM, start='2026-09-01', end='2026-09-30')['all']['cancelled']
        self.assertAlmostEqual(sum(r['amount'] for r in pareto['data']) if pareto['selection'] == 'complete' else pareto['data'][-1]['cumulative_pct'] / 100 * cancelled,
                               cancelled if pareto['selection'] == 'complete' else pareto['data'][-1]['cumulative_pct'] / 100 * cancelled, places=6)
        self.assertAlmostEqual(pareto['data'][0]['amount'] / cancelled * 100, pareto['data'][0]['value'], places=9)  # share of the FULL total
        self.assertEqual([r['value'] for r in pareto['data']], sorted((r['value'] for r in pareto['data']), reverse=True))
        self.assertGreater(pareto['population_count'], 8)
        self.assertEqual(report['quality_assessment']['status'], 'verified')  # re-rendered by the verifier

    def test_legacy_auto_depth_is_labelled_and_never_silent(self):
        req = self.req(); req['derived_features'] = []
        _, proposal, report = self.report(req, self.QUESTION, rich_orders_data())
        self.assertEqual(report['analysis_coverage']['selection_origin'], 'legacy_auto')


class GenericFamilyTests(DepthReportMixin, f.unittest.TestCase):
    """The same planner, other metric classes/domains: no cancellation-specific code path exists."""

    def world(self):
        from evals.rich_fixture import rich_world
        return rich_world()

    def run_req(self, question, depth='comprehensive', **req):
        base = dict(time={'kind': 'range', 'start': '2026-09-01', 'end': '2026-09-30'}, ranking=None, derived_features=[], dimension_ids=[],
                    analysis_kind='aggregate', filters=[])
        return self.report(f.requirement(**{**base, **req}), question, self.world(), analysis_depth=depth)[2]

    def assert_relevant(self, report, metrics):
        for chart in report['charts']:
            self.assertTrue(set(chart['metrics']) <= metrics, (chart['title'], chart['metrics']))
        self.assertEqual(len({c['semantic_view_key'] for c in report['charts']}), len(report['charts']))
        self.assertEqual(report['quality_assessment']['status'], 'verified')

    def test_additive_revenue_kpi_reaches_eight_relevant_views(self):
        r = self.run_req('Doanh thu tháng 9 năm 2026', domain_id='orders', metric_ids=['revenue'], derived_features=['scalar'])
        self.assertGreaterEqual(len(r['charts']), 8); self.assert_relevant(r, {'revenue'})
        self.assertTrue(any(c['chart_type'] == 'donut' for c in r['charts']))

    def test_average_metric_pairs_with_its_own_exposure(self):
        r = self.run_req('Giá trị đơn trung bình tháng 9 năm 2026', 'deep', domain_id='orders', metric_ids=['aov'], derived_features=['scalar'])
        self.assertGreaterEqual(len(r['charts']), 6); self.assert_relevant(r, {'aov', 'valid_order_count'})
        self.assertFalse(any(c['chart_type'] == 'donut' for c in r['charts']))  # averages never become part-to-whole

    def test_distinct_count_is_never_a_composition(self):
        r = self.run_req('Số khách mua hàng tháng 9 năm 2026', 'deep', domain_id='orders', metric_ids=['purchasing_customer_count'], derived_features=['scalar'])
        self.assertGreaterEqual(len(r['charts']), 5); self.assert_relevant(r, {'purchasing_customer_count'})
        self.assertFalse(any(c['chart_type'] in {'donut', 'stacked_100'} for c in r['charts']))

    def test_snapshot_inventory_never_invents_history(self):
        r = self.run_req('Tồn kho hiện tại', 'deep', domain_id='inventory', metric_ids=['stock_quantity'], time=None)
        self.assertFalse(any(c.get('x_field') == 'period' for c in r['charts']))
        self.assertFalse(any(q['operation'] == 'trend' for q in r['analytical_queries']))
        self.assert_relevant(r, {'stock_quantity'})
        self.assertGreaterEqual(len(r['charts']), 4)

    def test_ranking_question_keeps_its_top_n_and_adds_full_population_lenses(self):
        r = self.run_req('Top 5 món doanh thu cao nhất tháng 9 năm 2026', 'deep', domain_id='products', metric_ids=['product_revenue'],
                         dimension_ids=['product'], analysis_kind='ranking', ranking={'limit': 5, 'metric_id': 'product_revenue'})
        top = [c for c in r['charts'] if c.get('selection') == 'Top N']
        self.assertTrue(top)
        self.assertGreaterEqual(len(r['charts']), 6); self.assert_relevant(r, {'product_revenue'})

    def test_other_ratio_family_uses_the_same_rules(self):
        r = self.run_req('Tỷ lệ ca đi trễ tháng 9 năm 2026', 'comprehensive', domain_id='staff_shifts', metric_ids=['late_shift_rate'], derived_features=['scalar'])
        self.assert_relevant(r, {'late_shift_rate', 'late_terminal_shift_count', 'terminal_shift_count'})
        self.assertTrue(any(c.get('analysis_lens_id') == 'composition:attendance_status' for c in r['charts']))
        self.assertGreaterEqual(len(r['charts']), 6)
