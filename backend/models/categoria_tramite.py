from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from core.database import Base


class CategoriaTramite(Base):
    """
    Categoría de trámites por municipio.

    Cada municipio es dueño absoluto de sus categorías de trámite.
    Al crear un municipio se siembra un set inicial de 10 categorías
    (ver `services/categorias_seed.py`) que el admin puede ampliar,
    renombrar o eliminar libremente.

    Reemplaza al modelo `TipoTramite` (catálogo global) eliminado.
    """
    __tablename__ = "categorias_tramite"
    __table_args__ = (
        UniqueConstraint('municipio_id', 'nombre', name='uq_cat_tramite_muni_nombre'),
    )

    id = Column(Integer, primary_key=True, index=True)
    municipio_id = Column(Integer, ForeignKey("municipios.id", ondelete="CASCADE"), nullable=False, index=True)

    nombre = Column(String(100), nullable=False)
    descripcion = Column(Text, nullable=True)
    icono = Column(String(50), nullable=True)
    color = Column(String(20), nullable=True)

    activo = Column(Boolean, default=True)
    orden = Column(Integer, default=0)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relaciones
    municipio = relationship("Municipio", back_populates="categorias_tramite")
    tramites = relationship(
        "Tramite",
        back_populates="categoria_tramite",
        order_by="Tramite.orden",
        cascade="all, delete-orphan",
    )
