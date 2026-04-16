"""Interfaz abstracta del gateway de pago externo."""
from abc import ABC, abstractmethod
from dataclasses import dataclass
from decimal import Decimal
from typing import Optional
from models.pago_sesion import PagoSesion, MedioPagoGateway


@dataclass
class CrearSesionResponse:
    """Respuesta del provider cuando creamos una sesion de pago."""
    external_id: str      # ID en el sistema del provider
    checkout_url: str     # URL a la que redirigir al vecino
    expires_in_seconds: int = 1800  # 30 min default


@dataclass
class EstadoPagoExterno:
    """Estado de un pago consultado al provider."""
    external_id: str
    aprobado: bool
    medio_pago: Optional[MedioPagoGateway] = None
    payload_raw: Optional[dict] = None


class GatewayPagoProvider(ABC):
    """Contrato que cumple todo provider de pagos (mock/gire/mp/modo)."""

    @property
    @abstractmethod
    def nombre(self) -> str:
        """Identificador interno del provider (mock, gire, mercadopago, ...)."""

    @abstractmethod
    async def crear_sesion(
        self,
        concepto: str,
        monto: Decimal,
        sesion_id: str,
        return_url: str,
    ) -> CrearSesionResponse:
        """Crea una sesion de pago en el provider y devuelve URL de checkout."""

    @abstractmethod
    async def consultar_estado(self, external_id: str) -> EstadoPagoExterno:
        """Consulta el estado actual del pago."""

    def medios_soportados(self) -> list[MedioPagoGateway]:
        """Medios de pago que soporta este provider. Default: todos."""
        return list(MedioPagoGateway)
