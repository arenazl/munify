# Fase 4 · Despacho — planificación + asignación con datos reales

> **Para un agente que arranca en frío.** Contexto: [01-analisis-funcional.md](01-analisis-funcional.md)
> §4 (planificación/asignación) y §5 (el panel de disponibilidad es código ZOMBIE, no
> "datos falsos"). **Prerrequisitos: F0 (multi-tenant) y F1 (notificaciones de asignación).**
> Decisión que toca: **D7** — el diseño destino. Recomendación ya validada en el análisis:
> primero "B: asignación con contexto" (datos reales), después evaluar "A: Despacho" (el
> canvas absorbe todo). No unificar pantallas ANTES de tener el dato real.
> Referencias = commit `7aeb780`; verificar con grep.

## Contexto técnico mínimo

- Planificación NO tiene modelo propio: es una grilla semana×empleado que lee/escribe
  DIRECTO sobre `reclamos` (`empleado_id`, `fecha_programada`, `hora_inicio/fin` —
  `models/reclamo.py:57-63`). Endpoints: `backend/api/planificacion.py` (`/semanal` :127,
  `/asignar-fecha` :389, `/desasignar` :357).
- Los 4 puntos que hoy ASIGNAN, cada uno con reglas propias: `PUT /reclamos/{id}/empleado`
  (:2313, exige fecha+hora), `POST /auto-asignar` (:2266, no exige nada), el drag del canvas
  (`planificacion.py:389`, no valida estado, escribe legacy ASIGNADO), y la OT
  (`ordenes_trabajo.py` create/update, no valida disponibilidad).
- Datos que EXISTEN y nadie consulta al asignar: `EmpleadoAusencia`, `EmpleadoHorario`
  (ABM completo en `empleados_gestion.py:282-343`), `capacidad_maxima` (`Empleados.tsx:808`).

## Tareas

### T1. `backend/services/asignacion.py` — las reglas en UN solo lugar
Service único que expone (nombres orientativos):
- `validar_asignacion(reclamo/ot, empleado_id|cuadrilla_id, fecha, hora)` → estados
  editables, ausencia en la fecha (bloquea o warnea — definir con el user), capacidad.
- `carga_de(empleado_id, fecha|rango)` → count real de reclamos activos asignados + OTs
  vigentes (hoy la carga está hardcodeada en 0).
- `disponibilidad_de(empleado_id, fecha)` → bloques ocupados (reclamos con hora + OTs del
  día) + jornada desde `EmpleadoHorario` (fallback 9-18) + `dia_lleno` según `capacidad_maxima`.
Consumidores: los 4 puntos de asignación de arriba. Con esto mueren los "dos rulebooks".

### T2. Arreglar el auto-asignar (hoy simulado)
- `reclamos.py:2175` (`carga_actual = 0` con comentario stale FALSO — `Reclamo.empleado_id`
  existe) y `:2195` (`disponibilidad_score = 15` fijo) → usar el service T1. Descartar o
  penalizar fuerte empleados con ausencia en la fecha.
- Que auto-asignar setee `fecha_programada` (hoy no la setea → el reclamo auto-asignado
  DESAPARECE del canvas: `/semanal` exige fecha para 'tareas' `planificacion.py:227-229` y
  empleado NULL para 'sin_asignar' :317). Alternativa: banda "asignados sin fecha" en el
  canvas. Elegir una — que nada quede fuera del radar.
- Escribir historial (hoy auto-asignar no deja rastro, :2289-2296).

### T3. El endpoint de disponibilidad de verdad (o borrar el zombie)
- Backend: `GET /reclamos/empleado/{id}/disponibilidad/{fecha}` es un stub que devuelve
  siempre libre 9-18 (`reclamos.py:2024-2044`) → implementarlo con `disponibilidad_de` (T1).
- Frontend: el panel que lo consumiría es CÓDIGO MUERTO INALCANZABLE (~100 líneas,
  `Reclamos.tsx:3618-3710`; `handleEmpleadoChange` :1712 definido y jamás invocado; el
  DatePicker está adentro de un guard huevo-y-gallina :3627). Reescribir el trigger al
  elegir empleado en el ModernSelect (:3512) — o borrar el panel si se va directo a T5.

### T4. El canvas ve las OTs (mata los falsos "Sin asignar")
- `planificacion.py` importa solo Reclamo/Empleado (:14-15) — ninguna query toca
  `OrdenTrabajo` aunque tiene empleado_id/cuadrilla_id/fecha_programada (:62-70) y horas (:76-77).
- Sumar al response de `/semanal`: OTs con fecha en el rango como tarjetas de otro tipo
  (fila por cuadrilla, expandible a miembros si se quiere).
- Excluir del pool `sin_asignar` los reclamos con OT vigente vinculada (`exists` sobre
  `orden_trabajo_reclamos`) — hoy un reclamo cubierto por OT de cuadrilla figura "Sin
  asignar" e invita a doble asignación.
- Resolver el ruido del pool: cap `.limit(30)` (:320) y mezcla de estados (incluye EN_CURSO,
  POSPUESTO y legacy NUEVO, :304-310) — definir qué estados son "asignables" y paginar.
- Reglas del drop (usar T1): bloquear/warnear drop sobre ausencia (hoy la celda se pinta
  roja pero acepta, `Planificacion.tsx:262-337` + `planificacion.py:389-455`); validar
  estado (hoy mueve un EN_CURSO que el circuito formal prohíbe); NO escribir legacy ASIGNADO
  (:441-442); `/desasignar` (:357-386) pasa a exigir motivo o queda solo para estados previos.
- Política de hora única: el drag asigna sin hora y el manual exige hora con default 09:00 —
  unificar (hora opcional en ambos, o popover de franja al dropear).
- `capacidad_maxima` como denominador del color de carga (hoy umbrales fijos 2/4,
  `Planificacion.tsx:350-355`) + warning al superar.

### T5. Widget de candidatos en el Sheet (diseño B)
- Reemplazar el combo plano de empleados del Sheet de Reclamos por un selector de candidatos
  con datos REALES por empleado: mini-strip de próximos 5 días (carga/día desde `carga_de`,
  ausencias, horario), ordenado por el scoring arreglado (T2). Elegir empleado+día en un gesto.
- Planificación queda como vista de reprogramación (drag para mover fechas) — con T4 ya
  muestra todo el trabajo.
- **[D7]** El salto al diseño A ("Despacho": el canvas absorbe la asignación, filas =
  empleados Y cuadrillas, dropear sobre cuadrilla crea/vincula OT ahí mismo reutilizando la
  lógica de `handleVincularOT`) se decide DESPUÉS de esta fase, cuando el dato sea confiable.

### T6. Experiencia de campo del empleado
- **Estado de bloqueo en la OT:** hoy el circuito es pendiente→asignada→en_curso→
  completada/cancelada sin pausa; el empleado puede posponer un RECLAMO con motivo pero no
  la OT de su cuadrilla. Agregar estado `bloqueada` a `EstadoOrdenTrabajo`
  (`models/enums.py` + `lib/enums/ordenTrabajo.ts`, patrón resiliente con fallback) con
  motivo tipificado (falta material / clima / vecino ausente / otro) + endpoint `/bloquear`
  operable por `_puede_operar_en_campo` (:289-297), notificando al supervisor. Migración de
  ENUM MySQL si aplica — ejecutarla sin preguntar (regla del repo).
- **Consumo real vs planeado:** al completar, el backend descuenta la cantidad PLANEADA
  (`ordenes_trabajo.py:414-418`) y las cantidades están disabled para el empleado
  (`OrdenesTrabajo.tsx:741`) → permitir editar cantidad real por consumible en el bloque
  Completar (payload de `/completar`).
- **Fotos en la OT:** cero evidencia visual del trabajo de cuadrilla → adjuntar fotos del
  después reutilizando el upload a Cloudinary de reclamos (con el check de pertenencia de F0).
- **Mis Trabajos como vista de campo:** hoy es el monolito del supervisor con prop
  (`soloMisTrabajos`) — copy de gestor, KPIs de gestión, `viewStorageKey` compartido. Si F3
  ya extrajo el Sheet a componentes, armar página fina propia: vista guiada default con
  secciones de campo ("Para hoy" usando `fecha_programada`, "En curso", "Esperando
  confirmación" — hoy `pendiente_confirmacion` cae mal clasificado en el inbox,
  `Reclamos.tsx:4287-4344`), storageKey propio, KPIs de operario.

### T7. Limpieza de código muerto del área
- `GET /cuadrillas/sugerir` (`cuadrillas.py:22-82`): cero consumidores — es justo el scoring
  que le falta al combo polimórfico; usarlo en T5 o borrarlo.
- Schema `TareaTramite` (`planificacion.py:87-97`): resto de scope abortado — borrar.

## No alcance

- No migrar estados legacy del pool (definirlos como filtro acá; la migración es F5).
- No unificar las dos tablas de empleados (campo vs sueldos).

## Checklist de cierre

1. pyflakes backend + `npm run build` + eslint frontend.
2. Prueba integral contra muni demo: asignar con ausencia → warning/bloqueo; auto-asignar →
   aparece en el canvas; OT de cuadrilla → visible en canvas y el reclamo NO está en
   "Sin asignar"; empleado bloquea OT → notificación al supervisor.
3. Commit + push origin master. Actualizar §7 del funcional + memoria del proyecto.
