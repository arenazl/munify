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

from core.database import init_db
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
    print("Cerrando...", flush=True)

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

# NO middleware custom - dejar que uvicorn maneje los logs

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

@app.get("/health")
async def health():
    return {"status": "ok"}

# ============ FRONTEND (PWA) ============
if frontend_path.exists():
    # Assets del frontend
    assets_path = frontend_path / "assets"
    if assets_path.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_path)), name="frontend_assets")

    # Archivos específicos del PWA
    @app.get("/manifest.webmanifest")
    async def manifest():
        return FileResponse(frontend_path / "manifest.webmanifest")

    @app.get("/sw.js")
    async def service_worker():
        return FileResponse(frontend_path / "sw.js", media_type="application/javascript")

    @app.get("/registerSW.js")
    async def register_sw():
        return FileResponse(frontend_path / "registerSW.js", media_type="application/javascript")

    @app.get("/workbox-{filename}")
    async def workbox(filename: str):
        return FileResponse(frontend_path / f"workbox-{filename}")

    @app.get("/favicon.svg")
    async def favicon_svg():
        return FileResponse(frontend_path / "favicon.svg", media_type="image/svg+xml")

    @app.get("/favicon.ico")
    async def favicon_ico():
        file = frontend_path / "favicon.ico"
        if file.exists():
            return FileResponse(file)
        return FileResponse(frontend_path / "favicon.svg", media_type="image/svg+xml")

    # Catch-all para SPA - DEBE IR AL FINAL
    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        # Si el path empieza con api, no debería llegar acá
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not found")

        # Intentar servir archivo estático si existe
        file_path = frontend_path / full_path
        if file_path.exists() and file_path.is_file():
            return FileResponse(file_path)

        # Para cualquier otra ruta, servir index.html (SPA routing)
        return FileResponse(frontend_path / "index.html", media_type="text/html")
