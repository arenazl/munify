"""Add pedidos and compras tables

Revision ID: 20260119_pedidos_compras
Revises: 20260118_consultas
Create Date: 2026-01-19

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '20260119_pedidos_compras'
down_revision: Union[str, None] = '20260118_consultas'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ### Pedidos table ###
    op.create_table('pedidos',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('municipio_id', sa.Integer(), nullable=False),
        sa.Column('fecha', sa.Date(), nullable=False),
        sa.Column('activo', sa.Boolean(), default=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['municipio_id'], ['municipios.id']),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_pedidos_id', 'pedidos', ['id'])
    op.create_index('ix_pedidos_municipio_id', 'pedidos', ['municipio_id'])
    op.create_index('ix_pedidos_fecha', 'pedidos', ['fecha'])
    op.create_index('ix_pedidos_activo', 'pedidos', ['activo'])

    # ### Compras table ###
    op.create_table('compras',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('municipio_id', sa.Integer(), nullable=False),
        sa.Column('fecha', sa.Date(), nullable=False),
        sa.Column('activo', sa.Boolean(), default=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['municipio_id'], ['municipios.id']),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_compras_id', 'compras', ['id'])
    op.create_index('ix_compras_municipio_id', 'compras', ['municipio_id'])
    op.create_index('ix_compras_fecha', 'compras', ['fecha'])
    op.create_index('ix_compras_activo', 'compras', ['activo'])


def downgrade() -> None:
    op.drop_index('ix_compras_activo', table_name='compras')
    op.drop_index('ix_compras_fecha', table_name='compras')
    op.drop_index('ix_compras_municipio_id', table_name='compras')
    op.drop_index('ix_compras_id', table_name='compras')
    op.drop_table('compras')

    op.drop_index('ix_pedidos_activo', table_name='pedidos')
    op.drop_index('ix_pedidos_fecha', table_name='pedidos')
    op.drop_index('ix_pedidos_municipio_id', table_name='pedidos')
    op.drop_index('ix_pedidos_id', table_name='pedidos')
    op.drop_table('pedidos')
