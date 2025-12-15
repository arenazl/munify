from fastapi import APIRouter, Query, HTTPException
from typing import Optional

from services.imagen_service import (
    obtener_imagen_categoria,
    listar_imagenes_guardadas,
    eliminar_imagen,
    buscar_imagen_google,
    buscar_imagen_pexels,
    get_search_term_for_category
)

router = APIRouter(prefix="/imagenes", tags=["imagenes"])


@router.get("/categoria/{nombre}")
def imagen_categoria(nombre: str) -> dict:
    """
    Obtiene la imagen para una categoría.
    Si no existe localmente, la busca en Pexels/Google y la descarga.
    Retorna la ruta local de la imagen.
    """
    imagen_path = obtener_imagen_categoria(nombre)

    return {
        "categoria": nombre,
        "imagen_url": imagen_path  # Ruta local ej: /static/images/categorias/baches.jpg
    }


@router.get("/lista")
def listar_imagenes() -> dict:
    """
    Lista todas las imágenes de categorías guardadas localmente.
    """
    imagenes = listar_imagenes_guardadas()
    return {
        "total": len(imagenes),
        "imagenes": imagenes
    }


@router.delete("/categoria/{nombre}")
def eliminar_imagen_categoria(nombre: str) -> dict:
    """
    Elimina la imagen guardada de una categoría.
    """
    eliminado = eliminar_imagen(nombre)

    if eliminado:
        return {"mensaje": f"Imagen de '{nombre}' eliminada correctamente"}
    else:
        raise HTTPException(status_code=404, detail=f"No se encontró imagen para '{nombre}'")


@router.post("/descargar-todas")
def descargar_todas_categorias(categorias: list[str]) -> dict:
    """
    Descarga imágenes para múltiples categorías de una vez.
    """
    resultados = []
    for cat in categorias:
        imagen_path = obtener_imagen_categoria(cat)
        resultados.append({
            "categoria": cat,
            "imagen_url": imagen_path,
            "exito": imagen_path is not None
        })

    exitosos = sum(1 for r in resultados if r["exito"])

    return {
        "total": len(categorias),
        "exitosos": exitosos,
        "fallidos": len(categorias) - exitosos,
        "resultados": resultados
    }


@router.get("/buscar")
def buscar_imagen(
    q: str = Query(..., description="Término de búsqueda"),
    tipo: str = Query("general", description="Tipo de búsqueda: general, categoria")
) -> dict:
    """
    Busca una imagen en Pexels/Google y retorna la URL (sin descargar).
    """
    if tipo == "categoria":
        search_term = get_search_term_for_category(q)
    else:
        search_term = q

    # Intentar Pexels primero, luego Google
    imagen_url = buscar_imagen_pexels(search_term)
    if not imagen_url:
        imagen_url = buscar_imagen_google(search_term)

    return {
        "query": q,
        "search_term": search_term,
        "imagen_url": imagen_url
    }
