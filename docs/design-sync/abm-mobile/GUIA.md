# Guía normativa — proyectar el ABM Semántico a mobile

> Destilado de `Bonifai - Guia de proyeccion mobile.html` (Claude Design, proyecto
> `munify`, carpeta `design_handoff_abm_mobile`). Estado del original: **normativo**.
> Alcance: el control ABM completo, no una pantalla.
>
> Acá están las REGLAS y los VALORES. El prototipo (`Bonifai - ABM Semantico
> Mobile.html`) sirve para verificar comportamiento y medidas, pero **la fuente de
> verdad de las reglas es este documento**.

## 01 · El principio: proyectar, no adaptar

Un layout responsivo toma la estructura de escritorio y la va acomodando: apila
columnas, encoge tipografías, esconde cosas. Termina siendo la misma tabla, más angosta
y peor. **Eso es lo que pasa hoy.**

Una sola configuración semántica, **dos renderers**. El breakpoint no reordena nada:
**elige renderer**. Comparten datos, filtros, estado y acciones; **no comparten una sola
regla de layout**.

> **La regla que resume todo:** si te encontrás escribiendo `@media (max-width: …)` para
> corregir un detalle de la vista de escritorio, estás adaptando. Frená: ese detalle
> pertenece al renderer mobile, que se escribe una vez y no conoce columnas.

## 02 · La config declara ROLES, no columnas

Una columna es un concepto de escritorio y no se puede proyectar. Cada campo declara
**qué rol cumple en el registro**; el rol es agnóstico y cada renderer lo interpreta.

Roles suficientes para todo el sistema: `identity` (código o número), `taxonomy`
(categoría, con color), `headline` (la frase que identifica al registro), `actor` (quién,
y de qué dependencia), `context` (dónde, cuánto, o cuándo vence), `state` (estado con su
semántica de color), `elapsed` (tiempo relativo), `amount`, `action`.

```
abm "reclamos"
  identity   → codigo
  taxonomy   → categoria        (color: categoria.color)
  headline   → titulo
  actor      → vecino + dependencia
  context    → direccion
  state      → estado           (map: recibido|en_curso|finalizado|rechazado)
  elapsed    → creado_en
  actions    → [asignar, resolver, posponer, rechazar]
  group_by   → fecha_ingreso    // da ritmo al scroll en mobile

renderer desktop → columnas en el orden declarado
renderer mobile  → ficha de 4 slots
```

## 03 · El renderer mobile: cuatro slots, siempre los mismos

Jerarquía fija que **no negocia con los datos**.

| Slot | Qué recibe y cómo se comporta |
|---|---|
| 1 · Encabezado | `identity` + `taxonomy`. Una línea, 10.5px, sin wrap; la taxonomía se corta con elipsis y lleva su punto de color. |
| 2 · Titular | `headline`. Dos líneas máximo con clamp. Es lo único que puede ocupar dos líneas en toda la ficha. |
| 3 · Meta | `actor` en una línea, `context` en otra. Ambas con elipsis. **Nunca comparten línea con nada.** |
| 4 · Margen derecho | `state` como píldora arriba, `elapsed` abajo. Ancho intrínseco, **nunca se comprime**. |

Todo campo que no entre en esos cuatro slots **no se muestra en la lista**: va al detalle.
Si un ABM necesita un quinto dato en la lista, casi siempre la respuesta correcta es que
ese dato debía ser el `context`.

La ficha de categoría a la izquierda (34px, pastel, ícono) **no es decoración**: es el
único elemento que permite reconocer el tipo de registro sin leer. Se conserva siempre.

## 04 · Estrategia de CSS

### Un solo punto de decisión — container queries

La superficie se decide una vez, arriba del control, y desde ahí el renderer no vuelve a
preguntar. **Container queries sobre media queries**: el ABM puede vivir embebido en un
panel angosto de escritorio, y ahí también corresponde la proyección mobile. La ventana
no es el dato relevante; el ancho del contenedor sí.

```
.abm { container-type: inline-size }

@container (min-width: 720px) { .abm__grid  { display: block } }
@container (max-width: 719px) { .abm__cards { display: block } }
```

**No ocultes el renderer que no corresponde: no lo renderices.** Un `display:none` sobre
una tabla de 50 filas deja 50 filas de DOM, con sus listeners y su costo de layout,
invisibles y accesibles al lector de pantalla.

### Layout: flex y grid con gap

Toda agrupación de hermanos —fichas, chips, tiles, botones, íconos— se separa con `gap`.
Nada de `margin-bottom` en el hijo ni espaciado por whitespace del HTML. El gap sobrevive
a que se agregue, borre o reordene un elemento; el margen no.

### Alturas por token, no por contenido

Cada zona tiene una altura declarada y el contenido se acomoda a ella. Evita que la lista
salte cuando cambian los datos, y hace calculables los `top` de los sticky.

| Elemento | Valor |
|---|---|
| appbar | 50px |
| **zona de control sticky** | **86px** |
| chip | 30px |
| ficha de registro | 88–104px |
| tab bar | 72px |
| botón primario | 38px |
| hit target mínimo | 44px |
| radios | 10 / 13 / 20px |
| titular | 14.5px / 700 |
| meta | 11.5px / 400 |

Los sticky se apilan con `top` derivado de esos tokens, **nunca con números mágicos**: la
barra de día se pega en `top: 86px` porque arriba está la zona de control. Escribirlo como
`calc()` sobre variables para que un cambio de token no rompa la pila.

> **Contradicción a resolver:** el README del paquete dice "zona de control (una línea)
> 49px + padding = ~57px"; esta guía —que es la normativa— dice **86px**. Vale 86px, y se
> declara como token único del que derivan los `top`.

### El texto nunca decide la altura

Truncado explícito en cada slot: `-webkit-line-clamp: 2` en el titular, una línea con
`text-overflow: ellipsis` en meta y taxonomía. Toda caja que pueda encogerse necesita
`min-width: 0`, o el flex se niega a truncar y desborda. Lo que no debe comprimirse
—píldora de estado, ficha de categoría, checkbox— lleva `flex: 0 0 auto`.

### El desborde horizontal se declara, no se sufre

Un dato cortado al medio se lee como control roto, siempre. Pero la salida **no es
envolver**: envolver escala mal. Con 6 estados son dos filas; con 14 son cuatro, y la zona
de control se come media pantalla.

> **El criterio, en una pregunta:** ¿cuántos elementos puede llegar a tener esta fila
> cuando el sistema crezca? Si la respuesta es "depende de la configuración", **la fila no
> existe**: es una lista dentro de un panel.

- Cantidad fijada por el **diseño** y chica (los KPI: siempre 4 o 5) → grilla que envuelve.
- Cantidad fijada por la **configuración** y que puede crecer (estados, categorías,
  dependencias) → **dentro del panel de filtros**, donde una lista vertical scrollea sin
  límite y encima muestra conteo y porcentaje.

La zona de control queda en una sola línea y su altura **no depende de la configuración de
la entidad**. La pantalla nunca muestra un select.

Para el caso residual en que algo *tenga* que desbordar (barra de herramientas larga,
línea de tiempo), que se vea intencional:

```
.chips {
  display: flex; gap: 6px;
  overflow-x: auto;
  scroll-snap-type: x proximity;      // cada item cae en su lugar
  mask-image: linear-gradient(90deg,
      #000 0, #000 calc(100% - 26px), transparent 100%);
}
.chips > :last-child { margin-right: 12px }  // el último entra completo
```

La máscara **se saca cuando el scroll llegó al final**, así el degradado significa siempre
"hay más" y nunca miente. Regla dura: **ninguna fila de control puede dejar un elemento
cortado al medio. Si no entra, envuelve.**

### Superposición: capas nombradas

Escala de `z-index` por tokens, y sólo esos valores:

| Capa | z |
|---|---|
| contenido | 1 |
| sticky de grupo | 4 |
| zona de control | 5 |
| appbar | 6 |
| tab bar | 7 |
| FAB | 8 |
| scrim | 9 |
| sheet | 10 |
| detalle | 11 |
| toast | 12 |

Sin esa escala, cada corrección agrega un `9999`.

### Animar sólo `transform` y `opacity`

Sheet con `translateY`, detalle con `translateX`, la ficha se arrastra con `translateX`.
**Nunca** `height`, `top` ni `width`: en un celular de gama media se ve a los saltos.
Entrada `cubic-bezier(.32,.72,0,1)` 260–300ms; microinteracciones 160–200ms.

### Táctil, no de mouse

No existe `:hover` como portador de información; el feedback es `:active` con escala
0.94–0.98. Todo objeto tocable mide **44px reales**, aunque su dibujo sea más chico.
Respetar `env(safe-area-inset-bottom)` en tab bar, FAB y barras fijas. `touch-action:
pan-y` en la ficha que se arrastra, para no pelearle al scroll vertical.

## 05 · Tabla de conversión

Qué hace cada parte del control de escritorio cuando se proyecta. **Vale para todos los
ABMs.**

| Escritorio | → | Mobile |
|---|---|---|
| Los 3 sectores | → | Se conservan los tres, pero en **un solo scroll continuo**: banner semántico, zona de control sticky, lista. No son tres pantallas. |
| Título + descripción | → | Se mantienen enteros arriba. Al scrollear **se comprimen en la appbar** junto al pulso, para no perder el contexto. |
| Card de KPIs | → | La frase completa se conserva (es lo que dice qué hacer). Los números pasan a una **grilla de 3 columnas que envuelve**, no a un carrusel: un KPI cortado se lee como control roto. El tile de alerta ocupa el ancho que sobra. |
| Barra de filtros | → | **Una sola línea:** buscador, botón primario y botón de filtros con contador. Todo el resto —estado, orden, cada select— vive dentro del panel de filtros. **Cero controles apilados en el flujo.** |
| Selector de vista (3 modos) | → | **Se elimina.** En 390px los tres modos se ven igual; ofrecer la opción es ruido. Un solo renderer. |
| Tabs de estado | → | **Dentro del panel de filtros**, como primer grupo: barra de distribución con los colores semánticos y debajo la lista completa con conteo y porcentaje. Escala a 8 estados o a 40 sin tocar el layout, y ningún estado queda escondido. |
| Orden | → | Primer grupo dentro del sheet de filtros. |
| Encabezados de columna | → | **Desaparecen.** La posición en la ficha ya comunica el rol; una etiqueta sería redundante. |
| Filas de la tabla | → | **Fichas**: card blanca, borde 1px, radio 13, gap 8 sobre el fondo. **Sin divisorias de borde a borde.** |
| Agrupador por fecha | → | Se queda: chip de fecha sticky + conteo del grupo. Es lo que da ritmo al scroll. |
| Columna de acciones | → | **Swipe a la izquierda** revela 2 acciones. **Long-press** entra en selección múltiple con barra inferior de acciones masivas. |
| Botón "Nuevo" | → | Botón primario en la zona de control sticky, al lado del buscador: acompaña al filtro y siempre está a la vista. El botón central elevado de la tab bar queda reservado al **hub de secciones, no a crear**. (Sobre el contenido del hub, ver la excepción de abajo.) |
| Modal de detalle | → | Pantalla completa que entra **desde la derecha**, con una acción primaria fija abajo y el resto en menú. |
| Paginador | → | **Scroll infinito** con conteo al pie. Nada de números de página. |

## EXCEPCIÓN al handoff — el panel del botón central ("Más")

**Decisión del dueño, 2026-08-16. Es la única parte del handoff que NO se aplica.**

El handoff describe el panel del botón central como tres niveles fijos (card primaria de
creación, par de atajos 2-up, herramientas bajo un rótulo). **Ese diseño se descarta.**

Se mantiene el panel que la app ya tiene, porque su enfoque es superior: es un panel
**dinámico**, con piezas de distintos tamaños, que **jerarquiza por urgencia** — lo que
está más urgente se remarca y ocupa más— y ofrece reclamos y trámites según el contexto.
Un panel de tres niveles fijos no puede hacer eso: trata igual a lo que vence hoy y a lo
que no pasa nada.

Alcance de la excepción:
- **Se conserva:** el comportamiento, la jerarquía por urgencia y el criterio de qué
  mostrar. Es la filosofía de la app, no la del prototipo.
- **Se puede adaptar:** el CSS —superficie, tipografía, radios, movimiento— para que hable
  el mismo idioma visual que el resto de la proyección mobile.

**El resto del handoff se sigue tal cual**: el manejo de filtros, el hero semántico, la
grilla y la ficha de cada ítem quedan como los definió el diseñador.

## 06 · Lo que hace que se vea nuestro y no una tabla vieja

Cuatro decisiones, no un rediseño:

- **Fichas separadas, no filas pegadas.** El aire entre registros es lo que dice "esto es
  un objeto que puedo tocar". Divisorias corridas de borde a borde dicen "planilla".
- **El color viene de la taxonomía, no de la decoración.** Las pastillas pastel de
  categoría y los puntos de estado ya son nuestro lenguaje en escritorio; se conservan
  idénticos.
- **Una sola jerarquía tipográfica por ficha:** un peso fuerte (el titular) y dos grises.
  Si hay tres tamaños compitiendo, se lee como tabla.
- **Densidad honesta: 6 o 7 registros por pantalla.** Menos se siente vacío; más obliga a
  truncar y volvemos al problema.

## Antipatrones — si aparece alguno, está mal proyectado

- Tabla con scroll horizontal, o tabla con columnas escondidas por breakpoint.
- `font-size` por debajo de 11px, o zoom/escalado del layout de escritorio.
- Filas de control que crecen con la configuración: chips de estado, de categoría o de
  dependencia sueltos en la pantalla.
- Selects nativos apilados en el flujo de la pantalla.
- Modales centrados con botones Aceptar/Cancelar a la derecha.
- Menús contextuales, tooltips en hover, doble click, arrastre para reordenar columnas.
- Dos o más acciones flotantes, o un botón flotante que pisa la tab bar o su etiqueta.
- Texto cortado a media palabra porque dos datos comparten línea.
- Altura de la zona de control que cambia según los datos (no según la configuración).

## 07 · Dónde poner el esfuerzo de animación

El "efecto guau" no son transiciones por todas partes: son cuatro momentos donde el
movimiento **explica algo**.

- **Pulso vivo.** Cuando entra un registro nuevo, los números del banner hacen tween y la
  ficha aparece con un realce de 600–900ms. Es la diferencia entre una lista y un sistema
  que está trabajando.
- **Sheet con gesto real**, con dos anclajes (medio y completo) y arrastre que sigue al
  dedo. Un sheet que sólo aparece es un modal disfrazado.
- **Swipe con resistencia:** el desplazamiento se frena cerca del límite y hay vibración
  corta al cruzar el umbral. Eso enseña el gesto sin tutorial.
- **Transición compartida** del titular de la ficha al header del detalle, para que no se
  pierda de dónde vino.

## 08 · Checklist antes de dar por hecha una pantalla

**Estructura**
- [ ] Los 3 sectores son un solo scroll, no pantallas separadas.
- [ ] Existe un solo renderer de lista; no hay selector de vista.
- [ ] El renderer de escritorio **no está en el DOM**.
- [ ] Cada campo mostrado ocupa uno de los 4 slots.
- [ ] Hay una sola acción primaria, y vive en la zona de control.

**Contenido**
- [ ] Ningún texto cortado a media palabra.
- [ ] El titular clampa a 2 líneas; meta a 1.
- [ ] Los conteos usan separador de miles.
- [ ] El estado vacío explica qué filtro sacar.

**Comportamiento**
- [ ] Los chips filtran de verdad y muestran su conteo.
- [ ] La zona de control es **una sola línea** y su alto no depende de la entidad.
- [ ] El panel de filtros indica cuántos resultados va a dejar.
- [ ] El botón de filtros cuenta el estado activo como filtro.
- [ ] El scroll no salta al cambiar de filtro.
- [ ] Swipe y long-press funcionan sin pelear con el scroll.
- [ ] Al scrollear se abre una ficha sola, no varias.

**Físico**
- [ ] Todo tocable mide 44px reales.
- [ ] Nada queda bajo el safe area inferior.
- [ ] Probado a **360px** de ancho, no sólo a 390px.
- [ ] Probado con la tipografía del sistema al **130%**.

## 09 · Cómo se agrega el próximo ABM

Sumar una entidad es configuración, no diseño:

1. **Mapear los roles**: qué campo es `identity`, `taxonomy`, `headline`, `actor`,
   `context`, `state`, `elapsed`.
2. **Declarar los estados** y su color semántico, reutilizando la escala existente. No se
   inventan colores nuevos por entidad.
3. **Elegir las 2 acciones de swipe**: la más frecuente y la que cierra el registro. El
   resto vive en el detalle y en la barra de selección múltiple.
4. **Escribir la frase del banner.** Es lo único verdaderamente nuevo: qué tiene que hacer
   el funcionario hoy con esta entidad.

El renderer, los tokens, el sheet, el swipe, la selección múltiple y el detalle **no se
tocan**. Si para una entidad hay que tocarlos, es señal de que falta un rol en el modelo:
se agrega al modelo, no una excepción al renderer.
