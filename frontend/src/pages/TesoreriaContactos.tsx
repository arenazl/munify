import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Plus, Upload, MapPin, Phone, Mail, Search, Users, Trash2, Edit2, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { TesoreriaHint } from '../components/tesoreria/TesoreriaHint';
import { ModernSelect } from '../components/ui/ModernSelect';
import { contactosApi, tesoreriaImportApi, api } from '../lib/api';
import type { Contacto, TipoContacto } from '../types';

const TIPO_LABELS: Record<TipoContacto, string> = {
  concejal: 'Concejal',
  empleado: 'Empleado',
  profesional: 'Profesional',
  proveedor: 'Proveedor',
  contratista: 'Contratista',
  beneficiario: 'Beneficiario',
  otro: 'Otro',
};

const TIPO_COLORS: Record<TipoContacto, string> = {
  concejal: '#8b5cf6',
  empleado: '#3b82f6',
  profesional: '#f59e0b',
  proveedor: '#10b981',
  contratista: '#06b6d4',
  beneficiario: '#ec4899',
  otro: '#71717a',
};

export default function TesoreriaContactos() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const [contactos, setContactos] = useState<Contacto[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tipoFiltro, setTipoFiltro] = useState<TipoContacto | ''>('');

  // Form crear contacto
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<Partial<Contacto>>({
    nombre: '', apellido: '', tipo: 'beneficiario',
  });
  const [editingId, setEditingId] = useState<number | null>(null);

  // Import modals
  const [importing, setImporting] = useState<'excel' | 'kmz' | null>(null);

  // Reverse geocoding state (al ingresar lat/lon manual, autocompleta direccion)
  const [reverseLoading, setReverseLoading] = useState(false);
  const reverseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reverseGeocode = (lat: number, lon: number) => {
    if (reverseTimeoutRef.current) clearTimeout(reverseTimeoutRef.current);
    reverseTimeoutRef.current = setTimeout(async () => {
      setReverseLoading(true);
      try {
        const res = await api.get('/geocoding/reverse', { params: { lat, lon } });
        const addr = res.data.address;
        let direccion = '';
        if (addr) {
          const parts: string[] = [];
          if (addr.road) {
            parts.push(addr.house_number ? `${addr.road} ${addr.house_number}` : addr.road);
          }
          const loc = addr.neighbourhood || addr.suburb || addr.village || addr.town || addr.city;
          if (loc) parts.push(loc);
          direccion = parts.join(', ');
        }
        if (!direccion && res.data.display_name) {
          direccion = res.data.display_name.split(', ').slice(0, 3).join(', ');
        }
        if (direccion) {
          setForm(prev => ({ ...prev, direccion }));
          toast.success('Dirección detectada');
        }
      } catch {
        // silencioso — el campo de dirección queda como lo dejó el usuario
      } finally {
        setReverseLoading(false);
      }
    }, 600);
  };

  if (user && user.rol !== 'admin' && user.rol !== 'supervisor') {
    return <p className="p-6 text-sm">Sin permisos.</p>;
  }

  const fetch = async () => {
    setLoading(true);
    try {
      const res = await contactosApi.list({ limit: 500, search: search || undefined, tipo: tipoFiltro || undefined });
      setContactos(res.data);
    } catch { toast.error('Error cargando contactos'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetch(); }, [tipoFiltro]);
  useEffect(() => { const t = setTimeout(fetch, 400); return () => clearTimeout(t); }, [search]);

  const grouped = useMemo(() => {
    const out: Record<string, Contacto[]> = {};
    for (const c of contactos) {
      const k = c.tipo;
      (out[k] = out[k] || []).push(c);
    }
    return out;
  }, [contactos]);

  const handleSave = async () => {
    if (!form.nombre?.trim()) return toast.error('Nombre requerido');
    try {
      if (editingId) {
        await contactosApi.update(editingId, form as Record<string, unknown>);
        toast.success('Contacto actualizado');
      } else {
        await contactosApi.create(form as Record<string, unknown>);
        toast.success('Contacto creado');
      }
      setFormOpen(false); setEditingId(null);
      setForm({ nombre: '', apellido: '', tipo: 'beneficiario' });
      fetch();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Error guardando');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('¿Eliminar este contacto? (los gastos asociados se conservan)')) return;
    try { await contactosApi.delete(id); toast.success('Eliminado'); fetch(); }
    catch { toast.error('Error eliminando'); }
  };

  const handleImportExcel = async (file: File) => {
    setImporting('excel');
    try {
      const res = await tesoreriaImportApi.excelMatriz(file);
      toast.success(`Importados: ${res.data.contactos_creados} contactos, ${res.data.gastos_creados} gastos`);
      fetch();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Error importando Excel');
    } finally { setImporting(null); }
  };

  const handleImportKmz = async (file: File) => {
    setImporting('kmz');
    try {
      const res = await tesoreriaImportApi.kmz(file);
      toast.success(`Actualizadas ${res.data.actualizados} ubicaciones`);
      fetch();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Error importando KMZ');
    } finally { setImporting(null); }
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <Link to="/gestion/tesoreria" className="text-sm inline-flex items-center gap-1 mb-3" style={{ color: theme.primary }}>
        <ArrowLeft className="h-4 w-4" /> Volver a Tesorería
      </Link>

      <TesoreriaHint titulo="Agenda de Contactos" storageKey="contactos">
        Acá guardás a las personas con las que hacés movimientos: empleados,
        concejales, profesionales, proveedores y beneficiarios de aportes o
        préstamos. Cada uno puede tener su <b>alias de transferencia</b> y
        <b> ubicación en el mapa</b>. Podés cargarlos a mano o importar el
        Excel completo del intendente.
      </TesoreriaHint>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: theme.text }}>
          <Users className="h-6 w-6" /> Contactos
          <span className="text-sm font-normal opacity-70">({contactos.length})</span>
        </h1>
        <div className="flex flex-wrap gap-2">
          <label className="px-4 py-2.5 rounded-xl text-sm font-semibold cursor-pointer flex items-center gap-2 transition-all hover:scale-[1.02]"
            style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}`, color: theme.text }}>
            <Upload className="h-4 w-4" /> {importing === 'excel' ? 'Importando...' : 'Importar Excel'}
            <input type="file" accept=".xlsx" className="hidden" disabled={!!importing}
              onChange={(e) => e.target.files?.[0] && handleImportExcel(e.target.files[0])} />
          </label>
          <label className="px-4 py-2.5 rounded-xl text-sm font-semibold cursor-pointer flex items-center gap-2 transition-all hover:scale-[1.02]"
            style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}`, color: theme.text }}>
            <MapPin className="h-4 w-4" /> {importing === 'kmz' ? 'Importando...' : 'Importar KMZ'}
            <input type="file" accept=".kmz,.kml" className="hidden" disabled={!!importing}
              onChange={(e) => e.target.files?.[0] && handleImportKmz(e.target.files[0])} />
          </label>
          <button type="button" onClick={() => { setFormOpen(true); setEditingId(null); }}
            className="px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-all hover:scale-[1.02]"
            style={{ backgroundColor: theme.primary, color: '#fff' }}>
            <Plus className="h-4 w-4" /> Nuevo
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <button onClick={() => setTipoFiltro('')} className="px-3 py-1.5 rounded-md text-xs font-medium"
          style={{ backgroundColor: tipoFiltro === '' ? theme.primary : 'transparent', color: tipoFiltro === '' ? '#fff' : theme.text, border: `1px solid ${theme.border}` }}>
          Todos
        </button>
        {(Object.keys(TIPO_LABELS) as TipoContacto[]).map(t => (
          <button key={t} onClick={() => setTipoFiltro(t)} className="px-3 py-1.5 rounded-md text-xs font-medium"
            style={{
              backgroundColor: tipoFiltro === t ? TIPO_COLORS[t] : `${TIPO_COLORS[t]}15`,
              color: tipoFiltro === t ? '#fff' : TIPO_COLORS[t],
              border: `1px solid ${TIPO_COLORS[t]}40`,
            }}>
            {TIPO_LABELS[t]}
          </button>
        ))}
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: theme.textSecondary }} />
        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nombre, DNI, alias..."
          className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm"
          style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}`, color: theme.text }} />
      </div>

      {loading ? (
        <p className="text-center py-12" style={{ color: theme.textSecondary }}>Cargando...</p>
      ) : contactos.length === 0 ? (
        <div className="text-center py-16 rounded-xl" style={{ backgroundColor: theme.card, border: `1px dashed ${theme.border}` }}>
          <Users className="h-12 w-12 mx-auto mb-3" style={{ color: theme.textSecondary }} />
          <p className="font-semibold" style={{ color: theme.text }}>No hay contactos cargados</p>
          <p className="text-sm mt-1" style={{ color: theme.textSecondary }}>
            Importá el Excel o agregalos a mano con el botón "Nuevo".
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).map(([tipo, items]) => (
            <div key={tipo}>
              <h2 className="font-semibold mb-2 text-sm uppercase tracking-wider" style={{ color: TIPO_COLORS[tipo as TipoContacto] }}>
                {TIPO_LABELS[tipo as TipoContacto]} ({items.length})
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                {items.map(c => (
                  <div key={c.id} className="rounded-xl p-3 flex items-start justify-between gap-2"
                    style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate" style={{ color: theme.text }}>
                        {c.nombre} {c.apellido || ''}
                      </p>
                      {c.alias_pago && <p className="text-xs truncate" style={{ color: theme.textSecondary }}>{c.alias_pago}</p>}
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {c.telefono && <span className="text-[10px] flex items-center gap-0.5" style={{ color: theme.textSecondary }}><Phone className="h-3 w-3" />{c.telefono}</span>}
                        {c.email && <span className="text-[10px] flex items-center gap-0.5 truncate" style={{ color: theme.textSecondary }}><Mail className="h-3 w-3" />{c.email}</span>}
                        {(c.latitud && c.longitud) && <span className="text-[10px] flex items-center gap-0.5" style={{ color: '#10b981' }}><MapPin className="h-3 w-3" />ubicado</span>}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => { setForm(c); setEditingId(c.id); setFormOpen(true); }} className="p-1.5 rounded-lg" style={{ color: theme.primary }}>
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button onClick={() => handleDelete(c.id)} className="p-1.5 rounded-lg" style={{ color: '#ef4444' }}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Form simple inline modal */}
      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} onClick={() => setFormOpen(false)}>
          <div className="rounded-2xl p-6 max-w-md w-full" style={{ backgroundColor: theme.card }} onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-3" style={{ color: theme.text }}>
              {editingId ? 'Editar' : 'Nuevo'} contacto
            </h3>
            <div className="space-y-2">
              <input placeholder="Nombre *" value={form.nombre || ''} onChange={e => setForm({ ...form, nombre: e.target.value })} className="w-full px-3 py-2 rounded-lg text-sm" style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}`, color: theme.text }} />
              <input placeholder="Apellido" value={form.apellido || ''} onChange={e => setForm({ ...form, apellido: e.target.value })} className="w-full px-3 py-2 rounded-lg text-sm" style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}`, color: theme.text }} />
              <input placeholder="DNI" value={form.dni || ''} onChange={e => setForm({ ...form, dni: e.target.value })} className="w-full px-3 py-2 rounded-lg text-sm" style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}`, color: theme.text }} />
              <input placeholder="Alias MP / CVU" value={form.alias_pago || ''} onChange={e => setForm({ ...form, alias_pago: e.target.value })} className="w-full px-3 py-2 rounded-lg text-sm" style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}`, color: theme.text }} />
              <input placeholder="Teléfono" value={form.telefono || ''} onChange={e => setForm({ ...form, telefono: e.target.value })} className="w-full px-3 py-2 rounded-lg text-sm" style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}`, color: theme.text }} />
              <input placeholder="Email" value={form.email || ''} onChange={e => setForm({ ...form, email: e.target.value })} className="w-full px-3 py-2 rounded-lg text-sm" style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}`, color: theme.text }} />
              <div className="relative">
                <input
                  placeholder="Dirección"
                  value={form.direccion || ''}
                  onChange={e => setForm({ ...form, direccion: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg text-sm"
                  style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}`, color: theme.text }}
                />
                {reverseLoading && (
                  <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin" style={{ color: theme.textSecondary }} />
                )}
              </div>
              {/* Lat / Lon: al editarlos hace reverse geocoding para autocompletar la direccion */}
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  step="0.000001"
                  placeholder="Latitud (-30.26...)"
                  value={form.latitud ?? ''}
                  onChange={e => {
                    const v = e.target.value === '' ? null : parseFloat(e.target.value);
                    setForm(prev => ({ ...prev, latitud: v }));
                    const lon = form.longitud;
                    if (v != null && lon != null) reverseGeocode(v, lon);
                  }}
                  className="w-full px-3 py-2 rounded-lg text-sm"
                  style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}`, color: theme.text }}
                />
                <input
                  type="number"
                  step="0.000001"
                  placeholder="Longitud (-64.12...)"
                  value={form.longitud ?? ''}
                  onChange={e => {
                    const v = e.target.value === '' ? null : parseFloat(e.target.value);
                    setForm(prev => ({ ...prev, longitud: v }));
                    const lat = form.latitud;
                    if (v != null && lat != null) reverseGeocode(lat, v);
                  }}
                  className="w-full px-3 py-2 rounded-lg text-sm"
                  style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}`, color: theme.text }}
                />
              </div>
              <p className="text-[10px]" style={{ color: theme.textSecondary }}>
                Si cargás lat/lon, completamos la dirección automáticamente.
              </p>
              <ModernSelect
                label="Tipo"
                value={form.tipo || 'beneficiario'}
                onChange={(v) => setForm({ ...form, tipo: v as TipoContacto })}
                options={(Object.keys(TIPO_LABELS) as TipoContacto[]).map(t => ({
                  value: t,
                  label: TIPO_LABELS[t],
                  color: TIPO_COLORS[t],
                }))}
              />
            </div>
            <div className="flex gap-2 mt-4 justify-end">
              <button onClick={() => setFormOpen(false)} className="px-4 py-2 rounded-lg text-sm" style={{ border: `1px solid ${theme.border}`, color: theme.text }}>Cancelar</button>
              <button onClick={handleSave} className="px-4 py-2 rounded-lg text-sm font-bold" style={{ backgroundColor: theme.primary, color: '#fff' }}>Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
