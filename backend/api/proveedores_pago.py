"""API de configuracion de proveedores de pago por municipio.

Permite que el admin del municipio habilite/deshabilite proveedores
(GIRE, MercadoPago, MODO) y los productos de cada uno. Tambien simula
la importacion de "padron" de cada proveedor con barra de progreso.
"""
import asyncio
import random
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db, AsyncSessionLocal
from core.security import require_roles
from core.tenancy import resolve_municipio_id
from models.municipio_proveedor_pago import (
    MunicipioProveedorPago,
    PROVEEDORES_VALIDOS,
    PROVEEDOR_GIRE,
    PROVEEDOR_MERCADOPAGO,
    PROVEEDOR_MODO,
)
from models.user import User
from models.enums import RolUsuario


router = APIRouter()


# ============ Schemas ============

class ProveedorPagoResponse(BaseModel):
    proveedor: str
    nombre_display: str
    descripcion: str
    activo: bool
    productos_disponibles: List[str]
    productos_activos: Dict[str, bool]
    metadata_importada: Optional[Dict[str, Any]] = None
    requiere_importacion: bool  # True si el proveedor necesita "importar padron"


class ActivarProveedorRequest(BaseModel):
    activo: bool
    productos_activos: Optional[Dict[str, bool]] = None


# ============ Catalogo de proveedores (estatico) ============

CATALOGO_PROVEEDORES = {
    PROVEEDOR_GIRE: {
        "nombre_display": "GIRE",
        "descripcion": "Ecosistema de cobros: Boton de Pago online, Rapipago (efectivo) y adhesion a debito automatico. Ideal para municipios con gran volumen de tasas.",
        "productos_disponibles": ["boton_pago", "rapipago", "adhesion_debito"],
        "requiere_importacion": True,
        "importacion_fake": {
            "titulo": "Importando padron de contribuyentes desde GIRE · Aura",
            "steps": [
                "Autenticando con Aura...",
                "Descargando catalogo de tasas...",
                "Importando padron de contribuyentes...",
                "Sincronizando codigos de barras Rapipago...",
                "Configurando webhook de conciliacion...",
                "Listo.",
            ],
            "resultado_counts": {
                "padron_cuentas": lambda: random.randint(1800, 3200),
                "categorias_tasa": lambda: random.randint(6, 14),
                "sucursales_rapipago": 4700,
                "productos_habilitados": 3,
            },
        },
    },
    PROVEEDOR_MERCADOPAGO: {
        "nombre_display": "MercadoPago",
        "descripcion": "Checkout Pro con tarjetas + QR interoperable. Se cobra por transaccion exitosa.",
        "productos_disponibles": ["boton_pago", "qr"],
        "requiere_importacion": False,
        "importacion_fake": None,
    },
    PROVEEDOR_MODO: {
        "nombre_display": "MODO",
        "descripcion": "QR interoperable de bancos argentinos. Onboarding directo desde homebanking.",
        "productos_disponibles": ["qr"],
        "requiere_importacion": False,
        "importacion_fake": None,
    },
}


# ============ Helpers ============

def _default_productos(proveedor: str) -> Dict[str, bool]:
    """Estado inicial (todos apagados) para los productos del proveedor."""
    disponibles = CATALOGO_PROVEEDORES[proveedor]["productos_disponibles"]
    return {p: False for p in disponibles}


async def _upsert_proveedor(
    db: AsyncSession,
    municipio_id: int,
    proveedor: str,
) -> MunicipioProveedorPago:
    """Trae (o crea) el registro del proveedor para este municipio."""
    r = await db.execute(
        select(MunicipioProveedorPago).where(
            MunicipioProveedorPago.municipio_id == municipio_id,
            MunicipioProveedorPago.proveedor == proveedor,
        )
    )
    row = r.scalar_one_or_none()
    if row:
        return row
    nuevo = MunicipioProveedorPago(
        municipio_id=municipio_id,
        proveedor=proveedor,
        activo=False,
        productos_activos=_default_productos(proveedor),
    )
    db.add(nuevo)
    await db.flush()
    return nuevo


# ============ Endpoints ============

@router.get("", response_model=List[ProveedorPagoResponse])
async def listar_proveedores(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([RolUsuario.ADMIN, RolUsuario.SUPERVISOR])),
):
    """Lista los proveedores con su estado (activo + productos + metadata) para el municipio."""
    municipio_id = resolve_municipio_id(request, current_user)
    if municipio_id is None:
        raise HTTPException(status_code=400, detail="Municipio no resuelto")

    # Traigo los que ya tiene guardados
    r = await db.execute(
        select(MunicipioProveedorPago).where(MunicipioProveedorPago.municipio_id == municipio_id)
    )
    existentes = {row.proveedor: row for row in r.scalars().all()}

    # Devuelvo los 3 del catalogo, tomando valores de DB si existen
    out: List[ProveedorPagoResponse] = []
    for prov_id, meta in CATALOGO_PROVEEDORES.items():
        row = existentes.get(prov_id)
        productos_activos = (row.productos_activos if row and row.productos_activos else _default_productos(prov_id))
        out.append(ProveedorPagoResponse(
            proveedor=prov_id,
            nombre_display=meta["nombre_display"],
            descripcion=meta["descripcion"],
            activo=bool(row.activo) if row else False,
            productos_disponibles=meta["productos_disponibles"],
            productos_activos=productos_activos,
            metadata_importada=(row.metadata_importada if row else None),
            requiere_importacion=meta["requiere_importacion"],
        ))
    return out


@router.put("/{proveedor}", response_model=ProveedorPagoResponse)
async def actualizar_proveedor(
    proveedor: str,
    data: ActivarProveedorRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([RolUsuario.ADMIN, RolUsuario.SUPERVISOR])),
):
    """Activa/desactiva un proveedor y ajusta sus productos."""
    if proveedor not in PROVEEDORES_VALIDOS:
        raise HTTPException(status_code=400, detail=f"Proveedor invalido: {proveedor}")

    municipio_id = resolve_municipio_id(request, current_user)
    if municipio_id is None:
        raise HTTPException(status_code=400, detail="Municipio no resuelto")

    row = await _upsert_proveedor(db, municipio_id, proveedor)
    row.activo = data.activo

    if data.productos_activos is not None:
        # Filtrar solo los productos validos para este proveedor
        disponibles = set(CATALOGO_PROVEEDORES[proveedor]["productos_disponibles"])
        filtrados = {k: bool(v) for k, v in data.productos_activos.items() if k in disponibles}
        # Completar con defaults los que no vinieron
        completo = _default_productos(proveedor)
        completo.update(filtrados)
        row.productos_activos = completo

    await db.commit()
    await db.refresh(row)

    meta = CATALOGO_PROVEEDORES[proveedor]
    return ProveedorPagoResponse(
        proveedor=proveedor,
        nombre_display=meta["nombre_display"],
        descripcion=meta["descripcion"],
        activo=row.activo,
        productos_disponibles=meta["productos_disponibles"],
        productos_activos=row.productos_activos or _default_productos(proveedor),
        metadata_importada=row.metadata_importada,
        requiere_importacion=meta["requiere_importacion"],
    )


@router.post("/{proveedor}/importar-padron")
async def importar_padron(
    proveedor: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([RolUsuario.ADMIN, RolUsuario.SUPERVISOR])),
):
    """
    Simula la importacion de padron/metadata del proveedor. Devuelve un
    stream de eventos (Server-Sent Events) con los pasos + progreso, y
    al final guarda el resumen en `metadata_importada`.
    """
    if proveedor not in PROVEEDORES_VALIDOS:
        raise HTTPException(status_code=400, detail=f"Proveedor invalido: {proveedor}")

    meta = CATALOGO_PROVEEDORES[proveedor]
    if not meta["requiere_importacion"] or not meta["importacion_fake"]:
        raise HTTPException(status_code=400, detail=f"El proveedor {proveedor} no requiere importacion")

    municipio_id = resolve_municipio_id(request, current_user)
    if municipio_id is None:
        raise HTTPException(status_code=400, detail="Municipio no resuelto")

    # Aseguro que el registro exista y capturo su id (se puede importar antes de activar)
    row = await _upsert_proveedor(db, municipio_id, proveedor)
    await db.commit()
    row_id = row.id

    importacion = meta["importacion_fake"]
    steps: List[str] = importacion["steps"]
    resultado_spec: Dict[str, Any] = importacion["resultado_counts"]

    # Calculo los counts una sola vez (para que el stream y la DB coincidan)
    resultado: Dict[str, Any] = {}
    for k, v in resultado_spec.items():
        resultado[k] = v() if callable(v) else v
    resultado["importado_at"] = datetime.now(timezone.utc).isoformat()
    resultado["proveedor"] = proveedor

    async def event_stream():
        import json as _json
        total = len(steps)
        for i, step in enumerate(steps):
            # Delay entre 400-900 ms por paso para que se vea la barra progresar
            await asyncio.sleep(random.uniform(0.4, 0.9))
            progress = int((i + 1) / total * 100)
            payload = {
                "step": step,
                "progress": progress,
                "step_index": i,
                "total_steps": total,
            }
            yield f"data: {_json.dumps(payload)}\n\n"

        # Guardar metadata con session fresca (el db del endpoint ya esta cerrado)
        try:
            async with AsyncSessionLocal() as db_local:
                r2 = await db_local.execute(
                    select(MunicipioProveedorPago).where(MunicipioProveedorPago.id == row_id)
                )
                r_row = r2.scalar_one_or_none()
                if r_row:
                    r_row.metadata_importada = resultado
                    await db_local.commit()
        except Exception as e:
            print(f"[IMPORT PADRON] Error guardando metadata: {e}")

        # Ultimo evento con el resumen
        final_payload = {
            "step": "completed",
            "progress": 100,
            "step_index": total,
            "total_steps": total,
            "resultado": resultado,
        }
        yield f"data: {_json.dumps(final_payload)}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")
