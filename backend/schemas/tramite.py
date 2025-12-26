from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime
from models.tramite import EstadoTramite


# ==================== Servicio Tramite ====================

class ServicioTramiteBase(BaseModel):
    nombre: str
    descripcion: Optional[str] = None
    icono: Optional[str] = None
    color: Optional[str] = None
    requisitos: Optional[str] = None
    documentos_requeridos: Optional[str] = None
    tiempo_estimado_dias: int = 15
    costo: Optional[float] = None
    url_externa: Optional[str] = None
    activo: bool = True
    orden: int = 0
    favorito: bool = False


class ServicioTramiteCreate(ServicioTramiteBase):
    pass


class ServicioTramiteUpdate(BaseModel):
    nombre: Optional[str] = None
    descripcion: Optional[str] = None
    icono: Optional[str] = None
    color: Optional[str] = None
    requisitos: Optional[str] = None
    documentos_requeridos: Optional[str] = None
    tiempo_estimado_dias: Optional[int] = None
    costo: Optional[float] = None
    url_externa: Optional[str] = None
    activo: Optional[bool] = None
    orden: Optional[int] = None
    favorito: Optional[bool] = None


class ServicioTramiteResponse(ServicioTramiteBase):
    id: int
    municipio_id: int
    created_at: datetime

    class Config:
        from_attributes = True


# ==================== Tramite ====================

class TramiteCreate(BaseModel):
    servicio_id: int
    asunto: str
    descripcion: Optional[str] = None
    # Datos del solicitante (para usuarios no logueados)
    nombre_solicitante: Optional[str] = None
    apellido_solicitante: Optional[str] = None
    dni_solicitante: Optional[str] = None
    email_solicitante: Optional[str] = None
    telefono_solicitante: Optional[str] = None
    direccion_solicitante: Optional[str] = None


class TramiteUpdate(BaseModel):
    estado: Optional[EstadoTramite] = None
    empleado_id: Optional[int] = None
    prioridad: Optional[int] = None
    respuesta: Optional[str] = None
    observaciones: Optional[str] = None


class TramiteAsignar(BaseModel):
    empleado_id: int
    comentario: Optional[str] = None


class ServicioSimple(BaseModel):
    id: int
    nombre: str
    icono: Optional[str] = None
    color: Optional[str] = None
    favorito: bool = False

    class Config:
        from_attributes = True


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


class TramiteResponse(BaseModel):
    id: int
    municipio_id: int
    numero_tramite: str
    asunto: str
    descripcion: Optional[str] = None
    estado: EstadoTramite
    servicio_id: int
    servicio: Optional[ServicioSimple] = None
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

class HistorialTramiteResponse(BaseModel):
    id: int
    tramite_id: int
    usuario_id: Optional[int] = None
    estado_anterior: Optional[EstadoTramite] = None
    estado_nuevo: Optional[EstadoTramite] = None
    accion: str
    comentario: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True
