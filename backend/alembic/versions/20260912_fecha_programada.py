"""Guardar la fecha PROGRAMADA junto a la de imputacion.

Un pago que vencia el 10 y se confirma el 20 tiene tres fechas distintas y
hasta ahora solo se guardaban dos:

  * programada  cuando estaba previsto que se pagara (el 10). NO se guardaba.
  * imputacion  con que fecha impacta en la caja y en los reportes. Es `fecha`.
  * registro    cuando alguien lo cargo de verdad (el 20). Es `created_at`.

Hoy la de imputacion y la programada coinciden —se imputa con la del
vencimiento— pero son dos conceptos distintos: si alguna vez se imputa con otra
fecha, la programada se perderia. Dueño, 2026-09-12: *"debe grabar fecha
programada y fecha de imputacion, siempre"*.

Revision ID: 20260912_fecha_prog
Revises: 20260912_modo_ejec
Create Date: 2026-09-12
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260912_fecha_prog"
down_revision: Union[str, None] = "20260912_modo_ejec"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("tesoreria_movimientos_caja", sa.Column("fecha_programada", sa.Date(), nullable=True))
    op.add_column("gastos", sa.Column("fecha_programada", sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column("gastos", "fecha_programada")
    op.drop_column("tesoreria_movimientos_caja", "fecha_programada")
