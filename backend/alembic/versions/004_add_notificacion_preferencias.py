"""Agregar campo notificacion_preferencias a usuarios

Revision ID: 004_notif_prefs
Revises: 003_pendiente_conf
Create Date: 2024-12-27

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql
import json

# revision identifiers, used by Alembic.
revision: str = '004_notif_prefs'
down_revision: Union[str, None] = '003_add_pendiente_confirmacion'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Preferencias por defecto
DEFAULT_PREFS = {
    "reclamo_recibido": True,
    "reclamo_asignado": True,
    "cambio_estado": True,
    "reclamo_resuelto": True,
    "nuevo_comentario": True,
    "reclamo_rechazado": True,
    "tramite_creado": True,
    "tramite_asignado": True,
    "tramite_cambio_estado": True,
    "tramite_aprobado": True,
    "tramite_rechazado": True,
    "asignacion_empleado": True,
    "comentario_vecino": True,
    "cambio_prioridad": True,
    "reclamo_reabierto": True,
    "reclamo_nuevo_supervisor": True,
    "reclamo_resuelto_supervisor": True,
    "reclamo_rechazado_supervisor": True,
    "pendiente_confirmacion": True,
    "sla_vencido": True,
    "en_progreso": True,
    "tramite_nuevo_supervisor": True,
}


def upgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name

    if dialect == 'mysql':
        op.add_column('usuarios', sa.Column(
            'notificacion_preferencias',
            mysql.JSON(),
            nullable=True
        ))
    else:
        op.add_column('usuarios', sa.Column(
            'notificacion_preferencias',
            sa.JSON(),
            nullable=True
        ))

    # Establecer valores por defecto para usuarios existentes
    op.execute(
        f"UPDATE usuarios SET notificacion_preferencias = '{json.dumps(DEFAULT_PREFS)}'"
    )


def downgrade() -> None:
    op.drop_column('usuarios', 'notificacion_preferencias')
