"""Independent raw-order oracle for weighted metrics inside a ranked cohort."""
from collections import defaultdict
from copy import deepcopy
from datetime import date, timedelta
from tests import test_hybrid_v28 as f
from tests.test_ai_final_depth_contract import DepthReportMixin
from evals.rich_fixture import rich_orders_data
from services.result_artifact_store import artifact_store
from services.cohort_rollup_service import cohort_rollup


class CohortRollupTests(DepthReportMixin, f.unittest.TestCase):
    def check_metric(self, metric, status_population, numerator):
        data = rich_orders_data()
        stores = {s['ma_chi_nhanh']: s for s in data['chi_nhanh']}
        population = [o for o in data['don_hang'] if o['trang_thai_don_hang'] in status_population
                      and stores[o['co_so_ma']]['thanh_pho'] == 'Hồ Chí Minh'
                      and '2026-09-01' <= o['ngay_tao'][:10] <= '2026-09-30']
        by_store = defaultdict(list)
        for row in population:
            by_store[row['co_so_ma']].append(row)

        def measure(rows):
            value = sum(numerator(row) for row in rows) / len(rows)
            return round(value * 100, 2) if metric == 'order_cancellation_rate' else value

        # Tie handling is explicit and independent of SQL/compiler output.
        chosen = sorted(by_store, key=lambda store: (-measure(by_store[store]),
                        stores[store]['ten_chi_nhanh'], store))[:2]
        cohort = [o for o in population if o['co_so_ma'] in chosen]
        req = f.requirement(metric_ids=[metric], dimension_ids=['store'], analysis_kind='ranking',
            ranking={'limit': 2, 'metric_id': metric, 'direction': 'top'}, derived_features=[],
            filters=[dict(dimension='city', operator='eq', value='Hồ Chí Minh')],
            time=dict(kind='range', start='2026-09-01', end='2026-09-30'))
        question = ('Top 2 chi nhánh có tỷ lệ hủy đơn cao nhất tháng 9 năm 2026 tại Hồ Chí Minh'
                    if metric == 'order_cancellation_rate' else
                    'Top 2 chi nhánh theo giá trị đơn trung bình tháng 9 năm 2026 tại Hồ Chí Minh')
        _, _, report = self.report(req, question, data, analysis_depth='comprehensive', refresh=True)
        queries = report['analytical_queries']
        rank = next(q for q in queries if q['operation'] == 'ranking')
        def rows(q):
            result = report['result_sets'][q['id']]
            # Transport previews contain at most 50 rows; verify the immutable full artifact.
            return artifact_store().get(result['artifact_ref'])['rows'] if result.get('artifact_ref') else result['rows']
        self.assertEqual({r['store_id'] for r in rows(rank)}, set(chosen))
        children = [q for q in queries if q['role'] == 'supporting' and metric in q['metrics']]
        self.assertTrue(children)
        for query in children:
            with self.subTest(metric=metric, kind=query['operation'], dimensions=query['group_by']):
                self.assertEqual(query.get('cohort_scope_query_id'), rank['id'])
                groups = defaultdict(list)

                def key(order):
                    keys = []
                    if query['operation'] == 'trend':
                        day = date.fromisoformat(order['ngay_tao'][:10])
                        grain = query['granularity']
                        if grain == 'week':
                            day -= timedelta(days=day.weekday())
                        elif grain == 'month':
                            day = day.replace(day=1)
                        keys.append(day.isoformat())
                    for dimension in query['group_by']:
                        keys.append({'store': stores[order['co_so_ma']]['ten_chi_nhanh'],
                            'store_id': order['co_so_ma'], 'city': 'Hồ Chí Minh',
                            'store_type': stores[order['co_so_ma']]['loai_diem_ban'],
                            'order_type': order['loai_don_hang'],
                            'order_status': order['trang_thai_don_hang'],
                            'payment_method': order['phuong_thuc_thanh_toan']}[dimension])
                    return tuple(keys)

                for order in cohort:
                    groups[key(order)].append(order)
                observed = {}
                for row in rows(query):
                    fields = (['period'] if query['operation'] == 'trend' else []) + query['group_by']
                    group = tuple(str(row[field])[:10] if field == 'period' else row[field] for field in fields)
                    observed[group] = row[metric]
                plan = report['query_plans'][queries.index(query)]
                self.assertEqual(len(observed), min(len(groups), plan['row_limit']))
                self.assertTrue(set(observed) <= set(groups))
                if len(observed) < len(groups):
                    self.assertEqual(query['operation'], 'trend')
                    self.assertLessEqual(max(k[0] for k in observed),
                                         min(k[0] for k in set(groups) - set(observed)))
                for group in observed:
                    self.assertAlmostEqual(observed[group], measure(groups[group]), places=6)
        self.assertEqual(report['quality_assessment']['status'], 'verified')

    def test_cancellation_ratio_uses_cohort_numerator_and_denominator(self):
        self.check_metric('order_cancellation_rate', {'HOAN_THANH', 'DA_HUY'},
                          lambda order: order['trang_thai_don_hang'] == 'DA_HUY')

    def test_average_order_value_uses_cohort_sum_and_exposure(self):
        self.check_metric('aov', {'HOAN_THANH', 'DANG_GIAO'}, lambda order: order['tong_tien'])

    def test_rollup_requires_matching_population_clock_and_complete_formula(self):
        original = deepcopy(self.catalog.registry['metrics'])
        for field, value in [('time_column', 'silver.don_hang.ngay_cap_nhat'),
                             ('business_filters', []), ('required_non_null', ['silver.don_hang.tong_tien'])]:
            with self.subTest(field=field):
                self.catalog.registry['metrics'] = deepcopy(original)
                self.catalog.registry['metrics']['terminal_order_count'][field] = value
                self.assertIsNone(cohort_rollup(self.catalog, 'order_cancellation_rate'))
        self.catalog.registry['metrics'] = deepcopy(original)
        self.catalog.registry['metrics']['order_cancellation_rate']['expression'] += ' + COUNT(*) FILTER (WHERE silver.don_hang.trang_thai_don_hang = \'HOAN_THANH\')'
        self.assertIsNone(cohort_rollup(self.catalog, 'order_cancellation_rate'))
        self.catalog.registry['metrics'] = original
        self.assertIsNone(cohort_rollup(self.catalog, 'store_aov'))  # AVG null policy has no declared pair.
        for metric in ('order_cancellation_rate', 'order_completion_rate', 'delivery_success_rate', 'late_shift_rate', 'aov'):
            self.assertIsNotNone(cohort_rollup(self.catalog, metric), metric)
