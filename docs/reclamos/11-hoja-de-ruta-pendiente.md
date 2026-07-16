# Hoja de ruta pendiente — Reclamos / OT (post test de cohesión)

> **Consolidado 2026-07-16.** Toma el [10-test-cohesion.md](10-test-cohesion.md) (94 hallazgos
> viejos re-verificados + 16 costuras nuevas confirmadas) y lo convierte en **qué queda por
> hacer**, priorizado y con dueño. Objetivo: dejar el circuito Reclamos/OT presentable para
> **General San Martín (muni 145)**.
>
> **Convención de dueño:**
> - **[MUNIFY]** = código de esta app (yo, con tu OK — módulos centrales).
> - **[EXTERNO]** = lo resuelve SalesBot (tokens dev + templates de Meta). **Dado por hecho**;
>   pedido dejado en `base-compartida/salesbot/PEDIDO-DE-MUNIFY-whatsapp-templates-reclamos.md`.
> - **[CONFIG]** = carga de credenciales/valores, sin código.
>
> Nada de esto está implementado todavía. El orden es de prioridad descendente.

---

## Bloque 0 — BLOQUEANTE de seguridad (antes de mostrarle el producto a nadie)

| # | Qué | Dónde | Dueño | Tamaño |
|---|---|---|---|---|
| 0.1 | **Calificación pública sin token**: `GET/POST /calificar/{id}` no exige auth, no filtra municipio y el id es el número `REC-XXXXX`. Leak cross-tenant de datos de vecinos + escritura no autenticada. **Fix:** token de un solo uso por reclamo (viaja en el link) + filtro `municipio_id` + rate limit (`@limiter`, ya usado en `portal_publico`). | `backend/api/calificaciones.py:325-407` + link en `push_service.py` | [MUNIFY] | Mediano |

Único ítem no negociable. El resto es priorizable según qué muestre la demo.

---

## Bloque 1 — Vuelta al vecino: WhatsApp de reclamos + notificaciones in-app

Cierra el hallazgo "[ALTA] WhatsApp del ciclo de vida es dead code" + las fugas de campanita.
**El envío por Meta ya existe** (`send_via_meta`); lo externo (número + templates) lo hace SalesBot.

| # | Qué | Dónde | Dueño | Tamaño |
|---|---|---|---|---|
| 1.1 | Crear + aprobar los **templates UTILITY** de Meta (recibido/asignado/resuelto) y proveer las credenciales del número | Business Manager de Meta | **[EXTERNO]** (doc dejado) | — |
| 1.2 | Cargar `meta_phone_number_id` + `meta_access_token` en el `WhatsAppConfig` de San Martín (145), provider META | DB (WhatsAppConfig) | [CONFIG] | Trivial |
| 1.3 | Extender `send_via_meta` para mandar `type: template` (hoy solo `type: text`, que Meta rechaza fuera de la ventana de 24 h) | `backend/api/whatsapp.py:731-762` | [MUNIFY] | Chico |
| 1.4 | **Cablear** las notifs de reclamo (recibido/asignado/resuelto + link de calificación al cierre) al envío WhatsApp — hoy `enviar_notificacion_whatsapp` está sin callers | `backend/api/reclamos.py:238` + transiciones | [MUNIFY] | Mediano |
| 1.5 | **Campanita no navega**: `handleNotificationClick` está definido pero jamás conectado → todos los deep-links in-app (incl. "Tocá para calificar") son decorativos. **Fix:** conectar el onClick de la fila | `NotificacionesDropdown.tsx:280` | [MUNIFY] | Chico |
| 1.6 | **In-app perdidas por rollback**: 3 endpoints notifican después del último `commit` → la sesión cierra y se descartan. **Fix:** `commit` tras notificar | `reclamos.py:1915,2120,2994` | [MUNIFY] | Chico |

---

## Bloque 2 — Costura Cuadrillas / Planificación (deuda operativa, "se descubre en la cancha")

La costura más floja del test (5 ALTAS confirmadas). No rompe datos, pero se nota en uso real.

| # | Qué | Dónde | Dueño | Tamaño |
|---|---|---|---|---|
| 2.1 | **Planificación ciega a OTs de cuadrilla**: el calendario se arma solo por `Reclamo.empleado_id`; el trabajo canalizado por cuadrilla es invisible. **Fix:** representar las OTs de cuadrilla en el calendario | `planificacion.py:210-245` + `Planificacion.tsx` | [MUNIFY] | Mediano |
| 2.2 | **Doble cobertura del mismo reclamo**: crear OT formal no cancela la OT implícita ni limpia `empleado_id` → dos equipos salen a lo mismo. **Fix:** reconciliar al crear/vincular | `ordenes_trabajo.py:889-936` | [MUNIFY] | Mediano |
| 2.3 | **`PUT /ordenes-trabajo/{id}` mudo y sin auditoría** (es el path que usan TODAS las pantallas): cambiar cuadrilla no notifica ni deja historial. **Fix:** notificar + `_historial_ot` en el PUT | `ordenes_trabajo.py:939-980` | [MUNIFY] | Chico |
| 2.4 | **Vincular reclamo pisa el responsable de toda la OT** en silencio, sin confirmación | `Reclamos.tsx:1690-1714` + `ordenes_trabajo.py:958-960` | [MUNIFY] | Chico |
| 2.5 | **Cuadrilla con N OTs solapadas** el mismo día/hora sin validación (ni warning) | `ordenes_trabajo.py:889-1021` | [MUNIFY] | Mediano |
| 2.6 | **Asignación desde Planificación push-only**: no crea notif en BD (campanita vacía) ni avisa al vecino | `planificacion.py:504-515` | [MUNIFY] | Chico |

---

## Bloque 3 — Correctitud OT / Inventario / Prioridad

| # | Qué | Dónde | Dueño | Tamaño |
|---|---|---|---|---|
| 3.1 | **Prioridad del reclamo ineditable en el flujo estándar**: el editor nunca ve la OT implícita (el endpoint la excluye) → no se puede escalar a URGENTE. **Fix:** que el editor incluya la implícita | `Reclamos.tsx:3688-3692` + `ordenes_trabajo.py:870` | [MUNIFY] | Chico |
| 3.2 | **Descuento de stock sin lock**: read-modify-write en Python → lost-update entre OTs concurrentes. **Fix:** `UPDATE stock = GREATEST(0, stock - :cant)` atómico (el patrón ya existe en `turnos_agenda.py`) | `ordenes_trabajo.py:553-554` | [MUNIFY] | Chico |

---

## Bloque 4 — UX del gestor: el estado `pendiente_confirmacion` (CRÍT del doc 09, aún vivos)

| # | Qué | Dónde | Dueño | Tamaño |
|---|---|---|---|---|
| 4.1 | El Sheet de gestión **no tiene botonera** para `pendiente_confirmacion` (Confirmar/Devolver solo viven en ReclamoDetalle) | `Reclamos.tsx:4329-4331` | [MUNIFY] | Mediano |
| 4.2 | La **cola "para confirmar" no tiene superficie**: el contador la cuenta pero el filtro la excluye; el Tablero no tiene columna | `Reclamos.tsx:5057`, `reclamos.py:748` | [MUNIFY] | Mediano |
| 4.3 | El **dropdown de estados** de ReclamoDetalle ofrece los 10 sin cruzar la matriz → varios fallan con 400 y el catch se traga el detail | `ReclamoDetalle.tsx:477` | [MUNIFY] | Chico |

---

## Bloque 5 — Deuda legacy NUEVO/RECIBIDO (superficies que quedaron mirando el estado viejo)

| # | Qué | Dónde | Dueño | Tamaño |
|---|---|---|---|---|
| 5.1 | KPI "sin asignar" del Dashboard filtra solo `NUEVO` → siempre 0 (el flujo nace RECIBIDO) | `dashboard.py:848` | [MUNIFY] | Chico |
| 5.2 | SLA ciego a RECIBIDO (query de activos + horas de respuesta clavadas en NUEVO) | `sla.py:292,322,358` | [MUNIFY] | Chico |

---

## Bloque 6 — Tolerable para la demo (no bloquea; dejar anotado)

- Datos **fake presentados como reales** en el panel del vecino ("+12%", distribución de
  estrellas) — viola regla dura #11. `DashboardVecino.tsx:357-746`.
- **Coords viejas pegadas** si el vecino edita la dirección tras elegir sugerencia. `CrearReclamoWizard.tsx:754`.
- Recomendación "Nuevo reclamo" del vecino → ruta inexistente → cae en /demo. `vecino.py:260`.
- `Reclamos.tsx` monolito (5.179 líneas), 74 hex inline, 3 `<select>` nativos.
- Las ~44 media/baja de costura del test **no pasaron verificación adversarial** — confirmar antes de accionar.

---

## Fuera de scope (por decisión del dueño, 2026-07-16)

- **Integración conversacional con SalesBot** (el bot que responde): NO por ahora. Los
  hallazgos "SalesBot crea el reclamo fuera del modelo F3 / entra mudo" quedan **documentados
  como deuda**, no se accionan. (El envío WhatsApp del Bloque 1 usa el número de SalesBot solo
  como emisor, no el bot.)

---

## Orden sugerido de ejecución

1. **0.1** (seguridad, no negociable).
2. **Bloque 1** completo — es lo que más se ve en la demo y depende de que SalesBot entregue
   templates + credenciales (ya pedido). 1.5 y 1.6 se pueden hacer YA (no dependen de Meta).
3. **Bloque 3** (correctitud, fixes chicos de alto valor).
4. **Bloque 2** (cuadrillas/planificación) según si la demo usa cuadrillas.
5. **Bloque 4 y 5** (UX gestor + legacy).
6. **Bloque 6** al final o nunca.
