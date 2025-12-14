from sqlalchemy import Column, Integer, Boolean, ForeignKey, Table
from core.database import Base

# Tabla intermedia para la relación many-to-many entre Cuadrilla y Categoria
cuadrilla_categoria = Table(
    'cuadrilla_categorias',
    Base.metadata,
    Column('cuadrilla_id', Integer, ForeignKey('cuadrillas.id'), primary_key=True),
    Column('categoria_id', Integer, ForeignKey('categorias.id'), primary_key=True),
    Column('es_principal', Boolean, default=False)  # Indica si es la categoría principal
)
