import { useEffect, useMemo, useState } from 'react';
import {
  TrendingUp, Download, ChevronDown, ChevronRight, AlertTriangle,
  Loader2, Calendar,
} from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { TesoreriaHint } from '../components/tesoreria/TesoreriaHint';
import { ABMPage } from '../components/ui/ABMPage';
import { Sheet } from '../components/ui/Sheet';
import { ModernSelect } from '../components/ui/ModernSelect';
import { DateRangePicker, type DateRange } from '../components/ui/DateRangePicker';
import { ContactoAutocomplete } from '../components/ui/ContactoAutocomplete';
import { gastosApi, dependenciasApi } from '../lib/api';
import { exportProyeccionExcel } from '../lib/exportProyeccionExcel';
import type {
  ProyeccionResponse, ProyeccionMes, CuotaProyeccion,
  Contacto, Gasto,
} from '../types';

const MESES_CORTO = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
                     'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const MESES_LARGO = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                     'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

function rangoDefault12m(): DateRange {
  const hoy = new Date();
  const en1y = new Date(hoy.getFullYear(), hoy.getMonth() + 12, hoy.getDate());
  return {
    desde: hoy.toISOString().slice(0, 10),
    hasta: en1y.toISOString().slice(0, 10),
  };
}

function fmtMoney(value: string | number): string {
  const n = typeof value === 'string' ? parseFloat(value) : value;
  return n.toLocaleString('es-AR', { maximumFractionDigits: 0 });
}

function mesKey(m: ProyeccionMes): string {
  return `${m.anio}-${String(m.mes).padStart(2, '0')}`;
}

const TIPO_FIN_OPTIONS = [
  { value: '', label: 'Todos los tipos' },
  { value: 'cuotas', label: 'Cuotas' },
  { value: 'prestamo', label: 'Préstamos' },
  { value: 'recurrente', label: 'Recurrentes' },
];

const ESTADO_COLORS: Record<string, string> = {
  pendiente: '#3b82f6',
  vencida: '#ef4444',
  pagada: '#22c55e',
  cancelada: '#71717a',
};

export default function TesoreriaProyecciones() {
  const { theme } = useTheme();
  const { user } = useAuth();

  // Permisos: solo admin/supervisor del municipio.
  // El return se evalua despues de declarar hooks abajo si no tiene permisos.
  const sinPermisos = user && user.rol !== 'admin' && user.rol !== 'supervisor';

  const [data, setData] = useState<ProyeccionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filtros
  const [rango, setRango] = useState<DateRange>(rangoDefault12m);
  const [tipoFin, setTipoFin] = useState<string>('');
  const [dependenciaId, setDependenciaId] = useState<string>('');
  const [contactoId, setContactoId] = useState<number | null>(null);
  const [contactoSelected, setContactoSelected] = useState<Contacto | null>(null);
  const [conceptoSearch, setConceptoSearch] = useState('');

  // Dependencias del municipio para el select
  const [dependenciaOptions, setDependenciaOptions] = useState<{ value: string; label: string }[]>([]);

  // Drill-down: mes expandido y sus cuotas
  const [mesExpandido, setMesExpandido] = useState<string | null>(null);
  const [cuotasDelMes, setCuotasDelMes] = useState<Record<string, CuotaProyeccion[]>>({});
  const [loadingCuotas, setLoadingCuotas] = useState<string | null>(null);

  // Sheet con detalle del gasto madre
  const [gastoSelected, setGastoSelected] = useState<Gasto | null>(null);
  const [loadingGasto, setLoadingGasto] = useState(false);

  // Cargar dependencias del municipio una vez
  useEffect(() => {
    if (sinPermisos) return;
    dependenciasApi.getMunicipio({ activo: true })
      .then(res => {
        const items = (res.data as Array<{ id: number; dependencia?: { nombre?: string }; nombre?: string }>);
        const opts = items.map(d => ({
          value: String(d.id),
          label: d.dependencia?.nombre || d.nombre || `Dependencia #${d.id}`,
        }));
        setDependenciaOptions([{ value: '', label: 'Todas las dependencias' }, ...opts]);
      })
      .catch(() => setDependenciaOptions([{ value: '', label: 'Todas las dependencias' }]));
  }, [sinPermisos]);

  // Cargar proyeccion cuando cambian los filtros
  useEffect(() => {
    if (sinPermisos) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    gastosApi.proyecciones({
      desde: rango.desde || undefined,
      hasta: rango.hasta || undefined,
      destino_dependencia_id: dependenciaId ? Number(dependenciaId) : undefined,
      destino_contacto_id: contactoId ?? undefined,
      tipo_financiacion: tipoFin || undefined,
      concepto: conceptoSearch || undefined,
    })
      .then(res => {
        if (cancelled) return;
        setData(res.data);
        setMesExpandido(null);
        setCuotasDelMes({});
      })
      .catch(e => {
        if (cancelled) return;
        console.error(e);
        setError('No pudimos cargar la proyeccion.');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [rango.desde, rango.hasta, tipoFin, dependenciaId, contactoId, conceptoSearch, sinPermisos]);

  // Promedio mensual derivado
  const promedioMensual = useMemo(() => {
    if (!data || data.por_mes.length === 0) return 0;
    return parseFloat(data.total_pesos) / data.por_mes.length;
  }, [data]);

  // Datos para el grafico de area
  const chartData = useMemo(() => {
    if (!data) return [];
    return data.por_mes.map(m => ({
      mes: `${MESES_CORTO[m.mes - 1]} ${String(m.anio).slice(2)}`,
      total: parseFloat(m.total_pesos),
      cuotas: m.cantidad_cuotas,
      vencidas: m.cuotas_vencidas ?? 0,
    }));
  }, [data]);

  // Handler: click en un mes para expandir/colapsar y cargar cuotas
  const toggleMes = async (m: ProyeccionMes) => {
    const key = mesKey(m);
    if (mesExpandido === key) {
      setMesExpandido(null);
      return;
    }
    setMesExpandido(key);
    if (cuotasDelMes[key]) return; // Ya cargado
    setLoadingCuotas(key);
    try {
      const res = await gastosApi.proyeccionesCuotasDelMes({
        anio: m.anio,
        mes: m.mes,
        destino_dependencia_id: dependenciaId ? Number(dependenciaId) : undefined,
        destino_contacto_id: contactoId ?? undefined,
        tipo_financiacion: tipoFin || undefined,
        concepto: conceptoSearch || undefined,
      });
      setCuotasDelMes(prev => ({ ...prev, [key]: res.data }));
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingCuotas(null);
    }
  };

  // Handler: click en una cuota para abrir Sheet con el gasto madre
  const verGastoMadre = async (gastoId: number) => {
    setLoadingGasto(true);
    try {
      const res = await gastosApi.get(gastoId);
      setGastoSelected(res.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingGasto(false);
    }
  };

  // Handler: exportar Excel
  const handleExport = async () => {
    if (!data) return;
    // Si el user expandio meses, ya tenemos sus cuotas; sumarlas para el detalle.
    const cuotasDetalle = Object.values(cuotasDelMes).flat();
    const depLabel = dependenciaOptions.find(o => o.value === dependenciaId)?.label;
    exportProyeccionExcel(
      data,
      {
        desde: data.desde,
        hasta: data.hasta,
        dependencia_nombre: dependenciaId ? depLabel : null,
        contacto_nombre: contactoSelected ? `${contactoSelected.nombre} ${contactoSelected.apellido || ''}`.trim() : null,
        tipo_financiacion: tipoFin || null,
        concepto: conceptoSearch || null,
      },
      cuotasDetalle.length > 0 ? cuotasDetalle : undefined,
    );
  };

  if (sinPermisos) return <p className="p-6 text-sm">Sin permisos.</p>;

  // ---------- JSX helpers ----------

  const extraFilters = (
    <div className="flex flex-wrap items-center gap-2 w-full">
      <DateRangePicker
        value={rango}
        onChange={setRango}
        allowClear={false}
        className="min-w-[260px]"
      />
      <ModernSelect
        value={tipoFin}
        onChange={setTipoFin}
        options={TIPO_FIN_OPTIONS}
        className="min-w-[160px]"
      />
      {dependenciaOptions.length > 0 && (
        <ModernSelect
          value={dependenciaId}
          onChange={setDependenciaId}
          options={dependenciaOptions}
          searchable
          className="min-w-[200px]"
        />
      )}
      <ContactoAutocomplete
        value={contactoId}
        onChange={(id, c) => { setContactoId(id); setContactoSelected(c); }}
        placeholder="Filtrar por contacto"
        className="min-w-[220px]"
      />
      <input
        type="text"
        value={conceptoSearch}
        onChange={e => setConceptoSearch(e.target.value)}
        placeholder="Buscar concepto..."
        className="px-3 py-2 rounded-lg text-sm outline-none min-w-[180px]"
        style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}`, color: theme.text }}
      />
    </div>
  );

  const headerActions = (
    <button
      type="button"
      onClick={handleExport}
      disabled={!data || loading}
      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-opacity hover:opacity-80 disabled:opacity-40"
      style={{ backgroundColor: theme.primary, color: theme.card }}
      title="Exportar a Excel"
    >
      <Download className="h-3.5 w-3.5" /> Exportar
    </button>
  );

  return (
    <>
      <div className="px-4 pt-3">
        <TesoreriaHint titulo="Proyección de Pagos" storageKey="proyecciones">
          Te mostramos cuánto vas a tener que pagar mes a mes según las
          cuotas pendientes que cargaste (sueldos recurrentes, préstamos,
          etc). Filtrá por período, dependencia o contacto, expandí cada
          mes para ver el detalle, y exportá a Excel para presupuesto.
        </TesoreriaHint>
      </div>

      <ABMPage
        title="Proyección de Pagos"
        icon={<TrendingUp className="h-5 w-5" />}
        backLink="/gestion/tesoreria"
        searchValue=""
        onSearchChange={() => {}}
        extraFilters={extraFilters}
        headerActions={headerActions}
        loading={loading}
        isEmpty={!loading && !error && (!data || data.por_mes.length === 0)}
        emptyMessage="No hay cuotas futuras con esos filtros. Cargá gastos con tipo 'cuotas' o 'recurrente' o relajá los filtros."
      >
        {error && (
          <div className="col-span-full p-3 rounded-lg text-sm" style={{ backgroundColor: `${theme.danger}15`, color: theme.danger, border: `1px solid ${theme.danger}40` }}>
            {error}
          </div>
        )}

        {data && data.por_mes.length > 0 && (
          <div className="col-span-full space-y-4">
            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <KpiCard
                label="Total proyectado"
                value={`$${fmtMoney(data.total_pesos)}`}
                accent={theme.primary}
              />
              <KpiCard
                label="Cuotas pendientes"
                value={String(data.cantidad_cuotas)}
              />
              <KpiCard
                label="Promedio mensual"
                value={`$${fmtMoney(promedioMensual)}`}
              />
              <KpiCard
                label="Mes pico"
                value={data.mes_pico
                  ? `${MESES_CORTO[data.mes_pico.mes - 1]} ${String(data.mes_pico.anio).slice(2)}`
                  : '—'}
                sub={data.mes_pico ? `$${fmtMoney(data.mes_pico.total_pesos)}` : undefined}
              />
              <KpiCard
                label="Cuotas vencidas"
                value={String(data.cuotas_vencidas ?? 0)}
                accent={(data.cuotas_vencidas ?? 0) > 0 ? '#ef4444' : undefined}
                icon={(data.cuotas_vencidas ?? 0) > 0 ? <AlertTriangle className="h-4 w-4" /> : null}
              />
            </div>

            {/* Grafico de area */}
            <div
              className="rounded-xl p-4"
              style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
            >
              <h3 className="font-semibold mb-3 text-sm" style={{ color: theme.text }}>Tendencia mensual</h3>
              <div style={{ width: '100%', height: 240 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="proyArea" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={theme.primary} stopOpacity={0.4} />
                        <stop offset="100%" stopColor={theme.primary} stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={theme.border} />
                    <XAxis dataKey="mes" tick={{ fontSize: 11, fill: theme.textSecondary }} />
                    <YAxis
                      tick={{ fontSize: 11, fill: theme.textSecondary }}
                      tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: theme.card,
                        border: `1px solid ${theme.border}`,
                        borderRadius: 8,
                        color: theme.text,
                      }}
                      formatter={(value: number) => `$${fmtMoney(value)}`}
                    />
                    <Area
                      type="monotone"
                      dataKey="total"
                      stroke={theme.primary}
                      strokeWidth={2}
                      fill="url(#proyArea)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Tabla expandible por mes */}
            <div
              className="rounded-xl"
              style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
            >
              <div className="px-4 py-3 border-b" style={{ borderColor: theme.border }}>
                <h3 className="font-semibold text-sm" style={{ color: theme.text }}>Detalle por mes</h3>
                <p className="text-xs mt-0.5" style={{ color: theme.textSecondary }}>
                  Tocá un mes para ver las cuotas individuales.
                </p>
              </div>
              <div className="divide-y" style={{ borderColor: theme.border }}>
                {data.por_mes.map((m) => {
                  const key = mesKey(m);
                  const expandido = mesExpandido === key;
                  const cuotas = cuotasDelMes[key];
                  const cargando = loadingCuotas === key;
                  return (
                    <div key={key}>
                      <button
                        type="button"
                        onClick={() => toggleMes(m)}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:opacity-80 transition-opacity"
                        style={{ borderColor: theme.border }}
                      >
                        {expandido
                          ? <ChevronDown className="h-4 w-4 flex-shrink-0" style={{ color: theme.textSecondary }} />
                          : <ChevronRight className="h-4 w-4 flex-shrink-0" style={{ color: theme.textSecondary }} />}
                        <div className="w-36 text-sm font-medium" style={{ color: theme.text }}>
                          {MESES_LARGO[m.mes - 1]} {m.anio}
                        </div>
                        <div className="flex-1 text-sm font-bold" style={{ color: theme.primary }}>
                          ${fmtMoney(m.total_pesos)}
                        </div>
                        <div className="text-xs" style={{ color: theme.textSecondary }}>
                          {m.cantidad_cuotas} cuotas
                        </div>
                        {(m.cuotas_vencidas ?? 0) > 0 && (
                          <span
                            className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-semibold"
                            style={{ backgroundColor: '#ef444422', color: '#ef4444' }}
                          >
                            <AlertTriangle className="h-3 w-3" /> {m.cuotas_vencidas} vencidas
                          </span>
                        )}
                      </button>
                      {expandido && (
                        <div className="px-4 pb-3" style={{ backgroundColor: theme.backgroundSecondary || theme.card }}>
                          {cargando && (
                            <div className="flex items-center gap-2 py-3 text-sm" style={{ color: theme.textSecondary }}>
                              <Loader2 className="h-4 w-4 animate-spin" /> Cargando cuotas...
                            </div>
                          )}
                          {!cargando && cuotas && cuotas.length === 0 && (
                            <div className="py-3 text-sm" style={{ color: theme.textSecondary }}>Sin cuotas en este mes.</div>
                          )}
                          {!cargando && cuotas && cuotas.length > 0 && (
                            <div className="space-y-1 pt-2">
                              {cuotas.map(c => (
                                <button
                                  key={c.cuota_id}
                                  type="button"
                                  onClick={() => verGastoMadre(c.gasto_id)}
                                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-xs hover:opacity-80 transition-opacity"
                                  style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
                                >
                                  <Calendar className="h-3.5 w-3.5 flex-shrink-0" style={{ color: theme.textSecondary }} />
                                  <span className="font-mono" style={{ color: theme.textSecondary }}>
                                    {c.fecha_vencimiento}
                                  </span>
                                  <span
                                    className="px-1.5 py-0.5 rounded-full text-[9px] uppercase font-semibold"
                                    style={{
                                      backgroundColor: `${ESTADO_COLORS[c.estado] || theme.textSecondary}22`,
                                      color: ESTADO_COLORS[c.estado] || theme.textSecondary,
                                    }}
                                  >
                                    {c.estado}
                                  </span>
                                  <span className="flex-1 truncate" style={{ color: theme.text }}>
                                    {c.concepto}
                                    {c.contacto_nombre && <span style={{ color: theme.textSecondary }}> — {c.contacto_nombre}</span>}
                                    {c.dependencia_nombre && <span style={{ color: theme.textSecondary }}> — {c.dependencia_nombre}</span>}
                                  </span>
                                  {c.total_cuotas && (
                                    <span style={{ color: theme.textSecondary }}>
                                      {c.numero_cuota}/{c.total_cuotas}
                                    </span>
                                  )}
                                  <span className="font-bold" style={{ color: theme.text }}>
                                    ${fmtMoney(c.monto)}
                                  </span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </ABMPage>

      {/* Sheet con detalle del gasto madre */}
      <Sheet
        open={!!gastoSelected || loadingGasto}
        onClose={() => setGastoSelected(null)}
        title={gastoSelected ? gastoSelected.concepto : 'Cargando...'}
        description={gastoSelected ? `Gasto #${gastoSelected.id}` : ''}
      >
        {loadingGasto && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" style={{ color: theme.textSecondary }} />
          </div>
        )}
        {gastoSelected && !loadingGasto && (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <KpiCard label="Monto" value={`$${fmtMoney(gastoSelected.monto_pesos)}`} accent={theme.primary} />
              <KpiCard label="Tipo" value={gastoSelected.tipo_financiacion} />
            </div>
            <div className="space-y-1">
              <p><span style={{ color: theme.textSecondary }}>Fecha:</span> {gastoSelected.fecha}</p>
              {gastoSelected.cuotas_total && (
                <p><span style={{ color: theme.textSecondary }}>Cuotas totales:</span> {gastoSelected.cuotas_total}</p>
              )}
            </div>
            {gastoSelected.cuotas && gastoSelected.cuotas.length > 0 && (
              <div>
                <h4 className="font-semibold mb-2" style={{ color: theme.text }}>
                  Cuotas del gasto ({gastoSelected.cuotas.length})
                </h4>
                <div className="space-y-1 max-h-72 overflow-y-auto">
                  {gastoSelected.cuotas.map(c => (
                    <div
                      key={c.id}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-md text-xs"
                      style={{ backgroundColor: theme.backgroundSecondary || theme.card, border: `1px solid ${theme.border}` }}
                    >
                      <span style={{ color: theme.textSecondary }}>#{c.numero}</span>
                      <span className="font-mono flex-1" style={{ color: theme.text }}>{c.fecha_vencimiento}</span>
                      <span
                        className="px-1.5 py-0.5 rounded-full text-[9px] uppercase font-semibold"
                        style={{
                          backgroundColor: `${ESTADO_COLORS[c.estado] || theme.textSecondary}22`,
                          color: ESTADO_COLORS[c.estado] || theme.textSecondary,
                        }}
                      >
                        {c.estado}
                      </span>
                      <span className="font-bold" style={{ color: theme.text }}>${fmtMoney(c.monto)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Sheet>
    </>
  );
}

// ---------- Subcomponentes ----------

function KpiCard({ label, value, sub, accent, icon }: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
  icon?: React.ReactNode;
}) {
  const { theme } = useTheme();
  return (
    <div
      className="p-3 rounded-xl"
      style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
    >
      <p className="text-[10px] uppercase font-bold opacity-60" style={{ color: theme.textSecondary }}>
        {label}
      </p>
      <p
        className="text-xl font-bold mt-1 inline-flex items-center gap-1.5"
        style={{ color: accent || theme.text }}
      >
        {icon}
        {value}
      </p>
      {sub && (
        <p className="text-[11px] mt-0.5" style={{ color: theme.textSecondary }}>
          {sub}
        </p>
      )}
    </div>
  );
}
