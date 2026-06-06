# Spec: Turnos + Calendario (Munify) — ejecutable por fases

> Arquitectura decidida + correcciones de la crítica adversarial bakeadas.
> Estado: **Fase 1 implementada y migrada en prod**. Fases 2-5 abajo.

## Objetivo

Generalizar el sistema de turnos (hoy casado a `Solicitud` de trámite) a **turnos
polimórficos** (trámite / reclamo / atención general), con **calendario
configurable por dependencia** (horarios, feriados, cupos) y **reserva desde
WhatsApp** vía SalesBot. Lente rector: **el vecino nunca escribe a mano, elige de
listas, mínimos pasos**.

## Scope (explícito)

- **DENTRO:** `turnos_tramite.py` (turnero de atención al vecino) + nuevos modelos de agenda + endpoints SalesBot.
- **FUERA:** `api/turnos.py` (planificación interna de empleados sobre reclamos, con su propia jornada 09-18). Es OTRO sistema; no se toca. Para evitar la confusión de dos `/disponibilidad`, los endpoints nuevos viven bajo `/turnos-tramite/*` y `/salesbot/*`, nunca `/turnos/*`.

---

## Modelo de datos (Fase 1 — HECHO)

- `turnos`: + `motivo_tipo` (`tramite|reclamo|atencion_general`), + `origen_id` (**fuente única** del vínculo: solicitud.id / reclamo.id / NULL), + `nombre/dni/telefono_solicitante` (reservas sin cuenta). `solicitud_id` pasó a **nullable**. Backfill: `motivo_tipo='tramite'`, `origen_id=solicitud_id`.
- `agenda_configs`: horario por dependencia × día. **Sin UNIQUE(dep,día)** → soporta **horario partido** (varias filas por día). `hora_inicio/fin` en `TIME`, `cupo_max_por_slot` (default 1 = comportamiento histórico).
- `agenda_excepciones`: feriados/cierres y aperturas especiales por fecha. Overrides de hora en `TIME` (no string). UNIQUE(dep, fecha).

Archivos: [agenda_config.py](backend/models/agenda_config.py), [agenda_excepcion.py](backend/models/agenda_excepcion.py), [turno.py](backend/models/turno.py), migración [migrar_turnos_v2.py](backend/scripts/migrar_turnos_v2.py).

---

## Los 3 críticos a cerrar ANTES de habilitar escritura del bot (Fase 4)

1. **Concurrencia (race condition).** El check actual es `SELECT-then-INSERT` sin lock. Sumar el canal bot lo agrava. **Fix:** UNA sola función `reservar_turno()` compartida por los 3 puntos de escritura, con `UNIQUE(municipio_dependencia_id, fecha_hora)` cuando `cupo=1` (capturar IntegrityError → 409), o `SELECT ... FOR UPDATE` + `COUNT < cupo_max` cuando `cupo>1`. Idempotency-key para el bot (reintenta por timeouts de WhatsApp).
2. **Validación de slot.** Hoy reservar no valida que la fecha caiga en día/hora hábil ni fuera de feriado → el calendario sería decorativo. **Fix:** `validar_slot(dependencia_id, fecha_hora, duracion)` que chequea día habilitado en `AgendaConfig` (o fallback), dentro de `hora_inicio/fin`, alineado a la grilla, y no en `AgendaExcepcion.tipo='cierre'`. Llamarla en **todos** los endpoints de reserva (incluido el `/reservar` actual).
3. **Tenant-scoping del bot.** Endpoints SalesBot escriben PII cross-tenant con la key global de solo-lectura. **Fix:** validar que `tramite_id`/`dependencia_id` pertenezcan al `municipio_id` del path; setear `Turno.municipio_id` desde el path validado; exigir `SalesbotConfig.habilitado=true`; rate-limit; cancelar exige match de `telefono/dni_solicitante` + token **no enumerable** (no el id crudo).

**Hueco de identidad bot↔app:** `/mis-turnos` no puede filtrar solo por `solicitante_id` (los turnos del bot tienen `solicitud_id=NULL`). Matchear también por `dni/telefono` del User logueado, o "reclamar" turnos anónimos al crear cuenta.

---

## Huecos a cubrir en el plan (no diferir a prod)

- **Notificaciones/recordatorios** vía `services/notificaciones.py` (confirmación + recordatorio; un turnero sin recordatorio tiene ausentismo alto).
- **Timezone UTC-3:** `fecha_hora`/`now()` son naive; Cloud Run corre en UTC → riesgo de slots corridos 3h. Definir TZ explícita.
- **Reprogramación** (endpoint reschedule atómico, no cancelar+reservar que libera el slot a terceros).
- **Anticipación mínima** para cancelar/reservar.
- **Tests** del cálculo de slots (config vs fallback) y de la race condition.
- **Rollback** de migración: una vez que el bot crea turnos con `solicitud_id=NULL`, no se puede volver a `NOT NULL` sin borrar datos. Documentado.
- **Borrado de dependencia:** turnos futuros apuntando a una dependencia dada de baja (el CASCADE de agenda no cubre turnos creados).

---

## Endpoints (contratos)

### Internos (JWT)
- `GET/PUT /api/agenda-config` y `GET/POST/PATCH/DELETE /api/agenda-excepciones` (admin|supervisor, scope `municipio_id`). PUT upsert **transaccional** (delete+insert atómico), valida `hora_inicio<hora_fin` y `cupo>=1`.
- `GET /turnos-tramite/disponibilidad` (sin cambio de firma; internamente lee `AgendaConfig` con fallback + excluye `cierre` + respeta `cupo_max`; `SlotDisponible` expone `cupo_restante`).
- `POST /turnos-tramite/reservar` (usa `reservar_turno()` + `validar_slot()`).
- `GET /turnos-tramite/mis-turnos` (match bot↔app por dni/telefono).
- `PATCH /turnos-tramite/{id}` (estado: cumplido|ausente|cancelado).

### SalesBot (X-SalesBot-Key, tenant-scoped + rate-limit)
- `GET /api/salesbot/municipios/{id}/turnos/disponibles?tramite_id=X` (primeros ~20 slots).
- `POST /api/salesbot/municipios/{id}/turnos/reservar` `{tramite_id, fecha_hora, nombre, dni?, telefono?}` → crea Turno `motivo_tipo='tramite'`, devuelve token de confirmación no enumerable.
- `DELETE .../turnos/{token}` (cancela; exige match telefono/dni).

---

## Flujos del vecino (resumen)

- **App:** Trámites → solicitud con `requiere_turno` → WizardModal 2 pasos (DatePicker con días disponibles → grilla de horarios como pills → confirmar). Ve/cancela en "Turnos" (sidebar).
- **WhatsApp:** bot ofrece días (lista interactiva) → horarios (botones) → confirma → número de turno. Nunca escribe a mano.
- **Admin:** agenda del día por dependencia, marca Presente/Ausente con un click.

---

## Plan UI (componentes del kit Munify)

- `MisTurnosPage` (vecino): `ABMPage` + `CalendarView` (toggle lista/calendario) + `Sheet` detalle + `ConfirmModal` cancelar. Item sidebar "Turnos" (1 palabra) en sección vecino.
- `ReservarTurnoWizard`: `WizardModal` + `DatePicker` + `SlotGrid` (pills).
- `ConfiguracionAgendaPage` (admin): bajo Configuración (no sidebar). `ModernSelect` dependencia + grilla 7 días + `Sheet` para excepciones.
- `AgendaTurnosPage` (admin): `ABMPage` + `ModernSelect` + `DatePicker`. Item sidebar "Agenda".
- Cero `<select>`/`<input date>` nativos; `useTheme()`; `searchMaxWidth` prohibido.

---

## Fases

| Fase | Qué | Tipo | Estado |
|---|---|---|---|
| **1** | Migración: modelo Turno generalizado + tablas agenda | ADITIVO | **HECHO** (migrado + verificado) |
| **2** | CRUD `AgendaConfig`/`AgendaExcepcion` (router nuevo) | ADITIVO | pendiente |
| **3** | Endpoints SalesBot de turnos (con los 3 fixes críticos) | ADITIVO | pendiente |
| **4** | `validar_slot()` + `reservar_turno()` con lock en `turnos_tramite.py` | **TOCA módulo en uso** | pendiente — requiere críticos 1 y 2 |
| **5** | UIs: MisTurnos, Wizard, ConfiguracionAgenda, AgendaTurnos | ADITIVO | pendiente |

Regla: las fases 4 y 5 (y habilitar la escritura del bot en Fase 3) **no van a prod hasta cerrar los 3 críticos** y el hueco de identidad. El resto es aditivo y verificable de a una.
