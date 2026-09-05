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

    # Lo que el vendedor corrigio a mano cuando el numero curado no atendio:
    # {"+54 353 4901108": "+54 353 4901199"}. Vive aca y no en `calls_municipio`
    # porque la ficha es de la curaduria y esto es trabajo de campo; se aplica
    # ENCIMA de la ficha al servirla.
    telefonos_corregidos = Column(Text, nullable=True)
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


class CallsMunicipio(Base):
    """LAS FICHAS CURADAS, del lado del servidor (2026-09-05).

    Hasta hoy las 177 fichas viajaban EMBEBIDAS en el html que genera
    `munify-calls/scripts/build_calls.py`: cada publicacion las reescribia y la
    pagina no le preguntaba nada al servidor. Con dos o tres vendedores llamando
    eso no alcanza — el que corrige un telefono en su celular es el unico que lo
    ve, y no hay forma de mostrar un ranking entre vendedores.

    OJO CON EL SENTIDO DE LA FLECHA: la fuente de verdad de la FICHA sigue
    siendo la curaduria (`scripts/entregas/2-curados-fable/todos.json`), y esta
    tabla es su ESPEJO. Se llena con `backend/scripts/importar_calls_fichas.py`
    cada vez que se cura un lote. Nadie edita una ficha por la API: lo que el
    vendedor corrige (un telefono que no atiende) vive en `calls_registro`, que
    es SU trabajo, y se aplica ENCIMA de la ficha al servirla.

    `muni_key` es el `id` del directorio (`argentina-ucacha`), el mismo que usan
    `calls_registro` y `calls_evento`. No es un FK a `municipios`: estos son
    prospectos comerciales, no tenants de la app.
    """

    __tablename__ = "calls_municipio"

    id = Column(Integer, primary_key=True, index=True)
    muni_key = Column(String(80), unique=True, nullable=False, index=True)
    municipio = Column(String(160), nullable=False)
    provincia = Column(String(80), nullable=False, index=True)
    pais = Column(String(40), default="Argentina", nullable=False, index=True)
    tipo_gobierno = Column(String(40), nullable=True)
    # Los telefonos CURADOS, principal primero, como JSON: ["+54 353 4901108", ...].
    # Se guarda el array entero y no una columna por numero porque la cantidad
    # varia y la pagina los muestra todos como links `tel:`.
    telefonos = Column(Text, nullable=True)
    direccion = Column(String(300), nullable=True)
    direccion_fuente = Column(String(40), nullable=True)
    web = Column(String(400), nullable=True)
    habitantes = Column(String(40), nullable=True)
    intendente = Column(String(160), nullable=True)
    cargo = Column(String(120), nullable=True)
    partido = Column(String(160), nullable=True)
    confianza = Column(String(20), nullable=True)
    fuente = Column(Text, nullable=True)
    nota = Column(Text, nullable=True)
    senal = Column(String(20), nullable=True)
    llamar_desde = Column(String(60), nullable=True)
    revalidar_el = Column(String(200), nullable=True)
    economia = Column(Text, nullable=True)
    digital = Column(Text, nullable=True)
    estructura = Column(Text, nullable=True)
    color = Column(Text, nullable=True)
    # [{id, texto, tono, por}] — los chips de la ficha, ya ordenados.
    etiquetas = Column(Text, nullable=True)
    # {score, motivos} — cuanto vale llamarlo hoy. `ranking_score` sale de aca y
    # se guarda aparte para poder ordenar en SQL sin parsear el JSON.
    ranking = Column(Text, nullable=True)
    ranking_score = Column(Integer, default=0, nullable=False, index=True)
    calidad = Column(Text, nullable=True)
    origen = Column(Text, nullable=True)
    verificado_el = Column(String(20), nullable=True)
    # Cuando lo escribio el importador: sirve para saber si la base quedo atras
    # de la curaduria.
    importado_en = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (Index("ix_calls_municipio_pais_prov", "pais", "provincia"),)
