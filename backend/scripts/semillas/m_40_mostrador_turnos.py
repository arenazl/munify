"""m_40 — MOSTRADOR + TURNOS + AGENDA + AUSENCIAS + HORARIOS (QA Paraguay Limpio).

Implementa los planes del inventario para:
  - Configuracion de Agenda: horarios por dependencia (27 filas) + excepciones
    (feriado Fundacion de Asuncion + apertura especial sabado).
  - Turnos: ~32 turnos SIEMPRE relativos a hoy (hoy / proximos habiles /
    historicos), mezcla con-cuenta (via POST /turnos-tramite/reservar-directo,
    que valida la grilla real) y sin-cuenta (tabla directa con guard_qa: no
    existe endpoint para turnos sin cuenta).
  - Mostrador: CI de los vecinos demo (buscador por DNI), 3 solicitudes de
    ventanilla del dia para el admin + user operador de ventanilla con 2
    gestiones propias, y 2 pagos aprobados del operador (tabla directa,
    refrescados a HOY en cada corrida => el home del mostrador queda vivo).
  - Ausencias de empleados: 4 casos (en curso / aprobada / pendiente / futura),
    fechas refrescadas relativas a hoy en cada corrida.
  - Horarios de empleados: semana completa por empleado via bulk.

Decisiones (documentadas, deterministicas):
  - Los tramites de turno se resuelven DINAMICO por dependencia (no por id
    hardcodeado): grupo Transito = 2 tramites (45' y 20'), grupo Servicios =
    el de menor id, grupo Obras = 2do y 3ro. Reproduce el plan (1040/1041,
    1042, 1045/1047) y es estable entre corridas.
  - `modo_atencion='presencial_con_turno'` se setea junto con requiere_turno:
    con el default 'online' el endpoint de reserva rebota (400). Por eso los
    turnos de Servicios/Obras van sobre sus tramites turno-habilitados (1042 /
    1045-1047) y no sobre 1044/1046/1048 como esbozaba el plan.
  - Fechas: SIEMPRE date.today() + offsets con horas fijas alineadas a la
    grilla de cada dependencia. Dias habiles salteando el feriado.
  - Idempotencia: turnos por (dependencia, fecha_hora, titular/CI); config por
    comparacion de la grilla; solicitudes por asunto con fecha del dia;
    pagos del mostrador por id fijo (se refrescan a hoy, no se duplican).
"""
from __future__ import annotations

import os
import unicodedata
from datetime import date, datetime, timedelta

from _api import ApiQA, ApiError, dias

MARCA = "[40_mostrador_turnos]"

# ---------------------------------------------------------------------------
# Datos [DEMO] fijos (deterministicos, sin random)
# ---------------------------------------------------------------------------
# CI paraguayas [DEMO] para los vecinos demo (buscador por DNI del mostrador).
# Clave: email (estable); el resto de los vecinos toma de RESERVA_CI por orden de id.
CI_VECINOS = {
    "vecino@asuncion.demo.com": ("3456789", "+595981100201"),          # Derlis
    "vecino-liz@asuncion.demo.com": ("4123456", "+595981100202"),      # Liz
    "vecino-rodrigo@asuncion.demo.com": ("2987654", "+595981100203"),  # Rodrigo
}
RESERVA_CI = [("3789012", "+595981100204"), ("4567890", "+595981100205"),
              ("5234561", "+595981100206")]

OPERADOR_EMAIL = "operador@asuncion.demo.com"
OPERADOR_PASSWORD = "demo123"

# Solicitantes sin cuenta de los turnos (nombre, CI, telefono) — [DEMO] fijos.
SIN_CUENTA = {
    "blanca":  ("Blanca Caceres [DEMO]", "3654321", "+595971234567"),
    "anibal":  ("Anibal Rojas [DEMO]", "2456789", "+595981234560"),
    "mirtha":  ("Mirtha Florentin [DEMO]", "4789123", "+595983456789"),
    "cesar":   ("Cesar Ovelar [DEMO]", "5123987", "+595984561230"),
    "lorena":  ("Lorena Galeano [DEMO]", "3987456", "+595985678901"),
    "rubenf":  ("Ruben Ferreira [DEMO]", "2789456", "+595986789012"),
    "fatima":  ("Fatima Caballero [DEMO]", "4456123", "+595987890123"),
    "gustavo": ("Gustavo Espinola [DEMO]", "3345678", "+595988901234"),
    "antonia": ("Antonia Vera [DEMO]", "5678912", "+595989012345"),
    "norma":   ("Norma Insfran [DEMO]", "2234567", "+595971112223"),
}

# Agenda por dependencia: rol -> [(dia_semana, "HH:MM", "HH:MM", cupo)]
AGENDA_DESEADA = {
    "transito":  [(d, "07:00", "13:00", 2) for d in range(5)],
    "servicios": [(d, "08:00", "12:00", 1) for d in range(5)] + [(2, "14:00", "17:00", 1)],
    "obras":     [(d, "08:30", "13:00", 1) for d in range(5)],
    "zoonosis":  [(d, "08:00", "12:00", 1) for d in (0, 2, 4)],
    "seguridad": [(d, "08:30", "13:00", 1) for d in range(5)],
}

# Ausencias: (nombre, apellido) del empleado -> (tipo, ini_off, fin_off, aprobar, motivo)
AUSENCIAS = [
    (("Derlis", "Cardozo"), "vacaciones", -10, -3, True,
     "[DEMO] Vacaciones anuales"),
    (("Nelson", "Duarte"), "licencia_medica", -1, 2, True,
     "[DEMO] Reposo por lumbalgia"),
    (("Ruben", "Villalba"), "vacaciones", 10, 17, False,
     "[DEMO] Vacaciones anuales (pendiente de aprobacion)"),
    (("Carolina", "Franco"), "capacitacion", 5, 5, True,
     "[DEMO] Curso de atencion al contribuyente"),
]

HORARIO_OPERARIO = [(d, "07:00", "15:00") for d in range(5)]
HORARIO_ADMINISTRATIVO = [(d, "08:00", "16:00") for d in range(5)]
HORARIO_SABADO = (5, "07:00", "11:00")
ADMINISTRATIVOS = [("Carolina", "Franco")]
CON_SABADO = [("Wilson", "Ayala"), ("Gustavo", "Benitez")]


# ---------------------------------------------------------------------------
# Helpers genericos
# ---------------------------------------------------------------------------
def _norm(s: str | None) -> str:
    s = unicodedata.normalize("NFD", s or "")
    return "".join(c for c in s if unicodedata.category(c) != "Mn").lower()


def _hhmm(s) -> str:
    return str(s)[:5]


def _patch(api: ApiQA, endpoint: str, json: dict):
    return api._request("PATCH", endpoint, json=json)


def _proximo_15_agosto(hoy: date) -> date:
    f = date(hoy.year, 8, 15)
    return f if f >= hoy else date(hoy.year + 1, 8, 15)


def _proximo_sabado(desde: date) -> date:
    d = desde
    while d.weekday() != 5:
        d += timedelta(days=1)
    return d


def _dias_habiles(hoy: date, direccion: int, cantidad: int, saltear: set[date]) -> list[date]:
    """`cantidad` dias habiles (lun-vie) hacia adelante (+1) o atras (-1),
    empezando en hoy+direccion, salteando feriados."""
    out, d = [], hoy
    while len(out) < cantidad:
        d = d + timedelta(days=direccion)
        if d.weekday() < 5 and d not in saltear:
            out.append(d)
    return out


def _iso(d: date, hhmm: str) -> str:
    return f"{d.isoformat()}T{hhmm}:00"


# ---------------------------------------------------------------------------
# Resolucion de contexto (dependencias, tramites, vecinos, empleados)
# ---------------------------------------------------------------------------
def _resolver_dependencias(api: ApiQA) -> dict[str, dict]:
    """rol logico -> municipio_dependencia. Match por nombre normalizado."""
    deps = api.listar("/dependencias/municipio")
    roles: dict[str, dict] = {}
    for dep in deps:
        nombre = _norm(dep.get("nombre") or (dep.get("dependencia") or {}).get("nombre"))
        if "transito" in nombre:
            roles.setdefault("transito", dep)
        elif "obras" in nombre:
            roles.setdefault("obras", dep)
        elif "zoonosis" in nombre:
            roles.setdefault("zoonosis", dep)
        elif "servicios" in nombre or "ambiente" in nombre:
            roles.setdefault("servicios", dep)
        elif "seguridad" in nombre:
            roles.setdefault("seguridad", dep)
    faltan = {"transito", "obras", "servicios"} - set(roles)
    if faltan:
        raise RuntimeError(f"{MARCA} faltan dependencias clave en el muni: {faltan}")
    return roles


def _resolver_vecinos(api: ApiQA) -> dict[str, dict]:
    """Claves: derlis / liz / rodrigo (por email) + v4 / v5 (resto por id)."""
    usuarios = api.listar("/users")
    vecinos = sorted(
        (u for u in usuarios if str(u.get("rol", "")).lower().endswith("vecino")),
        key=lambda u: u["id"],
    )
    por_email = {u.get("email"): u for u in vecinos}
    out: dict[str, dict] = {}
    usados: set[int] = set()
    for clave, email in (("derlis", "vecino@asuncion.demo.com"),
                         ("liz", "vecino-liz@asuncion.demo.com"),
                         ("rodrigo", "vecino-rodrigo@asuncion.demo.com")):
        u = por_email.get(email)
        if u:
            out[clave] = u
            usados.add(u["id"])
    resto = [u for u in vecinos if u["id"] not in usados]
    for i, clave in enumerate(("v4", "v5")):
        if i < len(resto):
            out[clave] = resto[i]
    # Fallback: si falta alguno, ciclar sobre los vecinos disponibles
    for i, clave in enumerate(("derlis", "liz", "rodrigo", "v4", "v5")):
        if clave not in out and vecinos:
            out[clave] = vecinos[i % len(vecinos)]
    if not out:
        raise RuntimeError(f"{MARCA} no hay vecinos demo en el muni")
    return out


def _grupos_tramites(api: ApiQA, tramites: list[dict], roles: dict[str, dict]) -> dict[str, list[dict]]:
    """Agrupa los tramites del muni por dependencia mapeada (consulta el mapeo real)."""
    dep_por_rol = {rol: d["id"] for rol, d in roles.items()}
    rol_por_dep = {v: k for k, v in dep_por_rol.items()}
    grupos: dict[str, list[dict]] = {"transito": [], "servicios": [], "obras": [], "sin_mapear": []}
    for t in sorted(tramites, key=lambda x: x["id"]):
        info = api.get(f"/tramites/{t['id']}/dependencia")
        dep_id = (info or {}).get("municipio_dependencia_id")
        rol = rol_por_dep.get(dep_id)
        if rol in grupos:
            grupos[rol].append(t)
        elif dep_id is None:
            grupos["sin_mapear"].append(t)
    return grupos


# ---------------------------------------------------------------------------
# Fases
# ---------------------------------------------------------------------------
def _fase_vecinos_ci(api: ApiQA, vecinos_todos: list[dict], c: dict) -> None:
    """CI [DEMO] + telefono en los vecinos demo (solo si estan vacios)."""
    reserva = iter(RESERVA_CI)
    for u in sorted(vecinos_todos, key=lambda x: x["id"]):
        ci_tel = CI_VECINOS.get(u.get("email"))
        if ci_tel is None:
            try:
                ci_tel = next(reserva)
            except StopIteration:
                continue
        payload = {}
        if not (u.get("dni") or "").strip():
            payload["dni"] = ci_tel[0]
        if not (u.get("telefono") or "").strip():
            payload["telefono"] = ci_tel[1]
        if payload:
            api.put(f"/users/{u['id']}", json=payload)
            u.update(payload)
            c["actualizados"] += 1
        else:
            c["existentes"] += 1


def _fase_operador(api: ApiQA, c: dict) -> ApiQA | None:
    """User operador de ventanilla (rol realista para la demo del mostrador)."""
    existente = api.buscar("/users", "email", OPERADOR_EMAIL)
    if existente is None:
        creado = api.post("/users", json={
            "email": OPERADOR_EMAIL,
            "password": OPERADOR_PASSWORD,
            "nombre": "Cynthia",
            "apellido": "Maldonado [DEMO]",
            "telefono": "+595981100210",
        })
        api.put(f"/users/{creado['id']}", json={"rol": "operador_ventanilla"})
        c["creados"] += 1
    else:
        if str(existente.get("rol", "")).lower() != "operador_ventanilla":
            api.put(f"/users/{existente['id']}", json={"rol": "operador_ventanilla"})
            c["actualizados"] += 1
        else:
            c["existentes"] += 1
    op = ApiQA(api.base_url)
    try:
        op.login(OPERADOR_EMAIL, OPERADOR_PASSWORD)
        return op
    except ApiError as e:
        print(f"{MARCA} AVISO: no pude loguear al operador ({e.status}) — sigo sin sus gestiones")
        return None


def _fase_tramites(api: ApiQA, roles: dict[str, dict], c: dict) -> dict[str, dict]:
    """Mapea los tramites sin dependencia y habilita turno en los 5 del plan.

    Devuelve: t40 (Transito 45'), t41 (Transito 20'), t42 (Servicios 30'),
    t45 y t47 (Obras 30').
    """
    tramites = api.listar("/tramites")
    grupos = _grupos_tramites(api, tramites, roles)

    # 1) Mapear los sin dependencia: posiciones 0,1,4 -> servicios; 2,3 -> obras
    destinos = {0: "servicios", 1: "servicios", 2: "obras", 3: "obras", 4: "servicios"}
    for i, t in enumerate(grupos["sin_mapear"]):
        rol = destinos.get(i, "servicios")
        api.put(f"/tramites/{t['id']}/dependencia",
                json={"municipio_dependencia_id": roles[rol]["id"]})
        grupos[rol].append(t)
        c["actualizados"] += 1
    for rol in ("transito", "servicios", "obras"):
        grupos[rol].sort(key=lambda x: x["id"])

    if len(grupos["transito"]) < 2 or not grupos["servicios"] or len(grupos["obras"]) < 3:
        raise RuntimeError(
            f"{MARCA} distribucion de tramites inesperada: "
            f"transito={len(grupos['transito'])} servicios={len(grupos['servicios'])} "
            f"obras={len(grupos['obras'])}"
        )

    # 2) Habilitar turnos (regla estable entre corridas):
    #    Transito: sus 2 tramites (45' y 20'); Servicios: el de menor id (30');
    #    Obras: 2do y 3ro (30') — el 1ro (mapeado historico) queda sin turno.
    seleccion = {
        "t40": (grupos["transito"][0], 45),
        "t41": (grupos["transito"][1], 20),
        "t42": (grupos["servicios"][0], 30),
        "t45": (grupos["obras"][1], 30),
        "t47": (grupos["obras"][2], 30),
    }
    for t, dur in seleccion.values():
        cambios = {}
        if not t.get("requiere_turno"):
            cambios["requiere_turno"] = True
        if t.get("duracion_turno_min") != dur:
            cambios["duracion_turno_min"] = dur
        if t.get("modo_atencion") != "presencial_con_turno":
            cambios["modo_atencion"] = "presencial_con_turno"
        if cambios:
            api.put(f"/tramites/{t['id']}", json=cambios)
            t.update(cambios)
            c["actualizados"] += 1
        else:
            c["existentes"] += 1
    return {k: v[0] for k, v in seleccion.items()}


def _fase_agenda_config(api: ApiQA, roles: dict[str, dict], hoy: date, c: dict) -> tuple[date, date]:
    """Grilla de atencion por dependencia + excepciones. Devuelve (feriado, sabado)."""
    for rol, filas in AGENDA_DESEADA.items():
        dep = roles.get(rol)
        if not dep:
            continue
        deseada = sorted((f[0], f[1], f[2], f[3]) for f in filas)
        actual = sorted(
            (r["dia_semana"], _hhmm(r["hora_inicio"]), _hhmm(r["hora_fin"]), r["cupo_max_por_slot"])
            for r in api.listar("/agenda-config", params={"dependencia_id": dep["id"]})
            if r.get("activo", True)
        )
        if actual == deseada:
            c["existentes"] += len(deseada)
            continue
        api.put(f"/agenda-config/{dep['id']}", json={"dias": [
            {"dia_semana": d, "hora_inicio": hi, "hora_fin": hf, "cupo_max_por_slot": cupo}
            for d, hi, hf, cupo in deseada
        ]})
        c["creados" if not actual else "actualizados"] += len(deseada)

    feriado = _proximo_15_agosto(hoy)
    sabado = _proximo_sabado(hoy + timedelta(days=7))

    for rol in ("transito", "servicios"):
        dep_id = roles[rol]["id"]
        existentes = api.listar("/agenda-excepciones", params={"dependencia_id": dep_id})
        if any(e["fecha"] == feriado.isoformat() for e in existentes):
            c["existentes"] += 1
        else:
            api.post("/agenda-excepciones", json={
                "municipio_dependencia_id": dep_id,
                "fecha": feriado.isoformat(),
                "tipo": "cierre",
                "motivo": "Feriado - Fundacion de Asuncion",
            })
            c["creados"] += 1

    dep_tra = roles["transito"]["id"]
    aperturas = [
        e for e in api.listar("/agenda-excepciones", params={"dependencia_id": dep_tra})
        if e["tipo"] == "apertura_especial" and e["fecha"] >= hoy.isoformat()
    ]
    if aperturas:
        c["existentes"] += 1
    else:
        api.post("/agenda-excepciones", json={
            "municipio_dependencia_id": dep_tra,
            "fecha": sabado.isoformat(),
            "tipo": "apertura_especial",
            "hora_inicio_override": "09:00",
            "hora_fin_override": "12:00",
            "motivo": "Operativo licencias sabado [DEMO]",
        })
        c["creados"] += 1
    return feriado, sabado


def _plan_turnos(hoy: date, feriado: date) -> list[dict]:
    """Lista deterministica de turnos: dep(rol), fecha, hora, tramite(clave),
    titular (vecino / sin-cuenta), estado final y via (api|sql)."""
    saltear = {feriado}
    futuros = _dias_habiles(hoy, +1, 3, saltear)   # f1, f2, f3
    pasados = _dias_habiles(hoy, -1, 4, saltear)   # p1 (ayer habil) .. p4

    def V(clave):
        return {"vecino": clave}

    def S(clave):
        return {"sin_cuenta": clave}

    f1, f2, f3 = futuros
    p1, p2, p3, p4 = pasados
    plan = [
        # --- HOY: Transito (mostrador en vivo: cumplidos, 1 ausente, resto reservado)
        dict(rol="transito", fecha=hoy, hora="08:30", tramite="t40", estado="cumplido", **V("derlis")),
        dict(rol="transito", fecha=hoy, hora="09:00", tramite="t41", estado="cumplido", **V("liz")),
        dict(rol="transito", fecha=hoy, hora="09:15", tramite="t40", estado="cumplido", **S("blanca")),
        dict(rol="transito", fecha=hoy, hora="09:40", tramite="t41", estado="ausente", **S("anibal")),
        dict(rol="transito", fecha=hoy, hora="10:00", tramite="t40", estado="reservado", **V("rodrigo")),
        dict(rol="transito", fecha=hoy, hora="10:45", tramite="t40", estado="reservado", **S("mirtha")),
        dict(rol="transito", fecha=hoy, hora="11:20", tramite="t41", estado="reservado", **V("v4")),
        dict(rol="transito", fecha=hoy, hora="12:15", tramite="t40", estado="reservado", **S("cesar")),
        # --- HOY: Servicios y Obras
        dict(rol="servicios", fecha=hoy, hora="10:30", tramite="t42", estado="reservado", **V("v5")),
        dict(rol="servicios", fecha=hoy, hora="11:00", tramite="t42", estado="reservado", **S("lorena")),
        dict(rol="servicios", fecha=hoy, hora="11:30", tramite="t42", estado="reservado", **V("liz")),
        dict(rol="obras", fecha=hoy, hora="10:00", tramite="t45", estado="reservado", **V("rodrigo")),
        dict(rol="obras", fecha=hoy, hora="12:00", tramite="t47", estado="reservado", **S("rubenf")),
        # --- Proximos dias habiles (todo reservado)
        dict(rol="transito", fecha=f1, hora="09:15", tramite="t40", estado="reservado", **V("rodrigo")),
        dict(rol="transito", fecha=f1, hora="10:20", tramite="t41", estado="reservado", **S("fatima")),
        dict(rol="servicios", fecha=f1, hora="09:00", tramite="t42", estado="reservado", **V("v5")),
        dict(rol="obras", fecha=f1, hora="11:00", tramite="t45", estado="reservado", **V("v4")),
        dict(rol="transito", fecha=f2, hora="10:00", tramite="t41", estado="reservado", **V("derlis")),
        dict(rol="transito", fecha=f2, hora="11:30", tramite="t40", estado="reservado", **V("liz")),
        dict(rol="servicios", fecha=f2, hora="10:00", tramite="t42", estado="reservado", **S("gustavo")),
        dict(rol="obras", fecha=f2, hora="09:30", tramite="t47", estado="reservado", **V("rodrigo")),
        dict(rol="transito", fecha=f3, hora="12:15", tramite="t40", estado="reservado", **S("antonia")),
        dict(rol="servicios", fecha=f3, hora="08:30", tramite="t42", estado="reservado", **V("v4")),
        dict(rol="obras", fecha=f3, hora="10:30", tramite=None, estado="reservado",
             motivo_tipo="atencion_general", **S("norma")),
        # --- Historicos (demanda + ausentismo ~25% para /stats)
        dict(rol="transito", fecha=p1, hora="08:30", tramite="t40", estado="cumplido", **V("liz")),
        dict(rol="servicios", fecha=p1, hora="09:00", tramite="t42", estado="cumplido", **S("blanca")),
        dict(rol="transito", fecha=p2, hora="09:15", tramite="t40", estado="ausente", **S("anibal")),
        dict(rol="obras", fecha=p2, hora="10:00", tramite="t45", estado="cumplido", **V("v5")),
        dict(rol="transito", fecha=p3, hora="10:00", tramite="t41", estado="cumplido", **V("rodrigo")),
        dict(rol="servicios", fecha=p3, hora="10:30", tramite="t42", estado="cancelado", **V("v4")),
        dict(rol="transito", fecha=p4, hora="09:00", tramite="t41", estado="cumplido", **V("derlis")),
        dict(rol="obras", fecha=p4, hora="11:30", tramite="t47", estado="ausente", **V("liz")),
    ]
    return plan


def _fase_turnos_api(api: ApiQA, plan: list[dict], roles: dict[str, dict],
                     tramites: dict[str, dict], vecinos: dict[str, dict], c: dict) -> None:
    """Turnos con cuenta via /turnos-tramite/reservar-directo (+ PATCH de estado).

    BUG CONOCIDO del backend (reportado): reservar_turno() toma GET_LOCK y el
    RELEASE_LOCK del finally corre DESPUES del commit — la sesion ya devolvio
    la conexion al pool, el release cae en OTRA conexion y el advisory lock
    queda colgado => 503 'lock ocupado' intermitente. Mitigacion: 1 reintento
    y, si sigue trabado, el turno se marca para fallback por tabla directa
    (item['_fallback_sql']=True) que resuelve _fase_sql.
    """
    # Agenda existente por dependencia (ventana hoy-10 .. hoy+10)
    agenda: dict[int, list[dict]] = {}
    for rol in ("transito", "servicios", "obras"):
        dep_id = roles[rol]["id"]
        agenda[dep_id] = api.listar("/turnos-tramite/agenda", params={
            "dependencia_id": dep_id, "desde": dias(-10), "hasta": dias(+10),
        })

    for item in plan:
        if "vecino" not in item:
            continue  # los sin-cuenta van por tabla directa
        dep_id = roles[item["rol"]]["id"]
        vecino = vecinos[item["vecino"]]
        fh = _iso(item["fecha"], item["hora"])
        existente = next(
            (t for t in agenda[dep_id]
             if str(t.get("fecha_hora", ""))[:16] == fh[:16]
             and t.get("usuario_id") == vecino["id"]),
            None,
        )
        if existente is not None:
            if existente.get("estado") == "reservado" and item["estado"] != "reservado":
                _patch(api, f"/turnos-tramite/{existente['id']}", {"estado": item["estado"]})
                c["actualizados"] += 1
            else:
                c["existentes"] += 1
            continue

        turno, ultimo_error = None, None
        for _intento in range(2):  # 1 reintento ante el lock colgado
            try:
                turno = api.post("/turnos-tramite/reservar-directo", json={
                    "tramite_id": tramites[item["tramite"]]["id"],
                    "fecha_hora": fh,
                    "actuando_como_user_id": vecino["id"],
                })
                break
            except ApiError as e:
                ultimo_error = e
                if e.status != 503:
                    break
        if turno is not None:
            c["creados"] += 1
            if item["estado"] != "reservado":
                _patch(api, f"/turnos-tramite/{turno['id']}", {"estado": item["estado"]})
        elif ultimo_error is not None and ultimo_error.status == 503:
            item["_fallback_sql"] = True  # lock colgado: lo resuelve la fase tabla-directa
        else:
            print(f"{MARCA} AVISO turno {item['rol']} {fh}: HTTP "
                  f"{ultimo_error.status} — {ultimo_error.body[:120]}")
            c["errores"] += 1


def _fase_solicitudes_mostrador(api: ApiQA, operador: ApiQA | None, muni_id: int,
                                tramites: dict[str, dict], vecinos: dict[str, dict],
                                hoy: date, c: dict) -> None:
    """Gestiones de ventanilla de HOY (metricas per-operador del home del mostrador).

    El asunto lleva la fecha => corrida nueva en otro dia = gestiones nuevas de
    ese dia (rotativo); segunda corrida el mismo dia = 0 creaciones.
    """
    casos = [
        (api, "t41", "derlis"),
        (api, "t45", "liz"),
        (api, "t47", "rodrigo"),
        (operador, "t41", "v4"),
        (operador, "t42", "v5"),
    ]
    for cliente, clave_tramite, clave_vecino in casos:
        if cliente is None:
            continue
        tramite = tramites[clave_tramite]
        vecino = vecinos[clave_vecino]
        asunto = f"[DEMO] Ventanilla {hoy.isoformat()} - {tramite['nombre']} - {vecino['nombre']}"
        # Clave natural: asunto (lleva la fecha) + solicitante. Solo asunto no
        # alcanza: dos vecinos demo homonimos ("Derlis") producian colision.
        existente = next(
            (s for s in cliente.listar(
                "/tramites/solicitudes/list",
                params={"municipio_id": muni_id, "tramite_id": tramite["id"], "limit": 100})
             if s.get("asunto") == asunto
             and (s.get("solicitante") or {}).get("id") == vecino["id"]),
            None,
        )
        if existente is not None:
            c["existentes"] += 1
            continue
        cliente.post(f"/tramites/solicitudes?municipio_id={muni_id}", json={
            "tramite_id": tramite["id"],
            "asunto": asunto,
            "descripcion": "[DEMO] Gestion iniciada en el mostrador (ventanilla asistida).",
            "actuando_como_user_id": vecino["id"],
        })
        c["creados"] += 1


def _fase_ausencias(api: ApiQA, hoy: date, c: dict) -> None:
    empleados = api.listar("/empleados")

    def buscar_empleado(nombre, apellido):
        for e in empleados:
            if _norm(e.get("nombre")).startswith(_norm(nombre)) and _norm(apellido) in _norm(e.get("apellido")):
                return e
        return None

    existentes = api.listar("/empleados-gestion/ausencias")
    for (nombre, apellido), tipo, ini, fin, aprobar, motivo in AUSENCIAS:
        emp = buscar_empleado(nombre, apellido)
        if not emp:
            print(f"{MARCA} AVISO: empleado '{nombre} {apellido}' no encontrado — salteo su ausencia")
            c["errores"] += 1
            continue
        deseado = {"fecha_inicio": dias(ini), "fecha_fin": dias(fin)}
        fila = next(
            (a for a in existentes if a.get("empleado_id") == emp["id"] and a.get("tipo") == tipo),
            None,
        )
        if fila is None:
            fila = api.post("/empleados-gestion/ausencias", json={
                "empleado_id": emp["id"], "tipo": tipo, "motivo": motivo, **deseado,
            })
            if aprobar:
                api.put(f"/empleados-gestion/ausencias/{fila['id']}", json={"aprobado": True})
            c["creados"] += 1
        else:
            cambios = {k: v for k, v in deseado.items() if str(fila.get(k)) != v}
            if aprobar and not fila.get("aprobado"):
                cambios["aprobado"] = True
            if cambios:
                api.put(f"/empleados-gestion/ausencias/{fila['id']}", json=cambios)
                c["actualizados"] += 1
            else:
                c["existentes"] += 1


def _fase_horarios(api: ApiQA, c: dict) -> None:
    empleados = api.listar("/empleados")
    horarios = api.listar("/empleados-gestion/horarios")
    por_empleado: dict[int, list] = {}
    for h in horarios:
        por_empleado.setdefault(h["empleado_id"], []).append(h)

    def es(e, lista):
        return any(_norm(e.get("nombre")).startswith(_norm(n)) and _norm(a) in _norm(e.get("apellido"))
                   for n, a in lista)

    for emp in sorted(empleados, key=lambda x: x["id"]):
        semana = list(HORARIO_ADMINISTRATIVO if es(emp, ADMINISTRATIVOS) else HORARIO_OPERARIO)
        if es(emp, CON_SABADO):
            semana.append(HORARIO_SABADO)
        deseado = sorted((d, hi, hf) for d, hi, hf in semana)
        actual = sorted(
            (h["dia_semana"], _hhmm(h["hora_entrada"]), _hhmm(h["hora_salida"]))
            for h in por_empleado.get(emp["id"], []) if h.get("activo", True)
        )
        if actual == deseado:
            c["existentes"] += len(deseado)
            continue
        api.post(f"/empleados-gestion/horarios/bulk/{emp['id']}", json=[
            {"empleado_id": emp["id"], "dia_semana": d, "hora_entrada": hi,
             "hora_salida": hf, "activo": True}
            for d, hi, hf in deseado
        ])
        c["creados" if not actual else "actualizados"] += len(deseado)


# ---------------------------------------------------------------------------
# Tabla directa (guard_qa): turnos sin cuenta + pagos del mostrador
# ---------------------------------------------------------------------------
def _fase_sql(plan: list[dict], roles: dict[str, dict], tramites: dict[str, dict],
              vecinos: dict[str, dict], muni_id: int, admin_id: int, hoy: date, c: dict) -> None:
    """Sin endpoint de escritura para: turnos sin-cuenta / atencion_general y
    sesiones de pago aprobadas del operador. Van por SQLAlchemy con guard_qa."""
    url = os.environ.get("DATABASE_URL", "")
    if not url:
        print(f"{MARCA} AVISO: DATABASE_URL no seteada — omito turnos sin-cuenta y pagos del mostrador")
        c["omitidos"] += sum(1 for i in plan if "sin_cuenta" in i or i.get("_fallback_sql")) + 2
        return

    from _api import guard_qa
    url = guard_qa(url)
    for viejo, nuevo in (("mysql+pymysql://", "mysql+aiomysql://"),):
        url = url.replace(viejo, nuevo)
    if url.startswith("mysql://"):
        url = url.replace("mysql://", "mysql+aiomysql://", 1)

    filas_turnos = []
    for item in plan:
        es_sin_cuenta = "sin_cuenta" in item
        es_fallback = item.get("_fallback_sql", False)
        if not es_sin_cuenta and not es_fallback:
            continue
        if es_sin_cuenta:
            nombre, ci, tel = SIN_CUENTA[item["sin_cuenta"]]
            usuario_id = None
        else:
            # Fallback del lock colgado: mismo snapshot que haria reservar-directo
            v = vecinos[item["vecino"]]
            nombre = f"{v.get('nombre') or ''} {v.get('apellido') or ''}".strip() or None
            ci, tel, usuario_id = v.get("dni"), v.get("telefono"), v["id"]
        tramite = tramites[item["tramite"]] if item.get("tramite") else None
        filas_turnos.append({
            "motivo_tipo": item.get("motivo_tipo", "tramite"),
            "nombre": nombre, "dni": ci, "tel": tel,
            "tramite_id": tramite["id"] if tramite else None,
            "usuario_id": usuario_id,
            "dep_id": roles[item["rol"]]["id"],
            "muni_id": muni_id,
            "fecha_hora": datetime.fromisoformat(_iso(item["fecha"], item["hora"])),
            "duracion": (tramite or {}).get("duracion_turno_min") or 30,
            "estado": item["estado"],
        })

    # Pagos del operador (mostrador home): id fijo, fechas refrescadas a HOY.
    pagos = [
        {"id": "PB-MOSTRADOR001", "vecino": vecinos["derlis"]["id"], "monto": 150000,
         "concepto": "[DEMO] Tasa de recoleccion - pago en ventanilla",
         "cut": "CUT-MOSTR1", "ext": "MOCK-MOSTR-001",
         "completed": datetime.combine(hoy, datetime.min.time()) + timedelta(hours=11, minutes=40)},
        {"id": "PB-MOSTRADOR002", "vecino": vecinos["liz"]["id"], "monto": 85000,
         "concepto": "[DEMO] Patente de rodados - pago en ventanilla",
         "cut": "CUT-MOSTR2", "ext": "MOCK-MOSTR-002",
         "completed": datetime.combine(hoy, datetime.min.time()) + timedelta(hours=13, minutes=5)},
    ]

    import asyncio

    async def correr():
        from sqlalchemy import text
        from sqlalchemy.ext.asyncio import create_async_engine
        engine = create_async_engine(url)
        try:
            async with engine.begin() as conn:
                for f in filas_turnos:
                    if f["usuario_id"] is not None:
                        q = text("SELECT id FROM turnos WHERE municipio_dependencia_id=:dep "
                                 "AND fecha_hora=:fh AND usuario_id=:usr")
                        params = {"dep": f["dep_id"], "fh": f["fecha_hora"], "usr": f["usuario_id"]}
                    elif f["motivo_tipo"] == "atencion_general":
                        q = text("SELECT id FROM turnos WHERE municipio_dependencia_id=:dep "
                                 "AND fecha_hora=:fh AND motivo_tipo='atencion_general'")
                        params = {"dep": f["dep_id"], "fh": f["fecha_hora"]}
                    else:
                        q = text("SELECT id FROM turnos WHERE municipio_dependencia_id=:dep "
                                 "AND fecha_hora=:fh AND dni_solicitante=:dni")
                        params = {"dep": f["dep_id"], "fh": f["fecha_hora"], "dni": f["dni"]}
                    if (await conn.execute(q, params)).first():
                        c["existentes"] += 1
                        continue
                    await conn.execute(text(
                        "INSERT INTO turnos (motivo_tipo, origen_id, solicitud_id, "
                        "nombre_solicitante, dni_solicitante, telefono_solicitante, tramite_id, "
                        "usuario_id, municipio_dependencia_id, municipio_id, fecha_hora, "
                        "duracion_min, estado) VALUES (:mt, NULL, NULL, :nom, :dni, :tel, :tra, "
                        ":usr, :dep, :muni, :fh, :dur, :est)"
                    ), {"mt": f["motivo_tipo"], "nom": f["nombre"], "dni": f["dni"],
                        "tel": f["tel"], "tra": f["tramite_id"], "usr": f["usuario_id"],
                        "dep": f["dep_id"], "muni": f["muni_id"], "fh": f["fecha_hora"],
                        "dur": f["duracion"], "est": f["estado"]})
                    c["creados"] += 1

                for p in pagos:
                    existe = (await conn.execute(
                        text("SELECT id FROM pago_sesiones WHERE id=:id"), {"id": p["id"]}
                    )).first()
                    creado_en = p["completed"] - timedelta(minutes=10)
                    if existe:
                        # Rotativo: refrescar a HOY para que el home del mostrador quede vivo
                        await conn.execute(text(
                            "UPDATE pago_sesiones SET completed_at=:comp, created_at=:crea "
                            "WHERE id=:id AND (completed_at IS NULL OR completed_at < :crea)"
                        ), {"comp": p["completed"], "crea": creado_en, "id": p["id"]})
                        c["existentes"] += 1
                        continue
                    await conn.execute(text(
                        "INSERT INTO pago_sesiones (id, deuda_id, solicitud_id, municipio_id, "
                        "vecino_user_id, concepto, monto, estado, medio_pago, provider, "
                        "external_id, created_at, completed_at, codigo_cut_qr, imputacion_estado, "
                        "canal, operador_user_id) VALUES (:id, NULL, NULL, :muni, :vec, :con, "
                        ":monto, 'approved', 'efectivo_ventanilla', 'mock', :ext, :crea, :comp, "
                        ":cut, 'pendiente', 'ventanilla_asistida', :op)"
                    ), {"id": p["id"], "muni": muni_id, "vec": p["vecino"], "con": p["concepto"],
                        "monto": p["monto"], "ext": p["ext"], "crea": creado_en,
                        "comp": p["completed"], "cut": p["cut"], "op": admin_id})
                    c["creados"] += 1
        finally:
            await engine.dispose()

    try:
        asyncio.run(correr())
    except Exception as e:  # noqa: BLE001 — la parte API ya corrio; reportar y seguir
        print(f"{MARCA} AVISO tabla-directa fallo: {type(e).__name__}: {e}")
        c["errores"] += 1


# ---------------------------------------------------------------------------
# Entry point del runner
# ---------------------------------------------------------------------------
def sembrar(api: ApiQA, hoy: date) -> dict:
    c = {"creados": 0, "existentes": 0, "actualizados": 0, "errores": 0, "omitidos": 0}

    yo = api.get("/users/me")
    muni_id = yo["municipio_id"]
    admin_id = yo["id"]

    roles = _resolver_dependencias(api)
    vecinos_todos = [u for u in api.listar("/users")
                     if str(u.get("rol", "")).lower().endswith("vecino")]

    _fase_vecinos_ci(api, vecinos_todos, c)
    vecinos = _resolver_vecinos(api)
    operador = _fase_operador(api, c)
    tramites = _fase_tramites(api, roles, c)
    feriado, _sabado = _fase_agenda_config(api, roles, hoy, c)

    plan = _plan_turnos(hoy, feriado)
    _fase_turnos_api(api, plan, roles, tramites, vecinos, c)
    _fase_solicitudes_mostrador(api, operador, muni_id, tramites, vecinos, hoy, c)
    _fase_sql(plan, roles, tramites, vecinos, muni_id, admin_id, hoy, c)
    _fase_ausencias(api, hoy, c)
    _fase_horarios(api, c)

    print(f"{MARCA} creados={c['creados']} existentes={c['existentes']} "
          f"actualizados={c['actualizados']} errores={c['errores']} omitidos={c['omitidos']}")
    return c
