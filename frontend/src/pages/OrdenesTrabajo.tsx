import { useEffect, useMemo, useState, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Hammer, Plus, Users, User as UserIcon, Calendar, ClipboardList, X, Boxes, Printer } from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { ABMPage, ABMTable } from '../components/ui/ABMPage';
import { Sheet } from '../components/ui/Sheet';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { ModernSelect, type SelectOption } from '../components/ui/ModernSelect';
import { DatePicker } from '../components/ui/DatePicker';
import { ordenesTrabajoApi, empleadosApi, empleadosGestionApi, reclamosApi, inventarioApi, otTiposTrabajoApi } from '../lib/api';
import { otEstadoLabel, otEstadoColor, otEstadoIcons, otEstadoLabels } from '../lib/enums/ordenTrabajo';
import { naturalezaColors, naturalezaIcons } from '../lib/enums/inventario';
import { prioridadLabels, prioridadColor, prioridadIcons, PRIORIDAD_OPTIONS } from '../lib/enums/prioridadOT';
import { getEstadoInfo } from '../lib/estadoConfig';
import { imprimirOrdenTrabajo } from '../lib/printOrdenTrabajo';
import type { OrdenTrabajo, OTMaterial, EstadoOrdenTrabajo, Reclamo, Empleado, InventarioItem, NaturalezaInventario, OTTipoTrabajo, PrioridadOT } from '../types';

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
  tipo_trabajo_id: string;
  cuadrilla_id: string;
  empleado_id: string;
  fecha_programada: string;
  horas_estimadas: string;
  materiales: OTMaterial[];
  recursos: RecursoForm[];
  reclamo_ids: number[];
};

const FORM_VACIO: FormState = {
  titulo: '', descripcion: '', prioridad: 'media', tipo_trabajo_id: '',
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

  // Catálogos para el form
  const [cuadrillas, setCuadrillas] = useState<CuadrillaMini[]>([]);
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [reclamosActivos, setReclamosActivos] = useState<Reclamo[]>([]);
  const [itemsDisponibles, setItemsDisponibles] = useState<InventarioItem[]>([]);
  const [tiposTrabajo, setTiposTrabajo] = useState<OTTipoTrabajo[]>([]);
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
      // Tipos de trabajo (para el selector del formato)
      try {
        const tRes = await otTiposTrabajoApi.list({ activo: true });
        setTiposTrabajo(tRes.data || []);
      } catch { /* sin tipos: el selector queda vacío */ }
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
      tipo_trabajo_id: ot.tipo_trabajo_id ? String(ot.tipo_trabajo_id) : '',
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
    setSheetOpen(true);
  };

  const buildPayload = () => ({
    titulo: form.titulo.trim(),
    descripcion: form.descripcion.trim() || null,
    prioridad: form.prioridad,
    tipo_trabajo_id: form.tipo_trabajo_id ? Number(form.tipo_trabajo_id) : null,
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

  const completar = async () => {
    if (!selected) return;
    if (!notasCierre.trim()) { toast.error('Contá qué se hizo (notas de cierre)'); return; }
    try {
      await ordenesTrabajoApi.completar(selected.id, {
        notas_cierre: notasCierre.trim(),
        horas_reales: horasReales ? Number(horasReales) : undefined,
        finalizar_reclamos: finalizarReclamos,
      });
      toast.success('Orden completada');
      setSheetOpen(false);
      await fetchOrdenes();
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail || 'No se pudo completar');
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

  const tipoTrabajoOptions: SelectOption[] = useMemo(() => ([
    { value: '', label: 'Sin clasificar' },
    ...tiposTrabajo.map(t => ({ value: String(t.id), label: t.nombre })),
  ]), [tiposTrabajo]);

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

  const otTableColumns = [
    {
      key: 'numero',
      header: 'Número',
      sortValue: (ot: OrdenTrabajo) => ot.numero,
      render: (ot: OrdenTrabajo) => (
        <span className="font-mono text-xs" style={{ color: theme.textSecondary }}>{ot.numero}</span>
      ),
    },
    {
      key: 'titulo',
      header: 'Título',
      width: '260px',
      sortValue: (ot: OrdenTrabajo) => ot.titulo,
      render: (ot: OrdenTrabajo) => (
        <span className="text-sm font-medium truncate block" style={{ color: theme.text }}>{ot.titulo}</span>
      ),
    },
    {
      key: 'responsable',
      header: 'Responsable',
      sortValue: (ot: OrdenTrabajo) => ot.cuadrilla_nombre || ot.empleado_nombre || '',
      render: (ot: OrdenTrabajo) => (
        <div className="flex items-center gap-1.5 text-xs" style={{ color: theme.textSecondary }}>
          {ot.cuadrilla_nombre && <><Users className="h-3.5 w-3.5" />{ot.cuadrilla_nombre}</>}
          {ot.empleado_nombre && <><UserIcon className="h-3.5 w-3.5" />{ot.empleado_nombre}</>}
          {!ot.cuadrilla_nombre && !ot.empleado_nombre && '—'}
        </div>
      ),
    },
    {
      key: 'prioridad',
      header: 'Prioridad',
      sortValue: (ot: OrdenTrabajo) => ot.prioridad || '',
      render: (ot: OrdenTrabajo) => {
        const color = prioridadColor(ot.prioridad);
        const PIcon = prioridadIcons[ot.prioridad as PrioridadOT];
        return (
          <span className="flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full w-fit" style={{ backgroundColor: `${color}20`, color }}>
            {PIcon && <PIcon className="h-3 w-3" />}
            {prioridadLabels[ot.prioridad as PrioridadOT] || ot.prioridad}
          </span>
        );
      },
    },
    {
      key: 'reclamos',
      header: 'Reclamos',
      sortValue: (ot: OrdenTrabajo) => ot.reclamos.length,
      render: (ot: OrdenTrabajo) => (
        <span className="flex items-center gap-1 text-xs" style={{ color: theme.textSecondary }}>
          <ClipboardList className="h-3.5 w-3.5" />{ot.reclamos.length}
        </span>
      ),
    },
    {
      key: 'fecha_programada',
      header: 'Programada',
      sortValue: (ot: OrdenTrabajo) => ot.fecha_programada || '',
      render: (ot: OrdenTrabajo) => ot.fecha_programada ? (
        <span className="text-xs" style={{ color: theme.textSecondary }}>
          {new Date(`${ot.fecha_programada}T00:00:00`).toLocaleDateString('es-AR')}
        </span>
      ) : <span className="text-xs" style={{ color: theme.textSecondary }}>—</span>,
    },
    {
      key: 'estado',
      header: 'Estado',
      sortValue: (ot: OrdenTrabajo) => ot.estado,
      render: (ot: OrdenTrabajo) => {
        const color = otEstadoColor(ot.estado);
        const EstadoIcon = otEstadoIcons[ot.estado as EstadoOrdenTrabajo] || Hammer;
        return (
          <span className="flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full w-fit" style={{ backgroundColor: `${color}20`, color }}>
            <EstadoIcon className="h-3 w-3" />
            {otEstadoLabel(ot.estado)}
          </span>
        );
      },
    },
  ];

  return (
    <>
      <ABMPage
        title="Órdenes de trabajo"
        icon={<Hammer className="h-5 w-5" />}
        searchPlaceholder="Buscar por número o título..."
        searchValue={search}
        onSearchChange={setSearch}
        loading={loading}
        isEmpty={ordenes.length === 0}
        emptyMessage="No hay órdenes de trabajo. Creá la primera desde un reclamo o desde acá."
        buttonLabel="Nueva orden"
        buttonIcon={<Plus className="h-4 w-4 mr-1.5" />}
        onAdd={esGestor ? () => abrirNueva() : undefined}
        defaultViewMode="table"
        viewStorageKey="ordenes_trabajo_view"
        toolbar={{
          statusPills: {
            value: filtroEstado,
            onChange: (v: string) => setFiltroEstado(v),
            items: (Object.keys(otEstadoLabels) as EstadoOrdenTrabajo[]).map(estado => ({
              key: estado,
              label: otEstadoLabels[estado],
              icon: otEstadoIcons[estado],
              color: otEstadoColor(estado),
              count: conteosEstado[estado] || 0,
            })),
          },
          layout: 'left',
        }}
        tableView={
          <ABMTable
            data={ordenes}
            columns={otTableColumns}
            keyExtractor={(ot: OrdenTrabajo) => ot.id}
            onRowClick={(ot: OrdenTrabajo) => abrirDetalle(ot)}
            defaultSortKey="numero"
            defaultSortDirection="desc"
          />
        }
      >
        {ordenes.map(ot => {
          const color = otEstadoColor(ot.estado);
          const EstadoIcon = otEstadoIcons[ot.estado as EstadoOrdenTrabajo] || Hammer;
          return (
            <div
              key={ot.id}
              onClick={() => abrirDetalle(ot)}
              className="rounded-2xl p-5 cursor-pointer transition-all hover:scale-[1.01]"
              style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}`, borderLeft: `4px solid ${color}` }}
            >
              <div className="flex items-start justify-between mb-3 gap-2">
                <span className="font-mono text-xs px-2 py-0.5 rounded" style={{ backgroundColor: theme.backgroundSecondary, color: theme.textSecondary }}>
                  {ot.numero}
                </span>
                <div className="flex items-center gap-1.5 flex-wrap justify-end">
                  {(() => {
                    const pColor = prioridadColor(ot.prioridad);
                    const PIcon = prioridadIcons[ot.prioridad as PrioridadOT];
                    return (
                      <span className="flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: `${pColor}20`, color: pColor }}>
                        {PIcon && <PIcon className="h-3 w-3" />}
                        {prioridadLabels[ot.prioridad as PrioridadOT] || ot.prioridad}
                      </span>
                    );
                  })()}
                  <span className="flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: `${color}20`, color }}>
                    <EstadoIcon className="h-3 w-3" />
                    {otEstadoLabel(ot.estado)}
                  </span>
                </div>
              </div>
              {ot.tipo_trabajo_nombre && (
                <span className="inline-block text-[11px] font-medium px-2 py-0.5 rounded-full mb-1.5" style={{ backgroundColor: `${ot.tipo_trabajo_color || theme.primary}15`, color: ot.tipo_trabajo_color || theme.primary }}>
                  {ot.tipo_trabajo_nombre}
                </span>
              )}
              <h3 className="font-bold mb-1 line-clamp-2" style={{ color: theme.text }}>{ot.titulo}</h3>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs" style={{ color: theme.textSecondary }}>
                {ot.cuadrilla_nombre && (
                  <span className="flex items-center gap-1"><Users className="h-3 w-3" />{ot.cuadrilla_nombre}</span>
                )}
                {ot.empleado_nombre && (
                  <span className="flex items-center gap-1"><UserIcon className="h-3 w-3" />{ot.empleado_nombre}</span>
                )}
                {ot.fecha_programada && (
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {new Date(`${ot.fecha_programada}T00:00:00`).toLocaleDateString('es-AR')}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <ClipboardList className="h-3 w-3" />
                  {ot.reclamos.length} reclamo{ot.reclamos.length === 1 ? '' : 's'}
                </span>
              </div>
            </div>
          );
        })}
      </ABMPage>

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
              <p className="text-xs font-semibold uppercase mb-1" style={{ color: theme.textSecondary }}>Tipo de trabajo</p>
              <ModernSelect
                value={form.tipo_trabajo_id}
                onChange={(v) => setForm({ ...form, tipo_trabajo_id: v })}
                options={tipoTrabajoOptions}
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

          {/* Completar (asignada / en_curso) */}
          {selected && (selected.estado === 'asignada' || selected.estado === 'en_curso') && (
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
    </>
  );
}
