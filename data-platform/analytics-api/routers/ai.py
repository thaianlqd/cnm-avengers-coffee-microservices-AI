"""Thin HTTP boundary for the Data Platform AI analysis contract."""

import logging
import asyncio
import time
from threading import Event
from fastapi import APIRouter, Body, HTTPException, Query, Request, Response
from services.browser_owner import browser_owner
from common import (
    AiFeedbackRequest,
    AiReportRefineRequest,
    AiSummarizeRequest,
    AiTextToReportRequest,
)
from services.analysis_pipeline import AnalysisPipeline, safe_failure
from services.llm_service import provider_configuration
from services.metadata_service import cache_status, sanitize_result_rows, get_local_metadata, lookup_dimension_values
from services.session_service import session_stats
from services.analysis_catalog import AnalysisError, AnalysisCatalog
from services.domain_intelligence_service import DomainIntelligence

# Temporary backward-compatible private imports for existing regression tests.
from services.legacy_analysis_compat import (
    _chart_metadata,
    _deterministic_plan,
    _looks_destructive,
    _time_selection,
    validate_results,
)

router = APIRouter(prefix="/api/ai", tags=["AI Data Assistant"])
logger = logging.getLogger("ai-analytics")


@router.post('/analysis-jobs', status_code=202)
def submit_analysis_job(payload: AiTextToReportRequest, request: Request, response: Response):
    import os
    from services.analysis_job_service import analysis_jobs
    if os.getenv('DATA_ANALYST_ONE_CLICK_ENABLED', '1') != '1':
        raise HTTPException(503, 'Phân tích một lần bấm đang tạm dừng.')
    try:
        return analysis_jobs().submit(payload, browser_owner(request, response),
            request.headers.get('Idempotency-Key', ''))
    except AnalysisError as error:
        code = 429 if error.category == 'job_busy' else 409 if error.category == 'idempotency_conflict' else 503 if error.category == 'job_storage' else 400
        raise HTTPException(code, safe_failure(error)['message']) from None


@router.get('/analysis-jobs/{job_id}')
def analysis_job_status(job_id: str, request: Request, response: Response):
    from services.analysis_job_service import analysis_jobs
    try:
        return analysis_jobs().status(job_id, browser_owner(request, response))
    except AnalysisError as error:
        raise HTTPException(503 if error.category == 'job_storage' else 404,
            safe_failure(error)['message']) from None


@router.post('/analysis-jobs/cancel-by-key')
def cancel_analysis_key(request: Request, response: Response):
    from services.analysis_job_service import analysis_jobs
    try:
        return analysis_jobs().cancel_key(request.headers.get('Idempotency-Key',''),browser_owner(request,response))
    except AnalysisError as error:
        raise HTTPException(503 if error.category=='job_storage' else 400,safe_failure(error)['message']) from None


@router.post('/analysis-jobs/{job_id}/cancel')
def cancel_analysis_job(job_id: str, request: Request, response: Response):
    from services.analysis_job_service import analysis_jobs
    try:
        return analysis_jobs().cancel(job_id, browser_owner(request, response))
    except AnalysisError as error:
        raise HTTPException(503 if error.category == 'job_storage' else 404,
            safe_failure(error)['message']) from None


@router.get('/sessions/{session_id}/results/{query_id}')
def result_page(session_id: str, query_id: str, request: Request, response: Response,
                offset: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=200),
                dimension: str = Query(None), value: str = Query(None)):
    """Page/filter immutable approved results; never accept SQL or arbitrary IDs."""
    from services.session_service import get_session
    from services.result_artifact_store import artifact_store
    owner = browser_owner(request, response)
    session = get_session(session_id)
    if not session or session.owner_id != owner or not session.approved:
        raise HTTPException(404, 'Phiên phân tích đã hết hạn hoặc không thuộc trình duyệt này.')
    artifact = session.agent_artifacts.get(query_id)
    if not artifact or not artifact.result_ref:
        raise HTTPException(404, 'Không tìm thấy kết quả trong kế hoạch đã duyệt.')
    try:
        filters = {dimension:value} if dimension is not None and value is not None else {}
        page = artifact_store().page(artifact.result_ref, offset, limit, filters)
        page['revision'] = session.revision
        page['catalog_fingerprint'] = session.schema_fingerprint
        page['resolved_plan_fingerprint'] = session.plan_fingerprint
        return page
    except AnalysisError as error:
        raise HTTPException(410 if error.category=='artifact_expired' else 503 if error.category=='artifact_store_unavailable' else 400,
                            safe_failure(error)['message']) from None


def _invoke(action, payload, owner_id=None):
    if hasattr(payload, "prompt") and not payload.prompt.strip():
        raise HTTPException(
            status_code=422, detail="Yêu cầu phân tích không được để trống."
        )
    pipeline = AnalysisPipeline(owner_id=owner_id)
    try:
        if action == "generate" and not payload.session_id:
            raise AnalysisError("approval_required", "Approve a server proposal before execution")
        return getattr(pipeline, action)(payload)
    except Exception as error:
        pipeline.semantic_info['total_ms']=round((time.perf_counter()-pipeline.started)*1000,2)
        failure = safe_failure(error, pipeline.calls, pipeline.semantic_info)
        logger.warning(
            "Analysis rejected action=%s category=%s stage=%s provider_calls=%s root_contract_issues=%s contract_issues=%s issue_history=%s resolver_diagnostic=%s",
            action,
            failure["diagnostics"]["error_category"],
            pipeline.semantic_info.get('failure_stage'),
            pipeline.semantic_info.get('provider_call_count',len(pipeline.calls)),
            pipeline.semantic_info.get('root_contract_issues',[]),
            pipeline.semantic_info.get("contract_issues", []),
            pipeline.semantic_info.get('semantic_issue_history',[]),
            pipeline.semantic_info.get('resolver_diagnostic',{}),
        )
        failure["diagnostics"].update(
            {
                **pipeline.semantic_info,
                "provider_calls": pipeline.calls,
                "provider_call_count": pipeline.semantic_info.get("provider_call_count", len(pipeline.calls)),
                "embedding_call_count": pipeline.embedding_calls,
            }
        )
        failure["clarification_question"] = failure["question"]
        failure["interpreted_request"] = failure["message"]
        return failure


@router.get("/status")
def ai_status():
    from services.provider_budget import validate_single_shot_policy
    providers = provider_configuration()
    metadata = cache_status()
    from services.provider_health_service import provider_health
    from services.readiness_service import readiness, VERSION
    import os
    local = readiness()
    return {
        "status": local['status'],
        "system_readiness": local,
        "provider_status": provider_health(),
        "pipeline_version": "2.8",
        "reliability_version": VERSION,
        "planning_mode": "hybrid_verifiable",
        "provider_call_budget": validate_single_shot_policy(),
        "one_click": {"enabled": os.getenv('DATA_ANALYST_ONE_CLICK_ENABLED','1') == '1',
            "job_deadline_seconds": 45, "workers_per_replica": 4,
            "max_active_jobs": 12, "query_concurrency_per_job": 2,
            "plan_cache_seconds": 300, "minimum_views": 4, "target_views": 5},
        "providers": providers,
        "metadata": metadata,
        "sessions": session_stats(),
    }


@router.get("/capabilities")
def ai_capabilities():
    try:
        return DomainIntelligence(AnalysisCatalog(get_local_metadata())).capabilities()
    except AnalysisError as error:
        if error.category == "domain_metadata_invalid":
            raise HTTPException(status_code=503, detail="Danh mục miền dữ liệu chưa hợp lệ.") from None
        raise HTTPException(status_code=503, detail="Danh mục dữ liệu chưa sẵn sàng.") from None
    except Exception:
        raise HTTPException(status_code=503, detail="Danh mục dữ liệu chưa sẵn sàng.") from None


@router.get("/scope-values")
def ai_scope_values(dimension: str = Query(min_length=1, max_length=64), search: str = Query(min_length=2, max_length=80)):
    """Explicit picker search, parameterized/read-only; no analytical inference."""
    try:
        catalog = AnalysisCatalog(get_local_metadata())
        scopes = DomainIntelligence(catalog).capabilities()["scope_types"]
        if not any(s["id"] == dimension and s["searchable"] for s in scopes):
            raise HTTPException(status_code=422, detail="Phạm vi này chưa hỗ trợ tìm kiếm.")
        d = catalog.registry["dimensions"][dimension]
        values = lookup_dimension_values(d["table"], d["column"], search, limit=8)
        return {"dimension": dimension, "values": [{"value": v, "label": str(v)} for v in values[:8] if type(v) in (str, int, bool) and len(str(v)) <= 100]}
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=503, detail="Chưa thể tra cứu phạm vi dữ liệu.") from None


@router.post("/propose-plan")
async def bounded_propose_plan(payload: AiTextToReportRequest, request: Request = None, response: Response = None):
    from services.provider_budget import request_deadline, request_cancelled, PLANNING_SECONDS
    owner=browser_owner(request,response)
    token=request_deadline.set(time.monotonic()+PLANNING_SECONDS)
    cancelled=Event()
    cancellation_token=request_cancelled.set(cancelled)
    try:
        # The HTTP deadline also covers catalog I/O and preflight. A timed-out
        # worker cannot start provider work or create a proposal after expiry;
        # proposal planning never executes analytical result queries.
        return await asyncio.wait_for(asyncio.to_thread(_invoke,'propose',payload,owner),timeout=29)
    except asyncio.TimeoutError:
        logger.warning('Analysis planning HTTP deadline exhausted')
        return safe_failure(AnalysisError('planning_timeout','Planning response deadline exhausted'),
                            layer_diagnostics={'failure_stage':'PLANNING_DEADLINE','planning_budget_ms':PLANNING_SECONDS*1000})
    finally:
        cancelled.set()
        request_cancelled.reset(cancellation_token)
        request_deadline.reset(token)


def propose_plan(payload: AiTextToReportRequest, request: Request = None, response: Response = None):
    """Synchronous adapter retained for existing internal/offline callers."""
    return _invoke("propose", payload, browser_owner(request, response))


@router.post("/generate-executive-report")
def generate_executive_report(payload: AiTextToReportRequest, request: Request = None, response: Response = None):
    return _invoke("generate", payload, browser_owner(request, response))


@router.post("/refine-report")
def refine_report(payload: AiReportRefineRequest, request: Request = None, response: Response = None):
    return _invoke("refine", payload, browser_owner(request, response))


@router.post("/feedback")
def log_user_feedback(payload: AiFeedbackRequest, request: Request = None, response: Response = None):
    return _invoke("feedback", payload, browser_owner(request, response))


@router.post("/summarize")
def summarize_report(payload: AiSummarizeRequest):
    # This compatibility endpoint accepts client-supplied data, not a validated
    # warehouse result. It must not manufacture authoritative analytical facts.
    rows = sanitize_result_rows((payload.data or [])[:20])
    return {
        "executive_summary": f"Dữ liệu được cung cấp có {len(rows)} dòng trong bản xem trước.",
        "ai_insights": [],
        "provider": {"provider": "deterministic", "model": "none"},
        "validation_source": "client_preview",
    }


def _sanitize_and_resolve_kpi_cards(cards, normalized_results):
    """Deprecated compatibility helper: never infer a metric from unrelated rows."""
    return [
        {
            **card,
            "value": (
                card["value"] if isinstance(card.get("value"), (int, float)) else None
            ),
        }
        for card in cards
    ]


@router.post("/verify-report")
def verify_report(payload: dict = Body(...)):
    """Pure revalidation of saved logical queries/rows. No stored SQL is executed."""
    from services.analysis_quality_service import verify_saved_report, not_scored
    try:
        catalog = AnalysisCatalog(get_local_metadata())
        return {"quality_assessment": verify_saved_report(payload, catalog)}
    except Exception:
        return {"quality_assessment": not_scored("Danh mục chưa sẵn sàng; chưa thể kiểm chứng báo cáo.")}
