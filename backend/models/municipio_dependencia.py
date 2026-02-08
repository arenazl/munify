from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, ForeignKey, Float, UniqueConstraint, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from core.database import Base


class MunicipioDependencia(Base):
    """
    Tabla pivot: Qué dependencias tiene habilitado cada municipio.

    Cuando un municipio se crea, el admin selecciona qué dependencias
    del catálogo global va a utilizar. Puede personalizar algunos valores.
    """
    __tablename__ = "municipio_dependencias"
    __table_args__ = (
        UniqueConstraint('municipio_id', 'dependencia_id', name='uq_municipio_dependencia'),
    )

    id = Column(Integer, primary_key=True, index=True)

    # Claves foráneas
    municipio_id = Column(Integer, ForeignKey("municipios.id"), nullable=False, index=True)
    dependencia_id = Column(Integer, ForeignKey("dependencias.id"), nullable=False, index=True)

    # Estado
    activo = Column(Boolean, default=True)
    orden = Column(Integer, default=0)  # Orden personalizado por municipio

    # Personalizaciones por municipio (sobrescriben valores de la dependencia template)
    direccion_local = Column(String(300), nullable=True)
    localidad_local = Column(String(100), nullable=True)
    telefono_local = Column(String(50), nullable=True)
    email_local = Column(String(200), nullable=True)
    horario_atencion_local = Column(String(200), nullable=True)
    latitud_local = Column(Float, nullable=True)
    longitud_local = Column(Float, nullable=True)

    # Configuración adicional en JSON (para extensibilidad)
    config = Column(JSON, nullable=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relaciones
    municipio = relationship("Municipio", back_populates="dependencias_habilitadas")
    dependencia = relationship("Dependencia", back_populates="municipios_habilitados")

    # Relaciones con asignaciones
    categorias_asignadas = relationship(
        "MunicipioDependenciaCategoria",
        back_populates="municipio_dependencia",
        cascade="all, delete-orphan"
    )
    tipos_tramite_asignados = relationship(
        "MunicipioDependenciaTipoTramite",
        back_populates="municipio_dependencia",
        cascade="all, delete-orphan"
    )
    tramites_asignados = relationship(
        "MunicipioDependenciaTramite",
        back_populates="municipio_dependencia",
        cascade="all, delete-orphan"
    )

    # Reclamos y solicitudes asignadas a esta dependencia en este municipio
    reclamos = relationship("Reclamo", back_populates="dependencia_asignada")
    solicitudes = relationship("Solicitud", back_populates="municipio_dependencia")

    def __repr__(self):
        return f"<MunicipioDependencia {self.municipio_id}-{self.dependencia_id}>"

    @property
    def nombre(self):
        """Devuelve el nombre de la dependencia"""
        return self.dependencia.nombre if self.dependencia else None

    @property
    def color(self):
        """Devuelve el color de la dependencia"""
        return self.dependencia.color if self.dependencia else None

    @property
    def icono(self):
        """Devuelve el icono de la dependencia"""
        return self.dependencia.icono if self.dependencia else None

    @property
    def direccion_efectiva(self):
        """Devuelve la dirección local si existe, sino la del template"""
        return self.direccion_local or (self.dependencia.direccion if self.dependencia else None)

    @property
    def telefono_efectivo(self):
        """Devuelve el teléfono local si existe, sino el del template"""
        return self.telefono_local or (self.dependencia.telefono if self.dependencia else None)

    @property
    def email_efectivo(self):
        """Devuelve el email local si existe, sino el del template"""
        return self.email_local or (self.dependencia.email if self.dependencia else None)
