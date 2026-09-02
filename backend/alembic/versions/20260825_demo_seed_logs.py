"""Crear tabla demo_seed_logs — bitacora paso a paso de la creacion de demos

Por que tabla propia y no `audit_logs`: ver el docstring de
`models/demo_seed_log.py`. El punto que decide es que el log tiene que
sobrevivir al rollback del alta cuando la creacion falla a mitad, y por eso se
escribe en una sesion propia contra una tabla propia.

`municipio_id` va SIN foreign key a proposito: las demos se borran seguido y el
log tiene que quedar igual (es cuando mas sirve).

Revision ID: 20260825_seedlogs
Revises: categorias_genericas_001
Create Date: 2026-08-25

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '20260825_seedlogs'
down_revision: Union[str, None] = 'categorias_genericas_001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'demo_seed_logs',
        sa.Column('id', sa.Integer(), nullable=False, autoincrement=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('municipio_id', sa.Integer(), nullable=True),
        sa.Column('municipio_nombre', sa.String(200), nullable=False),
        sa.Column('codigo', sa.String(50), nullable=True),
        sa.Column('pais', sa.String(2), nullable=True),
        sa.Column('provincia', sa.String(150), nullable=True),
        sa.Column('origen', sa.String(30), nullable=False, server_default='endpoint'),
        sa.Column('estado', sa.String(20), nullable=False, server_default='ok'),
        sa.Column('duracion_ms', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('pasos', sa.JSON(), nullable=True),
        sa.Column('resumen', sa.JSON(), nullable=True),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_demo_seed_logs_created_at', 'demo_seed_logs', ['created_at'])
    op.create_index('ix_demo_seed_logs_municipio_id', 'demo_seed_logs', ['municipio_id'])
    op.create_index('ix_demo_seed_logs_estado', 'demo_seed_logs', ['estado'])


def downgrade() -> None:
    op.drop_index('ix_demo_seed_logs_estado', table_name='demo_seed_logs')
    op.drop_index('ix_demo_seed_logs_municipio_id', table_name='demo_seed_logs')
    op.drop_index('ix_demo_seed_logs_created_at', table_name='demo_seed_logs')
    op.drop_table('demo_seed_logs')
