"""Agregar campos hora_entrada y hora_salida a empleados

Revision ID: 005_emp_horario
Revises: 004_notif_prefs
Create Date: 2024-12-27

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '005_emp_horario'
down_revision: Union[str, None] = '004_notif_prefs'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Agregar columnas de horario
    op.add_column('empleados', sa.Column('hora_entrada', sa.Time(), nullable=True))
    op.add_column('empleados', sa.Column('hora_salida', sa.Time(), nullable=True))

    # Establecer valores por defecto para empleados existentes (9:00 a 18:00)
    op.execute("UPDATE empleados SET hora_entrada = '09:00:00', hora_salida = '18:00:00'")


def downgrade() -> None:
    op.drop_column('empleados', 'hora_salida')
    op.drop_column('empleados', 'hora_entrada')
