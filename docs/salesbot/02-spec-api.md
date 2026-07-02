# Spec: API SalesBot ↔ Munify

## Objetivo

SalesBot (Bruno) necesita datos de Munify para:
1. Listar municipios activos con su WA de contacto
2. Mostrar stats básicos de cada uno (reclamos, trámites, vecinos)
3. Derivar un prospecto calificado al WA del municipio

Hoy `munify_db.py` conecta directo a la BD de Munify — frágil y acoplado.
La nueva arquitectura reemplaza eso con llamadas HTTP a la API de Munify.

---

## Arquitectura

```
Bruno (SalesBot)
    │
    │  HTTP + X-SalesBot-Key header
    ▼
Munify API  →  /api/salesbot/*  (nuevo router)
    │
    ├── municipios (WhatsAppConfig + Municipio)
    └── stats por muni (reclamos, trámites, vecinos)
```

### Auth backend-to-backend

Un API key estático compartido. Sin JWT flow — es backend a backend.

- Header: `X-SalesBot-Key: <secret>`
- Secret definido en:
  - `sugerenciasMun/.env` → `SALESBOT_API_KEY=<secret>`
  - `SalesBot/.env` → `MUNIFY_API_KEY=<secret>` + `MUNIFY_BASE_URL=<url_de_munify>`

---

## Endpoints a implementar en Munify

### 1. `GET /api/salesbot/municipios`

Lista todos los municipios activos con su número de WhatsApp.

**Auth:** `X-SalesBot-Key` header

**Response:**
```json
[
  {
    "id": 3,
    "nombre": "San Pedro Norte",
    "codigo": "SPN",
    "logo_url": "https://...",
    "color_primario": "#3B82F6",
    "whatsapp": "+54 9 351 123-4567",
    "whatsapp_habilitado": true,
    "stats": {
      "reclamos_totales": 142,
      "reclamos_resueltos": 89,
      "tramites_activos": 23,
      "vecinos": 310
    }
  }
]
```

**Campos relevantes:**
- `whatsapp` ← `WhatsAppConfig.telefono_wa_me_saliente`
- `whatsapp_habilitado` ← `WhatsAppConfig.habilitado`
- `stats` ← conteos simples de la BD de Munify

**Notas de implementación:**
- Solo municipios con `activo = True`
- Si un municipio no tiene `WhatsAppConfig`, `whatsapp = null`, `whatsapp_habilitado = false`
- Los stats pueden ser aproximados con COUNT de las tablas correspondientes

---

### 2. `GET /api/salesbot/municipios/{id}/detalle`

Detalle completo de un municipio para cuando el prospecto ya eligió uno.

**Auth:** `X-SalesBot-Key` header

**Response** (estructura real — los valores dependen de lo que el muni haya cargado;
si no cargó nada, viene `null`):
```json
{
  "id": 65,
  "nombre": "San Pedro",
  "codigo": "san-pedro",
  "descripcion": null,
  "direccion": null,
  "telefono": null,
  "email": null,
  "sitio_web": null,
  "latitud": null,
  "longitud": null,
  "logo_url": null,
  "color_primario": "#0088cc",
  "whatsapp": null,
  "whatsapp_habilitado": false,
  "stats": {
    "reclamos_totales": 15,
    "reclamos_resueltos": 5,
    "tasa_resolucion_pct": 33,
    "tramites_activos": 14,
    "categorias_reclamo": ["Bacheo y calles", "Higiene urbana", "..."],
    "vecinos": 5
  }
}
```

**De dónde sale cada campo (NO hay valores hardcodeados):**
- `direccion, telefono, latitud, longitud` ← lo que el admin del muni carga en **Configuración → Datos del Municipio** (tabla `configuraciones`); fallback a columnas de `municipios`.
- `nombre, codigo, descripcion, email, sitio_web, logo_url, color_primario` ← tabla `municipios`.
- `whatsapp, whatsapp_habilitado` ← tabla `salesbot_configs` (pestaña SalesBot).
- `stats` ← conteos en vivo sobre `reclamos`, `tramites`, `usuarios`, `categorias_reclamo`.

> Si el muni no completó esos datos, vienen `null` — el bot NO debe inventar la
> dirección/teléfono; si están `null`, que diga que no los tiene cargados.

---

## Implementación en Munify (sugerenciasMun)

### Archivos a crear

**`backend/api/salesbot.py`** — nuevo router

```python
from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from typing import Optional

from core.database import get_db
from core.config import settings
from models.municipio import Municipio
from models.whatsapp_config import WhatsAppConfig
from models import Reclamo, User
from models.tramites import Tramite  # ajustar import según estructura real

router = APIRouter()


def verify_salesbot_key(x_salesbot_key: str = Header(...)):
    if x_salesbot_key != settings.SALESBOT_API_KEY:
        raise HTTPException(status_code=403, detail="Forbidden")


@router.get("/municipios")
async def listar_municipios(
    db: AsyncSession = Depends(get_db),
    _: None = Depends(verify_salesbot_key),
):
    # Traer municipios activos con su WhatsAppConfig
    result = await db.execute(
        select(Municipio)
        .options(selectinload(Municipio.whatsapp_config))
        .where(Municipio.activo == True)
        .order_by(Municipio.nombre)
    )
    municipios = result.scalars().all()

    out = []
    for m in municipios:
        wa = m.whatsapp_config
        stats = await _get_stats(db, m.id)
        out.append({
            "id": m.id,
            "nombre": m.nombre,
            "codigo": m.codigo,
            "logo_url": m.logo_url,
            "color_primario": m.color_primario,
            "whatsapp": wa.telefono_wa_me_saliente if wa else None,
            "whatsapp_habilitado": wa.habilitado if wa else False,
            "stats": stats,
        })
    return out


@router.get("/municipios/{municipio_id}/detalle")
async def detalle_municipio(
    municipio_id: int,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(verify_salesbot_key),
):
    result = await db.execute(
        select(Municipio)
        .options(selectinload(Municipio.whatsapp_config))
        .where(Municipio.id == municipio_id, Municipio.activo == True)
    )
    m = result.scalar_one_or_none()
    if not m:
        raise HTTPException(status_code=404, detail="Municipio no encontrado")

    wa = m.whatsapp_config
    stats = await _get_stats(db, m.id, detalle=True)

    return {
        "id": m.id,
        "nombre": m.nombre,
        "descripcion": m.descripcion,
        "telefono": m.telefono,
        "email": m.email,
        "sitio_web": m.sitio_web,
        "whatsapp": wa.telefono_wa_me_saliente if wa else None,
        "whatsapp_habilitado": wa.habilitado if wa else False,
        "stats": stats,
    }


async def _get_stats(db: AsyncSession, municipio_id: int, detalle: bool = False) -> dict:
    """Stats básicos de un municipio. Ajustar imports/modelos según estructura real."""
    # Contar reclamos (ajustar modelo según el nombre real)
    # from models import Reclamo
    # total_r = (await db.execute(select(func.count()).where(Reclamo.municipio_id == municipio_id))).scalar()
    # resueltos = (await db.execute(select(func.count()).where(
    #     Reclamo.municipio_id == municipio_id, Reclamo.estado == 'resuelto'
    # ))).scalar()
    # vecinos = (await db.execute(select(func.count()).where(User.municipio_id == municipio_id))).scalar()

    # TODO: descomentar y ajustar cuando se integre
    return {
        "reclamos_totales": 0,
        "reclamos_resueltos": 0,
        "tramites_activos": 0,
        "vecinos": 0,
    }
```

### Registrar el router en `main.py`

```python
from api.salesbot import router as salesbot_router
app.include_router(salesbot_router, prefix="/api/salesbot", tags=["salesbot"])
```

### Variable de entorno a agregar

En `sugerenciasMun/.env`:
```
SALESBOT_API_KEY=<generar con secrets.token_hex(32)>
```

En `sugerenciasMun/core/config.py`, agregar al Settings:
```python
SALESBOT_API_KEY: str = ""
```

---

## Implementación en SalesBot

### `backend/services/munify_api.py` (reemplaza `munify_db.py`)

```python
"""Cliente HTTP para la API de Munify. Reemplaza el acceso directo a BD."""
from __future__ import annotations
import httpx
from core.config import settings

BASE_URL = settings.MUNIFY_BASE_URL.rstrip("/")
HEADERS = {"X-SalesBot-Key": settings.MUNIFY_API_KEY}

_municipios_cache: list[dict] | None = None


async def get_municipios(force_refresh: bool = False) -> list[dict]:
    global _municipios_cache
    if _municipios_cache is None or force_refresh:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(f"{BASE_URL}/api/salesbot/municipios", headers=HEADERS)
            r.raise_for_status()
            _municipios_cache = r.json()
    return _municipios_cache


async def get_municipio_detalle(municipio_id: int) -> dict:
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(
            f"{BASE_URL}/api/salesbot/municipios/{municipio_id}/detalle",
            headers=HEADERS,
        )
        r.raise_for_status()
        return r.json()
```

### Variables de entorno a agregar en SalesBot

```
MUNIFY_BASE_URL=<url pública de Munify>
MUNIFY_API_KEY=<mismo valor que SALESBOT_API_KEY en Munify>
```

---

## Flujo Bruno — derivación a municipio

```
1. Usuario pregunta por X municipio
   → Bruno llama munify_buscar_municipio(nombre)
   → Obtiene id + whatsapp

2. Bruno muestra stats básicos (reclamos resueltos, módulos activos)

3. Usuario confirma interés
   → Bruno responde con wa.me link:
     "Te conecto con el equipo de {nombre}: wa.me/{whatsapp_sin_espacios}"

4. Si whatsapp_habilitado = false:
   → Bruno dice "el municipio todavía no tiene WA activo, te paso el tel: {telefono}"
```

---

## Prioridad de implementación

1. **Munify**: crear `api/salesbot.py` + registrar router + agregar env var
2. **SalesBot**: crear `munify_api.py` + actualizar `bot_tools.py` para usar el nuevo cliente
3. **Test**: verificar que `GET /api/salesbot/municipios` devuelve lista real
4. **Stats**: completar la función `_get_stats` con los queries reales de Munify
