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
from fastapi import APIRouter, Depends, HTTPException, Request
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
