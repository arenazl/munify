from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, ForeignKey, Float
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from core.database import Base


class Direccion(Base):
    """
    Unidad organizativa del municipio que gestiona reclamos y/o tramites.

    Ejemplos:
    - Direccion de Obras Publicas
    - Direccion Catastral
    - Direccion de Limpieza
    - Direccion de Transito
    - Direccion de Servicios Sociales

    Una direccion puede gestionar:
    - Solo categorias de reclamos (ej: Direccion de Limpieza)
    - Solo tipos de tramite (ej: Direccion de Rentas)
    - Ambas cosas (ej: Direccion de Obras Publicas)
    """
    __tablename__ = "direcciones"

    id = Column(Integer, primary_key=True, index=True)

    # Multi-tenant: Cada direccion pertenece a un municipio
    municipio_id = Column(Integer, ForeignKey("municipios.id"), nullable=False, index=True)
    municipio = relationship("Municipio", back_populates="direcciones")

    # Informacion basica
    nombre = Column(String(200), nullable=False)  # "Direccion de Obras Publicas"
    codigo = Column(String(50), nullable=True)    # "DOP" (codigo interno)
    descripcion = Column(Text, nullable=True)

    # Ubicacion fisica (con geolocalizacion)
    direccion = Column(String(300), nullable=True)  # "Av. San Martin 1234"
    localidad = Column(String(100), nullable=True)  # "San Martin"
    codigo_postal = Column(String(20), nullable=True)  # "1650"
    latitud = Column(Float, nullable=True)
    longitud = Column(Float, nullable=True)

    # Tipo de gestion (util para filtros y validaciones)
    # Puede gestionar: reclamos, tramites, ambos
    tipo_gestion = Column(String(20), default="ambos")  # "reclamos" | "tramites" | "ambos"

    # Configuracion
    activo = Column(Boolean, default=True)
    orden = Column(Integer, default=0)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relaciones
    # Una direccion tiene asignadas categorias (para reclamos)
    categorias_asignadas = relationship(
        "DireccionCategoria",
        back_populates="direccion",
        cascade="all, delete-orphan"
    )

    # Una direccion tiene asignados tipos de tramite
    tipos_tramite_asignados = relationship(
        "DireccionTipoTramite",
        back_populates="direccion",
        cascade="all, delete-orphan"
    )

    # Una direccion tiene reclamos asignados (DEPRECATED)
    reclamos = relationship("Reclamo", back_populates="direccion_asignada_legacy")

    # Una direccion tiene solicitudes asignadas (DEPRECATED)
    solicitudes = relationship("Solicitud", back_populates="direccion_asignada_legacy")

    def __repr__(self):
        return f"<Direccion {self.nombre}>"

    @property
    def tiene_categorias(self):
        """Verifica si la direccion tiene categorias asignadas"""
        return len(self.categorias_asignadas) > 0

    @property
    def tiene_tipos_tramite(self):
        """Verifica si la direccion tiene tipos de tramite asignados"""
        return len(self.tipos_tramite_asignados) > 0
