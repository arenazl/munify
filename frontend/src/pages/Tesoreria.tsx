/**
 * Tesorería / Gastos — PILOTO del estándar `SemanticAbmPage` (kind='money').
 *
 * Migración de shell SOLAMENTE (riesgo controlado):
 *  - Hero semántico + ListToolbar + FilterBar (PeriodControl) + DataTable
 *    con grupos por día, subtotales y gran total (referencia:
 *    design/handoff-v2/references/gastos-lista.dc.html).
 *  - La lógica de datos/fetch/filtros NO cambió: mismos estados, mismas
 *    llamadas, mismos filtros server/client-side que la versión anterior.
 *  - Se PRESERVAN el wizard de alta (CrearGastoWizard) y el detalle
 *    (GastoDetalleSheet): el CTA y el click de fila abren lo mismo que antes.
 */
import { useEffect, useMemo, useState } from 'react';
import { Eye, Sparkles, Trash2, TrendingUp } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { useTheme } from '../contexts/ThemeContext';
import { useIaTesoreria } from '../hooks/useIaHabilitada';
import { useAuth } from '../contexts/AuthContext';
import { CrearGastoWizard } from '../components/tesoreria/CrearGastoWizard';
import type { PeriodModo } from '../components/ui/PeriodNavigator';
import type { DateRange } from '../components/ui/DateRangePicker';
import {
  GastoDetalleSheet, calcEstadoAgregado, ESTADO_AGREGADO_META,
  type EstadoAgregado,
} from '../components/tesoreria/GastoDetalleSheet';
import { SemanticAbmPage } from '../components/abmv2/SemanticAbmPage';
import { ChipEstado, EntityCell } from '../components/abmv2/DataTable';
import type {
  ChipTone, ColumnSpec, PeriodControlValue, RowAction, SelectSpec, StatusTab, TableGroup,
} from '../components/abmv2/types';
import { seg, type HeroFrase, type HeroKpi } from '../lib/semanticHero';
import { resolverUmbrales, veredictoMasEsPeor } from '../lib/veredictos';
import { formatFechaAR, parseFechaLocal } from '../lib/tesoreria-helpers';
import { gastosApi, dependenciasApi, contactosApi, conceptosAbmApi, tiposEmpleadoApi, cajasApi } from '../lib/api';
import { conceptoIcon } from '../lib/conceptoIcons';
import { contactoIconByTipo, TIPO_CONTACTO_COLORS, TIPO_CONTACTO_LABELS, TIPO_CONTACTO_LABELS_SINGULAR } from '../lib/contactoIcons';
import type { Gasto, FormaPago, Contacto, Concepto, TipoContacto, TipoEmpleadoCatalogo, Caja } from '../types';

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

/** Estado agregado → tono semántico del ChipEstado (paleta StatusPill del estándar). */
const ESTADO_TONO: Record<EstadoAgregado, ChipTone> = {
  al_dia: 'green',
  pendiente: 'amber',
  completado: 'blue',
  en_mora: 'red',
};

const fmtMoney = (n: number) => `$ ${n.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`;
const pad2 = (n: number) => String(n).padStart(2, '0');

export default function Tesoreria() {
  const { theme } = useTheme();
  const iaOn = useIaTesoreria();  // gate IA en Tesorería (respeta el sub-flag): banner Bartolo
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
  const [cajaFiltro, setCajaFiltro] = useState<string>('');
  const [estadoFiltro, setEstadoFiltro] = useState<EstadoAgregado | ''>('');

  // Navegador de periodos. modo: 'mes' | 'anio'. mes/anio = filtro activo.
  // todosLosMeses = sin filtro temporal.
  const today = new Date();
  const [modoPeriodo, setModoPeriodo] = useState<PeriodModo>('mes');
  const [mesActual, setMesActual] = useState<number>(today.getMonth());  // 0-11
  const [anioActual, setAnioActual] = useState<number>(today.getFullYear());
  // Default TRUE: la pantalla arranca mostrando TODOS los meses (panorama completo).
  const [todosLosMeses, setTodosLosMeses] = useState<boolean>(true);
  // Rango de fechas (desde/hasta). Si esta seteado, PISA al periodo simple.
  // Lo escribe el PeriodControl del estandar cuando el usuario abre "→ Hasta".
  const [rangoFechas, setRangoFechas] = useState<DateRange>({ desde: '', hasta: '' });
  const rangoActivo = !!(rangoFechas.desde && rangoFechas.hasta);

  const [dependencias, setDependencias] = useState<DependenciaOption[]>([]);
  const [contactos, setContactos] = useState<Contacto[]>([]);
  const [conceptos, setConceptos] = useState<Concepto[]>([]);
  const [cajas, setCajas] = useState<Caja[]>([]);
  const [tiposEmpleado, setTiposEmpleado] = useState<TipoEmpleadoCatalogo[]>([]);
  const [wizardOpen, setWizardOpen] = useState(false);

  // Side modal de detalle
  const [gastoSeleccionado, setGastoSeleccionado] = useState<Gasto | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Paginación client-side (50 items por página). El estándar todavia no trae
  // control de paginacion: queda fija la primera pagina (ver dudas del piloto).
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);

  // Gate de rol: el modulo es solo de gestores. El guard de render vive al
  // final (despues de TODOS los hooks — regla de hooks); aca solo gateamos
  // los fetches para que un rol bloqueado no dispare requests (mismo
  // comportamiento que cuando el early-return cortaba antes de los effects).
  const esGestor = !user || user.rol === 'admin' || user.rol === 'supervisor';

  const fetchGastos = async () => {
    setLoading(true);
    try {
      // Filtros server-side: search, dependencia, concepto, rango fechas.
      // El resto (tipoContacto, subtipoEmpleado, tipoConcepto, estadoAgregado,
      // periodo mes/anio) se aplican client-side sobre la pagina actual.
      const params: Record<string, string | number> = { skip: (page - 1) * pageSize, limit: pageSize };
      if (search.trim()) params.search = search.trim();
      if (dependenciaFiltro) params.dependencia_id = parseInt(dependenciaFiltro, 10);
      if (cajaFiltro) params.caja_id = parseInt(cajaFiltro, 10);
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
      const res = await contactosApi.list({ activo: true, limit: 5000 });
      setContactos(res.data || []);
    } catch {
      setContactos([]);
    }
  };

  const fetchCatalogoConceptos = async () => {
    try {
      const [conceptosRes, cajasRes] = await Promise.all([
        conceptosAbmApi.list({ activo: true }),
        cajasApi.list({ activo: true }),
      ]);
      setConceptos(conceptosRes.data || []);
      setCajas((cajasRes.data as Caja[]) || []);
    } catch {
      setConceptos([]);
      setCajas([]);
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
    if (!esGestor) return;
    fetchDependencias();
    fetchContactos();
    fetchCatalogoConceptos();
    fetchTiposEmpleado();
  }, [esGestor]);

  // Re-fetch gastos cada vez que cambia un filtro server-side o la paginacion.
  // Filtros client-side (tipoContacto, subtipoEmpleado, estadoAgregado) NO
  // disparan re-fetch — solo filtran lo que ya esta en memoria.
  useEffect(() => {
    if (!esGestor) return;
    fetchGastos();
    /* eslint-disable-next-line */
  }, [esGestor, page, pageSize, dependenciaFiltro, cajaFiltro, mesActual, anioActual, modoPeriodo, todosLosMeses, rangoFechas.desde, rangoFechas.hasta]);

  // Search con debounce
  useEffect(() => {
    if (!esGestor) return;
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

  // Map concepto (string) -> tipo (con color), para el punto de TIPO en la grilla
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

  // Filtros aplicados SIN el filtro de estado: base para los conteos reales de
  // los statusTabs (el segmented muestra la distribucion del resto del filtro).
  const filteredSinEstado = useMemo(() => {
    const s = search.trim().toLowerCase();
    const depId = dependenciaFiltro ? parseInt(dependenciaFiltro, 10) : null;

    return gastos.filter(g => {
      // Filtro temporal: si hay rango activo, pisa al periodo simple.
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
      // Caja (de qué fondo sale el gasto). caja_id puede ser null (sin caja).
      if (cajaFiltro && String(g.caja_id ?? '') !== cajaFiltro) return false;
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
  }, [gastos, search, tipoContactoFiltro, subtipoEmpleadoFiltro, dependenciaFiltro, tipoConceptoFiltro, cajaFiltro, conceptosDelTipoNombres, mesActual, anioActual, modoPeriodo, todosLosMeses, rangoFechas, rangoActivo, contactosMap]);

  // Resultado final = base + filtro de estado agregado (mismo resultado que antes).
  const filtered = useMemo(
    () => (estadoFiltro ? filteredSinEstado.filter(g => calcEstadoAgregado(g) === estadoFiltro) : filteredSinEstado),
    [filteredSinEstado, estadoFiltro]
  );

  // Conteos por estado agregado (para statusTabs) + monto pendiente (hero).
  const estadoStats = useMemo(() => {
    const counts: Record<EstadoAgregado, number> = { al_dia: 0, en_mora: 0, pendiente: 0, completado: 0 };
    let pendienteMonto = 0;
    for (const g of filteredSinEstado) {
      const e = calcEstadoAgregado(g);
      counts[e] += 1;
      if (e === 'pendiente') pendienteMonto += parseFloat(g.monto_pesos || '0');
    }
    return { counts, pendienteMonto };
  }, [filteredSinEstado]);

  // Server ya paginó: `filtered` ya tiene solo la página actual con filtros
  // client-side extra aplicados encima.

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

  // Buckets por tipo de concepto: top por monto (alimentan la stat strip del hero).
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
    const concepto = new Map<string, number>();
    gastos.forEach((g, idx) => {
      // Concepto
      const cKey = (g.concepto || '').toLowerCase();
      if (cKey && !concepto.has(cKey)) concepto.set(cKey, idx);
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
    return { tipoContacto, subtipoEmpleado, dependencia, concepto };
  }, [gastos, contactosMap]);

  // Helper: ordena options no-vacios por presencia en grilla, marca emphasized.
  // value '' (placeholder) siempre va primero sin emphasis.
  function sortByPresence<T extends { value: string; label: string; color?: string }>(
    items: T[],
    order: Map<string, number>,
  ): Array<T & { emphasized?: boolean }> {
    return items
      .map(it => {
        const idx = order.get(it.value.toLowerCase()) ?? order.get(it.value);
        return { opt: { ...it, emphasized: idx != null }, idx: idx ?? Number.POSITIVE_INFINITY };
      })
      .sort((a, b) => a.idx - b.idx)
      .map(p => p.opt);
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
    return sortByPresence(items, ordering.tipoContacto);
  }, [ordering.tipoContacto]);

  // Opciones de subtipo de empleado (usa el catalogo si existe)
  const subtipoEmpleadoOptions = useMemo(() => {
    const items = tiposEmpleado.length > 0
      ? tiposEmpleado.map(t => ({ value: t.nombre, label: t.nombre, color: t.color || undefined }))
      : subtiposEmpleado.map(s => ({ value: s, label: s, color: undefined as string | undefined }));
    return sortByPresence(items, ordering.subtipoEmpleado);
  }, [tiposEmpleado, subtiposEmpleado, ordering.subtipoEmpleado]);

  // Opciones de caja (de qué fondo sale cada gasto): Coparticipación, FOFINDE,
  // FODEMEP, Tarjeta, etc.
  const cajaOptions = useMemo(() => {
    return cajas.map(c => ({
      value: String(c.id),
      label: c.nombre,
      color: c.color || undefined,
    }));
  }, [cajas]);

  // Opciones de dependencia
  const dependenciaOptions = useMemo(() => {
    const items = dependencias.map(d => ({
      value: String(d.id),
      label: d.nombre,
      color: d.color || undefined,
    }));
    return sortByPresence(items, ordering.dependencia);
  }, [dependencias, ordering.dependencia]);

  // ===================================================================
  // Mapeo al contrato del estándar (SemanticAbmPage)
  // ===================================================================

  // --- FilterBar: selects existentes como SelectSpec ---
  const selects: SelectSpec[] = [
    {
      id: 'tipoContacto',
      label: 'Contacto',
      value: tipoContactoFiltro,
      options: [{ value: '', label: 'Todos' }, ...tipoContactoOptions],
      onChange: (v) => { setTipoContactoFiltro(v as TipoContacto | ''); setSubtipoEmpleadoFiltro(''); },
    },
    ...(tipoContactoFiltro === 'empleado' && subtiposEmpleado.length > 0
      ? [{
          id: 'subtipoEmpleado',
          label: 'Empleado',
          value: subtipoEmpleadoFiltro,
          options: [{ value: '', label: 'Todos' }, ...subtipoEmpleadoOptions],
          onChange: setSubtipoEmpleadoFiltro,
        } satisfies SelectSpec]
      : []),
    {
      id: 'dependencia',
      label: 'Dependencia',
      value: dependenciaFiltro,
      options: [{ value: '', label: 'Todas' }, ...dependenciaOptions],
      onChange: setDependenciaFiltro,
    },
    {
      id: 'caja',
      label: 'Caja',
      value: cajaFiltro,
      options: [{ value: '', label: 'Todas' }, ...cajaOptions],
      onChange: setCajaFiltro,
    },
  ];

  // --- PeriodControl: mapea el estado de periodo existente al contrato.
  // GOTCHA piloto: cuando todosLosMeses=true el contrato no puede expresarlo
  // (no hay estado "todos" en PeriodControlValue) — el control muestra el
  // mes/año actual como PROPUESTA y el eyebrow del hero + el resumen dicen la
  // verdad ("Todos los períodos"). Cualquier interacción con el control aplica
  // el período elegido (sale de "todos"). Necesidad anotada en dudas.
  const periodValue = useMemo<PeriodControlValue>(() => {
    const unit = modoPeriodo === 'anio' ? ('year' as const) : ('month' as const);
    if (rangoActivo) {
      const d = parseFechaLocal(rangoFechas.desde);
      const h = parseFechaLocal(rangoFechas.hasta);
      return unit === 'year'
        ? { unit, from: String(d.getFullYear()), to: String(h.getFullYear()) }
        : {
            unit,
            from: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`,
            to: `${h.getFullYear()}-${pad2(h.getMonth() + 1)}`,
          };
    }
    return unit === 'year'
      ? { unit, from: String(anioActual) }
      : { unit, from: `${anioActual}-${pad2(mesActual + 1)}` };
  }, [modoPeriodo, rangoActivo, rangoFechas.desde, rangoFechas.hasta, anioActual, mesActual]);

  const handlePeriodChange = (v: PeriodControlValue) => {
    const esAnio = v.unit === 'year';
    setModoPeriodo(esAnio ? 'anio' : 'mes');
    setTodosLosMeses(false);
    const [fy, fm] = v.from.split('-').map(Number);
    if (fy) {
      setAnioActual(fy);
      if (!esAnio && fm) setMesActual(fm - 1);
    }
    if (v.to) {
      const [ty, tm] = v.to.split('-').map(Number);
      const desdeIso = esAnio ? `${fy}-01-01` : `${fy}-${pad2(fm || 1)}-01`;
      const finMes = esAnio ? 12 : (tm || 12);
      const ultimoDia = new Date(ty, finMes, 0).getDate();
      setRangoFechas({ desde: desdeIso, hasta: `${ty}-${pad2(finMes)}-${pad2(ultimoDia)}` });
    } else {
      setRangoFechas({ desde: '', hasta: '' });
    }
  };

  // Periodo activo en label legible (eyebrow del hero + copy).
  const periodoLabel = rangoActivo
    ? `${formatFechaAR(rangoFechas.desde)} → ${formatFechaAR(rangoFechas.hasta)}`
    : todosLosMeses
      ? 'Todos los períodos'
      : modoPeriodo === 'anio'
        ? `Año ${anioActual}`
        : `${MESES_LARGO[mesActual]} ${anioActual}`;

  // --- StatusTabs con conteos reales (fuente: ESTADO_FILTROS, SSoT) ---
  const statusTabs: StatusTab[] = ESTADO_FILTROS.map(e => ({
    id: e.value,
    label: e.label,
    count: e.value === '' ? filteredSinEstado.length : estadoStats.counts[e.value],
  }));

  // --- Hero semántico: veredicto + stat strip con los datos ya cargados ---
  const umbrales = resolverUmbrales();
  const pendCount = estadoStats.counts.pendiente;
  // Aproximación piloto: no hay umbral de dinero en lib/veredictos; usamos el
  // de "vencidos" (cantidad) para los pendientes de acreditación (ver dudas).
  const pendVeredicto = veredictoMasEsPeor(pendCount, umbrales.vencidos);
  const topTipo = kpisData[0];
  const pctTop = topTipo && totales.totalPesos > 0
    ? Math.round((topTipo.total / totales.totalPesos) * 100)
    : 0;

  const frases: HeroFrase[] = [
    totales.cantidad === 0
      ? {
          segmentos: [
            seg(`Sin pagos en ${periodoLabel.toLowerCase() === 'todos los períodos' ? 'el municipio' : periodoLabel}`),
            seg(' con los filtros aplicados — cargá el primero con '),
            seg('Nuevo pago'),
            seg(' o ampliá el período.'),
          ],
        }
      : {
          segmentos: [
            seg('Gastaste '),
            seg(fmtMoney(totales.totalPesos)),
            seg(` en ${totales.cantidad} ${totales.cantidad === 1 ? 'pago' : 'pagos'}`),
            ...(topTipo && pctTop > 0
              ? [seg(' y el '), seg(`${pctTop}% se concentra en ${topTipo.nombre}`)]
              : []),
            ...(pendCount > 0
              ? [
                  seg('. Hay '),
                  seg(`${fmtMoney(estadoStats.pendienteMonto)} pendientes de acreditación`, pendVeredicto),
                  seg(` en ${pendCount} ${pendCount === 1 ? 'movimiento' : 'movimientos'}.`),
                ]
              : [seg(' — '), seg('no queda nada pendiente de acreditación', 'bueno'), seg('.')]),
          ],
          acciones: pendCount > 0
            ? [
                { label: `Ver los ${pendCount} pendientes`, onClick: () => setEstadoFiltro('pendiente'), primaria: true },
                { label: 'Conciliar caja', to: '/gestion/tesoreria/conciliacion' },
              ]
            : [{ label: 'Conciliar caja', to: '/gestion/tesoreria/conciliacion' }],
        },
  ];

  const heroKpis: HeroKpi[] = [
    {
      etiqueta: 'GASTADO',
      valor: fmtMoney(totales.totalPesos),
      sub: `${totales.cantidad} ${totales.cantidad === 1 ? 'pago' : 'pagos'}`,
    },
    ...kpisData.slice(0, 2).map<HeroKpi>(k => ({
      etiqueta: k.nombre.toUpperCase(),
      valor: fmtMoney(k.total),
      sub: `${totales.totalPesos > 0 ? Math.round((k.total / totales.totalPesos) * 100) : 0}% · ${k.count} ${k.count === 1 ? 'pago' : 'pagos'}`,
    })),
    {
      etiqueta: 'PENDIENTES',
      valor: fmtMoney(estadoStats.pendienteMonto),
      sub: `${pendCount} ${pendCount === 1 ? 'movimiento' : 'movimientos'}`,
      veredicto: pendVeredicto,
    },
    {
      etiqueta: 'TICKET PROMEDIO',
      valor: totales.cantidad > 0 ? fmtMoney(totales.totalPesos / totales.cantidad) : fmtMoney(0),
      sub: 'por pago',
    },
  ];

  // --- Columnas (orden canónico del estándar; MONTO última de datos) ---
  const columns: ColumnSpec<Gasto>[] = [
    {
      id: 'fecha',
      header: 'FECHA',
      width: '76px',
      kind: 'date',
      cell: (g) => <span className="av2-tabla-fecha av2-tnum">{formatFechaAR(g.fecha)}</span>,
    },
    {
      id: 'concepto',
      header: 'CONCEPTO',
      width: 'minmax(200px, 1.9fr)',
      kind: 'entity',
      cell: (g) => {
        const tipo = conceptoToTipoMap.get(g.concepto.toLowerCase());
        return (
          <EntityCell
            icon={conceptoIcon(g.concepto)}
            tileColor={tipo?.color || undefined}
            title={g.concepto}
          />
        );
      },
    },
    {
      id: 'contacto',
      header: 'CONTACTO',
      width: 'minmax(140px, 1.1fr)',
      kind: 'entity',
      cell: (g) => {
        if (g.destino_tipo === 'contacto') {
          const c = g.destino_contacto_id ? contactosMap.get(g.destino_contacto_id) : null;
          const nombre = c ? `${c.nombre} ${c.apellido || ''}`.trim() : 'Contacto';
          return (
            <EntityCell
              title={nombre}
              subtitle={c ? (TIPO_CONTACTO_LABELS_SINGULAR[c.tipo] || TIPO_CONTACTO_LABELS[c.tipo]) : undefined}
              dotColor={c ? TIPO_CONTACTO_COLORS[c.tipo] : undefined}
            />
          );
        }
        const dep = g.destino_dependencia_id ? dependenciasMap.get(g.destino_dependencia_id) : null;
        return (
          <EntityCell
            title={dep?.nombre || 'Secretaría'}
            subtitle="Dependencia"
            dotColor={dep?.color || undefined}
          />
        );
      },
    },
    {
      id: 'tipo',
      header: 'TIPO',
      width: 'minmax(68px, 92px)',
      kind: 'text',
      cell: (g) => {
        const t = conceptoToTipoMap.get(g.concepto.toLowerCase());
        if (!t || !t.nombre) return <span className="av2-tabla-texto">—</span>;
        // Punto de color runtime + texto neutro (patrón del estándar para
        // categorías con color de datos; el ChipEstado solo acepta tonos).
        return (
          <span className="av2-entidad-sub">
            {t.color && <span className="av2-entidad-punto" style={{ background: t.color }} />}
            <span className="av2-entidad-subtexto">{t.nombre}</span>
          </span>
        );
      },
    },
    {
      id: 'forma',
      header: 'FORMA',
      width: 'minmax(76px, 100px)',
      kind: 'text',
      cell: (g) => <span className="av2-tabla-texto">{FORMA_PAGO_LABELS[g.forma_pago] || g.forma_pago}</span>,
    },
    {
      id: 'estado',
      header: 'ESTADO',
      width: 'minmax(80px, 96px)',
      kind: 'chip',
      cell: (g) => {
        const e = calcEstadoAgregado(g);
        return <ChipEstado label={ESTADO_AGREGADO_META[e].label} tone={ESTADO_TONO[e]} />;
      },
    },
    {
      id: 'monto',
      header: 'MONTO',
      width: 'minmax(94px, 118px)',
      kind: 'money',
      align: 'right',
      cell: (g) => (
        <span className="av2-money av2-tabla-monto">{fmtMoney(parseFloat(g.monto_pesos || '0'))}</span>
      ),
    },
    { id: 'acciones', header: 'ACCIONES', width: '58px', kind: 'actions', align: 'right' },
  ];

  const rowActions: RowAction<Gasto>[] = [
    { id: 'ver', label: 'Ver detalle', icon: Eye, onClick: openDetalle },
    { id: 'eliminar', label: 'Eliminar', icon: Trash2, danger: true, onClick: (g) => handleDelete(g.id) },
  ];

  // --- Grupos por día con subtotal (la página precomputa; DataTable pinta) ---
  const grupos = useMemo<TableGroup<Gasto>[]>(() => {
    const porDia = new Map<string, Gasto[]>();
    for (const g of filtered) {
      const k = (g.fecha || '').slice(0, 10);
      const arr = porDia.get(k);
      if (arr) arr.push(g);
      else porDia.set(k, [g]);
    }
    return Array.from(porDia.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([k, items]) => {
        const d = parseFechaLocal(k);
        const mes = d.toLocaleDateString('es-AR', { month: 'short' }).replace('.', '').toUpperCase();
        const sub = items.reduce((s, g) => s + parseFloat(g.monto_pesos || '0'), 0);
        return {
          key: k,
          badge: { top: String(d.getDate()), bottom: mes },
          label: `${items.length} ${items.length === 1 ? 'movimiento' : 'movimientos'}`,
          subtotal: fmtMoney(sub),
          rows: items,
        };
      });
  }, [filtered]);

  // Detectar gastos importados de Bartolo que cayeron en conceptos genericos
  // y necesitan curacion manual. Solo aparece el banner si hay alguno.
  const dudosos = useMemo(() => {
    const TAG = '[BARTOLO-DUDOSO]';
    const list = gastos.filter(g => g.observaciones && g.observaciones.includes(TAG));
    const monto = list.reduce((s, g) => s + parseFloat(g.monto_pesos || '0'), 0);
    return { count: list.length, monto };
  }, [gastos]);

  // Guard de rol DESPUES de todos los hooks (regla de hooks): mismo bloqueo
  // que antes, sin condicionar el orden de los hooks.
  if (!esGestor) {
    return (
      <div className="p-6">
        <p className="text-sm" style={{ color: theme.textSecondary }}>
          El módulo Tesorería es exclusivo de los gestores del municipio.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="pt-3">
      </div>

      {/* Banner curacion Bartolo — solo aparece si hay dudosos pendientes Y la
          IA esta habilitada para el muni (la clasificacion es IA). */}
      {iaOn && dudosos.count > 0 && (
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
                {dudosos.count} pagos importados pendientes de revisar
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

      {/* Cabecera de módulo (v2.2): eyebrow = módulo, H1 = el trabajo, bajada =
          de dónde salen las filas y cómo se agrupan. */}
      <SemanticAbmPage<Gasto>
        moduleKey="gastos"
        hero={{
          etiqueta: `TESORERÍA · ${periodoLabel.toUpperCase()}`,
          frases,
          kpis: heroKpis,
        }}
        eyebrow="Tesorería"
        title="En qué se va la plata del municipio y qué queda por pagar"
        description="Pagos del período con su concepto, su contacto y su estado. La tabla los agrupa por día, con subtotal por día y total del filtro al pie."
        searchPlaceholder="Buscar por concepto, contacto o descripción…"
        views={['table']}
        secondaryAction={{ label: 'Proyección', to: '/gestion/tesoreria/proyecciones', icon: TrendingUp }}
        primaryAction={{ label: 'Nuevo pago', onClick: () => setWizardOpen(true) }}
        selects={selects}
        period={periodValue}
        onPeriodChange={handlePeriodChange}
        statusTabs={statusTabs}
        activeStatus={estadoFiltro}
        onStatusChange={(id) => setEstadoFiltro(id as EstadoAgregado | '')}
        filterSummary={`${totales.cantidad} ${totales.cantidad === 1 ? 'movimiento' : 'movimientos'} · ${fmtMoney(totales.totalPesos)}`}
        kind="money"
        columns={columns}
        groupBy="date"
        showGroupSubtotal
        groups={grupos}
        rows={[]}
        rowActions={rowActions}
        footer={{
          showing: loading ? 'Cargando…' : `Mostrando ${filtered.length} de ${totalServer}`,
          total: { label: 'Total filtrado', value: fmtMoney(totales.totalPesos) },
        }}
        search={search}
        onSearchChange={setSearch}
        activeView="table"
        onViewChange={() => undefined}
        rowKey={(g) => g.id}
        onRowClick={openDetalle}
      />

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
