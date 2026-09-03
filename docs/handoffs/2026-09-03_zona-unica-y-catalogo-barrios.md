# Handoff 2026-09-03 — la zona es del negocio: Zona única + `catalogo_barrios`, y la semilla que ya no fabrica geografía

> Reemplaza la sección 5 ("Etapa siguiente") del handoff anterior
> ([`2026-09-02_cartografia-offline-pbf.md`](2026-09-02_cartografia-offline-pbf.md)):
> los "polígonos de barrio" ya están, pero con un modelo distinto al que ese
> doc anticipaba. Lo demás de ese handoff (la herramienta del PBF, `catalogo_geo_osm`,
> la purga de prod) sigue vigente.

## 1. La decisión (Lucas, 2026-09-03, textual)

> "La zona es un criterio que define la cuadrilla, lo define el municipio. Es un
> concepto del negocio y no de la georreferencia. La cadena era municipio, zona
> única y barrios. No empecemos a meter un nivel más."

> "El seed no fabrica más nada ahora. El seed lee el municipio, lee el registro
> hardcodeado de zona única y lee los barrios, y lee los polígonos de los
> barrios. O sea, no genera ni crea nada. Lo que sí va a crear son puntos… los
> puntos de los reclamos."

Consecuencias, en una tabla:

| Antes (hasta `34d74cbe`) | Ahora (`51255e43`, `1baff58e`) |
|---|---|
| Zonas = localidades del padrón (`catalogo_zonas`) si dividía en 2+, o localidades de OSM, o zona única | **Siempre UNA zona: "Zona única"**, con el contorno del municipio (`municipios_catalogo.poligono`). El municipio arma las suyas en Zonas |
| Barrios = `place=suburb/…` del paquete `catalogo_geo_osm`, recortados a `MAX_BARRIOS=60` por cercanía al casco, como PUNTO | **Todos** los de `catalogo_barrios`, con su polígono cuando lo tienen, colgados de la zona única. Sin tope |
| `MAX_ZONAS`, `MAX_BARRIOS`, promoción de barrio a zona, zonas con nombre de calle | Eliminados. Nada se inventa; sin filas en el catálogo, la demo nace con la zona única y sin barrios y la bitácora lo dice |
| Reclamo → barrio más cercano a 3 km | Reclamo → barrio que lo **contiene** (si varios, el más chico); si ninguno tiene contorno, el más cercano a 3 km; más lejos, sin barrio |
| Sin calles: puntos dentro de las localidades del padrón | Sin calles: puntos dentro de los contornos de los barrios (o su centro), con el nombre del barrio |

La localidad **no es un nivel**: `catalogo_zonas` (georef) quedó como una de las
dos FUENTES del catálogo de barrios (las localidades de un partido — Libertad,
Mariano Acosta, Pontevedra en Merlo — son barrios con contorno, `fuente=georef`).

## 2. La tabla nueva: `catalogo_barrios`

```
municipio_catalogo_id VARCHAR(20)  -- FK lógica a municipios_catalogo.id
pais, nombre, nombre_norm, tipo    -- tipo: suburb|neighbourhood|quarter|city|town|village|hamlet|admin9|admin10|localidad
lat, lon DOUBLE, poligono MEDIUMTEXT (JSON [[lon,lat],…]), vertices
fuente  osm_pbf|georef, osm_id, actualizado_en
UNIQUE (municipio_catalogo_id, nombre_norm), collation utf8mb4_general_ci
```

La llena `backend/scripts/geo/catalogo_barrios_pbf.py`, offline, desde el
`.osm.pbf` de Geofabrik (pyosmium + shapely; relaciones armadas con
`services/osm_regiones._anillo_exterior`) más las localidades con contorno de
`catalogo_zonas`:

```bash
# desde la raíz del repo; la URL de QA sale del entorno, nunca del código
DATABASE_URL_QA="$(...)" python backend/scripts/geo/catalogo_barrios_pbf.py \
    --env qa --pais AR --pbf <scratch>/pbf/argentina-latest.osm.pbf \
    --provincia "Santa Fe" --aplicar
# fase 1 (una vez por país): pasada por el PBF -> barrios_AR.sqlite (~4 min AR)
# fase 2: por provincia, tandas de 10 municipios con commit, DELETE+INSERT por
#         municipio (idempotente; se puede relanzar donde murió)
```

Filtro de cardinales (`geo_ciudad.es_cardinal`): rechaza Norte/Sur/Este/Oeste y
compuestos, y también "Distrito Norte", "Zona Sur", "Sector Centro" (prefijos
de reparto). Rosario pasó de 6 distritos falsos a 0.

### Cobertura escrita en QA (`sugerenciasmun-qa`), corrida COMPLETA del 2026-09-03 (00:00–01:15 ART)

| País | Municipios con barrios | Con algún contorno | Barrios | Con polígono |
|---|---|---|---|---|
| AR | 1.308/2.082 | 807 | 23.434 | 12.156 (52%) |
| PY | 202/244 | 52 | 2.211 | 599 (27%) |
| UY | 19/19 | 14 | 1.401 | 262 (19%) |
| CL | 337/337 | 78 | 23.353 | 395 (2%) |
| BO | 483/483 | 98 | 27.902 | 362 (1%) |
| PE | 1.575/1.641 | 72 | 78.152 | 984 (1%) |

En CL/BO/PE la masa son `village`/`hamlet` (caseríos rurales que OSM carga como
punto), no barrios urbanos; el polígono de barrio ahí va a salir de otra fuente
o no va a salir. Por provincia argentina (barrios / % con polígono): Buenos
Aires 4.249 / 61%, Santa Fe 1.470 / 74%, Río Negro 1.030 / 74%, La Pampa 75%,
CABA 70%, Neuquén 67%, San Luis 66%, Mendoza 64%, Corrientes 63%, Córdoba
2.105 / 54%, San Juan 2.114 / 54%, Catamarca 49%, Entre Ríos 42%, Chaco 39%,
Misiones 2.499 / 37%, Chubut 36%, La Rioja 36%, Jujuy 29%, Salta 23%,
**Tucumán 11%, Formosa 6%** (las dos flojas). Tierra del Fuego 86%.

**El JSON de faltantes** (pedido de Lucas: *"guardamos un JSON con los faltantes
y lo vamos curando con otras fuentes cuando se pueda"*):
`backend/scripts/datos/faltantes_barrios.json` (3 MB), lo escribe
`backend/scripts/geo/faltantes_barrios.py --env qa` (sólo lectura). Trae
`resumen` por país y provincia, `municipios_sin_barrios` (882: AR 774, PE 66,
PY 42), `municipios_sin_ningun_contorno` (2.803) y `barrios_sin_poligono`
barrio por barrio **sólo de AR/PY/UY** (14.029 filas; con los seis países son
141.695 filas y 26 MB, y 128.000 son los caseríos de CL/BO/PE — se regenera
con `--detalle CL` si hace falta).

Orden fijado por Lucas: Buenos Aires → Córdoba → Santa Fe → resto de AR → Paraguay → resto.

## 3. Qué hace la semilla ahora (`backend/services/geo_ciudad.py`)

`geografia()` en pasos, todos en la bitácora del alta:

1. `geo:poligono` — contorno de `municipios_catalogo`.
2. `geo:zonas` — siempre `[zona_unica(lat, lon, anillo)]`, `fuente_zonas="zona_unica"`.
3. `geo:barrios` (nuevo) — `barrios_del_catalogo(db, catalogo_id)`: `ok` con
   `barrios/con_contorno/nombres`, o `degradado` "municipio sin barrios en
   catalogo_barrios: correr scripts/geo/catalogo_barrios_pbf.py".
4. `geo:osm` — calles/direcciones de `catalogo_geo_osm` (sin cambios).
5. `geo:puntos` — `armar()`: lo ÚNICO que se genera. `barrio_de()` = contiene
   (el más chico) → cercano a 3 km → ninguno.

`seed_demo._seed_barrios` copia `poligono` a `barrios.poligono` (columna
`deferred`, la lee `/api/zonas/regiones_mapa` y la dibuja `Mapa.tsx`).

Prueba en seco contra QA (sólo SELECT, `scratchpad/probar_geografia.py`):
Merlo 98 barrios / 10 con contorno / 30 de 30 puntos con barrio (Parque San
Martín, Libertad, Mariano Acosta…); Pergamino 86 / 58 / 27 de 30; Rosario 0
barrios porque Santa Fe todavía no había corrido — nace con Zona única, sin
inventar.

**Verificado con una demo NUEVA en QA** después del deploy de `1baff58e`
(revisión `munify-api-qa-00391`): `POST /api/municipios/crear-demo` Merlo →
muni 1000175 `merlo-2`, 18,6 s, bitácora `demo_seed_logs` id 31 con 25/25
pasos ok y 0 degradaciones; `geo:barrios` = {fuente: catalogo_barrios,
barrios: 98, con_contorno: 10}; en la base: 1 zona ("Zona única", polígono de
7.986 chars), 98 barrios / 10 con polígono / 98 colgados de la zona, 50/50
reclamos con barrio y coordenadas (Parque San Martín 14, Mariano Acosta 9,
Libertad 8…).

**Fallback (Lucas, 2026-09-03):** *"cuando un municipio no tenga los polígonos
de los barrios, pone el polígono del municipio, y listo, no tiene que romper.
Sí tiene que cargar los barrios, el listado."* Ya es así sin código extra: la
lista de barrios se siembra siempre (con su punto), la Zona única lleva el
contorno del municipio y `/api/zonas/regiones_mapa` dibuja la zona y sólo los
barrios con polígono. Con 0 polígonos el mapa muestra el contorno y los pines.

## 4. Lo que tiene que repetir Infra al promover

1. **`catalogo_barrios` viaja a prod con la promoción**, igual que
   `catalogo_geo_osm`: copia de tabla desde QA (`mysqldump --replace`). Se
   avisa por `CANAL_AGENTES.md` cuando termine la cobertura.
2. Sigue pendiente de Infra la purga de demos legacy en prod
   (`MSG-20260902-2357-01` → `MSG-20260903-0006-01`): `purgar_demos.py` acepta
   `PURGA_CONFIRMO=<nombre exacto de la base>` sin TTY (`c2994fdc`,
   `backend/scripts/_entorno.py`, que antes estaba gitignored y ahora se
   versiona). El override quedó **sin probar en runtime** en esta sesión (el
   clasificador de permisos lo bloqueó dos veces; no se esquivó).

## 5. Pendiente (no bloqueante)

- **Demos ya sembradas en QA con zonas por localidad** (La Matanza 16 zonas,
  Pergamino 15, Moreno 6, Merlo 5): script que las convierta a Zona única +
  barrios del catálogo y recuelgue los reclamos. Nunca tocar SPN (80).
- `scripts/geo/sembrar_zonas.py` siembra zonas desde `catalogo_zonas` con el
  modelo viejo: hoy es LEGACY; adaptarlo o borrarlo con el script de arriba.
- Curar `faltantes_barrios.json` con otras fuentes cuando se pueda (IGN,
  catastros provinciales, INDEC radios censales); primero Tucumán y Formosa,
  que tienen barrios pero casi sin polígono. Re-correr el script después de
  cada curación para que el JSON refleje el estado real.
- `POST /municipios/crear-demo` sigue llamando a Nominatim si el front no manda
  lat/lng, y `POST /municipios` (super admin) usa `services/barrios_auto`
  ("IA + Nominatim"): los dos contradicen "la cartografía no se hace online
  nunca". Señalado, sin tocar: necesita consentimiento.
- Los huecos del handoff anterior siguen: `contornos_osm_pbf.py --solo
  ciudad_afuera` (121 AR), `--solo sin_poligono` (316 no-AR), 68 comunas de
  Córdoba con el centro fuera de su polígono.

## 6. Gates y trampas pagadas

- Backend: `python -m pyflakes services/geo_ciudad.py services/seed_demo.py`
  antes de pushear (ambos limpios en `1baff58e`).
- **Corridas de más de 10 minutos van detached** (`Start-Process
  "C:\Program Files\Git\bin\bash.exe" script.sh` desde PowerShell — con la
  ruta completa: `bash` a secas en PowerShell es el de WSL y no arranca nada):
  el timeout del tool las mata. Y aun detached la corrida "resto de AR" murió
  después de Córdoba sin rastro en el log; se relanzó desde Santa Fe (el
  script es idempotente por municipio) y el wrapper ahora escribe hora y pid
  en cada cabecera.
- Fuera de Argentina los ids del catálogo son `py-1704`, `uy-3443756`… y el
  padrón georef (`catalogo_zonas`, columna INT) no existe: la fase 2 moría en
  `int(m["id"])` en los cinco países. Corregido en `f0e2c2b6` (padrón vacío
  afuera de AR); las fases 1 (sqlite por país) se reutilizan al relanzar.
- Dos agentes en el mismo working tree: commitear con lista explícita de
  archivos, nunca `git add -A`, nunca `frontend/dist/`.
- La consola de Windows muestra `�` por los acentos: es encoding de la
  terminal, los datos en la base están bien (utf8mb4).
