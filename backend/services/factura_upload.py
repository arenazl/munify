"""Subida de facturas/comprobantes a Cloudinary (Tesorería).

Punto único para subir el PDF/imagen adjunto de un gasto o de una orden de
pago. Antes cada endpoint subía los PDF como `resource_type='raw'` SIN
extensión, y Cloudinary los entregaba como `application/octet-stream` con un
nombre sin `.pdf`: el navegador bajaba un archivo que no abría.

Acá los PDF se suben como `raw` pero con un `public_id` que TERMINA en `.pdf`,
así la URL queda `.../raw/upload/.../<id>.pdf` y Cloudinary la sirve como
`application/pdf` (se abre/descarga bien). Las imágenes van como `image`.
"""
import secrets

import cloudinary
import cloudinary.uploader
from fastapi import HTTPException, UploadFile

from core.config import settings

# Config idempotente (por si el módulo se usa antes que otro configure Cloudinary)
cloudinary.config(
    cloud_name=settings.CLOUDINARY_CLOUD_NAME,
    api_key=settings.CLOUDINARY_API_KEY,
    api_secret=settings.CLOUDINARY_API_SECRET,
)


def subir_factura(file: UploadFile, folder: str) -> dict:
    """Sube el adjunto a `folder` preservando la extensión y devuelve la URL.

    Returns: {"url", "public_id", "resource_type"}
    Raises: HTTPException 422 si el tipo no es PDF ni imagen.
    """
    ct = (file.content_type or "").lower()
    if ct == "application/pdf":
        # public_id con .pdf -> la URL raw termina en .pdf y se sirve como PDF
        public_id = f"{secrets.token_hex(12)}.pdf"
        result = cloudinary.uploader.upload(
            file.file, folder=folder, resource_type="raw", public_id=public_id,
        )
        resource_type = "raw"
    elif ct.startswith("image/"):
        result = cloudinary.uploader.upload(
            file.file, folder=folder, resource_type="image",
        )
        resource_type = "image"
    else:
        raise HTTPException(422, "Solo se permiten PDF o imágenes")

    return {
        "url": result.get("secure_url") or result.get("url"),
        "public_id": result.get("public_id"),
        "resource_type": resource_type,
    }
