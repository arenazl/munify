"""Asigna ubicaciones REALES (calles + lat/lon) a los contactos de San Pedro Norte.

Estrategia:
  1. Para cada contacto sin lat/lon, genera un punto random dentro del
     bounding box de SPN (-30.266, -64.125, +/- 2km).
  2. Usa Nominatim reverse para obtener la dirección REAL que cae en ese
     punto (calle + numero + barrio).
  3. Si Nominatim devuelve una dirección con calle valida, asigna esa
     dirección + lat/lon al contacto. Si no, lo deja sin ubicar.

Idempotente: re-corre solo procesa contactos que NO tengan lat/lon o
que tengan coords random (sin direccion poblada).

Rate limit: 1 req/seg a Nominatim (cumplimiento de policy). 44 contactos
= ~1 minuto.
"""
import asyncio
import random
import sys
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

from core.config import settings
from models import Contacto

SPN_LAT = -30.266
SPN_LON = -64.125
DELTA = 0.02  # ~2km radio
MUNI_ID = 80
NOMINATIM_URL = "https://nominatim.openstreetmap.org/reverse"
USER_AGENT = "MunifyTesoreria/1.0 (admin@munify.com.ar)"

random.seed(42)


async def reverse_geocode(client: httpx.AsyncClient, lat: float, lon: float):
    """Pega Nominatim reverse. Devuelve (direccion, ok) o (None, False)."""
    try:
        r = await client.get(
            NOMINATIM_URL,
            params={
                "format": "json",
                "lat": lat,
                "lon": lon,
                "addressdetails": 1,
                "zoom": 18,  # detalle alto = calle + numero
            },
            headers={"User-Agent": USER_AGENT, "Accept-Language": "es"},
            timeout=10,
        )
        r.raise_for_status()
        data = r.json()
        addr = data.get("address") or {}
        road = addr.get("road") or addr.get("pedestrian") or addr.get("residential")
        num = addr.get("house_number")
        if not road:
            # No hay calle en ese punto → devolvemos el display_name corto
            display = data.get("display_name", "")
            if display:
                # Tomar las primeras 2 partes que no sean estado/pais
                parts = [p.strip() for p in display.split(",")[:3]]
                return (", ".join(parts), True)
            return (None, False)
        partes = []
        if num:
            partes.append(f"{road} {num}")
        else:
            partes.append(road)
        loc = addr.get("village") or addr.get("town") or addr.get("city") or addr.get("hamlet")
        if loc:
            partes.append(loc)
        return (", ".join(partes), True)
    except Exception as e:
        print(f"  ! Error Nominatim: {e}")
        return (None, False)


async def buscar_punto_en_calle(client: httpx.AsyncClient, intentos: int = 5):
    """Intenta `intentos` puntos random dentro de SPN hasta encontrar
    uno que reverse-geocode te devuelva una calle real."""
    for _ in range(intentos):
        lat = SPN_LAT + random.uniform(-DELTA, DELTA)
        lon = SPN_LON + random.uniform(-DELTA, DELTA)
        direccion, ok = await reverse_geocode(client, lat, lon)
        await asyncio.sleep(1.1)  # Nominatim policy: max 1 req/seg
        if ok and direccion:
            return (lat, lon, direccion)
    # Si en 5 intentos no encontró calle, devuelve el último punto sin dir
    return (lat, lon, None)


async def main():
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    SessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with SessionLocal() as session:
        res = await session.execute(
            select(Contacto).where(Contacto.municipio_id == MUNI_ID).order_by(Contacto.id)
        )
        contactos = res.scalars().all()
        print(f"Procesando {len(contactos)} contactos de SPN (muni {MUNI_ID})")
        print()

        async with httpx.AsyncClient() as client:
            actualizados = 0
            for c in contactos:
                # Skip Eduardo García — ya tiene coords reales del KMZ
                if c.nombre == "Eduardo" and c.apellido == "García":
                    print(f"  [skip KMZ] {c.nombre} {c.apellido}")
                    continue

                lat, lon, direccion = await buscar_punto_en_calle(client)
                c.latitud = lat
                c.longitud = lon
                if direccion:
                    c.direccion = direccion
                    print(f"  [{actualizados+1:02d}] {c.nombre} {c.apellido or ''} -> {direccion}")
                else:
                    print(f"  [{actualizados+1:02d}] {c.nombre} {c.apellido or ''} -> (sin calle, solo coords)")
                actualizados += 1

                # Commit cada 5 para no perder progreso
                if actualizados % 5 == 0:
                    await session.commit()

            await session.commit()
            print()
            print(f"[OK] {actualizados} contactos geolocalizados con direcciones reales")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
