"""A locally grounded menu of meaning, never an executable plan or SQL."""
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


def candidate_packet(catalog, index, intelligence, anchors, question, ui, previous=()):
    retrieved = intelligence.candidates(question, ui.get('domain','auto'), 'focused', previous)
    explicit_metrics = {m for a in anchors['metrics'] for m in a['candidate_ids']}
    explicit_dims = {d for kind in ('dimensions','population_scopes') for a in anchors.get(kind,[]) for d in a['candidate_ids']}
    explicit_dims.update(v['dimension'] for v in anchors['values'])
    explicit_dims.update(f['dimension'] for f in ui.get('required_filters',[]))
    if ui.get('required_filter'):
        explicit_dims.add(ui['required_filter']['dimension'])
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
        selected.update(c['id'] for c in retrieved[:3])
        metrics.update(m for id in selected for m in index.domains[id]['metric_refs'])
    metrics &= index.metrics.keys()
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
    facts['ui'] = anchors['ui']
    return SemanticCandidatePacket(facts, dict(
        time=ui.get('required_period') or (anchors['times'][0] if len(anchors['times'])==1 else None),
        explicit_metric_ids=sorted(explicit_metrics),explicit_dimension_ids=sorted(explicit_dims),
        metrics=meanings,dimensions=[dict(id=d,label=r['dimensions'][d]['business_name'],
            values=dimension_values(catalog,d)) for d in sorted(dims)],
        equivalent_metrics=[g for g in r.get('equivalent_metric_groups',[]) if set(g) & metrics],
        candidate_domains=sorted(selected),candidate_subjects=sorted(subjects),
        supported_analysis_shapes=['aggregate','ranking','trend','comparison','distribution','cross_tab','relationship','detail'],
        lens_summaries=[dict(id=l['id'],label=l['business_label'],metrics=l['metric_refs'])
            for id in sorted(selected) for l in index.domains[id]['analytical_lenses'] if set(l['metric_refs']) <= metrics],
        business_caveats={c:notes[c] for c in sorted(caveats)},
        unresolved_meaning=[dict(kind=k,candidate_ids=a['candidate_ids']) for k in ('metrics','dimensions')
            for a in anchors[k] if len(a['candidate_ids'])>1])), retrieved
