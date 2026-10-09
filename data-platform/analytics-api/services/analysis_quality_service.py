"""Report verification using immutable evidence; no warehouse SQL or provider calls."""
from copy import deepcopy
from datetime import date
import json
from services.analysis_quality_contract import AnalysisQualityAssessment, VERSION
from services.analysis_coverage_service import canonical_components
from services.analysis_catalog import AnalysisError
from services.analysis_query import validate_results
from services.analyst_contract import DashboardPlan, DashboardVisual
from services.dashboard_planner_service import chart_reason, comparison_reason, render, build_dashboard
from services.domain_intelligence_service import DomainIntelligence
from services.insight_service import analytical_features, grounded_narrative, trend_bucket_coverage

WEIGHTS = {'request_coverage': 30, 'semantic_consistency': 20, 'result_integrity': 20,
           'evidence_grounding': 15, 'visualization_appropriateness': 10, 'limitation_disclosure': 5}
LABELS = dict(zip(WEIGHTS, ['Phạm vi yêu cầu', 'Ngữ nghĩa & kế hoạch', 'Kết quả dữ liệu', 'Bằng chứng', 'Biểu đồ', 'Giới hạn dữ liệu']))
REASONS = {'historical_data_unavailable': 'Chưa có dữ liệu lịch sử cho phần yêu cầu này.',
           'metric_unavailable': 'Chỉ số yêu cầu chưa có trong danh mục.',
           'definition_unavailable': 'Chưa có định nghĩa hoặc dữ liệu để tính chỉ số yêu cầu.',
           'ambiguous_criterion': 'Cần chọn tiêu chí đánh giá.'}


def not_scored(reason='Chưa đủ metadata để kiểm chứng báo cáo.'):
    return AnalysisQualityAssessment(status='not_scored', reason=reason).model_dump(mode='json')


def restore_artifacts(report, catalog):
    """Recompile logical meaning and revalidate stored rows; never execute stored SQL."""
    from services.analytical_query_service import AnalyticalQueries
    from services.semantic_tools import SemanticTools
    context = report['quality_context']
    def forbidden(*args, **kwargs):
        raise AssertionError('Quality verification cannot access external data')
    semantic = SemanticTools(catalog, forbidden)
    queries = AnalyticalQueries(catalog, semantic, date.fromisoformat(context['reference_date']), forbidden, {}, proposal=True)
    queries.ui_context = context.get('ui_constraints', {})
    prepared = {}
    for raw in report['analytical_queries']:
        for f in raw.get('filters', []):
            semantic.resolved.setdefault(f['dimension'], set()).update(f['value'] if isinstance(f['value'], list) else [f['value']])
        a = queries.prepare(raw)
        if a.query.id in prepared:
            raise AnalysisError('quality_metadata', 'Duplicate operation')
        supplied = report['result_sets'][a.query.id]
        if supplied.get('artifact_ref'):
            from services.result_artifact_store import artifact_store, fingerprint
            ref = supplied['artifact_ref']
            if (ref['query_fingerprint'] != a.signature or ref['schema_fingerprint'] != catalog.fingerprint
                or ref['plan_fingerprint'] != fingerprint(a.plan.model_dump(mode='json'))):
                raise AnalysisError('quality_metadata', 'Result reference differs from approved query')
            a.result = artifact_store().get(ref)
            a.result_ref = ref
            if supplied.get('rows', []) != a.result['rows'][:len(supplied.get('rows', []))] or supplied['total_rows'] != len(a.result['rows']):
                raise AnalysisError('quality_metadata', 'Result preview mismatch')
        else:
            a.result = deepcopy(supplied)
        a.contract = validate_results(a.result, a.plan, a.grounded, catalog).model_dump()
        prepared[a.query.id] = a
    return prepared


def chart_checks(charts, artifacts, evidence=()):
    """Reuse production visual grammar and renderer, including exact numerical data."""
    from services.derived_chart_service import contribution_charts
    expected_derived={c['semantic_view_key']:c for c in contribution_charts(artifacts,evidence)}
    checks, identities = [], set()
    for chart in charts:
        try:
            if chart.get('value_transform'):
                expected=expected_derived.get(chart.get('semantic_view_key'))
                valid=bool(expected and all(chart.get(k)==v for k,v in expected.items()))
                key=('derived',chart.get('semantic_view_key'))
                if key in identities:valid=False
                identities.add(key)
                checks.append(dict(valid=valid,reason=None if valid else 'derived_chart_mismatch',
                    query_id=chart.get('query_id'),scope_refs=[chart.get('scope_ref')],metrics=chart.get('metrics',[]),covered_pairs=[]))
                continue
            ref = chart.get('query_id') or chart['scope_ref']
            a = artifacts[ref]
            comparison = chart.get('scope_refs', []) if not chart.get('x_field') else []
            v = DashboardVisual(query_id=ref, chart_type=chart['chart_type'], metrics=chart['metrics'],
                x_field=chart.get('x_field'), series_field=chart.get('series_field'),
                compare_query_ids=[id for id in comparison if id != ref], role=a.query.role,
                purpose='comparison')
            scopes = chart.get('scope_refs', [ref])
            if not isinstance(scopes, list) or ref not in scopes or any(id not in artifacts for id in scopes):
                raise ValueError('Invalid scopes')
            bindings = [(ref, m) for m in v.metrics]
            reason = comparison_reason(v, artifacts) if v.compare_query_ids else chart_reason(v, a, 100, 16)
            expected = None
            if not reason:
                expected = (next(c for c in build_dashboard(artifacts, [], DashboardPlan(active_query_ids=list(artifacts), visuals=[v]))['charts']
                                 if c.get('query_id', c.get('scope_ref')) == ref and set(c.get('scope_refs', [])) == set(scopes))
                            if v.compare_query_ids else render(v, a, 0))
                for key in ('data', 'metrics', 'unit', 'selection', 'series', 'series_keys', 'y_unit',
                            'ranking_metric','ranking_metric_label','ranking_direction','ranking_limit',
                            'ranking_per_group','ranking_note','category_fields','x_label'):
                    # Older one-axis charts already encode their entire grain
                    # in x_field. New tuple/partition metadata is mandatory only
                    # where omitting it could conceal additional meaning.
                    if key not in chart and (
                        key == 'category_fields' and len(expected.get(key, [])) == 1
                        or key == 'ranking_per_group' and not expected.get(key)
                    ):
                        continue
                    if chart.get(key) != expected.get(key):
                        reason = 'chart_data_mismatch'
                        break
                if not reason:
                    for id in scopes:
                        if id == ref:
                            continue
                        other = artifacts[id]
                        if v.compare_query_ids:
                            bindings.extend((id, m) for m in v.metrics)
                            continue
                        mapped = equivalent_visual_metrics(v, a, other, expected)
                        if mapped is None:
                            reason = 'false_chart_coverage'
                            break
                        bindings.extend((id, m) for m in mapped)
            identity = (expected['semantic_view_key'] if expected and not v.compare_query_ids else a.signature,
                        tuple(v.metrics) if v.compare_query_ids else (), v.x_field, v.series_field,
                        tuple(sorted(v.compare_query_ids)), 'share' if v.chart_type in {'donut', 'stacked_100'} else 'raw')
            if identity in identities:
                reason = 'duplicate_semantic_view'
            identities.add(identity)
            checks.append({'valid': reason is None, 'reason': reason, 'query_id': ref,
                           'scope_refs': scopes, 'metrics': v.metrics, 'covered_pairs': bindings})
        except (ValueError, TypeError, KeyError, IndexError, StopIteration):
            checks.append({'valid': False, 'reason': 'invalid_chart_contract', 'query_id': None, 'scope_refs': [], 'metrics': []})
    for key,chart in expected_derived.items():
        if ('derived',key) not in identities:
            checks.append(dict(valid=False,reason='missing_requested_derived_view',query_id=chart['query_id'],
                scope_refs=[chart['scope_ref']],metrics=chart['metrics'],covered_pairs=[]))
    return checks


def equivalent_visual_metrics(visual, source, other, expected):
    """Production merges identical physical views across domain metric aliases.

    Check the same renderer-owned semantic key AND actual values, so an alias
    cannot falsely claim coverage for a different population or tampered rows.
    """
    def identity(artifact, metric):
        definition = artifact.grounded.metrics[metric]
        return tuple(json.dumps(definition.get(k), sort_keys=True, default=str) for k in
                     ('expression', 'unit', 'business_filters', 'required_non_null'))
    mapped = []
    for metric in visual.metrics:
        matches = [m for m in other.plan.metrics if identity(source, metric) == identity(other, m)]
        if len(matches) != 1:
            return None
        mapped.append(matches[0])
    candidate = visual.model_copy(update={'query_id': other.query.id, 'metrics': mapped})
    if chart_reason(candidate, other, 100, 16):
        return None
    rendered = render(candidate, other, 0)
    if not rendered or rendered.get('semantic_view_key') != expected.get('semantic_view_key'):
        return None
    aliases = dict(zip(mapped, visual.metrics))
    def rows(data, rename=False):
        return sorted(json.dumps({aliases.get(k, k) if rename else k: value for k,value in row.items()},
                                 sort_keys=True, ensure_ascii=False, default=str) for row in data)
    if rows(rendered['data'], True) != rows(expected['data']):
        return None
    return mapped


def report_limitations(artifacts, charts, catalog, omissions=()):
    items = []
    def add(id, label, ref):
        if id not in {i['id'] for i in items}:
            items.append({'id': id, 'label': label, 'scope_ref': ref})
    for id, a in artifacts.items():
        for f in a.query.filters:
            definition=catalog.registry['dimensions'][f.dimension]
            if definition.get('population_selector'):
                values=f.value if isinstance(f.value,list) else [f.value]
                labels=definition.get('value_labels',{})
                add('population_filter:'+f.dimension,definition['business_name']+': '+', '.join(str(labels.get(v,v)) for v in values)+'. Áp dụng cho toàn bộ các góc nhìn trong phạm vi này.',id)
        for dim in a.plan.dimensions:
            definition=catalog.registry['dimensions'][dim]
            if definition.get('required_non_null'):
                add('dimension_population:'+dim,definition['business_name']+': '+definition.get('business_meaning',definition['business_name']),id)
        for metric in a.plan.metrics:
            definition = a.grounded.metrics[metric].get('business_meaning')
            if definition:
                add('metric_population:'+metric, a.grounded.metrics[metric]['business_name']+': '+definition, id)
            for limitation in catalog.registry['metrics'].get(metric,{}).get('analysis_limitations',[]):
                add('metric_limit:'+metric+':'+limitation['id'],limitation['label'],id)
        if any(not a.grounded.metrics[m].get('time_column') for m in a.plan.metrics):
            add('snapshot:'+id, 'Dữ liệu hiện trạng; không suy ra lịch sử theo kỳ.', id)
        if a.query.population_relation == 'related':
            add('related:'+id, 'Tập dữ liệu liên quan có quần thể riêng; không suy ra tỷ trọng hoặc nhân quả với phần chính.', id)
        if any(not a.grounded.metrics[m].get('additive') for m in a.plan.metrics):
            add('nonadditive:'+id, 'Trung bình hoặc số khách duy nhất không được cộng thành tổng giữa các nhóm.', id)
        if a.plan.ranking:
            add('topn:'+id, 'Tập Top N được chọn; không đại diện cơ cấu toàn bộ.', id)
        if a.plan.explicit_limit:
            add('limited:'+id, 'Kết quả giới hạn số dòng theo phạm vi đã duyệt.', id)
        if a.plan.kind == 'trend' and any(trend_bucket_coverage(r['period'], a.plan.granularity, a.grounded.period)['partial'] for r in a.result['rows']):
            add('partial_period:'+id, 'Kỳ biên chưa đủ ngày; chỉ so sánh biến động giữa các kỳ đầy đủ.', id)
    for c in charts:
        if c.get('selection') == 'display_subset':
            add('display_subset:'+c['scope_ref'], 'Biểu đồ hiển thị một phần nhóm; bảng và phép tính giữ toàn bộ kết quả.', c['scope_ref'])
    for i, omission in enumerate(omissions):
        labels = {'omitted_supporting_operations': 'Một phần hỗ trợ chưa hợp lệ hoặc vượt giới hạn đã được bỏ qua.',
                  'supporting_execution': 'Một kết quả hỗ trợ chưa vượt qua kiểm chứng đã được bỏ qua.',
                  'table_fallback': 'Một góc nhìn dùng bảng dữ liệu đầy đủ vì cấu trúc chưa phù hợp biểu đồ.'}
        if omission.get('reason') in labels:
            add('omission:'+str(i), labels[omission['reason']], None)
    return items


def assess_report(report, catalog, *, artifacts=None):
    # A bounded evidence preview does not replace the full verified fact set.
    if report.get('evidence_ref'):
        from services.result_artifact_store import artifact_store
        full_evidence = artifact_store().get(report['evidence_ref'])['rows']
        if report.get('evidence', []) != full_evidence[:len(report.get('evidence', []))]:
            return not_scored('Bằng chứng trình bày không khớp kho kết quả.')
        report = {**report, 'evidence': full_evidence}
    context = report.get('quality_context', {})
    if report.get('status') != 'success' or context.get('version') not in {'2.7', '2.8'} or not report.get('analysis_components'):
        return not_scored()
    if context.get('catalog_fingerprint') != catalog.fingerprint:
        return not_scored('Danh mục đã thay đổi; cần chạy lại để kiểm chứng theo phiên bản hiện tại.')
    try:
        artifacts = artifacts or restore_artifacts(report, catalog)
        if not artifacts:
            return not_scored()
        # Current validator verdict is authoritative, not a stored passed flag.
        for id, a in artifacts.items():
            verdict = validate_results(a.result, a.plan, a.grounded, catalog)
            if not verdict.valid or not report.get('result_contracts', {}).get(id, {}).get('valid'):
                return not_scored('Kết quả chưa vượt qua kiểm chứng; cần chạy lại phân tích.')
            if a.query.role == 'requested' and (not a.result['rows'] or (a.plan.metrics and not any(
                    row.get(metric) is not None for row in a.result['rows'] for metric in a.plan.metrics))):
                return not_scored('Không có giá trị quan sát cho phần yêu cầu; cần bổ sung dữ liệu.')
        components, _ = canonical_components(report['analysis_components'], artifacts, DomainIntelligence(catalog))
        if context.get('version') == '2.8':
            from services.analysis_intent import AnalysisIntentEnvelope
            from services.analytical_resolver import AnalyticalResolver, intent_fingerprint, digest, verify_operation_bindings
            from services.request_anchors import request_anchors, verify_anchors, refinement_anchors
            reference = date.fromisoformat(context['reference_date'])
            intent = AnalysisIntentEnvelope.model_validate(report['semantic_intent'])
            resolved = AnalyticalResolver(catalog,reference,context.get('ui_constraints',{})).resolve(intent)
            provenance = report.get('provenance',{})
            anchors, replayed = refinement_anchors(provenance['user_request'],provenance['initial_semantic_intent'],
                provenance.get('semantic_history', []),catalog,context.get('ui_constraints',{}),reference)
            if intent_fingerprint(replayed,reference,catalog) != intent_fingerprint(intent,reference,catalog):
                return not_scored('Lịch sử thay đổi ngữ nghĩa chưa vượt qua kiểm chứng.')
            if (verify_anchors(anchors,intent.requirements,reference,catalog)
                or resolved['coverage'] != report['resolved_requirement_coverage']
                or resolved['components'] != components
                or resolved['feature_bindings'] != report.get('derived_feature_bindings', [])
                or intent_fingerprint(intent,reference,catalog) != provenance.get('semantic_intent_fingerprint')
                or resolved['plan_fingerprint'] != provenance.get('resolved_plan_fingerprint')
                or digest(report['result_sets']) != provenance.get('result_set_fingerprint')):
                return not_scored('Phạm vi yêu cầu hoặc nguồn gốc kế hoạch chưa vượt qua kiểm chứng độc lập.')
            plans = [a.plan.model_dump(mode='json') for a in artifacts.values()]
            if (report.get('query_plans') != plans or provenance.get('query_plans') != plans
                or report.get('sql_by_query') != {id:a.sql for id,a in artifacts.items()}):
                return not_scored('Thông tin kế hoạch hoặc SQL lưu không khớp compiler hiện tại.')
            if not verify_operation_bindings(resolved['operations'], artifacts):
                return not_scored('Phép phân tích không khớp kế hoạch đã được máy chủ xác minh.')
    except (ValueError, KeyError, TypeError):
        return not_scored('Ngữ nghĩa hoặc metadata báo cáo chưa vượt qua kiểm chứng.')
    canonical = {e['id']: e for e in analytical_features(artifacts, catalog, report.get('derived_feature_bindings'))}
    # Index per-row feature evidence once; high-cardinality shares must not
    # require a quadratic scan during verification.
    feature_rows = {(e['scope_ref'],e['feature'],e['metric'],json.dumps(e['values'].get('dimensions'),sort_keys=True,default=str))
                    for e in canonical.values()}
    supplied = {e.get('id'): e for e in report.get('evidence', []) if isinstance(e, dict)}
    valid_refs = {id for id, e in supplied.items() if id in canonical and e == canonical[id]}
    def refs(scope):
        return [id for id in canonical if id in valid_refs and canonical[id]['scope_ref'] == scope][:3]
    def item(id, label, scope=None):
        return dict(id=id, label=label, evidence_refs=refs(scope))
    requested = [c for c in components if c['requested_or_supporting'] == 'requested']
    done = [c for c in requested if c['status'] == 'planned' and all(id in artifacts for id in c['operation_ids'])]
    missing = [c for c in requested if c not in done]
    def component_label(c):
        p = DomainIntelligence(catalog).available().get(c['domain_id'])
        lens = next((l for l in p['analytical_lenses'] if l['id'] == c['lens_id']), None) if p else None
        return lens['business_label'] if lens else p['business_label'] if p else 'Phần yêu cầu chưa được hỗ trợ'
    completed_items = [item(c['id'], component_label(c), next(iter(c['operation_ids']), None)) for c in done]
    missing_items = [item(c['id'], component_label(c)+': '+REASONS.get(c['reason'], 'Chưa thực hiện.')) for c in missing]
    claims = []
    # Evidence drives the visible dashboard highlights/findings. Verify its values/prose too.
    claims += [e.get('id') in valid_refs for e in report.get('evidence', [])]
    for card in report.get('kpi_cards', []):
        e = canonical.get(card.get('evidence_id'), {})
        field = {'scalar':'value','top_gap':'gap','selected_total':'total','change':'change','concentration':'largest_share_pct'}.get(e.get('feature'))
        label = {'scalar':'Giá trị trong phạm vi','top_gap':'Chênh lệch hạng 1–2','selected_total':'Tổng của tập Top N',
                 'change':'Thay đổi giữa hai kỳ quan sát','concentration':'Tỷ trọng lớn nhất'}.get(e.get('feature'))
        claims.append(card.get('evidence_id') in valid_refs and field is not None and card.get('value') == e.get('values', {}).get(field)
                      and card.get('unit') == ('%' if e.get('feature') == 'concentration' else e.get('unit'))
                      and card.get('label') == label and card.get('metric') == e.get('metric') and card.get('scope_ref') == e.get('scope_ref'))
    for finding in report.get('key_findings', []):
        e = canonical.get(finding.get('evidence_id'), {})
        claims.append(finding.get('evidence_id') in valid_refs and finding.get('finding') == e.get('statement') and finding.get('value_details') == e.get('values') and finding.get('value') == e.get('values', {}).get({'population_gap':'gap','peer_gap':'gap','group_comparison':'gap','leader':'value','top_gap':'gap','change':'change','concentration':'largest_share_pct','scalar':'value','selected_total':'total','pearson':'r'}.get(e.get('feature'),'')))
    try:
        expected_narrative = grounded_narrative(DashboardPlan.model_validate(report.get('dashboard_plan_input') or {'active_query_ids': list(artifacts)}), list(canonical.values()))
    except (ValueError, TypeError, KeyError):
        return not_scored('Kế hoạch trình bày chưa vượt qua kiểm chứng.')
    for statement in report.get('ai_insights', []):
        claims.append(any(e['statement'] == statement and id in valid_refs for id,e in canonical.items()))
    if report.get('executive_summary'):
        claims.append(report['executive_summary'] == expected_narrative['executive_summary'])
    for rec in report.get('recommendations', []):
        claims.append(rec.get('evidence_id') in valid_refs and rec in expected_narrative['recommendations'])
    for finding in report.get('key_findings', []):
        e = canonical.get(finding.get('evidence_id'))
        expected_comment = (f"Căn cứ {e['scope'].get('label', 'phần phân tích đã chọn')}; phạm vi {e['scope']['selection']}. Xem bằng chứng và phép tính kèm theo." if e else None)
        claims.append(e is not None and finding.get('comment') == expected_comment)
    for conclusion in report.get('conclusions', []):
        claims.append(conclusion in expected_narrative['conclusions'])
    charts = chart_checks(report.get('charts', []), artifacts, list(canonical.values()))
    applicable = [(id,m) for id,a in artifacts.items() if a.query.role == 'requested' and (a.plan.dimensions or a.plan.kind == 'trend') and a.plan.kind != 'detail' for m in a.plan.metrics]
    capacity_tables = {v['query_id'] for v in report.get('dashboard_plan',{}).get('omitted_visuals',[])
                       if v['reason'] in {'chart_point_budget','chart_payload_budget','category_budget','series_budget'}}
    table_pairs = {(t['query_id'],m) for t in report.get('dashboard_plan',{}).get('tables',[]) for m in t.get('metrics',[])
                   if t['query_id'] in capacity_tables and report['result_sets'].get(t['query_id'],{}).get('artifact_ref')}
    covered = sum(any(c['valid'] and (id,m) in c['covered_pairs'] for c in charts) or (id,m) in table_pairs for id,m in applicable)
    invalid_charts = sum(not c['valid'] for c in charts)
    visual_pass = covered + sum(c['valid'] for c in charts)
    visual_total = len(applicable) + len(charts)
    facts = report_limitations(artifacts, report.get('charts', []), catalog, context.get('limitations', []))
    disclosed = {i['id']:i for i in report.get('quality_limitations', []) if isinstance(i,dict)}
    disclosed_count = sum(disclosed.get(f['id']) == f for f in facts)
    ratios = [len(done)/len(requested) if requested else 0, 1, 1,
              sum(claims)/len(claims) if claims else 0, visual_pass/visual_total if visual_total else 1,
              disclosed_count/len(facts) if facts else 1]
    summaries = [f'{len(done)}/{len(requested)} phần yêu cầu đã thực hiện.',
        'Kế hoạch phù hợp danh mục và các ràng buộc đã duyệt.', f'{len(artifacts)} tập kết quả qua validator hiện tại.',
        f'{sum(claims)}/{len(claims)} phát biểu và chỉ số có bằng chứng hợp lệ.',
        f'{covered}/{len(applicable)} chỉ số cần biểu đồ được trình bày; {invalid_charts} biểu đồ chưa hợp lệ.' if visual_total else 'Câu hỏi chỉ cần KPI; không yêu cầu biểu đồ.',
        f'{disclosed_count}/{len(facts)} giới hạn dữ liệu được công bố.' if facts else 'Không phát hiện giới hạn cần công bố trong phạm vi kiểm tra.']
    breakdown = [dict(id=id, label=LABELS[id], score=round(weight*ratio), max_score=weight,
        status='not_applicable' if id == 'visualization_appropriateness' and not visual_total else 'passed' if ratio == 1 else 'partial' if ratio else 'failed', summary=summary, evidence_refs=list(sorted(valid_refs))[:3])
        for (id,weight),ratio,summary in zip(WEIGHTS.items(),ratios,summaries)]
    score = sum(c['score'] for c in breakdown)
    missing_features = []
    def verified_feature(binding):
        feature=aliases.get(binding['feature'],binding['feature'])
        if feature=='contribution_share':
            a=artifacts[binding['query_id']]
            return bool(a.result['rows'] and binding['metric_ids']) and all(
                (binding['query_id'],feature,metric,json.dumps({d:row[d] for d in a.plan.dimensions},sort_keys=True,default=str)) in feature_rows
                for metric in binding['metric_ids'] for row in a.result['rows'])
        return bool(binding['metric_ids']) and all(any(
            e['scope_ref']==binding['query_id'] and e['feature']==feature and
            (e['metric']==metric or feature=='pearson')
            for e in canonical.values()) for metric in binding['metric_ids'])
    if context.get('version') == '2.8':
        aliases = {'group_gap':'group_comparison', 'change_pct':'change', 'relationship_strength':'pearson'}
        for binding in report.get('derived_feature_bindings', []):
            feature = aliases.get(binding['feature'],binding['feature'])
            if not verified_feature(binding):
                missing_features.append(binding['requirement_id'])
        missing_items += [item(id+':derived', 'Chưa đủ quan sát để tính đặc trưng phân tích yêu cầu.') for id in sorted(set(missing_features))]
    cap = 74 if missing or missing_features or invalid_charts else 89 if context.get('coverage_origin') not in {'declared','server_resolved'} or not claims or not all(claims) or covered < len(applicable) or disclosed_count < len(facts) else 100
    score = min(score, cap)
    unverified = []
    if context.get('coverage_origin') not in {'declared','server_resolved'}:
        unverified.append(item('intent_coverage', 'Báo cáo cũ chỉ theo dõi các phép phân tích; chưa xác minh đầy đủ từng yêu cầu nghiệp vụ.'))
    if not claims or not all(claims):
        unverified.append(item('evidence_gap', f'{len(claims)-sum(claims)} phát biểu hoặc chỉ số chưa có bằng chứng kiểm chứng.'))
    if any(a.plan.kind == 'trend' for a in artifacts.values()):
        unverified.append(item('causes', 'Nguyên nhân biến động chưa được xác minh; dữ liệu mô tả các kỳ quan sát.'))
    actions = []
    if not claims or not all(claims):
        actions.append({**item('review_evidence', 'Đối chiếu bằng chứng hoặc chạy lại trước khi sử dụng các nhận định chưa được kiểm chứng.'), 'action':'review_evidence'})
    if invalid_charts or covered < len(applicable):
        actions.append({**item('review_visuals', 'Xem bảng kết quả đầy đủ và chọn cách trình bày phù hợp với các chỉ số.'), 'action':'review_scope'})
    for f in facts:
        if f['id'].startswith('snapshot:'):
            actions.append({**item(f['id'], 'Bổ sung nguồn lịch sử nếu muốn phân tích xu hướng.', f['scope_ref']), 'action':'add_history'})
        elif f['id'].startswith('partial_period:'):
            actions.append({**item(f['id'], 'Đối chiếu các kỳ đầy đủ có cùng độ dài.', f['scope_ref']), 'action':'compare_complete_periods'})
    for c in missing:
        action = 'add_history' if c['reason'] == 'historical_data_unavailable' else 'choose_criterion' if c['reason'] == 'ambiguous_criterion' else 'define_metric'
        actions.append({**item(c['id'], REASONS.get(c['reason'], 'Xem lại phạm vi yêu cầu.')), 'action':action})
    measurements = []
    hybrid = context.get('version') == '2.8'
    if hybrid:
        # These are observable counts, not independent Bernoulli trials and
        # never a calibrated probability. Do not aggregate them into accuracy.
        def check(id, label, passed, total, summary):
            return dict(id=id,label=label,passed=passed,total=total,
                status='not_applicable' if not total else 'passed' if passed==total else 'partial' if passed else 'failed',summary=summary)
        metric_values = [row.get(m) for a in artifacts.values() for row in a.result['rows'] for m in a.plan.metrics]
        observed = sum(v is not None for v in metric_values)
        bindings = report.get('derived_feature_bindings', [])
        feature_count = sum(verified_feature(b) for b in bindings)
        measurements = [
            check('request_coverage',LABELS['request_coverage'],len(done),len(requested),summaries[0]),
            check('semantic_consistency',LABELS['semantic_consistency'],1,1,'Phạm vi, lịch sử tinh chỉnh và các phép phân tích khớp danh mục hiện tại; chưa chứng minh mọi cách hiểu ngôn ngữ đều đúng.'),
            check('result_integrity',LABELS['result_integrity'],len(artifacts),len(artifacts),f'{len(artifacts)} tập kết quả qua kiểm tra cấu trúc, đơn vị, giới hạn và thứ tự; chưa xác minh tính đúng của dữ liệu nguồn.'),
            check('observed_values','Giá trị dữ liệu quan sát',observed,len(metric_values),f'{observed}/{len(metric_values)} ô chỉ số có giá trị; ô thiếu không được xem là số 0.'),
            check('derived_features','Phép tính được yêu cầu',feature_count,len(bindings),f'{feature_count}/{len(bindings)} phép tính yêu cầu có đủ quan sát và bằng chứng.'),
            check('evidence_grounding',LABELS['evidence_grounding'],sum(claims),len(claims),summaries[3]+' Được tính lại từ các tập kết quả đã lưu, không phải đối chứng dữ liệu độc lập.'),
            check('visualization_appropriateness',LABELS['visualization_appropriateness'],visual_pass,visual_total,summaries[4]),
            check('limitation_disclosure',LABELS['limitation_disclosure'],disclosed_count,len(facts),summaries[5]),
        ]
        # Recompute depth from protected request facts, not the displayed count
        # or a saved success flag. One requested metric cannot prove a broad
        # evaluation was fully delivered.
        ui=context.get('ui_constraints',{})
        from services.analysis_expansion_service import dashboard_policy
        minimum = max(dashboard_policy(catalog)['minimum_views'], ui.get('minimum_visuals',0))
        if minimum:
            valid_views=sum(c['valid'] for c in charts)
            measurements.append(check('analysis_depth_coverage','Độ đầy đủ góc nhìn',min(valid_views,minimum),minimum,
                f'{valid_views}/{minimum} góc nhìn độc lập được kiểm chứng; mọi báo cáo phân tích cần đủ góc nhìn.'))
            if valid_views<minimum:
                unverified.append(item('insufficient_views',f'Chưa đủ góc nhìn: {valid_views}/{minimum}. Các bảng dữ liệu không thay thế biểu đồ còn thiếu.'))
                actions.append({**item('complete_views','Bổ sung góc nhìn đúng phạm vi hoặc công bố dữ liệu chưa hỗ trợ.'),'action':'review_scope'})
        if report.get('capacity'):
            from services.result_artifact_store import fingerprint
            population = []
            provenance_checks = []
            for id,a in artifacts.items():
                r = report['result_sets'][id]
                ref = r.get('artifact_ref') or {}
                population.append(not a.result.get('truncated') and r.get('total_rows') == len(a.result['rows'])
                    and r.get('rows', []) == a.result['rows'][:len(r.get('rows', []))])
                provenance_checks.append(ref.get('content_hash') == fingerprint(a.result)
                    and ref.get('query_fingerprint') == a.signature and ref.get('schema_fingerprint') == catalog.fingerprint
                    and ref.get('plan_fingerprint') == fingerprint(a.plan.model_dump(mode='json')))
            for binding in bindings:
                if binding['feature']=='contribution_share':
                    numerator=artifacts[binding['query_id']]
                    denominator=artifacts[binding['denominator_query_id']]
                    population.append(not denominator.plan.ranking and not denominator.plan.explicit_limit
                        and not denominator.result.get('truncated') and denominator.query.filters==numerator.query.filters
                        and denominator.grounded.period==numerator.grounded.period and verified_feature(binding))
            measurements.extend([
                check('population_correctness','Quần thể và mẫu số',sum(population),len(population),
                      'Kiểm tra toàn bộ kết quả không bị cắt; phần hiển thị là tiền tố có gắn tổng số nhóm. Tỷ trọng được tính lại với truy vấn mẫu số đầy đủ.'),
                check('provenance_completeness','Nguồn gốc kết quả',sum(provenance_checks),len(provenance_checks),
                      'Hash nội dung, truy vấn, kế hoạch và danh mục khớp kết quả đầy đủ; không xác nhận dữ liệu nguồn độc lập.')])
        unverified.append(item('independent_accuracy','Chưa có đáp án đối chứng độc lập cho yêu cầu này; độ chính xác và xác suất trả lời đúng chưa được đo.'))
    complete = cap==100 and all(c['status'] in {'passed','not_applicable'} for c in measurements)
    scored = {}
    if hybrid:
        from services.verification_score import verification_score
        scored = verification_score(measurements)
    return AnalysisQualityAssessment(**scored, **({} if hybrid else {'score':score}),
        grade=('good' if complete else 'partial') if hybrid else 'excellent' if score>=90 else 'good' if score>=75 else 'partial' if score>=50 else 'needs_attention',
        status='verified' if complete else 'partially_verified', components=[] if hybrid else breakdown,
        measurement_mode='evidence_checks' if hybrid else 'legacy_weighted_checks',verification_checks=measurements,
        completed=completed_items, missing=missing_items, unverified=unverified,
        limitations=[item(f['id'],f['label'],f['scope_ref']) for f in facts], suggested_next_actions=actions,
        coverage=dict(requested_count=len(requested), completed_count=len(done), supporting_count=sum(c['requested_or_supporting']=='supporting' and c['status']=='planned' for c in components), omitted_count=len(missing))).model_dump(mode='json')


def verify_saved_report(report, catalog):
    """Bound CPU/memory and discard client-supplied/stale score before rechecking."""
    try:
        if not isinstance(report, dict):
            return not_scored()
        queries = report.get('analytical_queries', [])
        results = report.get('result_sets', {})
        from services.analytical_capacity_planner import AnalyticalCapacityContract
        c = AnalyticalCapacityContract.from_env()
        if (not isinstance(queries, list) or len(queries)>c.operations or not isinstance(results, dict) or len(results)>c.operations
            or len(report.get('evidence', []))>4000 or len(report.get('charts', []))>24
            or len(report.get('analysis_components', []))>16
            or any(not isinstance(r, dict) or len(r.get('rows', []))>(c.preview_rows if r.get('artifact_ref') else c.execution_rows) for r in results.values())):
            return not_scored('Báo cáo vượt giới hạn kiểm chứng; cần chạy lại phân tích.')
        return assess_report(report, catalog)
    except (AnalysisError, ValueError, KeyError, TypeError, AttributeError, IndexError):
        return not_scored('Metadata báo cáo chưa hợp lệ; cần chạy lại phân tích.')
