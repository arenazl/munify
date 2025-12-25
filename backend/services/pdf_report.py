"""
Servicio de generacion de reportes PDF para municipios.
Genera reportes ejecutivos mensuales para intendentes.
"""
from io import BytesIO
from datetime import datetime, date, timedelta
from typing import Dict, Any, List, Optional
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm, mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image
from reportlab.graphics.shapes import Drawing, Rect
from reportlab.graphics.charts.piecharts import Pie
from reportlab.graphics.charts.barcharts import VerticalBarChart
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT


def hex_to_rgb(hex_color: str) -> tuple:
    """Convierte color hex a RGB normalizado (0-1)"""
    hex_color = hex_color.lstrip('#')
    r = int(hex_color[0:2], 16) / 255
    g = int(hex_color[2:4], 16) / 255
    b = int(hex_color[4:6], 16) / 255
    return (r, g, b)


def create_pie_chart(data: Dict[str, int], width: int = 200, height: int = 150) -> Drawing:
    """Crea un grafico de torta"""
    drawing = Drawing(width, height)

    pie = Pie()
    pie.x = 50
    pie.y = 25
    pie.width = 100
    pie.height = 100

    values = list(data.values())
    labels = list(data.keys())

    if sum(values) == 0:
        values = [1]
        labels = ["Sin datos"]

    pie.data = values
    pie.labels = [f"{l}\n({v})" for l, v in zip(labels, values)]

    # Colores para estados
    state_colors = {
        "nuevo": colors.HexColor("#3b82f6"),
        "asignado": colors.HexColor("#f59e0b"),
        "en_proceso": colors.HexColor("#8b5cf6"),
        "resuelto": colors.HexColor("#22c55e"),
        "rechazado": colors.HexColor("#ef4444"),
    }

    pie.slices.strokeWidth = 0.5
    for i, label in enumerate(labels):
        key = label.lower().replace(" ", "_")
        if key in state_colors:
            pie.slices[i].fillColor = state_colors[key]
        else:
            pie.slices[i].fillColor = colors.HexColor("#64748b")

    drawing.add(pie)
    return drawing


def create_bar_chart(data: Dict[str, int], width: int = 400, height: int = 200,
                    primary_color: str = "#3b82f6") -> Drawing:
    """Crea un grafico de barras"""
    drawing = Drawing(width, height)

    bc = VerticalBarChart()
    bc.x = 50
    bc.y = 50
    bc.height = height - 80
    bc.width = width - 100

    values = list(data.values())
    labels = list(data.keys())

    if not values:
        values = [0]
        labels = ["Sin datos"]

    bc.data = [values]
    bc.categoryAxis.categoryNames = labels
    bc.categoryAxis.labels.angle = 45
    bc.categoryAxis.labels.boxAnchor = 'ne'
    bc.categoryAxis.labels.fontSize = 8

    bc.valueAxis.valueMin = 0
    bc.valueAxis.valueMax = max(values) * 1.2 if values and max(values) > 0 else 10

    bc.bars[0].fillColor = colors.HexColor(primary_color)

    drawing.add(bc)
    return drawing


def generate_executive_report(
    municipio_nombre: str,
    municipio_codigo: str,
    color_primario: str,
    periodo: str,
    estadisticas: Dict[str, Any],
    reclamos_por_categoria: Dict[str, int],
    reclamos_por_zona: Dict[str, int],
    reclamos_por_estado: Dict[str, int],
    tendencia_mensual: Dict[str, int],
    top_empleados: List[Dict[str, Any]],
    sla_cumplimiento: float,
    tiempo_promedio_resolucion: float,
    calificacion_promedio: float,
    logo_url: Optional[str] = None,
) -> BytesIO:
    """
    Genera un reporte ejecutivo PDF mensual.

    Returns:
        BytesIO con el contenido del PDF
    """
    buffer = BytesIO()

    # Crear documento
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=2*cm,
        leftMargin=2*cm,
        topMargin=2*cm,
        bottomMargin=2*cm,
    )

    # Estilos
    styles = getSampleStyleSheet()

    primary_rgb = hex_to_rgb(color_primario)
    primary_color = colors.Color(*primary_rgb)

    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Title'],
        fontSize=24,
        textColor=primary_color,
        spaceAfter=30,
        alignment=TA_CENTER,
    )

    heading_style = ParagraphStyle(
        'CustomHeading',
        parent=styles['Heading2'],
        fontSize=14,
        textColor=primary_color,
        spaceBefore=20,
        spaceAfter=10,
        borderWidth=1,
        borderColor=primary_color,
        borderPadding=5,
    )

    normal_style = ParagraphStyle(
        'CustomNormal',
        parent=styles['Normal'],
        fontSize=10,
        textColor=colors.HexColor("#334155"),
    )

    kpi_style = ParagraphStyle(
        'KPI',
        parent=styles['Normal'],
        fontSize=24,
        textColor=primary_color,
        alignment=TA_CENTER,
        fontName='Helvetica-Bold',
    )

    kpi_label_style = ParagraphStyle(
        'KPILabel',
        parent=styles['Normal'],
        fontSize=10,
        textColor=colors.HexColor("#64748b"),
        alignment=TA_CENTER,
    )

    # Contenido del documento
    elements = []

    # === ENCABEZADO ===
    elements.append(Paragraph(f"Reporte Ejecutivo", title_style))
    elements.append(Paragraph(f"Municipalidad de {municipio_nombre}", styles['Heading3']))
    elements.append(Paragraph(f"Periodo: {periodo}", normal_style))
    elements.append(Paragraph(f"Generado: {datetime.now().strftime('%d/%m/%Y %H:%M')}", normal_style))
    elements.append(Spacer(1, 30))

    # === RESUMEN EJECUTIVO ===
    elements.append(Paragraph("Resumen Ejecutivo", heading_style))

    # KPIs principales en tabla
    total_reclamos = estadisticas.get("total", 0)
    resueltos = estadisticas.get("resueltos", 0)
    pendientes = estadisticas.get("pendientes", 0)
    tasa_resolucion = (resueltos / total_reclamos * 100) if total_reclamos > 0 else 0

    kpi_data = [
        [
            Paragraph(str(total_reclamos), kpi_style),
            Paragraph(str(resueltos), kpi_style),
            Paragraph(f"{tasa_resolucion:.1f}%", kpi_style),
            Paragraph(f"{sla_cumplimiento:.1f}%", kpi_style),
        ],
        [
            Paragraph("Total Reclamos", kpi_label_style),
            Paragraph("Resueltos", kpi_label_style),
            Paragraph("Tasa Resolución", kpi_label_style),
            Paragraph("Cumplimiento SLA", kpi_label_style),
        ],
    ]

    kpi_table = Table(kpi_data, colWidths=[4*cm, 4*cm, 4*cm, 4*cm])
    kpi_table.setStyle(TableStyle([
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('BOX', (0, 0), (-1, -1), 1, primary_color),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#f8fafc")),
        ('TOPPADDING', (0, 0), (-1, -1), 10),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
    ]))
    elements.append(kpi_table)
    elements.append(Spacer(1, 20))

    # Segunda fila de KPIs
    kpi_data2 = [
        [
            Paragraph(f"{tiempo_promedio_resolucion:.1f}h", kpi_style),
            Paragraph(f"{calificacion_promedio:.1f}/5", kpi_style),
            Paragraph(str(pendientes), kpi_style),
        ],
        [
            Paragraph("Tiempo Prom. Resolución", kpi_label_style),
            Paragraph("Calificación Ciudadanos", kpi_label_style),
            Paragraph("Pendientes", kpi_label_style),
        ],
    ]

    kpi_table2 = Table(kpi_data2, colWidths=[5.3*cm, 5.3*cm, 5.3*cm])
    kpi_table2.setStyle(TableStyle([
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('BOX', (0, 0), (-1, -1), 1, primary_color),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#f8fafc")),
        ('TOPPADDING', (0, 0), (-1, -1), 10),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
    ]))
    elements.append(kpi_table2)
    elements.append(Spacer(1, 30))

    # === DISTRIBUCION POR ESTADO ===
    elements.append(Paragraph("Distribución por Estado", heading_style))

    # Grafico de torta de estados
    if reclamos_por_estado:
        pie_chart = create_pie_chart(reclamos_por_estado)
        elements.append(pie_chart)
    elements.append(Spacer(1, 20))

    # === RECLAMOS POR CATEGORIA ===
    elements.append(Paragraph("Reclamos por Categoría", heading_style))

    if reclamos_por_categoria:
        # Tabla de categorías
        cat_data = [["Categoría", "Cantidad", "% del Total"]]
        total = sum(reclamos_por_categoria.values())
        for cat, cant in sorted(reclamos_por_categoria.items(), key=lambda x: x[1], reverse=True)[:10]:
            porcentaje = (cant / total * 100) if total > 0 else 0
            cat_data.append([cat, str(cant), f"{porcentaje:.1f}%"])

        cat_table = Table(cat_data, colWidths=[8*cm, 4*cm, 4*cm])
        cat_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), primary_color),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('TOPPADDING', (0, 0), (-1, 0), 12),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
        ]))
        elements.append(cat_table)
    elements.append(Spacer(1, 20))

    # === TOP EMPLEADOS ===
    if top_empleados:
        elements.append(Paragraph("Top Empleados del Mes", heading_style))

        emp_data = [["Empleado", "Resueltos", "Tiempo Prom.", "Calificación"]]
        for emp in top_empleados[:5]:
            emp_data.append([
                emp.get("nombre", "N/A"),
                str(emp.get("resueltos", 0)),
                f"{emp.get('tiempo_promedio', 0):.1f}h",
                f"{emp.get('calificacion', 0):.1f}/5",
            ])

        emp_table = Table(emp_data, colWidths=[6*cm, 3*cm, 4*cm, 3*cm])
        emp_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), primary_color),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('TOPPADDING', (0, 0), (-1, 0), 12),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
        ]))
        elements.append(emp_table)
        elements.append(Spacer(1, 20))

    # === RECLAMOS POR ZONA ===
    if reclamos_por_zona:
        elements.append(Paragraph("Distribución por Zona", heading_style))

        zona_data = [["Zona", "Cantidad"]]
        for zona, cant in sorted(reclamos_por_zona.items(), key=lambda x: x[1], reverse=True)[:8]:
            zona_data.append([zona, str(cant)])

        zona_table = Table(zona_data, colWidths=[10*cm, 6*cm])
        zona_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), primary_color),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
        ]))
        elements.append(zona_table)

    # === PIE DE PAGINA ===
    elements.append(Spacer(1, 40))
    footer_style = ParagraphStyle(
        'Footer',
        parent=styles['Normal'],
        fontSize=8,
        textColor=colors.HexColor("#94a3b8"),
        alignment=TA_CENTER,
    )
    elements.append(Paragraph(
        f"Sistema de Gestión de Reclamos - {municipio_nombre} | Generado automáticamente",
        footer_style
    ))

    # Construir PDF
    doc.build(elements)
    buffer.seek(0)

    return buffer
