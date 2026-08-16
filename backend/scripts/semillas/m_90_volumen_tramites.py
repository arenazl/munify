"""m_90 — VOLUMEN de gestiones de tramite (QA Paraguay Limpio / demo Munify).

QUE PROBLEMA RESUELVE
---------------------
El kit deja el HISTORICO de reclamos con volumen real (m_60: ~939 en 12 meses)
y el pulso del dia (m_70: 10 + 10). Pero las SOLICITUDES de tramite quedaban en
~49 en total: el tablero de Tramites se veia flaco al lado del de Reclamos, y en
una demo eso se lee como "el modulo no se usa".

Este modulo carga el catalogo completo: por cada tramite del municipio genera
un lote de gestiones y las lleva por el circuito REAL (misma secuencia que
m_70: verificar documentos -> en_curso -> estado final), para que la pantalla
tenga las cuatro situaciones y no una pila de "recibidas sin atender".

DETERMINISTICO E IDEMPOTENTE
----------------------------
La clave natural es `[DEMO VOL] <tramite> · <n>` — SIN fecha, a proposito:
correrlo diez veces deja el mismo universo, no diez copias. El estado de cada
gestion sale del indice (`n % 10`), asi que la mezcla es siempre la misma y no
depende de random.

REPARTO (por cada 10 gestiones)
  4 finalizadas · 3 en curso · 2 recibidas · 1 rechazada

Es una gestion que resuelve mas de lo que acumula, que es lo que un tablero
municipal deberia mostrar. Los ingresos del DIA los pone m_70, no este modulo:
aca la fecha la sella la API (siempre hoy) y no se falsea.
"""
from __future__ import annotations

from datetime import date

from _api import ApiQA, ApiError

MARCA = "[vol_tramites]"

# Gestiones por tramite del catalogo. Con ~10 tramites deja ~120 solicitudes.
POR_TRAMITE = 12

# Estado por posicion en el lote (indice % 10). Ver el reparto del docstring.
ESTADOS = [
    "finalizado", "finalizado", "finalizado", "finalizado",
    "en_curso", "en_curso", "en_curso",
    "recibido", "recibido",
    "rechazado",
]

# Asuntos por posicion: le dan cuerpo a la lista (una columna de 120 filas con
# el mismo texto se lee como relleno). Tono asunceno, sin datos personales.
DETALLES = [
    "Presenta la documentacion completa en ventanilla.",
    "Inicia el trami­te por la web y adjunta los papeles escaneados.",
    "Gestion iniciada en el Mercado 4 durante el operativo barrial.",
    "Solicitud tomada en la sede central, con turno previo.",
    "Ingresa por mesa de entrada, pendiente de revision del area.",
    "El area pidio una aclaracion sobre el domicilio declarado.",
    "Documentacion verificada en mano por el operador de ventanilla.",
    "Queda a la espera de la inspeccion en el domicilio.",
    "Ingresada por el canal digital, sin turno.",
    "No cumple los requisitos exigidos para este tramite.",
]


def _verificar_documentos(api: ApiQA, tramite_id: int, sid: int, c: dict) -> None:
    """Tilda los documentos obligatorios (verificacion visual de ventanilla).

    Mismo circuito que m_70: el backend NO deja pasar a 'en_curso' sin los
    papeles, y tiene razon. No se saltea la validacion, se cumple.
    """
    try:
        requeridos = api.listar(f"/tramites/{tramite_id}/documentos-requeridos")
    except ApiError as e:
        c["avisos"].append(f"documentos requeridos del tramite {tramite_id}: HTTP {e.status}")
        return
    for req in requeridos:
        if not req.get("obligatorio"):
            continue
        try:
            api.post(f"/tramites/solicitudes/{sid}/requeridos/{req['id']}/verificar-visual")
        except ApiError as e:
            c["avisos"].append(f"verificar '{req.get('nombre')}' en {sid}: HTTP {e.status}")


def _mover(api: ApiQA, sid: int, tramite_id: int, destino: str, c: dict) -> None:
    """Lleva la gestion de 'recibido' al estado pedido, por la API real."""
    if destino == "recibido":
        return
    try:
        if destino in ("en_curso", "finalizado"):
            _verificar_documentos(api, tramite_id, sid, c)
            api.put(f"/tramites/solicitudes/detalle/{sid}", json={"estado": "en_curso"})
            if destino == "en_curso":
                return
        api.put(f"/tramites/solicitudes/detalle/{sid}", json={"estado": destino})
    except ApiError as e:
        c["avisos"].append(f"mover {sid} a {destino}: HTTP {e.status} {e.body[:100]}")
        c["errores"] += 1


def sembrar(api: ApiQA, hoy: date) -> dict:
    c = {"creados": 0, "existentes": 0, "errores": 0, "avisos": []}

    muni_id = (api.get("/users/me") or {}).get("municipio_id")
    if not muni_id:
        raise SystemExit(f"{MARCA} el usuario logueado no tiene municipio asignado.")

    tramites = api.listar("/tramites")
    if not tramites:
        print(f"{MARCA} el municipio no tiene tramites cargados — nada que sembrar")
        return {"creados": 0, "existentes": 0}

    vecinos = [u for u in api.listar("/users", params={"limit": 200})
               if u.get("rol") == "vecino" and u.get("dni") and not u.get("es_anonimo")]
    if not vecinos:
        print(f"{MARCA} no hay vecinos con documento — nada que sembrar")
        return {"creados": 0, "existentes": 0}

    # Universo ya sembrado, por asunto. El endpoint topea en 100 por pagina.
    existentes: dict[str, dict] = {}
    for pagina in range(1, 12):
        lote = api.listar("/tramites/solicitudes/list",
                          params={"municipio_id": muni_id, "limit": 100, "page": pagina})
        if not lote:
            break
        for s in lote:
            if s.get("asunto"):
                existentes[s["asunto"]] = s

    print(f"{MARCA} {len(tramites)} tramites x {POR_TRAMITE} gestiones "
          f"(ya hay {len(existentes)} solicitudes)")

    for t in tramites:
        for n in range(POR_TRAMITE):
            asunto = f"[DEMO VOL] {t['nombre']} · {n + 1}"
            destino = ESTADOS[n % len(ESTADOS)]

            previa = existentes.get(asunto)
            if previa is not None:
                c["existentes"] += 1
                # Convergente: si quedo a mitad de camino, se termina ahora.
                if destino != "recibido" and (previa.get("estado") or "") == "recibido":
                    _mover(api, previa["id"], t["id"], destino, c)
                continue

            try:
                creada = api.post(f"/tramites/solicitudes?municipio_id={muni_id}", json={
                    "tramite_id": t["id"],
                    "asunto": asunto,
                    "descripcion": f"[DEMO] {DETALLES[n % len(DETALLES)]}",
                    "actuando_como_user_id": vecinos[(t["id"] + n) % len(vecinos)]["id"],
                })
            except ApiError as e:
                c["avisos"].append(f"crear '{asunto}': HTTP {e.status} {e.body[:100]}")
                c["errores"] += 1
                continue

            c["creados"] += 1
            sid = (creada or {}).get("id")
            if sid:
                _mover(api, sid, t["id"], destino, c)

    for aviso in c["avisos"][:10]:
        print(f"{MARCA} AVISO: {aviso}")
    if len(c["avisos"]) > 10:
        print(f"{MARCA} ...y {len(c['avisos']) - 10} avisos mas")

    print(f"{MARCA} creados={c['creados']} existentes={c['existentes']} errores={c['errores']}")
    return {"creados": c["creados"], "existentes": c["existentes"], "errores": c["errores"]}
