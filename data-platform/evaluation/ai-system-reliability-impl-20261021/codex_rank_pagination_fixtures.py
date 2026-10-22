"""Generate real pipeline artifacts for joint ranking/claim/map pagination QA."""
import sys,json
from copy import deepcopy
from unittest.mock import patch
from tests import test_hybrid_v28 as f
from evals import fixture_warehouse as w
from services.result_artifact_store import artifact_store

cities=json.loads(sys.stdin.read())
t=f.HybridTests();t.setUp();records=[]
data=deepcopy(w.DATA)
amounts=[1000+(i//3)*100 for i in range(len(cities))]
data['chi_nhanh']=[{**data['chi_nhanh'][0],'ma_chi_nhanh':f'fixture{i}',
    'ten_chi_nhanh':f'Điểm bán thử {i}','thanh_pho':city} for i,city in enumerate(cities)]
data['don_hang']=[{**data['don_hang'][0],'ma_don_hang':f'fixture-order{i}',
    'co_so_ma':f'fixture{i}','tong_tien':amount,'trang_thai_don_hang':'HOAN_THANH',
    'ngay_tao':'2026-09-10T12:00:00'} for i,amount in enumerate(amounts)]
for direction in ('top','bottom'):
    for limit in (5,20,100):
        for depth in ('focused','deep','comprehensive'):
            identity=f'{direction}-{limit}-{depth}'
            expected=sorted(zip(cities,amounts),key=lambda row:((-row[1] if direction=='top' else row[1]),row[0]))[:limit]
            with patch.dict(w.DATA,data):
                wh=w.FixtureWarehouse(t.catalog.overlay)
                try:
                    req=f.requirement(metric_ids=['revenue'],dimension_ids=['city'],
                        ranking=dict(limit=limit,metric_id='revenue',direction=direction),
                        derived_features=['leader','selected_total'],time=dict(kind='month',month=9,year=2026))
                    p=t.pipeline(f.scripted(f.envelope(req)),executor=wh)
                    request=t.request(f'{direction.title()} {limit} tỉnh theo doanh thu tháng 9 năm 2026; kèm tổng doanh thu tập chọn',
                        analysis_depth=depth,refresh=True)
                    report=p.generate(f.approve(request,p.propose(request)))
                    query=next(q for q in report['analytical_queries'] if q['operation']=='ranking' and q['role']=='requested')
                    result=report['result_sets'][query['id']]
                    rows=artifact_store().get(result['artifact_ref'])['rows']
                    assert [(r['city'],r['revenue']) for r in rows]==expected
                    selected=next(e for e in report['evidence'] if e['feature']=='selected_total' and e['scope_ref']==query['id'])
                    assert selected['values']['total']==sum(v for _,v in expected)
                    assert report['quality_assessment']['status']=='verified'
                    records.append(dict(id=identity,direction=direction,limit=limit,depth=depth,
                        expected=expected,report=report,primary_query=query['id']))
                finally:wh.close()
print('RANKING_ARTIFACTS '+json.dumps(records,ensure_ascii=False))
t.doCleanups()
