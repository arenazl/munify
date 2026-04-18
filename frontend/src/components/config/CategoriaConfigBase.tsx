import { useEffect, useRef, useState } from 'react';
import { Pencil, Trash2, Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from '../../contexts/ThemeContext';
import { Sheet } from '../ui/Sheet';
import { DynamicIcon } from '../ui/DynamicIcon';
import { StickyPageHeader } from '../ui/StickyPageHeader';
import { categoriasReclamoSugeridasApi } from '../../lib/api';

export interface CategoriaItem {
  id: number;
  municipio_id: number;
  nombre: string;
  descripcion?: string;
  icono?: string;
  color?: string;
  orden: number;
  activo: boolean;
}

interface CategoriaApi {
  getAll: (activo?: boolean) => Promise<{ data: CategoriaItem[] }>;
  create: (data: Record<string, unknown>) => Promise<{ data: CategoriaItem }>;
  update: (id: number, data: Record<string, unknown>) => Promise<{ data: CategoriaItem }>;
  delete: (id: number) => Promise<unknown>;
}

interface Props {
  title: string;
  api: CategoriaApi;
  /** Campos extra que sólo aplican a Categoría de Reclamo (tiempo, prioridad). */
  showReclamoFields?: boolean;
  /**
   * Si `true`, muestra el autocomplete contra el catálogo cross-municipio
   * cuando el admin escribe el nombre al crear una categoría nueva. Solo
   * aplica a categorías de reclamo (no hay catálogo global de trámite).
   */
  enableSugerencias?: boolean;
}

interface CategoriaSugerida {
  id: number;
  nombre: string;
  descripcion?: string;
  icono?: string;
  color?: string;
  tiempo_resolucion_estimado?: number;
  prioridad_default?: number;
  rubro?: string;
}

const ICONOS_DISPONIBLES = [
  'Lightbulb', 'Construction', 'Trash2', 'Sparkles', 'TreeDeciduous',
  'TrafficCone', 'Droplets', 'Bug', 'Dog', 'Volume2',
  'Car', 'Store', 'HardHat', 'Map', 'CreditCard',
  'HeartPulse', 'Trees', 'FileText', 'Users', 'Cross',
  'Building2', 'Folder', 'Tag', 'Star',
];

const COLORES_DISPONIBLES = [
  '#f59e0b', '#78716c', '#10b981', '#06b6d4', '#22c55e',
  '#ef4444', '#3b82f6', '#84cc16', '#a855f7', '#ec4899',
  '#8b5cf6', '#0ea5e9', '#6366f1', '#64748b',
];

export function CategoriaConfigBase({ title, api, showReclamoFields = false, enableSugerencias = false }: Props) {
  const { theme } = useTheme();
  const [items, setItems] = useState<CategoriaItem[]>([]);

  // Autocomplete de sugerencias cross-municipio (solo en modo alta).
  const [sugerencias, setSugerencias] = useState<CategoriaSugerida[]>([]);
  const [loadingSugerencias, setLoadingSugerencias] = useState(false);
  const [mostrarSugerencias, setMostrarSugerencias] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Sheet state
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<CategoriaItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    nombre: '',
    descripcion: '',
    icono: 'Folder',
    color: '#6366f1',
    orden: 0,
    tiempo_resolucion_estimado: 48,
    prioridad_default: 3,
  });

  const cargar = async () => {
    setLoading(true);
    try {
      const res = await api.getAll();
      setItems(res.data);
    } catch (err) {
      toast.error('Error cargando categorías');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const abrirNuevo = () => {
    setEditing(null);
    setForm({
      nombre: '',
      descripcion: '',
      icono: 'Folder',
      color: '#6366f1',
      orden: items.length + 1,
      tiempo_resolucion_estimado: 48,
      prioridad_default: 3,
    });
    setSugerencias([]);
    setMostrarSugerencias(false);
    setSheetOpen(true);
  };

  /**
   * Handler del input "Nombre" en modo alta. Setea el valor y, si el
   * autocomplete está habilitado, busca sugerencias en el catálogo global
   * con debounce de 300ms. No se llama al backend en modo edición.
   */
  const handleNombreChange = (nombre: string) => {
    setForm({ ...form, nombre });

    if (!enableSugerencias || editing) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (nombre.trim().length < 2) {
      setSugerencias([]);
      setMostrarSugerencias(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoadingSugerencias(true);
      try {
        const res = await categoriasReclamoSugeridasApi.search(nombre, 8);
        setSugerencias(res.data || []);
        setMostrarSugerencias(true);
      } catch (err) {
        console.error('Error buscando sugerencias', err);
      } finally {
        setLoadingSugerencias(false);
      }
    }, 300);
  };

  /**
   * Al elegir una sugerencia del catálogo cross-municipio, precargamos
   * todos los campos del form (nombre, descripción, ícono, color, tiempo,
   * prioridad). El admin puede editarlos antes de guardar.
   */
  const aplicarSugerencia = (s: CategoriaSugerida) => {
    setForm({
      nombre: s.nombre,
      descripcion: s.descripcion || '',
      icono: s.icono || 'Folder',
      color: s.color || '#6366f1',
      orden: items.length + 1,
      tiempo_resolucion_estimado: s.tiempo_resolucion_estimado ?? 48,
      prioridad_default: s.prioridad_default ?? 3,
    });
    setMostrarSugerencias(false);
  };

  const abrirEdit = (item: CategoriaItem) => {
    setEditing(item);
    setForm({
      nombre: item.nombre,
      descripcion: item.descripcion || '',
      icono: item.icono || 'Folder',
      color: item.color || '#6366f1',
      orden: item.orden,
      tiempo_resolucion_estimado: (item as any).tiempo_resolucion_estimado ?? 48,
      prioridad_default: (item as any).prioridad_default ?? 3,
    });
    setSheetOpen(true);
  };

  const guardar = async () => {
    if (!form.nombre.trim()) {
      toast.error('El nombre es obligatorio');
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        nombre: form.nombre.trim(),
        descripcion: form.descripcion.trim() || undefined,
        icono: form.icono,
        color: form.color,
        orden: form.orden,
      };
      if (showReclamoFields) {
        payload.tiempo_resolucion_estimado = form.tiempo_resolucion_estimado;
        payload.prioridad_default = form.prioridad_default;
      }

      if (editing) {
        await api.update(editing.id, payload);
        toast.success('Categoría actualizada');
      } else {
        await api.create(payload);
        toast.success('Categoría creada');
      }
      setSheetOpen(false);
      await cargar();
    } catch (err: any) {
      const detail = err?.response?.data?.detail || 'Error guardando';
      toast.error(detail);
    } finally {
      setSaving(false);
    }
  };

  const eliminar = async (item: CategoriaItem) => {
    if (!confirm(`¿Eliminar categoría "${item.nombre}"?`)) return;
    try {
      await api.delete(item.id);
      toast.success('Categoría eliminada');
      await cargar();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Error eliminando');
    }
  };

  const filtrados = items.filter(it =>
    it.nombre.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="h-full flex flex-col">
      <StickyPageHeader
        backLink="/gestion/ajustes"
        title={title}
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
            {filtrados.map(item => (
              <div
                key={item.id}
                className="p-4 rounded-xl flex items-start gap-3 transition-all duration-200 hover:scale-[1.02]"
                style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
              >
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: `${item.color || '#6366f1'}20` }}
                >
                  <DynamicIcon name={item.icono || 'Folder'} className="h-6 w-6" style={{ color: item.color || '#6366f1' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold truncate" style={{ color: theme.text }}>{item.nombre}</h3>
                  {item.descripcion && (
                    <p className="text-xs mt-1 line-clamp-2" style={{ color: theme.textSecondary }}>{item.descripcion}</p>
                  )}
                  {!item.activo && (
                    <span className="inline-block mt-2 px-2 py-0.5 rounded text-xs" style={{ backgroundColor: '#ef444420', color: '#ef4444' }}>
                      Inactiva
                    </span>
                  )}
                </div>
                <div className="flex flex-col gap-1 flex-shrink-0">
                  <button
                    onClick={() => abrirEdit(item)}
                    className="p-1.5 rounded-lg transition-colors hover:bg-black/5"
                    style={{ color: theme.textSecondary }}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => eliminar(item)}
                    className="p-1.5 rounded-lg transition-colors hover:bg-red-500/10"
                    style={{ color: '#ef4444' }}
                  >
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
        title={editing ? 'Editar categoría' : 'Nueva categoría'}
        description={editing ? 'Modificá los datos y guardá' : 'Completá los datos de la nueva categoría'}
        stickyFooter={
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setSheetOpen(false)}
              className="px-4 py-2 rounded-xl text-sm font-medium"
              style={{ backgroundColor: theme.backgroundSecondary, color: theme.text }}
            >
              Cancelar
            </button>
            <button
              onClick={guardar}
              disabled={saving}
              className="px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2 disabled:opacity-50"
              style={{ backgroundColor: theme.primary, color: '#fff' }}
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Guardar
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="relative">
            <label className="block text-sm font-medium mb-1" style={{ color: theme.text }}>
              Nombre <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.nombre}
              onChange={e => handleNombreChange(e.target.value)}
              onFocus={() => {
                if (enableSugerencias && !editing && sugerencias.length > 0) {
                  setMostrarSugerencias(true);
                }
              }}
              placeholder={enableSugerencias && !editing ? 'Ej: "iluminación", "bache", "basura"...' : ''}
              className="w-full px-3 py-2 rounded-xl text-sm"
              style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}`, color: theme.text }}
            />
            {enableSugerencias && !editing && (
              <p className="text-[10px] mt-1 flex items-center gap-1" style={{ color: theme.textSecondary }}>
                <Sparkles className="h-3 w-3" />
                Te sugerimos categorías típicas mientras tipeás. Click para precargar.
              </p>
            )}

            {/* Dropdown de sugerencias cross-municipio */}
            {enableSugerencias && !editing && mostrarSugerencias && (sugerencias.length > 0 || loadingSugerencias) && (
              <div
                className="absolute left-0 right-0 top-full mt-1 rounded-xl shadow-xl overflow-hidden max-h-72 overflow-y-auto z-50"
                style={{
                  backgroundColor: theme.card,
                  border: `1px solid ${theme.border}`,
                }}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div
                  className="px-3 py-1.5 text-[10px] uppercase font-semibold tracking-wider flex items-center gap-1.5"
                  style={{
                    backgroundColor: theme.backgroundSecondary,
                    color: theme.textSecondary,
                    borderBottom: `1px solid ${theme.border}`,
                  }}
                >
                  <Sparkles className="h-3 w-3" />
                  {loadingSugerencias ? 'Buscando...' : `${sugerencias.length} sugerencias del catálogo`}
                </div>
                {sugerencias.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      aplicarSugerencia(s);
                    }}
                    className="w-full text-left px-3 py-2.5 transition-colors border-b last:border-b-0 hover:brightness-110"
                    style={{
                      borderBottomColor: theme.border,
                      backgroundColor: theme.card,
                    }}
                  >
                    <div className="flex items-start gap-2">
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: `${s.color || theme.primary}25` }}
                      >
                        <DynamicIcon
                          name={s.icono || 'Folder'}
                          className="h-4 w-4"
                          style={{ color: s.color || theme.primary }}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate" style={{ color: theme.text }}>
                          {s.nombre}
                        </p>
                        {s.descripcion && (
                          <p className="text-[11px] mt-0.5 line-clamp-2" style={{ color: theme.textSecondary }}>
                            {s.descripcion}
                          </p>
                        )}
                      </div>
                      {s.rubro && (
                        <span
                          className="text-[9px] px-1.5 py-0.5 rounded-full flex-shrink-0 mt-0.5"
                          style={{ backgroundColor: theme.backgroundSecondary, color: theme.textSecondary }}
                        >
                          {s.rubro}
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: theme.text }}>
              Descripción
            </label>
            <textarea
              value={form.descripcion}
              onChange={e => setForm({ ...form, descripcion: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 rounded-xl text-sm resize-none"
              style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}`, color: theme.text }}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: theme.text }}>
              Icono
            </label>
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
            <label className="block text-sm font-medium mb-2" style={{ color: theme.text }}>
              Color
            </label>
            <div className="grid grid-cols-7 gap-2">
              {COLORES_DISPONIBLES.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setForm({ ...form, color: c })}
                  className="aspect-square rounded-lg transition-all duration-200 hover:scale-110"
                  style={{
                    backgroundColor: c,
                    border: `3px solid ${form.color === c ? theme.text : 'transparent'}`,
                  }}
                />
              ))}
            </div>
          </div>

          {showReclamoFields && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: theme.text }}>
                  Tiempo resolución (hs)
                </label>
                <input
                  type="number"
                  value={form.tiempo_resolucion_estimado}
                  onChange={e => setForm({ ...form, tiempo_resolucion_estimado: parseInt(e.target.value) || 0 })}
                  className="w-full px-3 py-2 rounded-xl text-sm"
                  style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}`, color: theme.text }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: theme.text }}>
                  Prioridad default (1-5)
                </label>
                <input
                  type="number"
                  min={1}
                  max={5}
                  value={form.prioridad_default}
                  onChange={e => setForm({ ...form, prioridad_default: parseInt(e.target.value) || 3 })}
                  className="w-full px-3 py-2 rounded-xl text-sm"
                  style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}`, color: theme.text }}
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: theme.text }}>
              Orden
            </label>
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
    </div>
  );
}
