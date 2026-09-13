# San Pedro Norte: qué quiso hacer Bartolo y cómo entra al modelo nuevo (2026-09-13)

> Marco fijado por el dueño esta noche: **lo único que se migra de SPN es su Tesorería**
> (el resto de su instancia es resto de la demo de la que nació y se limpia con respaldo);
> **los números del pasado no tienen que cerrar** (lo cargado es estimativo, no es
> prioridad para él); **lo importante es de ahora en más**, que todo entre al modelo
> nuevo, **y que a Bartolo no le cambie la operatoria**. Todo lo de abajo está medido
> contra la base de QA, que es copia de producción.

## 1. Lo que Bartolo cargó, medido

Su Tesorería: 1.263 contactos, 8.461 gastos, 289 pagos programados, 6 cajas, 10 conceptos
de liquidación, y **17 "tipos de empleado"** que son la parte cargada "de los pelos".

| Tipo de empleado | Contactos | De dónde sale | Qué es en realidad |
|---|---|---|---|
| Pasantes | 42 | propio | su grupo de nómina más grande: cobran Sueldo, Incentivo y Presentismo (Sosa Rubén $22,7 M, Baez $21,3 M...). No parecen pasantes en sentido estricto: **Bartolo (2026-09-13): personas A PRUEBA, que se pueden quedar o ir; ni relación de dependencia ni monotributo.** Es una modalidad propia |
| En blanco | 34 | propio | planta registrada. Mezcla 4 que no son empleados (una profesional por honorarios, contratistas, beneficiario) |
| Prensa | 25 | propio | un **área**: se les paga con el concepto "Prensa" |
| Turismo y Cultura | 8 | propio | un **área** |
| Auxiliares | 7 | propio | un **cargo** |
| Jubilado | 5 | propio | una **condición**: jubilados que siguen cobrando |
| Profesionales | 5 | propio | un **cargo** (nutricionista, asistente social, higiene y seguridad) |
| Personal jornalizado | 2 | semilla, usado | una **condición** |
| Chofer | 1 | semilla, usado | un **cargo** |
| Legislativo, Sala Velatoria, corralón | 0 | propios, sin uso | **áreas** que creó y no llegó a usar (Sala Velatoria sí existe como concepto de liquidación) |
| Albañil, Plomero, Electricista, Maestro mayor de obras, Personal de mantenimiento | 0 | semilla (está en 27 municipios), sin uso | ruido de la demo |

Tres cosas más, medidas:

- **`subtipo` es una copia en texto del tipo de empleado** (Pasantes 36 = Pasantes, Prensa
  25 = Prensa...). No agrega información: se retira sin pérdida.
- **Los conceptos de liquidación repiten los mismos grupos**: Prensa, Turismo y Cultura,
  Auxiliar, Profesionales, Sala Velatoria son a la vez "tipo de empleado" y "concepto". Para
  Bartolo **concepto = con qué lista se paga**, y tipo de empleado = en qué lista está la
  persona. Es la misma idea dicha dos veces.
- **9 contactos tipo empleado no tienen tipo de empleado**, y 7 con "En blanco" no tienen
  subtipo. Nada grave: caen en "planta, sin cargo".

## 2. La traducción: un solo campo suyo, tres campos nuestros

Lo que Bartolo carga en UN combo ("tipo de empleado") son en realidad tres cosas distintas,
y el modelo nuevo tiene un lugar para cada una **en la ficha laboral** de la Persona:

```
Persona (contactos, la libreta)        -> tipos: empleado · proveedor · contratista · profesional · concejal · beneficiario
   └── Ficha laboral (empleados)       -> modalidad   : planta (En blanco, relación de dependencia) · a prueba (Pasantes) · contratado (monotributo) · jornalizado · jubilado
                                       -> cargo       : catálogo por municipio: Chofer · Auxiliar · Profesional (+ especialidad) · Albañil...
                                       -> dependencia : la que ya existe en el core: Prensa · Turismo y Cultura · Concejo (Legislativo) · Sala Velatoria · Corralón
Conceptos de liquidación               -> NO se tocan: siguen siendo "con qué se paga"
```

La tabla de traducción es **por tipo, no por persona**: 17 renglones que decimos nosotros,
Bartolo confirma dos, y la migración los aplica a los 129 contactos de una vez.

| Tipo de empleado de Bartolo | modalidad | cargo | dependencia |
|---|---|---|---|
| En blanco | planta | — | — |
| Pasantes | a prueba | — | — |
| Personal jornalizado | jornalizado | — | — |
| Jubilado | jubilado | — | — |
| Prensa | planta | — | Prensa |
| Turismo y Cultura | planta | — | Turismo y Cultura |
| Legislativo | planta | — | Concejo Deliberante |
| Sala Velatoria | planta | — | Sala Velatoria |
| corralón | planta | — | Corralón |
| Auxiliares | planta | Auxiliar | — |
| Profesionales | contratado | Profesional | — |
| Chofer, Albañil, Plomero, Electricista, Maestro mayor de obras, Personal de mantenimiento | planta | el mismo nombre | — |

## 3. Que no le cambie la operatoria

- **Su pantalla de Contactos sigue igual**: el combo "Tipo de empleado" queda con sus 10
  valores propios (los 7 de la semilla sin uso se ocultan). Por detrás, elegir un tipo
  escribe modalidad, cargo y dependencia según la tabla de arriba. Él no ve tres campos.
- **Su Agenda de pagos y sus conceptos siguen igual.** No se tocan.
- **Lo cargado antes queda como está**: no se recalcula ni se corrige plata. Sólo se
  clasifica la persona; los gastos y pagos siguen apuntando a la misma fila.
- El gate de paridad demuestra las tres cosas: diferencia cero en lo que ve.

## 4. Lo del importador y lo de Bartolo (medido por fecha de alta)

- **SPN es cliente desde junio de 2026, 3,5 meses.** Mayo fue la importación del histórico que
  hizo Lucas con el importador (7.252 gastos, 1.148 contactos). Desde junio: unos 350 gastos y
  $150 M por mes, 30 a 45 contactos nuevos por mes.
- **Los tipos de empleado son del importador**: 125 de 129 vienen de mayo (las solapas del
  Excel). Bartolo asignó 4 en 3,5 meses. La tabla de traducción de §2 vale para que su
  pantalla no cambie, no porque él la use.
- **El hábito real de Bartolo: "otro"**. Desde junio creó 115 contactos y **56 como "otro"**
  (proveedores como On City, La Segunda Coop, CAF; personas; beneficiarios). No mezcla
  conceptos: elige "otro" porque el alta se lo permite.
- Los "otro" vivos (con gastos desde junio) son **51 fichas**; la plata grande sigue siendo
  Cosedef ($15,6 M desde junio) y Carlos Kako Martínez ($7,7 M).
- "Pasantes" quedó contestado: personas a prueba, que se pueden quedar o ir.

**De ahora en más, dos cosas y nada del histórico:**
1. El alta de contacto pregunta quién es, con los tipos que le sirven y sin "otro" como salida
   fácil (si es empresa u organismo, se dice; si no es nadie, el gasto va sin destino).
2. Las 51 fichas vivas las tipifica él en la planilla `_paridad/curar-83-otros-spn.csv`
   (cuatro palabras: persona, empresa, organismo, no es nadie). Diez renglones son el grueso.

Lo cargado en mayo no se recalcula ni se cura: es estimativo y no es prioridad para él.

## 5. Alcance de la F3, corregido

Se migra **sólo Tesorería de SPN**: contactos, gastos y cuotas, pagos programados, cajas y
movimientos, tipos de empleado (como cargos, modalidades y dependencias), conceptos.

**Se limpia con respaldo, no se migra**, porque es resto de la demo de la que nació la
instancia: 7 empleados semilla, 8 órdenes de pago, 14 reclamos, 8 trámites, cuadrillas,
7 tipos de empleado de semilla sin uso, `tesoreria_premios`. Cada borrado queda en el JSON
de respaldo de la B2.

Lo que este doc cambia en el código de F1/F3: la ficha laboral gana `modalidad` y
`cargo_id` (catálogo `cargos` por municipio); `tesoreria_tipos_empleado` deja de ser
identidad y pasa a ser la tabla de traducción de la pantalla vieja; `contactos.subtipo` se
retira de la escritura (queda como columna hasta la fase 2 de la noche).
