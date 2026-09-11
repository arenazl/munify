"""LA CURACION DEL DIRECTORIO, del lado del servidor (2026-09-08).

Hasta hoy todo lo que sabiamos de los 2.244 municipios vivia en archivos JSON del repo
`munify-calls`. Funciono mientras la curacion era una foto que se rehacia entera y la hacia
una sola persona. Dejo de alcanzar el dia que la pantalla empezo a ESCRIBIR: el vendedor
toca un boton, el sistema le busca el telefono y ese dato hay que guardarlo en el momento.

El dueno lo planteo asi: *"si yo estoy trabajando y a la vez hay otro agente trabajando con
los municipios, no tenemos manera de saber si uno curo algo. Esto de manejar archivos JSON
es pan para hoy, hambre para manana"*. Con dos que escriben el mismo archivo, el ultimo
gana y el otro pierde sin enterarse.

DOS REGLAS QUE GOBIERNAN TODAS ESTAS TABLAS
-------------------------------------------
1. **Nada se sobrescribe: todo se agrega con fecha.** Cuando el clasificador corre de
   nuevo no pisa la ponderacion anterior, escribe una nueva. Asi se puede preguntar "por
   que en marzo este municipio era vecino y hoy es plata" y la respuesta esta guardada, no
   hay que deducirla.

2. **Se guarda el CRUDO y lo PROCESADO.** Los tres errores que costaron datos el
   2026-09-08 --el filtro que descartaba WordPress, el +4 que mentia y el recorte que
   mostraba el parrafo equivocado-- se encontraron los tres comparando el crudo contra lo
   que la pantalla mostraba. Sin el crudo ninguno era visible. El dueno: *"quiero los
   crudos y los procesados; estamos en un proceso de maduracion"*.

Y guardar el crudo tiene un segundo efecto, mas practico: cuando cambie el vocabulario se
reprocesan las 2.244 GRATIS, en vez de volver a recorrer 700 sitios y pagar las busquedas
de nuevo.

EL PREFIJO `calls_` NO ES DECORATIVO
------------------------------------
Infra excluye ese prefijo cuando refresca QA clonando produccion, porque esto es data
comercial del dueno y no data de municipios. Toda tabla nueva de este circuito lo lleva.

LA LLAVE: `codigo_indec`
------------------------
Es el codigo del padron del Estado (ReFeGLo + INDEC) y es lo que permite atar un prospecto
con el catalogo de la app: el `id` de `municipios_catalogo` ES ese codigo. Medido el
2026-09-08: el 99,1% de nuestras fichas tiene codigo en el padron, y el 87,6% de esos
codigos existe en el catalogo -- el resto son 259 municipios que nosotros tenemos y la app
todavia no.

NO se usa el nombre como llave, nunca. `avellaneda` son tres municipios distintos y
`general alvear` cuatro; en `munify-calls` el `id` se armo con el nombre y produjo datos
cruzados que tardaron semanas en verse.
"""
from datetime import datetime

from sqlalchemy import (Boolean, Column, DateTime, Float, Index, Integer, String, Text)
from sqlalchemy.dialects import mysql

from core.database import Base

# El texto de una pagina municipal pasa comodo los 64 KB que aguanta un TEXT de
# MySQL, y el truncado no avisa: guarda lo que entra y descarta el resto en
# silencio. Todo lo que puede ser largo va LONGTEXT.
LARGO = Text().with_variant(mysql.LONGTEXT(), "mysql")


class CallsFuente(Base):
    """CADA URL QUE ALGUIEN CITO, venga de donde venga.

    Es la tabla que convierte un hallazgo suelto en un mecanismo. El 2026-09-08 el dueno
    toco el boton de buscar telefono en Colonia Aborigen; el modelo devolvio el numero y
    cito `mapadelestado.chaco.gob.ar`. Al ir a verificar esa fuente aparecio un directorio
    oficial con los 71 municipios del Chaco, sus intendentes y sus oficinas.

    Ese hallazgo dependio de que hubiera alguien mirando. Guardando las fuentes deja de
    depender: si un dominio aparece cinco veces para cinco municipios de la misma
    provincia, eso NO necesita una regla encadenada, es un conteo -- y la alarma "esto no
    es la web de un municipio, es un directorio provincial, crawlealo entero" sale sola.
    """

    __tablename__ = "calls_fuentes"

    id = Column(Integer, primary_key=True, index=True)
    codigo_indec = Column(String(20), nullable=True, index=True)
    muni_key = Column(String(80), nullable=True, index=True)
    provincia = Column(String(80), nullable=True, index=True)
    # el dominio va aparte de la URL a proposito: la alarma del directorio provincial es
    # un COUNT por dominio+provincia, y eso no se puede hacer sobre la URL entera
    dominio = Column(String(200), nullable=False, index=True)
    url = Column(Text, nullable=False)
    # 'gemini' | 'openai' | 'crawler' | 'directorio' | 'chatgpt' | 'apify'
    de_donde = Column(String(30), nullable=False, index=True)
    # que se estaba buscando cuando aparecio: 'telefono' | 'comercial' | 'web' | ...
    buscando = Column(String(40), nullable=True)
    # si se verifico que responde, y cuando. NULL = no se probo.
    # OJO: que una URL de 404 NO significa que el dato sea falso. Se comprobo el
    # 2026-09-08: `casares.gob.ar/compras/` no existe y el municipio SI publica sus
    # compras, en `gobabierto.ar/carloscasares/compras/`. El modelo arma mal la ruta pero
    # no inventa el hecho. Por eso esto es informativo y no descarta nada.
    responde = Column(Boolean, nullable=True)
    creado = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    __table_args__ = (Index("ix_calls_fuentes_dom_prov", "dominio", "provincia"),)


class CallsRelato(Base):
    """EL TEXTO CRUDO que devolvio un modelo, tal cual, con lo que costo.

    Se guarda entero y sin tocar por dos motivos. El primero es poder reprocesar: cuando el
    vocabulario crezca, volver a extraer hechos de estos relatos es gratis e instantaneo,
    contra volver a pagarle la busqueda al modelo. El segundo es poder auditar: si un hecho
    de la ficha parece mal, aca esta el parrafo del que salio.
    """

    __tablename__ = "calls_relatos"

    id = Column(Integer, primary_key=True, index=True)
    codigo_indec = Column(String(20), nullable=True, index=True)
    muni_key = Column(String(80), nullable=False, index=True)
    # 'gemini' | 'openai' | 'groq'
    motor = Column(String(30), nullable=False)
    modelo = Column(String(60), nullable=True)
    # que variante de prompt se uso: sirve para saber cual rinde mas sin volver a probar
    variante = Column(String(40), nullable=True)
    texto = Column(LARGO, nullable=False)
    costo_usd = Column(Float, default=0.0, nullable=False)
    busquedas = Column(Integer, default=0, nullable=False)
    # CON QUE SE PIDIO. Una corrida sin su prompt no se puede reproducir ni
    # comparar contra otra: es la mitad del experimento. Se guarda entero,
    # tambien el que alguien escribio a mano desde la pantalla.
    prompt = Column(Text, nullable=True)
    creado = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)


class CallsPagina(Base):
    """EL TEXTO DE CADA PAGINA que leyo el crawler.

    Hoy esto se tira. Son unos 75 MB para las 2.244 fichas, y por tirarlo, cada vez que se
    toca el vocabulario hay que volver a recorrer 700 sitios: veinte minutos de reloj y el
    riesgo de que un sitio que andaba ayer hoy no responda.

    Guardado, cambiar un peso y reprocesar la base entera es un UPDATE. Es la diferencia
    entre poder iterar el criterio y no poder.
    """

    __tablename__ = "calls_paginas"

    id = Column(Integer, primary_key=True, index=True)
    codigo_indec = Column(String(20), nullable=True, index=True)
    muni_key = Column(String(80), nullable=False, index=True)
    url = Column(Text, nullable=False)
    titulo = Column(String(300), nullable=True)
    # de donde salio el link: 'home' | 'menu' | 'sitemap'
    de = Column(String(20), nullable=True)
    texto = Column(LARGO, nullable=True)
    creado = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    __table_args__ = (Index("ix_calls_paginas_muni_creado", "muni_key", "creado"),)


class CallsHecho(Base):
    """UN HECHO POR FILA, con su fuente y de donde salio.

    Una fila por hecho y no un JSON adentro de una columna: es lo que permite preguntar
    "dame todos los municipios donde aparece `plata:compras`" sin recorrer 2.244
    documentos, y es lo que deja que dos agentes escriban a la vez sin pisarse.

    `tag` puede ser un concepto del vocabulario nuestro (`plata:compras`) o uno que
    propuso el modelo y todavia no se aprobo (`conflicto:tierras`). La diferencia la marca
    `curado`: los sin curar entran a la ficha igual --si no, se paga la busqueda para que
    el dato no aparezca en ningun lado-- pero con peso topeado, para no desplazar a un
    dolor verificado.
    """

    __tablename__ = "calls_hechos"

    id = Column(Integer, primary_key=True, index=True)
    codigo_indec = Column(String(20), nullable=True, index=True)
    muni_key = Column(String(80), nullable=False, index=True)
    tag = Column(String(80), nullable=False, index=True)
    texto = Column(Text, nullable=False)
    # la URL donde se vio. Puede estar mal armada y el hecho ser cierto igual (ver la nota
    # de `CallsFuente.responde`): se guarda como PISTA, no como prueba.
    fuente_url = Column(Text, nullable=True)
    # 'crawler' | 'gemini' | 'groq' | 'directorio' | 'apify' | 'chatgpt'
    de_donde = Column(String(30), nullable=False, index=True)
    # a que puerta comercial empuja, si se sabe: 'vecino' | 'plata' | 'operacion'
    universo = Column(String(20), nullable=True)
    # 1 a 10. Lo pone la regla nuestra si el tag esta curado, o el modelo si es nuevo.
    peso = Column(Integer, default=0, nullable=False)
    # False = el tag lo propuso un modelo y el dueno todavia no lo aprobo
    curado = Column(Boolean, default=False, nullable=False, index=True)
    # de que relato o pagina salio, para poder volver al crudo
    relato_id = Column(Integer, nullable=True)
    pagina_id = Column(Integer, nullable=True)
    creado = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    __table_args__ = (Index("ix_calls_hechos_muni_tag", "muni_key", "tag"),)


class CallsPonderacion(Base):
    """LA FOTO DEL CALCULO cada vez que corre el clasificador. No se pisa: se agrega.

    Con esto `deriva.py` --el script que avisa si la ponderacion se corrio-- deja de ser un
    script y pasa a ser una consulta: "que cambio entre estas dos fechas". Y sobre todo,
    contesta la pregunta que hoy no tiene respuesta: por que un municipio que en marzo
    entraba por `vecino` hoy entra por `plata`.

    Importa por el proceso de maduracion: los tags entran todos los dias y cada uno mueve
    un poco el reparto. Ninguno rompe nada solo; treinta juntos si, y sin historial nadie
    se entera hasta que alguien vuelve a revisar cien fichas a mano.
    """

    __tablename__ = "calls_ponderacion"

    id = Column(Integer, primary_key=True, index=True)
    codigo_indec = Column(String(20), nullable=True, index=True)
    muni_key = Column(String(80), nullable=False, index=True)
    universo = Column(String(20), nullable=False)
    score_vecino = Column(Integer, nullable=True)
    score_plata = Column(Integer, nullable=True)
    score_operacion = Column(Integer, nullable=True)
    margen = Column(Integer, nullable=True)
    # 'comodo' | 'flojo' | 'apenas' | 'sin_senal'
    fuerza = Column(String(20), nullable=True)
    # Con que abrir la llamada, en texto: es lo primero que lee el vendedor.
    angulo = Column(String(160), nullable=True)
    # EL CRITERIO DE POR QUE ESTO ES JSON Y NO UNA TABLA: aca queda solo lo que
    # se lee ENTERO y junto al abrir una ficha --el `abrir_con` y el `por_que`
    # del angulo, que son prosa--. Nadie va a preguntar "agrupame por
    # abrir_con": partirlo en filas seria trabajo sin uso.
    #
    # Lo que SI se consulta a traves de muchos municipios salio de aca y es
    # tabla: el desglose de puntos vive en `calls_aportes`, porque "que regla
    # esta inflando el reparto" es un GROUP BY. Y lo DERIVADO --la botonera de
    # 4, el ranking, lo que quedo afuera-- no se guarda en ningun lado: se
    # recalcula desde los hechos y sus pesos, que es lo unico que se cura.
    detalle = Column(LARGO, nullable=True)
    # la version del vocabulario y de las tablas de peso con la que se calculo. Sin esto,
    # comparar dos fotos no dice si cambio el dato o cambio la regla.
    version_reglas = Column(String(40), nullable=True)
    creado = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    __table_args__ = (Index("ix_calls_pond_muni_creado", "muni_key", "creado"),)


class CallsAporte(Base):
    """EL DESGLOSE DEL CALCULO: una fila por cada cosa que sumo puntos.

    Esto era un JSON adentro de `calls_ponderacion` y estaba mal. La pregunta
    que hay que poder hacer para curar los pesos es "que regla esta inflando el
    reparto" --si `su sitio publica X +5` aparece en 1.800 de 2.244 municipios,
    ese +5 no distingue nada y esta corriendo de la botonera a lo que si
    distingue--. Eso es un GROUP BY, y sobre un JSON no se puede.

    Se guarda la frase entera del aporte y no un codigo, porque es lo que se lee
    en el panel de curacion y tiene que decir exactamente lo mismo que ahi.
    """

    __tablename__ = "calls_aportes"

    id = Column(Integer, primary_key=True, index=True)
    ponderacion_id = Column(Integer, nullable=False, index=True)
    muni_key = Column(String(80), nullable=False, index=True)
    universo = Column(String(20), nullable=False)
    # "caminos_rurales", "su sitio publica operacion:agua", "su menu tiene boletin_oficial"
    concepto = Column(String(160), nullable=False, index=True)
    puntos = Column(Integer, default=0, nullable=False)
    creado = Column(DateTime, default=datetime.utcnow, nullable=False)

    __table_args__ = (Index("ix_calls_aportes_uni_conc", "universo", "concepto"),)


class CallsCapacidad(Base):
    """QUE SABE HACER SU WEB HOY, una capacidad por fila.

    Tabla y no seis columnas booleanas porque la lista crece: arrancaron siendo
    cinco, hoy son seis y `turnos_online` aparecio despues. Cada capacidad nueva
    seria una migracion.

    Ojo con el sentido de esto: que ya tenga reclamos online NO lo descarta, lo
    califica. El que ya compro la idea es al que se le vende comparando; al que
    no la tiene hay que explicarsela primero. La capacidad decide POR QUE PUERTA
    entrar, no si se entra.

    Y OJO CON LA AUSENCIA: que no haya fila NO significa que no tenga. Hoy el
    crawler solo anota lo que encontro, y 1.689 de las 2.244 fichas ni siquiera
    tienen web leida. Leer "no hay fila" como "no lo tiene" es el error que en
    septiembre le cobro "no tiene reclamos online" a 210 municipios que si los
    tenian. Sin fila = no se sabe. `tiene=False` = se miro y no esta.
    """

    __tablename__ = "calls_capacidades"

    id = Column(Integer, primary_key=True, index=True)
    codigo_indec = Column(String(20), nullable=True)
    muni_key = Column(String(80), nullable=False, index=True)
    # 'tramites_online' | 'reclamos_online' | 'pagos_online' | 'boletin_oficial' | ...
    capacidad = Column(String(60), nullable=False, index=True)
    tiene = Column(Boolean, nullable=False)
    # 'crawler' (lo vio en el menu) | 'gemini' | 'declarado'
    de_donde = Column(String(30), nullable=False)
    creado = Column(DateTime, default=datetime.utcnow, nullable=False)

    __table_args__ = (Index("ix_calls_caps_muni_cap", "muni_key", "capacidad"),)


class CallsTelefono(Base):
    """LOS TELEFONOS, uno por fila.

    Era un array JSON en `calls_municipio.telefonos`, y asi no habia donde
    anotar lo unico que de verdad importa de un telefono: si atendio. `atiende`
    NULL = no se probo; False = se llamo y no atiende. Ese False cuesta una
    llamada de un vendedor que hace cinco por dia, y hasta hoy se perdia.
    """

    __tablename__ = "calls_telefonos"

    id = Column(Integer, primary_key=True, index=True)
    codigo_indec = Column(String(20), nullable=True, index=True)
    muni_key = Column(String(80), nullable=False, index=True)
    numero = Column(String(40), nullable=False)
    # 0 = el principal, el que la pantalla muestra primero
    orden = Column(Integer, default=0, nullable=False)
    de_donde = Column(String(30), nullable=False)
    atiende = Column(Boolean, nullable=True)
    creado = Column(DateTime, default=datetime.utcnow, nullable=False)

    __table_args__ = (Index("ix_calls_tel_muni_num", "muni_key", "numero"),)


class CallsTagPropuesto(Base):
    """LOS CONCEPTOS QUE PROPUSO UN MODELO y todavia no son del vocabulario.

    El 2026-09-08 se invirtio el orden de la extraccion: el modelo nombra los temas SIN ver
    nuestra lista, y el vocabulario solo dice si ya tenia algo parecido. Se midio y el
    vocabulario perdia el 50% de los temas --un fallo judicial por tierras, un convenio de
    gas, la inauguracion de un centro de licencias-- y de lo que si agarraba, forzaba mal la
    mitad.

    Aca se acumula lo que el vocabulario no tenia. Cada tanto se consolidan los sinonimos
    (`obra:gas`, `servicio:gas` e `infraestructura:gas` son el mismo tema) y el dueno
    aprueba cuales entran. Sin esa consolidacion la lista crece sin control y la pantalla
    deja de poder ponderar: cuatrocientos tags de uno cada uno no distinguen nada.
    """

    __tablename__ = "calls_tags_propuestos"

    id = Column(Integer, primary_key=True, index=True)
    tag = Column(String(80), nullable=False, index=True)
    tema = Column(String(120), nullable=True)
    frase = Column(Text, nullable=True)
    # por que le sirve al vendedor, en una linea. Lo escribe el modelo.
    sirve_para = Column(Text, nullable=True)
    peso = Column(Integer, default=0, nullable=False)
    universo = Column(String(20), nullable=True)
    muni_key = Column(String(80), nullable=True, index=True)
    # cuando se consolida, aca queda a que concepto del vocabulario se mapeo
    aprobado_como = Column(String(80), nullable=True, index=True)
    aprobado_por = Column(String(60), nullable=True)
    aprobado_en = Column(DateTime, nullable=True)
    creado = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)

class CallsConfig(Base):
    """LA CONFIGURACION DE /calls, en clave y valor.

    Nace para el PROMPT C: el que escribe el dueno desde la pantalla para probar ideas
    sin tocar el codigo ni esperar un deploy. Es UNO SOLO PARA TODA LA APLICACION --no
    uno por municipio-- porque lo que se esta afinando es como se le pregunta al modelo,
    y eso no cambia segun a quien se le pregunte (dueno, 2026-09-10).

    Clave/valor y no una columna por cosa: lo que se guarda aca son ajustes que cambian
    a mano y de a uno, y una tabla nueva por cada uno seria una migracion por capricho.
    """

    __tablename__ = "calls_config"

    clave = Column(String(60), primary_key=True)
    valor = Column(Text, nullable=True)
    quien = Column(String(60), nullable=True)
    creado = Column(DateTime, default=datetime.utcnow, nullable=False)
    actualizado = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow,
                         nullable=False)
