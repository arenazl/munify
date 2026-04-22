from sqlalchemy import Column, Integer, String, Boolean, DateTime, Date, Enum, ForeignKey, JSON
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
    # Identidad verificada por un medio externo (KYC facial / email verificado
    # / SMS OTP). Mientras sea False, el endpoint `/auth/register` permite
    # "tomar" o "retomar" la cuenta con sólo DNI+email+password — la idea es
    # que el vecino real pueda reclamar cuentas ghost (creadas por empleados
    # en ventanilla) sin verificación externa, confiando en que DNI+email
    # que tipeó alcanzan como prueba de identidad por ahora.
    #
    # Cuando se implemente verificación (KYC con Didit/Renaper, o email link),
    # al completarse exitosamente este flag pasa a True y desde ese momento
    # el DNI queda "cerrado" — retomas posteriores se rechazan y el vecino
    # tiene que pasar por "Olvidé mi contraseña".
    cuenta_verificada = Column(Boolean, default=False, nullable=False)

    # Nivel de verificacion de identidad (KYC Didit):
    #   0 = sin verificar (solo email+password)
    #   1 = email verificado (OTP)
    #   2 = identidad verificada (DNI + selfie + liveness, via Didit)
    # Los tramites pueden requerir un minimo (ej. habilitacion comercial => 2).
    nivel_verificacion = Column(Integer, default=0, nullable=False)

    # Datos filiatorios verificados (solo se llenan en nivel_verificacion=2).
    # No se piden en registro normal — vienen del proveedor KYC.
    sexo = Column(String(1), nullable=True)  # "M" | "F" | "X"
    fecha_nacimiento = Column(Date, nullable=True)
    nacionalidad = Column(String(10), nullable=True)  # ISO-3 (ARG, CHL, ...)

    # Referencia a la sesion de Didit que verifico este user (trazabilidad).
    didit_session_id = Column(String(100), nullable=True, index=True)
    verificado_at = Column(DateTime(timezone=True), nullable=True)

    # Fase 5 bundle — modo de verificacion KYC:
    #   "self_service": el vecino hizo el flow desde la app
    #   "assisted":     un operador de ventanilla lo verifico presencialmente
    kyc_modo = Column(String(20), nullable=True)  # None si aun no verificado
    kyc_operador_id = Column(Integer, ForeignKey("usuarios.id"), nullable=True)

    rol = Column(Enum(RolUsuario, values_callable=lambda x: [e.value for e in x]), default=RolUsuario.VECINO, nullable=False)
    activo = Column(Boolean, default=True)

    # Preferencias de notificaciones push (JSON con booleanos para cada tipo)
    notificacion_preferencias = Column(JSON, default=DEFAULT_NOTIFICATION_PREFERENCES)

    # Relacion con empleado (si es usuario empleado) - DEPRECATED
    empleado_id = Column(Integer, ForeignKey("empleados.id"), nullable=True)
    empleado = relationship("Empleado", back_populates="miembros")

    # Relación con dependencia (para usuarios de tipo dependencia/área)
    municipio_dependencia_id = Column(Integer, ForeignKey("municipio_dependencias.id"), nullable=True, index=True)
    dependencia = relationship("MunicipioDependencia")

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relaciones
    reclamos_creados = relationship("Reclamo", back_populates="creador", foreign_keys="Reclamo.creador_id")
    reclamos_unidos = relationship("ReclamoPersona", back_populates="usuario")
    notificaciones = relationship("Notificacion", back_populates="usuario")
    solicitudes = relationship("Solicitud", back_populates="solicitante")
    push_subscriptions = relationship("PushSubscription", back_populates="user")
    consultas_guardadas = relationship("ConsultaGuardada", back_populates="usuario")
