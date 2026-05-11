from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from core.database import Base


class MunicipioModulo(Base):
    """
    Feature flags por municipio. Permite activar/desactivar modulos
    funcionales como "tesoreria", "turnos", "pagos", etc.

    El frontend chequea estos flags para mostrar/ocultar items del
    sidebar y bloquear rutas. Por default, un modulo no listado se
    considera DESACTIVADO en el municipio.

    Modulos previstos (clave en `modulo`):
      - 'reclamos'     (siempre activo, todos los municipios)
      - 'tramites'     (siempre activo, todos los municipios)
      - 'tesoreria'    (control de gastos, activable por municipio)
      - 'turnos'       (futuro)
      - 'pagos'        (futuro)
    """
    __tablename__ = "municipio_modulos"
    __table_args__ = (
        UniqueConstraint('municipio_id', 'modulo', name='uq_muni_modulo'),
    )

    id = Column(Integer, primary_key=True, index=True)
    municipio_id = Column(Integer, ForeignKey("municipios.id"), nullable=False, index=True)
    modulo = Column(String(50), nullable=False, index=True)
    activo = Column(Boolean, default=True, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    municipio = relationship("Municipio")

    def __repr__(self):
        return f"<MunicipioModulo M{self.municipio_id} {self.modulo}={self.activo}>"
