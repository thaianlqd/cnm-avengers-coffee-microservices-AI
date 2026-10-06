"""Thin HTTP boundary for the Data Platform AI analysis contract."""

import logging
from fastapi import APIRouter, HTTPException
from common import (
    AiFeedbackRequest,
    AiReportRefineRequest,
    AiSummarizeRequest,
    AiTextToReportRequest,
)
from services.analysis_pipeline import AnalysisPipeline, safe_failure
from services.llm_service import provider_configuration
from services.metadata_service import cache_status, sanitize_result_rows
from services.session_service import session_stats

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


def _invoke(action, payload):
    if hasattr(payload, "prompt") and not payload.prompt.strip():
        raise HTTPException(
            status_code=422, detail="Yêu cầu phân tích không được để trống."
        )
    pipeline = AnalysisPipeline()
    try:
        return getattr(pipeline, action)(payload)
    except Exception as error:
        failure = safe_failure(error)
        logger.warning(
            "Analysis rejected action=%s category=%s",
            action,
            failure["diagnostics"]["error_category"],
        )
        failure["diagnostics"].update(
            {
                **pipeline.semantic_info,
                "provider_calls": pipeline.calls,
                "provider_call_count": len(pipeline.calls),
                "embedding_call_count": pipeline.embedding_calls,
            }
        )
        category = failure["diagnostics"]["error_category"]
        if category in ("analysis_spec_invalid", "provider_invalid_json", "provider_schema_invalid"):
            failure["diagnostics"].update(provider_status="invalid", provider_error_category=category)
        failure["clarification_question"] = failure["question"]
        failure["interpreted_request"] = failure["message"]
        return failure


@router.get("/status")
def ai_status():
    providers = provider_configuration()
    metadata = cache_status()
    return {
        "status": "ready" if metadata["local_ready"] else "unavailable",
        "pipeline_version": 2,
        "providers": providers,
        "metadata": metadata,
        "sessions": session_stats(),
    }


@router.post("/propose-plan")
def propose_plan(payload: AiTextToReportRequest):
    return _invoke("propose", payload)


@router.post("/generate-executive-report")
def generate_executive_report(payload: AiTextToReportRequest):
    return _invoke("generate", payload)


@router.post("/refine-report")
def refine_report(payload: AiReportRefineRequest):
    return _invoke("refine", payload)


@router.post("/feedback")
def log_user_feedback(payload: AiFeedbackRequest):
    return _invoke("feedback", payload)


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
