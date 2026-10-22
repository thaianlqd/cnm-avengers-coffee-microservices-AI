"""Deterministic depth and supporting analytical lenses from checked metadata (FINAL plan 2026-10-19, P1–P2).

One generic planner for every domain and question family: the requested meaning is frozen, then a *lens plan*
(core → diagnostic → extended) is derived ONLY from governed metadata:

  metric class (ratio · additive · average · distinct) · components (numerator/denominator/exposure) ·
  history (historical vs snapshot) · domain ``lens_axes`` · per-metric compatible dimensions ·
  pinned scope (filters, metric business filters, ratio partition) · cardinality hints · depth policy.

Nothing here reads question text, a metric/city/month literal or a test fixture. A lens is *planned* here, *executed* by
the unchanged resolver → compiler → batch, then *selected* after execution from the real artifacts
(``dashboard_planner_service.lens_visuals`` / ``chart_relevance_service``). Core lens IDs never depend on depth, so
core ⊆ deep ⊆ comprehensive holds by construction.
"""
from services.analysis_intent import IntentRequirement
from services.semantic_manifest_service import NON_ADDITIVE_SEMANTICS
from services.analytical_capacity_planner import AnalyticalCapacityContract  # noqa: F401  (re-exported for callers)

ROLES = ('core', 'diagnostic', 'extended')
ROLE_RANK = {role: index for index, role in enumerate(ROLES)}
FIXED_GROUPING_POLICY = 'cohort-pinning-v1'


# --------------------------------------------------------------------------------------------- policy
def lens_policy(catalog):
    return catalog.registry.get('dashboard_policy', {}).get('lens_policy') or {}


def view_targets(catalog, depth=None):
    """Independent useful views per analytical role for a depth (the single source for 4/6/8)."""
    targets = lens_policy(catalog).get('view_targets') or {}
    default = (catalog.registry.get('dashboard_policy') or {}).get('default_depth', 'deep')
    return {role: int(count) for role, count in (targets.get(depth or default) or targets.get('deep') or {}).items()}


def dashboard_policy(catalog, depth=None):
    """Server-owned depth policy; never model advice. ``target_views`` = sum of the governed role targets."""
    policy = catalog.registry.get('dashboard_policy', {'minimum_views': 4, 'target_views': 5})
    budget = (policy.get('depth_budgets') or {}).get(depth or 'deep')
    if not budget:
        return {**policy, 'minimum_views': 0}
    targets = view_targets(catalog, depth)
    target = sum(targets.values()) or catalog.registry.get('max_charts', 8)
    return {**policy, 'minimum_views': 0, 'target_views': target, 'view_targets': targets,
            'max_supporting_operations': budget['max_supporting_operations'],
            'related_domains': budget.get('related_domains', False), 'segmented_trends': budget.get('segmented_trends', True),
            'max_segment_dimensions': budget.get('max_segment_dimensions', 0)}


def mission_relevant(candidate, parent_metrics, catalog, mission_id):
    """Mission evidence contract for an optional supporting view (V3.2 §41-43).

    A supporting view must stay inside the mission's governed evidence: risk missions use only governed risk-signal
    metrics; other missions only the requested metrics (plus the internal components of those metrics) and the
    mission's allowed analytical kinds. Free text (no mission) is bounded by the lens policy instead.
    """
    mission = next((m for m in catalog.registry.get('analysis_missions', []) if m['id'] == mission_id), None)
    rule = ((mission or {}).get('input_contract') or {}).get('supporting')
    if not rule:
        return True
    if candidate.analysis_kind not in set(rule.get('kinds', [])):
        return False
    if rule.get('metrics') == 'risk_signals':
        allowed = {s['metric'] for s in catalog.registry.get('risk_signals', [])}
        allowed |= {s['observation_metric'] for s in catalog.registry.get('risk_signals', []) if s.get('observation_metric')}
    else:
        allowed = set(parent_metrics)
        for metric in parent_metrics:
            allowed |= component_metrics(catalog.registry['metrics'].get(metric, {}))
    return bool(candidate.metric_ids) and set(candidate.metric_ids) <= allowed


def component_metrics(definition):
    components = definition.get('components') or {}
    return {components[k] for k in ('numerator_metric', 'denominator_metric', 'exposure_metric') if components.get(k)}


def estimated_views(operations, catalog, fixed_grouping_policy=None):
    """Conservative planning estimate; actual distinct charts are verified later."""
    total = 0
    for op in operations:
        metrics = op.get('metrics', []); dims = op.get('group_by', [])
        identities = {catalog.registry['dimensions'][d].get('identity') for d in dims}
        visible = [d for d in dims if d not in identities]
        kpi = any(not o.get('group_by') and o['operation']=='aggregate' and o.get('filters')==op.get('filters')
                  and o.get('time')==op.get('time') and set(metrics)<=set(o.get('metrics',[])) for o in operations if o is not op)
        fixed = fixed_grouping(catalog.registry,metrics,op.get('filters',[]),visible) if fixed_grouping_policy==FIXED_GROUPING_POLICY else (
            visible and kpi and all(_pinned_raw(catalog.registry,op.get('filters',[]),d) for d in visible))
        if fixed:
            continue  # the validated result table preserves a fixed cohort; no fake comparison chart
        if op['operation'] == 'detail' or not metrics or not visible and op['operation'] != 'trend':
            continue
        same_unit = len(metrics) > 1 and len({catalog.registry['metrics'][m]['unit'] for m in metrics}) == 1 and len({catalog.registry['metrics'][m].get('aggregation_semantics') in NON_ADDITIVE_SEMANTICS for m in metrics}) == 1
        total += 1 if op['operation'] == 'relationship' or same_unit and (
            len(visible) == 1 and op['operation'] not in {'ranking', 'trend'} or not visible and op['operation'] == 'trend') else len(metrics)
    return total


def narrow_request(requested, metrics, narrow_top_n=5):
    """Legacy-auto only: one metric, one requested ranking/aggregate/trend. The threshold is catalog policy."""
    return (len(requested) == 1 and len(metrics) == 1 and not requested[0].forecast
            and not requested[0].derived_features and requested[0].analysis_kind in {'ranking', 'aggregate', 'trend'})


def depth_selection(intent, index, ui):
    """``(effective_depth, selection_origin)``. A depth the user (or the UI default) submitted is authoritative; the
    historical server auto-pick only serves API clients that omit it and is reported as ``legacy_auto``."""
    if ui.get('analysis_depth_explicit'):
        return ui['analysis_depth'], 'explicit'
    if ui.get('request_breadth') == 'deep':
        return 'deep', 'legacy_auto'
    from services.analytical_resolver import digest, requirement_meaning
    requested = list({digest(requirement_meaning(r)): r for r in intent.requirements if not r.supporting_for}.values())
    metrics = {m for r in requested for m in r.metric_ids}
    domains = set()
    for r in requested:  # Prefer canonical subject owners over overlapping metric directories.
        subjects = set.intersection(*(set(index.metrics[m]['subjects']) for m in r.metric_ids if m in index.metrics)) if any(m in index.metrics for m in r.metric_ids) else set()
        if subjects:
            domains.add(next((d for d, p in index.domains.items() if sorted(subjects)[0] in p['primary_subjects']), sorted(subjects)[0]))
    shapes = {r.analysis_kind for r in requested}
    if len(domains) >= 2 or len(requested) >= 5 or len(requested) >= 3 and len(metrics) >= 3 or (
            'ranking' in shapes and 'trend' in shapes and shapes & {'distribution', 'comparison', 'aggregate'}):
        return 'comprehensive', 'legacy_auto'
    if ui.get('analysis_depth') == 'focused':
        return 'focused', 'legacy_auto'
    if narrow_request(requested, metrics, ui.get('narrow_top_n', 5)):
        return 'focused', 'legacy_auto'
    return 'deep', 'legacy_auto'


def analysis_depth(intent, index, ui):
    return depth_selection(intent, index, ui)[0]


# --------------------------------------------------------------------------------------------- metadata readers
def metric_class(definition):
    semantics = definition.get('aggregation_semantics')
    if semantics == 'ratio':
        return 'ratio'
    if semantics == 'average':
        return 'average'
    if semantics == 'distinct_count':
        return 'distinct'
    return 'additive'


def question_family(req, mission_id=None):
    """Generic analytical family of a *requested* requirement (diagnostics + family rules, never routing by text)."""
    if req.forecast:
        return 'forecast'
    if mission_id == 'risk_watch':
        return 'risk'
    features = set(req.derived_features)
    if req.analysis_kind == 'relationship' or 'relationship_strength' in features:
        return 'relationship'
    if req.comparison_time or 'driver_delta' in features or 'group_gap' in features or req.analysis_kind == 'cross_tab':
        return 'comparison'
    if req.ranking or req.analysis_kind == 'ranking':
        return 'ranking'
    if req.analysis_kind == 'trend':
        return 'trend'
    if req.analysis_kind == 'distribution' or {'concentration', 'contribution_share'} & features:
        return 'composition'
    return 'kpi' if req.analysis_kind == 'aggregate' and not req.dimension_ids else 'overview'


def _column_ref(descriptor):
    return descriptor.get('table', '') + '.' + descriptor.get('column', '')


def _pinned(registry, filters, dimension, *, include_identity=False):
    """A dimension is pinned when a single-valued scope filter already fixes it, either directly, through the same
    physical column, or because it is derived from the filtered column (e.g. a region derived from the filtered city)."""
    dims = registry['dimensions']; target = dims[dimension]
    for f in filters:
        values = f.value if isinstance(f.value, list) else [f.value]
        if f.operator not in {'eq', 'in'} or len(set(map(str, values))) != 1 or f.dimension not in dims:
            continue
        source = dims[f.dimension]
        if f.dimension == dimension or include_identity and target.get('identity') == f.dimension or (not source.get('expression') and not target.get('expression')
                                        and _column_ref(source) == _column_ref(target)):
            return True
        if not source.get('expression') and target.get('expression') and _column_ref(source) in target['expression']:
            return True
    return False


def _pinned_raw(registry, filters, dimension, *, include_identity=False):
    from services.analysis_contract import Filter
    try:
        return _pinned(registry, [f if isinstance(f, Filter) else Filter.model_validate(f) for f in filters], dimension, include_identity=include_identity)
    except (ValueError, TypeError, KeyError):
        return False


def fixed_grouping(registry, metrics, filters, dimensions):
    """Every grouping axis is constant under every measure's governed cohort."""
    return bool(metrics and dimensions) and all(_pinned_raw(registry,
        [*filters, *registry['metrics'][m].get('business_filters', [])], d, include_identity=True)
        for m in metrics for d in dimensions)


def _cardinality(descriptor):
    hint = descriptor.get('cardinality_hint')
    if isinstance(hint, int):
        return hint
    if hint == 'enumerated' and descriptor.get('enum'):
        return len(descriptor['enum'])
    return None


def _hierarchical(registry, a, b):
    """Two axes where one nests the other (city → store) answer one question, not a cross-tab."""
    for profile in (registry.get('domain_intelligence') or {}).get('profiles', {}).values():
        for path in profile.get('drilldown_hierarchies', []):
            if a in path and b in path:
                return True
    for dim in registry['dimensions'].values():
        for path in dim.get('hierarchies') or []:
            if a in path and b in path:
                return True
    return False


class _Planner:
    """Lens planning for ONE requested requirement. Pure function of (catalog, index, requirement, depth)."""

    # Executed analysis kind and visual form of each lens kind (for the mission evidence grammar, checked pre-SQL).
    KIND_SHAPE = {'trend': ('trend', 'line'), 'composition': ('distribution', 'donut'), 'segment': ('aggregate', 'bar'),
                  'cross_tab': ('cross_tab', 'table'), 'exposure_rate': ('aggregate', 'scatter'), 'contribution': ('aggregate', 'donut'),
                  'segmented_trend': ('trend', 'line'), 'mix_shift': ('trend', 'stacked_100')}

    def __init__(self, resolver, req, depth, quotas, covered, mission_id=None, tag=None):
        self.r, self.index, self.catalog = resolver, resolver.index, resolver.catalog
        self.registry = self.catalog.registry
        self.req, self.depth, self.quota, self.covered = req, depth, dict(quotas), set(covered)
        self.tag = tag  # per-variable lenses of a relationship pair keep distinct identities
        self.policy = lens_policy(self.catalog)
        self.min_groups = self.policy.get('min_groups', {})
        ranked = req.ranking.metric_id if req.ranking and req.ranking.metric_id else None
        self.metric = ranked or (req.metric_ids[0] if req.metric_ids else None)
        self.definition = self.registry['metrics'].get(self.metric, {})
        self.cls = metric_class(self.definition)
        self.components = self.definition.get('components') or {}
        self.historical = bool(self.index.metrics.get(self.metric, {}).get('historical'))
        self.shapes, self.lenses, self.decisions = {}, [], []
        self.used_axes, self.used_cross, self.segment_axes, self.requested_axes = set(), set(), [], []
        self.pool = self._axis_pool()
        mission = next((m for m in self.registry.get('analysis_missions', []) if m['id'] == mission_id), None)
        rule = ((mission or {}).get('input_contract') or {}).get('supporting')
        self.mission_kinds = set(rule.get('kinds', [])) if rule else None
        self.mission_forms = (set(mission.get('supporting_forms') or mission.get('chart_forms', [])) | {'table'}) if rule and mission_id != 'risk_watch' else None

    # -- eligibility inputs
    def _card(self, dim):
        """Known enum/hint, else the value-profile estimate the resolver already uses for trend cadence (no new SQL)."""
        known = _cardinality(self.registry['dimensions'][dim])
        if known is not None:
            return known
        if not hasattr(self, '_capacity'):
            try:
                from services.analytical_capacity_planner import AnalyticalCapacityPlanner
                from services.value_profile_service import profiles_for
                self._capacity = AnalyticalCapacityPlanner(self.catalog, profiles_for(self.catalog))
            except Exception:  # noqa: BLE001 - an unavailable profile only means "unknown"
                self._capacity = None
        try:
            return self._capacity.dimension_count(dim, self.req.filters) if self._capacity else None
        except Exception:  # noqa: BLE001
            return None

    def _domain_axes(self):
        subjects = set(self.index.metrics.get(self.metric, {}).get('subjects', []))
        domain = self.req.domain_id if self.req.domain_id in self.index.domains else None
        if not domain or self.metric not in self.index.domains[domain]['metric_refs']:
            domain = next((d for d, p in sorted(self.index.domains.items()) if self.metric in p['metric_refs']), None)
        if not domain:
            domain = next((d for d, p in sorted(self.index.domains.items()) if subjects & set(p['primary_subjects'])), None)
        return domain, list(self.index.domains.get(domain, {}).get('lens_axes', []))

    def _axis_pool(self):
        self.domain, axes = self._domain_axes()
        allowed = set(self.index.metrics.get(self.metric, {}).get('dimensions', []))
        business = {f['dimension'] for f in self.definition.get('business_filters', [])}
        single = {f['dimension'] for f in self.definition.get('business_filters', [])
                  if f.get('operator') == 'eq' or len(f['value'] if isinstance(f['value'], list) else [f['value']]) == 1}
        needed = {self.components['partition_dimension']} if self.components.get('partition_dimension') else set()
        pool = []
        for dim in axes:
            descriptor = self.registry['dimensions'].get(dim)
            reason = None
            if descriptor is None or dim not in allowed:
                reason = 'incompatible_dimension'
            elif _pinned(self.registry, self.req.filters, dim, include_identity=self.r.ui.get('fixed_grouping_policy')==FIXED_GROUPING_POLICY):
                reason = 'pinned_axis'
            elif dim in single or (self.cls == 'ratio' and (dim in business or dim in needed)):
                reason = 'pinned_axis'
            elif dim in self.req.dimension_ids:
                reason = 'requested_axis'
                self.requested_axes.append(dim)
            elif (_cardinality(descriptor) or 99) < 2:
                reason = 'singleton'
            if reason:
                self.decisions.append(dict(kind='axis', axis=dim, status='rejected', reason=reason))
            else:
                pool.append(dim)
        return pool

    def _periods(self, granularity):
        from services.analytical_capacity_planner import period_count
        from services.time_resolution_service import resolve_time
        period = resolve_time(self.req.time.model_dump(mode='json', exclude_none=True) if self.req.time else
                              {'kind': 'relative', 'mode': 'all_time'}, self.r.reference, self.registry['timezone'])[2]
        return period, (period_count(period, granularity) if period.get('start') and period.get('end') else None)

    def _granularity(self):
        if self.req.granularity:
            return self.req.granularity
        period, _ = self._periods('day')
        if not period.get('start') or not period.get('end'):
            return 'month'
        from datetime import date
        span = (date.fromisoformat(period['end'][:10]) - date.fromisoformat(period['start'][:10])).days + 1
        for rule in self.policy.get('trend_granularity', []):
            if 'max_days' not in rule or span <= rule['max_days']:
                return rule['granularity']
        return 'month'

    # -- shapes: (analysis_kind, axes) → one requirement; many lenses may read one shape
    def shape(self, kind, axes, metrics, granularity=None):
        key = (kind, tuple(axes))
        if key not in self.shapes:
            from services.analytical_resolver import digest
            self.shapes[key] = IntentRequirement(
                id='support_' + digest([self.req.id, kind, list(axes), sorted(metrics), granularity])[:24],
                goal={'trend': 'Diễn biến trong phạm vi đã chọn', 'aggregate': 'Đối chiếu theo nhóm',
                      'distribution': 'Cơ cấu trong phạm vi đã chọn', 'cross_tab': 'Tương tác hai chiều'}.get(kind, 'Góc nhìn bổ sung'),
                supporting_for=self.req.id, domain_id=self.domain, metric_ids=sorted(metrics), dimension_ids=list(axes),
                analysis_kind=kind, granularity=granularity, filters=self.req.filters, time=self.req.time)
        return self.shapes[key]

    def _metric_set(self, with_components=True):
        if self.cls == 'ratio' and with_components:
            return [self.metric, self.components['denominator_metric'], self.components['numerator_metric']]
        if self.cls == 'average' and with_components and self.components.get('exposure_metric'):
            return [self.metric, self.components['exposure_metric']]
        return [self.metric]

    def _label(self, dim):
        return self.registry['dimensions'][dim]['business_name']

    def _name(self, metric):
        return self.registry['metrics'][metric]['business_name']

    def _small(self, dim):
        card = self._card(dim)
        return (0 if card is not None else 1, card or 99, dim)

    def _reject(self, kind, role, reason, **extra):
        self.decisions.append(dict(kind=kind, role=role, status='rejected', reason=reason, **extra))
        return None

    # -- lens factories: return a lens dict (and register its shape) or None (with a typed decision)
    def lens_trend(self, role):
        if not self.historical:
            return self._reject('trend', role, 'no_time_axis')
        granularity = self._granularity()
        _, periods = self._periods(granularity)
        if periods is not None and periods < self.min_groups.get('trend', 2):
            return self._reject('trend', role, 'insufficient_periods')
        if 'trend' in self.covered:
            return self._reject('trend', role, 'duplicate_meaning')
        s = self.shape('trend', [], [self.metric], granularity)
        return dict(id='trend', kind='trend', shape=s.id, shape_key=['trend', []], metrics=[self.metric], granularity=granularity,
                    question='Chỉ số biến động thế nào theo thời gian?', show=[dict(form='line', metrics=[self.metric])])

    def lens_composition(self, role):
        if self.cls == 'ratio':
            part, den = self.components.get('partition_dimension'), self.components.get('denominator_metric')
            if not part or not den or part not in self.index.metrics.get(den, {}).get('dimensions', []):
                return self._reject('composition', role, 'missing_metric_component')
            if _pinned(self.registry, self.req.filters, part, include_identity=self.r.ui.get('fixed_grouping_policy')==FIXED_GROUPING_POLICY):
                return self._reject('composition', role, 'pinned_axis', axis=part)
            if 'composition:' + part in self.covered or part in self.req.dimension_ids:
                return self._reject('composition', role, 'duplicate_meaning')
            s = self.shape('distribution', [part], [den])
            return dict(id='composition:' + part, kind='composition', shape=s.id, shape_key=['distribution', [part]], metrics=[den], axes=[part],
                        question=f'{self._name(den)} chia theo {self._label(part).lower()} gồm những phần nào?',
                        show=[dict(form='donut', metrics=[den])])
        if self.cls != 'additive':
            return self._reject('composition', role, 'non_additive_total')
        if not self.definition.get('non_negative'):
            return self._reject('composition', role, 'signed_measure')
        from services.semantic_preflight_contract import metric_capability, additive_across
        capability = metric_capability(self.metric, self.definition)
        limit = self.policy.get('max_composition_groups', 8)
        # Part-to-whole reads best over a known, small set of groups; an unknown-size entity axis is the last resort.
        for dim in sorted(self.pool, key=lambda d: (self._card(d) is None, self.pool.index(d))):
            card = self._card(dim)
            if dim in self.used_axes or 'composition:' + dim in self.covered or 'segment:' + dim in self.covered or not additive_across(capability, dim):
                continue
            if card is not None and card > limit:
                continue
            self.used_axes.add(dim)
            s = self.shape('distribution', [dim], [self.metric])
            return dict(id='composition:' + dim, kind='composition', shape=s.id, shape_key=['distribution', [dim]], metrics=[self.metric], axes=[dim],
                        question=f'{self._name(self.metric)} phân bổ theo {self._label(dim).lower()} ra sao?',
                        show=[dict(form='donut', metrics=[self.metric])])
        return self._reject('composition', role, 'no_eligible_axis')

    def _next_axis(self, exclude=()):
        for dim in self.pool:
            if dim not in self.used_axes and dim not in exclude and 'segment:' + dim not in self.covered:
                return dim
        return None

    def lens_segment(self, role):
        dim = self._next_axis()
        if dim is None:
            return self._reject('segment', role, 'no_eligible_axis')
        self.used_axes.add(dim); self.segment_axes.append(dim)
        s = self.shape('aggregate', [dim], self._metric_set())
        return dict(id='segment:' + dim, kind='segment', shape=s.id, shape_key=['aggregate', [dim]], metrics=[self.metric], axes=[dim],
                    question=f'{self._name(self.metric)} khác nhau thế nào giữa các {self._label(dim).lower()}?',
                    show=[dict(form='bars', metrics=[self.metric])])

    def lens_cross_tab(self, role):
        candidates = list(dict.fromkeys(self.requested_axes + self.segment_axes + [d for d in self.pool if d not in self.segment_axes]))
        pairs = []
        for i, a in enumerate(candidates):
            for b in candidates[i + 1:]:
                if (a, b) in self.used_cross or _hierarchical(self.registry, a, b):
                    continue
                ca, cb = self._card(a), self._card(b)
                if (ca or 0) * (cb or 0) > self.policy.get('max_cross_tab_cells', 120) or ca is None and cb is None:
                    continue
                pairs.append(((ca is None) + (cb is None), i, candidates.index(b), a, b))
        # A legible grid needs bounded cells: prefer pairs whose sizes are governed/known over unknown-size entities.
        for *_, a, b in sorted(pairs):
                self.used_cross.add((a, b))
                s = self.shape('cross_tab', [a, b], [self.metric])
                return dict(id=f'cross_tab:{a}:{b}', kind='cross_tab', shape=s.id, shape_key=['cross_tab', [a, b]], metrics=[self.metric], axes=[a, b],
                            question=f'{self._name(self.metric)} thay đổi thế nào khi kết hợp {self._label(a).lower()} và {self._label(b).lower()}?',
                            show=[dict(form='heatmap', metrics=[self.metric])])
        return self._reject('cross_tab', role, 'no_eligible_axis' if len(self.pool) < 2 else 'duplicate_meaning')

    def _exposure_metric(self):
        return self.components.get('denominator_metric') or self.components.get('exposure_metric')

    def lens_exposure_rate(self, role):
        exposure = self._exposure_metric()
        if self.cls not in {'ratio', 'average'} or not exposure:
            return self._reject('exposure_rate', role, 'missing_metric_component')
        order = self.requested_axes + self.segment_axes + [d for d in self.pool if d not in self.segment_axes]
        limit = AnalyticalCapacityContract.from_env().chart_points
        choices = [d for d in order if self.min_groups.get('exposure_rate', 3) <= (self._card(d) or 99) <= limit]
        if not choices:
            return self._reject('exposure_rate', role, 'insufficient_groups')
        # Many groups give the most informative exposure picture; a second exposure lens moves to the next axis.
        planned = set(self.requested_axes) | set(self.segment_axes)  # reuse an already planned grouping (no extra query)
        dim = next((d for d in sorted(choices, key=lambda d: (d not in planned, self._card(d) is None, -min(self._card(d) or 99, 99), order.index(d)))
                    if 'exposure_rate:' + d not in self.covered), None)
        if dim is None:
            return self._reject('exposure_rate', role, 'duplicate_meaning')
        s = self.shape('aggregate', [dim], self._metric_set())
        return dict(id='exposure_rate:' + dim, kind='exposure_rate', shape=s.id, shape_key=['aggregate', [dim]], metrics=[self.metric, exposure], axes=[dim],
                    question=f'Nhóm nào có {self._name(self.metric).lower()} cao do quy mô ({self._name(exposure).lower()}) nhỏ hay lớn?',
                    show=[dict(form='scatter', metrics=[exposure, self.metric])])

    def lens_contribution(self, role):
        numerator = self.components.get('numerator_metric')
        if self.cls != 'ratio' or not numerator:
            return self._reject('contribution', role, 'missing_metric_component')
        dims = self.requested_axes + self.segment_axes + [d for d in self.pool if d not in self.segment_axes]
        dim = next((d for d in dims if 'contribution:' + d not in self.covered), None)
        if dim is None:
            return self._reject('contribution', role, 'no_eligible_axis')
        if dim not in self.segment_axes:
            self.used_axes.add(dim); self.segment_axes.append(dim)
        s = self.shape('aggregate', [dim], self._metric_set())
        return dict(id='contribution:' + dim, kind='contribution', shape=s.id, shape_key=['aggregate', [dim]], metrics=[numerator], axes=[dim],
                    question=f'{self._name(numerator)} tập trung ở {self._label(dim).lower()} nào?',
                    show=[dict(form='donut', metrics=[numerator])])

    def lens_segmented_trend(self, role):
        if not self.historical:
            return self._reject('segmented_trend', role, 'no_time_axis')
        granularity = self._granularity()
        _, periods = self._periods(granularity)
        if periods is not None and periods < self.min_groups.get('trend', 2):
            return self._reject('segmented_trend', role, 'insufficient_periods')
        limit = 8
        axes = self.pool + [d for d in self.requested_axes if d not in self.pool]
        choices = [d for d in axes if (self._card(d) or 0) <= limit]
        chosen = sorted(choices, key=lambda d: (self._small(d), axes.index(d)))
        dim = next((d for d in chosen if 'segmented_trend:' + d not in self.covered), None)
        if dim is None:
            return self._reject('segmented_trend', role, 'no_eligible_axis')
        s = self.shape('trend', [dim], [self.metric], granularity)
        return dict(id='segmented_trend:' + dim, kind='segmented_trend', shape=s.id, shape_key=['trend', [dim]], metrics=[self.metric], axes=[dim],
                    granularity=granularity,
                    question=f'Diễn biến {self._name(self.metric).lower()} khác nhau thế nào giữa các {self._label(dim).lower()}?',
                    show=[dict(form='multi_line', metrics=[self.metric])])

    def lens_mix_shift(self, role):
        """Additive only: how the MIX across one axis moves over time (share per period), read from the same series as
        a segmented trend — a different question from absolute per-group lines, at no extra query."""
        if self.cls != 'additive' or not self.historical or not self.definition.get('non_negative'):
            return self._reject('mix_shift', role, 'non_additive_total' if self.cls != 'additive' else
                                'signed_measure' if not self.definition.get('non_negative') else 'no_time_axis')
        from services.semantic_preflight_contract import metric_capability, additive_across
        capability = metric_capability(self.metric, self.definition)
        planned = [l['axes'][0] for l in self.lenses if l['kind'] == 'segmented_trend']
        choices = planned + [d for d in self.pool if d not in planned and (self._card(d) or 0) <= 8]
        dim = next((d for d in choices if 'mix_shift:' + d not in self.covered and additive_across(capability, d)), None)
        if dim is None:
            return self._reject('mix_shift', role, 'no_eligible_axis')
        granularity = self._granularity()
        s = self.shape('trend', [dim], [self.metric], granularity)
        return dict(id='mix_shift:' + dim, kind='mix_shift', shape=s.id, shape_key=['trend', [dim]], metrics=[self.metric], axes=[dim],
                    granularity=granularity,
                    question=f'Cơ cấu {self._name(self.metric).lower()} theo {self._label(dim).lower()} thay đổi thế nào qua thời gian?',
                    show=[dict(form='stacked_100', metrics=[self.metric])])

    COSTLY_ONLY = {'trend', 'segmented_trend'}  # always need their own query; never reserves
    FACTORIES = {'mix_shift': 'lens_mix_shift', 'trend': 'lens_trend', 'composition': 'lens_composition', 'segment': 'lens_segment', 'cross_tab': 'lens_cross_tab',
                 'exposure_rate': 'lens_exposure_rate', 'contribution': 'lens_contribution', 'segmented_trend': 'lens_segmented_trend'}

    def plan(self):
        sequences = (self.policy.get('sequences') or {}).get(self.cls) or {}
        for role in ROLES:
            want, got = self.quota.get(role, 0), 0
            if want <= 0:
                continue
            reserves = 0
            for position, kind in enumerate(sequences.get(role, [])):
                if got >= want and (reserves >= self.policy.get('max_reserve_lenses_per_role', 1) or kind in self.COSTLY_ONLY):
                    if got >= want and reserves >= self.policy.get('max_reserve_lenses_per_role', 1):
                        break
                    continue
                analysis_kind, form = self.KIND_SHAPE[kind]
                if self.mission_kinds is not None and (analysis_kind not in self.mission_kinds
                                                       or self.mission_forms is not None and form not in self.mission_forms):
                    self._reject(kind, role, 'mission_grammar')
                    continue
                snapshot = (set(self.used_axes), list(self.segment_axes), set(self.used_cross), dict(self.shapes))
                lens = getattr(self, self.FACTORIES[kind])(role)
                if lens is None:
                    continue
                lens['base_id'] = lens['id']
                if self.tag:
                    lens['id'] = lens['id'] + '@' + self.tag
                if got >= want and lens['id'] in {l['id'] for l in self.lenses}:
                    continue
                if got >= want:
                    # Zero-cost reserve: only when it reads a shape that is already planned. It is drawn after
                    # execution only if a primary lens of this role turns out ineligible (one selection pass).
                    if len(self.shapes) != len(snapshot[3]):
                        self.used_axes, self.segment_axes, self.used_cross, self.shapes = snapshot
                        continue
                    lens['reserve'] = True; reserves += 1
                lens.update(role=role, position=position, rank=[ROLE_RANK[role], position])
                if lens.get('reserve'):
                    self.lenses.append(lens); continue  # a reserve never blocks a later role from using the lens as primary
                self.lenses = [l for l in self.lenses if l['id'] != lens['id']]
                self.lenses.append(lens); self.covered.add(lens['base_id']); got += 1
            self.decisions.append(dict(kind='quota', role=role, status='planned' if got >= want else 'short', planned=got, target=want, reserves=reserves))
        return self.lenses


def _covered_by_requested(req):
    """Lens identities already realised by the requested requirement itself (not repeated as supporting work)."""
    covered = set()
    kind, dims = req.analysis_kind, list(req.dimension_ids)
    if req.forecast or kind == 'trend' and not dims:
        covered.add('trend')
    if kind == 'trend' and len(dims) == 1:
        covered.add('segmented_trend:' + dims[0])
    if kind in {'aggregate', 'ranking'} and len(dims) == 1:
        covered.add('segment:' + dims[0])
    if kind == 'distribution' and len(dims) == 1:
        covered.add('composition:' + dims[0])
    return covered


# Families whose requested evidence is already a complete, bespoke chain (a governed pair statistic, a reconciled
# driver decomposition) are not padded with generic lenses; curated dashboard presets keep their fixed layout.
SELF_CONTAINED_FAMILIES = set()


def expansion_applicable(req, ui):
    if (ui or {}).get('dashboard_template'):
        return False
    if question_family(req, (ui or {}).get('analysis_mission')) in SELF_CONTAINED_FAMILIES:
        return False
    return 'driver_delta' not in req.derived_features


def plan_lenses(resolver, requested, depth, baseline_views=0, mission_id=None):
    """Lens plan for every requested requirement. Returns ``dict(shapes, lenses, decisions, family)``.

    ``shapes`` are IntentRequirement candidates in priority order (core first, stable); each lens names the shape that
    feeds it, so one executed query can serve several lenses of different meaning (segment bar + exposure scatter + share).
    """
    targets = view_targets(resolver.catalog, depth)
    from services.analytical_resolver import digest, requirement_meaning
    registry = resolver.catalog.registry

    def lens_meaning(r):
        """The question a lens plan answers (metrics · scope · time · free axes · time-series or not). Grouping axes
        pinned to one value by the scope add no variation, so "rate by city WHERE city = X" and "rate WHERE city = X"
        are ONE question for planning; derived-feature wording and ids are labels, not a different population."""
        free = sorted(d for d in r.dimension_ids if d in registry['dimensions'] and not _pinned(registry, r.filters, d,
            include_identity=resolver.ui.get('fixed_grouping_policy')==FIXED_GROUPING_POLICY))
        return digest([sorted(r.metric_ids), sorted(digest(f.model_dump(mode='json')) for f in r.filters),
                       r.time.model_dump(mode='json', exclude_none=True) if r.time else None, free,
                       r.analysis_kind == 'trend' or bool(r.forecast), r.ranking.model_dump(mode='json') if r.ranking and free else None])

    unique = {}
    # Prefer the requirement whose own grouping is not degenerate (fewest pinned axes) as the lens seed.
    for r in sorted(requested, key=lambda r: (len(r.dimension_ids), r.id)):
        if r.availability == 'requested' and r.metric_ids and not r.supporting_for and expansion_applicable(r, resolver.ui):
            unique.setdefault(lens_meaning(r), r)
    candidates = sorted(unique.values(), key=lambda r: digest(requirement_meaning(r, resolver.reference, resolver.catalog)))
    plan = dict(version=lens_policy(resolver.catalog).get('version'), depth=depth, targets=targets, shapes=[], lenses=[], decisions=[],
                family=question_family(candidates[0], mission_id) if candidates else None)
    if not candidates or not sum(targets.values()):
        return plan
    core_left = max(0, targets.get('core', 0) - baseline_views)
    for index, req in enumerate(candidates):
        share = lambda total: total // (len(candidates) - index) + (total % (len(candidates) - index) > 0)
        quotas = {'core': share(core_left), 'diagnostic': share(targets.get('diagnostic', 0)), 'extended': share(targets.get('extended', 0))}
        # Lens identities stay short for the usual one-question report and become requirement-qualified when several
        # requested questions share one report (two "trend" lenses of different questions are different views).
        prefix = req.id if len(candidates) > 1 else None
        seeds = [(req, prefix)]
        if question_family(req, mission_id) == 'relationship' and len(req.metric_ids) >= 2:
            # A relationship is read through BOTH variables: each gets its own lenses over the same scope/time.
            seeds = [(req.model_copy(update=dict(metric_ids=[m], ranking=None, analysis_kind='aggregate', derived_features=[],
                                                 feature_metrics={})), '.'.join(filter(None, [prefix, m]))) for m in req.metric_ids[:2]]
        lenses, shapes = [], {}
        for position, (seed, tag) in enumerate(seeds):
            part = lambda total: total // (len(seeds) - position) + (total % (len(seeds) - position) > 0)
            seed_quota = {role: part(quotas[role] - sum(1 for l in lenses if l['role'] == role and not l.get('reserve'))) for role in quotas}
            planner = _Planner(resolver, seed, depth, seed_quota, _covered_by_requested(seed), mission_id, tag)
            lenses += planner.plan()
            plan['decisions'] += [dict(d, requirement_id=req.id) for d in planner.decisions]
            shapes.update({s.id: s for s in planner.shapes.values()})
        core_left = max(0, core_left - sum(1 for l in lenses if l['role'] == 'core' and not l.get('reserve')))
        for lens in lenses:
            lens['requirement_id'] = req.id
        plan['lenses'] += lenses
        for lens in sorted(lenses, key=lambda l: tuple(l['rank'])):
            if shapes.get(lens['shape']) and shapes[lens['shape']] not in plan['shapes']:
                plan['shapes'].append(shapes[lens['shape']])
    return plan


def supporting_candidates(resolver, requested, baseline_views=0):
    """Supporting shapes in priority order. The full lens plan (lens specs + typed decisions) is left on
    ``resolver.pending_lens_plan`` for the resolver; this function is also the single switch tests use to disable
    supporting expansion."""
    depth = resolver.ui.get('server_supporting_expansion')
    if depth not in {'focused', 'deep', 'comprehensive'}:
        return []
    plan = plan_lenses(resolver, requested, depth, baseline_views, resolver.ui.get('analysis_mission'))
    resolver.pending_lens_plan = plan
    return plan['shapes']
