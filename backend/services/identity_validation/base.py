"""
Interfaz base para proveedores de validación de identidad.

Este módulo define la estructura que deben seguir todos los proveedores
de validación de identidad (Nosis, RENAPER, etc.).
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass
from enum import Enum
from typing import Optional


class ValidationStatus(str, Enum):
    """Estados posibles de una validación de identidad."""
    PENDING = "pending"
    VALIDATED = "validated"
    REJECTED = "rejected"
    ERROR = "error"


@dataclass
class ValidationResult:
    """Resultado de una validación de identidad."""
    status: ValidationStatus
    message: str
    confidence_score: Optional[float] = None  # 0.0 a 1.0
    provider: Optional[str] = None
    validation_id: Optional[str] = None  # ID de referencia del proveedor
    raw_response: Optional[dict] = None  # Respuesta completa del proveedor


@dataclass
class IdentityData:
    """Datos de identidad extraídos del documento."""
    dni_number: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    birth_date: Optional[str] = None
    gender: Optional[str] = None
    nationality: Optional[str] = None
    issue_date: Optional[str] = None
    expiry_date: Optional[str] = None


class IdentityValidationProvider(ABC):
    """
    Interfaz abstracta para proveedores de validación de identidad.

    Todos los proveedores (Nosis, RENAPER, etc.) deben implementar esta interfaz.
    """

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Nombre del proveedor."""
        pass

    @abstractmethod
    async def validate_dni(
        self,
        dni_front_image: bytes,
        dni_back_image: bytes,
    ) -> tuple[ValidationResult, Optional[IdentityData]]:
        """
        Valida las imágenes del DNI y extrae los datos.

        Args:
            dni_front_image: Imagen del frente del DNI (bytes, JPEG/PNG)
            dni_back_image: Imagen del dorso del DNI (bytes, JPEG/PNG)

        Returns:
            Tuple con el resultado de la validación y los datos extraídos (si aplica)
        """
        pass

    @abstractmethod
    async def validate_facial(
        self,
        selfie_image: bytes,
        dni_front_image: Optional[bytes] = None,
        dni_number: Optional[str] = None,
    ) -> ValidationResult:
        """
        Valida la selfie contra el documento o la base de datos del proveedor.

        Args:
            selfie_image: Imagen selfie del usuario (bytes, JPEG/PNG)
            dni_front_image: Imagen del frente del DNI para comparación local
            dni_number: Número de DNI para consulta en base del proveedor

        Returns:
            Resultado de la validación facial
        """
        pass

    @abstractmethod
    async def full_validation(
        self,
        dni_front_image: bytes,
        dni_back_image: bytes,
        selfie_image: bytes,
    ) -> tuple[ValidationResult, Optional[IdentityData]]:
        """
        Realiza la validación completa: DNI + facial.

        Args:
            dni_front_image: Imagen del frente del DNI
            dni_back_image: Imagen del dorso del DNI
            selfie_image: Imagen selfie del usuario

        Returns:
            Tuple con el resultado de la validación y los datos extraídos
        """
        pass
