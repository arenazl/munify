"""Agregar campo tipo a empleados (operario/administrativo)

Revision ID: 008_emp_tipo
Revises: 007_emp_tables
Create Date: 2025-01-01

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '008_emp_tipo'
down_revision: Union[str, None] = '007_emp_tables'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Agregar columna tipo a empleados
    op.add_column('empleados', sa.Column('tipo', sa.String(20), nullable=False, server_default='operario'))


def downgrade() -> None:
    op.drop_column('empleados', 'tipo')
