"""
Servicio para obtener barrios/localidades de un municipio.
Usa IA (Gemini) para sugerir barrios y Nominatim para validar coordenadas.
"""
import httpx
import asyncio
import json
import re
from typing import List, Dict, Optional
from core.config import settings


async def sugerir_barrios_con_ia(nombre_municipio: str, provincia: str = "Buenos Aires") -> List[str]:
    """
    Usa Groq para sugerir barrios/localidades de un municipio argentino.

    Args:
        nombre_municipio: Nombre del municipio (ej: "Chacabuco")
        provincia: Provincia (default: "Buenos Aires")

    Returns:
        Lista de nombres de barrios/localidades
    """
    if not settings.GROQ_API_KEY:
        print("[BARRIOS] No Groq API key configured")
        return []

    prompt = f"""Lista los 10-15 barrios y localidades principales del partido de {nombre_municipio}, {provincia}, Argentina.
Responde SOLO con un JSON array de strings. Ejemplo: ["Centro", "Norte", "Sur"]"""

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.GROQ_API_KEY}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": "llama-3.3-70b-versatile",
                    "messages": [{"role": "user", "content": prompt}],
                    "max_tokens": 500,
                    "temperature": 0.3
                }
            )

            if response.status_code == 200:
                data = response.json()
                choices = data.get("choices", [])
                if choices:
                    text = choices[0].get("message", {}).get("content", "").strip()
                    # Limpiar markdown code blocks si vienen
                    text = re.sub(r'^```json\s*', '', text)
                    text = re.sub(r'\s*```$', '', text)
                    # Extraer JSON del texto
                    match = re.search(r'\[.*\]', text, re.DOTALL)
                    if match:
                        try:
                            barrios = json.loads(match.group())
                            print(f"[BARRIOS] Groq sugirió {len(barrios)} barrios para {nombre_municipio}")
                            return barrios
                        except json.JSONDecodeError:
                            print(f"[BARRIOS] Error parsing JSON: {text[:200]}")
                            return []
            else:
                print(f"[BARRIOS] Groq error {response.status_code}: {response.text[:200]}")
                return []
    except Exception as e:
        print(f"[BARRIOS] Error llamando a Groq: {e}")
        return []

    return []


async def obtener_coordenadas_nominatim(
    lugar: str,
    municipio: str,
    provincia: str = "Buenos Aires"
) -> Optional[Dict]:
    """
    Obtiene coordenadas de un lugar usando Nominatim (OpenStreetMap).

    Args:
        lugar: Nombre del barrio/localidad
        municipio: Nombre del municipio
        provincia: Provincia

    Returns:
        Dict con lat, lng, display_name o None si no se encuentra
    """
    query = f"{lugar}, {municipio}, {provincia}, Argentina"

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                "https://nominatim.openstreetmap.org/search",
                params={
                    "q": query,
                    "format": "json",
                    "limit": 1,
                    "addressdetails": 1
                },
                headers={
                    "User-Agent": "SugerenciasMun/1.0 (contacto@municipio.gob.ar)"
                }
            )

            if response.status_code == 200:
                data = response.json()
                if data:
                    result = data[0]
                    return {
                        "lat": float(result["lat"]),
                        "lng": float(result["lon"]),
                        "display_name": result.get("display_name", ""),
                        "type": result.get("type", ""),
                        "importance": result.get("importance", 0)
                    }

            return None
    except Exception as e:
        print(f"[NOMINATIM] Error buscando {lugar}: {e}")
        return None


async def buscar_barrios_municipio(
    nombre_municipio: str,
    provincia: str = "Buenos Aires"
) -> List[Dict]:
    """
    Busca barrios de un municipio usando IA + validación con Nominatim.

    Args:
        nombre_municipio: Nombre del municipio
        provincia: Provincia (default: Buenos Aires)

    Returns:
        Lista de dicts con: nombre, lat, lng, validado
    """
    # 1. Obtener sugerencias de la IA
    barrios_sugeridos = await sugerir_barrios_con_ia(nombre_municipio, provincia)

    if not barrios_sugeridos:
        # Fallback: barrios genéricos
        barrios_sugeridos = ["Centro", "Norte", "Sur", "Este", "Oeste"]
        print(f"[BARRIOS] Usando barrios genéricos para {nombre_municipio}")

    # 2. Validar cada barrio con Nominatim (con rate limiting)
    resultados = []

    for barrio in barrios_sugeridos:
        # Rate limit: 1 request por segundo para Nominatim
        await asyncio.sleep(1.0)

        coords = await obtener_coordenadas_nominatim(barrio, nombre_municipio, provincia)

        if coords:
            resultados.append({
                "nombre": barrio,
                "lat": coords["lat"],
                "lng": coords["lng"],
                "display_name": coords["display_name"],
                "validado": True
            })
        else:
            # Barrio sugerido pero sin coordenadas
            resultados.append({
                "nombre": barrio,
                "lat": None,
                "lng": None,
                "display_name": None,
                "validado": False
            })

    # Ordenar: primero los validados
    resultados.sort(key=lambda x: (not x["validado"], x["nombre"]))

    print(f"[BARRIOS] {len([r for r in resultados if r['validado']])} de {len(resultados)} barrios validados para {nombre_municipio}")

    return resultados


async def obtener_centro_municipio(
    nombre_municipio: str,
    provincia: str = "Buenos Aires"
) -> Optional[Dict]:
    """
    Obtiene las coordenadas del centro del municipio.

    Returns:
        Dict con lat, lng, bounds o None
    """
    query = f"{nombre_municipio}, {provincia}, Argentina"

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                "https://nominatim.openstreetmap.org/search",
                params={
                    "q": query,
                    "format": "json",
                    "limit": 1,
                    "polygon_geojson": 0
                },
                headers={
                    "User-Agent": "SugerenciasMun/1.0 (contacto@municipio.gob.ar)"
                }
            )

            if response.status_code == 200:
                data = response.json()
                if data:
                    result = data[0]
                    boundingbox = result.get("boundingbox", [])

                    return {
                        "lat": float(result["lat"]),
                        "lng": float(result["lon"]),
                        "display_name": result.get("display_name", ""),
                        "bounds": {
                            "minLat": float(boundingbox[0]) if len(boundingbox) > 0 else None,
                            "maxLat": float(boundingbox[1]) if len(boundingbox) > 1 else None,
                            "minLng": float(boundingbox[2]) if len(boundingbox) > 2 else None,
                            "maxLng": float(boundingbox[3]) if len(boundingbox) > 3 else None,
                        } if boundingbox else None
                    }

            return None
    except Exception as e:
        print(f"[NOMINATIM] Error buscando municipio {nombre_municipio}: {e}")
        return None
