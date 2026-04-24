"""Motor de plantillas batch para export a sistemas contables (Fase 4 bundle).

Genera archivos con los pagos aprobados de un rango para que contaduria
los importe en RAFAM u otro sistema tributario. Soporta varios formatos;
hoy tenemos:

  - csv     : CSV enriquecido con columnas de imputacion (ademas de lo basico).
  - rafam_ba: TXT ancho fijo tentativo (layout provisorio — a confirmar con
              el muni piloto). Queda marcado claramente en el header del
              archivo que es un layout tentativo.
  - json    : JSON pretty-printed (debug / integracion custom).

El contrato de los generadores es el mismo: reciben una lista de
`PagoSesion` ya cargadas + metadata del muni y devuelven bytes + content_type
+ nombre sugerido.
"""
from __future__ import annotations

import csv
import json
from dataclasses import dataclass
from decimal import Decimal
from io import StringIO
from typing import Iterable

from models.pago_sesion import PagoSesion, EstadoImputacion


@dataclass
class ExportResult:
    filename: str
    content_type: str
    body: bytes


def _safe_str(x) -> str:
    return "" if x is None else str(x)


def _fmt_fecha(dt) -> str:
    return dt.strftime("%Y-%m-%d %H:%M") if dt else ""


def _fmt_fecha_ddmmyyyy(dt) -> str:
    return dt.strftime("%d/%m/%Y") if dt else ""


def _rellenar(valor: str, ancho: int, derecha: bool = False) -> str:
    """Padding a ancho fijo. Trunca si el valor es mas largo que el ancho."""
    v = (valor or "")[:ancho]
    return v.rjust(ancho) if derecha else v.ljust(ancho)


# ---------------------------------------------------------------
# CSV enriquecido
# ---------------------------------------------------------------

def generar_csv(sesiones: Iterable[PagoSesion], muni_nombre: str = "") -> ExportResult:
    buf = StringIO()
    writer = csv.writer(buf, delimiter=";")
    writer.writerow([
        "CUT", "Fecha pago", "Concepto", "Origen",
        "Monto", "Medio de pago", "Provider", "N° Operacion",
        "Session ID", "Estado imputacion", "Ref externa", "Observacion imputacion",
    ])
    for s in sesiones:
        writer.writerow([
            _safe_str(s.codigo_cut_qr),
            _fmt_fecha(s.completed_at or s.created_at),
            _safe_str(s.concepto),
            "tramite" if s.solicitud_id else ("tasa" if s.deuda_id else "otro"),
            str(s.monto or 0),
            s.medio_pago.value if s.medio_pago else "",
            _safe_str(s.provider),
            _safe_str(s.external_id),
            _safe_str(s.id),
            s.imputacion_estado.value if s.imputacion_estado else "",
            _safe_str(s.imputacion_referencia_externa),
            _safe_str(s.imputacion_observacion),
        ])
    return ExportResult(
        filename=f"pagos_export_{muni_nombre or 'muni'}.csv".replace(" ", "_"),
        content_type="text/csv; charset=utf-8",
        body=buf.getvalue().encode("utf-8-sig"),  # BOM para Excel español
    )


# ---------------------------------------------------------------
# JSON (debug / integracion custom)
# ---------------------------------------------------------------

def generar_json(sesiones: Iterable[PagoSesion], muni_nombre: str = "") -> ExportResult:
    items = []
    for s in sesiones:
        items.append({
            "cut": s.codigo_cut_qr,
            "session_id": s.id,
            "fecha_pago": (s.completed_at or s.created_at).isoformat() if (s.completed_at or s.created_at) else None,
            "concepto": s.concepto,
            "origen": "tramite" if s.solicitud_id else ("tasa" if s.deuda_id else "otro"),
            "monto": str(s.monto or 0),
            "medio_pago": s.medio_pago.value if s.medio_pago else None,
            "provider": s.provider,
            "external_id": s.external_id,
            "imputacion_estado": s.imputacion_estado.value if s.imputacion_estado else None,
            "imputacion_referencia_externa": s.imputacion_referencia_externa,
            "imputacion_observacion": s.imputacion_observacion,
        })
    body = json.dumps({
        "municipio": muni_nombre,
        "generado_at": None,  # el caller puede sobrescribir
        "total": len(items),
        "items": items,
    }, ensure_ascii=False, indent=2).encode("utf-8")
    return ExportResult(
        filename=f"pagos_export_{muni_nombre or 'muni'}.json".replace(" ", "_"),
        content_type="application/json; charset=utf-8",
        body=body,
    )


# ---------------------------------------------------------------
# RAFAM (Prov. Buenos Aires) — layout TENTATIVO
# ---------------------------------------------------------------
#
# OJO: el layout real de RAFAM varia entre munis y entre versiones.
# Este formato es una aproximacion plausible basada en formatos contables
# argentinos tipicos (ancho fijo + separador por ';' alterno). Cuando el
# primer muni cliente nos pase su specification, re-escribimos solo esta
# funcion — la API de export queda igual.
#
# Campos (tentativos):
#   1-6    N° comprobante (int rjust 6, zfill)
#   7-16   Fecha DDMMAAAA (+ separador)
#   17-18  Codigo rubro (2 chars)
#   19-48  Concepto (30 chars)
#   49-60  Monto 10.2 (rjust 12, zfill, punto decimal)
#   61-70  N° operacion bancaria (10 chars)
#   71-85  CUT (15 chars)
#
# Total linea: 85 chars + CRLF.
# ---------------------------------------------------------------

def generar_rafam_ba(
    sesiones: Iterable[PagoSesion],
    muni_nombre: str = "",
    mapeo_rubros: dict | None = None,
) -> ExportResult:
    """Genera TXT ancho fijo para RAFAM.

    `mapeo_rubros` es un dict opcional `{tipo_tasa_codigo: codigo_rubro_rafam}`.
    Si no se pasa o no hay match, se usa "99" (otros).
    """
    lineas: list[str] = []
    # Header informativo (algunos sistemas lo toleran, otros lo ignoran)
    lineas.append(
        "* MUNIFY EXPORT TENTATIVO RAFAM — CONFIRMAR LAYOUT CON CONTADURIA *".ljust(85)
    )
    for i, s in enumerate(sesiones, start=1):
        nro_comprobante = _rellenar(str(i), 6, derecha=True).replace(" ", "0")
        fecha = _fmt_fecha_ddmmyyyy(s.completed_at or s.created_at).replace("/", "")
        fecha = _rellenar(fecha, 10)
        codigo_rubro = "99"
        # Si la sesion es de una tasa, podemos mapear con mapeo_rubros
        if mapeo_rubros and s.deuda_id:
            # No tenemos acceso al tipo_tasa aqui sin cargar la deuda —
            # el caller deberia haber cargado sesion.deuda.partida.tipo_tasa
            try:
                tipo_codigo = s.deuda.partida.tipo_tasa.codigo  # type: ignore[attr-defined]
                codigo_rubro = str(mapeo_rubros.get(tipo_codigo, "99"))[:2].rjust(2, "0")
            except Exception:
                pass
        concepto = _rellenar(_safe_str(s.concepto), 30)
        monto_float = float(s.monto or 0)
        monto_str = f"{monto_float:010.2f}"  # "0000123.45"
        monto_field = _rellenar(monto_str, 12, derecha=True)
        nro_op = _rellenar(_safe_str(s.external_id), 10)
        cut = _rellenar(_safe_str(s.codigo_cut_qr), 15)
        linea = (
            nro_comprobante + fecha + codigo_rubro + concepto + monto_field + nro_op + cut
        )
        lineas.append(linea[:85].ljust(85))

    body = ("\r\n".join(lineas) + "\r\n").encode("cp1252", errors="replace")
    return ExportResult(
        filename=f"rafam_{muni_nombre or 'muni'}.txt".replace(" ", "_"),
        content_type="text/plain; charset=windows-1252",
        body=body,
    )


# ---------------------------------------------------------------
# Despachador
# ---------------------------------------------------------------

FORMATOS_DISPONIBLES = {
    "csv": "CSV enriquecido (Excel)",
    "json": "JSON (debug / integraciones)",
    "rafam_ba": "RAFAM Prov. BA (TXT ancho fijo — layout TENTATIVO)",
}


def generar(
    formato: str,
    sesiones: Iterable[PagoSesion],
    muni_nombre: str = "",
    mapeo_rubros: dict | None = None,
) -> ExportResult:
    formato = (formato or "csv").lower()
    if formato == "rafam_ba":
        return generar_rafam_ba(sesiones, muni_nombre, mapeo_rubros)
    if formato == "json":
        return generar_json(sesiones, muni_nombre)
    # default CSV
    return generar_csv(sesiones, muni_nombre)
