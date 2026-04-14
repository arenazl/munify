from pydantic import BaseModel
from typing import Optional, List


class TramiteSugeridoResponse(BaseModel):
    id: int
    nombre: str
    descripcion: Optional[str] = None
    tiempo_estimado_dias: Optional[int] = None
    costo: Optional[float] = None
    documentos_sugeridos: Optional[str] = None
    rubro: Optional[str] = None
    # Campo derivado: documentos_sugeridos parseado a lista para que el frontend
    # pueda usarlo directo sin hacer split client-side.
    documentos_lista: List[str] = []

    class Config:
        from_attributes = True
