from datetime import date, datetime
from typing import Literal, Optional, List

from pydantic import BaseModel

# DONDE aparece la publicacion en la app del vecino. No es una etiqueta: es
# el bloque del feed en el que sale. Los tres son lo mismo —imagen, titulo,
# descripcion— y por eso viven en UNA tabla y se cargan en UNA pantalla.
#   destacado -> el banner grande de arriba (rota si hay varios)
#   novedad   -> las tarjetas del medio
# Las OBRAS no estan aca: viven en Tesoreria como proyectos, con sus gastos
# imputados, y se publican con un tilde en esa misma pantalla. Duplicarlas
# como noticia seria tener la misma obra en dos lugares.
# Se aceptan los valores viejos (aviso/noticia/alerta) para no romper lo ya
# cargado: el front los trata como "novedad".
TipoAviso = Literal["destacado", "novedad", "aviso", "noticia", "alerta"]


class NoticiaBase(BaseModel):
    titulo: str
    descripcion: str
    imagen_url: Optional[str] = None
    tipo: TipoAviso = "novedad"
    fecha_desde: Optional[date] = None
    fecha_hasta: Optional[date] = None
    fijado: bool = False
    # A quien: lista vacia = todo el municipio. Con barrios, solo esos.
    barrio_ids: List[int] = []
    # Cada cuanto: NULL = una sola vez. semanal | quincenal | mensual
    recurrencia: Optional[str] = None
    # Para la semanal: "1,4" = martes y viernes (0=lunes).
    dias_semana: Optional[str] = None


class NoticiaCreate(NoticiaBase):
    """El `municipio_id` NO viaja en el payload (antes si): sale del usuario
    autenticado. Con el cliente eligiendo el municipio, un admin podia
    publicar en el tenant de otro."""


class NoticiaUpdate(BaseModel):
    titulo: Optional[str] = None
    descripcion: Optional[str] = None
    imagen_url: Optional[str] = None
    tipo: Optional[TipoAviso] = None
    fecha_desde: Optional[date] = None
    fecha_hasta: Optional[date] = None
    fijado: Optional[bool] = None
    # None = no se toca. Lista (aunque este vacia) = se reemplaza entera.
    barrio_ids: Optional[List[int]] = None
    recurrencia: Optional[str] = None
    dias_semana: Optional[str] = None
    activo: Optional[bool] = None


class NoticiaResponse(NoticiaBase):
    id: int
    # Como se lee el cronograma, ya escrito: "Todos los martes y viernes".
    # Lo arma el backend para que las tres pantallas del vecino no repitan
    # la misma logica de traduccion cada una a su manera.
    cronograma_texto: Optional[str] = None
    municipio_id: int
    activo: bool
    enviado_at: Optional[datetime] = None
    enviados_count: int = 0
    created_at: datetime

    class Config:
        from_attributes = True


class EnvioResponse(BaseModel):
    """Resultado de avisar: cuantos vecinos recibieron el push."""
    enviados: int
    ya_enviado: bool = False
