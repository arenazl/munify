from sqlalchemy import Column, Integer, Boolean, Date, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from core.database import Base


class Compra(Base):
    """
    Modelo de Compra - Representa una compra en el sistema
    """
    __tablename__ = "compras"

    id = Column(Integer, primary_key=True, index=True)
    municipio_id = Column(Integer, ForeignKey("municipios.id"), nullable=False, index=True)

    fecha = Column(Date, nullable=False)
    activo = Column(Boolean, default=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relaciones
    municipio = relationship("Municipio", back_populates="compras")
