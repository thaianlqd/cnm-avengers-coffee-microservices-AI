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
    evidence = analytical_features(hydrated, catalog, report.get('derived_feature_bindings'))
    report['evidence'] = evidence[:c.evidence_preview]
    report.update(build_dashboard(hydrated, evidence, DashboardPlan.model_validate(report['dashboard_plan_input']), catalog=catalog))
    bound_response(report, c)
    return report
