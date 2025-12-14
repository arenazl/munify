"""
Script de seed para poblar la base de datos con datos de prueba.
Ejecutar: python seed.py
         python seed.py --force (para agregar datos faltantes)
"""
import asyncio
from datetime import datetime, timedelta
import random
from passlib.context import CryptContext

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.exc import IntegrityError

from core.database import AsyncSessionLocal, engine, Base
from models.user import User
from models.categoria import Categoria
from models.zona import Zona
from models.cuadrilla import Cuadrilla
from models.reclamo import Reclamo
from models.historial import HistorialReclamo
from models.enums import RolUsuario, EstadoReclamo

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# === DATOS DE SEED ===

CATEGORIAS = [
    {"nombre": "Alumbrado Público", "descripcion": "Problemas con luminarias, postes de luz, cables", "icono": "Lightbulb", "color": "#F59E0B", "tiempo_resolucion_estimado": 24, "prioridad_default": 2},
    {"nombre": "Baches y Calles", "descripcion": "Baches, roturas en pavimento, calles deterioradas", "icono": "Construction", "color": "#EF4444", "tiempo_resolucion_estimado": 72, "prioridad_default": 3},
    {"nombre": "Limpieza", "descripcion": "Basura, limpieza de espacios públicos", "icono": "Trash2", "color": "#10B981", "tiempo_resolucion_estimado": 24, "prioridad_default": 2},
    {"nombre": "Agua y Cloacas", "descripcion": "Pérdidas de agua, cloacas tapadas, pozos", "icono": "Droplets", "color": "#3B82F6", "tiempo_resolucion_estimado": 48, "prioridad_default": 1},
    {"nombre": "Arbolado", "descripcion": "Poda, árboles caídos, ramas peligrosas", "icono": "TreePine", "color": "#22C55E", "tiempo_resolucion_estimado": 96, "prioridad_default": 3},
    {"nombre": "Señalización", "descripcion": "Carteles rotos, señales viales dañadas", "icono": "SignpostBig", "color": "#8B5CF6", "tiempo_resolucion_estimado": 48, "prioridad_default": 4},
    {"nombre": "Espacios Verdes", "descripcion": "Plazas, parques, mantenimiento de césped", "icono": "Trees", "color": "#84CC16", "tiempo_resolucion_estimado": 72, "prioridad_default": 4},
    {"nombre": "Tránsito", "descripcion": "Semáforos, demarcación vial, estacionamiento", "icono": "TrafficCone", "color": "#F97316", "tiempo_resolucion_estimado": 24, "prioridad_default": 2},
    {"nombre": "Plagas", "descripcion": "Fumigación, control de vectores, roedores", "icono": "Bug", "color": "#DC2626", "tiempo_resolucion_estimado": 48, "prioridad_default": 2},
    {"nombre": "Otros", "descripcion": "Otros reclamos no categorizados", "icono": "HelpCircle", "color": "#6B7280", "tiempo_resolucion_estimado": 72, "prioridad_default": 5},
]

ZONAS = [
    {"nombre": "Centro", "codigo": "Z-CEN", "descripcion": "Zona céntrica comercial", "latitud_centro": -34.6037, "longitud_centro": -58.3816},
    {"nombre": "Norte", "codigo": "Z-NOR", "descripcion": "Barrios zona norte", "latitud_centro": -34.5800, "longitud_centro": -58.3900},
    {"nombre": "Sur", "codigo": "Z-SUR", "descripcion": "Barrios zona sur", "latitud_centro": -34.6300, "longitud_centro": -58.3700},
    {"nombre": "Este", "codigo": "Z-EST", "descripcion": "Barrios zona este", "latitud_centro": -34.6000, "longitud_centro": -58.3500},
    {"nombre": "Oeste", "codigo": "Z-OES", "descripcion": "Barrios zona oeste", "latitud_centro": -34.6100, "longitud_centro": -58.4100},
    {"nombre": "Industrial", "codigo": "Z-IND", "descripcion": "Zona industrial y depósitos", "latitud_centro": -34.6400, "longitud_centro": -58.4000},
    {"nombre": "Residencial Norte", "codigo": "Z-RNO", "descripcion": "Barrio residencial norte", "latitud_centro": -34.5700, "longitud_centro": -58.3850},
    {"nombre": "Residencial Sur", "codigo": "Z-RSU", "descripcion": "Barrio residencial sur", "latitud_centro": -34.6500, "longitud_centro": -58.3850},
    {"nombre": "Costanera", "codigo": "Z-COS", "descripcion": "Zona ribereña y costanera", "latitud_centro": -34.5950, "longitud_centro": -58.3600},
    {"nombre": "Periférico", "codigo": "Z-PER", "descripcion": "Zona periférica límite municipal", "latitud_centro": -34.6600, "longitud_centro": -58.4200},
]

CUADRILLAS = [
    {"nombre": "Cuadrilla Eléctrica 1", "descripcion": "Especializada en alumbrado público", "especialidad": "Electricidad", "capacidad_maxima": 5},
    {"nombre": "Cuadrilla Eléctrica 2", "descripcion": "Mantenimiento eléctrico general", "especialidad": "Electricidad", "capacidad_maxima": 4},
    {"nombre": "Cuadrilla Vial Norte", "descripcion": "Bacheo y pavimento zona norte", "especialidad": "Vialidad", "capacidad_maxima": 8},
    {"nombre": "Cuadrilla Vial Sur", "descripcion": "Bacheo y pavimento zona sur", "especialidad": "Vialidad", "capacidad_maxima": 8},
    {"nombre": "Cuadrilla Limpieza 1", "descripcion": "Limpieza y recolección", "especialidad": "Limpieza", "capacidad_maxima": 6},
    {"nombre": "Cuadrilla Limpieza 2", "descripcion": "Limpieza espacios públicos", "especialidad": "Limpieza", "capacidad_maxima": 6},
    {"nombre": "Cuadrilla Hidráulica", "descripcion": "Agua, cloacas y desagües", "especialidad": "Plomería", "capacidad_maxima": 5},
    {"nombre": "Cuadrilla Arbolado", "descripcion": "Poda y mantenimiento de árboles", "especialidad": "Arbolado", "capacidad_maxima": 4},
    {"nombre": "Cuadrilla Señalización", "descripcion": "Carteles y señalética vial", "especialidad": "Señalización", "capacidad_maxima": 3},
    {"nombre": "Cuadrilla Espacios Verdes", "descripcion": "Mantenimiento de plazas y parques", "especialidad": "Jardinería", "capacidad_maxima": 6},
]

USUARIOS = [
    # Admin
    {"email": "admin@municipio.gob", "nombre": "Administrador", "apellido": "Sistema", "rol": RolUsuario.ADMIN, "telefono": "1155550001", "dni": "20000001"},
    # Supervisores
    {"email": "supervisor1@municipio.gob", "nombre": "María", "apellido": "González", "rol": RolUsuario.SUPERVISOR, "telefono": "1155550002", "dni": "25000002"},
    {"email": "supervisor2@municipio.gob", "nombre": "Carlos", "apellido": "Rodríguez", "rol": RolUsuario.SUPERVISOR, "telefono": "1155550003", "dni": "26000003"},
    # Cuadrillas
    {"email": "cuadrilla1@municipio.gob", "nombre": "Juan", "apellido": "Pérez", "rol": RolUsuario.CUADRILLA, "telefono": "1155550004", "dni": "30000004"},
    {"email": "cuadrilla2@municipio.gob", "nombre": "Pedro", "apellido": "Martínez", "rol": RolUsuario.CUADRILLA, "telefono": "1155550005", "dni": "31000005"},
    {"email": "cuadrilla3@municipio.gob", "nombre": "Luis", "apellido": "Fernández", "rol": RolUsuario.CUADRILLA, "telefono": "1155550006", "dni": "32000006"},
    # Vecinos
    {"email": "vecino1@email.com", "nombre": "Ana", "apellido": "López", "rol": RolUsuario.VECINO, "telefono": "1155550007", "dni": "35000007", "direccion": "Av. San Martín 1234"},
    {"email": "vecino2@email.com", "nombre": "Roberto", "apellido": "Sánchez", "rol": RolUsuario.VECINO, "telefono": "1155550008", "dni": "36000008", "direccion": "Calle Belgrano 567"},
    {"email": "vecino3@email.com", "nombre": "Laura", "apellido": "García", "rol": RolUsuario.VECINO, "telefono": "1155550009", "dni": "37000009", "direccion": "Av. Rivadavia 890"},
    {"email": "vecino4@email.com", "nombre": "Martín", "apellido": "Torres", "rol": RolUsuario.VECINO, "telefono": "1155550010", "dni": "38000010", "direccion": "Calle Mitre 123"},
]

RECLAMOS_TITULOS = [
    "Luminaria apagada en esquina",
    "Bache peligroso frente a escuela",
    "Basura acumulada en vereda",
    "Pérdida de agua en la calle",
    "Árbol caído obstruye paso",
    "Cartel de PARE caído",
    "Pasto alto en plaza",
    "Semáforo no funciona",
    "Roedores en baldío",
    "Poste de luz inclinado",
]

DIRECCIONES = [
    "Av. San Martín 1234",
    "Calle Belgrano 567",
    "Av. Rivadavia 890",
    "Calle Mitre 123",
    "Av. Mayo 456",
    "Calle Sarmiento 789",
    "Av. Corrientes 321",
    "Calle Moreno 654",
    "Av. de Mayo 987",
    "Calle Perón 147",
]


async def insert_if_not_exists(db, model, data_list, unique_field="nombre"):
    """Inserta registros saltando duplicados usando savepoints"""
    count = 0
    for data in data_list:
        try:
            async with db.begin_nested():
                obj = model(**data)
                db.add(obj)
            count += 1
        except IntegrityError:
            pass  # Ya existe, saltar
    return count


async def seed_database(force: bool = False):
    """Poblar la base de datos con datos de prueba, evitando duplicados"""

    async with AsyncSessionLocal() as db:
        print("Verificando datos existentes...")

        # Contar datos existentes
        cat_count = (await db.execute(select(func.count(Categoria.id)))).scalar()
        zona_count = (await db.execute(select(func.count(Zona.id)))).scalar()
        cuad_count = (await db.execute(select(func.count(Cuadrilla.id)))).scalar()
        user_count = (await db.execute(select(func.count(User.id)))).scalar()

        if not force and (cat_count or zona_count or cuad_count or user_count):
            print(f"Datos existentes: {cat_count} categorías, {zona_count} zonas, {cuad_count} cuadrillas, {user_count} usuarios")
            print("Usa --force para completar con datos faltantes")
            return

        print("Iniciando seed de la base de datos...")

        # 1. Crear Categorías
        print("Creando categorías...")
        categorias_nuevas = await insert_if_not_exists(db, Categoria, CATEGORIAS)
        print(f"  - {categorias_nuevas} categorías nuevas creadas")
        await db.commit()

        # Recargar todas las categorías
        categorias_db = (await db.execute(select(Categoria))).scalars().all()
        cat_ids = [c.id for c in categorias_db]

        # 2. Crear Zonas
        print("Creando zonas...")
        zonas_nuevas = await insert_if_not_exists(db, Zona, ZONAS)
        print(f"  - {zonas_nuevas} zonas nuevas creadas")
        await db.commit()

        # Recargar todas las zonas
        zonas_db = (await db.execute(select(Zona))).scalars().all()
        zona_ids = [z.id for z in zonas_db]

        # 3. Crear Cuadrillas
        print("Creando cuadrillas...")
        cuadrillas_nuevas = 0
        for i, cuad_data in enumerate(CUADRILLAS):
            try:
                async with db.begin_nested():
                    cuad = Cuadrilla(**cuad_data, zona_id=zona_ids[i % len(zona_ids)])
                    db.add(cuad)
                cuadrillas_nuevas += 1
            except IntegrityError:
                pass
        print(f"  - {cuadrillas_nuevas} cuadrillas nuevas creadas")
        await db.commit()

        # Recargar todas las cuadrillas
        cuadrillas_db = (await db.execute(select(Cuadrilla))).scalars().all()
        cuad_ids = [c.id for c in cuadrillas_db]

        # 4. Crear Usuarios
        print("Creando usuarios...")
        usuarios_nuevos = 0
        hashed_password = pwd_context.hash("password123")

        for i, user_data in enumerate(USUARIOS):
            try:
                async with db.begin_nested():
                    cuadrilla_id = None
                    if user_data["rol"] == RolUsuario.CUADRILLA:
                        cuadrilla_idx = i - 3
                        if 0 <= cuadrilla_idx < len(cuad_ids):
                            cuadrilla_id = cuad_ids[cuadrilla_idx]

                    user = User(
                        email=user_data["email"],
                        nombre=user_data["nombre"],
                        apellido=user_data["apellido"],
                        rol=user_data["rol"],
                        telefono=user_data.get("telefono"),
                        dni=user_data.get("dni"),
                        direccion=user_data.get("direccion"),
                        password_hash=hashed_password,
                        cuadrilla_id=cuadrilla_id
                    )
                    db.add(user)
                usuarios_nuevos += 1
            except IntegrityError:
                pass
        print(f"  - {usuarios_nuevos} usuarios nuevos creados")
        await db.commit()

        # Recargar usuarios y obtener vecinos
        usuarios_db = (await db.execute(select(User))).scalars().all()
        user_ids = [u.id for u in usuarios_db]
        vecino_ids = [u.id for u in usuarios_db if u.rol == RolUsuario.VECINO]

        # Obtener prioridades de categorías
        cat_prioridades = {c.id: c.prioridad_default for c in categorias_db}

        # 5. Crear Reclamos (10 reclamos si no hay ninguno)
        reclamos_count = (await db.execute(select(func.count(Reclamo.id)))).scalar()
        print(f"Reclamos existentes: {reclamos_count}")

        if reclamos_count < 10:
            print("Creando reclamos...")
            estados = [EstadoReclamo.NUEVO, EstadoReclamo.ASIGNADO, EstadoReclamo.EN_PROCESO, EstadoReclamo.RESUELTO]

            reclamos_a_crear = 10 - reclamos_count
            for i in range(reclamos_a_crear):
                cat_id = cat_ids[i % len(cat_ids)]
                zona_id = zona_ids[i % len(zona_ids)]
                creador_id = vecino_ids[i % len(vecino_ids)] if vecino_ids else user_ids[0]
                estado = estados[i % len(estados)]

                cuadrilla_id = None
                fecha_resolucion = None
                resolucion = None

                if estado in [EstadoReclamo.ASIGNADO, EstadoReclamo.EN_PROCESO, EstadoReclamo.RESUELTO]:
                    cuadrilla_id = cuad_ids[i % len(cuad_ids)]

                if estado == EstadoReclamo.RESUELTO:
                    fecha_resolucion = datetime.utcnow() - timedelta(days=random.randint(1, 5))
                    resolucion = "Trabajo completado satisfactoriamente."

                async with db.begin_nested():
                    reclamo = Reclamo(
                        titulo=RECLAMOS_TITULOS[i % len(RECLAMOS_TITULOS)],
                        descripcion=f"Descripción detallada del reclamo #{i+1}. {RECLAMOS_TITULOS[i % len(RECLAMOS_TITULOS)]}. Se requiere atención urgente.",
                        direccion=DIRECCIONES[i % len(DIRECCIONES)],
                        referencia=f"Cerca de la esquina, frente al kiosco" if i % 2 == 0 else None,
                        categoria_id=cat_id,
                        zona_id=zona_id,
                        creador_id=creador_id,
                        cuadrilla_id=cuadrilla_id,
                        estado=estado,
                        prioridad=cat_prioridades.get(cat_id, 3),
                        resolucion=resolucion,
                        fecha_resolucion=fecha_resolucion,
                        created_at=datetime.utcnow() - timedelta(days=random.randint(1, 30))
                    )
                    db.add(reclamo)
                    await db.flush()

                    historial = HistorialReclamo(
                        reclamo_id=reclamo.id,
                        usuario_id=creador_id,
                        estado_nuevo=EstadoReclamo.NUEVO,
                        accion="creado",
                        comentario="Reclamo creado"
                    )
                    db.add(historial)

            print(f"  - {reclamos_a_crear} reclamos nuevos creados")

        await db.commit()

        # Conteo final
        final_cats = (await db.execute(select(func.count(Categoria.id)))).scalar()
        final_zonas = (await db.execute(select(func.count(Zona.id)))).scalar()
        final_cuads = (await db.execute(select(func.count(Cuadrilla.id)))).scalar()
        final_users = (await db.execute(select(func.count(User.id)))).scalar()
        final_reclamos = (await db.execute(select(func.count(Reclamo.id)))).scalar()

        print("\n=== SEED COMPLETADO ===")
        print(f"- {final_cats} categorías")
        print(f"- {final_zonas} zonas")
        print(f"- {final_cuads} cuadrillas")
        print(f"- {final_users} usuarios")
        print(f"- {final_reclamos} reclamos")
        print("\nCredenciales de prueba:")
        print("  Admin: admin@municipio.gob / password123")
        print("  Supervisor: supervisor1@municipio.gob / password123")
        print("  Cuadrilla: cuadrilla1@municipio.gob / password123")
        print("  Vecino: vecino1@email.com / password123")


if __name__ == "__main__":
    import sys
    force = "--force" in sys.argv
    asyncio.run(seed_database(force=force))
