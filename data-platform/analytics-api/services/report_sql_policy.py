"""Explicit deployment policy. Browser ownership is not account authentication."""
import hmac
import os
from fastapi import HTTPException
from services.sql_service import validate_ai_query_scope, validate_sql_ast_security, SqlSafetyError


def require_sql_admin(request):
    mode = os.getenv("DATA_ANALYST_REPORT_SQL_MODE", "disabled")
    token = os.getenv("DATA_ANALYST_REPORT_ADMIN_TOKEN", "")
    header = request.headers.get("authorization", "") if request else ""
    if mode != "trusted_admin" or len(token) < 32 or not hmac.compare_digest(header, "Bearer "+token):
        raise HTTPException(403, "Thực thi SQL báo cáo bị tắt. Cần cấu hình và xác thực quản trị đáng tin cậy.")


def validate_report_sql(sql, catalog=None):
    if catalog is None:
        from services.analysis_catalog import AnalysisCatalog
        from services.metadata_service import get_local_metadata
        catalog = AnalysisCatalog(get_local_metadata())
    policy = {t:set(columns) for t,columns in catalog.policy["tables"].items()}
    validate_ai_query_scope(sql,policy)
    validate_sql_ast_security(sql,policy)
    return sql


def validate_saved_payload(payload):
    """AI SQL and generic client SQL always obey Silver/sensitive-field policy."""
    from services.analysis_catalog import AnalysisCatalog
    from services.metadata_service import get_local_metadata
    catalog = AnalysisCatalog(get_local_metadata())
    validate_report_sql(payload.sql_query,catalog)
    report = payload.module_config
    if isinstance(report,dict) and report.get("analytical_queries"):
        from services.analysis_quality_service import restore_artifacts
        artifacts = restore_artifacts(report,catalog)
        if payload.sql_query not in {a.sql for a in artifacts.values()}:
            raise SqlSafetyError("Saved analytical SQL differs from the catalog compiler")
        for id,sql in report.get("sql_by_query",{}).items():
            if id not in artifacts or sql != artifacts[id].sql:
                raise SqlSafetyError("Saved query identity differs from compiled analytical meaning")
