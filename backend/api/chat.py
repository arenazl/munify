"""
Chat API con IA usando Gemini (Google) como default.
Funciona en la nube sin necesidad de Ollama local.
Usa las categorías reales del municipio del usuario.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import httpx
from typing import Optional

from core.security import get_current_user
from core.config import settings
from core.database import get_db
from models.categoria import Categoria
from models.user import User


router = APIRouter()


class ChatRequest(BaseModel):
    message: str
    history: list[dict] = []


class ChatResponse(BaseModel):
    response: str


class CategoryQuestionRequest(BaseModel):
    categoria: str
    pregunta: str


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

IMPORTANTE: El link SIEMPRE debe tener corchetes [] seguidos de paréntesis () - NO separar el texto de la URL.

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
    Endpoint de chat con IA usando Gemini.
    Usa las categorías reales del municipio del usuario.
    """
    if not settings.GEMINI_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="El asistente no está disponible. Contacte al administrador."
        )

    # Obtener categorías del municipio del usuario
    categorias = await get_categorias_municipio(db, current_user.municipio_id)

    if not categorias:
        # Categorías por defecto si no hay
        categorias = [
            {"id": 1, "nombre": "Baches y Calles"},
            {"id": 2, "nombre": "Alumbrado Público"},
            {"id": 3, "nombre": "Agua y Cloacas"},
            {"id": 4, "nombre": "Limpieza"},
            {"id": 5, "nombre": "Espacios Verdes"},
        ]

    system_prompt = build_system_prompt(categorias)

    # Construir contexto con historial
    context = system_prompt + "\n\nCONVERSACIÓN:\n"

    for msg in request.history[-10:]:
        role = "Usuario" if msg.get("role") == "user" else "Asistente"
        context += f"{role}: {msg.get('content', '')}\n"

    context += f"Usuario: {request.message}\n\nAsistente:"

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"https://generativelanguage.googleapis.com/v1beta/models/{settings.GEMINI_MODEL}:generateContent?key={settings.GEMINI_API_KEY}",
                headers={"Content-Type": "application/json"},
                json={
                    "contents": [{"parts": [{"text": context}]}],
                    "generationConfig": {
                        "temperature": 0.7,
                        "maxOutputTokens": 500,
                    }
                }
            )

            if response.status_code == 200:
                data = response.json()
                text = data.get('candidates', [{}])[0].get('content', {}).get('parts', [{}])[0].get('text', '')
                return ChatResponse(response=text.strip() if text else "No pude procesar tu mensaje.")
            else:
                raise HTTPException(status_code=503, detail="El asistente no está disponible temporalmente.")

    except httpx.TimeoutException:
        raise HTTPException(status_code=503, detail="La consulta tardó demasiado. Intentá de nuevo.")
    except httpx.ConnectError:
        raise HTTPException(status_code=503, detail="No se puede conectar al asistente de IA.")
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/categoria", response_model=ChatResponse)
async def chat_categoria(request: CategoryQuestionRequest):
    """
    Endpoint para preguntas sobre una categoría específica.
    No requiere autenticación para permitir consultas durante el wizard.
    """
    if not settings.GEMINI_API_KEY:
        return ChatResponse(response="El asistente no está disponible en este momento.")

    prompt = f"""Sos un asistente virtual de la Municipalidad que ayuda a los ciudadanos a realizar reclamos.

El usuario está creando un reclamo en la categoría: "{request.categoria}"

El usuario pregunta: "{request.pregunta}"

Respondé de forma breve y útil (máximo 2-3 oraciones). Si la pregunta no está relacionada con reclamos municipales,
indicá amablemente que solo podés ayudar con temas relacionados a reclamos de la ciudad.

Respuesta:"""

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"https://generativelanguage.googleapis.com/v1beta/models/{settings.GEMINI_MODEL}:generateContent?key={settings.GEMINI_API_KEY}",
                headers={"Content-Type": "application/json"},
                json={
                    "contents": [{"parts": [{"text": prompt}]}],
                    "generationConfig": {
                        "temperature": 0.7,
                        "maxOutputTokens": 200,
                    }
                }
            )

            if response.status_code == 200:
                data = response.json()
                text = data.get('candidates', [{}])[0].get('content', {}).get('parts', [{}])[0].get('text', '')
                return ChatResponse(response=text.strip() if text else "No pude procesar tu pregunta.")
            else:
                return ChatResponse(response="El asistente no está disponible en este momento.")

    except Exception:
        return ChatResponse(response="No pude procesar tu pregunta. Intentá de nuevo.")


@router.get("/status")
async def chat_status():
    """
    Verificar si el servicio de IA está disponible.
    """
    if not settings.GEMINI_API_KEY:
        return {
            "status": "unavailable",
            "provider": "gemini",
            "message": "GEMINI_API_KEY no configurada"
        }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                f"https://generativelanguage.googleapis.com/v1beta/models/{settings.GEMINI_MODEL}:generateContent?key={settings.GEMINI_API_KEY}",
                headers={"Content-Type": "application/json"},
                json={
                    "contents": [{"parts": [{"text": "Hola"}]}],
                    "generationConfig": {"maxOutputTokens": 10}
                }
            )

            if response.status_code == 200:
                return {
                    "status": "ok",
                    "provider": "gemini",
                    "model": settings.GEMINI_MODEL
                }
            else:
                return {
                    "status": "error",
                    "provider": "gemini",
                    "message": f"Error {response.status_code}"
                }
    except Exception as e:
        return {
            "status": "unavailable",
            "provider": "gemini",
            "message": str(e)
        }
