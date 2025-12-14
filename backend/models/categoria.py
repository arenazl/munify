from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from core.database import Base

class Categoria(Base):
    __tablename__ = "categorias"

    id = Column(Integer, primary_key=True, index=True)

    # Multi-tenant: FK al municipio
    municipio_id = Column(Integer, ForeignKey("municipios.id"), nullable=True, index=True)
    municipio = relationship("Municipio", back_populates="categorias")

    nombre = Column(String(100), nullable=False)  # Removido unique=True para permitir mismo nombre en distintos municipios
    descripcion = Column(Text, nullable=True)
    icono = Column(String(50), nullable=True)  # Nombre del icono de Lucide
    color = Column(String(7), nullable=True)   # Color hex (#FF5733)

    # Información para el asistente IA
    ejemplos_reclamos = Column(Text, nullable=True)  # Ejemplos separados por |
    tip_ayuda = Column(String(255), nullable=True)   # Tip para el usuario

    # Tiempos de resolución estimados (en horas)
    tiempo_resolucion_estimado = Column(Integer, default=48)

    # Prioridad por defecto para esta categoría
    prioridad_default = Column(Integer, default=3)  # 1-5, donde 1 es más urgente

    activo = Column(Boolean, default=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relaciones
    reclamos = relationship("Reclamo", back_populates="categoria")
