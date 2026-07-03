# Fase 1 · Comunicación — que el vecino y el empleado se enteren de lo que pasa

> **Para un agente que arranca en frío.** Contexto: [01-analisis-funcional.md](01-analisis-funcional.md)
> §2-§4. **Prerrequisito: Fase 0 aplicada** (sin el fix de firma de T1-F0, nada de esto llega).
> Decisiones de producto que toca: **D2, D3, D4, D9** (§6 del funcional) — confirmarlas con
> el user ANTES de codear los ítems marcados. Referencias = commit `7aeb780`; verificar con grep.
> Servicios disponibles: `backend/services/notificacion_service.py` (`notificar_supervisores`
> :143, `notificar_vecino` :198, `notificar_empleado` :268), `backend/services/push_service.py`.

## Objetivo

Una matriz canónica evento×destinatario×canal, implementada. Hoy cada transición usa una
mezcla arbitraria de canales, el módulo OT es 100% mudo, y los eventos más sensibles
(rechazo, asignación al empleado, OT completada) no avisan a nadie.

## La matriz canónica (implementar esto)

| Evento | Vecino | Empleado/Cuadrilla | Supervisores | Deep link |
|---|---|---|---|---|
| Reclamo creado | in-app+push+email (ya OK) | — | in-app+push (HOY: solo si hay dependencia → sumar fallback sin dependencia) | `/gestion/reclamos/{id}` |
| Dependencia asignada | in-app+push (hoy: push pelado) | — | usuarios de la dependencia | ídem |
| Empleado asignado (directo o auto) | in-app ("tu reclamo tiene técnico asignado") | **in-app+push (HOY: NADA)** | — | ídem |
| Reclamo → en curso | in-app+push (post F0 ya sale por PATCH) | — | — | ídem |
| Reclamo pospuesto | in-app+push con motivo | — | in-app (hoy: nadie se entera) | ídem |
| Reclamo finalizado (cualquier camino) | in-app+push **+ link calificar** | — | — | `/calificar/{id}` |
| Reclamo rechazado | **in-app+push con motivo legible (HOY: NADA)** | — | — | detalle |
| Vecino comenta | — | — | in-app+push+email (ya OK) | ídem |
| Staff comenta | in-app+push+email (ya OK, link corregido en F0) | — | — | ídem |
| "Sigue el problema" | — | — | in-app+WhatsApp (ya OK) + **cola visible (D2)** | ídem |
| OT asignada | — | **in-app+push a responsable/miembros de cuadrilla (HOY: NADA)** | — | `/gestion/ordenes-trabajo` |
| OT iniciada | **in-app ("comenzó el trabajo") (HOY: NADA)** | — | — | detalle reclamo |
| OT completada | — | — | **in-app+push al creador de la OT + supervisores: "OT-X lista, cerrá los N reclamos" (HOY: NADA)** | `/gestion/reclamos` |
| OT cancelada | — | — | in-app | — |
| Devolución de trabajo | — | in-app+WhatsApp (hoy solo si hay `empleado_id` → fallback) | — | ídem |

WhatsApp y email del vecino: según config del muni (`whatsapp_config` — D9).

## Tareas

### T1. Notificaciones del ciclo de vida de la OT
- `backend/api/ordenes_trabajo.py` no importa ningún servicio de notificación (imports :11-28).
  Agregar según la matriz: en `/asignar` y en create-con-asignación → al empleado responsable
  (`User.empleado_id`) y/o miembros activos de la cuadrilla; en `/iniciar` (:644-664) → al
  vecino creador de cada reclamo vinculado (pivot `orden_trabajo_reclamos`); en `/completar`
  (:667-702) → creador de la OT + supervisores del muni; en `/cancelar` → supervisores.
- **[D3]** Si el user confirma: al iniciar la OT, mover los reclamos vinculados RECIBIDO→EN_CURSO
  (con miga en historial — hoy iniciar ni miga deja).
- **[D4]** Si el user confirma: en el modal de completar (`OrdenesTrabajo.tsx:813-849`),
  checkbox opt-in "Finalizar también los N reclamos vinculados" (por reclamo).
- **Aceptación:** completar una OT demo genera notificación in-app al supervisor; iniciar
  notifica al vecino.

### T2. Asignación de empleado notifica (helper ya escrito, nunca conectado)
- Conectar `notificar_asignacion_empleado` (`push_service.py:372`, dead code) en:
  `PUT /reclamos/{id}/empleado` (`reclamos.py:2313-2386`), `POST /auto-asignar` (`:2266-2303`)
  y el drag de planificación (`backend/api/planificacion.py:430-444`).
- Los tres además deben escribir `HistorialReclamo` accion='asignado_empleado' (hoy ninguno).
- Ojo bug existente: el push de asignación de dependencia (:1491-1500) va etiquetado
  `'asignacion_empleado'` — corregir el tipo.

### T3. Rechazo notifica al vecino
- `rechazar_reclamo` (`reclamos.py:1840-1874`): agregar `notificar_vecino` + push con el
  motivo legible (mapear `MotivoRechazo` a label). Es el evento más sensible del ciclo y hoy
  es el único totalmente mudo.

### T4. Cierre siempre invita a calificar
- Hoy solo el camino legacy `/confirmar` manda el link `/calificar/{id}` (WhatsApp,
  `reclamos.py:1758-1779`). `/resolver` por admin manda push pelado sin in-app ni link
  (:1683-1700), y el PATCH (post F0) manda 'reclamo_resuelto' genérico.
- Unificar: todo camino que deje el reclamo FINALIZADO/RESUELTO manda in-app+push con
  `accion_url=/calificar/{id}`. Separar plantilla in-app (texto plano corto) de la de
  WhatsApp (hoy el in-app muestra markdown de WhatsApp crudo, `notificacion_service.py:358-389`).

### T5. La voz del vecino se ve del lado muni
- Mostrar calificación (estrellas + comentario) en el Sheet del reclamo cerrado
  (`Reclamos.tsx`) y en `ReclamoDetalle.tsx` — el dato ya está en BD, cero pantallas lo muestran.
- Widget de promedio/distribución en el Dashboard admin usando `GET /calificaciones/estadisticas`
  (client ya definido `api.ts:1956-1958`, sin consumidor).
- `GET /calificaciones/ranking-empleados` devuelve `[]` hardcodeado (`calificaciones.py:216-217`)
  con comentario stale ("no hay empleado_id") — implementarlo con el join que ya usa
  `reportes.py:166`.
- **[D2]** Cola de cierres disputados: los reclamos `confirmado_vecino=False` ya quedan
  visibles en el listado (`reclamos.py:393-399`) y son capa 0 del inbox (`Reclamos.tsx:4290-4296`)
  — sumar contador/KPI en Dashboard + re-notificación si nadie actúa en N días (si el user
  prefiere reapertura automática, implementar FINALIZADO→EN_CURSO en `/confirmar-vecino`).

### T6. Flancos menores (mismo espíritu, baratos)
- `/devolver` solo notifica si hay `empleado_id` (`reclamos.py:1825`) → fallback: notificar
  al usuario que ejecutó el 'pendiente_confirmacion' (está en historial) o a la dependencia.
- Sumarse a un reclamo: descomentar el TODO (`reclamos.py:2681-2682`) — la función
  `notificar_persona_sumada` ya existe (`notificacion_service.py:587`).
- **[D9]** WhatsApp del flujo activo: reactivar las llamadas comentadas (`reclamos.py:587,
  590, 1289`) respetando los toggles de `whatsapp_config` (`notificacion_service.py:246-251`)
  — o quitar los toggles de la pantalla para no vender un canal muerto.
  **REGLA DURA del proyecto: WhatsApp SIEMPRE por Gupshup, jamás API de Meta.**
- Plantillas JSON muertas (`backend/config/notificaciones.json`, 22 tipos, 0 usos, y
  `enviar_con_plantilla` tiene un bug de await): decidir en el momento — si esta fase las usa
  para las plantillas nuevas, arreglar el await; si no, borrarlas para que no mientan.
- Noticias hardcodeadas del panel vecino (`DashboardVecino.tsx:59-169`: 12 noticias fake con
  fotos Unsplash mostradas como reales en TODOS los munis — viola regla dura #11 global):
  conectar a `backend/api/noticias.py` u ocultar el carrusel si el muni no cargó noticias.

## No alcance

- No migrar estados legacy ni unificar los dos caminos de cierre (F5).
- No tocar el canvas de Planificación (F4) ni el menú (F2).

## Checklist de cierre

1. pyflakes sobre los .py tocados; `npm run build` + eslint si se tocó front.
2. Probar la matriz contra el muni demo: cada evento de la tabla genera su fila en
   `notificaciones` con el deep link correcto (los links post-F0 son `/gestion/...`).
3. Commit + push origin master. Actualizar §7 del funcional + handoff si quedó algo.
