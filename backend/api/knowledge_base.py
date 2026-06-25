"""Knowledge Share Protocol (KSP) v1.1 — endpoint productor de Munify.

GET /api/knowledge-base        -> KB comercial completo de Munify (auth X-KB-Key)
GET /api/knowledge-base/health -> estado y version del contrato (sin auth)

Contrato: d:\\Code\\base-compartida\\3-PROTOCOLO-COMPLETO.md (seguir a rajatabla).
Auth: las DOS claves fijas de los generadores (bloque `generadores` de
2-APPS-ENTRADAS.json). El endpoint acepta cualquiera de las dos. Viven en GCP
Secret Manager como KB_CLAVE_SALESBOT y KB_CLAVE_MEDIASTUDIO (NUNCA en el repo).

El KB es un artefacto CURADO derivado del material comercial real de Munify
(docs/sales/PRODUCTO_MUNIFY.md). No se inventan precios ni features.
"""
import hmac
import os

from fastapi import APIRouter, Header, HTTPException

router = APIRouter()

CONTRACT_VERSION = "1.1"
LAST_UPDATED = "2026-06-25T00:00:00Z"

KB = {
    "contract_version": CONTRACT_VERSION,
    "last_updated": LAST_UPDATED,
    "business": {
        "name": "Munify",
        "tagline": "Plataforma argentina que conecta a los vecinos con su municipio en una sola app, con validacion biometrica oficial y trazabilidad total de cada gestion.",
        "description": "El vecino reclama un bache, inicia un tramite o paga una tasa desde el celular. El municipio recibe el pedido, lo asigna a la dependencia correcta, lo resuelve y notifica al vecino, en tiempo real, con foto, GPS y firma digital cuando hace falta. Es un unico sistema con login unico para todo el municipio.",
        "industry": "GovTech / gestion municipal (gobiernos locales)",
        "target_audience": "Intendentes, jefes de gabinete, secretarios de gobierno y directores de modernizacion de municipios y comunas de Argentina, desde comunas de 3.000 habitantes hasta ciudades de 200.000. Exclusivo gobiernos locales argentinos.",
        "website": "https://munify.com.ar",
    },
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
            "id": "gestion-financiera",
            "name": "Gestion Financiera (Contaduria + Tesoreria + Sueldos)",
            "description": "Reemplaza el Excel del municipio. Contaduria maneja el circuito formal de Ordenes de Pago con trazabilidad para el Tribunal de Cuentas; Tesoreria registra los movimientos reales y saldos de cada caja; Sueldos liquida al personal con monto editable y premios variables. Los tres sub-modulos comparten la misma base de datos.",
            "key_features": [
                "Orden de Pago con numero correlativo, PDF de factura adjunto y circuito pendiente -> autorizada -> pagada",
                "Al pagar una OP genera el movimiento en Tesoreria automaticamente, sin doble carga",
                "Cajas y fondos (FOFINDE, FODEMEP, coparticipacion, tesoro propio) con saldo en vivo",
                "Mapa de contactos georreferenciado con drill-down de gastos por proveedor",
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
        "Integral: un solo sistema con login unico para reclamos, tramites y gestion financiera; la competencia los vende por separado.",
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
            "response": "Munify se integra via API y no obliga a tirar nada de lo que ya tienen. Lo distinto: app gratis para el vecino, validacion RENAPER y los tres modulos integrados en uno solo.",
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
            "response": "Si. Cumplimos la Ley 25.326 de Proteccion de Datos Personales. Cada municipio tiene sus datos aislados, cifrados, en cloud argentino, con backups diarios. La data es del municipio y la pueden exportar cuando quieran.",
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
    "screens": [
        {"label": "Dashboard municipal", "url": "https://look-guides.netlify.app/apps/munify/dashboard.html", "route": "/gestion"},
        {"label": "Reclamos vecinales", "url": "https://look-guides.netlify.app/apps/munify/reclamos.html", "route": "/gestion/reclamos"},
        {"label": "Tramites municipales", "url": "https://look-guides.netlify.app/apps/munify/tramites.html", "route": "/gestion/tramites"},
        {"label": "Tesoreria", "url": "https://look-guides.netlify.app/apps/munify/tesoreria.html", "route": "/gestion/tesoreria"},
        {"label": "Contaduria - Ordenes de pago", "url": "https://look-guides.netlify.app/apps/munify/contaduria.html", "route": "/gestion/contaduria/ordenes-pago"},
        {"label": "Sueldos y liquidaciones", "url": "https://look-guides.netlify.app/apps/munify/sueldos.html", "route": "/gestion/tesoreria/agenda"},
        {"label": "Turnos y agenda", "url": "https://look-guides.netlify.app/apps/munify/turnos.html", "route": "/gestion/agenda-turnos"},
    ],
    "brand": {
        "logo": {
            "primary": "https://look-guides.netlify.app/apps/munify/logo.svg",
            "isotype": "https://look-guides.netlify.app/apps/munify/iso.svg",
        },
        "colors": {"primary": "#112a6c", "accent": "#18a24d", "ink": "#0E1830", "surface": "#F8F9FC"},
        "fonts": {"display": "Inter", "text": "Inter"},
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
