# Instrucciones para Claude — reglas duras

> ### OJO: hay un SUBPROYECTO hermano — `munify-calls`
>
> La página de llamados comerciales (`calls.munify.com.ar`) **ya no vive acá**: tiene
> repo propio en `d:\Code\munify-calls` (`github.com/arenazl/munify-calls`, branch
> único **`main`**), con **su propio `CLAUDE.md`**. Los dos proyectos están
> relacionados y ninguno se entiende solo:
>
> - la **página** está allá; el **backend que consume** está acá
>   (`backend/api/calls.py`, `calls_ia.py`, `calls_push.py`, montados en
>   `/api/public/calls`) y usa la **base de QA**;
> - un cambio de ruta o de payload casi nunca es de un solo lado.
>
> Si estás trabajando en la página de llamados, la doc que manda es
> `d:\Code\munify-calls\CLAUDE.md` y esta es la auxiliar. **Pushear a `qa` acá NO
> publica calls** — calls publica con push a `main` de su repo.


## REGLA PRINCIPAL

**ANTES de tocar UNA SOLA línea de código en este repo, leer `BUILD_GUIDE.md`** (en
la raíz). Ese archivo es la fuente de verdad de **cómo se construyen las cosas en
esta app**: qué componentes ya existen, qué patrones usamos para ABMs, dónde está
cada cosa.

> **`d:\Code\APP_GUIDE\components\`** es la fuente canónica de componentes core
> reutilizables (versión **agnóstica**, sin lógica de Munify). Cuando mejoramos
> un componente core en este repo Y el cambio es **estable** (no custom de
> Munify), OBLIGACIÓN de portar el cambio en versión agnóstica a
> `APP_GUIDE\components\`. Si el cambio es lógica/copy específicos de Munify,
> queda solo acá.

---

## PRE-FLIGHT CHECKLIST (obligatorio antes de codear UI o backend)

Antes de escribir código nuevo, responder estas preguntas. Si la respuesta es
**"no sé"** a cualquiera, **parar, leer la sección referenciada en
`BUILD_GUIDE.md`**, o preguntar al user. No codear a ciegas.

### Para UI nueva
1. ¿Qué pantalla estás creando? → §7 de BUILD_GUIDE (patrones canónicos).
2. **Para cada input del form, ¿qué componente vas a usar?** → §5 de BUILD_GUIDE (tabla "Para esto → usá esto"). Si no sabés si existe el control que necesitás, leé §6 (inventario completo de `components/ui/`).
3. ¿Qué página existente es tu referencia? → §7.
4. ¿Cómo abrís modales/side panels? → `Sheet` (edición) o `WizardModal` (crear multi-paso). NUNCA modal a mano.
5. ¿Cómo manejás colores? → `useTheme()`. CERO hex inline.
6. ¿Cómo manejás estados/enums? → Single Source of Truth en `lib/enums/`. NO redefinir colores localmente.

### Para backend nuevo
1. ¿Cómo se llama el router y dónde se registra? → `backend/api/<entidad>.py` + `main.py`.
2. **¿Filtrás SIEMPRE por `municipio_id == current_user.municipio_id`?** Esto NO es opcional — olvidarse es leak de tenants.
3. ¿Validás el rol al inicio del handler?
4. ¿Hay cambio de schema? Si sí → migración (Alembic o script ad-hoc) y ejecutarla **sin preguntar** (ver abajo).
5. ¿Dispara notificación? Usar helpers en `backend/services/notificaciones.py`.

---

## MIGRACIONES DE BASE DE DATOS

**SIEMPRE ejecutar los cambios de schema automáticamente. NO preguntar.**

Dos formas válidas:

**A) Alembic** (preferido para cambios formales): `backend/alembic/versions/NNN_xxx.py` con `def upgrade()` / `def downgrade()`.

**B) Script ad-hoc** (cambios urgentes o seeds):
```python
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from core.config import settings

async def migrate():
    engine = create_async_engine(settings.DATABASE_URL)
    async with engine.begin() as conn:
        await conn.execute(text("ALTER TABLE..."))
    await engine.dispose()
```

---

## REGLAS DURAS DE DESARROLLO (NO NEGOCIABLES)

### 1. DRY — componentes compartidos
- NUNCA duplicar componentes visuales. Si un patrón visual aparece 2+ veces, hay que extraerlo al kit `components/abmv2/` (regla 6.bis — la carpeta vieja no recibe piezas nuevas).
- Variaciones se manejan con **props**, no duplicando componentes (ej. `<ReclamoCard showCreador />`, NO `<ReclamoCardVecino>` + `<ReclamoCardSupervisor>`).
- **Antes de crear** un componente nuevo, buscar en `components/ui/` (correr `python scripts/generate_ui_inventory.py` si dudás del inventario actual).

### 2. Single Source of Truth para enums/estados
- Estados (`estadoColors`, `estadoLabels`, `estadoIcons`) definidos en **un solo lugar** dentro de `frontend/src/lib/enums/`.
- Resto de archivos importan de ahí, no duplican.
- **Test mental:** "si agrego un estado mañana, ¿cuántos archivos toco?" Si son más de 2 → diseño mal.

### 3. Código resiliente — patrón con fallback
```tsx
// ✅
const color = estadoColors[estado] || estadoColors.default || theme.muted;
const label = estadoLabels[estado] || estado;

// ❌ switch exhaustivo (rompe al agregar un estado)
switch(estado) { case 'recibido': ...; case 'en_curso': ...; }
```
Notificaciones, subscripciones y eventos deben manejar estados desconocidos gracefully.

### 4. Controles nativos VETADOS
Rompen el theme/dark mode. **Prohibidos en toda la app.**

| Nativo ❌ | Usá ✅ |
|---|---|
| `<select>` | `ModernSelect` |
| `<input type="date">` (fecha) | `DatePicker` |
| `<input type="date">` x2 (rango) | `DateRangePicker` |
| `<input type="text">` para dirección | `DireccionAutocomplete` |
| `window.confirm()` / `window.alert()` | `ConfirmModal` / `toast` (sonner) |

Inventario completo y demás reemplazos: **BUILD_GUIDE.md §5 y §6**.

### 5. Colores: cero hex inline
- `useTheme()` y `theme.primary`, `theme.success`, `theme.danger`, etc.
- **PROHIBIDO** `'#22c55e'`, `bg-[#3b82f6]`, `bg-[var(--xxx)]` ad-hoc inventado.

### 6. ABMs con Sheet, no con rutas separadas
- Lista + Sheet en la misma ruta. Click en card abre Sheet en modo edición.
- **NUNCA** rutas `/<entidad>/nuevo`, `/<entidad>/:id`, `/<entidad>/:id/edit`.

### 6.bis. Pantallas NUEVAS = kit abmv2. `ABMPage` es LEGACY.
Toda pantalla nueva se arma con el kit `components/abmv2/` — `SemanticAbmPage`
como composición mayor, o sus PIEZAS sueltas (hero semántico y sus variantes,
strip de 5 KPIs con veredictos, acciones por frase, filtros, las tres vistas,
`DataTable` con sus kinds, `SideModal`, píldoras adaptativas↔combo,
`IconColorPicker`). Es un gran componente hecho de partes: una pantalla puede
usar una pieza o todo. **Prohibido implementar pantallas nuevas sobre
`components/ui/ABMPage`** (queda sólo para las viejas aún no migradas).
**La carpeta de controles vieja (`components/ui/`) está DEPRECADA como
canon**: no se agrega nada ahí; los controles que el kit aún consume desde
ahí (combo moderno, píldoras adaptativas, date pickers…) se MIGRAN a la
suite v2 con el concepto nuevo — tontos (el padre declara contenido y
colores) y POLIMÓRFICOS/adaptables al contenedor (píldoras cuando entran,
combo cuando no; la forma la decide el espacio).
*Why:* el dueño detectó implementaciones nuevas cayendo al ABM y controles
viejos (2026-08-14). El estándar estético vive en el kit, no en cada pantalla.

**6.ter. Si TOCÁS una pantalla que usa `ABMPage`, la MIGRÁS a `abmv2`.**
No alcanza con que lo nuevo use el kit: `ABMPage` **no debería existir más**
(dueño, 2026-08-31). No es una migración masiva de golpe — es la regla del
campamento: la pantalla que se toca, se deja migrada. Quedan **28** usando
`components/ui/ABMPage` (`grep -rln "components/ui/ABMPage" frontend/src/pages/`).
Cuando el contador llegue a cero, se borra el componente.

Si migrar la pantalla es mucho más grande que el arreglo pedido, se avisa
antes y se decide — pero el default es migrarla, no sumar un parche más al
componente viejo.

### 7. Multi-tenant (backend)
- TODA query con `municipio_id` filtra por `current_user.municipio_id`. Sin excepciones.

### 8. Emojis Unicode prohibidos
- Cero emojis en UI, código, commits, labels. Sólo iconos `lucide-react` vía `<DynamicIcon name="Building2" />` o import directo.

### 9. [SÓLO LEGACY] Header de ABMPage: input al 100%, botón "Nuevo" anclado a la derecha
> Aplica únicamente al MANTENIMIENTO de pantallas viejas sin migrar (regla 6.bis).
La primera línea de toda pantalla ABM (la del título + input + controles + botón "Nuevo") **siempre tiene que llegar al 100% del ancho disponible**, con esta distribución horizontal:

```
[Título] [|] [Input búsqueda  ──── crece a llenar ────] [Toggle vista] [HeaderActions] [+ Nuevo]
```

Reglas:
- **El input de búsqueda es el "flex grow"**: ocupa TODO el espacio sobrante entre el título y los controles de la derecha. Si hay pocos controles, el input se hace más largo; si hay muchos, se achica. Nunca un gap muerto.
- **El botón "Nuevo" siempre dockeado a la derecha**, como último elemento.
- **No usar `searchMaxWidth` para "limitar" el input** — eso crea gaps muertos entre input y los controles. Si alguna pantalla lo está usando, removerlo.
- Los chips/combos del medio (`toolbar.combos`, filtros, toggles de vista) van entre el input y el botón Nuevo, en su tamaño natural.

**Why:** El user lo marcó como regla dura tras ver pantallas (Reclamos) con input chico y un hueco vacío al lado. La fila del header tiene que sentirse "completa" — el input absorbe el sobrante, no se deja espacio en blanco.

**How to apply:** Ante cualquier ABMPage nuevo o existente, jamás pasar `searchMaxWidth`. Si encontrás `searchMaxWidth={N}` en código existente, borralo en el mismo cambio.

### 9.bis. [SÓLO LEGACY] ABMPage acepta `toolbar` Y `headerActions` juntos — NO silenciar uno
> Aplica únicamente al MANTENIMIENTO de pantallas viejas sin migrar (regla 6.bis).
Hoy `ABMPage` compone ambas props si vienen juntas: primero las acciones del `toolbar` (chips/combos/toggles), después los botones extra del `headerActions` (ej: "Unificar duplicados" en `TesoreriaContactos`).

**Why:** Antes el código hacía `effectiveHeaderActions = toolbar ? renderToolbarActions() : headerActions` — o sea, si la página pasaba ambos, **se perdían silenciosamente los botones de headerActions**. Bug real: el botón "Unificar duplicados" estuvo invisible en prod durante varias semanas en 4 páginas (TesoreriaContactos, OrdenesPago, SueldosEmpleados, Tesoreria) sin que nadie se diera cuenta hasta que un user lo reportó.

**How to apply:** Cualquier customización futura de `ABMPage` (cambio de layout del header, refactor de cómo se renderizan acciones) tiene que **probar el caso compuesto** (`toolbar` + `headerActions` pasados al mismo tiempo). Si necesitás cambiar la composición, escribilo en el comentario de la línea y dejá al menos una página de testing que pase ambos (TesoreriaContactos es buena referencia). Nunca volver al patrón "una sobreescribe a la otra" — si querés mutua exclusión, andá por error explícito (`throw`), no por silencio.

### 10. Sidebar: items de UNA SOLA palabra
Los `name` de items del sidebar (`frontend/src/config/navigation.ts`) **siempre tienen que ser una sola palabra**. Si la función natural se nombra con dos ("Mis Reclamos", "Categorías Trámite", "Órdenes de Pago"), se reduce a la palabra que **abarque** la función completa ("Reclamos", "Trámites", "Órdenes").

**Why:** El sidebar es angosto (`13rem` expandido) y cualquier label de dos palabras se corta con ellipsis. El user marcó esto como regla dura tras ver pantallas con "Cajas y Saldo…" y "Movimiento…" cortados. Una palabra siempre entra; dos nunca.

**How to apply:** Antes de agregar un item nuevo a `navigation.ts`, si el nombre natural tiene espacio, buscar la palabra que abarque las dos. Si hay colisión con otro item del sidebar (ej. "Reclamos" del admin vs "Mis Reclamos" del vecino), confirmar que las `show` conditions son mutuamente excluyentes — si lo son, ambos pueden llamarse igual sin problema. La distinción visual la hace la categoría de arriba. Las páginas/títulos/funciones internas mantienen su nombre completo; la regla aplica **solo al label del sidebar**.

---

## REGLAS DE TRABAJO CON EL USER

### 11. Jamás modificar módulos centrales sin consentimiento explícito
Proponer en texto primero (qué archivo, qué cambio, por qué). Esperar "dale" /
"hacelo" / "aplicalo". "Aplicá los cambios que consideres" NO es carta blanca.

### 12. Respuestas en UNA línea por defecto
Excepción: cuando el user pide explícitamente listas, detalle, o roadmap.

### 13. No adivinar — verificar con datos reales
Si el user duda de un resultado o pregunta "¿esto es real?", ejecutar query/script
contra la fuente real (DB, API, código), no responder con hipótesis.

### 14. CLIs primero, dashboard después
El user tiene `gh`, `gcloud`, `wrangler`, `git`, `npm`, `node`, `python`, `docker`
autenticados localmente. Antes de pedirle clicks o credenciales, intentar la CLI.

### 15. Deploy — DÓNDE VIVE CADA COSA (fuente única, leer antes de deployar)

> **HEROKU ESTÁ MUERTO. NO EXISTE MÁS PARA ESTE PROYECTO.** Nunca correr
> `git push heroku`. Si ves un `Procfile` o el remote `heroku`, es legacy —
> ignorarlo. Un push a Heroku NO deploya nada (el servicio está inactivo) y da
> la falsa sensación de haber deployado. Esto ya causó un desastre real.

> **NETLIFY TAMPOCO EXISTE MÁS** (dueño, 2026-09-03). **Todos** los fronts del
> ecosistema Munify están en **Cloudflare Pages**. Cualquier mención en docs, código
> o memoria a `munify-qa.netlify.app`, `paraguay-limpio.netlify.app`, `netlify.toml`,
> `netlify deploy` o a site IDs de Netlify es **legacy**: ignorarla o corregirla.

**Arquitectura REAL (verificada contra los triggers de Cloud Build, 2026-09-03):**

Todo el CD son triggers de **Cloud Build** (proyecto GCP `munify-api`, región
`us-east4`). Ninguno se dispara a mano: los dispara el push al branch que filtran.

| Trigger | Repo | Branch | Sólo si cambia | Publica en |
|---|---|---|---|---|
| `deploy-munify-front` | `munify` | `master` | `frontend/**` | Pages `munify` → **app.munify.com.ar** |
| `deploy-munify-front-qa` | `munify` | `qa` | `frontend/**` | Pages `munify-qa` → **app-qa.munify.com.ar** |
| `deploy-munify-api-us` | `munify` | `master` | `backend/**` | Cloud Run `munify-api` |
| `deploy-munify-api-qa` | `munify` | `qa` | `backend/**` | Cloud Run `munify-api-qa` |
| `deploy-munify-landing` | `landing` | `master` | — | Pages `munify-landing` → munify.com.ar |
| `deploy-munify-landing-qa` | `landing` | `qa` | — | Pages `munify-landing-qa` |
| `deploy-munify-calls` | **`munify-calls`** | `main` | — | Pages `munify-calls` → **calls.munify.com.ar** |

- **DB:** MySQL en Aiven — `munify_prod` (prod) y `sugerenciasmun-qa` (QA).
- **El front no lleva `VITE_API_URL`:** usa `/api` same-origin y el proxy lo hace una
  **Pages Function** (`functions/_middleware.js`) contra la variable `BACKEND_ORIGIN`
  del build. Prod → `munify-api-vmpxsxe7ra-uk.a.run.app`; QA → `munify-api-qa-vmpxsxe7ra-uk.a.run.app`.
- **El filtro `frontend/**` importa:** un commit que sólo toca `backend/` NO republica
  el front, y viceversa. Que no haya build no significa que el CD esté roto.
- **Región única: `us-east4`.** No existe más `southamerica-east1` (Brasil/São Paulo,
  dada de baja). Cualquier referencia a esa región es legacy.
- **OJO con el `gcloud config` default:** suele estar parado en otro proyecto del
  user (`tasar-prod`, que es OTRA app). Por eso **TODO comando de Munify lleva
  `--project=munify-api` explícito**. Nunca confiar en el proyecto default.

**Frontend:**
1. **Antes de pushear front**, correr `cd frontend && npm run build` **localmente**. Si falla
   `tsc -b`, el build de Cloud Build también falla y la versión vieja queda publicada
   silenciosamente. **Sin excepciones.**
2. `git push origin qa` → dispara `deploy-munify-front-qa`. (El workflow
   `.github/workflows/cd.yml` está roto/legacy — ignorarlo, el CD no pasa por GitHub Actions.)
3. Verificar qué build corrió:
   `gcloud builds list --project=munify-api --region=us-east4 --filter="substitutions.TRIGGER_NAME=deploy-munify-front-qa" --limit=3 --format="table(status,createTime,substitutions.SHORT_SHA)"`
   y el bundle vivo: `curl -s https://app-qa.munify.com.ar/ | grep -oE 'index-\w+\.js'`.
4. NUNCA un deploy manual (`wrangler pages deploy`, `netlify deploy`): rompe la
   trazabilidad commit → deploy. Sólo `git push`.

**Backend (Cloud Run):** **Claude NO deploya — el CD lo gestiona Infra.** Nunca correr
`gcloud builds submit`, `gcloud run deploy` ni `gcloud run services update` manualmente para
Munify — eso es responsabilidad exclusiva del proyecto de Infraestructura.

> ### SE PUSHEA SIEMPRE a `qa` (desde 2026-08-30)
>
> **El ciclo termina en el PUSH, no en el commit.** Desarrollar → gates (build /
> `tsc` / eslint / pyflakes) → commit → **`git push origin qa`** → informar. Sin
> preguntar, después de cada bloque terminado.
>
> *Why:* el dueño prueba en `qa` desde el celular y la tablet, no en el working
> tree de Claude. Un arreglo sin pushear **no existe para él**: el 2026-08-30
> reportó dos veces un bug del logo que ya estaba corregido en local, y perdió
> tiempo en algo resuelto. Orden textual: *"siempre subí los cambios"*.
>
> **OJO — son DOS repos.** `landing/` está en el `.gitignore` de este repo porque
> tiene su propio git (`arenazl/landing`). Un push desde la raíz **no sube la
> landing**: hay que pushear cada uno a su rama `qa` y verificar con
> `git log --oneline origin/qa -1` en cada repo.
>
> Antes de decir "arreglado", confirmar que lo arreglado está **publicado**: si el
> reporte vino de `qa`, verificar contra `qa` en vivo, no contra el archivo local.
>
> Sigue vedado SIEMPRE: `master`, promover qa→prod y escribir en la base de
> producción. Esto **reemplaza** la regla anterior de "commit local, push sólo a
> pedido" (2026-08-06).

> ### REGLA DE ORO de secretos y variables (norma del ecosistema)
>
> Fuente completa: **`base-compartida/20-REPARTO-SECRETOS-Y-PLATAFORMA.md`**
> (Lucas, 2026-08-27). Tres categorías:
>
> 1. **Secretos DE LA APLICACIÓN** (Gemini, Groq, Brevo, client IDs): **los
>    carga la app, en QA Y en producción** — en prod vía
>    `secretmanager.secretVersionAdder` sobre sus propios secrets (agregar
>    versión no permite leer). Si falta una key de la app: se carga, no se pide.
> 2. **Secretos de ACCESO A DATOS** (`DATABASE_URL`, `SECRET_KEY`): Infra,
>    siempre.
> 3. **Credenciales de CUENTA/PLATAFORMA** (token Cloudflare, SA de GCP):
>    Infra, jamás se reparten — si un CD las necesita, se arma para que NO
>    hagan falta.
>
> Sigue vedado SIEMPRE para la app: ejecutar contra la base de producción y
> promover qa→prod. Y ninguna sesión autoriza por otra (regla 4 del doc).
>
> Nota de plataforma: **los fronts viven en Cloudflare Pages** — QA en
> `app-qa.munify.com.ar` y prod en `app.munify.com.ar`, ambos con CD por push
> vía Cloud Build de Infra. **Netlify NO SE USA MÁS en este proyecto**
> (dueño, 2026-09-03): cualquier mención a `munify-qa.netlify.app`, a
> `netlify deploy` o a site IDs de Netlify en docs o scripts es legacy.

**VERIFICAR LIVE, no asumir desde commits:** un push a `origin master` versiona pero el deploy a
Cloud Run lo dispara Infra por su cuenta (puede no ser instantáneo). Para saber qué está
realmente vivo, consultar el OpenAPI del servicio:
`curl -s https://munify-api-1060106389361.us-east4.run.app/openapi.json` y chequear las
rutas/schemas, o `gcloud run revisions list --service=munify-api --region=us-east4
--project=munify-api` para ver la última revisión y su fecha. Que un commit exista en master NO
significa que ya esté deployado en Cloud Run.

**Notas:**
- **El user trabaja local** (desde 2026-08-06). Levantar la app localmente para ver un cambio
  funcionando es la vía normal, no una excepción.
- **`qa` NO es un preview: es un ambiente COMPLETO** (backend `munify-api-qa` +
  DB `sugerenciasmun-qa` + front `app-qa.munify.com.ar` en Cloudflare Pages).
  Flujo entre ambientes: **`base-compartida/munify/AMBIENTES.md`**. El camino
  `qa`→`master` (a producción) es exclusivo de Infra.
- Proyectos de Cloudflare Pages: `munify` (prod, `app.munify.com.ar`), `munify-qa`
  (QA, `app-qa.munify.com.ar`) y `munify-calls` (`calls.munify.com.ar`, repo aparte).

**Carpeta compartida:** tu carpeta propia es `base-compartida/munify/` (= tu `id`). Ahí viven tus
docs de coordinación con Infra (ej. `AMBIENTES.md`). La raíz de `base-compartida/` es solo
cross-project. Si te dicen "leé tu carpeta en la compartida", andá directo a `base-compartida/munify/`
— no escanees. Convención: `base-compartida/0-MAPA-CARPETAS.md`.

### 16. Cuando el user hace varias preguntas
NO contestar todo de una. Responder de a una y esperar antes de seguir.

---

## CÓMO MANTENER ESTE REPO ORDENADO

- **`BUILD_GUIDE.md`** se actualiza cuando aparece un patrón canónico nuevo o un componente reutilizable nuevo. El §6 (inventario UI) se regenera con `python scripts/generate_ui_inventory.py`.
- **Este archivo (`CLAUDE.md`)** se actualiza cuando aparece una regla dura nueva o el user da feedback que se vuelve regla.
- **NO** ensuciar `CLAUDE.md` ni `BUILD_GUIDE.md` con "estado actual del desarrollo", "fixes recientes" o decisiones de producto. Eso vive en commits, PRs e issues.
- Docs viejos (planes terminados, specs ya implementadas) → `docs/legacy/`.
