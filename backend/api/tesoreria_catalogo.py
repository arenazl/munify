"""Catalogos publicos del modulo Tesoreria.

- GET /tesoreria/conceptos  -> JSON con conceptos sugeridos (autocomplete)

Estrategia: si el muni tiene tipos de concepto cargados en la DB
(tesoreria_tipos_concepto), devuelve eso. Sino, fallback al JSON
hardcodeado `data/conceptos_gasto.json` (compatibilidad hacia atras
para munis que aun no migraron al catalogo per-muni).
"""
import json
from pathlib import Path

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.security import get_current_user
from core.tenancy import get_effective_municipio_id
from models import User, TesoreriaTipoConcepto

router = APIRouter()

_CONCEPTOS_PATH = Path(__file__).resolve().parent.parent / "data" / "conceptos_gasto.json"
_CONCEPTOS_CACHE = None


def _cargar_conceptos_fallback():
    global _CONCEPTOS_CACHE
    if _CONCEPTOS_CACHE is None:
        with open(_CONCEPTOS_PATH, encoding="utf-8") as f:
            _CONCEPTOS_CACHE = json.load(f)
    return _CONCEPTOS_CACHE


@router.get("/conceptos")
async def listar_conceptos(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Catalogo de conceptos de gasto para el wizard.

    Estructura: { version, descripcion, grupos: [{ nombre, conceptos: [str] }] }
    """
    municipio_id = get_effective_municipio_id(request, current_user)

    # Intentar leer de la DB
    q = (
        select(TesoreriaTipoConcepto)
        .options(selectinload(TesoreriaTipoConcepto.conceptos))
        .where(
            TesoreriaTipoConcepto.municipio_id == municipio_id,
            TesoreriaTipoConcepto.activo == True,  # noqa: E712
        )
        .order_by(TesoreriaTipoConcepto.orden, TesoreriaTipoConcepto.nombre)
    )
    tipos = (await db.execute(q)).scalars().unique().all()

    if tipos:
        grupos = []
        for t in tipos:
            conceptos = [c.nombre for c in (t.conceptos or []) if c.activo]
            if conceptos:
                grupos.append({"nombre": t.nombre, "conceptos": conceptos})
        if grupos:
            return {"version": 2, "descripcion": f"Catalogo per-muni (muni {municipio_id})", "grupos": grupos}

    # Fallback al JSON
    return _cargar_conceptos_fallback()
