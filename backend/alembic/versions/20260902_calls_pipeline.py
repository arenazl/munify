"""Directorio de llamados: usuarios, pipeline compartido e historial

Hasta ahora `/calls` era una pagina publica y todo lo que se anotaba vivia en el
`localStorage` de cada navegador. Dos personas llamando a los mismos 154
municipios no veian nada la una de la otra. Estas tablas son el pipeline
compartido, con login.

El prefijo `calls_` esta acordado con Infra: se EXCLUYE cuando se refresca la
base de QA clonando produccion, porque es data comercial del dueño y no data de
municipios.

Revision ID: 20260902_calls
Revises: 20260901_ia_uso
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260902_calls"
down_revision: Union[str, None] = "20260901_ia_uso"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "calls_usuarios",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("usuario", sa.String(length=40), nullable=False),
        sa.Column("nombre", sa.String(length=60), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("activo", sa.Boolean(), nullable=False, server_default=sa.text("1")),
        sa.Column("creado", sa.DateTime(), nullable=False),
        sa.Column("ultimo_acceso", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("usuario"),
    )

    op.create_table(
        "calls_registro",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        # El id del directorio (`pais-localidad`), no un FK: los 154 municipios
        # del relevamiento comercial NO son los tenants de la app.
        sa.Column("muni_key", sa.String(length=80), nullable=False),
        sa.Column("estado", sa.String(length=30), nullable=False, server_default=""),
        sa.Column("notas", sa.Text(), nullable=True),
        sa.Column("quien", sa.String(length=120), nullable=True),
        sa.Column("proximo", sa.Date(), nullable=True),
        sa.Column("actualizado_por", sa.String(length=60), nullable=True),
        sa.Column("actualizado_en", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("muni_key"),
    )

    op.create_table(
        "calls_evento",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("muni_key", sa.String(length=80), nullable=False),
        sa.Column("tipo", sa.String(length=20), nullable=False),
        sa.Column("texto", sa.Text(), nullable=False),
        sa.Column("autor", sa.String(length=60), nullable=False),
        sa.Column("creado", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_calls_evento_muni_key", "calls_evento", ["muni_key"])
    op.create_index("ix_calls_evento_creado", "calls_evento", ["creado"])
    op.create_index("ix_calls_evento_muni_creado", "calls_evento", ["muni_key", "creado"])


def downgrade() -> None:
    op.drop_table("calls_evento")
    op.drop_table("calls_registro")
    op.drop_table("calls_usuarios")
