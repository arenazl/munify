from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, ForeignKey, Float, Enum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from core.database import Base
import enum


class TipoGestionDependencia(str, enum.Enum):
    """Tipo de gestión que realiza la dependencia"""
    RECLAMO = "RECLAMO"
    TRAMITE = "TRAMITE"
    AMBOS = "AMBOS"


class Dependencia(Base):
    """
    Catálogo global de dependencias/unidades organizativas municipales.

    Es un TEMPLATE sin municipio_id - los municipios habilitan dependencias
    mediante la tabla MunicipioDependencia.

    Ejemplos:
    - Dirección de Atención al Vecino
    - Secretaría de Obras Públicas
    - Dirección de Tránsito y Seguridad Vial
    - Dirección de Zoonosis y Salud Animal

    Una dependencia puede gestionar:
    - Solo reclamos (ej: Dirección de Limpieza)
    - Solo trámites (ej: Dirección de Rentas)
    - Ambos (ej: Dirección de Obras Públicas)
    """
    __tablename__ = "dependencias"

    id = Column(Integer, primary_key=True, index=True)

    # Información básica
    nombre = Column(String(200), nullable=False, unique=True)
    codigo = Column(String(50), nullable=True, unique=True)  # "OBRAS_PUBLICAS"
    descripcion = Column(Text, nullable=True)

    # Ubicación física (valores por defecto, municipios pueden personalizar)
    direccion = Column(String(300), nullable=True)
    localidad = Column(String(100), nullable=True)
    ciudad = Column(String(100), nullable=True)
    codigo_postal = Column(String(20), nullable=True)

    # Contacto
    telefono = Column(String(50), nullable=True)
    email = Column(String(200), nullable=True)
    horario_atencion = Column(String(200), nullable=True)  # "Lunes a Viernes de 8:00 a 16:00"

    # Tipo de gestión
    tipo_gestion = Column(
        Enum(TipoGestionDependencia),
        default=TipoGestionDependencia.AMBOS,
        nullable=False
    )

    # Jerarquía (para futuro uso)
    dependencia_padre_id = Column(Integer, ForeignKey("dependencias.id"), nullable=True, index=True)
    dependencia_padre = relationship("Dependencia", remote_side=[id], backref="sub_dependencias")

    # Geolocalización (valores por defecto)
    latitud = Column(Float, nullable=True)
    longitud = Column(Float, nullable=True)

    # Estado
    activo = Column(Boolean, default=True)
    orden = Column(Integer, default=0)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relaciones
    municipios_habilitados = relationship("MunicipioDependencia", back_populates="dependencia")

    def __repr__(self):
        return f"<Dependencia {self.nombre}>"
