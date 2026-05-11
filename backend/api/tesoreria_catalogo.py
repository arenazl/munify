"""Catalogos publicos del modulo Tesoreria.

- GET /tesoreria/conceptos  -> JSON con conceptos sugeridos (autocomplete)
"""
import json
from pathlib import Path

from fastapi import APIRouter, Depends

from core.security import get_current_user
from models import User

router = APIRouter()

_CONCEPTOS_PATH = Path(__file__).resolve().parent.parent / "data" / "conceptos_gasto.json"
_CONCEPTOS_CACHE = None


def _cargar_conceptos():
    global _CONCEPTOS_CACHE
    if _CONCEPTOS_CACHE is None:
        with open(_CONCEPTOS_PATH, encoding="utf-8") as f:
            _CONCEPTOS_CACHE = json.load(f)
    return _CONCEPTOS_CACHE


@router.get("/conceptos")
async def listar_conceptos(current_user: User = Depends(get_current_user)):
    """Catalogo de conceptos de gasto sugeridos.

    Estructura: { version, descripcion, grupos: [{ nombre, conceptos: [str] }] }

    El frontend lo usa para el autocomplete del wizard. El usuario puede
    elegir uno o escribir libre.
    """
    return _cargar_conceptos()
