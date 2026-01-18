"""Categorias como catalogo generico con tabla intermedia municipio_categorias

Revision ID: categorias_genericas_001
Revises: tramites_genericos_001
Create Date: 2026-01-17

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'categorias_genericas_001'
down_revision = '011_add_imagen_portada'
branch_labels = None
depends_on = None


def upgrade():
    # 1. Crear tabla intermedia municipio_categorias
    op.create_table(
        'municipio_categorias',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('municipio_id', sa.Integer(), nullable=False),
        sa.Column('categoria_id', sa.Integer(), nullable=False),
        sa.Column('activo', sa.Boolean(), default=True),
        sa.Column('orden', sa.Integer(), default=0),
        sa.Column('tiempo_resolucion_estimado', sa.Integer(), nullable=True),
        sa.Column('prioridad_default', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['municipio_id'], ['municipios.id'], ),
        sa.ForeignKeyConstraint(['categoria_id'], ['categorias.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('municipio_id', 'categoria_id', name='uq_municipio_categoria')
    )
    op.create_index('ix_municipio_categorias_municipio_id', 'municipio_categorias', ['municipio_id'])
    op.create_index('ix_municipio_categorias_categoria_id', 'municipio_categorias', ['categoria_id'])

    # 2. Agregar columna orden a categorias (si no existe)
    op.add_column('categorias', sa.Column('orden', sa.Integer(), default=0))

    # 3. Migrar datos: crear registros en tabla intermedia para municipio 48
    conn = op.get_bind()

    # Insertar en municipio_categorias todas las categorías existentes asociadas al municipio 48
    conn.execute(sa.text("""
        INSERT INTO municipio_categorias (municipio_id, categoria_id, activo, orden, tiempo_resolucion_estimado, prioridad_default)
        SELECT
            48 as municipio_id,
            id as categoria_id,
            activo,
            COALESCE(orden, 0) as orden,
            tiempo_resolucion_estimado,
            prioridad_default
        FROM categorias
    """))

    # 4. Quitar columna municipio_id de categorias (ya no es necesaria)
    # Primero eliminar el FK constraint y el index
    try:
        op.drop_constraint('categorias_municipio_id_fkey', 'categorias', type_='foreignkey')
    except:
        pass  # El constraint puede no existir o tener otro nombre

    try:
        op.drop_index('ix_categorias_municipio_id', 'categorias')
    except:
        pass  # El index puede no existir

    op.drop_column('categorias', 'municipio_id')

    # 5. Agregar constraint unique a nombre en categorias (catálogo único)
    op.create_unique_constraint('uq_categorias_nombre', 'categorias', ['nombre'])


def downgrade():
    # Revertir: Agregar municipio_id de vuelta a categorias
    op.add_column('categorias', sa.Column('municipio_id', sa.Integer(), nullable=True))
    op.create_foreign_key('categorias_municipio_id_fkey', 'categorias', 'municipios', ['municipio_id'], ['id'])
    op.create_index('ix_categorias_municipio_id', 'categorias', ['municipio_id'])

    # Restaurar municipio_id desde tabla intermedia (tomando el primero)
    conn = op.get_bind()
    conn.execute(sa.text("""
        UPDATE categorias c
        SET municipio_id = (
            SELECT mc.municipio_id
            FROM municipio_categorias mc
            WHERE mc.categoria_id = c.id
            LIMIT 1
        )
    """))

    # Quitar unique constraint
    op.drop_constraint('uq_categorias_nombre', 'categorias', type_='unique')

    # Quitar columna orden
    op.drop_column('categorias', 'orden')

    # Eliminar tabla intermedia
    op.drop_table('municipio_categorias')
