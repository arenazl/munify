import { useEffect, useMemo, useState } from 'react';
import {
  Wallet, Tag, FileText, Briefcase, Plus, Edit2, Trash2, Loader2, ArrowLeft,
  Users, PiggyBank, TrendingUp, TrendingDown, MapPin,
} from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useTheme } from '../contexts/ThemeContext';
import { PrimaryButton } from '../components/ui/PrimaryButton';
import { useAuth } from '../contexts/AuthContext';
import { ModernSelect } from '../components/ui/ModernSelect';
import { DynamicIcon } from '../components/ui/DynamicIcon';
import { Sheet } from '../components/ui/Sheet';
import { PolygonDrawer } from '../components/tesoreria/PolygonDrawer';
import { tiposConceptoApi, conceptosAbmApi, tiposEmpleadoApi, cajasApi, parajesApi } from '../lib/api';
import type { TipoConcepto, Concepto, TipoEmpleadoCatalogo, Caja, Paraje } from '../types';
import TesoreriaProyectos from './TesoreriaProyectos';

type Tab = 'conceptos' | 'tipos-empleado' | 'cajas' | 'parajes' | 'proyectos';

export default function ConfiguracionTesoreria() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  // 'tipos' eliminado del selector (los tipos siguen existiendo en DB
  // pero ya no se gestionan desde acá — el ABM es solo de conceptos planos).
  const requested = searchParams.get('tab') as string | null;
  const initialTab: Tab = (requested && ['conceptos','tipos-empleado','cajas','parajes','proyectos'].includes(requested))
    ? (requested as Tab)
    : 'conceptos';
  const [tab, setTabState] = useState<Tab>(initialTab);
  const setTab = (t: Tab) => {
    setTabState(t);
    setSearchParams({ tab: t }, { replace: true });
  };

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

      {/* Tabs — tipos eliminado, conceptos quedan planos */}
      <div className="flex gap-1 border-b" style={{ borderColor: theme.border }}>
        {([
          { id: 'conceptos', label: 'Conceptos', icon: <FileText className="h-4 w-4" /> },
          { id: 'tipos-empleado', label: 'Tipos de empleado', icon: <Users className="h-4 w-4" /> },
          { id: 'cajas', label: 'Cajas / Fondos', icon: <PiggyBank className="h-4 w-4" /> },
          { id: 'parajes', label: 'Parajes', icon: <MapPin className="h-4 w-4" /> },
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
        {tab === 'conceptos' && <ConceptosTab />}
        {tab === 'tipos-empleado' && <TiposEmpleadoTab />}
        {tab === 'cajas' && <CajasTab />}
        {tab === 'parajes' && <ParajesTab />}
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
            <PrimaryButton onClick={save} disabled={saving} size="md">
              {saving ? 'Guardando...' : (editing ? 'Guardar cambios' : 'Crear')}
            </PrimaryButton>
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
  const [conceptos, setConceptos] = useState<Concepto[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Concepto | null>(null);
  const [form, setForm] = useState({ nombre: '', descripcion: '', orden: 0 });
  const [saving, setSaving] = useState(false);
  // El backend exige tipo_concepto_id no-null (todavia). Resolvemos el tipo
  // "General" del muni y se lo enviamos automaticamente en cada create.
  const [generalTipoId, setGeneralTipoId] = useState<number | null>(null);

  const fetch = async () => {
    setLoading(true);
    try {
      const [tiposRes, conceptosRes] = await Promise.all([
        tiposConceptoApi.list({ activo: true }),
        conceptosAbmApi.list({ activo: true }),
      ]);
      const tipos = (tiposRes.data || []) as TipoConcepto[];
      const general = tipos.find(t => t.nombre.toLowerCase() === 'general');
      setGeneralTipoId(general ? general.id : (tipos[0]?.id ?? null));
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
      if (s && !c.nombre.toLowerCase().includes(s) && !(c.descripcion || '').toLowerCase().includes(s)) return false;
      return true;
    });
  }, [conceptos, search]);

  const openSheet = (c: Concepto | null = null) => {
    if (c) {
      setEditing(c);
      setForm({ nombre: c.nombre, descripcion: c.descripcion || '', orden: c.orden });
    } else {
      setEditing(null);
      setForm({ nombre: '', descripcion: '', orden: 0 });
    }
    setSheetOpen(true);
  };

  const save = async () => {
    if (!form.nombre.trim()) return toast.error('Nombre requerido');
    if (!generalTipoId) return toast.error('Configuracion: falta tipo General. Recargá la página.');
    setSaving(true);
    try {
      const payload = {
        nombre: form.nombre.trim(),
        descripcion: form.descripcion.trim() || null,
        orden: form.orden,
        tipo_concepto_id: generalTipoId,
      };
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

  if (loading) return <div className="p-6 flex justify-center"><Loader2 className="h-6 w-6 animate-spin" style={{ color: theme.primary }} /></div>;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 mb-3">
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
        >
          <Plus className="h-4 w-4" /> Nuevo concepto
        </button>
      </div>

      <div className="rounded-xl overflow-hidden" style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ backgroundColor: theme.backgroundSecondary }}>
              <th className="text-left px-3 py-2 text-[11px] font-semibold uppercase tracking-wide" style={{ color: theme.textSecondary }}>Concepto</th>
              <th className="text-left px-3 py-2 text-[11px] font-semibold uppercase tracking-wide w-24" style={{ color: theme.textSecondary }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={2} className="text-center p-6" style={{ color: theme.textSecondary }}>
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
            <PrimaryButton onClick={save} disabled={saving} size="md">
              {saving ? 'Guardando...' : (editing ? 'Guardar cambios' : 'Crear')}
            </PrimaryButton>
          </div>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: theme.textSecondary }}>Nombre *</label>
            <input value={form.nombre} onChange={(e) => setForm(f => ({ ...f, nombre: e.target.value }))} autoFocus className="w-full px-3 py-2 rounded-lg text-sm" style={{ backgroundColor: theme.background, color: theme.text, border: `1px solid ${theme.border}` }} />
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

// ============================================================
// Tab: Tipos de empleado (sub-clasificacion de contactos tipo=empleado)
// ============================================================
function TiposEmpleadoTab() {
  const { theme } = useTheme();
  const [tipos, setTipos] = useState<TipoEmpleadoCatalogo[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<TipoEmpleadoCatalogo | null>(null);
  const [form, setForm] = useState({ nombre: '', descripcion: '', color: '#3b82f6', icono: 'Briefcase', orden: 0 });
  const [saving, setSaving] = useState(false);

  const fetch = async () => {
    setLoading(true);
    try {
      const res = await tiposEmpleadoApi.list({ activo: true });
      setTipos(res.data || []);
    } catch { toast.error('Error cargando tipos'); } finally { setLoading(false); }
  };
  useEffect(() => { fetch(); }, []);

  const openSheet = (t: TipoEmpleadoCatalogo | null = null) => {
    if (t) {
      setEditing(t);
      setForm({ nombre: t.nombre, descripcion: t.descripcion || '', color: t.color || '#3b82f6', icono: t.icono || 'Briefcase', orden: t.orden });
    } else {
      setEditing(null);
      setForm({ nombre: '', descripcion: '', color: '#3b82f6', icono: 'Briefcase', orden: tipos.length });
    }
    setSheetOpen(true);
  };

  const save = async () => {
    if (!form.nombre.trim()) return toast.error('Nombre requerido');
    setSaving(true);
    try {
      const payload = { ...form, nombre: form.nombre.trim(), descripcion: form.descripcion.trim() || null };
      if (editing) await tiposEmpleadoApi.update(editing.id, payload);
      else await tiposEmpleadoApi.create(payload);
      toast.success(editing ? 'Actualizado' : 'Creado');
      setSheetOpen(false); fetch();
    } catch (e: any) { toast.error(e?.response?.data?.detail || 'Error'); } finally { setSaving(false); }
  };

  const handleDelete = async (t: TipoEmpleadoCatalogo) => {
    if (!confirm(`¿Eliminar "${t.nombre}"?`)) return;
    try { await tiposEmpleadoApi.delete(t.id); toast.success('Eliminado'); fetch(); }
    catch { toast.error('Error'); }
  };

  if (loading) return <div className="p-6 flex justify-center"><Loader2 className="h-6 w-6 animate-spin" style={{ color: theme.primary }} /></div>;

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs" style={{ color: theme.textSecondary }}>
          {tipos.length} tipos. Sub-clasificación de los contactos tipo "empleado" (albañil, MMO, arquitecto, etc).
        </p>
        <PrimaryButton onClick={() => openSheet()} icon={<Plus className="h-4 w-4" />}>
          Nuevo tipo
        </PrimaryButton>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {tipos.map(t => (
          <div key={t.id} onClick={() => openSheet(t)} className="rounded-xl p-3 cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-md" style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}>
            <div className="flex items-start gap-2.5">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${t.color || theme.primary}20` }}>
                <DynamicIcon name={t.icono || 'Briefcase'} size={20} color={t.color || theme.primary} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate" style={{ color: theme.text }}>{t.nombre}</p>
                {t.descripcion && <p className="text-[11px] truncate" style={{ color: theme.textSecondary }}>{t.descripcion}</p>}
                <p className="text-[10px] mt-0.5" style={{ color: t.color || theme.primary }}>{t.cantidad_empleados ?? 0} empleados</p>
              </div>
              <div className="flex flex-col gap-1">
                <button onClick={(e) => { e.stopPropagation(); openSheet(t); }} className="p-1 rounded hover:scale-110" style={{ color: theme.primary }}><Edit2 className="h-3.5 w-3.5" /></button>
                <button onClick={(e) => { e.stopPropagation(); handleDelete(t); }} className="p-1 rounded hover:scale-110" style={{ color: '#ef4444' }}><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Sheet
        open={sheetOpen} onClose={() => setSheetOpen(false)}
        title={editing ? `Editar · ${editing.nombre}` : 'Nuevo tipo de empleado'}
        footer={
          <div className="flex justify-end gap-2">
            <button onClick={() => setSheetOpen(false)} className="px-3 py-2 rounded-lg text-sm" style={{ backgroundColor: theme.backgroundSecondary, color: theme.text }}>Cancelar</button>
            <PrimaryButton onClick={save} disabled={saving} size="md">
              {saving ? 'Guardando...' : (editing ? 'Guardar' : 'Crear')}
            </PrimaryButton>
          </div>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: theme.textSecondary }}>Nombre *</label>
            <input value={form.nombre} onChange={(e) => setForm(f => ({ ...f, nombre: e.target.value }))} autoFocus className="w-full px-3 py-2 rounded-lg text-sm" style={{ backgroundColor: theme.background, color: theme.text, border: `1px solid ${theme.border}` }} />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: theme.textSecondary }}>Descripción</label>
            <textarea value={form.descripcion} onChange={(e) => setForm(f => ({ ...f, descripcion: e.target.value }))} rows={2} className="w-full px-3 py-2 rounded-lg text-sm" style={{ backgroundColor: theme.background, color: theme.text, border: `1px solid ${theme.border}` }} />
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
// Tab: Cajas / Fondos
// ============================================================
function CajasTab() {
  const { theme } = useTheme();
  const [cajas, setCajas] = useState<Caja[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Caja | null>(null);
  const [form, setForm] = useState({ nombre: '', codigo: '', descripcion: '', color: '#3b82f6', icono: 'PiggyBank', saldo_inicial: '0', orden: 0 });
  const [saving, setSaving] = useState(false);
  // Agregar fondos (ingreso) + historial de movimientos
  const [fondosSheetOpen, setFondosSheetOpen] = useState(false);
  const [fondosCaja, setFondosCaja] = useState<Caja | null>(null);
  const [fondosForm, setFondosForm] = useState({ tipo: 'ingreso' as 'ingreso' | 'egreso', monto: '', concepto: '', fecha: new Date().toISOString().slice(0, 10), descripcion: '' });
  const [fondosMovimientos, setFondosMovimientos] = useState<any[]>([]);
  const [fondosLoadingMov, setFondosLoadingMov] = useState(false);
  const [fondosSaving, setFondosSaving] = useState(false);

  const fetch = async () => {
    setLoading(true);
    try {
      const res = await cajasApi.list({ activo: true, include_saldos: true });
      setCajas(res.data || []);
    } catch { toast.error('Error cargando cajas'); } finally { setLoading(false); }
  };
  useEffect(() => { fetch(); }, []);

  const openSheet = (c: Caja | null = null) => {
    if (c) {
      setEditing(c);
      setForm({
        nombre: c.nombre, codigo: c.codigo || '', descripcion: c.descripcion || '',
        color: c.color || '#3b82f6', icono: c.icono || 'PiggyBank',
        saldo_inicial: String(c.saldo_inicial), orden: c.orden,
      });
    } else {
      setEditing(null);
      setForm({ nombre: '', codigo: '', descripcion: '', color: '#3b82f6', icono: 'PiggyBank', saldo_inicial: '0', orden: cajas.length });
    }
    setSheetOpen(true);
  };

  const save = async () => {
    if (!form.nombre.trim()) return toast.error('Nombre requerido');
    setSaving(true);
    try {
      const payload = {
        nombre: form.nombre.trim(),
        codigo: form.codigo.trim() || null,
        descripcion: form.descripcion.trim() || null,
        color: form.color, icono: form.icono,
        saldo_inicial: parseFloat(form.saldo_inicial) || 0,
        orden: form.orden,
      };
      if (editing) await cajasApi.update(editing.id, payload);
      else await cajasApi.create(payload);
      toast.success(editing ? 'Actualizada' : 'Creada');
      setSheetOpen(false); fetch();
    } catch (e: any) { toast.error(e?.response?.data?.detail || 'Error'); } finally { setSaving(false); }
  };

  const handleDelete = async (c: Caja) => {
    if (!confirm(`¿Eliminar "${c.nombre}"?`)) return;
    try { await cajasApi.delete(c.id); toast.success('Eliminada'); fetch(); }
    catch { toast.error('Error'); }
  };

  const fmt = (v?: string | null) => v ? `$${parseFloat(v).toLocaleString('es-AR', { maximumFractionDigits: 0 })}` : '$0';

  const openFondos = async (c: Caja) => {
    setFondosCaja(c);
    setFondosForm({ tipo: 'ingreso', monto: '', concepto: '', fecha: new Date().toISOString().slice(0, 10), descripcion: '' });
    setFondosSheetOpen(true);
    setFondosLoadingMov(true);
    try {
      const res = await cajasApi.listMovimientos(c.id, { limit: 50 });
      setFondosMovimientos(res.data || []);
    } catch {
      setFondosMovimientos([]);
    } finally {
      setFondosLoadingMov(false);
    }
  };

  const guardarFondos = async () => {
    if (!fondosCaja) return;
    const monto = parseFloat(fondosForm.monto);
    if (!monto || monto <= 0) return toast.error('Monto invalido');
    if (!fondosForm.concepto.trim()) return toast.error('Concepto requerido');
    setFondosSaving(true);
    try {
      await cajasApi.createMovimiento({
        caja_id: fondosCaja.id,
        tipo: fondosForm.tipo,
        monto,
        concepto: fondosForm.concepto.trim(),
        fecha: fondosForm.fecha,
        descripcion: fondosForm.descripcion.trim() || null,
      });
      toast.success(fondosForm.tipo === 'ingreso' ? 'Fondos agregados' : 'Egreso registrado');
      // Refresh historial + cajas (para que se actualice el saldo)
      const [mov, c] = await Promise.all([
        cajasApi.listMovimientos(fondosCaja.id, { limit: 50 }),
        cajasApi.list({ activo: true, include_saldos: true }),
      ]);
      setFondosMovimientos(mov.data || []);
      setCajas(c.data || []);
      setFondosForm({ tipo: 'ingreso', monto: '', concepto: '', fecha: new Date().toISOString().slice(0, 10), descripcion: '' });
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Error guardando');
    } finally {
      setFondosSaving(false);
    }
  };

  const eliminarMovimiento = async (movId: number) => {
    if (!fondosCaja) return;
    if (!confirm('¿Eliminar este movimiento?')) return;
    try {
      await cajasApi.deleteMovimiento(movId);
      toast.success('Movimiento eliminado');
      const [mov, c] = await Promise.all([
        cajasApi.listMovimientos(fondosCaja.id, { limit: 50 }),
        cajasApi.list({ activo: true, include_saldos: true }),
      ]);
      setFondosMovimientos(mov.data || []);
      setCajas(c.data || []);
    } catch {
      toast.error('Error eliminando');
    }
  };

  if (loading) return <div className="p-6 flex justify-center"><Loader2 className="h-6 w-6 animate-spin" style={{ color: theme.primary }} /></div>;

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs" style={{ color: theme.textSecondary }}>
          {cajas.length} cajas. De acá se descuentan los gastos. Los ingresos suman saldo.
        </p>
        <PrimaryButton onClick={() => openSheet()} icon={<Plus className="h-4 w-4" />}>
          Nueva caja
        </PrimaryButton>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {cajas.map(c => {
          const color = c.color || theme.primary;
          return (
            <div key={c.id} onClick={() => openSheet(c)} className="rounded-xl p-4 cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-md" style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}>
              <div className="flex items-start gap-3 mb-3">
                <div className="w-11 h-11 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${color}20` }}>
                  <DynamicIcon name={c.icono || 'PiggyBank'} size={22} color={color} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm truncate" style={{ color: theme.text }}>{c.nombre}</p>
                  {c.codigo && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ backgroundColor: `${color}15`, color }}>{c.codigo}</span>}
                </div>
                <div className="flex flex-col gap-1">
                  <button
                    onClick={(e) => { e.stopPropagation(); openFondos(c); }}
                    className="p-1 rounded hover:scale-110"
                    style={{ color: '#10b981' }}
                    title="Agregar fondos / ver historial"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); openSheet(c); }} className="p-1 rounded hover:scale-110" style={{ color: theme.primary }}><Edit2 className="h-3.5 w-3.5" /></button>
                  <button onClick={(e) => { e.stopPropagation(); handleDelete(c); }} className="p-1 rounded hover:scale-110" style={{ color: '#ef4444' }}><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
              {c.descripcion && <p className="text-[11px] mb-2 line-clamp-2" style={{ color: theme.textSecondary }}>{c.descripcion}</p>}
              <div className="space-y-1">
                <div className="text-[10px] uppercase font-semibold" style={{ color: theme.textSecondary }}>Saldo actual</div>
                <div className="text-xl font-bold tabular-nums" style={{ color }}>{fmt(c.saldo_actual)}</div>
                <div className="flex items-center gap-3 text-[10px] mt-1.5" style={{ color: theme.textSecondary }}>
                  <span className="inline-flex items-center gap-1"><TrendingUp className="h-2.5 w-2.5" style={{ color: '#10b981' }} /> {fmt(c.total_ingresos)}</span>
                  <span className="inline-flex items-center gap-1"><TrendingDown className="h-2.5 w-2.5" style={{ color: '#ef4444' }} /> {fmt(c.total_egresos)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <Sheet
        open={sheetOpen} onClose={() => setSheetOpen(false)}
        title={editing ? `Editar · ${editing.nombre}` : 'Nueva caja / fondo'}
        footer={
          <div className="flex justify-end gap-2">
            <button onClick={() => setSheetOpen(false)} className="px-3 py-2 rounded-lg text-sm" style={{ backgroundColor: theme.backgroundSecondary, color: theme.text }}>Cancelar</button>
            <PrimaryButton onClick={save} disabled={saving} size="md">
              {saving ? 'Guardando...' : (editing ? 'Guardar' : 'Crear')}
            </PrimaryButton>
          </div>
        }
      >
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-semibold mb-1" style={{ color: theme.textSecondary }}>Nombre *</label>
              <input value={form.nombre} onChange={(e) => setForm(f => ({ ...f, nombre: e.target.value }))} autoFocus className="w-full px-3 py-2 rounded-lg text-sm" style={{ backgroundColor: theme.background, color: theme.text, border: `1px solid ${theme.border}` }} placeholder="Ej: Tesoro propio" />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: theme.textSecondary }}>Código</label>
              <input value={form.codigo} onChange={(e) => setForm(f => ({ ...f, codigo: e.target.value.toUpperCase() }))} className="w-full px-3 py-2 rounded-lg text-sm font-mono" style={{ backgroundColor: theme.background, color: theme.text, border: `1px solid ${theme.border}` }} placeholder="FOFINDE" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: theme.textSecondary }}>Descripción</label>
            <textarea value={form.descripcion} onChange={(e) => setForm(f => ({ ...f, descripcion: e.target.value }))} rows={2} className="w-full px-3 py-2 rounded-lg text-sm" style={{ backgroundColor: theme.background, color: theme.text, border: `1px solid ${theme.border}` }} />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: theme.textSecondary }}>Saldo inicial</label>
            <input type="number" value={form.saldo_inicial} onChange={(e) => setForm(f => ({ ...f, saldo_inicial: e.target.value }))} className="w-full px-3 py-2 rounded-lg text-sm tabular-nums" style={{ backgroundColor: theme.background, color: theme.text, border: `1px solid ${theme.border}` }} />
            <p className="text-[10px] mt-1" style={{ color: theme.textSecondary }}>Saldo de apertura. Después se ajusta con ingresos y egresos.</p>
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
              <label className="block text-xs font-semibold mb-1" style={{ color: theme.textSecondary }}>Icono</label>
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

      {/* Sheet: agregar fondos + historial de movimientos */}
      <Sheet
        open={fondosSheetOpen}
        onClose={() => setFondosSheetOpen(false)}
        title={fondosCaja ? `Fondos · ${fondosCaja.nombre}` : 'Fondos'}
        footer={
          <div className="flex justify-end gap-2">
            <button onClick={() => setFondosSheetOpen(false)} className="px-3 py-2 rounded-lg text-sm" style={{ backgroundColor: theme.backgroundSecondary, color: theme.text }}>
              Cerrar
            </button>
            <button onClick={guardarFondos} disabled={fondosSaving} className="px-3 py-2 rounded-lg text-sm font-semibold text-white inline-flex items-center gap-2" style={{ backgroundColor: fondosForm.tipo === 'ingreso' ? '#10b981' : '#ef4444', opacity: fondosSaving ? 0.7 : 1 }}>
              {fondosSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              {fondosForm.tipo === 'ingreso' ? 'Agregar fondos' : 'Registrar egreso'}
            </button>
          </div>
        }
      >
        {fondosCaja && (
          <div className="space-y-4">
            {/* Saldo actual destacado */}
            <div className="rounded-xl p-3 flex items-center justify-between" style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}` }}>
              <div>
                <div className="text-[10px] uppercase font-semibold" style={{ color: theme.textSecondary }}>Saldo actual</div>
                <div className="text-2xl font-bold tabular-nums" style={{ color: fondosCaja.color || theme.primary }}>{fmt(fondosCaja.saldo_actual)}</div>
              </div>
              <div className="flex flex-col items-end text-[11px]" style={{ color: theme.textSecondary }}>
                <span className="inline-flex items-center gap-1"><TrendingUp className="h-3 w-3" style={{ color: '#10b981' }} /> {fmt(fondosCaja.total_ingresos)}</span>
                <span className="inline-flex items-center gap-1"><TrendingDown className="h-3 w-3" style={{ color: '#ef4444' }} /> {fmt(fondosCaja.total_egresos)}</span>
              </div>
            </div>

            {/* Form alta de movimiento */}
            <div className="rounded-xl p-3 space-y-3" style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}>
              <div className="grid grid-cols-2 gap-2">
                {(['ingreso', 'egreso'] as const).map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setFondosForm(f => ({ ...f, tipo: t }))}
                    className="px-3 py-2 rounded-lg text-xs font-bold capitalize transition-all"
                    style={{
                      backgroundColor: fondosForm.tipo === t ? (t === 'ingreso' ? '#10b981' : '#ef4444') : theme.backgroundSecondary,
                      color: fondosForm.tipo === t ? '#fff' : theme.text,
                      border: `2px solid ${fondosForm.tipo === t ? (t === 'ingreso' ? '#10b981' : '#ef4444') : 'transparent'}`,
                    }}
                  >
                    {t === 'ingreso' ? 'Ingreso (sumar)' : 'Egreso (restar)'}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: theme.textSecondary }}>Monto *</label>
                  <input type="number" value={fondosForm.monto} onChange={(e) => setFondosForm(f => ({ ...f, monto: e.target.value }))} className="w-full px-3 py-2 rounded-lg text-sm tabular-nums" style={{ backgroundColor: theme.background, color: theme.text, border: `1px solid ${theme.border}` }} placeholder="500000" />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: theme.textSecondary }}>Fecha</label>
                  <input type="date" value={fondosForm.fecha} onChange={(e) => setFondosForm(f => ({ ...f, fecha: e.target.value }))} className="w-full px-3 py-2 rounded-lg text-sm" style={{ backgroundColor: theme.background, color: theme.text, border: `1px solid ${theme.border}` }} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: theme.textSecondary }}>Concepto *</label>
                <input value={fondosForm.concepto} onChange={(e) => setFondosForm(f => ({ ...f, concepto: e.target.value }))} className="w-full px-3 py-2 rounded-lg text-sm" style={{ backgroundColor: theme.background, color: theme.text, border: `1px solid ${theme.border}` }} placeholder="Ej: Aporte coparticipación abril" />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: theme.textSecondary }}>Descripción</label>
                <textarea value={fondosForm.descripcion} onChange={(e) => setFondosForm(f => ({ ...f, descripcion: e.target.value }))} rows={2} className="w-full px-3 py-2 rounded-lg text-sm" style={{ backgroundColor: theme.background, color: theme.text, border: `1px solid ${theme.border}` }} />
              </div>
            </div>

            {/* Historial */}
            <div>
              <p className="text-xs font-semibold uppercase mb-2" style={{ color: theme.textSecondary }}>
                Historial ({fondosMovimientos.length})
              </p>
              {fondosLoadingMov ? (
                <div className="p-4 flex justify-center"><Loader2 className="h-4 w-4 animate-spin" style={{ color: theme.primary }} /></div>
              ) : fondosMovimientos.length === 0 ? (
                <p className="text-xs text-center py-4" style={{ color: theme.textSecondary }}>Sin movimientos.</p>
              ) : (
                <div className="space-y-1.5">
                  {fondosMovimientos.map(m => {
                    const esIngreso = m.tipo === 'ingreso';
                    return (
                      <div key={m.id} className="flex items-center gap-2 p-2 rounded-lg" style={{ backgroundColor: theme.backgroundSecondary }}>
                        <div className="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0" style={{ backgroundColor: esIngreso ? '#10b98120' : '#ef444420' }}>
                          {esIngreso ? <TrendingUp className="h-4 w-4" style={{ color: '#10b981' }} /> : <TrendingDown className="h-4 w-4" style={{ color: '#ef4444' }} />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold truncate" style={{ color: theme.text }}>{m.concepto}</p>
                          <p className="text-[10px]" style={{ color: theme.textSecondary }}>{new Date(m.fecha).toLocaleDateString('es-AR')}</p>
                        </div>
                        <span className="font-bold tabular-nums text-sm whitespace-nowrap" style={{ color: esIngreso ? '#10b981' : '#ef4444' }}>
                          {esIngreso ? '+' : '−'} {fmt(m.monto)}
                        </span>
                        <button onClick={() => eliminarMovimiento(m.id)} className="p-1 rounded hover:scale-110" style={{ color: '#ef4444' }} title="Eliminar"><Trash2 className="h-3 w-3" /></button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </Sheet>
    </>
  );
}

// ============================================================
// Tab: Parajes (regiones del muni con poligono en el mapa)
// ============================================================
function ParajesTab() {
  const { theme } = useTheme();
  const [parajes, setParajes] = useState<Paraje[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Paraje | null>(null);
  const [form, setForm] = useState({
    nombre: '', descripcion: '', color: '#10b981', icono: 'MapPin',
    poligono: [] as number[][], orden: 0,
  });
  const [saving, setSaving] = useState(false);

  const fetchParajes = async () => {
    setLoading(true);
    try {
      const res = await parajesApi.list({ activo: true, include_count: true });
      setParajes(res.data || []);
    } catch { toast.error('Error cargando parajes'); } finally { setLoading(false); }
  };
  useEffect(() => { fetchParajes(); }, []);

  const openSheet = (p: Paraje | null = null) => {
    if (p) {
      setEditing(p);
      setForm({
        nombre: p.nombre, descripcion: p.descripcion || '',
        color: p.color || '#10b981', icono: p.icono || 'MapPin',
        poligono: p.poligono || [], orden: p.orden,
      });
    } else {
      setEditing(null);
      setForm({ nombre: '', descripcion: '', color: '#10b981', icono: 'MapPin', poligono: [], orden: parajes.length });
    }
    setSheetOpen(true);
  };

  const save = async () => {
    if (!form.nombre.trim()) return toast.error('Nombre requerido');
    if (form.poligono.length > 0 && form.poligono.length < 3) {
      return toast.error('El polígono necesita al menos 3 vértices (o ninguno)');
    }
    setSaving(true);
    try {
      const payload = {
        nombre: form.nombre.trim(),
        descripcion: form.descripcion.trim() || null,
        color: form.color, icono: form.icono,
        poligono: form.poligono.length >= 3 ? form.poligono : null,
        orden: form.orden,
      };
      if (editing) await parajesApi.update(editing.id, payload);
      else await parajesApi.create(payload);
      toast.success(editing ? 'Paraje actualizado' : 'Paraje creado');
      setSheetOpen(false); fetchParajes();
    } catch (e: any) { toast.error(e?.response?.data?.detail || 'Error'); } finally { setSaving(false); }
  };

  const handleDelete = async (p: Paraje) => {
    if (!confirm(`¿Eliminar "${p.nombre}"? Los contactos asignados pasan a "Sin paraje".`)) return;
    try { await parajesApi.delete(p.id); toast.success('Eliminado'); fetchParajes(); }
    catch { toast.error('Error'); }
  };

  if (loading) return <div className="p-6 flex justify-center"><Loader2 className="h-6 w-6 animate-spin" style={{ color: theme.primary }} /></div>;

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs" style={{ color: theme.textSecondary }}>
          {parajes.length} parajes. Regiones del muni (Santa Rita, Los Álamos, etc). Al crear un contacto podés elegir un paraje en lugar de cargar la dirección exacta.
        </p>
        <PrimaryButton onClick={() => openSheet()} icon={<Plus className="h-4 w-4" />}>
          Nuevo paraje
        </PrimaryButton>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {parajes.map(p => {
          const c = p.color || theme.primary;
          return (
            <div key={p.id} onClick={() => openSheet(p)} className="rounded-xl p-3 cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-md" style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}>
              <div className="flex items-start gap-2.5">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${c}20` }}>
                  <DynamicIcon name={p.icono || 'MapPin'} size={20} color={c} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate" style={{ color: theme.text }}>{p.nombre}</p>
                  {p.descripcion && <p className="text-[11px] truncate" style={{ color: theme.textSecondary }}>{p.descripcion}</p>}
                  <div className="flex items-center gap-2 text-[10px] mt-0.5">
                    <span style={{ color: c }}>{p.cantidad_contactos ?? 0} contactos</span>
                    {p.poligono && p.poligono.length >= 3 ? (
                      <span className="px-1.5 py-0.5 rounded" style={{ backgroundColor: `${c}15`, color: c }}>{p.poligono.length} vértices</span>
                    ) : (
                      <span className="opacity-60" style={{ color: theme.textSecondary }}>sin polígono</span>
                    )}
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <button onClick={(e) => { e.stopPropagation(); openSheet(p); }} className="p-1 rounded hover:scale-110" style={{ color: theme.primary }}><Edit2 className="h-3.5 w-3.5" /></button>
                  <button onClick={(e) => { e.stopPropagation(); handleDelete(p); }} className="p-1 rounded hover:scale-110" style={{ color: '#ef4444' }}><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <Sheet
        open={sheetOpen} onClose={() => setSheetOpen(false)}
        title={editing ? `Editar · ${editing.nombre}` : 'Nuevo paraje'}
        footer={
          <div className="flex justify-end gap-2">
            <button onClick={() => setSheetOpen(false)} className="px-3 py-2 rounded-lg text-sm" style={{ backgroundColor: theme.backgroundSecondary, color: theme.text }}>Cancelar</button>
            <PrimaryButton onClick={save} disabled={saving} size="md">
              {saving ? 'Guardando...' : (editing ? 'Guardar' : 'Crear')}
            </PrimaryButton>
          </div>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: theme.textSecondary }}>Nombre *</label>
            <input value={form.nombre} onChange={(e) => setForm(f => ({ ...f, nombre: e.target.value }))} autoFocus className="w-full px-3 py-2 rounded-lg text-sm" style={{ backgroundColor: theme.background, color: theme.text, border: `1px solid ${theme.border}` }} placeholder='Ej: "Paraje Santa Rita"' />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: theme.textSecondary }}>Descripción</label>
            <textarea value={form.descripcion} onChange={(e) => setForm(f => ({ ...f, descripcion: e.target.value }))} rows={2} className="w-full px-3 py-2 rounded-lg text-sm" style={{ backgroundColor: theme.background, color: theme.text, border: `1px solid ${theme.border}` }} />
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
              <label className="block text-xs font-semibold mb-1" style={{ color: theme.textSecondary }}>Icono</label>
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${form.color}20`, border: `1px solid ${theme.border}` }}>
                  <DynamicIcon name={form.icono} size={20} color={form.color} />
                </div>
                <input type="text" value={form.icono} onChange={(e) => setForm(f => ({ ...f, icono: e.target.value }))} className="flex-1 px-3 py-2 rounded-lg text-sm font-mono" style={{ backgroundColor: theme.background, color: theme.text, border: `1px solid ${theme.border}` }} />
              </div>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: theme.textSecondary }}>
              Polígono en el mapa <span className="opacity-60">(opcional, mínimo 3 vértices)</span>
            </label>
            <PolygonDrawer
              value={form.poligono}
              onChange={(coords) => setForm(f => ({ ...f, poligono: coords }))}
              color={form.color}
              centro={form.poligono.length > 0 ? [form.poligono[0][0], form.poligono[0][1]] : undefined}
            />
          </div>
        </div>
      </Sheet>
    </>
  );
}

