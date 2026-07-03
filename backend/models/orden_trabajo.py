from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime, Date, Time, Text, Float, Enum,
    ForeignKey, JSON, UniqueConstraint,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from core.database import Base
from .enums import EstadoOrdenTrabajo, PrioridadOT


class OrdenTrabajo(Base):
    """Orden de trabajo (OT) — la unidad formal de trabajo de campo.

    Relación con reclamos N:M (tabla `orden_trabajo_reclamos`):
      - 1 reclamo puede generar N órdenes (poda + bacheo del mismo evento,
        cada una para otra cuadrilla).
      - N reclamos agrupados se resuelven con 1 orden.

    Es ADITIVA al flujo simple existente (Reclamo.empleado_id directo):
    los munis chicos siguen asignando empleado sobre el reclamo; los munis
    grandes formalizan con OT (cuadrilla, materiales, horas). Se habilita
    por feature flag `municipio_modulos.modulo = 'ordenes_trabajo'` (opt-in).

    Completar una OT NO cierra los reclamos vinculados: el cierre del
    reclamo mantiene su propio circuito (resolver → confirmación del
    supervisor → confirmación del vecino).
    """
    __tablename__ = "ordenes_trabajo"
    __table_args__ = (
        UniqueConstraint("municipio_id", "numero", name="uq_ot_municipio_numero"),
    )

    id = Column(Integer, primary_key=True, index=True)

    # Multi-tenant
    municipio_id = Column(Integer, ForeignKey("municipios.id"), nullable=False, index=True)

    # Correlativo por municipio y año: OT-2026-0001 (mismo patrón que OrdenPago)
    numero = Column(String(20), nullable=False, index=True)

    estado = Column(
        Enum(EstadoOrdenTrabajo, values_callable=lambda x: [e.value for e in x]),
        default=EstadoOrdenTrabajo.PENDIENTE, nullable=False, index=True,
    )

    # Qué hay que hacer
    titulo = Column(String(200), nullable=False)
    descripcion = Column(Text, nullable=True)

    # Formato / clasificación (Fase 3)
    prioridad = Column(
        Enum(PrioridadOT, values_callable=lambda x: [e.value for e in x]),
        default=PrioridadOT.MEDIA, nullable=False, index=True,
    )
    # Tipo de trabajo del catálogo configurable por muni (Poda, Bacheo, ...)
    tipo_trabajo_id = Column(
        Integer, ForeignKey("ot_tipos_trabajo.id", ondelete="SET NULL"), nullable=True, index=True
    )
    tipo_trabajo = relationship("OrdenTrabajoTipo")

    # Quién lo hace: cuadrilla y/o empleado responsable individual
    cuadrilla_id = Column(Integer, ForeignKey("cuadrillas.id", ondelete="SET NULL"), nullable=True, index=True)
    cuadrilla = relationship("Cuadrilla")
    empleado_id = Column(Integer, ForeignKey("empleados.id", ondelete="SET NULL"), nullable=True, index=True)
    empleado = relationship("Empleado")

    # Programación
    fecha_programada = Column(Date, nullable=True)
    hora_inicio = Column(Time, nullable=True)
    hora_fin = Column(Time, nullable=True)

    # Recursos
    # Lista JSON de {descripcion, cantidad, unidad} — sin catálogo de materiales
    # por ahora; cuando un muni pida stock se normaliza a entidad propia.
    materiales = Column(JSON, nullable=True)
    horas_estimadas = Column(Float, nullable=True)
    horas_reales = Column(Float, nullable=True)

    # Cierre
    notas_cierre = Column(Text, nullable=True)
    motivo_cancelacion = Column(Text, nullable=True)
    fecha_inicio_real = Column(DateTime(timezone=True), nullable=True)
    fecha_completada = Column(DateTime(timezone=True), nullable=True)

    # Trazabilidad
    creador_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    creador = relationship("User", foreign_keys=[creador_id])

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    reclamos_vinculados = relationship(
        "OrdenTrabajoReclamo", back_populates="orden", cascade="all, delete-orphan"
    )

    # Recursos de inventario tomados/consumidos por la OT (módulo inventario,
    # opt-in). Se define en models/inventario.py; relación por string lazy.
    recursos = relationship(
        "OrdenTrabajoRecurso",
        foreign_keys="OrdenTrabajoRecurso.orden_trabajo_id",
        cascade="all, delete-orphan",
        overlaps="orden",
    )


class OrdenTrabajoTipo(Base):
    """Tipo de trabajo por municipio (catálogo configurable — template).

    Clasifica la OT en la planilla (Poda, Bacheo, Alumbrado, ...). Se siembra
    un set genérico que el municipio customiza, mismo criterio que las
    categorías de reclamo / inventario.
    """
    __tablename__ = "ot_tipos_trabajo"
    __table_args__ = (
        UniqueConstraint("municipio_id", "nombre", name="uq_ot_tipo_muni_nombre"),
    )

    id = Column(Integer, primary_key=True, index=True)
    municipio_id = Column(Integer, ForeignKey("municipios.id", ondelete="CASCADE"), nullable=False, index=True)
    nombre = Column(String(100), nullable=False)
    icono = Column(String(50), nullable=True)
    color = Column(String(20), nullable=True)
    activo = Column(Boolean, default=True, nullable=False)
    orden = Column(Integer, default=0)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class OrdenTrabajoReclamo(Base):
    """Pivot N:M orden de trabajo ↔ reclamo."""
    __tablename__ = "orden_trabajo_reclamos"
    __table_args__ = (
        UniqueConstraint("orden_trabajo_id", "reclamo_id", name="uq_ot_reclamo"),
    )

    id = Column(Integer, primary_key=True, index=True)
    orden_trabajo_id = Column(
        Integer, ForeignKey("ordenes_trabajo.id", ondelete="CASCADE"), nullable=False, index=True
    )
    reclamo_id = Column(
        Integer, ForeignKey("reclamos.id", ondelete="CASCADE"), nullable=False, index=True
    )
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    orden = relationship("OrdenTrabajo", back_populates="reclamos_vinculados")
    reclamo = relationship("Reclamo")
