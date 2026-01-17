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


router = APIRouter()


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


def build_system_prompt(categorias: list[dict], tramites: list[dict] = None, telefono_contacto: str = None) -> str:
    """Construye el prompt del sistema con las categorías y trámites del municipio"""
    # Lista de categorías simple
    cats_list = "\n".join([f"- {c['nombre']}" for c in categorias]) if categorias else "(Sin categorías)"

    # Lista jerárquica de trámites
    tramites_list = ""
    if tramites:
        lines = []
        for tipo in tramites:
            subtipos = tipo.get('subtipos', [])
            if subtipos:
                subtipos_names = ", ".join([s['nombre'] for s in subtipos])
                lines.append(f"- {tipo['nombre']}: {subtipos_names}")
            else:
                lines.append(f"- {tipo['nombre']}")
        tramites_list = "\n".join(lines)
    else:
        tramites_list = "(Sin trámites configurados)"

    # Teléfono de contacto
    tel_info = f"Teléfono de contacto: {telefono_contacto}" if telefono_contacto else ""

    return f"""Sos el asistente virtual de Munify, un sistema de gestión municipal que conecta vecinos con su municipio.

QUÉ ES MUNIFY:
Una app para reportar problemas del barrio y hacer trámites municipales 100% digital.
El vecino reporta → el municipio gestiona → se resuelve → el vecino recibe notificación.

CÓMO FUNCIONA PARA CADA ROL:

Vecino/Ciudadano:
- Reporta problemas en segundos desde el celular (foto + GPS automático)
- Recibe notificaciones de cada cambio de estado
- Puede hacer trámites sin ir al municipio

Empleado Municipal:
- Recibe trabajos automáticamente en su celular
- Actualiza estados y sube fotos antes/después

Supervisor:
- Ve dashboards en tiempo real con métricas y mapas de calor

CATEGORÍAS DE RECLAMOS DISPONIBLES:
{cats_list}

TRÁMITES DISPONIBLES:
{tramites_list}

{tel_info}

FORMATO DE RESPUESTA:
Respondé SOLO en HTML con estilos inline. Usá estos templates:

CARD (para listar categorías, trámites, opciones):
<div style="background:#f8f9fa;border-radius:12px;margin:8px 0;overflow:hidden">
  <div style="background:#2563eb;color:white;padding:10px 14px;font-weight:600">Título</div>
  <div style="padding:12px 14px">Contenido aquí</div>
</div>

LISTA (para pasos o instrucciones):
<ol style="margin:8px 0;padding-left:20px">
  <li style="margin:6px 0">Paso uno</li>
  <li style="margin:6px 0">Paso dos</li>
</ol>

PANEL CON ICONO (para info importante):
<div style="background:#dbeafe;border-left:4px solid #2563eb;padding:12px;border-radius:0 8px 8px 0;margin:8px 0">
  <strong>ℹ️ Título</strong><br>
  Contenido informativo
</div>

TEXTO SIMPLE (saludos, respuestas cortas):
<p style="margin:8px 0">Tu respuesta aquí</p>

REGLAS:
- Sé breve y directo
- Usá español rioplatense (vos, podés, tenés)
- NO uses markdown, SOLO HTML
- NO uses ``` ni bloques de código
- Usá emojis para hacer más amigable (📋 📝 ✅ 📍 🏠 etc)"""


async def get_categorias_municipio(db: AsyncSession, municipio_id: int) -> list[dict]:
    """Obtiene las categorías activas del municipio"""
    query = select(Categoria).where(
        Categoria.municipio_id == municipio_id,
        Categoria.activo == True
    ).order_by(Categoria.nombre)

    result = await db.execute(query)
    categorias = result.scalars().all()

    return [{"id": c.id, "nombre": c.nombre, "icono": c.icono or "folder"} for c in categorias]


async def get_tramites_municipio(db: AsyncSession, municipio_id: int) -> list[dict]:
    """Obtiene los tipos de trámites y sus subtipos activos del municipio"""
    # Obtener TipoTramite con sus Tramites (subtipos)
    query = (
        select(TipoTramite)
        .options(selectinload(TipoTramite.tramites))
        .join(MunicipioTipoTramite, MunicipioTipoTramite.tipo_tramite_id == TipoTramite.id)
        .where(
            MunicipioTipoTramite.municipio_id == municipio_id,
            MunicipioTipoTramite.activo == True,
            TipoTramite.activo == True
        )
        .order_by(TipoTramite.nombre)
    )

    result = await db.execute(query)
    tipos_tramite = result.scalars().unique().all()

    # Obtener IDs de trámites habilitados para este municipio
    tramites_habilitados_query = (
        select(MunicipioTramite.tramite_id)
        .where(
            MunicipioTramite.municipio_id == municipio_id,
            MunicipioTramite.activo == True
        )
    )
    tramites_result = await db.execute(tramites_habilitados_query)
    tramites_habilitados_ids = set(r[0] for r in tramites_result.all())

    # Construir estructura jerárquica
    tramites_list = []
    for tipo in tipos_tramite:
        # Filtrar solo trámites habilitados para el municipio
        subtipos = [
            t for t in tipo.tramites
            if t.activo and t.id in tramites_habilitados_ids
        ]

        tramites_list.append({
            "id": tipo.id,
            "nombre": tipo.nombre,
            "icono": tipo.icono or "file-text",
            "subtipos": [{"id": s.id, "nombre": s.nombre, "icono": s.icono or "file"} for s in subtipos]
        })

    return tramites_list


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

    FALLBACK_MUNICIPIO_ID = 48  # Merlo - tiene datos completos

    # Obtener categorías y trámites del municipio del usuario
    categorias = await get_categorias_municipio(db, current_user.municipio_id)
    tramites = await get_tramites_municipio(db, current_user.municipio_id)

    # Si el municipio no tiene datos, usar fallback
    if not categorias and not tramites and current_user.municipio_id != FALLBACK_MUNICIPIO_ID:
        categorias = await get_categorias_municipio(db, FALLBACK_MUNICIPIO_ID)
        tramites = await get_tramites_municipio(db, FALLBACK_MUNICIPIO_ID)

    # Construir system prompt
    system_prompt = build_system_prompt(categorias, tramites)

    # Obtener o crear sesión para este usuario
    session_id, is_new = await storage.get_or_create_for_user(
        user_id=current_user.id,
        system_prompt=system_prompt,
        context={"municipio_id": current_user.municipio_id, "rol": current_user.rol},
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

    response = await chat_service.chat(prompt, max_tokens=200)

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
    FALLBACK_MUNICIPIO_ID = 48  # Merlo - tiene datos completos
    storage = get_landing_storage()

    # Verificar si ya existe sesión
    existing_session = None
    if request.session_id:
        existing_session = await storage.get_session(request.session_id)

    if existing_session:
        municipio_id = existing_session.get("context", {}).get("municipio_id", FALLBACK_MUNICIPIO_ID)
    else:
        municipio_id = request.municipio_id

    municipio_nombre = None

    # Si no hay municipio, intentar detectar del mensaje con IA
    if not municipio_id:
        municipios = await get_municipios_activos(db)
        if municipios:
            detected = await detectar_municipio_con_ia(request.message, municipios)
            if detected:
                municipio_id = detected["id"]
                municipio_nombre = detected.get("nombre")

    # Fallback a Merlo si no se detectó
    if not municipio_id:
        municipio_id = FALLBACK_MUNICIPIO_ID

    # Obtener datos del municipio
    municipio = await db.get(Municipio, municipio_id)
    telefono_contacto = municipio.telefono if municipio else None

    # Si ya existe sesión, usar historial guardado
    if existing_session:
        session_id = request.session_id
        history = await storage.get_messages(session_id)
        system_prompt = await storage.get_system_prompt(session_id)
    else:
        # Nueva sesión: construir system prompt
        categorias = await get_categorias_municipio(db, municipio_id)
        tramites = await get_tramites_municipio(db, municipio_id)

        # Si el municipio no tiene datos, usar fallback
        if not categorias and not tramites and municipio_id != FALLBACK_MUNICIPIO_ID:
            categorias = await get_categorias_municipio(db, FALLBACK_MUNICIPIO_ID)
            tramites = await get_tramites_municipio(db, FALLBACK_MUNICIPIO_ID)
            if not telefono_contacto:
                fallback_muni = await db.get(Municipio, FALLBACK_MUNICIPIO_ID)
                telefono_contacto = fallback_muni.telefono if fallback_muni else None

        system_prompt = build_system_prompt(categorias, tramites, telefono_contacto)
        session_id = await storage.create_session(system_prompt, {"municipio_id": municipio_id})
        history = []

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


async def get_estadisticas_reclamos(db: AsyncSession, municipio_id: int) -> dict:
    """Obtiene estadísticas de reclamos del municipio"""
    # Total y por estado
    query = select(
        sql_func.count(Reclamo.id).label('total'),
        sql_func.sum(case((Reclamo.estado == EstadoReclamo.NUEVO, 1), else_=0)).label('nuevos'),
        sql_func.sum(case((Reclamo.estado == EstadoReclamo.ASIGNADO, 1), else_=0)).label('asignados'),
        sql_func.sum(case((Reclamo.estado == EstadoReclamo.EN_PROCESO, 1), else_=0)).label('en_proceso'),
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
        'en_proceso': row.en_proceso or 0,
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
        sql_func.sum(case((Solicitud.estado == EstadoSolicitud.EN_PROCESO, 1), else_=0)).label('en_proceso'),
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
        'en_proceso': row.en_proceso or 0,
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
        sql_func.sum(case((Reclamo.estado.in_([EstadoReclamo.NUEVO, EstadoReclamo.ASIGNADO, EstadoReclamo.EN_PROCESO]), 1), else_=0)).label('activos'),
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
    query = select(
        Categoria.nombre,
        sql_func.count(Reclamo.id).label('cantidad')
    ).join(
        Reclamo, Reclamo.categoria_id == Categoria.id
    ).where(
        Categoria.municipio_id == municipio_id
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
        # Contar reclamos por estado para cada empleado
        stats_query = select(
            Reclamo.estado,
            sql_func.count(Reclamo.id).label('cantidad')
        ).where(
            Reclamo.empleado_id == emp.id
        ).group_by(Reclamo.estado)

        stats_result = await db.execute(stats_query)
        stats = {row.estado: row.cantidad for row in stats_result.all()}

        asignados = stats.get(EstadoReclamo.ASIGNADO, 0)
        en_proceso = stats.get(EstadoReclamo.EN_PROCESO, 0)
        pend_conf = stats.get(EstadoReclamo.PENDIENTE_CONFIRMACION, 0)
        resueltos = stats.get(EstadoReclamo.RESUELTO, 0)

        empleados_data.append({
            'id': emp.id,
            'nombre': f"{emp.nombre} {emp.apellido or ''}".strip(),
            'especialidad': emp.especialidad,
            'asignados': asignados,
            'en_proceso': en_proceso,
            'pendiente_confirmacion': pend_conf,
            'resueltos': resueltos,
            'activos': asignados + en_proceso + pend_conf,
            'total': sum(stats.values())
        })

    return empleados_data


def build_asistente_prompt(
    categorias: list,
    stats_reclamos: dict,
    stats_tramites: dict,
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
        f"  - {e['nombre']} (ID:{e['id']}): {e['activos']} activos ({e['asignados']} asignados, {e['en_proceso']} en proceso, {e['pendiente_confirmacion']} pend.conf.), {e['resueltos']} resueltos, {e['total']} total histórico"
        for e in empleados
    ]) or "  Sin empleados"

    usuarios_list = "\n".join([
        f"  - {u['nombre']} (ID:{u['id']}): {u['total_reclamos']} reclamos total, {u['activos']} activos, {u['resueltos']} resueltos"
        for u in usuarios_con_reclamos[:15]
    ]) or "  Sin datos de usuarios"

    return f"""Sos el Asistente Municipal, un asistente inteligente con acceso a datos del sistema de gestión municipal.

DATOS ACTUALES DEL MUNICIPIO:

📊 ESTADÍSTICAS DE RECLAMOS:
  - Total: {stats_reclamos['total']}
  - Nuevos: {stats_reclamos['nuevos']}
  - Asignados: {stats_reclamos['asignados']}
  - En proceso: {stats_reclamos['en_proceso']}
  - Pendiente confirmación: {stats_reclamos['pendiente_confirmacion']}
  - Resueltos: {stats_reclamos['resueltos']}
  - Rechazados: {stats_reclamos['rechazados']}

📋 ESTADÍSTICAS DE TRÁMITES:
  - Total: {stats_tramites['total']}
  - Iniciados: {stats_tramites['iniciados']}
  - En revisión: {stats_tramites['en_revision']}
  - Requiere documentación: {stats_tramites['requiere_documentacion']}
  - En proceso: {stats_tramites['en_proceso']}
  - Aprobados: {stats_tramites['aprobados']}
  - Rechazados: {stats_tramites['rechazados']}
  - Finalizados: {stats_tramites['finalizados']}

🔔 RECLAMOS RECIENTES:
{reclamos_list}

📝 TRÁMITES RECIENTES:
{tramites_list}

📈 RECLAMOS POR CATEGORÍA:
{cats_stats}

👥 EMPLEADOS ACTIVOS (con estadísticas de reclamos asignados):
{empleados_list}

👤 VECINOS CON RECLAMOS (usuarios que crearon reclamos):
{usuarios_list}

CATEGORÍAS DISPONIBLES: {cats_list}

TU ROL:
- Responder preguntas sobre el estado del sistema
- Dar información sobre reclamos, trámites, estadísticas de empleados y vecinos
- Ayudar a interpretar los datos
- Sugerir acciones basadas en los datos
- Responder consultas sobre cuántos reclamos tiene asignado cada empleado

REGLAS:
1. Usá español argentino (vos, podés, tenés)
2. Sé conciso pero informativo
3. Cuando te pregunten por un empleado (ej: "cuántos reclamos tiene Juan"), buscá en la lista de EMPLEADOS ACTIVOS por nombre similar
4. Podés hacer cálculos simples con los datos (porcentajes, comparaciones)
5. SIEMPRE incluí links relevantes usando formato markdown: [texto](url)
6. Si te preguntan por un empleado específico, incluí el link al tablero para ver sus reclamos

LINKS DISPONIBLES (usá el formato markdown exacto):

📋 RECLAMOS:
- Ver todos los reclamos: [Ver reclamos](/reclamos)
- Ver reclamo específico: [Ver reclamo #ID](/reclamos/ID)
- Crear reclamo nuevo: [Crear reclamo](/reclamos?crear=1)
- Ver tablero Kanban: [Ver tablero](/tablero)

📝 TRÁMITES:
- Ver todos los trámites: [Ver trámites](/tramites)
- Ver trámite específico: [Ver trámite #ID](/tramites?ver=ID)
- Iniciar trámite nuevo: [Iniciar trámite](/tramites?nuevo=1)

📊 GESTIÓN:
- Ver dashboard: [Ver dashboard](/dashboard)
- Ver empleados: [Ver empleados](/empleados)
- Ver categorías: [Ver categorías](/categorias)
- Ver zonas: [Ver zonas](/zonas)
- Ver usuarios: [Ver usuarios](/usuarios)
- Ver configuración: [Ver configuración](/configuracion)

📈 REPORTES Y ANÁLISIS:
- Ver analytics: [Ver analytics](/analytics)
- Ver SLA: [Ver SLA](/sla)
- Exportar datos: [Exportar](/exportar)

INSTRUCCIONES PARA CREAR RECLAMO:
Cuando pregunten "¿Cómo creo un reclamo?" respondé:
"Para crear un reclamo nuevo:
1. Andá a [Crear reclamo](/reclamos?crear=1)
2. Seleccioná la categoría del problema (ej: Baches, Alumbrado, etc.)
3. Describí el problema y agregá la ubicación
4. Opcionalmente, subí fotos del problema
5. Enviá el reclamo

También podés ir a [Ver reclamos](/reclamos) y hacer clic en el botón '+ Nuevo Reclamo'."

INSTRUCCIONES PARA CREAR TRÁMITE:
Cuando pregunten "¿Cómo inicio un trámite?" respondé:
"Para iniciar un trámite nuevo:
1. Andá a [Iniciar trámite](/tramites?nuevo=1)
2. Seleccioná el tipo de trámite que necesitás
3. Completá los datos requeridos (nombre, DNI, dirección, etc.)
4. Adjuntá la documentación necesaria
5. Enviá la solicitud

También podés ir a [Ver trámites](/tramites) y hacer clic en '+ Nueva Solicitud'."

EJEMPLOS DE RESPUESTAS CON LINKS:
- "Hay 15 reclamos nuevos sin asignar. [Ver en el tablero](/tablero) para gestionarlos."
- "El reclamo #123 está en proceso. [Ver detalle](/reclamos/123)"
- "La categoría con más reclamos es Baches (45). [Ver todos los reclamos](/reclamos)"
- "Juan Pérez tiene 8 reclamos asignados. [Ver empleados](/empleados)"
- "Para reportar un problema, podés [Crear un reclamo](/reclamos?crear=1)"
- "¿Necesitás hacer un trámite? [Iniciá acá](/tramites?nuevo=1)"

EJEMPLOS DE CONSULTAS POR USUARIO:
- Si preguntan por "Lucas Arenaz", buscá en la lista de RECLAMOS RECIENTES y VECINOS CON RECLAMOS
- Respondé con el listado completo de sus reclamos, estados y links para cada uno
- Formato: "Lucas Arenaz tiene 3 reclamos:
  • #45: Bache en calle San Martín (resuelto) - [Ver reclamo](/reclamos/45)
  • #67: Luminaria rota (en_proceso) - [Ver reclamo](/reclamos/67)
  • #89: Árbol caído (nuevo) - [Ver reclamo](/reclamos/89)"
- Si no encontrás al usuario, indicá que no tiene reclamos registrados

EJEMPLOS DE PREGUNTAS QUE PODÉS RESPONDER:
- "¿Cuántos reclamos hay pendientes?"
- "¿Cuál es la categoría con más reclamos?"
- "¿Qué empleados tienen más carga de trabajo?"
- "¿Cuántos trámites se resolvieron?"
- "Dame un resumen del estado actual"
- "¿Cuáles son los reclamos de Juan García?"
- "Estado de reclamos de María López"
- "¿Cómo creo un reclamo?"
- "¿Cómo inicio un trámite?"
- "¿Dónde veo el dashboard?"
"""


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

    response = await chat_service.chat(context, max_tokens=800)

    if response:
        # Guardar mensajes en la sesión
        await storage.add_message(session_id, "user", request.message)
        await storage.add_message(session_id, "assistant", response)

        return ChatResponse(response=response, session_id=session_id)

    raise HTTPException(status_code=503, detail="El asistente no está disponible temporalmente.")


# ==================== VALIDACIÓN DE DUPLICADOS CON IA ====================

async def get_entidades_existentes(db: AsyncSession, municipio_id: int, tipo: str) -> list[dict]:
    """Obtiene las entidades existentes según el tipo"""
    if tipo == "categoria":
        query = select(Categoria).where(
            Categoria.municipio_id == municipio_id,
            Categoria.activo == True
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
