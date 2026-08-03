# Spec técnico — Rediseño ESTÉTICO del Dashboard (Munify / Paraguay Limpio)

> Para Claude Design. Objetivo: rediseñar la estética del dashboard **sin tocar
> datos, endpoints, props ni estructura de componentes**. Este doc describe el
> contrato técnico que el rediseño DEBE respetar para poder integrarse tal cual.

## 1. Stack y archivos

| Cosa | Valor |
|---|---|
| Framework | React 18 + TypeScript + Vite |
| Estilos | Tailwind CSS + estilos inline SOLO para valores del theme (runtime) |
| Charts | **recharts** (BarChart, PieChart, LineChart, ResponsiveContainer) |
| Iconos | **lucide-react** (PROHIBIDO emojis Unicode; solo SVG) |
| Mapa | react-leaflet + leaflet.heat (`HeatmapWidget`) |
| Página principal | `frontend/src/pages/Dashboard.tsx` (~1800 líneas) |
| Shell/side­bar | `frontend/src/components/Layout.tsx` |
| Theme | `frontend/src/contexts/ThemeContext.tsx` + `frontend/src/config/themePresets.ts` |

## 2. Sistema de theme — REGLA DE ORO

**CERO colores hardcodeados.** Todo color sale del hook `useTheme()`:

```tsx
const { theme } = useTheme();
// theme es un objeto ThemeColors:
theme.background          // fondo de la página
theme.backgroundSecondary // fondo alternativo sutil
theme.contentBackground   // fondo del área de contenido
theme.card                // fondo de cards
theme.sidebar             // fondo del sidebar
theme.sidebarText         // texto principal del sidebar
theme.sidebarTextSecondary
theme.text                // texto principal
theme.textSecondary       // texto secundario
theme.primary             // ACENTO (azul Munify / verde #1b7a3d Paraguay Limpio)
theme.primaryHover
theme.primaryText         // texto sobre primary (blanco o negro según contraste)
theme.border
theme.cardAccentBg        // opcional: lavado sutil del acento en cards (solo temas light)
```

CSS variables espejo (seteadas por ThemeContext en `:root`, usables en CSS puro):
`--bg-primary`, `--bg-secondary`, `--text-primary`, `--text-secondary`,
`--border-color`, `--color-primary`, `--color-primary-hover`, `--bg-card`,
`--bg-sidebar`, `--app-font-family`. Marca white-label agrega `--munify-primary`
y `--munify-hover` (= color de marca).

**El rediseño debe verse bien en TODOS los presets**: 12+ temas activos
(light: niebla/marfil/perla/papel + verde claro; dark: carbon-vsc/grafito/onix/
tinta + verde oscuro; azules: indigo/cobalto/acero). Default: `carbon-vsc`
(dark VS Code). Paraguay Limpio fija el par `onix-verde` / `nieve-verde`
(acento #1b7a3d). NO diseñar para un solo fondo.

Semánticos permitidos (además del acento): éxito `#22c55e`-familia, warning
ámbar, danger rojo — siempre con criterio y ya usados en KPIs/estados.

## 3. Tipografía

- Una sola familia para TODA la app, elegible por config: CSS var
  `--app-font-family` (default **Inter**). No introducir fuentes nuevas por
  sección. Pesos usados: 400/600/700/800.
- Números tabulares en KPIs cuando alinean en columna.

## 4. Estructura del Dashboard (orden real — NO cambiar jerarquía de datos)

1. **Tutorial card** (dismissible, 6 pasos) — fondo card, acento primary.
2. **Banner hero**: imagen de portada del muni (`municipioActual.imagen_portada`)
   con overlay del color del theme, `minHeight 240px`, `rounded-2xl`. Overlay
   de título: "Municipalidad de {nombre}" + bajada + fila de stats
   (N reclamos · N trámites · Nd promedio · muni). Botones flotantes
   sobresalidos arriba-izq (`top:11, left:-5`): "Conocé {marca}" y
   "Pulso del día" (pills con borde/gradiente, clases `.cm-btn` / `.live-btn`).
   En mobile (<lg) estos botones se OCULTAN (viven en el menú "Más").
3. **Filtro por dependencia** (ModernSelect — control custom, jamás `<select>` nativo).
4. **KPIs Reclamos** (grid 2-4 cols): Total / Nuevos hoy / Esta semana /
   Tiempo promedio. **KpiCard COMPACTA: ~80px de alto, número mediano — es
   estándar del producto, no agrandar.** Deltas con signo y color semántico.
5. **KPIs Trámites** (ídem, con sus totales).
6. **Widgets operativos** (4 cards): Urgentes (borde rojo, lista de reclamos) /
   Sin Asignar (ámbar) / Para Hoy (verde, programados) / Resueltos (verde,
   comparativo semanal). Cada una: contador grande + mini-lista.
7. **Analytics con tabs** (píldoras): Barrios | Tiempos | Recurrentes |
   Tendencias | Categorías → barras horizontales por barrio/zona, tiempos de
   resolución, recurrentes, tendencias (LineChart), categorías.
8. **Cobertura por Zona**: barras de progreso por zona (nombre + % resueltos +
   total), footer "Zonas críticas" / "Resolución global". Zonas REALES
   (Microcentro, Chacarita, Tacumbú, Villa Morra, Santísima Trinidad, Zeballos Cué).
9. **Charts recharts**: "Reclamos por Categoría" (BarChart horizontal, verde),
   "Reclamos por Zona" (BarChart), "Por Estado" (pie/donut con colores de
   estado del enum central `lib/enums/`), evolución temporal (LineChart).
10. **HeatmapWidget**: mapa leaflet con capa de calor (sin markers en dashboard).

Datos: TODO llega ya cocinado por props/fetch de `/api/dashboard/*` y
`/api/analytics/*`. El rediseño consume los MISMOS objetos.

## 5. Convenciones visuales vigentes

- Cards: `rounded-2xl p-6` + `backgroundColor: theme.card` (+ `backdrop-blur-sm`).
- Bordes: `1px solid theme.border`; hover: elevar con sombra suave, no cambiar color de fondo.
- Botón primario: fondo `theme.primary`, texto `theme.primaryText`.
- Estados de reclamo: colores/labels desde `frontend/src/lib/enums/` (single
  source of truth) — NO redefinir localmente.
- Sidebar: 13rem expandido / 4rem colapsado; columna de contenido a 28px;
  logo de marca 40px; ítems 1 palabra.
- Mobile: bottom-bar con FAB central "Más"; el dashboard apila en 1 columna;
  respetar safe-area iOS; sin scroll horizontal.
- Prohibido: `<select>`/`<input date>` nativos, `window.confirm`, emojis,
  hex inline fuera de los semánticos ya existentes.

## 6. Entregable esperado del rediseño

- Mock HTML/CSS (o JSX) **token-based**: colores referenciando las CSS vars /
  tokens del §2 (nunca hex fijos), tipografía `var(--app-font-family)`.
- Misma jerarquía de secciones del §4 (se puede reordenar DENTRO de una
  sección, cambiar spacing, radios, sombras, composición de los charts —
  manteniendo tipo de chart y datos).
- Verificable en un preset dark Y uno light como mínimo.
- Cada propuesta numerada (Opción 1..N) para elegir por número.
