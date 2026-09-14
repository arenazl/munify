# -*- coding: utf-8 -*-
"""
IA del directorio /calls, del lado del SERVIDOR.

/calls es una pagina publica y ANTES la key de Groq vivia en el navegador de
cada uno (habia que pegarla por browser, o pasarla por ?k=...). El dueño lo
marco como friccion inaceptable (2026-08-28): la key vive aca, como en
cualquier aplicacion, y la pagina le pega a /api same-origin.

Proveedor: Groq y NADA MAS. Habia un fallback a Gemini y el dueño lo saco
(2026-09-01) por dos razones: Gemini no se usa por costo, y un fallback
silencioso hacia que la pagina contestara con OTRO modelo sin que nadie se
enterara (en produccion, que no monta GROQ_API_KEY, /calls venia contestando
con Gemini). Si la key de Groq falta o vencio, el endpoint falla FUERTE y se
renueva la key — es la unica señal honesta.

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
            detail="Sin GROQ_API_KEY en el servidor — /calls no tiene otro proveedor a proposito",
        )

    total = sum(len(m.content) for m in data.mensajes)
    if total > MAX_CHARS_TOTAL:
        raise HTTPException(status_code=413, detail="La consulta es demasiado larga")

    mensajes = [m.model_dump() for m in data.mensajes]
    return {"respuesta": await _groq(mensajes), "proveedor": "groq"}


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
