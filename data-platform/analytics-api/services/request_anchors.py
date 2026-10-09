"""Exact metadata and numeric/UI coverage guards; never an analytical router."""
import re
from services.value_grounding_service import value_text, aliases_for, dimension_values


def metric_equivalents(catalog):
    """Only catalog-declared aliases with identical observation semantics.

    Subject names may differ, but grain, population, clock, aggregation and
    null policy must agree. Equal units or similar labels alone prove nothing.
    Executable compatibility still passes the resolver/compiler separately.
    """
    metrics = catalog.registry['metrics']
    result = {m: {m} for m in metrics}
    fields = ('expression', 'source', 'grain', 'time_column', 'unit',
              'business_filters', 'required_non_null', 'aggregation_semantics',
              'additive', 'historical_capability', 'valid_grains')
    for group in catalog.registry.get('equivalent_metric_groups', []):
        if len(group) < 2 or any(m not in metrics for m in group):
            continue
        first = metrics[group[0]]
        if not all(first.get(k) == metrics[m].get(k) for m in group for k in fields):
            continue
        for m in group:
            result[m].update(group)
    return result


def exact_mentions(text, vocabulary):
    matches = []
    for phrase, ids in vocabulary.items():
        if not phrase or len(phrase) < 3:
            continue
        for match in re.finditer(r"(?<!\w)" + re.escape(phrase) + r"(?!\w)", text):
            matches.append((match.start(), match.end(), phrase, sorted(ids)))
    # Prefer a qualified business phrase over a contained generic alias.
    return [{"phrase": phrase, "candidate_ids": ids, "start":start, "end":end} for start, end, phrase, ids in matches
            if not any(a <= start and end <= b and b-a > end-start for a,b,_,_ in matches)]


def request_anchors(question, catalog, ui):
    text, r = value_text(question), catalog.registry
    output = {}
    for kind in ("metrics", "dimensions"):
        vocabulary = {}
        for id, definition in r[kind].items():
            broad = {value_text(a) for a in definition.get("non_anchor_aliases", [])}
            for alias in [id, definition["business_name"], *definition.get("aliases", [])]:
                if value_text(alias) in broad:
                    continue
                vocabulary.setdefault(value_text(alias), set()).add(id)
        output[kind] = exact_mentions(text, vocabulary)
    # Explicit non-equivalence statements constrain interpretation. Catalog
    # relation markers identify the referenced RHS concept; they cannot request
    # that concept or synthesize a business plan.
    exclusions=[]
    for relation in r.get('semantic_negation_relations',[]):
        pattern=r'\b'+re.escape(value_text(relation['prefix']))+r'\b.{0,160}?\b'+re.escape(value_text(relation['relation']))+r'\s+'
        for match in re.finditer(pattern,text):
            exclusions.extend(a for a in output['metrics'] if match.end()<=a['start']<match.end()+80)
    output['metric_constraints']=exclusions
    output['metrics']=[a for a in output['metrics'] if a not in exclusions]
    output['dimensions'] = [d for d in output['dimensions'] if not any(
        m['start'] <= d['start'] and d['end'] <= m['end'] and m['end']-m['start'] > d['end']-d['start']
        for m in output['metrics'])]
    # Qualified catalog-definition mentions have a different coverage role
    # from grouping axes. This finite metadata lexicon applies to ALL dimensions;
    # it neither selects an analytical subject nor generates a query.
    scope_vocabulary = {}
    for id, definition in r['dimensions'].items():
        for alias in [definition['business_name'], *definition.get('aliases', [])]:
            for qualifier in r.get('population_scope_qualifiers', []):
                scope_vocabulary.setdefault(value_text(qualifier+' '+alias), set()).add(id)
    output['population_scopes'] = exact_mentions(text, scope_vocabulary)
    grouping = exact_mentions(text, {value_text(prefix)+' '+phrase: ids
        for prefix in r.get('grouping_qualifiers', []) for phrase,ids in scope_vocabulary.items()})
    output['population_scopes'] = [s for s in output['population_scopes'] if not any(
        g['start'] <= s['start'] and s['end'] <= g['end'] for g in grouping)]
    output['dimensions'] = [d for d in output['dimensions'] if not any(
        s['start'] <= d['start'] and d['end'] <= s['end'] and
        set(d['candidate_ids']) <= set(s['candidate_ids']) for s in output['population_scopes'])]
    feature_vocabulary = {}
    for id, definition in r.get("derived_features", {}).items():
        for alias in definition.get("aliases", []):
            feature_vocabulary.setdefault(value_text(alias), set()).add(id)
    output["features"] = exact_mentions(text, feature_vocabulary)
    capabilities = exact_mentions(text, {value_text(a): {id} for id,definition in r.get("unsupported_capabilities", {}).items() for a in definition["aliases"]})
    # Prohibitions constrain conclusions; they do not request an unavailable
    # calculation. Require an immediate negated verb, not 'không chỉ ROI'.
    def prohibited(mention):
        prefix=text[max(0,mention['start']-100):mention['start']]
        return bool(re.search(r'\b(?:khong|chua|dung)\s+(?:tu\s+)?(?:ket luan|suy ra|tinh|danh gia|cong bo)(?:\s+(?:ve|duoc|chi so|hieu qua|gia tri))*\s*$',prefix))
    output['capability_constraints']=[m for m in capabilities if prohibited(m)]
    output['capabilities']=[m for m in capabilities if not prohibited(m)]
    values, excluded_values = [], []
    def excluded(mention):
        prefix = text[max(0,mention['start']-80):mention['start']]
        return any(re.search(r'(?<!\w)'+re.escape(value_text(q))+r'\s*$',prefix)
                   for q in r.get('filter_exclusion_qualifiers',[]))
    for dimension in r["dimensions"]:
        vocabulary = aliases_for(catalog, dimension, dimension_values(catalog, dimension))
        for mention in exact_mentions(text, {k: {str(v)} for k,v in vocabulary.items()}):
            if any(a['start'] <= mention['start'] and mention['end'] <= a['end'] and a['end']-a['start'] > mention['end']-mention['start']
                   for kind in ('metrics','features','capabilities') for a in output[kind]):
                continue
            value = next(v for k,v in vocabulary.items() if k == mention["phrase"])
            target = excluded_values if excluded(mention) else values
            if {"dimension": dimension, "value": value} not in target:
                target.append({"dimension": dimension, "value": value})
        for group in r['dimensions'][dimension].get('value_groups',[]):
            for mention in exact_mentions(text,{value_text(a):set(group['values']) for a in group['aliases']}):
                target = excluded_values if excluded(mention) else values
                # A qualified alias (e.g. one subtype) outranks the generic group.
                if any(m['start']<=mention['start'] and mention['end']<=m['end'] and
                       m['end']-m['start']>mention['end']-mention['start'] for m in
                       exact_mentions(text,{k:{str(v)} for k,v in vocabulary.items()})):
                    continue
                for value in group['values']:
                    item={'dimension':dimension,'value':value}
                    if item not in target: target.append(item)
    output["values"] = values
    output['excluded_values'] = excluded_values
    breadth = exact_mentions(text,{value_text(a):{depth} for depth,aliases in
                                   r.get('analysis_breadth_aliases',{}).items() for a in aliases})
    output['analysis_breadth'] = 'deep' if breadth else None
    ranking_words={value_text(a):direction for direction,aliases in r.get('ranking_quantifier_aliases',
        {'top':['top'],'bottom':['bottom']}).items() for a in aliases}
    rankings = [(ranking_words[word],n) for word,n in re.findall(
        r'\b('+ '|'.join(re.escape(a) for a in sorted(ranking_words,key=len,reverse=True))+r')\s+(\d{1,3})\b',text)]
    output["rankings"] = [{"direction": d, "limit": int(n)} for d,n in rankings if 1 <= int(n) <= 100]
    # Bind a numeric ranking only to a unique catalog metric mention in its
    # clause. Companion metrics in later sentences cannot replace the criterion.
    quantifiers=list(re.finditer(r'\b('+ '|'.join(re.escape(a) for a in sorted(ranking_words,key=len,reverse=True))+r')\s+(\d{1,3})\b',text))
    for rank,mention in zip(output['rankings'],quantifiers):
        eligible=sorted((a for a in output['metrics'] if mention.end()<=a['start']<mention.end()+200),key=lambda a:a['start'])
        if eligible and len(eligible[0]['candidate_ids'])==1:
            rank['metric_id']=eligible[0]['candidate_ids'][0]
    rolling = re.findall(r"\b(\d{1,4})\s+(ngay|thang)\s+(?:gan nhat|gan day|qua)\b", text)
    output["times"] = [{"kind": "rolling", "amount": int(n), "unit": "day" if u == "ngay" else "month"}
                       for n,u in rolling if 1 <= int(n) <= 3660]
    dates = re.findall(r"(?<!\d)\d{4}-\d{2}-\d{2}(?!\d)", question)
    if len(dates) == 2:
        output["times"].append({"kind": "range", "start": dates[0], "end": dates[1]})
    output['granularities'] = exact_mentions(text, {value_text(a): {g}
        for g, aliases in r.get('granularity_aliases', {}).items() for a in aliases})
    output["ui"] = {k: v for k,v in ui.items() if k in {"required_period", "required_filters", "required_filter", "required_domain", "scope_mode"}}
    return output


def population_filters(anchors, catalog):
    """Finite metadata value groups constrain every operation, not one sibling."""
    from services.analysis_catalog import AnalysisError
    result=[]
    for dimension,definition in catalog.registry['dimensions'].items():
        if not definition.get('population_selector'): continue
        positive={a['value'] for a in anchors.get('values',[]) if a['dimension']==dimension}
        negative={a['value'] for a in anchors.get('excluded_values',[]) if a['dimension']==dimension}
        if not positive and not negative: continue
        allowed=set(dimension_values(catalog,dimension))
        if not allowed or not (positive|negative)<=allowed:
            raise AnalysisError('unsupported_dimension','Requested population classification is unavailable')
        selected=sorted((positive or allowed)-negative)
        if not selected: raise AnalysisError('query_scope','Requested population constraints conflict')
        result.append(dict(dimension=dimension,operator='eq' if len(selected)==1 else 'in',
                           value=selected[0] if len(selected)==1 else selected))
    return result


def complete_population_filters(intent, anchors, catalog):
    from services.analysis_contract import Filter
    from services.analytical_resolver import ResolutionIssues
    result=intent.model_copy(deep=True); changes=[]; issues=[]
    for expected in population_filters(anchors,catalog):
        for req in result.requirements:
            if req.availability!='requested': continue
            present=[f for f in req.filters if f.dimension==expected['dimension']]
            selected=set(expected['value'] if isinstance(expected['value'],list) else [expected['value']])
            if present and any(f.operator not in {'eq','in'} or set(f.value if isinstance(f.value,list) else [f.value])!=selected for f in present):
                issues.append(dict(requirement_id=req.id,field='filters',code='population_filter_mismatch',expected=expected))
            elif not present:
                req.filters.append(Filter.model_validate(expected))
                changes.append(dict(requirement_id=req.id,field='filters',rule='explicit_metadata_population',value=expected))
    if issues: raise ResolutionIssues(issues)
    return result,changes


def complete_explicit_granularity(intent, anchors):
    """A single explicit cadence applies to missing trend cadences only."""
    values = {g for a in anchors.get('granularities', []) for g in a['candidate_ids']}
    if len(values) != 1:
        return intent, []
    result = intent.model_copy(deep=True)
    changes = []
    for req in result.requirements:
        if req.availability == 'requested' and req.analysis_kind == 'trend' and not req.granularity:
            req.granularity = next(iter(values))
            changes.append(dict(requirement_id=req.id, field='granularity',
                                rule='explicit_request_cadence', value=req.granularity))
    return result, changes


def complete_default_time(intent, anchors, question, catalog, reference):
    """Apply the declared all_time policy only when the user supplied no time.

    Calendar/relative syntax is checked with the shared metadata grammar, not
    just numeric windows. Refinements must inherit their stored time separately.
    """
    from services.time_resolution_service import parse_time
    from services.analysis_contract import TimeSpec
    if anchors['ui'].get('required_period') or anchors.get('times'):
        return intent, []
    parsed = parse_time(question, catalog.registry['interpretation'], catalog.registry['timezone'], reference)
    if parsed['recognized_time_parts'] or parsed['time_errors']:
        return intent, []
    result = intent.model_copy(deep=True)
    changes = []
    default = TimeSpec(kind='relative',mode='all_time')
    for req in result.requirements:
        if req.availability == 'requested' and req.time != default:
            req.time = default.model_copy()
            changes.append(dict(requirement_id=req.id,field='time',rule='unspecified_time_all_time'))
    return result, changes


def complete_unique_grouping(intent, anchors, index):
    """Fill one missing required axis only from unique unrepresented user facts.

    This is not domain routing or a default Top N. No wording, goal, model ID or
    lens hint supplies an axis. Multiple possible requirements/axes stay errors.
    """
    requested=[r for r in intent.requirements if r.availability=='requested']
    missing=[r for r in requested if not r.dimension_ids and (r.ranking or r.analysis_kind in
        {'ranking','distribution','cross_tab','relationship'})]
    if len(missing)!=1:
        return intent,[]
    target=missing[0]
    if not target.metric_ids or any(m not in index.metrics for m in target.metric_ids):
        return intent,[]
    represented={d for r in requested for d in r.dimension_ids}
    represented.update(f.dimension for r in requested for f in r.filters)
    represented.update(d for r in requested if r.ranking for d in r.ranking.per_group)
    dimensions=set()
    for anchor in anchors['dimensions']:
        ids=set(anchor['candidate_ids'])
        if ids & represented:continue
        if len(ids)!=1:return intent,[]
        dimensions.update(ids)
    expected=2 if target.analysis_kind=='cross_tab' else 1
    if len(dimensions)!=expected or any(not dimensions<=set(index.metrics[m]['dimensions']) for m in target.metric_ids):
        return intent,[]
    result=intent.model_copy(deep=True)
    next(r for r in result.requirements if r.id==target.id).dimension_ids=sorted(dimensions)
    return result,[dict(requirement_id=target.id,field='dimension_ids',rule='unique_unrepresented_explicit_grouping',dimension_ids=sorted(dimensions))]


def complete_explicit_share_targets(intent, anchors, catalog):
    """Complete only uniquely proven user feature/metric bindings in a draft.

    The metric mention must be contained in the catalog feature phrase. Multiple
    compatible requirements/metrics remain unresolved. Never repair frozen scope,
    silently make averages additive, or supply an unmentioned business feature.
    """
    result = intent.model_copy(deep=True)
    changes = []
    for feature in anchors.get('features', []):
        if feature['candidate_ids'] != ['contribution_share']:
            continue
        named = {m for a in anchors['metrics'] if feature['start'] <= a['start'] and
                 a['end'] <= feature['end'] for m in a['candidate_ids']}
        if not named:
            continue
        eligible = []
        for req in result.requirements:
            if req.availability != 'requested' or not req.dimension_ids or req.analysis_kind not in {
                    'aggregate','comparison','cross_tab','ranking','distribution'}:
                continue
            targets = set(req.metric_ids) & named
            if len(targets) != 1 or not catalog.registry['metrics'][next(iter(targets))].get('additive'):
                continue
            if req.ranking and req.ranking.metric_id not in targets:
                continue
            eligible.append((req, sorted(targets)))
        if len(eligible) != 1:
            continue
        req, targets = eligible[0]
        if 'contribution_share' not in req.derived_features or req.feature_metrics.get('contribution_share') != targets:
            req.derived_features = sorted(set(req.derived_features) | {'contribution_share'})
            req.feature_metrics['contribution_share'] = targets
            changes.append(dict(requirement_id=req.id,field='feature_metrics',
                rule='unique_explicit_user_feature_target',feature='contribution_share',metric_ids=targets))
    return result, changes


def disclosure_only_dimensions(anchors):
    """Dimensions named solely to explain population definitions, never grain."""
    disclosed = {d for a in anchors.get('population_scopes', []) if len(a['candidate_ids']) == 1
                 for d in a['candidate_ids']}
    independent = {d for a in anchors.get('dimensions', []) for d in a['candidate_ids']}
    return disclosed - independent


def normalize_population_disclosures(intent, anchors):
    """Remove a provably disclosure-only axis from an unapproved initial draft.

    Filters retain their meaning. Partitioned ranking needs explicit repair;
    silently changing its partition could change the requested population.
    """
    result, changes = intent.model_copy(deep=True), []
    excluded = disclosure_only_dimensions(anchors)
    for req in result.requirements:
        if req.availability != 'requested' or req.supporting_for:
            continue
        removed = set(req.dimension_ids) & excluded
        if not removed or (req.ranking and removed & set(req.ranking.per_group)):
            continue
        req.dimension_ids = [d for d in req.dimension_ids if d not in removed]
        changes.append(dict(requirement_id=req.id, field='dimension_ids',
                            rule='population_disclosure_is_not_grouping', removed_dimensions=sorted(removed)))
    return result, changes


def verify_anchors(anchors, requirements, reference, catalog):
    from services.time_resolution_service import resolve_time
    issues = []
    for expected in population_filters(anchors,catalog):
        selected=set(expected['value'] if isinstance(expected['value'],list) else [expected['value']])
        for req in requirements:
            if req.availability!='requested': continue
            present=[f for f in req.filters if f.dimension==expected['dimension']]
            if not present or any(f.operator not in {'eq','in'} or set(f.value if isinstance(f.value,list) else [f.value])!=selected for f in present):
                issues.append(dict(requirement_id=req.id,field='filters',code='population_filter_mismatch',expected=expected))
    requirements = [r for r in requirements if not r.supporting_for]
    requested = [r for r in requirements if r.availability == "requested"]
    excluded = disclosure_only_dimensions(anchors)
    for req in requested:
        extra = excluded & set(req.dimension_ids)
        if extra:
            issues.append(dict(requirement_id=req.id, field='dimension_ids',
                               code='population_disclosure_used_as_grouping', candidate_ids=sorted(extra)))
        partition = excluded & set(req.ranking.per_group) if req.ranking else set()
        if partition:
            issues.append(dict(requirement_id=req.id, field='ranking',
                               code='population_disclosure_used_as_partition', candidate_ids=sorted(partition)))
    selected = {m for req in requested for m in req.metric_ids if m in catalog.registry['metrics']}
    for scope in anchors.get('population_scopes', []):
        # Definitions are reported for every executed metric. A qualified scope
        # is covered only when selected catalog metrics actually expose it.
        if not any(catalog.registry['metrics'][m].get('population_definition') and
                   d in catalog.compatible_dimensions(m) for m in selected for d in scope['candidate_ids']):
            issues.append(dict(requirement_id=None,field='metric_ids',code='population_scope_unavailable',
                               candidate_ids=scope['candidate_ids']))
    for kind, field in (("metrics", "metric_ids"), ("dimensions", "dimension_ids"), ("features", "derived_features")):
        represented = {id for r in requirements for id in getattr(r, field)}
        if kind == 'metrics':
            equivalent = metric_equivalents(catalog)
            represented = {alias for m in represented for alias in equivalent.get(m, {m})}
        if kind == "dimensions":
            represented.update(f.dimension for r in requirements for f in r.filters)
            represented.update(d for r in requirements if r.ranking for d in r.ranking.per_group)
        for anchor in anchors[kind]:
            if not represented.intersection(anchor["candidate_ids"]):
                issue = {"requirement_id": None, "field": field, "code": "explicit_"+kind+"_missing",
                         "candidate_ids": anchor["candidate_ids"]}
                if kind == 'features':
                    # Name a unique existing target instead of forcing AI to
                    # add a duplicate requirement for an omitted calculation.
                    shapes = {'leader': {'ranking'}, 'top_gap': {'ranking'},
                              'change': {'trend'}, 'change_pct': {'trend'}}
                    eligible = [r for r in requested if any(r.analysis_kind in shapes.get(f, set())
                                for f in anchor['candidate_ids'])]
                    if len(eligible) == 1:
                        issue['requirement_id'] = eligible[0].id
                if kind == 'metrics':
                    # Concept neighbors identify REPAIR targets, never execution
                    # equivalence. AVG and SUM/COUNT retain distinct NULL rules.
                    neighbors = {m for group in catalog.registry.get('metric_concept_groups', [])
                                 if set(group).intersection(anchor['candidate_ids']) for m in group}
                    eligible = [r for r in requested if neighbors.intersection(r.metric_ids)]
                    if eligible:
                        for r in eligible:
                            issues.append({**issue,'requirement_id':r.id,
                                'code':'explicit_metric_definition_mismatch',
                                'protected_metric_ids':sorted(set(r.metric_ids)-neighbors)})
                        continue
                if issue not in issues:
                    issues.append(issue)
    for rank in anchors["rankings"]:
        if not any(r.ranking and (r.ranking.direction, r.ranking.limit) == (rank["direction"], rank["limit"]) for r in requested):
            issues.append({"requirement_id": None, "field": "ranking", "code": "explicit_ranking_missing", "expected": rank})
        elif rank.get('metric_id') and not any(r.ranking and
                (r.ranking.direction,r.ranking.limit,r.ranking.metric_id)==(rank['direction'],rank['limit'],rank['metric_id']) for r in requested):
            targets=[r for r in requested if r.ranking and (r.ranking.direction,r.ranking.limit)==(rank['direction'],rank['limit'])]
            issues.extend(dict(requirement_id=r.id,field='ranking',code='explicit_ranking_metric_mismatch',expected=rank) for r in targets)
    cadences={g for a in anchors.get('granularities',[]) for g in a['candidate_ids']}
    if len(cadences)==1:
        cadence=next(iter(cadences))
        for req in requested:
            if req.analysis_kind=='trend' and req.granularity!=cadence:
                issues.append(dict(requirement_id=req.id,field='granularity',
                                   code='explicit_granularity_missing',expected=cadence))
    if not anchors["ui"].get("required_period"):
        for time in anchors["times"]:
            expected = resolve_time(time, reference, catalog.registry["timezone"])[2]
            # A repair cannot turn an explicit time window into all_time.
            scoped = requested if len(anchors["times"]) == 1 else []
            if len(anchors["times"]) > 1 and not any(r.time and resolve_time(r.time.model_dump(mode="json"),reference,catalog.registry["timezone"])[2] == expected for r in requested):
                issues.append({"requirement_id":None,"field":"time","code":"explicit_time_missing","expected":time})
            for r in scoped:
                if not r.time or resolve_time(r.time.model_dump(mode="json"), reference, catalog.registry["timezone"])[2] != expected:
                    issues.append({"requirement_id": r.id, "field": "time", "code": "explicit_time_missing", "expected": time})
    for item in anchors["values"]:
        if not any(f.dimension == item["dimension"] and item["value"] in (f.value if isinstance(f.value,list) else [f.value]) for r in requested for f in r.filters):
            issues.append({"requirement_id": None, "field": "filters", "code": "explicit_value_missing", "expected": item})
    for anchor in anchors["capabilities"]:
        if not any(r.availability != "requested" and r.reason == "definition_unavailable" and value_text(r.goal).find(anchor["phrase"]) >= 0 for r in requirements):
            issues.append({"requirement_id": None, "field": "availability", "code": "unsupported_definition_omitted", "candidate_ids": anchor["candidate_ids"]})
    return issues


def refinement_anchors(original, initial_intent, history, catalog, ui, reference):
    """Replay accepted semantic deltas and retain untouched exact request facts.

    Explicit numeric/time/value/metric facts can change only when feedback
    supplies the replacement. No executable graph or stored coverage verdict
    participates in reconstruction.
    """
    from copy import deepcopy
    from services.analysis_intent import AnalysisIntentEnvelope, AnalysisIntentDelta
    from services.hybrid_analyst_planner import apply_delta
    from services.analytical_resolver import ResolutionIssues
    from services.time_resolution_service import resolve_time
    intent = AnalysisIntentEnvelope.model_validate(initial_intent)
    anchors = request_anchors(original, catalog, ui)
    if verify_anchors(anchors, intent.requirements, reference, catalog):
        raise ValueError('Initial request meaning does not cover exact anchors')
    if len(history) > 20:
        raise ValueError('Semantic refinement history exceeds bound')
    fields = {'metric_ids':'metrics', 'dimension_ids':'dimensions',
              'derived_features':'features', 'ranking':'rankings', 'time':'times', 'filters':'values',
              'granularity':'granularities'}
    for entry in history:
        feedback = request_anchors(entry['feedback'], catalog, ui)
        delta = AnalysisIntentDelta.model_validate(entry['delta'])
        prior = {r.id:r for r in intent.requirements}
        after = apply_delta(intent, entry['delta'])
        updated = {r.id:r for r in after.requirements}
        for change in delta.changes:
            before = prior.get(change.requirement_id)
            if not before:
                continue
            if (change.action=='update' and 'feature_metrics' in change.changes and
                before.feature_metrics != updated[change.requirement_id].feature_metrics and
                not feedback['features'] and not feedback['metrics']):
                raise ResolutionIssues([{'requirement_id':change.requirement_id,'field':'feature_metrics','code':'explicit_scope_change_unconfirmed'}])
            changed = set(fields) if change.action == 'remove' else set(change.changes)
            for field in changed & fields.keys():
                old = getattr(before,field)
                new = getattr(updated[change.requirement_id],field) if change.action != 'remove' else None
                if old == new:
                    continue
                kind = fields[field]
                if field in {'ranking','time','granularity'}:
                    protected = anchors[kind]
                elif field == 'filters':
                    protected = [a for a in anchors[kind] if any(a['dimension']==f.dimension for f in old)]
                else:
                    protected = [a for a in anchors[kind] if set(a['candidate_ids']) & set(old)]
                if protected and change.action != 'remove' and not feedback[kind]:
                    raise ResolutionIssues([{'requirement_id':change.requirement_id,'field':field,'code':'explicit_scope_change_unconfirmed'}])
                if field == 'ranking' and old:
                    protected = [a for a in protected if (a['direction'],a['limit']) == (old.direction,old.limit)]
                if field == 'time' and old:
                    period = resolve_time(old.model_dump(mode='json'),reference,catalog.registry['timezone'])[2]
                    protected = [a for a in protected if resolve_time(a,reference,catalog.registry['timezone'])[2] == period]
                anchors[kind] = [a for a in anchors[kind] if a not in protected]
        for kind in (*fields.values(), 'capabilities', 'population_scopes', 'excluded_values'):
            for anchor in feedback[kind]:
                if anchor not in anchors[kind]:
                    anchors[kind].append(deepcopy(anchor))
        if feedback.get('analysis_breadth'):
            anchors['analysis_breadth']=feedback['analysis_breadth']
        intent = after
        issues = verify_anchors(anchors,intent.requirements,reference,catalog)
        if issues:
            raise ResolutionIssues(issues)
    return anchors, intent
