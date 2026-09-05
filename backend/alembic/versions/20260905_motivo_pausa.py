"""reclamos.motivo_pausa: POR QUE quedo diferido un trabajo

El estado no cambia. `pospuesto` ya encuadra todo --"no lo pude resolver"
(dueno, 2026-09-05)-- y agregar estados por cada causa seria multiplicar el
ciclo de vida para expresar un atributo. Lo que faltaba es la RAZON, y
tipificada.

Hoy la razon existe: esta escrita en el comentario del historial, en frases
como "se difiere hasta la proxima licitacion de materiales", "frenado por el
temporal", "depende de una obra de la empresa de agua que todavia no tiene
fecha". Sirve perfecto para leer UN reclamo y no sirve para nada cuando la
pregunta es "cuantos estan frenados por materiales": obliga a recorrer todos
los reclamos y leer prosa en cada consulta. Con la columna indexada eso es un
GROUP BY.

Es el mismo patron que el repo ya usa para los rechazos (`rechazado` +
`motivo_rechazo`, enum): no se inventa una forma nueva, se copia la que esta.

`pausado_desde` no es decorativo: separa "se pospuso ayer" de "hace cuatro
meses que espera una compra". El motivo dice que pasa; la fecha, cuanto duele.

La lista de motivos es corta a proposito. Con veinte opciones, el que carga
elige "otro" siempre y el dato se muere.

OJO: `alembic_version` esta vacia en QA y en prod (2026-09-04). En QA las
columnas se agregaron con `scripts/migrate_motivo_pausa.py` (idempotente:
consulta SHOW COLUMNS antes de tocar). Infra puede correr ese mismo script
contra prod o aplicar este upgrade.

Revision ID: 20260905_mot_pausa
Revises: 20260905_cartogr
Create Date: 2026-09-05
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260905_mot_pausa"
down_revision: Union[str, None] = "20260905_cartogr"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

MOTIVOS = (
    "materiales",    # falta comprar, o no llego
    "clima",         # no se puede intervenir
    "tercero",       # empresa de agua, gas, cooperativa
    "otra_obra",     # para no romper dos veces
    "personal",      # no hay cuadrilla disponible
    "sin_acceso",    # no se pudo entrar al lugar
    "presupuesto",   # necesita partida o licitacion
    "otro",
)


def upgrade() -> None:
    op.add_column(
        "reclamos",
        sa.Column("motivo_pausa", sa.Enum(*MOTIVOS, name="motivopausa"), nullable=True),
    )
    op.add_column(
        "reclamos",
        sa.Column("pausado_desde", sa.DateTime(), nullable=True),
    )
    # Indice porque la pregunta que justifica la columna --"cuantos hay por
    # motivo"-- es una agregacion sobre toda la tabla del municipio.
    op.create_index("ix_reclamos_motivo_pausa", "reclamos", ["motivo_pausa"])


def downgrade() -> None:
    op.drop_index("ix_reclamos_motivo_pausa", table_name="reclamos")
    op.drop_column("reclamos", "pausado_desde")
    op.drop_column("reclamos", "motivo_pausa")
