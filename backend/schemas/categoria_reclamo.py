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
    # Cuántos reclamos usan esta categoría. Lo completa el listado con un
    # COUNT agrupado (una sola query para todas, no una por fila). La pantalla
    # de Configuración lo muestra en "SIN USAR" y "MÁS USADA", y es lo que
    # decide si una categoría se puede borrar. `None` = no se calculó.
    en_uso: Optional[int] = None

    class Config:
        from_attributes = True
