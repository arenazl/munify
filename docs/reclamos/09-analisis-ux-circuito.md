# Análisis de consistencia UX del circuito del reclamo

> **Pasada fina de micro-UX** (2026-07-04), complementa el análisis funcional
> [01-analisis-funcional.md](01-analisis-funcional.md). Mientras el doc 01 mira flujo,
> comunicación y estados, ESTE mira **interacción**: botoneras duplicadas, pérdida de
> contexto de navegación, la misma transición con reglas distintas según dónde la toques,
> y dead-ends. Barrido de 4 dimensiones (matriz de botoneras, pérdida de contexto, estados
> intermedios, circuito del vecino): **49 hallazgos con evidencia archivo:línea**.
>
> **Nota de método:** la fase de verificación adversarial NO llegó a correr (se agotó el
> límite del modelo). Los hallazgos tienen evidencia archivo:línea real pero NO pasaron el
> segundo par de ojos escéptico como los del doc 01. Antes de ejecutar un fix, **reproducir
> el recorrido leyendo el código citado** (las líneas son del commit `705a71d`, verificar con
> grep). Los que se solapan con hallazgos ya verificados del doc 01 (bug de firma de
> notificaciones, deep links a /demo, estados legacy) se consideran confirmados.
>
> **Este doc es insumo de F2 (menú/puentes/deep-links) y F3 (cohesión — SSoT de estados,
> una sola vista de detalle), y varios ítems son bugs de F0.** No es una fase nueva: son
> tareas para repartir entre las fases existentes (ver §7).

## Los dos ejemplos del dueño — confirmados en código

**(1) Doble botonera para avanzar de etapa.** Confirmado, y es sistémico: el circuito tiene
**4 superficies de transición** (footer del Sheet de `Reclamos.tsx`, paneles internos del
mismo Sheet, dropdown de `ReclamoDetalle.tsx`, drag del `Tablero.tsx`) que pegan a **dos
familias de endpoints con reglas opuestas**: los POST dedicados (`/iniciar`, `/resolver`,
`/confirmar`, `/devolver`, `/reasignar` — con datos obligatorios, roles y notificaciones) y
el PATCH genérico (matriz `reclamos.py:545-555`, sin datos obligatorios, notificación rota).
La misma transición existe en 2-3 controles con validación, datos exigidos, rol permitido,
estado destino y notificación **distintos según cuál toques**. El caso más grave: desde
`pendiente_confirmacion` el MISMO reclamo termina en `resuelto` (botón "Confirmar
Resolución") o en `finalizado` (dropdown de estado) según el control — con el vecino
recibiendo o no el link de calificación.

**(2) Ver el historial te saca de la edición y no vuelve.** Confirmado literal: el botón
"Historial" del Sheet ejecuta `closeSheet()` + `navigate('/gestion/reclamos/{id}')`
(`Reclamos.tsx:3918-3922`). En `ReclamoDetalle` el "Volver" es un Link **hardcodeado** a la
lista (`ReclamoDetalle.tsx:396`), no `navigate(-1)`. Al volver, `Reclamos` remonta de cero:
no existe `?abrir={id}` (los searchParams solo manejan 'crear'/'categoria', `:713-736`), los
filtros/búsqueda/scroll son `useState` volátil, y la descripción tipeada se perdió
(`openViewSheet` resetea, `:1296`). **Lo más irónico:** el Sheet YA descarga el historial en
cada apertura (`:1304-1313`) pero NUNCA lo renderiza — se paga el fetch y te expulsan igual.
El Sheet del vecino en `MisReclamos` sí muestra el timeline inline (`:540-566`): el vecino
tiene mejor UX de historial que el supervisor que gestiona.

## 1. Familia "doble/triple botonera" (misma acción, controles distintos)

| # | Sev | Qué le pasa al usuario | Evidencia |
|---|---|---|---|
| 1.1 | **CRÍT** | En `pendiente_confirmacion` el Sheet de gestión no tiene NINGÚN botón: solo un textarea "obligatorio para cambiar de estado" sin nada que apretar. Los gates son `canAsignar=nuevo`, `canProcesar=recibido/asignado`, `canFinalizar=en_curso` y ese estado no matchea ninguno. Las únicas acciones (Confirmar/Devolver) viven escondidas en ReclamoDetalle, a la que solo se llega por "Historial" (que cierra el Sheet). Ídem el legacy `en_proceso`. | `Reclamos.tsx:3958-3983`, `ReclamoDetalle.tsx:941-959` |
| 1.2 | **CRÍT** | El dropdown de estado de ReclamoDetalle ofrece **siempre los 10 estados** (incluidos legacy) sin cruzar con transiciones válidas: 4 opciones fallan SIEMPRE con 400, y el catch muestra "Error al cambiar el estado" genérico tragándose el detail del backend que sí explica por qué. | `ReclamoDetalle.tsx:440-461, 264-267` |
| 1.3 | **ALTA** | Confirmar un trabajo: botón "Confirmar Resolución" → `/confirmar` → RESUELTO + link de calificación; dropdown "Finalizado" → PATCH → FINALIZADO sin link y con notif rota. Dos controles, misma pantalla, misma intención, resultados distintos. | `ReclamoDetalle.tsx:942-950` vs `:440-461` |
| 1.4 | **ALTA** | La misma transición exige datos distintos por superficie: `en_curso→finalizado` por el Sheet obliga resolución escrita y da puntos de gamificación (`/resolver`); por drag del Tablero o dropdown no exige nada y no graba resolución (PATCH). El kanban es un **bypass de todas las validaciones de negocio**. | `Reclamos.tsx:4098`, `Tablero.tsx:150`, `reclamos.py:1595-1700` |
| 1.5 | **ALTA** | Tres caminos de "reabrir" con tres destinos: "Reabrir caso" → en_curso; "Reasignar a otro empleado" → RECIBIDO **borrando la resolución en silencio** (el título no lo anuncia); dropdown → en_curso. Y "Reasignar" significa otra cosa en el footer de estado `nuevo` (cambia dependencia). | `Reclamos.tsx:4222-4267`, `reclamos.py:2425-2432` |
| 1.6 | **ALTA** | Dos campos de comentario simultáneos para "Recibir": el panel "Tiempo estimado" tiene un textarea `Comentario *` (obligatorio, `comentarioAsignacion`) que `handleRecibir` **nunca lee ni envía**; el footer tiene otro (`descripcionInicio`) que es el que cuenta. El usuario llena el de arriba, el botón sigue deshabilitado. | `Reclamos.tsx:3436-3453` vs `:1418` |
| 1.7 | **MEDIA** | "Rechazar" del footer solo hace `setMotivoRechazo('otro')`, que monta el panel como último bloque del body scrolleable: si estás arriba, el click no produce cambio visible (parece roto). El submit real está en el panel con un `<select>` nativo (vetado). Mientras, el footer sigue con la botonera original activa. | `Reclamos.tsx:4002,4031,4060,4136` → `:3811-3864` |
| 1.8 | **MEDIA** | Patrón de commit inconsistente en el mismo Sheet: asignar empleado/OT se ejecuta **al instante en el onChange** (un click exploratorio ya asignó, con fecha hoy/hora 09:00; "+ Nueva OT" crea una OT real al toque), mientras a 10 cm todas las transiciones exigen textarea + botón + a veces modal. | `Reclamos.tsx:1502-1526` |
| 1.9 | **BAJA** | El mismo verbo cambia de significado: "Finalizar" pega a `/resolver`, el push dice "Resuelto", el footer muestra "✓ Finalizado" para el estado resuelto; "Recibir" y "Asignar" ejecutan el MISMO `/asignar`; el toast de "En Curso" dice "en proceso" (estado legacy). | `Reclamos.tsx:4106,1774,1738`, `ReclamoCard.tsx:25,33` |

**Fix raíz de la familia:** una matriz de transiciones ÚNICA en `lib/enums/` (hoy vive
duplicada e incompleta en `Tablero.tsx:66-79`, `lib/estadoConfig.ts` y la del backend
`reclamos.py:545-555`), consumida por las 4 superficies; y la regla **"una transición = un
endpoint"** (el dedicado cuando existe, nunca el PATCH crudo desde la UI). El dropdown de
ReclamoDetalle y el drag del Tablero deben abrir el mismo mini-form que el Sheet para las
transiciones que exigen datos.

## 2. Familia "pérdida de contexto de navegación"

| # | Sev | Qué le pasa al usuario | Evidencia |
|---|---|---|---|
| 2.1 | **CRÍT** | Dashboard admin: click en un reclamo urgente hace `window.location.href = '/reclamos/{id}'` (ruta inexistente) → full reload → catch-all → **el admin logueado aparece en /demo**. Las 5 cards del Dashboard comparten el onClick. | `Dashboard.tsx:1655`, `routes.tsx:443` |
| 2.2 | **ALTA** | (Ejemplo 2 del dueño) "Historial" cierra el Sheet, navega al detalle, y "Volver" te deja en la lista virgen con la descripción tipeada perdida — teniendo el historial ya descargado sin renderizar. | `Reclamos.tsx:3918-3922, 1304-1313`, `ReclamoDetalle.tsx:396` |
| 2.3 | **ALTA** | Volver a Reclamos = lista virgen: filtros, búsqueda, orden, página y scroll son `useState` puro. Revisar el historial de 5 reclamos filtrados = rehacer el filtrado 5 veces (+ re-fetch por el infinite scroll). | `Reclamos.tsx:149-183` |
| 2.4 | **ALTA** | Los deep links del gestor (campanita, push, WhatsApp) aterrizan en ReclamoDetalle — la superficie SIN asignación, SIN vínculo OT, con cambio de estado de comentario opcional — empujando al supervisor a la pantalla con menos reglas. El Sheet no es direccionable por URL. | `NotificacionesDropdown.tsx:120-123`, `reclamos.py:1562,1693` |
| 2.5 | **ALTA** | El wizard de crear descarta TODO con un click en el backdrop o Escape, sin confirmación; en la página del vecino además te navega afuera. Un operador de mostrador que cargó un reclamo telefónico completo lo pierde con un misclick. | `WizardModal.tsx:676`, `CrearReclamoWizard.tsx:184-199` |
| 2.6 | **ALTA** | En mobile, ReclamoDetalle no tiene botón de volver (el backLink es `hidden sm:flex`). Vecino/supervisor que toca una push en el celu aterriza sin flecha de salida; en PWA standalone puede quedar encerrado. | `StickyPageHeader.tsx:197`, `ReclamoDetalle.tsx` |
| 2.7 | **MEDIA** | El "Volver" de ReclamoDetalle miente sobre el origen: siempre lleva a la lista aunque vengas de Tablero, Planificación, Dashboard o una notificación (backLink hardcodeado + Link push, no `navigate(-1)`). | `ReclamoDetalle.tsx:396`, `Tablero.tsx:398`, `Planificacion.tsx:739` |
| 2.8 | **MEDIA** | El Sheet de gestión se cierra con click en el backdrop y borra la descripción obligatoria tipeada (mismo patrón del wizard, en la superficie donde el gestor pasa el 90% del tiempo). | `Sheet.tsx:81-94`, `Reclamos.tsx:1296` |
| 2.9 | **MEDIA** | El sidebar de detalle del Mapa es un callejón sin salida: muestra todo el reclamo pero su único botón es la X — sin "Gestionar" ni link. El supervisor tiene que memorizar el #id e ir a buscarlo. | `Mapa.tsx:1134-1311` |
| 2.10 | **MEDIA** | El service worker hace `client.navigate()` sobre la ventana activa al tocar una push: si estabas a mitad del wizard o con el Sheet abierto, te navega y perdés todo, sin preguntar. | `sw.js:77-80` |

**Fix raíz de la familia:** hacer el **Sheet direccionable por URL** (`?abrir={id}` — el
patrón ya existe y funciona en `OrdenesTrabajo.tsx:158-168`), apuntar TODOS los deep links de
gestión ahí, **renderizar el timeline inline en el Sheet** (fetch y estado ya existen;
extraer el componente de MisReclamos a `components/ui/` y compartirlo), persistir filtros en
la URL (URL-as-state, patrón de `web/patterns.md`), y cambiar los `window.location.href` por
`navigate()`.

## 3. Familia "estado intermedio sin superficie propia" (pendiente_confirmacion y feedback)

| # | Sev | Qué le pasa al usuario | Evidencia |
|---|---|---|---|
| 3.1 | **CRÍT** | La cola "para confirmar" no existe en ninguna superficie: la pill "En curso" los cuenta pero el filtro exact-match los excluye (contador 12, lista 9); la vista guiada los mete en "Nuevos para tomar" (le dice al supervisor que TOME un reclamo ya terminado); el Tablero no tiene columna → desaparecen. La notificación in-app existe pero no hay dónde ver la cola. | `Reclamos.tsx:4643,4288-4343`, `Tablero.tsx:22-63` |
| 3.2 | **ALTA** | Ciclo "sigue el problema" → Reabrir → re-finalizar: ningún endpoint resetea `confirmado_vecino`, así que el vecino abre su reclamo re-cerrado y el bloque "¿Se solucionó?" muestra su viejo "sigue el problema" **sin botones** — no puede validar el retrabajo ni calificar. Y para el supervisor queda clavado en la capa roja del inbox para siempre. | `reclamos.py:2424-2432`, `MisReclamos.tsx:397-427` |
| 3.3 | **ALTA** | Doble recorrido de recepción: un `nuevo` (SalesBot) muestra footer "Recibir" + panel de dependencia; un `recibido` muestra "En Curso". Dos ceremonias para el mismo caso ("me llegó un reclamo"), con el campo `Comentario *` muerto del 1.6. | `Reclamos.tsx:3962,4045`, `salesbot.py:681` |
| 3.4 | **ALTA** | POSPUESTO: "Retomar" sin `.catch` (si falla, no pasa nada visible); Rechazar inaccesible desde el Sheet pero permitido arrastrando en el Tablero (cerrando sin resolución); la columna "Pospuestos" del kanban nace vacía por el filtro default de 48h sobre `created_at`. | `Reclamos.tsx:4167,4164-4188`, `Tablero.tsx:70,97` |
| 3.5 | **ALTA** | Confirmar manda a RESUELTO (legacy): desaparece del Tablero (no hay columna) y la pill "Finalizados" lo cuenta pero el filtro exact-match no lo lista. → alineado con la decisión **D5** (unificar cierre en FINALIZADO). | `reclamos.py:1737`, `Reclamos.tsx:4644` |
| 3.6 | **MEDIA** | El Tablero invisibiliza 4 estados (nuevo/asignado/pendiente_confirmacion/resuelto) y le niega el drag al empleado que el backend SÍ autoriza — mientras le da el botón que el backend le rechaza (403 de /iniciar). | `Tablero.tsx:22-63,190`, `reclamos.py:519` |
| 3.7 | **MEDIA** | RECHAZADO se revive solo con "Reasignar a otro empleado" (copy que habla de rotación de personal); al revivirlo el panel rojo "Motivo de Rechazo" sigue mostrándose (condición no mira estado) y el vecino ve el motivo RAW en snake_case ("no_competencia") por falta de labels. | `Reclamos.tsx:3475-3486`, `models/enums.py:25-30` |
| 3.8 | **MEDIA** | Estado sucio entre reclamos: el modo Posponer y su motivo se heredan del reclamo anterior (no se resetean en `openViewSheet`) — un click distraído pospone el reclamo B con el motivo de A. | `Reclamos.tsx:369-370,1292-1302` |
| 3.9 | **MEDIA** | Feedback negativo casi invisible en la vista tabla (la default): un ícono de 12px que comparte glifo con "actividad reciente", diferenciado solo por color. 5 disputas en pantalla pueden pasar desapercibidas. | `Reclamos.tsx:3138-3160`, `ReclamoCard.tsx:245-268` |
| 3.10 | **MEDIA** | "Reasignar a otro empleado" desde finalizado/resuelto borra la resolución y el ConfirmModal no lo advierte; el vecino que veía el panel verde "Resolución" lo pierde sin notificación. | `Reclamos.tsx:4253,1548`, `reclamos.py:2430-2432` |
| 3.11 | **BAJA** | `pendiente_confirmacion` se clasifica distinto en cada superficie (en curso en KPIs, resuelto en el análisis del Mapa, "nuevo para tomar" en la vista guiada, invisible en Tablero) y para el vecino es un "Pendiente" que sugiere que ÉL debe hacer algo cuando espera al supervisor. | `estadoConfig.ts:100`, `mapaUtils.ts:29`, `ReclamoCard.tsx:32` |

## 4. Familia "circuito del vecino" (fricciones de interacción)

| # | Sev | Qué le pasa al usuario | Evidencia |
|---|---|---|---|
| 4.1 | **CRÍT** | Coordenadas viejas pegadas: si el vecino edita la dirección después de elegir una sugerencia, el reclamo se crea con la dirección nueva pero las coords viejas → la cuadrilla va al lugar equivocado. El componente nullea las coords a propósito; el handler las revive con `?? prev.latitud`. Efecto colateral: la X "Borrar geolocalización" no hace nada. | `CrearReclamoWizard.tsx:759-765`, `DireccionAutocomplete.tsx:365-368` |
| 4.2 | **ALTA** | El wizard descarta todo sin confirmación (click afuera, ESC, o el "←" mobile que se lee como "paso anterior" pero ejecuta onClose). Conviven dos "volver" con semántica opuesta. | `WizardModal.tsx:346-368,676`, `CrearReclamoWizard.tsx:184-199` |
| 4.3 | **ALTA** | Re-calificación fantasma: en reclamos FINALIZADO (flujo activo) nunca se consulta la calificación existente (solo para el legacy 'resuelto') → el botón "Calificar" reaparece y el segundo envío muere con 400. No hay forma de corregir una calificación (backend sin PUT). | `MisReclamos.tsx:104-116`, `calificaciones.py:80-85` |
| 4.4 | **ALTA** | La recomendación "Nuevo reclamo" de mi-panel apunta a `/gestion/nuevo-reclamo` (ruta inexistente) → catch-all → **el vecino logueado cae en /demo**. La de "Verificá tu identidad" apunta a la misma página donde está la card. | `vecino.py:260`, `routes.tsx:443` |
| 4.5 | **ALTA** | Se le pide al vecino confirmar "¿Se solucionó?" **sin mostrarle ninguna foto** — ni la evidencia de resolución del muni ni la que él mismo subió (que sí aparece en la card). Y los textos "podés subirla después" prometen algo imposible: no hay superficie del vecino para subir fotos post-creación. | `MisReclamos.tsx:299-651`, `CrearReclamoWizard.tsx:471` |
| 4.6 | **ALTA** | Confirmar/calificar es indescubrible: sin badge (el contador del footer cuenta reclamos ACTIVOS donde no hay nada que hacer y EXCLUYE los finalizados que sí esperan gesto), sin marcador en la card, y las recomendaciones/filas de mi-panel llevan a la lista genérica, no al reclamo. Camino hasta calificar: 7-8 taps, dos gestos, dos cajas de comentario. | `vecino.py:52-65`, `MisReclamos.tsx:390`, `DashboardVecino.tsx:868` |
| 4.7 | **MEDIA** | Contadores de mi-panel cuentan solo estados legacy: "Resueltos" da 0 con 5 finalizados, "Pendientes" nunca baja, el empty state dice "Todos tus reclamos fueron resueltos" a quien nunca creó ninguno. | `DashboardVecino.tsx:238-278` |
| 4.8 | **MEDIA** | CTAs muertos y datos inventados en mi-panel: "Ver todas"/"Leer más" sin handler, 4 stat-cards con cursor-pointer sin onClick, y un modal con tendencias "+12%", gráficos y distribución de estrellas **fake presentados como reales** (viola regla dura #11 global). | `DashboardVecino.tsx:490-712` |
| 4.9 | **MEDIA** | Título/descripción se congelan en el PRIMER texto tipeado: el vecino escribe "no anda la luz", se corrige a "cayó un árbol", la categoría se actualiza pero el título queda "no anda la luz" (`prev.titulo || texto`). El supervisor recibe un reclamo incoherente. | `CrearReclamoWizard.tsx:353-401` |
| 4.10 | **MEDIA** | El vecino no puede corregir su confirmación aunque el backend lo permite explícitamente (los dos botones pulgar están pegados; apenas confirma, la UI queda read-only sin forma de cambiar). | `MisReclamos.tsx:397-426`, `reclamos.py:2491-2499` |
| 4.11 | **BAJA** | Comentarios de confirmación/calificación se pierden con un tap en el backdrop (misclick frecuente con el panel a 32rem). "Pend. Confirmación" visible al vecino sin acción posible. Cancelar el wizard siempre aterriza en Mis Reclamos, no de donde venías. | `MisReclamos.tsx:207-215`, `Sheet.tsx:94`, `NuevoReclamoPage.tsx:10-13` |

## 5. Optimistic updates que mienten (transversal)

6 handlers del footer (`handleRecibir`, `handleAsignar`, `handleIniciar`, `handleFinalizar`,
`handleRechazar`, `handlePosponer`) hacen update optimista + `closeSheet()` + toast de éxito
**ANTES del await** (`Reclamos.tsx:1401-1827`). Si el backend rechaza (403 de rol, 400 por
carrera de estados), el usuario ya vio "asignado correctamente", el Sheet se cerró y lo
tipeado se perdió. Caso agravado: el empleado toca "Finalizar" → toast "Reclamo finalizado",
pero el backend lo pone en `pendiente_confirmacion` → el fetch posterior lo "des-finaliza"
sin explicación. **Fix:** patrón único — deshabilitar botón + spinner, esperar respuesta, y
recién ahí cerrar y toastear con el estado REAL devuelto.

## 6. Balance

De 49 hallazgos: **7 críticos, 22 altos, 16 medios, 4 bajos.** La causa raíz no es una
pantalla mala sino **la ausencia de tres piezas compartidas**:

1. **Una matriz de transiciones única** (hoy hay 3-4 copias divergentes) → mata la familia §1.
2. **El Sheet direccionable por URL + timeline inline** (el patrón ya existe en OT) → mata la
   familia §2 y los deep-links del §3.
3. **Un SSoT de estados con labels, colores Y verbos de acción** (`lib/enums/reclamo.ts`, ya
   planificado en F3) → mata la incoherencia semántica del §3.11 y §1.9.

Con esas tres piezas, ~30 de los 49 hallazgos se resuelven de raíz. El resto son fixes
puntuales (optimistic updates, coords pegadas, CTAs muertos).

## 7. Reparto a las fases existentes (no es una fase nueva)

| Bucket | Hallazgos | Fase |
|---|---|---|
| Bugs puros / seguridad (coords pegadas, links a /demo, optimistic que mienten, calificación duplicada) | 4.1, 4.3, 4.4, 2.1, §5 | **F0** |
| Comunicación / reset de feedback / cierre unificado | 3.2, 3.5, 3.7, 3.10 | **F1** (+ D5) |
| Deep-links + Sheet direccionable + timeline inline + mobile back | 2.2, 2.4, 2.6, 2.7, 2.9, 2.10, 1.1 (acción en el Sheet) | **F2** |
| Matriz de transiciones única + SSoT de estados/verbos + una vista de detalle | 1.1-1.5, 1.9, 3.1, 3.6, 3.11, 2.3, 2.8 | **F3** |
| Estados legacy (doble recepción, nuevo→recibido) | 3.3, 3.4 | **F5** |
| Circuito del vecino (badge de confirmar, fotos en el Sheet, CTAs muertos, wizard dirty-guard) | 4.2, 4.5-4.11, 2.5 | **F1/F2** (UX del vecino) |

**Recomendación:** al abrir F3, arrancar por las tres piezas compartidas del §6 — son el
mayor retorno por línea tocada de todo el roadmap de reclamos. Y sumar a cada fase su columna
de esta tabla en vez de tratar esto como trabajo separado.
