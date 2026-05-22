"""Modelo de Orden de Pago (OP).

Una OP es la AUTORIZACION formal para realizar un pago. Se crea cuando
el muni necesita pagarle a alguien (proveedor, contratista, etc.) y debe
pasar por un circuito hasta que se ejecuta:

  pendiente -> autorizada -> pagada
                          \\-> anulada

Al pagarla, se crea automaticamente un Gasto en Tesoreria (con su cuota
unica pagada y movimiento de caja). El gasto_id queda referenciado para
trazabilidad.

Numero correlativo: OP-{anio}-{seq4digits} por municipio. Empieza en
0001 cada año. Garantizado unico por municipio_id.
"""
import enum
from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime, Date, Text, Numeric, Enum, ForeignKey,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from core.database import Base


class EstadoOrdenPago(str, enum.Enum):
    PENDIENTE = "pendiente"
    AUTORIZADA = "autorizada"
    PAGADA = "pagada"
    ANULADA = "anulada"


class EtapaContable(str, enum.Enum):
    """Etapas del gasto publico segun la Ley de Administracion Financiera.

    - PREVENTIVO: reserva del saldo presupuestario (la OP existe pero todavia
      no hay compromiso firme).
    - COMPROMISO: orden de compra/contrato firmado. Compromete el credito.
    - DEVENGADO: bien recibido o servicio prestado (obligacion real de pago).
    - PAGADO: salida efectiva del dinero.

    Es independiente de `estado` (workflow operativo) porque una OP puede
    estar 'autorizada' (operativamente) pero en etapa 'comprometida' o
    'devengada' segun el momento contable.
    """
    PREVENTIVO = "preventivo"
    COMPROMISO = "compromiso"
    DEVENGADO = "devengado"
    PAGADO = "pagado"


class OrdenPago(Base):
    __tablename__ = "ordenes_pago"
    __table_args__ = (
        UniqueConstraint("municipio_id", "numero", name="uq_op_muni_numero"),
    )

    id = Column(Integer, primary_key=True, index=True)
    municipio_id = Column(Integer, ForeignKey("municipios.id"), nullable=False, index=True)

    # Numero correlativo formato "OP-2026-0001" por municipio
    numero = Column(String(20), nullable=False, index=True)

    # ============ DESTINO (mismo patron que Gasto) ============
    destino_tipo = Column(String(20), nullable=False, index=True)  # 'contacto' | 'dependencia'
    destino_contacto_id = Column(Integer, ForeignKey("contactos.id"), nullable=True, index=True)
    destino_dependencia_id = Column(Integer, ForeignKey("municipio_dependencias.id"), nullable=True, index=True)

    contacto = relationship("Contacto", foreign_keys=[destino_contacto_id])
    dependencia = relationship("MunicipioDependencia", foreign_keys=[destino_dependencia_id])

    # ============ DATOS DE LA OP ============
    concepto = Column(String(150), nullable=False)
    descripcion = Column(Text, nullable=True)
    monto_pesos = Column(Numeric(15, 2), nullable=False)

    # Factura del proveedor que respalda esta OP. Para muni chico (SPN)
    # cada OP suele tener 1 factura. Si en el futuro un muni grande
    # necesita 1 OP <-> N facturas, se separa a entidad propia. Por ahora
    # campos sueltos: nro + URL al PDF (Cloudinary u otro storage).
    nro_factura = Column(String(50), nullable=True, index=True)
    factura_url = Column(String(500), nullable=True)

    # Imputacion contable (partida presupuestaria). Ej: "1.1.01.03" / "SEGURO (ART)".
    # Lo exige el Tribunal de Cuentas en el documento impreso.
    codigo_imputacion = Column(String(50), nullable=True)
    imputacion_descripcion = Column(String(150), nullable=True)

    # Forma de pago concreta (lo que va al pie de la OP impresa).
    # tipo_pago = "transferencia" | "cheque" | "efectivo" | "vep"
    tipo_pago = Column(String(30), nullable=True)
    nro_comprobante_pago = Column(String(50), nullable=True)   # nro de transferencia/cheque
    cuenta_destino = Column(String(100), nullable=True)        # cuenta bancaria / sucursal

    # Firmantes internos para imprimir en la OP. Strings sueltos (no FK a User)
    # porque son cargos del muni que pueden no tener login en el sistema.
    # Default: se llenan automaticamente desde Municipio.{contador,secretario,intendente}_nombre.
    contaduria_nombre = Column(String(150), nullable=True)
    secretario_nombre = Column(String(150), nullable=True)
    intendente_nombre = Column(String(150), nullable=True)

    # Caja desde donde se va a pagar (puede definirse en la creacion o al pagar)
    caja_id = Column(Integer, ForeignKey("tesoreria_cajas.id", ondelete="SET NULL"), nullable=True, index=True)
    caja = relationship("TesoreriaCaja", foreign_keys=[caja_id])

    # ============ FLUJO ============
    estado = Column(
        Enum(EstadoOrdenPago, values_callable=lambda x: [e.value for e in x]),
        default=EstadoOrdenPago.PENDIENTE,
        nullable=False,
        index=True,
    )

    # Etapa contable (dimension independiente del estado operativo). Default
    # PREVENTIVO al crear la OP; al autorizar pasa a COMPROMISO; al pagar a
    # PAGADO. DEVENGADO se setea manualmente cuando la contaduria registra
    # la recepcion del bien/servicio. Ver EtapaContable para mas detalle.
    etapa_contable = Column(
        Enum(EtapaContable, values_callable=lambda x: [e.value for e in x]),
        default=EtapaContable.PREVENTIVO,
        nullable=False,
        index=True,
    )
    fecha_devengado = Column(DateTime(timezone=True), nullable=True)

    fecha_emision = Column(Date, nullable=False, index=True)        # cuando se crea la OP
    fecha_vencimiento = Column(Date, nullable=True)                  # cuando debe estar pagada
    fecha_autorizacion = Column(DateTime(timezone=True), nullable=True)
    fecha_pago = Column(DateTime(timezone=True), nullable=True)
    fecha_anulacion = Column(DateTime(timezone=True), nullable=True)

    # ============ AUDIT ============
    creador_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    autorizado_por_id = Column(Integer, ForeignKey("usuarios.id"), nullable=True)
    anulado_por_id = Column(Integer, ForeignKey("usuarios.id"), nullable=True)

    creador = relationship("User", foreign_keys=[creador_id])
    autorizado_por = relationship("User", foreign_keys=[autorizado_por_id])
    anulado_por = relationship("User", foreign_keys=[anulado_por_id])

    # Cuando se ejecuta el pago, se crea un Gasto en Tesoreria
    gasto_id = Column(Integer, ForeignKey("gastos.id", ondelete="SET NULL"), nullable=True, index=True)
    gasto = relationship("Gasto", foreign_keys=[gasto_id])

    motivo_anulacion = Column(Text, nullable=True)
    notas = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    def __repr__(self):
        return f"<OrdenPago {self.numero} ${self.monto_pesos} {self.estado.value if hasattr(self.estado, 'value') else self.estado}>"
