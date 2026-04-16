"""Mock provider 'PayBridge' — simula un gateway externo de pagos.

No pega contra ningun servicio real. Todo el estado vive en la DB de Munify
(pago_sesiones). El checkout UI tambien es nuestro — en produccion real este
componente seria el checkout hosted de Aura/GIRE, Mercado Pago, etc.

El objetivo es que la demo muestre el flow completo: crear sesion → abrir
checkout externo → elegir medio → confirmar → webhook → deuda pagada.

Cuando se sume un provider real, se reemplaza esta clase por otra que cumpla
la misma interfaz (`GatewayPagoProvider`), y el resto del codigo no cambia.
"""
from decimal import Decimal
from secrets import token_hex

from core.config import settings
from .provider import GatewayPagoProvider, CrearSesionResponse, EstadoPagoExterno
from models.pago_sesion import MedioPagoGateway


class MockPayBridgeProvider(GatewayPagoProvider):
    """Simulación de gateway de cobros externo. Todos los medios funcionan."""

    @property
    def nombre(self) -> str:
        return "paybridge"

    async def crear_sesion(
        self,
        concepto: str,
        monto: Decimal,
        sesion_id: str,
        return_url: str,
    ) -> CrearSesionResponse:
        # En un provider real, acá haríamos POST a su API. Como es mock,
        # generamos ID local y devolvemos el URL de nuestro checkout propio.
        external_id = f"PB-{token_hex(8).upper()}"

        # El checkout del "gateway externo" en realidad es una página servida
        # por el propio frontend de Munify, pero visualmente aparenta ser otra
        # plataforma (branding PayBridge, URL /pago/checkout/...).
        base = getattr(settings, "FRONTEND_URL", "https://app.munify.com.ar").rstrip("/")
        checkout_url = f"{base}/pago/checkout/{sesion_id}"

        return CrearSesionResponse(
            external_id=external_id,
            checkout_url=checkout_url,
            expires_in_seconds=1800,
        )

    async def consultar_estado(self, external_id: str) -> EstadoPagoExterno:
        # Mock: siempre aprobado (en flow real esto lo dice el webhook).
        return EstadoPagoExterno(
            external_id=external_id,
            aprobado=True,
        )
