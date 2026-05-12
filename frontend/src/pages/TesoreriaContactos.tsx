import { useEffect, useMemo, useRef, useState } from 'react';
import { Upload, MapPin, Phone, Mail, Users, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { TesoreriaHint } from '../components/tesoreria/TesoreriaHint';
import { ModernSelect } from '../components/ui/ModernSelect';
import { ABMPage, ABMCard, ABMCardActions, ABMInput, ABMSheetFooter, ABMTable, ABMTableAction } from '../components/ui/ABMPage';
import { Edit2, Trash2 } from 'lucide-react';
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

  // Sheet (form)
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Contacto | null>(null);
  const [form, setForm] = useState<Partial<Contacto>>({ nombre: '', tipo: 'beneficiario' });
  const [saving, setSaving] = useState(false);

  const [importing, setImporting] = useState<'excel' | 'kmz' | null>(null);
  const [reverseLoading, setReverseLoading] = useState(false);
  const reverseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (user && user.rol !== 'admin' && user.rol !== 'supervisor') {
    return <p className="p-6 text-sm">Sin permisos.</p>;
  }

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
      } catch { /* silent */ } finally {
        setReverseLoading(false);
      }
    }, 600);
  };

  const fetch = async () => {
    setLoading(true);
    try {
      const res = await contactosApi.list({
        limit: 500,
        search: search || undefined,
        tipo: tipoFiltro || undefined,
      });
      setContactos(res.data);
    } catch {
      toast.error('Error cargando contactos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetch(); }, [tipoFiltro]);
  useEffect(() => {
    const t = setTimeout(fetch, 400);
    return () => clearTimeout(t);
  }, [search]);

  const filtered = useMemo(() => contactos, [contactos]);

  const openSheet = (c?: Contacto) => {
    if (c) {
      setEditing(c);
      setForm(c);
    } else {
      setEditing(null);
      setForm({ nombre: '', apellido: '', tipo: 'beneficiario' });
    }
    setSheetOpen(true);
  };

  const closeSheet = () => {
    setSheetOpen(false);
    setEditing(null);
  };

  const handleSave = async () => {
    if (!form.nombre?.trim()) return toast.error('Nombre requerido');
    setSaving(true);
    try {
      if (editing) {
        await contactosApi.update(editing.id, form as Record<string, unknown>);
        toast.success('Contacto actualizado');
      } else {
        await contactosApi.create(form as Record<string, unknown>);
        toast.success('Contacto creado');
      }
      closeSheet();
      fetch();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Error guardando');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('¿Eliminar este contacto? (los gastos asociados se conservan)')) return;
    try {
      await contactosApi.delete(id);
      toast.success('Eliminado');
      fetch();
    } catch {
      toast.error('Error eliminando');
    }
  };

  const handleImportExcel = async (file: File) => {
    setImporting('excel');
    try {
      const res = await tesoreriaImportApi.excelMatriz(file);
      toast.success(`Importados: ${res.data.contactos_creados} contactos, ${res.data.gastos_creados} gastos`);
      fetch();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Error importando Excel');
    } finally {
      setImporting(null);
    }
  };

  const handleImportKmz = async (file: File) => {
    setImporting('kmz');
    try {
      const res = await tesoreriaImportApi.kmz(file);
      toast.success(`Actualizadas ${res.data.actualizados} ubicaciones`);
      fetch();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Error importando KMZ');
    } finally {
      setImporting(null);
    }
  };

  // Filtros: chips por tipo
  const extraFilters = (
    <div className="flex flex-wrap gap-1.5">
      <button
        onClick={() => setTipoFiltro('')}
        className="px-3 py-1.5 rounded-md text-xs font-medium transition-all"
        style={{
          backgroundColor: tipoFiltro === '' ? theme.primary : 'transparent',
          color: tipoFiltro === '' ? '#fff' : theme.textSecondary,
          border: `1px solid ${tipoFiltro === '' ? theme.primary : theme.border}`,
        }}
      >
        Todos {contactos.length > 0 && `(${contactos.length})`}
      </button>
      {(Object.keys(TIPO_LABELS) as TipoContacto[]).map(t => (
        <button
          key={t}
          onClick={() => setTipoFiltro(t)}
          className="px-3 py-1.5 rounded-md text-xs font-medium transition-all"
          style={{
            backgroundColor: tipoFiltro === t ? TIPO_COLORS[t] : `${TIPO_COLORS[t]}15`,
            color: tipoFiltro === t ? '#fff' : TIPO_COLORS[t],
            border: `1px solid ${TIPO_COLORS[t]}40`,
          }}
        >
          {TIPO_LABELS[t]}
        </button>
      ))}
    </div>
  );

  const headerActions = (
    <>
      <label
        className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold cursor-pointer transition-all hover:scale-[1.02]"
        style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}`, color: theme.text }}
      >
        <Upload className="h-3.5 w-3.5" />
        {importing === 'excel' ? 'Importando…' : 'Excel'}
        <input
          type="file"
          accept=".xlsx"
          className="hidden"
          disabled={!!importing}
          onChange={(e) => e.target.files?.[0] && handleImportExcel(e.target.files[0])}
        />
      </label>
      <label
        className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold cursor-pointer transition-all hover:scale-[1.02]"
        style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}`, color: theme.text }}
      >
        <MapPin className="h-3.5 w-3.5" />
        {importing === 'kmz' ? 'Importando…' : 'KMZ'}
        <input
          type="file"
          accept=".kmz,.kml"
          className="hidden"
          disabled={!!importing}
          onChange={(e) => e.target.files?.[0] && handleImportKmz(e.target.files[0])}
        />
      </label>
    </>
  );

  const sheetContent = (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <ABMInput label="Nombre" required value={form.nombre || ''} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
        <ABMInput label="Apellido" value={form.apellido || ''} onChange={(e) => setForm({ ...form, apellido: e.target.value })} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <ABMInput label="DNI" value={form.dni || ''} onChange={(e) => setForm({ ...form, dni: e.target.value })} />
        <ABMInput label="Alias MP / CVU" value={form.alias_pago || ''} onChange={(e) => setForm({ ...form, alias_pago: e.target.value })} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <ABMInput label="Teléfono" value={form.telefono || ''} onChange={(e) => setForm({ ...form, telefono: e.target.value })} />
        <ABMInput label="Email" type="email" value={form.email || ''} onChange={(e) => setForm({ ...form, email: e.target.value })} />
      </div>
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
      <div className="relative">
        <ABMInput
          label="Dirección"
          value={form.direccion || ''}
          onChange={(e) => setForm({ ...form, direccion: e.target.value })}
        />
        {reverseLoading && (
          <Loader2 className="absolute right-3 top-9 h-4 w-4 animate-spin" style={{ color: theme.textSecondary }} />
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <ABMInput
          label="Latitud"
          type="number"
          step="0.000001"
          value={form.latitud ?? ''}
          onChange={(e) => {
            const v = e.target.value === '' ? null : parseFloat(e.target.value);
            setForm(prev => ({ ...prev, latitud: v }));
            if (v != null && form.longitud != null) reverseGeocode(v, form.longitud);
          }}
        />
        <ABMInput
          label="Longitud"
          type="number"
          step="0.000001"
          value={form.longitud ?? ''}
          onChange={(e) => {
            const v = e.target.value === '' ? null : parseFloat(e.target.value);
            setForm(prev => ({ ...prev, longitud: v }));
            if (v != null && form.latitud != null) reverseGeocode(form.latitud, v);
          }}
        />
      </div>
      <p className="text-[10px]" style={{ color: theme.textSecondary }}>
        Si cargás lat/lon, completamos la dirección automáticamente.
      </p>
    </div>
  );

  return (
    <>
      <div className="px-4 pt-3">
        <TesoreriaHint titulo="Agenda de Contactos" storageKey="contactos">
          Acá guardás a las personas con las que hacés movimientos. Cada uno
          puede tener su <b>alias de transferencia</b> y <b>ubicación en el mapa</b>.
          Podés cargarlos a mano o importar el Excel del intendente.
        </TesoreriaHint>
      </div>

      <ABMPage
        title="Contactos"
        icon={<Users className="h-5 w-5" />}
        backLink="/gestion/tesoreria"
        buttonLabel="Nuevo"
        onAdd={() => openSheet()}
        searchPlaceholder="Buscar por nombre, DNI, alias…"
        searchValue={search}
        onSearchChange={setSearch}
        extraFilters={extraFilters}
        headerActions={headerActions}
        loading={loading}
        isEmpty={!loading && filtered.length === 0}
        emptyMessage="No hay contactos. Importá el Excel o agregalos con 'Nuevo'."
        defaultViewMode="table"
        tableView={
          <ABMTable<Contacto>
            data={filtered}
            keyExtractor={(c) => c.id}
            columns={[
              {
                key: 'nombre',
                header: 'Nombre',
                render: (c) => (
                  <span className="font-medium">{c.nombre} {c.apellido || ''}</span>
                ),
              },
              {
                key: 'tipo',
                header: 'Tipo',
                render: (c) => (
                  <span
                    className="inline-block text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded"
                    style={{ backgroundColor: `${TIPO_COLORS[c.tipo]}20`, color: TIPO_COLORS[c.tipo] }}
                  >
                    {TIPO_LABELS[c.tipo]}
                  </span>
                ),
              },
              {
                key: 'alias_pago',
                header: 'Alias',
                render: (c) => c.alias_pago
                  ? <span className="text-xs font-mono">{c.alias_pago}</span>
                  : <span className="text-xs opacity-50">—</span>,
              },
              {
                key: 'telefono',
                header: 'Teléfono',
                render: (c) => c.telefono || <span className="text-xs opacity-50">—</span>,
              },
              {
                key: 'email',
                header: 'Email',
                render: (c) => c.email || <span className="text-xs opacity-50">—</span>,
              },
              {
                key: 'ubicacion',
                header: 'Ubicación',
                sortable: false,
                render: (c) => (c.latitud && c.longitud)
                  ? <span className="inline-flex items-center gap-1 text-xs" style={{ color: '#10b981' }}><MapPin className="h-3 w-3" />ubicado</span>
                  : <span className="text-xs opacity-50">—</span>,
              },
            ]}
            actions={(c) => (
              <>
                <ABMTableAction title="Editar" onClick={() => openSheet(c)} variant="primary" icon={<Edit2 className="h-4 w-4" />} />
                <ABMTableAction title="Eliminar" onClick={() => handleDelete(c.id)} variant="danger" icon={<Trash2 className="h-4 w-4" />} />
              </>
            )}
          />
        }
        sheetOpen={sheetOpen}
        sheetTitle={editing ? `Editar contacto · ${editing.nombre} ${editing.apellido || ''}` : 'Nuevo contacto'}
        sheetContent={sheetContent}
        sheetFooter={<ABMSheetFooter onCancel={closeSheet} onSave={handleSave} saving={saving} />}
        onSheetClose={closeSheet}
      >
        {filtered.map((c, i) => (
          <ABMCard key={c.id} onClick={() => openSheet(c)} index={i}>
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex-1 min-w-0">
                <p className="font-semibold truncate" style={{ color: theme.text }}>
                  {c.nombre} {c.apellido || ''}
                </p>
                <span
                  className="inline-block mt-1 text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded"
                  style={{ backgroundColor: `${TIPO_COLORS[c.tipo]}20`, color: TIPO_COLORS[c.tipo] }}
                >
                  {TIPO_LABELS[c.tipo]}
                </span>
              </div>
              <ABMCardActions onEdit={() => openSheet(c)} onDelete={() => handleDelete(c.id)} />
            </div>
            {c.alias_pago && (
              <p className="text-[11px] truncate font-mono mb-1" style={{ color: theme.textSecondary }}>
                {c.alias_pago}
              </p>
            )}
            <div className="flex items-center gap-3 flex-wrap text-[11px]" style={{ color: theme.textSecondary }}>
              {c.telefono && (
                <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{c.telefono}</span>
              )}
              {c.email && (
                <span className="inline-flex items-center gap-1 truncate"><Mail className="h-3 w-3" />{c.email}</span>
              )}
              {(c.latitud && c.longitud) && (
                <span className="inline-flex items-center gap-1" style={{ color: '#10b981' }}>
                  <MapPin className="h-3 w-3" />ubicado
                </span>
              )}
            </div>
          </ABMCard>
        ))}
      </ABMPage>
    </>
  );
}
