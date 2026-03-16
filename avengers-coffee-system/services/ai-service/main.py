import logging
import os
import requests
from contextlib import asynccontextmanager
from datetime import datetime
from typing import List, Optional

from fastapi import BackgroundTasks, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Import từ các file service của bác
from cf_service import CollaborativeFilterModel
from db import get_db_engine
from forecast_service import DemandForecastModel

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger(__name__)

# Khởi tạo model toàn cục
cf_model = CollaborativeFilterModel()
fc_model = DemandForecastModel()

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("AI Service đang khởi động — Đang huấn luyện model...")
    engine = get_db_engine()
    try: cf_model.train(engine)
    except Exception as e: logger.warning(f"Lỗi train CF: {e}")
    try: fc_model.train(engine)
    except Exception as e: logger.warning(f"Lỗi train Forecast: {e}")
    yield
    logger.info("AI Service đang tắt.")

app = FastAPI(title="Avengers Coffee AI Service", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Pydantic Schemas ───
class RecommendedItem(BaseModel):
    id: str; name: str; price: float; image: Optional[str]
    category: Optional[str]; order_count: int = 0; score: float; reason: str

class RecommendationResponse(BaseModel):
    user_id: str; items: List[RecommendedItem]; model: str
    is_personalized: bool; generated_at: str

# ─── ROUTES (BẮT BUỘC CÓ /ai ĐỂ KHỚP VỚI GATEWAY) ───

@app.post("/ai/chat")
async def ai_chat(request: Request):
    try:
        data = await request.json()
        content = data.get("content", "").strip()
        if not content: return {"reply": "Nội dung trống bác ơi!", "status": "error"}

        gemini_api_key = data.get("test_key") or os.getenv("GEMINI_API_KEY")
        if not gemini_api_key: return {"reply": "Thiếu API Key!", "status": "error"}

        # Dùng model-id của năm 2026 cho ổn định
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key={gemini_api_key}"
        
        payload = {
            "system_instruction": {"parts": [{"text": "Bạn là nhân viên tư vấn quán Avengers Coffee. Trả lời thân thiện."}]},
            "contents": [{"role": "user", "parts": [{"text": content}]}],
            "generationConfig": {"temperature": 0.7, "maxOutputTokens": 500}
        }

        resp = requests.post(url, json=payload, timeout=15)
        resp.raise_for_status()
        reply = resp.json()["candidates"][0]["content"]["parts"][0]["text"]
        return {"reply": reply, "status": "success"}
    except Exception as e:
        logger.error(f"Lỗi Chat: {e}")
        return {"reply": f"Lỗi AI: {str(e)}", "status": "error"}

@app.get("/ai/recommend/{user_id}", response_model=RecommendationResponse)
def get_recommendations(user_id: str, limit: int = 6):
    try:
        # recommend() bên cf_service đã có sẵn fallback popularity rồi
        items = cf_model.recommend(user_id, limit=limit)
        return {
            "user_id": user_id, "items": items, "model": "item_based_cf",
            "is_personalized": cf_model.has_user_history(user_id),
            "generated_at": datetime.utcnow().isoformat(),
        }
    except Exception as exc:
        logger.error(f"Lỗi gợi ý: {exc}")
        raise HTTPException(status_code=500, detail=str(exc))

@app.get("/ai/health")
def health():
    return {"status": "ok", "cf_trained": cf_model.is_trained}