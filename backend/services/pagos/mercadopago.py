"""Provider Mercado Pago — Checkout Pro con access_token por muni.

Cada municipio configura su propio access_token en MunicipioProveedorPago.
Ese token viaja cifrado en DB y se descifra on-demand para crear sesiones
o consultar pagos. La plata cae en la cuenta del muni; Munify no toca
fondos (modelo Marketplace/Split Payment si hay revenue-share con Munify).

Este provider requiere credenciales reales (TEST-xxx en sandbox o APP-xxx
en produccion). Si el muni no las tiene, el sistema hace fallback al
mock provider.

Docs MP: https://www.mercadopago.com.ar/developers/es/reference/preferences/_checkout_preferences/post
"""
from decimal import Decimal
from typing import Optional
import httpx
import logging

from models.pago_sesion import MedioPagoGateway
from .provider import GatewayPagoProvider, CrearSesionResponse, EstadoPagoExterno

logger = logging.getLogger(__name__)

MP_API_BASE = "https://api.mercadopago.com"


class MercadoPagoError(Exception):
    pass


class MercadoPagoProvider(GatewayPagoProvider):
    def __init__(
        self,
        access_token: str,
        webhook_base_url: str,
        test_mode: bool = True,
    ):
        if not access_token:
            raise ValueError("MercadoPagoProvider requiere access_token")
        self.access_token = access_token
        self.webhook_base_url = webhook_base_url.rstrip("/")
        self.test_mode = test_mode

    @property
    def nombre(self) -> str:
        return "mercadopago"

    def medios_soportados(self) -> list[MedioPagoGateway]:
        # MP soporta tarjeta + QR. Para cupon de Rapipago/Pago Facil
        # MP tiene un mecanismo aparte (ticket) — lo dejamos fuera por ahora.
        return [MedioPagoGateway.TARJETA, MedioPagoGateway.QR]

    async def crear_sesion(
        self,
        concepto: str,
        monto: Decimal,
        sesion_id: str,
        return_url: str,
    ) -> CrearSesionResponse:
        """Crea una Preference en MP y devuelve el init_point para redirigir."""
        # `external_reference` nos permite correlacionar cuando vuelve el webhook
        payload = {
            "items": [
                {
                    "title": concepto[:256],
                    "quantity": 1,
                    "currency_id": "ARS",
                    "unit_price": float(monto),
                }
            ],
            "external_reference": sesion_id,
            "notification_url": f"{self.webhook_base_url}/pagos/webhook/mercadopago",
            "back_urls": {
                "success": return_url,
                "failure": return_url,
                "pending": return_url,
            },
            "auto_return": "approved",
        }
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                f"{MP_API_BASE}/checkout/preferences",
                headers={
                    "Authorization": f"Bearer {self.access_token}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
        if resp.status_code >= 400:
            logger.error("MP crear preference fallo %s: %s", resp.status_code, resp.text)
            raise MercadoPagoError(f"MP {resp.status_code}: {resp.text}")
        data = resp.json()
        init_point = data.get("sandbox_init_point") if self.test_mode else data.get("init_point")
        if not init_point:
            raise MercadoPagoError("MP no devolvio init_point")
        return CrearSesionResponse(
            external_id=str(data.get("id") or ""),
            checkout_url=init_point,
            expires_in_seconds=1800,
        )

    async def consultar_estado(self, external_id: str) -> EstadoPagoExterno:
        """Consulta un payment en MP por su id.

        En MP el 'external_id' de la preference no es el del payment — cuando
        llega el webhook vienen ambos. Aca asumimos que se consulta por
        payment_id (es lo que el webhook nos da).
        """
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                f"{MP_API_BASE}/v1/payments/{external_id}",
                headers={"Authorization": f"Bearer {self.access_token}"},
            )
        if resp.status_code >= 400:
            logger.error("MP consultar payment fallo %s: %s", resp.status_code, resp.text)
            raise MercadoPagoError(f"MP {resp.status_code}: {resp.text}")
        data = resp.json()
        status = data.get("status", "")
        aprobado = status == "approved"
        # Mapear payment_method_id -> MedioPagoGateway
        pm_type = data.get("payment_type_id", "")
        medio: Optional[MedioPagoGateway] = None
        if pm_type in ("credit_card", "debit_card"):
            medio = MedioPagoGateway.TARJETA
        elif pm_type in ("bank_transfer", "account_money"):
            medio = MedioPagoGateway.TRANSFERENCIA
        elif pm_type == "ticket":
            medio = MedioPagoGateway.EFECTIVO_CUPON
        elif pm_type == "qr":
            medio = MedioPagoGateway.QR
        return EstadoPagoExterno(
            external_id=str(external_id),
            aprobado=aprobado,
            medio_pago=medio,
            payload_raw=data,
        )

    async def probar_credenciales(self) -> dict:
        """Hace una llamada read-only para validar el access_token.

        Devuelve los datos de la cuenta (si es TEST-xxx / APP-xxx, user_id, etc.)
        o tira MercadoPagoError.
        """
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"{MP_API_BASE}/users/me",
                headers={"Authorization": f"Bearer {self.access_token}"},
            )
        if resp.status_code >= 400:
            raise MercadoPagoError(f"Credenciales invalidas: {resp.status_code} {resp.text}")
        return resp.json()
