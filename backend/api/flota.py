"""Flota municipal — modulo Recursos, Etapa 1.

El corralon lleva el combustible en un cuaderno y nadie sabe cuanto consume
cada vehiculo. Este router responde esa pregunta con los datos que el propio
municipio carga.

Endpoints:
  GET  /flota/vehiculos            los activos con datos de flota + su consumo
  GET  /flota/vehiculos/{id}/cargas historial de cargas del vehiculo
  POST /flota/cargas               registrar una carga (y su gasto en Tesoreria)
"""
from datetime import date
from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.security import get_current_user
from core.tenancy import get_effective_municipio_id
from models import FlotaCarga, InventarioItem, RolUsuario, User
from models.gasto import Gasto

router = APIRouter()


def _require_gestor(user: User):
    if user.rol not in (RolUsuario.ADMIN, RolUsuario.SUPERVISOR):
        raise HTTPException(status_code=403, detail="Sin permisos para gestionar la flota")


# ============================================================
# El calculo que justifica el modulo
# ============================================================

# Metodo "tanque lleno a tanque lleno": el rendimiento de una carga se mide
# contra la ANTERIOR, porque los litros que entran hoy son los que se gastaron
# desde la ultima vez. Por eso la primera carga de un vehiculo nunca tiene
# consumo: no hay contra que medirla, y estimarlo seria inventarlo.
KM_MINIMOS_ENTRE_CARGAS = 20      # menos que esto es una recarga parcial, no un tramo
KM_MAXIMOS_ENTRE_CARGAS = 5000    # mas que esto es que se saltearon cargas


def consumo_por_100km(cargas: List[FlotaCarga]) -> Optional[float]:
    """Litros cada 100 km del vehiculo, o None si los datos no alcanzan.

    Devuelve None —y NO un cero ni un promedio inventado— cuando:
      - hay menos de dos cargas con kilometraje;
      - los tramos son absurdos (el odometro volvio para atras, o pasaron
        5.000 km sin cargar, que significa que hubo cargas sin registrar).
    Un numero de consumo mal calculado es peor que no tenerlo: sobre el se
    decide si un vehiculo esta perdiendo combustible.
    """
    con_km = sorted([c for c in cargas if c.km], key=lambda c: (c.fecha, c.km or 0))
    if len(con_km) < 2:
        return None

    litros = 0.0
    kms = 0
    for previa, actual in zip(con_km, con_km[1:]):
        tramo = (actual.km or 0) - (previa.km or 0)
        if tramo < KM_MINIMOS_ENTRE_CARGAS or tramo > KM_MAXIMOS_ENTRE_CARGAS:
            continue
        litros += actual.litros or 0
        kms += tramo

    if kms <= 0 or litros <= 0:
        return None
    return round(litros / kms * 100, 1)


# ============================================================
# Schemas
# ============================================================

class VehiculoResponse(BaseModel):
    id: int
    nombre: str
    identificador: Optional[str] = None      # el dominio
    marca_modelo: Optional[str] = None
    anio: Optional[int] = None
    km_actual: Optional[int] = None
    tipo_combustible: Optional[str] = None
    vencimiento_vtv: Optional[date] = None
    vencimiento_seguro: Optional[date] = None
    km_proximo_service: Optional[int] = None
    estado_activo: Optional[str] = None
    # Lo que el cuaderno no sabe:
    consumo_100km: Optional[float] = None
    litros_mes: Optional[float] = None
    gasto_mes: Optional[Decimal] = None
    cargas_total: int = 0
    ultima_carga: Optional[date] = None


class CargaResponse(BaseModel):
    id: int
    item_id: int
    fecha: date
    litros: float
    importe: Optional[Decimal] = None
    km: Optional[int] = None
    gasto_id: Optional[int] = None
    observaciones: Optional[str] = None

    class Config:
        from_attributes = True


class CargaCreate(BaseModel):
    item_id: int
    fecha: date
    litros: float = Field(..., gt=0)
    importe: Optional[Decimal] = Field(None, ge=0)
    km: Optional[int] = Field(None, ge=0)
    empleado_id: Optional[int] = None
    observaciones: Optional[str] = None
    # Si viene, la carga ademas se imputa como gasto y descuenta esa caja.
    caja_id: Optional[int] = None


# ============================================================
# Endpoints
# ============================================================

@router.get("/vehiculos", response_model=List[VehiculoResponse])
async def listar_vehiculos(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Los vehiculos del municipio con su consumo real.

    Vehiculo = activo de inventario con datos de flota cargados. No hay tabla
    aparte (ver models/flota.py).
    """
    _require_gestor(current_user)
    municipio_id = get_effective_municipio_id(request, current_user)

    r = await db.execute(
        select(InventarioItem).where(
            InventarioItem.municipio_id == municipio_id,
            InventarioItem.activo == True,  # noqa: E712
            InventarioItem.tipo_combustible.isnot(None),
        )
    )
    vehiculos = r.scalars().all()
    if not vehiculos:
        return []

    ids = [v.id for v in vehiculos]
    rc = await db.execute(
        select(FlotaCarga).where(FlotaCarga.item_id.in_(ids)).order_by(FlotaCarga.fecha)
    )
    todas = rc.scalars().all()

    por_item: dict[int, List[FlotaCarga]] = {}
    for c in todas:
        por_item.setdefault(c.item_id, []).append(c)

    hoy = date.today()
    salida = []
    for v in vehiculos:
        cargas = por_item.get(v.id, [])
        del_mes = [c for c in cargas if c.fecha.year == hoy.year and c.fecha.month == hoy.month]
        salida.append(VehiculoResponse(
            id=v.id, nombre=v.nombre, identificador=v.identificador,
            marca_modelo=v.marca_modelo, anio=v.anio, km_actual=v.km_actual,
            tipo_combustible=v.tipo_combustible,
            vencimiento_vtv=v.vencimiento_vtv, vencimiento_seguro=v.vencimiento_seguro,
            km_proximo_service=v.km_proximo_service,
            estado_activo=v.estado_activo.value if v.estado_activo else None,
            consumo_100km=consumo_por_100km(cargas),
            litros_mes=round(sum(c.litros or 0 for c in del_mes), 1) if del_mes else None,
            gasto_mes=sum((c.importe or 0) for c in del_mes) if del_mes else None,
            cargas_total=len(cargas),
            ultima_carga=max((c.fecha for c in cargas), default=None),
        ))
    # Primero el que mas consume: es donde hay que mirar.
    salida.sort(key=lambda v: (v.consumo_100km is None, -(v.consumo_100km or 0)))
    return salida


@router.get("/vehiculos/{item_id}/cargas", response_model=List[CargaResponse])
async def cargas_del_vehiculo(
    item_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_gestor(current_user)
    municipio_id = get_effective_municipio_id(request, current_user)
    r = await db.execute(
        select(FlotaCarga)
        .where(FlotaCarga.item_id == item_id, FlotaCarga.municipio_id == municipio_id)
        .order_by(FlotaCarga.fecha.desc(), FlotaCarga.id.desc())
    )
    return r.scalars().all()


@router.post("/cargas", response_model=CargaResponse, status_code=201)
async def registrar_carga(
    data: CargaCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Registra una carga y, si se indica la caja, su gasto en Tesoreria.

    La plata de la nafta ES un gasto del municipio: cargarla dos veces (aca y
    en tesoreria) es la doble carga que este producto existe para evitar.
    """
    _require_gestor(current_user)
    municipio_id = get_effective_municipio_id(request, current_user)

    r = await db.execute(
        select(InventarioItem).where(
            InventarioItem.id == data.item_id,
            InventarioItem.municipio_id == municipio_id,
        )
    )
    vehiculo = r.scalar_one_or_none()
    if not vehiculo:
        raise HTTPException(status_code=404, detail="Vehiculo no encontrado")

    # El odometro no vuelve para atras. Avisarlo al cargar evita el dato
    # sucio; corregirlo despues es imposible sin saber cual de los dos km
    # estaba mal.
    if data.km is not None and vehiculo.km_actual and data.km < vehiculo.km_actual:
        raise HTTPException(
            status_code=400,
            detail=f"El kilometraje ({data.km}) es menor al ultimo registrado "
                   f"({vehiculo.km_actual}). Revisa el numero.",
        )

    gasto_id = None
    if data.caja_id and data.importe:
        gasto = Gasto(
            municipio_id=municipio_id,
            creador_id=current_user.id,
            concepto=f"Combustible {vehiculo.nombre}",
            descripcion=f"{data.litros} litros"
                        + (f" · {data.km} km" if data.km else ""),
            monto_pesos=data.importe,
            fecha=data.fecha,
            caja_id=data.caja_id,
            activo=True,
        )
        db.add(gasto)
        await db.flush()
        gasto_id = gasto.id

    carga = FlotaCarga(
        municipio_id=municipio_id, item_id=data.item_id, fecha=data.fecha,
        litros=data.litros, importe=data.importe, km=data.km,
        empleado_id=data.empleado_id, observaciones=data.observaciones,
        gasto_id=gasto_id,
    )
    db.add(carga)

    # El kilometraje del vehiculo queda al dia con la ultima carga.
    if data.km is not None and (not vehiculo.km_actual or data.km > vehiculo.km_actual):
        vehiculo.km_actual = data.km

    await db.commit()
    await db.refresh(carga)
    return carga
