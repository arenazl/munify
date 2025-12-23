"""
Chat API con IA usando Gemini (Google) como default.
Funciona en la nube sin necesidad de Ollama local.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
import httpx

from core.security import get_current_user
from core.config import settings

router = APIRouter()

SYSTEM_PROMPT = """Eres un asistente virtual del Sistema de Reclamos Municipales.
Tu rol es ayudar a los usuarios con:
- Información sobre cómo crear reclamos
- Categorías de reclamos disponibles (Baches, Alumbrado, Limpieza, Agua, Veredas, etc.)
- Estados de reclamos: Nuevo, Asignado, En Proceso, Resuelto, Rechazado
- Tiempos estimados de resolución
- Proceso de gestión de reclamos

Responde de forma amable, concisa y útil en español.
Si no sabes algo específico, indica que el usuario debe contactar a la municipalidad.
Respuestas de máximo 3-4 oraciones."""


class ChatRequest(BaseModel):
    message: str
    history: list[dict] = []


class ChatResponse(BaseModel):
    response: str


class CategoryQuestionRequest(BaseModel):
    categoria: str
    pregunta: str


async def call_gemini(prompt: str, system_prompt: str = SYSTEM_PROMPT) -> str:
    """Llama a Gemini API"""
    if not settings.GEMINI_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="API de IA no configurada. Contacte al administrador."
        )

    full_prompt = f"{system_prompt}\n\nUsuario: {prompt}\n\nAsistente:" if system_prompt else prompt

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"https://generativelanguage.googleapis.com/v1beta/models/{settings.GEMINI_MODEL}:generateContent?key={settings.GEMINI_API_KEY}",
                headers={"Content-Type": "application/json"},
                json={
                    "contents": [{"parts": [{"text": full_prompt}]}],
                    "generationConfig": {
                        "temperature": 0.7,
                        "maxOutputTokens": 500,
                    }
                }
            )

            if response.status_code == 200:
                data = response.json()
                text = data.get('candidates', [{}])[0].get('content', {}).get('parts', [{}])[0].get('text', '')
                return text.strip() if text else "No pude procesar tu mensaje. Intentá de nuevo."
            else:
                error_msg = response.json().get('error', {}).get('message', 'Error desconocido')
                print(f"Error Gemini: {response.status_code} - {error_msg}")
                raise HTTPException(status_code=503, detail="El servicio de IA no está disponible temporalmente.")

    except httpx.TimeoutException:
        raise HTTPException(status_code=503, detail="La consulta tardó demasiado. Intentá de nuevo.")
    except httpx.ConnectError:
        raise HTTPException(status_code=503, detail="No se puede conectar al servicio de IA.")


@router.post("", response_model=ChatResponse)
async def chat(request: ChatRequest, current_user = Depends(get_current_user)):
    """
    Endpoint de chat con IA usando Gemini.
    """
    if not settings.GEMINI_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="El asistente no está disponible. Contacte al administrador."
        )

    # Construir contexto con historial
    context = SYSTEM_PROMPT + "\n\n"

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
        response_text = await call_gemini(prompt, "")
        return ChatResponse(response=response_text)
    except HTTPException:
        return ChatResponse(response="El asistente no está disponible en este momento. Intentá más tarde.")
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
