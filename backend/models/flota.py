"""Flota municipal — modulo Recursos, Etapa 1.

NO hay tabla de vehiculos. Un vehiculo del municipio ES un item de inventario
de naturaleza ACTIVO: ya se toma y se libera por OT, ya tiene estado y ya
lleva su identificador (el dominio). Duplicarlo en una tabla propia romperia
lo que el modulo de Campo resolvio en julio.

Lo que falta —y vive aca— es la CARGA DE COMBUSTIBLE, que no es un bien sino
un hecho: cuanta nafta se le puso, cuando, a que kilometraje y cuanto salio.
De ese hecho sale el unico numero que el corralon no tiene hoy y que el
intendente compra: cuanto consume cada vehiculo cada 100 km.

Ver docs/recursos/01-modulo-recursos.md
"""
from sqlalchemy import (
    Column, Integer, String, Date, DateTime, Numeric, Float, Text, ForeignKey,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from core.database import Base


class FlotaCarga(Base):
    """Una carga de combustible de un vehiculo del municipio."""

    __tablename__ = "flota_cargas"

    id = Column(Integer, primary_key=True, index=True)
    municipio_id = Column(Integer, ForeignKey("municipios.id", ondelete="CASCADE"),
                          nullable=False, index=True)

    # El vehiculo: un activo de `inventario_items`. RESTRICT y no CASCADE: el
    # historico de consumo no se borra por dar de baja la camioneta — es la
    # evidencia de lo que se gasto.
    item_id = Column(Integer, ForeignKey("inventario_items.id", ondelete="RESTRICT"),
                     nullable=False, index=True)

    fecha = Column(Date, nullable=False, index=True)
    litros = Column(Float, nullable=False)
    importe = Column(Numeric(15, 2), nullable=True)

    # Kilometraje AL MOMENTO de cargar. Es lo que hace posible el calculo:
    # sin esto solo se sabe cuanta plata se fue, no si el vehiculo rinde.
    km = Column(Integer, nullable=True)

    # Quien cargo (empleado del muni). Nullable: al principio se carga sin
    # detalle y lo que importa es el litro.
    empleado_id = Column(Integer, ForeignKey("empleados.id", ondelete="SET NULL"),
                         nullable=True, index=True)

    # El gasto que esta carga genero en Tesoreria. Trazabilidad en los dos
    # sentidos: desde la carga se llega al gasto y viceversa.
    gasto_id = Column(Integer, ForeignKey("gastos.id", ondelete="SET NULL"),
                      nullable=True, index=True)

    observaciones = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    item = relationship("InventarioItem", foreign_keys=[item_id])
