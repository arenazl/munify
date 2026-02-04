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
    created_at: datetime

    class Config:
        from_attributes = True


# ==================== Municipio-TipoTramite (Tabla intermedia) ====================

class MunicipioTipoTramiteCreate(BaseModel):
    tipo_tramite_id: int
    activo: bool = True
    orden: int = 0


class MunicipioTipoTramiteResponse(BaseModel):
    id: int
    municipio_id: int
    tipo_tramite_id: int
    activo: bool
    orden: int
    created_at: datetime
    tipo_tramite: Optional[TipoTramiteResponse] = None

    class Config:
        from_attributes = True


# ==================== Municipio-Tramite (Tabla intermedia) ====================

class MunicipioTramiteCreate(BaseModel):
    tramite_id: int
    activo: bool = True
    orden: int = 0
    tiempo_estimado_dias: Optional[int] = None
    costo: Optional[float] = None
    requisitos: Optional[str] = None
    documentos_requeridos: Optional[str] = None


class MunicipioTramiteResponse(BaseModel):
    id: int
    municipio_id: int
    tramite_id: int
    activo: bool
    orden: int
    tiempo_estimado_dias: Optional[int] = None
    costo: Optional[float] = None
    requisitos: Optional[str] = None
    documentos_requeridos: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


# ==================== Detección de duplicados ====================

class DuplicadoSugerido(BaseModel):
    id: int
    nombre: str
    descripcion: Optional[str] = None
    similitud: float  # 0-100


class CheckDuplicadosRequest(BaseModel):
    nombre: str
    descripcion: Optional[str] = None


class CheckDuplicadosResponse(BaseModel):
    hay_duplicados: bool
    duplicados: List[DuplicadoSugerido] = []
    mensaje: Optional[str] = None


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
    requiere_validacion_facial: bool = False
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


class TipoTramiteSimple(BaseModel):
    id: int
    nombre: str
    icono: Optional[str] = None
    color: Optional[str] = None

    class Config:
        from_attributes = True


class TramiteSimple(BaseModel):
    id: int
    nombre: str
    icono: Optional[str] = None
    tiempo_estimado_dias: int = 15
    costo: Optional[float] = None
    requiere_validacion_facial: bool = False
    tipo_tramite_id: Optional[int] = None
    tipo_tramite: Optional[TipoTramiteSimple] = None

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


class SolicitudGestionResponse(BaseModel):
    """Response optimizado para lista de gestión - sin cargar relación solicitante"""
    id: int
    municipio_id: int
    numero_tramite: str
    asunto: str
    descripcion: Optional[str] = None
    estado: EstadoSolicitud
    tramite_id: Optional[int] = None
    tramite: Optional[TramiteSimple] = None
    solicitante_id: Optional[int] = None
    # Datos desnormalizados del solicitante (no la relación)
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
