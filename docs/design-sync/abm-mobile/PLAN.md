# Plan de implementación — proyección mobile del ABM Semántico

> Ver `README.md` de esta carpeta para la especificación completa. Acá va el **criterio**,
> el **orden** y el estado.

## Las tres reglas que gobiernan todo

**1. Un control, dos renderers — NO un componente nuevo.**
El renderer mobile vive DENTRO de las piezas del kit que ya existen. No se crea un
`FichaMobile` suelto, no se agrega un `if (isMobile)` en las pantallas de Munify, y no se
duplica nada. Una pieza que hoy dibuja columnas pasa a saber dibujarse de dos maneras; el
ancho de **su contenedor** elige cuál.

**2. Agnóstico y en el catálogo.**
Todo esto es librería, no Munify. Se construye sin una sola referencia a reclamos,
trámites ni municipios, y se deja en `APP_GUIDE/components/v2/abmv2/` (LEY 0 de la
carpeta compartida). Munify lo CONSUME. La misma pieza tiene que servir para un CRM o un
ecommerce sin tocarle una línea: lo que cambia es el mapa de roles que le pasa el padre.

**3. Piezas tontas y sueltas.**
Cada parte —hero semántico, zona de control, lista/ficha, panel de filtros— recibe TODO
por props: contenido, colores, acciones. No sabe qué pasa arriba, no busca datos, no
conoce al resto. Una pantalla puede usar una sola pieza o todas. El padre declara; el
hijo dibuja.

**Corolario de las tres:** nada de `@media (max-width: …)`. **Container queries**, porque
el mismo ABM puede vivir embebido en un panel angosto de escritorio y ahí también
corresponde la proyección mobile. El dato es el ancho del contenedor, no el de la
ventana. (Sección 04 de la guía; el handoff lo marca como no negociable.)

## Por qué el orden es este

El renderer se apoya en una config por ROLES que hoy no existe: la config declara
columnas, y una columna es un concepto de escritorio — no se proyecta. Primero el mapa de
roles (fase 1), después la ficha que los consume (fase 2), y recién ahí el resto. Al
revés se pinta una pantalla linda y no queda renderer: Trámites y Cobros habría que
dibujarlos de nuevo, que es justo lo que el documento pide evitar.

## Fase 1 — Roles en el contrato del control

- `RolesSemanticos` en `abmv2/types.ts`: `identity`, `taxonomy`, `headline`, `actor`,
  `context`, `state`, `elapsed`, `actions`, `group_by`. Cada rol es un accessor + su
  formato, declarado por el padre.
- Los roles conviven con las columnas: el renderer de escritorio sigue leyendo columnas y
  no se toca.
- Mapa de roles para Reclamos y Trámites (en Munify, que es el consumidor).

## Fase 2 — La lista aprende a dibujarse como fichas

- `DataTable` (o la pieza de lista del kit) gana su segundo renderer: los 4 slots del
  handoff, alimentados SÓLO por los roles.
- Container query sobre el contenedor de la lista: angosto → fichas, ancho → columnas.
  No se renderiza el renderer que no corresponde (nada de `display:none` sobre 50 filas).

## Fase 3 — Zona de control de una línea

- Buscador + acción primaria + botón de filtros con badge. Todo lo demás sale de la fila
  y se va al panel.
- Altura medida y publicada como `--ctl-h`; los sticky de abajo derivan su `top` de ahí.

## Fase 4 — Panel de filtros (bottom sheet)

- Distribución de estados, orden en chips, una fila por filtro con su sub-sheet, pie con
  el conteo del resultado.

## Fase 5 — Gestos

- Swipe (umbral 70px, tope 190px, `touch-action: pan-y`), long-press → selección
  múltiple, cierre de la ficha abierta al scrollear.

## Fase 6 — Detalle (y NO el hub)

- Detalle a pantalla completa desde la derecha, con una acción primaria fija abajo.
- **El panel del botón central "Más" NO se rehace.** Decisión del dueño (2026-08-16): el
  panel dinámico que ya tiene la app —piezas de distintos tamaños, jerarquía por urgencia,
  reclamos y trámites según contexto— es superior a los tres niveles fijos del handoff, y
  se conserva. Sólo se puede adaptar su CSS para que hable el mismo idioma visual. Ver la
  sección "EXCEPCIÓN al handoff" en `GUIA.md`.

## Cierre de cada fase

Se porta la pieza agnóstica a `APP_GUIDE/components/v2/abmv2/` en el MISMO cambio, y se
prueba a **360px** y a 390px, con la tipografía del sistema al **130%**.

## Estado

| Fase | Estado |
|---|---|
| 1 · Roles en el contrato | pendiente |
| 2 · Lista → fichas | pendiente |
| 3 · Zona de control | pendiente |
| 4 · Panel de filtros | pendiente |
| 5 · Gestos | pendiente |
| 6 · Detalle + hub | pendiente |

## Lo que YA se arregló del mobile (no es parte de este handoff)

Bugs de shell que afectaban a toda la app y estaban tapando cualquier mejora de diseño:
viewport de PWA (zoom, arrastre, safe-area del notch), scroll muerto por un velo a
pantalla completa que capturaba todos los gestos, escala tipográfica mobile en los tokens
y la toolbar que se cortaba. Están en `qa`. El renderer se construye encima de eso.
