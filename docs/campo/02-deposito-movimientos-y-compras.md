# El depósito: movimientos, compras y ubicaciones

> **Qué es esto.** El circuito que le faltaba al inventario: de dónde vienen
> las cosas, a dónde van y dónde están guardadas. Hecho el **2026-08-31**.
> Para el modelo de datos y el cruce con las órdenes de trabajo, leer primero
> [`01-inventario-y-ordenes-trabajo.md`](01-inventario-y-ordenes-trabajo.md).

---

## 1. Por qué se hizo

La pantalla de Configuración prometía tres cosas que **no existían**:

> *"Entradas, salidas y ajustes de stock"* · *"Órdenes de compra y reposición"*
> · *"Depósitos: central, corralón y vivero"*

Ninguna de las tres estaba. El stock sólo se movía como **efecto colateral** de
completar una orden de trabajo: no había forma de cargar una compra, ni una
entrega a un área, ni un ajuste por rotura. El historial de un artículo no
existía —no se podía contestar quién se llevó las diez bolsas de cemento— y
`inventario_items` no tenía ninguna columna de ubicación.

Encima, Configuración decía que el inventario **"vive en Operaciones"** y
mandaba a un ABM de artículos. El dueño lo marcó y tiene razón: *el inventario
es inventario*, un catálogo; **lo operacional son los movimientos**.

---

## 2. Qué se ve ahora

| Dónde | Qué es |
|---|---|
| Sidebar → **Campo → Movimientos** (`/gestion/inventario/movimientos`) | El libro del depósito |
| Sidebar → **Campo → Compras** (`/gestion/inventario/compras`) | Las órdenes de compra |
| Configuración → Inventario → **Depósitos** | ABM de ubicaciones (alta, edición, baja) |
| Dentro de la ficha de cada artículo | Su historial de movimientos |

Las dos del sidebar aparecen sólo con el flag `inventario` activo, y son para
**admin y supervisor**.

### Movimientos — el libro

Qué entró, qué salió, qué se ajustó y qué se llevó cada orden de trabajo, con
filtros por depósito y por tipo. Seis tipos, con su color:

| Tipo | Quién lo escribe | Efecto en el stock |
|---|---|---|
| **Entrada** | una persona | suma |
| **Salida** | una persona | resta |
| **Ajuste** | una persona | **fija** el saldo |
| **Consumo por OT** | el cierre de la orden | resta |
| **Tomado por OT** | el cierre de la orden | no toca (un activo se toma, no se gasta) |
| **Devuelto de OT** | el cierre de la orden | suma |

> **El ajuste no mueve el stock: lo fija.** Es un conteo físico — se pone el
> número que hay de verdad y el sistema calcula la diferencia. Es la forma de
> registrar una rotura, un robo o un error de carga **sin inventar una entrada
> o una salida que nunca ocurrió**. El renglón guarda el delta y el saldo al
> que se llegó.

**Los renglones no se editan.** Un movimiento registrado es un hecho; para
corregir se carga un ajuste, que deja rastro. Poder editar el pasado es
exactamente cómo un inventario deja de ser confiable.

Sólo se ofrecen consumibles al cargar: los activos no tienen stock, se toman y
se liberan desde la orden de trabajo.

### Compras — la reposición

Deliberadamente corta para un municipio chico:

```
borrador → enviada → recibida_parcial → recibida
                  ↘ cancelada
```

- **Recibir es lo que hace entrar el stock.** Cada recepción escribe los
  movimientos de ENTRADA: la orden de compra no es una contabilidad paralela,
  es la puerta por la que entra la mercadería.
- **Recepción parcial**: si llegó una parte, se recibe eso y la orden sigue
  esperando el resto (`cantidad_recibida` es acumulativa por renglón).
- **Cancelar NO revierte lo ya recibido**: eso entró de verdad al depósito, y
  deshacerlo dejaría el stock mintiendo. Para sacarlo, un ajuste.
- Editar una orden a medio recibir **conserva lo que ya llegó**: se recalcula
  sólo lo que falta.
- El hero avisa cuando una orden pasó su fecha de entrega prometida.

### Depósitos

Alta, edición y baja, con dirección, responsable y cuántos artículos guarda
cada uno. **Un depósito con artículos adentro no se da de baja**: quedarían sin
ubicación y el historial apuntando a la nada.

Cada artículo tiene su selector de depósito en la ficha. Es nullable a
propósito: a lo que ya existía no se le puede inventar una ubicación.

### El historial del artículo

Los últimos 30 movimientos con el saldo que fue quedando. Vive dentro de la
ficha y no en una pantalla aparte porque la pregunta —*"¿por qué quedan seis
bolsas?"*— se hace mirando el artículo, no buscando en el libro entero.

---

## 3. La regla que no se puede romper

**Una sola puerta mueve stock**: `services/inventario_movimientos.py::registrar_movimiento`.

El alta de movimientos, la recepción de una orden de compra y el cierre de una
orden de trabajo pasan **todos** por ahí, y cada uno escribe su renglón con el
saldo resultante en la misma transacción.

> Si aparece otro camino que toque `stock_actual` sin pasar por esa función, el
> historial vuelve a mentir. **No agregar uno.**

`stock_resultante` se guarda en cada renglón a propósito: sin él, reconstruir
el pasado obliga a recalcular la cadena entera, y si alguien edita un stock a
mano el historial deja de cerrar.

El stock nunca baja de cero: si se consumió más de lo que había, el que miente
es el stock anterior, y eso se corrige con un ajuste, no dejando un negativo
dando vueltas.

---

## 4. Lo que trae la semilla

Pedido explícito del dueño. `services/inventario_seed.py`:

- **Los tres depósitos van SIEMPRE**, con demo o sin demo, porque son
  estructura como las categorías (`TEMPLATE_DEPOSITOS`): Depósito Central,
  Corralón Municipal y Vivero. Cada familia de artículos nace en el que le
  corresponde (`DEPOSITO_POR_CATEGORIA`).
- **La demo trae 90 días de historia** (`seed_movimientos_demo`): carga
  inicial, dos consumos por órdenes, una entrega a una cuadrilla, la recepción
  de una orden de compra y un conteo físico final. Más dos órdenes de compra:
  una ya recibida (la que explica la reposición) y una esperando mercadería.

La serie es **determinística** —se deriva del stock de cada ítem, sin azar— y
**termina en el ajuste por conteo**, así el saldo final coincide exacto con el
stock del artículo: la historia explica el número en lugar de contradecirlo.
Los artículos que hoy están en cero también llevan historia: son los que
aparecen en "bajo el mínimo" y hay que poder explicar por qué se quedaron sin
nada.

```
Cemento Portland 50kg — stock 22 bolsas
  04/06  entrada       44.00   saldo 44.00   Carga inicial del depósito
  01/07  consumo_ot    12.10   saldo 31.90   Consumido por órdenes de trabajo
  18/07  salida         2.20   saldo 29.70   Entrega para trabajo en la vía pública
  29/07  consumo_ot     8.80   saldo 20.90   Consumido por órdenes de trabajo
  11/08  entrada        7.70   saldo 28.60   Recepción OC-2026-0001
  25/08  ajuste         6.60   saldo 22.00   Conteo físico de depósito
```

### En las demos nuevas

`seed_demo_completo` (paso 8) ya llamaba a `seed_inventario(incluir_demo=True)`,
así que **toda demo nueva nace con el depósito completo**: los tres depósitos,
los 90 días de movimientos y las dos órdenes de compra. El hito del log lo
reporta (`items`, `depositos`, `movimientos`, `ordenes_compra`).

El borrado de una demo limpia también las tablas nuevas, **en orden**: primero
las líneas de compra y los movimientos, después los ítems, y al final depósitos
y categorías. Al revés, las FK con RESTRICT frenan el borrado.

---

## 5. Qué se tocó

**Backend**

| Archivo | Qué |
|---|---|
| `models/inventario.py` | `InventarioDeposito`, `InventarioMovimiento`, `InventarioOrdenCompra` (+ líneas), `deposito_id` en el ítem |
| `models/enums.py` | `TipoMovimientoInventario`, `EstadoOrdenCompra` |
| `services/inventario_movimientos.py` | **La única puerta** que mueve stock |
| `api/inventario.py` | 12 endpoints nuevos (21 en total en el router) |
| `api/ordenes_trabajo.py` | `_cerrar_recursos` ahora escribe su renglón en el libro |
| `services/inventario_seed.py` | Depósitos template + 90 días de historia |
| `scripts/migrate_add_inventario_deposito_movimientos.py` | La migración (idempotente) |

**Frontend**

| Archivo | Qué |
|---|---|
| `pages/InventarioMovimientos.tsx` | El libro (kit `abmv2`) |
| `pages/InventarioOrdenesCompra.tsx` | Las compras (kit `abmv2`) |
| `pages/InventarioDepositosConfig.tsx` | ABM de depósitos, sobre `CategoriaConfigBase` |
| `pages/Inventario.tsx` | Selector de depósito + historial en la ficha |
| `pages/Configuracion/Configuracion.tsx` | El puente corregido + Depósitos embebido |
| `lib/enums/inventario.ts` | SSoT de rótulos, colores y signos de movimiento |

---

## 6. Verificación

Contra la base de QA, no sólo que compile:

- **La semilla cierra**: 7 de 7 consumibles terminan con el saldo del último
  movimiento igual a su `stock_actual`. 42 movimientos, 2 órdenes de compra.
- **El circuito de compra, punta a punta**: 25 unidades pedidas → llegan 10
  (queda `recibida_parcial`, stock 22→32) → llegan las 15 restantes
  (`recibida`, 32→47), con sus dos movimientos de entrada y los saldos
  correctos. La orden de prueba quedó borrada y el stock restaurado.
- **Gates**: `tsc` limpio, `eslint` limpio en los archivos nuevos, `vite`
  compila.

### Dos migraciones que QA nunca había corrido

Aparecieron al probar: `migrate_reservas.py` (tabla `reservas` +
`inventario_items.reservable`) y `migrate_flota.py` (tabla `flota_cargas` + 6
columnas de flota). **El modelo las tenía y la base no**, así que cualquier
consulta a `inventario_items` por ORM venía fallando en QA con
`Unknown column`. Quedaron aplicadas.

> Vale revisar si producción está en la misma situación. Eso es de Infra: la
> app no ejecuta contra la base de producción.

---

## 7. Lo que queda afuera (a propósito)

- **Recepción parcial desde la pantalla**: el endpoint acepta recibir renglón
  por renglón (`{lineas: [{linea_id, cantidad}]}`), pero la UI hoy sólo ofrece
  "llegó todo". Si llega una parte, se cargan las entradas a mano desde
  Movimientos.
- **Alertas por stock mínimo**: el dato está (`stock_actual < stock_minimo` es
  calculable y ya se muestra en Configuración), falta la notificación.
- **Movimientos entre depósitos**: hoy se hace con una salida y una entrada.
  Una transferencia en un solo paso sería un tipo más.
- **Proveedores como entidad**: el proveedor de la orden de compra es texto
  libre. Tesorería ya tiene contactos; unificarlos es una decisión de producto,
  no un pendiente técnico.
