"""
Chat API con IA.
Usa el servicio centralizado de chat con fallback automático.
Implementa sesiones para mantener contexto sin reenviar el system prompt.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func as sql_func, case
from sqlalchemy.orm import selectinload
from typing import Optional
from datetime import datetime, timedelta

from core.security import get_current_user, require_roles
from core.database import get_db
from models.categoria import Categoria
from models.user import User
from models.reclamo import Reclamo
from models.tramite import Solicitud, TipoTramite, Tramite, EstadoSolicitud, MunicipioTipoTramite, MunicipioTramite
from models.empleado import Empleado
from models.zona import Zona
from models.municipio import Municipio
from models.enums import EstadoReclamo
from services import chat_service
from services.chat_session import get_landing_storage, get_user_storage
import json
import re
import os
from pathlib import Path


router = APIRouter()

# ==================== SISTEMA DE TEMPLATES ====================

TEMPLATES_DIR = Path(__file__).parent.parent / "templates"
_TEMPLATES_CACHE: dict = {}

def clear_templates_cache():
    """Limpia el cache de templates para forzar recarga"""
    global _TEMPLATES_CACHE
    _TEMPLATES_CACHE = {}
    print("[TEMPLATES] Cache limpiado")

def load_template(template_id: str) -> dict | None:
    """Carga un template desde el archivo JSON"""
    global _TEMPLATES_CACHE

    # Debug: mostrar qué template se está cargando
    print(f"[TEMPLATES] Cargando template: {template_id}")

    if template_id in _TEMPLATES_CACHE:
        print(f"[TEMPLATES] Usando cache para: {template_id}")
        return _TEMPLATES_CACHE[template_id]

    template_path = TEMPLATES_DIR / f"{template_id}.json"
    if not template_path.exists():
        print(f"[TEMPLATES] Template no encontrado: {template_id}")
        return None

    try:
        with open(template_path, 'r', encoding='utf-8') as f:
            template = json.load(f)
            _TEMPLATES_CACHE[template_id] = template
            return template
    except Exception as e:
        print(f"[TEMPLATES] Error cargando template {template_id}: {e}")
        return None

def load_templates_index() -> dict | None:
    """Carga el índice de templates con reglas de detección"""
    index_path = TEMPLATES_DIR / "_index.json"
    if not index_path.exists():
        return None

    try:
        with open(index_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print(f"[TEMPLATES] Error cargando índice: {e}")
        return None

def detectar_formato_automatico(pregunta: str) -> str | None:
    """Detecta el formato automático basado en palabras clave de la consulta"""
    pregunta_lower = pregunta.lower()
    index = load_templates_index()

    if not index or 'deteccion_automatica' not in index:
        return None

    for regla in index['deteccion_automatica']['reglas']:
        for palabra in regla['palabras']:
            if palabra in pregunta_lower:
                print(f"[TEMPLATES] Detectado formato '{regla['template']}' por palabra '{palabra}'")
                return regla['template']

    return None

def get_template_prompt(template_id: str, total: int, datos_count: int = None) -> str | None:
    """Genera el prompt para un template específico

    Args:
        template_id: ID del template (cards, list, table, etc)
        total: Total de registros en la BD
        datos_count: Cantidad de registros que se pasan al LLM (puede ser menor que total)
    """
    print(f"[TEMPLATES] Generando prompt para template: {template_id}")
    template = load_template(template_id)
    if not template:
        print(f"[TEMPLATES] ERROR: No se pudo cargar template {template_id}")
        return None

    # Si no se especifica datos_count, usar total
    if datos_count is None:
        datos_count = total

    print(f"[TEMPLATES] Template cargado: {template.get('nombre', 'SIN NOMBRE')}, datos_count={datos_count}")
    prompt_parts = [f"FORMATO SOLICITADO: {template['nombre'].upper()}"]
    prompt_parts.append(f"\n{template.get('descripcion', '')}")
    prompt_parts.append(f"\nTemplate HTML de ejemplo:\n{template.get('template_html', '')}")

    if template.get('instrucciones'):
        prompt_parts.append("\n\nINSTRUCCIONES:")
        for instruccion in template['instrucciones']:
            # Reemplazar {total} y {datos_count} en las instrucciones
            instruccion = instruccion.replace('{total}', str(total))
            instruccion = instruccion.replace('{datos_count}', str(datos_count))
            prompt_parts.append(f"- {instruccion}")

    if template.get('variantes_color'):
        prompt_parts.append("\n\nVariantes de color disponibles:")
        for nombre, colores in template['variantes_color'].items():
            prompt_parts.append(f"- {nombre}: {colores}")

    if template.get('variantes_estado'):
        prompt_parts.append("\n\nColores por estado:")
        for estado, colores in template['variantes_estado'].items():
            prompt_parts.append(f"- {estado}: {colores}")

    # Agregar regla CRÍTICA sobre estilos inline
    prompt_parts.append("""

⛔⛔⛔ REGLAS CRÍTICAS - VIOLACIÓN = RESPUESTA INVÁLIDA ⛔⛔⛔

PROHIBIDO (si hacés esto, tu respuesta será descartada):
❌ NO uses markdown (**, ##, ```, listas con *, -)
❌ NO uses bloques de código (```html, ```css, ```javascript)
❌ NO generes JavaScript ni <script>
❌ NO uses clases CSS (class="...")
❌ NO expliques el código, NO des instrucciones

OBLIGATORIO:
✅ Respuesta ÚNICAMENTE en HTML puro con estilos inline (style="...")
✅ El HTML debe empezar con <div y terminar con </div>
✅ Sin texto antes ni después del HTML
✅ Español rioplatense si hay texto visible en el HTML""")

    return "\n".join(prompt_parts)


class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None  # Opcional para backwards compatibility
    history: list[dict] = []  # Deprecated, usar session_id


class ChatResponse(BaseModel):
    response: str
    session_id: Optional[str] = None  # Nuevo: devuelve session para mantener contexto


class LandingChatResponse(BaseModel):
    response: str
    session_id: str  # ID de sesión para mantener contexto
    municipio_id: Optional[int] = None
    municipio_nombre: Optional[str] = None


class CategoryQuestionRequest(BaseModel):
    categoria: str
    pregunta: str


class DynamicChatRequest(BaseModel):
    """Request genérico para chat con contexto dinámico"""
    pregunta: str
    contexto: dict = {}
    tipo: Optional[str] = None


class LandingChatRequest(BaseModel):
    """Request para chat público desde la landing page"""
    message: str
    session_id: Optional[str] = None  # ID de sesión para mantener contexto
    municipio_id: Optional[int] = None  # Si se pasa, usa datos de ese municipio


class ValidarDuplicadoRequest(BaseModel):
    """Request para validar si un nombre ya existe (con IA)"""
    nombre: str
    tipo: str  # "categoria", "zona", "tipo_tramite", "tramite"


# ==================== SISTEMA DE KEYWORDS DEL SCHEMA ====================

SCHEMA_PATH = Path(__file__).parent.parent.parent / "APP_GUIDE" / "12_DATABASE_SCHEMA.json"
_SCHEMA_KEYWORDS_CACHE: set[str] | None = None

def load_schema_keywords() -> set[str]:
    """
    Carga las palabras clave del schema de la BD.
    Extrae: nombres de tablas, columnas, valores de enums.
    Se usa para resaltar en los resultados del chat.
    """
    global _SCHEMA_KEYWORDS_CACHE

    if _SCHEMA_KEYWORDS_CACHE is not None:
        return _SCHEMA_KEYWORDS_CACHE

    keywords = set()

    try:
        with open(SCHEMA_PATH, 'r', encoding='utf-8') as f:
            schema = json.load(f)

        entities = schema.get('entities', {})

        for entity_name, entity_data in entities.items():
            # Agregar nombre de tabla (normalizado)
            keywords.add(entity_name.lower())

            # Agregar nombres de columnas
            columns = entity_data.get('columns', {})
            for col_name, col_info in columns.items():
                # Solo agregar columnas "interesantes" (no ids, timestamps, etc)
                if col_name not in ('id', 'created_at', 'updated_at', 'activo'):
                    keywords.add(col_name.lower())

                # Si es enum, agregar los valores
                if col_info.get('type') == 'enum' and col_info.get('values'):
                    for val in col_info['values']:
                        keywords.add(val.lower())

        # Filtrar palabras muy cortas o comunes
        keywords = {k for k in keywords if len(k) >= 3}

        _SCHEMA_KEYWORDS_CACHE = keywords
        print(f"[SCHEMA] Cargadas {len(keywords)} keywords del schema")

    except Exception as e:
        print(f"[SCHEMA] Error cargando keywords: {e}")
        _SCHEMA_KEYWORDS_CACHE = set()

    return _SCHEMA_KEYWORDS_CACHE


def highlight_keywords(text: str, keywords: set[str] = None) -> str:
    """
    Resalta palabras clave del schema en el texto con <strong>.
    Case-insensitive pero preserva el case original.

    Args:
        text: Texto donde buscar
        keywords: Set de keywords (si no se pasa, usa las del schema)

    Returns:
        Texto con keywords envueltas en <strong>
    """
    if not text or not isinstance(text, str):
        return str(text) if text is not None else ""

    if keywords is None:
        keywords = load_schema_keywords()

    if not keywords:
        return text

    # Buscar palabras en el texto que coincidan con keywords
    # Usar word boundaries para no matchear parciales
    result = text

    for keyword in keywords:
        # Crear pattern con word boundaries, case insensitive
        pattern = re.compile(r'\b(' + re.escape(keyword) + r')\b', re.IGNORECASE)
        # Reemplazar preservando el case original
        result = pattern.sub(r'<strong>\1</strong>', result)

    return result


def generar_html_cards(datos: list[dict], descripcion: str = "", highlight: bool = True) -> str:
    """
    Genera HTML de tarjetas directamente desde los datos JSON.

    Prioridad para el título de la tarjeta:
    1. Campo con alias 'header' (explícito)
    2. Campos comunes: nombre, titulo, asunto, nombre_completo
    3. Primer campo que no sea 'id'

    Args:
        datos: Lista de diccionarios con los datos a mostrar
        descripcion: Descripción opcional de la consulta

    Returns:
        HTML con las tarjetas generadas
    """
    if not datos:
        return "<p style='color:var(--text-secondary)'>No hay datos para mostrar.</p>"

    # Campos que típicamente son buenos títulos (en orden de prioridad)
    CAMPOS_TITULO = ['header', 'nombre', 'titulo', 'asunto', 'nombre_completo', 'title', 'name']

    cards_html = []

    for registro in datos:
        if not registro:
            continue

        # Buscar el mejor campo para título
        header_key = None
        header_value = None

        # Primero buscar en campos prioritarios
        for campo_titulo in CAMPOS_TITULO:
            for key in registro.keys():
                if key.lower() == campo_titulo:
                    header_key = key
                    header_value = registro[key]
                    break
            if header_key:
                break

        # Si no encontramos campo prioritario, usar el primero que no sea 'id'
        if header_key is None:
            for key, value in registro.items():
                if key.lower() != 'id':
                    header_key = key
                    header_value = value
                    break

        # Armar lista de otros campos (excluyendo el usado como header)
        otros_campos = [(k, v) for k, v in registro.items() if k != header_key]

        # Formatear el título
        titulo = str(header_value) if header_value is not None else "Sin título"
        if highlight:
            titulo = highlight_keywords(titulo)

        # SVG pequeño para items (circle con dot - lucide "dot")
        item_icon = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none" style="display:inline-block;vertical-align:middle;margin-right:4px"><circle cx="12" cy="12" r="4"/></svg>'

        # Generar items de la card
        items_html = []
        for key, value in otros_campos:
            # Formatear el nombre del campo (quitar underscores, capitalizar)
            campo_nombre = key.replace('_', ' ').title()
            # Formatear el valor
            valor_str = str(value) if value is not None else "-"
            if highlight:
                valor_str = highlight_keywords(valor_str)
            items_html.append(
                f'<div style="font-size:13px;color:var(--text-secondary);margin-bottom:6px">'
                f'{item_icon}<strong>{campo_nombre}:</strong> {valor_str}</div>'
            )

        items_content = "\n    ".join(items_html) if items_html else ""

        # SVG de Lucide "file-text" inline con currentColor
        icon_svg = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;margin-right:6px"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>'

        card_html = f'''<div style="flex:1;min-width:280px;max-width:400px;background:var(--bg-card);border:1px solid var(--border-color);padding:16px;border-radius:12px;margin-bottom:8px">
    <div style="font-size:16px;font-weight:700;color:var(--text-primary);margin-bottom:8px">{icon_svg}{titulo}</div>
    {items_content}
  </div>'''
        cards_html.append(card_html)

    # Contenedor flex para las cards
    html = f'''<div style="display:flex;flex-wrap:wrap;gap:12px;margin:12px 0">
  {"".join(cards_html)}
</div>'''

    # Agregar descripción si existe
    if descripcion:
        html = f'<p style="color:var(--text-secondary);font-size:13px;margin-bottom:8px">{descripcion}</p>\n' + html

    return html


def generar_html_ranking(datos: list[dict], descripcion: str = "", highlight: bool = True) -> str:
    """
    Genera HTML de ranking directamente desde los datos JSON.
    Diseño premium con medallas para top 3.
    """
    if not datos:
        return "<p style='color:var(--text-secondary)'>No hay datos para mostrar.</p>"

    # Configuración de medallas con mejor contraste
    medallas = {
        1: {"bg": "linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)", "border": "#f59e0b", "badge": "#f59e0b", "emoji": "🥇", "shadow": "0 4px 6px -1px rgba(245, 158, 11, 0.3)"},
        2: {"bg": "linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%)", "border": "#9ca3af", "badge": "#6b7280", "emoji": "🥈", "shadow": "0 4px 6px -1px rgba(107, 114, 128, 0.3)"},
        3: {"bg": "linear-gradient(135deg, #fed7aa 0%, #fdba74 100%)", "border": "#ea580c", "badge": "#ea580c", "emoji": "🥉", "shadow": "0 4px 6px -1px rgba(234, 88, 12, 0.3)"},
    }
    default_style = {"bg": "#f9fafb", "border": "#e5e7eb", "badge": "#9ca3af", "emoji": "", "shadow": "none"}

    # Campos que típicamente son buenos títulos
    CAMPOS_TITULO = ['header', 'nombre', 'titulo', 'asunto', 'nombre_completo', 'title', 'name']

    # Detectar campo numérico para métrica
    campo_metrica = None
    primer_registro = datos[0] if datos else {}
    for key, value in primer_registro.items():
        if isinstance(value, (int, float)) and key.lower() not in ['id', 'posicion', 'rank']:
            campo_metrica = key

    rows_html = []

    for idx, registro in enumerate(datos, 1):
        if not registro:
            continue

        # Buscar el mejor campo para título
        header_key = None
        header_value = None

        for campo_titulo in CAMPOS_TITULO:
            for key in registro.keys():
                if key.lower() == campo_titulo:
                    header_key = key
                    header_value = registro[key]
                    break
            if header_key:
                break

        if header_key is None:
            for key, value in registro.items():
                if key.lower() != 'id' and not isinstance(value, (int, float)):
                    header_key = key
                    header_value = value
                    break

        titulo = str(header_value) if header_value is not None else "Sin título"
        if highlight:
            titulo = highlight_keywords(titulo)

        # Obtener valor de métrica
        metrica_valor = ""
        metrica_label = ""
        if campo_metrica and campo_metrica in registro:
            metrica_valor = str(registro[campo_metrica])
            metrica_label = campo_metrica.replace('_', ' ').title()

        # Estilo según posición
        estilo = medallas.get(idx, default_style)
        is_top3 = idx <= 3

        # Badge de posición
        if is_top3:
            badge_html = f'''<div style="width:44px;height:44px;background:{estilo['badge']};border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:20px;box-shadow:{estilo['shadow']}">{estilo['emoji']}</div>'''
        else:
            badge_html = f'''<div style="width:36px;height:36px;background:#f3f4f6;border:2px solid #e5e7eb;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#6b7280;font-weight:700;font-size:14px">{idx}</div>'''

        # Row con o sin gradiente
        if is_top3:
            row_html = f'''<div style="display:flex;align-items:center;gap:16px;padding:16px;background:{estilo['bg']};border:2px solid {estilo['border']};border-radius:12px;margin-bottom:10px;box-shadow:{estilo['shadow']}">
    {badge_html}
    <div style="flex:1">
      <div style="font-weight:700;color:var(--text-primary);font-size:15px">{titulo}</div>
    </div>
    <div style="text-align:right">
      <div style="font-size:24px;font-weight:800;color:{estilo['badge']}">{metrica_valor}</div>
      <div style="font-size:11px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px">{metrica_label}</div>
    </div>
  </div>'''
        else:
            row_html = f'''<div style="display:flex;align-items:center;gap:14px;padding:12px 16px;background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:10px;margin-bottom:10px">
    {badge_html}
    <div style="flex:1">
      <div style="font-weight:600;color:var(--text-primary);font-size:14px">{titulo}</div>
    </div>
    <div style="text-align:right">
      <div style="font-size:18px;font-weight:700;color:var(--color-primary)">{metrica_valor}</div>
      <div style="font-size:10px;color:var(--text-secondary);text-transform:uppercase">{metrica_label}</div>
    </div>
  </div>'''
        rows_html.append(row_html)

    html = f'''<div style="margin:12px 0">
  {"".join(rows_html)}
</div>'''

    if descripcion:
        html = f'<p style="color:var(--text-secondary);font-size:13px;margin-bottom:12px;font-weight:500">{descripcion}</p>\n' + html

    return html


def generar_html_list(datos: list[dict], descripcion: str = "", highlight: bool = True) -> str:
    """
    Genera HTML de lista directamente desde los datos JSON.
    Formato limpio con borde lateral de color.
    """
    if not datos:
        return "<p style='color:var(--text-secondary)'>No hay datos para mostrar.</p>"

    # Campos que típicamente son buenos títulos (en orden de prioridad)
    CAMPOS_TITULO = ['header', 'nombre', 'titulo', 'asunto', 'nombre_completo', 'title', 'name']

    items_html = []

    for registro in datos:
        if not registro:
            continue

        # Buscar el mejor campo para título
        header_key = None
        header_value = None

        for campo_titulo in CAMPOS_TITULO:
            for key in registro.keys():
                if key.lower() == campo_titulo:
                    header_key = key
                    header_value = registro[key]
                    break
            if header_key:
                break

        # Si no encontramos campo prioritario, usar el primero que no sea 'id'
        if header_key is None:
            for key, value in registro.items():
                if key.lower() != 'id':
                    header_key = key
                    header_value = value
                    break

        # Armar lista de otros campos (excluyendo el usado como header)
        otros_campos = [(k, v) for k, v in registro.items() if k != header_key]

        # Formatear el título
        titulo = str(header_value) if header_value is not None else "Sin título"
        if highlight:
            titulo = highlight_keywords(titulo)

        # Armar el detalle
        detalles = []
        for key, value in otros_campos[:4]:  # Max 4 detalles para mantenerlo compacto
            campo_nombre = key.replace('_', ' ').title()
            valor_str = str(value) if value is not None else "-"
            if highlight:
                valor_str = highlight_keywords(valor_str)
            detalles.append(f"<span style='color:var(--text-secondary)'>{campo_nombre}: <strong>{valor_str}</strong></span>")

        detalles_html = " · ".join(detalles) if detalles else ""

        item_html = f'''<li style="padding:14px 18px;margin:12px 0;background:var(--bg-secondary);border-radius:10px;color:var(--text-primary);border-left:4px solid var(--color-primary);list-style:none">
    <strong style="font-size:14px">{titulo}</strong>
    {f'<div style="font-size:12px;margin-top:6px">{detalles_html}</div>' if detalles_html else ''}
  </li>'''
        items_html.append(item_html)

    html = f'''<ul style="margin:12px 0;padding-left:0;list-style:none">
  {"".join(items_html)}
</ul>'''

    if descripcion:
        html = f'<p style="color:var(--text-secondary);font-size:13px;margin-bottom:12px;font-weight:500">{descripcion}</p>\n' + html

    return html


def generar_html_timeline(datos: list[dict], descripcion: str = "", highlight: bool = True) -> str:
    """
    Genera HTML de timeline directamente desde los datos JSON.
    Ordena cronológicamente y muestra como línea de tiempo vertical.
    """
    if not datos:
        return "<p style='color:var(--text-secondary)'>No hay datos para mostrar.</p>"

    # Campos de fecha comunes
    CAMPOS_FECHA = ['created_at', 'fecha', 'date', 'timestamp', 'updated_at', 'fecha_creacion']
    # Campos que típicamente son buenos títulos
    CAMPOS_TITULO = ['accion', 'titulo', 'nombre', 'asunto', 'evento', 'header', 'title']

    # Detectar campo de fecha
    primer_registro = datos[0] if datos else {}
    campo_fecha = None
    for campo in CAMPOS_FECHA:
        if campo in primer_registro:
            campo_fecha = campo
            break

    # Ordenar por fecha si existe (más reciente primero)
    if campo_fecha:
        try:
            datos_ordenados = sorted(datos, key=lambda x: str(x.get(campo_fecha, '')), reverse=True)
        except:
            datos_ordenados = datos
    else:
        datos_ordenados = datos

    events_html = []

    for registro in datos_ordenados:
        if not registro:
            continue

        # Buscar fecha
        fecha_valor = ""
        if campo_fecha and campo_fecha in registro:
            fecha_raw = registro[campo_fecha]
            # Formatear fecha si es string tipo datetime
            if fecha_raw:
                fecha_str = str(fecha_raw)
                # Intentar formatear si tiene formato ISO
                if 'T' in fecha_str or len(fecha_str) > 10:
                    try:
                        from datetime import datetime
                        dt = datetime.fromisoformat(fecha_str.replace('Z', '+00:00').split('.')[0])
                        fecha_valor = dt.strftime('%d/%m/%y %H:%M')
                    except:
                        fecha_valor = fecha_str[:16].replace('T', ' ')
                else:
                    fecha_valor = fecha_str

        # Buscar título
        header_key = None
        header_value = None
        for campo_titulo in CAMPOS_TITULO:
            for key in registro.keys():
                if key.lower() == campo_titulo:
                    header_key = key
                    header_value = registro[key]
                    break
            if header_key:
                break

        if header_key is None:
            for key, value in registro.items():
                if key.lower() not in ['id', campo_fecha] if campo_fecha else ['id']:
                    header_key = key
                    header_value = value
                    break

        titulo = str(header_value) if header_value is not None else "Evento"
        if highlight:
            titulo = highlight_keywords(titulo)

        # Armar detalles (excluyendo fecha y título)
        otros_campos = [(k, v) for k, v in registro.items()
                       if k != header_key and k != campo_fecha and k.lower() != 'id']

        detalles = []
        for key, value in otros_campos[:3]:  # Max 3 detalles
            campo_nombre = key.replace('_', ' ').title()
            valor_str = str(value) if value is not None else "-"
            detalles.append(f"{campo_nombre}: {valor_str}")

        detalles_html = ", ".join(detalles) if detalles else ""

        event_html = f'''<div style="position:relative;padding:12px 0 24px 24px">
    <div style="position:absolute;left:-8px;top:14px;width:14px;height:14px;background:var(--color-primary);border-radius:50%;border:3px solid var(--bg-primary)"></div>
    <div style="font-size:11px;color:var(--text-secondary);margin-bottom:4px">{fecha_valor}</div>
    <div style="font-weight:600;color:var(--text-primary);font-size:14px">{titulo}</div>
    {f'<div style="color:var(--text-secondary);font-size:12px;margin-top:4px">{detalles_html}</div>' if detalles_html else ''}
  </div>'''
        events_html.append(event_html)

    html = f'''<div style="margin:12px 0;padding-left:16px;border-left:3px solid var(--color-primary)">
  {"".join(events_html)}
</div>'''

    if descripcion:
        html = f'<p style="color:var(--text-secondary);font-size:13px;margin-bottom:12px;font-weight:500">{descripcion}</p>\n' + html

    return html


def generar_html_categorias(categorias: list[dict]) -> str:
    """Genera HTML de categorías para mostrar directo al usuario"""
    if not categorias:
        return '<p style="margin:8px 0">No hay categorías disponibles en este momento.</p>'

    cats_items = "".join([
        f'<li style="margin:4px 0;list-style-type:disc"><a href="/gestion/reclamos?categoria={c["nombre"]}" style="color:#2563eb">{c["nombre"]}</a></li>'
        for c in categorias
    ])
    return f'<p style="margin:8px 0">Estas son las categorías de reclamos disponibles:</p><div style="background:#f8f9fa;border-radius:12px;margin:8px 0;border:1px solid #e2e8f0"><div style="background:#2563eb;color:white;padding:10px 14px;font-weight:600;border-radius:12px 12px 0 0">📋 Categorías de Reclamos</div><div style="padding:12px 14px"><ul style="margin:0;padding-left:20px;list-style-type:disc">{cats_items}</ul></div></div>'


def generar_html_tramites(tramites: list[dict]) -> str:
    """Genera HTML de trámites agrupados por tipo para mostrar directo al usuario"""
    if not tramites:
        return '<p style="margin:8px 0">No hay trámites disponibles en este momento.</p>'

    tipos_content = ""
    for tipo in tramites:
        subtipos = tipo.get('subtipos', [])
        if subtipos:
            items = "".join([
                f'<li style="margin:4px 0;list-style-type:disc"><a href="/gestion/tramites?tramite={s["nombre"]}" style="color:#2563eb">{s["nombre"]}</a></li>'
                for s in subtipos
            ])
            tipos_content += f'<strong>{tipo["nombre"]}:</strong><ul style="margin:4px 0 12px 0;padding-left:20px;list-style-type:disc">{items}</ul>'

    return f'<p style="margin:8px 0">Estos son los trámites que podés realizar:</p><div style="background:#f8f9fa;border-radius:12px;margin:8px 0;border:1px solid #e2e8f0"><div style="background:#2563eb;color:white;padding:10px 14px;font-weight:600;border-radius:12px 12px 0 0">📋 Trámites</div><div style="padding:12px 14px">{tipos_content}</div></div>'


def detectar_intencion_listado(mensaje: str) -> str | None:
    """
    Detecta si el usuario quiere ver un listado de trámites o categorías.
    Retorna: 'tramites', 'categorias', o None si no es un listado.
    """
    mensaje_lower = mensaje.lower()

    # Palabras clave para trámites
    palabras_tramites = ['tramite', 'trámite', 'tramites', 'trámites', 'gestiones', 'gestión', 'gestion']
    # Palabras clave para categorías/reclamos
    palabras_categorias = ['categoria', 'categoría', 'categorias', 'categorías', 'reclamo', 'reclamos', 'problema', 'problemas', 'reportar', 'denunciar']
    # Palabras que indican listado
    palabras_listado = ['lista', 'listado', 'listame', 'listá', 'cuales', 'cuáles', 'que', 'qué', 'mostrame', 'mostrá', 'decime', 'decí', 'ver', 'todos', 'todas', 'disponibles', 'hay', 'tienen', 'ofrecen', 'puedo']

    tiene_listado = any(p in mensaje_lower for p in palabras_listado)
    tiene_tramites = any(p in mensaje_lower for p in palabras_tramites)
    tiene_categorias = any(p in mensaje_lower for p in palabras_categorias)

    if tiene_listado or tiene_tramites or tiene_categorias:
        # Si menciona trámites explícitamente
        if tiene_tramites:
            return 'tramites'
        # Si menciona categorías/reclamos explícitamente
        if tiene_categorias:
            return 'categorias'

    return None


def build_system_prompt(categorias: list[dict], tramites: list[dict] = None, telefono_contacto: str = None) -> str:
    """Construye el prompt del sistema con las categorías y trámites del municipio"""

    # Generar HTML de categorías listo para usar
    # Los links usan class="chatLink" con data-tramite para abrir el wizard modal
    cats_html = ""
    if categorias:
        cats_items = "".join([
            f'<li style="margin:4px 0;list-style-type:disc"><a href="#" class="chatLink" data-tramite="{c["id"]}" data-tramite-nombre="{c["nombre"]}" data-tipo="reclamo" style="color:#2563eb;cursor:pointer">{c["nombre"]}</a></li>'
            for c in categorias
        ])
        cats_html = f'<div style="background:#f8f9fa;border-radius:12px;margin:8px 0;border:1px solid #e2e8f0"><div style="background:#2563eb;color:white;padding:10px 14px;font-weight:600;border-radius:12px 12px 0 0">📋 Categorías de Reclamos</div><div style="padding:12px 14px"><ul style="margin:0;padding-left:20px;list-style-type:disc">{cats_items}</ul></div></div>'

    # Generar HTML de trámites agrupados por tipo
    # Los links usan class="chatLink" con data-tramite para abrir el wizard modal
    tramites_html = ""
    if tramites:
        tipos_content = ""
        for tipo in tramites:
            subtipos = tipo.get('subtipos', [])
            if subtipos:
                items = "".join([
                    f'<li style="margin:4px 0;list-style-type:disc"><a href="#" class="chatLink" data-tramite="{s["id"]}" data-tramite-nombre="{s["nombre"]}" data-tipo="tramite" style="color:#2563eb;cursor:pointer">{s["nombre"]}</a></li>'
                    for s in subtipos
                ])
                tipos_content += f'<strong>{tipo["nombre"]}:</strong><ul style="margin:4px 0 12px 0;padding-left:20px;list-style-type:disc">{items}</ul>'

        tramites_html = f'<div style="background:#f8f9fa;border-radius:12px;margin:8px 0;border:1px solid #e2e8f0"><div style="background:#2563eb;color:white;padding:10px 14px;font-weight:600;border-radius:12px 12px 0 0">📋 Trámites</div><div style="padding:12px 14px">{tipos_content}</div></div>'

    # Teléfono de contacto
    tel_info = f"\n📞 Teléfono de contacto: {telefono_contacto}" if telefono_contacto else ""

    # Lista de nombres de trámites para el contexto (con ID para los links)
    tramites_nombres = []
    if tramites:
        for tipo in tramites:
            for subtipo in tipo.get('subtipos', []):
                tramites_nombres.append(f"- {subtipo['nombre']} (ID: {subtipo['id']}, tipo: {tipo['nombre']})")
    tramites_lista = "\n".join(tramites_nombres) if tramites_nombres else "No hay trámites configurados para este municipio."

    # Lista de categorías para el contexto (con ID para los links)
    cats_lista = ", ".join([f"{c['nombre']} (ID: {c['id']})" for c in categorias]) if categorias else "No hay categorías configuradas."

    return f"""Sos el asistente virtual de Munify. Hablás en español rioplatense (vos, podés, tenés).

SOBRE MUNIFY:
Munify es una plataforma que conecta a los vecinos con su municipio. Permite:
- Reportar problemas del barrio (baches, luminarias, basura, árboles caídos, etc.)
- Realizar trámites municipales online sin ir a la municipalidad
- Seguir el estado de tus reclamos y trámites en tiempo real
{tel_info}

CATEGORÍAS DE RECLAMOS DISPONIBLES EN ESTE MUNICIPIO:
{cats_lista}

TRÁMITES DISPONIBLES EN ESTE MUNICIPIO:
{tramites_lista}

IMPORTANTE - INFORMACIÓN DE TRÁMITES Y RECLAMOS:
- Usá la información de categorías y trámites listados arriba como referencia de lo que está disponible en este municipio.
- Si el usuario pregunta por un trámite específico que está en la lista, dale información y ofrecé un link clickeable para ver la guía completa.
- Si pregunta por algo que NO está en la lista, decile que puede consultarlo en la municipalidad o que todavía no está disponible en Munify.
- Para iniciar cualquier trámite o reclamo, el usuario puede hacerlo desde la app Munify o la web.
- NO inventes links externos a páginas del gobierno. Solo mencioná que puede hacerlo desde Munify.

FORMATO DE LINKS CLICKEABLES (MUY IMPORTANTE):
Cuando menciones un trámite o categoría específica, usá este formato exacto para que el usuario pueda hacer click y ver la guía:
- Para trámites: <a href="#" class="chatLink" data-tramite="ID" data-tramite-nombre="NOMBRE" data-tipo="tramite" style="color:#2563eb;cursor:pointer">NOMBRE</a>
- Para reclamos: <a href="#" class="chatLink" data-tramite="ID" data-tramite-nombre="NOMBRE" data-tipo="reclamo" style="color:#2563eb;cursor:pointer">NOMBRE</a>
Donde ID es el número identificador y NOMBRE es el nombre del trámite/categoría.

TU ROL:
Sos un asistente amigable que ayuda a los vecinos a entender qué pueden hacer en Munify. Respondé de forma breve y clara (2-3 oraciones máximo).

ESTILO:
- Respuestas CORTAS y directas (esto es un chat, no un manual)
- Usá HTML para formato: <p>, <strong>, <ul>, <li>
- NO uses markdown, SOLO HTML
- Cuando menciones un trámite o categoría, hacelo clickeable con el formato indicado arriba
- Sé conversacional, como un vecino que ayuda a otro

CUANDO PIDAN VER CATEGORÍAS (mostrar HTML completo):
{cats_html}

CUANDO PIDAN VER TRÁMITES (mostrar HTML completo):
{tramites_html}"""


async def get_categorias_municipio(db: AsyncSession, municipio_id: int) -> list[dict]:
    """Obtiene las categorías activas del municipio via tabla intermedia"""
    from models.categoria import MunicipioCategoria

    query = (
        select(Categoria)
        .join(MunicipioCategoria, MunicipioCategoria.categoria_id == Categoria.id)
        .where(
            MunicipioCategoria.municipio_id == municipio_id,
            MunicipioCategoria.activo == True,
            Categoria.activo == True
        )
        .order_by(Categoria.nombre)
    )

    result = await db.execute(query)
    categorias = result.scalars().all()

    return [{"id": c.id, "nombre": c.nombre, "icono": c.icono or "folder"} for c in categorias]


async def get_tramites_municipio(db: AsyncSession, municipio_id: int) -> list[dict]:
    """Obtiene los trámites activos del municipio, agrupados por tipo"""
    # Obtener trámites habilitados para el municipio (misma lógica que el endpoint de trámites)
    query = (
        select(Tramite)
        .join(MunicipioTramite, Tramite.id == MunicipioTramite.tramite_id)
        .options(selectinload(Tramite.tipo_tramite))
        .where(
            MunicipioTramite.municipio_id == municipio_id,
            MunicipioTramite.activo == True,
            Tramite.activo == True
        )
        .order_by(Tramite.nombre)
    )

    result = await db.execute(query)
    tramites = result.scalars().all()

    # Agrupar por tipo de trámite
    tipos_dict = {}
    for tramite in tramites:
        tipo = tramite.tipo_tramite
        if tipo:
            if tipo.id not in tipos_dict:
                tipos_dict[tipo.id] = {
                    "id": tipo.id,
                    "nombre": tipo.nombre,
                    "icono": tipo.icono or "file-text",
                    "subtipos": []
                }
            tipos_dict[tipo.id]["subtipos"].append({
                "id": tramite.id,
                "nombre": tramite.nombre,
                "icono": tramite.icono or "file"
            })

    return list(tipos_dict.values())


@router.post("", response_model=ChatResponse)
async def chat(
    request: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Endpoint de chat con IA (autenticado).
    Usa las categorías y trámites reales del municipio del usuario.
    Mantiene sesión por user_id para no reenviar el system prompt.
    """
    if not chat_service.is_available():
        raise HTTPException(
            status_code=503,
            detail="El asistente no está disponible. Contacte al administrador."
        )

    storage = get_user_storage()

    # Obtener categorías y trámites del municipio del usuario
    categorias = await get_categorias_municipio(db, current_user.municipio_id)
    tramites = await get_tramites_municipio(db, current_user.municipio_id)

    # Construir system prompt
    system_prompt = build_system_prompt(categorias, tramites)

    # Obtener o crear sesión para este usuario
    session_id, is_new = await storage.get_or_create_for_user(
        user_id=current_user.id,
        system_prompt=system_prompt,
        context={"municipio_id": current_user.municipio_id, "user_id": current_user.id, "rol": current_user.rol},
        session_type="chat"
    )

    # Obtener historial de la sesión
    history = await storage.get_messages(session_id)

    # Construir mensajes para la API
    context = chat_service.build_chat_messages(
        system_prompt=system_prompt,
        message=request.message,
        history=history
    )

    response = await chat_service.chat(context, max_tokens=3000)

    # Guardar mensajes en la sesión
    await storage.add_message(session_id, "user", request.message)
    if response:
        await storage.add_message(session_id, "assistant", response)
        return ChatResponse(response=response, session_id=session_id)

    raise HTTPException(status_code=503, detail="El asistente no está disponible temporalmente.")


@router.post("/categoria", response_model=ChatResponse)
async def chat_categoria(request: CategoryQuestionRequest):
    """
    Endpoint para preguntas sobre una categoría específica.
    No requiere autenticación.
    """
    if not chat_service.is_available():
        return ChatResponse(response="El asistente no está disponible en este momento.")

    prompt = f"""Sos un asistente virtual de la Municipalidad que ayuda a los ciudadanos a realizar reclamos.

El usuario está creando un reclamo en la categoría: "{request.categoria}"

El usuario pregunta: "{request.pregunta}"

Respondé de forma breve y útil (máximo 2-3 oraciones). Si la pregunta no está relacionada con reclamos municipales,
indicá amablemente que solo podés ayudar con temas relacionados a reclamos de la ciudad.

Respuesta:"""

    response = await chat_service.chat(prompt, max_tokens=20000)

    if response:
        return ChatResponse(response=response)

    return ChatResponse(response="No pude procesar tu pregunta. Intentá de nuevo.")


# Cargar info de Munify para el chat de la landing
def get_munify_info() -> str:
    """Carga el archivo MD con información de Munify"""
    from pathlib import Path

    base_path = Path(__file__).parent.parent / "static" / "munify_info.md"

    if base_path.exists():
        with open(base_path, "r", encoding="utf-8") as f:
            return f.read()

    return """
    Munify es un sistema de gestión municipal que permite gestionar reclamos y trámites.
    Contacto: ventas@gestionmunicipal.com / WhatsApp: +54 9 11 6022-3474
    """


async def get_municipios_activos(db: AsyncSession) -> list[dict]:
    """Obtiene todos los municipios activos"""
    query = select(Municipio).where(Municipio.activo == True).order_by(Municipio.nombre)
    result = await db.execute(query)
    municipios = result.scalars().all()
    return [{"id": m.id, "nombre": m.nombre, "codigo": m.codigo} for m in municipios]


@router.get("/municipios")
async def listar_municipios_chat(db: AsyncSession = Depends(get_db)):
    """Endpoint PÚBLICO para obtener municipios activos (para el combo del chat)"""
    municipios = await get_municipios_activos(db)
    return municipios


async def detectar_municipio_con_ia(mensaje: str, municipios: list[dict]) -> Optional[dict]:
    """Usa la IA para detectar qué municipio menciona el usuario"""
    if not municipios:
        return None

    municipios_text = "\n".join([f"- ID:{m['id']} | {m['nombre']}" for m in municipios])

    prompt = f"""Analizá el siguiente mensaje del usuario y determiná si menciona alguno de estos municipios/localidades.
El usuario puede escribir con errores de ortografía, abreviaturas o variaciones del nombre.

MUNICIPIOS DISPONIBLES:
{municipios_text}

MENSAJE DEL USUARIO: "{mensaje}"

RESPUESTA: Respondé SOLO con un JSON válido en este formato exacto:
- Si detectás un municipio: {{"encontrado": true, "municipio_id": <id>, "municipio_nombre": "<nombre>"}}
- Si NO detectás ninguno: {{"encontrado": false}}

Solo el JSON, sin explicaciones."""

    response = await chat_service.chat(prompt, max_tokens=100)

    if response:
        try:
            # Limpiar respuesta y parsear JSON
            response = response.strip()
            if response.startswith("```"):
                response = response.split("```")[1]
                if response.startswith("json"):
                    response = response[4:]
            result = json.loads(response.strip())
            if result.get("encontrado") and result.get("municipio_id"):
                return {"id": result["municipio_id"], "nombre": result.get("municipio_nombre", "")}
        except (json.JSONDecodeError, KeyError):
            pass

    return None


@router.post("/landing", response_model=LandingChatResponse)
async def chat_landing(
    request: LandingChatRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Endpoint PÚBLICO para chat desde la landing page.
    Usa sesiones en memoria para mantener contexto sin reenviar el system prompt.
    """
    storage = get_landing_storage()

    # Verificar si ya existe sesión
    existing_session = None
    if request.session_id:
        existing_session = await storage.get_session(request.session_id)
        print(f"[LANDING CHAT] session_id: {request.session_id}, existe: {existing_session is not None}")

    if existing_session:
        municipio_id = existing_session.get("context", {}).get("municipio_id")
        print(f"[LANDING CHAT] Sesión existente, municipio_id en contexto: {municipio_id}")
    else:
        municipio_id = request.municipio_id
        print(f"[LANDING CHAT] Sin sesión, municipio_id del request: {municipio_id}")

    municipio_nombre = None

    # Si no hay municipio, intentar detectar del mensaje con IA
    if not municipio_id:
        print(f"[LANDING CHAT] No hay municipio, intentando detectar de mensaje: '{request.message}'")
        municipios = await get_municipios_activos(db)
        print(f"[LANDING CHAT] Municipios activos: {len(municipios) if municipios else 0}")
        if municipios:
            detected = await detectar_municipio_con_ia(request.message, municipios)
            print(f"[LANDING CHAT] Resultado detección IA: {detected}")
            if detected:
                municipio_id = detected["id"]
                municipio_nombre = detected.get("nombre")
                print(f"[LANDING CHAT] Municipio detectado: {municipio_id} - {municipio_nombre}")

    # Si no se detectó municipio, responder amablemente y preguntar
    if not municipio_id:
        # Crear sesión sin municipio para mantener el contexto
        if not existing_session:
            session_id = await storage.create_session("", {"municipio_id": None, "esperando_municipio": True})
        else:
            session_id = request.session_id

        # Respuesta amigable según el mensaje
        mensaje_lower = request.message.lower().strip()
        saludos = ['hola', 'buenas', 'buen dia', 'buen día', 'buenos dias', 'buenos días', 'buenas tardes', 'buenas noches', 'hey', 'que tal', 'qué tal', 'como estas', 'cómo estás']

        es_saludo = any(s in mensaje_lower for s in saludos)

        if es_saludo:
            response = '<p style="margin:8px 0">¡Hola! 👋 Bienvenido a <strong>Munify</strong>, tu plataforma para conectar con tu municipio.</p><p style="margin:8px 0">Para poder ayudarte mejor, <strong>¿de qué municipio sos?</strong></p>'
        else:
            response = '<p style="margin:8px 0">¡Hola! Soy el asistente de <strong>Munify</strong>. Para darte información sobre trámites y servicios, necesito saber <strong>¿de qué municipio sos?</strong></p>'

        # Guardar en historial
        await storage.add_message(session_id, "user", request.message)
        await storage.add_message(session_id, "assistant", response)

        return LandingChatResponse(
            response=response,
            session_id=session_id,
            municipio_id=None,
            municipio_nombre=None
        )

    # Obtener datos del municipio
    municipio = await db.get(Municipio, municipio_id)
    telefono_contacto = municipio.telefono if municipio else None

    # Obtener categorías y trámites del municipio
    categorias = await get_categorias_municipio(db, municipio_id)
    tramites = await get_tramites_municipio(db, municipio_id)
    system_prompt = build_system_prompt(categorias, tramites, telefono_contacto)

    # Si ya existe sesión, verificar si necesitamos actualizar el municipio
    municipio_recien_detectado = False
    if existing_session:
        session_id = request.session_id
        history = await storage.get_messages(session_id)
        old_municipio_id = existing_session.get("context", {}).get("municipio_id")

        # Si la sesión no tenía municipio y ahora sí, actualizar
        if not old_municipio_id and municipio_id:
            await storage.update_session(session_id, system_prompt=system_prompt, context={"municipio_id": municipio_id, "esperando_municipio": False})
            municipio_recien_detectado = True
            print(f"[LANDING CHAT] Sesión actualizada con municipio {municipio_id}")
    else:
        # Nueva sesión: crear con datos del municipio
        session_id = await storage.create_session(system_prompt, {"municipio_id": municipio_id})
        history = []

    # Si acabamos de detectar el municipio, dar bienvenida directa (sin IA)
    if municipio_recien_detectado:
        municipio_nombre = municipio.nombre if municipio else "tu municipio"
        response = f'<p style="margin:8px 0">¡Genial! Veo que sos de <strong>{municipio_nombre}</strong>. 🏘️</p><p style="margin:8px 0">¿En qué te puedo ayudar? Podés preguntarme sobre <strong>trámites</strong>, <strong>reclamos</strong>, o cualquier duda sobre los servicios municipales.</p>'

        await storage.add_message(session_id, "user", request.message)
        await storage.add_message(session_id, "assistant", response)

        return LandingChatResponse(
            response=response,
            session_id=session_id,
            municipio_id=municipio_id,
            municipio_nombre=municipio_nombre
        )

    # Detectar si el usuario pide un listado directo (sin pasar por IA)
    intencion = detectar_intencion_listado(request.message)

    if intencion:
        # Obtener datos frescos de la BD para el listado
        if intencion == 'tramites':
            tramites_data = await get_tramites_municipio(db, municipio_id)
            response = generar_html_tramites(tramites_data)
            print(f"[LANDING CHAT] Listado directo de trámites: {len(tramites_data)} tipos")
        else:  # categorias
            categorias_data = await get_categorias_municipio(db, municipio_id)
            response = generar_html_categorias(categorias_data)
            print(f"[LANDING CHAT] Listado directo de categorías: {len(categorias_data)} categorías")
    else:
        # Conversación normal: usar IA
        context = chat_service.build_chat_messages(
            system_prompt=system_prompt,
            message=request.message,
            history=history
        )
        response = await chat_service.chat(context, max_tokens=3000)

    # Guardar mensajes en la sesión
    await storage.add_message(session_id, "user", request.message)
    if response:
        await storage.add_message(session_id, "assistant", response)

    # Después de 3-4 interacciones, agregar el teléfono de contacto
    mensajes_usuario = len([m for m in history if m.get("role") == "user"]) + 1  # +1 por el mensaje actual
    if mensajes_usuario >= 3 and telefono_contacto:
        # Solo agregar si no lo agregamos antes
        ya_mostro_telefono = any("contactanos al" in m.get("content", "").lower() for m in history if m.get("role") == "assistant")
        if not ya_mostro_telefono:
            response += f'<p style="margin:12px 0;padding:10px;background:#f0f9ff;border-radius:8px;border-left:4px solid #2563eb">📞 Si preferís, también podés contactarnos directamente al <strong>{telefono_contacto}</strong></p>'

    # Obtener nombre del municipio si no lo tenemos
    if not municipio_nombre and municipio:
        municipio_nombre = municipio.nombre

    if response:
        return LandingChatResponse(
            response=response,
            session_id=session_id,
            municipio_id=municipio_id,
            municipio_nombre=municipio_nombre
        )

    return LandingChatResponse(
        response="Disculpá, no pude procesar tu consulta. Contactanos por WhatsApp al +54 9 11 6022-3474.",
        session_id=session_id,
        municipio_id=municipio_id,
        municipio_nombre=municipio_nombre
    )


@router.post("/dinamico", response_model=ChatResponse)
async def chat_dinamico(request: DynamicChatRequest):
    """
    Endpoint genérico de chat con IA.
    Recibe cualquier contexto y arma el prompt dinámicamente.
    No requiere autenticación.
    """
    if not chat_service.is_available():
        return ChatResponse(response="El asistente no está disponible en este momento.")

    ctx = request.contexto
    municipio = ctx.get('municipio', '') or 'Municipalidad'
    categoria = ctx.get('categoria', '') or ''
    tramite = ctx.get('tramite', '') or ''
    pregunta = request.pregunta or ''

    # Si es un chat contextual del tramite wizard, usar el prompt tal cual viene
    if request.tipo == 'tramite_contextual' and pregunta:
        print(f"[CHAT CONTEXTUAL TRAMITE] Prompt directo: {pregunta[:100]}...")
        response = await chat_service.chat(pregunta, max_tokens=300)
        if response:
            return ChatResponse(response=response)
        return ChatResponse(response="")

    # Si es un chat contextual del reclamo wizard, usar el prompt tal cual viene
    if request.tipo == 'reclamo_contextual' and pregunta:
        print(f"[CHAT CONTEXTUAL RECLAMO] Prompt directo: {pregunta[:100]}...")
        response = await chat_service.chat(pregunta, max_tokens=300)
        if response:
            return ChatResponse(response=response)
        return ChatResponse(response="")

    if not tramite and not categoria:
        return ChatResponse(response="Seleccioná primero un trámite para recibir información.")

    # Extraer info adicional del contexto
    descripcion = ctx.get('descripcion', '')
    documentos = ctx.get('documentos_requeridos', '')
    requisitos = ctx.get('requisitos', '')
    tiempo = ctx.get('tiempo_estimado', '')
    costo = ctx.get('costo', '')

    if tramite:
        prompt = f"""Trámite: "{tramite}" en {municipio}. Categoría: {categoria}.
Info disponible: {descripcion or ''} {documentos or ''} {requisitos or ''} Tiempo: {tiempo}. Costo: {costo}.

Respondé en español argentino, MUY BREVE (máximo 100 palabras). Formato:
- 2-3 requisitos clave
- 2-3 documentos principales
- 1 tip útil

Sin introducciones ni despedidas. Solo la info práctica."""
    else:
        prompt = f"Categoría: {categoria}. Municipio: {municipio}. ¿Qué trámites hay en esta categoría?"

    if pregunta:
        prompt = f"{prompt}\n\nPREGUNTA ESPECÍFICA DEL USUARIO: {pregunta}\nRespondé específicamente a esta pregunta."

    print(f"[CHAT DINAMICO] Prompt: {prompt}")

    response = await chat_service.chat(prompt, max_tokens=1000)

    if response:
        return ChatResponse(response=response)

    return ChatResponse(response="No pude procesar tu pregunta. Intentá de nuevo.")


@router.get("/status")
async def chat_status():
    """Verificar si el servicio de IA está disponible."""
    if not chat_service.is_available():
        return {
            "status": "unavailable",
            "message": "No hay proveedores de IA configurados"
        }

    # Test rápido
    response = await chat_service.chat("Hola", max_tokens=10)

    if response:
        return {
            "status": "ok",
            "message": "Servicio de IA disponible"
        }

    return {
        "status": "error",
        "message": "No se pudo conectar con ningún proveedor"
    }


# ==================== ASISTENTE CON ACCESO A DATOS ====================

class AsistenteRequest(BaseModel):
    """Request para el asistente con acceso a datos"""
    message: str
    session_id: Optional[str] = None  # Opcional para backwards compatibility
    history: list[dict] = []  # Deprecated, usar session_id


async def get_estadisticas_temporales(db: AsyncSession, municipio_id: int) -> dict:
    """Obtiene estadísticas de reclamos por período (hoy, esta semana, este mes)"""
    from datetime import date

    hoy = date.today()
    inicio_semana = hoy - timedelta(days=hoy.weekday())  # Lunes de esta semana
    inicio_mes = hoy.replace(day=1)

    query = select(
        sql_func.count(Reclamo.id).label('total'),
        sql_func.sum(case((sql_func.date(Reclamo.created_at) == hoy, 1), else_=0)).label('hoy'),
        sql_func.sum(case((sql_func.date(Reclamo.created_at) >= inicio_semana, 1), else_=0)).label('esta_semana'),
        sql_func.sum(case((sql_func.date(Reclamo.created_at) >= inicio_mes, 1), else_=0)).label('este_mes'),
    ).where(Reclamo.municipio_id == municipio_id)

    result = await db.execute(query)
    row = result.first()

    return {
        'hoy': row.hoy or 0,
        'esta_semana': row.esta_semana or 0,
        'este_mes': row.este_mes or 0,
    }


async def get_estadisticas_reclamos(db: AsyncSession, municipio_id: int) -> dict:
    """Obtiene estadísticas de reclamos del municipio"""
    # Total y por estado
    query = select(
        sql_func.count(Reclamo.id).label('total'),
        sql_func.sum(case((Reclamo.estado == EstadoReclamo.NUEVO, 1), else_=0)).label('nuevos'),
        sql_func.sum(case((Reclamo.estado == EstadoReclamo.ASIGNADO, 1), else_=0)).label('asignados'),
        sql_func.sum(case((Reclamo.estado == EstadoReclamo.EN_CURSO, 1), else_=0)).label('en_curso'),
        sql_func.sum(case((Reclamo.estado == EstadoReclamo.PENDIENTE_CONFIRMACION, 1), else_=0)).label('pendiente_confirmacion'),
        sql_func.sum(case((Reclamo.estado == EstadoReclamo.RESUELTO, 1), else_=0)).label('resueltos'),
        sql_func.sum(case((Reclamo.estado == EstadoReclamo.RECHAZADO, 1), else_=0)).label('rechazados'),
    ).where(Reclamo.municipio_id == municipio_id)

    result = await db.execute(query)
    row = result.first()

    return {
        'total': row.total or 0,
        'nuevos': row.nuevos or 0,
        'asignados': row.asignados or 0,
        'en_curso': row.en_curso or 0,
        'pendiente_confirmacion': row.pendiente_confirmacion or 0,
        'resueltos': row.resueltos or 0,
        'rechazados': row.rechazados or 0,
    }


async def get_estadisticas_tramites(db: AsyncSession, municipio_id: int) -> dict:
    """Obtiene estadísticas de trámites/solicitudes del municipio"""
    query = select(
        sql_func.count(Solicitud.id).label('total'),
        sql_func.sum(case((Solicitud.estado == EstadoSolicitud.INICIADO, 1), else_=0)).label('iniciados'),
        sql_func.sum(case((Solicitud.estado == EstadoSolicitud.EN_REVISION, 1), else_=0)).label('en_revision'),
        sql_func.sum(case((Solicitud.estado == EstadoSolicitud.REQUIERE_DOCUMENTACION, 1), else_=0)).label('requiere_doc'),
        sql_func.sum(case((Solicitud.estado == EstadoSolicitud.EN_CURSO, 1), else_=0)).label('en_curso'),
        sql_func.sum(case((Solicitud.estado == EstadoSolicitud.APROBADO, 1), else_=0)).label('aprobados'),
        sql_func.sum(case((Solicitud.estado == EstadoSolicitud.RECHAZADO, 1), else_=0)).label('rechazados'),
        sql_func.sum(case((Solicitud.estado == EstadoSolicitud.FINALIZADO, 1), else_=0)).label('finalizados'),
    ).where(Solicitud.municipio_id == municipio_id)

    result = await db.execute(query)
    row = result.first()

    return {
        'total': row.total or 0,
        'iniciados': row.iniciados or 0,
        'en_revision': row.en_revision or 0,
        'requiere_documentacion': row.requiere_doc or 0,
        'en_curso': row.en_curso or 0,
        'aprobados': row.aprobados or 0,
        'rechazados': row.rechazados or 0,
        'finalizados': row.finalizados or 0,
    }


async def get_reclamos_recientes(db: AsyncSession, municipio_id: int, limit: int = 10) -> list:
    """Obtiene los reclamos más recientes"""
    query = select(Reclamo).options(
        selectinload(Reclamo.categoria),
        selectinload(Reclamo.creador),
        selectinload(Reclamo.empleado_asignado)
    ).where(
        Reclamo.municipio_id == municipio_id
    ).order_by(Reclamo.created_at.desc()).limit(limit)

    result = await db.execute(query)
    reclamos = result.scalars().all()

    return [{
        'id': r.id,
        'titulo': r.titulo,
        'estado': r.estado.value if r.estado else 'desconocido',
        'categoria': r.categoria.nombre if r.categoria else 'Sin categoría',
        'direccion': r.direccion,
        'fecha': r.created_at.strftime('%d/%m/%Y') if r.created_at else '',
        'prioridad': r.prioridad,
        'creador': f"{r.creador.nombre} {r.creador.apellido}" if r.creador else 'Anónimo',
        'empleado_asignado': f"{r.empleado_asignado.nombre} {r.empleado_asignado.apellido or ''}".strip() if r.empleado_asignado else None,
    } for r in reclamos]


async def get_reclamos_por_usuario(db: AsyncSession, municipio_id: int, nombre_buscar: str) -> list:
    """Busca reclamos por nombre del creador (parcial, case insensitive)"""
    from models.user import User as UserModel

    search_term = f"%{nombre_buscar}%"
    query = select(Reclamo).options(
        selectinload(Reclamo.categoria),
        selectinload(Reclamo.creador)
    ).join(
        UserModel, Reclamo.creador_id == UserModel.id
    ).where(
        Reclamo.municipio_id == municipio_id,
        (UserModel.nombre.ilike(search_term)) |
        (UserModel.apellido.ilike(search_term)) |
        (sql_func.concat(UserModel.nombre, ' ', UserModel.apellido).ilike(search_term))
    ).order_by(Reclamo.created_at.desc()).limit(20)

    result = await db.execute(query)
    reclamos = result.scalars().all()

    return [{
        'id': r.id,
        'titulo': r.titulo,
        'estado': r.estado.value if r.estado else 'desconocido',
        'categoria': r.categoria.nombre if r.categoria else 'Sin categoría',
        'direccion': r.direccion,
        'fecha': r.created_at.strftime('%d/%m/%Y') if r.created_at else '',
        'creador': f"{r.creador.nombre} {r.creador.apellido}" if r.creador else 'Anónimo',
    } for r in reclamos]


async def get_usuarios_con_reclamos(db: AsyncSession, municipio_id: int, limit: int = 15) -> list:
    """Obtiene usuarios que tienen reclamos, con conteo"""
    from models.user import User as UserModel

    query = select(
        UserModel.id,
        UserModel.nombre,
        UserModel.apellido,
        sql_func.count(Reclamo.id).label('total_reclamos'),
        sql_func.sum(case((Reclamo.estado.in_([EstadoReclamo.NUEVO, EstadoReclamo.ASIGNADO, EstadoReclamo.EN_CURSO]), 1), else_=0)).label('activos'),
        sql_func.sum(case((Reclamo.estado == EstadoReclamo.RESUELTO, 1), else_=0)).label('resueltos'),
    ).join(
        Reclamo, Reclamo.creador_id == UserModel.id
    ).where(
        Reclamo.municipio_id == municipio_id
    ).group_by(
        UserModel.id, UserModel.nombre, UserModel.apellido
    ).order_by(sql_func.count(Reclamo.id).desc()).limit(limit)

    result = await db.execute(query)
    rows = result.all()

    return [{
        'id': r.id,
        'nombre': f"{r.nombre} {r.apellido}",
        'total_reclamos': r.total_reclamos,
        'activos': r.activos or 0,
        'resueltos': r.resueltos or 0,
    } for r in rows]


async def get_tramites_recientes(db: AsyncSession, municipio_id: int, limit: int = 10) -> list:
    """Obtiene las solicitudes de trámites más recientes"""
    query = select(Solicitud).options(
        selectinload(Solicitud.tramite)
    ).where(
        Solicitud.municipio_id == municipio_id
    ).order_by(Solicitud.created_at.desc()).limit(limit)

    result = await db.execute(query)
    solicitudes = result.scalars().all()

    return [{
        'id': s.id,
        'numero': s.numero_tramite,
        'asunto': s.asunto,
        'estado': s.estado.value if s.estado else 'desconocido',
        'tramite': s.tramite.nombre if s.tramite else 'Sin trámite',
        'solicitante': f"{s.nombre_solicitante or ''} {s.apellido_solicitante or ''}".strip() or 'Anónimo',
        'fecha': s.created_at.strftime('%d/%m/%Y') if s.created_at else '',
        'prioridad': s.prioridad,
    } for s in solicitudes]


async def get_reclamos_por_categoria(db: AsyncSession, municipio_id: int) -> list:
    """Obtiene cantidad de reclamos agrupados por categoría"""
    from models.categoria import MunicipioCategoria

    query = select(
        Categoria.nombre,
        sql_func.count(Reclamo.id).label('cantidad')
    ).join(
        Reclamo, Reclamo.categoria_id == Categoria.id
    ).join(
        MunicipioCategoria, MunicipioCategoria.categoria_id == Categoria.id
    ).where(
        MunicipioCategoria.municipio_id == municipio_id
    ).group_by(Categoria.nombre).order_by(sql_func.count(Reclamo.id).desc())

    result = await db.execute(query)
    rows = result.all()

    return [{'categoria': r.nombre, 'cantidad': r.cantidad} for r in rows]


async def get_empleados_activos(db: AsyncSession, municipio_id: int) -> list:
    """Obtiene todos los empleados activos con estadísticas de reclamos"""
    # Obtener empleados activos
    query = select(Empleado).where(
        Empleado.municipio_id == municipio_id,
        Empleado.activo == True
    ).order_by(Empleado.nombre)

    result = await db.execute(query)
    empleados = result.scalars().all()

    empleados_data = []
    for emp in empleados:
        # TODO: Migrar a dependencia cuando se implemente asignación por IA
        # Por ahora stats en 0 ya que no hay empleado_id en reclamos
        empleados_data.append({
            'id': emp.id,
            'nombre': f"{emp.nombre} {emp.apellido or ''}".strip(),
            'especialidad': emp.especialidad,
            'asignados': 0,
            'en_curso': 0,
            'pendiente_confirmacion': 0,
            'resueltos': 0,
            'activos': 0,
            'total': 0
        })

    return empleados_data


# ==================== QUERIES DINÁMICOS PARA CHAT ====================

# Definición de queries disponibles para el asistente
AVAILABLE_QUERIES = {
    "reclamos_atrasados": {
        "descripcion": "Reclamos más antiguos sin resolver (ordenados por antigüedad)",
        "parametros": ["limit"]
    },
    "reclamos_por_estado": {
        "descripcion": "Lista de reclamos filtrados por estado específico",
        "parametros": ["estado", "limit"]
    },
    "reclamos_por_empleado": {
        "descripcion": "Reclamos asignados a un empleado específico",
        "parametros": ["empleado_id", "limit"]
    },
    "reclamos_por_categoria": {
        "descripcion": "Reclamos de una categoría específica",
        "parametros": ["categoria", "limit"]
    },
    "reclamos_por_fecha": {
        "descripcion": "Reclamos en un rango de fechas",
        "parametros": ["fecha_inicio", "fecha_fin", "limit"]
    },
    "empleados_ranking": {
        "descripcion": "Ranking de empleados por cantidad de reclamos resueltos",
        "parametros": ["limit"]
    },
    "categorias_ranking": {
        "descripcion": "Categorías ordenadas por cantidad de reclamos",
        "parametros": ["limit"]
    },
    "usuarios_frecuentes": {
        "descripcion": "Vecinos que más reclamos han creado",
        "parametros": ["limit"]
    },
    "buscar_reclamo": {
        "descripcion": "Buscar reclamo por ID o texto en título/descripción",
        "parametros": ["query"]
    }
}


async def execute_dynamic_query(
    db: AsyncSession,
    municipio_id: int,
    query_name: str,
    params: dict
) -> dict:
    """Ejecuta un query dinámico y retorna los resultados formateados"""

    limit = params.get("limit", 10)

    if query_name == "reclamos_atrasados":
        # Reclamos más antiguos que NO están resueltos ni rechazados
        query = select(Reclamo).options(
            selectinload(Reclamo.categoria),
            selectinload(Reclamo.empleado_asignado),
            selectinload(Reclamo.creador)
        ).where(
            Reclamo.municipio_id == municipio_id,
            Reclamo.estado.notin_([EstadoReclamo.RESUELTO, EstadoReclamo.RECHAZADO])
        ).order_by(Reclamo.created_at.asc()).limit(limit)

        result = await db.execute(query)
        reclamos = result.scalars().all()

        data = []
        for r in reclamos:
            dias = (datetime.now() - r.created_at).days if r.created_at else 0
            data.append({
                'id': r.id,
                'titulo': r.titulo,
                'estado': r.estado.value if r.estado else 'desconocido',
                'categoria': r.categoria.nombre if r.categoria else 'Sin categoría',
                'direccion': r.direccion or '',
                'dias_antiguedad': dias,
                'fecha_creacion': r.created_at.strftime('%d/%m/%Y') if r.created_at else '',
                'empleado': f"{r.empleado_asignado.nombre} {r.empleado_asignado.apellido or ''}".strip() if r.empleado_asignado else None,
                'creador': f"{r.creador.nombre} {r.creador.apellido or ''}".strip() if r.creador else 'Anónimo'
            })

        return {
            "query": "reclamos_atrasados",
            "total": len(data),
            "descripcion": f"Los {len(data)} reclamos más antiguos sin resolver",
            "data": data
        }

    elif query_name == "reclamos_por_estado":
        estado_str = params.get("estado", "nuevo").lower()
        estado_map = {
            "nuevo": EstadoReclamo.NUEVO,
            "asignado": EstadoReclamo.ASIGNADO,
            "en_curso": EstadoReclamo.EN_CURSO,
            "pendiente_confirmacion": EstadoReclamo.PENDIENTE_CONFIRMACION,
            "resuelto": EstadoReclamo.RESUELTO,
            "rechazado": EstadoReclamo.RECHAZADO
        }
        estado = estado_map.get(estado_str)

        if not estado:
            return {"query": query_name, "error": f"Estado '{estado_str}' no válido", "data": []}

        query = select(Reclamo).options(
            selectinload(Reclamo.categoria),
            selectinload(Reclamo.empleado_asignado),
            selectinload(Reclamo.creador)
        ).where(
            Reclamo.municipio_id == municipio_id,
            Reclamo.estado == estado
        ).order_by(Reclamo.created_at.desc()).limit(limit)

        result = await db.execute(query)
        reclamos = result.scalars().all()

        data = [{
            'id': r.id,
            'titulo': r.titulo,
            'estado': r.estado.value,
            'categoria': r.categoria.nombre if r.categoria else 'Sin categoría',
            'direccion': r.direccion or '',
            'fecha': r.created_at.strftime('%d/%m/%Y') if r.created_at else '',
            'empleado': f"{r.empleado_asignado.nombre} {r.empleado_asignado.apellido or ''}".strip() if r.empleado_asignado else None,
            'creador': f"{r.creador.nombre} {r.creador.apellido or ''}".strip() if r.creador else 'Anónimo'
        } for r in reclamos]

        return {
            "query": "reclamos_por_estado",
            "estado": estado_str,
            "total": len(data),
            "descripcion": f"{len(data)} reclamos en estado '{estado_str}'",
            "data": data
        }

    elif query_name == "reclamos_por_empleado":
        # TODO: Migrar a dependencia cuando se implemente asignación por IA
        # Por ahora retorna lista vacía ya que no hay empleado_id en reclamos
        empleado_id = params.get("empleado_id")
        if not empleado_id:
            return {"query": query_name, "error": "Se requiere empleado_id", "data": []}

        # Obtener nombre del empleado
        emp_query = select(Empleado).where(Empleado.id == int(empleado_id))
        emp_result = await db.execute(emp_query)
        empleado = emp_result.scalar_one_or_none()
        emp_nombre = f"{empleado.nombre} {empleado.apellido or ''}".strip() if empleado else f"ID {empleado_id}"

        return {
            "query": "reclamos_por_empleado",
            "empleado": emp_nombre,
            "total": 0,
            "descripcion": f"Pendiente migración a dependencias",
            "data": []
        }

    elif query_name == "empleados_ranking":
        # TODO: Migrar a dependencia cuando se implemente asignación por IA
        # Por ahora retorna lista vacía ya que no hay empleado_id en reclamos
        return {
            "query": "empleados_ranking",
            "total": 0,
            "descripcion": "Pendiente migración a dependencias",
            "data": []
        }

    elif query_name == "buscar_reclamo":
        search_query = params.get("query", "")

        # Buscar por ID si es número
        if search_query.isdigit():
            query = select(Reclamo).options(
                selectinload(Reclamo.categoria),
                selectinload(Reclamo.empleado_asignado),
                selectinload(Reclamo.creador)
            ).where(
                Reclamo.municipio_id == municipio_id,
                Reclamo.id == int(search_query)
            )
        else:
            # Buscar por texto en título o descripción
            query = select(Reclamo).options(
                selectinload(Reclamo.categoria),
                selectinload(Reclamo.empleado_asignado),
                selectinload(Reclamo.creador)
            ).where(
                Reclamo.municipio_id == municipio_id,
                (Reclamo.titulo.ilike(f"%{search_query}%") | Reclamo.descripcion.ilike(f"%{search_query}%"))
            ).order_by(Reclamo.created_at.desc()).limit(limit)

        result = await db.execute(query)
        reclamos = result.scalars().all()

        data = [{
            'id': r.id,
            'titulo': r.titulo,
            'descripcion': (r.descripcion[:100] + '...') if r.descripcion and len(r.descripcion) > 100 else r.descripcion,
            'estado': r.estado.value if r.estado else 'desconocido',
            'categoria': r.categoria.nombre if r.categoria else 'Sin categoría',
            'direccion': r.direccion or '',
            'fecha': r.created_at.strftime('%d/%m/%Y') if r.created_at else '',
            'empleado': f"{r.empleado_asignado.nombre} {r.empleado_asignado.apellido or ''}".strip() if r.empleado_asignado else None,
            'creador': f"{r.creador.nombre} {r.creador.apellido or ''}".strip() if r.creador else 'Anónimo'
        } for r in reclamos]

        return {
            "query": "buscar_reclamo",
            "busqueda": search_query,
            "total": len(data),
            "descripcion": f"{len(data)} resultados para '{search_query}'",
            "data": data
        }

    elif query_name == "categorias_ranking":
        from models.categoria import MunicipioCategoria

        query = select(
            Categoria.nombre,
            sql_func.count(Reclamo.id).label('total'),
            sql_func.count(case((Reclamo.estado.in_([EstadoReclamo.NUEVO, EstadoReclamo.ASIGNADO, EstadoReclamo.EN_CURSO]), 1))).label('pendientes'),
            sql_func.count(case((Reclamo.estado == EstadoReclamo.RESUELTO, 1))).label('resueltos')
        ).join(
            Reclamo, Reclamo.categoria_id == Categoria.id
        ).join(
            MunicipioCategoria, MunicipioCategoria.categoria_id == Categoria.id
        ).where(
            MunicipioCategoria.municipio_id == municipio_id
        ).group_by(Categoria.nombre).order_by(sql_func.count(Reclamo.id).desc()).limit(limit)

        result = await db.execute(query)
        rows = result.all()

        data = [{
            'categoria': r.nombre,
            'total': r.total,
            'pendientes': r.pendientes or 0,
            'resueltos': r.resueltos or 0
        } for r in rows]

        return {
            "query": "categorias_ranking",
            "total": len(data),
            "descripcion": f"Top {len(data)} categorías por cantidad de reclamos",
            "data": data
        }

    return {"query": query_name, "error": "Query no implementado", "data": []}


def build_query_analysis_prompt(available_queries: dict, empleados: list, categorias: list) -> str:
    """Construye el prompt para que la IA analice qué queries necesita"""

    queries_desc = "\n".join([
        f"- {name}: {info['descripcion']} (params: {', '.join(info['parametros'])})"
        for name, info in available_queries.items()
    ])

    empleados_list = ", ".join([f"{e['nombre']} (ID:{e['id']})" for e in empleados[:10]])
    categorias_list = ", ".join([c['nombre'] for c in categorias])

    return f"""Analizá la pregunta del usuario y determiná qué queries necesitás ejecutar para responderla.

QUERIES DISPONIBLES:
{queries_desc}

EMPLEADOS CONOCIDOS:
{empleados_list}

CATEGORÍAS CONOCIDAS:
{categorias_list}

INSTRUCCIONES:
1. Analizá qué información necesita la pregunta
2. Si la pregunta requiere datos específicos que no están en el contexto básico, pedí los queries necesarios
3. Respondé SOLO en formato JSON

FORMATO DE RESPUESTA:
{{
  "necesita_queries": true/false,
  "queries": [
    {{"name": "nombre_query", "params": {{"param1": "valor"}}}}
  ],
  "razonamiento": "breve explicación"
}}

Si NO necesita queries adicionales, respondé:
{{
  "necesita_queries": false,
  "queries": [],
  "razonamiento": "puedo responder con el contexto básico"
}}

IMPORTANTE:
- Para "reclamos más atrasados/antiguos" usa "reclamos_atrasados"
- Para buscar empleado por nombre, primero encontrá su ID en la lista
- Siempre incluí "limit" en params (default 10)"""


def parse_query_analysis(response: str) -> dict:
    """Parsea la respuesta del análisis de queries"""
    try:
        # Intentar extraer JSON del response
        # A veces viene con texto adicional
        json_match = re.search(r'\{[\s\S]*\}', response)
        if json_match:
            return json.loads(json_match.group())
        return {"necesita_queries": False, "queries": [], "razonamiento": "No se pudo parsear"}
    except Exception as e:
        print(f"[QUERY ANALYSIS] Error parsing: {e}")
        return {"necesita_queries": False, "queries": [], "razonamiento": str(e)}


# ==================== SQL DINÁMICO PARA CONSULTAS GERENCIALES ====================

import os

# Paths al archivo JSON con el schema de la BD (múltiples ubicaciones)
# 1. backend/data/ - para Heroku (deployado junto con el backend)
# 2. APP_GUIDE/ - para desarrollo local (en la raíz del proyecto)
SCHEMA_JSON_PATHS = [
    os.path.join(os.path.dirname(__file__), '..', 'data', '12_DATABASE_SCHEMA.json'),  # backend/data/
    os.path.join(os.path.dirname(__file__), '..', '..', 'APP_GUIDE', '12_DATABASE_SCHEMA.json'),  # root/APP_GUIDE/
]

# Cache en memoria - se carga una sola vez al iniciar
_SCHEMA_JSON_CACHE: dict | None = None
_SCHEMA_TEXT_CACHE: str | None = None


def load_schema_json(force_refresh: bool = False) -> dict | None:
    """Carga el schema JSON (cacheado en memoria)"""
    global _SCHEMA_JSON_CACHE

    if _SCHEMA_JSON_CACHE is not None and not force_refresh:
        return _SCHEMA_JSON_CACHE

    # Intentar cada path en orden
    for schema_path in SCHEMA_JSON_PATHS:
        try:
            if os.path.exists(schema_path):
                with open(schema_path, 'r', encoding='utf-8') as f:
                    _SCHEMA_JSON_CACHE = json.load(f)
                    print(f"[SCHEMA] JSON cargado desde {schema_path}")
                    return _SCHEMA_JSON_CACHE
        except Exception as e:
            print(f"[SCHEMA] Error loading from {schema_path}: {e}")
            continue

    print(f"[SCHEMA] No encontrado en ningún path: {SCHEMA_JSON_PATHS}")
    return None


def schema_json_to_text() -> str | None:
    """Convierte el schema JSON a texto legible para la IA (cacheado)"""
    global _SCHEMA_TEXT_CACHE

    if _SCHEMA_TEXT_CACHE is not None:
        return _SCHEMA_TEXT_CACHE

    schema = load_schema_json()
    if not schema:
        return None

    lines = ["# Esquema de Base de Datos\n"]

    # Entidades principales
    lines.append("## Tablas Principales\n")
    for entity_name, entity in schema.get("entities", {}).items():
        table = entity.get("table", entity_name)
        desc = entity.get("description", "")
        multi_tenant_note = entity.get("multi_tenant_note", "")

        lines.append(f"### {table}")
        if desc:
            lines.append(f"_{desc}_")
        if multi_tenant_note:
            lines.append(f"**NOTA**: {multi_tenant_note}")

        # Columnas
        cols = []
        for col_name, col_info in entity.get("columns", {}).items():
            col_type = col_info.get("type", "")
            fk = col_info.get("foreign_key", "")
            if fk:
                cols.append(f"{col_name} → {fk}")
            elif col_info.get("type") == "enum":
                vals = col_info.get("values", [])
                cols.append(f"{col_name} (enum: {', '.join(vals)})")
            else:
                cols.append(col_name)

        # Agrupar columnas en líneas
        lines.append("- " + ", ".join(cols[:8]))
        if len(cols) > 8:
            lines.append("- " + ", ".join(cols[8:]))
        lines.append("")

    # Tablas pivote
    lines.append("## Tablas Pivote (Many-to-Many)\n")
    for pivot_name, pivot in schema.get("pivot_tables", {}).items():
        lines.append(f"### {pivot.get('table', pivot_name)}")
        cols = list(pivot.get("columns", {}).keys())
        lines.append(f"- {', '.join(cols)}")
        lines.append("")

    # Enums
    lines.append("## Estados Válidos (Enums)\n")
    for enum_name, enum_info in schema.get("enums", {}).items():
        vals = enum_info.get("values", [])
        lines.append(f"### {enum_name}")
        lines.append(f"- {', '.join(vals)}")
        lines.append("")

    # JOINs comunes
    if schema.get("common_joins"):
        lines.append("## JOINs Comunes\n")
        for join_name, join_info in schema["common_joins"].items():
            lines.append(f"### {join_name}")
            lines.append(f"_{join_info.get('description', '')}_")
            lines.append(f"```sql")
            lines.append(f"FROM {join_info.get('base', '')}")
            for j in join_info.get("joins", []):
                lines.append(j)
            lines.append("```")
            lines.append("")

    # Reglas de filtrado multi-tenant
    lines.append("## Reglas de Filtrado Multi-Tenant\n")
    lines.append("Tablas con municipio_id directo: reclamos, empleados, zonas, usuarios, solicitudes")
    lines.append("Tablas SIN municipio_id (catálogos genéricos): categorias, tramites, tipos_tramites")
    lines.append("")
    lines.append("**IMPORTANTE para trámites:**")
    lines.append("- `tipos_tramites` = categorías de trámites")
    lines.append("- `tramites` tiene `tipo_tramite_id` → tipos_tramites.id")
    lines.append("- `solicitudes` = trámites cargados/iniciados, tiene `tramite_id` → tramites.id")
    lines.append("- `municipio_tramites` tiene `tramite_id`, NO tiene `categoria_id` ni `tipo_tramite_id`")
    lines.append("")

    _SCHEMA_TEXT_CACHE = "\n".join(lines)
    return _SCHEMA_TEXT_CACHE


async def get_database_schema(db: AsyncSession = None, force_refresh: bool = False) -> str:
    """
    Obtiene el schema de las tablas desde el archivo JSON de documentación.
    Devuelve el JSON completo para que la IA tenga todo el contexto del dominio.
    """
    # Intentar cada path en orden
    for schema_path in SCHEMA_JSON_PATHS:
        try:
            if os.path.exists(schema_path):
                with open(schema_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                    print(f"[SCHEMA] JSON completo cargado desde {schema_path} ({len(content)} chars)")
                    return content
        except Exception as e:
            print(f"[SCHEMA] Error loading from {schema_path}: {e}")
            continue

    print(f"[SCHEMA] No encontrado en ningún path, usando fallback")
    return DATABASE_SCHEMA_FALLBACK


DATABASE_SCHEMA_FALLBACK = """
# Esquema de Base de Datos - Referencia Rápida

## Tablas Principales

### reclamos (con municipio_id)
- id, municipio_id, titulo, descripcion, estado, prioridad, direccion, created_at
- categoria_id → categorias.id
- zona_id → zonas.id
- creador_id → usuarios.id
- empleado_id → empleados.id
- estado: 'NUEVO', 'ASIGNADO', 'EN_CURSO', 'PENDIENTE_CONFIRMACION', 'RESUELTO', 'RECHAZADO'

### categorias (NO tiene municipio_id - es catálogo genérico)
- id, nombre, descripcion, icono, color, activo

### municipio_categorias (tabla intermedia para habilitar categorías por municipio)
- id, municipio_id, categoria_id

### empleados (con municipio_id)
- id, municipio_id, nombre, apellido, especialidad, telefono, activo
- zona_id → zonas.id
- categoria_principal_id → categorias.id

### zonas (con municipio_id)
- id, municipio_id, nombre, codigo, descripcion, activo

### usuarios (con municipio_id)
- id, municipio_id, email, nombre, apellido, rol, activo
- rol: 'vecino', 'empleado', 'supervisor', 'admin'

## Tablas de Trámites (IMPORTANTE)

### tipos_tramites (NO tiene municipio_id - es catálogo genérico)
- id, nombre, descripcion, codigo, icono, color, activo
- Es la CATEGORÍA de trámites (ej: "Habilitaciones", "Permisos")

### tramites (NO tiene municipio_id - es catálogo genérico)
- id, tipo_tramite_id, nombre, descripcion, requisitos, tiempo_estimado_dias, costo, activo
- tipo_tramite_id → tipos_tramites.id
- Es el trámite específico dentro de una categoría

### municipio_tramites (tabla intermedia para habilitar trámites por municipio)
- id, municipio_id, tramite_id
- IMPORTANTE: tiene tramite_id, NO tiene categoria_id ni tipo_tramite_id

### solicitudes (con municipio_id - son los trámites "cargados"/iniciados)
- id, municipio_id, numero_tramite, asunto, descripcion, estado, created_at
- tramite_id → tramites.id (el tipo de trámite)
- solicitante_id → usuarios.id
- empleado_id → empleados.id
- estado: 'INICIADO', 'EN_REVISION', 'REQUIERE_DOCUMENTACION', 'EN_CURSO', 'APROBADO', 'RECHAZADO', 'FINALIZADO'

## Reglas de Filtrado Multi-Tenant

Tablas con municipio_id directo: reclamos, empleados, zonas, usuarios, solicitudes
Tablas SIN municipio_id (requieren JOIN): categorias, tramites, tipos_tramites

## Ejemplos de JOINs correctos para trámites

Para contar solicitudes por tipo de trámite:
SELECT tt.nombre, COUNT(s.id) as cantidad
FROM tipos_tramites tt
JOIN tramites t ON t.tipo_tramite_id = tt.id
JOIN solicitudes s ON s.tramite_id = t.id
WHERE s.municipio_id = {municipio_id}
GROUP BY tt.id

Para listar trámites con su tipo:
SELECT t.id, t.nombre, tt.nombre as tipo
FROM tramites t
JOIN tipos_tramites tt ON t.tipo_tramite_id = tt.id
JOIN municipio_tramites mt ON mt.tramite_id = t.id
WHERE mt.municipio_id = {municipio_id}
"""

FORBIDDEN_SQL_PATTERNS = [
    r'\b(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE|GRANT|REVOKE)\b',
    r'\b(EXEC|EXECUTE|CALL)\b',
    r'--',  # Comentarios SQL
    r';.*;',  # Múltiples statements
    r'\bINTO\b\s+\bOUTFILE\b',
    r'\bLOAD_FILE\b',
]


def validate_sql_query(sql: str) -> tuple[bool, str]:
    """Valida que el SQL sea seguro (solo SELECT, sin patrones peligrosos)"""
    sql_upper = sql.upper().strip()

    # Debe empezar con SELECT
    if not sql_upper.startswith('SELECT'):
        return False, "Solo se permiten consultas SELECT"

    # Verificar patrones prohibidos
    for pattern in FORBIDDEN_SQL_PATTERNS:
        if re.search(pattern, sql_upper, re.IGNORECASE):
            return False, f"Patrón no permitido detectado"

    # Verificar que no haya múltiples statements
    if sql.count(';') > 1:
        return False, "Solo se permite una consulta"

    return True, "OK"


async def execute_dynamic_sql(
    db: AsyncSession,
    sql: str,
    municipio_id: int,
    page: int = 1,
    page_size: int = 2000,
    sin_limite: bool = False
) -> dict:
    """Ejecuta SQL dinámico de forma segura con paginación opcional"""
    from sqlalchemy import text
    import re as regex

    # Validar SQL
    is_valid, error = validate_sql_query(sql)
    if not is_valid:
        return {"error": error, "data": [], "sql": sql, "total": 0}

    # Reemplazar placeholder de municipio_id
    sql_base = sql.replace("{municipio_id}", str(municipio_id))

    # Detectar si el usuario especificó un LIMIT explícito
    limit_match = regex.search(r'\s+LIMIT\s+(\d+)', sql_base, flags=regex.IGNORECASE)
    user_limit = int(limit_match.group(1)) if limit_match else None

    # Remover LIMIT existente para hacer COUNT o para ejecutar sin límite
    sql_sin_limit = regex.sub(r'\s+LIMIT\s+\d+(\s+OFFSET\s+\d+)?', '', sql_base, flags=regex.IGNORECASE)
    sql_sin_limit = sql_sin_limit.rstrip(';')

    try:
        # Si sin_limite=True, ejecutar sin paginación (para cards, list, timeline)
        if sin_limite and not user_limit:
            print(f"[DYNAMIC SQL] Executing WITHOUT LIMIT: {sql_sin_limit[:500]}...")
            result = await db.execute(text(sql_sin_limit))
            rows = result.fetchall()
            columns = result.keys()
            data = [dict(zip(columns, row)) for row in rows]

            for row in data:
                for key, value in row.items():
                    if isinstance(value, datetime):
                        row[key] = value.strftime('%d/%m/%y %H:%M')

            print(f"[DYNAMIC SQL] Got {len(data)} rows (sin limite)")
            return {
                "data": data,
                "total": len(data),
                "sql": sql_sin_limit,
                "sql_base": sql_sin_limit,
                "page": 1,
                "page_size": len(data),
                "user_limit": None
            }

        # Si el usuario pidió un LIMIT específico, respetarlo
        effective_page_size = min(user_limit, page_size) if user_limit else page_size

        # Primero: COUNT total (solo si no hay LIMIT del usuario o es grande)
        if user_limit and user_limit <= 20:
            total = user_limit
        else:
            count_sql = f"SELECT COUNT(*) as total FROM ({sql_sin_limit}) as subquery"
            print(f"[DYNAMIC SQL] Count: {count_sql[:150]}...")
            try:
                count_result = await db.execute(text(count_sql))
                total = count_result.scalar() or 0
            except Exception as count_err:
                print(f"[DYNAMIC SQL] Count failed, using fallback: {count_err}")
                total = None

        # Segundo: Query paginada
        offset = (page - 1) * effective_page_size
        sql_paginado = f"{sql_sin_limit} LIMIT {effective_page_size} OFFSET {offset}"

        print(f"[DYNAMIC SQL] Executing: {sql_paginado[:200]}...")
        result = await db.execute(text(sql_paginado))
        rows = result.fetchall()
        columns = result.keys()

        data = [dict(zip(columns, row)) for row in rows]

        for row in data:
            for key, value in row.items():
                if isinstance(value, datetime):
                    row[key] = value.strftime('%d/%m/%y %H:%M')

        if total is None:
            total = len(data) if len(data) < page_size else len(data) + 1

        print(f"[DYNAMIC SQL] Got {len(data)} rows, total: {total}, user_limit: {user_limit}")
        return {
            "data": data,
            "total": total if total else len(data),
            "sql": sql_paginado,
            "sql_base": sql_sin_limit,
            "page": page,
            "page_size": effective_page_size,
            "user_limit": user_limit
        }

    except Exception as e:
        print(f"[DYNAMIC SQL] Error: {e}")
        return {"error": str(e), "data": [], "sql": sql_base, "total": 0}


def build_sql_generator_prompt(municipio_id: int, schema: str = None) -> str:
    """Prompt para que la IA genere SQL basado en la pregunta"""
    schema_to_use = schema or DATABASE_SCHEMA_FALLBACK
    return f"""Sos un experto generador de consultas SQL para MySQL. Tu tarea es convertir preguntas en español a consultas SQL válidas.

SCHEMA DE LA BASE DE DATOS:
{schema_to_use}

MUNICIPIO_ID ACTUAL: {municipio_id}

REGLAS:
1. EL SCHEMA ES TU ÚNICA FUENTE DE VERDAD. Leelo íntegramente antes de generar SQL. NUNCA inferir ni presuponer columnas o relaciones que no estén explícitas en el schema. Si no está documentado, no existe. Para filtrar por municipio: verificá en el schema si la tabla tiene columna "municipio_id". Si NO la tiene, buscá "multi_tenant_note" que te indica qué tabla pivote usar.
2. **NUNCA** pongas LIMIT a menos que el usuario pida explícitamente una cantidad (ej: "traeme 10", "los primeros 5", "dame 20"). Si dice "traeme todos", "lista", "dame los X" sin número, NO pongas LIMIT.
3. Para fechas: NOW(), DATE_SUB(), DATEDIFF()
4. **IMPORTANTE - GROUP BY**: MySQL tiene `only_full_group_by` activado. Cuando uses GROUP BY, TODAS las columnas en SELECT que NO sean funciones de agregación (COUNT, SUM, AVG, MAX, MIN) DEBEN estar en el GROUP BY. Si querés contar + mostrar detalles, usá una subquery o dos consultas separadas. Ejemplo INCORRECTO: `SELECT m.nombre, COUNT(r.id), r.estado FROM ... GROUP BY m.id`. Ejemplo CORRECTO: `SELECT m.id, m.nombre, COUNT(r.id) as cantidad FROM ... GROUP BY m.id, m.nombre`.

IMPORTANTE - SQL MINIMALISTA:
- Máximo 5-6 columnas (id, titulo, estado, categoria, fecha)
- "todos los datos" = solo esos 5-6 campos, NO todas las columnas
- Solo JOIN si necesitás un campo de esa tabla
- NO joinées tablas de las que no usás campos
- Máximo 2000 caracteres de SQL

FORMATO DE RESPUESTA (MUY IMPORTANTE):
- Respondé SOLO con el JSON, sin texto antes ni después
- NO uses bloques de código markdown (```json)
- NO agregues explicaciones
- SOLO el JSON puro:
{{"sql": "SELECT ...", "descripcion": "..."}}

EJEMPLOS:

Usuario: "traeme 10 reclamos"
{{"sql": "SELECT r.id, r.titulo, r.estado, c.nombre as categoria, r.created_at FROM reclamos r LEFT JOIN categorias c ON r.categoria_id = c.id WHERE r.municipio_id = {municipio_id} ORDER BY r.created_at DESC LIMIT 10", "descripcion": "Los 10 reclamos más recientes"}}

Usuario: "10 reclamos con más atraso con todos sus datos"
{{"sql": "SELECT r.id, r.titulo, r.estado, c.nombre as categoria, r.direccion, r.created_at FROM reclamos r LEFT JOIN categorias c ON r.categoria_id = c.id WHERE r.municipio_id = {municipio_id} ORDER BY r.created_at ASC LIMIT 10", "descripcion": "Los 10 reclamos más antiguos"}}

Usuario: "dame toda la info de los reclamos pendientes"
{{"sql": "SELECT r.id, r.titulo, r.estado, c.nombre as categoria, r.direccion, r.created_at FROM reclamos r LEFT JOIN categorias c ON r.categoria_id = c.id WHERE r.municipio_id = {municipio_id} AND r.estado IN ('nuevo', 'asignado')", "descripcion": "Reclamos pendientes"}}

Usuario: "los 5 empleados con más reclamos resueltos"
{{"sql": "SELECT e.id, e.nombre, COUNT(*) as resueltos FROM empleados e JOIN reclamos r ON r.empleado_id = e.id WHERE e.municipio_id = {municipio_id} AND r.estado = 'resuelto' GROUP BY e.id ORDER BY resueltos DESC LIMIT 5", "descripcion": "Top 5 empleados"}}

Usuario: "reclamos de esta semana por categoría"
{{"sql": "SELECT c.nombre, COUNT(*) as cantidad FROM reclamos r JOIN categorias c ON r.categoria_id = c.id WHERE r.municipio_id = {municipio_id} AND r.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) GROUP BY c.id", "descripcion": "Reclamos por categoría"}}

Usuario: "lista los empleados"
{{"sql": "SELECT e.id, e.nombre, e.descripcion, e.telefono FROM empleados e WHERE e.municipio_id = {municipio_id}", "descripcion": "Lista de empleados"}}

Usuario: "proceso de la solicitud 1" o "etapas de la solicitud 1" o "historial de la solicitud 1"
{{"sql": "SELECT hs.id, hs.accion, hs.estado_anterior, hs.estado_nuevo, hs.comentario, hs.created_at, u.nombre as usuario FROM historial_solicitudes hs JOIN solicitudes s ON hs.solicitud_id = s.id LEFT JOIN usuarios u ON hs.usuario_id = u.id WHERE s.id = 1 AND s.municipio_id = {municipio_id} ORDER BY hs.created_at ASC", "descripcion": "Proceso de la Solicitud 1"}}

Usuario: "historial del reclamo 5"
{{"sql": "SELECT hr.id, hr.accion, hr.estado_anterior, hr.estado_nuevo, hr.comentario, hr.created_at, u.nombre as usuario FROM historial_reclamos hr JOIN reclamos r ON hr.reclamo_id = r.id LEFT JOIN usuarios u ON hr.usuario_id = u.id WHERE r.id = 5 AND r.municipio_id = {municipio_id} ORDER BY hr.created_at ASC", "descripcion": "Historial del Reclamo 5"}}

Usuario: "ranking de empleados por reclamos resueltos"
{{"sql": "SELECT e.id, e.nombre, COUNT(*) as cantidad FROM empleados e JOIN reclamos r ON r.empleado_id = e.id WHERE e.municipio_id = {municipio_id} AND r.estado = 'resuelto' GROUP BY e.id ORDER BY cantidad DESC", "descripcion": "Ranking de empleados por reclamos resueltos"}}

Usuario: "reclamos agrupados por categoría"
{{"sql": "SELECT c.nombre as categoria, r.id, r.titulo, r.estado, r.created_at FROM reclamos r JOIN categorias c ON r.categoria_id = c.id WHERE r.municipio_id = {municipio_id} ORDER BY c.nombre, r.created_at DESC", "descripcion": "Reclamos agrupados por categoría"}}

Usuario: "resumen de reclamos" o "dashboard de reclamos"
{{"sql": "SELECT estado, COUNT(*) as cantidad FROM reclamos WHERE municipio_id = {municipio_id} GROUP BY estado", "descripcion": "Resumen de reclamos por estado"}}"""


def build_response_with_data_prompt(pregunta: str, datos: list, descripcion: str, total_registros: int = None, formato: str = None) -> str:
    """Prompt para que la IA formatee la respuesta con los datos obtenidos.
    Carga templates desde archivos JSON en backend/templates/
    """
    total = total_registros or len(datos)

    # Cargar template si existe
    template = load_template(formato) if formato else None

    # Determinar cuántos datos pasar según el template
    if template and not template.get('mostrar_grilla', True):
        # Templates que muestran todos los datos: pasar más registros
        max_datos = template.get('paginacion', 50) or 50
        datos_a_pasar = datos[:max_datos]
        datos_str = json.dumps(datos_a_pasar, indent=2, ensure_ascii=False, default=str)
        datos_count = len(datos_a_pasar)
    else:
        # Resumen: solo primeros 10
        datos_a_pasar = datos[:10]
        datos_str = json.dumps(datos_a_pasar, indent=2, ensure_ascii=False, default=str)
        datos_count = len(datos_a_pasar)

    base_prompt = f"""PREGUNTA: {pregunta}
TOTAL REGISTROS EN BD: {total}
REGISTROS EN ESTE JSON: {datos_count}
DATOS:
{datos_str}

"""

    # Si tenemos template JSON, usarlo
    if template:
        template_prompt = get_template_prompt(formato, total, datos_count)
        if template_prompt:
            return base_prompt + template_prompt

    # Fallback: formato por defecto (resumen + grilla abajo)
    default_template = load_template('dashboard')
    if default_template:
        return base_prompt + f"""INSTRUCCIONES:
1. Hacé un RESUMEN con KPIs o mini-tabla (máx 5-8 filas destacadas)
2. Los datos completos ya se muestran en una grilla debajo
3. Español rioplatense, respuesta CORTA
4. HTML con estilos inline

{get_template_prompt('dashboard', total) or ''}

IMPORTANTE: Solo hacé un resumen, la grilla con todos los datos ya está abajo."""

    # Fallback hardcodeado si no hay templates
    return base_prompt + f"""INSTRUCCIONES:
1. Hacé un RESUMEN con KPIs o mini-tabla (máx 5-8 filas destacadas)
2. Los datos completos ya se muestran en una grilla debajo
3. Español rioplatense, respuesta CORTA
4. HTML con estilos inline

KPI CARDS (para números/totales):
<div style="display:flex;flex-wrap:wrap;gap:10px;margin:12px 0">
<div style="flex:1;min-width:120px;background:#f8f5f0;border:1px solid #e5e0d8;padding:16px 20px;border-radius:12px;text-align:center"><div style="font-size:28px;font-weight:700;color:#b08d57">VALOR</div><div style="font-size:12px;color:#8b7355;margin-top:2px">Etiqueta</div></div>
</div>

IMPORTANTE: Solo hacé un resumen, la grilla con todos los datos ya está abajo."""


def build_asistente_prompt(
    categorias: list,
    stats_reclamos: dict,
    stats_tramites: dict,
    stats_temporales: dict,
    reclamos_recientes: list,
    tramites_recientes: list,
    reclamos_por_categoria: list,
    empleados: list,
    usuarios_con_reclamos: list
) -> str:
    """Construye el prompt del asistente con acceso a datos"""

    cats_list = ", ".join([c['nombre'] for c in categorias])

    reclamos_list = "\n".join([
        f"  - #{r['id']}: {r['titulo']} ({r['estado']}) - {r['categoria']} - {r['direccion']} - Creado por: {r.get('creador', 'N/A')}" + (f" - Asignado a: {r['empleado_asignado']}" if r.get('empleado_asignado') else "")
        for r in reclamos_recientes[:10]
    ]) or "  Sin reclamos recientes"

    tramites_list = "\n".join([
        f"  - {t['numero']}: {t['asunto']} ({t['estado']}) - Solicitante: {t['solicitante']}"
        for t in tramites_recientes[:5]
    ]) or "  Sin trámites recientes"

    cats_stats = "\n".join([
        f"  - {c['categoria']}: {c['cantidad']} reclamos"
        for c in reclamos_por_categoria[:5]
    ]) or "  Sin datos"

    empleados_list = "\n".join([
        f"  - {e['nombre']} (ID:{e['id']}): {e['activos']} activos ({e['asignados']} asignados, {e['en_curso']} en proceso, {e['pendiente_confirmacion']} pend.conf.), {e['resueltos']} resueltos, {e['total']} total histórico"
        for e in empleados
    ]) or "  Sin empleados"

    usuarios_list = "\n".join([
        f"  - {u['nombre']} (ID:{u['id']}): {u['total_reclamos']} reclamos total, {u['activos']} activos, {u['resueltos']} resueltos"
        for u in usuarios_con_reclamos[:15]
    ]) or "  Sin datos de usuarios"

    # Calcular pendientes
    pendientes = stats_reclamos['nuevos'] + stats_reclamos['asignados'] + stats_reclamos['en_curso'] + stats_reclamos['pendiente_confirmacion']

    return f"""Sos el Asistente Municipal de Munify. Respondés consultas sobre datos del sistema.

REGLAS DE ESTILO:
1. Español rioplatense (vos, podés, tenés)
2. Respuestas CORTAS: 1-2 oraciones de texto + componentes visuales
3. SIEMPRE usá HTML con estilos inline (Tailwind-like)
4. Para datos numéricos, usá CARDS. Para listas, usá TABLAS o LISTAS estilizadas.

DATOS DISPONIBLES:

RECLAMOS:
- Total: {stats_reclamos['total']}
- Pendientes: {pendientes} (nuevos:{stats_reclamos['nuevos']}, asignados:{stats_reclamos['asignados']}, en_curso:{stats_reclamos['en_curso']})
- Resueltos: {stats_reclamos['resueltos']}
- Rechazados: {stats_reclamos['rechazados']}
- Hoy: {stats_temporales['hoy']} | Esta semana: {stats_temporales['esta_semana']} | Este mes: {stats_temporales['este_mes']}

TRÁMITES:
- Total: {stats_tramites['total']}
- Iniciados: {stats_tramites['iniciados']} | En revisión: {stats_tramites['en_revision']} | En proceso: {stats_tramites['en_curso']}
- Aprobados: {stats_tramites['aprobados']} | Finalizados: {stats_tramites['finalizados']}

RECLAMOS RECIENTES:
{reclamos_list}

TRÁMITES RECIENTES:
{tramites_list}

POR CATEGORÍA:
{cats_stats}

EMPLEADOS:
{empleados_list}

VECINOS CON RECLAMOS:
{usuarios_list}

CATEGORÍAS: {cats_list}

COMPONENTES HTML A USAR:

4. LINK BUTTON:
<a href="URL" style="display:inline-block;background:#2563eb;color:white;padding:8px 16px;border-radius:8px;text-decoration:none;font-size:14px;margin-top:12px">TEXTO →</a>

5. TABLA COMPACTA:
<table style="width:100%;border-collapse:collapse;margin:12px 0;font-size:14px">
<tr style="background:#f1f5f9"><th style="padding:8px;text-align:left;border-bottom:2px solid #e2e8f0">Col1</th><th style="padding:8px;text-align:left;border-bottom:2px solid #e2e8f0">Col2</th></tr>
<tr><td style="padding:8px;border-bottom:1px solid #e2e8f0">Dato1</td><td style="padding:8px;border-bottom:1px solid #e2e8f0">Dato2</td></tr>
</table>

6. BADGE DE ESTADO:
<span style="background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:4px;font-size:12px;font-weight:500">ESTADO</span>

EJEMPLOS DE RESPUESTAS:

Pregunta: "¿Cuántos reclamos pendientes hay?"
Respuesta:
<p style="margin-bottom:12px">Tenés <strong>{pendientes}</strong> reclamos pendientes:</p>
<div style="display:flex;flex-wrap:wrap;gap:8px">
<div style="display:inline-block;background:linear-gradient(135deg,#f59e0b,#d97706);color:white;padding:16px 24px;border-radius:12px;min-width:100px;text-align:center"><div style="font-size:28px;font-weight:700">{stats_reclamos['nuevos']}</div><div style="font-size:13px;opacity:0.9">Nuevos</div></div>
<div style="display:inline-block;background:linear-gradient(135deg,#3b82f6,#1d4ed8);color:white;padding:16px 24px;border-radius:12px;min-width:100px;text-align:center"><div style="font-size:28px;font-weight:700">{stats_reclamos['asignados']}</div><div style="font-size:13px;opacity:0.9">Asignados</div></div>
<div style="display:inline-block;background:linear-gradient(135deg,#8b5cf6,#7c3aed);color:white;padding:16px 24px;border-radius:12px;min-width:100px;text-align:center"><div style="font-size:28px;font-weight:700">{stats_reclamos['en_curso']}</div><div style="font-size:13px;opacity:0.9">En proceso</div></div>
</div>
<a href="/tablero" style="display:inline-block;background:#2563eb;color:white;padding:8px 16px;border-radius:8px;text-decoration:none;font-size:14px;margin-top:12px">Ver tablero →</a>

Pregunta: "¿Cuántos reclamos de esta semana?"
Respuesta:
<p style="margin-bottom:12px">Reclamos creados:</p>
<div style="display:flex;flex-wrap:wrap;gap:8px">
<div style="display:inline-block;background:linear-gradient(135deg,#3b82f6,#1d4ed8);color:white;padding:16px 24px;border-radius:12px;min-width:100px;text-align:center"><div style="font-size:28px;font-weight:700">{stats_temporales['hoy']}</div><div style="font-size:13px;opacity:0.9">Hoy</div></div>
<div style="display:inline-block;background:linear-gradient(135deg,#8b5cf6,#7c3aed);color:white;padding:16px 24px;border-radius:12px;min-width:100px;text-align:center"><div style="font-size:28px;font-weight:700">{stats_temporales['esta_semana']}</div><div style="font-size:13px;opacity:0.9">Esta semana</div></div>
<div style="display:inline-block;background:linear-gradient(135deg,#6366f1,#4f46e5);color:white;padding:16px 24px;border-radius:12px;min-width:100px;text-align:center"><div style="font-size:28px;font-weight:700">{stats_temporales['este_mes']}</div><div style="font-size:13px;opacity:0.9">Este mes</div></div>
</div>

Pregunta: "Dame un resumen"
Respuesta:
<p style="margin-bottom:12px"><strong>Resumen del municipio:</strong></p>
<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px">
<div style="display:inline-block;background:linear-gradient(135deg,#f59e0b,#d97706);color:white;padding:16px 24px;border-radius:12px;min-width:100px;text-align:center"><div style="font-size:28px;font-weight:700">{pendientes}</div><div style="font-size:13px;opacity:0.9">Pendientes</div></div>
<div style="display:inline-block;background:linear-gradient(135deg,#10b981,#059669);color:white;padding:16px 24px;border-radius:12px;min-width:100px;text-align:center"><div style="font-size:28px;font-weight:700">{stats_reclamos['resueltos']}</div><div style="font-size:13px;opacity:0.9">Resueltos</div></div>
<div style="display:inline-block;background:linear-gradient(135deg,#3b82f6,#1d4ed8);color:white;padding:16px 24px;border-radius:12px;min-width:100px;text-align:center"><div style="font-size:28px;font-weight:700">{stats_temporales['esta_semana']}</div><div style="font-size:13px;opacity:0.9">Esta semana</div></div>
</div>
<p style="color:#64748b;font-size:14px">Lo más urgente: {stats_reclamos['nuevos']} reclamos nuevos sin asignar.</p>
<a href="/tablero" style="display:inline-block;background:#2563eb;color:white;padding:8px 16px;border-radius:8px;text-decoration:none;font-size:14px;margin-top:8px">Ir al tablero →</a>

IMPORTANTE: Usá los componentes HTML tal cual. NO uses markdown. Adaptá los colores según el contexto (naranja=urgente, verde=positivo, azul=info)."""


@router.post("/asistente", response_model=ChatResponse)
async def chat_asistente(
    request: AsistenteRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Endpoint de chat con asistente que tiene acceso a datos del municipio.
    Requiere autenticación y rol de admin/supervisor/empleado.
    Usa sesiones persistentes por usuario (tipo "asistente").
    """
    if not chat_service.is_available():
        raise HTTPException(
            status_code=503,
            detail="El asistente no está disponible. Contacte al administrador."
        )

    # Verificar permisos (solo admin, supervisor, empleado, o super_admin)
    if current_user.rol not in ['admin', 'supervisor', 'empleado', 'super_admin']:
        raise HTTPException(
            status_code=403,
            detail="No tenés permisos para usar el asistente con datos."
        )

    municipio_id = current_user.municipio_id

    # Obtener datos en paralelo para construir contexto rico
    categorias = await get_categorias_municipio(db, municipio_id)
    stats_reclamos = await get_estadisticas_reclamos(db, municipio_id)
    stats_tramites = await get_estadisticas_tramites(db, municipio_id)
    stats_temporales = await get_estadisticas_temporales(db, municipio_id)
    reclamos_recientes = await get_reclamos_recientes(db, municipio_id, limit=15)
    tramites_recientes = await get_tramites_recientes(db, municipio_id)
    reclamos_por_categoria = await get_reclamos_por_categoria(db, municipio_id)
    empleados = await get_empleados_activos(db, municipio_id)
    usuarios_con_reclamos = await get_usuarios_con_reclamos(db, municipio_id)

    # Construir prompt con datos del municipio
    system_prompt = build_asistente_prompt(
        categorias=categorias,
        stats_reclamos=stats_reclamos,
        stats_tramites=stats_tramites,
        stats_temporales=stats_temporales,
        reclamos_recientes=reclamos_recientes,
        tramites_recientes=tramites_recientes,
        reclamos_por_categoria=reclamos_por_categoria,
        empleados=empleados,
        usuarios_con_reclamos=usuarios_con_reclamos
    )

    # Usar storage de sesiones para usuarios autenticados
    storage = get_user_storage()

    # Obtener o crear sesión para este usuario (tipo "asistente" separado del chat normal)
    session_id, is_new = await storage.get_or_create_for_user(
        user_id=current_user.id,
        system_prompt=system_prompt,
        context={
            "municipio_id": municipio_id,
            "user_id": current_user.id,
            "rol": current_user.rol,
            "email": current_user.email
        },
        session_type="asistente"  # Sesión separada del chat general
    )

    # Obtener historial de la sesión
    history = await storage.get_messages(session_id)

    # Obtener system prompt de la sesión (se actualiza con datos frescos cada vez)
    # Nota: Para el asistente, actualizamos el prompt porque los datos cambian
    # En el futuro se podría optimizar para no regenerar si no hay cambios

    context = chat_service.build_chat_context(
        system_prompt=system_prompt,
        message=request.message,
        history=history
    )

    print(f"[ASISTENTE] Consulta de {current_user.email} (session: {session_id}): {request.message[:100]}...")

    response = await chat_service.chat(context, max_tokens=2000)

    if response:
        # Guardar mensajes en la sesión
        await storage.add_message(session_id, "user", request.message)
        await storage.add_message(session_id, "assistant", response)

        return ChatResponse(response=response, session_id=session_id)

    raise HTTPException(status_code=503, detail="El asistente no está disponible temporalmente.")


# ==================== CONSULTA GERENCIAL CON SQL DINÁMICO ====================

class ConsultaRequest(BaseModel):
    """Request para consulta gerencial con SQL dinámico"""
    pregunta: str
    page: int = 1
    page_size: int = 50
    historial: list[dict] = []  # Historial de conversación para contexto


class ConsultaResponse(BaseModel):
    """Response de consulta gerencial"""
    response: str
    sql_ejecutado: str | None = None
    datos_crudos: list | None = None
    total_registros: int | None = None
    page: int = 1
    page_size: int = 50
    mostrar_grilla: bool = True  # False si el formato ya muestra todos los datos (cards, list, etc)


@router.post("/consulta", response_model=ConsultaResponse)
async def consulta_gerencial(
    request: ConsultaRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Endpoint de consulta gerencial con SQL dinámico.
    La IA genera el SQL necesario para responder la pregunta.

    Proceso:
    1. Obtiene el schema de la BD (desde cache o genera)
    2. La IA genera el SQL basándose en la pregunta
    3. Se valida y ejecuta el SQL
    4. La IA formatea la respuesta con los datos obtenidos
    """
    if not chat_service.is_available():
        raise HTTPException(
            status_code=503,
            detail="El asistente no está disponible."
        )

    # Solo admin, supervisor o empleado pueden usar consultas gerenciales
    if current_user.rol not in ['admin', 'supervisor', 'empleado', 'super_admin']:
        raise HTTPException(
            status_code=403,
            detail="No tenés permisos para usar consultas gerenciales."
        )

    municipio_id = current_user.municipio_id
    pregunta_original = request.pregunta
    historial = request.historial

    # Extraer formato si viene en la pregunta [formato: X]
    formato_match = re.search(r'\[formato:\s*(\w+)\]', pregunta_original, re.IGNORECASE)
    formato = formato_match.group(1).lower() if formato_match else None
    # Limpiar la pregunta del tag de formato para el SQL
    pregunta = re.sub(r'\s*\[formato:\s*\w+\]', '', pregunta_original).strip()

    # Si no hay formato explícito, detectar automáticamente por palabras clave
    if not formato:
        formato_auto = detectar_formato_automatico(pregunta)
        if formato_auto:
            formato = formato_auto
            print(f"[CONSULTA] Formato auto-detectado: {formato}")

    print(f"[CONSULTA] {current_user.email} pregunta: {pregunta[:100]}... formato: {formato}")

    # Paso 1: Obtener schema de la BD
    schema = await get_database_schema(db)

    # Paso 2: Generar SQL con la IA (incluyendo historial para contexto)
    sql_prompt = build_sql_generator_prompt(municipio_id, schema)
    sql_messages = [{"role": "system", "content": sql_prompt}]

    # Agregar historial previo (últimas 3 interacciones para no saturar)
    for msg in historial[-6:]:  # 3 pares user/assistant
        role = msg.get('role', 'user')
        content = msg.get('content', '')
        sql_previo = msg.get('sql', '')  # SQL ejecutado en esta interacción (si existe)

        # Solo agregar si tiene contenido relevante
        if content and role in ['user', 'assistant']:
            # Para el assistant, extraer info clave de respuestas HTML
            if role == 'assistant':
                resumen_parts = []

                # Si tenemos el SQL ejecutado, es la info más valiosa para contexto
                if sql_previo:
                    resumen_parts.append(f"SQL ejecutado: {sql_previo}")

                if len(content) > 200:
                    # Extraer números y datos clave del HTML
                    import re as re_hist
                    # Buscar números importantes (total, conteo, etc)
                    numeros = re_hist.findall(r'(?:Total|hay|son|tiene[ns]?|encontr[eéa]|registr[oa]s?)[:\s]*(\d+)', content, re_hist.IGNORECASE)
                    # Buscar nombres de empleados mencionados
                    nombres = re_hist.findall(r'<td[^>]*>([A-ZÁÉÍÓÚ][a-záéíóú]+ [A-ZÁÉÍÓÚ][a-záéíóú]+)</td>', content)
                    # Extraer texto plano sin HTML (primeros 300 chars)
                    texto_plano = re_hist.sub(r'<[^>]+>', ' ', content)
                    texto_plano = re_hist.sub(r'\s+', ' ', texto_plano).strip()[:300]

                    if numeros:
                        resumen_parts.append(f"Cantidades: {', '.join(numeros[:5])}")
                    if nombres:
                        resumen_parts.append(f"Nombres: {', '.join(nombres[:5])}")
                    resumen_parts.append(f"Resumen: {texto_plano}")

                    content = "[Respuesta anterior: " + ". ".join(resumen_parts) + "]"
                elif resumen_parts:
                    # Contenido corto pero con SQL
                    content = "[Respuesta anterior: " + ". ".join(resumen_parts) + f". Contenido: {content}]"

            sql_messages.append({"role": role, "content": content})

    # Agregar la pregunta actual
    sql_messages.append({"role": "user", "content": pregunta})

    sql_response = await chat_service.chat(sql_messages, max_tokens=1500)

    if not sql_response:
        raise HTTPException(status_code=503, detail="Error generando consulta SQL")

    print(f"[CONSULTA] Respuesta IA COMPLETA:\n{sql_response}\n--- FIN RESPUESTA ---")

    # Parsear respuesta JSON
    try:
        # Limpiar bloques de código markdown si existen
        clean_response = sql_response.strip()

        # Remover bloques de código markdown
        clean_response = re.sub(r'^```json\s*\n?', '', clean_response)
        clean_response = re.sub(r'^```\s*\n?', '', clean_response)
        clean_response = re.sub(r'\n?```\s*$', '', clean_response)
        clean_response = clean_response.strip()

        print(f"[CONSULTA] JSON limpio: {clean_response[:200]}...")

        # Intentar parsear directamente como JSON
        try:
            sql_data = json.loads(clean_response)
            sql_query = sql_data.get('sql', '')
            descripcion = sql_data.get('descripcion', 'Consulta ejecutada')
        except json.JSONDecodeError:
            # Si falla, buscar el JSON dentro del texto (desde { hasta el último })
            start = clean_response.find('{')
            end = clean_response.rfind('}')
            if start != -1 and end != -1 and end > start:
                json_str = clean_response[start:end+1]
                sql_data = json.loads(json_str)
                sql_query = sql_data.get('sql', '')
                descripcion = sql_data.get('descripcion', 'Consulta ejecutada')
            else:
                raise ValueError("No se encontró JSON válido en la respuesta")
    except json.JSONDecodeError as e:
        print(f"[CONSULTA] Error JSON decode: {e}")
        print(f"[CONSULTA] Respuesta completa: {sql_response}")
        return ConsultaResponse(
            response=f"<p style='color:#ef4444'>Error interpretando respuesta. Probá reformulando.</p>",
            sql_ejecutado=None,
            datos_crudos=None
        )
    except Exception as e:
        print(f"[CONSULTA] Error parsing SQL response: {e}")
        print(f"[CONSULTA] Respuesta completa: {sql_response}")
        return ConsultaResponse(
            response=f"<p style='color:#ef4444'>No pude generar una consulta para esa pregunta. Probá reformulando.</p>",
            sql_ejecutado=None,
            datos_crudos=None
        )

    print(f"[CONSULTA] SQL generado: {sql_query[:150]}...")

    # Paso 3: Ejecutar SQL
    page = request.page
    page_size = request.page_size
    # Si el formato muestra todos los datos, traer sin límite
    sin_limite = formato in ['cards', 'list', 'timeline', 'wizard', 'ranking', 'tabs', 'dashboard']
    result = await execute_dynamic_sql(db, sql_query, municipio_id, page, page_size, sin_limite=sin_limite)

    if result.get('error'):
        print(f"[CONSULTA] Error SQL: {result['error']}")
        return ConsultaResponse(
            response=f"<p style='color:#ef4444'>Error ejecutando consulta: {result['error']}</p>",
            sql_ejecutado=result.get('sql'),
            datos_crudos=None,
            total_registros=0
        )

    datos = result.get('data', [])
    total = result.get('total', len(datos))
    print(f"[CONSULTA] Datos obtenidos: {len(datos)} registros de {total} total")

    if not datos:
        return ConsultaResponse(
            response=f"<p>No encontré datos para tu consulta.</p><p style='color:#64748b;font-size:13px'>Consulta: {descripcion}</p>",
            sql_ejecutado=result.get('sql'),
            datos_crudos=[],
            total_registros=0
        )

    # Paso 4: Formatear respuesta
    if page == 1:
        # Formatos con generación Python directa (sin LLM - más rápido y sin límite de tokens)
        if formato == 'cards':
            print(f"[CONSULTA] Generando HTML cards directamente (sin LLM) para {len(datos)} registros")
            formatted_response = generar_html_cards(datos, descripcion)
        elif formato == 'ranking':
            print(f"[CONSULTA] Generando HTML ranking directamente (sin LLM) para {len(datos)} registros")
            formatted_response = generar_html_ranking(datos, descripcion)
        elif formato == 'list':
            print(f"[CONSULTA] Generando HTML list directamente (sin LLM) para {len(datos)} registros")
            formatted_response = generar_html_list(datos, descripcion)
        elif formato == 'timeline':
            print(f"[CONSULTA] Generando HTML timeline directamente (sin LLM) para {len(datos)} registros")
            formatted_response = generar_html_timeline(datos, descripcion)
        else:
            # Otros formatos: usar LLM para formatear
            format_prompt = build_response_with_data_prompt(pregunta, datos, descripcion, total, formato)
            format_messages = [
                {"role": "system", "content": format_prompt},
                {"role": "user", "content": f"Formateá estos datos como respuesta a: {pregunta}"}
            ]

            # Más tokens si es formato que muestra todos los datos
            max_tokens = 3000 if formato in ['list', 'timeline', 'table', 'wizard', 'ranking', 'tabs', 'dashboard'] else 1500
            formatted_response = await chat_service.chat(format_messages, max_tokens=max_tokens)

            if not formatted_response:
                # Fallback: mostrar datos en tabla básica
                formatted_response = f"<p>{descripcion}</p><p>Se encontraron {total} registros.</p>"
    else:
        # Para páginas siguientes, no regenerar respuesta
        formatted_response = f"<p style='color:#64748b;font-size:13px'>Página {page} de {(total + page_size - 1) // page_size}</p>"

    # Ocultar grilla si el formato ya muestra todos los datos
    mostrar_grilla = formato not in ['cards', 'list', 'timeline', 'wizard', 'ranking', 'tabs', 'dashboard']

    return ConsultaResponse(
        response=formatted_response,
        sql_ejecutado=result.get('sql'),
        datos_crudos=datos,
        total_registros=total,
        page=page,
        page_size=page_size,
        mostrar_grilla=mostrar_grilla
    )


@router.post("/refresh-schema")
async def refresh_database_schema(
    current_user: User = Depends(get_current_user),
):
    """
    Recarga el schema desde el archivo JSON.
    El schema se mantiene en APP_GUIDE/12_DATABASE_SCHEMA.json
    """
    global _SCHEMA_JSON_CACHE, _SCHEMA_TEXT_CACHE

    if current_user.rol not in ['admin', 'super_admin']:
        raise HTTPException(status_code=403, detail="Solo admins pueden ver el schema")

    # Limpiar caches para forzar recarga
    _SCHEMA_JSON_CACHE = None
    _SCHEMA_TEXT_CACHE = None

    schema = await get_database_schema()
    return {
        "message": "Schema recargado desde JSON (caches limpiados)",
        "source": str(SCHEMA_JSON_PATHS),
        "schema_preview": schema[:500] + "..."
    }


# ==================== VALIDACIÓN DE DUPLICADOS CON IA ====================

async def get_entidades_existentes(db: AsyncSession, municipio_id: int, tipo: str) -> list[dict]:
    """Obtiene las entidades existentes según el tipo"""
    from models.categoria import MunicipioCategoria

    if tipo == "categoria":
        query = (
            select(Categoria)
            .join(MunicipioCategoria, MunicipioCategoria.categoria_id == Categoria.id)
            .where(
                MunicipioCategoria.municipio_id == municipio_id,
                MunicipioCategoria.activo == True,
                Categoria.activo == True
            )
        )
        result = await db.execute(query)
        items = result.scalars().all()
        return [{"nombre": c.nombre, "descripcion": c.descripcion or ""} for c in items]

    elif tipo == "zona":
        query = select(Zona).where(
            Zona.municipio_id == municipio_id,
            Zona.activo == True
        )
        result = await db.execute(query)
        items = result.scalars().all()
        return [{"nombre": z.nombre, "descripcion": z.descripcion or ""} for z in items]

    elif tipo == "tipo_tramite":
        # TipoTramite es catálogo genérico, se relaciona vía MunicipioTipoTramite
        query = (
            select(TipoTramite)
            .join(MunicipioTipoTramite, MunicipioTipoTramite.tipo_tramite_id == TipoTramite.id)
            .where(
                MunicipioTipoTramite.municipio_id == municipio_id,
                MunicipioTipoTramite.activo == True,
                TipoTramite.activo == True
            )
        )
        result = await db.execute(query)
        items = result.scalars().all()
        return [{"nombre": t.nombre, "descripcion": t.descripcion or ""} for t in items]

    elif tipo == "tramite":
        # Tramite es catálogo genérico, se relaciona vía MunicipioTramite
        query = (
            select(Tramite)
            .join(MunicipioTramite, MunicipioTramite.tramite_id == Tramite.id)
            .where(
                MunicipioTramite.municipio_id == municipio_id,
                MunicipioTramite.activo == True,
                Tramite.activo == True
            )
        )
        result = await db.execute(query)
        items = result.scalars().all()
        return [{"nombre": t.nombre, "descripcion": t.descripcion or ""} for t in items]

    return []


def build_validacion_prompt(nombre_nuevo: str, tipo: str, existentes: list[dict]) -> str:
    """Construye el prompt para validar duplicados con IA"""
    tipo_labels = {
        "categoria": "categoría de reclamos",
        "zona": "zona/barrio",
        "tipo_tramite": "tipo de trámite",
        "tramite": "trámite"
    }

    tipo_label = tipo_labels.get(tipo, tipo)

    existentes_str = "\n".join([
        f"  - {e['nombre']}" + (f": {e['descripcion'][:100]}" if e.get('descripcion') else "")
        for e in existentes
    ]) or "  (No hay elementos existentes)"

    return f"""Sos un asistente que ayuda a evitar duplicados en un sistema municipal.

El usuario quiere crear una nueva {tipo_label} con el nombre: "{nombre_nuevo}"

LISTA DE {tipo_label.upper()}S EXISTENTES EN EL SISTEMA:
{existentes_str}

TAREA: Analizá si el nombre "{nombre_nuevo}" es similar o equivalente a alguno existente.

Considerá:
1. Sinónimos (ej: "Luminarias" y "Alumbrado Público" son lo mismo)
2. Variaciones de escritura (ej: "Espacios Verdes" y "Espacio verde")
3. Abreviaturas (ej: "Tránsito" y "Transito y Vialidad")
4. Conceptos relacionados muy cercanos

RESPUESTA (formato JSON estricto):
{{
  "es_duplicado": true/false,
  "similar_a": "nombre del existente similar" o null,
  "confianza": "alta"/"media"/"baja",
  "sugerencia": "mensaje corto explicando la situación"
}}

Si NO hay ninguno similar, respondé:
{{
  "es_duplicado": false,
  "similar_a": null,
  "confianza": "alta",
  "sugerencia": "El nombre es único, puede crearse sin problemas."
}}

IMPORTANTE: Respondé SOLO el JSON, sin texto adicional."""


@router.post("/validar-duplicado")
async def validar_duplicado(
    request: ValidarDuplicadoRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"]))
):
    """
    Valida si un nombre de entidad ya existe o es similar a uno existente.
    Usa IA para detectar sinónimos, variaciones y conceptos similares.
    """
    if not chat_service.is_available():
        # Fallback: hacer comparación simple sin IA
        existentes = await get_entidades_existentes(db, current_user.municipio_id, request.tipo)
        nombre_lower = request.nombre.lower().strip()

        for e in existentes:
            if e['nombre'].lower().strip() == nombre_lower:
                return {
                    "es_duplicado": True,
                    "similar_a": e['nombre'],
                    "confianza": "alta",
                    "sugerencia": f"Ya existe una entidad con el nombre exacto '{e['nombre']}'."
                }

        return {
            "es_duplicado": False,
            "similar_a": None,
            "confianza": "media",
            "sugerencia": "No se detectaron duplicados exactos. (Validación IA no disponible)"
        }

    # Obtener entidades existentes
    existentes = await get_entidades_existentes(db, current_user.municipio_id, request.tipo)

    # Si no hay existentes, no puede haber duplicado
    if not existentes:
        return {
            "es_duplicado": False,
            "similar_a": None,
            "confianza": "alta",
            "sugerencia": "No hay elementos existentes. Puede crearse sin problemas."
        }

    # Primero verificar duplicado exacto (sin IA)
    nombre_lower = request.nombre.lower().strip()
    for e in existentes:
        if e['nombre'].lower().strip() == nombre_lower:
            return {
                "es_duplicado": True,
                "similar_a": e['nombre'],
                "confianza": "alta",
                "sugerencia": f"Ya existe con el nombre exacto '{e['nombre']}'."
            }

    # Usar IA para detectar similitudes semánticas
    prompt = build_validacion_prompt(request.nombre, request.tipo, existentes)

    print(f"[VALIDAR DUPLICADO] Tipo: {request.tipo}, Nombre: {request.nombre}")

    response = await chat_service.chat(prompt, max_tokens=200)

    if response:
        try:
            # Intentar parsear JSON de la respuesta
            import json
            # Limpiar respuesta (a veces viene con ```json ... ```)
            clean_response = response.strip()
            if clean_response.startswith("```"):
                clean_response = clean_response.split("```")[1]
                if clean_response.startswith("json"):
                    clean_response = clean_response[4:]
            clean_response = clean_response.strip()

            result = json.loads(clean_response)
            return {
                "es_duplicado": result.get("es_duplicado", False),
                "similar_a": result.get("similar_a"),
                "confianza": result.get("confianza", "media"),
                "sugerencia": result.get("sugerencia", "")
            }
        except json.JSONDecodeError:
            print(f"[VALIDAR DUPLICADO] Error parseando JSON: {response}")
            # Si la IA respondió pero no en JSON válido, asumir que no es duplicado
            return {
                "es_duplicado": False,
                "similar_a": None,
                "confianza": "baja",
                "sugerencia": "No se pudo determinar con certeza. Verificá manualmente."
            }

    # Fallback si la IA no responde
    return {
        "es_duplicado": False,
        "similar_a": None,
        "confianza": "baja",
        "sugerencia": "No se pudo validar con IA. Verificá que no exista uno similar."
    }


# ==================== PANEL BI: KPIs Y ENTIDADES ====================

class KPIsResponse(BaseModel):
    """Response con métricas KPI en tiempo real"""
    reclamos: dict
    tramites: dict
    empleados: dict
    tendencias: dict


@router.post("/templates/reload")
async def reload_templates(
    current_user: User = Depends(get_current_user),
):
    """
    Recarga los templates de visualización (limpia cache).
    Útil cuando se modifican los archivos JSON de templates.
    """
    if current_user.rol not in ['admin', 'super_admin']:
        raise HTTPException(status_code=403, detail="Solo admins pueden recargar templates")

    clear_templates_cache()
    return {"status": "ok", "message": "Cache de templates limpiado"}


@router.get("/kpis", response_model=KPIsResponse)
async def get_kpis(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Obtiene KPIs en tiempo real para el panel BI.
    Devuelve métricas de reclamos, trámites, empleados y tendencias.
    """
    if current_user.rol not in ['admin', 'supervisor', 'empleado', 'super_admin']:
        raise HTTPException(status_code=403, detail="Sin permisos para ver KPIs")

    municipio_id = current_user.municipio_id
    from datetime import date

    hoy = date.today()
    inicio_semana = hoy - timedelta(days=hoy.weekday())
    inicio_mes = hoy.replace(day=1)
    semana_pasada = inicio_semana - timedelta(days=7)
    mes_pasado = (inicio_mes - timedelta(days=1)).replace(day=1)

    # ===== RECLAMOS =====
    reclamos_query = select(
        sql_func.count(Reclamo.id).label('total'),
        sql_func.sum(case((Reclamo.estado == EstadoReclamo.NUEVO, 1), else_=0)).label('nuevos'),
        sql_func.sum(case((Reclamo.estado == EstadoReclamo.ASIGNADO, 1), else_=0)).label('asignados'),
        sql_func.sum(case((Reclamo.estado == EstadoReclamo.EN_CURSO, 1), else_=0)).label('en_curso'),
        sql_func.sum(case((Reclamo.estado == EstadoReclamo.RESUELTO, 1), else_=0)).label('resueltos'),
        sql_func.sum(case((sql_func.date(Reclamo.created_at) == hoy, 1), else_=0)).label('hoy'),
        sql_func.sum(case((sql_func.date(Reclamo.created_at) >= inicio_semana, 1), else_=0)).label('esta_semana'),
        sql_func.sum(case((sql_func.date(Reclamo.created_at) >= inicio_mes, 1), else_=0)).label('este_mes'),
    ).where(Reclamo.municipio_id == municipio_id)

    result = await db.execute(reclamos_query)
    r = result.first()

    pendientes = (r.nuevos or 0) + (r.asignados or 0) + (r.en_curso or 0)

    # ===== TRÁMITES =====
    tramites_query = select(
        sql_func.count(Solicitud.id).label('total'),
        sql_func.sum(case((Solicitud.estado == EstadoSolicitud.INICIADO, 1), else_=0)).label('iniciados'),
        sql_func.sum(case((Solicitud.estado == EstadoSolicitud.EN_REVISION, 1), else_=0)).label('en_revision'),
        sql_func.sum(case((Solicitud.estado == EstadoSolicitud.EN_CURSO, 1), else_=0)).label('en_curso'),
        sql_func.sum(case((Solicitud.estado == EstadoSolicitud.APROBADO, 1), else_=0)).label('aprobados'),
        sql_func.sum(case((sql_func.date(Solicitud.created_at) >= inicio_semana, 1), else_=0)).label('esta_semana'),
    ).where(Solicitud.municipio_id == municipio_id)

    result_t = await db.execute(tramites_query)
    t = result_t.first()

    # ===== EMPLEADOS =====
    empleados_query = select(
        sql_func.count(Empleado.id).label('total'),
        sql_func.sum(case((Empleado.activo == True, 1), else_=0)).label('activos'),
    ).where(Empleado.municipio_id == municipio_id)

    result_e = await db.execute(empleados_query)
    e = result_e.first()

    # ===== TENDENCIAS (comparación con período anterior) =====
    # Reclamos semana pasada vs esta semana
    trend_semana_query = select(
        sql_func.count(Reclamo.id)
    ).where(
        Reclamo.municipio_id == municipio_id,
        sql_func.date(Reclamo.created_at) >= semana_pasada,
        sql_func.date(Reclamo.created_at) < inicio_semana
    )
    result_trend = await db.execute(trend_semana_query)
    reclamos_semana_pasada = result_trend.scalar() or 0

    cambio_semanal = 0
    if reclamos_semana_pasada > 0:
        cambio_semanal = round(((r.esta_semana or 0) - reclamos_semana_pasada) / reclamos_semana_pasada * 100, 1)

    return KPIsResponse(
        reclamos={
            "total": r.total or 0,
            "pendientes": pendientes,
            "nuevos": r.nuevos or 0,
            "asignados": r.asignados or 0,
            "en_curso": r.en_curso or 0,
            "resueltos": r.resueltos or 0,
            "hoy": r.hoy or 0,
            "esta_semana": r.esta_semana or 0,
            "este_mes": r.este_mes or 0,
        },
        tramites={
            "total": t.total or 0,
            "iniciados": t.iniciados or 0,
            "en_revision": t.en_revision or 0,
            "en_curso": t.en_curso or 0,
            "aprobados": t.aprobados or 0,
            "esta_semana": t.esta_semana or 0,
        },
        empleados={
            "total": e.total or 0,
            "activos": e.activos or 0,
        },
        tendencias={
            "reclamos_cambio_semanal": cambio_semanal,
            "reclamos_semana_pasada": reclamos_semana_pasada,
        }
    )


class EntidadInfo(BaseModel):
    """Info de una entidad/tabla para el panel BI"""
    nombre: str
    tabla: str
    icono: str
    descripcion: str
    campos_principales: list[str]


@router.get("/entities")
async def get_entities(
    current_user: User = Depends(get_current_user),
):
    """
    Devuelve la lista de entidades/tablas disponibles para consultas.
    Usado para el panel lateral del BI con autocompletado.
    Lee desde el archivo markdown 12_DATABASE_SCHEMA.md
    """
    if current_user.rol not in ['admin', 'supervisor', 'empleado', 'super_admin']:
        raise HTTPException(status_code=403, detail="Sin permisos")

    # Leer entidades desde el markdown
    entities = parse_entities_from_markdown()

    return {"entities": entities}


def parse_schema_json_to_tables(include_relationships: bool = False, force_refresh: bool = False) -> dict:
    """Extrae tablas/columnas del JSON para autocompletado.

    Args:
        include_relationships: Si True, incluye relaciones. Por defecto False
                               para mantener compatibilidad con frontend actual.
        force_refresh: Si True, fuerza recarga del archivo ignorando cache.

    Returns:
        Si include_relationships=False: { tabla: [{ name, type, fk }] }
        Si include_relationships=True: { tabla: { columns: [...], relationships: [...] } }
    """
    schema = load_schema_json(force_refresh=force_refresh)
    if not schema:
        return {}

    tables = {}

    # Extraer entidades principales
    entities = schema.get("entities", {})
    for table_name, table_data in entities.items():
        columns_data = table_data.get("columns", {})
        columns = []
        for col_name, col_info in columns_data.items():
            col_type = col_info.get("type", "unknown")
            fk = col_info.get("foreign_key", None)
            columns.append({
                "name": col_name,
                "type": col_type,
                "fk": fk
            })

        if include_relationships:
            # Extraer relaciones
            relationships = []
            rels_data = table_data.get("relationships", {})
            for rel_name, rel_info in rels_data.items():
                relationships.append({
                    "name": rel_name,
                    "type": rel_info.get("type"),  # belongs_to, has_many, etc.
                    "target": rel_info.get("target"),
                    "foreign_key": rel_info.get("foreign_key")
                })
            tables[table_name] = {
                "columns": columns,
                "relationships": relationships
            }
        else:
            tables[table_name] = columns

    # Extraer tablas pivot
    pivot_tables = schema.get("pivot_tables", {})
    for table_name, table_data in pivot_tables.items():
        columns_data = table_data.get("columns", {})
        columns = []
        for col_name, col_info in columns_data.items():
            col_type = col_info.get("type", "unknown")
            fk = col_info.get("foreign_key", None)
            columns.append({
                "name": col_name,
                "type": col_type,
                "fk": fk
            })

        if include_relationships:
            tables[table_name] = {
                "columns": columns,
                "relationships": []
            }
        else:
            tables[table_name] = columns

    return tables


def parse_schema_markdown_to_json() -> dict:
    """DEPRECADO: Usa parse_schema_json_to_tables() en su lugar."""
    return parse_schema_json_to_tables()


def parse_entities_from_json() -> list[dict]:
    """Extrae entidades del JSON para el panel de entidades, incluyendo relaciones"""
    schema = load_schema_json()
    if not schema:
        return []

    entities = []
    # Obtener tablas con relaciones incluidas
    tables_data = parse_schema_json_to_tables(include_relationships=True)
    ui_entities = schema.get("ui_entities", {})

    for table_name, ui_data in ui_entities.items():
        # Obtener datos de la tabla
        table_info = tables_data.get(table_name, {"columns": [], "relationships": []})

        entities.append({
            "tabla": table_name,
            "nombre": ui_data.get("nombre", table_name),
            "icono": ui_data.get("icono", "database"),
            "descripcion": ui_data.get("descripcion", ""),
            "campos": table_info.get("columns", []),
            "relaciones": table_info.get("relationships", [])
        })

    return entities


def parse_entities_from_markdown() -> list[dict]:
    """DEPRECADO: Usa parse_entities_from_json() en su lugar."""
    return parse_entities_from_json()


@router.get("/schema")
async def get_db_schema(
    current_user: User = Depends(get_current_user),
):
    """
    Devuelve el schema parseado del markdown para autocompletado.
    """
    if current_user.rol not in ['admin', 'supervisor', 'empleado', 'super_admin']:
        raise HTTPException(status_code=403, detail="Sin permisos")

    try:
        tables = parse_schema_markdown_to_json()
        return {"tables": tables}
    except Exception as e:
        return {"tables": {}, "error": str(e)}


# ==================== CONSULTAS GUARDADAS (CUBOS) ====================

from models.consulta_guardada import ConsultaGuardada


class ConsultaGuardadaCreate(BaseModel):
    """Request para crear una consulta guardada"""
    nombre: str
    descripcion: Optional[str] = None
    pregunta_original: str
    sql_query: Optional[str] = None
    icono: str = "database"
    color: str = "#3b82f6"
    tipo_visualizacion: str = "tabla"
    es_publica: bool = False


class ConsultaGuardadaUpdate(BaseModel):
    """Request para actualizar una consulta guardada"""
    nombre: Optional[str] = None
    descripcion: Optional[str] = None
    icono: Optional[str] = None
    color: Optional[str] = None
    tipo_visualizacion: Optional[str] = None
    es_publica: Optional[bool] = None


class ConsultaGuardadaResponse(BaseModel):
    """Response de consulta guardada"""
    id: int
    nombre: str
    descripcion: Optional[str]
    pregunta_original: str
    sql_query: Optional[str]
    icono: str
    color: str
    tipo_visualizacion: str
    es_publica: bool
    veces_ejecutada: int
    created_at: datetime
    usuario_nombre: Optional[str] = None

    class Config:
        from_attributes = True


@router.get("/consultas-guardadas", response_model=list[ConsultaGuardadaResponse])
async def listar_consultas_guardadas(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Lista las consultas guardadas del usuario.
    Incluye las propias + las públicas del municipio.
    """
    if current_user.rol not in ['admin', 'supervisor', 'empleado', 'super_admin']:
        raise HTTPException(status_code=403, detail="Sin permisos")

    municipio_id = current_user.municipio_id

    query = (
        select(ConsultaGuardada, User.nombre.label('usuario_nombre'))
        .join(User, ConsultaGuardada.usuario_id == User.id)
        .where(
            ConsultaGuardada.municipio_id == municipio_id,
            ConsultaGuardada.activo == True,
            # Propias o públicas
            (ConsultaGuardada.usuario_id == current_user.id) | (ConsultaGuardada.es_publica == True)
        )
        .order_by(ConsultaGuardada.veces_ejecutada.desc(), ConsultaGuardada.created_at.desc())
    )

    result = await db.execute(query)
    rows = result.all()

    return [
        ConsultaGuardadaResponse(
            id=c.id,
            nombre=c.nombre,
            descripcion=c.descripcion,
            pregunta_original=c.pregunta_original,
            sql_query=c.sql_query,
            icono=c.icono or "database",
            color=c.color or "#3b82f6",
            tipo_visualizacion=c.tipo_visualizacion or "tabla",
            es_publica=c.es_publica,
            veces_ejecutada=c.veces_ejecutada or 0,
            created_at=c.created_at,
            usuario_nombre=usuario_nombre
        )
        for c, usuario_nombre in rows
    ]


@router.post("/consultas-guardadas", response_model=ConsultaGuardadaResponse)
async def crear_consulta_guardada(
    request: ConsultaGuardadaCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Crea una nueva consulta guardada"""
    if current_user.rol not in ['admin', 'supervisor', 'empleado', 'super_admin']:
        raise HTTPException(status_code=403, detail="Sin permisos")

    nueva = ConsultaGuardada(
        municipio_id=current_user.municipio_id,
        usuario_id=current_user.id,
        nombre=request.nombre,
        descripcion=request.descripcion,
        pregunta_original=request.pregunta_original,
        sql_query=request.sql_query,
        icono=request.icono,
        color=request.color,
        tipo_visualizacion=request.tipo_visualizacion,
        es_publica=request.es_publica,
    )

    db.add(nueva)
    await db.commit()
    await db.refresh(nueva)

    return ConsultaGuardadaResponse(
        id=nueva.id,
        nombre=nueva.nombre,
        descripcion=nueva.descripcion,
        pregunta_original=nueva.pregunta_original,
        sql_query=nueva.sql_query,
        icono=nueva.icono or "database",
        color=nueva.color or "#3b82f6",
        tipo_visualizacion=nueva.tipo_visualizacion or "tabla",
        es_publica=nueva.es_publica,
        veces_ejecutada=0,
        created_at=nueva.created_at,
        usuario_nombre=f"{current_user.nombre}"
    )


@router.put("/consultas-guardadas/{consulta_id}", response_model=ConsultaGuardadaResponse)
async def actualizar_consulta_guardada(
    consulta_id: int,
    request: ConsultaGuardadaUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Actualiza una consulta guardada (solo el dueño o admin)"""
    query = select(ConsultaGuardada).where(
        ConsultaGuardada.id == consulta_id,
        ConsultaGuardada.municipio_id == current_user.municipio_id,
        ConsultaGuardada.activo == True
    )
    result = await db.execute(query)
    consulta = result.scalar_one_or_none()

    if not consulta:
        raise HTTPException(status_code=404, detail="Consulta no encontrada")

    # Solo el dueño o admin pueden editar
    if consulta.usuario_id != current_user.id and current_user.rol not in ['admin', 'super_admin']:
        raise HTTPException(status_code=403, detail="No podés editar esta consulta")

    # Actualizar campos
    if request.nombre is not None:
        consulta.nombre = request.nombre
    if request.descripcion is not None:
        consulta.descripcion = request.descripcion
    if request.icono is not None:
        consulta.icono = request.icono
    if request.color is not None:
        consulta.color = request.color
    if request.tipo_visualizacion is not None:
        consulta.tipo_visualizacion = request.tipo_visualizacion
    if request.es_publica is not None:
        consulta.es_publica = request.es_publica

    await db.commit()
    await db.refresh(consulta)

    return ConsultaGuardadaResponse(
        id=consulta.id,
        nombre=consulta.nombre,
        descripcion=consulta.descripcion,
        pregunta_original=consulta.pregunta_original,
        sql_query=consulta.sql_query,
        icono=consulta.icono or "database",
        color=consulta.color or "#3b82f6",
        tipo_visualizacion=consulta.tipo_visualizacion or "tabla",
        es_publica=consulta.es_publica,
        veces_ejecutada=consulta.veces_ejecutada or 0,
        created_at=consulta.created_at,
    )


@router.delete("/consultas-guardadas/{consulta_id}")
async def eliminar_consulta_guardada(
    consulta_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Elimina (soft delete) una consulta guardada"""
    query = select(ConsultaGuardada).where(
        ConsultaGuardada.id == consulta_id,
        ConsultaGuardada.municipio_id == current_user.municipio_id,
        ConsultaGuardada.activo == True
    )
    result = await db.execute(query)
    consulta = result.scalar_one_or_none()

    if not consulta:
        raise HTTPException(status_code=404, detail="Consulta no encontrada")

    if consulta.usuario_id != current_user.id and current_user.rol not in ['admin', 'super_admin']:
        raise HTTPException(status_code=403, detail="No podés eliminar esta consulta")

    consulta.activo = False
    await db.commit()

    return {"message": "Consulta eliminada"}


@router.post("/consultas-guardadas/{consulta_id}/ejecutar", response_model=ConsultaResponse)
async def ejecutar_consulta_guardada(
    consulta_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Ejecuta una consulta guardada y devuelve los resultados.
    Incrementa el contador de ejecuciones.
    """
    if current_user.rol not in ['admin', 'supervisor', 'empleado', 'super_admin']:
        raise HTTPException(status_code=403, detail="Sin permisos")

    query = select(ConsultaGuardada).where(
        ConsultaGuardada.id == consulta_id,
        ConsultaGuardada.municipio_id == current_user.municipio_id,
        ConsultaGuardada.activo == True,
        # Propias o públicas
        (ConsultaGuardada.usuario_id == current_user.id) | (ConsultaGuardada.es_publica == True)
    )
    result = await db.execute(query)
    consulta = result.scalar_one_or_none()

    if not consulta:
        raise HTTPException(status_code=404, detail="Consulta no encontrada")

    # Incrementar contador
    consulta.veces_ejecutada = (consulta.veces_ejecutada or 0) + 1
    consulta.ultima_ejecucion = datetime.now()
    await db.commit()

    # Si tiene SQL guardado, ejecutarlo directamente
    if consulta.sql_query:
        result_sql = await execute_dynamic_sql(db, consulta.sql_query, current_user.municipio_id)

        if result_sql.get('error'):
            return ConsultaResponse(
                response=f"<p style='color:#ef4444'>Error: {result_sql['error']}</p>",
                sql_ejecutado=result_sql.get('sql'),
                datos_crudos=None
            )

        datos = result_sql.get('data', [])

        # Formatear respuesta
        if datos:
            format_prompt = build_response_with_data_prompt(consulta.pregunta_original, datos, consulta.nombre, len(datos))
            format_messages = [
                {"role": "system", "content": format_prompt},
                {"role": "user", "content": f"Formateá estos datos para: {consulta.pregunta_original}"}
            ]
            formatted = await chat_service.chat(format_messages, max_tokens=1500)

            return ConsultaResponse(
                response=formatted or f"<p>Se encontraron {len(datos)} registros.</p>",
                sql_ejecutado=result_sql.get('sql'),
                datos_crudos=datos[:20]
            )

        return ConsultaResponse(
            response="<p>No se encontraron datos.</p>",
            sql_ejecutado=result_sql.get('sql'),
            datos_crudos=[]
        )

    # Si no tiene SQL, regenerarlo con la IA
    schema = await get_database_schema(db)
    sql_prompt = build_sql_generator_prompt(current_user.municipio_id, schema)
    sql_messages = [
        {"role": "system", "content": sql_prompt},
        {"role": "user", "content": consulta.pregunta_original}
    ]

    sql_response = await chat_service.chat(sql_messages, max_tokens=500)

    if not sql_response:
        return ConsultaResponse(
            response="<p style='color:#ef4444'>Error generando consulta</p>",
            sql_ejecutado=None,
            datos_crudos=None
        )

    try:
        json_match = re.search(r'\{[\s\S]*\}', sql_response)
        if json_match:
            sql_data = json.loads(json_match.group())
            sql_query = sql_data.get('sql', '')

            # Guardar SQL para próximas ejecuciones
            consulta.sql_query = sql_query
            await db.commit()

            result_sql = await execute_dynamic_sql(db, sql_query, current_user.municipio_id)
            datos = result_sql.get('data', [])

            return ConsultaResponse(
                response=f"<p>Consulta ejecutada: {len(datos)} registros</p>",
                sql_ejecutado=sql_query,
                datos_crudos=datos[:20]
            )
    except Exception as e:
        return ConsultaResponse(
            response=f"<p style='color:#ef4444'>Error: {str(e)}</p>",
            sql_ejecutado=None,
            datos_crudos=None
        )
