from pydantic import BaseModel
from typing import Optional, List, Literal
from datetime import datetime


# ============ Enums ============

TipoGestionLiteral = Literal["RECLAMO", "TRAMITE", "AMBOS"]


# ============ Schemas para Dependencia (Template Global) ============

class DependenciaCreate(BaseModel):
    """Schema para crear una dependencia en el catálogo global"""
    nombre: str
    codigo: Optional[str] = None
    descripcion: Optional[str] = None
    direccion: Optional[str] = None
    localidad: Optional[str] = None
    ciudad: Optional[str] = None
    codigo_postal: Optional[str] = None
    telefono: Optional[str] = None
    email: Optional[str] = None
    horario_atencion: Optional[str] = None
    tipo_gestion: TipoGestionLiteral = "AMBOS"
    dependencia_padre_id: Optional[int] = None
    latitud: Optional[float] = None
    longitud: Optional[float] = None
    orden: int = 0


class DependenciaUpdate(BaseModel):
    """Schema para actualizar una dependencia"""
    nombre: Optional[str] = None
    codigo: Optional[str] = None
    descripcion: Optional[str] = None
    direccion: Optional[str] = None
    localidad: Optional[str] = None
    ciudad: Optional[str] = None
    codigo_postal: Optional[str] = None
    telefono: Optional[str] = None
    email: Optional[str] = None
    horario_atencion: Optional[str] = None
    tipo_gestion: Optional[TipoGestionLiteral] = None
    dependencia_padre_id: Optional[int] = None
    latitud: Optional[float] = None
    longitud: Optional[float] = None
    activo: Optional[bool] = None
    orden: Optional[int] = None


class DependenciaResponse(BaseModel):
    """Schema de respuesta para una dependencia"""
    id: int
    nombre: str
    codigo: Optional[str] = None
    descripcion: Optional[str] = None
    direccion: Optional[str] = None
    localidad: Optional[str] = None
    ciudad: Optional[str] = None
    codigo_postal: Optional[str] = None
    telefono: Optional[str] = None
    email: Optional[str] = None
    horario_atencion: Optional[str] = None
    tipo_gestion: str
    dependencia_padre_id: Optional[int] = None
    latitud: Optional[float] = None
    longitud: Optional[float] = None
    activo: bool
    orden: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ============ Schemas para MunicipioDependencia (Instancia por Municipio) ============

class MunicipioDependenciaCreate(BaseModel):
    """Schema para habilitar una dependencia en un municipio"""
    dependencia_id: int
    orden: int = 0
    # Personalizaciones locales (opcionales)
    direccion_local: Optional[str] = None
    localidad_local: Optional[str] = None
    telefono_local: Optional[str] = None
    email_local: Optional[str] = None
    horario_atencion_local: Optional[str] = None
    latitud_local: Optional[float] = None
    longitud_local: Optional[float] = None


class MunicipioDependenciaUpdate(BaseModel):
    """Schema para actualizar una dependencia habilitada"""
    activo: Optional[bool] = None
    orden: Optional[int] = None
    direccion_local: Optional[str] = None
    localidad_local: Optional[str] = None
    telefono_local: Optional[str] = None
    email_local: Optional[str] = None
    horario_atencion_local: Optional[str] = None
    latitud_local: Optional[float] = None
    longitud_local: Optional[float] = None


class CategoriaSimple(BaseModel):
    """Schema simplificado de categoría"""
    id: int
    nombre: str
    icono: Optional[str] = None
    color: Optional[str] = None

    class Config:
        from_attributes = True


class TipoTramiteSimple(BaseModel):
    """Schema simplificado de tipo de trámite"""
    id: int
    nombre: str
    icono: Optional[str] = None
    color: Optional[str] = None

    class Config:
        from_attributes = True


class MunicipioDependenciaResponse(BaseModel):
    """Schema de respuesta para una dependencia habilitada en un municipio"""
    id: int
    municipio_id: int
    dependencia_id: int
    activo: bool
    orden: int
    # Datos de la dependencia template
    dependencia: DependenciaResponse
    # Personalizaciones locales
    direccion_local: Optional[str] = None
    localidad_local: Optional[str] = None
    telefono_local: Optional[str] = None
    email_local: Optional[str] = None
    horario_atencion_local: Optional[str] = None
    latitud_local: Optional[float] = None
    longitud_local: Optional[float] = None
    # Valores efectivos (calculados)
    direccion_efectiva: Optional[str] = None
    telefono_efectivo: Optional[str] = None
    email_efectivo: Optional[str] = None
    # Asignaciones
    categorias_asignadas: Optional[List[CategoriaSimple]] = None
    tipos_tramite_asignados: Optional[List[TipoTramiteSimple]] = None
    # Timestamps
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class MunicipioDependenciaListResponse(BaseModel):
    """Schema simplificado para listados"""
    id: int
    municipio_id: int
    dependencia_id: int
    nombre: str  # del template
    codigo: Optional[str] = None
    tipo_gestion: str
    activo: bool
    orden: int
    # Contadores
    categorias_count: int = 0
    tipos_tramite_count: int = 0
    tramites_count: int = 0
    # Asignaciones completas (opcional, con include_assignments=true)
    categorias: Optional[List[CategoriaSimple]] = None
    tipos_tramite: Optional[List[TipoTramiteSimple]] = None
    tramites: Optional[List["TramiteSimple"]] = None

    class Config:
        from_attributes = True


# ============ Schemas para Asignaciones ============

class AsignarCategoriasRequest(BaseModel):
    """Request para asignar categorías a una dependencia en un municipio"""
    categoria_ids: List[int]


class AsignarTiposTramiteRequest(BaseModel):
    """Request para asignar tipos de trámite a una dependencia en un municipio"""
    tipo_tramite_ids: List[int]


class AsignarTramitesRequest(BaseModel):
    """Request para asignar trámites específicos a una dependencia en un municipio"""
    tramite_ids: List[int]


class TramiteSimple(BaseModel):
    """Schema simplificado de trámite"""
    id: int
    nombre: str
    tipo_tramite_id: int
    icono: Optional[str] = None
    color: Optional[str] = None

    class Config:
        from_attributes = True


class MuniDepCategoriaResponse(BaseModel):
    """Respuesta para una asignación dependencia-categoría"""
    id: int
    municipio_id: int
    dependencia_id: int
    categoria_id: int
    categoria: CategoriaSimple
    tiempo_resolucion_estimado: Optional[int] = None
    prioridad_default: Optional[int] = None
    activo: bool

    class Config:
        from_attributes = True


class MuniDepTipoTramiteResponse(BaseModel):
    """Respuesta para una asignación dependencia-tipo trámite"""
    id: int
    municipio_id: int
    dependencia_id: int
    tipo_tramite_id: int
    tipo_tramite: TipoTramiteSimple
    activo: bool

    class Config:
        from_attributes = True


# ============ Schemas para Bulk Operations ============

class HabilitarDependenciasRequest(BaseModel):
    """Request para habilitar múltiples dependencias a la vez"""
    dependencia_ids: List[int]


class AsignacionMasivaRequest(BaseModel):
    """Request para asignar categorías y tipos de trámite a una dependencia"""
    municipio_dependencia_id: int
    categoria_ids: Optional[List[int]] = None
    tipo_tramite_ids: Optional[List[int]] = None
