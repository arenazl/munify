# Fase 3 · Cohesión visual — una sola cara para el mismo universo

> **Para un agente que arranca en frío.** Contexto: [01-analisis-funcional.md](01-analisis-funcional.md)
> §4 (UI). **Leer `BUILD_GUIDE.md` §5-§7 antes de tocar nada.** La pantalla de referencia
> canónica es `pages/OrdenesTrabajo.tsx` (0 hex, enums, ABMPage+Sheet+ModernSelect) — todo
> converge a ese estándar. Referencias = commit `7aeb780`; verificar con grep.
> Sin decisiones de producto salvo T8 (gradientes del Tablero — preguntar).
> Reglas duras: cero hex inline (useTheme), nativos vetados, cero emojis, enums en lib/enums/.

## Objetivo

Matar las 3 causas concretas de la sensación "sin cohesión" de la demo: (1) el mismo estado
pintado con paletas distintas por pantalla, (2) los bloques grises del canvas de
Planificación, (3) SLA y Mapa construidas fuera de todos los patrones. Más la deuda de
pasteles hardcodeados, selects nativos y 3 UIs de detalle para el mismo reclamo.

## Tareas

### T1. `lib/enums/reclamo.ts` — Single Source of Truth de estados (el fix raíz)
- Crear `frontend/src/lib/enums/reclamo.ts` con `estadoColors` / `estadoLabels` /
  `estadoIcons` + fallback (patrón de `lib/enums/prioridadOT.ts` que ya está bien hecho).
  Paleta canónica de partida: la de `components/ui/ReclamoCard.tsx:8-20` (recibido `#0891b2`
  cyan, pospuesto `#f97316` naranja, etc.).
- Migrar las 7+ definiciones locales: `ReclamoCard.tsx:8` (re-exportar desde el enum para
  compat), `Tablero.tsx:22-63` (recibido azul), `Mapa.tsx:105-116` (recibido índigo),
  `ReclamoDetalle.tsx:88-98` (en_curso/finalizado/pospuesto divergentes),
  `Dashboard.tsx:576`, `DashboardVecino.tsx:171`, `ReclamosSimilares.tsx:30`,
  `MobileMisReclamos.tsx:21`, `GestionPagos.tsx:98`, `MiHistorial.tsx:29`.
- **Aceptación:** grep de `recibido.*#` en pages/components devuelve solo el enum.

### T2. Los "espacios grises" de Planificación
- Causa exacta: `getCargaColor(0)` devuelve `'transparent'` (`Planificacion.tsx:351`) y la
  celda (:691-695, min-h 100px) es hija de la fila con `backgroundColor: theme.border`
  (:640, técnica gap-px) → día sin tareas = bloque gris sólido.
- Fix: `getCargaColor(0)` devuelve `theme.card` **opaco** (el gris queda solo en los gaps de
  1px). Ojo: los tintes de carga (:352-354, `#22c55e20`...) son semitransparentes y también
  componen sobre el gris — pasarlos a composición sobre fondo opaco.
- Ya existe un placeholder "Sin tareas" por celda (:786-794) — se conserva; lo que falta es
  empty state a nivel PÁGINA (empleadosFiltrados vacío = solo header mudo).
- `ring-blue-500` hardcodeado (hoy/drag-over, :619, :691, :724, :837) → `theme.primary`.
- Semáforo de carga y paleta de empleados (:116-117, :352-354) → a `lib/enums/`.

### T3. SLA reescrita al patrón canónico
- Hoy (657 líneas): tabla a mano, modal centrado a mano con createPortal + estilos inline
  (`SLA.tsx:494-505`), 2 `<select>` nativos (:519, :540), `confirm()` nativo (:165), KPI
  cards con hex/gradientes (:238-321), colores de semáforo locales (:189-196).
- Reescribir como ABMPage + Sheet + ModernSelect + ConfirmModal (referencia:
  OrdenesTrabajo.tsx), semáforos en `lib/enums/sla.ts`, KPIs por el slot `kpis` de ABMPage.
- (La conexión del SLA a los estados reales del flujo es F5 — acá es solo la cara.)

### T4. Mapa al patrón
- `CATEGORY_CONFIG` (`Mapa.tsx:131-147`) hardcodea 15 colores matcheando keyword del nombre
  e ignora `categoria.color` de la DB; además `getCategoryKey` gobierna el FILTRO (:584) y
  los conteos (:626) → categorías nuevas del muni colapsan en un filtro "Otros"
  indistinguible (degradación funcional, no solo cosmética). Usar `categoria.color`/id de la
  API para chips, filtro y leyenda (fallback `theme.muted`).
- Nota del verificador: los PINES se colorean por ESTADO (:1028) — con T1 quedan canónicos.
- Drawer de detalle a mano con createPortal (:1135-1152) → componente `Sheet`.
- Clases fijas `hover:bg-gray-100 dark:hover:bg-gray-700` (:1079, :1164) → theme.

### T5. Pasteles light hardcodeados (rompen dark mode — pantallas del VECINO)
- `MisReclamos.tsx:367` (`#d1fae5`), `:379` (`#fee2e2`), `:402`; `ReclamoDetalle.tsx:88-98`
  (`#cffafe`, `#fef3c7`, `#d1fae5`, `#fee2e2`) → patrón `${color}15` sobre theme (como ya
  hace `Reclamos.tsx:3925`) o variables del theme.

### T6. Selects nativos remanentes
- `ABMSelect` de la propia librería ES un `<select>` nativo (`ABMPage.tsx:1329-1339`;
  también la paginación :2405) → reimplementar como wrapper de ModernSelect **manteniendo la
  API de props** (consumidores: `Empleados.tsx:785, 813, 822`, no tocarlos).
- Nativos directos: `Reclamos.tsx:2089` (zona), `:3775` (motivo pospuesto), `:3818` (motivo
  rechazo) → ModernSelect. (Los de SLA mueren con T3.)
- **Al mejorar ABMSelect (componente core estable): portar la versión agnóstica a
  `d:\Code\APP_GUIDE\components\`** (obligación del CLAUDE.md del repo).

### T7. Una sola vista de detalle del reclamo
- Hoy 3 UIs: Sheet de Reclamos (:4723, la completa), Sheet propio de MisReclamos (:1047), y
  página `ReclamoDetalle` (a la que navegan Tablero :399, Planificación :740, Dashboard
  :1266 y el propio Sheet :3921; la ruta `/reclamos/:id` viola BUILD_GUIDE §7.1).
- Converger: extraer el Sheet de detalle de `Reclamos.tsx` a `components/reclamos/`
  (des-monolitizar de paso: Reclamos.tsx tiene 4.765 líneas) y que Tablero/Planificación/
  Dashboard lo abran vía query param `?abrir={id}`. `ReclamoDetalle` queda SOLO para el
  vecino y deep-links públicos (backLink condicional por rol — hoy apunta fijo a
  `/gestion/reclamos` que es staff-only, `ReclamoDetalle.tsx:396`).
- El Sheet de MisReclamos (vecino) se mantiene, pero sumarle lo que le falta: fecha
  programada, fotos, y caja de comentario (el endpoint ya lo permite — hoy el vecino solo
  puede comentar desde ReclamoDetalle, al que casi no llega).

### T8. Tablero — resto de deuda **[preguntar por los gradientes]**
- Paleta → T1. Emoji 📋 (:472) → `<ClipboardList>` lucide (ídem `Reclamos.tsx:4202` ⚠️ →
  `<AlertTriangle>`).
- Lenguaje visual propio de gradientes (`column-header-*`/`card-gradient-*` en
  `styles/animations.css:323,487`) que ninguna otra pantalla usa: rebajar al patrón plano
  theme.card + acento del estado, O promoverlo a patrón oficial — decisión del user.
- Default de fecha "últimos 2 días" (:97-98) → 30 días con contador de ocultos; y
  `fetchReclamos` sin paginar (:111) con limit default 20 del backend → cargar por lotes
  como hace el Mapa.

### T9. Menores de consistencia
- Skeleton loading: hoy solo Reclamos lo usa; Tablero/Planificación/Mapa/detalle → Skeleton
  con la silueta de su layout (las ABMPage ya lo manejan solas).
- Taxonomías con colores locales → `lib/enums/`: tipos de ausencia
  (`GestionAusencias.tsx:32-37`), roles (`Empleados.tsx:14-16`).
- Fallback de color de categoría `'#3b82f6'` en `Inventario.tsx:217-218,317-318` →
  `theme.primary`.
- Barrido de hex inline del universo (~300 ocurrencias: Reclamos 80, ReclamoDetalle 51,
  Mapa 44, MisReclamos 30, SLA 22) — priorizar los que T1-T5 no cubran; no hace falta el
  100% en esta fase, sí en las pantallas que se toquen.

## No alcance

- No cambiar comportamiento/flujo (solo cara). No tocar el canvas funcionalmente (F4).
- No unificar los KPI de todas las pantallas (solo migrar SLA al slot canónico).

## Checklist de cierre

1. `cd frontend && npm run build` + `npx eslint src/ --ext .ts,.tsx` — obligatorio.
2. Probar en un theme claro Y uno oscuro (los pasteles eran invisibles en light).
3. Verificación visual: mismo reclamo en Reclamos→Tablero→Mapa→detalle conserva color de estado.
4. Portar a APP_GUIDE los componentes core mejorados (ABMSelect).
5. Commit + push origin master. Actualizar §7 del funcional.
