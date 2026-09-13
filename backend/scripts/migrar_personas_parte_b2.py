"""Consolidación — PARTE B2: TODOS los tenants pasan al modelo Persona, SPN incluido.

Plan: `docs/tesoreria/02-plan-consolidacion.md`.

> **El objetivo es migrar San Pedro Norte, no esquivarlo** (dueño, 2026-09-06).
> Es el momento justo precisamente porque hay un solo cliente productivo: no hay
> cuarenta tenants que migrar, hay uno. Proteger a SPN dejándolo en el modelo viejo
> sería no hacer el trabajo.
>
> La prueba de paridad no está para excluirlo: está para demostrar que después de
> migrarlo **la API le sigue devolviendo exactamente lo mismo**. Eso es el éxito.

Qué hace, para todos los municipios:

1. Borra los empleados de SEMILLA DEMO sembrados en SPN (orden del dueño). Antes de
   borrar verifica que ninguno tenga reclamos, órdenes de trabajo o trámites: si
   alguno tiene trabajo real, aborta.
2. Crea la Persona de cada empleado y lo engancha a ella.
3. Crea la Persona de cada usuario DE PLANTA y lo engancha. Los VECINOS nunca entran:
   crearía una persona por ciudadano y contaminaría el padrón.
4. Normaliza `''` -> NULL en dni/cuit, que es lo que hoy impide poner un índice único
   (MySQL trata el string vacío como colisión; sólo NULL no colisiona).

Diferencias esperadas en el gate después de correrlo, todas buscadas:
  - `/api/empleados` de SPN: 7 -> 0 (los de semilla, borrados a pedido)
  - el padrón de personas suma el personal con login que antes no estaba

Es idempotente.

    python scripts/migrar_personas_parte_b2.py --dry-run
    python scripts/migrar_personas_parte_b2.py
"""
import argparse
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text  # noqa: E402
from sqlalchemy.ext.asyncio import create_async_engine  # noqa: E402

from core.config import settings  # noqa: E402

MUNICIPIO_SPN = 80
ROLES_DE_PLANTA = ("admin", "supervisor", "empleado", "operador_ventanilla")
TABLA = "contactos"  # se llamará `personas` cuando el renombre viaje junto al código


async def correr(dry_run: bool):
    engine = create_async_engine(settings.DATABASE_URL)
    hechos = []

    async with engine.begin() as conn:
        db = (await conn.execute(text("SELECT DATABASE()"))).scalar()
        print(f"Base: {db}\n")
        if "prod" in (db or "").lower():
            raise SystemExit("ABORTADO: esto no se corre contra producción.")

        # ── 1. La semilla demo que ensucia el tenant productivo ───────────────
        ids = (await conn.execute(text(
            "SELECT id FROM empleados WHERE municipio_id = :m"), {"m": MUNICIPIO_SPN})).scalars().all()
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
                    f"ABORTADO: {ocupados} reclamos/OT/trámites apuntan a esos empleados. "
                    "No son semilla descartable — revisar a mano.")
            print(f"1. SPN: {len(ids)} empleados de semilla, ninguno con trabajo asignado.")
            if not dry_run:
                await conn.execute(text(
                    "DELETE FROM empleado_categorias WHERE empleado_id IN :ids"), {"ids": tuple(ids)})
                await conn.execute(text(
                    "UPDATE usuarios SET empleado_id = NULL WHERE empleado_id IN :ids"), {"ids": tuple(ids)})
                r = await conn.execute(text(
                    "DELETE FROM empleados WHERE id IN :ids"), {"ids": tuple(ids)})
                hechos.append(f"SPN: {r.rowcount} empleados de semilla borrados")

        # ── 2. Cada empleado, su Persona (TODOS los municipios) ───────────────
        n = (await conn.execute(text(
            "SELECT COUNT(*) FROM empleados WHERE persona_id IS NULL AND municipio_id IS NOT NULL"))).scalar()
        print(f"\n2. Empleados sin Persona, en todo el sistema: {n}")
        if not dry_run and n:
            await conn.execute(text(f"""
                INSERT INTO {TABLA} (municipio_id, nombre, apellido, telefono, tipo, activo, created_at)
                SELECT e.municipio_id, e.nombre, e.apellido, e.telefono, 'empleado', 1, NOW()
                  FROM empleados e
                 WHERE e.persona_id IS NULL AND e.municipio_id IS NOT NULL
                   AND NOT EXISTS (
                       SELECT 1 FROM {TABLA} p
                        WHERE p.municipio_id = e.municipio_id
                          AND p.nombre = e.nombre
                          AND COALESCE(p.apellido,'') = COALESCE(e.apellido,''))
            """))
            r = await conn.execute(text(f"""
                UPDATE empleados e
                  JOIN {TABLA} p
                    ON p.municipio_id = e.municipio_id
                   AND p.nombre = e.nombre
                   AND COALESCE(p.apellido,'') = COALESCE(e.apellido,'')
                   SET e.persona_id = p.id
                 WHERE e.persona_id IS NULL
            """))
            hechos.append(f"{r.rowcount} empleados enlazados a su Persona")
            r = await conn.execute(text("""
                INSERT IGNORE INTO persona_roles (municipio_id, persona_id, tipo_id, principal)
                SELECT p.municipio_id, p.id, t.id, 1
                  FROM empleados e
                  JOIN contactos p ON p.id = e.persona_id
                  JOIN persona_tipos t ON t.municipio_id = p.municipio_id AND t.codigo = 'empleado'
            """))
            hechos.append(f"{r.rowcount} vínculos de empleado creados")

        # ── 3. El personal con login, su Persona (los vecinos NO) ─────────────
        n = (await conn.execute(text("""
            SELECT COUNT(*) FROM usuarios
             WHERE persona_id IS NULL AND municipio_id IS NOT NULL AND rol IN :roles"""),
            {"roles": ROLES_DE_PLANTA})).scalar()
        print(f"\n3. Personal con login sin Persona: {n} (los vecinos quedan afuera a propósito)")
        if not dry_run and n:
            await conn.execute(text(f"""
                INSERT INTO {TABLA} (municipio_id, nombre, apellido, email, telefono, dni, tipo, activo, created_at)
                SELECT u.municipio_id, u.nombre, u.apellido, u.email, u.telefono, NULLIF(u.dni,''), 'otro', 1, NOW()
                  FROM usuarios u
                 WHERE u.persona_id IS NULL AND u.municipio_id IS NOT NULL AND u.rol IN :roles
                   AND NOT EXISTS (
                       SELECT 1 FROM {TABLA} p
                        WHERE p.municipio_id = u.municipio_id
                          AND p.nombre = u.nombre
                          AND COALESCE(p.apellido,'') = COALESCE(u.apellido,''))
            """), {"roles": ROLES_DE_PLANTA})
            r = await conn.execute(text(f"""
                UPDATE usuarios u
                  JOIN {TABLA} p
                    ON p.municipio_id = u.municipio_id
                   AND p.nombre = u.nombre
                   AND COALESCE(p.apellido,'') = COALESCE(u.apellido,'')
                   SET u.persona_id = p.id
                 WHERE u.persona_id IS NULL AND u.rol IN :roles
            """), {"roles": ROLES_DE_PLANTA})
            hechos.append(f"{r.rowcount} usuarios de planta enlazados a su Persona")

        # ── 4. El string vacío que impide el índice único ─────────────────────
        vacios = (await conn.execute(text(
            f"SELECT SUM(dni=''), SUM(cuit='') FROM {TABLA}"))).first()
        print(f"\n4. Documentos en blanco a normalizar: dni={vacios[0] or 0}, cuit={vacios[1] or 0}")
        if not dry_run and (vacios[0] or vacios[1]):
            r = await conn.execute(text(
                f"UPDATE {TABLA} SET dni = NULL WHERE dni = ''"))
            r2 = await conn.execute(text(
                f"UPDATE {TABLA} SET cuit = NULL WHERE cuit = ''"))
            hechos.append(f"{r.rowcount + r2.rowcount} documentos vacíos pasados a NULL")

    # ── Verificación ──────────────────────────────────────────────────────────
    if not dry_run:
        async with engine.connect() as conn:
            r = (await conn.execute(text(f"""
                SELECT (SELECT COUNT(*) FROM empleados WHERE municipio_id = :m),
                       (SELECT COUNT(*) FROM {TABLA}   WHERE municipio_id = :m),
                       (SELECT COUNT(*) FROM empleados WHERE persona_id IS NULL),
                       (SELECT COUNT(*) FROM usuarios  WHERE persona_id IS NOT NULL),
                       (SELECT COUNT(*) FROM persona_roles)
            """), {"m": MUNICIPIO_SPN})).first()
            print("\nVerificación:")
            print(f"   SPN: {r[0]} empleados (la semilla se fue) · {r[1]} personas en el padrón")
            print(f"   empleados sin Persona en todo el sistema: {r[2]} (debe ser 0)")
            print(f"   usuarios enlazados: {r[3]} · vínculos totales: {r[4]}")

    print("\n" + ("SE HARÍA:" if dry_run else "HECHO:"))
    for h in hechos:
        print("   +", h)
    if not dry_run:
        print("\nAhora el gate. Las únicas diferencias aceptables son las buscadas:")
        print("   /api/empleados de SPN pasa de 7 a 0, y el padrón suma al personal con login.")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    asyncio.run(correr(ap.parse_args().dry_run))
