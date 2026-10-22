"""Computed member selection (selection → fixed cohort → comparison).

"Hai tỉnh có doanh thu ổn định nhất", "ba cửa hàng tăng trưởng nhanh nhất": the model only names a
governed criterion; the server owns the formula, eligibility, ties and the selected keys. A criterion is
never an expression from the model, and an ineligible request never falls back to "highest revenue".

The selection runs once, read-only and bounded, through the normal compiler/executor (one trend query of
the entity axis over complete buckets). Its receipt (definition, window, per-entity scores, exclusions,
boundary ties) is stored with the proposal so the user approves the chosen cohort, and the report keeps
the lineage. Local view switches never re-select.
"""
from copy import deepcopy
from datetime import date, timedelta
from statistics import mean, pstdev
import unicodedata

POLICY_VERSION = 'selection-v1'
DEFAULT_CADENCE = 'month'
MIN_COMPLETE_BUCKETS = 3

# Criterion registry: formula/version, direction semantics, compatible metric classes, eligibility.
CRITERIA = {
    'stability': dict(
        label='Độ ổn định', phrase='ổn định nhất', score_label='Hệ số biến thiên (CV)', version='cv_pop_v1', best='lowest',
        formula='CV = độ lệch chuẩn tổng thể / trung bình của các kỳ đầy đủ; CV nhỏ hơn = ổn định hơn',
        metric_classes={'additive'}, requires_positive_mean=True, cues=('on dinh', 'deu dan', 'it bien dong', 'it dao dong')),
    'growth': dict(
        label='Tăng trưởng', phrase='tăng trưởng nhanh nhất', score_label='Tăng trưởng kỳ cuối so với kỳ đầu', version='first_last_v1', best='highest',
        formula='(giá trị kỳ đầy đủ cuối − kỳ đầy đủ đầu) / kỳ đầy đủ đầu',
        metric_classes={'additive', 'ratio', 'average'}, requires_positive_mean=False, cues=('tang truong', 'tang nhanh', 'tang manh', 'tang nhieu')),
    'volatility': dict(
        label='Biến động', phrase='biến động nhiều nhất', score_label='Hệ số biến thiên (CV)', version='cv_pop_v1', best='highest',
        formula='CV = độ lệch chuẩn tổng thể / trung bình của các kỳ đầy đủ; CV lớn hơn = biến động hơn',
        metric_classes={'additive'}, requires_positive_mean=True, cues=('bien dong', 'dao dong', 'bat on', 'that thuong')),
}


def criterion_catalog():
    """Public, versioned definitions (capability inventory / clarification options)."""
    return [dict(id=k, label=v['label'], phrase=v['phrase'], score=v['score_label'], formula=v['formula'], version=v['version'],
                 min_complete_buckets=MIN_COMPLETE_BUCKETS, cadence_default=DEFAULT_CADENCE) for k, v in CRITERIA.items()]


def metric_class(meta):
    semantics = meta.get('aggregation_semantics')
    return 'ratio' if semantics == 'ratio' else 'average' if semantics == 'average' else \
        'distinct' if semantics == 'distinct_count' else 'additive'


def _fold(text):
    text = unicodedata.normalize('NFD', str(text).lower()).replace('đ', 'd')
    return ' '.join(''.join(c for c in text if not unicodedata.combining(c)).split())


def criterion_anchored(criterion, question):
    """The question itself names the criterion (governed vocabulary), so a model cannot invent a selection."""
    spec = CRITERIA.get(criterion)
    return bool(spec) and any(cue in _fold(question) for cue in spec['cues'])


def any_criterion_cue(question):
    return any(criterion_anchored(c, question) for c in CRITERIA)


def check(selection, metric_meta):
    """None if executable, else a typed reason (unsupported criterion / incompatible metric)."""
    spec = CRITERIA.get(selection.get('criterion'))
    if spec is None:
        return 'criterion_unsupported'
    if metric_class(metric_meta) not in spec['metric_classes']:
        return 'criterion_metric_incompatible'
    return None


def score(criterion, values):
    """Score of one entity's ordered complete-bucket values; (None, reason) when undefined."""
    if len(values) < MIN_COMPLETE_BUCKETS:
        return None, 'insufficient_history'
    if criterion in ('stability', 'volatility'):
        m = mean(values)
        if m <= 0:
            return None, 'non_positive_mean'
        return pstdev(values) / m, None
    if criterion == 'growth':
        if values[0] <= 0:
            return None, 'non_positive_baseline'
        return (values[-1] - values[0]) / values[0], None
    return None, 'criterion_unsupported'


def complete_buckets(period, cadence, reference):
    """Bucket starts fully inside [period.start, min(period.end, reference)] (partial first/last excluded)."""
    from services.insight_service import trend_bucket_coverage
    return lambda bucket: not trend_bucket_coverage(bucket, cadence, period)['partial'] and str(bucket)[:10] <= reference.isoformat()


def calendar_buckets(rows, cadence, period, is_complete):
    """Expected calendar, including periods absent for EVERY entity. Absence never means a zero."""
    observed=sorted({str(r.get('period'))[:10] for r in rows if r.get('period') and is_complete(r['period'])})
    if not observed:
        return []
    start=date.fromisoformat(str(period.get('start') or observed[0])[:10])
    # An unbounded all-time query has no declared start/end of coverage: use the observed envelope,
    # keeping holes inside it. An explicit window must also include missing leading/trailing buckets.
    end=date.fromisoformat(str((period.get('end') if period.get('start') else None) or observed[-1])[:10])
    if cadence in {'month','quarter','year'}:
        step={'month':1,'quarter':3,'year':12}[cadence]
        start=start.replace(month=((start.month-1)//step)*step+1,day=1)
        def advance(d):
            m=d.year*12+d.month-1+step
            return date(m//12,m%12+1,1)
    else:
        if cadence=='week':start-=timedelta(days=start.weekday())
        advance=lambda d:d+timedelta(days=7 if cadence=='week' else 1)
    buckets=[]
    while start<=end:
        if is_complete(start.isoformat()):buckets.append(start.isoformat())
        start=advance(start)
    return buckets


def select(rows, entity, metric, criterion, limit, is_complete, labels=None, expected_buckets=None):
    """Pure kernel: rows of (entity, period, metric) → receipt. Missing buckets are missing, not zero."""
    spec = CRITERIA[criterion]
    buckets = sorted(expected_buckets if expected_buckets is not None else
                     {str(r.get('period'))[:10] for r in rows if is_complete(r.get('period'))})
    series = {}
    for r in rows:
        key = r.get(entity)
        if key is None or not is_complete(r.get('period')) or not isinstance(r.get(metric), (int, float)):
            continue
        series.setdefault(str(key), {})[str(r.get('period'))[:10]] = r[metric]
    eligible, excluded = [], {}
    for key, points in sorted(series.items()):
        if set(points) != set(buckets):
            excluded['missing_buckets'] = excluded.get('missing_buckets', 0) + 1
            continue
        value, reason = score(criterion, [points[b] for b in buckets])
        if value is None:
            excluded[reason] = excluded.get(reason, 0) + 1
            continue
        eligible.append(dict(key=key, label=(labels or {}).get(key, key), score=value, buckets=len(points),
                             mean=mean(points.values())))
    reverse = spec['best'] == 'highest'
    eligible.sort(key=lambda e: (-e['score'] if reverse else e['score'], e['key']))
    chosen = eligible[:limit]
    boundary = chosen[-1]['score'] if chosen else None
    tied = [e['key'] for e in eligible if boundary is not None and e['score'] == boundary]
    status = 'ok' if len(chosen) == limit else 'insufficient_eligible'
    return dict(policy_version=POLICY_VERSION, criterion=criterion, criterion_version=spec['version'],
                criterion_label=spec['label'], score_label=spec['score_label'], formula=spec['formula'], best=spec['best'],
                buckets=buckets, eligible=eligible, excluded=excluded, limit=limit, selected=[e['key'] for e in chosen],
                selected_labels=[e['label'] for e in chosen], status=status,
                boundary_ties=tied if len(tied) > sum(1 for e in chosen if e['score'] == boundary) else [],
                min_complete_buckets=MIN_COMPLETE_BUCKETS)


def entity_keys(rows, entity, registry):
    """Canonical identity for named entities; labels are presentation only, including duplicate names."""
    identity=registry['dimensions'][entity].get('identity')
    key=identity or entity
    if identity:
        from services.business_labels import dimension_labeler
        label=dimension_labeler([entity,identity],rows,registry['dimensions'])
        labels={str(r[identity]):label(r,entity) for r in rows if r.get(identity) is not None}
    else:
        labels={str(v):str(l) for v,l in (registry['dimensions'][entity].get('value_labels') or {}).items()}
    return key,labels


def selection_requirement(req, cadence):
    """Read-only trend query that feeds the selector: same metric, scope and window, grouped by the entity."""
    data = req.model_dump(mode='json')
    data.update(id=(req.id + '_sel')[:40], analysis_kind='trend', granularity=cadence, ranking=None, derived_features=[],
                feature_metrics={}, selection=None, supporting_for=None, goal='Chọn nhóm theo tiêu chí',
                dimension_ids=[req.selection.entity_dimension_id or req.dimension_ids[0]])
    return data


def describe(receipt):
    names = ', '.join(receipt['selected_labels'])
    return (f"{len(receipt['selected'])} nhóm được chọn theo {receipt['criterion_label'].lower()} "
            f"({receipt['score_label']}, {len(receipt['buckets'])} kỳ đầy đủ): {names}.")


def verify_selection(selection, frame_members, registry):
    """Re-derive a published selection from its immutable selection-query rows (no stored score is trusted)."""
    from services.result_artifact_store import artifact_store
    from services.insight_service import trend_bucket_coverage
    try:
        rows = artifact_store().get(selection['result_ref'])['rows']
        period = dict(selection['window'])
        cadence = selection['cadence']
        complete = lambda b: bool(b) and not trend_bucket_coverage(b, cadence, period)['partial']
        entity=selection['entity_dimension_id']
        key,labels=entity_keys(rows,entity,registry) if selection.get('identity_policy') else (entity,
            {str(v):str(l) for v,l in (registry['dimensions'][entity].get('value_labels') or {}).items()})
        expected = select(rows, key, selection['metric_id'], selection['criterion'],
                          selection['limit'], complete, labels,
                          calendar_buckets(rows,cadence,period,complete) if selection.get('calendar_policy') else None)
    except (KeyError, TypeError, ValueError, AttributeError):
        return False
    return (expected['selected'] == selection['selected'] and expected['excluded'] == selection['excluded']
            and expected['eligible'][:50] == selection['eligible'] and sorted(frame_members) == sorted(expected['selected']))
