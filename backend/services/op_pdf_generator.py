"""Generador de PDF para la Orden de Pago.

Replica el layout institucional de San Pedro Norte (Tribunal de Cuentas).
Una pagina A4 vertical, formato municipal argentino estandar.

Bloques (de arriba a abajo):
  1. Header: datos del muni (izq) + titulo "Orden de Pago" + N* OP + Fecha (der)
  2. PAGUESE POR TESORERIA A: nombre, CUIT, IIBB, IVA, direccion, codigo
  3. CONCEPTO: descripcion + tabla (codigo imputacion | descripcion | importe)
  4. Firmas internas: V*B* Contaduria | Secretario | Intendente
  5. Forma de pago: tabla (tipo | comprobante | detalle | importe)
  6. Firma del receptor: Firma | Aclaracion | DNI
  7. Tribunal de Cuentas: Verificado el / Observaciones + Vocal / VP / Presidente
  8. Pie: nombre del sistema (Munify)
"""
from decimal import Decimal
from io import BytesIO
from typing import Optional

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor, black, gray


# Paleta sobria, B/N + gris para que se imprima bien
INK = black
GRAY_SOFT = HexColor("#777777")
LINE = HexColor("#222222")

# Margenes
M_LEFT = 12 * mm
M_RIGHT = 12 * mm
M_TOP = 12 * mm
M_BOTTOM = 12 * mm


def _format_money(value) -> str:
    """459761.00 -> '459.761,00' (formato AR)"""
    try:
        v = Decimal(value)
    except Exception:
        return str(value)
    s = f"{v:,.2f}"
    # En python el formato US es 459,761.00 -> swap a 459.761,00
    s = s.replace(",", "X").replace(".", ",").replace("X", ".")
    return s


def _draw_box(c: canvas.Canvas, x: float, y: float, w: float, h: float,
              line_width: float = 0.5) -> None:
    c.setStrokeColor(LINE)
    c.setLineWidth(line_width)
    c.rect(x, y, w, h, stroke=1, fill=0)


def _draw_label_value(c: canvas.Canvas, x: float, y: float, label: str, value: str,
                       label_size: int = 6, value_size: int = 10,
                       value_bold: bool = True) -> None:
    """Mini label arriba, valor abajo (estilo formulario)."""
    c.setFillColor(GRAY_SOFT)
    c.setFont("Helvetica", label_size)
    c.drawString(x, y, label)
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold" if value_bold else "Helvetica", value_size)
    c.drawString(x, y - (value_size + 1), value)


def _draw_signature_line(c: canvas.Canvas, cx: float, y: float, width: float, label: str) -> None:
    """Linea horizontal + label centrado abajo."""
    c.setStrokeColor(LINE)
    c.setLineWidth(0.5)
    c.line(cx - width / 2, y, cx + width / 2, y)
    c.setFillColor(INK)
    c.setFont("Helvetica", 8)
    c.drawCentredString(cx, y - 10, label)


def build_op_pdf(*,
                  # Header del muni
                  muni_nombre: str,
                  muni_direccion: str = "",
                  muni_telefono: str = "",
                  muni_cuit: str = "",
                  # Encabezado de la OP
                  numero: str,                       # ej "076263" o "OP-2026-0001"
                  fecha_emision: str,                 # ej "13/11/2025"
                  # Beneficiario
                  beneficiario_nombre: str,
                  beneficiario_cuit: str = "",
                  beneficiario_iibb: str = "",
                  beneficiario_iva: str = "",
                  beneficiario_direccion: str = "",
                  beneficiario_codigo: str = "",
                  # Concepto e imputacion
                  concepto: str,
                  imputacion_codigo: str = "",
                  imputacion_descripcion: str = "",
                  monto: Decimal | float | str = 0,
                  recibos_texto: str = "",            # "recibos 2344-2340-3026" u otra ref
                  # Firmas internas
                  contaduria_nombre: str = "",
                  secretario_nombre: str = "",
                  intendente_nombre: str = "",
                  # Forma de pago (puede estar vacio si la OP aun no fue pagada)
                  tipo_pago: str = "",
                  nro_comprobante_pago: str = "",
                  cuenta_destino: str = "",
                  ) -> bytes:
    """Genera el PDF de la OP y devuelve los bytes."""
    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    page_w, page_h = A4
    inner_w = page_w - M_LEFT - M_RIGHT

    # =================================================================
    # 1. HEADER: muni (izq) + titulo + n* + fecha (der)
    # =================================================================
    y = page_h - M_TOP
    header_h = 32 * mm

    # Caja del muni a la izquierda
    muni_box_w = inner_w * 0.55
    _draw_box(c, M_LEFT, y - header_h, muni_box_w, header_h, line_width=0.7)
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 12)
    c.drawString(M_LEFT + 4 * mm, y - 7 * mm, muni_nombre)
    c.setFont("Helvetica", 8.5)
    line_y = y - 12 * mm
    if muni_direccion:
        c.drawString(M_LEFT + 4 * mm, line_y, muni_direccion)
        line_y -= 4 * mm
    if muni_telefono or muni_cuit:
        parts = []
        if muni_telefono:
            parts.append(f"Tel: {muni_telefono}")
        if muni_cuit:
            parts.append(f"CUIT {muni_cuit}")
        c.drawString(M_LEFT + 4 * mm, line_y, "   ".join(parts))

    # Titulo "Orden de Pago" + recuadro nro/fecha a la derecha
    right_x = M_LEFT + muni_box_w + 4 * mm
    right_w = inner_w - muni_box_w - 4 * mm

    # Titulo arriba
    title_h = 10 * mm
    _draw_box(c, right_x, y - title_h, right_w, title_h, line_width=0.8)
    c.setFont("Helvetica-Bold", 16)
    c.drawCentredString(right_x + right_w / 2, y - title_h + 3 * mm, "Orden de Pago")

    # N* OP + Fecha abajo del titulo
    info_h = header_h - title_h - 1 * mm
    info_y_top = y - title_h - 1 * mm
    _draw_box(c, right_x, info_y_top - info_h, right_w, info_h, line_width=0.5)
    # Linea divisoria horizontal
    mid_y = info_y_top - info_h / 2
    c.line(right_x, mid_y, right_x + right_w, mid_y)

    _draw_label_value(c, right_x + 3 * mm, info_y_top - 4 * mm,
                       "ORDEN DE PAGO N*", numero,
                       label_size=6.5, value_size=12)
    _draw_label_value(c, right_x + 3 * mm, mid_y - 4 * mm,
                       "FECHA", fecha_emision,
                       label_size=6.5, value_size=11)

    y = y - header_h - 3 * mm

    # =================================================================
    # 2. PAGUESE POR TESORERIA A
    # =================================================================
    benef_h = 28 * mm
    _draw_box(c, M_LEFT, y - benef_h, inner_w, benef_h)
    # Mini label arriba
    c.setFillColor(GRAY_SOFT)
    c.setFont("Helvetica", 6.5)
    c.drawString(M_LEFT + 3 * mm, y - 3.5 * mm, "PAGUESE POR TESORERIA A:")
    c.setFillColor(INK)

    # Nombre grande
    c.setFont("Helvetica-Bold", 13)
    c.drawString(M_LEFT + 3 * mm, y - 8.5 * mm, beneficiario_nombre or "—")

    # Linea con CUIT, IIBB, IVA
    fiscal_parts = []
    if beneficiario_cuit:
        fiscal_parts.append(f"CUIT/ID: {beneficiario_cuit}")
    if beneficiario_iibb is not None and beneficiario_iibb != "":
        fiscal_parts.append(f"I.Brutos: {beneficiario_iibb}")
    if beneficiario_iva:
        fiscal_parts.append(f"C.Iva: {beneficiario_iva}")
    if fiscal_parts:
        c.setFont("Helvetica", 9)
        c.drawString(M_LEFT + 3 * mm, y - 14 * mm, "   ".join(fiscal_parts))

    # Direccion
    if beneficiario_direccion:
        c.setFont("Helvetica", 9)
        c.drawString(M_LEFT + 3 * mm, y - 19 * mm, beneficiario_direccion)

    # Codigo interno
    if beneficiario_codigo:
        c.setFont("Helvetica", 9)
        c.drawString(M_LEFT + 3 * mm, y - 24 * mm, f"Codigo: {beneficiario_codigo}")

    y = y - benef_h - 3 * mm

    # =================================================================
    # 3. CONCEPTO + tabla de imputacion
    # =================================================================
    concepto_h = 55 * mm
    _draw_box(c, M_LEFT, y - concepto_h, inner_w, concepto_h)
    c.setFillColor(GRAY_SOFT)
    c.setFont("Helvetica", 6.5)
    c.drawString(M_LEFT + 3 * mm, y - 3.5 * mm, "CONCEPTO")
    c.setFillColor(INK)

    if recibos_texto:
        c.setFont("Helvetica", 8.5)
        c.drawString(M_LEFT + 3 * mm, y - 8 * mm,
                     f"SEGUN ORDEN/ES DE COMPRA: {recibos_texto}")

    # Tabla de imputacion (1 fila por OP - simplificada)
    table_y = y - 14 * mm
    table_h = 28 * mm

    # Columnas
    col_codigo_w = 28 * mm
    col_importe_w = 38 * mm
    col_desc_w = inner_w - col_codigo_w - col_importe_w - 6 * mm
    col_x0 = M_LEFT + 3 * mm
    col_x1 = col_x0 + col_codigo_w
    col_x2 = col_x1 + col_desc_w

    # Header row
    c.setFillColor(GRAY_SOFT)
    c.setFont("Helvetica-Bold", 6.5)
    c.drawString(col_x0, table_y, "CODIGO")
    c.drawString(col_x1, table_y, "DESCRIPCION")
    c.drawRightString(col_x2 + col_importe_w, table_y, "IMPORTE")
    c.setStrokeColor(LINE)
    c.setLineWidth(0.3)
    c.line(col_x0, table_y - 1.5 * mm, col_x2 + col_importe_w, table_y - 1.5 * mm)

    # Fila de datos
    c.setFillColor(INK)
    c.setFont("Helvetica", 10)
    c.drawString(col_x0, table_y - 7 * mm, imputacion_codigo or "—")
    c.drawString(col_x1, table_y - 7 * mm, imputacion_descripcion or concepto)
    c.setFont("Helvetica-Bold", 10)
    c.drawRightString(col_x2 + col_importe_w, table_y - 7 * mm, _format_money(monto))

    # TOTALES
    totales_y = y - concepto_h + 5 * mm
    c.setStrokeColor(LINE)
    c.setLineWidth(0.5)
    c.line(col_x2 - 6 * mm, totales_y + 4 * mm, col_x2 + col_importe_w, totales_y + 4 * mm)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(col_x2 - 18 * mm, totales_y, "TOTALES")
    c.setFont("Helvetica-Bold", 11)
    c.drawRightString(col_x2 + col_importe_w, totales_y, _format_money(monto))

    y = y - concepto_h - 3 * mm

    # =================================================================
    # 4. Firmas internas (3 columnas)
    # =================================================================
    firmas_y = y - 12 * mm
    third = inner_w / 3
    _draw_signature_line(c, M_LEFT + third / 2, firmas_y, 50 * mm, "V* B* Contaduria")
    _draw_signature_line(c, M_LEFT + third + third / 2, firmas_y, 50 * mm, "Secretario")
    _draw_signature_line(c, M_LEFT + 2 * third + third / 2, firmas_y, 50 * mm, "Intendente")

    # Si hay nombres pre-cargados, los muestro debajo del cargo
    if contaduria_nombre:
        c.setFont("Helvetica", 7)
        c.setFillColor(GRAY_SOFT)
        c.drawCentredString(M_LEFT + third / 2, firmas_y - 18, contaduria_nombre)
    if secretario_nombre:
        c.setFont("Helvetica", 7)
        c.setFillColor(GRAY_SOFT)
        c.drawCentredString(M_LEFT + third + third / 2, firmas_y - 18, secretario_nombre)
    if intendente_nombre:
        c.setFont("Helvetica", 7)
        c.setFillColor(GRAY_SOFT)
        c.drawCentredString(M_LEFT + 2 * third + third / 2, firmas_y - 18, intendente_nombre)
    c.setFillColor(INK)

    y = firmas_y - 22 * mm

    # =================================================================
    # 5. Forma de pago (tabla)
    # =================================================================
    pago_h = 30 * mm
    _draw_box(c, M_LEFT, y - pago_h, inner_w, pago_h)

    col_tipo_w = 35 * mm
    col_compr_w = 30 * mm
    col_imp_w = 38 * mm
    col_det_w = inner_w - col_tipo_w - col_compr_w - col_imp_w - 6 * mm

    px0 = M_LEFT + 3 * mm
    px1 = px0 + col_tipo_w
    px2 = px1 + col_compr_w
    px3 = px2 + col_det_w

    # Header
    c.setFillColor(GRAY_SOFT)
    c.setFont("Helvetica-Bold", 6.5)
    c.drawString(px0, y - 4 * mm, "TIPO")
    c.drawString(px1, y - 4 * mm, "COMPROBANTE")
    c.drawString(px2, y - 4 * mm, "DETALLE")
    c.drawRightString(px3 + col_imp_w, y - 4 * mm, "IMPORTE")
    c.setStrokeColor(LINE)
    c.setLineWidth(0.3)
    c.line(px0, y - 5.5 * mm, px3 + col_imp_w, y - 5.5 * mm)

    # Fila
    c.setFillColor(INK)
    c.setFont("Helvetica", 10)
    tipo_pago_print = (tipo_pago or "").capitalize() if tipo_pago else "—"
    c.drawString(px0, y - 11 * mm, tipo_pago_print)
    c.drawString(px1, y - 11 * mm, nro_comprobante_pago or "—")
    c.drawString(px2, y - 11 * mm, cuenta_destino or "—")
    c.setFont("Helvetica-Bold", 10)
    c.drawRightString(px3 + col_imp_w, y - 11 * mm, _format_money(monto))

    # TOTALES
    totales2_y = y - pago_h + 4 * mm
    c.setStrokeColor(LINE)
    c.setLineWidth(0.5)
    c.line(px3 - 6 * mm, totales2_y + 3 * mm, px3 + col_imp_w, totales2_y + 3 * mm)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(px3 - 18 * mm, totales2_y, "TOTALES")
    c.setFont("Helvetica-Bold", 11)
    c.drawRightString(px3 + col_imp_w, totales2_y, _format_money(monto))

    y = y - pago_h - 3 * mm

    # =================================================================
    # 6. Firma del receptor
    # =================================================================
    receptor_y = y - 12 * mm
    _draw_signature_line(c, M_LEFT + third / 2, receptor_y, 50 * mm, "Firma")
    _draw_signature_line(c, M_LEFT + third + third / 2, receptor_y, 50 * mm, "Aclaracion Firma")
    _draw_signature_line(c, M_LEFT + 2 * third + third / 2, receptor_y, 50 * mm, "Documento de Identidad")

    y = receptor_y - 18 * mm

    # =================================================================
    # 7. Tribunal de Cuentas
    # =================================================================
    # Titulo recuadrado
    tdc_box_w = 70 * mm
    tdc_box_h = 7 * mm
    tdc_x = M_LEFT + (inner_w - tdc_box_w) / 2
    _draw_box(c, tdc_x, y - tdc_box_h, tdc_box_w, tdc_box_h, line_width=0.7)
    c.setFont("Helvetica-Bold", 10)
    c.setFillColor(INK)
    c.drawCentredString(tdc_x + tdc_box_w / 2, y - tdc_box_h + 2 * mm,
                         "Honorable Tribunal de Cuentas")

    y = y - tdc_box_h - 6 * mm
    c.setFont("Helvetica", 9)
    c.drawString(M_LEFT, y, "Verificado el:    /    /          OBSERVACIONES: ___________________________________")

    y -= 18 * mm
    _draw_signature_line(c, M_LEFT + third / 2, y, 50 * mm, "Vocal")
    _draw_signature_line(c, M_LEFT + third + third / 2, y, 50 * mm, "Vocal / Vice Presidente")
    _draw_signature_line(c, M_LEFT + 2 * third + third / 2, y, 50 * mm, "Presidente")

    # Pie
    c.setFont("Helvetica-Oblique", 7)
    c.setFillColor(GRAY_SOFT)
    c.drawString(M_LEFT, M_BOTTOM, "Munify - Sistema de Administracion Municipal")

    c.showPage()
    c.save()
    buf.seek(0)
    return buf.getvalue()
