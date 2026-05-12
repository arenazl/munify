import { useEffect, useMemo, useState } from 'react';
import { Wallet, Users, Map as MapIcon, TrendingUp, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { TesoreriaHint } from '../components/tesoreria/TesoreriaHint';
import { CrearGastoWizard } from '../components/tesoreria/CrearGastoWizard';
import { ABMPage, ABMTable, ABMTableAction } from '../components/ui/ABMPage';
import { gastosApi } from '../lib/api';
import type { Gasto, TipoFinanciacion } from '../types';

const TIPO_FIN_COLORS: Record<TipoFinanciacion, string> = {
  contado: '#10b981',
  cuotas: '#3b82f6',
  prestamo: '#8b5cf6',
  recurrente: '#f59e0b',
};

export default function Tesoreria() {
  const { theme } = useTheme();
  const { user } = useAuth();

  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tipoFiltro, setTipoFiltro] = useState<TipoFinanciacion | ''>('');
  const [wizardOpen, setWizardOpen] = useState(false);

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

  useEffect(() => { fetchGastos(); }, []);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return gastos.filter(g => {
      if (tipoFiltro && g.tipo_financiacion !== tipoFiltro) return false;
      if (s) {
        const hay = g.concepto.toLowerCase().includes(s)
          || (g.descripcion?.toLowerCase().includes(s) ?? false);
        if (!hay) return false;
      }
      return true;
    });
  }, [gastos, search, tipoFiltro]);

  const totalMes = useMemo(() => {
    const ahora = new Date();
    return gastos
      .filter(g => {
        const d = new Date(g.fecha);
        return d.getMonth() === ahora.getMonth() && d.getFullYear() === ahora.getFullYear();
      })
      .reduce((acc, g) => acc + parseFloat(g.monto_pesos), 0);
  }, [gastos]);

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

  // Chips filtros por tipo de financiación
  const TIPOS: { value: TipoFinanciacion | ''; label: string }[] = [
    { value: '', label: 'Todos' },
    { value: 'contado', label: 'Contado' },
    { value: 'cuotas', label: 'Cuotas' },
    { value: 'prestamo', label: 'Préstamos' },
    { value: 'recurrente', label: 'Recurrente' },
  ];

  const extraFilters = (
    <div className="flex flex-wrap gap-1.5">
      {TIPOS.map(t => {
        const isActive = tipoFiltro === t.value;
        const color = t.value ? TIPO_FIN_COLORS[t.value] : theme.primary;
        return (
          <button
            key={t.value || 'all'}
            onClick={() => setTipoFiltro(t.value as TipoFinanciacion | '')}
            className="px-3 py-1.5 rounded-md text-xs font-medium transition-all"
            style={{
              backgroundColor: isActive ? color : `${color}15`,
              color: isActive ? '#fff' : color,
              border: `1px solid ${color}40`,
            }}
          >
            {t.label}
          </button>
        );
      })}
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

  const tableView = (
    <ABMTable<Gasto>
      data={filtered}
      keyExtractor={(g) => g.id}
      columns={[
        { key: 'fecha', header: 'Fecha', render: (g) => new Date(g.fecha).toLocaleDateString('es-AR') },
        { key: 'concepto', header: 'Concepto', render: (g) => <span className="font-medium">{g.concepto}</span> },
        { key: 'destino_tipo', header: 'Destino', render: (g) => g.destino_tipo === 'contacto' ? 'Contacto' : 'Secretaría' },
        {
          key: 'monto_pesos',
          header: 'Monto',
          render: (g) => (
            <span className="font-bold tabular-nums">
              ${parseFloat(g.monto_pesos).toLocaleString('es-AR', { maximumFractionDigits: 0 })}
            </span>
          ),
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
        },
      ]}
      actions={(g) => (
        <ABMTableAction title="Eliminar" onClick={() => handleDelete(g.id)} variant="danger" icon={<Trash2 className="h-4 w-4" />} />
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
        extraFilters={extraFilters}
        headerActions={headerActions}
        loading={loading}
        isEmpty={!loading && filtered.length === 0}
        emptyMessage="Todavía no hay gastos. Tocá 'Nuevo Gasto' para cargar uno."
        tableView={tableView}
        defaultViewMode="table"
      >
        {/* Card view (mismo data en cards si el user cambia el toggle) */}
        {filtered.map(g => (
          <div
            key={g.id}
            className="rounded-xl p-4"
            style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex-1 min-w-0">
                <p className="font-semibold truncate" style={{ color: theme.text }}>{g.concepto}</p>
                <p className="text-[10px]" style={{ color: theme.textSecondary }}>
                  {new Date(g.fecha).toLocaleDateString('es-AR')} · {g.destino_tipo === 'contacto' ? 'Contacto' : 'Secretaría'}
                </p>
              </div>
              <span
                className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: `${TIPO_FIN_COLORS[g.tipo_financiacion]}20`, color: TIPO_FIN_COLORS[g.tipo_financiacion] }}
              >
                {g.tipo_financiacion}
              </span>
            </div>
            <p className="text-xl font-bold tabular-nums" style={{ color: theme.text }}>
              ${parseFloat(g.monto_pesos).toLocaleString('es-AR', { maximumFractionDigits: 0 })}
            </p>
          </div>
        ))}
      </ABMPage>

      <CrearGastoWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onSuccess={() => { setWizardOpen(false); fetchGastos(); }}
      />
    </>
  );
}
