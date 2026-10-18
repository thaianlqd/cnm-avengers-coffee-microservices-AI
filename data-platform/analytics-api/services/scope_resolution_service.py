"""Metadata-owned finite scope expressions. Never invent geographic membership."""
import hashlib
import json
import re

from services.value_grounding_service import value_text, aliases_for, dimension_values


def resolve_scope(question, catalog, ui=None):
    from services.request_anchors import exact_mentions
    text = value_text(question)
    policy = catalog.registry.get('scope_expression_policy', {})
    for rule in catalog.registry.get('scope_clarifications',[]):
        if exact_mentions(text,{value_text(a):{rule['state']} for a in rule['aliases']}):
            return dict(state=rule['state'],filters=[],bindings=[],message=rule['message'],requested_phrase=question)

    bindings, filters, sources = [], [], []
    for dimension, definition in catalog.registry['dimensions'].items():
        if not definition.get('scope_governed'):
            continue
        universe = set(dimension_values(catalog, dimension))
        vocab = {a: {v} for a, v in aliases_for(catalog, dimension, universe).items()}
        groups = definition.get('value_groups', [])
        for group in groups:
            for alias in group['aliases']:
                vocab.setdefault(value_text(alias), set()).update(group['values'])
        mentions = exact_mentions(text, vocab)
        for prefix in policy.get('geography_prefixes',[]) if dimension=='city' else []:
            for marker in re.finditer(r'\b'+re.escape(value_text(prefix))+r'\b',text):
                if re.search(r'\b(?:theo|moi|tung)\s*$',text[:marker.start()]):continue
                if not any(m['start']<=marker.start()<m['end'] for m in mentions):
                    return dict(state='needs_clarification',filters=[],bindings=[],requested_phrase=question,
                        message='Chưa xác minh được miền được yêu cầu trong phân vùng báo cáo. Hãy chọn miền hoặc tỉnh/thành có trong danh mục kho.')
        positive, negative = set(), set()
        cohorts = []
        for mention in sorted(mentions, key=lambda m: m['start']):
            prefix = text[:mention['start']]
            exclusion = any(re.search(r'\b'+re.escape(value_text(a))+r'\s*$', prefix)
                            for a in policy.get('exclusion', [])) or any(re.search(r'\b'+re.escape(value_text(a))+r'\b.{0,80}$',prefix) for a in policy.get('exclusion_continuation',[]))
            values = set(mention['candidate_ids'])
            (negative if exclusion else positive).update(values)
            if not exclusion:
                cohorts.append(dict(phrase=mention['phrase'], members=sorted(values)))
            for group in groups:
                if mention['phrase'] in {value_text(a) for a in group['aliases']}:
                    sources.append({k: group[k] for k in ('id','label','source','version')})
        if not mentions:
            continue
        comparison = len(cohorts) > 1 and any(re.search(r'\b'+re.escape(value_text(a))+r'\b', text)
                                              for a in policy.get('comparison', []))
        selected = (positive or universe) - negative
        values = sorted(selected)
        if not values:
            return dict(state='needs_clarification', filters=[], bindings=[], message='Phạm vi sau loại trừ không còn thành viên.')
        expected = dict(dimension=dimension, operator='eq' if len(values)==1 else 'in',
                        value=values[0] if len(values)==1 else values)
        filters.append(expected)
        bindings.append(dict(dimension=dimension, members=values, comparison=comparison,
                             cohorts=cohorts if comparison else [], excluded_members=sorted(negative),
                             comparison_dimension=definition.get('group_dimension') if any(m['phrase'] in {value_text(a) for g in groups for a in g['aliases']} for m in mentions) else dimension))
    explicit = (ui or {}).get('required_filters') or []
    if explicit:
        # A UI selection may narrow a textual region, but never extend it.
        for f in explicit:
            existing = next((b for b in bindings if b['dimension']==f['dimension']), None)
            values = f['value'] if isinstance(f['value'], list) else [f['value']]
            if existing and not set(values) <= set(existing['members']):
                return dict(state='needs_clarification',filters=filters,bindings=bindings,
                            message='Phạm vi đã chọn mâu thuẫn phạm vi trong câu hỏi.')
            filters = [e for e in filters if e['dimension']!=f['dimension']] + [f]
            if existing:
                existing['members']=sorted(values)
            else:
                bindings.append(dict(dimension=f['dimension'],members=sorted(values),comparison=False,
                                     cohorts=[],excluded_members=[],comparison_dimension=f['dimension']))
    sources=sorted({s['id']:s for s in sources}.values(),key=lambda s:s['id'])
    identity = hashlib.sha256(json.dumps([bindings,sources],sort_keys=True,ensure_ascii=False).encode()).hexdigest()
    return dict(state='resolved' if filters or explicit else 'explicit_all' if any(
        re.search(r'\b'+re.escape(value_text(a))+r'\b',text) for a in policy.get('all',[])) else 'unspecified',
        filters=filters,bindings=bindings,source=sources,fingerprint=identity,requested_phrase=question if bindings else None)


def scope_issues(resolution, requirements, catalog, ui=None):
    """Every requested operation must preserve its cohort; existence alone is insufficient."""
    issues=[]
    ui_filters=(ui or {}).get('required_filters') or []
    for dimension, definition in catalog.registry['dimensions'].items():
        if not definition.get('scope_governed'):
            continue
        binding=next((b for b in resolution.get('bindings',[]) if b['dimension']==dimension),None)
        selected_ui=next((f for f in ui_filters if f['dimension']==dimension),None)
        expected=(selected_ui['value'] if isinstance(selected_ui['value'],list) else [selected_ui['value']]) if selected_ui else binding['members'] if binding else []
        cohorts=[set(c['members']) for c in binding['cohorts']] if binding and binding['comparison'] else [set(expected)]
        represented=[]
        for req in requirements:
            if req.availability!='requested': continue
            present=[f for f in req.filters if f.dimension==dimension]
            actual=set(v for f in present for v in (f.value if isinstance(f.value,list) else [f.value]))
            grouped_comparison=bool(binding and binding['comparison'] and (binding.get('comparison_dimension') in req.dimension_ids or req.supporting_for) and actual==set(binding['members']))
            valid=all(f.operator in {'eq','in'} for f in present) and (actual in cohorts or grouped_comparison)
            if not valid:
                issues.append(dict(requirement_id=req.id,field='filters',code='scope_membership_mismatch',expected=[sorted(c) for c in cohorts]))
                if binding and binding['comparison'] and dimension in req.dimension_ids and binding.get('comparison_dimension'):
                    # A geographic cohort comparison may need BOTH the scope
                    # and its grouping repaired. Freeze metrics/time, not the
                    # wrong city axis of an unapproved draft.
                    issues.append(dict(requirement_id=req.id,field='dimension_ids',code='scope_cohort_axis_mismatch',
                        expected=[binding['comparison_dimension']]))
            represented.extend(cohorts if grouped_comparison else [actual])
        if binding and binding['comparison'] and any(c not in represented for c in cohorts):
            issues.append(dict(requirement_id=None,field='filters',code='scope_cohort_missing',expected=[sorted(c) for c in cohorts]))
    return issues


def scope_repair_patches(resolution, previous, issues):
    """Concrete metadata-owned suggestions for targeted repair, never execution.

    Only exact union scopes and a diagnosed cohort axis are unambiguous. The
    normal frozen-field/anchor guards still validate the returned patch.
    """
    patches=[]
    for req in previous.requirements if previous else []:
        fields={i['field'] for i in issues if i.get('requirement_id')==req.id}
        patch={'id':req.id}
        axis=next((i['expected'] for i in issues if i.get('requirement_id')==req.id
                   and i['code']=='scope_cohort_axis_mismatch'),None)
        if axis:patch['dimension_ids']=axis
        if 'filters' in fields:
            filters=[f.model_dump(mode='json') for f in req.filters]
            for binding in resolution.get('bindings',[]):
                if binding.get('comparison') and not axis:continue
                dimension=binding['dimension']
                filters=[f for f in filters if f['dimension']!=dimension]
                filters.append(dict(dimension=dimension,operator='in',value=binding['members']))
            if filters:patch['filters']=filters
        if len(patch)>1:patches.append(patch)
    return patches


def grouping_expression(base, groups, unknown='Chưa phân loại'):
    """Generate only literal CASE membership from validated catalog sets, never model SQL."""
    def literal(value):return "'"+str(value).replace("'","''")+"'"
    clauses=['WHEN '+base+' IN ('+', '.join(literal(v) for v in g['values'])+') THEN '+literal(g['value'])
             for g in groups if g.get('primary')]
    return 'CASE '+' '.join(clauses)+' ELSE '+literal(unknown)+' END'
