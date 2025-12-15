from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime
from models.enums import RolUsuario
from core.config import settings

# Usar str si SKIP_EMAIL_VALIDATION está activado, sino EmailStr
EmailField = str if settings.SKIP_EMAIL_VALIDATION else EmailStr

class UserCreate(BaseModel):
    email: EmailField  # type: ignore
    password: str
    nombre: str
    apellido: str
    telefono: Optional[str] = None
    dni: Optional[str] = None
    direccion: Optional[str] = None
    municipio_id: Optional[int] = None  # Para registro de vecinos

class UserUpdate(BaseModel):
    nombre: Optional[str] = None
    apellido: Optional[str] = None
    telefono: Optional[str] = None
    dni: Optional[str] = None
    direccion: Optional[str] = None
    rol: Optional[RolUsuario] = None
    activo: Optional[bool] = None
    empleado_id: Optional[int] = None

class UserResponse(BaseModel):
    id: int
    municipio_id: Optional[int]
    email: str
    nombre: str
    apellido: str
    telefono: Optional[str]
    dni: Optional[str]
    direccion: Optional[str]
    rol: RolUsuario
    activo: bool
    empleado_id: Optional[int]
    created_at: datetime

    class Config:
        from_attributes = True

class UserLogin(BaseModel):
    email: EmailField  # type: ignore
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse
