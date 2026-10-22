"""Finite independent raw-record family/depth/data-density acceptance. No provider or DB transport."""
import json
from copy import deepcopy
from tests import test_hybrid_v28 as f
from tests.test_ai_final_depth_contract import DepthReportMixin
from evals.rich_fixture import rich_world
from services.analysis_catalog import AnalysisError
from services.result_artifact_store import artifact_store

RECORDS=[]
FAMILIES=[('revenue','sum'),('order_count','count'),('purchasing_customer_count','distinct'),
          ('aov','average'),('order_cancellation_rate','ratio'),('late_shift_rate','staff_ratio'),('paused_sale_positions','snapshot')]


def population(data):
    selected={s['ma_chi_nhanh'] for s in data['chi_nhanh'] if s['thanh_pho']=='Hồ Chí Minh'}
    orders=[o for o in data['don_hang'] if o['co_so_ma'] in selected and '2026-09-01'<=o['ngay_tao'][:10]<='2026-09-30']
    valid=[o for o in orders if o['trang_thai_don_hang'] in {'HOAN_THANH','DANG_GIAO'}]
    terminal=[o for o in orders if o['trang_thai_don_hang'] in {'HOAN_THANH','DA_HUY'}]
    shifts=[s for s in data['ca_lam_viec_nhan_vien'] if s['co_so_ma'] in selected
        and '2026-09-01'<=s['ngay_lam_viec'][:10]<='2026-09-30' and s['trang_thai_cham_cong'] in {'DUNG_GIO','DI_TRE','VE_SOM'}]
    stock=[s for s in data['ton_kho_san_pham'] if s['co_so_ma'] in selected]
    return {'revenue':sum(o['tong_tien'] for o in valid) if valid else None,'order_count':len(orders),
        'purchasing_customer_count':len({o['ma_nguoi_dung'] for o in valid}),
        'aov':sum(o['tong_tien'] for o in valid)/len(valid) if valid else None,
        'order_cancellation_rate':round(100*sum(o['trang_thai_don_hang']=='DA_HUY' for o in terminal)/len(terminal),2) if terminal else None,
        'late_shift_rate':round(100*sum(s['trang_thai_cham_cong']=='DI_TRE' for s in shifts)/len(shifts),2) if shifts else None,
        'paused_sale_positions':sum(s.get('dang_kinh_doanh') is not True for s in stock)}


def worlds():
    rich=rich_world();sparse=deepcopy(rich);empty=deepcopy(rich)
    dimensions={'chi_nhanh','san_pham','danh_muc','nguoi_dung','voucher','khuyen_mai','shipper'}
    # Preserve authoritative entity keys. A singleton fact population is not a
    # singleton directory; no missing entity or invented row is used as an oracle.
    for table,rows in rich.items():
        if table in dimensions:continue
        selected=[r for r in rows if r.get('co_so_ma','s1')=='s1' and
            str(r.get('ngay_tao',r.get('ngay_lam_viec','2026-09-15')))[:7]=='2026-09']
        sparse[table]=deepcopy(selected[:1]);empty[table]=[]
    return {'rich':rich,'sparse':sparse,'empty':empty}


class FamilyMatrix(DepthReportMixin,f.unittest.TestCase):
    def test_families_depths_and_density(self):
        for density,data in worlds().items():
            expected=population(data)
            for metric,family in FAMILIES:
                for depth in ('focused','deep','comprehensive'):
                    with self.subTest(density=density,metric=metric,depth=depth):
                        record={'metric':metric,'family':family,'density':density,'depth':depth,'expected_primary':expected[metric]}
                        RECORDS.append(record)
                        label=self.catalog.registry['metrics'][metric]['business_name']
                        options=dict(input_mode='guided',analysis_mission='overview',guided_contract={'metric':metric},
                            analysis_depth=depth,refresh=True,
                            analysis_scope={'mode':'selected','filters':[{'dimension':'city','operator':'in','value':['Hồ Chí Minh']}]})
                        options['time']={'mode':'auto'} if family=='snapshot' else {'mode':'custom','start':'2026-09-01','end':'2026-09-30'}
                        question=label+(' hiện tại' if family=='snapshot' else ' tháng 9 năm 2026')+' tại Hồ Chí Minh'
                        try:
                            pipeline,_,report=self.report(f.requirement(),question,data,**options)
                        except AnalysisError as error:
                            record.update(outcome=error.category)
                            self.assertTrue(expected[metric] is None or density=='empty' and expected[metric]==0)
                            self.assertEqual(error.category,'insufficient_data')
                            record['passed']=True
                            continue
                        record.update(outcome=report['status'],quality=report['quality_assessment']['status'],
                            charts=len(report.get('charts',[])),queries=len(report['analytical_queries']),
                            provider_calls=pipeline.provider.call_count)
                        self.assertEqual(pipeline.provider.call_count,0)
                        requested=[q for q in report['analytical_queries'] if q['role']=='requested']
                        self.assertEqual({m for q in requested for m in q['metrics']},{metric})
                        primary=next(q for q in requested if q['operation']=='aggregate' and not q['group_by'])
                        result=report['result_sets'][primary['id']]
                        rows=artifact_store().get(result['artifact_ref'])['rows'] if result.get('artifact_ref') else result['rows']
                        actual=rows[0][metric] if rows else None;record['actual_primary']=actual
                        if expected[metric] is None:self.assertIsNone(actual)
                        else:self.assertAlmostEqual(actual,expected[metric],places=6)
                        for query in report['analytical_queries']:
                            self.assertTrue(any(f['dimension']=='city' and f['value'] in ('Hồ Chí Minh',['Hồ Chí Minh']) for f in query['filters']))
                            if family=='snapshot':self.assertEqual(query['time'].get('mode'),'all_time')
                            else:self.assertEqual((query['time']['start'],query['time']['end']),('2026-09-01','2026-09-30'))
                        for chart in report['charts']:
                            self.assertTrue(chart.get('insight'));self.assertEqual(chart['scope_ref'],chart['query_id'])
                        checks=report['quality_assessment']['verification_checks']
                        self.assertTrue(all(c['status']=='passed' for c in checks if c['id'] in {'evidence_grounding','semantic_consistency','result_integrity'}))
                        record['passed']=True


if __name__=='__main__':
    runner=f.unittest.TextTestRunner(verbosity=1)
    result=runner.run(f.unittest.defaultTestLoader.loadTestsFromTestCase(FamilyMatrix))
    for record in RECORDS:record['status']='PASS' if record.get('passed') else 'FAIL'
    print('FAMILY_MATRIX '+json.dumps({'cases':RECORDS,'passed':result.wasSuccessful()},ensure_ascii=False))
    raise SystemExit(not result.wasSuccessful())
