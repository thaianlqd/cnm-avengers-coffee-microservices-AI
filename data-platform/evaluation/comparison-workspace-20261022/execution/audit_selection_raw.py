"""Independent finite audit: yearly revenue volatility selector and fixed-city continuation.
Hand-written SQL and Python CV; no production selector/compiler imports.
Authored contract: year2026, as-of22Oct2026, two most volatile cities, monthly revenue.
"""
import argparse,json,math
from pathlib import Path
from statistics import mean,pstdev
from datetime import datetime,timezone
from services.sql_service import execute_read_only
p=argparse.ArgumentParser();p.add_argument('--report',required=True);p.add_argument('--out',required=True);a=p.parse_args()
r=json.loads(Path(a.report).read_text())
rows=execute_read_only("""SELECT c.thanh_pho AS city, DATE_TRUNC('month',d.ngay_tao) AS month, SUM(d.tong_tien) AS amount
FROM silver.don_hang d JOIN silver.chi_nhanh c ON c.ma_chi_nhanh=d.co_so_ma
WHERE d.trang_thai_don_hang IN ('HOAN_THANH','DANG_GIAO') AND d.ngay_tao>='2026-01-01'
AND d.ngay_tao<'2026-10-01' GROUP BY 1,2""",row_limit=5000)
assert not rows.get('truncated')
months={f'2026-{m:02d}' for m in range(1,10)};series={}
for x in rows['rows']:series.setdefault(x['city'],{})[str(x['month'])[:7]]=float(x['amount'])
scores={city:pstdev(list(s.values()))/mean(s.values()) for city,s in series.items() if set(s)==months and mean(s.values())>0}
chosen=sorted(scores,key=lambda city:(-scores[city],city))[:2]
frames=[f for f in r['comparison_frames'] if f.get('selection')]
checks={'authored_definition':bool(frames) and all(f['selection']['criterion']=='volatility' and f['selection']['limit']==2 and set(x[:7] for x in f['selection']['buckets'])==months for f in frames),
'exact_selected_identity_order':bool(frames) and all(f['selection']['selected']==chosen for f in frames),
'exact_disclosed_candidate_score_order':bool(frames) and all([x['key'] for x in f['selection']['eligible']]==sorted(scores,key=lambda city:(-scores[city],city))[:50] and all(math.isclose(x['score'],scores[x['key']],rel_tol=1e-12,abs_tol=1e-12) for x in f['selection']['eligible']) for f in frames),
'all_queries_fixed_city_scope':all(any(f['dimension']=='city' and f['operator']=='in' and set(f['value'])==set(chosen) for f in q['filters']) for q in r['analytical_queries']),
'monthly_city_primary':any(q['role']=='requested' and q['operation']=='trend' and q['granularity']=='month' and 'city' in q['group_by'] for q in r['analytical_queries'])}
result=dict(at=datetime.now(timezone.utc).isoformat(),passed=all(checks.values()),checks=checks,selected=chosen,eligible_cities_from_independent_source=len(scores),report_candidate_preview=[len(f['selection']['eligible']) for f in frames],complete_months=sorted(months),query_count=len(r['analytical_queries']),limitation='Finite independently authored contract, current-source equality; not generic selector accuracy or atomic historical snapshot. Report candidate list is capped at50; this audits all55 source candidates to select IDs and only the50 disclosed scores, not a claimed full report census.')
Path(a.out).write_text(json.dumps(result,ensure_ascii=False,indent=2));print(json.dumps(result,ensure_ascii=False));raise SystemExit(not result['passed'])
