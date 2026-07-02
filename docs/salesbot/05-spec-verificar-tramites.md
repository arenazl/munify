# Spec: API de trámites para SalesBot (verificar, no inventar)

> **Para:** equipo de Munify (sugerenciasMun) — endpoint nuevo a exponer.
> **Origen:** el bot de soporte (Marcos) negó que "licencia de conducir" fuera un
> trámite, cuando en el municipio SÍ aparece en el listado. Alucinó porque no
> tiene cómo consultar el catálogo real de trámites del municipio.

---

## Problema (2 cosas distintas)

1. **Capacidad / dato (este doc):** ante "¿puedo hacer el trámite X?", el bot
   necesita **verificar contra el catálogo real del municipio**. Hoy no tiene un
   endpoint que liste los trámites de un municipio con su detalle → cuando no
   sabe, **inventa o niega** (caso licencia de conducir).

2. **Derivación (lado SalesBot, NO es de Munify):** si aun con el dato no puede
   resolver, el bot **deriva a un humano**, nunca inventa. Eso se arregla en el
   prompt/guard del bot, no acá. Este doc cubre solo el problema 1.

> Regla dura del bot: **nunca afirmar ni negar un trámite sin haberlo consultado
> en este endpoint.** Si no está en la lista → decir que en ese municipio no
> figura y derivar; NO inventar requisitos ni negar de memoria.

---

## Auth (igual que el resto de la API SalesBot↔Munify)

Backend a backend, API key estática.

- Header: `X-SalesBot-Key: <secret>`
- Mismo secret que el resto (`SALESBOT_API_KEY` en Munify / `MUNIFY_API_KEY` en SalesBot).

Ver `02-spec-api.md` para el patrón base.

---

## Endpoint a implementar en Munify

### `GET /api/salesbot/municipios/{municipio_id}/tramites`

Lista los trámites que ese municipio tiene **configurados y activos**, con el
detalle mínimo para que el bot pueda confirmar disponibilidad y guiar.

**Auth:** `X-SalesBot-Key`

**Query params (opcionales):**
- `q` (string): filtro por nombre/categoría. Si viene, devuelve solo los que matchean (útil para "¿tienen licencia de conducir?").

**Response 200:**
```json
{
  "municipio_id": 65,
  "municipio_nombre": "San Pedro",
  "tramites": [
    {
      "id": 12,
      "nombre": "Licencia de conducir",
      "categoria": "Tránsito",
      "canal": "online",                     // DERIVADO en Munify: "online" si hay url_externa, si no "presencial"
      "requiere_turno": true,                // columna real
      "url_externa": "https://...",          // crudo (transparencia / casos borde); null si no tiene
      "requiere_validacion_identidad": true, // RENAPER/biométrica
      "requisitos": ["DNI", "Certificado de aptitud psicofísica", "Pago de tasa"],
      "activo": true
    }
  ],
  "total": 1
}
```

**Notas de implementación:**
- Solo trámites con `activo = true` del municipio.
- `requisitos`: lo que el muni cargó; si no cargó nada → `[]` (el bot NO inventa requisitos).
- `modalidad` / `requiere_turno`: para que el bot encadene con el flujo de turnos si corresponde (ver `04-spec-turnos.md`).
- Sin valores hardcodeados: todo sale de la config real del municipio. Si un
  campo no está cargado, viene `null`/`[]` y el bot lo dice, no lo inventa.

> **Por qué un endpoint y no el KB:** el catálogo de trámites es **dinámico y
> por municipio**. No puede vivir en el prompt/knowledge estático del bot — tiene
> que consultarse en vivo. El KB solo describe CÓMO funciona Munify; el QUÉ
> trámites hay en cada muni sale de la API.

---

## Cómo lo usa el bot (SalesBot)

Tool existente: `munify_listar_tramites(municipio_id)` (ya declarada en
`bot_tools.py`). Hoy el bot de soporte NO la recibe porque al tener personalidad
se le excluyen las tools `munify_*`. Cambio del lado SalesBot (problema de
capacidad): habilitar las tools de **consulta** (read-only) a los bots con
personalidad, manteniendo excluidas las de **acción** (crear/reservar/cancelar).

**Flujo ante "¿puedo hacer el trámite X?":**
1. `munify_buscar_municipio(nombre)` → `municipio_id`.
2. `GET /municipios/{id}/tramites?q=X` (vía la tool).
3. Si está en la lista → guiar con `canal` + `requiere_turno` + `requisitos` (encadena turno si aplica).
4. Si NO está → "En {municipio} no figura ese trámite en Munify" y **derivar a un humano**. NUNCA negar de memoria ni inventar.

---

## Respuesta de Munify — estado real verificado (2026-06-17)

> Verificado contra código (`backend/api/salesbot.py`, `backend/models/tramite.py`)
> y contra el OpenAPI vivo de Cloud Run. NO son promesas: es lo que hay.

### Qué ya está expuesto y vivo

El endpoint **YA existe y está deployado**: `GET /api/salesbot/municipios/{id}/tramites`
(aparece en el OpenAPI live). **Pero hoy devuelve la versión mínima** — un array
plano, sin wrapper, sin `q`:

```json
[{ "id", "nombre", "descripcion", "activo" }]
```

Alcanza para "¿qué trámites tienen?" pero **NO** para "¿puedo hacer el trámite X?
¿qué necesito?" — que es el caso que falló (licencia de conducir).

### Gap del lado Munify: casi todo es servible YA, sin migración

Crucé campo por campo el spec contra las columnas reales del modelo `Tramite`.
Conclusión: **todo lo que pide el spec ya existe en la BD salvo `modalidad`.**

| Campo del spec | Fuente real en Munify | Estado |
|---|---|---|
| `id`, `nombre`, `activo` | `Tramite.id/nombre/activo` | ya se devuelve |
| `categoria` | `Tramite.categoria_tramite.nombre` (FK `categorias_tramite`) | columna existe, falta el join |
| `requiere_turno` | `Tramite.requiere_turno` (Boolean) | columna directa |
| `requiere_validacion_identidad` | `requiere_validacion_dni OR requiere_validacion_facial OR requiere_kyc` | derivable de columnas reales |
| `requisitos[]` | `Tramite.documentos_requeridos[].nombre` (tabla `tramite_documentos_requeridos`) | tabla existe, falta exponer |
| `q` (filtro) | `WHERE nombre/categoria LIKE` | trivial |
| `municipio_nombre`, `total` | `Municipio.nombre` + `len()` | join + wrapper |
| **bonus** `costo`, `tiempo_estimado_dias`, `requiere_cenat` | columnas reales (`requiere_cenat` es clave para licencia de conducir) | disponibles si los quieren |

**Único campo sin fuente directa: `modalidad`** (`online`/`presencial`/`online_con_turno`).
No hay columna `modalidad`. Se puede **derivar** (`url_externa` presente → online;
`requiere_turno` → presencial con turno) o exponer los campos crudos
(`requiere_turno` + `url_externa`) y que el bot decida. **NO se inventa un enum que no
existe.** → decisión pendiente (ver abajo).

### Gap del lado SalesBot (verificado en su repo)

- `services/munify_api.py::get_tramites(municipio_id)` **no manda `q`** → falta el param.
- `bot_tools.py` → tool `munify_listar_tramites` **no declara `q`** en su schema ni en el `_exec`.
- El bot de soporte (con personalidad) **no recibe las tools `munify_*`** → hay que
  habilitar las de **consulta** (read-only), manteniendo excluidas las de acción.
- Falta la **regla dura** en el prompt: "verificar contra el endpoint o derivar; nunca negar de memoria ni inventar requisitos".

### Decisión — RESUELTA (SalesBot, 2026-06-17)

`modalidad`: **se deriva en Munify, NO el bot.** Y NO como un enum de 3 valores
(que se comía `presencial_con_turno`), sino como **2 campos limpios**:

- **`canal`**: `"online"` | `"presencial"` — derivado determinístico en Munify:
  `url_externa` presente → `"online"`, si no → `"presencial"`.
- **`requiere_turno`**: bool (columna real, ya existe).
- **`url_externa`**: crudo en la respuesta (transparencia / casos borde); `null` si no tiene.

El bot **compone** el texto ("online, con turno" / "presencial, con turno" / etc.)
a partir de `canal` + `requiere_turno`. **Cero inferencia del LLM.**

**Por qué derivar en Munify y no en el bot:** todo este spec existe para que el bot
**verifique dato real y NO infiera/invente**. Si la interpretación online/presencial
vive en el LLM, reintroducimos exactamente el problema (el bot "decide" con criterio
propio). La regla es determinística → tiene que vivir en el backend, una sola fuente
de verdad. NO se inventa un enum que no existe: `canal` sale de un campo real
(`url_externa`) con regla documentada.

→ **No queda nada pendiente de decisión.** Munify puede enriquecer el endpoint y deployar.

---

## Prioridad

1. **Munify:** *enriquecer* el endpoint existente (NO crearlo — ya está vivo): agregar
   `q` + `categoria`, `canal` (derivado de `url_externa`), `requiere_turno`, `url_externa`,
   `requiere_validacion_identidad`, `requisitos[]` y el wrapper `{municipio_nombre, total}`.
   Sin migración (las columnas ya existen).
2. **SalesBot:** pasar `q` en `get_tramites`/tool, habilitar tools de consulta al bot de
   soporte + regla dura "verificar o derivar, nunca inventar".
3. **Test:** preguntar por un trámite que existe (debe confirmarlo con datos reales) y
   por uno que no (debe decir que no figura y derivar).
