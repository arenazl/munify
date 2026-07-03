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

Cruce con OT: ver `api/ordenes_trabajo.py` (reservar/consumir/liberar).
"""
from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime, Text, Float, Enum,
    ForeignKey, UniqueConstraint,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from core.database import Base
from .enums import NaturalezaInventario, EstadoActivo, TipoRecursoOT


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

    activo = Column(Boolean, default=True, nullable=False)  # soft delete

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    categoria = relationship("InventarioCategoria", back_populates="items")
    ocupado_por_ot = relationship("OrdenTrabajo", foreign_keys=[ocupado_por_ot_id])


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
