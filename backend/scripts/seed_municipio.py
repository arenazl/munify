"""
Script para crear un municipio completo con todos los datos necesarios.
Uso: python scripts/seed_municipio.py "Nombre del Municipio"

Crea:
- Municipio con coordenadas auto-detectadas
- Barrios via IA + Nominatim
- Categorías de reclamos
- Tipos de trámites y trámites
- Usuarios demo (admin, supervisor, empleado, vecino)
- Empleados y cuadrillas
"""
import asyncio
import sys
import os
from werkzeug.security import generate_password_hash

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.database import AsyncSessionLocal
from sqlalchemy import select, text


PASSWORD_HASH = generate_password_hash("demo123")


async def buscar_coordenadas_municipio(nombre: str, provincia: str = "Buenos Aires"):
    """Busca las coordenadas del municipio usando Nominatim"""
    import httpx

    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                "https://nominatim.openstreetmap.org/search",
                params={
                    "q": f"{nombre}, {provincia}, Argentina",
                    "format": "json",
                    "limit": 1
                },
                headers={"User-Agent": "SGM-Seed/1.0"},
                timeout=10
            )
            data = response.json()
            if data:
                return float(data[0]["lat"]), float(data[0]["lon"])
    except Exception as e:
        print(f"Error buscando coordenadas: {e}")

    # Coordenadas default (centro de Buenos Aires provincia)
    return -34.6, -58.4


async def crear_municipio(db, nombre: str):
    """Crea el municipio con coordenadas auto-detectadas"""
    from models.municipio import Municipio

    # Generar código
    codigo = nombre.lower().replace(" ", "").replace("á", "a").replace("é", "e").replace("í", "i").replace("ó", "o").replace("ú", "u")[:10]

    # Verificar si ya existe
    result = await db.execute(select(Municipio).where(Municipio.codigo == codigo))
    if result.scalar_one_or_none():
        print(f"El municipio '{nombre}' ya existe")
        return None

    # Buscar coordenadas
    print(f"Buscando coordenadas para {nombre}...")
    lat, lng = await buscar_coordenadas_municipio(nombre)
    print(f"Coordenadas: {lat}, {lng}")

    municipio = Municipio(
        nombre=nombre,
        codigo=codigo,
        latitud=lat,
        longitud=lng,
        radio_km=15.0,
        color_primario="#3b82f6",
        color_secundario="#1e40af",
        activo=True
    )
    db.add(municipio)
    await db.flush()

    print(f"Municipio '{nombre}' creado con ID {municipio.id}")
    return municipio


async def cargar_barrios(db, municipio_id: int, nombre_municipio: str):
    """Carga barrios usando IA + Nominatim"""
    from services.barrios_auto import cargar_barrios_municipio

    print(f"Cargando barrios para {nombre_municipio}...")
    try:
        barrios_creados = await cargar_barrios_municipio(
            db=db,
            municipio_id=municipio_id,
            nombre_municipio=nombre_municipio,
            provincia="Buenos Aires"
        )
        print(f"{barrios_creados} barrios cargados")
        return barrios_creados
    except Exception as e:
        print(f"Error cargando barrios: {e}")
        return 0


async def crear_categorias(db, municipio_id: int):
    """Crea categorías de reclamos por defecto"""
    from services.categorias_default import crear_categorias_default

    print("Creando categorías...")
    await crear_categorias_default(db, municipio_id)
    print("Categorías creadas")


async def crear_tramites(db, municipio_id: int):
    """Crea tipos de trámites y trámites por defecto"""
    from services.tramites_default import crear_tipos_tramites_default

    print("Creando trámites...")
    await crear_tipos_tramites_default(db, municipio_id)
    print("Trámites creados")


async def crear_usuarios_demo(db, municipio_id: int, codigo: str):
    """Crea usuarios demo para cada rol"""
    from models.user import User
    from models.enums import RolUsuario

    print("Creando usuarios demo...")

    usuarios = [
        {
            "email": f"admin@{codigo}.demo.com",
            "nombre": "Admin",
            "apellido": "Demo",
            "rol": RolUsuario.ADMIN,
            "telefono": "1155001000"
        },
        {
            "email": f"supervisor@{codigo}.demo.com",
            "nombre": "Supervisor",
            "apellido": "Demo",
            "rol": RolUsuario.SUPERVISOR,
            "telefono": "1155002000"
        },
        {
            "email": f"empleado@{codigo}.demo.com",
            "nombre": "Empleado",
            "apellido": "Demo",
            "rol": RolUsuario.EMPLEADO,
            "telefono": "1155003000"
        },
        {
            "email": f"vecino@{codigo}.demo.com",
            "nombre": "Vecino",
            "apellido": "Demo",
            "rol": RolUsuario.VECINO,
            "telefono": "1155004000"
        }
    ]

    usuarios_creados = []
    for u in usuarios:
        user = User(
            email=u["email"],
            password_hash=PASSWORD_HASH,
            nombre=u["nombre"],
            apellido=u["apellido"],
            telefono=u["telefono"],
            rol=u["rol"],
            municipio_id=municipio_id,
            activo=True,
            verificado=True
        )
        db.add(user)
        usuarios_creados.append(user)

    await db.flush()
    print(f"{len(usuarios_creados)} usuarios demo creados")
    return usuarios_creados


async def crear_empleados(db, municipio_id: int, usuarios):
    """Crea empleados a partir de usuarios con rol empleado"""
    from models.empleado import Empleado

    print("Creando empleados...")

    empleados_creados = []
    for user in usuarios:
        if user.rol.value == "empleado":
            empleado = Empleado(
                municipio_id=municipio_id,
                user_id=user.id,
                nombre=user.nombre,
                apellido=user.apellido,
                legajo=f"LEG-{municipio_id:03d}-001",
                especialidad="General",
                tipo="operario",
                activo=True
            )
            db.add(empleado)
            empleados_creados.append(empleado)

            # Actualizar el empleado_id en el usuario
            await db.flush()
            user.empleado_id = empleado.id

    print(f"{len(empleados_creados)} empleados creados")
    return empleados_creados


async def crear_cuadrilla(db, municipio_id: int, empleados):
    """Crea una cuadrilla básica"""
    from models.cuadrilla import Cuadrilla
    from models.empleado_cuadrilla import EmpleadoCuadrilla

    print("Creando cuadrilla...")

    cuadrilla = Cuadrilla(
        municipio_id=municipio_id,
        nombre="Cuadrilla General",
        descripcion="Cuadrilla principal para trabajos generales",
        color="#3b82f6",
        activa=True
    )
    db.add(cuadrilla)
    await db.flush()

    # Agregar empleados a la cuadrilla
    for empleado in empleados:
        relacion = EmpleadoCuadrilla(
            empleado_id=empleado.id,
            cuadrilla_id=cuadrilla.id,
            rol="miembro",
            activo=True
        )
        db.add(relacion)

    print("Cuadrilla creada")
    return cuadrilla


async def main(nombre_municipio: str):
    """Función principal"""
    print(f"\n{'='*60}")
    print(f"CREANDO MUNICIPIO: {nombre_municipio}")
    print(f"{'='*60}\n")

    async with AsyncSessionLocal() as db:
        try:
            # 1. Crear municipio
            municipio = await crear_municipio(db, nombre_municipio)
            if not municipio:
                return

            # 2. Cargar barrios con IA
            await cargar_barrios(db, municipio.id, nombre_municipio)

            # 3. Crear categorías
            await crear_categorias(db, municipio.id)

            # 4. Crear trámites
            await crear_tramites(db, municipio.id)

            # 5. Crear usuarios demo
            usuarios = await crear_usuarios_demo(db, municipio.id, municipio.codigo)

            # 6. Crear empleados
            empleados = await crear_empleados(db, municipio.id, usuarios)

            # 7. Crear cuadrilla
            if empleados:
                await crear_cuadrilla(db, municipio.id, empleados)

            # Commit final
            await db.commit()

            print(f"\n{'='*60}")
            print(f"MUNICIPIO CREADO EXITOSAMENTE")
            print(f"{'='*60}")
            print(f"Nombre: {municipio.nombre}")
            print(f"Código: {municipio.codigo}")
            print(f"ID: {municipio.id}")
            print(f"\nUsuarios demo (password: demo123):")
            print(f"  - admin@{municipio.codigo}.demo.com")
            print(f"  - supervisor@{municipio.codigo}.demo.com")
            print(f"  - empleado@{municipio.codigo}.demo.com")
            print(f"  - vecino@{municipio.codigo}.demo.com")
            print(f"{'='*60}\n")

        except Exception as e:
            await db.rollback()
            print(f"\nERROR: {e}")
            import traceback
            traceback.print_exc()


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Uso: python scripts/seed_municipio.py \"Nombre del Municipio\"")
        print("Ejemplo: python scripts/seed_municipio.py \"Chacabuco\"")
        sys.exit(1)

    nombre = sys.argv[1]
    asyncio.run(main(nombre))
