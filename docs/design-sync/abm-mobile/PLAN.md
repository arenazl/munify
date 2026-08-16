# Plan de implementación — renderer mobile del ABM Semántico

> Ver `README.md` de esta carpeta para la especificación. Acá va sólo el **orden** y el
> estado. Cada fase se cierra probando a 360px y 390px.

## Por qué en este orden

El handoff pide un renderer, no pantallas. Pero el renderer se apoya en una config por
ROLES que hoy no existe: la config declara columnas. Así que primero se define el mapa de
roles (fase 1), después se dibuja la ficha que los consume (fase 2), y recién ahí tiene
sentido mover el resto de la pantalla (fases 3+). Al revés se pinta una pantalla y no
queda renderer.

## Fase 1 — Roles en la config del ABM

- Tipo `RolesSemanticos` en `components/abmv2/types.ts`: `identity`, `taxonomy`,
  `headline`, `actor`, `context`, `state`, `elapsed`, `actions`, `group_by`.
- Mapa de roles para **Reclamos** (la entidad de referencia) y **Trámites**.
- La vista de escritorio NO se toca: sigue leyendo sus columnas. Los roles conviven.

## Fase 2 — `FichaRegistro` (los 4 slots)

- Componente nuevo en el kit, alimentado sólo por los roles.
- Ficha pastel de categoría (34px), píldora de estado, `elapsed`, truncado por slot.
- Reemplaza a `FilaLista` en angosto para Reclamos y Trámites.

## Fase 3 — Zona de control de una línea

- Buscador + "Nuevo" + botón de filtros con badge. Todo lo demás sale de la fila.
- Publicar `--ctl-h` medido, y derivar de ahí el `top` de los sticky.

## Fase 4 — Panel de filtros (bottom sheet)

- Distribución de estados + lista con conteo y porcentaje; orden en chips; una fila por
  filtro con sub-sheet; pie con "Ver N …".

## Fase 5 — Gestos

- Swipe (umbral 70px, tope 190px, `touch-action: pan-y`), long-press a selección
  múltiple, cierre de la ficha abierta al scrollear.

## Fase 6 — Detalle y hub central

- Detalle a pantalla completa desde la derecha; botón central como hub de secciones.

## Estado

| Fase | Estado |
|---|---|
| 1 · Roles | pendiente |
| 2 · Ficha | pendiente |
| 3 · Control | pendiente |
| 4 · Filtros | pendiente |
| 5 · Gestos | pendiente |
| 6 · Detalle + hub | pendiente |

## Lo que YA se arregló del mobile (no es parte de este handoff)

Antes de que llegara este paquete se corrigieron bugs de shell que afectaban a todo:
viewport de PWA (zoom/arrastre/safe-area), scroll muerto por un velo a pantalla completa,
escala tipográfica mobile en los tokens, y la toolbar que se cortaba. Están en la rama
`qa`; el renderer se construye encima de eso.
