# Módulo Recursos — lo que el municipio administra de sí mismo

> **Por qué existe:** Munify hoy administra la relación con el vecino (reclamos,
> trámites) y la plata (tesorería). Lo que el municipio tiene para trabajar
> —los vehículos, la gente en la calle, los bienes que presta— se sigue
> llevando en cuadernos. Ese es este módulo.
>
> Hermano de [`../comunicacion/01-modulo-comunicacion.md`](../comunicacion/01-modulo-comunicacion.md):
> Comunicación es puertas afuera, Recursos es puertas adentro. Decisión del
> dueño (2026-08-28), sin tocar tasas, padrón ni imputación.

---

## 1. El hallazgo que ordena todo: el inventario ya modela la flota

El módulo de Campo (OT + Inventario, en producción desde julio) resolvió el
patrón que Recursos necesita. Ver [`../campo/01-inventario-y-ordenes-trabajo.md`](../campo/01-inventario-y-ordenes-trabajo.md).

`inventario_items` separa dos naturalezas, y la de **activo** es exactamente
un vehículo o una máquina:

| | Activo | Consumible |
|---|---|---|
| Ejemplos | camioneta, retro, motosierra | cemento, caños, pintura |
| Mecánica | se **toma** y se **libera** | se **descuenta** |
| Campos | `estado_activo`, `ocupado_por_ot_id` | `stock_actual`, `stock_minimo` |

Y `orden_trabajo_recursos` ya es el pivot que registra quién tomó qué, con
`tipo` (reserva / consumo) e idempotencia en `aplicado`.

**Regla de consolidación, no negociable:** un vehículo municipal **es un ítem
de inventario de naturaleza activo**. No se crea una tabla `vehiculos`
paralela. Recursos le agrega a ese activo lo que le falta para ser flota
(patente, kilómetros, combustible, mantenimiento) y generaliza quién puede
tomarlo. Todo lo demás ya está hecho.

---

## 2. Qué se reusa

| Necesidad | Pieza que ya existe |
|---|---|
| El bien en sí, con alta, baja y catálogo | `inventario_items` + `inventario_categorias` |
| Tomar y liberar un bien | `ocupado_por_ot_id` + `orden_trabajo_recursos` |
| Que el uso quede atado a un trabajo | Órdenes de Trabajo (`ordenes_trabajo`) |
| Que la carga de nafta sea plata | Gastos de Tesorería (caja, proveedor, factura) |
| Quién es el empleado y su cuadrilla | `empleados`, `cuadrillas` |
| Premio de presentismo | catálogo de premios de Sueldos |
| Ubicación y mapa | mismo mapa y geocodificación que ya usa Tesorería |
| Gate por municipio | `municipio_modulos` |

---

## 3. Las tres etapas

### Etapa 1 · Flota

El corralón, que hoy es un cuaderno. El dolor concreto: **nadie sabe cuánto
combustible consume cada vehículo**, y ahí es donde se va la plata.

**Modelo** — campos de flota sobre el activo que ya existe (ALTER aditivo
sobre `inventario_items`, todos nullable: un martillo los deja vacíos):
`patente`, `marca_modelo`, `anio`, `km_actual`, `tipo_combustible`,
`vencimiento_vtv`, `vencimiento_seguro`, `km_proximo_service`.

**Tabla nueva, una sola** — `flota_cargas`: fecha, ítem (el vehículo),
empleado que cargó, litros, importe, kilómetros al momento de cargar, y el
`gasto_id` que generó en Tesorería.

**Lo que el módulo dice** (esto es el producto, no el ABM):
- **Consumo real por vehículo**: litros cada 100 km, calculado de las cargas y
  el kilometraje. Un vehículo que se dispara contra su propio promedio es la
  alerta que el intendente compra.
- **Gasto de combustible del mes** por vehículo y por área, que ya cae en
  Tesorería sin cargarlo dos veces.
- **Qué vence**: VTV, seguro y service por kilómetros.

**Criterio de terminado:** en QA se carga una carga de nafta de la camioneta,
aparece el gasto en Tesorería con su caja descontada, y el vehículo muestra su
consumo cada 100 km con el historial.

### Etapa 2 · Presentismo

La cuadrilla ficha desde el celular al arrancar y al cerrar la jornada, con
ubicación. Hoy el premio de presentismo de Sueldos se marca a dedo: esta etapa
le da el dato.

- Tabla `jornadas`: empleado, fecha, entrada y salida con lat/lng, y las OT
  trabajadas en el día.
- La pantalla de liquidación deja de preguntar "¿le corresponde presentismo?"
  y pasa a decir "22 de 22 jornadas".
- Reusa el login de la app de campo que la cuadrilla ya tiene.

### Etapa 3 · Reservas

Prestar y reservar lo que el municipio tiene: salón comunitario, cancha,
retroexcavadora, camión de agua.

- Hoy un activo sólo puede tomarlo una OT. Esta etapa generaliza el tomador:
  una **reserva** (con solicitante, fechas y estado) es el otro tomador
  posible, con la misma regla de exclusividad que ya impide doble uso.
- El vecino pide desde la app; el municipio aprueba o rechaza.
- Reusa el calendario y el motor de turnos que ya existe.

---

## 4. Orden recomendado entre los dos módulos

1. **Comunicación · Avisos** — el más barato (el canal ya está tendido) y el
   más visible: te mete en el celular del vecino todos los días.
2. **Recursos · Flota** — el que un intendente paga sin discutir, porque le
   tapa un agujero de plata.
3. El resto, por lo que pida el cliente.

---

## 5. Ambiente

Branch `qa` y base `sugerenciasmun-ensayo` (el clon de producción del
2026-08-28, que desde hoy es la base de QA). Los ALTER se aplican ahí; a
producción llegan con la promoción y su script idempotente.
