import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import {
  Search,
  GripVertical,
  Plus,
  FileText,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
  FileCheck,
  Eye,
  User,
  Phone,
  Mail,
  MapPin,
  Send,
  Loader2,
  Store,
  Car,
  HardHat,
  TreeDeciduous,
  Users,
  Trash2,
  CreditCard,
  Hash,
  BadgePercent,
  Megaphone,
  Dog,
  CalendarDays,
  Map,
  AlertTriangle,
  Sparkles,
  UserPlus,
  History,
  ChevronDown,
  ChevronUp,
  Copy,
  LayoutGrid,
  List,
  Filter,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { tramitesApi, empleadosApi } from '../lib/api';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { Sheet } from '../components/ui/Sheet';
import type { Tramite, EstadoTramite, ServicioTramite, Empleado } from '../types';
import React from 'react';

// Configuración de estados para Kanban
interface ColumnaKanban {
  id: EstadoTramite;
  titulo: string;
  color: string;
  headerClass: string;
  cardClass: string;
  badgeClass: string;
}

const columnasKanban: ColumnaKanban[] = [
  {
    id: 'iniciado',
    titulo: 'Nuevos',
    color: '#6366f1',
    headerClass: 'bg-gradient-to-r from-indigo-500 to-indigo-600',
    cardClass: 'bg-gradient-to-br from-indigo-50 to-white dark:from-indigo-950/30 dark:to-gray-900',
    badgeClass: 'bg-indigo-100 text-indigo-700',
  },
  {
    id: 'en_revision',
    titulo: 'En Revisión',
    color: '#3b82f6',
    headerClass: 'bg-gradient-to-r from-blue-500 to-blue-600',
    cardClass: 'bg-gradient-to-br from-blue-50 to-white dark:from-blue-950/30 dark:to-gray-900',
    badgeClass: 'bg-blue-100 text-blue-700',
  },
  {
    id: 'en_proceso',
    titulo: 'En Proceso',
    color: '#f59e0b',
    headerClass: 'bg-gradient-to-r from-amber-500 to-amber-600',
    cardClass: 'bg-gradient-to-br from-amber-50 to-white dark:from-amber-950/30 dark:to-gray-900',
    badgeClass: 'bg-amber-100 text-amber-700',
  },
  {
    id: 'aprobado',
    titulo: 'Aprobados',
    color: '#10b981',
    headerClass: 'bg-gradient-to-r from-emerald-500 to-emerald-600',
    cardClass: 'bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-950/30 dark:to-gray-900',
    badgeClass: 'bg-emerald-100 text-emerald-700',
  },
  {
    id: 'finalizado',
    titulo: 'Finalizados',
    color: '#059669',
    headerClass: 'bg-gradient-to-r from-green-600 to-green-700',
    cardClass: 'bg-gradient-to-br from-green-50 to-white dark:from-green-950/30 dark:to-gray-900',
    badgeClass: 'bg-green-100 text-green-700',
  },
];

const estadoConfig: Record<EstadoTramite, { icon: typeof Clock; color: string; label: string; bg: string }> = {
  iniciado: { icon: Clock, color: '#6366f1', label: 'Iniciado', bg: '#6366f115' },
  en_revision: { icon: FileCheck, color: '#3b82f6', label: 'En Revisión', bg: '#3b82f615' },
  requiere_documentacion: { icon: AlertCircle, color: '#f59e0b', label: 'Requiere Doc.', bg: '#f59e0b15' },
  en_proceso: { icon: RefreshCw, color: '#8b5cf6', label: 'En Proceso', bg: '#8b5cf615' },
  aprobado: { icon: CheckCircle2, color: '#10b981', label: 'Aprobado', bg: '#10b98115' },
  rechazado: { icon: XCircle, color: '#ef4444', label: 'Rechazado', bg: '#ef444415' },
  finalizado: { icon: CheckCircle2, color: '#059669', label: 'Finalizado', bg: '#05966915' },
};

const estadoTransiciones: Record<EstadoTramite, EstadoTramite[]> = {
  iniciado: ['en_revision', 'requiere_documentacion', 'rechazado'],
  en_revision: ['en_proceso', 'requiere_documentacion', 'aprobado', 'rechazado'],
  requiere_documentacion: ['en_revision', 'rechazado'],
  en_proceso: ['aprobado', 'rechazado'],
  aprobado: ['finalizado'],
  rechazado: [],
  finalizado: [],
};

const servicioIcons: Record<string, React.ReactNode> = {
  'Store': <Store className="h-5 w-5" />,
  'FileCheck': <FileCheck className="h-5 w-5" />,
  'HardHat': <HardHat className="h-5 w-5" />,
  'Car': <Car className="h-5 w-5" />,
  'Map': <Map className="h-5 w-5" />,
  'Dog': <Dog className="h-5 w-5" />,
  'Megaphone': <Megaphone className="h-5 w-5" />,
  'TreeDeciduous': <TreeDeciduous className="h-5 w-5" />,
  'Users': <Users className="h-5 w-5" />,
  'Trash2': <Trash2 className="h-5 w-5" />,
  'CalendarDays': <CalendarDays className="h-5 w-5" />,
  'Hash': <Hash className="h-5 w-5" />,
  'BadgePercent': <BadgePercent className="h-5 w-5" />,
  'AlertTriangle': <AlertTriangle className="h-5 w-5" />,
  'CreditCard': <CreditCard className="h-5 w-5" />,
  'default': <FileText className="h-5 w-5" />,
};

interface HistorialItem {
  id: number;
  tramite_id: number;
  usuario_id: number | null;
  estado_anterior: EstadoTramite | null;
  estado_nuevo: EstadoTramite | null;
  accion: string;
  comentario: string | null;
  created_at: string;
}

interface SugerenciaEmpleado {
  sugerencia: {
    id: number;
    nombre: string;
    especialidad: string;
    carga_actual: number;
    capacidad_maxima: number;
  } | null;
  mensaje: string | null;
  empleados: Array<{
    id: number;
    nombre: string;
    especialidad: string;
    carga_actual: number;
    capacidad_maxima: number;
  }>;
}

type ViewMode = 'kanban' | 'tabla';

export default function GestionTramites() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [tramites, setTramites] = useState<Tramite[]>([]);
  const [servicios, setServicios] = useState<ServicioTramite[]>([]);
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filtroServicio, setFiltroServicio] = useState<number | 'todos'>('todos');
  const [filtroEmpleado, setFiltroEmpleado] = useState<number | 'todos'>('todos');
  const [filtroSinAsignar, setFiltroSinAsignar] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('kanban');

  // Sheet para ver/editar trámite
  const [selectedTramite, setSelectedTramite] = useState<Tramite | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Formulario de actualización
  const [nuevoEstado, setNuevoEstado] = useState<EstadoTramite | ''>('');
  const [respuesta, setRespuesta] = useState('');
  const [observaciones, setObservaciones] = useState('');

  // Asignación de empleado
  const [empleadoSeleccionado, setEmpleadoSeleccionado] = useState<number | ''>('');
  const [sugerenciaIA, setSugerenciaIA] = useState<SugerenciaEmpleado | null>(null);
  const [loadingSugerencia, setLoadingSugerencia] = useState(false);
  const [asignando, setAsignando] = useState(false);

  // Historial
  const [historial, setHistorial] = useState<HistorialItem[]>([]);
  const [loadingHistorial, setLoadingHistorial] = useState(false);
  const [showHistorial, setShowHistorial] = useState(false);

  // Resumen
  const [resumen, setResumen] = useState<{ total: number; hoy: number; por_estado: Record<string, number> } | null>(null);

  const canDrag = user?.rol === 'admin' || user?.rol === 'supervisor' || user?.rol === 'empleado';

  useEffect(() => {
    loadData();
  }, []);

  // Abrir trámite desde URL
  useEffect(() => {
    const tramiteId = searchParams.get('id');
    if (tramiteId && tramites.length > 0) {
      const tramite = tramites.find(t => t.id === Number(tramiteId));
      if (tramite) {
        openTramite(tramite);
      }
    }
  }, [searchParams, tramites]);

  const loadData = async () => {
    try {
      const [tramitesRes, serviciosRes, empleadosRes, resumenRes] = await Promise.all([
        tramitesApi.getGestionTodos(),
        tramitesApi.getServicios(),
        empleadosApi.getAll().catch(() => ({ data: [] })),
        tramitesApi.getResumen().catch(() => ({ data: null })),
      ]);
      setTramites(tramitesRes.data);
      setServicios(serviciosRes.data);
      setEmpleados(empleadosRes.data);
      setResumen(resumenRes.data);
    } catch (error) {
      console.error('Error cargando datos:', error);
      toast.error('Error al cargar trámites');
    } finally {
      setLoading(false);
    }
  };

  const openTramite = async (tramite: Tramite) => {
    setSelectedTramite(tramite);
    setNuevoEstado('');
    setRespuesta(tramite.respuesta || '');
    setObservaciones(tramite.observaciones || '');
    setEmpleadoSeleccionado(tramite.empleado_id || '');
    setSugerenciaIA(null);
    setHistorial([]);
    setShowHistorial(false);
    setSheetOpen(true);
    setSearchParams({ id: String(tramite.id) });
  };

  const closeSheet = () => {
    setSheetOpen(false);
    setSelectedTramite(null);
    searchParams.delete('id');
    setSearchParams(searchParams);
  };

  const loadHistorial = async () => {
    if (!selectedTramite) return;
    setLoadingHistorial(true);
    try {
      const res = await tramitesApi.getHistorial(selectedTramite.id);
      setHistorial(res.data);
      setShowHistorial(true);
    } catch (error) {
      console.error('Error cargando historial:', error);
      toast.error('Error al cargar historial');
    } finally {
      setLoadingHistorial(false);
    }
  };

  const handleSugerirEmpleado = async () => {
    if (!selectedTramite) return;
    setLoadingSugerencia(true);
    try {
      const res = await tramitesApi.sugerirEmpleado(selectedTramite.id);
      setSugerenciaIA(res.data);
      if (res.data.sugerencia) {
        setEmpleadoSeleccionado(res.data.sugerencia.id);
        toast.success(`IA sugiere: ${res.data.sugerencia.nombre}`);
      }
    } catch (error) {
      console.error('Error obteniendo sugerencia:', error);
      toast.error('Error al obtener sugerencia de IA');
    } finally {
      setLoadingSugerencia(false);
    }
  };

  const handleAsignarEmpleado = async () => {
    if (!selectedTramite || !empleadoSeleccionado) {
      toast.error('Selecciona un empleado');
      return;
    }
    setAsignando(true);
    try {
      await tramitesApi.asignar(selectedTramite.id, {
        empleado_id: Number(empleadoSeleccionado),
        comentario: sugerenciaIA?.mensaje || undefined,
      });
      toast.success('Empleado asignado correctamente');
      closeSheet();
      loadData();
    } catch (error) {
      console.error('Error asignando empleado:', error);
      toast.error('Error al asignar empleado');
    } finally {
      setAsignando(false);
    }
  };

  const handleUpdateTramite = async () => {
    if (!selectedTramite || !nuevoEstado) {
      toast.error('Selecciona un nuevo estado');
      return;
    }

    setSaving(true);
    try {
      await tramitesApi.update(selectedTramite.id, {
        estado: nuevoEstado,
        respuesta: respuesta || undefined,
        observaciones: observaciones || undefined,
      });
      toast.success('Trámite actualizado');
      closeSheet();
      loadData();
    } catch (error) {
      console.error('Error actualizando trámite:', error);
      toast.error('Error al actualizar trámite');
    } finally {
      setSaving(false);
    }
  };

  // Drag & Drop handler
  const handleDragEnd = async (result: DropResult) => {
    const { source, destination, draggableId } = result;

    if (!destination) return;
    if (source.droppableId === destination.droppableId) return;

    const tramiteId = parseInt(draggableId);
    const nuevoEstado = destination.droppableId as EstadoTramite;
    const estadoAnterior = source.droppableId as EstadoTramite;

    // Verificar si la transición es válida
    if (!estadoTransiciones[estadoAnterior]?.includes(nuevoEstado) &&
        !['iniciado', 'en_revision', 'en_proceso', 'aprobado', 'finalizado'].includes(nuevoEstado)) {
      toast.error('Transición de estado no permitida');
      return;
    }

    // Actualizar estado local optimistamente
    setTramites(prev =>
      prev.map(t =>
        t.id === tramiteId ? { ...t, estado: nuevoEstado } : t
      )
    );

    try {
      await tramitesApi.update(tramiteId, { estado: nuevoEstado });
      toast.success(`Trámite movido a "${columnasKanban.find(c => c.id === nuevoEstado)?.titulo}"`);
    } catch (error) {
      // Revertir en caso de error
      setTramites(prev =>
        prev.map(t =>
          t.id === tramiteId ? { ...t, estado: estadoAnterior } : t
        )
      );
      console.error('Error al cambiar estado:', error);
      toast.error('Error al cambiar el estado del trámite');
    }
  };

  const getTramitesPorEstado = (estado: EstadoTramite) => {
    return tramites
      .filter(t => t.estado === estado)
      .filter(t => {
        const matchSearch = searchTerm === '' ||
          t.numero_tramite.toLowerCase().includes(searchTerm.toLowerCase()) ||
          t.asunto.toLowerCase().includes(searchTerm.toLowerCase()) ||
          t.nombre_solicitante?.toLowerCase().includes(searchTerm.toLowerCase());
        const matchServicio = filtroServicio === 'todos' || t.servicio_id === filtroServicio;
        const matchEmpleado = filtroEmpleado === 'todos' || t.empleado_id === filtroEmpleado;
        const matchSinAsignar = !filtroSinAsignar || !t.empleado_id;
        return matchSearch && matchServicio && matchEmpleado && matchSinAsignar;
      });
  };

  const filteredTramites = tramites.filter(t => {
    const matchSearch = t.numero_tramite.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.asunto.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.nombre_solicitante?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.email_solicitante?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.dni_solicitante?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchServicio = filtroServicio === 'todos' || t.servicio_id === filtroServicio;
    const matchEmpleado = filtroEmpleado === 'todos' || t.empleado_id === filtroEmpleado;
    const matchSinAsignar = !filtroSinAsignar || !t.empleado_id;
    return matchSearch && matchServicio && matchEmpleado && matchSinAsignar;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: theme.primary }} />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header con título, botón nuevo y selector de vista */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold gradient-text-rainbow">
            Gestión de Trámites
          </h1>
          <p className="text-sm mt-1" style={{ color: theme.textSecondary }}>
            Administra las solicitudes de trámites del municipio
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Selector de vista */}
          <div
            className="flex rounded-lg p-1"
            style={{ backgroundColor: theme.backgroundSecondary }}
          >
            <button
              onClick={() => setViewMode('kanban')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                viewMode === 'kanban' ? 'shadow-sm' : ''
              }`}
              style={{
                backgroundColor: viewMode === 'kanban' ? theme.card : 'transparent',
                color: viewMode === 'kanban' ? theme.primary : theme.textSecondary,
              }}
            >
              <LayoutGrid className="h-4 w-4" />
              Kanban
            </button>
            <button
              onClick={() => setViewMode('tabla')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                viewMode === 'tabla' ? 'shadow-sm' : ''
              }`}
              style={{
                backgroundColor: viewMode === 'tabla' ? theme.card : 'transparent',
                color: viewMode === 'tabla' ? theme.primary : theme.textSecondary,
              }}
            >
              <List className="h-4 w-4" />
              Tabla
            </button>
          </div>

          {/* Botón Nuevo Trámite */}
          <button
            onClick={() => navigate('/tramites')}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white shadow-lg hover:shadow-xl transition-all"
            style={{
              background: `linear-gradient(135deg, ${theme.primary}, ${theme.primaryHover})`,
            }}
          >
            <Plus className="h-4 w-4" />
            Nuevo Trámite
          </button>

          {/* Botón refrescar */}
          <button
            onClick={loadData}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm"
            style={{
              backgroundColor: theme.card,
              border: `1px solid ${theme.border}`,
              color: theme.text,
            }}
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Stats resumen */}
      {resumen && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatCard
            theme={theme}
            icon={<FileText className="h-5 w-5" />}
            label="Total"
            value={resumen.total}
            color={theme.primary}
          />
          <StatCard
            theme={theme}
            icon={<Clock className="h-5 w-5" />}
            label="Hoy"
            value={resumen.hoy}
            color="#f59e0b"
          />
          <StatCard
            theme={theme}
            icon={<AlertCircle className="h-5 w-5" />}
            label="Sin Asignar"
            value={tramites.filter(t => !t.empleado_id).length}
            color="#ef4444"
          />
          <StatCard
            theme={theme}
            icon={<RefreshCw className="h-5 w-5" />}
            label="En Proceso"
            value={(resumen.por_estado?.en_proceso || 0) + (resumen.por_estado?.en_revision || 0)}
            color="#8b5cf6"
          />
          <StatCard
            theme={theme}
            icon={<CheckCircle2 className="h-5 w-5" />}
            label="Finalizados"
            value={(resumen.por_estado?.aprobado || 0) + (resumen.por_estado?.finalizado || 0)}
            color="#10b981"
          />
        </div>
      )}

      {/* Filtros */}
      <div
        className="rounded-xl p-4"
        style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
      >
        <div className="flex flex-wrap gap-4">
          {/* Búsqueda */}
          <div className="flex-1 min-w-[200px] relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4"
              style={{ color: theme.textSecondary }}
            />
            <input
              type="text"
              placeholder="Buscar por número, asunto o solicitante..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-lg text-sm"
              style={{
                backgroundColor: theme.backgroundSecondary,
                border: `1px solid ${theme.border}`,
                color: theme.text,
              }}
            />
          </div>

          {/* Filtro servicio */}
          <select
            value={filtroServicio}
            onChange={(e) => setFiltroServicio(e.target.value === 'todos' ? 'todos' : Number(e.target.value))}
            className="px-4 py-2.5 rounded-lg text-sm"
            style={{
              backgroundColor: theme.backgroundSecondary,
              border: `1px solid ${theme.border}`,
              color: theme.text,
            }}
          >
            <option value="todos">Todos los servicios</option>
            {servicios.map(s => (
              <option key={s.id} value={s.id}>{s.nombre}</option>
            ))}
          </select>

          {/* Filtro empleado */}
          <select
            value={filtroEmpleado}
            onChange={(e) => setFiltroEmpleado(e.target.value === 'todos' ? 'todos' : Number(e.target.value))}
            className="px-4 py-2.5 rounded-lg text-sm"
            style={{
              backgroundColor: theme.backgroundSecondary,
              border: `1px solid ${theme.border}`,
              color: theme.text,
            }}
          >
            <option value="todos">Todos los empleados</option>
            {empleados.map(e => (
              <option key={e.id} value={e.id}>{e.nombre} {e.apellido}</option>
            ))}
          </select>

          {/* Toggle sin asignar */}
          <button
            onClick={() => setFiltroSinAsignar(!filtroSinAsignar)}
            className="px-4 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2 transition-all"
            style={{
              backgroundColor: filtroSinAsignar ? '#ef444420' : theme.backgroundSecondary,
              border: `1px solid ${filtroSinAsignar ? '#ef4444' : theme.border}`,
              color: filtroSinAsignar ? '#ef4444' : theme.text,
            }}
          >
            <Filter className="h-4 w-4" />
            Sin asignar
          </button>
        </div>
      </div>

      {/* Vista Kanban */}
      {viewMode === 'kanban' && (
        <>
          {canDrag && (
            <p className="text-sm" style={{ color: theme.textSecondary }}>
              Arrastra las tarjetas entre columnas para cambiar el estado de los trámites.
            </p>
          )}

          <DragDropContext onDragEnd={handleDragEnd}>
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 overflow-x-auto pb-4">
              {columnasKanban.map((col) => (
                <Droppable droppableId={col.id} key={col.id} isDropDisabled={!canDrag}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className="rounded-xl overflow-hidden min-h-[400px] min-w-[280px] transition-all duration-300"
                      style={{
                        backgroundColor: theme.backgroundSecondary,
                        border: snapshot.isDraggingOver
                          ? `2px dashed ${col.color}`
                          : `1px solid ${theme.border}`,
                        boxShadow: snapshot.isDraggingOver
                          ? `0 0 20px ${col.color}30`
                          : '0 4px 12px rgba(0,0,0,0.1)',
                      }}
                    >
                      {/* Header de columna */}
                      <div className={`${col.headerClass} px-4 py-3 flex items-center justify-between`}>
                        <h2 className="font-semibold text-white flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-white/50"></span>
                          {col.titulo}
                        </h2>
                        <span className="bg-white/20 backdrop-blur-sm px-3 py-1 rounded-full text-xs font-bold text-white">
                          {getTramitesPorEstado(col.id).length}
                        </span>
                      </div>

                      {/* Lista de trámites */}
                      <div className="p-3 space-y-3">
                        {getTramitesPorEstado(col.id).map((tramite, index) => (
                          <Draggable
                            key={tramite.id}
                            draggableId={String(tramite.id)}
                            index={index}
                            isDragDisabled={!canDrag}
                          >
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                {...provided.dragHandleProps}
                                onClick={() => !snapshot.isDragging && openTramite(tramite)}
                                className={`${col.cardClass} rounded-lg p-4 cursor-pointer transition-all ${
                                  !snapshot.isDragging ? 'hover:shadow-lg hover:-translate-y-0.5' : ''
                                } ${canDrag ? 'cursor-grab active:cursor-grabbing' : ''}`}
                                style={{
                                  ...provided.draggableProps.style,
                                  boxShadow: snapshot.isDragging
                                    ? `0 20px 40px rgba(0,0,0,0.3), 0 0 30px ${col.color}50`
                                    : '0 2px 8px rgba(0,0,0,0.1)',
                                  opacity: snapshot.isDragging ? 0.95 : 1,
                                  border: `1px solid ${theme.border}`,
                                }}
                              >
                                <div className="flex items-start gap-3">
                                  {/* Handle de drag */}
                                  {canDrag && (
                                    <div
                                      className="mt-1 p-1 rounded"
                                      style={{
                                        background: `linear-gradient(135deg, ${col.color}30, ${col.color}10)`,
                                        color: col.color
                                      }}
                                    >
                                      <GripVertical className="w-4 h-4" />
                                    </div>
                                  )}

                                  <div className="flex-1 min-w-0">
                                    {/* Número de trámite */}
                                    <div className="flex items-center gap-2 mb-1">
                                      <span
                                        className="text-xs font-mono font-bold px-2 py-0.5 rounded"
                                        style={{ backgroundColor: `${col.color}20`, color: col.color }}
                                      >
                                        {tramite.numero_tramite}
                                      </span>
                                      {!tramite.empleado_id && (
                                        <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-600">
                                          Sin asignar
                                        </span>
                                      )}
                                    </div>

                                    {/* Asunto */}
                                    <p
                                      className="font-medium line-clamp-2 text-sm mb-2"
                                      style={{ color: theme.text }}
                                    >
                                      {tramite.asunto}
                                    </p>

                                    {/* Servicio */}
                                    <div className="flex items-center gap-2 mb-2">
                                      <div
                                        className="w-6 h-6 rounded flex items-center justify-center"
                                        style={{ backgroundColor: `${tramite.servicio?.color || '#6b7280'}20` }}
                                      >
                                        <span style={{ color: tramite.servicio?.color || '#6b7280' }} className="scale-75">
                                          {servicioIcons[tramite.servicio?.icono || ''] || servicioIcons.default}
                                        </span>
                                      </div>
                                      <span className="text-xs truncate" style={{ color: theme.textSecondary }}>
                                        {tramite.servicio?.nombre || 'Sin servicio'}
                                      </span>
                                    </div>

                                    {/* Footer: Solicitante y fecha */}
                                    <div
                                      className="flex items-center justify-between pt-2 border-t text-xs"
                                      style={{ borderColor: `${col.color}20`, color: theme.textSecondary }}
                                    >
                                      <span className="truncate max-w-[100px]">
                                        {tramite.nombre_solicitante || 'Anónimo'}
                                      </span>
                                      <span>
                                        {new Date(tramite.created_at).toLocaleDateString('es-AR', {
                                          day: '2-digit',
                                          month: 'short'
                                        })}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}
                          </Draggable>
                        ))}

                        {provided.placeholder}

                        {getTramitesPorEstado(col.id).length === 0 && (
                          <div
                            className="text-center py-12 rounded-lg border-2 border-dashed transition-all"
                            style={{
                              borderColor: `${col.color}40`,
                              color: theme.textSecondary,
                              background: `linear-gradient(135deg, ${col.color}05, ${col.color}10)`,
                            }}
                          >
                            <div
                              className="w-12 h-12 mx-auto mb-3 rounded-full flex items-center justify-center"
                              style={{ background: `linear-gradient(135deg, ${col.color}20, ${col.color}10)` }}
                            >
                              <FileText className="w-6 h-6" style={{ color: col.color }} />
                            </div>
                            <p className="text-sm font-medium">Sin trámites</p>
                            {canDrag && (
                              <p className="text-xs mt-1 opacity-70">Arrastra aquí para mover</p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </Droppable>
              ))}
            </div>
          </DragDropContext>
        </>
      )}

      {/* Vista Tabla */}
      {viewMode === 'tabla' && (
        <div
          className="rounded-xl overflow-hidden"
          style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
        >
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ backgroundColor: theme.backgroundSecondary }}>
                  <th className="text-left px-4 py-3 text-xs font-medium" style={{ color: theme.textSecondary }}>
                    NÚMERO
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium" style={{ color: theme.textSecondary }}>
                    SERVICIO
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium" style={{ color: theme.textSecondary }}>
                    SOLICITANTE
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium" style={{ color: theme.textSecondary }}>
                    ASUNTO
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium" style={{ color: theme.textSecondary }}>
                    EMPLEADO
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium" style={{ color: theme.textSecondary }}>
                    ESTADO
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium" style={{ color: theme.textSecondary }}>
                    FECHA
                  </th>
                  <th className="text-center px-4 py-3 text-xs font-medium" style={{ color: theme.textSecondary }}>
                    ACCIONES
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredTramites.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-12">
                      <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" style={{ color: theme.textSecondary }} />
                      <p style={{ color: theme.textSecondary }}>No hay trámites</p>
                    </td>
                  </tr>
                ) : (
                  filteredTramites.map(tramite => {
                    const config = estadoConfig[tramite.estado];
                    const IconEstado = config.icon;
                    return (
                      <tr
                        key={tramite.id}
                        className="hover:bg-black/5 cursor-pointer transition-colors"
                        onClick={() => openTramite(tramite)}
                        style={{ borderTop: `1px solid ${theme.border}` }}
                      >
                        <td className="px-4 py-3">
                          <span className="font-mono text-sm font-medium" style={{ color: theme.primary }}>
                            {tramite.numero_tramite}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div
                              className="w-7 h-7 rounded flex items-center justify-center"
                              style={{ backgroundColor: `${tramite.servicio?.color || theme.primary}20` }}
                            >
                              <span style={{ color: tramite.servicio?.color || theme.primary }}>
                                {servicioIcons[tramite.servicio?.icono || ''] || servicioIcons.default}
                              </span>
                            </div>
                            <span className="text-sm" style={{ color: theme.text }}>
                              {tramite.servicio?.nombre || 'Sin servicio'}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div>
                            <p className="text-sm font-medium" style={{ color: theme.text }}>
                              {tramite.nombre_solicitante} {tramite.apellido_solicitante}
                            </p>
                            {tramite.dni_solicitante && (
                              <p className="text-xs" style={{ color: theme.textSecondary }}>
                                DNI: {tramite.dni_solicitante}
                              </p>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 max-w-[200px]">
                          <p className="text-sm truncate" style={{ color: theme.text }}>
                            {tramite.asunto}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          {tramite.empleado_asignado ? (
                            <span className="text-sm" style={{ color: theme.text }}>
                              {tramite.empleado_asignado.nombre} {tramite.empleado_asignado.apellido}
                            </span>
                          ) : (
                            <span className="text-xs px-2 py-1 rounded-full" style={{ backgroundColor: '#ef444420', color: '#ef4444' }}>
                              Sin asignar
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium"
                            style={{ backgroundColor: config.bg, color: config.color }}
                          >
                            <IconEstado className="h-3 w-3" />
                            {config.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm" style={{ color: theme.textSecondary }}>
                            {new Date(tramite.created_at).toLocaleDateString('es-AR')}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            className="p-2 rounded-lg hover:bg-black/5 transition-colors"
                            onClick={(e) => {
                              e.stopPropagation();
                              openTramite(tramite);
                            }}
                          >
                            <Eye className="h-4 w-4" style={{ color: theme.primary }} />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Sheet de detalle */}
      <Sheet open={sheetOpen} onClose={closeSheet} title="Detalle del Trámite">
        {selectedTramite && (
          <div className="space-y-6">
            {/* Número y estado */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className="font-mono text-lg font-bold px-3 py-1 rounded"
                  style={{ backgroundColor: theme.backgroundSecondary, color: theme.primary }}
                >
                  {selectedTramite.numero_tramite}
                </span>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(selectedTramite.numero_tramite);
                    toast.success('Número copiado');
                  }}
                  className="p-1.5 rounded hover:bg-black/5"
                >
                  <Copy className="h-4 w-4" style={{ color: theme.textSecondary }} />
                </button>
              </div>
              <span
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium"
                style={{
                  backgroundColor: estadoConfig[selectedTramite.estado].bg,
                  color: estadoConfig[selectedTramite.estado].color
                }}
              >
                {React.createElement(estadoConfig[selectedTramite.estado].icon, { className: 'h-4 w-4' })}
                {estadoConfig[selectedTramite.estado].label}
              </span>
            </div>

            {/* Servicio */}
            <div
              className="p-4 rounded-xl"
              style={{
                backgroundColor: `${selectedTramite.servicio?.color || theme.primary}10`,
                border: `1px solid ${selectedTramite.servicio?.color || theme.primary}30`
              }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: `${selectedTramite.servicio?.color || theme.primary}20` }}
                >
                  <span style={{ color: selectedTramite.servicio?.color || theme.primary }}>
                    {servicioIcons[selectedTramite.servicio?.icono || ''] || servicioIcons.default}
                  </span>
                </div>
                <div>
                  <p className="font-medium" style={{ color: theme.text }}>
                    {selectedTramite.servicio?.nombre || 'Servicio no especificado'}
                  </p>
                  <p className="text-xs" style={{ color: theme.textSecondary }}>
                    Tipo de trámite
                  </p>
                </div>
              </div>
            </div>

            {/* Asunto y descripción */}
            <div>
              <h3 className="text-sm font-medium mb-2" style={{ color: theme.textSecondary }}>
                Asunto
              </h3>
              <p className="font-medium" style={{ color: theme.text }}>
                {selectedTramite.asunto}
              </p>
              {selectedTramite.descripcion && (
                <p className="text-sm mt-2" style={{ color: theme.textSecondary }}>
                  {selectedTramite.descripcion}
                </p>
              )}
            </div>

            {/* Datos del solicitante */}
            <div
              className="p-4 rounded-xl"
              style={{ backgroundColor: theme.backgroundSecondary }}
            >
              <h3 className="text-sm font-medium mb-3" style={{ color: theme.text }}>
                Datos del Solicitante
              </h3>
              <div className="space-y-2">
                {(selectedTramite.nombre_solicitante || selectedTramite.apellido_solicitante) && (
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4" style={{ color: theme.textSecondary }} />
                    <span className="text-sm" style={{ color: theme.text }}>
                      {selectedTramite.nombre_solicitante} {selectedTramite.apellido_solicitante}
                    </span>
                  </div>
                )}
                {selectedTramite.dni_solicitante && (
                  <div className="flex items-center gap-2">
                    <Hash className="h-4 w-4" style={{ color: theme.textSecondary }} />
                    <span className="text-sm" style={{ color: theme.text }}>
                      DNI: {selectedTramite.dni_solicitante}
                    </span>
                  </div>
                )}
                {selectedTramite.email_solicitante && (
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4" style={{ color: theme.textSecondary }} />
                    <a
                      href={`mailto:${selectedTramite.email_solicitante}`}
                      className="text-sm hover:underline"
                      style={{ color: theme.primary }}
                    >
                      {selectedTramite.email_solicitante}
                    </a>
                  </div>
                )}
                {selectedTramite.telefono_solicitante && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4" style={{ color: theme.textSecondary }} />
                    <a
                      href={`tel:${selectedTramite.telefono_solicitante}`}
                      className="text-sm hover:underline"
                      style={{ color: theme.primary }}
                    >
                      {selectedTramite.telefono_solicitante}
                    </a>
                  </div>
                )}
                {selectedTramite.direccion_solicitante && (
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4" style={{ color: theme.textSecondary }} />
                    <span className="text-sm" style={{ color: theme.text }}>
                      {selectedTramite.direccion_solicitante}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Asignación de empleado */}
            <div
              className="p-4 rounded-xl"
              style={{ backgroundColor: theme.backgroundSecondary }}
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium" style={{ color: theme.text }}>
                  Empleado Asignado
                </h3>
                <button
                  onClick={handleSugerirEmpleado}
                  disabled={loadingSugerencia}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium"
                  style={{
                    background: `linear-gradient(135deg, #8b5cf6, #7c3aed)`,
                    color: '#ffffff',
                  }}
                >
                  {loadingSugerencia ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Sparkles className="h-3 w-3" />
                  )}
                  Sugerir con IA
                </button>
              </div>

              {/* Sugerencia de IA */}
              {sugerenciaIA && sugerenciaIA.sugerencia && (
                <div
                  className="mb-3 p-3 rounded-lg"
                  style={{ backgroundColor: '#8b5cf620', border: '1px solid #8b5cf640' }}
                >
                  <div className="flex items-start gap-2">
                    <Sparkles className="h-4 w-4 mt-0.5" style={{ color: '#8b5cf6' }} />
                    <div>
                      <p className="text-sm font-medium" style={{ color: theme.text }}>
                        {sugerenciaIA.sugerencia.nombre}
                      </p>
                      <p className="text-xs" style={{ color: theme.textSecondary }}>
                        {sugerenciaIA.mensaje}
                      </p>
                      <p className="text-xs mt-1" style={{ color: theme.textSecondary }}>
                        Carga: {sugerenciaIA.sugerencia.carga_actual}/{sugerenciaIA.sugerencia.capacidad_maxima} trámites
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <select
                  value={empleadoSeleccionado}
                  onChange={(e) => setEmpleadoSeleccionado(e.target.value ? Number(e.target.value) : '')}
                  className="flex-1 px-3 py-2 rounded-lg text-sm"
                  style={{
                    backgroundColor: theme.card,
                    border: `1px solid ${theme.border}`,
                    color: theme.text,
                  }}
                >
                  <option value="">Seleccionar empleado...</option>
                  {empleados.map(e => (
                    <option key={e.id} value={e.id}>
                      {e.nombre} {e.apellido} {e.especialidad ? `(${e.especialidad})` : ''}
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleAsignarEmpleado}
                  disabled={!empleadoSeleccionado || asignando}
                  className="px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 disabled:opacity-50"
                  style={{
                    background: `linear-gradient(135deg, ${theme.primary}, ${theme.primaryHover})`,
                    color: '#ffffff',
                  }}
                >
                  {asignando ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <UserPlus className="h-4 w-4" />
                  )}
                  Asignar
                </button>
              </div>

              {/* Empleado actual */}
              {selectedTramite.empleado_asignado && (
                <div className="mt-3 flex items-center gap-2">
                  <span className="text-xs" style={{ color: theme.textSecondary }}>
                    Actualmente asignado a:
                  </span>
                  <span className="text-sm font-medium" style={{ color: theme.text }}>
                    {selectedTramite.empleado_asignado.nombre} {selectedTramite.empleado_asignado.apellido}
                  </span>
                </div>
              )}
            </div>

            {/* Fechas */}
            <div className="flex gap-4">
              <div>
                <p className="text-xs" style={{ color: theme.textSecondary }}>Creado</p>
                <p className="text-sm font-medium" style={{ color: theme.text }}>
                  {new Date(selectedTramite.created_at).toLocaleString('es-AR')}
                </p>
              </div>
              {selectedTramite.fecha_resolucion && (
                <div>
                  <p className="text-xs" style={{ color: theme.textSecondary }}>Resuelto</p>
                  <p className="text-sm font-medium" style={{ color: theme.text }}>
                    {new Date(selectedTramite.fecha_resolucion).toLocaleString('es-AR')}
                  </p>
                </div>
              )}
            </div>

            {/* Historial */}
            <div
              className="p-4 rounded-xl"
              style={{ backgroundColor: theme.backgroundSecondary }}
            >
              <button
                onClick={() => showHistorial ? setShowHistorial(false) : loadHistorial()}
                className="w-full flex items-center justify-between"
              >
                <div className="flex items-center gap-2">
                  <History className="h-4 w-4" style={{ color: theme.textSecondary }} />
                  <span className="text-sm font-medium" style={{ color: theme.text }}>
                    Historial de cambios
                  </span>
                </div>
                {loadingHistorial ? (
                  <Loader2 className="h-4 w-4 animate-spin" style={{ color: theme.textSecondary }} />
                ) : showHistorial ? (
                  <ChevronUp className="h-4 w-4" style={{ color: theme.textSecondary }} />
                ) : (
                  <ChevronDown className="h-4 w-4" style={{ color: theme.textSecondary }} />
                )}
              </button>

              {showHistorial && historial.length > 0 && (
                <div className="mt-4 space-y-3">
                  {historial.map(h => (
                    <div
                      key={h.id}
                      className="p-3 rounded-lg"
                      style={{ backgroundColor: theme.card }}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-sm font-medium" style={{ color: theme.text }}>
                            {h.accion}
                          </p>
                          {h.comentario && (
                            <p className="text-xs mt-1" style={{ color: theme.textSecondary }}>
                              {h.comentario}
                            </p>
                          )}
                        </div>
                        <span className="text-xs" style={{ color: theme.textSecondary }}>
                          {new Date(h.created_at).toLocaleString('es-AR')}
                        </span>
                      </div>
                      {h.estado_anterior && h.estado_nuevo && (
                        <div className="flex items-center gap-2 mt-2">
                          <span
                            className="text-xs px-2 py-0.5 rounded"
                            style={{
                              backgroundColor: estadoConfig[h.estado_anterior]?.bg,
                              color: estadoConfig[h.estado_anterior]?.color
                            }}
                          >
                            {estadoConfig[h.estado_anterior]?.label}
                          </span>
                          <span style={{ color: theme.textSecondary }}>→</span>
                          <span
                            className="text-xs px-2 py-0.5 rounded"
                            style={{
                              backgroundColor: estadoConfig[h.estado_nuevo]?.bg,
                              color: estadoConfig[h.estado_nuevo]?.color
                            }}
                          >
                            {estadoConfig[h.estado_nuevo]?.label}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {showHistorial && historial.length === 0 && (
                <p className="text-sm mt-3 text-center" style={{ color: theme.textSecondary }}>
                  No hay historial
                </p>
              )}
            </div>

            {/* Actualizar estado */}
            {estadoTransiciones[selectedTramite.estado].length > 0 && (
              <div
                className="p-4 rounded-xl"
                style={{ backgroundColor: theme.backgroundSecondary }}
              >
                <h3 className="text-sm font-medium mb-3" style={{ color: theme.text }}>
                  Actualizar Estado
                </h3>

                <div className="space-y-4">
                  {/* Selector de nuevo estado */}
                  <div>
                    <label className="text-xs font-medium mb-1 block" style={{ color: theme.textSecondary }}>
                      Nuevo estado
                    </label>
                    <select
                      value={nuevoEstado}
                      onChange={(e) => setNuevoEstado(e.target.value as EstadoTramite)}
                      className="w-full px-3 py-2 rounded-lg text-sm"
                      style={{
                        backgroundColor: theme.card,
                        border: `1px solid ${theme.border}`,
                        color: theme.text,
                      }}
                    >
                      <option value="">Seleccionar estado...</option>
                      {estadoTransiciones[selectedTramite.estado].map(estado => (
                        <option key={estado} value={estado}>
                          {estadoConfig[estado].label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Respuesta */}
                  <div>
                    <label className="text-xs font-medium mb-1 block" style={{ color: theme.textSecondary }}>
                      Respuesta al solicitante
                    </label>
                    <textarea
                      value={respuesta}
                      onChange={(e) => setRespuesta(e.target.value)}
                      placeholder="Escribe una respuesta para el solicitante..."
                      rows={3}
                      className="w-full px-3 py-2 rounded-lg text-sm resize-none"
                      style={{
                        backgroundColor: theme.card,
                        border: `1px solid ${theme.border}`,
                        color: theme.text,
                      }}
                    />
                  </div>

                  {/* Observaciones internas */}
                  <div>
                    <label className="text-xs font-medium mb-1 block" style={{ color: theme.textSecondary }}>
                      Observaciones internas
                    </label>
                    <textarea
                      value={observaciones}
                      onChange={(e) => setObservaciones(e.target.value)}
                      placeholder="Notas internas (no visibles para el solicitante)..."
                      rows={2}
                      className="w-full px-3 py-2 rounded-lg text-sm resize-none"
                      style={{
                        backgroundColor: theme.card,
                        border: `1px solid ${theme.border}`,
                        color: theme.text,
                      }}
                    />
                  </div>

                  {/* Botón guardar */}
                  <button
                    onClick={handleUpdateTramite}
                    disabled={saving || !nuevoEstado}
                    className="w-full py-2.5 rounded-lg font-medium text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                    style={{
                      background: `linear-gradient(135deg, ${theme.primary}, ${theme.primaryHover})`,
                      color: '#ffffff',
                    }}
                  >
                    {saving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    {saving ? 'Guardando...' : 'Actualizar Trámite'}
                  </button>
                </div>
              </div>
            )}

            {/* Respuesta/observaciones existentes */}
            {(selectedTramite.respuesta || selectedTramite.observaciones) && (
              <div
                className="p-4 rounded-xl"
                style={{ backgroundColor: theme.backgroundSecondary }}
              >
                {selectedTramite.respuesta && (
                  <div className="mb-3">
                    <h4 className="text-xs font-medium mb-1" style={{ color: theme.textSecondary }}>
                      Respuesta
                    </h4>
                    <p className="text-sm" style={{ color: theme.text }}>
                      {selectedTramite.respuesta}
                    </p>
                  </div>
                )}
                {selectedTramite.observaciones && (
                  <div>
                    <h4 className="text-xs font-medium mb-1" style={{ color: theme.textSecondary }}>
                      Observaciones
                    </h4>
                    <p className="text-sm" style={{ color: theme.text }}>
                      {selectedTramite.observaciones}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Sheet>
    </div>
  );
}

// Componente StatCard
function StatCard({
  theme,
  icon,
  label,
  value,
  color
}: {
  theme: ReturnType<typeof useTheme>['theme'];
  icon: React.ReactNode;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div
      className="rounded-xl p-4"
      style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
    >
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: `${color}15` }}
        >
          <span style={{ color }}>{icon}</span>
        </div>
        <div>
          <p className="text-2xl font-bold" style={{ color: theme.text }}>
            {value}
          </p>
          <p className="text-xs" style={{ color: theme.textSecondary }}>
            {label}
          </p>
        </div>
      </div>
    </div>
  );
}
