"""Modelo de Tasas — tercer pilar del stack junto a Reclamos y Trámites.

Conceptualmente:
  - TipoTasa: catálogo global (ABL, Patente, Comercio, Multa, ...).
  - Partida: el objeto del padrón del muni (una cuenta ABL, un dominio de
    automotor, un comercio habilitado...). Tiene un titular y un objeto.
  - Deuda: cada boleta emitida sobre una partida (mes/bimestre/año).
  - Pago: registro de cada pago efectuado sobre una deuda.

Munify NO calcula la tasa — eso es del sistema tributario del muni. Munify
ingesta las boletas ya calculadas (CSV/API/ETL) y se encarga del canal
ciudadano (ver, pagar, recibir comprobante) + conciliación con GIRE/Aura.
"""
from sqlalchemy import (
    Column,
    Integer,
    String,
    Boolean,
    DateTime,
    Date,
    ForeignKey,
    Enum as SQLEnum,
    Numeric,
    JSON,
    Index,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from core.database import Base
import enum


class CicloTasa(str, enum.Enum):
    MENSUAL = "mensual"
    BIMESTRAL = "bimestral"
    CUATRIMESTRAL = "cuatrimestral"
    ANUAL = "anual"
    ONE_SHOT = "one_shot"  # Multas, actos puntuales


class EstadoPartida(str, enum.Enum):
    ACTIVA = "activa"
    BAJA = "baja"
    SUSPENDIDA = "suspendida"


class EstadoDeuda(str, enum.Enum):
    PENDIENTE = "pendiente"
    PAGADA = "pagada"
    VENCIDA = "vencida"
    EN_PLAN_PAGO = "en_plan_pago"
    ANULADA = "anulada"


class MedioPago(str, enum.Enum):
    TARJETA_CREDITO = "tarjeta_credito"
    TARJETA_DEBITO = "tarjeta_debito"
    QR = "qr"
    TRANSFERENCIA = "transferencia"
    RAPIPAGO = "rapipago"
    EFECTIVO_VENTANILLA = "efectivo_ventanilla"
    DEBITO_AUTOMATICO = "debito_automatico"


class EstadoPago(str, enum.Enum):
    PROCESANDO = "procesando"
    CONFIRMADO = "confirmado"
    RECHAZADO = "rechazado"
    REEMBOLSADO = "reembolsado"


class TipoTasa(Base):
    """Catálogo global de tipos de tasas. Un muni habilita los que le sirven."""

    __tablename__ = "tipos_tasa"

    id = Column(Integer, primary_key=True, index=True)
    codigo = Column(String(40), unique=True, nullable=False, index=True)  # "abl"
    nombre = Column(String(100), nullable=False)  # "Alumbrado, Barrido y Limpieza"
    descripcion = Column(String(300), nullable=True)
    icono = Column(String(40), default="Receipt")  # Lucide icon name
    color = Column(String(16), default="#6366f1")
    ciclo = Column(
        SQLEnum(CicloTasa, values_callable=lambda x: [e.value for e in x]),
        default=CicloTasa.MENSUAL,
        nullable=False,
    )
    activo = Column(Boolean, default=True, nullable=False)
    orden = Column(Integer, default=0)

    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Partida(Base):
    """El objeto del padrón del muni: una cuenta ABL, dominio auto, comercio, etc."""

    __tablename__ = "tasas_partidas"

    id = Column(Integer, primary_key=True, index=True)
    municipio_id = Column(Integer, ForeignKey("municipios.id"), nullable=False, index=True)
    tipo_tasa_id = Column(Integer, ForeignKey("tipos_tasa.id"), nullable=False, index=True)

    # Identificador interno del muni (ej: nro de cuenta ABL "12345/6",
    # dominio automotor "ABC-123", nro de habilitación comercial). Este
    # es el campo que el vecino puede tipear en "Asociar a mi cuenta".
    identificador = Column(String(80), nullable=False, index=True)

    # Titular — puede estar vinculado a un User de Munify o ser solo snapshot
    # (para partidas del padrón que el titular todavía no se registró).
    titular_user_id = Column(Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True, index=True)
    titular_dni = Column(String(20), nullable=True, index=True)
    titular_nombre = Column(String(200), nullable=True)

    # Objeto sobre el que aplica la tasa. JSON flexible para cubrir todos
    # los tipos (inmueble, auto, comercio, etc). Ej ABL:
    #   { "direccion": "Av. Sarmiento 1234", "superficie_m2": 120, "zona": "B" }
    # Ej Patente: { "dominio": "ABC123", "marca": "Fiat", "modelo": "Cronos" }
    # Ej Comercio: { "razon_social": "Bar Pirí", "cuit": "20-xxxxx-7", "rubro": "gastronomía" }
    objeto = Column(JSON, nullable=True)

    estado = Column(
        SQLEnum(EstadoPartida, values_callable=lambda x: [e.value for e in x]),
        default=EstadoPartida.ACTIVA,
        nullable=False,
    )

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relaciones
    municipio = relationship("Municipio")
    tipo_tasa = relationship("TipoTasa")
    titular = relationship("User", foreign_keys=[titular_user_id])
    deudas = relationship("Deuda", back_populates="partida", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_partidas_muni_tipo", "municipio_id", "tipo_tasa_id"),
        Index("ix_partidas_muni_dni", "municipio_id", "titular_dni"),
    )


class Deuda(Base):
    """Cada boleta emitida sobre una partida (ABL abril 2026, patente Q1 2026...)."""

    __tablename__ = "tasas_deudas"

    id = Column(Integer, primary_key=True, index=True)
    partida_id = Column(Integer, ForeignKey("tasas_partidas.id", ondelete="CASCADE"), nullable=False, index=True)

    # Periodo facturado (formato flexible para cubrir mensual/bimestral/anual):
    #   "2026-04" (mensual), "2026-Q1" (cuatrimestral), "2026" (anual).
    periodo = Column(String(20), nullable=False)

    importe = Column(Numeric(12, 2), nullable=False)  # Total a pagar AHORA
    importe_original = Column(Numeric(12, 2), nullable=True)  # Sin recargos/descuentos
    recargo = Column(Numeric(12, 2), default=0)
    descuento = Column(Numeric(12, 2), default=0)

    fecha_emision = Column(Date, nullable=False)
    fecha_vencimiento = Column(Date, nullable=False, index=True)

    estado = Column(
        SQLEnum(EstadoDeuda, values_callable=lambda x: [e.value for e in x]),
        default=EstadoDeuda.PENDIENTE,
        nullable=False,
        index=True,
    )

    fecha_pago = Column(DateTime(timezone=True), nullable=True)
    # Referencia a la transaccion del proveedor de pago (Aura/Rapipago/MP).
    pago_externo_id = Column(String(100), nullable=True, index=True)

    # Código de barras / QR imprimible (si el muni lo genera).
    codigo_barras = Column(String(80), nullable=True)

    observaciones = Column(String(300), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relaciones
    partida = relationship("Partida", back_populates="deudas")
    pagos = relationship("Pago", back_populates="deuda", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_deudas_partida_periodo", "partida_id", "periodo", unique=True),
        Index("ix_deudas_estado_vto", "estado", "fecha_vencimiento"),
    )


class Pago(Base):
    """Registro de cada pago efectuado (puede haber varios si hay pago parcial)."""

    __tablename__ = "tasas_pagos"

    id = Column(Integer, primary_key=True, index=True)
    deuda_id = Column(Integer, ForeignKey("tasas_deudas.id", ondelete="CASCADE"), nullable=False, index=True)

    # Usuario que ejecutó el pago — puede no ser el titular (ej. un hijo
    # paga la ABL de su mamá).
    usuario_id = Column(Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True, index=True)

    monto = Column(Numeric(12, 2), nullable=False)
    medio = Column(
        SQLEnum(MedioPago, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
    )
    fecha = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    comprobante_url = Column(String(500), nullable=True)  # URL del PDF/imagen
    # ID de la transacción del proveedor de pago (Aura, MP, Rapipago).
    pago_externo_id = Column(String(100), nullable=True, index=True)

    estado = Column(
        SQLEnum(EstadoPago, values_callable=lambda x: [e.value for e in x]),
        default=EstadoPago.PROCESANDO,
        nullable=False,
    )

    # Payload crudo del webhook del proveedor (Aura/MP) — auditoría.
    payload_externo = Column(JSON, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relaciones
    deuda = relationship("Deuda", back_populates="pagos")
    usuario = relationship("User", foreign_keys=[usuario_id])
