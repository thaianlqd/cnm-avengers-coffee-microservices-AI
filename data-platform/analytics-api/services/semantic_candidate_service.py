"""A locally grounded menu of meaning, never an executable plan or SQL."""
import re
from dataclasses import dataclass
from services.semantic_manifest_service import compact
from services.value_grounding_service import dimension_values


@dataclass(frozen=True)
class SemanticCandidatePacket:
    facts: dict
    candidates: dict

    def wire(self):
        return {'version': 1, 'protected_input_facts': self.facts, **self.candidates}

    @property
    def chars(self):
        return len(compact(self.wire()))


def _narrow_to_domains(anchors, question, catalog, index, retrieved, evidenced, ui):
    """Settle mentions the question leaves generic, using only governed metadata.

    - "theo trạng thái" names a generic axis head shared by many dimensions; the
      unique head-matching dimension compatible with the question's metrics wins.
    - A value claimed by several dimensions ("chuyển khoản") keeps the in-scope ones.
    - A value filter no in-scope metric can apply ("combo nguyên liệu" is not a
      debt type for combo orders) is not a required filter.
    Nothing is added when the choice is not unique; the interpreter still decides.
    """
    from services.value_grounding_service import value_text
    r = catalog.registry
    explicit = {m for a in anchors['metrics'] for m in a['candidate_ids'] if m in index.metrics}
    subjects = {s for m in explicit for s in index.metrics[m]['subjects']}
    scope = {id for id, p in index.domains.items() if set(p['primary_subjects']) & subjects}
    scope.update(c['id'] for c in retrieved if c['protected'])
    if ui.get('required_domain'):
        scope.add(ui['required_domain'])
    if not explicit:
        scope.update(c['id'] for c in evidenced[:3])
    scope &= index.domains.keys()
    if not scope:
        return anchors
    usable = explicit or {m for id in scope for m in index.domains[id]['metric_refs'] if m in index.metrics}
    applicable = {d for m in usable for d in index.metrics[m]['dimensions']}
    in_scope = {d for id in scope for d in [*index.domains[id].get('dimension_refs', []), *index.domains[id].get('primary_entities', [])]}
    anchors = {**anchors}
    values = [v for v in anchors['values'] if v['dimension'] in applicable]
    claimed = {}
    for v in values:
        claimed.setdefault(str(v['value']), []).append(v)
    anchors['values'] = [v for group in claimed.values() for v in group
                         if len(group) == 1 or v['dimension'] in in_scope or not any(x['dimension'] in in_scope for x in group)]
    dims = []
    for a in anchors['dimensions']:
        keep = [d for d in a['candidate_ids'] if d in applicable]
        dims.append({**a, 'candidate_ids': keep} if len(keep) == 1 and len(a['candidate_ids']) > 1 else a)
    text, named = value_text(question), {(a['start'], a['end']) for a in dims if 'start' in a}
    heads = {}
    for id, d in r['dimensions'].items():
        words = value_text(d['business_name']).split()
        if len(words) > 1:
            heads.setdefault(' '.join(words[:2]), set()).add(id)
    for head, ids in heads.items():
        if len(ids) < 3:
            continue  # only generic heads ("trạng thái", "phương thức") are axis words on their own
        for match in re.finditer(r'(?<!\w)theo ' + re.escape(head) + r'(?!\w)', text):
            start, end = match.start() + 5, match.end()
            if any(s <= start and end <= e for s, e in named):
                continue
            unique = sorted(ids & applicable & in_scope) or sorted(ids & applicable)
            if len(unique) == 1:
                dims.append({'phrase': head, 'candidate_ids': unique, 'start': start, 'end': end})
    anchors['dimensions'] = dims
    return anchors


def candidate_packet(catalog, index, intelligence, anchors, question, ui, previous=()):
    retrieved = intelligence.candidates(question, ui.get('domain','auto'), 'focused', previous)
    # A metric phrase inside a longer, directly named subject phrase ("đối soát
    # doanh thu kiosk") belongs to that subject, not to the generic metric.
    owned = [(s, e, set(index.domains.get(c['id'], {}).get('metric_refs', []))) for c in retrieved
             if c['protected'] for s, e in c.get('spans', [])]
    contained = [a for a in anchors['metrics'] if any(s <= a['start'] and a['end'] <= e and (s, e) != (a['start'], a['end'])
                                                      and not set(a['candidate_ids']) & refs for s, e, refs in owned)]
    if contained:
        anchors = {**anchors, 'metrics': [a for a in anchors['metrics'] if a not in contained]}
    # Zero-overlap catalog fallbacks are arbitrary (alphabetical); never present
    # them as evidence. Low-confidence retrieval sends the compact directory.
    # Entity mentions inside a resolved topic clause are context, not subjects.
    evidenced = [c for c in retrieved if c['match_category'] != 'topic_context'
                 and (c['match_category'] != 'catalog_candidate' or c['score'] > 0)]
    anchors = _narrow_to_domains(anchors, question, catalog, index, retrieved, evidenced, ui)
    topics = {c['id']: c['topic_id'] for c in retrieved if c['match_category'] == 'topic_concept_match'}
    ambiguous_topic = sorted(c['id'] for c in retrieved if c['match_category'] == 'topic_ambiguous')
    explicit_metrics = {m for a in anchors['metrics'] for m in a['candidate_ids']}
    explicit_dims = {d for kind in ('dimensions','population_scopes') for a in anchors.get(kind,[]) for d in a['candidate_ids']}
    explicit_dims.update(v['dimension'] for v in anchors['values'])
    explicit_dims.update(f['dimension'] for f in ui.get('required_filters',[]))
    if ui.get('required_filter'):
        explicit_dims.add(ui['required_filter']['dimension'])
    # Canonical alias priority is already server-owned. Do not present every
    # alias claimant as a requested KPI when the canonical metric can express
    # all explicit axes. Retain precisely named metrics and incompatible-axis
    # qualifications (e.g. product revenue), plus every frozen refinement ID.
    from services.semantic_preflight_contract import metric_locks
    locks=metric_locks(anchors,catalog.registry)
    exact={a['candidate_ids'][0] for a in anchors['metrics'] if len(a['candidate_ids'])==1}
    named_axes={d for a in anchors.get('dimensions',[]) for d in a['candidate_ids']}
    named_axes.update(a['dimension_id'] for a in anchors.get('rankings',[]) if a.get('dimension_id'))
    protected=exact | {l['metric_id'] for l in locks}
    protected.update(m for lock in locks for m in lock['siblings']
        if named_axes & set(catalog.registry['metrics'][m].get('qualifier_dimensions',[])))
    exact_sources={catalog.registry['metrics'][m]['source'] for m in exact}
    protected.update(m for lock in locks for m in lock['siblings']
        if catalog.registry['metrics'][m]['source'] in exact_sources)
    for group in catalog.registry.get('equivalent_metric_groups',[]):
        if protected.intersection(group):protected.update(group)
    excluded=set()
    # A directly named subject owns its reading of a shared phrase: "đồ uống nào
    # … doanh thu" is item revenue, because only the sibling lives in that subject.
    for lock in locks:
        spans=[(a['start'],a['end']) for a in anchors['metrics'] if a['phrase']==lock['phrase'] and 'start' in a]
        named_refs={m for c in retrieved if c['protected'] and any(not any(s<e2 and s2<e for s2,e2 in spans) for s,e in c.get('spans',[]))
                    for m in index.domains.get(c['id'],{}).get('metric_refs',[])}  # subjects named by other words
        preferred={m for m in lock['siblings'] if m in named_refs}
        if preferred and not protected & set(lock['siblings']) and lock['metric_id'] not in named_refs and lock['metric_id'] not in exact:
            protected.update(preferred); excluded.add(lock['metric_id'])
    for lock in locks:
        if explicit_dims <= set(catalog.compatible_dimensions(lock['metric_id'])):
            excluded.update(set(lock['siblings'])-protected)
    topic_excluded=set()
    # A resolved topic object ("điểm đánh giá trung bình của tài xế") settles a
    # shared metric phrase between the topic's alternative targets.
    for concept in catalog.registry['domain_intelligence'].get('topic_concepts',[]):
        chosen={t['domain_id'] for t in concept['targets'] if topics.get(t['domain_id'])==concept['id']}
        others={m for t in concept['targets'] if chosen and t['domain_id'] not in chosen
                for m in index.domains.get(t['domain_id'],{}).get('metric_refs',[])}
        topic_excluded.update(m for a in anchors['metrics'] if len(a['candidate_ids'])>1 for m in a['candidate_ids'] if m in others)
    excluded|=topic_excluded
    explicit_metrics-=excluded
    stored = ui.get('semantic_intent') or {}
    explicit_metrics.update(m for req in stored.get('requirements',[]) for m in req.get('metric_ids',[]))
    explicit_dims.update(d for req in stored.get('requirements',[]) for d in req.get('dimension_ids',[]))
    # Strong metric facts select compatible subject menus; a population-definition
    # mention must not drag every metric in its dimension's domain into the prompt.
    subjects = {s for m in explicit_metrics if m in index.metrics for s in index.metrics[m]['subjects']}
    selected = {id for id,p in index.domains.items() if set(p['primary_subjects']) & subjects}
    selected.update(c['id'] for c in retrieved if c['protected'])
    if ui.get('required_domain'):
        selected.add(ui['required_domain'])
    metrics = set(explicit_metrics)
    if not metrics:
        selected.update(c['id'] for c in evidenced[:3])
        metrics.update(m for id in selected for m in index.domains[id]['metric_refs'])
    # A directly named subject (not a grouping axis such as "theo chi nhánh")
    # without an explicit metric of its own keeps its governed bundle, so a
    # second clause ("…, mua combo nhiều") is not dropped by another clause's KPI.
    if explicit_metrics:
        axes=[(a['start'],a['end']) for kind in ('dimensions','population_scopes','values') for a in anchors.get(kind,[]) if 'start' in a]
        for c in retrieved:
            refs=set(index.domains.get(c['id'],{}).get('metric_refs',[]))
            if (c['protected'] and c['match_category'] in ('alias_match','exact_business_label_match') and refs and not refs & explicit_metrics
                    and any(not any(s2<=s and e<=e2 for s2,e2 in axes) for s,e in c.get('spans',[]))):
                metrics.update(refs)
    # A clear topic without a named metric of its own gets its governed bundle
    # even when another clause names a metric ("doanh thu và đánh giá món").
    defaults=set()
    named=[c['id'] for c in retrieved if c['protected'] and c['id'] in index.domains]
    if not explicit_metrics and not topics and len(named)==1:
        # A named subject with no metric ("thanh toán chuyển khoản tháng này") is
        # analysed with its first governed lens, never left to a guess.
        lenses=index.domains[named[0]].get('analytical_lenses') or [{}]
        axes={d for a in anchors['dimensions'] for d in a['candidate_ids']}
        reach=lambda l:{d for m in l.get('metric_refs',[]) if m in index.metrics for d in index.metrics[m]['dimensions']}
        fit=lambda l:(len(axes & reach(l)),len(explicit_dims & reach(l)))
        lens=max(lenses,key=lambda l:(*fit(l),-lenses.index(l)))  # the lens able to group by the named axis
        defaults.update(m for m in lens.get('metric_refs',[]) if m in index.metrics)
        metrics.update(defaults)
    for id in topics:
        if id in index.domains and not explicit_metrics & set(index.domains[id]['metric_refs']):
            metrics.update(index.domains[id]['metric_refs'])
            defaults.update(index.domains[id]['metric_refs'])
    metrics &= index.metrics.keys()
    # Same-subject siblings of explicit metrics stay visible as id/label only,
    # so a lexical anchor never hides the governed metric the user meant.
    # Only an unambiguous anchor narrows the menu; broad anchors already do not.
    narrow = {a['candidate_ids'][0] for a in anchors['metrics'] if len(a['candidate_ids']) == 1}
    sibling = {m for x in narrow if x in index.metrics for s in index.metrics[x]['subjects']
               for m in index.subjects.get(s, {}).get('metrics', []) if m in index.metrics
               and catalog.registry['metrics'][m].get('lifecycle', {}).get('status') != 'deprecated'} - metrics - excluded
    directory = [] if metrics else sorted(index.metrics)
    dims = explicit_dims & index.dimensions.keys()
    # Missing axes remain choices for the interpreter, supplied by selected lenses
    # rather than the entire raw-detail directory.
    if not anchors['dimensions']:
        dims.update(d for id in selected for d in index.domains[id]['primary_entities'])
    dims.update(f['dimension'] for m in metrics for f in catalog.registry['metrics'][m].get('business_filters',[]))
    compatible = {d for m in metrics for d in index.metrics[m]['dimensions']}
    if not anchors['dimensions']:
        dims.update(d for id in selected for lens in index.domains[id]['analytical_lenses']
                    if set(lens['metric_refs']) <= metrics for d in lens['recommended_drilldowns'] if d in compatible)
    subjects.update(s for m in metrics for s in index.metrics[m]['subjects'])
    r = catalog.registry
    meanings = []
    for m in sorted(metrics):
        meta = r['metrics'][m]
        meanings.append(dict(id=m,label=meta['business_name'],unit=meta['unit'],
            definition=meta.get('business_definition') or meta.get('business_meaning',''),
            population=meta.get('population_definition',''),
            business_filters=meta.get('business_filters',[]),
            additive=bool(meta.get('additive')),historical=index.metrics[m]['historical'],
            compatible_subjects=index.metrics[m]['subjects'],
            compatible_dimensions=sorted(set(index.metrics[m]['dimensions']) & dims)))
    caveats={c for id in selected for c in index.domains[id]['business_caveats']}
    notes=r['domain_intelligence'].get('model_caveat_notes',r['domain_intelligence']['caveat_labels'])
    facts={k:v for k,v in anchors.items() if v and k != 'ui'}
    if excluded:
        facts['metrics']=[{**a,'candidate_ids':[m for m in a['candidate_ids'] if m not in excluded]}
                          for a in anchors['metrics']]
        if facts.get('rankings'):
            facts['rankings']=[{**a,'metric_candidates':[m for m in a['metric_candidates'] if m not in excluded]}
                               for a in facts['rankings']]
    if facts.get('scope_resolution',{}).get('state') == 'unspecified':
        facts.pop('scope_resolution')  # No scope assertion to transmit or protect.
    facts['ui'] = anchors['ui']
    packet = SemanticCandidatePacket(facts, dict(
        time=ui.get('required_period') or (anchors['times'][0] if len(anchors['times'])==1 else None),
        explicit_metric_ids=sorted(explicit_metrics),explicit_dimension_ids=sorted(explicit_dims),
        **({'default_metric_ids':sorted(defaults & metrics)} if defaults else {}),
        metrics=meanings,dimensions=[dict(id=d,label=r['dimensions'][d]['business_name'],
            values=dimension_values(catalog,d)) for d in sorted(dims)],
        **({'related_metrics':[[m,r['metrics'][m]['business_name']] for m in sorted(sibling)]} if sibling else {}),
        **({'metric_directory':[[m,r['metrics'][m]['business_name']] for m in directory]} if directory else {}),
        equivalent_metrics=[g for g in r.get('equivalent_metric_groups',[]) if set(g) & metrics],
        candidate_domains=sorted(selected),candidate_subjects=sorted(subjects),
        supported_analysis_shapes=['aggregate','ranking','trend','comparison','distribution','cross_tab','relationship','detail'],
        lens_summaries=[dict(id=l['id'],label=l['business_label'],metrics=l['metric_refs'])
            for id in sorted(selected) for l in index.domains[id]['analytical_lenses'] if set(l['metric_refs']) <= metrics],
        business_caveats={c:notes[c] for c in sorted(caveats)},
        unresolved_meaning=[dict(kind=k,candidate_ids=[m for m in a['candidate_ids'] if m not in topic_excluded]) for k in ('metrics','dimensions')
            for a in anchors[k] if len([m for m in a['candidate_ids'] if m not in topic_excluded])>1]
            +([dict(kind='topic_target',candidate_ids=ambiguous_topic)] if ambiguous_topic else [])))
    object.__setattr__(packet, 'anchors', anchors)  # the planner validates against the same settled mentions
    return packet, retrieved
