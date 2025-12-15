import re
import requests
from typing import Optional
from pathlib import Path

from core.config import settings

# Directorio donde se guardan las imágenes
IMAGES_DIR = Path(__file__).parent.parent / "static" / "images" / "categorias"
IMAGES_DIR.mkdir(parents=True, exist_ok=True)

# Cache en memoria de rutas de imágenes ya guardadas
_saved_images: dict[str, str] = {}


def _get_filename_for_category(categoria: str) -> str:
    """Genera un nombre de archivo seguro para la categoría."""
    safe_name = re.sub(r'[^\w\s-]', '', categoria.lower())
    safe_name = re.sub(r'[-\s]+', '_', safe_name).strip('_')
    return safe_name


def _get_existing_image(categoria: str) -> Optional[str]:
    """Verifica si ya existe una imagen guardada para esta categoría."""
    filename_base = _get_filename_for_category(categoria)

    for ext in ['.jpg', '.png', '.jpeg', '.webp']:
        filepath = IMAGES_DIR / f"{filename_base}{ext}"
        if filepath.exists():
            return f"/static/images/categorias/{filename_base}{ext}"

    return None


# Mapeo de categorías a términos de búsqueda simples para Pexels
# Palabras cortas y claras que den fotos reconocibles
CATEGORIA_SEARCH_TERMS = {
    "baches": "pothole",
    "baches y calles": "road repair",
    "alumbrado": "farol",
    "alumbrado publico": "farol",
    "basura": "garbage",
    "basura y limpieza": "trash bin",
    "limpieza": "broom cleaning",
    "recoleccion": "garbage truck",
    "recoleccion de residuos": "waste truck",
    "espacios verdes": "jungle",
    "parques": "park bench",
    "veredas": "house street",
    "senalizacion": "sign",
    "señalizacion": "sign",
    "transito": "traffic light",
    "tránsito": "traffic",
    "arbolado": "tree",
    "arbolado publico": "trees street",
    "cloacas": "sewer",
    "desagues": "drain",
    "desagues y cloacas": "manhole",
    "agua": "pipe",
    "agua y cloacas": "pipe",
    "agua y canerias": "pipe",
    "ruidos molestos": "noise",
    "ruidos": "speaker",
    "animales": "dog",
    "animales sueltos": "stray dog",
    "seguridad": "security camera",
    "obras": "construction",
    "electricidad": "power lines",
    "gas": "gas meter",
    "plagas": "pest control",
    "plagas y fumigacion": "fumigation",
    "otros": "city hall",
}


def get_search_term_for_category(categoria_nombre: str) -> str:
    """Obtiene el término de búsqueda optimizado para una categoría."""
    nombre_lower = categoria_nombre.lower().strip()
    nombre_lower = nombre_lower.replace('á', 'a').replace('é', 'e').replace('í', 'i').replace('ó', 'o').replace('ú', 'u')

    for key, term in CATEGORIA_SEARCH_TERMS.items():
        if key in nombre_lower or nombre_lower in key:
            return term

    return f"{categoria_nombre} municipal urban city"


def buscar_imagen_pexels(query: str) -> Optional[str]:
    """Busca imagen en Pexels API (gratuita y confiable)."""
    if not settings.PEXELS_API_KEY:
        return None

    try:
        headers = {
            'Authorization': settings.PEXELS_API_KEY
        }

        url = f"https://api.pexels.com/v1/search?query={requests.utils.quote(query)}&per_page=5&orientation=landscape"
        response = requests.get(url, headers=headers, timeout=10)

        if response.status_code == 200:
            data = response.json()
            photos = data.get('photos', [])
            if photos:
                # Usar imagen de tamaño mediano (mejor para cards)
                return photos[0]['src']['medium']

        return None

    except Exception as e:
        print(f"Error buscando imagen en Pexels: {e}")
        return None


def buscar_imagen_google(query: str) -> Optional[str]:
    """Busca imagen en Google Images usando requests"""
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'es-AR,es;q=0.9,en;q=0.8',
            'Accept-Encoding': 'gzip, deflate',
            'DNT': '1',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1'
        }

        url = f"https://www.google.com/search?q={requests.utils.quote(query)}&tbm=isch&hl=es"
        response = requests.get(url, headers=headers, timeout=15)

        if response.status_code != 200:
            print(f"Google Images devolvio status {response.status_code}")
            return None

        html = response.text

        patterns = [
            r'"ou":"(https?://[^"]+\.(?:jpg|jpeg|png|webp))"',
            r'"tu":"(https?://[^"]+)"',
            r'data-src="(https?://[^"]+\.(?:jpg|jpeg|png|webp))"',
            r'src="(https?://[^"]+\.(?:jpg|jpeg|png|webp))"',
            r'(https://[^\s"\'<>\\]+\.jpg)',
            r'(https://[^\s"\'<>\\]+\.png)',
            r'(https://[^\s"\'<>\\]+\.jpeg)',
            r'(https://[^\s"\'<>\\]+\.webp)',
        ]

        for pattern in patterns:
            matches = re.findall(pattern, html, re.IGNORECASE)
            for match in matches:
                if any(skip in match.lower() for skip in ['gstatic', 'google.com', 'encrypted', 'favicon', 'logo', 'icon']):
                    continue
                if match.startswith('http') and len(match) < 500:
                    return match

        return None

    except Exception as e:
        print(f"Error buscando imagen en Google: {e}")
        return None


def descargar_imagen(url: str, categoria: str) -> Optional[str]:
    """Descarga una imagen y la guarda localmente."""
    try:
        ext = '.jpg'
        for e in ['.png', '.jpeg', '.webp', '.jpg']:
            if e in url.lower():
                ext = e
                break

        filename = f"{_get_filename_for_category(categoria)}{ext}"
        filepath = IMAGES_DIR / filename

        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }

        response = requests.get(url, headers=headers, timeout=15, stream=True)

        if response.status_code == 200 and len(response.content) > 1000:
            filepath.write_bytes(response.content)
            relative_path = f"/static/images/categorias/{filename}"
            _saved_images[categoria.lower()] = relative_path
            print(f"Imagen guardada: {relative_path}")
            return relative_path

        return None

    except Exception as e:
        print(f"Error descargando imagen: {e}")
        return None


def obtener_imagen_categoria(categoria: str) -> Optional[str]:
    """
    Obtiene la imagen para una categoría.
    1. Primero busca si ya existe guardada localmente
    2. Si no existe, busca en Pexels API (confiable)
    3. Si falla, intenta Google Images
    """
    categoria_lower = categoria.lower().strip()

    # 1. Verificar cache en memoria
    if categoria_lower in _saved_images:
        return _saved_images[categoria_lower]

    # 2. Verificar si existe en disco
    existing = _get_existing_image(categoria)
    if existing:
        _saved_images[categoria_lower] = existing
        return existing

    # 3. Obtener término de búsqueda optimizado
    search_term = get_search_term_for_category(categoria)
    print(f"Buscando imagen para '{categoria}' con termino: '{search_term}'")

    # 4. Intentar Pexels API primero (confiable)
    image_url = buscar_imagen_pexels(search_term)

    # 5. Si falla, intentar Google Images
    if not image_url:
        image_url = buscar_imagen_google(search_term)

    if image_url:
        local_path = descargar_imagen(image_url, categoria)
        if local_path:
            return local_path

    return None


def listar_imagenes_guardadas() -> list[dict]:
    """Lista todas las imágenes guardadas."""
    imagenes = []
    for filepath in IMAGES_DIR.glob("*"):
        if filepath.suffix.lower() in ['.jpg', '.png', '.jpeg', '.webp']:
            imagenes.append({
                "nombre": filepath.stem,
                "archivo": filepath.name,
                "ruta": f"/static/images/categorias/{filepath.name}",
                "tamano": filepath.stat().st_size
            })
    return imagenes


def eliminar_imagen(categoria: str) -> bool:
    """Elimina la imagen de una categoría."""
    filename_base = _get_filename_for_category(categoria)

    for ext in ['.jpg', '.png', '.jpeg', '.webp']:
        filepath = IMAGES_DIR / f"{filename_base}{ext}"
        if filepath.exists():
            filepath.unlink()
            if categoria.lower() in _saved_images:
                del _saved_images[categoria.lower()]
            return True

    return False
