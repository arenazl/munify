from sqlalchemy import Column, Integer, Boolean, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from core.database import Base


class ReclamoPersona(Base):
    """
    Tabla intermedia que vincula múltiples usuarios (vecinos) con un reclamo.
    Permite que múltiples vecinos se unan a un mismo reclamo existente.
    """
    __tablename__ = "reclamo_personas"
    __table_args__ = (
        UniqueConstraint('reclamo_id', 'usuario_id', name='uq_reclamo_persona'),
    )

    id = Column(Integer, primary_key=True, index=True)

    # FK al reclamo
    reclamo_id = Column(Integer, ForeignKey("reclamos.id"), nullable=False, index=True)
    reclamo = relationship("Reclamo", back_populates="personas")

    # FK al usuario (vecino)
    usuario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False, index=True)
    usuario = relationship("User", back_populates="reclamos_unidos")

    # Es el creador original o se sumó después
    es_creador_original = Column(Boolean, default=False)

    # Timestamp de cuando se sumó/creó
    created_at = Column(DateTime(timezone=True), server_default=func.now())
