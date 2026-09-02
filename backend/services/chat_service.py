"""
Servicio centralizado de Chat con IA.

Un solo proveedor: Groq. El fallback a Gemini se saco el 2026-09-01 —
Gemini no se usa por costo, y un fallback silencioso hacia que la app
contestara con otro modelo sin que nadie se enterara.
"""
from typing import Optional, List, Union
from core.config import settings
from services.groq_common import llamar_groq


async def call_groq(messages: List[dict], max_tokens: int = 1000,
                    municipio_id: Optional[int] = None) -> Optional[str]:
    """Groq via el cliente unico (services/groq_common), que ademas registra
    el consumo de cada llamada."""
    r = await llamar_groq(
        messages,
        feature="chat",
        municipio_id=municipio_id,
        max_tokens=max_tokens,
        temperature=0.7,
    )
    return r.texto


def get_provider_order() -> List[str]:
    """Queda por compatibilidad: hoy el unico proveedor es Groq."""
    return ["groq"]


async def chat(prompt: Union[str, List[dict]], max_tokens: int = 500,
               municipio_id: Optional[int] = None) -> Optional[str]:
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

    response = await call_groq(messages, max_tokens, municipio_id=municipio_id)
    if response:
        return response

    print("[CHAT SERVICE] Groq no respondio")
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
    return bool(settings.GROQ_API_KEY)
