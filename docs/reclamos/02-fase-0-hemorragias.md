# Fase 0 · Hemorragias — bugs puros + seguridad multi-tenant

> **Para un agente que arranca en frío.** Contexto general: [01-analisis-funcional.md](01-analisis-funcional.md)
> (§2 la película, §3 críticos). Esta fase NO requiere ninguna decisión de producto: son
> fixes de bugs confirmados con evidencia. Referencias `archivo:línea` = commit `7aeb780`
> (2026-07-03); **verificar con grep antes de editar** (el código pudo driftar).
> Reglas duras: ver §8 del doc funcional. Backend en `backend/api/`, frontend en `frontend/src/`.

## Objetivo

Que la comunicación básica y la seguridad dejen de estar rotas: notificaciones que hoy
mueren en un except, links que llevan a /demo, el empleado que no puede arrancar su trabajo,
y ~25 endpoints operables cross-tenant.

## Alcance / No alcance

- SÍ: los 9 ítems de abajo. Solo correcciones — no agregar notificaciones NUEVAS (eso es F1),
  no tocar menú (F2), no tocar estilos (F3).
- NO: decidir el futuro del escalado (solo apagarlo), migrar estados legacy (F5).

## Tareas

### T1. Fix firma de `enviar_notificacion_push` (el bug más grande)
- `backend/api/reclamos.py:588` y `:591-593`: se llama
  `enviar_notificacion_push(db, reclamo, 'reclamo_resuelto')` y
  `(db, reclamo, 'cambio_estado', estado_anterior=..., estado_nuevo=...)`, pero la firma es
  `enviar_notificacion_push(reclamo_id: int, tipo_notificacion: str, ...)` (`reclamos.py:188-196`).
  La AsyncSession entra como `reclamo_id` → la query interna explota y el except `:234-237`
  la traga con print.
- Fix: llamar con keyword args (`reclamo_id=reclamo.id, tipo_notificacion=...`,
  `estado_anterior=`, `estado_nuevo=`). Los otros 2 call sites están BIEN
  (`:1292-1295` y `:1924-1925`) — no tocarlos.
- De paso: reemplazar el `print`+`traceback.print_exc()` del except por `logger.error`.
- **Aceptación:** mover un reclamo por el PATCH (kanban) crea una fila en `notificaciones`
  para el vecino creador y dispara push. Verificar en BD del muni demo.

### T2. Calificación pública acepta FINALIZADO
- `backend/api/calificaciones.py:304`, `:343` y `:238` exigen `estado == RESUELTO` (legacy);
  el flujo activo cierra en FINALIZADO. El endpoint autenticado ya acepta ambos (`:74`) —
  copiar ese criterio en los tres lugares.
- Frontend: `frontend/src/pages/MisReclamos.tsx:104-116` (`openViewSheet`) consulta la
  calificación existente solo si `estado === 'resuelto'` → incluir `'finalizado'` (si no,
  re-ofrece el botón Calificar y el envío da 400).
- **Aceptación:** `/calificar/{id}` de un reclamo FINALIZADO carga y acepta la calificación;
  en MisReclamos un finalizado ya calificado muestra la calificación, no el botón.

### T3. Deep links rotos → `/demo`
- Los links de notificación del vecino usan `/reclamos/{id}`, ruta que NO existe en
  `frontend/src/routes.tsx` (el detalle es child de `/gestion`, `:221`; catch-all a /demo `:443`).
- Corregir a `/gestion/reclamos/{id}` en: `backend/services/push_service.py:213, 229, 259,
  309, 367`; plantillas de `backend/services/notificacion_service.py:84`.
- Fallback de la campanita: `frontend/src/components/NotificacionesDropdown.tsx:120-127`
  navega `/reclamos/{id}` y `/tramites/{id}` para roles no-gestión (afecta vecino Y empleado)
  → corregir a las rutas `/gestion/...`.
- `frontend/src/pages/Dashboard.tsx:1655`: `window.location.href = /reclamos/${r.id}` → ruta
  con `/gestion` y `navigate()`.
- **Además** agregar en `routes.tsx` un redirect `/reclamos/:id → /gestion/reclamos/:id`
  (patrón `Navigate` como 'ajustes' en `:399-402`) para sanear los links históricos ya
  emitidos por push/WhatsApp.
- **Aceptación:** tocar una notificación de vecino aterriza en el detalle del reclamo, nunca en /demo.

### T4. El empleado puede iniciar su trabajo
- Hoy: botón "En Curso" (visible por estado, sin gate de rol — `Reclamos.tsx:3959, 4045-4058`)
  llama `POST /reclamos/{id}/iniciar` que exige admin/supervisor (`reclamos.py:1515`) → 403.
- Fix recomendado: que `handleIniciar` use `reclamosApi.cambiarEstado` (PATCH, que ya permite
  empleado y valida la transición recibido→en_curso). Alternativa: sumar 'empleado' a
  `require_roles` de `/iniciar` validando `reclamo.empleado_id == current_user.empleado_id`.
- Toasts optimistas mentirosos: mover el toast de éxito DESPUÉS del await en `handleIniciar`
  (`Reclamos.tsx:1734-1738`), `handleRechazar` (`:1799-1802`) y `handleFinalizar`
  (`:1766-1769` — para rol empleado el backend deja `pendiente_confirmacion`, no `finalizado`:
  mensaje acorde "Enviado al supervisor para confirmar").
- Ocultar el botón "Rechazar" para rol empleado (aparece en 4 bloques del footer:
  `Reclamos.tsx:4030-4040, 4059-4069, 4108-4118, 4135-4145`; el endpoint es
  admin/supervisor-only `reclamos.py:1845`).
- **Aceptación:** logueado como empleado demo, "En Curso" mueve el reclamo de verdad; no
  aparece Rechazar; ningún toast de éxito antes del await.

### T5. Multi-tenant en reclamos.py (~13 endpoints)
- Crear helper `_get_reclamo(db, reclamo_id, current_user)` análogo a `_get_ot`
  (`ordenes_trabajo.py:228-234`), usando `get_effective_municipio_id` (ya importado), que
  agregue `Reclamo.municipio_id == municipio_id` y 404 si no pertenece.
- Migrar: PATCH (`reclamos.py:530`), `/asignar` (`:1366`), `/iniciar` (`:1517`), `/resolver`
  (`:1590`), `/confirmar` (`:1721`), `/devolver` (`:1798`), `/rechazar` (`:1847`),
  `/comentario` (`:1888`), `/upload` (`:1987` — además hoy NO tiene ningún check de rol ni
  pertenencia: cualquier autenticado sube imágenes a cualquier reclamo → exigir que sea el
  creador, staff del muni, o empleado asignado), `/empleado` (`:2331`), `/reasignar` (`:2413`),
  GET `/{id}` (`:1051`), GET `/{id}/historial` (`:1068`).
- GET historial además: vecino → solo su reclamo; staff → su muni; y filtrar acciones
  internas cuando el solicitante es vecino ('devuelto', 'feedback_descartado', DJ de
  ventanilla — hoy ve la cocina interna completa).
- Para rol empleado en acciones de ESCRITURA (PATCH, /resolver): exigir
  `reclamo.empleado_id == current_user.empleado_id` o pertenencia a cuadrilla de una OT
  vinculada al reclamo.
- PATCH: si `current_user.rol == EMPLEADO` y destino es FINALIZADO → forzar
  PENDIENTE_CONFIRMACION (hoy el empleado puede saltearse la confirmación del supervisor
  por API, `reclamos.py:549`).
- **Aceptación:** con un token de admin del muni A, operar un reclamo del muni B devuelve 404.

### T6. Multi-tenant en cuadrillas y empleados_gestion
- `backend/api/cuadrillas.py`: `get_cuadrilla` (:112-119), `update_cuadrilla` (:168-176),
  `delete_cuadrilla` (:217) filtran solo por id → sumar `municipio_id`. El attach de
  categorías en create (:141) y update (:188) hace `Categoria.id.in_(...)` sin filtrar muni.
- `backend/api/empleados_gestion.py`: `update_asignacion_cuadrilla` (:126-134), `desasignar`
  (:152-157), `update_ausencia` (:236-244), `delete_ausencia` (:268-273), horarios
  (:351-390), `create_metrica` (:463-479), `update_capacitacion` (:552-556),
  `delete_capacitacion` (:577-579), `get_companeros_cuadrilla` (:602-608 — accesible con rol
  empleado sin validar que el empleado_id sea del muni) → validar tenencia vía join con
  `Empleado.municipio_id` (como ya hace el list).
- **Aceptación:** mismo criterio que T5.

### T7. Apagar el escalado (riesgo dormido cross-tenant)
- `backend/api/escalado.py` hoy: POST `/ejecutar` invocable por cualquier admin (:280-288)
  con queries sin filtro de muni (:140-145, :152-193) que notifican a admins de TODOS los
  munis (:234-236) y un insert de HistorialReclamo sin `usuario_id` (NOT NULL) que revienta
  en background (:264-271). GET `/historial` (:301-309) y `/pendientes` (:339-362) TAMBIÉN
  leakean títulos/configs de otros tenants HOY, sin cron de por medio.
- Acción F0: **apagar** — desmontar el router de `backend/api/__init__.py:104` (o gatearlo
  entero a superadmin). El CRUD de config (:63-121) es multi-tenant correcto, pero sin
  frontend que lo consuma no pierde nada quedando apagado. La decisión revivir-o-borrar es
  de F5 (D6 del doc funcional).
- **Aceptación:** `/api/escalado/*` devuelve 404 (o 403 no-superadmin).

### T8. Crash del bot conversacional de WhatsApp
- `backend/api/whatsapp.py:1096` usa `EstadoReclamo.nuevo` (minúscula, atributo inexistente)
  → AttributeError tragado por el except :1117-1118; el reclamo por WhatsApp conversacional
  nunca se crea. Fix mínimo: `EstadoReclamo.NUEVO`. (La unificación de la creación en un
  service con RECIBIDO + auto-dependencia es F5 — no encararla acá.)

### T9. Limpieza mínima del camino crítico
- `Reclamos.tsx:1319-1321`: borrar `console.log('[DEBUG] ...')`.
- `reclamos.py` create: prints con emojis Unicode (:1082-1089, :1261, :1265) → `logger` sin
  emojis (regla dura #8).

## Checklist de cierre

1. Backend: `python -m pyflakes backend/api/reclamos.py backend/api/calificaciones.py
   backend/api/cuadrillas.py backend/api/empleados_gestion.py backend/api/whatsapp.py`.
2. Frontend: `cd frontend && npm run build` y `npx eslint src/ --ext .ts,.tsx`.
3. Commit + `git push origin master`. NO deployar a mano (CD lo dispara Infra).
4. Verificar live post-deploy contra `https://munify-api-1060106389361.us-east4.run.app/openapi.json`.
5. Actualizar el estado en `docs/reclamos/01-analisis-funcional.md` §7 (fase hecha) y dejar
   handoff en `docs/handoffs/` si quedó algo colgado.
