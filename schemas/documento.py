from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class UsuarioSimple(BaseModel):
    id: int
    nombre: str
    apellido: str

    class Config:
        from_attributes = True

class DocumentoResponse(BaseModel):
    id: int
    reclamo_id: int
    nombre_original: str
    url: str
    public_id: Optional[str]
    tipo: str
    mime_type: Optional[str]
    tamanio: Optional[int]
    etapa: Optional[str]
    created_at: datetime
    usuario: UsuarioSimple

    class Config:
        from_attributes = True
