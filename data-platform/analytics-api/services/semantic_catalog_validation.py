"""Startup logical validation, independent of physical warehouse availability."""
from typing import get_args
from copy import deepcopy
import hashlib
import json
import re
from services.analysis_catalog import AnalysisError, referenced_columns
from services.analysis_intent import DerivedFeature

FEATURE_SHAPES={'additive_metric_with_same_population_denominator','ranking','ranking_two_rows',
    'grouped_metric','two_complete_time_buckets','complete_additive_distribution','additive_ranking','paired_numeric_metrics',
    'additive_change_decomposition_one_grouping'}
SOURCE_SCOPES={'FULL_FACT','FULL_AGGREGATE','FILTERED_MART','TOP_N_MART','SNAPSHOT','TIME_SERIES','PRESENTATION_ONLY'}
# Only complete populations may answer a governed metric. A Top-N or filtered
# mart answers its dashboard question, never a system-wide aggregate.
METRIC_SOURCE_SCOPES={'FULL_FACT','FULL_AGGREGATE','SNAPSHOT','TIME_SERIES'}
NON_ADDITIVE={'average','ratio'}


def validate_source_semantics(overlay, strict=False):
    """Source scope, presentation marts, ratio/time semantics. Raises ValueError."""
    r=overlay['analysis_registry'];tables=overlay['silver_tables'];metrics=r['metrics']
    for name,table in tables.items():
        scope=table.get('source_scope')
        if scope is None and strict or scope is not None and scope not in SOURCE_SCOPES:
            raise ValueError('Invalid source scope')
    marts=r.get('presentation_marts',{})
    for name,mart in marts.items():
        if name in tables or not name.startswith('gold.') or mart.get('source_scope') not in SOURCE_SCOPES:
            raise ValueError('Invalid presentation mart')
        if mart['source_scope'] in {'TOP_N_MART','FILTERED_MART','PRESENTATION_ONLY'} and mart.get('global_aggregate_safe') is not False:
            raise ValueError('Partial mart marked as global aggregate')
        if mart['source_scope']=='TOP_N_MART' and (type(mart.get('top_n')) is not int or mart['top_n']<1):
            raise ValueError('Top-N mart without declared N')
    for id,metric in metrics.items():
        scope=tables[metric['source']].get('source_scope')
        if scope is not None and scope not in METRIC_SOURCE_SCOPES:
            raise ValueError('Metric source is not a complete population')
        if metric.get('aggregation_semantics') in NON_ADDITIVE and metric.get('additive'):
            raise ValueError('Average or ratio declared additive')
        overlap=set(metric.get('additive_over') or [])&set(metric.get('non_additive_over') or [])
        if overlap:
            raise ValueError('Metric both additive and non-additive over the same axis')
        if (metric.get('additive_over') or metric.get('disjoint_partitions')) and metric.get('aggregation_semantics') in NON_ADDITIVE:
            raise ValueError('Average or ratio declares an additive axis')
        if metric.get('disjoint_partitions') and metric.get('aggregation_semantics')!='distinct_count':
            raise ValueError('Disjoint partitions only apply to distinct counts')
        if metric.get('aggregation_semantics')=='ratio':
            bounds=metric.get('value_range')
            if not isinstance(bounds,list) or len(bounds)!=2 or not all(isinstance(v,(int,float)) for v in bounds) or bounds[0]>=bounds[1]:
                raise ValueError('Ratio metric without value range')
        time=metric.get('time_column')
        if time:
            table=referenced_columns(time)[0][0]
            direct={j['to_table'] for j in tables[metric['source']].get('joins',[])}
            if table!=metric['source'] and table not in direct:
                raise ValueError('Time column outside metric source')
        if metric.get('historical_capability')=='snapshot' and time:
            raise ValueError('Snapshot metric declares history')
        # A snapshot source may only carry its own creation clock, never a
        # borrowed (joined) history that the snapshot cannot reproduce.
        if time and scope=='SNAPSHOT' and referenced_columns(time)[0][0]!=metric['source']:
            raise ValueError('Snapshot source declares joined history')
        forecast=metric.get('forecast')
        if forecast is not None:
            cadences=forecast.get('cadences',[])
            if forecast.get('forecastable') is not True or not time or metric.get('historical_capability')!='historical':
                raise ValueError('Forecast without governed time series')
            if not metric.get('additive') or forecast.get('aggregation')!='sum':
                raise ValueError('Forecast requires an additive summed series')
            if not cadences or not set(cadences)<={'day','week','month'} or forecast.get('missing_data_policy') not in {'zero_fill'}:
                raise ValueError('Invalid forecast cadence or missing-data policy')
            for field in ('min_history','max_horizon'):
                bounds=forecast.get(field,{})
                if set(bounds)!=set(cadences) or any(type(n) is not int or n<1 for n in bounds.values()):
                    raise ValueError('Invalid forecast bounds')
            if any(forecast['max_horizon'][c]>forecast['min_history'][c]*2 for c in cadences):
                raise ValueError('Forecast horizon exceeds supported history ratio')
        for expression in [metric['expression'],time,*metric.get('required_non_null',[])]:
            if expression and any(t in marts for t,c in referenced_columns(expression)):
                raise ValueError('Metric reads a presentation mart')


def registry_drift(catalog):
    """Logical registry references absent from the current physical warehouse."""
    issues=[]
    physical={n:{c['name'] for c in t['columns']} for n,t in catalog.tables.items()}
    def check(kind,id,expression):
        for table,column in referenced_columns(expression):
            if table not in physical:
                issues.append(dict(kind=kind,id=id,code='missing_table',table=table))
            elif column not in physical[table]:
                issues.append(dict(kind=kind,id=id,code='missing_column',table=table,column=column))
    r=catalog.registry
    for id,m in r['metrics'].items():
        for e in [m['expression'],m.get('time_column'),*m.get('required_non_null',[])]:
            if e:check('metric',id,e)
    for id,d in r['dimensions'].items():
        check('dimension',id,d.get('expression') or d['table']+'.'+d['column'])
    for name,t in catalog.overlay['silver_tables'].items():
        for j in t.get('joins',[]):check('join',name+'->'+j['to_table'],j['on'])
    unique=[]
    for i in issues:
        if i not in unique:unique.append(i)
    return unique


def validate_catalog(overlay, strict=False):
    try:
        validate_source_semantics(overlay, strict)
        validate_governance(overlay, required=strict)
        r=overlay['analysis_registry'];metrics=r['metrics'];dims=r['dimensions'];subjects=r['subjects']
        tables=overlay['silver_tables']
        policy=r.get('dashboard_policy',{'minimum_views':4,'target_views':5})
        if (type(policy.get('minimum_views')) is not int or type(policy.get('target_views')) is not int or
            not 0<=policy['minimum_views']<=policy['target_views']<=r.get('max_charts',8)):
            raise ValueError('Invalid dashboard visual floor')
        if type(policy.get('narrow_top_n',5)) is not int or not 1<=policy.get('narrow_top_n',5)<=10:
            raise ValueError('Invalid narrow Top N policy')
        seen_pairs=set()
        for pair in r.get('governed_pairs',[]):
            ms=pair.get('metrics',[])
            if (not pair.get('id') or pair['id'] in seen_pairs or len(ms)!=2 or len(set(ms))!=2 or not set(ms)<=metrics.keys()
                    or not pair.get('key') or not set(pair['key'])<=dims.keys() or pair.get('label_dimension') not in dims
                    or type(pair.get('min_pairs',3)) is not int or pair.get('min_pairs',3)<3):
                raise ValueError('Invalid governed pair')
            seen_pairs.add(pair['id'])
        for id,subject in subjects.items():
            if subject['source'] not in tables or not set(subject['metrics'])<=metrics.keys() or not set(subject.get('detail_columns',[]))<=dims.keys() or subject['default_dimension'] not in dims:
                raise ValueError('Broken subject references')
        for id,metric in metrics.items():
            if not set(metric['subjects'])<=subjects.keys() or metric['source'] not in tables or not metric.get('unit'):
                raise ValueError('Broken metric references')
            if not set(metric.get('compatible_dimensions',dims))<=dims.keys():
                raise ValueError('Broken metric dimensions')
            if any(f['dimension'] not in dims for f in metric.get('business_filters',[])):
                raise ValueError('Broken population filters')
            coverage = metric.get('coverage_equivalent')
            if coverage:
                base = metrics[coverage['metric_id']]
                filters = coverage['filters']
                if (len(filters) != 1 or metric.get('aggregation_semantics') != 'conditional_count'
                    or base['expression'] != 'COUNT(*)' or any(metric.get(k) != base.get(k)
                        for k in ('source','grain','time_column','business_filters','required_non_null'))):
                    raise ValueError('Invalid conditional metric equivalence')
                d = dims[filters[0]['dimension']]; value = filters[0]['value']
                expected = "COUNT(*) FILTER (WHERE " + d['table'] + '.' + d['column'] + " = '" + str(value).replace("'", "''") + "')"
                if d['table'] != base['source'] or value not in d.get('enum', []) or metric['expression'] != expected:
                    raise ValueError('Unproven conditional metric equivalence')
            for expression in [metric['expression'],metric.get('time_column'),*metric.get('required_non_null',[])]:
                if expression and any(t not in tables for t,c in referenced_columns(expression)):
                    raise ValueError('Unapproved expression source')
        for dim in dims.values():
            phrases = dim.get('non_filter_phrases', [])
            if not isinstance(phrases, list) or len(phrases)>64 or any(not isinstance(p,str) or not 3<=len(p)<=200 for p in phrases):
                raise ValueError('Invalid descriptive value phrases')
            aliases=dim.get('ranking_entity_aliases',[])
            if not isinstance(aliases,list) or len(aliases)>32 or any(not isinstance(a,str) or not 3<=len(a)<=100 for a in aliases):
                raise ValueError('Invalid ranked entity aliases')
            if dim.get('logical_type') not in {None,'category','cyclic','identity','number','date'}:
                raise ValueError('Invalid logical dimension type')
            if dim.get('derived_scope_dimension'):
                from services.scope_resolution_service import grouping_expression
                base=dims[dim['derived_scope_dimension']]
                expected=grouping_expression(base['table']+'.'+base['column'],base['value_groups'])
                if dim.get('expression')!=expected:
                    raise ValueError('Reporting geography expression differs from governed membership')
            if dim['table'] not in tables or dim.get('identity') and dim['identity'] not in dims:
                raise ValueError('Broken dimension references')
            # Governed derived dimensions (hour, weekday) stay on their own
            # physical table; only aggregate labels may coalesce a joined key.
            if dim.get('expression') and ({t for t,c in referenced_columns(dim['expression'])}!={dim['table']}
                    or dim['column'] not in {c for t,c in referenced_columns(dim['expression'])}):
                raise ValueError('Derived dimension outside its physical column')
            if dim['column'] not in tables[dim['table']].get('columns', {dim['column']: None}):
                raise ValueError('Dimension column is not declared on its table')
            for group in dim.get('value_groups',[]):
                if not group.get('aliases') or not group.get('values') or not set(group['values'])<=set(dim.get('enum',[])):
                    raise ValueError('Broken population value groups')
            if dim.get('scope_governed'):
                from services.value_grounding_service import value_text
                groups=dim.get('value_groups',[])
                if any(not g.get('id') or not g.get('source') or (type(g.get('version')) is not int or g['version']<1) for g in groups):
                    raise ValueError('Scope groups require identity and version')
                aliases={}
                covered=set()
                for g in groups:
                    members=set(g['values'])
                    for a in g['aliases']:
                        a=value_text(a)
                        if a in aliases and aliases[a]!=members: raise ValueError('Scope alias collision')
                        aliases[a]=members
                    if g.get('primary'):
                        if covered & members: raise ValueError('Overlapping primary geography')
                        covered.update(members)
                if covered!=set(dim.get('enum',[])): raise ValueError('Incomplete primary geography')
                for g in groups:
                    if g.get('parent'):
                        parent=next((p for p in groups if p['id']==g['parent']),None)
                        if not parent or not set(g['values'])<=set(parent['values']): raise ValueError('Invalid geography subset')
        for id,feature in r.get('derived_features',{}).items():
            if id not in get_args(DerivedFeature) or feature['shape'] not in FEATURE_SHAPES:
                raise ValueError('Broken derived feature shape')
            if feature.get('default_dimension') and feature['default_dimension'] not in dims:
                raise ValueError('Broken default feature grouping')
        for field in ('equivalent_metric_groups','metric_concept_groups'):
            if any(len(group)<2 or len(group)!=len(set(group)) or not set(group)<=metrics.keys() for group in r.get(field,[])):
                raise ValueError('Broken metric alias groups')
        for source,table in tables.items():
            for edge in table.get('joins',[]):
                target=edge['to_table']
                refs=referenced_columns(edge['on'])
                if target not in tables or edge.get('join_type','INNER') not in {'INNER','LEFT'} or {t for t,c in refs}!={source,target}:
                    raise ValueError('Broken relationship')
                # The catalog also documents reverse one-to-many relationships.
                # Those are never compiler join candidates; at least one endpoint
                # must be a declared key. Compiler still authorizes only a unique
                # TARGET (many-to-one), independently checked physically.
                if ({c for t,c in refs if t==target}!=set(tables[target].get('primary_key',[])) and
                    {c for t,c in refs if t==source}!=set(table.get('primary_key',[]))):
                    raise ValueError('Unsafe relationship target')
        from services.domain_intelligence_service import validate_profiles
        validate_profiles(r)
        from services.workspace_service import validate_workspace
        validate_workspace(r)
        from services.mission_contract_service import validate_contracts
        validate_contracts(r)
        from services.semantic_preflight_contract import validate_alias_policy
        validate_alias_policy(r)
        budgets=policy.get('depth_budgets',{})
        if budgets and (set(budgets)!={'focused','deep','comprehensive'} or any(
                type(b.get('minimum_views')) is not int or type(b.get('max_supporting_operations')) is not int
                or not 0<=b['minimum_views']<=r.get('max_charts',8) for b in budgets.values())):
            raise ValueError('Invalid analysis depth budgets')
        return True
    except (KeyError,ValueError,TypeError):
        raise AnalysisError('domain_metadata_invalid','Semantic catalog references or relationships are invalid') from None


def validate_governance(overlay, required=False):
    """Legacy overlays remain readable; governed releases validate every owner/ID."""
    governance = overlay.get('governance')
    if governance is None:
        # Pre-V3.4 contracts are valid legacy inputs, never retroactively certified.
        return 'legacy'
    if (not isinstance(governance, dict) or not isinstance(governance.get('contract_version'), str)
            or not re.fullmatch(r'\d+\.\d+\.\d+', governance['contract_version'])):
        raise ValueError('Invalid governance contract version')
    registry = overlay['analysis_registry']
    for group in ('metrics', 'dimensions', 'subjects'):
        for identity, definition in registry[group].items():
            if not re.fullmatch(r'[a-z][a-z0-9_]*', identity):
                raise ValueError('Unstable semantic identifier')
            owner = definition.get('owner', governance.get('default_owner') if not required else None)
            if not isinstance(owner, str) or not re.fullmatch(r'[A-Za-z][A-Za-z0-9_.-]{1,100}', owner):
                raise ValueError('Semantic definition has no governed owner')
            lifecycle = definition.get('lifecycle', {'status': 'active'} if not required else {})
            if not isinstance(lifecycle, dict) or lifecycle.get('status') not in {'active', 'deprecated'}:
                raise ValueError('Invalid semantic lifecycle')
            replacement = lifecycle.get('replacement_id')
            if replacement is not None and (replacement == identity or replacement not in registry[group]):
                raise ValueError('Broken semantic replacement identity')
            if lifecycle['status'] == 'deprecated' and not lifecycle.get('deprecated_in'):
                raise ValueError('Deprecation release missing')
    return 'governed'


def semantic_projection(overlay):
    """Additional identity for impact analysis; does NOT replace legacy approval hashes.

    Unknown fields are conservatively retained. In particular business_name and
    aliases are language anchors, not cosmetic display labels.
    """
    result = deepcopy(overlay)
    result.pop('governance', None)
    for group in ('metrics', 'dimensions', 'subjects'):
        for definition in result.get('analysis_registry', {}).get(group, {}).values():
            for field in ('owner', 'display_label', 'documentation_url', 'reviewed_at'):
                definition.pop(field, None)
    return result


def semantic_fingerprint(overlay):
    return hashlib.sha256(json.dumps(semantic_projection(overlay), sort_keys=True, ensure_ascii=False,
                                     separators=(',', ':'), allow_nan=False).encode()).hexdigest()


def contract_diff(before, after):
    """Conservative contract impact report, derived from the single runtime catalog."""
    changes = []
    impacted = set()
    br, ar = before.get('analysis_registry', {}), after.get('analysis_registry', {})
    for group in ('metrics', 'dimensions', 'subjects'):
        old, new = br.get(group, {}), ar.get(group, {})
        for identity in sorted(old.keys() | new.keys()):
            if identity not in old or identity not in new:
                kind = 'compatible_addition' if identity in new else 'breaking_removal'
                changes.append({'group': group, 'id': identity, 'kind': kind, 'fields': ['definition']})
                impacted.add((group, identity))
                continue
            fields = sorted(k for k in old[identity].keys() | new[identity].keys() if old[identity].get(k) != new[identity].get(k))
            if not fields:
                continue
            if set(fields) <= {'display_label', 'documentation_url', 'reviewed_at'}:
                kind = 'presentation'
            elif set(fields) <= {'owner', 'display_label', 'documentation_url', 'reviewed_at'}:
                kind = 'governance'
            else:
                kind = 'semantic_change'
                impacted.add((group, identity))
            changes.append({'group': group, 'id': identity, 'kind': kind, 'fields': fields})
    # Rules/taxonomy/source schemas outside individual definitions can affect all
    # capabilities. Never call an unknown change presentation-only.
    old_rest, new_rest = deepcopy(before), deepcopy(after)
    for value in (old_rest, new_rest):
        value.pop('governance', None)
        registry = value.get('analysis_registry', {})
        for group in ('metrics', 'dimensions', 'subjects'):
            registry.pop(group, None)
    global_change = old_rest != new_rest
    if global_change:
        changes.append({'group': 'catalog', 'id': '*', 'kind': 'semantic_change', 'fields': ['global_rules_or_sources']})
    metric_ids = {identity for group, identity in impacted if group == 'metrics'}
    dimensions = {identity for group, identity in impacted if group == 'dimensions'}
    subjects = {identity for group, identity in impacted if group == 'subjects'}
    for identity, metric in ar.get('metrics', {}).items():
        if global_change or set(metric.get('subjects', [])) & subjects:
            metric_ids.add(identity)
        if dimensions:
            # Missing explicit compatibility metadata is intentionally broad.
            if dimensions & set(metric.get('compatible_dimensions', ar.get('dimensions', {}))):
                metric_ids.add(identity)
    return {'version': 1, 'before_semantic_fingerprint': semantic_fingerprint(before),
            'after_semantic_fingerprint': semantic_fingerprint(after), 'changes': changes,
            'impacted_metric_ids': sorted(metric_ids),
            'requires_meaning_review': any(c['kind'] in {'semantic_change', 'breaking_removal'} for c in changes),
            'note': 'Additive shadow identity; legacy catalog/approval fingerprints remain authoritative.'}
