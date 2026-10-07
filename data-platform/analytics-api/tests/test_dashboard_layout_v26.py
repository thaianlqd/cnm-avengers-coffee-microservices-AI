"""Chart selection and equivalence are based on validated semantics, not variety quotas."""
import unittest
from copy import deepcopy
from unittest.mock import patch
from services.analyst_contract import DashboardVisual
from services.dashboard_planner_service import build_dashboard, chart_reason, render
from services.insight_service import analytical_features
from tests.test_agent_v22 import fixture_artifact, query, ranking_query


class DashboardLayoutTests(unittest.TestCase):
    def setUp(self):
        for name in ('requests.sessions.Session.request', 'psycopg2.connect'):
            guard = patch(name, side_effect=AssertionError('External calls forbidden'))
            guard.start(); self.addCleanup(guard.stop)

    def test_defaults_use_shapes_and_additivity_for_visual_choice(self):
        cases = [
            (query('orders', 'revenue', 'trend', granularity='week'), 'area'),
            (query('orders', 'aov', 'trend', granularity='week'), 'line'),
            (query('orders', 'revenue', 'aggregate', group_by=['order_type']), 'donut'),
            (query('orders', 'aov', 'aggregate', group_by=['store']), 'bar'),
            (ranking_query(), 'horizontal_bar'),
        ]
        for raw, expected in cases:
            with self.subTest(expected=expected, metric=raw['metrics']):
                a, _ = fixture_artifact(raw)
                chart = build_dashboard({raw['id']: a}, [])['charts'][0]
                self.assertEqual(chart['chart_type'], expected)
        a, _ = fixture_artifact(query('orders', 'aov', group_by=['store']))
        for row in a.result['rows']: row['store'] = 'Chi nhánh có tên cần không gian để đọc'
        self.assertEqual(build_dashboard({a.query.id: a}, [])['charts'][0]['chart_type'], 'horizontal_bar')

    def test_partial_negative_average_and_ranking_never_become_a_donut(self):
        for raw, mutate in (
            (query('orders', 'aov', group_by=['store']), lambda a: None),
            (query('orders', 'revenue', group_by=['store']), lambda a: setattr(a.plan, 'explicit_limit', True)),
            (query('orders', 'revenue', group_by=['store']), lambda a: a.result['rows'][0].update(revenue=-1)),
            (ranking_query(), lambda a: None),
        ):
            a, _ = fixture_artifact(raw); mutate(a)
            v = DashboardVisual(query_id=a.query.id, chart_type='donut', metrics=a.plan.metrics, x_field=next(d for d in a.plan.dimensions if not d.endswith('_id')), purpose='distribution')
            self.assertIsNotNone(chart_reason(v, a, 100, 16))

    def test_alias_equivalence_requires_same_expression_and_full_population(self):
        def view(subject, metric, city='Hồ Chí Minh'):
            a, _ = fixture_artifact(query(subject, metric, group_by=['store'], filters=[{'dimension':'city', 'operator':'eq', 'value':city}]))
            v = DashboardVisual(query_id=a.query.id, chart_type='bar', metrics=[metric], x_field='store', purpose='comparison')
            return render(v, a, 0)['semantic_view_key']
        self.assertEqual(view('orders','revenue'), view('stores','store_revenue'))
        self.assertNotEqual(view('orders','revenue'), view('stores','store_revenue','Hà Nội'))
        # AVG ignores NULL values whereas SUM/COUNT(*) does not. Identical
        # current numbers are insufficient to treat these definitions as equal.
        self.assertNotEqual(view('orders','aov'), view('stores','store_aov'))

    def test_many_category_donut_groups_tail_without_losing_the_full_total(self):
        a, _ = fixture_artifact(query('products', 'quantity_sold', 'distribution', group_by=['category']))
        a.result['rows'] = [{'category': 'Danh mục ' + str(i), 'quantity_sold': i + 1} for i in range(17)]
        chart = build_dashboard({a.query.id: a}, [])['charts'][0]
        self.assertEqual(chart['chart_type'], 'donut')
        self.assertEqual(len(chart['data']), 7)
        self.assertEqual(chart['grouped_categories'], 11)
        self.assertEqual(sum(r['value'] for r in chart['data']), 153)
        self.assertEqual(len(a.result['rows']), 17)
        a.plan.explicit_limit = True
        v = DashboardVisual(query_id=a.query.id, chart_type='donut', metrics=['quantity_sold'], x_field='category', purpose='distribution')
        self.assertEqual(chart_reason(v, a, 100, 16), 'invalid_part_to_whole')

    def test_weekly_change_excludes_clipped_scope_boundaries(self):
        a, _ = fixture_artifact(query('products', 'quantity_sold', 'trend', granularity='week'))
        a.grounded.period = a.plan.period = {'start': '2026-07-01', 'end': '2026-09-30', 'timezone': 'Asia/Ho_Chi_Minh'}
        a.result['rows'] = [{'period': p, 'quantity_sold': v} for p,v in [('2026-06-29',624),('2026-07-06',869),('2026-09-21',663),('2026-09-28',274)]]
        e = next(e for e in analytical_features({a.query.id:a}) if e['feature'] == 'change')
        self.assertEqual(e['values']['change'], -206)
        self.assertAlmostEqual(e['values']['change_pct'], -206 / 869 * 100)
        self.assertEqual(e['values']['excluded_partial_buckets'], 2)
        self.assertEqual(e['values']['first_period'], '2026-07-06')
        self.assertIn('kỳ đầy đủ', e['statement'])
        self.assertEqual(len(build_dashboard({a.query.id:a}, [])['charts'][0]['data']), 4)
        a.result['rows'] = [a.result['rows'][0], a.result['rows'][-1]]
        evidence = analytical_features({a.query.id:a})
        self.assertNotIn('change', [e['feature'] for e in evidence])
        self.assertIn('period_coverage', [e['feature'] for e in evidence])

    def test_complete_composition_with_118_groups_renders_bounded_slices(self):
        a, _ = fixture_artifact(query('products','quantity_sold','distribution',group_by=['product']))
        a.result['rows'] = [{'product': 'Sản phẩm '+str(i), 'product_id':str(i), 'quantity_sold':i+1} for i in range(118)]
        dashboard=build_dashboard({a.query.id:a},[])
        self.assertEqual(len(dashboard['charts']),1)
        chart=dashboard['charts'][0]
        self.assertEqual(chart['chart_type'],'donut');self.assertEqual(len(chart['data']),7)
        self.assertEqual(chart['population_count'],118)
        self.assertEqual(sum(r['value'] for r in chart['data']),sum(range(1,119)))
        self.assertEqual(len(a.result['rows']),118)

    def test_deduplicated_visual_retains_coverage_of_both_requested_queries(self):
        a, _=fixture_artifact(query('orders','revenue',group_by=['store']))
        b=deepcopy(a);b.query.id='second'
        dashboard=build_dashboard({a.query.id:a,b.query.id:b},[])
        self.assertEqual(len(dashboard['charts']),1)
        self.assertEqual(set(dashboard['charts'][0]['scope_refs']),{'main','second'})
        self.assertEqual(len(dashboard['dashboard_plan']['tables']),2)

    def test_full_store_population_adds_paired_revenue_aov_view_without_extra_queries(self):
        a, _=fixture_artifact(query('stores','store_revenue',metrics=['store_revenue','store_aov','purchasing_customer_count'],group_by=['store']))
        a.result['rows']=[{'store':f'Chi nhánh {i}','store_id':str(i),'store_revenue':i*1000,'store_aov':100+i%7,'purchasing_customer_count':i%9+1} for i in range(1,1216)]
        dashboard=build_dashboard({a.query.id:a},[])
        scatter=next(c for c in dashboard['charts'] if c['chart_type']=='scatter')
        self.assertEqual(scatter['metrics'],['store_revenue','store_aov'])
        self.assertEqual(len(scatter['data']),1215)
        self.assertEqual(scatter['data'][0]['x'],1000)
        self.assertEqual(scatter['data'][0]['y'],101)
        self.assertEqual(scatter['observation_label'],'Chi nhánh')
        self.assertEqual(len(dashboard['charts']),4)
        self.assertIn('AOV',scatter['title'])
        self.assertEqual(len(dashboard['dashboard_plan']['tables']),1)
        a.plan.explicit_limit=True
        self.assertFalse(any(c['chart_type']=='scatter' for c in build_dashboard({a.query.id:a},[])['charts']))
        a.plan.explicit_limit=False
        for r in a.result['rows']:r['store_aov']=100
        self.assertFalse(any(c['chart_type']=='scatter' for c in build_dashboard({a.query.id:a},[])['charts']))
