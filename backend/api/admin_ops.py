"""Módulo admin de operaciones de datos — el "circuito nuevo".

PRINCIPIO DURO: ningún agente/máquina le pega a la DB directo. Toda operación que
toca datos (migraciones de schema, backfills, diagnósticos) se dispara por HTTP
contra ESTE endpoint, que corre dentro del backend ya deployado en su ambiente
(qa->`sugerenciasmun-qa`, prod->`sugerenciasmun`). Así es imposible apuntar mal el
connection string, y encima corre en us-east4 al lado de la DB.

Piezas:
  - GET  /admin/ambiente : health + guardarraíl (marcador `_ambiente` vs DB real).
  - GET  /admin/ops      : lista de operaciones registradas + su metadata.
  - POST /admin/ops      : dispatcher ÚNICO. Recibe {op, mode, params} y ejecuta
                           una operación registrada. NO recibe código: solo el
                           IDENTIFICADOR de una op que ya vive deployada acá
                           (mandar código sería ejecución remota arbitraria).

Auth (MVP): JWT de super admin (municipio_id NULL). El `ADMIN_OPS_KEY` dedicado
queda como hardening para cuando Infra lo monte en Secret Manager.

Migraciones de schema = Alembic (ya instalado y async en el repo). Se exponen por
su command API (upgrade/downgrade/current/stamp), corridas en un thread aparte
porque el `env.py` de Alembic hace `asyncio.run()` y no puede anidarse dentro del
event loop async de FastAPI.
"""
from __future__ import annotations

import contextlib
import io
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Optional

import anyio
from alembic import command
from alembic.config import Config
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from core.audit_helpers import require_super_admin
from core.database import get_db

router = APIRouter(prefix="/admin", tags=["Admin Ops"])

BACKEND_DIR = Path(__file__).resolve().parent.parent
ALEMBIC_INI = BACKEND_DIR / "alembic.ini"

# Nombres de DB conocidos por ambiente. Fallback SOLO cuando el marcador
# `_ambiente` no está sembrado; la fuente de verdad es el marcador (doble check).
DB_PROD = "sugerenciasmun"
DB_QA = "sugerenciasmun-qa"


# ============================================================
# Guardarraíl de ambiente (tabla marcador `_ambiente` + DB real)
# ============================================================
DDL_AMBIENTE = """
CREATE TABLE IF NOT EXISTS _ambiente (
    id INT AUTO_INCREMENT PRIMARY KEY,
    entorno VARCHAR(20) NOT NULL,
    db_name_esperado VARCHAR(100) NOT NULL,
    nota VARCHAR(255) NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
"""


def _inferir_entorno(db_name: str) -> str:
    """Inferencia por nombre de DB. Fallback del marcador, no la fuente de verdad."""
    if db_name == DB_QA or (db_name and db_name.endswith("-qa")):
        return "qa"
    if db_name == DB_PROD:
        return "prod"
    return "desconocido"


async def _db_name(session: AsyncSession) -> str:
    return (await session.execute(text("SELECT DATABASE()"))).scalar() or ""


async def _leer_marcador(session: AsyncSession) -> Optional[dict]:
    """Devuelve el marcador `_ambiente` (crea la tabla si falta). None si vacío."""
    await session.execute(text(DDL_AMBIENTE))
    await session.commit()
    row = (await session.execute(text(
        "SELECT entorno, db_name_esperado, nota FROM _ambiente ORDER BY id LIMIT 1"
    ))).mappings().first()
    return dict(row) if row else None


@dataclass
class EstadoAmbiente:
    db_name: str
    entorno_inferido: str
    entorno_marcador: Optional[str]
    db_esperado_marcador: Optional[str]
    sembrado: bool
    coherente: bool


async def _estado_ambiente(session: AsyncSession) -> EstadoAmbiente:
    db = await _db_name(session)
    inferido = _inferir_entorno(db)
    marcador = await _leer_marcador(session)
    ent_m = marcador["entorno"] if marcador else None
    db_esp = marcador["db_name_esperado"] if marcador else None
    # coherente = marcador presente Y coincide con la DB real Y no contradice lo inferido.
    coherente = bool(marcador) and db_esp == db and inferido in (ent_m, "desconocido")
    return EstadoAmbiente(db, inferido, ent_m, db_esp, bool(marcador), coherente)


def _exigir_ambiente_para_mutar(est: EstadoAmbiente, confirmar_prod: bool) -> None:
    """Aborta si el ambiente no está sembrado/coherente, o si es prod sin confirmar."""
    if not est.sembrado:
        raise HTTPException(409, f"Ambiente NO sembrado (`_ambiente` vacío) — no sé dónde "
                                 f"estoy parado (DB real: {est.db_name}). Sembrá el marcador "
                                 f"(op ambiente:sembrar) antes de mutar.")
    if not est.coherente:
        raise HTTPException(409, f"Marcador `_ambiente` INCOHERENTE con la DB real: marcador dice "
                                 f"{est.entorno_marcador}/{est.db_esperado_marcador}, DB real es "
                                 f"{est.db_name} ({est.entorno_inferido}). Abortado por seguridad.")
    if est.entorno_marcador == "prod" and not confirmar_prod:
        raise HTTPException(423, "Es PROD: pasá confirmar_prod=true para ejecutar una op que muta.")


# ============================================================
# Alembic runner (command API en thread aparte)
# ============================================================
def _alembic_cfg() -> Config:
    cfg = Config(str(ALEMBIC_INI))
    cfg.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    return cfg


def _run_alembic_sync(fn: Callable, *args, **kwargs) -> str:
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf), contextlib.redirect_stderr(buf):
        fn(_alembic_cfg(), *args, **kwargs)
    return buf.getvalue().strip()


async def _alembic(fn: Callable, *args, **kwargs) -> str:
    """Corre un `alembic.command.*` en un thread (sin event loop), capturando salida."""
    return await anyio.to_thread.run_sync(lambda: _run_alembic_sync(fn, *args, **kwargs))


# ============================================================
# Diagnósticos read-only
# ============================================================
async def _check_schema(session: AsyncSession) -> dict:
    """Verifica tablas/columnas clave del refactor Reclamos (existen sí/no)."""
    checks: dict[str, bool] = {}
    for tabla in ("poi_tipos", "puntos_interes", "ordenes_trabajo", "historial_ordenes_trabajo"):
        n = (await session.execute(text(
            "SELECT COUNT(*) FROM information_schema.tables "
            "WHERE table_schema = DATABASE() AND table_name = :t"), {"t": tabla})).scalar()
        checks[f"tabla:{tabla}"] = bool(n)
    for tabla, col in (("reclamos", "poi_id"), ("ordenes_trabajo", "poi_id")):
        n = (await session.execute(text(
            "SELECT COUNT(*) FROM information_schema.columns "
            "WHERE table_schema = DATABASE() AND table_name = :t AND column_name = :c"),
            {"t": tabla, "c": col})).scalar()
        checks[f"col:{tabla}.{col}"] = bool(n)
    return checks


async def _op_sembrar_ambiente(session: AsyncSession, params: dict, est: EstadoAmbiente) -> dict:
    """Siembra el marcador `_ambiente` UNA vez. Rechaza si el entorno pedido no
    coincide con lo que la DB real aparenta (no dejar sembrar 'qa' en la DB de prod)."""
    entorno = (params or {}).get("entorno")
    if entorno not in ("qa", "prod"):
        raise HTTPException(400, "params.entorno debe ser 'qa' o 'prod'.")
    if est.sembrado:
        raise HTTPException(409, f"Ya sembrado como '{est.entorno_marcador}'. No re-siembro.")
    if est.entorno_inferido != "desconocido" and entorno != est.entorno_inferido:
        raise HTTPException(409, f"Querés sembrar '{entorno}' pero la DB real ({est.db_name}) "
                                 f"aparenta '{est.entorno_inferido}'. Abortado.")
    await session.execute(text(
        "INSERT INTO _ambiente (entorno, db_name_esperado, nota) VALUES (:e, :d, :n)"
    ), {"e": entorno, "d": est.db_name, "n": "sembrado via /admin/ops"})
    await session.commit()
    return {"sembrado": entorno, "db_name": est.db_name}


# ============================================================
# Registry + dispatcher
# ============================================================
@dataclass
class OpMeta:
    kind: str      # "diagnostic" (read-only) | "migration" | "ambiente"
    muta: bool
    descripcion: str


OPS: dict[str, OpMeta] = {
    "ambiente:sembrar":  OpMeta("ambiente", True, "Siembra el marcador `_ambiente` (una sola vez)."),
    "alembic:current":   OpMeta("diagnostic", False, "Revisión actual de Alembic en la DB."),
    "alembic:history":   OpMeta("diagnostic", False, "Historial de revisiones."),
    "alembic:heads":     OpMeta("diagnostic", False, "Heads del árbol de revisiones."),
    "alembic:upgrade":   OpMeta("migration", True, "Aplica migraciones hasta params.revision (default 'head')."),
    "alembic:downgrade": OpMeta("migration", True, "Revierte hasta params.revision (default '-1')."),
    "alembic:stamp":     OpMeta("migration", True, "Marca la DB en params.revision SIN correr DDL (reconciliar)."),
    "check:schema":      OpMeta("diagnostic", False, "Verifica tablas/columnas clave del refactor Reclamos."),
}


class OpRequest(BaseModel):
    op: str
    mode: str = "plan"                                   # "plan" | "apply"
    params: dict[str, Any] = Field(default_factory=dict)
    confirmar_prod: bool = False


@router.get("/ambiente")
async def get_ambiente(
    session: AsyncSession = Depends(get_db),
    _: Any = Depends(require_super_admin),
):
    est = await _estado_ambiente(session)
    return {
        "db_name": est.db_name,
        "entorno_inferido": est.entorno_inferido,
        "entorno_marcador": est.entorno_marcador,
        "db_esperado_marcador": est.db_esperado_marcador,
        "sembrado": est.sembrado,
        "coherente": est.coherente,
    }


@router.get("/ops")
async def list_ops(_: Any = Depends(require_super_admin)):
    return {k: {"kind": v.kind, "muta": v.muta, "descripcion": v.descripcion} for k, v in OPS.items()}


@router.post("/ops")
async def run_op(
    req: OpRequest,
    session: AsyncSession = Depends(get_db),
    _: Any = Depends(require_super_admin),
):
    meta = OPS.get(req.op)
    if not meta:
        raise HTTPException(404, f"Op desconocida: {req.op}. Ver GET /admin/ops.")

    est = await _estado_ambiente(session)

    # Guardarraíl solo para ops que mutan (ambiente:sembrar tiene su propia validación).
    if meta.muta and req.op != "ambiente:sembrar":
        _exigir_ambiente_para_mutar(est, req.confirmar_prod)

    # --- diagnósticos read-only ---
    if req.op == "alembic:current":
        return {"op": req.op, "salida": await _alembic(command.current, verbose=True)}
    if req.op == "alembic:history":
        return {"op": req.op, "salida": await _alembic(command.history, verbose=False)}
    if req.op == "alembic:heads":
        return {"op": req.op, "salida": await _alembic(command.heads, verbose=True)}
    if req.op == "check:schema":
        return {"op": req.op, "resultado": await _check_schema(session)}

    # --- siembra del marcador ---
    if req.op == "ambiente:sembrar":
        return {"op": req.op, "resultado": await _op_sembrar_ambiente(session, req.params, est)}

    # --- migraciones (mutan; ya pasaron el guardarraíl) ---
    if req.op == "alembic:upgrade":
        rev = req.params.get("revision", "head")
        if req.mode != "apply":
            return {"op": req.op, "mode": "plan", "revision_objetivo": rev,
                    "current": await _alembic(command.current),
                    "heads": await _alembic(command.heads),
                    "nota": "mode=plan: nada aplicado. Reenviá con mode='apply' para ejecutar."}
        return {"op": req.op, "mode": "apply", "salida": await _alembic(command.upgrade, rev)}

    if req.op == "alembic:downgrade":
        rev = req.params.get("revision", "-1")
        if req.mode != "apply":
            return {"op": req.op, "mode": "plan", "revision_objetivo": rev,
                    "current": await _alembic(command.current),
                    "nota": "mode=plan: nada revertido. Reenviá con mode='apply' para ejecutar."}
        return {"op": req.op, "mode": "apply", "salida": await _alembic(command.downgrade, rev)}

    if req.op == "alembic:stamp":
        rev = req.params.get("revision")
        if not rev:
            raise HTTPException(400, "params.revision requerido para stamp.")
        if req.mode != "apply":
            return {"op": req.op, "mode": "plan", "revision_objetivo": rev,
                    "nota": "mode=plan: no stampeado. stamp NO corre DDL, solo marca "
                            "alembic_version. Reenviá con mode='apply' para ejecutar."}
        return {"op": req.op, "mode": "apply", "salida": await _alembic(command.stamp, rev)}

    raise HTTPException(500, f"Op {req.op} registrada pero sin implementación.")
