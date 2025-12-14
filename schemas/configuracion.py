from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class ConfiguracionCreate(BaseModel):
    clave: str
    valor: Optional[str] = None
    descripcion: Optional[str] = None
    tipo: str = "string"
    editable: bool = True

class ConfiguracionUpdate(BaseModel):
    valor: Optional[str] = None
    descripcion: Optional[str] = None

class ConfiguracionResponse(BaseModel):
    id: int
    clave: str
    valor: Optional[str]
    descripcion: Optional[str]
    tipo: str
    editable: bool
    created_at: datetime
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True
