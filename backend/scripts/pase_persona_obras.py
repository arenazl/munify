"""PASE A PRODUCCIÓN — Persona y Obras (bloque F0-F3).

Contrato: `base-compartida/21-PASE-A-PRODUCCION.md`. Lo ejecuta **Infra**, sin conocer
el dominio de la app. Tres comandos y nada que interpretar:

    python scripts/pase_persona_obras.py                          # PLAN: dice qué haría
    python scripts/pase_persona_obras.py --apply --si-estoy-seguro # lo hace
    python scripts/pase_persona_obras.py --revertir <backup.json>  # lo deshace

La `DATABASE_URL` sale del entorno donde corre (el contenedor del backend). El script
no la pide, no la imprime y no la escribe en el backup.

QUÉ HACE, en orden:
  1. ESQUEMA (aditivo): crea 3 tablas nuevas y agrega columnas NULL a 6 tablas. No
     modifica ni borra nada existente. Si ya está, lo saltea.
  2. CATÁLOGO: siembra los tipos de persona de cada municipio (INSERT IGNORE).
  3. ROLES: espeja el enum `contactos.tipo` a la tabla N:M `persona_roles`.
  4. EMPLEADOS: crea la Persona de cada empleado y lo engancha. Si el nombre coincide
     con más de una persona del municipio, NO lo enlaza: lo reporta para curar a mano.
  5. USUARIOS de gestión activos: su Persona y su rol. Los vecinos nunca entran.
  6. SAN PEDRO NORTE: sus tipos de empleado pasan a subtipos de `empleado`, y cada
     persona que cobra sueldo recibe su ficha laboral con la modalidad que corresponde.

QUÉ NO HACE (a propósito):
  - No renombra `contactos` a `personas`. Ese es el paso 2 de la noche de producción.
  - No carga NINGUNA obra de demostración. Las 4 obras `[DEMO]` que existen en QA son
    de prueba y no viajan a producción.
  - No enciende el módulo Obras en ningún municipio. Es opt-in y se prende desde la
    pantalla de módulos cuando el municipio lo contrata.
  - No toca la agenda de pagos, las cajas, los gastos ni las órdenes de pago.

TRANSACCIONES: los pasos 2 a 6 (datos) van en UNA transacción: entra todo o no entra
nada. El paso 1 es DDL y MySQL le hace commit implícito a cada sentencia; por eso es
sólo aditivo (columnas NULL y tablas nuevas): si el pase se revierte, lo que queda es
inocuo para el código anterior, que no las mira.

IDEMPOTENTE: correrlo dos veces no duplica nada. La segunda vez dice "ya está hecho".
"""
import argparse
import asyncio
import json
import os
import re
import sys
import unicodedata
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text  # noqa: E402
from sqlalchemy.ext.asyncio import create_async_engine  # noqa: E402

from core.config import settings  # noqa: E402
from scripts.migrar_f0_persona_obras import COLUMNAS, TABLAS  # noqa: E402
from services.persona_tipos import TIPOS_SEMILLA  # noqa: E402

TABLA = "contactos"          # la Persona vive acá hasta el renombre (paso 2 de la noche)
SPN = 80                     # San Pedro Norte, el único cliente productivo

# El tipo de empleado que usa San Pedro Norte -> (modalidad, tipo legacy de la ficha).
TRADUCCION = {
    "En blanco":            ("planta",      "administrativo"),
    "Pasantes":             ("a_prueba",    "operario"),
    "Personal jornalizado": ("jornalizado", "operario"),
    "Jubilado":             ("jubilado",    "operario"),
    "Profesionales":        ("contratado",  "administrativo"),
    "Prensa":               ("planta",      "administrativo"),
    "Turismo y Cultura":    ("planta",      "administrativo"),
    "Auxiliares":           ("planta",      "operario"),
    "Chofer":               ("planta",      "operario"),
    "Legislativo":          ("planta",      "administrativo"),
    "Sala Velatoria":       ("planta",      "operario"),
    "corralón":             ("planta",      "operario"),
}
CAPACIDAD_POR_DEFECTO = 10   # la ficha laboral la exige; es la que usa el resto del padrón


def slug(s: str) -> str:
    s = unicodedata.normalize("NFD", s)
    s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn").lower()
    return re.sub(r"_+", "_", re.sub(r"[^a-z0-9]+", "_", s)).strip("_")[:40]


async def _existe_tabla(conn, nombre):
    return (await conn.execute(text(
        "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name=:n"),
        {"n": nombre})).scalar() > 0


async def _existe_columna(conn, tabla, columna):
    return (await conn.execute(text(
        "SELECT COUNT(*) FROM information_schema.columns "
        "WHERE table_schema=DATABASE() AND table_name=:t AND column_name=:c"),
        {"t": tabla, "c": columna})).scalar() > 0


# ---------------------------------------------------------------------------
# 1. Esquema
# ---------------------------------------------------------------------------

async def _plan_esquema(conn):
    faltan_tablas = [t for t in TABLAS if not await _existe_tabla(conn, t)]
    faltan_col = [(t, c) for t, c, _ in COLUMNAS if not await _existe_columna(conn, t, c)]
    return faltan_tablas, faltan_col


async def _aplicar_esquema(engine, faltan_tablas, faltan_col):
    async with engine.begin() as conn:
        for nombre in faltan_tablas:
            await conn.execute(text(TABLAS[nombre]))
        for tabla, columna, ddl in COLUMNAS:
            if (tabla, columna) in faltan_col:
                await conn.execute(text(ddl))


# ---------------------------------------------------------------------------
# 2 a 6. Datos: primero se miden, después se aplican con los mismos SQL
# ---------------------------------------------------------------------------

async def _medir(conn):
    """Cuenta todo lo que el pase cambiaría. Es el informe del modo PLAN."""
    m = {}
    m["municipios"] = (await conn.execute(text(
        f"SELECT COUNT(DISTINCT municipio_id) FROM {TABLA} WHERE municipio_id IS NOT NULL"))).scalar()
    m["tipos_a_sembrar"] = (await conn.execute(text(f"""
        SELECT COUNT(*) FROM (SELECT DISTINCT municipio_id FROM {TABLA} WHERE municipio_id IS NOT NULL) mm
         CROSS JOIN (SELECT :n AS n) x
    """), {"n": len(TIPOS_SEMILLA)})).scalar() * len(TIPOS_SEMILLA)
    m["tipos_ya"] = (await conn.execute(text("SELECT COUNT(*) FROM persona_tipos"))).scalar()
    m["roles_a_crear"] = (await conn.execute(text(f"""
        SELECT COUNT(*) FROM {TABLA} c
          JOIN persona_tipos t ON t.municipio_id = c.municipio_id AND t.codigo = c.tipo
         WHERE NOT EXISTS (SELECT 1 FROM persona_roles pr
                            WHERE pr.persona_id = c.id AND pr.tipo_id = t.id)
    """))).scalar()
    m["empleados_sin_persona"] = (await conn.execute(text(
        "SELECT COUNT(*) FROM empleados WHERE persona_id IS NULL AND municipio_id IS NOT NULL"))).scalar()
    m["empleados_ambiguos"] = (await conn.execute(text(f"""
        SELECT COUNT(*) FROM (
          SELECT e.id
            FROM empleados e
            JOIN {TABLA} p ON p.municipio_id = e.municipio_id
                          AND p.nombre = e.nombre
                          AND COALESCE(p.apellido,'') = COALESCE(e.apellido,'')
           WHERE e.persona_id IS NULL AND e.municipio_id IS NOT NULL
           GROUP BY e.id HAVING COUNT(p.id) > 1) x
    """))).scalar()
    m["usuarios_sin_persona"] = (await conn.execute(text("""
        SELECT COUNT(*) FROM usuarios
         WHERE persona_id IS NULL AND activo = 1 AND municipio_id IS NOT NULL
           AND rol IN ('admin','supervisor','empleado')
    """))).scalar()
    m["spn_tipos_con_uso"] = (await conn.execute(text(f"""
        SELECT COUNT(*) FROM (
          SELECT te.id FROM tesoreria_tipos_empleado te
            LEFT JOIN {TABLA} c ON c.tipo_empleado_id = te.id
           WHERE te.municipio_id = :m GROUP BY te.id HAVING COUNT(c.id) > 0) x
    """), {"m": SPN})).scalar()
    m["spn_fichas_a_crear"] = (await conn.execute(text(f"""
        SELECT COUNT(*) FROM {TABLA} c
         WHERE c.municipio_id = :m AND c.tipo = 'empleado' AND c.activo = 1
           AND NOT EXISTS (SELECT 1 FROM empleados e WHERE e.persona_id = c.id)
    """), {"m": SPN})).scalar()
    return m


async def _backup(conn, ruta):
    """Fotografía lo mínimo para poder deshacer: los topes de id y los vínculos previos."""
    datos = {
        "cuando": datetime.now().isoformat(timespec="seconds"),
        "base": (await conn.execute(text("SELECT DATABASE()"))).scalar(),
        "topes": {},
        "empleados_persona_id": [],
        "usuarios_persona_id": [],
    }
    for t in ("contactos", "persona_tipos", "persona_roles", "empleados"):
        datos["topes"][t] = (await conn.execute(text(f"SELECT COALESCE(MAX(id),0) FROM {t}"))).scalar()
    datos["empleados_persona_id"] = [
        {"id": r[0], "persona_id": r[1]} for r in
        (await conn.execute(text("SELECT id, persona_id FROM empleados WHERE municipio_id IS NOT NULL"))).all()]
    datos["usuarios_persona_id"] = [
        {"id": r[0], "persona_id": r[1]} for r in
        (await conn.execute(text("SELECT id, persona_id FROM usuarios WHERE municipio_id IS NOT NULL"))).all()]
    with open(ruta, "w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False, indent=1)
    return datos


async def _aplicar_datos(conn, hechos):
    # ---- 2. catálogo de tipos por municipio
    munis = (await conn.execute(text(
        f"SELECT DISTINCT municipio_id FROM {TABLA} WHERE municipio_id IS NOT NULL"))).scalars().all()
    n = 0
    for muni in munis:
        for codigo, nombre, orden, cobra, activo in TIPOS_SEMILLA:
            r = await conn.execute(text(
                "INSERT IGNORE INTO persona_tipos (municipio_id, codigo, nombre, orden, cobra, activo) "
                "VALUES (:m, :c, :n, :o, :cb, :a)"),
                {"m": muni, "c": codigo, "n": nombre, "o": orden, "cb": 1 if cobra else 0, "a": 1 if activo else 0})
            n += r.rowcount
    hechos.append(f"catálogo: {n} tipos sembrados en {len(munis)} municipios")

    # ---- 3. roles desde el enum
    r = await conn.execute(text(f"""
        INSERT IGNORE INTO persona_roles (municipio_id, persona_id, tipo_id, principal)
        SELECT c.municipio_id, c.id, t.id, 1
          FROM {TABLA} c
          JOIN persona_tipos t ON t.municipio_id = c.municipio_id AND t.codigo = c.tipo
    """))
    hechos.append(f"roles: {r.rowcount} vínculos persona-tipo creados desde el enum")

    # ---- 4. empleados: persona propia y enganche (los ambiguos quedan afuera)
    ambiguos = [r[0] for r in (await conn.execute(text(f"""
        SELECT e.id
          FROM empleados e
          JOIN {TABLA} p ON p.municipio_id = e.municipio_id AND p.nombre = e.nombre
                        AND COALESCE(p.apellido,'') = COALESCE(e.apellido,'')
         WHERE e.persona_id IS NULL AND e.municipio_id IS NOT NULL
         GROUP BY e.id HAVING COUNT(p.id) > 1
    """))).all()]
    excl = ""
    if ambiguos:
        excl = " AND e.id NOT IN :amb"
    r = await conn.execute(text(f"""
        INSERT INTO {TABLA} (municipio_id, nombre, apellido, telefono, tipo, activo, created_at)
        SELECT e.municipio_id, e.nombre, e.apellido, e.telefono, 'empleado', 1, NOW()
          FROM empleados e
         WHERE e.persona_id IS NULL AND e.municipio_id IS NOT NULL {excl}
           AND NOT EXISTS (SELECT 1 FROM {TABLA} p
                            WHERE p.municipio_id = e.municipio_id AND p.nombre = e.nombre
                              AND COALESCE(p.apellido,'') = COALESCE(e.apellido,''))
    """), {"amb": tuple(ambiguos)} if ambiguos else {})
    creadas = r.rowcount
    r = await conn.execute(text(f"""
        UPDATE empleados e
          JOIN {TABLA} p ON p.municipio_id = e.municipio_id AND p.nombre = e.nombre
                        AND COALESCE(p.apellido,'') = COALESCE(e.apellido,'')
           SET e.persona_id = p.id
         WHERE e.persona_id IS NULL AND e.municipio_id IS NOT NULL {excl}
    """), {"amb": tuple(ambiguos)} if ambiguos else {})
    hechos.append(f"empleados: {creadas} personas creadas, {r.rowcount} enganchados"
                  + (f"; {len(ambiguos)} ambiguos SIN enganchar (curar a mano): {ambiguos}" if ambiguos else ""))

    # ---- 5. usuarios de gestión activos
    r = await conn.execute(text(f"""
        INSERT INTO {TABLA} (municipio_id, nombre, apellido, email, telefono, dni, tipo, activo, created_at)
        SELECT u.municipio_id, u.nombre, u.apellido, u.email, u.telefono, NULLIF(u.dni,''), 'empleado', 1, NOW()
          FROM usuarios u
         WHERE u.persona_id IS NULL AND u.activo = 1 AND u.municipio_id IS NOT NULL
           AND u.rol IN ('admin','supervisor','empleado')
           AND NOT EXISTS (SELECT 1 FROM {TABLA} p
                            WHERE p.municipio_id = u.municipio_id
                              AND (p.email = u.email OR (p.nombre = u.nombre
                                   AND COALESCE(p.apellido,'') = COALESCE(u.apellido,''))))
    """))
    creadas_u = r.rowcount
    r = await conn.execute(text(f"""
        UPDATE usuarios u
          JOIN {TABLA} p ON p.municipio_id = u.municipio_id
                        AND (p.email = u.email OR (p.nombre = u.nombre
                             AND COALESCE(p.apellido,'') = COALESCE(u.apellido,'')))
           SET u.persona_id = p.id
         WHERE u.persona_id IS NULL AND u.activo = 1 AND u.municipio_id IS NOT NULL
           AND u.rol IN ('admin','supervisor','empleado')
    """))
    hechos.append(f"usuarios: {creadas_u} personas creadas, {r.rowcount} enganchados")
    await conn.execute(text(f"UPDATE {TABLA} SET dni = NULL WHERE dni = ''"))
    await conn.execute(text(f"UPDATE {TABLA} SET cuit = NULL WHERE cuit = ''"))

    # ---- 6. San Pedro Norte: subtipos y fichas laborales
    raiz = (await conn.execute(text(
        "SELECT id FROM persona_tipos WHERE municipio_id=:m AND codigo='empleado' AND padre_id IS NULL"),
        {"m": SPN})).scalar()
    if not raiz:
        hechos.append("SPN: sin tipo raíz `empleado`, se saltea (¿municipio inexistente en esta base?)")
        return
    tipos = (await conn.execute(text(f"""
        SELECT te.id, te.nombre, te.orden, COUNT(c.id) uso
          FROM tesoreria_tipos_empleado te LEFT JOIN {TABLA} c ON c.tipo_empleado_id = te.id
         WHERE te.municipio_id = :m GROUP BY te.id, te.nombre, te.orden HAVING uso > 0
         ORDER BY uso DESC"""), {"m": SPN})).fetchall()
    mapa = {}
    for tid, nombre, orden, _uso in tipos:
        codigo = f"emp_{slug(nombre)}"
        await conn.execute(text(
            "INSERT IGNORE INTO persona_tipos (municipio_id, codigo, nombre, orden, cobra, activo, padre_id) "
            "VALUES (:m, :c, :n, :o, 1, 1, :p)"),
            {"m": SPN, "c": codigo, "n": nombre, "o": orden or 0, "p": raiz})
        mapa[tid] = (await conn.execute(text(
            "SELECT id FROM persona_tipos WHERE municipio_id=:m AND codigo=:c"),
            {"m": SPN, "c": codigo})).scalar()
    n_rol = 0
    for tid, sub in mapa.items():
        r = await conn.execute(text(f"""
            INSERT IGNORE INTO persona_roles (municipio_id, persona_id, tipo_id, principal)
            SELECT c.municipio_id, c.id, :sub, 0 FROM {TABLA} c
             WHERE c.municipio_id = :m AND c.tipo_empleado_id = :tid
        """), {"sub": sub, "m": SPN, "tid": tid})
        n_rol += r.rowcount
    hechos.append(f"SPN: {len(mapa)} subtipos de empleado, {n_rol} personas clasificadas")

    personas = (await conn.execute(text(f"""
        SELECT c.id, c.nombre, c.apellido, c.telefono, te.nombre
          FROM {TABLA} c LEFT JOIN tesoreria_tipos_empleado te ON te.id = c.tipo_empleado_id
         WHERE c.municipio_id = :m AND c.tipo = 'empleado' AND c.activo = 1
           AND NOT EXISTS (SELECT 1 FROM empleados e WHERE e.persona_id = c.id)
    """), {"m": SPN})).fetchall()
    for pid, nombre, apellido, telefono, tipo_nombre in personas:
        modalidad, legacy = TRADUCCION.get(tipo_nombre or "", ("planta", "administrativo"))
        await conn.execute(text("""
            INSERT INTO empleados (municipio_id, persona_id, nombre, apellido, telefono, tipo,
                                   modalidad, capacidad_maxima, activo, created_at)
            VALUES (:m, :p, :n, :a, :t, :ti, :mo, :cap, 1, NOW())
        """), {"m": SPN, "p": pid, "n": nombre, "a": apellido, "t": telefono,
               "ti": legacy, "mo": modalidad, "cap": CAPACIDAD_POR_DEFECTO})
    hechos.append(f"SPN: {len(personas)} fichas laborales creadas con su modalidad")


async def _verificar(conn):
    """Las cuentas que tienen que dar después del pase."""
    problemas = []
    sin_rol = (await conn.execute(text(
        f"SELECT COUNT(*) FROM {TABLA} c LEFT JOIN persona_roles pr ON pr.persona_id=c.id "
        "WHERE pr.id IS NULL"))).scalar()
    if sin_rol:
        problemas.append(f"{sin_rol} personas sin ningún rol")
    huerfanos = (await conn.execute(text(
        f"SELECT COUNT(*) FROM empleados e LEFT JOIN {TABLA} p ON p.id = e.persona_id "
        "WHERE e.persona_id IS NOT NULL AND p.id IS NULL"))).scalar()
    if huerfanos:
        problemas.append(f"{huerfanos} empleados apuntan a una persona inexistente")
    sin_cap = (await conn.execute(text(
        "SELECT COUNT(*) FROM empleados WHERE activo = 1 AND capacidad_maxima IS NULL"))).scalar()
    if sin_cap:
        problemas.append(f"{sin_cap} empleados activos sin capacidad_maxima (rompen /api/empleados)")
    return problemas


# ---------------------------------------------------------------------------
# Revertir
# ---------------------------------------------------------------------------

async def revertir(ruta):
    with open(ruta, encoding="utf-8") as f:
        b = json.load(f)
    engine = create_async_engine(settings.DATABASE_URL)
    async with engine.begin() as conn:
        db = (await conn.execute(text("SELECT DATABASE()"))).scalar()
        if db != b["base"]:
            raise SystemExit(f"ABORTADO: el backup es de `{b['base']}` y esta base es `{db}`.")
        topes = b["topes"]
        await conn.execute(text("DELETE FROM persona_roles WHERE id > :t"), {"t": topes["persona_roles"]})
        await conn.execute(text("DELETE FROM empleados WHERE id > :t"), {"t": topes["empleados"]})
        await conn.execute(text("DELETE FROM persona_tipos WHERE id > :t"), {"t": topes["persona_tipos"]})
        for fila in b["empleados_persona_id"]:
            await conn.execute(text("UPDATE empleados SET persona_id = :p WHERE id = :i"),
                               {"p": fila["persona_id"], "i": fila["id"]})
        for fila in b["usuarios_persona_id"]:
            await conn.execute(text("UPDATE usuarios SET persona_id = :p WHERE id = :i"),
                               {"p": fila["persona_id"], "i": fila["id"]})
        await conn.execute(text(f"DELETE FROM {TABLA} WHERE id > :t"), {"t": topes["contactos"]})
    await engine.dispose()
    print(f"REVERTIDO al estado del backup ({b['cuando']}).")
    print("El esquema (tablas y columnas nuevas) queda: es aditivo y el código anterior no lo mira.")


# ---------------------------------------------------------------------------

async def correr(aplicar: bool, dir_backup: str):
    engine = create_async_engine(settings.DATABASE_URL)
    async with engine.connect() as conn:
        db = (await conn.execute(text("SELECT DATABASE()"))).scalar()
        print(f"Base: {db}")
        faltan_tablas, faltan_col = await _plan_esquema(conn)
        # La medición sólo tiene sentido si las tablas ya existen.
        medida = await _medir(conn) if not faltan_tablas else None

    print("\n=== 1. ESQUEMA (aditivo)")
    print(f"   tablas a crear:   {faltan_tablas or 'ninguna (ya están)'}")
    print(f"   columnas a agregar: {len(faltan_col)}" + (f" -> {[f'{t}.{c}' for t, c in faltan_col]}" if faltan_col else " (ya están)"))
    if medida:
        print("\n=== 2 a 6. DATOS")
        print(f"   municipios en la base:            {medida['municipios']}")
        print(f"   tipos de persona ya sembrados:    {medida['tipos_ya']}")
        print(f"   vínculos persona-tipo a crear:    {medida['roles_a_crear']}")
        print(f"   empleados sin persona:            {medida['empleados_sin_persona']}"
              + (f"  ({medida['empleados_ambiguos']} ambiguos, NO se enganchan)" if medida['empleados_ambiguos'] else ""))
        print(f"   usuarios de gestión sin persona:  {medida['usuarios_sin_persona']}")
        print(f"   SPN, tipos de empleado con uso:   {medida['spn_tipos_con_uso']}")
        print(f"   SPN, fichas laborales a crear:    {medida['spn_fichas_a_crear']}")
        nada = (medida["roles_a_crear"] == 0 and medida["empleados_sin_persona"] == 0
                and medida["usuarios_sin_persona"] == 0 and medida["spn_fichas_a_crear"] == 0)
        if nada and not faltan_tablas and not faltan_col:
            print("\nYA ESTÁ HECHO: no hay nada que aplicar.")
            await engine.dispose()
            return
    else:
        print("\n=== 2 a 6. DATOS: no se pueden medir hasta que exista el esquema (paso 1).")

    if not aplicar:
        print("\nMODO PLAN. Para aplicarlo:")
        print("   python scripts/pase_persona_obras.py --apply --si-estoy-seguro")
        await engine.dispose()
        return

    # ---- aplicar
    if faltan_tablas or faltan_col:
        await _aplicar_esquema(engine, faltan_tablas, faltan_col)
        print("\n1. esquema aplicado.")

    os.makedirs(dir_backup, exist_ok=True)
    ruta = os.path.join(dir_backup, f"pase_persona_obras_{datetime.now():%Y%m%d_%H%M%S}.json")
    hechos = []
    async with engine.begin() as conn:          # UNA transacción para todos los datos
        await _backup(conn, ruta)
        print(f"2. backup escrito en {ruta}")
        await _aplicar_datos(conn, hechos)

    async with engine.connect() as conn:
        problemas = await _verificar(conn)
    await engine.dispose()

    print("\nAPLICADO:")
    for h in hechos:
        print("   +", h)
    print("\nVerificación:", "todo da." if not problemas else "HAY PROBLEMAS:")
    for p in problemas:
        print("   !", p)
    if problemas:
        print(f"\nPara volver atrás:  python scripts/pase_persona_obras.py --revertir {ruta}")
        raise SystemExit(1)
    print(f"\nPara volver atrás:  python scripts/pase_persona_obras.py --revertir {ruta}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Pase a producción de Persona y Obras.")
    ap.add_argument("--apply", action="store_true", help="aplica (requiere también --si-estoy-seguro)")
    ap.add_argument("--si-estoy-seguro", dest="seguro", action="store_true")
    ap.add_argument("--revertir", metavar="BACKUP.json")
    ap.add_argument("--dir-backup", default="respaldos", help="dónde dejar el backup (por defecto ./respaldos)")
    a = ap.parse_args()
    if a.revertir:
        asyncio.run(revertir(a.revertir))
    else:
        if a.apply and not a.seguro:
            raise SystemExit("Falta --si-estoy-seguro. Sin las dos banderas no escribe nada.")
        asyncio.run(correr(a.apply and a.seguro, a.dir_backup))
