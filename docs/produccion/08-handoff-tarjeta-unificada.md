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

El default es `pago` porque es lo que pasó: el pago del resumen ocurrió el 10 y lo comprado después
es deuda real que todavía no venció. `hoy` deja el número redondo, pero le saca al banco una
diferencia que no corresponde a ese resumen.

**Idempotente:** una segunda corrida ve el programado apuntando a la tarjeta y los movimientos de
curación, e informa "ya curado" sin tocar nada.

## 4. Qué se validó en QA, y cómo

San Pedro Norte se **clonó entero de producción** a QA (24.527 filas) y se corrió el pase
completo contra esos datos, en este orden.

| Qué | Resultado |
|---|---|
| Migración aplicada | tabla y columna fuera; los gastos con etiqueta quedaron con su nota en `observaciones` |
| Curación `--corte pago` (en seco) | los 3 gastos identificados y dados de baja; pago de $6.247.510,07 al 10-09 desde Coparticipación; la tarjeta queda debiendo $416.211,21 y la caja **recupera $388.831,43** |
| Curación `--corte hoy` (en seco) | pago de $6.663.721,28 al día de hoy; tarjeta en $0,00; de la caja **salen $27.379,78 más** |
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

## 5. Lo que queda del lado del cliente

Una sola cosa, y es de una vez: la tarjeta ahora se administra **como caja**, en la misma
pantalla de siempre. La identidad (marca y últimos cuatro) vive en el **nombre**, con el
formato que la pantalla arma y desarma: `Visa ····9594`. No hay nada que cargar dos veces.

---

## 6. Los scripts, para el que venga después

| Script | Qué hace |
|---|---|
| `scripts/curar_tarjeta_spn.py` | la curación de arriba. Corre igual en QA y en producción (`--env`), y sobre dos casos (`--caso merlo` es el ensayo en el sandbox) |
| `scripts/test_circuito_tarjeta.py` | el circuito por el servicio. Sólo QA; aborta si la base no se llama como QA; limpia lo que crea |
| `scripts/test_pagar_tarjeta_http.py` | el mismo circuito por HTTP, entrando por la puerta del cliente |
| `scripts/correr_migracion.py` | corre **una** migración contra QA, donde `alembic_version` está vacía, ejecutando el mismo archivo que promueve Infra. No duplica el SQL |
