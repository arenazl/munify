"""Genera un brochure PDF de 2 paginas para presentar Munify a una gerencia municipal."""

from pathlib import Path

from reportlab.lib.colors import HexColor, white, black
from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

ROOT = Path(__file__).resolve().parent.parent
LOGO = ROOT / "landing" / "images" / "munify_logo_1.png"
OUTPUT = ROOT / "Munify_Brochure.pdf"

PAGE_W, PAGE_H = A4
MARGIN = 36

PRIMARY = HexColor("#1e6fd9")
PRIMARY_DARK = HexColor("#0f3a78")
ACCENT = HexColor("#22c55e")
WARN = HexColor("#f59e0b")
TEXT = HexColor("#1f2937")
MUTED = HexColor("#64748b")
LIGHT = HexColor("#f1f5f9")
BORDER = HexColor("#e2e8f0")
BG_SOFT = HexColor("#f8fafc")

FONT = "Helvetica"
FONT_BOLD = "Helvetica-Bold"


def draw_wrapped(c, text, x, y, max_width, font=FONT, size=9, leading=12, color=TEXT):
    c.setFont(font, size)
    c.setFillColor(color)
    words = text.split()
    line = ""
    cur_y = y
    for w in words:
        test = (line + " " + w).strip()
        if c.stringWidth(test, font, size) <= max_width:
            line = test
        else:
            c.drawString(x, cur_y, line)
            cur_y -= leading
            line = w
    if line:
        c.drawString(x, cur_y, line)
        cur_y -= leading
    return cur_y


def rounded_box(c, x, y, w, h, radius=6, fill=None, stroke=None, stroke_w=0.6):
    if fill is not None:
        c.setFillColor(fill)
    if stroke is not None:
        c.setStrokeColor(stroke)
        c.setLineWidth(stroke_w)
    c.roundRect(x, y, w, h, radius, fill=1 if fill else 0, stroke=1 if stroke else 0)


def header(c, subtitle):
    # Logo a la izquierda
    logo = ImageReader(str(LOGO))
    iw, ih = logo.getSize()
    target_h = 38
    target_w = target_h * iw / ih
    c.drawImage(logo, MARGIN, PAGE_H - MARGIN - target_h, width=target_w, height=target_h, mask="auto")

    # Linea de subtitulo a la derecha
    c.setFont(FONT, 9)
    c.setFillColor(MUTED)
    c.drawRightString(PAGE_W - MARGIN, PAGE_H - MARGIN - 14, subtitle)
    c.setFont(FONT_BOLD, 10)
    c.setFillColor(PRIMARY_DARK)
    c.drawRightString(PAGE_W - MARGIN, PAGE_H - MARGIN - 28, "Gestion Municipal Inteligente")

    # Linea separadora
    c.setStrokeColor(BORDER)
    c.setLineWidth(0.6)
    sep_y = PAGE_H - MARGIN - target_h - 10
    c.line(MARGIN, sep_y, PAGE_W - MARGIN, sep_y)
    return sep_y - 18


def section_title(c, x, y, text, width):
    # Barra acento a la izquierda
    c.setFillColor(PRIMARY)
    c.rect(x, y - 2, 3, 14, fill=1, stroke=0)
    c.setFont(FONT_BOLD, 12)
    c.setFillColor(PRIMARY_DARK)
    c.drawString(x + 8, y + 1, text.upper())
    return y - 16


def page_one(c):
    y = header(c, "Propuesta institucional")

    # HERO
    y = draw_wrapped(
        c,
        "Modernice la gestion municipal sin papeles, sin colas y sin reclamos perdidos.",
        MARGIN, y, PAGE_W - 2 * MARGIN, font=FONT_BOLD, size=18, leading=22, color=TEXT,
    )
    y -= 4
    y = draw_wrapped(
        c,
        "Munify es la plataforma integral que conecta vecinos, empleados y supervisores en un mismo flujo digital. "
        "Reportes con foto y GPS, asignacion automatica por dependencia, trazabilidad total y notificaciones en tiempo real. "
        "Lista para implementar, sin instalacion ni infraestructura propia.",
        MARGIN, y, PAGE_W - 2 * MARGIN, font=FONT, size=10.5, leading=14, color=MUTED,
    )
    y -= 6

    # Banda azul con 3 propuestas
    band_h = 52
    band_y = y - band_h
    c.setFillColor(PRIMARY_DARK)
    c.rect(MARGIN, band_y, PAGE_W - 2 * MARGIN, band_h, fill=1, stroke=0)
    items = [
        ("0%", "Reclamos perdidos"),
        ("2-3 dias", "Tiempo de respuesta"),
        ("100%", "Trazabilidad de gestiones"),
        ("85-90%", "Satisfaccion del vecino"),
    ]
    col_w = (PAGE_W - 2 * MARGIN) / len(items)
    for i, (big, small) in enumerate(items):
        cx = MARGIN + col_w * i + col_w / 2
        c.setFont(FONT_BOLD, 18)
        c.setFillColor(white)
        c.drawCentredString(cx, band_y + band_h - 22, big)
        c.setFont(FONT, 9)
        c.setFillColor(HexColor("#bfdbfe"))
        c.drawCentredString(cx, band_y + 12, small)
    y = band_y - 18

    # SECCION: El problema hoy
    y = section_title(c, MARGIN, y, "El problema de la gestion tradicional", PAGE_W - 2 * MARGIN)
    y -= 2
    problemas = [
        "Reclamos en papel, cuadernos y planillas que se pierden o quedan sin respuesta.",
        "El vecino llama varias veces para saber que paso con su pedido.",
        "Asignacion manual entre dependencias: dias o semanas hasta llegar al area correcta.",
        "Sin evidencia visual del trabajo realizado, ni metricas para tomar decisiones.",
    ]
    c.setFont(FONT, 9.5)
    for p in problemas:
        c.setFillColor(PRIMARY)
        c.circle(MARGIN + 4, y + 3, 1.6, stroke=0, fill=1)
        c.setFillColor(TEXT)
        c.drawString(MARGIN + 12, y, p)
        y -= 13
    y -= 6

    # TABLA Antes / Despues
    y = section_title(c, MARGIN, y, "Antes vs. con Munify", PAGE_W - 2 * MARGIN)
    rows = [
        ("Tiempo de respuesta", "2 a 4 semanas", "2 a 3 dias"),
        ("Reclamos perdidos", "30 a 40%", "0%"),
        ("Asignacion del trabajo", "Manual, demora dias", "Automatica por dependencia"),
        ("Comunicacion al vecino", "Llamadas repetidas", "Notificaciones automaticas"),
        ("Evidencia del trabajo", "Sin registro", "Fotos antes/despues + GPS"),
        ("Satisfaccion del vecino", "40 a 50%", "85 a 90%"),
    ]
    table_w = PAGE_W - 2 * MARGIN
    col1 = table_w * 0.34
    col2 = table_w * 0.33
    col3 = table_w * 0.33
    row_h = 16
    # Header fila
    c.setFillColor(PRIMARY)
    c.rect(MARGIN, y - row_h, table_w, row_h, fill=1, stroke=0)
    c.setFont(FONT_BOLD, 9)
    c.setFillColor(white)
    c.drawString(MARGIN + 8, y - row_h + 5, "Aspecto")
    c.drawString(MARGIN + col1 + 8, y - row_h + 5, "Gestion tradicional")
    c.drawString(MARGIN + col1 + col2 + 8, y - row_h + 5, "Con Munify")
    y -= row_h
    for i, (a, b, d) in enumerate(rows):
        if i % 2 == 0:
            c.setFillColor(BG_SOFT)
            c.rect(MARGIN, y - row_h, table_w, row_h, fill=1, stroke=0)
        c.setFont(FONT_BOLD, 8.5)
        c.setFillColor(TEXT)
        c.drawString(MARGIN + 8, y - row_h + 5, a)
        c.setFont(FONT, 8.5)
        c.setFillColor(MUTED)
        c.drawString(MARGIN + col1 + 8, y - row_h + 5, b)
        c.setFillColor(PRIMARY_DARK)
        c.setFont(FONT_BOLD, 8.5)
        c.drawString(MARGIN + col1 + col2 + 8, y - row_h + 5, d)
        y -= row_h
    c.setStrokeColor(BORDER)
    c.setLineWidth(0.4)
    c.rect(MARGIN, y, table_w, row_h * (len(rows) + 1), stroke=1, fill=0)
    y -= 14

    # 3 PILARES
    y = section_title(c, MARGIN, y, "Los 3 pilares de Munify", PAGE_W - 2 * MARGIN)
    pilares = [
        ("Tiempo real", "Notificaciones push, chat con WhatsApp y tracking en vivo del estado del pedido."),
        ("Gestion guiada", "Flujo paso a paso por dependencia, IA que sugiere proximas acciones e historial completo."),
        ("100% digital", "Trotting reclamos y tramites desde el celular. Sin papeles, sin colas, sin presencialidad."),
    ]
    pilares[2] = ("100% digital", "Reclamos y tramites desde el celular. Sin papeles, sin colas, sin presencialidad.")
    card_w = (PAGE_W - 2 * MARGIN - 16) / 3
    card_h = 70
    card_y = y - card_h
    for i, (t, d) in enumerate(pilares):
        cx = MARGIN + (card_w + 8) * i
        rounded_box(c, cx, card_y, card_w, card_h, radius=6, fill=BG_SOFT, stroke=BORDER)
        # franja superior
        c.setFillColor(PRIMARY)
        c.rect(cx, card_y + card_h - 4, card_w, 4, fill=1, stroke=0)
        c.setFont(FONT_BOLD, 11)
        c.setFillColor(PRIMARY_DARK)
        c.drawString(cx + 12, card_y + card_h - 22, t)
        draw_wrapped(c, d, cx + 12, card_y + card_h - 38, card_w - 24, font=FONT, size=8.8, leading=11, color=TEXT)
    y = card_y - 16

    # DIFERENCIALES TECNICOS
    y = section_title(c, MARGIN, y, "Diferenciales tecnicos", PAGE_W - 2 * MARGIN)
    diffs = [
        ("Multi-tenant", "Cada municipio con sus datos totalmente aislados. Sin mezcla entre tenants."),
        ("Multiplataforma", "Web responsive, app instalable (PWA) y bot de WhatsApp con un solo backend."),
        ("Inteligencia Artificial", "Categorizacion automatica, asignacion por zona y prediccion de zonas conflictivas."),
        ("Listo para auditar", "Historial completo, evidencia GPS, firma digital y QR verificable en tramites."),
    ]
    diff_w = (PAGE_W - 2 * MARGIN - 18) / 4
    diff_h = 56
    diff_y = y - diff_h
    for i, (t, d) in enumerate(diffs):
        cx = MARGIN + (diff_w + 6) * i
        rounded_box(c, cx, diff_y, diff_w, diff_h, radius=5, fill=white, stroke=BORDER)
        c.setFillColor(PRIMARY_DARK)
        c.rect(cx, diff_y + diff_h - 3, diff_w, 3, fill=1, stroke=0)
        c.setFont(FONT_BOLD, 9.5)
        c.setFillColor(PRIMARY_DARK)
        c.drawString(cx + 8, diff_y + diff_h - 16, t)
        draw_wrapped(c, d, cx + 8, diff_y + diff_h - 28, diff_w - 16, font=FONT, size=8, leading=10, color=TEXT)
    y = diff_y - 10

    # FOOTER pagina 1
    c.setStrokeColor(BORDER)
    c.line(MARGIN, MARGIN + 18, PAGE_W - MARGIN, MARGIN + 18)
    c.setFont(FONT, 8)
    c.setFillColor(MUTED)
    c.drawString(MARGIN, MARGIN + 6, "Munify  |  Plataforma SaaS para municipios de Argentina")
    c.drawRightString(PAGE_W - MARGIN, MARGIN + 6, "Pagina 1 de 2")


def page_two(c):
    y = header(c, "Beneficios y casos de uso")

    # SECCION: Beneficios concretos para el municipio
    y = section_title(c, MARGIN, y, "Beneficios para la gestion municipal", PAGE_W - 2 * MARGIN)
    beneficios = [
        ("Organizacion total", "Archivo unico digital. Cero carpetas perdidas, cero datos duplicados entre areas."),
        ("Decisiones con datos", "Dashboard en vivo con KPIs, mapas de calor y ranking de zonas con mas demanda."),
        ("Menos burocracia", "Tramites 100% online con firma digital y QR verificable. Cero ventanilla para casos simples."),
        ("Asignacion automatica", "Cada reclamo llega solo a la dependencia que corresponde, segun categoria y zona."),
        ("Control operativo", "Fotos antes/despues, GPS del operario, distancia recorrida y tiempos por categoria."),
        ("Canal directo con el vecino", "Web, app instalable y bot de WhatsApp. Sin intermediarios, sin demoras."),
    ]
    col_w = (PAGE_W - 2 * MARGIN - 12) / 2
    box_h = 46
    for i, (t, d) in enumerate(beneficios):
        col = i % 2
        row = i // 2
        bx = MARGIN + (col_w + 12) * col
        by = y - (box_h + 6) * (row + 1)
        rounded_box(c, bx, by, col_w, box_h, radius=5, fill=white, stroke=BORDER)
        c.setFillColor(PRIMARY)
        c.rect(bx, by, 3, box_h, fill=1, stroke=0)
        c.setFont(FONT_BOLD, 10)
        c.setFillColor(PRIMARY_DARK)
        c.drawString(bx + 12, by + box_h - 14, t)
        draw_wrapped(c, d, bx + 12, by + box_h - 28, col_w - 20, font=FONT, size=8.8, leading=11, color=TEXT)
    y = y - (box_h + 6) * 3 - 8

    # SECCION: Los 3 roles
    y = section_title(c, MARGIN, y, "Como trabaja cada rol", PAGE_W - 2 * MARGIN)
    roles = [
        ("Vecino", "Reporta en 30 segundos con foto y GPS. Ve el estado del reclamo en vivo. Recibe notificacion en cada paso."),
        ("Empleado / Dependencia", "Recibe el trabajo asignado en la app. Sube fotos antes y despues. Actualiza el estado con un click."),
        ("Supervisor / Gerencia", "Dashboard ejecutivo, KPIs, mapas de calor, alertas de SLA y reportes automaticos en Excel y PDF."),
    ]
    rcard_w = (PAGE_W - 2 * MARGIN - 16) / 3
    rcard_h = 60
    rcard_y = y - rcard_h
    for i, (t, d) in enumerate(roles):
        cx = MARGIN + (rcard_w + 8) * i
        rounded_box(c, cx, rcard_y, rcard_w, rcard_h, radius=6, fill=BG_SOFT, stroke=BORDER)
        c.setFont(FONT_BOLD, 10.5)
        c.setFillColor(PRIMARY_DARK)
        c.drawString(cx + 10, rcard_y + rcard_h - 16, t)
        draw_wrapped(c, d, cx + 10, rcard_y + rcard_h - 30, rcard_w - 20, font=FONT, size=8.5, leading=10.5, color=TEXT)
    y = rcard_y - 14

    # SECCION: Casos reales
    y = section_title(c, MARGIN, y, "Casos reales medidos", PAGE_W - 2 * MARGIN)
    casos = [
        (
            "Reclamo: bache en la via publica",
            "4 h 15 min total",
            "Vecino reporta con foto + GPS  ->  IA categoriza y asigna a Obras Publicas  ->  cuadrilla resuelve y sube evidencia  ->  vecino recibe notificacion final. 5 notificaciones automaticas en todo el proceso.",
        ),
        (
            "Tramite: libre deuda municipal",
            "0 visitas presenciales",
            "El vecino solicita online  ->  el sistema valida deuda  ->  emite PDF con firma digital y QR verificable. La escribania lo acepta directamente sin pasar por el municipio.",
        ),
    ]
    case_w = (PAGE_W - 2 * MARGIN - 12) / 2
    case_h = 70
    case_y = y - case_h
    for i, (titulo, metrica, detalle) in enumerate(casos):
        cx = MARGIN + (case_w + 12) * i
        rounded_box(c, cx, case_y, case_w, case_h, radius=6, fill=white, stroke=BORDER)
        # franja izq verde
        c.setFillColor(ACCENT)
        c.rect(cx, case_y, 3, case_h, fill=1, stroke=0)
        c.setFont(FONT_BOLD, 10)
        c.setFillColor(TEXT)
        c.drawString(cx + 12, case_y + case_h - 14, titulo)
        c.setFont(FONT_BOLD, 9)
        c.setFillColor(ACCENT)
        c.drawString(cx + 12, case_y + case_h - 26, metrica)
        draw_wrapped(c, detalle, cx + 12, case_y + case_h - 40, case_w - 20, font=FONT, size=8.3, leading=10.5, color=MUTED)
    y = case_y - 16

    # CIERRE: por que ahora
    y = section_title(c, MARGIN, y, "Por que implementarlo ahora", PAGE_W - 2 * MARGIN)
    cierre = [
        "Sin inversion en infraestructura: SaaS multi-tenant en la nube, datos del municipio totalmente aislados.",
        "Implementacion guiada con capacitacion incluida. El equipo lo usa desde el primer dia.",
        "Soporte continuo, actualizaciones automaticas, backups y 99.9% de uptime garantizado.",
        "Periodo de prueba sin costo para validar el impacto antes de cualquier compromiso.",
    ]
    c.setFont(FONT, 9)
    for item in cierre:
        c.setFillColor(ACCENT)
        c.circle(MARGIN + 4, y + 3, 1.6, stroke=0, fill=1)
        c.setFillColor(TEXT)
        draw_wrapped(c, item, MARGIN + 12, y, PAGE_W - 2 * MARGIN - 12, font=FONT, size=9, leading=11, color=TEXT)
        y -= 13

    # CTA / contacto
    cta_h = 48
    cta_y = MARGIN + 22
    c.setFillColor(PRIMARY_DARK)
    c.rect(MARGIN, cta_y, PAGE_W - 2 * MARGIN, cta_h, fill=1, stroke=0)
    c.setFont(FONT_BOLD, 12)
    c.setFillColor(white)
    c.drawString(MARGIN + 16, cta_y + cta_h - 18, "Agendemos una demo de 30 minutos")
    c.setFont(FONT, 9.5)
    c.setFillColor(HexColor("#bfdbfe"))
    c.drawString(MARGIN + 16, cta_y + 12, "WhatsApp +54 9 11 6022-3474   |   ventas@gestionmunicipal.com   |   munify.com.ar")

    # FOOTER pagina 2
    c.setStrokeColor(BORDER)
    c.line(MARGIN, MARGIN + 12, PAGE_W - MARGIN, MARGIN + 12)
    c.setFont(FONT, 8)
    c.setFillColor(MUTED)
    c.drawString(MARGIN, MARGIN, "Munify  |  Plataforma SaaS para municipios de Argentina")
    c.drawRightString(PAGE_W - MARGIN, MARGIN, "Pagina 2 de 2")


def main():
    c = canvas.Canvas(str(OUTPUT), pagesize=A4)
    c.setTitle("Munify - Gestion Municipal Inteligente")
    c.setAuthor("Munify")
    c.setSubject("Brochure institucional para gerencia municipal")

    page_one(c)
    c.showPage()
    page_two(c)
    c.showPage()
    c.save()
    print(f"PDF generado: {OUTPUT}")


if __name__ == "__main__":
    main()
