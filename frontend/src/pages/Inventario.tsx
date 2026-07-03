import { useEffect, useMemo, useState, useCallback } from 'react';
import { Boxes, Plus, AlertTriangle, Package } from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { ABMPage, ABMTable } from '../components/ui/ABMPage';
import { Sheet } from '../components/ui/Sheet';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { ModernSelect, type SelectOption } from '../components/ui/ModernSelect';
import { DynamicIcon } from '../components/ui/DynamicIcon';
import PageHint from '../components/ui/PageHint';
import { inventarioApi } from '../lib/api';
import {
  naturalezaLabels, naturalezaColors, naturalezaIcons,
  estadoActivoLabel, estadoActivoColor, estadoActivoColors,
  ESTADO_ACTIVO_OPTIONS,
} from '../lib/enums/inventario';
import type { InventarioItem, InventarioCategoria, NaturalezaInventario, EstadoActivo } from '../types';

type FormState = {
  categoria_id: string;
  nombre: string;
  descripcion: string;
  stock_actual: string;
  stock_minimo: string;
  unidad: string;
  identificador: string;
  estado_activo: EstadoActivo;
};

const FORM_VACIO: FormState = {
  categoria_id: '', nombre: '', descripcion: '',
  stock_actual: '', stock_minimo: '', unidad: '',
  identificador: '', estado_activo: 'disponible',
};

export default function Inventario() {
  const { theme } = useTheme();
  const { user } = useAuth();

  const [items, setItems] = useState<InventarioItem[]>([]);
  const [todos, setTodos] = useState<InventarioItem[]>([]); // sin filtro, para contar píldoras
  const [categorias, setCategorias] = useState<InventarioCategoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filtroNaturaleza, setFiltroNaturaleza] = useState<string>('');
  const [filtroCategoria, setFiltroCategoria] = useState<string>('');

  const [sheetOpen, setSheetOpen] = useState(false);
  const [selected, setSelected] = useState<InventarioItem | null>(null);
  const [form, setForm] = useState<FormState>(FORM_VACIO);
  const [guardando, setGuardando] = useState(false);
  const [toDelete, setToDelete] = useState<InventarioItem | null>(null);

  const esGestor = user?.rol === 'admin' || user?.rol === 'supervisor';

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = {};
      if (filtroNaturaleza) params.naturaleza = filtroNaturaleza;
      if (filtroCategoria) params.categoria_id = Number(filtroCategoria);
      if (search.trim()) params.search = search.trim();
      const res = await inventarioApi.listItems(params);
      setItems(res.data || []);
    } catch {
      toast.error('Error cargando el inventario');
    } finally {
      setLoading(false);
    }
  }, [filtroNaturaleza, filtroCategoria, search]);

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

  const conteosNaturaleza = useMemo(() => {
    const c: Record<string, number> = {};
    for (const it of todos) c[it.naturaleza] = (c[it.naturaleza] || 0) + 1;
    return c;
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
      nombre: item.nombre,
      descripcion: item.descripcion || '',
      stock_actual: item.stock_actual != null ? String(item.stock_actual) : '',
      stock_minimo: item.stock_minimo != null ? String(item.stock_minimo) : '',
      unidad: item.unidad || '',
      identificador: item.identificador || '',
      estado_activo: item.estado_activo || 'disponible',
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
      };
      if (naturalezaForm === 'consumible') {
        payload.stock_actual = form.stock_actual ? Number(form.stock_actual) : 0;
        payload.stock_minimo = form.stock_minimo ? Number(form.stock_minimo) : null;
        payload.unidad = form.unidad.trim() || null;
      } else if (naturalezaForm === 'activo') {
        payload.identificador = form.identificador.trim() || null;
        payload.estado_activo = form.estado_activo;
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

  const categoriaFiltroOptions: SelectOption[] = useMemo(() =>
    categorias.map(c => ({ value: String(c.id), label: c.nombre })),
  [categorias]);

  const inputStyle = { backgroundColor: theme.card, color: theme.text, border: `1px solid ${theme.border}` };

  // Descriptor de "qué tiene / en qué estado" según naturaleza (tabla + card).
  const renderEstadoCelda = (item: InventarioItem) => {
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
  };

  const columns = [
    {
      key: 'nombre', header: 'Ítem', width: '280px',
      sortValue: (it: InventarioItem) => it.nombre,
      render: (it: InventarioItem) => (
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${it.categoria_color || '#3b82f6'}20` }}>
            <DynamicIcon name={it.categoria_icono || 'Package'} className="h-4 w-4" style={{ color: it.categoria_color || '#3b82f6' }} />
          </div>
          <div className="min-w-0">
            <span className="text-sm font-medium truncate block" style={{ color: theme.text }}>{it.nombre}</span>
            {it.identificador && <span className="text-[11px] font-mono" style={{ color: theme.textSecondary }}>{it.identificador}</span>}
          </div>
        </div>
      ),
    },
    {
      key: 'categoria', header: 'Categoría',
      sortValue: (it: InventarioItem) => it.categoria_nombre || '',
      render: (it: InventarioItem) => (
        <span className="text-xs" style={{ color: theme.textSecondary }}>{it.categoria_nombre || '—'}</span>
      ),
    },
    {
      key: 'naturaleza', header: 'Tipo',
      sortValue: (it: InventarioItem) => it.naturaleza,
      render: (it: InventarioItem) => {
        const c = naturalezaColors[it.naturaleza] || theme.textSecondary;
        const NatIcon = naturalezaIcons[it.naturaleza];
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: `${c}15`, color: c }}>
            {NatIcon && <NatIcon className="h-3 w-3" />}{naturalezaLabels[it.naturaleza]}
          </span>
        );
      },
    },
    {
      key: 'estado', header: 'Stock / Estado',
      sortValue: (it: InventarioItem) => it.naturaleza === 'consumible' ? String(it.stock_actual ?? 0) : (it.estado_activo || ''),
      render: renderEstadoCelda,
    },
  ];

  return (
    <>
      <div className="px-3 sm:px-6 pt-3">
        <PageHint pageId="inventario" />
      </div>

      <ABMPage
        title="Inventario"
        icon={<Boxes className="h-5 w-5" />}
        searchPlaceholder="Buscar por nombre o identificador..."
        searchValue={search}
        onSearchChange={setSearch}
        loading={loading}
        isEmpty={items.length === 0}
        emptyMessage="No hay ítems cargados. Creá el primero. Las categorías se configuran en Configuración → Categorías de Inventario."
        buttonLabel="Nuevo ítem"
        buttonIcon={<Plus className="h-4 w-4 mr-1.5" />}
        onAdd={esGestor ? abrirNuevo : undefined}
        defaultViewMode="table"
        viewStorageKey="inventario_view"
        toolbar={{
          statusPills: {
            value: filtroNaturaleza,
            onChange: (v: string) => setFiltroNaturaleza(v),
            items: (Object.keys(naturalezaLabels) as NaturalezaInventario[]).map(n => ({
              key: n,
              label: naturalezaLabels[n],
              icon: naturalezaIcons[n],
              color: naturalezaColors[n],
              count: conteosNaturaleza[n] || 0,
            })),
          },
          combos: [{
            key: 'categoria',
            placeholder: 'Todas las categorías',
            value: filtroCategoria,
            onChange: setFiltroCategoria,
            options: categoriaFiltroOptions,
            searchable: true,
          }],
          layout: 'left',
        }}
        tableView={
          <ABMTable
            data={items}
            columns={columns}
            keyExtractor={(it: InventarioItem) => it.id}
            onRowClick={(it: InventarioItem) => abrirEdit(it)}
            defaultSortKey="nombre"
            defaultSortDirection="asc"
          />
        }
      >
        {items.map(it => {
          const c = naturalezaColors[it.naturaleza] || theme.textSecondary;
          return (
            <div
              key={it.id}
              onClick={() => abrirEdit(it)}
              className="rounded-2xl p-4 cursor-pointer transition-all hover:scale-[1.01]"
              style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}`, borderLeft: `4px solid ${c}` }}
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${it.categoria_color || '#3b82f6'}20` }}>
                  <DynamicIcon name={it.categoria_icono || 'Package'} className="h-5 w-5" style={{ color: it.categoria_color || '#3b82f6' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold truncate" style={{ color: theme.text }}>{it.nombre}</h3>
                  <p className="text-[11px] mb-1.5" style={{ color: theme.textSecondary }}>{it.categoria_nombre}</p>
                  {renderEstadoCelda(it)}
                </div>
              </div>
            </div>
          );
        })}
      </ABMPage>

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
            </div>
          )}

          {!naturalezaForm && (
            <div className="rounded-xl p-4 flex items-center gap-2 text-sm" style={{ backgroundColor: theme.backgroundSecondary, color: theme.textSecondary }}>
              <Package className="h-4 w-4" />
              Elegí una categoría para ver los campos correspondientes.
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
