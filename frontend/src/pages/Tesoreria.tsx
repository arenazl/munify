import { useEffect, useMemo, useState } from 'react';
import {
  Wallet, Users, Map as MapIcon, TrendingUp, Trash2, Eye,
  Building2, Home, Calendar, Briefcase, ChevronLeft, ChevronRight, CalendarClock, Settings,
  Sparkles, Wrench, Package, Tag, ArrowUpRight,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { TesoreriaHint } from '../components/tesoreria/TesoreriaHint';
import { CrearGastoWizard } from '../components/tesoreria/CrearGastoWizard';
import { PeriodNavigator, type PeriodModo } from '../components/ui/PeriodNavigator';
import { DateRangePicker, type DateRange } from '../components/ui/DateRangePicker';
import {
  GastoDetalleSheet, calcEstadoAgregado, ESTADO_AGREGADO_META,
  type EstadoAgregado,
} from '../components/tesoreria/GastoDetalleSheet';
import { ABMPage, ABMTable, ABMTableAction, type AbmToolbar } from '../components/ui/ABMPage';
import { StatusPill } from '../components/ui/StatusPill';
import { primaryButtonStyle } from '../components/ui/PrimaryButton';
import type { KpiSpec } from '../components/ui/KpiCard';
import { ModernSelect } from '../components/ui/ModernSelect';
import { PillsOrSelect } from '../components/ui/PillsOrSelect';
import { CalendarView } from '../components/ui/CalendarView';
import { gastosApi, dependenciasApi, contactosApi, tiposConceptoApi, conceptosAbmApi, tiposEmpleadoApi } from '../lib/api';
import { conceptoIcon } from '../lib/conceptoIcons';
import { contactoIconByTipo, TIPO_CONTACTO_COLORS, TIPO_CONTACTO_LABELS } from '../lib/contactoIcons';
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

// TIPO_CONTACTO_LABELS y TIPO_CONTACTO_COLORS: fuente canonica en lib/contactoIcons.tsx

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

// 'en_mora' eliminado por pedido del user (ocultar por ahora). Si
// algun dia se quiere volver, agregar de nuevo aca.
const ESTADO_FILTROS: { value: EstadoAgregado | ''; label: string }[] = [
  { value: '', label: 'Todos' },
  { value: 'al_dia', label: 'Al día' },
  { value: 'pendiente', label: 'Pendiente' },
  { value: 'completado', label: 'Completado' },
];

export default function Tesoreria() {
  const { theme } = useTheme();
  const { user } = useAuth();

  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalServer, setTotalServer] = useState(0);
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
  // Rango de fechas (desde/hasta). Si esta seteado, PISA al PeriodNavigator.
  const [rangoFechas, setRangoFechas] = useState<DateRange>({ desde: '', hasta: '' });
  const rangoActivo = !!(rangoFechas.desde && rangoFechas.hasta);

  const [dependencias, setDependencias] = useState<DependenciaOption[]>([]);
  const [contactos, setContactos] = useState<Contacto[]>([]);
  const [tiposConcepto, setTiposConcepto] = useState<TipoConcepto[]>([]);
  const [conceptos, setConceptos] = useState<Concepto[]>([]);
  const [tiposEmpleado, setTiposEmpleado] = useState<TipoEmpleadoCatalogo[]>([]);
  const [wizardOpen, setWizardOpen] = useState(false);

  // Side modal de detalle
  const [gastoSeleccionado, setGastoSeleccionado] = useState<Gasto | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Paginación client-side (50 items por página)
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

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
      // Filtros server-side: search, dependencia, concepto, rango fechas.
      // El resto (tipoContacto, subtipoEmpleado, tipoConcepto, estadoAgregado,
      // periodo mes/anio) se aplican client-side sobre la pagina actual.
      const params: any = { skip: (page - 1) * pageSize, limit: pageSize };
      if (search.trim()) params.search = search.trim();
      if (dependenciaFiltro) params.dependencia_id = parseInt(dependenciaFiltro, 10);
      if (conceptoFiltro) params.concepto = conceptoFiltro;
      if (rangoActivo) { params.desde = rangoFechas.desde; params.hasta = rangoFechas.hasta; }
      else if (!todosLosMeses && modoPeriodo === 'mes') {
        // Filtro temporal por mes: primer dia y ultimo dia
        const ini = new Date(anioActual, mesActual, 1);
        const fin = new Date(anioActual, mesActual + 1, 0);
        params.desde = ini.toISOString().slice(0, 10);
        params.hasta = fin.toISOString().slice(0, 10);
      } else if (!todosLosMeses && modoPeriodo === 'anio') {
        params.desde = `${anioActual}-01-01`;
        params.hasta = `${anioActual}-12-31`;
      }
      const res = await gastosApi.list(params);
      setGastos(res.data);
      const total = res.headers?.['x-total-count'] || res.headers?.['X-Total-Count'];
      if (total) setTotalServer(parseInt(total as string, 10));
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
    fetchDependencias();
    fetchContactos();
    fetchCatalogoConceptos();
    fetchTiposEmpleado();
  }, []);

  // Re-fetch gastos cada vez que cambia un filtro server-side o la paginacion.
  // Filtros client-side (tipoContacto, subtipoEmpleado, estadoAgregado) NO
  // disparan re-fetch — solo filtran lo que ya esta en memoria.
  useEffect(() => {
    fetchGastos();
    /* eslint-disable-next-line */
  }, [page, pageSize, dependenciaFiltro, conceptoFiltro, mesActual, anioActual, modoPeriodo, todosLosMeses, rangoFechas.desde, rangoFechas.hasta]);

  // Search con debounce
  useEffect(() => {
    setPage(1);
    const t = setTimeout(() => fetchGastos(), 400);
    return () => clearTimeout(t);
    /* eslint-disable-next-line */
  }, [search]);

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
      // Filtro temporal: si hay rango activo, pisa al PeriodNavigator.
      if (rangoActivo) {
        const fechaISO = g.fecha.slice(0, 10);
        if (fechaISO < rangoFechas.desde || fechaISO > rangoFechas.hasta) return false;
      } else if (!todosLosMeses) {
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
        const c = g.destino_contacto_id ? contactosMap.get(g.destino_contacto_id) : null;
        const contactoStr = c ? `${c.nombre || ''} ${c.apellido || ''}`.trim().toLowerCase() : '';
        const hay = g.concepto.toLowerCase().includes(s)
          || (g.descripcion?.toLowerCase().includes(s) ?? false)
          || (contactoStr && contactoStr.includes(s));
        if (!hay) return false;
      }
      return true;
    });
  }, [gastos, search, tipoContactoFiltro, subtipoEmpleadoFiltro, dependenciaFiltro, tipoConceptoFiltro, conceptoFiltro, conceptosDelTipoNombres, estadoFiltro, mesActual, anioActual, modoPeriodo, todosLosMeses, rangoFechas, rangoActivo, contactosMap]);

  // Server ya paginó: `filtered` ya tiene solo la página actual con filtros
  // client-side extra aplicados encima.
  const paginatedFiltered = filtered;

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

  // KPIs por tipo de concepto. Agrupa los gastos filtrados por nombre del
  // tipo de concepto y devuelve los top 3 por monto. La primera card del
  // dashboard es el total general; estas son las 3 categorias secundarias.
  const kpisData = useMemo(() => {
    type Bucket = { nombre: string; color: string; total: number; count: number };
    const byTipo = new Map<string, Bucket>();
    let sinTipoTotal = 0;
    let sinTipoCount = 0;
    for (const g of filtered) {
      const tipo = conceptoToTipoMap.get(g.concepto.toLowerCase());
      const monto = parseFloat(g.monto_pesos || '0');
      if (tipo && tipo.nombre) {
        const key = tipo.nombre;
        const prev = byTipo.get(key) || {
          nombre: tipo.nombre,
          color: tipo.color || theme.primary,
          total: 0,
          count: 0,
        };
        prev.total += monto;
        prev.count += 1;
        byTipo.set(key, prev);
      } else {
        sinTipoTotal += monto;
        sinTipoCount += 1;
      }
    }
    const buckets: Bucket[] = Array.from(byTipo.values()).sort((a, b) => b.total - a.total);
    if (sinTipoTotal > 0) {
      buckets.push({ nombre: 'Otros', color: theme.textSecondary, total: sinTipoTotal, count: sinTipoCount });
    }
    return buckets.slice(0, 3);
  }, [filtered, conceptoToTipoMap, theme]);

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

  // Orden de aparicion en la grilla (gastos): para cada combo, mapeamos value -> primer
  // indice donde aparece. Las opciones presentes se ordenan por ese indice (las que
  // tienen elementos primero, en orden de la grilla); las que no aparecen, al final.
  const ordering = useMemo(() => {
    const tipoContacto = new Map<string, number>();
    const subtipoEmpleado = new Map<string, number>();
    const dependencia = new Map<string, number>();
    // tipoConcepto: keyed por nombre (los TC options usan id como value, asi que
    // construyo un set por id->nombre y mapeo por nombre cuando comparo).
    const tipoConceptoByNombre = new Map<string, number>();
    const concepto = new Map<string, number>();
    gastos.forEach((g, idx) => {
      // Concepto
      const cKey = (g.concepto || '').toLowerCase();
      if (cKey && !concepto.has(cKey)) concepto.set(cKey, idx);
      // Tipo concepto (via map concepto->tipo)
      const tc = conceptoToTipoMap.get(cKey);
      if (tc && tc.nombre && !tipoConceptoByNombre.has(tc.nombre.toLowerCase())) {
        tipoConceptoByNombre.set(tc.nombre.toLowerCase(), idx);
      }
      // Dependencia
      if (g.destino_tipo === 'dependencia' && g.destino_dependencia_id) {
        const k = String(g.destino_dependencia_id);
        if (!dependencia.has(k)) dependencia.set(k, idx);
      }
      // Tipo de contacto + subtipo
      if (g.destino_tipo === 'contacto' && g.destino_contacto_id) {
        const c = contactosMap.get(g.destino_contacto_id);
        if (c) {
          if (!tipoContacto.has(c.tipo)) tipoContacto.set(c.tipo, idx);
          if (c.subtipo && !subtipoEmpleado.has(c.subtipo)) subtipoEmpleado.set(c.subtipo, idx);
        }
      }
    });
    return { tipoContacto, subtipoEmpleado, dependencia, tipoConceptoByNombre, concepto };
  }, [gastos, contactosMap, conceptoToTipoMap]);

  // Helper: ordena options no-vacios por presencia en grilla, marca emphasized.
  // value '' (placeholder) siempre va primero sin emphasis.
  function sortByPresence<T extends { value: string; label: string; color?: string }>(
    items: T[],
    order: Map<string, number>,
  ): Array<T & { emphasized?: boolean }> {
    return items.map(it => {
      const idx = order.get(it.value.toLowerCase()) ?? order.get(it.value);
      return { ...it, emphasized: idx != null, _idx: idx ?? Number.POSITIVE_INFINITY };
    }).sort((a, b) => a._idx - b._idx).map(({ _idx, ...rest }) => rest as T & { emphasized?: boolean });
  }

  // Opciones de tipo de contacto
  const tipoContactoOptions = useMemo(() => {
    const items = (Object.keys(TIPO_CONTACTO_LABELS) as TipoContacto[]).map(tc => {
      const Icon = contactoIconByTipo(tc);
      return {
        value: tc,
        label: TIPO_CONTACTO_LABELS[tc],
        color: TIPO_CONTACTO_COLORS[tc],
        icon: <Icon className="h-3 w-3" />,
      };
    });
    return [{ value: '', label: 'Contactos' }, ...sortByPresence(items, ordering.tipoContacto)];
  }, [ordering.tipoContacto]);

  // Opciones de subtipo de empleado (usa el catalogo si existe)
  const subtipoEmpleadoOptions = useMemo(() => {
    const items = tiposEmpleado.length > 0
      ? tiposEmpleado.map(t => ({ value: t.nombre, label: t.nombre, color: t.color || undefined }))
      : subtiposEmpleado.map(s => ({ value: s, label: s, color: undefined as string | undefined }));
    return [{ value: '', label: 'Empleados' }, ...sortByPresence(items, ordering.subtipoEmpleado)];
  }, [tiposEmpleado, subtiposEmpleado, ordering.subtipoEmpleado]);

  // Opciones de tipo de concepto (desde el catalogo per-muni). Como aca el value
  // es el id pero el ordering es por nombre, hacemos el match manual.
  const tipoConceptoOptions = useMemo(() => {
    const items = tiposConcepto.map(t => {
      const idx = ordering.tipoConceptoByNombre.get((t.nombre || '').toLowerCase());
      return {
        value: String(t.id),
        label: t.nombre,
        color: t.color || undefined,
        emphasized: idx != null,
        _idx: idx ?? Number.POSITIVE_INFINITY,
      };
    }).sort((a, b) => a._idx - b._idx).map(({ _idx, ...rest }) => rest);
    return [{ value: '', label: 'Tipos' }, ...items];
  }, [tiposConcepto, ordering.tipoConceptoByNombre]);

  // Opciones de concepto (filtradas por tipo si hay seleccionado)
  const conceptoOptions = useMemo(() => {
    const items = conceptosDelTipo.map(c => {
      const Icon = conceptoIcon(c.nombre);
      return {
        value: c.nombre,
        label: c.nombre,
        color: c.tipo_concepto_color || undefined,
        icon: <Icon className="h-3 w-3" />,
      };
    });
    return [{ value: '', label: 'Conceptos' }, ...sortByPresence(items, ordering.concepto)];
  }, [conceptosDelTipo, ordering.concepto]);

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

  // Chips de estado agregado — colapsan a ModernSelect cuando no entran.
  const estadoChipsOptions = ESTADO_FILTROS.map(e => ({
    value: e.value,
    label: e.label,
    color: e.value ? ESTADO_AGREGADO_META[e.value]?.color : undefined,
  }));
  const estadoChips = (
    <PillsOrSelect
      value={estadoFiltro}
      onChange={(v) => setEstadoFiltro(v as EstadoAgregado | '')}
      options={estadoChipsOptions}
      placeholder="Estado"
      size="sm"
    />
  );

  // Opciones de dependencia
  const dependenciaOptions = useMemo(() => {
    const items = dependencias.map(d => ({
      value: String(d.id),
      label: d.nombre,
      color: d.color || undefined,
    }));
    return [{ value: '', label: 'Dependencias' }, ...sortByPresence(items, ordering.dependencia)];
  }, [dependencias, ordering.dependencia]);

  // Iguala altura/padding/radius de TODOS los triggers (ModernSelect)
  // y del navegador de meses (que usa <button> directo). Una sola CSS,
  // un solo wrapper class. Esto da look orgnico.
  // Toolbar declarativo (API nueva). ABMPage lo renderiza con su layout estandar.
  const tesoreriaToolbar: AbmToolbar = {
    combos: [
      {
        key: 'tipoContacto',
        placeholder: 'Contactos',
        value: tipoContactoFiltro,
        onChange: (v) => { setTipoContactoFiltro(v as TipoContacto | ''); setSubtipoEmpleadoFiltro(''); },
        // tipoContactoOptions ya trae el item '' como placeholder, lo sacamos
        // porque ABMPage lo re-inyecta.
        options: tipoContactoOptions.filter(o => o.value !== ''),
        searchable: true,
        minWidth: 170,
      },
      {
        key: 'subtipoEmpleado',
        placeholder: 'Empleados',
        value: subtipoEmpleadoFiltro,
        onChange: setSubtipoEmpleadoFiltro,
        options: subtipoEmpleadoOptions.filter(o => o.value !== ''),
        searchable: true,
        minWidth: 180,
        visible: tipoContactoFiltro === 'empleado' && subtiposEmpleado.length > 0,
      },
      {
        key: 'dependencia',
        placeholder: 'Dependencias',
        value: dependenciaFiltro,
        onChange: setDependenciaFiltro,
        options: dependenciaOptions.filter(o => o.value !== ''),
        searchable: true,
        minWidth: 190,
      },
      {
        key: 'concepto',
        placeholder: 'Conceptos',
        value: conceptoFiltro,
        onChange: setConceptoFiltro,
        options: conceptoOptions.filter(o => o.value !== ''),
        searchable: true,
        minWidth: 180,
      },
    ],
    customAfterCombos: [
      <div key="period" style={{ opacity: rangoActivo ? 0.45 : 1, pointerEvents: rangoActivo ? 'none' : 'auto' }}>
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
      </div>,
      <DateRangePicker
        key="rango"
        value={rangoFechas}
        onChange={setRangoFechas}
        placeholder="Rango de fechas"
        allowClear
      />,
    ],
    customAtEnd: [estadoChips],
  };

  // Accesos rapidos como headerActions. Look canonico: gradient ghost del
  // acento del tema (primaryButtonStyle 'ghost' = tinta sutil + border 30).
  const ghostStyle = primaryButtonStyle('ghost', theme.primary, theme.primaryHover, theme.card, theme.text, theme.border);
  const ghostClass = "inline-flex items-center gap-2 h-[34px] px-3 rounded-lg text-[12px] font-semibold transition-all hover:scale-105 hover:-translate-y-0.5 active:scale-95";
  const headerActions = (
    <>
      <Link to="/gestion/tesoreria/agenda" className={ghostClass} style={ghostStyle}>
        <CalendarClock className="h-3.5 w-3.5" /> Pagos
      </Link>
      <Link to="/gestion/tesoreria/contactos" className={ghostClass} style={ghostStyle}>
        <Users className="h-3.5 w-3.5" /> Contactos
      </Link>
      <Link to="/gestion/tesoreria/mapa" className={ghostClass} style={ghostStyle}>
        <MapIcon className="h-3.5 w-3.5" /> Ubicación
      </Link>
      <Link to="/gestion/tesoreria/proyecciones" className={ghostClass} style={ghostStyle}>
        <TrendingUp className="h-3.5 w-3.5" /> Proyección
      </Link>
      <Link
        to="/gestion/configuracion/tesoreria"
        className="inline-flex items-center justify-center w-9 h-9 rounded-lg transition-all hover:scale-105 hover:rotate-45"
        style={ghostStyle}
        title="Configuración de Tesorería"
      >
        <Settings className="h-4 w-4" />
      </Link>
    </>
  );

  // Renderer del destino: icono por TIPO de contacto (uniforme en chip cuadrado del
  // color del tipo) + nombre. Para destinos a dependencia, Building2.
  const renderDestino = (g: Gasto) => {
    if (g.destino_tipo === 'contacto') {
      const c = g.destino_contacto_id ? contactosMap.get(g.destino_contacto_id) : null;
      const tipo = c?.tipo || 'otro';
      const Icon = contactoIconByTipo(tipo);
      const color = TIPO_CONTACTO_COLORS[tipo as TipoContacto] || theme.primary;
      const nombre = c ? `${c.nombre} ${c.apellido || ''}`.trim() : 'Contacto';
      return (
        <span className="inline-flex items-center gap-1.5 text-xs" title={c ? `${TIPO_CONTACTO_LABELS[c.tipo]} · ${c.subtipo || ''}` : undefined}>
          <span
            className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: `${color}20` }}
          >
            <Icon className="h-3 w-3" style={{ color }} />
          </span>
          <span className="font-medium truncate max-w-[150px]" style={{ color: theme.text }}>{nombre}</span>
        </span>
      );
    }
    const dep = g.destino_dependencia_id ? dependenciasMap.get(g.destino_dependencia_id) : null;
    const color = dep?.color || theme.primary;
    return (
      <span className="inline-flex items-center gap-1.5 text-xs" title={dep?.nombre}>
        <span
          className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: `${color}20` }}
        >
          <Building2 className="h-3 w-3" style={{ color }} />
        </span>
        <span className="font-medium truncate max-w-[140px]" style={{ color: theme.text }}>{dep?.nombre || 'Secretaría'}</span>
      </span>
    );
  };

  const renderEstadoBadge = (g: Gasto) => {
    const est = calcEstadoAgregado(g);
    const meta = ESTADO_AGREGADO_META[est];
    return <StatusPill label={meta.label} color={meta.color} size="xs" />;
  };

  const tableView = (
    <ABMTable<Gasto>
      data={paginatedFiltered}
      keyExtractor={(g) => g.id}
      onRowClick={openDetalle}
      groupBy={{
        sortKey: 'fecha',
        getKey: (g) => g.fecha,
        renderLabel: (key, items) => {
          const d = new Date(key + 'T12:00:00');
          const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
          const ayer = new Date(hoy); ayer.setDate(ayer.getDate() - 1);
          const dStripped = new Date(d); dStripped.setHours(0, 0, 0, 0);
          let label: string;
          if (dStripped.getTime() === hoy.getTime()) label = 'Hoy';
          else if (dStripped.getTime() === ayer.getTime()) label = 'Ayer';
          else label = d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
          return (
            <div className="flex items-center gap-3">
              <div
                className="w-12 text-center px-1 py-0.5 rounded-md text-[10px] uppercase font-bold leading-tight"
                style={{ backgroundColor: theme.card, color: theme.textSecondary, border: `1px solid ${theme.border}` }}
              >
                <div className="text-base font-bold" style={{ color: theme.text }}>{d.getDate().toString().padStart(2, '0')}</div>
                <div>{d.toLocaleDateString('es-AR', { month: 'short' }).replace('.', '')}</div>
              </div>
              <div>
                <div className="font-bold text-xs" style={{ color: theme.text }}>{label}</div>
                <div className="text-[11px]" style={{ color: theme.textSecondary }}>
                  {items.length} {items.length === 1 ? 'movimiento' : 'movimientos'}
                </div>
              </div>
            </div>
          );
        },
        renderSubtotal: (_key, items) => {
          const sum = items.reduce((s, g) => s + parseFloat(g.monto_pesos || '0'), 0);
          return (
            <div className="text-right">
              <span className="text-[10px] uppercase font-bold mr-2" style={{ color: theme.textSecondary }}>Subtotal</span>
              <span className="text-sm font-bold tabular-nums" style={{ color: theme.text }}>
                ${sum.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
              </span>
            </div>
          );
        },
      }}
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
          render: (g) => {
            const Icon = conceptoIcon(g.concepto);
            const tipo = conceptoToTipoMap.get(g.concepto.toLowerCase());
            const color = tipo?.color || theme.primary;
            return (
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: `${color}20` }}
                >
                  <Icon className="h-3 w-3" style={{ color }} />
                </span>
                <span className="font-medium">{g.concepto}</span>
              </span>
            );
          },
          sortValue: (g) => g.concepto,
        },
        {
          key: 'destino',
          header: 'Contacto',
          render: renderDestino,
          sortable: false,
        },
        {
          key: 'tipo_concepto',
          header: 'Tipo',
          render: (g) => {
            const t = conceptoToTipoMap.get(g.concepto.toLowerCase());
            if (!t || !t.nombre) return <span className="text-xs opacity-50">—</span>;
            return <StatusPill label={t.nombre} color={t.color || theme.primary} size="xs" />;
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
          render: (g) => <StatusPill label={g.tipo_financiacion} color={TIPO_FIN_COLORS[g.tipo_financiacion]} size="xs" />,
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

  // Detectar gastos importados de Bartolo que cayeron en conceptos genericos
  // y necesitan curacion manual. Solo aparece el banner si hay alguno.
  const dudosos = useMemo(() => {
    const TAG = '[BARTOLO-DUDOSO]';
    const list = gastos.filter(g => g.observaciones && g.observaciones.includes(TAG));
    const monto = list.reduce((s, g) => s + parseFloat(g.monto_pesos || '0'), 0);
    return { count: list.length, monto };
  }, [gastos]);

  // Render de una card de gasto (vista cards). Extraido para poder usarlo
  // desde groupBy.renderItem manteniendo el mismo look-and-feel.
  // Iniciales y color estable para el avatar del destino.
  // Hash simple del string -> hue HSL para que cada destino mantenga su color.
  const getAvatarMeta = (label: string) => {
    const clean = (label || '?').trim();
    const parts = clean.split(/\s+/).filter(Boolean);
    const initials = parts.length >= 2
      ? (parts[0][0] + parts[1][0]).toUpperCase()
      : clean.slice(0, 2).toUpperCase();
    let hash = 0;
    for (let i = 0; i < clean.length; i++) hash = (hash * 31 + clean.charCodeAt(i)) | 0;
    const hue = Math.abs(hash) % 360;
    return {
      initials: initials || '?',
      bg: `hsl(${hue}, 70%, 92%)`,
      fg: `hsl(${hue}, 55%, 38%)`,
    };
  };

  const renderGastoCard = (g: Gasto) => {
    const dep = g.destino_dependencia_id ? dependenciasMap.get(g.destino_dependencia_id) : null;
    const contacto = g.destino_contacto_id ? contactosMap.get(g.destino_contacto_id) : null;
    const destinoLabel = g.destino_tipo === 'contacto'
      ? (contacto ? `${contacto.nombre || ''} ${contacto.apellido || ''}`.trim() || 'Contacto' : 'Contacto')
      : (dep?.nombre || 'Secretaría');
    const avatar = getAvatarMeta(destinoLabel);
    const tipoMeta = conceptoToTipoMap.get(g.concepto.toLowerCase());
    const estMeta = ESTADO_AGREGADO_META[calcEstadoAgregado(g)];
    return (
      <div
        key={g.id}
        onClick={() => openDetalle(g)}
        className="rounded-xl p-3 cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-md active:scale-[0.99] flex items-center gap-3"
        style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
      >
        {/* Avatar circular con iniciales */}
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold"
          style={{ backgroundColor: avatar.bg, color: avatar.fg }}
        >
          {avatar.initials}
        </div>

        {/* Concepto + destino + tipo (badge) */}
        <div className="flex-1 min-w-0">
          <p className="font-semibold truncate text-sm" style={{ color: theme.text }}>{g.concepto}</p>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            <span className="text-[11px] truncate" style={{ color: theme.textSecondary }}>
              {destinoLabel}
            </span>
            {tipoMeta?.nombre && (
              <>
                <span className="text-[11px]" style={{ color: theme.textSecondary }}>·</span>
                <span
                  className="inline-flex items-center gap-1 text-[10px] font-semibold"
                  style={{ color: tipoMeta.color || theme.primary }}
                >
                  <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: tipoMeta.color || theme.primary }} />
                  {tipoMeta.nombre}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Monto + estado */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <span
            className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1"
            style={{ backgroundColor: estMeta.bg, color: estMeta.color, border: `1px solid ${estMeta.color}30` }}
          >
            <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: estMeta.color }} />
            {estMeta.label}
          </span>
          <p className="text-base font-bold tabular-nums whitespace-nowrap" style={{ color: theme.text }}>
            ${parseFloat(g.monto_pesos).toLocaleString('es-AR', { maximumFractionDigits: 0 })}
          </p>
        </div>
      </div>
    );
  };

  // Periodo activo en label corto para el KPI principal.
  const periodoLabel = todosLosMeses
    ? 'todos los períodos'
    : modoPeriodo === 'anio'
      ? `Año ${anioActual}`
      : `${MESES_LARGO[mesActual]} ${anioActual}`;

  // KPIs outlined estandar — 4 fijos. ABMPage los renderiza con <KpiRow>.
  const iconByTipo = (nombre: string) => {
    const n = nombre.toLowerCase();
    if (n.includes('personal') || n.includes('suel') || n.includes('honor')) return Users;
    if (n.includes('servic') || n.includes('mantenim')) return Wrench;
    if (n.includes('insumo') || n.includes('compra') || n.includes('mater')) return Package;
    return Tag;
  };

  const kpisSpec: KpiSpec[] = [
    {
      label: `Gastado · ${periodoLabel}`,
      value: `$${totales.totalPesos.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`,
      icon: Wallet,
      color: theme.primary,
      footnote: `${totales.cantidad} ${totales.cantidad === 1 ? 'movimiento' : 'movimientos'}`,
      highlighted: true,
    },
    ...kpisData.map<KpiSpec>((k) => ({
      label: k.nombre,
      value: `$${k.total.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`,
      icon: iconByTipo(k.nombre),
      color: k.color,
      footnote: `${(totales.totalPesos > 0 ? (k.total / totales.totalPesos) * 100 : 0).toFixed(1)}% · ${k.count} mov.`,
      pct: totales.totalPesos > 0 ? (k.total / totales.totalPesos) * 100 : 0,
    })),
  ].slice(0, 4);

  // ===================================================================
  // Side panel "Bandeja IA" — 3 cards demo hardcodeadas (placeholders).
  // Solo aparece en desktop (lg+). Mas adelante se va a conectar con la
  // curacion real de Bartolo, pero por ahora es solo presentacion.
  // ===================================================================
  const bandejaIaDemo = [
    { id: 1, ia: 94, fecha: '09/05', titulo: 'Combustible YPF · Camión recolector', proveedor: 'YPF San Pedro Norte', monto: 182500, categoria: 'Servicios', categoriaColor: '#22c55e', hint: 'Categoría sugerida: Combustibles' },
    { id: 2, ia: 62, fecha: '09/05', titulo: 'Compras varias',                       proveedor: 'Ferretería Don Aldo',  monto: 48200,  categoria: 'Insumos',   categoriaColor: '#f59e0b', hint: 'Sin proveedor cargado' },
    { id: 3, ia: 78, fecha: '09/05', titulo: 'Mantenimiento alumbrado público',      proveedor: 'Elec. Norte SRL',      monto: 96000,  categoria: 'Servicios', categoriaColor: '#a855f7', hint: 'Monto inusual para este proveedor' },
  ];
  const bandejaTotal = bandejaIaDemo.reduce((s, b) => s + b.monto, 0);

  const sidePanelContent = (
    <div className="space-y-3 sticky top-4">
      {/* Header bandeja */}
      <div
        className="rounded-xl p-3 flex items-center gap-2"
        style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
      >
        <Sparkles className="h-4 w-4" style={{ color: theme.primary }} />
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-semibold" style={{ color: theme.textSecondary }}>
            {bandejaIaDemo.length} gastos esperando aprobación
          </div>
        </div>
      </div>

      {/* Total a revisar + aprobar todo */}
      <div
        className="rounded-xl p-3 flex items-center justify-between gap-2"
        style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
      >
        <div>
          <div className="text-[10px] uppercase font-bold" style={{ color: theme.textSecondary }}>
            Total a revisar
          </div>
          <div className="text-lg font-bold tabular-nums" style={{ color: theme.text }}>
            ${bandejaTotal.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
          </div>
        </div>
        <button
          className="px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap"
          style={{ backgroundColor: theme.text, color: theme.card }}
        >
          Aprobar todo
        </button>
      </div>

      {/* Cards de items sugeridos */}
      {bandejaIaDemo.map((b) => (
        <div
          key={b.id}
          className="rounded-xl p-3"
          style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
        >
          <div className="flex items-center justify-between mb-2">
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded-md inline-flex items-center gap-1"
              style={{ backgroundColor: `${theme.primary}15`, color: theme.primary }}
            >
              <Sparkles className="h-3 w-3" />
              IA · {b.ia}%
            </span>
            <span className="text-[11px]" style={{ color: theme.textSecondary }}>{b.fecha}</span>
          </div>
          <div className="font-semibold text-sm" style={{ color: theme.text }}>{b.titulo}</div>
          <div className="text-[11px] mb-2" style={{ color: theme.textSecondary }}>{b.proveedor}</div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg font-bold tabular-nums" style={{ color: theme.text }}>
              ${b.monto.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
            </span>
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded-md inline-flex items-center gap-1"
              style={{ backgroundColor: `${b.categoriaColor}15`, color: b.categoriaColor }}
            >
              <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: b.categoriaColor }} />
              {b.categoria}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] mb-3" style={{ color: theme.textSecondary }}>
            <Sparkles className="h-3 w-3" />
            {b.hint}
          </div>
          <div className="flex items-center gap-1.5">
            <button
              className="flex-1 px-3 py-1.5 rounded-lg text-xs font-semibold"
              style={{ backgroundColor: theme.primary, color: theme.primaryText || '#ffffff' }}
            >
              ✓ Aprobar
            </button>
            <button
              className="px-3 py-1.5 rounded-lg text-xs font-semibold"
              style={{ backgroundColor: theme.backgroundSecondary, color: theme.text, border: `1px solid ${theme.border}` }}
            >
              Editar
            </button>
            <button
              className="px-2 py-1.5 rounded-lg text-xs"
              style={{ backgroundColor: theme.backgroundSecondary, color: theme.textSecondary, border: `1px solid ${theme.border}` }}
            >
              ×
            </button>
          </div>
        </div>
      ))}

      <div
        className="rounded-xl p-3 text-center text-[11px] italic"
        style={{ backgroundColor: theme.backgroundSecondary, color: theme.textSecondary }}
      >
        La IA aprende de tus decisiones · cada confirmación mejora la categorización
      </div>
    </div>
  );

  // ===================================================================
  // Group by date config — solo aplica en vista cards. ABMPage agrupa los
  // items y renderiza headers [DD MES · Hoy/Ayer · N mov] + subtotal.
  // ===================================================================
  const groupByConfig = {
    items: paginatedFiltered,
    getKey: (g: Gasto) => g.fecha,
    renderLabel: (key: string, items: Gasto[]) => {
      const d = new Date(key + 'T12:00:00');
      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);
      const ayer = new Date(hoy);
      ayer.setDate(ayer.getDate() - 1);
      const dStripped = new Date(d);
      dStripped.setHours(0, 0, 0, 0);
      let label: string;
      if (dStripped.getTime() === hoy.getTime()) label = 'Hoy';
      else if (dStripped.getTime() === ayer.getTime()) label = 'Ayer';
      else label = d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
      return (
        <div className="flex items-center gap-3">
          <div
            className="w-12 text-center px-1 py-0.5 rounded-md text-[10px] uppercase font-bold leading-tight"
            style={{ backgroundColor: theme.card, color: theme.textSecondary, border: `1px solid ${theme.border}` }}
          >
            <div className="text-base font-bold" style={{ color: theme.text }}>{d.getDate().toString().padStart(2, '0')}</div>
            <div>{d.toLocaleDateString('es-AR', { month: 'short' }).replace('.', '')}</div>
          </div>
          <div>
            <div className="font-bold" style={{ color: theme.text }}>{label}</div>
            <div className="text-[11px]" style={{ color: theme.textSecondary }}>
              {items.length} {items.length === 1 ? 'movimiento' : 'movimientos'}
            </div>
          </div>
        </div>
      );
    },
    renderSubtotal: (_key: string, items: Gasto[]) => {
      const sum = items.reduce((s, g) => s + parseFloat(g.monto_pesos || '0'), 0);
      return (
        <div className="text-right">
          <div className="text-[10px] uppercase font-bold" style={{ color: theme.textSecondary }}>Subtotal</div>
          <div className="text-base font-bold tabular-nums" style={{ color: theme.text }}>
            ${sum.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
          </div>
        </div>
      );
    },
    renderItem: (g: Gasto) => renderGastoCard(g),
  };

  return (
    <>
      <div className="pt-3">
        <TesoreriaHint titulo="Bienvenido a Tesorería" storageKey="home">
          Acá cargás los gastos del municipio: sueldos, pagos a proveedores,
          préstamos, subsidios. Cada gasto se asigna a una <b>Secretaría</b> o
          a un <b>Contacto</b>. Total este mes:{' '}
          <span className="font-bold" style={{ color: theme.primary }}>
            ${totalMes.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
          </span>
        </TesoreriaHint>
      </div>

      {/* Banner curacion Bartolo — solo aparece si hay dudosos pendientes.
          Margen vertical generoso para separarlo del hint y del header. */}
      {dudosos.count > 0 && (
        <Link
          to="/gestion/tesoreria/curacion-bartolo"
          className="relative block mb-4 overflow-hidden rounded-xl shadow-sm transition-all hover:-translate-y-0.5"
          style={{
            background: `linear-gradient(135deg, ${theme.primary}12 0%, ${theme.primary}06 60%, ${theme.card} 100%)`,
            border: `1px solid ${theme.primary}30`,
          }}
        >
          <div className="absolute inset-x-0 top-0 h-0.5" style={{ backgroundColor: theme.primary }} />
          <div className="p-4 flex items-start gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm"
              style={{ backgroundColor: `${theme.primary}25`, color: theme.primary }}
            >
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-base mb-1" style={{ color: theme.text }}>
                {dudosos.count} gastos importados pendientes de revisar
              </h3>
              <div className="text-sm leading-relaxed" style={{ color: theme.textSecondary }}>
                La IA los clasificó como "Compras/Otros varios" · Total: ${dudosos.monto.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
              </div>
            </div>
            <span
              className="text-xs font-semibold px-3 py-1.5 rounded-lg whitespace-nowrap flex-shrink-0"
              style={{ backgroundColor: `${theme.primary}20`, color: theme.primary, border: `1px solid ${theme.primary}40` }}
            >
              Revisar →
            </span>
          </div>
        </Link>
      )}

      <ABMPage
        title="Tesorería"
        icon={<Wallet className="h-5 w-5" />}
        buttonLabel="Nuevo Gasto"
        onAdd={() => setWizardOpen(true)}
        searchPlaceholder="Buscar por concepto, contacto o descripción..."
        searchValue={search}
        onSearchChange={setSearch}
        toolbar={tesoreriaToolbar}
        headerActions={headerActions}
        loading={loading}
        isEmpty={!loading && filtered.length === 0}
        emptyMessage="No hay gastos que coincidan con los filtros."
        pagination={{
          page,
          pageSize,
          // Total viene del header X-Total-Count (filtros server-side aplicados).
          // El filtered.length es solo el subset cliente sobre los 50 actuales.
          totalItems: totalServer,
          onPageChange: setPage,
          onPageSizeChange: (s) => { setPageSize(s); setPage(1); },
        }}
        paginationSummary={!loading && (
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
              {rangoActivo
                ? `${rangoFechas.desde} → ${rangoFechas.hasta}`
                : todosLosMeses
                  ? 'Todos los períodos'
                  : modoPeriodo === 'anio'
                    ? `Año ${anioActual}`
                    : `${MESES_LARGO[mesActual]} ${anioActual}`}
            </div>
          </div>
        )}
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
        kpis={kpisSpec}
        groupBy={groupByConfig}
        /* sidePanel={sidePanelContent}  — oculta por ahora */
      >
        {/* Fallback: si por algun motivo no se usa groupBy/renderItem,
            mantenemos el render legacy. ABMPage los ignora cuando hay groupBy. */}
        {paginatedFiltered.map(g => renderGastoCard(g))}
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
