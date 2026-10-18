"""Render requested contribution evidence without new queries or Top N totals."""
import hashlib
import json
from collections import defaultdict
from math import isclose
from services.insight_service import number
from services.business_labels import dimension_labeler


def contribution_charts(artifacts, evidence):
    groups=defaultdict(list)
    for e in evidence:
        if e.get('feature')!='contribution_share':
            continue
        a=artifacts.get(e['scope_ref'])
        if not a:
            continue
        keys=a.plan.ranking.per_group if a.plan.ranking else []
        dims=e['values']['dimensions']
        partition=tuple((k,dims[k]) for k in keys)
        groups[(a.query.id,e['metric'],e['values']['denominator_scope'],partition)].append(e)
    output=[]
    for (ref,metric,denominator_ref,partition),facts in groups.items():
        a=artifacts[ref];denominator=artifacts.get(denominator_ref)
        if not denominator or denominator.plan.ranking or denominator.plan.explicit_limit:
            continue
        visible=[d for d in a.plan.dimensions if not d.endswith('_id') and d not in dict(partition)]
        if len(visible)!=1 or not facts:
            continue
        scoped_rows=[r for r in a.result['rows'] if all(r[k]==v for k,v in partition)]
        display=dimension_labeler(a.plan.dimensions,a.result['rows'],a.grounded.dimensions)
        if len(scoped_rows)!=len(facts):
            continue
        rows=[];valid=True
        for index,(row,e) in enumerate(zip(scoped_rows,facts)):
            v=e['values'];total=v['denominator'];value=v['value'];pct=v['share_pct']
            if (v['dimensions']!={d:row[d] for d in a.plan.dimensions}
                or not all(number(x) for x in (total,value,pct)) or total<=0 or value<0 or value>total
                or not number(row.get(metric)) or not isclose(value,row[metric],rel_tol=1e-12,abs_tol=1e-9)
                or not isclose(pct,100*value/total,rel_tol=1e-12,abs_tol=1e-9)):
                valid=False;break
            rows.append(dict(label=display(row,visible[0]),value=pct,numerator=value,denominator=total,evidence_id=e['id']))
        if not valid:
            continue
        population_count = len(rows)
        if len(rows) > 100:
            rows = sorted(rows, key=lambda r:(-r['numerator'], r['label']))[:20]
        label=a.grounded.metrics[metric]['business_name']
        selection='display_subset' if len(rows)<population_count else 'Top N' if a.plan.ranking else 'limited' if a.plan.explicit_limit else 'complete'
        suffix=f" · Top {a.plan.ranking.top_n}" if a.plan.ranking else ''
        if partition:suffix+=' · '+' / '.join(str(v) for k,v in partition)
        identity=json.dumps([a.signature,denominator.signature,metric,'contribution_share',partition],sort_keys=True,default=str)
        complete_composition = selection=='complete' and 2<=len(rows)<=8 and isclose(sum(r['value'] for r in rows),100,abs_tol=1e-8)
        output.append(dict(chart_type='donut' if complete_composition else 'horizontal_bar',chart_type_label='Tỷ trọng trong toàn phạm vi',
            title='Tỷ trọng '+label.lower()+suffix,metric=metric,metrics=[metric],unit='%',
            query_id=ref,scope_ref=ref,x_field=visible[0],x_label=a.grounded.dimensions[visible[0]]['business_name'],series_field=None,
            role=a.query.role,priority=70,purpose='distribution',selection=selection,layout='standard',
            value_transform='contribution_share',denominator_scope_ref=denominator_ref,denominator_selection='complete',
            numerator_unit=a.grounded.metrics[metric]['unit'],data=rows,partition=dict(partition),
            evidence_refs=[r['evidence_id'] for r in rows], population_count=population_count, displayed_count=len(rows),
            semantic_view_key=hashlib.sha256(identity.encode()).hexdigest(),
            denominator_note='Mỗi tỷ trọng = giá trị của mục / tổng cùng phạm vi đầy đủ × 100; không dùng tổng Top N làm mẫu số.'))
    return output


def pair_charts(artifacts, evidence):
    """Paired scatter for a governed association pair: one point per unique key, x from artifact A and y from B.

    The chart carries references to BOTH source artifacts and to the pairing/statistic evidence; it is only
    rendered when the statistic exists (valid pair), never from a zip of unordered rows."""
    from services.insight_service import paired_observations
    output = []
    for e in evidence:
        v = e.get('values') or {}
        if e.get('feature') != 'pearson' or not v.get('pair_id') or v.get('status') != 'ok':
            continue
        ids = v['query_ids']
        qa, qb = artifacts.get(ids[0]), artifacts.get(ids[1])
        if not qa or not qb:
            continue
        ma, mb = qa.plan.metrics[0], qb.plan.metrics[0]
        key = v['key']
        res = paired_observations(qa.result['rows'], qb.result['rows'], key, ma, mb)
        if res['status'] != 'ok' or res['r'] != v['r']:
            continue  # evidence and artifacts must agree before anything is drawn
        labels_dims = [d for d in qa.plan.dimensions if d not in key] or key
        lookup = {tuple(r.get(c) for c in key): " / ".join(str(r.get(d)) for d in labels_dims) for r in qa.result['rows']}
        b_values = {tuple(r.get(c) for c in key): r.get(mb) for r in qb.result['rows']}
        data = []
        for r in sorted(qa.result['rows'],key=lambda row:json.dumps([row.get(k) for k in key],ensure_ascii=False,default=str)):
            k = tuple(r.get(c) for c in key)
            if k in b_values and number(r.get(ma)) and number(b_values[k]):
                data.append(dict(x=r[ma], y=b_values[k], label=lookup[k]))
        population_count=len(data)
        if population_count>200:
            # Stable, evenly spaced key-order preview. Pearson/n above always
            # use the complete paired population, never this display subset.
            data=[data[i*(population_count-1)//199] for i in range(200)]
        identity = json.dumps([qa.signature, qb.signature, ma, mb, 'pair_scatter'], sort_keys=True, default=str)
        output.append(dict(chart_type='scatter', chart_type_label='Phân tán theo cặp chỉ số',
            title=f"{qa.grounded.metrics[ma]['business_name']} / {qb.grounded.metrics[mb]['business_name']} — theo {' / '.join(labels_dims)}",
            metric=ma, metrics=[ma, mb], unit=qa.grounded.metrics[ma]['unit'], y_unit=qb.grounded.metrics[mb]['unit'],
            query_id=qa.query.id, scope_ref=qa.query.id, scope_refs=[qa.query.id, qb.query.id],
            x_field=ma, x_label=qa.grounded.metrics[ma]['business_name'], y_label=qb.grounded.metrics[mb]['business_name'],
            observation_label=' / '.join(labels_dims), series_field=None, role=qa.query.role, priority=80, purpose='relationship',
            selection='complete' if population_count==len(data) else 'sampled', layout='wide', data=data,
            evidence_refs=[e['id']], population_count=population_count, displayed_count=len(data),
            pair=dict(pair_id=v['pair_id'], key=key, n=v['n'], r=v['r'], query_ids=ids),
            semantic_view_key=hashlib.sha256(identity.encode()).hexdigest(),
            denominator_note=('Hai phép tổng hợp riêng, ghép theo mã duy nhất; tương quan không chứng minh nguyên nhân.'+
                (f' Hiển thị {len(data)}/{population_count} điểm theo bước đều trong thứ tự khóa; hệ số dùng toàn bộ {population_count} cặp.'
                 if len(data)<population_count else ''))))
    return output


def driver_charts(artifacts, evidence):
    """Signed per-group change (current minus previous) from a reconciled driver evidence item; no new query."""
    output = []
    for e in evidence:
        v = e.get('values') or {}
        if e.get('feature') != 'driver_delta' or not v.get('reconciled') or not v.get('drivers'):
            continue
        a = artifacts.get(v['query_ids'][0])
        if not a:
            continue
        display = dimension_labeler(a.plan.dimensions, a.result['rows'], a.grounded.dimensions)
        rows = [dict(label=display({v['dimension']: d['group']}, v['dimension']), group=d['group'], value=d['delta'], current=d['current'],
                     previous=d['previous'], evidence_id=e['id']) for d in v['drivers']]
        meta = a.grounded.metrics[v['metric']]
        identity = json.dumps([a.signature, v['metric'], 'driver_delta', v['current_period'], v['previous_period']], sort_keys=True, default=str)
        output.append(dict(chart_type='horizontal_bar', chart_type_label='Phân rã thay đổi giữa hai kỳ',
            title=f"Thay đổi {meta['business_name'].lower()} theo {a.grounded.dimensions[v['dimension']]['business_name'].lower()} "
                  f"({v['previous_period']['start']} → {v['current_period']['start']})",
            metric=v['metric'], metrics=[v['metric']], unit=meta['unit'], query_id=a.query.id, scope_ref=a.query.id,
            scope_refs=list(v['query_ids']), x_field=v['dimension'], x_label=a.grounded.dimensions[v['dimension']]['business_name'],
            series_field=None, role=a.query.role, priority=75, purpose='comparison', selection='Top N' if len(rows) < v['groups'] else 'complete',
            layout='standard', value_transform='signed_delta', data=rows, evidence_refs=[e['id']], population_count=v['groups'],
            displayed_count=len(rows), semantic_view_key=hashlib.sha256(identity.encode()).hexdigest(),
            denominator_note='Thay đổi có dấu của từng nhóm; tổng các nhóm được đối soát với tổng độc lập của hai kỳ. Không khẳng định nguyên nhân.'))
    return output
