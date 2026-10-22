"""FINAL 2026-10-20 live finding: the model may return two requested aliases of ONE physical measure (store_revenue and
revenue by store). Production keeps one merged view; neither requirement may then be reported as a missing view."""
from tests.test_ai_final_depth_contract import DepthReportMixin, f
from evals.rich_fixture import rich_world


class AliasViewTests(DepthReportMixin, f.unittest.TestCase):
    def test_equivalent_alias_requirements_share_one_view_and_stay_verified(self):
        sep = {'kind': 'range', 'start': '2026-09-01', 'end': '2026-09-30'}
        a = f.requirement(id='r1', domain_id='stores', metric_ids=['store_revenue'], dimension_ids=['store'], analysis_kind='aggregate',
                          ranking=None, derived_features=[], time=sep)
        b = f.requirement(id='r2', domain_id='orders', metric_ids=['revenue'], dimension_ids=['store'], analysis_kind='aggregate',
                          ranking=None, derived_features=[], time=sep)
        with self.subTest('pipeline'):
            from unittest.mock import patch
            from evals import fixture_warehouse as w
            from evals.fixture_warehouse import FixtureWarehouse
            with patch.dict(w.DATA, rich_world()):
                warehouse = FixtureWarehouse(self.catalog.overlay); self.addCleanup(warehouse.close)
                p = self.pipeline(f.scripted(f.envelope(a, b)), executor=warehouse)
                p.value_lookup = lambda table, column, reference, **kw: [reference]
                request = self.request('Doanh thu tháng 9 năm 2026 theo chi nhánh', analysis_depth='deep')
                proposal = p.propose(request); f.approve(request, proposal); report = p.generate(request)
        required = [v for v in report['view_coverage'] if v['required']]
        self.assertTrue(required and all(v['status'] == 'satisfied' for v in required), required)
        self.assertEqual(report['quality_assessment']['status'], 'verified')
        bars = [c for c in report['charts'] if c.get('x_field') == 'store' and not c.get('analysis_lens_id')]
        self.assertEqual(len(bars), 1)  # one physical view, not the same bars twice
