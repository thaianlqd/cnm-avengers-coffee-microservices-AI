"""Comparison frames and server-owned chart view modes (So sánh / Tổng gộp / Xem riêng).

A comparison frame is derived only from the approved semantic meaning: a requested
requirement whose question is a comparison (``analysis_kind == 'comparison'``, a
``group_gap`` feature or the compare mission) over named members of one entity axis.
A two-value filter alone is NOT a comparison (an overview of two provinces stays an
overview).

View modes are projections of the complete, immutable query artifact under the governed
aggregation law of each metric class: additive measures sum, ratios and averages are
recomputed from their summed components, distinct counts cannot be unioned from member
counts (the total is then unavailable with a reason). Every mode is rendered by the same
chart renderer and described by the same deterministic insight engine, so data, labels
and claims of a mode always belong together. Switching modes needs 0 provider calls and
0 warehouse queries; verification re-derives the projections from the stored artifact.
"""
from copy import deepcopy
from dataclasses import replace
import hashlib
import json

POLICY_VERSION = 'view-modes-v1'
MAX_MEMBERS = 6
MAX_BREAKDOWN_VALUES = 8
MODE_LABELS = {'compare': 'So sánh', 'total': 'Tổng gộp', 'single': 'Xem riêng'}
VALUE_MODE_LABELS = {'absolute': 'Giá trị thực', 'member_share': '% trong từng đối tượng', 'scope_share': '% trên tổng phạm vi'}


def _digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, default=str, ensure_ascii=False).encode()).hexdigest()


def _values(f):
    value = f['value'] if isinstance(f, dict) else f.value
    return list(value) if isinstance(value, list) else [value]


def _field(f, name):
    return f[name] if isinstance(f, dict) else getattr(f, name)


def comparison_evidence(req, mission_id=None, scope_resolution=None):
    """Typed reason why a requirement asks to compare members (None = not a comparison)."""
    kind = req['analysis_kind'] if isinstance(req, dict) else req.analysis_kind
    features = set((req.get('derived_features') if isinstance(req, dict) else req.derived_features) or [])
    comparison_time = req.get('comparison_time') if isinstance(req, dict) else req.comparison_time
    if comparison_time:
        return None  # a period comparison is a time frame, handled by the period-comparison chain
    if kind == 'comparison':
        return 'analysis_kind'
    if 'group_gap' in features:
        return 'group_gap_feature'
    if mission_id == 'compare':
        return 'compare_mission'
    # Grouping by an axis while restricting it to 2..N named values shows exactly those members side by side.
    dims = set((req.get('dimension_ids') if isinstance(req, dict) else req.dimension_ids) or [])
    filters = (req.get('filters') if isinstance(req, dict) else req.filters) or []
    named = [_field(f, 'dimension') for f in filters
             if _field(f, 'dimension') in dims and _field(f, 'operator') == 'in' and 2 <= len(set(map(str, _values(f)))) <= MAX_MEMBERS]
    # A grouping pinned to one value by an eq filter ("tại Hà Nội") is scope, not an axis.
    pinned = {_field(f, 'dimension') for f in filters if _field(f, 'operator') == 'eq' or len(set(map(str, _values(f)))) == 1}
    axes = dims - pinned
    # One axis restricted to named members is those members side by side; with more axes (a cross-tab) the filter is
    # only a scope, unless the governed scope resolution itself bound the members as a comparison ("giữa A và B").
    if kind in ('cross_tab', 'aggregate', 'trend') and named and len(axes) == 1:
        return 'grouped_member_filter'
    if any(b.get('comparison') and {b.get('comparison_dimension'), b.get('dimension')} & axes
           for b in (scope_resolution or {}).get('bindings') or []):
        return 'scope_comparison'
    return None


def member_axis(req, registry, mission_id=None, allowed_dimensions=None, scope_resolution=None):
    """(dimension, members, evidence) of a requested comparison over named members, else None.

    Members come from an explicit multi-value scope filter on a grouping axis (in the
    order the approved meaning lists them). A small governed enumeration without a filter
    is also a member axis ("so sánh các loại điểm bán"); unknown-size entities are not."""
    get = (lambda k: req.get(k)) if isinstance(req, dict) else (lambda k: getattr(req, k))
    if get('supporting_for') or (get('availability') or 'requested') != 'requested':
        return None
    evidence = comparison_evidence(req, mission_id, scope_resolution)
    if not evidence:
        return None
    dims = registry['dimensions']
    usable = [d for d in get('dimension_ids') or [] if d in dims and (allowed_dimensions is None or d in allowed_dimensions)]
    filtered = {}
    for d in usable:
        identity=dims[d].get('identity')
        key_dimension=identity if identity and any(_field(f,'dimension')==identity and _field(f,'operator')=='in'
                                                  for f in get('filters') or []) else d
        values = [v for f in get('filters') or [] if _field(f, 'dimension') == key_dimension and _field(f, 'operator') == 'in' for v in _values(f)]
        filtered[d] = list(dict.fromkeys(str(v) for v in values))
    # Named members (an explicit multi-value filter on the axis) win over any small enumeration.
    for d in usable:
        if 2 <= len(filtered[d]) <= MAX_MEMBERS:
            return d, filtered[d], evidence
    for d in usable:
        # A governed enumeration (catalogs state cardinality as 'enumerated' or as the closed count).
        hint = dims[d].get('cardinality_hint')
        enum = dims[d].get('enum') if hint == 'enumerated' or isinstance(hint, int) and not isinstance(hint, bool) else None
        if not filtered[d] and enum and 2 <= len(enum) <= MAX_MEMBERS:
            return d, [str(v) for v in enum], evidence
    return None


def frame_for(requirement, registry, mission_id=None, observed=None, scope_resolution=None):
    found = member_axis(requirement, registry, mission_id, scope_resolution=scope_resolution)
    if not found:
        return None
    dim, members, evidence = found
    get = (lambda k: requirement.get(k)) if isinstance(requirement, dict) else (lambda k: getattr(requirement, k))
    labels = registry['dimensions'][dim].get('value_labels') or {}
    frame = dict(kind='entity', requirement_id=get('id'), axis_dimension_id=dim,
                 axis_label=registry['dimensions'][dim].get('business_name', dim), metric_ids=list(get('metric_ids') or []),
                 members=[dict(key=m, label=str(labels.get(m, m))) for m in members],
                 baseline_member_key=members[-1] if len(members) == 2 else None,
                 evidence=evidence, overlap_policy='disjoint_axis_values', policy_version=POLICY_VERSION)
    identity=registry['dimensions'][dim].get('identity')
    if identity and any(_field(f,'dimension')==identity and _field(f,'operator')=='in' for f in get('filters') or []):
        frame['member_key_dimension']=identity
    if observed is not None:
        seen = {str(v) for v in observed}
        frame.update(observed_members=[m for m in members if m in seen], missing_members=[m for m in members if m not in seen])
    frame['id'] = 'frame_' + _digest({k: frame[k] for k in ('requirement_id', 'axis_dimension_id', 'members', 'metric_ids')})[:16]
    return frame


# ------------------------------------------------------------------ aggregation law (projection kernel)

def metric_law(metric, meta):
    """How a metric combines across a dropped axis: ('sum',) | ('ratio', num, den, scale) | ('unavailable', reason)."""
    semantics = meta.get('aggregation_semantics')
    components = meta.get('components') or {}
    if semantics == 'ratio':
        num, den = components.get('numerator_metric'), components.get('denominator_metric')
        if num and den:
            return ('ratio', num, den, 100.0 if meta.get('unit') == '%' else 1.0)
        return ('unavailable', 'ratio_components_missing')
    if semantics == 'average':
        num, den = components.get('numerator_metric'), components.get('denominator_metric') or components.get('exposure_metric')
        if num and den:
            return ('ratio', num, den, 1.0)
        return ('unavailable', 'average_components_missing')
    if semantics == 'distinct_count':
        return ('unavailable', 'distinct_requires_identity_union')
    if meta.get('additive') or semantics in (None, 'sum', 'count'):
        return ('sum',) if meta.get('additive', True) else ('unavailable', 'non_additive_measure')
    return ('unavailable', 'non_additive_measure')


def required_metrics(metrics, registry):
    """Component metrics a projection must carry so totals can be recomputed (never averaged)."""
    out = list(metrics)
    for m in metrics:
        law = metric_law(m, registry['metrics'].get(m, {}))
        if law[0] == 'ratio':
            out += [law[1], law[2]]
    return list(dict.fromkeys(out))


def _combine(rows, metrics, metas):
    out = {}
    for m in metrics:
        law = metric_law(m, metas.get(m, {}))
        if law[0] == 'sum':
            values = [r.get(m) for r in rows if isinstance(r.get(m), (int, float))]
            out[m] = sum(values) if values else None
        elif law[0] == 'ratio':
            _, num, den, scale = law
            if not all(num in r and den in r for r in rows):
                return None, f'{m}:components_not_in_artifact'
            n = sum(r[num] or 0 for r in rows)
            d = sum(r[den] or 0 for r in rows)
            out[m] = (n / d * scale) if d else None
        else:
            return None, f'{m}:{law[1]}'
    return out, None


class ProjectedArtifact:
    """Read-only view of one artifact projection; renderer/insight engines read it like an artifact."""

    def __init__(self, base, view_id, dimensions, rows, metrics=None, unit_overrides=None):
        self.base = base
        self.query = base.query.model_copy(update={'id': view_id})
        plan_metrics = list(metrics or base.plan.metrics)
        columns = (['period'] if base.plan.kind == 'trend' else []) + list(dimensions) + plan_metrics
        self.plan = base.plan.model_copy(update={'dimensions': list(dimensions), 'group_by': list(dimensions), 'metrics': plan_metrics,
                                                 'output_columns': columns, 'ranking': None, 'explicit_limit': False})
        grounded = base.grounded
        if unit_overrides:
            metas = deepcopy(grounded.metrics)
            for m, unit in unit_overrides.items():
                name = metas[m].get('business_name', m)
                metas[m] = dict(metas[m], unit=unit, additive=False, aggregation_semantics='share',
                                business_name='Tỷ trọng ' + name[:1].lower() + name[1:])
            grounded = grounded.model_copy(update={'metrics': metas})
        self.grounded = grounded
        self.result = {'rows': rows, 'columns': columns, 'count': len(rows), 'truncated': False}
        self.sql, self.signature = base.sql, base.signature
        self.contract, self.reused, self.observed_at = base.contract, True, base.observed_at
        self.result_ref, self.capacity = base.result_ref, base.capacity
        self.fixed_grouping_policy = base.fixed_grouping_policy


def view_id(query_id, spec):
    # No ':' / '@' / '|' — evidence references use them as separators.
    return f"{query_id}~{spec['mode']}" + (f"~{_digest(spec)[:10]}" if len(spec) > 1 else '')


def regroup(artifact, axis, members):
    """Re-key the member axis to composite member keys and combine rows of one member (governed law)."""
    groups = {v: m['key'] for m in members for v in m.get('values') or [m['key']]}
    owners = {artifact.grounded.dimensions.get(d, {}).get('identity'): d for d in artifact.plan.dimensions}
    dims = [d for d in artifact.plan.dimensions if not (owners.get(d) == axis)]
    keep = (['period'] if artifact.plan.kind == 'trend' else []) + dims
    buckets = {}
    for r in artifact.result.get('rows', []):
        key = groups.get(str(r.get(axis)))
        if key is None:
            continue
        r = {**r, axis: key}
        buckets.setdefault(tuple(str(r.get(f)) for f in keep), []).append(r)
    rows = []
    for members_rows in buckets.values():
        values, reason = _combine(members_rows, list(artifact.plan.metrics), artifact.grounded.metrics)
        if reason:
            return None, reason
        rows.append({**{f: members_rows[0].get(f) for f in keep}, **values})
    rows.sort(key=lambda r: tuple(str(r.get(f)) for f in keep))
    grouped = ProjectedArtifact(artifact, artifact.query.id, dims, rows)
    grouped.query = artifact.query
    return grouped, None


def project(artifact, axis, spec, registry, members=None):
    if members and any(m.get('values') for m in members):
        artifact, reason = regroup(artifact, axis, members)
        if artifact is None:
            return None, reason
        projected, reason = _project(artifact, axis, spec, registry)
        if projected is not None:
            projected.base = getattr(artifact, 'base', artifact)
        return projected, reason
    return _project(artifact, axis, spec, registry)


def _project(artifact, axis, spec, registry):
    """Project ``artifact`` for one view spec.

    spec = {mode: compare|total|single, member?: key, breakdown?: (dimension, key), value_mode?: absolute|member_share|scope_share}
    Returns (ProjectedArtifact, None) or (None, reason)."""
    dims = list(artifact.plan.dimensions)
    if axis not in dims:
        return None, 'member_axis_not_in_grain'
    identities = {artifact.grounded.dimensions.get(d, {}).get('identity') for d in dims} - {None}
    metas = artifact.grounded.metrics
    metrics = [m for m in artifact.plan.metrics]
    rows = [dict(r) for r in artifact.result.get('rows', [])]
    member_key=spec.get('member_key_dimension') or axis
    if member_key not in {axis,artifact.grounded.dimensions.get(axis,{}).get('identity')}:
        return None,'invalid_member_identity'
    keep = list(dims)
    mode = spec['mode']
    breakdown = spec.get('breakdown')
    if breakdown:
        bdim, bkey = breakdown
        if bdim not in dims or bdim == axis:
            return None, 'unknown_breakdown'
        rows = [r for r in rows if str(r.get(bdim)) == str(bkey)]
        keep = [d for d in keep if d != bdim and artifact.grounded.dimensions.get(bdim, {}).get('identity') != d]
        if not rows:
            return None, 'empty_breakdown'
    if mode == 'single':
        rows = [r for r in rows if str(r.get(member_key)) == str(spec.get('member'))]
        if not rows:
            return None, 'member_without_rows'
        keep = [d for d in keep if d != axis]
    elif mode == 'total':
        keep = [d for d in keep if d != axis]
    elif mode != 'compare':
        return None, 'unknown_mode'
    owners = {artifact.grounded.dimensions.get(d, {}).get('identity'): d for d in dims}
    keep = [d for d in keep if d not in identities or owners.get(d) in keep]
    dropped = [d for d in dims if d not in keep]
    filtered = {axis} if mode == 'single' else set()
    if breakdown:
        filtered |= {breakdown[0]} | {d for d in dims if owners.get(d) == breakdown[0]}
    if mode == 'single':
        filtered |= {d for d in dims if owners.get(d) == axis}
    if set(dropped) - filtered:
        group_fields = (['period'] if artifact.plan.kind == 'trend' else []) + keep
        groups = {}
        for r in rows:
            groups.setdefault(tuple(str(r.get(f)) for f in group_fields), []).append(r)
        combined = []
        for members in groups.values():
            values, reason = _combine(members, metrics, metas)
            if reason:
                return None, reason
            combined.append({**{f: members[0].get(f) for f in group_fields}, **values})
        rows = combined
    else:
        rows = [{k: v for k, v in r.items() if k not in dropped} for r in rows]
    unit_overrides = None
    value_mode = spec.get('value_mode', 'absolute')
    if value_mode != 'absolute':
        primary = spec.get('metric') or metrics[0]
        meta = metas.get(primary, {})
        if not meta.get('additive') or not meta.get('non_negative', True):
            return None, 'share_requires_non_negative_additive'
        partition = [axis] if value_mode == 'member_share' and axis in keep else []
        partition = (['period'] if artifact.plan.kind == 'trend' else []) + partition
        totals = {}
        for r in rows:
            totals[tuple(str(r.get(f)) for f in partition)] = totals.get(tuple(str(r.get(f)) for f in partition), 0) + (r.get(primary) or 0)
        for r in rows:
            total = totals[tuple(str(r.get(f)) for f in partition)]
            r[primary] = (r.get(primary) or 0) / total * 100 if total else None
        unit_overrides = {primary: '%'}
        metrics = [primary]
        rows = [{k: v for k, v in r.items() if k not in set(artifact.plan.metrics) - {primary}} for r in rows]
    order = (['period'] if artifact.plan.kind == 'trend' else []) + keep
    rows.sort(key=lambda r: tuple(str(r.get(f)) for f in order))
    return ProjectedArtifact(artifact, view_id(artifact.query.id, spec), keep, rows, metrics, unit_overrides), None


# ------------------------------------------------------------------ chart attachment

PAYLOAD_KEYS = ('chart_type', 'chart_type_label', 'x_field', 'series_field', 'x_label', 'series_label', 'data', 'series',
                'series_keys', 'unit', 'category_fields', 'cardinality', 'selection', 'metric', 'metrics', 'caption')
VIEW_ONLY_KEYS = {'insight', 'view_modes', 'view_ref', 'comparison_frame_ref'}
CONTEXT_EXCLUDED = {'data', 'series', 'series_keys'}


def view_insight(ctx, projected, catalog, reference, mission_id, view):
    """Deterministic insight of one projection; the verifier rebuilds it from the stored context."""
    from services.chart_insight_service import insight
    block = insight(ctx, projected, catalog, reference, mission_id)
    block['view_caption'] = view['caption']
    block.setdefault('verification_context', {})['view'] = dict(view)
    return block


def verify_view_chart(chart, artifacts, catalog, reference=None, mission_id=None):
    """Re-derive every variant of one chart from its base artifact; returns (data_ok, [claim_ok...]).

    Data: each variant payload must equal the renderer output over the re-derived projection, and the
    chart's visible fields must equal its declared default variant. Claims: each variant insight must equal
    the insight rebuilt from the projection (no stored number is trusted)."""
    from services.dashboard_planner_service import render
    from services.analyst_contract import DashboardVisual
    modes = chart.get('view_modes') or {}
    base = artifacts.get(modes.get('base_query_id'))
    if base is None or chart.get('query_id', chart.get('scope_ref')) != base.query.id:
        return False, [False]
    data_ok, claims = True, []
    variants = [v for v in modes.get('variants') or [] if v.get('availability') == 'available']
    if chart.get('view_ref') not in {v['id'] for v in variants} or modes.get('default_variant') not in {v['id'] for v in variants}:
        return False, [False]
    for variant in variants:
        projected, _ = project(base, modes['axis_dimension_id'], variant['spec'], catalog.registry, modes.get('members'))
        if projected is None or projected.query.id != variant['id']:
            data_ok = False; claims.append(False); continue
        payload = variant['payload']
        try:
            if payload.get('chart_type') == 'kpi':
                expected = scalar_payload(projected, payload['metric'])
            else:
                visual = DashboardVisual(query_id=projected.query.id, chart_type=payload['chart_type'], metrics=payload['metrics'],
                                         x_field=payload.get('x_field'), series_field=payload.get('series_field'), role=projected.query.role)
                expected = render(visual, projected, 0)
        except (ValueError, TypeError, KeyError):
            expected = None
        if expected is None or any(payload.get(k) != expected.get(k) for k in PAYLOAD_KEYS if k in expected and k not in ('metric', 'metrics')):
            data_ok = False
        if variant['id'] == chart.get('view_ref') and any(chart.get(k) != payload.get(k) for k in payload):
            data_ok = False
        block = variant.get('insight') or {}
        ctx = (block.get('verification_context') or {}).get('chart') or {}
        view = (block.get('verification_context') or {}).get('view') or {}
        ok = (ctx.get('scope_ref') == projected.query.id and view.get('spec') == variant['spec']
              and ctx.get('view_note') == view_note(projected, modes['axis_dimension_id'], variant['spec'], modes.get('members') or [])
              and view.get('base_query_id') == base.query.id and view.get('axis') == modes['axis_dimension_id'])
        if ok:
            try:
                ok = view_insight(ctx, projected, catalog, reference, mission_id, view) == block
            except (ValueError, TypeError, KeyError, IndexError):
                ok = False
        if variant['id'] == chart.get('view_ref'):
            ok = ok and chart.get('insight') == block
        claims.append(ok)
    return data_ok, claims


def apply_view_choices(report, choices):
    """Replay only client-selected IDs against the owner's restored server report, never client chart data.

    A choice changes chart presentation and local insight. Report-level KPI/conclusion keep their original
    scope; callers retain the revision/owner checks before invoking this function.
    """
    from services.analysis_catalog import AnalysisError
    if not isinstance(choices, dict) or len(choices)>len(report.get('charts') or []):
        raise AnalysisError('invalid_view_choice','Chế độ xem biểu đồ không hợp lệ.')
    result=deepcopy(report)
    charts={c['id']:c for c in result.get('charts') or []}
    for chart_id, choice_id in choices.items():
        chart=charts.get(chart_id)
        if chart is None or not isinstance(choice_id,str):
            raise AnalysisError('invalid_view_choice','Biểu đồ không thuộc bản báo cáo này.')
        variant=next((v for v in (chart.get('view_modes') or {}).get('variants',[])
                      if v.get('id')==choice_id and v.get('availability')=='available'),None)
        if variant is None:
            raise AnalysisError('invalid_view_choice','Chế độ xem không thuộc biểu đồ hoặc không còn khả dụng.')
        chart.update(deepcopy(variant['payload']))
        chart.update(insight=deepcopy(variant['insight']),view_ref=choice_id,active_view=deepcopy(variant['spec']))
    result['chart_view_choices']=dict(choices)
    return result


def comparison_view_cards(charts):
    """Primary pair totals before supporting KPIs; frozen default view, unaffected by local chart choices."""
    for chart in charts:
        if chart.get('relevance_role')!='primary':continue
        modes=chart.get('view_modes') or {}
        default=next((v for v in modes.get('variants',[]) if v.get('id')==modes.get('default_variant')),None)
        if not default or default['spec']['mode']!='compare':continue
        payload=default['payload'];rows=payload.get('data') or []
        if payload.get('series') or len(rows)!=2 or not all(isinstance(r.get('value'),(int,float)) for r in rows):continue
        a,b=rows
        unit=payload.get('unit');gap=a['value']-b['value']
        context=f"{a['label']} so với {b['label']} · Phạm vi so sánh của báo cáo"
        common=dict(kind='comparison_view',chart_id=chart['id'],view_ref=default['id'],metric=payload['metric'],
                    scope_ref=modes['base_query_id'],sub_text=context,evidence_id='view:'+default['id']+':pair')
        cards=[dict(common,label=r['label'],value=r['value'],unit=unit,value_field=f'member_{i}') for i,r in enumerate(rows)]
        cards.append(dict(common,label='Chênh lệch tuyệt đối',value=gap,unit='điểm %' if unit=='%' else unit,value_field='pair_gap'))
        if unit!='%' and b['value']:
            cards.append(dict(common,label='Chênh lệch %',value=gap/abs(b['value'])*100,unit='%',value_field='pair_relative_gap'))
        return cards
    return []

def _chart_metric(chart):
    return chart.get('metric') or (chart.get('metrics') or [None])[0]


def _visual_for(projected, metric, chart, axis, spec):
    from services.analyst_contract import DashboardVisual
    from services.dashboard_planner_service import visible_dimensions
    visible = visible_dimensions(projected)
    trend = projected.plan.kind == 'trend'
    base = dict(query_id=projected.query.id, metrics=[metric], role=projected.query.role, priority=chart.get('priority', 70),
                purpose='trend' if trend else 'comparison' if spec['mode'] == 'compare' else 'distribution' if spec.get('value_mode', 'absolute') != 'absolute' else 'comparison')
    if trend:
        if not visible:
            meta = projected.grounded.metrics[metric]
            return DashboardVisual(chart_type='area' if meta.get('additive') and meta.get('non_negative') else 'line', x_field='period', **base)
        if len(visible) == 1:
            return DashboardVisual(chart_type='multi_line', x_field='period', series_field=visible[0], **base)
        return None
    if len(visible) == 2 and axis in visible:
        other = next(d for d in visible if d != axis)
        return DashboardVisual(chart_type='grouped_bar', x_field=other, series_field=axis, **base)
    if len(visible) == 1:
        if spec.get('value_mode', 'absolute') != 'absolute':
            return DashboardVisual(chart_type='donut', x_field=visible[0], **{**base, 'purpose': 'distribution'})
        wide = len(projected.result['rows']) > 8 or any(len(str(r.get(visible[0]))) > 18 for r in projected.result['rows'])
        return DashboardVisual(chart_type='horizontal_bar' if wide else 'bar', x_field=visible[0], **base)
    return None


def scalar_payload(projected, metric):
    """A projection without any grouping is one number: shown as a KPI, never as a one-bar chart."""
    from services.dashboard_planner_service import visible_dimensions
    rows = projected.result['rows']
    if projected.plan.kind == 'trend' or visible_dimensions(projected) or len(rows) != 1 or not isinstance(rows[0].get(metric), (int, float)):
        return None
    meta = projected.grounded.metrics[metric]
    return dict(chart_type='kpi', chart_type_label='Chỉ số tổng', x_field=None, series_field=None, x_label='', series_label='',
                data=[dict(label=meta.get('business_name', metric), value=rows[0][metric])], unit=meta.get('unit', ''), cardinality=1,
                selection='complete')


def view_note(projected, axis, spec, members):
    """Disclosure for a compare slice in which some selected members have no rows (never silently dropped)."""
    if spec['mode'] != 'compare' or axis not in projected.plan.dimensions:
        return None
    key=spec.get('member_key_dimension') or axis
    seen = {str(r.get(key)) for r in projected.result['rows']}
    missing = [m['label'] for m in members if m['key'] not in seen]
    return f"Không có dữ liệu cho {', '.join(missing)} trong lát cắt này." if missing else None


def _member_label(frame, key):
    return next((m['label'] for m in frame['members'] if m['key'] == str(key)), str(key))


def _mode_caption(frame, spec, registry, breakdown_label=None):
    names = [m['label'] for m in frame['members'] if m['key'] in frame.get('observed_members', [m['key'] for m in frame['members']])]
    if spec['mode'] == 'compare':
        text = 'So sánh ' + ', '.join(names)
    elif spec['mode'] == 'total':
        text = f'Tổng của {len(names)} đối tượng đã chọn (' + ', '.join(names) + ')'
    else:
        text = 'Riêng ' + _member_label(frame, spec['member'])
    if breakdown_label:
        text += ' · ' + breakdown_label
    value_mode = spec.get('value_mode', 'absolute')
    if value_mode != 'absolute':
        text += ' · ' + VALUE_MODE_LABELS[value_mode]
    return text


def _variant_specs(chart, artifact, axis, frame, registry):
    """Bounded, deterministic set of view specs for one chart."""
    dims = [d for d in artifact.plan.dimensions if artifact.grounded.dimensions.get(d, {}).get('identity') != d
            or d == axis]
    others = [d for d in dims if d != axis and not any(artifact.grounded.dimensions.get(x, {}).get('identity') == d for x in dims)]
    trend = artifact.plan.kind == 'trend'
    members = frame.get('observed_members') or [m['key'] for m in frame['members']]
    metric = _chart_metric(chart)
    meta = artifact.grounded.metrics.get(metric, {})
    shareable = bool(meta.get('additive') and meta.get('non_negative')) and not trend and others
    specs = []
    breakdowns = []
    if trend and others:
        bdim = others[0]
        totals = {}
        for r in artifact.result.get('rows', []):
            if isinstance(r.get(metric), (int, float)):
                totals[str(r.get(bdim))] = totals.get(str(r.get(bdim)), 0) + r[metric]
        breakdowns = [(bdim, k) for k, _ in sorted(totals.items(), key=lambda kv: (-kv[1], kv[0]))[:MAX_BREAKDOWN_VALUES]]
        specs += [dict(mode='compare', breakdown=b) for b in breakdowns]
    else:
        specs.append(dict(mode='compare'))
        if shareable:
            specs.append(dict(mode='compare', value_mode='member_share', metric=metric))
    specs.append(dict(mode='total'))
    if shareable:
        specs.append(dict(mode='total', value_mode='scope_share', metric=metric))
    for m in members:
        specs.append(dict(mode='single', member=m))
        if shareable:
            specs.append(dict(mode='single', member=m, value_mode='scope_share', metric=metric))
    if frame.get('member_key_dimension'):
        specs=[dict(s,member_key_dimension=frame['member_key_dimension']) for s in specs]
    return specs, breakdowns


def attach_view_modes(charts, artifacts, catalog, reference=None, mission_id=None, frames=()):
    """Attach ``view_modes`` to every chart whose artifact keeps a frame's member axis.

    The chart keeps (or switches to) the default compare variant so its visible data, title
    caption and insight describe exactly the same projection. Returns per-chart decisions."""
    from services.dashboard_planner_service import render
    from services.chart_insight_service import INSIGHT_VERSION
    registry = catalog.registry
    decisions = []
    for chart in charts:
        ref = (chart.get('scope_refs') or [chart.get('scope_ref')])[0]
        artifact = artifacts.get(ref)
        metric = _chart_metric(chart)
        if artifact is None or chart.get('compare_query_ids') or chart.get('value_transform') or not metric:
            continue
        if getattr(artifact.plan, 'ranking', None):
            # A Top/Bottom N list keeps its rank census and boundary ties; it is not a member projection.
            decisions.append(dict(chart_id=chart.get('id'), status='skipped', reason='ranking_chart'))
            continue
        if len(set(chart.get('metrics') or [metric])) > 1:
            # A multi-metric visual (e.g. revenue with AOV) is not one member projection; it stays as rendered.
            decisions.append(dict(chart_id=chart.get('id'), status='skipped', reason='multi_metric_chart'))
            continue
        frame = next((f for f in frames if f['axis_dimension_id'] in artifact.plan.dimensions
                      and (metric in f['metric_ids'] or chart.get('requirement_id') == f['requirement_id']
                           or chart.get('relevance_role') == 'supporting')), None)
        if frame is None:
            continue
        axis = frame['axis_dimension_id']
        specs, breakdowns = _variant_specs(chart, artifact, axis, frame, registry)
        variants = []
        for spec in specs:
            projected, reason = project(artifact, axis, spec, registry, frame['members'])
            if projected is None:
                variants.append(dict(spec=spec, availability='unavailable', reason=reason))
                continue
            shown = spec.get('metric', metric) if spec.get('value_mode', 'absolute') != 'absolute' else metric
            rendered = scalar_payload(projected, shown)
            visual = None
            if rendered is None:
                visual = _visual_for(projected, shown, chart, axis, spec)
                rendered = render(visual, projected, 0) if visual is not None else None
            if rendered is None:
                variants.append(dict(spec=spec, availability='unavailable', reason='renderer_unsupported'))
                continue
            breakdown_label = None
            if spec.get('breakdown'):
                bdim, bkey = spec['breakdown']
                labels = registry['dimensions'].get(bdim, {}).get('value_labels') or {}
                breakdown_label = f"{registry['dimensions'][bdim]['business_name']}: {labels.get(str(bkey), bkey)}"
            caption = _mode_caption(frame, spec, registry, breakdown_label)
            payload = {k: rendered.get(k) for k in PAYLOAD_KEYS if k in rendered}
            payload['metric'], payload['metrics'] = shown, [shown]
            payload['caption'] = caption
            members = frame.get('observed_members') or [m['key'] for m in frame['members']]
            # The verification context names the view, not its rows: rows are re-derived from the artifact.
            ctx = {**{k: v for k, v in chart.items() if k not in VIEW_ONLY_KEYS and k not in PAYLOAD_KEYS},
                   **{k: v for k, v in payload.items() if k not in CONTEXT_EXCLUDED},
                   'view_note': view_note(projected, axis, spec, [dict(key=k, label=_member_label(frame, k)) for k in members]),
                   'scope_ref': projected.query.id, 'scope_refs': [projected.query.id], 'insight_version': INSIGHT_VERSION,
                   'member_axis': axis if axis in projected.plan.dimensions else None}
            block = view_insight(ctx, projected, catalog, reference, mission_id,
                                 dict(base_query_id=artifact.query.id, axis=axis, spec=spec, caption=caption))
            variants.append(dict(id=projected.query.id, spec=spec, availability='available', payload=payload, insight=block))
        available = [v for v in variants if v['availability'] == 'available']
        if not available:
            decisions.append(dict(chart_id=chart.get('id'), status='no_available_variant'))
            continue
        default = next((v for v in available if v['spec']['mode'] == 'compare' and v['spec'].get('value_mode', 'absolute') == 'absolute'), available[0])
        for key in PAYLOAD_KEYS:
            chart.pop(key, None)
        chart.update(default['payload'])
        chart['view_ref'] = default['id']  # query_id/scope_refs keep the executed lineage; view_ref names the projection shown
        chart['insight'] = default['insight']
        chart['comparison_frame_ref'] = frame['id']
        chart['view_modes'] = dict(
            policy_version=POLICY_VERSION, frame_id=frame['id'], axis_dimension_id=axis, axis_label=frame['axis_label'],
            base_query_id=artifact.query.id, default_variant=default['id'], local_only=True,
            members=[m for m in frame['members'] if m['key'] in (frame.get('observed_members') or [m['key'] for m in frame['members']])],
            breakdown=dict(dimension_id=breakdowns[0][0], label=registry['dimensions'][breakdowns[0][0]]['business_name'],
                           options=[dict(key=k, label=str((registry['dimensions'][d].get('value_labels') or {}).get(str(k), k))) for d, k in breakdowns])
            if breakdowns else None,
            variants=[{k: v.get(k) for k in ('id', 'spec', 'availability', 'reason', 'payload', 'insight') if k in v} for v in variants])
        decisions.append(dict(chart_id=chart.get('id'), status='attached', variants=len(available), default=default['id']))
    return decisions


def view_projections(charts, artifacts, registry):
    """Re-derive every view projection referenced by ``charts`` from the stored base artifacts (verification)."""
    out = {}
    for chart in charts or []:
        modes = chart.get('view_modes') or {}
        base = artifacts.get(modes.get('base_query_id'))
        if base is None:
            continue
        for variant in modes.get('variants') or []:
            if variant.get('availability') != 'available':
                continue
            projected, _ = project(base, modes['axis_dimension_id'], variant['spec'], registry, modes.get('members'))
            if projected is not None and projected.query.id == variant['id']:
                out[projected.query.id] = projected
    return out


def view_insights(charts):
    """All non-default mode insight blocks (the default one is the chart's own insight)."""
    out = []
    for chart in charts or []:
        modes = chart.get('view_modes') or {}
        for variant in modes.get('variants') or []:
            if variant.get('availability') == 'available' and variant['id'] != modes.get('default_variant'):
                out.append(variant['insight'])
    return out


def composite_members(axis, scope_resolution, registry, request_text=None, observed_values=()):
    """Members that are governed unions of axis values ("các kiosk" = nhượng quyền + vệ tinh), from the server's
    scope resolution of the request; None when every compared member is a single value."""
    binding = next((b for b in (scope_resolution or {}).get('bindings') or []
                    if b.get('dimension') == axis and b.get('comparison') and b.get('cohorts')), None)
    cohorts = binding['cohorts'] if binding and any(len(c.get('members') or []) > 1 for c in binding['cohorts']) else None
    if cohorts is None and request_text and observed_values:
        # Catalog-governed value groups whose lexical alias the user wrote ("các kiosk" = nhượng quyền + vệ tinh);
        # every other compared value stays its own member. Aliases are catalog configuration, not sample text.
        from services.value_grounding_service import value_text
        text = ' ' + value_text(request_text) + ' '
        groups = [g for g in registry['dimensions'][axis].get('value_groups') or []
                  if any(' ' + value_text(a) + ' ' in text for a in g.get('aliases') or [])
                  and set(map(str, g['values'])) <= set(observed_values)]
        if groups:
            grouped = {str(v) for g in groups for v in g['values']}
            cohorts = [dict(members=[str(v) for v in g['values']]) for g in groups] + \
                      [dict(members=[v]) for v in observed_values if v not in grouped]
    if not cohorts:
        return None
    labels = registry['dimensions'][axis].get('value_labels') or {}
    out = []
    for cohort in cohorts:
        values = [str(v) for v in cohort.get('members') or []]
        label = ' + '.join(str(labels.get(v, v)) for v in values)
        out.append(dict(key=label, label=label, values=values))
    seen = [v for m in out for v in m['values']]
    return out if len(out) >= 2 and len(seen) == len(set(seen)) else None  # overlapping cohorts: no silent double count


def report_frames(intent, artifacts, registry, mission_id=None, scope_resolution=None, request_text=None):
    """Comparison frames of the approved meaning, with observed/missing members from the requested result."""
    frames = []
    for req in (intent or {}).get('requirements') or []:
        found = member_axis(req, registry, mission_id, scope_resolution=scope_resolution)
        if not found:
            continue
        axis = found[0]
        observed = set()
        labels={}
        for a in artifacts.values():
            if a.query.role == 'requested' and axis in a.plan.dimensions and not getattr(a.plan, 'ranking', None):
                identity=registry['dimensions'][axis].get('identity')
                key=identity if identity and any(f.get('dimension')==identity and f.get('operator')=='in' for f in req.get('filters',[])) else axis
                observed |= {str(r.get(key)) for r in a.result.get('rows', []) if r.get(key) is not None}
                if key!=axis:
                    from services.business_labels import dimension_labeler
                    label=dimension_labeler(a.plan.dimensions,a.result.get('rows',[]),a.grounded.dimensions)
                    labels.update({str(r[key]):label(r,axis) for r in a.result.get('rows',[]) if r.get(key) is not None})
        frame = frame_for(req, registry, mission_id, observed=observed, scope_resolution=scope_resolution)
        if frame and labels:
            frame['members']=[dict(m,label=labels.get(m['key'],m['label'])) for m in frame['members']]
        requested_values = [m['key'] for m in frame['members']] if frame else []
        composite = composite_members(axis, scope_resolution, registry, request_text, requested_values) if frame else None
        if composite:
            frame.update(members=composite, composite=True, baseline_member_key=composite[-1]['key'] if len(composite) == 2 else None,
                         observed_members=[m['key'] for m in composite if set(m['values']) & observed],
                         missing_members=[m['key'] for m in composite if not set(m['values']) & observed])
        if frame and frame['id'] not in {f['id'] for f in frames}:
            frames.append(frame)
    return frames
