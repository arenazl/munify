"""Curador de padron municipal.

Toma un JSON con el padron tal como lo exporta el sistema tributario del muni
(formato libre, con nombres locales) y lo mapea al formato canonico de Munify
(TipoTasa.codigo del catalogo global).

Estrategia:
  1. Fetch de la URL (con timeout y validacion de content-type).
  2. Parse del JSON tolerante al formato: buscamos un array `tasas` con items
     que tengan `codigo_local` / `nombre_local` / `partidas`.
  3. Fuzzy match de cada tasa local contra TipoTasa del catalogo, usando
     keywords ponderadas (ABL, seguridad-higiene, patente, etc). Devolvemos
     el mejor match + score de confianza (0-100).
  4. Retornamos un preview con los mappings sugeridos. El admin los revisa,
     edita si algo no matchea, y luego confirma para importar las partidas.

No hace import directo — solo preview. La confirmacion es un endpoint aparte
que toma el mapping ya curado y crea las Partidas/Deudas en la DB.
"""
from __future__ import annotations
import re
from dataclasses import dataclass, field
from typing import Optional
import httpx


# Keywords ponderadas — cada TipoTasa.codigo tiene una lista de terminos
# que, si aparecen en el codigo_local o nombre_local, suman al score.
# El termino mas especifico vale mas (ej. "tsum" vale 100 porque solo se
# usa para ABL, mientras que "municipal" vale 5 porque es generico).
KEYWORDS_POR_TIPO: dict[str, list[tuple[str, int]]] = {
    "abl": [
        ("tsum", 100),
        ("abl", 100),
        ("alumbrado", 80),
        ("barrido", 80),
        ("limpieza", 50),
        ("servicios urbanos", 70),
        ("servicios municipales", 30),
        ("frentista", 60),
        ("tasa municipal", 20),
    ],
    "seguridad_higiene": [
        ("seguridad e higiene", 100),
        ("seguridad higiene", 100),
        ("insp-com", 100),
        ("inspeccion comercial", 90),
        ("inspección comercial", 90),
        ("derecho de inspeccion", 80),
        ("derecho de inspección", 80),
        ("contralor comercial", 70),
        ("contralor comercios", 70),
        ("salubridad", 50),
        ("habilitados", 20),
    ],
    "patente_automotor": [
        ("patente automotor", 100),
        ("pat-aut", 100),
        ("automotor", 80),
        ("automotores", 80),
        ("patente", 60),
        ("vehiculo", 40),
        ("vehículo", 40),
        ("dominio", 50),
        ("impuesto a los automotores", 100),
    ],
    "multa_transito": [
        ("multa de transito", 100),
        ("multa de tránsito", 100),
        ("multas de transito", 100),
        ("multas de tránsito", 100),
        ("infraccion transito", 90),
        ("infracción tránsito", 90),
        ("acta transito", 80),
        ("acta tránsito", 80),
        ("codigo de faltas", 40),
    ],
    "cementerio": [
        ("cementerio", 100),
        ("cem-", 90),
        ("sepultura", 80),
        ("nicho", 70),
        ("parcela", 40),
        ("boveda", 60),
        ("bóveda", 60),
    ],
    "publicidad_propaganda": [
        ("publicidad", 90),
        ("propaganda", 90),
        ("publicidad y propaganda", 100),
        ("cartel", 60),
        ("cartelería", 70),
        ("carteleria", 70),
        ("pantalla publicitaria", 80),
    ],
    "ocupacion_espacio_publico": [
        ("ocupacion del espacio", 100),
        ("ocupación del espacio", 100),
        ("ocupacion via publica", 90),
        ("ocupación vía pública", 90),
        ("ocup-vp", 100),
        ("mesas en vereda", 80),
        ("kiosco", 50),
        ("vereda", 30),
        ("espacio publico", 70),
        ("espacio público", 70),
    ],
    "habilitacion_comercial": [
        ("habilitacion comercial", 100),
        ("habilitación comercial", 100),
        ("habilitacion comercio", 90),
        ("habilitación comercio", 90),
        ("derecho de habilitacion", 85),
        ("derecho de habilitación", 85),
        ("inicio de actividades", 50),
    ],
    "construccion": [
        ("derechos de construccion", 100),
        ("derechos de construcción", 100),
        ("construccion", 70),
        ("construcción", 70),
        ("permiso de obra", 90),
        ("obra nueva", 60),
        ("demolicion", 60),
        ("demolición", 60),
    ],
    "oficina": [
        ("derechos de oficina", 100),
        ("sellado", 70),
        ("certificado", 40),
        ("constancia", 30),
        ("expediente", 30),
        ("actos administrativos", 50),
    ],
    "servicios_sanitarios": [
        ("servicios sanitarios", 100),
        ("agua corriente", 80),
        ("cloacas", 80),
        ("saneamiento", 60),
    ],
    "red_vial": [
        ("red vial", 100),
        ("conservacion caminos", 80),
        ("conservación caminos", 80),
        ("caminos rurales", 70),
    ],
    "antenas": [
        ("antena", 90),
        ("antenas", 100),
        ("telecomunicaciones", 50),
        ("estructura soporte", 80),
    ],
    "abasto": [
        ("abasto", 100),
        ("mercado", 40),
        ("feria municipal", 60),
    ],
    "marcas_senales": [
        ("marcas", 60),
        ("senales", 60),
        ("señales", 60),
        ("ganado", 70),
        ("hacienda", 70),
        ("marcas y senales", 100),
        ("marcas y señales", 100),
    ],
    "canteras": [
        ("cantera", 90),
        ("canteras", 100),
        ("extraccion mineral", 70),
        ("extracción mineral", 70),
    ],
    "servicios_especiales_limpieza": [
        ("servicios especiales", 80),
        ("retiro de residuos", 80),
        ("escombros", 70),
        ("desmalezamiento", 70),
        ("poda a solicitud", 80),
    ],
    "rodados": [
        ("patente de rodados", 100),
        ("rodados", 70),
        ("bicicleta", 60),
    ],
    "multa_faltas": [
        ("multa de faltas", 100),
        ("multas de faltas", 100),
        ("faltas municipales", 90),
        ("faltas contravencionales", 80),
        ("ordenanzas", 30),
    ],
    "inscripcion_profesionales": [
        ("inscripcion de profesionales", 100),
        ("inscripción de profesionales", 100),
        ("martilleros", 70),
        ("profesionales", 50),
    ],
}


# Nivel minimo de score para considerar un match "confiable". Debajo de eso
# mostramos "sin match sugerido — asignar manualmente" al admin.
SCORE_UMBRAL_SUGERENCIA = 30


def _normalizar(texto: Optional[str]) -> str:
    """Minusculas + quita espacios extra. Mantiene tildes para matcheo exacto;
    las keywords estan ambas con y sin tilde."""
    if not texto:
        return ""
    t = texto.lower().strip()
    t = re.sub(r"\s+", " ", t)
    return t


def _calcular_score(texto_normalizado: str, keywords: list[tuple[str, int]]) -> int:
    """Suma el peso de cada keyword que aparece (substring match)."""
    score = 0
    for kw, peso in keywords:
        if kw in texto_normalizado:
            score += peso
    return min(score, 100)


@dataclass
class MatchSugerido:
    tipo_tasa_codigo: Optional[str]  # codigo canonico de Munify (None = sin match)
    tipo_tasa_nombre: Optional[str]
    score: int  # 0-100, confianza del match
    ranking: list[dict] = field(default_factory=list)  # top 3 alternativas


def sugerir_match(
    codigo_local: str,
    nombre_local: str,
    descripcion_local: str,
    tipos_tasa_db: list,  # list[TipoTasa]
) -> MatchSugerido:
    """Para un tipo de tasa del padron, devuelve el mejor match en el catalogo."""
    texto = " ".join([
        _normalizar(codigo_local),
        _normalizar(nombre_local),
        _normalizar(descripcion_local),
    ])

    scores = []
    for codigo, keywords in KEYWORDS_POR_TIPO.items():
        score = _calcular_score(texto, keywords)
        if score > 0:
            # buscar el nombre canonico
            nombre_canonico = next(
                (t.nombre for t in tipos_tasa_db if t.codigo == codigo),
                codigo,
            )
            scores.append({
                "tipo_tasa_codigo": codigo,
                "tipo_tasa_nombre": nombre_canonico,
                "score": score,
            })

    scores.sort(key=lambda x: x["score"], reverse=True)

    if not scores or scores[0]["score"] < SCORE_UMBRAL_SUGERENCIA:
        return MatchSugerido(
            tipo_tasa_codigo=None,
            tipo_tasa_nombre=None,
            score=scores[0]["score"] if scores else 0,
            ranking=scores[:3],
        )

    top = scores[0]
    return MatchSugerido(
        tipo_tasa_codigo=top["tipo_tasa_codigo"],
        tipo_tasa_nombre=top["tipo_tasa_nombre"],
        score=top["score"],
        ranking=scores[:3],
    )


# ============================================================
# Fetch de la URL + parse
# ============================================================

class PadronInvalido(Exception):
    """El JSON descargado no tiene la estructura esperada."""


async def fetch_padron(url: str, timeout: float = 15.0) -> dict:
    """GET a la URL y parsea JSON. Valida estructura minima."""
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        try:
            r = await client.get(url)
        except httpx.HTTPError as e:
            raise PadronInvalido(f"No pudimos conectar con la URL: {e}")

    if r.status_code >= 400:
        raise PadronInvalido(f"La URL respondio con status {r.status_code}. Revisá que sea correcta y accesible.")

    try:
        data = r.json()
    except Exception:
        raise PadronInvalido("La URL no devolvio un JSON valido. Revisá el endpoint.")

    if not isinstance(data, dict):
        raise PadronInvalido("El JSON tiene que ser un objeto con campo 'tasas'.")
    if "tasas" not in data or not isinstance(data["tasas"], list):
        raise PadronInvalido("Falta el array 'tasas' en el JSON. Revisá el formato.")

    return data


def analizar_padron(padron: dict, tipos_tasa_db: list) -> dict:
    """Genera el preview: por cada tasa del padron, sugiere un match y cuenta partidas/deudas."""
    resultado = {
        "municipio_origen": padron.get("municipio"),
        "sistema_origen": padron.get("sistema_origen"),
        "exported_at": padron.get("exported_at"),
        "tasas_detectadas": [],
        "totales": {
            "tipos_tasa": 0,
            "partidas": 0,
            "deudas": 0,
            "matcheados_auto": 0,
            "sin_match": 0,
        },
    }

    for tasa in padron.get("tasas", []):
        codigo_local = tasa.get("codigo_local") or tasa.get("codigo") or ""
        nombre_local = tasa.get("nombre_local") or tasa.get("nombre") or ""
        descripcion = tasa.get("descripcion_local") or tasa.get("descripcion") or ""
        partidas = tasa.get("partidas") or []

        match = sugerir_match(codigo_local, nombre_local, descripcion, tipos_tasa_db)

        total_deudas = sum(len(p.get("deudas") or []) for p in partidas)

        resultado["tasas_detectadas"].append({
            "codigo_local": codigo_local,
            "nombre_local": nombre_local,
            "descripcion_local": descripcion,
            "frecuencia": tasa.get("frecuencia"),
            "partidas_count": len(partidas),
            "deudas_count": total_deudas,
            "match_sugerido": match.tipo_tasa_codigo,
            "match_sugerido_nombre": match.tipo_tasa_nombre,
            "confianza": match.score,
            "alternativas": match.ranking,
            # Sample de la primera partida para que el admin vea como viene el objeto.
            "sample_partida": partidas[0] if partidas else None,
        })

        resultado["totales"]["tipos_tasa"] += 1
        resultado["totales"]["partidas"] += len(partidas)
        resultado["totales"]["deudas"] += total_deudas
        if match.tipo_tasa_codigo:
            resultado["totales"]["matcheados_auto"] += 1
        else:
            resultado["totales"]["sin_match"] += 1

    return resultado
