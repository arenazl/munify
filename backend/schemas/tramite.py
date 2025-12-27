from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from models.tramite import EstadoSolicitud


# ==================== Tipo Tramite (Categorías) ====================

class TipoTramiteBase(BaseModel):
    nombre: str
    descripcion: Optional[str] = None
    codigo: Optional[str] = None
    icono: Optional[str] = None
    color: Optional[str] = None
    activo: bool = True
    orden: int = 0


class TipoTramiteCreate(TipoTramiteBase):
    pass


class TipoTramiteUpdate(BaseModel):
    nombre: Optional[str] = None
    descripcion: Optional[str] = None
    codigo: Optional[str] = None
    icono: Optional[str] = None
    color: Optional[str] = None
    activo: Optional[bool] = None
    orden: Optional[int] = None


class TipoTramiteResponse(TipoTramiteBase):
    id: int
    municipio_id: int
    created_at: datetime

    class Config:
        from_attributes = True


# ==================== Tramite (Trámites específicos) ====================

class TramiteBase(BaseModel):
    nombre: str
    descripcion: Optional[str] = None
    icono: Optional[str] = None
    requisitos: Optional[str] = None
    documentos_requeridos: Optional[str] = None
    tiempo_estimado_dias: int = 15
    costo: Optional[float] = None
    url_externa: Optional[str] = None
    activo: bool = True
    orden: int = 0


class TramiteCreate(TramiteBase):
    tipo_tramite_id: int


class TramiteUpdate(BaseModel):
    nombre: Optional[str] = None
    descripcion: Optional[str] = None
    icono: Optional[str] = None
    requisitos: Optional[str] = None
    documentos_requeridos: Optional[str] = None
    tiempo_estimado_dias: Optional[int] = None
    costo: Optional[float] = None
    url_externa: Optional[str] = None
    activo: Optional[bool] = None
    orden: Optional[int] = None


class TramiteSimple(BaseModel):
    id: int
    nombre: str
    icono: Optional[str] = None
    tiempo_estimado_dias: int = 15
    costo: Optional[float] = None

    class Config:
        from_attributes = True


class TipoTramiteSimple(BaseModel):
    id: int
    nombre: str
    icono: Optional[str] = None
    color: Optional[str] = None

    class Config:
        from_attributes = True


class TramiteResponse(TramiteBase):
    id: int
    tipo_tramite_id: int
    tipo_tramite: Optional[TipoTramiteSimple] = None
    created_at: datetime

    class Config:
        from_attributes = True


class TipoTramiteConTramites(TipoTramiteResponse):
    tramites: List[TramiteSimple] = []

    class Config:
        from_attributes = True


# ==================== Solicitud (Pedidos diarios) ====================

class SolicitudCreate(BaseModel):
    tramite_id: int
    asunto: str
    descripcion: Optional[str] = None
    observaciones: Optional[str] = None
    # Datos del solicitante (para usuarios no logueados)
    nombre_solicitante: Optional[str] = None
    apellido_solicitante: Optional[str] = None
    dni_solicitante: Optional[str] = None
    email_solicitante: Optional[str] = None
    telefono_solicitante: Optional[str] = None
    direccion_solicitante: Optional[str] = None


class SolicitudUpdate(BaseModel):
    estado: Optional[EstadoSolicitud] = None
    empleado_id: Optional[int] = None
    prioridad: Optional[int] = None
    respuesta: Optional[str] = None
    observaciones: Optional[str] = None


class SolicitudAsignar(BaseModel):
    empleado_id: int
    comentario: Optional[str] = None


class EmpleadoSimple(BaseModel):
    id: int
    nombre: str
    apellido: Optional[str] = None

    class Config:
        from_attributes = True


class SolicitanteSimple(BaseModel):
    id: int
    nombre: str
    apellido: Optional[str] = None
    email: Optional[str] = None
    telefono: Optional[str] = None

    class Config:
        from_attributes = True


class SolicitudResponse(BaseModel):
    id: int
    municipio_id: int
    numero_tramite: str
    asunto: str
    descripcion: Optional[str] = None
    estado: EstadoSolicitud
    tramite_id: Optional[int] = None
    tramite: Optional[TramiteSimple] = None
    solicitante_id: Optional[int] = None
    solicitante: Optional[SolicitanteSimple] = None
    nombre_solicitante: Optional[str] = None
    apellido_solicitante: Optional[str] = None
    dni_solicitante: Optional[str] = None
    email_solicitante: Optional[str] = None
    telefono_solicitante: Optional[str] = None
    direccion_solicitante: Optional[str] = None
    empleado_id: Optional[int] = None
    empleado_asignado: Optional[EmpleadoSimple] = None
    prioridad: int = 3
    respuesta: Optional[str] = None
    observaciones: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    fecha_resolucion: Optional[datetime] = None

    class Config:
        from_attributes = True


# ==================== Historial ====================

class HistorialSolicitudResponse(BaseModel):
    id: int
    solicitud_id: int
    usuario_id: Optional[int] = None
    estado_anterior: Optional[EstadoSolicitud] = None
    estado_nuevo: Optional[EstadoSolicitud] = None
    accion: str
    comentario: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True
