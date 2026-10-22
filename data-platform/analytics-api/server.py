import os
import sys
from pathlib import Path
if os.getenv('AI_OFFLINE') != '1':
    # Public operator settings only; credentials stay in separate private file.
    settings_path=Path(__file__).resolve().parent/'.runtime/deployment.json'
    if settings_path.exists():
        import json
        settings=json.loads(settings_path.read_text())
        for name in {'DATA_ANALYST_AUTH_MODE','DATA_ANALYST_IDENTITY_LOGIN_URL','DATA_ANALYST_ACCESS_POLICY_PATH',
                     'DATA_ANALYST_AUDIT_SPOOL_DIR','DATA_ANALYST_OTEL_ENABLED','DATA_ANALYST_REPORT_SQL_MODE'}:
            if name in settings: os.environ.setdefault(name,settings[name])
        if os.getenv('DATA_ANALYST_REPORT_SQL_MODE') == 'deployment':
            os.environ['DATA_ANALYST_REPORT_SQL_MODE'] = settings.get('DATA_ANALYST_REPORT_SQL_MODE', 'disabled')
# Missing settings and isolated offline fixtures remain fail-closed. Explicit
# operator environment values still take precedence over the public file.
if os.getenv('DATA_ANALYST_REPORT_SQL_MODE') == 'deployment':
    os.environ['DATA_ANALYST_REPORT_SQL_MODE'] = 'disabled'
from fastapi import FastAPI, HTTPException, Request, Response, Body
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
from services.access_policy import AccessMiddleware
app.add_middleware(AccessMiddleware)
from services.telemetry import TelemetryMiddleware
app.add_middleware(TelemetryMiddleware)

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
    from route_policy import validate_routes
    validate_routes(app.routes)
    if os.getenv('DATA_ANALYST_REPORT_SQL_MODE') == 'deployment':
        os.environ['DATA_ANALYST_REPORT_SQL_MODE'] = 'disabled'
    if os.getenv('DATA_ANALYST_REPORT_SQL_MODE', 'disabled') not in {'disabled', 'trusted_admin'}:
        raise RuntimeError('Invalid SQL Explorer deployment mode')
    from services.readiness_service import catalog_probe
    catalog_probe(False)
    # V3.1: cached data coverage/freshness for the Analyst Workspace; requests
    # (capabilities, typing-time preflight) only read this snapshot.
    from services.data_coverage_service import start_background_refresh
    start_background_refresh()
    threading.Thread(target=_keep_analysis_caches_warm, name='analysis-cache-warmup', daemon=True).start()
    if os.getenv("ANALYTICS_INITIALIZE_WAREHOUSE_ON_STARTUP", "false").lower() != "true":
        logger.info("Warehouse bootstrap disabled; serving existing schemas without startup DDL.")
        return
    ready = init_warehouse_views()
    if not ready:
        logger.info("Warehouse views pending source data sync. Starting background initialization watcher.")
        threading.Thread(target=_background_init_warehouse_views, daemon=True).start()


def _keep_analysis_caches_warm():
    """Dashboards and preflight never pay a cold metadata/catalog load: refresh before the TTL lapses."""
    import time
    from services.metadata_service import get_local_metadata, LOCAL_TTL_SECONDS
    interval = max(60, LOCAL_TTL_SECONDS // 2)
    while True:
        try:
            from services.analysis_catalog import AnalysisCatalog
            from services.preflight_service import preflight_catalog
            AnalysisCatalog(get_local_metadata(force=True))
            preflight_catalog()
        except Exception:
            logger.warning("Analysis cache warmup skipped; requests load on demand.")
        time.sleep(interval)


# ─── Register Routers ───
@app.on_event('shutdown')
def on_shutdown():
    from services.analysis_job_service import shutdown_jobs
    shutdown_jobs()


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


def _auth_public(principal):
    return {'authenticated':True,'identity':principal.bound_owner,'role':principal.role,
            'permissions':sorted(principal.permissions),'datasets':list(principal.datasets),
            'scope':{'national':principal.national,'store_ids':list(principal.store_ids)},
            'policy_version':principal.policy_version,'expires_at':principal.expires_at}


@app.get('/api/auth/session')
def auth_session(request:Request):
    from services.access_policy import request_principal,development_fallback
    if development_fallback() and not request.cookies.get('analysis_auth') and not request.headers.get('authorization'):
        return {'authenticated':False,'mode':'explicit_development_browser','identity':'development-browser'}
    return _auth_public(request_principal(request))


def _login_origin(request):
    origin=request.headers.get('origin','').rstrip('/')
    allowed={v.strip().rstrip('/') for v in os.getenv('DATA_ANALYST_ALLOWED_ORIGINS','').split(',') if v.strip() and v.strip()!='*'}
    allowed.add(str(request.base_url).rstrip('/'))
    if not origin or origin not in allowed: raise HTTPException(403,'Nguồn đăng nhập không hợp lệ.')


@app.post('/api/auth/session')
def exchange_auth_session(request:Request,response:Response):
    from services.access_policy import request_principal,AUTH_COOKIE
    if os.getenv('DATA_ANALYST_AUTH_MODE') == 'identity_login_session':
        raise HTTPException(403,'Hãy đăng nhập để tạo phiên Data Platform.')
    _login_origin(request)
    principal=request_principal(request)
    bearer=request.headers.get('authorization','')
    if not bearer.startswith('Bearer '): raise HTTPException(401,'Cần token đã được xác minh từ Identity.')
    response.set_cookie(AUTH_COOKIE,bearer[7:],httponly=True,secure=request.url.scheme=='https',
        samesite='strict',path='/api',max_age=max(0,int(principal.expires_at-time.time())))
    response.headers['Cache-Control']='no-store'
    return _auth_public(principal)


@app.post('/api/auth/login')
def auth_login(request:Request,response:Response,payload:dict=Body(...)):
    from services.access_policy import verify_identity,principal_for,load_policy,AUTH_COOKIE
    _login_origin(request)
    username,password=payload.get('tai_khoan'),payload.get('mat_khau')
    if (set(payload)!={'tai_khoan','mat_khau'} or not isinstance(username,str) or not isinstance(password,str)
            or not 1<=len(username)<=120 or not 1<=len(password)<=256):
        raise HTTPException(400,'Thông tin đăng nhập chưa hợp lệ.')
    from urllib.parse import urlsplit
    endpoint=os.getenv('DATA_ANALYST_IDENTITY_LOGIN_URL','')
    parsed=urlsplit(endpoint)
    if parsed.scheme not in {'http','https'} or not parsed.netloc or parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise HTTPException(503,'Kết nối Identity chưa được cấu hình.')
    import requests
    try:
        with requests.post(endpoint,json={'tai_khoan':username,'mat_khau':password},timeout=(2,5),allow_redirects=False,stream=True) as upstream:
            if upstream.status_code in {400,401,403}: raise HTTPException(401,'Tài khoản hoặc mật khẩu không hợp lệ.')
            if upstream.status_code!=200 and upstream.status_code!=201: raise HTTPException(503,'Identity chưa sẵn sàng.')
            data=upstream.raw.read(20000)
            if len(data)>=20000: raise ValueError('Identity response exceeds capacity')
        import json
        data=json.loads(data)
        if os.getenv('DATA_ANALYST_AUTH_MODE') == 'identity_login_session':
            from services.access_policy import create_identity_session
            # Let the existing issuer verify its own token through protected
            # /users/me. No shared signing secret is copied into this service.
            bearer=data.get('accessToken') or data.get('token')
            if not isinstance(bearer,str) or not 1<=len(bearer)<=16384:
                raise HTTPException(503,'Identity chưa trả về token đăng nhập hợp lệ.')
            profile_url=parsed._replace(path='/users/me',query='',fragment='').geturl()
            with requests.get(profile_url,headers={'Authorization':'Bearer '+bearer},
                    timeout=(2,5),allow_redirects=False,stream=True) as verified:
                if verified.status_code in {401,403}: raise HTTPException(401,'Identity chưa xác nhận phiên đăng nhập.')
                if verified.status_code!=200: raise HTTPException(503,'Identity chưa xác minh được tài khoản.')
                profile=verified.raw.read(20000)
                if len(profile)>=20000: raise ValueError('Identity profile exceeds capacity')
            token,principal=create_identity_session({'user':json.loads(profile)})
        else:
            token=data.get('accessToken') or data.get('token')
            identity=verify_identity(token,secret=os.getenv('DATA_ANALYST_IDENTITY_JWT_SECRET',''),
                issuer=os.getenv('DATA_ANALYST_IDENTITY_JWT_ISSUER') or None,
                audience=os.getenv('DATA_ANALYST_IDENTITY_JWT_AUDIENCE') or None,
                allow_legacy=os.getenv('DATA_ANALYST_AUTH_ALLOW_LEGACY_JWT')=='1')
            principal=principal_for(identity,load_policy())
    except HTTPException: raise
    except Exception: raise HTTPException(503,'Kết nối Identity chưa sẵn sàng.') from None
    response.set_cookie(AUTH_COOKIE,token,httponly=True,secure=request.url.scheme=='https',
        samesite='strict',path='/api',max_age=max(0,int(principal.expires_at-time.time())))
    response.headers['Cache-Control']='no-store'
    return _auth_public(principal)


@app.post('/api/auth/logout')
def auth_logout(request:Request,response:Response):
    from services.access_policy import AUTH_COOKIE,csrf_origin
    csrf_origin(request)
    from services.access_policy import revoke_identity_session
    revoke_identity_session(request)
    response.delete_cookie(AUTH_COOKIE,path='/api')
    response.headers['Cache-Control']='no-store'
    return {'authenticated':False}


@app.get('/metrics')
def prometheus_metrics():
    from services.telemetry import prometheus_export
    return Response(content=prometheus_export(),media_type='text/plain; version=0.0.4')


@app.get('/api/system/metrics')
def telemetry_metrics():
    from services.telemetry import snapshot
    return snapshot()


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
