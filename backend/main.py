from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from contextlib import asynccontextmanager
import time
import os
from pathlib import Path
import sentry_sdk
from slowapi.errors import RateLimitExceeded
import traceback

from core.database import init_db, close_db
from core.config import settings
from core.rate_limit import limiter, rate_limit_exceeded_handler
from api import api_router

# Inicializar Sentry si está configurado
if settings.SENTRY_DSN:
    sentry_sdk.init(
        dsn=settings.SENTRY_DSN,
        environment=settings.ENVIRONMENT,
        traces_sample_rate=0.1,
        profiles_sample_rate=0.1,
    )

# Importar todos los modelos para que se registren con Base.metadata
import models  # noqa: F401

# Frontend path
frontend_path = Path(__file__).parent / "frontend_dist"

# Landing path
landing_path = Path(__file__).parent / "landing_dist"

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    print(f"\n{'='*50}", flush=True)
    print(f"  Sistema de Reclamos v1.0.0", flush=True)
    print(f"  http://localhost:{settings.PORT}", flush=True)
    print(f"{'='*50}\n", flush=True)
    print(f"Inicializando base de datos...", flush=True)
    await init_db()
    print(f"Base de datos OK", flush=True)
    yield
    # Shutdown
    print("Cerrando conexiones de base de datos...", flush=True)
    await close_db()
    print("Cerrado OK", flush=True)

app = FastAPI(
    title="Sistema de Reclamos Municipales",
    description="API para gestión de reclamos vecinales",
    version="1.0.0",
    lifespan=lifespan
)

# Rate Limiting
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)

# Capturar excepciones no manejadas
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    error_detail = traceback.format_exc()
    print(f"ERROR in {request.url.path}:\n{error_detail}", flush=True)
    # Agregar headers CORS a respuestas de error
    headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Allow-Methods": "*",
        "Access-Control-Allow-Headers": "*",
    }
    return JSONResponse(
        status_code=500,
        content={"detail": str(exc), "traceback": error_detail},
        headers=headers
    )

# Handler para HTTPException (401, 403, etc) con CORS
@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Allow-Methods": "*",
        "Access-Control-Allow-Headers": "*",
    }
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
        headers=headers
    )

# CORS
cors_origins = settings.cors_origins_list
allow_all_origins = "*" in cors_origins or settings.ENVIRONMENT == "development"

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if allow_all_origins else cors_origins,
    allow_credentials=not allow_all_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Middleware para loguear requests con payloads (DEBUG)
import json as json_module
from starlette.responses import StreamingResponse
from starlette.concurrency import iterate_in_threadpool

@app.middleware("http")
async def log_requests(request: Request, call_next):
    if not request.url.path.startswith("/api"):
        return await call_next(request)

    query = f"?{request.url.query}" if request.url.query else ""
    method = request.method

    # Leer request body para POST/PUT/PATCH
    req_body = None
    if method in ("POST", "PUT", "PATCH"):
        try:
            body_bytes = await request.body()
            if body_bytes:
                req_body = body_bytes.decode("utf-8")[:500]  # Limitar a 500 chars
        except:
            pass

    # Log request
    print(f"\n{'='*60}", flush=True)
    print(f">> {method} {request.url.path}{query}", flush=True)
    if req_body:
        try:
            # Intentar formatear como JSON
            parsed = json_module.loads(req_body)
            print(f"   BODY: {json_module.dumps(parsed, ensure_ascii=False, indent=2)[:500]}", flush=True)
        except:
            print(f"   BODY: {req_body}", flush=True)

    start_time = time.time()
    response = await call_next(request)
    ms = (time.time() - start_time) * 1000

    # Capturar response body
    resp_body = b""
    async for chunk in response.body_iterator:
        resp_body += chunk

    # Log response
    print(f"<< {response.status_code} ({ms:.0f}ms)", flush=True)
    if resp_body and len(resp_body) < 1000:  # Solo si es pequeño
        try:
            parsed = json_module.loads(resp_body.decode("utf-8"))
            print(f"   RESP: {json_module.dumps(parsed, ensure_ascii=False, indent=2)[:800]}", flush=True)
        except:
            pass
    elif resp_body:
        print(f"   RESP: [{len(resp_body)} bytes]", flush=True)
    print(f"{'='*60}\n", flush=True)

    # Recrear response con el body capturado
    return StreamingResponse(
        iter([resp_body]),
        status_code=response.status_code,
        headers=dict(response.headers),
        media_type=response.media_type
    )

# Archivos estáticos del backend (imágenes subidas)
static_path = Path(__file__).parent / "static"
static_path.mkdir(exist_ok=True)
app.mount("/static", StaticFiles(directory=str(static_path)), name="static")

# Uploads (logos de municipios, documentos, etc.)
uploads_path = Path(__file__).parent / "uploads"
uploads_path.mkdir(exist_ok=True)
(uploads_path / "logos").mkdir(exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(uploads_path)), name="uploads")

# ============ RUTAS API ============
app.include_router(api_router, prefix="/api")

# ============ LANDING PAGE ============
# DESACTIVADO - Landing page comentada temporalmente
# if landing_path.exists():
#     @app.get("/landing", response_class=HTMLResponse)
#     async def serve_landing():
#         """Sirve la landing page estática"""
#         return FileResponse(
#             landing_path / "index.html",
#             media_type="text/html",
#             headers={
#                 "Cache-Control": "no-cache, no-store, must-revalidate",
#                 "Pragma": "no-cache",
#                 "Expires": "0"
#             }
#         )

@app.get("/health")
async def health():
    return {"status": "ok"}

# ============ FRONTEND (PWA) ============
# DESACTIVADO - Frontend servido desde Netlify
# Heroku solo sirve la API en /api/*
#
# if frontend_path.exists():
#     assets_path = frontend_path / "assets"
#     if assets_path.exists():
#         app.mount("/assets", StaticFiles(directory=str(assets_path)), name="frontend_assets")
#
#     @app.get("/manifest.webmanifest")
#     async def manifest():
#         return FileResponse(frontend_path / "manifest.webmanifest")
#
#     @app.get("/sw.js")
#     async def service_worker():
#         return FileResponse(frontend_path / "sw.js", media_type="application/javascript")
#
#     @app.get("/registerSW.js")
#     async def register_sw():
#         return FileResponse(frontend_path / "registerSW.js", media_type="application/javascript")
#
#     @app.get("/workbox-{filename}")
#     async def workbox(filename: str):
#         return FileResponse(frontend_path / f"workbox-{filename}")
#
#     @app.get("/favicon.svg")
#     async def favicon_svg():
#         return FileResponse(frontend_path / "favicon.svg", media_type="image/svg+xml")
#
#     @app.get("/favicon.ico")
#     async def favicon_ico():
#         file = frontend_path / "favicon.ico"
#         if file.exists():
#             return FileResponse(file)
#         return FileResponse(frontend_path / "favicon.svg", media_type="image/svg+xml")
#
#     @app.get("/{full_path:path}")
#     async def serve_spa(full_path: str):
#         if full_path.startswith("api/"):
#             raise HTTPException(status_code=404, detail="Not found")
#         file_path = frontend_path / full_path
#         if file_path.exists() and file_path.is_file():
#             return FileResponse(file_path)
#         return FileResponse(
#             frontend_path / "index.html",
#             media_type="text/html",
#             headers={
#                 "Cache-Control": "no-cache, no-store, must-revalidate",
#                 "Pragma": "no-cache",
#                 "Expires": "0"
#             }
#         )

# Ruta raíz - solo mensaje informativo
@app.get("/")
async def root():
    return {
        "service": "Munify API",
        "status": "running",
        "docs": "/docs",
        "health": "/health"
    }
