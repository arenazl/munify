"""Initial migration - crear todas las tablas

Revision ID: 001_initial
Revises:
Create Date: 2024-12-14

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '001_initial'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ### Categorias ###
    op.create_table('categorias',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('nombre', sa.String(100), nullable=False),
        sa.Column('descripcion', sa.Text(), nullable=True),
        sa.Column('icono', sa.String(50), nullable=True),
        sa.Column('color', sa.String(7), nullable=True),
        sa.Column('ejemplos_reclamos', sa.Text(), nullable=True),
        sa.Column('tip_ayuda', sa.String(255), nullable=True),
        sa.Column('tiempo_resolucion_estimado', sa.Integer(), default=48),
        sa.Column('prioridad_default', sa.Integer(), default=3),
        sa.Column('activo', sa.Boolean(), default=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('nombre')
    )
    op.create_index('ix_categorias_id', 'categorias', ['id'])

    # ### Zonas ###
    op.create_table('zonas',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('nombre', sa.String(100), nullable=False),
        sa.Column('codigo', sa.String(20), nullable=True),
        sa.Column('descripcion', sa.Text(), nullable=True),
        sa.Column('lat_centro', sa.Float(), nullable=True),
        sa.Column('lng_centro', sa.Float(), nullable=True),
        sa.Column('activo', sa.Boolean(), default=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('nombre')
    )
    op.create_index('ix_zonas_id', 'zonas', ['id'])

    # ### Cuadrillas ###
    op.create_table('cuadrillas',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('nombre', sa.String(100), nullable=False),
        sa.Column('descripcion', sa.Text(), nullable=True),
        sa.Column('especialidad', sa.String(100), nullable=True),
        sa.Column('capacidad_maxima', sa.Integer(), default=5),
        sa.Column('activo', sa.Boolean(), default=True),
        sa.Column('zona_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['zona_id'], ['zonas.id']),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_cuadrillas_id', 'cuadrillas', ['id'])

    # ### Usuarios ###
    op.create_table('usuarios',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('email', sa.String(255), nullable=False),
        sa.Column('password_hash', sa.String(255), nullable=False),
        sa.Column('nombre', sa.String(100), nullable=False),
        sa.Column('apellido', sa.String(100), nullable=False),
        sa.Column('telefono', sa.String(20), nullable=True),
        sa.Column('dni', sa.String(20), nullable=True),
        sa.Column('direccion', sa.String(255), nullable=True),
        sa.Column('rol', sa.Enum('vecino', 'cuadrilla', 'supervisor', 'admin', name='rolusuario'), nullable=False),
        sa.Column('activo', sa.Boolean(), default=True),
        sa.Column('cuadrilla_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['cuadrilla_id'], ['cuadrillas.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('email')
    )
    op.create_index('ix_usuarios_id', 'usuarios', ['id'])
    op.create_index('ix_usuarios_email', 'usuarios', ['email'])

    # ### Reclamos ###
    op.create_table('reclamos',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('titulo', sa.String(200), nullable=False),
        sa.Column('descripcion', sa.Text(), nullable=False),
        sa.Column('estado', sa.Enum('nuevo', 'asignado', 'en_proceso', 'resuelto', 'rechazado', name='estadoreclamo'), nullable=False),
        sa.Column('prioridad', sa.Integer(), default=3),
        sa.Column('direccion', sa.String(255), nullable=False),
        sa.Column('latitud', sa.Float(), nullable=True),
        sa.Column('longitud', sa.Float(), nullable=True),
        sa.Column('referencia', sa.String(255), nullable=True),
        sa.Column('categoria_id', sa.Integer(), nullable=False),
        sa.Column('zona_id', sa.Integer(), nullable=True),
        sa.Column('creador_id', sa.Integer(), nullable=False),
        sa.Column('cuadrilla_id', sa.Integer(), nullable=True),
        sa.Column('fecha_programada', sa.Date(), nullable=True),
        sa.Column('hora_inicio', sa.Time(), nullable=True),
        sa.Column('hora_fin', sa.Time(), nullable=True),
        sa.Column('motivo_rechazo', sa.Enum('no_competencia', 'duplicado', 'info_insuficiente', 'fuera_jurisdiccion', 'otro', name='motivorechazo'), nullable=True),
        sa.Column('descripcion_rechazo', sa.Text(), nullable=True),
        sa.Column('resolucion', sa.Text(), nullable=True),
        sa.Column('fecha_resolucion', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['categoria_id'], ['categorias.id']),
        sa.ForeignKeyConstraint(['zona_id'], ['zonas.id']),
        sa.ForeignKeyConstraint(['creador_id'], ['usuarios.id']),
        sa.ForeignKeyConstraint(['cuadrilla_id'], ['cuadrillas.id']),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_reclamos_id', 'reclamos', ['id'])
    op.create_index('ix_reclamos_estado', 'reclamos', ['estado'])

    # ### Historial ###
    op.create_table('historial_reclamos',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('reclamo_id', sa.Integer(), nullable=False),
        sa.Column('usuario_id', sa.Integer(), nullable=False),
        sa.Column('accion', sa.String(50), nullable=False),
        sa.Column('estado_anterior', sa.Enum('nuevo', 'asignado', 'en_proceso', 'resuelto', 'rechazado', name='estadoreclamo'), nullable=True),
        sa.Column('estado_nuevo', sa.Enum('nuevo', 'asignado', 'en_proceso', 'resuelto', 'rechazado', name='estadoreclamo'), nullable=True),
        sa.Column('comentario', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(['reclamo_id'], ['reclamos.id']),
        sa.ForeignKeyConstraint(['usuario_id'], ['usuarios.id']),
        sa.PrimaryKeyConstraint('id')
    )

    # ### Documentos ###
    op.create_table('documentos',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('reclamo_id', sa.Integer(), nullable=False),
        sa.Column('nombre_original', sa.String(255), nullable=False),
        sa.Column('url', sa.String(500), nullable=False),
        sa.Column('tipo', sa.String(50), nullable=False),
        sa.Column('etapa', sa.String(50), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(['reclamo_id'], ['reclamos.id']),
        sa.PrimaryKeyConstraint('id')
    )

    # ### Notificaciones ###
    op.create_table('notificaciones',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('usuario_id', sa.Integer(), nullable=False),
        sa.Column('reclamo_id', sa.Integer(), nullable=True),
        sa.Column('titulo', sa.String(200), nullable=False),
        sa.Column('mensaje', sa.Text(), nullable=False),
        sa.Column('tipo', sa.String(50), nullable=False),
        sa.Column('leida', sa.Boolean(), default=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(['usuario_id'], ['usuarios.id']),
        sa.ForeignKeyConstraint(['reclamo_id'], ['reclamos.id']),
        sa.PrimaryKeyConstraint('id')
    )

    # ### Calificaciones ###
    op.create_table('calificaciones',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('reclamo_id', sa.Integer(), nullable=False),
        sa.Column('puntuacion', sa.Integer(), nullable=False),
        sa.Column('comentario', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(['reclamo_id'], ['reclamos.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('reclamo_id')
    )


def downgrade() -> None:
    op.drop_table('calificaciones')
    op.drop_table('notificaciones')
    op.drop_table('documentos')
    op.drop_table('historial_reclamos')
    op.drop_table('reclamos')
    op.drop_table('usuarios')
    op.drop_table('cuadrillas')
    op.drop_table('zonas')
    op.drop_table('categorias')

    # Drop enums
    op.execute('DROP TYPE IF EXISTS rolusuario')
    op.execute('DROP TYPE IF EXISTS estadoreclamo')
    op.execute('DROP TYPE IF EXISTS motivorechazo')
