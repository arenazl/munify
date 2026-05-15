import enum
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Date, Text, Float, Numeric, Enum, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from core.database import Base


class DestinoGasto(str, enum.Enum):
    DEPENDENCIA = "dependencia"
    CONTACTO = "contacto"


class TipoFinanciacion(str, enum.Enum):
    CONTADO = "contado"
    CUOTAS = "cuotas"
    PRESTAMO = "prestamo"
    RECURRENTE = "recurrente"   # sueldo mensual, honorario fijo, etc.


class FrecuenciaRecurrencia(str, enum.Enum):
    SEMANAL = "semanal"
    QUINCENAL = "quincenal"
    MENSUAL = "mensual"
    BIMESTRAL = "bimestral"
    TRIMESTRAL = "trimestral"
    ANUAL = "anual"


class FormaPago(str, enum.Enum):
    EFECTIVO = "efectivo"
    TRANSFERENCIA = "transferencia"
    CHEQUE = "cheque"
    TARJETA = "tarjeta"
    MERCADOPAGO = "mercadopago"
    OTRO = "otro"


class EstadoGastoCuota(str, enum.Enum):
    PENDIENTE = "pendiente"
    PAGADA = "pagada"
    VENCIDA = "vencida"
    CANCELADA = "cancelada"


class EstadoPagoGasto(str, enum.Enum):
    """Tag manual del gasto: concretado (caja descontada) o pendiente (no).

    Default 'concretado' (comportamiento historico: cargar un gasto era
    siempre algo ya pagado). 'pendiente' permite cargar un gasto futuro
    o pendiente de pago sin que descuente la caja todavia.
    """
    CONCRETADO = "concretado"
    PENDIENTE = "pendiente"


class Gasto(Base):
    """
    Registro de un gasto del municipio.

    Cada gasto tiene un DESTINO: o bien una dependencia (Secretaria X)
    o bien un contacto (persona fisica). Esto se modela con destino_tipo +
    los dos FK (solo uno se llena segun el tipo).

    Si el gasto es a CUOTAS o PRESTAMO o RECURRENTE, se generan filas
    en gastos_cuotas con las cuotas planificadas. Si es CONTADO, una sola
    cuota pagada en la fecha del gasto.
    """
    __tablename__ = "gastos"

    id = Column(Integer, primary_key=True, index=True)

    # Multi-tenant
    municipio_id = Column(Integer, ForeignKey("municipios.id"), nullable=False, index=True)
    municipio = relationship("Municipio")

    # Quien lo carga (admin del muni)
    creador_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    creador = relationship("User", foreign_keys=[creador_id])

    # ============ DESTINO ============
    destino_tipo = Column(
        Enum(DestinoGasto, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
        index=True,
    )
    destino_dependencia_id = Column(
        Integer,
        ForeignKey("municipio_dependencias.id"),
        nullable=True,
        index=True,
    )
    destino_contacto_id = Column(
        Integer,
        ForeignKey("contactos.id"),
        nullable=True,
        index=True,
    )
    destino_dependencia = relationship("MunicipioDependencia", foreign_keys=[destino_dependencia_id])
    contacto = relationship("Contacto", back_populates="gastos", foreign_keys=[destino_contacto_id])

    # ============ DESCRIPCION ============
    # Concepto del gasto (autocomplete con catalogo + libre).
    # Ejemplos: "Sueldo mensual", "Aguinaldo", "Prestamo agrario", "Materiales".
    concepto = Column(String(150), nullable=False, index=True)

    descripcion = Column(Text, nullable=True)

    # Notas internas del intendente / supervisor sobre el gasto.
    # Se edita desde el side modal de Tesoreria. No se muestra al beneficiario.
    observaciones = Column(Text, nullable=True)

    # ============ MONTO + COTIZACION ============
    # Monto en pesos al momento del gasto (siempre).
    monto_pesos = Column(Numeric(15, 2), nullable=False)

    # Cotizacion USD al momento del gasto (USD/ARS). Snapshoteado para
    # poder calcular el equivalente en USD historicamente sin depender
    # de fluctuaciones futuras del dolar.
    cotizacion_usd = Column(Numeric(10, 4), nullable=True)

    # Monto en USD = monto_pesos / cotizacion_usd (calculado al cargar)
    monto_usd = Column(Numeric(15, 2), nullable=True)

    # ============ FECHA ============
    fecha = Column(Date, nullable=False, index=True)

    # ============ FINANCIACION ============
    tipo_financiacion = Column(
        Enum(TipoFinanciacion, values_callable=lambda x: [e.value for e in x]),
        default=TipoFinanciacion.CONTADO,
        nullable=False,
    )
    forma_pago = Column(
        Enum(FormaPago, values_callable=lambda x: [e.value for e in x]),
        default=FormaPago.TRANSFERENCIA,
        nullable=False,
    )

    # Estado de pago: concretado (caja ya descontada) o pendiente (futuro/por pagar).
    # Default 'concretado' al crear (comportamiento historico). Cuando pasa de
    # pendiente -> concretado, recien ahi se descuenta la caja (logica en API).
    estado_pago = Column(
        Enum(EstadoPagoGasto, values_callable=lambda x: [e.value for e in x]),
        default=EstadoPagoGasto.CONCRETADO,
        nullable=False,
        server_default='concretado',
    )

    # Para CUOTAS / PRESTAMO: cantidad total de cuotas
    cuotas_total = Column(Integer, nullable=True)

    # Para RECURRENTE: frecuencia + fecha fin (opcional, null = sin fin)
    frecuencia = Column(
        Enum(FrecuenciaRecurrencia, values_callable=lambda x: [e.value for e in x]),
        nullable=True,
    )
    fecha_fin_recurrencia = Column(Date, nullable=True)

    # ============ AUDITORIA ============
    activo = Column(Boolean, default=True, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Cuotas asociadas
    cuotas = relationship(
        "GastoCuota",
        back_populates="gasto",
        cascade="all, delete-orphan",
        order_by="GastoCuota.numero",
    )

    # Proyectos a los que se imputa este gasto (N:M con monto_asignado).
    # Un gasto puede imputarse a 0+, y la suma de monto_asignado <= monto_pesos.
    proyectos_asignados = relationship(
        "GastoProyecto",
        back_populates="gasto",
        cascade="all, delete-orphan",
    )

    def __repr__(self):
        return f"<Gasto {self.id} ${self.monto_pesos} {self.concepto}>"


class GastoCuota(Base):
    """
    Cuota individual de un gasto. Se generan automaticamente al crear
    el gasto segun su tipo_financiacion:
      - CONTADO: 1 cuota pagada el dia del gasto
      - CUOTAS: N cuotas mensuales segun cuotas_total
      - PRESTAMO: igual a CUOTAS pero con concepto distinto
      - RECURRENTE: cuotas segun frecuencia, hasta fecha_fin_recurrencia
        o N meses por default (12) si fecha_fin es null

    Permite trackear pagos parciales, vencimientos, calcular proyecciones
    de cobros futuros, etc.
    """
    __tablename__ = "gastos_cuotas"

    id = Column(Integer, primary_key=True, index=True)
    gasto_id = Column(Integer, ForeignKey("gastos.id", ondelete="CASCADE"), nullable=False, index=True)
    gasto = relationship("Gasto", back_populates="cuotas")

    numero = Column(Integer, nullable=False)  # 1, 2, 3, ... cuotas_total
    monto = Column(Numeric(15, 2), nullable=False)

    fecha_vencimiento = Column(Date, nullable=False, index=True)
    fecha_pago = Column(Date, nullable=True)

    estado = Column(
        Enum(EstadoGastoCuota, values_callable=lambda x: [e.value for e in x]),
        default=EstadoGastoCuota.PENDIENTE,
        nullable=False,
        index=True,
    )

    forma_pago = Column(
        Enum(FormaPago, values_callable=lambda x: [e.value for e in x]),
        nullable=True,
    )
    comprobante = Column(String(255), nullable=True)  # numero de transferencia, cheque, etc.
    notas = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    def __repr__(self):
        return f"<GastoCuota g{self.gasto_id} #{self.numero} ${self.monto} {self.estado.value}>"
