from pydantic import BaseModel
from typing import Optional, List, Literal
from datetime import datetime


# ============ Schemas para Dirección ============

class DireccionCreate(BaseModel):
    nombre: str
    descripcion: Optional[str] = None
    direccion: Optional[str] = None  # "Av. San Martin 1234"
    localidad: Optional[str] = None
    codigo_postal: Optional[str] = None
    latitud: Optional[float] = None
    longitud: Optional[float] = None
    tipo_gestion: Literal["reclamos", "tramites", "ambos"] = "ambos"


class DireccionUpdate(BaseModel):
    nombre: Optional[str] = None
    descripcion: Optional[str] = None
    direccion: Optional[str] = None
    localidad: Optional[str] = None
    codigo_postal: Optional[str] = None
    latitud: Optional[float] = None
    longitud: Optional[float] = None
    tipo_gestion: Optional[Literal["reclamos", "tramites", "ambos"]] = None
    activo: Optional[bool] = None


class CategoriaSimple(BaseModel):
    """Schema simplificado de categoría para respuestas anidadas"""
    id: int
    nombre: str
    icono: Optional[str] = None
    color: Optional[str] = None

    class Config:
        from_attributes = True


class TipoTramiteSimple(BaseModel):
    """Schema simplificado de tipo de trámite para respuestas anidadas"""
    id: int
    nombre: str
    icono: Optional[str] = None
    color: Optional[str] = None

    class Config:
        from_attributes = True


class DireccionCategoriaResponse(BaseModel):
    """Respuesta para asignación dirección-categoría"""
    id: int
    categoria_id: int
    categoria: CategoriaSimple
    tiempo_resolucion_estimado: Optional[int] = None
    prioridad_default: Optional[int] = None
    activo: bool

    class Config:
        from_attributes = True


class DireccionTipoTramiteResponse(BaseModel):
    """Respuesta para asignación dirección-tipo trámite"""
    id: int
    tipo_tramite_id: int
    tipo_tramite: TipoTramiteSimple
    activo: bool

    class Config:
        from_attributes = True


class DireccionResponse(BaseModel):
    id: int
    nombre: str
    codigo: Optional[str] = None
    descripcion: Optional[str] = None
    direccion: Optional[str] = None
    localidad: Optional[str] = None
    codigo_postal: Optional[str] = None
    latitud: Optional[float] = None
    longitud: Optional[float] = None
    tipo_gestion: str
    activo: bool
    created_at: datetime
    # Categorías y tipos de trámite asignados (opcional, se carga bajo demanda)
    categorias_asignadas: Optional[List[DireccionCategoriaResponse]] = None
    tipos_tramite_asignados: Optional[List[DireccionTipoTramiteResponse]] = None

    class Config:
        from_attributes = True


class DireccionListResponse(BaseModel):
    """Schema simplificado para listados (sin relaciones anidadas)"""
    id: int
    nombre: str
    codigo: Optional[str] = None
    descripcion: Optional[str] = None
    direccion: Optional[str] = None
    localidad: Optional[str] = None
    tipo_gestion: str
    activo: bool

    class Config:
        from_attributes = True


# ============ Schemas para asignaciones ============

class AsignarCategoriasRequest(BaseModel):
    """Request para asignar categorías a una dirección"""
    categoria_ids: List[int]


class AsignarTiposTramiteRequest(BaseModel):
    """Request para asignar tipos de trámite a una dirección"""
    tipo_tramite_ids: List[int]


class AsignacionMasivaRequest(BaseModel):
    """Request para asignar múltiples categorías o tipos de trámite"""
    direccion_id: int
    categoria_ids: Optional[List[int]] = None
    tipo_tramite_ids: Optional[List[int]] = None
