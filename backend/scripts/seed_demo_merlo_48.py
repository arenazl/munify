"""
Script completo para generar datos de demo para Merlo (municipio_id=48)
Incluye:
- Usuarios (4 roles: vecino, empleado, supervisor, admin)
- Zonas
- Categorías habilitadas
- Empleados con especialidades y horarios
- Cuadrillas
- Reclamos con historial completo
- Solicitudes/Trámites con historial completo
- Gamificación (puntos, badges)
- Métricas de empleados
- Ausencias
"""
import asyncio
import random
from datetime import datetime, timedelta, time
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
import sys
import os
from werkzeug.security import generate_password_hash

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.database import AsyncSessionLocal

# ============ CONFIGURACIÓN ============
MUNICIPIO_ID = 48
PASSWORD_HASH = generate_password_hash("demo123")  # Contraseña para todos los usuarios demo

# ============ DATOS BASE ============

# Nombres argentinos típicos
NOMBRES_MASCULINOS = [
    "Carlos", "Juan", "Miguel", "José", "Pedro", "Luis", "Jorge", "Roberto",
    "Fernando", "Ricardo", "Daniel", "Pablo", "Sergio", "Alejandro", "Martín",
    "Diego", "Gustavo", "Marcelo", "Oscar", "Raúl", "Eduardo", "Héctor",
    "Alberto", "Mario", "Hugo", "Rubén", "Claudio", "Fabián", "Andrés", "Gabriel"
]

NOMBRES_FEMENINOS = [
    "María", "Ana", "Carmen", "Rosa", "Patricia", "Laura", "Silvia", "Mónica",
    "Claudia", "Graciela", "Susana", "Marta", "Norma", "Alicia", "Beatriz",
    "Gabriela", "Verónica", "Adriana", "Liliana", "Marcela", "Daniela", "Paula",
    "Romina", "Florencia", "Valeria", "Soledad", "Natalia", "Carolina", "Lucía", "Julia"
]

APELLIDOS = [
    "González", "Rodríguez", "Fernández", "López", "Martínez", "García", "Pérez",
    "Sánchez", "Romero", "Díaz", "Torres", "Ruiz", "Ramírez", "Flores", "Acosta",
    "Medina", "Benítez", "Herrera", "Suárez", "Aguirre", "Castro", "Cabrera",
    "Molina", "Ortiz", "Silva", "Vargas", "Morales", "Giménez", "Gutiérrez", "Rojas"
]

# Zonas de Merlo
ZONAS_MERLO = [
    {"nombre": "Centro", "codigo": "CEN", "lat": -34.6651, "lng": -58.7276},
    {"nombre": "Libertad", "codigo": "LIB", "lat": -34.6789, "lng": -58.7567},
    {"nombre": "San Antonio de Padua", "codigo": "PAD", "lat": -34.6692, "lng": -58.7014},
    {"nombre": "Parque San Martín", "codigo": "PSM", "lat": -34.6534, "lng": -58.7189},
    {"nombre": "Mariano Acosta", "codigo": "MAC", "lat": -34.6423, "lng": -58.7634},
    {"nombre": "Pontevedra", "codigo": "PON", "lat": -34.7123, "lng": -58.6912},
]

# Calles de Merlo
CALLES_MERLO = [
    "Av. San Martín", "Av. del Libertador", "Calle Alsina", "Calle Belgrano",
    "Calle Rivadavia", "Calle Sarmiento", "Calle Mitre", "Calle Moreno",
    "Calle 25 de Mayo", "Calle 9 de Julio", "Calle España", "Calle Italia",
    "Calle Francia", "Calle Perón", "Calle Colón", "Calle San Lorenzo",
    "Av. Eva Perón", "Calle Los Aromos", "Calle Los Pinos", "Calle Las Rosas",
    "Pasaje San José", "Pasaje La Paz", "Calle Independencia", "Calle Libertad"
]

# Datos de reclamos por categoría
CATEGORIA_DATA = {
    "Alumbrado Público": {
        "titulos": ["Luz de poste apagada", "Poste de luz sin funcionar", "Lámpara quemada", "Zona muy oscura", "Poste inclinado"],
        "descripciones": [
            "El poste de luz no funciona hace varios días, la zona queda muy oscura de noche.",
            "La lámpara del alumbrado público está quemada, necesita reemplazo urgente.",
            "La cuadra entera está sin iluminación, es peligroso para los vecinos."
        ]
    },
    "Baches y Calles": {
        "titulos": ["Bache enorme", "Calle destruida", "Pozo peligroso", "Asfalto hundido", "Calle en mal estado"],
        "descripciones": [
            "Hay un bache enorme que causa problemas a los autos.",
            "La calle está completamente destruida, es intransitable.",
            "El pozo es muy profundo y peligroso, especialmente de noche."
        ]
    },
    "Limpieza y Residuos": {
        "titulos": ["Basura acumulada", "Contenedor desbordado", "Microbasural", "Falta recolección"],
        "descripciones": [
            "Hay mucha basura acumulada en la esquina, no la retiran hace días.",
            "El contenedor está desbordado y la basura cae al piso.",
            "Se formó un microbasural, hay ratas y mal olor."
        ]
    },
    "Espacios Verdes": {
        "titulos": ["Árbol caído", "Rama peligrosa", "Plaza abandonada", "Pasto muy alto", "Juegos rotos"],
        "descripciones": [
            "Un árbol se cayó y bloquea la vereda.",
            "La plaza está en muy mal estado, necesita mantenimiento.",
            "El pasto está muy alto, no se puede usar el espacio."
        ]
    },
    "Agua y Cloacas": {
        "titulos": ["Pérdida de agua", "Caño roto", "Cloaca tapada", "Sin agua", "Olor a cloaca"],
        "descripciones": [
            "Hay una pérdida de agua importante en la calle.",
            "La cloaca se desbordó y hay un olor terrible.",
            "Estamos sin agua desde hace varios días."
        ]
    },
    "Tránsito": {
        "titulos": ["Semáforo apagado", "Cartel caído", "Falta señalización", "Semáforo desincronizado"],
        "descripciones": [
            "El semáforo está completamente apagado, es muy peligroso.",
            "El cartel de PARE se cayó y los autos no paran.",
            "Falta señalización en esta esquina peligrosa."
        ]
    }
}

# Tipos de trámites
TIPOS_TRAMITES = [
    "Habilitación Comercial",
    "Libre Deuda Municipal",
    "Permiso de Construcción",
    "Carnet de Conducir",
    "Certificado de Domicilio"
]

# Estados de reclamos con flujo
ESTADOS_RECLAMO = ['NUEVO', 'ASIGNADO', 'EN_PROCESO', 'PENDIENTE_CONFIRMACION', 'RESUELTO', 'RECHAZADO']
ESTADO_RECLAMO_PESOS = [0.15, 0.15, 0.25, 0.10, 0.30, 0.05]

# Estados de solicitudes/trámites
ESTADOS_SOLICITUD = ['INICIADO', 'EN_REVISION', 'REQUIERE_DOCUMENTACION', 'EN_PROCESO', 'APROBADO', 'RECHAZADO', 'FINALIZADO']
ESTADO_SOLICITUD_PESOS = [0.10, 0.15, 0.10, 0.20, 0.25, 0.05, 0.15]

# Acciones para historial
ACCIONES_RECLAMO = {
    'NUEVO': 'Reclamo creado',
    'ASIGNADO': 'Reclamo asignado a empleado',
    'EN_PROCESO': 'Empleado comenzó a trabajar',
    'PENDIENTE_CONFIRMACION': 'Trabajo completado, esperando confirmación',
    'RESUELTO': 'Reclamo resuelto satisfactoriamente',
    'RECHAZADO': 'Reclamo rechazado'
}

ACCIONES_SOLICITUD = {
    'INICIADO': 'Solicitud iniciada',
    'EN_REVISION': 'En revisión por el área',
    'REQUIERE_DOCUMENTACION': 'Se requiere documentación adicional',
    'EN_PROCESO': 'Trámite en proceso',
    'APROBADO': 'Trámite aprobado',
    'RECHAZADO': 'Trámite rechazado',
    'FINALIZADO': 'Trámite finalizado'
}


def random_nombre():
    """Genera un nombre completo aleatorio"""
    if random.random() > 0.5:
        nombre = random.choice(NOMBRES_MASCULINOS)
    else:
        nombre = random.choice(NOMBRES_FEMENINOS)
    apellido = random.choice(APELLIDOS)
    return nombre, apellido


def random_email(nombre, apellido, dominio="demo.munify.com"):
    """Genera email único"""
    base = f"{nombre.lower()}.{apellido.lower()}".replace("á", "a").replace("é", "e").replace("í", "i").replace("ó", "o").replace("ú", "u").replace("ñ", "n")
    return f"{base}{random.randint(1, 999)}@{dominio}"


def random_telefono():
    """Genera teléfono argentino"""
    return f"+54 9 11 {random.randint(1000, 9999)}-{random.randint(1000, 9999)}"


def random_dni():
    """Genera DNI argentino"""
    return f"{random.randint(20, 45)}.{random.randint(100, 999)}.{random.randint(100, 999)}"


def random_direccion(zona_nombre):
    """Genera dirección aleatoria"""
    calle = random.choice(CALLES_MERLO)
    numero = random.randint(100, 5000)
    return f"{calle} {numero}, {zona_nombre}, Merlo"


async def limpiar_datos_municipio(db: AsyncSession):
    """Limpia datos existentes del municipio 48"""
    print("Limpiando datos existentes de municipio 48...")

    # Primero obtener IDs de usuarios del municipio para borrar tablas dependientes
    result = await db.execute(
        text("SELECT id FROM usuarios WHERE municipio_id = :mid"),
        {"mid": MUNICIPIO_ID}
    )
    user_ids = [row[0] for row in result.fetchall()]

    if user_ids:
        # Borrar tablas que dependen de usuarios pero no tienen municipio_id
        user_ids_str = ",".join(str(uid) for uid in user_ids)

        # Tablas con FK a usuarios
        tablas_usuario = [
            ("documentos_solicitudes", "usuario_id"),
            ("documentos", "usuario_id"),
            ("calificaciones", "usuario_id"),
            ("historial_puntos", "usuario_id"),
            ("badges_usuarios", "usuario_id"),
            ("puntos_usuarios", "usuario_id"),
            ("leaderboard_mensual", "usuario_id"),
            ("recompensas_canjeadas", "usuario_id"),
        ]

        for tabla, campo in tablas_usuario:
            try:
                await db.execute(text(f"DELETE FROM {tabla} WHERE {campo} IN ({user_ids_str})"))
            except Exception:
                pass

    # Obtener IDs de empleados del municipio
    result = await db.execute(
        text("SELECT id FROM empleados WHERE municipio_id = :mid"),
        {"mid": MUNICIPIO_ID}
    )
    empleado_ids = [row[0] for row in result.fetchall()]

    if empleado_ids:
        emp_ids_str = ",".join(str(eid) for eid in empleado_ids)

        # Tablas con FK a empleados
        tablas_empleado = [
            ("empleado_metricas", "empleado_id"),
            ("empleado_ausencias", "empleado_id"),
            ("empleado_cuadrillas", "empleado_id"),
            ("empleado_categorias", "empleado_id"),
        ]

        for tabla, campo in tablas_empleado:
            try:
                await db.execute(text(f"DELETE FROM {tabla} WHERE {campo} IN ({emp_ids_str})"))
            except Exception:
                pass

    # Obtener IDs de cuadrillas del municipio
    result = await db.execute(
        text("SELECT id FROM cuadrillas WHERE municipio_id = :mid"),
        {"mid": MUNICIPIO_ID}
    )
    cuadrilla_ids = [row[0] for row in result.fetchall()]

    if cuadrilla_ids:
        cuad_ids_str = ",".join(str(cid) for cid in cuadrilla_ids)
        try:
            await db.execute(text(f"DELETE FROM cuadrilla_categorias WHERE cuadrilla_id IN ({cuad_ids_str})"))
        except Exception:
            pass

    # Orden de borrado para tablas con municipio_id directo
    tablas_municipio = [
        "historial_reclamos",
        "reclamos",
        "historial_solicitudes",
        "solicitudes",
        "cuadrillas",
        "empleados",
        "usuarios",
        "zonas",
        "municipio_categorias",
        "sla_config",
        "consultas_guardadas",
        "noticias",
    ]

    for tabla in tablas_municipio:
        try:
            await db.execute(text(f"DELETE FROM {tabla} WHERE municipio_id = :mid"), {"mid": MUNICIPIO_ID})
        except Exception:
            pass

    await db.commit()
    print("[OK] Datos limpiados")


async def crear_zonas(db: AsyncSession) -> dict:
    """Crea zonas para Merlo"""
    print("Creando zonas...")
    zonas = {}

    for zona in ZONAS_MERLO:
        result = await db.execute(text("""
            INSERT INTO zonas (municipio_id, nombre, codigo, latitud_centro, longitud_centro, activo, created_at)
            VALUES (:mid, :nombre, :codigo, :lat, :lng, 1, NOW())
        """), {
            "mid": MUNICIPIO_ID,
            "nombre": zona["nombre"],
            "codigo": zona["codigo"],
            "lat": zona["lat"],
            "lng": zona["lng"]
        })

        # Obtener ID insertado
        result = await db.execute(text("SELECT LAST_INSERT_ID()"))
        zona_id = result.scalar()
        zonas[zona["nombre"]] = zona_id

    await db.commit()
    print(f"[OK] Creadas {len(zonas)} zonas")
    return zonas


async def obtener_categorias(db: AsyncSession) -> list:
    """Obtiene categorías existentes"""
    result = await db.execute(text("""
        SELECT id, nombre FROM categorias WHERE activo = 1 LIMIT 20
    """))
    return result.fetchall()


async def habilitar_categorias(db: AsyncSession, categorias: list):
    """Habilita categorías para el municipio"""
    print("Habilitando categorias...")

    for cat_id, cat_nombre in categorias:
        try:
            await db.execute(text("""
                INSERT INTO municipio_categorias (municipio_id, categoria_id, activo, orden)
                VALUES (:mid, :cid, 1, :orden)
                ON DUPLICATE KEY UPDATE activo = 1
            """), {"mid": MUNICIPIO_ID, "cid": cat_id, "orden": random.randint(1, 20)})
        except:
            pass

    await db.commit()
    print(f"[OK] Habilitadas {len(categorias)} categorias")


async def crear_usuarios(db: AsyncSession, zonas: dict) -> dict:
    """Crea usuarios con los 4 roles"""
    print("Creando usuarios...")
    usuarios = {"vecino": [], "empleado": [], "supervisor": [], "admin": []}

    # 1 Admin
    nombre, apellido = "Admin", "Merlo"
    await db.execute(text("""
        INSERT INTO usuarios (municipio_id, email, password_hash, nombre, apellido, telefono, dni, rol, activo, created_at)
        VALUES (:mid, :email, :pwd, :nombre, :apellido, :tel, :dni, 'admin', 1, NOW())
    """), {
        "mid": MUNICIPIO_ID, "email": "admin@merlo.munify.com", "pwd": PASSWORD_HASH,
        "nombre": nombre, "apellido": apellido, "tel": random_telefono(), "dni": random_dni()
    })
    result = await db.execute(text("SELECT LAST_INSERT_ID()"))
    usuarios["admin"].append(result.scalar())

    # 3 Supervisores
    for i in range(3):
        nombre, apellido = random_nombre()
        await db.execute(text("""
            INSERT INTO usuarios (municipio_id, email, password_hash, nombre, apellido, telefono, dni, rol, activo, created_at)
            VALUES (:mid, :email, :pwd, :nombre, :apellido, :tel, :dni, 'supervisor', 1, NOW())
        """), {
            "mid": MUNICIPIO_ID, "email": f"supervisor{i+1}@merlo.munify.com", "pwd": PASSWORD_HASH,
            "nombre": nombre, "apellido": apellido, "tel": random_telefono(), "dni": random_dni()
        })
        result = await db.execute(text("SELECT LAST_INSERT_ID()"))
        usuarios["supervisor"].append(result.scalar())

    # 10 Empleados (usuarios que luego se vincularán a tabla empleados)
    for i in range(10):
        nombre, apellido = random_nombre()
        await db.execute(text("""
            INSERT INTO usuarios (municipio_id, email, password_hash, nombre, apellido, telefono, dni, rol, activo, created_at)
            VALUES (:mid, :email, :pwd, :nombre, :apellido, :tel, :dni, 'empleado', 1, NOW())
        """), {
            "mid": MUNICIPIO_ID, "email": random_email(nombre, apellido), "pwd": PASSWORD_HASH,
            "nombre": nombre, "apellido": apellido, "tel": random_telefono(), "dni": random_dni()
        })
        result = await db.execute(text("SELECT LAST_INSERT_ID()"))
        usuarios["empleado"].append(result.scalar())

    # 40 Vecinos
    for i in range(40):
        nombre, apellido = random_nombre()
        await db.execute(text("""
            INSERT INTO usuarios (municipio_id, email, password_hash, nombre, apellido, telefono, dni, direccion, rol, activo, created_at)
            VALUES (:mid, :email, :pwd, :nombre, :apellido, :tel, :dni, :dir, 'vecino', 1, NOW())
        """), {
            "mid": MUNICIPIO_ID, "email": random_email(nombre, apellido), "pwd": PASSWORD_HASH,
            "nombre": nombre, "apellido": apellido, "tel": random_telefono(), "dni": random_dni(),
            "dir": random_direccion(random.choice(list(zonas.keys())))
        })
        result = await db.execute(text("SELECT LAST_INSERT_ID()"))
        usuarios["vecino"].append(result.scalar())

    await db.commit()
    total = sum(len(v) for v in usuarios.values())
    print(f"[OK] Creados {total} usuarios (1 admin, 3 supervisores, 10 empleados, 40 vecinos)")
    return usuarios


async def crear_empleados(db: AsyncSession, usuarios: dict, zonas: dict, categorias: list) -> dict:
    """Crea empleados en la tabla empleados - separados por tipo"""
    print("Creando empleados...")
    empleados = {"operario": [], "administrativo": []}

    # 7 Operarios (trabajan en calle - reclamos)
    especialidades_operario = ["Electricista", "Albañil", "Plomero", "Jardinero", "Operario General", "Técnico Vial"]
    # 3 Administrativos (trabajan en oficina - trámites)
    especialidades_admin = ["Administrativo", "Gestor de Trámites", "Atención al Vecino"]

    for i, user_id in enumerate(usuarios["empleado"]):
        # Obtener datos del usuario
        result = await db.execute(text("SELECT nombre, apellido, telefono FROM usuarios WHERE id = :id"), {"id": user_id})
        user = result.fetchone()

        zona_id = random.choice(list(zonas.values()))
        cat_id = random.choice(categorias)[0]

        # Primeros 7 son operarios, últimos 3 son administrativos
        if i < 7:
            tipo = "operario"
            especialidad = random.choice(especialidades_operario)
        else:
            tipo = "administrativo"
            especialidad = random.choice(especialidades_admin)

        await db.execute(text("""
            INSERT INTO empleados (
                municipio_id, nombre, apellido, especialidad, categoria_principal_id,
                zona_id, capacidad_maxima, activo, telefono,
                hora_entrada, hora_salida, tipo, created_at
            ) VALUES (
                :mid, :nombre, :apellido, :esp, :cat_id,
                :zona_id, :cap, 1, :tel,
                :entrada, :salida, :tipo, NOW()
            )
        """), {
            "mid": MUNICIPIO_ID, "nombre": user[0], "apellido": user[1],
            "esp": especialidad, "cat_id": cat_id,
            "zona_id": zona_id, "cap": random.randint(3, 8), "tel": user[2],
            "entrada": time(7 + random.randint(0, 2), 0),
            "salida": time(15 + random.randint(0, 2), 0),
            "tipo": tipo
        })

        result = await db.execute(text("SELECT LAST_INSERT_ID()"))
        emp_id = result.scalar()
        empleados[tipo].append(emp_id)

        # Vincular usuario con empleado
        await db.execute(text("UPDATE usuarios SET empleado_id = :eid WHERE id = :uid"),
                        {"eid": emp_id, "uid": user_id})

        # Asignar 2-4 categorías adicionales
        cats_extra = random.sample(categorias, min(3, len(categorias)))
        for cat in cats_extra:
            try:
                await db.execute(text("""
                    INSERT INTO empleado_categorias (empleado_id, categoria_id, es_principal)
                    VALUES (:eid, :cid, :principal)
                """), {"eid": emp_id, "cid": cat[0], "principal": cat[0] == cat_id})
            except:
                pass

    await db.commit()
    total = len(empleados["operario"]) + len(empleados["administrativo"])
    print(f"[OK] Creados {total} empleados ({len(empleados['operario'])} operarios, {len(empleados['administrativo'])} administrativos)")
    return empleados


async def crear_cuadrillas(db: AsyncSession, empleados: dict, zonas: dict, categorias: list) -> list:
    """Crea cuadrillas"""
    print("Creando cuadrillas...")
    cuadrillas_ids = []

    nombres_cuadrilla = ["Cuadrilla Norte", "Cuadrilla Sur", "Cuadrilla Centro", "Equipo de Emergencias"]

    for i, nombre in enumerate(nombres_cuadrilla[:3]):
        zona_id = list(zonas.values())[i % len(zonas)]
        cat_id = categorias[i % len(categorias)][0]

        await db.execute(text("""
            INSERT INTO cuadrillas (
                municipio_id, nombre, descripcion, especialidad,
                categoria_principal_id, zona_id, capacidad_maxima, activo, created_at
            ) VALUES (
                :mid, :nombre, :desc, :esp, :cat_id, :zona_id, :cap, 1, NOW()
            )
        """), {
            "mid": MUNICIPIO_ID, "nombre": nombre,
            "desc": f"Equipo de trabajo para zona {list(zonas.keys())[i % len(zonas)]}",
            "esp": ["Mantenimiento General", "Alumbrado", "Obras"][i],
            "cat_id": cat_id, "zona_id": zona_id, "cap": 10
        })

        result = await db.execute(text("SELECT LAST_INSERT_ID()"))
        cuadrilla_id = result.scalar()
        cuadrillas_ids.append(cuadrilla_id)

        # Asignar 2-3 operarios a cada cuadrilla (solo operarios van en cuadrillas)
        emps = random.sample(empleados["operario"], min(3, len(empleados["operario"])))
        for j, emp_id in enumerate(emps):
            await db.execute(text("""
                INSERT INTO empleado_cuadrillas (empleado_id, cuadrilla_id, es_lider, activo, fecha_ingreso)
                VALUES (:eid, :cid, :lider, 1, CURDATE())
            """), {"eid": emp_id, "cid": cuadrilla_id, "lider": j == 0})

    await db.commit()
    print(f"[OK] Creadas {len(cuadrillas_ids)} cuadrillas")
    return cuadrillas_ids


async def crear_reclamos_con_historial(db: AsyncSession, usuarios: dict, empleados: dict, zonas: dict, categorias: list):
    """Crea reclamos con historial completo

    Flujo real:
    1. Vecino crea reclamo (estado NUEVO)
    2. Supervisor asigna a operario (estado ASIGNADO)
    3. Operario toma el caso y trabaja (estado EN_PROCESO)
    4. Operario termina y espera confirmación (estado PENDIENTE_CONFIRMACION)
    5. Vecino confirma y califica (estado RESUELTO)
    """
    print("Creando reclamos con historial...")

    reclamos_creados = 0
    operarios = empleados["operario"]  # Solo operarios manejan reclamos de calle

    for i in range(50):
        # Datos base
        cat_id, cat_nombre = random.choice(categorias)
        zona_nombre = random.choice(list(zonas.keys()))
        zona_id = zonas[zona_nombre]
        creador_id = random.choice(usuarios["vecino"])

        # Obtener datos de la categoría para título/descripción
        cat_key = None
        for key in CATEGORIA_DATA.keys():
            if key.lower() in cat_nombre.lower() or cat_nombre.lower() in key.lower():
                cat_key = key
                break

        if cat_key and cat_key in CATEGORIA_DATA:
            titulo = random.choice(CATEGORIA_DATA[cat_key]["titulos"])
            descripcion = random.choice(CATEGORIA_DATA[cat_key]["descripciones"])
        else:
            titulo = f"Problema de {cat_nombre}"
            descripcion = f"Se reporta un problema relacionado con {cat_nombre}. Requiere atención."

        # Dirección y coordenadas
        direccion = random_direccion(zona_nombre)
        zona_data = next(z for z in ZONAS_MERLO if z["nombre"] == zona_nombre)
        latitud = zona_data["lat"] + random.uniform(-0.01, 0.01)
        longitud = zona_data["lng"] + random.uniform(-0.01, 0.01)

        # Estado final (el reclamo pasa por varios estados)
        estado_final = random.choices(ESTADOS_RECLAMO, weights=ESTADO_RECLAMO_PESOS)[0]
        estado_idx = ESTADOS_RECLAMO.index(estado_final)

        # Fecha de creación (últimos 90 días)
        dias_atras = random.randint(0, 90)
        created_at = datetime.now() - timedelta(days=dias_atras, hours=random.randint(0, 23))

        prioridad = random.randint(1, 5)

        # Asignar OPERARIO si no es NUEVO (supervisor asigna operario)
        empleado_id = None
        if estado_idx >= 1:  # ASIGNADO o superior
            empleado_id = random.choice(operarios)

        # Fecha de resolución si está resuelto
        fecha_resolucion = None
        resolucion = None
        if estado_final == 'RESUELTO':
            dias_para_resolver = random.randint(1, min(dias_atras, 14))
            fecha_resolucion = created_at + timedelta(days=dias_para_resolver)
            resolucion = random.choice([
                "Trabajo realizado satisfactoriamente.",
                "Se solucionó el problema reportado.",
                "Reparación completada.",
                "Mantenimiento realizado."
            ])

        # Insertar reclamo
        await db.execute(text("""
            INSERT INTO reclamos (
                municipio_id, titulo, descripcion, direccion, latitud, longitud,
                estado, prioridad, categoria_id, zona_id, creador_id, empleado_id,
                resolucion, fecha_resolucion, created_at, updated_at
            ) VALUES (
                :mid, :titulo, :desc, :dir, :lat, :lng,
                :estado, :prioridad, :cat_id, :zona_id, :creador_id, :emp_id,
                :resolucion, :fecha_res, :created, :created
            )
        """), {
            "mid": MUNICIPIO_ID, "titulo": titulo, "desc": descripcion,
            "dir": direccion, "lat": latitud, "lng": longitud,
            "estado": estado_final, "prioridad": prioridad,
            "cat_id": cat_id, "zona_id": zona_id, "creador_id": creador_id,
            "emp_id": empleado_id, "resolucion": resolucion, "fecha_res": fecha_resolucion,
            "created": created_at
        })

        result = await db.execute(text("SELECT LAST_INSERT_ID()"))
        reclamo_id = result.scalar()

        # Crear historial de estados - flujo realista
        # Siempre empieza en NUEVO
        estados_transitados = ESTADOS_RECLAMO[:estado_idx + 1]
        fecha_cambio = created_at
        estado_anterior = None

        for estado in estados_transitados:
            # Quién hace cada acción:
            if estado == 'NUEVO':
                usuario_accion = creador_id  # Vecino crea
            elif estado == 'ASIGNADO':
                usuario_accion = random.choice(usuarios["supervisor"])  # Supervisor asigna
            elif estado in ['EN_PROCESO', 'PENDIENTE_CONFIRMACION']:
                # Buscar el usuario vinculado al empleado asignado
                if empleado_id:
                    result = await db.execute(text("SELECT id FROM usuarios WHERE empleado_id = :eid"), {"eid": empleado_id})
                    emp_user = result.scalar()
                    usuario_accion = emp_user if emp_user else random.choice(usuarios["empleado"])
                else:
                    usuario_accion = random.choice(usuarios["empleado"])
            elif estado == 'RESUELTO':
                usuario_accion = creador_id  # Vecino confirma
            else:
                usuario_accion = random.choice(usuarios["supervisor"])

            comentario = ACCIONES_RECLAMO.get(estado, "Cambio de estado")
            if estado == 'RECHAZADO':
                comentario = random.choice(["No es competencia municipal", "Reclamo duplicado", "Información insuficiente"])

            await db.execute(text("""
                INSERT INTO historial_reclamos (
                    reclamo_id, usuario_id, estado_anterior, estado_nuevo, accion, comentario, created_at
                ) VALUES (
                    :rid, :uid, :ant, :nuevo, :accion, :comentario, :fecha
                )
            """), {
                "rid": reclamo_id, "uid": usuario_accion,
                "ant": estado_anterior, "nuevo": estado,
                "accion": ACCIONES_RECLAMO.get(estado, "Actualización"),
                "comentario": comentario,
                "fecha": fecha_cambio
            })

            estado_anterior = estado
            # Avanzar tiempo entre cambios de estado
            fecha_cambio = fecha_cambio + timedelta(hours=random.randint(2, 48))

        # Si está RESUELTO, el vecino califica al empleado
        if estado_final == 'RESUELTO' and empleado_id and random.random() > 0.3:  # 70% califican
            puntuacion = random.randint(3, 5)  # Generalmente buenas calificaciones
            await db.execute(text("""
                INSERT INTO calificaciones (
                    reclamo_id, usuario_id, puntuacion, tiempo_respuesta, calidad_trabajo,
                    atencion, comentario, created_at
                ) VALUES (
                    :rid, :uid, :punt, :tiempo, :calidad, :atencion, :comentario, :fecha
                )
            """), {
                "rid": reclamo_id, "uid": creador_id,
                "punt": puntuacion,
                "tiempo": random.randint(3, 5),
                "calidad": random.randint(3, 5),
                "atencion": random.randint(3, 5),
                "comentario": random.choice([
                    "Muy buen trabajo", "Rápido y eficiente", "Excelente atención",
                    "Resolvieron el problema", "Conforme con el servicio", None, None
                ]),
                "fecha": fecha_resolucion or fecha_cambio
            })

        reclamos_creados += 1

        if reclamos_creados % 10 == 0:
            print(f"  Creados {reclamos_creados} reclamos...")

    await db.commit()
    print(f"[OK] Creados {reclamos_creados} reclamos con historial y calificaciones")


async def obtener_tramites(db: AsyncSession) -> list:
    """Obtiene trámites existentes"""
    result = await db.execute(text("""
        SELECT id, nombre FROM tramites WHERE activo = 1 LIMIT 20
    """))
    return result.fetchall()


async def crear_solicitudes_con_historial(db: AsyncSession, usuarios: dict, empleados: dict, tramites: list):
    """Crea solicitudes de trámites con historial

    Flujo real:
    1. Vecino inicia solicitud online (estado INICIADO)
    2. Empleado administrativo revisa (estado EN_REVISION)
    3. Puede requerir documentación (estado REQUIERE_DOCUMENTACION)
    4. Empleado procesa (estado EN_PROCESO)
    5. Aprobado/Rechazado/Finalizado
    """
    print("Creando solicitudes de tramites con historial...")

    if not tramites:
        print("[WARN] No hay tramites disponibles, saltando...")
        return

    solicitudes_creadas = 0
    administrativos = empleados["administrativo"]  # Solo administrativos procesan trámites

    for i in range(50):
        # Datos base
        tramite_id, tramite_nombre = random.choice(tramites)
        solicitante_id = random.choice(usuarios["vecino"])

        # Obtener datos del solicitante
        result = await db.execute(text("""
            SELECT nombre, apellido, dni, email, telefono, direccion
            FROM usuarios WHERE id = :id
        """), {"id": solicitante_id})
        solicitante = result.fetchone()

        asunto = f"Solicitud de {tramite_nombre}"
        descripcion = f"Solicito {tramite_nombre} para realizar trámites personales."

        # Estado final
        estado_final = random.choices(ESTADOS_SOLICITUD, weights=ESTADO_SOLICITUD_PESOS)[0]
        estado_idx = ESTADOS_SOLICITUD.index(estado_final)

        # Fecha de creación
        dias_atras = random.randint(0, 90)
        created_at = datetime.now() - timedelta(days=dias_atras, hours=random.randint(0, 23))

        # Número de trámite
        numero_tramite = f"TRM-{MUNICIPIO_ID}-{datetime.now().year}-{1000 + i}"

        # Empleado ADMINISTRATIVO asignado si avanzó
        empleado_id = None
        if estado_idx >= 1 and administrativos:
            empleado_id = random.choice(administrativos)

        # Respuesta si está finalizado
        respuesta = None
        fecha_resolucion = None
        if estado_final in ['APROBADO', 'FINALIZADO']:
            respuesta = "Trámite procesado correctamente."
            fecha_resolucion = created_at + timedelta(days=random.randint(3, 15))
        elif estado_final == 'RECHAZADO':
            respuesta = "No cumple con los requisitos."

        # Insertar solicitud
        await db.execute(text("""
            INSERT INTO solicitudes (
                municipio_id, numero_tramite, asunto, descripcion, estado,
                solicitante_id, nombre_solicitante, apellido_solicitante,
                dni_solicitante, email_solicitante, telefono_solicitante,
                direccion_solicitante, tramite_id, empleado_id, prioridad,
                respuesta, fecha_resolucion, created_at, updated_at
            ) VALUES (
                :mid, :num, :asunto, :desc, :estado,
                :sol_id, :nombre, :apellido, :dni, :email, :tel, :dir,
                :tram_id, :emp_id, :prioridad, :resp, :fecha_res, :created, :created
            )
        """), {
            "mid": MUNICIPIO_ID, "num": numero_tramite, "asunto": asunto,
            "desc": descripcion, "estado": estado_final, "sol_id": solicitante_id,
            "nombre": solicitante[0], "apellido": solicitante[1], "dni": solicitante[2],
            "email": solicitante[3], "tel": solicitante[4], "dir": solicitante[5],
            "tram_id": tramite_id, "emp_id": empleado_id, "prioridad": random.randint(1, 5),
            "resp": respuesta, "fecha_res": fecha_resolucion, "created": created_at
        })

        result = await db.execute(text("SELECT LAST_INSERT_ID()"))
        solicitud_id = result.scalar()

        # Crear historial con roles correctos
        estados_transitados = ESTADOS_SOLICITUD[:estado_idx + 1]
        fecha_cambio = created_at
        estado_anterior = None

        for estado in estados_transitados:
            # Quién hace cada acción:
            if estado == 'INICIADO':
                usuario_accion = solicitante_id  # Vecino inicia
            elif estado in ['EN_REVISION', 'REQUIERE_DOCUMENTACION', 'EN_PROCESO']:
                # Empleado administrativo procesa
                if empleado_id:
                    result = await db.execute(text("SELECT id FROM usuarios WHERE empleado_id = :eid"), {"eid": empleado_id})
                    emp_user = result.scalar()
                    usuario_accion = emp_user if emp_user else random.choice(usuarios["empleado"])
                else:
                    usuario_accion = random.choice(usuarios["empleado"])
            else:
                # Supervisor aprueba/rechaza/finaliza
                usuario_accion = random.choice(usuarios["supervisor"])

            await db.execute(text("""
                INSERT INTO historial_solicitudes (
                    solicitud_id, usuario_id, estado_anterior, estado_nuevo, accion, comentario, created_at
                ) VALUES (
                    :sid, :uid, :ant, :nuevo, :accion, :comentario, :fecha
                )
            """), {
                "sid": solicitud_id, "uid": usuario_accion,
                "ant": estado_anterior, "nuevo": estado,
                "accion": ACCIONES_SOLICITUD.get(estado, "Actualización"),
                "comentario": ACCIONES_SOLICITUD.get(estado, "Cambio de estado"),
                "fecha": fecha_cambio
            })

            estado_anterior = estado
            fecha_cambio = fecha_cambio + timedelta(hours=random.randint(4, 72))

        solicitudes_creadas += 1

    await db.commit()
    print(f"[OK] Creadas {solicitudes_creadas} solicitudes con historial")


async def crear_metricas_empleados(db: AsyncSession, empleados: dict):
    """Crea métricas históricas para empleados"""
    print("Creando metricas de empleados...")

    todos_empleados = empleados["operario"] + empleados["administrativo"]
    for emp_id in todos_empleados:
        # Métricas de los últimos 6 meses
        for mes_atras in range(6):
            fecha = datetime.now().replace(day=1) - timedelta(days=30 * mes_atras)

            await db.execute(text("""
                INSERT INTO empleado_metricas (
                    empleado_id, periodo, reclamos_asignados, reclamos_resueltos,
                    reclamos_rechazados, tiempo_promedio_respuesta, tiempo_promedio_resolucion,
                    calificacion_promedio, sla_cumplido_porcentaje, created_at
                ) VALUES (
                    :eid, :periodo, :asignados, :resueltos, :rechazados,
                    :resp, :resol, :calif, :sla, :periodo
                )
            """), {
                "eid": emp_id,
                "periodo": fecha.date(),
                "asignados": random.randint(10, 30),
                "resueltos": random.randint(8, 25),
                "rechazados": random.randint(0, 3),
                "resp": random.randint(30, 180),  # minutos
                "resol": random.randint(120, 480),  # minutos
                "calif": round(random.uniform(3.5, 5.0), 2),
                "sla": round(random.uniform(75, 98), 2)
            })

    await db.commit()
    print(f"[OK] Creadas metricas para {len(todos_empleados)} empleados")


async def crear_ausencias_empleados(db: AsyncSession, empleados: dict, usuarios: dict):
    """Crea algunas ausencias para empleados"""
    print("Creando ausencias de empleados...")

    tipos_ausencia = ["vacaciones", "enfermedad", "personal", "capacitacion"]
    todos_empleados = empleados["operario"] + empleados["administrativo"]

    ausencias_creadas = 0
    for emp_id in random.sample(todos_empleados, min(5, len(todos_empleados))):
        tipo = random.choice(tipos_ausencia)
        inicio = datetime.now() - timedelta(days=random.randint(10, 60))
        fin = inicio + timedelta(days=random.randint(1, 5))

        await db.execute(text("""
            INSERT INTO empleado_ausencias (
                empleado_id, tipo, fecha_inicio, fecha_fin, motivo,
                aprobado, aprobado_por_id, fecha_aprobacion, created_at
            ) VALUES (
                :eid, :tipo, :inicio, :fin, :motivo, 1, :aprobador, :fecha_apr, :inicio
            )
        """), {
            "eid": emp_id, "tipo": tipo, "inicio": inicio.date(), "fin": fin.date(),
            "motivo": f"Solicitud de {tipo}",
            "aprobador": random.choice(usuarios["supervisor"]),
            "fecha_apr": (inicio - timedelta(days=2)).date()
        })
        ausencias_creadas += 1

    await db.commit()
    print(f"[OK] Creadas {ausencias_creadas} ausencias")


async def crear_puntos_gamificacion(db: AsyncSession, usuarios: dict):
    """Crea puntos y badges para vecinos"""
    print("Creando datos de gamificacion...")

    badges = ['VECINO_ACTIVO', 'PRIMER_PASO', 'FOTOGRAFO', 'CONSTANTE']

    for vecino_id in usuarios["vecino"]:
        # Puntos
        puntos_totales = random.randint(50, 500)
        await db.execute(text("""
            INSERT INTO puntos_usuarios (
                user_id, municipio_id, puntos_totales, puntos_mes_actual,
                reclamos_totales, reclamos_resueltos, reclamos_con_foto,
                reclamos_con_ubicacion, calificaciones_dadas, semanas_consecutivas,
                ultima_actividad, created_at
            ) VALUES (
                :uid, :mid, :total, :mes, :rec_tot, :rec_res, :foto, :ubi,
                :calif, :semanas, NOW(), NOW()
            )
        """), {
            "uid": vecino_id, "mid": MUNICIPIO_ID,
            "total": puntos_totales, "mes": random.randint(10, 100),
            "rec_tot": random.randint(1, 15), "rec_res": random.randint(0, 10),
            "foto": random.randint(0, 8), "ubi": random.randint(0, 10),
            "calif": random.randint(0, 5), "semanas": random.randint(0, 8)
        })

        # Algunos badges aleatorios
        for badge in random.sample(badges, random.randint(1, 3)):
            try:
                await db.execute(text("""
                    INSERT INTO badges_usuarios (user_id, municipio_id, tipo_badge, obtenido_en)
                    VALUES (:uid, :mid, :badge, NOW() - INTERVAL :dias DAY)
                """), {
                    "uid": vecino_id, "mid": MUNICIPIO_ID, "badge": badge,
                    "dias": random.randint(1, 60)
                })
            except:
                pass

    await db.commit()
    print(f"[OK] Creada gamificacion para {len(usuarios['vecino'])} vecinos")


async def main():
    """Función principal"""
    print("=" * 60)
    print("   SEEDER DEMO MERLO (Municipio ID 48)")
    print("=" * 60)

    async with AsyncSessionLocal() as db:
        try:
            # Limpiar datos existentes
            await limpiar_datos_municipio(db)

            # Crear datos base
            zonas = await crear_zonas(db)
            categorias = await obtener_categorias(db)
            await habilitar_categorias(db, categorias)

            # Crear usuarios con 4 roles
            usuarios = await crear_usuarios(db, zonas)

            # Crear empleados y cuadrillas
            empleados = await crear_empleados(db, usuarios, zonas, categorias)
            cuadrillas = await crear_cuadrillas(db, empleados, zonas, categorias)

            # Crear reclamos con historial completo
            await crear_reclamos_con_historial(db, usuarios, empleados, zonas, categorias)

            # Crear solicitudes/trámites con historial
            tramites = await obtener_tramites(db)
            await crear_solicitudes_con_historial(db, usuarios, empleados, tramites)

            # Métricas y ausencias de empleados
            await crear_metricas_empleados(db, empleados)
            await crear_ausencias_empleados(db, empleados, usuarios)

            # Gamificación
            await crear_puntos_gamificacion(db, usuarios)

            total_empleados = len(empleados["operario"]) + len(empleados["administrativo"])

            print("=" * 60)
            print("[OK] SEEDER COMPLETADO EXITOSAMENTE")
            print("=" * 60)
            print(f"""
Resumen de datos creados para Municipio ID {MUNICIPIO_ID} (Merlo):

Usuarios:
   - 1 Admin (admin@merlo.munify.com / demo123)
   - 3 Supervisores (supervisor1-3@merlo.munify.com / demo123)
   - 10 Empleados ({len(empleados['operario'])} operarios + {len(empleados['administrativo'])} administrativos)
   - 40 Vecinos

Zonas: {len(zonas)}
Empleados: {total_empleados}
   - Operarios (reclamos de calle): {len(empleados['operario'])}
   - Administrativos (tramites): {len(empleados['administrativo'])}
Cuadrillas: {len(cuadrillas)}
Reclamos: 50 (con historial completo y calificaciones)
Solicitudes: 50 (con historial completo)

Contrasena para todos los usuarios demo: demo123

Flujo de Reclamo:
   Vecino crea -> Supervisor asigna operario -> Operario trabaja -> Vecino califica

Flujo de Tramite:
   Vecino solicita -> Administrativo revisa -> Supervisor aprueba
            """)

        except Exception as e:
            print(f"[ERROR] Error: {e}")
            import traceback
            traceback.print_exc()
            raise


if __name__ == "__main__":
    asyncio.run(main())
