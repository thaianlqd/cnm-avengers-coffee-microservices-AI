import base64
import logging
import os
import re
import requests
from time import perf_counter
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from fastapi import BackgroundTasks, FastAPI, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import text
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

# Import tu cac file service
from cf_service import CollaborativeFilterModel
from db import get_db_engine
from forecast_service import DemandForecastModel
from ai_persistence import ensure_ai_storage, log_inference, safe_schema_name, upsert_model_registry

# Groq: primary AI (chat + STT), Gemini: fallback
from groq_service import (
    groq_is_available,
    groq_chat,
    groq_transcribe_audio,
    groq_extract_order_intent,
    match_products_to_db,
    GROQ_CHAT_MODEL,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger(__name__)


def _safe_schema_name(value: Optional[str], default: str) -> str:
    name = (value or default).strip()
    if not name:
        return default
    if all(ch.isalnum() or ch == "_" for ch in name):
        return name
    return default


IDENTITY_SCHEMA = _safe_schema_name(os.getenv("IDENTITY_SCHEMA"), "identity")
MENU_SCHEMA = _safe_schema_name(os.getenv("MENU_SCHEMA"), "menu")
ORDER_SCHEMA = _safe_schema_name(os.getenv("ORDER_SCHEMA"), "orders")
AI_SCHEMA = safe_schema_name(os.getenv("AI_SCHEMA"), "ai")

_base_context_cache: Dict[str, Any] = {"expires_at": datetime.min, "value": None}
_BASE_CONTEXT_TTL_SECONDS = 90
_AI_END_TOKEN = "[END_AVENGERS_REPLY]"
_AI_CHAT_MAX_CONTINUATION_ROUNDS = max(0, int(os.getenv("AI_CHAT_MAX_CONTINUATION_ROUNDS", "2")))
_GEMINI_BLOCK_MINUTES_ON_429 = max(1, int(os.getenv("GEMINI_BLOCK_MINUTES_ON_429", "10")))
_gemini_block_until: datetime = datetime.min

# Khoi tao model toan cuc
cf_model = CollaborativeFilterModel()
fc_model = DemandForecastModel()

CF_AUTO_RETRAIN_MINUTES = max(10, int(os.getenv("CF_AUTO_RETRAIN_MINUTES", "60")))
CF_RETRAIN_QUEUE_COOLDOWN_SECONDS = max(30, int(os.getenv("CF_RETRAIN_QUEUE_COOLDOWN_SECONDS", "120")))
_last_cf_retrain_queued_at: Optional[datetime] = None


def _sync_ai_model_registry(engine) -> None:
    ensure_ai_storage(engine, AI_SCHEMA)

    cf_stats = cf_model.get_stats()
    upsert_model_registry(
        engine=engine,
        schema=AI_SCHEMA,
        model_name="goi_y_ca_nhan_hoa",
        model_version="v1",
        is_trained=bool(cf_stats.get("is_trained")),
        total_records=int(cf_stats.get("total_interactions") or 0),
        total_entities=int(cf_stats.get("total_users") or 0),
        metrics={
            "total_items": int(cf_stats.get("total_items") or 0),
        },
        trained_at=cf_stats.get("trained_at"),
    )

    fc_stats = fc_model.get_stats()
    upsert_model_registry(
        engine=engine,
        schema=AI_SCHEMA,
        model_name="du_bao_nhu_cau",
        model_version="v1",
        is_trained=bool(fc_stats.get("is_trained")),
        total_records=int(fc_stats.get("total_records") or 0),
        total_entities=int(len(fc_stats.get("branches") or [])),
        metrics={
            "models_count": int(fc_stats.get("models_count") or 0),
            "engine": fc_stats.get("engine") or "unknown",
        },
        trained_at=fc_stats.get("trained_at"),
    )


def _safe_log_inference(
    endpoint: str,
    user_id: Optional[str],
    status: str,
    started_at: float,
    request_payload: Optional[Dict[str, Any]] = None,
    response_payload: Optional[Dict[str, Any]] = None,
    error_message: Optional[str] = None,
) -> None:
    try:
        engine = get_db_engine()
        latency_ms = int((perf_counter() - started_at) * 1000)
        log_inference(
            engine=engine,
            schema=AI_SCHEMA,
            endpoint=endpoint,
            user_id=user_id,
            status=status,
            latency_ms=latency_ms,
            request_payload=request_payload,
            response_payload=response_payload,
            error_message=error_message,
        )
    except Exception as exc:
        logger.warning("Khong the ghi AI inference log cho %s: %s", endpoint, exc)

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("AI Service dang khoi dong - Dang huan luyen model...")
    engine = get_db_engine()
    try:
        ensure_ai_storage(engine, AI_SCHEMA)
    except Exception as e:
        logger.warning(f"Loi tao schema/table AI: {e}")
    try:
        cf_model.train(engine)
    except Exception as e:
        logger.warning(f"Loi train CF: {e}")
    try:
        fc_model.train(engine)
    except Exception as e:
        logger.warning(f"Loi train Forecast: {e}")
    try:
        _sync_ai_model_registry(engine)
    except Exception as e:
        logger.warning(f"Loi dong bo metadata model AI: {e}")
    yield
    logger.info("AI Service dang tat.")

app = FastAPI(title="Avengers Coffee AI Service", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class RecommendedItem(BaseModel):
    id: str
    name: str
    price: float
    image: Optional[str]
    category: Optional[str]
    order_count: int = 0
    score: float
    reason: str

class RecommendationResponse(BaseModel):
    user_id: str
    items: List[RecommendedItem]
    model: str
    is_personalized: bool
    generated_at: str

def _train_cf_sync() -> None:
    engine = get_db_engine()
    cf_model.train(engine)
    try:
        _sync_ai_model_registry(engine)
    except Exception as exc:
        logger.warning("Loi cap nhat model registry sau khi train CF: %s", exc)


def _should_queue_cf_retrain() -> bool:
    global _last_cf_retrain_queued_at
    now = datetime.utcnow()

    if not cf_model.is_trained:
        return True

    if cf_model.trained_at is None:
        return True

    minutes_since_train = (now - cf_model.trained_at).total_seconds() / 60
    if minutes_since_train < CF_AUTO_RETRAIN_MINUTES:
        return False

    if _last_cf_retrain_queued_at is None:
        return True

    cooldown = (now - _last_cf_retrain_queued_at).total_seconds()
    return cooldown >= CF_RETRAIN_QUEUE_COOLDOWN_SECONDS


def _queue_cf_retrain_if_needed(background_tasks: Optional[BackgroundTasks]) -> None:
    global _last_cf_retrain_queued_at
    if background_tasks is None:
        return
    if not _should_queue_cf_retrain():
        return
    _last_cf_retrain_queued_at = datetime.utcnow()
    background_tasks.add_task(_train_cf_sync)


def _train_forecast_sync() -> None:
    engine = get_db_engine()
    fc_model.train(engine)
    try:
        _sync_ai_model_registry(engine)
    except Exception as exc:
        logger.warning("Loi cap nhat model registry sau khi train Forecast: %s", exc)


def _to_summary(forecast: list) -> dict:
    values = [float(item.get("yhat", 0)) for item in forecast if item.get("yhat") is not None]
    if not values:
        return {
            "avg_forecast": 0,
            "max_forecast": 0,
            "min_forecast": 0,
            "trend_pct": 0,
        }

    first = values[0]
    last = values[-1]
    trend_pct = 0
    if first > 0:
        trend_pct = round(((last - first) / first) * 100, 2)

    return {
        "avg_forecast": round(sum(values) / len(values), 2),
        "max_forecast": round(max(values), 2),
        "min_forecast": round(min(values), 2),
        "trend_pct": trend_pct,
    }


def _fetch_rows(sql: str, params: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
    engine = get_db_engine()
    with engine.connect() as conn:
        rows = conn.execute(text(sql), params or {}).mappings().all()
        return [dict(row) for row in rows]


def _normalize_branch_filter(branch_code: Optional[str]) -> Optional[str]:
    normalized = str(branch_code or "").strip().upper()
    if not normalized or normalized == "ALL":
        return None
    return normalized


def _to_price(value: Any) -> str:
    try:
        return f"{float(value):,.0f}"
    except Exception:
        return "0"


def _build_base_business_context() -> Dict[str, Any]:
    products_sql = f"""
        SELECT
            sp.ma_san_pham,
            sp.ten_san_pham,
            sp.gia_ban,
            sp.la_hot,
            sp.la_moi,
            dm.ten_danh_muc
        FROM {MENU_SCHEMA}.san_pham sp
        LEFT JOIN {MENU_SCHEMA}.danh_muc dm ON dm.ma_danh_muc = sp.ma_danh_muc
        WHERE sp.trang_thai = TRUE
        ORDER BY sp.la_hot DESC, sp.la_moi DESC, sp.ma_san_pham DESC
        LIMIT 10
    """
    top_sell_sql = f"""
        SELECT
            ctdh.ma_san_pham,
            ctdh.ten_san_pham,
            SUM(ctdh.so_luong) AS tong_ban
        FROM {ORDER_SCHEMA}.chi_tiet_don_hang ctdh
        GROUP BY ctdh.ma_san_pham, ctdh.ten_san_pham
        ORDER BY tong_ban DESC
        LIMIT 6
    """
    promotions_sql = f"""
        SELECT
            km.ma_khuyen_mai,
            km.ten_khuyen_mai,
            km.loai_khuyen_mai,
            km.gia_tri,
            km.gia_tri_don_toi_thieu,
            km.giam_toi_da,
            km.ten_san_pham_tang,
            km.ngay_ket_thuc
        FROM {IDENTITY_SCHEMA}.khuyen_mai km
        WHERE km.trang_thai = 'ACTIVE'
          AND km.hien_thi_cho_khach = TRUE
          AND (km.ngay_bat_dau IS NULL OR km.ngay_bat_dau <= NOW())
          AND (km.ngay_ket_thuc IS NULL OR km.ngay_ket_thuc >= NOW())
        ORDER BY km.ngay_tao DESC
        LIMIT 6
    """
    branches_sql = f"""
        SELECT
            cn.ma_chi_nhanh,
            cn.ten_chi_nhanh,
            cn.dia_chi,
            cn.so_dien_thoai
        FROM {IDENTITY_SCHEMA}.chi_nhanh cn
        WHERE cn.trang_thai = 'ACTIVE'
        ORDER BY cn.ten_chi_nhanh ASC
        LIMIT 8
    """

    context: Dict[str, Any] = {
        "products": [],
        "top_selling": [],
        "promotions": [],
        "branches": [],
    }

    try:
        context["products"] = _fetch_rows(products_sql)
    except Exception as exc:
        logger.warning("Khong lay duoc san pham de lam context chat: %s", exc)
    try:
        context["top_selling"] = _fetch_rows(top_sell_sql)
    except Exception as exc:
        logger.warning("Khong lay duoc top ban chay de lam context chat: %s", exc)
    try:
        context["promotions"] = _fetch_rows(promotions_sql)
    except Exception as exc:
        logger.warning("Khong lay duoc khuyen mai de lam context chat: %s", exc)
    try:
        context["branches"] = _fetch_rows(branches_sql)
    except Exception as exc:
        logger.warning("Khong lay duoc chi nhanh de lam context chat: %s", exc)

    return context


def _get_base_business_context() -> Dict[str, Any]:
    now = datetime.utcnow()
    expires_at: datetime = _base_context_cache["expires_at"]
    if _base_context_cache["value"] is not None and now < expires_at:
        return _base_context_cache["value"]

    value = _build_base_business_context()
    _base_context_cache["value"] = value
    _base_context_cache["expires_at"] = now + timedelta(seconds=_BASE_CONTEXT_TTL_SECONDS)
    return value


def _get_user_recent_orders(user_id: str) -> List[Dict[str, Any]]:
    if not user_id:
        return []
    sql = f"""
        SELECT
            dh.ma_don_hang,
            dh.ngay_tao,
            dh.trang_thai_don_hang,
            dh.trang_thai_thanh_toan,
            dh.tong_tien,
            dh.co_so_ma
        FROM {ORDER_SCHEMA}.don_hang dh
        WHERE dh.ma_nguoi_dung = :user_id
        ORDER BY dh.ngay_tao DESC
        LIMIT 3
    """
    try:
        return _fetch_rows(sql, {"user_id": user_id})
    except Exception as exc:
        logger.warning("Khong lay duoc lich su don hang cho user %s: %s", user_id, exc)
        return []


def _render_context_for_prompt(base_context: Dict[str, Any], recent_orders: List[Dict[str, Any]]) -> str:
    product_lines = []
    for p in base_context.get("products", [])[:8]:
        tags = []
        if p.get("la_hot"):
            tags.append("HOT")
        if p.get("la_moi"):
            tags.append("MOI")
        tag_text = f" [{' '.join(tags)}]" if tags else ""
        category = p.get("ten_danh_muc") or "Khac"
        product_lines.append(
            f"- {p.get('ten_san_pham')} ({category}) - {_to_price(p.get('gia_ban'))} VND{tag_text}"
        )

    top_lines = [
        f"- {item.get('ten_san_pham')}: {int(item.get('tong_ban') or 0)} ly"
        for item in base_context.get("top_selling", [])[:5]
    ]

    promo_lines = []
    for km in base_context.get("promotions", [])[:5]:
        loai = km.get("loai_khuyen_mai")
        if loai == "PERCENT":
            value_text = f"giam {float(km.get('gia_tri') or 0):.0f}%"
        elif loai == "FIXED":
            value_text = f"giam {_to_price(km.get('gia_tri'))} VND"
        else:
            value_text = f"tang {km.get('ten_san_pham_tang') or 'qua tang'}"
        promo_lines.append(f"- {km.get('ma_khuyen_mai')}: {km.get('ten_khuyen_mai')} ({value_text})")

    branch_lines = [
        f"- {b.get('ten_chi_nhanh')}: {b.get('dia_chi') or 'Dang cap nhat dia chi'}"
        for b in base_context.get("branches", [])[:5]
    ]

    order_lines = [
        f"- Don {o.get('ma_don_hang')}: {_to_price(o.get('tong_tien'))} VND, order={o.get('trang_thai_don_hang')}, payment={o.get('trang_thai_thanh_toan')}"
        for o in recent_orders[:3]
    ]

    return (
        "DU LIEU THUC TE TU HE THONG:\n"
        f"San pham hien co:\n{chr(10).join(product_lines) if product_lines else '- Khong co du lieu'}\n\n"
        f"Top ban chay:\n{chr(10).join(top_lines) if top_lines else '- Khong co du lieu'}\n\n"
        f"Khuyen mai dang ap dung:\n{chr(10).join(promo_lines) if promo_lines else '- Hien chua co khuyen mai'}\n\n"
        f"Chi nhanh hoat dong:\n{chr(10).join(branch_lines) if branch_lines else '- Khong co du lieu chi nhanh'}\n\n"
        f"Don gan day cua khach:\n{chr(10).join(order_lines) if order_lines else '- Khach chua co don hang gan day'}"
    )


def _extract_reply_and_finish_reason(response_json: Dict[str, Any]) -> tuple[str, str]:
    candidates = response_json.get("candidates") or []
    if not candidates:
        return "", "UNKNOWN"

    first = candidates[0] or {}
    finish_reason = str(first.get("finishReason") or "UNKNOWN").upper()
    parts = ((first.get("content") or {}).get("parts") or [])
    texts = [str(part.get("text", "")).strip() for part in parts if isinstance(part, dict)]
    reply = "\n".join([text for text in texts if text]).strip()
    return reply, finish_reason


def _strip_end_token(text: str) -> tuple[str, bool]:
    if not text:
        return "", False
    if _AI_END_TOKEN not in text:
        return text.strip(), False
    cleaned = text.replace(_AI_END_TOKEN, "").strip()
    return cleaned, True


def _looks_incomplete_tail(text: str) -> bool:
    if not text:
        return True
    trimmed = text.rstrip()
    if not trimmed:
        return True

    # Ket thuc dep thuong co dau cau hoac dong goi y tiep theo.
    if trimmed.endswith((".", "!", "?", ":", ")", '"', "'")):
        return False

    # Neu khong co dau cau ket thuc, kha nang cao la bi cat ngang
    return True


def _merge_without_overlap(existing_text: str, continuation_text: str) -> str:
    left = existing_text.strip()
    right = continuation_text.strip()
    if not left:
        return right
    if not right:
        return left

    max_overlap = min(len(left), len(right), 160)
    overlap_len = 0
    for size in range(max_overlap, 20, -1):
        if left[-size:].lower() == right[:size].lower():
            overlap_len = size
            break

    if overlap_len > 0:
        merged = f"{left}{right[overlap_len:]}"
    else:
        merged = f"{left}\n{right}"
    return merged.strip()


def _should_continue_reply(current_text: str, finish_reason: str, has_end_token: bool, round_index: int) -> bool:
    if has_end_token:
        return False
    if round_index >= _AI_CHAT_MAX_CONTINUATION_ROUNDS:
        return False
    if finish_reason in {"MAX_TOKENS", "RECITATION", "SAFETY"}:
        return True
    return _looks_incomplete_tail(current_text)


def _sanitize_error_text(error_text: str) -> str:
    if not error_text:
        return ""
    return re.sub(r"key=[^&\s]+", "key=***", error_text)


def _extract_retry_delay_seconds(error_body: Dict[str, Any]) -> Optional[int]:
    try:
        details = (error_body.get("error") or {}).get("details") or []
        for detail in details:
            if str(detail.get("@type", "")).endswith("RetryInfo"):
                retry_delay = str(detail.get("retryDelay") or "").strip().lower()
                match = re.search(r"(\d+(?:\.\d+)?)s", retry_delay)
                if match:
                    return max(1, int(float(match.group(1))))
    except Exception:
        return None
    return None


def _set_gemini_block_until(seconds: Optional[int], is_daily_quota: bool) -> datetime:
    global _gemini_block_until
    base_seconds = (_GEMINI_BLOCK_MINUTES_ON_429 * 60) if is_daily_quota else 45
    block_seconds = max(base_seconds, int(seconds or 0))
    _gemini_block_until = datetime.utcnow() + timedelta(seconds=block_seconds)
    return _gemini_block_until


def _is_gemini_blocked() -> bool:
    return datetime.utcnow() < _gemini_block_until


def _build_local_chat_fallback(content: str, user_name: str, base_context: Dict[str, Any]) -> str:
    content_lower = (content or "").strip().lower()

    products = base_context.get("products") or []
    promotions = base_context.get("promotions") or []
    branches = base_context.get("branches") or []

    top_products = [str(p.get("ten_san_pham") or "").strip() for p in products[:5] if p.get("ten_san_pham")]
    top_promos = [str(k.get("ten_khuyen_mai") or "").strip() for k in promotions[:3] if k.get("ten_khuyen_mai")]
    top_branches = [str(b.get("ten_chi_nhanh") or "").strip() for b in branches[:3] if b.get("ten_chi_nhanh")]

    if any(word in content_lower for word in ["menu", "ban gi", "co gi", "san pham", "mon"]):
        menu_text = ", ".join(top_products) if top_products else "Ca phe sua, bac xiu, tra sua"
        return f"Chao {user_name}! Ben minh dang co cac mon noi bat: {menu_text}. Ban muon minh goi y theo gu ngot, dam vi hay it duong?"

    if any(word in content_lower for word in ["khuyen mai", "voucher", "giam", "uu dai"]):
        promo_text = ", ".join(top_promos) if top_promos else "Hien tai chua co khuyen mai cong khai"
        return f"Khuyen mai hien co: {promo_text}. Ban cho minh chi nhanh hoac tong tien du kien de minh goi y uu dai phu hop nhe."

    if any(word in content_lower for word in ["chi nhanh", "cua hang", "dia chi"]):
        branch_text = ", ".join(top_branches) if top_branches else "He thong dang cap nhat chi nhanh"
        return f"Mot so chi nhanh dang hoat dong: {branch_text}. Ban dang o khu vuc nao de minh goi y gan nhat?"

    menu_text = ", ".join(top_products[:3]) if top_products else "ca phe sua, bac xiu, tra sua"
    return (
        f"Chao {user_name}! Minh dang ho tro bang du lieu noi bo. "
        f"Hien co cac mon noi bat: {menu_text}. Ban can tu van menu, gia, khuyen mai hay chi nhanh?"
    )


def _call_gemini_chat(gemini_api_key: str, system_text: str, user_text: str, max_output_tokens: int = 650) -> Dict[str, Any]:
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key={gemini_api_key}"
    payload = {
        "system_instruction": {"parts": [{"text": system_text}]},
        "contents": [{"role": "user", "parts": [{"text": user_text}]}],
        "generationConfig": {"temperature": 0.45, "maxOutputTokens": max_output_tokens},
    }

    # Use a session with retries and exponential backoff to handle transient errors/timeouts
    session = requests.Session()
    retry_strategy = Retry(
        total=2,
        backoff_factor=1,
        status_forcelist=[500, 502, 503, 504],
        allowed_methods=["POST"],
        raise_on_status=False,
    )
    adapter = HTTPAdapter(max_retries=retry_strategy)
    session.mount("https://", adapter)
    session.mount("http://", adapter)

    try:
        # set a modest connect timeout and longer read timeout (connect, read)
        resp = session.post(url, json=payload, timeout=(5, 60))
        resp.raise_for_status()
        return resp.json()
    except requests.exceptions.RequestException as e:
        resp_text = None
        try:
            if hasattr(e, "response") and e.response is not None:
                resp_text = e.response.text
        except Exception:
            resp_text = None
        logger.error("Loi khi goi Gemini: %s; response: %s", _sanitize_error_text(str(e)), resp_text)
        raise


# Routes bat buoc co /ai de khop voi gateway


@app.get("/ai/model/stats")
def model_stats():
    return {
        "service": "ai-v1",
        "uptime_ok": True,
        "collaborative_filtering": cf_model.get_stats(),
        "demand_forecasting": fc_model.get_stats(),
    }


@app.get("/ai/forecast/combined")
def forecast_combined(
    branch_code: str = Query("ALL"),
    metric: str = Query("orders"),
    history_days: int = Query(30, ge=7, le=180),
    forecast_days: int = Query(14, ge=1, le=60),
):
    started_at = perf_counter()
    if metric not in {"orders", "revenue"}:
        _safe_log_inference(
            endpoint="/ai/forecast/combined",
            user_id=None,
            status="error",
            started_at=started_at,
            request_payload={
                "branch_code": branch_code,
                "metric": metric,
                "history_days": history_days,
                "forecast_days": forecast_days,
            },
            error_message="metric must be 'orders' or 'revenue'",
        )
        raise HTTPException(status_code=400, detail="metric must be 'orders' or 'revenue'")

    if not fc_model.is_trained:
        try:
            _train_forecast_sync()
        except Exception as exc:
            _safe_log_inference(
                endpoint="/ai/forecast/combined",
                user_id=None,
                status="error",
                started_at=started_at,
                request_payload={
                    "branch_code": branch_code,
                    "metric": metric,
                    "history_days": history_days,
                    "forecast_days": forecast_days,
                },
                error_message=f"Khong the train forecast model: {exc}",
            )
            raise HTTPException(status_code=500, detail=f"Khong the train forecast model: {exc}") from exc

    history = fc_model.get_historical(branch_code=branch_code, days=history_days, metric=metric)
    forecast = fc_model.predict(branch_code=branch_code, periods=forecast_days, metric=metric)
    fc_stats = fc_model.get_stats()
    is_insufficient = bool(fc_stats.get("insufficient_data"))
    response_status = "insufficient_data" if is_insufficient else "ok"

    response = {
        "status": response_status,
        "branch_code": branch_code,
        "metric": metric,
        "history_days": history_days,
        "forecast_days": forecast_days,
        "history": history,
        "forecast": forecast,
        "summary": _to_summary(forecast),
        "model_engine": fc_stats.get("engine"),
        "trained_at": fc_stats.get("trained_at"),
        "insufficient_data_reason": fc_stats.get("insufficient_data_reason") if is_insufficient else None,
    }
    _safe_log_inference(
        endpoint="/ai/forecast/combined",
        user_id=None,
        status=response_status,
        started_at=started_at,
        request_payload={
            "branch_code": branch_code,
            "metric": metric,
            "history_days": history_days,
            "forecast_days": forecast_days,
        },
        response_payload={
            "history_points": len(history),
            "forecast_points": len(forecast),
            "engine": response.get("model_engine"),
        },
    )
    return response


@app.post("/ai/recommend/train")
def retrain_cf(background_tasks: BackgroundTasks):
    background_tasks.add_task(_train_cf_sync)
    return {
        "status": "accepted",
        "message": "Da nhan yeu cau train lai model CF.",
    }


@app.post("/ai/forecast/train")
def retrain_forecast(background_tasks: BackgroundTasks):
    background_tasks.add_task(_train_forecast_sync)
    return {
        "status": "accepted",
        "message": "Da nhan yeu cau train lai model du bao.",
    }


@app.get("/ai/behavior/insights")
def get_behavior_insights(branch_code: str = "ALL", limit: int = 6, days: int = Query(30, ge=1, le=180)):
    started_at = perf_counter()
    safe_limit = max(3, min(int(limit or 6), 20))
    branch_filter = _normalize_branch_filter(branch_code)

    where_orders = "WHERE dh.ngay_tao >= :since_ts"
    if branch_filter:
        where_orders += " AND dh.co_so_ma = :branch_code"

    where_voucher = (
        "WHERE dh.ngay_tao >= :since_ts AND dh.co_so_ma = :branch_code AND COALESCE(dh.ma_voucher, '') <> ''"
        if branch_filter
        else "WHERE dh.ngay_tao >= :since_ts AND COALESCE(dh.ma_voucher, '') <> ''"
    )
    params = {
        "limit": safe_limit,
        "since_ts": datetime.utcnow() - timedelta(days=max(1, int(days or 30))),
    }
    if branch_filter:
        params["branch_code"] = branch_filter

    try:
        top_products = _fetch_rows(
            f"""
            SELECT
                ct.ma_san_pham::text AS product_id,
                COALESCE(MAX(sp.ten_san_pham), MAX(ct.ten_san_pham), ct.ma_san_pham::text) AS product_name,
                SUM(ct.so_luong)::int AS total_qty,
                SUM(ct.so_luong * ct.gia_ban)::float AS total_revenue,
                COUNT(DISTINCT dh.ma_don_hang)::int AS order_count
            FROM {ORDER_SCHEMA}.don_hang dh
            JOIN {ORDER_SCHEMA}.chi_tiet_don_hang ct ON ct.ma_don_hang = dh.ma_don_hang
            LEFT JOIN {MENU_SCHEMA}.san_pham sp ON sp.ma_san_pham = ct.ma_san_pham
            {where_orders}
            GROUP BY ct.ma_san_pham
            ORDER BY total_qty DESC, total_revenue DESC
            LIMIT :limit
            """,
            params,
        )

        payment_mix = _fetch_rows(
            f"""
            SELECT
                COALESCE(dh.phuong_thuc_thanh_toan, 'KHAC') AS payment_method,
                COUNT(*)::int AS total_orders
            FROM {ORDER_SCHEMA}.don_hang dh
            {where_orders}
            GROUP BY COALESCE(dh.phuong_thuc_thanh_toan, 'KHAC')
            ORDER BY total_orders DESC
            """,
            params,
        )

        hour_groups = _fetch_rows(
            f"""
            SELECT bucket, COUNT(*)::int AS total_orders
            FROM (
                SELECT
                    CASE
                        WHEN EXTRACT(HOUR FROM dh.ngay_tao) >= 6 AND EXTRACT(HOUR FROM dh.ngay_tao) < 11 THEN 'SANG'
                        WHEN EXTRACT(HOUR FROM dh.ngay_tao) >= 11 AND EXTRACT(HOUR FROM dh.ngay_tao) < 14 THEN 'TRUA'
                        WHEN EXTRACT(HOUR FROM dh.ngay_tao) >= 14 AND EXTRACT(HOUR FROM dh.ngay_tao) < 18 THEN 'CHIEU'
                        WHEN EXTRACT(HOUR FROM dh.ngay_tao) >= 18 AND EXTRACT(HOUR FROM dh.ngay_tao) < 23 THEN 'TOI'
                        ELSE 'KHAC'
                    END AS bucket
                FROM {ORDER_SCHEMA}.don_hang dh
                {where_orders}
            ) t
            GROUP BY bucket
            """,
            params,
        )

        top_rated = _fetch_rows(
            f"""
            SELECT
                dg.ma_san_pham::text AS product_id,
                COALESCE(MAX(sp.ten_san_pham), dg.ma_san_pham::text) AS product_name,
                ROUND(AVG(dg.so_sao)::numeric, 2)::float AS avg_rating,
                COUNT(*)::int AS total_reviews
            FROM {ORDER_SCHEMA}.danh_gia_san_pham dg
            LEFT JOIN {MENU_SCHEMA}.san_pham sp ON sp.ma_san_pham::text = dg.ma_san_pham::text
            WHERE dg.ngay_tao >= :since_ts
            GROUP BY dg.ma_san_pham
            ORDER BY total_reviews DESC, avg_rating DESC
            LIMIT :limit
            """,
            params,
        )

        top_favorites = _fetch_rows(
            f"""
            SELECT
                yt.ma_san_pham::text AS product_id,
                COALESCE(MAX(sp.ten_san_pham), MAX(yt.ten_san_pham), yt.ma_san_pham::text) AS product_name,
                COUNT(*)::int AS favorite_count
            FROM {ORDER_SCHEMA}.yeu_thich_san_pham yt
            LEFT JOIN {MENU_SCHEMA}.san_pham sp ON sp.ma_san_pham::text = yt.ma_san_pham::text
            WHERE yt.ngay_tao >= :since_ts
            GROUP BY yt.ma_san_pham
            ORDER BY favorite_count DESC
            LIMIT :limit
            """,
            params,
        )

        top_voucher_products = _fetch_rows(
            f"""
            SELECT
                ct.ma_san_pham::text AS product_id,
                COALESCE(MAX(sp.ten_san_pham), MAX(ct.ten_san_pham), ct.ma_san_pham::text) AS product_name,
                SUM(ct.so_luong)::int AS voucher_qty,
                COUNT(DISTINCT dh.ma_don_hang)::int AS voucher_orders
            FROM {ORDER_SCHEMA}.don_hang dh
            JOIN {ORDER_SCHEMA}.chi_tiet_don_hang ct ON ct.ma_don_hang = dh.ma_don_hang
            LEFT JOIN {MENU_SCHEMA}.san_pham sp ON sp.ma_san_pham = ct.ma_san_pham
            {where_voucher}
            GROUP BY ct.ma_san_pham
            ORDER BY voucher_qty DESC, voucher_orders DESC
            LIMIT :limit
            """,
            params,
        )

        customer_sync_top_products = _fetch_rows(
            f"""
            WITH purchase AS (
                SELECT
                    ct.ma_san_pham::text AS product_id,
                    COALESCE(MAX(sp.ten_san_pham), MAX(ct.ten_san_pham), ct.ma_san_pham::text) AS product_name,
                    SUM(ct.so_luong)::float AS total_qty,
                    COUNT(DISTINCT dh.ma_don_hang)::float AS order_count
                FROM {ORDER_SCHEMA}.don_hang dh
                JOIN {ORDER_SCHEMA}.chi_tiet_don_hang ct ON ct.ma_don_hang = dh.ma_don_hang
                LEFT JOIN {MENU_SCHEMA}.san_pham sp ON sp.ma_san_pham = ct.ma_san_pham
                {where_orders}
                GROUP BY ct.ma_san_pham
            ),
            rating AS (
                SELECT
                    dg.ma_san_pham::text AS product_id,
                    ROUND(AVG(dg.so_sao)::numeric, 2)::float AS avg_rating,
                    COUNT(*)::float AS total_reviews
                FROM {ORDER_SCHEMA}.danh_gia_san_pham dg
                WHERE dg.ngay_tao >= :since_ts
                GROUP BY dg.ma_san_pham
            ),
            favorite AS (
                SELECT
                    yt.ma_san_pham::text AS product_id,
                    COUNT(*)::float AS favorite_count
                FROM {ORDER_SCHEMA}.yeu_thich_san_pham yt
                WHERE yt.ngay_tao >= :since_ts
                GROUP BY yt.ma_san_pham
            ),
            voucher AS (
                SELECT
                    ct.ma_san_pham::text AS product_id,
                    SUM(ct.so_luong)::float AS voucher_qty
                FROM {ORDER_SCHEMA}.don_hang dh
                JOIN {ORDER_SCHEMA}.chi_tiet_don_hang ct ON ct.ma_don_hang = dh.ma_don_hang
                {where_voucher}
                GROUP BY ct.ma_san_pham
            ),
            all_products AS (
                SELECT product_id FROM purchase
                UNION
                SELECT product_id FROM rating
                UNION
                SELECT product_id FROM favorite
                UNION
                SELECT product_id FROM voucher
            )
            SELECT
                ap.product_id,
                COALESCE(MAX(sp.ten_san_pham), MAX(pu.product_name), ap.product_id) AS product_name,
                COALESCE(MAX(pu.total_qty), 0)::float AS total_qty,
                COALESCE(MAX(pu.order_count), 0)::float AS order_count,
                COALESCE(MAX(rt.avg_rating), 0)::float AS avg_rating,
                COALESCE(MAX(rt.total_reviews), 0)::float AS total_reviews,
                COALESCE(MAX(fv.favorite_count), 0)::float AS favorite_count,
                COALESCE(MAX(vc.voucher_qty), 0)::float AS voucher_qty,
                ROUND(
                    (
                        COALESCE(MAX(pu.total_qty), 0) * 1.0
                        + COALESCE(MAX(pu.order_count), 0) * 0.7
                        + COALESCE(MAX(rt.avg_rating), 0) * 2.0
                        + COALESCE(MAX(rt.total_reviews), 0) * 0.5
                        + COALESCE(MAX(fv.favorite_count), 0) * 2.5
                        + COALESCE(MAX(vc.voucher_qty), 0) * 0.8
                    )::numeric,
                    2
                )::float AS sync_score
            FROM all_products ap
            LEFT JOIN purchase pu ON pu.product_id = ap.product_id
            LEFT JOIN rating rt ON rt.product_id = ap.product_id
            LEFT JOIN favorite fv ON fv.product_id = ap.product_id
            LEFT JOIN voucher vc ON vc.product_id = ap.product_id
            LEFT JOIN {MENU_SCHEMA}.san_pham sp ON sp.ma_san_pham::text = ap.product_id
            GROUP BY ap.product_id
            ORDER BY sync_score DESC, total_qty DESC
            LIMIT :limit
            """,
            params,
        )

        total_orders_row = _fetch_rows(
            f"""
            SELECT COUNT(*)::int AS total_orders
            FROM {ORDER_SCHEMA}.don_hang dh
            {where_orders}
            """,
            params,
        )
        total_orders = int((total_orders_row[0] or {}).get("total_orders", 0)) if total_orders_row else 0

        response = {
            "branch_code": branch_filter or "ALL",
            "days": max(1, int(days or 30)),
            "generated_at": datetime.utcnow().isoformat(),
            "total_orders": total_orders,
            "top_products": top_products,
            "customer_sync_top_products": customer_sync_top_products,
            "payment_mix": payment_mix,
            "hour_groups": hour_groups,
            "top_rated_products": top_rated,
            "top_favorite_products": top_favorites,
            "top_voucher_products": top_voucher_products,
        }

        _safe_log_inference(
            endpoint="/ai/behavior/insights",
            user_id=None,
            status="success",
            started_at=started_at,
            request_payload={"branch_code": branch_filter or "ALL", "limit": safe_limit, "days": max(1, int(days or 30))},
            response_payload={
                "total_orders": total_orders,
                "top_products": len(top_products),
                "sync_top_products": len(customer_sync_top_products),
                "top_rated": len(top_rated),
                "top_favorites": len(top_favorites),
                "top_voucher": len(top_voucher_products),
            },
        )
        return response
    except Exception as exc:
        _safe_log_inference(
            endpoint="/ai/behavior/insights",
            user_id=None,
            status="error",
            started_at=started_at,
            request_payload={"branch_code": branch_filter or "ALL", "limit": safe_limit, "days": max(1, int(days or 30))},
            error_message=str(exc),
        )
        raise HTTPException(status_code=500, detail=f"Khong the tai du lieu hanh vi mua sam: {exc}") from exc

# ─── Helper: Groq-primary chat reply ─────────────────────────────────────────

def _groq_primary_chat_reply(
    content: str,
    user_name: str,
    user_id: str,
    base_context: Dict[str, Any],
    recent_orders: List[Dict[str, Any]],
    reply_to_text: str = "",
) -> Optional[str]:
    """Try Groq first for the AI chat reply. Returns text or None."""
    if not groq_is_available():
        return None

    context_text = _render_context_for_prompt(base_context, recent_orders)

    system_prompt = (
        "Ban la nhan vien tu van Avengers Coffee, than thien va am tinh. "
        "Su dung du lieu he thong (menu, khuyen mai, chi nhanh, don hang) de tu van chinh xac. "
        "Neu khach co y dinh dat hang (noi 'cho toi', 'dat', 'order'...), "
        "goi y ho bam nut 'Dat hang bang giong noi' hoac nhap mon muon dat. "
        "Tra loi ngan gon, than thien, KHONG qua 3 cau tru khi can giai thich phuc tap."
    )
    user_prompt = (
        f"DU LIEU HE THONG:\n{context_text}\n\n"
        f"Thong tin khach: ten={user_name}, id={user_id or 'unknown'}\n"
        f"{reply_to_text}\n"
        f"Cau hoi: {content}"
    )
    return groq_chat(system_prompt=system_prompt, user_prompt=user_prompt, max_tokens=480)


@app.post("/ai/chat")
async def ai_chat(request: Request):
    started_at = perf_counter()
    user_id = None
    try:
        data = await request.json()
        content = data.get("content", "").strip()
        user_id = str(data.get("user_id", "")).strip()
        user_name = str(data.get("user_name", "")).strip() or "Khach"
        reply_to = data.get("reply_to") or {}
        reply_to_text = ""
        if isinstance(reply_to, dict):
            replied_sender = str(reply_to.get("sender", "")).strip()
            replied_content = str(reply_to.get("content", "")).strip()
            if replied_content:
                sender_text = replied_sender or "tin nhan truoc"
                reply_to_text = f"Ngu canh phan hoi: Khach dang reply toi '{sender_text}': {replied_content}"

        if not content:
            _safe_log_inference(
                endpoint="/ai/chat",
                user_id=user_id or None,
                status="error",
                started_at=started_at,
                request_payload={"has_content": False},
                error_message="Noi dung dang trong",
            )
            return {"reply": "Noi dung dang trong.", "status": "error"}

        gemini_api_key = os.getenv("GEMINI_API_KEY")
        if not gemini_api_key:
            _safe_log_inference(
                endpoint="/ai/chat",
                user_id=user_id or None,
                status="error",
                started_at=started_at,
                request_payload={"has_content": True},
                error_message="Thieu API Key",
            )
            return {"reply": "Thieu API Key!", "status": "error"}

        base_context = _get_base_business_context()
        recent_orders = _get_user_recent_orders(user_id)
        context_text = _render_context_for_prompt(base_context, recent_orders)

        # === Try Groq first (30 RPM free, fast) ===
        groq_reply = _groq_primary_chat_reply(
            content=content,
            user_name=user_name,
            user_id=user_id,
            base_context=base_context,
            recent_orders=recent_orders,
            reply_to_text=reply_to_text,
        )
        if groq_reply:
            _safe_log_inference(
                endpoint="/ai/chat",
                user_id=user_id or None,
                status="success",
                started_at=started_at,
                request_payload={"content_preview": content[:180], "provider": "groq"},
                response_payload={"reply_preview": groq_reply[:220], "provider": "groq"},
            )
            return {"reply": groq_reply, "status": "success", "provider": "groq"}
        # === Groq unavailable → fall through to Gemini ===

        if _is_gemini_blocked():
            fallback_reply = _build_local_chat_fallback(content, user_name, base_context)
            _safe_log_inference(
                endpoint="/ai/chat",
                user_id=user_id or None,
                status="fallback",
                started_at=started_at,
                request_payload={"content_preview": content[:180], "reason": "gemini_blocked"},
                response_payload={"reply_preview": fallback_reply[:220], "reply_length": len(fallback_reply)},
            )
            return {"reply": fallback_reply, "status": "success"}

        user_prompt = (
            f"Thong tin khach: ten={user_name}, user_id={user_id or 'unknown'}\n"
            f"{reply_to_text}\n"
            f"Cau hoi cua khach: {content}\n"
            "Hay tra loi ngan gon, de hieu, than thien va uu tien su dung du lieu thuc te o tren."
        )

        system_text = (
            "Ban la nhan vien tu van cua Avengers Coffee. "
            "Su dung du lieu he thong de tu van menu, gia, khuyen mai, chi nhanh va tinh trang don. "
            "Neu du lieu khong co, noi ro la chua du thong tin va de nghi cach kiem tra tiep. "
            "Khong du doan vuot qua du lieu duoc cung cap. "
            f"LUON ket thuc cau tra loi bang token {_AI_END_TOKEN} o CUOI CUNG."
        )
        first_user_text = f"{context_text}\n\n{user_prompt}"

        first_body = _call_gemini_chat(
            gemini_api_key=gemini_api_key,
            system_text=system_text,
            user_text=first_user_text,
            max_output_tokens=280,
        )
        first_reply, finish_reason = _extract_reply_and_finish_reason(first_body)
        full_reply, has_end_token = _strip_end_token(first_reply)

        continuation_round = 0
        while _should_continue_reply(full_reply, finish_reason, has_end_token, continuation_round):
            continuation_round += 1
            continuation_prompt = (
                f"{context_text}\n\n"
                f"Cau hoi goc cua khach: {content}\n"
                f"Phan tra loi da co: {full_reply}\n\n"
                "Yeu cau: tiep tuc CHINH XAC ngay tai vi tri dang do, khong lap lai phan da tra loi, "
                "hoan tat cau tra loi ngan gon, mach lac, va ket thuc bang token "
                f"{_AI_END_TOKEN}."
            )
            next_body = _call_gemini_chat(
                gemini_api_key=gemini_api_key,
                system_text=system_text,
                user_text=continuation_prompt,
                max_output_tokens=220,
            )
            next_reply, finish_reason = _extract_reply_and_finish_reason(next_body)
            if not next_reply:
                break
            next_cleaned, next_has_end = _strip_end_token(next_reply)
            full_reply = _merge_without_overlap(full_reply, next_cleaned)
            has_end_token = has_end_token or next_has_end

        if _looks_incomplete_tail(full_reply):
            full_reply = f"{full_reply}."

        reply = full_reply or "Xin loi, hien tai toi chua the phan hoi."
        _safe_log_inference(
            endpoint="/ai/chat",
            user_id=user_id or None,
            status="success",
            started_at=started_at,
            request_payload={
                "content_preview": content[:180],
                "has_reply_to": bool(reply_to_text),
            },
            response_payload={
                "reply_preview": reply[:220],
                "reply_length": len(reply),
            },
        )
        return {"reply": reply, "status": "success", "provider": "gemini"}
    except requests.exceptions.HTTPError as e:
        error_message = _sanitize_error_text(str(e))
        status_code = e.response.status_code if e.response is not None else None
        reply_text = "Xin loi, he thong AI tam thoi ban. Vui long thu lai sau it phut."

        if status_code == 429:
            retry_in_seconds = None
            is_daily_quota = False
            try:
                body = e.response.json() if e.response is not None else {}
                retry_in_seconds = _extract_retry_delay_seconds(body)
                quota_id_markers = []
                for detail in (body.get("error", {}).get("details") or []):
                    if str(detail.get("@type", "")).endswith("QuotaFailure"):
                        for violation in (detail.get("violations") or []):
                            quota_id_markers.append(str(violation.get("quotaId") or ""))
                error_text = str((body.get("error") or {}).get("message") or "").lower()
                is_daily_quota = (
                    any("perday" in marker.lower() for marker in quota_id_markers)
                    or "per day" in error_text
                    or "current quota" in error_text
                )
            except Exception:
                retry_in_seconds = None
                is_daily_quota = False

            blocked_until = _set_gemini_block_until(retry_in_seconds, is_daily_quota)
            retry_hint = f"{max(1, int((blocked_until - datetime.utcnow()).total_seconds()))}s"
            fallback_reply = _build_local_chat_fallback(content="", user_name="Khach", base_context=_get_base_business_context())
            reply_text = (
                f"{fallback_reply}\n\n"
                f"(Gemini dang qua quota, he thong tam dung goi den {blocked_until.strftime('%H:%M:%S')} UTC.)"
            )

            logger.warning("Gemini bi 429, tam block trong %s", retry_hint)

        logger.error("Loi Chat HTTP: %s", error_message)
        _safe_log_inference(
            endpoint="/ai/chat",
            user_id=user_id,
            status="error",
            started_at=started_at,
            request_payload=None,
            error_message=error_message,
        )
        if status_code == 429:
            return {"reply": reply_text, "status": "success"}
        return {"reply": reply_text, "status": "error"}
    except Exception as e:
        error_message = _sanitize_error_text(str(e))
        logger.error("Loi Chat: %s", error_message)
        _safe_log_inference(
            endpoint="/ai/chat",
            user_id=user_id,
            status="error",
            started_at=started_at,
            request_payload=None,
            error_message=error_message,
        )
        return {"reply": "Xin loi, he thong AI tam thoi gap su co. Vui long thu lai sau.", "status": "error"}

@app.get("/ai/recommend/{user_id}", response_model=RecommendationResponse)
def get_recommendations(user_id: str, limit: int = 3, background_tasks: BackgroundTasks = None):
    started_at = perf_counter()
    try:
        safe_limit = max(1, min(int(limit or 3), 6))
        _queue_cf_retrain_if_needed(background_tasks)
        items = cf_model.recommend(user_id, limit=safe_limit)
        response = {
            "user_id": user_id,
            "items": items,
            "model": "item_based_cf",
            "is_personalized": cf_model.has_user_history(user_id),
            "generated_at": datetime.utcnow().isoformat(),
        }
        _safe_log_inference(
            endpoint="/ai/recommend/{user_id}",
            user_id=user_id,
            status="success",
            started_at=started_at,
            request_payload={"limit": safe_limit},
            response_payload={
                "count": len(items),
                "is_personalized": response.get("is_personalized"),
            },
        )
        return response
    except Exception as exc:
        logger.error(f"Loi goi y: {exc}")
        _safe_log_inference(
            endpoint="/ai/recommend/{user_id}",
            user_id=user_id,
            status="error",
            started_at=started_at,
            request_payload={"limit": limit},
            error_message=str(exc),
        )
        raise HTTPException(status_code=500, detail=str(exc))

# ─────────────────────────────────────────────────────────────────────────────
# /ai/chat/order-intent  — Text → Structured Order JSON
# /ai/voice-order        — Audio file → STT → Order JSON
# ─────────────────────────────────────────────────────────────────────────────

def _fetch_active_products() -> List[Dict[str, Any]]:
    """Fetch all active products for fuzzy matching."""
    sql = f"""
        SELECT ma_san_pham, ten_san_pham, gia_ban, hinh_anh_url
        FROM {MENU_SCHEMA}.san_pham
        WHERE trang_thai = TRUE
        ORDER BY la_hot DESC, la_moi DESC
        LIMIT 80
    """
    try:
        return _fetch_rows(sql)
    except Exception as exc:
        logger.warning("Cannot fetch products for order-intent: %s", exc)
        return []


class OrderIntentRequest(BaseModel):
    text: str
    user_id: Optional[str] = None
    branch_code: Optional[str] = None


@app.post("/ai/chat/order-intent")
async def chat_order_intent(body: OrderIntentRequest):
    """
    Parse natural-language text into a structured order.
    Input:  { text: "cho tôi 2 ly latte ít đường", user_id: "...", branch_code: "..." }
    Output: { intent, items (matched to DB), estimated_total, can_order }
    """
    started_at = perf_counter()
    text = (body.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="text is required")

    if not groq_is_available():
        raise HTTPException(
            status_code=503,
            detail="AI order-intent requires GROQ_API_KEY. Get free key at console.groq.com"
        )

    intent_data = groq_extract_order_intent(text)
    if not intent_data:
        return {
            "intent": "OTHER",
            "items": [],
            "estimated_total": 0,
            "can_order": False,
            "message": "Mình chưa hiểu bạn muốn đặt gì, hãy thử nói rõ hơn nhé!",
        }

    intent = intent_data.get("intent", "OTHER")
    raw_items = intent_data.get("items", []) or []

    matched_items = []
    estimated_total = 0.0
    if intent == "ORDER" and raw_items:
        db_products = _fetch_active_products()
        matched_items = match_products_to_db(raw_items, db_products)
        estimated_total = sum(i["subtotal"] for i in matched_items)

    can_order = intent == "ORDER" and any(i["matched"] for i in matched_items)

    _safe_log_inference(
        endpoint="/ai/chat/order-intent",
        user_id=body.user_id,
        status="success",
        started_at=started_at,
        request_payload={"text_preview": text[:120]},
        response_payload={"intent": intent, "items_count": len(matched_items), "total": estimated_total},
    )
    return {
        "intent": intent,
        "items": matched_items,
        "estimated_total": estimated_total,
        "can_order": can_order,
        "delivery_type": intent_data.get("delivery_type"),
        "branch_hint": intent_data.get("branch_hint") or body.branch_code,
        "raw_text": text,
        "message": (
            "Mình đã hiểu đơn của bạn! Xác nhận để đặt hàng nhé."
            if can_order
            else ("Mình chưa tìm thấy sản phẩm phù hợp trong menu." if intent == "ORDER" else None)
        ),
    }


@app.post("/ai/voice-order")
async def voice_order(
    audio: UploadFile = File(...),
    user_id: str = Form(default=""),
    branch_code: str = Form(default=""),
    language: str = Form(default="vi"),
):
    """
    Voice-to-Order: upload audio → Groq Whisper STT → order intent parsing.
    Accepts: webm, m4a, mp4, wav, mp3 (from expo-av or MediaRecorder).
    Returns same schema as /ai/chat/order-intent plus transcript.
    """
    started_at = perf_counter()

    if not groq_is_available():
        raise HTTPException(
            status_code=503,
            detail="Voice ordering requires GROQ_API_KEY. Get free key at console.groq.com"
        )

    # Read audio bytes
    audio_bytes = await audio.read()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Empty audio file")

    filename = audio.filename or "audio.webm"

    # Step 1: Whisper STT
    transcript = groq_transcribe_audio(
        audio_bytes=audio_bytes,
        filename=filename,
        language=language,
    )
    if not transcript:
        _safe_log_inference(
            endpoint="/ai/voice-order",
            user_id=user_id or None,
            status="error",
            started_at=started_at,
            error_message="STT failed",
        )
        raise HTTPException(status_code=422, detail="Không thể nhận dạng giọng nói. Hãy thử lại rõ hơn nhé!")

    # Step 2: Extract order intent from transcript
    intent_data = groq_extract_order_intent(transcript)
    intent = (intent_data or {}).get("intent", "OTHER")
    raw_items = (intent_data or {}).get("items", []) or []

    matched_items = []
    estimated_total = 0.0
    if intent == "ORDER" and raw_items:
        db_products = _fetch_active_products()
        matched_items = match_products_to_db(raw_items, db_products)
        estimated_total = sum(i["subtotal"] for i in matched_items)

    can_order = intent == "ORDER" and any(i["matched"] for i in matched_items)

    _safe_log_inference(
        endpoint="/ai/voice-order",
        user_id=user_id or None,
        status="success",
        started_at=started_at,
        request_payload={"filename": filename, "size_bytes": len(audio_bytes), "language": language},
        response_payload={"transcript": transcript[:120], "intent": intent, "items": len(matched_items)},
    )
    return {
        "transcript": transcript,
        "intent": intent,
        "items": matched_items,
        "estimated_total": estimated_total,
        "can_order": can_order,
        "delivery_type": (intent_data or {}).get("delivery_type"),
        "branch_hint": (intent_data or {}).get("branch_hint") or branch_code or None,
        "message": (
            f'Mình đã nghe: "{transcript}". Đây là đơn của bạn, xác nhận nhé!'
            if can_order
            else f'Mình đã nghe: "{transcript}". Bạn muốn đặt gì từ menu Avengers Coffee?'
        ),
    }


@app.get("/ai/health")
def health():
    return {
        "status": "ok",
        "cf_trained": cf_model.is_trained,
        "groq_available": groq_is_available(),
        "groq_model": GROQ_CHAT_MODEL,
        "stt_model": "whisper-large-v3-turbo",
    }