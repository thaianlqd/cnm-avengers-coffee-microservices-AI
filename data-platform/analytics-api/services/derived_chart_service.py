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
