"""
Helpers de resolución de vecinos (ghost vecino).

Este helper se usa cuando un empleado municipal en ventanilla carga una
solicitud o un reclamo en nombre de un vecino real. En lugar de dejar los
datos del solicitante como strings sueltos en la tabla `solicitudes` /
`reclamos`, resolvemos al vecino contra `usuarios` para que:

- El historial del vecino quede linkeado (puede tener 5 reclamos y 3 trámites
  y verlos todos juntos)
- El mismo DNI no aparezca como "solicitante" con 3 variantes de nombre
  ("Juan Perez", "JUAN PEREZ", "Juan Pérez")
- Si mañana el vecino se registra por su cuenta, puede reclamar su cuenta
  ghost via "olvidé mi contraseña" y automáticamente hereda su historial

Estrategia:
  1. Match por DNI + municipio_id — el candidato más confiable
  2. Match por email — fallback si no había DNI o no matcheó
  3. Si nada matchea → crear un ghost: `User` normal rol=vecino con
     password_hash bcrypt de un token random inutilizable

Extraído de `api/tramites.py` para poder reusarlo desde `api/reclamos.py`
sin duplicar código.
"""
import secrets
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.security import get_password_hash
from models.enums import RolUsuario
from models.user import User


async def resolver_o_crear_vecino(
    db: AsyncSession,
    municipio_id: int,
    dni: Optional[str],
    email: Optional[str],
    nombre: Optional[str],
    apellido: Optional[str],
    telefono: Optional[str],
    direccion: Optional[str],
) -> User:
    """
    Devuelve el User del vecino, creándolo como "ghost" si no existe.

    Ver docstring del módulo para detalles.
    """
    # Normalizar DNI: solo dígitos
    dni_limpio = "".join(c for c in (dni or "") if c.isdigit()) or None

    # 1) Match por DNI + municipio (camino feliz: vecino del mismo muni que
    #    el reclamo → reutilizar su user_id).
    if dni_limpio:
        r = await db.execute(
            select(User).where(
                User.dni == dni_limpio,
                User.municipio_id == municipio_id,
            )
        )
        existente = r.scalar_one_or_none()
        if existente:
            return existente

        # 1b) Match por DNI global: ese DNI ya existe en el sistema pero NO
        #     como vecino de este muni. Puede ser admin/supervisor de otro
        #     muni, o vecino de otro muni. En cualquier caso, no podemos
        #     reutilizarlo sin contaminar multi-tenant: el reclamo quedaría
        #     linkeado a un user de otro muni y aparecería cross-tenant.
        #     Tampoco podemos crear un ghost con el mismo DNI porque el
        #     duplicado se permite (DNI no es unique), pero sería la misma
        #     persona con dos filas, y eso está mal.
        r = await db.execute(select(User).where(User.dni == dni_limpio))
        existente = r.scalar_one_or_none()
        if existente:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"El DNI {dni_limpio} ya pertenece a un usuario del sistema "
                    f"registrado en otro municipio. No podés usarlo como "
                    f"solicitante de un reclamo en este municipio."
                ),
            )

    # 2) Match por email. `email` es unique global a nivel DB.
    if email:
        email_norm = email.strip().lower()
        r = await db.execute(select(User).where(User.email == email_norm))
        existente = r.scalar_one_or_none()
        if existente:
            # (a) Vecino del mismo muni → camino feliz, reutilizar.
            if (
                existente.municipio_id == municipio_id
                and existente.rol == RolUsuario.VECINO
            ):
                return existente
            # (b) Cualquier otro caso (admin/supervisor, o vecino de otro muni):
            #     bloquear con error claro. Intentar crear un ghost con ese
            #     mismo email explotaría por la constraint unique de email.
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"El email {email_norm} ya pertenece a otro usuario del "
                    f"sistema. No podés usarlo como solicitante. Usá un email "
                    f"distinto o dejalo vacío."
                ),
            )

    # 3) Crear ghost
    if not (nombre and apellido):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Nombre y apellido son obligatorios para dar de alta al vecino",
        )

    # Email: usar el que vino, o generar placeholder único
    if email:
        email_final = email.strip().lower()
    elif dni_limpio:
        email_final = f"vecino-{dni_limpio}-m{municipio_id}@sin-email.local"
    else:
        email_final = f"vecino-{secrets.token_hex(6)}-m{municipio_id}@sin-email.local"

    ghost = User(
        municipio_id=municipio_id,
        email=email_final,
        password_hash=get_password_hash(secrets.token_urlsafe(32)),
        nombre=nombre.strip(),
        apellido=apellido.strip(),
        telefono=(telefono or "").strip() or None,
        dni=dni_limpio,
        direccion=(direccion or "").strip() or None,
        rol=RolUsuario.VECINO,
        activo=True,
        # Nace como ghost sin verificar: password es token random y nadie
        # probó ser el humano detrás del DNI. Cuando el vecino se registre
        # por la app, /auth/register le va a pisar email/password y la
        # cuenta queda "tomada" — el flag `cuenta_verificada` se queda en
        # False hasta que se implemente un flujo externo de verificación
        # (KYC facial, email verificado, etc).
        cuenta_verificada=False,
    )
    db.add(ghost)
    await db.flush()  # necesario para tener ghost.id antes del commit final
    return ghost
