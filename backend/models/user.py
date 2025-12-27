from sqlalchemy import Column, Integer, String, Boolean, DateTime, Enum, ForeignKey, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from core.database import Base
from .enums import RolUsuario

# Preferencias de notificación por defecto (todas activas)
# Las claves coinciden con los tipos en config/notificaciones.json
DEFAULT_NOTIFICATION_PREFERENCES = {
    # Para vecinos
    "reclamo_recibido": True,
    "reclamo_asignado": True,
    "cambio_estado": True,
    "reclamo_resuelto": True,
    "nuevo_comentario": True,
    "reclamo_rechazado": True,
    # Para trámites (vecinos)
    "tramite_creado": True,
    "tramite_asignado": True,
    "tramite_cambio_estado": True,
    "tramite_aprobado": True,
    "tramite_rechazado": True,
    # Para empleados
    "asignacion_empleado": True,
    "comentario_vecino": True,
    "cambio_prioridad": True,
    "reclamo_reabierto": True,
    # Para supervisores
    "reclamo_nuevo_supervisor": True,
    "reclamo_resuelto_supervisor": True,
    "reclamo_rechazado_supervisor": True,
    "pendiente_confirmacion": True,
    "sla_vencido": True,
    "en_progreso": True,
    "tramite_nuevo_supervisor": True,
}

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

    # Preferencias de notificaciones push (JSON con booleanos para cada tipo)
    notificacion_preferencias = Column(JSON, default=DEFAULT_NOTIFICATION_PREFERENCES)

    # Relacion con empleado (si es usuario empleado)
    empleado_id = Column(Integer, ForeignKey("empleados.id"), nullable=True)
    empleado = relationship("Empleado", back_populates="miembros")

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relaciones
    reclamos_creados = relationship("Reclamo", back_populates="creador", foreign_keys="Reclamo.creador_id")
    notificaciones = relationship("Notificacion", back_populates="usuario")
    solicitudes = relationship("Solicitud", back_populates="solicitante")
    push_subscriptions = relationship("PushSubscription", back_populates="user")
