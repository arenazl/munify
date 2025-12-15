from sqlalchemy import Column, Integer, String, Boolean, DateTime, Float, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from core.database import Base


class SLAConfig(Base):
    """Configuración de SLA (Service Level Agreement) por categoría"""
    __tablename__ = "sla_config"

    id = Column(Integer, primary_key=True, index=True)

    # Multi-tenant
    municipio_id = Column(Integer, ForeignKey("municipios.id"), nullable=False, index=True)
    municipio = relationship("Municipio")

    # Puede ser por categoría específica o general (categoria_id = null)
    categoria_id = Column(Integer, ForeignKey("categorias.id"), nullable=True)
    categoria = relationship("Categoria")

    # Puede ser por prioridad específica o todas (prioridad = null)
    prioridad = Column(Integer, nullable=True)  # 1-5, null = todas

    # Tiempos en horas
    tiempo_respuesta = Column(Integer, default=24)       # Tiempo máx para primera respuesta (asignar)
    tiempo_resolucion = Column(Integer, default=72)      # Tiempo máx para resolver
    tiempo_alerta_amarilla = Column(Integer, default=48) # Tiempo para alerta amarilla (próximo a vencer)

    # Estado
    activo = Column(Boolean, default=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class SLAViolacion(Base):
    """Registro de violaciones de SLA"""
    __tablename__ = "sla_violaciones"

    id = Column(Integer, primary_key=True, index=True)

    reclamo_id = Column(Integer, ForeignKey("reclamos.id"), nullable=False)
    reclamo = relationship("Reclamo")

    tipo = Column(String(50), nullable=False)  # 'respuesta' o 'resolucion'

    # Tiempos
    tiempo_limite_horas = Column(Integer, nullable=False)
    tiempo_real_horas = Column(Float, nullable=False)
    exceso_horas = Column(Float, nullable=False)  # Cuánto se excedió

    # Estado actual cuando se detectó
    estado_reclamo = Column(String(50), nullable=False)

    # Timestamps
    fecha_vencimiento = Column(DateTime(timezone=True), nullable=False)
    fecha_deteccion = Column(DateTime(timezone=True), server_default=func.now())

    # Si fue notificada
    notificada = Column(Boolean, default=False)
