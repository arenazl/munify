"""Localidades y parajes de BAHRA para los municipios que no tienen NADA adentro.

BAHRA = Base de Asentamientos Humanos de la Republica Argentina (IGN/INDEC). Se
usa el derivado que publica georef en datos.gob.ar:

    https://infra.datos.gob.ar/georef/asentamientos.json

Es UNA descarga de un dataset oficial, offline: 14.466 asentamientos con nombre,
categoria (Paraje / Localidad simple / Entidad / Componente) y punto. No trae
contorno, y esta bien: la decision del dueno fue "me gustaria tener cubierta la
mayoria de los barrios de Argentina, mas alla de que tengamos poligonos o no".

Complementa a `catalogo_barrios_pbf.py`, no lo pisa:

  - alcance: SOLO los municipios que hoy tienen CERO filas en `catalogo_barrios`
    (se calcula contra la base en el momento, no hay lista fija). Un municipio
    que ya tiene barrios de OSM o del padron no se toca.
  - cada asentamiento entra como `fuente='bahra'`, `tipo='localidad'`, sin
    poligono, con el punto del dataset.
  - se descarta el asentamiento HOMONIMO del municipio (misma regla
    `clave == objetivo` del PBF): un pueblo de una sola localidad queda vacio a
    proposito, "va a quedar horrible con uno solo ahi adentro".
  - el municipio sale del dataset (`gobierno_local.id`, que es el codigo INDEC,
    el mismo id de `municipios_catalogo`). El 19% que viene sin gobierno_local
    se asigna por contencion del punto en el contorno del municipio, igual que
    la fase 1 del PBF (aporta poco: son parajes de territorio no municipalizado).

Idempotente: por municipio borra SOLO sus filas `fuente='bahra'` y reinserta, en
tandas con commit. Correrlo dos veces deja lo mismo.

    cd backend
    # en seco (no escribe), para ver cuantos municipios se llenan
    python scripts/geo/catalogo_barrios_bahra.py --env qa --pais AR
    # aplicar
    python scripts/geo/catalogo_barrios_bahra.py --env qa --pais AR --aplicar
"""
from __future__ import annotations

import asyncio
import json
import os
import sys
import time
from datetime import datetime, timezone

AQUI = os.path.dirname(os.path.abspath(__file__))
BACKEND = os.path.dirname(os.path.dirname(AQUI))
sys.path.insert(0, BACKEND)
sys.path.insert(0, os.path.dirname(AQUI))
sys.path.insert(0, AQUI)

from sqlalchemy import text  # noqa: E402
from sqlalchemy.ext.asyncio import create_async_engine  # noqa: E402

from _entorno import parser_base, resolver_db  # noqa: E402
from _hojas import asegurar_columnas, marcar_hojas  # noqa: E402
from catalogo_barrios_pbf import DDL, _municipios, _poligono  # noqa: E402
from services import geo_ciudad  # noqa: E402
from services.geo_demo import _norm  # noqa: E402

FUENTE = "bahra"
TIPO = "localidad"
ARCHIVO_POR_DEFECTO = os.path.join(BACKEND, "scripts", "datos", "asentamientos.json")
TANDA = 25


def _asentamientos(ruta: str) -> list[dict]:
    """La lista cruda del JSON de georef, solo los que tienen nombre y punto."""
    with open(ruta, encoding="utf-8") as fh:
        crudo = json.load(fh)
    filas = crudo.get("asentamientos") if isinstance(crudo, dict) else crudo
    if not isinstance(filas, list):
        sys.exit(f"El archivo no tiene una lista `asentamientos`: {ruta}")
    out = []
    for a in filas:
        nombre = (a.get("nombre") or "").strip()
        centro = a.get("centroide") or {}
        if not nombre or centro.get("lat") is None or centro.get("lon") is None:
            continue
        out.append({
            "nombre": nombre[:120],
            "lat": float(centro["lat"]),
            "lon": float(centro["lon"]),
            "categoria": a.get("categoria") or "",
            "muni": (a.get("gobierno_local") or {}).get("id") or "",
        })
    return out


def _por_contencion(sueltos: list[dict], municipios: list[dict]) -> int:
    """Le pone `muni` a los asentamientos sin gobierno_local, por el contorno que
    los contiene. Devuelve cuantos pudo asignar."""
    if not sueltos:
        return 0
    from shapely.geometry import Point
    from shapely.strtree import STRtree

    geos, ids = [], []
    for m in municipios:
        poli = _poligono(m["anillo"])
        if poli is None or poli.is_empty:
            continue
        geos.append(poli)
        ids.append(m["id"])
    if not geos:
        return 0
    arbol = STRtree(geos)
    asignados = 0
    for a in sueltos:
        punto = Point(a["lon"], a["lat"])
        for i in arbol.query(punto):
            if geos[i].contains(punto):
                a["muni"] = ids[i]
                asignados += 1
                break
    return asignados


def _localidades_de(m: dict, delmuni: list[dict]) -> list[dict]:
    """Las filas a insertar para este municipio: sin el homonimo, sin cardinales,
    deduplicadas por nombre normalizado."""
    objetivo = _norm(m["nombre"])
    por_nombre: dict[str, dict] = {}
    for a in delmuni:
        clave = _norm(a["nombre"])
        if not clave or clave == objetivo or geo_ciudad.es_cardinal(a["nombre"]):
            continue
        # A igual nombre gana la primera: el dataset no tiene un criterio mejor.
        por_nombre.setdefault(clave, {
            "nombre": a["nombre"], "tipo": TIPO, "lat": a["lat"], "lon": a["lon"],
            "poligono": None, "vertices": None, "fuente": FUENTE, "osm_id": None,
        })
    filas = sorted(por_nombre.values(), key=lambda b: _norm(b["nombre"]))
    marcar_hojas(filas)
    return filas


async def _escribir(conn, m: dict, pais: str, filas: list[dict]) -> None:
    """Reemplaza SOLO las filas de BAHRA del municipio: lo de OSM/padron no se toca."""
    await conn.execute(
        text("DELETE FROM catalogo_barrios "
             "WHERE municipio_catalogo_id = :id AND fuente = :f"),
        {"id": m["id"], "f": FUENTE})
    if not filas:
        return
    ahora = datetime.now(timezone.utc).replace(microsecond=0, tzinfo=None)
    await conn.execute(text("""
        INSERT INTO catalogo_barrios
          (municipio_catalogo_id, pais, nombre, nombre_norm, tipo, lat, lon, poligono,
           vertices, fuente, osm_id, hoja, motivo_hoja, actualizado_en)
        VALUES (:muni, :pais, :nombre, :norm, :tipo, :lat, :lon, :poligono,
                :vertices, :fuente, :osm_id, :hoja, :motivo_hoja, :ahora)
    """), [{"muni": m["id"], "pais": pais, "nombre": b["nombre"],
            "norm": _norm(b["nombre"])[:120], "tipo": b["tipo"], "lat": b["lat"],
            "lon": b["lon"], "poligono": None, "vertices": None, "fuente": FUENTE,
            "osm_id": None, "hoja": int(b.get("hoja", True)),
            "motivo_hoja": b.get("motivo_hoja"), "ahora": ahora} for b in filas])


async def _vacios(conn, pais: str) -> set[str]:
    """Los municipios que hoy no tienen NINGUNA fila en el catalogo."""
    filas = (await conn.execute(text("""
        SELECT c.id
        FROM municipios_catalogo c
        LEFT JOIN (SELECT municipio_catalogo_id, COUNT(*) n FROM catalogo_barrios
                   WHERE pais = :p GROUP BY municipio_catalogo_id) b
          ON b.municipio_catalogo_id = c.id
        WHERE c.pais = :p AND c.poligono IS NOT NULL AND COALESCE(b.n, 0) = 0
    """), {"p": pais})).fetchall()
    return {f[0] for f in filas}


async def main() -> None:
    p = parser_base("Localidades y parajes de BAHRA para los municipios sin barrios.")
    p.add_argument("--archivo", default=ARCHIVO_POR_DEFECTO,
                   help="JSON de asentamientos de georef")
    p.add_argument("--pais", default="AR", help="Solo AR por ahora")
    p.add_argument("--muni", default="", help="Escribir solo este municipio")
    p.add_argument("--limite", type=int, default=0, help="Cortar despues de N municipios")
    args = p.parse_args()

    cfg = resolver_db(args)
    pais = args.pais.upper()
    if pais != "AR":
        sys.exit("BAHRA es un dataset argentino: --pais AR")
    if not os.path.exists(args.archivo):
        sys.exit(f"No existe el dataset: {args.archivo}")

    inicio = time.time()
    engine = create_async_engine(cfg.url)
    try:
        async with engine.begin() as conn:
            await conn.execute(text(DDL))
            if args.aplicar:
                await asegurar_columnas(conn)
            municipios = await _municipios(conn, pais)
            vacios = await _vacios(conn, pais)

        asentamientos = _asentamientos(args.archivo)
        sueltos = [a for a in asentamientos if not a["muni"]]
        rescatados = _por_contencion(sueltos, municipios)
        print(f"Dataset: {len(asentamientos):,} asentamientos con nombre y punto "
              f"| sin gobierno_local {len(sueltos):,}, ubicados por contorno {rescatados:,}")
        print(f"Municipios {pais} con contorno: {len(municipios):,} "
              f"| SIN nada adentro (objetivo): {len(vacios):,}")

        por_muni: dict[str, list[dict]] = {}
        for a in asentamientos:
            if a["muni"] in vacios:
                por_muni.setdefault(a["muni"], []).append(a)

        pendientes = [m for m in municipios if m["id"] in vacios]
        if args.muni:
            pendientes = [m for m in pendientes if m["id"] == args.muni]
        if args.limite:
            pendientes = pendientes[: args.limite]
        print(f"A recorrer: {len(pendientes):,} municipios"
              + ("" if args.aplicar else "  (EN SECO: no se escribe nada)"), flush=True)

        tanda: list[tuple[dict, list[dict]]] = []
        tot_filas = con_algo = 0

        async def _volcar() -> None:
            if not tanda:
                return
            async with engine.begin() as conn:
                for m, filas in tanda:
                    await _escribir(conn, m, pais, filas)
            tanda.clear()

        for i, m in enumerate(pendientes, 1):
            filas = _localidades_de(m, por_muni.get(m["id"], []))
            if not filas:
                continue
            tot_filas += len(filas)
            con_algo += 1
            if args.aplicar:
                tanda.append((m, filas))
                if len(tanda) >= TANDA:
                    await _volcar()
                    print(f"  [{i}/{len(pendientes)}] {m['provincia']}: hasta {m['nombre']} "
                          f"| {con_algo} municipios, {tot_filas:,} filas "
                          f"({time.time() - inicio:.0f}s)", flush=True)
            elif con_algo <= 40:
                print(f"[{i}/{len(pendientes)}] {m['nombre']} ({m['provincia']}): "
                      f"{len(filas)} -> {', '.join(b['nombre'] for b in filas[:4])}", flush=True)
        await _volcar()

        print(f"\n{len(pendientes):,} municipios vacios: {con_algo:,} reciben localidades "
              f"| filas {tot_filas:,} | quedan vacios {len(pendientes) - con_algo:,} "
              f"en {(time.time() - inicio) / 60:.1f} min")
        if args.aplicar:
            async with engine.connect() as conn:
                quedan = await _vacios(conn, pais)
            print(f"Municipios sin nada adentro: {len(vacios):,} -> {len(quedan):,}")
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
