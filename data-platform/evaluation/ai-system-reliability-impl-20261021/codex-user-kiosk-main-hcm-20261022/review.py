"""Read-only numerical audit of captured report; semantic findings remain separate."""
import json
import math
from collections import Counter, defaultdict
from pathlib import Path

D = Path(__file__).resolve().parent
def read(name):
    return json.loads((D / name).read_text())
r, full, g, o = map(read, ['report-summary.json', 'immutable-result-rows.json', 'geography.json', 'warehouse-oracle.json'])
registry = json.loads((D.parents[2] / 'analytics-api/metadata/semantic_catalog.json').read_text())['analysis_registry']
orders = o['observations']['orders']['rows']
directory = o['observations']['directory']['rows']
valid = [v for v in orders if v['status'] in ['HOAN_THANH', 'DANG_GIAO']]
types = {'CHI_NHANH_CHINH', 'KIOSK_NHUONG_QUYEN', 'KIOSK_VE_TINH'}
queries = {q['id']: q for q in r['analytical_queries']}
checks, query_checks, chart_checks = [], [], []
def check(label, passed, **details):
    checks.append(dict(check=label, passed=bool(passed), **details))
def close(a, b):
    return a is not None and b is not None and math.isclose(float(a), float(b), rel_tol=1e-10, abs_tol=.001)
def key(row, fields):
    return tuple(str(row[f])[:10] if f == 'period' else row.get(f) for f in fields)
def label(dim, value):
    return registry['dimensions'][dim].get('value_labels', {}).get(value, value)
check('exact screenshot report identity', r['session_id'] == '50ed1fe9-35a9-4cf0-964d-ee5b9578e363' and r['revision'] == 1 and len(r['charts']) == 8)
check('raw population HCM and requested store types', {v['city'] for v in orders + directory} == {'Hồ Chí Minh'} and {v['store_type'] for v in orders + directory} == types)
total = sum(v['amount'] or 0 for v in valid)
for qid, q in queries.items():
    check('scope ' + qid, any(f['dimension'] == 'city' and f['operator'] == 'eq' and f['value'] == 'Hồ Chí Minh' for f in q['filters']) and any(f['dimension'] == 'store_type' and f['operator'] == 'in' and set(f['value']) == types for f in q['filters']) and q['time']['mode'] == 'all_time')
    actual = full[qid]
    fields = [f for f in actual[0] if f != 'revenue']
    expected = defaultdict(float)
    for v in valid:
        row = {**v, 'period': v['created_at'][:7] + '-01'}
        expected[key(row, fields)] += v['amount'] or 0
    observed = {key(v, fields): v['revenue'] for v in actual}
    same = len(observed) == len(actual) and set(expected) == set(observed) and all(close(observed[k], v) for k, v in expected.items())
    check('all grouped keys and values ' + qid, same)
    check('query total ' + qid, close(sum(observed.values()), total))
    query_checks.append(dict(query_id=qid, rows=len(actual), fields=fields, passed=same, total=sum(observed.values())))
facts = 0
for c in r['charts']:
    qid = c['query_id']
    ctx = c['insight']['verification_context']['chart']
    source, data = full[qid], ctx['data']
    dims = ctx.get('dimension_ids') or queries[qid]['group_by']
    plotted = []
    if ctx.get('series'):
        dimension = ctx['series_field']
        names = {label(dimension, v[dimension]): v[dimension] for v in source}
        series = {v['key']: names[v['label']] for v in ctx['series']}
        lookup = {(v['period'][:10], v[dimension]): v['revenue'] for v in source}
        for row in data:
            period = row['label'][:10]
            denominator = sum(v['revenue'] for v in source if v['period'][:10] == period)
            for field, member in series.items():
                expected = lookup[period, member]
                if ctx['chart_type'] == 'stacked_100':
                    expected = 100 * expected / denominator
                plotted.append(close(row[field], expected))
        check('complete period-member chart ' + c['id'], len(plotted) == len(source))
    elif ctx['chart_type'] == 'heatmap':
        lookup = {(label(ctx['x_field'], v[ctx['x_field']]), label(ctx['series_field'], v[ctx['series_field']])): v['revenue'] for v in source}
        plotted = [close(v['value'], lookup.get((v['x'], v['y']))) for v in data]
        check('complete heatmap ' + c['id'], len(data) == len(source))
    else:
        for row in data:
            if row.get('entity_ref'):
                filters = row['entity_ref']['filters']
                matches = [v for v in source if all(v.get(k) == val for k, val in filters.items())]
            elif ctx['x_field'] == 'period':
                matches = [v for v in source if v['period'][:10] == row['label'][:10]]
            else:
                matches = [v for v in source if label(ctx['x_field'], v[ctx['x_field']]) == row['label']]
            plotted.append(len(matches) == 1 and close(row['value'], matches[0]['revenue']))
        if ctx.get('selection') == 'display_subset':
            wanted = sorted(source, key=lambda v: -v['revenue'])[:ctx['displayed_count']]
            check('Top20 membership and order ' + c['id'], [v['entity_ref']['filters']['store_id'] for v in data] == [v['store_id'] for v in wanted])
        else:
            check('complete chart groups ' + c['id'], len(data) == len(source))
    check('every plotted numeric observation ' + c['id'], all(plotted))
    for f in c['insight']['key_facts']:
        facts += 1
        calc = f.get('calc') or {}
        if calc.get('kind') == 'change':
            selected = [v for v in source if ('|'.join(str(v[d]) for d in calc['dims']) or 'all') == calc['group_key']]
            first = next(v for v in selected if v['period'][:10] == calc['first_bucket'])
            last = next(v for v in selected if v['period'][:10] == calc['last_bucket'])
            expected = last['revenue'] - first['revenue']
            check('recomputed fact percent ' + c['id'], close(calc['pct'], round(100 * expected / abs(first['revenue']), 6)))
        else:
            assert not calc, calc
            token = f['evidence_ref'].split(':', 2)[2]
            if '@' in token:
                member, bucket = token.rsplit('@', 1)
                selected = [v for v in source if ('|'.join(str(v[d]) for d in dims if d != 'period') or 'all') == member and v['period'][:10] == bucket]
            else:
                selected = [v for v in source if ('|'.join(str(v[d]) for d in dims) or 'all') == token]
            check('fact row identity ' + c['id'], len(selected) == 1)
            expected = selected[0]['revenue']
        check('fact raw number and source unit ' + c['id'], close(expected, f['value']) and f['unit'] == 'VND')
    chart_checks.append(dict(id=c['id'], chart_type=ctx['chart_type'], unit=ctx['unit'], observations=len(plotted), numeric_passed=all(plotted)))
network = {v['store_id']: v for v in directory}
by_store = defaultdict(list)
for v in orders:
    by_store[v['store_id']].append(v)
check('exact map directory', set(network) == {v['store_id'] for v in g['stores']})
for v in g['stores']:
    rows = by_store[v['store_id']]
    good = [x for x in rows if x['status'] in ['HOAN_THANH', 'DANG_GIAO']]
    money = sum(x['amount'] or 0 for x in good)
    check('map store ' + v['store_id'], v['city'] == network[v['store_id']]['city'] and v['store_type'] == network[v['store_id']]['store_type'] and close(v['revenue'], money) and v['orders'] == len(rows) and v['valid_orders'] == len(good) and close(v['aov'], money / len(good)))
s = g['summary']
check('map summary incl AOV denominator', close(s['revenue'], total) and s['orders'] == len(orders) and s['valid_orders'] == len(valid) and s['store_count'] == len(directory) and close(s['aov'], total / len(valid)))
coords = sum(v['location_status'] == 'recorded' for v in g['stores'])
check('recorded coordinates count', coords == 416)
comparison = {}
for name, members in [('main', {'CHI_NHANH_CHINH'}), ('kiosk_all', types - {'CHI_NHANH_CHINH'}), ('kiosk_franchise', {'KIOSK_NHUONG_QUYEN'}), ('kiosk_satellite', {'KIOSK_VE_TINH'})]:
    rows = [v for v in valid if v['store_type'] in members]
    money = sum(v['amount'] or 0 for v in rows)
    stores = sum(v['store_type'] in members for v in directory)
    monthly, channels = defaultdict(float), defaultdict(float)
    for v in rows:
        monthly[v['created_at'][:7]] += v['amount'] or 0
        channels[v['order_type']] += v['amount'] or 0
    comparison[name] = dict(revenue=money, share_pct=100 * money / total, current_stores=stores, revenue_per_current_store=money/stores, valid_orders=len(rows), aov=money/len(rows), monthly=dict(sorted(monthly.items())), channel_revenue=dict(channels), channel_share_pct={k:100*v/money for k,v in channels.items()}, jan_to_sep_pct=100*(monthly['2026-09']/monthly['2026-01']-1))
main, kiosk = comparison['main'], comparison['kiosk_all']
derived = dict(gap=main['revenue']-kiosk['revenue'], main_over_kiosk_factor=main['revenue']/kiosk['revenue'], mean_revenue_per_current_store_gap_pct=100*(main['revenue_per_current_store']/kiosk['revenue_per_current_store']-1), main_share_jan=100*main['monthly']['2026-01']/sum(v['amount']or 0 for v in valid if v['created_at'].startswith('2026-01')), main_share_sep=100*main['monthly']['2026-09']/sum(v['amount']or 0 for v in valid if v['created_at'].startswith('2026-09')))
derived['main_share_change_percentage_points'] = derived['main_share_sep'] - derived['main_share_jan']
result = dict(numeric_passed=all(x['passed'] for x in checks), session_id=r['session_id'], revision=r['revision'], query_count=len(queries), grouped_rows_checked=sum(len(v) for v in full.values()), chart_count=len(chart_checks), chart_observations_checked=sum(v['observations'] for v in chart_checks), chart_facts_checked=facts, check_count=len(checks), checks=checks, queries=query_checks, charts=chart_checks, map_summary=s, coordinates_recorded=coords, comparison=comparison, derived=derived, snapshot=dict(report_epoch=r['provenance']['data_epoch'], oracle_epoch=o['epoch'], report_oracle_sources_equal=r['provenance']['data_epoch']['sources']==o['epoch']['sources'], limitation='Current raw records match every captured immutable grouped result; original report and current raw capture are different observed generations, not proven identical historical snapshots.'), limits=['Source city/GPS labels and real-world location are not independently certified.', 'Revenue is order amount for HOAN_THANH/DANG_GIAO by created_at, not profit or accounting recognition.', 'Revenue per current store does not adjust operating days, opening dates, capacity or costs.', 'Numeric pass does not approve the comparison semantics or percentage-view narrative.'])
(D/'review.json').write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n')
print(json.dumps({k:result[k] for k in ['numeric_passed','query_count','grouped_rows_checked','chart_count','chart_observations_checked','chart_facts_checked','check_count','comparison','derived']}, ensure_ascii=False, indent=2))
print('FAILED', [x for x in checks if not x['passed']])
raise SystemExit(not result['numeric_passed'])
