# El pago programado ahora puede pagar una tarjeta + curación de la Visa de SPN

> Estado: **hecho y probado en QA el 2026-09-11.** Falta que Infra lo aplique en producción.
> El caso y los datos reales están en `02-tarjeta-spn-pagos-cargados-como-gastos.md`.

## 1. Por qué

Bartolo quiere que la tarjeta se pague sola todos los 10. La herramienta que tenía era la
agenda de pagos programados, que sólo sabía hacer una cosa: generar un **gasto** a un
contacto. Así que creó un contacto "Visa" con monto fijo. Resultado: cada mes nacía un gasto
nuevo (las compras con tarjeta ya eran gastos, o sea plata contada dos veces) y la tarjeta
nunca bajaba.

Decisión del dueño (2026-09-11): *"el pago programado, así como descuenta de caja, tiene que
descontar de la caja tarjeta de crédito"*. No se le saca la función: se la hace funcionar.

## 2. Qué cambió

Un programado tiene un **destino**, y ahora son dos:

| Destino | Al ejecutar | Monto |
|---|---|---|
| Contacto (como siempre) | nace un gasto + egreso en la caja | el del programado |
| **Tarjeta (nuevo)** | ingreso en la caja-tarjeta + egreso en la caja de origen, **sin gasto** | todo lo que deba ese día |

Es exactamente lo que hace el modal "Pagar tarjeta". Las dos puertas comparten una sola
implementación: `backend/services/tesoreria_tarjeta.py`.

Tres reglas que quedaron en el código:

- **Sin monto fijo.** Un resumen cambia todos los meses; fijar un número fue la trampa
  original. El monto se lee de la base en el instante de grabar, así que la tarjeta queda en
  cero exacto aunque entre una compra en el medio.
- **Si no hay deuda, el período se saltea** sin mover plata y el vencimiento avanza igual. Un
  mes sin compras no es un error.
- **Nunca nace un gasto.** El gasto ya se registró al comprar con la tarjeta.

Archivos: modelo y migración (`tarjeta_caja_id` en el programado, `contacto_id` y
`monto_pesos` pasan a opcionales, `pago_programado_id` en los movimientos de caja), schemas
con validación de destino único, la agenda (alta, edición, ejecutar, masivo e historial), el
servicio compartido, y en el front la pantalla de Programados, el pago masivo, Sueldos y
`lib/pagoProgramado.ts`.

## 3. La pantalla

En el alta aparece "A quién se paga": un contacto o una tarjeta. Con tarjeta se elige la
tarjeta y la caja de donde sale la plata, y el campo monto se reemplaza por el texto "paga
todo lo que deba ese día". La fila muestra la tarjeta y lo que debe hoy en lugar de un monto
fijo. Al ejecutar, el panel dice cuánto va a salir y de qué caja, o avisa que no hay deuda y
se saltea. El selector de destino sólo aparece si el municipio tiene alguna tarjeta cargada,
así que para el resto la pantalla no cambia.

## 4. Los tres scripts

Todos en `backend/scripts/`, todos con `--env qa|prod` y `--aplicar` (sin `--aplicar` corren
en seco), todos idempotentes.

| Script | Qué hace |
|---|---|
| `migrate_programado_tarjeta.py` | la migración, chequeando qué falta antes de cada paso. Equivale a `alembic/versions/20260911_programado_tarjeta.py`, que es el registro formal |
| `semilla_caso_tarjeta_spn.py` | **sólo QA.** Deja el municipio 80 igual que producción: 26 compras por 6.247.510,07, cero pagos, los 3 pagos del resumen cargados como gasto y el programado 650 como lo dejó Bartolo. Re-ejecutable: deshace una curación previa y borra compras de ensayo |
| `curar_tarjeta_spn.py` | la curación. **Es el mismo que corre en producción** |

La curación aborta sin tocar nada si algo no cuadra: que la caja 373 sea la tarjeta, que los
tres gastos existan una sola vez y activos, que cada uno tenga un solo egreso en la caja 107,
que ninguno tenga orden de pago vinculada, que la tarjeta no tenga pagos ya registrados y que
el programado 650 siga como estaba. Al terminar verifica que el saldo del banco no se haya
movido y que no queden gastos de "pago de tarjeta" activos; si no cierra, deshace todo.

`--agosto-doble borrar` es para cuando Bartolo confirme si el 10 de agosto hubo o no un
segundo pago real. Por defecto convierte los tres.

## 5. Probado en QA (2026-09-11)

Semilla, curación y **60 verificaciones contra la API real** con la cuenta admin del
municipio, todas en verde. Lo que se comprobó:

- La curación deja el banco igual al centavo y la tarjeta pasa de 6.247.510,07 de deuda a
  388.831,43 a favor, que son las compras del resumen real que nunca se cargaron.
- Correrla dos veces dice "ya curado" y no toca nada.
- El programado 650 se ve como pago de tarjeta, sin contacto ni monto, con la deuda del día.
- Sin deuda, ejecutar saltea el período sin mover plata y avanza el vencimiento.
- Con deuda, paga todo, la tarjeta queda en cero y la caja baja exactamente esa cifra.
- Ejecutar dos veces la misma fecha da 409 y no mueve plata.
- El masivo hace lo mismo, y los pagos de tarjeta aparecen en el historial.
- Un programado de contacto sigue generando su gasto como siempre, y los otros 233 del
  municipio quedaron intactos.
- El modal "Pagar tarjeta" sigue funcionando igual: parcial, total y 422 sin deuda.

## 6. Lo que falta, y es de Infra

1. Correr `migrate_programado_tarjeta.py --env prod --aplicar` en producción.
2. Promover `qa` a `master` para que el código quede vivo.
3. Correr `curar_tarjeta_spn.py --env prod --aplicar`, después de que el dueño decida el
   `--agosto-doble` hablando con Bartolo.
4. Recién entonces, probar el circuito en el sandbox de producción (Merlo, municipio
   1000149) con una tarjeta de prueba.

Hasta que eso pase, **Bartolo no tiene que apretar "Pagar todo"**: la tarjeta en producción
sigue con los 6.247.510,07 que ya pagó, y el banco se descontaría por segunda vez.
