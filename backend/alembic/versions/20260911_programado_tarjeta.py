"""El pago programado puede tener destino TARJETA, no solo contacto.

Hasta hoy un programado sabia hacer una sola cosa: generar un gasto a un
contacto y descontar la caja. San Pedro Norte quiso que la tarjeta "se pague
sola todos los 10" y, como no habia otra herramienta, agendo un contacto
"Visa" con un monto fijo: cada mes nacia un GASTO nuevo (las compras ya eran
gastos: plata contada dos veces) y la tarjeta nunca bajaba.

Lo que agrega:
  * `tesoreria_pagos_programados.tarjeta_caja_id`: la caja-tarjeta que paga.
    Con esto cargado, ejecutar el programado hace un PAGO DE TARJETA (ingreso
    en la tarjeta + egreso en la caja de origen, sin gasto) en vez de un gasto.
  * `contacto_id` y `monto_pesos` pasan a NULL permitido: un pago de tarjeta
    no tiene contacto, y sin monto significa "paga todo lo que deba ese dia".
  * `tesoreria_movimientos_caja.pago_programado_id`: el pago de tarjeta no
    tiene gasto, asi que el historial de la agenda lo encuentra por aca.

Revision ID: 20260911_prog_tarjeta
Revises: 20260908_curacion
Create Date: 2026-09-11
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260911_prog_tarjeta"
down_revision: Union[str, None] = "20260908_curacion"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLA_PP = "tesoreria_pagos_programados"
TABLA_MOV = "tesoreria_movimientos_caja"


def upgrade() -> None:
    op.alter_column(TABLA_PP, "contacto_id", existing_type=sa.Integer(), nullable=True)
    op.alter_column(TABLA_PP, "monto_pesos", existing_type=sa.Numeric(15, 2), nullable=True)
    op.add_column(TABLA_PP, sa.Column("tarjeta_caja_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_pp_tarjeta_caja", TABLA_PP, "tesoreria_cajas",
        ["tarjeta_caja_id"], ["id"], ondelete="SET NULL",
    )
    op.create_index("ix_tesoreria_pagos_programados_tarjeta_caja_id", TABLA_PP, ["tarjeta_caja_id"])

    op.add_column(TABLA_MOV, sa.Column("pago_programado_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_mov_caja_pago_programado", TABLA_MOV, TABLA_PP,
        ["pago_programado_id"], ["id"], ondelete="SET NULL",
    )
    op.create_index("ix_tesoreria_movimientos_caja_pago_programado_id", TABLA_MOV, ["pago_programado_id"])


def downgrade() -> None:
    op.drop_index("ix_tesoreria_movimientos_caja_pago_programado_id", table_name=TABLA_MOV)
    op.drop_constraint("fk_mov_caja_pago_programado", TABLA_MOV, type_="foreignkey")
    op.drop_column(TABLA_MOV, "pago_programado_id")

    op.drop_index("ix_tesoreria_pagos_programados_tarjeta_caja_id", table_name=TABLA_PP)
    op.drop_constraint("fk_pp_tarjeta_caja", TABLA_PP, type_="foreignkey")
    op.drop_column(TABLA_PP, "tarjeta_caja_id")
    # OJO: falla si quedaron programados de tarjeta (contacto/monto en NULL).
    # Hay que borrarlos o convertirlos antes de bajar esta migracion.
    op.alter_column(TABLA_PP, "monto_pesos", existing_type=sa.Numeric(15, 2), nullable=False)
    op.alter_column(TABLA_PP, "contacto_id", existing_type=sa.Integer(), nullable=False)
