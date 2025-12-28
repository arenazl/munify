"""
Chat API con IA.
Usa el servicio centralizado de chat con fallback automático.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional

from core.security import get_current_user
from core.database import get_db
from models.categoria import Categoria
from models.user import User
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


def build_system_prompt(categorias: list[dict]) -> str:
    """Construye el prompt del sistema con las categorías reales del municipio"""
    cats_list = "\n".join([f"  - {c['nombre']} (ID: {c['id']})" for c in categorias])

    return f"""Eres un asistente virtual del Sistema de Reclamos Municipales. Tu nombre es "Asistente Municipal".

CATEGORÍAS DISPONIBLES EN ESTE MUNICIPIO:
{cats_list}

TU ROL:
- Ayudar a los usuarios a reportar problemas en la ciudad
- Identificar qué categoría corresponde a su problema
- Guiarlos para crear un reclamo

REGLAS IMPORTANTES:
1. Cuando el usuario describe un problema, SIEMPRE indica la categoría exacta
2. SIEMPRE incluye un link markdown con este formato EXACTO: [Crear reclamo](/reclamos?crear=ID)
3. El link DEBE usar corchetes y paréntesis: [texto del link](url)
4. Responde de forma breve (2-3 oraciones máximo) y amigable
5. Usa el español rioplatense (vos, podés, etc.)

FORMATO DE LINK OBLIGATORIO - USA EXACTAMENTE ESTE FORMATO:
[Crear reclamo de NOMBRE_CATEGORIA](/reclamos?crear=ID_CATEGORIA)

EJEMPLOS CORRECTOS:
- "¡Claro! Un bache corresponde a **Baches y Calles**. [Crear reclamo de Baches y Calles](/reclamos?crear=1)"
- "Eso es **Alumbrado Público**. [Crear reclamo de Alumbrado](/reclamos?crear=2)"

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


@router.post("", response_model=ChatResponse)
async def chat(
    request: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Endpoint de chat con IA (autenticado).
    Usa las categorías reales del municipio del usuario.
    """
    if not chat_service.is_available():
        raise HTTPException(
            status_code=503,
            detail="El asistente no está disponible. Contacte al administrador."
        )

    # Obtener categorías del municipio del usuario
    categorias = await get_categorias_municipio(db, current_user.municipio_id)

    if not categorias:
        categorias = [
            {"id": 1, "nombre": "Baches y Calles"},
            {"id": 2, "nombre": "Alumbrado Público"},
            {"id": 3, "nombre": "Agua y Cloacas"},
            {"id": 4, "nombre": "Limpieza"},
            {"id": 5, "nombre": "Espacios Verdes"},
        ]

    system_prompt = build_system_prompt(categorias)
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
        print(f"[CHAT CONTEXTUAL] Prompt directo: {pregunta[:100]}...")
        response = await chat_service.chat(pregunta, max_tokens=300)
        if response:
            return ChatResponse(response=response)
        return ChatResponse(response="No pude procesar tu consulta. Intentá de nuevo.")

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
