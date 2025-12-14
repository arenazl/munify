"""Modelo para configuración de auto-escalado de reclamos"""
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from core.database import Base


class ConfiguracionEscalado(Base):
    """Configuración de reglas de auto-escalado"""
    __tablename__ = "configuracion_escalado"

    id = Column(Integer, primary_key=True, index=True)

    nombre = Column(String(100), nullable=False)
    descripcion = Column(Text, nullable=True)

    # Condiciones de escalado
    horas_sin_asignar = Column(Integer, default=24)      # Horas sin asignar -> escalar
    horas_sin_iniciar = Column(Integer, default=48)      # Horas asignado sin iniciar -> escalar
    horas_sin_resolver = Column(Integer, default=72)     # Horas en proceso sin resolver -> escalar

    # Aplicable a (null = todas)
    categoria_id = Column(Integer, ForeignKey("categorias.id"), nullable=True)
    categoria = relationship("Categoria")

    prioridad_minima = Column(Integer, nullable=True)  # Solo reclamos con prioridad >= X

    # Acciones de escalado
    accion = Column(String(50), default="notificar")  # notificar, reasignar, aumentar_prioridad
    notificar_a = Column(String(200), nullable=True)  # emails separados por coma
    aumentar_prioridad_en = Column(Integer, default=1)  # Cuánto aumentar la prioridad

    activo = Column(Boolean, default=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class HistorialEscalado(Base):
    """Registro de escalados automáticos ejecutados"""
    __tablename__ = "historial_escalado"

    id = Column(Integer, primary_key=True, index=True)

    reclamo_id = Column(Integer, ForeignKey("reclamos.id"), nullable=False)
    reclamo = relationship("Reclamo")

    configuracion_id = Column(Integer, ForeignKey("configuracion_escalado.id"), nullable=True)
    configuracion = relationship("ConfiguracionEscalado")

    # Qué pasó
    tipo_escalado = Column(String(50), nullable=False)  # sin_asignar, sin_iniciar, sin_resolver
    accion_tomada = Column(String(50), nullable=False)  # notificado, reasignado, prioridad_aumentada

    # Detalles
    prioridad_anterior = Column(Integer, nullable=True)
    prioridad_nueva = Column(Integer, nullable=True)
    cuadrilla_anterior_id = Column(Integer, nullable=True)
    cuadrilla_nueva_id = Column(Integer, nullable=True)
    notificacion_enviada_a = Column(String(500), nullable=True)

    comentario = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
