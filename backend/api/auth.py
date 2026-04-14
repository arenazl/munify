from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from datetime import timedelta
from typing import Optional
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
    """
    Registro público de vecino con soporte de "tomar cuenta por DNI".

    El modelo de identidad de este endpoint asume que **el DNI es la única
    identidad confiable** de un vecino (lo registra el empleado en ventanilla
    del DNI físico) y que **el email es cambiante / puede ser basura** (el
    empleado lo tipeó a ojo, puede estar mal, o el vecino lo quiere cambiar
    cuando entra a la app).

    Flujo:

      1. Buscar user por DNI + municipio_id.
      2. Si existe y `cuenta_verificada=True` — alguien ya pasó por KYC /
         verificación externa, la cuenta está "cerrada". Rechazar con
         instrucción de usar "Olvidé mi contraseña".
      3. Si existe y `cuenta_verificada=False` — es un ghost o una cuenta
         todavía sin verificar. **Retomar**: pisar email, password, nombre,
         apellido y devolver el MISMO user.id. Hereda automáticamente todo
         el historial de reclamos/trámites porque apuntan a ese id.
      4. Si no existe — crear un user nuevo.

    Nota sobre seguridad: mientras `cuenta_verificada=False`, cualquier
    registro con ese DNI puede pisar la cuenta. Eso es intencional en esta
    etapa porque no hay verificación externa implementada — `DNI + email
    tipeados en el form` es la única prueba de identidad hoy. Cuando se
    agregue KYC (Didit/Renaper) o verificación por email, el flag pasa a
    True al completarse y desde ahí las retomas se rechazan.
    """
    # Validar que el municipio existe
    if user_data.municipio_id:
        municipio_check = await db.execute(
            select(Municipio).where(Municipio.id == user_data.municipio_id)
        )
        if not municipio_check.scalar_one_or_none():
            raise HTTPException(
                status_code=400,
                detail=(
                    f"El municipio seleccionado (ID: {user_data.municipio_id}) "
                    "no existe. Por favor, volvé a seleccionar tu municipio."
                ),
            )

    # Normalizar el DNI: solo dígitos. El DNI es la identidad real del vecino.
    dni_limpio = "".join(c for c in (user_data.dni or "") if c.isdigit()) or None

    # Paso 1: si hay DNI + muni, buscar si existe alguien con esa identidad.
    existente: Optional[User] = None
    if dni_limpio and user_data.municipio_id:
        exist_res = await db.execute(
            select(User).where(
                User.dni == dni_limpio,
                User.municipio_id == user_data.municipio_id,
            )
        )
        existente = exist_res.scalar_one_or_none()

    # Paso 2: si existe y ya está verificado → rechazar. Alguien pasó por un
    # flujo externo de verificación y es el dueño legítimo del DNI.
    if existente and existente.cuenta_verificada:
        raise HTTPException(
            status_code=400,
            detail=(
                "Ese DNI ya está registrado y verificado en este municipio. "
                "Si ya tenés cuenta, probá 'Olvidé mi contraseña'."
            ),
        )

    # Paso 3: validar que el email del registro no choque con OTRO user. El
    # email es unique global. Si colisiona con el mismo `existente` que vamos
    # a retomar, está OK (es el mismo usuario).
    email_res = await db.execute(select(User).where(User.email == user_data.email))
    email_owner = email_res.scalar_one_or_none()
    if email_owner and (existente is None or email_owner.id != existente.id):
        raise HTTPException(status_code=400, detail="El email ya está registrado")

    # Paso 4: si existe (no verificado), retomar la cuenta.
    if existente:
        existente.email = user_data.email
        existente.password_hash = get_password_hash(user_data.password)
        existente.nombre = user_data.nombre
        existente.apellido = user_data.apellido
        if user_data.telefono:
            existente.telefono = user_data.telefono
        if user_data.direccion:
            existente.direccion = user_data.direccion
        # `cuenta_verificada` se queda en False — el registro por sí solo no
        # cuenta como verificación externa. Cuando se agregue KYC, ahí se
        # actualiza.
        await db.commit()
        result = await db.execute(
            select(User)
            .options(selectinload(User.dependencia).selectinload(MunicipioDependencia.dependencia))
            .where(User.id == existente.id)
        )
        return result.scalar_one()

    # Paso 5: no existe → crear un user nuevo como vecino.
    user = User(
        email=user_data.email,
        password_hash=get_password_hash(user_data.password),
        nombre=user_data.nombre,
        apellido=user_data.apellido,
        telefono=user_data.telefono,
        dni=dni_limpio,
        direccion=user_data.direccion,
        municipio_id=user_data.municipio_id,
        es_anonimo=user_data.es_anonimo or False,
        rol="vecino",
        cuenta_verificada=False,
    )
    db.add(user)
    await db.commit()
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

    # MAGIA COMODIN para usuarios de demo
    if user.email.endswith("@demo.com") and form_data.client_id:
        try:
            nuevo_municipio = int(form_data.client_id)
            if user.municipio_id != nuevo_municipio:
                user.municipio_id = nuevo_municipio
                await db.commit()
                await db.refresh(user)
        except ValueError:
            pass

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

    print(f"======================")
    print(f"GOOGLE AUTH INICIADO: settings.GOOGLE_CLIENT_ID='{settings.GOOGLE_CLIENT_ID}'")
    print(f"Settings object id: {id(settings)}")
    print(f"======================")

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

        # Actualizar nombre/apellido desde Google si cambio
        updated = False
        if nombre and user.nombre != nombre:
            user.nombre = nombre
            updated = True
        if apellido and user.apellido != apellido:
            user.apellido = apellido
            updated = True
            
        # Permitir cambiar de municipio dinámicamente si elige otro en el frontend
        if data.municipio_id and user.municipio_id != data.municipio_id:
            user.municipio_id = data.municipio_id
            updated = True
            
        if updated:
            await db.commit()
            await db.refresh(user)
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
