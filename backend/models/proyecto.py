"""Proyecto financiero del modulo Tesoreria.

Un proyecto agrupa N gastos de distintos proveedores/contratistas.
Ejemplo: "Departamento para el vecindario", "Repavimentacion Av X".

Un gasto puede imputarse a 0, 1 o varios proyectos, repartiendo el
monto total entre ellos (no necesariamente toda la plata se imputa,
puede haber un remanente sin proyecto).

Relacion N:M con gastos via tabla gasto_proyectos (monto_asignado en pesos).
"""
import enum
from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime, Date, Text,
    Numeric, Enum, ForeignKey, UniqueConstraint,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from core.database import Base


class EstadoProyecto(str, enum.Enum):
    ACTIVO = "activo"
    PAUSADO = "pausado"
    FINALIZADO = "finalizado"


class Proyecto(Base):
    __tablename__ = "proyectos"

    id = Column(Integer, primary_key=True, index=True)

    # Multi-tenant
    municipio_id = Column(Integer, ForeignKey("municipios.id"), nullable=False, index=True)

    nombre = Column(String(150), nullable=False, index=True)
    descripcion = Column(Text, nullable=True)

    presupuesto = Column(Numeric(15, 2), nullable=True)

    fecha_inicio = Column(Date, nullable=True)
    fecha_fin = Column(Date, nullable=True)

    estado = Column(
        Enum(EstadoProyecto, values_callable=lambda x: [e.value for e in x]),
        default=EstadoProyecto.ACTIVO,
        nullable=False,
        index=True,
    )

    activo = Column(Boolean, default=True, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    asignaciones = relationship(
        "GastoProyecto",
        back_populates="proyecto",
        cascade="all, delete-orphan",
    )

    def __repr__(self):
        return f"<Proyecto {self.id} {self.nombre}>"


class GastoProyecto(Base):
    """Asociacion N:M entre gastos y proyectos con monto imputado.

    monto_asignado es la porcion del gasto que se imputa al proyecto.
    SUM(monto_asignado) por gasto <= gasto.monto_pesos (se valida en API).
    """
    __tablename__ = "gasto_proyectos"
    __table_args__ = (
        UniqueConstraint("gasto_id", "proyecto_id", name="uq_gasto_proyecto"),
    )

    id = Column(Integer, primary_key=True, index=True)
    gasto_id = Column(Integer, ForeignKey("gastos.id", ondelete="CASCADE"), nullable=False, index=True)
    proyecto_id = Column(Integer, ForeignKey("proyectos.id", ondelete="CASCADE"), nullable=False, index=True)

    monto_asignado = Column(Numeric(15, 2), nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    gasto = relationship("Gasto", back_populates="proyectos_asignados")
    proyecto = relationship("Proyecto", back_populates="asignaciones")

    def __repr__(self):
        return f"<GastoProyecto g{self.gasto_id} p{self.proyecto_id} ${self.monto_asignado}>"
