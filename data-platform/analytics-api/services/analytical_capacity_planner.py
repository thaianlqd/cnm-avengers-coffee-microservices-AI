"""Server-owned data/transport budgets. Estimates never change denominators."""
import logging
import os
from contextlib import contextmanager
from contextvars import ContextVar
from threading import Lock
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


request_sql_budget=ContextVar('analysis_request_sql_budget',default=None)
executor_sql_attempt=ContextVar('executor_sql_attempt',default=False)
reader_sql_kind=ContextVar('reader_sql_kind',default='direct_reader')


@contextmanager
def reader_query_kind(kind):
    if kind not in {'metadata','direct_reader'}:raise ValueError('Unknown reader SQL kind')
    token=reader_sql_kind.set(kind)
    try:yield
    finally:reader_sql_kind.reset(token)


class QueryBudget:
    """One shared reservation object across a request/job's SQL worker contexts.

    EXPLAIN consumes a separate physical attempt. Instrumented reader cursors
    include metadata and direct BI queries, excluding transaction controls.
    The existing operation/row/artifact contracts own these derived limits.
    """
    def __init__(self,contract=None):
        self.contract=contract
        self.limit=2*contract.operations+3 if contract is not None else None
        self.lock=Lock();self.records={};self.rows=0;self.bytes=0;self.limited=False

    def reserve(self,kind):
        if kind not in {'execute','dry_run','metadata','direct_reader'}:raise ValueError('Unknown SQL attempt kind')
        from services.analysis_catalog import AnalysisError
        with self.lock:
            if self.contract is None:
                # Lazy validation keeps liveness/auth/readiness available when
                # configuration is invalid, while SQL still fails before I/O.
                self.contract=AnalyticalCapacityContract.from_env()
                self.limit=2*self.contract.operations+3
            if self.limited or len(self.records)>=self.limit:
                self.limited=True
                raise AnalysisError('capacity_requires_choice','Physical SQL attempt allowance exhausted')
            identity=len(self.records)+1
            self.records[identity]={'kind':kind,'status':'reserved'}
            return identity

    def finish(self,identity,*,failed=False,rows=0,bytes_=0):
        with self.lock:
            record=self.records[identity]
            if record['status']!='reserved':raise ValueError('SQL reservation already finalized')
            record['status']='failed' if failed else 'successful'
            self._consume(rows,bytes_)

    def _consume(self,rows,bytes_):
        from services.analysis_catalog import AnalysisError
        self.rows+=rows;self.bytes+=bytes_
        if self.rows>self.contract.execution_rows*self.contract.operations or self.bytes>self.contract.artifact_bytes*self.contract.operations:
            self.limited=True
            raise AnalysisError('capacity_requires_choice','Physical result population exceeds request capacity')

    def record_fetch(self,identity,*,failed=False,rows=0,bytes_=0):
        with self.lock:
            record=self.records[identity]
            if record['status']=='reserved':raise ValueError('SQL execute must finish before fetch')
            if failed:
                record['status']='failed'
                if not rows and not bytes_:return
            try:self._consume(rows,bytes_)
            except BaseException:
                record['status']='failed'
                raise

    def fetch_allowance(self):
        with self.lock:
            return max(0,self.contract.execution_rows*self.contract.operations-self.rows)

    def snapshot(self):
        with self.lock:
            records=list(self.records.values())
            return {'attempted':len(records),'execute_attempts':sum(r['kind']=='execute' for r in records),
                'dry_run_attempts':sum(r['kind']=='dry_run' for r in records),
                'metadata_attempts':sum(r['kind']=='metadata' for r in records),
                'direct_reader_attempts':sum(r['kind']=='direct_reader' for r in records),
                'successful':sum(r['status']=='successful' for r in records),'failed':sum(r['status']=='failed' for r in records),
                'reserved':sum(r['status']=='reserved' for r in records),'limit_attempts':self.limit,
                'fetched_rows':self.rows,'fetched_bytes':self.bytes,'limited':self.limited,
                'coverage':'Validated executor plus instrumented API reader/source-metadata cursors; transaction controls and writer/pipeline connections excluded'}


@contextmanager
def query_attempt(kind):
    budget=request_sql_budget.get()
    if budget is None:
        yield None
        return
    identity=budget.reserve(kind);observed={}
    token=executor_sql_attempt.set(True)
    try:yield observed
    except BaseException:
        budget.finish(identity,failed=True)
        raise
    else:budget.finish(identity,rows=observed.get('rows',0),bytes_=observed.get('bytes',0))
    finally:executor_sql_attempt.reset(token)


def period_count(period, granularity):
    if not period.get('start') or not period.get('end'):
        return None
    start, end = (date.fromisoformat(period[k][:10]) for k in ('start', 'end'))
    if end < start:
        raise ValueError('Period end precedes start')
    if granularity == 'day':
        return (end-start).days + 1
    if granularity == 'week':
        return ((end-start).days + start.weekday()) // 7 + 1
    months = (end.year-start.year)*12 + end.month-start.month
    if granularity == 'quarter':
        return end.year*4+(end.month-1)//3 - (start.year*4+(start.month-1)//3) + 1
    return months+1 if granularity == 'month' else end.year-start.year+1


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
