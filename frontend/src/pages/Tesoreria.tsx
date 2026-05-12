import { useEffect, useMemo, useState } from 'react';
import {
  Wallet, Users, Map as MapIcon, TrendingUp, Trash2, Eye,
  Building2, Home, Calendar, Briefcase,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { TesoreriaHint } from '../components/tesoreria/TesoreriaHint';
import { CrearGastoWizard } from '../components/tesoreria/CrearGastoWizard';
import {
  GastoDetalleSheet, calcEstadoAgregado, ESTADO_AGREGADO_META,
  type EstadoAgregado,
} from '../components/tesoreria/GastoDetalleSheet';
import { ABMPage, ABMTable, ABMTableAction } from '../components/ui/ABMPage';
import { ModernSelect } from '../components/ui/ModernSelect';
import { DateRangePicker, type DateRange } from '../components/ui/DateRangePicker';
import { gastosApi, dependenciasApi, contactosApi } from '../lib/api';
import type { Gasto, TipoFinanciacion, Contacto } from '../types';

const TIPO_FIN_COLORS: Record<TipoFinanciacion, string> = {
  contado: '#10b981',
  cuotas: '#3b82f6',
  prestamo: '#8b5cf6',
  recurrente: '#f59e0b',
};

interface DependenciaOption {
  id: number;
  nombre: string;
  color?: string | null;
  icono?: string | null;
}

const ESTADO_FILTROS: { value: EstadoAgregado | ''; label: string }[] = [
  { value: '', label: 'Todos' },
  { value: 'al_dia', label: 'Al día' },
  { value: 'en_mora', label: 'En mora' },
  { value: 'pendiente', label: 'Pendiente' },
  { value: 'completado', label: 'Completado' },
];

export default function Tesoreria() {
  const { theme } = useTheme();
  const { user } = useAuth();

  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tipoFiltro, setTipoFiltro] = useState<TipoFinanciacion | ''>('');
  const [dependenciaFiltro, setDependenciaFiltro] = useState<string>(''); // string para ModernSelect
  const [contactoFiltro, setContactoFiltro] = useState<string>('');
  const [estadoFiltro, setEstadoFiltro] = useState<EstadoAgregado | ''>('');
  const [rangoFechas, setRangoFechas] = useState<DateRange>({ desde: '', hasta: '' });

  const [dependencias, setDependencias] = useState<DependenciaOption[]>([]);
  const [contactos, setContactos] = useState<Contacto[]>([]);
  const [wizardOpen, setWizardOpen] = useState(false);

  // Side modal de detalle
  const [gastoSeleccionado, setGastoSeleccionado] = useState<Gasto | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  if (user && user.rol !== 'admin' && user.rol !== 'supervisor') {
    return (
      <div className="p-6">
        <p className="text-sm" style={{ color: theme.textSecondary }}>
          El módulo Tesorería es exclusivo de los gestores del municipio.
        </p>
      </div>
    );
  }

  const fetchGastos = async () => {
    setLoading(true);
    try {
      const res = await gastosApi.list({ limit: 200 });
      setGastos(res.data);
    } catch {
      toast.error('Error cargando gastos');
    } finally {
      setLoading(false);
    }
  };

  const fetchDependencias = async () => {
    try {
      const res = await dependenciasApi.getMunicipio({ activo: true });
      setDependencias(res.data || []);
    } catch {
      setDependencias([]);
    }
  };

  const fetchContactos = async () => {
    try {
      const res = await contactosApi.list({ activo: true, limit: 500 });
      setContactos(res.data || []);
    } catch {
      setContactos([]);
    }
  };

  useEffect(() => {
    fetchGastos();
    fetchDependencias();
    fetchContactos();
  }, []);

  // Refrescar el gasto seleccionado cuando se actualiza la lista
  useEffect(() => {
    if (!gastoSeleccionado) return;
    const actualizado = gastos.find(g => g.id === gastoSeleccionado.id);
    if (actualizado) setGastoSeleccionado(actualizado);
  }, [gastos]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    const desde = rangoFechas.desde ? new Date(rangoFechas.desde) : null;
    const hasta = rangoFechas.hasta ? new Date(rangoFechas.hasta) : null;
    if (desde) desde.setHours(0, 0, 0, 0);
    if (hasta) hasta.setHours(23, 59, 59, 999);
    const depId = dependenciaFiltro ? parseInt(dependenciaFiltro, 10) : null;

    return gastos.filter(g => {
      if (tipoFiltro && g.tipo_financiacion !== tipoFiltro) return false;
      if (depId != null) {
        if (g.destino_tipo !== 'dependencia' || g.destino_dependencia_id !== depId) return false;
      }
      if (estadoFiltro && calcEstadoAgregado(g) !== estadoFiltro) return false;
      if (desde || hasta) {
        const fechaGasto = new Date(g.fecha);
        if (desde && fechaGasto < desde) return false;
        if (hasta && fechaGasto > hasta) return false;
      }
      if (s) {
        const hay = g.concepto.toLowerCase().includes(s)
          || (g.descripcion?.toLowerCase().includes(s) ?? false);
        if (!hay) return false;
      }
      return true;
    });
  }, [gastos, search, tipoFiltro, dependenciaFiltro, estadoFiltro, rangoFechas]);

  const totalMes = useMemo(() => {
    const ahora = new Date();
    return gastos
      .filter(g => {
        const d = new Date(g.fecha);
        return d.getMonth() === ahora.getMonth() && d.getFullYear() === ahora.getFullYear();
      })
      .reduce((acc, g) => acc + parseFloat(g.monto_pesos), 0);
  }, [gastos]);

  const dependenciasMap = useMemo(() => {
    const m = new Map<number, DependenciaOption>();
    dependencias.forEach(d => m.set(d.id, d));
    return m;
  }, [dependencias]);

  const handleDelete = async (id: number) => {
    if (!confirm('¿Eliminar este gasto?')) return;
    try {
      await gastosApi.delete(id);
      toast.success('Gasto eliminado');
      fetchGastos();
    } catch {
      toast.error('Error eliminando');
    }
  };

  const openDetalle = (g: Gasto) => {
    setGastoSeleccionado(g);
    setSheetOpen(true);
  };

  const closeDetalle = () => {
    setSheetOpen(false);
    // pequeño delay para no flashear sin contenido durante la animación de cierre
    setTimeout(() => setGastoSeleccionado(null), 400);
  };

  // Opciones de tipo de financiación (combo searchable, no chips)
  const tipoOptions = useMemo(() => ([
    { value: '', label: 'Todos los tipos' },
    { value: 'contado', label: 'Contado', color: TIPO_FIN_COLORS.contado },
    { value: 'cuotas', label: 'Cuotas', color: TIPO_FIN_COLORS.cuotas },
    { value: 'prestamo', label: 'Préstamos', color: TIPO_FIN_COLORS.prestamo },
    { value: 'recurrente', label: 'Recurrente', color: TIPO_FIN_COLORS.recurrente },
  ]), []);

  // Chips de estado agregado
  const estadoChips = (
    <div className="flex flex-wrap gap-1.5">
      {ESTADO_FILTROS.map(e => {
        const isActive = estadoFiltro === e.value;
        const meta = e.value ? ESTADO_AGREGADO_META[e.value] : null;
        const color = meta?.color || theme.primary;
        return (
          <button
            key={e.value || 'all'}
            onClick={() => setEstadoFiltro(e.value as EstadoAgregado | '')}
            className="px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all"
            style={{
              backgroundColor: isActive ? color : `${color}15`,
              color: isActive ? '#fff' : color,
              border: `1px solid ${color}40`,
            }}
          >
            {e.label}
          </button>
        );
      })}
    </div>
  );

  // Opciones de dependencia
  const dependenciaOptions = useMemo(() => ([
    { value: '', label: 'Todas las dependencias' },
    ...dependencias.map(d => ({
      value: String(d.id),
      label: d.nombre,
      color: d.color || undefined,
    })),
  ]), [dependencias]);

  // Barra de filtros secundarios (tipo + dependencia + fechas + estado)
  const secondaryFilters = (
    <div className="flex flex-wrap items-center gap-2">
      <div className="min-w-[180px] flex-shrink-0">
        <ModernSelect
          value={tipoFiltro}
          onChange={(v) => setTipoFiltro(v as TipoFinanciacion | '')}
          options={tipoOptions}
          placeholder="Todos los tipos"
          searchable
        />
      </div>
      <div className="min-w-[200px] flex-shrink-0">
        <ModernSelect
          value={dependenciaFiltro}
          onChange={setDependenciaFiltro}
          options={dependenciaOptions}
          placeholder="Todas las dependencias"
          searchable
        />
      </div>
      <div className="flex-shrink-0">
        <DateRangePicker
          value={rangoFechas}
          onChange={setRangoFechas}
          placeholder="Rango de fechas"
          allowClear
        />
      </div>
      <div className="flex-1 min-w-0 flex justify-end">
        {estadoChips}
      </div>
    </div>
  );

  // Accesos rápidos como headerActions
  const headerActions = (
    <>
      <Link
        to="/gestion/tesoreria/contactos"
        className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all hover:scale-[1.02]"
        style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}`, color: theme.text }}
      >
        <Users className="h-3.5 w-3.5" /> Contactos
      </Link>
      <Link
        to="/gestion/tesoreria/proyectos"
        className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all hover:scale-[1.02]"
        style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}`, color: theme.text }}
      >
        <Briefcase className="h-3.5 w-3.5" /> Proyectos
      </Link>
      <Link
        to="/gestion/tesoreria/mapa"
        className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all hover:scale-[1.02]"
        style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}`, color: theme.text }}
      >
        <MapIcon className="h-3.5 w-3.5" /> Mapa
      </Link>
      <Link
        to="/gestion/tesoreria/proyecciones"
        className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all hover:scale-[1.02]"
        style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}`, color: theme.text }}
      >
        <TrendingUp className="h-3.5 w-3.5" /> Proyecciones
      </Link>
    </>
  );

  // Renderer del destino para la celda de la tabla
  const renderDestino = (g: Gasto) => {
    if (g.destino_tipo === 'contacto') {
      return (
        <span className="inline-flex items-center gap-1 text-xs" style={{ color: theme.textSecondary }}>
          <Home className="h-3 w-3" /> Contacto
        </span>
      );
    }
    const dep = g.destino_dependencia_id ? dependenciasMap.get(g.destino_dependencia_id) : null;
    const color = dep?.color || theme.primary;
    return (
      <span
        className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded"
        style={{ backgroundColor: `${color}15`, color }}
        title={dep?.nombre}
      >
        <Building2 className="h-3 w-3" />
        <span className="truncate max-w-[140px]">{dep?.nombre || 'Secretaría'}</span>
      </span>
    );
  };

  const renderEstadoBadge = (g: Gasto) => {
    const est = calcEstadoAgregado(g);
    const meta = ESTADO_AGREGADO_META[est];
    return (
      <span
        className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full whitespace-nowrap"
        style={{ backgroundColor: meta.bg, color: meta.color, border: `1px solid ${meta.color}30` }}
      >
        {meta.label}
      </span>
    );
  };

  const tableView = (
    <ABMTable<Gasto>
      data={filtered}
      keyExtractor={(g) => g.id}
      onRowClick={openDetalle}
      columns={[
        {
          key: 'fecha',
          header: 'Fecha',
          render: (g) => new Date(g.fecha).toLocaleDateString('es-AR'),
          sortValue: (g) => g.fecha,
        },
        {
          key: 'concepto',
          header: 'Concepto',
          render: (g) => <span className="font-medium">{g.concepto}</span>,
          sortValue: (g) => g.concepto,
        },
        {
          key: 'destino',
          header: 'Destino',
          render: renderDestino,
          sortable: false,
        },
        {
          key: 'monto_pesos',
          header: 'Monto',
          render: (g) => (
            <span className="font-bold tabular-nums">
              ${parseFloat(g.monto_pesos).toLocaleString('es-AR', { maximumFractionDigits: 0 })}
            </span>
          ),
          sortValue: (g) => parseFloat(g.monto_pesos),
        },
        {
          key: 'tipo_financiacion',
          header: 'Tipo',
          render: (g) => (
            <span
              className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full"
              style={{ backgroundColor: `${TIPO_FIN_COLORS[g.tipo_financiacion]}20`, color: TIPO_FIN_COLORS[g.tipo_financiacion] }}
            >
              {g.tipo_financiacion}
            </span>
          ),
          sortValue: (g) => g.tipo_financiacion,
        },
        {
          key: 'estado_agregado',
          header: 'Estado',
          render: renderEstadoBadge,
          sortValue: (g) => calcEstadoAgregado(g),
        },
      ]}
      actions={(g) => (
        <>
          <ABMTableAction
            title="Ver detalle"
            onClick={() => openDetalle(g)}
            variant="primary"
            icon={<Eye className="h-4 w-4" />}
          />
          <ABMTableAction
            title="Eliminar"
            onClick={() => handleDelete(g.id)}
            variant="danger"
            icon={<Trash2 className="h-4 w-4" />}
          />
        </>
      )}
    />
  );

  return (
    <>
      <div className="px-4 pt-3">
        <TesoreriaHint titulo="Bienvenido a Tesorería" storageKey="home">
          Acá cargás los gastos del municipio: sueldos, pagos a proveedores,
          préstamos, subsidios. Cada gasto se asigna a una <b>Secretaría</b> o
          a un <b>Contacto</b>. Total este mes:{' '}
          <span className="font-bold" style={{ color: theme.primary }}>
            ${totalMes.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
          </span>
        </TesoreriaHint>
      </div>

      <ABMPage
        title="Tesorería"
        icon={<Wallet className="h-5 w-5" />}
        buttonLabel="Nuevo Gasto"
        onAdd={() => setWizardOpen(true)}
        searchPlaceholder="Buscar por concepto o descripción..."
        searchValue={search}
        onSearchChange={setSearch}
        secondaryFilters={secondaryFilters}
        headerActions={headerActions}
        loading={loading}
        isEmpty={!loading && filtered.length === 0}
        emptyMessage="No hay gastos que coincidan con los filtros."
        tableView={tableView}
        defaultViewMode="table"
      >
        {/* Card view */}
        {filtered.map(g => {
          const dep = g.destino_dependencia_id ? dependenciasMap.get(g.destino_dependencia_id) : null;
          const estMeta = ESTADO_AGREGADO_META[calcEstadoAgregado(g)];
          return (
            <div
              key={g.id}
              onClick={() => openDetalle(g)}
              className="rounded-xl p-4 cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-lg active:scale-[0.99]"
              style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate" style={{ color: theme.text }}>{g.concepto}</p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className="inline-flex items-center gap-1 text-[10px]" style={{ color: theme.textSecondary }}>
                      <Calendar className="h-2.5 w-2.5" />
                      {new Date(g.fecha).toLocaleDateString('es-AR')}
                    </span>
                    {g.destino_tipo === 'contacto' ? (
                      <span className="inline-flex items-center gap-1 text-[10px]" style={{ color: theme.textSecondary }}>
                        <Home className="h-2.5 w-2.5" /> Contacto
                      </span>
                    ) : (
                      <span
                        className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded"
                        style={{
                          backgroundColor: `${dep?.color || theme.primary}15`,
                          color: dep?.color || theme.primary,
                        }}
                      >
                        <Building2 className="h-2.5 w-2.5" />
                        <span className="truncate max-w-[100px]">{dep?.nombre || 'Secretaría'}</span>
                      </span>
                    )}
                  </div>
                </div>
                <span
                  className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: `${TIPO_FIN_COLORS[g.tipo_financiacion]}20`, color: TIPO_FIN_COLORS[g.tipo_financiacion] }}
                >
                  {g.tipo_financiacion}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <p className="text-xl font-bold tabular-nums" style={{ color: theme.text }}>
                  ${parseFloat(g.monto_pesos).toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                </p>
                <span
                  className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: estMeta.bg, color: estMeta.color, border: `1px solid ${estMeta.color}30` }}
                >
                  {estMeta.label}
                </span>
              </div>
            </div>
          );
        })}
      </ABMPage>

      <CrearGastoWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onSuccess={() => { setWizardOpen(false); fetchGastos(); }}
      />

      <GastoDetalleSheet
        open={sheetOpen}
        onClose={closeDetalle}
        gasto={gastoSeleccionado}
        onUpdated={fetchGastos}
        onDeleted={fetchGastos}
      />
    </>
  );
}
