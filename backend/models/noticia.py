from sqlalchemy import Column, Integer, String, Text, DateTime, Date, Boolean, ForeignKey
from sqlalchemy.sql import func
from core.database import Base


class Noticia(Base):
    """Lo que el municipio le cuenta al vecino sin que el vecino pregunte.

    Es la unica tabla del modulo Comunicacion: un AVISO (corte de agua),
    una NOTICIA (se inauguro la plaza) y una ALERTA (temporal) son la misma
    cosa con distinto peso, no tres tablas. Ver
    `docs/comunicacion/01-modulo-comunicacion.md`.

    La tabla ya existia (con titulo/descripcion/imagen) y la mostraban la home
    del vecino, la home publica y la app mobile — pero no habia pantalla para
    cargarla y estaba VACIA en todos los municipios. La Etapa 1 le agrega lo
    que le faltaba para servir: vigencia, peso y constancia de envio.
    """

    __tablename__ = "noticias"

    id = Column(Integer, primary_key=True, index=True)
    municipio_id = Column(Integer, ForeignKey("municipios.id"), nullable=False, index=True)
    titulo = Column(String(200), nullable=False)
    descripcion = Column(Text, nullable=False)
    imagen_url = Column(String(500), nullable=True)

    # --- Modulo Comunicacion, Etapa 1 (2026-08-29) ---

    # DONDE sale en la app del vecino: destacado (el banner grande de arriba,
    # que rota si hay varios) o novedad (las tarjetas del medio). Las OBRAS no
    # estan aca: viven en Tesoreria como proyectos y se publican desde ahi.
    tipo = Column(String(20), nullable=False, default="novedad", server_default="novedad")

    # Vigencia: el aviso del corte de agua se apaga SOLO. Ambas nullable =
    # sin vencimiento (una noticia comun vive hasta que la bajen).
    fecha_desde = Column(Date, nullable=True)
    fecha_hasta = Column(Date, nullable=True)

    # Lo importante queda arriba del feed, sin importar la fecha.
    fijado = Column(Boolean, nullable=False, default=False, server_default="0")

    # Constancia del envio: con esto el boton sabe que ya se aviso y no
    # vuelve a mandarlo (idempotencia visible para el operador).
    enviado_at = Column(DateTime(timezone=True), nullable=True)
    enviados_count = Column(Integer, nullable=False, default=0, server_default="0")

    creador_id = Column(Integer, ForeignKey("usuarios.id"), nullable=True)

    activo = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
