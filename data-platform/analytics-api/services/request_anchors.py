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
    output['dimensions'] = [d for d in output['dimensions'] if not any(
        m['start'] <= d['start'] and d['end'] <= m['end'] and m['end']-m['start'] > d['end']-d['start']
        for m in output['metrics'])]
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
    values = []
    for dimension in r["dimensions"]:
        vocabulary = aliases_for(catalog, dimension, dimension_values(catalog, dimension))
        for mention in exact_mentions(text, {k: {str(v)} for k,v in vocabulary.items()}):
            if any(a['start'] <= mention['start'] and mention['end'] <= a['end'] and a['end']-a['start'] > mention['end']-mention['start']
                   for kind in ('metrics','features','capabilities') for a in output[kind]):
                continue
            value = next(v for k,v in vocabulary.items() if k == mention["phrase"])
            if {"dimension": dimension, "value": value} not in values:
                values.append({"dimension": dimension, "value": value})
    output["values"] = values
    rankings = re.findall(r"\b(top|bottom)\s+(\d{1,3})\b", text)
    output["rankings"] = [{"direction": d, "limit": int(n)} for d,n in rankings if 1 <= int(n) <= 100]
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


def verify_anchors(anchors, requirements, reference, catalog):
    from services.time_resolution_service import resolve_time
    issues = []
    requested = [r for r in requirements if r.availability == "requested"]
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
                if issue not in issues:
                    issues.append(issue)
    for rank in anchors["rankings"]:
        if not any(r.ranking and (r.ranking.direction, r.ranking.limit) == (rank["direction"], rank["limit"]) for r in requested):
            issues.append({"requirement_id": None, "field": "ranking", "code": "explicit_ranking_missing", "expected": rank})
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
        for kind in (*fields.values(), 'capabilities'):
            for anchor in feedback[kind]:
                if anchor not in anchors[kind]:
                    anchors[kind].append(deepcopy(anchor))
        intent = after
        issues = verify_anchors(anchors,intent.requirements,reference,catalog)
        if issues:
            raise ResolutionIssues(issues)
    return anchors, intent
