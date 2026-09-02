# Pasamanos · Dashboard modular por módulos (perfiles tesorería / contable)

> **Para la sesión nueva.** El circuito acordado con el dueño (2026-08-25):
> **Fable DISEÑA la arquitectura** partiendo de este doc (validarla, refinarla,
> bajarla a WOs) y **deriva la implementación a Opus**. Todo lo investigado ya
> está acá con archivo:línea — no re-relevar, el objetivo del pasamanos es no
> re-gastar esos tokens.

## 1. Objetivo (palabras del dueño)

Munify va a tener clientes que usan **solo tesorería** o **solo el módulo
contable** (hoy ya existe uno: San Pedro Norte). El Dashboard actual está
pensado para reclamos/trámites y a esos clientes les muestra un tablero 100%
ajeno (reclamos, trámites, mapa de calor — todo vacío o irrelevante).

Se quiere un dashboard **module-aware**: bloques condicionales según los
módulos activos del municipio, **pero bien hecho** — nada de `if tramites`
regados por el JSX. Reutilizar los mismos gráficos/KPIs (que deben ser
**componentes bobos**) con otros datos. Que el cliente vea información de lo
que SÍ tiene.

## 2. Radiografía del módulo (investigado 2026-08-25, branch `qa`)

**`frontend/src/pages/Dashboard.tsx` = monolito de 1.314 líneas.**

Fetches (todos de reclamos/trámites, entrelazados en efectos de la página):
- `Dashboard.tsx:463-465` — `getStats` + `getTramitesStats`
- `:480-483` — `getPorCategoria` + `getPorZona` + `getMetricasAccion`
- `:499-502` — `getTendencia(90)` + `getRecurrentes(90,2)` + similares
- `:515` — `analyticsApi.getHeatmap(90)` · `:527` — `getCobertura(30)`
- `:535` — `getTiempoResolucion(90)` · `:542` — `getMetricasDetalle`

Bloques renderizados:
- `:924` — `HeroBannerV2` (hero + strip de KPIs)
- `:945-967` — dos filas de `KpiCardV2` con `SectionTitleV2` (reclamos / trámites)
- `:991,1008,1028` — tres `TarjetaCola` (cola de trabajo: urgentes / sin asignar / para cerrar)
- `:1102` — `FocosRotativos` (mapa reproductor de focos) · `:1111` — `TendenciaMeses`
- `:1124+` — sección Analítica: cinco `KpiSemantico`

**Qué ya es BOBO (estándar del kit, el padre declara):** `KpiCardV2`,
`KpiSemantico`, `TarjetaCola`, `SemanticHero`/`HeroBannerV2`, `SectionTitleV2`.
**Qué es SEMI-bobo (calculan adentro sobre reclamos):** `TendenciaMeses`
(agrupa meses internamente — generalizar a "serie mensual por props") y
`FocosRotativos` (ya recibe `focos`/`puntos`; casi listo).

**Señal de módulos — ya existe y estrenada:**
- Semántica en `frontend/src/lib/enums/modulos.ts`: `optIn:false` = activo sin
  fila (se apaga con fila `activo=0`); `optIn:true` = oculto sin fila. Helper
  `moduloEfectivo()` en `:43`. OJO: `inventario` NO está en el catálogo del
  front (flag sólo-backend) — clave desconocida sin fila = oculto.
- `modulosApi.list()` (`lib/api.ts:2169`) devuelve las filas de
  `municipio_modulos`; `Layout.tsx:228` ya lo consume para el sidebar.
- **Patrón de gating recién estrenado en Configuración** (commit `cc797ae`):
  `MODULOS_DEL_GRUPO` en `pages/Configuracion/Configuracion.tsx` — registro
  declarativo grupo→módulos + filtro + fallback del tab activo. Copiar ese
  espíritu.

**Endpoints financieros que YA existen (el perfil financiero es contenido
nuevo sobre plomería existente):**
- Gastos: `backend/api/gastos.py` (list con filtros, `proyecciones/resumen`,
  `proyecciones/cobros`) — el front ya los consume en Proyección.
- Cajas y saldos: `backend/api/tesoreria_cajas.py`.
- Agenda / pagos programados: `backend/api/tesoreria_agenda.py`
  (`proximo_pago` indexado; cola vencidos/esta semana ya calculada en
  `pages/PagosProgramados.tsx`). Quincenal calendario recién agregado.
- Contaduría / órdenes de pago: `backend/api/ordenes_pago.py` (pendientes de
  autorización). Conciliación: `backend/api/tesoreria_conciliacion.py`.

**Banco de pruebas real en QA:**
- **Merlo** (muni 153, full módulos): `munify-qa.netlify.app/merlo`, PIN 1680.
- **San Pedro Norte** (muni 80, SOLO dashboard+sueldos+tesoreria activos):
  `/san-pedro-norte`, botón "Acceso Directo", PIN 1680. Es EL caso objetivo.

## 3. Arquitectura propuesta (punto de partida para el diseño de Fable)

**Registro declarativo de SECCIONES.** Cada sección del dashboard se vuelve un
componente autocontenido en `pages/Dashboard/secciones/` que:
1. declara `requiere: string[]` (módulos; semántica `moduloEfectivo`),
2. hace **su propio fetch** (hoy están entrelazados en la página — al extraer,
   un muni sin trámites deja de disparar los 10 requests),
3. compone las piezas BOBAS del kit (no inventa visual nuevo).

El `Dashboard.tsx` queda como **orquestador** (~50 líneas): resuelve módulos →
filtra secciones → renderiza la grilla. La condición vive UNA vez en la
declaración de cada sección. Los perfiles **emergen** (no se programan): el
cliente contable ve hero financiero + colas de pagos porque son las únicas
secciones cuyo `requiere` matchea.

Contenido del perfil financiero (F2):
- **Hero financiero** = `SemanticHero` estándar (5 KPIs + veredictos + frases,
  regla del dueño): gastado del mes, saldo de cajas, vencimientos de la
  quincena, OP por autorizar, conciliación pendiente.
- **Colas** = `TarjetaCola` × 3: pagos vencidos / esta semana / OP por autorizar.
- **Tendencia de gastos** = `TendenciaMeses` generalizada por props.
- Mapa de calor: sin equivalente financiero → la sección no existe y la grilla
  refluye (verificar los 3 layouts resultantes).

## 4. Lo que el diseño de Fable tiene que resolver (no está decidido)

- Contrato exacto de una "sección" (props, loading propio, error propio,
  layout hints para la grilla de 2 columnas).
- Generalización de `TendenciaMeses` (serie mensual por props) sin romper el
  uso actual.
- **Fallback**: muni con dashboard y nada más → bienvenida + accesos (es
  contenido/diseño; el dueño está abierto a pasarlo por el canvas de diseño).
- Orden/prioridad de secciones cuando conviven varios perfiles (muni full).
- Si el hero actual (reclamos-céntrico) se vuelve una sección más o queda
  fijo con strip adaptativo.

## 5. Fases y criterios de aceptación

- **F1 — Registry + gating de lo existente.** Criterio: para un muni full
  (Merlo) el dashboard queda **pixel-idéntico**; para SPN desaparecen las
  secciones ajenas y no se disparan sus fetches. Es el seguro de "sin romper".
- **F2 — Perfil financiero.** Criterio: SPN QA muestra hero financiero + colas
  + tendencia de gastos con SUS datos reales (tiene 244 pagos programados,
  cajas y gastos clonados de prod).
- **F3 — Perfil contable fino + fallback.**
- Gates de siempre: `tsc -p tsconfig.app.json`, eslint (baseline por archivo),
  `npm run build`. El E2E NO cubre el dashboard: la verificación es VISUAL por
  perfil (Merlo vs SPN en QA) — cierre verificado con capturas.

## 6. Reparto de modelos (acordado con el dueño)

- **Fable** (sesión nueva, este doc como entrada): valida/refina la
  arquitectura, cierra el contrato de sección y baja WOs concretos.
- **Opus**: implementa los WOs (F1 mecánica de extracción; F2 secciones
  nuevas). Patrón veedor/verificación: quien no escribió el código verifica
  contra QA con capturas (regla 21).

## 7. Contexto colateral que conviene saber

- La Configuración nueva ya respeta el destilde de módulos (`cc797ae`) — el
  dashboard es la otra mitad de esa misma promesa.
- El dashboard viejo de `master` NO se toca: lo reemplaza la promoción qa→prod.
- Reglas duras aplicables: kit abmv2 / piezas bobas (regla 6.bis), SemanticHero
  estándar 5 KPIs+veredictos, cero hex inline, sidebar una palabra, nada de
  emojis. Memoria del proyecto: `project_suite_e2e_circuitos`,
  `project_demo_merlo_qa` (accesos QA).
