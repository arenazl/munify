"""
Script para poblar la base de datos con datos de prueba para Merlo.
Genera 1000 reclamos con diferentes estados, empleados, zonas y categorías.
"""
import asyncio
import random
from datetime import datetime, timedelta
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select
import sys
import os

# Agregar el path del backend para imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.config import settings
from models.municipio import Municipio
from models.user import User
from models.zona import Zona
from models.categoria import Categoria
from models.empleado import Empleado
from models.reclamo import Reclamo
from core.security import get_password_hash

# Configuración
MUNICIPIO_NOMBRE = "Merlo"
TOTAL_RECLAMOS = 1000

# Zonas de Merlo (barrios/localidades reales)
ZONAS_MERLO = [
    "Merlo Centro",
    "Libertad",
    "Pontevedra",
    "San Antonio de Padua",
    "Mariano Acosta",
    "Parque San Martín",
    "Ituzaingó Anexo",
    "Parque Leloir",
    "Villa Progreso",
    "Barrio Castelar",
]

# Categorías típicas de reclamos municipales
CATEGORIAS = [
    {"nombre": "Baches y Calles", "descripcion": "Problemas en pavimento y calles"},
    {"nombre": "Alumbrado Público", "descripcion": "Luces de calle apagadas o rotas"},
    {"nombre": "Limpieza Urbana", "descripcion": "Basura acumulada, falta de recolección"},
    {"nombre": "Arbolado Público", "descripcion": "Árboles caídos, podas necesarias"},
    {"nombre": "Espacios Verdes", "descripcion": "Mantenimiento de plazas y parques"},
    {"nombre": "Veredas", "descripcion": "Roturas o desniveles en veredas"},
    {"nombre": "Desagües Pluviales", "descripcion": "Inundaciones, bocas de tormenta"},
    {"nombre": "Señalización Vial", "descripcion": "Señales de tránsito faltantes o rotas"},
    {"nombre": "Ruidos Molestos", "descripcion": "Exceso de ruido en la vía pública"},
    {"nombre": "Animales Sueltos", "descripcion": "Perros o animales en la calle"},
]

# Empleados del municipio
EMPLEADOS = [
    {"nombre": "Juan", "apellido": "Pérez", "cargo": "Supervisor de Obras", "telefono": "1123456789"},
    {"nombre": "María", "apellido": "González", "cargo": "Jefa de Mantenimiento", "telefono": "1123456790"},
    {"nombre": "Carlos", "apellido": "Rodríguez", "cargo": "Encargado de Alumbrado", "telefono": "1123456791"},
    {"nombre": "Ana", "apellido": "Martínez", "cargo": "Supervisora de Limpieza", "telefono": "1123456792"},
    {"nombre": "Roberto", "apellido": "Fernández", "cargo": "Técnico de Espacios Verdes", "telefono": "1123456793"},
    {"nombre": "Laura", "apellido": "López", "cargo": "Coordinadora de Obras", "telefono": "1123456794"},
    {"nombre": "Diego", "apellido": "Sánchez", "cargo": "Inspector Municipal", "telefono": "1123456795"},
    {"nombre": "Silvia", "apellido": "Ramírez", "cargo": "Jefa de Zona Norte", "telefono": "1123456796"},
    {"nombre": "Miguel", "apellido": "Torres", "cargo": "Jefe de Zona Sur", "telefono": "1123456797"},
    {"nombre": "Patricia", "apellido": "Ruiz", "cargo": "Coordinadora General", "telefono": "1123456798"},
]

# Templates de títulos para reclamos
TITULOS_TEMPLATES = {
    "Baches y Calles": [
        "Bache profundo en calle {calle}",
        "Pavimento deteriorado en esquina de {calle}",
        "Pozo grande en {calle} altura {numero}",
        "Calle destrozada en {calle}",
        "Asfalto levantado en {calle}",
    ],
    "Alumbrado Público": [
        "Luz de calle apagada en {calle} {numero}",
        "Poste de luz sin funcionar en {calle}",
        "Falta iluminación en {calle}",
        "Lámpara rota en {calle} altura {numero}",
        "Oscuridad total en {calle}",
    ],
    "Limpieza Urbana": [
        "Basura acumulada en {calle}",
        "No pasó el camión de basura en {calle}",
        "Residuos en la vereda de {calle} {numero}",
        "Contenedor desbordado en {calle}",
        "Microbasural en {calle}",
    ],
    "Arbolado Público": [
        "Árbol caído en {calle}",
        "Rama peligrosa en {calle} {numero}",
        "Necesita poda urgente en {calle}",
        "Árbol seco en {calle}",
        "Raíces levantando vereda en {calle}",
    ],
    "Espacios Verdes": [
        "Plaza descuidada en {calle}",
        "Juegos infantiles rotos en plaza {calle}",
        "Pasto muy alto en {calle}",
        "Falta mantenimiento en plaza de {calle}",
        "Basura en el parque de {calle}",
    ],
    "Veredas": [
        "Vereda rota en {calle} {numero}",
        "Desnivel peligroso en vereda de {calle}",
        "Baldosas sueltas en {calle}",
        "Vereda hundida en {calle} altura {numero}",
        "Cemento levantado en {calle}",
    ],
    "Desagües Pluviales": [
        "Calle inundada en {calle}",
        "Boca de tormenta tapada en {calle}",
        "Agua estancada en {calle} {numero}",
        "Desagüe obstruido en {calle}",
        "Inundación cada lluvia en {calle}",
    ],
    "Señalización Vial": [
        "Falta cartel de pare en {calle}",
        "Señal de tránsito caída en {calle}",
        "Semáforo sin funcionar en {calle}",
        "Falta pintura en senda peatonal de {calle}",
        "Señal tapada por árbol en {calle}",
    ],
    "Ruidos Molestos": [
        "Ruidos molestos en {calle} {numero}",
        "Música alta de noche en {calle}",
        "Taller con mucho ruido en {calle}",
        "Bocinas constantes en {calle}",
        "Fiesta ruidosa en {calle} {numero}",
    ],
    "Animales Sueltos": [
        "Perros sueltos en {calle}",
        "Jauría de perros en {calle}",
        "Animal abandonado en {calle} {numero}",
        "Perros agresivos en {calle}",
        "Animales en la vía pública {calle}",
    ],
}

# Calles comunes para generar direcciones
CALLES = [
    "Av. del Libertador", "San Martín", "Belgrano", "Rivadavia", "Sarmiento",
    "Mitre", "Moreno", "Alvear", "Alem", "Lavalle", "Pellegrini", "Urquiza",
    "Roca", "Brown", "Güemes", "Pueyrredón", "Balcarce", "Dorrego",
    "French", "Beruti", "Castelli", "Monteagudo", "Vieytes", "Paso",
    "Chiclana", "Suárez", "Alberti", "Maza", "Larrea", "Laprida",
]

# Listas para generar nombres aleatorios de vecinos
NOMBRES = [
    "Jorge", "Silvia", "Ricardo", "Mónica", "Gabriel", "Claudia", "Fernando", "Beatriz",
    "Marcelo", "Graciela", "Carlos", "María", "Juan", "Ana", "Roberto", "Laura",
    "Diego", "Patricia", "Miguel", "Susana", "Alejandro", "Carolina", "Pablo", "Verónica",
    "Martín", "Andrea", "Sebastián", "Daniela", "Gonzalo", "Natalia", "Federico", "Soledad",
    "Gustavo", "Valeria", "Hernán", "Cynthia", "Adrián", "Romina", "Cristian", "Vanesa",
    "Javier", "Florencia", "Nicolás", "Micaela", "Ezequiel", "Luciana", "Rodrigo", "Yamila",
    "Facundo", "Brenda", "Matías", "Agustina", "Leonardo", "Melina", "Maximiliano", "Celeste"
]

APELLIDOS = [
    "Gómez", "Castro", "Morales", "Herrera", "Vega", "Molina", "Ortiz", "Silva",
    "Rojas", "Medina", "González", "Rodríguez", "Fernández", "López", "Martínez",
    "Sánchez", "Pérez", "Ramírez", "Torres", "Ruiz", "Díaz", "Álvarez", "Romero",
    "Benítez", "Acosta", "Pereyra", "Vera", "Núñez", "Cabrera", "Ríos", "Campos",
    "Giménez", "Flores", "Vargas", "Ibáñez", "Navarro", "Cardozo", "Gutiérrez"
]

# Generar 100 vecinos con datos realistas
TOTAL_VECINOS = 100


async def main():
    print(">> Iniciando seed de datos para Merlo...")

    # Crear engine
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        # 1. Verificar/Crear Municipio
        print("\n>> Verificando municipio de Merlo...")
        result = await session.execute(
            select(Municipio).where(Municipio.nombre == MUNICIPIO_NOMBRE)
        )
        municipio = result.scalar_one_or_none()

        if not municipio:
            municipio = Municipio(
                nombre=MUNICIPIO_NOMBRE,
                codigo="MERLO",
                provincia="Buenos Aires",
                telefono="0220-4800000",
                email="contacto@merlo.gob.ar",
                direccion="Av. del Libertador 1234",
                color_primario="#3b82f6",
                activo=True
            )
            session.add(municipio)
            await session.commit()
            await session.refresh(municipio)
            print(f"[OK] Municipio '{MUNICIPIO_NOMBRE}' creado")
        else:
            print(f"[OK] Municipio '{MUNICIPIO_NOMBRE}' ya existe")

        # 2. Crear Zonas
        print(f"\n>> Creando {len(ZONAS_MERLO)} zonas...")
        zonas_db = []
        for zona_nombre in ZONAS_MERLO:
            result = await session.execute(
                select(Zona).where(
                    Zona.nombre == zona_nombre,
                    Zona.municipio_id == municipio.id
                )
            )
            zona = result.scalar_one_or_none()

            if not zona:
                zona = Zona(
                    nombre=zona_nombre,
                    codigo=zona_nombre[:3].upper(),
                    municipio_id=municipio.id,
                    activo=True
                )
                session.add(zona)
                zonas_db.append(zona)
            else:
                zonas_db.append(zona)

        await session.commit()
        # Refresh para tener los IDs
        for zona in zonas_db:
            await session.refresh(zona)
        print(f"[OK] {len(zonas_db)} zonas listas")

        # 3. Crear Categorías
        print(f"\n> Creando {len(CATEGORIAS)} categorías...")
        categorias_db = {}
        for cat in CATEGORIAS:
            result = await session.execute(
                select(Categoria).where(
                    Categoria.nombre == cat["nombre"],
                    Categoria.municipio_id == municipio.id
                )
            )
            categoria = result.scalar_one_or_none()

            if not categoria:
                categoria = Categoria(
                    nombre=cat["nombre"],
                    descripcion=cat["descripcion"],
                    municipio_id=municipio.id,
                    tiempo_resolucion_estimado=random.randint(24, 168),  # Entre 1 y 7 días en horas
                    prioridad_default=random.randint(2, 4),
                    activo=True
                )
                session.add(categoria)

            categorias_db[cat["nombre"]] = categoria

        await session.commit()
        # Refresh para tener los IDs
        for cat in categorias_db.values():
            await session.refresh(cat)
        print(f"[OK] {len(categorias_db)} categorías listas")

        # 4. Crear usuario administrador
        print("\n> Creando usuario administrador...")
        result = await session.execute(
            select(User).where(User.email == "admin@merlo.com")
        )
        admin_user = result.scalar_one_or_none()

        if not admin_user:
            admin_user = User(
                email="admin@merlo.com",
                password_hash=get_password_hash("admin123"),
                nombre="Administrador",
                apellido="Merlo",
                rol="admin",
                municipio_id=municipio.id,
                activo=True
            )
            session.add(admin_user)
            await session.commit()
            await session.refresh(admin_user)
            print("[OK] Admin creado (email: admin@merlo.com, pass: admin123)")
        else:
            print("[OK] Admin ya existe")

        # 5. Crear Empleados
        print(f"\n> Creando {len(EMPLEADOS)} empleados...")
        empleados_db = []
        for i, emp in enumerate(EMPLEADOS):
            # Primero crear el empleado
            result = await session.execute(
                select(Empleado).where(
                    Empleado.nombre == emp["nombre"],
                    Empleado.apellido == emp["apellido"],
                    Empleado.municipio_id == municipio.id
                )
            )
            empleado = result.scalar_one_or_none()

            if not empleado:
                empleado = Empleado(
                    nombre=emp["nombre"],
                    apellido=emp["apellido"],
                    descripcion=emp["cargo"],
                    especialidad=emp["cargo"],
                    municipio_id=municipio.id,
                    capacidad_maxima=random.randint(10, 20),
                    activo=True
                )
                session.add(empleado)
                await session.flush()

            # Crear usuario para el empleado (sin vincular por problemas de FK)
            email = f"empleado{i+1}@merlo.com"
            result = await session.execute(select(User).where(User.email == email))
            user = result.scalar_one_or_none()

            if not user:
                user = User(
                    email=email,
                    password_hash=get_password_hash("empleado123"),
                    nombre=emp["nombre"],
                    apellido=emp["apellido"],
                    telefono=emp["telefono"],
                    rol="empleado",
                    municipio_id=municipio.id,
                    activo=True,
                )
                session.add(user)

            empleados_db.append(empleado)

        await session.commit()
        # Refresh para tener los IDs
        for emp in empleados_db:
            await session.refresh(emp)
        print(f"[OK] {len(empleados_db)} empleados listos")

        # 6. Crear Vecinos
        print(f"\n> Creando {TOTAL_VECINOS} vecinos...")
        vecinos_db = []

        for i in range(1, TOTAL_VECINOS + 1):
            email = f"vecino{i}@merlo.com"

            result = await session.execute(
                select(User).where(User.email == email)
            )
            vecino = result.scalar_one_or_none()

            if not vecino:
                # Generar datos aleatorios
                nombre = random.choice(NOMBRES)
                apellido = random.choice(APELLIDOS)
                dni = str(random.randint(18000000, 45000000))
                telefono = f"11{random.randint(20000000, 69999999)}"

                vecino = User(
                    email=email,
                    password_hash=get_password_hash("vecino123"),
                    nombre=nombre,
                    apellido=apellido,
                    dni=dni,
                    telefono=telefono,
                    rol="vecino",
                    municipio_id=municipio.id,
                    activo=True,
                )
                session.add(vecino)

                # Commit cada 20 vecinos
                if i % 20 == 0:
                    await session.commit()

            vecinos_db.append(vecino)

        await session.commit()
        print(f"[OK] {len(vecinos_db)} vecinos listos")

        # 7. Crear Reclamos
        print(f"\n> Creando {TOTAL_RECLAMOS} reclamos...")
        print("   (esto puede tardar un momento...)")

        # Distribución de estados
        estados_distribucion = {
            "resuelto": int(TOTAL_RECLAMOS * 0.45),      # 45% resueltos
            "en_proceso": int(TOTAL_RECLAMOS * 0.25),    # 25% en proceso
            "asignado": int(TOTAL_RECLAMOS * 0.15),      # 15% asignados
            "rechazado": int(TOTAL_RECLAMOS * 0.05),     # 5% rechazados
            "nuevo": int(TOTAL_RECLAMOS * 0.10),         # 10% nuevos
        }

        reclamos_creados = 0
        fecha_inicio = datetime.now() - timedelta(days=180)  # 6 meses atrás

        for estado, cantidad in estados_distribucion.items():
            for _ in range(cantidad):
                # Datos aleatorios
                categoria_nombre = random.choice(list(CATEGORIAS))["nombre"]
                categoria = categorias_db[categoria_nombre]
                zona = random.choice(zonas_db)
                vecino = random.choice(vecinos_db)
                calle = random.choice(CALLES)
                numero = random.randint(100, 9999)

                # Generar título
                titulo_template = random.choice(TITULOS_TEMPLATES[categoria_nombre])
                titulo = titulo_template.format(calle=calle, numero=numero)

                # Descripción
                descripcion = f"Se reporta {titulo.lower()}. El problema afecta a los vecinos de la zona."

                # Dirección
                direccion = f"{calle} {numero}, {zona.nombre}"

                # Fecha de creación (entre hace 6 meses y hoy)
                dias_atras = random.randint(0, 180)
                fecha_creacion = fecha_inicio + timedelta(days=dias_atras)

                # Crear reclamo
                reclamo = Reclamo(
                    titulo=titulo,
                    descripcion=descripcion,
                    direccion=direccion,
                    estado=estado,
                    categoria_id=categoria.id,
                    zona_id=zona.id,
                    creador_id=vecino.id,
                    municipio_id=municipio.id,
                    created_at=fecha_creacion,
                    updated_at=fecha_creacion,
                    prioridad=random.randint(1, 5),  # 1-5 donde 1 es más urgente
                )

                # Si no es "nuevo", asignar empleado
                if estado != "nuevo":
                    empleado = random.choice(empleados_db)
                    reclamo.empleado_asignado_id = empleado.id
                    reclamo.fecha_asignacion = fecha_creacion + timedelta(hours=random.randint(1, 48))

                # Si está en proceso
                if estado == "en_proceso":
                    reclamo.fecha_inicio_trabajo = reclamo.fecha_asignacion + timedelta(hours=random.randint(1, 72))

                # Si está resuelto o rechazado
                if estado in ["resuelto", "rechazado"]:
                    reclamo.fecha_inicio_trabajo = reclamo.fecha_asignacion + timedelta(hours=random.randint(1, 24))
                    # Convertir horas estimadas a días y agregar variación
                    dias_estimados = categoria.tiempo_resolucion_estimado // 24
                    dias_resolucion = random.randint(1, max(dias_estimados + 5, 7))
                    reclamo.fecha_resolucion = reclamo.fecha_inicio_trabajo + timedelta(days=dias_resolucion)
                    reclamo.updated_at = reclamo.fecha_resolucion

                    if estado == "resuelto":
                        reclamo.observaciones = "Trabajo finalizado correctamente. Se notificó al vecino."
                    else:
                        reclamo.observaciones = "Reclamo rechazado. No corresponde a competencia municipal."

                session.add(reclamo)
                reclamos_creados += 1

                # Commit cada 100 reclamos para no sobrecargar memoria
                if reclamos_creados % 100 == 0:
                    await session.commit()
                    print(f"   + {reclamos_creados}/{TOTAL_RECLAMOS} reclamos creados")

        # Commit final
        await session.commit()
        print(f"\n[OK] {reclamos_creados} reclamos creados exitosamente!")

        # Resumen
        print("\n" + "="*60)
        print("> RESUMEN DE DATOS CREADOS")
        print("="*60)
        print(f"Municipio: {MUNICIPIO_NOMBRE}")
        print(f"Zonas: {len(zonas_db)}")
        print(f"Categorías: {len(categorias_db)}")
        print(f"Empleados: {len(empleados_db)}")
        print(f"Vecinos: {len(vecinos_db)}")
        print(f"Reclamos totales: {reclamos_creados}")
        print("\nDistribución de estados:")
        for estado, cantidad in estados_distribucion.items():
            porcentaje = (cantidad / TOTAL_RECLAMOS) * 100
            print(f"  • {estado.upper()}: {cantidad} ({porcentaje:.0f}%)")
        print("\n" + "="*60)
        print("\n[OK] ¡Seed completado con éxito!")
        print("\nCredenciales de acceso:")
        print("  Admin: admin@merlo.com / admin123")
        print("  Empleados: empleado1@merlo.com (hasta empleado10@merlo.com) / empleado123")
        print("  Vecinos: vecino1@merlo.com (hasta vecino10@merlo.com) / vecino123")
        print("="*60)


if __name__ == "__main__":
    asyncio.run(main())
