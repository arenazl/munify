"""
Tipos de trámite y trámites por defecto para municipios nuevos.
Estos se crean automáticamente cuando se crea un municipio.
"""

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from models.tramite import TipoTramite, MunicipioTipoTramite, Tramite, MunicipioTramite


# Tipos de trámites base con sus trámites específicos
TIPOS_TRAMITES_DEFAULT = [
    {
        "nombre": "Obras Privadas",
        "descripcion": "Permisos y habilitaciones para construcciones",
        "icono": "HardHat",
        "color": "#EF4444",
        "tramites": [
            {"nombre": "Permiso de Obra Nueva", "descripcion": "Solicitud de permiso para construccion nueva", "requisitos": "Planos, titulo de propiedad, DNI", "plazo_dias": 30},
            {"nombre": "Ampliacion", "descripcion": "Permiso para ampliar construccion existente", "requisitos": "Planos actuales, planos nuevos, DNI", "plazo_dias": 20},
            {"nombre": "Regularizacion de Obra", "descripcion": "Regularizar construccion sin permiso", "requisitos": "Planos, fotos, DNI, titulo", "plazo_dias": 45},
        ]
    },
    {
        "nombre": "Comercio e Industria",
        "descripcion": "Habilitaciones comerciales e industriales",
        "icono": "Store",
        "color": "#3B82F6",
        "tramites": [
            {"nombre": "Habilitacion Comercial", "descripcion": "Habilitacion de nuevo comercio", "requisitos": "Contrato de alquiler o titulo, habilitacion municipal, CUIT", "plazo_dias": 15},
            {"nombre": "Renovacion de Habilitacion", "descripcion": "Renovar habilitacion comercial vencida", "requisitos": "Habilitacion anterior, CUIT, libre deuda", "plazo_dias": 10},
            {"nombre": "Cambio de Rubro", "descripcion": "Modificar actividad comercial", "requisitos": "Habilitacion actual, nuevo rubro, CUIT", "plazo_dias": 15},
        ]
    },
    {
        "nombre": "Transito y Transporte",
        "descripcion": "Licencias y permisos de transito",
        "icono": "Car",
        "color": "#10B981",
        "tramites": [
            {"nombre": "Licencia de Conducir", "descripcion": "Obtencion o renovacion de licencia", "requisitos": "DNI, examen psicofisico, foto 4x4", "plazo_dias": 5},
            {"nombre": "Permiso de Estacionamiento", "descripcion": "Permiso para estacionamiento medido", "requisitos": "DNI, cedula verde, comprobante de domicilio", "plazo_dias": 3},
        ]
    },
    {
        "nombre": "Rentas y Tasas",
        "descripcion": "Pagos y planes de facilidades",
        "icono": "Receipt",
        "color": "#F59E0B",
        "tramites": [
            {"nombre": "Plan de Pago", "descripcion": "Plan de facilidades para deuda municipal", "requisitos": "DNI, comprobante de deuda", "plazo_dias": 2},
            {"nombre": "Libre Deuda", "descripcion": "Certificado de libre deuda municipal", "requisitos": "DNI, datos del inmueble o comercio", "plazo_dias": 1},
            {"nombre": "Exencion de Tasas", "descripcion": "Solicitud de exencion por discapacidad u otros", "requisitos": "DNI, certificado de discapacidad, comprobantes", "plazo_dias": 15},
        ]
    },
    {
        "nombre": "Medio Ambiente",
        "descripcion": "Permisos ambientales y poda",
        "icono": "Leaf",
        "color": "#22C55E",
        "tramites": [
            {"nombre": "Permiso de Poda", "descripcion": "Solicitud de poda de arbol en vereda", "requisitos": "DNI, ubicacion del arbol, fotos", "plazo_dias": 10},
            {"nombre": "Extraccion de Arbol", "descripcion": "Solicitud de extraccion de arbol", "requisitos": "DNI, justificacion, fotos, ubicacion", "plazo_dias": 20},
        ]
    },
    {
        "nombre": "Catastro",
        "descripcion": "Tramites inmobiliarios y catastro",
        "icono": "MapPin",
        "color": "#8B5CF6",
        "tramites": [
            {"nombre": "Plano de Mensura", "descripcion": "Solicitud de plano de mensura oficial", "requisitos": "Titulo de propiedad, DNI", "plazo_dias": 30},
            {"nombre": "Subdivision de Terreno", "descripcion": "Division de parcela", "requisitos": "Titulo, planos, proyecto de subdivision", "plazo_dias": 45},
        ]
    },
]


async def crear_tipos_tramites_default(db: AsyncSession, municipio_id: int) -> int:
    """
    Habilita los tipos de trámites y trámites por defecto para un municipio.
    - Si el tipo/trámite no existe en el catálogo global, lo crea.
    - Si ya existe, solo crea el vínculo con el municipio.

    Args:
        db: Sesión de base de datos
        municipio_id: ID del municipio

    Returns:
        Cantidad de tipos de trámites habilitados para el municipio
    """
    habilitados = 0

    for idx, tipo_data in enumerate(TIPOS_TRAMITES_DEFAULT):
        tramites_data = tipo_data.pop("tramites", [])

        # Buscar si el tipo ya existe en el catálogo global
        result = await db.execute(
            select(TipoTramite).where(TipoTramite.nombre == tipo_data["nombre"])
        )
        tipo = result.scalar_one_or_none()

        if not tipo:
            # Crear el tipo en el catálogo global
            tipo = TipoTramite(**tipo_data, orden=idx)
            db.add(tipo)
            await db.flush()

        # Verificar si ya está habilitado para este municipio
        result = await db.execute(
            select(MunicipioTipoTramite).where(
                MunicipioTipoTramite.tipo_tramite_id == tipo.id,
                MunicipioTipoTramite.municipio_id == municipio_id
            )
        )
        if not result.scalar_one_or_none():
            # Crear el vínculo municipio-tipo
            mtt = MunicipioTipoTramite(
                municipio_id=municipio_id,
                tipo_tramite_id=tipo.id,
                activo=True,
                orden=idx
            )
            db.add(mtt)
            habilitados += 1

        # Crear trámites dentro del tipo
        for tidx, tramite_data in enumerate(tramites_data):
            # Buscar si el trámite ya existe
            result = await db.execute(
                select(Tramite).where(
                    Tramite.nombre == tramite_data["nombre"],
                    Tramite.tipo_tramite_id == tipo.id
                )
            )
            tramite = result.scalar_one_or_none()

            if not tramite:
                # Crear el trámite
                tramite = Tramite(
                    tipo_tramite_id=tipo.id,
                    nombre=tramite_data["nombre"],
                    descripcion=tramite_data.get("descripcion", ""),
                    requisitos=tramite_data.get("requisitos", ""),
                    tiempo_estimado_dias=tramite_data.get("plazo_dias", 15),
                    costo=0,
                    orden=tidx,
                    activo=True
                )
                db.add(tramite)
                await db.flush()

            # Verificar si ya está habilitado para el municipio
            result = await db.execute(
                select(MunicipioTramite).where(
                    MunicipioTramite.tramite_id == tramite.id,
                    MunicipioTramite.municipio_id == municipio_id
                )
            )
            if not result.scalar_one_or_none():
                mt = MunicipioTramite(
                    municipio_id=municipio_id,
                    tramite_id=tramite.id,
                    activo=True,
                    orden=tidx
                )
                db.add(mt)

        # Restaurar tramites_data para la próxima iteración
        tipo_data["tramites"] = tramites_data

    await db.commit()
    return habilitados
