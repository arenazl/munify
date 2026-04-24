"""Util para generar links wa.me (click-to-chat) de WhatsApp.

Diferencia con `whatsapp_pagos.py`:
  - whatsapp_pagos.py → manda MEDIANTE Business API (requiere templates
    aprobados por Meta para mensajes fuera de la ventana de 24 hs).
  - wa_me.py (este) → genera URL que el operador abre en su propio
    WhatsApp Web / celular y envia manualmente. No requiere API ni
    templates ni aprobaciones.

Este es el modo DEFAULT del bundle de pagos. Business API queda como
feature futura opcional para munis grandes con numero oficial verificado.
"""
from urllib.parse import quote as urlquote
from decimal import Decimal
from typing import Optional


def normalizar_telefono_ar(telefono: str) -> Optional[str]:
    """Normaliza un numero argentino al formato que wa.me espera: digitos sin +.

    Reglas:
      - Saca espacios, guiones, parentesis, puntos.
      - Si empieza con 0, lo saca (0-11-1234 → 11-1234).
      - Si empieza con 15 (celu viejo), lo saca (15-1234 → 1234) y prefija 9.
      - Agrega 54 + 9 para celulares si no estan.
      - Resultado: 5491112345678 (13 digitos: 54 + 9 + area + numero).

    Si el numero viene ya en formato internacional (con 54 o +54) lo respeta.
    Si no se puede normalizar, devuelve None.
    """
    if not telefono:
        return None
    raw = "".join(ch for ch in telefono if ch.isdigit())
    if not raw:
        return None

    # Ya empieza con 54 (argentina)
    if raw.startswith("54"):
        rest = raw[2:]
        # Insertar 9 para celular si no esta (heuristico: 10 digitos tras 54 = celu sin 9)
        if len(rest) == 10 and not rest.startswith("9"):
            raw = "549" + rest
        return raw

    # 0-area-numero — sacamos el 0
    if raw.startswith("0"):
        raw = raw[1:]

    # Quitar "15" prefix (celu viejo): 11 15 1234-5678 → 11 1234-5678
    # Asumimos que si despues de area hay "15" y despues hay 8 digitos
    # mas, era celular viejo. Heuristico conservador.
    # La forma canonica moderna es: area(2-4) + 8 digitos = 10-12 total.
    if len(raw) >= 10:
        # Caso comun: 11 15 1234 5678 → 11 1234 5678
        if raw[2:4] == "15" and len(raw) == 12:
            raw = raw[:2] + raw[4:]

    # Prefijar 54 9 para celulares (default Argentina)
    if len(raw) == 10:
        raw = "549" + raw
    elif len(raw) == 8:  # solo numero sin area — no podemos adivinar area
        return None

    return raw if len(raw) >= 12 else None


def armar_wa_me_url(telefono: str, mensaje: str) -> Optional[str]:
    """Devuelve URL wa.me con mensaje prellenado, o None si el telefono es invalido."""
    tel = normalizar_telefono_ar(telefono)
    if not tel:
        return None
    texto = urlquote(mensaje, safe="")
    return f"https://wa.me/{tel}?text={texto}"


def mensaje_link_pago(
    nombre_vecino: str,
    tramite_nombre: str,
    checkout_url: str,
    numero_tramite: Optional[str] = None,
) -> str:
    nro = f" ({numero_tramite})" if numero_tramite else ""
    nombre = nombre_vecino or "vecino/a"
    return (
        f"Hola {nombre}, inicié tu trámite de {tramite_nombre}{nro}. "
        f"Pagá acá: {checkout_url}\n\n"
        "Cuando confirmes el pago, te lo registramos desde el municipio."
    )


def mensaje_pago_confirmado(
    nombre_vecino: str,
    concepto: str,
    monto: Decimal,
    cut: Optional[str] = None,
) -> str:
    monto_fmt = f"${float(monto):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    msg = f"✅ Recibimos tu pago de {monto_fmt}\n{concepto}\n"
    if cut:
        msg += f"\nTu comprobante: *{cut}*\n"
    msg += "\nGracias por usar Munify."
    return msg
