# -*- coding: utf-8 -*-
"""Sube las fichas CURADAS del directorio de llamados a la base (tabla `calls_municipio`).

    python backend/scripts/importar_calls_fichas.py [ruta/a/todos.json]

DE DONDE SALEN
--------------
De `munify-calls/scripts/entregas/2-curados-fable/todos.json`, que es lo que
produce la curaduria (`scripts/entregas/procesar.py`). Si no se pasa ruta, se
busca en `d:/Code/munify-calls/...` y, si no esta, se puede pasar a mano.

POR QUE ESTE SCRIPT EXISTE
--------------------------
Hasta el 2026-09-05 las fichas viajaban EMBEBIDAS en el html: cada publicacion
las reescribia y la pagina no le preguntaba nada al servidor. Con dos o tres
vendedores llamando eso no alcanza — el que corrige un telefono en su celular es
el unico que lo ve. Ahora la pagina las pide a `/api/public/calls/fichas`.

EL SENTIDO DE LA FLECHA (importa)
---------------------------------
La FUENTE DE VERDAD de la ficha sigue siendo la curaduria. Esta tabla es su
ESPEJO: se vuelve a correr este script cada vez que se cura un lote nuevo.
Nadie edita una ficha por la API. Lo que el vendedor corrige en la calle (un
telefono que no atiende) vive en `calls_registro.telefonos_corregidos`, que es
SU trabajo, y se aplica encima al servir la ficha. Por eso este script NUNCA
toca `calls_registro` ni `calls_evento`.

QUE HACE
--------
1. Crea `calls_municipio` si no existe (idempotente, `checkfirst`).
2. Inserta o actualiza cada ficha por `muni_key`.
3. Borra de la tabla los municipios que la curaduria ya NO sirve (salieron de
   curados), avisando cuales, porque eso saca fichas de la app.

NUNCA CONTRA PRODUCCION. Igual que los demas scripts de calls, corta si la base
destino es la productiva.
"""
from __future__ import annotations

import asyncio
import io
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select                                    # noqa: E402
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine  # noqa: E402

from core.config import settings                                 # noqa: E402
from core.database import Base                                   # noqa: E402
from models.calls import CallsMunicipio                          # noqa: E402

BASES_PRODUCCION = {"munify_prod", "defaultdb"}
POR_DEFECTO = r"D:\Code\munify-calls\scripts\entregas\2-curados-fable\todos.json"

# Campos que van tal cual; los demas se serializan a JSON o se calculan.
DIRECTOS = ["municipio", "provincia", "pais", "tipo_gobierno", "direccion",
            "direccion_fuente", "web", "habitantes", "intendente", "cargo",
            "partido", "confianza", "fuente", "nota", "senal", "llamar_desde",
            "revalidar_el", "economia", "digital", "estructura", "color",
            "verificado_el"]
JSONS = ["telefonos", "etiquetas", "ranking", "calidad", "origen"]


def campos(f: dict) -> dict:
    d = {k: (f.get(k) or "") for k in DIRECTOS}
    d["pais"] = f.get("pais") or "Argentina"
    for k in JSONS:
        v = f.get(k)
        d[k] = json.dumps(v, ensure_ascii=False) if v not in (None, "", [], {}) else None
    d["ranking_score"] = int((f.get("ranking") or {}).get("score") or 0)
    return d


async def main(ruta: str) -> int:
    base = settings.DATABASE_URL.rsplit("/", 1)[-1].split("?")[0]
    if base in BASES_PRODUCCION:
        print("ABORTADO: la base destino es PRODUCCION (%s). Este script es de QA." % base)
        return 1
    if not os.path.exists(ruta):
        print("No encuentro las fichas curadas en: %s" % ruta)
        return 1

    fichas = json.load(io.open(ruta, encoding="utf-8"))
    print("Base destino: %s" % base)
    print("Fichas curadas: %d  (%s)" % (len(fichas), ruta))

    engine = create_async_engine(settings.DATABASE_URL)
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all,
                                tables=[CallsMunicipio.__table__], checkfirst=True)
        print("Tabla calls_municipio creada/verificada")

        Session = async_sessionmaker(engine, expire_on_commit=False)
        async with Session() as s:
            previas = {m.muni_key: m for m in
                       (await s.execute(select(CallsMunicipio))).scalars().all()}
            nuevas, actualizadas = 0, 0
            vistos = set()
            for f in fichas:
                key = (f.get("id") or "").strip().lower()[:80]
                if not key:
                    continue
                vistos.add(key)
                d = campos(f)
                fila = previas.get(key)
                if fila:
                    cambio = any(getattr(fila, k) != v for k, v in d.items())
                    if cambio:
                        for k, v in d.items():
                            setattr(fila, k, v)
                        actualizadas += 1
                else:
                    s.add(CallsMunicipio(muni_key=key, **d))
                    nuevas += 1

            # Lo que la curaduria dejo de servir sale de la app: se avisa fuerte.
            sobran = [k for k in previas if k not in vistos]
            for k in sobran:
                await s.delete(previas[k])

            await s.commit()

        print()
        print("  nuevas        %4d" % nuevas)
        print("  actualizadas  %4d" % actualizadas)
        print("  sin cambios   %4d" % (len(vistos) - nuevas - actualizadas))
        if sobran:
            print("  SALEN de la app %2d: %s" % (len(sobran), ", ".join(sorted(sobran)[:8])))
        print()
        print("Total en calls_municipio: %d" % len(vistos))
    finally:
        await engine.dispose()
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main(sys.argv[1] if len(sys.argv) > 1 else POR_DEFECTO)))
