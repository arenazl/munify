"""
Servicio de validación de identidad.

Este módulo proporciona una interfaz unificada para validar la identidad
de usuarios usando diferentes proveedores (Nosis, RENAPER, etc.).

Uso básico:
    from services.identity_validation import get_identity_provider

    provider = get_identity_provider()
    result, data = await provider.full_validation(
        dni_front_image=front_bytes,
        dni_back_image=back_bytes,
        selfie_image=selfie_bytes,
    )
    if result.status == ValidationStatus.VALIDATED:
        print("Identidad validada!")

Configuración:
    Establecer IDENTITY_PROVIDER en el environment o config:
    - "mock": Proveedor mock para desarrollo (default)
    - "nosis": Proveedor Nosis (requiere credenciales)

    Para Nosis, también se requieren:
    - NOSIS_API_KEY
    - NOSIS_API_URL (opcional)
    - NOSIS_USERNAME (opcional)
"""
import os
from typing import Optional

from .base import (
    IdentityValidationProvider,
    ValidationResult,
    ValidationStatus,
    IdentityData,
)
from .mock_provider import MockIdentityProvider
from .nosis_provider import NosisIdentityProvider

__all__ = [
    "get_identity_provider",
    "IdentityValidationProvider",
    "ValidationResult",
    "ValidationStatus",
    "IdentityData",
    "MockIdentityProvider",
    "NosisIdentityProvider",
]

# Cache del proveedor para reutilizar instancia
_provider_instance: Optional[IdentityValidationProvider] = None


def get_identity_provider(force_provider: Optional[str] = None) -> IdentityValidationProvider:
    """
    Obtiene el proveedor de validación de identidad configurado.

    Args:
        force_provider: Si se especifica, usa este proveedor en lugar del configurado.
                        Valores válidos: "mock", "nosis"

    Returns:
        Instancia del proveedor de validación de identidad.

    Ejemplo:
        # Usar proveedor configurado
        provider = get_identity_provider()

        # Forzar mock para tests
        provider = get_identity_provider(force_provider="mock")
    """
    global _provider_instance

    provider_name = force_provider or os.getenv("IDENTITY_PROVIDER", "mock")

    # Si ya tenemos instancia del mismo tipo, reutilizarla
    if _provider_instance and _provider_instance.provider_name == provider_name:
        return _provider_instance

    if provider_name == "nosis":
        api_key = os.getenv("NOSIS_API_KEY")
        if not api_key:
            raise ValueError(
                "NOSIS_API_KEY no configurado. "
                "Configure las credenciales de Nosis o use IDENTITY_PROVIDER=mock"
            )
        _provider_instance = NosisIdentityProvider(
            api_key=api_key,
            api_url=os.getenv("NOSIS_API_URL", "https://api.nosis.com"),
            username=os.getenv("NOSIS_USERNAME"),
        )
    else:
        # Default: mock provider
        _provider_instance = MockIdentityProvider()

    return _provider_instance


def reset_provider():
    """Resetea el proveedor cacheado. Útil para tests."""
    global _provider_instance
    _provider_instance = None
