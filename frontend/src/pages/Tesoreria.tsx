import { useEffect, useMemo, useState } from 'react';
import {
  Wallet, Users, Map as MapIcon, TrendingUp, Trash2, Eye,
  Building2, Home, Calendar, Briefcase, ChevronLeft, ChevronRight, CalendarClock, Settings,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { TesoreriaHint } from '../components/tesoreria/TesoreriaHint';
import { CrearGastoWizard } from '../components/tesoreria/CrearGastoWizard';
import { PeriodNavigator, type PeriodModo } from '../components/ui/PeriodNavigator';
import {
  GastoDetalleSheet, calcEstadoAgregado, ESTADO_AGREGADO_META,
  type EstadoAgregado,
} from '../components/tesoreria/GastoDetalleSheet';
import { ABMPage, ABMTable, ABMTableAction } from '../components/ui/ABMPage';
import { ModernSelect } from '../components/ui/ModernSelect';
import { CalendarView } from '../components/ui/CalendarView';
import { gastosApi, dependenciasApi, contactosApi, tiposConceptoApi, conceptosAbmApi, tiposEmpleadoApi } from '../lib/api';
import type { Gasto, TipoFinanciacion, FormaPago, Contacto, TipoConcepto, Concepto, TipoContacto, TipoEmpleadoCatalogo } from '../types';

const TIPO_FIN_COLORS: Record<TipoFinanciacion, string> = {
  contado: '#10b981',
  cuotas: '#3b82f6',
  prestamo: '#8b5cf6',
  recurrente: '#f59e0b',
};

const FORMA_PAGO_LABELS: Record<FormaPago, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  cheque: 'Cheque',
  tarjeta: 'Tarjeta',
  mercadopago: 'MercadoPago',
  otro: 'Otro',
};

const TIPO_CONTACTO_LABELS: Record<TipoContacto, string> = {
  concejal: 'Concejales',
  empleado: 'Empleados',
  profesional: 'Profesionales',
  proveedor: 'Proveedores',
  contratista: 'Contratistas',
  beneficiario: 'Beneficiarios',
  otro: 'Otros',
};
const TIPO_CONTACTO_COLORS: Record<TipoContacto, string> = {
  concejal: '#8b5cf6', empleado: '#3b82f6', profesional: '#f59e0b',
  proveedor: '#10b981', contratista: '#06b6d4', beneficiario: '#ec4899', otro: '#71717a',
};

const MESES_LARGO = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

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
  const [tipoContactoFiltro, setTipoContactoFiltro] = useState<TipoContacto | ''>('');
  const [subtipoEmpleadoFiltro, setSubtipoEmpleadoFiltro] = useState<string>('');
  const [dependenciaFiltro, setDependenciaFiltro] = useState<string>('');
  // Filtro de tipo de concepto eliminado — listado plano de conceptos.
  const tipoConceptoFiltro = '';
  const [conceptoFiltro, setConceptoFiltro] = useState<string>('');
  const [estadoFiltro, setEstadoFiltro] = useState<EstadoAgregado | ''>('');

  // Navegador de periodos. modo: 'mes' | 'anio'. mes/anio = filtro activo.
  // todosLosMeses = sin filtro temporal.
  const today = new Date();
  const [modoPeriodo, setModoPeriodo] = useState<PeriodModo>('mes');
  const [mesActual, setMesActual] = useState<number>(today.getMonth());  // 0-11
  const [anioActual, setAnioActual] = useState<number>(today.getFullYear());
  const [todosLosMeses, setTodosLosMeses] = useState<boolean>(false);

  const [dependencias, setDependencias] = useState<DependenciaOption[]>([]);
  const [contactos, setContactos] = useState<Contacto[]>([]);
  const [tiposConcepto, setTiposConcepto] = useState<TipoConcepto[]>([]);
  const [conceptos, setConceptos] = useState<Concepto[]>([]);
  const [tiposEmpleado, setTiposEmpleado] = useState<TipoEmpleadoCatalogo[]>([]);
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

  const fetchCatalogoConceptos = async () => {
    try {
      const [tiposRes, conceptosRes] = await Promise.all([
        tiposConceptoApi.list({ activo: true }),
        conceptosAbmApi.list({ activo: true }),
      ]);
      setTiposConcepto(tiposRes.data || []);
      setConceptos(conceptosRes.data || []);
    } catch {
      setTiposConcepto([]);
      setConceptos([]);
    }
  };

  const fetchTiposEmpleado = async () => {
    try {
      const res = await tiposEmpleadoApi.list({ activo: true });
      setTiposEmpleado(res.data || []);
    } catch {
      setTiposEmpleado([]);
    }
  };

  useEffect(() => {
    fetchGastos();
    fetchDependencias();
    fetchContactos();
    fetchCatalogoConceptos();
    fetchTiposEmpleado();
  }, []);

  // Refrescar el gasto seleccionado cuando se actualiza la lista
  useEffect(() => {
    if (!gastoSeleccionado) return;
    const actualizado = gastos.find(g => g.id === gastoSeleccionado.id);
    if (actualizado) setGastoSeleccionado(actualizado);
  }, [gastos]); // eslint-disable-line react-hooks/exhaustive-deps

  // Conceptos del tipo seleccionado (para el dropdown de concepto)
  const conceptosDelTipo = useMemo(() => {
    if (!tipoConceptoFiltro) return conceptos;
    const tipoId = parseInt(tipoConceptoFiltro, 10);
    return conceptos.filter(c => c.tipo_concepto_id === tipoId);
  }, [conceptos, tipoConceptoFiltro]);

  const conceptosDelTipoNombres = useMemo(
    () => new Set(conceptosDelTipo.map(c => c.nombre.toLowerCase())),
    [conceptosDelTipo]
  );

  // Map contactos por id (para filtrar por tipo y mostrar nombre en la grilla)
  const contactosMap = useMemo(() => {
    const m = new Map<number, Contacto>();
    contactos.forEach(c => m.set(c.id, c));
    return m;
  }, [contactos]);

  // Map concepto (string) -> tipo (con color), para badge en la grilla
  const conceptoToTipoMap = useMemo(() => {
    const m = new Map<string, { nombre: string; color: string | null | undefined }>();
    conceptos.forEach(c => {
      m.set(c.nombre.toLowerCase(), {
        nombre: c.tipo_concepto_nombre || '',
        color: c.tipo_concepto_color,
      });
    });
    return m;
  }, [conceptos]);

  // Tipos de empleado: tomamos del catálogo (tesoreria_tipos_empleado),
  // no de los subtipos legacy. Si el catálogo está vacío, fallback al subtipo.
  const subtiposEmpleado = useMemo(() => {
    if (tiposEmpleado.length > 0) {
      return tiposEmpleado.map(t => t.nombre);
    }
    const set = new Set<string>();
    contactos.forEach(c => {
      if (c.tipo === 'empleado' && c.subtipo && c.subtipo.trim()) {
        set.add(c.subtipo.trim());
      }
    });
    return Array.from(set).sort();
  }, [tiposEmpleado, contactos]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    const depId = dependenciaFiltro ? parseInt(dependenciaFiltro, 10) : null;

    return gastos.filter(g => {
      // Filtro temporal segun modoPeriodo
      if (!todosLosMeses) {
        const d = new Date(g.fecha);
        if (modoPeriodo === 'anio') {
          if (d.getFullYear() !== anioActual) return false;
        } else {
          if (d.getMonth() !== mesActual || d.getFullYear() !== anioActual) return false;
        }
      }
      // Dependencia
      if (depId != null) {
        if (g.destino_tipo !== 'dependencia' || g.destino_dependencia_id !== depId) return false;
      }
      // Tipo de contacto (y subtipo si empleado)
      if (tipoContactoFiltro) {
        if (g.destino_tipo !== 'contacto') return false;
        const c = g.destino_contacto_id ? contactosMap.get(g.destino_contacto_id) : null;
        if (!c || c.tipo !== tipoContactoFiltro) return false;
        if (tipoContactoFiltro === 'empleado' && subtipoEmpleadoFiltro && (c.subtipo || '') !== subtipoEmpleadoFiltro) return false;
      }
      // Tipo de concepto: matchea por NOMBRE de concepto contra los del tipo
      if (tipoConceptoFiltro && !conceptosDelTipoNombres.has(g.concepto.toLowerCase())) return false;
      // Concepto exacto
      if (conceptoFiltro && g.concepto.toLowerCase() !== conceptoFiltro.toLowerCase()) return false;
      if (estadoFiltro && calcEstadoAgregado(g) !== estadoFiltro) return false;
      if (s) {
        const hay = g.concepto.toLowerCase().includes(s)
          || (g.descripcion?.toLowerCase().includes(s) ?? false);
        if (!hay) return false;
      }
      return true;
    });
  }, [gastos, search, tipoContactoFiltro, subtipoEmpleadoFiltro, dependenciaFiltro, tipoConceptoFiltro, conceptoFiltro, conceptosDelTipoNombres, estadoFiltro, mesActual, anioActual, modoPeriodo, todosLosMeses, contactosMap]);

  // Totalizador (refleja todos los filtros activos)
  const totales = useMemo(() => {
    let totalPesos = 0;
    let totalImputado = 0;
    let totalUsd = 0;
    let conUsd = 0;
    for (const g of filtered) {
      totalPesos += parseFloat(g.monto_pesos || '0');
      for (const p of (g.proyectos || [])) {
        totalImputado += parseFloat(String(p.monto_asignado || '0'));
      }
      if (g.monto_usd) {
        totalUsd += parseFloat(g.monto_usd);
        conUsd += 1;
      }
    }
    return { totalPesos, totalImputado, totalUsd, conUsd, cantidad: filtered.length };
  }, [filtered]);

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

  // Opciones de tipo de contacto
  const tipoContactoOptions = useMemo(() => ([
    { value: '', label: 'Todos los contactos' },
    ...(Object.keys(TIPO_CONTACTO_LABELS) as TipoContacto[]).map(tc => ({
      value: tc,
      label: TIPO_CONTACTO_LABELS[tc],
      color: TIPO_CONTACTO_COLORS[tc],
    })),
  ]), []);

  // Opciones de subtipo de empleado (usa el catalogo si existe)
  const subtipoEmpleadoOptions = useMemo(() => {
    const items = tiposEmpleado.length > 0
      ? tiposEmpleado.map(t => ({ value: t.nombre, label: t.nombre, color: t.color || undefined }))
      : subtiposEmpleado.map(s => ({ value: s, label: s, color: undefined as string | undefined }));
    return [{ value: '', label: 'Todos los empleados' }, ...items];
  }, [tiposEmpleado, subtiposEmpleado]);

  // Opciones de tipo de concepto (desde el catalogo per-muni)
  const tipoConceptoOptions = useMemo(() => ([
    { value: '', label: 'Todos los tipos' },
    ...tiposConcepto.map(t => ({
      value: String(t.id),
      label: t.nombre,
      color: t.color || undefined,
    })),
  ]), [tiposConcepto]);

  // Opciones de concepto (filtradas por tipo si hay seleccionado)
  const conceptoOptions = useMemo(() => ([
    { value: '', label: 'Todos los conceptos' },
    ...conceptosDelTipo.map(c => ({
      value: c.nombre,
      label: c.nombre,
      color: c.tipo_concepto_color || undefined,
    })),
  ]), [conceptosDelTipo]);

  // Navegacion de periodos (respeta modo: salta de a mes o de a año entero)
  const irAtras = () => {
    setTodosLosMeses(false);
    if (modoPeriodo === 'anio') {
      setAnioActual(a => a - 1);
    } else {
      if (mesActual === 0) { setMesActual(11); setAnioActual(a => a - 1); }
      else setMesActual(m => m - 1);
    }
  };
  const irAdelante = () => {
    setTodosLosMeses(false);
    if (modoPeriodo === 'anio') {
      setAnioActual(a => a + 1);
    } else {
      if (mesActual === 11) { setMesActual(0); setAnioActual(a => a + 1); }
      else setMesActual(m => m + 1);
    }
  };

  // Chips de estado agregado
  const estadoChips = (
    <div className="inline-flex items-center gap-1.5 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
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

  // Iguala altura/padding/radius de TODOS los triggers (ModernSelect)
  // y del navegador de meses (que usa <button> directo). Una sola CSS,
  // un solo wrapper class. Esto da look orgnico.
  const secondaryFilters = (
    <div className="flex flex-wrap items-center gap-2 tesoreria-filters-row">
      <style>{`
        .tesoreria-filters-row .ts-fitem button {
          height: 40px !important;
          padding-top: 0 !important;
          padding-bottom: 0 !important;
          font-size: 0.875rem !important;
          border-radius: 0.75rem !important;
        }
      `}</style>

      <div className="min-w-[170px] flex-shrink-0 ts-fitem">
        <ModernSelect
          value={tipoContactoFiltro}
          onChange={(v) => { setTipoContactoFiltro(v as TipoContacto | ''); setSubtipoEmpleadoFiltro(''); }}
          options={tipoContactoOptions}
          placeholder="Todos los contactos"
          searchable
        />
      </div>

      {/* Combo dinamico: solo si elegiste "empleado" */}
      {tipoContactoFiltro === 'empleado' && subtiposEmpleado.length > 0 && (
        <div className="min-w-[180px] flex-shrink-0 ts-fitem">
          <ModernSelect
            value={subtipoEmpleadoFiltro}
            onChange={setSubtipoEmpleadoFiltro}
            options={subtipoEmpleadoOptions}
            placeholder="Todos los empleados"
            searchable
          />
        </div>
      )}

      <div className="min-w-[190px] flex-shrink-0 ts-fitem">
        <ModernSelect
          value={dependenciaFiltro}
          onChange={setDependenciaFiltro}
          options={dependenciaOptions}
          placeholder="Todas las dependencias"
          searchable
        />
      </div>

      {/* Filtro 'Tipo de concepto' eliminado — listado plano (1 nivel). */}

      <div className="min-w-[180px] flex-shrink-0 ts-fitem">
        <ModernSelect
          value={conceptoFiltro}
          onChange={setConceptoFiltro}
          options={conceptoOptions}
          placeholder="Todos los conceptos"
          searchable
        />
      </div>

      {/* Navegador de periodos: switch Mes/Año integrado + flechas + Todos */}
      <div className="flex-shrink-0">
        <PeriodNavigator
          modo={modoPeriodo}
          onModoChange={(m) => { setModoPeriodo(m); setTodosLosMeses(false); }}
          mes={mesActual}
          anio={anioActual}
          modoTodos={todosLosMeses}
          onPrev={irAtras}
          onNext={irAdelante}
          onToggleTodos={() => setTodosLosMeses(v => !v)}
        />
      </div>

      {/* Pills de estado: inline al final, sin push agresivo a la derecha
          (en tablet/mobile evita que se apilen verticalmente). */}
      <div className="flex-shrink-0 ml-auto max-w-full overflow-hidden">
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
        to="/gestion/configuracion/tesoreria"
        className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all hover:scale-[1.02]"
        style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}`, color: theme.text }}
      >
        <Briefcase className="h-3.5 w-3.5" /> Proyectos
      </Link>
      <Link
        to="/gestion/tesoreria/agenda"
        className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all hover:scale-[1.02]"
        style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}`, color: theme.text }}
      >
        <CalendarClock className="h-3.5 w-3.5" /> Agenda
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
        <TrendingUp className="h-3.5 w-3.5" /> Resumen
      </Link>
      <Link
        to="/gestion/configuracion/tesoreria"
        className="inline-flex items-center justify-center w-9 h-9 rounded-xl transition-all hover:scale-105 hover:rotate-45"
        style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}`, color: theme.textSecondary }}
        title="Configuración de Tesorería"
      >
        <Settings className="h-4 w-4" />
      </Link>
    </>
  );

  // Renderer del destino para la celda de la tabla. Ahora muestra el NOMBRE.
  const renderDestino = (g: Gasto) => {
    if (g.destino_tipo === 'contacto') {
      const c = g.destino_contacto_id ? contactosMap.get(g.destino_contacto_id) : null;
      if (c) {
        const color = TIPO_CONTACTO_COLORS[c.tipo] || theme.primary;
        return (
          <span className="inline-flex items-center gap-1 text-xs" title={`${TIPO_CONTACTO_LABELS[c.tipo]} · ${c.subtipo || ''}`}>
            <Home className="h-3 w-3" style={{ color }} />
            <span className="font-medium truncate max-w-[150px]" style={{ color: theme.text }}>{c.nombre} {c.apellido || ''}</span>
          </span>
        );
      }
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
          key: 'tipo_concepto',
          header: 'Tipo',
          render: (g) => {
            const t = conceptoToTipoMap.get(g.concepto.toLowerCase());
            if (!t || !t.nombre) return <span className="text-xs opacity-50">—</span>;
            const c = t.color || theme.primary;
            return (
              <span
                className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full whitespace-nowrap"
                style={{ backgroundColor: `${c}20`, color: c }}
              >
                {t.nombre}
              </span>
            );
          },
          sortValue: (g) => conceptoToTipoMap.get(g.concepto.toLowerCase())?.nombre || '',
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
          key: 'forma_pago',
          header: 'Forma pago',
          render: (g) => (
            <span className="text-[11px]" style={{ color: theme.textSecondary }}>
              {FORMA_PAGO_LABELS[g.forma_pago] || g.forma_pago}
            </span>
          ),
          sortValue: (g) => g.forma_pago,
        },
        {
          key: 'tipo_financiacion',
          header: 'Financ.',
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
        guidedView={
          <CalendarView<Gasto>
            items={filtered}
            getId={(g) => g.id}
            getDate={(g) => g.fecha}
            getLabel={(g) => g.concepto}
            getAmount={(g) => parseFloat(g.monto_pesos)}
            getColor={(g) => TIPO_FIN_COLORS[g.tipo_financiacion]}
            getTooltip={(g) => {
              const dep = g.destino_dependencia_id ? dependenciasMap.get(g.destino_dependencia_id) : null;
              return `${g.concepto} · ${dep?.nombre || 'Contacto'} · $${parseFloat(g.monto_pesos).toLocaleString('es-AR', { maximumFractionDigits: 0 })}`;
            }}
            onItemClick={(g) => openDetalle(g)}
            mesesStorageKey="tesoreria_meses_visibles"
            helperText="💡 Click sobre un gasto para ver el detalle. El calendario refleja los filtros activos."
            formatMoney={(n) => `$${n.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`}
            renderDetailRow={(g) => {
              const dep = g.destino_dependencia_id ? dependenciasMap.get(g.destino_dependencia_id) : null;
              const estMeta = ESTADO_AGREGADO_META[calcEstadoAgregado(g)];
              return (
                <div onClick={() => openDetalle(g)} className="flex items-center gap-2 p-2 rounded-lg cursor-pointer hover:shadow-sm" style={{ backgroundColor: theme.backgroundSecondary }}>
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${TIPO_FIN_COLORS[g.tipo_financiacion]}20` }}>
                    <span className="text-xs font-bold" style={{ color: TIPO_FIN_COLORS[g.tipo_financiacion] }}>{new Date(g.fecha).getDate()}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: theme.text }}>{g.concepto}</p>
                    <p className="text-[11px] truncate" style={{ color: theme.textSecondary }}>
                      {dep?.nombre || 'Contacto'} · {new Date(g.fecha).toLocaleDateString('es-AR')}
                    </p>
                  </div>
                  <span className="font-bold tabular-nums whitespace-nowrap" style={{ color: theme.text }}>
                    ${parseFloat(g.monto_pesos).toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                  </span>
                  <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full flex-shrink-0" style={{ backgroundColor: estMeta.bg, color: estMeta.color }}>
                    {estMeta.label}
                  </span>
                </div>
              );
            }}
          />
        }
        viewStorageKey="tesoreria_view"
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

      {/* Totalizador. Refleja todos los filtros activos. */}
      {!loading && (
        <div className="px-4 mt-3">
          <div
            className="rounded-xl px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-2"
            style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
          >
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase font-semibold" style={{ color: theme.textSecondary }}>
                Filtrado
              </span>
              <span className="text-lg font-bold tabular-nums" style={{ color: theme.primary }}>
                ${totales.totalPesos.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
              </span>
              <span className="text-xs" style={{ color: theme.textSecondary }}>
                ({totales.cantidad} {totales.cantidad === 1 ? 'gasto' : 'gastos'})
              </span>
            </div>
            {totales.totalImputado > 0 && (
              <div className="flex items-center gap-2">
                <Briefcase className="h-3.5 w-3.5" style={{ color: theme.textSecondary }} />
                <span className="text-xs" style={{ color: theme.textSecondary }}>Imputado a proyectos:</span>
                <span className="text-sm font-semibold tabular-nums" style={{ color: theme.text }}>
                  ${totales.totalImputado.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                </span>
              </div>
            )}
            {totales.totalUsd > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs" style={{ color: theme.textSecondary }}>USD equiv.:</span>
                <span className="text-sm font-semibold tabular-nums" style={{ color: theme.text }}>
                  US$ {totales.totalUsd.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                </span>
                <span className="text-[10px]" style={{ color: theme.textSecondary }}>
                  ({totales.conUsd} con cotización)
                </span>
              </div>
            )}
            <div className="ml-auto flex items-center gap-1.5 text-[11px]" style={{ color: theme.textSecondary }}>
              <Calendar className="h-3 w-3" />
              {todosLosMeses
                ? 'Todos los períodos'
                : modoPeriodo === 'anio'
                  ? `Año ${anioActual}`
                  : `${MESES_LARGO[mesActual]} ${anioActual}`}
            </div>
          </div>
        </div>
      )}

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
