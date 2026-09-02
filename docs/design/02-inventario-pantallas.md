# Inventario: canvas ↔ código

Las 21 pantallas del canvas cruzadas contra el código real.

**Cómo se relevó el estado (2026-08-02):** búsqueda en `frontend/src/pages/` de
las piezas del kit v2 (`SemanticHero`, `statusTabs`, clases `rs-*` de
`reclamo-sheet.css`). Eso prueba que la pantalla **usa el kit**; no prueba que
esté 100% alineada al `.dc`. Donde no se verificó, dice "por confirmar" — no se
asume.

## Pantallas

| `.dc` del canvas | Pantalla en el código | Estado |
|---|---|---|
| `Reclamos.dc.html` | `pages/Reclamos.tsx` | Implementado |
| `Reclamo Detalle.dc.html` | sheet de Reclamos | Implementado |
| `Tablero.dc.html` | `pages/Tablero.tsx` | Implementado |
| `Mostrador.dc.html` | `pages/Mostrador.tsx` | Implementado |
| `Mapa.dc.html` / `Mapa Oscuro.dc.html` | `pages/Mapa.tsx` | Implementado |
| `Planificacion.dc.html` | `pages/Planificacion.tsx` | Implementado |
| `Agenda.dc.html` | `pages/AgendaTurnos.tsx` | Implementado |
| `Gasto Detalle.dc.html` | `GastoDetalleSheet` | Implementado (commit `561f1c3`) |
| `Rediseño Sidebar y Banner.dc.html` (+ variante oscura) | `components/shell/SidebarV2.tsx`, `TopbarV2` | Implementado |
| `Sidebar Colapsada.dc.html` | `components/shell/SidebarV2.tsx` | Implementado (commit `999b6e1`) |
| `Liquidaciones.dc.html` | `pages/TesoreriaAgenda.tsx` | **Pendiente** — verificado sin piezas v2 |
| `Horarios.dc.html` | `pages/ConfiguracionAgenda.tsx` (el item "Horarios" del sidebar apunta a `/gestion/configuracion-agenda`) | Implementado — el archivo declara el `.dc` como origen en su cabecera |
| `Ordenes de Pago.dc.html` | `pages/OrdenesPago.tsx` | **Pendiente** — verificado sin piezas v2 |
| `Personal.dc.html` | `pages/Empleados.tsx` o `SueldosEmpleados.tsx` | Mapeo **por confirmar** |
| `Gastos.dc.html` | `pages/Tesoreria.tsx` (?) | Mapeo **por confirmar** |
| `Nuevo Item Form.dc.html` | form de alta (wizard/sheet) | Mapeo **por confirmar** |
| `Dashboard Animado.dc.html`, `dashboard-municipal-v3.dc.html` | `pages/Dashboard.tsx` | Usa kit v2; alineación al `.dc` **por confirmar** |
| `Migracion Multitenant.dc.html` | — | Sin relevar (apareció el 2026-08-02) |
| `Canvas.dc.html` | — | Pieza del canvas, no es pantalla de la app |

## Cómo NO mapear (error real, 2026-08-02)

La primera versión de esta tabla dio `Horarios.dc.html` → `pages/GestionHorarios.tsx`
**por el parecido del nombre**. Estaba mal en los dos sentidos:

- El item "Horarios" del sidebar apunta a `/gestion/configuracion-agenda`, o sea
  a `ConfiguracionAgenda.tsx` — que **ya tenía el diseño implementado**.
- `GestionHorarios.tsx` es **código huérfano**: ningún archivo lo importa, no
  tiene ruta ni entrada de sidebar. Su función (horario semanal del empleado) ya
  fue absorbida por el Sheet de `Empleados.tsx`.

Se estuvo a punto de migrar una pantalla inalcanzable contra un diseño que era
de otra, y de pisar función ya resuelta.

**Regla:** mapear por la **ruta del sidebar** (`config/navigation.ts` → `href` →
componente en el router), nunca por el nombre del archivo. Y antes de tocar una
pantalla, confirmar que esté referenciada en algún lado.

## Pantallas del sistema SIN diseño en el canvas

Relevadas contra la lista de arriba: **SLA**, **Órdenes de Trabajo**,
**Inventario**, **Cuadrillas**, y el resto del módulo de Tesorería
(Conciliación, Proyecciones, Proyectos, Contactos, Cajas).

Varias ya usan piezas del kit v2 replicando el patrón de otras pantallas, sin un
`.dc` propio que las especifique.

> Cuando toque una de estas: pedir el diseño al dueño antes de improvisar. Una
> captura de la pantalla actual **no es** la especificación — puede ser
> justamente lo que hay que cambiar.

## Material de apoyo en el canvas

Además de las pantallas, el proyecto tiene una carpeta
`design_handoff_dashboard_municipal/` con la definición del sistema:

- `STANDARD-ControlBar.md`, `STANDARD-SemanticAbmPage.md`,
  `STANDARD-Variaciones-por-props.md` — los estándares del kit.
- `components/KpiCard.tsx`, `components/SemanticHero.tsx` (+ sus `.module.css`).
- `tokens.css` — los tokens del sistema.

Conviene leerlos antes de discutir un patrón nuevo: puede que ya esté definido.
