"""Modulo de pagos — abstraccion del gateway externo.

Hoy el unico provider es `mock` (PayBridge simulado). Cuando tengamos
sandbox de Aura/GIRE o Mercado Pago, se suman providers reales y se
activan via env var `GATEWAY_PAGO_PROVIDER`.
"""
from .provider import GatewayPagoProvider, CrearSesionResponse, EstadoPagoExterno
from .mock_paybridge import MockPayBridgeProvider
from core.config import settings


def get_provider() -> GatewayPagoProvider:
    """Devuelve el provider activo segun configuracion."""
    provider_name = getattr(settings, "GATEWAY_PAGO_PROVIDER", "mock")
    if provider_name == "mock":
        return MockPayBridgeProvider()
    # TODO: cuando haya sandbox real, agregar:
    # elif provider_name == "gire":
    #     return GireAuraProvider()
    # elif provider_name == "mercadopago":
    #     return MercadoPagoProvider()
    raise ValueError(f"Gateway de pago desconocido: {provider_name}")
