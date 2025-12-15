from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
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

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    port = settings.PORT
    print_startup_banner("Sistema de Reclamos Municipales", "1.0.0", port)
    logger.info(f"Entorno: {settings.ENVIRONMENT}")
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

# CORS - origenes desde configuracion (desarrollo + produccion)
# En desarrollo permitimos cualquier origen para facilitar testing desde diferentes IPs
cors_origins = settings.cors_origins_list
allow_all_origins = "*" in cors_origins or settings.ENVIRONMENT == "development"

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if allow_all_origins else cors_origins,
    allow_credentials=not allow_all_origins,  # No credentials con wildcard
    allow_methods=["*"],
    allow_headers=["*"],
)

# Middleware para loguear requests con Rich
@app.middleware("http")
async def log_requests(request: Request, call_next):
    start_time = time.time()
    response = await call_next(request)
    duration_ms = (time.time() - start_time) * 1000

    # Loguear con Rich
    print_request_log(
        method=request.method,
        path=request.url.path,
        status=response.status_code,
        duration_ms=duration_ms
    )

    return response

# Servir archivos estáticos (imágenes de categorías)
static_path = Path(__file__).parent / "static"
static_path.mkdir(exist_ok=True)
app.mount("/static", StaticFiles(directory=str(static_path)), name="static")

# Rutas
app.include_router(api_router, prefix="/api")

@app.get("/")
async def root():
    return {"message": "Sistema de Reclamos Municipales API", "version": "1.0.0"}

@app.get("/health")
async def health():
    return {"status": "ok"}
