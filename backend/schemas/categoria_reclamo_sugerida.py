from pydantic import BaseModel
from typing import Optional


class CategoriaReclamoSugeridaResponse(BaseModel):
    """
    Sugerencia del catálogo global de categorías de reclamo. Usado por el
    autocomplete del wizard admin en `/gestion/categorias-reclamo`.
    """
    id: int
    nombre: str
    descripcion: Optional[str] = None
    icono: Optional[str] = None
    color: Optional[str] = None
    tiempo_resolucion_estimado: Optional[int] = None
    prioridad_default: Optional[int] = None
    rubro: Optional[str] = None

    class Config:
        from_attributes = True
