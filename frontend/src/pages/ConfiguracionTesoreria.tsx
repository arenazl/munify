import { useEffect, useMemo, useState } from 'react';
import {
  Wallet, Tag, FileText, Briefcase, Plus, Edit2, Trash2, Loader2, ArrowLeft,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { ModernSelect } from '../components/ui/ModernSelect';
import { DynamicIcon } from '../components/ui/DynamicIcon';
import { Sheet } from '../components/ui/Sheet';
import { tiposConceptoApi, conceptosAbmApi } from '../lib/api';
import type { TipoConcepto, Concepto } from '../types';
import TesoreriaProyectos from './TesoreriaProyectos';

type Tab = 'tipos' | 'conceptos' | 'proyectos';

export default function ConfiguracionTesoreria() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('tipos');

  if (user && user.rol !== 'admin' && user.rol !== 'supervisor') {
    return (
      <div className="p-6">
        <p className="text-sm" style={{ color: theme.textSecondary }}>
          La configuración de Tesorería es exclusiva de los gestores del municipio.
        </p>
      </div>
    );
  }

  return (
    <div className="px-4 py-3 space-y-3">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          to="/gestion/configuracion"
          className="p-1.5 rounded-lg transition-all hover:scale-110 active:scale-95"
          style={{ backgroundColor: `${theme.primary}15`, color: theme.primary }}
          title="Volver a Configuración"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: `${theme.primary}15` }}
        >
          <Wallet className="h-5 w-5" style={{ color: theme.primary }} />
        </div>
        <div>
          <h1 className="text-lg font-bold" style={{ color: theme.text }}>Configuración de Tesorería</h1>
          <p className="text-xs" style={{ color: theme.textSecondary }}>
            Catálogo de conceptos, tipos y proyectos del módulo
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b" style={{ borderColor: theme.border }}>
        {([
          { id: 'tipos', label: 'Tipos de concepto', icon: <Tag className="h-4 w-4" /> },
          { id: 'conceptos', label: 'Conceptos', icon: <FileText className="h-4 w-4" /> },
          { id: 'proyectos', label: 'Proyectos', icon: <Briefcase className="h-4 w-4" /> },
        ] as const).map(t => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="px-4 py-2.5 text-sm font-medium transition-all inline-flex items-center gap-2 border-b-2"
              style={{
                color: active ? theme.primary : theme.textSecondary,
                borderColor: active ? theme.primary : 'transparent',
                marginBottom: '-1px',
              }}
            >
              {t.icon}
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Tab contents */}
      <div className="pt-2">
        {tab === 'tipos' && <TiposConceptoTab />}
        {tab === 'conceptos' && <ConceptosTab />}
        {tab === 'proyectos' && (
          // Embeber la pagina existente. Tiene su propio header y ABMPage.
          <div className="-mt-3 -mx-4">
            <TesoreriaProyectos />
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Tab: Tipos de concepto
// ============================================================
function TiposConceptoTab() {
  const { theme } = useTheme();
  const [tipos, setTipos] = useState<TipoConcepto[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<TipoConcepto | null>(null);
  const [form, setForm] = useState({ nombre: '', descripcion: '', color: '#6366f1', icono: 'Tag', orden: 0 });
  const [saving, setSaving] = useState(false);

  const fetch = async () => {
    setLoading(true);
    try {
      const res = await tiposConceptoApi.list({ activo: true });
      setTipos(res.data || []);
    } catch {
      toast.error('Error cargando tipos de concepto');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetch(); }, []);

  const openSheet = (t: TipoConcepto | null = null) => {
    if (t) {
      setEditing(t);
      setForm({
        nombre: t.nombre,
        descripcion: t.descripcion || '',
        color: t.color || '#6366f1',
        icono: t.icono || 'Tag',
        orden: t.orden,
      });
    } else {
      setEditing(null);
      setForm({ nombre: '', descripcion: '', color: '#6366f1', icono: 'Tag', orden: tipos.length });
    }
    setSheetOpen(true);
  };

  const save = async () => {
    if (!form.nombre.trim()) return toast.error('Nombre requerido');
    setSaving(true);
    try {
      const payload = { ...form, nombre: form.nombre.trim(), descripcion: form.descripcion.trim() || null };
      if (editing) {
        await tiposConceptoApi.update(editing.id, payload);
        toast.success('Tipo actualizado');
      } else {
        await tiposConceptoApi.create(payload);
        toast.success('Tipo creado');
      }
      setSheetOpen(false);
      fetch();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Error guardando');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (t: TipoConcepto) => {
    if (!confirm(`¿Eliminar el tipo "${t.nombre}"? Si tiene conceptos asociados, primero hay que moverlos.`)) return;
    try {
      await tiposConceptoApi.delete(t.id);
      toast.success('Tipo eliminado');
      fetch();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'No se pudo eliminar');
    }
  };

  if (loading) return <div className="p-6 flex justify-center"><Loader2 className="h-6 w-6 animate-spin" style={{ color: theme.primary }} /></div>;

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs" style={{ color: theme.textSecondary }}>
          {tipos.length} tipos. Categorizan los conceptos de gasto. Cada uno tiene color e ícono propio.
        </p>
        <button
          onClick={() => openSheet()}
          className="px-3 py-2 rounded-lg text-sm font-semibold text-white inline-flex items-center gap-2"
          style={{ backgroundColor: theme.primary }}
        >
          <Plus className="h-4 w-4" /> Nuevo tipo
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {tipos.map(t => (
          <div
            key={t.id}
            className="rounded-xl p-3 cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-md"
            style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
            onClick={() => openSheet(t)}
          >
            <div className="flex items-start gap-2.5">
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: `${t.color || theme.primary}20` }}
              >
                <DynamicIcon name={t.icono || 'Tag'} size={20} color={t.color || theme.primary} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate" style={{ color: theme.text }}>{t.nombre}</p>
                {t.descripcion && (
                  <p className="text-[11px] truncate" style={{ color: theme.textSecondary }}>{t.descripcion}</p>
                )}
                <p className="text-[10px] mt-0.5" style={{ color: t.color || theme.primary }}>
                  {t.cantidad_conceptos ?? 0} conceptos
                </p>
              </div>
              <div className="flex flex-col gap-1">
                <button
                  onClick={(e) => { e.stopPropagation(); openSheet(t); }}
                  className="p-1 rounded hover:scale-110"
                  style={{ color: theme.primary }}
                  title="Editar"
                >
                  <Edit2 className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(t); }}
                  className="p-1 rounded hover:scale-110"
                  style={{ color: '#ef4444' }}
                  title="Eliminar"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Sheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={editing ? `Editar · ${editing.nombre}` : 'Nuevo tipo de concepto'}
        footer={
          <div className="flex justify-end gap-2">
            <button onClick={() => setSheetOpen(false)} className="px-3 py-2 rounded-lg text-sm" style={{ backgroundColor: theme.backgroundSecondary, color: theme.text }}>Cancelar</button>
            <button onClick={save} disabled={saving} className="px-3 py-2 rounded-lg text-sm font-semibold text-white" style={{ backgroundColor: theme.primary, opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Guardando...' : (editing ? 'Guardar cambios' : 'Crear')}
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: theme.textSecondary }}>Nombre *</label>
            <input
              value={form.nombre}
              onChange={(e) => setForm(f => ({ ...f, nombre: e.target.value }))}
              autoFocus
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={{ backgroundColor: theme.background, color: theme.text, border: `1px solid ${theme.border}` }}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: theme.textSecondary }}>Descripción</label>
            <textarea
              value={form.descripcion}
              onChange={(e) => setForm(f => ({ ...f, descripcion: e.target.value }))}
              rows={2}
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={{ backgroundColor: theme.background, color: theme.text, border: `1px solid ${theme.border}` }}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: theme.textSecondary }}>Color</label>
              <div className="flex items-center gap-2">
                <input type="color" value={form.color} onChange={(e) => setForm(f => ({ ...f, color: e.target.value }))} className="w-10 h-10 rounded cursor-pointer" style={{ border: `1px solid ${theme.border}` }} />
                <input type="text" value={form.color} onChange={(e) => setForm(f => ({ ...f, color: e.target.value }))} className="flex-1 px-3 py-2 rounded-lg text-sm font-mono" style={{ backgroundColor: theme.background, color: theme.text, border: `1px solid ${theme.border}` }} />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: theme.textSecondary }}>Icono (Lucide)</label>
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${form.color}20`, border: `1px solid ${theme.border}` }}>
                  <DynamicIcon name={form.icono} size={20} color={form.color} />
                </div>
                <input type="text" value={form.icono} onChange={(e) => setForm(f => ({ ...f, icono: e.target.value }))} className="flex-1 px-3 py-2 rounded-lg text-sm font-mono" style={{ backgroundColor: theme.background, color: theme.text, border: `1px solid ${theme.border}` }} />
              </div>
            </div>
          </div>
        </div>
      </Sheet>
    </>
  );
}

// ============================================================
// Tab: Conceptos
// ============================================================
function ConceptosTab() {
  const { theme } = useTheme();
  const [tipos, setTipos] = useState<TipoConcepto[]>([]);
  const [conceptos, setConceptos] = useState<Concepto[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroTipo, setFiltroTipo] = useState<string>('');
  const [search, setSearch] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Concepto | null>(null);
  const [form, setForm] = useState({ nombre: '', descripcion: '', tipo_concepto_id: 0, orden: 0 });
  const [saving, setSaving] = useState(false);

  const fetch = async () => {
    setLoading(true);
    try {
      const [tiposRes, conceptosRes] = await Promise.all([
        tiposConceptoApi.list({ activo: true }),
        conceptosAbmApi.list({ activo: true }),
      ]);
      setTipos(tiposRes.data || []);
      setConceptos(conceptosRes.data || []);
    } catch {
      toast.error('Error cargando conceptos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetch(); }, []);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return conceptos.filter(c => {
      if (filtroTipo && c.tipo_concepto_id !== parseInt(filtroTipo, 10)) return false;
      if (s && !c.nombre.toLowerCase().includes(s) && !(c.descripcion || '').toLowerCase().includes(s)) return false;
      return true;
    });
  }, [conceptos, filtroTipo, search]);

  const openSheet = (c: Concepto | null = null) => {
    if (c) {
      setEditing(c);
      setForm({ nombre: c.nombre, descripcion: c.descripcion || '', tipo_concepto_id: c.tipo_concepto_id, orden: c.orden });
    } else {
      setEditing(null);
      const defaultTipo = filtroTipo ? parseInt(filtroTipo, 10) : (tipos[0]?.id ?? 0);
      setForm({ nombre: '', descripcion: '', tipo_concepto_id: defaultTipo, orden: 0 });
    }
    setSheetOpen(true);
  };

  const save = async () => {
    if (!form.nombre.trim()) return toast.error('Nombre requerido');
    if (!form.tipo_concepto_id) return toast.error('Tipo requerido');
    setSaving(true);
    try {
      const payload = { ...form, nombre: form.nombre.trim(), descripcion: form.descripcion.trim() || null };
      if (editing) {
        await conceptosAbmApi.update(editing.id, payload);
        toast.success('Concepto actualizado');
      } else {
        await conceptosAbmApi.create(payload);
        toast.success('Concepto creado');
      }
      setSheetOpen(false);
      fetch();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Error guardando');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (c: Concepto) => {
    if (!confirm(`¿Eliminar el concepto "${c.nombre}"?`)) return;
    try {
      await conceptosAbmApi.delete(c.id);
      toast.success('Eliminado');
      fetch();
    } catch {
      toast.error('Error eliminando');
    }
  };

  const tipoOptions = useMemo(() => ([
    { value: '', label: 'Todos los tipos' },
    ...tipos.map(t => ({ value: String(t.id), label: t.nombre, color: t.color || undefined })),
  ]), [tipos]);

  if (loading) return <div className="p-6 flex justify-center"><Loader2 className="h-6 w-6 animate-spin" style={{ color: theme.primary }} /></div>;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="min-w-[220px] flex-shrink-0">
          <ModernSelect value={filtroTipo} onChange={setFiltroTipo} options={tipoOptions} placeholder="Todos los tipos" searchable />
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar concepto..."
          className="flex-1 min-w-[180px] px-3 py-2 rounded-lg text-sm"
          style={{ backgroundColor: theme.background, color: theme.text, border: `1px solid ${theme.border}` }}
        />
        <span className="text-xs" style={{ color: theme.textSecondary }}>
          {filtered.length} de {conceptos.length}
        </span>
        <button
          onClick={() => openSheet()}
          className="ml-auto px-3 py-2 rounded-lg text-sm font-semibold text-white inline-flex items-center gap-2"
          style={{ backgroundColor: theme.primary }}
          disabled={tipos.length === 0}
          title={tipos.length === 0 ? 'Primero creá al menos un tipo' : ''}
        >
          <Plus className="h-4 w-4" /> Nuevo concepto
        </button>
      </div>

      <div className="rounded-xl overflow-hidden" style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ backgroundColor: theme.backgroundSecondary }}>
              <th className="text-left px-3 py-2 text-[11px] font-semibold uppercase tracking-wide" style={{ color: theme.textSecondary }}>Concepto</th>
              <th className="text-left px-3 py-2 text-[11px] font-semibold uppercase tracking-wide" style={{ color: theme.textSecondary }}>Tipo</th>
              <th className="text-left px-3 py-2 text-[11px] font-semibold uppercase tracking-wide w-24" style={{ color: theme.textSecondary }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={3} className="text-center p-6" style={{ color: theme.textSecondary }}>
                  No hay conceptos con los filtros actuales.
                </td>
              </tr>
            )}
            {filtered.map((c, i) => (
              <tr
                key={c.id}
                className="cursor-pointer transition-colors hover:bg-opacity-50"
                style={{
                  borderTop: i > 0 ? `1px solid ${theme.border}` : undefined,
                  backgroundColor: i % 2 === 0 ? 'transparent' : `${theme.backgroundSecondary}30`,
                }}
                onClick={() => openSheet(c)}
              >
                <td className="px-3 py-2" style={{ color: theme.text }}>
                  <span className="font-medium">{c.nombre}</span>
                  {c.descripcion && <span className="block text-[11px]" style={{ color: theme.textSecondary }}>{c.descripcion}</span>}
                </td>
                <td className="px-3 py-2">
                  <span
                    className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: `${c.tipo_concepto_color || theme.primary}20`, color: c.tipo_concepto_color || theme.primary }}
                  >
                    {c.tipo_concepto_nombre}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <div className="flex gap-1">
                    <button onClick={(e) => { e.stopPropagation(); openSheet(c); }} className="p-1.5 rounded hover:scale-110" style={{ color: theme.primary }} title="Editar"><Edit2 className="h-3.5 w-3.5" /></button>
                    <button onClick={(e) => { e.stopPropagation(); handleDelete(c); }} className="p-1.5 rounded hover:scale-110" style={{ color: '#ef4444' }} title="Eliminar"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Sheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={editing ? `Editar · ${editing.nombre}` : 'Nuevo concepto'}
        footer={
          <div className="flex justify-end gap-2">
            <button onClick={() => setSheetOpen(false)} className="px-3 py-2 rounded-lg text-sm" style={{ backgroundColor: theme.backgroundSecondary, color: theme.text }}>Cancelar</button>
            <button onClick={save} disabled={saving} className="px-3 py-2 rounded-lg text-sm font-semibold text-white" style={{ backgroundColor: theme.primary, opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Guardando...' : (editing ? 'Guardar cambios' : 'Crear')}
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: theme.textSecondary }}>Nombre *</label>
            <input value={form.nombre} onChange={(e) => setForm(f => ({ ...f, nombre: e.target.value }))} autoFocus className="w-full px-3 py-2 rounded-lg text-sm" style={{ backgroundColor: theme.background, color: theme.text, border: `1px solid ${theme.border}` }} />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: theme.textSecondary }}>Tipo *</label>
            <ModernSelect
              value={form.tipo_concepto_id ? String(form.tipo_concepto_id) : ''}
              onChange={(v) => setForm(f => ({ ...f, tipo_concepto_id: parseInt(v, 10) }))}
              options={tipos.map(t => ({ value: String(t.id), label: t.nombre, color: t.color || undefined }))}
              placeholder="Elegir tipo..."
              searchable
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: theme.textSecondary }}>Descripción</label>
            <textarea value={form.descripcion} onChange={(e) => setForm(f => ({ ...f, descripcion: e.target.value }))} rows={2} className="w-full px-3 py-2 rounded-lg text-sm" style={{ backgroundColor: theme.background, color: theme.text, border: `1px solid ${theme.border}` }} />
          </div>
        </div>
      </Sheet>
    </>
  );
}
