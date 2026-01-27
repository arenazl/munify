from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from .config import settings
from .database import get_db

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login")
oauth2_scheme_optional = OAuth2PasswordBearer(tokenUrl="api/auth/login", auto_error=False)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt

async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db)
):
    from models.user import User
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="No se pudieron validar las credenciales",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    # Cargar usuario con su dependencia si existe
    from models.municipio_dependencia import MunicipioDependencia
    result = await db.execute(
        select(User)
        .where(User.id == int(user_id))
        .options(selectinload(User.dependencia).selectinload(MunicipioDependencia.dependencia))
    )
    user = result.scalar_one_or_none()
    if user is None:
        raise credentials_exception
    if not user.activo:
        raise HTTPException(status_code=400, detail="Usuario inactivo")
    return user

async def get_current_user_optional(
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """Obtiene el usuario actual si está autenticado, None si no lo está."""
    # Extraer token del header Authorization
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        return None

    token = auth_header.replace("Bearer ", "")
    if not token:
        return None

    from models.user import User
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            return None
    except JWTError:
        return None

    # Cargar usuario con su dependencia si existe
    from models.municipio_dependencia import MunicipioDependencia
    result = await db.execute(
        select(User)
        .where(User.id == int(user_id))
        .options(selectinload(User.dependencia).selectinload(MunicipioDependencia.dependencia))
    )
    user = result.scalar_one_or_none()
    if user is None or not user.activo:
        return None
    return user

def require_roles(allowed_roles: list):
    async def role_checker(current_user = Depends(get_current_user)):
        # Debug: mostrar rol del usuario
        user_rol = current_user.rol.value if hasattr(current_user.rol, 'value') else str(current_user.rol)
        print(f"[AUTH] Usuario: {current_user.email}, Rol: {user_rol}, Roles permitidos: {allowed_roles}", flush=True)

        # Comparar tanto con el enum como con el string
        rol_str = current_user.rol.value if hasattr(current_user.rol, 'value') else str(current_user.rol)
        if rol_str not in allowed_roles and current_user.rol not in allowed_roles:
            print(f"[AUTH] DENEGADO - rol '{rol_str}' no está en {allowed_roles}", flush=True)
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No tienes permisos para realizar esta acción"
            )
        print(f"[AUTH] PERMITIDO", flush=True)
        return current_user
    return role_checker


def get_municipio_id_from_header():
    """
    Obtiene el municipio_id del header X-Municipio-ID.
    Solo admins/supervisores pueden cambiar de municipio.
    """
    from fastapi import Request

    async def _get_municipio_id(
        request: Request,
        current_user = Depends(get_current_user)
    ) -> int:
        # Solo admins y supervisores pueden cambiar de municipio via header
        if current_user.rol in ['admin', 'supervisor']:
            header_municipio_id = request.headers.get('X-Municipio-ID')
            if header_municipio_id:
                try:
                    return int(header_municipio_id)
                except (ValueError, TypeError):
                    pass
        # Default: municipio del usuario
        return current_user.municipio_id

    return _get_municipio_id
