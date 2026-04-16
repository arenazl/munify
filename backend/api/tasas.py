"""Endpoints de Tasas — catalogo maestro + lectura de partidas/deudas del vecino.

MVP acotado: solo lectura desde el lado del vecino y admin. La ingesta masiva
(CSV upload, API push de sistemas tributarios) queda para el siguiente commit.

Endpoints:
  GET  /tasas/tipos                      → catalogo maestro global
  GET  /tasas/mis-partidas               → partidas del vecino logueado
  GET  /tasas/partidas/{id}/deudas       → deudas de una partida
  GET  /tasas/mi-resumen                 → totales pendientes del vecino
  POST /tasas/partidas/reclamar          → asociar partida a mi User por identificador
"""
from datetime import date
from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from pydantic import BaseModel

from core.database import get_db
from core.security import get_current_user
from models.user import User
from models.enums import RolUsuario
from models.tasas import TipoTasa, Partida, Deuda, EstadoDeuda, EstadoPartida
from schemas.tasas import (
    TipoTasaResponse,
    PartidaResponse,
    DeudaResponse,
    ResumenTasasVecino,
)
from services.curador_padron import (
    fetch_padron,
    analizar_padron,
    PadronInvalido,
)
from datetime import datetime, date as date_cls
from decimal import Decimal as Dec

router = APIRouter(prefix="/tasas", tags=["tasas"])


# ============================================================
# Catalogo maestro
# ============================================================

@router.get("/tipos", response_model=List[TipoTasaResponse])
async def listar_tipos_tasa(
    activo: bool = True,
    db: AsyncSession = Depends(get_db),
):
    """Catalogo global de tipos de tasa (ABL, Patente, Multa, etc)."""
    q = select(TipoTasa)
    if activo:
        q = q.where(TipoTasa.activo == True)
    q = q.order_by(TipoTasa.orden, TipoTasa.nombre)
    result = await db.execute(q)
    return result.scalars().all()


# ============================================================
# Helpers
# ============================================================

async def _partidas_del_vecino(db: AsyncSession, user: User) -> List[Partida]:
    """Partidas asociadas al vecino logueado.

    Match por:
      1. `titular_user_id == user.id` (asociacion explicita)
      2. `titular_dni == user.dni` si coincide y muni matchea
    """
    if not user.municipio_id:
        return []

    conds = [Partida.municipio_id == user.municipio_id]
    match = [Partida.titular_user_id == user.id]
    if user.dni:
        match.append(Partida.titular_dni == user.dni)

    from sqlalchemy import or_
    q = (
        select(Partida)
        .options(selectinload(Partida.tipo_tasa))
        .where(and_(*conds, or_(*match), Partida.estado == EstadoPartida.ACTIVA))
        .order_by(Partida.tipo_tasa_id, Partida.identificador)
    )
    r = await db.execute(q)
    return list(r.scalars().all())


async def _resumen_deudas(db: AsyncSession, partida_ids: List[int]) -> dict[int, dict]:
    """Para cada partida, cuantas deudas pendientes tiene y monto total."""
    if not partida_ids:
        return {}
    q = (
        select(
            Deuda.partida_id,
            Deuda.estado,
            func.count(Deuda.id).label("count"),
            func.coalesce(func.sum(Deuda.importe), 0).label("total"),
        )
        .where(Deuda.partida_id.in_(partida_ids))
        .group_by(Deuda.partida_id, Deuda.estado)
    )
    r = await db.execute(q)
    out: dict[int, dict] = {pid: {"pendientes": 0, "monto": Decimal("0")} for pid in partida_ids}
    for row in r.all():
        pid = row.partida_id
        if row.estado in (EstadoDeuda.PENDIENTE, EstadoDeuda.VENCIDA):
            out[pid]["pendientes"] += row.count
            out[pid]["monto"] += Decimal(str(row.total))
    return out


# ============================================================
# Vecino: mis partidas + deudas
# ============================================================

@router.get("/mis-partidas", response_model=List[PartidaResponse])
async def mis_partidas(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Partidas asociadas al vecino logueado."""
    if current_user.rol != RolUsuario.VECINO:
        raise HTTPException(status_code=403, detail="Solo vecinos consultan sus tasas")

    partidas = await _partidas_del_vecino(db, current_user)
    if not partidas:
        return []

    resumen = await _resumen_deudas(db, [p.id for p in partidas])

    result = []
    for p in partidas:
        r = resumen.get(p.id, {"pendientes": 0, "monto": Decimal("0")})
        item = PartidaResponse.model_validate(p)
        item.deudas_pendientes = r["pendientes"]
        item.monto_pendiente = r["monto"]
        result.append(item)
    return result


@router.get("/partidas/{partida_id}/deudas", response_model=List[DeudaResponse])
async def deudas_de_partida(
    partida_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Deudas (boletas) emitidas sobre una partida."""
    # Cargar partida + tipo para permiso y denormalizacion.
    pr = await db.execute(
        select(Partida)
        .options(selectinload(Partida.tipo_tasa))
        .where(Partida.id == partida_id)
    )
    partida = pr.scalar_one_or_none()
    if not partida:
        raise HTTPException(status_code=404, detail="Partida no encontrada")

    # Permiso: vecino solo ve lo suyo.
    if current_user.rol == RolUsuario.VECINO:
        puede = partida.titular_user_id == current_user.id or (
            current_user.dni and partida.titular_dni == current_user.dni
        )
        if not puede:
            raise HTTPException(status_code=403, detail="No tenés permiso sobre esta partida")
    elif current_user.rol in (RolUsuario.ADMIN, RolUsuario.SUPERVISOR):
        if partida.municipio_id != current_user.municipio_id:
            raise HTTPException(status_code=403, detail="Partida de otro municipio")

    dr = await db.execute(
        select(Deuda)
        .where(Deuda.partida_id == partida_id)
        .order_by(Deuda.fecha_vencimiento.desc())
    )
    deudas = dr.scalars().all()

    out = []
    for d in deudas:
        item = DeudaResponse.model_validate(d)
        item.tipo_tasa_nombre = partida.tipo_tasa.nombre if partida.tipo_tasa else None
        item.partida_identificador = partida.identificador
        out.append(item)
    return out


@router.get("/mi-resumen", response_model=ResumenTasasVecino)
async def mi_resumen(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Totales del vecino para mostrar en la home (cuánto debe y próximo vto)."""
    if current_user.rol != RolUsuario.VECINO:
        return ResumenTasasVecino(
            partidas_total=0, deudas_pendientes=0, deudas_vencidas=0,
            monto_total_pendiente=Decimal("0"),
        )

    partidas = await _partidas_del_vecino(db, current_user)
    if not partidas:
        return ResumenTasasVecino(
            partidas_total=0, deudas_pendientes=0, deudas_vencidas=0,
            monto_total_pendiente=Decimal("0"),
        )

    partida_ids = [p.id for p in partidas]
    dr = await db.execute(
        select(Deuda)
        .where(
            Deuda.partida_id.in_(partida_ids),
            Deuda.estado.in_([EstadoDeuda.PENDIENTE, EstadoDeuda.VENCIDA]),
        )
    )
    deudas = dr.scalars().all()

    pendientes = sum(1 for d in deudas if d.estado == EstadoDeuda.PENDIENTE)
    vencidas = sum(1 for d in deudas if d.estado == EstadoDeuda.VENCIDA)
    monto = sum((Decimal(str(d.importe)) for d in deudas), Decimal("0"))
    fechas_pendientes = [d.fecha_vencimiento for d in deudas if d.estado == EstadoDeuda.PENDIENTE]
    proxima = min(fechas_pendientes) if fechas_pendientes else None

    return ResumenTasasVecino(
        partidas_total=len(partidas),
        deudas_pendientes=pendientes,
        deudas_vencidas=vencidas,
        monto_total_pendiente=monto,
        proxima_vencimiento=proxima,
    )


# ============================================================
# Vecino: reclamar partida (asociarla a mi cuenta)
# ============================================================

class ReclamarPartidaRequest(BaseModel):
    tipo_tasa_codigo: str
    identificador: str


@router.post("/partidas/reclamar", response_model=PartidaResponse)
async def reclamar_partida(
    body: ReclamarPartidaRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """El vecino dice 'esta partida es mía' tipeando su identificador.

    Munify busca en el padrón del muni la partida que coincida con el
    identificador + tipo de tasa. Si el DNI del titular coincide con el DNI
    del vecino logueado, la asocia. Si no coincide, rechaza.
    """
    if current_user.rol != RolUsuario.VECINO:
        raise HTTPException(status_code=403, detail="Solo vecinos reclaman partidas")
    if not current_user.municipio_id:
        raise HTTPException(status_code=400, detail="Tu cuenta no tiene municipio asignado")
    if not current_user.dni:
        raise HTTPException(
            status_code=400,
            detail="Necesitás tener DNI verificado para reclamar una partida. Verificá tu identidad primero.",
        )

    tipo_q = await db.execute(select(TipoTasa).where(TipoTasa.codigo == body.tipo_tasa_codigo))
    tipo = tipo_q.scalar_one_or_none()
    if not tipo:
        raise HTTPException(status_code=404, detail="Tipo de tasa no existe")

    p_q = await db.execute(
        select(Partida)
        .options(selectinload(Partida.tipo_tasa))
        .where(
            Partida.municipio_id == current_user.municipio_id,
            Partida.tipo_tasa_id == tipo.id,
            Partida.identificador == body.identificador.strip(),
        )
    )
    partida = p_q.scalar_one_or_none()
    if not partida:
        raise HTTPException(
            status_code=404,
            detail=f"No encontramos una partida {tipo.nombre} con ese identificador en tu municipio",
        )

    # Validar DNI match.
    if partida.titular_dni and partida.titular_dni != current_user.dni:
        raise HTTPException(
            status_code=403,
            detail="Esa partida está registrada a nombre de otra persona. Si es tu caso, presentate con documentación en el municipio.",
        )

    partida.titular_user_id = current_user.id
    if not partida.titular_dni:
        partida.titular_dni = current_user.dni
    if not partida.titular_nombre:
        partida.titular_nombre = f"{current_user.nombre} {current_user.apellido or ''}".strip()

    await db.commit()
    await db.refresh(partida)
    return PartidaResponse.model_validate(partida)


# ============================================================
# Import de padron desde URL — flujo admin/settings
# ============================================================

class ImportPadronPreviewRequest(BaseModel):
    url: str


class MappingTasa(BaseModel):
    """Mapping final definido por el admin para una tasa del padron."""
    codigo_local: str  # codigo del padron original
    tipo_tasa_codigo: Optional[str] = None  # codigo canonico Munify (None = saltar)


class ImportPadronConfirmRequest(BaseModel):
    url: str
    mappings: List[MappingTasa]


def _require_admin(user: User):
    if user.rol not in (RolUsuario.ADMIN, RolUsuario.SUPERVISOR):
        raise HTTPException(status_code=403, detail="Solo admin/supervisor puede importar el padron")
    if not user.municipio_id:
        raise HTTPException(status_code=400, detail="Tu cuenta no tiene municipio asignado")


@router.post("/importar-padron/preview")
async def importar_padron_preview(
    body: ImportPadronPreviewRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Paso 1: descarga la URL, analiza la estructura y devuelve un preview
    con los matches sugeridos. No escribe nada en la DB."""
    _require_admin(current_user)

    try:
        padron = await fetch_padron(body.url)
    except PadronInvalido as e:
        raise HTTPException(status_code=400, detail=str(e))

    tipos_q = await db.execute(select(TipoTasa).where(TipoTasa.activo == True))
    tipos_db = list(tipos_q.scalars().all())

    preview = analizar_padron(padron, tipos_db)
    preview["catalogo_munify"] = [
        {"codigo": t.codigo, "nombre": t.nombre, "icono": t.icono, "color": t.color}
        for t in sorted(tipos_db, key=lambda x: x.orden)
    ]
    return preview


def _parse_fecha(v) -> Optional[date_cls]:
    if not v:
        return None
    if isinstance(v, date_cls):
        return v
    try:
        return datetime.fromisoformat(str(v)).date()
    except Exception:
        return None


@router.post("/importar-padron/confirmar")
async def importar_padron_confirmar(
    body: ImportPadronConfirmRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Paso 3: con los mappings ya revisados por el admin, baja el padron y
    crea las Partidas + Deudas en la DB. Upserts por (muni + tipo + identificador)
    para que re-ejecutar la import no duplique."""
    _require_admin(current_user)

    try:
        padron = await fetch_padron(body.url)
    except PadronInvalido as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Indexar mappings: codigo_local → tipo_tasa_codigo
    map_dict = {m.codigo_local: m.tipo_tasa_codigo for m in body.mappings}

    # Cargar tipos canonicos
    tipos_q = await db.execute(select(TipoTasa))
    tipos_por_codigo: dict[str, TipoTasa] = {t.codigo: t for t in tipos_q.scalars().all()}

    municipio_id = current_user.municipio_id
    partidas_creadas = 0
    partidas_actualizadas = 0
    deudas_creadas = 0
    tasas_saltadas = 0
    errores: list[str] = []

    for tasa in padron.get("tasas", []):
        codigo_local = tasa.get("codigo_local") or tasa.get("codigo") or ""
        tipo_codigo = map_dict.get(codigo_local)

        if not tipo_codigo:
            tasas_saltadas += 1
            continue

        tipo = tipos_por_codigo.get(tipo_codigo)
        if not tipo:
            errores.append(f"Tipo '{tipo_codigo}' no existe en Munify (saltado).")
            continue

        for p in tasa.get("partidas") or []:
            identificador = str(p.get("identificador") or "").strip()
            if not identificador:
                continue

            # Upsert partida
            existe_q = await db.execute(
                select(Partida).where(
                    Partida.municipio_id == municipio_id,
                    Partida.tipo_tasa_id == tipo.id,
                    Partida.identificador == identificador,
                )
            )
            partida = existe_q.scalar_one_or_none()

            if partida:
                partida.titular_dni = p.get("titular_dni") or partida.titular_dni
                partida.titular_nombre = p.get("titular_nombre") or partida.titular_nombre
                partida.objeto = p.get("objeto") or partida.objeto
                partidas_actualizadas += 1
            else:
                partida = Partida(
                    municipio_id=municipio_id,
                    tipo_tasa_id=tipo.id,
                    identificador=identificador,
                    titular_dni=p.get("titular_dni"),
                    titular_nombre=p.get("titular_nombre"),
                    objeto=p.get("objeto"),
                )
                db.add(partida)
                await db.flush()
                partidas_creadas += 1

            # Insertar deudas (upsert por periodo)
            for d in p.get("deudas") or []:
                periodo = str(d.get("periodo") or "").strip()
                if not periodo:
                    continue

                d_q = await db.execute(
                    select(Deuda).where(
                        Deuda.partida_id == partida.id,
                        Deuda.periodo == periodo,
                    )
                )
                if d_q.scalar_one_or_none():
                    continue  # ya existe, no duplicar

                importe = Dec(str(d.get("importe") or "0"))
                fecha_emi = _parse_fecha(d.get("fecha_emision")) or date_cls.today()
                fecha_vto = _parse_fecha(d.get("fecha_vencimiento")) or date_cls.today()
                estado_str = (d.get("estado") or "pendiente").lower()
                try:
                    estado = EstadoDeuda(estado_str)
                except ValueError:
                    estado = EstadoDeuda.PENDIENTE

                db.add(Deuda(
                    partida_id=partida.id,
                    periodo=periodo,
                    importe=importe,
                    fecha_emision=fecha_emi,
                    fecha_vencimiento=fecha_vto,
                    estado=estado,
                ))
                deudas_creadas += 1

    await db.commit()

    return {
        "ok": True,
        "partidas_creadas": partidas_creadas,
        "partidas_actualizadas": partidas_actualizadas,
        "deudas_creadas": deudas_creadas,
        "tasas_saltadas": tasas_saltadas,
        "errores": errores,
    }
