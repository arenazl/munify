"""
SUPER DEMO SEED — populates a municipio with 1 year of realistic activity.

Genera datos coherentes para mostrarle a un cliente:
  - Empleados con horarios, categorías, cuadrillas, ausencias y métricas mensuales
  - Cuadrillas con miembros y especialidades
  - Vecinos extra (50) con datos completos
  - Reclamos: 200 distribuidos en 12 meses, asignados a empleados/cuadrillas,
    con historial completo, calificaciones, fotos mock
  - Solicitudes: 80 trámites en distintos estados con documentos
  - SLA configurado + algunas violaciones
  - Pagos completados via GIRE Aura (tasas y trámites)
  - Notificaciones (algunas leídas)
  - Gamificación: puntos, badges, leaderboard mensual
  - Grupos de reclamos (similares) + reclamo_personas (vecinos sumados)

Ejecutar:
  python backend/scripts/seed_super_demo.py <municipio_id>
  ej: python backend/scripts/seed_super_demo.py 7
"""
import asyncio
import random
import sys
from datetime import datetime, timedelta, date, time
from decimal import Decimal
from pathlib import Path
from secrets import token_hex

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

from core.config import settings
from core.security import get_password_hash

# Reproducibilidad
random.seed(42)

# ============================================================
# Constantes / catalogos
# ============================================================

NOMBRES = [
    "Juan", "María", "Carlos", "Ana", "Pedro", "Laura", "Diego", "Lucía",
    "Martín", "Sofía", "Pablo", "Valentina", "Nicolás", "Camila", "Fernando",
    "Agustina", "Sebastián", "Florencia", "Tomás", "Julieta", "Matías", "Rocío",
    "Lucas", "Milagros", "Facundo", "Aldana", "Gonzalo", "Brenda", "Emiliano",
    "Abril", "Joaquín", "Catalina", "Bruno", "Renata", "Ramiro", "Olivia",
]

APELLIDOS = [
    "García", "Rodríguez", "López", "Martínez", "González", "Fernández", "Pérez",
    "Sánchez", "Romero", "Torres", "Díaz", "Álvarez", "Ruiz", "Jiménez", "Hernández",
    "Moreno", "Muñoz", "Castro", "Vargas", "Ortiz", "Silva", "Núñez", "Rojas", "Medina",
]

EMPLEADOS_NOMBRES = [
    ("Ricardo", "Salazar", "operario"),
    ("Patricia", "Gutiérrez", "administrativo"),
    ("Eduardo", "Méndez", "operario"),
    ("Silvia", "Aguirre", "operario"),
    ("Hernán", "Ibáñez", "operario"),
    ("Marcela", "Suárez", "administrativo"),
    ("Andrés", "Cabrera", "operario"),
    ("Mónica", "Quintero", "administrativo"),
    ("Roberto", "Vega", "operario"),
    ("Liliana", "Domínguez", "administrativo"),
    ("Walter", "Maldonado", "operario"),
    ("Verónica", "Sosa", "operario"),
    ("Daniel", "Ferreyra", "operario"),
    ("Gabriela", "Luna", "administrativo"),
    ("Alejandro", "Acosta", "operario"),
]

CUADRILLAS_NOMBRES = [
    ("Cuadrilla Alfa", "Bacheo y pavimentación"),
    ("Cuadrilla Beta", "Recolección y limpieza"),
    ("Cuadrilla Gamma", "Iluminación y eléctrica"),
    ("Cuadrilla Delta", "Espacios verdes"),
    ("Cuadrilla Omega", "Obras varias"),
]

TITULOS_RECLAMO = [
    "Bache profundo en la calle",
    "Luminaria fundida",
    "Falta recolección de residuos",
    "Pasto sin cortar en plaza",
    "Semáforo intermitente",
    "Cable colgando peligroso",
    "Basural no autorizado",
    "Vereda rota",
    "Pérdida de agua",
    "Árbol caído sobre vereda",
    "Animal abandonado",
    "Ruidos molestos en madrugada",
    "Cartelería deteriorada",
    "Cordón cuneta destruido",
    "Falta señalización en cruce",
]

DESCRIPCIONES = [
    "Hace varios días que está así y no recibo respuesta.",
    "Pone en riesgo a vecinos y autos. Necesita atención urgente.",
    "Esta situación se repite todas las semanas en la misma cuadra.",
    "Vine al municipio pero no me dieron una solución.",
    "Adjunto foto y dirección exacta. Por favor revisar.",
    "Es un problema recurrente del barrio que afecta a varios vecinos.",
    "Solicito que se priorice por la cantidad de personas afectadas.",
]

CALLES = [
    "Av. San Martín", "Av. Belgrano", "Calle 25 de Mayo", "Mitre", "Sarmiento",
    "Rivadavia", "Italia", "España", "Moreno", "Av. del Libertador",
    "Pellegrini", "Alberdi", "Lavalle", "Av. Eva Perón", "Las Heras",
]

INFRACCIONES = ["vacaciones", "licencia_medica", "tramite_personal", "capacitacion"]

ASUNTOS_TRAMITE = [
    "Habilitación de comercio nuevo",
    "Renovación de habilitación comercial",
    "Solicitud de poda de árbol en vereda",
    "Permiso para evento en espacio público",
    "Alta de comercio gastronómico",
    "Permiso de obra menor",
    "Solicitud de certificado de domicilio",
    "Certificado de libre deuda",
    "Carnet de manipulación de alimentos",
    "Patente para vehículo nuevo",
]


def random_dt_in_year() -> datetime:
    """Random datetime en los últimos 365 días."""
    days_ago = random.randint(0, 365)
    return datetime.now() - timedelta(
        days=days_ago,
        hours=random.randint(0, 23),
        minutes=random.randint(0, 59),
    )


def random_dt_in_month_n_ago(n: int) -> datetime:
    """Random datetime en el mes n hacia atrás (0=mes actual)."""
    base = datetime.now() - timedelta(days=30 * n)
    return base - timedelta(
        days=random.randint(0, 28),
        hours=random.randint(0, 23),
    )


# ============================================================
# Helpers
# ============================================================

async def fetch_existing(conn, municipio_id: int) -> dict:
    """Lee todo el catálogo del muni que necesitamos."""
    out = {}

    # Categorías de reclamo
    r = await conn.execute(text(
        "SELECT id, nombre FROM categorias_reclamo WHERE municipio_id = :m AND activo = 1"
    ), {"m": municipio_id})
    out["categorias_reclamo"] = list(r)

    # Categorías de trámite
    r = await conn.execute(text(
        "SELECT id, nombre FROM categorias_tramite WHERE municipio_id = :m AND activo = 1"
    ), {"m": municipio_id})
    out["categorias_tramite"] = list(r)

    # Trámites disponibles
    r = await conn.execute(text(
        "SELECT id, nombre, categoria_tramite_id, costo FROM tramites WHERE municipio_id = :m AND activo = 1"
    ), {"m": municipio_id})
    out["tramites"] = list(r)

    # Dependencias
    r = await conn.execute(text(
        "SELECT id FROM municipio_dependencias WHERE municipio_id = :m AND activo = 1"
    ), {"m": municipio_id})
    out["dependencias"] = [row[0] for row in r]

    # Mapeo categoria -> dependencia
    r = await conn.execute(text(
        "SELECT categoria_id, municipio_dependencia_id FROM municipio_dependencia_categorias "
        "WHERE municipio_id = :m"
    ), {"m": municipio_id})
    out["cat_to_dep"] = {row[0]: row[1] for row in r}

    # Barrios
    r = await conn.execute(text(
        "SELECT id, nombre, latitud, longitud FROM barrios WHERE municipio_id = :m"
    ), {"m": municipio_id})
    out["barrios"] = list(r)

    # Zonas
    r = await conn.execute(text(
        "SELECT id, nombre FROM zonas WHERE municipio_id = :m"
    ), {"m": municipio_id})
    out["zonas"] = list(r)

    # Vecinos existentes
    r = await conn.execute(text(
        "SELECT id, dni, nombre, apellido FROM usuarios WHERE municipio_id = :m AND rol = 'vecino' AND activo = 1"
    ), {"m": municipio_id})
    out["vecinos"] = list(r)

    # Tipos de tasa
    r = await conn.execute(text(
        "SELECT id, codigo, nombre, ciclo FROM tipos_tasa WHERE activo = 1"
    ))
    out["tipos_tasa"] = list(r)

    # Datos del muni
    r = await conn.execute(text(
        "SELECT codigo, nombre, latitud, longitud FROM municipios WHERE id = :m"
    ), {"m": municipio_id})
    out["muni"] = r.first()

    return out


# ============================================================
# Phase: Empleados, horarios, cuadrillas
# ============================================================

async def seed_empleados(conn, municipio_id: int, ctx: dict) -> list[int]:
    print("[1/10] Empleados + horarios...")

    # Limpiar empleados previos (para idempotencia)
    await conn.execute(text("SET FOREIGN_KEY_CHECKS = 0"))
    await conn.execute(text(
        "DELETE FROM empleado_metricas WHERE empleado_id IN "
        "(SELECT id FROM empleados WHERE municipio_id = :m)"
    ), {"m": municipio_id})
    await conn.execute(text(
        "DELETE FROM empleado_ausencias WHERE empleado_id IN "
        "(SELECT id FROM empleados WHERE municipio_id = :m)"
    ), {"m": municipio_id})
    await conn.execute(text(
        "DELETE FROM empleado_horarios WHERE empleado_id IN "
        "(SELECT id FROM empleados WHERE municipio_id = :m)"
    ), {"m": municipio_id})
    await conn.execute(text(
        "DELETE FROM empleado_categorias WHERE empleado_id IN "
        "(SELECT id FROM empleados WHERE municipio_id = :m)"
    ), {"m": municipio_id})
    await conn.execute(text(
        "DELETE FROM empleado_cuadrillas WHERE empleado_id IN "
        "(SELECT id FROM empleados WHERE municipio_id = :m)"
    ), {"m": municipio_id})
    await conn.execute(text(
        "UPDATE reclamos SET empleado_id = NULL WHERE municipio_id = :m"
    ), {"m": municipio_id})
    await conn.execute(text(
        "DELETE FROM empleados WHERE municipio_id = :m"
    ), {"m": municipio_id})
    await conn.execute(text("SET FOREIGN_KEY_CHECKS = 1"))

    cats = [c[0] for c in ctx["categorias_reclamo"]]
    deps = ctx["dependencias"]
    zonas = [z[0] for z in ctx["zonas"]]

    empleado_ids = []
    for nombre, apellido, tipo in EMPLEADOS_NOMBRES:
        cat_principal = random.choice(cats) if cats else None
        zona = random.choice(zonas) if zonas else None
        dep = random.choice(deps) if deps else None
        capacidad = random.randint(8, 15)

        r = await conn.execute(text(
            "INSERT INTO empleados (municipio_id, nombre, apellido, telefono, "
            "tipo, categoria_principal_id, zona_id, municipio_dependencia_id, "
            "capacidad_maxima, activo, created_at) "
            "VALUES (:m, :n, :a, :t, :tipo, :cat, :z, :dep, :cap, 1, :ts)"
        ), {
            "m": municipio_id,
            "n": nombre,
            "a": apellido,
            "t": f"+5491{random.randint(10000000, 99999999)}",
            "tipo": tipo,
            "cat": cat_principal,
            "z": zona,
            "dep": dep,
            "cap": capacidad,
            "ts": datetime.now() - timedelta(days=random.randint(180, 365)),
        })
        emp_id = r.lastrowid
        empleado_ids.append(emp_id)

        # Horarios L-V 8-17 para todos
        for dia in range(5):
            await conn.execute(text(
                "INSERT INTO empleado_horarios (empleado_id, dia_semana, "
                "hora_entrada, hora_salida, activo) "
                "VALUES (:e, :d, '08:00', '17:00', 1)"
            ), {"e": emp_id, "d": dia})

        # Categorías secundarias (cada empleado puede atender 2-4 categorías)
        otras_cats = [c for c in cats if c != cat_principal]
        for cat in random.sample(otras_cats, min(random.randint(1, 3), len(otras_cats))):
            await conn.execute(text(
                "INSERT INTO empleado_categorias (empleado_id, categoria_id, es_principal) "
                "VALUES (:e, :c, 0)"
            ), {"e": emp_id, "c": cat})
        if cat_principal:
            await conn.execute(text(
                "INSERT INTO empleado_categorias (empleado_id, categoria_id, es_principal) "
                "VALUES (:e, :c, 1)"
            ), {"e": emp_id, "c": cat_principal})

        # Ausencias: 30% de los empleados tuvieron al menos una
        if random.random() < 0.3:
            tipo_ausencia = random.choice(INFRACCIONES)
            inicio = (datetime.now() - timedelta(days=random.randint(30, 300))).date()
            duracion = random.randint(2, 14) if tipo_ausencia == "vacaciones" else random.randint(1, 5)
            await conn.execute(text(
                "INSERT INTO empleado_ausencias (empleado_id, tipo, fecha_inicio, "
                "fecha_fin, motivo, aprobado, created_at) "
                "VALUES (:e, :t, :fi, :ff, :m, 1, :ts)"
            ), {
                "e": emp_id,
                "t": tipo_ausencia,
                "fi": inicio,
                "ff": inicio + timedelta(days=duracion),
                "m": f"Ausencia tipo {tipo_ausencia}",
                "ts": datetime.combine(inicio, time()),
            })

    print(f"      -> {len(empleado_ids)} empleados creados")
    return empleado_ids


async def seed_cuadrillas(conn, municipio_id: int, empleado_ids: list[int], ctx: dict) -> list[int]:
    print("[2/10] Cuadrillas + miembros...")

    await conn.execute(text(
        "DELETE FROM cuadrilla_categorias WHERE cuadrilla_id IN "
        "(SELECT id FROM cuadrillas WHERE municipio_id = :m)"
    ), {"m": municipio_id})
    await conn.execute(text(
        "DELETE FROM cuadrillas WHERE municipio_id = :m"
    ), {"m": municipio_id})

    cats = [c[0] for c in ctx["categorias_reclamo"]]
    zonas = [z[0] for z in ctx["zonas"]]

    cuadrilla_ids = []
    empleados_disponibles = list(empleado_ids)
    random.shuffle(empleados_disponibles)

    for nombre, especialidad in CUADRILLAS_NOMBRES:
        cat_principal = random.choice(cats) if cats else None
        zona = random.choice(zonas) if zonas else None

        r = await conn.execute(text(
            "INSERT INTO cuadrillas (municipio_id, nombre, descripcion, especialidad, "
            "categoria_principal_id, zona_id, capacidad_maxima, activo, created_at) "
            "VALUES (:m, :n, :d, :e, :cat, :z, 15, 1, :ts)"
        ), {
            "m": municipio_id,
            "n": nombre,
            "d": f"Equipo de {especialidad.lower()}",
            "e": especialidad,
            "cat": cat_principal,
            "z": zona,
            "ts": datetime.now() - timedelta(days=200),
        })
        cuad_id = r.lastrowid
        cuadrilla_ids.append(cuad_id)

        # 2-4 categorías por cuadrilla
        cats_cuad = random.sample(cats, min(random.randint(2, 4), len(cats)))
        for i, cat in enumerate(cats_cuad):
            await conn.execute(text(
                "INSERT INTO cuadrilla_categorias (cuadrilla_id, categoria_id, es_principal) "
                "VALUES (:c, :cat, :pr)"
            ), {"c": cuad_id, "cat": cat, "pr": 1 if i == 0 else 0})

        # Asignar 2-4 empleados (uno es líder)
        n_miembros = min(random.randint(2, 4), len(empleados_disponibles))
        miembros = [empleados_disponibles.pop() for _ in range(n_miembros)] if n_miembros else []
        for i, emp in enumerate(miembros):
            await conn.execute(text(
                "INSERT INTO empleado_cuadrillas (empleado_id, cuadrilla_id, es_lider, "
                "fecha_ingreso, activo) "
                "VALUES (:e, :c, :l, :f, 1)"
            ), {"e": emp, "c": cuad_id, "l": 1 if i == 0 else 0, "f": (datetime.now() - timedelta(days=150)).date()})
        # Devolver los empleados al pool por si hay más cuadrillas
        empleados_disponibles.extend(miembros)
        random.shuffle(empleados_disponibles)

    print(f"      -> {len(cuadrilla_ids)} cuadrillas creadas")
    return cuadrilla_ids


# ============================================================
# Phase: Vecinos extra
# ============================================================

async def seed_vecinos_extra(conn, municipio_id: int, ctx: dict) -> list[int]:
    print("[3/10] Vecinos extras...")

    nuevos_ids = []
    for i in range(40):
        nom = random.choice(NOMBRES)
        ape = random.choice(APELLIDOS)
        dni = str(random.randint(20_000_000, 50_000_000))
        email = f"{nom.lower()}.{ape.lower()}{i}@demo-vecinos.com"

        # Evitar duplicado de email
        ex = await conn.execute(text("SELECT id FROM usuarios WHERE email = :e"), {"e": email})
        if ex.first():
            continue

        r = await conn.execute(text(
            "INSERT INTO usuarios (municipio_id, email, password_hash, nombre, apellido, "
            "dni, telefono, rol, activo, nivel_verificacion, cuenta_verificada, created_at) "
            "VALUES (:m, :e, :p, :n, :a, :d, :t, 'vecino', 1, :nv, :cv, :ts)"
        ), {
            "m": municipio_id,
            "e": email,
            "p": get_password_hash("demo123"),
            "n": nom,
            "a": ape,
            "d": dni,
            "t": f"+5491{random.randint(10000000, 99999999)}",
            "nv": 2 if i % 3 == 0 else 0,  # 33% verificados Didit-style
            "cv": 1 if i % 3 == 0 else 0,
            "ts": datetime.now() - timedelta(days=random.randint(30, 360)),
        })
        nuevos_ids.append(r.lastrowid)

    print(f"      -> {len(nuevos_ids)} vecinos nuevos creados")
    return nuevos_ids


# ============================================================
# Phase: Reclamos en 12 meses con patrón realista
# ============================================================

async def seed_reclamos(conn, municipio_id: int, empleado_ids: list[int],
                         cuadrilla_ids: list[int], ctx: dict, todos_vecinos: list[int]) -> list[int]:
    print("[4/10] Reclamos (12 meses, distribución realista)...")

    # Limpiar reclamos anteriores
    await conn.execute(text(
        "DELETE FROM historial_reclamos WHERE reclamo_id IN "
        "(SELECT id FROM reclamos WHERE municipio_id = :m)"
    ), {"m": municipio_id})
    await conn.execute(text(
        "DELETE FROM calificaciones WHERE reclamo_id IN "
        "(SELECT id FROM reclamos WHERE municipio_id = :m)"
    ), {"m": municipio_id})
    await conn.execute(text(
        "DELETE FROM reclamo_personas WHERE reclamo_id IN "
        "(SELECT id FROM reclamos WHERE municipio_id = :m)"
    ), {"m": municipio_id})
    await conn.execute(text(
        "DELETE FROM sla_violaciones WHERE reclamo_id IN "
        "(SELECT id FROM reclamos WHERE municipio_id = :m)"
    ), {"m": municipio_id})
    await conn.execute(text(
        "DELETE FROM notificaciones WHERE reclamo_id IN "
        "(SELECT id FROM reclamos WHERE municipio_id = :m)"
    ), {"m": municipio_id})
    await conn.execute(text(
        "DELETE FROM reclamos WHERE municipio_id = :m"
    ), {"m": municipio_id})

    cats = ctx["categorias_reclamo"]
    barrios = ctx["barrios"]
    # Cargar zonas con coords reales (latitud_centro/longitud_centro de la tabla zonas)
    zonas_data = list(await conn.execute(text(
        "SELECT id, nombre, latitud_centro, longitud_centro FROM zonas WHERE municipio_id = :m"
    ), {"m": municipio_id}))
    zonas = [z[0] for z in ctx["zonas"]]
    zonas_coords = {z[0]: (z[1], float(z[2]) if z[2] else None, float(z[3]) if z[3] else None) for z in zonas_data}
    cat_to_dep = ctx["cat_to_dep"]
    deps = ctx["dependencias"]
    muni_lat = float(ctx["muni"][2] or -34.6)
    muni_lng = float(ctx["muni"][3] or -58.4)

    # Distribución: ~15-25 por mes, total ~200
    estados_dist = [
        ("finalizado", 0.55),
        ("en_curso", 0.15),
        ("recibido", 0.10),
        ("pospuesto", 0.10),
        ("rechazado", 0.10),
    ]

    reclamo_ids = []
    for mes_atras in range(12):
        n_reclamos = random.randint(13, 22)
        for _ in range(n_reclamos):
            cat_id, cat_nombre = random.choice(cats)
            barrio = random.choice(barrios) if barrios else None
            zona_id = random.choice(zonas) if zonas else None

            # Estado según probabilidades
            r = random.random()
            acc = 0.0
            estado = "finalizado"
            for est, p in estados_dist:
                acc += p
                if r < acc:
                    estado = est
                    break

            # Más recientes tienden a estar en curso/recibido
            if mes_atras < 1:
                estado = random.choice(["recibido", "en_curso", "en_curso", "finalizado"])

            created_at = random_dt_in_month_n_ago(mes_atras)
            titulo = random.choice(TITULOS_RECLAMO)
            descripcion = random.choice(DESCRIPCIONES)
            calle = random.choice(CALLES)
            nro = random.randint(100, 4500)
            barrio_nombre = barrio[1] if barrio else ""
            # Coords: usar las de la zona (que tiene latitud_centro/longitud_centro
            # del barrio/localidad real) + jitter chico (~500m). Si la zona no tiene
            # coords cargadas, fallback al centro del muni.
            zona_info = zonas_coords.get(zona_id) if zona_id else None
            zona_nombre = zona_info[0] if zona_info else ""
            if zona_info and zona_info[1] is not None and zona_info[2] is not None:
                lat = zona_info[1] + random.uniform(-0.005, 0.005)
                lng = zona_info[2] + random.uniform(-0.005, 0.005)
            else:
                lat = muni_lat + random.uniform(-0.04, 0.04)
                lng = muni_lng + random.uniform(-0.04, 0.04)
            direccion = f"{calle} {nro}, {barrio_nombre}, {zona_nombre}".strip(", ")
            prioridad = random.randint(1, 5)
            dep_id = cat_to_dep.get(cat_id) or (random.choice(deps) if deps else None)
            empleado_id = random.choice(empleado_ids) if empleado_ids and estado != "recibido" else None
            creador = random.choice(todos_vecinos) if todos_vecinos else None

            # Fechas coherentes con el estado
            fecha_recibido = created_at + timedelta(hours=random.randint(2, 48)) if estado != "recibido" else None
            fecha_resolucion = None
            resolucion = None
            if estado == "finalizado":
                fecha_resolucion = fecha_recibido + timedelta(days=random.randint(1, 14))
                resolucion = "Resuelto satisfactoriamente. Se realizó la intervención solicitada."

            r_ins = await conn.execute(text(
                "INSERT INTO reclamos (municipio_id, titulo, descripcion, direccion, "
                "latitud, longitud, estado, prioridad, categoria_id, creador_id, "
                "municipio_dependencia_id, empleado_id, barrio_id, zona_id, "
                "fecha_recibido, fecha_resolucion, resolucion, created_at, updated_at) "
                "VALUES (:m, :tit, :desc, :dir, :lat, :lng, :est, :pr, :cat, :cr, "
                ":dep, :emp, :b, :z, :fr, :fres, :resol, :ts, :ts)"
            ), {
                "m": municipio_id,
                "tit": titulo,
                "desc": descripcion,
                "dir": direccion,
                "lat": lat,
                "lng": lng,
                "est": estado,
                "pr": prioridad,
                "cat": cat_id,
                "cr": creador,
                "dep": dep_id,
                "emp": empleado_id,
                "b": barrio[0] if barrio else None,
                "z": zona_id,
                "fr": fecha_recibido,
                "fres": fecha_resolucion,
                "resol": resolucion,
                "ts": created_at,
            })
            rec_id = r_ins.lastrowid
            reclamo_ids.append(rec_id)

            # Historial: creación -> recibido -> en_curso -> finalizado (según estado)
            await conn.execute(text(
                "INSERT INTO historial_reclamos (reclamo_id, usuario_id, accion, "
                "estado_nuevo, comentario, created_at) "
                "VALUES (:r, :u, 'creado', 'recibido', 'Reclamo creado por el vecino.', :ts)"
            ), {"r": rec_id, "u": creador, "ts": created_at})

            if fecha_recibido and estado != "recibido":
                await conn.execute(text(
                    "INSERT INTO historial_reclamos (reclamo_id, usuario_id, accion, "
                    "estado_anterior, estado_nuevo, comentario, created_at) "
                    "VALUES (:r, :u, 'cambio_estado', 'recibido', 'en_curso', "
                    "'Tomado por el equipo asignado.', :ts)"
                ), {"r": rec_id, "u": creador, "ts": fecha_recibido})

            if estado == "finalizado" and fecha_resolucion:
                await conn.execute(text(
                    "INSERT INTO historial_reclamos (reclamo_id, usuario_id, accion, "
                    "estado_anterior, estado_nuevo, comentario, created_at) "
                    "VALUES (:r, :u, 'cambio_estado', 'en_curso', 'finalizado', :c, :ts)"
                ), {"r": rec_id, "u": creador, "c": resolucion, "ts": fecha_resolucion})

                # 70% de los finalizados tienen calificación
                if random.random() < 0.7 and creador:
                    punt = random.choices([3, 4, 5], weights=[1, 3, 6])[0]
                    await conn.execute(text(
                        "INSERT INTO calificaciones (reclamo_id, usuario_id, puntuacion, "
                        "tiempo_respuesta, calidad_trabajo, atencion, comentario, created_at) "
                        "VALUES (:r, :u, :p, :tr, :cal, :at, :com, :ts)"
                    ), {
                        "r": rec_id,
                        "u": creador,
                        "p": punt,
                        "tr": max(3, punt + random.randint(-1, 0)),
                        "cal": punt,
                        "at": punt,
                        "com": "Excelente trabajo, gracias." if punt >= 4 else "Tardaron pero se resolvió.",
                        "ts": fecha_resolucion + timedelta(days=random.randint(1, 5)),
                    })

            elif estado == "rechazado":
                await conn.execute(text(
                    "INSERT INTO historial_reclamos (reclamo_id, usuario_id, accion, "
                    "estado_anterior, estado_nuevo, comentario, created_at) "
                    "VALUES (:r, :u, 'cambio_estado', 'recibido', 'rechazado', "
                    "'Rechazado: no corresponde a competencia municipal.', :ts)"
                ), {"r": rec_id, "u": creador, "ts": fecha_recibido or created_at})

            # Reclamo_personas: creador siempre, ocasionalmente otros vecinos se suman
            if creador:
                await conn.execute(text(
                    "INSERT INTO reclamo_personas (reclamo_id, usuario_id, es_creador_original, created_at) "
                    "VALUES (:r, :u, 1, :ts)"
                ), {"r": rec_id, "u": creador, "ts": created_at})
                if random.random() < 0.2 and len(todos_vecinos) > 5:
                    suma = random.choice([v for v in todos_vecinos if v != creador])
                    try:
                        await conn.execute(text(
                            "INSERT INTO reclamo_personas (reclamo_id, usuario_id, es_creador_original, created_at) "
                            "VALUES (:r, :u, 0, :ts)"
                        ), {"r": rec_id, "u": suma, "ts": created_at + timedelta(hours=random.randint(2, 72))})
                    except Exception:
                        pass  # Ignorar duplicado

    print(f"      -> {len(reclamo_ids)} reclamos creados con historial + calificaciones")
    return reclamo_ids


# ============================================================
# Phase: Solicitudes de trámites
# ============================================================

async def seed_solicitudes(conn, municipio_id: int, ctx: dict, todos_vecinos: list[int]) -> list[int]:
    print("[5/10] Solicitudes de trámites...")

    await conn.execute(text(
        "DELETE FROM historial_solicitudes WHERE solicitud_id IN "
        "(SELECT id FROM solicitudes WHERE municipio_id = :m)"
    ), {"m": municipio_id})
    await conn.execute(text(
        "DELETE FROM solicitudes WHERE municipio_id = :m"
    ), {"m": municipio_id})

    if not ctx["tramites"] or not todos_vecinos:
        print("      -> sin trámites o vecinos, se omite")
        return []

    estados = ["recibido", "en_curso", "finalizado", "rechazado"]
    sol_ids = []
    sol_seq = 0  # Para garantizar numero_tramite único

    for mes_atras in range(12):
        n = random.randint(5, 8)
        for _ in range(n):
            sol_seq += 1
            tram = random.choice(ctx["tramites"])
            tram_id, tram_nombre, _, costo = tram
            estado = random.choices(estados, weights=[1, 2, 5, 1])[0]
            if mes_atras < 1:
                estado = random.choice(["recibido", "en_curso"])
            created_at = random_dt_in_month_n_ago(mes_atras)
            vecino = random.choice(todos_vecinos)

            # Datos del vecino
            v = await conn.execute(text(
                "SELECT nombre, apellido, dni, email, telefono FROM usuarios WHERE id = :id"
            ), {"id": vecino})
            vrow = v.first()
            if not vrow:
                continue

            dep_id = random.choice(ctx["dependencias"]) if ctx["dependencias"] else None
            anio = created_at.year
            numero = f"SOL-{anio}-{municipio_id:03d}{sol_seq:05d}"

            r_ins = await conn.execute(text(
                "INSERT INTO solicitudes (municipio_id, numero_tramite, tramite_id, asunto, "
                "descripcion, estado, solicitante_id, nombre_solicitante, apellido_solicitante, "
                "dni_solicitante, email_solicitante, telefono_solicitante, "
                "municipio_dependencia_id, prioridad, created_at, updated_at) "
                "VALUES (:m, :n, :t, :a, :d, :e, :sid, :sn, :sa, :sd, :se, :st, "
                ":dep, :pr, :ts, :ts)"
            ), {
                "m": municipio_id,
                "n": numero,
                "t": tram_id,
                "a": f"{tram_nombre}",
                "d": f"Solicitud de {tram_nombre} presentada por {vrow[0]} {vrow[1]}.",
                "e": estado,
                "sid": vecino,
                "sn": vrow[0],
                "sa": vrow[1],
                "sd": vrow[2],
                "se": vrow[3],
                "st": vrow[4],
                "dep": dep_id,
                "pr": random.randint(2, 4),
                "ts": created_at,
            })
            sol_id = r_ins.lastrowid
            sol_ids.append(sol_id)

            # Historial básico
            await conn.execute(text(
                "INSERT INTO historial_solicitudes (solicitud_id, usuario_id, accion, "
                "estado_nuevo, comentario, created_at) "
                "VALUES (:s, :u, 'creado', 'recibido', 'Solicitud iniciada.', :ts)"
            ), {"s": sol_id, "u": vecino, "ts": created_at})
            if estado in ("en_curso", "finalizado"):
                await conn.execute(text(
                    "INSERT INTO historial_solicitudes (solicitud_id, usuario_id, accion, "
                    "estado_anterior, estado_nuevo, comentario, created_at) "
                    "VALUES (:s, :u, 'cambio_estado', 'recibido', 'en_curso', "
                    "'En revisión por la dependencia.', :ts)"
                ), {"s": sol_id, "u": vecino, "ts": created_at + timedelta(days=1)})
            if estado == "finalizado":
                await conn.execute(text(
                    "INSERT INTO historial_solicitudes (solicitud_id, usuario_id, accion, "
                    "estado_anterior, estado_nuevo, comentario, created_at) "
                    "VALUES (:s, :u, 'cambio_estado', 'en_curso', 'finalizado', "
                    "'Trámite aprobado y entregado.', :ts)"
                ), {"s": sol_id, "u": vecino, "ts": created_at + timedelta(days=random.randint(3, 14))})

    print(f"      -> {len(sol_ids)} solicitudes creadas")
    return sol_ids


# ============================================================
# Phase: Tasas (partidas + deudas)
# ============================================================

async def seed_tasas(conn, municipio_id: int, ctx: dict) -> None:
    print("[6/10] Tasas (partidas + deudas)...")

    # Reusar el script de tasas - llamar la función directa
    from scripts.seed_tasas_completo import seed_para_municipio
    await seed_para_municipio(municipio_id, limpiar=True)


# ============================================================
# Phase: Pagos
# ============================================================

async def seed_pagos(conn, municipio_id: int, ctx: dict) -> None:
    print("[7/10] Pagos completados (GIRE Aura)...")

    # Borrar sesiones previas
    await conn.execute(text(
        "DELETE FROM pago_sesiones WHERE municipio_id = :m"
    ), {"m": municipio_id})

    # Generar 30 pagos completados sobre deudas
    deudas = list(await conn.execute(text(
        "SELECT d.id, d.importe, p.titular_user_id, t.nombre, p.identificador "
        "FROM tasas_deudas d "
        "JOIN tasas_partidas p ON d.partida_id = p.id "
        "LEFT JOIN tipos_tasa t ON p.tipo_tasa_id = t.id "
        "WHERE p.municipio_id = :m AND d.estado = 'pagada' "
        "LIMIT 30"
    ), {"m": municipio_id}))

    medios = ["tarjeta", "qr", "efectivo_cupon", "transferencia"]
    for d_id, importe, user_id, tipo_nombre, identificador in deudas:
        if not user_id:
            continue
        sesion_id = token_hex(16)
        external = f"AURA-{token_hex(8).upper()}"
        completed = datetime.now() - timedelta(days=random.randint(1, 300))
        await conn.execute(text(
            "INSERT INTO pago_sesiones (id, municipio_id, vecino_user_id, deuda_id, "
            "concepto, monto, estado, provider, medio_pago, external_id, "
            "completed_at, created_at) "
            "VALUES (:id, :m, :u, :d, :c, :mn, 'approved', 'paybridge', :mp, "
            ":ex, :ct, :ct)"
        ), {
            "id": sesion_id,
            "m": municipio_id,
            "u": user_id,
            "d": d_id,
            "c": f"{tipo_nombre or 'Tasa'} - {identificador}",
            "mn": importe,
            "mp": random.choice(medios),
            "ex": external,
            "ct": completed,
        })

    print(f"      -> 30 pagos completados via GIRE Aura")


# ============================================================
# Phase: Notificaciones
# ============================================================

async def seed_notificaciones(conn, municipio_id: int, todos_vecinos: list[int],
                                reclamo_ids: list[int]) -> None:
    print("[8/10] Notificaciones...")

    # Limpiar previas
    await conn.execute(text(
        "DELETE FROM notificaciones WHERE usuario_id IN (SELECT id FROM usuarios WHERE municipio_id = :m)"
    ), {"m": municipio_id})

    if not todos_vecinos or not reclamo_ids:
        return

    tipos = ["info", "success", "warning"]
    tipo_pesos = [3, 5, 1]
    n_notif = 100
    for _ in range(n_notif):
        rec_id = random.choice(reclamo_ids)
        # Tomar el creador del reclamo
        r = await conn.execute(text(
            "SELECT creador_id, titulo, estado FROM reclamos WHERE id = :id"
        ), {"id": rec_id})
        row = r.first()
        if not row:
            continue
        user_id, titulo, estado = row
        if not user_id:
            user_id = random.choice(todos_vecinos)

        tipo = random.choices(tipos, weights=tipo_pesos)[0]
        leida = random.random() < 0.6
        ts = datetime.now() - timedelta(days=random.randint(0, 90), hours=random.randint(0, 23))

        mensajes = {
            "success": f"Tu reclamo '{titulo[:40]}' fue resuelto.",
            "info": f"Hubo novedades en tu reclamo '{titulo[:40]}'.",
            "warning": f"Tu reclamo '{titulo[:40]}' está demorado.",
        }
        await conn.execute(text(
            "INSERT INTO notificaciones (usuario_id, titulo, mensaje, tipo, "
            "reclamo_id, leida, created_at) "
            "VALUES (:u, :t, :m, :tp, :r, :l, :ts)"
        ), {
            "u": user_id,
            "t": "Actualización de tu reclamo",
            "m": mensajes[tipo],
            "tp": tipo,
            "r": rec_id,
            "l": leida,
            "ts": ts,
        })

    print(f"      -> {n_notif} notificaciones creadas (60% leídas)")


# ============================================================
# Phase: Gamificación (puntos, badges, leaderboard)
# ============================================================

async def seed_gamificacion(conn, municipio_id: int, todos_vecinos: list[int]) -> None:
    print("[9/10] Gamificación (puntos + badges + leaderboard)...")

    await conn.execute(text(
        "DELETE FROM badges_usuarios WHERE user_id IN (SELECT id FROM usuarios WHERE municipio_id = :m)"
    ), {"m": municipio_id})
    await conn.execute(text(
        "DELETE FROM historial_puntos WHERE municipio_id = :m"
    ), {"m": municipio_id})
    await conn.execute(text(
        "DELETE FROM puntos_usuarios WHERE municipio_id = :m"
    ), {"m": municipio_id})
    await conn.execute(text(
        "DELETE FROM leaderboard_mensual WHERE municipio_id = :m"
    ), {"m": municipio_id})

    if not todos_vecinos:
        return

    # Para cada vecino, calcular puntos según sus reclamos
    for v_id in todos_vecinos:
        r = await conn.execute(text(
            "SELECT COUNT(*), SUM(CASE WHEN estado = 'finalizado' THEN 1 ELSE 0 END) "
            "FROM reclamos WHERE creador_id = :u AND municipio_id = :m"
        ), {"u": v_id, "m": municipio_id})
        row = r.first()
        total = int(row[0] or 0)
        resueltos = int(row[1] or 0)
        if total == 0:
            continue

        puntos_total = total * 10 + resueltos * 20
        await conn.execute(text(
            "INSERT INTO puntos_usuarios (user_id, municipio_id, puntos_totales, "
            "puntos_mes_actual, reclamos_totales, reclamos_resueltos, "
            "reclamos_con_foto, reclamos_con_ubicacion, calificaciones_dadas, "
            "semanas_consecutivas, ultima_actividad) "
            "VALUES (:u, :m, :pt, :pm, :tot, :res, :foto, :ubic, :cal, :sem, :ts)"
        ), {
            "u": v_id,
            "m": municipio_id,
            "pt": puntos_total,
            "pm": min(50, puntos_total // 4),
            "tot": total,
            "res": resueltos,
            "foto": random.randint(0, total),
            "ubic": random.randint(0, total),
            "cal": random.randint(0, resueltos),
            "sem": random.randint(0, 8),
            "ts": datetime.now() - timedelta(days=random.randint(1, 30)),
        })

        # Badges según hitos
        badges = []
        if total >= 1:
            badges.append("vecino_activo")
        if total >= 5:
            badges.append("ojos_de_la_ciudad")
        if total >= 10:
            badges.append("reportero_estrella")
        for b in badges:
            try:
                await conn.execute(text(
                    "INSERT INTO badges_usuarios (user_id, municipio_id, tipo_badge, fecha_obtenido) "
                    "VALUES (:u, :m, :b, :f)"
                ), {"u": v_id, "m": municipio_id, "b": b, "f": datetime.now() - timedelta(days=random.randint(1, 200))})
            except Exception:
                pass

    # Leaderboard mensual: top 10 del último mes
    r = await conn.execute(text(
        "SELECT user_id, puntos_totales, reclamos_totales FROM puntos_usuarios "
        "WHERE municipio_id = :m ORDER BY puntos_totales DESC LIMIT 10"
    ), {"m": municipio_id})
    top = list(r)
    now = datetime.now()
    for pos, (u_id, pts, recs) in enumerate(top, 1):
        await conn.execute(text(
            "INSERT INTO leaderboard_mensual (municipio_id, anio, mes, user_id, "
            "posicion, puntos, reclamos) "
            "VALUES (:m, :a, :ms, :u, :p, :pt, :rs)"
        ), {"m": municipio_id, "a": now.year, "ms": now.month, "u": u_id, "p": pos, "pt": pts, "rs": recs})

    print(f"      -> puntos + badges para {len(todos_vecinos)} vecinos, leaderboard top 10")


# ============================================================
# Phase: SLA + métricas de empleados
# ============================================================

async def seed_sla_y_metricas(conn, municipio_id: int, empleado_ids: list[int],
                                 ctx: dict) -> None:
    print("[10/10] SLA config + métricas mensuales de empleados...")

    # SLA config: limpiar y re-crear
    await conn.execute(text(
        "DELETE FROM sla_config WHERE municipio_id = :m"
    ), {"m": municipio_id})

    # Default global
    await conn.execute(text(
        "INSERT INTO sla_config (municipio_id, prioridad, tiempo_respuesta, tiempo_resolucion, "
        "tiempo_alerta_amarilla, activo) "
        "VALUES (:m, NULL, 24, 72, 48, 1)"
    ), {"m": municipio_id})

    # Per-categoría
    for cat_id, _ in ctx["categorias_reclamo"]:
        tiempo_res = random.choice([48, 72, 120, 168])
        await conn.execute(text(
            "INSERT INTO sla_config (municipio_id, categoria_id, tiempo_respuesta, "
            "tiempo_resolucion, tiempo_alerta_amarilla, activo) "
            "VALUES (:m, :c, 12, :tr, :ta, 1)"
        ), {"m": municipio_id, "c": cat_id, "tr": tiempo_res, "ta": int(tiempo_res * 0.7)})

    # Métricas mensuales de empleados (12 meses)
    for emp_id in empleado_ids:
        for mes_atras in range(12):
            periodo = (datetime.now() - timedelta(days=30 * mes_atras)).date().replace(day=1)
            asignados = random.randint(8, 25)
            resueltos = int(asignados * random.uniform(0.7, 0.95))
            rechazados = asignados - resueltos - random.randint(0, 2)
            tiempo_resp = random.randint(120, 480)  # min
            tiempo_resol = random.randint(720, 4320)
            calif = round(random.uniform(3.5, 4.9), 2)
            sla_pct = round(random.uniform(70, 98), 2)
            try:
                await conn.execute(text(
                    "INSERT INTO empleado_metricas (empleado_id, periodo, reclamos_asignados, "
                    "reclamos_resueltos, reclamos_rechazados, tiempo_promedio_respuesta, "
                    "tiempo_promedio_resolucion, calificacion_promedio, sla_cumplido_porcentaje, "
                    "created_at) "
                    "VALUES (:e, :p, :ra, :rr, :rch, :tresp, :tresol, :cal, :sla, NOW())"
                ), {
                    "e": emp_id, "p": periodo, "ra": asignados, "rr": resueltos,
                    "rch": max(0, rechazados), "tresp": tiempo_resp, "tresol": tiempo_resol,
                    "cal": calif, "sla": sla_pct,
                })
            except Exception:
                pass

    print(f"      -> SLA config + métricas mensuales (12 meses x {len(empleado_ids)} empleados)")


# ============================================================
# Main
# ============================================================

async def main(municipio_id: int):
    engine = create_async_engine(settings.DATABASE_URL)
    SessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    print(f"\n{'=' * 60}")
    print(f"  SUPER DEMO SEED — Municipio ID {municipio_id}")
    print(f"{'=' * 60}\n")

    async with engine.begin() as conn:
        ctx = await fetch_existing(conn, municipio_id)
        if not ctx["muni"]:
            print(f"[ERROR] Municipio {municipio_id} no existe.")
            return
        print(f"Municipio: {ctx['muni'][1]} ({ctx['muni'][0]})")
        print(f"Catálogo: {len(ctx['categorias_reclamo'])} cats reclamo, "
              f"{len(ctx['categorias_tramite'])} cats trámite, "
              f"{len(ctx['tramites'])} trámites, "
              f"{len(ctx['barrios'])} barrios, {len(ctx['zonas'])} zonas, "
              f"{len(ctx['dependencias'])} deps, {len(ctx['vecinos'])} vecinos\n")

        empleado_ids = await seed_empleados(conn, municipio_id, ctx)
        cuadrilla_ids = await seed_cuadrillas(conn, municipio_id, empleado_ids, ctx)
        nuevos_vec = await seed_vecinos_extra(conn, municipio_id, ctx)
        todos_vecinos = [v[0] for v in ctx["vecinos"]] + nuevos_vec

        reclamo_ids = await seed_reclamos(conn, municipio_id, empleado_ids,
                                            cuadrilla_ids, ctx, todos_vecinos)
        sol_ids = await seed_solicitudes(conn, municipio_id, ctx, todos_vecinos)

    # Tasas usa su propio engine
    await seed_tasas(None, municipio_id, ctx={})

    async with engine.begin() as conn:
        await seed_pagos(conn, municipio_id, ctx)
        await seed_notificaciones(conn, municipio_id, todos_vecinos, reclamo_ids)
        await seed_gamificacion(conn, municipio_id, todos_vecinos)
        await seed_sla_y_metricas(conn, municipio_id, empleado_ids, ctx)

    await engine.dispose()
    print(f"\n{'=' * 60}")
    print(f"  SEED COMPLETO — {ctx['muni'][1]} listo para demo")
    print(f"{'=' * 60}\n")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Uso: python seed_super_demo.py <municipio_id>")
        sys.exit(1)
    asyncio.run(main(int(sys.argv[1])))
