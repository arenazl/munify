# Pasamanos · 26-27 de agosto de 2026

> **Desactualizado en lo que toca a `calls` (nota del 2026-09-04).** La página
> se mudó a `d:\Code\munify-calls` (repo `arenazl/munify-calls`, branch `main`)
> y su copia en este repo se borró. Las rutas `scripts/calls/` y
> `frontend/public/calls/` que se nombran abajo **ya no existen acá**; el
> resto del handoff sigue valiendo.


Sesión larga. Tres frentes que quedaron **pusheados a `qa`** y uno cortado a
medias. Esto es lo que hay que saber para retomar sin releer nada.

---

## 1. Dashboard modular por módulos — F1 a F3 + circuito de trámites

**Diseño y WOs:** [`docs/dashboard/01-diseno-dashboard-modular.md`](../dashboard/01-diseno-dashboard-modular.md)
(es el documento vigente; reemplaza al pasamanos del 25).

`pages/Dashboard.tsx` (1.314 líneas) se descompuso en `pages/Dashboard/`:
orquestador + `registry.tsx` (la condición de cada sección vive UNA vez) +
hooks por dominio con `enabled` + secciones bobas. Lo que quedó andando:

- **Módulo apagado = sección invisible Y sin fetch.** San Pedro Norte dejó de
  disparar los diez requests de reclamos que no tiene.
- **Cinta de conteos** en vez de las dos filas de KpiCardV2: los contadores
  crudos en una línea, y **la regla del cero** — un cero no se enuncia nunca
  (16 ramas auditadas en los armadores; se acabó el "entraron 0 gestiones").
- **Perfil financiero** (SPN): hero de 5 KPIs con veredicto, colas de pago,
  tendencia de gastos. Cuando finanzas **convive** con otros dominios se
  muestra en variante resumen (3 preguntas), no completa. El bloque se llama
  **Tesorería**, y **contaduría está silenciada** en el tablero
  (`SILENCIADOS_EN_DASHBOARD` en `pages/Dashboard/index.tsx`).
- **Orden dinámico** por actividad (`GET /api/dashboard/actividad`): el dominio
  con más movimiento abre la pantalla, con un factor de 3× para no alterar el
  orden canónico por diferencias chicas. **Voz del Vecino cierra siempre**
  (flag `alFondo`).
- **Circuito de trámites** (`GET /api/dashboard/tramites-circuito`): dónde se
  traban, presentismo de turnos, qué tipo tarda más. Criterio fino: un turno
  vencido sin marcar es `sin_marcar`, **no** ausente.
- **Tendencia elástica**: los períodos vacíos de los extremos se recortan y,
  con menos de dos meses de datos, cambia de escala a días terminando en hoy.
  Murió el "Junio · 0 entraron".

**Lo que falta:** verificación VISUAL en QA (Merlo vs SPN, con capturas). El
E2E no cubre el dashboard. Y quedan dos ceros preexistentes en modo meses
("Resueltos 0", "Tasa 0%") que el dueño todavía no decidió si se omiten.

---

## 2. Semilla de demos — geografía real y vida propia

**Cómo funciona ahora** (`backend/services/geo_ciudad.py`): elegís la ciudad y
se dispara todo — polígono real desde `municipios_catalogo` (5.122 municipios
de 6 países, ya estaba en la base) + **una** consulta a Overpass cacheada que
trae localidades, barrios y calles reales. Los reclamos nacen con coordenada
**dentro del polígono** (ray casting, nunca el bounding box), con su zona y su
barrio. Determinístico: la misma ciudad sale idéntica siempre.

**El fallback "Centro/Norte/Sur" se borró del código.** Sin datos reales el
municipio queda sin zonas y el log dice por qué. El criterio: un nombre
inventado se toma por bueno, un muni sin zonas se nota y se corrige.

**Historia**: las solicitudes ya no nacen y mueren en el mismo segundo
(duración por tipo: habilitación 12-20 días, licencias 1-3, libre deuda en el
día), los turnos pasados tienen resultado (8 cumplidos / 2 ausentes / 1
cancelado por ciclo) y la mitad de los reclamos cerrados trae calificación.

**Pantalla Semilla** (Super Admin → Semilla): la bitácora de cada demo creada,
con los 21 pasos, sus tiempos, los nombres reales que encontró y —lo
importante— **en qué paso reventó** si falló. Tabla propia `demo_seed_logs`,
que sobrevive al rollback del alta.

### Lo que quedó CORTADO (retomar acá)

El WO de **50 reclamos / 50 trámites / 50 pagos repartidos en 3 meses**, con
**3 vecinos** (hoy hay uno solo que crea, gestiona y cierra todo) y
**trazabilidad por actor** (que el historial registre quién hizo cada
transición: el vecino crea, el supervisor asigna, el operario ejecuta). El
agente se cortó cuando terminó el proceso anterior; **no llegó a tocar
código**. El pedido completo, con la mezcla de circuitos que pidió el dueño
(disputas, cierres a medias, cuadrillas que van y que no), está en el
historial de esta sesión y resumido acá.

**Ojo al retomar:** los ids de municipio no se tocan, pero verificar que
`PUNTOS_GEO` alcance para 50+50 sin apelotonar.

### Números de QA

- **Merlo** (`/merlo`): recreado con geografía real — 5 localidades del partido
  (Libertad, Mariano Acosta, Merlo, Pontevedra, San Antonio de Padua) y 40
  barrios reales. Demos **sin PIN**: entran con `demo123`.
- **San Pedro Norte** (`/san-pedro-norte`): 7.781 gastos, 244 pagos, 0 reclamos
  en 30 días. Es el caso del perfil financiero puro.
- **Asunción** (146): trámites se apagó y se volvió a prender (la fila se borró,
  vuelve a activo por semántica opt-out).

---

## 3. `/calls` — la app de llamados

Todo en [`docs/calls/`](../calls/): `01` cómo regenerarla, `02` qué le falta.

`munify-qa.netlify.app/calls`: 154 municipios de AR/PY/PE/UY con teléfono
clickeable, el intendente de cada uno (122 confianza alta, 30 media, 2 baja —
**ninguno inventado**), el speech por país, lo investigado de los 45 más
grandes (secretarías, digitalización, dato de color), dos vistas con switch
(Hoy / Trabajar) y un asistente de IA por Groq.

**Se regenera con un comando:** `python scripts/calls/build_calls.py`. El
`index.html` es SALIDA — lo visual va en `scripts/calls/plantilla.html`.

**La key de Groq no está en el repo** (la página es pública): vive en el
navegador del dueño o entra por `?k=...` una vez.

**Dato para la agenda: Paraguay y Perú votaron el 4 de octubre de 2026** — todo
ese padrón de intendentes cambia y hay que repasarlo. Hoy 8 intendencias
paraguayas y 3 alcaldías peruanas están en manos de interinos.

---

## 4. Mapas: se fue CARTO

**El síntoma:** los mapas mostraban **"API KEY REQUIRED"** estampado sobre el
tile. CARTO no devuelve error: devuelve el tile con la marca de agua. Estaba
en tres pantallas con la URL copiada.

**Lo que se probó y descartó:** el Canvas de Esri. Anda, pero su propia
documentación dice que los basemaps raster clásicos "podrían desactivarse sin
aviso" — y además en zoom alto muestra *"Map data not yet available"* en zonas
de Argentina. Era cambiar una trampa por otra.

**Lo que quedó:** OpenStreetMap, sin key, con el gris y el modo oscuro
resueltos por **filtro CSS sobre la capa de tiles**
(`frontend/src/styles/mapa-base.css`). El filtro toca sólo el fondo: el
heatmap, los pines y los polígonos viven en otros panes de Leaflet. La URL
vive en `frontend/src/lib/basemaps.ts` y se cambia una vez.

**Nada de la lógica de mapas cambió** — coordenadas, áreas, waypoints,
marcadores y la API de react-leaflet quedaron intactos.

**De paso:** un golpe de rueda hacía **tres niveles** de zoom. El default de
Leaflet (`wheelPxPerZoomLevel: 60`) es de 2011 y los mouse de hoy mandan
deltas mucho mayores. Quedó en 180 en los 8 mapas de la app.

**Decisión abierta:** el dueño extraña el look del CARTO oscuro (es más lindo
porque está *dibujado* oscuro, no filtrado). Si lo quiere de vuelta: key gratis
en la consola de CARTO como variable de build, con OSM de respaldo si se agota
el cupo. La comparación visual con tiles reales quedó en un artefacto.

---

## 5. Otras cosas que se tocaron

- **Login unificado**: el layout "split" de Asunción pasó a ser el de todas las
  marcas (una línea de config, mismo componente). Entrando por `/merlo` la URL
  queda en **`/merlo/login`** y el hero muestra **el municipio en grande** con
  su color. El wordmark Munify perdió el bicolor verde.
- **Tinta sobre acento**: había botones azules con texto azul. La causa no eran
  los botones sino la FÓRMULA: `tintaSobre()` decidía con la luminancia rápida
  (sin corrección gamma), que clasifica un azul medio como "claro". Ahora
  decide por contraste WCAG real. Se barrieron 83 hardcodeos en 44 archivos y
  quedó un **guardián de ESLint** que impide que el patrón vuelva a entrar.
- **Generador de demos** (`/demo`): rediseñado con el sistema visual de la
  landing (Instrument Serif + Manrope, papel arena, tinta cálida, marino del
  logo). Sin tocar lógica.
- **Suite E2E**: quedó verde (58/58 casos, 9/9 logins) después de alinear el
  fixture de Merlo al login nuevo (los labels de los perfiles cambiaron y el
  PIN ya no existe).

---

## 6. Trampa operativa: los deploys de QA fallan seguido

Varios deploys de `qa` terminaron en **error de build en Netlify** aunque el
build local pasa completo (exit 0). El bundle es de 5,2 MB y el builder se
queda corto. **Síntoma engañoso:** la app sigue mostrando la versión anterior,
así que parece que el código está mal cuando en realidad no llegó a publicarse.

**Cómo verificarlo** (el site de QA es `d437d5af-ee87-474b-84b6-ff83a9394262`,
NO el de producción):

```bash
netlify api listSiteDeploys --data '{"site_id":"d437d5af-ee87-474b-84b6-ff83a9394262","per_page":5}'
netlify api createSiteBuild  --data '{"site_id":"d437d5af-ee87-474b-84b6-ff83a9394262"}'   # redisparar
```

Antes de dar por roto un cambio en QA: **mirar si el deploy quedó en `ready`**.

---

## Lo que yo haría primero al retomar

1. **Verificar visualmente el dashboard** en Merlo y SPN (es lo único de las
   tres fases que quedó sin ojo humano encima).
2. **Retomar el WO 50/50/50** con 3 vecinos y trazabilidad por actor.
3. Decidir lo del **CARTO con key** para el mapa oscuro.
