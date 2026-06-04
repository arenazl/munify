# Instrucciones para Claude — reglas duras

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
- NUNCA duplicar componentes visuales. Si un patrón visual aparece 2+ veces, hay que extraerlo a `components/ui/`.
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

### 7. Multi-tenant (backend)
- TODA query con `municipio_id` filtra por `current_user.municipio_id`. Sin excepciones.

### 8. Emojis Unicode prohibidos
- Cero emojis en UI, código, commits, labels. Sólo iconos `lucide-react` vía `<DynamicIcon name="Building2" />` o import directo.

### 9. Header de ABMPage: input al 100%, botón "Nuevo" anclado a la derecha
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

### 9.bis. ABMPage acepta `toolbar` Y `headerActions` juntos — NO silenciar uno
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
El user tiene `gh`, `gcloud`, `netlify`, `git`, `npm`, `node`, `python`, `docker`
autenticados localmente. Antes de pedirle clicks o credenciales, intentar la CLI.

### 15. Deploy — DÓNDE VIVE CADA COSA (fuente única, leer antes de deployar)

> **HEROKU ESTÁ MUERTO. NO EXISTE MÁS PARA ESTE PROYECTO.** Nunca correr
> `git push heroku`. Si ves un `Procfile` o el remote `heroku`, es legacy —
> ignorarlo. Un push a Heroku NO deploya nada (el servicio está inactivo) y da
> la falsa sensación de haber deployado. Esto ya causó un desastre real.

**Arquitectura de producción:**

| Capa | Dónde corre | Cómo se deploya |
|---|---|---|
| **Frontend** | Netlify (`app.munify.com.ar`) | `git push origin master` → Netlify auto-build |
| **Backend** | **Google Cloud Run**, proyecto `munify-api`, región `southamerica-east1` | `gcloud builds submit` + `gcloud run deploy` (ver abajo) |
| **DB** | MySQL en Aiven | — |

- **Servicio Cloud Run:** `munify-api`. URL que usa el frontend:
  `https://munify-api-1060106389361.southamerica-east1.run.app/api`.
- **OJO con el `gcloud config` default:** suele estar parado en otro proyecto del
  user (`tasar-prod`, que es OTRA app). Por eso **TODO comando de Munify lleva
  `--project=munify-api` explícito**. Nunca confiar en el proyecto default.

**Frontend (Netlify):**
1. **Antes de pushear front**, correr `cd frontend && npm run build` **localmente**. Si falla
   `tsc -b`, Netlify también falla y la versión vieja queda en prod silenciosamente. **Sin excepciones.**
2. `git push origin master` → Netlify reconstruye vía su integración nativa de GitHub
   (NO GitHub Actions; el workflow `.github/workflows/cd.yml` está roto/legacy — ignorarlo).
3. Verificar: `curl -s https://app.munify.com.ar/ | grep -oE 'index-\w+\.js'` vs `dist/index.html` local.
4. NUNCA `netlify deploy --prod --dir dist` directo (rompe trazabilidad). Solo `git push` → auto-build.

**Backend (Cloud Run):** el user hace ~10 deploys/día con su flujo. Claude NO deploya backend
sin "dale" explícito (es prod, outward-facing). Cuando se autoriza, el pipeline real es (desde `backend/`):
```
gcloud builds submit --region=southamerica-east1 \
  --tag=southamerica-east1-docker.pkg.dev/munify-api/munify/api:latest --project=munify-api .
gcloud run deploy munify-api --image=southamerica-east1-docker.pkg.dev/munify-api/munify/api:latest \
  --region=southamerica-east1 --allow-unauthenticated --port=8080 \
  --env-vars-file=env.yaml --set-secrets=<9 secrets de Secret Manager> --project=munify-api
```
- Vars públicas en `backend/env.yaml`. Secretos en **Secret Manager** (`munify-api`): DATABASE_URL,
  SECRET_KEY, GEMINI_API_KEY, GROK_API_KEY, SMTP_PASSWORD, CLOUDINARY_API_SECRET, GOOGLE_CLIENT_SECRET,
  DIDIT_API_KEY, VAPID_PRIVATE_KEY. NUNCA pegar valores literales en código/docs.

**VERIFICAR LIVE, no asumir desde commits:** un push a `origin master` versiona pero NO deploya el
backend a Cloud Run. Para saber qué está realmente vivo, consultar el OpenAPI del servicio:
`curl -s https://munify-api-1060106389361.southamerica-east1.run.app/openapi.json` y chequear las
rutas/schemas. Que un commit exista en master NO significa que esté deployado en Cloud Run.

**Notas:**
- El user no testea local — cada cambio significativo va directo a prod.
- Netlify production branch: `master`. Pushear a otra rama solo genera preview.
- Site IDs: app frontend = `edff37c1-2c43-4c01-ba71-d6c59f5cdc85`, landing = `522eac1f-fa1f-43d1-86ca-128e5467a27d`.

### 16. Cuando el user hace varias preguntas
NO contestar todo de una. Responder de a una y esperar antes de seguir.

---

## CÓMO MANTENER ESTE REPO ORDENADO

- **`BUILD_GUIDE.md`** se actualiza cuando aparece un patrón canónico nuevo o un componente reutilizable nuevo. El §6 (inventario UI) se regenera con `python scripts/generate_ui_inventory.py`.
- **Este archivo (`CLAUDE.md`)** se actualiza cuando aparece una regla dura nueva o el user da feedback que se vuelve regla.
- **NO** ensuciar `CLAUDE.md` ni `BUILD_GUIDE.md` con "estado actual del desarrollo", "fixes recientes" o decisiones de producto. Eso vive en commits, PRs e issues.
- Docs viejos (planes terminados, specs ya implementadas) → `docs/legacy/`.
