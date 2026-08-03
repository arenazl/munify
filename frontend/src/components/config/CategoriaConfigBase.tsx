/**
 * CategoriaConfigBase — el ABM de catálogo del canvas de Configuración.
 *
 * Es el cuerpo `tipo: 'catalogo'` de "Configuracion.dc.html": nombre, icono,
 * color, activo y orden. El brief lo dice explícito — **7 tabs hijos son
 * exactamente este mismo ABM**, por eso el canvas dibujó uno solo y acá hay un
 * componente, no siete pantallas.
 *
 * Hoy lo instancian Categorías de reclamo y Categorías de trámite. Los otros
 * cinco (tipos de POI, categorías de inventario, tipos de empleado, parajes,
 * tipos de trabajo) tienen su propia pantalla vieja y migran a este mismo
 * componente — cada uno con su `api`, sin escribir una pantalla nueva.
 *
 * [2026-08-03] Migrado del layout viejo (StickyPageHeader + grilla de
 * tarjetas a mano + `confirm()` nativo) al kit v2:
 *   - `SemanticAbmPage` embebida sin hero — un catálogo no tiene veredicto
 *     que contar y el panel de Configuración ya puso el título.
 *   - Tabla y tarjetas son la MISMA lista (`DataTable` / `CardGrid`), no dos
 *     maquetas distintas.
 *   - El orden se arrastra (modo "Reordenar" del kit) en vez de escribirse en
 *     un campo numérico. El campo sigue en el drawer para el caso exacto.
 *   - `Switch` para activar/desactivar sin abrir el drawer: antes la lista
 *     mostraba "Inactiva" pero no había forma de cambiarlo desde ahí.
 *   - `IconColorPicker` y `ScalePicker` en lugar de los dos grids y el input
 *     numérico de prioridad.
 *   - `ConfirmModal` en lugar de `confirm()` (control nativo vetado).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownUp, Loader2, Pencil, Sparkles, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from '../../contexts/ThemeContext';
import { Sheet } from '../ui/Sheet';
import { ConfirmModal } from '../ui/ConfirmModal';
import { DynamicIcon } from '../ui/DynamicIcon';
import { categoriasReclamoSugeridasApi } from '../../lib/api';
import { useReportarTotal } from '../abmv2/useEmbed';
import { SemanticAbmPage } from '../abmv2/SemanticAbmPage';
import { CardGrid } from '../abmv2/CardGrid';
import { EntityCell, ChipEstado } from '../abmv2/DataTable';
import { MetricCell, ScalePicker, SegmentedControl, Switch } from '../abmv2/Controls';
import { IconColorPicker } from '../abmv2/IconColorPicker';
import type { ColumnSpec, ScaleStep, ViewKind } from '../abmv2/types';

export interface CategoriaItem {
  id: number;
  municipio_id: number;
  nombre: string;
  descripcion?: string;
  icono?: string;
  color?: string;
  orden: number;
  activo: boolean;
  // Solo aplica a Categoría de Reclamo (showReclamoFields).
  tiempo_resolucion_estimado?: number;
  prioridad_default?: number;
  // Solo aplica a Categoría de Reclamo (showInternaField). Clasifica trabajo
  // interno (OT) que NO se le ofrece al vecino al crear un reclamo.
  interna?: boolean;
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
  /**
   * Si `true`, muestra el toggle "Interna" (clasifica trabajo interno —
   * Preventivo, Mantenimiento, Obra — sin ofrecérselo al vecino). Solo
   * aplica a Categoría de Reclamo.
   */
  showInternaField?: boolean;
  /** Copy del singular para los botones y mensajes ("categoría", "tipo"). */
  entidad?: string;
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

/** Los colores del catálogo son DATOS (se guardan en la fila), no tokens del
 *  theme: son la paleta que el municipio usa para distinguir sus categorías
 *  en el mapa y en las listas. Por eso van con nombre, para el tooltip. */
const COLORES_DISPONIBLES = [
  { name: 'Ámbar', value: '#f59e0b' },
  { name: 'Piedra', value: '#78716c' },
  { name: 'Esmeralda', value: '#10b981' },
  { name: 'Cian', value: '#06b6d4' },
  { name: 'Verde', value: '#22c55e' },
  { name: 'Rojo', value: '#ef4444' },
  { name: 'Azul', value: '#3b82f6' },
  { name: 'Lima', value: '#84cc16' },
  { name: 'Púrpura', value: '#a855f7' },
  { name: 'Rosa', value: '#ec4899' },
  { name: 'Violeta', value: '#8b5cf6' },
  { name: 'Celeste', value: '#0ea5e9' },
  { name: 'Índigo', value: '#6366f1' },
  { name: 'Pizarra', value: '#64748b' },
];

/** Escala de prioridad. El veredicto es el del canvas: 4-5 se lee en alerta,
 *  3 avisa, 1-2 tranquilo. La urgencia la define esto, no el color elegido. */
const PRIORIDADES: ScaleStep[] = [
  { value: 1, label: 'Muy baja', veredicto: 'bueno' },
  { value: 2, label: 'Baja', veredicto: 'bueno' },
  { value: 3, label: 'Media', veredicto: 'advertencia' },
  { value: 4, label: 'Alta', veredicto: 'malo' },
  { value: 5, label: 'Urgente', veredicto: 'malo' },
];

/** Plazo legible: en días cuando es múltiplo exacto, en horas cuando no.
 *  "72 h" no se lee; "3 días" sí. */
function formatearPlazo(horas: number): string {
  if (!horas) return '—';
  if (horas % 24 === 0) {
    const dias = horas / 24;
    return dias === 1 ? '1 día' : `${dias} días`;
  }
  return `${horas} h`;
}

const FORM_VACIO = {
  nombre: '',
  descripcion: '',
  icono: 'Folder',
  color: '#6366f1',
  orden: 0,
  tiempo_resolucion_estimado: 48,
  prioridad_default: 3,
  interna: false,
};

export function CategoriaConfigBase({
  title,
  api,
  showReclamoFields = false,
  enableSugerencias = false,
  showInternaField = false,
  entidad = 'categoría',
}: Props) {
  const { theme } = useTheme();
  const [items, setItems] = useState<CategoriaItem[]>([]);
  // Publica el total para el contador del riel de Configuración.
  useReportarTotal(items.length);

  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [vista, setVista] = useState<ViewKind>('table');
  const [estadoTab, setEstadoTab] = useState('todos');
  const [ordenando, setOrdenando] = useState(false);

  // Autocomplete de sugerencias cross-municipio (solo en modo alta).
  const [sugerencias, setSugerencias] = useState<CategoriaSugerida[]>([]);
  const [loadingSugerencias, setLoadingSugerencias] = useState(false);
  const [mostrarSugerencias, setMostrarSugerencias] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Drawer de alta/edición.
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<CategoriaItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(FORM_VACIO);
  const [unidadPlazo, setUnidadPlazo] = useState<'horas' | 'dias'>('horas');

  // Borrado: ConfirmModal, nunca `confirm()` (control nativo vetado).
  const [aBorrar, setABorrar] = useState<CategoriaItem | null>(null);
  const [borrando, setBorrando] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getAll();
      setItems(res.data);
    } catch (err) {
      toast.error(`Error cargando ${entidad}s`);
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [api, entidad]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  /* --- Alta / edición ------------------------------------------------- */

  const abrirNuevo = () => {
    setEditing(null);
    setForm({ ...FORM_VACIO, orden: items.length + 1 });
    setUnidadPlazo('horas');
    setSugerencias([]);
    setMostrarSugerencias(false);
    setSheetOpen(true);
  };

  const abrirEdit = (item: CategoriaItem) => {
    setEditing(item);
    const horas = item.tiempo_resolucion_estimado ?? 48;
    setForm({
      nombre: item.nombre,
      descripcion: item.descripcion || '',
      icono: item.icono || 'Folder',
      color: item.color || '#6366f1',
      orden: item.orden,
      tiempo_resolucion_estimado: horas,
      prioridad_default: item.prioridad_default ?? 3,
      interna: item.interna ?? false,
    });
    // Arranca en la unidad que hace legible el valor guardado.
    setUnidadPlazo(horas % 24 === 0 && horas >= 24 ? 'dias' : 'horas');
    setSheetOpen(true);
  };

  /**
   * Handler del input "Nombre" en modo alta. Setea el valor y, si el
   * autocomplete está habilitado, busca sugerencias en el catálogo global
   * con debounce de 300ms. No se llama al backend en modo edición.
   */
  const handleNombreChange = (nombre: string) => {
    setForm((f) => ({ ...f, nombre }));

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
   * Al elegir una sugerencia del catálogo cross-municipio, precargamos todos
   * los campos del form. El admin puede editarlos antes de guardar.
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
      interna: false,
    });
    setMostrarSugerencias(false);
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
      if (showInternaField) {
        payload.interna = form.interna;
      }

      if (editing) {
        await api.update(editing.id, payload);
        toast.success(`${entidad[0].toUpperCase()}${entidad.slice(1)} actualizada`);
      } else {
        await api.create(payload);
        toast.success(`${entidad[0].toUpperCase()}${entidad.slice(1)} creada`);
      }
      setSheetOpen(false);
      await cargar();
    } catch (err) {
      const detail =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        'Error guardando';
      toast.error(detail);
    } finally {
      setSaving(false);
    }
  };

  const confirmarBorrado = async () => {
    if (!aBorrar) return;
    setBorrando(true);
    try {
      await api.delete(aBorrar.id);
      toast.success(`${entidad[0].toUpperCase()}${entidad.slice(1)} eliminada`);
      setABorrar(null);
      await cargar();
    } catch (err) {
      // El backend bloquea el borrado de una categoría en uso y explica por
      // qué ("la usan 38 reclamos"): ese detalle es la respuesta útil.
      const detail =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        'Error eliminando';
      toast.error(detail);
    } finally {
      setBorrando(false);
    }
  };

  /* --- Activar / desactivar sin abrir el drawer ------------------------ */

  const alternarActivo = async (item: CategoriaItem, activo: boolean) => {
    // Optimista: el interruptor tiene que responder en el acto. Si el PUT
    // falla se revierte y se avisa — mostrar el estado real es lo que importa.
    setItems((prev) => prev.map((x) => (x.id === item.id ? { ...x, activo } : x)));
    try {
      await api.update(item.id, { activo });
    } catch {
      setItems((prev) => prev.map((x) => (x.id === item.id ? { ...x, activo: !activo } : x)));
      toast.error('No se pudo cambiar el estado');
    }
  };

  /* --- Reordenar ------------------------------------------------------ */

  /**
   * Persiste el orden nuevo. Sólo se mandan las filas cuyo `orden` cambió: en
   * un catálogo de 20, mover una fila toca 3, no 20.
   */
  const reordenar = async (filas: CategoriaItem[]) => {
    const conOrden = filas.map((f, i) => ({ ...f, orden: i + 1 }));
    const previos = items;
    setItems(conOrden);

    const cambiadas = conOrden.filter((f) => {
      const antes = previos.find((p) => p.id === f.id);
      return antes && antes.orden !== f.orden;
    });
    if (!cambiadas.length) return;

    try {
      await Promise.all(cambiadas.map((f) => api.update(f.id, { orden: f.orden })));
    } catch {
      toast.error('No se pudo guardar el orden');
      await cargar();
    }
  };

  /* --- Derivados ------------------------------------------------------ */

  const activas = useMemo(() => items.filter((i) => i.activo).length, [items]);

  const visibles = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((it) => {
      if (estadoTab === 'activos' && !it.activo) return false;
      if (estadoTab === 'inactivos' && it.activo) return false;
      if (!q) return true;
      return (
        it.nombre.toLowerCase().includes(q) ||
        (it.descripcion ?? '').toLowerCase().includes(q)
      );
    });
  }, [items, search, estadoTab]);

  // Reordenar sobre una lista filtrada daría un orden equivocado (las filas
  // ocultas conservan su número y el resultado sale mezclado). Se apaga el
  // modo y se dice por qué, en vez de dejar un botón que rompe.
  const listaCompleta = !search.trim() && estadoTab === 'todos';
  const puedeReordenar = vista === 'table' && listaCompleta;
  useEffect(() => {
    if (ordenando && !puedeReordenar) setOrdenando(false);
  }, [ordenando, puedeReordenar]);

  const columnas = useMemo<ColumnSpec<CategoriaItem>[]>(() => {
    const cols: ColumnSpec<CategoriaItem>[] = [
      {
        id: 'nombre',
        header: 'Nombre y descripción',
        width: 'minmax(220px, 2.2fr)',
        kind: 'entity',
        cell: (r) => (
          <EntityCell
            icon={<DynamicIcon name={r.icono || 'Folder'} size={16} strokeWidth={1.9} />}
            tileColor={r.color}
            title={r.nombre}
            subtitle={r.descripcion}
          />
        ),
      },
    ];

    if (showReclamoFields) {
      cols.push({
        id: 'respuesta',
        header: 'Respuesta comprometida',
        width: 'minmax(130px, 1fr)',
        kind: 'metric',
        cell: (r) => {
          const prio = r.prioridad_default ?? 3;
          const step = PRIORIDADES.find((p) => p.value === prio);
          return (
            <MetricCell
              value={formatearPlazo(r.tiempo_resolucion_estimado ?? 0)}
              note={`prioridad ${prio} · ${step?.label.toLowerCase() ?? ''}`}
              veredicto={step?.veredicto}
            />
          );
        },
      });
    }

    if (showInternaField) {
      cols.push({
        id: 'alcance',
        header: 'Alcance',
        width: 'minmax(100px, 0.8fr)',
        kind: 'chip',
        cell: (r) =>
          r.interna ? (
            <ChipEstado label="Interna" tone="gray" />
          ) : (
            <ChipEstado label="La ve el vecino" tone="blue" />
          ),
      });
    }

    cols.push(
      {
        id: 'activo',
        header: 'Estado',
        width: 'minmax(76px, 0.5fr)',
        align: 'right',
        cell: (r) => (
          <Switch
            checked={r.activo}
            ariaLabel={r.activo ? `Desactivar ${r.nombre}` : `Activar ${r.nombre}`}
            onChange={(v) => alternarActivo(r, v)}
          />
        ),
      },
      {
        id: 'acciones',
        header: 'Acciones',
        width: 'minmax(76px, 0.5fr)',
        kind: 'actions',
        align: 'right',
      },
    );
    return cols;
    // `alternarActivo` se recrea en cada render (usa `items`); las columnas se
    // reconstruyen igual cuando cambian las banderas, que es lo que importa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showReclamoFields, showInternaField]);

  const acciones = useMemo(
    () => [
      { id: 'edit', label: 'Editar', icon: Pencil, onClick: (r: CategoriaItem) => abrirEdit(r) },
      {
        id: 'del',
        label: 'Eliminar',
        icon: Trash2,
        danger: true,
        onClick: (r: CategoriaItem) => setABorrar(r),
      },
    ],
    [],
  );

  const plazoEnUnidad =
    unidadPlazo === 'dias'
      ? Math.max(1, Math.round(form.tiempo_resolucion_estimado / 24))
      : form.tiempo_resolucion_estimado;

  return (
    <>
      <SemanticAbmPage<CategoriaItem>
        moduleKey="catalogo"
        title={title}
        description={`Las ${entidad}s que usa toda la app. El orden es el que ve el vecino.`}
        searchPlaceholder={`Buscar ${entidad}…`}
        views={['table', 'cards']}
        activeView={vista}
        onViewChange={setVista}
        search={search}
        onSearchChange={setSearch}
        secondaryAction={{
          label: ordenando ? 'Listo' : 'Reordenar',
          icon: ArrowDownUp,
          onClick: () => setOrdenando((v) => !v),
          disabled: !puedeReordenar,
          disabledReason: !listaCompleta
            ? 'Para reordenar, limpiá la búsqueda y volvé a "Todas"'
            : 'El orden se arrastra en la vista de tabla',
        }}
        primaryAction={{ label: `Nueva ${entidad}`, onClick: abrirNuevo }}
        selects={[]}
        statusTabs={[
          { id: 'todos', label: 'Todas', count: items.length },
          { id: 'activos', label: 'Activas', count: activas },
          { id: 'inactivos', label: 'Inactivas', count: items.length - activas },
        ]}
        activeStatus={estadoTab}
        onStatusChange={setEstadoTab}
        kind="plain"
        columns={columnas}
        rows={visibles}
        rowKey={(r) => r.id}
        rowActions={acciones}
        onRowClick={ordenando ? undefined : abrirEdit}
        loading={loading}
        emptyMessage={
          search.trim()
            ? `Ninguna ${entidad} coincide con "${search.trim()}".`
            : `Todavía no hay ${entidad}s. Creá la primera con el botón de arriba.`
        }
        footer={{ showing: `Mostrando ${visibles.length} de ${items.length}` }}
        reorder={{ active: ordenando, onReorder: (filas) => reordenar(filas) }}
        viewSlots={{
          cards: (
            <CardGrid<CategoriaItem>
              rows={visibles}
              rowKey={(r) => r.id}
              loading={loading}
              card={(r) => ({
                title: r.nombre,
                subtitle: r.descripcion,
                icon: <DynamicIcon name={r.icono || 'Folder'} size={18} strokeWidth={1.9} />,
                tileColor: r.color,
                metric: showReclamoFields
                  ? {
                      value: formatearPlazo(r.tiempo_resolucion_estimado ?? 0),
                      note: `prioridad ${r.prioridad_default ?? 3}`,
                      veredicto: PRIORIDADES.find((p) => p.value === (r.prioridad_default ?? 3))
                        ?.veredicto,
                    }
                  : undefined,
                chip:
                  showInternaField && r.interna ? { label: 'Interna', tone: 'gray' } : undefined,
              })}
              actions={acciones}
              toggle={{
                checked: (r) => r.activo,
                onChange: (r, v) => alternarActivo(r, v),
                labelOn: 'Activa',
                labelOff: 'Inactiva',
              }}
              onCardClick={abrirEdit}
              emptyMessage={`Todavía no hay ${entidad}s.`}
            />
          ),
        }}
      />

      {/* --- Drawer de alta / edición --- */}
      <Sheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={editing ? `Editar ${entidad}` : `Nueva ${entidad}`}
        description={
          editing ? 'Modificá los datos y guardá' : `Completá los datos de la nueva ${entidad}`
        }
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
              onChange={(e) => handleNombreChange(e.target.value)}
              onFocus={() => {
                if (enableSugerencias && !editing && sugerencias.length > 0) {
                  setMostrarSugerencias(true);
                }
              }}
              placeholder={enableSugerencias && !editing ? 'Ej: "iluminación", "bache", "basura"…' : ''}
              className="w-full px-3 py-2 rounded-xl text-sm"
              style={{
                backgroundColor: theme.backgroundSecondary,
                border: `1px solid ${theme.border}`,
                color: theme.text,
              }}
            />
            {enableSugerencias && !editing && (
              <p
                className="text-[10px] mt-1 flex items-center gap-1"
                style={{ color: theme.textSecondary }}
              >
                <Sparkles className="h-3 w-3" />
                Te sugerimos categorías típicas mientras tipeás. Click para precargar.
              </p>
            )}

            {/* Dropdown de sugerencias cross-municipio */}
            {enableSugerencias && !editing && mostrarSugerencias && (sugerencias.length > 0 || loadingSugerencias) && (
              <div
                className="absolute left-0 right-0 top-full mt-1 rounded-xl shadow-xl overflow-hidden max-h-72 overflow-y-auto z-50"
                style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
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
                  {loadingSugerencias ? 'Buscando…' : `${sugerencias.length} sugerencias del catálogo`}
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
                    style={{ borderBottomColor: theme.border, backgroundColor: theme.card }}
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
                          <p
                            className="text-[11px] mt-0.5 line-clamp-2"
                            style={{ color: theme.textSecondary }}
                          >
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
              onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 rounded-xl text-sm resize-none"
              style={{
                backgroundColor: theme.backgroundSecondary,
                border: `1px solid ${theme.border}`,
                color: theme.text,
              }}
            />
            <p className="text-[11px] mt-1" style={{ color: theme.textSecondary }}>
              Es el texto que el vecino lee al elegir.
            </p>
          </div>

          {/* Icono y color juntos: lo que se elige no es "un icono", es cómo se
              va a ver la fila en la app del vecino. */}
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: theme.text }}>
              Cómo se ve en la app
            </label>
            <IconColorPicker
              icons={ICONOS_DISPONIBLES}
              icon={form.icono}
              onIconChange={(n) => setForm((f) => ({ ...f, icono: n }))}
              colors={COLORES_DISPONIBLES}
              color={form.color}
              onColorChange={(c) => setForm((f) => ({ ...f, color: c }))}
              preview={{ title: form.nombre || `Sin nombre`, subtitle: 'Icono y color' }}
              note="El color agrupa visualmente en el mapa y las listas. La urgencia la define la prioridad, no el color."
              collapsible
            />
          </div>

          {showReclamoFields && (
            <>
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: theme.text }}>
                  Plazo de resolución
                </label>
                <div className="flex items-center gap-2 flex-wrap">
                  <input
                    type="number"
                    min={1}
                    value={plazoEnUnidad}
                    onChange={(e) => {
                      const n = parseInt(e.target.value) || 0;
                      setForm((f) => ({
                        ...f,
                        tiempo_resolucion_estimado: unidadPlazo === 'dias' ? n * 24 : n,
                      }));
                    }}
                    className="w-24 px-3 py-2 rounded-xl text-sm"
                    style={{
                      backgroundColor: theme.backgroundSecondary,
                      border: `1px solid ${theme.border}`,
                      color: theme.text,
                    }}
                  />
                  <SegmentedControl
                    size="sm"
                    ariaLabel="Unidad del plazo"
                    value={unidadPlazo}
                    onChange={(id) => setUnidadPlazo(id as 'horas' | 'dias')}
                    options={[
                      { id: 'horas', label: 'horas' },
                      { id: 'dias', label: 'días' },
                    ]}
                  />
                  <span className="text-[11px]" style={{ color: theme.textSecondary }}>
                    Se guarda en horas: {form.tiempo_resolucion_estimado} h
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: theme.text }}>
                  Prioridad por defecto
                </label>
                <ScalePicker
                  steps={PRIORIDADES}
                  value={form.prioridad_default}
                  onChange={(v) => setForm((f) => ({ ...f, prioridad_default: v }))}
                  ariaLabel="Prioridad por defecto"
                  note="Con la que entra un reclamo de esta categoría si nadie la cambia."
                />
              </div>
            </>
          )}

          {showInternaField && (
            <div
              className="p-3 rounded-xl"
              style={{ backgroundColor: theme.backgroundSecondary }}
            >
              <Switch
                checked={form.interna}
                onChange={(v) => setForm((f) => ({ ...f, interna: v }))}
                label="Interna"
                description="No se le ofrece al vecino al crear un reclamo; sirve para clasificar trabajo interno (preventivo, mantenimiento, obra)."
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: theme.text }}>
              Orden en la app del vecino
            </label>
            <div className="flex items-center gap-3 flex-wrap">
              <input
                type="number"
                value={form.orden}
                onChange={(e) => setForm({ ...form, orden: parseInt(e.target.value) || 0 })}
                className="w-24 px-3 py-2 rounded-xl text-sm"
                style={{
                  backgroundColor: theme.backgroundSecondary,
                  border: `1px solid ${theme.border}`,
                  color: theme.text,
                }}
              />
              <span className="text-[11px]" style={{ color: theme.textSecondary }}>
                También se puede arrastrar la lista con el botón "Reordenar".
              </span>
            </div>
          </div>
        </div>
      </Sheet>

      <ConfirmModal
        isOpen={!!aBorrar}
        onClose={() => setABorrar(null)}
        onConfirm={confirmarBorrado}
        loading={borrando}
        variant="danger"
        title={`Eliminar ${entidad}`}
        message={
          aBorrar
            ? `Se va a eliminar "${aBorrar.nombre}". Si ya se usó en registros existentes, el sistema no va a dejar borrarla y te lo va a decir.`
            : ''
        }
        confirmText="Eliminar"
      />
    </>
  );
}
