from sqlalchemy import Column, Integer, String, DateTime, Text, Enum, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from core.database import Base
from .enums import EstadoOrdenTrabajo


class HistorialOrdenTrabajo(Base):
    """Auditoría de transiciones de una orden de trabajo (OT).

    Espeja el patrón de HistorialReclamo: una fila por cambio de estado de la
    OT (crear, iniciar, bloquear, completar, cancelar) con quién la movió, el
    estado_anterior → estado_nuevo y un comentario libre.

    Multi-tenant heredado: la OT ya viene scopeada por municipio_id (se resuelve
    en cada endpoint vía _get_ot / crear_ot_core), por eso NO se duplica el
    municipio_id acá — el vínculo `orden_trabajo_id` alcanza para acotar el
    tenant. El FK es ON DELETE CASCADE: si se borra la OT, su historial se va con
    ella.
    """
    __tablename__ = "historial_ordenes_trabajo"

    id = Column(Integer, primary_key=True, index=True)

    orden_trabajo_id = Column(
        Integer, ForeignKey("ordenes_trabajo.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    orden_trabajo = relationship("OrdenTrabajo")

    # Quién realizó la acción
    usuario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    usuario = relationship("User")

    # Cambio de estado (nullable: acciones que no cambian estado, p. ej. la
    # creación no tiene estado_anterior).
    estado_anterior = Column(
        Enum(EstadoOrdenTrabajo, values_callable=lambda x: [e.value for e in x]),
        nullable=True,
    )
    estado_nuevo = Column(
        Enum(EstadoOrdenTrabajo, values_callable=lambda x: [e.value for e in x]),
        nullable=True,
    )

    # Descripción de la acción ("ot_creada", "ot_iniciada", "ot_bloqueada", ...)
    accion = Column(String(100), nullable=False)
    comentario = Column(Text, nullable=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
