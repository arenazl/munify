# Demos con la geografía real de la ciudad del cliente

**Fecha:** 2026-08-18 · **Estado:** catálogo cargado en QA y semilla enganchada, verificado end-to-end

## Para qué es

Que la demo de un intendente muestre reclamos en **calles de su ciudad**, no en
direcciones inventadas. Hasta acá `seed_demo.py` escribía a mano cosas como
`"Calle Güemes al 400, Villa Norte"` y las plantaba con un offset fijo sobre el
centro del municipio: en Asunción eso son calles que no existen y chinches en el
río Paraguay.

## El reparto batch / online

Es la decisión que ordena todo lo demás. La semilla corre **dentro del request**
de `POST /municipios/demo` (Python + SQLAlchemy, no SQL inyectado), así que no
puede esperar a ningún servicio externo.

**Batch — offline, una vez, versionado:**

| qué | dónde | costo |
|---|---|---|
| catálogo de municipios de 6 países | `scripts/cargar_catalogo_latam.py` | minutos, una vez |
| coordenadas que el cruce no resuelve | `scripts/completar_coords_faltantes.py` | una consulta por municipio |
| polígonos de los distritos | `scripts/cargar_distritos_infona.py` | instantáneo (archivo local) |
| ~60 direcciones reales por ciudad | `scripts/generar_puntos_demo.py` | 30-50 s por ciudad |

**Online — en el alta, milisegundos:** el combo devuelve el `id` del catálogo con
provincia y coordenadas ya resueltas; la semilla lee el cache y arma zonas,
barrios y reclamos con los IDs atados. **Cero llamadas externas.**

Una ciudad sin precalentar **crea la demo igual**, con el comportamiento de
antes. Nada se rompe por falta de cache.

## El algoritmo de los puntos

Idea del dueño, y evita mantener un callejero de Latinoamérica:

    sortear N coordenadas DENTRO del área del municipio  ->  N reverse geocoding

Cuatro detalles decidieron si funcionaba:

1. **Dentro del polígono, no del bounding box.** Medido: el 48% del rectángulo
   que encierra a Asunción es río o municipio vecino.
2. **Repartido por distrito**, proporcional al área. Un distrito vacío en el mapa
   se lee como "no hay datos".
3. **Sesgado al núcleo urbano** (70% dentro de 2 km del centro que devuelve
   Nominatim `search`). Sin esto, un pueblo con mucho campo devuelve rutas
   interurbanas en vez de calles.
4. **El sesgo tiene que valer también en los reintentos.** Fue el bug que hizo
   que la primera versión no mejorara nada: con tasa de descarte alta casi todos
   los puntos finales salen de reintentos.

Sin calle cerca, el punto se descarta: nunca se rellena con algo plausible. El
**distrito** sale del polígono donde cayó y el **barrio** lo devuelve Nominatim.

| ciudad | fuente del área | resultado | llamadas |
|---|---|---|---|
| Asunción (capital, 6 distritos) | INFONA oficial | 19/20, 15 barrios | 31 |
| Caacupé (pueblo con mucho campo) | INFONA oficial | 10/10, 7 calles urbanas | 36 |
| Villa Carlos Paz (sin fuente oficial) | círculo sobre el centro | 8/8 | 11 |

## El catálogo, país por país

El criterio es uno solo: **el nivel donde hay intendente o alcalde**.

| país | qué se cargó | cantidad | nota |
|---|---|---|---|
| Argentina | municipios | 2.082 | ya estaba (georef datos.gob.ar) |
| Perú | distritos | 1.873 | el oficial dice 1.874 |
| Bolivia | ADM3 | 539 | **los municipios oficiales son 339**: GeoNames mezcla cantones |
| Chile | comunas | 346 | coincide con lo oficial |
| Paraguay | intendencias | 263 | ya estaba, y es más completo que GeoNames (246) |
| Uruguay | departamentos | 19 | el intendente uruguayo es departamental |

Los dumps de GeoNames **no se versionan** (6 MB); el resultado sí, en
`scripts/datos/catalogo_latam.json`. Cómo rebajarlos está en el docstring del
script.

### Paraguay tenía las 263 coordenadas en 0,0

Una demo paraguaya nacía en el Golfo de Guinea. Se completaron cruzando fuentes
offline y cerrando la cola corta con consultas por nombre, validando que la
respuesta cayera dentro del país. **Quedan 0 sin coordenadas.**

## Verificación

Demo completa de Caacupé creada contra QA y borrada después:

```
Mariscal José Félix Estigarribia | Caacupe | Ybu               | -25.3825,-57.135
Pedro T. Avero                   | Caacupe | Barrio Daniel Es… | -25.3779,-57.1398
Intendente Ortiz                 | Caacupe | Ybu               | -25.3832,-57.1429
```

Cascade de borrado sin huérfanos. `tsc -b` y ESLint limpios.

El test acepta `DEMO_TEST_NOMBRE` para apuntarlo a una ciudad con cache. **Nunca
apuntarlo a un municipio que exista de verdad**: lo borra al terminar.

## Comandos

```bash
python scripts/cargar_catalogo_latam.py            # catálogo de los 6 países
python scripts/completar_coords_faltantes.py --pais PY
python scripts/generar_puntos_demo.py --nombre "Encarnacion" --pais PY
DEMO_TEST_NOMBRE=Caacupe python scripts/_test_semilla_demo_completa.py
```

## Lo que queda abierto

- **Precalentar más ciudades.** Hoy hay tres. Las ~3.500 del catálogo a 40 s cada
  una son 39 horas contra un servicio comunitario gratuito: no se hace. Lo
  sensato son ~200 (capitales provinciales y las que pida ventas), unas 2 h 30.
- **Ciudad sin cache al crear la demo.** Hoy cae al comportamiento viejo. La
  opción propuesta y no implementada es generarla en background al momento del
  alta, para que esté lista antes de que el vendedor llegue al mapa.
- **Bolivia**, si hace falta la división oficial de 339 municipios, necesita otra
  fuente que GeoNames.
