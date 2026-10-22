"""Published H01/H02 acceptance seeds, independently computed from raw records."""
from copy import deepcopy
import json
from unittest.mock import patch
from tests import test_hybrid_v28 as f
from tests.test_ai_final_depth_contract import DepthReportMixin
from evals import fixture_warehouse as w


class CrossDomainCohortAcceptance(DepthReportMixin, f.unittest.TestCase):
    def test_product_cohort_contributions_use_selected_order_lines_not_whole_orders(self):
        data=deepcopy(w.DATA)
        data['san_pham']=[dict(ma_san_pham='p'+str(i),ten_san_pham='Trùng tên' if i!=2 else 'Món B',
            ma_danh_muc='c1',ten_danh_muc='Cà phê') for i in range(1,4)]
        data['don_hang']=[{**w.ORDERS[0],'ma_don_hang':'o'+str(i),'co_so_ma':'s1' if i%2 else 's2',
            'ngay_tao':day+'T10:00:00','trang_thai_don_hang':status,'tong_tien':total}
            for i,day,status,total in [(1,'2026-09-05','HOAN_THANH',1000),(2,'2026-09-06','HOAN_THANH',500),
                (3,'2026-09-07','DA_HUY',900),(4,'2026-10-01','HOAN_THANH',500)]]
        data['chi_tiet_don_hang']=[dict(id='l'+str(i),ma_don_hang=order,ma_san_pham=product,thanh_tien=value,so_luong=quantity)
            for i,(order,product,value,quantity) in enumerate([('o1','p1',100,2),('o1','p2',900,1),('o2','p1',400,4),
                ('o2','p3',100,3),('o3','p1',900,20),('o4','p1',500,30)])]
        req=f.requirement(metric_ids=['product_revenue'],dimension_ids=['product'],
            ranking={'limit':2,'metric_id':'product_revenue','direction':'top'},derived_features=[])
        report=self.report(req,'Top 2 sản phẩm theo doanh thu sản phẩm tháng 9 năm 2026',data,
            analysis_depth='comprehensive',input_mode='guided',analysis_mission='ranking',
            guided_contract={'metric':'product_revenue','dimension':'product','n':2,'direction':'top'},
            time={'mode':'custom','start':'2026-09-01','end':'2026-09-30'})[2]
        rank=next(q for q in report['analytical_queries'] if q['operation']=='ranking')
        self.assertEqual({r['product_id'] for r in report['result_sets'][rank['id']]['rows']},{'p1','p2'})
        eligible={o['ma_don_hang'] for o in data['don_hang'] if o['trang_thai_don_hang'] in {'HOAN_THANH','DANG_GIAO'}
                  and '2026-09-01'<=o['ngay_tao'][:10]<='2026-09-30'}
        expected=sum(line['thanh_tien'] for line in data['chi_tiet_don_hang']
                     if line['ma_don_hang'] in eligible and line['ma_san_pham'] in {'p1','p2'})
        self.assertEqual(expected,1400)
        children=[q for q in report['analytical_queries'] if q['role']=='supporting' and q['metrics']==['product_revenue']]
        self.assertTrue(children)
        for query in children:
            self.assertEqual(query.get('cohort_scope_query_id'),rank['id'])
            self.assertEqual(sum(r['product_revenue'] for r in report['result_sets'][query['id']]['rows']),expected)

    def test_voucher_cohort_unique_buyers_are_counted_once_across_overlapping_members(self):
        data = deepcopy(w.DATA)
        data['khuyen_mai'] = [dict(ma_khuyen_mai='v'+str(i), ten_khuyen_mai='Ưu đãi '+str(i)) for i in range(1, 4)]
        data['voucher'] = data['khuyen_mai']
        orders = []
        for i, (voucher, customer, amount, store) in enumerate([
                ('v1', 'u1', 600, 's1'), ('v1', 'u1', 400, 's2'),
                ('v2', 'u1', 500, 's1'), ('v2', 'u1', 300, 's2'), ('v3', 'u2', 100, 's2')]):
            orders.append({**w.ORDERS[0], 'ma_don_hang':'v-order-'+str(i), 'ma_voucher':voucher,
                'ma_nguoi_dung':customer, 'tong_tien':amount, 'co_so_ma':store})
        data['don_hang'] = orders
        period = {'kind':'range','start':'2026-09-01','end':'2026-09-30'}
        rank = f.requirement(id='rank', domain_id='promotions', metric_ids=['voucher_revenue'], dimension_ids=['promotion'],
            time=period, ranking={'limit':2,'metric_id':'voucher_revenue','direction':'top'}, derived_features=[])
        child = f.requirement(id='buyers', domain_id='orders', metric_ids=['purchasing_customer_count'], dimension_ids=[],
            time=period, analysis_kind='aggregate', ranking=None, derived_features=['scalar'])
        with patch.dict(w.DATA, data):
            warehouse=w.FixtureWarehouse(self.catalog.overlay);self.addCleanup(warehouse.close)
            pipeline=self.pipeline(f.scripted(f.envelope(rank,child)),executor=warehouse)
            request=self.request('Top 2 mã khuyến mãi theo doanh thu đơn có khuyến mãi tháng 9 năm 2026; số khách đã mua chỉ trong các mã khuyến mãi này',
                analysis_depth='focused',refresh=True)
            try:
                report=pipeline.generate(f.approve(request,pipeline.propose(request)))
            except Exception:
                print('HOLDOUT_DIAGNOSTICS '+json.dumps({k:v for k,v in pipeline.semantic_info.items()
                    if k in {'contract_issues','failure_code','terminal_error','failure_stage','semantic_stop_reason'}},ensure_ascii=False))
                raise
        primary=next(q for q in report['analytical_queries'] if q['operation']=='ranking')
        buyer=next(q for q in report['analytical_queries'] if q['metrics']==['purchasing_customer_count'] and not q['group_by'])
        self.assertEqual(buyer.get('cohort_scope_query_id'),primary['id'])
        expected=len({o['ma_nguoi_dung'] for o in orders if o['ma_voucher'] in {'v1','v2'}})
        self.assertEqual(report['result_sets'][buyer['id']]['rows'][0]['purchasing_customer_count'],expected)
        self.assertEqual(expected,1)  # sum of the two per-voucher distinct counts would incorrectly give 2.


if __name__=='__main__':f.unittest.main()
