"""Proxy / cache para cotizacion USD/ARS.

Fuente: Bluelytics (gratuito, sin API key) - https://bluelytics.com.ar
Endpoint: GET https://api.bluelytics.com.ar/v2/latest

Cache server-side de 1 hora para no pegarle por cada gasto cargado.
"""
from datetime import date
from decimal import Decimal
import time
from typing import Any, Optional

import httpx
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.security import get_current_user
from models import User
from schemas.tesoreria import CotizacionUSDResponse

router = APIRouter()

BLUELYTICS_URL = "https://api.bluelytics.com.ar/v2/latest"
USER_AGENT = "MunifyTesoreria/1.0"

# Cache en memoria { 'latest': (ts, data) }
_cache: dict[str, tuple[float, Any]] = {}
CACHE_TTL_SEC = 3600  # 1 hora


def _to_dec(x: Any) -> Optional[Decimal]:
    if x is None:
        return None
    try:
        return Decimal(str(x))
    except Exception:
        return None


@router.get("/usd", response_model=CotizacionUSDResponse)
async def cotizacion_usd(
    current_user: User = Depends(get_current_user),
):
    """Cotizacion del dia desde Bluelytics. Cache 1h.

    Devuelve blue (compra/venta) + oficial (compra/venta) + valor_sugerido
    (promedio de blue venta) que el frontend usa por default al cargar gastos.
    """
    cached = _cache.get("latest")
    if cached and time.time() - cached[0] < CACHE_TTL_SEC:
        return cached[1]

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(BLUELYTICS_URL, headers={"User-Agent": USER_AGENT})
            resp.raise_for_status()
            raw = resp.json()
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Timeout contactando Bluelytics")
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=502, detail=f"Bluelytics devolvió {exc.response.status_code}")
    except httpx.RequestError as exc:
        raise HTTPException(status_code=502, detail=f"Error contactando Bluelytics: {exc}")

    blue = raw.get("blue") or {}
    oficial = raw.get("oficial") or {}

    blue_compra = _to_dec(blue.get("value_buy"))
    blue_venta = _to_dec(blue.get("value_sell"))
    oficial_compra = _to_dec(oficial.get("value_buy"))
    oficial_venta = _to_dec(oficial.get("value_sell"))

    # Valor sugerido = blue venta (es lo que el intendente realmente paga).
    # Fallback: promedio de blue compra/venta, despues oficial venta.
    sugerido = blue_venta or (
        (blue_compra + blue_venta) / 2 if (blue_compra and blue_venta) else None
    ) or oficial_venta

    response = CotizacionUSDResponse(
        fecha=date.today(),
        fuente="bluelytics",
        blue_compra=blue_compra,
        blue_venta=blue_venta,
        oficial_compra=oficial_compra,
        oficial_venta=oficial_venta,
        valor_sugerido=sugerido,
    )
    _cache["latest"] = (time.time(), response)
    return response
