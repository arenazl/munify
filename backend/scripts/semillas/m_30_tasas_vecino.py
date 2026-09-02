"""Modulo 30 — TASAS + VECINO (Paraguay Limpio, muni 146 QA).

Siembra el universo tributario de los 3 vecinos demo + su espejo omnicanal
y la gamificacion, segun el inventario del grupo tasas-vecino:

  1. Partidas (tasas_partidas): 7 de los vecinos demo (match del vecino por
     titular_user_id EXPLICITO — los users QA no tienen dni cargado) + 4 de
     padron sin cuenta (solo titular_dni/titular_nombre [DEMO]).
  2. Deudas/boletas (tasas_deudas): ABL bimestral B1..B4 (B1/B2 pagadas,
     B3 vencida con recargo 10%, B4 pendiente), patente/rodados por cuota,
     multa y habilitacion one-shot. 29 boletas en total.
  3. Pagos (tasas_pagos): 1 registro confirmado por cada deuda pagada.
  4. Sesiones PayBridge (pago_sesiones): 8 approved (espejo de los pagos de
     los vecinos, con cola de imputacion viva) + 2 rejected + 1 expired.
     Mismo pago_externo_id en sesion + tasas_pagos + Deuda (cruce integro).
  5. Gamificacion: 4 recompensas via API; puntos/badges/historial calculados
     desde los reclamos REALES del muni con la formula canonica
     PUNTOS_POR_ACCION (creado 10 / resuelto 20 / primer 25 / badge 50);
     1 canje pendiente (Liz) para poblar admin/canjes-pendientes.

Escritura: recompensas via POST /gamificacion/recompensas (unico endpoint de
escritura util del grupo). El resto va tabla directa (los routers de tasas /
pagos / gamificacion no exponen POST de seed; importar-padron exige una URL
externa y no setea titular_user_id ni estados de pago) via SQLAlchemy async
con guard_qa(DATABASE_URL).

GOTCHA enums: historial_puntos.tipo_accion y badges_usuarios.tipo_badge son
SQLEnum SIN values_callable — la DB guarda los NAMES en MAYUSCULA
('RECLAMO_CREADO', 'PRIMER_PASO', ...). El resto de las tablas usa values
en minuscula ('pagada', 'approved', 'confirmado').

Idempotencia (segunda corrida = 0 creaciones):
  partidas por (municipio, tipo, identificador) — igual que importar-padron;
  deudas por (partida, periodo); pagos por (deuda, pago_externo_id);
  sesiones por PK deterministica 'PB-ASU##########'; gamificacion por
  (user, muni[, tipo_badge / recompensa]); recompensas por nombre.
Fechas SIEMPRE offsets fijos desde hoy. Cero random.
"""
from __future__ import annotations

import asyncio
import json
import os
from datetime import date, datetime, time as dtime, timedelta

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from _api import ApiQA, guard_qa

# ---------------------------------------------------------------------------
# Constantes del plan (inventario tasas-vecino)
# ---------------------------------------------------------------------------
DERLIS = "vecino@asuncion.demo.com"
LIZ = "vecino-liz@asuncion.demo.com"
RODRIGO = "vecino-rodrigo@asuncion.demo.com"

# CI paraguayas [DEMO] — espejo de las que siembra el modulo Mostrador en
# User.dni (mismos valores para que el matching por dni tambien funcione).
CI = {DERLIS: "3456789", LIZ: "4123456", RODRIGO: "2987654"}
SEMANAS_CONSECUTIVAS = {DERLIS: 2, LIZ: 1, RODRIGO: 1}

# Importes [DEMO] en guaranies, sin centavos.
MONTO = {
    "abl": 185_000,
    "patente_automotor": 450_000,
    "multa_transito": 320_000,
    "rodados": 260_000,
    "habilitacion_comercial": 550_000,
}
RECARGO_PCT = 0.10  # recargo 10% en boletas vencidas

# medio del gateway (pago_sesiones) -> medio de tasas_pagos
MEDIO_GW_A_TASAS = {
    "tarjeta": "tarjeta_credito",
    "qr": "qr",
    "efectivo_ventanilla": "efectivo_ventanilla",
}

HORA_PAGO = "14:10"       # momento del pago (naive, DB en UTC -> 11:10 ART)
HORA_CREACION = "14:00"   # created_at de la sesion = pago - 10 min
HORA_IMPUTACION = "10:00" # contaduria imputa a la manana siguiente


def _partidas_spec(vec: dict) -> list[dict]:
    """7 partidas de los vecinos demo + 4 de padron (sin titular_user_id).

    `vec` mapea email -> dict user de la API (id, nombre, apellido).
    Direcciones reales de Asuncion; lat/lng no aplican (Partida no tiene).
    """
    def _nombre(email: str) -> str:
        u = vec[email]
        return f"{u.get('nombre', '')} {u.get('apellido', '') or ''}".strip()

    return [
        # --- Derlis: abl + patente + multa ---
        dict(key="derlis_abl", tipo="abl", ident="ABL-0146-0001",
             email=DERLIS, dni=CI[DERLIS], nombre=_nombre(DERLIS),
             ref="ABL - Palma c/ Alberdi",
             objeto={"direccion": "Palma c/ Alberdi, Barrio La Catedral",
                     "superficie_m2": 120, "zona": "Centro"}),
        dict(key="derlis_pat", tipo="patente_automotor", ident="AAVB 123",
             email=DERLIS, dni=CI[DERLIS], nombre=_nombre(DERLIS),
             ref="Patente automotor - AAVB 123",
             objeto={"dominio": "AAVB 123", "marca": "Toyota",
                     "modelo": "Hilux", "anio": 2018}),
        dict(key="derlis_mul", tipo="multa_transito", ident="MUL-2026-0458",
             email=DERLIS, dni=CI[DERLIS], nombre=_nombre(DERLIS),
             ref="Multa de transito - Acta 0458/2026",
             objeto={"acta": "0458/2026",
                     "motivo": "Estacionamiento en lugar prohibido [DEMO]",
                     "lugar": "Palma esq. 14 de Mayo"}),
        # --- Liz: abl + habilitacion comercial ---
        dict(key="liz_abl", tipo="abl", ident="ABL-0146-0002",
             email=LIZ, dni=CI[LIZ], nombre=_nombre(LIZ),
             ref="ABL - Avda. San Martin 1245, Villa Morra",
             objeto={"direccion": "Avda. San Martin 1245, Villa Morra",
                     "superficie_m2": 95, "zona": "Villa Morra"}),
        dict(key="liz_hab", tipo="habilitacion_comercial", ident="HAB-2026-0112",
             email=LIZ, dni=CI[LIZ], nombre=_nombre(LIZ),
             ref="Habilitacion comercial - Despensa Ka'avo",
             objeto={"razon_social": "Despensa Ka'avo [DEMO]",
                     "rubro": "Almacen y despensa",
                     "direccion": "Avda. Eusebio Ayala 2350",
                     "ruc": "80098765-4"}),
        # --- Rodrigo: abl + rodados ---
        dict(key="rodrigo_abl", tipo="abl", ident="ABL-0146-0003",
             email=RODRIGO, dni=CI[RODRIGO], nombre=_nombre(RODRIGO),
             ref="ABL - Avda. Cacique Lambare 1930, Tacumbu",
             objeto={"direccion": "Avda. Cacique Lambare 1930, Barrio Tacumbu",
                     "superficie_m2": 140, "zona": "Tacumbu"}),
        dict(key="rodrigo_rod", tipo="rodados", ident="ROD-0146-0021",
             email=RODRIGO, dni=CI[RODRIGO], nombre=_nombre(RODRIGO),
             ref="Rodados - BBCD 456",
             objeto={"dominio": "BBCD 456", "tipo": "Motocicleta",
                     "marca": "Kenton", "modelo": "GL 125"}),
        # --- Padron sin cuenta (la lista admin se ve como padron real) ---
        dict(key="pad_abl_1", tipo="abl", ident="ABL-0146-0101",
             email=None, dni="1987654", nombre="Ramona Gonzalez [DEMO]",
             ref="ABL - Avda. Carlos Antonio Lopez 2455, Sajonia",
             objeto={"direccion": "Avda. Carlos Antonio Lopez 2455, Barrio Sajonia",
                     "superficie_m2": 180, "zona": "Sajonia"}),
        dict(key="pad_abl_2", tipo="abl", ident="ABL-0146-0102",
             email=None, dni="2456789", nombre="Blas Antonio Caceres [DEMO]",
             ref="ABL - Avda. Fernando de la Mora 3210, San Vicente",
             objeto={"direccion": "Avda. Fernando de la Mora 3210, Barrio San Vicente",
                     "superficie_m2": 110, "zona": "San Vicente"}),
        dict(key="pad_pat", tipo="patente_automotor", ident="AACF 789",
             email=None, dni="3210987", nombre="Mirta Villalba [DEMO]",
             ref="Patente automotor - AACF 789",
             objeto={"dominio": "AACF 789", "marca": "Chevrolet",
                     "modelo": "Onix", "anio": 2021}),
        dict(key="pad_rod", tipo="rodados", ident="ROD-0146-0102",
             email=None, dni="4098765", nombre="Osvaldo Acuna [DEMO]",
             ref="Rodados - CCDE 789",
             objeto={"dominio": "CCDE 789", "tipo": "Motocicleta",
                     "marca": "Star", "modelo": "Hunter 150"}),
    ]


# 8 sesiones approved — completed_at escalonado (hoy-45..hoy-1) para que
# metricas-canal arme serie temporal del mes corriente y el anterior.
# medios: tarjeta 4 / qr 2 / efectivo_ventanilla 2; canales: app 5 /
# ventanilla_asistida 2 (operador = admin) / whatsapp 1.
SESIONES_APPROVED = [
    dict(n=1, key="derlis_abl", periodo="2026-B1", off=-45, canal="app",
         medio="tarjeta", imputacion="imputado"),
    dict(n=2, key="liz_abl", periodo="2026-B1", off=-30, canal="app",
         medio="tarjeta", imputacion="imputado"),
    dict(n=3, key="rodrigo_abl", periodo="2026-B1", off=-21, canal="app",
         medio="qr", imputacion="imputado"),
    dict(n=4, key="derlis_abl", periodo="2026-B2", off=-14, canal="app",
         medio="tarjeta", imputacion="imputado"),
    dict(n=5, key="liz_abl", periodo="2026-B2", off=-9, canal="whatsapp",
         medio="tarjeta", imputacion="pendiente"),
    dict(n=6, key="rodrigo_abl", periodo="2026-B2", off=-5, canal="app",
         medio="qr", imputacion="pendiente"),
    dict(n=7, key="derlis_pat", periodo="2026-C1", off=-2,
         canal="ventanilla_asistida", medio="efectivo_ventanilla",
         imputacion="pendiente", operador=True),
    dict(n=8, key="rodrigo_rod", periodo="2026-C1", off=-1,
         canal="ventanilla_asistida", medio="efectivo_ventanilla",
         imputacion="rechazado_imputacion", operador=True),
]

# Mix de estados del historial: 2 rejected + 1 expired sobre deudas que
# quedan pendientes (sin fecha_pago en la deuda).
SESIONES_FALLIDAS = [
    dict(n=9, key="derlis_abl", periodo="2026-B4", off=-3, estado="rejected",
         medio="tarjeta", canal="app"),
    dict(n=10, key="liz_hab", periodo="2026", off=-2, estado="rejected",
         medio="tarjeta", canal="app"),
    dict(n=11, key="rodrigo_abl", periodo="2026-B4", off=-6, estado="expired",
         medio=None, canal="app"),
]

RECOMPENSAS = [
    dict(nombre="Plantin de lapacho del vivero municipal", icono="sprout",
         puntos_requeridos=150, stock=30,
         descripcion="[DEMO] Retiralo en el Vivero Municipal presentando tu codigo de canje."),
    dict(nombre="Entrada libre al Jardin Botanico y Zoologico", icono="trees",
         puntos_requeridos=250, stock=None,
         descripcion="[DEMO] Valida por una visita para dos personas."),
    dict(nombre="Descuento 10% en patente de rodados 2027", icono="car",
         puntos_requeridos=400, stock=20,
         descripcion="[DEMO] Se aplica sobre la primera cuota del ejercicio 2027."),
    dict(nombre="Kit de compostaje domiciliario", icono="recycle",
         puntos_requeridos=500, stock=10,
         descripcion="[DEMO] Compostera + guia de separacion de organicos."),
]
CANJE = dict(email=LIZ, recompensa="Plantin de lapacho del vivero municipal",
             codigo="CJ-DEMO-0001", off=-3, hora="15:00")

# Umbrales canonicos de badges por cantidad de reclamos (BADGES_CONFIG del
# backend). obtenido_en escalonado hoy-40 / hoy-25 / hoy-10.
BADGES_POR_RECLAMOS = [
    (1, "PRIMER_PASO", -40),
    (5, "VECINO_ACTIVO", -25),
    (15, "OJOS_DE_LA_CIUDAD", -10),
]
PUNTOS = {"creado": 10, "resuelto": 20, "primer": 25, "badge": 50}
ESTADOS_RESUELTOS = {"finalizado", "resuelto"}
MAX_HISTORIAL_CREADOS = 8  # RECLAMO_CREADO solo por los N mas recientes


# ---------------------------------------------------------------------------
# Helpers deterministas de fechas
# ---------------------------------------------------------------------------
def _f(hoy: date, off: int) -> date:
    return hoy + timedelta(days=off)


def _dt(hoy: date, off: int, hhmm: str = HORA_PAGO) -> datetime:
    hh, mm = (int(x) for x in hhmm.split(":"))
    return datetime.combine(hoy + timedelta(days=off), dtime(hh, mm))


def _parse_dt(valor) -> datetime | None:
    if not valor:
        return None
    try:
        return datetime.fromisoformat(str(valor).replace("Z", "+00:00")).replace(tzinfo=None)
    except ValueError:
        return None


def _periodo_label(periodo: str) -> str:
    anio, _, resto = periodo.partition("-")
    if resto.startswith("B"):
        return f"Bim {resto[1:]} {anio}"
    if resto.startswith("C"):
        return f"Cuota {resto[1:]} {anio}"
    return periodo


# ---------------------------------------------------------------------------
# Specs de deudas (por clave de partida)
# ---------------------------------------------------------------------------
def _deudas_spec() -> dict[str, list[dict]]:
    """Boletas por partida. pago: {'sesion': n} (vecino, espejo PayBridge) o
    {'padron': True, 'off': o, 'externo': id} (padron, pagada en boca externa
    5 dias antes del vencimiento). Vencidas: recargo 10%."""

    def _abl(con_sesiones: dict | None, externos: list[str] | None = None) -> list[dict]:
        base = MONTO["abl"]
        filas = [
            dict(periodo="2026-B1", estado="pagada", vto=-120, importe=base),
            dict(periodo="2026-B2", estado="pagada", vto=-60, importe=base),
            dict(periodo="2026-B3", estado="vencida", vto=-20, importe=base),
            dict(periodo="2026-B4", estado="pendiente", vto=15, importe=base),
        ]
        for fila in filas:
            if fila["estado"] != "pagada":
                continue
            if con_sesiones:
                fila["pago"] = {"sesion": con_sesiones[fila["periodo"]]}
            else:
                fila["pago"] = {"padron": True, "off": fila["vto"] - 5,
                                "externo": externos.pop(0)}
        return filas

    return {
        "derlis_abl": _abl({"2026-B1": 1, "2026-B2": 4}),
        "liz_abl": _abl({"2026-B1": 2, "2026-B2": 5}),
        "rodrigo_abl": _abl({"2026-B1": 3, "2026-B2": 6}),
        "pad_abl_1": _abl(None, ["MOCK-PAD-0001", "MOCK-PAD-0002"]),
        "pad_abl_2": _abl(None, ["MOCK-PAD-0003", "MOCK-PAD-0004"]),
        "derlis_pat": [
            dict(periodo="2026-C1", estado="pagada", vto=-95,
                 importe=MONTO["patente_automotor"], pago={"sesion": 7}),
            dict(periodo="2026-C2", estado="pendiente", vto=25,
                 importe=MONTO["patente_automotor"]),
        ],
        "pad_pat": [
            dict(periodo="2026-C1", estado="pagada", vto=-95,
                 importe=MONTO["patente_automotor"],
                 pago={"padron": True, "off": -100, "externo": "MOCK-PAD-0005"}),
            dict(periodo="2026-C2", estado="pendiente", vto=25,
                 importe=MONTO["patente_automotor"]),
        ],
        "rodrigo_rod": [
            dict(periodo="2026-C1", estado="pagada", vto=-95,
                 importe=MONTO["rodados"], pago={"sesion": 8}),
            dict(periodo="2026-C2", estado="pendiente", vto=25,
                 importe=MONTO["rodados"]),
        ],
        "pad_rod": [
            dict(periodo="2026-C2", estado="pendiente", vto=25,
                 importe=MONTO["rodados"]),
        ],
        "derlis_mul": [
            dict(periodo="2026", estado="pendiente", vto=10,
                 importe=MONTO["multa_transito"]),
        ],
        "liz_hab": [
            dict(periodo="2026", estado="pendiente", vto=20,
                 importe=MONTO["habilitacion_comercial"]),
        ],
    }


# ---------------------------------------------------------------------------
# Contexto desde la API (datos reales, nada hardcodeado que pueda derivarse)
# ---------------------------------------------------------------------------
def _contexto(api: ApiQA) -> dict:
    me = api.get("/auth/me")
    municipio_id = me.get("municipio_id")
    if not municipio_id:
        raise RuntimeError("[tasas_vecino] el admin logueado no tiene municipio_id")

    usuarios = api.listar("/users")
    por_email = {str(u.get("email", "")).lower(): u for u in usuarios}
    vecinos = {}
    for email in (DERLIS, LIZ, RODRIGO):
        u = por_email.get(email)
        if not u:
            raise RuntimeError(f"[tasas_vecino] no existe el vecino demo {email} en el muni")
        vecinos[email] = u

    tipos = {t["codigo"]: t for t in api.get("/tasas/tipos")}
    for codigo in ("abl", "patente_automotor", "multa_transito", "rodados",
                   "habilitacion_comercial"):
        if codigo not in tipos:
            raise RuntimeError(f"[tasas_vecino] falta el tipo de tasa global '{codigo}'")

    return dict(municipio_id=municipio_id, admin_id=me["id"],
                vecinos=vecinos, tipos=tipos)


def _reclamos_por_vecino(api: ApiQA, ctx: dict) -> dict[int, list[dict]]:
    """Reclamos REALES del muni agrupados por creador (para gamificacion)."""
    ids_vecinos = {ctx["vecinos"][e]["id"] for e in (DERLIS, LIZ, RODRIGO)}
    por_user: dict[int, list[dict]] = {uid: [] for uid in ids_vecinos}
    skip = 0
    while skip < 500:  # tope de seguridad
        pagina = api.get("/reclamos", params={"limit": 100, "skip": skip}) or []
        for r in pagina:
            creador_id = (r.get("creador") or {}).get("id")
            if creador_id in por_user:
                por_user[creador_id].append(dict(
                    id=r["id"],
                    estado=str(r.get("estado") or ""),
                    created_at=_parse_dt(r.get("created_at")),
                    fecha_resolucion=_parse_dt(r.get("fecha_resolucion")),
                ))
        if len(pagina) < 100:
            break
        skip += 100
    return por_user


def _asegurar_recompensas(api: ApiQA, cont: dict) -> dict[str, int]:
    """4 recompensas [DEMO] via API (unico endpoint de escritura del grupo)."""
    ids: dict[str, int] = {}
    for spec in RECOMPENSAS:
        obj, creado = api.asegurar(
            "/gamificacion/recompensas", "nombre", spec["nombre"],
            "/gamificacion/recompensas", spec,
        )
        ids[spec["nombre"]] = obj.get("id")
        cont["creados" if creado else "existentes"] += 1
    return ids


# ---------------------------------------------------------------------------
# Siembra tabla-directa (SQLAlchemy async + guard_qa)
# ---------------------------------------------------------------------------
async def _sembrar_db(ctx: dict, reclamos: dict, recompensa_ids: dict,
                      hoy: date, cont: dict) -> dict:
    url = os.environ.get("DATABASE_URL", "")
    if not url:
        raise RuntimeError(
            "[tasas_vecino] falta DATABASE_URL (QA) en el entorno — la parte "
            "tabla-directa (partidas/deudas/pagos/sesiones/gamificacion) la necesita."
        )
    # El backend pasa DATABASE_URL directo a create_async_engine; normalizamos
    # solo el driver por si el entorno trae la URL sync.
    url = guard_qa(url)
    for prefijo in ("mysql://", "mysql+pymysql://"):
        if url.startswith(prefijo):
            url = "mysql+aiomysql://" + url[len(prefijo):]

    detalle = dict(partidas=[0, 0], deudas=[0, 0], pagos=[0, 0],
                   sesiones=[0, 0], gamificacion=[0, 0])

    def _suma(rubro: str, creado: bool):
        detalle[rubro][0 if creado else 1] += 1
        cont["creados" if creado else "existentes"] += 1

    engine = create_async_engine(url, pool_pre_ping=True)
    try:
        async with engine.begin() as conn:
            partida_ids = await _sembrar_partidas(conn, ctx, hoy, _suma)
            deuda_info = await _sembrar_deudas(conn, ctx, partida_ids, hoy, _suma)
            await _sembrar_pagos(conn, ctx, deuda_info, hoy, _suma)
            await _sembrar_sesiones(conn, ctx, deuda_info, hoy, _suma)
            await _sembrar_gamificacion(conn, ctx, reclamos, recompensa_ids,
                                        hoy, _suma)
    finally:
        await engine.dispose()
    return detalle


async def _uno(conn, sql: str, **params):
    return (await conn.execute(text(sql), params)).first()


async def _sembrar_partidas(conn, ctx, hoy, suma) -> dict[str, int]:
    ids: dict[str, int] = {}
    for spec in _partidas_spec(ctx["vecinos"]):
        tipo_id = ctx["tipos"][spec["tipo"]]["id"]
        user_id = ctx["vecinos"][spec["email"]]["id"] if spec["email"] else None
        fila = await _uno(
            conn,
            "SELECT id, titular_user_id FROM tasas_partidas "
            "WHERE municipio_id = :m AND tipo_tasa_id = :t AND identificador = :i",
            m=ctx["municipio_id"], t=tipo_id, i=spec["ident"],
        )
        if fila:
            ids[spec["key"]] = fila.id
            # Healing: si existia sin titular vinculado, vincular al vecino.
            if user_id and fila.titular_user_id is None:
                await conn.execute(
                    text("UPDATE tasas_partidas SET titular_user_id = :u, "
                         "titular_dni = :d WHERE id = :id"),
                    {"u": user_id, "d": spec["dni"], "id": fila.id},
                )
            suma("partidas", False)
            continue
        await conn.execute(
            text(
                "INSERT INTO tasas_partidas (municipio_id, tipo_tasa_id, "
                "identificador, titular_user_id, titular_dni, titular_nombre, "
                "objeto, estado) VALUES (:m, :t, :i, :u, :d, :n, :o, 'activa')"
            ),
            {"m": ctx["municipio_id"], "t": tipo_id, "i": spec["ident"],
             "u": user_id, "d": spec["dni"], "n": spec["nombre"],
             "o": json.dumps(spec["objeto"])},
        )
        fila = await _uno(
            conn,
            "SELECT id FROM tasas_partidas WHERE municipio_id = :m "
            "AND tipo_tasa_id = :t AND identificador = :i",
            m=ctx["municipio_id"], t=tipo_id, i=spec["ident"],
        )
        ids[spec["key"]] = fila.id
        suma("partidas", True)
    return ids


def _sesiones_por_ref() -> dict[tuple[str, str], dict]:
    return {(s["key"], s["periodo"]): s for s in SESIONES_APPROVED}


async def _sembrar_deudas(conn, ctx, partida_ids, hoy, suma) -> dict:
    """Crea las boletas y devuelve {(key, periodo): info} para pagos/sesiones."""
    sesiones = _sesiones_por_ref()
    info: dict[tuple[str, str], dict] = {}
    for key, filas in _deudas_spec().items():
        partida_id = partida_ids[key]
        for d in filas:
            importe = d["importe"]
            recargo = int(importe * RECARGO_PCT) if d["estado"] == "vencida" else 0
            total = importe + recargo
            pago = d.get("pago")
            if pago and "sesion" in pago:
                sesion = sesiones[(key, d["periodo"])]
                fecha_pago = _dt(hoy, sesion["off"])
                externo = f"MOCK-ASU-{sesion['n']:04d}"
            elif pago:
                fecha_pago = _dt(hoy, pago["off"])
                externo = pago["externo"]
            else:
                fecha_pago, externo = None, None

            fila = await _uno(
                conn,
                "SELECT id FROM tasas_deudas WHERE partida_id = :p AND periodo = :per",
                p=partida_id, per=d["periodo"],
            )
            if fila:
                deuda_id, creado = fila.id, False
            else:
                await conn.execute(
                    text(
                        "INSERT INTO tasas_deudas (partida_id, periodo, importe, "
                        "importe_original, recargo, descuento, fecha_emision, "
                        "fecha_vencimiento, estado, fecha_pago, pago_externo_id) "
                        "VALUES (:p, :per, :imp, :orig, :rec, 0, :emi, :vto, "
                        ":est, :fp, :ext)"
                    ),
                    {"p": partida_id, "per": d["periodo"], "imp": total,
                     "orig": importe, "rec": recargo,
                     "emi": _f(hoy, d["vto"] - 30), "vto": _f(hoy, d["vto"]),
                     "est": d["estado"], "fp": fecha_pago, "ext": externo},
                )
                fila = await _uno(
                    conn,
                    "SELECT id FROM tasas_deudas WHERE partida_id = :p AND periodo = :per",
                    p=partida_id, per=d["periodo"],
                )
                deuda_id, creado = fila.id, True
            suma("deudas", creado)
            info[(key, d["periodo"])] = dict(
                id=deuda_id, importe=total, estado=d["estado"], pago=pago,
                fecha_pago=fecha_pago, externo=externo,
            )
    return info


async def _sembrar_pagos(conn, ctx, deuda_info, hoy, suma):
    """1 registro tasas_pagos confirmado por cada deuda pagada."""
    sesiones = _sesiones_por_ref()
    for (key, periodo), d in deuda_info.items():
        if d["estado"] != "pagada":
            continue
        pago = d["pago"]
        if "sesion" in pago:
            sesion = sesiones[(key, periodo)]
            medio = MEDIO_GW_A_TASAS[sesion["medio"]]
            email = _email_de_key(key)
            usuario_id = ctx["vecinos"][email]["id"]
            operador_id = ctx["admin_id"] if sesion.get("operador") else None
        else:
            medio, usuario_id, operador_id = "rapipago", None, None

        existe = await _uno(
            conn,
            "SELECT id FROM tasas_pagos WHERE deuda_id = :d AND pago_externo_id = :e",
            d=d["id"], e=d["externo"],
        )
        if existe:
            suma("pagos", False)
            continue
        await conn.execute(
            text(
                "INSERT INTO tasas_pagos (deuda_id, usuario_id, monto, medio, "
                "fecha, pago_externo_id, estado, registrado_por_operador_id) "
                "VALUES (:d, :u, :m, :medio, :f, :e, 'confirmado', :op)"
            ),
            {"d": d["id"], "u": usuario_id, "m": d["importe"], "medio": medio,
             "f": d["fecha_pago"], "e": d["externo"], "op": operador_id},
        )
        suma("pagos", True)


def _email_de_key(key: str) -> str:
    if key.startswith("derlis"):
        return DERLIS
    if key.startswith("liz"):
        return LIZ
    return RODRIGO


async def _sembrar_sesiones(conn, ctx, deuda_info, hoy, suma):
    """8 approved (espejo de pagos, cola de imputacion) + 2 rejected + 1 expired."""
    for s in SESIONES_APPROVED:
        d = deuda_info[(s["key"], s["periodo"])]
        completado = _dt(hoy, s["off"])
        imputado = s["imputacion"] == "imputado"
        await _insertar_sesion(
            conn, suma,
            sid=f"PB-ASU{s['n']:010d}",
            deuda_id=d["id"], municipio_id=ctx["municipio_id"],
            vecino_id=ctx["vecinos"][_email_de_key(s["key"])]["id"],
            concepto=_concepto(s["key"], s["periodo"]),
            monto=d["importe"], estado="approved", medio=s["medio"],
            external_id=f"MOCK-ASU-{s['n']:04d}",
            created=_dt(hoy, s["off"], HORA_CREACION), expires=None,
            completed=completado, cut=f"CUT-B{s['n']:05d}",
            imputacion=s["imputacion"],
            imputado_at=(completado + timedelta(days=1)).replace(
                hour=int(HORA_IMPUTACION[:2]), minute=int(HORA_IMPUTACION[3:])
            ) if imputado else None,
            imputado_por=ctx["admin_id"] if imputado else None,
            imputacion_obs=("[DEMO] Partida no ubicada en el sistema tributario"
                            if s["imputacion"] == "rechazado_imputacion" else None),
            imputacion_ref=f"RAFAM-2026-{s['n']:03d}" if imputado else None,
            canal=s["canal"],
            operador_id=ctx["admin_id"] if s.get("operador") else None,
        )
    for s in SESIONES_FALLIDAS:
        d = deuda_info[(s["key"], s["periodo"])]
        creado_en = _dt(hoy, s["off"], "10:00")
        es_expirada = s["estado"] == "expired"
        await _insertar_sesion(
            conn, suma,
            sid=f"PB-ASU{s['n']:010d}",
            deuda_id=d["id"], municipio_id=ctx["municipio_id"],
            vecino_id=ctx["vecinos"][_email_de_key(s["key"])]["id"],
            concepto=_concepto(s["key"], s["periodo"]),
            monto=d["importe"], estado=s["estado"], medio=s["medio"],
            external_id=None, created=creado_en,
            expires=creado_en + timedelta(minutes=30) if es_expirada else None,
            completed=None if es_expirada else creado_en + timedelta(minutes=5),
            cut=None, imputacion=None, imputado_at=None, imputado_por=None,
            imputacion_obs=None, imputacion_ref=None,
            canal=s["canal"], operador_id=None,
        )


_CONCEPTOS: dict[str, str] = {}


def _concepto(key: str, periodo: str) -> str:
    if not _CONCEPTOS:
        _CONCEPTOS.update({p["key"]: p["ref"] for p in _partidas_spec(
            {DERLIS: {}, LIZ: {}, RODRIGO: {}})})
    return f"{_CONCEPTOS[key]} - {_periodo_label(periodo)}"


async def _insertar_sesion(conn, suma, *, sid, deuda_id, municipio_id, vecino_id,
                           concepto, monto, estado, medio, external_id, created,
                           expires, completed, cut, imputacion, imputado_at,
                           imputado_por, imputacion_obs, imputacion_ref, canal,
                           operador_id):
    existe = await _uno(conn, "SELECT id FROM pago_sesiones WHERE id = :id", id=sid)
    if existe:
        suma("sesiones", False)
        return
    await conn.execute(
        text(
            "INSERT INTO pago_sesiones (id, deuda_id, solicitud_id, municipio_id, "
            "vecino_user_id, concepto, monto, estado, medio_pago, provider, "
            "external_id, created_at, expires_at, completed_at, codigo_cut_qr, "
            "imputacion_estado, imputado_at, imputado_por_usuario_id, "
            "imputacion_observacion, imputacion_referencia_externa, canal, "
            "operador_user_id) VALUES (:id, :deuda, NULL, :muni, :vecino, "
            ":concepto, :monto, :estado, :medio, 'mock', :ext, :created, "
            ":expires, :completed, :cut, :imp, :imp_at, :imp_por, :imp_obs, "
            ":imp_ref, :canal, :operador)"
        ),
        {"id": sid, "deuda": deuda_id, "muni": municipio_id, "vecino": vecino_id,
         "concepto": concepto, "monto": monto, "estado": estado, "medio": medio,
         "ext": external_id, "created": created, "expires": expires,
         "completed": completed, "cut": cut, "imp": imputacion,
         "imp_at": imputado_at, "imp_por": imputado_por, "imp_obs": imputacion_obs,
         "imp_ref": imputacion_ref, "canal": canal, "operador": operador_id},
    )
    suma("sesiones", True)


# ---------------------------------------------------------------------------
# Gamificacion — calibrada contra los reclamos REALES del muni
# ---------------------------------------------------------------------------
async def _sembrar_gamificacion(conn, ctx, reclamos, recompensa_ids, hoy, suma):
    muni = ctx["municipio_id"]
    for email in (DERLIS, LIZ, RODRIGO):
        uid = ctx["vecinos"][email]["id"]
        mis = sorted(reclamos.get(uid, []),
                     key=lambda r: r["created_at"] or datetime.min)
        totales = len(mis)
        resueltos = [r for r in mis if r["estado"] in ESTADOS_RESUELTOS]
        badges = [(nombre, off) for umbral, nombre, off in BADGES_POR_RECLAMOS
                  if totales >= umbral]

        # Formula canonica PUNTOS_POR_ACCION — los numeros CIERRAN contra las
        # stats visibles (reclamos_totales/resueltos reales).
        base = (totales * PUNTOS["creado"] + len(resueltos) * PUNTOS["resuelto"]
                + (PUNTOS["primer"] if totales else 0)
                + len(badges) * PUNTOS["badge"])

        mes_actual = (hoy.year, hoy.month)
        def _es_mes(dt_):  # noqa: E306
            return dt_ is not None and (dt_.year, dt_.month) == mes_actual
        puntos_mes = (
            sum(PUNTOS["creado"] for r in mis if _es_mes(r["created_at"]))
            + sum(PUNTOS["resuelto"] for r in resueltos if _es_mes(r["fecha_resolucion"]))
            + sum(PUNTOS["badge"] for _, off in badges if _es_mes(_dt(hoy, off)))
        )
        ultima = max((r["created_at"] for r in mis if r["created_at"]),
                     default=_dt(hoy, -1))

        # puntos_usuarios (1 fila por vecino) — con el total BRUTO; el canje
        # descuenta al crearse (misma mecanica que el endpoint /canjear).
        fila = await _uno(
            conn,
            "SELECT id FROM puntos_usuarios WHERE user_id = :u AND municipio_id = :m",
            u=uid, m=muni,
        )
        if fila:
            suma("gamificacion", False)
        else:
            await conn.execute(
                text(
                    "INSERT INTO puntos_usuarios (user_id, municipio_id, "
                    "puntos_totales, puntos_mes_actual, reclamos_totales, "
                    "reclamos_resueltos, reclamos_con_foto, reclamos_con_ubicacion, "
                    "calificaciones_dadas, semanas_consecutivas, ultima_actividad) "
                    "VALUES (:u, :m, :pt, :pm, :rt, :rr, 0, 0, 0, :sem, :ult)"
                ),
                {"u": uid, "m": muni, "pt": base, "pm": puntos_mes,
                 "rt": totales, "rr": len(resueltos),
                 "sem": SEMANAS_CONSECUTIVAS[email], "ult": ultima},
            )
            suma("gamificacion", True)

        # badges_usuarios — GOTCHA: la DB guarda el NAME del enum ('PRIMER_PASO').
        for nombre, off in badges:
            existe = await _uno(
                conn,
                "SELECT id FROM badges_usuarios WHERE user_id = :u "
                "AND municipio_id = :m AND tipo_badge = :b",
                u=uid, m=muni, b=nombre,
            )
            if existe:
                suma("gamificacion", False)
                continue
            await conn.execute(
                text("INSERT INTO badges_usuarios (user_id, municipio_id, "
                     "tipo_badge, obtenido_en) VALUES (:u, :m, :b, :f)"),
                {"u": uid, "m": muni, "b": nombre, "f": _dt(hoy, off, "12:00")},
            )
            suma("gamificacion", True)

        # historial_puntos — enlazado a reclamos reales; si el vecino ya tiene
        # historial en el muni, no se re-siembra (idempotencia por bloque).
        existentes = await _uno(
            conn,
            "SELECT COUNT(*) AS n FROM historial_puntos "
            "WHERE user_id = :u AND municipio_id = :m",
            u=uid, m=muni,
        )
        if existentes.n:
            suma("gamificacion", False)
        else:
            filas: list[tuple] = []
            if mis:
                primero = mis[0]
                filas.append(("PRIMER_RECLAMO", PUNTOS["primer"],
                              "Primer reclamo", primero["id"],
                              primero["created_at"] or _dt(hoy, -40)))
            for r in resueltos:
                filas.append(("RECLAMO_RESUELTO", PUNTOS["resuelto"],
                              f"Reclamo #{r['id']} resuelto", r["id"],
                              r["fecha_resolucion"] or r["created_at"] or _dt(hoy, -7)))
            for r in mis[-MAX_HISTORIAL_CREADOS:]:
                filas.append(("RECLAMO_CREADO", PUNTOS["creado"],
                              f"Reclamo #{r['id']} creado", r["id"],
                              r["created_at"] or _dt(hoy, -7)))
            for nombre, off in badges:
                filas.append(("BADGE_OBTENIDO", PUNTOS["badge"],
                              f"Badge obtenido: {nombre.replace('_', ' ').title()}",
                              None, _dt(hoy, off, "12:00")))
            for tipo, puntos, desc, reclamo_id, fecha in filas:
                await conn.execute(
                    text("INSERT INTO historial_puntos (user_id, municipio_id, "
                         "tipo_accion, puntos, descripcion, reclamo_id, created_at) "
                         "VALUES (:u, :m, :t, :p, :d, :r, :f)"),
                    {"u": uid, "m": muni, "t": tipo, "p": puntos, "d": desc,
                     "r": reclamo_id, "f": fecha},
                )
                suma("gamificacion", True)

    # Canje pendiente de Liz (pobla admin/canjes-pendientes) — misma mecanica
    # que POST /recompensas/canjear: crea el canje, descuenta puntos y stock.
    rec_id = recompensa_ids.get(CANJE["recompensa"])
    if rec_id:
        uid = ctx["vecinos"][CANJE["email"]]["id"]
        existe = await _uno(
            conn,
            "SELECT id FROM recompensas_canjeadas WHERE user_id = :u "
            "AND recompensa_id = :r AND municipio_id = :m",
            u=uid, r=rec_id, m=muni,
        )
        if existe:
            suma("gamificacion", False)
        else:
            puntos_req = next(r["puntos_requeridos"] for r in RECOMPENSAS
                              if r["nombre"] == CANJE["recompensa"])
            await conn.execute(
                text("INSERT INTO recompensas_canjeadas (user_id, recompensa_id, "
                     "municipio_id, puntos_gastados, estado, codigo_canje, "
                     "canjeado_en) VALUES (:u, :r, :m, :p, 'pendiente', :c, :f)"),
                {"u": uid, "r": rec_id, "m": muni, "p": puntos_req,
                 "c": CANJE["codigo"], "f": _dt(hoy, CANJE["off"], CANJE["hora"])},
            )
            await conn.execute(
                text("UPDATE puntos_usuarios SET puntos_totales = "
                     "puntos_totales - :p WHERE user_id = :u AND municipio_id = :m"),
                {"p": puntos_req, "u": uid, "m": muni},
            )
            await conn.execute(
                text("UPDATE recompensas_disponibles SET stock = stock - 1 "
                     "WHERE id = :r AND stock IS NOT NULL"),
                {"r": rec_id},
            )
            suma("gamificacion", True)


# ---------------------------------------------------------------------------
# Entry point del runner
# ---------------------------------------------------------------------------
def sembrar(api: ApiQA, hoy: date) -> dict:
    cont = {"creados": 0, "existentes": 0}
    ctx = _contexto(api)
    recompensa_ids = _asegurar_recompensas(api, cont)
    reclamos = _reclamos_por_vecino(api, ctx)
    detalle = asyncio.run(_sembrar_db(ctx, reclamos, recompensa_ids, hoy, cont))
    resumen = " ".join(f"{k}=+{v[0]}/~{v[1]}" for k, v in detalle.items())
    print(f"[tasas_vecino] {resumen} recompensas(api) incluidas en el total")
    print(f"[tasas_vecino] creados={cont['creados']} existentes={cont['existentes']}")
    return cont
