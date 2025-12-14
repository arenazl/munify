"""
Chat API con IA usando Ollama (local) como default.
Sin dependencias externas - usa httpx para llamar a Ollama.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
import httpx
import os

from core.security import get_current_user

router = APIRouter()

# Configuración de Ollama (default)
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.2")

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


@router.post("", response_model=ChatResponse)
async def chat(request: ChatRequest, current_user = Depends(get_current_user)):
    """
    Endpoint de chat con IA usando Ollama local.
    """
    try:
        # Construir mensajes para Ollama
        messages = [{"role": "system", "content": SYSTEM_PROMPT}]

        # Agregar historial (últimos 10 mensajes)
        for msg in request.history[-10:]:
            messages.append(msg)

        # Agregar mensaje actual
        messages.append({"role": "user", "content": request.message})

        # Llamar a Ollama
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                f"{OLLAMA_URL}/api/chat",
                json={
                    "model": OLLAMA_MODEL,
                    "messages": messages,
                    "stream": False,
                    "options": {
                        "temperature": 0.7,
                        "num_predict": 500
                    }
                }
            )

            if response.status_code != 200:
                raise HTTPException(
                    status_code=503,
                    detail=f"Ollama no disponible. Asegurate de que esté corriendo en {OLLAMA_URL}"
                )

            data = response.json()
            ai_response = data.get("message", {}).get("content", "Lo siento, no pude procesar tu mensaje.")

            return ChatResponse(response=ai_response)

    except httpx.ConnectError:
        raise HTTPException(
            status_code=503,
            detail=f"No se puede conectar a Ollama en {OLLAMA_URL}. Verificá que Ollama esté corriendo."
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/categoria", response_model=ChatResponse)
async def chat_categoria(request: CategoryQuestionRequest):
    """
    Endpoint para preguntas sobre una categoría específica.
    No requiere autenticación para permitir consultas durante el wizard.
    """
    try:
        prompt = f"""Sos un asistente virtual de la Municipalidad que ayuda a los ciudadanos a realizar reclamos.

El usuario está creando un reclamo en la categoría: "{request.categoria}"

El usuario pregunta: "{request.pregunta}"

Respondé de forma breve y útil (máximo 2-3 oraciones). Si la pregunta no está relacionada con reclamos municipales,
indicá amablemente que solo podés ayudar con temas relacionados a reclamos de la ciudad.

Respuesta:"""

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{OLLAMA_URL}/api/generate",
                json={
                    "model": OLLAMA_MODEL,
                    "prompt": prompt,
                    "stream": False,
                    "options": {
                        "temperature": 0.7,
                        "num_predict": 150
                    }
                }
            )

            if response.status_code == 200:
                data = response.json()
                return ChatResponse(response=data.get("response", "No pude procesar tu pregunta. Intentá de nuevo."))
            else:
                return ChatResponse(response="El servicio de IA no está disponible en este momento.")

    except httpx.TimeoutException:
        return ChatResponse(response="La consulta tardó demasiado. Intentá con una pregunta más simple.")
    except httpx.ConnectError:
        return ChatResponse(response="No se puede conectar al asistente de IA. Verificá que Ollama esté corriendo.")
    except Exception as e:
        return ChatResponse(response="No pude conectar con el asistente. Intentá más tarde.")


@router.get("/status")
async def chat_status():
    """
    Verificar si Ollama está disponible.
    """
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(f"{OLLAMA_URL}/api/tags")
            if response.status_code == 200:
                data = response.json()
                models = [m.get("name") for m in data.get("models", [])]
                return {
                    "status": "ok",
                    "provider": "ollama",
                    "url": OLLAMA_URL,
                    "model": OLLAMA_MODEL,
                    "available_models": models
                }
    except:
        pass

    return {
        "status": "unavailable",
        "provider": "ollama",
        "url": OLLAMA_URL,
        "message": "Ollama no está corriendo. Ejecutá 'ollama serve' para iniciarlo."
    }
