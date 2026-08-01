"""El pulso de HOY: 10 reclamos + 10 gestiones de tramite del dia, cada uno en
una situacion distinta del circuito.

QUE PROBLEMA RESUELVE
---------------------
El resto del kit siembra el HISTORICO (m_60 deja 939 reclamos en 12 meses con
su curva de mejora). Pero una demo se da un dia concreto, y el intendente mira
el tablero y lee "hoy entraron 0 reclamos nuevos". Con un ano de datos atras,
la app igual parece muerta.

Este modulo es la capa VIVA: deja el dia de hoy con movimiento y variedad.

SEMILLA EVOLUTIVA
-----------------
La clave natural de cada caso lleva la FECHA DE HOY. De ahi salen tres
propiedades, y la tercera es la que la hace util de verdad:

  - Correrla de nuevo el mismo dia  -> 0 creaciones (idempotente).
  - Correrla otro dia               -> el dia nuevo, completo, sin tocar lo ya
                                       sembrado (acumula historia, no la pisa).
  - Si un caso quedo a mitad        -> lo TERMINA (convergente). Si una corrida
                                       anterior creo el reclamo pero no pudo
                                       cerrarlo, la siguiente lo lleva al estado
                                       que corresponde en vez de saltearlo por
                                       "ya existe".

O sea: la demo no se gasta. Se corre antes de mostrar la app y siempre hay
actividad fresca del dia.

COMO SE LOGRA CADA SITUACION
----------------------------
Por las TRANSICIONES REALES de la API (iniciar / comentario / resolver /
rechazar), nunca escribiendo el estado a mano en la tabla. El historial, las
notificaciones y los tiempos los genera el backend igual que en produccion.

Dos cosas que el circuito REAL impone y que este modulo respeta en vez de
esquivar (se verificaron contra el backend de QA, no se supusieron):

  - Los reclamos NACEN en 'recibido' y con la dependencia ya puesta: el backend
    auto-asigna el area segun la categoria. Por eso aca no hay paso "asignar"
    (ese endpoint solo aplica a estados legacy) ni casos que dependan de
    elegir el area a mano.
  - Un tramite no arranca sin sus papeles: para pasar a 'en_curso' hay que
    verificar los documentos obligatorios. Se hace el paso de ventanilla real
    (verificacion visual, sin archivo), no se saltea la validacion.

DATOS
-----
- Direcciones y coordenadas: esquinas REALES de OpenStreetMap del cache
  datos/osm_asuncion.json (el mismo que usa m_60). CERO coordenadas inventadas.
- Catalogos (categorias, tramites, vecinos): se resuelven POR NOMBRE contra la
  API. Ningun id hardcodeado, asi el modulo sirve para cualquier municipio con
  catalogos equivalentes.
- Todo el contenido va marcado [DEMO].

DEGRADACION
-----------
Si un caso no se puede completar (falta una credencial, no existe un catalogo,
el backend rechaza una transicion), se AVISA por consola y se sigue con el
resto. Nunca se rellena con un dato falso ni se da por hecho lo que no paso.
"""
from __future__ import annotations

import json
import unicodedata
from datetime import date
from pathlib import Path

from _api import ApiQA, ApiError

MARCA = "[dia_vivo]"
CARPETA = Path(__file__).resolve().parent
CACHE_OSM = CARPETA / "datos" / "osm_asuncion.json"

# Token que hace de clave natural del dia: va en el titulo/asunto de cada caso
# y es lo que se busca para saber que se sembro hoy.
TOKEN_DIA = "Dia vivo"

# Credenciales demo del ambiente QA (mismo set que usa m_40).
OPERADOR = ("operador@asuncion.demo.com", "demo123")
VECINO_APP = ("vecino@asuncion.demo.com", "demo123")  # Derlis Gonzalez


# ---------------------------------------------------------------------------
# Los 10 reclamos del dia.
#
# Las situaciones son las que el circuito permite de verdad: entra en
# 'recibido' (por el canal que sea), y de ahi se mueve con iniciar / comentario
# / resolver / rechazar. El reparto busca que el tablero no se vea de un solo
# color: 5 recibidos (lo que acaba de entrar), 2 en curso, 2 cerrados hoy y 1
# rechazado.
# ---------------------------------------------------------------------------
RECLAMOS = [
    {
        "clave": "alumbrado",
        "categoria": "Alumbrado publico",
        "titulo": "Cuatro luminarias apagadas sobre la avenida",
        "descripcion": "Vecinos reportan que el tramo quedo a oscuras desde anoche. "
                       "La cuadra tiene parada de colectivo y se junta gente a la salida del trabajo.",
        "situacion": "recibido_app",
    },
    {
        "clave": "residuos",
        "categoria": "Recoleccion de residuos",
        "titulo": "Residuos acumulados hace tres dias en la esquina",
        "descripcion": "El camion no paso el lunes ni el miercoles. Hay bolsas rotas en la vereda "
                       "y perros que las abren durante la noche.",
        "situacion": "recibido_ventanilla",
    },
    {
        "clave": "ruidos",
        "categoria": "Ruidos y convivencia",
        "titulo": "Ruidos molestos de madrugada en un local",
        "descripcion": "Musica a alto volumen despues de las 2 de la manana durante el fin de semana. "
                       "El denunciante prefiere no identificarse por vivir en la misma cuadra.",
        "situacion": "recibido_anonimo",
    },
    {
        "clave": "bacheo",
        "categoria": "Bacheo y calles",
        "titulo": "Pozo profundo en la calzada",
        "descripcion": "Pozo de aproximadamente un metro que ocupa medio carril. Ya rompio la "
                       "suspension de dos autos segun los vecinos.",
        "situacion": "recibido",
    },
    {
        "clave": "agua",
        "categoria": "Agua y cloacas",
        "titulo": "Perdida de agua permanente en la vereda",
        "descripcion": "Sale agua limpia desde hace una semana y corre por el cordon. "
                       "La vereda esta siempre mojada y resbalosa.",
        "situacion": "recibido",
    },
    {
        "clave": "arbolado",
        "categoria": "Arbolado y espacios verdes",
        "titulo": "Rama caida obstruye el paso peatonal",
        "descripcion": "Se desprendio una rama grande con el temporal. Los peatones tienen que "
                       "bajar a la calle para poder pasar.",
        "situacion": "en_curso",
        "inicio": "Cuadrilla en el lugar con motosierra. Se corta y se retira el material.",
    },
    {
        "clave": "animales",
        "categoria": "Animales sueltos",
        "titulo": "Perros sueltos en la puerta de la escuela",
        "descripcion": "Tres perros sin dueno identificado en el horario de entrada y salida. "
                       "Ya hubo un chico mordido la semana pasada.",
        "situacion": "en_curso_comentado",
        "inicio": "Se acerca el movil de Zoonosis para censar y capturar.",
        "avance": "Dos ejemplares capturados y trasladados. Queda uno que se retira "
                  "al ver el movil; se vuelve manana temprano.",
    },
    {
        "clave": "transito",
        "categoria": "Transito y senalizacion",
        "titulo": "Semaforo intermitente en cruce con mucho transito",
        "descripcion": "El semaforo quedo en amarillo intermitente. Es un cruce con doble mano "
                       "y a la hora pico se traba.",
        "situacion": "finalizado",
        "inicio": "Se despacha movil de senalizacion para revisar el tablero.",
        "resolucion": "Se reemplazo la placa de control del semaforo. Cruce funcionando "
                      "en ciclo normal y verificado en el lugar.",
    },
    {
        "clave": "higiene",
        "categoria": "Higiene urbana",
        "titulo": "Microbasural en terreno baldio",
        "descripcion": "Se acumulan escombros y restos de poda en un baldio sin cerco. "
                       "Los vecinos piden que se limpie y se cierre.",
        "situacion": "finalizado_comentado",
        "inicio": "Se envia camion y pala mecanica al predio.",
        "avance": "Retirada la primera tanda. Se necesita una segunda vuelta por el volumen.",
        "resolucion": "Predio limpio, se retiraron seis metros cubicos de escombro y resto "
                      "de poda. Queda pendiente el cerco a cargo del propietario.",
    },
    {
        "clave": "plagas",
        "categoria": "Plagas y control",
        "titulo": "Posible criadero de mosquitos en una obra parada",
        "descripcion": "Hay recipientes con agua estancada dentro de una obra sin actividad.",
        "situacion": "rechazado",
        "motivo": "duplicado",
        "detalle_rechazo": "Ya existe un reclamo abierto para el mismo predio, cargado esta "
                           "semana. Se continua el seguimiento en aquel.",
    },
]

# Situaciones que solo definen el CANAL de entrada: el reclamo queda donde
# entro ('recibido'), sin transiciones posteriores.
SOLO_ENTRADA = {"recibido", "recibido_app", "recibido_ventanilla", "recibido_anonimo"}


# ---------------------------------------------------------------------------
# Las 10 gestiones de tramite del dia. Mismo criterio de variedad. El estado
# de cada una es el que el circuito permite alcanzar de verdad: los tramites
# con arancel NO se pueden finalizar sin el pago del vecino, asi que quedan
# esperandolo en vez de forzarles un cierre que en la app no existiria.
# ---------------------------------------------------------------------------
SOLICITUDES = [
    {"clave": "lic1", "tramite": "Licencia de conducir - Primera vez",
     "detalle": "Ingresa la solicitud con la documentacion basica. Queda a la espera del turno de examen.",
     "estado": None},
    {"clave": "lic2", "tramite": "Renovacion de licencia de conducir",
     "detalle": "Renovacion presentada en ventanilla. Documentacion completa.",
     "estado": None},
    {"clave": "hab1", "tramite": "Habilitacion comercial",
     "detalle": "Apertura de un comercio de rubro gastronomico. Se inicia la revision del legajo.",
     "estado": "en_curso"},
    {"clave": "hab2", "tramite": "Renovacion de habilitacion comercial",
     "detalle": "Renovacion anual. En revision por el area de habilitaciones.",
     "estado": "en_curso"},
    {"clave": "obra", "tramite": "Permiso de obra menor",
     "detalle": "Ampliacion de vivienda familiar. Se liquido la tasa y espera el pago del vecino.",
     "estado": "pendiente_pago"},
    {"clave": "deuda", "tramite": "Certificado de libre deuda municipal",
     "detalle": "Solicitado para escrituracion. Sin deuda registrada; resta abonar el arancel.",
     "estado": "pendiente_pago"},
    {"clave": "tasa", "tramite": "Pago de tasa de recoleccion de residuos",
     "detalle": "Pago del periodo en ventanilla.",
     "estado": "finalizado"},
    {"clave": "resid", "tramite": "Certificado de residencia",
     "detalle": "Solicitud para presentar ante una entidad bancaria.",
     "estado": None},
    {"clave": "poda", "tramite": "Permiso de poda de arbol",
     "detalle": "Poda de un ejemplar que toca el tendido electrico. Queda diferido a la espera "
                "del informe del area de arbolado.",
     "estado": "pospuesto"},
    {"clave": "alim", "tramite": "Habilitacion de transporte de alimentos",
     "detalle": "El vehiculo presentado no cumple con el equipamiento de frio exigido.",
     "estado": "rechazado"},
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _norm(texto) -> str:
    """Normaliza para matchear catalogos por nombre: sin acentos, minusculas.

    Los catalogos vienen acentuados ("Alumbrado público") y este archivo los
    escribe sin acentos para no depender del encoding. El match tiene que ser
    tolerante o no encuentra nada.
    """
    if texto is None:
        return ""
    sin = unicodedata.normalize("NFKD", str(texto))
    sin = "".join(c for c in sin if not unicodedata.combining(c))
    return " ".join(sin.lower().split())


def _indice_por_nombre(items: list, campo: str = "nombre") -> dict:
    return {_norm(it.get(campo)): it for it in items if isinstance(it, dict)}


def _buscar_en(indice: dict, nombre: str, que: str, avisos: list):
    obj = indice.get(_norm(nombre))
    if obj is None:
        avisos.append(f"{que} '{nombre}' no existe en el municipio — se saltea el caso")
    return obj


def _esquinas_reales(cantidad: int) -> list[dict]:
    """N esquinas REALES de Asuncion, deterministicas y separadas entre si.

    Del cache de OpenStreetMap (3000 esquinas con el nombre de ambas calles).
    El paso primo reparte los puntos a lo largo del archivo en vez de tomar N
    esquinas contiguas del mismo barrio, para que el mapa del dia no muestre
    todos los casos amontonados en una manzana.
    """
    if not CACHE_OSM.exists():
        raise SystemExit(
            f"{MARCA} falta el cache {CACHE_OSM.name}.\n"
            f"                generalo con: python osm_asuncion_fetch.py"
        )
    osm = json.loads(CACHE_OSM.read_text(encoding="utf-8"))
    con_nombre = [e for e in osm["esquinas"] if e.get("a") and e.get("b")]
    if not con_nombre:
        raise SystemExit(f"{MARCA} el cache no tiene esquinas con nombre de calle.")
    paso = 293  # primo: recorre todo el archivo en vez de quedarse en una zona
    return [con_nombre[(i * paso) % len(con_nombre)] for i in range(cantidad)]


def _cliente(base_url: str, credencial: tuple[str, str], rol: str, avisos: list) -> ApiQA | None:
    """Cliente logueado con otra credencial (vecino / operador), o None con aviso."""
    cli = ApiQA(base_url)
    try:
        cli.login(*credencial)
        return cli
    except ApiError as e:
        avisos.append(f"no se pudo entrar como {rol} ({credencial[0]}): HTTP {e.status}")
        return None


def _paso(c: dict, clave: str, nombre: str, accion) -> bool:
    """Ejecuta una transicion; si el backend la rechaza, avisa y devuelve False."""
    try:
        accion()
        return True
    except ApiError as e:
        c["avisos"].append(f"'{clave}': no se pudo {nombre} — HTTP {e.status} {e.body[:120]}")
        c["errores"] += 1
        return False


# ---------------------------------------------------------------------------
# Fase 1 — reclamos del dia
# ---------------------------------------------------------------------------
def _sembrar_reclamos(api: ApiQA, hoy: date, c: dict) -> None:
    sufijo = f"{TOKEN_DIA} {hoy.isoformat()}"

    categorias = _indice_por_nombre(api.listar("/categorias-reclamo"))
    if not categorias:
        c["avisos"].append("el municipio no tiene categorias de reclamo — no se siembran reclamos")
        return

    # Un solo GET trae lo ya sembrado hoy (el token vive en el titulo). Se
    # guarda el objeto entero, no solo el titulo, para poder CONVERGER: si el
    # caso existe pero quedo a mitad, se lo termina.
    ya_hoy = {r.get("titulo"): r
              for r in api.listar("/reclamos", params={"search": sufijo, "limit": 100})}

    esquinas = _esquinas_reales(len(RECLAMOS))
    vecino_app = _cliente(api.base_url, VECINO_APP, "vecino", c["avisos"])
    operador = _cliente(api.base_url, OPERADOR, "operador de ventanilla", c["avisos"])

    anonimo_id = None
    try:
        # El endpoint responde un VecinoEncontrado: la clave es `user_id`, no `id`.
        anonimo_id = ((operador or api).post("/operador/vecinos/anonimo") or {}).get("user_id")
    except ApiError as e:
        c["avisos"].append(f"no se pudo obtener el vecino anonimo del municipio: HTTP {e.status}")

    # Vecinos reales del padron: cuando el reclamo lo carga un empleado, el
    # backend EXIGE saber de quien es (el creador es el vecino, no quien lo
    # tipea). Se rota para que no salgan los diez a nombre de la misma persona.
    padron = [u for u in api.listar("/users", params={"limit": 200})
              if u.get("rol") == "vecino" and u.get("dni") and not u.get("es_anonimo")]
    if not padron:
        c["avisos"].append("no hay vecinos con documento en el padron — los reclamos "
                           "cargados por el municipio no se pueden crear")

    for indice, (caso, esquina) in enumerate(zip(RECLAMOS, esquinas)):
        titulo = f"[DEMO] {caso['titulo']} · {sufijo}"
        situacion = caso["situacion"]

        existente = ya_hoy.get(titulo)
        if existente is not None:
            c["existentes"] += 1
            # Convergencia: si quedo en 'recibido' pero el caso pide mas, se
            # completa ahora. Asi una corrida que fallo a mitad se recupera.
            if existente.get("estado") == "recibido" and situacion not in SOLO_ENTRADA:
                _mover_reclamo(api, existente["id"], caso, c)
            continue

        categoria = _buscar_en(categorias, caso["categoria"], "categoria", c["avisos"])
        if categoria is None:
            continue

        payload = {
            "titulo": titulo,
            "descripcion": f"[DEMO] {caso['descripcion']}",
            "direccion": f"{esquina['a']} y {esquina['b']}",
            "latitud": esquina["lat"],
            "longitud": esquina["lon"],
            "categoria_id": categoria["id"],
        }

        # Quien lo carga define el canal de entrada.
        cliente = api
        if situacion == "recibido_app" and vecino_app is not None:
            cliente = vecino_app  # el vecino lo carga desde la app: es suyo
        elif situacion == "recibido_anonimo":
            if anonimo_id is None:
                c["avisos"].append(f"'{caso['clave']}': sin vecino anonimo, se saltea")
                continue
            cliente = operador or api
            payload["actuando_como_user_id"] = anonimo_id
        else:
            # Ventanilla y circuito interno: lo tipea el municipio, pero el
            # reclamo es de un vecino concreto. Sin esto el backend responde
            # 400, y con razon: un reclamo sin dueno no se puede seguir.
            if not padron:
                c["avisos"].append(f"'{caso['clave']}': sin vecinos en el padron, se saltea")
                continue
            if situacion == "recibido_ventanilla" and operador is not None:
                cliente = operador
            payload["actuando_como_user_id"] = padron[indice % len(padron)]["id"]

        try:
            reclamo = cliente.post("/reclamos", json=payload)
        except ApiError as e:
            c["avisos"].append(f"'{caso['clave']}': no se pudo crear — HTTP {e.status} {e.body[:120]}")
            c["errores"] += 1
            continue

        c["creados"] += 1
        rid = (reclamo or {}).get("id")
        if rid and situacion not in SOLO_ENTRADA:
            _mover_reclamo(api, rid, caso, c)


def _mover_reclamo(api: ApiQA, rid: int, caso: dict, c: dict) -> None:
    """Lleva un reclamo desde 'recibido' hasta la situacion pedida, por la API.

    El reclamo nace en 'recibido' y con dependencia ya asignada (la pone el
    backend segun la categoria), asi que aca solo se avanza. Si una transicion
    falla, se corta la cadena y queda en el ultimo estado REAL alcanzado:
    nunca se simula el que falto.
    """
    situacion = caso["situacion"]
    clave = caso["clave"]

    if situacion == "rechazado":
        _paso(c, clave, "rechazar",
              lambda: api.post(f"/reclamos/{rid}/rechazar", json={
                  "motivo": caso["motivo"],
                  "descripcion": f"[DEMO] {caso['detalle_rechazo']}",
              }))
        return

    if not _paso(c, clave, "iniciar",
                 lambda: api.post(f"/reclamos/{rid}/iniciar",
                                  params={"descripcion": f"[DEMO] {caso['inicio']}"})):
        return

    if caso.get("avance") and not _paso(
            c, clave, "comentar",
            lambda: api.post(f"/reclamos/{rid}/comentario",
                             json={"comentario": f"[DEMO] {caso['avance']}"})):
        return

    if situacion.startswith("finalizado"):
        _paso(c, clave, "resolver",
              lambda: api.post(f"/reclamos/{rid}/resolver",
                               json={"resolucion": f"[DEMO] {caso['resolucion']}"}))


# ---------------------------------------------------------------------------
# Fase 2 — gestiones de tramite del dia
# ---------------------------------------------------------------------------
def _sembrar_solicitudes(api: ApiQA, hoy: date, muni_id: int, c: dict) -> None:
    sufijo = f"{TOKEN_DIA} {hoy.isoformat()}"

    tramites = _indice_por_nombre(api.listar("/tramites"))
    if not tramites:
        c["avisos"].append("el municipio no tiene tramites cargados — no se siembran gestiones")
        return

    # El endpoint devuelve todo el padron: el filtro de rol se hace aca (pasar
    # rol= por query no acota) y se exige documento, porque un tramite sin
    # persona identificada no existe.
    vecinos = [u for u in api.listar("/users", params={"limit": 200})
               if u.get("rol") == "vecino" and u.get("dni") and not u.get("es_anonimo")]
    if not vecinos:
        c["avisos"].append("no hay vecinos con documento para asociar a las gestiones")
        return

    # limit topea en 100 en este endpoint (422 si se pide mas).
    ya_hoy = {s.get("asunto"): s for s in api.listar(
        "/tramites/solicitudes/list", params={"municipio_id": muni_id, "limit": 100})}

    for i, caso in enumerate(SOLICITUDES):
        tramite = _buscar_en(tramites, caso["tramite"], "tramite", c["avisos"])
        if tramite is None:
            continue

        asunto = f"[DEMO] {tramite['nombre']} · {sufijo}"
        destino = caso["estado"]

        existente = ya_hoy.get(asunto)
        if existente is not None:
            c["existentes"] += 1
            # Convergencia: la gestion existe pero quedo en el estado de
            # entrada y el caso pedia mas — se termina ahora.
            if destino and _norm(existente.get("estado")) == "recibido":
                _mover_solicitud(api, existente["id"], tramite["id"], caso, c)
            continue

        try:
            solicitud = api.post(f"/tramites/solicitudes?municipio_id={muni_id}", json={
                "tramite_id": tramite["id"],
                "asunto": asunto,
                "descripcion": f"[DEMO] {caso['detalle']}",
                "actuando_como_user_id": vecinos[i % len(vecinos)]["id"],
            })
        except ApiError as e:
            c["avisos"].append(f"'{caso['clave']}': no se pudo crear — HTTP {e.status} {e.body[:120]}")
            c["errores"] += 1
            continue

        c["creados"] += 1
        sid = (solicitud or {}).get("id")
        if sid and destino:
            _mover_solicitud(api, sid, tramite["id"], caso, c)


def _mover_solicitud(api: ApiQA, sid: int, tramite_id: int, caso: dict, c: dict) -> None:
    """Lleva una gestion desde 'recibido' al estado pedido, por la API real."""
    destino = caso["estado"]
    clave = caso["clave"]

    # Para arrancar hay que haber recibido los papeles: el backend lo exige
    # (400 "faltan verificar documentos obligatorios") y tiene razon.
    if destino in ("en_curso", "finalizado"):
        _verificar_documentos(api, tramite_id, sid, clave, c)
        if not _paso(c, clave, "pasar a en_curso",
                     lambda: api.put(f"/tramites/solicitudes/detalle/{sid}",
                                     json={"estado": "en_curso"})):
            return
        if destino == "en_curso":
            return

    _paso(c, clave, f"pasar a {destino}",
          lambda: api.put(f"/tramites/solicitudes/detalle/{sid}", json={"estado": destino}))


def _verificar_documentos(api: ApiQA, tramite_id: int, sid: int, clave: str, c: dict) -> None:
    """Tilda como recibidos los documentos obligatorios del tramite.

    Es lo que hace el empleado en ventanilla cuando el vecino le entrega los
    papeles en mano y el los ve: verificacion visual, sin archivo digitalizado.
    Circuito real, no un atajo para saltear la validacion.
    """
    try:
        requeridos = api.listar(f"/tramites/{tramite_id}/documentos-requeridos")
    except ApiError as e:
        c["avisos"].append(f"'{clave}': no se pudieron leer los documentos requeridos — HTTP {e.status}")
        return
    for req in requeridos:
        if not req.get("obligatorio"):
            continue
        try:
            api.post(f"/tramites/solicitudes/{sid}/requeridos/{req['id']}/verificar-visual")
        except ApiError as e:
            c["avisos"].append(
                f"'{clave}': no se pudo verificar '{req.get('nombre')}' — HTTP {e.status}")


# ---------------------------------------------------------------------------
# Entrada del modulo
# ---------------------------------------------------------------------------
def sembrar(api: ApiQA, hoy: date) -> dict:
    c = {"creados": 0, "existentes": 0, "errores": 0, "avisos": []}

    muni_id = (api.get("/users/me") or {}).get("municipio_id")
    if not muni_id:
        raise SystemExit(f"{MARCA} el usuario logueado no tiene municipio asignado.")

    print(f"{MARCA} sembrando el dia {hoy.isoformat()} (municipio {muni_id})")
    _sembrar_reclamos(api, hoy, c)
    _sembrar_solicitudes(api, hoy, muni_id, c)

    for aviso in c["avisos"]:
        print(f"{MARCA} AVISO: {aviso}")

    print(f"[dia_vivo] creados={c['creados']} existentes={c['existentes']} errores={c['errores']}")
    return {"creados": c["creados"], "existentes": c["existentes"], "errores": c["errores"]}
