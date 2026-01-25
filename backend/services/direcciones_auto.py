"""
Servicio para generar direcciones/departamentos automáticamente con IA.
Asocia tipos de trámites a cada dirección.
"""
import httpx
import json
import re
from typing import List, Dict
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text
from core.config import settings
from models.direccion import Direccion

# Mapeo de palabras clave para asociar tipos de trámites a direcciones
TRAMITE_KEYWORDS = {
    "obras": ["Obras Privadas", "Catastro", "Catastro y Planos"],
    "servicios": ["Certificados y Constancias"],
    "tránsito": ["Licencias de Conducir", "Automotor"],
    "transito": ["Licencias de Conducir", "Automotor"],
    "comercio": ["Habilitaciones Comerciales", "Comercio e Industria"],
    "habilitaciones": ["Habilitaciones Comerciales", "Comercio e Industria"],
    "ambiente": ["Medio Ambiente"],
    "social": ["Exenciones y Beneficios"],
    "desarrollo": ["Exenciones y Beneficios"],
    "cultura": ["Certificados y Constancias"],
    "educación": ["Certificados y Constancias"],
    "catastro": ["Catastro", "Catastro y Planos"],
}


async def sugerir_direcciones_con_ia(nombre_municipio: str) -> List[Dict]:
    """
    Usa Groq para sugerir 6 direcciones/departamentos típicos de un municipio.

    Returns:
        Lista de dicts con: nombre, descripcion, tipo_gestion
    """
    if not settings.GROQ_API_KEY:
        print("[DIRECCIONES] No Groq API key configured")
        return []

    prompt = f"""Para el municipio de {nombre_municipio}, Argentina, sugiere 6 direcciones/departamentos municipales típicos.

Responde SOLO con un JSON array. Cada elemento debe tener:
- nombre: nombre del departamento (ej: "Dirección de Obras Públicas")
- descripcion: breve descripción de sus funciones
- tipo_gestion: "reclamos", "tramites" o "ambos" (qué tipo de gestiones maneja)

Ejemplo:
[
  {{"nombre": "Dirección de Obras Públicas", "descripcion": "Gestión de obras viales y edilicias", "tipo_gestion": "reclamos"}},
  {{"nombre": "Dirección de Servicios Públicos", "descripcion": "Alumbrado y espacios verdes", "tipo_gestion": "ambos"}}
]"""

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
                    "max_tokens": 1000,
                    "temperature": 0.3
                }
            )

            if response.status_code == 200:
                data = response.json()
                choices = data.get("choices", [])
                if choices:
                    text = choices[0].get("message", {}).get("content", "").strip()
                    # Limpiar markdown
                    text = re.sub(r'^```json\s*', '', text)
                    text = re.sub(r'\s*```$', '', text)
                    # Extraer JSON
                    match = re.search(r'\[.*\]', text, re.DOTALL)
                    if match:
                        try:
                            direcciones = json.loads(match.group())
                            print(f"[DIRECCIONES] Groq sugirió {len(direcciones)} direcciones para {nombre_municipio}")
                            return direcciones
                        except json.JSONDecodeError:
                            print(f"[DIRECCIONES] Error parsing JSON: {text[:200]}")
                            return []
            else:
                print(f"[DIRECCIONES] Groq error {response.status_code}: {response.text[:200]}")
                return []
    except Exception as e:
        print(f"[DIRECCIONES] Error llamando a Groq: {e}")
        return []

    return []


async def cargar_direcciones_municipio(
    db: AsyncSession,
    municipio_id: int,
    nombre_municipio: str
) -> int:
    """
    Carga automáticamente 6 direcciones para un municipio usando IA.

    Returns:
        Cantidad de direcciones creadas
    """
    print(f"[DIRECCIONES_AUTO] Generando direcciones para {nombre_municipio}...")

    # Obtener sugerencias de la IA
    direcciones_sugeridas = await sugerir_direcciones_con_ia(nombre_municipio)

    if not direcciones_sugeridas:
        print(f"[DIRECCIONES_AUTO] IA no devolvió direcciones, usando genéricas")
        direcciones_sugeridas = [
            {"nombre": "Dirección de Obras Públicas", "descripcion": "Gestión de obras viales y edilicias municipales", "tipo_gestion": "reclamos"},
            {"nombre": "Dirección de Servicios Públicos", "descripcion": "Alumbrado, limpieza y espacios verdes", "tipo_gestion": "ambos"},
            {"nombre": "Dirección de Tránsito", "descripcion": "Control vehicular y señalización", "tipo_gestion": "tramites"},
            {"nombre": "Dirección de Medio Ambiente", "descripcion": "Gestión ambiental y espacios verdes", "tipo_gestion": "reclamos"},
            {"nombre": "Dirección de Desarrollo Social", "descripcion": "Asistencia social y programas comunitarios", "tipo_gestion": "ambos"},
            {"nombre": "Dirección de Cultura y Educación", "descripcion": "Actividades culturales y educativas", "tipo_gestion": "tramites"},
        ]

    direcciones_creadas = 0
    for i, dir_data in enumerate(direcciones_sugeridas[:6]):  # Máximo 6
        # Generar código desde el nombre
        codigo = dir_data["nombre"].upper()[:10].replace(" ", "_")

        direccion = Direccion(
            municipio_id=municipio_id,
            nombre=dir_data["nombre"],
            codigo=f"{codigo}_{municipio_id}",
            descripcion=dir_data.get("descripcion", ""),
            tipo_gestion=dir_data.get("tipo_gestion", "interno"),
            activo=True,
            orden=i + 1
        )
        db.add(direccion)
        direcciones_creadas += 1
        print(f"[DIRECCIONES_AUTO] OK {dir_data['nombre']}")

    await db.flush()
    print(f"[DIRECCIONES_AUTO] {direcciones_creadas} direcciones creadas para {nombre_municipio}")

    return direcciones_creadas


async def asociar_tramites_a_direccion(
    db: AsyncSession,
    municipio_id: int,
    direccion_id: int,
    nombre_direccion: str
) -> int:
    """
    Asocia tipos de trámites a una dirección basándose en palabras clave.
    """
    from models.tramite import TipoTramite

    # Obtener todos los tipos de trámites
    result = await db.execute(select(TipoTramite).where(TipoTramite.activo == True))
    tipos = result.scalars().all()

    # Buscar coincidencias por palabra clave
    tramites_asociados = set()
    nombre_lower = nombre_direccion.lower()

    for keyword, tramite_names in TRAMITE_KEYWORDS.items():
        if keyword in nombre_lower:
            tramites_asociados.update(tramite_names)

    # Si no hay coincidencias, asignar al menos uno genérico
    if not tramites_asociados:
        tramites_asociados.add("Certificados y Constancias")

    # Crear asociaciones
    asociaciones_creadas = 0
    for tipo in tipos:
        if tipo.nombre in tramites_asociados:
            await db.execute(
                text("""
                    INSERT INTO direccion_tipos_tramites (municipio_id, direccion_id, tipo_tramite_id, activo, created_at)
                    VALUES (:mun_id, :dir_id, :tipo_id, 1, NOW())
                """),
                {"mun_id": municipio_id, "dir_id": direccion_id, "tipo_id": tipo.id}
            )
            asociaciones_creadas += 1

    return asociaciones_creadas


async def cargar_direcciones_completo(
    db: AsyncSession,
    municipio_id: int,
    nombre_municipio: str
) -> Dict:
    """
    Carga direcciones Y asocia tipos de trámites.

    Returns:
        Dict con direcciones_creadas y tramites_asociados
    """
    print(f"[DIRECCIONES_AUTO] Generando direcciones para {nombre_municipio}...")

    # Obtener sugerencias de la IA
    direcciones_sugeridas = await sugerir_direcciones_con_ia(nombre_municipio)

    if not direcciones_sugeridas:
        print(f"[DIRECCIONES_AUTO] IA no devolvió direcciones, usando genéricas")
        direcciones_sugeridas = [
            {"nombre": "Dirección de Obras Públicas", "descripcion": "Gestión de obras viales y edilicias municipales", "tipo_gestion": "reclamos"},
            {"nombre": "Dirección de Servicios Públicos", "descripcion": "Alumbrado, limpieza y espacios verdes", "tipo_gestion": "ambos"},
            {"nombre": "Dirección de Tránsito", "descripcion": "Control vehicular y señalización", "tipo_gestion": "tramites"},
            {"nombre": "Dirección de Medio Ambiente", "descripcion": "Gestión ambiental y espacios verdes", "tipo_gestion": "reclamos"},
            {"nombre": "Dirección de Desarrollo Social", "descripcion": "Asistencia social y programas comunitarios", "tipo_gestion": "ambos"},
            {"nombre": "Dirección de Cultura y Educación", "descripcion": "Actividades culturales y educativas", "tipo_gestion": "tramites"},
        ]

    direcciones_creadas = 0
    tramites_asociados = 0

    for i, dir_data in enumerate(direcciones_sugeridas[:6]):
        codigo = dir_data["nombre"].upper()[:10].replace(" ", "_")

        direccion = Direccion(
            municipio_id=municipio_id,
            nombre=dir_data["nombre"],
            codigo=f"{codigo}_{municipio_id}",
            descripcion=dir_data.get("descripcion", ""),
            tipo_gestion=dir_data.get("tipo_gestion", "interno"),
            activo=True,
            orden=i + 1
        )
        db.add(direccion)
        await db.flush()

        # Asociar tipos de trámites
        asocs = await asociar_tramites_a_direccion(
            db, municipio_id, direccion.id, dir_data["nombre"]
        )
        tramites_asociados += asocs

        direcciones_creadas += 1
        print(f"[DIRECCIONES_AUTO] OK {dir_data['nombre']} ({asocs} trámites)")

    print(f"[DIRECCIONES_AUTO] {direcciones_creadas} direcciones, {tramites_asociados} asociaciones de trámites")

    return {
        "direcciones_creadas": direcciones_creadas,
        "tramites_asociados": tramites_asociados
    }
