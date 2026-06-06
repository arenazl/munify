# SalesBot ↔ Munify — Spec FINAL (endpoints vivos)

> Documento único y actualizado. Reemplaza a los specs anteriores de salesbot.
> Todos los ejemplos de respuesta son **reales**, capturados de producción
> (Cloud Run `munify-api`), no inventados. Verificado al 2026-06-06.

## Auth y base

- **Base URL:** `https://munify-api-vmpxsxe7ra-rj.a.run.app` (alias equivalente: `…-1060106389361.southamerica-east1.run.app`).
- **Header en TODOS los requests:** `X-SalesBot-Key: <SALESBOT_API_KEY>` (64 chars). El valor vive en Secret Manager de Munify (`SALESBOT_API_KEY`) y se pasa por canal seguro — no va escrito en este doc.
- **Tenant-scoped:** el `municipio_id` va siempre en el path; el backend valida que trámites/dependencias pertenezcan a ese muni (cross-tenant → `404`).
- **Errores comunes:** `403` key inválida/cortada · `404` muni/recurso inexistente · `400` parámetros faltantes/ inválidos.

> **Regla para el bot:** si un campo viene `null` (teléfono, dirección, email…), es que el municipio **no lo cargó**. El bot NO debe inventar ese dato — debe decir que no lo tiene.

---

## LECTURA

### 1. `GET /api/salesbot/municipios`
Lista de municipios activos con stats reales (conteos en vivo).
```json
[
  {
    "id": 86, "nombre": "atacama", "codigo": "atacama",
    "logo_url": null, "color_primario": "#0088cc",
    "telefono": null, "whatsapp": null, "whatsapp_habilitado": false,
    "stats": { "reclamos_totales": 14, "reclamos_resueltos": 3, "tramites_activos": 12, "vecinos": 1 }
  }
]
```

### 2. `GET /api/salesbot/municipios/{id}/detalle`
Detalle de un muni. `direccion/telefono/latitud/longitud` salen de lo que el muni carga en **Configuración → Datos del Municipio** (fallback a la tabla `municipios`); el resto de `municipios`/`salesbot_configs`; `stats` en vivo.
```json
{
  "id": 65, "nombre": "San Pedro", "codigo": "san-pedro",
  "descripcion": null, "direccion": null, "telefono": null, "email": null, "sitio_web": null,
  "latitud": "-33.6761", "longitud": "-59.6629",
  "logo_url": null, "color_primario": "#0088cc",
  "whatsapp": null, "whatsapp_habilitado": false,
  "stats": {
    "reclamos_totales": 15, "reclamos_resueltos": 5, "tasa_resolucion_pct": 33,
    "tramites_activos": 14, "vecinos": 5,
    "categorias_reclamo": ["Agua y cloacas", "Alumbrado público", "Bacheo y calles", "..."]
  }
}
```

### 3. `GET /api/salesbot/municipios/{id}/tramites`
Trámites activos del muni.
```json
[
  { "id": 178, "nombre": "Carnet de Manipulacion de Alimentos",
    "descripcion": "Certificado obligatorio para personal de gastronomia...", "activo": true }
]
```

### 4. `GET /api/salesbot/municipios/{id}/categorias`
Categorías de reclamo del muni.
```json
[
  { "id": 559, "nombre": "Agua y cloacas",
    "descripcion": "Pérdidas de agua en vía pública, cloacas desbordadas, baja presión." }
]
```

### 5. `GET /api/salesbot/municipios/{id}/dependencias`
Áreas/secretarías del muni.
```json
[
  { "id": 16, "nombre": "Direccion de Atencion Primaria", "telefono": null, "email": null }
]
```

### 6. `GET /api/salesbot/municipios/{id}/turnos/agenda`
Dependencias que atienden turnos + sus horarios. Si el muni no configuró agenda custom, devuelve el **default lun–vie 08:30–13:00, cupo 1**.
```json
{
  "municipio_id": 65,
  "dependencias": [
    {
      "dependencia_id": 241, "nombre": "Secretaría de Obras Públicas", "telefono": null,
      "horarios": [
        { "dia_semana": 0, "dia": "Lunes",  "hora_inicio": "08:30", "hora_fin": "13:00", "cupo_max": 1 },
        { "dia_semana": 1, "dia": "Martes", "hora_inicio": "08:30", "hora_fin": "13:00", "cupo_max": 1 }
      ]
    }
  ]
}
```

### 7. `GET /api/salesbot/municipios/{id}/turnos/disponibles?tramite_id={id}`
Slots libres (próximos 7 días, máx 20). Alternativa: `?dependencia_id={id}`.
```json
{
  "dependencia_id": 310, "dependencia_nombre": "General",
  "tramite": "Certificado de Dominio", "duracion_min": 30,
  "slots": [
    { "fecha_hora": "2026-06-08T08:30:00", "cupo_restante": 1 },
    { "fecha_hora": "2026-06-08T09:00:00", "cupo_restante": 1 }
  ]
}
```

---

## ESCRITURA

### 8. `POST /api/salesbot/municipios/{id}/turnos/reservar`
Reserva un turno. Serializado con lock por slot (no hay doble reserva).
**Body:** `{ "tramite_id": 297, "fecha_hora": "2026-06-08T09:00:00", "nombre": "Juan Perez", "dni": "12345678", "telefono": "+5491155556666", "notas": "opcional" }`
```json
{ "turno_id": 45, "fecha_hora": "2026-06-08T09:00:00",
  "tramite": "Certificado de Dominio", "estado": "reservado", "confirmacion": "TRN-00045" }
```
- `409` si el slot se completó · `400` si la fecha_hora no es un slot válido (usá una de `/disponibles`).

### 9. `DELETE /api/salesbot/municipios/{id}/turnos/{turno_id}?telefono={telefono}`
Cancela. **Exige el `telefono`** con el que se reservó (no basta el id).
```json
{ "ok": true }
```

### 10. `POST /api/salesbot/municipios/{id}/reclamos`
El vecino reporta por WhatsApp; Munify **clasifica la categoría con IA** (o keywords si la IA está off en el muni), crea el vecino ghost y genera el reclamo.
**Body:** `{ "descripcion": "Se quemó el foco de la esquina de San Martín y Belgrano...", "nombre": "Juan Perez", "dni": "12345678", "telefono": "+5491155556666", "direccion": "San Martín y Belgrano", "latitud": -34.77, "longitud": -58.62 }`
(solo `descripcion` y `nombre` son obligatorios)

**Respuesta real (probada en La Matanza):**
```json
{
  "reclamo_id": 5052,
  "numero_seguimiento": "REC-05052",
  "estado": "nuevo",
  "categoria": { "id": 683, "nombre": "Alumbrado público", "confianza": null, "metodo": "local" },
  "dependencia_id": 307
}
```
- `metodo`: `"gemini"`/`"groq"` si el muni tiene la IA activada, `"local"` si usa keywords (gratis), `"fallback"` si la IA no acertó ninguna categoría del muni (se asigna una igual, el reclamo se crea).
- `dependencia_id`: el área a la que se auto-asignó por la categoría (o `null` si el muni no la mapeó).
- `400` si la descripción tiene menos de 5 caracteres o el muni no tiene categorías cargadas.

---

## Notas de estado (lo que conviene saber)

- **Datos en `null`** = el municipio no los cargó (teléfono, dirección, logo, email). El bot no debe inventarlos.
- **Dirección/teléfono del muni** se cargan en el panel **Configuración → Datos del Municipio**; recién ahí el `/detalle` los devuelve.
- **Agenda de turnos**: hoy todos los munis usan el horario default (08:30–13:00 lun–vie) porque nadie configuró agenda custom todavía (se hace en Configuración → Turnos).
- **IA de reclamos**: está **apagada por default** por municipio; con la IA off, la clasificación es por keywords (gratis) y funciona igual. Se activa con el switch de superadmin por muni.
