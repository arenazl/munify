/**
 * Planificación semanal — calendario de asignación del personal.
 *
 * Alineada al lenguaje v2 del kit (referencia:
 * design/handoff-v2/references/planificacion-semanal.dc.html): fila de título
 * COMPACTA + frase semántica con los números reales, el pozo de "Sin asignar"
 * arriba, y la grilla EQUIPO × días con carga por persona y leyenda al pie.
 * Estilos propios en styles/planificacion-v2.css (prefijo `plw-`), sobre
 * tokens --pl-*; los `av2-*`/`rs-*` que ya existían se reusan tal cual.
 *
 * EL MOTOR NO SE TOCÓ: los `droppableId` (`empleado-{id}-{fecha}` /
 * `sin-asignar`), los `draggableId` (`{tipo}-{id}`), el update optimista y las
 * llamadas a `planificacionApi` son los mismos de antes. Esto fue un cambio de
 * marco, tarjetas y grilla.
 *
 * QUÉ DEL DISEÑO NO SE PINTÓ, Y POR QUÉ (no se inventa nada):
 *  - CTA "Repartir la semana": no existe endpoint de reparto automático
 *    (`api/planificacion.py` expone semanal/asignar-fecha/desasignar). Un botón
 *    que no reparte nada es peor que no tenerlo.
 *  - Celdas "Sugerido: <especialidad>": no hay motor de sugerencias para esta
 *    pantalla; pintarlas sería inventar una recomendación.
 *  - Link "Ver las N" del pozo: la lista de Reclamos no acepta hoy un filtro
 *    "sin asignar" por querystring, así que no hay destino honesto. En su lugar
 *    el carrusel muestra TODAS las tarjetas (ninguna queda fuera del arrastre).
 *  - "Xh" por tarea/día: sólo aparece cuando hay hora_inicio Y hora_fin reales;
 *    sin horario cargado no se muestra hora alguna.
 *  - La barra de carga mide TAREAS contra `capacidad_maxima` (lo que da el
 *    backend), no horas: no existe capacidad horaria en el modelo.
 */
import { useEffect, useState, useMemo, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import {
  ChevronLeft,
  ChevronRight,
  User,
  Users,
  Loader2,
  Filter,
  X,
  CalendarDays,
  AlertTriangle,
  CheckCircle2,
  HardHat,
  Briefcase,
  Tag,
  Building2,
  Plus,
} from 'lucide-react';
import { planificacionApi, dependenciasApi } from '../lib/api';
import { toast } from 'sonner';
import { SelectOption } from '../components/ui/ModernSelect';
import { FilterBar } from '../components/abmv2/FilterBar';
import { estadoLabel } from '../lib/enums/reclamo';
import '../styles/planificacion-v2.css';

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
  dependencia?: { id: number; nombre: string; color?: string; icono?: string };
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

/** El color del DATO (categoría) viaja por variable CSS, no por estilo suelto:
 *  la hoja de la pantalla decide QUÉ pinta con él (borde, tinte, avatar). */
type EstiloAcento = CSSProperties & { '--plw-acento': string };
const conAcento = (color: string, base?: CSSProperties): EstiloAcento => ({
  ...base,
  '--plw-acento': color,
});

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

const DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/** "3 al 7 de agosto" — y sólo repite el mes cuando la semana lo cruza. */
const formatRangoSemana = (dias: Date[]): string => {
  if (dias.length === 0) return '';
  const desde = dias[0];
  const hasta = dias[dias.length - 1];
  if (desde.getMonth() === hasta.getMonth()) {
    return `${desde.getDate()} al ${hasta.getDate()} de ${MESES[hasta.getMonth()]}`;
  }
  return `${desde.getDate()} de ${MESES[desde.getMonth()]} al ${hasta.getDate()} de ${MESES[hasta.getMonth()]}`;
};

const isToday = (date: Date): boolean => {
  const today = new Date();
  return formatDateKey(date) === formatDateKey(today);
};

/** Minutos de una tarea. SÓLO cuando el dato existe de verdad (inicio y fin);
 *  sin horario cargado devuelve 0 y la pantalla no muestra horas inventadas. */
const minutosTarea = (t: Tarea): number => {
  if (!t.hora_inicio || !t.hora_fin) return 0;
  const [hi, mi] = t.hora_inicio.split(':').map(Number);
  const [hf, mf] = t.hora_fin.split(':').map(Number);
  if ([hi, mi, hf, mf].some((n) => !Number.isFinite(n))) return 0;
  const delta = (hf * 60 + mf) - (hi * 60 + mi);
  return delta > 0 ? delta : 0;
};

const formatHoras = (minutos: number): string => {
  const horas = minutos / 60;
  const texto = Number.isInteger(horas) ? String(horas) : horas.toFixed(1).replace('.', ',');
  return `${texto} h`;
};

const plural = (n: number, singular: string, plural_: string) => (n === 1 ? singular : plural_);

// Paleta de colores fallback cuando un empleado no tiene categoria_principal asignada.
// Mismo set visual que usan los chips del resto de la app.
const FALLBACK_COLORS = [
  '#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6',
  '#8b5cf6', '#ef4444', '#14b8a6', '#f97316', '#06b6d4',
];

const getEmpleadoColor = (empleado: Empleado): string => {
  if (empleado.categoria_principal?.color) return empleado.categoria_principal.color;
  // Fallback determinístico por id — mismo empleado, siempre mismo color
  return FALLBACK_COLORS[empleado.id % FALLBACK_COLORS.length];
};

const iniciales = (empleado: Empleado): string =>
  `${empleado.nombre.charAt(0)}${empleado.apellido?.charAt(0) || ''}`.toUpperCase();

export default function Planificacion() {
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
  const [filtroDependencia, setFiltroDependencia] = useState<number | null>(null);
  const [dependenciasDisponibles, setDependenciasDisponibles] = useState<Array<{ id: number; nombre: string; color?: string; icono?: string }>>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [showWeekend, setShowWeekend] = useState(false);

  // Cargar dependencias del municipio para el filtro
  useEffect(() => {
    dependenciasApi.getMunicipio({ activo: true })
      .then((res) => setDependenciasDisponibles(res.data || []))
      .catch(() => setDependenciasDisponibles([]));
  }, []);

  const weekDates = useMemo(() => getWeekDates(currentWeekStart), [currentWeekStart]);
  // Memoizado: el `slice` suelto devolvía un array nuevo en cada render y
  // hacía recalcular todos los resúmenes que dependen de él.
  const visibleDates = useMemo(
    () => (showWeekend ? weekDates : weekDates.slice(0, 5)), // Lun-Vie o Lun-Dom
    [showWeekend, weekDates],
  );

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
      // Quitar asignación (mover de calendario al pool sin-asignar)
      const tarea = tareas.find(t => t.id === tareaId);
      if (!tarea) return;

      // Optimista: sacar de tareas y agregar a sinAsignar
      setTareas(prev => prev.filter(t => t.id !== tareaId));
      setSinAsignar(prev => [...prev, { ...tarea, empleado_id: undefined, fecha_programada: undefined }]);

      try {
        await planificacionApi.desasignar(tareaId);
        toast.success('Asignación quitada');
      } catch (error: any) {
        console.error('Error desasignando:', error);
        toast.error(error?.response?.data?.detail || 'Error al quitar la asignación');
        fetchData();
      }
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

  // Empleados filtrados
  const empleadosFiltrados = useMemo(() => {
    return empleados.filter(e => {
      // Filtro por empleado específico
      if (filtroEmpleado && e.id !== filtroEmpleado) return false;
      // Filtro por tipo (operario/administrativo)
      if (filtroTipo && e.tipo !== filtroTipo) return false;
      // Filtro por categoría
      if (filtroDependencia && e.dependencia?.id !== filtroDependencia) return false;

      if (filtroCategoria) {
        const tieneCategoria = e.categorias.some(c => c.id === filtroCategoria) ||
                               e.categoria_principal?.id === filtroCategoria;
        if (!tieneCategoria) return false;
      }
      return true;
    });
  }, [empleados, filtroEmpleado, filtroTipo, filtroCategoria, filtroDependencia]);

  /* Índice empleado|fecha → tareas. Antes cada celda barría el array entero de
     tareas (empleados × días × tareas en cada render); acá se arma una sola vez
     por carga y la celda es una lectura de mapa. */
  const tareasPorCelda = useMemo(() => {
    const mapa = new Map<string, Tarea[]>();
    tareas.forEach((t) => {
      if (!t.empleado_id || !t.fecha_programada) return;
      const clave = `${t.empleado_id}|${t.fecha_programada}`;
      const lista = mapa.get(clave);
      if (lista) lista.push(t);
      else mapa.set(clave, [t]);
    });
    return mapa;
  }, [tareas]);

  const tareasDe = (empleadoId: number, fechaKey: string): Tarea[] =>
    tareasPorCelda.get(`${empleadoId}|${fechaKey}`) || [];

  /** Por día: cuántas tareas y cuántas horas hay cargadas (sólo las reales). */
  const resumenPorDia = useMemo(() => {
    const mapa = new Map<string, { tareas: number; minutos: number }>();
    visibleDates.forEach((d) => mapa.set(formatDateKey(d), { tareas: 0, minutos: 0 }));
    empleadosFiltrados.forEach((e) => {
      visibleDates.forEach((d) => {
        const clave = formatDateKey(d);
        const acumulado = mapa.get(clave);
        if (!acumulado) return;
        const lista = tareasPorCelda.get(`${e.id}|${clave}`) || [];
        acumulado.tareas += lista.length;
        lista.forEach((t) => { acumulado.minutos += minutosTarea(t); });
      });
    });
    return mapa;
  }, [visibleDates, empleadosFiltrados, tareasPorCelda]);

  /** Por persona: la carga de la semana visible contra su capacidad. */
  const cargaPorEmpleado = useMemo(() => {
    const mapa = new Map<number, { tareas: number; minutos: number }>();
    empleadosFiltrados.forEach((e) => {
      let total = 0;
      let minutos = 0;
      visibleDates.forEach((d) => {
        const lista = tareasPorCelda.get(`${e.id}|${formatDateKey(d)}`) || [];
        total += lista.length;
        lista.forEach((t) => { minutos += minutosTarea(t); });
      });
      mapa.set(e.id, { tareas: total, minutos });
    });
    return mapa;
  }, [empleadosFiltrados, visibleDates, tareasPorCelda]);

  const totalesSemana = useMemo(() => {
    let programadas = 0;
    let conTareas = 0;
    let libres = 0;
    empleadosFiltrados.forEach((e) => {
      const carga = cargaPorEmpleado.get(e.id)?.tareas ?? 0;
      programadas += carga;
      if (carga > 0) conTareas += 1;
      else libres += 1;
    });
    return { programadas, conTareas, libres };
  }, [empleadosFiltrados, cargaPorEmpleado]);

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
      { value: '', label: 'Empleados', icon: <Users className="w-4 h-4" /> }
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
    { value: '', label: 'Tipos', icon: <Users className="w-4 h-4" /> },
    { value: 'operario', label: 'Operarios', description: 'Personal de campo', icon: <HardHat className="w-4 h-4" />, color: '#3b82f6' },
    { value: 'administrativo', label: 'Administrativos', description: 'Personal de oficina', icon: <Briefcase className="w-4 h-4" />, color: '#8b5cf6' },
  ], []);

  // Opciones para ModernSelect - Dependencias
  const dependenciaOptions: SelectOption[] = useMemo(() => {
    const options: SelectOption[] = [
      { value: '', label: 'Dependencias', icon: <Building2 className="w-4 h-4" /> }
    ];
    dependenciasDisponibles.forEach(dep => {
      options.push({
        value: dep.id.toString(),
        label: dep.nombre,
        icon: <Building2 className="w-4 h-4" />,
        color: dep.color || '#6366f1',
      });
    });
    return options;
  }, [dependenciasDisponibles]);

  // Opciones para ModernSelect - Categorías
  const categoriaOptions: SelectOption[] = useMemo(() => {
    const options: SelectOption[] = [
      { value: '', label: 'Categorías', icon: <Tag className="w-4 h-4" /> }
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

  const hayFiltros = Boolean(filtroEmpleado || filtroTipo || filtroCategoria || filtroDependencia);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--pl-green)' }} />
      </div>
    );
  }

  const claseFila = showWeekend ? 'plw-fila plw-fila--7' : 'plw-fila';

  return (
    <div className="av2-page" data-module="planificacion">
      {/* 1. Fila de título COMPACTA: identidad + semana + controles.
          No lleva cabecera grande — esta pantalla es una mesa de trabajo,
          el espacio vertical se lo queda la grilla. */}
      <header className="plw-head">
        <span className="plw-head-tile" aria-hidden>
          <CalendarDays className="h-4 w-4" />
          <span className="rs-latido" />
        </span>
        <h1 className="plw-head-titulo">Planificación</h1>

        <div className="plw-stepper" role="group" aria-label="Semana">
          <button
            type="button"
            className="plw-stepper-btn plw-stepper-btn--prev"
            onClick={goToPrevWeek}
            aria-label="Semana anterior"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <span className="plw-stepper-rango">
            <CalendarDays className="h-3.5 w-3.5" aria-hidden />
            {formatRangoSemana(visibleDates)}
          </span>
          <button
            type="button"
            className="plw-stepper-btn plw-stepper-btn--next"
            onClick={goToNextWeek}
            aria-label="Semana siguiente"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>

        <button type="button" className="av2-btn-secundario" onClick={goToCurrentWeek}>
          Hoy
        </button>

        <div className="plw-head-der">
          <button
            type="button"
            className={`av2-btn-secundario ${showWeekend ? 'av2-btn-secundario--activo' : ''}`}
            onClick={() => setShowWeekend(!showWeekend)}
            aria-pressed={showWeekend}
          >
            Fin de semana
          </button>
          <button
            type="button"
            className="av2-btn-icono"
            onClick={() => setShowFilters(!showFilters)}
            aria-label="Filtros"
            aria-expanded={showFilters}
          >
            <Filter className="h-4 w-4" />
            {hayFiltros && <span className="plw-filtro-punto" aria-hidden />}
          </button>
        </div>
      </header>

      {/* 2. Frase semántica: el estado de la semana en un renglón, con los
             números REALES de lo que se está mirando. */}
      <p className="plw-frase">
        {sinAsignar.length > 0 ? (
          <span className="plw-frase-alerta">
            {sinAsignar.length} {plural(sinAsignar.length, 'tarea espera', 'tareas esperan')} quién{' '}
            {plural(sinAsignar.length, 'la', 'las')} haga
          </span>
        ) : (
          <span className="plw-frase-ok">Toda la semana está repartida</span>
        )}
        <span className="plw-frase-resto">
          {totalesSemana.programadas === 0
            ? ' · todavía no hay nada programado para esta semana.'
            : ` · ${totalesSemana.programadas} ${plural(totalesSemana.programadas, 'programada', 'programadas')}` +
              ` entre ${totalesSemana.conTareas} ${plural(totalesSemana.conTareas, 'persona', 'personas')} esta semana.`}
        </span>
      </p>

      {/* Filtros: los selects del kit (ModernSelect adentro de la FilterBar). */}
      {showFilters && (
        <div className="plw-filtros">
          <FilterBar
            selects={[
              {
                id: 'empleado',
                label: 'Empleado',
                value: filtroEmpleado === null ? '' : String(filtroEmpleado),
                options: empleadoOptions,
                onChange: (v) => setFiltroEmpleado(v ? parseInt(v, 10) : null),
              },
              {
                id: 'tipo',
                label: 'Tipo',
                value: filtroTipo,
                options: tipoOptions,
                onChange: (v) => setFiltroTipo(v),
              },
              {
                id: 'dependencia',
                label: 'Dependencia',
                value: filtroDependencia === null ? '' : String(filtroDependencia),
                options: dependenciaOptions,
                onChange: (v) => setFiltroDependencia(v ? parseInt(v, 10) : null),
              },
              {
                id: 'categoria',
                label: 'Categoría',
                value: filtroCategoria === null ? '' : String(filtroCategoria),
                options: categoriaOptions,
                onChange: (v) => setFiltroCategoria(v ? parseInt(v, 10) : null),
              },
            ]}
            statusTabs={[]}
            activeStatus=""
            onStatusChange={() => undefined}
          />
          {hayFiltros && (
            <div className="plw-filtros-pie">
              <button
                type="button"
                className="av2-btn-secundario"
                onClick={() => {
                  setFiltroEmpleado(null);
                  setFiltroTipo('');
                  setFiltroCategoria(null);
                  setFiltroDependencia(null);
                }}
              >
                <X className="h-4 w-4" />
                Limpiar filtros
              </button>
            </div>
          )}
        </div>
      )}

      <DragDropContext onDragEnd={handleDragEnd}>
        {/* 3. Sin asignar — va ARRIBA de la grilla: es el trabajo que todavía
               no tiene dueño, y de acá se arrastra hacia abajo. */}
        <section className="av2-panel plw-pool">
          <div className="plw-pool-head">
            <AlertTriangle className="h-4 w-4 plw-pool-icono" aria-hidden />
            <h2 className="av2-panel-titulo">Sin asignar</h2>
            {sinAsignar.length > 0 && (
              <span className="plw-pool-conteo">{sinAsignar.length.toLocaleString('es-AR')}</span>
            )}
            <span className="plw-pool-hint">
              arrastrá una tarjeta a la fila de quien la va a hacer
            </span>
          </div>

          <Droppable droppableId="sin-asignar" direction="horizontal">
            {(provided) => (
              <div
                ref={provided.innerRef}
                {...provided.droppableProps}
                className="plw-carrusel"
              >
                {sinAsignar.map((tarea, index) => {
                  const color = tarea.categoria?.color || 'var(--pl-green)';
                  const sub = [tarea.categoria?.nombre, tarea.direccion]
                    .filter(Boolean)
                    .join(' · ');
                  return (
                    <Draggable
                      key={`${tarea.tipo}-${tarea.id}`}
                      draggableId={`${tarea.tipo}-${tarea.id}`}
                      index={index}
                    >
                      {(dragProvided) => (
                        <div
                          ref={dragProvided.innerRef}
                          {...dragProvided.draggableProps}
                          {...dragProvided.dragHandleProps}
                          className="plw-tarjeta-pool"
                          style={conAcento(color, dragProvided.draggableProps.style)}
                          title={`${tarea.titulo}${sub ? ` — ${sub}` : ''} · ${estadoLabel(tarea.estado)}`}
                        >
                          <span className="plw-tarjeta-titulo">{tarea.titulo}</span>
                          {sub && <span className="plw-tarjeta-sub">{sub}</span>}
                        </div>
                      )}
                    </Draggable>
                  );
                })}
                {provided.placeholder}
                {sinAsignar.length === 0 && (
                  <div className="plw-pool-vacio">
                    <CheckCircle2 className="h-4 w-4" aria-hidden />
                    Todos los reclamos están asignados
                  </div>
                )}
              </div>
            )}
          </Droppable>
        </section>

        {/* 4. Grilla semanal: EQUIPO + un track por día. */}
        <section className="plw-grid-card">
          <div className="plw-grid-scroll">
            {/* Encabezado */}
            <div className={`${claseFila} plw-fila--cab`}>
              <span className="plw-cab-equipo">
                <Users className="h-3.5 w-3.5" aria-hidden />
                Equipo
                <span className="av2-tnum">({empleadosFiltrados.length})</span>
              </span>
              {visibleDates.map((date) => {
                const clave = formatDateKey(date);
                const resumen = resumenPorDia.get(clave) || { tareas: 0, minutos: 0 };
                const hoy = isToday(date);
                return (
                  <div key={clave} className={`plw-cab-dia ${hoy ? 'plw-cab-dia--hoy' : ''}`}>
                    <span className="plw-cab-dia-linea">
                      <span className="plw-cab-dow">{DIAS_CORTOS[date.getDay()]}</span>
                      <span className="plw-cab-num">{date.getDate()}</span>
                      {hoy && <span className="plw-cab-hoy">hoy</span>}
                    </span>
                    <span className="plw-cab-sub">
                      {resumen.tareas} {plural(resumen.tareas, 'tarea', 'tareas')}
                      {resumen.minutos > 0 ? ` · ${formatHoras(resumen.minutos)}` : ''}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Una fila por persona */}
            {empleadosFiltrados.map((empleado) => {
              const empColor = getEmpleadoColor(empleado);
              const especialidad =
                empleado.categoria_principal?.nombre ||
                empleado.especialidad ||
                empleado.categorias.slice(0, 1).map((c) => c.nombre).join(', ') ||
                empleado.zona?.nombre ||
                (empleado.tipo === 'administrativo' ? 'Administrativo' : 'Operativo');
              const carga = cargaPorEmpleado.get(empleado.id) || { tareas: 0, minutos: 0 };
              const capacidad = empleado.capacidad_maxima || 10;
              const pasado = carga.tareas > capacidad;
              const libre = carga.tareas === 0;
              const relleno = Math.min(100, Math.round((carga.tareas / capacidad) * 100));

              return (
                <div key={empleado.id} className={claseFila}>
                  <div
                    className="plw-emp"
                    style={conAcento(empColor)}
                    title={`${empleado.nombre} ${empleado.apellido || ''} · ${especialidad} · ${carga.tareas} de ${capacidad} tareas${empleado.zona ? ` · ${empleado.zona.nombre}` : ''}`}
                  >
                    <span className="plw-emp-avatar" aria-hidden>{iniciales(empleado)}</span>
                    <span className="plw-emp-cuerpo">
                      <span className="plw-emp-nombre">
                        {empleado.nombre} {empleado.apellido || ''}
                      </span>
                      <span className="plw-emp-esp">{especialidad}</span>
                    </span>
                    <span
                      className={`plw-carga ${pasado ? 'plw-carga--pasado' : ''} ${libre ? 'plw-carga--libre' : ''}`}
                    >
                      <span className="plw-carga-barra">
                        <span className="plw-carga-relleno" style={{ width: `${relleno}%` }} />
                      </span>
                      <span className="plw-carga-texto">
                        {libre ? 'libre' : `${carga.tareas}/${capacidad}`}
                      </span>
                    </span>
                  </div>

                  {visibleDates.map((date) => {
                    const fechaKey = formatDateKey(date);
                    const tareasDelDia = tareasDe(empleado.id, fechaKey);
                    const ausencia = tieneAusencia(empleado.id, date);
                    const droppableId = `empleado-${empleado.id}-${fechaKey}`;
                    const hoy = isToday(date);

                    return (
                      <Droppable droppableId={droppableId} key={droppableId}>
                        {(dropProvided, dropSnapshot) => (
                          <div
                            ref={dropProvided.innerRef}
                            {...dropProvided.droppableProps}
                            className={[
                              'plw-celda',
                              hoy ? 'plw-celda--hoy' : '',
                              ausencia && tareasDelDia.length === 0 ? 'plw-celda--ausencia' : '',
                              dropSnapshot.isDraggingOver ? 'plw-celda--sobre' : '',
                            ].filter(Boolean).join(' ')}
                          >
                            {ausencia && (
                              tareasDelDia.length === 0 ? (
                                <span className="plw-celda-ausencia-txt">{ausencia.tipo}</span>
                              ) : (
                                /* Tiene tareas cargadas igual: el aviso baja a chip
                                   para no tapar lo que hay que hacer. */
                                <span className="plw-celda-ausencia-chip" title={ausencia.motivo || ausencia.tipo}>
                                  <AlertTriangle className="h-3 w-3" aria-hidden />
                                  {ausencia.tipo}
                                </span>
                              )
                            )}

                            {tareasDelDia.map((tarea, index) => {
                              const color = tarea.categoria?.color || 'var(--pl-green)';
                              const horas = minutosTarea(tarea);
                              const meta = [
                                tarea.hora_inicio ? tarea.hora_inicio.slice(0, 5) : '',
                                horas > 0 ? formatHoras(horas) : '',
                                tarea.categoria?.nombre || '',
                              ].filter(Boolean).join(' · ');
                              return (
                                <Draggable
                                  key={`${tarea.tipo}-${tarea.id}`}
                                  draggableId={`${tarea.tipo}-${tarea.id}`}
                                  index={index}
                                >
                                  {(dragProvided) => (
                                    <div
                                      ref={dragProvided.innerRef}
                                      {...dragProvided.draggableProps}
                                      {...dragProvided.dragHandleProps}
                                      className="plw-tarjeta"
                                      style={conAcento(color, dragProvided.draggableProps.style)}
                                      title={`${tarea.titulo} · ${estadoLabel(tarea.estado)}${tarea.direccion ? ` · ${tarea.direccion}` : ''}`}
                                    >
                                      <Link
                                        to={`/gestion/reclamos/${tarea.id}`}
                                        className="plw-tarjeta-titulo"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        {tarea.titulo}
                                      </Link>
                                      {meta && <span className="plw-tarjeta-sub">{meta}</span>}
                                    </div>
                                  )}
                                </Draggable>
                              );
                            })}

                            {dropProvided.placeholder}

                            {tareasDelDia.length === 0 && !ausencia && (
                              <span className="plw-celda-vacia" aria-hidden>
                                <Plus className="h-3.5 w-3.5" />
                              </span>
                            )}
                          </div>
                        )}
                      </Droppable>
                    );
                  })}
                </div>
              );
            })}

            {empleadosFiltrados.length === 0 && (
              <div className="plw-grid-vacia">
                No hay personal que coincida con los filtros aplicados.
              </div>
            )}
          </div>

          {/* Pie: quién quedó sin trabajo + qué significa cada color. */}
          <div className="plw-pie">
            {totalesSemana.libres > 0 && (
              <span className="plw-pie-texto">
                {totalesSemana.libres} {plural(totalesSemana.libres, 'persona', 'personas')} sin
                tareas esta semana
              </span>
            )}
            <Link to="/gestion/empleados" className="plw-pie-link">
              Ver todo el equipo
            </Link>
            <div className="plw-leyenda">
              <span className="plw-leyenda-item">
                <span className="plw-leyenda-muestra plw-leyenda-muestra--ok" aria-hidden />
                Dentro de su carga
              </span>
              <span className="plw-leyenda-item">
                <span className="plw-leyenda-muestra plw-leyenda-muestra--pasado" aria-hidden />
                Pasado de su carga
              </span>
              <span className="plw-leyenda-item">
                <span className="plw-leyenda-muestra plw-leyenda-muestra--ausencia" aria-hidden />
                Ausencia
              </span>
            </div>
          </div>
        </section>
      </DragDropContext>
    </div>
  );
}
