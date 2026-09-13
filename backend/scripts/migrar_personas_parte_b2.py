"""Consolidación — PARTE B2: los tenants pasan al modelo Persona (backfills).

Plan: `docs/tesoreria/04-plan-integral-persona-y-obras.md` (F1 demos, F3 SPN) y la
revisión `03-revision-fable-y-plan-contingencia.md` (hallazgos 3 a 6, corregidos acá).

Qué hace, por municipio:

1. [sólo SPN, sólo sin --sin-spn] Borra los 7 empleados de SEMILLA DEMO de San Pedro Norte
   (orden del dueño, 2026-09-06). Antes verifica que ninguno tenga reclamos, órdenes de
   trabajo o trámites, y RESPALDA a JSON las filas y sus dependientes.
2. Crea la Persona de cada empleado (ficha laboral) y lo engancha. Si el nombre coincide
   con MÁS de una persona del municipio, ese empleado se reporta y no se enlaza solo.
3. Crea la Persona del personal con login ACTIVO (roles de planta) como `empleado`, con su vínculo
   en `persona_roles`. Los VECINOS nunca entran: crearía una persona por ciudadano.
4. Normaliza `''` -> NULL en dni/cuit (MySQL trata el string vacío como colisión).

`--sin-spn` (F1): todo lo anterior EXCEPTO San Pedro Norte, que queda intacto hasta la
F3. Después de correrlo con esa bandera, el gate de paridad de SPN debe dar CERO.

Es idempotente.

    python scripts/migrar_personas_parte_b2.py --dry-run --sin-spn
    python scripts/migrar_personas_parte_b2.py --sin-spn
    python scripts/migrar_personas_parte_b2.py            # F3: SPN incluido
"""
import argparse
import asyncio
import json
import os
import sys
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text  # noqa: E402
from sqlalchemy.ext.asyncio import create_async_engine  # noqa: E402

from core.config import settings  # noqa: E402

MUNICIPIO_SPN = 80
ROLES_DE_PLANTA = ("admin", "supervisor", "empleado", "operador_ventanilla")
TABLA = "contactos"  # se llamará `personas` en la fase 2 de la noche (03-...md §6.3)

CARPETA_RESPALDO = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(
    os.path.abspath(__file__)))), "_paridad")
TABLAS_DEPENDIENTES_EMPLEADO = (
    "empleado_categorias", "empleado_cuadrillas", "empleado_horarios",
    "empleado_ausencias", "empleado_capacitaciones", "empleado_jornadas", "empleado_metricas",
)


async def _respaldar_empleados(conn, ids):
    respaldo = {"generado": datetime.now().isoformat(), "empleados": [], "dependientes": {}}
    filas = (await conn.execute(text(
        "SELECT * FROM empleados WHERE id IN :ids"), {"ids": tuple(ids)})).mappings().all()
    respaldo["empleados"] = [dict(f) for f in filas]
    for tabla in TABLAS_DEPENDIENTES_EMPLEADO:
        try:
            dep = (await conn.execute(text(
                f"SELECT * FROM {tabla} WHERE empleado_id IN :ids"), {"ids": tuple(ids)})).mappings().all()
        except Exception:
            continue
        if dep:
            respaldo["dependientes"][tabla] = [dict(f) for f in dep]
    os.makedirs(CARPETA_RESPALDO, exist_ok=True)
    ruta = os.path.join(CARPETA_RESPALDO, "respaldo_empleados_semilla_spn.json")
    with open(ruta, "w", encoding="utf-8") as f:
        json.dump(respaldo, f, ensure_ascii=False, indent=2, default=str)
    return ruta


async def correr(dry_run: bool, sin_spn: bool):
    engine = create_async_engine(settings.DATABASE_URL)
    hechos = []
    # Filtro de tenant para los pasos 2 a 4 (con alias de tabla donde hace falta).
    def excl(alias=""):
        col = f"{alias}.municipio_id" if alias else "municipio_id"
        return f"AND {col} <> :spn" if sin_spn else ""
    p = {"spn": MUNICIPIO_SPN}

    async with engine.begin() as conn:
        db = (await conn.execute(text("SELECT DATABASE()"))).scalar()
        print(f"Base: {db} · {'SIN San Pedro Norte (F1)' if sin_spn else 'SPN incluido (F3)'}\n")
        if "prod" in (db or "").lower():
            raise SystemExit("ABORTADO: esto no se corre contra producción desde acá.")

        # ── 1. La semilla demo que ensucia el tenant productivo (sólo F3) ────
        if sin_spn:
            print("1. SPN no se toca en esta corrida.")
        else:
            ids = (await conn.execute(text(
                "SELECT id FROM empleados WHERE municipio_id = :spn"), p)).scalars().all()
            if not ids:
                print("1. SPN ya no tiene empleados de semilla.")
            else:
                ocupados = (await conn.execute(text("""
                    SELECT COUNT(*) FROM (
                        SELECT empleado_id FROM reclamos        WHERE empleado_id IN :ids
                        UNION ALL
                        SELECT empleado_id FROM ordenes_trabajo WHERE empleado_id IN :ids
                        UNION ALL
                        SELECT empleado_id FROM solicitudes     WHERE empleado_id IN :ids
                    ) x"""), {"ids": tuple(ids)})).scalar()
                if ocupados:
                    raise SystemExit(
                        f"ABORTADO: {ocupados} reclamos/OT/trámites apuntan a esos empleados. Revisar a mano.")
                print(f"1. SPN: {len(ids)} empleados de semilla, ninguno con trabajo asignado.")
                if not dry_run:
                    ruta = await _respaldar_empleados(conn, ids)
                    print(f"   respaldo escrito en {ruta}")
                    await conn.execute(text(
                        "DELETE FROM empleado_categorias WHERE empleado_id IN :ids"), {"ids": tuple(ids)})
                    await conn.execute(text(
                        "UPDATE usuarios SET empleado_id = NULL WHERE empleado_id IN :ids"), {"ids": tuple(ids)})
                    r = await conn.execute(text(
                        "DELETE FROM empleados WHERE id IN :ids"), {"ids": tuple(ids)})
                    hechos.append(f"SPN: {r.rowcount} empleados de semilla borrados (respaldados)")

        # ── 2. Cada empleado, su Persona ──────────────────────────────────────
        n = (await conn.execute(text(
            f"SELECT COUNT(*) FROM empleados WHERE persona_id IS NULL AND municipio_id IS NOT NULL {excl()}"), p)).scalar()
        print(f"\n2. Empleados sin Persona: {n}")
        ambiguos = (await conn.execute(text(f"""
            SELECT e.id, e.municipio_id, e.nombre, e.apellido, COUNT(p.id) coincidencias
              FROM empleados e
              JOIN {TABLA} p
                ON p.municipio_id = e.municipio_id
               AND p.nombre = e.nombre
               AND COALESCE(p.apellido,'') = COALESCE(e.apellido,'')
             WHERE e.persona_id IS NULL AND e.municipio_id IS NOT NULL {excl('e')}
             GROUP BY e.id, e.municipio_id, e.nombre, e.apellido
            HAVING COUNT(p.id) > 1
        """), p)).fetchall()
        ids_ambiguos = tuple(a[0] for a in ambiguos) or (0,)
        if ambiguos:
            print(f"   {len(ambiguos)} empleados con nombre repetido en el padrón, NO se enlazan solos:")
            for a in ambiguos:
                print(f"      empleado {a[0]} (muni {a[1]}) {a[2]} {a[3]}: {a[4]} personas con ese nombre")
        if not dry_run and n:
            await conn.execute(text(f"""
                INSERT INTO {TABLA} (municipio_id, nombre, apellido, telefono, tipo, activo, created_at)
                SELECT e.municipio_id, e.nombre, e.apellido, e.telefono, 'empleado', 1, NOW()
                  FROM empleados e
                 WHERE e.persona_id IS NULL AND e.municipio_id IS NOT NULL {excl('e')}
                   AND NOT EXISTS (
                       SELECT 1 FROM {TABLA} p
                        WHERE p.municipio_id = e.municipio_id
                          AND p.nombre = e.nombre
                          AND COALESCE(p.apellido,'') = COALESCE(e.apellido,''))
            """), p)
            r = await conn.execute(text(f"""
                UPDATE empleados e
                  JOIN {TABLA} p
                    ON p.municipio_id = e.municipio_id
                   AND p.nombre = e.nombre
                   AND COALESCE(p.apellido,'') = COALESCE(e.apellido,'')
                   SET e.persona_id = p.id
                 WHERE e.persona_id IS NULL AND e.id NOT IN :ambiguos {excl('e')}
            """), {**p, "ambiguos": ids_ambiguos})
            hechos.append(f"{r.rowcount} empleados enlazados a su Persona"
                          + (f" ({len(ambiguos)} ambiguos quedan para resolver a mano)" if ambiguos else ""))
            r = await conn.execute(text(f"""
                INSERT IGNORE INTO persona_roles (municipio_id, persona_id, tipo_id, principal)
                SELECT p.municipio_id, p.id, t.id, 1
                  FROM empleados e
                  JOIN {TABLA} p ON p.id = e.persona_id
                  JOIN persona_tipos t ON t.municipio_id = p.municipio_id AND t.codigo = 'empleado'
            """))
            hechos.append(f"{r.rowcount} vínculos de empleado creados")

        # ── 3. El personal con login, su Persona (los vecinos NO) ─────────────
        n = (await conn.execute(text(f"""
            SELECT COUNT(*) FROM usuarios
             WHERE persona_id IS NULL AND municipio_id IS NOT NULL AND activo = 1 AND rol IN :roles {excl()}"""),
            {**p, "roles": ROLES_DE_PLANTA})).scalar()
        print(f"\n3. Personal con login sin Persona: {n} (los vecinos quedan afuera a propósito)")
        if not dry_run and n:
            await conn.execute(text(f"""
                INSERT INTO {TABLA} (municipio_id, nombre, apellido, email, telefono, dni, tipo, activo, created_at)
                SELECT u.municipio_id, u.nombre, u.apellido, u.email, u.telefono, NULLIF(u.dni,''), 'empleado', 1, NOW()
                  FROM usuarios u
                 WHERE u.persona_id IS NULL AND u.municipio_id IS NOT NULL AND u.activo = 1 AND u.rol IN :roles {excl('u')}
                   AND NOT EXISTS (
                       SELECT 1 FROM {TABLA} p
                        WHERE p.municipio_id = u.municipio_id
                          AND p.nombre = u.nombre
                          AND COALESCE(p.apellido,'') = COALESCE(u.apellido,''))
            """), {**p, "roles": ROLES_DE_PLANTA})
            r = await conn.execute(text(f"""
                UPDATE usuarios u
                  JOIN {TABLA} p
                    ON p.municipio_id = u.municipio_id
                   AND p.nombre = u.nombre
                   AND COALESCE(p.apellido,'') = COALESCE(u.apellido,'')
                   SET u.persona_id = p.id
                 WHERE u.persona_id IS NULL AND u.activo = 1 AND u.rol IN :roles {excl('u')}
            """), {**p, "roles": ROLES_DE_PLANTA})
            hechos.append(f"{r.rowcount} usuarios de planta enlazados a su Persona")
            r = await conn.execute(text(f"""
                INSERT IGNORE INTO persona_roles (municipio_id, persona_id, tipo_id, principal)
                SELECT p.municipio_id, p.id, t.id, 1
                  FROM usuarios u
                  JOIN {TABLA} p ON p.id = u.persona_id
                  JOIN persona_tipos t ON t.municipio_id = p.municipio_id AND t.codigo = p.tipo
                 WHERE u.rol IN :roles
            """), {"roles": ROLES_DE_PLANTA})
            hechos.append(f"{r.rowcount} vínculos de personal con login creados")

        # ── 4. El string vacío que impide el índice único ─────────────────────
        vacios = (await conn.execute(text(
            f"SELECT SUM(dni=''), SUM(cuit='') FROM {TABLA} WHERE 1=1 {excl()}"), p)).first()
        print(f"\n4. Documentos en blanco a normalizar: dni={vacios[0] or 0}, cuit={vacios[1] or 0}")
        if not dry_run and (vacios[0] or vacios[1]):
            r = await conn.execute(text(f"UPDATE {TABLA} SET dni = NULL WHERE dni = '' {excl()}"), p)
            r2 = await conn.execute(text(f"UPDATE {TABLA} SET cuit = NULL WHERE cuit = '' {excl()}"), p)
            hechos.append(f"{r.rowcount + r2.rowcount} documentos vacíos pasados a NULL")

    # ── Verificación ──────────────────────────────────────────────────────────
    if not dry_run:
        async with engine.connect() as conn:
            r = (await conn.execute(text(f"""
                SELECT (SELECT COUNT(*) FROM empleados WHERE municipio_id = :spn),
                       (SELECT COUNT(*) FROM {TABLA}   WHERE municipio_id = :spn),
                       (SELECT COUNT(*) FROM empleados WHERE persona_id IS NULL AND municipio_id IS NOT NULL {excl()}),
                       (SELECT COUNT(*) FROM usuarios  WHERE persona_id IS NOT NULL),
                       (SELECT COUNT(*) FROM persona_roles)
            """), p)).first()
            print("\nVerificación:")
            print(f"   SPN: {r[0]} empleados · {r[1]} personas en el padrón" + (" (sin cambios, F1)" if sin_spn else ""))
            print(f"   empleados sin Persona en el alcance: {r[2]} (debe ser 0, salvo ambiguos)")
            print(f"   usuarios enlazados: {r[3]} · vínculos totales: {r[4]}")

    await engine.dispose()
    print("\n" + ("SE HARÍA:" if dry_run else "HECHO:"))
    for h in hechos:
        print("   +", h)
    print("\nAhora el gate contra el patrón de SPN:" + (" debe dar CERO (SPN no se tocó)." if sin_spn
          else " sólo las diferencias buscadas (empleados de SPN 7 -> 0; el padrón suma el personal con login)."))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--sin-spn", action="store_true", help="F1: todos los municipios menos San Pedro Norte")
    a = ap.parse_args()
    asyncio.run(correr(a.dry_run, a.sin_spn))
