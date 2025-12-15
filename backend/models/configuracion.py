from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, ForeignKey, UniqueConstraint
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from core.database import Base

class Configuracion(Base):
    __tablename__ = "configuraciones"

    id = Column(Integer, primary_key=True, index=True)

    clave = Column(String(100), nullable=False, index=True)
    valor = Column(Text, nullable=True)
    descripcion = Column(Text, nullable=True)

    # Tipo de valor para validación
    tipo = Column(String(20), default="string")  # "string", "number", "boolean", "json"

    # Si es editable desde la UI
    editable = Column(Boolean, default=True)

    # Municipio (NULL = aplica a todos los municipios)
    municipio_id = Column(Integer, ForeignKey("municipios.id"), nullable=True, index=True)
    municipio = relationship("Municipio")

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Constraint: clave única por municipio (o global si municipio_id es NULL)
    __table_args__ = (
        UniqueConstraint('clave', 'municipio_id', name='uq_config_clave_municipio'),
    )
