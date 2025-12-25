"""
Servicio de Gamificación
Lógica de negocio para puntos, badges y leaderboard
"""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from sqlalchemy.orm import selectinload
from datetime import datetime, timedelta
from typing import Optional, List, Tuple

from models.gamificacion import (
    PuntosUsuario, HistorialPuntos, BadgeUsuario, LeaderboardMensual,
    TipoAccion, TipoBadge, PUNTOS_POR_ACCION, BADGES_CONFIG
)
from models.reclamo import Reclamo
from models.user import User
from models.categoria import Categoria


class GamificacionService:
    """Servicio para manejar toda la lógica de gamificación"""

    @staticmethod
    async def get_or_create_puntos_usuario(
        db: AsyncSession,
        user_id: int,
        municipio_id: int
    ) -> PuntosUsuario:
        """Obtiene o crea el registro de puntos del usuario"""
        result = await db.execute(
            select(PuntosUsuario).where(
                PuntosUsuario.user_id == user_id,
                PuntosUsuario.municipio_id == municipio_id
            )
        )
        puntos = result.scalar_one_or_none()

        if not puntos:
            puntos = PuntosUsuario(
                user_id=user_id,
                municipio_id=municipio_id,
                puntos_totales=0,
                puntos_mes_actual=0
            )
            db.add(puntos)
            await db.flush()

        return puntos

    @staticmethod
    async def agregar_puntos(
        db: AsyncSession,
        user_id: int,
        municipio_id: int,
        tipo_accion: TipoAccion,
        reclamo_id: Optional[int] = None,
        descripcion: Optional[str] = None
    ) -> Tuple[int, List[TipoBadge]]:
        """
        Agrega puntos al usuario y verifica si obtuvo nuevos badges.
        Retorna (puntos_ganados, lista_nuevos_badges)
        """
        puntos_usuario = await GamificacionService.get_or_create_puntos_usuario(
            db, user_id, municipio_id
        )

        # Calcular puntos a agregar
        puntos_base = PUNTOS_POR_ACCION.get(tipo_accion, 0)

        # Registrar en historial
        historial = HistorialPuntos(
            user_id=user_id,
            municipio_id=municipio_id,
            tipo_accion=tipo_accion,
            puntos=puntos_base,
            descripcion=descripcion,
            reclamo_id=reclamo_id
        )
        db.add(historial)

        # Actualizar puntos del usuario
        puntos_usuario.puntos_totales += puntos_base
        puntos_usuario.puntos_mes_actual += puntos_base
        puntos_usuario.ultima_actividad = datetime.utcnow()

        # Actualizar estadísticas según tipo de acción
        if tipo_accion == TipoAccion.RECLAMO_CREADO:
            puntos_usuario.reclamos_totales += 1
        elif tipo_accion == TipoAccion.RECLAMO_RESUELTO:
            puntos_usuario.reclamos_resueltos += 1
        elif tipo_accion == TipoAccion.RECLAMO_CON_FOTO:
            puntos_usuario.reclamos_con_foto += 1
        elif tipo_accion == TipoAccion.RECLAMO_CON_UBICACION:
            puntos_usuario.reclamos_con_ubicacion += 1
        elif tipo_accion == TipoAccion.CALIFICACION_DADA:
            puntos_usuario.calificaciones_dadas += 1

        await db.flush()

        # Verificar nuevos badges
        nuevos_badges = await GamificacionService.verificar_badges(
            db, user_id, municipio_id, puntos_usuario
        )

        # Agregar puntos bonus por badges obtenidos
        for badge in nuevos_badges:
            config = BADGES_CONFIG.get(badge, {})
            bonus = config.get("puntos_bonus", 0)
            if bonus > 0:
                puntos_usuario.puntos_totales += bonus
                puntos_usuario.puntos_mes_actual += bonus

                historial_badge = HistorialPuntos(
                    user_id=user_id,
                    municipio_id=municipio_id,
                    tipo_accion=TipoAccion.BADGE_OBTENIDO,
                    puntos=bonus,
                    descripcion=f"Badge obtenido: {config.get('nombre', badge.value)}"
                )
                db.add(historial_badge)

        await db.flush()
        return puntos_base, nuevos_badges

    @staticmethod
    async def verificar_badges(
        db: AsyncSession,
        user_id: int,
        municipio_id: int,
        puntos_usuario: PuntosUsuario
    ) -> List[TipoBadge]:
        """Verifica y otorga badges que el usuario ha desbloqueado"""
        nuevos_badges = []

        # Obtener badges existentes del usuario
        result = await db.execute(
            select(BadgeUsuario.tipo_badge).where(
                BadgeUsuario.user_id == user_id,
                BadgeUsuario.municipio_id == municipio_id
            )
        )
        badges_existentes = {row[0] for row in result.fetchall()}

        # Verificar cada badge
        badges_a_verificar = [
            (TipoBadge.PRIMER_PASO, puntos_usuario.reclamos_totales >= 1),
            (TipoBadge.VECINO_ACTIVO, puntos_usuario.reclamos_totales >= 5),
            (TipoBadge.OJOS_DE_LA_CIUDAD, puntos_usuario.reclamos_totales >= 15),
            (TipoBadge.REPORTERO_ESTRELLA, puntos_usuario.reclamos_totales >= 30),
            (TipoBadge.GUARDIAN_URBANO, puntos_usuario.reclamos_totales >= 50),
            (TipoBadge.HEROE_MUNICIPAL, puntos_usuario.reclamos_totales >= 100),
            (TipoBadge.FOTOGRAFO, puntos_usuario.reclamos_con_foto >= 10),
            (TipoBadge.PRECISO, puntos_usuario.reclamos_con_ubicacion >= 10),
            (TipoBadge.CONSTANTE, puntos_usuario.semanas_consecutivas >= 4),
        ]

        for badge, condicion in badges_a_verificar:
            if condicion and badge not in badges_existentes:
                nuevo_badge = BadgeUsuario(
                    user_id=user_id,
                    municipio_id=municipio_id,
                    tipo_badge=badge
                )
                db.add(nuevo_badge)
                nuevos_badges.append(badge)

        return nuevos_badges

    @staticmethod
    async def verificar_badges_por_categoria(
        db: AsyncSession,
        user_id: int,
        municipio_id: int,
        categoria_nombre: str
    ) -> List[TipoBadge]:
        """Verifica badges específicos por categoría"""
        nuevos_badges = []

        # Contar reclamos por categoría
        result = await db.execute(
            select(func.count(Reclamo.id)).where(
                Reclamo.creador_id == user_id,
                Reclamo.municipio_id == municipio_id
            ).join(Categoria).where(
                Categoria.nombre.ilike(f"%{categoria_nombre}%")
            )
        )
        count = result.scalar() or 0

        # Obtener badges existentes
        result = await db.execute(
            select(BadgeUsuario.tipo_badge).where(
                BadgeUsuario.user_id == user_id,
                BadgeUsuario.municipio_id == municipio_id
            )
        )
        badges_existentes = {row[0] for row in result.fetchall()}

        # Mapeo de categorías a badges
        categoria_lower = categoria_nombre.lower()
        badge_mapping = {
            "bache": TipoBadge.CAZADOR_DE_BACHES,
            "calle": TipoBadge.CAZADOR_DE_BACHES,
            "alumbrado": TipoBadge.GUARDIAN_DE_LA_LUZ,
            "luz": TipoBadge.GUARDIAN_DE_LA_LUZ,
            "verde": TipoBadge.DEFENSOR_DEL_VERDE,
            "arbol": TipoBadge.DEFENSOR_DEL_VERDE,
            "espacio": TipoBadge.DEFENSOR_DEL_VERDE,
            "agua": TipoBadge.VIGILANTE_DEL_AGUA,
            "cloaca": TipoBadge.VIGILANTE_DEL_AGUA,
        }

        for keyword, badge in badge_mapping.items():
            if keyword in categoria_lower and count >= 10 and badge not in badges_existentes:
                nuevo_badge = BadgeUsuario(
                    user_id=user_id,
                    municipio_id=municipio_id,
                    tipo_badge=badge
                )
                db.add(nuevo_badge)
                nuevos_badges.append(badge)
                break

        return nuevos_badges

    @staticmethod
    async def verificar_badges_horarios(
        db: AsyncSession,
        user_id: int,
        municipio_id: int,
        hora_creacion: datetime
    ) -> List[TipoBadge]:
        """Verifica badges por horario de creación"""
        nuevos_badges = []

        # Obtener badges existentes
        result = await db.execute(
            select(BadgeUsuario.tipo_badge).where(
                BadgeUsuario.user_id == user_id,
                BadgeUsuario.municipio_id == municipio_id
            )
        )
        badges_existentes = {row[0] for row in result.fetchall()}

        hora = hora_creacion.hour

        # Madrugador: antes de las 7am
        if hora < 7 and TipoBadge.MADRUGADOR not in badges_existentes:
            nuevo_badge = BadgeUsuario(
                user_id=user_id,
                municipio_id=municipio_id,
                tipo_badge=TipoBadge.MADRUGADOR
            )
            db.add(nuevo_badge)
            nuevos_badges.append(TipoBadge.MADRUGADOR)

        # Nocturno: después de las 22pm
        if hora >= 22 and TipoBadge.NOCTURNO not in badges_existentes:
            nuevo_badge = BadgeUsuario(
                user_id=user_id,
                municipio_id=municipio_id,
                tipo_badge=TipoBadge.NOCTURNO
            )
            db.add(nuevo_badge)
            nuevos_badges.append(TipoBadge.NOCTURNO)

        return nuevos_badges

    @staticmethod
    async def get_leaderboard(
        db: AsyncSession,
        municipio_id: int,
        zona_id: Optional[int] = None,
        limite: int = 10,
        periodo: str = "mes"  # "mes", "semana", "total"
    ) -> List[dict]:
        """Obtiene el leaderboard de usuarios"""
        # Construir query base
        query = select(
            PuntosUsuario.user_id,
            User.nombre,
            User.apellido,
            PuntosUsuario.puntos_totales,
            PuntosUsuario.puntos_mes_actual,
            PuntosUsuario.reclamos_totales,
            func.count(BadgeUsuario.id).label("badges_count")
        ).join(
            User, PuntosUsuario.user_id == User.id
        ).outerjoin(
            BadgeUsuario, and_(
                BadgeUsuario.user_id == PuntosUsuario.user_id,
                BadgeUsuario.municipio_id == PuntosUsuario.municipio_id
            )
        ).where(
            PuntosUsuario.municipio_id == municipio_id
        ).group_by(
            PuntosUsuario.user_id,
            User.nombre,
            User.apellido,
            PuntosUsuario.puntos_totales,
            PuntosUsuario.puntos_mes_actual,
            PuntosUsuario.reclamos_totales
        )

        # Ordenar según período
        if periodo == "mes":
            query = query.order_by(PuntosUsuario.puntos_mes_actual.desc())
        else:
            query = query.order_by(PuntosUsuario.puntos_totales.desc())

        query = query.limit(limite)
        result = await db.execute(query)
        rows = result.fetchall()

        leaderboard = []
        for idx, row in enumerate(rows, 1):
            leaderboard.append({
                "posicion": idx,
                "user_id": row.user_id,
                "nombre": f"{row.nombre} {row.apellido[:1]}.",
                "puntos": row.puntos_mes_actual if periodo == "mes" else row.puntos_totales,
                "puntos_totales": row.puntos_totales,
                "reclamos": row.reclamos_totales,
                "badges": row.badges_count,
            })

        return leaderboard

    @staticmethod
    async def get_perfil_gamificacion(
        db: AsyncSession,
        user_id: int,
        municipio_id: int
    ) -> dict:
        """Obtiene el perfil completo de gamificación del usuario"""
        # Obtener puntos
        puntos = await GamificacionService.get_or_create_puntos_usuario(
            db, user_id, municipio_id
        )

        # Obtener badges
        result = await db.execute(
            select(BadgeUsuario).where(
                BadgeUsuario.user_id == user_id,
                BadgeUsuario.municipio_id == municipio_id
            ).order_by(BadgeUsuario.obtenido_en.desc())
        )
        badges = result.scalars().all()

        # Obtener posición en leaderboard
        leaderboard = await GamificacionService.get_leaderboard(
            db, municipio_id, limite=100
        )
        posicion = next(
            (item["posicion"] for item in leaderboard if item["user_id"] == user_id),
            None
        )

        # Obtener historial reciente
        result = await db.execute(
            select(HistorialPuntos).where(
                HistorialPuntos.user_id == user_id,
                HistorialPuntos.municipio_id == municipio_id
            ).order_by(HistorialPuntos.created_at.desc()).limit(10)
        )
        historial = result.scalars().all()

        # Calcular progreso a siguiente nivel
        nivel_actual = (puntos.puntos_totales // 100) + 1
        puntos_nivel_actual = (nivel_actual - 1) * 100
        puntos_siguiente_nivel = nivel_actual * 100
        progreso_nivel = puntos.puntos_totales - puntos_nivel_actual

        return {
            "puntos": {
                "puntos_totales": puntos.puntos_totales,
                "puntos_mes_actual": puntos.puntos_mes_actual,
                "nivel": nivel_actual,
                "progreso_nivel": progreso_nivel,
                "puntos_para_siguiente": 100 - progreso_nivel,
            },
            "estadisticas": {
                "reclamos_totales": puntos.reclamos_totales,
                "reclamos_resueltos": puntos.reclamos_resueltos,
                "reclamos_con_foto": puntos.reclamos_con_foto,
                "reclamos_con_ubicacion": puntos.reclamos_con_ubicacion,
                "calificaciones_dadas": puntos.calificaciones_dadas,
                "semanas_consecutivas": puntos.semanas_consecutivas,
            },
            "badges": [
                {
                    "tipo": badge.tipo_badge.value,
                    "obtenido_en": badge.obtenido_en.isoformat() if badge.obtenido_en else None,
                    **BADGES_CONFIG.get(badge.tipo_badge, {})
                }
                for badge in badges
            ],
            "badges_disponibles": [
                {
                    "tipo": tipo.value,
                    **config
                }
                for tipo, config in BADGES_CONFIG.items()
                if tipo not in {b.tipo_badge for b in badges}
            ],
            "posicion_leaderboard": posicion,
            "historial_reciente": [
                {
                    "tipo": h.tipo_accion.value,
                    "puntos": h.puntos,
                    "descripcion": h.descripcion,
                    "fecha": h.created_at.isoformat() if h.created_at else None,
                }
                for h in historial
            ],
        }

    @staticmethod
    async def procesar_reclamo_creado(
        db: AsyncSession,
        reclamo: Reclamo,
        user: User
    ) -> Tuple[int, List[TipoBadge]]:
        """Procesa la creación de un reclamo y otorga puntos/badges"""
        total_puntos = 0
        todos_badges = []

        # Puntos por crear reclamo
        puntos, badges = await GamificacionService.agregar_puntos(
            db, user.id, user.municipio_id,
            TipoAccion.RECLAMO_CREADO,
            reclamo_id=reclamo.id,
            descripcion=f"Reclamo creado: {reclamo.titulo[:50]}"
        )
        total_puntos += puntos
        todos_badges.extend(badges)

        # Verificar si es primer reclamo
        puntos_usuario = await GamificacionService.get_or_create_puntos_usuario(
            db, user.id, user.municipio_id
        )
        if puntos_usuario.reclamos_totales == 1:
            puntos, badges = await GamificacionService.agregar_puntos(
                db, user.id, user.municipio_id,
                TipoAccion.PRIMER_RECLAMO,
                reclamo_id=reclamo.id,
                descripcion="¡Primer reclamo!"
            )
            total_puntos += puntos
            todos_badges.extend(badges)

        # Puntos por incluir foto
        if reclamo.documentos and len(reclamo.documentos) > 0:
            puntos, badges = await GamificacionService.agregar_puntos(
                db, user.id, user.municipio_id,
                TipoAccion.RECLAMO_CON_FOTO,
                reclamo_id=reclamo.id,
                descripcion="Reclamo con evidencia fotográfica"
            )
            total_puntos += puntos
            todos_badges.extend(badges)

        # Puntos por incluir ubicación
        if reclamo.latitud and reclamo.longitud:
            puntos, badges = await GamificacionService.agregar_puntos(
                db, user.id, user.municipio_id,
                TipoAccion.RECLAMO_CON_UBICACION,
                reclamo_id=reclamo.id,
                descripcion="Reclamo con ubicación exacta"
            )
            total_puntos += puntos
            todos_badges.extend(badges)

        # Verificar badges por horario
        badges_horario = await GamificacionService.verificar_badges_horarios(
            db, user.id, user.municipio_id, datetime.utcnow()
        )
        todos_badges.extend(badges_horario)

        await db.commit()
        return total_puntos, todos_badges

    @staticmethod
    async def procesar_reclamo_resuelto(
        db: AsyncSession,
        reclamo: Reclamo
    ) -> Tuple[int, List[TipoBadge]]:
        """Procesa cuando un reclamo es resuelto y otorga puntos al creador"""
        if not reclamo.creador_id:
            return 0, []

        puntos, badges = await GamificacionService.agregar_puntos(
            db, reclamo.creador_id, reclamo.municipio_id,
            TipoAccion.RECLAMO_RESUELTO,
            reclamo_id=reclamo.id,
            descripcion=f"Reclamo resuelto: {reclamo.titulo[:50]}"
        )

        await db.commit()
        return puntos, badges

    @staticmethod
    async def resetear_puntos_mensuales(db: AsyncSession, municipio_id: int):
        """Resetea los puntos mensuales y guarda el leaderboard del mes anterior"""
        ahora = datetime.utcnow()
        mes_anterior = ahora.month - 1 if ahora.month > 1 else 12
        anio = ahora.year if ahora.month > 1 else ahora.year - 1

        # Obtener top 10 del mes anterior
        result = await db.execute(
            select(PuntosUsuario).where(
                PuntosUsuario.municipio_id == municipio_id
            ).order_by(PuntosUsuario.puntos_mes_actual.desc()).limit(10)
        )
        top_usuarios = result.scalars().all()

        # Guardar en leaderboard histórico
        for idx, usuario in enumerate(top_usuarios, 1):
            leaderboard_entry = LeaderboardMensual(
                municipio_id=municipio_id,
                zona_id=None,
                anio=anio,
                mes=mes_anterior,
                user_id=usuario.user_id,
                posicion=idx,
                puntos=usuario.puntos_mes_actual,
                reclamos=usuario.reclamos_totales
            )
            db.add(leaderboard_entry)

            # Otorgar badge de top del mes
            if idx == 1:
                badge = BadgeUsuario(
                    user_id=usuario.user_id,
                    municipio_id=municipio_id,
                    tipo_badge=TipoBadge.TOP_DEL_MES
                )
                db.add(badge)
            elif idx <= 3:
                badge = BadgeUsuario(
                    user_id=usuario.user_id,
                    municipio_id=municipio_id,
                    tipo_badge=TipoBadge.TOP_3_MES
                )
                db.add(badge)

        # Resetear puntos mensuales
        await db.execute(
            PuntosUsuario.__table__.update().where(
                PuntosUsuario.municipio_id == municipio_id
            ).values(puntos_mes_actual=0)
        )

        await db.commit()
