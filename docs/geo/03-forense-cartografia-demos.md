# Forense: por qué las demos fallan en cartografía — y la hoja de ruta

> 2026-09-02/03, a pedido de Lucas. Datos medidos contra la base real
> (`sugerenciasmun-qa`, que comparte catálogo con `munify_prod` — Infra
> verificó 0 diferencias de schema) y contra la bitácora `demo_seed_logs`.
>
> **Decisión de arquitectura que gobierna todo (Lucas, 2026-09-02):**
> la cartografía NO se busca online durante el alta — nunca funcionó, por
> delays. El camino es CURAR la base y que el alta lea sólo del catálogo.

---

## 1. Qué está precargado hoy, y su calidad (medido)

| capa | tabla | cobertura | calidad |
|---|---|---|---|
| **Contorno del municipio** | `municipios_catalogo` | 5.122 munis en 6 países; AR **2.082/2.082 con polígono** | **MALA en la mitad**: mediana 17 vértices, mínimo 4, **53% con <20 vértices** — cajas groseras, no contornos |
| **Localidades/zonas** | `catalogo_zonas` | 4.011 localidades, **90% con contorno** (3.617) | La curación que "dio bien" — es la capa sana |
| **Barrios** | — | **NO EXISTE capa precargada** (sólo `barrios` operativa: 224 filas ya creadas por demos) | El agujero central |
| **Calles y direcciones** | — | **NO EXISTE** — salen de Overpass EN VIVO en cada alta | Ídem, y son las coords de los reclamos |

**La conclusión estructural:** la directiva "nada online" hoy es imposible de
cumplir para barrios/calles porque esa capa nunca se curó — el alta no tiene
de dónde leerla. Cada demo depende de Overpass en el momento, con todo lo
que eso significó hoy.

## 2. Por qué fallaron las demos (los bugs del 2026-09-02, ya arreglados)

1. **Timeout eterno**: Overpass caído costaba 75s × 2 mirrors = hasta 150s;
   el celular cortaba el fetch y la landing pintaba "falló" (la demo nacía
   igual). → 20s por mirror (`86a5664a`) + la landing verifica y avisa
   (`landing@597e0fc`).
2. **La promoción se comía los barrios** (Rafaela capa 1): en ciudades de una
   sola localidad, los barrios de OSM se promovían a zonas y se vaciaba la
   lista; si encima el padrón imponía sus zonas, quedaban CERO barrios.
   → `armar()` conoce el padrón y no promueve si divide; y al promover, los
   que no entran como zona SIGUEN siendo barrios (`dc382b32`, `27b49690`).
3. **El query no pedía la mitad del dato** (Rafaela capa 2): los barrios de
   varias ciudades están mapeados como **límite administrativo (admin_level
   9/10)**, no como `place=*` — Rafaela: 74 de 86. La consulta ni los pedía.
   → agregados al query con dedup (`27b49690`). Verificado local: Rafaela
   pasó de 0 a **12 zonas + 33 barrios reales**.
4. **La bitácora mentía**: `SEMBRAR_TASAS=False` (decisión de producto) se
   registraba como degradación con motivo falso → ninguna demo llegaba a
   `ok` desde el 29/08 y las alertas reales quedaban enterradas; y los
   `fallo` tenían `error_message` NULL. → arreglado (`24aab87c`, `dc382b32`).

## 3. Lo que FALTA (el forense pedido)

- **F1 — Capa de barrios precargada: no existe.** Sin ella, "nada online" es
  incumplible. Es LA pieza.
- **F2 — Capa de calles/direcciones precargada: no existe.** Los reclamos
  demo necesitan direcciones reales; hoy Overpass en vivo.
- **F3 — Contornos municipales groseros: 53% con <20 vértices.** Un contorno
  de 6 vértices (Rafaela) filtra mal: deja barrios reales afuera y puede
  meter vecinos. Afecta a TODO lo que se filtre por polígono, incluida la
  curación offline futura.
- **F4 — `catalogo_zonas` con 10% sin contorno** (394 localidades): menor,
  la misma pasada de curación lo cierra.

## 4. Hoja de ruta propuesta

**Etapa A — el batch de curación de barrios+calles (la pieza nueva).**
Tablas `catalogo_barrios` y `catalogo_calles` (por municipio del catálogo,
con fuente y fecha de curación). El batch reutiliza EXACTAMENTE el pipeline
ya verificado hoy (`osm_de_ciudad` + `armar` con padrón) — corre offline,
con toda la paciencia del mundo, reintentos y sin usuarios esperando.
Prioridad de corrida: los ~154 municipios del directorio comercial de
`/calls` + los que ya tienen demo; después el resto de AR; después los otros
países.

**Etapa B — el alta deja de salir a la red.** `geo_de_ciudad` lee
`catalogo_barrios`/`catalogo_calles`; si el municipio no está curado, la
demo nace degradada con motivo honesto ("municipio sin curación de barrios —
correr el batch") y NUNCA espera a Overpass. El alta queda en ~10-15s
constantes, sin varianza.

**Etapa C — recurar contornos groseros (F3).** El mismo batch trae el
contorno real de OSM/IGN para los <20 vértices (el cruce por código INDEC ya
está resuelto en `catalogo_localidades.py`). Recurar y re-correr barrios de
esos municipios.

**Etapa D — mantenimiento.** Job mensual de recuración + el panel de
`demo_seed_logs` (ya existe) como tablero de cobertura: qué municipio está
curado, con cuántos barrios, de qué fecha.

## 5. Estado de verificación (actualizado 2026-09-02 20:45 ART)

**Etapas A y B: HECHAS y verificadas en QA desplegado** (`5b5fe1ca` +
`214d97b0`, revisión `munify-api-qa-00372-8rl`). Diferencia con lo propuesto
en §4: una sola tabla `catalogo_geo_osm` (PK `municipio_catalogo_id`, paquete
`{places, calles, direcciones}` en LONGTEXT) en vez de dos — el alta consume
el paquete entero de un solo SELECT (29 ms medidos).

| Prueba en QA (API deployada) | Resultado |
|---|---|
| Rafaela, curada en la tabla | `geo:osm` **ok** desde `catalogo_geo_osm` en 29 ms; 33 barrios, 12 zonas; 50 reclamos con dirección real (44 puntos distintos) |
| Sunchales, sin curar | `geo:osm` = `sin_cartografia_curada` (motivo honesto en la bitácora); la demo nace igual: 1 zona del padrón, 50 puntos dentro del contorno de la localidad |
| Overpass desde el alta | **cero llamadas** (`GEO_OSM_EN_VIVO=False`); el alta ya no depende de internet |

Regla nueva que entró con esto (Lucas, 2026-09-02): **no existen barrios ni
zonas "Norte/Sur/Este/Oeste"**. `es_cardinal` filtra en la entrada,
`limpiar_barrios_cardinales.py` los borró de las demos de QA, y el paquete de
promoción (sección D) los borra de las dos demos de prod que los tenían
(Concordia, Necochea). SPN conserva sus 4 zonas cardinales: decisión de
producto, no limpieza.

**Etapa C (F3): HECHA en QA** (`f5b00bac`). El geojson de georef era la
versión simplificada para mapa chico (2 MB; mediana **11** vértices, 76% con
<20). Se reemplazó la fuente de `contornos_municipios.py` por el **WFS del
IGN** (capa `municipio`, 64 MB, límite completo): 2.081/2.082 emparejan por
código INDEC (`in1` = id del catálogo), cero por nombre, cero sospechosos.
Mediana en QA después del batch: **279** vértices (tope `--puntos 300`).
Los 269 que siguen con <20 son ejidos chicos cuya forma real tiene pocos
vértices — dato, no defecto. Hallazgo lateral: 68 municipios (3%, casi
todos comunas de Córdoba) tienen el centro del catálogo FUERA de su
polígono IGN, hasta 21 km (Pozo Nuevo); tampoco caían dentro del polígono
viejo (sólo 6). Pendiente: recentrar `lat/lng` al centroide del polígono
para esos 68 — no se tocó porque no se pudo verificar cuál de las dos
fuentes miente.

**Curación masiva de AR: HECHA en QA, 2.082/2.082 (100%), el 2026-09-02 a la
noche.** No fue por Overpass: con `overpass-api.de` caído y los mirrors
saturados, los dos workers iban a ~1,6 min por municipio (55 horas para el
país). Se reemplazó el camino por el **extracto de Geofabrik** leído con
pyosmium (`scripts/geo/extraer_osm_pbf.py`): una pasada por el `.osm.pbf`
del país (AR: 430 MB, 249 s), cada elemento asignado al municipio cuyo
contorno lo contiene (STRtree de shapely), y el paquete armado con el MISMO
`_parsear` del camino Overpass. La escritura a Aiven es lo lento (0,6 s por
fila; AR 23 min). Diferencias a favor: sin cupos, sin topes por salida (en
Rafaela el set de barrios es idéntico; en las ciudades donde Overpass cortaba
en 4.000 elementos, acá entra todo) y entran las direcciones puestas sobre el
edificio, no sólo sobre nodos. La columna `fuente` distingue las filas
(`FUENTE_PBF`). El batch Overpass (`curar_geo_catalogo.py`) queda como camino
secundario para retoques puntuales.

Resultado AR: `ok=2.027` (con barrios 733, con calles 1.880), `sin_datos_osm=55`.
Los 1.294 `ok` sin barrios son en su mayoría comunas chicas donde OSM no tiene
`place=suburb/neighbourhood`: el alta degrada a zonas por calles principales
(nombres reales, nunca cardinales). Lectura de cobertura:
`SELECT pais, estado, COUNT(*), SUM(barrios>0), SUM(calles>0) FROM catalogo_geo_osm GROUP BY pais, estado`.
Los otros países del catálogo se curaron la misma noche con la misma
herramienta y sus extractos: UY 19/19, PY 244/244, BO 483/483, CL 337/337,
PE 1.641/1.641 (5 `sin_datos_osm`) — todo municipio con contorno. Los 316 SIN
contorno (PE 232, BO 56, PY 19, CL 9) quedan afuera de este camino hasta que
tengan polígono (`contornos_osm_pbf.py --solo sin_poligono`).

Hallazgo que abre la etapa siguiente: hay contornos IGN que **no contienen a
su propia ciudad** — Centenario (Neuquén) e Inriville (Córdoba) dan
`sin_datos_osm` teniendo la ciudad mapeada entera, porque el polígono cae a
5-19 km del casco. La medición sistemática (cabecera homónima de OSM dentro o
fuera del contorno) y su corrección están en el handoff
`docs/handoffs/2026-09-02_cartografia-offline-pbf.md`.

**Prod:** todo en manos de Infra desde `MSG-20260902-1925-01` (corte
`214d97b0` + sección D) con el OK de Lucas relevado en
`MSG-20260902-1922-01`. Los datos curados se copian de QA a prod con el
`mysqldump --replace` del paquete, repetible cuando la cobertura crezca.

**Etapa D:** sin empezar.
