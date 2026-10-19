"""Transport is presentation; report truth lives in validated result artifacts."""
from copy import deepcopy
import logging
from services.analysis_catalog import AnalysisError
from services.result_artifact_store import serialized

logger = logging.getLogger('ai-analytics')


def bound_response(report, contract):
    # Reduce rows/evidence only; oversized charts become explicit paged tables
    # before verification (see dashboard planner). Control metadata stays intact.
    eligible_charts = []
    for chart in report.get('charts', []):
        if len(serialized(chart)) > contract.response_bytes // 8:
            report['dashboard_plan'].setdefault('omitted_visuals', []).append(dict(query_id=chart.get('query_id') or chart.get('scope_ref'),
                chart_type=chart['chart_type'], role=chart.get('role','requested'), priority=0, reason='chart_payload_budget'))
        else:
            eligible_charts.append(chart)
    report['charts'] = eligible_charts
    for target in [*report.get('result_sets', {}).values(), report.get('table_data', {})]:
        while target.get('rows') and len(serialized(target['rows'])) > contract.response_bytes // 16:
            target['rows'] = target['rows'][:len(target['rows'])//2]
        if 'displayed_count' in target:
            target['displayed_count'] = len(target.get('rows', []))
    report['capacity']['displayed_count'] = sum(len(r['rows']) for r in report['result_sets'].values())
    # Metadata fingerprints refer to the representation actually transported.
    if report.get('provenance'):
        from services.analytical_resolver import digest
        report['provenance']['result_set_fingerprint'] = digest(report['result_sets'])
    for _ in range(4):
        report['capacity']['response_bytes'] = len(serialized(report))
    if report['capacity']['response_bytes'] > contract.response_bytes:
        logger.warning('[Presentation] oversized_sections=%s', {k:len(serialized(v)) for k,v in report.items() if len(serialized(v))>100000})
        raise AnalysisError('response_capacity', 'Report control metadata exceeds transport capacity')
    logger.info('[Presentation] population_count=%s displayed_count=%s payload_bytes=%s',
                report['capacity']['full_population_count'], report['capacity']['displayed_count'], report['capacity']['response_bytes'])


def session_report_summary(report):
    # Refinement/module saving need meaning, fingerprints and chart settings.
    summary = deepcopy(report)
    summary['result_sets'] = {id:{k:v for k,v in r.items() if k != 'rows'} for id,r in summary['result_sets'].items()}
    summary.get('table_data', {}).pop('rows', None)
    for chart in summary.get('charts', []):
        chart.pop('data', None)
    summary['evidence'] = []
    return summary


def restore_report_presentation(report, artifacts, catalog):
    from services.analytical_capacity_planner import AnalyticalCapacityContract
    from services.result_artifact_store import artifact_store
    from services.analysis_quality_service import restore_artifacts
    from services.insight_service import analytical_features
    from services.dashboard_planner_service import build_dashboard
    from services.analyst_contract import DashboardPlan
    c = AnalyticalCapacityContract.from_env()
    for id, a in artifacts.items():
        if a.result_ref:
            report['result_sets'][id]['rows'] = artifact_store().get(a.result_ref)['rows'][:c.preview_rows]
    first = next(iter(report['result_sets'].values()))
    report['table_data']['rows'] = first['rows']
    hydrated = restore_artifacts(report, catalog)
    evidence = analytical_features(hydrated, catalog, report.get('derived_feature_bindings'), as_of=(report.get('quality_context') or {}).get('reference_date'))
    report['evidence'] = evidence[:c.evidence_preview]
    dashboard=build_dashboard(hydrated, evidence, DashboardPlan.model_validate(report['dashboard_plan_input']), catalog=catalog)
    # Saved summaries retain verified view bindings/insights, but omit only data.
    # Rebuilding presentation must not drop those later pipeline annotations.
    rebuilt={chart['id']:chart for chart in dashboard['charts']}
    restored=[]
    for chart in report.get('charts',[]):
        current=rebuilt.get(chart['id'])
        if (current is None or current.get('query_id')!=chart.get('query_id') or
            current.get('chart_type')!=chart.get('chart_type') or current.get('metrics')!=chart.get('metrics')):
            raise AnalysisError('quality_metadata','Stored chart no longer matches approved artifact rendering')
        restored.append({**current,**chart,'data':current['data']})
    dashboard['charts']=restored
    report.update(dashboard)
    from services.analysis_quality_service import chart_checks
    if any(not check['valid'] for check in chart_checks(report['charts'],hydrated,evidence)):
        raise AnalysisError('quality_metadata','Restored chart does not match full artifact')
    bound_response(report, c)
    return report


def assemble_report_payload(*, artifacts, catalog, session, meaning, results, dashboard, narrative,
        forecasts, mission, insights, view_cov, short_answer, relevance, domain_summary, evidence,
        semantic_info, planning_mode, diagnostics, refined=False):
    """Pure presentation assembly; meaning, plans and values are validated upstream."""
    from datetime import datetime
    from services.workspace_service import mission_layout, follow_up_questions
    from services.chart_insight_service import build_conclusion
    from services.explanation_service import explain_analysis
    main = next(iter(artifacts.values()))
    first = results[main.query.id]
    return {
        "status": "success",
        "completion_status": "complete",
        "pipeline_version": semantic_info.get("pipeline_version", "2.8" if planning_mode == "one_shot" else "2.3"),
        "prompt": session.original_prompt,
        "module_provenance": session.module_provenance,
        "analysis_breadth": semantic_info.get("analysis_depth", session.analysis_depth),
        "session_id": session.session_id,
        "revision": session.revision + (1 if session.approved else 0),
        "title": meaning["subject"],
        "description": "Phân tích từ các kết quả đã kiểm chứng.",
        "domain_summary": domain_summary,
        "analysis_spec": main.grounded.analysis_spec.model_dump(mode="json"),
        "analysis_specs": {
            id: a.grounded.analysis_spec.model_dump(mode="json")
            for id, a in artifacts.items()
        },
        "analytical_queries": [
            a.query.model_dump(mode="json") for a in artifacts.values()
        ],
        "grounded_analysis_spec": main.grounded.model_dump(mode="json"),
        "query_plans": [a.plan.model_dump(mode="json") for a in artifacts.values()],
        "schema_fingerprint": catalog.fingerprint,
        "interpretation": meaning,
        "interpreted_request": meaning,
        "assumptions": list(
            dict.fromkeys(
                s
                for a in artifacts.values()
                for s in a.grounded.analysis_spec.assumptions
            )
        ),
        **dashboard,
        **narrative,
        "kpis": {},
        "forecasts": forecasts,
        "analysis_mission": mission["id"] if mission else None,
        "mission_layout": mission_layout(mission, dashboard["charts"]),
        "follow_up_questions": follow_up_questions(artifacts, catalog, mission),
        "chart_insights": insights,
        "view_coverage": view_cov,
        "short_answer": short_answer,
        "conclusion": build_conclusion(short_answer, narrative, evidence,
            [v["message"] for v in semantic_info.get("limitations", [])]
            + (["Không có dữ liệu trong phạm vi yêu cầu."] if not any(a.result["rows"] for a in artifacts.values()) else [])
            + list(dict.fromkeys(s for a in artifacts.values() for s in a.grounded.analysis_spec.assumptions))
            + [f"Chưa có góc nhìn bắt buộc cho yêu cầu {v['requirement_id']} ({v['kind']}): {v['reason']}." for v in view_cov if v["required"] and v["status"] == "missing"],
            follow_up_questions(artifacts, catalog, mission), forecasts=forecasts,
            chart_caveats=[c for ch in dashboard["charts"] for c in (ch.get("insight") or {}).get("caveats", [])],
            unanswered=[c.get("goal") or c.get("requirement_id") for c in (semantic_info.get("resolved_requirement_coverage") or [])
                        if c.get("state") not in {"RESOLVED", None} and (c.get("goal") or c.get("requirement_id"))],
            cadence_labels=catalog.registry.get("workspace", {}).get("forecast_cadence_labels", {})),
        "mission_evidence": relevance,
        "input_mode": semantic_info.get("input_mode", "free_text"),
        "evidence": evidence,
        "analysis_explanation": explain_analysis(
            artifacts, catalog, dashboard["charts"], evidence
        ),
        "result_sets": results,
        "result_contracts": {id: a.contract for id, a in artifacts.items()},
        "table_data": {
            "title": meaning["subject"],
            "columns": first["columns"],
            "column_labels": first["column_labels"],
            "rows": first["rows"],
            "total_rows": first['total_rows'],
            "query_id": main.query.id,
            "artifact_ref": main.result_ref,
        },
        "sql": {"main": main.sql},
        "sql_query": main.sql,
        "sql_by_query": {id: a.sql for id, a in artifacts.items()},
        "data_warnings": (
            ["Không có dữ liệu trong phạm vi yêu cầu."]
            if not any(a.result["rows"] for a in artifacts.values())
            else []
        )
        + [v["message"] for v in semantic_info.get("limitations", [])],
        "provider": {
            "planner": "catalog_compiler",
            "synthesis": "validated_evidence",
        },
        "created_at": datetime.now().astimezone().isoformat(),
        "assistant_reply": (
            "Đã cập nhật báo cáo theo kế hoạch đã kiểm chứng." if refined else ""
        ),
        "diagnostics": diagnostics,
    }
