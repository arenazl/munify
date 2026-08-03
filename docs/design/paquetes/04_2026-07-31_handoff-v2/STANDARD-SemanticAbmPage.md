# Estándar `SemanticAbmPage` — páginas de ABM con hero semántico

> **Alcance — leer antes de implementar.** Los prototipos de referencia dicen "Gastos", pero **este es el estándar de TODOS los módulos de dinero: Gastos y Cobros** (pagos, tasas, cuotas, cajas, conciliación). Gastos es la implementación de referencia; Cobros usa exactamente el mismo layout, la misma grilla de columnas, el mismo `PeriodControl`, el mismo `SideModal` y los mismos tokens. **Lo único que cambia es el contenido**: el signo del importe y su color semántico, los nombres de estado, el circuito de autorización y las etiquetas de las acciones. No se diseña ni se maqueta una pantalla nueva para Cobros: se instancia esta con otra data.
>
> | | Gastos | Cobros |
> |---|---|---|
> | Entidad de la fila | pago / OP | recibo / cuota |
> | Contraparte | proveedor | vecino o contribuyente |
> | Estados | Registrado · Autorizado · Pagado · Conciliado | Emitido · Notificado · Cobrado · Conciliado |
> | Circuito | Compras → Presupuesto → Tesorería | Tasas → Mostrador → Tesorería |
> | CTA del detalle | "Marcar como pagado" | "Registrar cobro" |
> | Color del importe | neutro (`--pl-text`) | neutro; en mora `--pl-red-700` |

Patrón único para **todas** las pantallas de listado del producto (Reclamos, Trámites, Pagos, Órdenes, Contactos, Cajas…). Referencias vivas: `references/reclamos-lista.dc.html` (sin montos), `references/gastos-lista.dc.html` (con montos, subtotales y `PeriodControl`) y sus detalles `references/reclamo-detalle.dc.html` y `references/gasto-detalle.dc.html`.

## Anatomía (de arriba hacia abajo)

```
TopBar                 ← sticky, top: 0, z-index: 6, fondo --pl-bg a sangre. Es LO ÚNICO fijo.
ModuleHero             ← eyebrow + veredicto + stat strip + acciones
ListToolbar            ← H1 + total + buscador + vistas + acción secundaria + CTA primario
FilterBar              ← selects + PeriodControl + segmented de estados (+ resumen a la derecha)
DataTable              ← encabezado + grupos con subtotal + filas + pie con totales
```

Sin tarjetas de KPI sueltas arriba: **los números viven en el hero**.

## 1. ModuleHero

Superficie blanca, `border-left: 3px solid var(--pl-green)`, radio 12, padding `20px 22px`.

1. **Eyebrow** — `MÓDULO · PERÍODO` en Inter 11px/700, tracking .1em, uppercase, `--pl-text-muted`.
2. **Veredicto** — Sora 20px/600, `line-height: 1.4`, `text-wrap: pretty`. Una o dos oraciones que **interpretan** y sugieren: qué está pasando, qué conviene hacer, cuál es la consecuencia. Los números clave van coloreados por semántica (`good` / `warn` / `bad`); el resto en `--pl-text`. Prohibido enumerar lo que ya dice la stat strip.
3. **Stat strip** — bajo un hairline. Grid `repeat(auto-fit, minmax(148px, 1fr))` (160px si son importes). Cada celda: eyebrow + valor (Sora 700, 20-22px, `tnum`, `nowrap`) + subtexto con la lectura secundaria ("43% · 9 sin cuadrilla", "71% · 10 pagos"). Separadas por `border-left: 1px solid var(--pl-border)`; la primera sin borde. Solo la celda que exige acción se colorea.
4. **Acciones** — 2 o 3. La primera con superficie verde (`--pl-green-100` + borde `--pl-green-200`), el resto neutras. El label dice el resultado, no el objeto: "Ver los 4 que vencen hoy", "Asignar los 9 sin cuadrilla", "Conciliar caja".

```ts
interface SemanticAbmPageProps<Row> {
  hero: ModuleHeroProps;
  toolbar: ListToolbarProps;
  filters: FilterBarProps;
  table: DataTableProps<Row>;
}
```

## 2. ListToolbar

`H1` Sora 22px/700 + chip con el total (`--pl-track`, pill, `tnum`) + buscador (flex, `max-width: 380–420px`, alto 36) + a la derecha: segmented de vistas (Tarjetas / Tabla / Guiada), botón secundario del módulo (Orden, Proyección…) y **un solo CTA primario verde** ("Nuevo pago", "Nuevo reclamo"). El bloque derecho no encoge (`flex: 0 0 auto`); el buscador sí.

## 3. FilterBar

Fila blanca, radio 12, padding `10px 12px`, `flex-wrap: wrap`, gap 8.

- **Selects** de alto 32, radio 10, patrón `Etiqueta` (muted) + `Valor` (600) + chevron. Hover: borde `#9BDCC4`.
- **`PeriodControl`** (obligatorio en toda lista con fechas): `[Mes | Año]` segmentado + stepper `‹ 📅 Julio 2026 ›` + botón punteado **`→ Hasta`** que agrega un segundo stepper y una `×` para volver a período simple. El toggle cambia la granularidad y el formato de la etiqueta (`Julio 2026` ↔ `2026`).
- **Segmented de estados** con conteo (`Todos 49`, `Recibidos 21`…). Los estados en 0 van en `--pl-text-disabled` y no son clickeables. Nunca duplicar estos conteos en tarjetas.
- Opcional a la derecha (`margin-left: auto`): resumen del filtro aplicado — "50 movimientos · $ 43.048.905".

```ts
interface PeriodControlValue {
  unit: 'month' | 'year';
  from: string;          // ISO o etiqueta ya formateada
  to?: string;           // presente ⇒ el control muestra el segundo stepper
}
```

## 4. DataTable

Card blanca, radio 12, `overflow: clip` (no `hidden`: rompe el sticky de descendientes).

- **Columnas**: `minmax()` en todas — nunca px fijos junto a tracks flexibles. Orden canónico: identificación → entidad → metadatos → estado → **importe** → acciones. **El dinero siempre en la última columna de datos**, `text-align: right`, Sora 700, `tnum`, `nowrap`.
- **Encabezado**: eyebrow 10px/700 tracking .09em; alineación de cada celda igual a su columna (importes y acciones a la derecha). Rotular también `ACCIONES`.
- **Grupos** (`DateGroupRow`): fondo `--pl-surface-3`, insignia de fecha de 42×38 (día en Sora 700 15px sobre mes en 9px/700 uppercase, fondo `--pl-surface-2`, borde `--pl-border`, radio 9) + "N movimientos" + **subtotal** en la misma columna que el importe (eyebrow `SUBTOTAL` + valor Sora 700 13.5px).
- **Filas**: `padding: 11px 18px`, separador `1px rgba(13,20,18,.05)`, hover `--pl-surface-3`, cursor pointer (abre el drawer de detalle). Entidad = tile de icono 28-30px (fondo suave de la familia) + título 13px/600 + subtítulo con **punto de color + texto neutro** (nunca texto coloreado).
- **Chips**: tipo y estado como pill de 22-24px con punto; paleta de `StatusPill` (azul = recibido/completado, ámbar = en curso/pendiente, verde = al día/finalizado, gris = pospuesto/rechazado).
- **Acciones por fila**: dos botones de 28px — **Ver** (documento) y **Eliminar** (tacho, gris que pasa a `--pl-red-700` en hover). Trazo 1.8. Nada de color permanente en la fila.
- **Pie**: "Mostrando N de M" a la izquierda; a la derecha "Total del período" + gran total en Sora 700 15px (o "Cargar más" si no hay importes).

## 5. SideModal — el detalle de la fila

Toda fila abre el registro en un **drawer derecho**, nunca en modal centrado ni en página aparte (referencia: `references/reclamo-detalle.dc.html`).

**Geometría.** Ancho 480px (registros simples: un pago, un contacto) o 560px (registros con proceso: reclamo, trámite, orden). `height: 100vh` en el panel y `height: 100vh; overflow: hidden` en el backdrop (`--pl-scrim`), así el cuerpo scrollea y header y footer quedan fijos. Entra con slide-in 240ms `--pl-ease`; cierra con `Esc`, la `×` o click en el backdrop.

**Estructura fija:**

| Zona | Contenido | Notas |
|---|---|---|
| Header (fijo) | `#id` · creado · canal · vencimiento · título Sora 20px/700 · fila de metadatos (categoría con punto, chip de prioridad, ubicación o importe) | Sin duplicar chips que ya están en los metadatos |
| `StatusStepper` (fijo) | Los estados reales del registro en grid de N columnas: barra 4px + label + timestamp | Completos verde, actual ámbar con barra parcial **y el motivo del bloqueo**, futuros `--pl-track` |
| Cuerpo (scroll) | Secciones separadas por hairlines, cada una con label eyebrow | **Nunca** una tarjeta con borde de color por sección |
| Footer (fijo) | Campo obligatorio para justificar el cambio + CTA que **nombra el resultado** + acciones alternativas | Nunca un botón deshabilitado sin decir qué falta |

**Secciones del cuerpo, en este orden:** descripción y adjuntos → contraparte (vecino / contacto / proveedor, con enlace a su ficha) → `DepartmentTrail` (timeline de dependencias que tocaron el registro: quién, cuándo, responsable actual con punto verde y halo, acción "Derivar") → asignación (`CandidateList` con radios reales, match como número + barra fina y una línea de razones; solo el sugerido con superficie verde) → documentos vinculados (orden de trabajo, comprobante, OT/OP con su chip de estado y enlace) → prioridad → historial colapsado con el conteo.

**En Pagos** el mismo esqueleto cambia de contenido: stepper `Registrado → Autorizado → Pagado → Conciliado`; contraparte = proveedor con CUIT y forma de pago habitual; `DepartmentTrail` = circuito de autorización (Compras → Presupuesto → Tesorería); documentos = comprobante, OP y adjuntos; footer = "Autorizar y pasar a pagado" + "Devolver a Compras" + "Anular".

### SideModal de dinero (Gastos / Cobros)

Referencia: `references/gasto-detalle.dc.html`. Ancho 520px. Diferencias respecto del de reclamos:

- **El importe vive en el header**, no en una tarjeta: Sora 700 26px con `tnum`, y al lado moneda extranjera + cotización en 12.5px muted, más el chip de estado. Nunca repetir el concepto dentro de una caja debajo del título.
- **Resumen** = grid de 2 columnas de pares `label` (11px muted) / `valor` (13.5px/600): fecha, forma de pago, financiación, caja, dependencia, comprobante. Sin una tarjeta con borde por dato.
- **Cuotas**: una fila por cuota con número en tile, estado en versalitas, vencimiento e importe; solo la superficie verde para las pagadas. El conteo va como línea de texto ("1 pagada · 0 pendientes · 0 vencidas"), no como tres cifras grandes.
- **Circuito de autorización**: mismo `DepartmentTrail` que en reclamos, con las áreas del módulo.
- **Comprobantes**: chip por archivo (icono según tipo + nombre + peso) y un "Adjuntar" punteado.
- **Observaciones internas**: textarea con la aclaración de que no la ve la contraparte.
- **Footer**: primario = **la acción que falta según el stepper** ("Marcar como pagado" / "Registrar cobro"); luego las secundarias del módulo (Generar OP, Editar) y Eliminar reducido a icono. "Cerrar" nunca es un botón: para eso están la `×`, `Esc` y el backdrop.

## Reglas transversales

1. Un cero nunca va solo: siempre con su explicación.
2. Máximo un CTA primario por pantalla.
3. Todo importe con `tnum` y `nowrap`; los porcentajes acompañan al número, no lo reemplazan.
4. Nada de banners de tip permanentes: onboarding va como tooltip la primera vez.
5. Layout: `min-width: 0` en todo contenedor de texto; gráficos con `flex: 0 1 base` + `min-width` de piso; tarjetas de una fila igualan alto con pie `margin-top: auto`.
6. Todos los valores visuales salen de `tokens.css`.
