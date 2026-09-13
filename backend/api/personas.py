"""Personas: la libreta única de la app y su catálogo de tipos con subtipos.

Plan: docs/tesoreria/04-plan-integral-persona-y-obras.md (F1) y 05 (subtipos, SPN).

Regla de convivencia con el backend publicado (F1 a F5): la tabla física sigue siendo
`contactos` y el enum viejo `contactos.tipo` se escribe SIEMPRE como espejo del rol
principal (services.persona_tipos.tipo_legacy). Nada de lo que hace este router cambia
lo que devuelven los endpoints de Tesorería; el gate de paridad de SPN lo demuestra.

Una persona puede ser varias cosas (empleado que además factura). Los tipos son un
catálogo por municipio con subtipos (el "tipo de empleado" de San Pedro Norte es un
subtipo de `empleado`). La ficha laboral existe sólo si es empleado; el login sólo si
tiene usuario.
"""
from collections import defaultdict
from datetime import date
from decimal import Decimal
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from core.database import get_db
from core.security import get_current_user
from core.tenancy import get_effective_municipio_id
from models import (
    Contacto, Empleado, EmpleadoCuadrilla, Gasto, PersonaRol, PersonaTipo, RolUsuario,
    TesoreriaPagoProgramado, User, MODALIDADES,
)
from schemas.persona import (
    AccesoOut, EconomicaOut, FichaLaboralOut, PersonaCreate, PersonaFicha, PersonaListado,
    PersonaResumen, PersonaRolOut, PersonaTipoCreate, PersonaTipoOut, PersonaTipoUpdate,
    PersonaUpdate,
)
from services.persona_tipos import tipo_legacy

router = APIRouter()


def _require_staff(user: User):
    if user.rol not in (RolUsuario.ADMIN, RolUsuario.SUPERVISOR):
        raise HTTPException(status_code=403, detail="Sin permisos")


# ---------------------------------------------------------------------------
# Catálogo: Persona -> tipo -> subtipo
# ---------------------------------------------------------------------------

async def _cargar_catalogo(db: AsyncSession, muni_id: int, solo_activos: bool) -> List[PersonaTipoOut]:
    q = select(PersonaTipo).where(PersonaTipo.municipio_id == muni_id)
    if solo_activos:
        q = q.where(PersonaTipo.activo.is_(True))
    tipos = (await db.execute(q.order_by(PersonaTipo.orden, PersonaTipo.nombre))).scalars().all()
    conteo = dict((await db.execute(
        select(PersonaRol.tipo_id, func.count(PersonaRol.id))
        .where(PersonaRol.municipio_id == muni_id).group_by(PersonaRol.tipo_id)
    )).all())
    por_id: Dict[int, PersonaTipoOut] = {}
    for t in tipos:
        por_id[t.id] = PersonaTipoOut(
            id=t.id, codigo=t.codigo, nombre=t.nombre, descripcion=t.descripcion, color=t.color,
            icono=t.icono, orden=t.orden, cobra=t.cobra, activo=t.activo, padre_id=t.padre_id,
            cantidad=conteo.get(t.id, 0), subtipos=[],
        )
    raices: List[PersonaTipoOut] = []
    for t in tipos:
        nodo = por_id[t.id]
        if t.padre_id and t.padre_id in por_id:
            padre = por_id[t.padre_id]
            padre.subtipos.append(nodo)
            padre.cantidad += nodo.cantidad   # el padre cuenta a los de sus subtipos
        else:
            raices.append(nodo)
    return raices


@router.get("/tipos", response_model=List[PersonaTipoOut])
async def listar_tipos(
    request: Request,
    activos: bool = True,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """El árbol de tipos del municipio, con cuántas personas hay en cada uno."""
    _require_staff(current_user)
    muni_id = get_effective_municipio_id(request, current_user)
    return await _cargar_catalogo(db, muni_id, activos)


@router.post("/tipos", response_model=PersonaTipoOut, status_code=201)
async def crear_tipo(
    payload: PersonaTipoCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_staff(current_user)
    muni_id = get_effective_municipio_id(request, current_user)
    if payload.padre_id:
        padre = (await db.execute(select(PersonaTipo).where(
            PersonaTipo.id == payload.padre_id, PersonaTipo.municipio_id == muni_id))).scalar_one_or_none()
        if not padre:
            raise HTTPException(status_code=404, detail="El tipo padre no existe en este municipio")
        if padre.padre_id:
            raise HTTPException(status_code=400, detail="Un subtipo no puede tener subtipos: son dos niveles")
    tipo = PersonaTipo(municipio_id=muni_id, **payload.model_dump())
    db.add(tipo)
    await db.commit()
    await db.refresh(tipo)
    return PersonaTipoOut.model_validate(tipo)


@router.put("/tipos/{tipo_id}", response_model=PersonaTipoOut)
async def editar_tipo(
    tipo_id: int,
    payload: PersonaTipoUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_staff(current_user)
    muni_id = get_effective_municipio_id(request, current_user)
    tipo = (await db.execute(select(PersonaTipo).where(
        PersonaTipo.id == tipo_id, PersonaTipo.municipio_id == muni_id))).scalar_one_or_none()
    if not tipo:
        raise HTTPException(status_code=404, detail="Tipo no encontrado")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(tipo, k, v)
    await db.commit()
    await db.refresh(tipo)
    return PersonaTipoOut.model_validate(tipo)


# ---------------------------------------------------------------------------
# Personas
# ---------------------------------------------------------------------------

async def _roles_de(db: AsyncSession, muni_id: int, persona_ids: List[int]) -> Dict[int, List[PersonaRolOut]]:
    """Los roles de muchas personas en UNA consulta (nada de N+1)."""
    if not persona_ids:
        return {}
    padre = PersonaTipo.__table__.alias("padre")
    rows = (await db.execute(
        select(PersonaRol.persona_id, PersonaRol.tipo_id, PersonaTipo.codigo, PersonaTipo.nombre,
               padre.c.codigo, PersonaRol.principal)
        .join(PersonaTipo, PersonaTipo.id == PersonaRol.tipo_id)
        .outerjoin(padre, padre.c.id == PersonaTipo.padre_id)
        .where(PersonaRol.municipio_id == muni_id, PersonaRol.persona_id.in_(persona_ids))
        .order_by(PersonaRol.principal.desc(), PersonaTipo.orden)
    )).all()
    out: Dict[int, List[PersonaRolOut]] = defaultdict(list)
    for pid, tid, codigo, nombre, padre_codigo, principal in rows:
        out[pid].append(PersonaRolOut(tipo_id=tid, codigo=codigo, nombre=nombre,
                                      padre_codigo=padre_codigo, principal=bool(principal)))
    return out


def _resumen(c: Contacto, roles: List[PersonaRolOut], tiene_laboral: bool, tiene_login: bool) -> PersonaResumen:
    return PersonaResumen(
        id=c.id, nombre=c.nombre, apellido=c.apellido, nombre_completo=c.nombre_completo,
        dni=c.dni, cuit=c.cuit, telefono=c.telefono, email=c.email,
        tipo_legacy=c.tipo.value if hasattr(c.tipo, "value") else str(c.tipo),
        roles=roles, tiene_ficha_laboral=tiene_laboral, tiene_login=tiene_login,
        activo=c.activo, created_at=c.created_at,
    )


@router.get("", response_model=PersonaListado)
async def listar_personas(
    request: Request,
    q: Optional[str] = Query(None, description="nombre, apellido, dni, cuit o alias"),
    tipo: Optional[str] = Query(None, description="código del tipo o subtipo"),
    activo: Optional[bool] = True,
    page: int = 1,
    page_size: int = Query(50, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_staff(current_user)
    muni_id = get_effective_municipio_id(request, current_user)

    base = select(Contacto).where(Contacto.municipio_id == muni_id)
    if activo is not None:
        base = base.where(Contacto.activo.is_(activo))
    if q:
        like = f"%{q.strip()}%"
        base = base.where(or_(Contacto.nombre.ilike(like), Contacto.apellido.ilike(like),
                              Contacto.dni.ilike(like), Contacto.cuit.ilike(like),
                              Contacto.alias_pago.ilike(like)))
    if tipo:
        # Por tipo o subtipo: un tipo padre incluye a las personas de sus subtipos.
        ids_tipo = select(PersonaTipo.id).where(PersonaTipo.municipio_id == muni_id, or_(
            PersonaTipo.codigo == tipo,
            PersonaTipo.padre_id.in_(select(PersonaTipo.id).where(
                PersonaTipo.municipio_id == muni_id, PersonaTipo.codigo == tipo)),
        ))
        sub = select(PersonaRol.persona_id).where(PersonaRol.municipio_id == muni_id,
                                                  PersonaRol.tipo_id.in_(ids_tipo))
        base = base.where(Contacto.id.in_(sub))

    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar() or 0
    filas = (await db.execute(
        base.order_by(Contacto.apellido.is_(None), Contacto.apellido, Contacto.nombre)
        .offset((page - 1) * page_size).limit(page_size)
    )).scalars().all()
    ids = [c.id for c in filas]
    roles = await _roles_de(db, muni_id, ids)
    con_laboral = set((await db.execute(
        select(Empleado.persona_id).where(Empleado.persona_id.in_(ids)))).scalars().all()) if ids else set()
    con_login = set((await db.execute(
        select(User.persona_id).where(User.persona_id.in_(ids)))).scalars().all()) if ids else set()

    # KPIs del hero, sobre todo el padrón activo del municipio
    padron = select(Contacto.id).where(Contacto.municipio_id == muni_id, Contacto.activo.is_(True))
    total_personas = (await db.execute(select(func.count()).select_from(padron.subquery()))).scalar() or 0
    hoy = date.today()
    cobran = (await db.execute(
        select(func.count(func.distinct(TesoreriaPagoProgramado.contacto_id)))
        .where(TesoreriaPagoProgramado.municipio_id == muni_id, TesoreriaPagoProgramado.activo.is_(True),
               func.extract("year", TesoreriaPagoProgramado.proximo_pago) == hoy.year,
               func.extract("month", TesoreriaPagoProgramado.proximo_pago) == hoy.month)
    )).scalar() or 0
    trabajan = (await db.execute(
        select(func.count(func.distinct(Empleado.persona_id)))
        .where(Empleado.municipio_id == muni_id, Empleado.activo.is_(True), Empleado.persona_id.isnot(None))
    )).scalar() or 0
    sin_documento = (await db.execute(
        select(func.count()).select_from(padron.where(
            or_(Contacto.dni.is_(None), Contacto.dni == ""), or_(Contacto.cuit.is_(None), Contacto.cuit == "")).subquery())
    )).scalar() or 0
    sin_tipo = (await db.execute(
        select(func.count()).select_from(padron.where(Contacto.tipo == "otro").subquery())
    )).scalar() or 0

    return PersonaListado(
        items=[_resumen(c, roles.get(c.id, []), c.id in con_laboral, c.id in con_login) for c in filas],
        total=total, page=page, page_size=page_size,
        total_personas=total_personas, cobran_este_mes=cobran, trabajan=trabajan,
        sin_documento=sin_documento, sin_tipo=sin_tipo,
    )


@router.get("/{persona_id}", response_model=PersonaFicha)
async def ficha_persona(
    persona_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """La ficha: identidad siempre; laboral, económica y acceso sólo si existen."""
    _require_staff(current_user)
    muni_id = get_effective_municipio_id(request, current_user)
    c = (await db.execute(select(Contacto).where(
        Contacto.id == persona_id, Contacto.municipio_id == muni_id))).scalar_one_or_none()
    if not c:
        raise HTTPException(status_code=404, detail="Persona no encontrada")
    roles = (await _roles_de(db, muni_id, [c.id])).get(c.id, [])

    emp = (await db.execute(
        select(Empleado).options(
            selectinload(Empleado.municipio_dependencia), selectinload(Empleado.zona_asignada),
            selectinload(Empleado.cuadrillas_asignadas).selectinload(EmpleadoCuadrilla.cuadrilla))
        .where(Empleado.persona_id == c.id)
    )).scalars().first()
    laboral = None
    if emp:
        laboral = FichaLaboralOut(
            empleado_id=emp.id, modalidad=emp.modalidad, tipo_legacy=emp.tipo, especialidad=emp.especialidad,
            dependencia=getattr(emp.municipio_dependencia, "nombre", None),
            zona=getattr(emp.zona_asignada, "nombre", None),
            cuadrillas=[ec.cuadrilla.nombre for ec in emp.cuadrillas_asignadas if ec.cuadrilla and ec.activo],
            activo=bool(emp.activo),
        )

    n_gastos, total = (await db.execute(
        select(func.count(Gasto.id), func.coalesce(func.sum(Gasto.monto_pesos), 0))
        .where(Gasto.destino_contacto_id == c.id, Gasto.activo.is_(True))
    )).one()
    prog = (await db.execute(
        select(func.count(TesoreriaPagoProgramado.id), func.max(TesoreriaPagoProgramado.ultimo_pago))
        .where(TesoreriaPagoProgramado.contacto_id == c.id, TesoreriaPagoProgramado.activo.is_(True))
    )).one()
    economica = None
    if n_gastos or prog[0]:
        economica = EconomicaOut(gastos=int(n_gastos), total_gastos=Decimal(str(total or 0)),
                                 pagos_programados_activos=int(prog[0] or 0), ultimo_pago=prog[1])

    u = (await db.execute(select(User).where(User.persona_id == c.id))).scalars().first()
    acceso = AccesoOut(usuario_id=u.id, email=u.email, rol=u.rol.value if hasattr(u.rol, "value") else str(u.rol),
                       activo=bool(u.activo)) if u else None

    base = _resumen(c, roles, emp is not None, u is not None)
    return PersonaFicha(
        **base.model_dump(),
        direccion=c.direccion, latitud=c.latitud, longitud=c.longitud, iibb=c.iibb,
        condicion_iva=c.condicion_iva, codigo_tributario=c.codigo_tributario, alias_pago=c.alias_pago,
        notas=c.notas, laboral=laboral, economica=economica, acceso=acceso,
    )


async def _aplicar_roles(db: AsyncSession, muni_id: int, c: Contacto, tipo_ids: List[int]) -> None:
    """Reemplaza los roles de la persona y espeja el principal en el enum viejo."""
    tipos = (await db.execute(select(PersonaTipo).where(
        PersonaTipo.municipio_id == muni_id, PersonaTipo.id.in_(tipo_ids)))).scalars().all() if tipo_ids else []
    if len(tipos) != len(set(tipo_ids)):
        raise HTTPException(status_code=400, detail="Algún tipo no existe en este municipio")
    por_id = {t.id: t for t in tipos}
    actuales = (await db.execute(select(PersonaRol).where(PersonaRol.persona_id == c.id))).scalars().all()
    for r in actuales:
        await db.delete(r)
    for i, tid in enumerate(tipo_ids):
        db.add(PersonaRol(municipio_id=muni_id, persona_id=c.id, tipo_id=tid, principal=(i == 0)))
    if tipo_ids:
        principal = por_id[tipo_ids[0]]
        # El espejo usa el código del tipo raíz (un subtipo hereda el enum de su padre).
        codigo = principal.codigo
        if principal.padre_id:
            padre = (await db.execute(select(PersonaTipo).where(PersonaTipo.id == principal.padre_id))).scalar_one()
            codigo = padre.codigo
        c.tipo = tipo_legacy(codigo)


async def _asegurar_ficha_laboral(db: AsyncSession, muni_id: int, c: Contacto, tipo_ids: List[int],
                                  modalidad: Optional[str], dependencia_id: Optional[int]) -> None:
    """Si la persona es empleado, tiene ficha laboral; se crea si falta."""
    if modalidad and modalidad not in MODALIDADES:
        raise HTTPException(status_code=400, detail=f"Modalidad inválida. Válidas: {', '.join(MODALIDADES)}")
    if not tipo_ids:
        return
    padre = PersonaTipo.__table__.alias("padre")
    codigos = set((await db.execute(
        select(func.coalesce(padre.c.codigo, PersonaTipo.codigo))
        .select_from(PersonaTipo)
        .outerjoin(padre, padre.c.id == PersonaTipo.padre_id)
        .where(PersonaTipo.id.in_(tipo_ids)))).scalars().all())
    if "empleado" not in codigos:
        return
    emp = (await db.execute(select(Empleado).where(Empleado.persona_id == c.id))).scalars().first()
    if not emp:
        emp = Empleado(municipio_id=muni_id, nombre=c.nombre, apellido=c.apellido, telefono=c.telefono,
                       persona_id=c.id, activo=True)
        db.add(emp)
    if modalidad is not None:
        emp.modalidad = modalidad
    if dependencia_id is not None:
        emp.municipio_dependencia_id = dependencia_id


@router.post("", response_model=PersonaFicha, status_code=201)
async def crear_persona(
    payload: PersonaCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_staff(current_user)
    muni_id = get_effective_municipio_id(request, current_user)
    datos = payload.model_dump(exclude={"tipo_ids", "modalidad", "municipio_dependencia_id"})
    for k in ("dni", "cuit"):
        if datos.get(k) == "":
            datos[k] = None
    c = Contacto(municipio_id=muni_id, activo=True, **datos)
    c.tipo = tipo_legacy(None)
    db.add(c)
    await db.flush()
    await _aplicar_roles(db, muni_id, c, payload.tipo_ids)
    await _asegurar_ficha_laboral(db, muni_id, c, payload.tipo_ids, payload.modalidad, payload.municipio_dependencia_id)
    await db.commit()
    return await ficha_persona(c.id, request, db, current_user)


@router.put("/{persona_id}", response_model=PersonaFicha)
async def editar_persona(
    persona_id: int,
    payload: PersonaUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_staff(current_user)
    muni_id = get_effective_municipio_id(request, current_user)
    c = (await db.execute(select(Contacto).where(
        Contacto.id == persona_id, Contacto.municipio_id == muni_id))).scalar_one_or_none()
    if not c:
        raise HTTPException(status_code=404, detail="Persona no encontrada")
    cambios = payload.model_dump(exclude_unset=True)
    tipo_ids = cambios.pop("tipo_ids", None)
    modalidad = cambios.pop("modalidad", None)
    dependencia_id = cambios.pop("municipio_dependencia_id", None)
    for k, v in cambios.items():
        setattr(c, k, None if (k in ("dni", "cuit") and v == "") else v)
    if tipo_ids is not None:
        await _aplicar_roles(db, muni_id, c, tipo_ids)
    if tipo_ids is not None or modalidad is not None or dependencia_id is not None:
        ids = tipo_ids if tipo_ids is not None else [
            r.tipo_id for r in (await db.execute(select(PersonaRol).where(PersonaRol.persona_id == c.id))).scalars().all()]
        await _asegurar_ficha_laboral(db, muni_id, c, ids, modalidad, dependencia_id)
    await db.commit()
    return await ficha_persona(c.id, request, db, current_user)
