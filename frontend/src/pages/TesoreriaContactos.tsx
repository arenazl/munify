import { Fragment, useEffect, useMemo, useState } from 'react';
import { Upload, MapPin, Phone, Mail, Users, Edit2, Trash2, Loader2, GitMerge } from 'lucide-react';
import { UnificarContactosModal } from '../components/tesoreria/UnificarContactosModal';
import { toast } from 'sonner';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { TesoreriaHint } from '../components/tesoreria/TesoreriaHint';
import { ModernSelect } from '../components/ui/ModernSelect';
import { DireccionAutocomplete } from '../components/ui/DireccionAutocomplete';
import { ABMPage, ABMCard, ABMCardActions, ABMInput, ABMSheetFooter, ABMTable, ABMTableAction, type AbmToolbar } from '../components/ui/ABMPage';
import { StatusPill } from '../components/ui/StatusPill';
import { contactosApi, tesoreriaImportApi, tiposEmpleadoApi, parajesApi } from '../lib/api';
import {
  contactoIconByTipo,
  TIPO_CONTACTO_COLORS as TIPO_COLORS,
  TIPO_CONTACTO_LABELS_SINGULAR as TIPO_LABELS,
} from '../lib/contactoIcons';
import type { Contacto, TipoContacto, TipoEmpleadoCatalogo, Paraje } from '../types';

export default function TesoreriaContactos() {
  const { theme } = useTheme();
  const { user } = useAuth();

  const [contactos, setContactos] = useState<Contacto[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState<string | null>(null); // pildora actualmente cargando
  const [search, setSearch] = useState('');
  const [tipoFiltro, setTipoFiltro] = useState<TipoContacto | ''>('');
  const [tipoEmpleadoFiltro, setTipoEmpleadoFiltro] = useState<string>('');
  // Paginacion server-side
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [totalItems, setTotalItems] = useState(0);
  const [tiposEmpleado, setTiposEmpleado] = useState<TipoEmpleadoCatalogo[]>([]);
  const [parajes, setParajes] = useState<Paraje[]>([]);
  const [ubicacionModo, setUbicacionModo] = useState<'direccion' | 'paraje'>('direccion');

  // Sheet (form)
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Contacto | null>(null);
  const [form, setForm] = useState<Partial<Contacto>>({ nombre: '', tipo: 'beneficiario' });
  const [saving, setSaving] = useState(false);

  const [importing, setImporting] = useState<'excel' | 'kmz' | null>(null);

  // Modal de unificacion de duplicados
  const [unificarOpen, setUnificarOpen] = useState(false);

  if (user && user.rol !== 'admin' && user.rol !== 'supervisor') {
    return <p className="p-6 text-sm">Sin permisos.</p>;
  }

  // Paginacion server-side: cada cambio de filtro/pagina dispara fetch.
  // ABMPage NO se desmonta porque loading se mantiene true brevemente y
  // los contactos viejos se mantienen visibles hasta que llegan los nuevos
  // (no se borra el array al arrancar fetch — se reemplaza al terminar).
  const fetch = async () => {
    try {
      const params: any = {
        skip: (page - 1) * pageSize,
        limit: pageSize,
      };
      if (tipoFiltro) params.tipo = tipoFiltro;
      if (search.trim()) params.search = search.trim();
      const res = await contactosApi.list(params);
      setContactos(res.data);
      const totalHeader = (res.headers && (res.headers['x-total-count'] || res.headers['X-Total-Count']));
      if (totalHeader) setTotalItems(parseInt(totalHeader as string, 10));
    } catch {
      toast.error('Error cargando contactos');
    } finally {
      setLoading(false);
      setSearching(null);
    }
  };

  // Initial fetch + cada vez que cambia algo de paginacion/filtro server-side
  useEffect(() => { fetch(); /* eslint-disable-line */ }, [page, pageSize, tipoFiltro]);

  // Search con debounce
  useEffect(() => {
    setPage(1);
    const t = setTimeout(() => fetch(), 400);
    return () => clearTimeout(t);
    /* eslint-disable-next-line */
  }, [search]);

  // Cargar catalogos (tipos de empleado + parajes)
  useEffect(() => {
    tiposEmpleadoApi.list({ activo: true })
      .then(r => setTiposEmpleado(r.data || []))
      .catch(() => setTiposEmpleado([]));
    parajesApi.list({ activo: true, include_count: false })
      .then(r => setParajes(r.data || []))
      .catch(() => setParajes([]));
  }, []);

  // Reset filtro de subtipo cuando cambia el tipo principal
  useEffect(() => {
    if (tipoFiltro !== 'empleado') setTipoEmpleadoFiltro('');
  }, [tipoFiltro]);

  // El filtro server-side ya devuelve solo lo que corresponde. Solo queda
  // el subtipo de empleado que se filtra client-side (es un metadata extra
  // dentro del tipo 'empleado').
  const filtered = useMemo(() => {
    if (tipoFiltro !== 'empleado' || !tipoEmpleadoFiltro) return contactos;
    const target = tipoEmpleadoFiltro.toLowerCase();
    return contactos.filter(c => (c.subtipo || '').toLowerCase() === target);
  }, [contactos, tipoFiltro, tipoEmpleadoFiltro]);

  const openSheet = (c?: Contacto) => {
    if (c) {
      setEditing(c);
      setForm(c);
      // Si el contacto tiene paraje_id, modo "paraje"; sino "direccion".
      setUbicacionModo(c.paraje_id ? 'paraje' : 'direccion');
    } else {
      setEditing(null);
      setForm({ nombre: '', apellido: '', tipo: 'beneficiario' });
      setUbicacionModo('direccion');
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

  const tipoEmpleadoOptions = useMemo(() => ([
    { value: '', label: 'Empleados' },
    ...tiposEmpleado.map(t => ({
      value: t.nombre, label: t.nombre, color: t.color || undefined,
    })),
  ]), [tiposEmpleado]);

  // Filtros: chips por tipo. Si tipo=empleado, aparece combo de subtipo
  // de empleado (del catalogo per-muni) al lado de la pill Empleado.
  // Mismo .ts-fitem CSS que otras pantallas para mantener look uniforme.
  const TIPOS_KEYS = Object.keys(TIPO_LABELS) as TipoContacto[];
  const extraFilters = (
    <div className="flex flex-wrap items-center gap-1.5 contactos-filters-row">
      <style>{`
        .contactos-filters-row .ts-fitem button {
          height: 32px !important;
          padding-top: 0 !important;
          padding-bottom: 0 !important;
          font-size: 0.75rem !important;
          border-radius: 0.375rem !important;
        }
      `}</style>
      <button
        onClick={() => { setSearching(''); setPage(1); setTipoFiltro(''); }}
        className="px-3 py-1.5 rounded-md text-xs font-medium transition-all inline-flex items-center gap-1.5"
        style={{
          backgroundColor: tipoFiltro === '' ? theme.primary : 'transparent',
          color: tipoFiltro === '' ? '#fff' : theme.textSecondary,
          border: `1px solid ${tipoFiltro === '' ? theme.primary : theme.border}`,
          height: 32,
        }}
      >
        {searching === '' && <Loader2 className="h-3 w-3 animate-spin" />}
        Todos {tipoFiltro === '' && totalItems > 0 && `(${totalItems.toLocaleString('es-AR')})`}
      </button>
      {TIPOS_KEYS.map(t => {
        const active = tipoFiltro === t;
        const isLoadingThis = searching === t;
        return (
          <Fragment key={t}>
            <button
              onClick={() => { setSearching(t); setPage(1); setTipoFiltro(t); }}
              className="px-3 py-1.5 rounded-md text-xs font-medium transition-all inline-flex items-center gap-1.5"
              style={{
                backgroundColor: active ? TIPO_COLORS[t] : `${TIPO_COLORS[t]}15`,
                color: active ? '#fff' : TIPO_COLORS[t],
                border: `1px solid ${TIPO_COLORS[t]}40`,
                height: 32,
              }}
            >
              {isLoadingThis && <Loader2 className="h-3 w-3 animate-spin" />}
              {TIPO_LABELS[t]}
              {active && totalItems > 0 && ` (${totalItems.toLocaleString('es-AR')})`}
            </button>
            {t === 'empleado' && active && tiposEmpleado.length > 0 && (
              <div className="min-w-[180px] ts-fitem">
                <ModernSelect
                  value={tipoEmpleadoFiltro}
                  onChange={setTipoEmpleadoFiltro}
                  options={tipoEmpleadoOptions}
                  placeholder="Empleados"
                  searchable
                />
              </div>
            )}
          </Fragment>
        );
      })}
    </div>
  );

  // Botones Excel/KMZ sacados del header a pedido del user — accesibles
  // desde una pantalla aparte si hace falta importar.
  // Boton "Unificar" para detectar y fusionar contactos duplicados
  // (caso tipico: el mismo proveedor cargado 2-3 veces con tipos distintos
  // por el import del Excel).
  const headerActions = (
    <button
      onClick={() => setUnificarOpen(true)}
      className="inline-flex items-center gap-1.5 px-3 h-[34px] rounded-lg text-[12px] font-semibold transition-all hover:scale-105 active:scale-95"
      style={{
        backgroundColor: `${theme.primary}15`,
        color: theme.primary,
        border: `1px solid ${theme.primary}40`,
      }}
      title="Detectar y fusionar contactos duplicados"
    >
      <GitMerge className="h-3.5 w-3.5" />
      Unificar
    </button>
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
      <div className={form.tipo === 'empleado' && tiposEmpleado.length > 0 ? 'grid grid-cols-2 gap-3' : ''}>
        <ModernSelect
          label="Tipo"
          value={form.tipo || 'beneficiario'}
          onChange={(v) => setForm({ ...form, tipo: v as TipoContacto, tipo_empleado_id: v === 'empleado' ? form.tipo_empleado_id : null })}
          options={(Object.keys(TIPO_LABELS) as TipoContacto[]).map(t => ({
            value: t, label: TIPO_LABELS[t], color: TIPO_COLORS[t],
          }))}
        />
        {/* Combo dinamico: tipo de empleado (catalogo per-muni) */}
        {form.tipo === 'empleado' && tiposEmpleado.length > 0 && (
          <ModernSelect
            label="Tipo de empleado"
            value={form.tipo_empleado_id ? String(form.tipo_empleado_id) : ''}
            onChange={(v) => {
              const id = v ? parseInt(v, 10) : null;
              const tipo = id ? tiposEmpleado.find(t => t.id === id) : null;
              // Mantengo `subtipo` (string) sincronizado para backward-compat
              setForm({ ...form, tipo_empleado_id: id, subtipo: tipo?.nombre || null });
            }}
            options={[
              { value: '', label: 'Sin clasificar' },
              ...tiposEmpleado.map(t => ({
                value: String(t.id), label: t.nombre, color: t.color || undefined,
              })),
            ]}
            placeholder="Elegir tipo..."
            searchable
          />
        )}
      </div>
      {/* Toggle: ubicación por dirección exacta O por paraje */}
      <div>
        <label className="block text-xs font-semibold mb-1" style={{ color: theme.textSecondary }}>Ubicación</label>
        <div className="inline-flex items-center gap-1 mb-2 rounded-lg p-0.5" style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}` }}>
          <button
            type="button"
            onClick={() => { setUbicacionModo('direccion'); setForm(prev => ({ ...prev, paraje_id: null })); }}
            className="px-3 py-1.5 rounded-md text-xs font-semibold transition-all"
            style={{
              backgroundColor: ubicacionModo === 'direccion' ? theme.primary : 'transparent',
              color: ubicacionModo === 'direccion' ? '#fff' : theme.textSecondary,
            }}
          >
            Dirección exacta
          </button>
          <button
            type="button"
            onClick={() => { setUbicacionModo('paraje'); setForm(prev => ({ ...prev, direccion: null, latitud: null, longitud: null })); }}
            className="px-3 py-1.5 rounded-md text-xs font-semibold transition-all"
            style={{
              backgroundColor: ubicacionModo === 'paraje' ? theme.primary : 'transparent',
              color: ubicacionModo === 'paraje' ? '#fff' : theme.textSecondary,
            }}
          >
            Paraje
          </button>
        </div>
        {ubicacionModo === 'direccion' ? (
          <DireccionAutocomplete
            value={form.direccion || ''}
            onChange={(dir, lat, lon) =>
              setForm(prev => ({
                ...prev,
                direccion: dir,
                latitud: lat ?? prev.latitud,
                longitud: lon ?? prev.longitud,
              }))
            }
            placeholder="Ej: Av. San Martín 123 o Mitre y Belgrano"
            inputClassName="py-2"
          />
        ) : (
          <ModernSelect
            value={form.paraje_id ? String(form.paraje_id) : ''}
            onChange={(v) => setForm(prev => ({ ...prev, paraje_id: v ? parseInt(v, 10) : null }))}
            options={[
              { value: '', label: 'Sin paraje' },
              ...parajes.map(p => ({ value: String(p.id), label: p.nombre, color: p.color || undefined })),
            ]}
            placeholder="Elegir paraje..."
            searchable
          />
        )}
      </div>
      {form.latitud && form.longitud && (
        <p className="text-[10px]" style={{ color: '#10b981' }}>
          📍 Geolocalizado: {form.latitud.toFixed(5)}, {form.longitud.toFixed(5)}
        </p>
      )}
    </div>
  );

  return (
    <>
      <TesoreriaHint titulo="Agenda de Contactos" storageKey="contactos">
        Acá guardás a las personas con las que hacés movimientos. Cada uno
        puede tener su <b>alias de transferencia</b> y <b>ubicación en el mapa</b>.
        Podés cargarlos a mano o importar el Excel del intendente.
      </TesoreriaHint>

      <ABMPage
        title="Contactos"
        icon={<Users className="h-5 w-5" />}
        backLink="/gestion/tesoreria"
        buttonLabel="Nuevo"
        onAdd={() => openSheet()}
        searchPlaceholder="Buscar por nombre, DNI…"
        searchValue={search}
        onSearchChange={setSearch}
        headerActions={headerActions}
        toolbar={{
          statusPills: {
            value: tipoFiltro,
            onChange: (v) => { setSearching(v || '*'); setPage(1); setTipoFiltro(v as TipoContacto | ''); },
            todosCount: tipoFiltro === '' ? totalItems : undefined,
            items: TIPOS_KEYS.map(t => ({
              key: t,
              label: TIPO_LABELS[t],
              color: TIPO_COLORS[t],
              icon: contactoIconByTipo(t),
              count: tipoFiltro === t ? totalItems : undefined,
            })),
          },
          customAtEnd: tipoFiltro === 'empleado' && tiposEmpleado.length > 0 ? [
            <div key="empleado-sub" className="min-w-[180px]">
              <ModernSelect
                value={tipoEmpleadoFiltro}
                onChange={setTipoEmpleadoFiltro}
                options={tipoEmpleadoOptions}
                placeholder="Empleados"
                searchable
              />
            </div>,
          ] : [],
        } satisfies AbmToolbar}
        loading={loading}
        isEmpty={!loading && filtered.length === 0}
        emptyMessage="No hay contactos. Importá el Excel o agregalos con 'Nuevo'."
        defaultViewMode="table"
        pagination={{
          page,
          pageSize,
          totalItems,
          onPageChange: (p) => { setSearching('*'); setPage(p); },
          onPageSizeChange: (s) => { setSearching('*'); setPageSize(s); setPage(1); },
        }}
        tableView={
          <ABMTable<Contacto>
            data={filtered}
            keyExtractor={(c) => c.id}
            columns={[
              {
                key: 'nombre',
                header: 'Nombre',
                render: (c) => {
                  const Icon = contactoIconByTipo(c.tipo);
                  const color = TIPO_COLORS[c.tipo] || '#71717a';
                  return (
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: `${color}20` }}
                      >
                        <Icon className="h-3 w-3" style={{ color }} />
                      </span>
                      <span className="font-medium">{c.nombre} {c.apellido || ''}</span>
                    </span>
                  );
                },
              },
              {
                key: 'tipo',
                header: 'Tipo',
                render: (c) => (
                  <StatusPill label={TIPO_LABELS[c.tipo]} color={TIPO_COLORS[c.tipo] || '#71717a'} size="xs" />
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

      <UnificarContactosModal
        open={unificarOpen}
        onClose={() => setUnificarOpen(false)}
        onMerged={() => fetch()}
      />
    </>
  );
}
