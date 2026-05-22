"""Catalogo de retenciones impositivas aplicables a una Orden de Pago.

Una retencion es un descuento que el muni le aplica al proveedor al momento
de pagarle, en concepto de impuestos que debe percibir y depositar:
  - Tasa Muni (Comercio e Industria local)
  - Ganancias (AFIP nacional)
  - IIBB (Ingresos Brutos provincial)
  - SUSS (Seguridad social)

Cada muni configura su propio catalogo (porcentajes pueden variar segun
convenios locales y minimos no imponibles).

Multi-tenant via municipio_id. Soft-delete via `activo`.
"""
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Numeric, ForeignKey
from sqlalchemy.sql import func
from core.database import Base


class ContaduriaRetencion(Base):
    __tablename__ = "contaduria_retenciones"

    id = Column(Integer, primary_key=True, index=True)
    municipio_id = Column(Integer, ForeignKey("municipios.id"), nullable=False, index=True)

    nombre = Column(String(100), nullable=False)
    descripcion = Column(String(200), nullable=True)
    # Porcentaje a aplicar sobre el monto bruto (ej. 3.000 = 3%). Hasta 99.999.
    porcentaje = Column(Numeric(6, 3), nullable=False, default=0)
    color = Column(String(20), nullable=True)
    activo = Column(Boolean, default=True, nullable=False)
    orden = Column(Integer, default=0, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    def __repr__(self):
        return f"<Retencion {self.nombre} {self.porcentaje}%>"
