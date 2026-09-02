# Handoff — proyección mobile del ABM Semántico

> Escrito al cortar la sesión del 2026-08-16/17. **Hay trabajo SIN COMMITEAR en el
> working tree** (ver más abajo). El dueño sigue esto con otra gente.

## Lo primero que tenés que leer

1. `GUIA.md` (esta carpeta) — la norma. Tabla de conversión control por control,
   antipatrones, medidas y checklist. **Es la fuente de verdad.**
2. `PLAN.md` — el criterio y el orden de las fases.
3. `README.md` — la estructura de la pantalla y los 4 slots.

Las tres reglas que gobiernan todo, resumidas: **un control con dos renderers** (no
un componente nuevo, no un `if (isMobile)` en las pantallas) · **agnóstico y en el
catálogo** `APP_GUIDE/components/v2/abmv2/` · **piezas tontas** que reciben todo por
props. Y el corolario: **container queries, no media queries** — el ancho que decide
es el del CONTENEDOR, porque el ABM puede vivir embebido en un panel angosto de
escritorio.

## Estado real

| Fase | Estado | Dónde |
|---|---|---|
| 1 · Roles en el contrato | **hecha y commiteada** | `abmv2/types.ts` (`RolesSemanticos`), `Reclamos.tsx` (`ROLES_RECLAMO`) |
| 2 · Lista → fichas de 4 slots | **hecha y commiteada** | `abmv2/FichaRegistro.tsx` + `[FICHAS]` en `abmv2.css` + cableado en `DataTable.tsx` |
| 3 · Zona de control de una línea | **a medias, SIN COMMITEAR** | ver abajo |
| 4 · Panel de filtros (bottom sheet) | pendiente | — |
| 5 · Gestos (swipe, long-press) | pendiente | — |
| 6 · Detalle a pantalla completa | pendiente | — |
| Trámites con su mapa de roles | pendiente | `GestionTramites.tsx` |

Commiteado hasta `c986258` y pusheado a `qa`.

## Lo que quedó en el working tree, sin commitear

Todo esto **compila** (`npx tsc -b` limpio) pero **NO fue probado en el navegador**.
Esa es la parte que falta: verificar a 360px y a 390px antes de dar nada por hecho.

- **`abmv2/ListToolbar.tsx`** — en angosto (`useAnchoAngosto`) la fila queda en
  buscador + acción primaria + filtros. Se ocultan el selector de vistas, los pasos
  de flujo y la acción secundaria. El selector de vistas **se elimina, no se achica**:
  a este ancho los tres modos se ven igual porque la lista siempre se dibuja como
  fichas.
- **`abmv2/FilterBar.tsx`** — en angosto los selects y los estados salen del flujo y
  pasan a un panel que abre un botón "Filtros" con badge de filtros activos (el
  estado cuenta como uno). Los estados van como **lista vertical con conteo**, no
  como píldoras en fila: así escala a 8 o a 40 sin tocar el layout.
  - Ojo: el cuerpo se extrajo a `FilterBarCuerpo` a propósito. Los hooks del panel
    estaban quedando detrás del `return null` de "barra sin nada que filtrar", y un
    hook después de un return condicional rompe el orden de hooks (React #310).
- **`styles/abmv2.css`** — sección `[FILTROS EN ANGOSTO]`.

## Lo que falta de la fase 3-4, concretamente

El panel de filtros que quedó es **provisorio**: un bloque que se despliega en la
misma tarjeta. La guía pide un **bottom sheet con gesto real y dos anclajes** (medio
y completo), con:

1. Barra de **distribución de estados** con los colores semánticos, y debajo la lista
   con conteo **y porcentaje**.
2. Orden en chips.
3. Una fila por filtro (categoría, dependencia, canal, fecha, ubicación), cada una
   abriendo su **sub-sheet**.
4. Pie con la cantidad de resultados que va a dejar: "Ver 418 reclamos".

Además, sin hacer: publicar la altura de la zona de control como `--ctl-h` medido y
derivar de ahí el `top` de los sticky (hoy `.av2-fichas-dia` ya lee `--av2-ctl-h`,
pero **nadie la define todavía** — hay que medirla y publicarla).

## Trampas que ya me comí, para que no las repitas

- **La ref del medidor tiene que estar en el contenedor que existe en LOS DOS
  renderers.** Si sólo cuelga del renderer de fichas, el observer nunca se monta: las
  fichas no se dibujan hasta que la medición diga "angosto", y la medición no existe
  hasta que se monten. Huevo y gallina.
- **Las pantallas tenían su propio corte por ancho.** Reclamos hacía `esAngosto ?
  <FilaLista/> : …` y nunca llegaba al control, así que el renderer del kit no se
  usaba jamás. Ese parche se sacó de Reclamos; **revisá si otras pantallas tienen el
  mismo patrón** antes de dar por hecho que el kit manda.
- **`overflow-x: hidden` en `html/body/#root` mata el scroll táctil en iOS**: el spec
  obliga a que el otro eje pase a `auto`, y quedan contenedores de scroll anidados que
  se comen el gesto. Va `overflow-x: clip`. (Ya arreglado; no lo revivas.)
- **Un `fixed inset-0` con `pointer-events` por defecto se queda con todos los
  gestos.** El aviso de notificaciones dejó la app entera sin scroll por eso.

## Cierre de cada fase (no negociable)

1. Portar la pieza agnóstica a `APP_GUIDE/components/v2/abmv2/` **en el mismo cambio**
   (LEY 0: la app consume del catálogo). Ya están ahí `FichaRegistro.tsx`, los roles en
   `types.ts`, el cableado de `DataTable.tsx` y la sección `[FICHAS]` del CSS — pero
   **lo del working tree todavía no**.
2. Probar a **360px** (no sólo 390) y con la tipografía del sistema al **130%**.
3. Pasar el checklist de la sección 08 de `GUIA.md`.

## Excepción vigente

El panel del botón central **"Más" NO se rehace**: el panel dinámico que ya tiene la
app —jerarquía por urgencia, piezas de distintos tamaños— se conserva por decisión del
dueño. Sólo se puede adaptar su CSS. Ver "EXCEPCIÓN al handoff" en `GUIA.md`.

## Puerta cerrada al ABM viejo

`eslint.config.js` tiene `no-restricted-imports` sobre `components/ui/ABMPage`, con las
28 pantallas legacy exceptuadas **por archivo**. Esa lista puede achicarse al migrar,
**nunca crecer**. Si una pantalla nueva lo importa, `npm run lint` falla.
