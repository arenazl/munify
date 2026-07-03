# Universo Reclamos · Análisis funcional y hoja de ruta

> **Documento funcional maestro.** Resultado del barrido multi-agente del 2026-07-03
> (49 agentes, 7 dimensiones, verificación adversarial de cada hallazgo grave contra el
> código real: 42 hallazgos graves, 40 confirmados, 2 refutados).
> Los documentos **técnicos por fase** viven en esta misma carpeta (`02-` a `07-`): cada
> uno es autosuficiente para que un agente en frío ejecute su fase sin releer este análisis
> completo. **Las referencias `archivo:línea` corresponden al estado del repo en el commit
> `7aeb780` (2026-07-03)** — antes de editar, verificar con grep que la línea no driftó.

## 1. Qué es el "universo Reclamos"

Todo el circuito operativo del municipio: el **vecino** crea un reclamo → el
**supervisor/admin** lo toma y asigna (empleado directo o crea una **Orden de Trabajo**) →
el **empleado** en campo la avanza → el supervisor cierra → comunicación con el vecino en
el medio (notificaciones, comentarios, confirmación, calificación). Orbitan: Planificación
(canvas semanal), Tablero (kanban), Cuadrillas, Empleados de campo, Inventario, SLA/escalado,
Mapa, Zonas, Dependencias.

**Problema que motivó el análisis:** en una demo se vio el universo disperso en el menú,
pantallas sin cohesión visual, "espacios grises" y flujos que no se sienten una unidad.

## 2. La película completa: dónde se corta el hilo

| Tramo | Estado | Diagnóstico |
|---|---|---|
| Vecino crea (wizard + foto) | OK | Notifica bien (push+in-app+email). Falta: similares/sumarse (backend completo `reclamos.py:2603`, cero UI) |
| Supervisor se entera | Condicional | Solo si la categoría tiene dependencia mapeada. **Sin dependencia = agujero negro**: nadie recibe aviso y la UI no permite encaminarlo (paneles gateados al estado legacy `nuevo`; los reales nacen `recibido`) |
| Supervisor asigna | Ida sí, vuelta no | Desde el Sheet crea/vincula OT sin salir (fluido). Pero el reclamo no muestra su OT (endpoint `porReclamo` sin consumidor) y la OT muestra reclamos como chips sin link |
| Empleado arranca | ROTO | Botón "En Curso" pega a `/iniciar` admin/supervisor-only → 403 con toast optimista previo. Nadie le avisó que tenía trabajo (helper de notificación = dead code) |
| Empleado en campo | Partido | Su bandeja default solo muestra reclamos con `empleado_id` directo — lo canalizado por OT (cuadrilla O empleado) es invisible ahí. Footer móvil = el del VECINO. OT sin estado de bloqueo/pausa, sin fotos, sin consumo real |
| Avance → vecino | ROTO | Bug de firma en `reclamos.py:588,591`: ningún cambio de estado vía PATCH (kanban, detalle, posponer, reabrir) notifica al vecino. Módulo OT 100% mudo (cero notificaciones en todo su ciclo) |
| Cierre | Manual e invisible | Completar OT no cierra reclamos (decisión documentada OK) pero tampoco avisa al supervisor; no existe vista "OTs completadas con reclamos abiertos". Dos estados finales según quién cierra (`finalizado` vs `resuelto` legacy) |
| Vecino disputa / califica | ROTO | "Sigue el problema" no reabre (una notificación one-shot). Link público `/calificar/{id}` exige RESUELTO legacy → roto para el flujo activo. Rechazo no notifica NADA. Las calificaciones no las ve nadie del muni |
| Deep links | ROTOS | Push e in-app del vecino apuntan a `/reclamos/{id}` (ruta inexistente) → catch-all a `/demo` |

## 3. Hallazgos críticos confirmados

1. **Bug de firma de notificaciones** — `reclamos.py:588,591` llama
   `enviar_notificacion_push(db, reclamo, tipo)` contra firma `(reclamo_id: int, tipo: str, ...)`
   (`reclamos.py:188`). El except (234-237) lo traga. Apaga la comunicación de TODO el PATCH
   (Tablero drag, dropdown de ReclamoDetalle:250, reabrir Reclamos.tsx:1586, posponer :1832).
2. **Calificación pública exige RESUELTO legacy** — `calificaciones.py:304,343,238`; el flujo
   activo cierra en FINALIZADO. El endpoint autenticado ya acepta ambos (`:74`).
3. **Reclamo sin dependencia mapeada = agujero negro** — no notifica a nadie
   (`push_service.py:515-517` return 0) y la UI no permite encaminarlo (paneles gateados a
   estado `nuevo`, backend `/asignar` exige NUEVO/ASIGNADO en `reclamos.py:1371`).
4. **Módulo OT 100% mudo** — `ordenes_trabajo.py` no importa ningún servicio de notificación;
   crear/asignar/iniciar/completar/cancelar no avisan a nadie. Iniciar ni deja miga en historial.
5. **El empleado no puede iniciar su reclamo** — 403 + toast optimista de éxito previo
   (Reclamos.tsx:1734-1738).
6. **Multi-tenant roto en escritura** — ~13 endpoints de reclamos sin filtro `municipio_id`
   (PATCH :530, /asignar :1366, /iniciar :1517, /resolver :1590, /confirmar :1721, /devolver
   :1798, /rechazar :1847, /comentario :1888, /upload :1987 sin NINGÚN check, /empleado :2331,
   /reasignar :2413, GET :1051, GET historial :1068 sin permiso alguno). Ídem
   `cuadrillas.py`/`empleados_gestion.py` (get/update/delete por id pelado) y `escalado.py`
   (queries y notificaciones cross-tenant + insert que viola NOT NULL). Contraste:
   `ordenes_trabajo.py` filtra bien en todos lados (`_get_ot` :228).
7. **7 definiciones locales de colores de estado** — no existe `lib/enums/reclamo.ts`.
   "recibido" = cyan en cards, azul en Tablero, índigo en Mapa. Causa raíz de la sensación
   "sin cohesión".

## 4. Hallazgos altos principales (por tema)

**Comunicación:** rechazar no notifica (reclamos.py:1840-1874); asignar empleado no notifica
(helper `notificar_asignacion_empleado` push_service.py:372 = dead code); completar OT no
notifica; "sigue el problema" no reabre ni re-notifica (queda FINALIZADO, reclamos.py:2502;
única persistencia: sigue visible en listado con `confirmado_vecino=False`, :393-399);
calificaciones sin pantalla del lado muni (endpoints `estadisticas`/`ranking` sin consumidor;
ranking backend devuelve `[]` hardcodeado, calificaciones.py:216); canales inconsistentes por
transición (cada una usa una mezcla distinta de push/in-app/WhatsApp/email); WhatsApp del
flujo activo comentado en código (reclamos.py:587,590,1289) con toggles vivos en la pantalla
de config que no hacen nada; sistema de plantillas JSON (22 tipos) 100% muerto.

**Estados legacy incrustados:** los reclamos nacen RECIBIDO (:1191) pero el historial de
creación registra NUEVO (:1254), SalesBot crea en NUEVO (salesbot.py:681), y consumidores
clavados en legacy: sugerencias de asignación (Reclamos.tsx:1316), KPI "sin asignar" del
Dashboard (dashboard.py:831 → siempre 0 para el flujo principal), MiArea (:56-58), SLA
(sla.py:275,295,366), escalado (:153,172). Dos máquinas de validación de transiciones que se
contradicen (matriz del PATCH :545-555 vs precondiciones ad-hoc de cada endpoint). Doble
asignación sin cruce (Reclamo.empleado_id vs OT.empleado_id/cuadrilla_id: Juan y Pedro pueden
tener "el mismo" trabajo sin warning). Bot conversacional WhatsApp crashea
(`EstadoReclamo.nuevo` minúscula inexistente, whatsapp.py:1096).

**Navegación:** universo partido en 4 categorías con 16-23 items de tesorería en el medio;
Empleados/Cuadrillas/Ausencias (la operación viva) enterrados como tiles de Configuración;
MiRendimiento y MiHistorial huérfanas Y rotas para empleado (403); ruta legacy
`/gestion/categorias` zombie; dos pantallas "Empleados" sobre tablas sin FK (campo=`empleados`,
sueldos=`contactos`); footer móvil del gestor ignora el circuito operativo.

**UI:** ranking de peor a mejor — SLA (modal a mano + selects nativos + tabla cruda +
`confirm()` nativo + 22 hex) y Mapa (paleta propia + drawer a mano + colores de categoría
hardcodeados por keyword que ignoran el color de la DB y colapsan categorías nuevas en un
filtro "Otros") ROTAS; Tablero (lenguaje visual de gradientes propio + emoji + default 2 días
+ carga máx 20 reclamos), Reclamos (monolito 4.765 líneas, 80 hex, 3 selects nativos),
Planificación, MisReclamos/ReclamoDetalle (pasteles light hardcodeados que rompen dark)
PARCIALES; **OrdenesTrabajo = la referencia canónica** (0 hex, enums, todo BUILD_GUIDE),
Inventario y Zonas cerca. `ABMSelect` de la propia librería es un `<select>` nativo
disfrazado (ABMPage.tsx:1329-1339). Tres UIs de detalle para el mismo reclamo (Sheet de
Reclamos, Sheet de MisReclamos, página ReclamoDetalle que viola BUILD_GUIDE §7.1).

**Espacios grises de la demo (culpable exacto):** en Planificación, `getCargaColor(0)`
devuelve `'transparent'` (Planificacion.tsx:351) sobre la fila con
`backgroundColor: theme.border` (:640, técnica gap-px) → cada día sin tareas = bloque gris
sólido de 100px. Los tintes de carga también son semitransparentes sobre ese gris.

**Planificación/asignación:** Planificación NO tiene modelo propio — grilla que lee/escribe
sobre `reclamos` (empleado_id, fecha_programada, hora_inicio/fin). Conectada al circuito pero
**ciega a las OTs** (OT programada no aparece; reclamo cubierto por OT figura "Sin asignar" →
doble asignación). Auto-asignar simulado: carga hardcodeada 0 y disponibilidad máxima
(reclamos.py:2175,2195 con comentario stale falso); ausencias y horarios (EmpleadoHorario) no
se consultan en NINGUNA asignación; capacidad_maxima decorativa; dos rulebooks (el canvas
asigna sin validar estado y escribe legacy ASIGNADO; `/desasignar` limpia cualquier reclamo
sin motivo mientras el circuito formal exige `/reasignar` con motivo); reclamo auto-asignado
sin fecha desaparece del canvas; panel de disponibilidad del Sheet = **código zombie
inalcanzable** (~100 líneas, Reclamos.tsx:3618-3710, trigger huérfano handleEmpleadoChange).

## 5. Refutados por la verificación adversarial (no repetir estos diagnósticos)

1. ~~"El puente reclamo→OT no está cableado en la UI"~~ — FALSO: el Sheet de Reclamos crea o
   vincula OT sin salir (`handleVincularOT`, Reclamos.tsx:1502-1540, combo :3342-3354). Lo
   real y menor: el deep-link `?reclamo_id=` de OrdenesTrabajo.tsx:158 está muerto y
   ReclamoDetalle no tiene nada de OT.
2. ~~"El panel de disponibilidad muestra datos falsos al usuario"~~ — impreciso: nunca se
   renderiza; es código muerto inalcanzable. El stub del backend (reclamos.py:2024-2044) sí
   existe.

## 6. Decisiones de producto abiertas (validar con Lucas antes de ejecutar la fase que las toca)

| # | Decisión | Fase | Recomendación del análisis |
|---|---|---|---|
| D1 | Reagrupación del sidebar: ¿C (mínima, solo reorden) ya y B (Reclamos+Campo adyacentes) como destino? ¿Dónde cae Tablero? | F2 | C inmediata, B destino |
| D2 | "Sigue el problema": ¿reabrir automático (FINALIZADO→EN_CURSO) o cola visible de disputados? | F1 | Cola visible + re-notificación (menos invasivo) |
| D3 | Al iniciar una OT, ¿los reclamos vinculados pasan a EN_CURSO automáticamente? | F1 | Sí (con miga en historial) |
| D4 | Al completar una OT, ¿ofrecer "finalizar también los N reclamos" (opt-in) en el modal? | F1 | Sí |
| D5 | Estados `pendiente_confirmacion`/`resuelto`: ¿se mantienen como activos o se migra todo a FINALIZADO? | F5 | Mantener pendiente_confirmacion; unificar cierre final en FINALIZADO |
| D6 | Escalado: ¿revive (multi-tenant + scheduler + pantalla) o se borra? | F0 apaga / F5 decide | Apagar ya, decidir en F5 |
| D7 | Planificación: ¿destino A "Despacho" (el canvas absorbe la asignación) o queda en B "asignación con contexto"? | F4 | B primero; A cuando el dato de disponibilidad sea real |
| D8 | MiRendimiento/MiHistorial: ¿se habilitan para el empleado o se eliminan las rutas? | F2 | Habilitar (pantallas ya hechas) |
| D9 | WhatsApp del flujo activo: ¿reactivar llamadas comentadas respetando toggles, o quitar toggles? | F1 | Reactivar respetando config |
| D10 | Dependencias (jefes de área): ¿operan OT/Tablero/Planificación? Hoy no ven nada de eso | F2 | A confirmar |

## 7. Hoja de ruta (las fases y su lógica)

Cada fase es un documento técnico autosuficiente en esta carpeta. El orden minimiza riesgo:
primero bugs sin decisión de producto, después la comunicación (el dolor central), después
lo visible en demo, al final los rediseños.

| Fase | Doc | Qué resuelve | Depende de |
|---|---|---|---|
| **F0 Hemorragias** | [02-fase-0-hemorragias.md](02-fase-0-hemorragias.md) | Bugs puros + seguridad multi-tenant. Cero decisión de producto | — |
| **F1 Comunicación** | [03-fase-1-comunicacion.md](03-fase-1-comunicacion.md) | El vecino y el empleado se enteran de lo que pasa; OTs dejan de ser mudas; calificaciones visibles | F0 |
| **F2 Menú y puentes** | [04-fase-2-menu-puentes.md](04-fase-2-menu-puentes.md) | Sidebar coherente, cross-links reclamo↔OT, bandeja unificada del empleado, mobile de campo | F0 (D1, D8, D10) |
| **F3 Cohesión visual** | [05-fase-3-cohesion-visual.md](05-fase-3-cohesion-visual.md) | SSoT de colores, gris de Planificación, SLA/Mapa al patrón canónico, detalle único | F0 (ideal post F2) |
| **F4 Despacho** | [06-fase-4-despacho.md](06-fase-4-despacho.md) | Service único de asignación con datos reales; OTs en el canvas; experiencia de campo | F0+F1 (D7) |
| **F5 Máquina de estados** | [07-fase-5-maquina-estados.md](07-fase-5-maquina-estados.md) | Transiciones formales, estados legacy, creación unificada, SLA/escalado vivos | F0+F1 (D5, D6) |

F2 y F3 son independientes entre sí y de F4/F5 — se pueden intercalar según la semana.

## 8. Reglas del repo que TODA fase debe respetar

- Leer `CLAUDE.md` (root) y, si toca UI, `BUILD_GUIDE.md` §5-§7 antes de codear.
- Multi-tenant estricto: toda query filtra `municipio_id == current_user.municipio_id`.
- UI: ModernSelect/DatePicker/Sheet/ConfirmModal — nativos vetados; `useTheme()` — cero hex
  inline; enums en `lib/enums/`; cero emojis (lucide-react).
- Antes de pushear frontend: `cd frontend && npm run build` Y `npx eslint src/ --ext .ts,.tsx`.
- Antes de pushear backend: `pyflakes` sobre los archivos tocados.
- El trabajo termina en `git push origin master` — NUNCA deploy manual (`gcloud`/`netlify deploy`).
  No levantar servers locales. Verificar live contra el OpenAPI de Cloud Run, no asumir por commit.
- Pantalla de referencia canónica del universo: `pages/OrdenesTrabajo.tsx`.
