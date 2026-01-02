"""Agregar tablas de gestion de empleados

Revision ID: 007_emp_tables
Revises: 006_add_tipos_tramites
Create Date: 2024-12-31

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '007_emp_tables'
down_revision: Union[str, None] = '006_tipos_tramites'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Tabla empleado_cuadrillas (relacion N:M entre empleados y cuadrillas)
    op.create_table(
        'empleado_cuadrillas',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('empleado_id', sa.Integer(), sa.ForeignKey('empleados.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('cuadrilla_id', sa.Integer(), sa.ForeignKey('cuadrillas.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('es_lider', sa.Boolean(), default=False),
        sa.Column('fecha_ingreso', sa.Date(), nullable=True),
        sa.Column('activo', sa.Boolean(), default=True),
    )

    # Tabla empleado_ausencias (vacaciones, licencias, etc)
    op.create_table(
        'empleado_ausencias',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('empleado_id', sa.Integer(), sa.ForeignKey('empleados.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('tipo', sa.String(50), nullable=False),  # vacaciones, licencia_medica, etc
        sa.Column('fecha_inicio', sa.Date(), nullable=False),
        sa.Column('fecha_fin', sa.Date(), nullable=False),
        sa.Column('motivo', sa.Text(), nullable=True),
        sa.Column('aprobado', sa.Boolean(), default=False),
        sa.Column('aprobado_por_id', sa.Integer(), sa.ForeignKey('usuarios.id'), nullable=True),
        sa.Column('fecha_aprobacion', sa.Date(), nullable=True),
        sa.Column('created_at', sa.Date(), nullable=True),
    )

    # Tabla empleado_horarios (horario por dia de semana)
    op.create_table(
        'empleado_horarios',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('empleado_id', sa.Integer(), sa.ForeignKey('empleados.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('dia_semana', sa.Integer(), nullable=False),  # 0=Lunes, 6=Domingo
        sa.Column('hora_entrada', sa.Time(), nullable=False),
        sa.Column('hora_salida', sa.Time(), nullable=False),
        sa.Column('activo', sa.Boolean(), default=True),
    )

    # Tabla empleado_metricas (performance mensual)
    op.create_table(
        'empleado_metricas',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('empleado_id', sa.Integer(), sa.ForeignKey('empleados.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('periodo', sa.Date(), nullable=False),  # Primer dia del mes
        sa.Column('reclamos_asignados', sa.Integer(), default=0),
        sa.Column('reclamos_resueltos', sa.Integer(), default=0),
        sa.Column('reclamos_rechazados', sa.Integer(), default=0),
        sa.Column('tiempo_promedio_respuesta', sa.Integer(), default=0),  # minutos
        sa.Column('tiempo_promedio_resolucion', sa.Integer(), default=0),  # minutos
        sa.Column('calificacion_promedio', sa.Float(), default=0.0),  # 1-5
        sa.Column('sla_cumplido_porcentaje', sa.Float(), default=0.0),  # 0-100
        sa.Column('created_at', sa.Date(), nullable=True),
    )

    # Tabla empleado_capacitaciones (cursos y certificaciones)
    op.create_table(
        'empleado_capacitaciones',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('empleado_id', sa.Integer(), sa.ForeignKey('empleados.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('nombre', sa.String(200), nullable=False),
        sa.Column('descripcion', sa.Text(), nullable=True),
        sa.Column('institucion', sa.String(200), nullable=True),
        sa.Column('fecha_inicio', sa.Date(), nullable=True),
        sa.Column('fecha_fin', sa.Date(), nullable=True),
        sa.Column('fecha_vencimiento', sa.Date(), nullable=True),
        sa.Column('certificado_url', sa.String(500), nullable=True),
        sa.Column('created_at', sa.Date(), nullable=True),
    )


def downgrade() -> None:
    op.drop_table('empleado_capacitaciones')
    op.drop_table('empleado_metricas')
    op.drop_table('empleado_horarios')
    op.drop_table('empleado_ausencias')
    op.drop_table('empleado_cuadrillas')
