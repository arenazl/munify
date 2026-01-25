"""
Servicio para generar datos de seed al crear un municipio.
Crea usuarios demo y reclamos de ejemplo en distintos estados.
"""
import random
from datetime import datetime, timedelta
from typing import List, Dict
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from core.security import get_password_hash

from models.user import User
from models.reclamo import Reclamo
from models.historial import HistorialReclamo
from models.enums import RolUsuario, EstadoReclamo


PASSWORD_HASH = get_password_hash("demo123")

# Datos para reclamos de ejemplo
RECLAMOS_EJEMPLO = [
    {
        "categoria": "Alumbrado Público",
        "titulo": "Poste de luz sin funcionar",
        "descripcion": "El poste de luz de la esquina no enciende hace una semana, la zona queda muy oscura de noche."
    },
    {
        "categoria": "Baches y Calles",
        "titulo": "Bache peligroso en la calle",
        "descripcion": "Hay un bache enorme que causa problemas a los autos y motos. Ya hubo varios accidentes."
    },
    {
        "categoria": "Limpieza",
        "titulo": "Basura acumulada en la esquina",
        "descripcion": "Hace días que no pasan a recoger la basura, hay bolsas acumuladas y mal olor."
    },
    {
        "categoria": "Arbolado",
        "titulo": "Árbol caído bloquea vereda",
        "descripcion": "Un árbol cayó después de la tormenta y está bloqueando el paso de los peatones."
    },
    {
        "categoria": "Agua y Cloacas",
        "titulo": "Pérdida de agua en la calle",
        "descripcion": "Hay una pérdida de agua importante que está inundando parte de la cuadra."
    },
]


async def crear_usuarios_demo(
    db: AsyncSession,
    municipio_id: int,
    codigo: str
) -> Dict[str, User]:
    """
    Crea 4 usuarios demo: admin, supervisor, empleado, vecino.
    Returns: dict con los usuarios creados por rol
    """
    usuarios_data = [
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

    usuarios = {}
    for data in usuarios_data:
        user = User(
            email=data["email"],
            password_hash=PASSWORD_HASH,
            nombre=data["nombre"],
            apellido=data["apellido"],
            telefono=data["telefono"],
            rol=data["rol"],
            municipio_id=municipio_id,
            activo=True
        )
        db.add(user)
        usuarios[data["rol"].value] = user

    await db.flush()
    return usuarios


async def crear_reclamos_demo(
    db: AsyncSession,
    municipio_id: int,
    usuario_vecino: User,
    barrios: List
) -> int:
    """
    Crea reclamos de ejemplo para el municipio.
    Returns: cantidad de reclamos creados
    """
    from models.categoria import Categoria, MunicipioCategoria

    # Obtener categorías habilitadas del municipio
    result = await db.execute(
        select(MunicipioCategoria, Categoria)
        .join(Categoria)
        .where(MunicipioCategoria.municipio_id == municipio_id)
    )
    categorias_rows = result.all()

    if not categorias_rows:
        return 0

    # Crear mapa de categorías por nombre (parcial)
    categorias_map = {}
    for mc, cat in categorias_rows:
        categorias_map[cat.nombre.lower()] = cat.id

    reclamos_creados = 0
    estados = [EstadoReclamo.NUEVO, EstadoReclamo.ASIGNADO, EstadoReclamo.EN_PROCESO, EstadoReclamo.RESUELTO]

    for i, reclamo_data in enumerate(RECLAMOS_EJEMPLO):
        # Buscar categoría que coincida
        categoria_id = None
        for nombre_cat, cat_id in categorias_map.items():
            if reclamo_data["categoria"].lower() in nombre_cat or nombre_cat in reclamo_data["categoria"].lower():
                categoria_id = cat_id
                break

        if not categoria_id:
            # Usar primera categoría disponible
            categoria_id = list(categorias_map.values())[0]

        # Seleccionar barrio aleatorio si hay
        barrio_id = None
        direccion = f"Calle {100 + i * 10}, {random.randint(100, 999)}"
        if barrios:
            barrio = random.choice(barrios)
            barrio_id = barrio.id
            direccion = f"{direccion}, {barrio.nombre}"

        # Estado aleatorio
        estado = random.choice(estados)

        # Fecha de creación (últimos 30 días)
        dias_atras = random.randint(1, 30)
        created_at = datetime.now() - timedelta(days=dias_atras)

        reclamo = Reclamo(
            municipio_id=municipio_id,
            titulo=reclamo_data["titulo"],
            descripcion=reclamo_data["descripcion"],
            direccion=direccion,
            categoria_id=categoria_id,
            barrio_id=barrio_id,
            creador_id=usuario_vecino.id,
            estado=estado,
            prioridad=random.randint(1, 5),
            created_at=created_at
        )
        db.add(reclamo)
        await db.flush()

        # Crear historial
        historial = HistorialReclamo(
            reclamo_id=reclamo.id,
            usuario_id=usuario_vecino.id,
            estado_nuevo=EstadoReclamo.NUEVO,
            accion="creado",
            comentario="Reclamo creado",
            created_at=created_at
        )
        db.add(historial)

        reclamos_creados += 1

    return reclamos_creados


async def seed_municipio_completo(
    db: AsyncSession,
    municipio_id: int,
    codigo: str,
    barrios: List = None
) -> dict:
    """
    Genera todos los datos de seed para un municipio.

    Args:
        db: Sesión de base de datos
        municipio_id: ID del municipio
        codigo: Código del municipio (para emails)
        barrios: Lista de barrios del municipio (opcional)

    Returns:
        dict con resumen de lo creado
    """
    resultado = {
        "usuarios_demo": 0,
        "reclamos": 0,
        "emails": []
    }

    try:
        # 1. Crear usuarios demo (admin, supervisor, empleado, vecino)
        usuarios = await crear_usuarios_demo(db, municipio_id, codigo)
        resultado["usuarios_demo"] = len(usuarios)
        resultado["emails"] = [
            f"admin@{codigo}.demo.com",
            f"supervisor@{codigo}.demo.com",
            f"empleado@{codigo}.demo.com",
            f"vecino@{codigo}.demo.com"
        ]

        # 2. Crear reclamos de ejemplo en distintos estados
        if usuarios.get("vecino"):
            reclamos = await crear_reclamos_demo(
                db, municipio_id, usuarios["vecino"], barrios or []
            )
            resultado["reclamos"] = reclamos

        return resultado

    except Exception as e:
        print(f"[SEED] Error en seed_municipio_completo: {e}")
        raise
