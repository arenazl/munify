# Handoff 2026-09-03 (noche) — Territorio reescrita, kit v3.3, mapas, sidebar y demos

> Paquete armado en `qa` a pedido del dueño ("andá armando todo el paquete
> este que después lo vamos a pasar a producción; hoy y mañana testing").
> **Nada fue a producción.** Cuatro commits de código + este doc.

## 0. En una pantalla

| Bloque | Commit en `qa` | Verificado |
|---|---|---|
| A. Sidebar más fino (208 px), Super Admin primero y expandido, tarjeta contextual sin números inventados | `f96a19bf` | Playwright en QA: ancho 208, grupo abierto |
| B. Zoom por rueda: un gesto = un nivel, en los 7 mapas | `ba4ebc9c` | Medido en QA (abajo) |
| C. Kit abmv2 v3.3 + Territorio reescrita | `a8fc3ccd` | Playwright en QA: 15/15 OK, 0 errores de consola, 0 requests 4xx |
| D. Demos: semilla sin auto-colisión, bitácora que sobrevive, colisión con detalle | `74e9630e` | pyflakes + reproducción determinística; el smoke lo corre Infra en QA |

Bundle verificado: `index-C8BCjHSK.js` (20:39 ART). Backend QA con D: revisión
`munify-api-qa-00403-5kv` (20:43 ART).

## 1. Sidebar (A)

- `--pl-sidebar-w: 256 → 208px` (`styles/pl-tokens.css`). Los labels son de
  una palabra (regla 10) y con 256 sobraba un tercio vacío ("hacelo más fino").
- El bloque `=== Solo SUPERADMIN ===` de `config/navigation.ts` pasó ANTES de
  los módulos del muni: el acordeón abre el primer grupo cuando la ruta no
  pertenece a ninguno (la consola), y estando al final quedaba plegado.
- La tarjeta del pie del sidebar (`SidebarV2.tsx`) era un MOCK con "8
  pendientes / 1 venció su SLA" iguales para todos. Ahora es un mini tutorial:
  nombre + `description` de la pantalla activa (o el grupo abierto con sus
  pantallas). El dueño la dejó para sumarle funcionalidad después.

## 2. Mapas (B) — el fix del zoom, medido

`components/mapa/piezasLeaflet.tsx` = `ZoomRuedaDeAUno` (cuenta el GESTO, no
los píxeles: el primer evento hace el zoom y el resto se ignora hasta 260 ms
de silencio) + `InvalidarAlRedimensionar` (ResizeObserver → `invalidateSize`).
Nacieron en `Mapa.tsx` y ahora van como hijos de TODO `<MapContainer>`:
Territorio, Mapa (x2), TesoreriaMapa, MapPicker (x2), HeatmapWidget,
PolygonDrawer. Se fueron los `wheelPxPerZoomLevel=180 / wheelDebounceTime=60`
repetidos (no gobiernan con `scrollWheelZoom` apagado).

Medición en QA (Territorio, ráfaga de 25 eventos de rueda en 400 ms, como la
inercia de un trackpad; script `_medir_rueda.mjs`, corrido dos veces):

| | zoom inicial | ráfaga 1 | ráfaga 2 | 1 golpe atrás |
|---|---|---|---|---|
| antes (`index-BISzYYcg`) | 5 | 10 (+5) | 17 (+7) | 16 (−1) |
| después (`index-C4wPWQNO`) | 5 | 6 (+1) | 7 (+1) | 6 (−1) |

Pendiente que NO entra acá: en touch (pinch) no se midió nada.

## 3. Kit abmv2 v3.3 (C) — todo aditivo, contrato en `types.ts`

| Pieza | Qué hace | Dónde |
|---|---|---|
| Cabeceras ordenables | Click asc → desc → sin orden; `sortValue`/`sortable` por columna; `sort`/`onSortChange`/`defaultSort`; números como números, texto con `Intl.Collator('es', numeric)`, vacíos al final; con grupos ordena adentro de cada grupo; apagado en modo Reordenar | `DataTable.tsx` |
| `ViewKind 'map'` + `viewLabels` | Con DOS vistas el segmented muestra icono + label (solapas); con 3+ sólo icono | `ListToolbar.tsx` |
| `pantallaCompleta: ViewKind[]` | El orquestador maximiza el BLOQUE controles + cuerpo (`.av2-mapa-full`), nunca el cuerpo solo. Hook `usePantallaCompleta` en modo CSS por defecto: la Fullscreen API nativa tapa los portales (ModernSelect, SideModal) | `SemanticAbmPage.tsx`, `usePantallaCompleta.ts` |
| `searchSuggestions` | Autocomplete bajo el buscador: `{ items, onPick, emptyMessage? }`; flechas, Enter, Esc; sin efectos ni setState en render | `ListToolbar.tsx` |
| `trail` | Recorrido por niveles: flecha "volver" + migas ANTES del buscador (`{ items, onBack, onGo? }`); en el raíz la flecha queda deshabilitada; en angosto sólo flecha + nivel actual. Pedido del dueño al probar Territorio: "no tengo manera de ir para atrás" | `ListToolbar.tsx` |
| Aviso dev de "views de menos" | Sólo cuando hay `roles` (sin roles el kit no puede dibujar las otras) | `SemanticAbmPage.tsx` |

CSS: sección `[v3.3]` al final de `styles/abmv2.css`.

**Choque de reglas que el dueño resolvió:** v3.2 decía "el orden sólo con
botón"; el 03/09 pidió "todas las columnas ordenables". Quedó: cabeceras para
ordenar por columna, el botón (`sortSpec`) para criterios semánticos.

**Port al catálogo** `d:\Code\APP_GUIDE\components\v2`: copia verbatim de
`abmv2/*`, `abmv2.css`, SemanticHero (+css), `semanticHero.ts`,
`veredictos.ts`, ModernSelect, PeriodNavigator, DynamicIcon, `useEsAngosto`,
`controles/piezasLeaflet.tsx`. `auditar-kit.py`: 35 OK; afuera a propósito
`shell/` y los extras de `ui/`. Guía cross-project: §7-bis de
`base-compartida/framework/GUIA-SEMANTIC-ABM-V3.md`.

## 4. Territorio (C) — cómo quedó

Pedido textual: "hay que trabajar un montón la pantalla, no quedó intuitiva".

- **Combos** País · Provincia · Municipio (`selects` del kit). El de municipio
  está SIEMPRE en su lugar ("que no se corra la interfaz"), apagado con el
  motivo en el title (`SelectSpec.disabled` + `disabledReason`, kit v3.3), y se
  carga con los municipios de la provincia al elegirla; "Todos" vuelve.
- **Recorrido** (`trail`): flecha volver + migas País › Provincia › Municipio
  al lado del buscador; tocar una miga sube a ese nivel. (Primero se habían
  sacado las migas; el dueño las pidió de vuelta al entrar por la grilla.)
- **Buscador con autocomplete** por nivel: en el país sugiere provincias (3)
  y municipios; en la provincia, municipios; adentro del municipio, barrios.
  Elegir navega (o ubica en el mapa). Sin acentos ("cord" → Córdoba).
- **Dos solapas del MISMO contexto**: Información (tabla del nivel,
  ordenable) y Mapa (ese contexto dibujado + leyenda + respaldo). El hero y
  los filtros son los mismos arriba.
- **Pantalla completa** en la solapa Mapa: filtros + mapa, sin hero ni
  pista. Escape sale. En 1440×900 el lienzo queda en 709 px.
- **Acciones por fila**: ver la provincia / ver el municipio / ver en el mapa
  / ubicar en el mapa.
- Backend sin cambios (`api/admin_territorio.py`).

Verificación (`_verif_territorio.mjs`, sesión super admin, QA):

```
OK  sidebar ancho=208 · grupo Super Admin expandido
OK  combos: País · Provincia · solapas: Información | Mapa
OK  aria-sort ascending → descending · primera fila cambió (Córdoba)
OK  sugerencias "cord": Córdoba (provincia) | Córdoba | Concordia | …
OK  Enter navegó a TERRITORIO · CÓRDOBA · combo Municipio aparece
OK  pantalla completa 1440x900, controles adentro, hero afuera, lienzo 709px, Escape sale
OK  390px sin desborde horizontal · 0 errores consola · 0 requests 4xx/5xx
```

Capturas en el scratchpad de la sesión (`_terr_info/orden/sugerencias/mapa/full/movil.png`).

Recorrido (`_verif_trail.mjs`, bundle `index-B__DMSOi`, 21:57 ART): raíz
"Argentina" con la flecha deshabilitada → click en la fila Buenos Aires →
"Argentina › Buenos Aires" → click en la primera fila → "… › 25 de Mayo" →
flecha vuelve a la provincia → miga "Argentina" vuelve al país; en 390 px
queda flecha + "Buenos Aires" sin desborde. 6/6 OK.
**No verificado**: el dueño todavía no lo miró con sus ojos.

## 5. Demos (D) — hallazgos del smoke de Infra en prod

Infra corrió 10 demos reales en prod y las borró (MSG-20260903-2035-01 y
-2036-01; reporte en `base-compartida/munify/REPORTE-SMOKE-DEMOS-20260903.md`).
Semilla sana 10/10; dos cosas nuestras:

1. **"Pila" colisionó contra una base sin ningún Pila.** Causa (reproducida
   sin base, determinística): los vecinos 2 y 3 salen de un hash del código y
   el email es `vecino-<nombre>@codigo`; para `pila` los dos daban "Juan" →
   `ix_usuarios_email` → el alta reintentaba como `pila-2`. ~1 de cada 16
   códigos. Fix: el slug repetido se desempata (`vecino-juan-3@…`), mismos
   hashes, el resto de la demo no cambia (`services/seed_demo.py`).
2. **La colisión no decía qué chocó.** Ahora el paso `colision` guarda
   `str(e.orig)` ("Duplicate entry '<valor>' for key '<índice>'") y el motivo
   dice "unicidad violada" (`api/municipios.py`).
3. **`demo_seed_logs` se borraba con la demo.** El plan de cascade se deriva
   por COLUMNA `municipio_id` y se llevaba la bitácora que existe para
   comparar demos borradas. `TABLAS_QUE_SOBREVIVEN = {"demo_seed_logs"}` en
   `services/demo_borrado.py`.

**Smoke de Infra en QA (rev 00403, mismos 10 municipios que en prod, MSG-20260903-2100-01):**
10/10 ok, cero degradados, cero huérfanos. Fix 1 VERIFICADO (Pila sale como
`pila`, 25/25 pasos, sin paso `colision`; vecinos `vecino-juan@` y
`vecino-juan-3@`). Fix 3 VERIFICADO (las 10 bitácoras sobreviven al borrado).
Fix 2 NO EJERCITADO: ninguna demo colisionó, justamente porque el 1 lo
previene — queda sin caso, no se da por verificado. Número que justifica F1 +
promover `fa4065a5` juntos: mismas 10 demos, 344 barrios en prod contra 130 en
QA (La Matanza 214 → 24). Sigue el HOLD hasta el OK del dueño en la sesión de
Infra.

## 5-bis. Cambio de tema oscuro/claro (E) — "stuttering… super lento"

Causa: `styles/animations.css` tenía desde 02/2026 un `* { transition:
background-color, border-color, color .3s }`. Con las grillas del kit, cambiar
de tema animaba TODOS los nodos a la vez. Encima `body` (index.css) y el
contenedor del Layout (`transition-colors duration-300`) tenían su propia
transición de 0.3 s. Se sacaron las tres; las transiciones útiles quedan
declaradas en cada componente.

Medición en QA (Territorio, 1440×900, `_medir_tema.mjs`: ms hasta que el
fondo del body se estabiliza; frames > 50 ms en el segundo posterior):

| | ida oscuro→claro | vuelta | frame más largo |
|---|---|---|---|
| antes (`index-C8BCjHSK`) | 684 ms, 3 frames largos | 391 ms, 2 | 217 ms / 150 ms |
| sin la transición universal (`index-GEKKIJax`, commit `986f509e`) | 477 ms, 1 | 348 ms, 1 | 50 ms / 50 ms |
| sin body/Layout (`index-B4EN_3WD`, commit `3c029864`) | 172 ms, 1 | 134 ms, 0 | 67 ms / 50 ms |

Los saltos desaparecen con el primer commit (frame máximo 50 ms); lo que
quedaba de demora eran las transiciones de body y del Layout: de 684/391 ms a
172/134 ms (lo que tarda React en re-renderizar el árbol con el tema nuevo).

Combo de municipio apagado (`_verif_combo.mjs`, mismo bundle): en la raíz
presente y apagado con el title "Elegí una provincia para listar sus
municipios"; al entrar a Buenos Aires se activa con "Todos"; la barra de
filtros no cambia de alto (61 → 61 px). 3/3 OK.

## 5-ter. Dónde mirar la cola del CD de QA (dato de Infra)

Los triggers de QA están en Cloud Build **`southamerica-east1`**:
`deploy-munify-front-qa` (path `frontend/**`, publica Pages + la Function del
proxy) y `deploy-munify-api-qa` (hoy sin filtro de paths: cada push de front
redeploya también el backend; Infra lo va a filtrar). `deploy-munify-front` de
us-east4 es el de PRODUCCIÓN. Cola: `gcloud builds list --project=munify-api
--region=southamerica-east1 --limit=10`. Versión viva:
`curl -s https://qa.munify.com.ar/version.json`. El build de `986f509e` FALLÓ
en el paso de publicar por un error interno de Cloudflare ("Failed to publish
your Function"); Infra lo redisparó y salió limpio.

## 6. Otras cosas del día (fuera del paquete)

- Super admin: UN usuario por ambiente con la clave que dictó el dueño. QA
  hecho (`superadmin@test.com`; `arenazl@gmail.com` borrado); prod pedido a
  Infra (`superadmin@prod.com`, MSG-20260903-1935-01, script en
  `base-compartida/munify/reset_super_admin.py`).
- /calls: espec a Infra (MSG-20260903-1935-02): píldoras de provincia (top
  10), shuffle en "Después seguís con", Chacabuco como referencia de Lucas al
  costado. Usuario `santi` / `Santi123` creado en QA (login 200).
- HOLD de prod: nada se promueve hasta que el dueño lo diga en la sesión de
  Infra. F1 (copiar `catalogo_barrios` marcada) + promover `fa4065a5` van
  juntos.

## 7. ARRANQUE DE LA PRÓXIMA SESIÓN — completar los barrios de Argentina

Decisión del dueño (2026-09-03, textual): *"barrio y localidad son sinónimos
para nosotros: lo que se considere mejor en cuanto a la obtención de
polígonos… me gustaría tener cubierta la mayoría de los barrios de Argentina,
más allá de que tengamos polígonos o no"*. Y: nada de buscar barrio por
barrio con IA o web (tokens + regla de no inventar). Todo sale de fuentes
offline/oficiales, en una pasada.

**Línea base AR en QA (API de Territorio, 22:20 ART):** 2.082 municipios →
542 con barrios / 766 con localidades / **774 con zona sola** / 0 sin
contorno; 17.714 hojas, 10.766 con contorno, 15.923 de OSM, 1.791 del padrón,
5.720 de respaldo. Provincias con más zona sola: Córdoba 250/427, Santa Fe
204/363, Entre Ríos 125/269, La Pampa 41/80, San Luis 36/67.

**Paso 1 — escaneo `landuse=residential` con nombre (YA PROGRAMADO, sin correr).**
`backend/scripts/geo/catalogo_barrios_pbf.py` suma los ways cerrados y las
relaciones `landuse=residential` CON nombre como tipo `residential` (áreas con
polígono; prioridad 4.5 en `PRIORIDAD` y en `_hojas.PRIORIDAD_TIPO`: pierden
contra un `place` homónimo). El PBF de Argentina (428 MB) está en el
scratchpad de la sesión del 03/09 (`…/24267f16-…/scratchpad/pbf/argentina-latest.osm.pbf`);
si no está, se baja de Geofabrik (`argentina-latest.osm.pbf`).

```bash
cd backend
# fase 1 (rehacer el sqlite con el filtro nuevo) + EN SECO; mirar el stat "residential"
DATABASE_URL_QA="$(gcloud secrets versions access latest --secret=DATABASE_URL_QA --project=munify-api)"   python scripts/geo/catalogo_barrios_pbf.py --env qa --pais AR --pbf <ruta>/argentina-latest.osm.pbf --rehacer
# fase 2 en QA (reescribe cada municipio, tandas de 10 con commit; ya marca hojas)
DATABASE_URL_QA="..." python scripts/geo/catalogo_barrios_pbf.py --env qa --pais AR --pbf <ruta>/argentina-latest.osm.pbf --aplicar
```
(`DATABASE_URL` del `backend/.env` también sirve si es la de QA: `_entorno`
exige que termine en `-qa`.)

Medir después con la misma API (`GET /api/admin/territorio/municipios?pais=AR`,
token de `superadmin@test.com`): la cifra que importa es **zona sola 774 → ?**
y cuántas hojas nuevas traen contorno. Verificar 2-3 municipios chicos de
Córdoba/Santa Fe en la pantalla Territorio (solapa Mapa).

**Paso 2 — BAHRA** (Base de Asentamientos Humanos de la República Argentina,
IGN/INDEC): nombres + punto de localidades y parajes que OSM no tiene. Entran
como hoja tipo `localidad`, fuente nueva (p. ej. `bahra`), sin polígono. Es lo
que cubre los municipios que sigan en zona sola después del paso 1.

**Paso 3 —** lo que quede sin nada queda como zona sola, honesto. Después: las
3 demos de QA (Córdoba, Santa Fe, Buenos Aires interior) y avisar a Infra
(`structure-*`) que la copia qa→prod de `catalogo_barrios` (F1) tiene que
repetirse con la tabla nueva; prod sigue en HOLD hasta el OK del dueño.

**Resultado del paso 1 (residential) — 2026-09-03 23:05 ART: NO SE APLICÓ.**
Se corrió la fase 1 con `landuse=residential` (47 s): 46.836 candidatos contra
35.526 antes, 42.843 asignados, +10.584 filas `residential` (10.579 con
contorno). Pero el **53,5 % era ruido**: 45,4 % manzanas (`Manzana 38`,
`B° Solidaridad - Mza 416 "A"`), 7,7 % códigos (`1201A`, `C5 SE casa L`) y
0,4 % genéricos. El ruido está concentrado: Rawson (San Juan, `660063`)
aportaba 2.231 filas de manzana, y 6 municipios juntaban ~4.400. Del otro lado,
el beneficio real era chico: **20 municipios** salían de zona sola (774 → 754),
porque el filtro `clave == objetivo` descarta el barrio homónimo del pueblo y
189 de los 209 municipios candidatos sólo ganaban esa fila. El dueño decidió
saltearlo. Queda en el repo `_es_ruido_residential()` (probada: 20/20 ruido
detectado, 18/18 nombres buenos conservados; deja 4.595 de las 10.584 filas),
**sin aplicar en QA**.
Pendiente si algún día se retoma: **colapsar manzanas a barrio** — 3.022 filas
`B° X - Mza N` que serían ~274 barrios reales en 6 municipios (Rawson SJ 2.231).

**Resultado del paso 2 (BAHRA) — 2026-09-03 23:05 ART: APLICADO en QA.**

- **Fuente:** BAHRA (Base de Asentamientos Humanos de la República Argentina,
  IGN/INDEC), por el derivado de georef en datos.gob.ar:
  `https://infra.datos.gob.ar/georef/asentamientos.json` (5,0 MB, bajado el
  03/09/2026). **14.466 asentamientos**, todos con punto: 10.425 parajes,
  3.098 localidades simples, 678 entidades, 252 componentes, 13 bases
  antárticas. El 80,9 % trae `gobierno_local.id`, que es el código INDEC y
  matchea directo contra `municipios_catalogo.id`. El archivo quedó en
  `backend/scripts/datos/asentamientos.json`.
- **Script nuevo:** `backend/scripts/geo/catalogo_barrios_bahra.py`. Alcance:
  sólo los municipios con CERO filas en `catalogo_barrios` (se calcula contra la
  base en el momento). Filas `fuente='bahra'`, `tipo='localidad'`, sin polígono,
  con el punto del dataset; se descarta el homónimo del municipio y los
  cardinales; dedupe por `nombre_norm`; `marcar_hojas` al escribir. Idempotente:
  borra sólo las filas `fuente='bahra'` del municipio y reinserta, en tandas de 25.
  Los 2.758 asentamientos sin `gobierno_local` se ubican por contención del punto
  en el contorno (aporta poco: 68 caen dentro de algún municipio, y rescatan 3).

| | antes | después |
|---|---|---|
| **zona sola** | **774** | **455** |
| con localidades | 766 | 1.085 |
| con barrios | 542 | 542 |
| sin contorno | 0 | 0 |
| hojas | 17.714 | 18.408 |
| hojas con contorno | 10.766 | 10.766 |
| de OSM / oficial (padrón + BAHRA) | 15.923 / 1.791 | 15.923 / 2.485 |

Zona sola por provincia: Córdoba 250 → 191, Santa Fe 204 → 86, Entre Ríos
125 → 81, La Pampa 41 → 23, San Luis 36 → 26.

- **319 municipios** recibieron localidades, **694 filas** (todas hoja, ninguna
  con contorno: BAHRA da nombre y punto, no dibujo). Distribución: 158 con un
  solo nombre, 141 con 2 a 5, 17 con 6 o más.
- **Quedan 455 vacíos**, y es lo esperado: 423 tienen entradas en BAHRA pero
  sólo la homónima del propio pueblo, que se descarta por decisión del dueño
  ("va a quedar horrible con uno solo ahí adentro"); los otros 32 no tienen
  nada en BAHRA.
- **Duración:** descarga + inspección ~1 min; seco 0,3 min; aplicar ~2 min
  (2.082 municipios recorridos, 319 escritos). `@@read_only` = 0 antes y después.
- **Verificados** (SQL + pantalla): Pampa del Infierno (Chaco) 10 nombres,
  San Francisco del Chañar (Córdoba) 5, Gobernador Costa (Chubut) 3 — todos
  `tipo=localidad`, `fuente=bahra`, `hoja=1`, sin contorno. Captura de la solapa
  Mapa en QA para Gobernador Costa: el hero dice "se llena con localidades: 3
  nombres se dibujan, 0 con contorno", 0 errores de consola y 0 requests 4xx.
- **Un cambio mínimo de backend:** `api/admin_territorio.py` contaba el cubo
  "del padrón" como `fuente = 'georef'` a secas, así que las 694 filas de BAHRA
  quedaban fuera del desglose (la clasificación zona/localidades/barrios no
  dependía de eso y ya salía bien, porque va por `tipo`). Ahora hay
  `FUENTES_OFICIALES = ('georef', 'bahra')` y el cubo las suma a las dos.
  `barrios_del_catalogo` de la semilla lee `hoja = 1` sin mirar la fuente:
  verificado, no necesita cambios.

**Lo que sigue:** los 455 que quedan son pueblos de una sola localidad, por
decisión de producto — no hay un paso 3 que los llene. Sí queda pendiente
avisarle a Infra que la copia `qa` → `prod` de `catalogo_barrios` (F1) tiene que
repetirse con la tabla nueva; prod sigue en HOLD hasta el OK del dueño.

## 7-bis. Qué sigue (resto)

1. El dueño mira Territorio en QA y dice qué ajustar.
2. Infra corre el smoke en QA y compara contra prod.
3. El escaneo que faltaba (`landuse=residential` + nombre en fase 1 de
   `catalogo_barrios_pbf.py`, fase 2 en QA, re-marcar, medir vs baseline AR:
   zona 774 / localidades 766 / barrios 542), después BAHRA, después las 3
   demos de QA.
4. Opcional: vecino sin municipio recordado → landing en vez de `/super`.
## 8. Columna `cartografiado` (2026-09-03, 23:30 ART)

**Decision del dueño, textual:** *"O tenemos el cien por ciento del municipio
con poligonos o mostramos solamente el contorno del municipio... asi de
restrictivo. No sirve mostrar en un mapa que tenes veinte barrios, cuatro bien
dibujados y el resto no"*. Refinada: *"que vos veas casi todo cartografiado: si
le falta uno y son tres, no; si le faltan dos y son catorce, si"*. Y pidio
*"una columna"* para que la pantalla sepa que dibujar, en vez de recontarlo.

**La regla** (constantes en UN solo lugar, arriba de
`backend/scripts/geo/marcar_cartografiado.py`): sobre las filas `hoja = 1` del
municipio, con `n` = cantidad y `con_poligono` = las que tienen contorno,

    cartografiado = 1  <=>  n >= MIN_BARRIOS (5)  Y  con_poligono / n >= PCT_MINIMO (0.85)

`motivo_cartografiado` guarda el porque en texto llano — `"38/47 dibujados
(81 %)"`, `"sin barrios"`, `"4/4 dibujados, menos de 5 barrios"` — para que la
pantalla lo muestre sin recalcular nada.

Casos de control verificados en QA: Funes (Santa Fe) 88/89 → 1; Rio Cuarto
(Cordoba) 54/55 → 1; Lanus 40/41 → 1; Pocito (San Juan) 38/47 → **0** (81 %);
Chichinales (Rio Negro) 4/4 → **0** (menos de 5); los de 1/2 → 0.

**Numeros en QA** (corrida completa, 33 s de escritura, `@@read_only` = 0
antes y despues; **165** municipios cartografiados sobre 5.122):

| pais | municipios | dibuja barrios | solo contorno | sin barrios | menos de 5 | bajo 85 % |
|---|---:|---:|---:|---:|---:|---:|
| AR | 2.082 | **147** | 1.935 | 455 | 994 | 486 |
| PE | 1.873 | 1 | 1.872 | 298 | 254 | 1.320 |
| BO | 539 | 2 | 537 | 56 | 20 | 461 |
| CL | 346 | 0 | 346 | 9 | 9 | 328 |
| PY | 263 | 15 | 248 | 61 | 95 | 92 |
| UY | 19 | 0 | 19 | 0 | 0 | 19 |

AR por provincia (las 5 primeras): Buenos Aires 46 de 135, Santa Fe 28 de 363,
Cordoba 15 de 427, Rio Negro 11 de 39, Corrientes 9 de 74 (Neuquen tambien 9,
de 57). El grueso del "no" no es calidad de dibujo sino falta de material: 994
municipios de AR tienen menos de 5 filas hoja (muchos son los que BAHRA lleno
con 1-3 localidades sin contorno).

**Que obedece el tilde** (todo backend; el front ya sabe dibujar "contorno +
pines" cuando no le llegan poligonos):

| Consumidor | Que hace ahora |
|---|---|
| `services/geo_ciudad.barrios_del_catalogo` (semilla de demos) | Si el municipio esta en 0, los barrios salen SIN poligono; nombre y punto se conservan. Nuevo helper `_municipio_cartografiado`, con el mismo fallback que `hoja`: si falta la columna (prod vieja) dibuja como hasta ahora |
| `GET /api/admin/territorio/municipios` y `/paises` | Cada fila trae `cartografiado` y `motivo_cartografiado`; el agregado suma `cartografiados` (clave nueva, no cambia ninguna existente) |
| `GET /api/admin/territorio/municipios/{id}` (solapa Mapa) | Con `cartografiado = 0` los barrios viajan con `poligono: null` (queda `contorno_real` para el resumen). El `resumen` NO cambio de valores: sigue contando los contornos reales del catalogo, y ahora lleva `cartografiado` + `motivo_cartografiado` para explicarlo |
| `GET /api/zonas/regiones-mapa` (mapa del tenant) | **NO se toco**: dibuja `barrios.poligono` de las tablas del TENANT, no del catalogo. La semilla ya no le va a dar poligonos a los municipios en 0 |

**Pendientes que deja esto:**
- **Las demos YA sembradas quedan como estan** (Lanus, Merlo, las 22 de QA):
  sus `barrios.poligono` ya se copiaron al tenant antes de la regla. Si alguna
  esta en un municipio con `cartografiado = 0` va a seguir mostrando el dibujo
  a medias hasta que se resiembre.
- `municipios_catalogo` no tiene modelo ORM y las dos columnas nuevas se leen
  con `text()`. Si algun dia se le arma modelo, hay que sumarlas.
- El front no usa todavia `motivo_cartografiado` para explicarlo en el hero de
  Territorio; hoy solo deja de recibir poligonos.

**Que tiene que hacer Infra al promover** (ademas de lo ya avisado):
1. La migracion `backend/alembic/versions/20260905_cartografiado.py` (o el
   ALTER equivalente: `cartografiado TINYINT(1) NOT NULL DEFAULT 0` +
   `motivo_cartografiado VARCHAR(120) NULL`). Es requisito de
   `api/admin_territorio.py`, que ya consulta las dos columnas.
2. Y **una de dos**: copiar `municipios_catalogo` desde QA ya marcada (junto
   con la copia de `catalogo_barrios` de F1), o correr en prod
   `python scripts/geo/marcar_cartografiado.py --env prod --aplicar` DESPUES de
   copiar `catalogo_barrios` (la marca se calcula sobre las filas `hoja = 1`,
   asi que sola no sirve si la tabla de barrios de prod es la vieja).
   El default de la columna es 0 = "dibujar solo el contorno": el ambiente sin
   marcar es conservador, no se rompe.

