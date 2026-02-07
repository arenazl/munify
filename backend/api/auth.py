from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from datetime import timedelta
from pydantic import BaseModel
import httpx

from core.database import get_db
from core.security import verify_password, get_password_hash, create_access_token, get_current_user
from core.config import settings
from core.rate_limit import limiter, LIMITS
from models.user import User
from models.municipio import Municipio
from models.municipio_dependencia import MunicipioDependencia
from schemas.user import UserCreate, UserResponse, Token, DependenciaInfo


class GoogleAuthRequest(BaseModel):
    credential: str
    municipio_id: int | None = None

router = APIRouter()

@router.post("/register", response_model=UserResponse)
@limiter.limit(LIMITS["auth"])
async def register(request: Request, user_data: UserCreate, db: AsyncSession = Depends(get_db)):
    # Verificar si el email ya existe
    result = await db.execute(select(User).where(User.email == user_data.email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="El email ya está registrado")

    # Validar que el municipio existe si se proporciona
    if user_data.municipio_id:
        municipio_check = await db.execute(
            select(Municipio).where(Municipio.id == user_data.municipio_id)
        )
        if not municipio_check.scalar_one_or_none():
            raise HTTPException(
                status_code=400,
                detail=f"El municipio seleccionado (ID: {user_data.municipio_id}) no existe. Por favor, vuelve a seleccionar tu municipio."
            )

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
    # Recargar con la relación (aunque vecino no tiene dependencia, por consistencia)
    result = await db.execute(
        select(User)
        .options(selectinload(User.dependencia).selectinload(MunicipioDependencia.dependencia))
        .where(User.id == user.id)
    )
    return result.scalar_one()

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


@router.post("/google", response_model=Token)
async def google_auth(request: Request, data: GoogleAuthRequest, db: AsyncSession = Depends(get_db)):
    """Autenticación con Google OAuth - verifica el token y crea/actualiza usuario"""

    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=501, detail="Google OAuth no está configurado")

    # Verificar el token de Google
    try:
        async with httpx.AsyncClient() as client:
            google_data = None

            # Intentar primero como access_token (nuevo flujo con useGoogleLogin)
            response = await client.get(
                "https://www.googleapis.com/oauth2/v3/userinfo",
                headers={"Authorization": f"Bearer {data.credential}"}
            )

            if response.status_code == 200:
                google_data = response.json()
                email = google_data.get("email")
                email_verified = google_data.get("email_verified", False)
                nombre = google_data.get("given_name", "")
                apellido = google_data.get("family_name", "")
                picture = google_data.get("picture", "")
            else:
                # Fallback: intentar como id_token (flujo anterior con GoogleLogin)
                response = await client.get(
                    f"https://oauth2.googleapis.com/tokeninfo?id_token={data.credential}"
                )

                if response.status_code != 200:
                    raise HTTPException(status_code=401, detail="Token de Google inválido")

                google_data = response.json()

                # Verificar que el token es para nuestra app (solo para id_token)
                if google_data.get("aud") != settings.GOOGLE_CLIENT_ID:
                    raise HTTPException(status_code=401, detail="Token no válido para esta aplicación")

                email = google_data.get("email")
                email_verified = google_data.get("email_verified") == "true"
                nombre = google_data.get("given_name", "")
                apellido = google_data.get("family_name", "")
                picture = google_data.get("picture", "")

            if not email or not email_verified:
                raise HTTPException(status_code=400, detail="Email no verificado por Google")

    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=f"Error al verificar con Google: {str(e)}")

    # Buscar usuario existente
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    if user:
        # Usuario existente - actualizar datos de Google si es necesario
        if not user.activo:
            raise HTTPException(status_code=400, detail="Usuario inactivo")
    else:
        # Nuevo usuario - crear cuenta
        # Validar municipio si se proporciona
        if data.municipio_id:
            municipio_check = await db.execute(
                select(Municipio).where(Municipio.id == data.municipio_id)
            )
            if not municipio_check.scalar_one_or_none():
                raise HTTPException(
                    status_code=400,
                    detail=f"El municipio seleccionado no existe"
                )

        user = User(
            email=email,
            password_hash=get_password_hash(f"google_{email}_{google_data.get('sub')}"),  # Password aleatorio
            nombre=nombre or email.split("@")[0],
            apellido=apellido or "-",
            municipio_id=data.municipio_id,
            rol="vecino",
            activo=True
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)

    # Crear token de acceso
    access_token = create_access_token(
        data={"sub": str(user.id)},
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )

    # Cargar dependencia si existe
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

    # Construir respuesta
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
