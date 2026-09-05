"""Semilla de VOLUMEN para el mapa, el time-lapse y las zonas calientes (QA muni 146).

PROBLEMA QUE RESUELVE
---------------------
El municipio demo tenia 49 reclamos en 87 dias (0,56/dia), 10 con
`fecha_resolucion` y una curva mensual creciente: el mapa de calor era una
manchita, el time-lapse no tenia nada que animar y la unica historia que contaba
era "cada mes estamos peor". Esta semilla lo da vuelta: ~820 reclamos sobre 12
meses, con ciclo de vida completo y una curva de gestion que MEJORA.

LAS TRES HISTORIAS QUE TIENE QUE CONTAR LA PANTALLA
---------------------------------------------------
1. **La tasa de resolucion SUBE** mes a mes (~62% hace un ano -> ~90% el ultimo).
2. **El tiempo de resolucion BAJA** (mas cumplimiento de SLA y desvios mas chicos).
3. **Los focos se MUEVEN**: hay esquinas que se apagan porque se atendieron
   (Mercado 4, Tacumbu) y otras que aparecen a mitad de ano (Sajonia, Terminal).
   Eso es lo que hace que el time-lapse cuente algo.

GEOGRAFIA: DATO REAL, CERO COORDENADA INVENTADA
-----------------------------------------------
Regla dura del proyecto: jamas simular datos como reales. Aca NO hay
`random.uniform()` ni jitter sobre coordenadas. Cada reclamo cae en una **esquina
REAL de Asuncion** — un cruce de OpenStreetMap, con los nombres reales de las dos
calles — leida del cache `datos/osm_asuncion.json` (lo genera
`osm_asuncion_fetch.py` contra la Overpass API; ver su docstring para fuente,
area OSM y licencia ODbL).

Los **focos** (zonas calientes) son literalmente **la misma esquina real
reportada muchas veces**: se repite la coordenada exacta del cruce en vez de
dispersar puntos artificiales alrededor. Ademas de ser lo unico honesto, es lo
que hace que el criterio de la app (`recurrentHotspots`: >=3 reclamos a <80 m en
los ultimos 90 dias) detecte el foco: las esquinas reales vecinas estan a 100-400 m,
o sea fuera del radio de 80 m.

Los textos de los reclamos son plantillas genericas y verosimiles parametrizadas
con la calle real. No hay nombres, CI ni telefonos fabricados: el autor de cada
reclamo es uno de los vecinos demo que YA existen en la base.

TRAZABILIDAD
------------
Todo lo que crea este modulo queda marcado en `reclamos.referencia` como
`"[DEMO-MAPA] MV-0001"`. Ese codigo es ademas la **clave natural** de la
idempotencia: la segunda corrida lee los codigos ya presentes y crea 0.

POR QUE ESCRIBE POR SQLALCHEMY Y NO POR LA API
----------------------------------------------
El resto del kit siembra por API. Aca no se puede, por tres razones medidas:
  1. `POST /reclamos` NO permite `created_at` retroactivo ni `fecha_resolucion`:
     todo nace "ahora". Sin fechas hacia atras no hay time-lapse ni curva mensual.
  2. El alta por API dispara, por reclamo, push + notificacion in-app al vecino,
     push a la dependencia y un email (`services/reclamo_create.py`). Por 820
     reclamos serian ~2.500 notificaciones y 820 mails: inutilizable para una demo.
  3. Como admin, `POST /reclamos` exige nombre/apellido/CI del solicitante y crea
     un vecino ghost — o sea, fabricar 820 identidades. Prohibido.
Se replica a mano lo que hace el service y SI importa: estado, deteccion de barrio
(texto primero, coords despues), auto-asignacion de dependencia por categoria e
historial coherente. El matcheo reclamo<->POI se delega a la API real
(`POST /poi/puntos/recalcular`) al final. La escritura directa va SIEMPRE envuelta
en `guard_qa()`: aborta si la `DATABASE_URL` no es la de QA.

CONEXION
--------
Toma la URL de `DATABASE_URL_QA` o `DATABASE_URL` (en ese orden). Debe contener
"qa" o `guard_qa()` corta. Ejemplo:

    DATABASE_URL_QA='mysql+aiomysql://...:.../sugerenciasmun-qa' python runner.py --solo mapa
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import math
import os
import unicodedata
from datetime import date, datetime, timedelta
from pathlib import Path

from sqlalchemy import bindparam, text
from sqlalchemy.ext.asyncio import create_async_engine

from _api import guard_qa

CARPETA = Path(__file__).resolve().parent
CACHE_OSM = CARPETA / "datos" / "osm_asuncion.json"

MUNICIPIO_ID = 146                 # Asuncion demo (marca Paraguay Limpio)
MARCA = "[DEMO-MAPA]"
PREFIJO = "MV-"                    # MV = Mapa/Volumen
TOTAL_RECLAMOS = 820
DIAS_VENTANA = 365
LOTE_INSERT = 200

# Emails de los vecinos demo que YA existen: son los autores de los reclamos.
# NO se fabrica ninguna identidad nueva.
VECINOS_DEMO = [
    "vecino@asuncion.demo.com",
    "vecino-liz@asuncion.demo.com",
    "vecino-rodrigo@asuncion.demo.com",
]

CANALES = [("app", 0.44), ("whatsapp", 0.25), ("web_publica", 0.19), ("ventanilla_asistida", 0.12)]

SLA_FALLBACK_RESPUESTA_H = 48
SLA_FALLBACK_RESOLUCION_H = 168


# ===========================================================================
# Aleatoriedad DETERMINISTICA (no es `random`: es un hash con sal fija)
# ===========================================================================
_SAL = "munify/semillas/m_60_mapa_volumen/v1"


def _u(*partes) -> float:
    """Valor estable en [0,1) derivado de las claves. Misma clave -> mismo valor.

    Reemplaza a `random`: la semilla tiene que dar EXACTAMENTE el mismo resultado
    en cada corrida y en cualquier maquina.
    """
    crudo = _SAL + "|" + "|".join(str(p) for p in partes)
    return int.from_bytes(hashlib.sha256(crudo.encode("utf-8")).digest()[:8], "big") / 2 ** 64


def _elegir(opciones: list, *claves):
    """Elemento estable de una lista."""
    return opciones[int(_u(*claves) * len(opciones)) % len(opciones)]


def _elegir_pesado(pares: list[tuple], *claves):
    """Elemento estable de una lista de (valor, peso)."""
    total = sum(p for _, p in pares)
    objetivo = _u(*claves) * total
    acum = 0.0
    for valor, peso in pares:
        acum += peso
        if objetivo < acum:
            return valor
    return pares[-1][0]


def _metros(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Haversine en metros — mismo criterio que `frontend/src/lib/mapaUtils.ts`."""
    r = 6371000.0
    dlat, dlon = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2
         + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2)
    return 2 * r * math.asin(math.sqrt(a))


def _norm(txt: str) -> str:
    sin = unicodedata.normalize("NFKD", (txt or "").lower())
    return "".join(c for c in sin if not unicodedata.combining(c)).strip()


# ===========================================================================
# Catalogo de categorias: peso base + estacionalidad por mes CALENDARIO
# ===========================================================================
# `base` = frecuencia relativa de la categoria en el ano.
# `est`  = multiplicador por mes calendario (indice 0 = enero). Asuncion esta en
#          el hemisferio sur: lluvias y dengue en verano (dic-mar), poda y
#          alumbrado en invierno (jun-ago), baches despues de las lluvias.
CATEGORIAS = {
    "Alumbrado público": {
        "base": 1.5,
        "est": [0.9, 0.9, 1.0, 1.1, 1.3, 1.4, 1.4, 1.3, 1.1, 1.0, 0.9, 0.9],
    },
    "Bacheo y calles": {
        "base": 1.4,
        "est": [1.0, 1.1, 1.3, 1.4, 1.3, 1.2, 1.0, 0.9, 0.9, 0.9, 1.0, 1.0],
    },
    "Recolección de residuos": {
        "base": 1.5,
        "est": [1.3, 1.1, 1.0, 0.95, 0.9, 0.9, 0.9, 0.9, 0.95, 1.0, 1.1, 1.4],
    },
    "Higiene urbana": {
        "base": 1.3,
        "est": [1.2, 1.1, 1.0, 0.95, 0.9, 0.9, 0.9, 0.95, 1.0, 1.05, 1.1, 1.3],
    },
    "Arbolado y espacios verdes": {
        "base": 1.0,
        "est": [0.8, 0.8, 0.85, 0.9, 1.0, 1.2, 1.3, 1.4, 1.4, 1.3, 1.2, 1.1],
    },
    "Tránsito y señalización": {
        "base": 0.9,
        "est": [0.9, 1.1, 1.2, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 0.95],
    },
    "Agua y cloacas": {
        "base": 1.1,
        "est": [1.5, 1.4, 1.5, 1.2, 0.9, 0.7, 0.6, 0.6, 1.0, 1.4, 1.6, 1.5],
    },
    "Plagas y control": {
        "base": 0.8,
        "est": [1.8, 1.8, 1.6, 1.3, 0.9, 0.6, 0.5, 0.5, 0.7, 1.0, 1.2, 1.5],
    },
    "Animales sueltos": {
        "base": 0.6,
        "est": [1.0] * 12,
    },
    "Ruidos y convivencia": {
        "base": 0.6,
        "est": [1.4, 1.3, 1.0, 0.9, 0.85, 0.85, 0.85, 0.85, 0.9, 1.0, 1.2, 1.5],
    },
}

# Plantillas de texto por categoria. `{c1}` = calle principal de la esquina,
# `{c2}` = la transversal, `{b}` = barrio. Genericas y verosimiles a proposito:
# describen el tipo de problema, no un hecho puntual atribuido a alguien.
PLANTILLAS = {
    "Alumbrado público": [
        ("Luminaria apagada en {c1}", "La luminaria de {c1} casi {c2} no enciende. De noche la cuadra queda a oscuras."),
        ("Media cuadra sin luz sobre {c1}", "Varias columnas apagadas sobre {c1}, en {b}. Los vecinos piden revision del tramo."),
        ("Columna de alumbrado con cables sueltos", "En {c1} c/ {c2} hay una columna con cables a la vista. Piden que se asegure."),
        ("Luminaria intermitente en {c1}", "La luz de {c1} c/ {c2} prende y apaga toda la noche."),
        ("Poste inclinado sobre {c1}", "Un poste de alumbrado quedo inclinado sobre {c1}, en {b}."),
    ],
    "Bacheo y calles": [
        ("Bache profundo sobre {c1}", "Bache grande sobre {c1} casi {c2}. Ya provoco danos en vehiculos."),
        ("Calzada rota en {c1} c/ {c2}", "El pavimento se levanto en la esquina de {c1} y {c2}, en {b}."),
        ("Empedrado hundido en {c1}", "Tramo de empedrado hundido sobre {c1}. Con lluvia se junta agua."),
        ("Zanja abierta sin senalizar", "Quedo una zanja abierta sobre {c1} c/ {c2}, sin vallas ni senalizacion."),
        ("Vereda intransitable en {c1}", "Baldosas levantadas sobre {c1}, en {b}. Riesgo de caidas."),
    ],
    "Recolección de residuos": [
        ("No pasa el recolector por {c1}", "Hace varios dias que no pasa el camion por {c1}, en {b}. La basura se acumula."),
        ("Basura acumulada en {c1} c/ {c2}", "Monticulo de residuos en la esquina de {c1} y {c2}."),
        ("Contenedor desbordado sobre {c1}", "El contenedor de {c1} esta lleno y la basura queda en la vereda."),
        ("Recoleccion salteada en {b}", "El recorrido pasa salteado por {c1}. Los vecinos piden regularizar la frecuencia."),
        ("Restos de poda sin retirar", "Quedaron restos de poda sobre {c1} c/ {c2} sin que nadie los levante."),
    ],
    "Higiene urbana": [
        ("Microbasural en {c1} c/ {c2}", "Se formo un microbasural en un baldio de {c1} y {c2}, en {b}."),
        ("Descarga clandestina de escombros", "Descargan escombros de noche sobre {c1}, en {b}."),
        ("Cesto de basura roto en {c1}", "El cesto de la esquina de {c1} y {c2} esta roto y desborda."),
        ("Terreno baldio sin mantenimiento", "Baldio con pasto alto y residuos sobre {c1}. Piden limpieza e intimacion."),
        ("Fachada publica con pintadas", "Pintadas sobre un frente municipal en {c1} c/ {c2}."),
    ],
    "Arbolado y espacios verdes": [
        ("Rama caida sobre {c1}", "Tras el ultimo temporal quedo una rama grande sobre {c1}, en {b}."),
        ("Arbol tapa la senal de transito", "Un arbol sobre {c1} c/ {c2} tapa la senalizacion de la esquina."),
        ("Poda pendiente en {c1}", "Ramas que rozan los cables sobre {c1}. Piden poda preventiva."),
        ("Pasto alto en el espacio verde de {b}", "El espacio verde de {c1} c/ {c2} esta sin corte hace semanas."),
        ("Arbol seco con riesgo de caida", "Ejemplar seco sobre {c1}, en {b}. Piden evaluacion."),
    ],
    "Tránsito y señalización": [
        ("Semaforo fuera de servicio en {c1} c/ {c2}", "El semaforo de {c1} y {c2} quedo en intermitente."),
        ("Cartel de PARE derribado", "Quedo tirado el cartel de PARE de {c1} c/ {c2}, en {b}."),
        ("Senda peatonal borrada en {c1}", "La senda peatonal de {c1} c/ {c2} esta practicamente borrada."),
        ("Vehiculo abandonado sobre {c1}", "Un vehiculo lleva semanas abandonado sobre {c1}, en {b}."),
        ("Falta reductor de velocidad en {c1}", "Piden reductor de velocidad sobre {c1}, cerca de {c2}."),
    ],
    "Agua y cloacas": [
        ("Calle anegada en {c1} c/ {c2}", "Con lluvia el agua no drena en {c1} y {c2}: se forma una laguna."),
        ("Alcantarilla tapada sobre {c1}", "La alcantarilla de {c1} no traga y desborda, en {b}."),
        ("Perdida de agua sobre la calzada", "Perdida constante de agua sobre {c1} casi {c2}."),
        ("Desague con olor en {c1}", "El desague de {c1} c/ {c2} despide olor fuerte."),
        ("Agua servida en la vereda de {c1}", "Corre agua servida por la vereda de {c1}, en {b}."),
    ],
    "Plagas y control": [
        ("Agua estancada foco de mosquitos", "Charco permanente en {c1} c/ {c2}. Piden descacharrado."),
        ("Roedores en {c1}", "Vecinos reportan roedores en el tramo de {c1}, en {b}."),
        ("Solicitud de fumigacion en {b}", "Piden fumigacion por aumento de mosquitos en {c1} c/ {c2}."),
        ("Baldio con criaderos sobre {c1}", "Baldio con recipientes con agua sobre {c1}. Riesgo sanitario."),
        ("Enjambre de insectos en {c1}", "Enjambre instalado en el arbolado de {c1} c/ {c2}."),
    ],
    "Animales sueltos": [
        ("Perro suelto en {c1} c/ {c2}", "Un perro sin dueno merodea la esquina de {c1} y {c2}, en {b}."),
        ("Animales sueltos cerca de la escuela", "Animales sueltos sobre {c1}, en el horario de entrada escolar."),
        ("Caballo suelto sobre {c1}", "Un equino suelto circula por {c1}, en {b}. Riesgo para el transito."),
        ("Jauria en {b}", "Grupo de perros sin dueno en la zona de {c1} c/ {c2}."),
    ],
    "Ruidos y convivencia": [
        ("Ruidos molestos en {c1}", "Musica alta hasta la madrugada sobre {c1}, en {b}."),
        ("Parlantes a alto volumen en {c1} c/ {c2}", "Comercio con parlantes al volumen maximo desde temprano."),
        ("Obra fuera de horario en {c1}", "Trabajos con maquinaria fuera del horario permitido sobre {c1}."),
        ("Reuniones ruidosas en {b}", "Ruidos reiterados en {c1} c/ {c2}. Los vecinos piden control."),
    ],
}

RESOLUCIONES = [
    "Cuadrilla en el lugar. Trabajo ejecutado y sector normalizado.",
    "Se realizo la intervencion solicitada y se verifico en el sitio.",
    "Tarea completada por la dependencia asignada. Sin observaciones.",
    "Se resolvio el problema reportado y se notifico al vecino.",
    "Intervencion finalizada. Se dejo constancia fotografica en el legajo.",
]

RECHAZOS = [
    ("no_competencia", "El punto reportado corresponde a una prestadora de servicio, no al municipio. Se deriva."),
    ("duplicado", "Ya existe un reclamo abierto por el mismo hecho en la misma direccion."),
    ("info_insuficiente", "No se pudo ubicar el hecho con los datos aportados. Se solicito ampliar y no hubo respuesta."),
    ("fuera_jurisdiccion", "La direccion queda fuera del ejido municipal."),
]


# ===========================================================================
# Focos: las zonas calientes que se ENCIENDEN y se APAGAN
# ===========================================================================
# `ancla` -> nombre EXACTO de un barrio o de un equipamiento del cache OSM. El
# foco se planta en las esquinas reales mas cercanas a ese punto real.
# `tramos` -> (dia_desde, dia_hasta, porcion) con dias relativos a hoy (negativos).
# Todos los reclamos de un ancla comparten la coordenada EXACTA de esa esquina:
# eso es un foco (la misma esquina reportada N veces) y es lo que dispara el
# criterio de la app (>=3 a <80 m en 90 dias).
FOCOS = [
    {
        "nombre": "Mercado 4", "ancla": ("equipamiento", "Mercado Municipal Número 4"),
        "cats": ["Higiene urbana", "Recolección de residuos", "Plagas y control"],
        "n": 36, "esquinas": 3, "encendido": False,
        "tramos": [(-364, -250, 0.45), (-250, -115, 0.55)],
        "relato": "arranco fuerte y se APAGA hace ~4 meses (se atendio)",
    },
    {
        "nombre": "Chacarita / Ricardo Brugada", "ancla": ("barrio", "Ricardo Brugada"),
        "cats": ["Agua y cloacas", "Higiene urbana"],
        "n": 30, "esquinas": 2, "encendido": True,
        "tramos": [(-364, -90, 0.74), (-90, 0, 0.26)],
        "relato": "cronico todo el ano, con pico en temporada de lluvia",
    },
    {
        "nombre": "Villa Morra", "ancla": ("barrio", "Villa Morra"),
        "cats": ["Tránsito y señalización", "Bacheo y calles"],
        "n": 28, "esquinas": 2, "encendido": True,
        "tramos": [(-364, -90, 0.70), (-90, 0, 0.30)],
        "relato": "constante todo el ano (corredor de alto transito)",
    },
    {
        "nombre": "Sajonia", "ancla": ("barrio", "Sajonia"),
        "cats": ["Bacheo y calles", "Agua y cloacas"],
        "n": 28, "esquinas": 3, "encendido": True,
        "tramos": [(-195, -90, 0.42), (-90, 0, 0.58)],
        "relato": "APARECE a mitad de ano y viene creciendo",
    },
    {
        "nombre": "Tacumbú", "ancla": ("barrio", "Tacumbú"),
        "cats": ["Plagas y control", "Higiene urbana"],
        "n": 24, "esquinas": 2, "encendido": False,
        "tramos": [(-364, -260, 0.55), (-260, -160, 0.45)],
        "relato": "fuerte al principio del periodo y APAGADO desde hace ~5 meses",
    },
    {
        "nombre": "Terminal", "ancla": ("barrio", "Terminal"),
        "cats": ["Alumbrado público", "Tránsito y señalización"],
        "n": 22, "esquinas": 2, "encendido": True,
        "tramos": [(-125, -60, 0.35), (-60, 0, 0.65)],
        "relato": "APARECE hace ~4 meses y se acelera",
    },
]


# ===========================================================================
# COBERTURA DE LA CONSULTA GUIADA — que ninguna combinacion quede vacia
# ===========================================================================
# La pantalla de Mapa ofrece pregunta x area x tipo x periodo. Con solo la carga
# historica quedaban combinaciones en cero y salia el cartel "Nada que dibujar
# para esta consulta". Este bloque garantiza, PARA CADA CATEGORIA (y por lo
# tanto para cada dependencia, porque cada categoria cuelga de una sola area),
# que las cuatro preguntas tengan respuesta en TODAS las ventanas.
#
# SEMANTICA REAL DEL FRONT (leida de `frontend/src/pages/Mapa.tsx`, no supuesta):
#   - "Lo atrasado"     -> isAbierto(estado) AND dias(created_at) > 30.
#                          `usaPeriodo: false`: el combo de periodo NO se aplica
#                          ni se muestra. O sea "lo atrasado en los ultimos 7
#                          dias" NO es contradictorio: el periodo se ignora.
#   - "Que resolvimos"  -> isResuelto(estado), y el periodo corta por
#                          **created_at**, NO por fecha_resolucion. Por eso para
#                          que "que resolvimos en los ultimos 7 dias" devuelva
#                          algo hacen falta reclamos CREADOS en los ultimos 7
#                          dias y YA cerrados.
#   - "Donde se repiten"-> ademas de tener reclamos, necesita >=3 a menos de 80 m
#                          entre si DENTRO del periodo (recurrentHotspots).
#   - Las ventanas son ANIDADAS (created_at >= hoy - N): lo que entra en 7 dias
#     entra tambien en 30/90/365 y en "todo". Por eso alcanza con cubrir la
#     ventana de 7 dias — es la unica que aprieta.
#
# Por categoria (7 reclamos):
#   4 en LA MISMA esquina real (dias -1,-3,-5,-6) -> foco de "donde se repiten"
#     en la ventana de 7 dias; 2 de ellos ya cerrados.
#   1 suelto reciente ya cerrado (dia -2).
#   2 de backlog abierto (dias -48 y -115) -> "lo atrasado".
# OJO con la mezcla de estados: medido, este bloque puede DAR VUELTA la curva de
# mejora. Los reclamos recientes caen en el mes corriente, asi que si vienen con
# baja tasa de cierre hunden justo el ultimo mes. Y un backlog abierto plantado a
# -48 / -115 dias hunde los meses de en medio (abril paso de 81,8% a 69,2% y junio
# de 89,4% a 80,0% en la primera version de este bloque). Por eso:
#   - lo RECIENTE va mayormente cerrado (4 de 5), en linea con el desempeno actual;
#   - el backlog abierto se planta en los meses MAS VIEJOS (-350 / -320), donde la
#     curva ya esta en su piso: ahi no rompe nada y encima hace que el punto de
#     partida sea mas bajo, o sea que la mejora se lea mas fuerte.
COBERTURA_FOCO = [
    # (dia, estado, horas_hasta_el_cierre | None)
    (-1, "finalizado", 9),
    (-3, "finalizado", 20),
    (-5, "finalizado", 26),
    (-6, "en_curso", None),
]
COBERTURA_SUELTOS = [
    (-2, "finalizado", 11),
]
COBERTURA_BACKLOG = [
    (-350, "en_curso", None),
    (-320, "pospuesto", None),
]
# Barrios REALES de Asuncion donde se planta el foco de cobertura de cada
# categoria. Se eligen distintos de los anclajes de FOCOS para no amontonar todo
# en las mismas esquinas, y se resuelve la esquina real mas cercana al centroide.
COBERTURA_BARRIOS = [
    "La Catedral", "Jara", "Recoleta", "Las Mercedes", "San Roque",
    "Mariscal López", "Ciudad Nueva", "Santo Domingo", "Vista Alegre", "Obrero",
]


# ===========================================================================
# Zonas nuevas (barrios REALES de Asuncion, centroide REAL de OSM)
# ===========================================================================
# El KPI de cobertura territorial del mapa usa `zonas` como denominador
# ("N de M barrios"). Con 6 zonas el numero no dice nada. Se suman barrios reales
# donde la semilla efectivamente pone reclamos. Es 100% aditivo: no toca ni
# renombra las 6 existentes ni reasigna cuadrillas/empleados.
ZONAS_NUEVAS = [
    "Sajonia", "Pettirossi", "Ricardo Brugada", "Terminal", "Recoleta",
    "San Vicente", "Vista Alegre", "Jara", "Las Mercedes", "Mariscal López",
    "Obrero", "La Catedral",
]

# ===========================================================================
# POIs desde el equipamiento real de OSM
# ===========================================================================
# tipo del catalogo -> (tag OSM, cuantos sembrar, radio en metros)
POI_PLAN = [
    ("Hospital", "amenity=hospital", 6, 1200),
    ("Salita", "amenity=clinic", 5, 600),
    ("Escuela", "amenity=school", 12, 500),
    ("Jardín", "amenity=kindergarten", 2, 400),
    ("Bomberos", "amenity=fire_station", 4, 1000),
    ("Comisaría", "amenity=police", 6, 900),
    ("Plaza", "leisure=park", 10, 400),
    ("Mercado", "amenity=marketplace", 4, 700),
]
# Tipo que puede faltar en el catalogo del muni (los otros 8 ya existen).
POI_TIPOS_EXTRA = [
    {"nombre": "Mercado", "icono": "Store", "color": "#f59e0b", "radio_default_metros": 700, "orden": 30},
]

# ===========================================================================
# SLA faltantes
# ===========================================================================
# El muni tenia SLA propio para 6 de las 10 categorias; las otras 4 caian al
# fallback general de 168 h. Eso no solo es pobre para la demo (el tablero de SLA
# muestra "General" para casi la mitad de los reclamos): ademas descuadra la curva
# de tiempo de resolucion, porque los meses con mas reclamos de esas categorias
# muestran tiempos mucho mas altos por una razon de catalogo, no de gestion.
# (categoria, respuesta_h, resolucion_h, alerta_h)
SLA_FALTANTES = [
    ("Higiene urbana", 24, 72, 48),
    ("Arbolado y espacios verdes", 24, 96, 60),
    ("Animales sueltos", 12, 48, 24),
    ("Ruidos y convivencia", 24, 72, 48),
]


# ===========================================================================
# Curva de gestion (el corazon de la demo)
# ===========================================================================
# `m` = antiguedad en meses de 30 dias (0 = mes corriente, 11 = hace un ano).
#
# NOTA sobre el sorteo: estas probabilidades NO se tiran con una moneda por
# reclamo. Se aplican **estratificadas** por mes (ver `_estratificar`): dentro de
# cada bucket se ordena a los reclamos por un hash y se corta por cuantil, asi la
# proporcion sale EXACTA. Con ~70 reclamos por mes, un sorteo independiente tiene
# +/-6 pp de ruido binomial — suficiente para romper la monotonia de la curva y
# arruinar justo lo que la demo tiene que mostrar.
def _p_finalizado(m: int) -> float:
    """Tasa de resolucion: 91% este mes -> 64% hace un ano."""
    return 0.91 - 0.27 * (m / 11.0)


def _p_abierto(m: int) -> float:
    """Cola sin cerrar: 4% este mes -> 10% hace un ano."""
    return 0.04 + 0.06 * (m / 11.0)


def _p_cumple_sla(m: int) -> float:
    """Cumplimiento de SLA: 88% este mes -> 33% hace un ano."""
    return 0.88 - 0.55 * (m / 11.0)


def _factor_desvio(m: int) -> float:
    """Cuanto se pasa del SLA cuando NO cumple: peor cuanto mas viejo."""
    return 0.8 + 1.5 * (m / 11.0)


def _bucket(hoy: date, fecha: date) -> float:
    """Antiguedad en meses de 30 dias, 0.0 .. 11.0."""
    return max(0.0, min(11.0, (hoy - fecha).days / 30.0))


def _estratificar(plan: list[dict], hoy: date) -> None:
    """Fija, por MES CALENDARIO, cuantiles exactos y las probabilidades del mes.

    Por que por mes calendario y no por reclamo suelto: la demo se lee por mes,
    y con ~70 reclamos mensuales un sorteo independiente mete +/-6 pp de ruido
    binomial — suficiente para que la curva de resolucion baje un mes en el medio
    y arruine la historia. Aca la proporcion sale EXACTA:

      - se ordenan los reclamos del mes por un hash (deterministico),
      - se les da el cuantil (i+0.5)/n,
      - y se comparan contra la probabilidad del mes, calculada UNA vez desde la
        antiguedad media del mes.

    Resultado: el mes con p_fin=0.78 tiene exactamente el 78% de finalizados.
    """
    grupos: dict[tuple[int, int], list[dict]] = {}
    for item in plan:
        grupos.setdefault((item["fecha"].year, item["fecha"].month), []).append(item)

    for items in grupos.values():
        n = len(items)
        # Antiguedad media del mes -> una sola probabilidad para todo el mes.
        m = sum(_bucket(hoy, it["fecha"]) for it in items) / n
        p_fin, p_abi, p_sla, fac = (_p_finalizado(m), _p_abierto(m),
                                    _p_cumple_sla(m), _factor_desvio(m))
        for sorteo, campo in (("destino", "q_destino"), ("sla", "q_sla"), ("horas", "q_horas")):
            items.sort(key=lambda it: _u(sorteo, it["codigo"]))
            for i, item in enumerate(items):
                item[campo] = (i + 0.5) / n
        for item in items:
            item["p_fin"], item["p_abi"] = p_fin, p_abi
            item["p_sla"], item["factor"] = p_sla, fac


# ===========================================================================
# Carga del cache OSM + estructuras derivadas
# ===========================================================================
def _cargar_osm() -> dict:
    if not CACHE_OSM.exists():
        raise SystemExit(
            f"[mapa-volumen] falta el cache de geografia real: {CACHE_OSM}\n"
            f"                generalo con: python osm_asuncion_fetch.py"
        )
    with open(CACHE_OSM, encoding="utf-8") as fh:
        return json.load(fh)


def _mas_cercano(lat: float, lon: float, puntos: list, key_lat="lat", key_lon="lon"):
    mejor, mejor_d = None, float("inf")
    for p in puntos:
        d = _metros(lat, lon, p[key_lat], p[key_lon])
        if d < mejor_d:
            mejor, mejor_d = p, d
    return mejor, mejor_d


def _seleccion_estratificada(items: list, cantidad: int, lado_m: float = 2000.0) -> list:
    """Toma `cantidad` items REPARTIDOS por la ciudad (round-robin por celda).

    Sin esto, cualquier recorte de una lista ordenada concentra todo en una punta
    del mapa. Deterministico: el orden de entrada define el resultado.
    """
    if len(items) <= cantidad:
        return list(items)
    celdas: dict[tuple[int, int], list] = {}
    paso = lado_m / 111_320.0
    for it in items:
        clave = (int(it["lat"] / paso),
                 int(it["lon"] / (paso / max(0.1, math.cos(math.radians(it["lat"]))))))
        celdas.setdefault(clave, []).append(it)
    grupos = [celdas[k] for k in sorted(celdas)]
    salida, ronda = [], 0
    while len(salida) < cantidad and any(len(g) > ronda for g in grupos):
        for g in grupos:
            if ronda < len(g):
                salida.append(g[ronda])
                if len(salida) >= cantidad:
                    break
        ronda += 1
    return salida


# ===========================================================================
# Paso 1 — zonas (API)
# ===========================================================================
def _slug_codigo(nombre: str) -> str:
    base = "".join(c for c in _norm(nombre).upper() if c.isalnum())[:8] or "ZONA"
    return f"AS-{base}-146"[:20]


def _sembrar_zonas(api, osm) -> tuple[int, int]:
    creados = existentes = 0
    barrios_osm = {b["nombre"]: b for b in osm["barrios"]}
    for nombre in ZONAS_NUEVAS:
        b = barrios_osm.get(nombre)
        if not b:
            print(f"  [zonas] '{nombre}' no esta en el cache OSM — se omite (no se inventa centroide)")
            continue
        _, creado = api.asegurar(
            "/zonas", "nombre", nombre, "/zonas",
            {
                "nombre": nombre,
                "codigo": _slug_codigo(nombre),
                "descripcion": f"{MARCA} Barrio de Asuncion (limite administrativo OSM {b['id']}).",
                "latitud_centro": b["lat"],
                "longitud_centro": b["lon"],
                "activo": True,
            },
        )
        creados += creado
        existentes += (not creado)
    return creados, existentes


# ===========================================================================
# Paso 1.bis — SLA por categoria (API)
# ===========================================================================
def _sembrar_sla(api) -> tuple[int, int]:
    creados = existentes = 0
    cats = {c["nombre"]: c["id"] for c in api.listar("/categorias-reclamo")}
    for nombre, resp, reso, alerta in SLA_FALTANTES:
        cat_id = cats.get(nombre)
        if not cat_id:
            print(f"  [sla] categoria '{nombre}' inexistente en el muni — se omite")
            continue
        _, creado = api.asegurar(
            "/sla/config", "categoria_id", cat_id, "/sla/config",
            {"categoria_id": cat_id, "tiempo_respuesta": resp,
             "tiempo_resolucion": reso, "tiempo_alerta_amarilla": alerta, "activo": True},
        )
        creados += creado
        existentes += (not creado)
    return creados, existentes


# ===========================================================================
# Paso 2 — POIs (API): equipamiento real de OSM
# ===========================================================================
def _sembrar_pois(api, osm) -> tuple[int, int]:
    creados = existentes = 0
    for extra in POI_TIPOS_EXTRA:
        _, creado = api.asegurar("/poi/tipos", "nombre", extra["nombre"], "/poi/tipos", extra)
        creados += creado
        existentes += (not creado)

    tipos = {t["nombre"]: t["id"] for t in api.listar("/poi/tipos")}
    por_tag: dict[str, list] = {}
    for e in osm["equipamiento"]:
        por_tag.setdefault(e["osm"], []).append(e)

    for tipo_nombre, tag, cantidad, radio in POI_PLAN:
        tipo_id = tipos.get(tipo_nombre)
        if not tipo_id:
            print(f"  [poi] no existe el tipo '{tipo_nombre}' en el muni — se omite")
            continue
        candidatos, vistos = [], set()
        for e in por_tag.get(tag, []):
            # OSM repite nombres (cadenas de comercios): un nombre = un POI.
            if e["nombre"] in vistos or len(e["nombre"]) > 100:
                continue
            vistos.add(e["nombre"])
            candidatos.append(e)
        for e in _seleccion_estratificada(candidatos, cantidad):
            _, creado = api.asegurar(
                "/poi/puntos", "nombre", e["nombre"], "/poi/puntos",
                {
                    "tipo_id": tipo_id, "nombre": e["nombre"],
                    "latitud": e["lat"], "longitud": e["lon"], "radio_metros": radio,
                    "notas": f"{MARCA} Ubicacion real de OpenStreetMap ({e['id']}, {e['osm']}).",
                },
            )
            creados += creado
            existentes += (not creado)
    return creados, existentes


# ===========================================================================
# Paso 3 — plan de reclamos (funcion pura y deterministica)
# ===========================================================================
def _resolver_anclas(osm) -> dict[str, list[dict]]:
    """Para cada foco: las N esquinas REALES mas cercanas a su punto de anclaje."""
    barrios = {b["nombre"]: b for b in osm["barrios"]}
    equip = {e["nombre"]: e for e in osm["equipamiento"]}
    anclas: dict[str, list[dict]] = {}
    for foco in FOCOS:
        clase, nombre = foco["ancla"]
        ref = (barrios if clase == "barrio" else equip).get(nombre)
        if not ref:
            raise SystemExit(f"[mapa-volumen] el ancla {clase}='{nombre}' no esta en el cache OSM")
        cercanas = sorted(osm["esquinas"],
                          key=lambda e: _metros(ref["lat"], ref["lon"], e["lat"], e["lon"]))
        anclas[foco["nombre"]] = cercanas[:foco["esquinas"]]
    return anclas


def _fechas_generales(hoy: date, cantidad: int) -> list[date]:
    """Reparte `cantidad` altas sobre 365 dias siguiendo la estacionalidad."""
    dias, pesos = [], []
    for k in range(DIAS_VENTANA):
        d = hoy - timedelta(days=DIAS_VENTANA - 1 - k)
        peso = sum(c["base"] * c["est"][d.month - 1] for c in CATEGORIAS.values())
        # Menos altas el fin de semana (las oficinas y el 0800 trabajan de lunes a viernes).
        if d.weekday() >= 5:
            peso *= 0.55
        dias.append(d)
        pesos.append(peso)
    total = sum(pesos)
    acum, suma = [], 0.0
    for p in pesos:
        suma += p
        acum.append(suma / total)
    salida = []
    for i in range(cantidad):
        objetivo = _u("fecha-general", i)
        lo, hi = 0, len(acum) - 1
        while lo < hi:
            mid = (lo + hi) // 2
            if acum[mid] < objetivo:
                lo = mid + 1
            else:
                hi = mid
        salida.append(dias[lo])
    return salida


def _categoria_del_dia(d: date, clave) -> str:
    pares = [(n, c["base"] * c["est"][d.month - 1]) for n, c in CATEGORIAS.items()]
    return _elegir_pesado(pares, "cat", clave)


def _plan_reclamos(hoy: date, osm) -> list[dict]:
    """Devuelve la lista completa de reclamos a sembrar (sin tocar la base).

    Cada item: codigo, fecha (date), categoria (nombre), lat, lon, calle1, calle2,
    y si es de foco, cual.
    """
    esquinas = osm["esquinas"]
    anclas = _resolver_anclas(osm)
    plan: list[dict] = []

    # --- Focos: la MISMA esquina real, repetida ---
    for foco in FOCOS:
        puntos = anclas[foco["nombre"]]
        i = 0
        for t_i, (desde, hasta, porcion) in enumerate(foco["tramos"]):
            n_tramo = int(round(foco["n"] * porcion))
            for k in range(n_tramo):
                # Round-robin de esquinas: todas las esquinas del foco reciben
                # reclamos en TODOS los tramos, asi el foco enciende/apaga entero.
                esq = puntos[k % len(puntos)]
                offset = desde + int(_u("foco-dia", foco["nombre"], t_i, k) * (hasta - desde))
                fecha = hoy + timedelta(days=offset)
                cat = _elegir(foco["cats"], "foco-cat", foco["nombre"], i)
                plan.append({
                    "fecha": fecha, "categoria": cat,
                    "lat": esq["lat"], "lon": esq["lon"], "c1": esq["a"], "c2": esq["b"],
                    "foco": foco["nombre"],
                })
                i += 1

    # --- Resto: repartidos por la ciudad, con sesgo al centro y a los corredores ---
    centro = [e for e in esquinas
              if -25.300 < e["lat"] < -25.272 and -57.655 < e["lon"] < -57.615]
    corredores = [e for e in esquinas if e["corr"]]
    restantes = TOTAL_RECLAMOS - len(plan)
    for i, fecha in enumerate(_fechas_generales(hoy, restantes)):
        cesta = _elegir_pesado(
            [("centro", 0.30), ("corredor", 0.30), ("ciudad", 0.40)], "cesta", i)
        fuente = {"centro": centro or esquinas, "corredor": corredores or esquinas,
                  "ciudad": esquinas}[cesta]
        esq = _elegir(fuente, "esquina", cesta, i)
        plan.append({
            "fecha": fecha, "categoria": _categoria_del_dia(fecha, i),
            "lat": esq["lat"], "lon": esq["lon"], "c1": esq["a"], "c2": esq["b"],
            "foco": None,
        })

    # Orden cronologico estable -> los codigos MV-#### quedan en orden de alta.
    plan.sort(key=lambda r: (r["fecha"], r["lat"], r["lon"], r["categoria"]))
    for n, item in enumerate(plan, start=1):
        item["codigo"] = f"{PREFIJO}{n:04d}"

    # Sorteos estratificados por mes: la curva sale limpia, sin ruido binomial.
    _estratificar(plan, hoy)
    return plan


def _plan_cobertura(hoy: date, osm) -> list[dict]:
    """Reclamos que garantizan que NINGUNA combinacion de la consulta guiada
    quede vacia. Deterministico: mismas esquinas y mismas fechas relativas.

    A diferencia del plan historico, aca el estado y el cierre se fijan a mano
    (no se sortean): la gracia es que la combinacion tenga respuesta SIEMPRE.
    """
    barrios_osm = {b["nombre"]: b for b in osm["barrios"]}
    plan: list[dict] = []
    n = 0
    for i, categoria in enumerate(sorted(CATEGORIAS)):
        nombre_barrio = COBERTURA_BARRIOS[i % len(COBERTURA_BARRIOS)]
        ref = barrios_osm.get(nombre_barrio)
        if not ref:
            raise SystemExit(f"[cobertura] el barrio '{nombre_barrio}' no esta en el cache OSM")
        cercanas = sorted(osm["esquinas"],
                          key=lambda e: _metros(ref["lat"], ref["lon"], e["lat"], e["lon"]))
        ancla = cercanas[0]
        # El suelto y el backlog van a esquinas reales VECINAS (no a la del foco),
        # para no inflar artificialmente el foco.
        vecinas = cercanas[1:8] or [ancla]

        grupos = [("foco", COBERTURA_FOCO), ("suelto", COBERTURA_SUELTOS),
                  ("backlog", COBERTURA_BACKLOG)]
        for tipo, filas in grupos:
            for k, (dia, estado, horas_cierre) in enumerate(filas):
                esq = ancla if tipo == "foco" else _elegir(vecinas, "cob-esq", categoria, tipo, k)
                n += 1
                plan.append({
                    "codigo": f"{PREFIJO}C-{n:03d}",
                    "categoria": categoria,
                    "dia": dia,
                    "fecha": hoy + timedelta(days=dia),
                    "estado": estado,
                    "horas_cierre": horas_cierre,
                    "lat": esq["lat"], "lon": esq["lon"], "c1": esq["a"], "c2": esq["b"],
                    "tipo_cobertura": tipo,
                })
    return plan


def _fechas_cobertura(item: dict, hoy: date, ahora: datetime) -> tuple[datetime, datetime | None]:
    """(created_at, fecha_resolucion) objetivo de un item de cobertura."""
    cod = item["codigo"]
    hora = 8 + int(_u("cob-hora", cod) * 10)
    minuto = int(_u("cob-min", cod) * 60)
    creado = datetime.combine(item["fecha"], datetime.min.time()).replace(hour=hora, minute=minuto)
    if creado > ahora:                     # nunca en el futuro
        creado = ahora - timedelta(hours=5)
    f_res = None
    if item["horas_cierre"] is not None:
        f_res = min(creado + timedelta(hours=item["horas_cierre"]), ahora - timedelta(hours=1))
        if f_res <= creado:
            f_res = creado + timedelta(hours=1)
    return creado, f_res


# ===========================================================================
# Paso 4 — ciclo de vida (estado + fechas), determinista
# ===========================================================================
def _ciclo_de_vida(item: dict, hoy: date, ahora: datetime, sla: dict) -> dict:
    """Resuelve estado, fecha_resolucion y demas fechas de UN reclamo."""
    cod = item["codigo"]
    fecha = item["fecha"]
    edad_dias = (hoy - fecha).days

    hora = 7 + int(_u("hora", cod) * 13)          # altas entre las 07 y las 19
    minuto = int(_u("min", cod) * 60)
    creado = datetime.combine(fecha, datetime.min.time()).replace(hour=hora, minute=minuto)

    resp_h, reso_h = sla.get(item["categoria_id"], sla[None])

    # Probabilidades del MES (ya estratificadas en `_estratificar`).
    p_fin, p_abi = item["p_fin"], item["p_abi"]
    dado = item["q_destino"]

    estado, f_res, resolucion, motivo, desc_rechazo = None, None, None, None, None
    # Junto al resto: solo la rama de la cola abierta llega a pausar, pero
    # el return es UNO para las tres y necesita las variables definidas.
    motivo_pausa = texto_pausa = None

    if dado < p_fin:
        # Iba a resolverse: cuanto tardo depende de si cumplio el SLA de su categoria.
        u2 = item["q_horas"]
        if item["q_sla"] < item["p_sla"]:
            horas = reso_h * (0.15 + 0.80 * u2)                       # DENTRO del SLA
        else:
            horas = reso_h * (1.10 + item["factor"] * (0.5 + 2.4 * u2 ** 2.0))  # lo excede
        candidata = creado + timedelta(hours=horas)
        if candidata >= ahora:
            estado = "en_curso"        # todavia en vuelo: no puede tener cierre
        else:
            f_res = candidata
            resolucion = _elegir(RESOLUCIONES, "resol", cod)
            # Cierres recientes que esperan la confirmacion del vecino.
            reciente = (ahora - candidata).days <= 45
            estado = ("pendiente_confirmacion"
                      if reciente and _u("pendconf", cod) < 0.12 else "finalizado")
    elif dado < p_fin + (1.0 - p_fin - p_abi):
        # Rechazado: se cierra rapido (1 a 6 dias).
        horas = 24 + _u("horas-rech", cod) * 120
        candidata = creado + timedelta(hours=horas)
        if candidata >= ahora:
            estado = "recibido"
        else:
            estado = "rechazado"
            f_res = candidata
            motivo, desc_rechazo = _elegir(RECHAZOS, "motivo", cod)
    else:
        # Cola abierta.
        if edad_dias <= 2:
            estado = "recibido"
        elif edad_dias > 240 and _u("posp", cod) < 0.35:
            estado = "pospuesto"
            motivo_pausa, texto_pausa = PAUSAS[int(_u("pausa", cod) * len(PAUSAS)) % len(PAUSAS)]
        else:
            estado = "en_curso" if _u("abierto", cod) < 0.78 else "recibido"

    f_recibido = None if estado == "recibido" else creado + timedelta(hours=resp_h * (0.2 + 0.9 * _u("recib", cod)))
    if f_recibido and f_recibido > ahora:
        f_recibido = None
    return {
        "creado": creado,
        "estado": estado,
        "fecha_resolucion": f_res,
        "resolucion": resolucion,
        "motivo_rechazo": motivo,
        "descripcion_rechazo": desc_rechazo,
        # `pausado_desde` es la fecha en la que se difirio (20 dias despues del
        # alta, el mismo momento que registra el historial de mas abajo), no la
        # del alta: lo que se mide es cuanto lleva FRENADO, no cuanto abierto.
        "motivo_pausa": motivo_pausa,
        "pausado_desde": (creado + timedelta(days=20)) if estado == "pospuesto" else None,
        "texto_pausa": texto_pausa,
        "fecha_recibido": f_recibido,
        "fecha_estimada": creado + timedelta(hours=reso_h),
        "estimado_dias": reso_h // 24,
        "estimado_horas": reso_h % 24,
    }


# POR QUE queda frenado, tipificado (motivo_pausa) + lo que se deja escrito.
#
# El volumen de este modulo es justamente el que hace util al desglose: con
# doce pospuestos no se ve nada, con doscientos se ve que la compra de
# materiales frena tres veces mas que el clima. El reparto es despareja a
# proposito --materiales repetido-- porque en un municipio de verdad lo que
# mas frena es lo que no llega, no la lluvia.
PAUSAS = [
    ("materiales", "Falta el material: se pidió a compras y todavía no llegó."),
    ("materiales", "Se pidieron las luminarias al proveedor y están demoradas."),
    ("presupuesto", "Se difiere hasta la próxima licitación de materiales."),
    ("personal", "No hay cuadrilla disponible: la dotación está afectada a otra zona."),
    ("tercero", "Depende de una obra de la empresa de agua que todavía no tiene fecha."),
    ("otra_obra", "Se pospone hasta terminar el bacheo del corredor, para no romper dos veces."),
    ("clima", "Frenado por el temporal: la cuadrilla no puede intervenir con esta lluvia."),
    ("sin_acceso", "No se pudo entrar al lugar: el portón estaba cerrado y no atendió nadie."),
]


# ===========================================================================
# Paso 5 — escritura (SQLAlchemy directo, SIEMPRE con guard_qa)
# ===========================================================================
def _url_qa() -> str:
    url = os.environ.get("DATABASE_URL_QA") or os.environ.get("DATABASE_URL") or ""
    if not url:
        raise SystemExit(
            "[mapa-volumen] falta DATABASE_URL_QA (o DATABASE_URL) apuntando a la DB de QA.\n"
            "                Este modulo escribe fechas retroactivas, que la API no permite."
        )
    return guard_qa(url)


SQL_INSERT_RECLAMO = text("""
INSERT INTO reclamos
 (municipio_id, titulo, descripcion, estado, prioridad, direccion, latitud, longitud,
  referencia, categoria_id, zona_id, barrio_id, creador_id, canal, municipio_dependencia_id,
  empleado_id, tiempo_estimado_dias, tiempo_estimado_horas, fecha_estimada_resolucion,
  fecha_recibido, motivo_rechazo, descripcion_rechazo, resolucion, fecha_resolucion,
  motivo_pausa, pausado_desde, created_at, updated_at)
VALUES
 (:municipio_id, :titulo, :descripcion, :estado, 3, :direccion, :latitud, :longitud,
  :referencia, :categoria_id, :zona_id, :barrio_id, :creador_id, :canal, :dep_id,
  :empleado_id, :est_dias, :est_horas, :fecha_estimada,
  :fecha_recibido, :motivo_rechazo, :descripcion_rechazo, :resolucion, :fecha_resolucion,
  :motivo_pausa, :pausado_desde, :created_at, :updated_at)
""")

SQL_INSERT_HIST = text("""
INSERT INTO historial_reclamos
 (reclamo_id, usuario_id, estado_anterior, estado_nuevo, accion, comentario, created_at)
VALUES (:reclamo_id, :usuario_id, :estado_anterior, :estado_nuevo, :accion, :comentario, :created_at)
""")

# Reclamos preexistentes que quedan abiertos sin cierre mas de esto = estancados.
LEGACY_DIAS_ESTANCADO = 7


async def _cerrar_legacy_estancados(conn, ahora: datetime, sla: dict, supervisores: list) -> int:
    """Cierra los reclamos PREEXISTENTES que quedaron abiertos sin fecha de cierre.

    POR QUE ESTE PASO EXISTE (medido, no supuesto)
    ----------------------------------------------
    El muni traia 49 reclamos de la semilla anterior, TODOS en los ultimos 3 meses
    y con solo 10 cerrados. Como caen justo en el tramo reciente, arrastran la tasa
    mensual para abajo y dan vuelta la curva exactamente donde la demo la necesita
    subiendo: sin este paso los ultimos tres meses dan 80% -> 76% -> 65%, o sea
    "cada mes estamos peor" — el problema que esta semilla vino a resolver.

    QUE TOCA Y QUE NO
    -----------------
      - SOLO municipio 146, SOLO estado `recibido`/`en_curso`, SOLO si lleva mas de
        LEGACY_DIAS_ESTANCADO dias sin cerrar.
      - NO toca ningun reclamo con orden de trabajo asociada: esas son las cadenas
        "hero" (OT + inventario + historial rico) que demuestran el circuito de
        campo, incluidas las OT deliberadamente BLOQUEADAS. Se dejan como estan.
      - NO toca los reclamos de esta misma semilla (ya nacen con su ciclo resuelto).
      - Deja rastro: una entrada de historial marcada `[DEMO-MAPA]`.

    Idempotente: al cerrarlos dejan de matchear el WHERE, asi que la segunda
    corrida devuelve 0.
    """
    filas = list(await conn.execute(text("""
        SELECT r.id, r.estado, r.created_at, r.categoria_id
        FROM reclamos r
        WHERE r.municipio_id = :m
          AND r.estado IN ('recibido', 'en_curso')
          AND r.fecha_resolucion IS NULL
          AND (r.referencia IS NULL OR r.referencia NOT LIKE :p)
          AND r.created_at < :corte
          AND NOT EXISTS (SELECT 1 FROM orden_trabajo_reclamos o WHERE o.reclamo_id = r.id)
    """), {"m": MUNICIPIO_ID, "p": f"{MARCA} {PREFIJO}%",
           "corte": ahora - timedelta(days=LEGACY_DIAS_ESTANCADO)}))
    if not filas:
        return 0

    cambios, hist = [], []
    for rid, estado, creado, cat_id in filas:
        _, reso_h = sla.get(cat_id, sla[None])
        # Cierre coherente con el desempeno ACTUAL del muni (dentro del SLA).
        horas = reso_h * (0.25 + 0.70 * _u("legacy-horas", rid))
        cierre = min(creado + timedelta(hours=horas), ahora - timedelta(hours=2))
        if cierre <= creado:
            cierre = creado + timedelta(hours=6)
        resolucion = _elegir(RESOLUCIONES, "legacy-resol", rid)
        cambios.append({"id": rid, "f_res": cierre, "resolucion": resolucion})
        if estado == "recibido":
            hist.append({
                "reclamo_id": rid, "usuario_id": _elegir(supervisores, "legacy-sup", rid),
                "estado_anterior": "recibido", "estado_nuevo": "en_curso",
                "accion": "cambio_estado",
                "created_at": creado + timedelta(hours=max(2.0, horas * 0.3)),
                "comentario": f"{MARCA} Reclamo tomado por la dependencia y derivado a la cuadrilla.",
            })
        hist.append({
            "reclamo_id": rid, "usuario_id": _elegir(supervisores, "legacy-sup", rid),
            "estado_anterior": "en_curso", "estado_nuevo": "finalizado",
            "accion": "resuelto", "created_at": cierre,
            "comentario": f"{MARCA} {resolucion}",
        })

    await conn.execute(text("""
        UPDATE reclamos
           SET estado = 'finalizado', fecha_resolucion = :f_res,
               resolucion = :resolucion, updated_at = :f_res
         WHERE id = :id
    """), cambios)
    await conn.execute(SQL_INSERT_HIST, hist)
    return len(cambios)


def _historial_de(fila: dict, vida: dict, supervisor_id: int) -> list[dict]:
    """Historial coherente con el estado final (creado -> curso -> cierre)."""
    eventos = [{
        "usuario_id": fila["creador_id"], "estado_anterior": None, "estado_nuevo": "recibido",
        "accion": "creado", "created_at": vida["creado"],
        "comentario": f"Reclamo cargado por {fila['canal'].replace('_', ' ')} — {fila['direccion']}.",
    }]
    estado = vida["estado"]
    if estado in ("en_curso", "finalizado", "pendiente_confirmacion", "pospuesto"):
        eventos.append({
            "usuario_id": supervisor_id, "estado_anterior": "recibido", "estado_nuevo": "en_curso",
            "accion": "cambio_estado",
            "created_at": vida["fecha_recibido"] or (vida["creado"] + timedelta(hours=6)),
            "comentario": "Reclamo tomado por la dependencia y derivado a la cuadrilla.",
        })
    if estado in ("finalizado", "pendiente_confirmacion"):
        eventos.append({
            "usuario_id": supervisor_id, "estado_anterior": "en_curso", "estado_nuevo": estado,
            "accion": "resuelto", "created_at": vida["fecha_resolucion"],
            "comentario": vida["resolucion"],
        })
    elif estado == "rechazado":
        eventos.append({
            "usuario_id": supervisor_id, "estado_anterior": "recibido", "estado_nuevo": "rechazado",
            "accion": "rechazado", "created_at": vida["fecha_resolucion"],
            "comentario": vida["descripcion_rechazo"],
        })
    elif estado == "pospuesto":
        eventos.append({
            "usuario_id": supervisor_id, "estado_anterior": "en_curso", "estado_nuevo": "pospuesto",
            "accion": "Trabajo diferido",
            "created_at": vida.get("pausado_desde") or (vida["creado"] + timedelta(days=20)),
            # La MISMA frase que corresponde al motivo tipificado del reclamo.
            # Antes era un texto fijo para todos, asi que el historial decia
            # "a la espera de cuadrilla y materiales" incluso donde el motivo
            # era la lluvia.
            "comentario": vida.get("texto_pausa") or "Trabajo diferido.",
        })
    return eventos


SQL_REFRESCAR_COBERTURA = text("""
UPDATE reclamos
   SET created_at = :created_at, fecha_resolucion = :fecha_resolucion,
       fecha_recibido = :fecha_recibido, updated_at = :updated_at,
       estado = :estado, resolucion = :resolucion
 WHERE id = :id
""")


async def _escribir_cobertura(conn, plan: list[dict], hoy: date, ahora: datetime,
                              ctx: dict) -> tuple[int, int]:
    """Crea (o RE-FECHA) el bloque que mantiene viva cada combinacion del mapa.

    Dos operaciones, ambas idempotentes:
      - CREAR lo que falta, matcheando por el codigo `MV-C-###` en `referencia`.
      - REFRESCAR las fechas de lo que ya existe. Esto es necesario porque la
        ventana de "los ultimos 7 dias" se vacia sola con el paso de los dias: un
        reclamo sembrado hace 10 dias ya no la contesta. Al re-correr la semilla,
        los reclamos de cobertura vuelven a su offset objetivo (-1, -2, -3...) y
        la pantalla sigue teniendo respuesta. NO duplica: son las MISMAS filas.
        Si las fechas ya estan en su lugar (misma corrida, mismo dia) no toca
        nada y devuelve 0 — por eso la segunda corrida da 0/0.
    """
    cats, deps = ctx["cats"], ctx["deps"]
    # Se lee tambien el estado: el refresco es DECLARATIVO (la fila converge a lo
    # que dice el plan), asi cambiar la mezcla de estados del bloque se aplica
    # sola en la proxima corrida, sin borrar ni duplicar nada.
    existentes = {r[1]: (r[0], r[2], r[3]) for r in (await conn.execute(text(
        "SELECT id, referencia, created_at, estado FROM reclamos "
        "WHERE municipio_id = :m AND referencia LIKE :p"),
        {"m": MUNICIPIO_ID, "p": f"{MARCA} {PREFIJO}C-%"}))}

    nuevas, refrescos, hist_nuevo, ids_refrescados = [], [], [], []
    for item in plan:
        cat_id = cats[item["categoria"]]
        creado, f_res = _fechas_cobertura(item, hoy, ahora)
        resp_h, reso_h = ctx["sla"].get(cat_id, ctx["sla"][None])
        f_recibido = (None if item["estado"] == "recibido"
                      else min(creado + timedelta(hours=resp_h * 0.4), ahora))
        ref = f"{MARCA} {item['codigo']}"
        previo = existentes.get(ref)

        if previo:
            rid, creado_actual, estado_actual = previo
            # Solo si la fila se corrio de su objetivo (paso el tiempo, o cambio
            # la definicion del bloque).
            en_fecha = creado_actual and abs((creado_actual - creado).total_seconds()) < 60
            estado_ok = str(getattr(estado_actual, "value", estado_actual)) == item["estado"]
            if en_fecha and estado_ok:
                continue
            refrescos.append({
                "id": rid, "created_at": creado, "fecha_resolucion": f_res,
                "fecha_recibido": f_recibido, "updated_at": f_res or creado,
                "estado": item["estado"],
                "resolucion": (_elegir(RESOLUCIONES, "resol", item["codigo"])
                               if f_res else None),
            })
            ids_refrescados.append(rid)
            continue

        barrio, _ = _mas_cercano(item["lat"], item["lon"], ctx["barrios"])
        zona, _ = _mas_cercano(item["lat"], item["lon"], ctx["zonas"])
        titulo, cuerpo = _elegir(PLANTILLAS[item["categoria"]], "txt", item["codigo"])
        fmt = {"c1": item["c1"], "c2": item["c2"], "b": barrio["nombre"]}
        emp = ctx["empleados_por_cat"].get(cat_id) or ctx["empleados_todos"]
        nuevas.append({
            "municipio_id": MUNICIPIO_ID,
            "titulo": titulo.format(**fmt)[:200],
            "descripcion": cuerpo.format(**fmt),
            "estado": item["estado"],
            "direccion": f"{item['c1']} c/ {item['c2']}, {barrio['nombre']}"[:255],
            "latitud": item["lat"], "longitud": item["lon"],
            "referencia": ref,
            "categoria_id": cat_id,
            "zona_id": zona["id"] if zona else None,
            "barrio_id": barrio["id"] if barrio else None,
            "creador_id": _elegir(ctx["vecinos"], "vecino", item["codigo"]),
            "canal": _elegir_pesado(CANALES, "canal", item["codigo"]),
            # La dependencia sale SIEMPRE del mapeo real categoria->area: nunca
            # se arma un par que el municipio no tiene configurado.
            "dep_id": deps.get(cat_id),
            "empleado_id": (_elegir(emp, "emp", item["codigo"])
                            if item["estado"] != "recibido" and emp else None),
            "est_dias": reso_h // 24, "est_horas": reso_h % 24,
            "fecha_estimada": creado + timedelta(hours=reso_h),
            "fecha_recibido": f_recibido,
            "motivo_rechazo": None, "descripcion_rechazo": None,
            # Si el plan lo dejo pospuesto, POR QUE. Sin esto el insert falla
            # por parametro faltante y, peor, se sembraria una cola de frenados
            # sin razon: exactamente el dato que la columna vino a dar.
            "motivo_pausa": (PAUSAS[int(_u("pausa", item["codigo"]) * len(PAUSAS)) % len(PAUSAS)][0]
                             if item["estado"] == "pospuesto" else None),
            "pausado_desde": (creado + timedelta(days=20)
                              if item["estado"] == "pospuesto" else None),
            "resolucion": _elegir(RESOLUCIONES, "resol", item["codigo"]) if f_res else None,
            "fecha_resolucion": f_res,
            "created_at": creado, "updated_at": f_res or creado,
        })

    if refrescos:
        await conn.execute(SQL_REFRESCAR_COBERTURA, refrescos)
        # El historial tiene que seguir a las fechas nuevas: se rehace.
        q_del = text("DELETE FROM historial_reclamos WHERE reclamo_id IN :r").bindparams(
            bindparam("r", expanding=True))
        await conn.execute(q_del, {"r": ids_refrescados})

    if nuevas:
        await conn.execute(SQL_INSERT_RECLAMO, nuevas)

    # Historial de TODO lo que se creo o refresco (mismo criterio que el bloque
    # historico: creado -> en curso -> cierre, con las fechas ya vigentes).
    refs_tocadas = [f["referencia"] for f in nuevas] + [
        f"{MARCA} {i['codigo']}" for i in plan
        if existentes.get(f"{MARCA} {i['codigo']}", (None,))[0] in set(ids_refrescados)
    ]
    if refs_tocadas:
        q_ids = text("SELECT id, referencia FROM reclamos WHERE municipio_id = :m "
                     "AND referencia IN :r").bindparams(bindparam("r", expanding=True))
        ids = {r[1]: r[0] for r in (await conn.execute(
            q_ids, {"m": MUNICIPIO_ID, "r": refs_tocadas}))}
        por_ref = {f"{MARCA} {i['codigo']}": i for i in plan}
        for ref in refs_tocadas:
            rid = ids.get(ref)
            item = por_ref.get(ref)
            if not rid or not item:
                continue
            creado, f_res = _fechas_cobertura(item, hoy, ahora)
            sup = _elegir(ctx["supervisores"], "sup", ref)
            fila = {"creador_id": _elegir(ctx["vecinos"], "vecino", item["codigo"]),
                    "canal": _elegir_pesado(CANALES, "canal", item["codigo"]),
                    "direccion": f"{item['c1']} c/ {item['c2']}"}
            vida = {"creado": creado, "estado": item["estado"], "fecha_resolucion": f_res,
                    "fecha_recibido": None if item["estado"] == "recibido" else creado + timedelta(hours=3),
                    "resolucion": _elegir(RESOLUCIONES, "resol", item["codigo"])}
            for ev in _historial_de(fila, vida, sup):
                hist_nuevo.append({"reclamo_id": rid, **ev})
    if hist_nuevo:
        await conn.execute(SQL_INSERT_HIST, hist_nuevo)

    return len(nuevas), len(refrescos)


async def _escribir(plan: list[dict], hoy: date, osm: dict) -> dict:
    engine = create_async_engine(_url_qa(), pool_pre_ping=True)
    ahora = datetime.now()
    try:
        async with engine.begin() as conn:
            db_name = (await conn.execute(text("SELECT DATABASE()"))).scalar()
            print(f"  [db] escribiendo en '{db_name}'")

            # ---- catalogos de la base (nada hardcodeado) ----
            cats = {r[1]: r[0] for r in (await conn.execute(text(
                "SELECT id, nombre FROM categorias_reclamo WHERE municipio_id = :m"),
                {"m": MUNICIPIO_ID}))}
            faltan = [c for c in CATEGORIAS if c not in cats]
            if faltan:
                raise SystemExit(f"[mapa-volumen] categorias ausentes en el muni: {faltan}")

            sla: dict = {None: (SLA_FALLBACK_RESPUESTA_H, SLA_FALLBACK_RESOLUCION_H)}
            for cid, resp, reso in (await conn.execute(text(
                "SELECT categoria_id, tiempo_respuesta, tiempo_resolucion FROM sla_config "
                "WHERE municipio_id = :m AND activo = 1"), {"m": MUNICIPIO_ID})):
                sla[cid] = (int(resp or SLA_FALLBACK_RESPUESTA_H),
                            int(reso or SLA_FALLBACK_RESOLUCION_H))

            zonas = [{"id": r[0], "lat": float(r[1]), "lon": float(r[2])}
                     for r in (await conn.execute(text(
                         "SELECT id, latitud_centro, longitud_centro FROM zonas "
                         "WHERE municipio_id = :m AND activo = 1 "
                         "AND latitud_centro IS NOT NULL"), {"m": MUNICIPIO_ID}))]
            barrios = [{"id": r[0], "nombre": r[1], "lat": float(r[2]), "lon": float(r[3])}
                       for r in (await conn.execute(text(
                           "SELECT id, nombre, latitud, longitud FROM barrios "
                           "WHERE municipio_id = :m AND latitud IS NOT NULL"),
                           {"m": MUNICIPIO_ID}))]
            deps = {r[0]: r[1] for r in (await conn.execute(text(
                "SELECT categoria_id, municipio_dependencia_id FROM municipio_dependencia_categorias "
                "WHERE municipio_id = :m AND activo = 1"), {"m": MUNICIPIO_ID}))}
            # `IN :param` con text() NO se expande solo: necesita bindparam(expanding=True).
            q_vecinos = text(
                "SELECT id FROM usuarios WHERE municipio_id = :m AND email IN :e ORDER BY id"
            ).bindparams(bindparam("e", expanding=True))
            vecinos = [r[0] for r in (await conn.execute(
                q_vecinos, {"m": MUNICIPIO_ID, "e": list(VECINOS_DEMO)}))]
            supervisores = [r[0] for r in (await conn.execute(text(
                "SELECT id FROM usuarios WHERE municipio_id = :m AND rol = 'supervisor' ORDER BY id"),
                {"m": MUNICIPIO_ID}))]
            empleados_por_cat: dict[int, list[int]] = {}
            for eid, cid in (await conn.execute(text(
                "SELECT ec.empleado_id, ec.categoria_id FROM empleado_categorias ec "
                "JOIN empleados e ON e.id = ec.empleado_id WHERE e.municipio_id = :m"),
                {"m": MUNICIPIO_ID})):
                empleados_por_cat.setdefault(cid, []).append(eid)
            empleados_todos = [r[0] for r in (await conn.execute(text(
                "SELECT id FROM empleados WHERE municipio_id = :m AND activo = 1 ORDER BY id"),
                {"m": MUNICIPIO_ID}))]

            if not vecinos or not supervisores:
                raise SystemExit("[mapa-volumen] faltan usuarios demo (vecinos/supervisores) en el muni")

            # ---- idempotencia: codigos MV-#### ya presentes ----
            ya = {r[0] for r in (await conn.execute(text(
                "SELECT referencia FROM reclamos WHERE municipio_id = :m "
                "AND referencia LIKE :p"), {"m": MUNICIPIO_ID, "p": f"{MARCA} {PREFIJO}%"}))}
            pendientes = [p for p in plan if f"{MARCA} {p['codigo']}" not in ya]
            print(f"  [idempotencia] {len(ya)} ya sembrados · {len(pendientes)} a crear")

            # Antes de sumar volumen: cerrar la cola estancada que traia el muni,
            # que es la que da vuelta la curva de los meses recientes.
            cerrados = await _cerrar_legacy_estancados(conn, ahora, sla, supervisores)
            print(f"  [legacy] reclamos preexistentes estancados cerrados: {cerrados}")

            # ---- armado de filas ----
            filas, vidas = [], []
            for item in pendientes:
                cat_id = cats[item["categoria"]]
                item["categoria_id"] = cat_id
                barrio, _ = _mas_cercano(item["lat"], item["lon"], barrios)
                zona, _ = _mas_cercano(item["lat"], item["lon"], zonas)
                titulo, cuerpo = _elegir(PLANTILLAS[item["categoria"]], "txt", item["codigo"])
                fmt = {"c1": item["c1"], "c2": item["c2"], "b": barrio["nombre"]}
                vida = _ciclo_de_vida(item, hoy, ahora, sla)
                # El barrio va en la direccion: asi la deteccion por TEXTO del
                # backend (`services/barrio_detector`) coincide con el barrio_id.
                direccion = f"{item['c1']} c/ {item['c2']}, {barrio['nombre']}"
                canal = _elegir_pesado(CANALES, "canal", item["codigo"])
                candidatos_emp = empleados_por_cat.get(cat_id) or empleados_todos
                empleado_id = (_elegir(candidatos_emp, "emp", item["codigo"])
                               if vida["estado"] in ("en_curso", "finalizado",
                                                     "pendiente_confirmacion", "pospuesto")
                               and candidatos_emp else None)
                filas.append({
                    "municipio_id": MUNICIPIO_ID,
                    "titulo": titulo.format(**fmt)[:200],
                    "descripcion": cuerpo.format(**fmt),
                    "estado": vida["estado"],
                    "direccion": direccion[:255],
                    "latitud": item["lat"], "longitud": item["lon"],
                    "referencia": f"{MARCA} {item['codigo']}",
                    "categoria_id": cat_id,
                    "zona_id": zona["id"] if zona else None,
                    "barrio_id": barrio["id"] if barrio else None,
                    "creador_id": _elegir(vecinos, "vecino", item["codigo"]),
                    "canal": canal,
                    "dep_id": deps.get(cat_id),
                    "empleado_id": empleado_id,
                    "est_dias": vida["estimado_dias"], "est_horas": vida["estimado_horas"],
                    "fecha_estimada": vida["fecha_estimada"],
                    "fecha_recibido": vida["fecha_recibido"],
                    "motivo_rechazo": vida["motivo_rechazo"],
                    "descripcion_rechazo": vida["descripcion_rechazo"],
                    # POR QUE quedo frenado: lo resuelve `_ciclo_de_vida` junto
                    # con el estado, para que el motivo y la frase del historial
                    # sean SIEMPRE el mismo par.
                    "motivo_pausa": vida.get("motivo_pausa"),
                    "pausado_desde": vida.get("pausado_desde"),
                    "resolucion": vida["resolucion"],
                    "fecha_resolucion": vida["fecha_resolucion"],
                    "created_at": vida["creado"],
                    "updated_at": vida["fecha_resolucion"] or vida["fecha_recibido"] or vida["creado"],
                })
                vidas.append(vida)

            # ---- insert por lotes + historial ----
            creados = 0
            for i in range(0, len(filas), LOTE_INSERT):
                lote = filas[i:i + LOTE_INSERT]
                await conn.execute(SQL_INSERT_RECLAMO, lote)
                refs = [f["referencia"] for f in lote]
                q_ids = text(
                    "SELECT id, referencia FROM reclamos WHERE municipio_id = :m "
                    "AND referencia IN :r"
                ).bindparams(bindparam("r", expanding=True))
                ids = {r[1]: r[0] for r in (await conn.execute(
                    q_ids, {"m": MUNICIPIO_ID, "r": refs}))}
                hist = []
                for fila, vida in zip(lote, vidas[i:i + LOTE_INSERT]):
                    rid = ids.get(fila["referencia"])
                    if not rid:
                        continue
                    sup = _elegir(supervisores, "sup", fila["referencia"])
                    for ev in _historial_de(fila, vida, sup):
                        hist.append({"reclamo_id": rid, **ev})
                if hist:
                    await conn.execute(SQL_INSERT_HIST, hist)
                creados += len(lote)
                print(f"  [insert] {creados}/{len(filas)}")

            # ---- bloque de cobertura de la consulta guiada ----
            ctx = {
                "cats": cats, "deps": deps, "sla": sla, "zonas": zonas, "barrios": barrios,
                "vecinos": vecinos, "supervisores": supervisores,
                "empleados_por_cat": empleados_por_cat, "empleados_todos": empleados_todos,
            }
            cob_new, cob_ref = await _escribir_cobertura(
                conn, _plan_cobertura(hoy, osm), hoy, ahora, ctx)
            print(f"  [cobertura] creados={cob_new} refrescados={cob_ref}")

            return {"creados": creados, "existentes": len(ya), "legacy_cerrados": cerrados,
                    "cobertura_creados": cob_new, "cobertura_refrescados": cob_ref}
    finally:
        await engine.dispose()


# ===========================================================================
# Entrada del kit
# ===========================================================================
def sembrar(api, hoy: date) -> dict:
    osm = _cargar_osm()
    print(f"  [osm] cache {osm['_generado']} — {len(osm['esquinas'])} esquinas reales, "
          f"{len(osm['equipamiento'])} equipamientos, {len(osm['barrios'])} barrios "
          f"({osm['_area_osm']})")

    z_new, z_old = _sembrar_zonas(api, osm)
    print(f"  [zonas] creadas={z_new} existentes={z_old}")

    s_new, s_old = _sembrar_sla(api)
    print(f"  [sla] creados={s_new} existentes={s_old}")

    p_new, p_old = _sembrar_pois(api, osm)
    print(f"  [poi] creados={p_new} existentes={p_old}")

    plan = _plan_reclamos(hoy, osm)
    focos = sum(1 for p in plan if p["foco"])
    print(f"  [plan] {len(plan)} reclamos ({focos} en focos, {len(plan) - focos} repartidos) "
          f"sobre {DIAS_VENTANA} dias")

    res = asyncio.run(_escribir(plan, hoy, osm))

    # El matcheo reclamo<->POI SI tiene endpoint: lo hace el backend real.
    try:
        r = api.post("/poi/puntos/recalcular")
        print(f"  [poi] recalculo del backend: {r}")
    except Exception as e:  # noqa: BLE001 — no debe voltear la semilla
        print(f"  [poi] no se pudo recalcular por API: {e}")

    creados = res["creados"] + res["cobertura_creados"] + z_new + s_new + p_new
    existentes = res["existentes"] + z_old + s_old + p_old
    print(f"[mapa-volumen] creados={creados} existentes={existentes} "
          f"legacy_cerrados={res['legacy_cerrados']} "
          f"cobertura_refrescados={res['cobertura_refrescados']}")
    return {"creados": creados, "existentes": existentes,
            "legacy_cerrados": res["legacy_cerrados"],
            "cobertura_refrescados": res["cobertura_refrescados"]}
