"""Startup logical validation, independent of physical warehouse availability."""
from typing import get_args
from services.analysis_catalog import AnalysisError, referenced_columns
from services.analysis_intent import DerivedFeature

FEATURE_SHAPES={'additive_metric_with_same_population_denominator','ranking','ranking_two_rows',
    'grouped_metric','two_complete_time_buckets','complete_additive_distribution','additive_ranking','paired_numeric_metrics'}


def validate_catalog(overlay):
    try:
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
        return True
    except (KeyError,ValueError,TypeError):
        raise AnalysisError('domain_metadata_invalid','Semantic catalog references or relationships are invalid') from None
