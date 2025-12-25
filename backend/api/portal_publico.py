"""API del Portal Público - Sin autenticación"""
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from sqlalchemy.orm import selectinload
from typing import Optional, List
from pydantic import BaseModel
from datetime import datetime, timedelta
import httpx

from core.database import get_db
from core.rate_limit import limiter, LIMITS
from core.config import settings
from models import Reclamo, Categoria, Zona
from models.calificacion import Calificacion
from models.enums import EstadoReclamo
from services.ia_service import clasificar_reclamo, CATEGORY_KEYWORDS

router = APIRouter()


# Schemas públicos (sin datos sensibles)
class ReclamoPublico(BaseModel):
    id: int
    titulo: str
    descripcion: str
    estado: str
    categoria: str
    zona: Optional[str]
    direccion: str
    latitud: Optional[float]
    longitud: Optional[float]
    created_at: datetime
    fecha_resolucion: Optional[datetime]
    dias_abierto: int


class EstadisticasPublicas(BaseModel):
    total_reclamos: int
    resueltos: int
    en_proceso: int
    nuevos: int
    tasa_resolucion: float
    tiempo_promedio_resolucion_dias: float
    calificacion_promedio: float
    por_categoria: List[dict]
    por_zona: List[dict]


class ConsultaReclamo(BaseModel):
    id: int
    titulo: str
    estado: str
    categoria: str
    created_at: datetime
    ultima_actualizacion: Optional[datetime]
    historial: List[dict]


# Endpoints públicos (sin auth)

@router.get("/estadisticas", response_model=EstadisticasPublicas)
async def get_estadisticas_publicas(
    db: AsyncSession = Depends(get_db)
):
    """Obtener estadísticas públicas del sistema - SIN AUTENTICACIÓN"""
    # Total de reclamos
    result = await db.execute(select(func.count(Reclamo.id)))
    total = result.scalar() or 0

    # Por estado
    result = await db.execute(
        select(func.count(Reclamo.id))
        .where(Reclamo.estado == EstadoReclamo.RESUELTO)
    )
    resueltos = result.scalar() or 0

    result = await db.execute(
        select(func.count(Reclamo.id))
        .where(Reclamo.estado == EstadoReclamo.EN_PROCESO)
    )
    en_proceso = result.scalar() or 0

    result = await db.execute(
        select(func.count(Reclamo.id))
        .where(Reclamo.estado == EstadoReclamo.NUEVO)
    )
    nuevos = result.scalar() or 0

    # Tasa de resolución
    tasa_resolucion = (resueltos / total * 100) if total > 0 else 0

    # Tiempo promedio de resolución (últimos 90 días)
    hace_90_dias = datetime.utcnow() - timedelta(days=90)
    result = await db.execute(
        select(Reclamo)
        .where(
            Reclamo.estado == EstadoReclamo.RESUELTO,
            Reclamo.fecha_resolucion >= hace_90_dias
        )
    )
    reclamos_resueltos = result.scalars().all()

    tiempos = []
    for r in reclamos_resueltos:
        if r.fecha_resolucion and r.created_at:
            dias = (r.fecha_resolucion.replace(tzinfo=None) - r.created_at.replace(tzinfo=None)).days
            tiempos.append(dias)

    tiempo_promedio = sum(tiempos) / len(tiempos) if tiempos else 0

    # Calificación promedio
    result = await db.execute(
        select(func.avg(Calificacion.puntuacion))
    )
    calificacion_promedio = result.scalar() or 0

    # Por categoría
    result = await db.execute(
        select(Categoria.nombre, func.count(Reclamo.id))
        .join(Reclamo)
        .group_by(Categoria.id, Categoria.nombre)
        .order_by(func.count(Reclamo.id).desc())
    )
    por_categoria = [
        {"categoria": nombre, "cantidad": cantidad}
        for nombre, cantidad in result.all()
    ]

    # Por zona
    result = await db.execute(
        select(Zona.nombre, func.count(Reclamo.id))
        .join(Reclamo)
        .group_by(Zona.id, Zona.nombre)
        .order_by(func.count(Reclamo.id).desc())
    )
    por_zona = [
        {"zona": nombre, "cantidad": cantidad}
        for nombre, cantidad in result.all()
    ]

    return EstadisticasPublicas(
        total_reclamos=total,
        resueltos=resueltos,
        en_proceso=en_proceso,
        nuevos=nuevos,
        tasa_resolucion=round(tasa_resolucion, 1),
        tiempo_promedio_resolucion_dias=round(tiempo_promedio, 1),
        calificacion_promedio=round(float(calificacion_promedio), 2),
        por_categoria=por_categoria,
        por_zona=por_zona
    )


@router.get("/reclamos-resueltos")
async def get_reclamos_resueltos_publicos(
    categoria_id: Optional[int] = None,
    zona_id: Optional[int] = None,
    dias: int = Query(30, ge=1, le=365),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db)
):
    """Obtener reclamos resueltos recientemente - SIN AUTENTICACIÓN"""
    fecha_desde = datetime.utcnow() - timedelta(days=dias)

    query = (
        select(Reclamo)
        .where(
            Reclamo.estado == EstadoReclamo.RESUELTO,
            Reclamo.fecha_resolucion >= fecha_desde
        )
        .options(
            selectinload(Reclamo.categoria),
            selectinload(Reclamo.zona)
        )
        .order_by(Reclamo.fecha_resolucion.desc())
        .limit(limit)
    )

    if categoria_id:
        query = query.where(Reclamo.categoria_id == categoria_id)
    if zona_id:
        query = query.where(Reclamo.zona_id == zona_id)

    result = await db.execute(query)
    reclamos = result.scalars().all()

    return {
        "total": len(reclamos),
        "reclamos": [
            {
                "id": r.id,
                "titulo": r.titulo,
                "categoria": r.categoria.nombre,
                "zona": r.zona.nombre if r.zona else None,
                "direccion": r.direccion,
                "fecha_creacion": r.created_at.isoformat(),
                "fecha_resolucion": r.fecha_resolucion.isoformat() if r.fecha_resolucion else None,
                "dias_resolucion": (r.fecha_resolucion.replace(tzinfo=None) - r.created_at.replace(tzinfo=None)).days if r.fecha_resolucion else None
            }
            for r in reclamos
        ]
    }


@router.get("/mapa")
async def get_reclamos_mapa_publico(
    estado: Optional[str] = None,
    categoria_id: Optional[int] = None,
    dias: int = Query(30, ge=1, le=365),
    db: AsyncSession = Depends(get_db)
):
    """Obtener reclamos para mostrar en mapa público - SIN AUTENTICACIÓN"""
    fecha_desde = datetime.utcnow() - timedelta(days=dias)

    query = (
        select(Reclamo)
        .where(
            Reclamo.created_at >= fecha_desde,
            Reclamo.latitud.isnot(None),
            Reclamo.longitud.isnot(None)
        )
        .options(selectinload(Reclamo.categoria))
    )

    if estado:
        try:
            estado_enum = EstadoReclamo(estado)
            query = query.where(Reclamo.estado == estado_enum)
        except ValueError:
            pass

    if categoria_id:
        query = query.where(Reclamo.categoria_id == categoria_id)

    result = await db.execute(query)
    reclamos = result.scalars().all()

    return {
        "total": len(reclamos),
        "puntos": [
            {
                "id": r.id,
                "lat": r.latitud,
                "lng": r.longitud,
                "titulo": r.titulo,
                "categoria": r.categoria.nombre,
                "estado": r.estado.value,
                "color": _get_color_estado(r.estado)
            }
            for r in reclamos
        ]
    }


def _get_color_estado(estado: EstadoReclamo) -> str:
    """Obtener color para el estado"""
    colores = {
        EstadoReclamo.NUEVO: "#3b82f6",      # azul
        EstadoReclamo.ASIGNADO: "#f59e0b",   # naranja
        EstadoReclamo.EN_PROCESO: "#8b5cf6", # violeta
        EstadoReclamo.RESUELTO: "#10b981",   # verde
        EstadoReclamo.RECHAZADO: "#ef4444",  # rojo
    }
    return colores.get(estado, "#6b7280")


@router.get("/consultar/{codigo}")
async def consultar_reclamo_publico(
    codigo: int,
    db: AsyncSession = Depends(get_db)
):
    """
    Consultar estado de un reclamo por su número - SIN AUTENTICACIÓN
    Los vecinos pueden usar esto para ver el estado de su reclamo sin loguearse
    """
    from models.historial import HistorialReclamo

    result = await db.execute(
        select(Reclamo)
        .where(Reclamo.id == codigo)
        .options(
            selectinload(Reclamo.categoria),
            selectinload(Reclamo.zona)
        )
    )
    reclamo = result.scalar_one_or_none()

    if not reclamo:
        raise HTTPException(status_code=404, detail="Reclamo no encontrado")

    # Obtener historial (sin datos de usuarios)
    result = await db.execute(
        select(HistorialReclamo)
        .where(HistorialReclamo.reclamo_id == codigo)
        .order_by(HistorialReclamo.created_at.desc())
    )
    historial = result.scalars().all()

    ahora = datetime.utcnow()
    dias_abierto = (ahora - reclamo.created_at.replace(tzinfo=None)).days

    return {
        "id": reclamo.id,
        "titulo": reclamo.titulo,
        "descripcion": reclamo.descripcion,
        "estado": reclamo.estado.value,
        "categoria": reclamo.categoria.nombre,
        "zona": reclamo.zona.nombre if reclamo.zona else None,
        "direccion": reclamo.direccion,
        "prioridad": reclamo.prioridad,
        "fecha_creacion": reclamo.created_at.isoformat(),
        "dias_abierto": dias_abierto,
        "fecha_programada": reclamo.fecha_programada.isoformat() if reclamo.fecha_programada else None,
        "fecha_resolucion": reclamo.fecha_resolucion.isoformat() if reclamo.fecha_resolucion else None,
        "resolucion": reclamo.resolucion if reclamo.estado == EstadoReclamo.RESUELTO else None,
        "historial": [
            {
                "estado": h.estado_nuevo.value if h.estado_nuevo else None,
                "accion": h.accion,
                "comentario": h.comentario,
                "fecha": h.created_at.isoformat()
            }
            for h in historial
        ]
    }


@router.get("/reclamos")
async def get_reclamos_publicos(
    municipio_id: int = Query(..., description="ID del municipio"),
    estado: Optional[str] = None,
    categoria_id: Optional[int] = None,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db)
):
    """Obtener reclamos públicos de un municipio - SIN AUTENTICACIÓN"""
    query = (
        select(Reclamo)
        .where(Reclamo.municipio_id == municipio_id)
        .options(
            selectinload(Reclamo.categoria),
            selectinload(Reclamo.zona)
        )
        .order_by(Reclamo.created_at.desc())
        .limit(limit)
        .offset(offset)
    )

    if estado:
        try:
            estado_enum = EstadoReclamo(estado)
            query = query.where(Reclamo.estado == estado_enum)
        except ValueError:
            pass

    if categoria_id:
        query = query.where(Reclamo.categoria_id == categoria_id)

    result = await db.execute(query)
    reclamos = result.scalars().all()

    return [
        {
            "id": r.id,
            "titulo": r.titulo,
            "descripcion": r.descripcion[:200] + "..." if len(r.descripcion) > 200 else r.descripcion,
            "estado": r.estado.value,
            "prioridad": r.prioridad,
            "direccion": r.direccion,
            "created_at": r.created_at.isoformat(),
            "categoria": {
                "nombre": r.categoria.nombre,
                "color": r.categoria.color,
                "icono": r.categoria.icono
            },
            "zona": {"nombre": r.zona.nombre} if r.zona else None
        }
        for r in reclamos
    ]


@router.get("/estadisticas/municipio")
async def get_estadisticas_municipio(
    municipio_id: int = Query(..., description="ID del municipio"),
    db: AsyncSession = Depends(get_db)
):
    """Obtener estadísticas de un municipio específico - SIN AUTENTICACIÓN"""
    # Total
    result = await db.execute(
        select(func.count(Reclamo.id))
        .where(Reclamo.municipio_id == municipio_id)
    )
    total = result.scalar() or 0

    # Nuevos
    result = await db.execute(
        select(func.count(Reclamo.id))
        .where(
            Reclamo.municipio_id == municipio_id,
            Reclamo.estado == EstadoReclamo.NUEVO
        )
    )
    nuevos = result.scalar() or 0

    # En proceso (asignado + en_proceso)
    result = await db.execute(
        select(func.count(Reclamo.id))
        .where(
            Reclamo.municipio_id == municipio_id,
            Reclamo.estado.in_([EstadoReclamo.ASIGNADO, EstadoReclamo.EN_PROCESO])
        )
    )
    en_proceso = result.scalar() or 0

    # Resueltos
    result = await db.execute(
        select(func.count(Reclamo.id))
        .where(
            Reclamo.municipio_id == municipio_id,
            Reclamo.estado == EstadoReclamo.RESUELTO
        )
    )
    resueltos = result.scalar() or 0

    # Por zona (solo zonas del municipio)
    result = await db.execute(
        select(Zona.nombre, func.count(Reclamo.id))
        .join(Reclamo, and_(Reclamo.zona_id == Zona.id, Reclamo.municipio_id == municipio_id))
        .where(Zona.municipio_id == municipio_id)
        .group_by(Zona.id, Zona.nombre)
        .order_by(func.count(Reclamo.id).desc())
    )
    por_zona = [
        {"zona": nombre, "cantidad": cantidad}
        for nombre, cantidad in result.all()
    ]

    # Por categoría (solo del municipio)
    result = await db.execute(
        select(Categoria.nombre, Categoria.color, func.count(Reclamo.id))
        .join(Reclamo, and_(Reclamo.categoria_id == Categoria.id, Reclamo.municipio_id == municipio_id))
        .where(Categoria.municipio_id == municipio_id)
        .group_by(Categoria.id, Categoria.nombre, Categoria.color)
        .order_by(func.count(Reclamo.id).desc())
    )
    por_categoria = [
        {"categoria": nombre, "color": color, "cantidad": cantidad}
        for nombre, color, cantidad in result.all()
    ]

    return {
        "total": total,
        "nuevos": nuevos,
        "en_proceso": en_proceso,
        "resueltos": resueltos,
        "por_zona": por_zona,
        "por_categoria": por_categoria
    }


@router.get("/categorias")
async def get_categorias_publicas(
    municipio_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db)
):
    """Obtener lista de categorías - SIN AUTENTICACIÓN"""
    query = select(Categoria).where(Categoria.activo == True)

    if municipio_id:
        query = query.where(Categoria.municipio_id == municipio_id)

    query = query.order_by(Categoria.nombre)
    result = await db.execute(query)
    categorias = result.scalars().all()

    return [
        {
            "id": c.id,
            "nombre": c.nombre,
            "descripcion": c.descripcion,
            "icono": c.icono,
            "color": c.color
        }
        for c in categorias
    ]


@router.get("/zonas")
async def get_zonas_publicas(
    municipio_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db)
):
    """Obtener lista de zonas - SIN AUTENTICACIÓN"""
    query = select(Zona).where(Zona.activo == True)

    if municipio_id:
        query = query.where(Zona.municipio_id == municipio_id)

    query = query.order_by(Zona.nombre)
    result = await db.execute(query)
    zonas = result.scalars().all()

    return [
        {
            "id": z.id,
            "nombre": z.nombre,
            "descripcion": z.descripcion,
            "latitud_centro": z.latitud_centro,
            "longitud_centro": z.longitud_centro
        }
        for z in zonas
    ]


@router.get("/tendencias")
async def get_tendencias_publicas(
    dias: int = Query(30, ge=7, le=90),
    db: AsyncSession = Depends(get_db)
):
    """Obtener tendencias de reclamos - SIN AUTENTICACIÓN"""
    fecha_desde = datetime.utcnow() - timedelta(days=dias)

    # Reclamos por día
    result = await db.execute(
        select(
            func.date(Reclamo.created_at).label('fecha'),
            func.count(Reclamo.id).label('cantidad')
        )
        .where(Reclamo.created_at >= fecha_desde)
        .group_by(func.date(Reclamo.created_at))
        .order_by(func.date(Reclamo.created_at))
    )
    por_dia = [
        {"fecha": str(fecha), "cantidad": cantidad}
        for fecha, cantidad in result.all()
    ]

    # Reclamos resueltos por día
    result = await db.execute(
        select(
            func.date(Reclamo.fecha_resolucion).label('fecha'),
            func.count(Reclamo.id).label('cantidad')
        )
        .where(
            Reclamo.fecha_resolucion >= fecha_desde,
            Reclamo.estado == EstadoReclamo.RESUELTO
        )
        .group_by(func.date(Reclamo.fecha_resolucion))
        .order_by(func.date(Reclamo.fecha_resolucion))
    )
    resueltos_por_dia = [
        {"fecha": str(fecha), "cantidad": cantidad}
        for fecha, cantidad in result.all()
    ]

    # Top categorías últimos días
    result = await db.execute(
        select(Categoria.nombre, func.count(Reclamo.id).label('cantidad'))
        .join(Reclamo)
        .where(Reclamo.created_at >= fecha_desde)
        .group_by(Categoria.id, Categoria.nombre)
        .order_by(func.count(Reclamo.id).desc())
        .limit(5)
    )
    top_categorias = [
        {"categoria": nombre, "cantidad": cantidad}
        for nombre, cantidad in result.all()
    ]

    return {
        "periodo_dias": dias,
        "reclamos_por_dia": por_dia,
        "resueltos_por_dia": resueltos_por_dia,
        "top_categorias": top_categorias
    }


# Schema para clasificación
class ClasificarRequest(BaseModel):
    texto: str
    municipio_id: int
    usar_ia: bool = True


@router.post("/clasificar")
@limiter.limit(LIMITS["ia"])  # 10/minute - Usa IA que cuesta $
async def clasificar_reclamo_endpoint(
    request: Request,
    data: ClasificarRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Clasificar un reclamo basado en su descripción - SIN AUTENTICACIÓN

    Usa clasificación híbrida:
    1. Primero intenta matching local con palabras clave (rápido y gratis)
    2. Si es ambiguo, usa Gemini AI para mejor precisión

    Retorna las 3 categorías más probables con su score.
    """
    if not data.texto or len(data.texto) < 5:
        raise HTTPException(status_code=400, detail="El texto debe tener al menos 5 caracteres")

    # Obtener categorías del municipio
    result = await db.execute(
        select(Categoria)
        .where(
            Categoria.activo == True,
            Categoria.municipio_id == data.municipio_id
        )
    )
    categorias_db = result.scalars().all()

    # Si no hay categorías en la base, usar las predefinidas de CATEGORY_KEYWORDS
    if categorias_db:
        categorias = [
            {"id": c.id, "nombre": c.nombre}
            for c in categorias_db
        ]
    else:
        # Usar categorías predefinidas (mismas que init_data.py)
        CATEGORIAS_DEFAULT = [
            {"id": 1, "nombre": "Baches y Calles"},
            {"id": 2, "nombre": "Alumbrado Publico"},
            {"id": 3, "nombre": "Recoleccion de Residuos"},
            {"id": 4, "nombre": "Espacios Verdes"},
            {"id": 5, "nombre": "Senalizacion"},
            {"id": 6, "nombre": "Desagues y Cloacas"},
            {"id": 7, "nombre": "Veredas"},
            {"id": 8, "nombre": "Agua y Canerias"},
            {"id": 9, "nombre": "Plagas y Fumigacion"},
            {"id": 10, "nombre": "Ruidos Molestos"},
            {"id": 11, "nombre": "Animales Sueltos"},
            {"id": 12, "nombre": "Otros"},
        ]
        categorias = CATEGORIAS_DEFAULT

    # Clasificar
    resultado = await clasificar_reclamo(
        texto=data.texto,
        categorias=categorias,
        usar_ia=data.usar_ia
    )

    return resultado


# Schema para chat público
class ChatPublicoRequest(BaseModel):
    message: str
    history: List[dict] = []
    municipio_id: Optional[int] = None


class ChatPublicoResponse(BaseModel):
    response: str


@router.post("/chat", response_model=ChatPublicoResponse)
@limiter.limit(LIMITS["ia"])
async def chat_publico(
    request: Request,
    data: ChatPublicoRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Chat público con IA para consultas - SIN AUTENTICACIÓN
    Permite a los usuarios hacer consultas sobre el sistema sin necesidad de loguearse.
    """
    if not settings.GEMINI_API_KEY:
        return ChatPublicoResponse(
            response="El asistente no está disponible en este momento. Por favor intentá más tarde."
        )

    # Obtener categorías del municipio si se especifica
    categorias = []
    if data.municipio_id:
        result = await db.execute(
            select(Categoria)
            .where(
                Categoria.municipio_id == data.municipio_id,
                Categoria.activo == True
            )
            .order_by(Categoria.nombre)
        )
        categorias = [{"id": c.id, "nombre": c.nombre} for c in result.scalars().all()]

    if not categorias:
        categorias = [
            {"id": 1, "nombre": "Baches y Calles"},
            {"id": 2, "nombre": "Alumbrado Público"},
            {"id": 3, "nombre": "Agua y Cloacas"},
            {"id": 4, "nombre": "Limpieza y Residuos"},
            {"id": 5, "nombre": "Espacios Verdes"},
        ]

    cats_list = "\n".join([f"  - {c['nombre']} (ID: {c['id']})" for c in categorias])

    system_prompt = f"""Sos un asistente virtual del Sistema de Reclamos Municipales. Tu nombre es "Asistente Municipal".

CATEGORÍAS DISPONIBLES:
{cats_list}

TU ROL:
- Ayudar a los usuarios a entender cómo funciona el sistema de reclamos
- Explicar qué tipos de problemas pueden reportar
- Guiarlos para crear un reclamo cuando lo necesiten

REGLAS:
1. Respondé de forma breve y amigable (2-3 oraciones máximo)
2. Usá español rioplatense (vos, podés, etc.)
3. Si el usuario describe un problema específico, sugerí la categoría correcta e incluí un link así:
   [Crear reclamo de CATEGORIA](/app/nuevo?categoria=ID)
4. Si preguntan sobre el estado de un reclamo, explicá que pueden consultar ingresando el número
5. Sé proactivo sugiriendo acciones concretas

EJEMPLO DE RESPUESTA CON LINK:
"¡Claro! Un bache en la calle corresponde a **Baches y Calles**. Podés [Crear reclamo de Baches y Calles](/app/nuevo?categoria=1) y en minutos lo reportás."

Estados de reclamos: Nuevo → Asignado → En Proceso → Resuelto (o Rechazado)"""

    # Construir contexto con historial
    context = system_prompt + "\n\nCONVERSACIÓN:\n"

    for msg in data.history[-8:]:
        role = "Usuario" if msg.get("role") == "user" else "Asistente"
        context += f"{role}: {msg.get('content', '')}\n"

    context += f"Usuario: {data.message}\n\nAsistente:"

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"https://generativelanguage.googleapis.com/v1beta/models/{settings.GEMINI_MODEL}:generateContent?key={settings.GEMINI_API_KEY}",
                headers={"Content-Type": "application/json"},
                json={
                    "contents": [{"parts": [{"text": context}]}],
                    "generationConfig": {
                        "temperature": 0.7,
                        "maxOutputTokens": 300,
                    }
                }
            )

            if response.status_code == 200:
                response_data = response.json()
                text = response_data.get('candidates', [{}])[0].get('content', {}).get('parts', [{}])[0].get('text', '')
                return ChatPublicoResponse(response=text.strip() if text else "No pude procesar tu mensaje.")
            else:
                return ChatPublicoResponse(response="El asistente no está disponible temporalmente.")

    except httpx.TimeoutException:
        return ChatPublicoResponse(response="La consulta tardó demasiado. Intentá de nuevo.")
    except Exception:
        return ChatPublicoResponse(response="Hubo un error. Por favor intentá de nuevo.")
