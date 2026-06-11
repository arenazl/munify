"""Tarjeta de credito del municipio (Tesoreria).

Entidad de CATALOGO, analoga a TesoreriaCaja: el ABM vive en Configuracion (alta/
edicion). NO tiene saldo ni movimientos propios. Los pagos hechos con la tarjeta
se asocian desde el modulo de Pagos (FK tarjeta_credito_id en el pago) — la tarjeta
solo se "etiqueta", no se descuenta nada.

`dia_cierre` es solo un AGRUPADOR VISUAL (para ver los pagos mes a mes, de cierre a
cierre, en una segunda etapa). No afecta montos ni ninguna logica de pago.
"""
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey
from sqlalchemy.sql import func

from core.database import Base


class TarjetaCredito(Base):
    __tablename__ = "tarjetas_credito"

    id = Column(Integer, primary_key=True, index=True)
    municipio_id = Column(Integer, ForeignKey("municipios.id"), nullable=False, index=True)

    denominacion = Column(String(100), nullable=False)          # alias que pone el usuario
    marca = Column(String(30), nullable=False, default="Visa")  # Visa | Mastercard | American Express | Otra
    ultimos_4 = Column(String(4), nullable=True)
    # Dia del mes en que cierra el resumen (1-31). SOLO agrupador visual mes a mes.
    dia_cierre = Column(Integer, nullable=True)

    # Presentacion (igual que las cajas)
    color = Column(String(20), nullable=True)
    icono = Column(String(60), nullable=True)
    orden = Column(Integer, default=0, nullable=False)
    activo = Column(Boolean, default=True, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    def __repr__(self):
        return f"<TarjetaCredito {self.id} {self.marca} ***{self.ultimos_4} M{self.municipio_id}>"
