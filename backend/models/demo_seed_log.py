# -*- coding: utf-8 -*-
"""Bitacora de lo que hizo la semilla en cada demo creada.

POR QUE UNA TABLA PROPIA Y NO `audit_logs`
------------------------------------------
`audit_logs` es el registro de REQUESTS: una fila por llamada HTTP, con method,
path, status y el body sanitizado. Ya tiene 277k filas y rota con criterio de
auditoria. Meter aca el paso a paso de la semilla obligaria a:

  - filtrar 277k filas por `action='seed_demo'` en cada consulta del panel,
  - guardar la estructura de pasos en `response_summary`, un campo que existe
    para OTRA cosa y que nadie garantiza que no se recorte,
  - atar la vida del log a la politica de retencion de la auditoria, cuando lo
    que el super admin quiere es justamente mirar demos viejas y comparar.

Y sobre todo: **el log tiene que sobrevivir al fallo**. Si la creacion revienta
a mitad, la transaccion del alta se revierte; una fila escrita en esa misma
sesion se iria con ella --- perdiendo exactamente el caso que hay que mirar. Con
tabla propia el registro se escribe en su PROPIA sesion y queda commiteado pase
lo que pase (ver `services/seed_log.py`).

`municipio_id` es nullable a proposito: si el alta fallo antes de crear la fila
del municipio, o si el municipio despues se borra (las demos se borran seguido),
el log tiene que quedar igual. Por eso tambien se copia el nombre y el codigo.
"""
from sqlalchemy import Column, DateTime, Integer, JSON, String, Text, func

from core.database import Base


class DemoSeedLog(Base):
    __tablename__ = "demo_seed_logs"

    id = Column(Integer, primary_key=True, index=True)
    created_at = Column(DateTime, server_default=func.now(), index=True)

    # Sin FK: el log tiene que sobrevivir al borrado de la demo.
    municipio_id = Column(Integer, nullable=True, index=True)
    municipio_nombre = Column(String(200), nullable=False)
    codigo = Column(String(50), nullable=True)
    pais = Column(String(2), nullable=True)
    provincia = Column(String(150), nullable=True)

    # De donde salio el alta: 'endpoint' (la pantalla /demo) o 'script'.
    origen = Column(String(30), nullable=False, default="endpoint")

    # ok | degradado | fallo
    estado = Column(String(20), nullable=False, default="ok", index=True)
    duracion_ms = Column(Integer, nullable=False, default=0)

    # Lista de pasos: [{nombre, estado, duracion_ms, motivo, detalle:{...}}]
    pasos = Column(JSON, nullable=True)
    # Lo que hay que poder leer sin abrir el detalle: counts y los NOMBRES
    # reales que quedaron (barrios y ejemplos de calles).
    resumen = Column(JSON, nullable=True)
    error_message = Column(Text, nullable=True)

    def __repr__(self):
        return f"<DemoSeedLog {self.municipio_nombre} {self.estado}>"
