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


class FrecuenciaPago(str, enum.Enum):
    SEMANAL = "semanal"
    QUINCENAL = "quincenal"
    MENSUAL = "mensual"
    BIMESTRAL = "bimestral"
    TRIMESTRAL = "trimestral"
    ANUAL = "anual"


class TesoreriaConceptoLiquidacion(Base):
    """Catalogo de conceptos para pagos programados (liquidaciones).

    Antes el campo `concepto` del pago programado era texto libre y los
    clientes terminaban cargando typos y variantes ("Auxliar provincial
    escolar" vs "Auxiliar provincial escolar", etc). Ahora el campo se
    elige desde este catalogo, gestionado per-muni en Configuracion.

    Ejemplos: Sueldo mensual, Presentismo, Incentivo, Trabajo extra,
    Profesional, Concejo deliberante, Turismo y Cultura, etc.
    """
    __tablename__ = "tesoreria_conceptos_liquidacion"

    id = Column(Integer, primary_key=True, index=True)
    municipio_id = Column(Integer, ForeignKey("municipios.id"), nullable=False, index=True)
    nombre = Column(String(100), nullable=False, index=True)
    descripcion = Column(Text, nullable=True)
    color = Column(String(20), nullable=True)
    icono = Column(String(60), nullable=True)
    orden = Column(Integer, default=0, nullable=False)
    activo = Column(Boolean, default=True, nullable=False)
    # Valores sugeridos que se precargan al elegir este concepto en un pago nuevo.
    # El usuario puede pisar cualquiera de los tres al crear/editar el pago.
    frecuencia_default = Column(
        Enum('semanal', 'quincenal', 'mensual', 'bimestral', 'trimestral', 'anual'),
        nullable=True,
    )
    dia_del_mes_default = Column(Integer, nullable=True)   # 1-28
    dia_semana_default = Column(Integer, nullable=True)    # 0=lun .. 6=dom
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    def __repr__(self):
        return f"<ConceptoLiquidacion {self.id} {self.nombre}>"


class TesoreriaPremio(Base):
    """Catalogo global de premios/plus que cada empleado cobra como
    liquidacion APARTE del sueldo (no se suman al sueldo mensual).

    Cada premio define:
      - frecuencia propia (presentismo: semanal; incentivo: mensual)
      - dia_semana (0-6, lunes-domingo) cuando frecuencia=semanal
      - dia_del_mes (1-28) cuando es mensual o derivada

    Cuando un empleado tiene cargada su liquidacion mensual de sueldo, el
    sistema auto-genera un TesoreriaPagoProgramado por cada premio activo
    del catalogo, con sus propias fechas.

    Ejemplos:
      - "Presentismo": semanal, viernes, $25.000
      - "Trabajo extra": mensual, dia 15, $150.000

    Multi-tenant via municipio_id. Soft-delete preserva historico."""
    __tablename__ = "tesoreria_premios"

    id = Column(Integer, primary_key=True, index=True)
    municipio_id = Column(Integer, ForeignKey("municipios.id"), nullable=False, index=True)
    nombre = Column(String(100), nullable=False, index=True)
    monto = Column(Numeric(15, 2), nullable=False, default=0)
    # Cuando se paga este premio (independiente del sueldo)
    frecuencia = Column(
        Enum(FrecuenciaPago, values_callable=lambda x: [e.value for e in x]),
        default=FrecuenciaPago.MENSUAL,
        nullable=False,
    )
    # Solo cuando frecuencia=semanal. 0=lunes..6=domingo.
    dia_semana = Column(Integer, nullable=True)
    # Cuando frecuencia es mensual/quincenal/etc. 1..28 para evitar problemas
    # de febrero. NULL si frecuencia=semanal.
    dia_del_mes = Column(Integer, nullable=True)
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


# Codigo reservado que marca una caja como TARJETA DE CREDITO.
#
# Decision de diseno: la tarjeta de credito ES una caja (mismo contenedor,
# mismos movimientos, mismo arqueo) — para el cliente se muestra como "Tarjeta
# de credito", nunca como caja. Usamos el campo `codigo` (ya existente) como
# discriminador para NO agregar columnas.
#
# Reinterpretacion de campos SOLO para estas cajas:
#   - `saldo_inicial` = LIMITE de la tarjeta (editable desde el ABM de cajas).
#   - `saldo_actual`  = credito DISPONIBLE (limite - gastos + pagos).
#   - deuda actual    = limite - disponible.
# Un gasto con la tarjeta es un EGRESO de esta caja (baja el disponible) y NO
# toca ninguna caja real. El pago de la tarjeta es un INGRESO aca + un EGRESO
# en la caja real de donde sale la plata (ver POST /tesoreria/cajas/pagar-tarjeta).
CODIGO_CAJA_TARJETA = "TARJETA"


def es_caja_tarjeta(caja) -> bool:
    """True si la caja representa una tarjeta de credito (codigo == TARJETA)."""
    return (getattr(caja, "codigo", "") or "").strip().upper() == CODIGO_CAJA_TARJETA


class TesoreriaCaja(Base):
    """Caja/fondo del municipio. Ej: FOFINDE, FODEMEP, Coparticipacion, Tesoro propio.

    Si `codigo == 'TARJETA'` la caja representa una TARJETA DE CREDITO — ver
    CODIGO_CAJA_TARJETA arriba para la reinterpretacion de saldo_inicial/saldo.
    """
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
    # Solo cuando frecuencia=semanal. 0=lunes..6=domingo. Permite que el
    # presentismo se pague todos los viernes, por ejemplo.
    dia_semana = Column(Integer, nullable=True)
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
