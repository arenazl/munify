# Instrucciones para Claude — reglas duras

## REGLA PRINCIPAL

**ANTES de tocar UNA SOLA línea de código en este repo, leer `BUILD_GUIDE.md`** (en
la raíz). Ese archivo es la fuente de verdad de **cómo se construyen las cosas en
esta app**: qué componentes ya existen, qué patrones usamos para ABMs, dónde está
cada cosa.

> **NO usar `APP_GUIDE/`** como referencia — es una plantilla agnóstica para
> arrancar apps desde cero, está siendo rehecha, y la mayor parte de su contenido
> está desactualizado respecto a esta app.

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

---

## REGLAS DE TRABAJO CON EL USER

### 9. Jamás modificar módulos centrales sin consentimiento explícito
Proponer en texto primero (qué archivo, qué cambio, por qué). Esperar "dale" /
"hacelo" / "aplicalo". "Aplicá los cambios que consideres" NO es carta blanca.

### 10. Respuestas en UNA línea por defecto
Excepción: cuando el user pide explícitamente listas, detalle, o roadmap.

### 11. No adivinar — verificar con datos reales
Si el user duda de un resultado o pregunta "¿esto es real?", ejecutar query/script
contra la fuente real (DB, API, código), no responder con hipótesis.

### 12. CLIs primero, dashboard después
El user tiene `gh`, `heroku`, `netlify`, `git`, `npm`, `node`, `python`, `docker`
autenticados localmente. Antes de pedirle clicks o credenciales, intentar la CLI.

### 13. Deploy
- El user no testea local — cada cambio significativo va a prod.
- Pipeline: `git push origin master` + `git push heroku master:main` (Heroku necesita rama `main`).
- Netlify production branch: `master`. Pushear a otra rama es preview.

### 14. Cuando el user hace varias preguntas
NO contestar todo de una. Responder de a una y esperar antes de seguir.

---

## CÓMO MANTENER ESTE REPO ORDENADO

- **`BUILD_GUIDE.md`** se actualiza cuando aparece un patrón canónico nuevo o un componente reutilizable nuevo. El §6 (inventario UI) se regenera con `python scripts/generate_ui_inventory.py`.
- **Este archivo (`CLAUDE.md`)** se actualiza cuando aparece una regla dura nueva o el user da feedback que se vuelve regla.
- **NO** ensuciar `CLAUDE.md` ni `BUILD_GUIDE.md` con "estado actual del desarrollo", "fixes recientes" o decisiones de producto. Eso vive en commits, PRs e issues.
- Docs viejos (planes terminados, specs ya implementadas) → `docs/archive/`.
