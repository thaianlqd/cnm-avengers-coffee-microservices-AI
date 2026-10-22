"""Companions keep independent populations on one selected ranking cohort."""
from copy import deepcopy
import json
from pathlib import Path
from unittest.mock import patch

from tests import test_hybrid_v28 as f
from services.analysis_quality_service import verify_saved_report, restore_artifacts
from services.analytical_query_service import validate_ranked_cohorts


CAPTURE=next(c for c in json.loads((Path(__file__).parent/'fixtures/v34_live44_rerun2_failed_intents.json').read_text())['cases'] if c['id']=='L43')


class RankedCompanionTests(f.unittest.TestCase):
    setUp=f.HybridTests.setUp
    pipeline=f.HybridTests.pipeline
    request=f.HybridTests.request

    def warehouse(self):
        from evals import fixture_warehouse as w
        data=deepcopy(w.DATA)
        data['chi_nhanh']=[];data['don_hang']=[]
        # Equal display names must remain separate by their stable store IDs.
        # Store 7 has the largest ALL-order count but the lowest cancellation
        # rate, and must stay out of the selected Top 5 cancellation cohort.
        for i in range(1,8):
            data['chi_nhanh'].append(dict(ma_chi_nhanh=f's{i}',ten_chi_nhanh='Trùng tên' if i<3 else f'Quán {i}',
                thanh_pho='Hà Nội',loai_diem_ban='STORE'))
            statuses=['DA_HUY']+['HOAN_THANH']*i+['DANG_GIAO']*(100 if i==7 else i)
            for j,status in enumerate(statuses):
                data['don_hang'].append(dict(ma_don_hang=f'o{i}_{j}',ma_nguoi_dung='u1',co_so_ma=f's{i}',
                    tong_tien=100,ma_voucher=None,so_tien_giam=0,trang_thai_don_hang=status,
                    loai_don_hang='DUNG_TAI_CHO',ngay_tao='2026-09-15T10:00:00'))
        with patch.object(w,'DATA',data):warehouse=w.FixtureWarehouse(self.catalog.overlay)
        self.addCleanup(warehouse.close)
        return warehouse

    def report(self):
        raw=deepcopy(CAPTURE['outputs'][0]);raw.pop('clarification',None)
        pipeline=self.pipeline(f.scripted(raw),executor=self.warehouse())
        request=self.request(CAPTURE['question'],analysis_depth='focused')
        proposal=pipeline.propose(request)
        report=pipeline.generate(f.approve(request,proposal))
        self.assertEqual(pipeline.provider.call_count,1)
        return report

    def test_captured_l43_keeps_exact_top5_keys_and_independent_all_order_counts(self):
        report=self.report()
        queries=report['analytical_queries']
        ranked=next(q for q in queries if q['role']=='requested' and q.get('ranking'))
        companion=next(q for q in queries if q.get('cohort_query_id'))
        self.assertEqual(ranked['metrics'],['order_cancellation_rate'])
        self.assertEqual(companion['metrics'],['order_count'])
        self.assertEqual(companion['cohort_query_id'],ranked['id'])
        primary=report['result_sets'][ranked['id']]['rows']
        counts=report['result_sets'][companion['id']]['rows']
        self.assertEqual({r['store_id'] for r in primary},{'s1','s2','s3','s4','s5'})
        self.assertEqual({r['store_id'] for r in counts},{r['store_id'] for r in primary})
        self.assertEqual({r['store_id']:r['order_count'] for r in counts},
            {f's{i}':1+2*i for i in range(1,6)})
        self.assertAlmostEqual(primary[0]['order_cancellation_rate'],50)
        evidence=next(e for e in report['evidence'] if e['feature']=='ranked_companion')
        self.assertEqual(len(evidence['values']['rows']),5)
        self.assertIn('s1',evidence['values']['rows'][0]['entity'])
        self.assertIn('Số lượng đơn',report['conclusion']['answer'])
        self.assertEqual(report['verification']['status'],'verified')
        self.assertEqual(report['completion_status'],'complete')

    def test_tampered_membership_population_sql_and_parent_cannot_verify(self):
        report=self.report()
        companion=next(q for q in report['analytical_queries'] if q.get('cohort_query_id'))
        for field in ('key','metric','parent','sql'):
            bad=deepcopy(report)
            if field=='key':bad['result_sets'][companion['id']]['rows'][0]['store_id']='s7'
            elif field=='metric':
                row=bad['result_sets'][companion['id']]['rows'][0];row['order_count']=999999
            elif field=='parent':
                next(q for q in bad['analytical_queries'] if q['id']==companion['id'])['cohort_query_id']='unknown'
            else:bad['sql_by_query'][companion['id']]=bad['sql_by_query'][companion['id']].replace('JOIN','LEFT JOIN',1)
            with self.subTest(field=field):self.assertNotEqual(verify_saved_report(bad,self.catalog)['status'],'verified')

    def test_full_artifact_membership_guard_rejects_a_different_top_n(self):
        artifacts=restore_artifacts(self.report(),self.catalog)
        companion=next(a for a in artifacts.values() if a.query.cohort_query_id)
        companion.result=deepcopy(companion.result)
        companion.result['rows'][0]['store_id']='s7'
        with self.assertRaises(f.AnalysisError):validate_ranked_cohorts(artifacts)

    def test_companion_cannot_change_time_or_filters_or_reference_an_unknown_cohort(self):
        from services.analytical_query_service import AnalyticalQueries
        from services.semantic_tools import SemanticTools
        report=self.report()
        source=next(q for q in report['analytical_queries'] if q.get('cohort_query_id'))
        for change in ({'time':{'kind':'month','month':8,'year':2026}},
                       {'filters':[{'dimension':'city','value':'Hà Nội'}]},
                       {'cohort_query_id':'missing'}, {'group_by':['city']}):
            queries=AnalyticalQueries(self.catalog,SemanticTools(self.catalog,f.Mock()),f.REFERENCE,f.Mock(),{},proposal=True)
            for q in report['analytical_queries']:
                if not q.get('cohort_query_id'):queries.prepare(q)
            with self.subTest(change=change),self.assertRaises(f.AnalysisError):queries.prepare({**source,**change})
