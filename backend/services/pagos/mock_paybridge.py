"""Mock provider 'GIRE Aura' — simula el Boton de Pago de GIRE.

No pega contra ningun servicio real de GIRE (payment-hub-web.api.gire.com).
Todo el estado vive en la DB de Munify (pago_sesiones). El checkout UI tambien
es nuestro — en produccion real este componente seria el checkout hosted de
Aura, MercadoPago, Modo, etc.

El objetivo es que la demo muestre el flow completo: crear sesion → abrir
checkout externo → elegir medio → confirmar → webhook → deuda pagada.

Cuando se sume el provider real de GIRE, se reemplaza esta clase por otra
que cumpla la misma interfaz (`GatewayPagoProvider`), y el resto del codigo
no cambia.

El nombre "paybridge" se mantiene en `nombre` por compatibilidad con datos
existentes en pago_sesiones.provider (no migramos a "gire" para no romper
los pagos historicos).
"""
from decimal import Decimal
from secrets import token_hex

from core.config import settings
from .provider import GatewayPagoProvider, CrearSesionResponse, EstadoPagoExterno
from models.pago_sesion import MedioPagoGateway


class MockPayBridgeProvider(GatewayPagoProvider):
    """Simulación del Boton de Pago de GIRE (Aura). Todos los medios funcionan."""

    @property
    def nombre(self) -> str:
        # Compatibilidad con registros existentes — no cambiar a "gire" sin
        # migrar pago_sesiones.provider.
        return "paybridge"

    async def crear_sesion(
        self,
        concepto: str,
        monto: Decimal,
        sesion_id: str,
        return_url: str,
    ) -> CrearSesionResponse:
        # En un provider real armariamos el payload con la forma de GIRE:
        #   POST payment-hub-web.api.gire.com/v1/sessions
        #   { external_reference, amount, description, payer, callbacks, metadata }
        # y recibiriamos { session_id, checkout_url, expires_at }.
        # Como el mock es nuestro propio frontend, devolvemos el PATH relativo
        # — el browser lo resuelve contra el origin actual.
        external_id = f"AURA-{token_hex(8).upper()}"
        checkout_url = f"/pago/checkout/{sesion_id}"

        return CrearSesionResponse(
            external_id=external_id,
            checkout_url=checkout_url,
            expires_in_seconds=1800,
        )

    async def consultar_estado(self, external_id: str) -> EstadoPagoExterno:
        # Mock: siempre aprobado (en flow real esto lo dice el webhook de GIRE).
        return EstadoPagoExterno(
            external_id=external_id,
            aprobado=True,
        )
