# Handoff 2026-09-02 (noche) — cartografía offline desde el PBF, "Zona única" y los barrios visibles

> Para retomar en frío el hilo **zonas / barrios / polígonos / mapa** de las demos.
> Complementa a `2026-09-02_estado-y-pendientes.md` (IA, /calls, Patrimonio) y
> al forense `geo/03-forense-cartografia-demos.md` (§5 tiene el estado de
> verificación con números). Rama `qa`. Nada de esto está en prod todavía:
> Infra promueve con el paquete `base-compartida/munify/PROMOCION-20260902-BASE.sql`.

## 1. Qué cambió hoy, en una tabla

| Tema | Estado | Dónde |
|---|---|---|
| Cartografía de las demos **offline** (barrios + calles + direcciones por municipio) | **Los 6 países**, todo municipio con contorno: 4.806/4.806 curados en QA (`ok` 4.746 · `sin_datos_osm` 60); AR 2.082/2.082 | tabla `catalogo_geo_osm`; `backend/scripts/geo/extraer_osm_pbf.py` |
| El alta de demos ya no sale a internet | `GEO_OSM_EN_VIVO=False`; sin fila curada → `sin_cartografia_curada`, la demo nace igual | `backend/services/geo_ciudad.py` |
| Barrios/zonas cardinales ("Norte", "Sur"…) | Prohibidos: filtro en la entrada + limpieza en QA; prod los pierde con la sección D del paquete | `geo_ciudad.es_cardinal`, `scripts/geo/limpiar_barrios_cardinales.py` |
| Una ciudad = **"Zona única"**; los barrios cuelgan de la zona (`barrios.zona_id`) y ya no ascienden a zonas | Hecho (`4a7e3c06`) | `backend/models/barrio.py`, seed de demos |
| **Barrios visibles**: API `/barrios`, ABM en Configuración → Municipio, mapa a nivel barrio | Hecho en este commit (ver §3) | `backend/api/barrios.py`, `frontend/src/pages/Barrios.tsx`, `Mapa.tsx` |
| Borrado de demos guiado por el esquema + script de purga para Infra | Hecho (`44832bf3`); la purga en prod la ejecuta Infra, nunca esta app | `backend/services/demo_borrado.py`, `backend/scripts/purgar_demos.py` |
| Usuario de demo = dominio `.demo.com`, no el código | Hecho (`db389313`) | `backend/services/demo_borrado.py`, `api/municipios.py` |
| Contornos AR desde el WFS del IGN (mediana 279 vértices) | Hecho (`f5b00bac`) | `scripts/batch/contornos_municipios.py` |

## 2. La herramienta: un país entero desde el `.osm.pbf`

Overpass quedó como camino secundario (`curar_geo_catalogo.py`, para retoques
puntuales). El camino principal es el **extracto de Geofabrik** leído con
pyosmium:

```bash
# 1) bajar una vez el extracto (AR: 430 MB)
#    https://download.geofabrik.de/south-america/argentina-latest.osm.pbf
# 2) una pasada por el PBF (AR: ~4 min) + escritura por municipio (AR: ~23 min, es Aiven lo lento)
DATABASE_URL_QA="..." python scripts/geo/extraer_osm_pbf.py --env qa \
    --pais AR --pbf ruta/argentina-latest.osm.pbf --aplicar
#    --refrescar  pisa lo que ya está ok · --limite N  una tanda corta · --rehacer  repite la pasada
```

Cómo funciona: cada elemento del PBF se asigna al municipio del catálogo cuyo
**contorno lo contiene** (STRtree de shapely) y el paquete se arma con el
MISMO `geo_ciudad._parsear` del camino Overpass, así lo curado por una vía o
por la otra es el mismo universo. La columna `fuente` (`FUENTE_PBF`) distingue
las filas. Ventajas medidas: sin cupos, sin el tope de 4.000 elementos por
ciudad, y entran las direcciones puestas sobre el edificio (en el interior son
la mayoría).

Lectura de cobertura, siempre la misma query:

```sql
SELECT pais, estado, COUNT(*), SUM(barrios>0), SUM(calles>0)
FROM catalogo_geo_osm GROUP BY pais, estado;
```

**Cobertura hoy (QA, medida el 2026-09-02 22:55 ART):**

| país | catálogo | con contorno | `ok` | `sin_datos_osm` | sin curar (= sin contorno) | ok con barrios | ok con calles |
|---|---|---|---|---|---|---|---|
| AR | 2.082 | 2.082 | 2.027 | 55 | 0 | 733 | 1.880 |
| PE | 1.873 | 1.641 | 1.636 | 5 | 232 | 369 | 1.044 |
| BO | 539 | 483 | 483 | 0 | 56 | 184 | 455 |
| CL | 346 | 337 | 337 | 0 | 9 | 292 | 334 |
| PY | 263 | 244 | 244 | 0 | 19 | 111 | 224 |
| UY | 19 | 19 | 19 | 0 | 0 | 18 | 19 |

Todo municipio **con contorno** está curado; los 316 sin curar son exactamente
los que no tienen polígono (no hay forma de asignarles elementos del PBF). Los
`ok` sin barrios son en su mayoría comunas chicas donde OSM no tiene
`place=suburb/neighbourhood` — el alta degrada a zonas por calles principales
(nombres reales, nunca cardinales). Cada país tardó entre 1,5 min (UY) y 20
min (PE) de escritura; los logs quedaron en el scratchpad de la sesión.

## 3. Barrios visibles en toda la app (lo de este commit)

Síntoma que reportó Lucas con la demo de Rosario (QA, muni 1000174): 40
barrios sembrados bajo "Zona única" y **ninguno visible** — el mapa decía
"1 de 1 barrios", Configuración mostraba sólo Zonas, y el combo de lugares del
mapa había desaparecido. Causa: los barrios existían sólo como FK de
`reclamos.barrio_id`; no había API ni pantalla, y el mapa razonaba por zona.

Lo que entró:

- **API `GET/POST/PUT/DELETE /api/barrios`** (`backend/api/barrios.py`,
  registrado en `api/__init__.py`): filtra por `municipio_id` del usuario;
  `zona_id` opcional para filtrar; `PUT /barrios/mover` para repartir barrios
  entre zonas cuando aparece la segunda; borrar un barrio con reclamos da
  **409** con el motivo (se mueve o se renombra, no se borra). Cada barrio
  responde `zona_nombre`, `reclamos_count`, `tiene_contorno`. Escritura sólo
  `admin`/`supervisor`.
- **ABM `Barrios`** (`frontend/src/pages/Barrios.tsx`, kit abmv2): hero con
  Barrios / Sin zona / Con contorno / Con ubicación / Más reclamos, filtro por
  zona sólo cuando hay más de una, Sheet con `ModernSelect` de zona. Colgado en
  **Configuración → Municipio → Barrios** (entre Zonas y Parajes) vía el mapa
  `EMBEBIDO` de `Configuracion.tsx`; `Zonas` también quedó embebida ahí (antes
  el riel mostraba un mock).
- **Mapa a nivel barrio** (`Mapa.tsx`): el lugar de un reclamo es
  `barrio → zona` (`lugarDe`); el denominador de "barrios alcanzados" es el
  catálogo de barrios (`/barrios`) con fallback a zonas; combo **Barrio**
  además del de Lugar (zona); con una sola zona se dibujan los contornos de
  todos los barrios (clic = filtrar); el informe PDF acepta ámbito barrio.
- Riel de Configuración más angosto (`Configuracion.css`,
  `clamp(120px, 11vw, 152px)`, labels a dos renglones) — pedido de Lucas,
  pendiente de su vista.

Qué NO se hizo (y es del hilo ABM, con otro agente): la leyenda al pie de las
tablas nuevas (`footer.note`, sigue en `Zonas.tsx`) y las acciones que se
cortan en los ABM nuevos.

## 4. Lo que tiene que repetir Infra al promover

1. Copiar `catalogo_geo_osm` de QA a prod con el `mysqldump --replace` de la
   sección D del paquete — la tabla ya tiene los 6 países (4.806 filas); se
   repite **cada vez que la cobertura crezca** (se avisa por `CANAL_AGENTES.md`).
2. Ejecutar la purga de demos legacy en prod (`backend/scripts/purgar_demos.py`, de `44832bf3`) — la app
   no la corre; queda en manos de Infra con el OK de Lucas en su sesión
   (`MSG-20260902-2215-01`).
3. Prod tiene ~75 municipios legacy con 0 usuarios; las 10 demos que Infra borró
   con el endpoint viejo pueden haber dejado huérfanos. Ofrecida una query de
   sólo lectura para detectarlos (pendiente de esta app).

## 5. Etapa siguiente (abierta, no bloqueante)

- **Contornos que no contienen a su propia ciudad**: 121 municipios AR cuya
  cabecera homónima de OSM cae fuera del polígono IGN (Centenario, Neuquén: 19
  km; Inriville, Córdoba: 5 km) → curan `sin_datos_osm` con la ciudad entera
  mapeada. Herramienta lista: `scripts/geo/contornos_osm_pbf.py --pais AR
  --pbf … --solo ciudad_afuera` (emparenta por nombre normalizado + contención,
  nunca por cercanía; escribe sólo con `--aplicar`). Falta correrla y
  re-curar esos municipios con `--refrescar`.
- **Municipios sin contorno** fuera de AR (PE 232, BO 56, PY 19, CL 9): mismo
  script con `--solo sin_poligono`; hasta que tengan polígono no entran al PBF.
- 68 municipios AR (comunas de Córdoba) con el centro del catálogo fuera de su
  polígono IGN: recentrar al centroide, pendiente de decidir qué fuente miente.
- Barrios `landuse=residential` como fuente adicional donde OSM no tiene
  `place=*`: idea, sin medir.
- **Polígonos de barrio**: el extractor PBF guarda de cada `place` way/relation
  sólo el centro del bbox (como el `out center` de Overpass), así que los
  barrios de las demos nuevas nacen como PUNTO (Rosario: 0 de 40 con contorno;
  en QA hay 50 de 297 con polígono, de demos anteriores). Para que el mapa
  dibuje barrios de verdad hay que guardar el anillo exterior de los
  `place=suburb/neighbourhood` que son áreas y de los `admin_level 9|10` en el
  paquete (`places[].poligono`) y que el seed lo copie a `barrios.poligono`.
  Es el siguiente paso natural del foco "polígonos en el mapa".
- Sembrar reclamos de demo dentro del contorno de su barrio cuando exista (hoy
  caen dentro del contorno de la localidad).

## 6. Gates y trampas pagadas

- Front: `npx tsc -p tsconfig.app.json --noEmit` + `npx eslint <archivos
  tocados>` (hay ~535 errores legacy en otros archivos; el gate es que lo
  tocado esté limpio) + `BACKEND_ORIGIN=https://munify-api-qa-1060106389361.us-east4.run.app npm run build`
  (`gen-redirects` es fail-closed sin esa variable).
- Backend: `python -m pyflakes backend/api/barrios.py` antes de pushear.
- `ConsultaGuiada`: un filtro se dibuja SÓLO donde aparece su marca `{id}` en
  la plantilla; una marca sin filtro se ve literal. Por eso `preguntasConLugar`
  inserta `{barrio}` únicamente cuando el combo existe.
- Orden de rutas en FastAPI: `PUT /barrios/mover` va declarado ANTES de
  `/{barrio_id}`.
- Dos agentes en el mismo working tree (2026-09-02 noche): commitear con lista
  explícita de archivos, nunca `git add -A`.
