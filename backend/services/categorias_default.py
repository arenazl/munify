"""
Categorías por defecto para municipios nuevos.
Estas categorías se crean automáticamente cuando se crea un municipio.
"""

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from models.categoria import Categoria


# 12 categorías estándar para reclamos municipales
CATEGORIAS_DEFAULT = [
    {
        "nombre": "Baches y Calles",
        "descripcion": "Reparacion de baches, hundimientos y problemas en calzada",
        "icono": "Construction",
        "color": "#EF4444",
        "tiempo_resolucion_estimado": 72,
        "prioridad_default": 2
    },
    {
        "nombre": "Alumbrado Publico",
        "descripcion": "Luminarias rotas, falta de iluminacion",
        "icono": "Lightbulb",
        "color": "#F59E0B",
        "tiempo_resolucion_estimado": 48,
        "prioridad_default": 2
    },
    {
        "nombre": "Recoleccion de Residuos",
        "descripcion": "Problemas con recoleccion de basura, contenedores",
        "icono": "Trash2",
        "color": "#10B981",
        "tiempo_resolucion_estimado": 24,
        "prioridad_default": 1
    },
    {
        "nombre": "Espacios Verdes",
        "descripcion": "Mantenimiento de plazas, poda de arboles",
        "icono": "Trees",
        "color": "#22C55E",
        "tiempo_resolucion_estimado": 120,
        "prioridad_default": 4
    },
    {
        "nombre": "Senalizacion",
        "descripcion": "Senales de transito danadas o faltantes",
        "icono": "SignpostBig",
        "color": "#3B82F6",
        "tiempo_resolucion_estimado": 72,
        "prioridad_default": 3
    },
    {
        "nombre": "Desagues y Cloacas",
        "descripcion": "Obstrucciones, desbordes, olores",
        "icono": "Droplets",
        "color": "#6366F1",
        "tiempo_resolucion_estimado": 48,
        "prioridad_default": 1
    },
    {
        "nombre": "Veredas",
        "descripcion": "Baldosas rotas, desniveles peligrosos",
        "icono": "Footprints",
        "color": "#8B5CF6",
        "tiempo_resolucion_estimado": 96,
        "prioridad_default": 3
    },
    {
        "nombre": "Agua y Canerias",
        "descripcion": "Perdidas de agua, roturas de canerias, falta de agua",
        "icono": "Droplet",
        "color": "#06B6D4",
        "tiempo_resolucion_estimado": 24,
        "prioridad_default": 1
    },
    {
        "nombre": "Plagas y Fumigacion",
        "descripcion": "Roedores, insectos, palomas, fumigacion",
        "icono": "Bug",
        "color": "#F97316",
        "tiempo_resolucion_estimado": 48,
        "prioridad_default": 2
    },
    {
        "nombre": "Ruidos Molestos",
        "descripcion": "Ruidos excesivos, contaminacion sonora",
        "icono": "Volume2",
        "color": "#EC4899",
        "tiempo_resolucion_estimado": 72,
        "prioridad_default": 3
    },
    {
        "nombre": "Animales Sueltos",
        "descripcion": "Perros sueltos, animales abandonados, mordeduras",
        "icono": "Dog",
        "color": "#84CC16",
        "tiempo_resolucion_estimado": 48,
        "prioridad_default": 2
    },
    {
        "nombre": "Otros",
        "descripcion": "Otros reclamos no categorizados",
        "icono": "HelpCircle",
        "color": "#6B7280",
        "tiempo_resolucion_estimado": 120,
        "prioridad_default": 5
    },
]


async def crear_categorias_default(db: AsyncSession, municipio_id: int) -> int:
    """
    Crea las 12 categorías por defecto para un municipio.
    Solo crea las que no existan (por nombre).

    Args:
        db: Sesión de base de datos
        municipio_id: ID del municipio

    Returns:
        Cantidad de categorías creadas
    """
    creadas = 0

    for cat_data in CATEGORIAS_DEFAULT:
        # Verificar si ya existe
        result = await db.execute(
            select(Categoria).where(
                Categoria.nombre == cat_data["nombre"],
                Categoria.municipio_id == municipio_id
            )
        )
        if not result.scalar_one_or_none():
            categoria = Categoria(**cat_data, municipio_id=municipio_id)
            db.add(categoria)
            creadas += 1

    if creadas > 0:
        await db.commit()

    return creadas
