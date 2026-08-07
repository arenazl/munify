"""
Agrega `pais` a `municipios` (ISO-3166 alpha-2).

POR QUÉ: había cosas cableadas a Argentina que se rompen fuera de ella. La más
visible es el autocomplete de direcciones, que manda `countrycodes=ar` fijo a
Nominatim: en Asunción no devuelve NADA, así que el vecino no puede cargar la
dirección de su reclamo. Con el país en el tenant, cada municipio busca en el
suyo.

POR QUÉ NO SE DEDUCE DE LAS COORDENADAS: se probó y clasifica mal. Un bounding
box rectangular no distingue Uruguay de Buenos Aires (el Río de la Plata los
separa, el rectángulo no: La Plata y Lomas de Zamora caían en 'UY'), ni el
Chaco argentino del paraguayo. Y varios municipios de prueba tienen las coords
mal cargadas, con lo cual el dato de entrada tampoco es confiable.

Así que la asignación es EXPLÍCITA: todo Argentina, salvo los municipios que
figuran en `NO_ARGENTINOS`. Es una lista corta y se sabe quién está en ella.

Idempotente: se puede correr varias veces.

    python scripts/migrate_municipio_pais.py
"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text  # noqa: E402
from sqlalchemy.ext.asyncio import create_async_engine  # noqa: E402

from core.config import settings  # noqa: E402

DEFAULT = "AR"

# id de municipio -> ISO alpha-2. Todo lo que no esté acá es Argentina.
NO_ARGENTINOS = {
    146: "PY",  # Asunción, Dpto. Central — Paraguay Limpio
}


async def migrate() -> None:
    engine = create_async_engine(settings.DATABASE_URL)
    async with engine.begin() as conn:
        existe = await conn.execute(text("""
            SELECT COUNT(*) FROM information_schema.columns
            WHERE table_schema = DATABASE()
              AND table_name = 'municipios'
              AND column_name = 'pais'
        """))
        if existe.scalar():
            print("OK: la columna `pais` ya existía")
        else:
            await conn.execute(text(
                f"ALTER TABLE municipios "
                f"ADD COLUMN pais VARCHAR(2) NOT NULL DEFAULT '{DEFAULT}'"
            ))
            print(f"OK: columna `pais` creada (default '{DEFAULT}')")

        # Todo a Argentina, y después las excepciones. Así el script deja la
        # tabla en el estado declarado corra las veces que corra.
        r = await conn.execute(
            text("UPDATE municipios SET pais = :d WHERE pais <> :d"),
            {"d": DEFAULT},
        )
        print(f"OK: {r.rowcount} municipios devueltos a '{DEFAULT}'")

        for mid, iso in NO_ARGENTINOS.items():
            r = await conn.execute(
                text("UPDATE municipios SET pais = :p WHERE id = :i"),
                {"p": iso, "i": mid},
            )
            print(f"OK: municipio {mid} -> '{iso}' ({r.rowcount} fila)")

        resumen = (await conn.execute(text(
            "SELECT pais, COUNT(*) FROM municipios GROUP BY pais ORDER BY 2 DESC"
        ))).fetchall()
        print("Resumen:", ", ".join(f"{p}={n}" for p, n in resumen))

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(migrate())
