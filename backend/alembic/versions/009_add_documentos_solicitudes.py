"""Agregar tabla documentos_solicitudes para adjuntos de trámites

Revision ID: 009_documentos_solicitudes
Revises: 008_emp_tipo
Create Date: 2025-01-01

Esta tabla almacena los documentos adjuntos a las solicitudes de trámites.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '009_documentos_solicitudes'
down_revision: Union[str, None] = '008_emp_tipo'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'documentos_solicitudes',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('solicitud_id', sa.Integer(), nullable=False),
        sa.Column('usuario_id', sa.Integer(), nullable=False),
        sa.Column('nombre_original', sa.String(255), nullable=False),
        sa.Column('url', sa.String(500), nullable=False),
        sa.Column('public_id', sa.String(255), nullable=True),
        sa.Column('tipo', sa.String(50), nullable=False),
        sa.Column('mime_type', sa.String(100), nullable=True),
        sa.Column('tamanio', sa.Integer(), nullable=True),
        sa.Column('tipo_documento', sa.String(100), nullable=True),
        sa.Column('descripcion', sa.String(500), nullable=True),
        sa.Column('etapa', sa.String(50), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['solicitud_id'], ['solicitudes.id'], ),
        sa.ForeignKeyConstraint(['usuario_id'], ['usuarios.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_documentos_solicitudes_id'), 'documentos_solicitudes', ['id'], unique=False)
    op.create_index(op.f('ix_documentos_solicitudes_solicitud_id'), 'documentos_solicitudes', ['solicitud_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_documentos_solicitudes_solicitud_id'), table_name='documentos_solicitudes')
    op.drop_index(op.f('ix_documentos_solicitudes_id'), table_name='documentos_solicitudes')
    op.drop_table('documentos_solicitudes')
