# Spec SalesBot → Munify: Reserva de turnos por WhatsApp

> Para el agente de `D:\Code\SalesBot`. Estos endpoints YA están vivos en prod
> (Cloud Run, rev 00020+). El vecino reserva un turno presencial sin tener cuenta
> en Munify: el bot le arma una lista de horarios y confirma.

## Auth y base

- Mismo canal que el resto: header **`X-SalesBot-Key: <key>`** (la que ya usás).
- Base: `https://munify-api-vmpxsxe7ra-rj.a.run.app`
- **Tenant-scoped:** el `municipio_id` va SIEMPRE en el path. El backend valida que
  el `tramite_id` pertenezca a ese municipio y resuelve solo la dependencia que
  atiende ese trámite. No se puede cruzar municipios.

---

## 0. GET — agenda del municipio (dependencias + horarios)

Lo primero que el bot consulta: qué dependencias del municipio atienden turnos y
con qué horarios. Así sabe qué ofrecer antes de pedir disponibilidad.

```
GET /api/salesbot/municipios/{municipio_id}/turnos/agenda
X-SalesBot-Key: <key>
```

**Response 200**
```json
{
  "municipio_id": 78,
  "dependencias": [
    {
      "dependencia_id": 539,
      "nombre": "Secretaría de Obras",
      "telefono": "+54 11 4444-5555",
      "horarios": [
        { "dia_semana": 0, "dia": "Lunes",  "hora_inicio": "08:30", "hora_fin": "13:00", "cupo_max": 1 },
        { "dia_semana": 1, "dia": "Martes", "hora_inicio": "08:30", "hora_fin": "13:00", "cupo_max": 1 }
      ]
    }
  ]
}
```
- `dia_semana`: 0=Lunes … 6=Domingo.
- Si una dependencia no configuró agenda, se devuelve el horario por defecto (lun–vie 08:30–13:00).
- Soporta **horario partido**: una dependencia puede traer varios tramos para el mismo día.

---

## 1. GET — horarios disponibles

```
GET /api/salesbot/municipios/{municipio_id}/turnos/disponibles?tramite_id={id}
X-SalesBot-Key: <key>
```

- `tramite_id` (recomendado): usa la duración del trámite y su dependencia asignada.
- `dependencia_id` (alternativa): si querés la agenda de una dependencia directa.
- Rango: próximos 7 días desde mañana. Devuelve **solo los primeros 20 slots libres**.

**Response 200**
```json
{
  "dependencia_id": 12,
  "dependencia_nombre": "Secretaría de Obras",
  "tramite": "Permiso de obra",
  "duracion_min": 30,
  "slots": [
    { "fecha_hora": "2026-06-10T09:00:00", "cupo_restante": 1 },
    { "fecha_hora": "2026-06-10T09:30:00", "cupo_restante": 1 }
  ]
}
```

**Errores**
- `404` "Municipio no encontrado" / "Tramite no encontrado en este municipio"
- `400` "El tramite no tiene dependencia asignada en este municipio" (hay que asignarla en el panel del muni) o "Pasá tramite_id o dependencia_id"
- `403` key inválida

> Agrupá los `slots` por día para armar la lista interactiva de WhatsApp.

---

## 2. POST — reservar turno

```
POST /api/salesbot/municipios/{municipio_id}/turnos/reservar
X-SalesBot-Key: <key>
Content-Type: application/json
```

**Body**
```json
{
  "tramite_id": 5,
  "fecha_hora": "2026-06-10T09:00:00",
  "nombre": "Juan Pérez",
  "dni": "12345678",
  "telefono": "+5491155556666",
  "notas": "opcional"
}
```
- `tramite_id`, `fecha_hora` y `nombre` obligatorios. `dni`, `telefono`, `notas` opcionales.
- **Guardá el `telefono`**: es lo que después se exige para cancelar.

**Response 200**
```json
{
  "turno_id": 45,
  "fecha_hora": "2026-06-10T09:00:00",
  "tramite": "Permiso de obra",
  "estado": "reservado",
  "confirmacion": "TRN-00045"
}
```

**Errores**
- `409` "Ese horario se completó. Elegí otro." → el slot se llenó entre que mostraste y reservaste. Volvé a pedir disponibilidad.
- `400` "Horario fuera de los turnos disponibles..." → la `fecha_hora` no es un slot válido (no la inventes; usá una de `/disponibles`).
- `404` muni/trámite inexistente en ese municipio.

> La reserva está **serializada con lock por slot**: si dos vecinos confirman el
> mismo horario al mismo tiempo, solo uno entra; el otro recibe `409`.

---

## 3. DELETE — cancelar turno

```
DELETE /api/salesbot/municipios/{municipio_id}/turnos/{turno_id}?telefono={telefono}
X-SalesBot-Key: <key>
```

- **`telefono` obligatorio** y debe coincidir con el que se usó al reservar. Esto
  impide cancelar turnos ajenos adivinando `turno_id`.

**Response 200**: `{ "ok": true }`
**Errores**: `400` falta telefono · `404` turno no existe en el muni · `403` el teléfono no coincide.

---

## Flujo sugerido en WhatsApp

```
1. BOT: "Para 'Permiso de obra' tenés que ir en persona. ¿Reservamos turno?"
   → GET /turnos/disponibles?tramite_id=5
2. BOT muestra los días (lista interactiva), el vecino elige uno.
3. BOT muestra los horarios de ese día (botones), el vecino elige.
4. BOT confirma → POST /turnos/reservar { tramite_id, fecha_hora, nombre, telefono }
5. BOT: "Listo! Turno TRN-00045, martes 10/06 9:00 en Secretaría de Obras.
         Llevá tu DNI. Para cancelar respondé CANCELAR."
   → si cancela: DELETE /turnos/{turno_id}?telefono=...
```

---

## Notas / límites actuales

- Para que un trámite acepte turnos, el municipio tiene que tenerlo **asignado a una
  dependencia** (tabla `municipio_dependencia_tramites`) y el trámite con
  `requiere_turno` / `duracion_turno_min`. Si no, da `400`.
- Horarios: si el municipio configuró su agenda (pantalla nueva en el panel), se usa
  esa; si no, el default lun–vie 08:30–13:00. Feriados configurados se excluyen solos.
- **Pendiente conocido:** el turno reservado por el bot todavía NO aparece en "Mis
  turnos" de la app del vecino (no tiene cuenta vinculada). Se va a reconciliar por
  DNI/teléfono más adelante. La cancelación por WhatsApp sí funciona.
