# -*- coding: utf-8 -*-
"""PARSER DETERMINISTICO del crudo de Gemini. Sin modelos.

El crudo NO es HTML de un sitio ajeno: es la salida que le pedimos nosotros con el prompt
D5, con los rotulos que nosotros definimos. Medido sobre 23 crudos (3.192 lineas, de C a
D5): el 97% de las lineas se reconoce por rotulo o por seccion. Partir eso es un parser,
no un trabajo de LLM -- se le estaba pagando a Groq once llamadas por municipio para leer
un formato propio.

COMO FUNCIONA: maquina de estados por linea. Un rotulo conocido ABRE un bloque, y el
bloque ACUMULA todo lo que sigue --incluidos los rotulos hijos: FECHA, FUENTE, DE, ORIGEN,
OBSERVACION-- hasta el proximo rotulo que abre o el proximo encabezado de seccion. Nunca
se corta por cantidad de caracteres.

NADA DESAPARECE: lo que no se reconoce va a `otro` con su texto literal y su posicion. La
prueba de que es lossless es mecanica y esta abajo: se comparan los caracteres de todos
los bloques contra el crudo entero.

Cada pieza guarda `source_order`, `section` y `raw` para poder reconstruir de donde salio
sin volver a llamar a Gemini.
"""
import re
import unicodedata

def _pelar(linea):
    """Saca la decoracion de markdown del principio: viñetas, asteriscos, almohadillas."""
    return re.sub(r'^[\s*#>\-•]+', '', linea).strip()


def _sin_tildes(t):
    return ''.join(c for c in unicodedata.normalize('NFD', t)
                   if unicodedata.category(c) != 'Mn').upper()


# --- los rotulos que ABREN una pieza, y en que familia cae cada uno ----------------- #
# DATO y TIPO son ambiguos a proposito: dependen de la seccion en la que aparecen, y eso
# lo resuelve `_familia()` mirando el contexto. En la seccion de canales, DATO es la URL
# del canal; en "LO MAS IMPORTANTE", DATO es el hecho elegido para la llamada.
ABREN = {
    'HECHO': 'hecho',
    'TELEFONO': 'telefono',
    'MAIL': 'mail',
    'CORREO': 'mail',
    'CANAL': 'canal',
    'TIPO': 'canal',
    'DATO': None,
    'POR QUE ME SIRVE': 'analisis',
    'PUERTA DE ENTRADA': 'analisis',
    'PREGUNTA': 'analisis',
    'LECTURA COMERCIAL': 'analisis',
}
# los que PERTENECEN al bloque abierto: no abren nada, se acumulan
HIJOS = {'FECHA', 'FUENTE', 'DE', 'ORIGEN', 'OBSERVACION', 'AREA', 'VIGENCIA',
         'URL', 'NOTA', 'VERIFICACION'}

# QUE ROTULO ABRE DEPENDE DE LA SECCION, y esto costo una corrida entera de descubrir.
# `DATO` es hijo de `CANAL` en la seccion de canales --ahi lleva la URL-- pero ES la pieza
# en "LO MAS IMPORTANTE", donde `DATO:` es el hecho elegido para la llamada. `TIPO` pasa lo
# mismo: abre en "otros canales" y no existe en el resto.
#
# Con `DATO` abriendo siempre, cada canal se partia en dos y el `DE:` quedaba en la mitad
# de abajo: 11 de 23 contactos llegaban descabezados y Groq los marcaba, con razon, como
# `relacion: desconocido`. Lo peor es que el control lossless seguia dando CERO --no se
# pierde un caracter, se reparte mal-- asi que contar caracteres no alcanza: hay que
# controlar tambien que los bloques conserven sus hijos.
ABRE_SEGUN_SECCION = {
    'canales':    {'CANAL'},
    'otros':      {'TIPO'},
    'contactos':  {'TELEFONO', 'MAIL', 'CORREO'},
    'importante': {'DATO', 'PUERTA DE ENTRADA', 'PREGUNTA'},
}


def _abre(rotulo, seccion):
    """Si la seccion define quien abre, el resto de los rotulos son hijos."""
    manda = ABRE_SEGUN_SECCION.get(seccion)
    if manda is not None:
        return rotulo in manda
    return rotulo in ABREN

RE_ROTULO = re.compile(r'^([A-Za-zÁÉÍÓÚÑáéíóúñ/ ]{2,26})\s*:\s*(.*)$')

SECCIONES = (
    ('hechos', r'HECHOS'),
    ('importante', r'LO MAS IMPORTANTE'),
    ('rompehielo', r'ROMPEHIELO'),
    ('contactos', r'CONTACTOS DIRECTOS|DATOS DE CONTACTO|TELEFONOS Y CONTACTOS|TELEFONOS DE'),
    ('canales', r'PRESENCIA DIGITAL'),
    ('otros', r'OTROS CANALES|OTROS CONTACTOS'),
    ('observaciones', r'OBSERVACIONES'),
)


def _seccion_de(linea):
    t = _sin_tildes(_pelar(linea).strip('=* '))
    for nombre, pat in SECCIONES:
        if re.match(r'^(?:===\s*)?(?:%s)' % pat, t):
            return nombre
    return None


def _familia(rotulo, seccion):
    """La familia de un rotulo, mirando la seccion cuando el rotulo solo no alcanza."""
    f = ABREN.get(rotulo, '?')
    if f:
        return f
    # DATO y TIPO cambian de sentido segun donde caen
    if rotulo == 'DATO':
        return 'canal' if seccion in ('canales', 'otros') else 'analisis'
    if rotulo == 'TIPO':
        return 'canal'
    return 'otro'


def parsear(texto):
    """Devuelve la lista de piezas, en el orden en que aparecen en el crudo."""
    lineas = texto.splitlines(keepends=True)
    piezas, actual, seccion, orden = [], None, '', 0

    def cerrar():
        if actual and actual['raw'].strip():
            piezas.append(actual)

    for n, cruda in enumerate(lineas):
        linea = _pelar(cruda)

        sec = _seccion_de(cruda)
        if sec:
            cerrar(); actual = None
            seccion = sec
            # el encabezado TAMBIEN se guarda. Es estructura y no contenido, pero "nada
            # desaparece" tiene que ser literal: si se descarta, el control deja de ser
            # una prueba y pasa a ser una opinion sobre que vale la pena conservar.
            orden += 1
            piezas.append({'source_order': orden, 'section': seccion, 'tipo': 'seccion',
                           'rotulo': '', 'valor': _pelar(cruda).strip('=* '),
                           'raw': cruda, 'linea': n + 1, 'campos': {}})
            continue

        m = RE_ROTULO.match(linea)
        rot = _sin_tildes(m.group(1)).strip() if m else None

        if rot and _abre(rot, seccion):
            cerrar()
            orden += 1
            actual = {'source_order': orden, 'section': seccion,
                      'tipo': _familia(rot, seccion), 'rotulo': rot,
                      'valor': m.group(2).strip(), 'raw': cruda, 'linea': n + 1,
                      'campos': {}}
            continue

        if actual is not None:
            actual['raw'] += cruda
            # cualquier rotulo que no abre en esta seccion es un campo del bloque: asi
            # `DATO`, `DE`, `AREA` y `OBSERVACION` quedan DENTRO de su CANAL
            if rot and m.group(2).strip() and (rot in HIJOS or not _abre(rot, seccion)):
                actual['campos'][rot.lower()] = m.group(2).strip()
            continue

        # texto fuera de todo bloque: no se tira, se junta en una pieza `otro`
        if linea and not re.match(r'^[\s*#=_-]{2,}$', linea):
            orden += 1
            actual = {'source_order': orden, 'section': seccion, 'tipo': 'otro',
                      'rotulo': '', 'valor': linea, 'raw': cruda, 'linea': n + 1,
                      'campos': {}}
    cerrar()

    # la seccion manda sobre el rotulo para lo que cae en "otros canales": ahi todo es de
    # un tercero, aunque el rotulo diga TELEFONO
    for p in piezas:
        if p['section'] == 'otros' and p['tipo'] in ('telefono', 'mail', 'canal'):
            p['de_tercero'] = True
    return piezas


def control(texto, piezas):
    """La prueba de que no se perdio nada: los caracteres con contenido tienen que estar.

    Se comparan los caracteres NO vacios del crudo contra los de la union de los `raw`.
    Lo unico que puede faltar son separadores y lineas en blanco.
    """
    def limpio(t):
        return re.sub(r'\s+', '', re.sub(r'^[\s*#=_-]{2,}$', '', t, flags=re.M))
    a = limpio(texto)
    b = limpio(''.join(p['raw'] for p in piezas))
    return len(a), len(b), len(a) - len(b)
