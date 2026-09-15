# -*- coding: utf-8 -*-
"""Una tarjeta de credito es UNA sola cosa: la caja. Se va la tabla paralela.

QUE HABIA. Dos entidades para el mismo objeto del mundo real:

  * `tesoreria_cajas` con `codigo = 'TARJETA'` — la tarjeta DE VERDAD: ahi se
    acumula la deuda (por sus movimientos), de ahi la lee el wizard de gastos y
    sobre esa se registra el pago del resumen.
  * `tarjetas_credito` — una ETIQUETA: marca, ultimos cuatro, dia de cierre, y
    nada mas. No movia un peso. `gastos.tarjeta_credito_id` la referenciaba.

Convivir fue el bug, no un detalle de modelado: en San Pedro Norte (2026-08-28)
el municipio cargaba su Visa en la pantalla de tarjetas y dos pasos despues el
wizard le decia que no tenia ninguna, porque la caja no existia. La misma
tarjeta habia que darla de alta en dos lugares distintos.

QUE HACE ESTA MIGRACION. Deja una sola: la caja.
  1. Antes de borrar nada, deja asentado en el gasto de que tarjeta se trataba
     (`observaciones`), para los que tenian la etiqueta y podrian perder el dato.
  2. Borra la FK y la columna `gastos.tarjeta_credito_id`.
  3. Borra la tabla `tarjetas_credito`.

La identidad de la tarjeta (marca y ultimos cuatro) vive en el NOMBRE de la
caja, con el formato que ya usa y desarma la pantalla: "Visa ····9594".

El downgrade recrea la tabla y la columna VACIAS: la etiqueta era redundante y
no se puede reconstruir el vinculo. Es una vuelta atras de esquema, no de datos.

EL ORDEN IMPORTA, Y NO ES EL DE COSTUMBRE: PRIMERO EL CODIGO, DESPUES ESTA
MIGRACION. El ORM viejo declara `tarjeta_credito_id`, asi que lo pide en CADA
select de Gasto: si la columna ya no esta, el modulo de gastos devuelve 500
entero. Comprobado en QA el 2026-09-15 -se corrio la migracion contra el backend
sin actualizar y `GET /tesoreria/gastos` se cayo con "Unknown column"-. En
produccion: deploy de Cloud Run primero, `alembic upgrade` despues.

Revision ID: 20260915_tarjeta_unica
Revises: 20260912_fecha_prog
Create Date: 2026-09-15
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260915_tarjeta_unica"
down_revision: Union[str, None] = "20260912_fecha_prog"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _existe_tabla(conn, tabla: str) -> bool:
    return sa.inspect(conn).has_table(tabla)


def _existe_columna(conn, tabla: str, col: str) -> bool:
    if not _existe_tabla(conn, tabla):
        return False
    return col in {c["name"] for c in sa.inspect(conn).get_columns(tabla)}


def upgrade() -> None:
    conn = op.get_bind()

    if _existe_columna(conn, "gastos", "tarjeta_credito_id"):
        # 1. El dato antes que la columna: si el gasto tenia etiqueta y la
        #    tarjeta todavia existe, queda escrito en el propio gasto. Un
        #    municipio no deberia perder informacion porque nosotros ordenamos
        #    el modelo.
        if _existe_tabla(conn, "tarjetas_credito"):
            conn.execute(sa.text("""
                UPDATE gastos g
                  JOIN tarjetas_credito t ON t.id = g.tarjeta_credito_id
                   SET g.observaciones = TRIM(CONCAT(
                        COALESCE(g.observaciones, ''),
                        CASE WHEN COALESCE(g.observaciones, '') = '' THEN '' ELSE ' · ' END,
                        'Tarjeta: ', t.denominacion))
                 WHERE g.tarjeta_credito_id IS NOT NULL
            """))

        # 2. La FK se llama distinto segun como se creo la columna (migracion
        #    ad-hoc en unos ambientes, ORM en otros): se busca, no se adivina.
        for fk in sa.inspect(conn).get_foreign_keys("gastos"):
            if fk.get("constrained_columns") == ["tarjeta_credito_id"] and fk.get("name"):
                op.drop_constraint(fk["name"], "gastos", type_="foreignkey")
        for idx in sa.inspect(conn).get_indexes("gastos"):
            if idx.get("column_names") == ["tarjeta_credito_id"] and idx.get("name"):
                op.drop_index(idx["name"], table_name="gastos")
        op.drop_column("gastos", "tarjeta_credito_id")

    # 3. La tabla paralela
    if _existe_tabla(conn, "tarjetas_credito"):
        op.drop_table("tarjetas_credito")


def downgrade() -> None:
    conn = op.get_bind()

    if not _existe_tabla(conn, "tarjetas_credito"):
        op.create_table(
            "tarjetas_credito",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("municipio_id", sa.Integer(), nullable=False, index=True),
            sa.Column("denominacion", sa.String(length=120), nullable=False),
            sa.Column("marca", sa.String(length=40), nullable=True),
            sa.Column("ultimos_4", sa.String(length=4), nullable=True),
            sa.Column("dia_cierre", sa.Integer(), nullable=True),
            sa.Column("activo", sa.Boolean(), nullable=False, server_default=sa.text("1")),
            sa.Column("orden", sa.Integer(), nullable=False, server_default=sa.text("0")),
            sa.Column("created_at", sa.DateTime(), nullable=True),
        )

    if not _existe_columna(conn, "gastos", "tarjeta_credito_id"):
        op.add_column("gastos", sa.Column("tarjeta_credito_id", sa.Integer(), nullable=True))
        op.create_index("ix_gastos_tarjeta_credito_id", "gastos", ["tarjeta_credito_id"])
        op.create_foreign_key(
            "fk_gastos_tarjeta_credito", "gastos", "tarjetas_credito",
            ["tarjeta_credito_id"], ["id"], ondelete="SET NULL",
        )
