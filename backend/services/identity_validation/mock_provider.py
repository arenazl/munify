"""
Proveedor mock para validación de identidad.

Este proveedor simula la validación y siempre retorna éxito.
Útil para desarrollo y demos antes de integrar con un proveedor real.
"""
import asyncio
import uuid
from typing import Optional

from .base import (
    IdentityValidationProvider,
    ValidationResult,
    ValidationStatus,
    IdentityData,
)


class MockIdentityProvider(IdentityValidationProvider):
    """
    Proveedor mock que simula validaciones exitosas.

    IMPORTANTE: Solo usar en desarrollo/demos.
    En producción, reemplazar por NosisProvider u otro proveedor real.
    """

    @property
    def provider_name(self) -> str:
        return "mock"

    async def validate_dni(
        self,
        dni_front_image: bytes,
        dni_back_image: bytes,
    ) -> tuple[ValidationResult, Optional[IdentityData]]:
        """Simula validación de DNI (siempre exitosa)."""
        # Simular tiempo de procesamiento
        await asyncio.sleep(1.0)

        # Verificar que las imágenes tengan contenido
        if not dni_front_image or not dni_back_image:
            return ValidationResult(
                status=ValidationStatus.ERROR,
                message="Imágenes de DNI vacías",
                provider=self.provider_name,
            ), None

        # Simular extracción de datos (datos ficticios)
        identity_data = IdentityData(
            dni_number="12345678",
            first_name="USUARIO",
            last_name="DEMO",
            birth_date="1990-01-01",
            gender="M",
            nationality="ARGENTINA",
        )

        return ValidationResult(
            status=ValidationStatus.VALIDATED,
            message="DNI validado correctamente (modo demo)",
            confidence_score=1.0,
            provider=self.provider_name,
            validation_id=str(uuid.uuid4()),
        ), identity_data

    async def validate_facial(
        self,
        selfie_image: bytes,
        dni_front_image: Optional[bytes] = None,
        dni_number: Optional[str] = None,
    ) -> ValidationResult:
        """Simula validación facial (siempre exitosa)."""
        # Simular tiempo de procesamiento
        await asyncio.sleep(1.5)

        # Verificar que la selfie tenga contenido
        if not selfie_image:
            return ValidationResult(
                status=ValidationStatus.ERROR,
                message="Imagen de selfie vacía",
                provider=self.provider_name,
            )

        return ValidationResult(
            status=ValidationStatus.VALIDATED,
            message="Rostro validado correctamente (modo demo)",
            confidence_score=0.95,
            provider=self.provider_name,
            validation_id=str(uuid.uuid4()),
        )

    async def full_validation(
        self,
        dni_front_image: bytes,
        dni_back_image: bytes,
        selfie_image: bytes,
    ) -> tuple[ValidationResult, Optional[IdentityData]]:
        """Simula validación completa (siempre exitosa)."""
        # Primero validar DNI
        dni_result, identity_data = await self.validate_dni(
            dni_front_image, dni_back_image
        )
        if dni_result.status != ValidationStatus.VALIDATED:
            return dni_result, None

        # Luego validar facial
        facial_result = await self.validate_facial(
            selfie_image, dni_front_image
        )
        if facial_result.status != ValidationStatus.VALIDATED:
            return facial_result, identity_data

        # Todo validado
        return ValidationResult(
            status=ValidationStatus.VALIDATED,
            message="Identidad validada correctamente (modo demo)",
            confidence_score=0.95,
            provider=self.provider_name,
            validation_id=str(uuid.uuid4()),
        ), identity_data
