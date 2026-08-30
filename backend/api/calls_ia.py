# -*- coding: utf-8 -*-
"""
IA del directorio /calls, del lado del SERVIDOR.

/calls es una pagina publica y ANTES la key de Groq vivia en el navegador de
cada uno (habia que pegarla por browser, o pasarla por ?k=...). El dueño lo
marco como friccion inaceptable (2026-08-28): la key vive aca, como en
cualquier aplicacion, y la pagina le pega a /api same-origin.

Proveedor: Groq si hay GROQ_API_KEY (el chat de /calls nacio con Groq);
si no, Gemini (que QA ya tiene configurado en Cloud Run) — mismo espiritu
que AI_PROVIDER_ORDER. Sin ninguno, 503 honesto.

Es un endpoint PUBLICO (la pagina no tiene login): va con rate limit por IP
y topes de tamaño para que no sirva de proxy gratis a terceros.
"""
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
import httpx

from core.config import settings
from core.rate_limit import limiter

router = APIRouter()

MAX_CHARS_TOTAL = 24_000


class MensajeIA(BaseModel):
    role: str = Field(pattern="^(system|user|assistant)$")
    content: str = Field(min_length=1, max_length=9_000)


class ConsultaIA(BaseModel):
    mensajes: list[MensajeIA] = Field(min_length=1, max_length=24)


async def _groq(cli: httpx.AsyncClient, mensajes: list[dict]) -> str:
    cuerpo: dict = {
        "model": settings.GROQ_MODEL,
        "messages": mensajes,
        "temperature": 0.6,
        # 700 alcanzaba justo para el razonamiento y NADA para la respuesta.
        "max_tokens": 1500,
    }
    # GOTCHA (2026-08-30): gpt-oss RAZONA por default, y en Groq el reasoning
    # se descuenta de max_tokens. Con un prompt largo (la ficha del municipio
    # + los hechos de un modulo) se gastaba los 700 tokens pensando y devolvia
    # `content` VACIO con finish_reason=length: el chat quedaba mudo y los
    # guiones de /calls en blanco. Medido: 698 de 700 tokens en reasoning.
    # Con effort bajo, 9 tokens de razonamiento y la respuesta completa.
    if "gpt-oss" in settings.GROQ_MODEL:
        cuerpo["reasoning_effort"] = "low"
    r = await cli.post(
        "https://api.groq.com/openai/v1/chat/completions",
        headers={"Authorization": f"Bearer {settings.GROQ_API_KEY}"},
        json=cuerpo,
    )
    j = r.json()
    if r.status_code != 200:
        detalle = (j.get("error") or {}).get("message") or f"HTTP {r.status_code}"
        raise HTTPException(status_code=502, detail=f"Groq no respondio: {detalle[:200]}")
    eleccion = j["choices"][0]
    texto = (eleccion["message"].get("content") or "").strip()
    if not texto:
        # Callarse en silencio es peor que fallar: el front no puede distinguir
        # "no tengo nada que decir" de "me quede sin tokens".
        raise HTTPException(
            status_code=502,
            detail=f"Groq devolvio una respuesta vacia (finish_reason={eleccion.get('finish_reason')})",
        )
    return texto


async def _gemini(cli: httpx.AsyncClient, mensajes: list[dict]) -> str:
    sistema = "\n\n".join(m["content"] for m in mensajes if m["role"] == "system")
    contents = [
        {"role": "user" if m["role"] == "user" else "model",
         "parts": [{"text": m["content"]}]}
        for m in mensajes if m["role"] != "system"
    ]
    gen: dict = {"temperature": 0.6, "maxOutputTokens": 700}
    # GOTCHA conocido del proyecto: los Gemini 2.5 razonan por default y hay
    # que apagarlo; los 1.5 no aceptan el campo (400).
    if "2.5" in settings.GEMINI_MODEL:
        gen["thinkingConfig"] = {"thinkingBudget": 0}
    r = await cli.post(
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{settings.GEMINI_MODEL}:generateContent?key={settings.GEMINI_API_KEY}",
        json={
            "system_instruction": {"parts": [{"text": sistema}]},
            "contents": contents,
            "generationConfig": gen,
        },
    )
    j = r.json()
    if r.status_code != 200:
        detalle = (j.get("error") or {}).get("message") or f"HTTP {r.status_code}"
        raise HTTPException(status_code=502, detail=f"Gemini no respondio: {detalle[:200]}")
    try:
        return (j["candidates"][0]["content"]["parts"][0]["text"] or "").strip()
    except (KeyError, IndexError):
        raise HTTPException(status_code=502, detail="Gemini devolvio una respuesta vacia")


@router.post("/ia")
@limiter.limit("40/hour")
async def preguntar_ia(request: Request, data: ConsultaIA):
    """La conversacion viene armada del front (sistema + ficha + chat); aca
    solo se ejecuta contra el proveedor que tenga key. El PROMPT es del
    front a proposito: la ficha del municipio vive alla y este endpoint no
    conoce el dominio de /calls."""
    total = sum(len(m.content) for m in data.mensajes)
    if total > MAX_CHARS_TOTAL:
        raise HTTPException(status_code=413, detail="La consulta es demasiado larga")

    mensajes = [m.model_dump() for m in data.mensajes]
    async with httpx.AsyncClient(timeout=45.0) as cli:
        if settings.GROQ_API_KEY:
            return {"respuesta": await _groq(cli, mensajes), "proveedor": "groq"}
        if settings.GEMINI_API_KEY:
            return {"respuesta": await _gemini(cli, mensajes), "proveedor": "gemini"}
    raise HTTPException(status_code=503, detail="Sin proveedor de IA configurado en el servidor")
