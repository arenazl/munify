"""
Utilidades compartidas para los buscadores libres (`search`) de las pantallas core.

Motivacion: el operador de mostrador NO tipea como esta guardado el dato. Tipea
el apellido y el nombre juntos en cualquier orden, el DNI con puntos, el numero
de expediente como lo ve en pantalla ("#5622", "REC-5622"). Cada pantalla venia
resolviendo esto por su cuenta (o directamente no lo resolvia), asi que la
normalizacion vive aca UNA sola vez y la usan todos los modulos.

Usado hoy por:
  - api/reclamos.py   (GET /reclamos)
  - api/tramites.py   (GET /tramites/gestion/solicitudes)

PENDIENTE (deuda anotada, NO hecha en este cambio): `api/pagos_contaduria.py`
tiene su propia copia de esta logica en `_normalizar_dni` / `_dni_sin_puntos` /
`_parse_monto` (y `_build_search_filter` que las usa). Es exactamente lo mismo
que hay aca — cuando haya que tocar Cobros, borrar esos 3 helpers locales y
apuntar a este modulo. No se migro ahora para no mover un endpoint productivo
sin necesidad.

Todas las funciones son puras: reciben strings / columnas y devuelven strings o
expresiones SQLAlchemy. No tocan la sesion ni conocen los modelos.
"""
import re
from decimal import Decimal, InvalidOperation
from typing import Optional, Sequence

from sqlalchemy import func


# Espacios repetidos / tabs -> un solo espacio.
_RE_ESPACIOS = re.compile(r"\s+")
# "30217134", "30.217.134", "30-217-134" -> parece DNI. "1500,50" no.
_RE_DNI = re.compile(r"^\d[\d.\-]*$")
# Candidato a monto: arranca con digito y solo tiene digitos/separadores.
_RE_MONTO = re.compile(r"^\d[\d.,]*$")
# Numeral delante del numero de expediente: "#5622", "nro 5622", "n° 5622", "-5622".
_RE_NUMERAL = re.compile(r"^\s*(?:n(?:ro|o|º|°)?\.?\s*)?[#\-]?\s*")


def normalizar_termino(search: Optional[str]) -> Optional[str]:
    """Limpia el termino de busqueda. None si queda vacio (= no hay busqueda)."""
    term = _RE_ESPACIOS.sub(" ", (search or "").strip())
    return term or None


def patron_like(term: str) -> str:
    """'perez' -> '%perez%'."""
    return f"%{term}%"


def normalizar_dni(term: str) -> Optional[str]:
    """'30.217.134' -> '30217134'. None si el termino no parece un DNI."""
    t = term.replace(" ", "")
    if not _RE_DNI.match(t):
        return None
    return re.sub(r"\D", "", t) or None


def expr_sin_separadores(col):
    """Expresion SQL: la columna normalizada (sin puntos / espacios / guiones).

    Sirve para comparar normalizado-contra-normalizado: encuentra el DNI tanto
    si quedo guardado "30217134" como "30.217.134".
    """
    return func.replace(func.replace(func.replace(col, ".", ""), " ", ""), "-", "")


def clausula_dni(col, term: str):
    """Clausula LIKE del DNI normalizado, o None si el termino no parece DNI."""
    dni = normalizar_dni(term)
    if not dni:
        return None
    return expr_sin_separadores(col).ilike(patron_like(dni))


def clausulas_nombre_completo(col_nombre, col_apellido, term: str) -> list:
    """Nombre completo en CUALQUIER orden: "Juan Perez" y "Perez Juan" dan lo mismo.

    Devuelve las dos clausulas (concat nombre+apellido y apellido+nombre). Los
    campos sueltos se siguen buscando aparte por quien llama; esto agrega el
    caso "tipeo las dos palabras juntas", que sin concat no matchea nada.
    """
    patron = patron_like(term)
    return [
        func.concat_ws(" ", col_nombre, col_apellido).ilike(patron),
        func.concat_ws(" ", col_apellido, col_nombre).ilike(patron),
    ]


def normalizar_numero(term: str, prefijos: Sequence[str] = ()) -> Optional[str]:
    """Numero de expediente tal como lo ve el usuario -> solo digitos.

    '#5622' / 'REC-5622' / 'nro 5622' / '5.622' -> '5622'.
    Devuelve None si lo que queda no es un numero (ej. 'perez').

    `prefijos` son las siglas propias de la pantalla ("REC", "SOL", ...).
    """
    t = term.strip().lower()
    if not t:
        return None
    for p in sorted({p.strip().lower() for p in prefijos if p}, key=len, reverse=True):
        if t.startswith(p):
            t = t[len(p):]
            break
    t = _RE_NUMERAL.sub("", t, count=1)
    t = t.replace(".", "").replace(" ", "")
    return t if t.isdigit() else None


def parse_monto(term: str) -> Optional[Decimal]:
    """Interpreta el termino como monto ('1500', '1.500', '1500,50'). None si no lo es.

    Todavia no lo usa nadie de este modulo (Cobros tiene su copia local); queda
    aca para que la migracion de `pagos_contaduria` sea un borrar-y-apuntar.
    """
    t = term.replace(" ", "")
    if not _RE_MONTO.match(t):
        return None
    if "." in t and "," in t:          # 1.500,50 -> punto = miles, coma = decimal
        t = t.replace(".", "").replace(",", ".")
    elif "," in t:                      # 1500,50
        t = t.replace(",", ".")
    elif t.count(".") > 1 or re.search(r"\.\d{3}$", t):   # 1.500.000 / 1.500
        t = t.replace(".", "")
    try:
        return Decimal(t)
    except (InvalidOperation, ValueError):
        return None
