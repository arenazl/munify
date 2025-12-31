"""
Chat API con IA.
Usa el servicio centralizado de chat con fallback automático.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func as sql_func, case
from sqlalchemy.orm import selectinload
from typing import Optional
from datetime import datetime, timedelta

from core.security import get_current_user
from core.database import get_db
from models.categoria import Categoria
from models.user import User
from models.reclamo import Reclamo
from models.tramite import Solicitud, TipoTramite, Tramite, EstadoSolicitud
from models.empleado import Empleado
from models.enums import EstadoReclamo
from services import chat_service


router = APIRouter()


class ChatRequest(BaseModel):
    message: str
    history: list[dict] = []


class ChatResponse(BaseModel):
    response: str


class CategoryQuestionRequest(BaseModel):
    categoria: str
    pregunta: str


class DynamicChatRequest(BaseModel):
    """Request genérico para chat con contexto dinámico"""
    pregunta: str
    contexto: dict = {}
    tipo: Optional[str] = None


def build_system_prompt(categorias: list[dict], tramites: list[dict] = None) -> str:
    """Construye el prompt del sistema con las categorías y trámites del municipio"""
    cats_list = "\n".join([f"  - {c['nombre']} (ID: {c['id']})" for c in categorias])

    tramites_list = ""
    if tramites:
        tramites_list = "\n".join([f"  - {t['nombre']}" for t in tramites[:15]])
    else:
        tramites_list = "  (No hay trámites configurados aún)"

    return f"""Eres un asistente virtual del Sistema Municipal. Tu nombre es "Asistente Municipal".

CATEGORÍAS DE RECLAMOS DISPONIBLES:
{cats_list}

TRÁMITES DISPONIBLES EN ESTE MUNICIPIO:
{tramites_list}

TU ROL:
- Ayudar a los usuarios con RECLAMOS (problemas en la ciudad: baches, luces rotas, etc.)
- Informar sobre TRÁMITES disponibles (licencias, permisos, certificados, etc.)
- Guiarlos para crear reclamos o iniciar trámites

CUANDO PREGUNTEN SOBRE TRÁMITES:
- Si hay trámites configurados, mencioná algunos ejemplos de la lista
- Indicá que pueden ver todos los trámites disponibles en [Ver trámites](/mis-tramites)
- Para iniciar un trámite: [Iniciar trámite](/mis-tramites)

CUANDO DESCRIBAN UN PROBLEMA EN LA CIUDAD:
1. Identificá la categoría correcta de la lista
2. SIEMPRE incluí el link: [Crear reclamo de CATEGORIA](/reclamos?crear=ID)

REGLAS:
1. Usá español rioplatense (vos, podés, etc.)
2. Sé breve y amigable (2-3 oraciones máximo)
3. SIEMPRE incluí links markdown relevantes

EJEMPLOS:
- Problema: "Hay un bache" → "Eso corresponde a **Baches y Calles**. [Crear reclamo](/reclamos?crear=1)"
- Pregunta: "¿Qué trámites puedo hacer?" → "Tenemos varios trámites disponibles como [listado]. Podés verlos todos en [Ver trámites](/mis-tramites)"
- Pregunta: "¿Cómo saco una licencia?" → "Para licencias y permisos, podés [Iniciar un trámite](/mis-tramites) y seguir los pasos del wizard."

Estados de reclamos: Nuevo → Asignado → En Proceso → Resuelto (o Rechazado)"""


async def get_categorias_municipio(db: AsyncSession, municipio_id: int) -> list[dict]:
    """Obtiene las categorías activas del municipio"""
    query = select(Categoria).where(
        Categoria.municipio_id == municipio_id,
        Categoria.activo == True
    ).order_by(Categoria.nombre)

    result = await db.execute(query)
    categorias = result.scalars().all()

    return [{"id": c.id, "nombre": c.nombre} for c in categorias]


async def get_tramites_municipio(db: AsyncSession, municipio_id: int) -> list[dict]:
    """Obtiene los tipos de trámites activos del municipio"""
    query = select(TipoTramite).where(
        TipoTramite.municipio_id == municipio_id,
        TipoTramite.activo == True
    ).order_by(TipoTramite.nombre)

    result = await db.execute(query)
    tramites = result.scalars().all()

    return [{"id": t.id, "nombre": t.nombre} for t in tramites]


@router.post("", response_model=ChatResponse)
async def chat(
    request: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Endpoint de chat con IA (autenticado).
    Usa las categorías y trámites reales del municipio del usuario.
    """
    if not chat_service.is_available():
        raise HTTPException(
            status_code=503,
            detail="El asistente no está disponible. Contacte al administrador."
        )

    # Obtener categorías y trámites del municipio del usuario
    categorias = await get_categorias_municipio(db, current_user.municipio_id)
    tramites = await get_tramites_municipio(db, current_user.municipio_id)

    if not categorias:
        categorias = [
            {"id": 1, "nombre": "Baches y Calles"},
            {"id": 2, "nombre": "Alumbrado Público"},
            {"id": 3, "nombre": "Agua y Cloacas"},
            {"id": 4, "nombre": "Limpieza"},
            {"id": 5, "nombre": "Espacios Verdes"},
        ]

    system_prompt = build_system_prompt(categorias, tramites)
    context = chat_service.build_chat_context(
        system_prompt=system_prompt,
        message=request.message,
        history=request.history
    )

    response = await chat_service.chat(context, max_tokens=500)

    if response:
        return ChatResponse(response=response)

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
    history: list[dict] = []


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
        selectinload(Reclamo.creador)
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
    """Obtiene empleados con reclamos asignados"""
    query = select(
        Empleado.nombre,
        Empleado.apellido,
        Empleado.cargo,
        sql_func.count(Reclamo.id).label('reclamos_asignados')
    ).outerjoin(
        Reclamo,
        (Reclamo.empleado_id == Empleado.id) &
        (Reclamo.estado.in_([EstadoReclamo.ASIGNADO, EstadoReclamo.EN_PROCESO]))
    ).where(
        Empleado.municipio_id == municipio_id,
        Empleado.activo == True
    ).group_by(
        Empleado.id, Empleado.nombre, Empleado.apellido, Empleado.cargo
    ).order_by(sql_func.count(Reclamo.id).desc()).limit(10)

    result = await db.execute(query)
    rows = result.all()

    return [{
        'nombre': f"{r.nombre} {r.apellido}",
        'cargo': r.cargo,
        'reclamos_asignados': r.reclamos_asignados
    } for r in rows]


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
        f"  - #{r['id']}: {r['titulo']} ({r['estado']}) - {r['categoria']} - {r['direccion']} - Creado por: {r.get('creador', 'N/A')}"
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
        f"  - {e['nombre']} ({e['cargo']}): {e['reclamos_asignados']} reclamos activos"
        for e in empleados[:5]
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

👥 EMPLEADOS ACTIVOS:
{empleados_list}

👤 VECINOS CON RECLAMOS (usuarios que crearon reclamos):
{usuarios_list}

CATEGORÍAS DISPONIBLES: {cats_list}

TU ROL:
- Responder preguntas sobre el estado del sistema
- Dar información sobre reclamos, trámites, estadísticas
- Ayudar a interpretar los datos
- Sugerir acciones basadas en los datos

REGLAS:
1. Usá español argentino (vos, podés, tenés)
2. Sé conciso pero informativo
3. Si te preguntan por datos específicos que no tenés, indicá que podés dar información general
4. Podés hacer cálculos simples con los datos (porcentajes, comparaciones)
5. SIEMPRE incluí links relevantes usando formato markdown: [texto](url)

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

    # Obtener datos en paralelo
    categorias = await get_categorias_municipio(db, municipio_id)
    stats_reclamos = await get_estadisticas_reclamos(db, municipio_id)
    stats_tramites = await get_estadisticas_tramites(db, municipio_id)
    reclamos_recientes = await get_reclamos_recientes(db, municipio_id, limit=15)
    tramites_recientes = await get_tramites_recientes(db, municipio_id)
    reclamos_por_categoria = await get_reclamos_por_categoria(db, municipio_id)
    empleados = await get_empleados_activos(db, municipio_id)
    usuarios_con_reclamos = await get_usuarios_con_reclamos(db, municipio_id)

    # Construir prompt con datos
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

    context = chat_service.build_chat_context(
        system_prompt=system_prompt,
        message=request.message,
        history=request.history
    )

    print(f"[ASISTENTE] Consulta de {current_user.email}: {request.message[:100]}...")

    response = await chat_service.chat(context, max_tokens=800)

    if response:
        return ChatResponse(response=response)

    raise HTTPException(status_code=503, detail="El asistente no está disponible temporalmente.")
