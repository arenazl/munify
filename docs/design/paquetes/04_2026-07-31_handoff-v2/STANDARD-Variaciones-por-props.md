# Variaciones = props, no pantallas nuevas

Todas las pantallas de este handoff son **la misma página** (`SemanticAbmPage`) y el **mismo drawer** (`SideModal`) configurados por props. No se maqueta una pantalla por módulo: se instancia el componente con otra data y otras banderas.

```ts
type ListKind = 'plain' | 'money' | 'schedule' | 'board';

interface SemanticAbmPageProps<Row> {
  /** Identidad y copy */
  moduleKey: string;                    // 'reclamos' | 'gastos' | 'agenda' | …
  hero: ModuleHeroProps;                // eyebrow + verdict + stats + actions
  accentColor?: string;                 // borde izquierdo del hero: --pl-green por defecto,
                                        // --pl-red cuando el módulo está en alerta (Liquidaciones)

  /** Toolbar */
  title: string;
  totalCount: number;
  searchPlaceholder: string;
  views: Array<'cards' | 'table' | 'guided' | 'day' | 'week'>;
  secondaryAction?: Action;             // "Pago masivo", "Proyección", "Horarios de la oficina"
  primaryAction: Action;                // único CTA verde

  /** Filtros */
  selects: SelectSpec[];                // Categoría, Dependencia, Caja, Zona, Frecuencia…
  period?: PeriodControlValue;          // omitir en listas sin fecha (Personal, Inventario)
  statusTabs: StatusTab[];              // con conteo; 0 ⇒ deshabilitado
  filterSummary?: string;               // "50 movimientos · $ 43.048.905"

  /** Tabla */
  kind: ListKind;                       // define columnas y pie, ver abajo
  columns: ColumnSpec[];                // toda columna con minmax(); dinero SIEMPRE última
  groupBy?: 'date' | 'hour' | 'none';
  showGroupSubtotal?: boolean;          // true en kind='money'
  rows: Row[];
  rowActions: RowAction[];              // 2 máximo visibles; el resto en menú "…"
  footer: { showing: string; total?: { label: string; value: string } };
}
```

## Qué cambia por `kind`

| `kind` | Ejemplos | Diferencias |
|---|---|---|
| `plain` | Reclamos, Personal, Inventario, Trámites | Sin columna de dinero, sin subtotales. Pie: "Mostrando N de M" + acción. |
| `money` | Gastos, Cobros, Liquidaciones | Columna MONTO al final (right, Sora 700, `tnum`, `nowrap`), subtotal por grupo y gran total en el pie. `period` obligatorio. |
| `schedule` | Agenda de turnos | `groupBy: 'hour'`; el grupo muestra cupos ("4 de 4 cupos" / "1 cupo libre"); insignia de hora por fila; vistas `day`/`week`. |
| `board` | Planificación | En lugar de tabla, grilla recurso × día: filas de persona, celdas con carga (blanco / ámbar / rojo), tareas arrastrables y una bandeja "Sin asignar" abajo. Mismo hero, toolbar y filtros. |

## Qué cambia en `SideModal`

```ts
interface SideModalProps {
  mode: 'detail' | 'create' | 'edit';
  width?: 480 | 520 | 560;             // 480 alta/edición, 520 dinero, 560 con proceso
  stepper?: StepperStep[];             // solo mode='detail' y registros con estados
  sections: SectionSpec[];             // hairlines, nunca tarjeta con borde de color
  trail?: TrailStep[];                 // circuito entre dependencias / autorización
  candidates?: CandidateSpec[];        // asignación con radios y score
  footer: {
    note?: { required: boolean; placeholder: string };
    primary: Action;                   // nombra el resultado: "Marcar como pagado"
    secondary?: Action[];              // "Generar OP", "Editar", "Posponer"
    destructive?: Action;              // icono, nunca botón de texto
  };
}
```

- `mode: 'detail'` → stepper + secciones de lectura + timeline + footer con la acción que falta.
- `mode: 'create' | 'edit'` → sin stepper ni timeline; campos con label arriba y asterisco ámbar; **revelado progresivo** por categoría; footer = contador de obligatorios + Cancelar (ghost) + Guardar (primario).
- Wizards de más de 3 pasos: un solo indicador (stepper con label del paso actual), nunca stepper + puntos; agrupar en 4 pasos como máximo.

## Flujos con paso previo (`Mostrador`)

Cuando el módulo necesita identificar a alguien antes de cargar, la página lleva `steps` en la toolbar (chips numerados clickeables) y renderiza el paso activo:

1. **Identificar** — dos caminos en paralelo (por documento / con el celular del vecino y validación biométrica), cada uno con su estado y errores in situ.
2. **Cargar la gestión** — banda verde "Identidad validada" con nombre, documento y hora, formulario con los datos del padrón ya cargados, y panel lateral con la ficha del vecino y sus gestiones previas.

El mismo patrón sirve para cualquier flujo asistido: cambian los pasos, no la estructura.

<!-- Nota Munify (dueño, 2026-07-31): tras validar identidad en Mostrador, navegar a
     la pantalla de carga de trámite/reclamo CON los datos ya validados precargados. -->
