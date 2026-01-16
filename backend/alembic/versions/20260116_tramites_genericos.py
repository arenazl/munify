"""Tramites y tipos como catalogo generico con tablas intermedias

Revision ID: tramites_genericos_001
Revises:
Create Date: 2026-01-16

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'tramites_genericos_001'
down_revision = None  # Ajustar según la última migración existente
branch_labels = None
depends_on = None


def upgrade():
    # 1. Crear tablas intermedias
    op.create_table(
        'municipio_tipos_tramites',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('municipio_id', sa.Integer(), nullable=False),
        sa.Column('tipo_tramite_id', sa.Integer(), nullable=False),
        sa.Column('activo', sa.Boolean(), default=True),
        sa.Column('orden', sa.Integer(), default=0),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['municipio_id'], ['municipios.id'], ),
        sa.ForeignKeyConstraint(['tipo_tramite_id'], ['tipos_tramites.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('municipio_id', 'tipo_tramite_id', name='uq_municipio_tipo_tramite')
    )
    op.create_index('ix_municipio_tipos_tramites_municipio_id', 'municipio_tipos_tramites', ['municipio_id'])
    op.create_index('ix_municipio_tipos_tramites_tipo_tramite_id', 'municipio_tipos_tramites', ['tipo_tramite_id'])

    op.create_table(
        'municipio_tramites',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('municipio_id', sa.Integer(), nullable=False),
        sa.Column('tramite_id', sa.Integer(), nullable=False),
        sa.Column('activo', sa.Boolean(), default=True),
        sa.Column('orden', sa.Integer(), default=0),
        sa.Column('tiempo_estimado_dias', sa.Integer(), nullable=True),
        sa.Column('costo', sa.Float(), nullable=True),
        sa.Column('requisitos', sa.Text(), nullable=True),
        sa.Column('documentos_requeridos', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['municipio_id'], ['municipios.id'], ),
        sa.ForeignKeyConstraint(['tramite_id'], ['tramites.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('municipio_id', 'tramite_id', name='uq_municipio_tramite')
    )
    op.create_index('ix_municipio_tramites_municipio_id', 'municipio_tramites', ['municipio_id'])
    op.create_index('ix_municipio_tramites_tramite_id', 'municipio_tramites', ['tramite_id'])

    # 2. Migrar datos existentes: crear registros en tablas intermedias
    # Esto preserva las asociaciones municipio-tipo/tramite actuales
    conn = op.get_bind()

    # Migrar tipos_tramites a tabla intermedia
    conn.execute(sa.text("""
        INSERT INTO municipio_tipos_tramites (municipio_id, tipo_tramite_id, activo, orden)
        SELECT municipio_id, id, activo, orden
        FROM tipos_tramites
        WHERE municipio_id IS NOT NULL
    """))

    # Migrar tramites a tabla intermedia (obteniendo municipio_id del tipo padre)
    conn.execute(sa.text("""
        INSERT INTO municipio_tramites (municipio_id, tramite_id, activo, orden, tiempo_estimado_dias, costo, requisitos, documentos_requeridos)
        SELECT tt.municipio_id, t.id, t.activo, t.orden, t.tiempo_estimado_dias, t.costo, t.requisitos, t.documentos_requeridos
        FROM tramites t
        JOIN tipos_tramites tt ON t.tipo_tramite_id = tt.id
        WHERE tt.municipio_id IS NOT NULL
    """))

    # 3. Eliminar duplicados en tipos_tramites manteniendo uno (el de menor ID)
    # Primero actualizar FKs de tramites apuntando a duplicados
    conn.execute(sa.text("""
        UPDATE tramites t
        SET tipo_tramite_id = (
            SELECT MIN(tt2.id)
            FROM tipos_tramites tt2
            WHERE tt2.nombre = (SELECT nombre FROM tipos_tramites WHERE id = t.tipo_tramite_id)
        )
        WHERE EXISTS (
            SELECT 1 FROM tipos_tramites tt3
            WHERE tt3.nombre = (SELECT nombre FROM tipos_tramites WHERE id = t.tipo_tramite_id)
            AND tt3.id < t.tipo_tramite_id
        )
    """))

    # Actualizar referencias en municipio_tipos_tramites
    conn.execute(sa.text("""
        UPDATE municipio_tipos_tramites mtt
        SET tipo_tramite_id = (
            SELECT MIN(tt2.id)
            FROM tipos_tramites tt2
            WHERE tt2.nombre = (SELECT nombre FROM tipos_tramites WHERE id = mtt.tipo_tramite_id)
        )
    """))

    # Eliminar tipos duplicados (mantener el de menor ID por nombre)
    conn.execute(sa.text("""
        DELETE FROM tipos_tramites
        WHERE id NOT IN (
            SELECT MIN(id) FROM tipos_tramites GROUP BY nombre
        )
    """))

    # 4. Quitar columna municipio_id de tipos_tramites (ya no es necesaria)
    op.drop_constraint('tipos_tramites_municipio_id_fkey', 'tipos_tramites', type_='foreignkey')
    op.drop_index('ix_tipos_tramites_municipio_id', 'tipos_tramites')
    op.drop_column('tipos_tramites', 'municipio_id')

    # 5. Agregar constraint unique a nombre en tipos_tramites
    op.create_unique_constraint('uq_tipos_tramites_nombre', 'tipos_tramites', ['nombre'])


def downgrade():
    # Revertir: Agregar municipio_id de vuelta a tipos_tramites
    op.add_column('tipos_tramites', sa.Column('municipio_id', sa.Integer(), nullable=True))
    op.create_foreign_key('tipos_tramites_municipio_id_fkey', 'tipos_tramites', 'municipios', ['municipio_id'], ['id'])
    op.create_index('ix_tipos_tramites_municipio_id', 'tipos_tramites', ['municipio_id'])

    # Restaurar municipio_id desde tabla intermedia (tomando el primero)
    conn = op.get_bind()
    conn.execute(sa.text("""
        UPDATE tipos_tramites tt
        SET municipio_id = (
            SELECT mtt.municipio_id
            FROM municipio_tipos_tramites mtt
            WHERE mtt.tipo_tramite_id = tt.id
            LIMIT 1
        )
    """))

    # Quitar unique constraint
    op.drop_constraint('uq_tipos_tramites_nombre', 'tipos_tramites', type_='unique')

    # Eliminar tablas intermedias
    op.drop_table('municipio_tramites')
    op.drop_table('municipio_tipos_tramites')
