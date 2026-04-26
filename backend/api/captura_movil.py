"""Captura móvil — handoff PC ↔ celular para validar identidad con Didit.

Diseño:
  - El operador inicia una sesión desde el Mostrador. Se crea una row en
    `captura_movil_sesiones` y, en el mismo paso, una sesión Didit con
    `vendor_data = handoff_token` para correlacionar.
  - El backend devuelve `{ handoff_token, qr_value, didit_url, expires_at }`.
  - El celular escanea el QR → `GET /m/captura/:token` (página pública) →
    obtiene la `didit_url` y redirige. Didit hace selfie + DNI + RENAPER.
  - La PC del operador escucha por WebSocket. Como fallback, también
    pollea `GET /api/captura-movil/:token/estado` (autenticado) cada 3s.
    Ese endpoint, si la sesión sigue abierta y hay `didit_session_id`,
    consulta Didit; si terminó, persiste y emite el WS.
  - `expires_at = created_at + 10 min`. Tras eso, se marca expirada.
"""
import random
from datetime import date, datetime, timedelta
from secrets import token_urlsafe
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from core.database import get_db
from core.security import get_current_user
from core.websocket import manager, WSEvents
from models.captura_movil_sesion import (
    CapturaMovilSesion,
    EstadoCapturaMovil,
    ModoCapturaMovil,
)
from models.user import User
from models.enums import RolUsuario


router = APIRouter(prefix="/captura-movil", tags=["Captura Móvil"])


SESSION_TTL_MIN = 10
ESTADOS_TERMINALES = {
    EstadoCapturaMovil.COMPLETADA,
    EstadoCapturaMovil.RECHAZADA,
    EstadoCapturaMovil.CANCELADA,
    EstadoCapturaMovil.EXPIRADA,
}

# Pool de datos random para el modo demo (VENTANILLA_SKIP_DIDIT=true).
_FAKE_NOMBRES_M = [
    "Juan", "Carlos", "Diego", "Martín", "Lucas", "Federico", "Hernán",
    "Matías", "Sebastián", "Pablo", "Nicolás", "Andrés", "Gonzalo", "Tomás",
]
_FAKE_NOMBRES_F = [
    "María", "Lucía", "Sofía", "Camila", "Valentina", "Carolina", "Florencia",
    "Julieta", "Agustina", "Romina", "Paula", "Daniela", "Mariana", "Belén",
]
_FAKE_APELLIDOS = [
    "García", "Rodríguez", "López", "Fernández", "Martínez", "González",
    "Pérez", "Sánchez", "Romero", "Sosa", "Álvarez", "Torres", "Ruiz",
    "Domínguez", "Ramos", "Acosta", "Méndez", "Castro", "Ortiz", "Suárez",
]


async def _resolver_o_crear_vecino(
    db: AsyncSession,
    sesion: CapturaMovilSesion,
    payload: dict,
) -> Optional[int]:
    """Tras una captura aprobada, encuentra o crea el User del vecino para
    que el operador pueda iniciar reclamos/trámites/tasas en su nombre.

    - Busca por DNI en el muni del operador (o sin muni asignado).
    - Si existe: bump nivel_verificacion=2, kyc_modo=assisted, completa
      filiatorios faltantes.
    - Si no existe: crea ghost (cuenta_verificada=True, kyc_modo=assisted,
      email placeholder único, password aleatorio no-recuperable). El
      vecino real podrá "reclamar" la cuenta más adelante por DNI+email.

    Devuelve el user_id o None si no hay DNI capturado.
    """
    dni = (payload.get("dni") or "").strip()
    if not dni:
        return None

    # Buscar existente
    q = await db.execute(
        select(User).where(
            User.dni == dni,
            User.rol == RolUsuario.VECINO,
            (User.municipio_id == sesion.municipio_id) | (User.municipio_id.is_(None)),
        ).limit(1)
    )
    existente = q.scalar_one_or_none()

    fn_date = None
    fn_str = payload.get("fecha_nacimiento")
    if fn_str:
        try:
            fn_date = date.fromisoformat(fn_str)
        except (ValueError, TypeError):
            fn_date = None

    if existente:
        cambios = False
        if (existente.nivel_verificacion or 0) < 2:
            existente.nivel_verificacion = 2
            existente.kyc_modo = "assisted"
            existente.kyc_operador_id = sesion.operador_user_id
            existente.verificado_at = datetime.utcnow()
            existente.cuenta_verificada = True
            cambios = True
        # Completar campos vacíos sin pisar lo que ya esté cargado
        for campo, valor in (
            ("nombre", payload.get("nombre")),
            ("apellido", payload.get("apellido")),
            ("sexo", payload.get("sexo")),
            ("nacionalidad", payload.get("nacionalidad")),
        ):
            if valor and not getattr(existente, campo, None):
                setattr(existente, campo, valor)
                cambios = True
        if fn_date and not existente.fecha_nacimiento:
            existente.fecha_nacimiento = fn_date
            cambios = True
        if cambios:
            await db.commit()
            await db.refresh(existente)
        return existente.id

    # Crear ghost
    from core.security import get_password_hash

    placeholder_email = f"v-{dni}-{sesion.municipio_id or 0}@vecino.munify.local"
    nuevo = User(
        email=placeholder_email,
        password_hash=get_password_hash(token_urlsafe(16)),
        nombre=payload.get("nombre") or "",
        apellido=payload.get("apellido") or "",
        dni=dni,
        sexo=payload.get("sexo"),
        fecha_nacimiento=fn_date,
        nacionalidad=payload.get("nacionalidad"),
        rol=RolUsuario.VECINO,
        municipio_id=sesion.municipio_id,
        cuenta_verificada=True,
        nivel_verificacion=2,
        kyc_modo="assisted",
        kyc_operador_id=sesion.operador_user_id,
        verificado_at=datetime.utcnow(),
    )
    try:
        db.add(nuevo)
        await db.commit()
        await db.refresh(nuevo)
        return nuevo.id
    except Exception:
        # Colisión de email (mismo DNI ya tenía ghost). Rollback y re-buscar.
        await db.rollback()
        q2 = await db.execute(
            select(User).where(User.email == placeholder_email).limit(1)
        )
        u = q2.scalar_one_or_none()
        return u.id if u else None


def _fake_filiatorios() -> dict:
    """Genera un set de datos filiatorios random pero coherente."""
    sexo = random.choice(["M", "F"])
    nombre = random.choice(_FAKE_NOMBRES_M if sexo == "M" else _FAKE_NOMBRES_F)
    apellido = random.choice(_FAKE_APELLIDOS)
    # DNI argentino realista (nacidos 1960-2005 ≈ rango 12M – 47M)
    dni_num = random.randint(20_000_000, 47_000_000)
    # Fecha de nacimiento entre 18 y 75 años atrás
    hoy = date.today()
    edad = random.randint(18, 75)
    nac_year = hoy.year - edad
    nac_month = random.randint(1, 12)
    nac_day = random.randint(1, 28)
    fecha_nac = date(nac_year, nac_month, nac_day)
    return {
        "dni": str(dni_num),
        "nombre": nombre,
        "apellido": apellido,
        "sexo": sexo,
        "fecha_nacimiento": fecha_nac.isoformat(),
        "nacionalidad": "ARG",
        "direccion": None,
        "didit_status": "Approved",
    }


def _asegurar_operador(user: User) -> None:
    if user.rol not in (RolUsuario.OPERADOR_VENTANILLA, RolUsuario.SUPERVISOR, RolUsuario.ADMIN):
        raise HTTPException(status_code=403, detail="Solo operador, supervisor o admin")


def _frontend_base() -> str:
    base = (settings.FRONTEND_URL or "").rstrip("/")
    if not base:
        base = "http://localhost:5173"
    return base


# ============================================================
# Schemas
# ============================================================

class IniciarRequest(BaseModel):
    vecino_user_id: Optional[int] = None
    vecino_dni: Optional[str] = None
    vecino_label: Optional[str] = None  # cosmético — para mostrar en el celu


class IniciarResponse(BaseModel):
    handoff_token: str
    qr_value: str               # URL que codifica el QR
    didit_url: str              # URL hosted de Didit (por si el celu ya tiene token operador)
    expires_at: str             # ISO 8601


class EstadoResponse(BaseModel):
    handoff_token: str
    estado: str
    modo: str
    vecino_label: Optional[str] = None
    didit_session_id: Optional[str] = None
    didit_url: Optional[str] = None
    payload: Optional[dict] = None
    motivo_rechazo: Optional[str] = None
    expires_at: str
    completed_at: Optional[str] = None


# ============================================================
# Helpers
# ============================================================

def _serializar_sesion(s: CapturaMovilSesion) -> dict:
    return {
        "handoff_token": s.handoff_token,
        "estado": (s.estado.value if hasattr(s.estado, "value") else str(s.estado)),
        "modo": (s.modo.value if hasattr(s.modo, "value") else str(s.modo)),
        "vecino_label": (s.payload_json or {}).get("vecino_label") if s.payload_json else None,
        "didit_session_id": s.didit_session_id,
        "didit_url": s.didit_url,
        "payload": s.payload_json,
        "motivo_rechazo": s.motivo_rechazo,
        "expires_at": s.expires_at.isoformat() if s.expires_at else "",
        "completed_at": s.completed_at.isoformat() if s.completed_at else None,
    }


async def _consultar_didit_y_persistir(
    db: AsyncSession,
    sesion: CapturaMovilSesion,
) -> CapturaMovilSesion:
    """Si la sesión está abierta y hay didit_session_id, consulta a Didit.
    Si terminó, persiste el resultado y emite el WS al operador.
    Devuelve la sesión actualizada (puede ser la misma row, ya refrescada).
    """
    if sesion.estado in ESTADOS_TERMINALES:
        return sesion

    # ¿Expiró?
    if sesion.expires_at and datetime.utcnow() >= sesion.expires_at.replace(tzinfo=None):
        sesion.estado = EstadoCapturaMovil.EXPIRADA
        sesion.completed_at = datetime.utcnow()
        await db.commit()
        await db.refresh(sesion)
        return sesion

    if not sesion.didit_session_id:
        return sesion

    # Modo DEMO: las sesiones con session_id "fake:..." se resuelven solo
    # cuando la página fake llama a /handoff/{token}/fake-completar — NO se
    # consulta a Didit.
    if sesion.didit_session_id.startswith("fake:"):
        return sesion

    # Consulto Didit
    from services.didit import (
        consultar_sesion as didit_consultar,
        extraer_datos_filiatorios,
        DiditError,
        DiditNotConfigured,
    )
    try:
        decision = await didit_consultar(sesion.didit_session_id)
    except (DiditError, DiditNotConfigured):
        # No piso el estado — el polling vuelve a intentar
        return sesion

    status = decision.get("status") or "In Progress"

    # Persist progreso (opcional) si pasó de esperando → en_curso
    if status == "In Progress" and sesion.estado == EstadoCapturaMovil.ESPERANDO:
        sesion.estado = EstadoCapturaMovil.EN_CURSO
        await db.commit()
        await db.refresh(sesion)
        await manager.send_to_user(sesion.operador_user_id, {
            "type": WSEvents.CAPTURA_MOVIL_PROGRESO,
            "data": _serializar_sesion(sesion),
        })
        return sesion

    if status == "Approved":
        raw = extraer_datos_filiatorios(decision)
        fn = raw.get("fecha_nacimiento")
        payload = {
            "dni": raw.get("dni"),
            "nombre": raw.get("nombre"),
            "apellido": raw.get("apellido"),
            "sexo": raw.get("sexo"),
            "fecha_nacimiento": fn.isoformat() if fn else None,
            "nacionalidad": raw.get("nacionalidad"),
            "direccion": raw.get("direccion"),
            "didit_status": "Approved",
        }
        # Conservo vecino_label si lo había
        if sesion.payload_json and "vecino_label" in sesion.payload_json:
            payload["vecino_label"] = sesion.payload_json["vecino_label"]

        # Resolver/crear el User para que el operador pueda actuar en su nombre
        user_id = await _resolver_o_crear_vecino(db, sesion, payload)
        if user_id:
            payload["user_id"] = user_id
            sesion.vecino_user_id = user_id

        sesion.estado = EstadoCapturaMovil.COMPLETADA
        sesion.payload_json = payload
        sesion.didit_decision_json = decision
        sesion.completed_at = datetime.utcnow()
        await db.commit()
        await db.refresh(sesion)
        await manager.send_to_user(sesion.operador_user_id, {
            "type": WSEvents.CAPTURA_MOVIL_COMPLETADA,
            "data": _serializar_sesion(sesion),
        })
        return sesion

    if status in ("Declined", "Failed", "Expired"):
        sesion.estado = EstadoCapturaMovil.RECHAZADA
        sesion.motivo_rechazo = (
            decision.get("decline_reason") or decision.get("reason") or status
        )
        sesion.didit_decision_json = decision
        sesion.completed_at = datetime.utcnow()
        await db.commit()
        await db.refresh(sesion)
        await manager.send_to_user(sesion.operador_user_id, {
            "type": WSEvents.CAPTURA_MOVIL_RECHAZADA,
            "data": _serializar_sesion(sesion),
        })
        return sesion

    return sesion


# ============================================================
# Endpoints — operador
# ============================================================

@router.post("/iniciar", response_model=IniciarResponse)
async def iniciar(
    body: IniciarRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Crea una sesión de captura móvil + sesión Didit, devuelve QR y URL."""
    _asegurar_operador(current_user)

    # Genero token
    handoff_token = token_urlsafe(24)  # ~32 chars

    if settings.VENTANILLA_SKIP_DIDIT:
        # Modo DEMO: la URL apunta a una pantalla fake interna, no a Didit.
        # session_id usa prefijo "fake:" para distinguir y para que el polling
        # sepa que no tiene que llamar a Didit.
        didit_session_id = f"fake:{handoff_token}"
        didit_url = f"{_frontend_base()}/m/captura/{handoff_token}/fake"
    else:
        # Creo la sesión Didit con vendor_data = token (pegamento)
        from services.didit import (
            crear_sesion as didit_crear_sesion,
            DiditNotConfigured,
            DiditError,
        )
        try:
            decision = await didit_crear_sesion(
                vendor_data=f"capmov:{handoff_token}",
            )
        except DiditNotConfigured as e:
            raise HTTPException(
                status_code=503,
                detail=f"Biometría no disponible: {e}",
            )
        except DiditError as e:
            raise HTTPException(status_code=502, detail=f"Didit: {e}")

        didit_session_id = decision.get("session_id") or decision.get("id")
        didit_url = decision.get("url") or decision.get("session_url")
        if not didit_session_id or not didit_url:
            raise HTTPException(status_code=502, detail="Didit no devolvió session_id/url")

    expires_at = datetime.utcnow() + timedelta(minutes=SESSION_TTL_MIN)

    payload_json = None
    if body.vecino_label:
        payload_json = {"vecino_label": body.vecino_label}

    sesion = CapturaMovilSesion(
        handoff_token=handoff_token,
        operador_user_id=current_user.id,
        municipio_id=current_user.municipio_id,
        vecino_user_id=body.vecino_user_id,
        vecino_dni=body.vecino_dni,
        modo=ModoCapturaMovil.KYC_COMPLETO,
        estado=EstadoCapturaMovil.ESPERANDO,
        didit_session_id=didit_session_id,
        didit_url=didit_url,
        payload_json=payload_json,
        expires_at=expires_at,
    )
    db.add(sesion)
    await db.commit()
    await db.refresh(sesion)

    qr_value = f"{_frontend_base()}/m/captura/{handoff_token}"

    # Echo por WS al operador (por si tiene varias pestañas abiertas)
    await manager.send_to_user(current_user.id, {
        "type": WSEvents.CAPTURA_MOVIL_INICIADA,
        "data": _serializar_sesion(sesion),
    })

    return IniciarResponse(
        handoff_token=handoff_token,
        qr_value=qr_value,
        didit_url=didit_url,
        expires_at=expires_at.isoformat(),
    )


@router.get("/{handoff_token}/estado", response_model=EstadoResponse)
async def estado_para_operador(
    handoff_token: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Polling autenticado del operador. Si la sesión sigue abierta, consulta
    Didit y avanza el estado si corresponde."""
    _asegurar_operador(current_user)

    r = await db.execute(
        select(CapturaMovilSesion).where(CapturaMovilSesion.handoff_token == handoff_token)
    )
    sesion = r.scalar_one_or_none()
    if not sesion:
        raise HTTPException(status_code=404, detail="Sesión no encontrada")

    # Solo el operador que la creó puede consultarla
    if sesion.operador_user_id != current_user.id:
        raise HTTPException(status_code=403, detail="No te pertenece esta sesión")

    sesion = await _consultar_didit_y_persistir(db, sesion)
    return EstadoResponse(**_serializar_sesion(sesion))


@router.post("/{handoff_token}/cancelar", response_model=EstadoResponse)
async def cancelar(
    handoff_token: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """El operador cancela desde la PC."""
    _asegurar_operador(current_user)

    r = await db.execute(
        select(CapturaMovilSesion).where(CapturaMovilSesion.handoff_token == handoff_token)
    )
    sesion = r.scalar_one_or_none()
    if not sesion:
        raise HTTPException(status_code=404, detail="Sesión no encontrada")
    if sesion.operador_user_id != current_user.id:
        raise HTTPException(status_code=403, detail="No te pertenece esta sesión")

    if sesion.estado not in ESTADOS_TERMINALES:
        sesion.estado = EstadoCapturaMovil.CANCELADA
        sesion.completed_at = datetime.utcnow()
        await db.commit()
        await db.refresh(sesion)
        await manager.send_to_user(sesion.operador_user_id, {
            "type": WSEvents.CAPTURA_MOVIL_CANCELADA,
            "data": _serializar_sesion(sesion),
        })

    return EstadoResponse(**_serializar_sesion(sesion))


# ============================================================
# Endpoints — celular (público, autenticado por el token mismo)
# ============================================================

class HandoffPublicResponse(BaseModel):
    handoff_token: str
    estado: str
    modo: str
    vecino_label: Optional[str] = None
    didit_url: Optional[str] = None
    expires_at: str


@router.get("/handoff/{handoff_token}", response_model=HandoffPublicResponse)
async def handoff_publico(
    handoff_token: str,
    db: AsyncSession = Depends(get_db),
):
    """Endpoint público que la página móvil llama al cargar el QR. Solo
    expone lo mínimo: estado + URL de Didit. No expone IDs internos.
    El token mismo es la credencial — es opaco, single-use, expira en 10min.
    """
    r = await db.execute(
        select(CapturaMovilSesion).where(CapturaMovilSesion.handoff_token == handoff_token)
    )
    sesion = r.scalar_one_or_none()
    if not sesion:
        raise HTTPException(status_code=404, detail="Sesión no encontrada o expirada")

    # Si ya se cerró, devuelvo igual el estado para que la página móvil
    # muestre un cartel apropiado.
    return HandoffPublicResponse(
        handoff_token=sesion.handoff_token,
        estado=(sesion.estado.value if hasattr(sesion.estado, "value") else str(sesion.estado)),
        modo=(sesion.modo.value if hasattr(sesion.modo, "value") else str(sesion.modo)),
        vecino_label=(sesion.payload_json or {}).get("vecino_label") if sesion.payload_json else None,
        didit_url=sesion.didit_url,
        expires_at=sesion.expires_at.isoformat() if sesion.expires_at else "",
    )


@router.post("/handoff/{handoff_token}/fake-completar", response_model=HandoffPublicResponse)
async def handoff_fake_completar(
    handoff_token: str,
    db: AsyncSession = Depends(get_db),
):
    """Modo DEMO: la pantalla fake del celular llama a este endpoint cuando
    el operador apretó "Confirmar". Genera datos filiatorios random y
    marca la sesión como completada (igual que si Didit la hubiera aprobado).

    Solo funciona si VENTANILLA_SKIP_DIDIT está activado en settings.
    """
    if not settings.VENTANILLA_SKIP_DIDIT:
        raise HTTPException(
            status_code=403,
            detail="Modo demo desactivado (VENTANILLA_SKIP_DIDIT=false)",
        )

    r = await db.execute(
        select(CapturaMovilSesion).where(CapturaMovilSesion.handoff_token == handoff_token)
    )
    sesion = r.scalar_one_or_none()
    if not sesion:
        raise HTTPException(status_code=404, detail="Sesión no encontrada")

    # Idempotente: si ya estaba completada, devuelvo el estado actual
    if sesion.estado == EstadoCapturaMovil.COMPLETADA:
        return HandoffPublicResponse(
            handoff_token=sesion.handoff_token,
            estado=sesion.estado.value,
            modo=sesion.modo.value,
            vecino_label=(sesion.payload_json or {}).get("vecino_label"),
            didit_url=sesion.didit_url,
            expires_at=sesion.expires_at.isoformat() if sesion.expires_at else "",
        )

    if sesion.estado in ESTADOS_TERMINALES:
        raise HTTPException(status_code=409, detail=f"La sesión está {sesion.estado.value}")

    # Genero datos filiatorios random
    payload = _fake_filiatorios()
    # Conservo vecino_label si lo había
    if sesion.payload_json and "vecino_label" in sesion.payload_json:
        payload["vecino_label"] = sesion.payload_json["vecino_label"]

    # Resolver/crear el User para que el operador pueda actuar en su nombre
    user_id = await _resolver_o_crear_vecino(db, sesion, payload)
    if user_id:
        payload["user_id"] = user_id
        sesion.vecino_user_id = user_id

    sesion.estado = EstadoCapturaMovil.COMPLETADA
    sesion.payload_json = payload
    sesion.didit_decision_json = {"fake": True, "generated_at": datetime.utcnow().isoformat()}
    sesion.completed_at = datetime.utcnow()
    await db.commit()
    await db.refresh(sesion)

    await manager.send_to_user(sesion.operador_user_id, {
        "type": WSEvents.CAPTURA_MOVIL_COMPLETADA,
        "data": _serializar_sesion(sesion),
    })

    return HandoffPublicResponse(
        handoff_token=sesion.handoff_token,
        estado=sesion.estado.value,
        modo=sesion.modo.value,
        vecino_label=payload.get("vecino_label"),
        didit_url=sesion.didit_url,
        expires_at=sesion.expires_at.isoformat() if sesion.expires_at else "",
    )


@router.post("/handoff/{handoff_token}/abrir", response_model=HandoffPublicResponse)
async def handoff_marcar_abierta(
    handoff_token: str,
    db: AsyncSession = Depends(get_db),
):
    """La página móvil llama esto al redirigir a Didit, para marcar que
    el celu agarró el handoff. Idempotente."""
    r = await db.execute(
        select(CapturaMovilSesion).where(CapturaMovilSesion.handoff_token == handoff_token)
    )
    sesion = r.scalar_one_or_none()
    if not sesion:
        raise HTTPException(status_code=404, detail="Sesión no encontrada")

    if sesion.estado == EstadoCapturaMovil.ESPERANDO:
        sesion.estado = EstadoCapturaMovil.EN_CURSO
        await db.commit()
        await db.refresh(sesion)
        await manager.send_to_user(sesion.operador_user_id, {
            "type": WSEvents.CAPTURA_MOVIL_PROGRESO,
            "data": _serializar_sesion(sesion),
        })

    return HandoffPublicResponse(
        handoff_token=sesion.handoff_token,
        estado=(sesion.estado.value if hasattr(sesion.estado, "value") else str(sesion.estado)),
        modo=(sesion.modo.value if hasattr(sesion.modo, "value") else str(sesion.modo)),
        vecino_label=(sesion.payload_json or {}).get("vecino_label") if sesion.payload_json else None,
        didit_url=sesion.didit_url,
        expires_at=sesion.expires_at.isoformat() if sesion.expires_at else "",
    )
