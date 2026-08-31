"""Inventario municipal — dos naturalezas: activos y consumibles.

Módulo aditivo, opt-in por `municipio_modulos.modulo = 'inventario'`.

- `InventarioCategoria`: template configurable por municipio (Vehículos,
  Maquinaria, Herramientas, Materiales, Insumos). Cada categoría define su
  NATURALEZA (activo | consumible).
- `InventarioItem`: cada bien o material. Hereda la naturaleza de su
  categoría. Los consumibles llevan stock; los activos llevan estado
  operativo y saben qué OT los tiene tomados.
- `OrdenTrabajoRecurso`: pivot OT ↔ ítem. Una OT *reserva* activos (se
  liberan al cerrar) y *consume* materiales (descuenta stock al completar).

- `InventarioDeposito`: donde esta guardada cada cosa (central, corralon,
  vivero). Lo administra el municipio desde Configuracion.
- `InventarioMovimiento`: el libro del deposito. TODO cambio de stock deja un
  renglon — entradas, salidas, ajustes, y lo que gasta o devuelve una OT.
- `InventarioOrdenCompra` (+ lineas): la reposicion. Al recibirla escribe los
  movimientos de ENTRADA: no es una contabilidad paralela.

Cruce con OT: ver `api/ordenes_trabajo.py` (reservar/consumir/liberar).
"""
from sqlalchemy import (
    Column, Integer, String, Boolean, Date, DateTime, Text, Float, Enum,
    ForeignKey, UniqueConstraint,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from core.database import Base
from .enums import (
    NaturalezaInventario, EstadoActivo, TipoRecursoOT,
    TipoMovimientoInventario, EstadoOrdenCompra,
)


class InventarioCategoria(Base):
    """Categoría de inventario por municipio (template configurable).

    Se siembra un set genérico (Vehículos/Maquinaria/Herramientas =
    activos; Materiales/Insumos = consumibles) que el municipio amplía,
    renombra o elimina. La naturaleza de la categoría define la mecánica
    de todos sus ítems.
    """
    __tablename__ = "inventario_categorias"
    __table_args__ = (
        UniqueConstraint("municipio_id", "nombre", name="uq_inv_cat_muni_nombre"),
    )

    id = Column(Integer, primary_key=True, index=True)
    municipio_id = Column(Integer, ForeignKey("municipios.id", ondelete="CASCADE"), nullable=False, index=True)

    nombre = Column(String(100), nullable=False)
    descripcion = Column(Text, nullable=True)
    icono = Column(String(50), nullable=True)
    color = Column(String(20), nullable=True)

    naturaleza = Column(
        Enum(NaturalezaInventario, values_callable=lambda x: [e.value for e in x]),
        default=NaturalezaInventario.CONSUMIBLE, nullable=False, index=True,
    )

    activo = Column(Boolean, default=True, nullable=False)
    orden = Column(Integer, default=0)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    items = relationship("InventarioItem", back_populates="categoria")


class InventarioItem(Base):
    """Un bien (activo) o material (consumible) del inventario del municipio.

    La `naturaleza` se copia de la categoría al crear el ítem (desnormalizada
    para queries directas y para que el ítem conserve su mecánica aunque se
    recategorice).
    """
    __tablename__ = "inventario_items"

    id = Column(Integer, primary_key=True, index=True)
    municipio_id = Column(Integer, ForeignKey("municipios.id", ondelete="CASCADE"), nullable=False, index=True)
    categoria_id = Column(Integer, ForeignKey("inventario_categorias.id", ondelete="RESTRICT"), nullable=False, index=True)

    nombre = Column(String(200), nullable=False)
    descripcion = Column(Text, nullable=True)

    naturaleza = Column(
        Enum(NaturalezaInventario, values_callable=lambda x: [e.value for e in x]),
        nullable=False, index=True,
    )

    # --- Consumibles ---
    stock_actual = Column(Float, nullable=True)   # cantidad disponible
    stock_minimo = Column(Float, nullable=True)   # umbral de alerta de reposición
    unidad = Column(String(30), nullable=True)    # bolsas, m3, u, l, ...

    # --- Activos ---
    identificador = Column(String(100), nullable=True)  # dominio / nº de serie / patrimonial
    estado_activo = Column(
        Enum(EstadoActivo, values_callable=lambda x: [e.value for e in x]),
        nullable=True, index=True,
    )
    # OT que tiene tomado el activo (denormalizado para responder
    # "¿qué está libre?" y mostrar "tomado por OT-XXXX" sin joins).
    ocupado_por_ot_id = Column(
        Integer, ForeignKey("ordenes_trabajo.id", ondelete="SET NULL"), nullable=True, index=True
    )

    # --- Reservas (modulo Recursos, Etapa 3) ---
    # El bien se puede prestar al vecino (salon, cancha, camion de agua). La
    # mayoria de los activos NO: una motosierra municipal no se presta.
    reservable = Column(Boolean, nullable=False, default=False, server_default="0")

    # --- Flota (modulo Recursos, Etapa 1) ---
    # Un vehiculo del municipio es un ACTIVO comun con estos datos cargados;
    # no hay tabla de vehiculos aparte. En un martillo quedan todos en NULL.
    # El dominio va en `identificador`, que ya existia para eso.
    marca_modelo = Column(String(120), nullable=True)
    anio = Column(Integer, nullable=True)
    km_actual = Column(Integer, nullable=True)
    tipo_combustible = Column(String(20), nullable=True)   # nafta|gasoil|gnc|electrico
    vencimiento_vtv = Column(Date, nullable=True)
    vencimiento_seguro = Column(Date, nullable=True)
    km_proximo_service = Column(Integer, nullable=True)

    # Donde esta guardado. Nullable: los items que ya existian no tenian
    # deposito y no se les puede inventar uno.
    deposito_id = Column(
        Integer, ForeignKey("inventario_depositos.id", ondelete="SET NULL"), nullable=True, index=True
    )

    activo = Column(Boolean, default=True, nullable=False)  # soft delete

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    categoria = relationship("InventarioCategoria", back_populates="items")
    ocupado_por_ot = relationship("OrdenTrabajo", foreign_keys=[ocupado_por_ot_id])
    deposito = relationship("InventarioDeposito", foreign_keys=[deposito_id], back_populates="items")


class OrdenTrabajoRecurso(Base):
    """Pivot OT ↔ ítem de inventario.

    - RESERVA (activo): el activo queda `en_uso` mientras la OT esté vigente;
      se libera al completar/cancelar.
    - CONSUMO (consumible): `cantidad` planeada; se descuenta del stock al
      completar la OT. `aplicado` marca que ya se descontó (idempotencia).

    `item_nombre` es snapshot para el histórico / la planilla imprimible,
    por si el ítem se renombra o se da de baja después.
    """
    __tablename__ = "orden_trabajo_recursos"
    __table_args__ = (
        UniqueConstraint("orden_trabajo_id", "item_id", name="uq_ot_recurso"),
    )

    id = Column(Integer, primary_key=True, index=True)
    orden_trabajo_id = Column(
        Integer, ForeignKey("ordenes_trabajo.id", ondelete="CASCADE"), nullable=False, index=True
    )
    item_id = Column(
        Integer, ForeignKey("inventario_items.id", ondelete="CASCADE"), nullable=False, index=True
    )

    tipo = Column(
        Enum(TipoRecursoOT, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
    )
    cantidad = Column(Float, nullable=True)      # solo consumo
    item_nombre = Column(String(200), nullable=True)  # snapshot
    aplicado = Column(Boolean, default=False, nullable=False)  # stock ya descontado

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    item = relationship("InventarioItem", foreign_keys=[item_id])
    orden = relationship("OrdenTrabajo", foreign_keys=[orden_trabajo_id])


class InventarioDeposito(Base):
    """Dónde está guardada cada cosa: depósito central, corralón, vivero.

    Hasta ahora el inventario no sabía ubicación, y la pantalla de
    Configuración prometía "Depósitos: central, corralón y vivero" sin que
    existiera la columna (dueño, 2026-08-31). Es una tabla y no un string
    libre porque el municipio los administra desde Configuración y porque los
    movimientos apuntan a ellos.
    """
    __tablename__ = "inventario_depositos"
    __table_args__ = (
        UniqueConstraint("municipio_id", "nombre", name="uq_deposito_muni_nombre"),
    )

    id = Column(Integer, primary_key=True, index=True)
    municipio_id = Column(Integer, ForeignKey("municipios.id", ondelete="CASCADE"), nullable=False, index=True)

    nombre = Column(String(100), nullable=False)
    descripcion = Column(Text, nullable=True)
    direccion = Column(String(200), nullable=True)
    responsable = Column(String(120), nullable=True)

    activo = Column(Boolean, default=True, nullable=False)
    orden = Column(Integer, default=0)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    items = relationship("InventarioItem", back_populates="deposito")


class InventarioMovimiento(Base):
    """El renglón de cada cambio de stock. Es el libro del depósito.

    Antes el stock sólo se movía como efecto colateral de completar una OT:
    no había forma de cargar una compra, una entrega a un área ni un ajuste
    por rotura, y el historial de un artículo no existía (dueño, 2026-08-31).

    `cantidad` va SIEMPRE en positivo; el signo lo da el tipo (ver `signo`).
    `stock_resultante` es el saldo que quedó después de este movimiento: sin
    eso, reconstruir el pasado obliga a recalcular toda la cadena, y si
    alguien edita el stock a mano el historial deja de cerrar.
    """
    __tablename__ = "inventario_movimientos"

    id = Column(Integer, primary_key=True, index=True)
    municipio_id = Column(Integer, ForeignKey("municipios.id", ondelete="CASCADE"), nullable=False, index=True)
    item_id = Column(
        Integer, ForeignKey("inventario_items.id", ondelete="CASCADE"), nullable=False, index=True
    )

    tipo = Column(
        Enum(TipoMovimientoInventario, values_callable=lambda x: [e.value for e in x]),
        nullable=False, index=True,
    )
    cantidad = Column(Float, nullable=False, default=0)
    stock_resultante = Column(Float, nullable=True)   # saldo posterior (consumibles)

    deposito_id = Column(
        Integer, ForeignKey("inventario_depositos.id", ondelete="SET NULL"), nullable=True, index=True
    )
    # A dónde fue o de dónde vino: un área, una persona, un proveedor.
    contraparte = Column(String(160), nullable=True)
    motivo = Column(Text, nullable=True)

    orden_trabajo_id = Column(
        Integer, ForeignKey("ordenes_trabajo.id", ondelete="SET NULL"), nullable=True, index=True
    )
    orden_compra_id = Column(
        Integer, ForeignKey("inventario_ordenes_compra.id", ondelete="SET NULL"), nullable=True, index=True
    )
    # Quién lo cargó. Se guarda además el nombre porque el usuario puede irse
    # del municipio y el renglón tiene que seguir contando quién lo hizo.
    usuario_id = Column(Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True)
    usuario_nombre = Column(String(160), nullable=True)
    item_nombre = Column(String(200), nullable=True)   # snapshot, como en la OT

    fecha = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    item = relationship("InventarioItem", foreign_keys=[item_id])
    deposito = relationship("InventarioDeposito", foreign_keys=[deposito_id])

    # Cuánto suma (o resta) al stock este tipo de movimiento.
    SUMAN = {
        TipoMovimientoInventario.ENTRADA,
        TipoMovimientoInventario.DEVOLUCION_OT,
    }
    RESTAN = {
        TipoMovimientoInventario.SALIDA,
        TipoMovimientoInventario.CONSUMO_OT,
    }

    @property
    def signo(self) -> int:
        """+1 suma al stock, -1 lo resta, 0 no lo toca (ajuste y reserva).

        El AJUSTE no tiene signo fijo a propósito: fija el stock en un valor,
        no lo mueve — el delta se calcula contra el saldo del momento.
        """
        if self.tipo in self.SUMAN:
            return 1
        if self.tipo in self.RESTAN:
            return -1
        return 0


class InventarioOrdenCompra(Base):
    """Reposición: qué se le pidió a qué proveedor y qué llegó.

    Deliberadamente corta para un municipio chico: se arma, se manda y se
    recibe (entera o en partes). Cada recepción escribe los movimientos de
    ENTRADA, así que la orden de compra no es una contabilidad paralela: es
    la puerta por la que entra el stock.
    """
    __tablename__ = "inventario_ordenes_compra"

    id = Column(Integer, primary_key=True, index=True)
    municipio_id = Column(Integer, ForeignKey("municipios.id", ondelete="CASCADE"), nullable=False, index=True)

    numero = Column(String(30), nullable=False, index=True)   # OC-YYYY-NNNN
    proveedor = Column(String(200), nullable=True)
    estado = Column(
        Enum(EstadoOrdenCompra, values_callable=lambda x: [e.value for e in x]),
        nullable=False, default=EstadoOrdenCompra.BORRADOR, index=True,
    )
    deposito_id = Column(
        Integer, ForeignKey("inventario_depositos.id", ondelete="SET NULL"), nullable=True
    )

    fecha = Column(Date, nullable=True)              # cuándo se emitió
    fecha_esperada = Column(Date, nullable=True)     # cuándo prometieron entregar
    total_estimado = Column(Float, nullable=True)
    notas = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    lineas = relationship(
        "InventarioOrdenCompraLinea", back_populates="orden",
        cascade="all, delete-orphan", lazy="selectin",
    )
    deposito = relationship("InventarioDeposito", foreign_keys=[deposito_id])


class InventarioOrdenCompraLinea(Base):
    """Un renglón de la orden de compra: qué artículo, cuánto y cuánto llegó.

    `cantidad_recibida` es acumulativa: permite la recepción parcial sin
    duplicar renglones ni perder lo que falta.
    """
    __tablename__ = "inventario_orden_compra_lineas"

    id = Column(Integer, primary_key=True, index=True)
    orden_compra_id = Column(
        Integer, ForeignKey("inventario_ordenes_compra.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    item_id = Column(
        Integer, ForeignKey("inventario_items.id", ondelete="RESTRICT"), nullable=False, index=True
    )

    item_nombre = Column(String(200), nullable=True)   # snapshot
    cantidad = Column(Float, nullable=False, default=0)
    cantidad_recibida = Column(Float, nullable=False, default=0)
    precio_unitario = Column(Float, nullable=True)

    orden = relationship("InventarioOrdenCompra", back_populates="lineas")
    item = relationship("InventarioItem", foreign_keys=[item_id])

    @property
    def pendiente(self) -> float:
        return max(0.0, (self.cantidad or 0) - (self.cantidad_recibida or 0))
