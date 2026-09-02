import { useEffect, useMemo, useState, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Hammer, Plus, Users, User as UserIcon, Calendar, ClipboardList, X, Boxes, Printer, OctagonAlert } from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { ABMSheetFooter, ABMInput, ABMTextarea } from '../components/ui/ABMPage';
import { Sheet } from '../components/ui/Sheet';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { ModernSelect, type SelectOption } from '../components/ui/ModernSelect';
import { DatePicker } from '../components/ui/DatePicker';
import { SemanticAbmPage } from '../components/abmv2/SemanticAbmPage';
import type { ColumnSpec, RowAction, StatusTab, SelectSpec } from '../components/abmv2/types';
import { seg, type HeroFrase, type HeroKpi } from '../lib/semanticHero';
import { ordenesTrabajoApi, empleadosApi, empleadosGestionApi, reclamosApi, inventarioApi, categoriasReclamoApi } from '../lib/api';
import { otEstadoLabel, otEstadoColor, otEstadoIcons, otEstadoLabels, OT_MOTIVO_BLOQUEO_OPTIONS, type MotivoBloqueoOT } from '../lib/enums/ordenTrabajo';
import { naturalezaColors, naturalezaIcons } from '../lib/enums/inventario';
import { prioridadLabels, prioridadColor, prioridadIcons, PRIORIDAD_OPTIONS } from '../lib/enums/prioridadOT';
import { getEstadoInfo } from '../lib/estadoConfig';
import { imprimirOrdenTrabajo } from '../lib/printOrdenTrabajo';
import type { OrdenTrabajo, OTMaterial, EstadoOrdenTrabajo, Reclamo, Empleado, InventarioItem, NaturalezaInventario, CategoriaReclamo, PrioridadOT } from '../types';

// Recurso de inventario en el form de la OT (activo reservado o consumible planeado).
type RecursoForm = {
  item_id: number;
  nombre: string;
  naturaleza: NaturalezaInventario;
  cantidad?: number;
  unidad?: string | null;
};

interface CuadrillaMini {
  id: number;
  nombre: string;
  apellido?: string | null;
  activo: boolean;
}

type FormState = {
  titulo: string;
  descripcion: string;
  prioridad: PrioridadOT;
  categoria_id: string;
  cuadrilla_id: string;
  empleado_id: string;
  fecha_programada: string;
  horas_estimadas: string;
  materiales: OTMaterial[];
  recursos: RecursoForm[];
  reclamo_ids: number[];
};

const FORM_VACIO: FormState = {
  titulo: '', descripcion: '', prioridad: 'media', categoria_id: '',
  cuadrilla_id: '', empleado_id: '',
  fecha_programada: '', horas_estimadas: '', materiales: [], recursos: [], reclamo_ids: [],
};

export default function OrdenesTrabajo() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [ordenes, setOrdenes] = useState<OrdenTrabajo[]>([]);
  const [todasOrdenes, setTodasOrdenes] = useState<OrdenTrabajo[]>([]); // sin filtro de estado, solo para contar las píldoras
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<string>('');

  const [sheetOpen, setSheetOpen] = useState(false);
  const [selected, setSelected] = useState<OrdenTrabajo | null>(null);
  const [form, setForm] = useState<FormState>(FORM_VACIO);
  const [guardando, setGuardando] = useState(false);

  // Cierre / cancelación
  const [notasCierre, setNotasCierre] = useState('');
  const [horasReales, setHorasReales] = useState('');
  const [finalizarReclamos, setFinalizarReclamos] = useState(false); // D4: opt-in al completar
  const [confirmCancelar, setConfirmCancelar] = useState(false);
  const [motivoCancelacion, setMotivoCancelacion] = useState('');
  // T6: consumo real por consumible al completar (keyed por OTRecurso.id).
  const [consumosReales, setConsumosReales] = useState<Record<number, number>>({});
  // T6: bloqueo en campo (frenar la OT — estado no final).
  const [confirmBloquear, setConfirmBloquear] = useState(false);
  const [motivoBloqueoTipo, setMotivoBloqueoTipo] = useState<MotivoBloqueoOT>('falta_material');
  const [motivoBloqueoNota, setMotivoBloqueoNota] = useState('');
  const [bloqueando, setBloqueando] = useState(false);

  // Catálogos para el form
  const [cuadrillas, setCuadrillas] = useState<CuadrillaMini[]>([]);
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [reclamosActivos, setReclamosActivos] = useState<Reclamo[]>([]);
  const [itemsDisponibles, setItemsDisponibles] = useState<InventarioItem[]>([]);
  // Categorías de Reclamo: clasifican la OT. Incluye las `interna: true`
  // (Preventivo, Mantenimiento, Obra) — acá SÍ se ofrecen, a diferencia del
  // alta de reclamo del vecino.
  const [categorias, setCategorias] = useState<CategoriaReclamo[]>([]);
  // Nuevo material (form inline)
  const [nuevoMaterial, setNuevoMaterial] = useState('');

  const esGestor = user?.rol === 'admin' || user?.rol === 'supervisor';
  const muniNombre = (user as { municipio_nombre?: string } | null)?.municipio_nombre || 'Municipalidad';

  const fetchOrdenes = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = {};
      if (filtroEstado) params.estado = filtroEstado;
      if (search.trim()) params.search = search.trim();
      const res = await ordenesTrabajoApi.list(params);
      setOrdenes(res.data || []);
    } catch {
      toast.error('Error cargando órdenes de trabajo');
    } finally {
      setLoading(false);
    }
  }, [filtroEstado, search]);

  useEffect(() => { fetchOrdenes(); }, [fetchOrdenes]);

  // Conteos para las píldoras de estado — independiente del filtro activo
  useEffect(() => {
    ordenesTrabajoApi.list({ limit: 200 }).then(res => setTodasOrdenes(res.data || [])).catch(() => {});
  }, [ordenes]);

  const conteosEstado = useMemo(() => {
    const c: Record<string, number> = {};
    for (const ot of todasOrdenes) c[ot.estado] = (c[ot.estado] || 0) + 1;
    return c;
  }, [todasOrdenes]);

  // Catálogos (una vez)
  useEffect(() => {
    if (!esGestor) return;
    (async () => {
      try {
        const [cRes, eRes, rRes] = await Promise.all([
          empleadosGestionApi.getCuadrillasAll({ activo: true }),
          empleadosApi.getAll(true),
          reclamosApi.getAll({ limit: 100, excluir_finalizados: 'true' as unknown as string }),
        ]);
        setCuadrillas(cRes.data || []);
        setEmpleados(eRes.data || []);
        setReclamosActivos(rRes.data || []);
      } catch {
        // catálogos best-effort: el listado principal sigue funcionando
      }
      // Inventario disponible (opt-in): si el módulo no está activo o no hay
      // ítems, queda vacío y la sección "Recursos" no se muestra.
      try {
        const iRes = await inventarioApi.listItems({ solo_disponibles: true, limit: 300 });
        setItemsDisponibles(iRes.data || []);
      } catch { /* inventario no activo: sin recursos */ }
      // Categorías de Reclamo (para el selector de clasificación de la OT)
      try {
        const catRes = await categoriasReclamoApi.getAll(true);
        setCategorias(catRes.data || []);
      } catch { /* sin categorías: el selector queda vacío */ }
    })();
  }, [esGestor]);

  const abrirNueva = useCallback((reclamoIdInicial?: number) => {
    setSelected(null);
    setForm({
      ...FORM_VACIO,
      reclamo_ids: reclamoIdInicial ? [reclamoIdInicial] : [],
    });
    setNotasCierre('');
    setHorasReales('');
    setFinalizarReclamos(false);
    setConsumosReales({});
    setMotivoBloqueoTipo('falta_material');
    setMotivoBloqueoNota('');
    setSheetOpen(true);
  }, []);

  // Deep-link ?reclamo_id=N → abre el sheet de creación con el reclamo pre-vinculado
  useEffect(() => {
    const rid = searchParams.get('reclamo_id');
    if (rid && esGestor) {
      abrirNueva(parseInt(rid, 10));
      // limpiar el query param para que un refresh no re-abra
      searchParams.delete('reclamo_id');
      setSearchParams(searchParams, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Deep-link ?abrir=N → abre el detalle de una OT (la vuelta desde el Sheet de Reclamos)
  useEffect(() => {
    const oid = searchParams.get('abrir');
    if (!oid) return;
    ordenesTrabajoApi.get(parseInt(oid, 10))
      .then(res => { if (res.data) abrirDetalle(res.data); })
      .catch(() => toast.error('No se pudo abrir la orden de trabajo'));
    searchParams.delete('abrir');
    setSearchParams(searchParams, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const abrirDetalle = (ot: OrdenTrabajo) => {
    setSelected(ot);
    setForm({
      titulo: ot.titulo,
      descripcion: ot.descripcion || '',
      prioridad: ot.prioridad || 'media',
      categoria_id: ot.categoria_id ? String(ot.categoria_id) : '',
      cuadrilla_id: ot.cuadrilla_id ? String(ot.cuadrilla_id) : '',
      empleado_id: ot.empleado_id ? String(ot.empleado_id) : '',
      fecha_programada: ot.fecha_programada || '',
      horas_estimadas: ot.horas_estimadas != null ? String(ot.horas_estimadas) : '',
      materiales: ot.materiales || [],
      recursos: (ot.recursos || []).map(r => ({
        item_id: r.item_id,
        nombre: r.item_nombre || `#${r.item_id}`,
        naturaleza: (r.naturaleza || (r.tipo === 'reserva' ? 'activo' : 'consumible')) as NaturalezaInventario,
        cantidad: r.cantidad ?? undefined,
        unidad: r.unidad,
      })),
      reclamo_ids: ot.reclamos.map(r => r.id),
    });
    setNotasCierre('');
    setHorasReales('');
    setFinalizarReclamos(false);
    // T6: precargar el consumo real de cada consumible con la cantidad planeada.
    const consumosInit: Record<number, number> = {};
    (ot.recursos || []).forEach(r => {
      if (r.tipo === 'consumo') consumosInit[r.id] = r.cantidad ?? 1;
    });
    setConsumosReales(consumosInit);
    setMotivoBloqueoTipo('falta_material');
    setMotivoBloqueoNota('');
    setSheetOpen(true);
  };

  const buildPayload = () => ({
    titulo: form.titulo.trim(),
    descripcion: form.descripcion.trim() || null,
    prioridad: form.prioridad,
    categoria_id: form.categoria_id ? Number(form.categoria_id) : null,
    cuadrilla_id: form.cuadrilla_id ? Number(form.cuadrilla_id) : null,
    empleado_id: form.empleado_id ? Number(form.empleado_id) : null,
    fecha_programada: form.fecha_programada || null,
    horas_estimadas: form.horas_estimadas ? Number(form.horas_estimadas) : null,
    materiales: form.materiales.length ? form.materiales : null,
    recursos: form.recursos.map(r => ({
      item_id: r.item_id,
      cantidad: r.naturaleza === 'consumible' ? (r.cantidad ?? 1) : undefined,
    })),
    reclamo_ids: form.reclamo_ids,
  });

  const guardar = async () => {
    if (!form.titulo.trim()) { toast.error('Poné un título para la orden'); return; }
    try {
      setGuardando(true);
      if (selected) {
        await ordenesTrabajoApi.update(selected.id, buildPayload());
        toast.success('Orden actualizada');
      } else {
        const res = await ordenesTrabajoApi.create(buildPayload());
        toast.success(`Orden ${res.data?.numero || ''} creada`);
      }
      setSheetOpen(false);
      await fetchOrdenes();
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail || 'No se pudo guardar la orden');
    } finally {
      setGuardando(false);
    }
  };

  const iniciar = async () => {
    if (!selected) return;
    try {
      await ordenesTrabajoApi.iniciar(selected.id);
      toast.success('Orden iniciada');
      setSheetOpen(false);
      await fetchOrdenes();
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail || 'No se pudo iniciar');
    }
  };

  // Consumibles de la OT seleccionada (para editar el consumo REAL al completar).
  const consumiblesOT = useMemo(
    () => (selected?.recursos || []).filter(r => r.tipo === 'consumo'),
    [selected],
  );

  const setConsumoReal = (recursoId: number, cantidad: number) =>
    setConsumosReales(prev => ({ ...prev, [recursoId]: cantidad }));

  const completar = async () => {
    if (!selected) return;
    if (!notasCierre.trim()) { toast.error('Contá qué se hizo (notas de cierre)'); return; }
    try {
      // T6: mandar la cantidad REAL usada de cada consumible. Si no se editó,
      // viaja la planeada (mismo default). El backend descuenta ese valor.
      const consumos_reales = consumiblesOT.map(r => ({
        recurso_id: r.id,
        cantidad_real: consumosReales[r.id] ?? r.cantidad ?? 1,
      }));
      await ordenesTrabajoApi.completar(selected.id, {
        notas_cierre: notasCierre.trim(),
        horas_reales: horasReales ? Number(horasReales) : undefined,
        finalizar_reclamos: finalizarReclamos,
        consumos_reales: consumos_reales.length ? consumos_reales : undefined,
      });
      toast.success('Orden completada');
      setSheetOpen(false);
      await fetchOrdenes();
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail || 'No se pudo completar');
    }
  };

  const bloquear = async () => {
    if (!selected) return;
    try {
      setBloqueando(true);
      await ordenesTrabajoApi.bloquear(selected.id, {
        motivo_tipo: motivoBloqueoTipo,
        motivo: motivoBloqueoNota.trim() || undefined,
      });
      toast.success('Orden bloqueada');
      setConfirmBloquear(false);
      setMotivoBloqueoNota('');
      setSheetOpen(false);
      await fetchOrdenes();
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail || 'No se pudo bloquear');
    } finally {
      setBloqueando(false);
    }
  };

  const cancelar = async () => {
    if (!selected || !motivoCancelacion.trim()) return;
    try {
      await ordenesTrabajoApi.cancelar(selected.id, motivoCancelacion.trim());
      toast.success('Orden cancelada');
      setConfirmCancelar(false);
      setMotivoCancelacion('');
      setSheetOpen(false);
      await fetchOrdenes();
    } catch {
      toast.error('No se pudo cancelar');
    }
  };

  const cuadrillaOptions: SelectOption[] = useMemo(() => ([
    { value: '', label: 'Sin cuadrilla' },
    ...cuadrillas.map(c => ({ value: String(c.id), label: `${c.nombre} ${c.apellido || ''}`.trim() })),
  ]), [cuadrillas]);

  const empleadoOptions: SelectOption[] = useMemo(() => ([
    { value: '', label: 'Sin responsable individual' },
    ...empleados.map(e => ({ value: String(e.id), label: `${e.nombre} ${e.apellido || ''}`.trim() })),
  ]), [empleados]);

  const categoriaOptions: SelectOption[] = useMemo(() => ([
    { value: '', label: 'Sin clasificar' },
    ...categorias.map(c => ({ value: String(c.id), label: c.nombre })),
  ]), [categorias]);

  const reclamoOptions: SelectOption[] = useMemo(() =>
    reclamosActivos
      .filter(r => !form.reclamo_ids.includes(r.id))
      .map(r => ({ value: String(r.id), label: `#${r.id} · ${r.titulo}` })),
  [reclamosActivos, form.reclamo_ids]);

  const reclamoLabel = (id: number): string => {
    const enCatalogo = reclamosActivos.find(r => r.id === id);
    if (enCatalogo) return `#${id} · ${enCatalogo.titulo}`;
    const enSelected = selected?.reclamos.find(r => r.id === id);
    return enSelected ? `#${id} · ${enSelected.titulo}` : `#${id}`;
  };

  // Estado del reclamo vinculado (para pintar el badge en el chip). Puede venir
  // del catálogo de activos o de los reclamos que trae la OTs seleccionada.
  const reclamoEstado = (id: number): string | undefined =>
    reclamosActivos.find(r => r.id === id)?.estado ||
    selected?.reclamos.find(r => r.id === id)?.estado;

  // --- Recursos de inventario ---
  const mostrarRecursos = itemsDisponibles.length > 0 || form.recursos.length > 0;

  const recursoOptions: SelectOption[] = useMemo(() =>
    itemsDisponibles
      .filter(it => !form.recursos.some(r => r.item_id === it.id))
      .map(it => ({
        value: String(it.id),
        label: it.naturaleza === 'activo'
          ? `${it.nombre}${it.identificador ? ` · ${it.identificador}` : ''}`
          : `${it.nombre} · ${it.stock_actual ?? 0}${it.unidad ? ` ${it.unidad}` : ''}`,
      })),
  [itemsDisponibles, form.recursos]);

  const agregarRecurso = (itemId: number) => {
    const it = itemsDisponibles.find(i => i.id === itemId);
    if (!it) return;
    setForm(f => ({
      ...f,
      recursos: [...f.recursos, {
        item_id: it.id,
        nombre: it.nombre,
        naturaleza: it.naturaleza,
        cantidad: it.naturaleza === 'consumible' ? 1 : undefined,
        unidad: it.unidad,
      }],
    }));
  };

  const quitarRecurso = (itemId: number) =>
    setForm(f => ({ ...f, recursos: f.recursos.filter(r => r.item_id !== itemId) }));
  const setCantidadRecurso = (itemId: number, cantidad: number) =>
    setForm(f => ({ ...f, recursos: f.recursos.map(r => r.item_id === itemId ? { ...r, cantidad } : r) }));

  const esEditable = !selected || (selected.estado !== 'completada' && selected.estado !== 'cancelada');
  const inputStyle = { backgroundColor: theme.card, color: theme.text, border: `1px solid ${theme.border}` };

  const heroFrases = useMemo<HeroFrase[]>(() => {
    const total = todasOrdenes.length;
    if (total === 0) {
      return [{
        segmentos: [seg('No hay órdenes de trabajo registradas todavía.')],
      }];
    }
    const enCurso = conteosEstado['en_curso'] || 0;
    const asignadas = (conteosEstado['asignada'] || 0) + (conteosEstado['pendiente'] || 0);
    const bloqueadas = conteosEstado['bloqueada'] || 0;

    const activas = enCurso + asignadas;

    return [{
      segmentos: [
        seg('Hay '),
        seg(`${activas} ${activas === 1 ? 'orden activa' : 'órdenes activas'}`, activas > 0 ? 'bueno' : undefined),
        seg(`: ${enCurso} en ejecución y ${asignadas} pendientes de inicio`),
        ...(bloqueadas > 0
          ? [seg(`, con ${bloqueadas} ${bloqueadas === 1 ? 'bloqueada' : 'bloqueadas'} en campo`, 'malo')]
          : []),
        seg('.'),
      ],
    }];
  }, [todasOrdenes.length, conteosEstado]);

  const heroKpis = useMemo<HeroKpi[]>(() => {
    const total = todasOrdenes.length;
    const enCurso = conteosEstado['en_curso'] || 0;
    const porIniciar = (conteosEstado['asignada'] || 0) + (conteosEstado['pendiente'] || 0);
    const bloqueadas = conteosEstado['bloqueada'] || 0;
    const completadas = conteosEstado['completada'] || 0;

    return [
      {
        etiqueta: 'Total órdenes',
        valor: total,
        sub: 'registradas',
      },
      {
        etiqueta: 'En curso',
        valor: enCurso,
        sub: total > 0 ? `${Math.round((enCurso / total) * 100)}% del total` : '0%',
        veredicto: enCurso > 0 ? 'bueno' : undefined,
      },
      {
        etiqueta: 'Por iniciar',
        valor: porIniciar,
        sub: 'pendientes / asignadas',
      },
      {
        etiqueta: 'Bloqueadas',
        valor: bloqueadas,
        sub: bloqueadas > 0 ? 'atención requerida' : 'sin bloqueos',
        veredicto: bloqueadas > 0 ? 'malo' : undefined,
      },
      {
        etiqueta: 'Completadas',
        valor: completadas,
        sub: total > 0 ? `${Math.round((completadas / total) * 100)}% finalizadas` : '0%',
        veredicto: 'bueno',
      },
    ];
  }, [todasOrdenes.length, conteosEstado]);

  const statusTabs = useMemo<StatusTab[]>(() => {
    const estados: EstadoOrdenTrabajo[] = ['pendiente', 'asignada', 'en_curso', 'bloqueada', 'completada', 'cancelada'];
    return [
      { id: '', label: 'Todas', count: todasOrdenes.length },
      ...estados.map((e) => ({
        id: e,
        label: otEstadoLabel(e),
        count: conteosEstado[e] || 0,
        color: otEstadoColor(e),
      })),
    ];
  }, [todasOrdenes.length, conteosEstado]);

  const columnas = useMemo<ColumnSpec<OrdenTrabajo>[]>(() => [
    {
      id: 'numero',
      header: 'ORDEN',
      width: '120px',
      cell: (ot: OrdenTrabajo) => (
        <span
          className="font-mono text-xs font-bold px-2 py-0.5 rounded"
          style={{ backgroundColor: `${theme.primary}15`, color: theme.primary }}
        >
          {ot.numero}
        </span>
      ),
    },
    {
      id: 'titulo',
      header: 'TÍTULO Y CATEGORÍA',
      width: 'minmax(240px, 2.5fr)',
      cell: (ot: OrdenTrabajo) => (
        <div>
          <div className="font-semibold text-sm" style={{ color: theme.text }}>
            {ot.titulo}
          </div>
          <div className="flex items-center gap-2 mt-0.5 text-xs" style={{ color: theme.textSecondary }}>
            {ot.categoria_nombre && (
              <span className="font-medium" style={{ color: theme.primary }}>
                {ot.categoria_nombre}
              </span>
            )}
            <span>· {ot.reclamos.length} reclamo{ot.reclamos.length === 1 ? '' : 's'}</span>
          </div>
        </div>
      ),
    },
    {
      id: 'responsable',
      header: 'ASIGNACIÓN',
      width: 'minmax(180px, 1.5fr)',
      cell: (ot: OrdenTrabajo) => (
        <div className="text-xs">
          {ot.cuadrilla_nombre ? (
            <div className="flex items-center gap-1 font-medium" style={{ color: theme.text }}>
              <Users className="h-3.5 w-3.5" style={{ color: theme.primary }} />
              {ot.cuadrilla_nombre}
            </div>
          ) : ot.empleado_nombre ? (
            <div className="flex items-center gap-1 font-medium" style={{ color: theme.text }}>
              <UserIcon className="h-3.5 w-3.5" style={{ color: theme.primary }} />
              {ot.empleado_nombre}
            </div>
          ) : (
            <span style={{ color: theme.textSecondary }}>Sin asignar</span>
          )}
        </div>
      ),
    },
    {
      id: 'prioridad',
      header: 'PRIORIDAD',
      width: '120px',
      cell: (ot: OrdenTrabajo) => {
        const color = prioridadColor(ot.prioridad);
        const PIcon = prioridadIcons[ot.prioridad as PrioridadOT];
        return (
          <span
            className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full"
            style={{ backgroundColor: `${color}20`, color }}
          >
            {PIcon && <PIcon className="h-3 w-3" />}
            {prioridadLabels[ot.prioridad as PrioridadOT] || ot.prioridad}
          </span>
        );
      },
    },
    {
      id: 'estado',
      header: 'ESTADO',
      width: '140px',
      cell: (ot: OrdenTrabajo) => {
        const color = otEstadoColor(ot.estado);
        const EstadoIcon = otEstadoIcons[ot.estado as EstadoOrdenTrabajo] || Hammer;
        return (
          <span
            className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full"
            style={{ backgroundColor: `${color}20`, color }}
          >
            <EstadoIcon className="h-3 w-3" />
            {otEstadoLabel(ot.estado)}
          </span>
        );
      },
    },
    {
      id: 'fecha_programada',
      header: 'PROGRAMADA',
      width: '130px',
      cell: (ot: OrdenTrabajo) => (
        <span className="text-xs" style={{ color: theme.textSecondary }}>
          {ot.fecha_programada
            ? new Date(`${ot.fecha_programada}T00:00:00`).toLocaleDateString('es-AR')
            : '—'}
        </span>
      ),
    },
  ], [theme]);

  const accionesFila = useMemo<RowAction<OrdenTrabajo>[]>(() => [
    {
      id: 'imprimir',
      label: 'Imprimir PDF',
      icon: Printer,
      onClick: (ot: OrdenTrabajo) => imprimirOrdenTrabajo(ot, muniNombre),
    },
    {
      id: 'ver',
      label: 'Ver detalle',
      icon: ClipboardList,
      onClick: (ot: OrdenTrabajo) => abrirDetalle(ot),
    },
  ], [muniNombre]);

  return (
    <>
      <SemanticAbmPage<OrdenTrabajo>
        moduleKey="ordenes_trabajo"
        hero={{
          etiqueta: 'GESTIÓN DE CAMPO · ÓRDENES DE TRABAJO',
          frases: heroFrases,
          kpis: heroKpis,
        }}
        eyebrow="Órdenes"
        title="Planificación y seguimiento del trabajo de campo"
        description="Asignación de cuadrillas y operarios, consumo de recursos del inventario y vinculación directa con los reclamos del municipio."
        searchPlaceholder="Buscar por número, título o cuadrilla…"
        views={['table']}
        activeView="table"
        onViewChange={() => {}}
        selects={[]}
        primaryAction={esGestor ? {
          label: 'Nueva orden',
          onClick: () => abrirNueva(),
        } : undefined}
        statusTabs={statusTabs}
        activeStatus={filtroEstado}
        onStatusChange={(id) => setFiltroEstado(id)}
        search={search}
        onSearchChange={setSearch}
        loading={loading}
        kind="plain"
        columns={columnas}
        rows={ordenes}
        rowActions={accionesFila}
        rowKey={(ot) => ot.id}
        onRowClick={abrirDetalle}
        emptyMessage="No se encontraron órdenes de trabajo. Podés crear la primera desde acá o directamente desde un reclamo."
        footer={{
          showing: `Mostrando ${ordenes.length} de ${todasOrdenes.length}`,
        }}
      />

      <Sheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={selected ? `${selected.numero} · ${otEstadoLabel(selected.estado)}` : 'Nueva orden de trabajo'}
        stickyFooter={(selected || esGestor) ? (
          <div className="flex items-center gap-2">
            {selected && (
              <button
                onClick={() => imprimirOrdenTrabajo(selected, muniNombre)}
                className="px-3 py-2.5 rounded-lg font-medium flex items-center gap-1.5"
                style={{ color: theme.text, border: `1px solid ${theme.border}` }}
                title="Imprimir / guardar como PDF"
              >
                <Printer className="h-4 w-4" /> Imprimir
              </button>
            )}
            {selected && esEditable && esGestor && (
              <button
                onClick={() => setConfirmCancelar(true)}
                className="px-3 py-2.5 rounded-lg font-medium"
                style={{ color: otEstadoColor('cancelada'), border: `1px solid ${theme.border}` }}
              >
                Cancelar OT
              </button>
            )}
            {selected && selected.estado === 'asignada' && (
              <button
                onClick={iniciar}
                className="px-3 py-2.5 rounded-lg font-medium"
                style={{ color: otEstadoColor('en_curso'), border: `1px solid ${otEstadoColor('en_curso')}` }}
              >
                Iniciar
              </button>
            )}
            {esGestor && esEditable && (
              <button
                onClick={guardar}
                disabled={guardando}
                className="flex-1 py-2.5 rounded-lg font-medium text-white disabled:opacity-60"
                style={{ backgroundColor: theme.primary }}
              >
                {guardando ? 'Guardando...' : 'Guardar'}
              </button>
            )}
          </div>
        ) : undefined}
      >
        <div className="space-y-4">
          {/* Cierre visible si ya está cerrada */}
          {selected && selected.estado === 'completada' && (
            <div className="rounded-xl p-3" style={{ backgroundColor: `${otEstadoColor('completada')}15`, border: `1px solid ${otEstadoColor('completada')}40` }}>
              <p className="text-xs font-semibold uppercase mb-1" style={{ color: otEstadoColor('completada') }}>Trabajo realizado</p>
              <p className="text-sm" style={{ color: theme.text }}>{selected.notas_cierre}</p>
              {selected.horas_reales != null && (
                <p className="text-xs mt-1" style={{ color: theme.textSecondary }}>{selected.horas_reales} hs reales</p>
              )}
            </div>
          )}
          {selected && selected.estado === 'cancelada' && selected.motivo_cancelacion && (
            <div className="rounded-xl p-3" style={{ backgroundColor: `${otEstadoColor('cancelada')}15`, border: `1px solid ${otEstadoColor('cancelada')}40` }}>
              <p className="text-xs font-semibold uppercase mb-1" style={{ color: otEstadoColor('cancelada') }}>Motivo de cancelación</p>
              <p className="text-sm" style={{ color: theme.text }}>{selected.motivo_cancelacion}</p>
            </div>
          )}
          {/* T6: OT frenada en campo (estado no final). El motivo viaja en motivo_cancelacion. */}
          {selected && selected.estado === 'bloqueada' && (
            <div className="rounded-xl p-3" style={{ backgroundColor: `${otEstadoColor('bloqueada')}15`, border: `1px solid ${otEstadoColor('bloqueada')}40` }}>
              <p className="text-xs font-semibold uppercase mb-1 flex items-center gap-1.5" style={{ color: otEstadoColor('bloqueada') }}>
                <OctagonAlert className="h-3.5 w-3.5" /> Orden bloqueada
              </p>
              {selected.motivo_cancelacion && (
                <p className="text-sm" style={{ color: theme.text }}>{selected.motivo_cancelacion}</p>
              )}
              <p className="text-[11px] mt-1" style={{ color: theme.textSecondary }}>
                El trabajo está frenado. Cuando se resuelva, completá la orden desde abajo.
              </p>
            </div>
          )}

          <div>
            <p className="text-xs font-semibold uppercase mb-1" style={{ color: theme.textSecondary }}>Título</p>
            <input
              type="text"
              value={form.titulo}
              onChange={e => setForm({ ...form, titulo: e.target.value })}
              placeholder="Ej: Poda y despeje de luminarias en Av. Central"
              disabled={!esGestor || !esEditable}
              className="w-full px-3 py-2 rounded-lg"
              style={inputStyle}
            />
          </div>

          <div>
            <p className="text-xs font-semibold uppercase mb-1" style={{ color: theme.textSecondary }}>Descripción del trabajo</p>
            <textarea
              value={form.descripcion}
              onChange={e => setForm({ ...form, descripcion: e.target.value })}
              rows={3}
              disabled={!esGestor || !esEditable}
              className="w-full px-3 py-2 rounded-lg resize-none"
              style={inputStyle}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs font-semibold uppercase mb-1" style={{ color: theme.textSecondary }}>Prioridad</p>
              <ModernSelect
                value={form.prioridad}
                onChange={(v) => setForm({ ...form, prioridad: v as PrioridadOT })}
                options={PRIORIDAD_OPTIONS}
                disabled={!esGestor || !esEditable}
              />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase mb-1" style={{ color: theme.textSecondary }}>Categoría</p>
              <ModernSelect
                value={form.categoria_id}
                onChange={(v) => setForm({ ...form, categoria_id: v })}
                options={categoriaOptions}
                disabled={!esGestor || !esEditable}
                searchable
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs font-semibold uppercase mb-1" style={{ color: theme.textSecondary }}>Cuadrilla</p>
              <ModernSelect
                value={form.cuadrilla_id}
                onChange={(v) => setForm({ ...form, cuadrilla_id: v })}
                options={cuadrillaOptions}
                disabled={!esGestor || !esEditable}
                searchable
              />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase mb-1" style={{ color: theme.textSecondary }}>Responsable</p>
              <ModernSelect
                value={form.empleado_id}
                onChange={(v) => setForm({ ...form, empleado_id: v })}
                options={empleadoOptions}
                disabled={!esGestor || !esEditable}
                searchable
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs font-semibold uppercase mb-1" style={{ color: theme.textSecondary }}>Fecha programada</p>
              <DatePicker
                value={form.fecha_programada}
                onChange={(v: string) => setForm({ ...form, fecha_programada: v })}
                disabled={!esGestor || !esEditable}
              />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase mb-1" style={{ color: theme.textSecondary }}>Horas estimadas</p>
              <input
                type="number"
                min={0}
                step={0.5}
                value={form.horas_estimadas}
                onChange={e => setForm({ ...form, horas_estimadas: e.target.value })}
                disabled={!esGestor || !esEditable}
                className="w-full px-3 py-2 rounded-lg"
                style={inputStyle}
              />
            </div>
          </div>

          {/* Reclamos vinculados */}
          <div>
            <p className="text-xs font-semibold uppercase mb-1" style={{ color: theme.textSecondary }}>Reclamos vinculados</p>
            {form.reclamo_ids.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {form.reclamo_ids.map(id => {
                  const est = reclamoEstado(id);
                  const estInfo = est ? getEstadoInfo(est) : null;
                  return (
                    <span
                      key={id}
                      className="flex items-center gap-1.5 text-xs pl-2 pr-2 py-1 rounded-lg"
                      style={{ backgroundColor: `${theme.primary}15`, color: theme.primary }}
                    >
                      <button
                        type="button"
                        onClick={() => navigate(`/gestion/reclamos?abrir=${id}`)}
                        className="flex items-center gap-1.5 hover:underline"
                        title="Ver reclamo"
                      >
                        <span>{reclamoLabel(id)}</span>
                        {estInfo && (
                          <span
                            className="px-1.5 py-0.5 rounded-full text-[10px] font-medium"
                            style={{ backgroundColor: estInfo.bg, color: estInfo.color }}
                          >
                            {estInfo.label}
                          </span>
                        )}
                      </button>
                      {esGestor && esEditable && (
                        <button
                          type="button"
                          onClick={() => setForm({ ...form, reclamo_ids: form.reclamo_ids.filter(r => r !== id) })}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </span>
                  );
                })}
              </div>
            )}
            {esGestor && esEditable && (
              <ModernSelect
                value=""
                onChange={(v) => v && setForm({ ...form, reclamo_ids: [...form.reclamo_ids, Number(v)] })}
                options={reclamoOptions}
                placeholder="Agregar reclamo..."
                searchable
              />
            )}
          </div>

          {/* Recursos de inventario (activos reservados + consumibles) */}
          {mostrarRecursos && (
            <div>
              <p className="text-xs font-semibold uppercase mb-1 flex items-center gap-1.5" style={{ color: theme.textSecondary }}>
                <Boxes className="h-3.5 w-3.5" /> Recursos del inventario
              </p>
              {form.recursos.length > 0 && (
                <div className="space-y-1.5 mb-2">
                  {form.recursos.map(r => {
                    const c = naturalezaColors[r.naturaleza] || theme.textSecondary;
                    const NatIcon = naturalezaIcons[r.naturaleza];
                    return (
                      <div key={r.item_id} className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ backgroundColor: theme.backgroundSecondary }}>
                        {NatIcon && <NatIcon className="h-4 w-4 flex-shrink-0" style={{ color: c }} />}
                        <span className="text-sm flex-1 truncate" style={{ color: theme.text }}>{r.nombre}</span>
                        {r.naturaleza === 'consumible' && (
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              min={1}
                              step="any"
                              value={r.cantidad ?? 1}
                              onChange={e => setCantidadRecurso(r.item_id, Number(e.target.value) || 1)}
                              disabled={!esGestor || !esEditable}
                              className="w-16 px-2 py-1 rounded text-sm text-right"
                              style={inputStyle}
                            />
                            <span className="text-[11px] w-10" style={{ color: theme.textSecondary }}>{r.unidad || 'u'}</span>
                          </div>
                        )}
                        {r.naturaleza === 'activo' && (
                          <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded" style={{ backgroundColor: `${c}20`, color: c }}>reserva</span>
                        )}
                        {esGestor && esEditable && (
                          <button onClick={() => quitarRecurso(r.item_id)}>
                            <X className="h-3.5 w-3.5" style={{ color: theme.textSecondary }} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {esGestor && esEditable && recursoOptions.length > 0 && (
                <ModernSelect
                  value=""
                  onChange={(v) => v && agregarRecurso(Number(v))}
                  options={recursoOptions}
                  placeholder="Agregar del inventario..."
                  searchable
                />
              )}
              <p className="text-[11px] mt-1" style={{ color: theme.textSecondary }}>
                Los activos quedan tomados hasta cerrar la OT. El stock de los consumibles se descuenta al completarla.
              </p>
            </div>
          )}

          {/* Materiales sueltos (texto libre, para lo que no está en el catálogo) */}
          <div>
            <p className="text-xs font-semibold uppercase mb-1" style={{ color: theme.textSecondary }}>Materiales sueltos</p>
            {form.materiales.length > 0 && (
              <div className="space-y-1 mb-2">
                {form.materiales.map((m, i) => (
                  <div key={i} className="flex items-center justify-between text-sm px-3 py-1.5 rounded-lg" style={{ backgroundColor: theme.backgroundSecondary, color: theme.text }}>
                    <span>{m.descripcion}{m.cantidad > 1 ? ` × ${m.cantidad}` : ''}{m.unidad ? ` ${m.unidad}` : ''}</span>
                    {esGestor && esEditable && (
                      <button onClick={() => setForm({ ...form, materiales: form.materiales.filter((_, j) => j !== i) })}>
                        <X className="h-3.5 w-3.5" style={{ color: theme.textSecondary }} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
            {esGestor && esEditable && (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={nuevoMaterial}
                  onChange={e => setNuevoMaterial(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && nuevoMaterial.trim()) {
                      setForm({ ...form, materiales: [...form.materiales, { descripcion: nuevoMaterial.trim(), cantidad: 1 }] });
                      setNuevoMaterial('');
                    }
                  }}
                  placeholder="Ej: Bolsas de cemento (Enter para agregar)"
                  className="flex-1 px-3 py-2 rounded-lg text-sm"
                  style={inputStyle}
                />
              </div>
            )}
          </div>

          {/* Completar (asignada / en_curso / bloqueada — T6: se puede cerrar tras destrabar) */}
          {selected && (selected.estado === 'asignada' || selected.estado === 'en_curso' || selected.estado === 'bloqueada') && (
            <div className="rounded-xl p-3 space-y-2" style={{ border: `1px dashed ${otEstadoColor('completada')}60` }}>
              <p className="text-xs font-semibold uppercase" style={{ color: otEstadoColor('completada') }}>Completar orden</p>
              <textarea
                value={notasCierre}
                onChange={e => setNotasCierre(e.target.value)}
                rows={2}
                placeholder="Qué se hizo (obligatorio para completar)..."
                className="w-full px-3 py-2 rounded-lg text-sm resize-none"
                style={inputStyle}
              />
              {/* T6: consumo REAL usado por consumible (editable por el empleado). */}
              {consumiblesOT.length > 0 && (
                <div className="rounded-lg p-2" style={{ backgroundColor: theme.backgroundSecondary }}>
                  <p className="text-[11px] font-semibold uppercase mb-1.5 flex items-center gap-1.5" style={{ color: theme.textSecondary }}>
                    <Boxes className="h-3.5 w-3.5" /> Consumo real usado
                  </p>
                  <div className="space-y-1.5">
                    {consumiblesOT.map(r => (
                      <div key={r.id} className="flex items-center gap-2">
                        <span className="text-sm flex-1 truncate" style={{ color: theme.text }}>{r.item_nombre || `#${r.item_id}`}</span>
                        <input
                          type="number"
                          min={0}
                          step="any"
                          value={consumosReales[r.id] ?? r.cantidad ?? 1}
                          onChange={e => setConsumoReal(r.id, Number(e.target.value) || 0)}
                          className="w-20 px-2 py-1 rounded text-sm text-right"
                          style={inputStyle}
                        />
                        <span className="text-[11px] w-10" style={{ color: theme.textSecondary }}>{r.unidad || 'u'}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] mt-1.5" style={{ color: theme.textSecondary }}>
                    Ajustá lo que realmente se usó: se descuenta esa cantidad del stock al completar.
                  </p>
                </div>
              )}
              <div className="flex gap-2">
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  value={horasReales}
                  onChange={e => setHorasReales(e.target.value)}
                  placeholder="Horas reales"
                  className="w-32 px-3 py-2 rounded-lg text-sm"
                  style={inputStyle}
                />
                <button
                  onClick={completar}
                  disabled={!notasCierre.trim()}
                  className="flex-1 py-2 rounded-lg font-medium text-white disabled:opacity-50"
                  style={{ backgroundColor: otEstadoColor('completada') }}
                >
                  Completar
                </button>
              </div>
              {selected.reclamos.length > 0 && (
                <label className="flex items-center gap-2 cursor-pointer text-sm select-none" style={{ color: theme.text }}>
                  <input
                    type="checkbox"
                    checked={finalizarReclamos}
                    onChange={e => setFinalizarReclamos(e.target.checked)}
                    className="h-4 w-4 rounded"
                    style={{ accentColor: otEstadoColor('completada') }}
                  />
                  <span>
                    Finalizar también {selected.reclamos.length === 1 ? 'el reclamo vinculado' : `los ${selected.reclamos.length} reclamos vinculados`}
                  </span>
                </label>
              )}
              <p className="text-[11px]" style={{ color: theme.textSecondary }}>
                {finalizarReclamos
                  ? 'Los reclamos vinculados quedarán finalizados y se le avisará a cada vecino para calificar.'
                  : 'Por defecto, completar la orden no cierra los reclamos: cada reclamo mantiene su circuito de resolución y confirmación.'}
              </p>
            </div>
          )}

          {/* T6: bloquear en campo — frenar la OT sin cerrarla (falta material, clima, etc.).
              Operable por el responsable de la OT; el backend valida quién puede. */}
          {selected && (selected.estado === 'asignada' || selected.estado === 'en_curso') && (
            <button
              onClick={() => setConfirmBloquear(true)}
              className="w-full py-2.5 rounded-lg font-medium flex items-center justify-center gap-1.5"
              style={{ color: otEstadoColor('bloqueada'), border: `1px solid ${otEstadoColor('bloqueada')}60` }}
            >
              <OctagonAlert className="h-4 w-4" /> No puedo terminar — bloquear
            </button>
          )}
        </div>
      </Sheet>

      <ConfirmModal
        isOpen={confirmCancelar}
        onClose={() => setConfirmCancelar(false)}
        onConfirm={cancelar}
        title="Cancelar orden de trabajo"
        message={
          <div className="space-y-2">
            <p>Indicá el motivo de la cancelación:</p>
            <textarea
              value={motivoCancelacion}
              onChange={e => setMotivoCancelacion(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 rounded-lg text-sm resize-none"
              style={inputStyle}
            />
          </div> as unknown as string
        }
        confirmText="Cancelar OT"
        cancelText="Volver"
        variant="danger"
      />

      {/* T6: bloquear OT en campo — elegir motivo + nota opcional. */}
      <ConfirmModal
        isOpen={confirmBloquear}
        onClose={() => setConfirmBloquear(false)}
        onConfirm={bloquear}
        title="Bloquear orden de trabajo"
        icon={<OctagonAlert className="h-8 w-8" />}
        message={
          <div className="space-y-3 text-left">
            <p style={{ color: theme.textSecondary }}>
              La orden queda frenada (no es un cierre). Se avisa a los supervisores. Después podés completarla o cancelarla.
            </p>
            <div>
              <p className="text-xs font-semibold uppercase mb-1" style={{ color: theme.textSecondary }}>Motivo</p>
              <ModernSelect
                value={motivoBloqueoTipo}
                onChange={(v) => setMotivoBloqueoTipo(v as MotivoBloqueoOT)}
                options={OT_MOTIVO_BLOQUEO_OPTIONS.map(o => ({ value: o.value, label: o.label }))}
              />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase mb-1" style={{ color: theme.textSecondary }}>Nota (opcional)</p>
              <textarea
                value={motivoBloqueoNota}
                onChange={e => setMotivoBloqueoNota(e.target.value)}
                rows={2}
                placeholder="Detalle de por qué se frenó..."
                className="w-full px-3 py-2 rounded-lg text-sm resize-none"
                style={inputStyle}
              />
            </div>
          </div>
        }
        confirmText="Bloquear"
        cancelText="Volver"
        variant="warning"
        loading={bloqueando}
      />
    </>
  );
}
