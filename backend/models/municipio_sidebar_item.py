"""Items del sidebar ocultos por municipio.

El superadmin puede ocultar items del menu lateral per-muni. Si un item
no tiene fila en esta tabla, se muestra segun las reglas normales de
navegacion (rol, dependencia, etc). Si esta en la tabla con oculto=True,
se oculta para todos los usuarios de ese muni.
"""
from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime, ForeignKey,
    UniqueConstraint, Index,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from core.database import Base


class MunicipioSidebarItem(Base):
    __tablename__ = "municipio_sidebar_items"

    id = Column(Integer, primary_key=True, index=True)
    municipio_id = Column(Integer, ForeignKey("municipios.id", ondelete="CASCADE"), nullable=False)
    href = Column(String(200), nullable=False)       # ej. "/gestion/mostrador"
    oculto = Column(Boolean, nullable=False, default=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    updated_by_user_id = Column(Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True)

    municipio = relationship("Municipio")
    updated_by = relationship("User", foreign_keys=[updated_by_user_id])

    __table_args__ = (
        UniqueConstraint("municipio_id", "href", name="uq_msi_muni_href"),
        Index("ix_msi_muni", "municipio_id"),
    )
