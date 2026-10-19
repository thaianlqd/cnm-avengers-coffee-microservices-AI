"""Reviewed HTTP access declarations, independent of analytical implementation.

None means public: health, auth handlers that validate their own credentials,
API documentation, or the non-API SPA fallback. Unknown API routes never inherit
permissions from prefixes, HTTP verbs or a privileged caller.
"""
from types import MappingProxyType
from starlette.routing import compile_path

DECLARED = MappingProxyType({
    ('GET', '/metrics'): 'system.read',
    ('DELETE', '/api/ai/modules/{module_id}'): 'reports.save',
    ('DELETE', '/api/reports/saved/{report_id}'): 'reports.save',
    ('GET', '/api/ai/analysis-jobs/{job_id}'): 'analytics.read',
    ('GET', '/api/ai/capabilities'): 'analytics.read',
    ('GET', '/api/ai/dashboards'): 'analytics.read',
    ('GET', '/api/ai/modules'): 'analytics.read',
    ('GET', '/api/ai/modules/{module_id}'): 'analytics.read',
    ('GET', '/api/ai/modules/{module_id}/runs/{report_id}'): 'analytics.read',
    ('GET', '/api/ai/scope-values'): 'analytics.read',
    ('GET', '/api/ai/sessions/{session_id}/results/{query_id}'): 'analytics.read',
    ('GET', '/api/ai/status'): 'analytics.read',
    ('GET', '/api/auth/session'): None,
    ('GET', '/api/branch-taste'): 'analytics.read',
    ('GET', '/api/customers/overview'): 'analytics.read',
    ('GET', '/api/health'): None,
    ('GET', '/api/kpi'): 'analytics.read',
    ('GET', '/api/marts/all'): 'analytics.read',
    ('GET', '/api/payment-methods'): 'analytics.read',
    ('GET', '/api/platform/catalog'): 'platform.read',
    ('GET', '/api/platform/lakehouse'): 'platform.read',
    ('GET', '/api/platform/lineage'): 'platform.read',
    ('GET', '/api/platform/overview'): 'platform.read',
    ('GET', '/api/platform/pipelines'): 'platform.read',
    ('GET', '/api/platform/quality'): 'platform.read',
    ('GET', '/api/platform/streaming'): 'platform.read',
    ('GET', '/api/platform/table-columns/{schema_name}/{table_name}'): 'platform.read',
    ('GET', '/api/products/overview'): 'analytics.read',
    ('GET', '/api/readiness'): None,
    ('GET', '/api/realtime-events'): 'platform.read',
    ('GET', '/api/reports/logs'): 'system.read',
    ('GET', '/api/reports/saved'): 'analytics.read',
    ('GET', '/api/reports/saved/{report_id}'): 'analytics.read',
    ('GET', '/api/reports/saved/{report_id}/download-docx'): 'reports.export',
    ('GET', '/api/reports/saved/{report_id}/execute'): 'sql.explore',
    ('GET', '/api/reports/saved/{report_id}/run'): 'sql.explore',
    ('GET', '/api/revenue-trend'): 'analytics.read',
    ('GET', '/api/stores/list'): 'analytics.read',
    ('GET', '/api/stores/overview'): 'analytics.read',
    ('GET', '/api/system/logs'): 'system.read',
    ('GET', '/api/system/metrics'): 'system.read',
    ('GET', '/api/system/users'): 'system.read',
    ('GET', '/api/top-products'): 'analytics.read',
    ('GET', '/api/warehouse/tables'): 'warehouse.read',
    ('GET', '/docs'): None,
    ('GET', '/docs/oauth2-redirect'): None,
    ('GET', '/health'): None,
    ('GET', '/liveness'): None,
    ('GET', '/openapi.json'): None,
    ('GET', '/redoc'): None,
    ('GET', '/{full_path:path}'): None,
    ('HEAD', '/docs'): None,
    ('HEAD', '/docs/oauth2-redirect'): None,
    ('HEAD', '/openapi.json'): None,
    ('HEAD', '/redoc'): None,
    ('PATCH', '/api/ai/modules/{module_id}'): 'reports.save',
    ('POST', '/api/ai/analysis-jobs'): 'analytics.read',
    ('POST', '/api/ai/analysis-jobs/cancel-by-key'): 'analytics.read',
    ('POST', '/api/ai/analysis-jobs/{job_id}/cancel'): 'analytics.read',
    ('POST', '/api/ai/feedback'): 'analytics.read',
    ('POST', '/api/ai/generate-executive-report'): 'analytics.read',
    ('POST', '/api/ai/modules'): 'reports.save',
    ('POST', '/api/ai/modules/{module_id}/rerun'): 'reports.save',
    ('POST', '/api/ai/preflight'): 'analytics.read',
    ('POST', '/api/ai/propose-plan'): 'analytics.read',
    ('POST', '/api/ai/refine-report'): 'analytics.read',
    ('POST', '/api/ai/risk-watch'): 'analytics.read',
    ('POST', '/api/ai/sessions/{session_id}/reconcile'): 'analytics.read',
    ('POST', '/api/ai/summarize'): 'analytics.read',
    ('POST', '/api/ai/verify-report'): 'analytics.read',
    ('POST', '/api/auth/login'): None,
    ('POST', '/api/auth/logout'): None,
    ('POST', '/api/auth/session'): None,
    ('POST', '/api/platform/pipelines/trigger'): 'pipeline.trigger',
    ('POST', '/api/query'): 'sql.explore',
    ('POST', '/api/reports/export-data'): 'reports.export',
    ('POST', '/api/reports/export-docx'): 'reports.export',
    ('POST', '/api/reports/export-log'): 'reports.export',
    ('POST', '/api/reports/preview'): 'sql.explore',
    ('POST', '/api/reports/saved'): 'reports.save',
    ('POST', '/api/reports/saved/{report_id}/execute'): 'sql.explore',
    ('POST', '/api/reports/saved/{report_id}/run'): 'sql.explore',
})

_MATCHERS = tuple((method, compile_path(path)[0], permission, path)
                  for (method, path), permission in DECLARED.items())


def lookup(path, method):
    """Return (declared, permission). Public and undeclared are distinct."""
    key = (method, path)
    if key in DECLARED:
        return True, DECLARED[key]
    for verb, pattern, permission, template in _MATCHERS:
        if template == '/{full_path:path}' and (path == '/api' or path.startswith('/api/')):
            continue
        if verb == method and pattern.fullmatch(path):
            return True, permission
    return False, None


def is_public(path, method):
    declared, permission = lookup(path, method)
    return declared and permission is None


def validate_routes(routes):
    """Startup/CI assertion against actual registered method/template pairs."""
    actual = {(method, route.path) for route in routes
              for method in (getattr(route, 'methods', None) or ())}
    undeclared = sorted(actual - DECLARED.keys())
    # SPA/static serving is conditional on a built dist directory. Protected
    # declarations may not become stale when a router or verb is removed.
    stale = sorted(key for key, permission in DECLARED.items()
                   if permission is not None and key not in actual)
    if undeclared or stale:
        raise ValueError('HTTP route policy inventory differs: '
                         f'undeclared={undeclared!r}, stale={stale!r}')
    return {'protected_routes': sum(DECLARED[key] is not None for key in actual),
            'undeclared': undeclared, 'stale': stale}
