from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel

# aviso | noticia | alerta. Literal y no Enum de Python: el front manda el
# string y no hay logica de negocio colgada del tipo, solo peso visual.
TipoAviso = Literal["aviso", "noticia", "alerta"]


class NoticiaBase(BaseModel):
    titulo: str
    descripcion: str
    imagen_url: Optional[str] = None
    tipo: TipoAviso = "aviso"
    fecha_desde: Optional[date] = None
    fecha_hasta: Optional[date] = None
    fijado: bool = False


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
    activo: Optional[bool] = None


class NoticiaResponse(NoticiaBase):
    id: int
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
