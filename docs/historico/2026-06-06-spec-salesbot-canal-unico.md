# Spec SalesBot → Munify: canal ÚNICO por API (cortar acceso directo a BD)

> Para el agente que trabaja en `D:\Code\SalesBot`. Objetivo: el bot deja de
> conectarse directo a la base de Munify y pasa **todo** por la API HTTP de
> Munify. La base es propiedad de Munify; el bot solo habla con la API.

---

## 1. Regla de oro

El bot NO toca la base de Munify. Único canal permitido:

```
HTTP  +  header  X-SalesBot-Key: <key>   →   https://munify-api-vmpxsxe7ra-rj.a.run.app
```
**[DESCONTINUADO 2026-07-11, SP aislado → usar us-east4: https://munify-api-vmpxsxe7ra-uk.a.run.app]**

Cualquier `import` de `munify_db`, cualquier `create_async_engine` apuntando a
`sugerenciasmun`, cualquier `SELECT` crudo contra tablas de Munify: **se elimina**.

---

## 2. Config del bot

### Quedan (2 variables)

```
MUNIFY_BASE_URL=https://munify-api-vmpxsxe7ra-rj.a.run.app   # sin /api al final
MUNIFY_API_KEY=<la que ya está seteada>                       # va en X-SalesBot-Key
```
**[DESCONTINUADO 2026-07-11, SP aislado → usar us-east4: https://munify-api-vmpxsxe7ra-uk.a.run.app]**

`MUNIFY_API_KEY` es la que el bot ya usa (hoy ya le pega a varios endpoints y dan
200). No cambia. Si hay que reconfirmar el valor, lo provee Munify por canal
seguro — no va escrito en este documento.

### Se borran (5 variables)

```
MUNIFY_DB_HOST       MUNIFY_DB_PORT       MUNIFY_DB_USER
MUNIFY_DB_PASSWORD   MUNIFY_DB_NAME
```

Munify revoca el usuario `salesbot_ro` en Aiven una vez confirmado el corte, así
que estas credenciales dejan de funcionar. No las dejes como fallback.

---

## 3. Endpoints disponibles

Base: `https://munify-api-vmpxsxe7ra-rj.a.run.app` **[DESCONTINUADO 2026-07-11, SP aislado → usar us-east4: https://munify-api-vmpxsxe7ra-uk.a.run.app]**
Todos los del bot llevan header `X-SalesBot-Key`. (Los `mi-config` son JWT del
panel del municipio — el bot NO los usa, se listan solo para que no los confundas.)

| Método | Ruta | Auth | Devuelve |
|---|---|---|---|
| GET  | `/api/salesbot/municipios` | key | Lista de activos: `id, nombre, codigo, logo_url, color_primario, telefono, whatsapp, whatsapp_habilitado, stats` |
| GET  | `/api/salesbot/municipios/{id}/detalle` | key | + `descripcion, email, sitio_web` y `stats` con `tasa_resolucion_pct` + `categorias_reclamo[]` |
| GET  | `/api/salesbot/municipios/{id}/tramites` | key | `[{id, nombre, descripcion, activo}]` (solo activos) |
| GET  | `/api/salesbot/municipios/{id}/categorias` | key | `[{id, nombre, descripcion}]` categorías de reclamo |
| GET  | `/api/salesbot/municipios/{id}/dependencias` | key | `[{id, nombre, telefono, email}]` áreas del muni |
| POST | `/api/salesbot/consulta` | key | Consulta SQL libre read-only (ver §4) |
| ~~GET/PUT~~ | ~~`/api/salesbot/mi-config`~~ | JWT | (panel del municipio — no usar desde el bot) |

`stats` = `{reclamos_totales, reclamos_resueltos, tramites_activos, vecinos}`.

---

## 4. POST /api/salesbot/consulta (reemplaza `consultar_libre`)

Para el modo admin por palabra clave. Antes el bot abría conexión directa y
corría el SELECT; ahora se lo pide a Munify y **Munify lo ejecuta** contra su
propia base, en sesión MySQL READ ONLY.

**Request**
```
POST /api/salesbot/consulta
X-SalesBot-Key: <key>
Content-Type: application/json

{ "sql": "SELECT id, nombre FROM municipios LIMIT 10", "explicacion": "opcional" }
```

**Response OK**
```json
{ "ok": true, "sql_ejecutado": "SELECT ... LIMIT 10", "total": 10, "rows": [ ... ] }
```

**Response error** (no rompe, devuelve 200 con `ok:false`)
```json
{ "ok": false, "error": "SQL bloqueado: contiene 'update'", "sql_intentado": "..." }
```

**Defensas que aplica Munify** (no las repliques del lado bot, solo manejá la respuesta):
- Solo `SELECT / WITH / SHOW / DESCRIBE`. Cualquier otro prefijo → rechazado.
- Blacklist de escritura: `update, delete, insert, drop, alter, create, truncate,
  grant, revoke, rename, set, lock, call, load, replace, into, outfile, dumpfile`.
- Una sola sentencia (sin `;` interno). Sin comentarios (`--`, `/*`).
- `LIMIT 200` forzado si no viene. Timeout 8s.
- Ejecución en sesión READ ONLY: si una escritura zafa del filtro, la rechaza el motor.

> La validación admin por palabra clave (`Bartolo-<slug>-admin`, TTL 30 min)
> **se queda del lado del bot** — es lógica de conversación, no de la API. El bot
> valida la sesión admin y, si está OK, llama a este endpoint.

---

## 5. Mapa de migración (función directa → endpoint)

| `munify_db.py` (borrar) | Reemplazo por API |
|---|---|
| `buscar_municipio(nombre)` | `GET /municipios` + match por nombre en el bot (ya existe `buscar_municipio_api`) |
| `es_cliente_munify(nombre)` | `GET /municipios`: si aparece, es cliente |
| `stats_municipio(id)` | viene en `stats` de `/municipios` y `/detalle` |
| `listar_tramites(id)` | `GET /municipios/{id}/tramites` |
| `listar_categorias_reclamos(id)` | `GET /municipios/{id}/categorias` |
| `listar_dependencias()` | `GET /municipios/{id}/dependencias` (ojo: ahora es **por municipio**, antes devolvía todas) |
| `consultar_libre(sql)` | `POST /consulta` |

---

## 6. Checklist de cambios en el bot

- [ ] Borrar `backend/services/munify_db.py`.
- [ ] Reescribir la tool `_exec_munify_consulta_libre` (`bot_tools.py`): mantener la
      validación de sesión admin, pero en vez de `from services.munify_db import
      consultar_libre`, llamar `POST {BASE_URL}/api/salesbot/consulta` con el header.
- [ ] Sacar el healthcheck directo a la BD en `main.py` (el bloque
      `if settings.MUNIFY_DB_HOST and settings.MUNIFY_DB_PASSWORD: ... SELECT COUNT(*)`).
- [ ] Borrar las 5 env `MUNIFY_DB_*` de la config y del deploy.
- [ ] Quitar `MUNIFY_DB_*` de `core/config.py` (Settings).
- [ ] Confirmar a Munify que ya no hay accesos directos → Munify revoca `salesbot_ro`.

---

## 7. Estado del lado Munify

- Endpoints GET (`/municipios`, `/detalle`, `/tramites`, `/categorias`,
  `/dependencias`): **vivos en producción**.
- `POST /api/salesbot/consulta`: **implementado**, pendiente de deploy a Cloud Run.
- Revocación de `salesbot_ro`: se hace cuando el bot confirme que cortó el acceso directo.
