"""Tipos de concepto + conceptos de gasto per-muni.

Reemplaza el JSON estatico `data/conceptos_gasto.json`. Cada municipio
tiene sus propios tipos (Sueldos y haberes, Materiales, etc.) y dentro
de cada tipo, los conceptos concretos (Sueldo mensual, Aguinaldo, etc.).

El wizard de gasto lee de aca para el autocomplete de "concepto".
"""
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from core.database import Base


class TesoreriaTipoConcepto(Base):
    """Categoria de conceptos de gasto (ej: 'Sueldos y haberes')."""
    __tablename__ = "tesoreria_tipos_concepto"

    id = Column(Integer, primary_key=True, index=True)
    municipio_id = Column(Integer, ForeignKey("municipios.id"), nullable=False, index=True)

    nombre = Column(String(100), nullable=False, index=True)
    descripcion = Column(Text, nullable=True)
    color = Column(String(20), nullable=True)
    icono = Column(String(60), nullable=True)
    orden = Column(Integer, default=0, nullable=False)

    activo = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    conceptos = relationship(
        "TesoreriaConcepto",
        back_populates="tipo",
        cascade="all, delete-orphan",
        order_by="TesoreriaConcepto.orden",
    )

    def __repr__(self):
        return f"<TipoConcepto {self.id} muni={self.municipio_id} {self.nombre}>"


class TesoreriaConcepto(Base):
    """Concepto individual de gasto (ej: 'Sueldo mensual')."""
    __tablename__ = "tesoreria_conceptos"

    id = Column(Integer, primary_key=True, index=True)
    municipio_id = Column(Integer, ForeignKey("municipios.id"), nullable=False, index=True)

    tipo_concepto_id = Column(
        Integer,
        ForeignKey("tesoreria_tipos_concepto.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    tipo = relationship("TesoreriaTipoConcepto", back_populates="conceptos")

    nombre = Column(String(150), nullable=False, index=True)
    descripcion = Column(Text, nullable=True)
    orden = Column(Integer, default=0, nullable=False)

    activo = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    def __repr__(self):
        return f"<Concepto {self.id} {self.nombre} (tipo {self.tipo_concepto_id})>"
