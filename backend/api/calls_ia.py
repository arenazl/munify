# -*- coding: utf-8 -*-
"""
IA del directorio /calls, del lado del SERVIDOR.

/calls es una pagina publica y ANTES la key de Groq vivia en el navegador de
cada uno (habia que pegarla por browser, o pasarla por ?k=...). El dueño lo
marco como friccion inaceptable (2026-08-28): la key vive aca, como en
cualquier aplicacion, y la pagina le pega a /api same-origin.

Proveedor: el pedido dice cual quiere. `groq` es el default y el asistente de
siempre; `gemini` va solo si se pide; `cascada` prueba Groq y sigue con Gemini.

El 2026-09-01 se habia sacado un fallback a Gemini por dos razones: no se usaba
por costo, y era SILENCIOSO — la pagina contestaba con otro modelo sin que nadie
se enterara. La segunda es la que importaba, y esta cascada no la tiene: la
respuesta trae SIEMPRE quien contesto y por que cayo al siguiente, y el front lo
muestra. El problema nunca fue caer al segundo, fue no saber.

La cascada existe para los tres botones que reescriben un bloque del libreto
(2026-09-15): eso lo lee el vendedor en voz alta a un intendente, ahi la
redaccion pesa mas que el precio, y una llamada no se puede quedar esperando.

Desde el 2026-09-02 EXIGE LOGIN (`Depends(usuario_calls)`). Antes era publico
y contestaba a cualquiera: con un 422 en vez de un 401 se comprobo que se podia
gastar la cuota de Groq de la app desde afuera. El rate limit por IP se queda
igual, como segunda linea.
"""
import httpx
from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from pydantic import BaseModel, Field
from api.calls import CallsUsuario, usuario_calls
from core.config import settings
from core.rate_limit import limiter
from services.groq_common import llamar_groq

router = APIRouter()

MAX_CHARS_TOTAL = 24_000


class MensajeIA(BaseModel):
    role: str = Field(pattern="^(system|user|assistant)$")
    content: str = Field(min_length=1, max_length=9_000)


class ConsultaIA(BaseModel):
    mensajes: list[MensajeIA] = Field(min_length=1, max_length=24)
    # QUE CAMINO TOMAR. `groq` es el asistente de siempre; `cascada` la piden los
    # tres botones que reescriben un bloque del libreto: prueba Groq, y si no
    # puede sigue con Gemini. La respuesta dice SIEMPRE quien contesto.
    proveedor: str = Field(default="groq", pattern="^(groq|gemini|cascada)$")


async def _groq(mensajes: list[dict]) -> str:
    """El asistente de /calls contra Groq. Sin fallback a otro proveedor a
    proposito: si la key fallo, se renueva la key."""
    r = await llamar_groq(
        mensajes,
        feature="calls_ia",
        max_tokens=1500,
        temperature=0.6,
        timeout=45.0,
    )
    if not r.ok:
        # Callarse en silencio es peor que fallar: el front no puede distinguir
        # "no tengo nada que decir" de "me quede sin tokens".
        raise HTTPException(status_code=502, detail=r.detalle or "Groq no respondio")
    return r.texto



# --------------------------------------------------------------------------- #
# GEMINI, EXPLICITO Y SOLO DONDE SE PIDE
# --------------------------------------------------------------------------- #
# El 2026-09-01 se saco Gemini de este endpoint, y por dos razones que siguen
# valiendo: no se usaba por costo, y era un FALLBACK SILENCIOSO -- la pagina
# contestaba con otro modelo sin que nadie se enterara.
#
# Esto es otra cosa (dueno, 2026-09-15). Los tres botones que reescriben un
# bloque del libreto --mas corto, un ejemplo, otra version-- le arman al modelo
# un pedido con la ficha semantica del modulo adentro, y lo que devuelve lo lee
# el vendedor EN VOZ ALTA a un intendente. Ahi la redaccion importa mas que el
# precio, y Groq quedaba flojo: devolvia "che, les pasa que..." y repetia "al
# toque" dos veces en tres textos.
#
# Por eso el proveedor viaja EXPLICITO en el pedido y el default sigue siendo
# Groq: el asistente de /calls no cambia, y nadie contesta con otro modelo sin
# haberlo pedido. Si Gemini falla, falla FUERTE -- no cae a Groq por atras, que
# es exactamente lo que se saco la vez pasada.
MODELO_GEMINI = "gemini-2.5-flash"
URL_GEMINI = ("https://generativelanguage.googleapis.com/v1beta/models/"
              "%s:generateContent?key=%s")


async def _gemini(mensajes: list[dict], key: str = "") -> str:
    """Los mismos mensajes que recibe Groq, aplanados para Gemini.

    `thinkingBudget: 0` porque reescribir un parrafo no necesita razonamiento y
    con el prendido tarda el triple -- y esto se pide en medio de una llamada
    telefonica, donde dos segundos de silencio se notan.
    """
    key = key or settings.GEMINI_API_KEY
    if not key:
        raise HTTPException(
            status_code=503,
            detail="Sin GEMINI_API_KEY en el servidor",
        )
    # Gemini no tiene roles system/user como Groq: se manda todo junto, con el
    # sistema adelante, que es como lo interpreta igual.
    texto = "\n\n".join(m["content"] for m in mensajes)
    cuerpo = {
        "contents": [{"parts": [{"text": texto}]}],
        "generationConfig": {
            "temperature": 0.9,
            "maxOutputTokens": 800,
            "thinkingConfig": {"thinkingBudget": 0},
        },
    }
    async with httpx.AsyncClient(timeout=45.0) as cli:
        try:
            r = await cli.post(
                URL_GEMINI % (MODELO_GEMINI, key),
                json=cuerpo,
            )
        except Exception as e:  # noqa: BLE001
            raise HTTPException(status_code=502, detail="No se pudo llamar a Gemini: %s" % e)
    if r.status_code != 200:
        # 400 API_KEY_INVALID con una key que existe casi siempre es un secreto
        # con `\r\n` pegado (42 bytes en vez de 39), no una key vencida.
        raise HTTPException(status_code=502,
                            detail="Gemini respondio %s: %s" % (r.status_code, r.text[:300]))
    try:
        return r.json()["candidates"][0]["content"]["parts"][0]["text"].strip()
    except (KeyError, IndexError, ValueError):
        raise HTTPException(status_code=502, detail="Gemini contesto vacio")


@router.post("/ia")
@limiter.limit("120/hour")
async def preguntar_ia(
    request: Request,
    data: ConsultaIA,
    _: CallsUsuario = Depends(usuario_calls),
):
    """La conversacion viene armada del front (sistema + ficha + chat); aca
    solo se ejecuta contra Groq. El PROMPT es del front a proposito: la ficha
    del municipio vive alla y este endpoint no conoce el dominio de /calls."""
    if not settings.GROQ_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="Sin GROQ_API_KEY en el servidor",
        )

    total = sum(len(m.content) for m in data.mensajes)
    if total > MAX_CHARS_TOTAL:
        raise HTTPException(status_code=413, detail="La consulta es demasiado larga")

    mensajes = [{"role": m.role, "content": m.content} for m in data.mensajes]

    if data.proveedor == "gemini":
        return {"respuesta": await _gemini(mensajes), "proveedor": "gemini"}
    if data.proveedor != "cascada":
        return {"respuesta": await _groq(mensajes), "proveedor": "groq"}

    # LA CASCADA, DE GRATIS A CARO, Y VISIBLE
    # ---------------------------------------
    # Groq da 200.000 tokens por dia sin costo, asi que va primero. Cuando se
    # acaba el cupo --o la key vencio-- sigue Gemini.
    #
    # SON DOS ESCALONES Y NO TRES, y conviene saber por que: "Gemini gratis" y
    # "Gemini pago" no son dos keys. Gemini usa el cupo gratis de la MISMA key y,
    # si esa key tiene facturacion activada, sigue cobrando sola. O sea que el
    # tercer escalon ya esta adentro del segundo.
    #
    # (Y hay tres keys de Groq en el .env local --GROQ_API_KEY, _2 y _3-- que
    # multiplicarian por tres el cupo gratis. El backend mira solo la primera:
    # rotarlas es otro cambio, en `services/groq_common.py`.)
    #
    # ESTO NO ES EL FALLBACK QUE SE SACO EL 2026-09-01. Aquel era silencioso: la
    # pagina contestaba con otro modelo y nadie se enteraba. Este devuelve SIEMPRE
    # quien contesto y por que cayo al siguiente, y el front lo muestra. Un
    # fallback que se ve no es el mismo problema: el problema era no saber.
    intentos: list[str] = []
    for nombre, fn in (("groq", _groq), ("gemini", _gemini)):
        try:
            texto = await fn(mensajes)
        except HTTPException as e:
            intentos.append("%s: %s" % (nombre, str(e.detail)[:120]))
            continue
        except Exception as e:  # noqa: BLE001
            intentos.append("%s: %s" % (nombre, str(e)[:120]))
            continue
        return {"respuesta": texto, "proveedor": nombre, "intentos": intentos}
    # Si los tres fallaron se dice cual fallo y por que: callarse es peor.
    raise HTTPException(status_code=502,
                        detail="Ningun proveedor contesto. " + " | ".join(intentos))


# --------------------------------------------------------------------------- #
# DICTAR EN VEZ DE ESCRIBIR
# --------------------------------------------------------------------------- #
# El vendedor esta hablando por telefono: escribir con una mano mientras habla no
# pasa. Dicta y listo.
#
# Whisper en Groq, con la MISMA key que ya usa el asistente: no hay una cuenta
# nueva ni un secreto nuevo que cargar. `whisper-large-v3-turbo` es el barato y
# suficiente para dictar una nota de dos frases.
#
# `language=es` NO ES OPCIONAL: sin eso, un audio corto en rioplatense se
# detectaba a veces como portugues o italiano y volvia traducido.
MODELO_VOZ = "whisper-large-v3-turbo"
URL_VOZ = "https://api.groq.com/openai/v1/audio/transcriptions"

# 25 MB es el techo de Groq. Acá el corte es MUY anterior a proposito: son notas
# habladas de segundos, no reuniones. Un archivo grande es un error de la pagina
# --o alguien probando-- y conviene que falle rapido y barato.
MAX_AUDIO = 8 * 1024 * 1024
SEG_MAX = 180


@router.post("/ia/dictado")
@limiter.limit("60/hour")
async def dictado(
    request: Request,
    audio: UploadFile = File(...),
    _quien: CallsUsuario = Depends(usuario_calls),
):
    """Convierte un audio corto en texto. Devuelve `{texto}` y nada mas.

    No interpreta, no resume y no contesta: transcribe. Lo que el vendedor dicto es
    lo que queda en el campo, para que lo lea y lo corrija antes de guardarlo --
    una nota de campo no puede pasar por un modelo que la reescriba.
    """
    if not settings.GROQ_API_KEY:
        raise HTTPException(status_code=503, detail="Sin GROQ_API_KEY en el servidor")

    datos = await audio.read()
    if not datos:
        raise HTTPException(status_code=400, detail="El audio llego vacio")
    if len(datos) > MAX_AUDIO:
        raise HTTPException(
            status_code=413,
            detail="El audio es muy largo: son notas de segundos, no grabaciones")

    # el nombre importa: Groq deduce el formato por la extension, y el navegador
    # graba en webm/ogg segun el telefono
    nombre = (audio.filename or "nota.webm")[:60]
    tipo = audio.content_type or "audio/webm"

    async with httpx.AsyncClient(timeout=60.0) as cli:
        try:
            r = await cli.post(
                URL_VOZ,
                headers={"Authorization": f"Bearer {settings.GROQ_API_KEY}"},
                files={"file": (nombre, datos, tipo)},
                data={"model": MODELO_VOZ, "language": "es",
                      "response_format": "json", "temperature": "0"},
            )
        except httpx.HTTPError as e:
            raise HTTPException(status_code=502, detail=f"No se pudo transcribir: {e}")

    if r.status_code != 200:
        detalle = ""
        try:
            detalle = (r.json().get("error") or {}).get("message") or ""
        except Exception:  # noqa: BLE001
            detalle = r.text[:160]
        if r.status_code == 429:
            # el mismo criterio que el resto: los dos 429 de Groq no son lo mismo
            hay_dia = "per day" in detalle or "TPD" in detalle
            raise HTTPException(
                status_code=429,
                detail=("Se acabo la cuota diaria de Groq: no se repone hasta manana"
                        if hay_dia else "Groq esta limitando por minuto, probá de nuevo"))
        raise HTTPException(status_code=502, detail=detalle or f"HTTP {r.status_code}")

    texto = (r.json().get("text") or "").strip()
    if not texto:
        raise HTTPException(status_code=502, detail="No se entendio nada del audio")
    return {"texto": texto, "segundos": None}
