"""H03/M10: observed non-suggestion store keys, Unicode text, duplicate display labels."""
import json,unicodedata
from pathlib import Path
from unittest.mock import patch
from datetime import date
from tests import test_hybrid_v28 as f
from tests.test_ai_final_depth_contract import DepthReportMixin
from evals import fixture_warehouse as w
from services.preflight_service import run
from services.value_grounding_service import dimension_values,value_text

class IdentityHoldouts(DepthReportMixin,f.unittest.TestCase):
    def store_ids(self):
        x=json.loads(Path('/tmp/codex-real-store-keys.json').read_text())
        return x['store_ids'][:2]
    def test_H03_nfc_nfd_with_observed_non_suggestion_store_id(self):
        store_id=self.store_ids()[0]
        self.assertNotIn(store_id,dimension_values(self.catalog,'store_id'))
        for form in ['NFC','NFD']:
            with self.subTest(form=form):
                question=unicodedata.normalize(form,'Doanh thu tháng 9 năm 2026')
                scope={'mode':'selected','filters':[{'dimension':'store_id','operator':'in','value':[store_id]}]}
                lookups=[]
                def authorized_lookup(*args,**kwargs):
                    lookups.append((args,kwargs));return {'values':[store_id],'queries':1}
                ready=run(question,catalog=self.catalog,reference=date(2026,10,21),coverage={},analysis_scope=scope,input_lookup=authorized_lookup)
                self.assertTrue(ready['can_submit'],ready.get('findings'));self.assertEqual(ready['provider_calls'],0)
                data={'chi_nhanh':[dict(ma_chi_nhanh=store_id,ten_chi_nhanh='Quán ngoài gợi ý',thanh_pho='Hồ Chí Minh',loai_diem_ban='CHI_NHANH_CHINH')],
                    'don_hang':[{**w.ORDERS[0],'co_so_ma':store_id,'tong_tien':137}],'chi_tiet_don_hang':[],'giao_dich_thanh_toan':[]}
                report=self.report(f.requirement(),question,data,input_mode='guided',analysis_mission='overview',
                    guided_contract={'metric':'revenue'},analysis_scope=scope,analysis_depth='focused',refresh=True,
                    time={'mode':'custom','start':'2026-09-01','end':'2026-09-30'})[2]
                for q in report['analytical_queries']:
                    self.assertTrue(any(f['dimension']=='store_id' and store_id in (f['value'] if isinstance(f['value'],list) else [f['value']]) for f in q['filters']))
                primary=next(q for q in report['analytical_queries'] if q['role']=='requested')
                self.assertEqual(report['result_sets'][primary['id']]['rows'][0]['revenue'],137)
    def test_M10_same_label_different_city_keeps_exact_store_keys(self):
        a,b=self.store_ids();data={'chi_nhanh':[
            dict(ma_chi_nhanh=a,ten_chi_nhanh='Quán trùng tên',thanh_pho='Hồ Chí Minh',loai_diem_ban='CHI_NHANH_CHINH'),
            dict(ma_chi_nhanh=b,ten_chi_nhanh='Quán trùng tên',thanh_pho='Hà Nội',loai_diem_ban='CHI_NHANH_CHINH')],
            'don_hang':[{**w.ORDERS[0],'ma_don_hang':'a','co_so_ma':a,'tong_tien':137},
                        {**w.ORDERS[0],'ma_don_hang':'b','co_so_ma':b,'tong_tien':223}],
            'chi_tiet_don_hang':[],'giao_dich_thanh_toan':[]}
        req=f.requirement(metric_ids=['revenue'],dimension_ids=['store'],analysis_kind='aggregate',ranking=None,
            derived_features=[],time={'kind':'range','start':'2026-09-01','end':'2026-09-30'})
        report=self.report(req,'Doanh thu theo chi nhánh tháng 9 năm 2026',data,analysis_depth='focused',refresh=True)[2]
        q=next(q for q in report['analytical_queries'] if q['role']=='requested')
        self.assertEqual({r['store_id']:r['revenue'] for r in report['result_sets'][q['id']]['rows']},{a:137,b:223})
        self.assertTrue(all(r['store']=='Quán trùng tên' for r in report['result_sets'][q['id']]['rows']))
if __name__=='__main__':f.unittest.main()
