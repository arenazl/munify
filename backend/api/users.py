from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_
from typing import List
from datetime import datetime, timedelta
import secrets

from core.database import get_db
from core.security import get_current_user, require_roles, get_password_hash
from models.user import User
from models.email_validation import EmailValidation
from models.enums import RolUsuario
from schemas.user import UserResponse, UserUpdate, UserCreate, UserProfileUpdate
from services.email_service import email_service, EmailTemplates

router = APIRouter()


def get_effective_municipio_id(request: Request, current_user: User) -> int:
    """Obtiene el municipio_id efectivo (del header X-Municipio-ID si es admin/supervisor)"""
    if current_user.rol in [RolUsuario.ADMIN, RolUsuario.SUPERVISOR]:
        header_municipio_id = request.headers.get('X-Municipio-ID')
        if header_municipio_id:
            try:
                return int(header_municipio_id)
            except (ValueError, TypeError):
                pass
    return current_user.municipio_id

# ============================================
# ENDPOINTS DE PERFIL PROPIO (cualquier usuario autenticado)
# ============================================

@router.get("/me", response_model=UserResponse)
async def get_my_profile(
    current_user: User = Depends(get_current_user)
):
    """Obtener el perfil del usuario actual"""
    return current_user

@router.put("/me", response_model=UserResponse)
async def update_my_profile(
    profile_data: UserProfileUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Actualizar el perfil del usuario actual (campos limitados)"""
    update_data = profile_data.model_dump(exclude_unset=True)

    for key, value in update_data.items():
        setattr(current_user, key, value)

    await db.commit()
    await db.refresh(current_user)
    return current_user

@router.post("/me/request-email-change")
async def request_email_change(
    request_data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Solicitar cambio de email - envía código de validación"""
    nuevo_email = request_data.get("nuevo_email")

    if not nuevo_email:
        raise HTTPException(status_code=400, detail="Debe proporcionar un nuevo email")

    if nuevo_email == current_user.email:
        raise HTTPException(status_code=400, detail="El nuevo email es igual al actual")

    # Verificar que el email no esté en uso
    result = await db.execute(select(User).where(User.email == nuevo_email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Este email ya está registrado")

    # Generar código de 6 dígitos
    codigo = ''.join([str(secrets.randbelow(10)) for _ in range(6)])

    # Crear registro de validación (expira en 15 minutos)
    expires_at = datetime.utcnow() + timedelta(minutes=15)
    validacion = EmailValidation(
        usuario_id=current_user.id,
        nuevo_email=nuevo_email,
        codigo=codigo,
        expires_at=expires_at
    )
    db.add(validacion)
    await db.commit()

    # Enviar email con el código
    try:
        html_content = EmailTemplates.validacion_email(
            nombre=current_user.nombre,
            codigo=codigo,
            nuevo_email=nuevo_email
        )
        await email_service.send_email(
            to_email=nuevo_email,
            subject="Código de validación - Cambio de email",
            body_html=html_content
        )
    except Exception as e:
        print(f"Error enviando email de validación: {e}")
        raise HTTPException(status_code=500, detail="Error al enviar el código de validación")

    return {
        "success": True,
        "message": f"Código de validación enviado a {nuevo_email}"
    }

@router.post("/me/validate-email-change")
async def validate_email_change(
    validation_data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Validar código y cambiar email"""
    nuevo_email = validation_data.get("nuevo_email")
    codigo = validation_data.get("codigo")

    if not nuevo_email or not codigo:
        raise HTTPException(status_code=400, detail="Faltan datos requeridos")

    # Buscar validación pendiente
    result = await db.execute(
        select(EmailValidation)
        .where(EmailValidation.usuario_id == current_user.id)
        .where(EmailValidation.nuevo_email == nuevo_email)
        .where(EmailValidation.codigo == codigo)
        .where(EmailValidation.usado == False)
        .order_by(EmailValidation.created_at.desc())
    )
    validacion = result.scalar_one_or_none()

    if not validacion:
        raise HTTPException(status_code=400, detail="Código inválido")

    # Verificar que no haya expirado
    if datetime.utcnow() > validacion.expires_at:
        raise HTTPException(status_code=400, detail="El código ha expirado")

    # Verificar una última vez que el email no esté en uso
    result = await db.execute(select(User).where(User.email == nuevo_email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Este email ya está registrado")

    # Actualizar email del usuario
    current_user.email = nuevo_email

    # Marcar validación como usada
    validacion.validado = True
    validacion.usado = True
    validacion.validated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(current_user)

    return {
        "success": True,
        "message": "Email actualizado exitosamente",
        "nuevo_email": nuevo_email
    }

# ============================================
# ENDPOINTS DE ADMINISTRACIÓN (admin/supervisor)
# ============================================

@router.get("", response_model=List[UserResponse])
async def get_users(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"]))
):
    municipio_id = get_effective_municipio_id(request, current_user)
    result = await db.execute(
        select(User)
        .where(User.municipio_id == municipio_id)
        .order_by(User.created_at.desc())
    )
    return result.scalars().all()

@router.get("/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"]))
):
    municipio_id = get_effective_municipio_id(request, current_user)
    result = await db.execute(
        select(User)
        .where(User.id == user_id)
        .where(User.municipio_id == municipio_id)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    return user

@router.post("", response_model=UserResponse)
async def create_user(
    user_data: UserCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"]))
):
    municipio_id = get_effective_municipio_id(request, current_user)
    if not municipio_id:
        raise HTTPException(status_code=400, detail="Debe seleccionar un municipio")

    # Verificar si el email ya existe
    result = await db.execute(select(User).where(User.email == user_data.email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="El email ya está registrado")

    user = User(
        email=user_data.email,
        password_hash=get_password_hash(user_data.password),
        nombre=user_data.nombre,
        apellido=user_data.apellido,
        telefono=user_data.telefono,
        dni=user_data.dni,
        direccion=user_data.direccion,
        municipio_id=municipio_id
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user

@router.put("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: int,
    user_data: UserUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"]))
):
    # Multi-tenant: filtrar por municipio_id del usuario actual
    result = await db.execute(
        select(User)
        .where(User.id == user_id)
        .where(User.municipio_id == current_user.municipio_id)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    update_data = user_data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(user, key, value)

    await db.commit()
    await db.refresh(user)
    return user

@router.delete("/{user_id}")
async def delete_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"]))
):
    # Multi-tenant: filtrar por municipio_id del usuario actual
    result = await db.execute(
        select(User)
        .where(User.id == user_id)
        .where(User.municipio_id == current_user.municipio_id)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="No puedes eliminarte a ti mismo")

    # Soft delete
    user.activo = False
    await db.commit()
    return {"message": "Usuario desactivado"}
