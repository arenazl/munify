from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from models.enums import EstadoReclamo

class UsuarioSimple(BaseModel):
    id: int
    nombre: str
    apellido: str

    class Config:
        from_attributes = True

class HistorialResponse(BaseModel):
    id: int
    reclamo_id: int
    estado_anterior: Optional[EstadoReclamo]
    estado_nuevo: EstadoReclamo
    accion: str
    comentario: Optional[str]
    created_at: datetime
    usuario: UsuarioSimple

    class Config:
        from_attributes = True
