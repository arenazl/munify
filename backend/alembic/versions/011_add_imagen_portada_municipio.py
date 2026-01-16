"""add imagen_portada to municipios

Revision ID: 011_add_imagen_portada
Revises: 010_add_tema_config
Create Date: 2026-01-16

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '011_add_imagen_portada'
down_revision = 'tramites_genericos_001'
branch_labels = None
depends_on = None


def upgrade():
    # Agregar columna imagen_portada (URL de Cloudinary) a municipios
    op.add_column('municipios', sa.Column('imagen_portada', sa.String(500), nullable=True))


def downgrade():
    # Eliminar columna imagen_portada
    op.drop_column('municipios', 'imagen_portada')
