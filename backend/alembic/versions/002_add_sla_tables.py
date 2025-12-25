"""Add SLA tables

Revision ID: 002_add_sla_tables
Revises: 001_initial
Create Date: 2024-12-24

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '002_add_sla_tables'
down_revision: Union[str, None] = '001_initial'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ### SLA Config ###
    op.create_table('sla_config',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('municipio_id', sa.Integer(), nullable=False),
        sa.Column('categoria_id', sa.Integer(), nullable=True),
        sa.Column('prioridad', sa.Integer(), nullable=True),
        sa.Column('tiempo_respuesta', sa.Integer(), default=24),
        sa.Column('tiempo_resolucion', sa.Integer(), default=72),
        sa.Column('tiempo_alerta_amarilla', sa.Integer(), default=48),
        sa.Column('activo', sa.Boolean(), default=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['municipio_id'], ['municipios.id']),
        sa.ForeignKeyConstraint(['categoria_id'], ['categorias.id']),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_sla_config_id', 'sla_config', ['id'])
    op.create_index('ix_sla_config_municipio_id', 'sla_config', ['municipio_id'])

    # ### SLA Violaciones ###
    op.create_table('sla_violaciones',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('reclamo_id', sa.Integer(), nullable=False),
        sa.Column('tipo', sa.String(50), nullable=False),
        sa.Column('tiempo_limite_horas', sa.Integer(), nullable=False),
        sa.Column('tiempo_real_horas', sa.Float(), nullable=False),
        sa.Column('exceso_horas', sa.Float(), nullable=False),
        sa.Column('estado_reclamo', sa.String(50), nullable=False),
        sa.Column('fecha_vencimiento', sa.DateTime(timezone=True), nullable=False),
        sa.Column('fecha_deteccion', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.Column('notificada', sa.Boolean(), default=False),
        sa.ForeignKeyConstraint(['reclamo_id'], ['reclamos.id']),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_sla_violaciones_id', 'sla_violaciones', ['id'])


def downgrade() -> None:
    op.drop_table('sla_violaciones')
    op.drop_table('sla_config')
