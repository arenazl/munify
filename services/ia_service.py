"""
Servicio de IA usando Ollama para responder preguntas sobre categorías de reclamos.
"""
import httpx
from core.config import settings


async def consultar_ia_categoria(categoria_nombre: str, pregunta: str) -> str:
    """
    Consulta a Ollama sobre una categoría de reclamos municipales.

    Args:
        categoria_nombre: Nombre de la categoría (ej: "Alumbrado Público")
        pregunta: Pregunta del usuario

    Returns:
        Respuesta de la IA
    """
    prompt = f"""Sos un asistente virtual de la Municipalidad que ayuda a los ciudadanos a realizar reclamos.

El usuario está creando un reclamo en la categoría: "{categoria_nombre}"

El usuario pregunta: "{pregunta}"

Respondé de forma breve y útil (máximo 2-3 oraciones). Si la pregunta no está relacionada con reclamos municipales,
indicá amablemente que solo podés ayudar con temas relacionados a reclamos de la ciudad.

Respuesta:"""

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{settings.OLLAMA_URL}/api/generate",
                json={
                    "model": settings.OLLAMA_MODEL,
                    "prompt": prompt,
                    "stream": False,
                    "options": {
                        "temperature": 0.7,
                        "num_predict": 150
                    }
                }
            )

            if response.status_code == 200:
                data = response.json()
                return data.get("response", "No pude procesar tu pregunta. Intentá de nuevo.")
            else:
                return "El servicio de IA no está disponible en este momento."

    except httpx.TimeoutException:
        return "La consulta tardó demasiado. Intentá con una pregunta más simple."
    except Exception as e:
        print(f"Error al consultar Ollama: {e}")
        return "No pude conectar con el asistente. Intentá más tarde."


async def obtener_info_categoria(categoria_nombre: str) -> dict:
    """
    Genera información sobre una categoría usando IA.

    Args:
        categoria_nombre: Nombre de la categoría

    Returns:
        Dict con ejemplos y tip
    """
    prompt = f"""Sos un asistente de la Municipalidad. Para la categoría de reclamos "{categoria_nombre}":

1. Dame 4 ejemplos concretos de reclamos que los ciudadanos pueden hacer en esta categoría.
2. Dame un tip útil para el ciudadano al hacer este tipo de reclamo.

Formato de respuesta (respetá exactamente este formato):
EJEMPLOS:
- ejemplo1
- ejemplo2
- ejemplo3
- ejemplo4
TIP: tip útil aquí"""

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{settings.OLLAMA_URL}/api/generate",
                json={
                    "model": settings.OLLAMA_MODEL,
                    "prompt": prompt,
                    "stream": False,
                    "options": {
                        "temperature": 0.5,
                        "num_predict": 300
                    }
                }
            )

            if response.status_code == 200:
                data = response.json()
                texto = data.get("response", "")

                # Parsear respuesta
                ejemplos = []
                tip = ""

                lines = texto.strip().split("\n")
                parsing_ejemplos = False

                for line in lines:
                    line = line.strip()
                    if line.startswith("EJEMPLOS:"):
                        parsing_ejemplos = True
                        continue
                    if line.startswith("TIP:"):
                        parsing_ejemplos = False
                        tip = line.replace("TIP:", "").strip()
                        continue
                    if parsing_ejemplos and line.startswith("-"):
                        ejemplos.append(line[1:].strip())

                return {
                    "ejemplos": ejemplos[:4] if ejemplos else ["Sin ejemplos disponibles"],
                    "tip": tip if tip else "Describí el problema con el mayor detalle posible"
                }

    except Exception as e:
        print(f"Error al obtener info de categoría: {e}")

    return {
        "ejemplos": ["Sin ejemplos disponibles"],
        "tip": "Describí el problema con el mayor detalle posible"
    }
