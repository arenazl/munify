from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class NotificacionResponse(BaseModel):
    id: int
    titulo: str
    mensaje: str
    tipo: str
    reclamo_id: Optional[int] = None
    solicitud_id: Optional[int] = None
    accion_url: Optional[str] = None
    leida: bool
    created_at: datetime

    class Config:
        from_attributes = True
