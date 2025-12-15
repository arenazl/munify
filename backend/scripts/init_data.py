"""
Script para inicializar datos de prueba en la base de datos.
Ejecutar con: python -m scripts.init_data
"""
import asyncio
import sys
sys.path.append(".")

from sqlalchemy import select
from core.database import AsyncSessionLocal, init_db
from core.security import get_password_hash
from models.user import User
from models.categoria import Categoria
from models.zona import Zona
from models.empleado import Empleado
from models.configuracion import Configuracion
from models.municipio import Municipio
from models.enums import RolUsuario
from services.categorias_default import crear_categorias_default


async def create_municipio(db):
    """Crear municipio de prueba si no existe"""
    result = await db.execute(select(Municipio).where(Municipio.id == 1))
    if not result.scalar_one_or_none():
        municipio = Municipio(
            id=1,
            nombre="Municipalidad de San Martin",
            codigo="san-martin",
            descripcion="Municipio de prueba para desarrollo",
            latitud=-34.5750,
            longitud=-58.5250,
            radio_km=15.0,
            color_primario="#3B82F6",
            color_secundario="#1E40AF",
            direccion="Av. San Martin 1234",
            telefono="0800-123-4567",
            email="reclamos@sanmartin.gob.ar",
            zoom_mapa_default=13,
            activo=True
        )
        db.add(municipio)
        await db.commit()
        print("[OK] Municipio de prueba creado")
    else:
        print("[OK] Municipio ya existe")


async def create_categorias(db, municipio_id: int = 1):
    """Crear categorías default usando el servicio centralizado"""
    creadas = await crear_categorias_default(db, municipio_id)
    if creadas > 0:
        print(f"[OK] {creadas} categorias creadas para municipio {municipio_id}")
    else:
        print(f"[OK] Categorias ya existen para municipio {municipio_id}")

async def create_zonas(db):
    zonas = [
        {"nombre": "Centro", "codigo": "Z-CEN", "descripcion": "Zona centrica de la ciudad"},
        {"nombre": "Norte", "codigo": "Z-NOR", "descripcion": "Zona norte"},
        {"nombre": "Sur", "codigo": "Z-SUR", "descripcion": "Zona sur"},
        {"nombre": "Este", "codigo": "Z-EST", "descripcion": "Zona este"},
        {"nombre": "Oeste", "codigo": "Z-OES", "descripcion": "Zona oeste"},
        {"nombre": "Industrial", "codigo": "Z-IND", "descripcion": "Zona industrial"},
    ]

    for zona_data in zonas:
        result = await db.execute(select(Zona).where(Zona.nombre == zona_data["nombre"]))
        if not result.scalar_one_or_none():
            db.add(Zona(**zona_data))
    await db.commit()
    print("[OK] Zonas creadas")

async def create_empleados(db):
    result = await db.execute(select(Zona))
    zonas = {z.nombre: z.id for z in result.scalars().all()}

    empleados = [
        {"nombre": "Juan", "apellido": "Perez", "especialidad": "Bacheo y Calles", "zona_id": zonas.get("Centro"), "capacidad_maxima": 8},
        {"nombre": "Carlos", "apellido": "Rodriguez", "especialidad": "Bacheo y Calles", "zona_id": zonas.get("Norte"), "capacidad_maxima": 8},
        {"nombre": "Miguel", "apellido": "Fernandez", "especialidad": "Alumbrado Publico", "zona_id": None, "capacidad_maxima": 10},
        {"nombre": "Luis", "apellido": "Garcia", "especialidad": "Espacios Verdes", "zona_id": None, "capacidad_maxima": 12},
        {"nombre": "Roberto", "apellido": "Martinez", "especialidad": "Desagues y Cloacas", "zona_id": None, "capacidad_maxima": 6},
    ]

    for emp_data in empleados:
        result = await db.execute(select(Empleado).where(Empleado.nombre == emp_data["nombre"], Empleado.apellido == emp_data["apellido"]))
        if not result.scalar_one_or_none():
            db.add(Empleado(**emp_data))
    await db.commit()
    print("[OK] Empleados creados")

# Nombres característicos de usuarios por municipio
# Admin es genérico (rol de sistema), los demás tienen nombres de personas
USUARIOS_POR_MUNICIPIO = {
    "merlo": {"admin": ("Admin", "Sistema"), "supervisor": ("Graciela", "Fernández"), "empleado": ("Carlos", "Gómez"), "vecino": ("Marta", "Rodríguez")},
    "san-isidro": {"admin": ("Admin", "Sistema"), "supervisor": ("Carolina", "Thompson"), "empleado": ("Federico", "Williams"), "vecino": ("Victoria", "Spencer")},
    "vicente-lopez": {"admin": ("Admin", "Sistema"), "supervisor": ("Patricia", "Mendoza"), "empleado": ("Andrés", "Rivero"), "vecino": ("Claudia", "Aguirre")},
    "tigre": {"admin": ("Admin", "Sistema"), "supervisor": ("Mónica", "Insúa"), "empleado": ("Sergio", "Bianchi"), "vecino": ("Elena", "Rossi")},
    "la-plata": {"admin": ("Admin", "Sistema"), "supervisor": ("Beatriz", "Echeverría"), "empleado": ("Leandro", "Ibáñez"), "vecino": ("Rosa", "Domínguez")},
    "quilmes": {"admin": ("Admin", "Sistema"), "supervisor": ("Alicia", "Giménez"), "empleado": ("Walter", "Figueroa"), "vecino": ("Carmen", "Álvarez")},
}

async def create_users_for_municipio(db, municipio_id: int, municipio_codigo: str):
    """Crear usuarios de prueba para un municipio específico"""
    result = await db.execute(
        select(Empleado)
        .where(Empleado.municipio_id == municipio_id)
        .limit(1)
    )
    empleado = result.scalar_one_or_none()

    # Obtener nombres característicos del municipio
    nombres = USUARIOS_POR_MUNICIPIO.get(municipio_codigo, {
        "admin": ("Admin", "Sistema"),
        "supervisor": ("María", "González"),
        "empleado": ("Juan", "Pérez"),
        "vecino": ("Pedro", "López")
    })

    # Formato de email: rol@codigo-municipio.gob
    # Esto permite que cada municipio tenga sus propios usuarios de prueba
    users = [
        {"email": f"admin@{municipio_codigo}.gob", "nombre": nombres["admin"][0], "apellido": nombres["admin"][1], "rol": RolUsuario.ADMIN},
        {"email": f"supervisor@{municipio_codigo}.gob", "nombre": nombres["supervisor"][0], "apellido": nombres["supervisor"][1], "rol": RolUsuario.SUPERVISOR},
        {"email": f"empleado@{municipio_codigo}.gob", "nombre": nombres["empleado"][0], "apellido": nombres["empleado"][1], "rol": RolUsuario.EMPLEADO, "empleado_id": empleado.id if empleado else None},
        {"email": f"vecino@{municipio_codigo}.gob", "nombre": nombres["vecino"][0], "apellido": nombres["vecino"][1], "rol": RolUsuario.VECINO, "direccion": "Calle Principal 1234"},
    ]

    created = 0
    for user_data in users:
        result = await db.execute(select(User).where(User.email == user_data["email"]))
        if not result.scalar_one_or_none():
            user = User(
                municipio_id=municipio_id,
                email=user_data["email"],
                password_hash=get_password_hash("123456"),
                nombre=user_data["nombre"],
                apellido=user_data["apellido"],
                rol=user_data["rol"],
                empleado_id=user_data.get("empleado_id"),
                direccion=user_data.get("direccion")
            )
            db.add(user)
            created += 1

    if created > 0:
        await db.commit()
    return created


async def create_super_admin(db):
    """Crear Super Admin global (sin municipio_id) que puede administrar todos los municipios"""
    result = await db.execute(select(User).where(User.email == "superadmin@sistema.gob"))
    if not result.scalar_one_or_none():
        super_admin = User(
            municipio_id=None,  # Sin municipio = Super Admin global
            email="superadmin@sistema.gob",
            password_hash=get_password_hash("superadmin123"),
            nombre="Super",
            apellido="Administrador",
            rol=RolUsuario.ADMIN,
        )
        db.add(super_admin)
        await db.commit()
        print("[OK] Super Admin creado (superadmin@sistema.gob / superadmin123)")
    else:
        print("[OK] Super Admin ya existe")


async def create_users(db):
    """Crear usuarios de prueba para TODOS los municipios existentes"""
    # Primero crear el Super Admin global
    await create_super_admin(db)

    # Obtener todos los municipios activos
    result = await db.execute(select(Municipio).where(Municipio.activo == True))
    municipios = result.scalars().all()

    total_created = 0
    for municipio in municipios:
        created = await create_users_for_municipio(db, municipio.id, municipio.codigo)
        if created > 0:
            print(f"  [+] {created} usuarios creados para {municipio.nombre}")
            total_created += created

    if total_created > 0:
        print(f"[OK] {total_created} usuarios de prueba creados en total")
    else:
        print("[OK] Usuarios de prueba ya existen para todos los municipios")

async def create_configuracion(db):
    configs = [
        {"clave": "nombre_municipio", "valor": "Municipalidad de San Martin", "descripcion": "Nombre oficial del municipio", "tipo": "string"},
        {"clave": "direccion_municipio", "valor": "Av. San Martin 1234, San Martin, Buenos Aires", "descripcion": "Direccion de la Municipalidad", "tipo": "string"},
        {"clave": "latitud_municipio", "valor": "-34.5750", "descripcion": "Latitud de la Municipalidad", "tipo": "number"},
        {"clave": "longitud_municipio", "valor": "-58.5250", "descripcion": "Longitud de la Municipalidad", "tipo": "number"},
        {"clave": "email_contacto", "valor": "reclamos@municipio.gob", "descripcion": "Email de contacto para reclamos", "tipo": "string"},
        {"clave": "telefono_contacto", "valor": "0800-123-4567", "descripcion": "Telefono de atencion", "tipo": "string"},
        {"clave": "latitud_centro", "valor": "-34.5750", "descripcion": "Latitud del centro del mapa", "tipo": "number"},
        {"clave": "longitud_centro", "valor": "-58.5250", "descripcion": "Longitud del centro del mapa", "tipo": "number"},
        {"clave": "zoom_default", "valor": "13", "descripcion": "Zoom por defecto del mapa", "tipo": "number"},
        {"clave": "skip_email_validation", "valor": "true", "descripcion": "Omitir validación de formato de email (para demos/desarrollo)", "tipo": "boolean"},
    ]

    for config_data in configs:
        result = await db.execute(select(Configuracion).where(Configuracion.clave == config_data["clave"]))
        if not result.scalar_one_or_none():
            db.add(Configuracion(**config_data))
    await db.commit()
    print("[OK] Configuraciones creadas")

async def main():
    print("")
    print("=== Inicializando base de datos ===")
    await init_db()

    async with AsyncSessionLocal() as db:
        await create_municipio(db)  # Primero crear municipio
        await create_categorias(db)
        await create_zonas(db)
        await create_empleados(db)
        await create_users(db)
        await create_configuracion(db)

    print("")
    print("=== Datos iniciales cargados correctamente ===")
    print("")
    print("SUPER ADMIN (acceso a todos los municipios):")
    print("   - superadmin@sistema.gob / superadmin123")
    print("")
    print("Usuarios de prueba por municipio (password: 123456):")
    print("   Formato: rol@codigo-municipio.gob")
    print("   Ejemplo para 'merlo':")
    print("   - admin@merlo.gob (Admin)")
    print("   - supervisor@merlo.gob (Supervisor)")
    print("   - empleado@merlo.gob (Empleado)")
    print("   - vecino@merlo.gob (Vecino)")

if __name__ == "__main__":
    asyncio.run(main())
