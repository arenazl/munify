"""municipios_catalogo.cartografiado: dibujar los barrios, o solo el contorno

Decision del dueño (2026-09-03, textual): *"O tenemos el cien por ciento del
municipio con poligonos o mostramos solamente el contorno del municipio... asi
de restrictivo. No sirve mostrar en un mapa que tenes veinte barrios, cuatro
bien dibujados y el resto no"*. Con el matiz: *"si le falta uno y son tres, no;
si le faltan dos y son catorce, si"*.

La decision se toma OFFLINE, una vez, y queda escrita en la fila del municipio:
el backend y la pantalla solo leen la columna, no vuelven a contar poligonos.
Quien la calcula y la escribe es `scripts/geo/marcar_cartografiado.py`, que
tiene la vara en dos constantes (85 % de las filas hoja con contorno, y al
menos 5 filas hoja). `motivo_cartografiado` guarda el porque en texto llano
("38/47 dibujados (81 %)", "sin barrios") para poder mostrarlo sin recalcular.

Esta migracion SOLO crea las columnas, con el default 0 (= dibujar nada mas el
contorno, que es el comportamiento conservador). Rellenarlas es correr el
script, o copiar la tabla ya marcada desde QA.

OJO: `alembic_version` esta vacia en QA y en prod (2026-09-04). En QA las
columnas se agregaron con el propio script (`asegurar_columnas`, idempotente
contra information_schema); Infra puede hacer lo mismo en prod, o aplicar este
upgrade.

Revision ID: 20260905_cartogr
Revises: 20260904_blindaje
Create Date: 2026-09-05
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260905_cartogr"
down_revision: Union[str, None] = "20260904_blindaje"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "municipios_catalogo",
        sa.Column("cartografiado", sa.Boolean(), nullable=False, server_default=sa.text("0")),
    )
    op.add_column(
        "municipios_catalogo",
        sa.Column("motivo_cartografiado", sa.String(length=120), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("municipios_catalogo", "motivo_cartografiado")
    op.drop_column("municipios_catalogo", "cartografiado")
