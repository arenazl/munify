"""Tabla municipios_argentina: catalogo OFICIAL para el autocomplete del alta demo.

Carga unica desde la API georef de datos.gob.ar (municipios + centroides).
5 columnas: id georef, nombre, provincia, lat, lng. Idempotente (TRUNCATE+load).
"""
import asyncio
import os
import sys
import json
import urllib.request

sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy import text  # noqa: E402
from core.database import AsyncSessionLocal, engine  # noqa: E402

API = ("https://apis.datos.gob.ar/georef/api/municipios"
       "?campos=id,nombre,provincia.nombre,centroide.lat,centroide.lon"
       "&max=1000&inicio={inicio}")


def bajar_todos() -> list[dict]:
    munis, inicio = [], 0
    while True:
        with urllib.request.urlopen(API.format(inicio=inicio), timeout=30) as r:
            data = json.loads(r.read().decode())
        lote = data.get("municipios", [])
        munis.extend(lote)
        total = data.get("total", 0)
        inicio += len(lote)
        print(f"  bajados {inicio}/{total}")
        if inicio >= total or not lote:
            return munis


async def main():
    munis = bajar_todos()
    print(f"georef devolvio {len(munis)} municipios")
    async with AsyncSessionLocal() as db:
        await db.execute(text("""
            CREATE TABLE IF NOT EXISTS municipios_argentina (
                id VARCHAR(20) PRIMARY KEY,
                nombre VARCHAR(100) NOT NULL,
                provincia VARCHAR(60) NOT NULL,
                lat DECIMAL(10,6) NOT NULL,
                lng DECIMAL(10,6) NOT NULL,
                INDEX idx_ma_nombre (nombre)
            ) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci
        """))
        await db.execute(text("TRUNCATE TABLE municipios_argentina"))
        insertados = 0
        for m in munis:
            c = m.get("centroide") or {}
            if not (c.get("lat") and c.get("lon")):
                continue
            await db.execute(text("""
                INSERT INTO municipios_argentina (id, nombre, provincia, lat, lng)
                VALUES (:i, :n, :p, :la, :lo)
            """), {
                "i": m["id"], "n": m["nombre"][:100],
                "p": (m.get("provincia") or {}).get("nombre", "")[:60],
                "la": c["lat"], "lo": c["lon"],
            })
            insertados += 1
        await db.commit()
        n = (await db.execute(text("SELECT COUNT(*) FROM municipios_argentina"))).scalar()
        sm = (await db.execute(text(
            "SELECT nombre, provincia FROM municipios_argentina WHERE nombre LIKE '%San Mart%' LIMIT 6"
        ))).fetchall()
        print(f"tabla cargada: {n} municipios | check San Martin: {sm}")
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
