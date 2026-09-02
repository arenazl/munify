"""Telemetria de IA: ia_uso + ia_uso_diario

Una fila por llamada a la IA (sin prompts ni respuestas: solo el consumo) y su
agregado diario. Nace del pedido del dueño el 2026-09-01: armar la estructura
para encontrar el punto dulce tokens/modelo/performance ANTES de que crezcan
los clientes.

Diseñada con la advertencia de Infra a la vista (`audit_logs` llego a 140 MB de
231 y obligo a vaciar la base): la fila pesa ~120 bytes, no guarda payloads, el
detalle se poda a los 90 dias y lo que queda para siempre es el agregado. Con
el volumen de 2026 son ~9 MB al año.

Revision ID: 20260901_ia_uso
Revises: 20260825_seedlogs
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260901_ia_uso"
down_revision: Union[str, None] = "20260825_seedlogs"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "ia_uso",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("creado", sa.DateTime(), nullable=False),
        # Sin FK a municipios a proposito: /calls no pertenece a ningun
        # municipio, y una tabla de telemetria no tiene por que bloquear el
        # borrado de un tenant.
        sa.Column("municipio_id", sa.Integer(), nullable=True),
        sa.Column("feature", sa.String(length=40), nullable=False),
        sa.Column("modelo", sa.String(length=60), nullable=False),
        sa.Column("prompt_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("completion_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("reasoning_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("latencia_ms", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("finish_reason", sa.String(length=20), nullable=True),
        sa.Column("respuesta_vacia", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        sa.Column("error_http", sa.Integer(), nullable=True),
        sa.Column("cayo_a_fallback", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        sa.Column("ratelimit_remaining_requests", sa.Integer(), nullable=True),
        sa.Column("ratelimit_remaining_tokens", sa.Integer(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_ia_uso_creado", "ia_uso", ["creado"])
    op.create_index("ix_ia_uso_municipio_id", "ia_uso", ["municipio_id"])
    op.create_index("ix_ia_uso_feature", "ia_uso", ["feature"])
    op.create_index("ix_ia_uso_feature_creado", "ia_uso", ["feature", "creado"])
    op.create_index("ix_ia_uso_muni_creado", "ia_uso", ["municipio_id", "creado"])

    op.create_table(
        "ia_uso_diario",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("fecha", sa.Date(), nullable=False),
        sa.Column("municipio_id", sa.Integer(), nullable=True),
        sa.Column("feature", sa.String(length=40), nullable=False),
        sa.Column("modelo", sa.String(length=60), nullable=False),
        sa.Column("llamadas", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("prompt_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("completion_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("reasoning_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("latencia_p50_ms", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("latencia_p95_ms", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("vacias", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("errores", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("fallbacks", sa.Integer(), nullable=False, server_default="0"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_ia_uso_diario_fecha", "ia_uso_diario", ["fecha"])
    op.create_index("ix_ia_uso_diario_municipio_id", "ia_uso_diario", ["municipio_id"])
    op.create_index(
        "ix_ia_uso_diario_clave",
        "ia_uso_diario",
        ["fecha", "municipio_id", "feature", "modelo"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_table("ia_uso_diario")
    op.drop_table("ia_uso")
