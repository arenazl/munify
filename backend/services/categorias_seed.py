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
    {
        "nombre": "Alumbrado público",
        "descripcion": "Luminarias apagadas o intermitentes, postes caídos, cables sueltos y zonas sin cobertura de iluminación.",
        "icono": "Lightbulb", "color": "#f59e0b", "orden": 1,
        "tiempo_resolucion_estimado": 48, "prioridad_default": 3,
    },
    {
        "nombre": "Bacheo y calles",
        "descripcion": "Deterioro de pavimento y asfalto: baches, hundimientos, pozos profundos y rotura de badenes.",
        "icono": "Construction", "color": "#78716c", "orden": 2,
        "tiempo_resolucion_estimado": 72, "prioridad_default": 3,
    },
    {
        "nombre": "Recolección de residuos",
        "descripcion": "Fallas en el servicio: basura no retirada, contenedores desbordados o rotos y basurales clandestinos.",
        "icono": "Trash2", "color": "#10b981", "orden": 3,
        "tiempo_resolucion_estimado": 48, "prioridad_default": 3,
    },
    {
        "nombre": "Higiene urbana",
        "descripcion": "Barrido de calles, limpieza de desagües pluviales, retiro de graffitis y cartelería ilegal.",
        "icono": "Sparkles", "color": "#06b6d4", "orden": 4,
        "tiempo_resolucion_estimado": 120, "prioridad_default": 4,
    },
    {
        "nombre": "Arbolado y espacios verdes",
        "descripcion": "Mantenimiento de plazas, parques y juegos; árboles caídos, ramas, poda, riego y bancos dañados.",
        "icono": "TreeDeciduous", "color": "#22c55e", "orden": 5,
        "tiempo_resolucion_estimado": 96, "prioridad_default": 3,
    },
    {
        "nombre": "Tránsito y señalización",
        "descripcion": "Semáforos con fallas, carteles caídos, señalización borrosa y demarcación horizontal faltante.",
        "icono": "TrafficCone", "color": "#ef4444", "orden": 6,
        "tiempo_resolucion_estimado": 12, "prioridad_default": 1,
    },
    {
        "nombre": "Agua y cloacas",
        "descripcion": "Pérdidas de agua en vía pública, cortes de suministro, cloacas desbordadas, tapas faltantes y baja presión.",
        "icono": "Droplets", "color": "#3b82f6", "orden": 7,
        "tiempo_resolucion_estimado": 6, "prioridad_default": 1,
    },
    {
        "nombre": "Plagas y control",
        "descripcion": "Roedores, insectos, palomas y situaciones que requieran fumigación o control sanitario en vía pública.",
        "icono": "Bug", "color": "#84cc16", "orden": 8,
        "tiempo_resolucion_estimado": 48, "prioridad_default": 3,
    },
    {
        "nombre": "Animales sueltos",
        "descripcion": "Perros sueltos, animales heridos o muertos en vía pública, maltrato animal y control de zoonosis.",
        "icono": "Dog", "color": "#a855f7", "orden": 9,
        "tiempo_resolucion_estimado": 24, "prioridad_default": 2,
    },
    {
        "nombre": "Ruidos y convivencia",
        "descripcion": "Ruidos excesivos de viviendas, comercios, obras o vehículos que afecten la convivencia vecinal.",
        "icono": "Volume2", "color": "#ec4899", "orden": 10,
        "tiempo_resolucion_estimado": 24, "prioridad_default": 3,
    },
]


CATEGORIAS_TRAMITE_DEFAULT = [
    {
        "nombre": "Tránsito y Transporte",
        "descripcion": "Licencias de conducir, libre deuda de patentes, infracciones, transporte público y permisos de circulación.",
        "icono": "Car", "color": "#3b82f6", "orden": 1,
    },
    {
        "nombre": "Habilitaciones Comerciales",
        "descripcion": "Apertura, transferencia, cese y renovación de habilitaciones de comercios, industrias y servicios.",
        "icono": "Store", "color": "#8b5cf6", "orden": 2,
    },
    {
        "nombre": "Obras Particulares",
        "descripcion": "Aprobación de planos, certificados de obra, finales de obra y registros de propietario y construcción.",
        "icono": "HardHat", "color": "#f59e0b", "orden": 3,
    },
    {
        "nombre": "Catastro",
        "descripcion": "Cédulas catastrales, planos, mensuras, certificados de dominio y subdivisión de parcelas.",
        "icono": "Map", "color": "#0ea5e9", "orden": 4,
    },
    {
        "nombre": "Tasas y Tributos",
        "descripcion": "Boletas de ABL, patente, libres deuda, planes de pago, exenciones y descuentos por buen contribuyente.",
        "icono": "CreditCard", "color": "#10b981", "orden": 5,
    },
    {
        "nombre": "Salud y Bromatología",
        "descripcion": "Carnet sanitario, libreta sanitaria, habilitación de consultorios y vehículos de transporte de alimentos.",
        "icono": "HeartPulse", "color": "#ef4444", "orden": 6,
    },
    {
        "nombre": "Espacios Públicos",
        "descripcion": "Permisos para uso de plazas, ferias, eventos, podas, ocupación de vereda y calzada.",
        "icono": "Trees", "color": "#22c55e", "orden": 7,
    },
    {
        "nombre": "Certificados y Documentación",
        "descripcion": "Certificados de residencia, supervivencia, libre deuda, antecedentes y constancias varias.",
        "icono": "FileText", "color": "#6366f1", "orden": 8,
    },
    {
        "nombre": "Desarrollo Social",
        "descripcion": "Solicitud de programas sociales, becas, ayudas económicas, módulos alimentarios y tarjetas de asistencia.",
        "icono": "Users", "color": "#ec4899", "orden": 9,
    },
    {
        "nombre": "Cementerios",
        "descripcion": "Adquisición de parcelas, traslados, exhumaciones, mantenimiento y trámites funerarios municipales.",
        "icono": "Cross", "color": "#64748b", "orden": 10,
    },
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
            descripcion=c.get("descripcion"),
            icono=c["icono"],
            color=c["color"],
            orden=c["orden"],
            tiempo_resolucion_estimado=c.get("tiempo_resolucion_estimado", 48),
            prioridad_default=c.get("prioridad_default", 3),
            activo=True,
        ))

    for c in CATEGORIAS_TRAMITE_DEFAULT:
        db.add(CategoriaTramite(
            municipio_id=municipio_id,
            nombre=c["nombre"],
            descripcion=c.get("descripcion"),
            icono=c["icono"],
            color=c["color"],
            orden=c["orden"],
            activo=True,
        ))

    await db.flush()
