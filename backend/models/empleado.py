from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, Time, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from core.database import Base
from .empleado_categoria import empleado_categoria

class Empleado(Base):
    __tablename__ = "empleados"

    id = Column(Integer, primary_key=True, index=True)

    # Multi-tenant: FK al municipio
    municipio_id = Column(Integer, ForeignKey("municipios.id"), nullable=True, index=True)
    municipio = relationship("Municipio", back_populates="empleados")

    nombre = Column(String(100), nullable=False)
    apellido = Column(String(100), nullable=True)
    telefono = Column(String(50), nullable=True)  # Para notificaciones WhatsApp
    descripcion = Column(Text, nullable=True)

    # Tipo de empleado: operario (reclamos) o administrativo (trámites)
    tipo = Column(String(20), default="operario", nullable=False)  # operario | administrativo

    # Especialidad del empleado (campo legacy, usar categorias)
    especialidad = Column(String(100), nullable=True)

    # Categoria principal
    categoria_principal_id = Column(Integer, ForeignKey("categorias.id"), nullable=True)
    categoria_principal = relationship("Categoria", foreign_keys=[categoria_principal_id])

    # Zona asignada por defecto
    zona_id = Column(Integer, ForeignKey("zonas.id"), nullable=True)
    zona_asignada = relationship("Zona", back_populates="empleados")

    # Capacidad y estado
    capacidad_maxima = Column(Integer, default=10)
    activo = Column(Boolean, default=True)

    # Horario default (legacy, usar empleado_horarios para horarios por dia)
    hora_entrada = Column(Time, nullable=True)
    hora_salida = Column(Time, nullable=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relaciones
    miembros = relationship("User", back_populates="empleado")
    reclamos_asignados = relationship("Reclamo", back_populates="empleado_asignado")
    solicitudes_asignadas = relationship("Solicitud", back_populates="empleado_asignado")
    categorias = relationship("Categoria", secondary=empleado_categoria, backref="empleados")

    # Nuevas relaciones
    cuadrillas_asignadas = relationship("EmpleadoCuadrilla", back_populates="empleado", cascade="all, delete-orphan")
    ausencias = relationship("EmpleadoAusencia", back_populates="empleado", cascade="all, delete-orphan")
    horarios = relationship("EmpleadoHorario", back_populates="empleado", cascade="all, delete-orphan")
    metricas = relationship("EmpleadoMetrica", back_populates="empleado", cascade="all, delete-orphan")
    capacitaciones = relationship("EmpleadoCapacitacion", back_populates="empleado", cascade="all, delete-orphan")
