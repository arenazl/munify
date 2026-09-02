"""Una fila por cada llamada a la IA. El insumo para decidir con datos.

Por que existe: hasta hoy no habia forma de contestar "¿cuanto consume la IA?",
"¿que modelo conviene para clasificar?" ni "¿cuantas veces la IA no contesto y
el usuario ni se entero?". El 2026-09-01 se descubrio que la clasificacion de
reclamos venia devolviendo vacio (gpt-oss se comia el presupuesto razonando) y
no habia UN dato en la base que lo delatara. Con `finish_reason` y
`respuesta_vacia` guardados, eso salta en la primera consulta.

QUE NO SE GUARDA: ni el prompt ni la respuesta. Ni el texto del reclamo del
vecino. Solo el CONSUMO. Es por privacidad y por volumen — la fila pesa ~120
bytes y `audit_logs` ya obligo una vez a vaciar la base (140 MB de 231).

RETENCION: el detalle se poda a los 90 dias; lo que queda para siempre es la
agregada diaria (ver `ia_uso_diario`). Con el volumen de 2026 son ~9 MB al año.
"""
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Date, Integer, String, Index

from core.database import Base


class IaUso(Base):
    """Detalle: una fila por llamada. Se poda a los 90 dias."""

    __tablename__ = "ia_uso"

    id = Column(Integer, primary_key=True, index=True)
    creado = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    # Tenant. Puede ser NULL: /calls es del dueño, no de un municipio.
    municipio_id = Column(Integer, nullable=True, index=True)

    # Que parte de la app llamo: clasificar_reclamo, dashboard_reclamos,
    # dashboard_tramites, dashboard_tesoreria, revision_reclamos,
    # revision_tramites, chat, calls_ia, asignar_dependencias, sugerir_organigrama.
    feature = Column(String(40), nullable=False, index=True)
    modelo = Column(String(60), nullable=False)

    # El consumo, tal como lo reporta el proveedor.
    prompt_tokens = Column(Integer, default=0, nullable=False)
    completion_tokens = Column(Integer, default=0, nullable=False)
    # gpt-oss cobra el razonamiento dentro de completion_tokens; guardarlo
    # aparte es lo que permite comparar modelos que razonan contra los que no.
    reasoning_tokens = Column(Integer, default=0, nullable=False)
    total_tokens = Column(Integer, default=0, nullable=False)

    latencia_ms = Column(Integer, default=0, nullable=False)

    # La salud de la llamada. `finish_reason='length'` + `respuesta_vacia=True`
    # es exactamente la firma del bug de gpt-oss.
    finish_reason = Column(String(20), nullable=True)
    respuesta_vacia = Column(Boolean, default=False, nullable=False)
    # HTTP != 200 (401 key vencida, 429 cuota, 5xx del proveedor).
    error_http = Column(Integer, nullable=True)
    # La app resolvio sin IA (matcheo local, template estatico). Mide cuantas
    # veces la IA no sirvio para nada sin que el usuario se enterara.
    cayo_a_fallback = Column(Boolean, default=False, nullable=False)

    # Cuota que quedaba segun el proveedor, para ver el techo venir de lejos.
    ratelimit_remaining_requests = Column(Integer, nullable=True)
    ratelimit_remaining_tokens = Column(Integer, nullable=True)

    __table_args__ = (
        Index("ix_ia_uso_feature_creado", "feature", "creado"),
        Index("ix_ia_uso_muni_creado", "municipio_id", "creado"),
    )


class IaUsoDiario(Base):
    """Agregado por dia/municipio/feature/modelo. Esto NO se borra nunca: es la
    serie larga con la que se busca el punto dulce tokens/modelo/performance."""

    __tablename__ = "ia_uso_diario"

    id = Column(Integer, primary_key=True, index=True)
    fecha = Column(Date, nullable=False, index=True)
    municipio_id = Column(Integer, nullable=True, index=True)
    feature = Column(String(40), nullable=False)
    modelo = Column(String(60), nullable=False)

    llamadas = Column(Integer, default=0, nullable=False)
    prompt_tokens = Column(Integer, default=0, nullable=False)
    completion_tokens = Column(Integer, default=0, nullable=False)
    reasoning_tokens = Column(Integer, default=0, nullable=False)

    latencia_p50_ms = Column(Integer, default=0, nullable=False)
    latencia_p95_ms = Column(Integer, default=0, nullable=False)

    vacias = Column(Integer, default=0, nullable=False)
    errores = Column(Integer, default=0, nullable=False)
    fallbacks = Column(Integer, default=0, nullable=False)

    __table_args__ = (
        Index("ix_ia_uso_diario_clave", "fecha", "municipio_id", "feature", "modelo", unique=True),
    )
