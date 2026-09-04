# Handoff — 2026-09-01 · localidades con contorno, mapa y calls

> **Desactualizado en lo que toca a `calls` (nota del 2026-09-04).** La página
> se mudó a `d:\Code\munify-calls` (repo `arenazl/munify-calls`, branch `main`)
> y su copia en este repo se borró. Las rutas `scripts/calls/` y
> `frontend/public/calls/` que se nombran abajo **ya no existen acá**; el
> resto del handoff sigue valiendo.


Estado al cerrar la sesión. Todo pusheado a `qa` (repos `sugerenciasMun` y
`landing`, cada uno a su rama `qa`). `master` no se tocó.

## 0. Dónde está la data

**La base viva es `sugerenciasmun-ensayo`.** `sugerenciasmun-qa` quedó muerta;
`backend/.env` apuntaba ahí y se corrigió en esta sesión. Los scripts aceptan
`--db` para no depender del `.env`.

## 1. El padrón de localidades

```
municipios_catalogo   5.122 municipios | 4.806 con contorno
catalogo_zonas        4.011 localidades | 3.617 con área (90%)
                      1.868 municipios con al menos una localidad dibujada
```

**La clave del cruce:** `municipios_catalogo.id` ES el código INDEC, y georef lo
devuelve en `municipio.id`. Es un JOIN, no una inferencia. Ojo con el tipo: en
`municipios_catalogo` es varchar con ceros (`'060568'`) y en `catalogo_zonas`
es int (`60568`) — sin normalizar, el índice de lo ya cargado no reconoce nada.

**Las fuentes, y por qué cada una:**

- **georef (datos.gob.ar / INDEC) ENUMERA** — 4.037 localidades. Es el único
  padrón que distingue las del conurbano.
- **OSM / Nominatim DIBUJA** — con `featureType=settlement`, y sin él para las
  variantes. Estable, 1 request por segundo.
- **El IGN sirve para el interior, no para el AMBA**: su capa de localidades es
  de PLANTA URBANA (mancha edificada) y todo el conurbano viene como un solo
  polígono "Gran Buenos Aires" de 89×90 km. Cubre ~1.776 de 2.111 municipios.
- **Overpass está caído** (504 en overpass-api.de, 502 en kumi) y no hace falta.
- geoservicios del INDEC: DNS caído.

**Las guardas, todas por casos reales:**

1. no reusar contorno de nivel municipio: el partido contiene a su cabecera
   homónima y pasa la validación "contiene el centroide" (42 casos corregidos);
2. un dibujo que ocupa >70% del municipio con varias localidades es el partido;
3. nada más grande que su propio municipio entra ni se siembra — la capa del
   IGN trae los aglomerados como una localidad más, y "Gran Buenos Aires"
   colgaba de La Matanza (28 borrados);
4. las 21 entradas residuales del censo (se llaman como el municipio, sin
   contorno, en municipios con varias localidades) quedaron fuera.

**Criterio del dueño: manda el POLÍGONO, no el nombre.** 1.497 localidades se
llaman igual que su municipio y casi todas son cabeceras legítimas (Azul en Azul).

**Lo que falta (394) no lo resuelve OSM**: son barrios y conjuntos
habitacionales que el INDEC cuenta como localidad pero ninguna fuente dibuja
como área (`Barrio Banco Provincia`, `Villa Argüello`, `245 Viviendas`). Entran
al catálogo con su centroide oficial: existen, no se pintan. Si un municipio los
necesita, se marcan a mano con el editor de polígonos de la app.

### Scripts (`backend/scripts/geo/`)

| script | qué hace |
|---|---|
| `catalogo_localidades.py` | llena el padrón. `--provincia`, `--limit`, `--dry-run`, `--rellenar` (2º pase por posición), `--cascada` (3º pase, 4 variantes de búsqueda) |
| `sembrar_zonas.py` | padrón → `zonas` de un municipio. `--municipio`, `--catalogo` |
| `vincular_zonas.py` | parche directo sobre zonas ya cargadas |

Los de `ar.py`, `bo.py`, `cargar.py`, `common.py`, `py.py` son la carga del IGN
a `geo_administrative_unit` (previa, de otra tanda).

### Cómo lo consume la app

`geo_ciudad.geografia()` toma el contorno del municipio de `municipios_catalogo`,
**las localidades del padrón** (`zonas_del_catalogo`, por geometría) y las calles
de Overpass. **Quién manda depende del municipio**: en un PARTIDO (Morón, La
Matanza) la división son las localidades y gana el padrón; en una CIUDAD
(Rosario, una sola localidad) la división son sus barrios y `armar()` ya los
promueve — imponer el padrón ahí devuelve UNA zona que abarca todo, que es el
bug del fix de Villa Carlos Paz (`40115eaf`).

Zonas y barrios corren en SAVEPOINT: la geografía ya no puede tirar abajo el alta.

## 2. Sembrados y probados

- **Morón** (tenant `1000155`): 5/5 — Haedo, Morón, Villa Sarmiento, Castelar,
  El Palomar.
- **La Matanza** (tenant `78`): 16 zonas, 14 dibujadas. **Su ficha tiene las
  coordenadas en Chaco** (−26.57, −60.17, cae en Quilitipi): sembrar con
  `--catalogo 060427` explícito. Sin corregir.
- **Mendoza** (×3): la ficha apunta a San Rafael (−34.60 en vez de −32.89).

Los mejores para demo: General San Martín 28, San Rafael 25, La Plata 19,
Tres de Febrero 16, La Matanza 15. **1.311 municipios tienen una sola localidad**
— son ciudades, el mapa no muestra divisiones ahí.

## 3. Mapa (`frontend/src/pages/Mapa.tsx`)

- pantalla completa: maximiza el BLOQUE (pregunta + filtros + mapa + banda), no
  el lienzo. El envoltorio es `display: contents` mientras no está maximizado.
- **portales**: en pantalla completa el navegador dibuja sólo el subárbol del
  elemento maximizado, así que un portal en `document.body` no se ve. Resuelto
  con `lib/portalHost.ts` (`ModernSelect` y `SideModal`).
- **zoom de rueda**: se cuenta el GESTO, no milisegundos. Un golpe de rueda
  dispara decenas de eventos con inercia; con topes de tiempo entraban 5-6
  niveles. Ahora: primer evento hace el zoom, el resto se ignora hasta 260 ms de
  silencio. Es el tercer intento sobre lo mismo (ver `5a113710`).
- **recorrido**: ACUMULA (antes ventana móvil de 30 días, que nunca mostraba
  acumulación) y el paso sale de la cantidad de reclamos, no del calendario.
  2 reclamos por tick, 1000 ms. La banda dice qué reclamo entró.

### Pendiente en el mapa

1. **el relator de casos** (pedido del dueño, no empezado): que el play recorra
   N casos —selector 10 / destacados / la mitad / todos— encuadrando el lugar,
   con foto, descripción y cómo quedó, uno por uno. **Primero hay que verificar
   si los reclamos de las demos tienen fotos cargadas.**
2. re-encuadrar el mapa al maximizar (hoy muestra más territorio en vez de
   agrandar el municipio).
3. que el relleno de las áreas no se apague en modo densidad.

## 4. Calls (`scripts/calls/`)

**No usa base de datos.** Tres piezas:

- **datos**: embebidos en el HTML (`const DATOS = {...}`), generados por
  `build_calls.py` desde `docs/regiones/`;
- **estado**: `localStorage` del navegador (a quién llamaste, meta del día,
  vista) — **es por ORIGEN**: `app.munify.com.ar/calls` y
  `qa-app.munify.com.ar/calls` tienen registros separados y no se migran solos.
  Para eso están "Bajar copia" / "Restaurar";
- **IA**: único fetch al backend, `POST /api/public/calls/ia`.

Nunca editar `frontend/public/calls/index.html`: se edita `plantilla.html` y se
corre `build_calls.py`.

**Argentina está filtrada a propósito** desde el 30/8: `fuera = {"Argentina"}` en
`build_calls.py` saca 93 municipios (quedan 61) y baja el archivo de 288 a
211 KB. Nada se borró: siguen en las planillas. Devolverlos = vaciar ese set y
correr el build.

**Decisión pendiente:** el dueño quiere una sola versión vigente, sin ambientes.
Recomendación dada: producción. Antes de mudarse, **bajar la copia del estado de
QA** o se pierde.

## 5. Landing (repo `arenazl/landing`, rama `qa`)

- menú móvil rehecho por CSS: vidrio, Inter (la de la app), logo con presencia,
  utilidades iguales entre sí, un solo radio para todo lo que se toca;
- chips del hero: **Celular · Web · WhatsApp · Oficina** (fuera "PWA sin
  instalar", también del FAQ);
- la etiqueta "En terreno · las cuadrillas…" pasó a la esquina superior derecha.

Ojo: hay OTRA sesión trabajando en la landing (`js/munify-demo.js`, creación de
demos). Pushear con `git pull --rebase` primero.

## 6. Marca white-label

`stamp-og.mjs` ahora sella la marca en la ficha de compartir (título,
descripción, og:*, twitter:*, theme-color, y el icono de la marca como imagen),
leyendo `VITE_BRAND` y `src/brands/index.ts`. **Sin verificar:** que el site de
`pylimpio.munify.com.ar` buildee con `VITE_BRAND=paraguay-limpio`. Si comparte
build con Munify, esto no alcanza y hay que hacerlo en el edge con una Pages
Function.
