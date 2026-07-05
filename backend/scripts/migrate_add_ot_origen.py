"""Migración F6 · Etapa A — OT universal: columna `origen` + OTs implícitas.

DOS PARTES:
  1. SCHEMA (siempre, idempotente): ALTER TABLE ordenes_trabajo ADD COLUMN
     `origen` ENUM('manual','implicita','consolidada_poi') NOT NULL DEFAULT
     'manual'. Aditiva y backward-compatible (el código viejo sigue insertando
     con el default). Las OTs existentes quedan 'manual'.
  2. DATA (solo con --aplicar; dry-run por defecto): genera la OT implícita 1:1
     para cada reclamo ACTIVO con empleado asignado que todavía no tiene una OT
     vigente. Backup JSON de lo creado antes de escribir.

SEGURIDAD (clave): NO usa el engine de core.database (que lee el .env, que
apunta a PROD). Construye su propio engine desde la env var DATABASE_URL
EXPLÍCITA. Sin esa env var → aborta. Así no hay forma de pegarle a prod por
accidente. Imprime SELECT DATABASE() para que se vea el objetivo.

USO:
    # qa (yo, esta sesión):
    DATABASE_URL="mysql+aiomysql://.../sugerenciasmun-qa" python scripts/migrate_add_ot_origen.py            # dry-run
    DATABASE_URL="mysql+aiomysql://.../sugerenciasmun-qa" python scripts/migrate_add_ot_origen.py --aplicar  # aplica
    # prod (infra, otra sesión): DATABASE_URL de prod + --aplicar (con backup)
"""
import asyncio
import json
import os
import sys
from datetime import date, datetime

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

# Estados de reclamo que se consideran ACTIVOS para la migración de datos.
ESTADOS_ACTIVOS = ("recibido", "en_curso", "en_proceso", "pospuesto",
                   "pendiente_confirmacion", "asignado", "nuevo")  # en_proceso/asignado/nuevo = legacy
# Estado inicial de la OT implícita según el estado del reclamo (default asignada).
BACKFILL_ESTADO_OT = {
    "recibido": "asignada",
    "en_curso": "en_curso",
    "en_proceso": "en_curso",  # legacy, sinónimo de en_curso
    "pospuesto": "asignada",
    "pendiente_confirmacion": "en_curso",
    "asignado": "asignada",
    "nuevo": "asignada",
}


def _engine():
    url = os.environ.get("DATABASE_URL")
    if not url:
        print("ABORT: exportá DATABASE_URL explícito (evita pegarle a prod por el .env).")
        print('   ej: DATABASE_URL="mysql+aiomysql://.../sugerenciasmun-qa" python scripts/migrate_add_ot_origen.py')
        sys.exit(1)
    return create_async_engine(url)


async def _col_existe(conn, tabla: str, col: str) -> bool:
    row = (await conn.execute(text(
        "SELECT COUNT(*) FROM information_schema.columns "
        "WHERE table_schema = DATABASE() AND table_name = :t AND column_name = :c"
    ), {"t": tabla, "c": col})).scalar()
    return bool(row)


async def migrar_schema(conn):
    """ALTER idempotente. Devuelve el nombre de la DB (para el log de seguridad)."""
    db = (await conn.execute(text("SELECT DATABASE()"))).scalar()
    print(f"== SCHEMA · DB objetivo: {db} ==")

    # Defensivo: la data-migration inserta `prioridad`, y el modelo de OT usa
    # `prioridad` + `tipo_trabajo_id` (Fase 3). Si el ambiente quedó atrás (qa
    # no tenía corrida la migración de formato), las aseguramos acá. Idempotente:
    # SKIP donde ya existen (prod). Mismo DDL que migrate_add_ot_formato.py.
    if not await _col_existe(conn, "ordenes_trabajo", "prioridad"):
        await conn.execute(text(
            "ALTER TABLE ordenes_trabajo ADD COLUMN prioridad "
            "ENUM('baja','media','alta','urgente') NOT NULL DEFAULT 'media' AFTER descripcion"
        ))
        print("OK: columna ordenes_trabajo.prioridad (Fase 3, ambiente atrasado)")
    else:
        print("SKIP: ordenes_trabajo.prioridad ya existe")

    if not await _col_existe(conn, "ordenes_trabajo", "tipo_trabajo_id"):
        await conn.execute(text(
            "ALTER TABLE ordenes_trabajo ADD COLUMN tipo_trabajo_id INT NULL AFTER prioridad, "
            "ADD KEY ix_ot_tipo_trabajo (tipo_trabajo_id), "
            "ADD CONSTRAINT fk_ot_tipo_trabajo FOREIGN KEY (tipo_trabajo_id) "
            "REFERENCES ot_tipos_trabajo(id) ON DELETE SET NULL"
        ))
        print("OK: columna ordenes_trabajo.tipo_trabajo_id (Fase 3, ambiente atrasado)")
    else:
        print("SKIP: ordenes_trabajo.tipo_trabajo_id ya existe")

    if not await _col_existe(conn, "ordenes_trabajo", "origen"):
        # Atómico: columna + índice en UNA sola sentencia. Si fueran dos y el
        # proceso se corta entre medio, el guard _col_existe skipearía para
        # siempre y el índice ix_ot_origen quedaría faltante de forma permanente.
        await conn.execute(text(
            "ALTER TABLE ordenes_trabajo "
            "ADD COLUMN origen ENUM('manual','implicita','consolidada_poi') "
            "NOT NULL DEFAULT 'manual' AFTER estado, "
            "ADD KEY ix_ot_origen (origen)"
        ))
        print("OK: columna ordenes_trabajo.origen (+ índice, atómico)")
    else:
        print("SKIP: ordenes_trabajo.origen ya existe")
    return db


async def _candidatos(conn):
    """Reclamos activos con empleado VÁLIDO (existe y es del mismo muni) y SIN OT
    vigente → candidatos a OT implícita. El JOIN a empleados descarta reclamos con
    empleado_id colgado (anomalía de datos), que romperían la FK de la OT. Aplica
    a TODOS los munis por igual (modelo universal D11): la OT implícita no se
    gatea por módulo — el flag 'ordenes_trabajo' es solo de superficie."""
    estados = ",".join(f"'{e}'" for e in ESTADOS_ACTIVOS)
    rows = (await conn.execute(text(
        f"""
        SELECT r.id, r.municipio_id, r.titulo, r.descripcion, r.estado,
               r.empleado_id, r.fecha_programada, r.hora_inicio, r.hora_fin, r.creador_id
        FROM reclamos r
        JOIN empleados e ON e.id = r.empleado_id AND e.municipio_id = r.municipio_id
        WHERE r.estado IN ({estados})
          AND NOT EXISTS (
              SELECT 1 FROM orden_trabajo_reclamos otr
              JOIN ordenes_trabajo o ON o.id = otr.orden_trabajo_id
              WHERE otr.reclamo_id = r.id
                AND o.estado NOT IN ('completada','cancelada')
          )
        ORDER BY r.municipio_id, r.id
        """
    ))).mappings().all()
    return rows


async def _creador_de_muni(conn, municipio_id: int, cache: dict, fallback: int) -> int:
    """Creador de la OT = un usuario REAL del muni (admin/supervisor preferido, si
    no cualquiera del muni). Cache por muni. Evita usar un creador_id colgado."""
    if municipio_id in cache:
        return cache[municipio_id] or fallback
    uid = (await conn.execute(text(
        "SELECT id FROM usuarios WHERE municipio_id = :m "
        "ORDER BY (rol IN ('admin','supervisor')) DESC, id LIMIT 1"
    ), {"m": municipio_id})).scalar()
    cache[municipio_id] = uid
    return uid or fallback


async def _seq_inicial(conn, municipio_id: int, prefix: str) -> int:
    last = (await conn.execute(text(
        "SELECT numero FROM ordenes_trabajo WHERE municipio_id = :m AND numero LIKE :p "
        "ORDER BY numero DESC LIMIT 1"
    ), {"m": municipio_id, "p": f"{prefix}%"})).scalar()
    if last:
        try:
            return int(last.split("-")[-1])
        except Exception:
            return 0
    return 0


async def migrar_datos(conn, aplicar: bool):
    print("\n== DATA · OTs implícitas para reclamos activos asignados ==")
    candidatos = await _candidatos(conn)
    por_muni = {}
    for c in candidatos:
        por_muni.setdefault(c["municipio_id"], 0)
        por_muni[c["municipio_id"]] += 1
    print(f"Candidatos: {len(candidatos)} reclamo(s) en {len(por_muni)} muni(s)")
    for m, n in sorted(por_muni.items()):
        print(f"   muni {m}: {n}")

    if not candidatos:
        print("Nada para migrar.")
        return
    if not aplicar:
        print("\nDRY-RUN de DATA: el SCHEMA ya se aplicó arriba (aditivo, idempotente); "
              "ninguna OT implícita creada. Corré con --aplicar para crearlas.")
        return

    anio = date.today().year
    prefix = f"OT-{anio}-"
    seq_por_muni = {}
    cache_creador = {}
    creados = []

    # Corre en una sola transacción (engine.begin en main). Si un INSERT choca el
    # `numero` con una OT creada por tráfico en vivo (uq_ot_municipio_numero),
    # revierte el lote entero — pero el script es IDEMPOTENTE: re-correrlo completa
    # lo que falte sin duplicar (los ya-migrados quedan excluidos por el NOT EXISTS
    # de _candidatos). No hay pérdida de datos, solo se repite la corrida.
    for c in candidatos:
        m = c["municipio_id"]
        if m not in seq_por_muni:
            seq_por_muni[m] = await _seq_inicial(conn, m, prefix)
        seq_por_muni[m] += 1
        numero = f"{prefix}{seq_por_muni[m]:04d}"
        estado_ot = BACKFILL_ESTADO_OT.get(c["estado"], "asignada")
        creador = await _creador_de_muni(conn, m, cache_creador, c["creador_id"])

        res = await conn.execute(text(
            """
            INSERT INTO ordenes_trabajo
                (municipio_id, numero, estado, origen, titulo, descripcion, prioridad,
                 empleado_id, fecha_programada, hora_inicio, hora_fin, creador_id, created_at)
            VALUES
                (:municipio_id, :numero, :estado, 'implicita', :titulo, :descripcion, 'media',
                 :empleado_id, :fecha_programada, :hora_inicio, :hora_fin, :creador_id, NOW())
            """
        ), {
            "municipio_id": m, "numero": numero, "estado": estado_ot,
            "titulo": (c["titulo"] or "Trabajo")[:200], "descripcion": c["descripcion"],
            "empleado_id": c["empleado_id"], "fecha_programada": c["fecha_programada"],
            "hora_inicio": c["hora_inicio"], "hora_fin": c["hora_fin"], "creador_id": creador,
        })
        ot_id = res.lastrowid
        await conn.execute(text(
            "INSERT INTO orden_trabajo_reclamos (orden_trabajo_id, reclamo_id, created_at) "
            "VALUES (:ot, :r, NOW())"
        ), {"ot": ot_id, "r": c["id"]})
        creados.append({"ot_id": ot_id, "numero": numero, "reclamo_id": c["id"], "municipio_id": m})

    # Backup JSON antes de dar por hecho (para un rollback = DELETE por estos ids).
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = os.path.join(os.path.dirname(__file__), f"_backup_ot_origen_{ts}.json")
    with open(backup_path, "w", encoding="utf-8") as f:
        json.dump(creados, f, ensure_ascii=False, indent=2)
    print(f"OK: {len(creados)} OT implícita(s) creada(s). Backup: {os.path.basename(backup_path)}")


async def main():
    aplicar = "--aplicar" in sys.argv
    engine = _engine()
    async with engine.begin() as conn:
        await migrar_schema(conn)
        await migrar_datos(conn, aplicar)
    await engine.dispose()
    print("\nListo." + ("" if aplicar else "  (dry-run — SCHEMA aplicado; DATA no persistida)"))


if __name__ == "__main__":
    asyncio.run(main())
