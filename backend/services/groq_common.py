# -*- coding: utf-8 -*-
"""
El UNICO lugar que le pega a Groq, y el que mide cuanto cuesta cada llamada.

Historia de por que existe: el backend tenia SEIS lugares que llamaban a Groq
por su cuenta (clasificacion de reclamos, los tres dashboards, revision, chat,
asignacion de dependencias y el asistente de /calls). El gotcha de gpt-oss se
descubrio el 2026-08-30, se arreglo en DOS de esos lugares y quedo roto en los
otros cuatro — con el sintoma mas silencioso posible: la IA no contesta, no hay
error, y la app cae al fallback sin que nadie se entere.

EL GOTCHA
`openai/gpt-oss-*` razona por default y en Groq ese razonamiento se DESCUENTA
de `max_tokens`. Con un prompt real (40 categorias de reclamos) el modelo se
gasta el presupuesto pensando y devuelve `content` vacio con
`finish_reason="length"`. Medido el 2026-09-01:

| max_tokens | reasoning_effort | content | finish |
|------------|------------------|---------|--------|
| 300        | (sin)            | VACIO   | length |
| 300        | low              | 235 ch  | stop   |

Con `low` el razonamiento baja de 1099 a 210 caracteres. NO hace falta cambiar
de modelo: hace falta el parametro.

LA MEDICION
Cada llamada deja una fila en `ia_uso` (sin prompts ni respuestas: solo el
consumo). Es lo que permite contestar con datos "¿que modelo conviene para
clasificar?" y "¿cuantas veces la IA no sirvio?" en vez de discutirlo de
memoria. El registro NUNCA rompe la llamada: si falla, se loguea y sigue.
"""
import asyncio
import logging
import time
from dataclasses import dataclass
from typing import Optional, Union

import httpx

from core.config import settings

logger = logging.getLogger(__name__)

URL = "https://api.groq.com/openai/v1/chat/completions"

# Piso de tokens para una llamada corta (clasificar, etiquetar, elegir una
# opcion). Con effort bajo una clasificacion real gasta ~150 tokens; menos que
# esto y la respuesta se trunca aunque el razonamiento este acotado.
MIN_TOKENS_RESPUESTA_CORTA = 600


def opciones_modelo(modelo: Optional[str] = None) -> dict:
    """Extras que hay que mandarle a Groq segun el modelo. Hoy: apagarle el
    razonamiento a gpt-oss. Devuelve un dict para hacer `json={..., **esto}`."""
    m = modelo or settings.GROQ_MODEL
    return {"reasoning_effort": "low"} if "gpt-oss" in m else {}


@dataclass
class RespuestaGroq:
    """Lo que devuelve una llamada. `texto` en None significa que no hubo
    respuesta utilizable — el motivo esta en `status` / `vacia` / `detalle`."""

    texto: Optional[str] = None
    status: int = 0
    finish_reason: Optional[str] = None
    vacia: bool = False
    detalle: Optional[str] = None
    uso_id: Optional[int] = None

    @property
    def ok(self) -> bool:
        return bool(self.texto)


async def llamar_groq(
    prompt: Union[str, list],
    *,
    feature: str,
    municipio_id: Optional[int] = None,
    max_tokens: int = 1000,
    temperature: float = 0.2,
    modelo: Optional[str] = None,
    json_object: bool = False,
    timeout: float = 30.0,
) -> RespuestaGroq:
    """Llama a Groq y registra el consumo.

    `feature` es el nombre del camino que llama (clasificar_reclamo,
    dashboard_reclamos, chat, calls_ia...). Es la dimension con la que despues
    se compara consumo y calidad, asi que tiene que ser estable.

    `modelo` sale de la config del municipio y puede traer todavia un modelo de
    Gemini de la epoca anterior: en ese caso se ignora y se usa el de Groq.
    """
    if not settings.GROQ_API_KEY:
        return RespuestaGroq(status=503, detalle="Sin GROQ_API_KEY en el servidor")

    modelo_ok = modelo if (modelo and "gemini" not in modelo.lower()) else settings.GROQ_MODEL
    mensajes = [{"role": "user", "content": prompt}] if isinstance(prompt, str) else prompt

    cuerpo = {
        "model": modelo_ok,
        "messages": mensajes,
        "temperature": temperature,
        "max_tokens": max_tokens,
        **opciones_modelo(modelo_ok),
    }
    if json_object:
        cuerpo["response_format"] = {"type": "json_object"}

    arranque = time.monotonic()
    try:
        async with httpx.AsyncClient(timeout=timeout) as cli:
            r = await cli.post(
                URL,
                headers={
                    "Authorization": f"Bearer {settings.GROQ_API_KEY}",
                    "Content-Type": "application/json",
                },
                json=cuerpo,
            )
    except Exception as e:
        latencia = int((time.monotonic() - arranque) * 1000)
        logger.exception("[Groq] %s: excepcion de red: %s", feature, e)
        resp = RespuestaGroq(status=0, detalle=str(e)[:200])
        await _registrar(resp, feature, municipio_id, modelo_ok, latencia, {}, {})
        return resp

    latencia = int((time.monotonic() - arranque) * 1000)
    limites = {
        "req": _int_o_none(r.headers.get("x-ratelimit-remaining-requests")),
        "tok": _int_o_none(r.headers.get("x-ratelimit-remaining-tokens")),
    }

    try:
        cuerpo_resp = r.json()
    except Exception:
        cuerpo_resp = {}

    if r.status_code != 200:
        detalle = (cuerpo_resp.get("error") or {}).get("message") or f"HTTP {r.status_code}"
        # La key es el punto de falla que mas importa: que el mensaje lo diga.
        if r.status_code in (401, 403):
            detalle = "La key de Groq no es valida o vencio — hay que renovarla en Secret Manager"
        elif r.status_code == 429:
            detalle = "Groq esta limitando por cuota (429) — reintentar en un rato"
        logger.error("[Groq] %s: %s", feature, detalle)
        resp = RespuestaGroq(status=r.status_code, detalle=detalle[:200])
        await _registrar(resp, feature, municipio_id, modelo_ok, latencia, {}, limites)
        return resp

    eleccion = (cuerpo_resp.get("choices") or [{}])[0]
    msg = eleccion.get("message") or {}
    texto = (msg.get("content") or "").strip()
    finish = eleccion.get("finish_reason")

    resp = RespuestaGroq(
        texto=texto or None,
        status=200,
        finish_reason=finish,
        vacia=not texto,
        detalle=None if texto else f"respuesta vacia (finish_reason={finish})",
    )
    if not texto:
        # La firma del gotcha de gpt-oss. Que quede fuerte en el log ademas de
        # en la tabla: es un sintoma que de otra forma no se ve.
        logger.error(
            "[Groq] %s: content VACIO con finish=%s y max_tokens=%s — revisar reasoning",
            feature, finish, max_tokens,
        )
    await _registrar(resp, feature, municipio_id, modelo_ok, latencia,
                     cuerpo_resp.get("usage") or {}, limites)
    return resp


async def marcar_fallback(uso_id: Optional[int]) -> None:
    """El call site resolvio sin IA (matcheo local, template estatico). Mide
    cuantas veces la IA no sirvio para nada sin que el usuario se enterara."""
    if not uso_id:
        return
    try:
        from sqlalchemy import update

        from core.database import AsyncSessionLocal
        from models.ia_uso import IaUso

        async with AsyncSessionLocal() as s:
            await s.execute(update(IaUso).where(IaUso.id == uso_id).values(cayo_a_fallback=True))
            await s.commit()
    except Exception as e:
        logger.warning("[Groq] no se pudo marcar el fallback: %s", e)


def _int_o_none(v):
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


async def _registrar(resp, feature, municipio_id, modelo, latencia, usage, limites):
    """Deja la fila en `ia_uso`. Se traga cualquier error a proposito: la
    telemetria no puede tumbar una funcionalidad del municipio."""
    try:
        from core.database import AsyncSessionLocal
        from models.ia_uso import IaUso

        detalles = usage.get("completion_tokens_details") or {}
        fila = IaUso(
            municipio_id=municipio_id,
            feature=feature[:40],
            modelo=modelo[:60],
            prompt_tokens=usage.get("prompt_tokens") or 0,
            completion_tokens=usage.get("completion_tokens") or 0,
            reasoning_tokens=detalles.get("reasoning_tokens") or 0,
            total_tokens=usage.get("total_tokens") or 0,
            latencia_ms=latencia,
            finish_reason=(resp.finish_reason or None),
            respuesta_vacia=bool(resp.vacia),
            error_http=None if resp.status == 200 else (resp.status or None),
            ratelimit_remaining_requests=limites.get("req"),
            ratelimit_remaining_tokens=limites.get("tok"),
        )
        async with AsyncSessionLocal() as s:
            s.add(fila)
            await s.commit()
            resp.uso_id = fila.id
    except asyncio.CancelledError:
        raise
    except Exception as e:
        logger.warning("[Groq] no se pudo registrar el uso de %s: %s", feature, e)
