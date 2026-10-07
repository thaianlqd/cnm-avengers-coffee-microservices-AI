"""Pure report verification, distinct from golden accuracy. No I/O or SQL execution."""
from copy import deepcopy
from datetime import date
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


def not_scored(reason='Chưa đủ metadata để chấm theo V2.7'):
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
        a.result = deepcopy(report['result_sets'][a.query.id])
        a.contract = validate_results(a.result, a.plan, a.grounded, catalog).model_dump()
        prepared[a.query.id] = a
    return prepared


def chart_checks(charts, artifacts):
    """Reuse production visual grammar and renderer, including exact numerical data."""
    checks, identities = [], set()
    for chart in charts:
        try:
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
            if not v.compare_query_ids and any(artifacts[id].signature != a.signature or not set(v.metrics) <= set(artifacts[id].plan.metrics) for id in scopes):
                raise ValueError('False chart coverage')
            reason = comparison_reason(v, artifacts) if v.compare_query_ids else chart_reason(v, a, 100, 16)
            if not reason:
                expected = (build_dashboard(artifacts, [], DashboardPlan(active_query_ids=list(artifacts), visuals=[v]))['charts'][0]
                            if v.compare_query_ids else render(v, a, 0))
                for key in ('data', 'metrics', 'unit', 'selection', 'series', 'series_keys', 'y_unit'):
                    if chart.get(key) != expected.get(key):
                        reason = 'chart_data_mismatch'
                        break
            identity = (a.signature, tuple(v.metrics), v.x_field, v.series_field,
                        tuple(sorted(v.compare_query_ids)), 'share' if v.chart_type in {'donut', 'stacked_100'} else 'raw')
            if identity in identities:
                reason = 'duplicate_semantic_view'
            identities.add(identity)
            checks.append({'valid': reason is None, 'reason': reason, 'query_id': ref,
                           'scope_refs': chart.get('scope_refs', [ref]), 'metrics': v.metrics})
        except (ValueError, TypeError, KeyError, IndexError):
            checks.append({'valid': False, 'reason': 'invalid_chart_contract', 'query_id': None, 'scope_refs': [], 'metrics': []})
    return checks


def report_limitations(artifacts, charts, catalog, omissions=()):
    items = []
    def add(id, label, ref):
        if id not in {i['id'] for i in items}:
            items.append({'id': id, 'label': label, 'scope_ref': ref})
    for id, a in artifacts.items():
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
    context = report.get('quality_context', {})
    if report.get('status') != 'success' or context.get('version') != '2.7' or not report.get('analysis_components'):
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
        components, _ = canonical_components(report['analysis_components'], artifacts, DomainIntelligence(catalog))
    except (ValueError, KeyError, TypeError):
        return not_scored('Ngữ nghĩa hoặc metadata báo cáo chưa vượt qua kiểm chứng.')
    canonical = {e['id']: e for e in analytical_features(artifacts, catalog)}
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
        claims.append(card.get('evidence_id') in valid_refs and field is not None and card.get('value') == e.get('values', {}).get(field) and card.get('unit') == ('%' if e.get('feature') == 'concentration' else e.get('unit')))
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
    charts = chart_checks(report.get('charts', []), artifacts)
    applicable = [(id,m) for id,a in artifacts.items() if a.query.role == 'requested' and (a.plan.dimensions or a.plan.kind == 'trend') and a.plan.kind != 'detail' for m in a.plan.metrics]
    covered = sum(any(c['valid'] and id in c['scope_refs'] and m in c['metrics'] for c in charts) for id,m in applicable)
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
    cap = 74 if missing or invalid_charts else 89 if context.get('coverage_origin') != 'declared' or not claims or not all(claims) or covered < len(applicable) or disclosed_count < len(facts) else 100
    score = min(score, cap)
    unverified = []
    if context.get('coverage_origin') != 'declared':
        unverified.append(item('intent_coverage', 'Báo cáo cũ chỉ theo dõi các phép phân tích; chưa xác minh đầy đủ từng yêu cầu nghiệp vụ.'))
    if not claims or not all(claims):
        unverified.append(item('evidence_gap', f'{len(claims)-sum(claims)} phát biểu hoặc chỉ số chưa có bằng chứng kiểm chứng.'))
    if any(a.plan.kind == 'trend' for a in artifacts.values()):
        unverified.append(item('causes', 'Nguyên nhân biến động chưa được xác minh; dữ liệu mô tả các kỳ quan sát.'))
    actions = []
    for f in facts:
        if f['id'].startswith('snapshot:'):
            actions.append({**item(f['id'], 'Bổ sung nguồn lịch sử nếu muốn phân tích xu hướng.', f['scope_ref']), 'action':'add_history'})
        elif f['id'].startswith('partial_period:'):
            actions.append({**item(f['id'], 'Đối chiếu các kỳ đầy đủ có cùng độ dài.', f['scope_ref']), 'action':'compare_complete_periods'})
    for c in missing:
        action = 'add_history' if c['reason'] == 'historical_data_unavailable' else 'choose_criterion' if c['reason'] == 'ambiguous_criterion' else 'define_metric'
        actions.append({**item(c['id'], REASONS.get(c['reason'], 'Xem lại phạm vi yêu cầu.')), 'action':action})
    return AnalysisQualityAssessment(score=score, grade='excellent' if score>=90 else 'good' if score>=75 else 'partial' if score>=50 else 'needs_attention',
        status='verified' if cap==100 else 'partially_verified', components=breakdown,
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
        if (not isinstance(queries, list) or len(queries)>8 or not isinstance(results, dict) or len(results)>8
            or len(report.get('evidence', []))>4000 or len(report.get('charts', []))>24
            or len(report.get('analysis_components', []))>16
            or any(not isinstance(r, dict) or len(r.get('rows', []))>2000 for r in results.values())):
            return not_scored('Báo cáo vượt giới hạn kiểm chứng; cần chạy lại phân tích.')
        return assess_report(report, catalog)
    except (ValueError, KeyError, TypeError, AttributeError, IndexError):
        return not_scored('Metadata báo cáo chưa hợp lệ; cần chạy lại phân tích.')
