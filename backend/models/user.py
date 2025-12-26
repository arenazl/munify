from sqlalchemy import Column, Integer, String, Boolean, DateTime, Enum, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from core.database import Base
from .enums import RolUsuario

class User(Base):
    __tablename__ = "usuarios"

    id = Column(Integer, primary_key=True, index=True)

    # Multi-tenant: FK al municipio
    municipio_id = Column(Integer, ForeignKey("municipios.id"), nullable=True, index=True)
    municipio = relationship("Municipio", back_populates="usuarios")

    email = Column(String(255), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    nombre = Column(String(100), nullable=False)
    apellido = Column(String(100), nullable=False)
    telefono = Column(String(20), nullable=True)
    dni = Column(String(20), nullable=True)
    direccion = Column(String(255), nullable=True)
    es_anonimo = Column(Boolean, default=False)  # Usuario anónimo (identidad oculta para el municipio)
    rol = Column(Enum(RolUsuario, values_callable=lambda x: [e.value for e in x]), default=RolUsuario.VECINO, nullable=False)
    activo = Column(Boolean, default=True)

    # Relacion con empleado (si es usuario empleado)
    empleado_id = Column(Integer, ForeignKey("empleados.id"), nullable=True)
    empleado = relationship("Empleado", back_populates="miembros")

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relaciones
    reclamos_creados = relationship("Reclamo", back_populates="creador", foreign_keys="Reclamo.creador_id")
    notificaciones = relationship("Notificacion", back_populates="usuario")
    tramites = relationship("Tramite", back_populates="solicitante")
    push_subscriptions = relationship("PushSubscription", back_populates="user")
