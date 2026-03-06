"""
Proveedor Nosis para validación de identidad.

Este proveedor se conecta con la API de Nosis para validar identidad
contra RENAPER.

CONFIGURACIÓN REQUERIDA:
- NOSIS_API_KEY: API key de Nosis
- NOSIS_API_URL: URL base de la API (https://api.nosis.com/...)
- NOSIS_USERNAME: Usuario de Nosis

Para obtener credenciales, contactar con Nosis:
- Teléfono: +5411 2206 8000
- Web: https://servicios.nosis.com/apis

=============================================================================
TODO: IMPLEMENTAR CUANDO SE TENGAN LAS CREDENCIALES DE NOSIS
=============================================================================
Pasos para implementar:
1. Obtener credenciales de Nosis (API key, username)
2. Revisar documentación de la API de Nosis (endpoint, parámetros)
3. Implementar los métodos validate_dni, validate_facial, full_validation
4. Configurar variables de entorno: IDENTITY_PROVIDER=nosis, NOSIS_API_KEY=...
=============================================================================
"""
import base64
import logging
from typing import Optional

# import httpx  # TODO: Descomentar cuando se implemente

from .base import (
    IdentityValidationProvider,
    ValidationResult,
    ValidationStatus,
    IdentityData,
)

logger = logging.getLogger(__name__)


class NosisIdentityProvider(IdentityValidationProvider):
    """
    Proveedor de validación de identidad usando Nosis.

    Nosis valida contra RENAPER y permite:
    - Validación de DNI (frente y dorso)
    - Validación facial con liveness
    - Comparación contra foto oficial de RENAPER
    """

    def __init__(
        self,
        api_key: str,
        api_url: str = "https://api.nosis.com",
        username: Optional[str] = None,
    ):
        """
        Inicializa el proveedor Nosis.

        Args:
            api_key: API key proporcionada por Nosis
            api_url: URL base de la API de Nosis
            username: Usuario de Nosis (opcional)
        """
        self.api_key = api_key
        self.api_url = api_url
        self.username = username

    @property
    def provider_name(self) -> str:
        return "nosis"

    # =========================================================================
    # TODO: Implementar método auxiliar para llamadas a la API de Nosis
    # =========================================================================
    # async def _call_nosis_api(self, endpoint: str, data: dict) -> dict:
    #     """
    #     Realiza una llamada a la API de Nosis.
    #
    #     Args:
    #         endpoint: Endpoint de la API (ej: "identity/validate-dni")
    #         data: Datos a enviar en el body
    #
    #     Returns:
    #         Respuesta JSON de la API
    #     """
    #     async with httpx.AsyncClient() as client:
    #         response = await client.post(
    #             f"{self.api_url}/{endpoint}",
    #             headers={
    #                 "Authorization": f"Bearer {self.api_key}",
    #                 "Content-Type": "application/json",
    #                 # TODO: Verificar headers requeridos por Nosis
    #             },
    #             json=data,
    #             timeout=30.0,
    #         )
    #         response.raise_for_status()
    #         return response.json()

    async def validate_dni(
        self,
        dni_front_image: bytes,
        dni_back_image: bytes,
    ) -> tuple[ValidationResult, Optional[IdentityData]]:
        """
        Valida las imágenes del DNI usando Nosis.
        """
        # =====================================================================
        # TODO: IMPLEMENTAR VALIDACIÓN DE DNI CON NOSIS
        # =====================================================================
        # El flujo típico sería:
        #
        # 1. Convertir imágenes a base64
        # front_b64 = base64.b64encode(dni_front_image).decode()
        # back_b64 = base64.b64encode(dni_back_image).decode()
        #
        # 2. Llamar al endpoint de OCR/validación de Nosis
        # response = await self._call_nosis_api("identity/validate-dni", {
        #     "front_image": front_b64,
        #     "back_image": back_b64,
        # })
        #
        # 3. Procesar respuesta y extraer datos
        # if response.get("success"):
        #     identity_data = IdentityData(
        #         dni_number=response.get("dni"),
        #         first_name=response.get("nombre"),
        #         last_name=response.get("apellido"),
        #         birth_date=response.get("fecha_nacimiento"),
        #         gender=response.get("sexo"),
        #     )
        #     return ValidationResult(
        #         status=ValidationStatus.VALIDATED,
        #         message="DNI validado correctamente",
        #         confidence_score=response.get("confidence", 1.0),
        #         provider=self.provider_name,
        #         validation_id=response.get("validation_id"),
        #     ), identity_data
        # else:
        #     return ValidationResult(
        #         status=ValidationStatus.REJECTED,
        #         message=response.get("error", "Error en validación de DNI"),
        #         provider=self.provider_name,
        #     ), None
        # =====================================================================

        logger.warning("NosisIdentityProvider.validate_dni: NO IMPLEMENTADO - Falta configurar credenciales de Nosis")

        return ValidationResult(
            status=ValidationStatus.ERROR,
            message="Proveedor Nosis no configurado. Contactar a Nosis para obtener credenciales.",
            provider=self.provider_name,
        ), None

    async def validate_facial(
        self,
        selfie_image: bytes,
        dni_front_image: Optional[bytes] = None,
        dni_number: Optional[str] = None,
    ) -> ValidationResult:
        """
        Valida la selfie contra RENAPER usando Nosis.
        """
        # =====================================================================
        # TODO: IMPLEMENTAR VALIDACIÓN FACIAL CON NOSIS
        # =====================================================================
        # El flujo típico sería:
        #
        # 1. Convertir selfie a base64
        # selfie_b64 = base64.b64encode(selfie_image).decode()
        #
        # 2. Preparar datos adicionales
        # data = {"selfie_image": selfie_b64}
        # if dni_number:
        #     data["dni"] = dni_number  # Para comparar contra RENAPER
        # if dni_front_image:
        #     data["dni_front"] = base64.b64encode(dni_front_image).decode()
        #
        # 3. Llamar al endpoint de validación facial de Nosis
        # response = await self._call_nosis_api("identity/validate-facial", data)
        #
        # 4. Procesar respuesta
        # if response.get("liveness_passed") and response.get("face_match"):
        #     return ValidationResult(
        #         status=ValidationStatus.VALIDATED,
        #         message="Identidad verificada correctamente",
        #         confidence_score=response.get("match_score", 0.95),
        #         provider=self.provider_name,
        #         validation_id=response.get("validation_id"),
        #     )
        # elif not response.get("liveness_passed"):
        #     return ValidationResult(
        #         status=ValidationStatus.REJECTED,
        #         message="No se pudo verificar que sea una persona real",
        #         provider=self.provider_name,
        #     )
        # else:
        #     return ValidationResult(
        #         status=ValidationStatus.REJECTED,
        #         message="El rostro no coincide con el documento",
        #         confidence_score=response.get("match_score"),
        #         provider=self.provider_name,
        #     )
        # =====================================================================

        logger.warning("NosisIdentityProvider.validate_facial: NO IMPLEMENTADO - Falta configurar credenciales de Nosis")

        return ValidationResult(
            status=ValidationStatus.ERROR,
            message="Proveedor Nosis no configurado. Contactar a Nosis para obtener credenciales.",
            provider=self.provider_name,
        )

    async def full_validation(
        self,
        dni_front_image: bytes,
        dni_back_image: bytes,
        selfie_image: bytes,
    ) -> tuple[ValidationResult, Optional[IdentityData]]:
        """
        Realiza validación completa usando Nosis: DNI + facial.
        """
        # =====================================================================
        # TODO: IMPLEMENTAR VALIDACIÓN COMPLETA CON NOSIS
        # =====================================================================
        # El flujo completo sería:
        #
        # 1. Primero validar DNI y extraer datos
        # dni_result, identity_data = await self.validate_dni(
        #     dni_front_image, dni_back_image
        # )
        # if dni_result.status != ValidationStatus.VALIDATED:
        #     return dni_result, None
        #
        # 2. Luego validar facial con el DNI extraído
        # facial_result = await self.validate_facial(
        #     selfie_image=selfie_image,
        #     dni_front_image=dni_front_image,
        #     dni_number=identity_data.dni_number,
        # )
        # if facial_result.status != ValidationStatus.VALIDATED:
        #     return facial_result, identity_data
        #
        # 3. Todo validado
        # return ValidationResult(
        #     status=ValidationStatus.VALIDATED,
        #     message="Identidad verificada correctamente contra RENAPER",
        #     confidence_score=facial_result.confidence_score,
        #     provider=self.provider_name,
        #     validation_id=facial_result.validation_id,
        # ), identity_data
        # =====================================================================

        logger.warning("NosisIdentityProvider.full_validation: NO IMPLEMENTADO - Falta configurar credenciales de Nosis")

        return ValidationResult(
            status=ValidationStatus.ERROR,
            message="Proveedor Nosis no configurado. Contactar a Nosis para obtener credenciales.",
            provider=self.provider_name,
        ), None
