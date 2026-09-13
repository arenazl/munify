"""El pago programado puede ser AUTOMATICO o con aprobacion previa.

Hasta hoy un pago programado es un RECORDATORIO: aparece vencido en la agenda y
alguien lo confirma. Eso esta bien y sigue siendo el default —la plata no sale
sin que una persona mire—, pero hay pagos que no necesitan esa mirada todos los
meses: el resumen de la tarjeta es el caso claro, porque el monto no lo decide
nadie, lo decide lo que se gasto.

Dueño, 2026-09-12: *"el pago programado es un recordatorio, no es un pago
automatico... deberia haber dos tipos, el automatico y el de previa aprobacion.
Que el default sea lo que tenemos hoy"*.

`modo_ejecucion`:
  aprobacion  (default) como siempre: vence, aparece en la agenda, alguien lo
              confirma.
  automatico  lo ejecuta el sistema cuando vence, sin que nadie apriete.

Revision ID: 20260912_modo_ejec
Revises: 20260911_prog_tarjeta
Create Date: 2026-09-12
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260912_modo_ejec"
down_revision: Union[str, None] = "20260911_prog_tarjeta"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLA = "tesoreria_pagos_programados"


def upgrade() -> None:
    op.add_column(TABLA, sa.Column(
        "modo_ejecucion",
        sa.Enum("aprobacion", "automatico", name="modoejecucionpago"),
        nullable=False,
        server_default="aprobacion",
    ))
    # Cuando el sistema ejecuta uno solo, queda la marca de que no lo confirmo
    # una persona: sirve para auditar y para que la pantalla lo distinga.
    op.add_column(TABLA, sa.Column("ejecutado_auto_en", sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column(TABLA, "ejecutado_auto_en")
    op.drop_column(TABLA, "modo_ejecucion")
