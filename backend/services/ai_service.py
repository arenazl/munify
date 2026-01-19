"""
Servicio de IA con soporte multi-proveedor.
Soporta Gemini (Google) y Groq con fallback automático basado en AI_PROVIDER_ORDER.
"""
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
