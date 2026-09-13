"""Persona: el objeto base del que se desprenden empleados, proveedores y el resto.

Plan: `docs/tesoreria/04-plan-integral-persona-y-obras.md` (fases) y
`docs/tesoreria/02-plan-consolidacion.md` (modelo destino).

La libreta única es la tabla `contactos` (modelo `Contacto`), que se evoluciona EN SU
LUGAR: conserva la PK y ninguna fila de plata se mueve. Lo que este archivo agrega es
la clasificación que le faltaba:

  - `persona_tipos`: catálogo EDITABLE POR MUNICIPIO de qué puede ser una persona
    (empleado, proveedor, contratista, concejal... y lo que el municipio quiera).
    Reemplaza al enum fijo `contactos.tipo`, que queda como ESPEJO mientras conviva
    el código viejo: ver `services/persona_tipos.py::tipo_legacy`.
  - `persona_roles`: una persona puede ser varias cosas a la vez (el de mantenimiento
    que además factura). Lleva `municipio_id` propio para que el borrado de un
    municipio demo no deje huérfanos.

Regla de convivencia (F0 a F5): TODO acá es aditivo. El backend publicado en QA lee
la misma base y no conoce estas tablas; nada de lo que se escribe acá puede cambiar lo
que sus endpoints devuelven. Las FK entrantes a `contactos` llevan CASCADE o SET NULL
para que un borrado desde la pantalla vieja no empiece a fallar.
"""
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from core.database import Base


class PersonaTipo(Base):
    """Qué puede ser una persona en ESTE municipio. Catálogo, no enum."""
    __tablename__ = "persona_tipos"
    __table_args__ = (
        UniqueConstraint("municipio_id", "codigo", name="uq_persona_tipo_muni_codigo"),
        {"mysql_charset": "utf8mb4", "mysql_collate": "utf8mb4_unicode_ci"},
    )

    id = Column(Integer, primary_key=True)
    municipio_id = Column(Integer, ForeignKey("municipios.id", ondelete="CASCADE"), nullable=False, index=True)

    # Clave estable para el código (`empleado`, `proveedor`...). El nombre lo edita el muni.
    codigo = Column(String(40), nullable=False)
    # SUBTIPOS (dueño, 2026-09-13): "Persona -> tipo -> subtipo, un nivel más". El "tipo
    # de empleado" de San Pedro Norte (Pasantes, Prensa, Auxiliares...) es un subtipo de
    # `empleado`; un municipio puede abrir "corralón" y "ferretería" bajo `proveedor`.
    # Un vínculo en `persona_roles` puede apuntar al subtipo: el padre queda implícito.
    padre_id = Column(Integer, ForeignKey("persona_tipos.id", ondelete="CASCADE"), nullable=True, index=True)
    nombre = Column(String(100), nullable=False)
    descripcion = Column(Text, nullable=True)
    color = Column(String(20), nullable=True)
    icono = Column(String(60), nullable=True)
    orden = Column(Integer, nullable=False, default=0, server_default="0")

    # Distingue al que recibe dinero del vínculo meramente institucional (otro
    # intendente es una persona, no un beneficiario).
    cobra = Column(Boolean, nullable=False, default=True, server_default="1")
    activo = Column(Boolean, nullable=False, default=True, server_default="1")

    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    roles = relationship("PersonaRol", back_populates="tipo", cascade="all, delete-orphan")
    padre = relationship("PersonaTipo", remote_side="PersonaTipo.id", foreign_keys=[padre_id])

    def __repr__(self):
        return f"<PersonaTipo {self.municipio_id}:{self.codigo}>"


# Modalidad de contratación de la ficha laboral. Las cinco salen de SPN (05-...md §2):
# planta = relación de dependencia · a_prueba = "Pasantes" de Bartolo (se pueden quedar
# o ir) · contratado = monotributo · jornalizado · jubilado. String, no ENUM de MySQL:
# un municipio puede necesitar otra sin tocar el esquema.
MODALIDADES = ("planta", "a_prueba", "contratado", "jornalizado", "jubilado")


class PersonaRol(Base):
    """Vínculo persona <-> tipo. `principal` marca el que se espeja en el enum viejo."""
    __tablename__ = "persona_roles"
    __table_args__ = (
        UniqueConstraint("persona_id", "tipo_id", name="uq_persona_rol"),
        {"mysql_charset": "utf8mb4", "mysql_collate": "utf8mb4_unicode_ci"},
    )

    id = Column(Integer, primary_key=True)
    municipio_id = Column(Integer, ForeignKey("municipios.id", ondelete="CASCADE"), nullable=False, index=True)
    persona_id = Column(Integer, ForeignKey("contactos.id", ondelete="CASCADE"), nullable=False)
    tipo_id = Column(Integer, ForeignKey("persona_tipos.id", ondelete="CASCADE"), nullable=False, index=True)
    principal = Column(Boolean, nullable=False, default=False, server_default="0")
    notas = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    persona = relationship("Contacto", back_populates="roles")
    tipo = relationship("PersonaTipo", back_populates="roles")

    def __repr__(self):
        return f"<PersonaRol p{self.persona_id} t{self.tipo_id}>"
