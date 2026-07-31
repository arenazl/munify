"""m_10_tesoreria — Semilla integral del universo Tesoreria (QA Paraguay Limpio, muni 146).

Siembra, en ORDEN de dependencias y 100%% via API:
  1. Catalogos: 4 tipos de concepto + 16 conceptos, 3 tipos de empleado.
  2. Cajas (4): Recursos Propios / FONACIDE / Royalties / Tarjeta Corporativa (codigo TARJETA).
  3. Tarjetas de credito (2): las referencian los 3 gastos con forma_pago=tarjeta.
     (El modulo de tarjetas puede re-asegurarlas: la clave natural es la denominacion.)
  4. Contactos (22): 8 empleados + 3 concejales + 3 profesionales + 5 proveedores
     + 2 contratistas + 1 beneficiario, con 1 par duplicado intencional
     (Ramona Gonzalez / Ramona González, mismo telefono) para la demo de /duplicados.
  5. Proyectos (3): Bacheo (activo) / Plaza San Vicente (activo) / Iluminacion LED (finalizado).
  6. Gastos (24): 15 contado+concretado (HOY-85..HOY-1), 2 al_dia (HOY), 1 pendiente (HOY+7),
     3 en cuotas (6 cuotas desde HOY-60), 1 prestamo (12 cuotas desde HOY-90),
     2 recurrentes mensuales (desde HOY-60, sin fecha_fin). El POST genera cuotas,
     movimientos de caja e imputaciones a proyectos solo (logica de negocio real).
     Las cuotas vencidas se pagan via POST /cuotas/{id}/pagar (genera el egreso de caja).
  7. Ingresos manuales de caja (8): coparticipacion/royalties en Recursos Propios y FONACIDE.
  8. Conciliacion: deja EXACTAMENTE 6 movimientos pendientes (los mas recientes) en
     Recursos Propios y marca el resto via POST /conciliacion/manual con refs
     EXT-2026-NNNN correlativos. Regenera el CSV [DEMO] de extracto bancario
     (extracto_demo_recursos_propios.csv) con 4 lineas que matchean pendientes
     por monto+fecha, para demostrar el import en vivo.

Idempotencia (claves naturales):
  - cajas: codigo | tarjetas: denominacion | tipos/conceptos/proyectos: nombre
  - contactos: (nombre, apellido) | gastos: (concepto, monto_pesos)
  - ingresos manuales: concepto (unico) dentro de la caja
  Las claves de gastos/ingresos NO dependen de la fecha: una corrida en otro dia
  tampoco duplica. Segunda corrida => 0 creaciones.

Desvios documentados respecto del plan del inventario:
  - El gasto en cuotas G21 paga SOLO la cuota 1 (el plan pedia 2): garantiza
    deterministicamente cuotas_vencidas>0 en Proyecciones (cuota 2 vence HOY-30).
  - RUC de proveedores va en el campo `dni` (ContactoCreate no expone cuit/condicion_iva).
  - fecha_conciliacion la setea el servidor (el endpoint /manual no acepta fecha).
  - El pago de tarjeta (POST /cajas/pagar-tarjeta) es del modulo de tarjetas, no de este.
"""
from __future__ import annotations

import csv
from datetime import date
from decimal import Decimal
from pathlib import Path

from _api import ApiQA, ApiError, dias

DESC_DEMO = "[DEMO] Semilla integral Paraguay Limpio"

# ---------------------------------------------------------------------------
# Especificaciones deterministicas
# ---------------------------------------------------------------------------

TIPOS_CONCEPTO = [
    {"nombre": "Sueldos y haberes", "icono": "Users", "orden": 1},
    {"nombre": "Obras y mantenimiento", "icono": "HardHat", "orden": 2},
    {"nombre": "Servicios", "icono": "Zap", "orden": 3},
    {"nombre": "Insumos", "icono": "Package", "orden": 4},
]

CONCEPTOS = {
    "Sueldos y haberes": ["Sueldo mensual", "Aguinaldo", "Honorarios profesionales"],
    "Obras y mantenimiento": [
        "Bacheo y asfaltado", "Materiales de construccion", "Mantenimiento de plazas",
        "Senalizacion vial", "Equipamiento y maquinaria",
    ],
    "Servicios": [
        "Energia electrica ANDE", "Agua ESSAP", "Recoleccion de residuos",
        "Telefonia e internet", "Limpieza de espacios publicos",
    ],
    "Insumos": ["Combustible", "Utiles de oficina", "Publicidad institucional"],
}

TIPOS_EMPLEADO = [
    {"nombre": "Personal de planta", "icono": "BadgeCheck", "orden": 1},
    {"nombre": "Jornalizado", "icono": "Clock", "orden": 2},
    {"nombre": "Contratado", "icono": "FileSignature", "orden": 3},
]

CAJAS = [
    {"nombre": "Recursos Propios", "codigo": "REC-PROPIOS", "saldo_inicial": 450_000_000,
     "icono": "Landmark", "orden": 0},
    {"nombre": "FONACIDE", "codigo": "FONACIDE", "saldo_inicial": 280_000_000,
     "icono": "Banknote", "orden": 1},
    {"nombre": "Royalties", "codigo": "ROYALTIES", "saldo_inicial": 320_000_000,
     "icono": "Coins", "orden": 2},
    # codigo TARJETA = caja especial tarjeta de credito: saldo_inicial es el LIMITE.
    {"nombre": "Tarjeta Corporativa", "codigo": "TARJETA", "saldo_inicial": 50_000_000,
     "icono": "CreditCard", "orden": 3},
]

TARJETAS = [
    {"denominacion": "Visa Corporativa Banco Continental", "marca": "Visa",
     "ultimos_4": "4321", "dia_cierre": 25, "orden": 0},
    {"denominacion": "Mastercard Itau Empresas", "marca": "Mastercard",
     "ultimos_4": "8810", "dia_cierre": 10, "orden": 1},
]

# (nombre, apellido, tipo, dni/CI o RUC, tel, direccion, alias_pago, tipo_empleado, subtipo)
CONTACTOS = [
    # 8 empleados (CI paraguaya en dni, tipo_empleado del catalogo)
    ("Ramon", "Benitez", "empleado", "3.456.789", "+595 981 100201",
     "Avda. Mcal. Lopez 1250, Asuncion", "benitezram.py", "Personal de planta", None),
    ("Mirta", "Villalba", "empleado", "2.987.654", "+595 981 100202",
     "Barrio Sajonia, Asuncion", "619-123456-7", "Personal de planta", None),
    ("Blanca", "Aguero", "empleado", "4.123.987", "+595 981 100203",
     "Avda. Eusebio Ayala km 4, Asuncion", None, "Contratado", None),
    ("Osvaldo", "Duarte", "empleado", "3.789.456", "+595 981 100204",
     "Barrio San Vicente, Asuncion", "duarteosv.py", "Jornalizado", None),
    ("Fatima", "Caballero", "empleado", "4.456.123", "+595 981 100205",
     "Barrio Obrero, Asuncion", None, "Personal de planta", None),
    ("Blas", "Cabañas", "empleado", "2.654.321", "+595 981 100206",
     "Lambare, Gran Asuncion", None, "Jornalizado", None),
    ("Nidia", "Espinola", "empleado", "3.987.123", "+595 981 100207",
     "Barrio Tacumbu, Asuncion", "619-234567-8", "Contratado", None),
    ("Ramona", "Gonzalez", "empleado", "3.111.222", "+595 981 100208",
     "Barrio Santa Ana, Asuncion", "gonzalezram.py", "Personal de planta", None),
    # 3 concejales
    ("Carlos", "Ovelar", "concejal", "1.987.654", "+595 981 100209",
     "Palma esq. 14 de Mayo, Asuncion", None, None, None),
    ("Graciela", "Nuñez", "concejal", "2.345.678", "+595 981 100210",
     "Avda. España 1450, Asuncion", None, None, None),
    ("Hugo", "Samudio", "concejal", "1.876.543", "+595 981 100211",
     "Barrio Las Mercedes, Asuncion", None, None, None),
    # 3 profesionales (subtipo)
    ("Oscar", "Caceres", "profesional", "2.111.333", "+595 981 100212",
     "Avda. Mcal. Lopez 3450, Asuncion", "caceresosc.py", None, "ingeniero"),
    ("Marta", "Insfran", "profesional", "3.222.444", "+595 981 100213",
     "Estrella 851, Asuncion", None, None, "contador"),
    ("Ruben", "Delvalle", "profesional", "2.333.555", "+595 981 100214",
     "Chile esq. Oliva, Asuncion", None, None, "abogado"),
    # 5 proveedores (RUC en dni: el schema no expone cuit)
    ("Constructora Guarani S.A.", None, "proveedor", "80012345-6", "+595 981 100215",
     "Avda. Artigas 2020, Asuncion", "619-345678-9", None, None),
    ("Ferreteria La Negrita S.R.L.", None, "proveedor", "80023456-7", "+595 981 100216",
     "Avda. Eusebio Ayala 3120, Asuncion", None, None, None),
    ("Estacion Petropar Sajonia", None, "proveedor", "80034567-8", "+595 981 100217",
     "Barrio Sajonia, Asuncion", "619-456789-0", None, None),
    ("Distribuidora Nanduti", None, "proveedor", "80045678-9", "+595 981 100218",
     "Mercado 4, Pettirossi, Asuncion", None, None, None),
    ("Imprenta Karai", None, "proveedor", "80056789-0", "+595 981 100219",
     "Cerro Cora 980, Asuncion", "imprentakarai.py", None, None),
    # 2 contratistas
    ("Anibal", "Sosa", "contratista", "2.888.999", "+595 981 100220",
     "Barrio Republicano, Asuncion", "sosaanibal.py", None, None),
    ("Eulalia", "Martinez", "contratista", "3.555.777", "+595 981 100221",
     "Villa Morra, Asuncion", None, None, None),
    # 1 beneficiario — par duplicado intencional con la empleada Ramona Gonzalez
    # (mismo telefono, apellido con tilde) para la demo del detector /duplicados.
    ("Ramona", "González", "beneficiario", "3.111.223", "+595 981 100208",
     "Barrio Santa Ana, Asuncion", None, None, None),
]

PROYECTOS = [
    {"nombre": "Bacheo Avda. Mcal. Lopez", "estado": "activo",
     "presupuesto": 850_000_000, "inicio": -60, "fin": None},
    {"nombre": "Puesta en valor Plaza San Vicente", "estado": "activo",
     "presupuesto": 320_000_000, "inicio": -30, "fin": None},
    {"nombre": "Iluminacion LED microcentro", "estado": "finalizado",
     "presupuesto": 480_000_000, "inicio": -120, "fin": -15},
]

# Cada gasto: clave natural (concepto, monto). dep = indice en la lista de
# dependencias reales del muni (orden por id: 0=Serv.Publicos 1=Obras 2=Transito
# 3=Zoonosis 4=Seguridad). proy = [(nombre_proyecto, monto_asignado)].
# pagar: ("numero", N) paga cuotas 1..N | ("vencidas",) paga las de vencimiento < HOY.
GASTOS = [
    # 15 contado + concretado (fechas deterministicas del plan)
    {"off": -85, "concepto": "Energia electrica ANDE", "monto": 12_500_000, "dep": 0,
     "caja": "REC-PROPIOS", "nro_factura": "001-001-0001231",
     "proy": [("Iluminacion LED microcentro", 12_500_000)]},
    {"off": -78, "concepto": "Bacheo y asfaltado", "monto": 85_000_000, "dep": 1,
     "caja": "REC-PROPIOS"},
    {"off": -70, "concepto": "Agua ESSAP", "monto": 6_800_000, "dep": 0,
     "caja": "REC-PROPIOS", "nro_factura": "001-001-0001307"},
    {"off": -63, "concepto": "Combustible", "monto": 9_400_000, "dep": 2,
     "caja": "REC-PROPIOS", "forma_pago": "efectivo"},
    {"off": -56, "concepto": "Recoleccion de residuos", "monto": 32_000_000,
     "contacto": ("Anibal", "Sosa"), "caja": "REC-PROPIOS"},
    {"off": -49, "concepto": "Senalizacion vial", "monto": 21_000_000, "dep": 2,
     "caja": "FONACIDE", "proy": [("Bacheo Avda. Mcal. Lopez", 21_000_000)]},
    {"off": -42, "concepto": "Honorarios profesionales", "monto": 14_000_000,
     "contacto": ("Oscar", "Caceres"), "caja": "REC-PROPIOS", "forma_pago": "cheque",
     "proy": [("Iluminacion LED microcentro", 14_000_000)]},
    {"off": -35, "concepto": "Mantenimiento de plazas", "monto": 18_500_000,
     "contacto": ("Eulalia", "Martinez"), "caja": "REC-PROPIOS"},
    {"off": -28, "concepto": "Publicidad institucional", "monto": 7_200_000,
     "contacto": ("Imprenta Karai", None), "caja": "FONACIDE",
     "nro_factura": "001-002-0000456"},
    {"off": -21, "concepto": "Combustible", "monto": 8_100_000,
     "contacto": ("Estacion Petropar Sajonia", None), "caja": "TARJETA",
     "forma_pago": "tarjeta", "tarjeta": "Visa Corporativa Banco Continental"},
    {"off": -14, "concepto": "Utiles de oficina", "monto": 3_600_000,
     "contacto": ("Distribuidora Nanduti", None), "caja": "TARJETA",
     "forma_pago": "tarjeta", "tarjeta": "Mastercard Itau Empresas"},
    {"off": -10, "concepto": "Materiales de construccion", "monto": 95_000_000,
     "contacto": ("Constructora Guarani S.A.", None), "caja": "FONACIDE",
     "nro_factura": "001-001-0001450",
     # Gasto grande repartido 60/30 entre dos proyectos; queda remanente sin imputar.
     "proy": [("Bacheo Avda. Mcal. Lopez", 57_000_000),
              ("Puesta en valor Plaza San Vicente", 28_500_000)]},
    {"off": -7, "concepto": "Combustible", "monto": 5_900_000,
     "contacto": ("Estacion Petropar Sajonia", None), "caja": "TARJETA",
     "forma_pago": "tarjeta", "tarjeta": "Visa Corporativa Banco Continental"},
    {"off": -3, "concepto": "Mantenimiento de plazas", "monto": 9_800_000, "dep": 0,
     "caja": "REC-PROPIOS", "forma_pago": "efectivo",
     "proy": [("Puesta en valor Plaza San Vicente", 9_800_000)]},
    {"off": -1, "concepto": "Telefonia e internet", "monto": 4_200_000, "dep": 3,
     "caja": "ROYALTIES"},
    # 2 al_dia con fecha HOY
    {"off": 0, "concepto": "Sueldo mensual", "monto": 5_200_000,
     "contacto": ("Ramon", "Benitez"), "caja": "REC-PROPIOS", "estado_pago": "al_dia"},
    {"off": 0, "concepto": "Aguinaldo", "monto": 4_900_000,
     "contacto": ("Mirta", "Villalba"), "caja": "FONACIDE", "estado_pago": "al_dia"},
    # 1 pendiente futuro
    {"off": 7, "concepto": "Materiales de construccion", "monto": 15_500_000,
     "contacto": ("Ferreteria La Negrita S.R.L.", None), "caja": "ROYALTIES",
     "estado_pago": "pendiente"},
    # 3 en cuotas (6 cuotas mensuales desde HOY-60)
    {"off": -60, "concepto": "Materiales de construccion", "monto": 42_000_000,
     "contacto": ("Constructora Guarani S.A.", None), "caja": "REC-PROPIOS",
     "tipo_financiacion": "cuotas", "cuotas_total": 6, "estado_pago": "al_dia",
     "pagar": ("numero", 2)},
    {"off": -60, "concepto": "Equipamiento y maquinaria", "monto": 66_000_000,
     "contacto": ("Ferreteria La Negrita S.R.L.", None), "caja": "FONACIDE",
     "tipo_financiacion": "cuotas", "cuotas_total": 6, "estado_pago": "al_dia",
     "pagar": ("numero", 2)},
    # Paga SOLO la cuota 1: la cuota 2 (HOY-30) queda vencida a proposito para
    # que Proyecciones muestre cuotas_vencidas > 0 de forma deterministica.
    {"off": -60, "concepto": "Bacheo y asfaltado", "monto": 24_000_000,
     "contacto": ("Constructora Guarani S.A.", None), "caja": "REC-PROPIOS",
     "tipo_financiacion": "cuotas", "cuotas_total": 6, "estado_pago": "al_dia",
     "pagar": ("numero", 1), "proy": [("Bacheo Avda. Mcal. Lopez", 24_000_000)]},
    # 1 prestamo 12 cuotas desde HOY-90 (3 pagadas)
    {"off": -90, "concepto": "Amortizacion prestamo BNF", "monto": 90_000_000, "dep": 1,
     "caja": "REC-PROPIOS", "tipo_financiacion": "prestamo", "cuotas_total": 12,
     "estado_pago": "al_dia", "pagar": ("numero", 3)},
    # 2 recurrentes mensuales desde HOY-60, sin fecha_fin (cuotas vencidas pagadas)
    {"off": -60, "concepto": "Alquiler deposito municipal", "monto": 8_500_000,
     "contacto": ("Ramona", "González"), "caja": "FONACIDE",
     "tipo_financiacion": "recurrente", "frecuencia": "mensual",
     "estado_pago": "al_dia", "pagar": ("vencidas",)},
    {"off": -60, "concepto": "Limpieza de espacios publicos", "monto": 26_000_000,
     "dep": 0, "caja": "ROYALTIES", "tipo_financiacion": "recurrente",
     "frecuencia": "mensual", "estado_pago": "al_dia", "pagar": ("vencidas",)},
]

# 8 ingresos manuales (conceptos UNICOS por caja = clave natural sin fecha)
INGRESOS = [
    ("REC-PROPIOS", -90, 120_000_000, "Coparticipacion MH - anticipo trimestral [DEMO]"),
    ("REC-PROPIOS", -60, 95_000_000, "Transferencia Ministerio de Hacienda [DEMO]"),
    ("REC-PROPIOS", -30, 38_000_000, "Canon juegos de azar [DEMO]"),
    ("REC-PROPIOS", -1, 60_000_000, "Coparticipacion MH - complemento mensual [DEMO]"),
    ("FONACIDE", -90, 85_000_000, "FONACIDE - desembolso obras [DEMO]"),
    ("FONACIDE", -60, 72_000_000, "Royalties Itaipu cuota mensual [DEMO]"),
    ("FONACIDE", -30, 44_000_000, "FONACIDE - desembolso educacion [DEMO]"),
    ("FONACIDE", -1, 66_000_000, "Royalties Yacyreta cuota mensual [DEMO]"),
]

CAJA_CONCILIACION = "REC-PROPIOS"   # la conciliacion opera sobre Recursos Propios
PENDIENTES_A_DEJAR = 6              # movimientos sin conciliar (los mas recientes)
CONCILIADOS_OBJETIVO = 12           # refs EXT-2026-0001..0012 en la primera corrida
CSV_EXTRACTO = "extracto_demo_recursos_propios.csv"
CSV_LINEAS = 4


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _k(valor) -> str:
    return str(valor or "").strip().lower()


def _monto(valor) -> Decimal:
    return Decimal(str(valor))


class Contador:
    def __init__(self):
        self.creados = 0
        self.existentes = 0

    def sumar(self, creado: bool):
        if creado:
            self.creados += 1
        else:
            self.existentes += 1


def _asegurar_por_nombre(api: ApiQA, cont: Contador, lista_ep: str, post_ep: str,
                         campo: str, payload: dict) -> dict:
    obj, creado = api.asegurar(lista_ep, campo, payload[campo], post_ep, payload)
    cont.sumar(creado)
    return obj


# ---------------------------------------------------------------------------
# Pasos
# ---------------------------------------------------------------------------

def _sembrar_catalogos(api: ApiQA, cont: Contador) -> None:
    tipos = {}
    for spec in TIPOS_CONCEPTO:
        payload = {**spec, "descripcion": DESC_DEMO}
        obj = _asegurar_por_nombre(
            api, cont, "/tesoreria/tipos-concepto", "/tesoreria/tipos-concepto",
            "nombre", payload,
        )
        tipos[spec["nombre"]] = obj["id"]

    existentes = {_k(c.get("nombre")) for c in api.listar("/tesoreria/conceptos-abm")}
    for tipo_nombre, nombres in CONCEPTOS.items():
        for orden, nombre in enumerate(nombres):
            if _k(nombre) in existentes:
                cont.sumar(False)
                continue
            api.post("/tesoreria/conceptos-abm", json={
                "tipo_concepto_id": tipos[tipo_nombre],
                "nombre": nombre,
                "orden": orden,
            })
            cont.sumar(True)

    for spec in TIPOS_EMPLEADO:
        _asegurar_por_nombre(
            api, cont, "/tesoreria/tipos-empleado", "/tesoreria/tipos-empleado",
            "nombre", {**spec, "descripcion": DESC_DEMO},
        )


def _sembrar_cajas(api: ApiQA, cont: Contador) -> dict:
    cajas = {}
    for spec in CAJAS:
        obj, creado = api.asegurar(
            "/tesoreria/cajas", "codigo", spec["codigo"], "/tesoreria/cajas",
            {**spec, "descripcion": DESC_DEMO, "fecha_apertura": dias(-120)},
        )
        cont.sumar(creado)
        cajas[spec["codigo"]] = obj["id"]
    return cajas


def _sembrar_tarjetas(api: ApiQA, cont: Contador) -> dict:
    tarjetas = {}
    for spec in TARJETAS:
        obj, creado = api.asegurar(
            "/tarjetas", "denominacion", spec["denominacion"], "/tarjetas", spec,
        )
        cont.sumar(creado)
        tarjetas[spec["denominacion"]] = obj["id"]
    return tarjetas


def _sembrar_contactos(api: ApiQA, cont: Contador) -> dict:
    tipos_empleado = {
        _k(t.get("nombre")): t["id"]
        for t in api.listar("/tesoreria/tipos-empleado")
    }
    existentes = {
        (_k(c.get("nombre")), _k(c.get("apellido"))): c
        for c in api.listar("/tesoreria/contactos", params={"limit": 1000})
    }
    contactos = {}
    for (nombre, apellido, tipo, dni, tel, direccion, alias, tipo_emp, subtipo) in CONTACTOS:
        clave = (_k(nombre), _k(apellido))
        if clave in existentes:
            cont.sumar(False)
            contactos[(nombre, apellido)] = existentes[clave]["id"]
            continue
        payload = {
            "nombre": nombre,
            "apellido": apellido,
            "tipo": tipo,
            "dni": dni,
            "telefono": tel,
            "direccion": direccion,
            "alias_pago": alias,
            "subtipo": subtipo,
            "notas": DESC_DEMO,
            # Direcciones reales de Asuncion, SIN coordenadas (regla del kit).
            "latitud": None,
            "longitud": None,
        }
        if tipo_emp:
            payload["tipo_empleado_id"] = tipos_empleado.get(_k(tipo_emp))
        obj = api.post("/tesoreria/contactos", json=payload)
        cont.sumar(True)
        contactos[(nombre, apellido)] = obj["id"]
    return contactos


def _sembrar_proyectos(api: ApiQA, cont: Contador) -> dict:
    proyectos = {}
    for spec in PROYECTOS:
        payload = {
            "nombre": spec["nombre"],
            "descripcion": DESC_DEMO,
            "presupuesto": spec["presupuesto"],
            "estado": spec["estado"],
            "fecha_inicio": dias(spec["inicio"]),
        }
        if spec["fin"] is not None:
            payload["fecha_fin"] = dias(spec["fin"])
        obj = _asegurar_por_nombre(
            api, cont, "/tesoreria/proyectos", "/tesoreria/proyectos", "nombre", payload,
        )
        proyectos[spec["nombre"]] = obj["id"]
    return proyectos


def _pagar_cuotas(api: ApiQA, cont: Contador, gasto: dict, regla: tuple,
                  forma_pago: str, hoy_iso: str) -> None:
    """Paga via API las cuotas que la regla marca como ya abonadas (idempotente)."""
    for cuota in sorted(gasto.get("cuotas") or [], key=lambda c: c["numero"]):
        if regla[0] == "numero":
            objetivo = cuota["numero"] <= regla[1]
        else:  # "vencidas": todas las de vencimiento anterior a hoy
            objetivo = cuota["fecha_vencimiento"] < hoy_iso
        if not objetivo:
            continue
        if cuota.get("estado") == "pagada":
            cont.sumar(False)
            continue
        try:
            api.post(f"/tesoreria/gastos/cuotas/{cuota['id']}/pagar", json={
                "fecha_pago": cuota["fecha_vencimiento"],
                "forma_pago": forma_pago,
            })
            cont.sumar(True)
        except ApiError as e:
            if e.status == 409:  # ya estaba pagada (carrera entre corridas)
                cont.sumar(False)
            else:
                raise


def _sembrar_gastos(api: ApiQA, cont: Contador, hoy: date, cajas: dict,
                    tarjetas: dict, contactos: dict, proyectos: dict) -> None:
    deps = sorted(api.listar("/dependencias/municipio"), key=lambda d: d["id"])
    if not deps:
        raise RuntimeError("[gastos] el muni no tiene dependencias sembradas (prerequisito)")
    hoy_iso = hoy.isoformat()

    existentes = {
        (_k(g.get("concepto")), _monto(g.get("monto_pesos"))): g
        for g in api.listar("/tesoreria/gastos", params={"limit": 500})
    }

    for spec in GASTOS:
        clave = (_k(spec["concepto"]), _monto(spec["monto"]))
        gasto = existentes.get(clave)
        if gasto is None:
            payload = {
                "concepto": spec["concepto"],
                "descripcion": DESC_DEMO,
                "monto_pesos": spec["monto"],
                "fecha": dias(spec["off"]),
                "tipo_financiacion": spec.get("tipo_financiacion", "contado"),
                "forma_pago": spec.get("forma_pago", "transferencia"),
                "estado_pago": spec.get("estado_pago", "concretado"),
                "caja_id": cajas[spec["caja"]],
            }
            if "dep" in spec:
                payload["destino_tipo"] = "dependencia"
                payload["destino_dependencia_id"] = deps[spec["dep"] % len(deps)]["id"]
            else:
                payload["destino_tipo"] = "contacto"
                payload["destino_contacto_id"] = contactos[spec["contacto"]]
            if spec.get("cuotas_total"):
                payload["cuotas_total"] = spec["cuotas_total"]
            if spec.get("frecuencia"):
                payload["frecuencia"] = spec["frecuencia"]
            if spec.get("tarjeta"):
                payload["tarjeta_credito_id"] = tarjetas[spec["tarjeta"]]
            if spec.get("nro_factura"):
                payload["nro_factura"] = spec["nro_factura"]
            if spec.get("proy"):
                payload["proyectos"] = [
                    {"proyecto_id": proyectos[nombre], "monto_asignado": monto}
                    for nombre, monto in spec["proy"]
                ]
            gasto = api.post("/tesoreria/gastos", json=payload)
            cont.sumar(True)
        else:
            cont.sumar(False)

        if spec.get("pagar"):
            _pagar_cuotas(api, cont, gasto, spec["pagar"],
                          spec.get("forma_pago", "transferencia"), hoy_iso)


def _sembrar_ingresos(api: ApiQA, cont: Contador, cajas: dict) -> None:
    movimientos_por_caja: dict[str, set] = {}
    for codigo, off, monto, concepto in INGRESOS:
        caja_id = cajas[codigo]
        if codigo not in movimientos_por_caja:
            movimientos_por_caja[codigo] = {
                _k(m.get("concepto"))
                for m in api.listar(
                    f"/tesoreria/cajas/{caja_id}/movimientos", params={"limit": 500}
                )
            }
        if _k(concepto) in movimientos_por_caja[codigo]:
            cont.sumar(False)
            continue
        api.post("/tesoreria/cajas/movimientos", json={
            "caja_id": caja_id,
            "tipo": "ingreso",
            "monto": monto,
            "fecha": dias(off),
            "concepto": concepto,
            "descripcion": DESC_DEMO,
        })
        cont.sumar(True)


def _conciliar(api: ApiQA, cont: Contador, cajas: dict) -> list:
    """Concilia los movimientos mas viejos de Recursos Propios dejando
    EXACTAMENTE los PENDIENTES_A_DEJAR mas recientes sin conciliar.
    Devuelve los pendientes finales (insumo del CSV demo)."""
    caja_id = cajas[CAJA_CONCILIACION]
    total = len(api.listar(f"/tesoreria/cajas/{caja_id}/movimientos",
                           params={"limit": 500}))
    pendientes = api.get("/tesoreria/conciliacion/pendientes",
                         params={"caja_id": caja_id}) or []
    ya_conciliados = max(0, total - len(pendientes))

    pendientes_asc = sorted(pendientes, key=lambda m: (m["fecha"], m["id"]))
    a_marcar = pendientes_asc[: max(0, len(pendientes_asc) - PENDIENTES_A_DEJAR)]
    for i, mov in enumerate(a_marcar, start=ya_conciliados + 1):
        api.post("/tesoreria/conciliacion/manual", json={
            "movimiento_id": mov["id"],
            "ref_extracto": f"EXT-2026-{i:04d}",
        })
        cont.sumar(True)

    finales = pendientes_asc[max(0, len(pendientes_asc) - PENDIENTES_A_DEJAR):]
    print(f"[tesoreria] conciliacion: marcados={len(a_marcar)} "
          f"(previos={ya_conciliados}) pendientes={len(finales)}")
    return finales


def _escribir_csv_extracto(pendientes: list) -> Path:
    """Regenera el CSV [DEMO] del extracto bancario: 4 lineas que matchean
    movimientos pendientes por monto exacto + fecha (tolerancia del import)."""
    destino = Path(__file__).resolve().parent / CSV_EXTRACTO
    filas = sorted(pendientes, key=lambda m: (m["fecha"], m["id"]), reverse=True)[:CSV_LINEAS]
    with destino.open("w", newline="", encoding="utf-8-sig") as fh:
        writer = csv.writer(fh, delimiter=";")
        writer.writerow(["fecha", "descripcion", "debe", "haber", "referencia"])
        for i, mov in enumerate(filas, start=1):
            es_egreso = mov["tipo"] == "egreso"
            concepto = mov["concepto"] or ""
            if "[DEMO]" not in concepto:
                concepto = f"[DEMO] {concepto}"
            writer.writerow([
                mov["fecha"],
                concepto,
                mov["monto"] if es_egreso else "",
                "" if es_egreso else mov["monto"],
                f"BCO-DEMO-{i:04d}",
            ])
    print(f"[tesoreria] csv extracto demo regenerado: {destino.name} ({len(filas)} lineas)")
    return destino


# ---------------------------------------------------------------------------
# Entry point del modulo
# ---------------------------------------------------------------------------

def sembrar(api: ApiQA, hoy: date) -> dict:
    cont = Contador()

    _sembrar_catalogos(api, cont)
    cajas = _sembrar_cajas(api, cont)
    tarjetas = _sembrar_tarjetas(api, cont)
    contactos = _sembrar_contactos(api, cont)
    proyectos = _sembrar_proyectos(api, cont)
    _sembrar_gastos(api, cont, hoy, cajas, tarjetas, contactos, proyectos)
    _sembrar_ingresos(api, cont, cajas)
    pendientes = _conciliar(api, cont, cajas)
    _escribir_csv_extracto(pendientes)

    print(f"[tesoreria] creados={cont.creados} existentes={cont.existentes}")
    return {"creados": cont.creados, "existentes": cont.existentes}


if __name__ == "__main__":
    from _api import hoy as _hoy
    _api = ApiQA()
    _api.login()
    sembrar(_api, _hoy())
