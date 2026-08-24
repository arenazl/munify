"""
Aplica el componente HISTORICO a una demo ya creada (regla del dueño:
sin historia no es una demo funcional).

Sobre los reclamos de la SEMILLA del muni (excluye los marcados [E2E ...]):
- retrodata created_at ~3 meses de forma deterministica (dia 3, 10, 17...);
- fecha_resolucion coherente (creacion + 2-5 dias) para los cerrados;
- apila los primeros reclamos en dos esquinas (3 + 2) para que el mapa de
  focos ("Donde se repiten los reclamos", agrupa por direccion con minimo 2)
  tenga recorrido.

Mismo criterio que seed_demo.py aplica a las demos nuevas. Idempotente en la
practica: re-correrlo recalcula las mismas fechas y los mismos clusters.

Uso: python scripts/aplicar_historia_demo.py --muni 153
"""
import argparse
import asyncio
import sys
from datetime import datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from core.config import settings  # noqa: E402


def fecha_historica(i: int) -> datetime:
    return datetime.utcnow() - timedelta(days=3 + i * 7, hours=(i * 5) % 12)


async def main(muni_id: int):
    engine = create_async_engine(settings.DATABASE_URL)
    async with engine.begin() as conn:
        filas = (await conn.execute(text(
            "SELECT id, estado, direccion, latitud, longitud, zona_id, barrio_id "
            "FROM reclamos WHERE municipio_id = :m AND titulo NOT LIKE '[E2E%' "
            "ORDER BY id"
        ), {"m": muni_id})).fetchall()
        if not filas:
            print(f"[SKIP] el muni {muni_id} no tiene reclamos de semilla")
            return

        # Clusters de recurrencia: reclamos 1-2 heredan el lugar del 0;
        # el 4 hereda el del 3. El resto conserva su punto propio.
        herencia = {}
        if len(filas) >= 3:
            herencia[1] = filas[0]
            herencia[2] = filas[0]
        if len(filas) >= 5:
            herencia[4] = filas[3]

        for i, fila in enumerate(filas):
            creado = fecha_historica(i)
            cerrado = fila[1] in ("resuelto", "finalizado")
            params = {
                "id": fila[0],
                "creado": creado,
                "resol": (creado + timedelta(days=2 + i % 4)) if cerrado else None,
            }
            set_lugar = ""
            origen = herencia.get(i)
            if origen is not None:
                set_lugar = (", direccion = :dir, latitud = :lat, longitud = :lng, "
                             "zona_id = :zona, barrio_id = :barrio")
                params.update({"dir": origen[2], "lat": origen[3], "lng": origen[4],
                               "zona": origen[5], "barrio": origen[6]})
            await conn.execute(text(
                f"UPDATE reclamos SET created_at = :creado, fecha_resolucion = :resol{set_lugar} "
                "WHERE id = :id"
            ), params)
        print(f"[OK] {len(filas)} reclamos con historia (~{3 + (len(filas) - 1) * 7} dias hacia atras) "
              f"y {len(herencia)} apilados en 2 focos")
    await engine.dispose()
    print("[DONE]")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--muni", type=int, required=True)
    asyncio.run(main(ap.parse_args().muni))
