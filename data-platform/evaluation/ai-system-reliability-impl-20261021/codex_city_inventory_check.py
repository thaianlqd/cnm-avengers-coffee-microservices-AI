"""M08: every observed city label, independent fixture execution and zero-provider preflight."""
import json
from unittest.mock import patch
from tests import test_hybrid_v28 as f
from services.preflight_service import run
from services.value_grounding_service import value_text
from evals import fixture_warehouse as w
from datetime import date
from pathlib import Path

class CityInventoryAcceptance(f.unittest.TestCase):
    setUp=f.HybridTests.setUp
    def test_all_observed_city_members_agree_in_preflight_and_execution(self):
        inventory=json.loads(Path('/tmp/codex-city-inventory.json').read_text());cities=inventory['cities'];observed=set(cities)
        outcomes=[]
        for city in cities:
            with self.subTest(city=city):
                scope={'mode':'selected','filters':[{'dimension':'city','operator':'in','value':[city]}]}
                lookup=lambda *a,**kw:{'values':[city],'queries':1}
                ready=run('Doanh thu tháng 9 năm 2026',catalog=self.catalog,reference=date(2026,10,21),coverage={},
                    analysis_scope=scope,input_lookup=lookup)
                self.assertTrue(ready['can_submit'],ready.get('findings'));self.assertEqual(ready['provider_calls'],0)
                data={'chi_nhanh':[dict(ma_chi_nhanh='s1',ten_chi_nhanh='Quán thử',thanh_pho=city,loai_diem_ban='CHI_NHANH_CHINH')],
                    'don_hang':[{**w.ORDERS[0],'ma_don_hang':'test-order','co_so_ma':'s1','tong_tien':137}],
                    'chi_tiet_don_hang':[],'giao_dich_thanh_toan':[]}
                with patch.dict(w.DATA,data):
                    warehouse=w.FixtureWarehouse(self.catalog.overlay);self.addCleanup(warehouse.close)
                    provider=f.scripted();p=f.HybridTests.pipeline(self,provider,executor=warehouse)
                    p.value_lookup=lambda table,column,ref,**kw:[v for v in observed if value_text(v)==value_text(ref)]
                    request=f.HybridTests.request(self,'Doanh thu tháng 9 năm 2026',input_mode='guided',analysis_mission='overview',
                        guided_contract={'metric':'revenue'},analysis_scope=scope,analysis_depth='focused',refresh=True,
                        time={'mode':'custom','start':'2026-09-01','end':'2026-09-30'})
                    report=p.generate(f.approve(request,p.propose(request)))
                self.assertEqual(provider.call_count,0)
                for q in report['analytical_queries']:
                    self.assertTrue(any(f['dimension']=='city' and (f['value'] if isinstance(f['value'],list) else [f['value']])==[city] for f in q['filters']))
                main=next(q for q in report['analytical_queries'] if q['role']=='requested')
                self.assertEqual(report['result_sets'][main['id']]['rows'][0]['revenue'],137)
                outcomes.append({'city':city,'preflight':'READY','fixture_revenue':137,'provider_calls':0})
        print('CITY_INVENTORY '+json.dumps({'count':len(outcomes),'cases':outcomes,'source_observed_generations':inventory['epoch']},ensure_ascii=False))
if __name__=='__main__':f.unittest.main()
