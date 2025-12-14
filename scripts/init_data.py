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
from models.cuadrilla import Cuadrilla
from models.configuracion import Configuracion
from models.enums import RolUsuario

async def create_categorias(db):
    categorias = [
        {"nombre": "Baches y Calles", "descripcion": "Reparacion de baches, hundimientos y problemas en calzada", "icono": "Construction", "color": "#EF4444", "tiempo_resolucion_estimado": 72, "prioridad_default": 2},
        {"nombre": "Alumbrado Publico", "descripcion": "Luminarias rotas, falta de iluminacion", "icono": "Lightbulb", "color": "#F59E0B", "tiempo_resolucion_estimado": 48, "prioridad_default": 2},
        {"nombre": "Recoleccion de Residuos", "descripcion": "Problemas con recoleccion de basura, contenedores", "icono": "Trash2", "color": "#10B981", "tiempo_resolucion_estimado": 24, "prioridad_default": 1},
        {"nombre": "Espacios Verdes", "descripcion": "Mantenimiento de plazas, poda de arboles", "icono": "Trees", "color": "#22C55E", "tiempo_resolucion_estimado": 120, "prioridad_default": 4},
        {"nombre": "Senalizacion", "descripcion": "Senales de transito danadas o faltantes", "icono": "SignpostBig", "color": "#3B82F6", "tiempo_resolucion_estimado": 72, "prioridad_default": 3},
        {"nombre": "Desagues y Cloacas", "descripcion": "Obstrucciones, desbordes, olores", "icono": "Droplets", "color": "#6366F1", "tiempo_resolucion_estimado": 48, "prioridad_default": 1},
        {"nombre": "Veredas", "descripcion": "Baldosas rotas, desniveles peligrosos", "icono": "Footprints", "color": "#8B5CF6", "tiempo_resolucion_estimado": 96, "prioridad_default": 3},
        {"nombre": "Otros", "descripcion": "Otros reclamos no categorizados", "icono": "HelpCircle", "color": "#6B7280", "tiempo_resolucion_estimado": 120, "prioridad_default": 5},
    ]

    for cat_data in categorias:
        result = await db.execute(select(Categoria).where(Categoria.nombre == cat_data["nombre"]))
        if not result.scalar_one_or_none():
            db.add(Categoria(**cat_data))
    await db.commit()
    print("[OK] Categorias creadas")

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

async def create_cuadrillas(db):
    result = await db.execute(select(Zona))
    zonas = {z.nombre: z.id for z in result.scalars().all()}

    cuadrillas = [
        {"nombre": "Cuadrilla Bacheo 1", "especialidad": "Bacheo y Calles", "zona_id": zonas.get("Centro"), "capacidad_maxima": 8},
        {"nombre": "Cuadrilla Bacheo 2", "especialidad": "Bacheo y Calles", "zona_id": zonas.get("Norte"), "capacidad_maxima": 8},
        {"nombre": "Cuadrilla Alumbrado", "especialidad": "Alumbrado Publico", "zona_id": None, "capacidad_maxima": 10},
        {"nombre": "Cuadrilla Espacios Verdes", "especialidad": "Espacios Verdes", "zona_id": None, "capacidad_maxima": 12},
        {"nombre": "Cuadrilla Cloacas", "especialidad": "Desagues y Cloacas", "zona_id": None, "capacidad_maxima": 6},
    ]

    for cuad_data in cuadrillas:
        result = await db.execute(select(Cuadrilla).where(Cuadrilla.nombre == cuad_data["nombre"]))
        if not result.scalar_one_or_none():
            db.add(Cuadrilla(**cuad_data))
    await db.commit()
    print("[OK] Cuadrillas creadas")

async def create_users(db):
    result = await db.execute(select(Cuadrilla).limit(1))
    cuadrilla = result.scalar_one_or_none()

    users = [
        {"email": "admin@municipio.gob", "nombre": "Admin", "apellido": "Sistema", "rol": RolUsuario.ADMIN},
        {"email": "supervisor@municipio.gob", "nombre": "Maria", "apellido": "Gonzalez", "rol": RolUsuario.SUPERVISOR},
        {"email": "cuadrilla@municipio.gob", "nombre": "Juan", "apellido": "Perez", "rol": RolUsuario.CUADRILLA, "cuadrilla_id": cuadrilla.id if cuadrilla else None},
        {"email": "vecino@test.com", "nombre": "Pedro", "apellido": "Lopez", "rol": RolUsuario.VECINO, "direccion": "Av. San Martin 1234"},
    ]

    for user_data in users:
        result = await db.execute(select(User).where(User.email == user_data["email"]))
        if not result.scalar_one_or_none():
            user = User(
                email=user_data["email"],
                password_hash=get_password_hash("123456"),
                nombre=user_data["nombre"],
                apellido=user_data["apellido"],
                rol=user_data["rol"],
                cuadrilla_id=user_data.get("cuadrilla_id"),
                direccion=user_data.get("direccion")
            )
            db.add(user)
    await db.commit()
    print("[OK] Usuarios de prueba creados")

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
        await create_categorias(db)
        await create_zonas(db)
        await create_cuadrillas(db)
        await create_users(db)
        await create_configuracion(db)

    print("")
    print("=== Datos iniciales cargados correctamente ===")
    print("")
    print("Usuarios de prueba (password: 123456):")
    print("   - admin@municipio.gob (Admin)")
    print("   - supervisor@municipio.gob (Supervisor)")
    print("   - cuadrilla@municipio.gob (Cuadrilla)")
    print("   - vecino@test.com (Vecino)")

if __name__ == "__main__":
    asyncio.run(main())
