"""
Servicio centralizado de Chat con IA.
Soporta múltiples proveedores (Gemini, Groq) con fallback configurable.
"""
import httpx
from typing import Optional, List, Union
from core.config import settings


async def call_gemini(messages: List[dict], max_tokens: int = 1000) -> Optional[str]:
    """
    Llama a Gemini API (Google AI).

    Args:
        messages: Lista de mensajes con formato [{"role": "system|user|assistant", "content": "..."}]
        max_tokens: Máximo de tokens en la respuesta
    """
    if not settings.GEMINI_API_KEY:
        print("[GEMINI] No API key configured")
        return None

    try:
        # Convertir formato OpenAI a formato Gemini
        # Gemini usa "user" y "model" en lugar de "user" y "assistant"
        # El system prompt va como primer mensaje de user con prefijo
        gemini_contents = []
        system_prompt = ""

        for msg in messages:
            role = msg.get("role", "user")
            content = msg.get("content", "")

            if role == "system":
                system_prompt = content
            elif role == "user":
                # Si hay system prompt, agregarlo al primer mensaje de user
                if system_prompt and not gemini_contents:
                    content = f"{system_prompt}\n\n---\n\nUsuario: {content}"
                    system_prompt = ""
                gemini_contents.append({"role": "user", "parts": [{"text": content}]})
            elif role == "assistant":
                gemini_contents.append({"role": "model", "parts": [{"text": content}]})

        # Si solo hay system prompt sin mensajes de user
        if system_prompt and not gemini_contents:
            gemini_contents.append({"role": "user", "parts": [{"text": system_prompt}]})

        print(f"[GEMINI] Calling API with {len(gemini_contents)} messages, model: {settings.GEMINI_MODEL}")

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"https://generativelanguage.googleapis.com/v1beta/models/{settings.GEMINI_MODEL}:generateContent",
                params={"key": settings.GEMINI_API_KEY},
                headers={"Content-Type": "application/json"},
                json={
                    "contents": gemini_contents,
                    "generationConfig": {
                        "maxOutputTokens": max_tokens,
                        "temperature": 0.7
                    }
                }
            )

            if response.status_code == 200:
                data = response.json()
                # Extraer texto de la respuesta
                candidates = data.get("candidates", [])
                if candidates:
                    content = candidates[0].get("content", {})
                    parts = content.get("parts", [])
                    if parts:
                        text = parts[0].get("text", "")
                        print(f"[GEMINI] Response OK")
                        return text.strip() if text else None
                print("[GEMINI] No content in response")
                return None
            else:
                print(f"[GEMINI] Error {response.status_code}: {response.text[:200]}")
                return None
    except Exception as e:
        print(f"[GEMINI] Exception: {e}")
        return None


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
        print(f"[GROQ] Calling API with {len(messages)} messages, model: {settings.GROQ_MODEL}")
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
                print(f"[GROQ] Response OK, length={len(text) if text else 0} chars")
                # Log completo para debug (primeros y últimos 500 chars si es largo)
                if text:
                    if len(text) > 1200:
                        print(f"[GROQ] Response INICIO:\n{text[:600]}")
                        print(f"[GROQ] ... [{len(text)-1200} chars omitidos] ...")
                        print(f"[GROQ] Response FIN:\n{text[-600:]}")
                    else:
                        print(f"[GROQ] Response COMPLETA:\n{text}")
                return text.strip() if text else None
            else:
                print(f"[GROQ] Error {response.status_code}: {response.text[:200]}")
                return None
    except Exception as e:
        print(f"[GROQ] Exception: {e}")
        return None


def get_provider_order() -> List[str]:
    """Retorna el orden de proveedores según configuración"""
    order = settings.AI_PROVIDER_ORDER.lower().split(",")
    return [p.strip() for p in order if p.strip() in ["gemini", "groq"]]


async def chat(prompt: Union[str, List[dict]], max_tokens: int = 500) -> Optional[str]:
    """
    Servicio principal de chat con IA.
    Intenta con el proveedor principal y hace fallback si falla.

    Args:
        prompt: Puede ser:
            - str: Prompt simple (se convierte a mensaje user)
            - List[dict]: Lista de mensajes con formato OpenAI
        max_tokens: Máximo de tokens en la respuesta

    Returns:
        Respuesta del modelo o None si fallan todos los proveedores
    """
    # Convertir string a formato de mensajes si es necesario
    if isinstance(prompt, str):
        messages = [{"role": "user", "content": prompt}]
    else:
        messages = prompt

    providers = get_provider_order()
    print(f"[CHAT SERVICE] Provider order: {providers}")

    for provider in providers:
        if provider == "gemini":
            response = await call_gemini(messages, max_tokens)
            if response:
                return response
            print("[CHAT SERVICE] Gemini falló, intentando siguiente...")
        elif provider == "groq":
            response = await call_groq(messages, max_tokens)
            if response:
                return response
            print("[CHAT SERVICE] Groq falló, intentando siguiente...")

    print("[CHAT SERVICE] Todos los proveedores fallaron")
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
    """Verifica si hay al menos un proveedor de IA disponible"""
    return bool(settings.GEMINI_API_KEY or settings.GROQ_API_KEY)
