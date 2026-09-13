"""Semilla ÚTIL de Obras para la demo de Merlo (QA) + etapas para las obras reales de SPN.

Dueño (2026-09-13): "semillas con avances de 2 o 3 meses, con gastos cruzados de
tesorería, proveedores, empleados". Todo lo que se siembra queda marcado [DEMO] en la
descripción. Idempotente: si la obra ya existe por nombre, no se vuelve a crear.

Merlo (1000149): tres obras con tres meses de historia (junio a septiembre 2026):
  - Pavimentación calle San Martín · por contrato · 4 etapas · en curso, en plata
  - Plaza del barrio Amandy · por administración · 3 etapas · con desvío de plata
  - Luminarias LED avenida · por contrato · 3 etapas · atrasada
  Cada una: presupuesto, contratista (Persona tipo contratista, se crea si falta),
  gastos en `gastos` + `gastos_cuotas` (materiales a proveedores, certificados al
  contratista, sueldos a empleados) imputados en `gasto_proyectos` con su etapa, dos o
  tres sin etapa (para la bandeja), un par programados a futuro, y órdenes de trabajo
  con cuadrilla y horas reales.

San Pedro Norte (80): a sus 4 obras reales se les cargan etapas con fechas alrededor
de sus gastos reales y un presupuesto ESTIMADO ([DEMO] en la descripción de la etapa);
ningún gasto se crea ni se mueve. Sus gastos imputados quedan sin etapa: la bandeja
los propone y Bartolo (o el dueño) confirma.

    python scripts/semilla_obras.py --dry-run
    python scripts/semilla_obras.py
"""
import argparse
import asyncio
import os
import random
import sys
from datetime import date, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text  # noqa: E402
from sqlalchemy.ext.asyncio import create_async_engine  # noqa: E402

from core.config import settings  # noqa: E402

MERLO = 1000149
SPN = 80
HOY = date(2026, 9, 13)
rnd = random.Random(20260913)

OBRAS_MERLO = [
    {
        "nombre": "Pavimentación calle San Martín", "tipo_obra": "Pavimento", "modalidad": "contrato",
        "expediente": "0455/26", "fuente": "provincial", "presupuesto": 86_000_000, "plazo": 150,
        "inicio": date(2026, 6, 8), "barrio": "Barrio Argentino", "contratista": ("Vial Norte", "SRL"),
        "etapas": [("Movimiento de suelos", 20, 0, 24), ("Base y cordón cuneta", 30, 24, 60), ("Carpeta asfáltica", 35, 60, 110), ("Señalización", 15, 110, 150)],
        "avances": [100, 100, 55, 0], "estados": ["terminada", "terminada", "en_curso", "pendiente"],
        "gasto_por_etapa": [0.22, 0.30, 0.20, 0.0],   # fracción del presupuesto ya gastada por etapa
        "ot": 9,
    },
    {
        "nombre": "Plaza del barrio Amandy", "tipo_obra": "Plaza o espacio público", "modalidad": "administracion",
        "expediente": "0471/26", "fuente": "municipal", "presupuesto": 24_000_000, "plazo": 120,
        "inicio": date(2026, 6, 22), "barrio": "Amandy", "contratista": None,
        "etapas": [("Preparación del terreno", 25, 0, 30), ("Solados y mobiliario", 45, 30, 85), ("Parquización e iluminación", 30, 85, 120)],
        "avances": [100, 40, 0], "estados": ["terminada", "en_curso", "pendiente"],
        "gasto_por_etapa": [0.30, 0.42, 0.0],         # gastó de más en la etapa 2: desvío
        "ot": 14,
    },
    {
        "nombre": "Luminarias LED avenida Perón", "tipo_obra": "Luminarias", "modalidad": "contrato",
        "expediente": "0438/26", "fuente": "nacional", "presupuesto": 38_000_000, "plazo": 75,
        "inicio": date(2026, 6, 1), "barrio": "Los Vascos", "contratista": ("Electro Sur", "SA"),
        "etapas": [("Tendido", 40, 0, 25), ("Columnas y luminarias", 45, 25, 60), ("Puesta en marcha", 15, 60, 75)],
        "avances": [100, 70, 0], "estados": ["terminada", "en_curso", "pendiente"],
        "gasto_por_etapa": [0.38, 0.30, 0.0],
        "ot": 5,
    },
]

OBRAS_SPN = [
    {   # en plazo y en plata, por contrato, PUBLICADA
        "nombre": "[DEMO] Cordón cuneta barrio Norte", "tipo_obra": "Cordón cuneta", "modalidad": "contrato",
        "expediente": "0512/26", "fuente": "provincial", "presupuesto": 42_000_000, "plazo": 120,
        "inicio": date(2026, 6, 10), "barrio": None, "contratista": ("Constructora del Norte", "SRL"),
        "etapas": [("Excavación", 30, 0, 35), ("Hormigonado", 50, 35, 95), ("Terminaciones", 20, 95, 120)],
        "avances": [100, 60, 0], "estados": ["terminada", "en_curso", "pendiente"],
        "gasto_por_etapa": [0.28, 0.27, 0.0], "ot": 6, "publico": 1, "terminada": False,
    },
    {   # CON DESVÍO DE PLATA, por administración (cuadrilla propia + materiales)
        "nombre": "[DEMO] Refacción del hospital municipal", "tipo_obra": "Edificio", "modalidad": "administracion",
        "expediente": "0498/26", "fuente": "municipal", "presupuesto": 28_000_000, "plazo": 110,
        "inicio": date(2026, 6, 15), "barrio": None, "contratista": None,
        "etapas": [("Demolición y estructura", 30, 0, 30), ("Instalaciones", 45, 30, 80), ("Terminaciones", 25, 80, 110)],
        "avances": [100, 35, 0], "estados": ["terminada", "en_curso", "pendiente"],
        "gasto_por_etapa": [0.32, 0.46, 0.0], "ot": 12, "publico": 0, "terminada": False,
    },
    {   # ATRASADA (la etapa en curso pasó su fin previsto) y con una etapa PARADA
        "nombre": "[DEMO] Red de agua paraje El Quebracho", "tipo_obra": "Agua y cloacas", "modalidad": "contrato",
        "expediente": "0463/26", "fuente": "nacional", "presupuesto": 55_000_000, "plazo": 90,
        "inicio": date(2026, 6, 1), "barrio": None, "contratista": ("Hidráulica Ischilín", "SA"),
        "etapas": [("Zanjeo", 30, 0, 25), ("Cañería y conexiones", 45, 25, 65), ("Pruebas y relleno", 25, 65, 90)],
        "avances": [100, 55, 0], "estados": ["terminada", "en_curso", "parada"],
        "gasto_por_etapa": [0.30, 0.22, 0.0], "ot": 4, "publico": 1, "terminada": False,
    },
    {   # TERMINADA, por administración, publicada
        "nombre": "[DEMO] Renovación plaza San Martín", "tipo_obra": "Plaza o espacio público", "modalidad": "administracion",
        "expediente": "0420/26", "fuente": "municipal", "presupuesto": 15_000_000, "plazo": 75,
        "inicio": date(2026, 5, 20), "barrio": None, "contratista": None,
        "etapas": [("Preparación del terreno", 30, 0, 20), ("Solados y mobiliario", 45, 20, 55), ("Parquización e iluminación", 25, 55, 75)],
        "avances": [100, 100, 100], "estados": ["terminada", "terminada", "terminada"],
        "gasto_por_etapa": [0.29, 0.44, 0.24], "ot": 10, "publico": 1, "terminada": True,
    },
]

CONCEPTOS_MATERIALES = ["Compra de materiales de obra", "Compras varias", "Contratacion de fletes y transporte"]

# SPN: etapas para sus obras reales, con fechas alrededor de sus gastos (mayo a diciembre 2026)
ETAPAS_SPN = {
    431: ("Predio municipal", 118_000_000, [("Suelos y platea", 35, date(2026, 5, 1), date(2026, 6, 15), "terminada", 100),
                                            ("Estructura", 25, date(2026, 6, 16), date(2026, 8, 15), "terminada", 100),
                                            ("Techado y cerramientos", 25, date(2026, 8, 16), date(2026, 11, 30), "en_curso", 40),
                                            ("Terminaciones", 15, date(2026, 12, 1), date(2027, 3, 15), "pendiente", 0)]),
    432: ("Vivienda Semilla", 64_000_000, [("Fundaciones", 30, date(2026, 5, 1), date(2026, 6, 30), "terminada", 100),
                                            ("Mampostería", 40, date(2026, 7, 1), date(2026, 10, 15), "en_curso", 45),
                                            ("Instalaciones y terminaciones", 30, date(2026, 10, 16), date(2027, 1, 31), "pendiente", 0)]),
    609: ("Salón de actos", 30_000_000, [("Estructura", 40, date(2026, 8, 1), date(2026, 9, 30), "en_curso", 40),
                                          ("Cerramientos", 35, date(2026, 10, 1), date(2026, 11, 30), "pendiente", 0),
                                          ("Terminaciones", 25, date(2026, 12, 1), date(2027, 1, 31), "pendiente", 0)]),
    430: ("Balneario", 12_000_000, [("Vestuarios", 60, date(2025, 5, 1), date(2026, 8, 10), "en_curso", 20),
                                     ("Pileta y entorno", 40, date(2026, 8, 11), date(2026, 12, 15), "pendiente", 0)]),
}


async def _persona(conn, muni, nombre, apellido, tipo):
    r = (await conn.execute(text(
        "SELECT id FROM contactos WHERE municipio_id=:m AND nombre=:n AND COALESCE(apellido,'')=:a"),
        {"m": muni, "n": nombre, "a": apellido or ""})).scalar()
    if r:
        return r
    await conn.execute(text(
        "INSERT INTO contactos (municipio_id, nombre, apellido, tipo, activo, created_at) VALUES (:m, :n, :a, :t, 1, NOW())"),
        {"m": muni, "n": nombre, "a": apellido, "t": tipo})
    pid = (await conn.execute(text("SELECT LAST_INSERT_ID()"))).scalar()
    await conn.execute(text("""
        INSERT IGNORE INTO persona_roles (municipio_id, persona_id, tipo_id, principal)
        SELECT :m, :p, t.id, 1 FROM persona_tipos t WHERE t.municipio_id=:m AND t.codigo=:t AND t.padre_id IS NULL"""),
        {"m": muni, "p": pid, "t": tipo})
    return pid


async def _gasto(conn, muni, creador, persona_id, concepto, monto, fecha, proyecto_id, etapa_id, origen, descripcion):
    await conn.execute(text("""
        INSERT INTO gastos (municipio_id, creador_id, destino_tipo, destino_contacto_id, concepto, descripcion, monto_pesos,
                            fecha, tipo_financiacion, forma_pago, estado_pago, cuotas_total, activo, created_at)
        VALUES (:m, :c, 'contacto', :p, :con, :d, :mo, :f, 'contado', 'transferencia', :ep, 1, 1, :f)"""),
        {"m": muni, "c": creador, "p": persona_id, "con": concepto, "d": descripcion, "mo": monto, "f": fecha,
         "ep": "al_dia" if fecha > HOY else "concretado"})
    gid = (await conn.execute(text("SELECT LAST_INSERT_ID()"))).scalar()
    await conn.execute(text("""
        INSERT INTO gastos_cuotas (gasto_id, numero, monto, fecha_vencimiento, fecha_pago, estado, forma_pago)
        VALUES (:g, 1, :mo, :f, :fp, :e, 'transferencia')"""),
        {"g": gid, "mo": monto, "f": fecha, "fp": None if fecha > HOY else fecha, "e": "pendiente" if fecha > HOY else "pagada"})
    await conn.execute(text("""
        INSERT INTO gasto_proyectos (gasto_id, proyecto_id, monto_asignado, etapa_id, origen, created_at)
        VALUES (:g, :pr, :mo, :e, :o, NOW())"""), {"g": gid, "pr": proyecto_id, "mo": monto, "e": etapa_id, "o": origen})
    return gid


async def sembrar(conn, dry_run, muni, obras):
    admin = (await conn.execute(text(
        "SELECT id FROM usuarios WHERE municipio_id=:m AND rol='admin' AND activo=1 ORDER BY id LIMIT 1"), {"m": muni})).scalar()
    proveedores = (await conn.execute(text(
        "SELECT id, nombre, apellido FROM contactos WHERE municipio_id=:m AND tipo='proveedor' AND activo=1"), {"m": muni})).fetchall()
    empleados = (await conn.execute(text(
        "SELECT c.id, c.nombre, c.apellido FROM contactos c JOIN empleados e ON e.persona_id=c.id WHERE c.municipio_id=:m AND c.tipo='empleado' AND c.activo=1 AND c.nombre NOT IN ('Admin','Supervisor') LIMIT 8"), {"m": muni})).fetchall()
    cuadrillas = (await conn.execute(text("SELECT id, nombre FROM cuadrillas WHERE municipio_id=:m"), {"m": muni})).fetchall()
    barrios = dict((await conn.execute(text("SELECT nombre, id FROM barrios WHERE municipio_id=:m"), {"m": muni})).fetchall())
    categoria = (await conn.execute(text("SELECT id FROM categorias_reclamo WHERE municipio_id=:m ORDER BY id LIMIT 1"), {"m": muni})).scalar()
    print(f"Muni {muni}: admin {admin}, {len(proveedores)} proveedores, {len(empleados)} empleados con ficha, {len(cuadrillas)} cuadrillas")
    if not admin or not proveedores or not empleados:
        raise SystemExit(f"El municipio {muni} no tiene lo mínimo para una semilla útil.")
    hechos = []
    for o in obras:
        existe = (await conn.execute(text("SELECT id FROM proyectos WHERE municipio_id=:m AND nombre=:n"), {"m": muni, "n": o["nombre"]})).scalar()
        if existe:
            print(f"  = {o['nombre']} ya existe (#{existe}), se saltea")
            continue
        print(f"  + {o['nombre']}: {len(o['etapas'])} etapas, presupuesto ${o['presupuesto']:,}, {o['ot']} OT")
        if dry_run:
            continue
        contratista_id = await _persona(conn, muni, o["contratista"][0], o["contratista"][1], "contratista") if o["contratista"] else None
        fin = o["inicio"] + timedelta(days=o["plazo"])
        inicio_real = o["inicio"] + timedelta(days=rnd.randint(0, 6))
        await conn.execute(text("""
            INSERT INTO proyectos (municipio_id, nombre, descripcion, presupuesto, fecha_inicio, fecha_fin, estado, activo,
                                   publico, estado_obra, avance, tipo, tipo_obra, modalidad, contratista_persona_id, expediente,
                                   fuente_financiamiento, monto_contrato, plazo_dias, fecha_inicio_real, barrio_id, latitud, longitud,
                                   mostrar_monto, created_at, updated_at)
            VALUES (:m, :n, :d, :p, :fi, :ff, :est, 1, :pub, :eo, NULL, 'obra', :to, :mo, :c, :e, :fu, :p, :pl, :fir,
                    :b, NULL, NULL, :pub, :fi, NOW())"""),
            {"m": muni, "n": o["nombre"], "d": "[DEMO] Obra sembrada con tres meses de historia.", "p": o["presupuesto"],
             "fi": o["inicio"], "ff": fin, "pub": o.get("publico", 0), "to": o["tipo_obra"], "mo": o["modalidad"],
             "est": "finalizado" if o.get("terminada") else "activo", "eo": "terminada" if o.get("terminada") else "en_ejecucion",
             "c": contratista_id, "e": o["expediente"], "fu": o["fuente"], "pl": o["plazo"], "fir": inicio_real, "b": barrios.get(o["barrio"])})
        if o.get("terminada"):
            await conn.execute(text("UPDATE proyectos SET fecha_fin_real=:f, avance=100 WHERE id=LAST_INSERT_ID()"), {"f": fin - timedelta(days=rnd.randint(0, 6))})
        pid = (await conn.execute(text("SELECT LAST_INSERT_ID()"))).scalar()

        etapa_ids = []
        for i, (nombre, inc, d0, d1) in enumerate(o["etapas"]):
            ini_p = o["inicio"] + timedelta(days=d0); fin_p = o["inicio"] + timedelta(days=d1)
            estado = o["estados"][i]
            ini_r = ini_p + timedelta(days=rnd.randint(0, 5)) if estado != "pendiente" else None
            fin_r = min(fin_p + timedelta(days=rnd.randint(-3, 9)), HOY) if estado == "terminada" else None
            await conn.execute(text("""
                INSERT INTO obra_etapas (municipio_id, proyecto_id, orden, nombre, incidencia_pct, avance_pct, estado,
                                         fecha_inicio_prevista, fecha_fin_prevista, fecha_inicio_real, fecha_fin_real, monto_previsto)
                VALUES (:m, :p, :o, :n, :inc, :av, :es, :ip, :fp, :ir, :fr, :mp)"""),
                {"m": muni, "p": pid, "o": i + 1, "n": nombre, "inc": inc, "av": o["avances"][i], "es": estado,
                 "ip": ini_p, "fp": fin_p, "ir": ini_r, "fr": fin_r, "mp": round(o["presupuesto"] * inc / 100)})
            etapa_ids.append(((await conn.execute(text("SELECT LAST_INSERT_ID()"))).scalar(), ini_p, fin_p, estado))

        # Gastos por etapa: certificados al contratista (o mano de obra si es por administración),
        # materiales a proveedores, sueldos a empleados. Fechas dentro de la etapa; nunca después de hoy
        # salvo los programados.
        n_gastos = 0
        for i, (eid, ini_p, fin_p, estado) in enumerate(etapa_ids):
            total = o["presupuesto"] * o["gasto_por_etapa"][i]
            if total <= 0:
                continue
            hasta = min(fin_p, HOY)
            dias = max(1, (hasta - ini_p).days)
            partes = []
            if contratista_id:
                partes += [("cert", 0.55), ("mat", 0.30), ("sueldo", 0.15)]
            else:
                partes += [("mat", 0.55), ("sueldo", 0.45)]
            for clase, frac in partes:
                plata = total * frac
                n = rnd.randint(2, 4) if clase != "sueldo" else 3
                for k in range(n):
                    fecha = ini_p + timedelta(days=int(dias * (k + 1) / (n + 1)) + rnd.randint(-2, 2))
                    fecha = min(max(fecha, ini_p), hasta)
                    monto = round(plata / n * rnd.uniform(0.8, 1.2))
                    sin_etapa = clase == "mat" and k == n - 1 and estado == "en_curso"   # queda para la bandeja
                    if clase == "cert":
                        await _gasto(conn, muni, admin, contratista_id, "Obra publica / construccion", monto, fecha, pid,
                                     None if sin_etapa else eid, "automatica", f"[DEMO] Certificado {k + 1} · {o['nombre']}")
                    elif clase == "mat":
                        prov = proveedores[rnd.randrange(len(proveedores))]
                        await _gasto(conn, muni, admin, prov[0], rnd.choice(CONCEPTOS_MATERIALES), monto, fecha, pid,
                                     None if sin_etapa else eid, "manual", f"[DEMO] Materiales · {o['nombre']}")
                    else:
                        emp = empleados[(i * 3 + k) % len(empleados)]
                        await _gasto(conn, muni, admin, emp[0], "Pago de sueldos y jornales", monto, fecha, pid, eid, "manual",
                                     f"[DEMO] Jornales imputados · {o['nombre']}")
                    n_gastos += 1
        # Programados a futuro en la etapa en curso (si hay contratista)
        en_curso = next(((eid, ini_p, fin_p) for eid, ini_p, fin_p, es in etapa_ids if es == "en_curso"), None)
        if en_curso and contratista_id:
            for k in range(2):
                fecha = HOY + timedelta(days=30 * (k + 1))
                await _gasto(conn, muni, admin, contratista_id, "Obra publica / construccion", round(o["presupuesto"] * 0.05), fecha,
                             pid, en_curso[0], "automatica", f"[DEMO] Certificado programado · {o['nombre']}")
                n_gastos += 1
        # Órdenes de trabajo de la obra, con cuadrilla y horas
        for k in range(o["ot"]):
            eid, ini_p, fin_p, _es = etapa_ids[min(len(etapa_ids) - 1, k * len(etapa_ids) // max(1, o["ot"]))]
            fecha = min(ini_p + timedelta(days=rnd.randint(0, max(1, (min(fin_p, HOY) - ini_p).days))), HOY)
            cu = cuadrillas[k % len(cuadrillas)] if cuadrillas else None
            horas = round(rnd.uniform(6, 16), 1)
            await conn.execute(text("""
                INSERT INTO ordenes_trabajo (municipio_id, numero, estado, titulo, descripcion, prioridad, creador_id, origen,
                                             cuadrilla_id, categoria_id, fecha_programada, horas_estimadas, horas_reales,
                                             fecha_completada, proyecto_id, etapa_id, created_at)
                VALUES (:m, :num, 'completada', :t, :d, 'media', :c, 'manual', :cu, :cat, :f, :he, :hr, :fc, :p, :e, :f)"""),
                {"m": muni, "num": f"OT-OBRA-{pid}-{k + 1:02d}", "t": f"{o['nombre']} · jornada {k + 1}",
                 "d": "[DEMO] Jornada de cuadrilla en la obra", "c": admin, "cu": cu[0] if cu else None, "cat": categoria,
                 "f": fecha, "he": horas, "hr": horas, "fc": fecha, "p": pid, "e": eid})
        hechos.append(f"{o['nombre']}: {n_gastos} gastos, {o['ot']} OT")
    return hechos


async def etapas_spn(conn, dry_run):
    hechos = []
    for pid, (nombre, presupuesto, etapas) in ETAPAS_SPN.items():
        existe = (await conn.execute(text("SELECT COUNT(*) FROM obra_etapas WHERE proyecto_id=:p"), {"p": pid})).scalar()
        if existe:
            print(f"  = SPN {nombre}: ya tiene {existe} etapas, se saltea")
            continue
        print(f"  + SPN {nombre}: {len(etapas)} etapas, presupuesto estimado ${presupuesto:,}")
        if dry_run:
            continue
        await conn.execute(text("UPDATE proyectos SET monto_contrato=:mc, presupuesto=COALESCE(presupuesto, :mc) WHERE id=:p AND municipio_id=:m AND monto_contrato IS NULL"),
                           {"mc": presupuesto, "p": pid, "m": SPN})
        for i, (en, inc, ip, fp, es, av) in enumerate(etapas):
            await conn.execute(text("""
                INSERT INTO obra_etapas (municipio_id, proyecto_id, orden, nombre, descripcion, incidencia_pct, avance_pct, estado,
                                         fecha_inicio_prevista, fecha_fin_prevista, fecha_inicio_real, fecha_fin_real, monto_previsto)
                VALUES (:m, :p, :o, :n, '[DEMO] etapa y presupuesto estimados; los gastos son reales', :inc, :av, :es, :ip, :fp, :ir, :fr, :mp)"""),
                {"m": SPN, "p": pid, "o": i + 1, "n": en, "inc": inc, "av": av, "es": es, "ip": ip, "fp": fp,
                 "ir": ip if es != "pendiente" else None, "fr": fp if es == "terminada" else None,
                 "mp": round(presupuesto * inc / 100)})
        hechos.append(f"SPN {nombre}: {len(etapas)} etapas")
    return hechos


async def main(dry_run):
    engine = create_async_engine(settings.DATABASE_URL)
    async with engine.begin() as conn:
        db = (await conn.execute(text("SELECT DATABASE()"))).scalar()
        print(f"Base: {db}\n")
        if "prod" in (db or "").lower():
            raise SystemExit("ABORTADO: la semilla es de QA.")
        h1 = await sembrar(conn, dry_run, MERLO, OBRAS_MERLO)
        h1 += await sembrar(conn, dry_run, SPN, OBRAS_SPN)
        h2 = await etapas_spn(conn, dry_run)
    await engine.dispose()
    print("\n" + ("SE HARÍA" if dry_run else "HECHO") + ":")
    for h in h1 + h2:
        print("   +", h)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    asyncio.run(main(ap.parse_args().dry_run))
