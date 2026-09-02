# Batch — todo lo caro pasa acá, offline

La semilla de demos corre **dentro del request** de `POST /municipios/demo`
(Python + SQLAlchemy). Ahí no se puede esperar a ningún servicio externo: una
demo tiene que crearse en segundos, delante de un cliente, sin depender de que
Nominatim u Overpass estén arriba.

De ahí sale el reparto que ordena todo:

| | qué pasa | cuándo |
|---|---|---|
| **batch** | descargas, geocoding, cruces entre fuentes, geometría | offline, una vez por país o por ciudad |
| **en vivo** | leer IDs y datos ya resueltos | en el alta, milisegundos, cero red |

Una ciudad que no pasó por acá **crea su demo igual**, con direcciones genéricas
y un círculo aproximado en vez de su límite real. Estos scripts mejoran la demo;
no la habilitan.

## Orden de corrida

```bash
# 1. El catálogo de municipios de los 6 países (nombre, provincia, coordenadas)
python scripts/batch/cargar_catalogo_latam.py

# 2. Las coordenadas que el cruce offline no pudo resolver
python scripts/batch/completar_coords_faltantes.py --pais PY

# 3. El límite oficial de cada municipio
python scripts/batch/contornos_municipios.py --pais PY --iso3 PRY --nivel ADM2

# 4. Los distritos INTERNOS, sólo donde existen (capitales)
python scripts/batch/cargar_distritos_infona.py --muni 146 --dpto A

# 5. Las direcciones reales de una ciudad (~40 s cada una)
python scripts/batch/generar_puntos_demo.py --nombre "Encarnacion" --pais PY
python scripts/batch/precalentar_ciudades.py          # varias de una
```

Todos son **idempotentes**: se pueden volver a correr sin romper nada.

## Qué hace cada uno

| script | qué deja |
|---|---|
| `_comun.py` | rutas, conexión a QA, normalización de nombres y geometría compartida |
| `cargar_catalogo_latam.py` | `municipios_catalogo` con los 6 países, desde GeoNames |
| `completar_coords_faltantes.py` | cierra la cola de municipios sin coordenadas, preguntando por nombre |
| `contornos_municipios.py` | `municipios_catalogo.poligono`, desde geoBoundaries |
| `cargar_distritos_infona.py` | `zonas` con los distritos internos (Paraguay, fuente INFONA) |
| `generar_puntos_demo.py` | `semillas/datos/puntos_<ciudad>.json` con direcciones reales |
| `precalentar_ciudades.py` | lo mismo para una lista de ciudades, en serie |

## Las tres reglas que se respetan acá

**1. Nunca se escribe en producción.** `_comun.url_qa()` sale gritando si la base
no es QA. Promover a producción es de Infraestructura.

**2. Ningún dato inventado.** Si una fuente no tiene el dato, queda NULL y se
informa — nunca se rellena con algo plausible. Una altura sacada de un hash o el
contorno del municipio vecino son peores que un campo vacío, porque parecen
ciertos.

**3. Se verifica, no se confía.** Cada cruce entre fuentes tiene un control
geométrico o de rango que puede rechazarlo, y lo rechazado se lista:

- las coordenadas que devuelve una búsqueda por nombre tienen que caer dentro
  del país;
- el contorno que se le asigna a un municipio tiene que contener su centro;
- si muchos municipios comparten contorno, el nivel administrativo pedido no es
  el municipal y el script **aborta sin escribir** (pasa en Argentina, donde
  `ADM2` son departamentos que contienen varios municipios).

## Datos descargados

`scripts/datos/geonames/` y `scripts/datos/contornos/` **no se versionan**: son
cientos de MB que se rebajan con un comando. Lo que sí se versiona es el
resultado ya recortado (`scripts/datos/catalogo_latam.json`) y los puntos por
ciudad (`scripts/semillas/datos/puntos_*.json`).

## Contornos: qué quedó cargado

| país | con contorno | fuente | cómo se emparejó |
|---|---|---|---|
| Argentina | 2.082 / 2.082 | IGN — `infra.datos.gob.ar/georef` | **por id oficial**, sin heurística |
| Uruguay | 19 / 19 | geoBoundaries ADM1 | geométrico |
| Chile | 337 / 346 | Biblioteca del Congreso, ADM3 | geométrico |
| Paraguay | 244 / 263 | DGEEC, ADM2 | geométrico |
| Perú | **0** | — | ADM2 son provincias (196) y el catálogo son distritos (1.873) |
| Bolivia | **0** | — | ADM3 agrupa 1,49 municipios del catálogo por área |

Los dos que están en cero **no fallaron: los frenó una guarda**, y siguen usando
el círculo aproximado, que en su caso miente menos que el contorno del vecino.

- **Perú** necesita la división distrital del INEI; geoBoundaries no la publica.
- **Bolivia** tiene un problema anterior: nuestro catálogo son 539 (GeoNames
  mezcla cantones) contra 339 municipios oficiales. Lo correcto es rehacer el
  catálogo boliviano desde los 339 de GeoBolivia — que ya está descargado — y
  recién ahí los contornos salen 1:1.
- **Argentina** es el caso a imitar: cuando el país publica sus municipios con
  geometría y el catálogo salió de la misma fuente, el emparejamiento es por
  identificador y no hay nada que adivinar. Por eso existe `FUENTES` en
  `contornos_municipios.py`.

## Lo que todavía no está resuelto

- **Precalentar a escala.** Son ~40 s por ciudad contra un servicio comunitario
  gratuito: las 5.122 del catálogo serían 39 horas seguidas y no se hace. Lo
  sensato son ~200 (capitales y donde haya prospectos).
- **Ciudad sin precalentar al crear la demo.** Hoy cae al comportamiento viejo en
  silencio. Falta decidir si se dispara la generación en background.
- **Argentina y Perú** no tienen en geoBoundaries un nivel que sea el municipal:
  `ADM2` es departamento/provincia y `ADM3` no está publicado. Para esos hace
  falta otra fuente (en Argentina, georef del IGN sí publica geometría de
  municipios).
