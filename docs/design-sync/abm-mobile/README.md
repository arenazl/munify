# Handoff: proyección mobile del ABM Semántico

> Bajado de Claude Design (proyecto `munify`, carpeta `design_handoff_abm_mobile`) el
> 2026-08-16. Fuente: `Bonifai - ABM Semantico Mobile.html` + `Bonifai - Guia de
> proyeccion mobile.html`.
>
> **Los HTML son ESPECIFICACIÓN, no código.** Se implementan con las piezas del kit
> (`components/abmv2/`) y los tokens del proyecto — jamás se copia el markup ni los
> estilos inline. Regla del dueño.

## El principio, en una línea

Un solo control, **dos renderers**. El breakpoint no reordena columnas: elige renderer.
Escritorio dibuja una grilla de columnas; mobile dibuja una lista de fichas. Comparten
datos, filtros, estado y acciones; **no comparten una sola regla de layout**.

> Si aparece un `@media (max-width: …)` para corregir un detalle de la vista de
> escritorio, la implementación se fue por el camino equivocado.

## Lo que cambia en la configuración

Hoy la config del ABM declara **columnas**, que son un concepto de escritorio y no se
pueden proyectar. La unidad de declaración pasa a ser **roles**:

```
abm "reclamos"
  identity   → codigo
  taxonomy   → categoria        (color: categoria.color)
  headline   → titulo
  actor      → vecino + dependencia
  context    → direccion
  state      → estado           (map: recibido|en_curso|finalizado|rechazado|…)
  elapsed    → creado_en
  actions    → [asignar, resolver, posponer, rechazar]
  group_by   → fecha_ingreso

renderer desktop → columnas en el orden declarado
renderer mobile  → ficha de 4 slots
```

Agregar una entidad nueva es mapear esos roles: no se escribe UI mobile, ya existe.

## Los 4 slots de la ficha

Jerarquía fija que no negocia con los datos:

1. **Encabezado** — `identity` + `taxonomy`. Una línea, 10.5px, sin wrap; la taxonomía
   con su punto de color y elipsis.
2. **Titular** — `headline`. 14.5px/700, clamp a 2 líneas. Lo único que puede ocupar dos.
3. **Meta** — `actor` en una línea, `context` en otra. 11.5px, ambas con elipsis.
4. **Margen derecho** — `state` como píldora arriba, `elapsed` abajo. Ancho intrínseco,
   nunca se comprime.

A la izquierda, la ficha pastel de categoría (34px, radio 10, ícono). Todo campo que no
entre en esos 4 slots **no se muestra en la lista**: va al detalle.

## La pantalla

Una sola, con scroll continuo. Tres sectores:

1. **Banner semántico** — breadcrumb, título, card de pulso con la frase y sus números
   coloreados, KPIs en **grilla de 3 que envuelve** (nunca carrusel: un KPI cortado se lee
   como control roto), y máximo dos salidas accionables.
2. **Zona de control (sticky)** — UNA sola línea: buscador, botón "Nuevo", botón de
   filtros con badge. Nada más: ni chips, ni selects, ni toggles de vista. Su altura se
   mide y se publica como `--ctl-h`; los sticky de abajo derivan su `top` de ahí.
3. **Lista** — barra de día sticky, fichas de registro (no filas) sobre fondo `#F1F3F2`,
   scroll infinito con conteo al pie, vacío que dice qué filtro sacar.

Todo lo que en escritorio vive en la barra de filtros pasa a un **bottom sheet** con dos
anclajes, con la distribución de estados arriba y una fila por filtro.

## Reglas de CSS que no se negocian

- **Container queries, no media queries** — el ABM puede vivir embebido en un panel
  angosto de escritorio, y ahí también corresponde la proyección mobile.
- **No renderizar el renderer que no corresponde** — nada de `display:none` sobre una
  tabla de 50 filas.
- Flex/grid con `gap`; alturas por token (es lo que hace calculables los sticky);
  truncado explícito con `min-width: 0`; ninguna fila de control puede desbordar.
- z-index nombrado: contenido 1 · sticky de grupo 4 · control 5 · appbar 6 · tab bar 7 ·
  botón central 8 · scrim 9 · sheet 10 · detalle 11 · toast 12.
- Animar **sólo** `transform` y `opacity`.
- Táctil: sin `:hover` informativo, `:active` con escala .93–.98, hit targets de 44px,
  `env(safe-area-inset-bottom)` respetado.

## Verificación antes de cerrar una pantalla

Los dos que más se olvidan: probar a **360px** (no sólo 390) y con la tipografía del
sistema al **130%**.

## Estado de la implementación

Nada implementado todavía. El plan por fases vive en
`docs/design-sync/abm-mobile/PLAN.md`.
