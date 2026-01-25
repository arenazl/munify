from sqlalchemy import Column, Integer, Boolean, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from core.database import Base


class MunicipioDependenciaCategoria(Base):
    """
    Asignación de categorías de reclamos a dependencias por municipio.

    Define qué categorías de reclamos maneja cada dependencia en cada municipio.

    Ejemplo:
    - En Chacabuco, "Obras Públicas" maneja "Baches" y "Veredas rotas"
    - En Merlo, "Obras Públicas" maneja "Baches" pero "Veredas rotas" lo maneja "Servicios Públicos"
    """
    __tablename__ = "municipio_dependencia_categorias"
    __table_args__ = (
        UniqueConstraint(
            'municipio_id', 'dependencia_id', 'categoria_id',
            name='uq_muni_dep_categoria'
        ),
    )

    id = Column(Integer, primary_key=True, index=True)

    # Claves foráneas
    municipio_id = Column(Integer, ForeignKey("municipios.id"), nullable=False, index=True)
    dependencia_id = Column(Integer, ForeignKey("dependencias.id"), nullable=False, index=True)
    categoria_id = Column(Integer, ForeignKey("categorias.id"), nullable=False, index=True)

    # FK a la tabla pivot (opcional, para facilitar joins)
    municipio_dependencia_id = Column(
        Integer,
        ForeignKey("municipio_dependencias.id"),
        nullable=True,
        index=True
    )

    # Personalizaciones por asignación
    tiempo_resolucion_estimado = Column(Integer, nullable=True)  # horas (override)
    prioridad_default = Column(Integer, nullable=True)           # 1-5 (override)

    activo = Column(Boolean, default=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relaciones
    municipio = relationship("Municipio")
    dependencia = relationship("Dependencia")
    categoria = relationship("Categoria")
    municipio_dependencia = relationship(
        "MunicipioDependencia",
        back_populates="categorias_asignadas"
    )

    def __repr__(self):
        return f"<MuniDepCategoria M{self.municipio_id} D{self.dependencia_id} C{self.categoria_id}>"
