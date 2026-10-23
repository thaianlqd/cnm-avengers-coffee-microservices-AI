"""Independent all-time shipper ranking oracle; run inside API with PYTHONPATH=/app.

Reads raw non-PII trip state/technical actor ID, never imports a production
compiler, renderer, rate formula, projection or ranking implementation.
Business definition: DELIVERED / (DELIVERED + FAILED + CANCELLED).
This bounded audit supports unfiltered, all-time Top N only; other contracts fail.
"""
import argparse
from collections import defaultdict
from decimal import Decimal, ROUND_HALF_UP
from datetime import datetime, timezone
import json
from pathlib import Path
from services.sql_service import execute_read_only

p = argparse.ArgumentParser()
p.add_argument('--report', required=True)
p.add_argument('--out', required=True)
args = p.parse_args()
report = json.loads(Path(args.report).read_text())
queries = [q for q in report['analytical_queries'] if q['role'] == 'requested']
assert len(queries) == 1
query = queries[0]
assert query['operation'] == 'ranking' and query['group_by'] == ['driver_id']
assert not query['filters'] and query['time']['kind'] == 'relative' and query['time']['mode'] == 'all_time'
assert query['ranking']['direction'] == 'DESC' and query['ranking']['metric'] == 'delivery_success_rate'
raw = execute_read_only('''SELECT g.ma_giao_hang AS trip_id, g.ma_shipper AS driver_id,
    g.trang_thai_giao_hang AS status, g.thoi_gian_nhan_chuyen AS created_at,
    d.loai_don_hang AS order_type, d.phuong_thuc_thanh_toan AS payment_method,
    c.ma_chi_nhanh AS store_id, c.ten_chi_nhanh AS store, c.thanh_pho AS city
    FROM silver.giao_hang g LEFT JOIN silver.don_hang d ON d.ma_don_hang=g.ma_don_hang
    LEFT JOIN silver.chi_nhanh c ON c.ma_chi_nhanh=d.co_so_ma''', row_limit=50000)
assert not raw.get('truncated'), 'raw population truncated'
assert len({str(r['trip_id']) for r in raw['rows']}) == len(raw['rows']), 'raw join fanout'
counts = defaultdict(lambda: [0, 0])
active = 0
for row in raw['rows']:
    if row['driver_id'] is None:
        continue
    if row['status'] not in {'DELIVERED', 'FAILED', 'CANCELLED'}:
        active += 1
        continue
    key = str(row['driver_id'])
    counts[key][1] += 1
    counts[key][0] += row['status'] == 'DELIVERED'
rates = {key: float((Decimal(100) * n / d).quantize(Decimal('.01'), rounding=ROUND_HALF_UP))
         for key, (n, d) in counts.items()}
limit = query['ranking']['top_n']
chosen = sorted(rates, key=lambda key: (-rates[key], key))[:limit]
actual = report['result_sets'][query['id']]['rows']
checks = {'exact_selected_identity_order': [str(r['driver_id']) for r in actual] == chosen,
          'exact_each_rate_and_exposure': all(r['delivery_success_rate'] == rates[str(r['driver_id'])]
              and r['delivered_terminal_count'] == counts[str(r['driver_id'])][0]
              and r['terminal_delivery_count'] == counts[str(r['driver_id'])][1] for r in actual)}
boundary = rates[chosen[-1]] if chosen else None
ties = sum(v == boundary for v in rates.values())
primary = next(c for c in report['charts'] if c.get('relevance_role') == 'primary')
census = primary['ranking_census']
checks['exact_eligible_population_and_boundary_ties'] = (census['eligible_population'] == len(rates)
    and census['selected'] == len(chosen) and census['boundary_tie_count'] == ties and census['boundary_value'] == boundary)
n = sum(counts[key][0] for key in chosen)
d = sum(counts[key][1] for key in chosen)
checks['headline_component_values_are_selected_cohort'] = all(c['value'] == n
    for c in report.get('kpi_cards', []) if c.get('metric') == 'delivered_terminal_count')
checked_queries = 0
for plan in report['query_plans']:
    q = next(q for q in report['analytical_queries'] if q['id'] == plan['id'])
    assert q['id'] == query['id'] or q.get('cohort_scope_query_id') == query['id'], 'companion widened cohort'
    assert not q['filters'] and plan['period']['mode'] == 'all_time'
    dims = (['period'] if plan['kind'] == 'trend' else []) + plan['dimensions']
    grouped = defaultdict(lambda: [0, 0])
    for row in raw['rows']:
        if str(row['driver_id']) not in chosen or row['status'] not in {'DELIVERED','FAILED','CANCELLED'}:
            continue
        def field(dim):
            if dim != 'period': return str(row[dim]) if dim == 'driver_id' else row.get(dim)
            day = str(row['created_at'])[:10]
            if plan['granularity'] == 'month': return day[:7]+'-01'
            if plan['granularity'] == 'day': return day
            raise ValueError('Unaudited cadence: '+plan['granularity'])
        key = tuple(field(dim) for dim in dims)
        grouped[key][1] += 1
        grouped[key][0] += row['status'] == 'DELIVERED'
    result_set = report['result_sets'][plan['id']]
    assert len(result_set['rows']) == result_set['total_rows'], 'preview is not a full result'
    expected = {key: {'delivered_terminal_count': num, 'terminal_delivery_count': den,
        'delivery_success_rate': float((Decimal(100)*num/den).quantize(Decimal('.01'),rounding=ROUND_HALF_UP))}
        for key,(num,den) in grouped.items()}
    shown = {tuple(str(row[dim])[:10] if dim=='period' else row.get(dim) for dim in dims): row
             for row in result_set['rows']}
    checks['all_result_grain_values '+plan['id']] = set(shown) == set(expected) and all(
        shown[key].get(metric) == expected[key][metric] for key in expected for metric in plan['metrics'])
    checked_queries += 1
result = dict(at=datetime.now(timezone.utc).isoformat(), passed=all(checks.values()), checks=checks,
    raw_trip_rows=len(raw['rows']), active_trips_excluded=active, eligible_drivers=len(rates),
    selected=len(chosen), boundary_value=boundary, boundary_ties=ties, checked_queries=checked_queries,
    selected_delivered=n, selected_terminal=d, selected_weighted_rate=100*n/d if d else None,
    session_id=report['session_id'], revision=report['revision'],
    limitation='Independent code/current-source equality, not atomic historical-snapshot or source-completeness proof. UUID tie-break is ordering, not superiority.')
Path(args.out).write_text(json.dumps(result, ensure_ascii=False, indent=2))
print(json.dumps(result, ensure_ascii=False))
raise SystemExit(not result['passed'])
