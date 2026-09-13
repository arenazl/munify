# Handoff: el pase de la tarjeta de San Pedro Norte

> **Estado al 2026-09-12 a la noche: TODO LISTO, falta un comando.** El dueño decidió no
> correrlo hoy. Este doc es para retomarlo mañana sin haber estado en la conversación.

## Lo que hay que hacer mañana

```
cd backend
python scripts/pase_tarjeta_spn.py --env prod              # mira y dice qué haría
python scripts/pase_tarjeta_spn.py --env prod --aplicar    # lo hace
```

Eso es todo. **No hay flags que elegir ni criterios que interpretar**: lo que había que
decidir se decidió y está adentro del script. Si el municipio movió algo desde el
relevamiento, aborta y dice qué cambió. Si ya se corrió, dice "ya está hecho" y sale.

Probado en seco contra producción el 2026-09-12: el terreno está como se relevó y la corrida
da los números esperados.

**Antes de aplicar, avisar a Infra** (`structure-8d`) por el canal entre agentes, que quedó en
coordinar el cartel de mantenimiento para este paso. Y **después de aplicar, avisarle el
resultado.**

## Qué tiene que pasar

| | Antes | Después |
|---|---|---|
| Tarjeta Visa ····9594 (caja 373) | debe 6.247.510,07 | **0,00** |
| Caja Cooparticipación (107) | −2.451.535,02 | **−2.062.703,59** |
| Gastos que eran pagos, activos | 3 | **0** |
| Programado 650 | gasto fijo de 2.180.305,30 | **paga la tarjeta, sin monto fijo** |

Los **388.831,43** que vuelven a la caja son lo que el municipio había pagado de más. No es un
error del pase: es la señal de que le faltan compras por cargar. **Eso hay que decírselo al
municipio.**

## Por qué

San Pedro Norte quería que la tarjeta se pagara sola todos los 10. La única herramienta que
tenía era la agenda de pagos programados, que sólo sabía generar un gasto a un contacto, así
que agendó un contacto "Visa" con monto fijo. Cada mes nacía un gasto nuevo, y como las
compras con tarjeta ya eran gastos, la plata quedó contada dos veces y la tarjeta nunca bajó.

Ahora el pago programado puede tener **destino tarjeta**: al ejecutarlo paga la tarjeta en vez
de generar un gasto, por todo lo que se deba a la fecha de su vencimiento. La curación arregla
los datos viejos y convierte el programado.

## Decisiones tomadas, para no volver a discutirlas

- **La tarjeta queda en CERO**, no espejando los tres pagos. Los números del municipio no
  cierran entre sí (registró 6.636.341,50 de pagos y las compras cargadas suman 6.247.510,07,
  y ningún pago coincide con ningún resumen). Dueño: *"que le saquemos esos registros que hizo
  él equivocadamente, le dejemos el saldo en cero, y que a partir del mes que viene funcione
  bien"*.
- **`--agosto-doble` NO se usa.** Quedó para el modo espejo, que no es el de este caso.
- **El programado queda en modo aprobación**, que es el default: vence el 10, aparece en la
  agenda y el intendente lo confirma junto con los sueldos. El modo automático existe pero no
  se le activa.
- **El corte es por fecha de vencimiento.** Un pago del 10 salda lo que se debía al 10; lo
  comprado del 11 en adelante es del período siguiente, aunque se confirme el 20. Es así
  porque la tarjeta tiene día de cierre y registrarlo tarde no lo corre.
- **Este mes el municipio no hace nada.** Recién el 10 de octubre confirma, y la tarjeta vuelve
  a cero sola.

## Qué está hecho y verificado

| Dónde | Qué |
|---|---|
| QA | 132 verificaciones en cuatro suites |
| Producción | migración aplicada (6 columnas nuevas) y código vivo: `master` en `45b0ef93` |
| Merlo (sandbox de prod, muni 1000149) | **el ensayo completo: 22 verificaciones en verde**, con el mismo script y los mismos números |

El ensayo en Merlo dio exactamente los mismos totales que va a dar San Pedro Norte, y probó el
circuito hacia adelante: compra, vencimiento, pago exacto, tarjeta en cero, constancia con el
monto escrito, y un mes sin compras que se saltea sin mover plata.

## Si algo sale mal

- El script corre en **una sola transacción**: o queda todo o no queda nada. No hay estados a
  medias.
- Si el terreno cambió (el municipio cargó o pagó algo), **aborta antes de tocar**. Ahí hay que
  volver a relevar, no forzar.
- Si ya se aplicó y se corre de nuevo, dice "ya está hecho" y no toca nada.

## Los archivos

| Archivo | Qué es |
|---|---|
| `backend/scripts/pase_tarjeta_spn.py` | **el comando de mañana**: chequea, cura y verifica |
| `backend/scripts/curar_tarjeta_spn.py` | la curación en sí. El mismo para el ensayo y para el cliente |
| `backend/scripts/casos_tarjeta.py` | los ids de cada caso: `spn` (real) y `merlo` (sandbox) |
| `backend/scripts/semilla_caso_tarjeta_spn.py` | arma el caso para ensayar. Se niega a sembrar sobre datos reales |
| `docs/produccion/02-...` | qué pasó, con los datos de producción |
| `docs/produccion/03-...` | qué se construyó y cómo se probó |

## Lo que queda para después

- **Decirle al municipio que le faltan compras por cargar.** El saldo a favor de 388.831,43 es
  esa señal.
- Los dos commits de documentación de dominios (`b66ce725`, `054dabf3`) quedaron fuera del
  cherry-pick a `master`. No son urgentes, pero corrigen el dominio muerto de QA en el
  `CLAUDE.md`.
- El modo automático está construido y probado, pero ningún municipio lo tiene activado.
