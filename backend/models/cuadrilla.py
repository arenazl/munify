from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from core.database import Base
from .cuadrilla_categoria import cuadrilla_categoria

class Cuadrilla(Base):
    __tablename__ = "cuadrillas"

    id = Column(Integer, primary_key=True, index=True)

    # Multi-tenant: FK al municipio
    municipio_id = Column(Integer, ForeignKey("municipios.id"), nullable=True, index=True)
    municipio = relationship("Municipio")

    nombre = Column(String(100), nullable=False)
    apellido = Column(String(100), nullable=True)
    descripcion = Column(Text, nullable=True)

    # Especialidad de la cuadrilla (campo legacy, usar categorias)
    especialidad = Column(String(100), nullable=True)

    # Categoria principal
    categoria_principal_id = Column(Integer, ForeignKey("categorias.id"), nullable=True)
    categoria_principal = relationship("Categoria", foreign_keys=[categoria_principal_id])

    # Zona asignada por defecto
    zona_id = Column(Integer, ForeignKey("zonas.id"), nullable=True)
    zona_asignada = relationship("Zona")

    # Capacidad y estado
    capacidad_maxima = Column(Integer, default=10)
    activo = Column(Boolean, default=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relaciones
    categorias = relationship("Categoria", secondary=cuadrilla_categoria, backref="cuadrillas")
