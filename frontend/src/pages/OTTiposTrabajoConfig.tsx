import { useEffect, useState, useCallback } from 'react';
import { Pencil, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from '../contexts/ThemeContext';
import { Sheet } from '../components/ui/Sheet';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { DynamicIcon } from '../components/ui/DynamicIcon';
import { StickyPageHeader } from '../components/ui/StickyPageHeader';
import PageHint from '../components/ui/PageHint';
import { otTiposTrabajoApi } from '../lib/api';
import { estadoActivoColors } from '../lib/enums/inventario';
import type { OTTipoTrabajo } from '../types';

const ICONOS_DISPONIBLES = [
  'TreeDeciduous', 'Construction', 'Lightbulb', 'Sparkles', 'Truck',
  'Wrench', 'HardHat', 'TrafficCone', 'CalendarClock', 'Droplets',
  'Trash2', 'Hammer', 'PaintRoller', 'Trees', 'Bug', 'Cog', 'Tag',
];

const COLORES_DISPONIBLES = [
  '#22c55e', '#f59e0b', '#eab308', '#06b6d4', '#3b82f6',
  '#8b5cf6', '#ef4444', '#f97316', '#64748b', '#ec4899',
  '#10b981', '#0ea5e9', '#6366f1', '#78716c',
];

type FormState = { nombre: string; icono: string; color: string; orden: number };
const FORM_VACIO: FormState = { nombre: '', icono: 'Tag', color: '#3b82f6', orden: 0 };

export default function OTTiposTrabajoConfig() {
  const { theme } = useTheme();
  const [items, setItems] = useState<OTTipoTrabajo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<OTTipoTrabajo | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>(FORM_VACIO);
  const [toDelete, setToDelete] = useState<OTTipoTrabajo | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const res = await otTiposTrabajoApi.list();
      setItems(res.data || []);
    } catch {
      toast.error('Error cargando los tipos de trabajo');
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

  const abrirEdit = (item: OTTipoTrabajo) => {
    setEditing(item);
    setForm({ nombre: item.nombre, icono: item.icono || 'Tag', color: item.color || '#3b82f6', orden: item.orden });
    setSheetOpen(true);
  };

  const guardar = async () => {
    if (!form.nombre.trim()) { toast.error('El nombre es obligatorio'); return; }
    setSaving(true);
    try {
      const payload = { nombre: form.nombre.trim(), icono: form.icono, color: form.color, orden: form.orden };
      if (editing) {
        await otTiposTrabajoApi.update(editing.id, payload);
        toast.success('Tipo actualizado');
      } else {
        await otTiposTrabajoApi.create(payload);
        toast.success('Tipo creado');
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
      await otTiposTrabajoApi.delete(toDelete.id);
      toast.success('Tipo eliminado');
      setToDelete(null);
      await cargar();
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail || 'Error eliminando');
      setToDelete(null);
    }
  };

  const filtrados = items.filter(it => it.nombre.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="h-full flex flex-col">
      <div className="px-3 sm:px-6 pt-3">
        <PageHint pageId="ot-tipos-trabajo-config" />
      </div>

      <StickyPageHeader
        backLink="/gestion/configuracion"
        title="Tipos de Trabajo"
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Buscar tipo..."
        buttonLabel="Nuevo tipo"
        onButtonClick={abrirNuevo}
      />

      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin" style={{ color: theme.primary }} />
          </div>
        ) : filtrados.length === 0 ? (
          <div className="text-center py-20" style={{ color: theme.textSecondary }}>
            No hay tipos de trabajo. Hacé click en "Nuevo tipo" para crear uno.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtrados.map(item => (
              <div
                key={item.id}
                className="p-4 rounded-xl flex items-center gap-3 transition-all duration-200 hover:scale-[1.02]"
                style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
              >
                <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${item.color || '#3b82f6'}20` }}>
                  <DynamicIcon name={item.icono || 'Tag'} className="h-5 w-5" style={{ color: item.color || '#3b82f6' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold truncate" style={{ color: theme.text }}>{item.nombre}</h3>
                  {!item.activo && (
                    <span className="inline-block mt-1 px-2 py-0.5 rounded text-[11px]" style={{ backgroundColor: `${estadoActivoColors.baja}20`, color: estadoActivoColors.baja }}>Inactivo</span>
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
            ))}
          </div>
        )}
      </div>

      <Sheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={editing ? 'Editar tipo de trabajo' : 'Nuevo tipo de trabajo'}
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
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: theme.text }}>Nombre <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={form.nombre}
              onChange={e => setForm({ ...form, nombre: e.target.value })}
              placeholder="Ej: Poda, Bacheo, Alumbrado..."
              className="w-full px-3 py-2 rounded-xl text-sm"
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
                  style={{ backgroundColor: form.icono === ic ? `${form.color}30` : theme.backgroundSecondary, border: `2px solid ${form.icono === ic ? form.color : 'transparent'}` }}
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
        title="Eliminar tipo de trabajo"
        message={`¿Eliminar el tipo "${toDelete?.nombre}"? Si hay OTs que lo usan, se marca inactivo en vez de borrarse.`}
        confirmText="Eliminar"
        cancelText="Cancelar"
        variant="danger"
      />
    </div>
  );
}
