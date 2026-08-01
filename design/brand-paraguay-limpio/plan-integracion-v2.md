# Plan de integración — Rediseño v2 (Claude Design) POLIMÓRFICO

> Estado: EN CURSO (2026-07-31). El dueño aprobó adoptar TODO el rediseño de
> Claude Design ("me parece mil veces mejor") para la PRÓXIMA VERSIÓN, con una
> condición arquitectural: **polimórfico y adaptable a todos los temas** —
> nada hardcodeado a Paraguay Limpio; los colores se derivan del theme activo.
> Se trabaja en QA, pieza por pieza. PROHIBIDO copy-paste del HTML de Design
> (inline styles): se reescribe con tokens + clases.

## Fuentes
- Proyecto Claude Design: `46976e44-b6dc-4395-b1fe-15aa2a8f9584`
  ("Rediseño de sidebar, banner y botones") — accesible via DesignSync.
- Referencia extraída: `design/brand-paraguay-limpio/redesign-sidebar-banner-oscuro.html`
  (dump del .dc.html oscuro; existe también la variante clara en el proyecto).
- Tokens de Design: `design_handoff_dashboard_municipal/tokens.css` (en el
  proyecto Design) — sistema `--pl-*`: marca, rampa de datos (5 tonos), superficies,
  texto (6 niveles), bordes, scrims de hero, tipografía (Inter + Sora display,
  escala 10.5→38px), espaciado base 4, radios (8/10/12/16/999), sombras 2
  niveles, motion, layout (sidebar 256/72, topbar 46, drawer 480).

## Arquitectura de integración (aprobada)
1. `frontend/src/styles/pl-tokens.css`: tokens ESTÁTICOS (espaciado, radios,
   sombras, tipografía, motion, layout) tal cual Design.
2. **Puente polimórfico** en ThemeContext: los tokens de COLOR (`--pl-green*`,
   superficies, textos, track, data-ramp, scrims) se COMPUTAN del theme activo
   (theme.primary/card/background/text...) con los helpers lighten/darken/mix.
   → El rediseño funciona en los 12+ presets y cualquier marca. El verde
   #00B37E de Design NO se hardcodea; el acento es theme.primary.
3. Tipografía: `--pl-font-display` → por ahora `var(--app-font-family)` (regla
   del dueño "misma letra siempre"); Sora queda como opción si él la pide.
4. Reescritura por CLASES en los componentes React reales, pieza por pieza,
   verificando cada una (mock/QA) antes de seguir.

## Piezas del rediseño (de la referencia leída)
- **Sidebar 256px** (72 colapsado): brand tile 36 (gradiente crema + isotipo),
  nombre display bicolor, muni abajo; **buscador ⌘K**; nav: item activo = pill
  (acento suave) + barra izq 3px; **categorías ACORDEÓN** (RECLAMOS/CAMPO/
  TRÁMITES/VECINO) con chevron; items 34px con **badges** (contador verde,
  SLA ámbar); botón colapso en borde.
- **Topbar** (~46px): breadcrumb con **pill de dependencia** (usuario de
  dependencia logueado la ve FIJA; admin ve switcher "Todas las dependencias"
  con dropdown agrupado por secretaría + buscador) + "/" + página. Derecha:
  theme, notificaciones (dot), settings, separador, **USUARIO (movido acá
  desde el sidebar)**: avatar + nombre + rol + chevron.
- **Hero banner**: gradiente del acento (o foto con 2 veils), eyebrow
  "MUNICIPALIDAD · VISTA CONSOLIDADA", H1 38 display, sub "actualizado hace N
  min", botones: blanco sólido "Conocé {marca}" + outline "Pulso del día"
  (punto pulsante). **Strip de stats** integrado abajo (grid 4 con separadores:
  RECLAMOS ABIERTOS / TRÁMITES ACTIVOS / RESOLUCIÓN PROMEDIO / EN RIESGO DE
  SLA en ámbar).
- **Card "frase semántica"** (borde izq 3px acento): etiqueta módulo + carrusel
  (puntos + flechas) + frase 20px display con spans coloreados + 2 acciones
  (pill acento suave + pill neutra). ← Al dueño le encanta ("le da otro vuelo").
- **Barra FILTRAR**: pills (dependencias/período/estados).
- **Secciones con título + regla**: icono acento + label + hairline + "Ver todos".
- **KPI cards**: surface, radius 12, eyebrow 10.5 caps + número Sora 34.

## Etapas
- [ ] E1: pl-tokens.css + puente polimórfico en ThemeContext
- [ ] E2: Sidebar (256, acordeones, buscador, badges) — mock → ok → push
- [ ] E3: Topbar con usuario + breadcrumb/pill dependencia (sacar user del sidebar)
- [ ] E4: Hero + strip stats + botones
- [ ] E5: Card frase semántica (con datos reales del dashboard)
- [ ] E6: Filtros pills + títulos de sección + KPIs
- [ ] E7: Barrido de themes (light/dark/todos los presets) + Munify intacto

## Reglas duras del dueño para esta integración
- Polimórfico: TODO tema/marca; jamás ifs por municipio.
- Cero HTML/CSS inline copiado; tokens + clases.
- **Colores: variables/derivados casi todos** — únicas constantes permitidas:
  los 3 matices semánticos (ámbar #F59E0B, rojo #E5484D, azul #3B82F6); sus
  variantes 700/100 se derivan del theme.
- Misma letra en toda la app (hoy Inter). Sora solo si él la aprueba.
- Es para la PRÓXIMA VERSIÓN; se arma en QA iterando.
- Mock/preview ANTES de push para cambios visuales.

## Definiciones del dueño (2026-07-31, sesión de review del rediseño)
- **La dependencia NO es un usuario** — es un ÁMBITO. Siempre loguea una
  persona (rol admin/supervisor de la dependencia X). La topbar separa:
  contexto (pill de dependencia, izq) vs identidad (persona: avatar+nombre+rol,
  der). Los "botones de dependencia" del login demo son un parche conceptual.
  Este layout UNIFICA admin y dependencias.
- **Topbar con propósito**: ámbito + breadcrumb | acciones globales + persona.
- **Buscador ⌘K del sidebar: dejarlo VISUAL pero NO implementarlo** todavía
  ("hay que pensarlo bien").
- **Hero semántico = VEREDICTO**: la frase colorea sus spans por juicio —
  bueno (acento / --pl-green-700), advertencia (--pl-amber-700), malo
  (--pl-red-700). El carrusel rota frases por módulo.
- El bloque switcher del sidebar actual (nombre de dependencia en 3-4
  renglones) MUERE en la v2.

## ABMPageSemantic — requisitos de consolidación (EN PAUSA hasta la 2da vuelta
## de Claude Design con "otro tipo de ABM"; después se consolida en UN componente)
- Hero semántico SIEMPRE; **KPIs opcionales** (sin KPIs → solo el resumen con veredicto).
- Header de grilla: **búsqueda** (flex-grow) + **agrupación por combos/pills** +
  **3 vistas** (toggle) + **botonera de acciones dockeada a la derecha**.
- Con datos de MONTOS → **totales en el header de cada agrupación**.
- **Control de fechas NO NEGOCIABLE**: siempre el period-navigator del framework
  (toggle Mes/Año + ‹ periodo › + "hasta" dinámico para armar rango — ver
  APP_GUIDE/components/ui/PeriodRangeNavigator / MonthRangeNavigator). Jamás
  datepickers sueltos en grillas.
- Todas las grillas de la app adoptan este layout al consolidarse.
- **KPIs DENTRO del hero** (prop `kpis` del SemanticHero, estilo strip del
  mockup: eyebrow caps + número display tabular + **sub-caption** tipo
  "50 pagos" / "71% · 10 pagos", veredicto opcional por KPI). Orden interno
  del hero: **frase → KPIs → acciones**. PROHIBIDAS las filas de KPI sueltas.
- **El hero va SIEMPRE PRIMERO** en la página (antes de título/búsqueda/
  filtros/fechas); lo demás abajo. Mismo control en todas las pantallas, nada
  de copy-paste de markup.
- **Breadcrumb/contexto: parte del LAYOUT** (la topbar lo arma por ruta +
  ámbito del usuario) — jamás metido a mano en cada pantalla.
- Ejemplar adaptado: Mapa (4 KPIs de MapaStats absorbidos por el hero vía
  `calcularKpisMapa` en lib/mapaUtils.ts; MapaStats queda solo con los paneles
  analíticos abajo).

## DIRECTIVA 100% ABMs (dueño, 2026-07-31 — reemplaza la "pausa" del ABM)
"Salvo los kanban/tableros y las agendas, todos los demás son variaciones de
ABMs: estandarizar VÍA PROPS respetando el nuevo layout (hero, KPIs, estilos,
posición de botones, TODO) en el 100% de las pantallas operacionales."
- Pantalla sin texto semántico dinámico posible → hero con **frase ESTÁTICA**
  que sirva de hint (mismo control, sin veredictos).
- Cambiar el **100% de los ABMs** aunque Paraguay Limpio no los use (Munify
  entero) y REVISAR todas las pantallas para que queden orgánicas.
- Después: **probar que todos los endpoints llenen la UX** (verificación
  integral pantalla por pantalla).
- Semilla de demo: sacar los gráficos con zonas GENÉRICAS → zonas reales del
  tenant; **agregar valoraciones del vecino** al dashboard (widget "La voz del
  vecino" del diseño nuevo: promedio grande + distribución 1-5★ + cards de
  reseñas, la negativa con "Requiere respuesta"/Reabrir en rojo) + calificaciones
  en la semilla con textos [DEMO] verosímiles.
- Van a llegar MÁS diseños de Claude Design; integrarlos con el mismo criterio
  (tokens polimórficos, un control, cero copy-paste).

### TEST INTEGRAL DE CIERRE (directiva del dueño, 2026-07-31 — correr al
### terminar refactor + semilla integral)
Verificar que TODAS las patas estén bien relacionadas, con la matriz de
variantes completa (no solo el camino feliz):
- Usuarios ↔ órdenes de trabajo (relaciones íntegras, sin huérfanos).
- Empleados: algunos CON cuadrilla y otros SIN (ambas variantes vivas).
- Reclamos asignados CON empleado y SIN empleado (asignación simple).
- Circuito de RECLAMOS en TODAS sus etapas × variantes: con OT / SIN OT
  (la OT no es obligatoria), con uso de inventario (activos tomados/liberados
  + consumibles descontados) / sin inventario.
- Circuito de TRÁMITES en todas sus etapas (solicitud → docs → verificación
  → turno → finalización) × variantes (con/sin turno, con/sin KYC según regla).
- Identidad ventanilla: anónimo / usuario a medias / verificado RENAPER.
Método: sobre la semilla integral en QA, workflow de verificación que recorra
API + DB chequeando integridad relacional y que cada variante EXISTA en los
datos; reportar matriz variante × estado con evidencia. Las variantes que
falten se agregan a las semillas (m_*) para que la matriz quede completa.

### Fases
- F1: inventario 100% pantallas operacionales (tipo, base, datos para hero,
  endpoints) + diseño del ABMPageSemantic consolidado via props.
- F2: migración fan-out de todos los ABMs al layout nuevo.
- F3: heros estáticos donde no haya datos (resto de pantallas ocultas).
- F4: "La voz del vecino" en Dashboard + semilla (calificaciones, zonas).
- F5: verificación endpoints→UX integral en QA.

## DECISIÓN DE ARQUITECTURA (dueño + agente, 2026-07-31): piezas sueltas + slot de cuerpo
- Las piezas del estándar (SemanticHero, ListToolbar, FilterBar, DataTable,
  SideModal) son componentes INDEPENDIENTES; `SemanticAbmPage` es solo el
  orquestador que las compone.
- Pantallas SIN grilla (Mostrador, Tablero, Planificación, Cuadrillas...):
  usan las mismas piezas — hero standalone + `SemanticAbmPage` con **slot de
  cuerpo** (`viewSlots`: la DataTable se reemplaza por steps/kanban/paneles
  manteniendo hero+toolbar+filtros). Jamás grilla deshabilitada ni estructura
  duplicada. (El slot viene del backlog de los pilotos.)
- La hoja de miga/breadcrumb va al **TopBar del shell** (contexto | breadcrumb
  | persona) — E3, no a cada pantalla.
- Mostrador demo: el DNI del dueño (30217134) debe validar en el padrón demo
  y avanzar al paso 2; botón "Cargar vecino a mano" roto → arreglar. Regla de
  negocio: RENAPER OBLIGATORIO para trámites; alta simple SIN RENAPER para
  reclamos. La pantalla del paso 2 ("Cargar la gestión") la curará Claude
  Design (pendiente).

## CHECKLIST DE PARIDAD DASHBOARD (loop hasta igualar la referencia)
Contra dashboard-claro/oscuro.dc.html + captura del dueño: sidebar acordeones+
badges+Ayuda y soporte, topbar pill dependencia+persona, **banner con FOTO del
muni SUPER SUAVE detrás** (desaturada bajo --pl-hero-veil + --pl-hero-fade) +
strip de stats, hero semántico con acciones, pills FILTRAR, filas KPI con
sparklines y subtextos, Cola de trabajo con items embebidos, Voz del vecino,
claro Y oscuro, responsive mobile intacto.

## ESTRATEGIA MOBILE (acordada 2026-07-31)
- Lado gestión/admin = UNA web responsive (mismo HTML): el mobile va EN
  PARALELO dentro de cada migración (mismo diff, breakpoints intactos).
- PWA del vecino (`pages/mobile/*` + MobileLayout) = árbol de UI APARTE:
  se migra AL FINAL como fase propia, con el kit ya depurado.

## Hints: estado global
- Las 11 pantallas de Reclamos+Campo+Trámites ya tienen SemanticHero (9aa061c).
- El RESTO de la app: hints OCULTOS globalmente (flag HINTS_OCULTOS en
  PageHint.tsx → return null). Se irán reemplazando por heros por módulo:
  vecino/mobile (11), tesorería (18), config/admin (8) — inventario completo
  con datos por pantalla en tasks/wr0o3gm8t.output (discovery 53 hints).

## Estado
- [x] E1: pl-tokens.css + colorUtils + puente polimórfico en ThemeContext (pusheado)
- [ ] E2: Sidebar → mock primero
- [ ] E3..E7: pendientes
