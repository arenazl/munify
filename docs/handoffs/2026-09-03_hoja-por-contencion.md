# Handoff 2026-09-03 (madrugada) — qué barrio se DIBUJA y cuál queda de respaldo: la regla "hoja" por contención

> Sigue al handoff del mismo día
> ([`2026-09-03_zona-unica-y-catalogo-barrios.md`](2026-09-03_zona-unica-y-catalogo-barrios.md)):
> el modelo (municipio → Zona única → barrios) y la tabla `catalogo_barrios`
> no cambian. Lo que se agrega es **una marca por fila** que dice si ese barrio
> se muestra en el mapa de la demo o queda guardado como respaldo.

## 1. El problema y el mandato

`catalogo_barrios` guarda TODO lo que se encontró para cada municipio: las
localidades del padrón georef, los `place=*` de OSM, los `admin_level=9/10`.
Para un partido como Lanús eso son 52 filas: "Remedios de Escalada" dos veces
(padrón + OSM), "Villa Fisher" y "Villa Fischer", un polígono de Gerli que
contiene a otros tres barrios, "Lanús Centro" como punto adentro de un barrio
ya dibujado. Dibujar las 52 encima del mapa queda horrible; recortar por
conteo ("si hay más de N localidades gana la localidad") es arbitrario y
Lucas lo rechazó textualmente: *"no para mí no sirve es súper arbitrario y
basado en la nada misma"*. Un solo barrio "casco urbano" también:
*"descartalo va a quedar horrible con uno solo ahí adentro"*.

Mandato (textual): *"probá de varias formas y generalo de varias formas,
necesito que esto quede bien. Después mandale a infra el que mejor quede.
Podés agarrar un muestreo al azar y chequearlo en internet a ver si es
coherente… no te quedes con lo primero que salga, probá varios algoritmos a
ver cuál queda más coherente."*

## 2. Lo que se probó (simulación en memoria, sólo lectura sobre QA, 6 países)

Cuatro variantes sobre las mismas 25.000 filas de AR (1.308 municipios con
contorno). Todas comparten el paso 0 (dedupe de grafía, abajo) y difieren en
**cuándo un polígono deja de dibujarse** y **quién absorbe a un punto**:

| Variante | Regla | AR: hojas / con contorno | Munis con mitad+ dibujados | Munis 100 % dibujados |
|---|---|---|---|---|
| A | Un polígono sale si contiene otro polígono; una localidad sale si contiene puntos de barrio. Los puntos sólo los absorbe una hoja del mismo nivel | 19.460 / 11.273 (58 %) | 525 | 195 |
| B | Un polígono sale SÓLO si contiene otro polígono; un punto lo absorbe cualquier hoja dibujada que lo contenga | 19.052 / 11.430 (60 %) | 549 | 206 |
| D | Por conteo: gana el nivel (localidad o barrio) con más filas, el otro sale entero | 19.262 / 11.073 (57 %) | 522 | 197 |
| **E** | **Un polígono sale sólo si la unión de los polígonos que tiene adentro cubre ≥ 50 % de su área; si no, conviven anidados. Puntos como B** | **18.512 / 11.893 (64 %)** | **564** | **224** |

Por qué E: es la única que **no borra dibujo**. A y B sacan al contenedor
aunque adentro tenga un solo barrio chico (Gerli desaparecía por un
polígono de 3 manzanas); D colapsa países enteros donde el padrón es de
localidades y el dibujo es de barrios (UY 262 → 193 con contorno, BO 362 → 41).
E gana en las cuatro columnas y afuera de AR no muestra patologías:

| País | filas | hojas | con contorno | dup | contenedores | absorbidos | anidados |
|---|---|---|---|---|---|---|---|
| AR | 25.000 aprox. | 18.512 | 11.893 (64 %) | 1.763 | 180 | 2.979 | 1.899 |
| PY | 2.211 | 1.950 | 588 (30 %) | — | 14 | 26 | 150 |
| UY | — | 1.354 | 261 (19 %) | — | 1 | 13 | 5 |
| CL | — | 23.030 | 388 (2 %) | — | 1 | 77 | 259 |
| BO | — | 24.980 | 358 (1 %) | — | 8 | 81 | 385 |
| PE | — | 77.598 | 877 (1 %) | — | 1 | 68 | 1.503 |

(CL/BO/PE son casi todo puntos del padrón: el porcentaje bajo es falta de
dibujo en OSM, no de la regla; ver `faltantes_barrios.json` del handoff anterior.)

**Muestreo contra internet** (Wikipedia): Sarmiento (San Juan) → las 13
localidades del departamento, todas hoja; Lomas de Zamora → 13 de las 14
localidades oficiales (falta la cabecera homónima, ver pendientes); Lanús →
43 hojas, 42 con contorno, y el respaldo es exactamente lo que uno sacaría a
mano (sección 4).

## 3. La regla E, como quedó en código (`backend/scripts/geo/_hojas.py`)

Se corre **offline**, municipio por municipio, sobre los dicts de la tabla.
Nada se borra: cada fila queda `hoja = 1` o `hoja = 0` + `motivo_hoja`.

0. **Dedupe de grafía** entre filas a menos de 1 km: mismo nombre normalizado
   (sin "Barrio " adelante), prefijo con partícula "de" ("Remedios de Escalada"
   ⊂ "Remedios de Escalada de San Martín"), o parecido `SequenceMatcher ≥ 0,88`
   con 6+ letras ("Villa Fisher" / "Villa Fischer"). Si los tokens que difieren
   son todos calificadores o números ("Bancario 2" vs "Bancario 3", "X" vs
   "X Centro") son lugares distintos. **Dos polígonos de distinto nivel nunca
   se deduplican** — eso lo decide la contención. Pierde: el que no tiene
   polígono → el de menos vértices → el de tipo menos oficial
   (`admin10 > admin9 > suburb > quarter > neighbourhood > localidad > city > town > village > hamlet`).
   Motivo: `dup:<nombre que queda>`.
1. **Contención**: para cada polígono, los polígonos más chicos que están
   adentro (≥ 50 % de su área dentro de él). Si la unión de esos cubre ≥ 50 %
   del grande, el grande sale (`contenedor:N (P%)`). Si no, quedan las dos
   capas (se cuenta como `anidado`, se dibujan ambas).
2. **Puntos**: un barrio sin contorno que cae adentro de una hoja dibujada
   sale (`absorbido:<nombre>`); afuera de todo dibujo sobrevive como punto.
   Sin coordenadas: `sin_coord`.

Constantes en la cabecera del módulo (`RADIO_DUP_KM`, `PARECIDO_MIN`,
`FRACCION_ADENTRO`, `FRACCION_CUBIERTO`). shapely está sólo en el venv de
scripts, **no** en `requirements.txt`: el backend en runtime no calcula nada,
lee la columna.

## 4. Lanús en seco (`marcar_hojas.py --env qa --muni 060434 --detalle`)

52 filas → 43 hojas (42 con contorno). Respaldo: Gerli `contenedor:3 (74%)`,
Lanús Centro `absorbido:…`, Lanús Este `contenedor (100%)`, Lanús Oeste
`(97%)`, Monte Chingolo `(100%)`, Remedios de Escalada `dup:Remedios de
Escalada de San Martín`, Remedios de Escalada de San Martín `(77%)`,
Valentín Alsina `(96%)`, Villa Fisher `dup:Villa Fischer`. Es decir: las
localidades grandes salen porque sus barrios las cubren; los barrios se
dibujan.

## 5. Archivos

| Archivo | Qué |
|---|---|
| `backend/scripts/geo/_hojas.py` (nuevo) | La regla: `marcar_hojas(barrios)` marca `hoja`/`motivo_hoja` en cada dict y devuelve los contadores. Y el DDL: `COLUMNAS`, `columnas_faltantes(conn)`, `asegurar_columnas(conn)` |
| `backend/scripts/geo/marcar_hojas.py` (nuevo) | CLI para marcar lo ya cargado: `--env qa\|prod --pais AR,PY,… [--provincia] [--muni] [--detalle] [--aplicar]`. Sin `--aplicar` es en seco. Con `--aplicar` agrega las columnas si faltan y escribe sólo las filas que cambian (tandas de 500) |
| `backend/scripts/geo/catalogo_barrios_pbf.py` | La fase 2 ya marca cada municipio al escribirlo (`_barrios_de` → `marcar_hojas`), el INSERT lleva `hoja, motivo_hoja`, `main()` asegura las columnas |
| `backend/services/geo_ciudad.py` `barrios_del_catalogo` | Lee `WHERE hoja = 1`; si la columna no existe (prod entre la copia y el ALTER) reintenta sin el filtro; si la tabla no existe, `[]` como antes |

Columnas nuevas en `catalogo_barrios`:
`hoja TINYINT(1) NOT NULL DEFAULT 1 AFTER osm_id`, `motivo_hoja VARCHAR(120) NULL AFTER hoja`.

## 6. Estado al cierre — QA MARCADA y verificada con la demo de Lanús

**El incidente que lo trabó:** al correr `--aplicar` el ALTER falló con
`(1290) --read-only`: el servidor **`mysql-aiven` (proyecto `arenazl`, plan
`free-1-5gb`, 5 GB) estaba al 96 % de disco** — 2,5 GB de esquemas + 2,5 GB de
binlogs — y Aiven lo puso read-only de 03:26 a ~13:50 ART. QA **y producción**
sin poder escribir (los dos "hotfix" de Bartolo de esa mañana —crear un gasto
y marcarlo pagado— eran este mismo 1290, no bugs de la app). Se escaló a Infra
(`MSG-20260903-0331-01` + SendMessage a `structure-b9`); lo resolvió Lucas con
Infra: bases muertas borradas, `binlog_retention_period` al mínimo y truncado
de tablas transaccionales de otras apps (`MSG-20260903-1420-01`). Es
credencial de CUENTA: la app no toca eso. Lección: **antes de una carga masiva,
mirar el disco** (`avn service get mysql-aiven --project arenazl`).

**Lo que se corrió después (2026-09-03 ~13:50 → 14:20 ART):**

```bash
cd backend && export DATABASE_URL_QA="$(grep -E '^DATABASE_URL=' .env | cut -d= -f2- | tr -d '\r')"
./.venv/Scripts/python.exe -u scripts/geo/marcar_hojas.py --env qa --pais AR,PY,UY,CL,BO,PE --aplicar
```
Agregó las dos columnas y escribió **9.029 filas** (las que cambian). Resultado
real, idéntico contador por contador a la simulación de la sección 2:
`156.453 filas, 147.424 hoja, 14.365 hoja con contorno` — AR 23.434 /
18.512 / 11.893 · BO 27.902 / 24.980 / 358 · CL 23.353 / 23.030 / 388 ·
PE 78.152 / 77.598 / 877 · PY 2.211 / 1.950 / 588 · UY 1.401 / 1.354 / 261.
El dry-run de Lanús (`--muni 060434 --detalle`) dio 43 hojas / 42 con contorno
y **0 cambios pendientes**.

**Demo de Lanús en QA deployado** (`POST /api/municipios/crear-demo`, PIN
2468, 18 s → muni `1000184`, código `lanus`): 1 zona ("Zona única", con
polígono), **43 barrios, 42 con polígono**, 43/43 con zona, 50/50 reclamos con
`barrio_id` y coordenadas. Gerli y Remedios de Escalada no aparecen como
polígonos gigantes encima de sus barrios. Aviso a Infra con la tabla real:
`MSG-20260903-1725-01` (+ SendMessage). Ojo con el body del `curl`: escribirlo
con `json.dumps(..., ensure_ascii=True)` — el `printf` de bash convirtió la
"ú" en un byte 0xFA y la API devolvía 400 "error parsing the body".

**Trampa de rendimiento pagada:** el `--aplicar` tardó **29,5 min** para 9.029
filas porque escribía un `UPDATE … WHERE id = :id` por fila (una ida y vuelta a
Aiven cada una, ~190 ms). Se corrigió después del marcado: ahora arma UN
`UPDATE … SET hoja = CASE id … END, motivo_hoja = CASE id … END WHERE id IN (…)`
por tanda de 500 (ver sección 5). Si Infra elige F2 en prod, tarda ~1 min.

## 7. Lo que tiene que repetir Infra al promover

El código ya viaja con `qa` (lee `hoja = 1` con fallback). Para los datos, una
de dos — la primera es la misma operación que ya hizo para `catalogo_geo_osm`:

1. **Volver a copiar `catalogo_barrios` de QA a prod** — QA ya está marcada
   (`mysqldump --replace`, mismo procedimiento de
   `PROMOCION-CARTOGRAFIA-OFFLINE.md`). La copia trae las columnas y la marca;
   verificar `SELECT COUNT(*), SUM(hoja=1), SUM(hoja=1 AND poligono IS NOT NULL) FROM catalogo_barrios WHERE pais='AR'`
   y que dé lo mismo que QA.
2. O correr en prod `marcar_hojas.py --env prod --pais AR,PY,UY,CL,BO,PE --aplicar`
   (hace el ALTER y marca; ~1 min con el UPDATE por tanda). Necesita `DATABASE_URL_PROD` y el
   `PURGA_CONFIRMO`/TTY de `_entorno.py`, igual que la purga.

Mientras prod no tenga la columna, las demos de prod siguen mostrando todas
las filas (el fallback), no se rompen.

## 8. Pendientes (no bloqueantes)

- **Cabecera homónima** (Lomas de Zamora, Avellaneda): la fase 2 filtra
  `clave == objetivo` y descarta la localidad que se llama igual que el
  partido cuando el partido tiene otras localidades. Es del PBF, no de la regla.
- Etiqueta humana "Barrio / Localidad" en la grilla de barrios del front
  (kit abmv2, sesión del otro agente): hoy muestra el `tipo` crudo.
- Ciudades sin barrios en OSM (CL/BO/PE casi todo puntos): otras fuentes,
  ver `faltantes_barrios.json`.
- Contornos rotos (`buffer(0)` los arregla en memoria pero no se reescriben)
  y las 68 comunas de Córdoba con el centro fuera del polígono.
- Con la marca ya puesta, `es_cardinal()` en `barrios_del_catalogo` es
  redundante para lo nuevo; se deja hasta que prod tenga la columna.

## 9. Gates y trampas pagadas

- `python -m pyflakes scripts/geo/_hojas.py scripts/geo/marcar_hojas.py scripts/geo/catalogo_barrios_pbf.py services/geo_ciudad.py` limpio.
- El port de la simulación al módulo se verificó contador por contador
  (totales idénticos sobre AR entero) antes de tocar la tabla.
- `marcar_hojas.py` sin columnas todavía **funciona en seco** (`1, NULL` en
  lugar de las columnas): sirve para mirar un municipio antes de aplicar.
- Diagnóstico Aiven sin dashboard: `avn service get mysql-aiven --project arenazl`,
  `SELECT @@read_only`, `information_schema.tables` por schema. El nombre del
  servicio es `mysql-aiven` y `avn` exige `--project`.
- Dos agentes en el mismo working tree: commit con lista explícita, nunca
  `git add -A`, nunca `frontend/dist/`.
