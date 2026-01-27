"""Agregar estado pendiente_confirmacion al enum EstadoReclamo

Revision ID: 003_add_pendiente_confirmacion
Revises: 002_add_sla_tables
Create Date: 2024-12-26

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '003_add_pendiente_confirmacion'
down_revision: Union[str, None] = '002_add_sla_tables'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Detectar tipo de base de datos
    bind = op.get_bind()
    dialect = bind.dialect.name

    if dialect == 'postgresql':
        # Agregar nuevo valor al enum de PostgreSQL
        op.execute("ALTER TYPE estadoreclamo ADD VALUE IF NOT EXISTS 'pendiente_confirmacion' AFTER 'en_proceso'")

    elif dialect == 'mysql':
        # MySQL: Modificar columna enum para incluir nuevo valor (lowercase para coincidir con Python enum)
        op.execute("""
            ALTER TABLE reclamos
            MODIFY COLUMN estado ENUM('nuevo','recibido','asignado','en_proceso','pendiente_confirmacion','resuelto','rechazado')
            NOT NULL DEFAULT 'nuevo'
        """)
        op.execute("""
            ALTER TABLE historial_reclamos
            MODIFY COLUMN estado_anterior ENUM('nuevo','recibido','asignado','en_proceso','pendiente_confirmacion','resuelto','rechazado') NULL
        """)
        op.execute("""
            ALTER TABLE historial_reclamos
            MODIFY COLUMN estado_nuevo ENUM('nuevo','recibido','asignado','en_proceso','pendiente_confirmacion','resuelto','rechazado') NULL
        """)

    # Para SQLite y otras bases que usan strings, no se necesita hacer nada
    # El modelo ya acepta el nuevo valor


def downgrade() -> None:
    # En PostgreSQL no se pueden eliminar valores de enums fácilmente
    # Solo convertimos los existentes a 'en_proceso'
    bind = op.get_bind()
    dialect = bind.dialect.name

    if dialect == 'postgresql':
        # Convertir los reclamos con pendiente_confirmacion a en_proceso
        op.execute("""
            UPDATE reclamos
            SET estado = 'en_proceso'
            WHERE estado = 'pendiente_confirmacion'
        """)

        # Convertir historial
        op.execute("""
            UPDATE historial_reclamos
            SET estado_anterior = 'en_proceso'
            WHERE estado_anterior = 'pendiente_confirmacion'
        """)
        op.execute("""
            UPDATE historial_reclamos
            SET estado_nuevo = 'en_proceso'
            WHERE estado_nuevo = 'pendiente_confirmacion'
        """)

    # Nota: No se puede eliminar el valor del enum en PostgreSQL
    # sin recrear la tabla completa
