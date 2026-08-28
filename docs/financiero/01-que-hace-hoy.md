# Módulo Financiero de Munify — qué hace

El módulo financiero es la gestión de la plata del municipio en un solo
sistema. Reemplaza las planillas de la tesorería y del contador con tres
submódulos que comparten la misma base de datos: lo que se autoriza en
Contaduría termina como gasto en Tesorería, y los sueldos del personal
generan sus gastos en la misma tesorería. Cada submódulo se activa por
municipio y lo usan el administrador y el supervisor.

| Submódulo | Qué resuelve |
|---|---|
| **Contaduría** | El circuito formal de autorización de pagos: la Orden de Pago |
| **Tesorería** | La plata real: gastos, cajas y saldos, agenda de pagos, conciliación, proyección, proveedores, obras |
| **Sueldos** | Los pagos recurrentes al personal, con premios variables |

---

## 1. Contaduría — Órdenes de Pago

El circuito formal de aprobación de cualquier pago del municipio:

1. **Se crea la Orden de Pago** con número correlativo automático por
   municipio (`OP-2026-0001`): beneficiario (proveedor o dependencia),
   concepto, monto, fecha de emisión y de vencimiento, número de factura del
   proveedor y el **PDF de la factura** adjunto, que queda guardado en la nube.
   Opcionalmente se indica la caja de la que va a salir el pago.
2. La OP queda **pendiente**.
3. El responsable de Contaduría la revisa y la **autoriza**.
4. Al **pagar** se elige la caja definitiva, la fecha y la forma de pago. En
   ese momento el sistema **crea automáticamente el gasto en Tesorería y
   descuenta el saldo de la caja**, sin doble carga. La OP y el gasto quedan
   vinculados en los dos sentidos.
5. Una OP incorrecta se **anula** con motivo registrado, mientras no esté
   pagada.

Contaduría maneja además un catálogo de **retenciones** aplicables a los
pagos, y reportes de OPs vencidas, próximas a vencer, principales
beneficiarios del mes y evolución mensual del gasto autorizado.

---

## 2. Tesorería

### 2.1 Gastos

Es la pantalla central: cada movimiento de plata del municipio, cargado a
mano, importado o generado por una OP pagada, un sueldo liquidado o un pago
programado ejecutado.

**Cada gasto registra:**

- A quién se le pagó: un **contacto/proveedor** o una **dependencia** del
  municipio.
- **Concepto** (del catálogo del municipio), descripción y observaciones.
- **Número de factura** y la **factura adjunta** (PDF o imagen).
- **Monto en pesos** y su equivalente en **dólares con la cotización del
  día**, que queda guardada para siempre (el histórico en USD no cambia
  cuando cambia el dólar).
- **Fecha** contable. Se admiten fechas futuras para cargar cuotas y pagos
  por adelantado.
- **Tipo de financiación** (contado, cuotas, préstamo, recurrente), **forma
  de pago** y **estado de pago**.
- **Cuotas**: cantidad total y cada cuota con su monto, vencimiento, fecha de
  pago, estado, forma de pago, comprobante y notas.
- **Recurrencia**: frecuencia y fecha de fin.
- **Imputación** a una **caja** (de dónde salió la plata), a un **proyecto u
  obra**, y a la **tarjeta de crédito** si se pagó con tarjeta.

**Cómo se carga:** un asistente paso a paso (destino, concepto, monto, forma
de pago, imputación) con la factura arrastrada o sacada con el celular.

**Cómo se consulta:** listado agrupado por fecha con subtotal diario;
buscador por concepto, contacto o descripción; filtros por contacto,
dependencia, caja y proyecto; navegación por mes o por año, o "hasta" una
fecha; pestañas Todos / Al día / Pendiente / Completado; y el total de
movimientos y pesos del período a la vista. Desde cada gasto se ve el detalle
completo, la factura, y se puede dar de baja.

### 2.2 Cajas y saldos

Todas las cajas o fondos del municipio (FOFINDE, FODEMEP, coparticipación,
Paicor, efectivo, tesoro propio, etc.), cada una con su saldo inicial,
ingresos y egresos acumulados y **saldo en vivo**. Como cada gasto se imputa
a una caja, el saldo es real y permite hacer arqueo.

**La tarjeta de crédito es una caja más**, con su propia lógica: lleva
**límite, deuda actual y disponible**. Los gastos pagados con tarjeta no tocan
las cajas de plata: acumulan deuda en la tarjeta. Con **"Pagar tarjeta"** se
salda esa deuda desde una caja real, en una sola operación. Se administran
tarjetas Visa, Mastercard, American Express u otras.

### 2.3 Programados (agenda de pagos)

La agenda de todo lo que el municipio paga de forma **recurrente**: alquileres,
servicios, cuotas, sueldos. Cada pago programado tiene su frecuencia
(mensual, quincenal con dos fechas, etc.), su monto y su vencimiento. Al
ejecutarse genera el gasto correspondiente en Tesorería. La agenda alimenta
el dashboard: qué venció, qué vence esta semana y en los próximos 15 días.

### 2.4 Conciliación

Cruza los movimientos de caja contra el **extracto bancario** y permite
marcar cada movimiento como conciliado, para saber cuánta plata está
pendiente de cruzar contra el banco.

### 2.5 Proyección

**Caja proyectada a 30, 60 y 90 días** a partir de las cuotas pendientes y
los pagos programados: cuánto va a haber que pagar y cuándo.

### 2.6 Contactos (proveedores y beneficiarios)

El padrón unificado de proveedores, contratistas y beneficiarios del
municipio. Desde cada contacto se ven los gastos asociados: cuánto se le
pagó, cuándo y por qué concepto. Detecta contactos **duplicados** (típico de
las importaciones) y permite **unificarlos**, reapuntando automáticamente
todos sus gastos y pagos al contacto que queda.

### 2.7 Proyectos y obras

Cada obra o proyecto del municipio (cordón cuneta, balneario, gimnasio…).
Los gastos se imputan al proyecto —uno o varios— para saber cuánto se lleva
cada obra contra lo presupuestado. Gastos se filtra por proyecto.

### 2.8 Ubicación (mapa)

Mapa con los proveedores y contactos **georreferenciados**; al tocar un
punto se ven sus gastos. Sirve para ver dónde se concentra el gasto. Incluye
un catálogo de **parajes** para ubicar el gasto en zonas rurales.

### 2.9 Importación y curación

Recibe el **Excel** que el municipio ya usa y lo carga masivamente. Los
gastos importados pasan por una **bandeja de curación con IA**: la IA propone
concepto y categoría para cada fila y el supervisor aprueba o corrige.

### 2.10 Configuración

Los catálogos propios de cada municipio: conceptos de gasto y sus tipos,
tipos de empleado, conceptos de liquidación, premios, parajes y cajas.

### 2.11 Reportes y exportación

Egresos por caja del mes, principales conceptos, principales dependencias y
evolución mensual; exportación a CSV de los listados.

---

## 3. Sueldos

El pago recurrente al personal del municipio, que a diferencia de un
proveedor varía mes a mes.

- **Empleados**: el personal con su sueldo base programado y su frecuencia de
  pago, con estado de liquidación (con o sin sueldo programado) y datos de
  contacto.
- **Liquidación**: al pagar el mes, el operador ajusta el monto base de ese
  mes, marca los **premios** que corresponden (presentismo, trabajo extra, y
  los que el municipio defina, cada uno con su monto), ve el total y confirma.
  Se crea el gasto en Tesorería con el descuento de caja.
- **Premios**: catálogo configurable de plus variables.
- **Reportes**: masa salarial programada, empleados activos, principales
  sueldos, distribución por frecuencia y próximos pagos.

---

## 4. Dashboard financiero

Lo primero que ve el intendente o el tesorero al entrar. Se arma solo según
los submódulos que el municipio tiene activos: un municipio que sólo usa
Tesorería ve un tablero enteramente financiero.

**Cinco tarjetas de estado:**

| Tarjeta | Qué dice |
|---|---|
| **Gastado en el mes** | Cuánto va gastado el mes en curso y cómo viene contra el mes anterior a la misma altura |
| **Saldo en cajas** | La plata disponible sumando las cajas reales (las tarjetas no cuentan), cuántos meses de gasto cubre y cuántas cajas son |
| **Vencen en 15 días** | Cuántos pagos de la agenda vencen en los próximos 15 días, cuánto suman y cuál cae primero |
| **Pagos vencidos** | Cuántos pagos están pasados de fecha, cuánto suman y desde cuándo espera el más viejo |
| **Sin conciliar** / **OPs pendientes** | Movimientos sin cruzar contra el banco; con Contaduría activa, las OPs que esperan autorización |

**Tres colas de trabajo:** los pagos **vencidos** ("Marcar y pagar"), los de
**esta semana** ("Ver la semana") y la **nómina** del mes ("Ver la nómina").

**Tendencia de gastos:** la historia real del gasto del municipio en una
curva. Muestra únicamente el período en que el municipio opera el sistema
día a día (lo importado en bloque no se mezcla) y llega hasta hoy. Abre con
el **panorama** completo y una lectura en una frase ("Venís gastando $97M por
mes: agosto va un 18% arriba de julio"), con el total del período, el
promedio de los meses completos, el mes en curso contra el anterior y el mes
más caro. Debajo, cada mes —o cada año, cuando la historia es larga— se abre
al click con su detalle diario.

Todo el tablero sigue la misma regla: **nada se inventa y un cero nunca se
enuncia** — si no hay pagos vencidos dice "Al día", y si no hay base para
comparar, no compara.

---

## 5. Lo que pasa solo

- Una **OP pagada** crea el gasto y descuenta la caja.
- Un **sueldo liquidado** crea el gasto y descuenta la caja.
- Un **pago programado** ejecutado crea el gasto.
- Cada gasto guarda la **cotización del dólar** del día.
- Las **facturas** se suben a la nube y quedan adjuntas al gasto o a la OP.
- La **IA** categoriza los gastos importados en bloque.
- Las tarjetas cargadas en el modelo viejo **se migran solas** al modelo de
  caja-tarjeta.
- El **dashboard** detecta desde cuándo el municipio carga datos de verdad y
  separa la operación de las importaciones.
