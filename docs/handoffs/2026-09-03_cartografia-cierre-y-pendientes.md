# Cartografía — cierre del 2026-09-03 (noche) y TODO lo pendiente

> **Para el próximo agente:** leé la memoria `project_cartografia_territorio.md`
> (modelo, decisiones textuales, 17 tropiezos) y este handoff. Nada más hasta
> que el dueño te mande a una sección puntual de otro handoff. Los handoffs
> anteriores de geo son registro del día, no fuente de verdad.

## 0. Cómo se trabaja este tema desde hoy (órdenes del dueño, textuales)

- **Atómico:** una tarea por vez, cerrada y medida, y FRENAR: resumen de 3
  líneas y esperar la próxima orden. *"Vos sos más de arrancar y no frenás, y
  el usuario se pierde."* Restricción temporal que levanta él.
- **Fable planifica, UN agente Opus ejecuta** lo operativo (regla 23 del
  CLAUDE.md global). Decir siempre qué se delega y qué no.
- **Sin jerga:** no es especialista en cartografía. Toda sigla se explica la
  primera vez; números en tabla chica; un frente por mensaje.
- **Prioridad de negocio, país por país y después provincia por provincia:**
  (1) contornos de todos los municipios — **los dio por chequeados al 100 %,
  "olvidate"**; (2) nombres de todos los barrios; (3) polígonos.
- **Barrio = localidad.** La palabra única es "barrio" (el último nivel).
- **Todo o nada en el mapa:** *"o tenemos el cien por ciento del municipio con
  polígonos o mostramos solamente el contorno... así de restrictivo"*,
  refinado a *"si le falta uno y son tres, no; si le faltan dos y son
  catorce, sí"* → columna `cartografiado` con vara **85 % dibujado y 5+
  barrios** (§2).
- Siguen vigentes: nada online, nada inventado, cardinales prohibidos, prod
  en HOLD (promueve Infra), nunca `git add -A`.

## 1. Qué se hizo hoy (todo en `qa`, verificado por el director contra la BD)

| Bloque | Resultado | Commit |
|---|---|---|
| Escaneo `landuse=residential` (OSM) | Corrido EN SECO, **no aplicado** ("salteá"): +10.579 polígonos candidatos pero 53 % ruido (manzanas, códigos) y sólo 20 municipios saldrían de zona sola. Filtro de ruido `_es_ruido_residential` commiteado y probado, sin aplicar | `b9557477` |
| BAHRA (lista oficial IGN/INDEC de localidades y parajes, vía georef `asentamientos.json`, 14.466 entradas) | **Municipios AR sin nada adentro: 774 → 455.** 694 nombres en 319 municipios, con punto y sin polígono. Script `scripts/geo/catalogo_barrios_bahra.py`; dataset en `backend/scripts/datos/asentamientos.json` | `aea2f0eb` |
| Columna `cartografiado` | `municipios_catalogo.cartografiado` (0/1) + `motivo_cartografiado`; script `scripts/geo/marcar_cartografiado.py`; la obedecen la semilla y la pantalla Territorio. **AR 147/2.082**, PY 15/263, BO 2/539, PE 1/1.873, CL 0, UY 0. Migración `alembic/versions/20260905_cartografiado.py` | `dd48293d`, `02efa9c7` |
| Memoria del agente | Dos memorias de cartografía → una (`project_cartografia_territorio.md`), 17 tropiezos, decisiones con cita, dónde está cada cosa | (memoria, no repo) |

## 2. Los números de Argentina (QA, 2026-09-03 ~23:50 ART)

Universo: **2.082 municipios** (la lista oficial cuenta municipios, comunas
y comisiones de fomento; por eso Córdoba 427 y Buenos Aires 135). Todos
con contorno.

| Municipios de Argentina | Cantidad | % |
|---|---|---|
| Dibujan sus barrios (`cartografiado = 1`) | 147 | 7 % |
| Parciales o completos pero por debajo de la vara | 660 | 32 % |
| Con nombres y ningún dibujo | 820 | 39 % |
| Sin nada adentro | 455 | 22 % |

De los 455 vacíos: 423 son pueblos de un solo centro poblado (BAHRA sólo
trae el nombre del pueblo, que por decisión del dueño no se carga como
barrio único) y 32 no figuran en BAHRA. **No hay fuente que los llene.**

De los 589 parciales: a 108 les falta 1 dibujo (50 tienen sólo 2 barrios; 34
tienen 6 o más: Funes 88/89, Junín 56/57, Río Cuarto 54/55, Lanús 40/41),
a 138 les faltan 2 o 3, a 343 les faltan 4 o más. **64 tienen un nivel
entero dibujado** (36 en barrios, 28 en localidades). Aparte, 128 municipios
tienen un solo barrio dibujado (no sirve, dicho por el dueño).

Barrios sueltos: 18.408 se muestran, 10.766 con polígono (58 %).

Cómo medirlo de nuevo (QA, con `DATABASE_URL_QA` del secret, nunca impresa):

```sql
-- cartografiados por país
SELECT pais, COUNT(*), SUM(cartografiado=1) FROM municipios_catalogo GROUP BY pais;
-- por municipio: barrios que se muestran y cuántos con dibujo
SELECT municipio_catalogo_id, COUNT(*) n, SUM(poligono IS NOT NULL) p
FROM catalogo_barrios WHERE pais='AR' AND hoja=1 GROUP BY municipio_catalogo_id;
-- vacíos
SELECT COUNT(*) FROM municipios_catalogo m WHERE m.pais='AR'
 AND NOT EXISTS (SELECT 1 FROM catalogo_barrios b WHERE b.municipio_catalogo_id=m.id AND b.hoja=1);
```

La API de Territorio (`GET /api/admin/territorio/municipios?pais=AR`, token
de `superadmin@test.com`) trae ahora `cartografiado` y `motivo_cartografiado`
por municipio.

## 3. Pendientes, en el orden que creo que pide el negocio

Cada uno es UN bloque: se propone, el dueño dice "dale", se ejecuta, se
mide, se frena.

| # | Qué | Por qué | Cómo | Quién |
|---|---|---|---|---|
| 1 | **Resembrar las demos ya sembradas** (Lanús 1000184, Merlo-2 1000175, las de QA) para que obedezcan `cartografiado` | Conservan polígonos copiados ANTES de la regla: hoy muestran mapas "desprolijos" que la regla prohíbe. Nunca SPN (80) | Borrar y volver a sembrar cada demo, o script que quite `barrios.poligono` cuando su municipio del catálogo está en 0 | app (Opus) |
| 2 | **Medir si el escaneo residential (ya filtrado) hace cruzar la vara** a municipios parciales | Pocito está en 81 % con 38/47: unos polígonos más lo pasan a cartografiado. Es la única palanca barata para subir los 147 | Seco de `catalogo_barrios_pbf.py` con el filtro + simulación de `marcar_cartografiado` sobre el sqlite; informar "147 → N". Aplicar sólo con OK | app (Opus) |
| 3 | **Rescatar los 64 parciales con un nivel entero dibujado** | Mostrando sólo ese nivel quedan 100 % honestos. Requiere decidir si `cartografiado` puede evaluarse por nivel | Primero medir con la vara 85 %/5+ por nivel; después extender `marcar_cartografiado.py` con un `nivel_dibujado` | dueño decide, app ejecuta |
| 4 | **Promoción a prod (Infra), en HOLD** | Prod corre código viejo y dibuja de más (La Matanza 214 vs 24) | Paquete: copia de `catalogo_barrios` + `municipios_catalogo` (con columnas) + código `fa4065a5` + migración `20260905_cartografiado`. Re-avisar con los números nuevos; "Ampliación 3" ya está en `base-compartida/munify/PROMOCION-CARTOGRAFIA-OFFLINE.md` | Infra, cuando el dueño lo habilite |
| 5 | **Paraguay y el resto, país por país** | Orden del dueño: BA → Córdoba → Santa Fe → resto AR → Paraguay → resto. AR tiene nombres; PY 15 cartografiados, BO 2, PE 1, CL/UY 0 | Repetir el ciclo de AR: nombres (¿hay BAHRA equivalente? PY: INE, `scripts/datos/distritos_py_ine.json`; los demás, `village/hamlet` de OSM ya cargados) y medir | app (Opus) |
| 6 | **Mostrar el tilde en la pantalla Territorio** (front) | La API ya lo manda; la pantalla todavía no lo muestra como badge/columna | Kit abmv2, columna o píldora "Dibuja barrios / Sólo contorno" con el motivo | app |
| 7 | Los **32 municipios AR que no figuran en BAHRA** | Cola honesta; lista con `faltantes_barrios.py --env qa` | Curación manual o fuente provincial, sólo si el dueño lo pide | dueño |
| 8 | Colapsar **manzanas a barrio** (3.022 filas "B° X - Mza N" → ~274 barrios en 6 municipios, Rawson SJ 2.231) | Hoy se descartan por ruido; son barrios reales con polígono por unión de manzanas | Unión de polígonos por nombre base en fase 2 del PBF | app, baja prioridad |
| 9 | **Re-marcar E6** en PY/UY/CL/BO/PE | Quedaron con la regla E (vieja): pueden tener padre e hijo dibujados a la vez | `marcar_hojas.py --env qa --pais PY,UY,CL,BO,PE --aplicar`, después `marcar_cartografiado.py` | app, cuando se toque cada país |
| 10 | `crear-demo` y `POST /municipios` **siguen cayendo a Nominatim online** | Contradice "la cartografía no se hace online nunca" | Sacar la llamada; el alta usa sólo el catálogo. Necesita consentimiento (módulo central) | dueño autoriza, app ejecuta |
| 11 | Legacy: `sembrar_zonas.py` (borrar), demos QA con zonas por localidad (La Matanza 16, Pergamino 15, Moreno 6, Merlo 5) sin convertir | Confunden al próximo agente | Borrar el script; convertir o borrar esas demos | app |
| 12 | **PBFs viven en un scratchpad de sesión** (`24267f16-…/scratchpad/pbf/`, 1,9 GB) | Se pueden perder; la fase 1 se regenera en 47 s pero la descarga son minutos | Copiar los 6 `*-latest.osm.pbf` a `D:\Code\_datos\pbf\` y apuntar ahí en los docstrings | app, 5 minutos |
| 13 | Contornos: 121 munis AR cuyo contorno no contiene su ciudad + 68 comunas de Córdoba con el centro afuera | **El dueño dio los contornos por cerrados al 100 %: NO proponerlo.** Queda anotado por si él lo reabre | `contornos_osm_pbf.py --solo ciudad_afuera` | sólo a pedido |
| 14 | `municipios_catalogo` sin modelo ORM | Las columnas nuevas se leen con SQL `text()` | Opcional; no bloquea nada | app |
| 15 | Ordenar `docs/geo/` con un README de entrada | Se empezó y se frenó (el dueño pidió la MEMORIA, no los docs). Hoy la puerta es la memoria + este handoff | Sólo si lo pide | dueño |

## 4. Herramientas nuevas de hoy (todas con `--env qa`, seco sin `--aplicar`)

```bash
cd backend
# nombres de localidades y parajes (BAHRA) en municipios vacíos
DATABASE_URL_QA="$(gcloud secrets versions access latest --secret=DATABASE_URL_QA --project=munify-api)" \
  python scripts/geo/catalogo_barrios_bahra.py --env qa --pais AR --archivo scripts/datos/asentamientos.json [--aplicar]
# tilde cartografiado por municipio (vara: PCT_MINIMO=0.85, MIN_BARRIOS=5, constantes del script)
DATABASE_URL_QA="..." python scripts/geo/marcar_cartografiado.py --env qa [--pais AR] [--detalle] [--aplicar]
# escaneo OSM del PBF (residential ya filtrado), sin aplicar hasta nueva orden
DATABASE_URL_QA="..." python scripts/geo/catalogo_barrios_pbf.py --env qa --pais AR --pbf <ruta>/argentina-latest.osm.pbf
```

Corridas de más de 10 minutos: detached con `Start-Process "C:\Program Files\Git\bin\bash.exe"` (ruta completa). Antes de una carga masiva: `SELECT @@read_only` (QA y prod comparten el Aiven).

## 5. Avisos

- Hay **otra sesión** con archivos del backend modificados y sin commitear en
  este working tree (`api/auth.py`, `api/municipios.py`,
  `api/demos_auditoria.py`, `models/municipio.py`, `models/user.py`,
  `schemas/user.py`, `services/demo_borrado.py`). No son de cartografía; no
  tocarlos ni commitearlos desde acá.
- `frontend/dist/` aparece modificado siempre: nunca se commitea.
