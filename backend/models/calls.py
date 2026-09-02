"""El directorio de llamados (`/calls`), del lado del servidor.

Hasta el 2026-09-01 la app era un HTML publico y TODO lo que se anotaba vivia
en el `localStorage` del navegador: cada dispositivo tenia su propia copia y
nadie veia lo del otro. Con dos personas llamando a los mismos 154 municipios
eso es un choque garantizado — los dos llaman al mismo intendente y ninguno ve
la nota del otro.

Estas tablas son el pipeline COMPARTIDO. El prefijo `calls_` no es decorativo:
Infra excluye ese prefijo cuando refresca la base de QA clonando produccion,
porque esto es data comercial del dueño y no data de municipios.

`muni_key` es el `id` del directorio (`pais-localidad` normalizado, ej.
`ar-san-pedro`), no un FK: los municipios del directorio son los 154 del
relevamiento comercial y NO son los tenants de la app.
"""
from datetime import datetime

from sqlalchemy import Boolean, Column, Date, DateTime, Integer, String, Text, Index

from core.database import Base


class CallsUsuario(Base):
    """Quien puede entrar. Son dos personas, no un sistema de usuarios: por eso
    no se cuelga del `users` de la app, que es multi-tenant y municipal."""

    __tablename__ = "calls_usuarios"

    id = Column(Integer, primary_key=True, index=True)
    usuario = Column(String(40), unique=True, nullable=False, index=True)
    # El que se muestra en el historial: "Lucas llamo el martes".
    nombre = Column(String(60), nullable=False)
    password_hash = Column(String(255), nullable=False)
    activo = Column(Boolean, default=True, nullable=False)
    creado = Column(DateTime, default=datetime.utcnow, nullable=False)
    ultimo_acceso = Column(DateTime, nullable=True)


class CallsRegistro(Base):
    """El estado ACTUAL de cada municipio del directorio. Uno por municipio."""

    __tablename__ = "calls_registro"

    id = Column(Integer, primary_key=True, index=True)
    muni_key = Column(String(80), unique=True, nullable=False, index=True)

    # '' | 'contactado' | 'interesado' | 'demo' | 'no' | ... lo define el front.
    # String libre a proposito: los estados comerciales cambian seguido y no
    # vale la pena una migracion por cada uno (regla de codigo resiliente).
    estado = Column(String(30), default="", nullable=False)
    notas = Column(Text, nullable=True)
    # Con quien hablo (secretario, mesa de entrada, el intendente).
    quien = Column(String(120), nullable=True)
    proximo = Column(Date, nullable=True)

    # Quien lo toco ultimo. Es lo que evita que los dos llamen al mismo.
    actualizado_por = Column(String(60), nullable=True)
    actualizado_en = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class CallsEvento(Base):
    """El historial: una linea por cosa que paso. Lo que en el localStorage era
    `r.hist`, ahora con AUTOR — sin autor, un pipeline compartido no sirve."""

    __tablename__ = "calls_evento"

    id = Column(Integer, primary_key=True, index=True)
    muni_key = Column(String(80), nullable=False, index=True)
    # 'llamada' | 'nota' | 'estado' | 'agenda'
    tipo = Column(String(20), nullable=False)
    texto = Column(Text, nullable=False)
    autor = Column(String(60), nullable=False)
    creado = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    __table_args__ = (Index("ix_calls_evento_muni_creado", "muni_key", "creado"),)
