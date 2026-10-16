"""Startup logical validation, independent of physical warehouse availability."""
from typing import get_args
from services.analysis_catalog import AnalysisError, referenced_columns
from services.analysis_intent import DerivedFeature

FEATURE_SHAPES={'additive_metric_with_same_population_denominator','ranking','ranking_two_rows',
    'grouped_metric','two_complete_time_buckets','complete_additive_distribution','additive_ranking','paired_numeric_metrics'}
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
        r=overlay['analysis_registry'];metrics=r['metrics'];dims=r['dimensions'];subjects=r['subjects']
        tables=overlay['silver_tables']
        policy=r.get('dashboard_policy',{'minimum_views':4,'target_views':5})
        if (type(policy.get('minimum_views')) is not int or type(policy.get('target_views')) is not int or
            not 4<=policy['minimum_views']<=policy['target_views']<=r.get('max_charts',8)):
            raise ValueError('Invalid dashboard visual floor')
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
        for id,feature in r.get('derived_features',{}).items():
            if id not in get_args(DerivedFeature) or feature['shape'] not in FEATURE_SHAPES:
                raise ValueError('Broken derived feature shape')
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
        return True
    except (KeyError,ValueError,TypeError):
        raise AnalysisError('domain_metadata_invalid','Semantic catalog references or relationships are invalid') from None
