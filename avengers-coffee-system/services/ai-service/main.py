import logging
import os
import requests
from time import perf_counter
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from fastapi import BackgroundTasks, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import text

# Import tu cac file service
from cf_service import CollaborativeFilterModel
from db import get_db_engine
from forecast_service import DemandForecastModel
from ai_persistence import ensure_ai_storage, log_inference, safe_schema_name, upsert_model_registry

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

# Khoi tao model toan cuc
cf_model = CollaborativeFilterModel()
fc_model = DemandForecastModel()


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

    lowered = trimmed.lower()
    dangling_suffixes = (
        " va",
        " hoac",
        " voi",
        " nhu",
        " gom",
        " la",
        " de",
        " nen",
        " thu",
        " tra",
        " xin",
        " ban co the",
    )
    if any(lowered.endswith(suffix) for suffix in dangling_suffixes):
        return True

    # Tu cuoi qua ngan thi de dang la dang bi cat giua tu.
    last_word = trimmed.split()[-1] if trimmed.split() else ""
    return len(last_word) <= 2


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
    if round_index >= 3:
        return False
    if finish_reason in {"MAX_TOKENS", "RECITATION", "SAFETY"}:
        return True
    return _looks_incomplete_tail(current_text)


def _call_gemini_chat(gemini_api_key: str, system_text: str, user_text: str, max_output_tokens: int = 650) -> Dict[str, Any]:
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key={gemini_api_key}"
    payload = {
        "system_instruction": {"parts": [{"text": system_text}]},
        "contents": [{"role": "user", "parts": [{"text": user_text}]}],
        "generationConfig": {"temperature": 0.45, "maxOutputTokens": max_output_tokens},
    }
    resp = requests.post(url, json=payload, timeout=20)
    resp.raise_for_status()
    return resp.json()


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

    response = {
        "branch_code": branch_code,
        "metric": metric,
        "history_days": history_days,
        "forecast_days": forecast_days,
        "history": history,
        "forecast": forecast,
        "summary": _to_summary(forecast),
        "model_engine": fc_model.get_stats().get("engine"),
        "trained_at": fc_model.get_stats().get("trained_at"),
    }
    _safe_log_inference(
        endpoint="/ai/forecast/combined",
        user_id=None,
        status="success",
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

        gemini_api_key = data.get("test_key") or os.getenv("GEMINI_API_KEY")
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

        user_prompt = (
            f"Thong tin khach: ten={user_name}, user_id={user_id or 'unknown'}\n"
            f"{reply_to_text}\n"
            f"Cau hoi cua khach: {content}\n"
            "Hay tra loi ngan gon, de hieu, than thien va uu tien su dung du lieu thuc te ben duoi."
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
            max_output_tokens=650,
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
                max_output_tokens=500,
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
        return {"reply": reply, "status": "success"}
    except Exception as e:
        logger.error(f"Loi Chat: {e}")
        _safe_log_inference(
            endpoint="/ai/chat",
            user_id=user_id,
            status="error",
            started_at=started_at,
            request_payload=None,
            error_message=str(e),
        )
        return {"reply": f"Loi AI: {str(e)}", "status": "error"}

@app.get("/ai/recommend/{user_id}", response_model=RecommendationResponse)
def get_recommendations(user_id: str, limit: int = 3):
    started_at = perf_counter()
    try:
        safe_limit = max(1, min(int(limit or 3), 6))
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

@app.get("/ai/health")
def health():
    return {"status": "ok", "cf_trained": cf_model.is_trained}