"""Knowledge Share Protocol (KSP) v1.1

GET /api/knowledge-base        -> KB completo de Munify (auth X-KB-Key)
GET /api/knowledge-base/health -> estado y version del contrato (sin auth)

Consumidores: SalesBot (KB_CLAVE_SALESBOT) y Media Studio (KB_CLAVE_MEDIASTUDIO).
Ambas claves estan en GCP Secret Manager. El endpoint acepta cualquiera de las dos.
"""
import hmac
import os

from fastapi import APIRouter, Header, HTTPException

router = APIRouter()

CONTRACT_VERSION = "1.1"

KB = {
    "contract_version": CONTRACT_VERSION,
    "last_updated": "2026-06-25T00:00:00Z",
    "business": {
        "name": "Munify",
        "tagline": "Plataforma argentina que conecta a los vecinos con su municipio en una sola app, con validacion biometrica oficial y trazabilidad total de cada gestion.",
        "description": "El vecino reclama un bache, inicia un tramite o paga una tasa desde el celular. El municipio recibe el pedido, lo asigna a la dependencia correcta, lo resuelve y notifica al vecino, todo en tiempo real, con foto, GPS y firma digital cuando hace falta. Es un solo sistema con login unico para todo el municipio.",
        "industry": "Gestion municipal (govtech)",
        "target_audience": "Intendentes, jefes de gabinete, secretarios de gobierno y directores de modernizacion de municipios y comunas de Argentina.",
        "website": "https://munify.com.ar",
    },
    "offerings": [
        {
            "id": "reclamos",
            "name": "Reclamos vecinales",
            "description": "El vecino reporta problemas (bache, alumbrado, residuos, animales sueltos) desde la app con foto y ubicacion GPS. El municipio lo recibe, la IA lo deriva a la dependencia correcta, lo asigna a una cuadrilla y el vecino ve en tiempo real cuando se resuelve.",
            "key_features": [
                "Foto y geolocalizacion automatica del reclamo",
                "Derivacion automatica por IA a la dependencia correcta",
                "Numero de seguimiento y notificacion al vecino en cada paso",
                "Mapa con hotspots y dashboard en vivo para el municipio",
            ],
            "status": "available",
        },
        {
            "id": "tramites",
            "name": "Tramites municipales online",
            "description": "El vecino inicia tramites desde el celular (habilitaciones comerciales, libre deuda, licencia de conducir, certificados, monotributo municipal). Sube la documentacion, paga online si corresponde y recibe el resultado sin pisar el municipio.",
            "key_features": [
                "Validacion biometrica oficial via RENAPER (foto de DNI + selfie con prueba de vida)",
                "Pago online y firma digital cuando corresponde",
                "Mostrador asistido para vecinos que no usan la app",
                "Configuracion por tramite (documentacion, validaciones, area que aprueba)",
            ],
            "status": "available",
        },
        {
            "id": "gestion-financiera",
            "name": "Gestion Financiera (Contaduria + Tesoreria + Sueldos)",
            "description": "Reemplaza el Excel del municipio. Contaduria maneja el circuito formal de Ordenes de Pago con trazabilidad para el Tribunal de Cuentas; Tesoreria registra los movimientos reales y saldos de cada caja; Sueldos gestiona los pagos al personal con monto editable y premios variables.",
            "key_features": [
                "Orden de Pago con numero correlativo, PDF de factura adjunto y circuito pendiente -> autorizada -> pagada",
                "Movimiento automatico en Tesoreria al pagar una OP, sin doble carga",
                "Cajas y fondos (FOFINDE, FODEMEP, coparticipacion, tesoro propio) con saldo en vivo",
                "Mapa de contactos georreferenciado con drill-down de gastos por proveedor",
                "Sueldos con monto editable por mes y premios variables desde catalogo",
            ],
            "status": "available",
        },
    ],
    "pricing": {
        "model": "per_capita",
        "summary": "La app es gratis para el vecino. El municipio paga por habitante. El precio exacto lo confirma un asesor del equipo despues de la primera conversacion, segun el tamano del municipio.",
        "pricing_disclosed": False,
        "human_closes_price": True,
        "plans": [
            {
                "name": "Estandar",
                "description": "Para municipios de hasta 20.000 habitantes.",
                "target": "hasta 20.000 habitantes",
                "features": [
                    "Reclamos vecinales online",
                    "Tramites basicos",
                    "App vecinos iOS + Android",
                    "Panel web",
                    "Soporte email + WhatsApp",
                ],
                "price": None,
            },
            {
                "name": "Express",
                "description": "El mas elegido. Para municipios de 20.000 a 100.000 habitantes.",
                "target": "20.000 a 100.000 habitantes",
                "features": [
                    "Todo lo del plan Estandar",
                    "Tramites ilimitados",
                    "Multiples dependencias",
                    "Reportes avanzados",
                    "Chat IA para vecinos",
                    "Soporte prioritario 24/7",
                ],
                "price": None,
            },
            {
                "name": "Premium",
                "description": "Para municipios de mas de 100.000 habitantes.",
                "target": "mas de 100.000 habitantes",
                "features": [
                    "Todo lo del plan Express",
                    "Integracion a medida con sistemas legacy",
                    "Personalizacion completa",
                    "Usuarios ilimitados",
                    "Capacitacion en sitio",
                    "SLA garantizado",
                ],
                "price": None,
            },
        ],
        "promotions": [
            "Combo 3 modulos (Reclamos + Tramites + Gestion Financiera): 3 meses gratis sin tarjeta de credito, precio combinado menor a la suma de los modulos sueltos, capacitacion incluida e implementacion en 1 a 2 semanas."
        ],
    },
    "differentiators": [
        "Integral: un solo sistema con login unico para reclamos, tramites y gestion financiera.",
        "App gratis para el vecino; el municipio paga por habitante. Si el vecino tuviera que pagar, la adopcion seria cero.",
        "Validacion biometrica oficial via RENAPER: les da validez gubernamental a los tramites, no es solo un formulario en internet.",
        "Multi-tenant real: los datos de cada municipio estan totalmente aislados de los de otros municipios.",
        "Multiplataforma: panel web, PWA, app nativa iOS/Android, bot de WhatsApp y modo offline para cuadrillas.",
        "Implementacion en 1 a 2 semanas, no en 6 meses.",
        "IA integrada sin costo extra: clasifica reclamos, detecta duplicados, sugiere asignacion, categoriza gastos.",
        "Argentino, en pesos argentinos, con planes al tamano del municipio.",
    ],
    "objections": [
        {
            "objection": "Ya tenemos un sistema.",
            "response": "Lo que hacemos distinto es: app gratis para el vecino, validacion con RENAPER, y los 3 modulos integrados en uno solo. Nos integramos con lo que ya tienen, no obligamos a tirar nada.",
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
            "response": "Para eso esta el Mostrador asistido: el operador de la municipalidad carga los tramites del vecino y le hace la validacion biometrica con el celular. El vecino no necesita tener la app instalada.",
        },
        {
            "objection": "Mis datos estan seguros?",
            "response": "Si. Cumplimos la Ley argentina de Proteccion de Datos Personales. Los datos del municipio estan aislados de los de otros municipios, cifrados, con backups diarios. La data es del municipio y la pueden exportar cuando quieran.",
        },
    ],
    "faq": [
        {
            "question": "Cuanto tarda implementar?",
            "answer": "Entre 1 y 2 semanas para municipios chicos y medianos. Si son grandes con integraciones a sistemas viejos, puede llegar a 4 a 6 semanas. La capacitacion esta incluida.",
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
        "notes": "El contacto humano se asigna automaticamente. El cliente no recibe un numero externo: el asesor le escribe por el mismo chat de WhatsApp.",
    },
    "do_not_say": [
        "No inventar precios ni dar montos cerrados; el precio exacto lo cierra un asesor humano segun el tamano del municipio.",
        "No prometer integraciones especificas con sistemas provinciales (SIPAF, RAFAM, etc.) sin confirmar; decir que nos integramos con la mayoria via API y que el equipo tecnico confirma el caso puntual.",
        "No afirmar que somos un sistema contable completo ni que emitimos facturacion electronica AFIP. Convivimos con el sistema contable, no lo reemplazamos.",
        "No comparar directamente con competidores por nombre.",
        "No prometer funcionalidades que no esten en este knowledge (seguimiento personalizado, descuentos puntuales, features a medida).",
        "No entregar numeros de WhatsApp ni telefonos de vendedores especificos; el asesor escribe por el mismo chat.",
        "No usar emojis ni jerga de marketing (revolucionario, increible, potencia, boostea).",
    ],
    "screens": [
        {
            "label": "Home del vecino (reclamos y tramites)",
            "url": "https://look-guides.netlify.app/apps/munify/home.html",
            "route": "/",
        },
        {
            "label": "Nuevo reclamo con foto y mapa",
            "url": "https://look-guides.netlify.app/apps/munify/reclamo.html",
            "route": "/reclamos/nuevo",
        },
        {
            "label": "Panel del municipio (dashboard)",
            "url": "https://look-guides.netlify.app/apps/munify/panel.html",
            "route": "/panel",
        },
    ],
    "brand": {
        "logo": {
            "primary": "https://look-guides.netlify.app/apps/munify/logo.svg",
            "isotype": "https://look-guides.netlify.app/apps/munify/iso.svg",
        },
        "colors": {
            "primary": "#103070",
            "accent": "#C8A24E",
            "ink": "#0E1830",
            "surface": "#F1EAD8",
        },
        "fonts": {"display": "Fraunces", "text": "Inter"},
        "phonetic": "Munifai",
        "tone": "cercano",
        "avoid": [
            "No usar rojos de alarma ni tono agresivo",
            "No estetica corporativa fria ni stock generico",
        ],
    },
}


def _check_key(x_kb_key: str | None) -> None:
    secret_salesbot = os.environ.get("KB_CLAVE_SALESBOT", "")
    secret_mediastudio = os.environ.get("KB_CLAVE_MEDIASTUDIO", "")
    if not secret_salesbot and not secret_mediastudio:
        raise HTTPException(status_code=503, detail="KB secrets not configured")
    if not x_kb_key:
        raise HTTPException(status_code=401, detail="missing X-KB-Key")
    # Comparacion constant-time acumulada contra ambas claves (no cortamos al primer match)
    match_salesbot = hmac.compare_digest(x_kb_key, secret_salesbot) if secret_salesbot else False
    match_mediastudio = hmac.compare_digest(x_kb_key, secret_mediastudio) if secret_mediastudio else False
    if not (match_salesbot or match_mediastudio):
        raise HTTPException(status_code=403, detail="invalid X-KB-Key")


@router.get("/knowledge-base/health")
def kb_health():
    return {
        "status": "ok",
        "contract_version": CONTRACT_VERSION,
        "kb_last_updated": KB["last_updated"],
    }


@router.get("/knowledge-base")
def kb(x_kb_key: str | None = Header(default=None, alias="X-KB-Key")):
    _check_key(x_kb_key)
    return KB
