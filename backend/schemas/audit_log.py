"""Schemas Pydantic para audit_logs (lista, detalle, stats, settings)."""
from datetime import datetime
from typing import Optional, Any
from pydantic import BaseModel


class AuditLogItem(BaseModel):
    """Item para la lista (sin campos pesados como request_body)."""
    id: int
    created_at: datetime
    usuario_id: Optional[int] = None
    usuario_email: Optional[str] = None
    usuario_rol: Optional[str] = None
    municipio_id: Optional[int] = None
    municipio_nombre: Optional[str] = None  # join con municipios para mostrar
    method: str
    path: str
    status_code: int
    duracion_ms: int
    action: Optional[str] = None
    entity_type: Optional[str] = None
    entity_id: Optional[int] = None
    ip_address: Optional[str] = None

    class Config:
        from_attributes = True


class AuditLogDetail(AuditLogItem):
    """Detalle expandido (incluye payloads JSON)."""
    query_params: Optional[Any] = None
    request_body: Optional[Any] = None
    response_summary: Optional[Any] = None
    error_message: Optional[str] = None
    user_agent: Optional[str] = None


class AuditLogPage(BaseModel):
    """Respuesta paginada."""
    items: list[AuditLogItem]
    total: int
    page: int
    limit: int
    has_more: bool


class AuditStats(BaseModel):
    """Métricas agregadas para los widgets de la consola."""
    total_requests: int
    error_count: int  # 4xx + 5xx
    error_rate: float  # 0..1
    p50_ms: int
    p95_ms: int
    top_endpoints: list[dict]  # [{path, count}]
    slowest_endpoints: list[dict]  # [{path, p95_ms}]
    requests_by_status: dict[str, int]  # {"2xx": N, "4xx": M, ...}


class DebugModeResponse(BaseModel):
    enabled: bool


class DebugModeUpdate(BaseModel):
    enabled: bool


class AuditGroupedRow(BaseModel):
    """Fila de la vista agrupada por endpoint."""
    path: str
    count: int
    p50_ms: int
    p95_ms: int
    max_ms: int
    errors: int
    last_seen: datetime


class AuditGroupedPage(BaseModel):
    items: list[AuditGroupedRow]
    total: int


class ConsolaResumen(BaseModel):
    """Stats cross-tenant para la landing del super admin."""
    total_municipios: int
    total_usuarios: int
    total_reclamos: int
    total_solicitudes: int
    # Actividad últimas 24h
    requests_24h: int
    errors_24h: int
    error_rate_24h: float
    p50_ms_24h: int
    p95_ms_24h: int
    # Top 5 munis por requests 24h
    top_municipios: list[dict]  # [{municipio_id, municipio_nombre, count}]
    # Top 5 endpoints más lentos (p95) en 24h
    slowest_endpoints: list[dict]  # [{path, p95_ms, count}]
    # Últimos 10 errores
    recent_errors: list[dict]  # [{created_at, method, path, status_code, municipio_nombre}]
