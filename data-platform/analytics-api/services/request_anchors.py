"""Exact metadata and numeric/UI coverage guards; never an analytical router."""
import re
from copy import deepcopy
from functools import lru_cache
from services.value_grounding_service import value_text, aliases_for, dimension_values


def capability_is_constraint(text, start):
    """A prohibited conclusion or missing-evidence condition is not a request.

    This is span-local: requesting the same concept elsewhere still blocks.
    It does not suppress an explicit calculation after a conditional clause.
    """
    prefix=text[max(0,start-100):start]
    prohibited=r'\b(?:khong|chua|dung)\s+(?:can\s+)?(?:tu\s+)?(?:ket luan|suy ra|tinh|danh gia|cong bo)(?:\s+(?:ve|duoc|chi so|hieu qua|gia tri))*\s*$'
    missing=r'\b(?:neu|khi)\s+(?:thieu|chua co|khong co)\s+(?:(?:du lieu|thong tin|bang chung|so lieu)\s+)?$'
    return bool(re.search(prohibited,prefix) or re.search(missing,prefix))


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


@lru_cache(maxsize=16384)
def _phrase_pattern(phrase):
    # Hundreds of governed phrases exceed re's internal 512-pattern cache;
    # recompiling them dominated latency. Same pattern, compiled once.
    return re.compile(r"(?<!\w)" + re.escape(phrase) + r"(?!\w)")


def exact_mentions(text, vocabulary):
    matches = []
    for phrase, ids in vocabulary.items():
        if not phrase or len(phrase) < 3:
            continue
        for match in _phrase_pattern(phrase).finditer(text):
            matches.append((match.start(), match.end(), phrase, sorted(ids)))
    # Prefer a qualified business phrase over a contained generic alias.
    return [{"phrase": phrase, "candidate_ids": ids, "start":start, "end":end} for start, end, phrase, ids in matches
            if not any(a <= start and end <= b and b-a > end-start for a,b,_,_ in matches)]


def metric_mentions(text, vocabulary):
    """A longer qualified metric phrase owns an overlapping generic alias too."""
    mentions = exact_mentions(text, vocabulary)
    return [m for m in mentions if not any(
        max(m['start'], other['start']) < min(m['end'], other['end'])
        and other['end']-other['start'] > m['end']-m['start'] for other in mentions)]


def request_anchors(question, catalog, ui):
    text, r = value_text(question), catalog.registry
    output = {}
    vocabularies = {}
    for kind in ("metrics", "dimensions"):
        vocabulary = {}
        for id, definition in r[kind].items():
            # Retired definitions stay compilable for saved reports but are no
            # longer a meaning a new question can anchor to.
            if definition.get("lifecycle", {}).get("status") == "deprecated":
                continue
            broad = {value_text(a) for a in definition.get("non_anchor_aliases", [])}
            # "Số đơn hợp lệ (HOAN_THANH + DANG_GIAO)": the name before a definitional parenthesis is how users say it.
            short = re.sub(r"\s*\([^)]*\)\s*$", "", definition["business_name"])
            for alias in [id, definition["business_name"], short, *definition.get("aliases", [])]:
                if value_text(alias) in broad:
                    continue
                vocabulary.setdefault(value_text(alias), set()).add(id)
        output[kind] = metric_mentions(text, vocabulary) if kind == 'metrics' else exact_mentions(text, vocabulary)
        vocabularies[kind] = vocabulary
    # A named grouping axis can contain a shorter metric alias (for example
    # application status contains application count's noun phrase). It names
    # the axis here, not a second requested measure. Longer qualified metric
    # phrases elsewhere in the clause remain intact.
    output['metrics'] = [m for m in output['metrics'] if not any(
        d['start'] <= m['start'] and m['end'] <= d['end']
        and d['end']-d['start'] > m['end']-m['start'] for d in output['dimensions'])]
    if ':' in question:
        heading=value_text(question.split(':',1)[0])
        if any(re.search(r'\b'+re.escape(value_text(q))+r'\b',heading) for q in r.get('topic_heading_qualifiers',[])) and not any(
                re.search(r'\b'+re.escape(value_text(q))+r'\b',heading) for q in r.get('grouping_qualifiers',[])):
            output['topic_dimensions']=[a for a in output['dimensions'] if a['end']<=len(heading)]
            output['dimensions']=[a for a in output['dimensions'] if a not in output['topic_dimensions']]
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
    # A dimension alias inside a longer governed VALUE label/alias ("chi nhánh" in "chi nhánh chính",
    # a store-type value) names a value of another axis, not a grouping axis to require.
    value_vocabulary = {}
    for id, definition in r['dimensions'].items():
        phrases = list((definition.get('value_labels') or {}).values())
        aliases = definition.get('value_aliases') or {}
        phrases += [a for v in (aliases.values() if isinstance(aliases, dict) else []) for a in (v if isinstance(v, list) else [v])]
        phrases += [a for g in definition.get('value_groups') or [] for a in g.get('aliases') or []]
        for phrase in phrases:
            if isinstance(phrase, str) and len(value_text(phrase)) >= 3:
                value_vocabulary.setdefault(value_text(phrase), set()).add(id)
    value_mentions = exact_mentions(text, value_vocabulary)
    output['dimensions'] = [d for d in output['dimensions'] if not any(
        v['start'] <= d['start'] and d['end'] <= v['end'] and v['end']-v['start'] > d['end']-d['start']
        for v in value_mentions)]
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
        return capability_is_constraint(text,mention['start'])
    output['capability_constraints']=[m for m in capabilities if prohibited(m)]
    output['capabilities']=[m for m in capabilities if not prohibited(m)]
    output['features']=[m for m in output['features'] if not prohibited(m)]
    values, excluded_values = [], []
    def excluded(mention):
        prefix = text[max(0,mention['start']-80):mention['start']]
        return any(re.search(r'(?<!\w)'+re.escape(value_text(q))+r'\s*$',prefix)
                   for q in r.get('filter_exclusion_qualifiers',[]))
    for dimension in r["dimensions"]:
        if r["dimensions"][dimension].get("filter_anchor") is False: continue
        vocabulary = aliases_for(catalog, dimension, dimension_values(catalog, dimension))
        non_filters = exact_mentions(text, {value_text(p): {dimension} for p in
            r['dimensions'][dimension].get('non_filter_phrases', [])})
        for mention in exact_mentions(text, {k: {str(v)} for k,v in vocabulary.items()}):
            if any(a['start'] <= mention['start'] and mention['end'] <= a['end'] for a in non_filters):
                continue
            if any(a['start'] <= mention['start'] and mention['end'] <= a['end'] and a['end']-a['start'] > mention['end']-mention['start']
                   for kind in ('metrics','features','capabilities') for a in output[kind]):
                continue
            value = next(v for k,v in vocabulary.items() if k == mention["phrase"])
            target = excluded_values if excluded(mention) else values
            if {"dimension": dimension, "value": value} not in target:
                target.append({"dimension": dimension, "value": value})
        for group in r['dimensions'][dimension].get('value_groups',[]):
            for mention in exact_mentions(text,{value_text(a):set(group['values']) for a in group['aliases']}):
                if any(a['start']<=mention['start'] and mention['end']<=a['end']
                       and a['end']-a['start']>mention['end']-mention['start']
                       for a in output['metrics']):
                    continue
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
    terms=r.get('interpretation',{}).get('forecast_terms',[])
    forecast_requested=any(re.search(r'\b'+re.escape(value_text(t))+r'\b',text) for t in terms)
    grammar=r.get('workspace',{}).get('forecast_horizon_grammar')
    horizon=re.search(grammar,text) if grammar and forecast_requested else None
    output['forecasts']=[dict(horizon=int(horizon.group('amount')),unit=r['workspace']['forecast_unit_aliases'][horizon.group('unit')])] if horizon else []
    # Bind a numeric ranking only to a unique catalog metric mention in its
    # clause. Companion metrics in later sentences cannot replace the criterion.
    ranking_clauses=[]
    for source_clause in re.split(r'[.;:\n]+',question):
        normalized=value_text(source_clause)
        mentions=list(re.finditer(r'\b('+ '|'.join(re.escape(a) for a in sorted(ranking_words,key=len,reverse=True))+r')\s+(\d{1,3})\b',normalized))
        for index,mention in enumerate(mentions):
            if 1<=int(mention.group(2))<=100:
                end=mentions[index+1].start() if index+1<len(mentions) else len(normalized)
                ranking_clauses.append(normalized[mention.end():end])
    for rank,clause in zip(output['rankings'],ranking_clauses):
        # In Vietnamese, generic Top N / xếp hạng N can ask for the lowest N.
        # The explicit value qualifier owns direction; never infer it from a
        # metric's business desirability (a high cancellation rate stays high).
        modifiers=r.get('ranking_value_direction_aliases',{})
        directions={direction for direction,aliases in modifiers.items() if any(
            re.search(r'(?<!\w)'+re.escape(value_text(alias))+r'(?!\w)',clause) for alias in aliases)}
        if rank['direction']=='top' and directions=={'bottom'}:
            rank['direction']='bottom'
        eligible=sorted(metric_mentions(clause,vocabularies['metrics']),key=lambda a:a['start'])
        rank['metric_candidates']=sorted({m for a in eligible for m in a['candidate_ids']})
        if eligible and len(eligible[0]['candidate_ids'])==1:
            rank['metric_id']=eligible[0]['candidate_ids'][0]
        companions=[a for a in eligible if re.search(r'\b(?:kem|with|along with)\b',clause[:a['start']])
            and len(a['candidate_ids'])==1 and a['candidate_ids'][0]!=rank.get('metric_id')]
        if companions:
            rank['companion_metric_ids']=sorted({a['candidate_ids'][0] for a in companions})
        entity_vocab = {}
        for id, definition in r['dimensions'].items():
            for alias in [definition['business_name'], *definition.get('aliases', []),
                          *definition.get('ranking_entity_aliases', [])]:
                entity_vocab.setdefault(value_text(alias), set()).add(id)
        # Only the entity immediately following Top N is authoritative. A
        # dimension inside its metric name is not a second grouping axis.
        entities = exact_mentions(clause, entity_vocab)
        immediate = [a for a in entities if not clause[:a['start']].strip()]
        if len(immediate)==1 and len(immediate[0]['candidate_ids'])==1:
            rank['dimension_id']=immediate[0]['candidate_ids'][0]
        rank['partition_requested'] = any(re.search(r'(?<!\w)'+re.escape(value_text(q))+r'(?!\w)',clause)
            for q in r.get('ranking_partition_qualifiers', []))
        qualifiers=[m.start() for q in r.get('ranking_partition_qualifiers',[]) for m in re.finditer(r'\b'+re.escape(value_text(q))+r'\b',clause)]
        rank['partition_dimensions']=sorted({d for a in entities if qualifiers and a['start']>=min(qualifiers)
            for d in a['candidate_ids'] if len(a['candidate_ids'])==1 and d!=rank.get('dimension_id')})
    rolling = re.findall(r"\b(\d{1,4})\s+(ngay|thang)\s+(?:gan nhat|gan day|qua)\b", text)
    output["times"] = [{"kind": "rolling", "amount": int(n), "unit": "day" if u == "ngay" else "month"}
                       for n,u in rolling if 1 <= int(n) <= 3660]
    dates = re.findall(r"(?<!\d)\d{4}-\d{2}-\d{2}(?!\d)", question)
    if len(dates) == 2:
        output["times"].append({"kind": "range", "start": dates[0], "end": dates[1]})
    from services.time_resolution_service import parse_time
    parsed_time = parse_time(question, r['interpretation'], r['timezone'])
    output['times'].extend(parsed_time['recognized_time_parts'])
    output['times'] = list({str(sorted(t.items())):t for t in output['times']}.values())
    # Keep explicit grouped clauses together. Global presence of a metric and
    # an axis in unrelated requirements cannot prove their requested pairing.
    bindings, time_bindings, trend_bindings = [], [], []
    for clause in re.split(r'[.;:\n]+', question):
        normalized = value_text(clause)
        metrics = metric_mentions(normalized, vocabularies['metrics'])
        clause_time = parse_time(clause, r['interpretation'], r['timezone'])['recognized_time_parts']
        unique_times = list({str(sorted(t.items())):t for t in clause_time}.values())
        if len(unique_times) == 1:
            time_bindings.extend(dict(metric_candidates=m['candidate_ids'], time=unique_times[0]) for m in metrics)
        if not re.search(r'\btheo\b', normalized):
            continue
        dimensions = exact_mentions(normalized, vocabularies['dimensions'])
        independent_dimensions = [a for a in dimensions if not any(
            m['start'] <= a['start'] and a['end'] <= m['end'] for m in metrics)]
        cadences = exact_mentions(normalized, {value_text(a): {g}
            for g, aliases in r.get('granularity_aliases', {}).items() for a in aliases})
        cadences = [a for a in cadences if not any(m['start'] < a['end'] and a['start'] < m['end'] for m in metrics)]
        gs = {g for a in cadences for g in a['candidate_ids']}
        if (len(gs)==1 and metrics and len(re.findall(r'\btheo\b',normalized))==1 and
                any(m['end']<=min(a['start'] for a in cadences) for m in metrics)):
            # Each independently mentioned metric owns this cadence. Combining
            # their candidate sets would let one revenue trend accidentally
            # satisfy a separately requested order-count time series.
            for metric in metrics:
                binding=dict(metric_candidates=sorted(metric['candidate_ids']),granularity=next(iter(gs)),
                    dimension_ids=sorted({d for a in independent_dimensions for d in a['candidate_ids']}))
                if binding not in trend_bindings:
                    trend_bindings.append(binding)
        dimensions = [a for a in dimensions if re.search(r'\btheo\s*$', normalized[:a['start']])
            and not any(m['start'] <= a['start'] and a['end'] <= m['end'] for m in metrics)]
        # Only bind unique, independently named axes; prose containing several
        # goals/axes stays with the interpreter rather than guessed grouping.
        ds = {d for a in dimensions for d in a['candidate_ids']}
        if len(ds) == 1 and metrics and len({d for a in independent_dimensions for d in a['candidate_ids']})==1:
            bindings.append(dict(metric_candidates=sorted({m for a in metrics for m in a['candidate_ids']}),
                dimension_id=next(iter(ds))))
    output['clause_bindings'] = bindings
    output['period_comparisons'] = []
    if (len(output['times'])==2 and re.search(r'\b(?:so sanh|compare)\b',text)
            and not (output['dimensions'] or output['rankings'] or ui.get('required_period'))
            and output['metrics'] and all(len(a['candidate_ids'])==1 for a in output['metrics'])):
        output['period_comparisons']=[dict(metric_ids=sorted({a['candidate_ids'][0] for a in output['metrics']}),
            baseline=output['times'][0],target=output['times'][1])]
    output['time_bindings'] = time_bindings
    output['trend_bindings'] = trend_bindings
    output['granularities'] = exact_mentions(text, {value_text(a): {g}
        for g, aliases in r.get('granularity_aliases', {}).items() for a in aliases})
    # A cadence cannot borrow a word from an already recognized metric noun
    # phrase ("mua hàng" + "tháng 9" is not a recurring monthly task).
    output['granularities'] = [a for a in output['granularities'] if not any(
        m['start'] < a['end'] and a['start'] < m['end'] for m in output['metrics'])]
    output["ui"] = {k: v for k,v in ui.items() if k in {"required_period", "required_filters", "required_filter", "required_domain", "scope_mode"}}
    if ui.get('risk_snapshot_metrics'):
        output['ui'].update({k: deepcopy(ui.get(k)) for k in
            ('analysis_mission', 'risk_snapshot_metrics', 'guided_intent')})
    from services.scope_resolution_service import resolve_scope
    output["scope_resolution"] = resolve_scope(question, catalog, output["ui"])
    for b in output['scope_resolution'].get('bindings',[]):
        if not b.get('comparison'):
            output['values']=[v for v in output['values'] if v['dimension']!=b['dimension']]+[
                dict(dimension=b['dimension'],value=v) for v in b['members']]
    # "… chỉ trong 5 tỉnh này": a dimension head followed by a demonstrative refers to
    # the entity set selected earlier in the request (dependent goals, PLAN §3/I16).
    from services.input_integrity_service import policy as integrity_policy, _pattern
    anaphora=re.compile(r'\s*'+_pattern(integrity_policy().get('anaphora_terms',[]))+r'\s*(?:$|[,.;:!?)])')
    heads={value_text(h):{d} for d,hs in integrity_policy().get('heads',{}).items() for h in hs}
    for a in output['dimensions']:
        if len(a['candidate_ids'])==1:heads.setdefault(value_text(a['phrase']),set(a['candidate_ids']))
    output['cohort_references']=[]
    ref_cursor=0
    # value_text folds punctuation to spaces. Match a reference within its raw
    # clause so "này; <next goal>" retains the same boundary as final "này".
    for segment in re.finditer(r'[^,.;:\n!?()]+',question):
        normalized=value_text(segment.group())
        offset=text.find(normalized,ref_cursor) if normalized else -1
        if offset<0:continue
        ref_cursor=offset+len(normalized)
        output['cohort_references'].extend(dict(dimension=next(iter(a['candidate_ids'])),
            start=offset+a['start'],end=offset+a['end']) for a in exact_mentions(normalized,heads)
            if len(a['candidate_ids'])==1 and anaphora.match(normalized,a['end']))
    # A back-reference belongs to its own requested clause. Its presence cannot
    # narrow a separate national scalar just because both use the same metric.
    cursor = 0
    independent_scalar_metrics = set()
    for clause in re.finditer(r'[^.;:\n]+', question):
        normalized = value_text(clause.group())
        start = text.find(normalized, cursor) if normalized else -1
        if start < 0:continue
        end = start + len(normalized); cursor = end
        clause_refs = [ref for ref in output['cohort_references'] if start <= ref['start'] < end]
        clause_dimensions = {d for a in output['dimensions'] if start <= a['start'] < end for d in a['candidate_ids']}
        clause_metrics = {m for a in metric_mentions(normalized, vocabularies['metrics']) for m in a['candidate_ids']}
        has_ranking = any(re.search(r'(?<!\w)'+re.escape(word)+r'\s+\d{1,3}\b', normalized) for word in ranking_words)
        if not clause_refs and not clause_dimensions and not has_ranking:
            independent_scalar_metrics.update(clause_metrics)
        for ref in clause_refs:
            if start <= ref['start'] < end:
                ref['goal_dimensions'] = sorted({d for a in output['dimensions'] if start <= a['start'] < end
                                                for d in a['candidate_ids'] if d != ref['dimension']})
                ref['goal_metrics'] = sorted({m for a in metric_mentions(normalized, vocabularies['metrics'])
                                             for m in a['candidate_ids']})
    for ref in output['cohort_references']:
        ref['independent_scalar_metrics'] = sorted(independent_scalar_metrics)
    # "chi nhánh và phương thức thanh toán": directly coordinated axes are parallel breakdowns.
    dims=sorted((a for a in output['dimensions'] if len(a['candidate_ids'])==1),key=lambda a:a['start'])
    output['coordinated_dimensions']=[[a['candidate_ids'][0],b['candidate_ids'][0]] for a,b in zip(dims,dims[1:])
        if re.fullmatch(r'\s*(?:,|va|và|cung|cùng)\s*',text[a['end']:b['start']])]
    return output


def normalize_cohort_cross_tabs(intent, anchors):
    """"chi nhánh … trong 5 tỉnh này" read as a cross-tab [tỉnh, chi nhánh] means the
    branches OF the ranked provinces: one axis inside the cohort, not a full grid."""
    refs={r['dimension'] for r in anchors.get('cohort_references',[])}
    result,changes=intent.model_copy(deep=True),[]
    # The cohort is the ranking over exactly the referenced axis; it is never rewritten.
    primaries=[r for r in result.requirements if r.availability=='requested' and not r.supporting_for and r.ranking
               and len(r.dimension_ids)==1 and r.dimension_ids[0] in refs]
    # Duplicate requirements can request different facts about the same selected
    # keys. Optional features/labels do not create a second cohort.
    def selection(req):
        return (req.dimension_ids, req.ranking.model_dump(mode='json'),
                req.time.model_dump(mode='json') if req.time else None,
                [f.model_dump(mode='json') for f in req.filters], req.domain_id)
    if not primaries or any(selection(req) != selection(primaries[0]) for req in primaries[1:]):
        return result,changes
    primary=primaries[0];ranked=set(primary.dimension_ids)
    explicit_axes={d for ref in anchors.get('cohort_references',[]) for d in ref.get('goal_dimensions',[])}
    for req in result.requirements:
        if (req.availability=='requested' and req.supporting_for in {p.id for p in primaries}
                and explicit_axes.intersection(req.dimension_ids)
                and set(req.metric_ids)<=set(primary.metric_ids)
                and req.time==primary.time and req.filters==primary.filters):
            # The input explicitly requests these axes. A model's optional-role
            # hint cannot demote them and make their coverage disappear.
            req.supporting_for=None
            changes.append(dict(requirement_id=req.id,field='supporting_for',rule='explicit_cohort_goal'))
    coordinated={frozenset(p) for p in anchors.get('coordinated_dimensions',[])}
    added=[]
    for req in result.requirements:
        if (any(req is p for p in primaries) or req.availability!='requested' or req.supporting_for
                or req.analysis_kind not in {'cross_tab','ranking','aggregate'} or len(req.dimension_ids)<2):continue
        cohort=[d for d in req.dimension_ids if d in ranked]
        # Directly coordinated axes also denote parallel breakdowns inside
        # the referenced cohort when the draft already omitted the rank axis.
        if len(cohort)==1:
            rest=[d for d in req.dimension_ids if d!=cohort[0]]
        elif not cohort and req.analysis_kind=='cross_tab':
            rest=list(req.dimension_ids)
        else:continue
        # Several remaining axes are parallel breakdowns only when the user coordinated them.
        if len(rest)>1 and not all(frozenset(p) in coordinated for p in zip(rest,rest[1:])):continue
        previous=list(req.dimension_ids)
        req.analysis_kind='aggregate';req.dimension_ids=[rest[0]];req.ranking=None
        req.derived_features=[f for f in req.derived_features if f not in {'leader','top_gap','selected_total'}]
        for f in ('leader','top_gap','selected_total'):req.feature_metrics.pop(f,None)
        for d in rest[1:]:
            added.append(req.model_copy(deep=True,update={'id':(req.id+'_'+d)[:40],'dimension_ids':[d]}))
        changes.append(dict(requirement_id=req.id,field='dimension_ids',rule='cohort_reference_axis',
                            previous=previous,value=rest))
    result.requirements.extend(added)
    # A dependent goal's own filter on the cohort axis ("city = các tỉnh này") is the model's
    # rendering of the back-reference; the ranked keys replace it (scope shared with the ranking stays).
    if True:
        rank=primary
        for req in result.requirements:
            if req is rank or req.availability!='requested' or req.supporting_for or req.ranking:continue
            kept=[f for f in req.filters if f.dimension not in refs or f in rank.filters]
            if len(kept)!=len(req.filters):
                changes.append(dict(requirement_id=req.id,field='filters',rule='cohort_reference_filter',
                                    previous=[f.dimension for f in req.filters if f not in kept],value=[]))
                req.filters=kept
    return result,changes


def complete_coordinated_axes(intent, anchors, index):
    """Add the parallel breakdown the interpretation dropped for a coordinated axis pair.

    Only a requested single-axis aggregate whose axis is coordinated with an unrepresented
    explicit axis is copied; the metric, time, filters and features stay identical."""
    requested=[r for r in intent.requirements if r.availability=='requested' and not r.supporting_for]
    represented={d for r in requested for d in r.dimension_ids}|{f.dimension for r in requested for f in r.filters}
    result,changes=intent.model_copy(deep=True),[]
    for x,y in anchors.get('coordinated_dimensions',[]):
        for have,missing in ((x,y),(y,x)):
            if missing in represented or have not in represented:continue
            sources=[r for r in requested if r.dimension_ids==[have] and r.analysis_kind=='aggregate' and not r.ranking]
            if len(sources)!=1 or any(missing not in index.metrics.get(m,{}).get('dimensions',[]) for m in sources[0].metric_ids):
                continue
            copy=sources[0].model_copy(deep=True,update={'id':(sources[0].id+'_'+missing)[:40],'dimension_ids':[missing]})
            result.requirements.append(copy);represented.add(missing)
            changes.append(dict(requirement_id=copy.id,field='requirements',rule='coordinated_axis_breakdown',
                                source=sources[0].id,dimension_ids=[missing]))
    return result,changes


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
    scope = anchors.get("scope_resolution") or {}
    for f in scope.get("filters", []):
        binding = next((b for b in scope.get("bindings", []) if b["dimension"] == f["dimension"]), {})
        if not binding.get("comparison"):
            result.append(f)
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


def complete_explicit_temporal_roles(intent, anchors):
    """Bind an unambiguous cadence-bearing initial draft to its temporal role.

    An aggregate's unused cadence is not evidence of a requested time series.
    Keep independent totals and explicit ranking/baseline/forecast goals intact.
    Ambiguous or incompatible drafts remain targets for strict anchor repair.
    """
    from services.analytical_resolver import FEATURE_SHAPES
    result=intent.model_copy(deep=True);changes=[]
    named={f for a in anchors.get('features',[]) for f in a['candidate_ids']}
    roots=[r for r in result.requirements if r.availability=='requested' and not r.supporting_for]
    for binding in anchors.get('trend_bindings',[]):
        metrics=set(binding['metric_candidates']);cadence=binding['granularity']
        if any(r.analysis_kind=='trend' and r.granularity==cadence and metrics.intersection(r.metric_ids) for r in roots):
            continue
        candidates=[r for r in roots if r.analysis_kind in {'aggregate','comparison'}
            and r.granularity==cadence and len(r.metric_ids)==1 and r.metric_ids[0] in metrics
            and not r.ranking and not r.comparison_time and not r.forecast
            and not any(f in named and 'trend' not in FEATURE_SHAPES.get(f,{'trend'}) for f in r.derived_features)]
        if len(candidates)!=1:
            continue
        req=candidates[0];previous=req.analysis_kind
        req.analysis_kind='trend'
        removed=[f for f in req.derived_features if f not in named and 'trend' not in FEATURE_SHAPES.get(f,{'trend'})]
        req.derived_features=[f for f in req.derived_features if f not in removed]
        req.feature_metrics={f:ms for f,ms in req.feature_metrics.items() if f in req.derived_features}
        changes.append(dict(requirement_id=req.id,field='analysis_kind',rule='explicit_cadence_temporal_role',
                            previous=previous,value='trend',removed_unrequested_features=removed))
    return result,changes


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
    errors=[e for e in parsed['time_errors'] if e!='forecast_unsupported' or not any(r.forecast for r in intent.requirements)]
    if parsed['recognized_time_parts'] or errors:
        return intent, []
    result = intent.model_copy(deep=True)
    changes = []
    default = TimeSpec(kind='relative',mode='all_time')
    for req in result.requirements:
        if req.availability == 'requested' and req.time != default:
            req.time = default.model_copy()
            changes.append(dict(requirement_id=req.id,field='time',rule='unspecified_time_all_time'))
    return result, changes


def complete_governed_roles(intent, anchors, catalog, question=''):
    """Bind explicit analytical methods to metadata; do not invent user goals."""
    result=intent.model_copy(deep=True);changes=[]
    features={f for a in anchors['features'] for f in a['candidate_ids']};drivers={}
    from services.mission_contract_service import mission_signals
    methods=mission_signals(value_text(question),catalog.registry)
    for req in result.requirements:
        if req.availability!='requested' or req.supporting_for:continue
        if ('selected_total' in req.derived_features and 'selected_total' not in features
                and req.analysis_kind!='ranking' and not req.ranking and req.dimension_ids):
            # selected_total describes a Top N cohort; this requirement is not a ranking.
            req.derived_features=[f for f in req.derived_features if f!='selected_total']
            req.feature_metrics.pop('selected_total',None)
            changes.append(dict(requirement_id=req.id,field='derived_features',
                rule='unrequested_selected_total_outside_ranking'))
        if ('selected_total' in req.derived_features and 'selected_total' not in features
                and req.ranking and req.ranking.metric_id in catalog.registry['metrics']
                and not catalog.registry['metrics'][req.ranking.metric_id].get('additive')):
            # A total of rates is neither requested work nor a valid statistic.
            # Keep the requested ranking and its independent companion metrics.
            req.derived_features=[f for f in req.derived_features if f!='selected_total']
            req.feature_metrics.pop('selected_total',None)
            changes.append(dict(requirement_id=req.id,field='derived_features',
                rule='unrequested_non_additive_rank_total'))
        if 'driver_delta' in features and len(req.metric_ids)==1 and not anchors['rankings'] and req.metric_ids[0] not in drivers:
            definition=catalog.registry['metrics'].get(req.metric_ids[0],{})
            if definition.get('additive'):
                req.analysis_kind='aggregate';req.ranking=None;req.granularity=None
                req.dimension_ids=req.dimension_ids if anchors['dimensions'] and req.dimension_ids else [catalog.registry['derived_features']['driver_delta']['default_dimension']]
                req.derived_features=sorted(features & {'driver_delta','scalar'})
                req.feature_metrics={k:v for k,v in req.feature_metrics.items() if k in req.derived_features}
                changes.append(dict(requirement_id=req.id,field='analysis_kind',rule='governed_change_decomposition'))
                drivers[req.metric_ids[0]]=req.id
        elif len(req.metric_ids)==1 and req.metric_ids[0] in drivers and features=={'driver_delta'} and not anchors['rankings'] and not anchors.get('trend_bindings'):
            req.supporting_for=drivers[req.metric_ids[0]]
        if 'relationship_strength' in features:
            pair=next((p for p in catalog.registry.get('governed_pairs',[]) if set(p['metrics'])==set(req.metric_ids)),None)
            if pair and not anchors['rankings'] and not anchors.get('trend_bindings'):
                req.analysis_kind='relationship';req.ranking=None;req.granularity=None
                req.dimension_ids=req.dimension_ids if anchors['dimensions'] and req.dimension_ids else list(pair['key'])
                req.derived_features=sorted(set(req.derived_features)|{'relationship_strength'})
                changes.append(dict(requirement_id=req.id,field='analysis_kind',rule='governed_observational_pair'))
        if req.analysis_kind=='ranking' and 'ranking' not in methods and not anchors['rankings'] and not features.intersection({'leader','top_gap','selected_total'}):
            parent=next((p for p in result.requirements if p.id!=req.id and p.availability=='requested' and not p.supporting_for
                         and p.analysis_kind=='aggregate' and not p.dimension_ids and set(req.metric_ids)<=set(p.metric_ids)
                         and p.time==req.time and p.filters==req.filters),None)
            if parent and not anchors['dimensions']:
                req.supporting_for=parent.id
                changes.append(dict(requirement_id=req.id,field='supporting_for',rule='unrequested_ambiguous_ranking_is_optional'))
    return result,changes


def complete_explicit_time(intent, anchors):
    """Inherit one unambiguous common window; never overwrite supplied scope.

    UI scope is applied separately by the resolver. Multiple distinct windows
    remain requirement-specific and require interpretation, not this rule.
    """
    from services.analysis_contract import TimeSpec
    if anchors['ui'].get('required_period'):
        return intent, []
    times = {str(sorted(t.items())): t for t in anchors.get('times', [])}
    if len(times) != 1:
        return intent, []
    scope = TimeSpec.model_validate(next(iter(times.values())))
    result, changes = intent.model_copy(deep=True), []
    for req in result.requirements:
        if req.availability == 'requested' and req.time is None:
            req.time = scope.model_copy(deep=True)
            changes.append(dict(requirement_id=req.id, field='time',
                rule='unambiguous_common_request_time', value=scope.model_dump(exclude_none=True)))
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


def normalize_explicit_grains(intent, anchors, catalog):
    """Correct an unapproved draft from unique clause facts, never AI labels.

    This changes grouping only. Conflicting/ambiguous clauses, explicit
    partitions and all approved/refined meaning remain strict repair targets.
    """
    result,changes=intent.model_copy(deep=True),[]
    equivalent=metric_equivalents(catalog)
    for req in result.requirements:
        if req.availability!='requested' or req.supporting_for:continue
        metrics={m for id in req.metric_ids for m in equivalent.get(id,{id})}
        if (req.ranking and req.analysis_kind=='aggregate' and not req.ranking.metric_id and
                anchors.get('rankings') and not any((r['direction'],r['limit'])==
                (req.ranking.direction,req.ranking.limit) for r in anchors['rankings']) and
                any(metrics.intersection(b['metric_candidates']) for b in anchors.get('clause_bindings',[]))):
            changes.append(dict(requirement_id=req.id,field='ranking',
                rule='unrequested_criterionless_ranking',previous=req.ranking.model_dump(mode='json'),value=None))
            req.ranking=None
        expected=[]
        if req.ranking:
            for rank in anchors['rankings']:
                if rank.get('dimension_id') and not rank.get('partition_requested') and not req.ranking.per_group and (
                    rank['direction'],rank['limit'])==(req.ranking.direction,req.ranking.limit) and (
                    not rank.get('metric_id') or rank['metric_id'] in equivalent.get(req.ranking.metric_id,{req.ranking.metric_id})):
                    expected.append([rank['dimension_id']])
        elif req.analysis_kind=='trend':
            expected=[b['dimension_ids'] for b in anchors.get('trend_bindings',[]) if
                b['granularity']==req.granularity and metrics.intersection(b['metric_candidates'])]
        elif req.dimension_ids:
            expected=[[b['dimension_id']] for b in anchors.get('clause_bindings',[]) if
                b['dimension_id'] in req.dimension_ids and metrics.intersection(b['metric_candidates'])]
        unique={tuple(sorted(ds)) for ds in expected}
        if len(unique)==1:
            axes=list(next(iter(unique)))
            # A cadence-only clause says WHEN to compare, not which selected
            # entity to erase. The selector needs its one entity axis to score
            # history; a plain ungrouped trend keeps the existing normalization.
            if not axes and req.selection and len(req.dimension_ids)==1:
                axes=list(req.dimension_ids)
            identities={catalog.registry['dimensions'].get(d,{}).get('identity') for d in axes}
            if set(req.dimension_ids)-identities!=set(axes):
                changes.append(dict(requirement_id=req.id,field='dimension_ids',
                    rule='unique_explicit_clause_grain',previous=req.dimension_ids,value=axes))
                req.dimension_ids=axes
    return result,changes


def normalize_explicit_metrics(intent, anchors, catalog):
    """Remove draft companions only when the user's matching clause is exact.

    Union all clauses for the same axis/cadence so separately requested metrics
    and explicit ranking companions survive. Ambiguous or unbound KPIs stay
    untouched. This is primary-draft normalization, never approved-plan editing.
    """
    result,changes=intent.model_copy(deep=True),[]
    equivalent=metric_equivalents(catalog)
    for req in result.requirements:
        if req.availability!='requested' or req.supporting_for:continue
        if any(f in req.derived_features and (not targets or not set(targets)<=set(req.metric_ids))
               for f,targets in req.feature_metrics.items()):continue
        bindings=[]
        if req.ranking:
            bindings=[r for r in anchors.get('rankings',[]) if
                r.get('dimension_id') in req.dimension_ids and not r.get('partition_requested') and
                not req.ranking.per_group and (r['direction'],r['limit'])==
                (req.ranking.direction,req.ranking.limit) and
                (r.get('metric_id') in equivalent.get(req.ranking.metric_id,{req.ranking.metric_id}) or
                 req.ranking.metric_id in r.get('metric_candidates',[]))]
        elif req.analysis_kind=='trend':
            bindings=[b for b in anchors.get('trend_bindings',[]) if
                b['granularity']==req.granularity and set(b['dimension_ids'])==set(req.dimension_ids)]
        elif len(req.dimension_ids)==1 and (req.analysis_kind=='distribution' or any(
                r.id!=req.id and r.analysis_kind=='aggregate' and not r.dimension_ids and not r.ranking and
                'scalar' in r.derived_features and set(req.metric_ids)<=set(r.metric_ids)
                for r in result.requirements)):
            bindings=[b for b in anchors.get('clause_bindings',[]) if b['dimension_id']==req.dimension_ids[0]]
        candidates={m for b in bindings for m in b.get('metric_candidates',[])}
        retained=[m for m in req.metric_ids if equivalent.get(m,{m}) & candidates]
        if not retained or len(retained)==len(req.metric_ids):continue
        # A later sentence can request a ranking companion. Never remove its
        # sole representation from the draft merely because the Top N clause
        # mentioned only the ordering metric.
        mentioned={m for a in anchors.get('metrics',[]) for m in a['candidate_ids']}
        elsewhere={a for r in result.requirements if r.id!=req.id and r.availability=='requested'
                   for m in r.metric_ids for a in equivalent.get(m,{m})}
        if any((equivalent.get(m,{m}) & mentioned)-elsewhere for m in set(req.metric_ids)-set(retained)):continue
        if req.ranking and req.ranking.metric_id not in retained:continue
        previous=req.metric_ids
        req.metric_ids=retained
        for feature,targets in list(req.feature_metrics.items()):
            selected=[m for m in targets if m in retained]
            if selected:req.feature_metrics[feature]=selected
            else:req.feature_metrics.pop(feature)
        changes.append(dict(requirement_id=req.id,field='metric_ids',
            rule='unique_explicit_clause_metrics',previous=previous,value=retained))
    # A whole extra requirement that repeats another one with only a specialized sibling of
    # a canonical phrase ("doanh thu" -> store_revenue) is a duplicate unless the user named it.
    from services.semantic_preflight_contract import metric_locks
    named={a['candidate_ids'][0] for a in anchors.get('metrics',[]) if len(a['candidate_ids'])==1}
    siblings_of={}
    for lock in metric_locks(anchors,catalog.registry):
        for m in lock['siblings']:
            if m not in named:siblings_of.setdefault(m,set()).add(lock['metric_id'])
    def shape(r):
        # The ranking criterion is the duplicated metric itself (I16: Bottom 5 by store_revenue
        # beside Bottom 5 by revenue), so it is compared without its metric id.
        data=r.model_dump(exclude={'id','goal','metric_ids','feature_metrics','derived_features','domain_id','lens_hint'})
        if data.get('ranking'):data['ranking']={k:v for k,v in data['ranking'].items() if k!='metric_id'}
        return data
    drop=set()
    for req in result.requirements:
        if req.availability!='requested' or req.supporting_for or req.id in drop or not req.metric_ids:continue
        if not all(m in siblings_of for m in req.metric_ids):continue
        twin=next((o for o in result.requirements if o.id!=req.id and o.id not in drop and o.availability=='requested'
            and not o.supporting_for and shape(o)==shape(req) and
            all(any(k in siblings_of[m] for k in o.metric_ids) for m in req.metric_ids)),None)
        if twin:
            drop.add(req.id)
            changes.append(dict(requirement_id=req.id,field='requirements',
                rule='unrequested_sibling_metric_duplicate',previous=req.metric_ids,value=twin.id))
    if drop:
        result.requirements=[r for r in result.requirements if r.id not in drop and r.supporting_for not in drop]
    return result,changes


def verify_anchors(anchors, requirements, reference, catalog):
    from services.time_resolution_service import resolve_time
    from services.scope_resolution_service import scope_issues
    issues = scope_issues(anchors.get("scope_resolution") or {}, requirements, catalog, anchors.get("ui"))
    for expected in population_filters(anchors,catalog):
        selected=set(expected['value'] if isinstance(expected['value'],list) else [expected['value']])
        for req in requirements:
            if req.availability!='requested': continue
            present=[f for f in req.filters if f.dimension==expected['dimension']]
            if not present or any(f.operator not in {'eq','in'} or set(f.value if isinstance(f.value,list) else [f.value])!=selected for f in present):
                issues.append(dict(requirement_id=req.id,field='filters',code='population_filter_mismatch',expected=expected))
    requirements = [r for r in requirements if not r.supporting_for]
    requested = [r for r in requirements if r.availability == "requested"]
    from services.mission_contract_service import allows_current_risk_snapshot
    def current_snapshot(req):
        return (req.time is not None and req.time.kind == 'relative' and req.time.mode == 'all_time'
                and allows_current_risk_snapshot(anchors.get('ui') or {}, catalog.registry['metrics'], req.metric_ids))
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
        for f in req.filters:
            if f.dimension not in excluded or any(v['dimension']==f.dimension for v in anchors['values']):
                continue
            ui_filters=[*(anchors['ui'].get('required_filters') or []),
                *([anchors['ui']['required_filter']] if anchors['ui'].get('required_filter') else [])]
            if any(isinstance(v,dict) and v.get('dimension')==f.dimension for v in ui_filters):
                continue
            # Repeating an authoritative catalog population is harmless ONLY
            # when it is redundant for every selected metric, including counts.
            def redundant(metric):
                defaults=catalog.registry['metrics'].get(metric,{}).get('business_filters',[])
                return any(e.get('dimension')==f.dimension and e.get('operator','eq')==f.operator and
                    set(e['value'] if isinstance(e['value'],list) else [e['value']]) ==
                    set(f.value if isinstance(f.value,list) else [f.value]) for e in defaults)
            if not req.metric_ids or not all(redundant(m) for m in req.metric_ids):
                issues.append(dict(requirement_id=req.id,field='filters',
                    code='population_disclosure_used_as_filter',dimension=f.dimension))
    selected = {m for req in requested for m in req.metric_ids if m in catalog.registry['metrics']}
    equivalent = metric_equivalents(catalog)
    def covers(req, metric):
        if any(metric in equivalent.get(m, {m}) for m in req.metric_ids):
            return True
        coverage = catalog.registry['metrics'].get(metric, {}).get('coverage_equivalent')
        return bool(coverage and coverage['metric_id'] in req.metric_ids and all(
            any(f.dimension == e['dimension'] and f.operator in {'eq','in'} and
                (f.value if isinstance(f.value,list) else [f.value]) == [e['value']] for f in req.filters)
            for e in coverage['filters']))
    def axes(dimensions):
        result=set(dimensions)
        identities={catalog.registry['dimensions'].get(d,{}).get('identity') for d in result}
        return result-identities
    compared={b.get('comparison_dimension') for b in (anchors.get('scope_resolution') or {}).get('bindings',[])
              if b.get('comparison') and b.get('comparison_dimension')}
    def matches_grain(dimensions, expected):
        # The comparison member is an additional axis, not a replacement for the requested breakdown.
        actual=axes(dimensions)
        expected=axes(expected)
        return actual==expected or (bool(actual & compared) and actual-compared==expected-compared)
    for binding in anchors.get('clause_bindings', []):
        candidates = set(binding['metric_candidates'])
        eligible=[req for req in requested if not req.ranking and req.analysis_kind!='trend' and
            any(covers(req,m) for m in candidates)]
        if not any(matches_grain(req.dimension_ids,[binding['dimension_id']]) for req in eligible):
            wrong=[req for req in eligible if binding['dimension_id'] in req.dimension_ids]
            if wrong:
                issues.extend(dict(requirement_id=req.id,field='dimension_ids',code='explicit_grouping_grain_mismatch',
                    expected=[binding['dimension_id']]) for req in wrong)
                continue
            def duplicate_kpi(req):
                return any(other.id!=req.id and not other.dimension_ids and not other.ranking and
                    other.analysis_kind=='aggregate' and set(other.metric_ids)==set(req.metric_ids) and
                    other.time==req.time and sorted(f.model_dump_json() for f in other.filters)==
                    sorted(f.model_dump_json() for f in req.filters) for other in requested)
            incomplete=[req for req in eligible if not req.dimension_ids and req.derived_features and
                ('scalar' not in req.derived_features or duplicate_kpi(req))]
            if incomplete:
                # Several incomplete siblings can share a metric. Expose their
                # missing axis fields together; do not assign an axis from AI
                # labels. Final verification still requires every user pairing.
                issues.extend(dict(requirement_id=req.id,field='dimension_ids',code='explicit_grouping_candidates',
                    candidate_ids=[binding['dimension_id']]) for req in incomplete)
            issues.append(dict(requirement_id=None, field='requirements', code='explicit_grouped_metric_missing',
                expected=binding))
    for binding in anchors.get('trend_bindings', []):
        eligible=[req for req in requested if req.analysis_kind=='trend' and
            req.granularity==binding['granularity'] and any(covers(req,m) for m in binding['metric_candidates'])]
        if not eligible:
            candidates=[req for req in requested if any(covers(req,m) for m in binding['metric_candidates'])]
            issues.append(dict(requirement_id=candidates[0].id if len(candidates)==1 else None,
                field='analysis_kind' if len(candidates)==1 else 'requirements',
                code='explicit_trend_missing',expected=binding))
        def expected_trend_grain(req):
            expected=list(binding['dimension_ids'])
            # Selection was materialized by the server before this check. Its
            # entity axis is part of the fixed cohort's trend, just as a named
            # comparison scope adds its member axis; cadence does not erase it.
            if req.selection and req.selection.selected_keys and req.selection.entity_dimension_id:
                expected=list(dict.fromkeys([*expected,req.selection.entity_dimension_id]))
            return expected
        # A governed cohort comparison ("của A và B") adds its member axis to the stated trend grain, never replaces it.
        if eligible and not any(matches_grain(req.dimension_ids,expected_trend_grain(req)) for req in eligible):
            issues.extend(dict(requirement_id=req.id,field='dimension_ids',code='explicit_trend_grain_mismatch',
                expected=expected_trend_grain(req)) for req in eligible)
    if not anchors['ui'].get('required_period'):
        for binding in anchors.get('time_bindings', []):
            period = resolve_time(binding['time'], reference, catalog.registry['timezone'])[2]
            eligible = [req for req in requested if not current_snapshot(req)
                        and any(covers(req,m) for m in binding['metric_candidates'])]
            if eligible and not any(req.time and resolve_time(req.time.model_dump(mode='json'),reference,
                    catalog.registry['timezone'])[2] == period for req in eligible):
                issues.append(dict(requirement_id=eligible[0].id,field='time',code='explicit_metric_time_mismatch',expected=binding['time']))
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
            # Metadata-declared conditional counts can be expressed by the
            # base count plus exactly the declared equality cohort.
            for metric, definition in catalog.registry['metrics'].items():
                coverage = definition.get('coverage_equivalent')
                if coverage and any(coverage['metric_id'] in req.metric_ids and all(
                    any(f.dimension == expected['dimension'] and f.operator in {'eq', 'in'} and
                        (f.value if isinstance(f.value, list) else [f.value]) == [expected['value']]
                        for f in req.filters) for expected in coverage['filters']) for req in requested):
                    represented.add(metric)
            # A component-only count named by the user ("số đơn hợp lệ") is represented by its requestable twin
            # plus exactly the component's governed business filters (analytical_resolver.component_twin).
            from services.analytical_resolver import component_twin
            for metric in catalog.registry['metrics']:
                found = component_twin(catalog.registry, metric)
                if found and any(found[0] in req.metric_ids and all(any(
                        f.dimension == b['dimension'] and sorted(map(str, f.value if isinstance(f.value, list) else [f.value]))
                        == sorted(map(str, b['value'] if isinstance(b['value'], list) else [b['value']])) for f in req.filters)
                        for b in found[1]) for req in requested):
                    represented.add(metric)
        if kind == "dimensions":
            represented.update(catalog.registry['dimensions'][d]['identity'] for r in requirements
                for d in r.dimension_ids if catalog.registry['dimensions'].get(d, {}).get('identity'))
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
        targets=[r for r in requested if r.ranking and (r.ranking.direction,r.ranking.limit)==
            (rank['direction'],rank['limit']) and (not rank.get('metric_id') or
                rank['metric_id'] in equivalent.get(r.ranking.metric_id,{r.ranking.metric_id}))]
        for req in targets:
            missing_companions=set(rank.get('companion_metric_ids',[]))-set(req.metric_ids)
            if missing_companions:
                issues.append(dict(requirement_id=req.id,field='metric_ids',code='explicit_ranked_companion_missing',
                    candidate_ids=sorted(missing_companions)))
            if rank.get('partition_dimensions') and set(req.ranking.per_group)!=set(rank['partition_dimensions']):
                issues.append(dict(requirement_id=req.id,field='ranking',code='explicit_ranking_partition_missing',expected=rank['partition_dimensions']))
            if req.ranking.per_group and rank.get('dimension_id') and not rank.get('partition_requested'):
                issues.append(dict(requirement_id=req.id,field='ranking',code='explicit_global_ranking_partitioned',expected=rank))
                # Normalization inferred axes from the wrong partition. Expose
                # both fields together so repair can preserve the ranked entity.
                if rank.get('dimension_id'):
                    issues.append(dict(requirement_id=req.id,field='dimension_ids',code='explicit_ranked_entity_required',
                        expected=[rank['dimension_id']]))
            elif rank.get('dimension_id') and axes(req.dimension_ids)!=axes([rank['dimension_id']]+
                    (req.ranking.per_group if rank.get('partition_requested') else [])):
                issues.append(dict(requirement_id=req.id,field='dimension_ids',code='explicit_ranked_entity_required',
                    expected=[rank['dimension_id']]))
    cadences={g for a in anchors.get('granularities',[]) for g in a['candidate_ids']}
    if len(cadences)==1:
        cadence=next(iter(cadences))
        for req in requested:
            if req.analysis_kind=='trend' and req.granularity!=cadence:
                issues.append(dict(requirement_id=req.id,field='granularity',
                                   code='explicit_granularity_missing',expected=cadence))
    if not anchors["ui"].get("required_period"):
        for comparison in anchors.get('period_comparisons',[]):
            baseline=resolve_time(comparison['baseline'],reference,catalog.registry['timezone'])[2]
            target=resolve_time(comparison['target'],reference,catalog.registry['timezone'])[2]
            if not any(req.comparison_time and set(comparison['metric_ids'])<=set(req.metric_ids)
                    and req.time and resolve_time(req.time.model_dump(mode='json'),reference,catalog.registry['timezone'])[2]==target
                    and resolve_time(req.comparison_time.model_dump(mode='json'),reference,catalog.registry['timezone'])[2]==baseline
                    for req in requested):
                issues.append(dict(requirement_id=None,field='requirements',code='explicit_period_comparison_missing',expected=comparison))
        expected_periods = [resolve_time(t,reference,catalog.registry['timezone'])[2] for t in anchors['times']]
        for req in requested:
            if req.comparison_time and expected_periods:
                baseline = resolve_time(req.comparison_time.model_dump(mode='json'),reference,catalog.registry['timezone'])[2]
                if baseline not in expected_periods or len(expected_periods)<2:
                    issues.append(dict(requirement_id=req.id,field='comparison_time',code='explicit_comparison_time_conflict'))
        for time in anchors["times"]:
            expected = resolve_time(time, reference, catalog.registry["timezone"])[2]
            # A repair cannot turn an explicit time window into all_time.
            scoped = [r for r in requested if not current_snapshot(r)] if len(anchors["times"]) == 1 else []
            if len(anchors["times"]) > 1 and not any(
                    part and resolve_time(part.model_dump(mode='json'),reference,catalog.registry['timezone'])[2] == expected
                    for r in requested for part in (r.time,r.comparison_time)):
                issues.append({"requirement_id":None,"field":"time","code":"explicit_time_missing","expected":time})
            for r in scoped:
                if not r.time or resolve_time(r.time.model_dump(mode="json"), reference, catalog.registry["timezone"])[2] != expected:
                    issues.append({"requirement_id": r.id, "field": "time", "code": "explicit_time_missing", "expected": time})
    for forecast in anchors.get('forecasts',[]):
        if not any(r.forecast and r.forecast.model_dump(mode='json')==forecast for r in requested):
            targets=[r for r in requirements if r.metric_ids and not r.forecast and any(
                set(r.metric_ids).intersection(a['candidate_ids']) for a in anchors['metrics'])]
            issues.append(dict(requirement_id=targets[0].id if len(targets)==1 else None,
                field='forecast',code='explicit_forecast_missing',expected=forecast))
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
    from services.analysis_intent import apply_delta
    from services.analytical_resolver import ResolutionIssues
    from services.time_resolution_service import resolve_time
    intent = AnalysisIntentEnvelope.model_validate(initial_intent)
    anchors = request_anchors(original, catalog, ui)
    if verify_anchors(anchors, intent.requirements, reference, catalog):
        raise ValueError('Initial request meaning does not cover exact anchors')
    if len(history) > 20:
        raise ValueError('Semantic refinement history exceeds bound')
    fields = {'metric_ids':'metrics', 'dimension_ids':'dimensions','forecast':'forecasts',
              'derived_features':'features', 'ranking':'rankings', 'time':'times', 'comparison_time':'times', 'filters':'values',
              'granularity':'granularities'}
    workspace_root = None
    workspace_anchors = None
    for entry in history:
        if 'interaction' in entry:
            from services.workspace_service import workspace_base, workspace_intent
            if workspace_root is None:
                workspace_root = workspace_base(intent.model_dump(mode='json'))
                workspace_anchors = deepcopy(anchors)
            anchors = deepcopy(workspace_anchors)
            after = workspace_intent(workspace_root, entry['interaction'], catalog, reference)
            filters = [f.model_dump(mode='json') for r in after.requirements for f in r.filters]
            anchors['ui']['required_filters'] = filters
            from services.scope_resolution_service import resolve_scope
            anchors['scope_resolution'] = resolve_scope('', catalog, anchors['ui'])
            selected_dims = {s['dimension_id'] for s in entry['interaction'].get('filters', [])} | {
                d['selection']['dimension_id'] for d in entry['interaction'].get('drill_path', [])}
            anchors['values'] = [a for a in anchors['values'] if a['dimension'] not in selected_dims]
            # The typed action may change grouping along a governed hierarchy.
            # Preserve all metric/time/population facts and original filters.
            if entry['interaction'].get('drill_path'):
                old_axes = {d for r in workspace_root['requirements'] for d in r['dimension_ids']}
                anchors['dimensions'] = [a for a in anchors['dimensions'] if not set(a['candidate_ids']) & old_axes]
                anchors['clause_bindings'] = [b for b in anchors.get('clause_bindings', []) if b['dimension_id'] not in old_axes]
            intent = after
            issues = verify_anchors(anchors, intent.requirements, reference, catalog)
            if issues: raise ResolutionIssues(issues)
            continue
        workspace_root = None
        feedback = request_anchors(entry['feedback'], catalog, ui)
        delta = AnalysisIntentDelta.model_validate(entry['delta'])
        prior = {r.id:r for r in intent.requirements}
        after = apply_delta(intent, entry['delta'])
        updated = {r.id:r for r in after.requirements}
        for change in delta.changes:
            before = prior.get(change.requirement_id)
            if not before:
                continue
            if change.action != 'remove' and change.requirement_id not in updated:
                # An updated parent invalidates its generated supporting views.
                # Their fields are reproduced from the parent by the resolver.
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
                if field in {'ranking','time','comparison_time','granularity','forecast'}:
                    protected = anchors[kind]
                elif field == 'filters':
                    protected = [a for a in anchors[kind] if any(a['dimension']==f.dimension for f in old)]
                else:
                    protected = [a for a in anchors[kind] if set(a['candidate_ids']) & set(old)]
                if protected and change.action != 'remove' and not feedback[kind]:
                    raise ResolutionIssues([{'requirement_id':change.requirement_id,'field':field,'code':'explicit_scope_change_unconfirmed'}])
                if field == 'ranking' and old:
                    protected = [a for a in protected if (a['direction'],a['limit']) == (old.direction,old.limit)]
                if field in {'time','comparison_time'} and old:
                    period = resolve_time(old.model_dump(mode='json'),reference,catalog.registry['timezone'])[2]
                    protected = [a for a in protected if resolve_time(a,reference,catalog.registry['timezone'])[2] == period]
                anchors[kind] = [a for a in anchors[kind] if a not in protected]
                if field in {'metric_ids','dimension_ids','time','comparison_time'}:
                    anchors['period_comparisons']=[b for b in anchors.get('period_comparisons',[]) if not
                        (set(before.metric_ids) & set(b['metric_ids']) and field in {'metric_ids','time','comparison_time'})]
                    anchors['clause_bindings'] = [b for b in anchors.get('clause_bindings', [])
                        if not (set(before.metric_ids) & set(b['metric_candidates']) and
                            b['dimension_id'] in before.dimension_ids and field in {'metric_ids','dimension_ids'})]
                    anchors['time_bindings'] = [b for b in anchors.get('time_bindings', [])
                        if not (set(before.metric_ids) & set(b['metric_candidates']) and field in {'metric_ids','time'})]
                if field in {'metric_ids','dimension_ids','granularity'}:
                    anchors['trend_bindings']=[b for b in anchors.get('trend_bindings',[]) if not
                        (before.analysis_kind=='trend' and before.granularity==b['granularity'] and
                         set(before.metric_ids) & set(b['metric_candidates']))]
        for kind in (*fields.values(), 'capabilities', 'population_scopes', 'excluded_values', 'clause_bindings', 'time_bindings', 'trend_bindings','period_comparisons'):
            for anchor in feedback[kind]:
                if anchor not in anchors[kind]:
                    anchors[kind].append(deepcopy(anchor))
        # Explicit user scope is a verification constraint even when a model
        # returns a no-op. Otherwise missing geography becomes a global value
        # error with no repair target, freezing every legitimate filter field.
        if feedback.get('scope_resolution',{}).get('bindings'):
            anchors['scope_resolution']=deepcopy(feedback['scope_resolution'])
        if feedback.get('analysis_breadth'):
            anchors['analysis_breadth']=feedback['analysis_breadth']
        intent = after
        issues = verify_anchors(anchors,intent.requirements,reference,catalog)
        if issues:
            raise ResolutionIssues(issues)
    return anchors, intent


def enforce_ui(artifacts, context):
    from services.analysis_catalog import AnalysisError
    from services.analysis_contract import equivalent_filter
    for a in artifacts.values():
        period = context.get("required_period")
        from services.mission_contract_service import allows_current_risk_snapshot
        current_snapshot = bool(context.get('risk_snapshot_metrics')) and a.grounded.period['start'] is None and a.grounded.period['end'] is None and allows_current_risk_snapshot(
            context, getattr(a.grounded, 'metrics', {}), getattr(a.query, 'metrics', []))
        if period and any(
            a.grounded.period[k] != period[k] for k in ("start", "end")
        ) and not current_snapshot:
            raise AnalysisError(
                "time_range_ambiguous", "Analysis conflicts with selected UI period"
            )
        required = context.get("required_filter")
        actual=[f.model_dump(mode='json') for f in a.query.filters]
        if required and not any(equivalent_filter(required,f) for f in actual):
            raise AnalysisError(
                "clarification", "Analysis omitted selected UI population"
            )
        if any(not any(equivalent_filter(f,v) for v in actual) for f in context.get("required_filters", [])):
            raise AnalysisError("query_scope", "Analysis conflicts with selected UI population")
        if context.get("scope_mode") == "all" and a.query.filters:
            raise AnalysisError("query_scope", "Analysis narrowed the selected entire-system population")
