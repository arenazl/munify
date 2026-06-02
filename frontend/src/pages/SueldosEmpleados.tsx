import { useEffect, useMemo, useState } from 'react';
import { Users, MapPin, Phone, Mail, Briefcase, Link as LinkIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { ABMPage } from '../components/ui/ABMPage';
import PageHint from '../components/ui/PageHint';
import { ModernSelect } from '../components/ui/ModernSelect';
import { MunifyTour } from '../components/ui/MunifyTour';
import { TourButton } from '../components/ui/TourButton';
import type { KpiSpec } from '../components/ui/KpiCard';
import { contactosApi, tiposEmpleadoApi, agendaPagosApi } from '../lib/api';
import type { Contacto, TipoEmpleadoCatalogo, PagoProgramado } from '../types';

const TOUR_STEPS_EMP = [
  {
    target: '[data-tour="emp-kpis"]',
    content: 'Cantidad de empleados activos del muni, cuántos ya tienen liquidación cargada y masa salarial total.',
    title: 'Padrón de Personal',
    placement: 'bottom' as const,
    disableBeacon: true,
  },
];

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
    <>
      <PageHint pageId="sueldos-empleados" />
    <ABMPage
      title="Empleados"
      icon={<Users className="h-5 w-5" />}
      searchPlaceholder="Buscar por nombre, DNI o tipo..."
      searchValue={search}
      onSearchChange={setSearch}
      kpis={kpis}
      tourAnchors={{ kpis: 'emp-kpis' }}
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
        <div className="inline-flex items-center gap-2">
          <TourButton tourKey="sueldos-empleados" title="Ver tutorial de Empleados" />
          <Link
            to="/gestion/tesoreria/contactos"
            className="inline-flex items-center gap-1.5 px-3 h-[34px] rounded-lg text-[12px] font-semibold transition-all hover:scale-105"
            style={{ backgroundColor: `${theme.primary}15`, color: theme.primary, border: `1px solid ${theme.primary}40` }}
            title="Gestionar todos los contactos"
          >
            <LinkIcon className="h-3.5 w-3.5" />
            Ir a Contactos
          </Link>
        </div>
      }
    >
      <div
        className="col-span-full rounded-xl overflow-hidden"
        style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
      >
        {filtered.map((e, idx) => {
          const pago = pagoPorContacto.get(e.id);
          const nombreCompleto = `${e.nombre}${e.apellido ? ' ' + e.apellido : ''}`;
          const inicial = (e.nombre[0] || '?').toUpperCase() + (e.apellido?.[0] || '').toUpperCase();
          // Hash simple para color estable por nombre
          let hash = 0;
          for (let i = 0; i < nombreCompleto.length; i++) hash = (hash * 31 + nombreCompleto.charCodeAt(i)) | 0;
          const hue = Math.abs(hash) % 360;
          const avatarBg = `hsl(${hue}, 70%, 92%)`;
          const avatarFg = `hsl(${hue}, 55%, 38%)`;
          return (
            <div
              key={e.id}
              className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-opacity-50"
              style={{
                borderBottom: idx < filtered.length - 1 ? `1px solid ${theme.border}` : undefined,
                backgroundColor: 'transparent',
              }}
            >
              {/* Avatar */}
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold"
                style={{ backgroundColor: avatarBg, color: avatarFg }}
              >
                {inicial}
              </div>

              {/* Nombre + subtipo */}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate" style={{ color: theme.text }}>{nombreCompleto}</p>
                <div className="flex items-center gap-2 flex-wrap text-[11px]" style={{ color: theme.textSecondary }}>
                  {e.subtipo && (
                    <span className="font-semibold" style={{ color: theme.primary }}>{e.subtipo}</span>
                  )}
                  {e.dni && <span>DNI {e.dni}</span>}
                  {e.telefono && (
                    <span className="inline-flex items-center gap-1"><Phone className="h-2.5 w-2.5" />{e.telefono}</span>
                  )}
                </div>
              </div>

              {/* Sueldo (si hay) */}
              {pago ? (
                <div className="text-right flex-shrink-0 hidden sm:block">
                  <p className="text-[10px] uppercase font-bold" style={{ color: theme.textSecondary }}>Sueldo base</p>
                  <p className="text-base font-bold tabular-nums" style={{ color: theme.text }}>
                    {fmtMoney(pago.monto_pesos)}
                  </p>
                  <p className="text-[10px]" style={{ color: theme.textSecondary }}>
                    {pago.frecuencia} · próx {pago.proximo_pago}
                  </p>
                </div>
              ) : (
                <div className="hidden sm:block flex-shrink-0">
                  <Link
                    to="/gestion/tesoreria/agenda"
                    className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-md transition-all hover:scale-105"
                    style={{
                      backgroundColor: `${theme.primary}15`,
                      color: theme.primary,
                      border: `1px solid ${theme.primary}40`,
                    }}
                  >
                    + Cargar liquidación
                  </Link>
                </div>
              )}

              {/* Estado pill */}
              <span
                className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full whitespace-nowrap flex-shrink-0"
                style={{
                  backgroundColor: pago ? '#10b98120' : '#6b728020',
                  color: pago ? '#10b981' : '#6b7280',
                }}
              >
                {pago ? 'OK' : 'Pendiente'}
              </span>
            </div>
          );
        })}
      </div>
    </ABMPage>
    <MunifyTour tourKey="sueldos-empleados" steps={TOUR_STEPS_EMP} />
    </>
  );
}
