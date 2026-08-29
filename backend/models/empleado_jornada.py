"""Presentismo — modulo Recursos, Etapa 2.

El muni ya sabia dos cosas del empleado y le faltaba la tercera:

  - `empleado_horarios`  → lo que DEBIA trabajar (lunes a viernes, 7 a 15)
  - `empleado_ausencias` → lo que estaba JUSTIFICADO que no trabajara
  - `empleado_jornadas`  → lo que REALMENTE trabajo   <-- esto faltaba

Con las tres, el presentismo deja de marcarse a dedo en la liquidacion de
Sueldos y pasa a ser un numero: "22 de 22 jornadas".

La ubicacion se guarda porque la cuadrilla ficha desde la calle, no desde una
oficina: sin coordenada, fichar desde el celular no prueba nada. Es un dato
de respaldo, no un rastreo — se toma en el momento del fichaje y nada mas.

Ver docs/recursos/01-modulo-recursos.md
"""
from sqlalchemy import (
    Column, Integer, String, Date, DateTime, Float, Text, ForeignKey, UniqueConstraint,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from core.database import Base


class EmpleadoJornada(Base):
    """Un dia de trabajo fichado por un empleado."""

    __tablename__ = "empleado_jornadas"

    # Una jornada por empleado y dia: fichar dos veces la entrada no abre un
    # dia nuevo, actualiza el mismo. Lo garantiza la base, no el codigo.
    __table_args__ = (
        UniqueConstraint("empleado_id", "fecha", name="uq_jornada_empleado_dia"),
    )

    id = Column(Integer, primary_key=True, index=True)
    municipio_id = Column(Integer, ForeignKey("municipios.id", ondelete="CASCADE"),
                          nullable=False, index=True)
    empleado_id = Column(Integer, ForeignKey("empleados.id", ondelete="CASCADE"),
                         nullable=False, index=True)

    fecha = Column(Date, nullable=False, index=True)

    entrada_at = Column(DateTime(timezone=True), nullable=True)
    entrada_lat = Column(Float, nullable=True)
    entrada_lng = Column(Float, nullable=True)

    # Nullable a proposito: una jornada sin salida es una jornada ABIERTA (el
    # empleado no cerro), y eso es informacion — no un error que haya que
    # completar con una hora inventada.
    salida_at = Column(DateTime(timezone=True), nullable=True)
    salida_lat = Column(Float, nullable=True)
    salida_lng = Column(Float, nullable=True)

    # app | manual: el supervisor puede cargar una jornada a mano cuando al
    # empleado se le quedo el celular sin bateria. Queda dicho cual es cual.
    origen = Column(String(10), nullable=False, default="app", server_default="app")

    observaciones = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    empleado = relationship("Empleado", foreign_keys=[empleado_id])
