# STANDARD · Controles del kit v2 (`components/abmv2`)

**Paquete:** 05 · 2026-08-03 · fuente `Configuracion.dc.html` (canvas Claude
Design `46976e44-b6dc-4395-b1fe-15aa2a8f9584`).

Este documento es para **agentes que van a codear una pantalla**. Responde una
sola pregunta: *"necesito este control — ¿ya existe?"*. Si existe, se usa; si
no existe, se agrega acá (ver §0) y recién después se codea la pantalla.

Los otros dos STANDARD del kit siguen valiendo y no se solapan con este:

| Documento | De qué habla |
|---|---|
| `04_.../STANDARD-SemanticAbmPage.md` | Anatomía de una PÁGINA de listado. |
| `04_.../STANDARD-Variaciones-por-props.md` | Contratos de `kind`/`mode` de esa página. |
| **este** | Los CONTROLES sueltos que se usan adentro de cualquier página. |

---

## 0. Regla de ingreso al kit (acuerdo del dueño, 2026-08-03)

> Cuando un diseño traiga un control que no tenemos, **no se maqueta adentro de
> la pantalla**: se componentiza en `components/abmv2/`, se le ponen props para
> que sirva en otra app, y se documenta acá. Recién ahí se usa.

En la práctica, antes de escribir una pantalla nueva:

1. Buscar el control en la tabla del §1. Si está, usarlo.
2. Si no está, preguntarse si es **el mismo control con otra ropa** (un chip
   con contador ya existe; un chip con contador *y punto* también). Casi
   siempre alcanza con una prop nueva.
3. Si de verdad es nuevo: escribirlo en `abmv2/`, tipar sus props en
   `abmv2/types.ts` con el **porqué** de cada decisión, agregar su CSS a la
   sección `[CONTROLES v2.5]` de `styles/abmv2.css`, y sumar su fila acá.
4. Nunca dos implementaciones de lo mismo. Si encontrás una pantalla que
   maqueta a mano algo que ya está acá, migrarla es parte del trabajo.

**Prohibido en cualquier control del kit:** hex inline, `<select>` nativo,
`<input type="checkbox">`, emojis, `window.confirm`. Los colores salen de
tokens `--pl-*`; el único inline permitido es un valor que **viene de datos**
(el color que el usuario le eligió a una categoría).

---

## 1. Inventario

| Control | Import | Qué resuelve |
|---|---|---|
| `Switch` | `abmv2/Controls` | Encendido/apagado de una fila o de un ajuste. Reemplaza al checkbox nativo. |
| `SegmentedControl` | `abmv2/Controls` | Píldora hundida con el activo elevado: vistas, lados, unidades. |
| `FilterChips` | `abmv2/Controls` | Chips redondeados con contador y punto de estado, fuera de una tabla. |
| `MetricCell` | `abmv2/Controls` | Número + nota ("38 / históricos"). También `kind: 'metric'` en una columna. |
| `ScalePicker` | `abmv2/Controls` | Escala ordinal corta (prioridad 1..5) sin desplegar un combo. |
| `Tile` | `abmv2/Controls` | El cuadrito de icono teñido que usan tabla, asignación, árbol y picker. |
| `useReorder` | `abmv2/useReorder` | Reordenar arrastrando (y con el teclado). Lo usa el DataTable y sirve suelto. |
| `AssignmentPanel` | `abmv2/AssignmentPanel` | Emparejar filas con destinos, con sugerencias y acción masiva. |
| `TreeList` | `abmv2/TreeList` | Árbol de 2+ niveles con expandir/colapsar, chips, cifras y acciones. |
| `IconColorPicker` | `abmv2/IconColorPicker` | Elegir icono + color de una entidad, con vista previa. |

Las piezas de página (`SemanticAbmPage`, `SettingsShell`, `DataTable`,
`ListToolbar`, `FilterBar`, `SideModal`, `PageHeader`) están en el README de
`components/abmv2/`.

---

## 2. Los tres cuerpos del canvas de Configuración

El canvas define **qué entra en el panel** según qué es el ajuste. Un agente
que enchufa un ajuste nuevo elige entre estos:

| Tipo | Cuerpo | Componente |
|---|---|---|
| `catalogo` | Lista de nombre + icono + color + activo + orden | `SemanticAbmPage` embebida con `reorder` |
| `abm` | El ABM completo (hero + filtros + tabla) | `SemanticAbmPage` embebida |
| `asignacion` | Emparejar dos catálogos | `AssignmentPanel` |
| `arbol` | Estructura jerárquica | `TreeList` |
| `form` / `qr` / `apariencia` | Cuerpo propio | Componentes de la pantalla |

**Regla del canvas que no se negocia:** adentro del panel, el cuerpo entra
*pelado* — el título lo pone el `SettingsShell`, no el componente. Eso ya está
resuelto por contexto (`EmbedProvider` + `useEmbed`): las cabeceras del kit se
apagan solas cuando están embebidas. Ninguna pantalla necesita una prop nueva.

---

## 3. Recetas

### 3.1 Switch en una fila de tabla

```tsx
import { Switch } from '@/components/abmv2/Controls';

{ id: 'activo', header: 'ESTADO', width: 'minmax(70px, 0.5fr)', align: 'right',
  cell: (r) => (
    <Switch
      checked={r.activo}
      ariaLabel={r.activo ? 'Desactivar' : 'Activar'}
      onChange={(v) => alternar(r.id, v)}
    />
  ),
}
```

En un formulario, el mismo control con label y bajada:

```tsx
<Switch
  checked={notifica}
  onChange={setNotifica}
  label="Avisar al vecino por WhatsApp"
  description="Sólo cuando el reclamo cambia de estado."
/>
```

### 3.2 Reordenar un catálogo

El orden es un campo del dominio (define en qué secuencia ve el vecino las
categorías). Es un **modo**, no un estado permanente: mientras está apagado la
lista se lee normal.

```tsx
const [ordenando, setOrdenando] = useState(false);

<SemanticAbmPage
  secondaryAction={{ label: ordenando ? 'Listo' : 'Reordenar',
                     onClick: () => setOrdenando((v) => !v) }}
  reorder={{
    active: ordenando,
    onReorder: (filas, { row, to }) => {
      setFilas(filas);                       // optimista
      api.setOrden(row.id, to + 1).catch(recargar);
    },
  }}
  …
/>
```

Qué garantiza el kit:

- El handle es un **botón real**: con foco, `ArrowUp`/`ArrowDown` mueven la
  fila. Sin eso el orden sería inalcanzable sin mouse — y en táctil el drag
  nativo de HTML5 directamente no existe.
- Mientras se reordena, la fila **no abre el detalle** (arrastrar y navegar se
  pisan).
- El componente **no persiste ni reordena solo**: emite la lista nueva. Si el
  guardado falla y la página no cambia su estado, la fila vuelve sola a su
  lugar — que es la verdad.
- `reorder` se ignora con `groupBy` distinto de `'none'`: reordenar entre
  grupos no está definido.

### 3.3 Panel de asignación

```tsx
<AssignmentPanel
  sides={[{ id: 'reclamos', label: 'Reclamos', count: 9 },
          { id: 'tramites', label: 'Trámites', count: 24 }]}
  activeSide={lado} onSideChange={setLado}
  search={q} onSearchChange={setQ}
  searchPlaceholder="Buscar categoría o dependencia"
  bulkAction={sugeridas.length ? { label: `Aplicar las ${sugeridas.length} sugerencias`,
                                   onClick: aplicarTodas } : undefined}
  filters={[{ id: 'sin', label: 'Sin asignar', count: 6, veredicto: 'advertencia' },
            { id: 'con', label: 'Asignadas', count: 14, veredicto: 'bueno' }]}
  activeFilter={filtro} onFilterChange={setFiltro}
  columnLabels={{ entity: 'Categoría', metric: 'Reclamos', target: 'Quién los atiende' }}
  targets={dependencias.map((d) => ({ value: String(d.id), label: d.nombre, dotColor: d.color }))}
  groups={grupos}
  onAssign={(id, dep) => asignar(id, dep)}
  onClear={(id) => asignar(id, null)}
  footer={{ left: '6 categorías sin dependencia', right: '20 en total' }}
/>
```

Reglas de la pieza:

- La **sugerencia se pinta punteada**, distinta de un valor confirmado. Un
  combo relleno con la sugerencia adentro se lee como "asignado" y nadie
  vuelve a mirarlo.
- El CTA masivo aparece **sólo si hay algo que aplicar**. Un botón que no hace
  nada enseña al usuario a ignorarlo.
- Buscar, filtrar y agrupar es de la página. El panel pinta y avisa.
- Los combos son `ModernSelect variant="v2"`. Nunca `<select>`.

### 3.4 Árbol

```tsx
<TreeList
  nodes={dependencias.map((d) => ({
    id: `dep-${d.id}`, label: d.nombre, icon: Building2, tileColor: d.color,
    sub: `${d.categorias.length} categorías · ${d.tramites} trámites`,
    actions: [{ id: 'edit', label: 'Editar', icon: Pencil, onClick: () => editar(d) }],
    addLabel: 'Agregar categoría', onAdd: () => nuevaCategoria(d.id),
    children: d.categorias.map((c) => ({ … })),
  }))}
  expandedIds={abiertos} onExpandedChange={setAbiertos}
  footer="11 dependencias · 42 trámites"
/>
```

- La profundidad la calcula el componente recorriendo `children`: la página
  manda datos, no medidas.
- Chevron y cuerpo son gestos distintos: el chevron siempre expande; el cuerpo
  llama a `onNodeClick` si la página lo pasó, y si no, también expande.
- Máximo 2 acciones por nodo, sin menú de desborde: el nodo ya carga chevron,
  tile, chip y cifra. Si hacen falta más, van en el drawer.

### 3.5 Métrica en una columna

```tsx
{ id: 'uso', header: 'EN USO', width: 'minmax(80px, 0.6fr)', align: 'right', kind: 'metric' }
// y en la fila:
uso: { value: '38', note: 'históricos' }
uso: { value: '0',  note: 'sin usar', muted: true }   // el cero no es una alerta
uso: { value: '212', note: 'este mes', veredicto: 'advertencia' }
```

### 3.6 Icono + color

```tsx
<IconColorPicker
  icons={ICONOS_CATALOGO}          // nombres lucide; los resuelve DynamicIcon
  icon={form.icono} onIconChange={(n) => setForm({ ...form, icono: n })}
  colors={COLORES_CATALOGO}
  color={form.color} onColorChange={(c) => setForm({ ...form, color: c })}
  preview={{ title: form.nombre || 'Sin nombre', subtitle: 'Icono y color' }}
  note="El color agrupa visualmente en el mapa y las listas. La urgencia la define la prioridad."
  collapsible
/>
```

---

## 4. Qué NO es un control del kit

- Un **layout de pantalla** (dos columnas, riel + panel): eso es una página
  (`SettingsShell`, `SemanticAbmPage`).
- Algo que aparece **una sola vez** y no se parece a nada (el QR de cartelería,
  el editor de banner). Vive en la pantalla, con sus clases propias, y si
  mañana aparece un segundo caso se sube al kit.
- Una **variante de copy**. Si el único cambio es el texto, es una prop.
