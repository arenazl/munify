"""
Tipos de trámite y trámites por defecto para municipios nuevos.
Estos se crean automáticamente cuando se crea un municipio.

Incluye campos para clasificación IA:
- es_certificado: El trámite produce un certificado/constancia
- es_habilitacion: El trámite produce una habilitación/permiso
- es_pago: El trámite involucra pago/tasa/impuesto
- palabras_clave: CSV de términos para búsqueda IA
"""

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from models.tramite import TipoTramite, MunicipioTipoTramite, Tramite, MunicipioTramite


# Tipos de trámites base con sus trámites específicos
TIPOS_TRAMITES_DEFAULT = [
    {
        "nombre": "Obras Privadas",
        "codigo": "OBRAS_PRIVADAS",
        "descripcion": "Permisos y habilitaciones para construcciones, ampliaciones y regularizaciones de obra",
        "icono": "HardHat",
        "color": "#EF4444",
        "es_certificado": False,
        "es_habilitacion": True,
        "es_pago": False,
        "palabras_clave": "obra,construccion,plano,permiso,ampliacion,regularizacion,edificar,construir",
        "tramites": [
            {
                "nombre": "Permiso de Obra Nueva",
                "descripcion": "Solicitud de permiso para construcción nueva en terreno propio",
                "icono": "Building2",
                "es_habilitacion": True,
                "palabras_clave": "obra nueva,construir,edificar,permiso construccion",
                "requisitos": "Planos aprobados, Título de propiedad, DNI, Pago de derechos",
                "plazo_dias": 30
            },
            {
                "nombre": "Ampliación de Obra",
                "descripcion": "Permiso para ampliar construcción existente",
                "icono": "Maximize",
                "es_habilitacion": True,
                "palabras_clave": "ampliar,ampliacion,agrandar,anexo",
                "requisitos": "Planos actuales, Planos de ampliación, DNI, Final de obra anterior",
                "plazo_dias": 20
            },
            {
                "nombre": "Regularización de Obra",
                "descripcion": "Regularizar construcción sin permiso previo",
                "icono": "CheckCircle",
                "es_habilitacion": True,
                "palabras_clave": "regularizar,sin permiso,clandestina,ilegal",
                "requisitos": "Planos relevamiento, Fotos, DNI, Título de propiedad",
                "plazo_dias": 45
            },
            {
                "nombre": "Final de Obra",
                "descripcion": "Certificado de finalización de obra",
                "icono": "Award",
                "es_certificado": True,
                "palabras_clave": "final,terminacion,certificado obra",
                "requisitos": "Planos conforme a obra, Inspección aprobada",
                "plazo_dias": 15
            },
        ]
    },
    {
        "nombre": "Comercio e Industria",
        "codigo": "COMERCIO_INDUSTRIA",
        "descripcion": "Habilitaciones comerciales, industriales y renovaciones",
        "icono": "Store",
        "color": "#3B82F6",
        "es_certificado": False,
        "es_habilitacion": True,
        "es_pago": False,
        "palabras_clave": "comercio,habilitacion,comercial,negocio,local,rubro,industria,fabrica",
        "tramites": [
            {
                "nombre": "Habilitación Comercial",
                "descripcion": "Habilitación de nuevo comercio o actividad comercial",
                "icono": "Store",
                "es_habilitacion": True,
                "palabras_clave": "habilitar comercio,abrir local,nuevo negocio",
                "requisitos": "Contrato de alquiler o título, CUIT, Plano del local, Libre deuda municipal",
                "plazo_dias": 15
            },
            {
                "nombre": "Renovación de Habilitación",
                "descripcion": "Renovar habilitación comercial vencida",
                "icono": "RefreshCw",
                "es_habilitacion": True,
                "palabras_clave": "renovar,vencida,actualizar habilitacion",
                "requisitos": "Habilitación anterior, CUIT, Libre deuda municipal",
                "plazo_dias": 10
            },
            {
                "nombre": "Cambio de Rubro",
                "descripcion": "Modificar actividad comercial habilitada",
                "icono": "ArrowRightLeft",
                "es_habilitacion": True,
                "palabras_clave": "cambiar rubro,nueva actividad,modificar",
                "requisitos": "Habilitación actual, Descripción nuevo rubro, CUIT",
                "plazo_dias": 15
            },
            {
                "nombre": "Baja de Comercio",
                "descripcion": "Dar de baja habilitación comercial",
                "icono": "XCircle",
                "palabras_clave": "cerrar,baja,clausura,fin actividad",
                "requisitos": "Habilitación vigente, Libre deuda, DNI titular",
                "plazo_dias": 5
            },
        ]
    },
    {
        "nombre": "Tránsito y Transporte",
        "codigo": "TRANSITO_TRANSPORTE",
        "descripcion": "Licencias de conducir y permisos de estacionamiento",
        "icono": "Car",
        "color": "#10B981",
        "es_certificado": True,
        "es_habilitacion": False,
        "es_pago": False,
        "palabras_clave": "licencia,conducir,carnet,estacionamiento,transito,vehiculo,auto,moto",
        "tramites": [
            {
                "nombre": "Licencia de Conducir - Primera vez",
                "descripcion": "Obtención de licencia de conducir nueva",
                "icono": "CreditCard",
                "es_certificado": True,
                "palabras_clave": "licencia nueva,sacar carnet,primera vez,registro",
                "requisitos": "DNI, Certificado de antecedentes, Examen psicofísico, Foto 4x4, Curso vial aprobado",
                "plazo_dias": 5
            },
            {
                "nombre": "Renovación de Licencia",
                "descripcion": "Renovar licencia de conducir vencida",
                "icono": "RefreshCw",
                "es_certificado": True,
                "palabras_clave": "renovar licencia,vencida,carnet vencido",
                "requisitos": "DNI, Licencia anterior, Examen psicofísico",
                "plazo_dias": 3
            },
            {
                "nombre": "Permiso de Estacionamiento",
                "descripcion": "Permiso para estacionamiento medido",
                "icono": "ParkingCircle",
                "es_certificado": True,
                "es_pago": True,
                "palabras_clave": "estacionar,cochera,medido",
                "requisitos": "DNI, Cédula verde, Comprobante de domicilio",
                "plazo_dias": 3
            },
        ]
    },
    {
        "nombre": "Rentas y Tasas",
        "codigo": "RENTAS_TASAS",
        "descripcion": "Pagos, planes de facilidades y certificados de deuda",
        "icono": "Receipt",
        "color": "#F59E0B",
        "es_certificado": True,
        "es_habilitacion": False,
        "es_pago": True,
        "palabras_clave": "pago,tasa,impuesto,deuda,libre,plan,exencion,rentas,tributo",
        "tramites": [
            {
                "nombre": "Plan de Pago",
                "descripcion": "Plan de facilidades para deuda municipal",
                "icono": "Calendar",
                "es_pago": True,
                "palabras_clave": "plan pago,cuotas,facilidades,deber",
                "requisitos": "DNI, Comprobante de deuda, Datos del inmueble/comercio",
                "plazo_dias": 2
            },
            {
                "nombre": "Libre Deuda Municipal",
                "descripcion": "Certificado de libre deuda municipal",
                "icono": "CheckCircle2",
                "es_certificado": True,
                "palabras_clave": "libre deuda,certificado,no debe",
                "requisitos": "DNI, Datos del inmueble o comercio",
                "plazo_dias": 1
            },
            {
                "nombre": "Exención de Tasas",
                "descripcion": "Solicitud de exención por discapacidad, jubilación u otros",
                "icono": "BadgePercent",
                "palabras_clave": "exencion,descuento,jubilado,discapacidad,no pagar",
                "requisitos": "DNI, Certificado de discapacidad o recibo jubilación, Comprobantes",
                "plazo_dias": 15
            },
        ]
    },
    {
        "nombre": "Medio Ambiente",
        "codigo": "MEDIO_AMBIENTE",
        "descripcion": "Permisos ambientales, poda y extracción de árboles",
        "icono": "Leaf",
        "color": "#22C55E",
        "es_certificado": False,
        "es_habilitacion": False,
        "es_pago": False,
        "palabras_clave": "arbol,poda,ambiente,verde,extraccion,ambiental,ecologia",
        "tramites": [
            {
                "nombre": "Permiso de Poda",
                "descripcion": "Solicitud de poda de árbol en vereda pública",
                "icono": "Scissors",
                "palabras_clave": "podar,arbol,vereda,rama",
                "requisitos": "DNI, Ubicación del árbol, Fotos",
                "plazo_dias": 10
            },
            {
                "nombre": "Extracción de Árbol",
                "descripcion": "Solicitud de extracción de árbol",
                "icono": "TreeDeciduous",
                "palabras_clave": "sacar arbol,extraer,cortar arbol,raiz",
                "requisitos": "DNI, Justificación, Fotos, Ubicación exacta",
                "plazo_dias": 20
            },
        ]
    },
    {
        "nombre": "Catastro e Inmuebles",
        "codigo": "CATASTRO",
        "descripcion": "Trámites inmobiliarios, mensuras y subdivisiones",
        "icono": "MapPin",
        "color": "#8B5CF6",
        "es_certificado": True,
        "es_habilitacion": False,
        "es_pago": False,
        "palabras_clave": "catastro,mensura,subdivision,terreno,inmueble,parcela,propiedad,lote",
        "tramites": [
            {
                "nombre": "Plano de Mensura",
                "descripcion": "Solicitud de plano de mensura oficial",
                "icono": "Ruler",
                "es_certificado": True,
                "palabras_clave": "mensura,medir,agrimensura,plano oficial",
                "requisitos": "Título de propiedad, DNI, Plano anterior si existe",
                "plazo_dias": 30
            },
            {
                "nombre": "Subdivisión de Terreno",
                "descripcion": "División de parcela en lotes",
                "icono": "Grid3X3",
                "palabras_clave": "subdividir,dividir,lotes,parcela",
                "requisitos": "Título, Planos, Proyecto de subdivisión aprobado",
                "plazo_dias": 45
            },
            {
                "nombre": "Unificación de Parcelas",
                "descripcion": "Unificar dos o más parcelas en una",
                "icono": "Combine",
                "palabras_clave": "unificar,juntar,union parcelas",
                "requisitos": "Títulos de ambas parcelas, Planos, DNI",
                "plazo_dias": 30
            },
        ]
    },
    {
        "nombre": "Salud y Bromatología",
        "codigo": "SALUD_BROMATOLOGIA",
        "descripcion": "Carnets de salud, libretas sanitarias y habilitaciones alimentarias",
        "icono": "Heart",
        "color": "#EC4899",
        "es_certificado": True,
        "es_habilitacion": True,
        "es_pago": False,
        "palabras_clave": "carnet,salud,libreta,sanitaria,bromatologia,alimento,manipulador,higiene",
        "tramites": [
            {
                "nombre": "Carnet de Manipulador de Alimentos",
                "descripcion": "Libreta sanitaria para manipulación de alimentos",
                "icono": "Utensils",
                "es_certificado": True,
                "palabras_clave": "carnet,libreta,manipulador,comida,alimentos",
                "requisitos": "DNI, Curso de manipulación aprobado, Foto 4x4",
                "plazo_dias": 5
            },
            {
                "nombre": "Habilitación de Comercio Gastronómico",
                "descripcion": "Habilitación para restaurantes, bares y afines",
                "icono": "ChefHat",
                "es_habilitacion": True,
                "palabras_clave": "restaurante,bar,comida,gastronomico",
                "requisitos": "Habilitación comercial, Carnet manipulador, Planos cocina",
                "plazo_dias": 20
            },
        ]
    },
    {
        "nombre": "Desarrollo Social",
        "codigo": "DESARROLLO_SOCIAL",
        "descripcion": "Asistencia social, subsidios y programas de ayuda",
        "icono": "Users",
        "color": "#6366F1",
        "es_certificado": True,
        "es_habilitacion": False,
        "es_pago": False,
        "palabras_clave": "social,subsidio,ayuda,asistencia,programa,beneficio,necesidad",
        "tramites": [
            {
                "nombre": "Subsidio por Emergencia Habitacional",
                "descripcion": "Ayuda económica para situaciones de emergencia habitacional",
                "icono": "Home",
                "es_certificado": True,
                "palabras_clave": "subsidio,emergencia,vivienda,habitacional,ayuda",
                "requisitos": "DNI, Informe social, Comprobante de situación",
                "plazo_dias": 15
            },
            {
                "nombre": "Inscripción Tarjeta Alimentaria",
                "descripcion": "Alta en programa de asistencia alimentaria municipal",
                "icono": "CreditCard",
                "es_certificado": True,
                "palabras_clave": "tarjeta,alimentaria,comida,alimentos,inscripcion",
                "requisitos": "DNI, Certificado de domicilio, Informe socioeconómico",
                "plazo_dias": 10
            },
            {
                "nombre": "Bolsón de Alimentos",
                "descripcion": "Solicitud de bolsón de alimentos mensual",
                "icono": "ShoppingBag",
                "palabras_clave": "bolson,alimentos,comida,mercaderia",
                "requisitos": "DNI, Certificado de domicilio",
                "plazo_dias": 3
            },
            {
                "nombre": "Certificado Socioeconómico",
                "descripcion": "Constancia de situación socioeconómica familiar",
                "icono": "FileCheck",
                "es_certificado": True,
                "palabras_clave": "certificado,socioeconomico,situacion,pobreza,vulnerabilidad",
                "requisitos": "DNI de todos los integrantes, Comprobantes de ingresos",
                "plazo_dias": 7
            },
            {
                "nombre": "Inscripción Programa de Vivienda",
                "descripcion": "Registro en lista de espera para vivienda social",
                "icono": "Building",
                "palabras_clave": "vivienda,casa,inscripcion,programa,social",
                "requisitos": "DNI, Certificado socioeconómico, Grupo familiar",
                "plazo_dias": 5
            },
        ]
    },
    {
        "nombre": "Cementerio",
        "codigo": "CEMENTERIO",
        "descripcion": "Trámites de cementerio, nichos y servicios fúnebres",
        "icono": "Home",
        "color": "#78716C",
        "es_certificado": True,
        "es_habilitacion": False,
        "es_pago": True,
        "palabras_clave": "cementerio,nicho,sepultura,difunto,funebre,panteon,boveda",
        "tramites": [
            {
                "nombre": "Adquisición de Nicho",
                "descripcion": "Compra o alquiler de nicho en cementerio municipal",
                "icono": "Archive",
                "es_pago": True,
                "palabras_clave": "nicho,compra,alquiler,sepultura,cementerio",
                "requisitos": "DNI, Certificado de defunción",
                "plazo_dias": 2
            },
            {
                "nombre": "Renovación de Nicho",
                "descripcion": "Renovación del alquiler de nicho existente",
                "icono": "RefreshCw",
                "es_pago": True,
                "palabras_clave": "renovar,nicho,alquiler,vencido",
                "requisitos": "DNI, Comprobante de nicho anterior, Libre deuda",
                "plazo_dias": 1
            },
            {
                "nombre": "Traslado de Restos",
                "descripcion": "Solicitud de traslado de restos entre nichos o cementerios",
                "icono": "Truck",
                "es_certificado": True,
                "es_pago": True,
                "palabras_clave": "traslado,restos,mover,transferir",
                "requisitos": "DNI, Certificado de defunción, Autorización familiar",
                "plazo_dias": 10
            },
            {
                "nombre": "Permiso de Exhumación",
                "descripcion": "Autorización para exhumar restos",
                "icono": "FileWarning",
                "es_certificado": True,
                "palabras_clave": "exhumacion,desenterrar,restos,autopsia",
                "requisitos": "DNI, Orden judicial o autorización sanitaria, Certificado defunción",
                "plazo_dias": 15
            },
            {
                "nombre": "Inhumación",
                "descripcion": "Trámite para entierro en cementerio municipal",
                "icono": "ArrowDown",
                "es_certificado": True,
                "es_pago": True,
                "palabras_clave": "entierro,inhumacion,sepultar,funeral",
                "requisitos": "Certificado de defunción, DNI del solicitante, Comprobante de nicho",
                "plazo_dias": 1
            },
        ]
    },
    {
        "nombre": "Documentación Personal",
        "codigo": "DOCUMENTACION",
        "descripcion": "Certificados, constancias y documentación personal",
        "icono": "FileText",
        "color": "#0EA5E9",
        "es_certificado": True,
        "es_habilitacion": False,
        "es_pago": False,
        "palabras_clave": "certificado,constancia,domicilio,supervivencia,documento,residencia",
        "tramites": [
            {
                "nombre": "Certificado de Domicilio",
                "descripcion": "Constancia de residencia en el municipio",
                "icono": "Home",
                "es_certificado": True,
                "palabras_clave": "domicilio,residencia,vivo,certificado",
                "requisitos": "DNI, Servicio a nombre del titular",
                "plazo_dias": 3
            },
            {
                "nombre": "Certificado de Supervivencia",
                "descripcion": "Constancia de que la persona está viva",
                "icono": "HeartPulse",
                "es_certificado": True,
                "palabras_clave": "supervivencia,fe de vida,vivo",
                "requisitos": "DNI, Presencia del titular",
                "plazo_dias": 1
            },
        ]
    },
    {
        "nombre": "Espacio Público",
        "codigo": "ESPACIO_PUBLICO",
        "descripcion": "Permisos de uso de espacio público, eventos y cartelería",
        "icono": "Flag",
        "color": "#14B8A6",
        "es_certificado": False,
        "es_habilitacion": True,
        "es_pago": False,
        "palabras_clave": "evento,espacio,publico,carteleria,feria,venta,ambulante,ocupacion",
        "tramites": [
            {
                "nombre": "Permiso para Evento en Plaza",
                "descripcion": "Autorización para realizar evento en espacio público",
                "icono": "PartyPopper",
                "es_habilitacion": True,
                "palabras_clave": "evento,plaza,parque,fiesta,reunion,acto",
                "requisitos": "DNI, Descripción del evento, Seguro de responsabilidad civil",
                "plazo_dias": 10
            },
            {
                "nombre": "Habilitación de Feria",
                "descripcion": "Permiso para instalar feria o mercado temporal",
                "icono": "Store",
                "es_habilitacion": True,
                "palabras_clave": "feria,mercado,puestos,venta",
                "requisitos": "DNI, Listado de puestos, Plano de ubicación, Seguro",
                "plazo_dias": 15
            },
            {
                "nombre": "Permiso de Food Truck",
                "descripcion": "Habilitación para venta ambulante de comida",
                "icono": "Truck",
                "es_habilitacion": True,
                "palabras_clave": "food truck,comida,ambulante,movil,vehiculo",
                "requisitos": "Habilitación comercial, Carnet manipulador, Seguro, Habilitación vehicular",
                "plazo_dias": 20
            },
            {
                "nombre": "Cartelería Publicitaria",
                "descripcion": "Permiso para instalación de cartel publicitario",
                "icono": "Signpost",
                "es_habilitacion": True,
                "es_pago": True,
                "palabras_clave": "cartel,publicidad,carteleria,propaganda,anuncio",
                "requisitos": "Plano de ubicación, Diseño del cartel, Seguro",
                "plazo_dias": 15
            },
            {
                "nombre": "Ocupación de Vereda",
                "descripcion": "Permiso para mesas y sillas en vereda (bares/restaurantes)",
                "icono": "Coffee",
                "es_habilitacion": True,
                "es_pago": True,
                "palabras_clave": "vereda,mesas,sillas,bar,restaurante,ocupacion",
                "requisitos": "Habilitación comercial, Plano de ocupación, Seguro",
                "plazo_dias": 10
            },
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
        # Hacer copia para no modificar el original
        tipo_data = tipo_data.copy()
        tramites_data = tipo_data.pop("tramites", [])

        # Buscar si el tipo ya existe en el catálogo global
        result = await db.execute(
            select(TipoTramite).where(TipoTramite.nombre == tipo_data["nombre"])
        )
        tipo = result.scalar_one_or_none()

        if not tipo:
            # Crear el tipo en el catálogo global
            tipo = TipoTramite(
                nombre=tipo_data["nombre"],
                codigo=tipo_data.get("codigo"),
                descripcion=tipo_data.get("descripcion"),
                icono=tipo_data.get("icono"),
                color=tipo_data.get("color"),
                es_certificado=tipo_data.get("es_certificado", False),
                es_habilitacion=tipo_data.get("es_habilitacion", False),
                es_pago=tipo_data.get("es_pago", False),
                palabras_clave=tipo_data.get("palabras_clave"),
                orden=idx
            )
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
                    icono=tramite_data.get("icono"),
                    es_certificado=tramite_data.get("es_certificado", False),
                    es_habilitacion=tramite_data.get("es_habilitacion", False),
                    es_pago=tramite_data.get("es_pago", False),
                    palabras_clave=tramite_data.get("palabras_clave"),
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

    await db.commit()
    return habilitados


async def seed_tipos_tramites_catalogo(db: AsyncSession) -> int:
    """
    Carga solo el catálogo global de tipos de trámites y trámites.
    No crea vínculos con ningún municipio.

    Returns:
        Cantidad de tipos de trámites creados
    """
    creados = 0

    for idx, tipo_data in enumerate(TIPOS_TRAMITES_DEFAULT):
        tipo_data = tipo_data.copy()
        tramites_data = tipo_data.pop("tramites", [])

        # Buscar si el tipo ya existe
        result = await db.execute(
            select(TipoTramite).where(TipoTramite.nombre == tipo_data["nombre"])
        )
        tipo = result.scalar_one_or_none()

        if not tipo:
            tipo = TipoTramite(
                nombre=tipo_data["nombre"],
                codigo=tipo_data.get("codigo"),
                descripcion=tipo_data.get("descripcion"),
                icono=tipo_data.get("icono"),
                color=tipo_data.get("color"),
                es_certificado=tipo_data.get("es_certificado", False),
                es_habilitacion=tipo_data.get("es_habilitacion", False),
                es_pago=tipo_data.get("es_pago", False),
                palabras_clave=tipo_data.get("palabras_clave"),
                orden=idx
            )
            db.add(tipo)
            await db.flush()
            creados += 1

        # Crear trámites del tipo
        for tidx, tramite_data in enumerate(tramites_data):
            result = await db.execute(
                select(Tramite).where(
                    Tramite.nombre == tramite_data["nombre"],
                    Tramite.tipo_tramite_id == tipo.id
                )
            )
            if not result.scalar_one_or_none():
                tramite = Tramite(
                    tipo_tramite_id=tipo.id,
                    nombre=tramite_data["nombre"],
                    descripcion=tramite_data.get("descripcion", ""),
                    icono=tramite_data.get("icono"),
                    es_certificado=tramite_data.get("es_certificado", False),
                    es_habilitacion=tramite_data.get("es_habilitacion", False),
                    es_pago=tramite_data.get("es_pago", False),
                    palabras_clave=tramite_data.get("palabras_clave"),
                    requisitos=tramite_data.get("requisitos", ""),
                    tiempo_estimado_dias=tramite_data.get("plazo_dias", 15),
                    costo=0,
                    orden=tidx,
                    activo=True
                )
                db.add(tramite)

    await db.commit()
    return creados
