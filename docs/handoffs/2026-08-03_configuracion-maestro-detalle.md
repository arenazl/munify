# Handoff · Configuración maestro-detalle (Configuracion.dc.html)

**Fecha:** 2026-08-03
**Estado:** IMPLEMENTADO en local, sin pushear. 8 commits, del `adf5a5c` al `619ce9c`.
**Origen:** el dueño pasó `Configuracion.dc.html` del canvas
`46976e44-b6dc-4395-b1fe-15aa2a8f9584` con la instrucción: todo con el kit,
nada hecho a mano, sin cambiar el modelo de datos — sólo la UX.

---

## Qué se hizo

Configuración pasó de 6 pestañas con 15 tarjetas que sacaban al usuario a otra
ruta, a un **maestro-detalle de tres niveles**: grupos → ajustes → panel.

```
CONFIGURACIÓN · <MUNI>
"Cómo está armado el municipio"                  [Buscar un ajuste ⌘K]
──────────────────────────────────────────────────────────────────────
[ General · Personal · Atención al vecino · Catálogos · Inventario ·
  Tesorería · Integraciones · Super Admin ]
──────────────────────────────────────────────────────────────────────
 riel de ajustes   │  título + bajada                        [+ CTA]
 (label + total)   │  ↓ la PANTALLA REAL embebida
```

**33 ajustes muestran su pantalla adentro del panel.** No queda ninguno que
saque al usuario fuera de Configuración.

### Piezas nuevas del kit

| Pieza | Qué resuelve |
|---|---|
| `abmv2/SettingsShell.tsx` | La página de ajustes de tres niveles. Hermana de `SemanticAbmPage`. El panel llega por `children`. |
| `abmv2/useEmbed.ts` | Contexto + hook `useReportarTotal`. |
| `abmv2/EmbedContext.tsx` | El Provider (separado del hook por `react-refresh/only-export-components`). |
| `SemanticAbmPage` prop `embedded` | Instancia sin `PageHeader` (v2.4). |
| 44 clases `av2-set-*` en `abmv2.css` | Todo sobre tokens `--pl-*`, cero hex inline. |

---

## Decisiones tomadas y por qué

### 1. Los grupos del canvas ganan sobre los del handoff anterior

El handoff del 02/08 proponía 5 grupos por FK real (Municipio, Personal,
Operación, Trámites, Tesorería). El canvas dibuja otros 8: **General,
Personal, Atención al vecino, Catálogos, Inventario, Tesorería, Integraciones,
Super Admin**. Se implementaron los del canvas: es el diseño aprobado y el
dueño lo pasó después.

Se conservó del handoff el criterio de reparto: `Exportar Reclamos`,
`Municipios` y `Dashboards` salieron del cajón de Catálogos (no son catálogos)
y `categorias-reclamo`, `sla` y `poi-tipos` quedaron juntas por ser el hub.

### 2. No se reimplementó ningún ABM: se monta la pantalla que ya existe

La alternativa era escribir un `SemanticAbmPage` por catálogo dentro de
Configuración. Se descartó: sería duplicar 22 pantallas y sus endpoints, y
cada arreglo futuro habría que hacerlo dos veces. En su lugar el panel monta
la MISMA página de la ruta, con `lazy()` para no engordar el bundle.

**Consecuencia a favor:** un ajuste sin registrar cae a la ficha con acceso,
así que se pueden ir enchufando de a uno sin romper el resto.

### 3. El doble título se resolvió con contexto, no tocando 22 páginas

Una pantalla embebida dibujaba su propia cabecera encima del título que ya
había puesto el panel. Se podía arreglar pasando una prop a cada página; se
eligió un **contexto** que leen los cuatro componentes de cabecera que existen
(`ABMPage`, `SemanticAbmPage`, `StickyPageHeader`, `SettingsHeader`). Ninguna
de las 33 páginas consumidoras cambió una línea.

`StickyPageHeader` era el caso feo: es `position: fixed`, así que embebido
flotaba por encima del panel.

Se ocultó además el `backLink` en modo embebido: 13 pantallas traían un botón
"volver" que, estando adentro de Configuración, sacaba de Configuración.

### 4. Los contadores salen del dato que la pantalla ya tiene

Se descartó pedir un endpoint de conteos o disparar N requests al abrir
Configuración. La pantalla **publica** su total (`useReportarTotal`) y el riel
lo muestra; se llena a medida que se visita cada ajuste.

**Si una pantalla no puede decir su total, no se muestra número.** Se evaluó
contar las filas visibles del DOM y se descartó: con paginación daría "20"
donde hay 200, y un número engañoso es peor que ninguno.

### 5. Apariencia: sólo el dibujo, por pedido explícito

De 6 fondos a 4 (dos claros, dos oscuros) y los acentos dejan de ser
transversales — cada fondo declara su juego, porque un ámbar sobre marfil se
lava y un olivo sobre midnight se apaga. Se sumaron Blanco y Negro como
acentos propios, distintos de `neutro` (que se resuelve por el modo).

El dueño pidió **no** refactorizar todavía el sistema de paletas de 4 colores
que quedó sin uso. Queda pendiente.

**Agregado no pedido, porque rompía:** al cambiar de fondo, si el acento
activo no está en el juego nuevo se pasa al recomendado. Sin eso el selector
quedaba sin ninguno marcado y el panel pintado con un acento no elegible.

### 6. Los tabs de Tesorería se montan con `tabInicial`

Los 5 ajustes de Tesorería (conceptos, tipos de empleado, cajas, parajes,
proyectos) son tabs de UNA misma pantalla que leía el tab del `?tab=`.
Embebida no hay query param, así que `ConfiguracionTesoreria` recibe
`tabInicial` y además **no reescribe la URL** en ese modo (la ruta es la de
Configuración). Sin la prop se comporta igual que siempre.

---

## Dos bugs preexistentes encontrados y arreglados

`TarjetasCredito` y `TesoreriaContactos` tenían el guard de permisos **antes**
de sus `useEffect`/`useMemo`: un usuario sin permiso cortaba el render entre
medio y rompía el orden de hooks (React #310). Como ahora esas pantallas se
embeben, se movió el guard después de todos los hooks.

---

## Pendientes

1. **35 hooks condicionales en 8 pantallas** que no son parte de este trabajo
   (`npx eslint src/ --ext .ts,.tsx | grep rules-of-hooks`). Son React #310
   esperando pasar. No se tocaron para no mezclar scope.
2. **Refactor de la paleta vieja de 4 colores** (decisión 5).
3. **Migrar al kit v2 las pantallas que usan el `ABMPage` viejo.** Hoy
   funcionan embebidas, pero su cabecera y su layout no son los del canvas.
4. **Validación visual**: no se pudo hacer desde acá. El dueño la hace en
   `localhost:5175/asuncion`.

---

## Cómo retomar

- El registro de qué pantalla va en qué ajuste: `PANTALLA_DE_AJUSTE` y
  `TAB_TESORERIA` en `frontend/src/pages/Configuracion.tsx`.
- Los grupos y el reparto: `GRUPOS` y `GRUPO_DE_ITEM`, mismo archivo.
- Las pantallas propias de General (identidad, portada, apariencia,
  cartelería, avanzado, módulos): `AJUSTES_GENERAL`, mismo archivo.
- Para enchufar un ajuste nuevo: agregarlo a `PANTALLA_DE_AJUSTE`. Si no está,
  cae a la ficha con acceso — no se rompe nada.
