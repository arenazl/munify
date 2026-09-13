"""Proyecto financiero del modulo Tesoreria.

Un proyecto agrupa N gastos de distintos proveedores/contratistas.
Ejemplo: "Departamento para el vecindario", "Repavimentacion Av X".

Un gasto puede imputarse a 0, 1 o varios proyectos, repartiendo el
monto total entre ellos (no necesariamente toda la plata se imputa,
puede haber un remanente sin proyecto).

Relacion N:M con gastos via tabla gasto_proyectos (monto_asignado en pesos).
"""
import enum
from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime, Date, Text,
    Numeric, Enum, Float, ForeignKey, UniqueConstraint,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from core.database import Base


class EstadoProyecto(str, enum.Enum):
    ACTIVO = "activo"
    PAUSADO = "pausado"
    FINALIZADO = "finalizado"


# --- Modulo OBRAS (plan docs/tesoreria/04-plan-integral-persona-y-obras.md) ---
# Obra = un Proyecto con ejecucion fisica. Misma tabla, dos tipos, una pantalla.
# Los proyectos existentes nacen `programa` (server_default) y el municipio marca
# cuales son obras: ningun gasto ni imputacion se mueve. San Pedro Norte ya usa
# Proyectos como obras (Predio municipal, Vivienda Semilla, Salon de actos).
class TipoProyecto(str, enum.Enum):
    OBRA = "obra"            # etapas, avance, contratista, plazo
    PROGRAMA = "programa"    # centro de costo: junta gastos y nada mas


class ModalidadObra(str, enum.Enum):
    CONTRATO = "contrato"              # un contratista presenta certificados
    ADMINISTRACION = "administracion"  # cuadrilla propia, materiales del deposito


# Como llego un gasto a una etapa. El sistema PROPONE y la persona confirma;
# nunca imputa en silencio salvo cuando el gasto nace desde la obra o de un
# certificado (regla del dueno, 2026-09-12).
class OrigenImputacion(str, enum.Enum):
    MANUAL = "manual"          # lo eligio una persona
    AUTOMATICA = "automatica"  # nacio desde la obra o de un certificado
    SUGERIDA = "sugerida"      # propuesta por fecha/senales, pendiente de confirmar


class Proyecto(Base):
    __tablename__ = "proyectos"

    id = Column(Integer, primary_key=True, index=True)

    # Multi-tenant
    municipio_id = Column(Integer, ForeignKey("municipios.id"), nullable=False, index=True)

    nombre = Column(String(150), nullable=False, index=True)
    descripcion = Column(Text, nullable=True)

    presupuesto = Column(Numeric(15, 2), nullable=True)

    fecha_inicio = Column(Date, nullable=True)
    fecha_fin = Column(Date, nullable=True)

    # --- Obras (F0 esquema). Todo nullable o con default: el backend publicado
    # sigue insertando proyectos sin conocer estas columnas.
    tipo = Column(String(20), nullable=False, default=TipoProyecto.PROGRAMA.value,
                  server_default=TipoProyecto.PROGRAMA.value, index=True)
    tipo_obra = Column(String(60), nullable=True)      # pavimento, cordon cuneta, agua... (texto libre por ahora)
    modalidad = Column(String(20), nullable=True)      # contrato | administracion
    # El contratista es una Persona (tipo proveedor o contratista). Apunta a
    # `contactos`, como todas las columnas de enganche de Persona: cuando la
    # tabla se renombre, la clave la sigue sola.
    contratista_persona_id = Column(Integer, ForeignKey("contactos.id", ondelete="SET NULL"), nullable=True, index=True)
    expediente = Column(String(60), nullable=True)
    fuente_financiamiento = Column(String(120), nullable=True)   # municipal, provincial, nacional, mixta + programa
    monto_contrato = Column(Numeric(15, 2), nullable=True)      # presupuesto vigente = contrato + adicionales
    plazo_dias = Column(Integer, nullable=True)
    fecha_inicio_real = Column(Date, nullable=True)
    fecha_fin_real = Column(Date, nullable=True)
    inspector_usuario_id = Column(Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True)
    barrio_id = Column(Integer, ForeignKey("barrios.id", ondelete="SET NULL"), nullable=True, index=True)

    estado = Column(
        Enum(EstadoProyecto, values_callable=lambda x: [e.value for e in x]),
        default=EstadoProyecto.ACTIVO,
        nullable=False,
        index=True,
    )

    activo = Column(Boolean, default=True, nullable=False)

    # --- Modulo Comunicacion, Etapa 2: OBRAS A LA VISTA (2026-08-29) ---
    # El proyecto ya existia como contenedor de gastos (puertas adentro).
    # Estos campos son lo que le falta para poder MOSTRARSELO al vecino.

    # El municipio elige cual publica. Default False: publicar es un acto
    # deliberado, no algo que pasa por cargar un proyecto en tesoreria.
    publico = Column(Boolean, nullable=False, default=False, server_default="0")

    # Como viene la obra, en criollo. Es distinto del `estado` contable
    # (activo/pausado/finalizado): "en ejecucion" le habla al vecino.
    estado_obra = Column(String(20), nullable=True)   # por_empezar | en_ejecucion | terminada

    # 0..100. NULL = el municipio todavia no lo cargo, y entonces la tarjeta
    # no muestra barra: un 0% inventado seria peor que no decir nada.
    #
    # ESTE es el avance REAL, el de adentro: lo lleva Tesoreria y es el que
    # mira el municipio para gestionar. NUNCA se publica tal cual.
    avance = Column(Integer, nullable=True)

    # Y este es el que ve el vecino. Son dos campos y no uno por una razon
    # concreta: el avance real y lo que el intendente decide comunicar no
    # tienen por que coincidir, y cuando no coinciden, publicar NO puede
    # ensuciar el numero con el que el municipio se maneja adentro.
    # NULL = no se publica barra (la obra igual se ve, con su estado).
    # Al marcarla publica, la pantalla de Comunicacion lo precarga con el
    # avance real como PLANTILLA — despues es de Comunicacion, no de
    # Tesoreria, y editarlo no toca `avance`.
    avance_publicado = Column(Integer, nullable=True)

    foto_url = Column(String(500), nullable=True)

    # Para que la obra caiga en el mapa que ya existe.
    latitud = Column(Float, nullable=True)
    longitud = Column(Float, nullable=True)

    # La plata es harina de otro costal: se publica el AVANCE, no el gasto.
    # Mostrar cuanto salio abre una discusion que el intendente tiene que
    # poder elegir, asi que va apagado por defecto y aparte de `publico`.
    mostrar_monto = Column(Boolean, nullable=False, default=False, server_default="0")

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    asignaciones = relationship(
        "GastoProyecto",
        back_populates="proyecto",
        cascade="all, delete-orphan",
    )
    etapas = relationship(
        "ObraEtapa",
        back_populates="proyecto",
        cascade="all, delete-orphan",
        order_by="ObraEtapa.orden",
    )

    def __repr__(self):
        return f"<Proyecto {self.id} {self.nombre}>"


class ObraEtapa(Base):
    """Etapa de una obra: incidencia sobre el total, fechas previstas y reales, avance.

    Avance real de la obra = suma(avance_pct * incidencia_pct) / 100. Sin etapas, la
    obra tiene una sola etapa implicita ("Ejecucion") y el avance sigue siendo manual
    en `Proyecto.avance`. Lo que derive de etapas alimenta `avance`, nunca
    `avance_publicado` (decision de Comunicacion, 2026-08-29).
    """
    __tablename__ = "obra_etapas"
    __table_args__ = (
        UniqueConstraint("proyecto_id", "orden", name="uq_obra_etapa_orden"),
        {"mysql_charset": "utf8mb4", "mysql_collate": "utf8mb4_unicode_ci"},
    )

    id = Column(Integer, primary_key=True)
    municipio_id = Column(Integer, ForeignKey("municipios.id", ondelete="CASCADE"), nullable=False, index=True)
    proyecto_id = Column(Integer, ForeignKey("proyectos.id", ondelete="CASCADE"), nullable=False, index=True)

    orden = Column(Integer, nullable=False, default=1)
    nombre = Column(String(120), nullable=False)
    descripcion = Column(Text, nullable=True)

    # Peso de la etapa en el total de la obra. Las incidencias de una obra suman 100.
    incidencia_pct = Column(Numeric(5, 2), nullable=False, default=0, server_default="0")
    avance_pct = Column(Integer, nullable=False, default=0, server_default="0")   # 0..100
    estado = Column(String(20), nullable=False, default="pendiente", server_default="pendiente")  # pendiente | en_curso | terminada | parada

    fecha_inicio_prevista = Column(Date, nullable=True)
    fecha_fin_prevista = Column(Date, nullable=True)
    fecha_inicio_real = Column(Date, nullable=True)
    fecha_fin_real = Column(Date, nullable=True)

    # Presupuesto de la etapa, si la obra lo reparte. NULL = no se reparte.
    monto_previsto = Column(Numeric(15, 2), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    proyecto = relationship("Proyecto", back_populates="etapas")

    def __repr__(self):
        return f"<ObraEtapa p{self.proyecto_id} #{self.orden} {self.nombre}>"


class GastoProyecto(Base):
    """Asociacion N:M entre gastos y proyectos con monto imputado.

    monto_asignado es la porcion del gasto que se imputa al proyecto.
    SUM(monto_asignado) por gasto <= gasto.monto_pesos (se valida en API).
    """
    __tablename__ = "gasto_proyectos"
    __table_args__ = (
        UniqueConstraint("gasto_id", "proyecto_id", name="uq_gasto_proyecto"),
    )

    id = Column(Integer, primary_key=True, index=True)
    gasto_id = Column(Integer, ForeignKey("gastos.id", ondelete="CASCADE"), nullable=False, index=True)
    proyecto_id = Column(Integer, ForeignKey("proyectos.id", ondelete="CASCADE"), nullable=False, index=True)

    monto_asignado = Column(Numeric(15, 2), nullable=False)

    # --- Obras (F0 esquema): a que etapa fue esta parte del gasto, y como llego.
    # NULL = sin etapa (los 126 de SPN nacen asi; la etapa se propone despues).
    # `origen` con default `manual`: todo lo que ya existe lo eligio una persona.
    etapa_id = Column(Integer, ForeignKey("obra_etapas.id", ondelete="SET NULL"), nullable=True, index=True)
    origen = Column(String(12), nullable=False, default=OrigenImputacion.MANUAL.value,
                    server_default=OrigenImputacion.MANUAL.value)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    gasto = relationship("Gasto", back_populates="proyectos_asignados")
    etapa = relationship("ObraEtapa", foreign_keys=[etapa_id])
    proyecto = relationship("Proyecto", back_populates="asignaciones")

    def __repr__(self):
        return f"<GastoProyecto g{self.gasto_id} p{self.proyecto_id} ${self.monto_asignado}>"
