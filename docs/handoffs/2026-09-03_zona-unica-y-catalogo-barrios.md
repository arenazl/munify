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

### Cobertura escrita en QA (`sugerenciasmun-qa`) al cierre de esta sesión

| Provincia | Municipios con barrios | Barrios | Con contorno |
|---|---|---|---|
| Buenos Aires | 135/135 | 4.249 | 2.634 (62%) |
| Córdoba | 177/427 | 2.105 | 1.144 (54%) |
| Santa Fe y 19 provincias más | **corriendo** al cierre (detached, log `scratchpad/barrios_AR_resto.log`) | — | — |
| UY, PY, CL, BO, PE | pendientes (`PAIS=XX PBF=… --aplicar`, PBFs ya bajados) | — | — |

Orden fijado por Lucas: Buenos Aires → Córdoba → Santa Fe → resto de AR → otros países.

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

**No verificado todavía:** una demo NUEVA creada en QA después del deploy de
`1baff58e` (mirar en la bitácora del alta el paso `geo:barrios` y en el mapa
los polígonos). Es lo primero a hacer al retomar.

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
- Terminar la cobertura (resto de AR + 5 países) e informar por provincia.
- Los huecos del handoff anterior siguen: `contornos_osm_pbf.py --solo
  ciudad_afuera` (121 AR), `--solo sin_poligono` (316 no-AR), 68 comunas de
  Córdoba con el centro fuera de su polígono.

## 6. Gates y trampas pagadas

- Backend: `python -m pyflakes services/geo_ciudad.py services/seed_demo.py`
  antes de pushear (ambos limpios en `1baff58e`).
- **Corridas de más de 10 minutos van detached** (`Start-Process bash
  script.sh` desde PowerShell): el timeout del tool las mata. Y aun detached
  la corrida "resto de AR" murió después de Córdoba sin rastro en el log; se
  relanzó desde Santa Fe (el script es idempotente por municipio) y el
  wrapper ahora escribe hora y pid en cada cabecera.
- Dos agentes en el mismo working tree: commitear con lista explícita de
  archivos, nunca `git add -A`, nunca `frontend/dist/`.
- La consola de Windows muestra `�` por los acentos: es encoding de la
  terminal, los datos en la base están bien (utf8mb4).
