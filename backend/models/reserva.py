"""Reservas — modulo Recursos, Etapa 3.

El municipio presta cosas: el salon comunitario, la cancha, el camion de agua,
la retroexcavadora. Hoy eso se anota en un cuaderno y se superpone.

NO hay tabla de "cosas prestables": un bien prestable es un ACTIVO de
inventario con `reservable = True`. Lo que faltaba es el otro TOMADOR: hasta
ahora un activo solo podia estar tomado por una OT (`ocupado_por_ot_id`), y
ahora tambien por una reserva. La regla de exclusividad es la misma —una cosa
no puede estar en dos lados a la vez— y por eso la reserva valida contra las
dos: contra otras reservas y contra el uso interno.

Ver docs/recursos/01-modulo-recursos.md
"""
from sqlalchemy import (
    Column, Integer, String, Date, DateTime, Text, Boolean, ForeignKey,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from core.database import Base


class Reserva(Base):
    """Un pedido de prestamo de un bien del municipio."""

    __tablename__ = "reservas"

    id = Column(Integer, primary_key=True, index=True)
    municipio_id = Column(Integer, ForeignKey("municipios.id", ondelete="CASCADE"),
                          nullable=False, index=True)
    item_id = Column(Integer, ForeignKey("inventario_items.id", ondelete="CASCADE"),
                     nullable=False, index=True)

    # Quien pide. `solicitante_id` cuando lo pide un vecino registrado desde la
    # app; los datos sueltos cuando lo carga el mostrador por telefono, que es
    # como entra la mayoria de los pedidos al principio.
    solicitante_id = Column(Integer, ForeignKey("usuarios.id", ondelete="SET NULL"),
                            nullable=True, index=True)
    solicitante_nombre = Column(String(150), nullable=False)
    solicitante_telefono = Column(String(50), nullable=True)

    # Un dia entero es lo normal (el salon para un cumpleanos, la retro para
    # una jornada). Por eso son fechas y no horarios: agregar horas cuando no
    # se usan es pedirle al operador que invente un dato.
    fecha_desde = Column(Date, nullable=False, index=True)
    fecha_hasta = Column(Date, nullable=False, index=True)

    motivo = Column(Text, nullable=True)

    # solicitada -> aprobada | rechazada ; aprobada -> cumplida | cancelada
    estado = Column(String(20), nullable=False, default="solicitada",
                    server_default="solicitada", index=True)
    # Por que se rechazo. Obligatorio en la API al rechazar: un "no" sin motivo
    # es lo que hace que el vecino vuelva a preguntar por otro canal.
    motivo_rechazo = Column(Text, nullable=True)

    resuelto_por_id = Column(Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True)
    resuelto_at = Column(DateTime(timezone=True), nullable=True)

    activo = Column(Boolean, nullable=False, default=True, server_default="1")

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    item = relationship("InventarioItem", foreign_keys=[item_id])
