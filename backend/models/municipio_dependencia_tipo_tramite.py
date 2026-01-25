from sqlalchemy import Column, Integer, Boolean, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from core.database import Base


class MunicipioDependenciaTipoTramite(Base):
    """
    Asignación de tipos de trámite a dependencias por municipio.

    Define qué tipos de trámite maneja cada dependencia en cada municipio.

    Ejemplo:
    - En Chacabuco, "Obras Públicas" maneja "Permiso de Obra" y "Ampliación"
    - En Merlo, "Obras Públicas" maneja solo "Permiso de Obra"
    """
    __tablename__ = "municipio_dependencia_tipos_tramites"
    __table_args__ = (
        UniqueConstraint(
            'municipio_id', 'dependencia_id', 'tipo_tramite_id',
            name='uq_muni_dep_tipo_tramite'
        ),
    )

    id = Column(Integer, primary_key=True, index=True)

    # Claves foráneas
    municipio_id = Column(Integer, ForeignKey("municipios.id"), nullable=False, index=True)
    dependencia_id = Column(Integer, ForeignKey("dependencias.id"), nullable=False, index=True)
    tipo_tramite_id = Column(Integer, ForeignKey("tipos_tramites.id"), nullable=False, index=True)

    # FK a la tabla pivot (opcional, para facilitar joins)
    municipio_dependencia_id = Column(
        Integer,
        ForeignKey("municipio_dependencias.id"),
        nullable=True,
        index=True
    )

    activo = Column(Boolean, default=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relaciones
    municipio = relationship("Municipio")
    dependencia = relationship("Dependencia")
    tipo_tramite = relationship("TipoTramite")
    municipio_dependencia = relationship(
        "MunicipioDependencia",
        back_populates="tipos_tramite_asignados"
    )

    def __repr__(self):
        return f"<MuniDepTipoTramite M{self.municipio_id} D{self.dependencia_id} T{self.tipo_tramite_id}>"
