"""Representative of each26 advertised domains ×3densities ×3depths.

Independent raw-record oracles are below; no catalog expression computes an
expected value. Host mode creates a fresh isolated process per domain.
"""
import sys,json,hashlib
from pathlib import Path

METRICS=dict(orders='revenue',order_items='item_revenue',products='quantity_sold',stores='store_revenue',
 customers='customer_count',promotions='promotion_redemption_count',payments='payment_count',delivery='delivery_count',
 inventory='sale_positions',product_reviews='review_count',store_reviews='store_review_count',staff_shifts='shift_count',
 cashier_reconciliation='reconciled_shifts',customer_surveys='survey_response_count',wishlist_favorites='favorite_count',hourly='hourly_orders',
 customer_wallet='wallet_topup_amount',gift_cards='gift_card_issued_count',shipper_finance='cod_remitted_amount',
 customer_care='support_conversation_count',news_content='published_article_count',franchise_network='franchise_application_count',
 franchise_finance='combo_order_count',kiosk_operations='kiosk_shift_count',survey_answers='survey_answer_count',loyalty_awards='loyalty_points_awarded')

if len(sys.argv)>1 and sys.argv[1]=='--host':
    import subprocess,time,argparse
    parser=argparse.ArgumentParser();parser.add_argument('--host',action='store_true');parser.add_argument('--out',default='codex-domain-matrix33');parser.add_argument('--container',default='avengers_reliability_policy33_codex');args=parser.parse_args()
    here=Path(__file__).resolve().parent;out=here/args.out;out.mkdir(exist_ok=False)
    source=Path(__file__).read_bytes();records=[]
    (out/'manifest.json').write_text(json.dumps(dict(domains=METRICS,densities=['rich','sparse','empty'],
        depths=['focused','deep','comprehensive'],expected_cells=234,source_sha256=hashlib.sha256(source).hexdigest()),indent=2))
    for domain in METRICS:
        start=time.monotonic()
        with (out/(domain+'.log')).open('w') as log:
            done=subprocess.run(['docker','exec','-i',args.container,'env','AI_OFFLINE=1',
                'DATA_ANALYST_ENV=development','DATA_ANALYST_SESSION_STORE=memory','DATA_ANALYST_ARTIFACT_STORE=memory',
                'MPLCONFIGDIR=/tmp/mpl','python','-',domain],input=source,stdout=log,stderr=subprocess.STDOUT,timeout=240)
        text=(out/(domain+'.log')).read_text()
        data=next((json.loads(l.split('DOMAIN_RESULT ',1)[1]) for l in text.splitlines() if l.startswith('DOMAIN_RESULT ')),{})
        record=dict(domain=domain,seconds=round(time.monotonic()-start,2),returncode=done.returncode,**data)
        records.append(record);(out/'domains.json').write_text(json.dumps(records,ensure_ascii=False,indent=2))
        print(json.dumps(dict(domain=domain,returncode=done.returncode,passed=data.get('passed'),cells=len(data.get('cases',[])))),flush=True)
    cells=[c for r in records for c in r.get('cases',[])]
    result=dict(passed=len(cells)==234 and all(c.get('passed') for c in cells),cases=cells,
        limits='One representative/domain, pairwise dimensions via separate cohort/family fixtures; not all metrics × all combinations.')
    (out/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
    raise SystemExit(not result['passed'])

from copy import deepcopy
from unittest.mock import patch
from tests import test_hybrid_v28 as f
from tests.test_business_coverage_oracles import FIXTURES
from evals.rich_fixture import rich_world
from evals import fixture_warehouse as w
from services.result_artifact_store import artifact_store

def oracle(metric,data):
    valid={r['ma_don_hang'] for r in data['don_hang'] if r['trang_thai_don_hang'] in {'HOAN_THANH','DANG_GIAO'}}
    if metric in {'revenue','store_revenue'}:
        rows=[r for r in data['don_hang'] if r['ma_don_hang'] in valid]
        return sum(r['tong_tien'] for r in rows) if rows else None
    if metric in {'item_revenue','quantity_sold'}:
        rows=[r for r in data['chi_tiet_don_hang'] if r['ma_don_hang'] in valid]
        return sum(r['thanh_tien' if metric=='item_revenue' else 'so_luong'] for r in rows) if rows else None
    if metric=='customer_count':return len({r['ma_nguoi_dung'] for r in data['nguoi_dung'] if r['vai_tro']=='CUSTOMER'})
    counts=dict(promotion_redemption_count='khuyen_mai_su_dung',payment_count='giao_dich_thanh_toan',delivery_count='giao_hang',store_review_count='danh_gia_chi_nhanh',
        sale_positions='ton_kho_san_pham',review_count='danh_gia_san_pham',shift_count='ca_lam_viec_nhan_vien',
        reconciled_shifts='ca_doi_soat',survey_response_count='khao_sat_phan_hoi',favorite_count='yeu_thich_san_pham',
        hourly_orders='don_hang',gift_card_issued_count='the_qua_tang',support_conversation_count='hoi_thoai_cskh',
        franchise_application_count='ho_so_nhuong_quyen',combo_order_count='don_mua_combo',kiosk_shift_count='ca_kiosk',survey_answer_count='khao_sat_tra_loi')
    if metric in counts:return len(data[counts[metric]])
    if metric=='public_store_review_count':return sum(r['hien_thi_cong_khai']=='PUBLIC_VISIBLE' for r in data['danh_gia_chi_nhanh'])
    if metric=='wallet_topup_amount':return sum(r['so_tien'] for r in data['vi_khach_hang_giao_dich'] if r['loai_giao_dich']=='TOP_UP' and r['trang_thai']=='SUCCESS')
    if metric=='cod_remitted_amount':return sum(r['so_tien'] for r in data['shipper_nop_cod'] if r['trang_thai']=='CONFIRMED')
    if metric=='published_article_count':return sum(bool(r['da_xuat_ban']) for r in data['bai_viet'])
    if metric=='loyalty_points_awarded':return sum(r['diem_thuong'] for r in data['thuong_loyalty_don'])
    raise AssertionError('Independent oracle missing: '+metric)

domain=sys.argv[1];metric=METRICS[domain]
t=f.HybridTests();t.setUp();catalog=t.catalog
assert set(METRICS)==set(catalog.registry['domain_intelligence']['profiles'])
assert metric in catalog.registry['domain_intelligence']['profiles'][domain]['metric_refs']
base=deepcopy(w.DATA);rich=rich_world();base.update(rich)
# Business oracle rows specify only numeric/status traps. Retain the complete
# directory/clock fields from their own base rows; do not overwrite the rich
# legacy order/review populations with unrelated minimal business test rows.
for table,rows in FIXTURES.items():
    if table in rich:continue
    templates=base.get(table,[])
    base[table]=[{**(templates[i%len(templates)] if templates else {}),**row} for i,row in enumerate(rows)]
table=catalog.registry['metrics'][metric]['source'].split('.')[1]
records=[]
for density in ('rich','sparse','empty'):
    data=deepcopy(base)
    if density!='rich':data[table]=data[table][:1] if density=='sparse' else []
    expected=oracle(metric,data)
    fixture_digest=hashlib.sha256(json.dumps(data,sort_keys=True,default=str).encode()).hexdigest()
    for depth in ('focused','deep','comprehensive'):
        record=dict(domain=domain,metric=metric,density=density,depth=depth,expected=expected,
            primary_source_observations=len(data[table]),fixture_sha256=fixture_digest,passed=False)
        records.append(record)
        with patch.dict(w.DATA,data):
            wh=w.FixtureWarehouse(catalog.overlay)
            try:
                p=t.pipeline(executor=wh)
                req=t.request('Tình hình '+catalog.registry['metrics'][metric]['business_name'].lower(),input_mode='guided',
                    analysis_mission='overview',guided_contract={'metric':metric},time={'mode':'all_time'},
                    analysis_depth=depth,refresh=True)
                report=p.generate(f.approve(req,p.propose(req)))
                primary=next(q for q in report['analytical_queries'] if q['role']=='requested' and q['operation']=='aggregate' and not q['group_by'])
                assert primary['metrics']==[metric],primary
                result=artifact_store().get(report['result_sets'][primary['id']]['artifact_ref'])
                actual=result['rows'][0][metric] if result['rows'] else None
                if expected is None:assert actual is None,(actual,expected)
                else:assert abs(actual-expected)<1e-6,(actual,expected)
                assert p.provider.call_count==0
                assert all(g['input_refs'] for g in report['goal_provenance']['goals'])
                from services.analysis_quality_service import publication_issues
                assert not publication_issues(report['quality_assessment']),report['quality_assessment']
                record.update(passed=True,outcome=report['completion_status'],actual=actual,queries=len(report['analytical_queries']),charts=len(report['charts']),provider_calls=0)
            except f.AnalysisError as error:
                record.update(outcome=error.category,passed=error.category=='insufficient_data' and expected in {None,0})
            except Exception as error:
                record.update(error_type=type(error).__name__,error=str(error)[:1000])
            finally:wh.close()
        print('DOMAIN_CASE '+json.dumps(record,ensure_ascii=False),flush=True)
print('DOMAIN_RESULT '+json.dumps(dict(passed=all(r['passed'] for r in records),cases=records),ensure_ascii=False),flush=True)
t.doCleanups()
raise SystemExit(not all(r['passed'] for r in records))
