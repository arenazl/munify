"""F0 — esquema ADITIVO de Persona y Obras, contra la base de QA (y después prod).

Plan: `docs/tesoreria/04-plan-integral-persona-y-obras.md` (fase F0) y el protocolo de
producción en `docs/tesoreria/03-revision-fable-y-plan-contingencia.md` §6.1 (paso P1).

Regla de esta fase: el backend PUBLICADO sigue leyendo la misma base y no debe
enterarse. Por eso acá sólo hay:
  - tablas nuevas (`persona_tipos`, `persona_roles`, `obra_etapas`), con collation
    `utf8mb4_unicode_ci` explícita (lección del 2026-09-06);
  - columnas nuevas NULLABLE o con DEFAULT (si no, el INSERT del código viejo falla);
  - claves foráneas nuevas con CASCADE o SET NULL (si no, un borrado desde la
    pantalla vieja empieza a fallar).
Nada de renombres, nada de índices únicos, nada de datos de SPN. Después de correrlo
el gate de paridad tiene que dar DIFERENCIA CERO.

Es idempotente y tiene `--dry-run`. Aborta si la base tiene "prod" en el nombre, salvo
`--permitir-prod` (paso P1 del protocolo, lo corre Infra).

    python scripts/migrar_f0_persona_obras.py --dry-run
    python scripts/migrar_f0_persona_obras.py
"""
import argparse
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text  # noqa: E402
from sqlalchemy.ext.asyncio import create_async_engine  # noqa: E402

from core.config import settings  # noqa: E402
from services.persona_tipos import TIPOS_SEMILLA  # noqa: E402

COLLATE = "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"

TABLAS = {
    "persona_tipos": f"""
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
        ) {COLLATE}""",
    "persona_roles": f"""
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
        ) {COLLATE}""",
    "obra_etapas": f"""
        CREATE TABLE obra_etapas (
            id                     INT AUTO_INCREMENT PRIMARY KEY,
            municipio_id           INT NOT NULL,
            proyecto_id            INT NOT NULL,
            orden                  INT NOT NULL DEFAULT 1,
            nombre                 VARCHAR(120) NOT NULL,
            descripcion            TEXT NULL,
            incidencia_pct         DECIMAL(5,2) NOT NULL DEFAULT 0,
            avance_pct             INT NOT NULL DEFAULT 0,
            estado                 VARCHAR(20) NOT NULL DEFAULT 'pendiente',
            fecha_inicio_prevista  DATE NULL,
            fecha_fin_prevista     DATE NULL,
            fecha_inicio_real      DATE NULL,
            fecha_fin_real         DATE NULL,
            monto_previsto         DECIMAL(15,2) NULL,
            created_at             DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at             DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_obra_etapa_orden (proyecto_id, orden),
            KEY ix_obra_etapas_municipio (municipio_id),
            KEY ix_obra_etapas_proyecto (proyecto_id),
            CONSTRAINT fk_obra_etapas_muni FOREIGN KEY (municipio_id)
                REFERENCES municipios(id) ON DELETE CASCADE,
            CONSTRAINT fk_obra_etapas_proyecto FOREIGN KEY (proyecto_id)
                REFERENCES proyectos(id) ON DELETE CASCADE
        ) {COLLATE}""",
}

# (tabla, columna, DDL). Cada columna nullable o con default; cada FK con SET NULL.
COLUMNAS = [
    # --- Persona: enganches ---
    ("empleados", "persona_id",
     "ALTER TABLE empleados ADD COLUMN persona_id INT NULL, "
     "ADD KEY ix_empleados_persona (persona_id), "
     "ADD CONSTRAINT fk_empleados_persona FOREIGN KEY (persona_id) REFERENCES contactos(id) ON DELETE SET NULL"),
    ("usuarios", "persona_id",
     "ALTER TABLE usuarios ADD COLUMN persona_id INT NULL, "
     "ADD KEY ix_usuarios_persona (persona_id), "
     "ADD CONSTRAINT fk_usuarios_persona FOREIGN KEY (persona_id) REFERENCES contactos(id) ON DELETE SET NULL"),
    ("inventario_ordenes_compra", "proveedor_persona_id",
     "ALTER TABLE inventario_ordenes_compra ADD COLUMN proveedor_persona_id INT NULL, "
     "ADD KEY ix_oc_proveedor_persona (proveedor_persona_id), "
     "ADD CONSTRAINT fk_oc_proveedor_persona FOREIGN KEY (proveedor_persona_id) REFERENCES contactos(id) ON DELETE SET NULL"),
    # --- Obras: proyectos ---
    ("proyectos", "tipo",
     "ALTER TABLE proyectos ADD COLUMN tipo VARCHAR(20) NOT NULL DEFAULT 'programa', ADD KEY ix_proyectos_tipo (tipo)"),
    ("proyectos", "tipo_obra", "ALTER TABLE proyectos ADD COLUMN tipo_obra VARCHAR(60) NULL"),
    ("proyectos", "modalidad", "ALTER TABLE proyectos ADD COLUMN modalidad VARCHAR(20) NULL"),
    ("proyectos", "contratista_persona_id",
     "ALTER TABLE proyectos ADD COLUMN contratista_persona_id INT NULL, "
     "ADD KEY ix_proyectos_contratista (contratista_persona_id), "
     "ADD CONSTRAINT fk_proyectos_contratista FOREIGN KEY (contratista_persona_id) REFERENCES contactos(id) ON DELETE SET NULL"),
    ("proyectos", "expediente", "ALTER TABLE proyectos ADD COLUMN expediente VARCHAR(60) NULL"),
    ("proyectos", "fuente_financiamiento", "ALTER TABLE proyectos ADD COLUMN fuente_financiamiento VARCHAR(120) NULL"),
    ("proyectos", "monto_contrato", "ALTER TABLE proyectos ADD COLUMN monto_contrato DECIMAL(15,2) NULL"),
    ("proyectos", "plazo_dias", "ALTER TABLE proyectos ADD COLUMN plazo_dias INT NULL"),
    ("proyectos", "fecha_inicio_real", "ALTER TABLE proyectos ADD COLUMN fecha_inicio_real DATE NULL"),
    ("proyectos", "fecha_fin_real", "ALTER TABLE proyectos ADD COLUMN fecha_fin_real DATE NULL"),
    ("proyectos", "inspector_usuario_id",
     "ALTER TABLE proyectos ADD COLUMN inspector_usuario_id INT NULL, "
     "ADD CONSTRAINT fk_proyectos_inspector FOREIGN KEY (inspector_usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL"),
    ("proyectos", "barrio_id",
     "ALTER TABLE proyectos ADD COLUMN barrio_id INT NULL, "
     "ADD KEY ix_proyectos_barrio (barrio_id), "
     "ADD CONSTRAINT fk_proyectos_barrio FOREIGN KEY (barrio_id) REFERENCES barrios(id) ON DELETE SET NULL"),
    # --- Obras: imputación por etapa (depende de obra_etapas) ---
    ("gasto_proyectos", "etapa_id",
     "ALTER TABLE gasto_proyectos ADD COLUMN etapa_id INT NULL, "
     "ADD KEY ix_gasto_proyectos_etapa (etapa_id), "
     "ADD CONSTRAINT fk_gasto_proyectos_etapa FOREIGN KEY (etapa_id) REFERENCES obra_etapas(id) ON DELETE SET NULL"),
    ("gasto_proyectos", "origen",
     "ALTER TABLE gasto_proyectos ADD COLUMN origen VARCHAR(12) NOT NULL DEFAULT 'manual'"),
    # --- Obras: órdenes de trabajo ---
    ("ordenes_trabajo", "proyecto_id",
     "ALTER TABLE ordenes_trabajo ADD COLUMN proyecto_id INT NULL, "
     "ADD KEY ix_ot_proyecto (proyecto_id), "
     "ADD CONSTRAINT fk_ot_proyecto FOREIGN KEY (proyecto_id) REFERENCES proyectos(id) ON DELETE SET NULL"),
    ("ordenes_trabajo", "etapa_id",
     "ALTER TABLE ordenes_trabajo ADD COLUMN etapa_id INT NULL, "
     "ADD KEY ix_ot_etapa (etapa_id), "
     "ADD CONSTRAINT fk_ot_etapa FOREIGN KEY (etapa_id) REFERENCES obra_etapas(id) ON DELETE SET NULL"),
]


async def _existe_tabla(conn, nombre):
    return (await conn.execute(text(
        "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name=:n"),
        {"n": nombre})).scalar() > 0


async def _existe_columna(conn, tabla, columna):
    return (await conn.execute(text(
        "SELECT COUNT(*) FROM information_schema.columns "
        "WHERE table_schema=DATABASE() AND table_name=:t AND column_name=:c"),
        {"t": tabla, "c": columna})).scalar() > 0


async def migrar(dry_run: bool, permitir_prod: bool):
    engine = create_async_engine(settings.DATABASE_URL)
    hechos, salteados = [], []

    async with engine.begin() as conn:
        db = (await conn.execute(text("SELECT DATABASE()"))).scalar()
        print(f"Base: {db}\n")
        if "prod" in (db or "").lower() and not permitir_prod:
            raise SystemExit("ABORTADO: producción sólo con --permitir-prod (paso P1 del protocolo, lo corre Infra).")

        for nombre, ddl in TABLAS.items():
            if await _existe_tabla(conn, nombre):
                salteados.append(f"tabla {nombre}")
                continue
            if not dry_run:
                await conn.execute(text(ddl))
            hechos.append(f"CREATE TABLE {nombre}")

        for tabla, columna, ddl in COLUMNAS:
            if await _existe_columna(conn, tabla, columna):
                salteados.append(f"{tabla}.{columna}")
                continue
            if not dry_run:
                await conn.execute(text(ddl))
            hechos.append(f"ALTER {tabla} ADD {columna}")

    # Semilla del catálogo y espejo del enum -> N:M. En transacción aparte porque
    # depende de que las tablas ya existan. Idempotente (INSERT IGNORE).
    if not dry_run:
        async with engine.begin() as conn:
            munis = (await conn.execute(text(
                "SELECT DISTINCT municipio_id FROM contactos WHERE municipio_id IS NOT NULL"))).scalars().all()
            for muni in munis:
                for codigo, nombre, orden, cobra in TIPOS_SEMILLA:
                    await conn.execute(text(
                        "INSERT IGNORE INTO persona_tipos (municipio_id, codigo, nombre, orden, cobra, activo) "
                        "VALUES (:m, :c, :n, :o, :cb, 1)"),
                        {"m": muni, "c": codigo, "n": nombre, "o": orden, "cb": 1 if cobra else 0})
            r = await conn.execute(text("""
                INSERT IGNORE INTO persona_roles (municipio_id, persona_id, tipo_id, principal)
                SELECT c.municipio_id, c.id, t.id, 1
                  FROM contactos c
                  JOIN persona_tipos t ON t.municipio_id = c.municipio_id AND t.codigo = c.tipo
            """))
            hechos.append(f"catálogo sembrado en {len(munis)} municipios; vínculos nuevos desde el enum: {r.rowcount}")

        # Verificación: ninguna persona sin rol, todo lo pedido existe.
        async with engine.connect() as conn:
            sin_rol = (await conn.execute(text(
                "SELECT COUNT(*) FROM contactos c LEFT JOIN persona_roles pr ON pr.persona_id=c.id WHERE pr.id IS NULL"))).scalar()
            faltan = [t for t in TABLAS if not await _existe_tabla(conn, t)]
            faltan += [f"{t}.{c}" for t, c, _ in COLUMNAS if not await _existe_columna(conn, t, c)]
            print(f"Verificación: personas sin rol = {sin_rol} (debe ser 0); faltantes = {faltan or 'ninguno'}")
            if sin_rol or faltan:
                raise SystemExit("LAS CUENTAS NO DAN. Revisar antes de seguir.")

    await engine.dispose()
    print("APLICADO:" if not dry_run else "SE APLICARÍA:")
    for h in hechos:
        print("   +", h)
    if salteados:
        print(f"\nya estaba ({len(salteados)}): " + ", ".join(salteados))
    print("\nNada de esto cambia una respuesta de la API. Ahora el gate:")
    print("   python scripts/paridad_tesoreria.py capturar --base https://munify-api-qa-vmpxsxe7ra-uk.a.run.app --out ../_paridad/baseline")
    print("   python scripts/paridad_tesoreria.py capturar --out ../_paridad/post")
    print("   python scripts/paridad_tesoreria.py comparar ../_paridad/baseline ../_paridad/post")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--permitir-prod", action="store_true")
    a = ap.parse_args()
    asyncio.run(migrar(a.dry_run, a.permitir_prod))
