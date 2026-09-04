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
from pydantic import BaseModel, Field
from sqlalchemy import not_, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from core.audit_helpers import require_super_admin
from core.database import get_db
from models.user import User

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
async def auditoria_demos(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    # Sólo super admin (dueño, 2026-09-03): la auditoría de demos ya no es
    # pública — se mira desde adentro de la app, en el panel del super admin.
    from services.demo_borrado import es_intocable

    munis = (
        await db.execute(text(
            "SELECT id, codigo, nombre, pais, provincia, activo, demo_protegido, "
            "demo_publica, created_at, (limites_geojson IS NOT NULL) AS con_contorno "
            "FROM municipios WHERE es_demo = 1"
        ))
    ).mappings().all()

    por_id = {
        m["id"]: {
            "id": m["id"],
            "codigo": m["codigo"],
            "nombre": m["nombre"],
            "pais": m["pais"],
            "provincia": m["provincia"],
            "activo": bool(m["activo"]),
            "con_pin": bool(m["demo_protegido"]),
            "de_muestra": bool(m["demo_publica"]),
            # Blindada por código (services/demo_borrado.CODIGOS_INTOCABLES):
            # la pantalla no le ofrece el tacho y la purga la rechaza.
            "intocable": es_intocable(m["id"], m["codigo"]),
            "created_at": m["created_at"],
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

    # El CONTORNO del municipio vive en el polígono de la zona única: la
    # semilla lo copia desde `municipios_catalogo` (la zona ES el municipio).
    # `municipios.limites_geojson` no lo escribe ningún proceso — leído solo,
    # daba "Falta" en las 22 demos de QA y las 6 de prod (dueño, 2026-09-03:
    # "esto es falso"). Se mantiene como fuente alternativa por si algún día
    # se llena, pero la verdad operativa es la zona con polígono.
    for d in por_id.values():
        d["con_contorno"] = bool(d["con_contorno"]) or d["zonas_con_poligono"] > 0

    # Cobertura del CATÁLOGO por país y provincia: cuántos municipios enumera
    # y cuántos tienen contorno oficial. El dueño lo quiere en la pantalla,
    # por país, no como dato suelto en una conversación (2026-09-03).
    try:
        catalogo = [
            {"pais": r[0], "provincia": r[1], "total": int(r[2] or 0), "con_contorno": int(r[3] or 0)}
            for r in (await db.execute(text(
                "SELECT pais, provincia, COUNT(*), "
                "SUM(poligono IS NOT NULL AND poligono <> '') "
                "FROM municipios_catalogo GROUP BY pais, provincia"
            ))).all()
        ]
    except Exception:
        catalogo = []

    return {"demos": list(por_id.values()), "catalogo": catalogo}


# ============================================================
# PURGA desde /demos-listado (dueño, 2026-09-03): borrar una demo
# o un grupo entero desde la pantalla, sin llave ni PIN — pero SOLO
# con sesión de SUPER ADMIN (municipio_id None). Ver la auditoría es
# público; borrar exige la credencial más alta: un DELETE anónimo de
# demos es vandalismo servido (la llave por-demo del endpoint público
# sigue vigente para el flujo del generador).
# Reusa el cascade guiado por esquema de services/demo_borrado.py y
# TODOS sus guards de datos: municipios intocables, usuarios reales
# y la demo de muestra (demo_publica) no se tocan ni con super admin.
# ============================================================

class PurgaRequest(BaseModel):
    municipio_ids: list[int] = Field(min_length=1, max_length=200)


@router.post("/purga")
async def purgar_demos(
    payload: PurgaRequest,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    from services.demo_borrado import (
        PATRONES_EMAIL_DEMO,
        borrar_municipio,
        es_intocable,
    )

    resultados = []
    for mid in payload.municipio_ids:
        fila = (
            await db.execute(text(
                "SELECT codigo, es_demo, demo_publica FROM municipios WHERE id = :id"
            ), {"id": mid})
        ).first()
        if fila is None:
            resultados.append({"id": mid, "ok": False, "motivo": "no existe"})
            continue
        codigo, es_demo, demo_publica = fila
        if es_intocable(mid, codigo):
            resultados.append({
                "id": mid, "codigo": codigo, "ok": False,
                "motivo": "blindada: no se borra desde ningún proceso",
            })
            continue
        if not es_demo:
            resultados.append({"id": mid, "codigo": codigo, "ok": False, "motivo": "no es demo"})
            continue
        if demo_publica:
            resultados.append({
                "id": mid, "codigo": codigo, "ok": False,
                "motivo": "es la demo de muestra (se apaga por base, no desde acá)",
            })
            continue
        # Usuarios REALES adentro ⇒ no se toca (mismo criterio que el
        # endpoint público de borrado).
        con_reales = (
            await db.execute(
                select(User.id).where(
                    User.municipio_id == mid,
                    not_(or_(*[User.email.like(p) for p in PATRONES_EMAIL_DEMO])),
                ).limit(1)
            )
        ).first()
        if con_reales:
            resultados.append({
                "id": mid, "codigo": codigo, "ok": False,
                "motivo": "tiene usuarios reales",
            })
            continue
        try:
            filas_borradas = await borrar_municipio(db, mid)
            await db.commit()
            resultados.append({
                "id": mid, "codigo": codigo, "ok": True,
                "filas": sum(filas_borradas.values()),
            })
        except Exception as e:  # una demo que falla no frena la purga del resto
            await db.rollback()
            resultados.append({"id": mid, "codigo": codigo, "ok": False, "motivo": str(e)[:200]})

    borradas = sum(1 for r in resultados if r["ok"])
    return {"borradas": borradas, "total": len(resultados), "resultados": resultados}
