"""Consolidación de Tesorería — MIGRACIÓN PARTE A (estructura y catálogo).

Plan: `docs/tesoreria/02-plan-consolidacion.md`.

Esta parte es DELIBERADAMENTE INOFENSIVA: agrega columnas nullable y dos tablas
nuevas que ningún endpoint viejo lee todavía. No modifica una sola fila existente.
Después de correrla, la prueba de paridad debe dar DIFERENCIA CERO — si da otra
cosa, algo de acá se filtró a una respuesta y hay que revisarlo antes de seguir.

Lo que NO hace (queda para la Parte B, cada cosa con su análisis de impacto):
  - el `RENAME TABLE contactos TO personas` (cambio coordinado con el modelo)
  - el backfill de `empleados` -> Persona (agregaría 7 filas al padrón de SPN y
    rompería la paridad de `/api/tesoreria/contactos`)
  - la normalización `''` -> NULL en dni/cuit (cambiaría "" por null en las respuestas)

Es idempotente: se puede correr las veces que haga falta.

    python scripts/migrar_personas_parte_a.py            # aplica
    python scripts/migrar_personas_parte_a.py --dry-run  # sólo dice qué haría
"""
import argparse
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text  # noqa: E402
from sqlalchemy.ext.asyncio import create_async_engine  # noqa: E402

from core.config import settings  # noqa: E402

# Los tipos que hoy viven en el enum `contactos.tipo`, con su lectura de negocio.
# `cobra` distingue al que recibe dinero del vínculo meramente institucional
# (un intendente de otro municipio es un contacto, no un beneficiario).
TIPOS_SEMILLA = [
    # codigo,        nombre,          orden, cobra
    ("empleado",     "Empleado",         10, True),
    ("proveedor",    "Proveedor",        20, True),
    ("contratista",  "Contratista",      30, True),
    ("profesional",  "Profesional",      40, True),
    ("concejal",     "Concejal",         50, True),
    ("beneficiario", "Beneficiario",     60, True),
    ("otro",         "Otro",             90, True),
]


async def _existe_tabla(conn, nombre):
    r = await conn.execute(text(
        "SELECT COUNT(*) FROM information_schema.tables "
        "WHERE table_schema=DATABASE() AND table_name=:n"), {"n": nombre})
    return r.scalar() > 0


async def _existe_columna(conn, tabla, columna):
    r = await conn.execute(text(
        "SELECT COUNT(*) FROM information_schema.columns "
        "WHERE table_schema=DATABASE() AND table_name=:t AND column_name=:c"),
        {"t": tabla, "c": columna})
    return r.scalar() > 0


async def migrar(dry_run: bool):
    engine = create_async_engine(settings.DATABASE_URL)
    hechos, salteados = [], []

    async with engine.begin() as conn:
        db = (await conn.execute(text("SELECT DATABASE()"))).scalar()
        print(f"Base: {db}\n")
        if "prod" in (db or "").lower():
            raise SystemExit("ABORTADO: esto no se corre contra producción.")

        # ---- 1. catálogo de tipos, editable por municipio ----------------
        if await _existe_tabla(conn, "persona_tipos"):
            salteados.append("tabla persona_tipos (ya existe)")
        else:
            if not dry_run:
                await conn.execute(text("""
                    CREATE TABLE persona_tipos (
                        id            INT AUTO_INCREMENT PRIMARY KEY,
                        municipio_id  INT NOT NULL,
                        codigo        VARCHAR(40)  NOT NULL,
                        nombre        VARCHAR(100) NOT NULL,
                        descripcion   TEXT NULL,
                        color         VARCHAR(20) NULL,
                        icono         VARCHAR(60) NULL,
                        orden         INT NOT NULL DEFAULT 0,
                        cobra         TINYINT(1) NOT NULL DEFAULT 1,
                        activo        TINYINT(1) NOT NULL DEFAULT 1,
                        created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
                        updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                        UNIQUE KEY uq_persona_tipo_muni_codigo (municipio_id, codigo),
                        KEY ix_persona_tipos_municipio (municipio_id),
                        CONSTRAINT fk_persona_tipos_muni FOREIGN KEY (municipio_id)
                            REFERENCES municipios(id) ON DELETE CASCADE
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                """))
            hechos.append("CREATE TABLE persona_tipos")

        # ---- 2. vínculos: una persona puede ser varias cosas -------------
        if await _existe_tabla(conn, "persona_roles"):
            salteados.append("tabla persona_roles (ya existe)")
        else:
            if not dry_run:
                await conn.execute(text("""
                    CREATE TABLE persona_roles (
                        id            INT AUTO_INCREMENT PRIMARY KEY,
                        municipio_id  INT NOT NULL,
                        persona_id    INT NOT NULL,
                        tipo_id       INT NOT NULL,
                        principal     TINYINT(1) NOT NULL DEFAULT 0,
                        notas         TEXT NULL,
                        created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
                        UNIQUE KEY uq_persona_rol (persona_id, tipo_id),
                        KEY ix_persona_roles_municipio (municipio_id),
                        KEY ix_persona_roles_tipo (tipo_id),
                        CONSTRAINT fk_persona_roles_persona FOREIGN KEY (persona_id)
                            REFERENCES contactos(id) ON DELETE CASCADE,
                        CONSTRAINT fk_persona_roles_tipo FOREIGN KEY (tipo_id)
                            REFERENCES persona_tipos(id) ON DELETE CASCADE,
                        CONSTRAINT fk_persona_roles_muni FOREIGN KEY (municipio_id)
                            REFERENCES municipios(id) ON DELETE CASCADE
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                """))
            hechos.append("CREATE TABLE persona_roles")

        # ---- 3. columnas de enganche, vacías -----------------------------
        for tabla, columna, ddl in (
            ("empleados", "persona_id",
             "ALTER TABLE empleados ADD COLUMN persona_id INT NULL, "
             "ADD KEY ix_empleados_persona (persona_id), "
             "ADD CONSTRAINT fk_empleados_persona FOREIGN KEY (persona_id) "
             "REFERENCES contactos(id) ON DELETE SET NULL"),
            ("usuarios", "persona_id",
             "ALTER TABLE usuarios ADD COLUMN persona_id INT NULL, "
             "ADD KEY ix_usuarios_persona (persona_id), "
             "ADD CONSTRAINT fk_usuarios_persona FOREIGN KEY (persona_id) "
             "REFERENCES contactos(id) ON DELETE SET NULL"),
            ("inventario_ordenes_compra", "proveedor_persona_id",
             "ALTER TABLE inventario_ordenes_compra ADD COLUMN proveedor_persona_id INT NULL, "
             "ADD KEY ix_oc_proveedor_persona (proveedor_persona_id), "
             "ADD CONSTRAINT fk_oc_proveedor_persona FOREIGN KEY (proveedor_persona_id) "
             "REFERENCES contactos(id) ON DELETE SET NULL"),
        ):
            if await _existe_columna(conn, tabla, columna):
                salteados.append(f"{tabla}.{columna} (ya existe)")
            else:
                if not dry_run:
                    await conn.execute(text(ddl))
                hechos.append(f"ALTER {tabla} ADD {columna}")

    # ---- 4. sembrar el catálogo y los vínculos actuales ------------------
    # Va en su propia transacción: depende de que las tablas ya existan.
    if not dry_run:
        async with engine.begin() as conn:
            munis = (await conn.execute(text(
                "SELECT DISTINCT municipio_id FROM contactos WHERE municipio_id IS NOT NULL"
            ))).scalars().all()
            for muni in munis:
                for codigo, nombre, orden, cobra in TIPOS_SEMILLA:
                    await conn.execute(text("""
                        INSERT IGNORE INTO persona_tipos
                            (municipio_id, codigo, nombre, orden, cobra, activo)
                        VALUES (:m, :c, :n, :o, :cb, 1)
                    """), {"m": muni, "c": codigo, "n": nombre, "o": orden, "cb": 1 if cobra else 0})
            hechos.append(f"catálogo sembrado en {len(munis)} municipios")

            # El vínculo que hoy expresa el enum, pasado al N:M. Ningún endpoint
            # viejo lee esto: el enum sigue siendo la fuente hasta la Parte B.
            r = await conn.execute(text("""
                INSERT IGNORE INTO persona_roles (municipio_id, persona_id, tipo_id, principal)
                SELECT c.municipio_id, c.id, t.id, 1
                  FROM contactos c
                  JOIN persona_tipos t
                    ON t.municipio_id = c.municipio_id AND t.codigo = c.tipo
            """))
            hechos.append(f"vínculos creados desde el enum: {r.rowcount}")

    await engine.dispose()

    print("APLICADO:" if not dry_run else "SE APLICARÍA:")
    for h in hechos:
        print("   +", h)
    if salteados:
        print("\nya estaba:")
        for s in salteados:
            print("   =", s)
    print("\nNada de esto cambia una respuesta de la API. Correr ahora la prueba de paridad:")
    print("   python scripts/paridad_tesoreria.py capturar --out ../_paridad/post")
    print("   python scripts/paridad_tesoreria.py comparar ../_paridad/baseline ../_paridad/post")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    asyncio.run(migrar(ap.parse_args().dry_run))
