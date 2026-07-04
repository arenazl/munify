# Fase 6 · Puntos de Interés + prioridad única sobre OT universal

> **Para un agente que arranca en frío (pensado para ejecutarse con Opus en sesión propia).**
> Contexto general: [01-analisis-funcional.md](01-analisis-funcional.md). **Prerrequisito: F0
> aplicada** (multi-tenant + escalado apagado). Esta fase es independiente de F1-F3 y es
> PRERREQUISITO de F4 (el despacho asume OT universal). Referencias `archivo:línea` = commit
> `369621e` (2026-07-04) — verificar con grep antes de editar. Reglas del repo: §8 del funcional.
> Pedido original de la clienta: POIs (hospital, escuelas, bomberos...) en el mapa con radio
> configurable (default 2 km), y que los reclamos/OTs dentro de ese radio tengan más prioridad.

## 0. Decisiones YA TOMADAS con el dueño (2026-07-04 — no reabrir)

| # | Decisión | Resolución |
|---|---|---|
| D11 | ¿Toggle de existencia de OT o modelo único? | **OT universal transparente. Un solo modelo.** Toda asignación crea una OT por debajo (implícita 1:1 si es asignación simple). El flag `ordenes_trabajo` pasa a ser flag de SUPERFICIE (qué pantallas ves), no de modelo |
| D12 | ¿Dónde vive la prioridad? | **En UNA sola entidad: la OT** (enum existente baja/media/alta/urgente). `Reclamo.prioridad` (Integer 1-5, hoy muerto y con semántica contradictoria) se DEPRECA. El reclamo muestra/edita "su" prioridad leyéndola de su OT |
| D13 | ¿Cómo jerarquizar prioridad manual vs POI? | **Sin scores ni boosts aritméticos.** Esquema simple del dueño: reclamo que entra en zona de POI → se recomienda vincularlo a la **OT consolidada del POI**, que es prioridad **ALTA**. URGENTE queda reservado como escalón exclusivamente MANUAL del supervisor (el sistema nunca lo setea ni lo pisa) |
| D14 | Consolidación: ¿automática o sugerida? | **Recomendación con un click de confirmar** (el supervisor decide), nunca automática silenciosa |
| D15 | Radio del POI | Default **2.000 m**, editable por POI con slider (rango 100–10.000 m). El tipo de POI define un default propio opcional |
| D16 | Mapa | **Polimórfico por toggle de modo**: "Reclamos" (actual) / "Puntos" (gestión de POIs). El "dibujar" (BBox) queda como herramienta del modo Reclamos |

## 1. Estado actual relevado (2026-07-04, con evidencia)

**Prioridad del RECLAMO — muerta y con landmine semántico:**
- `Reclamo.prioridad = Column(Integer, default=3)  # 1-5, donde 1 es más urgente`
  (`models/reclamo.py:23`). Está en los 3 schemas, pero NINGUNA UI la setea: el wizard la
  hardcodea en 3 (`CrearReclamoWizard.tsx:446`), SalesBot también (`salesbot.py:682`),
  ReclamoDetalle tiene cero menciones. Único escritor post-creación: el escalado
  (`escalado.py:227-229`), apagado en F0.
- **LANDMINE:** conviven dos semánticas opuestas. Convención "1=urgente": modelo, wizard
  (labels muertos `CrearReclamoWizard.tsx:86-92`), vista guiada (`Reclamos.tsx:4335`
  `prioridad === 1` → Urgentes), escalado, heatmap (`analytics.py:94-95`). Convención
  "5=urgente": dashboard (`dashboard.py:819,966` `prioridad >= 4` + `.desc()`),
  `SLA.tsx:179-185` (5='Crítica'), seeds. Consecuencia viva: el pool sin-asignar de
  Planificación ordena `.order_by(Reclamo.prioridad.desc())` (`planificacion.py:319`) — bajo
  la semántica del modelo pone los MENOS urgentes primero. **Bug latente hoy.**
- Lectores a migrar cuando se depreque: vista guiada (`Reclamos.tsx:4331-4339`), dashboard
  urgentes/para_hoy (`dashboard.py:819, 960-972, 998`), pool de planificación
  (`planificacion.py:311-321`), SLA matching (`sla.py:205-227, 286`), analytics heatmap
  (`analytics.py:94-95, 167, 248`), export CSV (`exportar.py:100,128`), trámites usa patrón
  aparte (`GestionTramites.tsx:1499-1501` — NO tocar, es otra entidad).
- `CategoriaReclamo.prioridad_default` (`categoria_reclamo.py:31`) + override per-dependencia
  (`municipio_dependencia_categoria.py:42`): editable en config pero el create real NUNCA la
  lee — default fantasma, solo seeds.

**Prioridad de la OT — viva y completa (la base a conservar):**
- `Enum(PrioridadOT)` baja/media/alta/urgente, default MEDIA, indexada
  (`models/orden_trabajo.py:51-53`, enum en `models/enums.py:42-47`). Seteable con
  ModernSelect (`OrdenesTrabajo.tsx:619-623`), badge color+icono en tabla y cards
  (:375-384, :483-488), sale en el PDF (`lib/printOrdenTrabajo.ts:100`). SSoT frontend:
  `lib/enums/prioridadOT.ts` (labels, colores, iconos, helpers resilientes, PRIORIDAD_OPTIONS).
- Hoy NO ordena ni filtra nada: el listado ordena por `created_at`
  (`ordenes_trabajo.py:430-477`); único filtro front = estado. Es puramente visual.

**Geo / Mapa:**
- Mapa = react-leaflet + leaflet.heat (`Mapa.tsx:4-13,38`), tiles CARTO por theme. Modos
  actuales: pins/heat/both + hotspots + coverage + time-lapse + "dibujar". El "dibujar" es un
  RECTÁNGULO BBox efímero 100% client-side (`Mapa.tsx:290-368`, tipo en
  `lib/mapaUtils.ts:270-285`): filtra en memoria, muestra mini-stats y exporta PDF con jsPDF
  (:756-837). No persiste nada y no tiene relación con la entidad Zonas (homónimos
  desconectados).
- Carga TODOS los reclamos del muni en lotes de 100 (`Mapa.tsx:507-546`) y filtra client-side;
  filtros persistidos en localStorage `mapa_filtros_v1` (:385-446). Panel de filtros ya
  extraído (`components/mapa/MapaFiltrosPanel.tsx`, con ModernSelect).
- **No existe `<Circle>` geográfico (radio en metros) en toda la app** — solo CircleMarker
  (píxeles). **No existe componente Slider** en `components/ui/` (solo `input type="range"`
  nativos en Layout/Configuracion — los nativos están VETADOS por regla dura).
- Haversine duplicado 4 veces: `utils/geo.py` (canónico, METROS, :8-46 + `are_locations_close`
  :49-74), `analytics.py:31-41` (km), `municipios.py:111` (km), `barrio_detector.py:201-213`
  (km). No hay PostGIS: todo Python en memoria. Precedente más cercano al matching por radio:
  `analytics.py:112-179` (/clusters con radio_km) y `barrio_detector.py:85-135` (barrio más
  cercano ≤5 km).
- `Reclamo.latitud/longitud` son NULLABLE (`models/reclamo.py:27-28`) — el matching debe
  bancarse reclamos sin coords. La OT NO tiene coords propias: hereda vía pivot
  `orden_trabajo_reclamos`.
- Precedentes reutilizables: `components/ui/MapPicker.tsx` (elegir punto),
  `components/tesoreria/PolygonDrawer.tsx` + `models/paraje.py:32-37` (polígono JSON +
  centroide — por si algún día el POI necesita polígono en vez de radio).

**POIs — no existe nada** (grep `poi|punto.*interes|PuntoInteres` en backend y frontend: 0
matches estructurales). Patrones a imitar:
- Catálogo per-muni: `inventario_categorias` (`models/inventario.py:26-58`) y
  `ot_tipos_trabajo` (`models/orden_trabajo.py:106-127`) — uq(municipio_id, nombre), icono,
  color, orden, activo; seed template idempotente (`services/ot_tipos_seed.py:13-43`); router
  con `require_roles` + `resolve_municipio_id(request, current_user)` de `core.tenancy`
  (respeta X-Municipio-ID del superadmin — USARLO); DELETE inteligente (soft si está
  referenciado, hard si no, `ot_tipos_trabajo.py:120-139`); ABM front clonando
  `OTTiposTrabajoConfig.tsx` (StickyPageHeader + grid cards + Sheet + ConfirmModal); tile en
  `Configuracion.tsx` sección catálogos (:631-648); ruta en `routes.tsx:301-308`.
- Feature flag: `municipio_modulos` (modelo `municipio_modulo.py:7-39`), GET/PUT en
  `api/modulos.py`, el Layout lo carga (`Layout.tsx:181-198`) y `navigation.ts` gatea con
  `modulosActivos.has(...)` (:203, :212). **GAP a no repetir:** 'inventario' no está en el
  catálogo `MODULOS` de `lib/enums/modulos.ts:23-39` → el superadmin no puede togglearlo;
  el flag nuevo `poi` DEBE agregarse ahí en el mismo commit.
- Migración aditiva: `scripts/migrate_add_inventario.py` (CREATE TABLE IF NOT EXISTS) +
  `migrate_add_ot_formato.py` (`_col_existe()` vía information_schema para ALTERs) — template
  exacto. Rollout: patrón `generalizar_modulo_campo.py` (dry-run default + `--activar`).
- Gotcha de notificaciones: existe plantilla/toggle 'cambio_prioridad'
  (`config/notificaciones.json:147-157`, `WhatsAppConfig.tsx:872`) — la consolidación masiva
  NO debe spamear (una notificación por OT, no por reclamo).

## 2. Diseño

### 2.1 Etapa A — Fundación: OT universal + prioridad única

**OT implícita.** Toda asignación de trabajo crea/usa una OT. Columna nueva
`ordenes_trabajo.origen` ENUM('manual','implicita','consolidada_poi') default 'manual'.
- Asignación simple (el gestor elige un empleado en el Sheet, munis chicos): el backend crea
  por debajo una OT implícita 1:1 (autonumerada, sin tipo_trabajo, empleado_id seteado,
  prioridad media) y vincula el reclamo. La UI del muni simple NO cambia: no ve la palabra
  "orden" en ningún lado.
- La OT implícita ESPEJA al reclamo automáticamente: reclamo → en_curso ⇒ OT en_curso;
  reclamo finalizado/resuelto ⇒ OT completada; reclamo rechazado ⇒ OT cancelada. Espejo solo
  para `origen='implicita'` (las manuales/consolidadas conservan su ciclo propio con
  confirmación humana).
- Si el gestor luego vincula ese reclamo a una OT explícita, la implícita se cancela sola
  (absorción). `Reclamo.empleado_id` se mantiene como columna DERIVADA de la OT (espejo para
  no romper lectores existentes: mis-trabajos, planificación, scoring) pero deja de ser
  fuente de verdad — la escritura pasa siempre por la OT.
- **Migración de datos:** reclamos ACTIVOS (recibido/en_curso/pospuesto/pendiente_confirmacion)
  con `empleado_id` y sin OT vigente → generar su OT implícita. Los cerrados no se migran
  (histórico queda como está). Script idempotente con dry-run + `--aplicar` y backup JSON
  previo (patrón `_backup_*.json`).
- El flag `ordenes_trabajo` pasa a gatear SOLO superficie (pantalla Órdenes en sidebar,
  bloque OT del Sheet). El modelo corre para todos los munis.

**Prioridad única.**
- La prioridad canónica es `ordenes_trabajo.prioridad` (enum existente). Semántica de
  niveles: el sistema asigna como máximo ALTA; URGENTE es solo manual (D13).
- `Reclamo.prioridad` (Integer) se depreca: la columna queda (no romper el schema en esta
  fase) pero deja de leerse/escribirse. Migrar los lectores a la prioridad de la OT del
  reclamo (subquery/join por el pivot; un reclamo con varias OTs vigentes → max):
  - Vista guiada Urgentes (`Reclamos.tsx:4331-4339`) → `prioridad_ot in ('alta','urgente')`.
  - Dashboard urgentes/para_hoy (`dashboard.py:819, 960-998`) → ídem + ORDER BY por enum
    (CASE urgente>alta>media>baja).
  - Pool de Planificación (`planificacion.py:319`) → ídem (esto ARREGLA el bug del orden
    invertido).
  - SLA matching (`sla.py:205-227`) → mapear enum→nivel para las configs existentes
    (baja=1... urgente=4) o migrar `sla_configs.prioridad` al enum. Elegir lo más simple al
    implementar; documentarlo en el commit.
  - Analytics heatmap (`analytics.py:94-95`) → peso por enum (urgente 1.0, alta 0.8,
    media 0.5, baja 0.3). Export CSV → label del enum.
- `ReclamoResponse` expone `prioridad_ot` (string enum, nullable si no tiene OT — durante la
  transición puede pasar; la UI usa fallback 'media').
- UI: badge de prioridad en el Sheet del reclamo (usando `lib/enums/prioridadOT.ts`, que se
  renombra/aliasa a `lib/enums/prioridad.ts` como SSoT único) + editor ModernSelect que
  escribe en la OT. Borrar el vestigio `PRIORIDAD_LABELS` muerto de
  `CrearReclamoWizard.tsx:86-92` y los labels contradictorios de `SLA.tsx:177-186`.
- La lista de OTs pasa a ordenar por prioridad (urgente→alta→media→baja) y luego
  `created_at` — hoy la prioridad es solo decorativa.
- `categoria.prioridad_default` (1-5 fantasma): mapear a enum (1-2→alta, 3→media, 4-5→baja)
  y aplicarla como prioridad inicial de la OT implícita/manual al crearse sobre un reclamo de
  esa categoría. Deja de ser fantasma sin agregar UI nueva.

### 2.2 Etapa B — POIs, consolidación y mapa polimórfico

**Modelo (migración aditiva `scripts/migrate_add_poi.py`, patrón inventario):**
```sql
poi_tipos:        id, municipio_id FK, nombre, icono, color, radio_default_metros INT NULL,
                  orden, activo, uq(municipio_id, nombre)
puntos_interes:   id, municipio_id FK, tipo_id FK poi_tipos ON DELETE RESTRICT, nombre,
                  direccion VARCHAR NULL, latitud FLOAT NOT NULL, longitud FLOAT NOT NULL,
                  radio_metros INT NOT NULL DEFAULT 2000, activo BOOL, notas TEXT NULL,
                  created_at, updated_at
reclamos:         + poi_id INT NULL FK puntos_interes ON DELETE SET NULL  (desnormalizado:
                  "está dentro de la zona de")
ordenes_trabajo:  + poi_id INT NULL FK (para la OT consolidada del POI) + origen (Etapa A)
```
- Seed template de tipos (`services/poi_seed.py`, patrón `ot_tipos_seed.py`): Hospital,
  Salita, Escuela, Jardín, Bomberos, Comisaría, Geriátrico, Club, Plaza — icono lucide +
  color + radio_default (hospital 2000, escuela 1000, etc. — ajustables por muni).
- Flag `poi` opt-in: fila en `municipio_modulos` + **entrada en `lib/enums/modulos.ts`**
  (no repetir el gap de inventario) + `activar_modulo_poi()` en el seed + script de rollout
  dry-run/`--activar`.

**Matching reclamo↔POI (sin PostGIS, escala sobrada):**
- Al crear/editar un reclamo CON coords: haversine (`utils/geo.py`, metros) contra los POIs
  activos del muni (decenas por muni → en memoria, trivial). Si cae dentro de uno o más
  radios → `reclamo.poi_id` = el POI más cercano. Sin coords → poi_id NULL (documentado: los
  reclamos sin geo quedan fuera del circuito POI).
- Al crear/editar/borrar un POI o cambiar su radio: recálculo batch de los reclamos ACTIVOS
  del muni (mismo helper). Endpoint devuelve el conteo ("42 reclamos dentro de la zona").
- **De paso (deuda):** consolidar las 4 copias de haversine en `utils/geo.py` (borrar las de
  `analytics.py:31`, `municipios.py:111`, `barrio_detector.py:201`; arreglar el
  `__import__` inline de `reclamos.py:780`).

**Consolidación sugerida (D13+D14 — el corazón del pedido):**
- Regla: reclamo activo con `poi_id` y sin OT consolidada de ese POI → el sistema RECOMIENDA
  vincularlo a la OT consolidada del POI. La OT consolidada es una OT `origen='consolidada_poi'`
  + `poi_id`, una VIGENTE por POI (si no existe, la recomendación es crearla), título
  autogenerado ("Zona {POI}"), **prioridad ALTA** de nacimiento.
- Superficies de la recomendación:
  1. Banner en el Sheet del reclamo: "Este reclamo está a {d} m de {POI} — [Vincular a la
     OT de zona]" (un click: crea/vincula, mueve el reclamo si tenía OT implícita).
  2. Sección en la vista guiada/inbox de Reclamos: "En zona de puntos de interés (N)".
  3. Modo Puntos del mapa: cada POI muestra su contador de reclamos dentro del radio y acción
     "Consolidar en OT".
- En munis con flag `ordenes_trabajo` de superficie APAGADO: misma mecánica, copy sin la
  palabra "orden" ("Agrupar con los reclamos de la zona {POI}") — por debajo es la misma OT
  consolidada. La prioridad alta la ven en el badge del reclamo (que lee de la OT).
- NUNCA automático-silencioso; siempre confirmación de un click (D14). Al consolidar N
  reclamos: UNA notificación por OT (no por reclamo — gotcha del spam de 'cambio_prioridad').
- Al cerrar la OT consolidada, el POI queda sin OT vigente; el próximo reclamo en zona
  propone crear una nueva.

**Mapa polimórfico (D16):**
- Toggle de modo en el header del Mapa: **Reclamos | Puntos** (persistido en localStorage —
  versionar la key a `mapa_filtros_v2`). Gate: modo Puntos solo con flag `poi` y rol
  admin/supervisor.
- **Modo Puntos** (gestión de POIs sobre el mapa):
  - Markers con icono/color del tipo + `<Circle>` de react-leaflet con `radio_metros`
    (PRIMER uso de Circle geográfico en la app).
  - Click en el mapa → crea POI ahí (abre Sheet de atributos); drag del marker → mueve
    (confirmación). Sheet: nombre, tipo (ModernSelect del catálogo), dirección
    (DireccionAutocomplete opcional, reverse geocoding vía `geocoding.py`), **radio con
    Slider** (100–10.000 m, step 100, default = radio_default del tipo o 2.000), activo, notas.
  - Lista lateral de POIs (buscar/filtrar por tipo) + contador de reclamos en zona por POI +
    acción "Consolidar en OT".
  - **Componente nuevo `components/ui/Slider.tsx`** (theme-aware con thumb estilado — los
    `input type="range"` nativos están vetados; al quedar estable, PORTAR versión agnóstica a
    `d:\Code\APP_GUIDE\components\`).
- **Modo Reclamos** (el actual): se suma toggle de capa "Puntos de interés" (círculos tenues
  + markers chicos) en `MapaFiltrosPanel`; los pins de reclamos con `poi_id` llevan un dot/
  badge. El "dibujar" BBox y demás herramientas quedan como están.
- ABM secundario: pantalla `POITiposConfig.tsx` (clon de `OTTiposTrabajoConfig.tsx`) + tile
  "Tipos de POI" en Configuración > Catálogos + ruta. La gestión de POIs individuales vive en
  el MAPA (es su editor natural) — no crear una ABMPage aparte de POIs.
- NO tocar en esta fase la deuda visual del Mapa (paletas hardcodeadas, drawer a mano) — es
  F3. Si F3 ya corrió, respetar lo que haya dejado.

**Backend nuevo (`backend/api/poi.py`, patrón `ot_tipos_trabajo.py`):**
- `/poi-tipos` CRUD (roles admin/supervisor escritura, +empleado lectura; DELETE inteligente
  soft/hard).
- `/pois` CRUD + `GET /pois/{id}/reclamos-en-zona` (conteo+lista) + `POST /pois/{id}/consolidar`
  (crea/obtiene OT consolidada y vincula los reclamos indicados) + `POST /pois/recalcular`
  (batch matching del muni).
- Todo con `resolve_municipio_id(request, current_user)` (multi-tenant estricto) y registrado
  en `api/__init__.py` con prefijo propio.

## 3. Orden de ejecución sugerido (tareas)

Etapa A (fundación): A1 migración `origen` + espejo de estados de OT implícita → A2 creación
implícita en los endpoints de asignación → A3 migración de datos (dry-run → aplicar) → A4
lectores de prioridad a enum-de-OT (vista guiada, dashboard, planificación, SLA, analytics,
CSV) → A5 badge+editor de prioridad en el Sheet + SSoT `lib/enums/prioridad.ts` → A6 orden
por prioridad en listas + `categoria.prioridad_default` mapeada.

Etapa B (POIs): B1 migración tablas + flag + seed tipos → B2 router poi.py + matching en
create/edit de reclamo + recálculo batch → B3 consolidación (endpoint + banner Sheet +
sección inbox) → B4 mapa modo Puntos (Circle + Slider nuevo + Sheet POI + lista lateral) →
B5 capa POI en modo Reclamos + badges → B6 ABM tipos + tile Configuración + rollout script.

Criterios de aceptación (mínimos):
- Muni simple (sin superficie OT): asignar empleado sigue siendo un combo; por debajo hay OT
  implícita; el badge de prioridad aparece; nada de "órdenes" visible.
- Crear POI "Hospital" radio 2 km → los reclamos activos con coords dentro quedan `poi_id`
  seteado y aparece la recomendación; consolidar crea UNA OT alta con los N reclamos y UNA
  notificación.
- El pool de Planificación ordena urgente→alta→media→baja (bug del orden invertido muerto).
- Un reclamo sin coords no rompe nada (queda fuera del circuito POI).
- Superadmin puede togglear `poi` desde la pantalla Módulos.

## 4. No alcance

- Polígonos libres para POIs (el precedente `PolygonDrawer`/paraje existe si algún día se
  pide; hoy es radio circular).
- Reglas de prioridad por antigüedad/SLA/vecinos sumados (futuro; el diseño de una sola
  entidad las soporta después).
- Borrar la columna `reclamos.prioridad` (se depreca en esta fase; el DROP definitivo es de
  F5 junto al barrido de estados legacy).
- La deuda visual del Mapa (F3) y el despacho/canvas (F4).

## 5. Checklist de cierre

1. pyflakes backend + `npm run build` + `npx eslint src/ --ext .ts,.tsx`.
2. Migraciones ejecutadas (aditivas, idempotentes, dry-run primero). Backup JSON de filas
   tocadas por la migración de datos de la Etapa A.
3. Probar con: muni demo con todo prendido, muni demo SIN superficie OT, y verificar que SPN
   (muni 80, productivo — solo cambios aditivos ahí) no ve nada nuevo sin su flag.
4. Portar `Slider` agnóstico a APP_GUIDE. Commit + push origin master (el deploy lo dispara
   Infra). Actualizar §7 del funcional + memoria + handoff.
