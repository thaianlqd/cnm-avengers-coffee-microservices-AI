"""Server-owned data/transport budgets. Estimates never change denominators."""
import logging
import os
from dataclasses import asdict, dataclass
from datetime import date
from math import prod

logger = logging.getLogger('ai-analytics')


@dataclass(frozen=True)
class AnalyticalCapacityContract:
    execution_rows: int = 50000
    artifact_bytes: int = 64_000_000
    session_bytes: int = 1_000_000
    chart_points: int = 500
    response_bytes: int = 1_000_000
    operations: int = 8
    dimensions: int = 6  # includes server-added identity columns
    periods: int = 4000
    series: int = 16
    drilldown_rows: int = 200
    preview_rows: int = 50
    evidence_preview: int = 100
    artifact_ttl: int = 7200
    cache_freshness: int = 300

    @classmethod
    def from_env(cls):
        from services.analysis_catalog import AnalysisError
        values = {}
        for key, default in asdict(cls()).items():
            raw = os.getenv('DATA_ANALYST_CAPACITY_' + key.upper(), str(default))
            try:
                values[key] = int(raw)
                if values[key] <= 0 or values[key] > default * 10:
                    raise ValueError()
            except ValueError:
                raise AnalysisError('capacity_configuration', 'Invalid server capacity contract') from None
        return cls(**values)


def period_count(period, granularity):
    if not period.get('start') or not period.get('end'):
        return None
    start, end = (date.fromisoformat(period[k][:10]) for k in ('start', 'end'))
    if granularity == 'day':
        return (end-start).days + 1
    if granularity == 'week':
        return ((end-start).days + start.weekday()) // 7 + 1
    months = (end.year-start.year)*12 + end.month-start.month
    return months+1 if granularity == 'month' else months//3+2 if granularity == 'quarter' else end.year-start.year+1


class AnalyticalCapacityPlanner:
    def __init__(self, catalog, profiles=None, contract=None):
        self.catalog = catalog
        self.profiles = profiles or {}
        self.contract = contract or AnalyticalCapacityContract.from_env()

    def dimension_count(self, name, filters):
        from services.value_grounding_service import dimension_values
        desc = self.catalog.registry['dimensions'][name]
        identity = desc.get('identity') or name
        profile = self.profiles.get(identity, self.profiles.get(name, {}))
        count = profile.get('distinct_upper_bound') or desc.get('expected_cardinality')
        values = dimension_values(self.catalog, identity)
        if values:
            count = len(values)
        for f in filters:
            if f.dimension in {name, identity} and f.operator in {'eq', 'in'}:
                selected = len(set(f.value)) if f.operator == 'in' else 1
                count = min(count, selected) if count is not None else selected
        return count

    def plan(self, plan):
        from services.analysis_catalog import AnalysisError
        c = self.contract
        if len(plan.dimensions) > c.dimensions:
            raise AnalysisError('capacity_requires_choice', 'Too many analytical dimensions')
        # A label and its identity describe ONE axis, not a Cartesian product.
        axes = list(dict.fromkeys(self.catalog.registry['dimensions'][d].get('identity') or d for d in plan.dimensions))
        counts = [self.dimension_count(d, plan.filters) for d in axes]
        groups = prod(counts) if all(v is not None for v in counts) else None
        periods = period_count(plan.period, plan.granularity) if plan.kind == 'trend' else 1
        if periods is None and plan.kind == 'trend':
            profile = self.profiles.get(plan.time_column, {})
            periods = period_count({'start': profile.get('date_min'), 'end': profile.get('date_max')}, plan.granularity)
        rows = groups * periods if groups is not None and periods is not None else None
        if plan.kind == 'detail' or plan.explicit_limit or plan.ranking and not plan.ranking.per_group:
            rows = plan.row_limit
        elif plan.ranking:
            partitions = [self.dimension_count(d, plan.filters) for d in plan.ranking.per_group]
            rows = prod(partitions)*plan.ranking.top_n if all(v is not None for v in partitions) else None
        oversized = rows is not None and rows > c.execution_rows
        approximate = any(self.profiles.get(d, {}).get('approximate') for d in axes)
        if oversized and not approximate or periods is not None and periods > c.periods:
            error = AnalysisError('capacity_requires_choice', 'Explicit population requires capacity choice', choices=[
                {'label': 'Giảm số nhóm hoặc khoảng thời gian'},
                {'label': 'Chọn nhịp tuần/tháng cho toàn bộ phạm vi'}])
            error.estimated_rows = rows
            raise error
        large = rows is None or rows > c.preview_rows
        strategy = dict(estimated_groups=groups, estimated_periods=periods, estimated_dimensions=len(axes),
            estimated_series=groups, estimated_rows=rows, estimated_chart_points=rows,
            estimated_persisted_bytes=rows * max(128, len(plan.output_columns)*64) if rows is not None else None,
            estimated_queries=1, execution_strategy='FULL_RESULT',
            presentation_strategy='SUMMARY_PLUS_DRILLDOWN' if large else 'FULL_RESULT',
            artifact_strategy='IMMUTABLE_RESULT', computation_scope='FULL_QUERY_POPULATION',
            presentation_scope='BOUNDED_SUBSET' if large else 'FULL_RESULT',
            warnings=['CARDINALITY_UNKNOWN'] if rows is None else ['CAPACITY_PRESENTATION_REDUCED'] if large else [])
        logger.info('[CapacityPlan] %s', strategy)
        return strategy


def dry_analysis_plan(artifacts, coverage=(), bindings=(), plan_fingerprint=None):
    result = dict(plan_fingerprint=plan_fingerprint, query_count=len(artifacts),
        requirement_ids=[c['requirement_id'] for c in coverage], expected_derived_features=list(bindings),
        operations=[dict(operation_id=a.query.id, subject=a.query.subject, metrics=a.plan.metrics,
            dimensions=a.plan.dimensions, time=a.plan.period, filters=[f.model_dump(mode='json') for f in a.plan.filters],
            ranking=a.plan.ranking.model_dump(mode='json') if a.plan.ranking else None,
            capacity=a.capacity) for a in artifacts.values()])
    logger.info('[DryPlan] query_count=%s plan_fingerprint=%s', len(artifacts), plan_fingerprint)
    return result
