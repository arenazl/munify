# Reingeniería ABMPage — Toolbar Declarativo

**Estado:** propuesta en pausa.
**Fecha:** 2026-05-16.
**Trigger:** el user pidió "reingeniería para que vuelvan a ser agnósticos".
Después de revisar, los componentes en `components/ui/` ya son agnósticos —
lo que se siente repetido es el JSX inline del header de cada página
(combos, pills, acciones) que cada `<ABMPage>` consumidor recrea desde cero.

---

## Diagnóstico

### Lo que está bien (no tocar)

- `ABMPage.tsx`, `ABMTable`, `ModernSelect`, `StatusPill`, `PillsOrSelect`,
  `KpiCard`, `KpiRow`, `PeriodNavigator`, `RevisionIAPanel`: agnósticos.
  Solo tienen comentarios JSDoc con ejemplos del dominio. Cero lógica
  Munify.

### Lo que duele

Cada página que usa `ABMPage` arma sus filtros + acciones inline:

```tsx
secondaryFilters={
  <div className="flex flex-wrap gap-2 ...">
    <div className="min-w-[180px]"><ModernSelect ... /></div>
    <div className="min-w-[180px]"><ModernSelect ... /></div>
    <button>Todos</button>
    {/* 6 buttons de pills */}
  </div>
}
headerActions={
  <div className="flex gap-1.5">
    <button>Más recientes</button>
    <button>Por vencer</button>
    <button>Vista guiada</button>
  </div>
}
```

Reclamos, Trámites, Tasas y Pagos repiten la **misma estructura** con
distintas variables. Cambiar el patrón (ej. el botón Vista guiada al lado
del calendario) implica editar N páginas a mano.

---

## Lo que se hizo hasta ahora (commits)

**Lo que ya está pusheado y funcionando:**

| Commit | Cambio |
|---|---|
| `5993a2d` | Reclamos: header reordenado + 1 fila filtros + input chico |
| `44702f1` | Trámites: patrón canónico (Tipos+Dep ModernSelect + estado pills + input chico) |
| `37c6082` | Reclamos+Trámites: columna única "Fecha" 2-renglones (Creación/Modif) + "Dependencia" renombrada + filtros pegados izq + Dependencia oculto en `soloMiArea` |
| `c4d4d4a` | Reclamos: categoria + dependencia a ModernSelect, panel IA colapsable a derecha (barra vertical) |
| `041fe4c` | StatusPill unificada en componente reusable |
| `92fc476` | KpiCard outlined + ABMPage acepta KpiSpec[] |
| `d1d7da9` | Placeholders cortos (`Contactos` vs `Todos los contactos`) en toda la app + PeriodNavigator botón Todos icon-only |
| `ede52f8` | MunicipioSwitcher dropdown portaleado al body |
| `ee2abdd` | Backend: `/modulos` y `/mostrador/home` devuelven `[]` en modo Global |
| `7abf798` | Backend: cat-reclamo, cat-tramite, tramites devuelven `[]` en modo Global |
| `ab76559` | Revisión IA piloto Reclamos: Gemini + side panel + cache 1h |
| `6f63ddb` | Revisión IA: maxOutputTokens 8000 + recuperar JSON truncado + prompt corto |

**Lo que está pendiente:**
- Aplicar patrón canónico en **Tasas** y **Pagos** (igual que Reclamos/Trámites).
- Integrar `RevisionIAPanel` en **Trámites** (replicar piloto Reclamos:
  endpoint `/api/tramites/revision-ia` + service Gemini + frontend wiring).
- Vista guiada en otras pantallas que tengan fecha (regla pendiente: "siempre
  que haya fecha").
- Verificar formato fecha `DD/M/YY` no rompa sorts existentes.

---

## Propuesta — `<ABMPage toolbar={...}>`

Una sola prop nueva `toolbar` que reemplaza la mayoría del JSX inline.
Las props viejas (`secondaryFilters`, `headerActions`, `extraFilters`)
siguen funcionando como **fallback** — si `toolbar` no se pasa, el
comportamiento actual no cambia.

### Shape declarativo

```ts
import type { LucideIcon } from 'lucide-react';
import type { SelectOption } from './ModernSelect';

interface AbmToolbar {
  // ============ COMBOS TAXONOMICOS (izquierda) ============
  combos?: Array<{
    /** Key estable (ej: 'categoria'). Sirve de React key. */
    key: string;
    /** Placeholder + label del item '' (ej: 'Categorías'). */
    placeholder: string;
    /** Valor seleccionado (controlled). */
    value: string;
    onChange: (v: string) => void;
    /** Opciones de ModernSelect. ABMPage agrega el item vacio. */
    options: SelectOption[];
    searchable?: boolean;
    /** Si false, no se renderiza el combo. Util para `!soloMiArea`. */
    visible?: boolean;
    /** Ancho minimo del combo. Default 180px. */
    minWidth?: number;
  }>;

  // ============ STATUS PILLS (derecha o misma fila, segun layout) ============
  statusPills?: {
    /** Valor activo. '' = Todos seleccionado. */
    value: string;
    onChange: (v: string) => void;
    items: Array<{
      key: string;
      label: string;
      icon?: LucideIcon;
      color: string;
      count?: number;
    }>;
    /** Mostrar pill "Todos" outlined. Default true. */
    showTodos?: boolean;
    /** Count del "Todos". Si no se pasa, se calcula desde items[].count. */
    todosCount?: number;
  };

  // ============ ACCIONES DEL HEADER (al lado del toggle de vista) ============
  actions?: Array<{
    key: string;
    label: string;
    icon?: LucideIcon;
    /** Si true, se renderiza activo (bg primary tint). */
    active?: boolean;
    onClick: () => void;
    /** Tooltip. */
    title?: string;
    /** Si false, no se renderiza la accion. */
    visible?: boolean;
  }>;

  // ============ LAYOUT ============
  /** 'left' (default, todo pegado a la izquierda) o 'split' (combos izq, pills der). */
  layout?: 'left' | 'split';
}
```

### Uso en una página

Antes (Reclamos.tsx, ~150 líneas inline):

```tsx
<ABMPage
  ...
  secondaryFilters={
    <div className="w-full flex flex-wrap items-center gap-x-3 gap-y-1.5 justify-start">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-[180px]">
          <ModernSelect value={...} onChange={...} options={[...]} ... />
        </div>
        {(user?.rol === 'admin' || user?.rol === 'supervisor') && !soloMiArea && (
          <div className="min-w-[180px]">
            <ModernSelect value={...} onChange={...} options={[...]} ... />
          </div>
        )}
      </div>
      <div className="flex gap-1 items-center">
        <button onClick={...}>Todos {count}</button>
        {ESTADOS.map(estado => <button>...</button>)}
      </div>
    </div>
  }
  headerActions={
    <div className="flex items-center gap-1.5">
      <button onClick={setOrdenamiento('reciente')}>Más recientes</button>
      <button onClick={setOrdenamiento('por_vencer')}>Por vencer</button>
      <button onClick={toggleVista}>Vista guiada</button>
    </div>
  }
>
```

Después (Reclamos.tsx, ~40 líneas declarativas):

```tsx
<ABMPage
  ...
  toolbar={{
    combos: [
      {
        key: 'categoria',
        placeholder: 'Categorías',
        value: filtroCategoria === null ? '' : String(filtroCategoria),
        onChange: (v) => setFiltroCategoria(v ? parseInt(v, 10) : null),
        options: categorias.map(c => ({ value: String(c.id), label: c.nombre, color: c.color })),
        searchable: true,
      },
      {
        key: 'dependencia',
        placeholder: 'Dependencias',
        value: filtroDependencia === null ? '' : String(filtroDependencia),
        onChange: (v) => setFiltroDependencia(v ? parseInt(v, 10) : null),
        options: dependenciasDisponibles.map(d => ({ value: String(d.id), label: d.nombre, color: d.color })),
        searchable: true,
        visible: (user?.rol === 'admin' || user?.rol === 'supervisor') && !soloMiArea,
      },
    ],
    statusPills: {
      value: filtroEstado,
      onChange: setFiltroEstado,
      items: ESTADOS_RECLAMO.map(e => ({
        key: e.key,
        label: e.label,
        icon: e.icon,
        color: e.color,
        count: conteosEstados[e.key] || 0,
      })),
    },
    actions: [
      { key: 'reciente', label: 'Más recientes', icon: ArrowUpDown, active: ordenamiento === 'reciente', onClick: () => setOrdenamiento('reciente') },
      { key: 'por_vencer', label: 'Por vencer', icon: Calendar, active: ordenamiento === 'programado', onClick: () => setOrdenamiento('programado') },
      { key: 'vista_guiada', label: vistaInbox ? 'Vista clásica' : 'Vista guiada', icon: vistaInbox ? LayoutList : LayoutGrid, active: vistaInbox, onClick: toggleVista },
    ],
    layout: 'left',
  }}
>
```

### Beneficios

- **Una API, todas las páginas la usan igual.** Cambiar el patrón visual
  (ej. mover Vista guiada al lado del calendario) se hace en un solo lugar.
- **Sin JSX inline en páginas.** Solo data.
- **Compat:** props viejas siguen funcionando, migración página por página
  sin big bang.
- **El "modo dependencia" (`soloMiArea`)** se expresa como `visible: false`
  en el combo. La página no monta JSX condicional.

### Riesgos

- Tocar `ABMPage.tsx` afecta 15+ páginas (cualquier regresión visual es
  costosa).
- El estilo de los pills/combos quedó duro en el componente — si una
  página necesita variante (ej. pill sin count, combo sin searchable), hay
  que sumar prop opt-in.
- `actions` no soporta dropdowns complejos (ej. el menú "Trámite" de
  GestionTramites que tiene buscador + agrupación) — esos casos siguen
  con `headerActions` legacy.

---

## Plan de migración (cuando se retome)

1. **Implementar `toolbar` en ABMPage** (un solo commit, sin tocar
   ninguna página). Build, no debería romper nada porque las props viejas
   siguen funcionando.
2. **Migrar Reclamos** primero. Verificar visualmente que queda igual.
   Push.
3. **Migrar Trámites**. Push.
4. **Migrar Tasas y Pagos** (cuando se aplique el patrón ahí).
5. **Documentar en APP_GUIDE master** la API `toolbar` como el patrón
   estándar para nuevas páginas. Las props viejas pasan a "legacy, prefer
   toolbar".

---

## Reglas establecidas en la sesión (para no perder)

1. **Filtros**: combos taxonómicos (Categoría, Dependencia, Tipo,
   Contacto, Mes) → siempre `ModernSelect`. Status pills solo para flujo
   de estado, máximo 6. Más de 6 = `ModernSelect`.
2. **Placeholders cortos**: `"Contactos"`, no `"Todos los contactos"`.
3. **`PeriodNavigator`** botón Todos = icon-only.
4. **Layout filtros**: una sola fila, todo pegado a la izquierda
   (`justify-start`).
5. **Columna Fecha**: una sola, 2 renglones (Creación arriba, Modif.
   abajo), formato `DD/M/YY`. El año queda en el binding completo para
   sorting y filtros.
6. **Columna Dependencia**: header "Dependencia" (no "Asignado"). Texto
   blanco, 2 renglones, sin dot.
7. **Modo `soloMiArea`** (supervisor de dependencia / empleado): oculta
   tanto el combo Dependencia en filtros como la columna Dependencia en
   la tabla.
8. **Combo Dependencia visible**: admin O supervisor (no solo
   supervisor).
9. **Input búsqueda**: 280px max (`searchMaxWidth={280}`).
10. **Vista guiada en header**: siempre que la pantalla tenga filtro de
    fecha, el botón Vista guiada va junto al de calendario / por vencer.
11. **KPIs**: siempre 4 cards outlined. `KpiSpec[]` con `{ label, value,
    icon, color, footnote?, highlighted?, pct? }`.
12. **Panel IA**: `RevisionIAPanel` reusable, colapsable a la derecha
    (barra vertical fina). Width default 280px.

---

## Pendiente concreto (próxima sesión)

- [ ] Implementar `<ABMPage toolbar={...}>` (commit 1, solo core, no
      tocar páginas).
- [ ] Migrar Reclamos a `toolbar` (commit 2, verificar visual).
- [ ] Migrar Trámites a `toolbar` (commit 3).
- [ ] Aplicar patrón canónico (filtros + KPIs + paginación) en Tasas y
      Pagos.
- [ ] **`RevisionIAPanel` en Trámites** — Reclamos ya lo tiene
      (`ab76559`), Trámites NO. Replicar el piloto end-to-end:
      - Backend: nuevo endpoint `GET /api/tramites/revision-ia` análogo a
        `/api/reclamos/revision-ia`. Carga últimos 80 trámites del muni,
        los manda a Gemini con prompt curado (duplicados, sin asignar,
        datos pobres, atrasados, monto inusual si tiene costo).
      - Service: agregar función `analizar_tramites()` en
        `backend/services/revision_ia.py` (reusar `_call_gemini` +
        `_parse_json_safely` que ya existen). Cache 1h por
        `(municipio_id, "tramites")`.
      - API client: `tramitesApi.getRevisionIA()` en
        `frontend/src/lib/api.ts`.
      - Frontend: en `GestionTramites.tsx`, agregar state +
        `useEffect` que cargue al montar, y pasar
        `sidePanel={<RevisionIAPanel ... />}` al `<ABMPage>` (mismo
        wiring que `Reclamos.tsx`). El `onEdit` debe abrir el sheet del
        trámite correspondiente.
- [ ] Actualizar APP_GUIDE master con el contrato `toolbar`.
