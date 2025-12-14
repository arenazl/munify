"""
Configuración de Celery para tareas asíncronas.
"""
from celery import Celery
from core.config import settings

# Crear instancia de Celery
celery_app = Celery(
    "reclamos",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=["tasks.email_tasks"]
)

# Configuración
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="America/Argentina/Buenos_Aires",
    enable_utc=True,
    task_track_started=True,
    task_time_limit=300,  # 5 minutos max por tarea
    worker_prefetch_multiplier=1,
    task_acks_late=True,
)

# Configuración de reintentos
celery_app.conf.task_default_retry_delay = 60  # 1 minuto entre reintentos
celery_app.conf.task_max_retries = 3
