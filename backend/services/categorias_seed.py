"""
Seed inicial de categorías al crear un municipio.

Filosofía:
- Cada municipio es dueño absoluto de sus categorías. No hay catálogo global vivo.
- Para no obligar al admin a cargar todo desde cero, cuando se crea un municipio
  se siembran 10 categorías de reclamo + 10 de trámite como filas propias del
  municipio (con `municipio_id` seteado).
- A partir de ese momento, el admin puede renombrar, agregar o eliminar
  categorías libremente sin afectar a otros municipios ni al "catálogo".
- Si en el futuro se modifica esta lista, los municipios existentes NO se
  enteran (es seed, no template vivo).

Trámites concretos y documentos requeridos arrancan vacíos: el admin de cada
municipio los crea desde cero porque ahí sí varía mucho según la región.
"""
from sqlalchemy.ext.asyncio import AsyncSession

from models.categoria_reclamo import CategoriaReclamo
from models.categoria_tramite import CategoriaTramite


CATEGORIAS_RECLAMO_DEFAULT = [
    {"nombre": "Alumbrado público",          "icono": "Lightbulb",     "color": "#f59e0b", "orden": 1},
    {"nombre": "Bacheo y calles",            "icono": "Construction",  "color": "#78716c", "orden": 2},
    {"nombre": "Recolección de residuos",    "icono": "Trash2",        "color": "#10b981", "orden": 3},
    {"nombre": "Higiene urbana",             "icono": "Sparkles",      "color": "#06b6d4", "orden": 4},
    {"nombre": "Arbolado y espacios verdes", "icono": "TreeDeciduous", "color": "#22c55e", "orden": 5},
    {"nombre": "Tránsito y señalización",    "icono": "TrafficCone",   "color": "#ef4444", "orden": 6},
    {"nombre": "Agua y cloacas",             "icono": "Droplets",      "color": "#3b82f6", "orden": 7},
    {"nombre": "Plagas y control",           "icono": "Bug",           "color": "#84cc16", "orden": 8},
    {"nombre": "Animales sueltos",           "icono": "Dog",           "color": "#a855f7", "orden": 9},
    {"nombre": "Ruidos y convivencia",       "icono": "Volume2",       "color": "#ec4899", "orden": 10},
]


CATEGORIAS_TRAMITE_DEFAULT = [
    {"nombre": "Tránsito y Transporte",        "icono": "Car",         "color": "#3b82f6", "orden": 1},
    {"nombre": "Habilitaciones Comerciales",   "icono": "Store",       "color": "#8b5cf6", "orden": 2},
    {"nombre": "Obras Particulares",           "icono": "HardHat",     "color": "#f59e0b", "orden": 3},
    {"nombre": "Catastro",                     "icono": "Map",         "color": "#0ea5e9", "orden": 4},
    {"nombre": "Tasas y Tributos",             "icono": "CreditCard",  "color": "#10b981", "orden": 5},
    {"nombre": "Salud y Bromatología",         "icono": "HeartPulse",  "color": "#ef4444", "orden": 6},
    {"nombre": "Espacios Públicos",            "icono": "Trees",       "color": "#22c55e", "orden": 7},
    {"nombre": "Certificados y Documentación", "icono": "FileText",    "color": "#6366f1", "orden": 8},
    {"nombre": "Desarrollo Social",            "icono": "Users",       "color": "#ec4899", "orden": 9},
    {"nombre": "Cementerios",                  "icono": "Cross",       "color": "#64748b", "orden": 10},
]


async def seed_categorias_municipio(municipio_id: int, db: AsyncSession) -> None:
    """
    Inserta las 20 categorías default (10 de reclamo + 10 de trámite) para un
    municipio recién creado. Se llama desde `POST /municipios` después del
    insert del municipio.

    No hace commit: lo deja a cargo del caller para que pueda agruparse en
    una sola transacción con la creación del municipio.
    """
    for c in CATEGORIAS_RECLAMO_DEFAULT:
        db.add(CategoriaReclamo(
            municipio_id=municipio_id,
            nombre=c["nombre"],
            icono=c["icono"],
            color=c["color"],
            orden=c["orden"],
            activo=True,
        ))

    for c in CATEGORIAS_TRAMITE_DEFAULT:
        db.add(CategoriaTramite(
            municipio_id=municipio_id,
            nombre=c["nombre"],
            icono=c["icono"],
            color=c["color"],
            orden=c["orden"],
            activo=True,
        ))

    await db.flush()
