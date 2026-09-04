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
| sin body/Layout (este commit) | pendiente de medir al salir el bundle | | |

Los saltos desaparecen con el primer commit (frame máximo 50 ms); lo que
quedaba de demora eran las transiciones de body y del Layout.

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

## 7. Qué sigue

1. El dueño mira Territorio en QA y dice qué ajustar.
2. Infra corre el smoke en QA y compara contra prod.
3. El escaneo que faltaba (`landuse=residential` + nombre en fase 1 de
   `catalogo_barrios_pbf.py`, fase 2 en QA, re-marcar, medir vs baseline AR:
   zona 774 / localidades 766 / barrios 542), después BAHRA, después las 3
   demos de QA.
4. Opcional: vecino sin municipio recordado → landing en vez de `/super`.
