# Handoff — Dashboard v2: paridad con la referencia del diseñador

**Fecha:** 2026-07-31 · **Rama:** qa (working tree SIN pushear — push conjunto cuando el dueño apruebe lo visual)
**Referencias:** `design/handoff-v2/references/dashboard-claro.dc.html` y `dashboard-oscuro.dc.html`

## Qué se hizo (verificado con Playwright headless en localhost:5173/asuncion, 0 errores JS/HTTP)

### Banner (calco de la referencia, medido con computed styles)
- Foto de ciudad suave detrás de los veils: subida como `imagen_portada` del muni Asunción (146) en QA
  vía el endpoint propio `POST /municipios/146/imagen-portada` (Cloudinary). **La foto es la MISMA del
  mock del diseñador (Unsplash, ciudad genérica) — placeholder, intercambiable por una foto real de
  Asunción desde Configuración.**
- Causa raíz de por qué no salía: sesión superadmin deja `municipioActual` null; el Dashboard ahora
  resuelve el muni real (`muniResuelto`) y escucha `municipio-changed`.
- Fuente display **Sora** (H1 38px, números): `--pl-font-display` apuntaba al sans; ahora
  `var(--app-font-display, 'Sora', ...)` + link de Google Fonts (600/700) en `index.html`.
- Botón sólido: texto `--pl-accent-ink` (darken(acento,32)), sombra 0 2px 8px .18, hover blanco+tinte.
- Botón outline: fondo `--pl-hero-scrim` = darken(acento,45) al 50% (antes scrim negro genérico).
- Strip: `gap:1px`; ámbar del SLA = `--pl-amber-onbrand` #FFD66B (valor fijo de la referencia).
- H1 sin "Municipalidad de"; padding/tipos/veils ya calcaban (26px 28px 0, saturate(.85), etc.).

### Página (orden EXACTO de secciones de la referencia)
Banner → hero semántico → FILTRAR → KPIs Reclamos (KpiCardV2 con sparklines y deltas veredictados,
datos reales) → KPIs Trámites → Cola de trabajo → donut+mapa calor+top categorías → Analítica
(tabs **Barrios/Tiempos/Recurrentes/Categorías** — se quitó el tab Tendencias, duplicado) →
**Tendencia → Tiempo de resolución** (orden invertido al de antes, como la referencia).
Se ELIMINARON los charts sueltos "Reclamos por categoría" y "Reclamos por zona" (no están en la
referencia; los datos viven en el panel de categorías y Cobertura por zona).
**"La voz del vecino" NO está en la referencia** pero es feature real con datos → quedó al final,
patrón v2. Decisión pendiente del dueño: dejarla o sacarla.

### Shell
Badges reales del sidebar (Reclamos=total stats, Trámites, SLA en ámbar si en_riesgo>0, Órdenes
vigentes) vía `useNavBadges.ts` (cache por sesión, allSettled). Pie "Ayuda y soporte" inerte.

## Qué FALTA del loop de paridad
1. Captura en **tema claro** (solo se verificó oscuro; tokens son polimórficos, falta el ojo).
2. Sub del banner: referencia dice "...actualizado hace 4 minutos" — opcional con timestamp real del fetch.
3. Decisión del dueño sobre "La voz del vecino" (fuera de referencia).
4. Mejoras marcadas: eslint preexistente en `ThemeContext.tsx` (4 errores viejos, no del diff);
   badge Reclamos usa TOTAL histórico (en munis maduros da 99+; con `por_estado` se puede pasar a
   "abiertos" con 2 líneas); no hay endpoint barato de count de OTs (se lista hasta 200).

## Próximo (ORDEN DEL DUEÑO, aún no arrancado)
**Módulo RECLAMOS entero** sobre el patrón único abmv2/SemanticAbmPage: Reclamos (ya usa
SemanticAbmPage — revisar contra `references/reclamos-lista.dc.html`), Mapa, Tablero, Planificación
(`references/planificacion-semanal.dc.html`), SLA. Lo que no tiene referencia sigue el patrón.
EN PAUSA: el dueño quería hacer una corrección antes de seguir.

## Cómo retomar
pm2 `munify-front-dev` (Vite 5173, proxy /api→QA). Captura/medición: `frontend/_dash_compare.mjs`
(login /asuncion como Administrador, screenshots + computed styles del banner). Orden de secciones
de la referencia: `design/handoff-v2/_orden_secciones.txt`.
