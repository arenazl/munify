"""Modulo 50 — barrido restante (pantallas vacias fuera de los grupos grandes).

Siembra, en este orden:
  A) Configuracion / Datos del Municipio — VIA API (POST /configuracion): 6 claves
     que desbloquean la pantalla Configuracion y el GET /detalle de SalesBot.
  B) Noticias (Novedades del vecino) — VIA API (POST /noticias): 4 noticias [DEMO]
     tono asunceno. El POST no acepta created_at, asi que el escalonado de fechas
     (-1/-3/-6/-8 dias) se aplica por UPDATE directo si hay DATABASE_URL (QA).
  C) Notificaciones (campanita) — TABLA DIRECTA (no existe POST /notificaciones):
     20 notificaciones sobre reclamos REALES del muni para admin, 2 vecinos y
     2 empleados; ~mitad sin leer para que la campanita muestre badge.
  D) SLA violaciones — TABLA DIRECTA (no hay endpoint de escritura): 3 filas de
     historial sobre los reclamos vencidos REALES que reporta /sla/estado-reclamos.

NO siembra (anotado como config-pura / fuera de alcance del kit):
  - WhatsApp config (config pura; queda habilitado=false, sin numero PY registrado).
  - AuditLogs + consola superadmin (se autogenera con el uso / cross-tenant).
  - PanelBI / Analisis IA (pre-requisito: habilitar IA del muni; ademas /chat/kpis
    devuelve 500 — bug de backend, no de semilla).
  - sla_config (ya hay 7 vivas) y las fechas de reclamos para el tablero SLA
    (responsabilidad del grupo Reclamos).
  - POI extra, Zonas, Exportar, Usuarios/Dependencias (con-datos u opcionales).

Idempotente: claves naturales (clave / titulo / usuario+titulo / reclamo+tipo).
Deterministico: fechas relativas a hoy con offsets fijos, jamas random.
"""
from __future__ import annotations

import asyncio
import os
from datetime import datetime, timedelta

from _api import ApiQA, guard_qa

# ---------------------------------------------------------------------------
# Constantes del plan (inventario 2026-07-31)
# ---------------------------------------------------------------------------
EMAIL_ADMIN = "admin@asuncion.demo.com"
EMAIL_VECINO_DERLIS = "vecino@asuncion.demo.com"
EMAIL_VECINO_RODRIGO = "vecino-rodrigo@asuncion.demo.com"
EMAIL_EMP_ELECTRICIDAD = "empleado-electricidad@asuncion.demo.com"
EMAIL_EMP_BACHEO = "empleado-bacheo@asuncion.demo.com"

CLAVES_CONFIGURACION = [
    # (clave, valor, descripcion)
    ("nombre_municipio", "Asunción", "Nombre visible del municipio"),
    (
        "direccion_municipio",
        "[DEMO] Avda. Mcal. López c/ Capitán Bueno",
        "Sede de la Municipalidad de Asunción",
    ),
    ("telefono_contacto", "[DEMO] +595 21 610 000", "Telefono de contacto"),
    ("email_contacto", "[DEMO] contacto@asuncion.demo.com", "Email de contacto"),
    ("latitud_municipio", "-25.2866", "Latitud de la sede (tabla municipios)"),
    ("longitud_municipio", "-57.5986", "Longitud de la sede (tabla municipios)"),
]

NOTICIAS = [
    # (titulo, descripcion, offset_dias para el backdate del created_at)
    (
        "Nueva cuadrilla de bacheo en Tacumbú",
        "[DEMO] La Municipalidad incorporó una cuadrilla para bacheo intensivo en Tacumbú y zonas aledañas.",
        -1,
    ),
    (
        "Campaña de vacunación antirrábica gratuita",
        "[DEMO] Zoonosis vacuna gratis a perros y gatos en las plazas barriales durante todo el mes.",
        -3,
    ),
    (
        "Corte programado de agua en Villa Morra",
        "[DEMO] ESSAP realizará mantenimiento de red; el servicio se repone dentro de la misma jornada.",
        -6,
    ),
    (
        "Mejoras de alumbrado en la Costanera",
        "[DEMO] Se renuevan luminarias LED en la Costanera de Asunción para mayor seguridad nocturna.",
        -8,
    ),
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _hace_horas(horas: int) -> datetime:
    """Ahora menos N horas (offset FIJO, deterministico — el plan pide hoy-1h/-5h/-1d/-2d)."""
    return (datetime.now() - timedelta(hours=horas)).replace(microsecond=0)


def _usuarios_por_email(api: ApiQA) -> dict[str, int]:
    return {
        u.get("email"): u.get("id")
        for u in api.listar("/users")
        if isinstance(u, dict)
    }


def _por_estado(reclamos: list[dict], estado: str) -> list[dict]:
    return sorted(
        (r for r in reclamos if r.get("estado") == estado), key=lambda r: r["id"]
    )


def _primero(reclamos: list[dict], estado: str) -> dict | None:
    filtrados = _por_estado(reclamos, estado)
    return filtrados[0] if filtrados else (sorted(reclamos, key=lambda r: r["id"])[0] if reclamos else None)


def _ultimo(reclamos: list[dict], estado: str) -> dict | None:
    filtrados = _por_estado(reclamos, estado)
    return filtrados[-1] if filtrados else (sorted(reclamos, key=lambda r: r["id"])[-1] if reclamos else None)


def _nombre_categoria(reclamo: dict) -> str:
    cat = reclamo.get("categoria")
    if isinstance(cat, dict):
        return str(cat.get("nombre") or "")
    return str(cat or "")


def _pool_empleado(en_curso: list[dict], needle: str, usados: set[int], n: int) -> list[dict]:
    """Reclamos en_curso cuya categoria matchee el rubro del empleado; fallback: cualquiera no usado."""
    pool = [r for r in en_curso if needle in _nombre_categoria(r).lower() and r["id"] not in usados]
    if len(pool) < n:
        pool += [r for r in en_curso if r["id"] not in usados and r not in pool]
    elegidos = pool[:n]
    usados.update(r["id"] for r in elegidos)
    return elegidos


# ---------------------------------------------------------------------------
# A) Configuracion — via API
# ---------------------------------------------------------------------------
def _sembrar_configuracion(api: ApiQA) -> tuple[int, int]:
    # NOTA: NO usar POST /configuracion — tiene un bug real (500: municipio_id
    # duplicado entre el schema y el handler). El PUT /{clave} hace upsert con
    # scope de tenant y es el mismo camino que usa la pantalla Configuracion.
    creados = existentes = 0
    for clave, valor, descripcion in CLAVES_CONFIGURACION:
        if api.buscar("/configuracion", "clave", clave) is not None:
            existentes += 1
            continue
        api.put(f"/configuracion/{clave}", json={"valor": valor, "descripcion": descripcion})
        creados += 1
    print(f"  [configuracion] creados={creados} existentes={existentes}")
    return creados, existentes


# ---------------------------------------------------------------------------
# B) Noticias — via API (backdate del created_at por SQL, si hay DATABASE_URL)
# ---------------------------------------------------------------------------
def _sembrar_noticias(api: ApiQA, municipio_id: int) -> tuple[int, int]:
    creados = existentes = 0
    for titulo, descripcion, _offset in NOTICIAS:
        _, creado = api.asegurar(
            "/noticias", "titulo", titulo,
            "/noticias",
            {
                "titulo": titulo,
                "descripcion": descripcion,
                "imagen_url": None,
                "municipio_id": municipio_id,
            },
        )
        creados += creado
        existentes += not creado
    print(f"  [noticias] creados={creados} existentes={existentes}")
    return creados, existentes


# ---------------------------------------------------------------------------
# C) Notificaciones — plan de filas (la escritura va por tabla directa)
# ---------------------------------------------------------------------------
def _plan_notificaciones(api: ApiQA) -> list[dict]:
    usuarios = _usuarios_por_email(api)
    faltantes = [
        e
        for e in (
            EMAIL_ADMIN, EMAIL_VECINO_DERLIS, EMAIL_VECINO_RODRIGO,
            EMAIL_EMP_ELECTRICIDAD, EMAIL_EMP_BACHEO,
        )
        if e not in usuarios
    ]
    if faltantes:
        raise RuntimeError(f"[50_resto] usuarios demo faltantes en QA: {faltantes}")

    reclamos = api.listar("/reclamos", params={"limit": 100})  # la API capea limit en 100
    if not reclamos:
        raise RuntimeError("[50_resto] no hay reclamos en QA — correr antes la semilla de reclamos")

    por_creador: dict[str, list[dict]] = {}
    for r in reclamos:
        email = (r.get("creador") or {}).get("email")
        por_creador.setdefault(email, []).append(r)

    vencidos = sorted(
        api.get("/sla/estado-reclamos", params={"solo_vencidos": "true"}) or [],
        key=lambda v: v["reclamo_id"],
    )

    filas: list[dict] = []

    def agregar(usuario_id, tipo, titulo, mensaje, reclamo_id, accion_url, leida, horas):
        filas.append({
            "usuario_id": usuario_id,
            "tipo": tipo,
            "titulo": titulo,
            "mensaje": mensaje,
            "reclamo_id": reclamo_id,
            "accion_url": accion_url,
            "leida": leida,
            "created_at": _hace_horas(horas),
        })

    # --- Vecinos: 4 notifs c/u sobre SUS reclamos ---------------------------
    for email, base_horas in ((EMAIL_VECINO_DERLIS, 1), (EMAIL_VECINO_RODRIGO, 3)):
        uid = usuarios[email]
        propios = por_creador.get(email, [])
        if not propios:
            print(f"  [notificaciones] AVISO: {email} sin reclamos propios — salteado")
            continue
        en_curso = _primero(propios, "en_curso")
        finalizado = _primero(propios, "finalizado")
        recibido = _ultimo(propios, "recibido")
        agregar(
            uid, "estado_cambio",
            f"Tu reclamo #{en_curso['id']} está en curso",
            f"La cuadrilla municipal comenzó a trabajar en \"{en_curso['titulo']}\".",
            en_curso["id"], None, False, base_horas,
        )
        agregar(
            uid, "estado_cambio",
            f"Tu reclamo #{finalizado['id']} fue resuelto",
            f"\"{finalizado['titulo']}\" quedó resuelto. Podés calificar la atención recibida.",
            finalizado["id"], None, False, base_horas + 4,
        )
        agregar(
            uid, "nuevo_reclamo",
            f"Recibimos tu reclamo #{recibido['id']}",
            f"\"{recibido['titulo']}\" ingresó al sistema y será derivado al área correspondiente.",
            recibido["id"], None, True, base_horas + 25,
        )
        agregar(
            uid, "turno",
            "Recordatorio de turno",
            "[DEMO] Tenés un turno próximo en la Municipalidad de Asunción. Revisá Mis Turnos.",
            None, "/gestion/mis-turnos", True, base_horas + 49,
        )

    # --- Admin: 4 notifs de operacion ---------------------------------------
    uid_admin = usuarios[EMAIL_ADMIN]
    todos = sorted(reclamos, key=lambda r: r["id"])
    ultimo, anteultimo = todos[-1], todos[-2]
    ultimo_finalizado = _ultimo(todos, "finalizado")
    agregar(
        uid_admin, "nuevo_reclamo",
        f"Nuevo reclamo #{ultimo['id']} ingresado",
        f"Un vecino reportó \"{ultimo['titulo']}\". Pendiente de derivación.",
        ultimo["id"], None, False, 1,
    )
    agregar(
        uid_admin, "nuevo_reclamo",
        f"Nuevo reclamo #{anteultimo['id']} ingresado",
        f"Un vecino reportó \"{anteultimo['titulo']}\". Pendiente de derivación.",
        anteultimo["id"], None, False, 5,
    )
    if vencidos:
        v = vencidos[0]
        agregar(
            uid_admin, "alerta_sla",
            f"SLA vencido en reclamo #{v['reclamo_id']}",
            f"\"{v['titulo']}\" superó el límite de resolución de {v['tiempo_limite_resolucion']} h.",
            v["reclamo_id"], "/gestion/sla", False, 26,
        )
    agregar(
        uid_admin, "estado_cambio",
        f"Reclamo #{ultimo_finalizado['id']} finalizado",
        f"La cuadrilla marcó como resuelto \"{ultimo_finalizado['titulo']}\".",
        ultimo_finalizado["id"], None, True, 50,
    )

    # --- Empleados de campo: asignaciones + alerta --------------------------
    en_curso_todos = _por_estado(todos, "en_curso")
    usados: set[int] = set()
    for email, needle, base_horas, idx_vencido in (
        (EMAIL_EMP_ELECTRICIDAD, "alumbrado", 2, 1),
        (EMAIL_EMP_BACHEO, "bacheo", 4, 2),
    ):
        uid = usuarios[email]
        elegidos = _pool_empleado(en_curso_todos, needle, usados, 3)
        if len(elegidos) < 3:
            print(f"  [notificaciones] AVISO: pocos reclamos en_curso para {email}")
        for i, r in enumerate(elegidos[:2]):
            agregar(
                uid, "asignacion",
                f"Se te asignó el reclamo #{r['id']}",
                f"\"{r['titulo']}\" quedó asignado a tu cuadrilla.",
                r["id"], None, i > 0, base_horas + i * 6,
            )
        if len(elegidos) > 2:
            r = elegidos[2]
            agregar(
                uid, "estado_cambio",
                f"Actualización en el reclamo #{r['id']}",
                f"El supervisor actualizó la prioridad de \"{r['titulo']}\".",
                r["id"], None, True, base_horas + 25,
            )
        if len(vencidos) > idx_vencido:
            v = vencidos[idx_vencido]
            agregar(
                uid, "alerta_sla",
                f"SLA vencido en reclamo asignado #{v['reclamo_id']}",
                f"\"{v['titulo']}\" superó el límite de resolución de {v['tiempo_limite_resolucion']} h.",
                v["reclamo_id"], None, False, base_horas + 49,
            )
    return filas


# ---------------------------------------------------------------------------
# D) SLA violaciones — plan de filas (tabla directa)
# ---------------------------------------------------------------------------
def _plan_sla_violaciones(api: ApiQA) -> list[dict]:
    vencidos = sorted(
        api.get("/sla/estado-reclamos", params={"solo_vencidos": "true"}) or [],
        key=lambda v: v["reclamo_id"],
    )[:3]
    filas = []
    for v in vencidos:
        limite = int(v["tiempo_limite_resolucion"])
        real = round(float(v["tiempo_transcurrido_horas"]), 1)
        vence = datetime.fromisoformat(v["created_at"]) + timedelta(hours=limite)
        filas.append({
            "reclamo_id": v["reclamo_id"],
            "tipo": "resolucion",
            "tiempo_limite_horas": limite,
            "tiempo_real_horas": real,
            "exceso_horas": round(max(real - limite, 0.0), 1),
            "estado_reclamo": v["estado"],
            "fecha_vencimiento": vence,
            "fecha_deteccion": vence + timedelta(hours=6),
            "notificada": False,
        })
    return filas


# ---------------------------------------------------------------------------
# Escritura tabla directa (SOLO QA — guard_qa aborta si la URL no es de QA)
# ---------------------------------------------------------------------------
async def _escribir_tabla_directa(
    database_url: str,
    notificaciones: list[dict],
    violaciones: list[dict],
    municipio_id: int,
) -> tuple[int, int]:
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import create_async_engine

    if database_url.startswith("mysql://"):
        database_url = database_url.replace("mysql://", "mysql+aiomysql://", 1)

    engine = create_async_engine(database_url)
    creados = existentes = 0
    try:
        async with engine.begin() as conn:
            # C) notificaciones — clave natural (usuario_id, titulo)
            for n in notificaciones:
                fila = (await conn.execute(
                    text("SELECT id FROM notificaciones WHERE usuario_id=:u AND titulo=:t LIMIT 1"),
                    {"u": n["usuario_id"], "t": n["titulo"]},
                )).first()
                if fila:
                    existentes += 1
                    continue
                await conn.execute(
                    text(
                        "INSERT INTO notificaciones "
                        "(usuario_id, titulo, mensaje, tipo, reclamo_id, solicitud_id, accion_url, leida, created_at) "
                        "VALUES (:usuario_id, :titulo, :mensaje, :tipo, :reclamo_id, NULL, :accion_url, :leida, :created_at)"
                    ),
                    n,
                )
                creados += 1

            # D) sla_violaciones — clave natural (reclamo_id, tipo)
            for v in violaciones:
                fila = (await conn.execute(
                    text("SELECT id FROM sla_violaciones WHERE reclamo_id=:r AND tipo=:t LIMIT 1"),
                    {"r": v["reclamo_id"], "t": v["tipo"]},
                )).first()
                if fila:
                    existentes += 1
                    continue
                await conn.execute(
                    text(
                        "INSERT INTO sla_violaciones "
                        "(reclamo_id, tipo, tiempo_limite_horas, tiempo_real_horas, exceso_horas, "
                        " estado_reclamo, fecha_vencimiento, fecha_deteccion, notificada) "
                        "VALUES (:reclamo_id, :tipo, :tiempo_limite_horas, :tiempo_real_horas, :exceso_horas, "
                        "        :estado_reclamo, :fecha_vencimiento, :fecha_deteccion, :notificada)"
                    ),
                    v,
                )
                creados += 1

            # B-bis) backdate deterministico del created_at de las noticias
            for titulo, _descripcion, offset in NOTICIAS:
                fecha = datetime.combine(
                    datetime.now().date() + timedelta(days=offset),
                    datetime.min.time().replace(hour=9),
                )
                await conn.execute(
                    text("UPDATE noticias SET created_at=:f WHERE municipio_id=:m AND titulo=:t"),
                    {"f": fecha, "m": municipio_id, "t": titulo},
                )
    finally:
        await engine.dispose()
    return creados, existentes


# ---------------------------------------------------------------------------
# Entry point del runner
# ---------------------------------------------------------------------------
def sembrar(api: ApiQA, hoy):
    creados = existentes = 0

    me = api.get("/auth/me")
    municipio_id = me.get("municipio_id")
    if not municipio_id:
        raise RuntimeError("[50_resto] /auth/me sin municipio_id — abortando")

    # A + B: via API (idempotentes por clave natural)
    c, e = _sembrar_configuracion(api)
    creados += c
    existentes += e
    c, e = _sembrar_noticias(api, municipio_id)
    creados += c
    existentes += e

    # C + D: tabla directa (no hay endpoint de escritura) — SOLO con DATABASE_URL de QA
    database_url = os.environ.get("DATABASE_URL", "")
    salteado = None
    if database_url:
        notificaciones = _plan_notificaciones(api)
        violaciones = _plan_sla_violaciones(api)
        c, e = asyncio.run(
            _escribir_tabla_directa(
                guard_qa(database_url), notificaciones, violaciones, municipio_id
            )
        )
        creados += c
        existentes += e
        print(f"  [notificaciones+sla_violaciones] creados={c} existentes={e}")
    else:
        salteado = "notificaciones+sla_violaciones (falta DATABASE_URL de QA)"
        print(f"  [50_resto] AVISO: {salteado}")

    print(f"[50_resto] creados={creados} existentes={existentes}")
    ret = {"creados": creados, "existentes": existentes}
    if salteado:
        ret["salteado"] = salteado
    return ret
