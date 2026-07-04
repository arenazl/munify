"""
Multi-tenancy helpers — single source of truth para resolver el
`municipio_id` efectivo de un request.

Antes esta lógica estaba **copiada y pegada en 10+ archivos** de `api/*.py`
como función local `get_effective_municipio_id`. Cualquier cambio (ej:
agregar un header alternativo, permitir superadmin por otro rol, cambiar
el error message) implicaba editar los 10 archivos. Peor: si un endpoint
nuevo se olvidaba de llamarla, devolvía datos sin filtrar por municipio
— un data leak cross-tenant.

Ahora todo vive acá y los endpoints lo piden como dependency:

    from core.tenancy import MunicipioID

    @router.get("/items")
    async def list_items(municipio_id: MunicipioID):
        ...   # municipio_id ya está validado y resuelto

Reglas de resolución:

- Solo el **superadmin real** (usuario sin `municipio_id` propio, ver
  `is_super_admin`) puede pasar `X-Municipio-ID` por header para actuar
  sobre un municipio. Un admin/supervisor de un municipio NO puede spoofear
  el header para operar cross-tenant (era un leak de seguridad).
- Si el header no viene o el usuario no es superadmin, cae al `municipio_id`
  del perfil del usuario.
- Si el usuario no tiene municipio asignado y tampoco viene header,
  el endpoint devuelve 400. Esto previene ejecutar queries sin filtro.

Para endpoints públicos (portal del vecino sin login), usar
`MunicipioIDOptional` que acepta solo el header.
"""
from typing import Annotated, Optional

from fastapi import Depends, Header, HTTPException, Request, status

from core.security import get_current_user, get_current_user_optional
from models.user import User


def _parse_header(raw: Optional[str]) -> Optional[int]:
    """Parsea el header `X-Municipio-ID` a int, devuelve None si es inválido."""
    if not raw:
        return None
    try:
        return int(raw)
    except (ValueError, TypeError):
        return None


# ============================================================
# Helper síncrono — compatibilidad con el patrón viejo
# ============================================================
#
# Antes cada archivo definía:
#
#     def get_effective_municipio_id(request, current_user): ...
#
# y lo llamaba desde el body del endpoint. Para migrar sin tocar cada
# call site, exponemos el mismo helper acá. Los call sites existentes
# ahora hacen `from core.tenancy import get_effective_municipio_id`
# y funcionan igual. Los endpoints nuevos deberían usar la dependency
# `MunicipioID` que es más limpia.

def resolve_municipio_id(
    request: Request,
    current_user: Optional[User],
) -> Optional[int]:
    """
    Versión silent: devuelve el municipio_id efectivo o `None` si no se
    puede resolver. Sin excepciones. Útil para endpoints que tienen un
    fallback natural cuando no hay tenant (ej: listar categorías por
    defecto para el portal público).
    """
    # Solo el superadmin real (sin municipio propio) puede elegir municipio
    # via X-Municipio-ID. Un admin/supervisor de un muni NO puede spoofear el
    # header para operar cross-tenant (era un leak: cualquier admin podía
    # mandar X-Municipio-ID de otro muni y leer/escribir sus datos).
    if current_user and current_user.municipio_id is None:
        from_header = _parse_header(request.headers.get("X-Municipio-ID"))
        if from_header is not None:
            return from_header
    if current_user:
        return current_user.municipio_id
    return None


def get_effective_municipio_id(
    request: Request,
    current_user: Optional[User],
) -> int:
    """
    Versión estricta: si no puede resolver el municipio, levanta 400.

    Mantiene la misma signature que las 10 copias locales que había en
    `api/*.py` — preferí mantener el nombre para no tocar 60+ call sites.

    Para el comportamiento "silent" (retornar None sin excepción), usar
    `resolve_municipio_id` arriba.
    """
    municipio_id = resolve_municipio_id(request, current_user)
    if municipio_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Usuario sin municipio asignado. Indicá X-Municipio-ID.",
        )
    return municipio_id


async def get_municipio_id(
    x_municipio_id: Annotated[Optional[str], Header()] = None,
    current_user: User = Depends(get_current_user),
) -> int:
    """
    Dependency principal: devuelve el `municipio_id` efectivo del request.

    Requiere que el usuario esté autenticado. Si es admin/supervisor,
    respeta el header `X-Municipio-ID` (para panel cross-municipio). Si
    no, usa el municipio del perfil del usuario.

    Levanta 400 si no hay forma de resolver el municipio — eso garantiza
    que ninguna query se ejecute sin filtro de tenancy.
    """
    # Solo el superadmin real (sin municipio propio) puede elegir municipio
    # via X-Municipio-ID; un admin/supervisor de un muni queda atado al suyo.
    if current_user.municipio_id is None:
        from_header = _parse_header(x_municipio_id)
        if from_header is not None:
            return from_header
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Usuario sin municipio asignado. Indicá X-Municipio-ID.",
        )

    return current_user.municipio_id


async def get_municipio_id_optional(
    x_municipio_id: Annotated[Optional[str], Header()] = None,
    current_user: Optional[User] = Depends(get_current_user_optional),
) -> int:
    """
    Variante para endpoints que también sirven al portal público (vecino
    sin login). Si no hay `current_user`, acepta el header pelado; si no
    hay ni user ni header, devuelve 400.
    """
    # Usuario logueado → misma lógica que el helper principal
    if current_user is not None:
        # Solo el superadmin real (sin municipio) puede elegir muni por header.
        if current_user.municipio_id is None:
            from_header = _parse_header(x_municipio_id)
            if from_header is not None:
                return from_header
        else:
            return current_user.municipio_id

    # Sin user (portal público) → el header es la única fuente
    from_header = _parse_header(x_municipio_id)
    if from_header is not None:
        return from_header

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Municipio no identificado. Indicá X-Municipio-ID.",
    )


# ============================================================
# Type aliases para usar en signatures — limpian los Depends.
# ============================================================

MunicipioID = Annotated[int, Depends(get_municipio_id)]
MunicipioIDOptional = Annotated[int, Depends(get_municipio_id_optional)]
