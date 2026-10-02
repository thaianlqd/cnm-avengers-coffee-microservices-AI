import os
import sys
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

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
    version="2.1.0"
)

# ─── CORS Middleware ───
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    init_warehouse_views()


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
    uvicorn.run("server:app", host="0.0.0.0", port=8501, reload=True)
