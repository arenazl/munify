# Fase 5 · Máquina de estados — transiciones formales y fin de los legacy

> **Para un agente que arranca en frío.** Contexto: [01-analisis-funcional.md](01-analisis-funcional.md)
> §4 (estados legacy). **Prerrequisitos: F0 y F1.** Decisiones que toca: **D5 (destino de
> pendiente_confirmacion/resuelto) y D6 (escalado vive o muere)** — confirmar ANTES.
> Referencias = commit `7aeb780`; verificar con grep.
> Migraciones de schema/datos: ejecutarlas sin preguntar (regla del repo), con script
> idempotente en `backend/scripts/`.

## El estado actual (mapa)

- **Estados del reclamo** (`models/enums.py:11-23`): activos = recibido, en_curso,
  finalizado, pospuesto, rechazado; marcados "legacy" = nuevo, asignado, en_proceso,
  pendiente_confirmacion, resuelto. PERO `pendiente_confirmacion` y `resuelto` son el camino
  ACTIVO del circuito empleado→supervisor (`/resolver` rama empleado `reclamos.py:1609`,
  `/confirmar` :1737). Dos estados de cierre conviven: FINALIZADO (cierre admin/kanban) y
  RESUELTO (cierre vía confirmación).
- **Dos máquinas de validación en paralelo que se contradicen:** la matriz formal vive SOLO
  dentro del PATCH (`reclamos.py:545-555`); los endpoints dedicados usan precondiciones
  ad-hoc: `/rechazar` solo bloquea RESUELTO (:1852 — permite FINALIZADO→RECHAZADO y
  re-rechazar), `/reasignar` reabre desde FINALIZADO/RECHAZADO/RESUELTO limpiando resolución
  (:2419-2432), `/asignar` exige NUEVO/ASIGNADO (:1371) y ejecuta ASIGNADO→RECIBIDO (:1410)
  que la matriz no contempla.
- **Tres puertas de entrada, tres comportamientos:** app/ventanilla crea RECIBIDO (:1191)
  pero registra historial estado_nuevo=NUEVO (:1254, miente); SalesBot crea NUEVO sin
  notificar a la dependencia (`salesbot.py:681`, aunque SÍ auto-asigna dependencia :664-680);
  el bot conversacional de WhatsApp crea vía otro path (crash arreglado en F0). Default del
  modelo = NUEVO (`models/reclamo.py:22`).
- **Consumidores clavados en legacy:** sugerencias de asignación solo con estado 'nuevo'
  (`Reclamos.tsx:1316` — el algoritmo backend SÍ acepta recibido, :2084); panel "Asignar
  Dependencia" (:3489) y "Tiempo estimado" (:3367) solo 'nuevo'; KPI sin_asignar del
  Dashboard cuenta NUEVO (`dashboard.py:831` → 0 para el flujo principal); MiArea cuenta
  nuevos/resueltos legacy (`MiArea.tsx:56-58`); SLA activos = NUEVO/ASIGNADO/EN_CURSO
  (`sla.py:275`) y promedio solo RESUELTO (:366); escalado NUEVO/ASIGNADO (:153,172).

## Tareas

### T1. `validar_transicion()` única
- Extraer la matriz del PATCH a una función única (en `models/enums.py` o
  `services/reclamo_flow.py`): `validar_transicion(actual, nuevo, rol)` — incluir las
  transiciones especiales por rol (empleado → pendiente_confirmacion forzado, ya de F0).
- Usarla en TODOS los endpoints de transición: PATCH, /asignar, /iniciar, /resolver,
  /confirmar, /devolver, /rechazar, /reasignar. Las precondiciones ad-hoc mueren.
- Definir formalmente las reglas hoy en disputa: ¿se puede rechazar un FINALIZADO?
  ¿reasignar reabre desde RECHAZADO? — proponer al user una matriz cerrada y aplicarla.

### T2. Destino de pendiente_confirmacion / resuelto **[D5]**
Recomendación del análisis: **pendiente_confirmacion queda como estado activo** (quitarle el
comentario "legacy", sumarlo a la matriz y al inbox — hoy cae mal clasificado); **el cierre
final se unifica en FINALIZADO** (`/confirmar` pasa a dejar FINALIZADO). Con eso:
- Migración de datos: `UPDATE reclamos SET estado='finalizado' WHERE estado='resuelto'`
  (script idempotente; conservar `confirmado_vecino`/fechas). O tratar 'resuelto' como
  sinónimo en TODAS las métricas — elegir UNA estrategia, no las dos.
- Barrer los consumidores que suman/filtran ambos: `sla.py:366`, `dashboard.py:813`,
  `reclamos.py:444-448`, KPIs `Reclamos.tsx:4536`, `MiArea.tsx:56-58`, filtros de
  calificaciones (post F0 ya aceptan ambos).
- El comentario falso "Rol EMPLEADO fue eliminado" (`reclamos.py:1598`) — limpiar.

### T3. Creación unificada en un service
- `services/reclamo_create.py` (nombre orientativo): estado inicial RECIBIDO +
  auto-asignación de dependencia por categoría + historial coherente (fix del
  estado_nuevo=NUEVO mentiroso :1254) + notificaciones de la matriz F1 + gamificación.
- Llamarlo desde: `create_reclamo` (app/ventanilla), `salesbot.py:681` (hoy NUEVO sin
  notificación a dependencia) y el flujo WhatsApp conversacional. Default del modelo
  (`models/reclamo.py:22`) → RECIBIDO.
- Con esto muere el doble vocabulario de entrada. Ojo: el panel "Asignar Dependencia" y las
  sugerencias gateadas a 'nuevo' (`Reclamos.tsx:3489, :1316`) pasan a gatearse por
  "sin dependencia" / "recibido" — es el fix definitivo del agujero negro de F0-T5 nota.
- El backend `/asignar` (:1371) acepta también RECIBIDO (permitir reasignar dependencia).

### T4. SLA vivo **[la cara ya se hizo en F3]**
- Sumar RECIBIDO al universo monitoreado (`sla.py:275`; "tiempo de respuesta" :295 hoy solo
  NUEVO): respuesta = recibido sin iniciar, resolución = en_curso.
- Persistir `SLAViolacion` (modelo existe `models/sla.py:37`, nunca se inserta) y disparar
  `notificar_sla_vencido` (`push_service.py:620`, jamás llamado) vía job — patrón del cron
  de turnos: endpoint con header `X-Cron-Key` vs `CRON_SECRET`
  (`turnos_tramite.py:368-373`, `core/config.py:49-51`) + Cloud Scheduler (coordinar el
  scheduler con Infra; el endpoint lo hace esta fase).
- **Una sola vara de vencimiento:** la vista inbox de Reclamos usa su propia heurística
  (`tiempo_estimado_dias ?? categoria.tiempo_resolucion_estimado ?? 30`,
  `Reclamos.tsx:4302-4316`) desconectada de `sla_configs` → unificar con un
  `get_sla_for_reclamo` del backend y mostrar el semáforo SLA como badge/columna en la lista.

### T5. Escalado: vive o muere **[D6]** (en F0 quedó apagado)
- Si VIVE: filtrar TODO por `municipio_id` (configs :140-145, reclamos :152-193,
  notificaciones :234-236, historial :301-309, pendientes :339-362), `usuario_id` del
  sistema para el HistorialReclamo (hoy viola NOT NULL :264-271), estados vivos
  (recibido/en_curso), scheduler como T4, y una pantalla de config (sección dentro de SLA).
- Si MUERE: borrar router + modelos + plantillas asociadas. No dejarlo a medias.

### T6. Auditoría de OT
- Las OTs no registran quién las movió (solo `fecha_inicio_real`/`fecha_completada`) —
  tabla `historial_ordenes_trabajo` (patrón HistorialReclamo: usuario, acción,
  estado_anterior/nuevo, comentario) escrita en los 5 endpoints de transición + migración.

### T7. Doble asignación reconciliada
- Al vincular un reclamo con `empleado_id` ≠ empleado/cuadrilla de la OT: bloquear con 400
  pidiendo reasignar, o auto-limpiar `Reclamo.empleado_id` dejando miga en historial —
  proponer al user y aplicar. (La bandeja unificada del empleado ya se hizo en F2-T4.)

### T7-bis. Limpieza definitiva de la prioridad deprecada (si F6 ya corrió)
- F6 depreca `reclamos.prioridad` (Integer con doble semántica) a favor del enum de la OT
  (decisión D12). En esta fase va el DROP definitivo de la columna + limpieza de
  `categoria.prioridad_default`/`municipio_dependencia_categoria.prioridad_default` (o su
  migración final a enum) y de cualquier lector remanente. Si F6 NO corrió aún, saltear.

### T8. Plantillas de notificación (si F1 no lo resolvió)
- `backend/config/notificaciones.json` (22 tipos) + `enviar_con_plantilla` con bug de await:
  migrar los envíos reales al sistema de plantillas o borrarlo. Cerrar la deuda.

## No alcance

- UI nueva (todo lo visual quedó en F3; acá solo se ajustan gates de estado en pantallas ya
  existentes).

## Checklist de cierre

1. pyflakes backend + build/eslint front si se tocaron gates de UI.
2. Migraciones ejecutadas contra la BD real (script idempotente, backup JSON previo de las
   filas afectadas — patrón `_backup_*.json` de scripts existentes).
3. Prueba del circuito completo post-migración con el muni demo Y verificación de que SPN
   (muni 80, productivo) no tiene reclamos en estados que la nueva matriz no contemple
   (query real antes de migrar).
4. Commit + push origin master. Actualizar §7 del funcional + memoria + handoff.
