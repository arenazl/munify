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
La diferencia son 388.831,43 pagados de más, y el cruce con los resúmenes (abajo) explica por
qué. Aparte, el gasto 20508 "Tarjeta (débito)" de 1.212.265,67 es débito, no esta Visa.

### Lo que dicen los resúmenes (2026-09-12): faltan compras por cargar

La tarjeta cierra el día 8. Reconstruidos los resúmenes reales desde las compras cargadas:

| Cierre | Compras | Del resumen | Acumulado |
|---|---|---|---|
| 2026-05-08 | 3 | 479.999,00 | 479.999,00 |
| 2026-06-08 | 2 | 55.168,97 | 535.167,97 |
| 2026-07-08 | 7 | 563.877,68 | 1.099.045,65 |
| 2026-08-08 | 7 | 921.956,74 | 2.021.002,39 |
| 2026-09-08 | 6 | 3.996.507,68 | 6.017.510,07 |
| 2026-10-08 | 1 | 230.000,00 | 6.247.510,07 |

**Ninguno de los tres pagos coincide con ningún resumen**, ni con ninguna suma de resúmenes.
Y el del 8 de agosto (2.275.730,90) ya era mayor que todo lo acumulado hasta esa fecha
(2.021.002,39). La conclusión es que **en Munify faltan compras con tarjeta por cargar**: los
pagos salieron de resúmenes reales del banco que incluyen consumos que nunca se registraron.

Los dos pagos de 2.180.305,30 son idénticos al centavo y los generó el programado 650, que
tenía ese monto **fijo**, ejecutado dos veces el 9 de septiembre con dos minutos de diferencia
para ponerse al día con agosto y septiembre. Ese número es el que el municipio puso en la
agenda, no el resumen real de cada mes.

**Decisión (2026-09-12): los tres pagos se convierten, no se borra ninguno.** El criterio que
manda es que la caja del banco no cambie: si el municipio registró esas tres salidas de plata,
es porque salieron. Borrar una cambiaría el saldo del banco por una hipótesis nuestra. El
saldo a favor de 388.831,43 que queda en la tarjeta es la señal visible de que faltan compras
por cargar, y es un dato para que el municipio revise su resumen, no un error a tapar.

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

## Qué se hace

Todo esto lo ejecuta el script `backend/scripts/curar_tarjeta_spn.py` en una transacción, y
está detallado en `03-plan-programado-tarjeta-y-curacion.md`:

1. Dar de baja los tres gastos (21071, 1022248, 1022252): no son gastos, son pagos de la
   tarjeta.
2. Registrar esos mismos pagos por el circuito de "Pagar tarjeta" desde la caja 107, con sus
   fechas y montos. El banco no cambia; la tarjeta baja.
3. El pago programado 650 **no se pausa: se arregla.** Pasa a pagar la tarjeta (todo lo que
   deba el día 10), que es lo que el municipio quiso hacer desde el principio. Un resumen no
   es un monto fijo, y ese era el error de origen.
4. De acá en más el circuito es: las compras con tarjeta como gasto con
   `forma_pago = tarjeta`, y el resumen por "Pagar tarjeta" o por el programado.

**Lo que hay que decirle al municipio:** que faltan compras por cargar. El saldo a favor que
queda en la tarjeta es exactamente esa señal.

Lecturas hechas con scripts de SELECT solamente, con la URL resuelta por `gcloud secrets` y
guarda anti-QA.
