import { useEffect, useMemo, useState, useCallback } from 'react';
import { AlertTriangle, Package, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { SemanticAbmPage } from '../components/abmv2/SemanticAbmPage';
import { EntityCell, ChipEstado } from '../components/abmv2/DataTable';
import type { ColumnSpec, ViewKind } from '../components/abmv2/types';
import { Sheet } from '../components/ui/Sheet';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { ModernSelect, type SelectOption } from '../components/ui/ModernSelect';
import { DatePicker } from '../components/ui/DatePicker';
import { DynamicIcon } from '../components/ui/DynamicIcon';
import { seg, type HeroFrase } from '../lib/semanticHero';
import { resolverUmbrales, veredictoMasEsPeor } from '../lib/veredictos';
import { inventarioApi } from '../lib/api';
import {
  naturalezaLabels, naturalezaColors, naturalezaIcons,
  estadoActivoLabel, estadoActivoColor, estadoActivoColors,
  ESTADO_ACTIVO_OPTIONS,
  movimientoLabels, movimientoColors, signoMovimiento,
} from '../lib/enums/inventario';
import type { InventarioItem, InventarioCategoria, NaturalezaInventario, EstadoActivo } from '../types';
import { useReportarTotal } from '../components/abmv2/useEmbed';
import { formatFechaAR } from '../lib/tesoreria-helpers';

type FormState = {
  categoria_id: string;
  /** Dónde queda guardado. Vacío = sin ubicación (lo que existía antes). */
  deposito_id: string;
  nombre: string;
  descripcion: string;
  stock_actual: string;
  stock_minimo: string;
  unidad: string;
  identificador: string;
  estado_activo: EstadoActivo;
  // --- Vehículo (módulo Flota). Un activo con estos datos ES un vehículo:
  //     no hay tabla aparte. En un martillo quedan todos vacíos. ---
  esVehiculo: boolean;
  reservable: boolean;
  marca_modelo: string;
  anio: string;
  tipo_combustible: string;
  km_actual: string;
  vencimiento_vtv: string;
  vencimiento_seguro: string;
  km_proximo_service: string;
};

interface MovimientoItem {
  id: number;
  tipo: string;
  cantidad: number;
  stock_resultante?: number | null;
  contraparte?: string | null;
  motivo?: string | null;
  usuario_nombre?: string | null;
  fecha?: string | null;
}

const FORM_VACIO: FormState = {
  categoria_id: '', deposito_id: '', nombre: '', descripcion: '',
  stock_actual: '', stock_minimo: '', unidad: '',
  identificador: '', estado_activo: 'disponible',
  esVehiculo: false, reservable: false, marca_modelo: '', anio: '', tipo_combustible: '',
  km_actual: '', vencimiento_vtv: '', vencimiento_seguro: '', km_proximo_service: '',
};

const COMBUSTIBLES: SelectOption[] = [
  { value: 'nafta', label: 'Nafta' },
  { value: 'gasoil', label: 'Gasoil' },
  { value: 'gnc', label: 'GNC' },
  { value: 'electrico', label: 'Eléctrico' },
];

export default function Inventario() {
  const { theme } = useTheme();
  const { user } = useAuth();

  const [items, setItems] = useState<InventarioItem[]>([]);

  // Publica el total para el contador del riel de Configuración.

  useReportarTotal(items.length);
  const [todos, setTodos] = useState<InventarioItem[]>([]); // sin filtro, para contar píldoras
  const [categorias, setCategorias] = useState<InventarioCategoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  /* `tab` reemplaza a `filtroNaturaleza`: ademas de activo/consumible ahora
     filtra "en uso" y "bajo el minimo", que antes eran numeros muertos en el
     hero. Los dos primeros los filtra el servidor (params.naturaleza); los dos
     ultimos se resuelven en cliente sobre lo ya traido. */
  const [tab, setTab] = useState<string>('');
  const [vista, setVista] = useState<ViewKind>('table');
  const [filtroCategoria, setFiltroCategoria] = useState<string>('');

  const [sheetOpen, setSheetOpen] = useState(false);
  const [selected, setSelected] = useState<InventarioItem | null>(null);
  const [form, setForm] = useState<FormState>(FORM_VACIO);
  const [guardando, setGuardando] = useState(false);
  const [depositos, setDepositos] = useState<{ id: number; nombre: string }[]>([]);
  /* El historial del artículo: qué entró, qué salió y quién se lo llevó. Se
     pide sólo al abrir una ficha existente — en el alta no hay nada que ver. */
  const [historial, setHistorial] = useState<MovimientoItem[]>([]);
  const [cargandoHist, setCargandoHist] = useState(false);
  const [toDelete, setToDelete] = useState<InventarioItem | null>(null);

  const esGestor = user?.rol === 'admin' || user?.rol === 'supervisor';

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = {};
      if (tab === 'activo' || tab === 'consumible') params.naturaleza = tab;
      if (filtroCategoria) params.categoria_id = Number(filtroCategoria);
      if (search.trim()) params.search = search.trim();
      const res = await inventarioApi.listItems(params);
      setItems(res.data || []);
    } catch {
      toast.error('Error cargando el inventario');
    } finally {
      setLoading(false);
    }
  }, [tab, filtroCategoria, search]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  // Conteos para las píldoras (independiente del filtro activo)
  useEffect(() => {
    inventarioApi.listItems({ limit: 500 }).then(res => setTodos(res.data || [])).catch(() => {});
  }, [items]);

  const cargarCategorias = useCallback(async () => {
    try {
      const res = await inventarioApi.listCategorias({ activo: true });
      setCategorias(res.data || []);
    } catch { /* best-effort */ }
  }, []);
  useEffect(() => { if (esGestor) cargarCategorias(); }, [esGestor, cargarCategorias]);

  /* Los depósitos vienen sembrados (central, corralón, vivero) y el municipio
     los edita en Configuración; acá sólo se elige uno. */
  const cargarDepositos = useCallback(async () => {
    try {
      const res = await inventarioApi.listDepositos({ activo: true });
      setDepositos(Array.isArray(res.data) ? res.data : []);
    } catch { /* sin depósitos, el selector queda vacío y el ítem sin ubicación */ }
  }, []);
  useEffect(() => { if (esGestor) cargarDepositos(); }, [esGestor, cargarDepositos]);

  useEffect(() => {
    if (!sheetOpen || !selected) { setHistorial([]); return; }
    let vivo = true;
    setCargandoHist(true);
    inventarioApi.historialItem(selected.id, { limit: 30 })
      .then(res => { if (vivo) setHistorial(Array.isArray(res.data) ? res.data : []); })
      .catch(() => { if (vivo) setHistorial([]); })
      .finally(() => { if (vivo) setCargandoHist(false); });
    return () => { vivo = false; };
  }, [sheetOpen, selected]);

  /* "En uso" y "bajo el minimo" se calculan una vez: los usan el hero, los KPIs
     y los tabs. Antes vivian adentro del useMemo del hero y no se podian
     reutilizar para filtrar. */
  const enUsoCount = useMemo(
    () => todos.filter(t => t.estado_activo === 'en_uso').length, [todos]);
  const bajoMinimoCount = useMemo(
    () => todos.filter(t => t.bajo_stock).length, [todos]);

  const conteosNaturaleza = useMemo(() => {
    const c: Record<string, number> = {};
    for (const it of todos) c[it.naturaleza] = (c[it.naturaleza] || 0) + 1;
    return c;
  }, [todos]);

  // Frases del hero semántico: solo con datos reales ya cargados (todos).
  const heroFrases = useMemo<HeroFrase[]>(() => {
    if (todos.length === 0) return [];
    const u = resolverUmbrales();
    const activos = todos.filter(t => t.naturaleza === 'activo').length;
    const consumibles = todos.filter(t => t.naturaleza === 'consumible').length;
    const enUso = todos.filter(t => t.estado_activo === 'en_uso').length;
    const bajoMinimo = todos.filter(t =>
      t.naturaleza === 'consumible' && t.stock_minimo != null && (t.stock_actual ?? 0) < t.stock_minimo,
    ).length;

    const frases: HeroFrase[] = [];

    frases.push({
      segmentos: [
        seg(`El inventario tiene ${todos.length} ítem${todos.length === 1 ? '' : 's'}: ${activos} activos y ${consumibles} consumibles`),
        ...(enUso > 0
          ? [seg(', con '), seg(`${enUso} en uso ahora`, 'bueno'), seg('.')]
          : [seg('.')]),
      ],
      acciones: [{ label: 'Órdenes', to: '/gestion/ordenes-trabajo', primaria: true }],
    });

    if (consumibles > 0) {
      frases.push({
        segmentos: bajoMinimo > 0
          ? [
              seg('Hay '),
              seg(
                `${bajoMinimo} consumible${bajoMinimo === 1 ? '' : 's'} con stock bajo el mínimo`,
                veredictoMasEsPeor(bajoMinimo, u.slaRiesgo),
              ),
              seg('.'),
            ]
          : [seg('Todos los consumibles arriba del mínimo', 'bueno'), seg('.')],
        acciones: [{ label: 'Órdenes', to: '/gestion/ordenes-trabajo' }],
      });
    }

    return frases;
  }, [todos]);

  const abrirNuevo = () => {
    setSelected(null);
    setForm({ ...FORM_VACIO });
    setSheetOpen(true);
  };

  const abrirEdit = (item: InventarioItem) => {
    setSelected(item);
    setForm({
      categoria_id: String(item.categoria_id),
      deposito_id: item.deposito_id ? String(item.deposito_id) : '',
      nombre: item.nombre,
      descripcion: item.descripcion || '',
      stock_actual: item.stock_actual != null ? String(item.stock_actual) : '',
      stock_minimo: item.stock_minimo != null ? String(item.stock_minimo) : '',
      unidad: item.unidad || '',
      identificador: item.identificador || '',
      estado_activo: item.estado_activo || 'disponible',
      // Es vehículo si tiene combustible cargado: ese es el campo que lo hace
      // aparecer en Flota, así que es el que define el tilde.
      esVehiculo: Boolean(item.tipo_combustible),
      reservable: Boolean(item.reservable),
      marca_modelo: item.marca_modelo || '',
      anio: item.anio != null ? String(item.anio) : '',
      tipo_combustible: item.tipo_combustible || '',
      km_actual: item.km_actual != null ? String(item.km_actual) : '',
      vencimiento_vtv: item.vencimiento_vtv || '',
      vencimiento_seguro: item.vencimiento_seguro || '',
      km_proximo_service: item.km_proximo_service != null ? String(item.km_proximo_service) : '',
    });
    setSheetOpen(true);
  };

  const catSeleccionada = useMemo(
    () => categorias.find(c => c.id === Number(form.categoria_id)) || null,
    [categorias, form.categoria_id],
  );
  const naturalezaForm: NaturalezaInventario | null = catSeleccionada?.naturaleza ?? selected?.naturaleza ?? null;

  const guardar = async () => {
    if (!form.categoria_id) { toast.error('Elegí una categoría'); return; }
    if (!form.nombre.trim()) { toast.error('Poné un nombre'); return; }
    try {
      setGuardando(true);
      const payload: Record<string, unknown> = {
        categoria_id: Number(form.categoria_id),
        nombre: form.nombre.trim(),
        descripcion: form.descripcion.trim() || null,
        deposito_id: form.deposito_id ? Number(form.deposito_id) : null,
      };
      if (naturalezaForm === 'consumible') {
        payload.stock_actual = form.stock_actual ? Number(form.stock_actual) : 0;
        payload.stock_minimo = form.stock_minimo ? Number(form.stock_minimo) : null;
        payload.unidad = form.unidad.trim() || null;
      } else if (naturalezaForm === 'activo') {
        payload.identificador = form.identificador.trim() || null;
        payload.estado_activo = form.estado_activo;
        // Flota: los campos van SIEMPRE, en null cuando se destilda. Así
        // desmarcar "es un vehículo" lo saca de la flota de verdad, en vez de
        // dejar datos huérfanos que lo siguen mostrando ahí.
        payload.reservable = form.reservable;
        payload.marca_modelo = form.esVehiculo ? (form.marca_modelo.trim() || null) : null;
        payload.anio = form.esVehiculo && form.anio ? Number(form.anio) : null;
        payload.tipo_combustible = form.esVehiculo ? (form.tipo_combustible || null) : null;
        payload.km_actual = form.esVehiculo && form.km_actual ? Number(form.km_actual) : null;
        payload.vencimiento_vtv = form.esVehiculo ? (form.vencimiento_vtv || null) : null;
        payload.vencimiento_seguro = form.esVehiculo ? (form.vencimiento_seguro || null) : null;
        payload.km_proximo_service = form.esVehiculo && form.km_proximo_service
          ? Number(form.km_proximo_service) : null;
      }
      if (selected) {
        await inventarioApi.updateItem(selected.id, payload);
        toast.success('Ítem actualizado');
      } else {
        await inventarioApi.createItem(payload);
        toast.success('Ítem creado');
      }
      setSheetOpen(false);
      await fetchItems();
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail || 'No se pudo guardar');
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = async () => {
    if (!toDelete) return;
    try {
      await inventarioApi.deleteItem(toDelete.id);
      toast.success('Ítem eliminado');
      setToDelete(null);
      await fetchItems();
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail || 'No se pudo eliminar');
      setToDelete(null);
    }
  };

  const categoriaOptions: SelectOption[] = useMemo(() => {
    // En edición limitamos a categorías de la misma naturaleza (regla del backend).
    const base = selected
      ? categorias.filter(c => c.naturaleza === selected.naturaleza)
      : categorias;
    return base.map(c => ({
      value: String(c.id),
      label: `${c.nombre} · ${naturalezaLabels[c.naturaleza]}`,
    }));
  }, [categorias, selected]);

  const depositoOptions: SelectOption[] = useMemo(() => [
    { value: '', label: 'Sin depósito asignado' },
    ...depositos.map(d => ({ value: String(d.id), label: d.nombre })),
  ], [depositos]);

  const categoriaFiltroOptions: SelectOption[] = useMemo(() =>
    categorias.map(c => ({ value: String(c.id), label: c.nombre })),
  [categorias]);

  const inputStyle = { backgroundColor: theme.card, color: theme.text, border: `1px solid ${theme.border}` };

  // Descriptor de "qué tiene / en qué estado" según naturaleza (tabla + card).
  const renderEstadoCelda = useCallback((item: InventarioItem) => {
    if (item.naturaleza === 'consumible') {
      const c = item.bajo_stock ? estadoActivoColors.en_uso : theme.textSecondary;
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium" style={{ color: c }}>
          {item.bajo_stock && <AlertTriangle className="h-3.5 w-3.5" />}
          {item.stock_actual ?? 0}{item.unidad ? ` ${item.unidad}` : ''}
        </span>
      );
    }
    const color = estadoActivoColor(item.estado_activo);
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: `${color}20`, color }}>
          {estadoActivoLabel(item.estado_activo)}
        </span>
        {item.ocupado_por_ot_numero && (
          <span className="text-[11px] font-mono" style={{ color: theme.textSecondary }}>{item.ocupado_por_ot_numero}</span>
        )}
      </span>
    );
  }, [theme.textSecondary]);

  /* Columnas del kit v2. La tabla vieja (`ABMTable`) usaba `key/header/render`;
     el `DataTable` del kit pide `id/width/kind/cell` y con eso sabe alinear,
     agrupar y pintar los chips solo. */
  const columnas = useMemo<ColumnSpec<InventarioItem>[]>(() => [
    {
      id: 'nombre',
      header: 'Ítem',
      width: 'minmax(200px, 2fr)',
      kind: 'entity',
      cell: (it) => (
        <EntityCell
          icon={<DynamicIcon name={it.categoria_icono || 'Package'} className="h-4 w-4" style={{ color: it.categoria_color || '#3b82f6' }} />}
          tileColor={it.categoria_color || '#3b82f6'}
          title={it.nombre}
          subtitle={it.identificador || undefined}
        />
      ),
    },
    {
      id: 'categoria',
      header: 'Categoría',
      width: 'minmax(120px, 0.9fr)',
      kind: 'text',
      cell: (it) => it.categoria_nombre || '—',
    },
    {
      id: 'deposito',
      header: 'Dónde está',
      width: 'minmax(120px, 0.9fr)',
      kind: 'text',
      cell: (it) => it.deposito_nombre || '—',
    },
    {
      id: 'naturaleza',
      header: 'Qué es',
      width: 'minmax(110px, 0.7fr)',
      kind: 'chip',
      cell: (it) => (
        <ChipEstado
          label={naturalezaLabels[it.naturaleza] ?? it.naturaleza}
          tone={it.naturaleza === 'activo' ? 'blue' : 'green'}
        />
      ),
    },
    {
      id: 'estado',
      header: 'Stock / Estado',
      width: 'minmax(140px, 1fr)',
      kind: 'text',
      cell: renderEstadoCelda,
    },
    { id: 'acciones', header: '', width: '48px', kind: 'actions' },
  ], [renderEstadoCelda]);

  /* Los cinco KPIs del hero. El de "en uso" y el de "bajo el mínimo" son los
     que el dueño no podía abrir: eran un número y nada más. Ahora cada uno
     filtra la lista (dueño, 2026-08-31). */
  /* Los tabs de naturaleza los filtra el servidor; estos dos, el cliente. */
  const visibles = useMemo(() => {
    if (tab === 'en_uso') return items.filter(it => it.estado_activo === 'en_uso');
    if (tab === 'bajo_minimo') return items.filter(it => it.bajo_stock);
    return items;
  }, [items, tab]);

  const heroKpis = useMemo(() => ([
    { etiqueta: 'Ítems', valor: String(todos.length) },
    { etiqueta: 'Activos', valor: String(conteosNaturaleza.activo || 0) },
    { etiqueta: 'Consumibles', valor: String(conteosNaturaleza.consumible || 0) },
    { etiqueta: 'En uso ahora', valor: String(enUsoCount) },
    { etiqueta: 'Bajo el mínimo', valor: String(bajoMinimoCount) },
  ]), [todos.length, conteosNaturaleza, enUsoCount, bajoMinimoCount]);

  return (
    <>
      <SemanticAbmPage<InventarioItem>
        moduleKey="inventario"
        eyebrow="Inventario"
        title="Inventario"
        description="Los bienes y materiales del municipio: qué hay, dónde está y de qué hay poco."
        hero={{ etiqueta: 'INVENTARIO · ESTADO', frases: heroFrases, kpis: heroKpis }}
        pista={{
          titulo: 'Acá se define, no se mueve',
          texto:
            'El stock no se edita a mano desde esta lista: cambia con las entradas, salidas y ajustes del libro de Movimientos, y con lo que consume cada orden de trabajo. Así el número siempre tiene una historia que lo explica.',
        }}
        searchPlaceholder="Buscar por nombre o identificador…"
        views={['table', 'cards']}
        activeView={vista}
        onViewChange={setVista}
        search={search}
        onSearchChange={setSearch}
        primaryAction={esGestor ? { label: 'Nuevo ítem', onClick: abrirNuevo } : undefined}
        selects={[
          {
            id: 'categoria',
            label: 'Categoría',
            value: filtroCategoria,
            onChange: setFiltroCategoria,
            options: [{ value: '', label: 'Todas las categorías' }, ...categoriaFiltroOptions],
          },
        ]}
        statusTabs={[
          { id: '', label: 'Todos', count: todos.length },
          { id: 'activo', label: naturalezaLabels.activo, count: conteosNaturaleza.activo || 0 },
          { id: 'consumible', label: naturalezaLabels.consumible, count: conteosNaturaleza.consumible || 0 },
          { id: 'en_uso', label: 'En uso', count: enUsoCount },
          { id: 'bajo_minimo', label: 'Bajo el mínimo', count: bajoMinimoCount },
        ]}
        activeStatus={tab}
        onStatusChange={setTab}
        kind="plain"
        columns={columnas}
        rows={visibles}
        rowKey={(it) => String(it.id)}
        rowActions={esGestor ? [
          { id: 'edit', label: 'Editar', icon: Pencil, onClick: (it: InventarioItem) => abrirEdit(it) },
          { id: 'del', label: 'Eliminar', icon: Trash2, danger: true, onClick: (it: InventarioItem) => setToDelete(it) },
        ] : []}
        onRowClick={(it) => abrirEdit(it)}
        loading={loading}
        emptyMessage={
          search.trim()
            ? `Nada coincide con "${search.trim()}".`
            : tab === 'bajo_minimo'
              ? 'No hay nada bajo el mínimo. El depósito está en orden.'
            : tab === 'en_uso'
              ? 'No hay ninguna máquina tomada por una orden en este momento.'
            : 'No hay ítems cargados. Creá el primero; las familias se configuran en Categorías de inventario.'
        }
        footer={{
          showing: `Mostrando ${visibles.length} de ${todos.length}`,
          note: 'El stock se mueve desde Movimientos y desde las órdenes de trabajo, no editando la ficha.',
        }}
      />


      <Sheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={selected ? `Editar: ${selected.nombre}` : 'Nuevo ítem de inventario'}
        stickyFooter={esGestor ? (
          <div className="flex items-center gap-2">
            {selected && (
              <button
                onClick={() => { setSheetOpen(false); setToDelete(selected); }}
                className="px-3 py-2.5 rounded-lg font-medium"
                style={{ color: estadoActivoColors.baja, border: `1px solid ${theme.border}` }}
              >
                Eliminar
              </button>
            )}
            <button
              onClick={guardar}
              disabled={guardando}
              className="flex-1 py-2.5 rounded-lg font-medium text-white disabled:opacity-60"
              style={{ backgroundColor: theme.primary }}
            >
              {guardando ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        ) : undefined}
      >
        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase mb-1" style={{ color: theme.textSecondary }}>Categoría</p>
            <ModernSelect
              value={form.categoria_id}
              onChange={(v) => setForm({ ...form, categoria_id: v })}
              options={categoriaOptions}
              placeholder="Elegí una categoría..."
              searchable
            />
            {categorias.length === 0 && (
              <p className="text-[11px] mt-1" style={{ color: theme.textSecondary }}>
                No hay categorías. Creá alguna en Configuración → Categorías de Inventario.
              </p>
            )}
            {naturalezaForm && (
              <p className="text-[11px] mt-1 inline-flex items-center gap-1" style={{ color: naturalezaColors[naturalezaForm] }}>
                {(() => { const NatIcon = naturalezaIcons[naturalezaForm]; return <NatIcon className="h-3 w-3" />; })()}
                {naturalezaForm === 'activo' ? 'Bien reutilizable (se toma/libera en OT)' : 'Material con stock (se descuenta al usarse)'}
              </p>
            )}
          </div>

          {/* Dónde está guardado. Hasta 2026-08-31 el inventario no sabía
              ubicación: no se podía contestar dónde estaba una cosa. */}
          <div>
            <p className="text-xs font-semibold uppercase mb-1" style={{ color: theme.textSecondary }}>Depósito</p>
            <ModernSelect
              value={form.deposito_id}
              onChange={(v) => setForm({ ...form, deposito_id: v })}
              options={depositoOptions}
              placeholder="Sin depósito asignado"
            />
          </div>

          <div>
            <p className="text-xs font-semibold uppercase mb-1" style={{ color: theme.textSecondary }}>Nombre</p>
            <input
              type="text"
              value={form.nombre}
              onChange={e => setForm({ ...form, nombre: e.target.value })}
              placeholder={naturalezaForm === 'activo' ? 'Ej: Camioneta Ford F-100' : 'Ej: Cemento Portland 50kg'}
              className="w-full px-3 py-2 rounded-lg"
              style={inputStyle}
            />
          </div>

          <div>
            <p className="text-xs font-semibold uppercase mb-1" style={{ color: theme.textSecondary }}>Descripción</p>
            <textarea
              value={form.descripcion}
              onChange={e => setForm({ ...form, descripcion: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 rounded-lg resize-none"
              style={inputStyle}
            />
          </div>

          {/* Campos según naturaleza */}
          {naturalezaForm === 'consumible' && (
            <div className="grid grid-cols-3 gap-3">
              <div>
                <p className="text-xs font-semibold uppercase mb-1" style={{ color: theme.textSecondary }}>Stock actual</p>
                <input type="number" min={0} step="any" value={form.stock_actual}
                  onChange={e => setForm({ ...form, stock_actual: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg" style={inputStyle} />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase mb-1" style={{ color: theme.textSecondary }}>Mínimo</p>
                <input type="number" min={0} step="any" value={form.stock_minimo}
                  onChange={e => setForm({ ...form, stock_minimo: e.target.value })}
                  placeholder="alerta"
                  className="w-full px-3 py-2 rounded-lg" style={inputStyle} />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase mb-1" style={{ color: theme.textSecondary }}>Unidad</p>
                <input type="text" value={form.unidad}
                  onChange={e => setForm({ ...form, unidad: e.target.value })}
                  placeholder="bolsas, m3, u"
                  className="w-full px-3 py-2 rounded-lg" style={inputStyle} />
              </div>
            </div>
          )}

          {naturalezaForm === 'activo' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs font-semibold uppercase mb-1" style={{ color: theme.textSecondary }}>Identificador</p>
                <input type="text" value={form.identificador}
                  onChange={e => setForm({ ...form, identificador: e.target.value })}
                  placeholder="dominio / nº de serie"
                  className="w-full px-3 py-2 rounded-lg" style={inputStyle} />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase mb-1" style={{ color: theme.textSecondary }}>Estado</p>
                <ModernSelect
                  value={form.estado_activo}
                  onChange={(v) => setForm({ ...form, estado_activo: v as EstadoActivo })}
                  options={ESTADO_ACTIVO_OPTIONS}
                  disabled={selected?.estado_activo === 'en_uso'}
                />
                {selected?.estado_activo === 'en_uso' && (
                  <p className="text-[11px] mt-1" style={{ color: theme.textSecondary }}>
                    Tomado por {selected.ocupado_por_ot_numero || 'una OT'}. Se libera al cerrar la orden.
                  </p>
                )}
              </div>

              {/* --- RESERVABLE (módulo Reservas) ---
                  La mayoría de los activos NO se prestan: una motosierra
                  municipal no sale del corralón. Por eso va apagado. */}
              <div className="col-span-2">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.reservable}
                    onChange={e => setForm({ ...form, reservable: e.target.checked })}
                    className="w-4 h-4"
                  />
                  <span className="text-sm" style={{ color: theme.text }}>
                    Se puede prestar al vecino
                    <span className="block text-[11px]" style={{ color: theme.textSecondary }}>
                      Aparece en Recursos → Reservas y el vecino puede pedirlo.
                    </span>
                  </span>
                </label>
              </div>

              {/* --- VEHÍCULO (módulo Flota) ---
                  Plegado a propósito: la mayoría de los activos son
                  herramientas y no tienen patente. Con el tilde aparecen los
                  campos que convierten a este activo en un vehículo de la
                  flota, y ahí empieza a contar su consumo. */}
              <div className="col-span-2">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.esVehiculo}
                    onChange={e => setForm({ ...form, esVehiculo: e.target.checked })}
                    className="w-4 h-4"
                  />
                  <span className="text-sm" style={{ color: theme.text }}>
                    Es un vehículo de la flota
                    <span className="block text-[11px]" style={{ color: theme.textSecondary }}>
                      Aparece en Recursos → Flota y se le puede cargar combustible.
                    </span>
                  </span>
                </label>
              </div>

              {form.esVehiculo && (
                <>
                  <div>
                    <p className="text-xs font-semibold uppercase mb-1" style={{ color: theme.textSecondary }}>Marca y modelo</p>
                    <input type="text" value={form.marca_modelo}
                      onChange={e => setForm({ ...form, marca_modelo: e.target.value })}
                      placeholder="Toyota Hilux 4x4"
                      className="w-full px-3 py-2 rounded-lg" style={inputStyle} />
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase mb-1" style={{ color: theme.textSecondary }}>Año</p>
                    <input type="number" value={form.anio}
                      onChange={e => setForm({ ...form, anio: e.target.value })}
                      placeholder="2021"
                      className="w-full px-3 py-2 rounded-lg" style={inputStyle} />
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase mb-1" style={{ color: theme.textSecondary }}>Combustible</p>
                    <ModernSelect
                      value={form.tipo_combustible}
                      onChange={(v) => setForm({ ...form, tipo_combustible: v })}
                      options={COMBUSTIBLES}
                      placeholder="Elegí el combustible"
                    />
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase mb-1" style={{ color: theme.textSecondary }}>Kilómetros</p>
                    <input type="number" value={form.km_actual}
                      onChange={e => setForm({ ...form, km_actual: e.target.value })}
                      placeholder="82000"
                      className="w-full px-3 py-2 rounded-lg" style={inputStyle} />
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase mb-1" style={{ color: theme.textSecondary }}>Vence la VTV</p>
                    <DatePicker
                      value={form.vencimiento_vtv}
                      onChange={(v: string | null) => setForm({ ...form, vencimiento_vtv: v || '' })}
                    />
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase mb-1" style={{ color: theme.textSecondary }}>Vence el seguro</p>
                    <DatePicker
                      value={form.vencimiento_seguro}
                      onChange={(v: string | null) => setForm({ ...form, vencimiento_seguro: v || '' })}
                    />
                  </div>
                  <div className="col-span-2">
                    <p className="text-xs font-semibold uppercase mb-1" style={{ color: theme.textSecondary }}>Próximo service (km)</p>
                    <input type="number" value={form.km_proximo_service}
                      onChange={e => setForm({ ...form, km_proximo_service: e.target.value })}
                      placeholder="88000"
                      className="w-full px-3 py-2 rounded-lg" style={inputStyle} />
                    <p className="text-[11px] mt-1" style={{ color: theme.textSecondary }}>
                      Cuando el vehículo pase este kilometraje, Flota lo marca con service vencido.
                    </p>
                  </div>
                </>
              )}
            </div>
          )}

          {!naturalezaForm && (
            <div className="rounded-xl p-4 flex items-center gap-2 text-sm" style={{ backgroundColor: theme.backgroundSecondary, color: theme.textSecondary }}>
              <Package className="h-4 w-4" />
              Elegí una categoría para ver los campos correspondientes.
            </div>
          )}

          {/* La historia del artículo. Vive acá y no en una pantalla aparte
              porque la pregunta ("¿por qué quedan seis bolsas?") se hace
              mirando la ficha, no buscando en el libro entero. */}
          {selected && (
            <div>
              <p className="text-xs font-semibold uppercase mb-2" style={{ color: theme.textSecondary }}>
                Movimientos
              </p>
              {cargandoHist ? (
                <p className="text-sm" style={{ color: theme.textSecondary }}>Buscando la historia…</p>
              ) : historial.length === 0 ? (
                <p className="text-sm" style={{ color: theme.textSecondary }}>
                  Todavía no se movió. Lo que entre, salga o se ajuste va a quedar acá.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {historial.map(mv => {
                    const color = movimientoColors[mv.tipo] ?? theme.textSecondary;
                    return (
                      <div key={mv.id} className="flex items-start gap-3 rounded-lg px-3 py-2"
                        style={{ backgroundColor: theme.backgroundSecondary }}>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-medium" style={{ color: theme.text }}>
                            {movimientoLabels[mv.tipo] ?? mv.tipo}
                            {mv.contraparte ? ` · ${mv.contraparte}` : ''}
                          </p>
                          <p className="text-[11px] truncate" style={{ color: theme.textSecondary }}>
                            {[mv.fecha ? formatFechaAR(mv.fecha) : null, mv.motivo, mv.usuario_nombre]
                              .filter(Boolean).join(' · ')}
                          </p>
                        </div>
                        <div className="text-right flex-none">
                          <p className="text-[13px] font-semibold" style={{ color }}>
                            {signoMovimiento(mv.tipo)}{mv.cantidad}
                          </p>
                          {mv.stock_resultante != null && (
                            <p className="text-[11px]" style={{ color: theme.textSecondary }}>
                              quedó {mv.stock_resultante}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </Sheet>

      <ConfirmModal
        isOpen={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={eliminar}
        title="Eliminar ítem"
        message={`¿Eliminar "${toDelete?.nombre}" del inventario?`}
        confirmText="Eliminar"
        cancelText="Cancelar"
        variant="danger"
      />
    </>
  );
}
