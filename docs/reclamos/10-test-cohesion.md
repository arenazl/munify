# Test integral de cohesión del circuito Reclamos / OT / Inventario

> **Barrido de costuras entre módulos** (2026-07-16), para evaluar si el circuito
> completo Reclamos → Orden de Trabajo → Inventario → Notificaciones → vuelta al
> vecino **se comunica bien y tiene sentido** de cara a presentárselo a **General
> San Martín (muni 145)**.
>
> **Qué es esto y en qué se diferencia de los docs 01 y 09:** el
> [01-analisis-funcional.md](01-analisis-funcional.md) miró flujo/comunicación/estados
> y el [09-analisis-ux-circuito.md](09-analisis-ux-circuito.md) miró interacción — ambos
> **dentro** de reclamos. Este mira las **fronteras entre módulos**: qué pasa cuando el
> reclamo le habla a la OT, la OT al inventario, el inventario a la caja de stock, y todo
> eso de vuelta al vecino. Es el test de cohesión que quedó pendiente después de ejecutar
> F0–F3 + OT universal, y **nunca se había corrido**.
>
> **Método:** barrido multi-agente de **solo lectura** (26 agentes, ~45 min, 0 escrituras
> en código). Dos capas: (1) **re-verificación** de los 94 hallazgos de los docs 01 y 09
> contra el código ACTUAL de `qa` — cuáles arregló F0–F3 y cuáles siguen vivos; (2)
> **auditoría de 5 costuras** nunca revisadas, con un **pase adversarial** por cada hallazgo
> CRÍTICO/ALTO (un verificador independiente intenta refutarlo leyendo el código — el paso
> que le faltó al doc 09). Toda afirmación tiene evidencia `archivo:línea` real.
>
> **Alcance:** documentación. No se tocó una sola línea de la app.

---

## 0. Balance ejecutivo (leer esto primero)

El circuito **tiene sentido y el esqueleto está sano**: la OT universal está bien
costurada, el inventario cierra bien (activos se liberan, stock se descuenta una vez), la
matriz única de estados ya existe y la comunicación interna del muni mejoró muchísimo con
F0–F3. **La cohesión REAL entre módulos funciona en el 80% de los caminos.**

Pero el test destapó **1 CRÍTICO de seguridad** y **15 ALTAS de costura** que antes nadie
había mirado, más una deuda legacy conocida que sigue viva. Lo que importa para San Martín:

- **1 bug es BLOQUEANTE absoluto** (seguridad, no cosmético): la **calificación pública sin
  token** filtra datos personales de vecinos de CUALQUIER municipio y permite calificar sin
  autenticación. Esto se arregla SÍ o SÍ antes de mostrar el producto a nadie.
- **3 costuras rotas degradan la demo del canal estrella** (WhatsApp/SalesBot → vecino): el
  reclamo por WhatsApp entra mudo, en estado legacy, y el vecino nunca recibe la vuelta.
- **~6 ALTAS son "se descubre en la cancha"**: doble despacho de cuadrillas, planificación
  ciega al trabajo de cuadrillas, asignaciones sin aviso. No rompen datos, pero se notan.

**Veredicto de una línea:** el modelo es correcto y presentable, pero **hay 1 fix de
seguridad no negociable + un puñado de costuras de comunicación** que conviene cerrar antes
de la demo a San Martín. Detalle abajo.

---

## 1. Estado de los 94 hallazgos ya documentados (docs 01 + 09)

Re-verificados contra el código actual de `qa`:

| Estado | Cantidad | Qué significa |
|---|---|---|
| **ARREGLADO** | 32 | F0–F3 lo cerró de verdad (verificado en código, no asumido del commit) |
| **VIVO** | 37 | Sigue igual que cuando se documentó |
| **PARCIAL** | 25 | Se arregló a medias (lo grave sí, un residuo no) |
| NO_VERIFICABLE | 0 | — |

**Lo que F0–F3 SÍ cerró bien** (muestra de los 32 arreglados): la firma rota de
notificaciones push (C1), la creación unificada que nace RECIBIDO con historial coherente
(A-LEG1), la matriz única de transiciones aplicada en todos los endpoints (A-LEG8), el SSoT
de estados consumido por todas las pantallas (C7), los deep-links que ya no caen en /demo
(T-DEEP, 2.1), el módulo OT que dejó de ser mudo (C4, A-COM3), el cierre unificado en
FINALIZADO (T-CIERRE), la bandeja de campo unificada del empleado (T-BANDEJA), y la
asignación con carga/ausencia REAL (A-PLAN2, A-PLAN3).

**Los VIVOS que más pesan para la demo** (siguen tal cual):

| # | Sev | Qué sigue roto | Evidencia actual |
|---|---|---|---|
| 1.1 | CRÍT | En `pendiente_confirmacion` el Sheet de gestión no tiene NINGÚN botón (los gates canAsignar/canProcesar/canFinalizar no matchean ese estado). Confirmar/Devolver siguen escondidos solo en ReclamoDetalle. | `Reclamos.tsx:4329-4331` |
| 1.2 | CRÍT | El dropdown de estado de ReclamoDetalle sigue ofreciendo los 10 estados sin cruzar con la matriz: ahora con la matriz única F5 fallan MÁS opciones con 400, y el catch se traga el detail. | `ReclamoDetalle.tsx:477,277` |
| 3.1 | CRÍT | La cola "para confirmar" sigue sin superficie: el contador la cuenta pero el filtro exact-match la excluye; el Tablero no tiene columna; la vista guiada la manda a "Nuevos para tomar". | `Reclamos.tsx:5057`, `reclamos.py:748-749` |
| 4.1 | CRÍT | Coords viejas pegadas: si el vecino edita la dirección tras elegir sugerencia, el reclamo se crea con dirección nueva + coords viejas (la cuadrilla va al lugar equivocado). | `CrearReclamoWizard.tsx:754-755` |
| 4.4 | ALTA | La recomendación "Nuevo reclamo" del panel del vecino apunta a `/gestion/nuevo-reclamo` (ruta inexistente) → catch-all → **el vecino logueado cae en /demo**. | `vecino.py:260`, `routes.tsx:453` |
| 4.8 | MEDIA | El panel del vecino sigue con datos **fake presentados como reales** ("+12%", barras mensuales, distribución de estrellas). Viola regla dura #11. | `DashboardVecino.tsx:357-746` |
| A-UI4 | — | `Reclamos.tsx` **creció** de 4.765 a 5.179 líneas, mantiene 74 hex inline y 3 `<select>` nativos. El monolito no se partió. | `Reclamos.tsx:2275,4129,4172` |

**Deuda legacy que sigue viva** (los reclamos nacen RECIBIDO pero varias superficies siguen
mirando el legacy NUEVO): KPI "sin asignar" del Dashboard da siempre 0 (A-LEG4), SLA es ciego
a RECIBIDO (A-LEG6), y SalesBot + el bot de WhatsApp siguen creando en NUEVO (A-LEG2,
A-LEG10). El sistema de plantillas JSON de notificaciones sigue 100% muerto (A-COM8).

---

## 2. Costura Reclamo ↔ OT — **sólida** (1 ALTA)

Esta es la costura mejor resuelta del circuito. La OT universal (D11) está bien:

- **Sin gate per-tenant**: los hooks upsert/cancelar/espejar no ramifican por muni; el flag
  `ordenes_trabajo` solo filtra superficie (`ordenes_trabajo.py:703-787`).
- **Cubre los 3 puntos de asignación** (auto-asignar, PUT /empleado, drag del canvas) y las 3
  desasignaciones cancelan la OT (`reclamos.py:2729-2834`, `planificacion.py:499-500`).
- **Aislamiento del fallo**: la OT corre en un savepoint; si falla, se loguea y se ignora — la
  asignación del reclamo NUNCA se come un 500 por la OT (`ordenes_trabajo.py:590-608`).
- **Espejo en todas las transiciones** con mapa resiliente `.get()` (`ordenes_trabajo.py:582-587`).
- **Prioridad única sin N+1**, mismo ranking en front y back, inyectada en 11 endpoints
  (`services/prioridad.py:34-92`, `prioridad.ts:47-57`).

**El único ALTA confirmado:**

**[ALTA] La prioridad del reclamo es ineditable en el flujo estándar.** El editor "Prioridad
del trabajo" del Sheet edita la única OT viva del reclamo, pero se llena SOLO con
`GET /ordenes-trabajo/reclamo/{id}`, que **excluye las OT implícitas**
(`ordenes_trabajo.py:870`). Como el caso normal (asignar un empleado) crea justamente una OT
implícita, el panel no se renderiza nunca y la prioridad queda clavada en el default de
categoría (nunca URGENTE). El texto "Urgente es un escalón manual del supervisor" promete algo
inalcanzable. *Escenario San Martín:* supervisor quiere escalar un bache a URGENTE ante un
accidente — el panel no aparece. *Workaround pesado:* crear una OT manual vinculada.
`Reclamos.tsx:3688-3692` + `ordenes_trabajo.py:870`.

**Media/baja de esta costura (sin verificar adversarialmente):** cancelar una OT deja los
reclamos EN_CURSO sin nadie; el opt-in de completar OT saltea la matriz de transiciones; race
del correlativo OT-YYYY-NNNN puede dejar reclamos sin OT; el módulo de escalado escribe la
prioridad legacy que la vista guiada no lee; seeds con reclamos asignados sin OT implícita.

---

## 3. Costura OT ↔ Inventario — **sólida** (1 ALTA)

También bien costurada. Lo que funciona (verificado):

- Activo se reserva al vincular (EN_USO + `ocupado_por_ot_id`, con validación de conflicto);
  se **libera al completar Y al cancelar**; el stock se descuenta **solo al completar**
  (`ordenes_trabajo.py:491-555`).
- **Idempotencia**: flag `aplicado` por recurso + guard de estado → un doble click da 400, no
  doble descuento (`ordenes_trabajo.py:546,1168-1170`).
- Stock nunca negativo por cierre (clamp), multi-tenant estricto en todas las queries, no se
  puede borrar un activo tomado, naturaleza inmutable con items. El
  [doc de campo](../campo/01-inventario-y-ordenes-trabajo.md) describe fielmente lo implementado.

**El único ALTA confirmado:**

**[ALTA] Descuento de stock sin atomicidad ni lock: lost-update entre OTs concurrentes.** El
descuento es read-modify-write en Python (`item.stock_actual = max(0, stock - cant)`) sin
`SELECT FOR UPDATE` ni UPDATE atómico — **cero `with_for_update` en todo el backend**. Dos
completar simultáneos leen el mismo stock y pisan el descuento. *Escenario:* OT-A y OT-B con
"Cemento x10" sobre stock 30; ambas se completan casi a la vez → stock final 20 en vez de 10,
se "esfuman" 10 bolsas sin rastro. Corrupción silenciosa del dato central del módulo. Agravante:
el equipo YA usa el patrón correcto (`GET_LOCK` advisory en `turnos_agenda.py:224`) pero no lo
aplicó al stock. Fix acotado: `stock = GREATEST(0, stock - :cant)` atómico.
`ordenes_trabajo.py:553-554`.

**Media/baja:** doble reserva del mismo activo en carrera; no se valida stock suficiente al
planear (el clamp esconde faltantes); `PUT /inventario/items` puede romper la invariante del
activo tomado (solo por API, la UI lo bloquea); sin ge=0 en el schema de stock.

---

## 4. Costura OT ↔ Cuadrillas/Planificación — **la más floja** (5 ALTAS)

Aquí está la mayor concentración de problemas de comunicación. Lo bueno primero: las 3
superficies que asignan cuadrilla convergen en los mismos endpoints, el multi-tenant es sólido,
los permisos de campo respetan la membresía de cuadrilla, y el pool de planificación excluye
bien los reclamos ya cubiertos por OT vigente.

Pero **5 ALTAS confirmadas**, todas de la misma familia (falta de reconciliación y de aviso):

**[ALTA] Una cuadrilla puede tener N OTs solapadas el mismo día/horario — nadie lo valida.**
Ni crear, ni editar, ni asignar OT consultan la agenda de la cuadrilla. `capacidad_maxima`
existe pero es decorativa. *Escenario:* dos OTs para "Cuadrilla Norte" el 20/07 09:00-12:00
pasan sin un warning; la cuadrilla descubre el doble turno en la calle.
`ordenes_trabajo.py:889-1021`.

**[ALTA] Doble cobertura del mismo reclamo: la OT formal no reconcilia con la implícita.** Crear
una OT formal para un reclamo NO cancela su OT implícita vigente ni limpia `Reclamo.empleado_id`.
*Escenario:* reclamo asignado al empleado X (OT implícita, visible en su agenda); otro supervisor
lo canaliza a una OT de la cuadrilla Y → **dos OTs vigentes, X y la cuadrilla Y salen ambos a
hacerlo**. Agravante: completar la OT formal no espeja la implícita, que queda zombie.
`ordenes_trabajo.py:889-936` sin cancelación de implícita.

**[ALTA] Planificación es ciega a las OTs de cuadrilla.** El calendario semanal se arma SOLO
desde `Reclamo.empleado_id + fecha_programada` y las filas son empleados individuales. Un reclamo
canalizado por cuadrilla no tiene `empleado_id` → **es invisible en la única vista de
planificación**. *Escenario:* San Martín programa 5 OTs de cuadrilla para la semana; el supervisor
abre Planificación y ve todo "Sin tareas" — tiene que cruzarlo a mano con la lista de Órdenes.
Agravante: la carga por empleado tampoco cuenta las OTs de cuadrilla → doble-booking real de la
persona. `planificacion.py:210-245`.

**[ALTA] `PUT /ordenes-trabajo/{id}` es mudo y sin auditoría — y es el path que usan TODAS las
pantallas.** Editar una OT y cambiarle la cuadrilla no notifica a nadie ni deja fila en el
historial. El único path que sí notifica (`POST /{id}/asignar`) **no lo llama ninguna pantalla**
(0 call sites). `ordenes_trabajo.py:939-980`.

**[ALTA] Vincular un reclamo a una OT existente pisa el responsable de TODA la OT en silencio.**
El combo manda al PUT la cuadrilla elegida para el reclamo actual, sobreescribiéndola para todos
los reclamos previos de esa OT, sin confirmación ni aviso. *Escenario:* OT de la cuadrilla A con
3 reclamos; sumás un 4to eligiendo cuadrilla B → la orden entera pasa a B, A no se entera.
`Reclamos.tsx:1690-1714` + `ordenes_trabajo.py:958-960`.

**Media/baja:** 3 reglas de estado distintas para "asignar empleado" (Sheet/auto/Planificación);
el PUT puede dejar una OT "asignada" sin responsable; combo de cuadrilla sin salida con el módulo
OT apagado; se puede vincular un reclamo cerrado a una OT; el `/asignar` que notifica es código
muerto en la UI.

---

## 5. Costura Notificaciones end-to-end — **funciona pero con fugas** (5 ALTAS + 1 CRÍT-origen)

La base es buena: creación notifica a vecino+supervisores+email, el cierre invita a calificar por
los 3 caminos, el rechazo dejó de ser mudo, la infra de push es robusta (sin VAPID no explota,
404/410 desactivan suscripción), los estados desconocidos degradan graceful, y el multi-tenant se
respeta en los fan-outs. Pero:

**[ALTA, era CRÍT] Notificaciones in-app creadas después del último commit se PIERDEN (rollback
silencioso).** `get_db` cierra la sesión sin commit; `crear_notificacion_inapp` solo hace flush.
Tres endpoints commitean el cambio de estado ANTES de notificar y nunca commitean después
(`/resolver` rama empleado, `/devolver` con empleado, `/confirmar-vecino` "problema persiste"). El
único salvavidas accidental es que un envío WhatsApp posterior commitea de rebote. *Escenario:* muni
sin WhatsApp; empleado resuelve un bache → estado a pendiente_confirmacion (commiteado), pero las
in-app a supervisores y vecino se **descartan** al cerrar la sesión. Nadie ve nada en la campanita.
`core/database.py:28-33` + `reclamos.py:1915,1928-1947`.

**[ALTA] La campanita NO navega: `handleNotificationClick` está definido pero jamás conectado.** El
onClick real de cada fila solo marca como leída. La notificación cuyo texto dice literal "Tocá para
calificar la atención recibida" **no lleva a ningún lado**; el deep-link solo funciona por web-push
(requiere permiso otorgado). *Escenario:* vecino sin permiso de push (típico iOS/primer uso) toca la
campanita y nunca llega a /calificar. Blast radius: todos los deep-links in-app, incluido el de pago
de trámites. `NotificacionesDropdown.tsx:102-126` vs `:280`.

**[ALTA] WhatsApp del ciclo de vida del vecino es dead code.** `enviar_notificacion_whatsapp` (con
las plantillas recibido/asignado/resuelto) **no tiene ningún caller**. Los toggles
`notificar_reclamo_recibido`/`_resuelto` que la pantalla de admin ofrece y guarda **no gatean nada
automático**. *Escenario:* San Martín activa esos toggles, hace la demo, crean y finalizan un
reclamo → al vecino no le llega ningún WhatsApp. El cliente ve toggles que no hacen nada.
`reclamos.py:238-381` (sin callers) + `WhatsAppConfig.tsx:24-27`.

**[ALTA] Asignación desde Planificación (canvas) es push-only.** `POST /planificacion/asignar-fecha`
notifica solo con `notificar_asignacion_empleado`, que **no crea notificación en BD** — solo push
efímero. Sin campanita para el empleado, sin aviso al vecino. *Escenario:* supervisor arma la semana
arrastrando 10 reclamos; el empleado sin permiso de push abre la app con la campanita vacía.
`planificacion.py:504-515` + `push_service.py:372-385`.

**[BAJA, era ALTA] Empleado que termina vía kanban deja el reclamo sin avisar al supervisor.** La
asimetría de código es real, PERO el vector está **bloqueado en el front** (el empleado no puede
arrastrar en el Tablero: `canDrag` es admin/supervisor). Solo explotable por API directa — trampa
latente, no bug activo. `reclamos.py:886-887` vs `Tablero.tsx:154`.

**Media/baja:** desasignaciones mudas (el empleado no se entera de que perdió el trabajo); `/asignar`
e `/iniciar` push-only sin campanita; `notificar_supervisores` hace fan-out a TODOS los supervisores
del muni sin filtrar por dependencia (ruido en un muni grande como San Martín); el email de ventanilla
va al operador, no al vecino; SLA vencido por push es dead code; iconos de campanita que nunca matchean;
links de trámites que caen a /demo.

**Nota sobre el "leak de ausencias" (REFUTADO):** el pase adversarial descartó un hallazgo que parecía
CRÍTICO (leak cross-tenant de licencias médicas en `/planificacion/semanal`). Es **código muerto**: el
`import` apunta a un módulo que no existe, el `except: pass` lo traga y `ausencias` siempre viaja vacío.
Es una **mina latente** (si alguien corrige el import, el leak se activa tal cual) pero hoy no dispara.
`planificacion.py:249-288`.

---

## 6. Costura Entradas externas (SalesBot / vecino / mostrador) — **el CRÍTICO vive acá** (3 ALTAS + 1 CRÍT)

Lo bueno: el wizard del vecino y la carga en mostrador usan **el mismo componente y el mismo
endpoint**; la clasificación IA asiste en las dos superficies; los reclamos de terceros usan una
pieza compartida (`resolver_o_crear_vecino`) con bloqueo cross-tenant; el multi-tenant de SalesBot es
correcto (el muni sale del path validado, nunca del payload).

**EL BLOQUEANTE ABSOLUTO:**

**[CRÍTICO] Calificación pública sin token: leak cross-tenant + escritura no autenticada.**
`GET /api/calificaciones/calificar/{reclamo_id}` no exige auth, ni token de un solo uso, ni filtra por
municipio: devuelve **título, descripción, resolución y nombre del creador de cualquier reclamo
finalizado de CUALQUIER muni**, iterando IDs secuenciales. El POST idem: cualquiera que adivine un ID
puede plantar la calificación "del vecino". No hay rate limit. Y el ID **es enumerable**: viaja en el
número de seguimiento `REC-XXXXX` que se manda por WhatsApp. *Escenario:* un curioso hace un loop
`GET .../calificar/1..99999` y arma un dataset con nombres y descripciones (con posible
dirección/teléfono/DNI) de vecinos de TODOS los municipios, San Martín incluido. Viola la regla dura
de aislamiento multi-tenant. `calificaciones.py:325-407` + `__init__.py:106`. **Esto se arregla antes
de mostrarle el producto a nadie.**

**Las 3 ALTAS (rompen el canal WhatsApp, el "estrella" de la demo):**

**[ALTA] SalesBot crea el reclamo FUERA del modelo F3: nace en estado legacy NUEVO.** El resto del
sistema nace RECIBIDO. Consecuencia visible: el pill "Recibidos" cuenta los NUEVO pero al clickearlo el
filtro exact-match los excluye → el contador dice 12, la lista muestra 11. `salesbot.py:681` vs
`reclamo_create.py:75`.

**[ALTA] El reclamo de SalesBot entra MUDO: cero notificaciones, cero pipeline.** No dispara push a la
dependencia, ni a supervisores, ni email, ni detección de barrio, ni matching POI, ni gamificación.
*Escenario:* un vecino reporta un caño roto por WhatsApp un sábado a la noche; Obras no recibe nada; el
reclamo espera invisible hasta el lunes con el SLA corriendo desde el sábado. `salesbot.py:671-709`.

**[ALTA] La vuelta al vecino por WhatsApp NO existe.** El cierre y el link de calificación se mandan
SOLO por push+in-app; un vecino ghost (SalesBot o ventanilla) no tiene login ni suscripción push → jamás
recibe "tu reclamo se finalizó, calificalo". Las piezas WhatsApp que lo resolverían existen pero son dead
code. *Escenario:* el reclamo del árbol entrado por WhatsApp se resuelve; el vecino, cuyo único contacto
es el teléfono, nunca se entera. Las métricas de satisfacción del canal WhatsApp quedan estructuralmente
en cero. `push_service.py:264-295` + `reclamos.py:238` (dead code).

**Media/baja:** email de alta al operador (no al vecino) en mostrador; gamificación acredita al operador,
no al vecino; auto-dependencia de SalesBot sin filtro `activo`; `PUT /reclamos/{id}` solo edita NUEVO
(regla invertida: los del wizard nunca son editables, los de SalesBot sí); `reclamo_personas` incompleto
(el creador no tiene fila, los sumados no ven el reclamo); la consulta pública nunca muestra la resolución
(gateada al legacy RESUELTO).

---

## 7. Qué bloquea la demo a San Martín vs qué es deuda tolerable

### Bloqueante (arreglar SÍ o SÍ antes de mostrar)

| # | Costura | Por qué bloquea |
|---|---|---|
| **Calificación pública sin token** (§6) | Entradas | **Seguridad**: leak de datos personales cross-tenant + escritura no autenticada. Único CRÍTICO. No es negociable. |

### Rompe la experiencia del canal que se va a mostrar (fuerte recomendación de cerrar)

| # | Costura | Impacto en la demo |
|---|---|---|
| SalesBot mudo + estado NUEVO (§6) | Entradas | El canal WhatsApp/SalesBot es el diferencial; hoy entra invisible y descoordinado. |
| Vuelta al vecino por WhatsApp inexistente (§6) | Entradas | El vecino nunca recibe el cierre ni el link de calificación → loop incompleto. |
| In-app se pierden por rollback (§5) | Notificaciones | Si San Martín no tiene WhatsApp, los avisos a supervisores desaparecen en silencio. |
| Campanita no navega (§5) | Notificaciones | "Tocá para calificar" no hace nada → tasa de calificación al piso. |
| WhatsApp toggles que no hacen nada (§5) | Notificaciones | El cliente activa opciones que no existen. Mala imagen. |

### Se descubre en la cancha (deuda operativa — cerrar en el orden que dé el tiempo)

Doble despacho de cuadrillas (§4), planificación ciega a OTs de cuadrilla (§4), PUT de OT mudo (§4),
vincular reclamo pisa el responsable (§4), asignación desde Planificación push-only (§5), prioridad
ineditable en flujo estándar (§2), descuento de stock sin lock (§3, importa si hay uso concurrente real).

### Tolerable para la demo (no bloquea, dejar anotado)

Los 37 VIVOS de baja severidad de los docs 01/09 (jerga en pushes, hex inline, monolito sin partir),
la deuda legacy NUEVO/RECIBIDO en Dashboard/SLA, y las ~44 media/baja de costura sin verificar
adversarialmente (que conviene confirmar antes de accionarlas).

---

## 8. Nota de método y confianza

- Los **16 CRÍT/ALTA de costura** pasaron verificación adversarial: un segundo agente intentó
  refutarlos leyendo el código y no pudo (1 fue refutado y sacado, 5 tuvieron la severidad ajustada
  — 1 subió a CRÍT, 4 bajaron). Confianza alta; igual, **reproducir el recorrido leyendo el código
  citado antes de accionar un fix** (las líneas son del commit de `qa` al 2026-07-16).
- Las **~44 media/baja NO pasaron** el pase adversarial (se cortó el fan-out ahí por costo). Tienen
  evidencia `archivo:línea` real pero merecen un segundo par de ojos antes de tocarlas.
- Todo fue solo lectura. Ningún cambio de código salió de este análisis.
- Este doc es insumo de las fases pendientes (F4 despacho, resto de F5) y del hardening de seguridad
  previo a onboarding de un muni nuevo. No es una fase nueva: alimenta las existentes.
