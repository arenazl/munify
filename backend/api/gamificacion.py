"""
API de Gamificación
Endpoints para puntos, badges, leaderboard y recompensas
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import Optional, List
from datetime import datetime
import secrets

from core.database import get_db
from core.security import get_current_user, require_roles
from models.user import User
from models.zona import Zona
from models.enums import RolUsuario
from models.gamificacion import (
    PuntosUsuario, BadgeUsuario, HistorialPuntos,
    RecompensaDisponible, RecompensaCanjeada,
    TipoBadge, BADGES_CONFIG
)
from schemas.gamificacion import (
    PerfilGamificacion, LeaderboardResponse, LeaderboardEntry,
    BadgeResponse, BadgeConfig, BadgesConfigResponse,
    RecompensaCreate, RecompensaResponse, RecompensaCanjeadaResponse,
    CanjearRecompensaRequest, AccionGamificacionResponse
)
from services.gamificacion_service import GamificacionService

router = APIRouter()


# ========== PERFIL Y PUNTOS ==========

@router.get("/mi-perfil", response_model=PerfilGamificacion)
async def get_mi_perfil_gamificacion(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Obtiene el perfil de gamificación del usuario actual"""
    return await GamificacionService.get_perfil_gamificacion(
        db, current_user.id, current_user.municipio_id
    )


@router.get("/perfil/{user_id}", response_model=PerfilGamificacion)
async def get_perfil_usuario(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Obtiene el perfil de gamificación de un usuario (visible para todos)"""
    # Verificar que el usuario existe y es del mismo municipio
    result = await db.execute(
        select(User).where(
            User.id == user_id,
            User.municipio_id == current_user.municipio_id
        )
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    return await GamificacionService.get_perfil_gamificacion(
        db, user_id, current_user.municipio_id
    )


@router.get("/mis-puntos")
async def get_mis_puntos(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Obtiene solo los puntos del usuario actual (endpoint ligero)"""
    puntos = await GamificacionService.get_or_create_puntos_usuario(
        db, current_user.id, current_user.municipio_id
    )
    nivel = (puntos.puntos_totales // 100) + 1

    return {
        "puntos_totales": puntos.puntos_totales,
        "puntos_mes_actual": puntos.puntos_mes_actual,
        "nivel": nivel,
        "reclamos_totales": puntos.reclamos_totales,
    }


# ========== BADGES ==========

@router.get("/mis-badges", response_model=List[BadgeResponse])
async def get_mis_badges(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Obtiene los badges del usuario actual"""
    result = await db.execute(
        select(BadgeUsuario).where(
            BadgeUsuario.user_id == current_user.id,
            BadgeUsuario.municipio_id == current_user.municipio_id
        ).order_by(BadgeUsuario.obtenido_en.desc())
    )
    badges = result.scalars().all()

    return [
        {
            "tipo": badge.tipo_badge.value,
            "obtenido_en": badge.obtenido_en,
            **BADGES_CONFIG.get(badge.tipo_badge, {})
        }
        for badge in badges
    ]


@router.get("/badges-disponibles", response_model=BadgesConfigResponse)
async def get_badges_disponibles():
    """Obtiene todos los badges disponibles en el sistema"""
    return {
        "badges": [
            {"tipo": tipo.value, **config}
            for tipo, config in BADGES_CONFIG.items()
        ]
    }


# ========== LEADERBOARD ==========

@router.get("/leaderboard", response_model=LeaderboardResponse)
async def get_leaderboard(
    zona_id: Optional[int] = Query(None, description="Filtrar por zona"),
    periodo: str = Query("mes", description="Período: 'mes' o 'total'"),
    limite: int = Query(10, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Obtiene el leaderboard de usuarios"""
    usuarios = await GamificacionService.get_leaderboard(
        db,
        current_user.municipio_id,
        zona_id=zona_id,
        limite=limite,
        periodo=periodo
    )

    zona_nombre = None
    if zona_id:
        result = await db.execute(
            select(Zona.nombre).where(Zona.id == zona_id)
        )
        zona_nombre = result.scalar_one_or_none()

    return {
        "periodo": periodo,
        "zona_id": zona_id,
        "zona_nombre": zona_nombre,
        "usuarios": usuarios
    }


@router.get("/mi-posicion")
async def get_mi_posicion(
    periodo: str = Query("mes", description="Período: 'mes' o 'total'"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Obtiene la posición del usuario actual en el leaderboard"""
    leaderboard = await GamificacionService.get_leaderboard(
        db, current_user.municipio_id, limite=100, periodo=periodo
    )

    mi_posicion = next(
        (item for item in leaderboard if item["user_id"] == current_user.id),
        None
    )

    if mi_posicion:
        return mi_posicion
    else:
        # Usuario no está en el top 100, calcular su posición real
        puntos = await GamificacionService.get_or_create_puntos_usuario(
            db, current_user.id, current_user.municipio_id
        )

        # Contar cuántos usuarios tienen más puntos
        puntos_campo = PuntosUsuario.puntos_mes_actual if periodo == "mes" else PuntosUsuario.puntos_totales
        result = await db.execute(
            select(func.count(PuntosUsuario.id)).where(
                PuntosUsuario.municipio_id == current_user.municipio_id,
                puntos_campo > (puntos.puntos_mes_actual if periodo == "mes" else puntos.puntos_totales)
            )
        )
        usuarios_arriba = result.scalar() or 0

        return {
            "posicion": usuarios_arriba + 1,
            "user_id": current_user.id,
            "nombre": f"{current_user.nombre} {current_user.apellido[:1]}.",
            "puntos": puntos.puntos_mes_actual if periodo == "mes" else puntos.puntos_totales,
            "puntos_totales": puntos.puntos_totales,
            "reclamos": puntos.reclamos_totales,
            "badges": 0  # TODO: contar badges
        }


# ========== HISTORIAL ==========

@router.get("/historial")
async def get_historial_puntos(
    limite: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Obtiene el historial de puntos del usuario"""
    result = await db.execute(
        select(HistorialPuntos).where(
            HistorialPuntos.user_id == current_user.id,
            HistorialPuntos.municipio_id == current_user.municipio_id
        ).order_by(HistorialPuntos.created_at.desc()).limit(limite)
    )
    historial = result.scalars().all()

    return [
        {
            "id": h.id,
            "tipo": h.tipo_accion.value,
            "puntos": h.puntos,
            "descripcion": h.descripcion,
            "reclamo_id": h.reclamo_id,
            "fecha": h.created_at.isoformat() if h.created_at else None
        }
        for h in historial
    ]


# ========== RECOMPENSAS ==========

@router.get("/recompensas", response_model=List[RecompensaResponse])
async def get_recompensas_disponibles(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Obtiene las recompensas disponibles para canjear"""
    ahora = datetime.utcnow()

    result = await db.execute(
        select(RecompensaDisponible).where(
            RecompensaDisponible.municipio_id == current_user.municipio_id,
            RecompensaDisponible.activo == True
        ).order_by(RecompensaDisponible.puntos_requeridos)
    )
    recompensas = result.scalars().all()

    # Filtrar por fecha
    return [
        r for r in recompensas
        if (r.fecha_inicio is None or r.fecha_inicio <= ahora)
        and (r.fecha_fin is None or r.fecha_fin >= ahora)
        and (r.stock is None or r.stock > 0)
    ]


@router.post("/recompensas/canjear")
async def canjear_recompensa(
    request: CanjearRecompensaRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Canjea una recompensa por puntos"""
    # Obtener recompensa
    result = await db.execute(
        select(RecompensaDisponible).where(
            RecompensaDisponible.id == request.recompensa_id,
            RecompensaDisponible.municipio_id == current_user.municipio_id,
            RecompensaDisponible.activo == True
        )
    )
    recompensa = result.scalar_one_or_none()

    if not recompensa:
        raise HTTPException(status_code=404, detail="Recompensa no encontrada")

    # Verificar stock
    if recompensa.stock is not None and recompensa.stock <= 0:
        raise HTTPException(status_code=400, detail="Recompensa agotada")

    # Verificar puntos del usuario
    puntos = await GamificacionService.get_or_create_puntos_usuario(
        db, current_user.id, current_user.municipio_id
    )

    if puntos.puntos_totales < recompensa.puntos_requeridos:
        raise HTTPException(
            status_code=400,
            detail=f"Puntos insuficientes. Necesitás {recompensa.puntos_requeridos}, tenés {puntos.puntos_totales}"
        )

    # Crear canje
    codigo = secrets.token_hex(8).upper()
    canje = RecompensaCanjeada(
        user_id=current_user.id,
        recompensa_id=recompensa.id,
        municipio_id=current_user.municipio_id,
        puntos_gastados=recompensa.puntos_requeridos,
        codigo_canje=codigo
    )
    db.add(canje)

    # Descontar puntos
    puntos.puntos_totales -= recompensa.puntos_requeridos

    # Descontar stock
    if recompensa.stock is not None:
        recompensa.stock -= 1

    await db.commit()

    return {
        "mensaje": "Recompensa canjeada exitosamente",
        "codigo_canje": codigo,
        "puntos_restantes": puntos.puntos_totales
    }


@router.get("/mis-canjes", response_model=List[RecompensaCanjeadaResponse])
async def get_mis_canjes(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Obtiene el historial de canjes del usuario"""
    result = await db.execute(
        select(RecompensaCanjeada).where(
            RecompensaCanjeada.user_id == current_user.id
        ).order_by(RecompensaCanjeada.canjeado_en.desc())
    )
    return result.scalars().all()


# ========== ADMIN ==========

@router.post("/recompensas", response_model=RecompensaResponse)
async def crear_recompensa(
    recompensa: RecompensaCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([RolUsuario.ADMIN, RolUsuario.SUPERVISOR]))
):
    """Crea una nueva recompensa (solo admin/supervisor)"""
    nueva = RecompensaDisponible(
        municipio_id=current_user.municipio_id,
        nombre=recompensa.nombre,
        descripcion=recompensa.descripcion,
        icono=recompensa.icono,
        puntos_requeridos=recompensa.puntos_requeridos,
        stock=recompensa.stock,
        fecha_inicio=recompensa.fecha_inicio,
        fecha_fin=recompensa.fecha_fin
    )
    db.add(nueva)
    await db.commit()
    await db.refresh(nueva)
    return nueva


@router.put("/recompensas/{recompensa_id}", response_model=RecompensaResponse)
async def actualizar_recompensa(
    recompensa_id: int,
    recompensa: RecompensaCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([RolUsuario.ADMIN, RolUsuario.SUPERVISOR]))
):
    """Actualiza una recompensa existente"""
    result = await db.execute(
        select(RecompensaDisponible).where(
            RecompensaDisponible.id == recompensa_id,
            RecompensaDisponible.municipio_id == current_user.municipio_id
        )
    )
    existing = result.scalar_one_or_none()

    if not existing:
        raise HTTPException(status_code=404, detail="Recompensa no encontrada")

    existing.nombre = recompensa.nombre
    existing.descripcion = recompensa.descripcion
    existing.icono = recompensa.icono
    existing.puntos_requeridos = recompensa.puntos_requeridos
    existing.stock = recompensa.stock
    existing.fecha_inicio = recompensa.fecha_inicio
    existing.fecha_fin = recompensa.fecha_fin

    await db.commit()
    await db.refresh(existing)
    return existing


@router.delete("/recompensas/{recompensa_id}")
async def eliminar_recompensa(
    recompensa_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([RolUsuario.ADMIN, RolUsuario.SUPERVISOR]))
):
    """Desactiva una recompensa"""
    result = await db.execute(
        select(RecompensaDisponible).where(
            RecompensaDisponible.id == recompensa_id,
            RecompensaDisponible.municipio_id == current_user.municipio_id
        )
    )
    recompensa = result.scalar_one_or_none()

    if not recompensa:
        raise HTTPException(status_code=404, detail="Recompensa no encontrada")

    recompensa.activo = False
    await db.commit()

    return {"mensaje": "Recompensa desactivada"}


@router.post("/admin/entregar-canje/{canje_id}")
async def entregar_canje(
    canje_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([RolUsuario.ADMIN, RolUsuario.SUPERVISOR]))
):
    """Marca un canje como entregado"""
    result = await db.execute(
        select(RecompensaCanjeada).where(
            RecompensaCanjeada.id == canje_id,
            RecompensaCanjeada.municipio_id == current_user.municipio_id
        )
    )
    canje = result.scalar_one_or_none()

    if not canje:
        raise HTTPException(status_code=404, detail="Canje no encontrado")

    canje.estado = "entregado"
    canje.entregado_en = datetime.utcnow()
    await db.commit()

    return {"mensaje": "Canje marcado como entregado"}


@router.get("/admin/canjes-pendientes")
async def get_canjes_pendientes(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([RolUsuario.ADMIN, RolUsuario.SUPERVISOR]))
):
    """Obtiene los canjes pendientes de entrega"""
    result = await db.execute(
        select(RecompensaCanjeada).where(
            RecompensaCanjeada.municipio_id == current_user.municipio_id,
            RecompensaCanjeada.estado == "pendiente"
        ).order_by(RecompensaCanjeada.canjeado_en)
    )
    canjes = result.scalars().all()

    return [
        {
            "id": c.id,
            "user_id": c.user_id,
            "recompensa_id": c.recompensa_id,
            "puntos_gastados": c.puntos_gastados,
            "codigo_canje": c.codigo_canje,
            "canjeado_en": c.canjeado_en.isoformat() if c.canjeado_en else None
        }
        for c in canjes
    ]


@router.post("/admin/resetear-mes")
async def resetear_puntos_mes(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([RolUsuario.ADMIN]))
):
    """Resetea los puntos mensuales y guarda el leaderboard (ejecutar a fin de mes)"""
    await GamificacionService.resetear_puntos_mensuales(
        db, current_user.municipio_id
    )
    return {"mensaje": "Puntos mensuales reseteados y leaderboard guardado"}
