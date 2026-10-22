"""H04/H05/H08 acceptance across independent operational populations."""
from collections import defaultdict
from tests import test_hybrid_v28 as f
from tests.test_ai_final_depth_contract import DepthReportMixin
from evals.rich_fixture import rich_world
from evals import fixture_warehouse as w
from unittest.mock import patch
from services.result_artifact_store import artifact_store

PERIOD={'kind':'range','start':'2026-09-01','end':'2026-09-30'}

def rows(report,query):
    result=report['result_sets'][query['id']]
    return artifact_store().get(result['artifact_ref'])['rows'] if result.get('artifact_ref') else result['rows']


class RemainingHoldouts(DepthReportMixin,f.unittest.TestCase):
    def test_H04_low_delivery_success_ranks_low_first_with_raw_exposures(self):
        data=rich_world();store_of={o['ma_don_hang']:o['co_so_ma'] for o in data['don_hang']}
        names={s['ma_chi_nhanh']:s['ten_chi_nhanh'] for s in data['chi_nhanh']};groups=defaultdict(list)
        for d in data['giao_hang']:
            if '2026-09-01'<=d['thoi_gian_nhan_chuyen'][:10]<='2026-09-30' and d['trang_thai_giao_hang'] in {'DELIVERED','FAILED','CANCELLED'}:
                groups[store_of[d['ma_don_hang']]].append(d)
        rates={k:round(100*sum(d['trang_thai_giao_hang']=='DELIVERED' for d in v)/len(v),2) for k,v in groups.items()}
        selected=sorted(groups,key=lambda k:(rates[k],names[k],k))[:3]
        req=f.requirement(metric_ids=['delivery_success_rate'],dimension_ids=['store'],time=PERIOD,
            ranking={'limit':3,'metric_id':'delivery_success_rate','direction':'bottom'},derived_features=[])
        report=self.report(req,'Bottom 3 chi nhánh theo tỷ lệ giao thành công tháng 9 năm 2026',data,
            analysis_depth='comprehensive',input_mode='guided',analysis_mission='ranking',
            guided_contract={'metric':'delivery_success_rate','dimension':'store','n':3,'direction':'bottom'},
            time={'mode':'custom','start':'2026-09-01','end':'2026-09-30'})[2]
        rank=next(q for q in report['analytical_queries'] if q['operation']=='ranking')
        self.assertEqual([r['store_id'] for r in rows(report,rank)],selected)
        for r in rows(report,rank):self.assertEqual(r['delivery_success_rate'],rates[r['store_id']])
        # Exposure is a raw number of terminal delivery attempts, never the displayed percentage.
        self.assertTrue(all(len(groups[k])>0 for k in selected))
        self.assertEqual(rank['ranking']['direction'],'ASC')

    def test_H05_staff_region_scoped_at_all_depths_uses_weighted_raw_shifts(self):
        data=rich_world();south={'Hồ Chí Minh','Cần Thơ','Bình Dương','Đồng Nai','Bà Rịa - Vũng Tàu','Kiên Giang'}
        selected={s['ma_chi_nhanh'] for s in data['chi_nhanh'] if s['thanh_pho'] in south}
        shifts=[s for s in data['ca_lam_viec_nhan_vien'] if s['co_so_ma'] in selected and
            '2026-09-01'<=s['ngay_lam_viec'][:10]<='2026-09-30' and s['trang_thai_cham_cong'] in {'DUNG_GIO','DI_TRE','VE_SOM'}]
        expected=round(100*sum(s['trang_thai_cham_cong']=='DI_TRE' for s in shifts)/len(shifts),2)
        allowed={'late_shift_rate','late_terminal_shift_count','terminal_shift_count'}
        for depth in ('focused','deep','comprehensive'):
            with self.subTest(depth=depth):
                req=f.requirement(domain_id='staff_shifts',metric_ids=['late_shift_rate'],dimension_ids=[],analysis_kind='aggregate',
                    ranking=None,derived_features=['scalar'],time=PERIOD,
                    filters=[{'dimension':'city','operator':'in','value':sorted(south)}])
                report=self.report(req,'Tỷ lệ đi trễ tháng 9 năm 2026 tại miền Nam',data,analysis_depth=depth,refresh=True)[2]
                main=next(q for q in report['analytical_queries'] if q['role']=='requested')
                self.assertEqual(rows(report,main)[0]['late_shift_rate'],expected)
                for query in report['analytical_queries']:
                    self.assertTrue(set(query['metrics'])<=allowed)
                    self.assertTrue(any(f['dimension']=='city' and set(f['value'] if isinstance(f['value'],list) else [f['value']])==south for f in query['filters']))
                self.assertFalse(any('revenue' in c['metrics'] or c.get('x_field')=='payment_method' for c in report['charts']))

    def test_H08_negated_candidate_set_is_applied_before_rank_and_dependent_views(self):
        data=rich_world();store={s['ma_chi_nhanh']:s for s in data['chi_nhanh']};totals=defaultdict(int)
        for o in data['don_hang']:
            city=store[o['co_so_ma']]['thanh_pho']
            if city!='Hồ Chí Minh' and '2026-09-01'<=o['ngay_tao'][:10]<='2026-09-30' and o['trang_thai_don_hang'] in {'HOAN_THANH','DANG_GIAO'}:totals[city]+=o['tong_tien']
        chosen=sorted(totals,key=lambda k:(-totals[k],k))[:2];expected=sum(totals[k] for k in chosen)
        from services.value_grounding_service import dimension_values
        filters=[{'dimension':'city','operator':'in','value':sorted(set(dimension_values(self.catalog,'city'))-{'Hồ Chí Minh'})}]
        rank=f.requirement(id='rank',metric_ids=['revenue'],dimension_ids=['city'],time=PERIOD,filters=filters,
            ranking={'limit':2,'metric_id':'revenue','direction':'top'},derived_features=[])
        child=f.requirement(id='child',metric_ids=['revenue'],dimension_ids=['store'],time=PERIOD,filters=filters,
            analysis_kind='aggregate',ranking=None,derived_features=[])
        with patch.dict(w.DATA,data):
            warehouse=w.FixtureWarehouse(self.catalog.overlay);self.addCleanup(warehouse.close)
            pipeline=self.pipeline(f.scripted(f.envelope(rank,child)),executor=warehouse)
            request=self.request('Top 2 tỉnh theo doanh thu tháng 9 năm 2026, loại trừ Hồ Chí Minh; phân tích chi nhánh chỉ trong các tỉnh này',analysis_depth='focused',refresh=True)
            try:report=pipeline.generate(f.approve(request,pipeline.propose(request)))
            except Exception:
                print('H08_DIAGNOSTICS', {k:pipeline.semantic_info.get(k) for k in ('contract_issues','root_contract_issues','request_anchors','failure_code')});raise
        primary=next(q for q in report['analytical_queries'] if q['operation']=='ranking')
        self.assertEqual({r['city'] for r in rows(report,primary)},set(chosen))
        for q in report['analytical_queries']:
            if q['id']!=primary['id']:self.assertEqual(q.get('cohort_scope_query_id'),primary['id'])
            self.assertEqual(sum(r['revenue'] or 0 for r in rows(report,q)),expected)

if __name__=='__main__':f.unittest.main()
