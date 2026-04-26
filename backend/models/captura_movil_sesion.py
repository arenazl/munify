"""Sesiones de "captura móvil" — handoff PC ↔ celular para validar identidad.

Flujo:
  1. Operador en el Mostrador apreta "Validar identidad con celular".
  2. Se crea una sesión + sesión Didit; el backend devuelve { handoff_token,
     didit_url, qr_value }.
  3. Operador escanea el QR con su celular y se redirige a la URL de Didit.
  4. Didit toma selfie + DNI + liveness + RENAPER en el celular.
  5. Cuando termina, el backend recibe el callback de Didit (vendor_data =
     handoff_token), consulta la decisión y emite un WS al operador.
  6. La PC del operador recibe el WS, cierra el modal y autocompleta el form.

Estados:
  - esperando         : sesión creada, operador todavía no abrió la URL
  - en_curso          : Didit reportó "In Progress" (capturando en el celu)
  - completada        : Didit Approved → datos filiatorios extraídos
  - rechazada         : Didit Declined / Failed
  - cancelada         : operador la canceló desde la PC
  - expirada          : pasaron > 10 minutos sin completar
"""
from sqlalchemy import (
    Column, Integer, String, DateTime, Enum as SAEnum, ForeignKey, JSON, Index,
)
from sqlalchemy.sql import func
from core.database import Base
import enum


class EstadoCapturaMovil(str, enum.Enum):
    ESPERANDO = "esperando"
    EN_CURSO = "en_curso"
    COMPLETADA = "completada"
    RECHAZADA = "rechazada"
    CANCELADA = "cancelada"
    EXPIRADA = "expirada"


class ModoCapturaMovil(str, enum.Enum):
    # Único modo en esta primera versión: KYC completo via Didit en el celu.
    # Pensado como enum por si más adelante agregamos un modo "identificación"
    # con captura local (sin liveness) — ver discusión en chat.
    KYC_COMPLETO = "kyc_completo"


class CapturaMovilSesion(Base):
    __tablename__ = "captura_movil_sesiones"

    id = Column(Integer, primary_key=True, index=True)

    # Token opaco que viaja en el QR / deep link. Único, una sola vez.
    handoff_token = Column(String(64), unique=True, nullable=False, index=True)

    # Operador que inició la sesión (autorizado a recibir el resultado por WS).
    operador_user_id = Column(
        Integer, ForeignKey("usuarios.id", ondelete="CASCADE"), nullable=False, index=True
    )
    municipio_id = Column(Integer, ForeignKey("municipios.id"), nullable=True, index=True)

    # Vecino que se está validando — todavía puede no existir como User si es
    # un alta nueva (en ese caso solo conocemos el DNI tipeado por el operador).
    vecino_user_id = Column(Integer, ForeignKey("usuarios.id"), nullable=True, index=True)
    vecino_dni = Column(String(20), nullable=True)

    modo = Column(
        SAEnum(ModoCapturaMovil, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
        default=ModoCapturaMovil.KYC_COMPLETO,
    )
    estado = Column(
        SAEnum(EstadoCapturaMovil, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
        default=EstadoCapturaMovil.ESPERANDO,
        index=True,
    )

    # Bridge con Didit: vendor_data = handoff_token, así el callback nos lo
    # devuelve y podemos correlacionar.
    didit_session_id = Column(String(100), nullable=True, index=True)
    didit_url = Column(String(500), nullable=True)
    didit_decision_json = Column(JSON, nullable=True)  # blob completo para auditoría

    # Datos filiatorios extraídos al completarse (solo si Approved).
    payload_json = Column(JSON, nullable=True)

    motivo_rechazo = Column(String(255), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    completed_at = Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index("idx_captura_movil_op_estado", "operador_user_id", "estado"),
    )
