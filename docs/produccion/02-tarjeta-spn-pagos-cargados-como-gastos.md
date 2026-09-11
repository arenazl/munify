# Tarjeta Visa de San Pedro Norte: los pagos del resumen están cargados como gastos (2026-09-11)

> Leído en la base de **producción** (`munify_prod`, muni 80) en modo sólo lectura el
> 2026-09-11 a la mañana. Nada se escribió. Escribir en prod es de Infra.

## Estado en producción

| Qué | Dato |
|---|---|
| Caja tarjeta | id 373 "Visa ····9594", código `TARJETA`, límite 0 (a propósito) |
| Compras con tarjeta | 26 egresos, 6.247.510,07, del 2026-05-05 al 2026-09-10 |
| Pagos de tarjeta (ingresos en la caja 373) | **cero**. El endpoint `pagar-tarjeta` nunca se usó |
| Deuda que muestra la pantalla | 6.247.510,07 |
| Fix "pagar todo sin monto" | **vivo en prod desde el 2026-09-10**: front build `e5ada79` (18:52 ART), backend revisión `munify-api-00051` (19:08 ART), cherry-pick `e5ada795` en `master` |

**No se reseteó ni se imputó nada en prod.** El fix cambió el código, no los datos.

## Lo que hizo Bartolo (usuario 858, admin)

Registró los pagos del resumen como **gastos comunes** desde Cooparticipación (caja 107),
sin pasar por "Pagar tarjeta". Ninguno tocó la caja de la tarjeta:

| Gasto | Fecha | Monto | Descripción | Cómo se cargó |
|---|---|---|---|---|
| 21071 | 2026-08-08 | 2.275.730,90 | "Pago Visa" | manual, forma "otro" |
| 1022248 | 2026-08-10 | 2.180.305,30 | "Tarjeta de crédito" | generado por el **pago programado 650** (monto fijo), cargado el 2026-09-09 |
| 1022252 | 2026-09-10 | 2.180.305,30 | "Tarjeta de crédito" | ídem, pago programado 650 |

Total registrado como pago: 6.636.341,50. Deuda de la tarjeta en el sistema: 6.247.510,07.
La diferencia (388.831,43) son compras del resumen real que nunca se cargaron como gasto con
tarjeta. Aparte, el gasto 20508 "Tarjeta (débito)" de 1.212.265,67 es débito, no esta Visa.

Sospecha a confirmar con él: agosto tiene dos pagos (el manual del 08-08 y el programado del
08-10). Uno de los dos puede estar de más.

## El pago programado 650 (leído en prod el 2026-09-11)

| Campo | Valor |
|---|---|
| Contacto | "Visa" (contacto creado para esto) |
| Concepto / descripción | Servicios / "Tarjeta de crédito" |
| Monto | 2.180.305,30, **fijo** |
| Frecuencia | mensual, día 10, sin fecha de fin |
| Caja | 107 Cooparticipación |
| Creado | 2026-08-04 13:21 por Bartolo |
| Último pago / próximo | 2026-09-10 / **2026-10-10** |
| Activo | sí |

Es el **único** programado vinculado a la tarjeta: SPN tiene 282 programados (238 activos) y
el resto son sueldos (118), incentivos, prensa, presentismo, servicios y profesionales.

Un programado **no genera el gasto solo**: lo genera cuando el usuario lo ejecuta desde la
agenda, de a uno (`/ejecutar`) o todos los vencidos juntos (`/ejecutar-masivo`). Los dos
gastos del 650 se ejecutaron a mano el 2026-09-09 (11:26 y 11:28), poniéndose al día con
agosto y septiembre. El riesgo concreto: el 10 de octubre vuelve a aparecer como vencido y,
cuando Bartolo ejecute el masivo de sueldos, se lo lleva puesto.

## Consecuencias hoy

- La caja Cooparticipación está bien: la plata salió de verdad.
- El **gasto está contado dos veces** en reportes: las compras con tarjeta y los pagos.
- La tarjeta sigue mostrando toda la deuda.
- **Si Bartolo aprieta "Pagar todo" hoy desde Cooparticipación, el banco se descuenta por
  segunda vez** (6.247.510,07). No está "listo para que pague de vuelta".

## Qué corresponde hacer (decisión del dueño; la escritura en prod es de Infra)

1. Dar de baja los tres gastos de arriba (21071, 1022248, 1022252): no son gastos, son pagos
   de la tarjeta.
2. Registrar esos mismos pagos por "Pagar tarjeta" desde la caja 107, como **parciales** con
   las fechas y montos reales. La tarjeta queda con 388.831,43 a favor, que es la señal de que
   faltan compras por cargar (o Bartolo las carga y queda en cero).
3. **Pausar o borrar el pago programado 650** ("Tarjeta de crédito", 2.180.305,30 mensual):
   un resumen de tarjeta no es un monto fijo, y cada mes va a volver a generar el gasto.
4. De acá en más, el circuito es: compras con tarjeta como gasto con `forma_pago = tarjeta`,
   y el resumen por "Pagar tarjeta" → "Pagar todo".

Lectura hecha con `scratchpad/leer_tarjeta_spn*.py` (SELECT solamente, URL por `gcloud
secrets`, guarda anti-QA).
