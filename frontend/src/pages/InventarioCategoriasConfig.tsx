import { useEffect, useState, useCallback } from 'react';
import { Pencil, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from '../contexts/ThemeContext';
import { Sheet } from '../components/ui/Sheet';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { DynamicIcon } from '../components/ui/DynamicIcon';
import { StickyPageHeader } from '../components/ui/StickyPageHeader';
import PageHint from '../components/ui/PageHint';
import { inventarioApi } from '../lib/api';
import { naturalezaLabels, naturalezaDescripcion, naturalezaColors, naturalezaIcons, estadoActivoColors } from '../lib/enums/inventario';
import type { InventarioCategoria, NaturalezaInventario } from '../types';

const ICONOS_DISPONIBLES = [
  'Truck', 'Car', 'Forklift', 'Tractor', 'HardHat', 'Wrench',
  'Hammer', 'Drill', 'Pickaxe', 'Shovel', 'PaintRoller', 'Paintbrush',
  'Package', 'Boxes', 'Container', 'Warehouse', 'Cog', 'Fuel',
  'Lightbulb', 'Cable', 'Droplets', 'TreeDeciduous', 'Construction', 'Tag',
];

const COLORES_DISPONIBLES = [
  '#f59e0b', '#78716c', '#10b981', '#06b6d4', '#22c55e',
  '#ef4444', '#3b82f6', '#84cc16', '#a855f7', '#ec4899',
  '#8b5cf6', '#0ea5e9', '#6366f1', '#64748b',
];

type FormState = {
  nombre: string;
  descripcion: string;
  icono: string;
  color: string;
  naturaleza: NaturalezaInventario;
  orden: number;
};

const FORM_VACIO: FormState = {
  nombre: '', descripcion: '', icono: 'Package', color: '#3b82f6',
  naturaleza: 'consumible', orden: 0,
};

export default function InventarioCategoriasConfig() {
  const { theme } = useTheme();
  const [items, setItems] = useState<InventarioCategoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<InventarioCategoria | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>(FORM_VACIO);

  const [toDelete, setToDelete] = useState<InventarioCategoria | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const res = await inventarioApi.listCategorias();
      setItems(res.data || []);
    } catch {
      toast.error('Error cargando categorías de inventario');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const abrirNuevo = () => {
    setEditing(null);
    setForm({ ...FORM_VACIO, orden: items.length + 1 });
    setSheetOpen(true);
  };

  const abrirEdit = (item: InventarioCategoria) => {
    setEditing(item);
    setForm({
      nombre: item.nombre,
      descripcion: item.descripcion || '',
      icono: item.icono || 'Package',
      color: item.color || '#3b82f6',
      naturaleza: item.naturaleza,
      orden: item.orden,
    });
    setSheetOpen(true);
  };

  const guardar = async () => {
    if (!form.nombre.trim()) { toast.error('El nombre es obligatorio'); return; }
    setSaving(true);
    try {
      const payload = {
        nombre: form.nombre.trim(),
        descripcion: form.descripcion.trim() || undefined,
        icono: form.icono,
        color: form.color,
        naturaleza: form.naturaleza,
        orden: form.orden,
      };
      if (editing) {
        await inventarioApi.updateCategoria(editing.id, payload);
        toast.success('Categoría actualizada');
      } else {
        await inventarioApi.createCategoria(payload);
        toast.success('Categoría creada');
      }
      setSheetOpen(false);
      await cargar();
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail || 'Error guardando');
    } finally {
      setSaving(false);
    }
  };

  const eliminar = async () => {
    if (!toDelete) return;
    try {
      await inventarioApi.deleteCategoria(toDelete.id);
      toast.success('Categoría eliminada');
      setToDelete(null);
      await cargar();
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail || 'Error eliminando');
      setToDelete(null);
    }
  };

  const filtrados = items.filter(it => it.nombre.toLowerCase().includes(search.toLowerCase()));
  const bloqueaNaturaleza = !!editing && editing.items_count > 0;

  return (
    <div className="h-full flex flex-col">
      <div className="px-3 sm:px-6 pt-3">
        <PageHint pageId="inventario-categorias-config" />
      </div>

      <StickyPageHeader
        backLink="/gestion/configuracion"
        title="Categorías de Inventario"
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Buscar categoría..."
        buttonLabel="Nueva categoría"
        onButtonClick={abrirNuevo}
      />

      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin" style={{ color: theme.primary }} />
          </div>
        ) : filtrados.length === 0 ? (
          <div className="text-center py-20" style={{ color: theme.textSecondary }}>
            No hay categorías. Hacé click en "Nueva categoría" para crear una.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtrados.map(item => {
              const natColor = naturalezaColors[item.naturaleza] || theme.textSecondary;
              const NatIcon = naturalezaIcons[item.naturaleza];
              return (
                <div
                  key={item.id}
                  className="p-4 rounded-xl flex items-start gap-3 transition-all duration-200 hover:scale-[1.02]"
                  style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
                >
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: `${item.color || '#3b82f6'}20` }}
                  >
                    <DynamicIcon name={item.icono || 'Package'} className="h-6 w-6" style={{ color: item.color || '#3b82f6' }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold truncate" style={{ color: theme.text }}>{item.nombre}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium"
                        style={{ backgroundColor: `${natColor}20`, color: natColor }}
                      >
                        {NatIcon && <NatIcon className="h-3 w-3" />}
                        {naturalezaLabels[item.naturaleza]}
                      </span>
                      <span className="text-[11px]" style={{ color: theme.textSecondary }}>
                        {item.items_count} ítem{item.items_count === 1 ? '' : 's'}
                      </span>
                    </div>
                    {item.descripcion && (
                      <p className="text-xs mt-1.5 line-clamp-2" style={{ color: theme.textSecondary }}>{item.descripcion}</p>
                    )}
                  </div>
                  <div className="flex flex-col gap-1 flex-shrink-0">
                    <button onClick={() => abrirEdit(item)} className="p-1.5 rounded-lg transition-colors hover:bg-black/5" style={{ color: theme.textSecondary }}>
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button onClick={() => setToDelete(item)} className="p-1.5 rounded-lg transition-colors hover:bg-red-500/10" style={{ color: estadoActivoColors.baja }}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Sheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={editing ? 'Editar categoría' : 'Nueva categoría'}
        description={editing ? 'Modificá los datos y guardá' : 'Elegí la naturaleza y completá los datos'}
        stickyFooter={
          <div className="flex justify-end gap-2">
            <button onClick={() => setSheetOpen(false)} className="px-4 py-2 rounded-xl text-sm font-medium" style={{ backgroundColor: theme.backgroundSecondary, color: theme.text }}>
              Cancelar
            </button>
            <button onClick={guardar} disabled={saving} className="px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2 disabled:opacity-50 text-white" style={{ backgroundColor: theme.primary }}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Guardar
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          {/* Naturaleza: la decisión central */}
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: theme.text }}>
              Naturaleza <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(naturalezaLabels) as NaturalezaInventario[]).map(n => {
                const NatIcon = naturalezaIcons[n];
                const activa = form.naturaleza === n;
                const c = naturalezaColors[n];
                return (
                  <button
                    key={n}
                    type="button"
                    disabled={bloqueaNaturaleza}
                    onClick={() => setForm({ ...form, naturaleza: n })}
                    className="p-3 rounded-xl text-left transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{
                      backgroundColor: activa ? `${c}15` : theme.backgroundSecondary,
                      border: `2px solid ${activa ? c : 'transparent'}`,
                    }}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <NatIcon className="h-4 w-4" style={{ color: c }} />
                      <span className="text-sm font-semibold" style={{ color: theme.text }}>{naturalezaLabels[n]}</span>
                    </div>
                    <p className="text-[11px] leading-snug" style={{ color: theme.textSecondary }}>{naturalezaDescripcion[n]}</p>
                  </button>
                );
              })}
            </div>
            {bloqueaNaturaleza && (
              <p className="text-[11px] mt-1.5" style={{ color: theme.textSecondary }}>
                No se puede cambiar la naturaleza: esta categoría ya tiene ítems cargados.
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: theme.text }}>Nombre <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={form.nombre}
              onChange={e => setForm({ ...form, nombre: e.target.value })}
              placeholder="Ej: Vehículos, Herramientas, Materiales..."
              className="w-full px-3 py-2 rounded-xl text-sm"
              style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}`, color: theme.text }}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: theme.text }}>Descripción</label>
            <textarea
              value={form.descripcion}
              onChange={e => setForm({ ...form, descripcion: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 rounded-xl text-sm resize-none"
              style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}`, color: theme.text }}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: theme.text }}>Icono</label>
            <div className="grid grid-cols-8 gap-2">
              {ICONOS_DISPONIBLES.map(ic => (
                <button
                  key={ic}
                  type="button"
                  onClick={() => setForm({ ...form, icono: ic })}
                  className="aspect-square rounded-lg flex items-center justify-center transition-all duration-200 hover:scale-110"
                  style={{
                    backgroundColor: form.icono === ic ? `${form.color}30` : theme.backgroundSecondary,
                    border: `2px solid ${form.icono === ic ? form.color : 'transparent'}`,
                  }}
                >
                  <DynamicIcon name={ic} className="h-5 w-5" style={{ color: form.color }} />
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: theme.text }}>Color</label>
            <div className="grid grid-cols-7 gap-2">
              {COLORES_DISPONIBLES.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setForm({ ...form, color: c })}
                  className="aspect-square rounded-lg transition-all duration-200 hover:scale-110"
                  style={{ backgroundColor: c, border: `3px solid ${form.color === c ? theme.text : 'transparent'}` }}
                />
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: theme.text }}>Orden</label>
            <input
              type="number"
              value={form.orden}
              onChange={e => setForm({ ...form, orden: parseInt(e.target.value) || 0 })}
              className="w-full px-3 py-2 rounded-xl text-sm"
              style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}`, color: theme.text }}
            />
          </div>
        </div>
      </Sheet>

      <ConfirmModal
        isOpen={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={eliminar}
        title="Eliminar categoría"
        message={`¿Eliminar la categoría "${toDelete?.nombre}"? Si tiene ítems cargados, primero movelos o eliminalos.`}
        confirmText="Eliminar"
        cancelText="Cancelar"
        variant="danger"
      />
    </div>
  );
}
