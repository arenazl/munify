from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class ZonaCreate(BaseModel):
    nombre: str
    codigo: Optional[str] = None
    descripcion: Optional[str] = None
    latitud_centro: Optional[float] = None
    longitud_centro: Optional[float] = None

class ZonaUpdate(BaseModel):
    nombre: Optional[str] = None
    codigo: Optional[str] = None
    descripcion: Optional[str] = None
    latitud_centro: Optional[float] = None
    longitud_centro: Optional[float] = None
    activo: Optional[bool] = None

class ZonaResponse(BaseModel):
    id: int
    nombre: str
    codigo: Optional[str]
    descripcion: Optional[str]
    latitud_centro: Optional[float]
    longitud_centro: Optional[float]
    activo: bool
    created_at: datetime
    # Cuanto pesa la zona: reclamos que cayeron en ella y cuadrillas que la
    # tienen asignada. Los completa el listado con COUNT agrupado. Los usa
    # la pantalla de Configuracion para decir cual concentra el trabajo y
    # cual quedo sin equipo. None = no se calculo.
    reclamos_count: Optional[int] = None
    cuadrillas_count: Optional[int] = None

    class Config:
        from_attributes = True
