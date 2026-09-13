"""Obras: Obra = Proyecto de tipo `obra`, con etapas, plata por etapa y gente.

Plan: docs/tesoreria/04-plan-integral-persona-y-obras.md (F2) y docs/obras/02.

Principios (dueño, 2026-09-12/13):
  - La plata se registra UNA vez, en `gastos`; acá sólo se lee y se imputa por etapa.
  - La asignación de gastos a etapas PROPONE y la persona confirma. Nunca imputa en
    silencio salvo cuando el gasto nace desde la obra (origen `automatica`).
  - Obras y programas conviven en la misma tabla; `tipo` los separa.
  - Toda pantalla lleva su narrativa semántica: la `frase` la arma este módulo.
"""
from collections import defaultdict
from datetime import date
from decimal import Decimal
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.security import get_current_user
from core.tenancy import get_effective_municipio_id
from models import (
    Contacto, Cuadrilla, Empleado, Gasto, GastoProyecto, ObraEtapa, OrdenTrabajo, Proyecto,
    RolUsuario, User,
)
from models.barrio import Barrio
from schemas.obra import (
    ConfirmarImputaciones, EtapaActual, EtapaIn, EtapaOut, GastoDeObra, GenteDeObra, MesDeObra,
    ObraBase, ObraCreate, ObraDetalle, ObraKpis, ObraResumen, ObraUpdate, ObrasKpis, ObrasListado,
    PersonaRef, ProveedorDeObra,
)

router = APIRouter()

RUBRO_POR_TIPO = {
    "contratista": "contratista",
    "proveedor": "materiales",
    "empleado": "mano_de_obra",
    "profesional": "contratista",
}


def _require_staff(user: User):
    if user.rol not in (RolUsuario.ADMIN, RolUsuario.SUPERVISOR):
        raise HTTPException(status_code=403, detail="Sin permisos")


def _money(v) -> Decimal:
    return Decimal(str(v or 0)).quantize(Decimal("0.01"))


def _fmt_m(v: Decimal) -> str:
    return f"${(v / Decimal(1_000_000)).quantize(Decimal('0.1'))} M".replace(".", ",")


def _avance_derivado(p: Proyecto, etapas: List[ObraEtapa]) -> Optional[int]:
    """Avance real = suma(avance × incidencia) / 100 si hay etapas; si no, el manual."""
    if etapas and any(Decimal(str(e.incidencia_pct or 0)) > 0 for e in etapas):
        total = sum(Decimal(str(e.incidencia_pct or 0)) for e in etapas) or Decimal(1)
        return int(round(sum(Decimal(e.avance_pct or 0) * Decimal(str(e.incidencia_pct or 0)) for e in etapas) / total))
    return p.avance


def _etapa_en_curso(etapas: List[ObraEtapa], hoy: date) -> Optional[ObraEtapa]:
    en_curso = [e for e in etapas if e.estado == "en_curso"]
    if en_curso:
        return en_curso[0]
    for e in etapas:
        ini = e.fecha_inicio_real or e.fecha_inicio_prevista
        fin = e.fecha_fin_real or e.fecha_fin_prevista
        if ini and fin and ini <= hoy <= fin and e.estado != "terminada":
            return e
    return None


def _atraso(p: Proyecto, etapas: List[ObraEtapa], hoy: date, avance: Optional[int]) -> int:
    """Días de atraso: la etapa en curso pasada de su fin previsto, o la obra pasada de su fin."""
    e = _etapa_en_curso(etapas, hoy)
    if e and e.fecha_fin_prevista and e.fecha_fin_prevista < hoy and e.estado != "terminada":
        return (hoy - e.fecha_fin_prevista).days
    if p.fecha_fin and p.fecha_fin < hoy and (avance or 0) < 100 and p.estado != "finalizado":
        return (hoy - p.fecha_fin).days
    return 0


def _veredicto(avance: Optional[int], ejecutado: Decimal, presupuesto: Optional[Decimal], atraso: int):
    """Desvío de plata: gastó bastante más de lo que avanzó. Atraso: se pasó del plazo."""
    if presupuesto and presupuesto > 0 and avance is not None:
        pct_plata = float(ejecutado / presupuesto * 100)
        if pct_plata > avance + 15 and pct_plata > 20:
            return "malo", f"gastó el {int(pct_plata)}% con el {avance}% de avance"
    if atraso > 0:
        return "advertencia", f"atrasada {atraso} días"
    if avance is not None and presupuesto:
        return "bueno", "en plazo y en plata"
    return "bueno", "en plazo"


def _etapa_propuesta(etapas: List[ObraEtapa], fecha: date) -> Optional[int]:
    """La etapa en curso a la fecha del gasto, si hay UNA sola. Dos a la vez ⇒ se pide confirmar."""
    candidatas = []
    for e in etapas:
        ini = e.fecha_inicio_real or e.fecha_inicio_prevista
        fin = e.fecha_fin_real or e.fecha_fin_prevista
        if ini and fin and ini <= fecha <= fin:
            candidatas.append(e)
    if len(candidatas) == 1:
        return candidatas[0].id
    if len(candidatas) > 1:
        return max(candidatas, key=lambda e: Decimal(str(e.incidencia_pct or 0))).id
    return None


async def _imputaciones(db: AsyncSession, proyecto_ids: List[int]):
    """Todas las imputaciones de estas obras con su gasto y la persona destino, en una consulta."""
    if not proyecto_ids:
        return []
    rows = (await db.execute(
        select(GastoProyecto, Gasto, Contacto)
        .join(Gasto, Gasto.id == GastoProyecto.gasto_id)
        .outerjoin(Contacto, Contacto.id == Gasto.destino_contacto_id)
        .where(GastoProyecto.proyecto_id.in_(proyecto_ids), Gasto.activo.is_(True))
        .order_by(Gasto.fecha)
    )).all()
    return rows


def _rubro(c: Optional[Contacto]) -> str:
    if not c:
        return "otros"
    tipo = c.tipo.value if hasattr(c.tipo, "value") else str(c.tipo)
    return RUBRO_POR_TIPO.get(tipo, "otros")


# ---------------------------------------------------------------------------
# Lista
# ---------------------------------------------------------------------------

@router.get("", response_model=ObrasListado)
async def listar_obras(
    request: Request,
    tipo: Optional[str] = Query("obra", description="obra | programa | todos"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_staff(current_user)
    muni_id = get_effective_municipio_id(request, current_user)
    hoy = date.today()

    q = select(Proyecto).where(Proyecto.municipio_id == muni_id, Proyecto.activo.is_(True))
    if tipo and tipo != "todos":
        q = q.where(Proyecto.tipo == tipo)
    proyectos = (await db.execute(q.order_by(Proyecto.nombre))).scalars().all()
    ids = [p.id for p in proyectos]

    etapas_por: Dict[int, List[ObraEtapa]] = defaultdict(list)
    if ids:
        for e in (await db.execute(select(ObraEtapa).where(ObraEtapa.proyecto_id.in_(ids)).order_by(ObraEtapa.orden))).scalars():
            etapas_por[e.proyecto_id].append(e)

    ejecutado: Dict[int, Decimal] = defaultdict(Decimal)
    n_gastos: Dict[int, int] = defaultdict(int)
    sin_etapa: Dict[int, int] = defaultdict(int)
    for gp, g, _c in await _imputaciones(db, ids):
        ejecutado[gp.proyecto_id] += _money(gp.monto_asignado)
        n_gastos[gp.proyecto_id] += 1
        if gp.etapa_id is None and etapas_por.get(gp.proyecto_id):
            sin_etapa[gp.proyecto_id] += 1

    contratistas: Dict[int, Contacto] = {}
    cids = [p.contratista_persona_id for p in proyectos if p.contratista_persona_id]
    if cids:
        for c in (await db.execute(select(Contacto).where(Contacto.id.in_(cids)))).scalars():
            contratistas[c.id] = c

    items: List[ObraResumen] = []
    kpis = ObrasKpis()
    for p in proyectos:
        etapas = etapas_por.get(p.id, [])
        avance = _avance_derivado(p, etapas)
        presupuesto = _money(p.monto_contrato) if p.monto_contrato else (_money(p.presupuesto) if p.presupuesto else None)
        atraso = _atraso(p, etapas, hoy, avance)
        veredicto, motivo = _veredicto(avance, ejecutado[p.id], presupuesto, atraso)
        en_curso = _etapa_en_curso(etapas, hoy)
        c = contratistas.get(p.contratista_persona_id) if p.contratista_persona_id else None
        items.append(ObraResumen(
            id=p.id, nombre=p.nombre.strip(), tipo=p.tipo or "programa", tipo_obra=p.tipo_obra, modalidad=p.modalidad,
            estado=p.estado.value if hasattr(p.estado, "value") else str(p.estado), estado_obra=p.estado_obra,
            publico=bool(p.publico),
            contratista=PersonaRef(id=c.id, nombre=c.nombre_completo, tipo=str(c.tipo.value if hasattr(c.tipo, 'value') else c.tipo)) if c else None,
            presupuesto_vigente=presupuesto, ejecutado=ejecutado[p.id], n_gastos=n_gastos[p.id], avance=avance,
            etapa_actual=EtapaActual(orden=en_curso.orden, nombre=en_curso.nombre, total=len(etapas)) if en_curso else None,
            n_etapas=len(etapas), sin_etapa=sin_etapa[p.id], atraso_dias=atraso, veredicto=veredicto, motivo=motivo,
            fecha_inicio=p.fecha_inicio, fecha_fin=p.fecha_fin, latitud=p.latitud, longitud=p.longitud, updated_at=p.updated_at,
        ))
        if (p.tipo or "programa") == "obra":
            kpis.total_obras += 1
            estado = p.estado.value if hasattr(p.estado, "value") else str(p.estado)
            if estado == "activo" and (avance or 0) < 100:
                kpis.en_ejecucion += 1
                kpis.plata_en_ejecucion += ejecutado[p.id]
            if atraso > 0:
                kpis.atrasadas += 1
            if veredicto == "malo":
                kpis.con_desvio += 1
            if not etapas:
                kpis.sin_etapas += 1
            if p.publico:
                kpis.publicadas += 1
        else:
            kpis.total_programas += 1

    # La frase: interpreta, no enumera.
    obras = [i for i in items if i.tipo == "obra"]
    if not obras:
        frase = "Todavía no hay obras cargadas: marcá cuáles de tus proyectos son obras o cargá una nueva."
    else:
        mayor = max(obras, key=lambda o: o.ejecutado)
        partes = [f"{kpis.en_ejecucion} obra{'s' if kpis.en_ejecucion != 1 else ''} en ejecución por {_fmt_m(kpis.plata_en_ejecucion)}."]
        if mayor.ejecutado > 0 and kpis.plata_en_ejecucion > 0:
            partes.append(f"{mayor.nombre} se lleva el {int(mayor.ejecutado / kpis.plata_en_ejecucion * 100)}% de la plata.")
        malas = [o for o in obras if o.veredicto == "malo"]
        if malas:
            partes.append(f"{malas[0].nombre} {malas[0].motivo}.")
        elif kpis.atrasadas:
            atr = next(o for o in obras if o.atraso_dias > 0)
            partes.append(f"{atr.nombre} va {atr.atraso_dias} días atrasada.")
        if kpis.sin_etapas:
            partes.append(f"{kpis.sin_etapas} sin etapas cargadas: sin etapas no hay avance ni desvío que mirar.")
        frase = " ".join(partes)

    return ObrasListado(items=items, kpis=kpis, frase=frase)


# ---------------------------------------------------------------------------
# Detalle
# ---------------------------------------------------------------------------

async def _proyecto(db: AsyncSession, muni_id: int, proyecto_id: int) -> Proyecto:
    p = (await db.execute(select(Proyecto).where(
        Proyecto.id == proyecto_id, Proyecto.municipio_id == muni_id))).scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Obra no encontrada")
    return p


@router.get("/{proyecto_id}", response_model=ObraDetalle)
async def detalle_obra(
    proyecto_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_staff(current_user)
    muni_id = get_effective_municipio_id(request, current_user)
    hoy = date.today()
    p = await _proyecto(db, muni_id, proyecto_id)
    etapas = list((await db.execute(
        select(ObraEtapa).where(ObraEtapa.proyecto_id == p.id).order_by(ObraEtapa.orden))).scalars())
    filas = await _imputaciones(db, [p.id])

    # --- gastos, con rubro y propuesta de etapa
    gastos: List[GastoDeObra] = []
    por_etapa: Dict[int, Dict[str, Decimal]] = defaultdict(lambda: defaultdict(Decimal))
    n_por_etapa: Dict[int, int] = defaultdict(int)
    por_proveedor: Dict[int, ProveedorDeObra] = {}
    por_mes: Dict[str, Decimal] = defaultdict(Decimal)
    sueldos_personas = set()
    sueldos_total = Decimal(0)
    ejecutado = Decimal(0)
    programado = Decimal(0)
    for gp, g, c in filas:
        monto = _money(gp.monto_asignado)
        rubro = _rubro(c)
        es_programado = g.fecha > hoy
        if es_programado:
            programado += monto
        else:
            ejecutado += monto
        propuesta = _etapa_propuesta(etapas, g.fecha) if gp.etapa_id is None and etapas else None
        gastos.append(GastoDeObra(
            imputacion_id=gp.id, gasto_id=g.id, fecha=g.fecha, monto=monto, monto_gasto=_money(g.monto_pesos),
            concepto=g.concepto or "", descripcion=g.descripcion,
            destino=PersonaRef(id=c.id, nombre=c.nombre_completo, tipo=str(c.tipo.value if hasattr(c.tipo, 'value') else c.tipo)) if c else None,
            rubro=rubro, estado_pago=str(g.estado_pago.value if hasattr(g.estado_pago, 'value') else g.estado_pago) if g.estado_pago else None,
            etapa_id=gp.etapa_id, origen=gp.origen or "manual", etapa_propuesta_id=propuesta,
        ))
        if gp.etapa_id:
            por_etapa[gp.etapa_id][rubro] += monto
            por_etapa[gp.etapa_id]["total"] += monto
            n_por_etapa[gp.etapa_id] += 1
        if c:
            pr = por_proveedor.get(c.id)
            if not pr:
                pr = por_proveedor[c.id] = ProveedorDeObra(
                    persona=PersonaRef(id=c.id, nombre=c.nombre_completo, tipo=str(c.tipo.value if hasattr(c.tipo, 'value') else c.tipo)),
                    n_gastos=0, total=Decimal(0))
            pr.n_gastos += 1
            pr.total += monto
            if rubro == "mano_de_obra":
                sueldos_personas.add(c.id)
                sueldos_total += monto
        por_mes[g.fecha.strftime("%Y-%m")] += monto

    etapas_out = [EtapaOut(
        id=e.id, orden=e.orden, nombre=e.nombre, descripcion=e.descripcion, incidencia_pct=_money(e.incidencia_pct),
        avance_pct=e.avance_pct or 0, estado=e.estado or "pendiente",
        fecha_inicio_prevista=e.fecha_inicio_prevista, fecha_fin_prevista=e.fecha_fin_prevista,
        fecha_inicio_real=e.fecha_inicio_real, fecha_fin_real=e.fecha_fin_real,
        monto_previsto=_money(e.monto_previsto) if e.monto_previsto is not None else None,
        ejecutado=por_etapa[e.id]["total"], n_gastos=n_por_etapa[e.id],
        contratista=por_etapa[e.id]["contratista"], materiales=por_etapa[e.id]["materiales"],
        mano_de_obra=por_etapa[e.id]["mano_de_obra"], otros=por_etapa[e.id]["otros"],
    ) for e in etapas]

    acumulado = Decimal(0)
    meses: List[MesDeObra] = []
    for mes in sorted(por_mes):
        acumulado += por_mes[mes]
        meses.append(MesDeObra(mes=mes, monto=por_mes[mes], acumulado=acumulado, programado=mes > hoy.strftime("%Y-%m")))

    # --- gente: órdenes de trabajo de la obra + sueldos imputados
    ots = (await db.execute(select(OrdenTrabajo).where(OrdenTrabajo.proyecto_id == p.id))).scalars().all()
    horas = float(sum((ot.horas_reales or 0) for ot in ots))
    cuad_ids = {ot.cuadrilla_id for ot in ots if ot.cuadrilla_id}
    emp_ids = {ot.empleado_id for ot in ots if ot.empleado_id}
    cuadrillas = [c.nombre for c in (await db.execute(select(Cuadrilla).where(Cuadrilla.id.in_(cuad_ids)))).scalars()] if cuad_ids else []
    personas_ot = [f"{e.nombre} {e.apellido or ''}".strip() for e in (await db.execute(select(Empleado).where(Empleado.id.in_(emp_ids)))).scalars()] if emp_ids else []
    gente = GenteDeObra(ordenes_trabajo=len(ots), horas=horas, cuadrillas=cuadrillas, personas_ot=personas_ot,
                        sueldos_personas=len(sueldos_personas), sueldos_total=sueldos_total)

    # --- kpis y frase
    avance = _avance_derivado(p, etapas)
    presupuesto = _money(p.monto_contrato) if p.monto_contrato else (_money(p.presupuesto) if p.presupuesto else None)
    atraso = _atraso(p, etapas, hoy, avance)
    veredicto, motivo = _veredicto(avance, ejecutado, presupuesto, atraso)
    sin_etapa = sum(1 for g in gastos if g.etapa_id is None) if etapas else 0
    pct_plata = int(ejecutado / presupuesto * 100) if presupuesto and presupuesto > 0 else None
    kpis = ObraKpis(presupuesto_vigente=presupuesto, ejecutado=ejecutado, comprometido=Decimal(0), programado=programado,
                    avance=avance, pct_plata=pct_plata, atraso_dias=atraso, sin_etapa=sin_etapa, veredicto=veredicto)

    partes = []
    if avance is not None and pct_plata is not None:
        partes.append(f"Estamos al {avance}% de la obra con el {pct_plata}% de la plata: {'en plata' if veredicto != 'malo' else 'gastó más de lo que avanzó'}.")
    elif pct_plata is not None:
        partes.append(f"Se gastó el {pct_plata}% del presupuesto ({_fmt_m(ejecutado)} de {_fmt_m(presupuesto)}); sin avance cargado no se puede decir si va bien.")
    else:
        partes.append(f"Lleva {_fmt_m(ejecutado)} en {len(gastos)} gastos; sin presupuesto ni etapas cargadas es la película de la plata, nada más.")
    en_curso = _etapa_en_curso(etapas, hoy)
    if en_curso:
        if atraso > 0:
            partes.append(f"La etapa {en_curso.orden}, {en_curso.nombre}, va {atraso} días atrasada.")
        else:
            partes.append(f"Etapa {en_curso.orden} de {len(etapas)}, {en_curso.nombre}, en curso.")
    elif atraso > 0:
        partes.append(f"La obra va {atraso} días pasada de su fin previsto.")
    if sin_etapa:
        partes.append(f"Hay {sin_etapa} gasto{'s' if sin_etapa != 1 else ''} sin etapa esperando confirmación.")
    if programado > 0:
        partes.append(f"Quedan {_fmt_m(programado)} programados, todavía sin pagar.")

    contratista = None
    if p.contratista_persona_id:
        c = (await db.execute(select(Contacto).where(Contacto.id == p.contratista_persona_id))).scalar_one_or_none()
        if c:
            contratista = PersonaRef(id=c.id, nombre=c.nombre_completo, tipo=str(c.tipo.value if hasattr(c.tipo, 'value') else c.tipo))
    inspector = None
    if p.inspector_usuario_id:
        u = (await db.execute(select(User).where(User.id == p.inspector_usuario_id))).scalar_one_or_none()
        if u:
            inspector = PersonaRef(id=u.id, nombre=f"{u.nombre} {u.apellido or ''}".strip())
    barrio = None
    if p.barrio_id:
        b = (await db.execute(select(Barrio).where(Barrio.id == p.barrio_id))).scalar_one_or_none()
        barrio = b.nombre if b else None

    fechas = [g.fecha for g in gastos] + [d for e in etapas for d in (e.fecha_inicio_prevista, e.fecha_fin_prevista, e.fecha_inicio_real, e.fecha_fin_real) if d]
    if p.fecha_inicio:
        fechas.append(p.fecha_inicio)
    if p.fecha_fin:
        fechas.append(p.fecha_fin)

    return ObraDetalle(
        id=p.id,
        obra=ObraBase(
            nombre=p.nombre.strip(), descripcion=p.descripcion, tipo=p.tipo or "programa", tipo_obra=p.tipo_obra,
            modalidad=p.modalidad, expediente=p.expediente, fuente_financiamiento=p.fuente_financiamiento,
            monto_contrato=p.monto_contrato, presupuesto=p.presupuesto, plazo_dias=p.plazo_dias,
            fecha_inicio=p.fecha_inicio, fecha_fin=p.fecha_fin, fecha_inicio_real=p.fecha_inicio_real, fecha_fin_real=p.fecha_fin_real,
            contratista_persona_id=p.contratista_persona_id, inspector_usuario_id=p.inspector_usuario_id, barrio_id=p.barrio_id,
            latitud=p.latitud, longitud=p.longitud,
            estado=p.estado.value if hasattr(p.estado, "value") else str(p.estado), estado_obra=p.estado_obra,
            avance=p.avance, publico=bool(p.publico), mostrar_monto=bool(p.mostrar_monto),
        ),
        contratista=contratista, inspector=inspector, barrio=barrio, kpis=kpis, frase=" ".join(partes),
        etapas=etapas_out, gastos=gastos,
        proveedores=sorted(por_proveedor.values(), key=lambda x: x.total, reverse=True),
        mes_a_mes=meses, gente=gente,
        linea_desde=min(fechas) if fechas else None, linea_hasta=max(fechas) if fechas else None,
    )


# ---------------------------------------------------------------------------
# Alta y edición
# ---------------------------------------------------------------------------

async def _guardar_etapas(db: AsyncSession, muni_id: int, p: Proyecto, etapas: List[EtapaIn]) -> None:
    """Reemplaza la lista de etapas. Las que se van dejan sus imputaciones sin etapa (FK SET NULL)."""
    actuales = {e.id: e for e in (await db.execute(select(ObraEtapa).where(ObraEtapa.proyecto_id == p.id))).scalars()}
    vistas = set()
    for i, et in enumerate(etapas, start=1):
        datos = et.model_dump(exclude={"id"})
        datos["orden"] = i
        if et.id and et.id in actuales:
            for k, v in datos.items():
                setattr(actuales[et.id], k, v)
            vistas.add(et.id)
        else:
            db.add(ObraEtapa(municipio_id=muni_id, proyecto_id=p.id, **datos))
    for eid, e in actuales.items():
        if eid not in vistas:
            await db.delete(e)


@router.post("", response_model=ObraDetalle, status_code=201)
async def crear_obra(
    payload: ObraCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_staff(current_user)
    muni_id = get_effective_municipio_id(request, current_user)
    datos = payload.model_dump(exclude={"etapas"})
    if datos.get("tipo") == "obra" and not datos.get("estado_obra"):
        datos["estado_obra"] = "por_empezar" if not datos.get("fecha_inicio_real") else "en_ejecucion"
    p = Proyecto(municipio_id=muni_id, activo=True, **datos)
    db.add(p)
    await db.flush()
    await _guardar_etapas(db, muni_id, p, payload.etapas)
    await db.commit()
    return await detalle_obra(p.id, request, db, current_user)


@router.put("/{proyecto_id}", response_model=ObraDetalle)
async def editar_obra(
    proyecto_id: int,
    payload: ObraUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_staff(current_user)
    muni_id = get_effective_municipio_id(request, current_user)
    p = await _proyecto(db, muni_id, proyecto_id)
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(p, k, v)
    await db.commit()
    return await detalle_obra(p.id, request, db, current_user)


@router.put("/{proyecto_id}/etapas", response_model=ObraDetalle)
async def guardar_etapas(
    proyecto_id: int,
    etapas: List[EtapaIn],
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Las etapas de la obra, completas. Las incidencias deberían sumar 100; se avisa, no se bloquea."""
    _require_staff(current_user)
    muni_id = get_effective_municipio_id(request, current_user)
    p = await _proyecto(db, muni_id, proyecto_id)
    await _guardar_etapas(db, muni_id, p, etapas)
    await db.commit()
    return await detalle_obra(p.id, request, db, current_user)


@router.post("/{proyecto_id}/imputaciones/confirmar", response_model=ObraDetalle)
async def confirmar_imputaciones(
    proyecto_id: int,
    payload: ConfirmarImputaciones,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """La persona confirma la etapa propuesta (o elige otra) para los gastos sin etapa."""
    _require_staff(current_user)
    muni_id = get_effective_municipio_id(request, current_user)
    p = await _proyecto(db, muni_id, proyecto_id)
    etapas = list((await db.execute(select(ObraEtapa).where(ObraEtapa.proyecto_id == p.id))).scalars())
    ids_etapas = {e.id for e in etapas}
    if payload.etapa_id and payload.etapa_id not in ids_etapas:
        raise HTTPException(status_code=400, detail="Esa etapa no es de esta obra")
    filas = (await db.execute(
        select(GastoProyecto, Gasto).join(Gasto, Gasto.id == GastoProyecto.gasto_id)
        .where(GastoProyecto.proyecto_id == p.id, GastoProyecto.id.in_(payload.imputacion_ids))
    )).all()
    confirmadas = 0
    for gp, g in filas:
        etapa_id = payload.etapa_id or _etapa_propuesta(etapas, g.fecha)
        if not etapa_id:
            continue
        gp.etapa_id = etapa_id
        gp.origen = "manual"
        confirmadas += 1
    await db.commit()
    return await detalle_obra(p.id, request, db, current_user)
