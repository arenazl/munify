# Demos con calles reales de la ciudad del cliente

**Fecha:** 2026-08-18 · **Estado:** servicio listo y verificado · **Falta:** engancharlo en la semilla

## Para qué es

Que la demo de un intendente muestre reclamos en **calles de su ciudad**, no en
direcciones inventadas. Hasta hoy `seed_demo.py` escribía a mano cosas como
`"Calle Güemes al 400, Villa Norte"` y las plantaba con un offset fijo sobre el
centro del municipio: en Asunción eso son calles que no existen y chinches en el
río Paraguay.

## El algoritmo

Idea del dueño, y evita mantener un callejero de Latinoamérica:

    sortear N coordenadas DENTRO del área del municipio  ->  N reverse geocoding

Cuatro detalles que decidieron si funcionaba o no:

1. **Dentro del polígono, no del bounding box.** Medido: el 48% del rectángulo
   que encierra a Asunción es río o municipio vecino.
2. **Repartido por distrito**, proporcional al área. Veinte puntos libres dejan
   distritos vacíos, y un distrito vacío en el mapa se lee como "no hay datos".
3. **Sesgado al núcleo urbano** (70% dentro de 2 km del centro que devuelve
   Nominatim `search`). Sin esto, un pueblo con mucho campo devuelve rutas
   interurbanas en vez de calles.
4. **El sesgo tiene que valer también en los reintentos.** Fue el bug que hizo
   que la primera versión no mejorara nada: con tasa de descarte alta, casi todos
   los puntos finales salen de reintentos, así que si el reintento sortea
   uniforme el sesgo se evapora entero.

Sin calle cerca, el punto se descarta y se sortea otro: nunca se rellena con una
dirección plausible. El **distrito** sale gratis (el punto ya cayó en un
polígono conocido) y el **barrio** lo devuelve Nominatim.

## Medido, no estimado

| ciudad | fuente del área | resultado | llamadas |
|---|---|---|---|
| Asunción (capital, 6 distritos) | INFONA oficial | 19/20, 15 barrios | 31 |
| Caacupé (pueblo con mucho campo) | INFONA oficial | 10/10, 7 calles urbanas | 36 |
| Villa Carlos Paz (sin fuente oficial) | círculo sobre el centro | 8/8 | 11 |

Caacupé antes del punto 4: 7/10 y 50 llamadas, con 3 de 7 rutas.

## Qué hay en el repo

- `backend/services/geo_demo.py` — el servicio. Sorteo, geocoding, cache.
- `backend/scripts/generar_puntos_demo.py` — CLI, una corrida por ciudad.
- `backend/scripts/semillas/datos/puntos_<ciudad>.json` — el cache resultante.

```bash
python scripts/generar_puntos_demo.py --nombre "Asuncion" --pais PY --dpto A
python scripts/generar_puntos_demo.py --nombre "Villa Carlos Paz" --pais Argentina
python scripts/generar_puntos_demo.py --nombre "Merlo" --muni 48   # zonas de la base
```

Con solo `--nombre` y `--pais` alcanza: el centro lo resuelve el propio script.

## Por qué es un script y no parte del endpoint

Nominatim admite 1 pedido/segundo, así que una ciudad son 30-50 segundos. Adentro
del request que crea la demo eso es un timeout. Se corre **una vez por ciudad** y
queda cacheado; la creación de la demo sigue siendo instantánea y no toca la red.
El sorteo va con semilla derivada del nombre: la misma ciudad da siempre la misma
demo.

## Lo que falta (no hecho, pendiente de OK)

Engancharlo en `backend/services/seed_demo.py`, que hoy tiene:

- `RECLAMOS_DEMO` con `direccion`, `lat_offset`, `lng_offset` escritos a mano
  (~línea 406) y aplicados en la línea 1314.
- `ZONAS_DEMO` / `BARRIOS_DEMO` inventados (Centro/Norte/Sur/Este/Oeste).
- Un reverse-geocode propio para la dirección de cada vecino (~línea 1042) con
  offset ciego sobre el centro, que este servicio reemplaza.

El cambio es: si `geo_demo.puntos_para_semilla(nombre_muni, n)` devuelve puntos,
el reclamo usa esa dirección/lat/lon/zona/barrio; si devuelve vacío, queda el
comportamiento de hoy. Sin cache, nada se rompe.

Decisión abierta: qué pasa cuando se crea una demo de una ciudad **sin cache**.
Opciones: (a) generarla en background y que la demo arranque con lo de hoy;
(b) precalentar las N ciudades más probables; (c) aceptar ~40s en el alta.
