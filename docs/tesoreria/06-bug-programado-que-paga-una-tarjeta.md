# BUG — se puede agendar el pago de una tarjeta como si fuera un pago a un proveedor

**Estado:** anotado, sin trabajar. Dueño, 2026-09-15: *"ahí deberíamos ya filtrarlo a pago de
tarjeta"* · *"anotalo para trabajarlo porque es un bug eso"*.

**Alcance:** NO entra en el pase de la tarjeta (`docs/produccion/08-handoff-tarjeta-unificada.md`).
Ese pase ya lleva migración de esquema, curación de plata y una regla nueva; esto se trabaja aparte.

---

## Qué pasa

Un pago programado tiene dos destinos posibles y son excluyentes:

- **un contacto** — al ejecutarse nace un **gasto** por un monto fijo, contra la caja elegida;
- **una tarjeta** — al ejecutarse se registra un **pago de tarjeta**: ingreso en la caja de la
  tarjeta y egreso en la caja de origen, sin monto (paga todo lo que deba ese día).

Nada impide elegir el primero cuando lo que se está agendando es, en los hechos, el segundo. El
sistema no lo detecta, no lo sugiere y no lo filtra: son dos caminos paralelos y el usuario elige
mal sin enterarse.

## El caso real que lo destapó

San Pedro Norte, pago programado **#650**:

```
concepto     'Servicios'
descripcion  'Tarjeta de crédito'      <- lo dice con todas las letras
monto        $2.180.305,30             <- monto FIJO
forma_pago   'transferencia'
caja_id      107 (Coparticipación)
contacto_id  cargado                   <- destino contacto
tarjeta_caja_id  NULL                  <- no apunta a ninguna tarjeta
```

Todos los 10 generaba un gasto común contra Coparticipación. La caja de la tarjeta (373) nunca
recibía el ingreso que cancela la deuda: **28 egresos y cero ingresos entre el 5 de mayo y el 14 de
septiembre**, $6.663.721,28 que nunca bajaron. Y la plata quedaba contada dos veces, porque la
compra con la tarjeta ya era un gasto.

Un programado mal elegido no falla una vez: **se repite solo todos los meses** hasta que alguien
mira los números.

## Lo que YA está resuelto y no hay que rehacer

- El #650 puntual: lo corrige `scripts/curar_tarjeta_spn.py` (parte del pase).
- La pantalla de pagos programados **ya tiene** el selector contacto/tarjeta
  (`frontend/src/pages/PagosProgramados.tsx`), y si se elige tarjeta valida que haya tarjeta, que
  haya caja de origen y que no sean la misma. El #650 es anterior a esa opción.
- Un gasto con forma de pago "tarjeta" ya está obligado a salir de una caja tipo TARJETA, en los
  cinco caminos por los que nace un gasto
  (`services/tesoreria_tarjeta.resolver_caja_y_forma_pago`).

**Nada de eso cubre este bug**: un programado a un contacto, con forma de pago "transferencia", es
sintácticamente legal. Lo sigue siendo.

## Por dónde NO ir

Detectar por el texto ("Visa", "tarjeta", "resumen" en el concepto o la descripción) es adivinar, y
se equivoca en las dos direcciones: no agarra un `'Pagos varios'` a secas —que es como estaba
cargado uno de los tres gastos— y marca en falso cualquier compra legítima hecha con la tarjeta que
mencione la palabra.

## Por dónde sí, para pensar cuando se trabaje

Lo que distingue el caso no es una palabra: es un **hecho contable**.

1. **Al crear o editar el programado.** Si el municipio tiene al menos una caja tipo TARJETA y se
   está agendando un pago a contacto recurrente contra una caja común, preguntar una sola vez si
   es el resumen de una tarjeta. Una pregunta, no un bloqueo: pagarle a un proveedor todos los
   meses es perfectamente normal.
2. **Como alerta del módulo, que es lo que habría avisado a tiempo.** Una caja tipo TARJETA con
   egresos y **cero ingresos** durante más de N días es, siempre, un circuito roto: o no se está
   pagando, o se está pagando por afuera. Eso no depende de cómo alguien escribió un concepto.
3. Ver si conviene que el ABM muestre juntos los dos tipos de programado, para que la diferencia se
   note al mirar la lista y no sólo al cargarlos.

## Dónde mirar

| | |
|---|---|
| El ABM | `frontend/src/pages/PagosProgramados.tsx` (el selector `destino`, línea ~454) |
| El backend | `backend/api/tesoreria_agenda.py` (`_validar_destino`, `_validar_caja_del_programado`) |
| La regla de gastos | `backend/services/tesoreria_tarjeta.py` (`resolver_caja_y_forma_pago`) |
| El caso completo | `docs/produccion/08-handoff-tarjeta-unificada.md` |
