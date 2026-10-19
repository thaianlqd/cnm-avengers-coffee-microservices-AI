"""Direct answers from full artifacts and canonical evidence, independent of chart paging/order."""
from services.chart_insight_service import fmt


def direct_answers(coverage, artifacts, evidence, catalog, mission=None):
    answers, bindings = [], []
    for requirement in coverage or []:
        if requirement.get('supporting_for') or requirement.get('state') != 'RESOLVED': continue
        ids=set(requirement.get('operation_ids',[]))
        role='change' if 'driver_delta' in requirement.get('derived_features',[]) else next(
            (v['kind'] for v in requirement.get('views',[]) if v.get('required',True)),None)
        if (mission=='compare' or 'group_gap' in requirement.get('derived_features',[])) and role=='grouped':
            preferred={'group_comparison','peer_gap','population_gap'}
        else:
            preferred={'driver_delta','driver_status'} if role=='change' else {'pearson','pair_status'} if role=='paired_scatter' else {'change','period_coverage'} if role=='time_series' else {'leader','top_gap'} if role=='ranking' else {'scope_total','scalar'}
        found=[e for e in evidence if e.get('scope_ref') in ids and e.get('feature') in preferred]
        comparisons=[e for e in evidence if e.get('scope_ref') in ids and e.get('feature') in {'period_comparison','ranked_companion'}]
        found=comparisons+found
        # Scalar totals take precedence over a grouped single-row scalar.
        found.sort(key=lambda e: (e.get('feature')!='period_comparison', bool(artifacts.get(e['scope_ref']) and artifacts[e['scope_ref']].plan.dimensions), e.get('feature')!='scope_total', e['id']))
        seen=set()
        for e in found:
            metric=e.get('metric')
            if metric in seen: continue
            seen.add(metric)
            answers.append(e['statement'])
            bindings.append(dict(requirement_id=requirement['requirement_id'],role=role,evidence_id=e['id'],
                query_id=e['scope_ref'],metric=metric,unit=e.get('unit'),scope=e.get('scope'),statement=e['statement']))
    return list(dict.fromkeys(answers)), bindings


def conclusion_from_report(report, artifacts, catalog, evidence=None):
    """Replay all visible conclusion fields from validated artifacts/metadata."""
    from services.insight_service import analytical_features, grounded_narrative
    from services.analyst_contract import DashboardPlan
    from services.chart_insight_service import build_conclusion, chart_insights, short_answer
    from services.forecast_service import report_forecasts
    from copy import deepcopy
    from datetime import date
    context=report.get('quality_context') or {}
    reference=date.fromisoformat(context['reference_date'])
    coverage=report.get('resolved_requirement_coverage') or []
    evidence=evidence if evidence is not None else analytical_features(artifacts,catalog,report.get('derived_feature_bindings'),as_of=reference)
    narrative=grounded_narrative(DashboardPlan.model_validate(report['dashboard_plan_input']),evidence)
    charts=deepcopy(report.get('charts') or [])
    chart_insights(charts,artifacts,catalog,reference,report.get('analysis_mission'))
    answers, bindings=direct_answers(coverage,artifacts,evidence,catalog,report.get('analysis_mission'))
    forecasts=report_forecasts(artifacts,coverage,catalog,reference)
    if forecasts:
        from services.chart_insight_service import _forecast_sentences
        cadence=catalog.registry.get('workspace',{}).get('forecast_cadence_labels',{})
        future,_,_=_forecast_sentences(forecasts,cadence)
        answers=list(dict.fromkeys([*future,*answers]))
        for fc in forecasts:
            bindings.append(dict(requirement_id=fc['requirement_id'],role='forecast',forecast_ref=fc['requirement_id'],
                metric=fc.get('metric_id'),unit=fc.get('metric_unit'),cadence=fc.get('unit'),query_id=fc.get('query_id')))
    else:answers=answers or short_answer(charts)
    caveats=[v['message'] for v in context.get('limitations',[]) if v.get('message')]
    caveats += [v.get('label') or v.get('message') for v in report.get('quality_limitations',[]) if v.get('label') or v.get('message')]
    caveats += list(dict.fromkeys(s for a in artifacts.values() for s in a.grounded.analysis_spec.assumptions))
    scope=(report.get('request_anchors') or {}).get('scope_resolution') or {}
    if scope.get('source'):
        caveats.append('Phân vùng báo cáo nội bộ theo '+', '.join(sorted({str(s['source'])+' v'+str(s['version']) for s in scope['source']}))+
            '; phạm vi chỉ gồm các tỉnh/thành được quản trị trong danh mục kho, không đại diện toàn bộ địa bàn thực tế.')
    if any(b.get('excluded_members') for b in scope.get('bindings',[])):
        caveats.append('Phạm vi loại trừ được tính trong tập địa danh có trong danh mục; địa danh chưa phân loại hoặc NULL không thuộc tập này.')
    if not any(a.result['rows'] for a in artifacts.values()): caveats.append('Không có dữ liệu trong phạm vi yêu cầu.')
    result=build_conclusion(answers,narrative,evidence,caveats,report.get('follow_up_questions') or [],forecasts=forecasts,
        chart_caveats=[c for ch in charts for c in ch.get('insight',{}).get('caveats',[])],
        unanswered=[c.get('goal') or c['requirement_id'] for c in coverage if c.get('state') not in {'RESOLVED',None}],
        cadence_labels=catalog.registry.get('workspace',{}).get('forecast_cadence_labels',{}))
    return result,answers,bindings
