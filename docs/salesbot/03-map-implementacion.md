# Mapa de implementación — Munify ↔ SalesBot (lado Munify)

> Contrato de lo que **Munify** expone para SalesBot. Para pasar al agente de SalesBot
> así integra contra esto. Basado en `02-spec-api.md` con ajustes reales
> (modelos verificados contra la BD de Munify).

## Resumen — 2 partes

1. **Config por municipio** (tenant-scoped): cada muni setea, desde su panel, el
   número de WhatsApp al que SalesBot deriva + un switch "habilitado". Vive en una
   **tabla nueva y aparte** (`salesbot_configs`), desacoplada de la config de WhatsApp
   Business / Meta (que es enorme y requiere negocio aprobado). Un muni puede estar en
   SalesBot SIN tener Meta configurado. Es solo una derivación.
2. **API general** (cross-municipio, NO tenant-scoped): los endpoints `/api/salesbot/*`
   que SalesBot consume. Auth con API key estática backend-to-backend.

## Base URL (producción)

```
https://munify-api-1060106389361.southamerica-east1.run.app
```
(Backend en Google Cloud Run, NO Heroku.)

## Auth — backend a backend

Header en cada request: `X-SalesBot-Key: <secret>`

- En Munify: env var `SALESBOT_API_KEY` (en Secret Manager de Cloud Run).
- En SalesBot: `MUNIFY_API_KEY` (mismo valor) + `MUNIFY_BASE_URL` (la de arriba).
- El secret se genera con `secrets.token_hex(32)` y se comparte 1 vez (no va en código ni docs).

Sin key válida → `403 Forbidden`.

---

## Endpoints generales (lo que SalesBot llama)

### 1. `GET /api/salesbot/municipios`

Lista TODOS los municipios activos con su derivación de WhatsApp + stats.

**Auth:** `X-SalesBot-Key`

**Response 200:**
```json
[
  {
    "id": 80,
    "nombre": "San Pedro Norte",
    "codigo": "spn",
    "logo_url": "https://res.cloudinary.com/.../logo.png",
    "color_primario": "#3B82F6",
    "whatsapp": "+54 9 351 123-4567",
    "whatsapp_habilitado": true,
    "stats": {
      "reclamos_totales": 142,
      "reclamos_resueltos": 89,
      "tramites_activos": 23,
      "vecinos": 310
    }
  }
]
```

- `whatsapp` / `whatsapp_habilitado` ← tabla `salesbot_configs` (NO `WhatsAppConfig`).
  Si el muni no configuró SalesBot → `whatsapp: null`, `whatsapp_habilitado: false`.
- Solo municipios con `activo = true`.

### 2. `GET /api/salesbot/municipios/{id}/detalle`

Detalle de un municipio (cuando el prospecto ya eligió uno).

**Auth:** `X-SalesBot-Key`

**Response 200:**
```json
{
  "id": 80,
  "nombre": "San Pedro Norte",
  "codigo": "spn",
  "descripcion": "Municipio de la sierra...",
  "telefono": "+54 9 351 000-0000",
  "email": "contacto@spnorte.gob.ar",
  "sitio_web": "https://spnorte.gob.ar",
  "logo_url": "https://...",
  "color_primario": "#3B82F6",
  "whatsapp": "+54 9 351 123-4567",
  "whatsapp_habilitado": true,
  "stats": {
    "reclamos_totales": 142,
    "reclamos_resueltos": 89,
    "tasa_resolucion_pct": 63,
    "tramites_activos": 23,
    "categorias_reclamo": ["Luminaria", "Baches", "Residuos"],
    "vecinos": 310
  }
}
```

**404** si el municipio no existe o está inactivo.

---

## Definición de los stats (queries reales en Munify)

| Campo | Cómo se calcula |
|---|---|
| `reclamos_totales` | `COUNT(reclamos WHERE municipio_id = X)` |
| `reclamos_resueltos` | `COUNT(reclamos WHERE municipio_id = X AND estado IN ('finalizado','resuelto'))` (`resuelto` es legacy) |
| `tasa_resolucion_pct` | `round(resueltos / totales * 100)` (0 si no hay reclamos) |
| `tramites_activos` | `COUNT(tramites WHERE municipio_id = X AND activo = true)` — tipos de trámite que ofrece el muni |
| `vecinos` | `COUNT(usuarios WHERE municipio_id = X AND rol = 'vecino')` |
| `categorias_reclamo` | nombres distintos de categorías de reclamo del muni (top ~5), solo en `/detalle` |

Fuentes: modelos `Reclamo` (`estado` enum), `Tramite` (`activo`), `User` (`rol`),
`CategoriaReclamo`, `Municipio` (datos de contacto), `SalesbotConfig` (whatsapp/habilitado).

---

## Tabla nueva en Munify

`salesbot_configs` — config de derivación por municipio:

| Columna | Tipo | Nota |
|---|---|---|
| `id` | int PK | |
| `municipio_id` | int FK (unique) | un registro por muni |
| `whatsapp` | varchar(30) | número al que SalesBot deriva (formato `+54 9 ...`) |
| `habilitado` | bool (default false) | si el muni se ofrece en SalesBot |
| `created_at` / `updated_at` | datetime | |

El muni la edita desde su panel (pestaña "SalesBot" dentro de Config de WhatsApp).

---

## Flujo Bruno (SalesBot) — sin cambios respecto al spec

1. Usuario pregunta por un municipio → SalesBot llama `/municipios`, matchea por nombre.
2. Muestra stats básicos (reclamos resueltos, trámites, vecinos).
3. Usuario confirma → SalesBot responde con `wa.me/{whatsapp sin espacios ni +}`.
4. Si `whatsapp_habilitado = false` → SalesBot ofrece el `telefono` del `/detalle`.

## Lado SalesBot (referencia, lo hace el otro agente)

- `MUNIFY_BASE_URL` + `MUNIFY_API_KEY` en su `.env`.
- Cliente HTTP `munify_api.py` (httpx) que pega a los 2 endpoints con el header.
- Cachear `/municipios` (cambia poco).

---

## Estado / pendiente del lado Munify

- [ ] Tabla `salesbot_configs` + modelo + migración.
- [ ] `SALESBOT_API_KEY` en `core/config` + Secret Manager.
- [ ] `api/salesbot.py` (los 2 endpoints generales) + registrar router en `main.py`.
- [ ] Endpoints admin per-muni (cargar/guardar la config de derivación) para la pestaña.
- [ ] Pestaña "SalesBot" en la pantalla de Config de WhatsApp (número + toggle).
- [ ] Deploy backend a Cloud Run + compartir el `SALESBOT_API_KEY`.

> **Desvío respecto al spec original:** el spec mapeaba `whatsapp`/`whatsapp_habilitado`
> a `WhatsAppConfig.telefono_wa_me_saliente` / `.habilitado`. Acá usamos la tabla
> **`salesbot_configs`** dedicada para no acoplar la derivación con la integración Meta.
> La forma de las respuestas para SalesBot es idéntica — el cambio es solo de dónde
> salen esos 2 campos del lado Munify.
