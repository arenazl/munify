import json
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, text
from typing import List

from core.database import get_db
from core.security import get_current_user, require_roles
from models.zona import Zona
from models.reclamo import Reclamo
from models.cuadrilla import Cuadrilla
from models.user import User
from schemas.zona import ZonaCreate, ZonaUpdate, ZonaResponse

from core.tenancy import resolve_municipio_id as get_effective_municipio_id  # noqa: E402

router = APIRouter()


@router.get("", response_model=List[ZonaResponse])
async def get_zonas(
    request: Request,
    activo: bool = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    municipio_id = get_effective_municipio_id(request, current_user)
    query = select(Zona).where(Zona.municipio_id == municipio_id)
    if activo is not None:
        query = query.where(Zona.activo == activo)
    query = query.order_by(Zona.nombre)
    result = await db.execute(query)
    zonas = result.scalars().all()

    # Peso de cada zona: reclamos recibidos y cuadrillas asignadas. DOS queries
    # agrupadas para todas las zonas, no dos por zona: la base esta en otro
    # continente y el listado se abre en cada visita a Configuracion.
    if zonas:
        ids = [z.id for z in zonas]
        rec = await db.execute(
            select(Reclamo.zona_id, func.count(Reclamo.id))
            .where(Reclamo.zona_id.in_(ids))
            .group_by(Reclamo.zona_id)
        )
        por_reclamos = dict(rec.all())
        cua = await db.execute(
            select(Cuadrilla.zona_id, func.count(Cuadrilla.id))
            .where(Cuadrilla.zona_id.in_(ids))
            .group_by(Cuadrilla.zona_id)
        )
        por_cuadrillas = dict(cua.all())
        for z in zonas:
            z.reclamos_count = por_reclamos.get(z.id, 0)
            z.cuadrillas_count = por_cuadrillas.get(z.id, 0)

    return zonas

# =====================================================================
# REGIONES PARA EL MAPA
# =====================================================================
@router.get("/regiones-mapa")
async def regiones_mapa(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Los barrios del municipio con su contorno, y a que distrito pertenecen.

    Es lo que el mapa necesita para DIBUJAR areas en vez de puntos. Se devuelven
    los barrios y no los distritos fusionados a proposito: pintando cada barrio
    con el color de su distrito se ven las dos cosas a la vez, y se puede bajar
    al detalle sin pedir nada mas. Fusionar poligonos exigiria geometria
    computacional en el server para un resultado visual identico.

    El poligono viaja como [[lat, lng], ...] — el orden que espera Leaflet. En
    la base esta guardado al reves ([lon, lat], que es el orden de GeoJSON), asi
    que se invierte aca y no en el navegador: es una vuelta por barrio, no 60
    vueltas en el cliente.
    """
    municipio_id = get_effective_municipio_id(request, current_user)

    filas = (await db.execute(text("""
        SELECT b.id, b.nombre, b.poligono, b.zona_id, z.nombre AS zona_nombre
        FROM barrios b
        LEFT JOIN zonas z ON z.id = b.zona_id AND z.activo = 1
        WHERE b.municipio_id = :m AND b.poligono IS NOT NULL
        ORDER BY z.nombre, b.nombre
    """), {"m": municipio_id})).mappings().all()

    barrios = []
    for f in filas:
        try:
            puntos = json.loads(f["poligono"])
        except (TypeError, ValueError):
            continue
        if not puntos:
            continue
        barrios.append({
            "id": f["id"],
            "nombre": f["nombre"],
            "zona_id": f["zona_id"],
            "zona_nombre": f["zona_nombre"],
            "poligono": [[p[1], p[0]] for p in puntos],
        })

    distritos = (await db.execute(text("""
        SELECT z.id, z.nombre, COUNT(b.id) AS barrios
        FROM zonas z LEFT JOIN barrios b ON b.zona_id = z.id
        WHERE z.municipio_id = :m AND z.activo = 1
        GROUP BY z.id, z.nombre ORDER BY z.nombre
    """), {"m": municipio_id})).mappings().all()

    return {
        "distritos": [dict(d) for d in distritos],
        "barrios": barrios,
    }


@router.get("/{zona_id}", response_model=ZonaResponse)
async def get_zona(
    request: Request,
    zona_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    municipio_id = get_effective_municipio_id(request, current_user)
    result = await db.execute(
        select(Zona)
        .where(Zona.id == zona_id)
        .where(Zona.municipio_id == municipio_id)
    )
    zona = result.scalar_one_or_none()
    if not zona:
        raise HTTPException(status_code=404, detail="Zona no encontrada")
    return zona

@router.post("", response_model=ZonaResponse)
async def create_zona(
    request: Request,
    data: ZonaCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"]))
):
    municipio_id = get_effective_municipio_id(request, current_user)
    result = await db.execute(
        select(Zona).where(
            Zona.nombre == data.nombre,
            Zona.municipio_id == municipio_id
        )
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Ya existe una zona con ese nombre")

    zona = Zona(**data.model_dump(), municipio_id=municipio_id)
    db.add(zona)
    await db.commit()
    await db.refresh(zona)
    return zona

@router.put("/{zona_id}", response_model=ZonaResponse)
async def update_zona(
    request: Request,
    zona_id: int,
    data: ZonaUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"]))
):
    municipio_id = get_effective_municipio_id(request, current_user)
    result = await db.execute(
        select(Zona)
        .where(Zona.id == zona_id)
        .where(Zona.municipio_id == municipio_id)
    )
    zona = result.scalar_one_or_none()
    if not zona:
        raise HTTPException(status_code=404, detail="Zona no encontrada")

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(zona, key, value)

    await db.commit()
    await db.refresh(zona)
    return zona

@router.delete("/{zona_id}")
async def delete_zona(
    request: Request,
    zona_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"]))
):
    municipio_id = get_effective_municipio_id(request, current_user)
    result = await db.execute(
        select(Zona)
        .where(Zona.id == zona_id)
        .where(Zona.municipio_id == municipio_id)
    )
    zona = result.scalar_one_or_none()
    if not zona:
        raise HTTPException(status_code=404, detail="Zona no encontrada")

    zona.activo = False
    await db.commit()
    return {"message": "Zona desactivada"}
