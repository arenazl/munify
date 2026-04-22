"""Cifrado simetrico para secretos en DB (access tokens de providers, etc).

Usa Fernet (AES-128-CBC + HMAC-SHA256) con la key en la env var FERNET_KEY.
Si falta la env, loguea warning + guarda en claro base64 (dev only).

Uso:
    from services.cifrado import cifrar, descifrar, es_placeholder
    enc = cifrar("mi-access-token-secreto")
    claro = descifrar(enc)

El ciphertext comienza con "fernet:" (si esta cifrado) o "plain:" (si no
habia key). El parser detecta ambos.
"""
import base64
import logging
from typing import Optional

from core.config import settings

logger = logging.getLogger(__name__)

_FERNET = None  # type: ignore[var-annotated]


def _load_fernet():
    """Carga el cipher Fernet lazy. Devuelve None si no hay FERNET_KEY."""
    global _FERNET
    if _FERNET is not None:
        return _FERNET
    key = getattr(settings, "FERNET_KEY", None) or ""
    if not key:
        logger.warning(
            "FERNET_KEY no configurada — los secretos se guardaran en BASE64 "
            "(NO recomendado para produccion)."
        )
        return None
    try:
        from cryptography.fernet import Fernet
        _FERNET = Fernet(key.encode() if isinstance(key, str) else key)
        return _FERNET
    except Exception as e:
        logger.error(f"FERNET_KEY invalida: {e}")
        return None


def cifrar(claro: str) -> str:
    """Cifra un string y devuelve el ciphertext con prefijo.

    Si FERNET_KEY no esta configurada, devuelve base64 con prefijo 'plain:'
    (util en dev/testing, NUNCA en produccion — deja warning).
    """
    if not claro:
        return ""
    f = _load_fernet()
    if f is None:
        return "plain:" + base64.urlsafe_b64encode(claro.encode()).decode()
    return "fernet:" + f.encrypt(claro.encode()).decode()


def descifrar(enc: Optional[str]) -> str:
    """Descifra un ciphertext. Devuelve '' si no hay nada o no se puede descifrar."""
    if not enc:
        return ""
    if enc.startswith("fernet:"):
        f = _load_fernet()
        if f is None:
            logger.error("Ciphertext fernet pero no hay FERNET_KEY para descifrar")
            return ""
        try:
            return f.decrypt(enc[len("fernet:"):].encode()).decode()
        except Exception as e:
            logger.error(f"Error descifrando fernet: {e}")
            return ""
    if enc.startswith("plain:"):
        try:
            return base64.urlsafe_b64decode(enc[len("plain:"):].encode()).decode()
        except Exception:
            return ""
    # Legacy: sin prefijo, asumimos plain text (migracion desde versiones viejas)
    return enc


def es_placeholder(enc: Optional[str]) -> bool:
    """Detecta si el ciphertext es un placeholder (sin setear o vacio)."""
    return not enc or enc == "" or enc == "***"
