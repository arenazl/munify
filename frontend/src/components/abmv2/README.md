# abmv2 — suite del estándar `SemanticAbmPage`

Implementación del estándar de páginas ABM del rediseño v2. Fuentes de verdad:

- `docs/design/paquetes/04_2026-07-31_handoff-v2/STANDARD-SemanticAbmPage.md` — anatomía, medidas, reglas transversales.
- `docs/design/paquetes/04_2026-07-31_handoff-v2/STANDARD-Variaciones-por-props.md` — contratos TS y variaciones por `kind`/`mode`.

**Todas las pantallas de listado son LA MISMA página configurada por props.** No se maqueta una
pantalla por módulo: se instancia `SemanticAbmPage<Row>` con otra data y otras banderas.

## Piezas

| Archivo | Qué es |
|---|---|
| `types.ts` | Contratos TS del estándar (`SemanticAbmPageProps`, `ListKind`, `SideModalProps`…). |
| `SemanticAbmPage.tsx` | Orquestador: `SemanticHero → ListToolbar → FilterBar → DataTable` + estado del `SideModal`. |
| `ListToolbar.tsx` | H1 + chip total + buscador (flex-grow) + segmented de vistas + secundario + **único CTA primario**. |
| `FilterBar.tsx` | Selects (`ModernSelect` envuelto) + `PeriodControl` (envuelve el `PeriodNavigator` del dueño, con "→ Hasta" dinámico) + segmented de estados + resumen. |
| `DataTable.tsx` | Tabla grid `minmax()`, grupos por fecha/hora con subtotal, filas clickeables, pie con gran total. Exporta `ChipEstado`, `EntityCell`, `Insignia`, `toneDeEstado`. |
| `SideModal.tsx` | Drawer derecho (detail / create / edit). Exporta `StatusStepper`, `DepartmentTrail`, `CandidateList`, `SideModalField`. |
| `styles/abmv2.css` | Todo el CSS por clases `av2-*` sobre tokens `--pl-*` (importado en `main.tsx`). Cero colores fijos. |

El **ModuleHero es el `SemanticHero` existente** (`components/ui/SemanticHero.tsx`): el orquestador
lo importa, no lo duplica. Las frases se arman con `seg()` de `lib/semanticHero`.

## Reglas que la página consumidora NO puede romper

1. Polimórfico: nada de hex inline. `accentColor` y colores de chips = tokens (`var(--pl-red)`), y
   los únicos inline permitidos son valores runtime (colores de categoría que vienen de datos).
2. Un solo CTA primario por pantalla (`primaryAction`).
3. El dinero SIEMPRE en la última columna de datos, `kind: 'money'` en su `ColumnSpec`.
4. `kind='money'` exige `period` (el orquestador lo avisa en dev).
5. La columna de acciones se declara en `columns` con `kind: 'actions'`; sin ella, las
   `rowActions` no se renderizan.
6. Los grupos (`groups`) los precomputa y formatea la página (fechas, subtotales, cupos);
   el `DataTable` solo pinta.
7. **El `veredicto` es transversal al kit.** Donde una pieza pueda declarar un
   estado, lo declara con `'bueno' | 'advertencia' | 'malo'` y el CSS lo traduce
   a color vía `--pl-tono`. Cuando NO aplica —una lista de pagos que ya se
   hicieron no tiene nada que avisar— se omite y todo cae al acento del theme.
   Hoy lo usan el hero (gradiente + barra izquierda, sale de la frase activa) y
   la cabecera de grupo (insignia + renglón chico).
8. `kind='board'` (Planificación) está **pendiente**: en dev tira error, no lo uses todavía.

### Cabecera de grupo: dos renglones

`TableGroup` tiene `title` (la fecha escrita entera, en negrita) y `label` (qué
hay adentro). El **sustantivo del `label` lo pone la página**, que es la que sabe
qué lista es: `"3 movimientos"` en Gastos, `"5 pagos · venció hace 1 día"` en
Liquidaciones, `"4 de 4 cupos"` en Agenda. `title` es opcional: sin él la
cabecera queda de una sola línea, como antes de 2026-08-02.

```tsx
{
  key: '2026-08-01',
  badge: { top: '1', bottom: 'AGO' },
  title: '1 de agosto',                        // renglón fuerte
  label: '5 pagos · venció hace 1 día',        // renglón chico
  veredicto: 'malo',                           // tiñe insignia + renglón chico
  subtotal: '$ 23.500.000',
  rows,
}
```

## Cómo instanciar

### Reclamos — `kind='plain'` (sin dinero)

```tsx
import { SemanticAbmPage } from '@/components/abmv2/SemanticAbmPage';
import { EntityCell, toneDeEstado } from '@/components/abmv2/DataTable';
import type { ColumnSpec } from '@/components/abmv2/types';
import { seg } from '@/lib/semanticHero';
import { Eye, Trash2, Wrench } from 'lucide-react';

interface ReclamoRow {
  id: number;
  codigo: string;
  titulo: string;
  categoria: string;
  categoriaColor: string;   // viene de datos → permitido inline (runtime)
  zona: string;
  fecha: string;            // ya formateada por la página
  estado: string;           // 'recibido' | 'en_curso' | …
}

const columns: ColumnSpec<ReclamoRow>[] = [
  { id: 'codigo', header: 'RECLAMO', width: 'minmax(90px, 0.7fr)', kind: 'text' },
  {
    id: 'titulo', header: 'DETALLE', width: 'minmax(220px, 2fr)', kind: 'entity',
    cell: (r) => (
      <EntityCell icon={Wrench} tileColor={r.categoriaColor} title={r.titulo}
        subtitle={r.categoria} dotColor={r.categoriaColor} />
    ),
  },
  { id: 'zona', header: 'ZONA', width: 'minmax(110px, 1fr)', kind: 'text' },
  { id: 'fecha', header: 'INGRESO', width: 'minmax(90px, 0.8fr)', kind: 'date' },
  { id: 'estado', header: 'ESTADO', width: 'minmax(110px, 0.9fr)', kind: 'chip' },
  { id: 'acciones', header: 'ACCIONES', width: 'minmax(76px, 0.5fr)', kind: 'actions', align: 'right' },
];

<SemanticAbmPage<ReclamoRow>
  moduleKey="reclamos"
  hero={{
    etiqueta: 'RECLAMOS · JULIO 2026',
    frases: [{ segmentos: [
      seg('Se resolvieron '), seg('12 reclamos', 'bueno'),
      seg(' esta semana, pero '), seg('3 vencen hoy', 'advertencia'),
      seg(' — conviene despachar Alumbrado primero.'),
    ]}],
    kpis: [
      { etiqueta: 'ABIERTOS', valor: 21, sub: '43% · 9 sin cuadrilla', veredicto: 'advertencia' },
      { etiqueta: 'RESUELTOS', valor: 12, sub: 'esta semana' },
      { etiqueta: 'VENCEN HOY', valor: 3, sub: 'SLA 48 h', veredicto: 'malo' },
    ],
  }}
  title="Reclamos"
  totalCount={49}
  searchPlaceholder="Buscar por código, dirección o vecino…"
  views={['table', 'cards']}
  primaryAction={{ label: 'Nuevo reclamo', onClick: abrirAlta }}
  selects={[{ id: 'cat', label: 'Categoría', value: cat, options: cats, onChange: setCat }]}
  period={{ unit: 'month', from: '2026-07' }}
  onPeriodChange={setPeriodo}
  statusTabs={[
    { id: 'todos', label: 'Todos', count: 49 },
    { id: 'recibido', label: 'Recibidos', count: 21 },
    { id: 'en_curso', label: 'En curso', count: 16 },
    { id: 'resuelto', label: 'Resueltos', count: 12 },
  ]}
  kind="plain"
  columns={columns}
  groupBy="date"
  groups={gruposPorFecha}          // TableGroup<ReclamoRow>[] precomputados
  rows={[]}                        // se usa `groups`; `rows` para listas planas
  rowActions={[
    { id: 'ver', label: 'Ver', icon: Eye, onClick: verReclamo },
    { id: 'del', label: 'Eliminar', icon: Trash2, danger: true, onClick: pedirBorrado },
  ]}
  footer={{ showing: 'Mostrando 49 de 49', action: { label: 'Cargar más', onClick: cargarMas } }}
  search={q} onSearchChange={setQ}
  activeView={vista} onViewChange={setVista}
  activeStatus={estado} onStatusChange={setEstado}
  rowKey={(r) => r.id}
  sideModal={({ mode, row }) =>
    mode === 'detail' && row
      ? {
          mode: 'detail', width: 560,
          header: { id: `#${row.codigo}`, title: row.titulo },
          stepper: pasosDe(row),               // StepperStep[]
          sections: seccionesDe(row),          // descripción → contraparte → …
          trail: recorridoDe(row),             // DepartmentTrail
          footer: { note: { required: true, placeholder: 'Motivo del cambio…' },
                    primary: { label: 'Marcar en curso', onClick: () => avanzar(row) } },
        }
      : null
  }
/>
```

### Gastos — `kind='money'` (subtotales por día + gran total)

```tsx
<SemanticAbmPage<GastoRow>
  moduleKey="gastos"
  hero={{ etiqueta: 'TESORERÍA · JULIO 2026', frases: [/* veredicto del mes */], kpis: [/* strip */] }}
  // accentColor: SOLO un token. Ej. módulo en alerta:
  // accentColor="var(--pl-red)"
  title="Gastos"
  totalCount={50}
  searchPlaceholder="Buscar por proveedor, concepto o comprobante…"
  views={['table', 'guided']}
  secondaryAction={{ label: 'Proyección', to: '/tesoreria/proyeccion' }}
  primaryAction={{ label: 'Nuevo pago' }}
  primaryOpensCreate                     // el CTA abre el drawer en mode='create'
  selects={[
    { id: 'caja', label: 'Caja', value: caja, options: cajas, onChange: setCaja },
    { id: 'dep', label: 'Dependencia', value: dep, options: deps, onChange: setDep },
  ]}
  period={{ unit: 'month', from: '2026-07' }}   // OBLIGATORIO en money
  onPeriodChange={setPeriodo}
  statusTabs={tabsEstado}
  filterSummary="50 movimientos · $ 43.048.905"
  kind="money"
  columns={columnasGasto}                // última de datos: { kind: 'money', align: 'right' }
  groupBy="date"
  showGroupSubtotal                      // SUBTOTAL por día en la columna del importe
  groups={gruposConSubtotal}             // subtotal YA formateado por la página
  rows={[]}
  rowActions={accionesFila}
  footer={{ showing: 'Mostrando 50 de 50',
            total: { label: 'Total del período', value: '$ 43.048.905' } }}
  search={q} onSearchChange={setQ}
  activeView={vista} onViewChange={setVista}
  activeStatus={estado} onStatusChange={setEstado}
  rowKey={(r) => r.id}
  sideModal={({ mode, row }) =>
    mode === 'create'
      ? {
          mode: 'create', width: 480,
          header: { title: 'Nuevo pago' },
          sections: seccionesAlta,        // con revealed:false para el revelado progresivo
          footer: { info: '2 obligatorios sin completar',
                    secondary: [{ label: 'Cancelar', onClick: cerrar }],
                    primary: { label: 'Guardar', onClick: guardar } },
        }
      : row
        ? {
            mode: 'detail', width: 520,   // 520 = drawer de dinero
            header: { id: `#${row.op}`, title: row.concepto,
                      amount: row.importeFmt, statusChip: chipDe(row) },
            stepper: circuitoDe(row),     // Registrado → Autorizado → Pagado → Conciliado
            sections: seccionesDetalle(row),
            footer: { primary: { label: 'Marcar como pagado', onClick: () => pagar(row) },
                      secondary: [{ label: 'Generar OP' }, { label: 'Editar' }],
                      destructive: { label: 'Anular', onClick: () => anular(row) } },
          }
        : null
  }
/>
```

**Cobros instancia exactamente esta misma configuración** con otra data: estados
Emitido/Notificado/Cobrado/Conciliado, CTA "Registrar cobro", importe en mora `av2-money--bad`.

## El SideModal: dos formas de manejarlo

1. **Delegado (recomendado):** pasás `sideModal` (builder). Click en fila → `mode='detail'` con la
   fila; con `primaryOpensCreate`, el CTA primario → `mode='create'`. El orquestador abre/cierra.
2. **Manual:** no pasás `sideModal`; escuchás `onRowClick` / `primaryAction.onClick` y renderizás
   `<SideModal>` (import de `./SideModal`) con tu propio estado. Útil si el detalle necesita
   fetch previo o rutas propias de apertura.

`mode='edit'` se abre siempre por la vía manual o devolviéndolo desde el builder tras una acción
del detail (la página cambia su propio estado y re-renderiza el builder).

## Mapa de adopción (qué página usa qué `kind`)

| Página | `kind` | Notas |
|---|---|---|
| Reclamos | `plain` | `groupBy='date'`, drawer 560 con stepper + `DepartmentTrail` + `CandidateList`. |
| Trámites | `plain` | Igual a Reclamos; estados propios del circuito de trámite. |
| Personal / Inventario | `plain` | Sin `period` (listas sin fecha). |
| Contactos (Tesorería) | `plain` | Drawer 480 (registro simple). |
| Gastos / Órdenes de pago | `money` | Referencia del estándar: subtotales por día + gran total + `PeriodControl`. |
| Cobros / Tasas | `money` | Misma instancia que Gastos con otra data (ver tabla del estándar). |
| Liquidaciones | `money` | `accentColor="var(--pl-red)"` cuando el módulo está en alerta. |
| Cajas / Conciliación | `money` | CTA "Conciliar caja". |
| Agenda de turnos | `schedule` | `groupBy='hour'`, grupos con cupos, vistas `day`/`week`. |
| Planificación | `board` | **PENDIENTE — no implementar.** Tipado reservado en `types.ts`; en dev tira error. |

La adopción es incremental: las páginas existentes migran una por una a esta suite; hasta
migrar, conviven con sus pantallas actuales. **No tocar páginas existentes al agregar piezas acá.**
