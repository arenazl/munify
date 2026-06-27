"""Knowledge Share Protocol (KSP) v1.2 — endpoint productor de Munify.

GET /api/knowledge-base        -> KB comercial completo de Munify (auth X-KB-Key)
GET /api/knowledge-base/health -> estado y version del contrato (sin auth)

Contrato: d:\\Code\\base-compartida\\3-PROTOCOLO-COMPLETO.md (seguir a rajatabla).
Rol: Munify es una APLICACION (productora). Lo consumen los GENERADORES
(SalesBot y Media Studio) on-demand, sin cache.

Cambios 1.1 -> 1.2 (aditivo, todo opcional):
- business.value_story + key_messages: el hilo conductor que cuenta cada reel.
- screens reescrito a METADATA descriptiva (sin HTML, sin URLs, sin look-guides):
  la app describe sus pantallas leyendo su propio frontend; Media Studio las
  recrea como motion graphics.
- brand.logo servido desde NUESTRO dominio (app.munify.com.ar) + brand.style.
- capabilities + entities: datos VIVOS que el sistema puede consultar (para que
  SalesBot derive tools de bots en vivo). NO publicamos `tools` todavia: los
  endpoints en vivo de Munify (api/salesbot.py) usan otra auth (X-SalesBot-Key),
  no las dos claves KSP; publicar `tools` requiere endpoints bajo X-KB-Key.

Auth: las DOS claves fijas de los generadores (bloque `generadores` de
2-APPS-ENTRADAS.json). El endpoint acepta cualquiera de las dos. Viven en GCP
Secret Manager como KB_CLAVE_SALESBOT y KB_CLAVE_MEDIASTUDIO (NUNCA en el repo).

El KB es un artefacto CURADO derivado del material comercial real de Munify.
No se inventan precios ni features.
"""
import hmac
import os

from fastapi import APIRouter, Header, HTTPException

router = APIRouter()

CONTRACT_VERSION = "1.2"
LAST_UPDATED = "2026-06-26T00:00:00Z"

KB = {
    "contract_version": CONTRACT_VERSION,
    "last_updated": LAST_UPDATED,
    "business": {
        "name": "Munify",
        "tagline": "La app que conecta al vecino con su municipio en tiempo real: reclama, tramita y paga desde el celular, con validacion biometrica oficial.",
        "description": "El vecino reclama un bache, inicia un tramite o paga una tasa desde el celular. El municipio recibe el pedido, lo deriva a la dependencia correcta, lo resuelve y notifica al vecino en tiempo real, con foto, GPS y firma digital cuando hace falta. Puertas adentro, el mismo sistema ordena la plata del municipio (ordenes de pago, tesoreria y sueldos) y reemplaza el Excel. Un unico sistema con login unico para gobernar y para atender al vecino.",
        "value_story": "Munify pone en una sola app la relacion entre el vecino y su municipio: el vecino reclama, tramita o paga una tasa desde el celular, con validacion biometrica oficial via RENAPER; el municipio recibe el pedido, lo deriva a la dependencia correcta, lo resuelve con foto antes/despues y notifica al vecino en cada paso, mientras ve en vivo la temperatura de la ciudad. Puertas adentro, el mismo sistema ordena la plata del municipio (ordenes de pago, tesoreria y sueldos) y reemplaza el Excel. Un solo login para gobernar y para atender al vecino.",
        "industry": "GovTech / gestion municipal (gobiernos locales)",
        "target_audience": "Intendentes, jefes de gabinete, secretarios de gobierno y directores de modernizacion de municipios y comunas de Argentina, desde comunas de 3.000 habitantes hasta ciudades de 200.000. Exclusivo gobiernos locales argentinos.",
        "website": "https://munify.com.ar",
    },
    "key_messages": [
        "El vinculo vecino-municipio en tiempo real, desde el celular y sin demoras",
        "Tramites con validacion biometrica oficial via RENAPER, sin pisar el municipio",
        "Los reclamos se derivan solos a la dependencia y se resuelven con foto antes y despues",
        "La plata del municipio ordenada: ordenes de pago, tesoreria y sueldos en un solo sistema, sin Excel",
        "Todo integrado con un login unico; se implementa en 1 a 2 semanas, no en 6 meses",
    ],
    "offerings": [
        {
            "id": "reclamos",
            "name": "Reclamos vecinales",
            "description": "El vecino reporta problemas (bache, alumbrado, residuos, animales sueltos, ruidos) desde la app con foto y GPS. La IA lo deriva a la dependencia correcta, el supervisor lo asigna a una cuadrilla, se resuelve con foto antes/despues y el vecino recibe notificacion en cada paso con numero de seguimiento.",
            "key_features": [
                "Clasificacion automatica del reclamo por IA",
                "Foto y geolocalizacion GPS automatica",
                "Asignacion a cuadrilla y fotos antes/despues",
                "Dashboard en vivo y mapa con hotspots",
                "Notificacion al vecino en cada paso y modo offline para cuadrillas",
            ],
            "status": "available",
        },
        {
            "id": "tramites",
            "name": "Tramites municipales online",
            "description": "El vecino inicia tramites desde el celular (habilitacion comercial, libre deuda, certificado de domicilio, licencia de conducir, monotributo municipal, bromatologia, permiso de obra), sube la documentacion, paga online y firma digital cuando corresponde, sin pisar el municipio hasta la entrega.",
            "key_features": [
                "Validacion biometrica oficial via RENAPER (DNI + selfie con prueba de vida, menos de 30s)",
                "Configuracion por tramite (documentacion, validaciones, area que aprueba, pago)",
                "Pago online y firma digital",
                "Mostrador asistido para vecinos sin app (el operador carga y valida la biometria)",
                "Pre-validacion de documentacion con IA",
            ],
            "status": "available",
        },
        {
            "id": "turnos",
            "name": "Turnos y agenda presencial",
            "description": "El vecino saca turno para gestiones que requieren presencia (mesa de entradas, licencias, bromatologia) eligiendo dependencia, dia y horario disponible. El municipio configura cupos, horarios y feriados; cada dependencia ve su agenda diaria.",
            "key_features": [
                "Reserva de turno por dependencia, dia y horario libre",
                "Configuracion de cupos, horarios y feriados por agenda",
                "Agenda diaria por dependencia para el personal",
                "Reserva tambien por bot de WhatsApp",
            ],
            "status": "available",
        },
        {
            "id": "gestion-financiera",
            "name": "Gestion Financiera (Contaduria + Tesoreria + Sueldos)",
            "description": "Reemplaza el Excel del municipio. Contaduria maneja el circuito formal de Ordenes de Pago con trazabilidad para el Tribunal de Cuentas; Tesoreria registra los movimientos reales y saldos de cada caja; Sueldos liquida al personal con monto editable y premios variables. Los tres sub-modulos comparten la misma base de datos.",
            "key_features": [
                "Orden de Pago con numero correlativo, PDF de factura adjunto y circuito pendiente -> autorizada -> pagada",
                "Al pagar una OP genera el movimiento en Tesoreria automaticamente, sin doble carga",
                "Cajas y fondos (FOFINDE, FODEMEP, coparticipacion, tesoro propio) con saldo en vivo",
                "Conciliacion bancaria: importar extracto y matchear contra movimientos de caja",
                "Sueldos con monto base editable por mes y premios variables desde catalogo",
            ],
            "status": "available",
        },
    ],
    "pricing": {
        "model": "per_capita",
        "summary": "La app es gratis para el vecino. El municipio paga por habitante, en pesos argentinos, sin permanencia. El precio exacto lo confirma un asesor del equipo segun el tamano del municipio.",
        "pricing_disclosed": False,
        "human_closes_price": True,
        "plans": [
            {
                "name": "Estandar",
                "description": "Para municipios de hasta 20.000 habitantes.",
                "target": "hasta 20.000 habitantes",
                "features": ["Reclamos vecinales", "Tramites basicos", "App vecinos iOS + Android", "Panel web", "Soporte email + WhatsApp"],
                "price": None,
            },
            {
                "name": "Express",
                "description": "El mas elegido. Para municipios de 20.000 a 100.000 habitantes.",
                "target": "20.000 a 100.000 habitantes",
                "features": ["Todo lo del plan Estandar", "Tramites ilimitados", "Multiples dependencias", "Reportes avanzados", "Chat IA para vecinos", "Soporte prioritario 24/7"],
                "price": None,
            },
            {
                "name": "Premium",
                "description": "Para municipios de mas de 100.000 habitantes.",
                "target": "mas de 100.000 habitantes",
                "features": ["Todo lo del plan Express", "Integracion a medida con sistemas legacy", "Personalizacion completa", "Usuarios ilimitados", "Capacitacion en sitio", "SLA garantizado"],
                "price": None,
            },
        ],
        "promotions": [
            "Combo 3 modulos (Reclamos + Tramites + Gestion Financiera): 3 meses gratis sin compromiso ni tarjeta de credito, precio combinado menor a la suma de los modulos sueltos, capacitacion incluida e implementacion en 1 a 2 semanas.",
        ],
    },
    "differentiators": [
        "Integral: un solo sistema con login unico para reclamos, tramites, turnos y gestion financiera; la competencia los vende por separado.",
        "App gratis para el vecino (Play Store, App Store, PWA y bot de WhatsApp); si el vecino tuviera que pagar, la adopcion seria cero.",
        "Validacion biometrica oficial via RENAPER: le da validez gubernamental al tramite, no es solo un formulario en internet.",
        "Multi-tenant real: los datos de cada municipio estan totalmente aislados, con sus colores, logo y dependencias.",
        "Multiplataforma de verdad: panel web, PWA, app nativa iOS/Android, bot de WhatsApp y modo offline para cuadrillas.",
        "Implementacion en 1 a 2 semanas, no en 6 meses; importa los datos existentes y convive con sistemas legacy via API.",
        "IA integrada sin costo extra: clasifica reclamos, detecta duplicados, sugiere asignacion y categoriza gastos.",
        "Argentino, en pesos argentinos; la competencia internacional cobra en dolares.",
    ],
    "objections": [
        {
            "objection": "Ya tenemos un sistema.",
            "response": "Munify se integra via API y no obliga a tirar nada de lo que ya tienen. Lo distinto: app gratis para el vecino, validacion RENAPER y los modulos integrados en uno solo.",
        },
        {
            "objection": "Es caro / no tenemos presupuesto.",
            "response": "Por eso ofrecemos 3 meses gratis sin tarjeta de credito. El municipio prueba con datos reales y recien decide cuando ve los resultados.",
        },
        {
            "objection": "Mi gente no es tecnologica.",
            "response": "La capacitacion esta incluida y la hacemos por videollamada con cada equipo. La curva es de un dia. Esta pensado para que lo use un empleado municipal sin saber de informatica.",
        },
        {
            "objection": "El vecino aca no usa el celular.",
            "response": "Para eso esta el Mostrador asistido: el operador de la municipalidad carga el tramite del vecino y le hace la validacion biometrica con el celular. El vecino no necesita tener la app instalada.",
        },
        {
            "objection": "Mis datos estan seguros?",
            "response": "Si. Cumplimos la Ley 25.326 de Proteccion de Datos Personales. Cada municipio tiene sus datos aislados, cifrados, en cloud, con backups diarios. La data es del municipio y la pueden exportar cuando quieran.",
        },
    ],
    "faq": [
        {
            "question": "Cuanto tarda implementar?",
            "answer": "Entre 1 y 2 semanas para municipios chicos y medianos. Si hay integraciones con sistemas legacy puede llegar a 4 a 6 semanas. La capacitacion esta incluida.",
        },
        {
            "question": "Y si despues quiero dejarlo?",
            "answer": "Sin permanencia. La data es del municipio y la exportan en cualquier momento.",
        },
        {
            "question": "La app le cuesta algo al vecino?",
            "answer": "No. La app es gratis para el vecino. Se descarga de Play Store, App Store, se instala como PWA o se usa por bot de WhatsApp. El municipio paga por habitante.",
        },
        {
            "question": "Que es la validacion RENAPER?",
            "answer": "El vecino saca foto del DNI y una selfie con prueba de vida; el sistema valida contra el Registro Nacional de las Personas que sea esa persona, en menos de 30 segundos. Eso le da validez oficial al tramite.",
        },
    ],
    "contact": {
        "website": "https://munify.com.ar",
        "email": "hola@munify.com.ar",
        "demo_url": "https://app.munify.com.ar/demo",
        "phone": None,
        "notes": "La demo es una videollamada guiada de 5 minutos que coordina un asesor humano. El asesor se contacta por el mismo canal; no se publican telefonos de vendedores.",
    },
    "do_not_say": [
        "No inventar precios ni dar montos cerrados; el precio exacto lo cierra un asesor humano segun el tamano del municipio.",
        "No afirmar que somos un sistema contable completo ni que emitimos facturacion electronica AFIP; convivimos con SIPAF/RAFAM y sistemas provinciales via API, no los reemplazamos.",
        "No presentar Sueldos como un sistema de RRHH completo: liquida base + premios, no calcula aportes/retenciones ni controla asistencia ni legajos.",
        "No presentarlo como un GIS profesional (catastro, planos urbanisticos) ni como un CRM generico; es exclusivo para gobiernos locales argentinos.",
        "No prometer integraciones especificas (SIPAF, RAFAM, etc.) sin confirmar; el equipo tecnico valida el caso puntual.",
        "No comparar directamente con competidores por nombre.",
        "Si un dato del municipio viene vacio, no inventarlo: decir que no lo tiene.",
        "No usar emojis ni jerga de marketing (revolucionario, increible, potencia, boostea).",
    ],
    "capabilities": [
        {
            "id": "estado_reclamo",
            "kind": "read",
            "label": "Estado de un reclamo",
            "description": "Dado el numero de reclamo o el DNI del vecino, devuelve el estado actual, la dependencia asignada y la ultima novedad.",
            "identifica_por": ["nro_reclamo", "dni"],
            "devuelve": ["estado", "dependencia", "fecha_actualizacion"],
            "sensible": True,
        },
        {
            "id": "estado_tramite",
            "kind": "read",
            "label": "Estado de un tramite",
            "description": "Dado el numero de tramite o el DNI del vecino, devuelve el estado actual, la dependencia que lo trabaja y la ultima novedad.",
            "identifica_por": ["nro_tramite", "dni"],
            "devuelve": ["estado", "dependencia", "fecha_actualizacion"],
            "sensible": True,
        },
        {
            "id": "turnos_disponibles",
            "kind": "read",
            "label": "Turnos disponibles",
            "description": "Dada una dependencia y un rango de fechas, devuelve los turnos presenciales libres con su horario.",
            "identifica_por": ["dependencia", "fecha"],
            "devuelve": ["fecha", "hora", "dependencia"],
            "sensible": False,
        },
        {
            "id": "reservar_turno",
            "kind": "action",
            "label": "Reservar un turno",
            "description": "Reserva un turno presencial para un vecino en una dependencia, dia y horario disponible.",
            "identifica_por": ["dependencia", "fecha", "hora", "dni"],
            "devuelve": ["nro_turno", "fecha", "hora", "dependencia"],
            "sensible": True,
        },
        {
            "id": "crear_reclamo",
            "kind": "action",
            "label": "Iniciar un reclamo",
            "description": "Crea un reclamo vecinal con descripcion y ubicacion; la IA lo clasifica y lo deriva a la dependencia correspondiente.",
            "identifica_por": ["descripcion", "direccion", "dni"],
            "devuelve": ["nro_reclamo", "categoria", "dependencia"],
            "sensible": True,
        },
    ],
    "entities": [
        {
            "name": "reclamo",
            "identifica_por": "nro_reclamo | dni",
            "campos": ["nro_reclamo", "categoria", "estado", "dependencia", "fecha_inicio", "fecha_actualizacion"],
            "sample": {
                "nro_reclamo": "REC-2026-04821",
                "categoria": "Alumbrado publico",
                "estado": "En curso",
                "dependencia": "Obras Publicas",
                "fecha_inicio": "2026-06-18",
                "fecha_actualizacion": "2026-06-24",
            },
        },
        {
            "name": "tramite",
            "identifica_por": "nro_tramite | dni",
            "campos": ["nro_tramite", "tipo", "estado", "dependencia", "fecha_inicio", "fecha_actualizacion"],
            "sample": {
                "nro_tramite": "TR-2026-00481",
                "tipo": "Habilitacion comercial",
                "estado": "En revision",
                "dependencia": "Obras Particulares",
                "fecha_inicio": "2026-06-01",
                "fecha_actualizacion": "2026-06-20",
            },
        },
        {
            "name": "turno",
            "identifica_por": "nro_turno",
            "campos": ["nro_turno", "dependencia", "fecha", "hora", "estado"],
            "sample": {
                "nro_turno": "TN-2026-01390",
                "dependencia": "Mesa de Entradas",
                "fecha": "2026-07-02",
                "hora": "10:30",
                "estado": "Reservado",
            },
        },
    ],
    "screens": [
        {
            "label": "Dashboard municipal",
            "kind": "dashboard",
            "headline": "Resumen y metricas",
            "framework": "Tailwind CSS",
            "nav": ["Dashboard", "Reclamos", "Tramites", "Mapa", "Tasas", "Pagos"],
            "components": ["fila de KPIs arriba", "grafico de reclamos por estado", "mapa con hotspots de reclamos", "lista de ultimos reclamos"],
            "layout": "Desktop. Header con titulo del municipio. Fila de tarjetas KPI (reclamos abiertos, tramites en curso, tiempo de resolucion). Debajo, dos columnas: grafico de barras por estado y mapa de calor de la ciudad.",
            "style": "Tarjetas redondeadas sobre fondo claro; acento azul institucional; badges de color por estado del reclamo.",
            "data": [
                {"kpi": "Reclamos abiertos", "valor": "128"},
                {"kpi": "Tramites en curso", "valor": "57"},
                {"kpi": "Tiempo medio de resolucion", "valor": "3,4 dias"},
                {"kpi": "Turnos hoy", "valor": "24"},
            ],
            "flow": "El intendente entra y ve de un vistazo la temperatura de la ciudad: que se reclama, donde y como viene la resolucion.",
            "route": "/gestion",
        },
        {
            "label": "Reclamos vecinales",
            "kind": "list",
            "headline": "Gestionar todos los reclamos",
            "framework": "Tailwind CSS",
            "nav": ["Dashboard", "Reclamos", "Tramites", "Mapa"],
            "components": ["buscador que crece al ancho", "combo de filtro por estado y categoria", "grilla de cards con badge de estado por fila", "boton '+ Nuevo'"],
            "layout": "Lista vertical de cards. Header con titulo + input de busqueda al 100% + boton 'Nuevo' a la derecha. Cada card: foto del reclamo a la izquierda, categoria y direccion al centro, badge de estado a la derecha y numero de seguimiento.",
            "style": "Cards redondeadas; verde=Resuelto, amarillo=En curso, gris=Recibido, rojo=Demorado.",
            "data": [
                {"categoria": "Bache en la calzada", "direccion": "Av. San Martin 1240", "estado": "En curso"},
                {"categoria": "Luminaria apagada", "direccion": "Belgrano 455", "estado": "Recibido"},
                {"categoria": "Recoleccion atrasada", "direccion": "Mitre 980", "estado": "Resuelto"},
            ],
            "flow": "El supervisor ve los reclamos del municipio, filtra por estado y los asigna a una cuadrilla.",
            "route": "/gestion/reclamos",
        },
        {
            "label": "Tramites municipales",
            "kind": "list",
            "headline": "Gestionar tramites",
            "framework": "Tailwind CSS",
            "nav": ["Dashboard", "Reclamos", "Tramites", "Mostrador"],
            "components": ["grilla de tramites con estado", "badge de validacion biometrica RENAPER", "boton 'Iniciar tramite'", "detalle con documentacion adjunta"],
            "layout": "Lista de cards por tramite. Cada card: tipo de tramite a la izquierda, vecino y dependencia al centro, badge de estado y chip 'RENAPER OK' cuando la identidad esta validada.",
            "style": "Cards redondeadas sobre fondo claro; chip verde 'RENAPER OK' cuando hay validacion biometrica; badge por estado del tramite.",
            "data": [
                {"tipo": "Habilitacion comercial", "vecino": "Comercio La Esquina", "estado": "En revision", "biometria": "RENAPER OK"},
                {"tipo": "Libre deuda", "vecino": "Juan Perez", "estado": "Aprobado", "biometria": "RENAPER OK"},
                {"tipo": "Permiso de obra", "vecino": "Constructora del Sur", "estado": "Pendiente documentacion", "biometria": "-"},
            ],
            "flow": "El operador ve los tramites en curso, revisa la documentacion y la validacion biometrica, y los aprueba o pide mas datos.",
            "route": "/gestion/tramites",
        },
        {
            "label": "Tesoreria - Pagos",
            "kind": "list",
            "headline": "Gastos cargados del municipio",
            "framework": "Tailwind CSS",
            "nav": ["Pagos", "Cajas", "Conciliacion", "Contactos"],
            "components": ["totales por caja arriba", "grilla con badge de estado por fila", "filtro por mes y caja", "boton '+ Nuevo pago'"],
            "layout": "Header con totales por caja. Lista vertical de cards de pago: beneficiario a la izquierda, monto a la derecha, badge segun estado y la caja de la que sale.",
            "style": "Cards redondeadas sobre fondo claro; verde=Pagado, amarillo=Programado, rojo=Pendiente.",
            "data": [
                {"beneficiario": "Proveedor de insumos", "monto": "$480.000", "estado": "Programado", "caja": "Tesoro propio"},
                {"beneficiario": "Servicio electrico", "monto": "$1.250.000", "estado": "Pagado", "caja": "Coparticipacion"},
                {"beneficiario": "Combustible flota", "monto": "$320.000", "estado": "Pendiente", "caja": "FOFINDE"},
            ],
            "flow": "El tesorero ve los gastos del mes y su estado de un vistazo, y registra los pagos contra la caja correcta.",
            "route": "/gestion/tesoreria",
        },
        {
            "label": "Agenda de turnos",
            "kind": "timeline",
            "headline": "Agenda diaria de turnos presenciales",
            "framework": "Tailwind CSS",
            "nav": ["Agenda", "Turnos"],
            "components": ["selector de dia y dependencia", "columna horaria con los turnos del dia", "estado de cada turno", "boton 'Atender'"],
            "layout": "Header con dia y dependencia. Columna vertical de franjas horarias; cada turno es una card con la hora, el vecino, el motivo y un badge de estado.",
            "style": "Franjas horarias separadas; turno presente resaltado en azul; verde=Atendido, gris=Pendiente, rojo=Ausente.",
            "data": [
                {"hora": "09:00", "vecino": "Maria Gomez", "motivo": "Habilitacion comercial", "estado": "Atendido"},
                {"hora": "09:30", "vecino": "Carlos Diaz", "motivo": "Libre deuda", "estado": "Pendiente"},
                {"hora": "10:00", "vecino": "Ana Lopez", "motivo": "Licencia de conducir", "estado": "Pendiente"},
            ],
            "flow": "La dependencia ve su agenda del dia y va atendiendo a los vecinos en orden de turno.",
            "route": "/gestion/agenda-turnos",
        },
    ],
    "brand": {
        "logo": {
            "primary": "https://app.munify.com.ar/brand/Munify.svg",
            "isotype": "https://app.munify.com.ar/favicon.svg",
            "svg": None,
        },
        "colors": {"primary": "#112a6c", "accent": "#18a24d", "ink": "#0E1830", "surface": "#F8F9FC"},
        "fonts": {"display": "Inter", "text": "Inter"},
        "style": {"radius": "rounded", "density": "comoda", "vibe": "institucional sobrio y cercano, govtech argentino"},
        "phonetic": "Munifai",
        "tone": "cercano y claro",
        "avoid": ["No usar tono agresivo ni alarmista", "No estetica corporativa fria ni stock generico", "No emojis"],
    },
    "extra": {},
}


def _check_key(x_kb_key: str | None) -> None:
    # Las dos claves de los generadores. strip() por si el secret quedo con \n / BOM.
    secrets = [
        os.environ.get("KB_CLAVE_SALESBOT", "").strip(),
        os.environ.get("KB_CLAVE_MEDIASTUDIO", "").strip(),
    ]
    if not any(secrets):  # ninguna configurada -> falla SOLO este endpoint
        raise HTTPException(status_code=503, detail="KB secrets not configured")
    if not x_kb_key:  # falta o vacio -> 401 (sin comparar)
        raise HTTPException(status_code=401, detail="missing X-KB-Key")
    key = x_kb_key.encode("utf-8")
    # Comparar contra TODAS acumulando (no cortar al primer match -> no filtra por timing)
    ok = False
    for s in secrets:
        if s and hmac.compare_digest(key, s.encode("utf-8")):
            ok = True
    if not ok:
        raise HTTPException(status_code=403, detail="invalid X-KB-Key")


@router.get("/knowledge-base/health")
def kb_health():
    return {
        "status": "ok",
        "contract_version": CONTRACT_VERSION,
        "kb_last_updated": LAST_UPDATED,
    }


@router.get("/knowledge-base")
def kb(x_kb_key: str | None = Header(default=None, alias="X-KB-Key")):
    _check_key(x_kb_key)
    return KB
