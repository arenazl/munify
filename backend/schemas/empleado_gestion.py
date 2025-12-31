"""Schemas para gestion de empleados: cuadrillas, ausencias, horarios, metricas, capacitaciones"""
from pydantic import BaseModel
from typing import Optional, List
from datetime import date, time


# ==================== EMPLEADO CUADRILLA ====================

class EmpleadoCuadrillaCreate(BaseModel):
    empleado_id: int
    cuadrilla_id: int
    es_lider: bool = False


class EmpleadoCuadrillaUpdate(BaseModel):
    es_lider: Optional[bool] = None
    activo: Optional[bool] = None


class EmpleadoSimple(BaseModel):
    id: int
    nombre: str
    apellido: Optional[str] = None

    class Config:
        from_attributes = True


class CuadrillaSimple(BaseModel):
    id: int
    nombre: str

    class Config:
        from_attributes = True


class EmpleadoCuadrillaResponse(BaseModel):
    id: int
    empleado_id: int
    cuadrilla_id: int
    es_lider: bool
    fecha_ingreso: Optional[date] = None
    activo: bool
    empleado: Optional[EmpleadoSimple] = None
    cuadrilla: Optional[CuadrillaSimple] = None

    class Config:
        from_attributes = True


# ==================== AUSENCIAS ====================

class EmpleadoAusenciaCreate(BaseModel):
    empleado_id: int
    tipo: str  # vacaciones, licencia_medica, etc
    fecha_inicio: date
    fecha_fin: date
    motivo: Optional[str] = None


class EmpleadoAusenciaUpdate(BaseModel):
    tipo: Optional[str] = None
    fecha_inicio: Optional[date] = None
    fecha_fin: Optional[date] = None
    motivo: Optional[str] = None
    aprobado: Optional[bool] = None


class AprobadorSimple(BaseModel):
    id: int
    nombre: str
    apellido: str

    class Config:
        from_attributes = True


class EmpleadoAusenciaResponse(BaseModel):
    id: int
    empleado_id: int
    tipo: str
    fecha_inicio: date
    fecha_fin: date
    motivo: Optional[str] = None
    aprobado: bool
    aprobado_por_id: Optional[int] = None
    aprobado_por: Optional[AprobadorSimple] = None
    fecha_aprobacion: Optional[date] = None
    created_at: Optional[date] = None
    empleado: Optional[EmpleadoSimple] = None

    class Config:
        from_attributes = True


# ==================== HORARIOS ====================

class EmpleadoHorarioCreate(BaseModel):
    empleado_id: int
    dia_semana: int  # 0=Lunes, 6=Domingo
    hora_entrada: str  # "HH:MM"
    hora_salida: str  # "HH:MM"
    activo: bool = True


class EmpleadoHorarioUpdate(BaseModel):
    hora_entrada: Optional[str] = None
    hora_salida: Optional[str] = None
    activo: Optional[bool] = None


class EmpleadoHorarioResponse(BaseModel):
    id: int
    empleado_id: int
    dia_semana: int
    hora_entrada: time
    hora_salida: time
    activo: bool
    empleado: Optional[EmpleadoSimple] = None

    class Config:
        from_attributes = True


# ==================== METRICAS ====================

class EmpleadoMetricaCreate(BaseModel):
    empleado_id: int
    periodo: date
    reclamos_asignados: int = 0
    reclamos_resueltos: int = 0
    reclamos_rechazados: int = 0
    tiempo_promedio_respuesta: int = 0
    tiempo_promedio_resolucion: int = 0
    calificacion_promedio: float = 0.0
    sla_cumplido_porcentaje: float = 0.0


class EmpleadoMetricaResponse(BaseModel):
    id: int
    empleado_id: int
    periodo: date
    reclamos_asignados: int
    reclamos_resueltos: int
    reclamos_rechazados: int
    tiempo_promedio_respuesta: int
    tiempo_promedio_resolucion: int
    calificacion_promedio: float
    sla_cumplido_porcentaje: float
    created_at: Optional[date] = None
    empleado: Optional[EmpleadoSimple] = None

    class Config:
        from_attributes = True


# ==================== CAPACITACIONES ====================

class EmpleadoCapacitacionCreate(BaseModel):
    empleado_id: int
    nombre: str
    descripcion: Optional[str] = None
    institucion: Optional[str] = None
    fecha_inicio: Optional[date] = None
    fecha_fin: Optional[date] = None
    fecha_vencimiento: Optional[date] = None
    certificado_url: Optional[str] = None


class EmpleadoCapacitacionUpdate(BaseModel):
    nombre: Optional[str] = None
    descripcion: Optional[str] = None
    institucion: Optional[str] = None
    fecha_inicio: Optional[date] = None
    fecha_fin: Optional[date] = None
    fecha_vencimiento: Optional[date] = None
    certificado_url: Optional[str] = None


class EmpleadoCapacitacionResponse(BaseModel):
    id: int
    empleado_id: int
    nombre: str
    descripcion: Optional[str] = None
    institucion: Optional[str] = None
    fecha_inicio: Optional[date] = None
    fecha_fin: Optional[date] = None
    fecha_vencimiento: Optional[date] = None
    certificado_url: Optional[str] = None
    created_at: Optional[date] = None
    empleado: Optional[EmpleadoSimple] = None

    class Config:
        from_attributes = True


# ==================== BULK OPERATIONS ====================

class HorariosSemanaCreate(BaseModel):
    """Para crear/actualizar todos los horarios de un empleado de una vez"""
    empleado_id: int
    horarios: List[EmpleadoHorarioCreate]
