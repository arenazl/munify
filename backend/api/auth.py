from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from datetime import timedelta

from core.database import get_db
from core.security import verify_password, get_password_hash, create_access_token, get_current_user
from core.config import settings
from core.rate_limit import limiter, LIMITS
from models.user import User
from models.municipio_dependencia import MunicipioDependencia
from schemas.user import UserCreate, UserResponse, Token, DependenciaInfo

router = APIRouter()

@router.post("/register", response_model=UserResponse)
@limiter.limit(LIMITS["auth"])
async def register(request: Request, user_data: UserCreate, db: AsyncSession = Depends(get_db)):
    # Verificar si el email ya existe
    result = await db.execute(select(User).where(User.email == user_data.email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="El email ya está registrado")

    # Crear usuario (rol vecino por defecto para registro público)
    user = User(
        email=user_data.email,
        password_hash=get_password_hash(user_data.password),
        nombre=user_data.nombre,
        apellido=user_data.apellido,
        telefono=user_data.telefono,
        dni=user_data.dni,
        direccion=user_data.direccion,
        municipio_id=user_data.municipio_id,
        es_anonimo=user_data.es_anonimo or False,
        rol="vecino"
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user

@router.post("/login", response_model=Token)
# @limiter.limit(LIMITS["auth"])  # Temporalmente deshabilitado para debug
async def login(request: Request, form_data: OAuth2PasswordRequestForm = Depends(), db: AsyncSession = Depends(get_db)):
    # Buscar usuario por email
    result = await db.execute(
        select(User).where(User.email == form_data.username)
    )
    user = result.scalar_one_or_none()

    if not user or not verify_password(form_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email o contraseña incorrectos",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.activo:
        raise HTTPException(status_code=400, detail="Usuario inactivo")

    # Crear token
    access_token = create_access_token(
        data={"sub": str(user.id)},
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )

    # Cargar dependencia si el usuario tiene una asignada
    dependencia_info = None
    if user.municipio_dependencia_id:
        dep_result = await db.execute(
            select(MunicipioDependencia)
            .where(MunicipioDependencia.id == user.municipio_dependencia_id)
            .options(selectinload(MunicipioDependencia.dependencia))
        )
        muni_dep = dep_result.scalar_one_or_none()
        if muni_dep and muni_dep.dependencia:
            dependencia_info = DependenciaInfo(
                id=muni_dep.id,
                nombre=muni_dep.dependencia.nombre,
                color=muni_dep.dependencia.color,
                icono=muni_dep.dependencia.icono,
                direccion=muni_dep.direccion_efectiva,
                telefono=muni_dep.telefono_efectivo,
            )

    # Construir respuesta con info de dependencia si existe
    user_response = UserResponse(
        id=user.id,
        municipio_id=user.municipio_id,
        email=user.email,
        nombre=user.nombre,
        apellido=user.apellido,
        telefono=user.telefono,
        dni=user.dni,
        direccion=user.direccion,
        es_anonimo=user.es_anonimo,
        rol=user.rol,
        activo=user.activo,
        empleado_id=user.empleado_id,
        municipio_dependencia_id=user.municipio_dependencia_id,
        dependencia=dependencia_info,
        created_at=user.created_at,
    )

    return Token(
        access_token=access_token,
        user=user_response
    )

@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    # Construir respuesta con info de dependencia si existe
    return UserResponse(
        id=current_user.id,
        municipio_id=current_user.municipio_id,
        email=current_user.email,
        nombre=current_user.nombre,
        apellido=current_user.apellido,
        telefono=current_user.telefono,
        dni=current_user.dni,
        direccion=current_user.direccion,
        es_anonimo=current_user.es_anonimo,
        rol=current_user.rol,
        activo=current_user.activo,
        empleado_id=current_user.empleado_id,
        municipio_dependencia_id=current_user.municipio_dependencia_id,
        dependencia=DependenciaInfo(
            id=current_user.dependencia.id,
            nombre=current_user.dependencia.dependencia.nombre,
            color=current_user.dependencia.dependencia.color,
            icono=current_user.dependencia.dependencia.icono,
            direccion=current_user.dependencia.direccion_efectiva,
            telefono=current_user.dependencia.telefono_efectivo,
        ) if current_user.dependencia and current_user.dependencia.dependencia else None,
        created_at=current_user.created_at,
    )


@router.get("/check-email")
async def check_email(email: str, db: AsyncSession = Depends(get_db)):
    """Verificar si un email ya está registrado (para flujo de registro/login unificado)"""
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    return {"exists": user is not None}
