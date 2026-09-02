# -*- coding: utf-8 -*-
"""
Lo que TODA llamada a Groq de esta app tiene que saber, en un solo lugar.

Historia de por que existe este archivo: el backend tiene cinco lugares que le
pegan a Groq por su cuenta (clasificacion de reclamos, dashboard, revision,
chat, asignacion de dependencias, y el asistente de /calls). El gotcha de
gpt-oss se descubrio el 2026-08-30, se arreglo en DOS de esos lugares y quedo
roto en los otros tres — con el sintoma mas silencioso posible: la IA no
contesta y no hay ningun error.

EL GOTCHA
`openai/gpt-oss-*` razona por default y en Groq ese razonamiento se DESCUENTA
de `max_tokens`. Con un prompt real (la ficha de un municipio, o 40 categorias
de reclamos) el modelo se gasta el presupuesto pensando y devuelve `content`
vacio con `finish_reason="length"`: sin excepcion, sin log, sin nada.

Medido el 2026-09-01 con un reclamo real y 40 categorias:

| max_tokens | reasoning_effort | content | finish |
|------------|------------------|---------|--------|
| 300        | (sin)            | VACIO   | length |
| 300        | low              | 235 ch  | stop   |
| 150        | low              | 233 ch  | length |

Con `low` el razonamiento baja de 1099 a 210 caracteres y la respuesta entra
comoda. Por eso NO hace falta cambiar de modelo: hace falta este parametro.
"""
from core.config import settings

# Piso de tokens para una llamada corta (clasificar, etiquetar, elegir una
# opcion). Con effort bajo, una clasificacion real gasta ~150 tokens; menos que
# esto y la respuesta se trunca aunque el razonamiento este acotado.
MIN_TOKENS_RESPUESTA_CORTA = 600


def opciones_modelo(modelo: str | None = None) -> dict:
    """Extras que hay que mandarle a Groq segun el modelo. Hoy: apagarle el
    razonamiento a gpt-oss. Devuelve un dict para hacer `json={..., **esto}`."""
    m = modelo or settings.GROQ_MODEL
    return {"reasoning_effort": "low"} if "gpt-oss" in m else {}
