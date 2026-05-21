import { useEffect, useMemo, useState } from 'react';
import { Users, MapPin, Phone, Mail, Briefcase, Link as LinkIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { ABMPage } from '../components/ui/ABMPage';
import { ModernSelect } from '../components/ui/ModernSelect';
import type { KpiSpec } from '../components/ui/KpiCard';
import { contactosApi, tiposEmpleadoApi, agendaPagosApi } from '../lib/api';
import type { Contacto, TipoEmpleadoCatalogo, PagoProgramado } from '../types';

function fmtMoney(v: string | number): string {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return `$${(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })}`;
}

export default function SueldosEmpleados() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const [empleados, setEmpleados] = useState<Contacto[]>([]);
  const [tipos, setTipos] = useState<TipoEmpleadoCatalogo[]>([]);
  const [pagosProg, setPagosProg] = useState<PagoProgramado[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [subtipoFiltro, setSubtipoFiltro] = useState('');

  if (user && user.rol !== 'admin' && user.rol !== 'supervisor') {
    return <div className="p-6"><p className="text-sm" style={{ color: theme.textSecondary }}>Solo gestores.</p></div>;
  }

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [emps, ts, pp] = await Promise.all([
        contactosApi.list({ activo: true, tipo: 'empleado', limit: 5000 }),
        tiposEmpleadoApi.list({ activo: true }).catch(() => ({ data: [] as TipoEmpleadoCatalogo[] })),
        agendaPagosApi.list({ activo: true }).catch(() => ({ data: [] as PagoProgramado[] })),
      ]);
      setEmpleados(emps.data || []);
      setTipos(ts.data || []);
      setPagosProg(pp.data || []);
    } catch { toast.error('Error cargando empleados'); }
    finally { setLoading(false); }
  };
  useEffect(() => { fetchAll(); }, []);

  // Mapa contacto_id -> pago_programado (si tiene)
  const pagoPorContacto = useMemo(() => {
    const m = new Map<number, PagoProgramado>();
    pagosProg.forEach(p => m.set(p.contacto_id, p));
    return m;
  }, [pagosProg]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return empleados.filter(c => {
      if (subtipoFiltro && (c.subtipo || '') !== subtipoFiltro) return false;
      if (!s) return true;
      const full = `${c.nombre} ${c.apellido || ''} ${c.dni || ''} ${c.subtipo || ''}`.toLowerCase();
      return full.includes(s);
    });
  }, [empleados, search, subtipoFiltro]);

  // KPIs
  const conPago = useMemo(() => filtered.filter(e => pagoPorContacto.has(e.id)).length, [filtered, pagoPorContacto]);
  const totalSueldos = useMemo(
    () => filtered.reduce((acc, e) => {
      const p = pagoPorContacto.get(e.id);
      return acc + (p ? parseFloat(p.monto_pesos || '0') : 0);
    }, 0),
    [filtered, pagoPorContacto]
  );

  const kpis: KpiSpec[] = [
    {
      label: 'Empleados activos', value: String(filtered.length),
      icon: Users, color: theme.primary,
      footnote: subtipoFiltro ? `Filtro: ${subtipoFiltro}` : 'Total cargados',
      highlighted: true,
    },
    {
      label: 'Con liquidación', value: String(conPago),
      icon: Briefcase, color: '#10b981',
      footnote: `${filtered.length - conPago} sin liquidación cargada`,
    },
    {
      label: 'Masa salarial', value: fmtMoney(totalSueldos),
      icon: Briefcase, color: '#3b82f6',
      footnote: 'Suma de bases (sin premios)',
    },
  ];

  // Opciones de subtipo
  const subtipoOptions = useMemo(() => {
    if (tipos.length > 0) {
      return [
        { value: '', label: 'Todos los tipos' },
        ...tipos.map(t => ({ value: t.nombre, label: t.nombre, color: t.color || undefined })),
      ];
    }
    const set = new Set<string>();
    empleados.forEach(e => { if (e.subtipo) set.add(e.subtipo); });
    return [
      { value: '', label: 'Todos los tipos' },
      ...Array.from(set).sort().map(s => ({ value: s, label: s })),
    ];
  }, [tipos, empleados]);

  return (
    <ABMPage
      title="Empleados"
      icon={<Users className="h-5 w-5" />}
      searchPlaceholder="Buscar por nombre, DNI o tipo..."
      searchValue={search}
      onSearchChange={setSearch}
      kpis={kpis}
      loading={loading}
      isEmpty={filtered.length === 0}
      emptyMessage="No hay empleados. Cargalos en Contactos con tipo=Empleado."
      toolbar={{
        combos: [
          {
            key: 'subtipo',
            placeholder: 'Tipos',
            value: subtipoFiltro,
            onChange: setSubtipoFiltro,
            options: subtipoOptions.filter(o => o.value !== ''),
            searchable: true,
            minWidth: 180,
          },
        ],
      }}
      headerActions={
        <Link
          to="/gestion/tesoreria/contactos"
          className="inline-flex items-center gap-1.5 px-3 h-[34px] rounded-lg text-[12px] font-semibold transition-all hover:scale-105"
          style={{ backgroundColor: `${theme.primary}15`, color: theme.primary, border: `1px solid ${theme.primary}40` }}
          title="Gestionar todos los contactos"
        >
          <LinkIcon className="h-3.5 w-3.5" />
          Ir a Contactos
        </Link>
      }
    >
      {filtered.map(e => {
        const pago = pagoPorContacto.get(e.id);
        const nombreCompleto = `${e.nombre}${e.apellido ? ' ' + e.apellido : ''}`;
        return (
          <div
            key={e.id}
            className="rounded-xl p-4 transition-all hover:scale-[1.005]"
            style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
          >
            <div className="flex items-start justify-between mb-2">
              <div className="min-w-0 flex-1">
                <p className="font-bold truncate" style={{ color: theme.text }}>{nombreCompleto}</p>
                {e.subtipo && (
                  <p className="text-[11px] uppercase font-semibold" style={{ color: theme.primary }}>{e.subtipo}</p>
                )}
              </div>
              {pago ? (
                <span
                  className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full whitespace-nowrap"
                  style={{ backgroundColor: '#10b98120', color: '#10b981' }}
                >
                  Con liquidación
                </span>
              ) : (
                <span
                  className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full whitespace-nowrap"
                  style={{ backgroundColor: '#6b728020', color: '#6b7280' }}
                >
                  Sin liquidación
                </span>
              )}
            </div>

            {pago && (
              <div
                className="rounded-lg p-2 mb-2"
                style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}` }}
              >
                <p className="text-[10px] uppercase font-bold" style={{ color: theme.textSecondary }}>Sueldo base</p>
                <p className="text-xl font-bold tabular-nums" style={{ color: theme.text }}>{fmtMoney(pago.monto_pesos)}</p>
                <p className="text-[10px]" style={{ color: theme.textSecondary }}>
                  Próximo pago: {pago.proximo_pago} · {pago.frecuencia}
                </p>
              </div>
            )}

            <div className="space-y-1 text-[11px]" style={{ color: theme.textSecondary }}>
              {e.dni && <p>DNI: {e.dni}</p>}
              {e.telefono && (
                <p className="inline-flex items-center gap-1"><Phone className="h-3 w-3" /> {e.telefono}</p>
              )}
              {e.email && (
                <p className="inline-flex items-center gap-1 truncate"><Mail className="h-3 w-3" /> {e.email}</p>
              )}
              {e.direccion && (
                <p className="inline-flex items-center gap-1 truncate"><MapPin className="h-3 w-3" /> {e.direccion}</p>
              )}
            </div>

            {!pago && (
              <Link
                to="/gestion/tesoreria/agenda"
                className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold transition-all hover:scale-105"
                style={{ color: theme.primary }}
              >
                + Cargar liquidación →
              </Link>
            )}
          </div>
        );
      })}
    </ABMPage>
  );
}
