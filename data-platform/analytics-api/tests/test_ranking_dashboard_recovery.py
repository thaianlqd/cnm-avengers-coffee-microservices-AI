"""Observed failure replay plus generic categorical-grain regression coverage.

No model or warehouse network calls. Observed rows cannot prove corrected SQL
totals; independent fixture SQL checks the corrected grain across statuses.
"""
import json
from copy import deepcopy
from datetime import date
from pathlib import Path
from unittest.mock import Mock, patch
from tests import test_hybrid_v28 as f
from tests.test_capacity_v29 import req
from services.analysis_intent import AnalysisIntentEnvelope
from services.request_anchors import request_anchors, verify_anchors, normalize_population_disclosures, refinement_anchors
from services.analytical_resolver import ResolutionIssues
from services.analytical_query_service import AnalyticalQueries
from services.semantic_tools import SemanticTools
from services.dashboard_planner_service import build_dashboard, defaults, chart_reason
from services.analysis_quality_service import chart_checks, verify_saved_report
from evals.fixture_warehouse import FixtureWarehouse

OBSERVED = json.loads((Path(__file__).parent / 'fixtures/ranking_dashboard_observed.json').read_text())


class RankingDashboardRecovery(f.unittest.TestCase):
    setUp = f.HybridTests.setUp
    pipeline = f.HybridTests.pipeline
    request = f.HybridTests.request

    def artifact(self, query, result=None):
        queries = AnalyticalQueries(self.catalog, SemanticTools(self.catalog, Mock()),
                                    date.fromisoformat(OBSERVED['reference_date']), Mock(), {}, proposal=True)
        a = queries.prepare(query)
        if result is None:
            warehouse = FixtureWarehouse(self.catalog.overlay)
            self.addCleanup(warehouse.close)
            result = warehouse(a.sql)
        a.result = deepcopy(result)
        return a

    def test_observed_rows_now_have_two_verified_views_without_changing_grain(self):
        recorded = OBSERVED['artifacts'][0]
        a = self.artifact(recorded['query'], recorded['result'])
        self.assertEqual(OBSERVED['old_chart_count'], 0)
        dashboard = build_dashboard({a.query.id:a}, [])
        self.assertEqual(len(dashboard['charts']), 2)
        self.assertEqual(dashboard['charts'][0]['metric'], 'quantity_sold')
        for c in dashboard['charts']:
            self.assertEqual(c['category_fields'], ['order_status', 'product'])
            self.assertEqual(c['ranking_metric'], 'quantity_sold')
            self.assertEqual(c['ranking_limit'], 5)
            self.assertEqual([r['value'] for r in c['data']], [r[c['metric']] for r in a.result['rows']])
            self.assertTrue(all('Trạng thái đơn:' in r['label'] and 'Sản phẩm:' in r['label'] for r in c['data']))
        self.assertTrue(all(c['valid'] for c in chart_checks(dashboard['charts'], {a.query.id:a})))

    def test_observed_model_extra_axis_normalized_before_approval_and_execution(self):
        warehouse = FixtureWarehouse(self.catalog.overlay); self.addCleanup(warehouse.close)
        p = self.pipeline(f.scripted(OBSERVED['intent']), executor=Mock(wraps=warehouse))
        request = self.request(OBSERVED['question']); request.reference_date = date(2026,10,9)
        proposal = p.propose(request)
        self.assertEqual(p.provider.call_count, 1); p.executor.assert_not_called()
        q = proposal['proposal']['analytical_queries'][0]
        self.assertEqual(q['group_by'], ['product'])
        self.assertEqual(q['ranking']['metric'], 'quantity_sold')
        f.approve(request, proposal); report = p.generate(request)
        self.assertEqual(report['outcome'], 'SUCCESS')
        self.assertGreaterEqual(len(report['charts']), 4)
        self.assertTrue(all(c['category_fields'] == ['product'] for c in report['charts'] if c['role']=='requested'))
        self.assertEqual(report['quality_assessment'], verify_saved_report(report, self.catalog))
        self.assertEqual(report['quality_assessment']['score'], 90)
        self.assertEqual(p.provider.call_count, 1)
        self.assertTrue(any('HOAN_THANH' in l['label'] and 'DANG_GIAO' in l['label'] for l in report['quality_limitations']))
        # Every displayed product total comes from executing corrected SQL, not
        # from collapsing the observed, already truncated Top 5 rows.
        self.assertNotIn('GROUP BY t1.trang_thai_don_hang', report['sql_query'])

    def test_verifier_rejects_disclosure_grouping_even_if_coverage_claims_passed(self):
        intent = AnalysisIntentEnvelope.model_validate(OBSERVED['intent'])
        anchors = request_anchors(OBSERVED['question'], self.catalog, {})
        self.assertIn('population_disclosure_used_as_grouping', {i['code'] for i in verify_anchors(anchors, intent.requirements, f.REFERENCE, self.catalog)})
        baseline = intent.model_copy(deep=True)
        normalized, changes = normalize_population_disclosures(intent, anchors)
        self.assertEqual(intent, baseline)
        self.assertEqual(normalized.requirements[0].dimension_ids, ['product'])
        self.assertEqual(changes[0]['removed_dimensions'], ['order_status'])

    def test_corrected_grain_combines_valid_statuses_before_top_n_and_excludes_cancelled(self):
        from evals.fixture_warehouse import DATA, ORDERS, LINES
        orders, lines = deepcopy(ORDERS), deepcopy(LINES)
        orders[0]['ngay_tao'] = '2026-09-11T10:00:00'
        lines[1]['ma_san_pham'] = 'p1'
        # One product across completed + delivering orders, plus a cancelled
        # line that must not enter either quantity or revenue.
        with patch.dict(DATA, don_hang=orders, chi_tiet_don_hang=lines):
            warehouse = FixtureWarehouse(self.catalog.overlay)
        self.addCleanup(warehouse.close)
        p = self.pipeline(f.scripted(OBSERVED['intent']), executor=warehouse)
        request = self.request(OBSERVED['question']); request.reference_date = date(2026,10,9)
        proposal = p.propose(request); f.approve(request, proposal); report = p.generate(request)
        rows = next(iter(report['result_sets'].values()))['rows']
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['quantity_sold'], 14)
        self.assertEqual(rows[0]['product_revenue'], 700)
        self.assertNotIn('order_status', rows[0])
        self.assertGreaterEqual(len(report['charts']), 4)

    def test_independent_grouping_and_partition_are_preserved(self):
        for suffix in (' Thống kê theo trạng thái đơn.', ' Xếp hạng trong từng trạng thái đơn.'):
            anchors = request_anchors(OBSERVED['question'] + suffix, self.catalog, {})
            intent = AnalysisIntentEnvelope.model_validate(OBSERVED['intent'])
            normalized, changes = normalize_population_disclosures(intent, anchors)
            self.assertEqual(normalized, intent); self.assertEqual(changes, [])

    def test_disclosure_only_partition_requires_repair_not_silent_removal(self):
        intent = AnalysisIntentEnvelope.model_validate(OBSERVED['intent'])
        intent.requirements[0].ranking.per_group = ['order_status']
        anchors = request_anchors(OBSERVED['question'], self.catalog, {})
        normalized, changes = normalize_population_disclosures(intent, anchors)
        self.assertEqual(normalized, intent); self.assertEqual(changes, [])
        self.assertTrue(verify_anchors(anchors, intent.requirements, f.REFERENCE, self.catalog))

    def test_partition_repair_unlocks_only_grouping_and_ranking_fields(self):
        wrong = deepcopy(OBSERVED['intent']); wrong['requirements'][0]['ranking']['per_group'] = ['order_status']
        fixed = deepcopy(OBSERVED['intent']); fixed['requirements'][0]['dimension_ids'] = ['product']
        p = self.pipeline(f.scripted(wrong, fixed))
        request = self.request(OBSERVED['question']); request.reference_date = date(2026,10,9)
        proposal = p.propose(request)
        self.assertEqual(p.provider.call_count, 2); p.executor.assert_not_called()
        query = proposal['proposal']['analytical_queries'][0]
        self.assertEqual(query['group_by'], ['product']); self.assertEqual(query['ranking']['per_group'], [])

    def test_refinement_disclosure_does_not_authorize_new_grouping(self):
        intent = deepcopy(OBSERVED['intent']); intent['requirements'][0]['dimension_ids'] = ['product']
        original = OBSERVED['question'].split(' Nêu rõ')[0]
        history = [dict(feedback='Nêu rõ trạng thái đơn được tính.', delta=dict(changes=[dict(
            action='update', requirement_id='req_1', changes=dict(dimension_ids=['product','order_status']))]))]
        with self.assertRaises(ResolutionIssues):
            refinement_anchors(original, intent, history, self.catalog, {}, date(2026,10,9))

    def test_disclosure_rules_apply_to_catalog_dimensions_across_domains(self):
        for dimension in ('order_status', 'payment_transaction_status', 'payment_gateway', 'city'):
            name = self.catalog.registry['dimensions'][dimension]['business_name']
            anchors = request_anchors('Nêu rõ ' + name, self.catalog, {})
            raw = AnalysisIntentEnvelope.model_validate(f.envelope(req('r', ['revenue'], [dimension])))
            normalized, changes = normalize_population_disclosures(raw, anchors)
            self.assertEqual(normalized.requirements[0].dimension_ids, [])
            self.assertEqual(len(changes), 1)

    def test_generic_rankings_two_to_four_axes_and_multiple_domains(self):
        cases = [('products', ['quantity_sold','product_revenue'], ['order_status','product']),
                 ('products', ['quantity_sold'], ['city','order_status','product']),
                 ('products', ['quantity_sold'], ['city','order_status','order_type','product']),
                 ('payments', ['payment_count','payment_revenue'], ['payment_gateway','payment_transaction_status']),
                 ('stores', ['store_revenue'], ['city','store'])]
        for subject, metrics, axes in cases:
            with self.subTest(subject=subject, axes=axes):
                q = dict(id='rank', subject=subject, operation='ranking', metrics=metrics, group_by=axes,
                         ranking=dict(metric=metrics[0], direction='DESC', top_n=5))
                a = self.artifact(q)
                charts = build_dashboard({'rank':a}, [])['charts']
                self.assertEqual(len(charts), len(metrics))
                self.assertTrue(all(len(c['category_fields']) == len(axes) for c in charts))
                self.assertTrue(all(c['valid'] for c in chart_checks(charts, {'rank':a})))

    def test_per_group_ranking_keeps_partition_and_rank_order(self):
        q = deepcopy(OBSERVED['artifacts'][0]['query']); q['ranking']['per_group'] = ['order_status']
        a = self.artifact(q)
        charts = build_dashboard({a.query.id:a}, [])['charts']
        self.assertEqual(len(charts), 2)
        self.assertTrue(all(c['ranking_per_group'] == ['order_status'] and c['ranking_note'] for c in charts))
        self.assertEqual([r['value'] for r in charts[0]['data']], [r[charts[0]['metric']] for r in a.result['rows']])

    def test_duplicate_product_names_and_delimiters_keep_distinct_categories(self):
        recorded = OBSERVED['artifacts'][0]
        a = self.artifact(recorded['query'], recorded['result'])
        a.result['rows'][0]['product'] = a.result['rows'][1]['product'] = 'Cà phê · Sản phẩm: đặc biệt'
        charts = build_dashboard({a.query.id:a}, [])['charts']
        self.assertEqual(len(charts), 2)
        self.assertTrue(all(len({r['label'] for r in c['data']}) == 5 for c in charts))
        self.assertIn('(5)', charts[0]['data'][0]['label'])

    def test_category_budget_counts_tuples_not_only_first_dimension(self):
        recorded = OBSERVED['artifacts'][0]
        a = self.artifact(recorded['query'], recorded['result'])
        self.assertEqual(chart_reason(defaults({a.query.id:a})[0], a, 4, 16), 'category_budget')

    def test_chart_metadata_and_values_are_recomputed_against_tampering(self):
        recorded = OBSERVED['artifacts'][0]
        a = self.artifact(recorded['query'], recorded['result'])
        chart = build_dashboard({a.query.id:a}, [])['charts'][0]
        for field, value in [('category_fields',['product']), ('ranking_per_group',['product']), ('x_label','Sản phẩm')]:
            altered = deepcopy(chart); altered[field] = value
            self.assertFalse(chart_checks([altered], {a.query.id:a})[0]['valid'])
        altered = deepcopy(chart); altered['data'][0]['value'] += 1
        self.assertFalse(chart_checks([altered], {a.query.id:a})[0]['valid'])

    def test_legacy_single_axis_charts_remain_valid_but_tuple_metadata_cannot_be_hidden(self):
        recorded = deepcopy(OBSERVED['artifacts'][0])
        recorded['query']['group_by'] = ['product']
        recorded['result']['columns'].remove('order_status')
        for row in recorded['result']['rows']:
            row.pop('order_status')
        a = self.artifact(recorded['query'], recorded['result'])
        chart = build_dashboard({a.query.id:a}, [])['charts'][0]
        chart.pop('category_fields'); chart.pop('ranking_per_group')
        self.assertTrue(chart_checks([chart], {a.query.id:a})[0]['valid'])
        a = self.artifact(OBSERVED['artifacts'][0]['query'], OBSERVED['artifacts'][0]['result'])
        chart = build_dashboard({a.query.id:a}, [])['charts'][0]; chart.pop('category_fields')
        self.assertFalse(chart_checks([chart], {a.query.id:a})[0]['valid'])

    def test_three_axis_aggregate_has_verified_tuple_bars(self):
        a = self.artifact(dict(id='agg', subject='products', operation='aggregate', metrics=['quantity_sold'],
                               group_by=['city','order_status','product']))
        charts = build_dashboard({'agg':a}, [])['charts']
        self.assertEqual(len(charts), 1)
        self.assertEqual(charts[0]['chart_type'], 'horizontal_bar')
        self.assertTrue(chart_checks(charts, {'agg':a})[0]['valid'])
