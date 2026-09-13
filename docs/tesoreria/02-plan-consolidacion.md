# Consolidación de Tesorería al core — PLAN DE EJECUCIÓN

> Aprobado por el dueño el 2026-09-06. Reemplaza el enfoque de
> `01-consolidacion-analisis.md` (2026-07-05), que sigue siendo válido como análisis
> pero cuyo modelo destino quedó corregido acá.
>
> **Estado (2026-09-06): pasos 01 y 03a HECHOS y verificados en QA, con el gate de
> paridad en diferencia cero.** Ver §5.bis. Este doc es autosuficiente: alcanza para
> retomar sin releer la conversación.

---

## 1. El problema, en una frase

El concepto de persona está modelado **cuatro veces** y ninguna clave las cruza: el que
trabaja, el que cobra y el que factura son tres registros distintos, y el sistema no sabe
que son el mismo vecino.

| Tabla | Qué representa | Filas | Le falta |
|---|---|---|---|
| `usuarios` | Login, verificación de identidad | ~580 | Todo lo económico |
| `empleados` | Recurso operativo: quién trabaja | 246 (7 en SPN, semilla) | DNI, email, datos fiscales |
| `contactos` | Agenda económica: a quién se le paga | 1.747 (1.263 en SPN) | Login, zona, cuadrilla |
| `inventario_ordenes_compra.proveedor` | Un `varchar(200)` tipeado | 20 OC | Todo |

La única unión que existe, `usuarios.empleado_id`, está marcada `DEPRECATED` en
[`models/user.py`](../../backend/models/user.py). Las otras dos nunca existieron.

**El síntoma más caro no es de prolijidad:** Patrimonio le compra a un proveedor que es
texto libre y Tesorería le paga a un `contacto`. Es la misma persona y el circuito
**comprar → recibir → pagar** no cierra.

---

## 2. Datos medidos (2026-09-06, base `sugerenciasmun-qa`)

San Pedro Norte, muni 80, único cliente productivo:

```
contactos 1.263 → proveedor 862 | empleado 133 | otro 83 | contratista 70
                  profesional 59 | beneficiario 44 | concejal 12
gastos     8.423 → el 100% con destino=contacto (cero a dependencia)
plata      proveedor $1.620M · empleado $836M · profesional $210M · otro $213M
           contratista $178M · concejal $54M · beneficiario $22M
pagos prog   272 (234 activos) → 223 empleados, 18 concejales, 15 proveedores, 9 profesionales
órdenes pago  20
dni 47/1.263 (3,7%) · cuit 0/1.263 · 11 nombres duplicados
SPN usa: 0 órdenes de trabajo · 0 inventario · 14 reclamos · 8 trámites
```

**Dos hechos que definen el plan:**

1. **El 68% de los contactos son proveedores, no personal.** Corrige el análisis de julio,
   que daba por hecho que `contactos` era el plantel municipal: es apenas el 10%.
   "Contacto" no es "empleado mal modelado" — son dos ejes distintos que comparten tabla
   porque lo único que importaba era a quién se le paga.
2. **SPN es mono-módulo.** No hay dos poblaciones de personas que fusionar: sólo tiene
   contactos. No es un merge que pueda salir mal, es un backfill en una sola dirección.
   **El riesgo es de corrección de código, no de pérdida de datos.**

---

## 2.bis. ESTRATEGIA DEFINITIVA (dueño, 2026-09-06)

> *«Le dejamos sus tablas andando, hacemos el schema bien y se lo migramos en una noche.»*

Nada de convivencia, adaptadores ni transformaciones incrementales sobre datos vivos:

1. **Las tablas de Bartolo quedan quietas** y funcionando mientras dure la construcción.
2. **El schema nuevo se diseña bien**, sin condicionamientos de lo viejo — se construye al
   lado y se prueba con un clon.
3. **Una ventana única y corta** para migrar. Es viable justamente porque hay un solo
   cliente productivo.

Y el dueño puede pedirle a Bartolo que cargue distinto de ahí en adelante: la relación da
para eso. Lo que NO se negocia es la trazabilidad de la plata ya cargada.

### Lo que el modelo destino tiene que resolver, aprendido midiendo SPN

- **La raíz no puede ser sólo «Persona».** La mayoría de los proveedores de un municipio
  son **empresas** (corralones, distribuidoras, SADAIC). El destino de un gasto es un
  **tercero**, persona física o jurídica.
- **Cuatro ramas, una sola pregunta**: qué hace ese tercero con la plata del municipio.
  Empleado (con su modalidad), Proveedor, Beneficiario, Organismo. La profesión y el cargo
  dejan de ser ramas: el abogado es empleado bajo su modalidad, el concejal también.
- **Los conceptos no son terceros.** En SPN hay fichas llamadas «Pasajes», «Plata de caja»
  y «Premio truco» porque el sistema exige un destino para cada gasto. **Un gasto tiene que
  poder no tener destino** — ya tiene su campo concepto.
- **El área del empleado es la dependencia**, que ya existe en el core y la usan Reclamos y
  Trámites. No un subtipo aparte.
- **El login es un perfil, no un tipo.** `usuarios.persona_id`, 1 a 1. Darle acceso a un
  empleado deja de crear un segundo registro de la misma persona.

### La curación de los 83 «Otro» — la hace Bartolo, no nosotros

306 gastos y **$213M** cuelgan de fichas que no son personas. Nadie más sabe si «Cosedef»
es un organismo o una cooperativa. Planilla generada en `_paridad/curar-83-otros-spn.csv`,
ordenada por monto: **las 10 primeras filas son el 84% de la plata** (Cosedef sola, $122M).
Marcando diez renglones queda resuelto casi todo.

---

## 3. Modelo destino

### 3.1 La decisión de fondo

Hay dos tablas candidatas a ser la libreta única y hay que elegir cuál queda y cuál cuelga.

- **Si la libreta fuera `empleados`:** hay que mudar los 1.263 contactos adentro, y con
  ellos reapuntar los 8.423 gastos, 272 pagos y 20 OP. Es tocar todos los registros de
  plata del cliente productivo. Y `empleados` ni siquiera tiene dónde guardar CUIT o alias
  de pago.
- **Si la libreta es `contactos`:** la tabla se queda quieta con su PK. Se le agregan
  columnas y se le cuelga `empleados` al lado. **No se mueve un solo registro de plata.**

**Decisión: la libreta es la de tesorería, y personal pasa a colgar de ella.**

### 3.2 El nombre

La entidad se llama **Persona** (palabra del dueño: *"contacto es más de celular"*). La
tabla física se renombra `contactos` → `personas` con un `RENAME TABLE`, que en MySQL es
una operación de metadata: **no toca ni una fila y las FK siguen apuntando solas**. O sea
que el nombre correcto no cuesta nada.

No queda "contacto" como sinónimo vivo: tener dos nombres para la misma cosa es justo el
problema que se está arreglando.

### 3.3 Las tres capas

```
Persona            nombre · documento · teléfono · domicilio · datos fiscales · alias de pago
  │                una sola vez por ser humano
  │
  ├── Qué es       empleado · proveedor · contratista · concejal · profesional · socio ·
  │                institucional (otro intendente)…   VARIOS A LA VEZ
  │                → catálogo EDITABLE POR MUNICIPIO, como las categorías de reclamo.
  │                  NO una lista fija en el código: el que viene después va a querer
  │                  "bomberos voluntarios" o "club" y no se toca código por eso.
  │
  └── Ficha laboral   zona · cuadrilla · horarios · capacidad · ausencias · métricas
                      EXISTE SÓLO si la persona es del personal.
                      Es la diferencia clave: los demás tipos son un rótulo y nada más;
                      un proveedor no tiene cuadrilla.
```

**Empleado y proveedor no entran uno adentro del otro** (marcado por el dueño): los dos
cuelgan de Persona, en el mismo nivel.

### 3.4 Los cambios de schema, uno por uno

Todos **aditivos**, ninguno destructivo:

| # | Cambio | Por qué |
|---|---|---|
| 1 | `RENAME TABLE contactos TO personas` | El nombre correcto. Gratis: metadata, cero filas movidas |
| 2 | `empleados.persona_id` (nullable → NOT NULL tras backfill) | Empleado deja de ser identidad y pasa a ser ficha laboral |
| 3 | `usuarios.persona_id` (nullable) | Backfill **sólo staff, nunca vecinos**: crearía una persona por ciudadano y contaminaría el padrón |
| 4 | `persona_tipos` — catálogo per-muni | Reemplaza el enum fijo `contactos.tipo`. Editable por municipio |
| 5 | `persona_roles` N:M **con `municipio_id` propio** | Una persona, varios tipos. El `municipio_id` evita huérfanos al borrar un muni demo |
| 6 | `inventario_ordenes_compra.proveedor_persona_id` (nullable), el `varchar` queda como snapshot | **Cierra comprar → recibir → pagar.** Es la pieza que vende el producto |
| 7 | Normalizar `''` → NULL en `dni`/`cuit` **antes** de cualquier índice único | MySQL trata `''` como colisión; sólo NULL no colisiona |

### 3.5 Lo que NO se toca

- **La agenda de pagos programados.** No es un listado de personas: es la programación de
  a quién se le paga qué día, con su frecuencia, su monto y su caja. Sigue en su pantalla.
  Lo único que cambia es que el combo de destinatario elige una Persona — **la misma fila,
  el mismo número** — y entonces también se le puede programar un pago a alguien que hoy
  no está en la libreta de tesorería (por ejemplo un empleado de cuadrilla).
- `tesoreria_pagos_programados.contacto_id`, `gastos.destino_contacto_id`,
  `ordenes_pago.destino_contacto_id`: **los ids no cambian**. Renombrar las columnas es
  cosmética opcional y se decide aparte.
- Los 8.423 gastos de SPN. Ninguno se mueve.

---

## 4. Criterio de aceptación

> ### PRECISADO el 2026-09-06 por el dueño — un modelo, dos superficies
>
> Dos cosas que parecían opuestas y no lo son:
>
> **1. Un solo esquema.** Textual: *«uno no es mantener todo un esquema por un
> cliente»*. A San Pedro Norte se lo mete en la estructura nueva, y es el momento
> justo porque hay un solo cliente productivo. No queda un modelo viejo vivo para él.
>
> **2. Sus pantallas no se tocan.** Textual: *«tenés que cambiar el modelo pero
> dejarles las pantallas a Bartolo, y armar las pantallas genéricas para todo el
> sistema»*. Contactos, Gastos y la Agenda de pagos siguen tal cual, servidas por los
> **mismos endpoints**, que ahora leen del modelo unificado. Bartolo no reaprende nada.
>
> **Y por eso el gate vale más que antes, no menos.** Si su pantalla no cambia, su
> endpoint no puede cambiar: **diferencia cero** sigue siendo el criterio. Lo que
> cambia es lo que esa cifra demuestra — ya no que le conservamos el modelo viejo,
> sino que **el modelo nuevo lo sirve igual de bien**. Un endpoint que cambia de forma
> es una regresión; una fila que falta, también.
>
> Las pantallas nuevas y genéricas —la de Personas— se construyen **al lado**, para el
> resto del sistema y los municipios que vienen. No reemplazan las de Bartolo.

### La prueba de paridad (ahora: red, no veto)

**Paridad de API para SPN (muni 80), diff = 0.**

1. **Baseline:** llamar todos los GET de tesorería del muni 80 y guardar cada JSON
   (agenda, conceptos-liquidacion, conceptos-abm, cajas, movimientos, gastos, ordenes-pago,
   tasas, proyectos, reportes, historial…). Son lecturas.
2. **Post:** los mismos endpoints con el modelo nuevo aplicado en QA.
3. **Éxito = 100% de integridad.** El refactor interno no debe cambiar **nada** de lo que
   la API devuelve para SPN.

El baseline se captura **antes** de tocar QA, o se pierde la referencia.

---

## 5. Los pasos, en orden

| # | Paso | Riesgo | Estado |
|---|---|---|---|
| 00 | Fix del `/merge` que dejaba huérfanas las órdenes de pago | — | **HECHO**, verificado en `api/contactos.py` |
| 01 | Harness de paridad: capturar el patrón | Ninguno (sólo lecturas) | **HECHO** — `scripts/paridad_tesoreria.py`, 38 endpoints |
| 02 | Especificación del modelo destino, para aprobar | Ninguno (papel) | **Este documento la cubre** |
| 03a | Migración PARTE A: estructura y catálogo | Ninguno (no toca respuestas) | **HECHA en QA, gate en CERO** |
| 03b | Migración PARTE B1: renombre a `personas` | **NO cambia respuestas, pero exige deploy coordinado** | Probado y REVERTIDO — ver §5.ter |
| 03c | Migración PARTE B2: backfills (empleados, staff, proveedores de OC) | Cambia respuestas | Pendiente |
| 04 | La pantalla única de Personas | Ninguno hasta que salga | Pendiente |
| 05 | Ventana con SPN: respaldo → migración → gate de paridad → arrancar | El único con cliente parado | Pendiente |

**Recomendación del dueño-agente sobre el orden:** adelantar el **04 (dibujar la pantalla)**
antes del 03. No depende del schema y es la prueba barata de si el modelo está bien pensado:
si la ficha de una persona sale natural —si cada sección aparece sola, sin condicionales
raros— el modelo cierra. Si hay que inventar excepciones, está mal, y se descubre con un
dibujo en vez de después de haber migrado 8.423 gastos.

---

## 5.bis. Lo hecho en QA el 2026-09-06

**Paso 01 — el gate existe.** `backend/scripts/paridad_tesoreria.py`, con las dos puntas
(`capturar` y `comparar`). Firma el token de Bartolo (usuario 858, único admin activo de
SPN), lee los endpoints del OpenAPI vivo y guarda cada respuesta. Sólo GET. El patrón
quedó en `_paridad/baseline/` (fuera del repo, en `.gitignore`).

- 38 endpoints, 33 en 200. Cruzados contra SQL: agenda 234 activos, OP 8, empleados 7,
  cajas 6 — coinciden.
- **Limitación conocida:** `gastos` y `contactos` vienen paginados (50 y 100). El patrón
  cubre la primera página. Completar con recorrido de páginas antes del paso 05.
- Los campos de hora de generación (`exportado_en` y afines) se neutralizan al comparar,
  nunca al capturar: cambian en cada llamada y no son una regresión.

**Paso 03a — migración Parte A aplicada.** `backend/scripts/migrar_personas_parte_a.py`,
idempotente y con `--dry-run`. Aborta sola si la base tiene "prod" en el nombre.

| Qué | Resultado |
|---|---|
| `persona_tipos` (catálogo editable por muni, con campo `cobra`) | creada, sembrada en **24 municipios** |
| `persona_roles` (N:M con `municipio_id` propio) | creada, **1.747 vínculos** = 1 por cada contacto |
| `empleados.persona_id`, `usuarios.persona_id`, `inventario_ordenes_compra.proveedor_persona_id` | creadas, **vacías** a propósito |
| **Gate de paridad** | **DIFERENCIA CERO** sobre 38 endpoints |

Fidelidad verificada contra el enum viejo en SPN, tipo por tipo: proveedor 862, empleado
133, otro 83, contratista 70, profesional 59, beneficiario 44, concejal 12. **Coinciden los
siete.**

> **Tropiezo pagado, para que no se repita:** las tablas nuevas nacieron en
> `utf8mb4_0900_ai_ci` (el default de MySQL 8) y toda la base es `utf8mb4_unicode_ci`;
> cualquier JOIN por texto contra una tabla vieja muere con *"Illegal mix of collations"*.
> **Todo `CREATE TABLE` de este proyecto lleva `COLLATE=utf8mb4_unicode_ci` explícito.**

---

## 5.ter. El renombre a `personas`: probado, revertido, y la lección que costó

**Se hizo y funcionó.** `RENAME TABLE contactos TO personas` + los 7 puntos del código que
nombran la tabla (`models/contacto.py` `__tablename__`, las FK de `gasto.py`,
`orden_pago.py` y `tesoreria_extra.py`, y 3 JOIN de SQL crudo en
`services/dashboard_ia.py`). Verificado: 1.747 filas y las 7 claves entrantes intactas, y
**el gate dio DIFERENCIA CERO** — el nombre de una tabla no viaja en el JSON.

**Y se revirtió a los 4 minutos 44, porque el paso está mal clasificado en este plan.**

> ### La lección
> **La base de QA es COMPARTIDA con el backend de QA en Cloud Run.** No es una copia
> privada. Al renombrar la tabla, el servicio `munify-api-qa` —que corre el código
> anterior, el que busca `contactos`— se quedó apuntando a una tabla inexistente: todo
> Tesorería en `qa.munify.com.ar` dejó de funcionar mientras duró.
>
> El gate **no puede detectar esto**: corre contra un backend local que sí tiene el código
> nuevo. Da cero y todo parece bien, mientras el ambiente que usa el dueño está roto.
>
> **Por lo tanto el renombre NO es un paso de base de datos: es un cambio código+base que
> se aplica en el mismo momento.** En QA eso significa pushear el backend y esperar a que
> el CD lo publique, con la ventana de indisponibilidad que eso implica. En producción, la
> ventana coordinada del paso 05.

**Estado actual: todo revertido y sano.** La tabla se llama `contactos`, los 5 archivos
volvieron byte a byte desde git, y el gate contra el patrón original vuelve a dar
diferencia cero. Lo que sigue aplicado es sólo la Parte A, que es aditiva y el código viejo
ignora sin enterarse.

**Para re-aplicarlo** (`scripts/migrar_personas_parte_b1.py`, idempotente y con
`--revertir`), la secuencia obligada es: cambiar el código → pushear a `qa` → **confirmar
que el CD publicó la revisión nueva** → recién entonces correr el renombre → gate.
Nunca la base antes que el código.

---

## 6. La pantalla de Personas (paso 04)

**Reemplaza tres listados de gente** que hoy muestran poblaciones distintas:

- `TesoreriaContactos.tsx` (643 líneas) → los 1.263 contactos
- `Empleados.tsx` (1.223 líneas) → la tabla `empleados`, otra gente
- `SueldosEmpleados.tsx` (253 líneas, `ABMPage` legacy, sólo lectura) → contactos tipo
  empleado, colgado abajo de Sueldos

En Merlo de QA hay un "Juan Pérez" en dos de ellas, como dos personas separadas.

**Forma:** una sola pantalla sobre el **kit v3**, con el tipo como filtro y no como
pantalla (píldoras que pasan a combo cuando no entran). La ficha se abre en `SideModal` y
muestra **sólo las secciones que esa persona tiene**: identidad siempre; laboral si es del
personal; económica si cobra; acceso si tiene login. El de mantenimiento que además
factura es **una ficha con dos secciones**, no dos registros.

**KPIs del hero** — las preguntas que hoy no se pueden contestar sin abrir tres pantallas:
cuántas personas hay · cuántas cobran este mes · cuántas trabajan · cuántas sin documento
(47 sobre 1.263 en SPN, que es lo que impide deduplicar) · cuántas parecen repetidas — este
último trae al frente la fusión, hoy escondida en un botón de una sola pantalla.

Es pantalla nueva: va con bloque de diseño antes de codear.

---

## 7. Gotchas

- **Alembic está congelado/desincronizado.** El schema nuevo se levanta con
  `Base.metadata.create_all` (`core/database.py:37`) sobre una DB **vacía**; `create_all`
  crea tablas faltantes pero **no altera existentes**. Autogenerate daría una migración
  monstruosa.
- **QA se puede restaurar de un backup** si se rompe (dicho por el dueño): no hay miedo a
  dañar datos ahí.
- **Colisión de ids:** `empleados.id` y `contactos.id` se solapan (ambos arrancan en 1).
  Cualquier vista unificada debe usar identidad compuesta `(origen, id)`; los formularios
  siguen recibiendo ids nativos.
- **Los 7 empleados semilla de SPN** no deben entrar en la masa salarial de Sueldos o hay
  regresión visible en una pantalla productiva.
- **Vedado siempre:** escribir en la base de producción y promover qa→prod. Eso es de Infra.

---

## 8. Qué falta decidir

- Si las columnas `*_contacto_id` se renombran a `*_persona_id` o quedan como están
  (cosmética; no afecta datos).
- La tipificación de "otro intendente" / referente institucional: entra como un tipo que no
  cobra, pero conviene fijar el criterio para que Personas no se vuelva una agenda de todo.
