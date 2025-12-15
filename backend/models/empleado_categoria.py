from sqlalchemy import Column, Integer, Boolean, ForeignKey, Table
from core.database import Base

# Tabla intermedia para la relacion many-to-many entre Empleado y Categoria
empleado_categoria = Table(
    'empleado_categorias',
    Base.metadata,
    Column('empleado_id', Integer, ForeignKey('empleados.id'), primary_key=True),
    Column('categoria_id', Integer, ForeignKey('categorias.id'), primary_key=True),
    Column('es_principal', Boolean, default=False)  # Indica si es la categoria principal
)
