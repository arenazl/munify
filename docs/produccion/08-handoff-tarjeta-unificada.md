# Handoff — la tarjeta de crédito queda en UN solo objeto, y San Pedro arranca limpio

**Para:** Infra · **De:** Munify · **Fecha:** 2026-09-15
**Estado:** validado en QA sobre San Pedro Norte clonado de producción. Falta correrlo en producción.

> **Corrección del 2026-09-15, después de la primera versión de este documento.** La primera
> versión mandaba correr `tarjeta_spn_a_cero.py` en el paso 3. Ese script dejaba la tarjeta en cero
> **sin dar de baja los tres gastos** que el municipio había cargado mal como pago del resumen, así
> que le habría descontado a San Pedro **$6.663.721,28 de Coparticipación por segunda vez**. Lo
> encontró la pregunta de Infra —"¿el histórico queda como estaba?"— al ir a medirla contra
> producción en vez de contestarla de memoria. El script correcto es `curar_tarjeta_spn.py`; el otro
> se borró del repo. La lección va escrita acá porque el paso 3 sigue siendo el peligroso: **un
> saldo en cero se puede alcanzar de varias maneras y sólo una es correcta.**

---

## 1. Qué se arregla, en una frase

En producción una tarjeta de crédito es **dos cosas a la vez**, y por eso los números de San
Pedro no cierran. Después de esto es **una**: la caja.

---

## 2. El problema, medido

### 2.1 La doble entidad

| | `tesoreria_cajas` con `codigo='TARJETA'` | `tarjetas_credito` |
|---|---|---|
| Qué es | la tarjeta **de verdad** | una **etiqueta** |
| Acumula deuda | sí (por sus movimientos) | no, nunca movió un peso |
| La lee el wizard de gastos | sí | no |
| Se paga con "Pagar tarjeta" | sí | no |
| La referencia | `gastos.caja_id` | `gastos.tarjeta_credito_id` |

Convivir fue el bug, no un detalle de modelado: el 2026-08-28 el municipio cargó su Visa en
la pantalla de tarjetas y dos pasos después el wizard le dijo que no tenía ninguna, porque
la caja no existía. Había que dar de alta la misma tarjeta en dos lugares distintos.

### 2.2 La deuda que nunca bajó

La caja de la tarjeta de San Pedro (id 373 en producción) tiene, desde el 5 de mayo:

    28 egresos    $ 6.663.721,28
     0 ingresos   $         0,00

**El botón "Pagar tarjeta" funciona** — se probó por HTTP contra el mismo código que está
en producción y deja la tarjeta en cero, sin crear un gasto. Lo que pasa es otra cosa: el resumen se paga con
el **pago programado #650** ("Servicios", $2.180.305,30, todos los 10), que genera un
**gasto común** contra Coparticipación. La plata sale, el gasto queda, y la caja de la
tarjeta nunca se entera.

Efecto doble: la deuda sube para siempre **y** la plata se cuenta dos veces (una en la
compra con la tarjeta, otra en el "pago" cargado como gasto).

La capacidad para arreglarlo (`tesoreria_pagos_programados.tarjeta_caja_id`) **ya está viva
en producción** desde el pase anterior. Nadie la usó todavía: hay **cero** programados con
destino tarjeta.

---

## 3. Qué hay que correr, en orden

> ### EL ORDEN NO ES EL DE COSTUMBRE: PRIMERO EL CÓDIGO, DESPUÉS LA MIGRACIÓN
>
> El ORM viejo declara `tarjeta_credito_id`, así que lo pide en **cada** select de Gasto. Si
> la columna ya no está y el backend no se actualizó, el módulo de gastos devuelve 500
> entero. No es una hipótesis: pasó en QA el 2026-09-15, con esta misma migración.

### Paso 1 — Deploy del código

Commit `726917d8` en `qa` (a promover a `master`). Saca el router `/tarjetas`, el modelo
`TarjetaCredito`, la columna del gasto, los dos campos del schema, la validación del
endpoint y el `tarjetasApi` del front. La pantalla de tarjetas **no se toca**: ya
administraba cajas.

Verificar que la revisión nueva está viva antes de seguir:

    gcloud run revisions list --service=munify-api --region=us-east4 --project=munify-api --limit=1

### Paso 2 — La migración

    alembic upgrade 20260915_tarjeta_unica

Hace tres cosas, en una transacción:

1. **Antes de borrar nada**, deja asentado en `gastos.observaciones` de qué tarjeta se
   trataba (`"Tarjeta: Visa"`), para los gastos que tenían la etiqueta. En producción son
   **12 gastos de San Pedro**. Un municipio no pierde información porque nosotros ordenemos
   el modelo.
2. Borra la FK, el índice y la columna `gastos.tarjeta_credito_id`. La FK se **busca** por
   `information_schema`, no se adivina: se llama distinto según cómo se creó la columna.
3. Borra la tabla `tarjetas_credito`.

Es idempotente: si la columna o la tabla ya no están, no hace nada.

El `downgrade` recrea tabla y columna **vacías**. La etiqueta era redundante y el vínculo no
se puede reconstruir: es una vuelta atrás de esquema, no de datos.

### Paso 3 — La curación de San Pedro

    python scripts/curar_tarjeta_spn.py --caso spn --env prod                # mira y dice qué haría
    python scripts/curar_tarjeta_spn.py --caso spn --env prod --aplicar

> **Este script, no otro.** Hubo un `tarjeta_spn_a_cero.py` que dejaba la tarjeta en cero **sin dar
> de baja los tres gastos mal cargados**: le habría descontado a San Pedro $6.663.721,28 de
> Coparticipación por segunda vez. Se borró del repo el 2026-09-15. Si aparece en una copia vieja,
> no se corre.

Hace tres cosas, en **una** transacción que se revierte entera si algún chequeo no cierra:

1. **Da de baja los tres gastos que eran pagos del resumen** (baja lógica y borra su egreso, igual
   que hace la app al eliminar un gasto). No eran gastos: la plata ya se había gastado al pasar la
   tarjeta, y por eso estaba contada dos veces. Quedan marcados en `observaciones` con el motivo.

   | id | fecha | descripción | monto | caja |
   |---|---|---|---|---|
   | 21071 | 2026-08-08 | Pago Visa | $2.275.730,90 | 107 |
   | 1022248 | 2026-08-10 | Tarjeta de crédito | $2.180.305,30 | 107 |
   | 1022252 | 2026-09-10 | Tarjeta de crédito | $2.180.305,30 | 107 |
   | | | **total** | **$6.636.341,50** | |

   Se buscan por **fecha + monto + descripción**, nunca por id, y cada uno tiene que matchear
   exactamente uno, activo, en la caja 107, con un solo egreso y sin orden de pago. Si alguno no
   matchea, aborta sin tocar nada.

2. **Registra en su lugar un pago de tarjeta de verdad**: ingreso en la caja 373 + egreso en la
   **107**, que es de donde había salido la plata. Los 28 egresos de compras **no se tocan**: ésas
   son compras reales.

3. **Convierte el programado #650**: pasa a pagar la tarjeta, sin contacto y sin monto fijo — paga
   todo lo que deba el día 10. Desde octubre el circuito corre solo.

#### El corte: qué significa "dejarla en cero"

El municipio pagó su último resumen el **10 de septiembre** y después compró $416.211,21 más
(un flete el 13, repuestos el 14). Por eso hay dos lecturas, y el script las tiene como `--corte`:

| | `--corte pago` (default) | `--corte hoy` |
|---|---|---|
| El pago se fecha | 2026-09-10, el día real | hoy |
| Por | $6.247.510,07, lo que debía ese día | $6.663.721,28, todo |
| La tarjeta queda | debiendo $416.211,21 (lo del 13 y 14) | en $0,00 |
| La caja 107 | **recupera $388.831,43** | **pierde $27.379,78 más** |
| Esos $416.211,21 | los paga sola la corrida del 10-10 | ya están pagados |

**El dueño confirmó `pago` el 2026-09-15**: *"si él puso el pago programado el 10, es porque debe
ser su fecha de vencimiento; así que los pagos son hasta el 10"*. Es lo que pasó: el resumen se pagó
el 10 y lo comprado después es deuda real que todavía no venció. `hoy` deja el número redondo, pero
le saca al banco una diferencia que no corresponde a ese resumen.

**Idempotente, probado aplicando dos veces en QA:** la segunda corrida imprime *"ya curado: el
programado 1001192 apunta a la tarjeta y hay 2 movimientos de curación. Nada que hacer"* y hace
rollback. La curación le cambia la descripción al programado y le saca el monto fijo, así que la
segunda vez ya no aparece por ahí: se lo reconoce por la tarjeta a la que quedó apuntando.

## 4. Qué se validó en QA, y cómo

San Pedro Norte se **clonó entero de producción** a QA (24.527 filas) y se corrió el pase
completo contra esos datos, en este orden.

| Qué | Resultado |
|---|---|
| Migración aplicada | tabla y columna fuera; los gastos con etiqueta quedaron con su nota en `observaciones` |
| Curación `--corte pago`, **aplicada** | los 3 gastos dados de baja y marcados en `observaciones`; pago de $6.247.510,07 al 10-09 desde Coparticipación; la tarjeta queda debiendo $416.211,21 y la caja **recupera $388.831,43**; el programado pasa a "Paga todo lo que deba el día 10", próximo 2026-10-10 |
| Segunda corrida | "ya curado, nada que hacer" — rollback, no toca nada |
| Curación `--corte hoy` (en seco) | pago de $6.663.721,28 al día de hoy; tarjeta en $0,00; de la caja **salen $27.379,78 más**. Descartada por el dueño |
| El circuito, **después** de curar | crear → 3 gastos → pagar → cero sigue en verde sobre el San Pedro curado, por el servicio y por HTTP |
| Circuito por el servicio, en Merlo | crear → 3 gastos ($248.500,75) → pagar → **$0,00**; pagar **no** crea un gasto nuevo |
| Circuito por el servicio, en San Pedro | ídem, con los 8.538 gastos reales adentro |
| Circuito por HTTP contra `qa.munify.com.ar` | las 10 verificaciones en verde, incluida "pagar NO creó un gasto nuevo" |

Los ids del caso (caja 373, programado 650, caja 107) son los de **producción**. Contra una base
clonada el script los resuelve solo —la única caja TARJETA del municipio, el programado con esa
descripción y monto, y la caja de ese programado— y lo avisa. **En producción tienen que coincidir
con los declarados o aborta**: los ids fijos dejan de ser un estorbo y pasan a ser la red de
seguridad de que estamos tocando lo que creemos.

La verificación que importa es la última de cada fila: **la cantidad de gastos no aumenta al
pagar**. Una prueba que sólo mirara el saldo daría en verde con la plata contada dos veces,
que es exactamente lo que le pasó a San Pedro durante cuatro meses.

Una aclaración para leer bien los números de QA: los 12 gastos de San Pedro **no** tienen la
nota en QA. No es que la migración falle — es que el clon los volvió a traer de producción
*después*, y la columna ya no existía de este lado. En producción, donde la columna está
cuando corre la migración, los 12 la reciben.

---

## 5. Para que no vuelva a pasar

La curación arregla el pasado. Lo que impide que se repita es una regla nueva, y va **en el
backend**, no en la pantalla:

> **Si el gasto se paga con tarjeta, la caja tiene que ser la tarjeta.** Y al revés: si la caja
> es una tarjeta, la forma de pago tiene que ser "tarjeta".

Del dueño, 2026-09-15: *"lo que hay que asegurar es que cuando él ponga pago de tarjeta de crédito,
sí o sí tiene que elegir una tarjeta para avanzar; entonces ya esto no va a pasar más"*.

El wizard **ya** filtraba las cajas según la forma de pago, pero el endpoint aceptaba cualquier
combinación. Por ese agujero pasó lo de San Pedro: los pagos del resumen entraron como gastos
comunes contra Coparticipación y la caja de la tarjeta nunca se enteró. Una regla que sólo vive en
la pantalla no la ve el pago programado, ni la API, ni una importación.

**Está en `services/tesoreria_tarjeta.resolver_caja_y_forma_pago`, y la llaman los cinco caminos
por donde nace un gasto**, no sólo el alta: el editor, la carga de combustible de la flota, la
orden de pago y la ejecución de un pago programado. En tres de esos cinco el usuario elige la caja
pero **no** la forma de pago, que se completa con un default — así que ahí la regla no rechaza,
**deduce**: si elegiste la tarjeta, se pagó con la tarjeta. Cargar nafta con la tarjeta corporativa
es lo más normal del mundo y antes quedaba como "transferencia", sumándole deuda a la tarjeta en
silencio.

La misma regla se aplica al **pago programado**, porque al ejecutarse nace un gasto y ese gasto lo
crea el ejecutor con el ORM, sin pasar por el endpoint. Un programado a un contacto con forma de
pago "tarjeta" contra una caja común es exactamente lo que generaba el gasto de $2.180.305,30 todos
los 10: ahora se rechaza al crearlo.

Cubierto por `scripts/test_gasto_tarjeta_obligatoria.py`, siete verificaciones por HTTP:

| | Resultado |
|---|---|
| gasto con tarjeta contra una caja común | **422**, rechazado |
| gasto con transferencia contra la caja tarjeta | **422**, rechazado |
| gasto con tarjeta contra la caja tarjeta | se crea |
| gasto con transferencia contra una caja común | se crea |
| programado "con tarjeta" apuntando a una caja común | **422**, rechazado |
| carga de combustible contra la tarjeta | se crea, y el gasto sale con forma de pago **tarjeta** |

---

## 6. Lo que queda del lado del cliente

Una sola cosa, y es de una vez: la tarjeta ahora se administra **como caja**, en la misma
pantalla de siempre. La identidad (marca y últimos cuatro) vive en el **nombre**, con el
formato que la pantalla arma y desarma: `Visa ····9594`. No hay nada que cargar dos veces.

---

## 7. Los scripts, para el que venga después

| Script | Qué hace |
|---|---|
| `scripts/curar_tarjeta_spn.py` | la curación de arriba. Corre igual en QA y en producción (`--env`), y sobre dos casos (`--caso merlo` es el ensayo en el sandbox) |
| `scripts/test_circuito_tarjeta.py` | el circuito por el servicio. Sólo QA; aborta si la base no se llama como QA; limpia lo que crea |
| `scripts/test_pagar_tarjeta_http.py` | el mismo circuito por HTTP, entrando por la puerta del cliente |
| `scripts/test_gasto_tarjeta_obligatoria.py` | que pagar con tarjeta obligue a elegir la tarjeta, en las dos direcciones y también en el pago programado |
| `scripts/correr_migracion.py` | corre **una** migración contra QA, donde `alembic_version` está vacía, ejecutando el mismo archivo que promueve Infra. No duplica el SQL |
