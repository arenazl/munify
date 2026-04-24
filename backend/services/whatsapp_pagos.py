"""Puente WhatsApp para el flujo de pagos asistido (Fase 7 bundle).

Reutiliza la config WhatsApp del muni (ya existente) para mandar:

  - pago_link_tramite: "Hola {nombre}, tu trámite de {tramite} ya está cargado.
                        Pagá acá: {checkout_url}"
  - pago_confirmado:   "✅ Recibimos tu pago de ${monto} por {tramite}. CUT: {cut}"

Si el muni no tiene WhatsApp configurado, todas las llamadas hacen no-op +
log (no fallan el flujo de pago).
"""
import logging
from decimal import Decimal
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.whatsapp_config import WhatsAppConfig

logger = logging.getLogger(__name__)


async def _config_del_muni(db: AsyncSession, municipio_id: int) -> Optional[WhatsAppConfig]:
    q = await db.execute(
        select(WhatsAppConfig).where(WhatsAppConfig.municipio_id == municipio_id)
    )
    return q.scalar_one_or_none()


async def notificar_link_pago(
    db: AsyncSession,
    *,
    municipio_id: int,
    telefono: str,
    nombre_vecino: str,
    tramite_nombre: str,
    checkout_url: str,
    numero_tramite: Optional[str] = None,
    usuario_id: Optional[int] = None,
) -> bool:
    """Manda al vecino el link de pago al iniciar un trámite presencial."""
    if not telefono:
        logger.debug("notificar_link_pago: sin telefono, skip")
        return False

    config = await _config_del_muni(db, municipio_id)
    if not config or not getattr(config, "activo", False):
        logger.debug("notificar_link_pago: whatsapp no configurado/activo para muni %s", municipio_id)
        return False

    nro = f" ({numero_tramite})" if numero_tramite else ""
    msg = (
        f"Hola {nombre_vecino or 'vecino/a'}, inicié tu trámite de {tramite_nombre}{nro}. "
        f"Pagá acá: {checkout_url}\n\n"
        "Cuando confirmes el pago, te aviso por este mismo canal."
    )
    try:
        from api.whatsapp import send_whatsapp_message_with_config
        mid = await send_whatsapp_message_with_config(
            config=config,
            to=telefono,
            message=msg,
            db=db,
            tipo_mensaje="pago_link_tramite",
            usuario_id=usuario_id,
        )
        return mid is not None
    except Exception as e:
        logger.error("notificar_link_pago error: %s", e)
        return False


async def notificar_pago_confirmado(
    db: AsyncSession,
    *,
    municipio_id: int,
    telefono: str,
    nombre_vecino: str,
    concepto: str,
    monto: Decimal,
    cut: Optional[str] = None,
    usuario_id: Optional[int] = None,
) -> bool:
    """Avisa al vecino que el pago se confirmó (llamar desde webhook / confirmar)."""
    if not telefono:
        return False

    config = await _config_del_muni(db, municipio_id)
    if not config or not getattr(config, "activo", False):
        return False

    monto_fmt = f"${float(monto):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    msg = (
        f"✅ Recibimos tu pago de {monto_fmt}\n"
        f"{concepto}\n"
    )
    if cut:
        msg += f"\nTu comprobante: *{cut}*\n"
    msg += "\nGracias por usar Munify."

    try:
        from api.whatsapp import send_whatsapp_message_with_config
        mid = await send_whatsapp_message_with_config(
            config=config,
            to=telefono,
            message=msg,
            db=db,
            tipo_mensaje="pago_confirmado",
            usuario_id=usuario_id,
        )
        return mid is not None
    except Exception as e:
        logger.error("notificar_pago_confirmado error: %s", e)
        return False
