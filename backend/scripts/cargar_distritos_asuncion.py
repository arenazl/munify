# -*- coding: utf-8 -*-
"""Los 6 distritos de Asuncion como zonas, con sus barrios colgando.

El mapeo barrio -> distrito lo provee el dueño: no esta publicado en ninguna
fuente abierta (no esta en OSM, ni en Wikidata, ni en GADM, y el registro
oficial del DGEEC lista los barrios sin nivel intermedio).

Los barrios que no figuran en el mapeo quedan SIN distrito, no se les asigna
uno por parecido. Un barrio en el distrito equivocado ensucia todos los
graficos que agrupen por distrito, y no hay forma de notarlo despues.
"""
import asyncio
import json
import os
import re
import sys
import unicodedata

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

MUNI = 146

MAPEO_BARRIO = {
    "La Catedral": "La Catedral", "Ricardo Brugada": "La Catedral",
    "Banco San Miguel": "La Catedral", "Sajonia": "La Catedral",
    "Carlos Antonio López": "La Catedral", "Itá Pytã Punta": "La Catedral",
    "La Encarnación": "La Encarnación", "General Díaz": "La Encarnación",
    "Tte. Silvio Pettirossi": "La Encarnación", "Ciudad Nueva": "La Encarnación",
    "Barrio Obrero": "La Encarnación", "Tacumbu": "La Encarnación",
    "Itá Enramada": "La Encarnación",
    "San Roque": "San Roque", "Tembetary": "San Roque", "Pinozá": "San Roque",
    "Vista Alegre": "San Roque", "Jara": "San Roque", "Las Mercedes": "San Roque",
    "General Caballero": "San Roque", "San Vicente": "San Roque", "Mburicaó": "San Roque",
    "Recoleta": "La Recoleta", "Villa Morra": "La Recoleta", "Las Lomas": "La Recoleta",
    "Manorá": "La Recoleta", "San Cristóbal": "La Recoleta", "Herrera": "La Recoleta",
    "Ykua Sati": "La Recoleta", "Los Laureles": "La Recoleta", "Madame Lynch": "La Recoleta",
    "Mariscal Estigarribia": "La Recoleta", "Villa Aurelia": "La Recoleta",
    "Terminal": "La Recoleta", "San Pablo": "La Recoleta", "Nazaret": "La Recoleta",
    "Hipódromo": "La Recoleta",
    "Santisima Trinidad": "Santísima Trinidad", "Botánico": "Santísima Trinidad",
    "Zeballos Kue": "Santísima Trinidad", "Tablada Nueva": "Santísima Trinidad",
    "Loma Pytá": "Santísima Trinidad", "Mburucuyá": "Santísima Trinidad",
    "San Jorge": "Santísima Trinidad", "Salvador del Mundo": "Santísima Trinidad",
    "Virgen de la Asuncion": "Santísima Trinidad", "Virgen de Fatima": "Santísima Trinidad",
    "Santo Domingo": "Santísima Trinidad", "San Blas": "Santísima Trinidad",
    "Ityay": "Santísima Trinidad", "Virgen del Huerto": "Santísima Trinidad",
    "Santa María": "Santa María", "Santa Rosa": "Santa María", "Santa Ana": "Santa María",
    "Santa Librada": "Santa María", "Roberto L. Pettit": "Santa María",
    "Republicano": "Santa María", "Bañado Tacumbú": "Santa María",
}

MAPEO = {}
for _b, _d in MAPEO_BARRIO.items():
    MAPEO.setdefault(_d, []).append(_b)


# Titulos y honorificos con los que la base escribe algunos barrios y el mapeo
# no: "Tte. Silvio Pettirossi" es el mismo barrio que "Pettirossi". Se sacan
# antes de comparar; no es adivinar, es escribir el mismo nombre igual.
TITULOS = ("general", "gral", "mariscal", "mcal", "teniente", "tte", "doctor", "dr",
           "presidente", "pte", "santisima", "stma", "madame", "don", "capitan", "cap")


def norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode()
    s = s.lower().replace(".", " ").replace("'", "").replace("-", " ")
    return " ".join(s.split())


def clave(s: str) -> str:
    """Nombre comparable: sin titulos, sin nombres de pila, sin ordenar."""
    palabras = [p for p in norm(s).split() if p not in TITULOS and len(p) > 1]
    return " ".join(palabras)


def emparejar(nombre: str, lookup: dict) -> str | None:
    """Empareja por nombre exacto, y si no, por apellido/nucleo del nombre.

    El nucleo es la palabra mas larga: en "Roberto L. Pettit" y "Roberto Luis
    Pettit" el nucleo es "pettit" en las dos. Solo vale si esa palabra aparece
    en UN unico barrio del mapeo — si es ambigua, se deja sin distrito.
    """
    k = clave(nombre)
    if k in lookup:
        return lookup[k]
    palabras = [p for p in k.split() if len(p) > 4]
    if not palabras:
        return None
    nucleo = max(palabras, key=len)
    candidatos = {d for kk, d in lookup.items() if nucleo in kk.split()}
    return candidatos.pop() if len(candidatos) == 1 else None


def url_destino() -> str:
    url = os.getenv("DATABASE_URL_QA") or os.getenv("DATABASE_URL") or ""
    if not url:
        sys.exit("Sin DATABASE_URL")
    if "-qa" not in url and "--prod-ok" not in sys.argv:
        sys.exit(f"ABORTO: no es QA (base '{re.sub(r'.*/', '', url)}')")
    return url


async def main():
    lookup = {clave(b): d for d, lista in MAPEO.items() for b in lista}
    engine = create_async_engine(url_destino())

    async with engine.begin() as conn:
        # Las zonas viejas de la semilla eran barrios disfrazados: se desactivan
        # en vez de borrarse, para no romper los reclamos que las referencian.
        await conn.execute(text(
            "UPDATE zonas SET activo = 0 WHERE municipio_id = :m AND nombre NOT IN :d"
            .replace(":d", "(" + ",".join(f"'{d}'" for d in MAPEO) + ")")), {"m": MUNI})

        ids = {}
        for distrito in MAPEO:
            fila = (await conn.execute(text(
                "SELECT id FROM zonas WHERE municipio_id = :m AND nombre = :n"),
                {"m": MUNI, "n": distrito})).first()
            if fila:
                ids[distrito] = fila[0]
                await conn.execute(text("UPDATE zonas SET activo = 1 WHERE id = :i"),
                                   {"i": fila[0]})
            else:
                await conn.execute(text("""
                    INSERT INTO zonas (municipio_id, nombre, descripcion, activo)
                    VALUES (:m, :n, 'Distrito de Asuncion', 1)
                """), {"m": MUNI, "n": distrito})
                ids[distrito] = (await conn.execute(text(
                    "SELECT id FROM zonas WHERE municipio_id = :m AND nombre = :n"),
                    {"m": MUNI, "n": distrito})).scalar()
        print(f"distritos: {len(ids)}")

        barrios = (await conn.execute(text(
            "SELECT id, nombre FROM barrios WHERE municipio_id = :m"), {"m": MUNI})).all()
        asignados, sin_distrito = 0, []
        for bid, nombre in barrios:
            distrito = emparejar(nombre, lookup)
            if not distrito:
                sin_distrito.append(nombre)
                continue
            await conn.execute(text("UPDATE barrios SET zona_id = :z WHERE id = :b"),
                               {"z": ids[distrito], "b": bid})
            asignados += 1

        print(f"barrios: {len(barrios)} en la base · {asignados} con distrito · "
              f"{len(sin_distrito)} sin distrito")
        if sin_distrito:
            print("SIN DISTRITO (no figuran en el mapeo):")
            for n_ in sorted(sin_distrito):
                print(f"   - {n_}")

    async with engine.connect() as conn:
        print("\nRECLAMOS POR DISTRITO")
        for r in (await conn.execute(text("""
            SELECT z.nombre, COUNT(r.id) n
            FROM zonas z
            LEFT JOIN barrios b ON b.zona_id = z.id
            LEFT JOIN reclamos r ON r.barrio_id = b.id AND r.municipio_id = :m
            WHERE z.municipio_id = :m AND z.activo = 1
            GROUP BY z.id, z.nombre ORDER BY n DESC
        """), {"m": MUNI})).all():
            print(f"  {r[1]:5}  {r[0]}")
    await engine.dispose()


asyncio.run(main())
