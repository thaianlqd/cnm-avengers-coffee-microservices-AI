"""Re-aggregation proved from governed component expressions and populations."""
import sqlglot
from sqlglot import exp


def cohort_rollup(catalog, metric_id):
    metrics = catalog.registry['metrics']
    metric = metrics[metric_id]
    if metric.get('additive'):
        return {'metrics': [metric_id], 'expression': exp.Sum(this=exp.column(metric_id, table='s'))}
    if metric.get('aggregation_semantics') == 'distinct_count':
        tree = sqlglot.parse_one(metric['expression'], read='postgres')
        if isinstance(tree, exp.Count) and isinstance(tree.this, exp.Distinct):
            # Counts over overlapping entities must run on raw selected rows,
            # never on a sum of the counts grouped by each ranked key.
            return {'metrics': [metric_id], 'raw_population': True}
    components = metric.get('components') or {}
    ids = [components.get('numerator_metric'), components.get('denominator_metric')]
    if not all(ids) or len(set(ids)) != 2:
        return None
    population_fields = ('source', 'grain', 'time_column', 'business_filters', 'required_non_null')
    definitions = [metrics.get(mid, {}) for mid in ids]
    if any(not definition.get('additive') or any(definition.get(k) != metric.get(k)
            for k in population_fields) for definition in definitions):
        return None
    expressions = [sqlglot.parse_one(d['expression'], read='postgres') for d in definitions]
    # DISTINCT aggregates cannot be summed across the additional grouping keys.
    if any(tree.find(exp.Distinct) for tree in expressions):
        return None
    used = set()

    def replace(node):
        for mid, component in zip(ids, expressions):
            if node == component:
                used.add(mid)
                return exp.Sum(this=exp.column(mid, table='s'))
        return node

    tree = sqlglot.parse_one(metric['expression'], read='postgres').transform(replace)
    # Every raw aggregate/column must have been replaced by a declared component.
    if used != set(ids) or any(c.table != 's' or c.name not in ids for c in tree.find_all(exp.Column)):
        return None
    if any(not isinstance(a, exp.Sum) or not isinstance(a.this, exp.Column)
           or a.this.table != 's' for a in tree.find_all(exp.AggFunc)):
        return None
    return {'metrics': ids, 'expression': tree}
