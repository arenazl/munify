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
    estado_anterior: Optional[EstadoReclamo] = None
    # Acciones tipo "email_enviado", "notificacion_push", "creado" no cambian
    # el estado. Por eso estado_nuevo es opcional: solo viene en transiciones.
    estado_nuevo: Optional[EstadoReclamo] = None
    accion: str
    comentario: Optional[str] = None
    created_at: datetime
    # Usuario puede ser null si la acción la dispara el sistema (ej: webhook)
    usuario: Optional[UsuarioSimple] = None

    class Config:
        from_attributes = True
