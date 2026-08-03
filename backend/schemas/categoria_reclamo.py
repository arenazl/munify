from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class CategoriaReclamoCreate(BaseModel):
    nombre: str
    descripcion: Optional[str] = None
    icono: Optional[str] = None
    color: Optional[str] = None
    tiempo_resolucion_estimado: int = 48
    prioridad_default: int = 3
    orden: int = 0
    # Categoría de uso interno: clasifica trabajo del municipio (OT) pero no se
    # le ofrece al vecino. Default False = catálogo público de siempre.
    interna: bool = False


class CategoriaReclamoUpdate(BaseModel):
    nombre: Optional[str] = None
    descripcion: Optional[str] = None
    icono: Optional[str] = None
    color: Optional[str] = None
    tiempo_resolucion_estimado: Optional[int] = None
    prioridad_default: Optional[int] = None
    orden: Optional[int] = None
    activo: Optional[bool] = None
    interna: Optional[bool] = None


class CategoriaReclamoResponse(BaseModel):
    id: int
    municipio_id: int
    nombre: str
    descripcion: Optional[str] = None
    icono: Optional[str] = None
    color: Optional[str] = None
    tiempo_resolucion_estimado: int
    prioridad_default: int
    orden: int
    activo: bool
    interna: bool = False
    created_at: datetime

    class Config:
        from_attributes = True
