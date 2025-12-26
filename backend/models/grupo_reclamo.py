from sqlalchemy import Column, Integer, String, DateTime, Boolean, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from core.database import Base


class GrupoReclamo(Base):
    """
    Grupo que agrupa reclamos similares/recurrentes.
    Permite identificar problemas reportados múltiples veces.
    """
    __tablename__ = "grupos_reclamos"

    id = Column(Integer, primary_key=True, index=True)

    # Reclamo que se considera el principal del grupo
    reclamo_principal_id = Column(Integer, ForeignKey("reclamos.id"), nullable=False)
    reclamo_principal = relationship("Reclamo", foreign_keys=[reclamo_principal_id])

    # Nombre descriptivo del grupo (ej: "Bache Av. San Martín")
    nombre = Column(String(200), nullable=False)

    # Descripción opcional
    descripcion = Column(String(500), nullable=True)

    # Multi-tenant
    municipio_id = Column(Integer, ForeignKey("municipios.id"), nullable=False, index=True)
    municipio = relationship("Municipio")

    # Estado del grupo (activo/cerrado)
    activo = Column(Boolean, default=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relación con los reclamos agrupados
    reclamos_agrupados = relationship("ReclamoAgrupado", back_populates="grupo")


class ReclamoAgrupado(Base):
    """
    Tabla intermedia que vincula reclamos con sus grupos.
    Un reclamo puede estar en un grupo.
    """
    __tablename__ = "reclamos_agrupados"

    id = Column(Integer, primary_key=True, index=True)

    # Grupo al que pertenece
    grupo_id = Column(Integer, ForeignKey("grupos_reclamos.id"), nullable=False)
    grupo = relationship("GrupoReclamo", back_populates="reclamos_agrupados")

    # Reclamo agrupado
    reclamo_id = Column(Integer, ForeignKey("reclamos.id"), nullable=False)
    reclamo = relationship("Reclamo")

    # Si es el reclamo principal del grupo
    es_principal = Column(Boolean, default=False)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
