from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from models.tramite import EstadoSolicitud
from schemas.reclamo import DependenciaAsignadaSimple


# ==================== TramiteDocumentoRequerido (sub-tabla) ====================

class TramiteDocumentoRequeridoBase(BaseModel):
    nombre: str
    descripcion: Optional[str] = None
    obligatorio: bool = True
    orden: int = 0


class TramiteDocumentoRequeridoCreate(TramiteDocumentoRequeridoBase):
    pass


class TramiteDocumentoRequeridoUpdate(BaseModel):
    nombre: Optional[str] = None
    descripcion: Optional[str] = None
    obligatorio: Optional[bool] = None
    orden: Optional[int] = None


class TramiteDocumentoRequeridoResponse(TramiteDocumentoRequeridoBase):
    id: int
    tramite_id: int
    created_at: datetime

    class Config:
        from_attributes = True


# ==================== Tramite (per-municipio) ====================

class CategoriaTramiteSimple(BaseModel):
    id: int
    nombre: str
    icono: Optional[str] = None
    color: Optional[str] = None

    class Config:
        from_attributes = True


class TramiteBase(BaseModel):
    nombre: str
    descripcion: Optional[str] = None
    icono: Optional[str] = None
    tiempo_estimado_dias: int = 15
    costo: Optional[float] = None
    url_externa: Optional[str] = None
    requiere_validacion_dni: bool = False
    requiere_validacion_facial: bool = False
    # Configuracion de pago (cuando costo > 0)
    tipo_pago: Optional[str] = None       # boton_pago | rapipago | adhesion_debito | qr
    momento_pago: Optional[str] = None    # inicio | fin
    # CENAT (Fase 3 bundle) — tramites de licencia de conducir
    requiere_cenat: bool = False
    monto_cenat_referencia: Optional[float] = None
    activo: bool = True
    orden: int = 0


class TramiteCreate(TramiteBase):
    categoria_tramite_id: int
    documentos_requeridos: List[TramiteDocumentoRequeridoCreate] = []


class TramiteUpdate(BaseModel):
    categoria_tramite_id: Optional[int] = None
    nombre: Optional[str] = None
    descripcion: Optional[str] = None
    icono: Optional[str] = None
    tiempo_estimado_dias: Optional[int] = None
    costo: Optional[float] = None
    url_externa: Optional[str] = None
    requiere_validacion_dni: Optional[bool] = None
    requiere_validacion_facial: Optional[bool] = None
    tipo_pago: Optional[str] = None
    momento_pago: Optional[str] = None
    requiere_cenat: Optional[bool] = None
    monto_cenat_referencia: Optional[float] = None
    activo: Optional[bool] = None
    orden: Optional[int] = None


class TramiteSimple(BaseModel):
    id: int
    nombre: str
    icono: Optional[str] = None
    tiempo_estimado_dias: int = 15
    costo: Optional[float] = None
    tipo_pago: Optional[str] = None
    momento_pago: Optional[str] = None
    requiere_validacion_dni: bool = False
    requiere_validacion_facial: bool = False
    requiere_cenat: bool = False
    monto_cenat_referencia: Optional[float] = None
    categoria_tramite_id: Optional[int] = None
    categoria_tramite: Optional[CategoriaTramiteSimple] = None

    class Config:
        from_attributes = True


class TramiteResponse(TramiteBase):
    id: int
    municipio_id: int
    categoria_tramite_id: int
    categoria_tramite: Optional[CategoriaTramiteSimple] = None
    documentos_requeridos: List[TramiteDocumentoRequeridoResponse] = []
    created_at: datetime

    class Config:
        from_attributes = True


# ==================== Solicitud (instancia del trámite) ====================

class SolicitudCreate(BaseModel):
    tramite_id: int
    asunto: str
    descripcion: Optional[str] = None
    observaciones: Optional[str] = None
    # Datos del solicitante (para anónimos)
    nombre_solicitante: Optional[str] = None
    apellido_solicitante: Optional[str] = None
    dni_solicitante: Optional[str] = None
    email_solicitante: Optional[str] = None
    telefono_solicitante: Optional[str] = None
    direccion_solicitante: Optional[str] = None


class SolicitudUpdate(BaseModel):
    estado: Optional[EstadoSolicitud] = None
    municipio_dependencia_id: Optional[int] = None
    prioridad: Optional[int] = None
    respuesta: Optional[str] = None
    observaciones: Optional[str] = None


class SolicitudAsignar(BaseModel):
    municipio_dependencia_id: int
    comentario: Optional[str] = None


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
    municipio_dependencia_id: Optional[int] = None
    dependencia_asignada: Optional[DependenciaAsignadaSimple] = None
    empleado_id: Optional[int] = None
    prioridad: int = 3
    respuesta: Optional[str] = None
    observaciones: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    fecha_resolucion: Optional[datetime] = None

    class Config:
        from_attributes = True


class SolicitudGestionResponse(BaseModel):
    """Response optimizado para lista de gestión - sin cargar solicitante."""
    id: int
    municipio_id: int
    numero_tramite: str
    asunto: str
    descripcion: Optional[str] = None
    estado: EstadoSolicitud
    tramite_id: Optional[int] = None
    tramite: Optional[TramiteSimple] = None
    solicitante_id: Optional[int] = None
    nombre_solicitante: Optional[str] = None
    apellido_solicitante: Optional[str] = None
    dni_solicitante: Optional[str] = None
    email_solicitante: Optional[str] = None
    telefono_solicitante: Optional[str] = None
    direccion_solicitante: Optional[str] = None
    municipio_dependencia_id: Optional[int] = None
    dependencia_asignada: Optional[DependenciaAsignadaSimple] = None
    empleado_id: Optional[int] = None
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


# ==================== Verificación de documentos ====================

class DocumentoSolicitudChecklistItem(BaseModel):
    """Item del checklist combinado: requerido + documento subido (si hay)."""
    requerido_id: Optional[int] = None
    nombre: str
    descripcion: Optional[str] = None
    obligatorio: bool = True
    orden: int = 0
    # Documento asociado (si fue subido o verificado visualmente)
    documento_id: Optional[int] = None
    documento_url: Optional[str] = None
    documento_nombre: Optional[str] = None
    documento_tipo: Optional[str] = None  # "imagen" | "documento" | "verificacion_manual"
    verificado: bool = False
    verificado_por_id: Optional[int] = None
    verificado_por_nombre: Optional[str] = None
    fecha_verificacion: Optional[datetime] = None
    # Estado de rechazo por el supervisor.
    rechazado: bool = False
    motivo_rechazo: Optional[str] = None
    rechazado_por_nombre: Optional[str] = None
    fecha_rechazo: Optional[datetime] = None


class ChecklistDocumentosResponse(BaseModel):
    solicitud_id: int
    items: List[DocumentoSolicitudChecklistItem]
    todos_verificados: bool
    total_obligatorios: int
    total_obligatorios_verificados: int
    # Cuantos obligatorios tienen archivo subido (puede ser > verificados
    # si el vecino subio pero el supervisor todavia no tildo).
    total_obligatorios_subidos: int = 0
    # True cuando el vecino ya hizo click en "Enviar documentos a revisión".
    documentos_enviados_revision: bool = False
    fecha_envio_revision: Optional[datetime] = None
