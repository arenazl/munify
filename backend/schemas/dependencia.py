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


# ============ Schemas para MunicipioDependencia ============

class MunicipioDependenciaCreate(BaseModel):
    dependencia_id: int
    orden: int = 0
    direccion_local: Optional[str] = None
    localidad_local: Optional[str] = None
    telefono_local: Optional[str] = None
    email_local: Optional[str] = None
    horario_atencion_local: Optional[str] = None
    latitud_local: Optional[float] = None
    longitud_local: Optional[float] = None


class MunicipioDependenciaUpdate(BaseModel):
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
    id: int
    nombre: str
    icono: Optional[str] = None
    color: Optional[str] = None

    class Config:
        from_attributes = True


class MunicipioDependenciaResponse(BaseModel):
    id: int
    municipio_id: int
    dependencia_id: int
    activo: bool
    orden: int
    dependencia: DependenciaResponse
    direccion_local: Optional[str] = None
    localidad_local: Optional[str] = None
    telefono_local: Optional[str] = None
    email_local: Optional[str] = None
    horario_atencion_local: Optional[str] = None
    latitud_local: Optional[float] = None
    longitud_local: Optional[float] = None
    direccion_efectiva: Optional[str] = None
    telefono_efectivo: Optional[str] = None
    email_efectivo: Optional[str] = None
    # Relacion cargada como MuniDepCategoria (tabla intermedia), no CategoriaReclamo directo.
    # Por eso usamos MuniDepCategoriaResponse que sabe extraer .categoria → CategoriaSimple.
    categorias_asignadas: Optional[List["MuniDepCategoriaResponse"]] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class TramiteSimple(BaseModel):
    id: int
    nombre: str
    categoria_tramite_id: int
    icono: Optional[str] = None
    color: Optional[str] = None

    class Config:
        from_attributes = True


class MunicipioDependenciaListResponse(BaseModel):
    """Schema simplificado para listados de dependencias de un municipio."""
    id: int
    municipio_id: int
    dependencia_id: int
    nombre: str
    codigo: Optional[str] = None
    tipo_gestion: str
    activo: bool
    orden: int
    color: Optional[str] = "#6366f1"
    icono: Optional[str] = "Building2"
    categorias_count: int = 0
    tramites_count: int = 0
    categorias: Optional[List[CategoriaSimple]] = None
    tramites: Optional[List[TramiteSimple]] = None

    class Config:
        from_attributes = True


# ============ Schemas para Asignaciones ============

class AsignarCategoriasRequest(BaseModel):
    """Request para asignar categorías de reclamo a una dependencia."""
    categoria_ids: List[int]


class AsignarTramitesRequest(BaseModel):
    """Request para asignar trámites específicos a una dependencia."""
    tramite_ids: List[int]


class MuniDepCategoriaResponse(BaseModel):
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


# Resolver forward reference de MunicipioDependenciaResponse → MuniDepCategoriaResponse.
MunicipioDependenciaResponse.model_rebuild()


# ============ Bulk operations ============

class HabilitarDependenciasRequest(BaseModel):
    """Request para habilitar múltiples dependencias a la vez."""
    dependencia_ids: List[int]
