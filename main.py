from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from contextlib import asynccontextmanager
import time
import os
from pathlib import Path
import sentry_sdk
from slowapi.errors import RateLimitExceeded

from core.database import init_db
from core.config import settings
from core.logger import setup_logging, print_startup_banner, get_logger, print_request_log
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

# Configurar logging con colores
setup_logging("INFO")
logger = get_logger("main")

# Frontend path
frontend_path = Path(__file__).parent / "frontend_dist"

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    port = settings.PORT
    print_startup_banner("Sistema de Reclamos Municipales", "1.0.0", port)
    logger.info(f"Entorno: {settings.ENVIRONMENT}")
    logger.info(f"Frontend path: {frontend_path}, exists: {frontend_path.exists()}")
    if settings.SENTRY_DSN:
        logger.info("Sentry inicializado correctamente")
    logger.info("Rate limiting activado")
    logger.info("Inicializando base de datos...")
    await init_db()
    logger.info("Base de datos inicializada correctamente")
    yield
    # Shutdown
    logger.info("Cerrando aplicación...")

app = FastAPI(
    title="Sistema de Reclamos Municipales",
    description="API para gestión de reclamos vecinales",
    version="1.0.0",
    lifespan=lifespan
)

# Rate Limiting
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Middleware para loguear requests con Rich
@app.middleware("http")
async def log_requests(request: Request, call_next):
    start_time = time.time()
    response = await call_next(request)
    duration_ms = (time.time() - start_time) * 1000
    print_request_log(
        method=request.method,
        path=request.url.path,
        status=response.status_code,
        duration_ms=duration_ms
    )
    return response

# Archivos estáticos del backend
static_path = Path(__file__).parent / "static"
static_path.mkdir(exist_ok=True)
app.mount("/static", StaticFiles(directory=str(static_path)), name="static")

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

    # Catch-all para SPA - DEBE IR AL FINAL
    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not found")
        file_path = frontend_path / full_path
        if file_path.exists() and file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(frontend_path / "index.html", media_type="text/html")
else:
    @app.get("/")
    async def root():
        return {"message": "Sistema de Reclamos Municipales API", "version": "1.0.0"}
