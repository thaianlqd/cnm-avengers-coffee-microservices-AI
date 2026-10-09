"""Deterministic depth and supporting business views from checked metadata."""
from services.analysis_intent import IntentRequirement
from services.analytical_capacity_planner import AnalyticalCapacityContract


def dashboard_policy(catalog):
    """Server-owned floor for every analytical dashboard, never model advice."""
    return catalog.registry.get('dashboard_policy', {'minimum_views': 4, 'target_views': 5})


def estimated_views(operations, catalog):
    """Conservative planning estimate; actual distinct charts are verified later."""
    total=0
    for op in operations:
        metrics=op.get('metrics',[]);dims=op.get('group_by',[])
        identities={catalog.registry['dimensions'][d].get('identity') for d in dims}
        visible=[d for d in dims if d not in identities]
        if op['operation']=='detail' or not metrics or not visible and op['operation']!='trend':
            continue
        same_unit=len(metrics)>1 and len({catalog.registry['metrics'][m]['unit'] for m in metrics})==1 and len({catalog.registry['metrics'][m].get('aggregation_semantics')=='average' for m in metrics})==1
        total += 1 if op['operation']=='relationship' or same_unit and (
            len(visible)==1 and op['operation'] not in {'ranking','trend'} or not visible and op['operation']=='trend') else len(metrics)
    return total


def analysis_depth(intent, index, ui):
    if ui.get('analysis_depth_explicit'):
        return 'deep' if ui['analysis_depth'] == 'focused' else ui['analysis_depth']
    if ui.get('request_breadth') == 'deep':
        return 'deep'
    from services.analytical_resolver import digest, requirement_meaning
    requested=list({digest(requirement_meaning(r)):r for r in intent.requirements if not r.supporting_for}.values())
    metrics={m for r in requested for m in r.metric_ids}
    domains=set()
    # Prefer canonical subject owners over overlapping metric directories.
    for r in requested:
        subjects=set.intersection(*(set(index.metrics[m]['subjects']) for m in r.metric_ids if m in index.metrics)) if any(m in index.metrics for m in r.metric_ids) else set()
        if subjects:
            domains.add(next((d for d,p in index.domains.items() if sorted(subjects)[0] in p['primary_subjects']),sorted(subjects)[0]))
    shapes={r.analysis_kind for r in requested}
    if len(domains)>=2 or len(requested)>=5 or len(requested)>=3 and len(metrics)>=3 or (
            'ranking' in shapes and 'trend' in shapes and shapes & {'distribution','comparison','aggregate'}):
        return 'comprehensive'
    return 'deep'


def supporting_candidates(resolver, requested):
    """No raw text, model prose, or provider call participates in selection.

    All plans get cohort, time and segmentation views from checked metadata.
    Resolver and preflight independently enforce population/time/capacity.
    """
    depth=resolver.ui.get('server_supporting_expansion')
    if depth not in {'deep','comprehensive'}:
        return []
    from services.analytical_resolver import digest, requirement_meaning
    candidates=[]
    for req in sorted(requested,key=lambda r:digest(requirement_meaning(r))):
        if req.availability!='requested' or not req.metric_ids:
            continue
        if resolver.ui.get('minimum_visuals'):
            # Broad evaluation needs independent cohort, time and segmentation
            # views. Every candidate inherits the original complete population.
            historical=[m for m in req.metric_ids if resolver.index.metrics[m]['historical']]
            if historical:
                candidates.append(IntentRequirement(id='support_'+digest([req.id,'trend'])[:24],
                    goal='Diễn biến trong phạm vi đã chọn',supporting_for=req.id,metric_ids=historical,
                    analysis_kind='trend',filters=req.filters,time=req.time))
                # A catalog enum is a bounded segmentation axis. A segmented
                # time series answers a different question from the total trend.
                for dim in req.dimension_ids:
                    definition=resolver.catalog.registry['dimensions'][dim]
                    if definition.get('enum') and len(definition['enum'])<=16 and not any(f.dimension==dim for f in req.filters):
                        candidates.append(IntentRequirement(id='support_'+digest([req.id,'segmented_trend',dim])[:24],
                            goal='Diễn biến theo '+definition['business_name'],supporting_for=req.id,
                            metric_ids=[m for m in historical if dim in resolver.index.metrics[m]['dimensions']],
                            dimension_ids=[dim],analysis_kind='trend',filters=req.filters,time=req.time))
            domains=[d for d,p in resolver.index.domains.items() if set(req.metric_ids)&set(p['metric_refs'])]
            related=sorted({m for d in domains for m in resolver.index.domains[d]['metric_refs']
                if m in resolver.index.metrics and any(set(resolver.index.metrics[m]['subjects']) &
                    set(resolver.index.metrics[n]['subjects']) for n in req.metric_ids)})
            # Prefer additive totals and catalog averages; ranking remains based
            # solely on the requested criterion. No composite performance score.
            ms=list(dict.fromkeys(req.metric_ids+related))[:3]
            candidates.append(IntentRequirement(id='support_'+digest([req.id,'scope_kpis',ms])[:24],
                goal='Chỉ số toàn phạm vi',supporting_for=req.id,metric_ids=ms,
                analysis_kind='aggregate',derived_features=['scalar'],filters=req.filters,time=req.time))
        domains=[d for d,p in resolver.index.domains.items() if set(req.metric_ids) & set(p['metric_refs'])]
        for domain in sorted(domains):
            profile=resolver.index.domains[domain]
            metrics=[m for m in sorted(req.metric_ids) if m in profile['metric_refs'] and m in resolver.index.metrics]
            lenses=[l for l in profile['analytical_lenses'] if set(l['metric_refs']) & set(metrics)]
            axes=list(dict.fromkeys(d for l in lenses for d in l['recommended_drilldowns']))
            axes += [d for d in profile['diagnostic_dimensions'] if d not in axes]
            entity_axes={d for l in profile['analytical_lenses'] for d in (l.get('blueprint') or {}).get('default_grouping',[])}
            for dim in axes:
                definition=resolver.catalog.registry['dimensions'][dim]
                # Row identities/raw clocks are evidence fields, not helpful segments.
                if dim.endswith('_id') and dim not in entity_axes or dim==definition.get('identity') or any(f.dimension==dim for f in req.filters):
                    continue
                allowed=[m for m in metrics if dim in resolver.index.metrics[m]['dimensions']]
                if not allowed or any(r.dimension_ids==[dim] and not r.ranking and r.analysis_kind!='trend' and set(allowed)<=set(r.metric_ids) for r in requested):
                    continue
                id='support_'+digest([req.id,domain,allowed,dim])[:24]
                candidates.append(IntentRequirement(id=id,goal='Đối chiếu bổ sung · '+definition['business_name'],
                    domain_id=domain,supporting_for=req.id,metric_ids=allowed,dimension_ids=[dim],
                    analysis_kind='distribution' if resolver.ui.get('minimum_visuals')
                        and all(resolver.catalog.registry['metrics'][m].get('additive') for m in allowed) else 'aggregate',
                    filters=req.filters,time=req.time))
            # Snapshot domains may have no timeline. Their approved companion
            # metrics and relationship lenses provide useful additional views.
            for lens in profile['analytical_lenses']:
                b=lens.get('blueprint') or {};ms=b.get('default_metric_refs',[]);ds=b.get('default_grouping') or []
                if not ms or not ds or b.get('default_operation') not in {'aggregate','distribution','ranking','relationship'}:
                    continue
                if set(ms)<=set(req.metric_ids) and b['default_operation']!='relationship':
                    continue
                candidates.append(IntentRequirement(id='support_'+digest([req.id,domain,lens['id']])[:24],
                    goal='Góc nhìn bổ sung · '+lens['business_label'],domain_id=domain,supporting_for=req.id,
                    metric_ids=ms,dimension_ids=ds,analysis_kind=b['default_operation'],filters=req.filters,time=req.time))
            for related in profile['related_domains']:
                child=resolver.index.domains.get(related,{})
                for lens in child.get('analytical_lenses',[]):
                    b=lens.get('blueprint') or {}
                    ms=b.get('default_metric_refs',[])
                    ds=b.get('default_grouping') or []
                    if not ms or not ds or b.get('default_operation') not in {'aggregate','distribution'}:
                        continue
                    id='support_'+digest([req.id,related,lens['id']])[:24]
                    candidates.append(IntentRequirement(id=id,goal='Góc nhìn bổ sung · '+lens['business_label'],
                        domain_id=related,supporting_for=req.id,metric_ids=ms,dimension_ids=ds,
                        analysis_kind=b['default_operation'],filters=req.filters,time=req.time))
    return candidates[:64]
