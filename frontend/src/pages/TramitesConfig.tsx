import { useEffect, useState } from 'react';
import { Pencil, Trash2, Loader2, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from '../contexts/ThemeContext';
import { Sheet } from '../components/ui/Sheet';
import { DynamicIcon } from '../components/ui/DynamicIcon';
import { StickyPageHeader } from '../components/ui/StickyPageHeader';
import { tramitesApi, categoriasTramiteApi } from '../lib/api';
import {
  DocumentosRequeridosEditor,
  type DocRequeridoDraft,
} from '../components/config/DocumentosRequeridosEditor';
import type { Tramite, CategoriaTramite } from '../types';

interface TramiteForm {
  categoria_tramite_id: number | null;
  nombre: string;
  descripcion: string;
  tiempo_estimado_dias: number;
  costo: string;
  url_externa: string;
  requiere_validacion_dni: boolean;
  requiere_validacion_facial: boolean;
  documentos_requeridos: DocRequeridoDraft[];
}

const EMPTY_FORM: TramiteForm = {
  categoria_tramite_id: null,
  nombre: '',
  descripcion: '',
  tiempo_estimado_dias: 15,
  costo: '',
  url_externa: '',
  requiere_validacion_dni: false,
  requiere_validacion_facial: false,
  documentos_requeridos: [],
};

export default function TramitesConfig() {
  const { theme } = useTheme();
  const [tramites, setTramites] = useState<Tramite[]>([]);
  const [categorias, setCategorias] = useState<CategoriaTramite[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState<number | null>(null);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Tramite | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<TramiteForm>(EMPTY_FORM);

  const cargar = async () => {
    setLoading(true);
    try {
      const [tramRes, catRes] = await Promise.all([
        tramitesApi.getAll(),
        categoriasTramiteApi.getAll(),
      ]);
      setTramites(tramRes.data);
      setCategorias(catRes.data);
    } catch (err) {
      toast.error('Error cargando trámites');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar();
  }, []);

  const abrirNuevo = () => {
    setEditing(null);
    setForm({
      ...EMPTY_FORM,
      categoria_tramite_id: categorias[0]?.id ?? null,
    });
    setSheetOpen(true);
  };

  const abrirEdit = async (tramite: Tramite) => {
    setEditing(tramite);
    // Cargar el detalle completo (incluye documentos_requeridos)
    try {
      const res = await tramitesApi.getOne(tramite.id);
      const t = res.data as Tramite;
      setForm({
        categoria_tramite_id: t.categoria_tramite_id,
        nombre: t.nombre,
        descripcion: t.descripcion || '',
        tiempo_estimado_dias: t.tiempo_estimado_dias,
        costo: t.costo != null ? String(t.costo) : '',
        url_externa: t.url_externa || '',
        requiere_validacion_dni: !!t.requiere_validacion_dni,
        requiere_validacion_facial: !!t.requiere_validacion_facial,
        documentos_requeridos: (t.documentos_requeridos || []).map(d => ({
          id: d.id,
          nombre: d.nombre,
          descripcion: d.descripcion || '',
          obligatorio: d.obligatorio,
          orden: d.orden,
        })),
      });
      setSheetOpen(true);
    } catch (err) {
      toast.error('Error cargando trámite');
    }
  };

  const guardar = async () => {
    if (!form.categoria_tramite_id) {
      toast.error('Seleccioná una categoría');
      return;
    }
    if (!form.nombre.trim()) {
      toast.error('El nombre es obligatorio');
      return;
    }

    setSaving(true);
    try {
      if (editing) {
        // Update del trámite (campos básicos)
        await tramitesApi.update(editing.id, {
          categoria_tramite_id: form.categoria_tramite_id,
          nombre: form.nombre.trim(),
          descripcion: form.descripcion.trim() || undefined,
          tiempo_estimado_dias: form.tiempo_estimado_dias,
          costo: form.costo ? parseFloat(form.costo) : undefined,
          url_externa: form.url_externa.trim() || undefined,
          requiere_validacion_dni: form.requiere_validacion_dni,
          requiere_validacion_facial: form.requiere_validacion_facial,
        });

        // Sincronizar documentos requeridos: borrar viejos no presentes,
        // crear nuevos sin id, actualizar los existentes con id.
        const idsExistentes = new Set(
          (editing.documentos_requeridos || []).map(d => d.id),
        );
        const idsActuales = new Set(
          form.documentos_requeridos.filter(d => d.id).map(d => d.id!),
        );

        // Eliminar
        for (const old of editing.documentos_requeridos || []) {
          if (!idsActuales.has(old.id)) {
            await tramitesApi.deleteDocumentoRequerido(old.id);
          }
        }
        // Crear / actualizar
        for (const draft of form.documentos_requeridos) {
          if (!draft.nombre.trim()) continue;
          if (draft.id && idsExistentes.has(draft.id)) {
            await tramitesApi.updateDocumentoRequerido(draft.id, {
              nombre: draft.nombre,
              descripcion: draft.descripcion || undefined,
              obligatorio: draft.obligatorio,
              orden: draft.orden,
            });
          } else {
            await tramitesApi.addDocumentoRequerido(editing.id, {
              nombre: draft.nombre,
              descripcion: draft.descripcion || undefined,
              obligatorio: draft.obligatorio,
              orden: draft.orden,
            });
          }
        }
        toast.success('Trámite actualizado');
      } else {
        await tramitesApi.create({
          categoria_tramite_id: form.categoria_tramite_id,
          nombre: form.nombre.trim(),
          descripcion: form.descripcion.trim() || undefined,
          tiempo_estimado_dias: form.tiempo_estimado_dias,
          costo: form.costo ? parseFloat(form.costo) : undefined,
          url_externa: form.url_externa.trim() || undefined,
          requiere_validacion_dni: form.requiere_validacion_dni,
          requiere_validacion_facial: form.requiere_validacion_facial,
          documentos_requeridos: form.documentos_requeridos
            .filter(d => d.nombre.trim())
            .map(d => ({
              nombre: d.nombre,
              descripcion: d.descripcion || undefined,
              obligatorio: d.obligatorio,
              orden: d.orden,
            })),
        });
        toast.success('Trámite creado');
      }
      setSheetOpen(false);
      await cargar();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Error guardando');
    } finally {
      setSaving(false);
    }
  };

  const eliminar = async (t: Tramite) => {
    if (!confirm(`¿Eliminar trámite "${t.nombre}"?`)) return;
    try {
      await tramitesApi.delete(t.id);
      toast.success('Trámite eliminado');
      await cargar();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Error eliminando');
    }
  };

  const filtrados = tramites.filter(t => {
    if (filtroCategoria && t.categoria_tramite_id !== filtroCategoria) return false;
    if (search && !t.nombre.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const tramitesPorCat = filtrados.reduce<Record<number, Tramite[]>>((acc, t) => {
    (acc[t.categoria_tramite_id] ||= []).push(t);
    return acc;
  }, {});

  return (
    <div className="h-full flex flex-col">
      <StickyPageHeader
        icon={<FileText className="h-5 w-5" />}
        title="Trámites"
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Buscar trámite..."
        buttonLabel="Nuevo trámite"
        onButtonClick={abrirNuevo}
        filterPanel={
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <button
              onClick={() => setFiltroCategoria(null)}
              className="px-3 py-1.5 rounded-full text-xs whitespace-nowrap transition-colors"
              style={{
                backgroundColor: filtroCategoria === null ? theme.primary : theme.backgroundSecondary,
                color: filtroCategoria === null ? '#fff' : theme.text,
              }}
            >
              Todas
            </button>
            {categorias.map(c => (
              <button
                key={c.id}
                onClick={() => setFiltroCategoria(c.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs whitespace-nowrap transition-colors"
                style={{
                  backgroundColor: filtroCategoria === c.id ? c.color || theme.primary : theme.backgroundSecondary,
                  color: filtroCategoria === c.id ? '#fff' : theme.text,
                }}
              >
                <DynamicIcon name={c.icono || 'Folder'} className="h-3 w-3" />
                {c.nombre}
              </button>
            ))}
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin" style={{ color: theme.primary }} />
          </div>
        ) : filtrados.length === 0 ? (
          <div className="text-center py-20" style={{ color: theme.textSecondary }}>
            {tramites.length === 0
              ? 'No hay trámites cargados. Hacé click en "Nuevo trámite" para crear el primero.'
              : 'Sin resultados para los filtros aplicados.'}
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(tramitesPorCat).map(([catId, lista]) => {
              const cat = categorias.find(c => c.id === Number(catId));
              return (
                <div key={catId}>
                  <div className="flex items-center gap-2 mb-3">
                    {cat?.icono && (
                      <DynamicIcon name={cat.icono} className="h-5 w-5" style={{ color: cat.color || theme.primary }} />
                    )}
                    <h2 className="text-base font-semibold" style={{ color: theme.text }}>
                      {cat?.nombre || 'Sin categoría'}
                    </h2>
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: theme.backgroundSecondary, color: theme.textSecondary }}>
                      {lista.length}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {lista.map(t => (
                      <div
                        key={t.id}
                        className="p-4 rounded-xl flex items-start gap-3 transition-all duration-200 hover:scale-[1.02]"
                        style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
                      >
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-semibold truncate" style={{ color: theme.text }}>
                            {t.nombre}
                          </h3>
                          {t.descripcion && (
                            <p className="text-xs mt-1 line-clamp-2" style={{ color: theme.textSecondary }}>
                              {t.descripcion}
                            </p>
                          )}
                          <div className="flex items-center gap-3 mt-2 text-xs" style={{ color: theme.textSecondary }}>
                            <span>{t.tiempo_estimado_dias} días</span>
                            {t.costo ? <span>${t.costo}</span> : <span>Gratis</span>}
                            {t.documentos_requeridos?.length > 0 && (
                              <span>{t.documentos_requeridos.length} docs</span>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col gap-1 flex-shrink-0">
                          <button
                            onClick={() => abrirEdit(t)}
                            className="p-1.5 rounded-lg hover:bg-black/5 transition-colors"
                            style={{ color: theme.textSecondary }}
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => eliminar(t)}
                            className="p-1.5 rounded-lg hover:bg-red-500/10 transition-colors"
                            style={{ color: '#ef4444' }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}
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
        title={editing ? 'Editar trámite' : 'Nuevo trámite'}
        description={editing ? 'Modificá los datos y los documentos requeridos' : 'Completá los datos del trámite'}
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
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: theme.text }}>
              Categoría <span className="text-red-500">*</span>
            </label>
            <select
              value={form.categoria_tramite_id ?? ''}
              onChange={e => setForm({ ...form, categoria_tramite_id: Number(e.target.value) || null })}
              className="w-full px-3 py-2 rounded-xl text-sm"
              style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}`, color: theme.text }}
            >
              <option value="">Seleccionar categoría</option>
              {categorias.map(c => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: theme.text }}>
              Nombre del trámite <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              placeholder="Ej: Licencia de Conducir - Primera vez"
              value={form.nombre}
              onChange={e => setForm({ ...form, nombre: e.target.value })}
              className="w-full px-3 py-2 rounded-xl text-sm"
              style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}`, color: theme.text }}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: theme.text }}>
              Descripción
            </label>
            <textarea
              rows={3}
              value={form.descripcion}
              onChange={e => setForm({ ...form, descripcion: e.target.value })}
              className="w-full px-3 py-2 rounded-xl text-sm resize-none"
              style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}`, color: theme.text }}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: theme.text }}>
                Tiempo estimado (días)
              </label>
              <input
                type="number"
                min={1}
                value={form.tiempo_estimado_dias}
                onChange={e => setForm({ ...form, tiempo_estimado_dias: parseInt(e.target.value) || 1 })}
                className="w-full px-3 py-2 rounded-xl text-sm"
                style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}`, color: theme.text }}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: theme.text }}>
                Costo (vacío = gratis)
              </label>
              <input
                type="number"
                step="0.01"
                value={form.costo}
                onChange={e => setForm({ ...form, costo: e.target.value })}
                className="w-full px-3 py-2 rounded-xl text-sm"
                style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}`, color: theme.text }}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: theme.text }}>
              URL externa (opcional)
            </label>
            <input
              type="text"
              placeholder="https://..."
              value={form.url_externa}
              onChange={e => setForm({ ...form, url_externa: e.target.value })}
              className="w-full px-3 py-2 rounded-xl text-sm"
              style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}`, color: theme.text }}
            />
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: theme.text }}>
              <input
                type="checkbox"
                checked={form.requiere_validacion_dni}
                onChange={e => setForm({ ...form, requiere_validacion_dni: e.target.checked })}
              />
              Requiere validación de DNI (foto frente/dorso)
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: theme.text }}>
              <input
                type="checkbox"
                checked={form.requiere_validacion_facial}
                onChange={e => setForm({ ...form, requiere_validacion_facial: e.target.checked })}
              />
              Requiere validación facial (selfie)
            </label>
          </div>

          <div className="pt-4" style={{ borderTop: `1px solid ${theme.border}` }}>
            <DocumentosRequeridosEditor
              items={form.documentos_requeridos}
              onChange={(items) => setForm({ ...form, documentos_requeridos: items })}
            />
          </div>
        </div>
      </Sheet>
    </div>
  );
}
