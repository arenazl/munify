"""
Audit log: registro persistente de cada request HTTP relevante para que
el super admin pueda auditar actividad cross-municipio.

Heroku tiene filesystem efímero — esto vive 100% en MySQL (Aiven) y se
escribe desde un middleware async fire-and-forget en sesión separada
para no afectar la latencia ni la transaccionalidad del request.

Para ahorrar bytes y mantener queries rápidas:
- BIGINT id porque la tabla crece rápido.
- FKs con ON DELETE SET NULL — los logs sobreviven al borrado del user/muni.
- usuario_email/usuario_rol guardados como snapshot por la misma razón.
- 3 índices compuestos pensados para los filtros más usados de la consola.
"""
from sqlalchemy import (
    Column, BigInteger, Integer, String, Text, DateTime, JSON, Index,
    ForeignKey,
)
from sqlalchemy.sql import func

from core.database import Base


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        index=True,
    )

    # Quién (snapshots de email/rol para sobrevivir al borrado)
    usuario_id = Column(
        Integer,
        ForeignKey("usuarios.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    usuario_email = Column(String(200), nullable=True)
    usuario_rol = Column(String(20), nullable=True)
    municipio_id = Column(
        Integer,
        ForeignKey("municipios.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Qué
    method = Column(String(10), nullable=False)
    path = Column(String(500), nullable=False, index=True)
    status_code = Column(Integer, nullable=False, index=True)
    duracion_ms = Column(Integer, nullable=False, index=True)

    # Acción semántica derivada del path/method
    # ej: "reclamo.creado", "auth.login", "demo.creado"
    action = Column(String(100), nullable=True, index=True)
    entity_type = Column(String(50), nullable=True)
    entity_id = Column(Integer, nullable=True)

    # Detalles (JSON sanitizado, sin passwords/tokens)
    query_params = Column(JSON, nullable=True)
    request_body = Column(JSON, nullable=True)  # solo si debug_mode=true
    response_summary = Column(JSON, nullable=True)
    error_message = Column(Text, nullable=True)  # solo si status >= 400

    # Contexto
    ip_address = Column(String(45), nullable=True)
    user_agent = Column(String(500), nullable=True)

    __table_args__ = (
        Index("ix_audit_muni_created", "municipio_id", "created_at"),
        Index("ix_audit_action_created", "action", "created_at"),
        Index("ix_audit_status_created", "status_code", "created_at"),
    )
