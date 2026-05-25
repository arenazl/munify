"""Modelos extra del modulo Tesoreria (incremental, no rompe lo existente):

1. TesoreriaTipoEmpleado  — sub-clasificacion de empleados (albañil, MMO, etc).
2. TesoreriaCaja          — fondos/cajas (FOFINDE, FODEMEP, Coparticipacion).
3. TesoreriaMovimientoCaja — ingresos/egresos contra una caja.
4. TesoreriaPagoProgramado — agenda de pagos recurrentes.

NOTA: los FKs nuevos sobre tablas existentes (contactos.tipo_empleado_id,
gastos.caja_id) se agregan en la migracion via ALTER TABLE, no aca,
para no tocar los modelos viejos.
"""
import enum
from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime, Date, Text, Numeric, Enum, ForeignKey, JSON,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from core.database import Base


class TesoreriaTipoEmpleado(Base):
    """Sub-clasificacion de un Contacto cuando tipo=empleado.
    Ej: Personal de planta, Jornalizado, Albañil, Maestro mayor de obras."""
    __tablename__ = "tesoreria_tipos_empleado"

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

    def __repr__(self):
        return f"<TipoEmpleado {self.id} {self.nombre}>"


class TesoreriaPremio(Base):
    """Catalogo global de premios/plus variables que se pueden sumar a un
    pago programado al momento de ejecutarlo. El monto del pago programado
    es el monto BASE; cuando se ejecuta el pago, el operador puede marcar
    cuales de estos premios se cumplieron este mes y el sistema los suma.

    Ejemplos:
      - "Presentismo" + $50.000
      - "Trabajo extra fin de semana" + $30.000
      - "Bonus por puntualidad" + $15.000

    Multi-tenant via municipio_id. Cuando un premio se elimina, los
    pagos historicos que lo aplicaron NO se ven afectados (la suma ya
    quedo en el monto_pesos del Gasto). Por eso el "delete" es soft."""
    __tablename__ = "tesoreria_premios"

    id = Column(Integer, primary_key=True, index=True)
    municipio_id = Column(Integer, ForeignKey("municipios.id"), nullable=False, index=True)
    nombre = Column(String(100), nullable=False, index=True)
    monto = Column(Numeric(15, 2), nullable=False, default=0)
    descripcion = Column(Text, nullable=True)
    color = Column(String(20), nullable=True)
    icono = Column(String(60), nullable=True)
    orden = Column(Integer, default=0, nullable=False)
    activo = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    def __repr__(self):
        return f"<Premio {self.id} {self.nombre} ${self.monto}>"


class TipoMovimientoCaja(str, enum.Enum):
    INGRESO = "ingreso"
    EGRESO = "egreso"


class TesoreriaCaja(Base):
    """Caja/fondo del municipio. Ej: FOFINDE, FODEMEP, Coparticipacion, Tesoro propio."""
    __tablename__ = "tesoreria_cajas"

    id = Column(Integer, primary_key=True, index=True)
    municipio_id = Column(Integer, ForeignKey("municipios.id"), nullable=False, index=True)
    nombre = Column(String(80), nullable=False, index=True)
    codigo = Column(String(30), nullable=True)
    descripcion = Column(Text, nullable=True)
    color = Column(String(20), nullable=True)
    icono = Column(String(60), nullable=True)
    saldo_inicial = Column(Numeric(15, 2), default=0, nullable=False)
    fecha_apertura = Column(Date, nullable=True)
    activo = Column(Boolean, default=True, nullable=False)
    orden = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    movimientos = relationship(
        "TesoreriaMovimientoCaja",
        back_populates="caja",
        cascade="all, delete-orphan",
    )

    def __repr__(self):
        return f"<Caja {self.id} {self.nombre}>"


class TesoreriaMovimientoCaja(Base):
    """Movimiento contra una caja: ingreso o egreso.

    Egresos pueden estar vinculados a un Gasto via gasto_id.
    Ingresos no tienen gasto (son coparticipacion, transferencia recibida, etc).
    """
    __tablename__ = "tesoreria_movimientos_caja"

    id = Column(Integer, primary_key=True, index=True)
    municipio_id = Column(Integer, ForeignKey("municipios.id"), nullable=False, index=True)
    caja_id = Column(Integer, ForeignKey("tesoreria_cajas.id", ondelete="CASCADE"), nullable=False, index=True)
    gasto_id = Column(Integer, ForeignKey("gastos.id", ondelete="SET NULL"), nullable=True, index=True)

    tipo = Column(
        Enum(TipoMovimientoCaja, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
        index=True,
    )
    monto = Column(Numeric(15, 2), nullable=False)
    fecha = Column(Date, nullable=False, index=True)
    concepto = Column(String(150), nullable=False)
    descripcion = Column(Text, nullable=True)

    # Conciliacion bancaria: cuando se importa el extracto del banco y
    # se hace match con este movimiento, se setea conciliado=True y se
    # guarda la referencia del extracto (linea, nro de transaccion del banco).
    conciliado = Column(Boolean, default=False, nullable=False, index=True)
    ref_extracto = Column(String(120), nullable=True)
    fecha_conciliacion = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    caja = relationship("TesoreriaCaja", back_populates="movimientos")

    def __repr__(self):
        return f"<MovimientoCaja {self.id} caja={self.caja_id} {self.tipo.value} ${self.monto}>"


class FrecuenciaPago(str, enum.Enum):
    SEMANAL = "semanal"
    QUINCENAL = "quincenal"
    MENSUAL = "mensual"
    BIMESTRAL = "bimestral"
    TRIMESTRAL = "trimestral"
    ANUAL = "anual"


class TesoreriaPagoProgramado(Base):
    """Agenda de pago recurrente a un contacto.

    Cuando se "ejecuta" un pago, se crea un Gasto real (con caja_id si
    aplica) y se descuenta el saldo de la caja. Tambien se actualiza
    proximo_pago al siguiente periodo segun frecuencia.
    """
    __tablename__ = "tesoreria_pagos_programados"

    id = Column(Integer, primary_key=True, index=True)
    municipio_id = Column(Integer, ForeignKey("municipios.id"), nullable=False, index=True)
    contacto_id = Column(Integer, ForeignKey("contactos.id"), nullable=False, index=True)
    caja_id = Column(Integer, ForeignKey("tesoreria_cajas.id", ondelete="SET NULL"), nullable=True)

    concepto = Column(String(150), nullable=False)
    descripcion = Column(Text, nullable=True)
    monto_pesos = Column(Numeric(15, 2), nullable=False)
    forma_pago = Column(String(30), default="transferencia", nullable=False)

    frecuencia = Column(
        Enum(FrecuenciaPago, values_callable=lambda x: [e.value for e in x]),
        default=FrecuenciaPago.MENSUAL,
        nullable=False,
    )
    dia_del_mes = Column(Integer, default=1, nullable=False)  # 1-28 (evita problemas de feb)
    fecha_inicio = Column(Date, nullable=False)
    fecha_fin = Column(Date, nullable=True)
    proximo_pago = Column(Date, nullable=False, index=True)
    ultimo_pago = Column(Date, nullable=True)

    notas = Column(Text, nullable=True)
    activo = Column(Boolean, default=True, nullable=False)

    # Premios que se aplican por defecto a esta liquidacion. Lista de IDs de
    # TesoreriaPremio. Al pagar, vienen pre-checked en el modal — el
    # operador puede destildar uno si ese mes el empleado no lo gano (ej.
    # falto, no hizo trabajo extra, etc).
    premios_default = Column(JSON, nullable=True, default=list)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    def __repr__(self):
        return f"<PagoProgramado {self.id} contacto={self.contacto_id} ${self.monto_pesos} {self.frecuencia.value}>"
