"""Conciliacion bancaria: matchear extracto del banco vs movimientos de caja.

Workflow:
  1. POST /import?caja_id=X con un CSV adjunto del extracto bancario
  2. El sistema parsea, busca matches por (monto exacto, fecha +/- 2 dias) en
     movimientos de la caja no conciliados, y marca los matches encontrados
  3. Devuelve un resumen con matched/unmatched (para mostrarlo en UI)
  4. Movimientos sin match quedan para conciliar manualmente

Formato CSV esperado (flexible — detecta columnas por nombre):
  fecha | descripcion | debe | haber | monto | referencia

Acepta CSV con `,` o `;` como separador.
"""
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Optional, List
import csv
import io

from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File, Query
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.security import get_current_user
from core.tenancy import get_effective_municipio_id
from models import (
    TesoreriaMovimientoCaja, TipoMovimientoCaja, TesoreriaCaja,
    User, RolUsuario,
)
from pydantic import BaseModel

router = APIRouter()


def _require_admin(user: User):
    if user.rol not in (RolUsuario.ADMIN, RolUsuario.SUPERVISOR):
        raise HTTPException(403, "Sin permisos")


def _parse_fecha(s: str) -> Optional[date]:
    """Acepta YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY."""
    s = (s or "").strip()
    if not s:
        return None
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%d/%m/%y"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return None


def _parse_monto(s: str) -> Optional[Decimal]:
    """Acepta '1234.56', '1.234,56', '1,234.56', con o sin signo."""
    s = (s or "").strip().replace("$", "").replace(" ", "")
    if not s:
        return None
    # Si tiene tanto , como . : el ultimo es el decimal
    if "," in s and "." in s:
        if s.rfind(",") > s.rfind("."):
            s = s.replace(".", "").replace(",", ".")
        else:
            s = s.replace(",", "")
    elif "," in s:
        # Solo coma: tratarla como decimal si hay 1-2 digitos despues
        parts = s.split(",")
        if len(parts) == 2 and len(parts[1]) <= 2:
            s = s.replace(",", ".")
        else:
            s = s.replace(",", "")
    try:
        return Decimal(s)
    except Exception:
        return None


class ConciliacionResultLinea(BaseModel):
    linea_csv: int
    fecha: Optional[str]
    descripcion: str
    monto: Optional[str]
    tipo: Optional[str]  # 'ingreso' | 'egreso'
    matched_movimiento_id: Optional[int] = None
    movimiento_concepto: Optional[str] = None
    razon_no_match: Optional[str] = None


class ConciliacionImportResponse(BaseModel):
    total_lineas: int
    matched: int
    unmatched: int
    movimientos_marcados: int
    lineas: List[ConciliacionResultLinea]


@router.post("/import", response_model=ConciliacionImportResponse)
async def import_extracto(
    request: Request,
    caja_id: int = Query(..., description="Caja contra la cual se concilia"),
    dias_tolerancia: int = Query(2, ge=0, le=15, description="Diferencia maxima de dias entre extracto y movimiento"),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Importa un extracto bancario y auto-matchea contra movimientos de la
    caja. Solo movimientos no conciliados son candidatos.

    Cada movimiento solo puede matchear con una linea (primer match gana).
    """
    _require_admin(current_user)
    municipio_id = get_effective_municipio_id(request, current_user)

    caja = (await db.execute(
        select(TesoreriaCaja).where(
            TesoreriaCaja.id == caja_id,
            TesoreriaCaja.municipio_id == municipio_id,
        )
    )).scalar_one_or_none()
    if not caja:
        raise HTTPException(422, "Caja invalida")

    # Leer y decodificar
    raw = await file.read()
    try:
        text_data = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        try:
            text_data = raw.decode("latin-1")
        except Exception:
            raise HTTPException(422, "No pude decodificar el archivo (probar UTF-8 o Latin-1)")

    # Detectar separador
    sample = text_data[:2048]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",;\t")
    except csv.Error:
        dialect = csv.excel  # default ,

    reader = csv.DictReader(io.StringIO(text_data), dialect=dialect)
    if not reader.fieldnames:
        raise HTTPException(422, "El CSV no tiene encabezados")

    # Normalizar nombres de columnas (insensible a mayusculas/acentos)
    def norm(s: str) -> str:
        return (s or "").strip().lower().replace("á", "a").replace("é", "e").replace("í", "i").replace("ó", "o").replace("ú", "u")

    headers_norm = {norm(h): h for h in reader.fieldnames}

    def get(row, *names) -> str:
        for n in names:
            real = headers_norm.get(n)
            if real and row.get(real):
                return row[real]
        return ""

    # Movimientos candidatos: no conciliados, de esta caja
    candidatos = list((await db.execute(
        select(TesoreriaMovimientoCaja).where(
            TesoreriaMovimientoCaja.caja_id == caja_id,
            TesoreriaMovimientoCaja.municipio_id == municipio_id,
            TesoreriaMovimientoCaja.conciliado.is_(False),
        )
    )).scalars().all())

    candidatos_usados: set[int] = set()
    resultado: List[ConciliacionResultLinea] = []
    matched_count = 0

    for i, row in enumerate(reader, start=2):  # start=2 = primera fila de datos
        fecha_str = get(row, "fecha", "date")
        desc = get(row, "descripcion", "description", "detalle", "concepto") or ""
        debe_str = get(row, "debe", "debito")
        haber_str = get(row, "haber", "credito", "credit")
        monto_str = get(row, "monto", "importe", "amount")
        ref = get(row, "referencia", "ref", "nro", "id")

        fecha = _parse_fecha(fecha_str)
        debe = _parse_monto(debe_str)
        haber = _parse_monto(haber_str)
        monto = _parse_monto(monto_str)

        # Determinar monto y tipo
        if debe and debe > 0:
            mt = TipoMovimientoCaja.EGRESO
            mvalor = debe
        elif haber and haber > 0:
            mt = TipoMovimientoCaja.INGRESO
            mvalor = haber
        elif monto is not None:
            if monto < 0:
                mt = TipoMovimientoCaja.EGRESO
                mvalor = abs(monto)
            else:
                mt = TipoMovimientoCaja.INGRESO
                mvalor = monto
        else:
            resultado.append(ConciliacionResultLinea(
                linea_csv=i, fecha=fecha_str, descripcion=desc[:200], monto=None,
                tipo=None, razon_no_match="No pude leer monto (revisar columnas debe/haber/monto)",
            ))
            continue

        if not fecha:
            resultado.append(ConciliacionResultLinea(
                linea_csv=i, fecha=fecha_str, descripcion=desc[:200], monto=str(mvalor),
                tipo=mt.value, razon_no_match="Fecha no parseable",
            ))
            continue

        # Buscar match por monto exacto + fecha +/- N dias + mismo tipo
        match = None
        for c in candidatos:
            if c.id in candidatos_usados:
                continue
            if c.tipo != mt:
                continue
            if Decimal(c.monto) != mvalor:
                continue
            if abs((c.fecha - fecha).days) > dias_tolerancia:
                continue
            match = c
            break

        if match:
            match.conciliado = True
            match.ref_extracto = ref or f"linea {i}"
            match.fecha_conciliacion = datetime.utcnow()
            candidatos_usados.add(match.id)
            matched_count += 1
            resultado.append(ConciliacionResultLinea(
                linea_csv=i, fecha=fecha.isoformat(), descripcion=desc[:200], monto=str(mvalor),
                tipo=mt.value,
                matched_movimiento_id=match.id,
                movimiento_concepto=match.concepto,
            ))
        else:
            resultado.append(ConciliacionResultLinea(
                linea_csv=i, fecha=fecha.isoformat(), descripcion=desc[:200], monto=str(mvalor),
                tipo=mt.value,
                razon_no_match=f"Sin movimiento de caja {mt.value} por ${mvalor} en +/- {dias_tolerancia} dias de {fecha}",
            ))

    await db.commit()

    return ConciliacionImportResponse(
        total_lineas=len(resultado),
        matched=matched_count,
        unmatched=len(resultado) - matched_count,
        movimientos_marcados=len(candidatos_usados),
        lineas=resultado,
    )


@router.get("/pendientes")
async def listar_movimientos_pendientes(
    request: Request,
    caja_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Movimientos NO conciliados de la caja: candidatos a conciliar manualmente
    si el auto-match no los pesco."""
    _require_admin(current_user)
    municipio_id = get_effective_municipio_id(request, current_user)
    rows = (await db.execute(
        select(TesoreriaMovimientoCaja).where(
            TesoreriaMovimientoCaja.caja_id == caja_id,
            TesoreriaMovimientoCaja.municipio_id == municipio_id,
            TesoreriaMovimientoCaja.conciliado.is_(False),
        ).order_by(TesoreriaMovimientoCaja.fecha.desc())
    )).scalars().all()
    return [
        {
            "id": m.id,
            "tipo": m.tipo.value if hasattr(m.tipo, "value") else str(m.tipo),
            "fecha": m.fecha.isoformat(),
            "monto": str(m.monto),
            "concepto": m.concepto,
        }
        for m in rows
    ]


class ConciliarManualRequest(BaseModel):
    movimiento_id: int
    ref_extracto: Optional[str] = None


@router.post("/manual")
async def conciliar_manual(
    payload: ConciliarManualRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Marca manualmente un movimiento como conciliado (sin importar CSV)."""
    _require_admin(current_user)
    municipio_id = get_effective_municipio_id(request, current_user)
    m = (await db.execute(
        select(TesoreriaMovimientoCaja).where(
            TesoreriaMovimientoCaja.id == payload.movimiento_id,
            TesoreriaMovimientoCaja.municipio_id == municipio_id,
        )
    )).scalar_one_or_none()
    if not m:
        raise HTTPException(404, "Movimiento no encontrado")
    m.conciliado = True
    m.ref_extracto = payload.ref_extracto or "manual"
    m.fecha_conciliacion = datetime.utcnow()
    await db.commit()
    return {"ok": True, "id": m.id}


@router.post("/desmarcar/{movimiento_id}")
async def desmarcar_conciliacion(
    movimiento_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Saca la marca de conciliado (por si fue un match erroneo)."""
    _require_admin(current_user)
    municipio_id = get_effective_municipio_id(request, current_user)
    m = (await db.execute(
        select(TesoreriaMovimientoCaja).where(
            TesoreriaMovimientoCaja.id == movimiento_id,
            TesoreriaMovimientoCaja.municipio_id == municipio_id,
        )
    )).scalar_one_or_none()
    if not m:
        raise HTTPException(404, "Movimiento no encontrado")
    m.conciliado = False
    m.ref_extracto = None
    m.fecha_conciliacion = None
    await db.commit()
    return {"ok": True, "id": m.id}
