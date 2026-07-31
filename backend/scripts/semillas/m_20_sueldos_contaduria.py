"""Semilla integral — grupo SUELDOS + CONTADURIA (QA Paraguay Limpio).

Implementa los planes del inventario para los modulos:

  1. soporte-transversal-cajas    -> 3 cajas (TESORO/FOSUE/COPA) + ingresos de
                                     coparticipacion (via API).
  2. sueldos-liquidaciones        -> 4 tipos de empleado, 14 empleados + 2
                                     profesionales + 1 concejal (contactos),
                                     5 conceptos de liquidacion, 17 pagos
                                     programados y el historial ejecutado
                                     (2 liquidaciones por sueldo: mes anterior
                                     y mes actual) — todo via API; los Gastos,
                                     cuotas y egresos de caja los genera el
                                     endpoint /agenda/{id}/ejecutar.
  3. contaduria-retenciones       -> 4 retenciones del catalogo (via API).
  4. contaduria-ordenes-pago      -> 6 proveedores/contratistas + 12 OPs con el
                                     workflow real (crear -> autorizar ->
                                     devengar/pagar/anular). Las 4 pagadas
                                     generan Gasto + movimiento de caja solas.
  5. proveedores-pago             -> mercadopago y gire activos (PUT API);
                                     metadata_importada de gire via SQL (no
                                     existe endpoint deterministico: el import
                                     real usa counts random + SSE).
  6. gestion-pagos-cola-imputacion-> 24 pago_sesiones + 1 exportacion de
                                     imputacion. SQL directo con guard_qa():
                                     no hay endpoint de escritura que permita
                                     backdatear created_at/completed_at.

Decisiones documentadas:
  - deuda_id de las pago_sesiones queda NULL con concepto descriptivo (el plan
    lo permite). Vincular deudas pagadas duplicaria la sesion approved que ya
    crea el grupo TASAS sobre esa misma deuda.
  - ContactoCreate no expone cuit/condicion_iva: el RUC de los proveedores va
    en el campo `dni` y la condicion IVA en `notas` (marcado [DEMO]).
  - fecha_autorizacion/fecha_pago de la OP las setea el backend con utcnow()
    (no backdateables por API); las fechas contables que SI se backdatean son
    fecha_emision (payload) y la fecha del Gasto/movimiento (payload de pagar).
  - NO se siembran tesoreria_premios (feature deshabilitada, lo dice el plan).

Idempotente: claves naturales (codigo de caja, nombre+apellido de contacto,
concepto de OP, (pago_programado, fecha) del historial, PK deterministica de
sesion). Segunda corrida = 0 creaciones. Fechas SIEMPRE relativas a hoy.
"""
from __future__ import annotations

import json
import os
from calendar import monthrange
from datetime import date, datetime, time as dtime, timedelta

from _api import ApiError, dias

SEED_MARK = "m_20_sueldos_contaduria"
ADMIN_EMAIL = "admin@asuncion.demo.com"


# ---------------------------------------------------------------------------
# Helpers de fechas deterministicas (meses relativos a hoy)
# ---------------------------------------------------------------------------
def _mes_offset(d: date, meses: int) -> tuple[int, int]:
    total = d.year * 12 + (d.month - 1) + meses
    return total // 12, total % 12 + 1


def _dia_mes(d: date, meses: int, dia: int) -> date:
    """Dia fijo `dia` del mes de `d` corrido `meses` (clampeado al fin de mes)."""
    y, m = _mes_offset(d, meses)
    return date(y, m, min(dia, monthrange(y, m)[1]))


def _dia1(d: date, meses: int = 0) -> date:
    return _dia_mes(d, meses, 1)


def _proximo_dia_mes(d: date, dia: int) -> date:
    """Proxima fecha con dia-del-mes `dia` que sea >= d."""
    cand = _dia_mes(d, 0, dia)
    return cand if cand >= d else _dia_mes(d, 1, dia)


def _proximo_dow(d: date, dow: int) -> date:
    """Proximo dia de semana (0=lunes..6=domingo) >= d."""
    return d + timedelta(days=(dow - d.weekday()) % 7)


def _utc(d: date, hh: int, mm: int = 0) -> datetime:
    """Datetime naive en UTC para una hora fija ART (ART = UTC-3)."""
    return datetime.combine(d, dtime(hh, mm)) + timedelta(hours=3)


MESES_ES = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
]


# ---------------------------------------------------------------------------
# Datos [DEMO] deterministicos (verosimil paraguayo; sin coordenadas)
# ---------------------------------------------------------------------------
CAJAS = [
    # (nombre, codigo, saldo_inicial Gs, color, icono, orden)
    ("Tesoreria central", "TESORO", 850_000_000, "#2563eb", "Landmark", 0),
    ("Fondo de sueldos", "FOSUE", 420_000_000, "#16a34a", "Wallet", 1),
    ("Royalties / Coparticipacion", "COPA", 260_000_000, "#f59e0b", "Coins", 2),
]

# (codigo caja, monto mes actual, monto mes anterior) — ingresos dia 2
INGRESOS_CAJA = {
    "TESORO": (120_000_000, 115_000_000),
    "FOSUE": (60_000_000, 58_000_000),
    "COPA": (45_000_000, 44_000_000),
}
CONCEPTO_INGRESO = "Transferencia coparticipacion [DEMO]"

TIPOS_EMPLEADO = [
    # (nombre, color, icono, orden)
    ("Planta permanente", "#2563eb", "BadgeCheck", 0),
    ("Contratado", "#16a34a", "FileText", 1),
    ("Jornalero", "#f59e0b", "Hammer", 2),
    ("Personal superior", "#8b5cf6", "Star", 3),
]

DIRECCIONES_ASU = [
    "Avda. Mcal. Lopez, Barrio Recoleta",
    "Avda. Eusebio Ayala, Barrio San Vicente",
    "Palma esq. 14 de Mayo, Centro",
    "Barrio Sajonia",
    "Avda. Espana, Barrio Villa Morra",
    "Barrio Tacumbu",
    "Avda. Artigas, Barrio Trinidad",
]

# (nombre, apellido, tipo_empleado, sueldo mensual Gs)
EMPLEADOS = [
    ("Ramona", "Villalba", "Planta permanente", 4_200_000),
    ("Blas", "Cabañas", "Planta permanente", 3_900_000),
    ("Fátima", "Benítez", "Contratado", 3_100_000),
    ("Osvaldo", "Acuña", "Jornalero", 2_400_000),
    ("Mirta", "Agüero", "Planta permanente", 3_600_000),
    ("Celso", "Giménez", "Contratado", 2_800_000),
    ("Lourdes", "Ortellado", "Planta permanente", 4_500_000),
    ("Aníbal", "Paredes", "Jornalero", 2_500_000),
    ("Perla", "Sanabria", "Contratado", 3_000_000),
    ("Milciades", "Rotela", "Planta permanente", 3_400_000),
    ("Graciela", "Espínola", "Planta permanente", 4_000_000),
    ("Néstor", "Ayala", "Jornalero", 2_600_000),
    ("Dionisia", "Franco", "Personal superior", 6_500_000),
    ("Arnaldo", "Cantero", "Personal superior", 5_800_000),
]

# (nombre, apellido, subtipo, honorario mensual Gs)
PROFESIONALES = [
    ("Silvia", "Jara", "contador", 3_200_000),
    ("Marcelo", "Duarte", "abogado", 2_900_000),
]

CONCEJAL = ("Rosalino", "Cardozo")

# (razon social, tipo, RUC formato PY, condicion IVA)
PROVEEDORES = [
    ("Ferreteria Guarani S.R.L.", "proveedor", "80012345-6", "IVA General"),
    ("Corralon Ita Enramada", "proveedor", "80023456-7", "IVA General"),
    ("Combustibles del Este S.A.", "proveedor", "80034567-8", "IVA General"),
    ("Seguros La Consolidada S.A.", "proveedor", "80045678-9", "IVA General"),
    ("Consultora Jara y Asociados", "contratista", "80056789-0", "IVA Simplificado"),
    ("Limpieza Integral Ñanduti", "contratista", "80067890-1", "IVA Simplificado"),
]

CONCEPTOS_LIQUIDACION = [
    # (nombre, frecuencia_default, dia_del_mes_default, dia_semana_default, color, icono, orden)
    ("Sueldo mensual", "mensual", 1, None, "#2563eb", "Banknote", 0),
    ("Presentismo", "semanal", None, 4, "#16a34a", "CalendarCheck", 1),
    ("Horas extra", "mensual", 15, None, "#f59e0b", "Clock", 2),
    ("Honorario profesional", "mensual", 5, None, "#8b5cf6", "Briefcase", 3),
    ("Dieta concejal", "mensual", 10, None, "#ef4444", "Landmark", 4),
]

MONTO_PRESENTISMO = 350_000

RETENCIONES = [
    # (nombre, porcentaje, color, orden)
    ("Retencion IVA", 10.0, "#2563eb", 1),
    ("Retencion Renta IRE", 3.0, "#16a34a", 2),
    ("Tasa municipal de fiscalizacion", 1.5, "#f59e0b", 3),
    ("Garantia de contrato", 5.0, "#8b5cf6", 4),
]

FIRMANTES = {
    "contaduria_nombre": "C.P. Nidia Sanabria [DEMO]",
    "secretario_nombre": "Lic. Ruben Ferreira [DEMO]",
    "intendente_nombre": "Abg. Cristino Espinoza [DEMO]",
}

# Ordenes de pago. proveedor = indice en PROVEEDORES; None = destino dependencia
# (la que matchee 'obras'). target: pagada | autorizada | devengado | pendiente | anulada.
ORDENES_PAGO = [
    dict(concepto="Materiales electricos alumbrado publico", proveedor=0,
         monto=18_500_000, emision=-55, pago=-50, target="pagada",
         retenciones=["Retencion IVA", "Retencion Renta IRE"],
         nro_factura="001-001-0000118"),
    dict(concepto="Provision de cemento y aridos para bacheo", proveedor=1,
         monto=24_800_000, emision=-40, pago=-35, target="pagada",
         retenciones=["Retencion IVA"], nro_factura="001-001-0000131"),
    dict(concepto="Combustible flota municipal", proveedor=2,
         monto=32_400_000, emision=-25, pago=-20, target="pagada",
         retenciones=[], nro_factura="001-002-0000027"),
    dict(concepto="Servicio de limpieza edificio municipal", proveedor=5,
         monto=9_600_000, emision=-12, pago=-5, target="pagada",
         retenciones=[], nro_factura="001-001-0000342"),
    dict(concepto="Seguro anual flota de vehiculos", proveedor=3,
         monto=48_000_000, emision=-10, vencimiento=20, target="devengado",
         retenciones=["Retencion IVA", "Garantia de contrato"],
         nro_factura="002-001-0000866"),
    dict(concepto="Auditoria contable ejercicio 2025", proveedor=4,
         monto=21_000_000, emision=-8, vencimiento=15, target="autorizada",
         retenciones=[], nro_factura="001-001-0000054"),
    dict(concepto="Herramientas para cuadrilla de obras", proveedor=0,
         monto=7_400_000, emision=-6, vencimiento=10, target="autorizada",
         retenciones=[], nro_factura="001-001-0000125"),
    dict(concepto="Poliza de caucion obra Costanera Norte", proveedor=3,
         monto=15_200_000, emision=-20, vencimiento=-4, target="pendiente",
         retenciones=[], nro_factura="002-001-0000871"),
    dict(concepto="Repuestos para maquinaria vial", proveedor=1,
         monto=11_900_000, emision=-3, vencimiento=3, target="pendiente",
         retenciones=["Retencion IVA", "Tasa municipal de fiscalizacion"],
         nro_factura="001-001-0000139"),
    dict(concepto="Lubricantes y filtros del corralon municipal", proveedor=2,
         monto=3_500_000, emision=-2, vencimiento=7, target="pendiente",
         retenciones=[], nro_factura="001-002-0000031"),
    dict(concepto="Utiles y papeleria Direccion de Obras", proveedor=None,
         monto=4_800_000, emision=-1, target="pendiente",
         retenciones=[], nro_factura=None),
    dict(concepto="Servicio de limpieza edificio municipal - duplicada", proveedor=5,
         monto=9_600_000, emision=-11, target="anulada",
         retenciones=[], nro_factura="001-001-0000342",
         motivo="Factura duplicada [DEMO]"),
]

# Montos [DEMO] de las sesiones de pago (guaranies, rango 85.000-1.200.000)
MONTOS_SESION = [185_000, 320_000, 450_000, 260_000, 550_000, 95_000, 780_000, 1_200_000]


def _conceptos_sesion(hoy: date) -> list[str]:
    mes = MESES_ES[hoy.month - 1]
    return [
        f"Tasa de recoleccion - {mes} {hoy.year}",
        f"Impuesto inmobiliario - Cuota {hoy.month}",
        f"Patente de rodados {hoy.year}",
        "Certificado de vida y residencia",
    ]


# ---------------------------------------------------------------------------
# Contadores
# ---------------------------------------------------------------------------
def _track(cnt: dict, creado: bool):
    cnt["creados" if creado else "existentes"] += 1


def _print_bloque(nombre: str, cnt: dict):
    print(f"[{nombre}] creados={cnt['creados']} existentes={cnt['existentes']}")


# ---------------------------------------------------------------------------
# 0. Contexto (usuarios reales del muni via API — nada hardcodeado)
# ---------------------------------------------------------------------------
def _cargar_contexto(api) -> dict:
    admin = api.buscar("/users", "email", ADMIN_EMAIL)
    if not admin:
        raise RuntimeError(f"No se encontro el admin {ADMIN_EMAIL} en /users")
    usuarios = api.listar("/users")
    vecinos = sorted(
        (u for u in usuarios if "vecino" in str(u.get("rol", "")).lower()),
        key=lambda u: u["id"],
    )
    if not vecinos:
        raise RuntimeError("No hay vecinos demo en /users — corre primero el alta demo")
    deps = api.listar("/dependencias/municipio")
    dep_obras = next(
        (d for d in deps if "obras" in str(d.get("nombre", "")).lower()),
        deps[0] if deps else None,
    )
    if not dep_obras:
        raise RuntimeError("El muni no tiene dependencias — no puedo destinar la OP a dependencia")
    return {
        "muni_id": admin["municipio_id"],
        "admin_id": admin["id"],
        "vecino_ids": [u["id"] for u in vecinos],
        "dep_obras_id": dep_obras["id"],
    }


# ---------------------------------------------------------------------------
# 1. soporte-transversal-cajas
# ---------------------------------------------------------------------------
def _sembrar_cajas(api, hoy: date, ctx: dict) -> dict:
    cnt = {"creados": 0, "existentes": 0}
    ctx["cajas"] = {}
    for nombre, codigo, saldo, color, icono, orden in CAJAS:
        caja, creado = api.asegurar(
            "/tesoreria/cajas", "codigo", codigo,
            "/tesoreria/cajas",
            {
                "nombre": f"{nombre} [DEMO]",
                "codigo": codigo,
                "descripcion": "Caja sembrada por el kit de semillas [DEMO]",
                "color": color,
                "icono": icono,
                "saldo_inicial": saldo,
                "fecha_apertura": _dia1(hoy, -6).isoformat(),
                "orden": orden,
            },
        )
        _track(cnt, creado)
        ctx["cajas"][codigo] = caja

    # Ingresos de coparticipacion: dia 2 del mes actual y del anterior
    for codigo, (monto_actual, monto_anterior) in INGRESOS_CAJA.items():
        caja_id = ctx["cajas"][codigo]["id"]
        existentes = api.listar(f"/tesoreria/cajas/{caja_id}/movimientos", params={"tipo": "ingreso"})
        ya = {(str(m.get("fecha")), m.get("concepto")) for m in existentes}
        for meses, monto in ((0, monto_actual), (-1, monto_anterior)):
            fecha = _dia_mes(hoy, meses, 2)
            if fecha > hoy:  # dia 1 del mes: el ingreso del dia 2 aun no ocurrio
                fecha = _dia1(hoy, 0)
            clave = (fecha.isoformat(), CONCEPTO_INGRESO)
            if clave in ya:
                _track(cnt, False)
                continue
            api.post("/tesoreria/cajas/movimientos", json={
                "caja_id": caja_id,
                "tipo": "ingreso",
                "monto": monto,
                "fecha": fecha.isoformat(),
                "concepto": CONCEPTO_INGRESO,
                "descripcion": "Acreditacion Ministerio de Hacienda [DEMO]",
            })
            _track(cnt, True)
    _print_bloque("cajas", cnt)
    return cnt


# ---------------------------------------------------------------------------
# 2. sueldos-liquidaciones: tipos de empleado + contactos + conceptos
# ---------------------------------------------------------------------------
def _sembrar_tipos_empleado(api, ctx: dict) -> dict:
    cnt = {"creados": 0, "existentes": 0}
    ctx["tipos_empleado"] = {}
    for nombre, color, icono, orden in TIPOS_EMPLEADO:
        tipo, creado = api.asegurar(
            "/tesoreria/tipos-empleado", "nombre", nombre,
            "/tesoreria/tipos-empleado",
            {"nombre": nombre, "descripcion": "[DEMO]", "color": color, "icono": icono, "orden": orden},
        )
        _track(cnt, creado)
        ctx["tipos_empleado"][nombre] = tipo["id"]
    _print_bloque("tipos-empleado", cnt)
    return cnt


def _indice_contactos(api) -> dict:
    """Index (nombre, apellido) -> contacto de todos los contactos activos."""
    todos = api.listar("/tesoreria/contactos", params={"limit": 5000})
    return {
        (str(c.get("nombre", "")).strip().lower(), str(c.get("apellido") or "").strip().lower()): c
        for c in todos
    }


def _asegurar_contacto(api, indice: dict, cnt: dict, payload: dict) -> dict:
    clave = (payload["nombre"].strip().lower(), str(payload.get("apellido") or "").strip().lower())
    if clave in indice:
        _track(cnt, False)
        return indice[clave]
    creado = api.post("/tesoreria/contactos", json=payload)
    indice[clave] = creado
    _track(cnt, True)
    return creado


def _sembrar_contactos(api, ctx: dict) -> dict:
    cnt = {"creados": 0, "existentes": 0}
    indice = _indice_contactos(api)
    ctx["empleados"] = []
    ctx["profesionales"] = []
    ctx["proveedores"] = []

    for i, (nombre, apellido, tipo_emp, _sueldo) in enumerate(EMPLEADOS):
        ci = f"{3_400_000 + i * 13_579:,}".replace(",", ".")
        n_tel = 100_200 + i
        alias = (
            f"{apellido.lower().replace(' ', '')[:10]}{nombre[0].lower()}.bc"
            if i % 2 == 0 else f"619-{n_tel}-7"
        )
        c = _asegurar_contacto(api, indice, cnt, {
            "nombre": nombre,
            "apellido": apellido,
            "dni": ci,
            "telefono": f"+595 981 {n_tel // 1000:03d} {n_tel % 1000:03d}",
            "direccion": DIRECCIONES_ASU[i % len(DIRECCIONES_ASU)],
            "alias_pago": alias,
            "tipo": "empleado",
            "tipo_empleado_id": ctx["tipos_empleado"][tipo_emp],
            "notas": "[DEMO] Contacto de demostracion",
        })
        ctx["empleados"].append(c)

    for j, (nombre, apellido, subtipo, _hono) in enumerate(PROFESIONALES):
        c = _asegurar_contacto(api, indice, cnt, {
            "nombre": nombre,
            "apellido": apellido,
            "dni": f"{1_850_000 + j * 24_681:,}".replace(",", "."),
            "telefono": f"+595 981 {300 + j:03d} 400",
            "direccion": DIRECCIONES_ASU[(j + 2) % len(DIRECCIONES_ASU)],
            "tipo": "profesional",
            "subtipo": subtipo,
            "notas": "[DEMO] Contacto de demostracion",
        })
        ctx["profesionales"].append(c)

    _asegurar_contacto(api, indice, cnt, {
        "nombre": CONCEJAL[0],
        "apellido": CONCEJAL[1],
        "dni": "2.145.678",
        "telefono": "+595 981 305 500",
        "direccion": DIRECCIONES_ASU[0],
        "tipo": "concejal",
        "notas": "[DEMO] Contacto de demostracion",
    })

    for k, (razon, tipo, ruc, iva) in enumerate(PROVEEDORES):
        c = _asegurar_contacto(api, indice, cnt, {
            "nombre": razon,
            "apellido": None,
            "dni": ruc,  # RUC: ContactoCreate no expone cuit — queda en dni
            "telefono": f"+595 21 {550 + k:03d} 100",
            "direccion": DIRECCIONES_ASU[k % len(DIRECCIONES_ASU)],
            "tipo": tipo,
            "notas": f"[DEMO] RUC {ruc} · {iva}",
        })
        ctx["proveedores"].append(c)

    _print_bloque("contactos", cnt)
    return cnt


def _sembrar_conceptos_liquidacion(api, ctx: dict) -> dict:
    cnt = {"creados": 0, "existentes": 0}
    for nombre, frec, dia_mes, dia_sem, color, icono, orden in CONCEPTOS_LIQUIDACION:
        payload = {
            "nombre": nombre,
            "descripcion": "[DEMO]",
            "color": color,
            "icono": icono,
            "orden": orden,
            "frecuencia_default": frec,
        }
        if dia_mes is not None:
            payload["dia_del_mes_default"] = dia_mes
        if dia_sem is not None:
            payload["dia_semana_default"] = dia_sem
        _obj, creado = api.asegurar(
            "/tesoreria/conceptos-liquidacion", "nombre", nombre,
            "/tesoreria/conceptos-liquidacion", payload,
        )
        _track(cnt, creado)
    _print_bloque("conceptos-liquidacion", cnt)
    return cnt


# ---------------------------------------------------------------------------
# 3. sueldos-liquidaciones: 17 pagos programados + historial ejecutado
# ---------------------------------------------------------------------------
def _spec_pagos(ctx: dict, hoy: date) -> list[dict]:
    """Especificacion deterministica de los 17 pagos programados.

    `esperado` = proximo_pago final que tiene que quedar tras la semilla.
    """
    fecha_ini = _dia1(hoy, -6)
    caja_fosue = ctx["cajas"]["FOSUE"]["id"]
    specs = []
    for contacto, (_n, _a, _t, sueldo) in zip(ctx["empleados"], EMPLEADOS):
        specs.append(dict(
            contacto_id=contacto["id"], concepto="Sueldo mensual", monto=sueldo,
            frecuencia="mensual", dia_del_mes=1, dia_semana=None,
            fecha_inicio=fecha_ini, caja_id=caja_fosue,
            esperado=_dia1(hoy, 1), historial=True,
        ))
    for contacto, (_n, _a, _s, hono) in zip(ctx["profesionales"], PROFESIONALES):
        specs.append(dict(
            contacto_id=contacto["id"], concepto="Honorario profesional", monto=hono,
            frecuencia="mensual", dia_del_mes=5, dia_semana=None,
            fecha_inicio=fecha_ini, caja_id=caja_fosue,
            esperado=_proximo_dia_mes(hoy, 5), historial=False,
        ))
    # Presentismo semanal (viernes) a un jornalero: Osvaldo Acuña (indice 3)
    specs.append(dict(
        contacto_id=ctx["empleados"][3]["id"], concepto="Presentismo", monto=MONTO_PRESENTISMO,
        frecuencia="semanal", dia_del_mes=1, dia_semana=4,
        fecha_inicio=fecha_ini, caja_id=caja_fosue,
        esperado=_proximo_dow(hoy, 4), historial=False,
    ))
    return specs


def _sembrar_pagos_programados(api, hoy: date, ctx: dict) -> dict:
    cnt = {"creados": 0, "existentes": 0}
    existentes = api.listar("/tesoreria/agenda", params={"activo": True})
    indice = {(p.get("contacto_id"), p.get("concepto")): p for p in existentes}

    ctx["pagos_programados"] = []
    for spec in _spec_pagos(ctx, hoy):
        clave = (spec["contacto_id"], spec["concepto"])
        if clave in indice:
            _track(cnt, False)
            ctx["pagos_programados"].append((indice[clave], spec))
            continue
        payload = {
            "contacto_id": spec["contacto_id"],
            "caja_id": spec["caja_id"],
            "concepto": spec["concepto"],
            "monto_pesos": spec["monto"],
            "forma_pago": "transferencia",
            "frecuencia": spec["frecuencia"],
            "dia_del_mes": spec["dia_del_mes"],
            "fecha_inicio": spec["fecha_inicio"].isoformat(),
            "notas": "[DEMO] Liquidacion sembrada por el kit de semillas",
        }
        if spec["dia_semana"] is not None:
            payload["dia_semana"] = spec["dia_semana"]
        pp = api.post("/tesoreria/agenda", json=payload)
        _track(cnt, True)
        ctx["pagos_programados"].append((pp, spec))
    _print_bloque("pagos-programados", cnt)
    return cnt


def _sembrar_historial_sueldos(api, hoy: date, ctx: dict) -> dict:
    """Ejecuta cada sueldo mensual para el mes anterior y el actual (dia 1).

    El endpoint /ejecutar crea el Gasto + cuota pagada + egreso de caja y
    setea ultimo_pago. Despues se normaliza proximo_pago al valor esperado.
    """
    cnt = {"creados": 0, "existentes": 0}
    historial = api.listar(
        "/tesoreria/agenda/historial",
        params={"desde": dias(-120), "limit": 2000},
    )
    ya_ejecutados = {(g.get("pago_programado_id"), str(g.get("fecha"))) for g in historial}

    for pp, spec in ctx["pagos_programados"]:
        if not spec["historial"]:
            continue
        for meses in (-1, 0):  # cronologico: mes anterior primero
            fecha = _dia1(hoy, meses)
            if (pp["id"], fecha.isoformat()) in ya_ejecutados:
                _track(cnt, False)
                continue
            try:
                api.post(f"/tesoreria/agenda/{pp['id']}/ejecutar", json={
                    "fecha_pago": fecha.isoformat(),
                    "premios_aplicados": [],
                })
                _track(cnt, True)
            except ApiError as e:
                if e.status == 409:  # periodo ya pagado (claim previo)
                    _track(cnt, False)
                else:
                    raise

    # Normalizar proximo_pago (solo si quedo en el pasado / atrasado)
    ajustes = 0
    vivos = {p["id"]: p for p in api.listar("/tesoreria/agenda", params={"activo": True})}
    for pp, spec in ctx["pagos_programados"]:
        actual = vivos.get(pp["id"])
        if not actual:
            continue
        proximo = date.fromisoformat(str(actual["proximo_pago"]))
        if proximo < spec["esperado"]:
            api.put(f"/tesoreria/agenda/{pp['id']}", json={
                "proximo_pago": spec["esperado"].isoformat(),
            })
            ajustes += 1
    print(f"[historial-sueldos] creados={cnt['creados']} existentes={cnt['existentes']} ajustes_proximo_pago={ajustes}")
    return cnt


# ---------------------------------------------------------------------------
# 4. contaduria-retenciones
# ---------------------------------------------------------------------------
def _sembrar_retenciones(api, ctx: dict) -> dict:
    cnt = {"creados": 0, "existentes": 0}
    ctx["retenciones"] = {}
    for nombre, porcentaje, color, orden in RETENCIONES:
        ret, creado = api.asegurar(
            "/contaduria/retenciones", "nombre", nombre,
            "/contaduria/retenciones",
            {
                "nombre": nombre,
                "descripcion": "[DEMO] Retencion de demostracion",
                "porcentaje": porcentaje,
                "color": color,
                "orden": orden,
            },
        )
        _track(cnt, creado)
        ctx["retenciones"][nombre] = ret
    _print_bloque("retenciones", cnt)
    return cnt


# ---------------------------------------------------------------------------
# 5. contaduria-ordenes-pago (workflow completo via API)
# ---------------------------------------------------------------------------
def _snapshot_retenciones(ctx: dict, nombres: list[str], monto: int) -> list[dict]:
    out = []
    for nombre in nombres:
        ret = ctx["retenciones"][nombre]
        pct = float(ret["porcentaje"])
        out.append({
            "id": ret["id"],
            "nombre": nombre,
            "porcentaje": pct,
            "monto": int(monto * pct / 100),
        })
    return out


def _avanzar_op(api, op: dict, spec: dict, hoy: date, caja_id: int):
    """Lleva la OP desde su estado actual al estado objetivo (resumible)."""
    op_id = op["id"]
    base = f"/contaduria/ordenes-pago/{op_id}"
    estado = str(op.get("estado", "pendiente"))
    target = spec["target"]

    if target == "anulada":
        if estado in ("pendiente", "autorizada"):
            api.post(f"{base}/anular", json={"motivo": spec["motivo"]})
        return
    if target == "pendiente":
        return
    if estado == "pendiente":
        op = api.post(f"{base}/autorizar")
        estado = str(op.get("estado"))
    if target == "devengado":
        if estado == "autorizada" and str(op.get("etapa_contable")) != "devengado":
            api.post(f"{base}/etapa", json={"etapa": "devengado"})
        return
    if target == "pagada" and estado == "autorizada":
        api.post(f"{base}/pagar", json={
            "caja_id": caja_id,
            "fecha_pago": dias(spec["pago"]),
            "forma_pago": "transferencia",
        })


def _sembrar_ordenes_pago(api, hoy: date, ctx: dict) -> dict:
    cnt = {"creados": 0, "existentes": 0}
    caja_tesoro = ctx["cajas"]["TESORO"]["id"]
    existentes = api.listar("/contaduria/ordenes-pago", params={"limit": 5000})
    indice = {str(o.get("concepto", "")).strip().lower(): o for o in existentes}

    for spec in ORDENES_PAGO:
        clave = spec["concepto"].strip().lower()
        op = indice.get(clave)
        if op is None:
            payload = {
                "concepto": spec["concepto"],
                "descripcion": "[DEMO] OP sembrada por el kit de semillas",
                "monto_pesos": spec["monto"],
                "caja_id": caja_tesoro,
                "fecha_emision": dias(spec["emision"]),
                "retenciones": _snapshot_retenciones(ctx, spec["retenciones"], spec["monto"]),
                **FIRMANTES,
            }
            if spec.get("vencimiento") is not None:
                payload["fecha_vencimiento"] = dias(spec["vencimiento"])
            if spec.get("nro_factura"):
                payload["nro_factura"] = spec["nro_factura"]
            if spec["proveedor"] is not None:
                payload["destino_tipo"] = "contacto"
                payload["destino_contacto_id"] = ctx["proveedores"][spec["proveedor"]]["id"]
            else:
                payload["destino_tipo"] = "dependencia"
                payload["destino_dependencia_id"] = ctx["dep_obras_id"]
            op = api.post("/contaduria/ordenes-pago", json=payload)
            _track(cnt, True)
        else:
            _track(cnt, False)
        _avanzar_op(api, op, spec, hoy, caja_tesoro)
    _print_bloque("ordenes-pago", cnt)
    return cnt


# ---------------------------------------------------------------------------
# 6. proveedores-pago (config por muni)
# ---------------------------------------------------------------------------
def _sembrar_proveedores_pago(api) -> dict:
    cnt = {"creados": 0, "existentes": 0}
    filas = {p["proveedor"]: p for p in api.listar("/proveedores-pago")}
    objetivos = {
        "mercadopago": {"boton_pago": True, "qr": True},
        "gire": {"boton_pago": True, "rapipago": True, "adhesion_debito": False},
    }
    for proveedor, productos in objetivos.items():
        fila = filas.get(proveedor, {})
        if fila.get("activo"):
            _track(cnt, False)
            continue
        api.put(f"/proveedores-pago/{proveedor}", json={
            "activo": True,
            "productos_activos": productos,
        })
        _track(cnt, True)
    # 'modo' queda sin fila activa a proposito (muestra el catalogo)
    _print_bloque("proveedores-pago", cnt)
    return cnt


# ---------------------------------------------------------------------------
# 7. gestion-pagos-cola-imputacion (SQL directo — sin endpoint de escritura)
# ---------------------------------------------------------------------------
def _specs_sesiones(hoy: date, ctx: dict) -> list[dict]:
    """24 sesiones deterministicas dentro del mes actual (dias 1..hoy)."""
    conceptos = _conceptos_sesion(hoy)
    horas_art = [9, 10, 11, 12, 14, 15, 16, 17]
    estados = (["approved"] * 16) + ["pending", "pending", "in_checkout",
                                     "rejected", "rejected", "rejected",
                                     "expired", "expired"]
    medios_approved = (["tarjeta"] * 6) + (["qr"] * 4) + (["efectivo_cupon"] * 3) + (["transferencia"] * 3)
    vecinos = ctx["vecino_ids"]

    sesiones = []
    n_imputada = 0
    for i in range(24):
        estado = estados[i]
        dia = min(1 + i, hoy.day)
        creado = _utc(date(hoy.year, hoy.month, dia), horas_art[i % 8])
        s = dict(
            id=f"PB-CONTA{i + 1:07d}",
            municipio_id=ctx["muni_id"],
            vecino_user_id=vecinos[i % len(vecinos)],
            concepto=conceptos[i % 4],
            monto=MONTOS_SESION[i % len(MONTOS_SESION)],
            estado=estado,
            provider="mock",
            canal="app",
            created_at=creado,
            medio_pago=None, external_id=None, completed_at=None, expires_at=None,
            codigo_cut_qr=None, imputacion_estado=None, imputado_at=None,
            imputado_por=None, imput_obs=None, imput_ref=None,
        )
        if estado == "approved":
            s["medio_pago"] = medios_approved[i]
            s["completed_at"] = creado + timedelta(minutes=4)
            s["codigo_cut_qr"] = f"CUT-A{i + 1:05d}"
            s["external_id"] = f"MOCK-CONTA-{i + 1:04d}"
            if i < 5:  # 5 imputadas (las mas viejas)
                n_imputada += 1
                s["imputacion_estado"] = "imputado"
                imputado = s["completed_at"] + timedelta(days=1)
                if imputado.date() > hoy:
                    imputado = s["completed_at"] + timedelta(hours=2)
                s["imputado_at"] = imputado
                s["imputado_por"] = ctx["admin_id"]
                s["imput_ref"] = f"AS-2026-{100 + n_imputada:04d}"
            elif i >= 14:  # 2 rechazadas
                s["imputacion_estado"] = "rechazado_imputacion"
                s["imput_obs"] = "No coincide el padron [DEMO]"
            else:  # 9 pendientes (cola viva)
                s["imputacion_estado"] = "pendiente"
        elif estado in ("pending", "in_checkout", "expired"):
            s["expires_at"] = creado + timedelta(minutes=30)
            if estado == "expired":
                s["medio_pago"] = "efectivo_cupon"  # cupon emitido y no pagado
        elif estado == "rejected":
            s["medio_pago"] = "tarjeta"
            s["completed_at"] = creado + timedelta(minutes=2)
        sesiones.append(s)
    return sesiones


_SQL_INSERT_SESION = """
INSERT INTO pago_sesiones (
    id, deuda_id, solicitud_id, municipio_id, vecino_user_id, concepto, monto,
    estado, medio_pago, provider, external_id, metadatos, created_at,
    completed_at, expires_at, codigo_cut_qr, imputacion_estado, imputado_at,
    imputado_por_usuario_id, imputacion_observacion, imputacion_referencia_externa,
    canal, operador_user_id
) VALUES (
    :id, NULL, NULL, :municipio_id, :vecino_user_id, :concepto, :monto,
    :estado, :medio_pago, :provider, :external_id, :metadatos, :created_at,
    :completed_at, :expires_at, :codigo_cut_qr, :imputacion_estado, :imputado_at,
    :imputado_por, :imput_obs, :imput_ref,
    :canal, NULL
)
"""


def _sembrar_pagos_imputacion_sql(hoy: date, ctx: dict) -> dict:
    """pago_sesiones + exportacion + metadata de gire, directo a la DB QA.

    Unico bloque tabla-directa del modulo: no existe endpoint de escritura que
    permita fijar created_at/completed_at/metadata deterministicos.
    """
    import asyncio

    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import create_async_engine

    from _api import guard_qa

    url = os.environ.get("DATABASE_URL", "")
    if not url:
        raise RuntimeError(
            "DATABASE_URL no seteada: exporta la URL de la DB QA "
            "(este bloque escribe pago_sesiones sin endpoint de escritura)."
        )
    if url.startswith("mysql://"):
        url = "mysql+aiomysql://" + url[len("mysql://"):]
    url = guard_qa(url)  # aborta si no es QA

    cnt = {"creados": 0, "existentes": 0}
    sesiones = _specs_sesiones(hoy, ctx)
    metadatos = json.dumps({"demo": True, "seed": SEED_MARK})

    async def _run():
        engine = create_async_engine(url)
        try:
            async with engine.begin() as conn:
                # --- 24 pago_sesiones (idempotente por PK deterministica) ---
                for s in sesiones:
                    existe = (await conn.execute(
                        text("SELECT id FROM pago_sesiones WHERE id = :id"),
                        {"id": s["id"]},
                    )).scalar_one_or_none()
                    if existe:
                        _track(cnt, False)
                        continue
                    params = {k: v for k, v in s.items()}
                    params["metadatos"] = metadatos
                    await conn.execute(text(_SQL_INSERT_SESION), params)
                    _track(cnt, True)

                # --- 1 exportacion de imputacion (las 4 primeras imputadas) ---
                exportadas = [s for s in sesiones if s["imputacion_estado"] == "imputado"][:4]
                existe_exp = (await conn.execute(
                    text(
                        "SELECT id FROM exportaciones_imputacion "
                        "WHERE municipio_id = :m AND formato = 'csv' "
                        "AND JSON_UNQUOTE(JSON_EXTRACT(filtros, '$.seed')) = :seed"
                    ),
                    {"m": ctx["muni_id"], "seed": SEED_MARK},
                )).scalar_one_or_none()
                if existe_exp:
                    _track(cnt, False)
                else:
                    await conn.execute(
                        text(
                            "INSERT INTO exportaciones_imputacion "
                            "(municipio_id, formato, fecha_desde, fecha_hasta, cantidad_pagos, "
                            " monto_total, session_ids, filtros, generado_por_usuario_id, created_at) "
                            "VALUES (:m, 'csv', :desde, :hasta, :cant, :total, :ids, :filtros, :user, :creado)"
                        ),
                        {
                            "m": ctx["muni_id"],
                            "desde": _dia1(hoy, 0),
                            "hasta": hoy - timedelta(days=10),
                            "cant": len(exportadas),
                            "total": sum(s["monto"] for s in exportadas),
                            "ids": json.dumps([s["id"] for s in exportadas]),
                            "filtros": json.dumps({"seed": SEED_MARK, "demo": True}),
                            "user": ctx["admin_id"],
                            "creado": _utc(hoy - timedelta(days=10), 12),
                        },
                    )
                    _track(cnt, True)

                # --- metadata_importada de GIRE (simulada por diseño) ---
                meta_gire = json.dumps({
                    "padron_cuentas": 1830,
                    "categorias": 42,
                    "importado_at": f"{dias(-15)}T10:00:00-03:00",
                    "proveedor": "gire",
                    "nota": "[DEMO] Metadata simulada por el kit de semillas",
                })
                res = await conn.execute(
                    text(
                        "UPDATE municipio_proveedores_pago SET metadata_importada = :meta "
                        "WHERE municipio_id = :m AND proveedor = 'gire' "
                        "AND metadata_importada IS NULL"
                    ),
                    {"meta": meta_gire, "m": ctx["muni_id"]},
                )
                _track(cnt, res.rowcount > 0)
        finally:
            await engine.dispose()

    asyncio.run(_run())
    _print_bloque("pagos-imputacion", cnt)
    return cnt


# ---------------------------------------------------------------------------
# Entry point del modulo
# ---------------------------------------------------------------------------
def sembrar(api, hoy: date) -> dict:
    ctx = _cargar_contexto(api)
    total = {"creados": 0, "existentes": 0}

    bloques = [
        _sembrar_cajas(api, hoy, ctx),
        _sembrar_tipos_empleado(api, ctx),
        _sembrar_contactos(api, ctx),
        _sembrar_conceptos_liquidacion(api, ctx),
        _sembrar_pagos_programados(api, hoy, ctx),
        _sembrar_historial_sueldos(api, hoy, ctx),
        _sembrar_retenciones(api, ctx),
        _sembrar_ordenes_pago(api, hoy, ctx),
        _sembrar_proveedores_pago(api),
        _sembrar_pagos_imputacion_sql(hoy, ctx),
    ]
    for b in bloques:
        total["creados"] += b["creados"]
        total["existentes"] += b["existentes"]

    print(f"[20_sueldos_contaduria] creados={total['creados']} existentes={total['existentes']}")
    return total


if __name__ == "__main__":
    from _api import ApiQA, hoy as _hoy

    _api_qa = ApiQA()
    _api_qa.login()
    sembrar(_api_qa, _hoy())
