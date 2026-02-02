from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from core.database import Base

class EmailValidation(Base):
    """Códigos de validación para cambio de email"""
    __tablename__ = "email_validations"

    id = Column(Integer, primary_key=True, index=True)

    # Usuario que solicita el cambio
    usuario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False, index=True)
    usuario = relationship("User")

    # Email nuevo (pendiente de validación)
    nuevo_email = Column(String(255), nullable=False)

    # Código de validación (6 dígitos)
    codigo = Column(String(10), nullable=False)

    # Estado
    validado = Column(Boolean, default=False)
    usado = Column(Boolean, default=False)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    expires_at = Column(DateTime(timezone=True), nullable=False)  # Expira en 15 minutos
    validated_at = Column(DateTime(timezone=True), nullable=True)
