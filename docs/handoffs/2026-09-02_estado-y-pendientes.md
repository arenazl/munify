# HANDOFF — 2026-09-02 · IA a Groq, login de /calls, telemetría y el módulo Patrimonio

> Sesión larga y con varios temas cruzados. Esto es la cáscara para seguir en
> contexto nuevo: qué quedó hecho, qué está a medias y qué decide el dueño.
> **Todo está pusheado a `qa`.** Nada se tocó en producción.

---

## 0. Lo primero que tenés que saber

| dato | valor |
|---|---|
| Base de QA | **`sugerenciasmun-qa`** |
| Base de producción | **`munify_prod`** |
| Bases que YA NO existen | `sugerenciasmun`, `sugerenciasmun-ensayo` (si un doc las nombra, es viejo) |
| Backend QA | `https://munify-api-qa-vmpxsxe7ra-uk.a.run.app` |
| Front QA | `qa-app.munify.com.ar` y `app-qa.munify.com.ar` (Cloudflare Pages) |
| Front QA VIEJO, no usar | `munify-qa.netlify.app` — quedó congelado |
| Sesión de Infra | `structure-6f` (proyecto `d:\Code\structure`) |
| Otra sesión de Munify | `sugerenciasmun-72` — tiene el tema **demos** (ver §6) |

**El árbol de Alembic tiene MÚLTIPLES HEADS:** `alembic upgrade head` falla.
Para tablas nuevas se usa un script idempotente con `create_all(checkfirst=True)`
y guarda que aborta contra producción — molde:
`backend/scripts/crear_tablas_calls_e_ia_uso.py`.

---

## 1. La IA es Groq y sólo Groq — HECHO y verificado

Gemini se sacó por costo. **Un solo proveedor, sin fallback.**

- `services/groq_common.py` es ahora el **único** lugar que le habla a Groq.
  Los seis que lo hacían por su cuenta pasan por ahí.
- **El gotcha que costaba caro:** `openai/gpt-oss-120b` razona por default y ese
  razonamiento se descuenta de `max_tokens`. Con `max_tokens=300` y sin
  `reasoning_effort: "low"`, devuelve `content` VACÍO con
  `finish_reason="length"` — sin error y sin log. La clasificación de reclamos
  estuvo muda por eso. Medido: 300 sin el parámetro → vacío; 300 con `low` →
  respuesta completa en 152 tokens.
- Verificado en QA: `{"metodo_principal":"groq"}` clasificando "Bacheo y calles"
  al 92% donde el matcheo local decía "Agua y cloacas".

**Keys:** QA usa el secret `GROQ_API_KEY` (versión 2, `munify-qa`); producción
usa `GROQ_API_KEY_PROD` (`munify-prod`), que Infra ya montó. La versión 1 quedó
deshabilitada: era la key global de `APP_GUIDE\.env.master` que compartían todas
las apps del dueño, y cuando la borró del panel se cayeron todas juntas. **No
volver a poner la key de Munify en `.env.master`.**

---

## 2. `/calls` con login — HECHO y verificado

Era una página pública con su endpoint de IA abierto: un POST sin credenciales
devolvía 422, o sea que cualquiera podía gastar la cuota de Groq de la app.

- Tablas: `calls_usuarios`, `calls_registro`, `calls_evento` (ya creadas en QA).
- `POST /public/calls/login`, `GET /pipeline`, `POST /registro/{muni_key}`,
  `POST /importar`. El endpoint de IA **exige login**.
- Usuarios sembrados: **`lucas`** y **`sofi`**.
- Verificado: IA sin token → 401; con token → 200; las dos credenciales entran.

### PENDIENTE (§ lo más importante de /calls)
**El pipeline compartido todavía no está enganchado en la página.** El backend
está entero, pero `plantilla.html` sigue guardando en `localStorage`: Lucas y
Sofía **no se ven entre ellos**. Falta:

1. `cargar()` → `GET /pipeline` después del login.
2. `guardar(id)` → `POST /registro/{muni_key}` con los eventos.
3. Al primer login, ofrecer subir lo que ya tiene en el navegador con
   `POST /importar` (no pisa lo compartido).
4. Refresco al abrir una ficha, para ver lo que anotó el otro.

**Regla del archivo:** `frontend/public/calls/index.html` es GENERADO. Se edita
`scripts/calls/plantilla.html` y se corre `python scripts/calls/build_calls.py`.
Validar siempre el JS antes de pushear (un error de sintaxis tumba la página):
extraer el `<script>` y pasarlo por `node --check`.

---

## 3. Telemetría de IA — HECHA, sin usar todavía

Pedido del dueño: armar la estructura para encontrar el punto dulce
tokens/modelo/performance ahora que el volumen es chico.

- `ia_uso` (una fila por llamada, **sin prompts ni respuestas**) e
  `ia_uso_diario`. Tablas creadas en QA.
- Guarda tokens, latencia, `finish_reason`, **`respuesta_vacia`** y
  `cayo_a_fallback`. Con esos dos campos, el bug de gpt-oss saltaba solo.
- Pantalla `ConsumoIA` (kit abmv2), Super Admin → **Consumo**.
- Volumen: ~120 bytes por fila, ~9 MB al año con el volumen actual. Poda a 90
  días pendiente de implementar (hoy no hay job).

**No verificado en ambiente**: nadie la usó todavía.

---

## 4. Módulo **Patrimonio** — base y menú HECHOS, falta la semilla

`inventario` + `flota` eran dos switches para lo mismo: un vehículo ya era un
`inventario_items` con `naturaleza=ACTIVO`, y `flota_cargas` sólo le cuelga la
bitácora de combustible. Además `inventario` era un módulo fantasma (estaba en
la tabla y en el sidebar, pero no en el catálogo del front).

- **Base:** `backend/scripts/fusionar_modulo_patrimonio.py` — ya ejecutado en QA.
  6 filas de `patrimonio`, todas activas. **Merlo (id 1000149) encendido.**
- **Menú:** sección **Patrimonio** (lo que el municipio TIENE) con el catálogo
  —que **volvió al sidebar**—, Movimientos, Compras y Flota. "Campo" pasó a
  **"Trabajos"** (lo que el municipio HACE).

### PENDIENTE
1. **Probarlo en Merlo** (el tenant de prueba de ahora en adelante). Nadie lo
   abrió todavía.
2. **Llevarlo a la semilla**: las demos nuevas tienen que nacer con
   `patrimonio`. Mirar `backend/services/seed_demo.py` y
   `backend/scripts/semillas/`. Hoy siguen sembrando el esquema viejo.
3. **Producción**: el mismo script lo corre **Infra**, no nosotros.

---

## 5. Bartolo / San Pedro Norte

- **Tarjeta de crédito:** el circuito ya está entero en producción (endpoints,
  tabla `tarjetas_credito`, la Visa ···9594, la UI en el bundle, módulo
  `tesoreria` activo). Lo único que faltaba era el **límite en 0**: se puso en
  **3.000.000** en QA y se le pidió a Infra el mismo `UPDATE` en `munify_prod`.
- **Lo que Bartolo quiere probar (Movimientos, Compras, autos) NO existe en
  producción**: esas pantallas son posteriores al 28-ago. Verificado sobre el
  bundle que sirve `app.munify.com.ar`.

---

## 6. Lo que está en manos de otros

| tema | quién |
|---|---|
| **Promoción `qa`→`master`** (498 commits; prod está en el commit del 28-ago) | **Infra**, ya autorizada por el dueño y pedida en regla |
| Crear en `munify_prod` las 5 tablas nuevas ANTES de promover | **Infra** (si no, `/public/calls/*` y `/admin/ia-uso/*` dan 500) |
| Sacar `GEMINI_API_KEY` de prod DESPUÉS de promover | **Infra** |
| `UPDATE` del límite de la tarjeta en prod | **Infra** |
| **Vitrina de demos con acceso por link personal** | sesión **`sugerenciasmun-72`** |

Sobre las demos, un hallazgo que le pasé y conviene no perder: la card de cada
demo tiene un **botón de eliminar público y sin credencial** — hoy cualquiera
puede borrar las cuatro vitrinas comerciales.

---

## 7. Cosas sueltas que encontré y no arreglé

- **`backend/.env.bak-1802` tiene credenciales y NO está en el `.gitignore`.**
  Se me coló una vez en un `git add -A` y lo saqué a tiempo. Hay que ignorarlo
  o borrarlo — es del dueño, no lo toqué.
- El link **"IA" del sidebar del superadmin estaba roto** (apuntaba a
  `/gestion/admin/configuracion-ia`, la ruta es `/gestion/configuracion-ia`).
  **Corregido.**
- `Configuracion.tsx` tiene 9 errores de ESLint **preexistentes** (`any` y un
  import sin usar). No son de esta sesión, pero ensucian el gate.
- El **árbol de Alembic con múltiples heads** merece un merge de heads. Se lo
  avisé a Infra: el día que promuevan con migraciones de por medio, duele.

---

## 8. Gates, siempre

```bash
# backend
python -m pyflakes backend/<archivos tocados>

# frontend (los dos, no alcanza tsc)
cd frontend && npx tsc -b --pretty false
cd frontend && npx eslint src/<archivos tocados>

# build: sin BACKEND_ORIGIN corta a propósito
BACKEND_ORIGIN="https://munify-api-qa-vmpxsxe7ra-uk.a.run.app" npm run build
```

Se pushea **siempre a `qa`**. Nunca a `master`, nunca a la base de producción.
