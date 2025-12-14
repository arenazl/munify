# 02 - PANTALLAS, NAVEGACIÓN Y PATRÓN ABM

## REGLAS FUNDAMENTALES

### 1. PATRÓN ABM OBLIGATORIO: Side Modal (Sheet)

> **NUNCA crear páginas separadas para Crear/Editar/Ver detalle.**
> **SIEMPRE usar Side Modal (Sheet) que se abre desde el listado.**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PATRÓN ABM CORRECTO                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ✅ CORRECTO:                                                                │
│                                                                              │
│  ┌─────────────────────────────────┐  ┌────────────────────┐                │
│  │ Listado (Grid/Tabla)            │  │ Sheet (Side Modal) │                │
│  │                                 │  │                    │                │
│  │  [+ Nuevo]  ← botón header      │  │ Crear / Editar /   │                │
│  │                                 │→ │ Ver detalle        │                │
│  │  [Card clickeable] ───────────→│  │                    │                │
│  │  [Card clickeable]              │  │ Se abre desde      │                │
│  │  [Card clickeable]              │  │ el mismo listado   │                │
│  │                                 │  │                    │                │
│  └─────────────────────────────────┘  └────────────────────┘                │
│                                                                              │
│  ❌ INCORRECTO (PROHIBIDO):                                                  │
│                                                                              │
│  - /entidad/nuevo     ← NO crear rutas separadas                            │
│  - /entidad/:id       ← NO crear páginas de detalle                         │
│  - /entidad/:id/edit  ← NO crear páginas de edición                         │
│  - Links/Navigate a otras páginas para CRUD                                 │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2. Estructura de una Página ABM

```typescript
// Estructura OBLIGATORIA para cualquier ABM

export default function EntidadPage() {
  // Estados del listado
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Estados del Sheet
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [saving, setSaving] = useState(false);

  // Estado del formulario
  const [formData, setFormData] = useState({ /* campos */ });

  // Abrir para CREAR (item = null)
  const openSheet = (item: Item | null = null) => {
    if (item) {
      setFormData({ /* poblar con datos del item */ });
      setSelectedItem(item);
    } else {
      setFormData({ /* valores por defecto */ });
      setSelectedItem(null);
    }
    setSheetOpen(true);
  };

  // Cerrar
  const closeSheet = () => {
    setSheetOpen(false);
    setSelectedItem(null);
  };

  return (
    <div className="space-y-6">
      {/* Header con título y botón Nuevo */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Entidades</h1>
        <button onClick={() => openSheet()}>
          <Plus /> Nueva Entidad
        </button>
      </div>

      {/* Buscador */}
      <SearchInput value={search} onChange={setSearch} />

      {/* Grid de cards clickeables */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map((item) => (
          <div
            key={item.id}
            onClick={() => openSheet(item)}  // Click abre el Sheet
            className="cursor-pointer hover:shadow-md"
          >
            {/* Contenido de la card */}
          </div>
        ))}
      </div>

      {/* Sheet (Side Modal) - UN SOLO COMPONENTE para crear/editar/ver */}
      <Sheet
        open={sheetOpen}
        onClose={closeSheet}
        title={selectedItem ? 'Editar Entidad' : 'Nueva Entidad'}
      >
        <form onSubmit={handleSubmit}>
          {/* Campos del formulario */}
        </form>
      </Sheet>
    </div>
  );
}
```

### 3. Componente Sheet Requerido

```typescript
// src/components/ui/Sheet.tsx

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export function Sheet({ open, onClose, title, description, children, footer }: SheetProps) {
  if (!open) return null;

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />

      {/* Panel lateral derecho */}
      <div className="fixed inset-y-0 right-0 w-full max-w-md bg-white shadow-xl z-50 flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">{title}</h2>
              {description && <p className="text-sm text-gray-500">{description}</p>}
            </div>
            <button onClick={onClose}>
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="px-6 py-4 border-t bg-gray-50">
            {footer}
          </div>
        )}
      </div>
    </>
  );
}
```

---

## NAVEGACIÓN

### Menú por Rol

```
┌─────────────────┬─────────┬─────────┬────────────┬──────────────┐
│ Item            │ Vecino  │Cuadrilla│ Supervisor │    Admin     │
├─────────────────┼─────────┼─────────┼────────────┼──────────────┤
│ Dashboard       │    ✗    │    ✗    │     ✓      │      ✓       │
│ Mis Reclamos    │    ✓    │    ✗    │     ✗      │      ✗       │
│ Reclamos        │    ✗    │    ✗    │     ✓      │      ✓       │
│ Mapa            │    ✓    │    ✓    │     ✓      │      ✓       │
│ Tablero         │    ✗    │    ✓    │     ✓      │      ✓       │
│ Cuadrillas      │    ✗    │    ✗    │     ✓      │      ✓       │
│ Usuarios        │    ✗    │    ✗    │     ✗      │      ✓       │
│ Categorías      │    ✗    │    ✗    │     ✗      │      ✓       │
│ Zonas           │    ✗    │    ✗    │     ✗      │      ✓       │
│ Configuración   │    ✗    │    ✗    │     ✗      │      ✓       │
└─────────────────┴─────────┴─────────┴────────────┴──────────────┘
```

### Rutas (SIN páginas separadas de detalle/crear)

```typescript
// src/routes.tsx

export const router = createBrowserRouter([
  // Públicas
  { path: '/login', element: <Login /> },
  { path: '/register', element: <Register /> },

  // Protegidas
  {
    path: '/',
    element: <ProtectedRoute><Layout /></ProtectedRoute>,
    children: [
      { index: true, element: <Dashboard /> },

      // Reclamos - TODO en una sola página con Sheet
      { path: 'reclamos', element: <Reclamos /> },
      { path: 'mis-reclamos', element: <MisReclamos /> },

      // Otras
      { path: 'mapa', element: <Mapa /> },
      { path: 'tablero', element: <Tablero /> },

      // ABMs - Cada uno con su propio Sheet interno
      { path: 'cuadrillas', element: <Cuadrillas /> },
      { path: 'usuarios', element: <Usuarios /> },
      { path: 'categorias', element: <Categorias /> },
      { path: 'zonas', element: <Zonas /> },
      { path: 'configuracion', element: <Configuracion /> },
    ],
  },

  { path: '*', element: <Navigate to="/" replace /> },
]);

// ❌ NUNCA AGREGAR:
// { path: 'reclamos/nuevo', element: <NuevoReclamo /> }
// { path: 'reclamos/:id', element: <ReclamoDetalle /> }
// { path: 'categorias/nuevo', element: <NuevaCategoria /> }
// etc.
```

---

## PÁGINAS EXISTENTES

| Página | Ruta | Descripción | Roles |
|--------|------|-------------|-------|
| `Login.tsx` | `/login` | Formulario de login | Público |
| `Register.tsx` | `/register` | Formulario de registro | Público |
| `Dashboard.tsx` | `/` | KPIs y resumen | Admin, Supervisor |
| `MisReclamos.tsx` | `/mis-reclamos` | Mis reclamos + Sheet crear/ver | Vecino |
| `Reclamos.tsx` | `/reclamos` | Todos los reclamos + Sheet ver/acciones | Admin, Supervisor |
| `Mapa.tsx` | `/mapa` | Mapa con reclamos | Todos |
| `Tablero.tsx` | `/tablero` | Kanban de trabajos | Cuadrilla+ |
| `Cuadrillas.tsx` | `/cuadrillas` | ABM con Sheet | Admin, Supervisor |
| `Usuarios.tsx` | `/usuarios` | ABM con Sheet | Admin |
| `Categorias.tsx` | `/categorias` | ABM con Sheet | Admin |
| `Zonas.tsx` | `/zonas` | ABM con Sheet | Admin |
| `Configuracion.tsx` | `/configuracion` | Config sistema | Admin |

---

## REDIRECCIÓN POR ROL

```typescript
const getDefaultRoute = (role: string) => {
  switch (role) {
    case 'admin':
    case 'supervisor':
      return '/';
    case 'cuadrilla':
      return '/tablero';
    case 'vecino':
    default:
      return '/mis-reclamos';
  }
};
```

---

## CHECKLIST

- [x] Todas las páginas ABM usan Sheet (Side Modal)
- [x] NO hay rutas `/entidad/nuevo` o `/entidad/:id`
- [x] El botón "Nuevo" está en el header del listado
- [x] Click en card/fila abre el Sheet con detalle/edición
- [x] Un solo componente Sheet por página
- [x] Navegación configurada sin rutas de detalle

---

**Siguiente:** `03_STACK.md`
