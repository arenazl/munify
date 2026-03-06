"""
Endpoints para validación de identidad.

Proporciona endpoints para validar DNI y rostro de usuarios
durante el proceso de trámites.
"""
import base64
import logging
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.identity_validation import (
    get_identity_provider,
    ValidationStatus,
)

router = APIRouter(prefix="/validacion-identidad", tags=["Validación de Identidad"])
logger = logging.getLogger(__name__)


class ValidacionDniRequest(BaseModel):
    """Request para validación de DNI."""
    dni_front_image: str  # Base64 encoded image
    dni_back_image: str  # Base64 encoded image


class ValidacionFacialRequest(BaseModel):
    """Request para validación facial."""
    selfie_image: str  # Base64 encoded image
    dni_front_image: Optional[str] = None  # Para comparación local
    dni_number: Optional[str] = None  # Para consulta en RENAPER


class ValidacionCompletaRequest(BaseModel):
    """Request para validación completa (DNI + facial)."""
    dni_front_image: str  # Base64 encoded image
    dni_back_image: str  # Base64 encoded image
    selfie_image: str  # Base64 encoded image


class ValidacionResponse(BaseModel):
    """Respuesta de validación."""
    status: str
    message: str
    confidence_score: Optional[float] = None
    provider: Optional[str] = None
    validation_id: Optional[str] = None
    # Datos extraídos del DNI (solo si aplica)
    dni_number: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None


def decode_base64_image(base64_string: str) -> bytes:
    """
    Decodifica una imagen base64.

    Soporta formato con o sin prefijo data:image/...
    """
    try:
        # Remover prefijo si existe (data:image/jpeg;base64,...)
        if "," in base64_string:
            base64_string = base64_string.split(",")[1]
        return base64.b64decode(base64_string)
    except Exception as e:
        logger.error(f"Error decodificando imagen base64: {e}")
        raise HTTPException(status_code=400, detail="Imagen inválida")


@router.post("/dni", response_model=ValidacionResponse)
async def validar_dni(request: ValidacionDniRequest):
    """
    Valida las imágenes del DNI (frente y dorso).

    Extrae los datos del documento y verifica su validez.

    Request body:
        - dni_front_image: Imagen del frente del DNI en base64
        - dni_back_image: Imagen del dorso del DNI en base64

    Returns:
        Resultado de la validación con datos extraídos si es exitosa.
    """
    try:
        dni_front = decode_base64_image(request.dni_front_image)
        dni_back = decode_base64_image(request.dni_back_image)

        provider = get_identity_provider()
        result, identity_data = await provider.validate_dni(dni_front, dni_back)

        response = ValidacionResponse(
            status=result.status.value,
            message=result.message,
            confidence_score=result.confidence_score,
            provider=result.provider,
            validation_id=result.validation_id,
        )

        # Agregar datos extraídos si la validación fue exitosa
        if identity_data:
            response.dni_number = identity_data.dni_number
            response.first_name = identity_data.first_name
            response.last_name = identity_data.last_name

        return response

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error en validación de DNI")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/facial", response_model=ValidacionResponse)
async def validar_facial(request: ValidacionFacialRequest):
    """
    Valida la selfie del usuario.

    Puede comparar contra:
    - La foto del DNI proporcionada
    - La foto en la base de datos de RENAPER (si se proporciona dni_number)

    Request body:
        - selfie_image: Imagen selfie del usuario en base64
        - dni_front_image: (opcional) Imagen del frente del DNI para comparación
        - dni_number: (opcional) Número de DNI para consulta en RENAPER

    Returns:
        Resultado de la validación facial.
    """
    try:
        selfie = decode_base64_image(request.selfie_image)
        dni_front = None
        if request.dni_front_image:
            dni_front = decode_base64_image(request.dni_front_image)

        provider = get_identity_provider()
        result = await provider.validate_facial(
            selfie_image=selfie,
            dni_front_image=dni_front,
            dni_number=request.dni_number,
        )

        return ValidacionResponse(
            status=result.status.value,
            message=result.message,
            confidence_score=result.confidence_score,
            provider=result.provider,
            validation_id=result.validation_id,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error en validación facial")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/completa", response_model=ValidacionResponse)
async def validar_completa(request: ValidacionCompletaRequest):
    """
    Realiza validación completa: DNI + facial.

    Este endpoint realiza todo el flujo de validación:
    1. Valida y extrae datos del DNI
    2. Valida la selfie contra el documento y/o RENAPER

    Request body:
        - dni_front_image: Imagen del frente del DNI en base64
        - dni_back_image: Imagen del dorso del DNI en base64
        - selfie_image: Imagen selfie del usuario en base64

    Returns:
        Resultado de la validación completa con datos extraídos.
    """
    try:
        dni_front = decode_base64_image(request.dni_front_image)
        dni_back = decode_base64_image(request.dni_back_image)
        selfie = decode_base64_image(request.selfie_image)

        provider = get_identity_provider()
        result, identity_data = await provider.full_validation(
            dni_front_image=dni_front,
            dni_back_image=dni_back,
            selfie_image=selfie,
        )

        response = ValidacionResponse(
            status=result.status.value,
            message=result.message,
            confidence_score=result.confidence_score,
            provider=result.provider,
            validation_id=result.validation_id,
        )

        # Agregar datos extraídos si la validación fue exitosa
        if identity_data:
            response.dni_number = identity_data.dni_number
            response.first_name = identity_data.first_name
            response.last_name = identity_data.last_name

        return response

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error en validación completa")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/provider-info")
async def get_provider_info():
    """
    Obtiene información del proveedor de validación configurado.

    Returns:
        Nombre del proveedor actualmente configurado.
    """
    provider = get_identity_provider()
    return {
        "provider": provider.provider_name,
        "status": "active",
    }
