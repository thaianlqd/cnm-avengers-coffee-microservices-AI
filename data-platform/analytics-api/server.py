import os
import sys
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from services.readiness_service import VERSION

# Ensure current directory is in sys.path for robust imports in both local & docker
server_dir = Path(__file__).resolve().parent
if str(server_dir) not in sys.path:
    sys.path.insert(0, str(server_dir))

from db import init_warehouse_views
from routers import (
    platform,
    marts,
    stores,
    customers,
    products,
    query,
    system,
    reports,
    ai
)

app = FastAPI(
    title="Avengers Coffee Modern Enterprise Data Platform API",
    description="Enterprise Analytics & Self-Service BI Platform with Text-to-Report AI",
    version=VERSION
)

# ─── CORS Middleware ───
app.add_middleware(
    CORSMiddleware,
    allow_origins=[v.strip().rstrip('/') for v in os.getenv('DATA_ANALYST_ALLOWED_ORIGINS', '').split(',') if v.strip() and v.strip() != '*'],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


import logging
import threading
import time

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [%(name)s] %(message)s",
    datefmt="%H:%M:%S",
    stream=sys.stdout,
)
logger = logging.getLogger("server")


def _background_init_warehouse_views():
    for attempt in range(1, 61):  # Retry every 5s for up to 5 minutes
        time.sleep(5)
        try:
            if init_warehouse_views():
                logger.info(f"Warehouse views initialized successfully in background (attempt {attempt}).")
                break
        except Exception:
            pass


@app.on_event("startup")
def on_startup():
    if os.getenv("ANALYTICS_INITIALIZE_WAREHOUSE_ON_STARTUP", "false").lower() != "true":
        logger.info("Warehouse bootstrap disabled; serving existing schemas without startup DDL.")
        return
    ready = init_warehouse_views()
    if not ready:
        logger.info("Warehouse views pending source data sync. Starting background initialization watcher.")
        threading.Thread(target=_background_init_warehouse_views, daemon=True).start()


# ─── Register Routers ───
app.include_router(platform.router)
app.include_router(marts.router)
app.include_router(stores.router)
app.include_router(customers.router)
app.include_router(products.router)
app.include_router(query.router)
app.include_router(system.router)
app.include_router(reports.router)
app.include_router(ai.router)
from routers import analysis_modules
app.include_router(analysis_modules.router)


@app.get("/health")
@app.get("/api/health")
@app.get('/liveness')
def health_check():
    from services.analytical_capacity_planner import AnalyticalCapacityContract
    try:
        execution_rows=AnalyticalCapacityContract.from_env().execution_rows
        provider_budget=int(os.getenv('DATA_ANALYST_MAX_PROVIDER_CALLS_PER_TURN','3'))
    except Exception:
        execution_rows=provider_budget=None
    return {"status": "ok", "check": "liveness", "service": "avengers-analytics-api", 'version':VERSION,
            'provider_budget':provider_budget,
            'session_backend':os.getenv('DATA_ANALYST_SESSION_STORE','memory'),
            'artifact_backend':os.getenv('DATA_ANALYST_ARTIFACT_STORE',os.getenv('DATA_ANALYST_SESSION_STORE','memory')),
            'execution_rows':execution_rows}


@app.get('/api/readiness')
def readiness_check():
    from services.readiness_service import readiness
    result=readiness()
    return JSONResponse(result,status_code=200 if result['status']=='ready' else 503)


# ─── Static SPA Serving ───
DIST_DIR = os.path.join(os.path.dirname(__file__), "..", "dist")

if os.path.exists(DIST_DIR):
    app.mount("/assets", StaticFiles(directory=os.path.join(DIST_DIR, "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        if full_path.startswith("api"):
            raise HTTPException(status_code=404, detail="Not Found")
        file_path = os.path.join(DIST_DIR, full_path)
        if os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(os.path.join(DIST_DIR, "index.html"))




if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("server:app", host="0.0.0.0", port=port, reload=True)
