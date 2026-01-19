"""
Servicio de IA con soporte multi-proveedor.
Soporta Gemini (Google) y Groq con fallback automático basado en AI_PROVIDER_ORDER.
"""
import httpx
from typing import List, Optional
from core.config import settings
from core.logger import get_logger

logger = get_logger("ai_service")


class AIService:
    """Servicio para interactuar con proveedores de IA (Gemini, Groq)"""

    def __init__(self):
        """Inicializar servicio con configuración de proveedores"""
        # Gemini config
        self.gemini_api_key = settings.GEMINI_API_KEY
        self.gemini_model = settings.GEMINI_MODEL

        # Groq config
        self.groq_api_key = settings.GROQ_API_KEY
        self.groq_model = settings.GROQ_MODEL

        # Provider order
        self.provider_order = settings.AI_PROVIDER_ORDER

        logger.info(f"AIService initialized with provider order: {self.provider_order}")

    def get_provider_order(self) -> List[str]:
        """
        Retorna el orden de proveedores según configuración.

        Returns:
            Lista de nombres de proveedores en orden de prioridad
        """
        order = self.provider_order.lower().split(",")
        providers = [p.strip() for p in order if p.strip() in ["gemini", "groq"]]
        return providers

    def is_available(self) -> bool:
        """
        Verifica si al menos un proveedor tiene API key configurada.

        Returns:
            True si hay al menos un proveedor disponible, False en caso contrario
        """
        has_gemini = bool(self.gemini_api_key)
        has_groq = bool(self.groq_api_key)

        available = has_gemini or has_groq

        if available:
            providers = []
            if has_gemini:
                providers.append("gemini")
            if has_groq:
                providers.append("groq")
            logger.info(f"Available AI providers: {', '.join(providers)}")
        else:
            logger.warning("No AI providers configured (missing API keys)")

        return available

    async def _call_gemini(
        self, messages: List[dict], max_tokens: int = 1000, temperature: float = 0.7
    ) -> Optional[str]:
        """
        Llama a Gemini API (Google AI).

        Args:
            messages: Lista de mensajes con formato [{"role": "system|user|assistant", "content": "..."}]
            max_tokens: Máximo de tokens en la respuesta
            temperature: Temperatura para la generación (0.0 a 1.0)

        Returns:
            Texto de respuesta del modelo o None si falla
        """
        if not self.gemini_api_key:
            logger.info("[GEMINI] No API key configured")
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

            logger.info(
                f"[GEMINI] Calling API with {len(gemini_contents)} messages, model: {self.gemini_model}"
            )

            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    f"https://generativelanguage.googleapis.com/v1beta/models/{self.gemini_model}:generateContent",
                    params={"key": self.gemini_api_key},
                    headers={"Content-Type": "application/json"},
                    json={
                        "contents": gemini_contents,
                        "generationConfig": {
                            "maxOutputTokens": max_tokens,
                            "temperature": temperature,
                        },
                    },
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
                            logger.info("[GEMINI] Response OK")
                            return text.strip() if text else None
                    logger.info("[GEMINI] No content in response")
                    return None
                else:
                    logger.warning(
                        f"[GEMINI] Error {response.status_code}: {response.text[:200]}"
                    )
                    return None
        except Exception as e:
            logger.error(f"[GEMINI] Exception: {e}")
            return None
