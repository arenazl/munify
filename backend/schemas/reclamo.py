from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, date, time
from models.enums import EstadoReclamo, MotivoRechazo

class ReclamoCreate(BaseModel):
    titulo: str
    descripcion: str
    direccion: str
    latitud: Optional[float] = None
    longitud: Optional[float] = None
    referencia: Optional[str] = None
    categoria_id: int
    zona_id: Optional[int] = None
    prioridad: int = 3
    # Datos de contacto del ciudadano (para registro automático)
    nombre_contacto: Optional[str] = None
    telefono_contacto: Optional[str] = None
    email_contacto: Optional[str] = None
    recibir_notificaciones: bool = True

class ReclamoUpdate(BaseModel):
    titulo: Optional[str] = None
    descripcion: Optional[str] = None
    direccion: Optional[str] = None
    latitud: Optional[float] = None
    longitud: Optional[float] = None
    referencia: Optional[str] = None
    categoria_id: Optional[int] = None
    zona_id: Optional[int] = None
    prioridad: Optional[int] = None

class ReclamoAsignar(BaseModel):
    empleado_id: int
    fecha_programada: Optional[date] = None
    hora_inicio: Optional[time] = None
    hora_fin: Optional[time] = None
    comentario: Optional[str] = None

class ReclamoRechazar(BaseModel):
    motivo: MotivoRechazo
    descripcion: Optional[str] = None

class ReclamoResolver(BaseModel):
    resolucion: str

class CreadorSimple(BaseModel):
    id: int
    nombre: str
    apellido: str
    email: str
    telefono: Optional[str] = None

    class Config:
        from_attributes = True

class CategoriaSimple(BaseModel):
    id: int
    nombre: str
    icono: Optional[str]
    color: Optional[str]

    class Config:
        from_attributes = True

class ZonaSimple(BaseModel):
    id: int
    nombre: str
    codigo: Optional[str]

    class Config:
        from_attributes = True

class EmpleadoSimple(BaseModel):
    id: int
    nombre: str
    apellido: Optional[str] = None
    especialidad: Optional[str]

    class Config:
        from_attributes = True

class DocumentoSimple(BaseModel):
    id: int
    nombre_original: str
    url: str
    tipo: str
    etapa: Optional[str]

    class Config:
        from_attributes = True

class ReclamoResponse(BaseModel):
    id: int
    titulo: str
    descripcion: str
    estado: EstadoReclamo
    prioridad: int
    direccion: str
    latitud: Optional[float]
    longitud: Optional[float]
    referencia: Optional[str]
    motivo_rechazo: Optional[MotivoRechazo]
    descripcion_rechazo: Optional[str]
    resolucion: Optional[str]
    fecha_resolucion: Optional[datetime]
    fecha_programada: Optional[date] = None
    hora_inicio: Optional[time] = None
    hora_fin: Optional[time] = None
    created_at: datetime
    updated_at: Optional[datetime]

    categoria: CategoriaSimple
    zona: Optional[ZonaSimple]
    creador: CreadorSimple
    empleado_asignado: Optional[EmpleadoSimple]
    documentos: List[DocumentoSimple] = []

    class Config:
        from_attributes = True
