"""Independent A–F oracle and metamorphic claims from the frozen acceptance fixture.

Run offline in the dedicated test container. No product/parser tuning in this harness.
"""
import json
from copy import deepcopy
from pathlib import Path
from tests import test_hybrid_v28 as f
from tests.test_ai_final_depth_contract import DepthReportMixin
from services.result_artifact_store import artifact_store


def fixture():
    spec = json.loads(Path('/tmp/codex-cohort-oracle.json').read_text())
    stores = [dict(ma_chi_nhanh=s['store_id'], ten_chi_nhanh=s['store_label'], thanh_pho=s['city_id'],
                   loai_diem_ban='CHI_NHANH_CHINH') for s in spec['stores']]
    orders = [dict(ma_don_hang=o['order_id'], co_so_ma=o['store_id'], ma_nguoi_dung='u1',
        tong_tien=o['value'], trang_thai_don_hang=o['status'], phuong_thuc_thanh_toan=o['payment'],
        ngay_tao=o['created_day']+'T10:00:00', loai_don_hang='MANG_DI', ma_voucher=None, so_tien_giam=0)
        for o in spec['orders']]
    return spec, {'chi_nhanh': stores, 'don_hang': orders, 'chi_tiet_don_hang': [], 'giao_dich_thanh_toan': []}


class CohortAcceptanceProperties(DepthReportMixin, f.unittest.TestCase):
    def test_independent_national_goal_stays_independent_beside_cohort_reference(self):
        _,data=fixture()
        from unittest.mock import patch
        from evals import fixture_warehouse as w
        period={'kind':'range','start':'2026-09-01','end':'2026-09-30'}
        national=f.requirement(id='national',domain_id='orders',metric_ids=['revenue'],dimension_ids=[],
            analysis_kind='aggregate',ranking=None,derived_features=['scalar'],time=period)
        rank=f.requirement(id='rank',domain_id='orders',metric_ids=['revenue'],dimension_ids=['city'],
            ranking={'limit':5,'metric_id':'revenue','direction':'bottom'},derived_features=[],time=period)
        dependent=f.requirement(id='stores',domain_id='orders',metric_ids=['revenue'],dimension_ids=['store'],
            analysis_kind='aggregate',ranking=None,derived_features=[],time=period)
        with patch.dict(w.DATA,data):
            warehouse=w.FixtureWarehouse(self.catalog.overlay);self.addCleanup(warehouse.close)
            pipeline=self.pipeline(f.scripted(f.envelope(national,rank,dependent)),executor=warehouse)
            request=self.request('Tổng doanh thu toàn quốc tháng 9 năm 2026; Bottom 5 tỉnh theo doanh thu tháng 9 năm 2026; phân tích chi nhánh chỉ trong 5 tỉnh này',
                analysis_depth='focused',refresh=True)
            report=pipeline.generate(f.approve(request,pipeline.propose(request)))
        scalar=next(q for q in report['analytical_queries'] if q['role']=='requested' and not q['group_by'] and q['operation']=='aggregate')
        self.assertIsNone(scalar.get('cohort_scope_query_id'))
        self.assertEqual(self.all_rows(report,scalar)[0]['revenue'],101520)
        branch=next(q for q in report['analytical_queries'] if q['role']=='requested' and q['group_by']==['store'])
        self.assertTrue(branch.get('cohort_scope_query_id'))
        self.assertEqual(sum(r['revenue'] for r in self.all_rows(report,branch)),1520)
        outside=deepcopy(data)
        next(o for o in outside['don_hang'] if o['co_so_ma']=='s-F')['tong_tien']+=50000
        with patch.dict(w.DATA,outside):
            other=w.FixtureWarehouse(self.catalog.overlay);self.addCleanup(other.close)
            pipeline=self.pipeline(f.scripted(f.envelope(national,rank,dependent)),executor=other)
            updated=pipeline.generate(f.approve(request,pipeline.propose(request.model_copy(update={'session_id':None}))))
        national_after=next(q for q in updated['analytical_queries'] if q['role']=='requested' and not q['group_by'] and q['operation']=='aggregate')
        branch_after=next(q for q in updated['analytical_queries'] if q['role']=='requested' and q['group_by']==['store'])
        self.assertEqual(self.all_rows(updated,national_after)[0]['revenue'],151520)
        self.assertEqual(self.all_rows(updated,branch_after),self.all_rows(report,branch))

    def test_selected_payments_daily_and_mixed_metric_populations_match_frozen_raw_oracle(self):
        spec,data=fixture()
        from unittest.mock import patch
        from evals import fixture_warehouse as w
        period={'kind':'range','start':'2026-09-01','end':'2026-09-30'}
        rank=f.requirement(id='rank',domain_id='orders',metric_ids=['revenue'],dimension_ids=['city'],
            analysis_kind='ranking',ranking={'limit':5,'metric_id':'revenue','direction':'bottom'},derived_features=[],time=period)
        scalar=f.requirement(id='counts',domain_id='orders',metric_ids=['revenue','order_count','aov'],dimension_ids=[],
            analysis_kind='aggregate',ranking=None,derived_features=['scalar'],time=period)
        payments=f.requirement(id='payment',domain_id='orders',metric_ids=['revenue'],dimension_ids=['payment_method'],
            analysis_kind='aggregate',ranking=None,derived_features=[],time=period)
        daily=f.requirement(id='daily',domain_id='orders',metric_ids=['revenue'],dimension_ids=[],
            analysis_kind='trend',ranking=None,granularity='day',derived_features=[],time=period)
        with patch.dict(w.DATA,data):
            warehouse=w.FixtureWarehouse(self.catalog.overlay);self.addCleanup(warehouse.close)
            pipeline=self.pipeline(f.scripted(f.envelope(rank,scalar,payments,daily)),executor=warehouse)
            request=self.request('Bottom 5 tỉnh theo doanh thu tháng 9 năm 2026; tổng doanh thu, số đơn và giá trị đơn trung bình chỉ trong 5 tỉnh này; doanh thu theo phương thức thanh toán chỉ trong các tỉnh này; doanh thu theo ngày chỉ trong các tỉnh này',analysis_depth='focused',refresh=True)
            report=pipeline.generate(f.approve(request,pipeline.propose(request)))
        queries=report['analytical_queries'];primary=next(q for q in queries if q['operation']=='ranking')
        actual={}
        for q in queries:
            if q['operation']=='aggregate' and not q['group_by']:
                for m in q['metrics']:actual[m]=self.all_rows(report,q)[0][m]
            if q['id']!=primary['id']:self.assertEqual(q.get('cohort_scope_query_id'),primary['id'])
        self.assertEqual(actual['revenue'],1520);self.assertEqual(actual['order_count'],8)
        self.assertAlmostEqual(actual['aov'],1520/6)
        p=next(q for q in queries if q['role']=='requested' and q['group_by']==['payment_method'])
        self.assertEqual({r['payment_method']:r['revenue'] for r in self.all_rows(report,p)},spec['oracle']['selected_payments'])
        d=next(q for q in queries if q['role']=='requested' and q['operation']=='trend')
        self.assertEqual({str(r['period'])[:10]:r['revenue'] for r in self.all_rows(report,d)},spec['oracle']['selected_daily'])

    def test_tied_bottom_actual_less_than_n_and_empty_are_honest(self):
        from services.analysis_catalog import AnalysisError
        _,data=fixture()
        # Tie A/B independently; lexicographic stable keys select A before B.
        next(o for o in data['don_hang'] if o['ma_don_hang']=='o-03')['tong_tien']=100
        for limit,expected_cities in [(5,['A','B','C','D','E']),(10,['A','B','C','D','E','F'])]:
            with self.subTest(limit=limit):
                req=f.requirement(domain_id='orders',metric_ids=['revenue'],dimension_ids=['city'],
                    analysis_kind='ranking',ranking={'limit':limit,'metric_id':'revenue','direction':'bottom'},
                    derived_features=[],time={'kind':'range','start':'2026-09-01','end':'2026-09-30'})
                report=self.report(req,f'Bottom {limit} tỉnh theo doanh thu tháng 9 năm 2026',data,analysis_depth='focused',refresh=True)[2]
                rank=next(q for q in report['analytical_queries'] if q['operation']=='ranking')
                self.assertEqual([r['city'] for r in self.all_rows(report,rank)],expected_cities)
                self.assertEqual(rank['ranking']['direction'],'ASC')
                self.assertEqual(rank['ranking']['top_n'],limit)
                self.assertNotIn('G',[r['city'] for r in self.all_rows(report,rank)])
        empty=deepcopy(data);empty['don_hang']=[]
        try:
            report=self.make_report(empty,'focused')
        except AnalysisError as error:self.assertEqual(error.category,'insufficient_data')
        else:
            rank=next(q for q in report['analytical_queries'] if q['operation']=='ranking')
            self.assertEqual(self.all_rows(report,rank),[])
            self.assertTrue(report.get('data_warnings') or report.get('outcome',{}).get('code')=='no_data')

    def make_report(self, data, depth='comprehensive'):
        period = {'kind': 'range', 'start': '2026-09-01', 'end': '2026-09-30'}
        req = f.requirement(domain_id='orders', metric_ids=['revenue'], dimension_ids=['city'], time=period,
            ranking={'limit': 5, 'metric_id': 'revenue', 'direction': 'bottom'}, derived_features=['leader'])
        return self.report(req, 'Bottom 5 tỉnh theo doanh thu tháng 9 năm 2026', data,
                           analysis_depth=depth, refresh=True)[2]

    def all_rows(self, report, query):
        result = report['result_sets'][query['id']]
        return artifact_store().get(result['artifact_ref'])['rows'] if result.get('artifact_ref') else result['rows']

    def values(self, report):
        return {q['id']: self.all_rows(report, q) for q in report['analytical_queries']}

    def check_oracle(self, report, cities, total):
        rank = next(q for q in report['analytical_queries'] if q['operation'] == 'ranking')
        self.assertEqual({r['city'] for r in self.all_rows(report, rank)}, set(cities))
        for q in report['analytical_queries']:
            if q['metrics'] == ['revenue']:
                self.assertAlmostEqual(sum(r['revenue'] for r in self.all_rows(report, q)), total)
                if q['id'] != rank['id']:
                    self.assertEqual(q.get('cohort_scope_query_id'), rank['id'])
        for e in report['evidence']:
            if e['scope'].get('population_scope') == 'ranked_cohort':
                self.assertEqual(e['scope'].get('cohort_scope_query_id'), rank['id'])
                self.assertIn('trong Bottom 5', e['statement'])
        self.assertEqual(report['quality_assessment']['status'], 'verified')

    def test_frozen_A_to_F_oracle_at_all_three_depths(self):
        spec, data = fixture()
        previous_primary = None
        for depth in ('focused', 'deep', 'comprehensive'):
            with self.subTest(depth=depth):
                report = self.make_report(data, depth)
                self.check_oracle(report, spec['oracle']['ranked_cities'], spec['oracle']['selected_revenue'])
                rank = next(q for q in report['analytical_queries'] if q['operation'] == 'ranking')
                primary = self.all_rows(report, rank)
                if previous_primary is not None:
                    self.assertEqual(primary, previous_primary)
                previous_primary = primary

    def test_outside_cohort_preserves_all_values_and_facts_inside_change_updates_both(self):
        _, data = fixture()
        baseline = self.make_report(data)
        outside = deepcopy(data)
        next(o for o in outside['don_hang'] if o['co_so_ma'] == 's-F')['tong_tien'] += 50000
        changed_outside = self.make_report(outside)
        self.assertEqual(self.values(baseline), self.values(changed_outside))
        self.assertEqual(baseline['evidence'], changed_outside['evidence'])
        self.assertEqual(baseline['key_findings'], changed_outside['key_findings'])
        self.assertEqual(baseline['executive_summary'], changed_outside['executive_summary'])
        inside = deepcopy(data)
        next(o for o in inside['don_hang'] if o['ma_don_hang'] == 'o-01')['tong_tien'] += 25
        changed_inside = self.make_report(inside)
        self.check_oracle(changed_inside, ['A', 'B', 'C', 'D', 'E'], 1545)
        self.assertNotEqual(self.values(baseline), self.values(changed_inside))
        self.assertNotEqual(baseline['evidence'], changed_inside['evidence'])

    def test_membership_change_rebinds_supporting_views(self):
        _, data = fixture()
        next(o for o in data['don_hang'] if o['co_so_ma'] == 's-F')['tong_tien'] = 50
        report = self.make_report(data)
        self.check_oracle(report, ['F', 'A', 'B', 'C', 'D'], 1070)


if __name__ == '__main__':
    f.unittest.main()
