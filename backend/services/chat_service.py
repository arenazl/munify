"""
Servicio centralizado de Chat con IA.
Maneja Gemini como primario y Groq como fallback.
"""
import httpx
from typing import Optional, List
from core.config import settings


async def call_gemini(prompt: str, max_tokens: int = 500) -> Optional[str]:
    """Llama a Gemini API"""
    if not settings.GEMINI_API_KEY:
        return None

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"https://generativelanguage.googleapis.com/v1beta/models/{settings.GEMINI_MODEL}:generateContent?key={settings.GEMINI_API_KEY}",
                headers={"Content-Type": "application/json"},
                json={
                    "contents": [{"parts": [{"text": prompt}]}],
                    "generationConfig": {
                        "temperature": 0.7,
                        "maxOutputTokens": max_tokens,
                    }
                }
            )

            if response.status_code == 200:
                data = response.json()
                text = data.get('candidates', [{}])[0].get('content', {}).get('parts', [{}])[0].get('text', '')
                print(f"[GEMINI] Response OK")
                return text.strip() if text else None
            elif response.status_code == 429:
                print(f"[GEMINI] Rate limit (429)")
                return None
            else:
                print(f"[GEMINI] Error: {response.status_code}")
                return None
    except Exception as e:
        print(f"[GEMINI] Exception: {e}")
        return None


async def call_groq(prompt: str, max_tokens: int = 1000) -> Optional[str]:
    """Llama a Groq API como fallback"""
    if not settings.GROK_API_KEY:
        return None

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {settings.GROK_API_KEY}"
                },
                json={
                    "model": settings.GROK_MODEL,
                    "messages": [{"role": "user", "content": prompt}],
                    "max_tokens": max_tokens,
                    "temperature": 0.7
                }
            )

            if response.status_code == 200:
                data = response.json()
                text = data.get('choices', [{}])[0].get('message', {}).get('content', '')
                print(f"[GROQ] Response OK")
                return text.strip() if text else None
            else:
                print(f"[GROQ] Error: {response.status_code}")
                return None
    except Exception as e:
        print(f"[GROQ] Exception: {e}")
        return None


async def chat(prompt: str, max_tokens: int = 500) -> Optional[str]:
    """
    Servicio principal de chat con IA.
    Intenta Gemini primero, luego Groq como fallback.

    Args:
        prompt: El prompt completo a enviar
        max_tokens: Máximo de tokens en la respuesta

    Returns:
        Respuesta del modelo o None si falla
    """
    # Intentar Gemini primero
    response = await call_gemini(prompt, max_tokens)
    if response:
        return response

    # Fallback a Groq
    print("[CHAT SERVICE] Gemini falló, probando Groq...")
    response = await call_groq(prompt, max_tokens)
    if response:
        return response

    print("[CHAT SERVICE] Todos los proveedores fallaron")
    return None


def build_chat_context(
    system_prompt: str,
    message: str,
    history: List[dict] = None,
    max_history: int = 10
) -> str:
    """
    Construye el contexto completo para el chat.

    Args:
        system_prompt: Instrucciones del sistema
        message: Mensaje actual del usuario
        history: Historial de mensajes previos
        max_history: Máximo de mensajes del historial a incluir

    Returns:
        Prompt completo formateado
    """
    context = system_prompt + "\n\nCONVERSACIÓN:\n"

    if history:
        for msg in history[-max_history:]:
            role = "Usuario" if msg.get("role") == "user" else "Asistente"
            context += f"{role}: {msg.get('content', '')}\n"

    context += f"Usuario: {message}\n\nAsistente:"
    return context


def is_available() -> bool:
    """Verifica si al menos un proveedor de IA está disponible"""
    return bool(settings.GEMINI_API_KEY or settings.GROK_API_KEY)
