"""Auditoría PÚBLICA de las demos generadas (pantalla /demos-listado).

El dueño audita lo que el generador de demos va creando: cuántos barrios
obtuvo cada demo, cuántos con polígono real, zonas, catálogos y seeds. La
pantalla calcula el score de integridad; acá van los NÚMEROS CRUDOS, cada
familia en su try (la tabla `barrios` es nueva y puede no existir todavía
en un ambiente — una métrica ausente vale 0, no tira el endpoint).

Sin auth a pedido del dueño (2026-09-03): son demos con datos de ejemplo,
la auditoría no expone nada que la vitrina /demo no muestre ya.
"""
from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db

router = APIRouter()

# Conteos por municipio demo. Cada entrada: clave de salida -> (SQL, campos).
# Todas agrupan por municipio_id y filtran por la subquery de demos, así no
# hace falta expandir binds ni depender de modelos aún no commiteados.
_DEMOS = "SELECT id FROM municipios WHERE es_demo = 1"

_METRICAS = {
    "barrios": (
        "SELECT municipio_id, COUNT(*) AS total, "
        "SUM(CASE WHEN poligono IS NOT NULL AND poligono != '' THEN 1 ELSE 0 END) AS con_poligono "
        f"FROM barrios WHERE municipio_id IN ({_DEMOS}) GROUP BY municipio_id",
        ("barrios_total", "barrios_con_poligono"),
    ),
    "zonas": (
        "SELECT municipio_id, COUNT(*) AS total, "
        "SUM(CASE WHEN poligono IS NOT NULL AND poligono != '' THEN 1 ELSE 0 END) AS con_poligono "
        f"FROM zonas WHERE municipio_id IN ({_DEMOS}) GROUP BY municipio_id",
        ("zonas_total", "zonas_con_poligono"),
    ),
    "cat_reclamo": (
        f"SELECT municipio_id, COUNT(*) AS total FROM categorias_reclamo "
        f"WHERE municipio_id IN ({_DEMOS}) GROUP BY municipio_id",
        ("categorias_reclamo",),
    ),
    "cat_tramite": (
        f"SELECT municipio_id, COUNT(*) AS total FROM categorias_tramite "
        f"WHERE municipio_id IN ({_DEMOS}) GROUP BY municipio_id",
        ("categorias_tramite",),
    ),
    "usuarios": (
        f"SELECT municipio_id, COUNT(*) AS total FROM usuarios "
        f"WHERE municipio_id IN ({_DEMOS}) GROUP BY municipio_id",
        ("usuarios",),
    ),
    "reclamos": (
        f"SELECT municipio_id, COUNT(*) AS total FROM reclamos "
        f"WHERE municipio_id IN ({_DEMOS}) GROUP BY municipio_id",
        ("reclamos",),
    ),
    "solicitudes": (
        f"SELECT municipio_id, COUNT(*) AS total FROM solicitudes "
        f"WHERE municipio_id IN ({_DEMOS}) GROUP BY municipio_id",
        ("solicitudes",),
    ),
    "noticias": (
        f"SELECT municipio_id, COUNT(*) AS total FROM noticias "
        f"WHERE municipio_id IN ({_DEMOS}) GROUP BY municipio_id",
        ("noticias",),
    ),
}


@router.get("/auditoria")
async def auditoria_demos(db: AsyncSession = Depends(get_db)):
    munis = (
        await db.execute(text(
            "SELECT id, codigo, nombre, pais, activo, "
            "(limites_geojson IS NOT NULL) AS con_contorno "
            "FROM municipios WHERE es_demo = 1"
        ))
    ).mappings().all()

    por_id = {
        m["id"]: {
            "id": m["id"],
            "codigo": m["codigo"],
            "nombre": m["nombre"],
            "pais": m["pais"],
            "activo": bool(m["activo"]),
            "con_contorno": bool(m["con_contorno"]),
            # Toda métrica arranca en 0: una tabla ausente no rompe la fila.
            "barrios_total": 0,
            "barrios_con_poligono": 0,
            "zonas_total": 0,
            "zonas_con_poligono": 0,
            "categorias_reclamo": 0,
            "categorias_tramite": 0,
            "usuarios": 0,
            "reclamos": 0,
            "solicitudes": 0,
            "noticias": 0,
        }
        for m in munis
    }

    for sql, campos in _METRICAS.values():
        try:
            filas = (await db.execute(text(sql))).all()
        except Exception:
            # Tabla inexistente en este ambiente (p. ej. `barrios` recién
            # nace): la métrica queda en 0 para todas las demos.
            continue
        for fila in filas:
            destino = por_id.get(fila[0])
            if destino is None:
                continue
            for i, campo in enumerate(campos):
                destino[campo] = int(fila[i + 1] or 0)

    return list(por_id.values())
