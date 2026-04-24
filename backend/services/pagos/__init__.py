"""Modulo de pagos — abstraccion del gateway externo.

Resolucion del provider activo:

  - Si llamas `get_provider()` sin argumento, usa el provider global de env
    (`GATEWAY_PAGO_PROVIDER`). Default = mock. Util para scripts/CLI.

  - Si llamas `get_provider_para_muni(db, municipio_id)`, busca en DB el
    proveedor activo del muni (GIRE/MP/MODO) y lo instancia con sus
    credenciales. Si no hay provider activo, cae al mock.

El mock se usa tambien cuando las credenciales del provider configurado
estan vacias o son placeholders — asi el usuario puede seguir testeando
la UI sin configurar MP aun.
"""
import logging
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from models.municipio_proveedor_pago import (
    MunicipioProveedorPago,
    PROVEEDOR_MERCADOPAGO,
    PROVEEDOR_MODO,
    PROVEEDOR_GIRE,
)
from .provider import GatewayPagoProvider, CrearSesionResponse, EstadoPagoExterno
from .mock_paybridge import MockPayBridgeProvider

logger = logging.getLogger(__name__)


def get_provider() -> GatewayPagoProvider:
    """Provider global (legacy) — usado cuando no hay muni en contexto."""
    provider_name = getattr(settings, "GATEWAY_PAGO_PROVIDER", "mock")
    if provider_name == "mock":
        return MockPayBridgeProvider()
    raise ValueError(f"Gateway de pago desconocido: {provider_name}")


async def get_provider_para_muni(
    db: AsyncSession,
    municipio_id: int,
) -> GatewayPagoProvider:
    """Resuelve el provider activo para un municipio.

    Orden de resolucion:
      1. MP real con credenciales validas.
      2. MODO / GIRE real con credenciales validas (a implementar).
      3. Mock (fallback siempre).
    """
    q = await db.execute(
        select(MunicipioProveedorPago).where(
            MunicipioProveedorPago.municipio_id == municipio_id,
            MunicipioProveedorPago.activo == True,  # noqa: E712
        )
    )
    configs = q.scalars().all()

    # Prioridad: MP > MODO > GIRE (a futuro se puede hacer configurable)
    orden = {
        PROVEEDOR_MERCADOPAGO: 1,
        PROVEEDOR_MODO: 2,
        PROVEEDOR_GIRE: 3,
    }
    configs = sorted(configs, key=lambda c: orden.get(c.proveedor, 99))

    for cfg in configs:
        provider_obj = _instanciar(cfg)
        if provider_obj is not None:
            return provider_obj

    logger.debug("Muni %s sin provider real activo — fallback a mock", municipio_id)
    return MockPayBridgeProvider()


def _instanciar(cfg: MunicipioProveedorPago) -> Optional[GatewayPagoProvider]:
    """Instancia un provider a partir de su configuracion.

    Devuelve None si no se pueden resolver las credenciales (y el caller
    sigue con el siguiente provider o el mock).
    """
    from services.cifrado import descifrar, es_placeholder

    if cfg.proveedor == PROVEEDOR_MERCADOPAGO:
        if es_placeholder(cfg.access_token_encriptado):
            return None
        token = descifrar(cfg.access_token_encriptado)
        if not token:
            return None
        from .mercadopago import MercadoPagoProvider
        webhook_base = getattr(settings, "WEBHOOK_BASE_URL", "") or getattr(settings, "API_BASE_URL", "")
        return MercadoPagoProvider(
            access_token=token,
            webhook_base_url=webhook_base,
            test_mode=bool(cfg.test_mode),
        )

    # MODO / GIRE: pendientes de implementar cuando tengamos sandbox
    return None
