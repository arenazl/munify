"""Crear tabla consultas_guardadas para BI

Revision ID: 20260118_consultas
Revises:
Create Date: 2026-01-18

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '20260118_consultas'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'consultas_guardadas',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('municipio_id', sa.Integer(), nullable=False),
        sa.Column('usuario_id', sa.Integer(), nullable=False),
        sa.Column('nombre', sa.String(100), nullable=False),
        sa.Column('descripcion', sa.Text(), nullable=True),
        sa.Column('icono', sa.String(50), server_default='database'),
        sa.Column('color', sa.String(20), server_default='#3b82f6'),
        sa.Column('pregunta_original', sa.Text(), nullable=False),
        sa.Column('sql_query', sa.Text(), nullable=True),
        sa.Column('tipo_visualizacion', sa.String(50), server_default='tabla'),
        sa.Column('config_visualizacion', sa.JSON(), nullable=True),
        sa.Column('es_publica', sa.Boolean(), server_default='false'),
        sa.Column('es_predeterminada', sa.Boolean(), server_default='false'),
        sa.Column('veces_ejecutada', sa.Integer(), server_default='0'),
        sa.Column('ultima_ejecucion', sa.DateTime(timezone=True), nullable=True),
        sa.Column('activo', sa.Boolean(), server_default='true'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['municipio_id'], ['municipios.id'], ),
        sa.ForeignKeyConstraint(['usuario_id'], ['usuarios.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_consultas_guardadas_id'), 'consultas_guardadas', ['id'], unique=False)
    op.create_index(op.f('ix_consultas_guardadas_municipio_id'), 'consultas_guardadas', ['municipio_id'], unique=False)
    op.create_index(op.f('ix_consultas_guardadas_usuario_id'), 'consultas_guardadas', ['usuario_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_consultas_guardadas_usuario_id'), table_name='consultas_guardadas')
    op.drop_index(op.f('ix_consultas_guardadas_municipio_id'), table_name='consultas_guardadas')
    op.drop_index(op.f('ix_consultas_guardadas_id'), table_name='consultas_guardadas')
    op.drop_table('consultas_guardadas')
