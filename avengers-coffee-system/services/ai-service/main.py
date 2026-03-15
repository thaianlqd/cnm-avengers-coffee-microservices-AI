"""
Avengers Coffee — AI Service
FastAPI application with:
  • Collaborative Filtering recommendations  (GET /recommend/{user_id})
  • Demand Forecasting                        (GET /forecast/combined)
  • Model management                          (POST /*/train, GET /model/stats)
"""
import logging
from contextlib import asynccontextmanager
from datetime import datetime
from typing import List, Optional

from fastapi import BackgroundTasks, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from cf_service import CollaborativeFilterModel
from db import get_db_engine
from forecast_service import DemandForecastModel

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

# ── Global model instances ────────────────────────────────────────────────────
cf_model = CollaborativeFilterModel()
fc_model = DemandForecastModel()


# ── Startup / Shutdown ────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("AI Service starting — training models...")
    engine = get_db_engine()
    try:
        cf_model.train(engine)
    except Exception as exc:
        logger.warning(f"CF training skipped at startup: {exc}")
    try:
        fc_model.train(engine)
    except Exception as exc:
        logger.warning(f"Forecast training skipped at startup: {exc}")
    yield
    logger.info("AI Service shutting down.")


# ── FastAPI app ───────────────────────────────────────────────────────────────
app = FastAPI(
    title="Avengers Coffee AI Service",
    description="Recommendation System (Collaborative Filtering) + Demand Forecasting (Holt-Winters / Prophet)",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Pydantic schemas ──────────────────────────────────────────────────────────
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


class ForecastPoint(BaseModel):
    ds: str
    yhat: float
    yhat_lower: Optional[float]
    yhat_upper: Optional[float]
    is_forecast: bool


class CombinedForecastResponse(BaseModel):
    branch_code: str
    metric: str
    history: List[ForecastPoint]
    forecast: List[ForecastPoint]
    model_engine: str
    trained_at: Optional[str]
    summary: dict


class CFStats(BaseModel):
    is_trained: bool
    total_users: int
    total_items: int
    total_interactions: int
    trained_at: Optional[str]


class ForecastStats(BaseModel):
    is_trained: bool
    total_records: int
    branches: List[str]
    models_count: int
    engine: str
    trained_at: Optional[str]


class ModelStatsResponse(BaseModel):
    collaborative_filtering: CFStats
    demand_forecasting: ForecastStats
    service: str
    uptime_ok: bool


# ── Routes ────────────────────────────────────────────────────────────────────

# ─── AI Chat ────────────────────────────────────────────────────────────────

from fastapi import Request
import os
import requests


@app.post("/ai/chat")
async def ai_chat(request: Request):
    data = await request.json()
    user_id = data.get("user_id")
    user_name = data.get("user_name")
    content = data.get("content")
    # Test with provided Gemini API key
    gemini_api_key = data.get("test_key") or os.getenv("GEMINI_API_KEY")
    if gemini_api_key:
        try:
            url = f"https://api.gemini.googleapis.com/v1beta/models/gemini-pro:generateContent?key={gemini_api_key}"
            payload = {
                "contents": [
                    {"parts": [{"text": content}]},
                ],
            }
            resp = requests.post(url, json=payload, timeout=10, verify=False)
            resp.raise_for_status()
            reply = resp.json()["candidates"][0]["content"]["parts"][0]["text"]
            return {"reply": reply, "used_key": gemini_api_key}
        except Exception as exc:
            return {"reply": f"Xin lỗi, AI Gemini đang bận. ({exc})", "used_key": gemini_api_key}
    return {"reply": f"AI (mock): Bạn vừa nói '{content}'.", "used_key": gemini_api_key}

@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "service": "avengers-coffee-ai",
        "cf_trained": cf_model.is_trained,
        "forecast_trained": fc_model.is_trained,
        "timestamp": datetime.utcnow().isoformat(),
    }


# ─── Recommendations ─────────────────────────────────────────────────────────

@app.get("/recommend/{user_id}", response_model=RecommendationResponse)
def get_recommendations(
    user_id: str,
    limit: int = Query(default=6, ge=1, le=20),
    branch_code: Optional[str] = Query(default=None),
):
    try:
        items = cf_model.recommend(user_id, limit=limit, branch_code=branch_code)
        return {
            "user_id": user_id,
            "items": items,
            "model": "item_based_collaborative_filtering",
            "is_personalized": cf_model.has_user_history(user_id),
            "generated_at": datetime.utcnow().isoformat(),
        }
    except Exception as exc:
        logger.error(f"Recommendation error for user {user_id}: {exc}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/recommend/train")
def train_cf(background_tasks: BackgroundTasks):
    engine = get_db_engine()
    background_tasks.add_task(cf_model.train, engine)
    return {
        "status": "training_started",
        "message": "Collaborative Filtering model retraining in background",
    }


# ─── Forecasting ─────────────────────────────────────────────────────────────

@app.get("/forecast/combined", response_model=CombinedForecastResponse)
def get_combined_forecast(
    branch_code: str = Query(default="ALL"),
    history_days: int = Query(default=30, ge=7, le=180),
    forecast_days: int = Query(default=14, ge=3, le=60),
    metric: str = Query(default="orders", pattern="^(orders|revenue)$"),
):
    """Returns historical data + forecast in one call — ideal for charting."""
    try:
        history = fc_model.get_historical(branch_code=branch_code, days=history_days, metric=metric)
        forecast = fc_model.predict(branch_code=branch_code, periods=forecast_days, metric=metric)

        # Summary stats
        fc_values = [pt["yhat"] for pt in forecast]
        hist_values = [pt["yhat"] for pt in history]
        summary = {
            "avg_forecast": round(float(sum(fc_values) / len(fc_values)), 1) if fc_values else 0,
            "max_forecast": round(max(fc_values), 1) if fc_values else 0,
            "min_forecast": round(min(fc_values), 1) if fc_values else 0,
            "avg_historical": round(float(sum(hist_values) / len(hist_values)), 1) if hist_values else 0,
            "trend_pct": round(
                ((fc_values[-1] - hist_values[-1]) / max(hist_values[-1], 1)) * 100, 1
            ) if (fc_values and hist_values) else 0,
        }

        stats = fc_model.get_stats()
        return {
            "branch_code": branch_code,
            "metric": metric,
            "history": history,
            "forecast": forecast,
            "model_engine": stats.get("engine", "unknown"),
            "trained_at": stats.get("trained_at"),
            "summary": summary,
        }
    except Exception as exc:
        logger.error(f"Forecast error: {exc}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/forecast/train")
def train_forecast(background_tasks: BackgroundTasks):
    engine = get_db_engine()
    background_tasks.add_task(fc_model.train, engine)
    return {
        "status": "training_started",
        "message": "Demand Forecast model retraining in background",
    }


# ─── Model Stats ─────────────────────────────────────────────────────────────

@app.get("/model/stats", response_model=ModelStatsResponse)
def model_stats():
    return {
        "collaborative_filtering": cf_model.get_stats(),
        "demand_forecasting": fc_model.get_stats(),
        "service": "avengers-coffee-ai-v1",
        "uptime_ok": True,
    }
