from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_
from sqlalchemy.orm import selectinload
from typing import List, Optional
from models.municipio_dependencia import MunicipioDependencia
from datetime import datetime, timedelta
import secrets

from core.database import get_db
from core.security import get_current_user, require_roles, get_password_hash
from models.user import User
from models.email_validation import EmailValidation
from models.enums import RolUsuario
from models.tramite import Solicitud
from models.reclamo import Reclamo
from schemas.user import UserResponse, UserUpdate, UserCreate, UserProfileUpdate
from services.email_service import email_service, EmailTemplates
from pydantic import BaseModel

from core.tenancy import resolve_municipio_id as get_effective_municipio_id  # noqa: E402

router = APIRouter()

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
    # Recargar con la relación
    result = await db.execute(
        select(User)
        .options(selectinload(User.dependencia).selectinload(MunicipioDependencia.dependencia))
        .where(User.id == current_user.id)
    )
    return result.scalar_one()

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
        .options(selectinload(User.dependencia).selectinload(MunicipioDependencia.dependencia))
        .where(User.municipio_id == municipio_id)
        .order_by(User.created_at.desc())
    )
    return result.scalars().all()

# ============================================
# Búsqueda por DNI (para autocompletar datos del solicitante en el wizard
# de nueva solicitud de trámite)
# ============================================

class VecinoPorDniResponse(BaseModel):
    """
    Resultado de buscar un vecino por DNI en el municipio actual.

    Se usa en el wizard de creación de solicitud de trámite: cuando el
    empleado termina de cargar el DNI, el frontend consulta este endpoint
    para ver si el vecino ya existe. Si existe, autocompleta los campos.
    """
    id: int
    nombre: str
    apellido: Optional[str] = None
    dni: Optional[str] = None
    email: Optional[str] = None
    telefono: Optional[str] = None
    direccion: Optional[str] = None
    solicitudes_previas: int = 0
    ultima_solicitud_fecha: Optional[datetime] = None
    # Total de reclamos previos en el mismo municipio, y dirección del más
    # reciente. El frontend usa `ultimo_reclamo_direccion` como chip
    # sugerido en el paso "Dónde" del wizard de reclamos.
    reclamos_previos: int = 0
    ultimo_reclamo_direccion: Optional[str] = None


@router.get("/buscar-por-dni", response_model=Optional[VecinoPorDniResponse])
async def buscar_vecino_por_dni(
    dni: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([RolUsuario.ADMIN, RolUsuario.SUPERVISOR])),
):
    """
    Busca un usuario por DNI dentro del municipio actual (definido por el
    header `X-Municipio-ID` o por el municipio del usuario logueado).

    Devuelve `null` (200 con body vacío) si no existe — no es un error, es
    simplemente un "no hay match".

    Incluye el conteo de solicitudes previas de este vecino en el mismo
    municipio y la fecha de la última, para que el frontend muestre un banner
    tipo "Vecino existente — 3 solicitudes previas, última en Enero 2026".
    """
    municipio_id = get_effective_municipio_id(request, current_user)
    if not municipio_id:
        raise HTTPException(status_code=400, detail="Municipio no identificado")

    # Normalizar el DNI: sacar puntos, espacios, guiones
    dni_limpio = "".join(c for c in dni if c.isdigit())
    if len(dni_limpio) < 7:
        # Menos de 7 dígitos no es un DNI válido — devolvemos null sin buscar
        return None

    # Buscar el usuario por DNI dentro del municipio
    result = await db.execute(
        select(User)
        .where(User.dni == dni_limpio)
        .where(User.municipio_id == municipio_id)
        .where(User.activo == True)
        .limit(1)
    )
    user = result.scalar_one_or_none()
    if not user:
        return None

    # Contar solicitudes previas + fecha de la última (trámites)
    stats_result = await db.execute(
        select(
            func.count(Solicitud.id),
            func.max(Solicitud.created_at),
        )
        .where(Solicitud.solicitante_id == user.id)
        .where(Solicitud.municipio_id == municipio_id)
    )
    total_solicitudes, ultima_fecha = stats_result.one()

    # Contar reclamos previos + dirección del más reciente. La dirección
    # del último reclamo se usa en el frontend como chip sugerido en el
    # paso "Dónde" del wizard, para ahorrar tipeo cuando el vecino
    # reclama cosas cerca del mismo lugar.
    reclamos_stats = await db.execute(
        select(func.count(Reclamo.id))
        .where(Reclamo.creador_id == user.id)
        .where(Reclamo.municipio_id == municipio_id)
    )
    total_reclamos = reclamos_stats.scalar() or 0

    ultima_direccion_reclamo: Optional[str] = None
    if total_reclamos > 0:
        ult_res = await db.execute(
            select(Reclamo.direccion)
            .where(Reclamo.creador_id == user.id)
            .where(Reclamo.municipio_id == municipio_id)
            .order_by(Reclamo.created_at.desc())
            .limit(1)
        )
        ultima_direccion_reclamo = ult_res.scalar()

    return VecinoPorDniResponse(
        id=user.id,
        nombre=user.nombre,
        apellido=user.apellido,
        dni=user.dni,
        email=user.email,
        telefono=user.telefono,
        direccion=user.direccion,
        solicitudes_previas=total_solicitudes or 0,
        ultima_solicitud_fecha=ultima_fecha,
        reclamos_previos=total_reclamos,
        ultimo_reclamo_direccion=ultima_direccion_reclamo,
    )


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
        .options(selectinload(User.dependencia).selectinload(MunicipioDependencia.dependencia))
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
    # Recargar con la relación
    result = await db.execute(
        select(User)
        .options(selectinload(User.dependencia).selectinload(MunicipioDependencia.dependencia))
        .where(User.id == user.id)
    )
    return result.scalar_one()

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
        .options(selectinload(User.dependencia).selectinload(MunicipioDependencia.dependencia))
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
    # Recargar con la relación
    result = await db.execute(
        select(User)
        .options(selectinload(User.dependencia).selectinload(MunicipioDependencia.dependencia))
        .where(User.id == user_id)
    )
    return result.scalar_one()

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
