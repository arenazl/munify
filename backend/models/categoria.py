from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from core.database import Base


class Categoria(Base):
    """
    Catálogo genérico de categorías de reclamos.
    Los municipios habilitan categorías mediante MunicipioCategoria.
    """
    __tablename__ = "categorias"

    id = Column(Integer, primary_key=True, index=True)
    # Ya no tiene municipio_id - es genérico

    nombre = Column(String(100), nullable=False, unique=True)
    descripcion = Column(Text, nullable=True)
    icono = Column(String(50), nullable=True)  # Nombre del icono de Lucide
    color = Column(String(7), nullable=True)   # Color hex (#FF5733)

    # Información para el asistente IA
    ejemplos_reclamos = Column(Text, nullable=True)  # Ejemplos separados por |
    tip_ayuda = Column(String(255), nullable=True)   # Tip para el usuario

    # Tiempos de resolución estimados (en horas) - valores por defecto
    tiempo_resolucion_estimado = Column(Integer, default=48)

    # Prioridad por defecto para esta categoría
    prioridad_default = Column(Integer, default=3)  # 1-5, donde 1 es más urgente

    activo = Column(Boolean, default=True)
    orden = Column(Integer, default=0)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relaciones
    reclamos = relationship("Reclamo", back_populates="categoria")
    municipios_habilitados = relationship("MunicipioCategoria", back_populates="categoria")


class MunicipioCategoria(Base):
    """
    Tabla intermedia: Qué categorías de reclamos tiene habilitado cada municipio.
    Permite personalizar tiempo de resolución y prioridad por municipio.
    """
    __tablename__ = "municipio_categorias"
    __table_args__ = (
        UniqueConstraint('municipio_id', 'categoria_id', name='uq_municipio_categoria'),
    )

    id = Column(Integer, primary_key=True, index=True)
    municipio_id = Column(Integer, ForeignKey("municipios.id"), nullable=False, index=True)
    categoria_id = Column(Integer, ForeignKey("categorias.id"), nullable=False, index=True)

    activo = Column(Boolean, default=True)
    orden = Column(Integer, default=0)  # Orden personalizado por municipio

    # Personalizaciones por municipio (NULL = usar valor genérico)
    tiempo_resolucion_estimado = Column(Integer, nullable=True)
    prioridad_default = Column(Integer, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relaciones
    municipio = relationship("Municipio", back_populates="categorias_habilitadas")
    categoria = relationship("Categoria", back_populates="municipios_habilitados")
