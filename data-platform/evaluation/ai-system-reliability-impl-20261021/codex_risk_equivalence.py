"""M11 direct Risk Watch and deep report share six canonical signal populations."""
from datetime import date
from unittest.mock import patch
from tests.test_v32_mission_reliability import Guarded,ScriptedProvider
from evals import fixture_warehouse as w
from evals.rich_fixture import rich_world
from services import risk_watch_service
from services.analysis_contract import TimeScope

class RiskEquivalence(Guarded):
    def test_direct_table_and_deep_report_agree_for_all_six_signals(self):
        data=rich_world();scope={'mode':'selected','filters':[{'dimension':'city','operator':'in','value':['Hồ Chí Minh']}]}
        time=TimeScope(mode='custom',start=date(2026,9,1),end=date(2026,9,30))
        with patch.dict(w.DATA,data):
            warehouse=w.FixtureWarehouse(self.overlay);self.addCleanup(warehouse.close)
            direct=risk_watch_service.evaluate(self.catalog,scope,time,executor=warehouse,reference=date(2026,10,16))
            provider=ScriptedProvider()
            _,report=self.report(provider,question='Kiểm tra rủi ro vận hành tháng 9 năm 2026',
                analysis_mission='risk_watch',analysis_depth='deep',analysis_scope=scope,
                time={'mode':'custom','start':'2026-09-01','end':'2026-09-30'})
        self.assertEqual(provider.call_count,0);self.assertEqual(direct['provider_calls'],0)
        self.assertEqual({s['id'] for s in direct['signals']},{s['id'] for s in self.registry['risk_signals']})
        metrics={s['metric'] for s in direct['signals']}
        for q in report['analytical_queries']:
            self.assertTrue(set(q['metrics'])<=metrics)
            self.assertTrue(any(f['dimension']=='city' and (f['value'] if isinstance(f['value'],list) else [f['value']])==['Hồ Chí Minh'] for f in q['filters']))
        for signal in direct['signals']:
            with self.subTest(signal=signal['id']):
                metric=signal['metric'];queries=[q for q in report['analytical_queries'] if metric in q['metrics'] and q['role']=='requested']
                totals=[q for q in queries if not q['group_by']]
                q=(totals or queries)[0];rows=report['result_sets'][q['id']]['rows']
                actual=rows[0][metric] if totals else sum(r[metric] or 0 for r in rows)
                self.assertAlmostEqual(actual,signal['value'],places=6)
                expected=next(s for s in self.registry['risk_signals'] if s['id']==signal['id'])
                self.assertEqual((signal['operator'],signal['threshold']),(expected['operator'],expected['threshold']))
                if metric=='paused_sale_positions':
                    self.assertIsNone(signal['period']['start']);self.assertEqual(q['time']['mode'],'all_time')
                else:self.assertEqual(signal['period'],{'start':'2026-09-01','end':'2026-09-30'})
if __name__=='__main__':
    import unittest
    unittest.main()
