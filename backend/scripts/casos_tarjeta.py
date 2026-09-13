# -*- coding: utf-8 -*-
"""Los CASOS de la curacion de tarjeta: quien es, que cajas usa y que hay que arreglar.

Existe para que el ensayo y la corrida de verdad usen EL MISMO CODIGO. La
curacion que se prueba en el sandbox de produccion (Merlo) es, linea por linea,
la que despues corre sobre San Pedro Norte; lo unico que cambia es este dato.

  spn    el caso REAL de San Pedro Norte en produccion (muni 80). NUNCA se siembra:
         esos gastos los cargo el municipio.
  merlo  el mismo caso replicado en el sandbox de produccion (muni 1000149), para
         poder ensayar la curacion completa antes de tocar un cliente.

Los gastos a curar se buscan por fecha + monto + descripcion, no por id: en cada
base los ids son distintos.
"""
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Optional


@dataclass(frozen=True)
class PagoComoGasto:
    """Un pago del resumen que se cargo mal, como gasto comun."""
    fecha: str
    monto: Decimal
    descripcion: str
    concepto: str
    forma_pago: str
    del_programado: bool          # lo genero el pago programado, o se cargo a mano


@dataclass(frozen=True)
class CasoTarjeta:
    clave: str
    municipio_id: int
    caja_origen_id: int           # de donde sale la plata (el banco)
    tarjeta_caja_id: int          # la caja con codigo TARJETA
    programado_id: Optional[int]  # el programado que agendaba el gasto fijo
    programado_monto: Decimal     # lo que tenia agendado, para verificar que es el correcto
    pagos: list                   # list[PagoComoGasto]
    compras: list = field(default_factory=list)   # (fecha, monto, concepto) — solo para sembrar
    sembrable: bool = False       # False = son datos reales, no se tocan
    dia_del_mes: int = 10
    proximo_pago: str = "2026-10-10"
    ultimo_pago: str = "2026-09-10"
    descripcion_programado: str = "Tarjeta de crédito"
    concepto_programado: str = "Servicios"


# --- las 26 compras reales de San Pedro Norte: 6.247.510,07 ---
COMPRAS_SPN = [
    ("2026-05-05", "120000.00", "TSA Online"),
    ("2026-05-06", "159999.00", "Pagos varios"),
    ("2026-05-07", "200000.00", "Pago de viaticos y movilidad"),
    ("2026-06-01", "23500.00", "Publicidad"),
    ("2026-06-02", "31668.97", "Compras varias"),
    ("2026-06-10", "64994.00", "Pagos varios"),
    ("2026-06-10", "90631.45", "Prensa"),
    ("2026-06-10", "145000.00", "Prensa"),
    ("2026-06-15", "82799.64", "Compras varias"),
    ("2026-06-18", "74244.00", "Compras varias"),
    ("2026-07-01", "24500.00", "Publicidad"),
    ("2026-07-06", "81708.59", "Deporte"),
    ("2026-07-12", "119992.00", "Compras varias"),
    ("2026-07-20", "341997.00", "Compra de materiales de oficina"),
    ("2026-07-20", "113999.00", "Compra de materiales de oficina"),
    ("2026-07-22", "38000.00", "Aportes varios"),
    ("2026-07-27", "225220.00", "Compra de herramientas y equipamiento"),
    ("2026-07-31", "42316.00", "Compra de materiales de oficina"),
    ("2026-08-03", "40432.74", "Compra de materiales de oficina"),
    ("2026-08-14", "764094.00", "Compra de materiales de obra"),
    ("2026-08-14", "118265.00", "Compra de materiales de oficina"),
    ("2026-08-19", "169990.00", "Compras varias"),
    ("2026-08-21", "257870.64", "Compra de materiales de obra"),
    ("2026-08-27", "2509198.20", "Compra de materiales de oficina"),
    ("2026-08-31", "177089.84", "Compra de materiales de oficina"),
    ("2026-09-10", "230000.00", "Aporte a subsidios y ayudas sociales"),
]

# --- los 3 pagos del resumen que se cargaron como gasto ---
PAGOS_SPN = [
    PagoComoGasto("2026-08-08", Decimal("2275730.90"), "Pago Visa", "Pagos varios", "otro", False),
    PagoComoGasto("2026-08-10", Decimal("2180305.30"), "Tarjeta de crédito", "Servicios", "transferencia", True),
    PagoComoGasto("2026-09-10", Decimal("2180305.30"), "Tarjeta de crédito", "Servicios", "transferencia", True),
]

SPN = CasoTarjeta(
    clave="spn",
    municipio_id=80,
    caja_origen_id=107,          # Cooparticipación
    tarjeta_caja_id=373,         # Visa ····9594
    programado_id=650,
    programado_monto=Decimal("2180305.30"),
    pagos=PAGOS_SPN,
    compras=COMPRAS_SPN,
    sembrable=False,             # datos reales del cliente
)

# Merlo, el sandbox de PRODUCCION. Mismos montos y fechas que San Pedro Norte a
# proposito: si la curacion da los mismos numeros aca, da los mismos alla.
# `programado_id` va en None porque lo crea la semilla y no se puede fijar de
# antemano sin chocar con los 6 programados que Merlo ya tiene.
MERLO = CasoTarjeta(
    clave="merlo",
    municipio_id=1000149,
    caja_origen_id=1000280,      # Coparticipacion provincial
    tarjeta_caja_id=1000459,     # Sandbox Visa ····0000
    programado_id=None,
    programado_monto=Decimal("2180305.30"),
    pagos=PAGOS_SPN,
    compras=COMPRAS_SPN,
    sembrable=True,
)

CASOS = {c.clave: c for c in (SPN, MERLO)}


def caso(clave: str) -> CasoTarjeta:
    if clave not in CASOS:
        raise SystemExit(f"caso desconocido '{clave}'. Hay: {', '.join(CASOS)}")
    return CASOS[clave]
