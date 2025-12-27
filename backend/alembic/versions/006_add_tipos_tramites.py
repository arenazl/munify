"""Agregar tablas para sistema de trámites

Revision ID: 006_tipos_tramites
Revises: 005_emp_horario
Create Date: 2024-12-27

Estructura:
- tipos_tramites: Categorías (Obras Privadas, Comercio, etc.)
- tramites: Catálogo de trámites específicos
- solicitudes: Solicitudes de vecinos
- historial_solicitudes: Historial de cambios
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '006_tipos_tramites'
down_revision: Union[str, None] = '005_emp_horario'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Crear tabla tipos_tramites (categorías)
    op.create_table(
        'tipos_tramites',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('municipio_id', sa.Integer(), nullable=False),
        sa.Column('nombre', sa.String(200), nullable=False),
        sa.Column('descripcion', sa.Text(), nullable=True),
        sa.Column('codigo', sa.String(50), nullable=True),
        sa.Column('icono', sa.String(50), nullable=True),
        sa.Column('color', sa.String(20), nullable=True),
        sa.Column('activo', sa.Boolean(), default=True),
        sa.Column('orden', sa.Integer(), default=0),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['municipio_id'], ['municipios.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_tipos_tramites_id'), 'tipos_tramites', ['id'], unique=False)
    op.create_index(op.f('ix_tipos_tramites_municipio_id'), 'tipos_tramites', ['municipio_id'], unique=False)

    # Crear tabla tramites (catálogo)
    op.create_table(
        'tramites',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('tipo_tramite_id', sa.Integer(), nullable=False),
        sa.Column('nombre', sa.String(200), nullable=False),
        sa.Column('descripcion', sa.Text(), nullable=True),
        sa.Column('icono', sa.String(50), nullable=True),
        sa.Column('requisitos', sa.Text(), nullable=True),
        sa.Column('documentos_requeridos', sa.Text(), nullable=True),
        sa.Column('tiempo_estimado_dias', sa.Integer(), default=15),
        sa.Column('costo', sa.Float(), nullable=True),
        sa.Column('url_externa', sa.String(500), nullable=True),
        sa.Column('activo', sa.Boolean(), default=True),
        sa.Column('orden', sa.Integer(), default=0),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['tipo_tramite_id'], ['tipos_tramites.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_tramites_id'), 'tramites', ['id'], unique=False)
    op.create_index(op.f('ix_tramites_tipo_tramite_id'), 'tramites', ['tipo_tramite_id'], unique=False)

    # Crear tabla solicitudes
    op.create_table(
        'solicitudes',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('municipio_id', sa.Integer(), nullable=False),
        sa.Column('numero_tramite', sa.String(50), nullable=True),
        sa.Column('tramite_id', sa.Integer(), nullable=True),
        sa.Column('asunto', sa.String(300), nullable=False),
        sa.Column('descripcion', sa.Text(), nullable=True),
        sa.Column('estado', sa.Enum('INICIADO', 'EN_REVISION', 'REQUIERE_DOCUMENTACION', 'EN_PROCESO', 'APROBADO', 'RECHAZADO', 'FINALIZADO', name='estadosolicitud'), default='INICIADO', nullable=False),
        sa.Column('solicitante_id', sa.Integer(), nullable=True),
        sa.Column('nombre_solicitante', sa.String(100), nullable=True),
        sa.Column('apellido_solicitante', sa.String(100), nullable=True),
        sa.Column('dni_solicitante', sa.String(20), nullable=True),
        sa.Column('email_solicitante', sa.String(200), nullable=True),
        sa.Column('telefono_solicitante', sa.String(50), nullable=True),
        sa.Column('direccion_solicitante', sa.String(300), nullable=True),
        sa.Column('empleado_id', sa.Integer(), nullable=True),
        sa.Column('prioridad', sa.Integer(), default=3),
        sa.Column('respuesta', sa.Text(), nullable=True),
        sa.Column('observaciones', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('fecha_resolucion', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['municipio_id'], ['municipios.id'], ),
        sa.ForeignKeyConstraint(['tramite_id'], ['tramites.id'], ),
        sa.ForeignKeyConstraint(['solicitante_id'], ['usuarios.id'], ),
        sa.ForeignKeyConstraint(['empleado_id'], ['empleados.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_solicitudes_id'), 'solicitudes', ['id'], unique=False)
    op.create_index(op.f('ix_solicitudes_municipio_id'), 'solicitudes', ['municipio_id'], unique=False)
    op.create_index(op.f('ix_solicitudes_tramite_id'), 'solicitudes', ['tramite_id'], unique=False)
    op.create_index(op.f('ix_solicitudes_estado'), 'solicitudes', ['estado'], unique=False)
    op.create_index(op.f('ix_solicitudes_numero_tramite'), 'solicitudes', ['numero_tramite'], unique=True)

    # Crear tabla historial_solicitudes
    op.create_table(
        'historial_solicitudes',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('solicitud_id', sa.Integer(), nullable=False),
        sa.Column('usuario_id', sa.Integer(), nullable=True),
        sa.Column('estado_anterior', sa.Enum('INICIADO', 'EN_REVISION', 'REQUIERE_DOCUMENTACION', 'EN_PROCESO', 'APROBADO', 'RECHAZADO', 'FINALIZADO', name='estadosolicitud'), nullable=True),
        sa.Column('estado_nuevo', sa.Enum('INICIADO', 'EN_REVISION', 'REQUIERE_DOCUMENTACION', 'EN_PROCESO', 'APROBADO', 'RECHAZADO', 'FINALIZADO', name='estadosolicitud'), nullable=True),
        sa.Column('accion', sa.String(100), nullable=False),
        sa.Column('comentario', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['solicitud_id'], ['solicitudes.id'], ),
        sa.ForeignKeyConstraint(['usuario_id'], ['usuarios.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_historial_solicitudes_id'), 'historial_solicitudes', ['id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_historial_solicitudes_id'), table_name='historial_solicitudes')
    op.drop_table('historial_solicitudes')

    op.drop_index(op.f('ix_solicitudes_numero_tramite'), table_name='solicitudes')
    op.drop_index(op.f('ix_solicitudes_estado'), table_name='solicitudes')
    op.drop_index(op.f('ix_solicitudes_tramite_id'), table_name='solicitudes')
    op.drop_index(op.f('ix_solicitudes_municipio_id'), table_name='solicitudes')
    op.drop_index(op.f('ix_solicitudes_id'), table_name='solicitudes')
    op.drop_table('solicitudes')

    op.drop_index(op.f('ix_tramites_tipo_tramite_id'), table_name='tramites')
    op.drop_index(op.f('ix_tramites_id'), table_name='tramites')
    op.drop_table('tramites')

    op.drop_index(op.f('ix_tipos_tramites_municipio_id'), table_name='tipos_tramites')
    op.drop_index(op.f('ix_tipos_tramites_id'), table_name='tipos_tramites')
    op.drop_table('tipos_tramites')

    # Drop enum type
    op.execute("DROP TYPE IF EXISTS estadosolicitud")
