from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from core.database import Base


class CategoriaReclamo(Base):
    """
    Categoría de reclamos por municipio.

    Cada municipio es dueño absoluto de sus categorías de reclamo.
    Al crear un municipio se siembra un set inicial de 10 categorías
    (ver `services/categorias_seed.py`) que el admin puede ampliar,
    renombrar o eliminar libremente.
    """
    __tablename__ = "categorias_reclamo"
    __table_args__ = (
        UniqueConstraint('municipio_id', 'nombre', name='uq_cat_reclamo_muni_nombre'),
    )

    id = Column(Integer, primary_key=True, index=True)
    municipio_id = Column(Integer, ForeignKey("municipios.id", ondelete="CASCADE"), nullable=False, index=True)

    nombre = Column(String(100), nullable=False)
    descripcion = Column(Text, nullable=True)
    icono = Column(String(50), nullable=True)
    color = Column(String(20), nullable=True)

    # Tiempos de resolución y prioridad por defecto
    tiempo_resolucion_estimado = Column(Integer, default=48)  # horas
    prioridad_default = Column(Integer, default=3)  # 1-5

    activo = Column(Boolean, default=True)
    orden = Column(Integer, default=0)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relaciones
    municipio = relationship("Municipio", back_populates="categorias_reclamo")
    reclamos = relationship("Reclamo", back_populates="categoria")
