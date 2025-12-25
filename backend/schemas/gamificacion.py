"""
Schemas de Gamificación para validación con Pydantic
"""
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


# ========== PUNTOS ==========

class PuntosBase(BaseModel):
    puntos_totales: int
    puntos_mes_actual: int
    nivel: int
    progreso_nivel: int
    puntos_para_siguiente: int


class EstadisticasUsuario(BaseModel):
    reclamos_totales: int
    reclamos_resueltos: int
    reclamos_con_foto: int
    reclamos_con_ubicacion: int
    calificaciones_dadas: int
    semanas_consecutivas: int


# ========== BADGES ==========

class BadgeConfig(BaseModel):
    tipo: str
    nombre: str
    descripcion: str
    icono: str
    color: str
    requisito: str
    puntos_bonus: int


class BadgeObtenido(BadgeConfig):
    obtenido_en: Optional[datetime] = None


class BadgeResponse(BaseModel):
    tipo: str
    nombre: str
    descripcion: str
    icono: str
    color: str
    requisito: str
    puntos_bonus: int
    obtenido_en: Optional[datetime] = None

    class Config:
        from_attributes = True


# ========== HISTORIAL ==========

class HistorialPuntosItem(BaseModel):
    tipo: str
    puntos: int
    descripcion: Optional[str] = None
    fecha: Optional[datetime] = None


# ========== LEADERBOARD ==========

class LeaderboardEntry(BaseModel):
    posicion: int
    user_id: int
    nombre: str
    puntos: int
    puntos_totales: int
    reclamos: int
    badges: int


class LeaderboardResponse(BaseModel):
    periodo: str
    zona_id: Optional[int] = None
    zona_nombre: Optional[str] = None
    usuarios: List[LeaderboardEntry]


# ========== PERFIL COMPLETO ==========

class PerfilGamificacion(BaseModel):
    puntos: PuntosBase
    estadisticas: EstadisticasUsuario
    badges: List[BadgeResponse]
    badges_disponibles: List[BadgeConfig]
    posicion_leaderboard: Optional[int] = None
    historial_reciente: List[HistorialPuntosItem]


# ========== RECOMPENSAS ==========

class RecompensaBase(BaseModel):
    nombre: str
    descripcion: Optional[str] = None
    icono: str = "gift"
    puntos_requeridos: int
    stock: Optional[int] = None


class RecompensaCreate(RecompensaBase):
    fecha_inicio: Optional[datetime] = None
    fecha_fin: Optional[datetime] = None


class RecompensaResponse(RecompensaBase):
    id: int
    activo: bool
    fecha_inicio: Optional[datetime] = None
    fecha_fin: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


class RecompensaCanjeadaResponse(BaseModel):
    id: int
    recompensa: RecompensaResponse
    puntos_gastados: int
    estado: str
    codigo_canje: Optional[str] = None
    canjeado_en: datetime
    entregado_en: Optional[datetime] = None

    class Config:
        from_attributes = True


class CanjearRecompensaRequest(BaseModel):
    recompensa_id: int


# ========== RESPUESTA DE ACCIÓN ==========

class AccionGamificacionResponse(BaseModel):
    """Respuesta cuando se otorgan puntos"""
    puntos_ganados: int
    puntos_totales: int
    nuevos_badges: List[BadgeResponse]
    nivel_actual: int
    mensaje: str


# ========== CONFIG BADGES (para admin) ==========

class BadgesConfigResponse(BaseModel):
    """Todos los badges disponibles en el sistema"""
    badges: List[BadgeConfig]
