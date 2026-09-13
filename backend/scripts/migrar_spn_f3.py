"""F3 — San Pedro Norte entra al modelo Persona (SÓLO su Tesorería), en QA.

Plan: docs/tesoreria/04 (F3) y la traducción docs/tesoreria/05. Marco del dueño
(2026-09-13): se migra sólo la Tesorería de SPN; lo cargado antes no se recalcula; a
Bartolo no le cambia la operatoria. Correr DESPUÉS de `migrar_personas_parte_b2.py`
(sin `--sin-spn`), que es la que engancha su login y se lleva la semilla demo.

Qué hace, idempotente:

1. Sus "tipos de empleado" con uso pasan a SUBTIPOS de `empleado` en el catálogo de
   tipos de persona (Pasantes, En blanco, Prensa, Turismo y Cultura, Auxiliares,
   Jubilado, Profesionales, Personal jornalizado, Chofer). Los de la semilla sin uso
   (Albañil, Plomero...) no se copian.
2. Cada contacto con tipo de empleado queda en su subtipo (su rol principal pasa del
   tipo raíz al subtipo; el enum viejo sigue diciendo `empleado`).
3. Cada contacto tipo empleado gana su FICHA LABORAL (`empleados`) con la modalidad de
   la tabla de traducción: En blanco -> planta · Pasantes -> a_prueba · Personal
   jornalizado -> jornalizado · Jubilado -> jubilado · Profesionales -> contratado ·
   el resto -> planta. La dependencia (Prensa, Turismo y Cultura...) queda expresada
   por el subtipo; no se crean dependencias del core en esta corrida.
4. Sus cuatro obras evidentes se marcan `tipo = obra` (Predio municipal, Vivienda
   Semilla, Salón de actos, Balneario). Ningún gasto ni imputación se mueve.

    python scripts/migrar_spn_f3.py --dry-run
    python scripts/migrar_spn_f3.py
"""
import argparse
import asyncio
import os
import re
import sys
import unicodedata

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text  # noqa: E402
from sqlalchemy.ext.asyncio import create_async_engine  # noqa: E402

from core.config import settings  # noqa: E402

SPN = 80
TABLA = "contactos"

# tipo de empleado de Bartolo -> (modalidad, tipo legacy de la ficha laboral)
TRADUCCION = {
    "En blanco":                ("planta",      "administrativo"),
    "Pasantes":                 ("a_prueba",    "operario"),
    "Personal jornalizado":     ("jornalizado", "operario"),
    "Jubilado":                 ("jubilado",    "operario"),
    "Profesionales":            ("contratado",  "administrativo"),
    "Prensa":                   ("planta",      "administrativo"),
    "Turismo y Cultura":        ("planta",      "administrativo"),
    "Auxiliares":               ("planta",      "operario"),
    "Chofer":                   ("planta",      "operario"),
    "Legislativo":              ("planta",      "administrativo"),
    "Sala Velatoria":           ("planta",      "operario"),
    "corralón":                 ("planta",      "operario"),
}
OBRAS_EVIDENTES = (431, 432, 609, 430)


def slug(s: str) -> str:
    s = unicodedata.normalize("NFD", s)
    s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn").lower()
    return re.sub(r"_+", "_", re.sub(r"[^a-z0-9]+", "_", s)).strip("_")[:40]


async def correr(dry_run: bool):
    engine = create_async_engine(settings.DATABASE_URL)
    hechos = []
    async with engine.begin() as conn:
        db = (await conn.execute(text("SELECT DATABASE()"))).scalar()
        print(f"Base: {db}\n")
        if "prod" in (db or "").lower():
            raise SystemExit("ABORTADO: la F3 en producción es la noche con cartel, la corre Infra.")

        raiz = (await conn.execute(text(
            "SELECT id FROM persona_tipos WHERE municipio_id=:m AND codigo='empleado' AND padre_id IS NULL"),
            {"m": SPN})).scalar()
        if not raiz:
            raise SystemExit("SPN no tiene el tipo raíz `empleado`: correr antes migrar_f0_persona_obras.py")

        # ── 1. subtipos desde los tipos de empleado con uso ────────────────
        tipos = (await conn.execute(text("""
            SELECT te.id, te.nombre, te.orden, COUNT(c.id) uso
              FROM tesoreria_tipos_empleado te LEFT JOIN contactos c ON c.tipo_empleado_id = te.id
             WHERE te.municipio_id = :m GROUP BY te.id, te.nombre, te.orden HAVING uso > 0
             ORDER BY uso DESC"""), {"m": SPN})).fetchall()
        print(f"1. {len(tipos)} tipos de empleado con uso pasan a subtipos de `empleado`:")
        mapa = {}  # tipo_empleado_id -> subtipo id
        for te_id, nombre, orden, uso in tipos:
            codigo = slug(nombre)
            print(f"   - {nombre} ({uso}) -> subtipo `{codigo}`")
            if dry_run:
                continue
            await conn.execute(text("""
                INSERT IGNORE INTO persona_tipos (municipio_id, codigo, nombre, orden, cobra, activo, padre_id)
                VALUES (:m, :c, :n, :o, 1, 1, :p)"""),
                {"m": SPN, "c": codigo, "n": nombre, "o": orden or 0, "p": raiz})
            mapa[te_id] = (await conn.execute(text(
                "SELECT id FROM persona_tipos WHERE municipio_id=:m AND codigo=:c"), {"m": SPN, "c": codigo})).scalar()
        if not dry_run:
            hechos.append(f"{len(mapa)} subtipos de empleado en el catálogo")

        # ── 2. el rol principal pasa al subtipo ────────────────────────────
        n_roles = 0
        if not dry_run:
            for te_id, sub_id in mapa.items():
                r = await conn.execute(text("""
                    UPDATE persona_roles pr JOIN contactos c ON c.id = pr.persona_id
                       SET pr.tipo_id = :sub
                     WHERE c.municipio_id = :m AND c.tipo_empleado_id = :te AND pr.tipo_id = :raiz"""),
                    {"sub": sub_id, "m": SPN, "te": te_id, "raiz": raiz})
                n_roles += r.rowcount
            hechos.append(f"{n_roles} contactos quedaron en su subtipo")
        else:
            n = (await conn.execute(text("""
                SELECT COUNT(*) FROM persona_roles pr JOIN contactos c ON c.id = pr.persona_id
                 WHERE c.municipio_id=:m AND c.tipo_empleado_id IS NOT NULL AND pr.tipo_id=:raiz"""),
                {"m": SPN, "raiz": raiz})).scalar()
            print(f"2. {n} contactos pasarían de `empleado` a su subtipo")

        # ── 3. ficha laboral para cada contacto tipo empleado ──────────────
        sin_ficha = (await conn.execute(text(f"""
            SELECT c.id, c.nombre, c.apellido, c.telefono, te.nombre
              FROM {TABLA} c LEFT JOIN tesoreria_tipos_empleado te ON te.id = c.tipo_empleado_id
             WHERE c.municipio_id = :m AND c.tipo = 'empleado' AND c.activo = 1
               AND NOT EXISTS (SELECT 1 FROM empleados e WHERE e.persona_id = c.id)"""), {"m": SPN})).fetchall()
        print(f"\n3. {len(sin_ficha)} contactos tipo empleado sin ficha laboral")
        if not dry_run:
            for cid, nombre, apellido, telefono, te_nombre in sin_ficha:
                modalidad, tipo_legacy = TRADUCCION.get(te_nombre or "", ("planta", "operario"))
                await conn.execute(text("""
                    INSERT INTO empleados (municipio_id, nombre, apellido, telefono, tipo, activo, persona_id, modalidad, capacidad_maxima, created_at)
                    VALUES (:m, :n, :a, :t, :tl, 1, :p, :mo, 10, NOW())"""),
                    {"m": SPN, "n": nombre, "a": apellido, "t": telefono, "tl": tipo_legacy, "p": cid, "mo": modalidad})
            hechos.append(f"{len(sin_ficha)} fichas laborales creadas con su modalidad")
            r = await conn.execute(text("""
                UPDATE empleados e JOIN contactos c ON c.id = e.persona_id
                  LEFT JOIN tesoreria_tipos_empleado te ON te.id = c.tipo_empleado_id
                   SET e.modalidad = CASE te.nombre
                        WHEN 'En blanco' THEN 'planta' WHEN 'Pasantes' THEN 'a_prueba'
                        WHEN 'Personal jornalizado' THEN 'jornalizado' WHEN 'Jubilado' THEN 'jubilado'
                        WHEN 'Profesionales' THEN 'contratado' ELSE 'planta' END
                 WHERE c.municipio_id = :m AND e.modalidad IS NULL"""), {"m": SPN})
            if r.rowcount:
                hechos.append(f"{r.rowcount} fichas ya existentes tomaron su modalidad")

        # ── 4. las obras evidentes ─────────────────────────────────────────
        obras = (await conn.execute(text(
            "SELECT id, nombre, tipo FROM proyectos WHERE municipio_id=:m AND id IN :ids"),
            {"m": SPN, "ids": OBRAS_EVIDENTES})).fetchall()
        print(f"\n4. obras evidentes: {[(o[1], o[2]) for o in obras]}")
        if not dry_run:
            r = await conn.execute(text(
                "UPDATE proyectos SET tipo='obra' WHERE municipio_id=:m AND id IN :ids AND tipo <> 'obra'"),
                {"m": SPN, "ids": OBRAS_EVIDENTES})
            hechos.append(f"{r.rowcount} proyectos marcados como obra")

    if not dry_run:
        async with engine.connect() as conn:
            r = (await conn.execute(text(f"""
                SELECT (SELECT COUNT(*) FROM persona_tipos WHERE municipio_id=:m AND padre_id IS NOT NULL),
                       (SELECT COUNT(*) FROM empleados WHERE municipio_id=:m),
                       (SELECT COUNT(*) FROM empleados WHERE municipio_id=:m AND persona_id IS NULL),
                       (SELECT COUNT(*) FROM {TABLA} c WHERE c.municipio_id=:m AND c.tipo='empleado' AND c.activo=1
                          AND NOT EXISTS (SELECT 1 FROM empleados e WHERE e.persona_id=c.id)),
                       (SELECT COUNT(*) FROM proyectos WHERE municipio_id=:m AND tipo='obra'),
                       (SELECT persona_id FROM usuarios WHERE id=858)
            """), {"m": SPN})).first()
            print("\nVerificación SPN:")
            print(f"   subtipos de empleado: {r[0]} · fichas laborales: {r[1]} (sin persona: {r[2]}, debe ser 0)")
            print(f"   empleados sin ficha: {r[3]} (debe ser 0) · obras: {r[4]} · persona de Bartolo: {r[5]}")
    await engine.dispose()
    print("\n" + ("SE HARÍA:" if dry_run else "HECHO:"))
    for h in hechos:
        print("   +", h)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    asyncio.run(correr(ap.parse_args().dry_run))
