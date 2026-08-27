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
    r = await cli.post(
        "https://api.groq.com/openai/v1/chat/completions",
        headers={"Authorization": f"Bearer {settings.GROQ_API_KEY}"},
        json={
            "model": settings.GROQ_MODEL,
            "messages": mensajes,
            "temperature": 0.6,
            "max_tokens": 700,
        },
    )
    j = r.json()
    if r.status_code != 200:
        detalle = (j.get("error") or {}).get("message") or f"HTTP {r.status_code}"
        raise HTTPException(status_code=502, detail=f"Groq no respondio: {detalle[:200]}")
    return (j["choices"][0]["message"]["content"] or "").strip()


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
