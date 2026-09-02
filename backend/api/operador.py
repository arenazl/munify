"""API del Operador de Ventanilla (Mostrador).

Solo cubre las primitivas que usa el Mostrador:
  - GET  /operador/mostrador/home            -> metricas del operador del dia
  - GET  /operador/vecinos/buscar?dni=...    -> buscador de cliente registrado
  - POST /operador/vecinos                   -> alta manual de vecino (sin biometria)
  - POST /operador/kyc/iniciar               -> sesion Didit presencial
  - GET  /operador/kyc/{session_id}/estado   -> polling decision Didit

La creacion de gestiones (reclamo / tramite / sesion de pago) NO vive aca.
El Mostrador identifica al vecino y redirige a las pantallas existentes
(/gestion/crear-reclamo, /gestion/crear-tramite, /gestion/mis-tasas) con
el query param `?actuando_como=<user_id>`. Esos endpoints aceptan
`actuando_como_user_id` para marcar la solicitud/reclamo como
`canal=ventanilla_asistida` con audit trail del operador (operador_user_id,
validacion_presencial_at, kyc session si aplica). Asi reusamos toda la
logica de wizards (validaciones, IA, geolocalizacion) sin duplicar codigo.

`dj_validacion_presencial` queda como Optional en los schemas para no romper
clientes viejos, pero ya no se exige: el audit trail (quien + cuando + RENAPER
session) cubre la trazabilidad legal sin necesidad de un check redundante.

Permisos: OPERADOR_VENTANILLA | SUPERVISOR | ADMIN del muni.
"""
from datetime import datetime
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.security import get_current_user
from models.user import User
from models.enums import RolUsuario
from models.tramite import Solicitud


router = APIRouter(prefix="/operador", tags=["Operador Ventanilla"])


def _asegurar_operador(user: User) -> None:
    if user.rol not in (RolUsuario.OPERADOR_VENTANILLA, RolUsuario.SUPERVISOR, RolUsuario.ADMIN):
        raise HTTPException(status_code=403, detail="Solo operador de ventanilla, supervisor o admin")


# ============================================================
# 1. Buscador de cliente registrado
# ============================================================

class VecinoEncontrado(BaseModel):
    user_id: int
    dni: str
    nombre: Optional[str]
    apellido: Optional[str]
    email: Optional[str]
    telefono: Optional[str]
    direccion: Optional[str]
    nivel_verificacion: int
    kyc_modo: Optional[str]
    verificado_at: Optional[str]


def _normalizar_dni(dni: str) -> str:
    """Deja solo digitos: '30.217.134' -> '30217134'."""
    return "".join(c for c in (dni or "") if c.isdigit())


def _vecino_out(u: User) -> VecinoEncontrado:
    return VecinoEncontrado(
        user_id=u.id,
        dni=u.dni or "",
        nombre=u.nombre,
        apellido=u.apellido,
        email=u.email,
        telefono=u.telefono,
        direccion=getattr(u, "direccion", None),
        nivel_verificacion=u.nivel_verificacion or 0,
        kyc_modo=u.kyc_modo,
        verificado_at=u.verificado_at.isoformat() if u.verificado_at else None,
    )


@router.get("/vecinos/buscar", response_model=List[VecinoEncontrado])
async def buscar_vecino(
    dni: Optional[str] = None,
    q: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Busca vecinos del muni del operador para identificarlos en ventanilla.

    Params:
      - dni: match exacto por DNI (caso mas comun)
      - q:   busqueda parcial por nombre/apellido/email (fallback)

    Devuelve hasta 8 resultados. Si el DNI no existe, la lista viene vacia
    y el frontend ofrece biometria (Didit) o carga manual.
    """
    _asegurar_operador(current_user)
    if not current_user.municipio_id:
        raise HTTPException(status_code=400, detail="Usuario sin municipio asignado")

    conds = [
        User.rol == RolUsuario.VECINO,
        (User.municipio_id == current_user.municipio_id) | (User.municipio_id.is_(None)),
    ]

    if dni and dni.strip():
        # Match tolerante a formato: compara solo los digitos de ambos lados
        # ('30.217.134' en BD matchea '30217134' tipeado y viceversa).
        dni_norm = _normalizar_dni(dni)
        if not dni_norm:
            raise HTTPException(status_code=400, detail="DNI inválido")
        conds.append(
            func.replace(func.replace(User.dni, ".", ""), " ", "") == dni_norm
        )
    elif q and q.strip():
        like = f"%{q.strip()}%"
        conds.append(
            (User.nombre.ilike(like))
            | (User.apellido.ilike(like))
            | (User.email.ilike(like))
            | (User.dni.ilike(like))
        )
    else:
        raise HTTPException(status_code=400, detail="Pasá dni o q para buscar")

    stmt = select(User).where(and_(*conds)).limit(8)
    r = await db.execute(stmt)
    users = r.scalars().all()

    return [_vecino_out(u) for u in users]


# ============================================================
# 1.bis Alta manual de vecino (sin biometria)
# ============================================================

class AltaManualVecinoRequest(BaseModel):
    # DNI OPCIONAL: para reclamos no se obliga a presentar documento.
    # Sin DNI el vecino queda "a medias" (ghost nivel 0): reclamos si,
    # tramites no (gate 403 kyc_insuficiente en api/tramites.py).
    dni: Optional[str] = None
    nombre: str
    apellido: Optional[str] = None
    telefono: Optional[str] = None
    email: Optional[str] = None
    direccion: Optional[str] = None


@router.post("/vecinos", response_model=VecinoEncontrado)
async def alta_manual_vecino(
    body: AltaManualVecinoRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Alta manual de un vecino desde el Mostrador, SIN validacion biometrica.

    Regla de negocio: el alta simple alcanza para RECLAMOS (y turnos). Para
    TRAMITES la validacion RENAPER del vecino es obligatoria — ese gate vive
    en api/tramites.py (403 kyc_insuficiente) y el vecino creado aca queda en
    nivel_verificacion=0 hasta pasar por el flujo 'Por celular' (Didit).

    Solo el nombre es obligatorio (para reclamos no se exige documento).

    Idempotencia:
      - Con DNI: match por DNI normalizado en el muni (o sin muni).
      - Sin DNI: match por nombre+apellido+telefono (si hay telefono) entre
        los vecinos del muni; sin telefono se crea directo (no hay clave
        confiable para dedupe y preferimos no pisar a un homonimo).
    """
    _asegurar_operador(current_user)
    if not current_user.municipio_id:
        raise HTTPException(status_code=400, detail="Usuario sin municipio asignado")

    dni = _normalizar_dni(body.dni) if body.dni else ""
    if dni and not (6 <= len(dni) <= 9):
        raise HTTPException(status_code=422, detail="DNI inválido (6 a 9 dígitos)")
    nombre = (body.nombre or "").strip()
    apellido = (body.apellido or "").strip()
    telefono = (body.telefono or "").strip() or None
    if not nombre:
        raise HTTPException(status_code=422, detail="El nombre es obligatorio")

    existente = None
    if dni:
        # ¿Ya existe un vecino con ese DNI (en cualquier formato) en este muni?
        q = await db.execute(
            select(User).where(
                func.replace(func.replace(User.dni, ".", ""), " ", "") == dni,
                User.rol == RolUsuario.VECINO,
                (User.municipio_id == current_user.municipio_id) | (User.municipio_id.is_(None)),
            ).limit(1)
        )
        existente = q.scalar_one_or_none()
    elif telefono:
        # Sin DNI: dedupe blando por nombre+apellido+telefono en el muni.
        q = await db.execute(
            select(User).where(
                User.rol == RolUsuario.VECINO,
                User.municipio_id == current_user.municipio_id,
                User.telefono == telefono,
                func.lower(User.nombre) == nombre.lower(),
                func.lower(func.coalesce(User.apellido, "")) == apellido.lower(),
            ).limit(1)
        )
        existente = q.scalar_one_or_none()
    if existente:
        # Completar campos vacios sin pisar lo que ya este cargado.
        for campo, valor in (
            ("nombre", nombre),
            ("apellido", apellido or None),
            ("telefono", telefono),
            ("direccion", (body.direccion or "").strip() or None),
        ):
            if valor and not getattr(existente, campo, None):
                setattr(existente, campo, valor)
        await db.commit()
        await db.refresh(existente)
        return _vecino_out(existente)

    # Email: si el operador cargo uno y esta libre, se usa; si esta tomado
    # por OTRA cuenta, caemos al placeholder (no pisamos cuentas ajenas).
    from secrets import token_hex, token_urlsafe
    from core.security import get_password_hash

    email = (body.email or "").strip().lower() or None
    if email:
        qe = await db.execute(select(User).where(User.email == email).limit(1))
        if qe.scalar_one_or_none() is not None:
            email = None
    if not email:
        # Con DNI el placeholder es deterministico (colision => ya existia);
        # sin DNI no hay clave natural, va token random.
        sufijo = dni if dni else f"anon-{token_hex(6)}"
        email = f"v-{sufijo}-{current_user.municipio_id}@vecino.munify.local"

    nuevo = User(
        email=email,
        password_hash=get_password_hash(token_urlsafe(16)),
        nombre=nombre,
        apellido=apellido,   # puede ir vacio: no se exige para reclamos
        dni=dni or None,
        telefono=telefono,
        direccion=(body.direccion or "").strip() or None,
        rol=RolUsuario.VECINO,
        municipio_id=current_user.municipio_id,
        cuenta_verificada=False,
        nivel_verificacion=0,   # sin RENAPER: sirve para reclamos, no para tramites
        kyc_modo=None,
    )
    try:
        db.add(nuevo)
        await db.commit()
        await db.refresh(nuevo)
        return _vecino_out(nuevo)
    except Exception:
        # Colision de email placeholder (mismo DNI ya tenia ghost): re-buscar.
        await db.rollback()
        q2 = await db.execute(select(User).where(User.email == email).limit(1))
        u = q2.scalar_one_or_none()
        if u is None:
            raise HTTPException(status_code=500, detail="No se pudo crear el vecino")
        return _vecino_out(u)


# ============================================================
# 1.ter Vecino ANONIMO del muni (para reclamos sin identificar)
# ============================================================

@router.post("/vecinos/anonimo", response_model=VecinoEncontrado)
async def vecino_anonimo(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Devuelve (creandolo la primera vez) el vecino-sistema 'Anonimo' del
    muni del operador, para cargar RECLAMOS sin identificar a nadie.

    - Singleton por muni: la clave de idempotencia es el email placeholder
      fijo `anonimo-m{muni}@vecino.munify.local` (email es unique global).
      NO se usa `es_anonimo` como clave porque ese flag tambien lo eligen
      vecinos reales al registrarse.
    - Nace con es_anonimo=True (las notificaciones ya lo saltean) y
      nivel_verificacion=0, asi que TRAMITES quedan bloqueados por el gate
      403 kyc_insuficiente de api/tramites.py — tramites jamas anonimos.
    """
    _asegurar_operador(current_user)
    if not current_user.municipio_id:
        raise HTTPException(status_code=400, detail="Usuario sin municipio asignado")

    email = f"anonimo-m{current_user.municipio_id}@vecino.munify.local"
    q = await db.execute(select(User).where(User.email == email).limit(1))
    u = q.scalar_one_or_none()
    if u:
        return _vecino_out(u)

    from secrets import token_urlsafe
    from core.security import get_password_hash

    u = User(
        email=email,
        password_hash=get_password_hash(token_urlsafe(16)),
        nombre="Vecino",
        apellido="Anónimo",
        rol=RolUsuario.VECINO,
        municipio_id=current_user.municipio_id,
        es_anonimo=True,
        activo=True,
        cuenta_verificada=False,
        nivel_verificacion=0,
        kyc_modo=None,
    )
    try:
        db.add(u)
        await db.commit()
        await db.refresh(u)
        return _vecino_out(u)
    except Exception:
        # Race: otro operador lo creo en paralelo — re-buscar.
        await db.rollback()
        q2 = await db.execute(select(User).where(User.email == email).limit(1))
        u2 = q2.scalar_one_or_none()
        if u2 is None:
            raise HTTPException(status_code=500, detail="No se pudo crear el vecino anónimo")
        return _vecino_out(u2)


# ============================================================
# 2. KYC presencial via Didit
# ============================================================

class IniciarKycRequest(BaseModel):
    municipio_id: int
    callback_url: Optional[str] = None


class IniciarKycResponse(BaseModel):
    session_id: str
    url: str  # URL hosted de Didit (abrir en popup)


class EstadoKycResponse(BaseModel):
    session_id: str
    status: str
    aprobado: bool
    datos: Optional[dict] = None
    motivo_rechazo: Optional[str] = None


def _asegurar_muni(user: User, municipio_id: int) -> None:
    if not user.municipio_id:
        raise HTTPException(status_code=400, detail="Usuario sin municipio asignado")
    if int(user.municipio_id) != int(municipio_id):
        raise HTTPException(status_code=403, detail="No podes operar sobre otro municipio")


@router.post("/kyc/iniciar", response_model=IniciarKycResponse)
async def iniciar_kyc_presencial(
    body: IniciarKycRequest,
    current_user: User = Depends(get_current_user),
):
    """Crea una sesion Didit para validar biometricamente al vecino en
    ventanilla. El frontend hace polling a /kyc/{session_id}/estado."""
    _asegurar_operador(current_user)
    _asegurar_muni(current_user, body.municipio_id)

    from services.didit import crear_sesion as didit_crear_sesion, DiditNotConfigured, DiditError
    try:
        vendor = f"mostrador:{body.municipio_id}:op{current_user.id}"
        data = await didit_crear_sesion(
            vendor_data=vendor,
            callback_url=body.callback_url,
        )
    except DiditNotConfigured as e:
        raise HTTPException(
            status_code=503,
            detail=f"Biometría no disponible: {e}. Cargá los datos a mano.",
        )
    except DiditError as e:
        raise HTTPException(status_code=502, detail=f"Didit: {e}")

    session_id = data.get("session_id") or data.get("id")
    url = data.get("url") or data.get("session_url")
    if not session_id or not url:
        raise HTTPException(status_code=502, detail="Didit no devolvio session_id/url")

    return IniciarKycResponse(session_id=session_id, url=url)


@router.get("/kyc/{session_id}/estado", response_model=EstadoKycResponse)
async def estado_kyc_presencial(
    session_id: str,
    current_user: User = Depends(get_current_user),
):
    """Polling del estado de la sesion Didit. Mientras no este Approved/Declined,
    el frontend reintenta cada 2.5s. Al aprobar, devuelve datos filiatorios
    listos para prellenar el form."""
    _asegurar_operador(current_user)
    from services.didit import (
        consultar_sesion as didit_consultar,
        extraer_datos_filiatorios,
        DiditNotConfigured, DiditError,
    )
    try:
        decision = await didit_consultar(session_id)
    except DiditNotConfigured as e:
        raise HTTPException(status_code=503, detail=str(e))
    except DiditError as e:
        raise HTTPException(status_code=502, detail=f"Didit: {e}")

    status = decision.get("status") or "In Progress"
    aprobado = status == "Approved"

    datos = None
    motivo = None
    if aprobado:
        raw = extraer_datos_filiatorios(decision)
        fn = raw.get("fecha_nacimiento")
        datos = {
            "dni": raw.get("dni"),
            "nombre": raw.get("nombre"),
            "apellido": raw.get("apellido"),
            "sexo": raw.get("sexo"),
            "fecha_nacimiento": fn.isoformat() if fn else None,
            "nacionalidad": raw.get("nacionalidad"),
            "direccion": raw.get("direccion"),
        }
    elif status == "Declined":
        motivo = decision.get("decline_reason") or decision.get("reason") or "Rechazada"

    return EstadoKycResponse(
        session_id=session_id,
        status=status,
        aprobado=aprobado,
        datos=datos,
        motivo_rechazo=motivo,
    )


# ============================================================
# 3. Metricas del operador para el dashboard del mostrador
# ============================================================

class MostradorMetricas(BaseModel):
    tramites_hoy: int
    pagados_hoy: int
    monto_hoy: str
    operador_nombre: str


@router.get("/mostrador/home", response_model=MostradorMetricas)
async def mostrador_home(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _asegurar_operador(current_user)
    # Superadmin en modo Global (sin muni): devolver metricas vacias en
    # lugar de 400 para no romper la pantalla cross-tenant. El mostrador
    # como tal solo tiene sentido dentro de un muni puntual.
    if not current_user.municipio_id:
        return MostradorMetricas(
            tramites_hoy=0,
            pagados_hoy=0,
            monto_hoy="0",
            operador_nombre=current_user.nombre or current_user.email,
        )

    hoy_inicio = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    t_q = await db.execute(
        select(func.count(Solicitud.id)).where(
            Solicitud.operador_user_id == current_user.id,
            Solicitud.created_at >= hoy_inicio,
        )
    )
    tramites_hoy = int(t_q.scalar() or 0)

    from models.pago_sesion import PagoSesion, EstadoSesionPago
    p_q = await db.execute(
        select(func.count(PagoSesion.id), func.coalesce(func.sum(PagoSesion.monto), 0)).where(
            PagoSesion.operador_user_id == current_user.id,
            PagoSesion.estado == EstadoSesionPago.APPROVED,
            PagoSesion.completed_at >= hoy_inicio,
        )
    )
    cant, monto = p_q.one()

    nombre = f"{current_user.nombre or ''} {current_user.apellido or ''}".strip() or current_user.email

    return MostradorMetricas(
        tramites_hoy=tramites_hoy,
        pagados_hoy=int(cant or 0),
        monto_hoy=str(monto or 0),
        operador_nombre=nombre,
    )
