from sqlalchemy import Column, Integer, Boolean, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from core.database import Base


class MunicipioDependenciaTramite(Base):
    """
    Asignación de trámites específicos a dependencias por municipio.

    Define qué trámites específicos maneja cada dependencia en cada municipio.
    Es un nivel más granular que MunicipioDependenciaTipoTramite.

    Ejemplo:
    - "Dirección de Medio Ambiente" maneja:
      - "Permiso Ambiental" (del tipo "Medio Ambiente")
      - "Habilitación Industrial" (del tipo "Medio Ambiente")
      - Pero NO "Estudio de Impacto" (también del tipo "Medio Ambiente")
    """
    __tablename__ = "municipio_dependencia_tramites"
    __table_args__ = (
        UniqueConstraint(
            'municipio_dependencia_id', 'tramite_id',
            name='uq_muni_dep_tramite'
        ),
    )

    id = Column(Integer, primary_key=True, index=True)

    # Claves foráneas
    municipio_dependencia_id = Column(
        Integer,
        ForeignKey("municipio_dependencias.id"),
        nullable=False,
        index=True
    )
    tramite_id = Column(Integer, ForeignKey("tramites.id"), nullable=False, index=True)

    activo = Column(Boolean, default=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relaciones
    municipio_dependencia = relationship(
        "MunicipioDependencia",
        back_populates="tramites_asignados"
    )
    tramite = relationship("Tramite")

    def __repr__(self):
        return f"<MuniDepTramite MD{self.municipio_dependencia_id} T{self.tramite_id}>"
