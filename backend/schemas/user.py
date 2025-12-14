from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime
from models.enums import RolUsuario

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    nombre: str
    apellido: str
    telefono: Optional[str] = None
    dni: Optional[str] = None
    direccion: Optional[str] = None

class UserUpdate(BaseModel):
    nombre: Optional[str] = None
    apellido: Optional[str] = None
    telefono: Optional[str] = None
    dni: Optional[str] = None
    direccion: Optional[str] = None
    rol: Optional[RolUsuario] = None
    activo: Optional[bool] = None
    cuadrilla_id: Optional[int] = None

class UserResponse(BaseModel):
    id: int
    email: str
    nombre: str
    apellido: str
    telefono: Optional[str]
    dni: Optional[str]
    direccion: Optional[str]
    rol: RolUsuario
    activo: bool
    cuadrilla_id: Optional[int]
    created_at: datetime

    class Config:
        from_attributes = True

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse
