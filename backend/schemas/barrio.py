"""
Barrios: el nivel más fino del territorio (municipio -> zona -> barrio).

Vienen del mapa (OSM, vía el paquete offline) o los carga el municipio a
mano. La zona a la que pertenecen la decide el municipio, no la cartografía:
por eso `zona_id` se edita desde acá y desde el mover en lote.
"""
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, field_validator


def _nombre_limpio(v: Optional[str]) -> Optional[str]:
    if v is None:
        return v
    v = " ".join(v.split())
    if not v:
        raise ValueError("El nombre no puede quedar vacío")
    return v


class BarrioCreate(BaseModel):
    nombre: str
    zona_id: Optional[int] = None
    latitud: Optional[float] = None
    longitud: Optional[float] = None
    tipo: Optional[str] = None

    _limpiar = field_validator("nombre")(_nombre_limpio)


class BarrioUpdate(BaseModel):
    nombre: Optional[str] = None
    zona_id: Optional[int] = None
    latitud: Optional[float] = None
    longitud: Optional[float] = None
    tipo: Optional[str] = None

    _limpiar = field_validator("nombre")(_nombre_limpio)


class BarriosMover(BaseModel):
    """Mover varios barrios a una zona de una sola vez (o sacarlos de la suya
    con `zona_id=None`). Es la operación de "creá la segunda zona y movele
    barrios" que propone la pantalla de Zonas."""
    barrio_ids: list[int]
    zona_id: Optional[int] = None


class BarrioResponse(BaseModel):
    id: int
    nombre: str
    tipo: Optional[str] = None
    latitud: Optional[float] = None
    longitud: Optional[float] = None
    validado: Optional[bool] = None
    zona_id: Optional[int] = None
    created_at: Optional[datetime] = None
    # Lo completa el listado con COUNT/JOIN agrupados (una query por dato,
    # no una por barrio). None = no se calculó.
    zona_nombre: Optional[str] = None
    reclamos_count: Optional[int] = None
    # Si el barrio tiene su contorno dibujado (poligono cargado). El polígono
    # en sí no viaja acá: para el mapa está /zonas/regiones-mapa.
    tiene_contorno: Optional[bool] = None

    class Config:
        from_attributes = True
