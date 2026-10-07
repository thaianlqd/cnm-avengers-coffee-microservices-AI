"""Thin HTTP boundary for the Data Platform AI analysis contract."""

import logging
from fastapi import APIRouter, HTTPException, Query, Request, Response
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
        failure = safe_failure(error, pipeline.calls, pipeline.semantic_info)
        logger.warning(
            "Analysis rejected action=%s category=%s contract_issues=%s",
            action,
            failure["diagnostics"]["error_category"],
            pipeline.semantic_info.get("contract_issues", []),
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
    return {
        "status": "ready" if metadata["local_ready"] else "unavailable",
        "pipeline_version": "2.6",
        "planning_mode": "one_shot",
        "provider_call_budget": validate_single_shot_policy(),
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
def propose_plan(payload: AiTextToReportRequest, request: Request = None, response: Response = None):
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
