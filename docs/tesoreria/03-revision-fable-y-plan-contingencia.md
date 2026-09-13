# Consolidación de Tesorería — revisión y plan de contingencia (2026-09-12)

> Revisión de Fable sobre el trabajo de Opus (`02-plan-consolidacion.md`, scripts
> `migrar_personas_parte_{a,b1,b2}.py` y `paridad_tesoreria.py`), a pedido del dueño.
> Contexto que manda: San Pedro Norte (muni 80) opera Tesorería en producción con
> 8.461 gastos, 289 pagos programados y 1.263 contactos. La migración se hace a
> conciencia, con tres planes de contingencia. Este doc complementa al `02`, no lo
> reemplaza: el modelo destino del `02` sigue vigente.

## 1. Estado real, verificado hoy contra la base de QA

| Pieza | Estado | Evidencia |
|---|---|---|
| Paso 00, fix del `/merge` (órdenes de pago huérfanas) | HECHO y commiteado | `api/contactos.py` reapunta `ordenes_pago.destino_contacto_id` |
| Paso 01, harness de paridad | HECHO, **sin commitear** | `backend/scripts/paridad_tesoreria.py`, baseline del 2026-09-06 en `_paridad/baseline/` |
| Paso 03a, Parte A (catálogo `persona_tipos`, `persona_roles`, 3 columnas de enganche) | APLICADA en QA, **script sin commitear** | tablas y columnas existen; 216 tipos, 1.747 vínculos |
| Paso 03b, Parte B1 (renombre a `personas`) | probada y REVERTIDA; la tabla se llama `contactos` | `personas` no existe en QA |
| Paso 03c, Parte B2 (backfills) | NO corrida | `empleados.persona_id` y `usuarios.persona_id` en 0 |
| Paso 04, pantalla Personas | NO empezada | no hay modelo `PersonaTipo`/`PersonaRol` en `backend/models/`, nada en el front |
| Modelos SQLAlchemy del schema nuevo | NO existen | el schema vive sólo en la base; la app no lo conoce |

Dos cosas que envejecieron desde el 2026-09-06:

- **El baseline está viejo.** Hubo 9 commits en `backend/` que tocan Tesorería (tarjeta,
  pagos automáticos, `fecha_programada`). Un gate contra ese baseline daría diferencias
  que no son de la migración. El patrón se recaptura **inmediatamente antes** de cada
  paso que se quiera medir, nunca días antes.
- **Cuatro municipios nuevos sin catálogo.** Hay 28 municipios con contactos y 24 con
  `persona_tipos`: los demos creados después del 06 nacieron sin tipos y dejaron 80
  contactos sin rol. Reaplicar la Parte A (es idempotente) lo arregla hoy; para que no
  vuelva a pasar, el alta de municipio tiene que sembrar el catálogo desde código.

## 2. Revisión del trabajo de Opus

**Lo que está bien y se conserva.** La tesis (la libreta es `contactos`, se evoluciona en
su lugar, ninguna fila de plata se mueve), el catálogo de tipos editable por municipio con
`municipio_id` en el N:M, la idempotencia y el `--dry-run` de los tres scripts, el freno
que aborta si la base tiene "prod" en el nombre, la lección del renombre (código y base en
el mismo momento) y el gate de paridad como criterio. Es un buen trabajo; lo que sigue son
correcciones, no un cambio de rumbo.

**Hallazgos, por severidad.**

| # | Hallazgo | Dónde | Qué se hace |
|---|---|---|---|
| 1 | Los cuatro scripts no están en git: un `git clean` los pierde | working tree | Pendiente: entran al repo en el branch `feat/persona-obras` (F0) |
| 2 | La Parte A no se reaplica al crear municipios: 4 demos sin catálogo, 80 contactos sin rol | `migrar_personas_parte_a.py` | Reaplicada en QA el 2026-09-12 (28/28 munis, 0 sin rol); sembrar desde código en el alta de municipio y en el creador de demos queda para F0 |
| 3 | La B2 inserta en `persona_roles` con `JOIN contactos` literal en vez de la constante `TABLA`: si corre después del renombre, revienta | `migrar_personas_parte_b2.py` | Pendiente (F0): usar la constante `TABLA` |
| 4 | La B2 crea al personal con login como tipo `otro`, el tipo que justamente se quiere curar hasta vaciar | `migrar_personas_parte_b2.py` | Pendiente (F0): que nazca como `empleado`, que es lo que un admin o supervisor del municipio es, y con su vínculo en `persona_roles` |
| 5 | La B2 borra los 7 empleados semilla de SPN sin respaldarlos; tienen 6 filas en `empleado_cuadrillas` (cascade) y 5 en `empleado_categorias` | `migrar_personas_parte_b2.py` | Pendiente (F0): exportar las filas y sus dependientes a JSON antes del `DELETE` |
| 6 | El enganche empleado a persona se hace por nombre y apellido; en SPN hay 11 nombres repetidos, el `UPDATE ... JOIN` elige uno al azar | `migrar_personas_parte_b2.py` | Pendiente (F0): si el nombre matchea más de una persona, reportar y no enlazar; se resuelve a mano |
| 7 | El gate cubre la primera página de `gastos` y `contactos` (50 y 100 filas de 8.461 y 1.263) | `paridad_tesoreria.py` | Recorrer todas las páginas antes de la ventana (pendiente, bloque 2) |
| 8 | El gate corre contra un backend local: no ve lo que el backend de QA en Cloud Run está sirviendo | `paridad_tesoreria.py` | Aceptar `--base-url` para correrlo también contra `munify-api-qa` después de cada deploy (pendiente, bloque 2) |
| 9 | El modelo nuevo no tiene modelos SQLAlchemy ni endpoints: el `create_all` de una base limpia no lo crea | `backend/models/` | Bloque 2: `PersonaTipo`, `PersonaRol`, columnas en `Empleado`, `User`, `OrdenCompra` |

## 3. Sobre la estrategia del dueño: "lo viejo aparte, esquema nuevo, migrar, los dos como contingencia"

El objetivo se cumple, pero no copiando datos a un esquema paralelo. Copiar los 8.461
gastos a tablas nuevas mientras Bartolo sigue cargando crea dos fuentes de verdad de la
plata durante la ventana, obliga a sincronizar, y duplica el gate. El plan del `02` logra
lo mismo con menos riesgo, porque **nada de lo viejo se destruye**:

- Las tablas de Bartolo son las mismas tablas. Todos los cambios son aditivos (columnas
  nullable, tablas nuevas) salvo dos: el renombre (metadata, se revierte en segundos) y
  el borrado de 7 empleados semilla (se respaldan antes).
- El código viejo sigue andando sobre la base migrada mientras no se renombre. Eso ya se
  demostró en QA: la Parte A aplicada con el backend viejo publicado, y Tesorería siguió
  funcionando.
- "Los dos vivos" se consigue con un **fork de la base en Aiven** más la **revisión
  anterior de Cloud Run**, que es exactamente el sistema viejo completo, sin duplicar
  código ni datos en la base productiva.

### Plan A: rollback fino (minutos, no se pierde lo que Bartolo cargó)

Para un fallo detectado **dentro de la ventana**, por el gate o el smoke.

1. `migrar_personas_parte_b1.py --revertir` (segundos, metadata).
2. Infra vuelve el tráfico de `munify-api` a la revisión anterior (segundos).
3. Los backfills de la B2 no molestan al código viejo: columnas que no lee. Se dejan.
4. Los 7 empleados semilla, si hiciera falta, se reinsertan desde el JSON de respaldo.

### Plan B: restauración (horas, se pierde lo cargado después del respaldo)

Para corrupción de datos descubierta en la ventana o en las primeras horas.

1. Infra restaura `munify_prod` desde el backup tomado al abrir la ventana (Aiven, point in time).
2. Revisión anterior de Cloud Run.
3. Bartolo recarga lo que haya hecho entre el respaldo y la vuelta (por eso la ventana es corta y de noche).

### Plan C: convivencia (días, los dos sistemas vivos)

Es lo que el dueño describe como su ideal, y es barato.

1. Al abrir la ventana, Infra hace un **fork** de `munify_prod` a `munify-prod-pre-personas`.
2. Se levanta un servicio `munify-api-legacy` (revisión anterior, apuntado al fork,
   idealmente con un usuario de base de sólo lectura). Vive 30 días.
3. Con eso, cualquier duda de Bartolo o nuestra en las semanas siguientes se contesta
   comparando: el harness de paridad corre contra los dos y muestra la diferencia
   exacta. Una discrepancia después de la ventana se **corrige puntualmente** en la base
   nueva; no se vuelve atrás, porque Bartolo ya cargó cosas encima.
4. A los 30 días sin novedad, Infra borra el fork y el servicio legacy.

Los tres planes requieren dos cosas de Infra que se piden por el canal, antes de fijar
fecha: (a) que la ventana tenga backup y fork, (b) que la revisión anterior de Cloud Run
quede retenida y nombrada. Se acuerda con Infra y se ejecuta; el dueño fija la fecha con Bartolo.

### Lo que se respalda además, sin pedirle nada a nadie

- Golden snapshot de la API (harness, todas las páginas) capturado desde prod, sólo GET.
- CSV de las 6 tablas de Tesorería de SPN (`contactos`, `gastos`, `gastos_cuotas`,
  `tesoreria_pagos_programados`, `ordenes_pago`, `tesoreria_movimientos_caja`) en la
  carpeta ignorada `_paridad/` y en el bucket de respaldos del proyecto.

## 4. Orden de ejecución

### Bloque 1: 2026-09-12, en QA (análisis; lo único aplicado fue reaplicar la Parte A)

| Paso | Estado |
|---|---|
| Commit de los 4 scripts y este doc | deshecho a pedido del dueño (era sólo análisis); va en el branch de F0 |
| Correcciones 3 a 6 de la B2 | deshechas a pedido del dueño; el script quedó como lo dejó Opus; van en F0 |
| Reaplicar Parte A para los 4 municipios sin catálogo | hecho hoy, verificado 0 contactos sin rol |

### Bloque 2: QA, sin cliente parado (es el 70% del trabajo)

1. Modelos SQLAlchemy `PersonaTipo`, `PersonaRol` y las tres columnas de enganche
   (aditivo, cero cambio de respuestas). Sembrado del catálogo en el alta de municipio y
   en el creador de demos.
2. Harness: recorrido de páginas y `--base-url`. Recapturar baseline.
3. B2 en QA. Gate: las únicas diferencias aceptadas son las buscadas (`/api/empleados` de
   SPN pasa de 7 a 0; el padrón suma el personal con login).
4. Lectura dual: los endpoints de Tesorería siguen sirviendo `tipo` desde el enum, y
   Personas lee de `persona_roles`. El enum se apaga recién cuando el gate de Personas dé
   cero contra el enum.
5. Pantalla Personas (paso 04 del `02`): diseño en el canvas primero, kit v3, `SideModal`
   con secciones por lo que la persona tiene. Reemplaza tres listados.
6. B1 en QA, coordinada: código a `qa`, esperar que el CD publique, renombrar, gate
   contra Cloud Run QA, smoke del front en `qa.munify.com.ar`.
7. Curación de los 83 "otro" de SPN: planilla `_paridad/curar-83-otros-spn.csv` a
   Bartolo. Diez renglones son el 84% de la plata.

### Bloque 3: ventana con SPN (una noche)

1. Infra: backup, fork, revisión retenida. Nosotros: golden snapshot desde prod, CSVs.
2. Parte A, B2, deploy del backend, B1 (en ese orden, cada uno con su verificación).
3. Gate de paridad contra prod: diferencia cero salvo las buscadas.
4. Smoke del front real como Bartolo: Contactos, Gastos, Agenda, una carga.
5. Decisión: seguir, o Plan A. La ventana no se cierra sin el gate.
6. Plan C queda armado 30 días.

## 5. Gotchas nuevos (se suman a los del `02`)

- **El alta de municipio tiene que sembrar `persona_tipos`.** Si no, cada demo nueva nace
  con contactos sin rol. Ya pasó con 4 demos.
- **Todo `CREATE TABLE` con `COLLATE=utf8mb4_unicode_ci`** (lección pagada el 06).
- **El gate se mide contra Cloud Run QA además de local**, o no ve lo que el dueño ve.
- **Hay gastos con fecha futura en SPN** (octubre 2026 a enero 2027): son pagos
  programados de la tarjeta. No es un error de datos, no "limpiarlos".

## 6. Protocolo de producción, con cartel de mantenimiento (dueño, 2026-09-13)

> Orden textual: *"hacé todo como si fuera con cartel de mantenimiento, y curamos el
> procedimiento acá"*. Es decir: el ensayo en QA corre EXACTAMENTE esta lista, cartel
> incluido, las veces que haga falta hasta que salga limpio y cronometrado. La noche de
> producción no se improvisa nada: se repite lo ensayado.

**Verificado 2026-09-13: el modo mantenimiento NO existe todavía** (ni middleware en el
backend, ni variable `MAINTENANCE_MODE` en Cloud Run QA, ni cartel en el front). Infra
lo pidió también para el pase de la tarjeta; se construye UNA vez, en F0, y lo usan los
dos pases: middleware que devuelve 503 a todo salvo `GET /health` cuando
`MAINTENANCE_MODE=true`, y el front muestra el cartel al recibir ese 503 (sin deploy de
front: lo detecta el cliente de la API).

### 6.1 Antes, en días previos, sin ventana ni cartel

| # | Paso | Quién | Prueba de que salió bien |
|---|---|---|---|
| P1 | Lo ADITIVO en prod (tablas nuevas, columnas nullable, catálogo sembrado) con el mismo script que corrió en QA | Infra corre, app entrega el script | gate contra prod en cero; backend actual sigue andando |
| P2 | Golden snapshot de la API de SPN desde prod, TODAS las páginas, sólo GET | app | carpeta `_paridad/prod-baseline/`, cruzada contra SQL en 4 cifras (agenda, OP, cajas, contactos) |
| P3 | CSV de las 6 tablas de Tesorería de SPN, a `_paridad/` y al bucket de respaldos | app + Infra | conteos coinciden con el snapshot |
| P4 | Ensayo completo de la ventana (§6.2) en QA con el clon de SPN, con cartel, cronometrado | app | diferencia cero salvo lo buscado, y el tiempo medido escrito acá abajo |
| P5 | Modo mantenimiento probado en QA: se prende, el front muestra el cartel, `/health` responde, se apaga | app + Infra | captura del cartel en `qa.munify.com.ar` |
| P6 | Aviso a Bartolo con día y hora: "de 22 a 24 no cargues" | dueño | — |
| P7 | Infra confirma: backup automático, capacidad de fork, revisión anterior retenida y nombrada | Infra | mensaje por el canal con el nombre de la revisión |

Si P4 no da cero, **no hay fecha**. Se repite hasta que salga.

### 6.2 La ventana, fase 1 (una noche, objetivo una hora en total con la fase 2)

| # | Paso | Quién | Verificación antes de seguir | Si falla |
|---|---|---|---|---|
| V1 | `MAINTENANCE_MODE=true` en `munify-api` | Infra | el cartel se ve en `app.munify.com.ar`; `/health` en 200 | no se sigue |
| V2 | Backup y **fork** de `munify_prod` (`munify-prod-pre-personas`) | Infra | el fork responde a un `SELECT COUNT(*)` de gastos igual al de prod | no se sigue |
| V3 | Backfills de SPN (Parte B2, idempotente, respalda lo que borra) | app | la verificación del script: empleados sin Persona = 0, semilla respaldada | Plan A: nada que revertir, columnas que el código viejo no lee |
| V4 | Deploy del backend nuevo y tráfico 100% a la revisión nueva | Infra | `/openapi.json` muestra los endpoints nuevos | tráfico a la revisión anterior (Plan A) |
| V5 | **Gate** contra el golden snapshot de P2 | app | sólo las diferencias buscadas (empleados semilla 7→0, padrón suma personal con login) | Plan A |
| V6 | Smoke como Bartolo: Contactos, Gastos, Agenda; cargar un gasto de prueba en Merlo (nunca en SPN) | app | cero requests en 4xx/5xx | Plan A |
| V7 | `MAINTENANCE_MODE=false` | Infra | el cartel desaparece; login de Bartolo | — |
| V7 | Cierre de la fase 1: registro de hora y resultado; si dio bien, sigue la fase 2 (§6.3) con el cartel puesto | app | — | — |

Plan B (restauración por backup) sólo si V5 o V6 muestran datos mal, no forma: es la
única situación en la que se pierde lo cargado después de V2, y con cartel puesto eso es
nada.

### 6.3 Fase 2 de la MISMA noche: el renombre `contactos` → `personas` (dueño, 2026-09-13)

Decisión: **una sola noche, dos fases.** La fase 1 (V1 a V6) migra a SPN y se verifica
con gate y smoke; cerrada esa fase, y sólo si dio bien, arranca la fase 2 con el cartel
todavía puesto. El renombre es metadata, se revierte en un segundo, y el servicio legacy
del Plan C lee el **fork**, no la base productiva: renombrar no lo afecta.

| # | Paso | Quién | Verificación | Si falla |
|---|---|---|---|---|
| R1 | `migrar_personas_parte_b1.py` (renombre) | app | filas y claves entrantes iguales | `--revertir` y la noche cierra igual con la fase 1 hecha |
| R2 | Deploy del backend que ya nombra `personas` (revisión preparada de antemano) | Infra | `/health` en 200 | tráfico a la revisión de la fase 1 + `--revertir` |
| R3 | Gate contra el golden snapshot | app | cero, salvo lo buscado en la fase 1 | ídem |
| R4 | `MAINTENANCE_MODE=false` y registro | Infra + app | login de Bartolo | — |

Hasta esa noche, el código habla de `Persona` y la tabla se sigue llamando `contactos`
(alias en el modelo, con comentario). Las dos revisiones del backend (fase 1 con alias,
fase 2 con el nombre nuevo) se construyen y publican en QA ANTES, para que en la noche
Infra sólo mueva tráfico.

**Hoy se ensaya el procedimiento completo en QA, las dos fases seguidas y cronometradas;
después se prepara para el otro día en prod** (textual).

### 6.4 Después, treinta días (Plan C)

- El fork y la revisión anterior quedan vivos; servicio `munify-api-legacy` apuntado al
  fork, sólo lectura. Cualquier duda se contesta corriendo el harness contra los dos.
- Bartolo carga normal al día siguiente. Una discrepancia se corrige puntual en la base
  nueva; no se vuelve atrás.
- A los 30 días sin novedad, Infra borra el fork y el servicio legacy, y se cierra el tema.

### 6.5 Bitácora de ensayos en QA (se completa al ensayar)

| Fecha | Ensayo | Duración | Resultado del gate | Qué se corrigió del procedimiento |
|---|---|---|---|---|
| — | — | — | — | — |
