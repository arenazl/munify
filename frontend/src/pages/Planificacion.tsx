import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import {
  ChevronLeft,
  ChevronRight,
  User,
  AlertCircle,
  Clock,
  MapPin,
  Wrench,
  Users,
  Loader2,
  Filter,
  X,
  CalendarDays,
  GripVertical,
  AlertTriangle,
  CheckCircle2,
  HardHat,
  Briefcase,
  Tag,
} from 'lucide-react';
import { planificacionApi } from '../lib/api';
import { useTheme } from '../contexts/ThemeContext';
import { toast } from 'sonner';
import { ModernSelect, SelectOption } from '../components/ui/ModernSelect';
import { StickyPageHeader, PageTitleIcon, PageTitle, HeaderSeparator } from '../components/ui/StickyPageHeader';

// Tipos
interface CategoriaMinima {
  id: number;
  nombre: string;
  color: string;
}

interface Empleado {
  id: number;
  nombre: string;
  apellido?: string;
  telefono?: string;
  tipo?: string;  // operario | administrativo
  especialidad?: string;
  activo: boolean;
  capacidad_maxima: number;
  categoria_principal?: CategoriaMinima;
  categorias: CategoriaMinima[];
  zona?: { id: number; nombre: string };
}

interface TareaReclamo {
  tipo: 'reclamo';
  id: number;
  titulo: string;
  direccion?: string;
  estado: string;
  categoria?: { nombre: string; color: string };
  fecha_programada?: string;
  hora_inicio?: string;
  hora_fin?: string;
  empleado_id?: number;
}

type Tarea = TareaReclamo;

interface Ausencia {
  id: number;
  empleado_id: number;
  tipo: string;
  fecha_inicio: string;
  fecha_fin: string;
  motivo?: string;
  aprobado: boolean;
}

// Helpers de fecha
const getWeekDates = (date: Date): Date[] => {
  const week: Date[] = [];
  const start = new Date(date);
  start.setDate(start.getDate() - start.getDay() + 1); // Lunes
  for (let i = 0; i < 7; i++) {
    const day = new Date(start);
    day.setDate(start.getDate() + i);
    week.push(day);
  }
  return week;
};

const formatDateKey = (date: Date): string => {
  return date.toISOString().split('T')[0];
};

const formatDateDisplay = (date: Date): string => {
  return date.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric' });
};

const formatMonthYear = (date: Date): string => {
  return date.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
};

const isToday = (date: Date): boolean => {
  const today = new Date();
  return formatDateKey(date) === formatDateKey(today);
};

const isWeekend = (date: Date): boolean => {
  const day = date.getDay();
  return day === 0 || day === 6;
};

// Helper para contar tareas por empleado/día
const getTareasEmpleadoDia = (
  tareas: Tarea[],
  empleadoId: number,
  fechaKey: string
): Tarea[] => {
  return tareas.filter(t => {
    return t.empleado_id === empleadoId && t.fecha_programada === fechaKey;
  });
};

export default function Planificacion() {
  const { theme } = useTheme();

  const [loading, setLoading] = useState(true);
  const [currentWeekStart, setCurrentWeekStart] = useState(() => {
    const today = new Date();
    today.setDate(today.getDate() - today.getDay() + 1); // Lunes de esta semana
    today.setHours(0, 0, 0, 0);
    return today;
  });

  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [tareas, setTareas] = useState<Tarea[]>([]);
  const [ausencias, setAusencias] = useState<Ausencia[]>([]);
  const [sinAsignar, setSinAsignar] = useState<Tarea[]>([]);

  const [filtroEmpleado, setFiltroEmpleado] = useState<number | null>(null);
  const [filtroTipo, setFiltroTipo] = useState<string>('');
  const [filtroCategoria, setFiltroCategoria] = useState<number | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [showWeekend, setShowWeekend] = useState(false);

  const weekDates = useMemo(() => getWeekDates(currentWeekStart), [currentWeekStart]);
  const visibleDates = showWeekend ? weekDates : weekDates.slice(0, 5); // Lun-Vie o Lun-Dom

  // Cargar datos
  useEffect(() => {
    fetchData();
  }, [currentWeekStart, filtroEmpleado]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const fechaDesde = formatDateKey(weekDates[0]);
      const fechaHasta = formatDateKey(weekDates[6]);

      // Usar el endpoint optimizado que trae todo de una vez
      const response = await planificacionApi.getSemanal(
        fechaDesde,
        fechaHasta,
        filtroEmpleado || undefined
      );

      const data = response.data;

      // Mapear empleados
      setEmpleados(data.empleados || []);

      // Mapear ausencias
      setAusencias((data.ausencias || []).map((a: Record<string, unknown>) => ({
        id: a.id as number,
        empleado_id: a.empleado_id as number,
        tipo: a.tipo as string,
        fecha_inicio: a.fecha_inicio as string,
        fecha_fin: a.fecha_fin as string,
        motivo: a.motivo as string | undefined,
        aprobado: a.aprobado as boolean,
      })));

      // Mapear tareas (reclamos con fecha programada)
      setTareas((data.tareas || []).map((t: Record<string, unknown>) => ({
        tipo: 'reclamo' as const,
        id: t.id as number,
        titulo: t.titulo as string,
        direccion: t.direccion as string | undefined,
        estado: t.estado as string,
        categoria: t.categoria as { nombre: string; color: string } | undefined,
        fecha_programada: t.fecha_programada as string | undefined,
        hora_inicio: t.hora_inicio as string | undefined,
        hora_fin: t.hora_fin as string | undefined,
        empleado_id: t.empleado_id as number | undefined,
      })));

      // Tareas sin asignar
      setSinAsignar((data.sin_asignar || []).map((t: Record<string, unknown>) => ({
        tipo: 'reclamo' as const,
        id: t.id as number,
        titulo: t.titulo as string,
        direccion: t.direccion as string | undefined,
        estado: t.estado as string,
        categoria: t.categoria as { nombre: string; color: string } | undefined,
        fecha_programada: undefined,
        hora_inicio: undefined,
        hora_fin: undefined,
        empleado_id: undefined,
      })));

    } catch (error) {
      console.error('Error cargando datos:', error);
      toast.error('Error al cargar la planificación');
    } finally {
      setLoading(false);
    }
  };

  // Navegación de semanas
  const goToPrevWeek = () => {
    const newStart = new Date(currentWeekStart);
    newStart.setDate(newStart.getDate() - 7);
    setCurrentWeekStart(newStart);
  };

  const goToNextWeek = () => {
    const newStart = new Date(currentWeekStart);
    newStart.setDate(newStart.getDate() + 7);
    setCurrentWeekStart(newStart);
  };

  const goToCurrentWeek = () => {
    const today = new Date();
    today.setDate(today.getDate() - today.getDay() + 1);
    today.setHours(0, 0, 0, 0);
    setCurrentWeekStart(today);
  };

  // Drag & Drop
  const handleDragEnd = async (result: DropResult) => {
    const { source, destination, draggableId } = result;

    if (!destination) return;
    if (source.droppableId === destination.droppableId) return;

    // Parse: draggableId = "reclamo-123"
    const dashIndex = draggableId.indexOf('-');
    if (dashIndex === -1) return;

    const tipoTarea = draggableId.substring(0, dashIndex);
    const tareaId = parseInt(draggableId.substring(dashIndex + 1));

    // Parse destination: "empleado-5-2024-01-15" o "sin-asignar"
    if (destination.droppableId === 'sin-asignar') {
      toast.info('Para quitar la asignación, usa el detalle del reclamo');
      return;
    }

    // Formato: empleado-{id}-{YYYY-MM-DD}
    // Usar regex para extraer empleadoId y fecha
    const match = destination.droppableId.match(/^empleado-(\d+)-(\d{4}-\d{2}-\d{2})$/);
    if (!match) {
      console.error('Invalid droppableId format:', destination.droppableId);
      return;
    }

    const empleadoId = parseInt(match[1]);
    const fechaProgramada = match[2];

    // Actualizar optimistamente
    if (tipoTarea === 'reclamo') {
      // Mover de sinAsignar a tareas si venía de ahí
      const fromSinAsignar = source.droppableId === 'sin-asignar';

      if (fromSinAsignar) {
        // Buscar la tarea en sinAsignar
        const tarea = sinAsignar.find(t => t.id === tareaId);
        if (tarea) {
          setSinAsignar(prev => prev.filter(t => t.id !== tareaId));
          setTareas(prev => [...prev, { ...tarea, empleado_id: empleadoId, fecha_programada: fechaProgramada }]);
        }
      } else {
        // Mover entre celdas del calendario
        setTareas(prev => prev.map(t =>
          t.id === tareaId
            ? { ...t, empleado_id: empleadoId, fecha_programada: fechaProgramada }
            : t
        ));
      }

      try {
        await planificacionApi.asignarFecha(tareaId, empleadoId, fechaProgramada);
        toast.success('Reclamo asignado correctamente');
      } catch (error) {
        console.error('Error asignando reclamo:', error);
        toast.error('Error al asignar el reclamo');
        fetchData(); // Recargar para revertir
      }
    }
  };

  // Verificar si empleado tiene ausencia en una fecha
  const tieneAusencia = (empleadoId: number, fecha: Date): Ausencia | undefined => {
    const fechaStr = formatDateKey(fecha);
    return ausencias.find(a =>
      a.empleado_id === empleadoId &&
      fechaStr >= a.fecha_inicio &&
      fechaStr <= a.fecha_fin
    );
  };

  // Calcular carga del empleado por día (colores)
  const getCargaColor = (cantidad: number): string => {
    if (cantidad === 0) return 'transparent';
    if (cantidad <= 2) return '#22c55e20'; // verde claro
    if (cantidad <= 4) return '#f59e0b20'; // amarillo claro
    return '#ef444420'; // rojo claro
  };

  // Empleados filtrados
  const empleadosFiltrados = useMemo(() => {
    return empleados.filter(e => {
      // Filtro por empleado específico
      if (filtroEmpleado && e.id !== filtroEmpleado) return false;
      // Filtro por tipo (operario/administrativo)
      if (filtroTipo && e.tipo !== filtroTipo) return false;
      // Filtro por categoría
      if (filtroCategoria) {
        const tieneCategoria = e.categorias.some(c => c.id === filtroCategoria) ||
                               e.categoria_principal?.id === filtroCategoria;
        if (!tieneCategoria) return false;
      }
      return true;
    });
  }, [empleados, filtroEmpleado, filtroTipo, filtroCategoria]);

  // Obtener lista única de categorías para el filtro
  const categoriasUnicas = useMemo(() => {
    const map = new Map<number, CategoriaMinima>();
    empleados.forEach(e => {
      if (e.categoria_principal) {
        map.set(e.categoria_principal.id, e.categoria_principal);
      }
      e.categorias.forEach(c => map.set(c.id, c));
    });
    return Array.from(map.values()).sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [empleados]);

  // Opciones para ModernSelect - Empleados
  const empleadoOptions: SelectOption[] = useMemo(() => {
    const options: SelectOption[] = [
      { value: '', label: 'Todos los empleados', icon: <Users className="w-4 h-4" /> }
    ];
    empleados.forEach(e => {
      const zonaText = e.zona ? ` • ${e.zona.nombre}` : '';
      const especText = e.especialidad || e.categorias.map(c => c.nombre).slice(0, 2).join(', ');
      options.push({
        value: e.id.toString(),
        label: `${e.nombre} ${e.apellido || ''}`.trim(),
        description: `${e.tipo === 'administrativo' ? 'Admin' : 'Operario'}${zonaText}${especText ? ` • ${especText}` : ''}`,
        icon: <User className="w-4 h-4" />,
        color: e.categoria_principal?.color,
      });
    });
    return options;
  }, [empleados]);

  // Opciones para ModernSelect - Tipo
  const tipoOptions: SelectOption[] = useMemo(() => [
    { value: '', label: 'Todos los tipos', icon: <Users className="w-4 h-4" /> },
    { value: 'operario', label: 'Operarios', description: 'Personal de campo', icon: <HardHat className="w-4 h-4" />, color: '#3b82f6' },
    { value: 'administrativo', label: 'Administrativos', description: 'Personal de oficina', icon: <Briefcase className="w-4 h-4" />, color: '#8b5cf6' },
  ], []);

  // Opciones para ModernSelect - Categorías
  const categoriaOptions: SelectOption[] = useMemo(() => {
    const options: SelectOption[] = [
      { value: '', label: 'Todas las categorías', icon: <Tag className="w-4 h-4" /> }
    ];
    categoriasUnicas.forEach(cat => {
      options.push({
        value: cat.id.toString(),
        label: cat.nombre,
        icon: <Tag className="w-4 h-4" />,
        color: cat.color,
      });
    });
    return options;
  }, [categoriasUnicas]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: theme.primary }} />
      </div>
    );
  }

  // Panel de filtros expandible
  const filterPanel = showFilters ? (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Filtro por empleado */}
        <ModernSelect
          value={filtroEmpleado?.toString() || ''}
          onChange={(value) => setFiltroEmpleado(value ? parseInt(value) : null)}
          options={empleadoOptions}
          placeholder="Todos los empleados"
          label="Empleado"
          searchable={true}
        />

        {/* Filtro por tipo */}
        <ModernSelect
          value={filtroTipo}
          onChange={(value) => setFiltroTipo(value)}
          options={tipoOptions}
          placeholder="Todos los tipos"
          label="Tipo"
        />

        {/* Filtro por categoría */}
        <ModernSelect
          value={filtroCategoria?.toString() || ''}
          onChange={(value) => setFiltroCategoria(value ? parseInt(value) : null)}
          options={categoriaOptions}
          placeholder="Todas las categorías"
          label="Categoría / Skill"
          searchable={true}
        />
      </div>

      {/* Botón limpiar filtros */}
      {(filtroEmpleado || filtroTipo || filtroCategoria) && (
        <div className="flex justify-end">
          <button
            onClick={() => {
              setFiltroEmpleado(null);
              setFiltroTipo('');
              setFiltroCategoria(null);
            }}
            className="px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2 transition-all hover:opacity-80"
            style={{ backgroundColor: `${theme.primary}15`, color: theme.primary }}
          >
            <X className="w-4 h-4" />
            Limpiar filtros
          </button>
        </div>
      )}
    </div>
  ) : null;

  return (
    <div className="space-y-4">
      {/* Header Sticky con componente reutilizable */}
      <StickyPageHeader filterPanel={filterPanel}>
        <PageTitleIcon icon={<CalendarDays className="h-4 w-4" />} />
        <PageTitle>Planificación</PageTitle>

        {/* Subtítulo con mes/año */}
        <span className="text-sm hidden sm:block" style={{ color: theme.textSecondary }}>
          {formatMonthYear(currentWeekStart)}
        </span>

        <HeaderSeparator />

        {/* Controles de navegación */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={goToPrevWeek}
            className="p-2 rounded-lg hover:opacity-80 transition-opacity"
            style={{ backgroundColor: theme.backgroundSecondary, color: theme.text }}
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={goToCurrentWeek}
            className="px-3 py-2 rounded-lg text-sm font-medium hover:opacity-80 transition-opacity"
            style={{ backgroundColor: theme.primary, color: '#fff' }}
          >
            Hoy
          </button>
          <button
            type="button"
            onClick={goToNextWeek}
            className="p-2 rounded-lg hover:opacity-80 transition-opacity"
            style={{ backgroundColor: theme.backgroundSecondary, color: theme.text }}
          >
            <ChevronRight className="w-5 h-5" />
          </button>

          {/* Toggle fin de semana */}
          <button
            onClick={() => setShowWeekend(!showWeekend)}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${showWeekend ? 'opacity-100' : 'opacity-60'}`}
            style={{
              backgroundColor: showWeekend ? `${theme.primary}20` : theme.backgroundSecondary,
              color: showWeekend ? theme.primary : theme.textSecondary,
            }}
          >
            Fin de semana
          </button>

          {/* Filtros */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="p-2 rounded-lg transition-opacity relative"
            style={{
              backgroundColor: (filtroEmpleado || filtroTipo || filtroCategoria) ? theme.primary : theme.backgroundSecondary,
              color: (filtroEmpleado || filtroTipo || filtroCategoria) ? '#fff' : theme.textSecondary,
            }}
          >
            <Filter className="w-5 h-5" />
            {(filtroEmpleado || filtroTipo || filtroCategoria) && (
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full" />
            )}
          </button>
        </div>
      </StickyPageHeader>

      {/* Calendario */}
      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="overflow-x-auto">
          <div
            className="min-w-[800px] rounded-xl overflow-hidden"
            style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
          >
            {/* Header de días */}
            <div
              className="grid gap-px"
              style={{
                gridTemplateColumns: `240px repeat(${visibleDates.length}, 1fr)`,
                backgroundColor: theme.border,
              }}
            >
              <div
                className="p-3 font-semibold"
                style={{ backgroundColor: theme.backgroundSecondary, color: theme.text }}
              >
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  <span>Empleados</span>
                  <span className="text-xs font-normal ml-auto" style={{ color: theme.textSecondary }}>
                    ({empleadosFiltrados.length})
                  </span>
                </div>
              </div>
              {visibleDates.map(date => (
                <div
                  key={formatDateKey(date)}
                  className={`p-3 text-center font-medium ${isToday(date) ? 'ring-2 ring-inset ring-blue-500' : ''}`}
                  style={{
                    backgroundColor: isToday(date) ? `${theme.primary}10` : theme.backgroundSecondary,
                    color: isWeekend(date) ? theme.textSecondary : theme.text,
                  }}
                >
                  <div className="text-sm uppercase">{formatDateDisplay(date)}</div>
                  <div className="text-xs mt-0.5" style={{ color: theme.textSecondary }}>
                    {date.getDate()}
                  </div>
                </div>
              ))}
            </div>

            {/* Filas de empleados */}
            {empleadosFiltrados.map(empleado => (
              <div
                key={empleado.id}
                className="grid gap-px"
                style={{
                  gridTemplateColumns: `240px repeat(${visibleDates.length}, 1fr)`,
                  backgroundColor: theme.border,
                }}
              >
                {/* Info empleado - expandida */}
                <div
                  className="p-2 flex flex-col gap-1"
                  style={{ backgroundColor: theme.card }}
                >
                  {/* Fila 1: Avatar + Nombre */}
                  <div className="flex items-center gap-2">
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
                      style={{
                        backgroundColor: empleado.categoria_principal?.color || theme.primary
                      }}
                    >
                      {empleado.nombre.charAt(0)}{empleado.apellido?.charAt(0) || ''}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-sm truncate" style={{ color: theme.text }}>
                        {empleado.nombre} {empleado.apellido || ''}
                      </div>
                      <div className="text-[10px] flex items-center gap-1" style={{ color: theme.textSecondary }}>
                        <span
                          className="px-1.5 py-0.5 rounded text-white"
                          style={{
                            backgroundColor: empleado.tipo === 'administrativo' ? '#8b5cf6' : '#3b82f6',
                            fontSize: '9px',
                          }}
                        >
                          {empleado.tipo === 'administrativo' ? 'ADMIN' : 'OPER'}
                        </span>
                        {empleado.zona && (
                          <span className="truncate">{empleado.zona.nombre}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Fila 2: Especialidad o Categorías */}
                  {(empleado.especialidad || empleado.categorias.length > 0) && (
                    <div className="flex flex-wrap gap-1 mt-0.5">
                      {empleado.especialidad ? (
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded-full truncate max-w-full"
                          style={{
                            backgroundColor: `${theme.primary}15`,
                            color: theme.primary,
                            border: `1px solid ${theme.primary}30`,
                          }}
                        >
                          {empleado.especialidad}
                        </span>
                      ) : (
                        empleado.categorias.slice(0, 3).map(cat => (
                          <span
                            key={cat.id}
                            className="text-[9px] px-1 py-0.5 rounded"
                            style={{
                              backgroundColor: `${cat.color}20`,
                              color: cat.color,
                            }}
                            title={cat.nombre}
                          >
                            {cat.nombre.slice(0, 8)}
                          </span>
                        ))
                      )}
                      {empleado.categorias.length > 3 && !empleado.especialidad && (
                        <span
                          className="text-[9px] px-1 py-0.5 rounded"
                          style={{ backgroundColor: theme.backgroundSecondary, color: theme.textSecondary }}
                        >
                          +{empleado.categorias.length - 3}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Fila 3: Teléfono (si existe) */}
                  {empleado.telefono && (
                    <div className="text-[10px] truncate" style={{ color: theme.textSecondary }}>
                      {empleado.telefono}
                    </div>
                  )}
                </div>

                {/* Celdas por día */}
                {visibleDates.map(date => {
                  const fechaKey = formatDateKey(date);
                  const tareasDelDia = getTareasEmpleadoDia(tareas, empleado.id, fechaKey);
                  const ausencia = tieneAusencia(empleado.id, date);
                  const droppableId = `empleado-${empleado.id}-${fechaKey}`;

                  return (
                    <Droppable droppableId={droppableId} key={droppableId}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.droppableProps}
                          className={`p-2 min-h-[100px] transition-colors ${snapshot.isDraggingOver ? 'ring-2 ring-inset ring-blue-500' : ''}`}
                          style={{
                            backgroundColor: ausencia
                              ? '#fef2f2'
                              : getCargaColor(tareasDelDia.length),
                          }}
                        >
                          {/* Indicador de ausencia */}
                          {ausencia && (
                            <div
                              className="text-xs px-2 py-1 rounded mb-2 flex items-center gap-1"
                              style={{ backgroundColor: '#fee2e2', color: '#dc2626' }}
                            >
                              <AlertTriangle className="w-3 h-3" />
                              {ausencia.tipo}
                            </div>
                          )}

                          {/* Tareas */}
                          {tareasDelDia.map((tarea, index) => (
                            <Draggable
                              key={`${tarea.tipo}-${tarea.id}`}
                              draggableId={`${tarea.tipo}-${tarea.id}`}
                              index={index}
                            >
                              {(provided, snapshot) => (
                                <div
                                  ref={provided.innerRef}
                                  {...provided.draggableProps}
                                  className={`mb-2 p-2 rounded-lg text-xs ${snapshot.isDragging ? 'shadow-lg ring-2 ring-blue-500' : ''}`}
                                  style={{
                                    ...provided.draggableProps.style,
                                    backgroundColor: tarea.tipo === 'reclamo'
                                      ? (tarea.categoria?.color || theme.primary) + '20'
                                      : `${theme.primary}20`,
                                    border: `1px solid ${tarea.tipo === 'reclamo'
                                      ? (tarea.categoria?.color || theme.primary) + '40'
                                      : theme.primary + '40'}`,
                                  }}
                                >
                                  <div className="flex items-start gap-1">
                                    <div {...provided.dragHandleProps} className="cursor-grab active:cursor-grabbing">
                                      <GripVertical className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: theme.textSecondary }} />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center gap-1 mb-0.5">
                                        <Wrench className="w-3 h-3" style={{ color: tarea.categoria?.color || theme.primary }} />
                                        <Link
                                          to={`/gestion/reclamos/${tarea.id}`}
                                          className="font-medium truncate hover:underline"
                                          style={{ color: theme.text }}
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          {tarea.titulo.slice(0, 25)}...
                                        </Link>
                                      </div>
                                      {tarea.hora_inicio && (
                                        <div className="flex items-center gap-1" style={{ color: theme.textSecondary }}>
                                          <Clock className="w-3 h-3" />
                                          {tarea.hora_inicio.slice(0, 5)}
                                          {tarea.hora_fin && ` - ${tarea.hora_fin.slice(0, 5)}`}
                                        </div>
                                      )}
                                      {tarea.direccion && (
                                        <div className="flex items-center gap-1 mt-0.5" style={{ color: theme.textSecondary }}>
                                          <MapPin className="w-3 h-3" />
                                          <span className="truncate">{tarea.direccion.slice(0, 20)}</span>
                                        </div>
                                      )}
                                      {/* Estado badge */}
                                      <div className="mt-1">
                                        <span
                                          className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                                          style={{
                                            backgroundColor: tarea.estado === 'resuelto' ? '#22c55e20' :
                                              tarea.estado === 'en_curso' ? '#f59e0b20' : '#3b82f620',
                                            color: tarea.estado === 'resuelto' ? '#22c55e' :
                                              tarea.estado === 'en_curso' ? '#f59e0b' : '#3b82f6',
                                          }}
                                        >
                                          {tarea.estado.replace('_', ' ')}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </Draggable>
                          ))}

                          {provided.placeholder}

                          {/* Placeholder cuando está vacío */}
                          {tareasDelDia.length === 0 && !ausencia && (
                            <div
                              className="h-full min-h-[60px] flex items-center justify-center border-2 border-dashed rounded-lg"
                              style={{ borderColor: `${theme.border}` }}
                            >
                              <span className="text-xs" style={{ color: theme.textSecondary }}>
                                Sin tareas
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </Droppable>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Pool de tareas sin asignar */}
        <div
          className="p-4 rounded-xl"
          style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
        >
          <div className="flex items-center gap-2 mb-4">
            <AlertCircle className="w-5 h-5" style={{ color: '#ef4444' }} />
            <h2 className="font-semibold" style={{ color: theme.text }}>
              Sin Asignar ({sinAsignar.length})
            </h2>
          </div>

          <Droppable droppableId="sin-asignar" direction="horizontal">
            {(provided) => (
              <div
                ref={provided.innerRef}
                {...provided.droppableProps}
                className="flex flex-wrap gap-2 min-h-[60px]"
              >
                {sinAsignar.map((tarea, index) => (
                  <Draggable
                    key={`${tarea.tipo}-${tarea.id}`}
                    draggableId={`${tarea.tipo}-${tarea.id}`}
                    index={index}
                  >
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        className={`p-3 rounded-lg max-w-[200px] ${snapshot.isDragging ? 'shadow-lg ring-2 ring-blue-500' : ''}`}
                        style={{
                          ...provided.draggableProps.style,
                          backgroundColor: '#fef2f2',
                          border: '1px solid #fecaca',
                        }}
                      >
                        <div className="flex items-start gap-2">
                          <div {...provided.dragHandleProps} className="cursor-grab active:cursor-grabbing">
                            <GripVertical className="w-4 h-4 text-gray-400 flex-shrink-0" />
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium text-sm truncate" style={{ color: theme.text }}>
                              {tarea.titulo}
                            </div>
                            <div className="text-xs truncate mt-0.5" style={{ color: theme.textSecondary }}>
                              {tarea.categoria?.nombre}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
                {sinAsignar.length === 0 && (
                  <div className="flex items-center gap-2 text-sm" style={{ color: theme.textSecondary }}>
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                    Todos los reclamos están asignados
                  </div>
                )}
              </div>
            )}
          </Droppable>
        </div>
      </DragDropContext>

      {/* Leyenda */}
      <div
        className="p-4 rounded-xl flex flex-wrap items-center gap-6"
        style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
      >
        <span className="text-sm font-medium" style={{ color: theme.text }}>Carga:</span>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded" style={{ backgroundColor: '#22c55e20', border: '1px solid #22c55e40' }} />
          <span className="text-xs" style={{ color: theme.textSecondary }}>Baja (1-2)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded" style={{ backgroundColor: '#f59e0b20', border: '1px solid #f59e0b40' }} />
          <span className="text-xs" style={{ color: theme.textSecondary }}>Media (3-4)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded" style={{ backgroundColor: '#ef444420', border: '1px solid #ef444440' }} />
          <span className="text-xs" style={{ color: theme.textSecondary }}>Alta (5+)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded" style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca' }} />
          <span className="text-xs" style={{ color: theme.textSecondary }}>Ausencia</span>
        </div>
      </div>
    </div>
  );
}
