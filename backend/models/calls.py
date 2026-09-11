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
from sqlalchemy.dialects import mysql

from core.database import Base

# El render de una ficha pasa comodo los 64 KB que aguanta un TEXT de MySQL, y el
# truncado no avisa: guarda lo que entra y descarta el resto en silencio.
LARGO = Text().with_variant(mysql.LONGTEXT(), "mysql")


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

    LA FLECHA SE DIO VUELTA (2026-09-08). Hasta ahora la fuente de verdad era
    el JSON de la curaduria (`scripts/entregas/2-curados-fable/todos.json`) y
    esta tabla su espejo. Desde hoy manda la TABLA y el JSON es un archivo DE
    PASO: el padron lo siembra, el build lo lee. El motivo es que la pantalla
    empezo a ESCRIBIR --el vendedor toca un boton, el sistema le busca el
    telefono-- y un archivo no aguanta dos que escriben a la vez: el ultimo
    gana y el otro pierde sin enterarse.

    Lo que el vendedor corrige sobre la marcha (un telefono que no atiende)
    sigue viviendo en `calls_registro`, que es SU trabajo de campo, y se aplica
    ENCIMA de la ficha al servirla.

    El detalle de la curacion --los hechos, los tags, el crudo del que salieron
    y la foto de cada ponderacion-- vive en `models/calls_curacion.py`.

    `muni_key` es el `id` del directorio (`argentina-ucacha`), el mismo que usan
    `calls_registro` y `calls_evento`. No es un FK a `municipios`: estos son
    prospectos comerciales, no tenants de la app.
    """

    __tablename__ = "calls_municipio"

    id = Column(Integer, primary_key=True, index=True)
    muni_key = Column(String(80), unique=True, nullable=False, index=True)
    # EL ENGANCHE con el catalogo de la app: el `id` de `municipios_catalogo` ES
    # el codigo INDEC del padron del Estado, y es lo que permite saber que este
    # prospecto y aquel tenant son el mismo lugar. Enganche BLANDO, sin
    # constraint: el 87,6% matchea y el resto son municipios que nosotros
    # tenemos y la app todavia no -- que son, justamente, los prospectos.
    # El nombre NUNCA es la llave: `avellaneda` son tres municipios distintos.
    codigo_indec = Column(String(20), nullable=True, index=True)
    municipio = Column(String(160), nullable=False)
    provincia = Column(String(80), nullable=False, index=True)
    pais = Column(String(40), default="Argentina", nullable=False, index=True)
    tipo_gobierno = Column(String(40), nullable=True)
    # Los telefonos CURADOS, principal primero, como JSON: ["+54 353 4901108", ...].
    # Se guarda el array entero y no una columna por numero porque la cantidad
    # varia y la pagina los muestra todos como links `tel:`.
    telefonos = Column(Text, nullable=True)
    # DE DONDE SALIO CADA NUMERO Y SI YA SE PROBO. `telefonos` es un array plano de
    # strings --lo que la pantalla dibuja-- y ahi no hay donde anotar lo que importa:
    # que un numero lo acaba de traer un modelo y NADIE lo llamo todavia.
    #
    # Es un dict numero -> {de, url, fuente, estado, cuando}, con estado en
    # `por_validar` (lo trajo la IA, sin probar), `no_anda` (se llamo y no sirve) u `ok`.
    # Va aca y no en `calls_telefonos` --que es la tabla normalizada y tiene lo mismo--
    # porque la ficha se sirve de una sola fila: cruzarla contra la tabla por cada una de
    # las 2.244 seria un N+1 para dibujar una pastilla.
    telefonos_meta = Column(Text, nullable=True)
    # EL CORREO OFICIAL. Sale del mismo pedido que el telefono y la web --se cobra por
    # request, no por dato-- y para un municipio chico suele ser el canal que de verdad
    # contestan: el telefono lo atiende quien pasa, el mail lo lee el secretario.
    mail = Column(String(120), nullable=True)
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
    # EL RENDER DE LA FICHA: la botonera de cuatro, el angulo con el que se abre la
    # llamada, el libreto, lo que quedo afuera. Lo calcula `clasificar.py` a partir de
    # los hechos y sus pesos --que son la fuente y viven normalizados en
    # `calls_hechos` y `calls_aportes`-- y aca se guarda ya dibujado.
    #
    # Va como JSON y no en tablas porque se lee ENTERO al abrir una ficha y nadie
    # pregunta por adentro. Y pesa: es el 89% de los 23,6 MB de las 2.244 fichas, asi
    # que el listado se sirve SIN esta columna y la ficha abierta la pide sola.
    decision = Column(LARGO, nullable=True)
    origen = Column(Text, nullable=True)
    verificado_el = Column(String(20), nullable=True)
    # Cuando lo escribio el importador: sirve para saber si la base quedo atras
    # de la curaduria.
    importado_en = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # False = esto NO es un municipio (una comuna, un paraje, una entrada
    # duplicada). Se descubrio llamando: hay fichas que ni siquiera son un
    # gobierno local, y abrir con "hola, con la Municipalidad de..." arranca
    # mal. NULL = todavia no se miro.
    es_municipio = Column(Boolean, nullable=True)
    # Sacada de la rueda de llamados, con el motivo. NO se borra: la ficha pasa
    # a la cola de trabajo del que cura. Un prospecto que no se puede llamar hoy
    # es un pendiente, no un descarte.
    oculto = Column(Boolean, default=False, nullable=False)
    motivo_oculto = Column(String(200), nullable=True)
    curado_en = Column(DateTime, nullable=True)
    curado_por = Column(String(60), nullable=True)

    __table_args__ = (Index("ix_calls_municipio_pais_prov", "pais", "provincia"),)
