import { useEffect, useMemo, useState } from 'react';
import { Briefcase, Edit2, Trash2, Calendar, DollarSign } from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { TesoreriaHint } from '../components/tesoreria/TesoreriaHint';
import { ModernSelect } from '../components/ui/ModernSelect';
import { DatePicker } from '../components/ui/DatePicker';
import { MoneyInput } from '../components/ui/MoneyInput';
import {
  ABMPage, ABMCard, ABMCardActions, ABMInput, ABMSheetFooter,
  ABMTable, ABMTableAction,
} from '../components/ui/ABMPage';
import { proyectosApi } from '../lib/api';
import type { Proyecto, EstadoProyecto } from '../types';

const ESTADO_LABELS: Record<EstadoProyecto, string> = {
  activo: 'Activo',
  pausado: 'Pausado',
  finalizado: 'Finalizado',
};

const ESTADO_COLORS: Record<EstadoProyecto, string> = {
  activo: '#10b981',
  pausado: '#f59e0b',
  finalizado: '#71717a',
};

const ESTADO_OPCIONES: { value: EstadoProyecto; label: string }[] = [
  { value: 'activo', label: 'Activo' },
  { value: 'pausado', label: 'Pausado' },
  { value: 'finalizado', label: 'Finalizado' },
];

function fmtMoney(value?: string | number | null): string {
  if (value == null || value === '') return '—';
  const n = typeof value === 'string' ? parseFloat(value) : value;
  if (Number.isNaN(n)) return '—';
  return `$${n.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`;
}

export default function TesoreriaProyectos() {
  const { theme } = useTheme();
  const { user } = useAuth();

  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [estadoFiltro, setEstadoFiltro] = useState<EstadoProyecto | ''>('');

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Proyecto | null>(null);
  // Paginación client-side (50 items por página)
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [form, setForm] = useState<Partial<Proyecto>>({ nombre: '', estado: 'activo' });
  const [saving, setSaving] = useState(false);

  if (user && user.rol !== 'admin' && user.rol !== 'supervisor') {
    return (
      <div className="p-6">
        <p className="text-sm" style={{ color: theme.textSecondary }}>
          El módulo Tesorería es exclusivo de los gestores del municipio.
        </p>
      </div>
    );
  }

  const fetch = async () => {
    setLoading(true);
    try {
      const res = await proyectosApi.list({ activo: true, include_resumen: true, limit: 500 });
      setProyectos(res.data || []);
    } catch {
      toast.error('Error cargando proyectos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetch(); }, []);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return proyectos.filter(p => {
      if (estadoFiltro && p.estado !== estadoFiltro) return false;
      if (s && !p.nombre.toLowerCase().includes(s) && !(p.descripcion || '').toLowerCase().includes(s)) return false;
      return true;
    });
  }, [proyectos, search, estadoFiltro]);

  const paginatedFiltered = useMemo(() => {
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    if (page > totalPages) return filtered.slice(0, pageSize);
    return filtered.slice((page - 1) * pageSize, page * pageSize);
  }, [filtered, page, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [filtered.length]);

  const openSheet = (p?: Proyecto) => {
    if (p) {
      setEditing(p);
      setForm({ ...p });
    } else {
      setEditing(null);
      setForm({ nombre: '', estado: 'activo' });
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
      const payload: Record<string, unknown> = {
        nombre: form.nombre,
        descripcion: form.descripcion || null,
        presupuesto: form.presupuesto ? parseFloat(String(form.presupuesto)) : null,
        fecha_inicio: form.fecha_inicio || null,
        fecha_fin: form.fecha_fin || null,
        estado: form.estado || 'activo',
      };
      if (editing) {
        await proyectosApi.update(editing.id, payload);
        toast.success('Proyecto actualizado');
      } else {
        await proyectosApi.create(payload);
        toast.success('Proyecto creado');
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
    if (!confirm('¿Eliminar este proyecto? Las imputaciones de gastos se preservan.')) return;
    try {
      await proyectosApi.delete(id);
      toast.success('Proyecto eliminado');
      fetch();
    } catch {
      toast.error('Error eliminando');
    }
  };

  // Filtros: chips por estado
  const extraFilters = (
    <div className="flex flex-wrap gap-1.5">
      <button
        onClick={() => setEstadoFiltro('')}
        className="px-3 py-1.5 rounded-md text-xs font-medium transition-all"
        style={{
          backgroundColor: estadoFiltro === '' ? theme.primary : 'transparent',
          color: estadoFiltro === '' ? '#fff' : theme.textSecondary,
          border: `1px solid ${estadoFiltro === '' ? theme.primary : theme.border}`,
        }}
      >
        Todos {proyectos.length > 0 && `(${proyectos.length})`}
      </button>
      {(Object.keys(ESTADO_LABELS) as EstadoProyecto[]).map(e => (
        <button
          key={e}
          onClick={() => setEstadoFiltro(e)}
          className="px-3 py-1.5 rounded-md text-xs font-medium transition-all"
          style={{
            backgroundColor: estadoFiltro === e ? ESTADO_COLORS[e] : `${ESTADO_COLORS[e]}15`,
            color: estadoFiltro === e ? '#fff' : ESTADO_COLORS[e],
            border: `1px solid ${ESTADO_COLORS[e]}40`,
          }}
        >
          {ESTADO_LABELS[e]}
        </button>
      ))}
    </div>
  );

  const sheetContent = (
    <div className="space-y-3">
      <ABMInput
        label="Nombre"
        value={form.nombre || ''}
        onChange={(e) => setForm(f => ({ ...f, nombre: e.target.value }))}
        placeholder='Ej: "Departamento para el vecindario"'
      />
      <div>
        <label className="block text-xs font-medium mb-1" style={{ color: theme.textSecondary }}>Descripción</label>
        <textarea
          value={form.descripcion || ''}
          onChange={(e) => setForm(f => ({ ...f, descripcion: e.target.value }))}
          rows={3}
          className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2"
          style={{
            backgroundColor: theme.background,
            color: theme.text,
            border: `1px solid ${theme.border}`,
            ['--tw-ring-color' as string]: `${theme.primary}40`,
          }}
          placeholder="Descripción del proyecto u obra"
        />
      </div>
      <div>
        <label className="block text-xs font-medium mb-1" style={{ color: theme.textSecondary }}>
          Presupuesto (opcional)
        </label>
        <MoneyInput
          value={form.presupuesto ? String(form.presupuesto) : ''}
          onChange={(v) => setForm(f => ({ ...f, presupuesto: v }))}
          placeholder="0"
          className="w-full px-3 py-2 rounded-lg text-sm tabular-nums"
          style={{ backgroundColor: theme.backgroundSecondary, color: theme.text, border: `1px solid ${theme.border}` }}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: theme.textSecondary }}>Fecha inicio</label>
          <DatePicker
            value={form.fecha_inicio || ''}
            onChange={(v) => setForm(f => ({ ...f, fecha_inicio: v }))}
          />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: theme.textSecondary }}>Fecha fin</label>
          <DatePicker
            value={form.fecha_fin || ''}
            onChange={(v) => setForm(f => ({ ...f, fecha_fin: v }))}
          />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium mb-1" style={{ color: theme.textSecondary }}>Estado</label>
        <ModernSelect
          value={form.estado || 'activo'}
          onChange={(v) => setForm(f => ({ ...f, estado: v as EstadoProyecto }))}
          options={ESTADO_OPCIONES.map(o => ({ value: o.value, label: o.label, color: ESTADO_COLORS[o.value] }))}
        />
      </div>
    </div>
  );

  const renderProgreso = (p: Proyecto) => {
    if (!p.presupuesto || !p.resumen) return <span className="text-xs opacity-50">sin presupuesto</span>;
    const imputado = parseFloat(p.resumen.total_imputado || '0');
    const presupuesto = parseFloat(p.presupuesto);
    const pct = Math.min(100, Math.round(p.resumen.porcentaje_presupuesto || 0));
    const overBudget = imputado > presupuesto;
    const barColor = overBudget ? '#ef4444' : pct >= 80 ? '#f59e0b' : '#10b981';
    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[11px] tabular-nums">
          <span className="font-medium" style={{ color: theme.text }}>{fmtMoney(imputado)}</span>
          <span style={{ color: theme.textSecondary }}>de {fmtMoney(presupuesto)}</span>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: theme.border }}>
          <div className="h-full transition-all" style={{ width: `${pct}%`, backgroundColor: barColor }} />
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="px-4 pt-3">
        <TesoreriaHint titulo="Proyectos" storageKey="proyectos">
          Un <b>proyecto</b> agrupa varios gastos de una obra o iniciativa.
          Por ejemplo "Departamento para el vecindario" puede tener gastos de
          ferretería, corralón, contratista, etc. Al cargar un gasto podés imputar
          una parte (o todo) a un proyecto.
        </TesoreriaHint>
      </div>

      <ABMPage
        title="Proyectos"
        icon={<Briefcase className="h-5 w-5" />}
        backLink="/gestion/tesoreria"
        buttonLabel="Nuevo Proyecto"
        onAdd={() => openSheet()}
        searchPlaceholder="Buscar por nombre o descripción…"
        searchValue={search}
        onSearchChange={setSearch}
        extraFilters={extraFilters}
        loading={loading}
        isEmpty={filtered.length === 0}
        emptyMessage="No hay proyectos cargados. Creá uno con 'Nuevo Proyecto'."
        defaultViewMode="cards"
        pagination={{
          page,
          pageSize,
          totalItems: filtered.length,
          onPageChange: setPage,
          onPageSizeChange: (s) => { setPageSize(s); setPage(1); },
        }}
        tableView={
          <ABMTable<Proyecto>
            data={paginatedFiltered}
            keyExtractor={(p) => p.id}
            columns={[
              { key: 'nombre', header: 'Nombre', render: (p) => <span className="font-medium">{p.nombre}</span> },
              {
                key: 'estado', header: 'Estado',
                render: (p) => (
                  <span
                    className="inline-block text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded"
                    style={{ backgroundColor: `${ESTADO_COLORS[p.estado]}20`, color: ESTADO_COLORS[p.estado] }}
                  >
                    {ESTADO_LABELS[p.estado]}
                  </span>
                ),
              },
              {
                key: 'presupuesto', header: 'Presupuesto',
                render: (p) => <span className="tabular-nums">{fmtMoney(p.presupuesto)}</span>,
                sortValue: (p) => parseFloat(p.presupuesto || '0'),
              },
              {
                key: 'imputado', header: 'Imputado',
                render: (p) => <span className="tabular-nums">{fmtMoney(p.resumen?.total_imputado)}</span>,
                sortValue: (p) => parseFloat(p.resumen?.total_imputado || '0'),
              },
              {
                key: 'gastos', header: '# Gastos',
                render: (p) => <span className="tabular-nums">{p.resumen?.cantidad_gastos ?? 0}</span>,
                sortValue: (p) => p.resumen?.cantidad_gastos ?? 0,
              },
            ]}
            actions={(p) => (
              <>
                <ABMTableAction title="Editar" onClick={() => openSheet(p)} variant="primary" icon={<Edit2 className="h-4 w-4" />} />
                <ABMTableAction title="Eliminar" onClick={() => handleDelete(p.id)} variant="danger" icon={<Trash2 className="h-4 w-4" />} />
              </>
            )}
          />
        }
        sheetOpen={sheetOpen}
        sheetTitle={editing ? `Editar · ${editing.nombre}` : 'Nuevo proyecto'}
        sheetContent={sheetContent}
        sheetFooter={<ABMSheetFooter onCancel={closeSheet} onSave={handleSave} saving={saving} />}
        onSheetClose={closeSheet}
      >
        {paginatedFiltered.map((p, i) => (
          <ABMCard key={p.id} onClick={() => openSheet(p)} index={i}>
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex-1 min-w-0">
                <p className="font-semibold truncate" style={{ color: theme.text }}>{p.nombre}</p>
                <span
                  className="inline-block mt-1 text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded"
                  style={{ backgroundColor: `${ESTADO_COLORS[p.estado]}20`, color: ESTADO_COLORS[p.estado] }}
                >
                  {ESTADO_LABELS[p.estado]}
                </span>
              </div>
              <ABMCardActions onEdit={() => openSheet(p)} onDelete={() => handleDelete(p.id)} />
            </div>
            {p.descripcion && (
              <p className="text-xs mb-2 line-clamp-2" style={{ color: theme.textSecondary }}>
                {p.descripcion}
              </p>
            )}
            <div className="mb-2">{renderProgreso(p)}</div>
            <div className="flex items-center justify-between text-[11px]" style={{ color: theme.textSecondary }}>
              <span className="inline-flex items-center gap-1">
                <DollarSign className="h-3 w-3" />
                {p.resumen?.cantidad_gastos ?? 0} {(p.resumen?.cantidad_gastos ?? 0) === 1 ? 'gasto' : 'gastos'}
              </span>
              {(p.fecha_inicio || p.fecha_fin) && (
                <span className="inline-flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {p.fecha_inicio ? new Date(p.fecha_inicio).toLocaleDateString('es-AR') : '—'}
                  {p.fecha_fin && ` → ${new Date(p.fecha_fin).toLocaleDateString('es-AR')}`}
                </span>
              )}
            </div>
          </ABMCard>
        ))}
      </ABMPage>
    </>
  );
}
