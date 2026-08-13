"""
Seed OPERATIVO: capa "viva" de la demo de Paraguay Limpio (municipio codigo='asuncion').
=========================================================================================

Se corre DESPUÉS de `backend/scripts/seed_paraguay_limpio.py` (la semilla base: crea el
municipio, categorías, dependencias, barrios, zonas, empleados, cuadrillas, trámites,
vecinos). Este script NO crea el municipio ni ninguno de esos catálogos — si el muni no
existe, aborta con un mensaje claro.

Objetivo: que la demo muestre actividad de "la semana pasada hasta el futuro" en TODO
momento. Es RE-EJECUTABLE (idempotente por clave natural, ver cada bloque): si sus filas
ya existen no las duplica, sólo RE-FECHA para recentrar la ventana viva en `date.today()`.

Bloques:
  1. Garantías previas — cada cuadrilla existente queda con zona_id + al menos 2
     integrantes activos (1 líder), repartidos determinísticamente entre empleados.
  2. ~24 reclamos "ventana viva" (últimos 7 días), marcados con el sufijo literal
     "(semilla operativa)" en la descripción — esa marca es la clave de idempotencia.
  3. ~10 órdenes de trabajo, numeradas OT-{año}-9{i:03d} (serie 9xxx, no choca con la
     numeración de la semilla base) — idempotencia por `numero`.
  4. ~8 solicitudes de trámite sobre los trámites reales del municipio, marcadas con
     "(semilla operativa)" en la descripción — misma clave que los reclamos.
  5. ~5 turnos futuros (estado reservado) sobre trámites con turno — idempotencia por
     (usuario_id, tramite_id, estado='reservado').

Convenciones (mismas que seed_paraguay_limpio.py):
  - Resolución del municipio por código, lookup-then-create idempotente.
  - PROHIBIDO random.* — variaciones determinísticas por índice/hash (`_jitter`, SHA1).
  - Todas las fechas son relativas a `date.today()` / `datetime.now()`.
  - Sesión async con `create_async_engine(settings.DATABASE_URL)`.
  - Español, cero emojis, nunca se borra nada — sólo INSERT/UPDATE de sus propias filas.

Correr (desde backend/):  python -m scripts.seed_paraguay_operativo
Usa settings.DATABASE_URL (el ambiente donde apunte el backend). En QA lo corre Infra.
"""
import asyncio
import hashlib
from datetime import date, datetime, time as dtime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from core.config import settings
from models.enums import EstadoOrdenTrabajo, PrioridadOT, OrigenOT, EstadoReclamo
from models.municipio import Municipio
from models.user import User
from models.barrio import Barrio
from models.zona import Zona
from models.empleado import Empleado
from models.empleado_cuadrilla import EmpleadoCuadrilla
from models.cuadrilla import Cuadrilla
from models.categoria_reclamo import CategoriaReclamo
from models.reclamo import Reclamo
from models.orden_trabajo import OrdenTrabajo, OrdenTrabajoReclamo
from models.tramite import Tramite, Solicitud, EstadoSolicitud
from models.turno import Turno
from models.municipio_dependencia_tramite import MunicipioDependenciaTramite


CODIGO = "asuncion"
MARCADOR = "(semilla operativa)"

# Serie reservada para las OT de este seed (no choca con OT-{año}-0001.. de la base).
OT_SERIE_PREFIJO = "9"


# ============================================================
# Helper determinístico (SIN random — mismo patrón que seed_paraguay_limpio._jitter)
# ============================================================
def _jitter(clave: str, amp: float) -> tuple:
    """Desplazamiento determinístico (dlat, dlon) en ~[-amp, +amp] por clave estable.
    Nunca coords random presentadas como reales: siempre derivado de SHA1(clave)."""
    h = int(hashlib.sha1(f"asuncion-operativo-{clave}".encode()).hexdigest(), 16)
    dlat = ((h % 4001) / 2000.0 - 1.0) * amp
    dlon = (((h >> 20) % 4001) / 2000.0 - 1.0) * amp
    return round(dlat, 6), round(dlon, 6)


def _hash_idx(clave: str, mod: int) -> int:
    """Índice determinístico en [0, mod) derivado de SHA1(clave). Reemplaza random.choice."""
    if mod <= 0:
        return 0
    h = int(hashlib.sha1(f"asuncion-operativo-idx-{clave}".encode()).hexdigest(), 16)
    return h % mod


# ============================================================
# ~24 reclamos "ventana viva". categoría real del muni + barrio real del muni.
# (slug_id, categoria, direccion_sufijo, offset_estado) — offset_estado decide el
# reparto entre recibido/en_curso/finalizado/pospuesto sin hardcodear el estado acá:
# se calcula en _distribuir_estados según el índice, para que agregar una categoría
# nueva no obligue a retocar la distribución a mano.
# ============================================================
RECLAMOS_VIVOS = [
    ("op-01", "Alumbrado público",          "Luminaria intermitente frente al club de barrio"),
    ("op-02", "Alumbrado público",          "Columna de luz apagada hace tres noches"),
    ("op-03", "Alumbrado público",          "Cable de alumbrado colgando sobre la vereda"),
    ("op-04", "Recolección de residuos",    "El camión no pasó esta semana por la cuadra"),
    ("op-05", "Recolección de residuos",    "Bolsas de basura acumuladas en la esquina"),
    ("op-06", "Recolección de residuos",    "Contenedor comunitario desbordado"),
    ("op-07", "Bacheo y calles",            "Pozo grande que ya dañó un vehículo"),
    ("op-08", "Bacheo y calles",            "Calle de tierra intransitable tras la lluvia"),
    ("op-09", "Bacheo y calles",            "Hundimiento del asfalto sobre la avenida"),
    ("op-10", "Arbolado y espacios verdes", "Rama caída sobre la vereda tras el temporal"),
    ("op-11", "Arbolado y espacios verdes", "Plaza del barrio con el pasto muy crecido"),
    ("op-12", "Agua y cloacas",             "Pérdida de agua constante en la vereda"),
    ("op-13", "Agua y cloacas",             "Boca de tormenta tapada, se inunda con lluvia leve"),
    ("op-14", "Higiene urbana",             "Microbasural en terreno baldío de la cuadra"),
    ("op-15", "Higiene urbana",             "Olor fuerte por desagüe pluvial tapado"),
    ("op-16", "Tránsito y señalización",    "Semáforo apagado en cruce concurrido"),
    ("op-17", "Tránsito y señalización",    "Cartel de PARE derribado tras un choque"),
    ("op-18", "Plagas y control",           "Foco de mosquitos por agua estancada"),
    ("op-19", "Plagas y control",           "Roedores cerca de los puestos de comida"),
    ("op-20", "Animales sueltos",           "Perro suelto asusta a los chicos de la escuela"),
    ("op-21", "Ruidos y convivencia",       "Música a alto volumen hasta la madrugada"),
    ("op-22", "Alumbrado público",          "Zona oscura sin ninguna luminaria funcionando"),
    ("op-23", "Recolección de residuos",    "Falta recolección diferenciada hace dos semanas"),
    ("op-24", "Bacheo y calles",            "Vereda rota frente al comercio de la esquina"),
]

# Distribución de estados sobre los 24: 8 recibido, 8 en_curso, 6 finalizado, 2 pospuesto.
_ESTADOS_VIVOS = (
    [EstadoReclamo.RECIBIDO] * 8
    + [EstadoReclamo.EN_CURSO] * 8
    + [EstadoReclamo.FINALIZADO] * 6
    + [EstadoReclamo.POSPUESTO] * 2
)


# ============================================================
# ~10 órdenes de trabajo — coherentes con categorías reales del muni.
# (slug, titulo, dias_prog_offset) — el estado/cuadrilla/empleado/fechas los decide
# _construir_ots según el bloque (pendiente/asignada/en_curso/completada).
# ============================================================
OTS_VIVAS = [
    # 3 PENDIENTE (fecha_programada hoy+1..hoy+7)
    ("ot-op-01", "Bacheo y calles",         "Bacheo de calzada dañada",                  1),
    ("ot-op-02", "Alumbrado público",       "Recambio de luminaria intermitente",        4),
    ("ot-op-03", "Arbolado y espacios verdes", "Poda de rama caída sobre la vereda",     7),
    # 3 ASIGNADA (cuadrilla + empleado líder, fecha_programada hoy..hoy+5)
    ("ot-op-04", "Recolección de residuos", "Refuerzo de recolección en la cuadra",      0),
    ("ot-op-05", "Agua y cloacas",          "Reparación de pérdida de agua en vereda",   3),
    ("ot-op-06", "Higiene urbana",          "Limpieza de microbasural en baldío",        5),
    # 2 EN_CURSO (fecha_inicio_real ayer, cuadrilla asignada)
    ("ot-op-07", "Plagas y control",        "Fumigación por foco de mosquitos",          0),
    ("ot-op-08", "Tránsito y señalización", "Reparación de semáforo apagado",            0),
    # 2 COMPLETADA (fecha_programada y fecha_completada última semana)
    ("ot-op-09", "Bacheo y calles",         "Bacheo urgente de pozo en la avenida",     -2),
    ("ot-op-10", "Recolección de residuos", "Vaciado de contenedor comunitario",        -4),
]

_PRIORIDADES_OT = [PrioridadOT.MEDIA, PrioridadOT.ALTA, PrioridadOT.URGENTE, PrioridadOT.BAJA]


# ============================================================
# ~8 solicitudes de trámite. (slug, indice_tramite_en_catalogo_ordenado, estado,
# dias_atras) — el trámite real se resuelve por posición dentro de los trámites
# activos del municipio (ordenados por nombre, estable), no por nombre fijo, para
# no depender de que la base tenga exactamente los mismos 10 trámites de la demo.
# ============================================================
SOLICITUDES_VIVAS = [
    ("sol-op-01", 0, EstadoSolicitud.RECIBIDO, 1),
    ("sol-op-02", 1, EstadoSolicitud.RECIBIDO, 2),
    ("sol-op-03", 2, EstadoSolicitud.RECIBIDO, 0),
    ("sol-op-04", 3, EstadoSolicitud.EN_CURSO, 4),
    ("sol-op-05", 4, EstadoSolicitud.EN_CURSO, 5),
    ("sol-op-06", 5, EstadoSolicitud.PENDIENTE_PAGO, 3),
    ("sol-op-07", 6, EstadoSolicitud.FINALIZADO, 6),
    ("sol-op-08", 7, EstadoSolicitud.FINALIZADO, 6),
]

# ============================================================
# ~5 turnos futuros. (slug, dias_adelante, hora) — se atan al primer trámite del
# catálogo (ordenado, estable) que tenga modo_atencion con turno.
# ============================================================
TURNOS_VIVOS = [
    ("turno-op-01", 1, dtime(8, 30)),
    ("turno-op-02", 2, dtime(9, 15)),
    ("turno-op-03", 3, dtime(10, 0)),
    ("turno-op-04", 4, dtime(10, 45)),
    ("turno-op-05", 6, dtime(11, 30)),
]


# ============================================================
# Bloque 1 — garantías previas: zona_id + integrantes en TODAS las cuadrillas.
# ============================================================
async def _garantizar_cuadrillas(db: AsyncSession, muni_id: int) -> dict:
    cuadrillas = (await db.execute(
        select(Cuadrilla).where(Cuadrilla.municipio_id == muni_id).order_by(Cuadrilla.id)
    )).scalars().all()
    zonas = (await db.execute(
        select(Zona).where(Zona.municipio_id == muni_id).order_by(Zona.id)
    )).scalars().all()
    empleados = (await db.execute(
        select(Empleado).where(Empleado.municipio_id == muni_id).order_by(Empleado.id)
    )).scalars().all()

    if not cuadrillas:
        print("[cuadrillas] el municipio no tiene cuadrillas — nada que garantizar")
        return {"con_zona": 0, "miembros_creados": 0}

    con_zona = 0
    if zonas:
        for i, c in enumerate(cuadrillas):
            if c.zona_id is None:
                c.zona_id = zonas[i % len(zonas)].id
                con_zona += 1

    miembros_creados = 0
    if empleados:
        existentes_por_cuadrilla = {}
        for c in cuadrillas:
            filas = (await db.execute(
                select(EmpleadoCuadrilla).where(
                    EmpleadoCuadrilla.cuadrilla_id == c.id,
                    EmpleadoCuadrilla.activo == True,  # noqa: E712
                )
            )).scalars().all()
            existentes_por_cuadrilla[c.id] = filas

        for i, c in enumerate(cuadrillas):
            filas = existentes_por_cuadrilla[c.id]
            tiene_lider = any(f.es_lider for f in filas)
            cantidad = len(filas)
            # Completa hasta 2 integrantes activos, repartiendo empleados de forma
            # determinística (índice de cuadrilla + offset) para no repetir siempre
            # los dos primeros empleados en todas las cuadrillas.
            faltan = max(0, 2 - cantidad)
            ya_asignados = {f.empleado_id for f in filas}
            candidato_base = (i * 3) % len(empleados)
            asignados_ahora = 0
            offset = 0
            while asignados_ahora < faltan and offset < len(empleados):
                emp = empleados[(candidato_base + offset) % len(empleados)]
                offset += 1
                if emp.id in ya_asignados:
                    continue
                es_lider = (not tiene_lider) and asignados_ahora == 0
                db.add(EmpleadoCuadrilla(
                    empleado_id=emp.id, cuadrilla_id=c.id,
                    es_lider=es_lider, fecha_ingreso=date.today(), activo=True,
                ))
                ya_asignados.add(emp.id)
                if es_lider:
                    tiene_lider = True
                asignados_ahora += 1
                miembros_creados += 1

    await db.flush()
    print(f"[cuadrillas] {len(cuadrillas)} cuadrillas — {con_zona} con zona asignada, "
          f"{miembros_creados} integrantes nuevos")
    return {"con_zona": con_zona, "miembros_creados": miembros_creados}


# ============================================================
# Bloque 2 — reclamos "ventana viva" (últimos 7 días -> hoy).
# ============================================================
async def _seed_reclamos_vivos(db: AsyncSession, muni_id: int, cats: dict,
                                barrios: list, vecinos: list) -> dict:
    if not cats or not barrios or not vecinos:
        print("[reclamos-vivos] faltan categorías, barrios o vecinos del muni — skip")
        return {"creados": 0, "refechados": 0}

    existentes = {r.descripcion: r for r in (await db.execute(
        select(Reclamo).where(
            Reclamo.municipio_id == muni_id,
            Reclamo.descripcion.like(f"%{MARCADOR}"),
        )
    )).scalars().all()}

    hoy = date.today()
    creados = 0
    refechados = 0

    for i, (slug, cat_nombre, texto) in enumerate(RECLAMOS_VIVOS):
        cat = cats.get(cat_nombre)
        if not cat:
            continue
        estado = _ESTADOS_VIVOS[i % len(_ESTADOS_VIVOS)]
        barrio = barrios[_hash_idx(slug, len(barrios))]
        vecino = vecinos[_hash_idx(slug + "-vecino", len(vecinos))]

        # Distribuye los 24 reclamos en la ventana hoy-7..hoy (determinístico por índice).
        dias_atras = i % 8  # 0..7
        created = datetime.combine(hoy, dtime(9, 0)) - timedelta(days=dias_atras, hours=(i % 5))
        base_lat = barrio.latitud if barrio.latitud is not None else 0.0
        base_lon = barrio.longitud if barrio.longitud is not None else 0.0
        jlat, jlon = _jitter(slug, 0.0006)
        lat = round(base_lat + jlat, 6) if barrio.latitud is not None else None
        lon = round(base_lon + jlon, 6) if barrio.longitud is not None else None

        descripcion = f"{texto}, en {barrio.nombre}. {MARCADOR}"
        resuelto = estado == EstadoReclamo.FINALIZADO
        fecha_res = created + timedelta(days=1 + (i % 3)) if resuelto else None
        if fecha_res and fecha_res > datetime.combine(hoy, dtime(23, 59)):
            fecha_res = datetime.combine(hoy, dtime(18, 0))

        rec = existentes.get(descripcion)
        if rec:
            # Re-fechar en re-run: recentra la ventana sin duplicar.
            rec.estado = estado
            rec.categoria_id = cat.id
            rec.barrio_id = barrio.id
            rec.creador_id = vecino.id
            rec.latitud = lat
            rec.longitud = lon
            rec.created_at = created
            rec.fecha_resolucion = fecha_res
            rec.confirmado_vecino = True if resuelto else None
            refechados += 1
        else:
            db.add(Reclamo(
                municipio_id=muni_id, titulo=texto, descripcion=descripcion,
                estado=estado, prioridad=3, direccion=f"{barrio.nombre}, Asunción",
                latitud=lat, longitud=lon, categoria_id=cat.id, barrio_id=barrio.id,
                creador_id=vecino.id, canal="app", created_at=created,
                fecha_resolucion=fecha_res, confirmado_vecino=True if resuelto else None,
            ))
            creados += 1

    await db.flush()
    print(f"[reclamos-vivos] {creados} creados, {refechados} re-fechados "
          f"(ventana hoy-7..hoy)")
    return {"creados": creados, "refechados": refechados}


# ============================================================
# Bloque 3 — órdenes de trabajo (serie 9xxx).
# ============================================================
async def _seed_ots_vivas(db: AsyncSession, muni_id: int, cats: dict, cuadrillas: list,
                          empleados: list, reclamos_vivos: list, admin_id: int) -> dict:
    if admin_id is None:
        print("[ots-vivas] no hay admin del muni — skip")
        return {"creadas": 0, "actualizadas": 0}

    year = date.today().year
    hoy = date.today()

    existentes = {ot.numero: ot for ot in (await db.execute(
        select(OrdenTrabajo).where(OrdenTrabajo.municipio_id == muni_id)
    )).scalars().all()}

    # Índice de reclamos vivos por bloque de categoría, para vincular 1-3 por OT
    # (mismo criterio: reclamo cuyo título coincide con el texto de RECLAMOS_VIVOS).
    reclamos_por_cat = {}
    for rec in reclamos_vivos:
        if rec is None:
            continue
        reclamos_por_cat.setdefault(rec.categoria_id, []).append(rec)

    creadas = 0
    actualizadas = 0

    def _estado_bloque(idx: int) -> EstadoOrdenTrabajo:
        if idx < 3:
            return EstadoOrdenTrabajo.PENDIENTE
        if idx < 6:
            return EstadoOrdenTrabajo.ASIGNADA
        if idx < 8:
            return EstadoOrdenTrabajo.EN_CURSO
        return EstadoOrdenTrabajo.COMPLETADA

    for i, (slug, cat_nombre, titulo, dias_off) in enumerate(OTS_VIVAS):
        numero = f"OT-{year}-{OT_SERIE_PREFIJO}{i:03d}"
        estado = _estado_bloque(i)
        cat = cats.get(cat_nombre)
        cuadrilla = cuadrillas[_hash_idx(slug, len(cuadrillas))] if cuadrillas else None
        empleado = empleados[_hash_idx(slug + "-emp", len(empleados))] if empleados else None
        prioridad = _PRIORIDADES_OT[_hash_idx(slug + "-prio", len(_PRIORIDADES_OT))]

        fecha_programada = hoy + timedelta(days=dias_off)
        fecha_inicio_real = None
        fecha_completada = None
        if estado == EstadoOrdenTrabajo.EN_CURSO:
            fecha_inicio_real = datetime.combine(hoy - timedelta(days=1), dtime(8, 0))
        elif estado == EstadoOrdenTrabajo.COMPLETADA:
            fecha_inicio_real = datetime.combine(fecha_programada, dtime(8, 0))
            fecha_completada = datetime.combine(fecha_programada, dtime(14, 0))

        # Sólo ASIGNADA/EN_CURSO/COMPLETADA llevan cuadrilla+empleado responsable;
        # PENDIENTE queda sin asignar (coherente con el circuito real de campo).
        lleva_asignacion = estado != EstadoOrdenTrabajo.PENDIENTE
        cuadrilla_id = cuadrilla.id if (cuadrilla and lleva_asignacion) else None
        empleado_id = empleado.id if (empleado and lleva_asignacion) else None

        ot = existentes.get(numero)
        if ot:
            ot.estado = estado
            ot.titulo = titulo
            ot.prioridad = prioridad
            ot.cuadrilla_id = cuadrilla_id
            ot.empleado_id = empleado_id
            ot.categoria_id = cat.id if cat else None
            ot.fecha_programada = fecha_programada
            ot.fecha_inicio_real = fecha_inicio_real
            ot.fecha_completada = fecha_completada
            actualizadas += 1
        else:
            ot = OrdenTrabajo(
                municipio_id=muni_id, numero=numero, estado=estado, origen=OrigenOT.MANUAL,
                titulo=titulo, descripcion=f"{titulo}. {MARCADOR}",
                prioridad=prioridad, categoria_id=cat.id if cat else None,
                cuadrilla_id=cuadrilla_id, empleado_id=empleado_id,
                fecha_programada=fecha_programada, hora_inicio=dtime(8, 0), hora_fin=dtime(12, 0),
                fecha_inicio_real=fecha_inicio_real, fecha_completada=fecha_completada,
                creador_id=admin_id,
            )
            db.add(ot)
            await db.flush()
            creadas += 1

        # Vincula 1-3 reclamos vivos de la misma categoría (pivot, idempotente).
        candidatos = reclamos_por_cat.get(cat.id, [])[:3] if cat else []
        if candidatos:
            pivots_existentes = {
                p.reclamo_id for p in (await db.execute(
                    select(OrdenTrabajoReclamo).where(OrdenTrabajoReclamo.orden_trabajo_id == ot.id)
                )).scalars().all()
            }
            for rec in candidatos:
                if rec.id not in pivots_existentes:
                    db.add(OrdenTrabajoReclamo(orden_trabajo_id=ot.id, reclamo_id=rec.id))

    await db.flush()
    print(f"[ots-vivas] {creadas} creadas, {actualizadas} actualizadas (serie {OT_SERIE_PREFIJO}xxx)")
    return {"creadas": creadas, "actualizadas": actualizadas}


# ============================================================
# Helper compartido — primera dependencia activa que atiende un trámite (mismo
# criterio que api/turnos_tramite.py::_resolver_dependencia_de_tramite). None si
# el municipio todavía no mapeó ese trámite a ninguna dependencia.
# ============================================================
async def _dependencia_de_tramite(db: AsyncSession, tramite_id: int) -> int | None:
    return (await db.execute(
        select(MunicipioDependenciaTramite.municipio_dependencia_id).where(
            MunicipioDependenciaTramite.tramite_id == tramite_id,
        ).limit(1)
    )).scalar_one_or_none()


# ============================================================
# Bloque 4 — solicitudes de trámite "ventana viva".
# ============================================================
async def _seed_solicitudes_vivas(db: AsyncSession, muni_id: int, tramites: list,
                                  vecinos: list) -> dict:
    if not tramites or not vecinos:
        print("[solicitudes-vivas] no hay trámites o vecinos del muni — skip")
        return {"creadas": 0, "refechadas": 0}

    existentes = {s.descripcion: s for s in (await db.execute(
        select(Solicitud).where(
            Solicitud.municipio_id == muni_id,
            Solicitud.descripcion.like(f"%{MARCADOR}"),
        )
    )).scalars().all()}

    year = date.today().year
    hoy = date.today()

    # numero_tramite es único GLOBAL (todos los municipios) — el máximo se calcula
    # una sola vez al principio y se incrementa localmente para evitar colisiones
    # entre las solicitudes nuevas de esta misma corrida.
    r = await db.execute(select(Solicitud.numero_tramite).where(
        Solicitud.numero_tramite.like(f"SOL-{year}-%")
    ))
    max_seq = 0
    for (numero,) in r.all():
        try:
            seq = int(numero.split("-")[-1])
        except (ValueError, IndexError):
            continue
        max_seq = max(max_seq, seq)

    creadas = 0
    refechadas = 0

    for slug, t_idx, estado, dias_atras in SOLICITUDES_VIVAS:
        if t_idx >= len(tramites):
            continue
        tramite = tramites[t_idx]
        vecino = vecinos[_hash_idx(slug, len(vecinos))]
        created = datetime.combine(hoy, dtime(10, 0)) - timedelta(days=dias_atras)
        fecha_resolucion = None
        if estado == EstadoSolicitud.FINALIZADO:
            fecha_resolucion = created + timedelta(days=1 + (dias_atras % 3))
            if fecha_resolucion > datetime.combine(hoy, dtime(20, 0)):
                fecha_resolucion = datetime.combine(hoy, dtime(16, 0))

        asunto = f"{tramite.nombre} — {vecino.nombre} {vecino.apellido}"
        descripcion = f"Solicitud de {tramite.nombre} iniciada por el vecino. {MARCADOR}"
        dep_id = await _dependencia_de_tramite(db, tramite.id)

        sol = existentes.get(descripcion)
        if sol:
            sol.tramite_id = tramite.id
            sol.asunto = asunto
            sol.estado = estado
            sol.solicitante_id = vecino.id
            sol.nombre_solicitante = vecino.nombre
            sol.apellido_solicitante = vecino.apellido
            sol.dni_solicitante = vecino.dni
            sol.email_solicitante = vecino.email
            sol.telefono_solicitante = vecino.telefono
            sol.municipio_dependencia_id = dep_id
            sol.created_at = created
            sol.fecha_resolucion = fecha_resolucion
            refechadas += 1
        else:
            max_seq += 1
            numero = f"SOL-{year}-{max_seq:05d}"
            db.add(Solicitud(
                municipio_id=muni_id, numero_tramite=numero, tramite_id=tramite.id,
                asunto=asunto, descripcion=descripcion, estado=estado,
                solicitante_id=vecino.id, nombre_solicitante=vecino.nombre,
                apellido_solicitante=vecino.apellido, dni_solicitante=vecino.dni,
                email_solicitante=vecino.email, telefono_solicitante=vecino.telefono,
                municipio_dependencia_id=dep_id,
                prioridad=3, canal="ventanilla_asistida", created_at=created,
                fecha_resolucion=fecha_resolucion,
            ))
            creadas += 1

    await db.flush()
    print(f"[solicitudes-vivas] {creadas} creadas, {refechadas} re-fechadas")
    return {"creadas": creadas, "refechadas": refechadas}


# ============================================================
# Bloque 5 — turnos futuros (estado reservado).
# ============================================================
async def _seed_turnos_vivos(db: AsyncSession, muni_id: int, tramites: list,
                             vecinos: list) -> dict:
    # Sólo trámites presenciales tienen turnero (modo_atencion != 'online').
    tramites_con_turno = [t for t in tramites if t.modo_atencion != "online"]
    if not tramites_con_turno or not vecinos:
        print("[turnos-vivos] no hay trámites presenciales o vecinos del muni — skip")
        return {"creados": 0, "refechados": 0}

    hoy = date.today()

    creados = 0
    refechados = 0

    for slug, dias_adelante, hora in TURNOS_VIVOS:
        tramite = tramites_con_turno[_hash_idx(slug, len(tramites_con_turno))]
        vecino = vecinos[_hash_idx(slug + "-vec", len(vecinos))]
        # La dependencia del turno es la que gestiona el trámite (mismo criterio
        # que api/turnos_tramite.py). Si el municipio todavía no mapeó ese trámite
        # a ninguna dependencia, Turno.municipio_dependencia_id es NOT NULL — no
        # se puede inventar, así que se saltea ese trámite determinísticamente.
        dep_id = await _dependencia_de_tramite(db, tramite.id)
        if dep_id is None:
            continue

        fecha_hora = datetime.combine(hoy + timedelta(days=dias_adelante), hora)

        existente = (await db.execute(
            select(Turno).where(
                Turno.usuario_id == vecino.id,
                Turno.tramite_id == tramite.id,
                Turno.estado == "reservado",
            )
        )).scalars().first()

        if existente:
            existente.fecha_hora = fecha_hora
            existente.municipio_dependencia_id = dep_id
            existente.nombre_solicitante = f"{vecino.nombre} {vecino.apellido}"
            existente.dni_solicitante = vecino.dni
            existente.telefono_solicitante = vecino.telefono
            refechados += 1
        else:
            db.add(Turno(
                motivo_tipo="tramite", tramite_id=tramite.id, usuario_id=vecino.id,
                municipio_dependencia_id=dep_id, municipio_id=muni_id,
                fecha_hora=fecha_hora, duracion_min=tramite.duracion_turno_min or 30,
                estado="reservado", nombre_solicitante=f"{vecino.nombre} {vecino.apellido}",
                dni_solicitante=vecino.dni, telefono_solicitante=vecino.telefono,
            ))
            creados += 1

    await db.flush()
    print(f"[turnos-vivos] {creados} creados, {refechados} re-fechados")
    return {"creados": creados, "refechados": refechados}


# ============================================================
# Main
# ============================================================
async def main():
    engine = create_async_engine(settings.DATABASE_URL)
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as db:
        muni = (await db.execute(select(Municipio).where(Municipio.codigo == CODIGO))).scalar_one_or_none()
        if not muni:
            print(f"ABORTADO: no existe el municipio codigo='{CODIGO}'. "
                  f"Correr primero `python -m scripts.seed_paraguay_limpio`.")
            await engine.dispose()
            return

        cats = {c.nombre: c for c in (await db.execute(
            select(CategoriaReclamo).where(CategoriaReclamo.municipio_id == muni.id)
        )).scalars().all()}
        barrios = (await db.execute(
            select(Barrio).where(Barrio.municipio_id == muni.id).order_by(Barrio.id)
        )).scalars().all()
        vecinos = (await db.execute(
            select(User).where(User.municipio_id == muni.id, User.rol == "vecino",
                               User.email.like("%@asuncion.demo.com"))
            .order_by(User.id)
        )).scalars().all()
        admin = (await db.execute(
            select(User).where(User.municipio_id == muni.id, User.rol == "admin")
            .order_by(User.id)
        )).scalars().first()
        cuadrillas_list = (await db.execute(
            select(Cuadrilla).where(Cuadrilla.municipio_id == muni.id).order_by(Cuadrilla.id)
        )).scalars().all()
        empleados_list = (await db.execute(
            select(Empleado).where(Empleado.municipio_id == muni.id).order_by(Empleado.id)
        )).scalars().all()
        tramites_list = (await db.execute(
            select(Tramite).where(Tramite.municipio_id == muni.id, Tramite.activo == True)  # noqa: E712
            .order_by(Tramite.nombre)
        )).scalars().all()

        if not vecinos:
            print(f"ABORTADO: el municipio '{CODIGO}' (id={muni.id}) no tiene vecinos demo "
                  f"(@asuncion.demo.com). Correr primero `python -m scripts.seed_paraguay_limpio`.")
            await engine.dispose()
            return

        resumen = {}
        resumen["cuadrillas"] = await _garantizar_cuadrillas(db, muni.id)
        await db.commit()

        resumen["reclamos"] = await _seed_reclamos_vivos(db, muni.id, cats, barrios, vecinos)
        await db.commit()

        reclamos_vivos = (await db.execute(
            select(Reclamo).where(
                Reclamo.municipio_id == muni.id,
                Reclamo.descripcion.like(f"%{MARCADOR}"),
            )
        )).scalars().all()
        resumen["ots"] = await _seed_ots_vivas(
            db, muni.id, cats, cuadrillas_list, empleados_list, reclamos_vivos,
            admin.id if admin else None,
        )
        await db.commit()

        resumen["solicitudes"] = await _seed_solicitudes_vivas(db, muni.id, tramites_list, vecinos)
        await db.commit()

        resumen["turnos"] = await _seed_turnos_vivos(db, muni.id, tramites_list, vecinos)
        await db.commit()

        print(f"\nOK — Paraguay Limpio (Asunción) capa OPERATIVA lista. muni_id={muni.id}")
        print(f"  cuadrillas: {resumen['cuadrillas']['con_zona']} con zona, "
              f"{resumen['cuadrillas']['miembros_creados']} integrantes nuevos")
        print(f"  reclamos vivos: {resumen['reclamos']['creados']} creados, "
              f"{resumen['reclamos']['refechados']} re-fechados")
        print(f"  ordenes de trabajo: {resumen['ots']['creadas']} creadas, "
              f"{resumen['ots']['actualizadas']} actualizadas")
        print(f"  solicitudes: {resumen['solicitudes']['creadas']} creadas, "
              f"{resumen['solicitudes']['refechadas']} re-fechadas")
        print(f"  turnos: {resumen['turnos']['creados']} creados, "
              f"{resumen['turnos']['refechados']} re-fechados")
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
