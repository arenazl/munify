"""Modelo de proveedor de pago habilitado por municipio.

Permite que cada municipio habilite uno o varios proveedores de pago
(GIRE, MercadoPago, MODO, etc.), y dentro de cada proveedor active
los productos que usa (Boton de Pago, Rapipago/Cupon, Adhesion Debito).

El flujo de activacion incluye un paso de "importar metadata" que
simula traer el padron de cuentas/contribuyentes del proveedor.
"""
from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime, ForeignKey, JSON,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from core.database import Base


# Identificadores canonicos de los proveedores soportados.
# Son strings para evitar migracion de enum si agregamos uno nuevo.
PROVEEDOR_GIRE = "gire"
PROVEEDOR_MERCADOPAGO = "mercadopago"
PROVEEDOR_MODO = "modo"

PROVEEDORES_VALIDOS = {PROVEEDOR_GIRE, PROVEEDOR_MERCADOPAGO, PROVEEDOR_MODO}

# Productos posibles por proveedor (los keys de `productos_activos`).
# Cada proveedor habilita un subconjunto — GIRE tiene los 3, MP solo
# boton_pago + qr, MODO solo qr.
PRODUCTO_BOTON_PAGO = "boton_pago"          # checkout web con tarjeta
PRODUCTO_RAPIPAGO = "rapipago"              # cupon efectivo en sucursal
PRODUCTO_ADHESION_DEBITO = "adhesion_debito"  # debito automatico recurrente via CBU
PRODUCTO_QR = "qr"                          # QR interoperable


class MunicipioProveedorPago(Base):
    """Estado de habilitacion de un proveedor de pagos en un municipio."""

    __tablename__ = "municipio_proveedores_pago"

    id = Column(Integer, primary_key=True, index=True)

    municipio_id = Column(
        Integer, ForeignKey("municipios.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    municipio = relationship("Municipio")

    # Identificador del proveedor ("gire", "mercadopago", "modo")
    proveedor = Column(String(50), nullable=False, index=True)

    # Si el proveedor esta activo para este municipio
    activo = Column(Boolean, default=False, nullable=False)

    # Productos habilitados dentro del proveedor, ej:
    # { "boton_pago": true, "rapipago": true, "adhesion_debito": false }
    productos_activos = Column(JSON, nullable=True)

    # Metadata simulada importada desde el proveedor, ej:
    # { "padron_cuentas": 2456, "categorias": 89, "importado_at": "2026-04-17T..." }
    # Null = todavia no se importo nada.
    metadata_importada = Column(JSON, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint("municipio_id", "proveedor", name="uq_muni_proveedor"),
    )
