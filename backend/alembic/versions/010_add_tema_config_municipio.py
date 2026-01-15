"""add tema_config to municipios

Revision ID: 010_add_tema_config
Revises: 009_documentos_solicitudes
Create Date: 2026-01-14

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql

# revision identifiers, used by Alembic.
revision = '010_add_tema_config'
down_revision = '009_documentos_solicitudes'
branch_labels = None
depends_on = None


def upgrade():
    # Agregar columna tema_config (JSON) a municipios
    op.add_column('municipios', sa.Column('tema_config', sa.JSON(), nullable=True))


def downgrade():
    # Eliminar columna tema_config
    op.drop_column('municipios', 'tema_config')
