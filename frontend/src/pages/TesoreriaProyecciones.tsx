/**
 * Resumen de gastos. Muestra UN período a la vez (mes o año) con flechas
 * para navegar atrás/adelante. Filtros arriba (mismos que Tesorería home).
 *
 * Modo "mes": tabla de gastos del mes elegido + total.
 * Modo "año": 12 meses del año elegido, cada uno expandible con sus gastos.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  BarChart3, ChevronDown, ChevronRight, ChevronLeft, Calendar,
  Home, Building2,
} from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { TesoreriaHint } from '../components/tesoreria/TesoreriaHint';
import { ABMPage } from '../components/ui/ABMPage';
import { ModernSelect } from '../components/ui/ModernSelect';
import { PeriodNavigator } from '../components/ui/PeriodNavigator';
import { TIPO_CONTACTO_LABELS, TIPO_CONTACTO_COLORS } from '../lib/contactoIcons';
import {
  gastosApi, dependenciasApi, contactosApi, conceptosAbmApi, tiposConceptoApi,
  tiposEmpleadoApi, cajasApi,
} from '../lib/api';
import type {
  Gasto, Contacto, Concepto, TipoConcepto, TipoContacto, TipoEmpleadoCatalogo,
  Caja, FormaPago,
} from '../types';

const MESES_LARGO = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                     'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

// TIPO_CONTACTO_LABELS/COLORS: fuente canonica unica en lib/contactoIcons.tsx
const FORMA_PAGO_LABELS: Record<FormaPago, string> = {
  efectivo: 'Efectivo', transferencia: 'Transferencia', cheque: 'Cheque',
  tarjeta: 'Tarjeta', mercadopago: 'MercadoPago', otro: 'Otro',
};

type Modo = 'mes' | 'anio';

function fmtMoney(v: number | string): string {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return `$${n.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`;
}

interface GrupoMes {
  anio: number;
  mes: number;
  key: string;
  label: string;
  total: number;
  count: number;
  gastos: Gasto[];
}

export default function TesoreriaResumen() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const sinPermisos = user && user.rol !== 'admin' && user.rol !== 'supervisor';

  const today = new Date();
  const [modo, setModo] = useState<Modo>('mes');
  const [mesActual, setMesActual] = useState<number>(today.getMonth());
  const [anioActual, setAnioActual] = useState<number>(today.getFullYear());

  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [loading, setLoading] = useState(true);

  // Catalogos
  const [contactos, setContactos] = useState<Contacto[]>([]);
  const [dependencias, setDependencias] = useState<Array<{ id: number; nombre: string; color?: string | null }>>([]);
  const [tiposConcepto, setTiposConcepto] = useState<TipoConcepto[]>([]);
  const [conceptos, setConceptos] = useState<Concepto[]>([]);
  const [tiposEmpleado, setTiposEmpleado] = useState<TipoEmpleadoCatalogo[]>([]);
  const [cajas, setCajas] = useState<Caja[]>([]);

  // Filtros (mismos que Tesoreria home)
  const [tipoContactoFiltro, setTipoContactoFiltro] = useState<TipoContacto | ''>('');
  const [subtipoEmpleadoFiltro, setSubtipoEmpleadoFiltro] = useState<string>('');
  const [dependenciaFiltro, setDependenciaFiltro] = useState<string>('');
  const [tipoConceptoFiltro, setTipoConceptoFiltro] = useState<string>('');
  const [conceptoFiltro, setConceptoFiltro] = useState<string>('');
  const [formaPagoFiltro, setFormaPagoFiltro] = useState<FormaPago | ''>('');
  const [cajaFiltro, setCajaFiltro] = useState<string>('');

  // Mes expandido (solo aplica a modo 'anio')
  const [mesExpandido, setMesExpandido] = useState<string | null>(null);

  // Cargar TODO una sola vez (mismo patron que Tesoreria home).
  // El filtrado por periodo (mes/año) es 100% client-side -> sin flicker.
  useEffect(() => {
    if (sinPermisos) return;
    contactosApi.list({ activo: true, limit: 5000 }).then(r => setContactos(r.data || [])).catch(() => {});
    dependenciasApi.getMunicipio({ activo: true }).then(r => setDependencias(r.data || [])).catch(() => {});
    tiposConceptoApi.list({ activo: true }).then(r => setTiposConcepto(r.data || [])).catch(() => {});
    conceptosAbmApi.list({ activo: true }).then(r => setConceptos(r.data || [])).catch(() => {});
    tiposEmpleadoApi.list({ activo: true }).then(r => setTiposEmpleado(r.data || [])).catch(() => {});
    cajasApi.list({ activo: true, include_saldos: false }).then(r => setCajas(r.data || [])).catch(() => {});
    gastosApi.list({ limit: 1000 })
      .then(r => setGastos(r.data || []))
      .catch(() => setGastos([]))
      .finally(() => setLoading(false));
  }, [sinPermisos]);

  const contactosMap = useMemo(() => {
    const m = new Map<number, Contacto>();
    contactos.forEach(c => m.set(c.id, c));
    return m;
  }, [contactos]);

  const dependenciasMap = useMemo(() => {
    const m = new Map<number, { nombre: string; color?: string | null }>();
    dependencias.forEach(d => m.set(d.id, { nombre: d.nombre, color: d.color }));
    return m;
  }, [dependencias]);

  const conceptosDelTipoNombres = useMemo(() => {
    if (!tipoConceptoFiltro) return null;
    const tipoId = parseInt(tipoConceptoFiltro, 10);
    return new Set(conceptos.filter(c => c.tipo_concepto_id === tipoId).map(c => c.nombre.toLowerCase()));
  }, [conceptos, tipoConceptoFiltro]);

  const conceptoToTipoMap = useMemo(() => {
    const m = new Map<string, { nombre: string; color?: string | null }>();
    conceptos.forEach(c => m.set(c.nombre.toLowerCase(), {
      nombre: c.tipo_concepto_nombre || '',
      color: c.tipo_concepto_color,
    }));
    return m;
  }, [conceptos]);

  // Aplicar filtros (incluyendo el período mes/año, client-side, sin refetch)
  const filtered = useMemo(() => {
    const depId = dependenciaFiltro ? parseInt(dependenciaFiltro, 10) : null;
    const cajaId = cajaFiltro ? parseInt(cajaFiltro, 10) : null;
    return gastos.filter(g => {
      // Período: en modo mes, solo este mes+año. En modo año, solo este año.
      const d = new Date(g.fecha);
      if (modo === 'mes') {
        if (d.getMonth() !== mesActual || d.getFullYear() !== anioActual) return false;
      } else {
        if (d.getFullYear() !== anioActual) return false;
      }
      if (formaPagoFiltro && g.forma_pago !== formaPagoFiltro) return false;
      if (depId != null) {
        if (g.destino_tipo !== 'dependencia' || g.destino_dependencia_id !== depId) return false;
      }
      if (tipoContactoFiltro) {
        if (g.destino_tipo !== 'contacto') return false;
        const c = g.destino_contacto_id ? contactosMap.get(g.destino_contacto_id) : null;
        if (!c || c.tipo !== tipoContactoFiltro) return false;
        if (tipoContactoFiltro === 'empleado' && subtipoEmpleadoFiltro && (c.subtipo || '') !== subtipoEmpleadoFiltro) return false;
      }
      if (tipoConceptoFiltro && conceptosDelTipoNombres && !conceptosDelTipoNombres.has(g.concepto.toLowerCase())) return false;
      if (conceptoFiltro && g.concepto.toLowerCase() !== conceptoFiltro.toLowerCase()) return false;
      if (cajaId != null && (g as Gasto & { caja_id?: number | null }).caja_id !== cajaId) return false;
      return true;
    });
  }, [gastos, modo, mesActual, anioActual, formaPagoFiltro, dependenciaFiltro, tipoContactoFiltro,
      subtipoEmpleadoFiltro, tipoConceptoFiltro, conceptoFiltro, conceptosDelTipoNombres,
      cajaFiltro, contactosMap]);

  const totalGeneral = useMemo(() => filtered.reduce((s, g) => s + parseFloat(g.monto_pesos || '0'), 0), [filtered]);

  // Para modo "año": agrupar por mes (siempre 12 buckets)
  const gruposAnio = useMemo<GrupoMes[]>(() => {
    if (modo !== 'anio') return [];
    const buckets: GrupoMes[] = Array.from({ length: 12 }, (_, mes) => ({
      anio: anioActual, mes, key: `${anioActual}-${String(mes).padStart(2, '0')}`,
      label: `${MESES_LARGO[mes]} ${anioActual}`, total: 0, count: 0, gastos: [],
    }));
    for (const g of filtered) {
      const d = new Date(g.fecha);
      const m = d.getMonth();
      buckets[m].total += parseFloat(g.monto_pesos || '0');
      buckets[m].count += 1;
      buckets[m].gastos.push(g);
    }
    return buckets;
  }, [filtered, modo, anioActual]);

  // ========================== Navegación ==========================
  const irAtras = () => {
    if (modo === 'mes') {
      if (mesActual === 0) { setMesActual(11); setAnioActual(a => a - 1); }
      else setMesActual(m => m - 1);
    } else {
      setAnioActual(a => a - 1);
    }
  };
  const irAdelante = () => {
    if (modo === 'mes') {
      if (mesActual === 11) { setMesActual(0); setAnioActual(a => a + 1); }
      else setMesActual(m => m + 1);
    } else {
      setAnioActual(a => a + 1);
    }
  };
  const labelPeriodo = modo === 'mes' ? `${MESES_LARGO[mesActual]} ${anioActual}` : `Año ${anioActual}`;

  // ========================== Opciones combos ==========================
  const tipoContactoOptions = useMemo(() => ([
    { value: '', label: 'Contactos' },
    ...(Object.keys(TIPO_CONTACTO_LABELS) as TipoContacto[]).map(t => ({
      value: t, label: TIPO_CONTACTO_LABELS[t], color: TIPO_CONTACTO_COLORS[t],
    })),
  ]), []);
  const subtipoEmpleadoOptions = useMemo(() => ([
    { value: '', label: 'Empleados' },
    ...tiposEmpleado.map(t => ({ value: t.nombre, label: t.nombre, color: t.color || undefined })),
  ]), [tiposEmpleado]);
  const dependenciaOptions = useMemo(() => ([
    { value: '', label: 'Dependencias' },
    ...dependencias.map(d => ({ value: String(d.id), label: d.nombre, color: d.color || undefined })),
  ]), [dependencias]);
  const tipoConceptoOptions = useMemo(() => ([
    { value: '', label: 'Tipos' },
    ...tiposConcepto.map(t => ({ value: String(t.id), label: t.nombre, color: t.color || undefined })),
  ]), [tiposConcepto]);
  const conceptosFiltradosPorTipo = useMemo(() => {
    if (!tipoConceptoFiltro) return conceptos;
    const tid = parseInt(tipoConceptoFiltro, 10);
    return conceptos.filter(c => c.tipo_concepto_id === tid);
  }, [conceptos, tipoConceptoFiltro]);
  const conceptoOptions = useMemo(() => ([
    { value: '', label: 'Conceptos' },
    ...conceptosFiltradosPorTipo.map(c => ({ value: c.nombre, label: c.nombre })),
  ]), [conceptosFiltradosPorTipo]);
  const formaPagoOptions = useMemo(() => ([
    { value: '', label: 'Formas de pago' },
    ...(Object.keys(FORMA_PAGO_LABELS) as FormaPago[]).map(fp => ({ value: fp, label: FORMA_PAGO_LABELS[fp] })),
  ]), []);
  const cajaOptions = useMemo(() => ([
    { value: '', label: 'Cajas' },
    ...cajas.map(c => ({ value: String(c.id), label: c.nombre, color: c.color || undefined })),
  ]), [cajas]);

  if (sinPermisos) return <p className="p-6 text-sm">Sin permisos.</p>;

  // ========================== Filtros header ==========================
  const extraFilters = (
    <div className="flex flex-wrap items-center gap-2 w-full resumen-filters-row">
      <style>{`
        .resumen-filters-row .ts-fitem button,
        .resumen-filters-row .ts-fitem > div > button {
          height: 40px !important;
          padding-top: 0 !important;
          padding-bottom: 0 !important;
          font-size: 0.875rem !important;
          border-radius: 0.75rem !important;
        }
      `}</style>

      {/* Navegador de periodo unificado (switch Mes/Año integrado) */}
      <div className="flex-shrink-0">
        <PeriodNavigator
          modo={modo as 'mes' | 'anio'}
          onModoChange={(m) => setModo(m)}
          mes={mesActual}
          anio={anioActual}
          onPrev={irAtras}
          onNext={irAdelante}
        />
      </div>

      <div className="min-w-[170px] flex-shrink-0 ts-fitem">
        <ModernSelect
          value={tipoContactoFiltro}
          onChange={(v) => { setTipoContactoFiltro(v as TipoContacto | ''); setSubtipoEmpleadoFiltro(''); }}
          options={tipoContactoOptions} placeholder="Todos los contactos" searchable
        />
      </div>
      {tipoContactoFiltro === 'empleado' && tiposEmpleado.length > 0 && (
        <div className="min-w-[180px] flex-shrink-0 ts-fitem">
          <ModernSelect value={subtipoEmpleadoFiltro} onChange={setSubtipoEmpleadoFiltro}
            options={subtipoEmpleadoOptions} placeholder="Todos los empleados" searchable />
        </div>
      )}
      <div className="min-w-[190px] flex-shrink-0 ts-fitem">
        <ModernSelect value={dependenciaFiltro} onChange={setDependenciaFiltro}
          options={dependenciaOptions} placeholder="Todas las dependencias" searchable />
      </div>
      <div className="min-w-[170px] flex-shrink-0 ts-fitem">
        <ModernSelect value={tipoConceptoFiltro}
          onChange={(v) => { setTipoConceptoFiltro(v); setConceptoFiltro(''); }}
          options={tipoConceptoOptions} placeholder="Todos los tipos" searchable />
      </div>
      <div className="min-w-[180px] flex-shrink-0 ts-fitem">
        <ModernSelect value={conceptoFiltro} onChange={setConceptoFiltro}
          options={conceptoOptions} placeholder="Todos los conceptos" searchable />
      </div>
      <div className="min-w-[160px] flex-shrink-0 ts-fitem">
        <ModernSelect value={formaPagoFiltro} onChange={(v) => setFormaPagoFiltro(v as FormaPago | '')}
          options={formaPagoOptions} placeholder="Todas las formas" searchable />
      </div>
      {cajas.length > 0 && (
        <div className="min-w-[170px] flex-shrink-0 ts-fitem">
          <ModernSelect value={cajaFiltro} onChange={setCajaFiltro}
            options={cajaOptions} placeholder="Todas las cajas" searchable />
        </div>
      )}
    </div>
  );

  return (
    <>
      <TesoreriaHint titulo="Resumen" storageKey="resumen">
        Mirá gasto por <b>mes</b> o <b>año</b> con las flechas ← →. Aplicá los filtros de arriba
        para ver cuánto se gastó en cada rubro/contacto/dependencia. En modo "Año" cada mes se expande.
      </TesoreriaHint>

      <ABMPage
        title="Resumen"
        icon={<BarChart3 className="h-5 w-5" />}
        backLink="/gestion/tesoreria"
        searchPlaceholder="Buscar..."
        searchValue=""
        onSearchChange={() => {}}
        extraFilters={extraFilters}
        loading={loading}
        isEmpty={!loading && filtered.length === 0}
        emptyMessage={`No hay gastos en ${labelPeriodo} con esos filtros.`}
        defaultViewMode="cards"
      >
        <div className="col-span-full space-y-3">
          {/* Total prominente */}
          <div
            className="rounded-xl p-4 flex items-center gap-4"
            style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
          >
            <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${theme.primary}20` }}>
              <BarChart3 className="h-6 w-6" style={{ color: theme.primary }} />
            </div>
            <div className="flex-1">
              <p className="text-xs uppercase font-semibold" style={{ color: theme.textSecondary }}>
                {labelPeriodo} · {filtered.length} {filtered.length === 1 ? 'gasto' : 'gastos'}
              </p>
              <p className="text-2xl font-bold tabular-nums" style={{ color: theme.primary }}>{fmtMoney(totalGeneral)}</p>
            </div>
          </div>

          {/* Modo MES: lista lineal con detalle */}
          {modo === 'mes' && filtered.length > 0 && (
            <div className="rounded-xl overflow-hidden" style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}>
              <TablaGastos
                gastos={filtered}
                dependenciasMap={dependenciasMap}
                contactosMap={contactosMap}
                conceptoToTipoMap={conceptoToTipoMap}
                theme={theme}
              />
            </div>
          )}

          {/* Modo AÑO: 12 meses, cada uno colapsable */}
          {modo === 'anio' && gruposAnio.map(g => (
            <MesRow
              key={g.key}
              grupo={g}
              expandido={mesExpandido === g.key}
              onToggle={() => setMesExpandido(prev => prev === g.key ? null : g.key)}
              dependenciasMap={dependenciasMap}
              contactosMap={contactosMap}
              conceptoToTipoMap={conceptoToTipoMap}
            />
          ))}
        </div>
      </ABMPage>
    </>
  );
}

function TablaGastos({
  gastos, dependenciasMap, contactosMap, conceptoToTipoMap, theme,
}: {
  gastos: Gasto[];
  dependenciasMap: Map<number, { nombre: string; color?: string | null }>;
  contactosMap: Map<number, Contacto>;
  conceptoToTipoMap: Map<string, { nombre: string; color?: string | null }>;
  theme: ReturnType<typeof useTheme>['theme'];
}) {
  const total = gastos.reduce((s, g) => s + parseFloat(g.monto_pesos || '0'), 0);
  return (
    <table className="w-full text-sm">
      <thead>
        <tr style={{ backgroundColor: theme.backgroundSecondary }}>
          <th className="text-left px-3 py-2 text-[10px] font-semibold uppercase" style={{ color: theme.textSecondary }}>Fecha</th>
          <th className="text-left px-3 py-2 text-[10px] font-semibold uppercase" style={{ color: theme.textSecondary }}>Concepto</th>
          <th className="text-left px-3 py-2 text-[10px] font-semibold uppercase" style={{ color: theme.textSecondary }}>Tipo</th>
          <th className="text-left px-3 py-2 text-[10px] font-semibold uppercase" style={{ color: theme.textSecondary }}>Destino</th>
          <th className="text-right px-3 py-2 text-[10px] font-semibold uppercase" style={{ color: theme.textSecondary }}>Monto</th>
        </tr>
      </thead>
      <tbody>
        {gastos.sort((a, b) => a.fecha.localeCompare(b.fecha)).map(g => {
          const tipo = conceptoToTipoMap.get(g.concepto.toLowerCase());
          const dep = g.destino_tipo === 'dependencia' && g.destino_dependencia_id ? dependenciasMap.get(g.destino_dependencia_id) : null;
          const c = g.destino_tipo === 'contacto' && g.destino_contacto_id ? contactosMap.get(g.destino_contacto_id) : null;
          return (
            <tr key={g.id} className="border-t" style={{ borderColor: theme.border }}>
              <td className="px-3 py-2 text-xs" style={{ color: theme.textSecondary }}>{new Date(g.fecha).toLocaleDateString('es-AR')}</td>
              <td className="px-3 py-2 font-medium" style={{ color: theme.text }}>{g.concepto}</td>
              <td className="px-3 py-2">
                {tipo?.nombre ? (
                  <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: `${tipo.color || theme.primary}20`, color: tipo.color || theme.primary }}>
                    {tipo.nombre}
                  </span>
                ) : <span className="text-xs opacity-50">—</span>}
              </td>
              <td className="px-3 py-2 text-xs" style={{ color: theme.textSecondary }}>
                {c ? (
                  <span className="inline-flex items-center gap-1"><Home className="h-3 w-3" />{c.nombre} {c.apellido || ''}</span>
                ) : dep ? (
                  <span className="inline-flex items-center gap-1" style={{ color: dep.color || undefined }}><Building2 className="h-3 w-3" />{dep.nombre}</span>
                ) : '—'}
              </td>
              <td className="px-3 py-2 text-right tabular-nums font-semibold" style={{ color: theme.text }}>
                ${parseFloat(g.monto_pesos).toLocaleString('es-AR', { maximumFractionDigits: 0 })}
              </td>
            </tr>
          );
        })}
        <tr style={{ backgroundColor: theme.backgroundSecondary, borderTop: `2px solid ${theme.border}` }}>
          <td colSpan={4} className="px-3 py-2 text-xs font-bold uppercase" style={{ color: theme.text }}>Total</td>
          <td className="px-3 py-2 text-right text-base font-bold tabular-nums" style={{ color: theme.primary }}>
            ${total.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
          </td>
        </tr>
      </tbody>
    </table>
  );
}

function MesRow({
  grupo, expandido, onToggle, dependenciasMap, contactosMap, conceptoToTipoMap,
}: {
  grupo: GrupoMes;
  expandido: boolean;
  onToggle: () => void;
  dependenciasMap: Map<number, { nombre: string; color?: string | null }>;
  contactosMap: Map<number, Contacto>;
  conceptoToTipoMap: Map<string, { nombre: string; color?: string | null }>;
}) {
  const { theme } = useTheme();
  const vacio = grupo.count === 0;

  return (
    <div className="rounded-xl overflow-hidden" style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}`, opacity: vacio ? 0.6 : 1 }}>
      <button
        onClick={vacio ? undefined : onToggle}
        disabled={vacio}
        className="w-full px-4 py-3 flex items-center gap-3 transition-colors hover:bg-opacity-50"
        style={{ cursor: vacio ? 'default' : 'pointer' }}
      >
        {!vacio && (expandido
          ? <ChevronDown className="h-4 w-4 flex-shrink-0" style={{ color: theme.textSecondary }} />
          : <ChevronRight className="h-4 w-4 flex-shrink-0" style={{ color: theme.textSecondary }} />
        )}
        {vacio && <div className="w-4 flex-shrink-0" />}
        <Calendar className="h-4 w-4 flex-shrink-0" style={{ color: theme.primary }} />
        <span className="font-bold text-sm flex-shrink-0" style={{ color: theme.text }}>{grupo.label}</span>
        <span className="text-[11px] flex-shrink-0" style={{ color: theme.textSecondary }}>{grupo.count} gastos</span>
        <div className="flex-1" />
        <span className="text-base font-bold tabular-nums flex-shrink-0" style={{ color: vacio ? theme.textSecondary : theme.primary }}>
          ${grupo.total.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
        </span>
      </button>

      {expandido && !vacio && (
        <div className="border-t" style={{ borderColor: theme.border }}>
          <TablaGastos
            gastos={grupo.gastos}
            dependenciasMap={dependenciasMap}
            contactosMap={contactosMap}
            conceptoToTipoMap={conceptoToTipoMap}
            theme={theme}
          />
        </div>
      )}
    </div>
  );
}
