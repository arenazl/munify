# -*- coding: utf-8 -*-
"""Territorio: el catalogo de cartografia offline, para MIRARLO.

Pedido del dueno (2026-09-03): "una pantallita en Munify para poder ver esto de
forma tangible... recorriendo pais, provincia, municipio... de donde salio el
dato, en que municipio se llenó con barrio, en cual con localidad, en cual
zona... no para hacer curaciones desde ahi". La curacion sigue siendo offline
(`scripts/geo/`); esta API es SOLO LECTURA y es cross-tenant a proposito: el
catalogo (`municipios_catalogo` + `catalogo_barrios`) es global, no de un
municipio. Gate: `require_super_admin`, como el resto del area de super admin.

Las tablas del catalogo no tienen modelo ORM (las escriben los scripts, el
backend solo las lee: ver `services/geo_ciudad.barrios_del_catalogo`), asi que
las consultas van con `text()`.

Como se describe un municipio ("relleno"), con la MISMA regla que usa la
semilla para dibujar (solo filas `hoja = 1`):
  - `barrios`      lo que se dibuja son mayormente barrios (admin9/10, suburb,
                   quarter, neighbourhood)
  - `localidades`  lo que se dibuja son mayormente localidades (town, city,
                   village, hamlet, o filas del padron georef)
  - `zona`         no hay nada que dibujar: la demo nace con la zona unica sola
  - `sin_contorno` el catalogo no tiene el contorno del municipio (no se puede
                   sembrar nada adentro)
"""
import json
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from core.audit_helpers import require_super_admin
from core.database import get_db
from models.user import User

router = APIRouter()

# Misma lista que `scripts/geo/_hojas.py` (TIPOS_LOCALIDAD): el backend no
# importa de scripts/, asi que se repite aca con el puntero. Son constantes,
# por eso van inline en el SQL y no como bind (un IN con lista necesita
# `expanding=True` y no suma nada aca).
TIPOS_LOCALIDAD = ("town", "city", "village", "hamlet", "localidad")
FUENTE_PADRON = "georef"
_TIPOS_LOC_SQL = "(" + ", ".join(f"'{t}'" for t in TIPOS_LOCALIDAD) + ")"

_CONTEOS_SQL = """
SELECT c.id, c.nombre, c.pais, c.provincia, c.lat, c.lng,
       (c.poligono IS NOT NULL) AS con_contorno,
       COALESCE(b.filas, 0)        AS filas,
       COALESCE(b.hojas, 0)        AS hojas,
       COALESCE(b.hojas_poli, 0)   AS hojas_poli,
       COALESCE(b.hojas_loc, 0)    AS hojas_loc,
       COALESCE(b.hojas_osm, 0)    AS hojas_osm,
       COALESCE(b.hojas_padron, 0) AS hojas_padron
FROM municipios_catalogo c
LEFT JOIN (
    SELECT municipio_catalogo_id,
           COUNT(*)                                            AS filas,
           SUM(hoja)                                           AS hojas,
           SUM(hoja AND poligono IS NOT NULL)                  AS hojas_poli,
           SUM(hoja AND (fuente = :padron OR tipo IN {tipos_loc})) AS hojas_loc,
           SUM(hoja AND fuente = 'osm_pbf')                    AS hojas_osm,
           SUM(hoja AND fuente = :padron)                      AS hojas_padron
    FROM catalogo_barrios
    {filtro_barrios}
    GROUP BY municipio_catalogo_id
) b ON b.municipio_catalogo_id = c.id
{filtro_munis}
ORDER BY c.provincia, c.nombre
"""


def _relleno(con_contorno: bool, hojas: int, hojas_loc: int) -> str:
    if not con_contorno:
        return "sin_contorno"
    if hojas == 0:
        return "zona"
    return "localidades" if hojas_loc * 2 > hojas else "barrios"


def _fila_municipio(r) -> dict:
    hojas = int(r.hojas)
    return {
        "id": r.id,
        "nombre": r.nombre,
        "pais": r.pais,
        "provincia": r.provincia,
        "lat": float(r.lat) if r.lat is not None else None,
        "lng": float(r.lng) if r.lng is not None else None,
        "con_contorno": bool(r.con_contorno),
        "filas": int(r.filas),
        "hojas": hojas,
        "hojas_poli": int(r.hojas_poli),
        "hojas_loc": int(r.hojas_loc),
        "hojas_osm": int(r.hojas_osm),
        "hojas_padron": int(r.hojas_padron),
        "respaldo": int(r.filas) - hojas,
        "relleno": _relleno(bool(r.con_contorno), hojas, int(r.hojas_loc)),
    }


async def _conteos(db: AsyncSession, pais: Optional[str]) -> list[dict]:
    sql = _CONTEOS_SQL.format(
        tipos_loc=_TIPOS_LOC_SQL,
        filtro_barrios="WHERE pais = :pais" if pais else "",
        filtro_munis="WHERE c.pais = :pais" if pais else "",
    )
    params = {"padron": FUENTE_PADRON}
    if pais:
        params["pais"] = pais
    filas = (await db.execute(text(sql), params)).fetchall()
    return [_fila_municipio(r) for r in filas]


def _agregar(municipios: list[dict]) -> dict:
    """Los totales de un conjunto de municipios, con el desglose por relleno."""
    agg = {
        "municipios": len(municipios),
        "barrios": 0, "localidades": 0, "zona": 0, "sin_contorno": 0,
        "hojas": 0, "hojas_poli": 0, "hojas_osm": 0, "hojas_padron": 0, "respaldo": 0,
        "dibujados": 0,
    }
    for m in municipios:
        agg[m["relleno"]] += 1
        for k in ("hojas", "hojas_poli", "hojas_osm", "hojas_padron", "respaldo"):
            agg[k] += m[k]
        # "dibujado": la mayoria de lo que se muestra tiene contorno.
        if m["hojas"] and m["hojas_poli"] * 2 >= m["hojas"]:
            agg["dibujados"] += 1
    return agg


@router.get("/admin/territorio/paises")
async def paises(
    _: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    """Un renglon por pais del catalogo con sus totales: es el primer nivel
    del recorrido y lo que alimenta el hero cuando se mira un pais entero."""
    todos = await _conteos(db, None)
    por_pais: dict[str, list[dict]] = {}
    for m in todos:
        por_pais.setdefault(m["pais"], []).append(m)
    return {
        "items": [
            {"pais": p, **_agregar(ms)}
            for p, ms in sorted(por_pais.items(), key=lambda kv: -len(kv[1]))
        ]
    }


@router.get("/admin/territorio/municipios")
async def municipios(
    pais: str = Query(..., min_length=2, max_length=2),
    _: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    """TODOS los municipios de un pais con sus conteos (sin geometria): con
    esto el front dibuja el mapa de puntos del pais, arma las provincias y
    filtra por provincia sin volver a pedir. AR son ~2.000 filas chicas."""
    ms = await _conteos(db, pais.upper())
    por_prov: dict[str, list[dict]] = {}
    for m in ms:
        por_prov.setdefault(m["provincia"] or "(sin provincia)", []).append(m)
    return {
        "pais": pais.upper(),
        "total": _agregar(ms),
        "provincias": [
            {"provincia": p, **_agregar(lista)}
            for p, lista in sorted(por_prov.items(), key=lambda kv: kv[0])
        ],
        "items": ms,
    }


def _anillo(poligono) -> Optional[list]:
    if not poligono:
        return None
    try:
        p = json.loads(poligono) if isinstance(poligono, str) else poligono
    except (ValueError, TypeError):
        return None
    return p if isinstance(p, list) and len(p) >= 3 else None


@router.get("/admin/territorio/municipios/{municipio_id}")
async def detalle_municipio(
    municipio_id: str,
    _: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    """Un municipio con su contorno y TODAS sus filas del catalogo: las que se
    dibujan (`hoja = 1`) y las de respaldo con el motivo por el que la regla
    las dejo afuera. Es la pantalla donde el dueno compara con la realidad."""
    m = (await db.execute(text(
        "SELECT id, nombre, pais, provincia, lat, lng, poligono, osm_id "
        "FROM municipios_catalogo WHERE id = :id"), {"id": municipio_id})).fetchone()
    if not m:
        raise HTTPException(status_code=404, detail="Municipio no encontrado en el catalogo")

    filas = (await db.execute(text(
        "SELECT id, nombre, tipo, fuente, lat, lon, poligono, vertices, osm_id, hoja, motivo_hoja "
        "FROM catalogo_barrios WHERE municipio_catalogo_id = :id "
        "ORDER BY hoja DESC, nombre"), {"id": municipio_id})).fetchall()

    barrios = []
    for f in filas:
        nivel = "localidad" if (f.fuente == FUENTE_PADRON or f.tipo in TIPOS_LOCALIDAD) else "barrio"
        barrios.append({
            "id": f.id,
            "nombre": f.nombre,
            "tipo": f.tipo,
            "nivel": nivel,
            "fuente": f.fuente,
            "lat": float(f.lat) if f.lat is not None else None,
            "lon": float(f.lon) if f.lon is not None else None,
            "poligono": _anillo(f.poligono),
            "vertices": f.vertices,
            "osm_id": f.osm_id,
            "hoja": bool(f.hoja),
            "motivo_hoja": f.motivo_hoja,
        })

    hojas = [b for b in barrios if b["hoja"]]
    return {
        "municipio": {
            "id": m.id,
            "nombre": m.nombre,
            "pais": m.pais,
            "provincia": m.provincia,
            "lat": float(m.lat) if m.lat is not None else None,
            "lng": float(m.lng) if m.lng is not None else None,
            "osm_id": m.osm_id,
            "poligono": _anillo(m.poligono),
        },
        "resumen": {
            "filas": len(barrios),
            "hojas": len(hojas),
            "hojas_poli": sum(1 for b in hojas if b["poligono"]),
            "hojas_loc": sum(1 for b in hojas if b["nivel"] == "localidad"),
            "hojas_osm": sum(1 for b in hojas if b["fuente"] == "osm_pbf"),
            "hojas_padron": sum(1 for b in hojas if b["fuente"] == FUENTE_PADRON),
            "respaldo": len(barrios) - len(hojas),
            "relleno": _relleno(m.poligono is not None, len(hojas),
                                sum(1 for b in hojas if b["nivel"] == "localidad")),
        },
        "barrios": barrios,
    }
