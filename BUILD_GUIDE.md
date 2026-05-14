# BUILD_GUIDE — Cómo se construyen módulos en esta app

> **Para quién:** cualquier agente (humano o IA) que vaya a tocar código en este repo.
>
> **Promesa:** si leés este archivo antes de codear, no vas a inventar componentes
> que ya existen, no vas a romper el theming, y vas a producir código que se siente
> parte de la app.
>
> **Relación con `d:\Code\APP_GUIDE\`** — esa carpeta tiene la versión
> **agnóstica** y canónica de los componentes core (ej. `ABMPage`,
> `CalendarView`, `ModernSelect`, `Sheet`, `WizardModal`). Cuando mejoramos
> uno de esos componentes **en esta app** y el cambio es **estable** (no
> custom de Munify), es OBLIGATORIO portar el cambio a
> `d:\Code\APP_GUIDE\components\` en versión agnóstica. Este archivo
> (`BUILD_GUIDE.md`) es **específico de esta app**: qué patrones usamos
> acá, dónde está cada cosa, qué decisiones tomamos en Munify.
>
> **Lectura obligatoria** antes de crear cualquier pantalla, formulario, ABM o
> módulo nuevo. Ver el [Pre-Flight Checklist](#pre-flight-checklist) abajo.

---

## 1. Qué hace la app

SaaS municipal multi-tenant (cada municipio = un tenant aislado por
`municipio_id`). Núcleo actual:

- **Reclamos** — vecinos reportan problemas; supervisores/dependencias resuelven.
- **Trámites** — vecinos solicitan; dependencias procesan.
- **Tesorería** — supervisores cargan gastos / proyecciones / contactos.
- **Dependencias** — secretarías del municipio que reciben reclamos/trámites según categoría.
- **Multi-rol:** `vecino`, `supervisor`, `admin` (rol `empleado` está deprecado).

---

## 2. Stack real (lo que YA está instalado)

| Capa | Tecnología | Notas |
|---|---|---|
| Backend | FastAPI + SQLAlchemy async + MySQL (Aiven) | `backend/` |
| Auth | JWT en header `Authorization: Bearer <token>` | `backend/core/security.py` |
| Migraciones | Alembic (`backend/alembic/versions/`) o scripts ad-hoc con `engine.begin()` (`backend/scripts/`) | Ver §5 |
| Imágenes | Cloudinary (URLs guardadas en DB) | `backend/api/imagenes.py` |
| Frontend | React 18 + Vite + TypeScript | `frontend/` |
| Estilos | Tailwind + CSS variables vía `ThemeContext` | `frontend/src/contexts/ThemeContext.tsx` |
| Routing | `react-router-dom` (`createBrowserRouter`) | `frontend/src/routes.tsx` |
| HTTP client | axios con interceptor JWT | `frontend/src/lib/api.ts` |
| Mapas | Leaflet + Nominatim (OSM) | `frontend/src/components/ui/MapPicker.tsx`, `DireccionAutocomplete.tsx` |
| Date pickers | `react-day-picker` + `date-fns` | `frontend/src/components/ui/DatePicker.tsx` |
| Iconos | `lucide-react` (PROHIBIDO emojis) | — |
| Toasts | `sonner` | — |
| Deploy | Heroku (backend, branch `main`) + Netlify (frontend, branch `master`) | Ver `docs/06_DEPLOY.md` o `APP_GUIDE/06_DEPLOY.md` |

---

## 3. Estructura de carpetas

```
sugerenciasMun/
├── BUILD_GUIDE.md          ← este archivo (cómo se hacen las cosas acá)
├── CLAUDE.md               ← reglas duras para agentes
├── README.md
├── backend/
│   ├── api/                ← routers FastAPI (uno por entidad)
│   ├── models/             ← SQLAlchemy models
│   ├── schemas/            ← Pydantic schemas (request/response)
│   ├── services/           ← lógica compartida (ej. notificaciones)
│   ├── core/               ← config, database, security, logger
│   ├── scripts/            ← migraciones one-shot, seeds
│   └── alembic/versions/   ← migraciones formales
├── frontend/src/
│   ├── pages/              ← una página por ruta
│   ├── components/
│   │   ├── ui/             ← LIBRERÍA CANÓNICA (ver §6)
│   │   └── ...             ← componentes específicos por dominio
│   ├── lib/api.ts          ← cliente HTTP único
│   ├── hooks/              ← useAuth, useTheme, useSubdomain...
│   ├── contexts/           ← AuthContext, ThemeContext
│   ├── config/             ← navigation.ts, themePresets.ts, pageHints.ts
│   ├── types/              ← interfaces TS (User, Reclamo, etc.)
│   └── routes.tsx          ← todas las rutas
├── docs/                   ← documentación interna (planes, specs viejas)
├── scripts/                ← utilidades dev (incluye generador de §6)
└── APP_GUIDE/              ← plantilla agnóstica (ignorar, se está rehaciendo)
```

---

## 4. Pre-Flight Checklist

> **REGLA DURA:** antes de escribir UNA SOLA línea de UI o backend nuevo, respondé
> mentalmente (o en voz alta al user si no estás seguro) estas preguntas. Si no
> podés responder una, leé la sección correspondiente o pedí ayuda. **No codees a
> ciegas.**

### Para UI nueva

1. **¿Qué pantalla estás creando?** ABM clásico, Wizard de creación, Dashboard, página de detalle. → §7 (patrones canónicos).
2. **¿Qué controles vas a usar?** Para cada input del form, mirar §6.1 ("Para esto → usá esto"). **Si necesitás un control que no está en `components/ui/`, primero buscá**; lo más probable es que exista con otro nombre.
3. **¿Qué página existente es tu referencia?** Antes de inventar, copiá la estructura de una página similar (ver §7).
4. **¿Cómo abrís modales/side panels?** `Sheet` para detalle/edición, `WizardModal` para creación multi-paso. NUNCA un modal a mano.
5. **¿Cómo manejás colores?** `useTheme()` + `theme.primary`, `theme.success`, etc. CERO hex inline.
6. **¿Cómo manejás estados/enums?** Centralizados (ver §8.4). NO redefinir `estadoColors` localmente.

### Para backend nuevo

1. **¿Cómo se llama el router y el prefijo?** Patrón: `backend/api/<entidad>.py` con `APIRouter(prefix="/<entidad>")`.
2. **¿Cómo filtrás por municipio?** Siempre `where(<Modelo>.municipio_id == current_user.municipio_id)`. Esto NO es opcional — es la garantía de multi-tenant.
3. **¿Quién puede llamar al endpoint?** Validar rol al principio del handler. Ver §8.2.
4. **¿Hay cambio de schema en DB?** Si sí, escribir migración (ver §5) y ejecutarla **sin preguntar** (CLAUDE.md regla de migraciones).
5. **¿Esto dispara una notificación?** Si afecta a un vecino o dependencia, ver `backend/services/notificaciones.py` y usar el helper existente.

### Si la respuesta a cualquier pregunta es "no sé"

- **Parar.** No codear.
- Leer la sección referenciada.
- Si sigue sin estar claro, preguntar al user antes de seguir.

---

## 5. Tabla rápida: "Para esto → usá esto"

> **Regla de oro:** todo control de UI que tenga su versión custom en
> `components/ui/` **prohibe** el equivalente nativo. Esto es lo que más fallan
> los agentes nuevos.

| Necesitás… | Usá esto | NO uses |
|---|---|---|
| Input de **dirección con autocomplete** | `<DireccionAutocomplete value onChange={(dir,lat,lon)=>...} />` | `<input type="text">` para `direccion` |
| Input de **fecha única** | `<DatePicker value onChange label minDate maxDate />` | `<input type="date">` |
| Input de **rango de fechas** | `<DateRangePicker value onChange allowClear />` con presets | dos `<input type="date">` |
| **Select / dropdown** | `<ModernSelect value onChange options placeholder searchable />` | `<select>` |
| **Combo con autocomplete** (filtrado por texto) | `<ModernSelect ... searchable />` — mismo componente con la prop `searchable`. Las opciones se filtran por `label`/`description` con un input "Buscar..." que aparece al abrir el dropdown | `<datalist>`, librerías externas, combo + input separado |

> **ℹ️ ModernSelect — comportamientos importantes a saber** (commits `ec6fe29`, `41f8498`):
>
> - **Dropdown via Portal** (`document.body`, `position: fixed`, `z-index: 9999`). Esto significa que **NO se clipea** por ningún `overflow:hidden` ancestro (resolvió el bug viejo del slot `extraFilters` de ABMPage). Podés meter `<ModernSelect>` adentro de cualquier container sin preocuparte.
> - **Smart flip**: si hay poco espacio abajo del trigger y más arriba, el dropdown abre hacia arriba automáticamente. No hay que setear nada.
> - **Mobile-aware**: en `max-width: 768px` la altura máxima del listado es `60vh` (~480-560px en iPhones), no `max-h-64`. Además NO auto-focusea el input de búsqueda para evitar que el teclado tape las opciones — el user toca el input si quiere filtrar.
> - **Cierre touch**: maneja `mousedown` Y `touchstart`, no solo mouse.
| **Autocomplete genérico** (no dirección) | `<AutocompleteInput options value onChange />` | `<datalist>` o input + dropdown a mano |
| Input **con validación inline** | `<ValidatedInput value onChange validate error />` | `<input>` + manejar error suelto |
| Layout de **ABM listado** | `<ABMPage title items columns onNew ... />` | divs sueltos con tabla a mano |
| **Vista calendario** (3ra vista de un ABMPage, junto a cards/tabla) | `<CalendarView<T> items getId getDate getLabel ... />` pasado a `ABMPage` como `guidedView={...}` | calendario inline a mano por página |
| **Modal lateral** (crear / editar / ver) | `<Sheet open onClose title>...</Sheet>` | `<Modal>` (deprecated) o modal centrado |
| **Wizard de creación** (multi-paso) | `<WizardModal steps>...</WizardModal>` | wizard custom local |
| **Confirmar acción destructiva** | `<ConfirmModal open onConfirm title message />` | `window.confirm()` |
| **Picker de ubicación en mapa** | `<MapPicker lat lng onChange />` | mapa custom |
| **Input por voz** | `<VoiceInput onResult />` | nada nativo equivalente |
| **Tooltip educativo persistente** | `<PageHint id title body />` | tooltip a mano con localStorage |
| **Header de página sticky** | `<StickyPageHeader title actions />` | `<div className="sticky top-0">` a mano |
| **Icono dinámico** (por nombre) | `<DynamicIcon name="Building2" />` | imports manuales caso-por-caso |
| **Loading skeleton** | `<Skeleton variant="card|line|circle" />` | spinner genérico |

**Inputs nativos permitidos:** sólo `<input type="text">`, `<input type="number">`,
`<input type="email">`, `<input type="password">`, `<textarea>` cuando NO existe un
componente custom equivalente. Y aún así envueltos con el theme (`useTheme()`).

### Regla de UX: cuándo usar píldoras vs combo

Filtros tipo **píldora / chip horizontal** funcionan bien con pocas opciones.
Si la lista crece, conviene migrar a `ModernSelect`:

- **≤ 5 opciones** → píldoras (visibles de un vistazo, click rápido).
- **6+ opciones** → **sugerir** convertir a `ModernSelect`. Una fila de
  6+ chips genera scroll horizontal molesto, ruido visual y se rompe en
  mobile.

Excepciones (mantener píldoras aun con muchas opciones):
- Son estados primarios muy usados que el usuario quiere ver de un
  vistazo (ej. Todos / Pendientes / En curso / Resueltos).
- El usuario lo pide explícitamente.

Cuando detectes 6+ filtros tipo píldora en una pantalla, plantealo al
user antes de implementar — la decisión final es de él, pero la
recomendación por defecto es migrar a combo.

### Header de ABMPage: tamaños canónicos

Todos los controles del header de un `ABMPage` (search input,
`ModernSelect`, `DatePicker`, `DateRangePicker`, botón "Nuevo",
píldoras) deben verse **orgánicos entre sí**:

- **Alto**: `34px` (`h-[34px]`) para todos los controles principales.
- **Tipografía**: `12px` (`text-[12px]`) para texto de valor seleccionado
  / placeholder / botones.
- **Píldoras**: usan `11px` (`text-[11px]`) porque son chips más
  compactos, pero **mismo alto** (34px) para que la línea no se rompa.
- **Mobile/tablet**: si los controles no entran, el wrapper hace
  **scroll horizontal** (`overflow-x: auto`, scrollbar oculto). Cada
  control mantiene su alto y se ve completo — nada se aplasta ni se
  corta. Esto lo provee el wrapper `abm-secondary-filters-wrap` del
  ABMPage automáticamente; las páginas solo tienen que poner los
  controles dentro de `secondaryFilters`.
- **No auto-focus del search en touch devices**: `ModernSelect` con
  `searchable=true` NO enfoca el input automáticamente en dispositivos
  con touch (mobile + tablet + cualquier `maxTouchPoints > 0`). Esto
  evita que el teclado virtual aparezca y tape las opciones. El user
  toca el input solo si necesita filtrar.

### Abreviaturas automáticas (`lib/textAbbreviation.ts`)

`ModernSelect` aplica **abreviaturas automáticas** al label del trigger
para que entren textos largos. Esto es el equivalente funcional a un
pipe de Angular: una función pura llamada en el render.

- Diccionario agnóstico de palabras frecuentes:
  `Secretaría → Sec.`, `Dirección → Dir.`, `Departamento → Dpto.`,
  `Coordinación → Coord.`, `Administración → Admin.`,
  `Municipalidad → Muni.`, `Ministerio → Min.`, `Gerencia → Ger.`,
  `Tesorería → Tes.`, `Contaduría → Cont.`, `Sociedad Anónima → S.A.`,
  `Sociedad de Responsabilidad Limitada → SRL`, etc.
- Las **opciones del dropdown** siempre se muestran completas — la
  abreviatura es solo para el trigger compacto.
- Opt-out: pasar `abbreviate={false}` al `ModernSelect` en el raro caso
  de necesitar el texto exacto en el trigger.
- Para extender el diccionario en un proyecto específico:
  ```ts
  import { abreviarPalabras } from '@/lib/textAbbreviation';
  const corto = abreviarPalabras(texto, { 'mi_palabra_larga': 'M.P.L.' });
  ```
- Fuente canónica agnóstica: `d:\Code\APP_GUIDE\lib\textAbbreviation.ts`.

**¿Necesitás un control que no está en la tabla?** Antes de crear uno nuevo:
1. Buscar en `frontend/src/components/ui/` (puede tener otro nombre).
2. Buscar en `frontend/src/components/` por dominio.
3. Preguntar al user antes de inventar.

---

## 6. Inventario de componentes UI (auto-generado)

> Esta sección la genera el script `scripts/generate_ui_inventory.py`.
> Para regenerarla cuando agregás/sacás componentes en `components/ui/`:
>
> ```bash
> python scripts/generate_ui_inventory.py
> ```

<!-- UI_INVENTORY_START -->
_Auto-generado por `scripts/generate_ui_inventory.py`. NO editar a mano — correr el script y commitear el resultado._

Total: **25 componentes** en `frontend/src/components/ui/`.

| Componente | Para qué sirve | Archivo |
|---|---|---|
| `ABMPage` | Layout canonico para paginas tipo ABM (listado + crear/editar/ver en Sheet). Es el componente de referencia para cualqui | `ABMPage.tsx` |
| `AutocompleteInput` | Callback cuando cambian las palabras seleccionadas del autocomplete | `AutocompleteInput.tsx` |
| `ConfirmModal` | Si se pasa, muestra un textarea obligatorio y devuelve el valor al confirmar | `ConfirmModal.tsx` |
| `DatePicker` | _(sin doc)_ | `DatePicker.tsx` |
| `currentMonthRange` | _(sin doc)_ | `DateRangePicker.tsx` |
| `DireccionAutocomplete` | Componente de input con autocomplete de direcciones usando OpenStreetMap (Nominatim). Reutilizable por NuevoReclamo, Cre | `DireccionAutocomplete.tsx` |
| `DynamicIcon` | Componente que renderiza iconos de Lucide dinámicamente basado en el nombre. El nombre debe ser en formato kebab-case (e | `DynamicIcon.tsx` |
| `HeatmapWidget` | Callback cuando se hace click en una categoría - si está definido, redirige en lugar de filtrar | `HeatmapWidget.tsx` |
| `MapPicker` | Mapa interactivo (Leaflet + tiles Voyager de CartoCDN) para que el user elija una ubicacion clickeando, o para mostrar u | `MapPicker.tsx` |
| `MobilePageHeader` | Sub-header estandar para pantallas mobile con contexto. Se usa DEBAJO de la topbar principal del Layout (nunca la reempl | `MobilePageHeader.tsx` |
| `Modal` | Modal component - Renders a centered modal dialog fixed to viewport Uses createPortal to render outside DOM hierarchy, a | `Modal.tsx` |
| `ModernSelect` | _(sin doc)_ | `ModernSelect.tsx` |
| `PageHint` | ID único de la pantalla — debe coincidir con una key en `config/pageHints.ts`. Se usa para persistir el dismiss en local | `PageHint.tsx` |
| `PageTransition` | _(sin doc)_ | `PageTransition.tsx` |
| `PullToRefresh` | Contenido de la página | `PullToRefresh.tsx` |
| `DynamicIcon` | _(sin doc)_ | `ReclamoCard.tsx` |
| `SectionHeader` | _(sin doc)_ | `SectionHeader.tsx` |
| `SettingsHeader` | _(sin doc)_ | `SettingsHeader.tsx` |
| `Sheet` | _(sin doc)_ | `Sheet.tsx` |
| `Skeleton` | Componente Skeleton base para mostrar placeholder mientras carga | `Skeleton.tsx` |
| `StickyPageHeader` | Icono del título (ReactNode, ej: <FileText className="h-5 w-5" />) | `StickyPageHeader.tsx` |
| `ValidatedInput` | _(sin doc)_ | `ValidatedInput.tsx` |
| `VoiceInput` | _(sin doc)_ | `VoiceInput.tsx` |
| `WizardForm` | _(sin doc)_ | `WizardForm.tsx` |
| `WizardModal` | Si es true, se renderiza como página embebida sin modal overlay | `WizardModal.tsx` |

### Detalle por componente

#### `ABMPage`
- **Archivo:** `frontend/src/components/ui/ABMPage.tsx`
- **Descripción:** Layout canonico para paginas tipo ABM (listado + crear/editar/ver en Sheet). Es el componente de referencia para cualquier pagina de "tabla + botones". Maneja: titulo + boton "Nuevo", buscador, filtros extra (chips, selects), toggle entre vista cards y tabla, Sheet lateral...
- **Patrón "3 vistas" (cards / tabla / calendario)**: una página ABM puede ofrecer las 3 vistas pasando `tableView`, `guidedView` y `children` (cards). Para `guidedView`, usar **`CalendarView<T>`** (ver abajo). Las 3 vistas reciben el mismo set de datos (`filtered`) — los filtros del header siguen valiendo.

#### `CalendarView<T>`
- **Archivo:** `frontend/src/components/ui/CalendarView.tsx`
- **Descripción:** Vista calendario multi-mes 100% agnostica. Toggle 1/2/3/4 meses simultaneos (persistido en localStorage opt-in via `mesesStorageKey`), nav prev/next, celdas con label + monto, click-to-edit, drag-and-drop opt-in (`onItemDrop`). Cero conocimiento de entidad: recibe getters (`getId`, `getDate`, `getLabel`, `getAmount`, `getColor`, `getTooltip`) y pinta.
- **Cuándo usarlo:** como `guidedView={...}` de un `ABMPage` cuando los items tienen una fecha relevante (gastos, pagos, eventos, tareas).
- **Props clave:** `items`, `getId`, `getDate`, `getLabel`, opcionales `getAmount`/`getColor`/`getTooltip`, `onItemClick`, `onItemDrop` (drag-drop opt-in), `mesesStorageKey`, `helperText`, `renderDetailRow`, `formatMoney`.
- **Fuente canónica agnóstica:** `d:\Code\APP_GUIDE\components\ui\CalendarView.tsx` (sincronizar cuando mejore acá).
- **Props (`ABMPageProps`):**
  - `title: string`
  - `icon?: ReactNode;`
  - `backLink?: string;`
  - `buttonLabel?: string`
  - `buttonIcon?: ReactNode`
  - `onAdd?: () => void`
  - `searchPlaceholder?: string`
  - `searchValue: string`
  - _... +19 prop(s) más_

#### `AutocompleteInput`
- **Archivo:** `frontend/src/components/ui/AutocompleteInput.tsx`
- **Descripción:** Callback cuando cambian las palabras seleccionadas del autocomplete
- **Props (`AutocompleteInputProps`):**
  - `value: string`
  - `onChange: (value: string) => void`
  - `schema: Record<string, SchemaColumn[]>`
  - `placeholder?: string`
  - `onSubmit?: () => void`
  - `className?: string`
  - `disabled?: boolean`
  - `/** Callback cuando cambian las palabras seleccionadas del autocomplete */`
  - _... +1 prop(s) más_

#### `ConfirmModal`
- **Archivo:** `frontend/src/components/ui/ConfirmModal.tsx`
- **Descripción:** Si se pasa, muestra un textarea obligatorio y devuelve el valor al confirmar
- **Props (`ConfirmModalProps`):**
  - `isOpen: boolean`
  - `onClose: () => void`
  - `onConfirm: (inputValue?: string) => void`
  - `title: string`
  - `message: string | ReactNode`
  - `confirmText?: string`
  - `cancelText?: string`
  - `variant?: ConfirmVariant`
  - _... +7 prop(s) más_

#### `DatePicker`
- **Archivo:** `frontend/src/components/ui/DatePicker.tsx`
- **Props (`DatePickerProps`):**
  - `value: string;`
  - `onChange: (iso: string) => void`
  - `minDate?: string;`
  - `maxDate?: string;`
  - `placeholder?: string`
  - `disabled?: boolean`
  - `allowClear?: boolean`
  - `className?: string`
  - _... +1 prop(s) más_

#### `currentMonthRange`
- **Archivo:** `frontend/src/components/ui/DateRangePicker.tsx`
- **Props (`DateRangePickerProps`):**
  - `value: DateRange`
  - `onChange: (range: DateRange) => void`
  - `className?: string`
  - `placeholder?: string`
  - `allowClear?: boolean`

#### `DireccionAutocomplete`
- **Archivo:** `frontend/src/components/ui/DireccionAutocomplete.tsx`
- **Descripción:** Componente de input con autocomplete de direcciones usando OpenStreetMap (Nominatim). Reutilizable por NuevoReclamo, CrearSolicitudWizard y cualquier otro formulario que necesite cargar una dirección. Features: - Autocomplete con debounce (400ms) y 4 niveles de fallback para...
- **Props (`DireccionAutocompleteProps`):**
  - `value: string`
  - `onChange: (direccion: string, latitud?: number | null, longitud?: number | null) => void`
  - `onBlur?: () => void`
  - `placeholder?: string`
  - `disabled?: boolean`
  - `maxLength?: number`
  - `showCurrentLocationButton?: boolean`
  - `error?: string`
  - _... +4 prop(s) más_

#### `DynamicIcon`
- **Archivo:** `frontend/src/components/ui/DynamicIcon.tsx`
- **Descripción:** Componente que renderiza iconos de Lucide dinámicamente basado en el nombre. El nombre debe ser en formato kebab-case (ej: "hard-hat", "file-check") o PascalCase (ej: "HardHat", "FileCheck") - se convierte automáticamente.

#### `HeatmapWidget`
- **Archivo:** `frontend/src/components/ui/HeatmapWidget.tsx`
- **Descripción:** Callback cuando se hace click en una categoría - si está definido, redirige en lugar de filtrar
- **Props (`HeatmapWidgetProps`):**
  - `data: HeatmapPoint[]`
  - `height?: string`
  - `center?: [number, number]`
  - `zoom?: number`
  - `showMarkers?: boolean`
  - `showLegend?: boolean`
  - `expandable?: boolean`
  - `title?: string`
  - _... +5 prop(s) más_

#### `MapPicker`
- **Archivo:** `frontend/src/components/ui/MapPicker.tsx`
- **Descripción:** Mapa interactivo (Leaflet + tiles Voyager de CartoCDN) para que el user elija una ubicacion clickeando, o para mostrar una coordenada de solo lectura. Click en el mapa dispara `onChange({lat, lng})`; el marker se centra automaticamente cuando cambia `value` desde afuera (util...
- **Props (`MapPickerProps`):**
  - `value?: { lat: number; lng: number`

#### `MobilePageHeader`
- **Archivo:** `frontend/src/components/ui/MobilePageHeader.tsx`
- **Descripción:** Sub-header estandar para pantallas mobile con contexto. Se usa DEBAJO de la topbar principal del Layout (nunca la reemplaza) para dar contexto de la pantalla actual — titulo, subtitulo, back button y acciones opcionales. Patron: [topbar principal: muni + bell + hamburger]  (del...
- **Props (`Props`):**
  - `title: string`
  - `subtitle?: string`
  - `onBack: () => void`
  - `actions?: ReactNode`
  - `/** Color de acento (ej: color de la categoria del tramite). Default: primary. */`
  - `accentColor?: string`

#### `Modal`
- **Archivo:** `frontend/src/components/ui/Modal.tsx`
- **Descripción:** Modal component - Renders a centered modal dialog fixed to viewport Uses createPortal to render outside DOM hierarchy, avoiding positioning issues
- **Props (`ModalProps`):**
  - `open: boolean`
  - `onClose: () => void`
  - `children: ReactNode`
  - `title?: string`
  - `description?: string`
  - `size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | 'full'`
  - `showCloseButton?: boolean`
  - `closeOnBackdrop?: boolean`
  - _... +1 prop(s) más_

#### `ModernSelect`
- **Archivo:** `frontend/src/components/ui/ModernSelect.tsx`
- **Props (`ModernSelectProps`):**
  - `value: string`
  - `onChange: (value: string) => void`
  - `options: SelectOption[]`
  - `placeholder?: string`
  - `label?: string`
  - `disabled?: boolean`
  - `searchable?: boolean`
  - `className?: string`
  - _... +2 prop(s) más_

#### `PageHint`
- **Archivo:** `frontend/src/components/ui/PageHint.tsx`
- **Descripción:** ID único de la pantalla — debe coincidir con una key en `config/pageHints.ts`. Se usa para persistir el dismiss en localStorage.
- **Props (`PageHintProps`):**
  - `/**`
  - `* ID único de la pantalla — debe coincidir con una key en`
  - `* `config/pageHints.ts`. Se usa para persistir el dismiss en localStorage.`
  - `*/`
  - `pageId: string`

#### `PageTransition`
- **Archivo:** `frontend/src/components/ui/PageTransition.tsx`
- **Props (`PageTransitionProps`):**
  - `children: ReactNode`

#### `PullToRefresh`
- **Archivo:** `frontend/src/components/ui/PullToRefresh.tsx`
- **Descripción:** Contenido de la página
- **Props (`PullToRefreshProps`):**
  - `/** Contenido de la página */`
  - `children: ReactNode`
  - `/** Callback que se ejecuta al hacer pull-to-refresh. Debe retornar una Promise. */`
  - `onRefresh: () => Promise<void>`
  - `/** Distancia mínima de pull para activar el refresh (default: 80) */`
  - `threshold?: number`
  - `/** Desactivar el pull-to-refresh */`
  - `disabled?: boolean`

#### `DynamicIcon`
- **Archivo:** `frontend/src/components/ui/ReclamoCard.tsx`
- **Props (`ReclamoCardProps`):**
  - `reclamo: Reclamo`
  - `onClick?: () => void`
  - `similaresCount?: number`
  - `showCreador?: boolean`
  - `isVisible?: boolean`
  - `animationDelay?: number`

#### `SectionHeader`
- **Archivo:** `frontend/src/components/ui/SectionHeader.tsx`
- **Props (`SectionHeaderProps`):**
  - `title: string`
  - `description?: string`
  - `icon?: LucideIcon`
  - `iconColor?: string`
  - `backLink?: string;`
  - `onBack?: () => void;`
  - `actions?: ReactNode`
  - `compact?: boolean;`

#### `SettingsHeader`
- **Archivo:** `frontend/src/components/ui/SettingsHeader.tsx`
- **Props (`SettingsHeaderProps`):**
  - `title: string`
  - `subtitle: string`
  - `icon: React.ElementType`
  - `iconColor?: string`
  - `backTo?: string`
  - `showSave?: boolean`
  - `onSave?: () => void`
  - `saving?: boolean`
  - _... +3 prop(s) más_

#### `Sheet`
- **Archivo:** `frontend/src/components/ui/Sheet.tsx`
- **Props (`SheetProps`):**
  - `open: boolean`
  - `onClose: () => void`
  - `title: string`
  - `description?: string`
  - `children: ReactNode`
  - `footer?: ReactNode`
  - `stickyFooter?: ReactNode;`
  - `stickyHeader?: ReactNode;`

#### `Skeleton`
- **Archivo:** `frontend/src/components/ui/Skeleton.tsx`
- **Descripción:** Componente Skeleton base para mostrar placeholder mientras carga
- **Props (`SkeletonProps`):**
  - `className?: string`
  - `variant?: 'text' | 'circular' | 'rectangular' | 'rounded'`
  - `width?: string | number`
  - `height?: string | number`
  - `animation?: 'pulse' | 'wave' | 'none'`

#### `StickyPageHeader`
- **Archivo:** `frontend/src/components/ui/StickyPageHeader.tsx`
- **Descripción:** Icono del título (ReactNode, ej: <FileText className="h-5 w-5" />)
- **Props (`StickyPageHeaderProps`):**
  - `/** Icono del título (ReactNode, ej: <FileText className="h-5 w-5" />) */`
  - `icon?: ReactNode`
  - `/** Título de la página */`
  - `title?: string`
  - `/** Link para volver (muestra flecha antes del título) */`
  - `backLink?: string`
  - `/** Placeholder del buscador */`
  - `searchPlaceholder?: string`
  - _... +16 prop(s) más_

#### `ValidatedInput`
- **Archivo:** `frontend/src/components/ui/ValidatedInput.tsx`

#### `VoiceInput`
- **Archivo:** `frontend/src/components/ui/VoiceInput.tsx`
- **Props (`VoiceInputProps`):**
  - `onTranscript: (text: string) => void`
  - `onError?: (error: string) => void`

#### `WizardForm`
- **Archivo:** `frontend/src/components/ui/WizardForm.tsx`
- **Props (`WizardFormProps`):**
  - `steps: WizardStep[]`
  - `onComplete: () => void`
  - `onCancel: () => void`
  - `saving?: boolean`
  - `aiSuggestion?: {`
  - `loading?: boolean`
  - `title?: string`
  - `message?: string`
  - _... +4 prop(s) más_

#### `WizardModal`
- **Archivo:** `frontend/src/components/ui/WizardModal.tsx`
- **Descripción:** Si es true, se renderiza como página embebida sin modal overlay
- **Props (`WizardModalProps`):**
  - `open: boolean`
  - `onClose: () => void`
  - `title: string`
  - `steps: WizardStep[]`
  - `currentStep: number`
  - `onStepChange: (step: number) => void`
  - `onComplete: () => void`
  - `loading?: boolean`
  - _... +7 prop(s) más_

<!-- UI_INVENTORY_END -->

---

## 7. Patrones canónicos de página

### 7.1 ABM clásico con Sheet

**Referencia viva:** `frontend/src/pages/Reclamos.tsx`, `frontend/src/pages/Categorias.tsx`.

Esqueleto:

```tsx
export default function MiEntidadPage() {
  const [items, setItems] = useState<MiEntidad[]>([]);
  const [search, setSearch] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selected, setSelected] = useState<MiEntidad | null>(null);

  const openSheet = (item: MiEntidad | null = null) => {
    setSelected(item);
    setSheetOpen(true);
  };

  return (
    <ABMPage
      title="Mis Entidades"
      search={search}
      onSearch={setSearch}
      onNew={() => openSheet(null)}
      items={items}
      renderCard={(item) => <MiCard item={item} onClick={() => openSheet(item)} />}
    >
      <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title={selected ? 'Editar' : 'Nueva'}>
        <MiForm initial={selected} onSaved={...} />
      </Sheet>
    </ABMPage>
  );
}
```

**Reglas:**
- **NUNCA** rutas `/<entidad>/nuevo` ni `/<entidad>/:id`. Todo se hace dentro de la misma ruta con `Sheet`.
- El botón "Nuevo" va en el header del `ABMPage`, NO inventes botones flotantes.
- Click en una card abre el mismo `Sheet` (modo edición).

### 7.2 Wizard de creación multi-paso

**Referencia viva:** `frontend/src/pages/NuevoReclamo.tsx` (+ `components/reclamos/CrearReclamoWizard.tsx`).

Esqueleto: usar `WizardModal` con array de steps. Cada step es un componente con
sus inputs (todos del inventario UI). El step de dirección **siempre** usa
`DireccionAutocomplete`. El step de fecha **siempre** `DatePicker`.

### 7.3 Dashboard con KPIs

**Referencia viva:** `frontend/src/pages/Dashboard.tsx`.

- Stats en grid responsive (`grid-cols-1 md:grid-cols-2 lg:grid-cols-4`).
- Gráficos con `recharts`, colores desde `theme.*`.
- Cards con bordes y sombras desde theme, no hex.

### 7.4 Detalle expandible / modal

**Referencia viva:** páginas de detalle de reclamo dentro de `Reclamos.tsx`.

Usar `Sheet` con scroll interno. Acciones en footer del `Sheet`.

---

## 8. Convenciones específicas de esta app

### 8.1 Multi-tenant (lo más importante)

- **Backend:** TODA query debe filtrar por `municipio_id` del `current_user`. Olvidarse de esto es leak de tenants, es bug crítico.
  ```python
  query = select(Reclamo).where(Reclamo.municipio_id == current_user.municipio_id)
  ```
- **Frontend:** el `municipio_id` viene del JWT y está disponible vía `useAuth().user.municipio_id`. NO hay context separado.
- **Subdominios:** `<municipio>.localhost:5173` se detecta con el hook `useSubdomain()`.

### 8.2 Autenticación y roles

- Dependency en cada endpoint: `current_user: User = Depends(get_current_user)` (de `core/security.py`).
- Roles: `vecino`, `supervisor`, `admin`. (`empleado` está deprecado.)
- Chequeo inline:
  ```python
  if current_user.rol not in ("supervisor", "admin"):
      raise HTTPException(403, "No autorizado")
  ```
- **Frontend:** rutas protegidas con `<ProtectedRoute roles={['admin']}>` en `routes.tsx`.

### 8.3 Migraciones de DB

> **Regla:** ejecutar migraciones **sin preguntar** (ver CLAUDE.md).

Dos formas válidas:

**A) Alembic** (preferido para cambios formales):
```
backend/alembic/versions/NNN_descripcion.py
```
Con `def upgrade()` y `def downgrade()`.

**B) Script ad-hoc** (para cambios urgentes o seeds):
```python
# backend/scripts/migrate_xxx.py
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from core.config import settings

async def migrate():
    engine = create_async_engine(settings.DATABASE_URL)
    async with engine.begin() as conn:
        await conn.execute(text("ALTER TABLE reclamos ADD COLUMN ..."))
    await engine.dispose()
```
Ejecutar con `python -m backend.scripts.migrate_xxx`.

### 8.4 Enums y estados (Single Source of Truth)

- Backend: `backend/models/enums.py` define los enums (ej. `EstadoReclamo`).
- Frontend: un único archivo por dominio en `frontend/src/lib/enums/` exporta:
  - `estadoColors: Record<Estado, string>` — colores derivados del theme
  - `estadoLabels: Record<Estado, string>` — labels en español
  - `estadoIcons: Record<Estado, IconComponent>` — iconos lucide
- **Patrón con fallback** (para resistir estados nuevos):
  ```tsx
  const color = estadoColors[estado] || estadoColors.default || theme.muted;
  const label = estadoLabels[estado] || estado;
  ```
- Test mental: "si agrego un estado mañana, ¿cuántos archivos toco?" Si son más de 2, está mal.

### 8.5 Subida de imágenes (Cloudinary)

- Storage: Cloudinary. URLs persisten en DB en columnas tipo `String(500)`.
- Backend: el helper de upload vive en `backend/services/imagen_service.py` (o `backend/api/imagenes.py` para algunos casos legacy).
- Frontend: subir directo desde el browser con `imagenesApi` (ver `lib/api.ts`).
- **NUNCA** guardes imágenes en `frontend/public/` o en el filesystem del backend en producción — Heroku tiene FS efímero.

### 8.6 Notificaciones

- Model: `backend/models/notificacion.py` (tabla `notificaciones`).
- Cuando un endpoint cambia algo que afecta a otro usuario (cambio de estado de reclamo, asignación a dependencia, comentario), debe crear notificación.
- Helpers existentes: ver `backend/services/notificaciones.py` (`notificar_cambio_estado`, `notificar_persona_sumada`, etc.).
- **NO** inventar lógica de notificación nueva — usar los helpers o agregarles un caso.

### 8.7 Theming

- Variables CSS gestionadas por `ThemeContext.tsx`. 67+ presets en `config/themePresets.ts`.
- Hook: `const { theme } = useTheme()`.
- Uso: `style={{ backgroundColor: theme.card, color: theme.text, borderColor: theme.border }}`.
- **PROHIBIDO:** hex inline (`'#22c55e'`), `bg-[#3b82f6]`, valores arbitrarios.

### 8.8 Navegación (sidebar)

- Definición: `frontend/src/config/navigation.ts`.
- Shape de item:
  ```ts
  { icon: 'Building2', label: 'Dependencias', href: '/gestion/dependencias',
    role: ['admin','supervisor'], modulo?: 'tesoreria', children?: [...] }
  ```
- Agregar un módulo nuevo = agregar entrada acá + ruta en `routes.tsx` + página en `pages/`.
- `modulo` es feature flag por municipio (campo `modulos_activos` en `municipios`).

### 8.9 Cliente API

- Archivo único: `frontend/src/lib/api.ts`.
- Export por entidad: `reclamosApi`, `tramitesApi`, `dependenciasApi`, etc.
- Interceptor agrega JWT automáticamente desde `localStorage.token`.
- Convención de nombres de método: `list()`, `get(id)`, `create(data)`, `update(id, data)`, `remove(id)`, + métodos específicos (`sumarse(id)`, `cambiarEstado(id, data)`).

---

## 9. Cómo construir un módulo nuevo (end-to-end)

**Ejemplo:** "agreguemos módulo de contaduría".

### Paso 1 — Backend

1. **Model** en `backend/models/contaduria.py`:
   ```python
   class AsientoContable(Base):
       __tablename__ = "asientos_contables"
       id = Column(Integer, primary_key=True)
       municipio_id = Column(Integer, ForeignKey("municipios.id"), nullable=False, index=True)
       # ...campos...
   ```
2. **Schema** en `backend/schemas/contaduria.py` (Create / Update / Response Pydantic).
3. **Router** en `backend/api/contaduria.py` siguiendo el patrón de `dependencias.py` (filtro `municipio_id`, chequeo de rol).
4. **Registrar** en `backend/main.py`: `app.include_router(contaduria_router, prefix="/api")`.
5. **Migración** en `backend/alembic/versions/NNN_create_asientos.py` o script ad-hoc. **Ejecutarla sin preguntar.**
6. **Notificaciones** si aplica (ver §8.6).

### Paso 2 — Frontend

7. **Tipo** en `frontend/src/types/index.ts` (`interface AsientoContable {...}`).
8. **API client** en `frontend/src/lib/api.ts`: nuevo export `contaduriaApi` con `list/get/create/update/remove`.
9. **Enum/colores** si hay estados: archivo en `frontend/src/lib/enums/contaduria.ts`.
10. **Página** en `frontend/src/pages/Contaduria.tsx` usando `ABMPage` + `Sheet` (ver §7.1) y los componentes de §5.
11. **Ruta** en `frontend/src/routes.tsx`.
12. **Sidebar** en `frontend/src/config/navigation.ts` con `modulo: 'contaduria'`.
13. **Feature flag** — agregar `'contaduria'` a `modulos_activos` del municipio en DB.

### Paso 3 — Verificación

14. **Probar en prod** (el user no testea local — ver memoria).
15. **Commit + push** a `origin/master` y `heroku/main` (ver memoria de pipeline de deploy).

---

## 10. Lista negra — qué NO hacer (PROHIBIDO)

| ❌ Prohibido | ✅ Hacé esto |
|---|---|
| `<select>` | `<ModernSelect>` |
| `<input type="date">` | `<DatePicker>` |
| Hex inline (`'#22c55e'`) o `bg-[#...]` | `theme.success`, `theme.primary` |
| `h-[calc(100vh-64px)]` | `flex-1` en `flex-col` |
| `position: fixed/absolute` para layout | Flexbox shell |
| Emojis Unicode (🔥 ✅ 🚀) | Iconos lucide-react |
| Rutas `/entidad/nuevo`, `/entidad/:id`, `/entidad/:id/edit` | Una sola ruta + `Sheet` |
| Hardcodear colores/labels de estado en cada página | Single Source of Truth en `lib/enums/` |
| `window.confirm()` / `window.alert()` | `<ConfirmModal>` / `toast` (sonner) |
| Olvidarse `where(municipio_id == current_user.municipio_id)` en backend | Filtrar SIEMPRE por tenant |
| Crear módulo nuevo sin agregar al sidebar y al feature flag del municipio | Hacer los 13 pasos del §9 |
| Pre-prompts hardcodeados en chat/IA para tapar bugs del schema | Arreglar el schema o el sanitizer |
| `git push --no-verify`, amend de commits ya pusheados | Crear nuevo commit, arreglar la causa |

---

## 11. Cómo mantener este documento actualizado

- **Inventario UI (§6):** auto. Corré `python scripts/generate_ui_inventory.py` cada vez que toques `components/ui/`.
- **Patrones canónicos (§7):** si una página se vuelve referencia "bien hecha" para un patrón nuevo, citala acá.
- **Tabla §5:** si agregás un control reutilizable, sumarlo a la tabla en el commit del componente nuevo.
- **Convenciones (§8):** sólo se actualiza cuando cambia algo arquitectónico (ej. cambio de Cloudinary a otro storage). NO ensuciar con detalles puntuales.
- **NO** ensuciar este archivo con "estado actual" del desarrollo, fixes recientes, ni decisiones de producto. Eso vive en commits, issues o `docs/`.

---

## 12. Referencias rápidas

- Reglas duras (no negociables): `CLAUDE.md`.
- Templates / planes activos: `docs/`.
- Archivos viejos: `docs/archive/`.
- Plantilla agnóstica (NO usar como referencia para esta app): `APP_GUIDE/`.
