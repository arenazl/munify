"""
Servicio centralizado de Chat con IA.
Maneja Groq con soporte para conversaciones con historial.
"""
import httpx
from typing import Optional, List, Union
from core.config import settings


async def call_groq(messages: List[dict], max_tokens: int = 1000) -> Optional[str]:
    """
    Llama a Groq API con formato de mensajes (compatible OpenAI).

    Args:
        messages: Lista de mensajes con formato [{"role": "system|user|assistant", "content": "..."}]
        max_tokens: Máximo de tokens en la respuesta
    """
    if not settings.GROQ_API_KEY:
        print("[GROQ] No API key configured")
        return None

    try:
        print(f"[GROQ] Calling API with {len(messages)} messages")
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {settings.GROQ_API_KEY}"
                },
                json={
                    "model": settings.GROQ_MODEL,
                    "messages": messages,
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
                print(f"[GROQ] Error {response.status_code}: {response.text}")
                return None
    except Exception as e:
        print(f"[GROQ] Exception: {e}")
        return None


async def chat(prompt: Union[str, List[dict]], max_tokens: int = 500) -> Optional[str]:
    """
    Servicio principal de chat con IA.

    Args:
        prompt: Puede ser:
            - str: Prompt simple (se convierte a mensaje user)
            - List[dict]: Lista de mensajes con formato OpenAI
        max_tokens: Máximo de tokens en la respuesta

    Returns:
        Respuesta del modelo o None si falla
    """
    # Convertir string a formato de mensajes si es necesario
    if isinstance(prompt, str):
        messages = [{"role": "user", "content": prompt}]
    else:
        messages = prompt

    response = await call_groq(messages, max_tokens)
    if response:
        return response

    print("[CHAT SERVICE] Groq falló")
    return None


def build_chat_messages(
    system_prompt: str,
    message: str,
    history: List[dict] = None,
    max_history: int = 10
) -> List[dict]:
    """
    Construye la lista de mensajes para la API de chat.

    Args:
        system_prompt: Instrucciones del sistema
        message: Mensaje actual del usuario
        history: Historial de mensajes previos [{"role": "user|assistant", "content": "..."}]
        max_history: Máximo de mensajes del historial a incluir

    Returns:
        Lista de mensajes en formato OpenAI
    """
    messages = [{"role": "system", "content": system_prompt}]

    # Agregar historial
    if history:
        for msg in history[-max_history:]:
            role = msg.get("role", "user")
            content = msg.get("content", "")
            if role in ["user", "assistant"] and content:
                messages.append({"role": role, "content": content})

    # Agregar mensaje actual
    messages.append({"role": "user", "content": message})

    return messages


# Mantener compatibilidad con código existente
def build_chat_context(
    system_prompt: str,
    message: str,
    history: List[dict] = None,
    max_history: int = 10
) -> List[dict]:
    """
    DEPRECATED: Usar build_chat_messages en su lugar.
    Ahora retorna lista de mensajes en lugar de string.
    """
    return build_chat_messages(system_prompt, message, history, max_history)


def is_available() -> bool:
    """Verifica si Groq está disponible"""
    return bool(settings.GROQ_API_KEY)
