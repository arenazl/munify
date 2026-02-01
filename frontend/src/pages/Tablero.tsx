import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { Search, GripVertical, Columns3, Calendar, X, Filter } from 'lucide-react';
import { reclamosApi } from '../lib/api';
import { Reclamo, EstadoReclamo } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { toast } from 'sonner';
import { StickyPageHeader, PageTitleIcon, PageTitle, HeaderSeparator } from '../components/ui/StickyPageHeader';

interface Columna {
  id: EstadoReclamo;
  titulo: string;
  color: string;
  headerClass: string;
  cardClass: string;
  badgeClass: string;
}

const columnas: Columna[] = [
  {
    id: 'nuevo',
    titulo: 'Nuevos',
    color: '#ef4444',
    headerClass: 'column-header-red',
    cardClass: 'card-gradient-red',
    badgeClass: 'badge-gradient-red',
  },
  {
    id: 'asignado',
    titulo: 'Asignados',
    color: '#3b82f6',
    headerClass: 'column-header-blue',
    cardClass: 'card-gradient-blue',
    badgeClass: 'badge-gradient-blue',
  },
  {
    id: 'en_proceso',
    titulo: 'En Proceso',
    color: '#f59e0b',
    headerClass: 'column-header-orange',
    cardClass: 'card-gradient-orange',
    badgeClass: 'badge-gradient-orange',
  },
  {
    id: 'pendiente_confirmacion',
    titulo: 'Pend. Confirmación',
    color: '#8b5cf6',
    headerClass: 'column-header-purple',
    cardClass: 'card-gradient-purple',
    badgeClass: 'badge-gradient-purple',
  },
  {
    id: 'resuelto',
    titulo: 'Resueltos',
    color: '#22c55e',
    headerClass: 'column-header-green',
    cardClass: 'card-gradient-green',
    badgeClass: 'badge-gradient-green',
  },
];

// Función helper para obtener fecha en formato YYYY-MM-DD
const getDateString = (date: Date) => {
  return date.toISOString().split('T')[0];
};

// Función para obtener fecha de hace N días
const getDaysAgoDate = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return getDateString(date);
};

export default function Tablero() {
  const [reclamos, setReclamos] = useState<Reclamo[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [fechaDesde, setFechaDesde] = useState(() => getDaysAgoDate(2));
  const [fechaHasta, setFechaHasta] = useState(() => getDateString(new Date()));
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [activeColumnIndex, setActiveColumnIndex] = useState(0);
  const { user } = useAuth();
  const { theme } = useTheme();

  useEffect(() => {
    fetchReclamos();
  }, []);

  const fetchReclamos = async () => {
    try {
      const response = await reclamosApi.getAll();
      setReclamos(response.data);
    } catch (error) {
      console.error('Error cargando reclamos:', error);
      toast.error('Error al cargar reclamos');
    } finally {
      setLoading(false);
    }
  };

  const handleDragEnd = async (result: DropResult) => {
    const { source, destination, draggableId } = result;

    if (!destination) return;
    if (source.droppableId === destination.droppableId) return;

    const reclamoId = parseInt(draggableId);
    const nuevoEstado = destination.droppableId as EstadoReclamo;
    const estadoAnterior = source.droppableId as EstadoReclamo;

    // Actualizar estado local optimistamente
    setReclamos(prev =>
      prev.map(r =>
        r.id === reclamoId ? { ...r, estado: nuevoEstado } : r
      )
    );

    try {
      await reclamosApi.cambiarEstado(reclamoId, nuevoEstado);
      toast.success(`Reclamo movido a "${columnas.find(c => c.id === nuevoEstado)?.titulo}"`);
    } catch (error) {
      // Revertir en caso de error
      setReclamos(prev =>
        prev.map(r =>
          r.id === reclamoId ? { ...r, estado: estadoAnterior } : r
        )
      );
      console.error('Error al cambiar estado:', error);
      toast.error('Error al cambiar el estado del reclamo');
    }
  };

  const getReclamosPorEstado = (estado: EstadoReclamo) => {
    return reclamos
      .filter(r => r.estado === estado)
      .filter(r => {
        // Filtro por fecha
        const fechaReclamo = new Date(r.created_at).toISOString().split('T')[0];
        if (fechaDesde && fechaReclamo < fechaDesde) return false;
        if (fechaHasta && fechaReclamo > fechaHasta) return false;
        return true;
      })
      .filter(r => {
        if (searchTerm === '') return true;
        const term = searchTerm.toLowerCase();
        const dependenciaNombre = r.dependencia_asignada
          ? r.dependencia_asignada.nombre?.toLowerCase() || ''
          : '';
        return (
          r.titulo.toLowerCase().includes(term) ||
          r.direccion?.toLowerCase().includes(term) ||
          r.categoria?.nombre?.toLowerCase().includes(term) ||
          dependenciaNombre.includes(term)
        );
      });
  };

  const limpiarFiltrosFecha = () => {
    setFechaDesde('');
    setFechaHasta('');
  };

  const canDrag = user?.rol === 'admin' || user?.rol === 'supervisor';

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2" style={{ borderColor: theme.primary }}></div>
      </div>
    );
  }

  // Componente de filtros de columnas para mobile (va en filterPanel)
  const mobileColumnFilters = (
    <>
      {/* Filtros de fecha expandibles en mobile */}
      {showMobileFilters && (
        <div className="flex items-center gap-2 mb-2">
          <Calendar className="w-4 h-4 flex-shrink-0" style={{ color: theme.textSecondary }} />
          <input
            type="date"
            value={fechaDesde}
            onChange={(e) => setFechaDesde(e.target.value)}
            className="flex-1 px-2 py-1.5 rounded-lg text-sm min-w-0"
            style={{
              backgroundColor: theme.backgroundSecondary,
              border: `1px solid ${theme.border}`,
              color: theme.text,
            }}
          />
          <span className="text-xs" style={{ color: theme.textSecondary }}>-</span>
          <input
            type="date"
            value={fechaHasta}
            onChange={(e) => setFechaHasta(e.target.value)}
            className="flex-1 px-2 py-1.5 rounded-lg text-sm min-w-0"
            style={{
              backgroundColor: theme.backgroundSecondary,
              border: `1px solid ${theme.border}`,
              color: theme.text,
            }}
          />
          {(fechaDesde || fechaHasta) && (
            <button
              onClick={limpiarFiltrosFecha}
              className="p-1.5 rounded-lg flex-shrink-0"
              style={{ backgroundColor: `${theme.primary}20`, color: theme.primary }}
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {/* Tabs/Pills para navegar entre columnas - Mobile (5 botones que entran en pantalla) */}
      <div className="grid grid-cols-5 gap-1 md:hidden">
        {columnas.map((col, index) => {
          const count = getReclamosPorEstado(col.id).length;
          const isActive = activeColumnIndex === index;
          // Títulos cortos para mobile
          const tituloCorto = col.id === 'nuevo' ? 'Nuevos' :
                              col.id === 'asignado' ? 'Asig.' :
                              col.id === 'en_proceso' ? 'Proceso' :
                              col.id === 'pendiente_confirmacion' ? 'Conf.' : 'Resuel.';
          return (
            <button
              key={col.id}
              onClick={() => setActiveColumnIndex(index)}
              className="flex flex-col items-center py-2 px-1 rounded-lg text-xs font-medium transition-all"
              style={{
                backgroundColor: isActive ? col.color : theme.card,
                color: isActive ? '#fff' : theme.textSecondary,
                border: `1px solid ${isActive ? col.color : theme.border}`,
                boxShadow: isActive ? `0 2px 8px ${col.color}40` : 'none',
              }}
            >
              <span className="font-bold text-sm">{count}</span>
              <span className="text-[10px] opacity-80">{tituloCorto}</span>
            </button>
          );
        })}
      </div>

      {/* Instrucciones de drag & drop - solo desktop */}
      {canDrag && (
        <p className="text-sm mt-2 px-1 hidden md:block" style={{ color: theme.textSecondary }}>
          Arrastra las tarjetas entre columnas para cambiar el estado de los reclamos.
        </p>
      )}
    </>
  );

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header Sticky con componente reutilizable */}
      <StickyPageHeader filterPanel={mobileColumnFilters}>
        <PageTitleIcon icon={<Columns3 className="h-4 w-4" />} />
        <PageTitle>Tablero</PageTitle>
        <HeaderSeparator />

        {/* Filtros de fecha - Desktop */}
        <div className="hidden md:flex items-center gap-2 flex-shrink-0">
          <Calendar className="w-4 h-4" style={{ color: theme.textSecondary }} />
          <input
            type="date"
            value={fechaDesde}
            onChange={(e) => setFechaDesde(e.target.value)}
            className="px-2 py-1.5 rounded-lg text-sm w-[130px]"
            style={{
              backgroundColor: theme.backgroundSecondary,
              border: `1px solid ${theme.border}`,
              color: theme.text,
            }}
            title="Desde"
          />
          <span className="text-xs" style={{ color: theme.textSecondary }}>-</span>
          <input
            type="date"
            value={fechaHasta}
            onChange={(e) => setFechaHasta(e.target.value)}
            className="px-2 py-1.5 rounded-lg text-sm w-[130px]"
            style={{
              backgroundColor: theme.backgroundSecondary,
              border: `1px solid ${theme.border}`,
              color: theme.text,
            }}
            title="Hasta"
          />
          {(fechaDesde || fechaHasta) && (
            <button
              onClick={limpiarFiltrosFecha}
              className="p-1.5 rounded-lg hover:opacity-80 transition-opacity"
              style={{ backgroundColor: `${theme.primary}20`, color: theme.primary }}
              title="Limpiar filtros de fecha"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <HeaderSeparator />

        {/* Buscador - Desktop */}
        <div className="hidden md:block relative flex-1 min-w-[150px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: theme.textSecondary }} />
          <input
            type="text"
            placeholder="Buscar..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-lg text-sm"
            style={{
              backgroundColor: theme.backgroundSecondary,
              border: `1px solid ${theme.border}`,
              color: theme.text,
            }}
          />
        </div>

        {/* Mobile: Buscador compacto y botón de filtros */}
        <div className="flex md:hidden items-center gap-2 flex-1">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: theme.textSecondary }} />
            <input
              type="text"
              placeholder="Buscar..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 rounded-lg text-sm"
              style={{
                backgroundColor: theme.backgroundSecondary,
                border: `1px solid ${theme.border}`,
                color: theme.text,
              }}
            />
          </div>

          {/* Botón de filtros */}
          <button
            onClick={() => setShowMobileFilters(!showMobileFilters)}
            className="p-2 rounded-lg flex-shrink-0 transition-all"
            style={{
              backgroundColor: (fechaDesde || fechaHasta) ? theme.primary : theme.backgroundSecondary,
              color: (fechaDesde || fechaHasta) ? '#fff' : theme.textSecondary,
              border: `1px solid ${(fechaDesde || fechaHasta) ? theme.primary : theme.border}`,
            }}
          >
            <Filter className="w-4 h-4" />
          </button>
        </div>
      </StickyPageHeader>

      {/* Tablero Kanban */}
      <DragDropContext onDragEnd={handleDragEnd}>
        {/* En móvil: solo columna activa. En desktop: grid de 5 columnas */}
        <div className="md:grid md:grid-cols-2 lg:grid-cols-5 gap-2 md:gap-3 lg:gap-4">
          {columnas.map((col, colIndex) => (
            <Droppable droppableId={col.id} key={col.id} isDropDisabled={!canDrag}>
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className={`rounded-xl overflow-hidden min-h-[300px] md:min-h-[400px] transition-all duration-300 ${colIndex !== activeColumnIndex ? 'hidden md:block' : ''}`}
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
                  {/* Header de columna con gradiente */}
                  <div className={`${col.headerClass} px-4 py-3 flex items-center justify-between`}>
                    <h2 className="font-semibold text-white flex items-center gap-2 text-base">
                      <span className="w-2 h-2 rounded-full bg-white/50"></span>
                      <span className="truncate">{col.titulo}</span>
                    </h2>
                    <span className="bg-white/20 backdrop-blur-sm px-3 py-1 rounded-full text-xs font-bold text-white">
                      {getReclamosPorEstado(col.id).length}
                    </span>
                  </div>

                  {/* Lista de reclamos */}
                  <div className="p-3 md:p-4 space-y-3 overflow-y-auto">
                    {getReclamosPorEstado(col.id).map((reclamo, index) => (
                      <Draggable
                        key={reclamo.id}
                        draggableId={String(reclamo.id)}
                        index={index}
                        isDragDisabled={!canDrag}
                      >
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                            className={`${col.cardClass} rounded-lg p-4 ${!snapshot.isDragging ? 'hover-lift' : ''} ${canDrag ? 'cursor-grab active:cursor-grabbing' : ''}`}
                            style={{
                              ...provided.draggableProps.style,
                              boxShadow: snapshot.isDragging
                                ? `0 20px 40px rgba(0,0,0,0.3), 0 0 30px ${col.color}50`
                                : '0 2px 8px rgba(0,0,0,0.1)',
                              opacity: snapshot.isDragging ? 0.95 : 1,
                            }}
                          >
                            <div className="flex items-start gap-3">
                              {/* Handle de drag con icono colorido - solo en desktop */}
                              {canDrag && (
                                <div
                                  className="mt-1 p-1 rounded hidden md:block"
                                  style={{
                                    background: `linear-gradient(135deg, ${col.color}30, ${col.color}10)`,
                                    color: col.color
                                  }}
                                >
                                  <GripVertical className="w-4 h-4" />
                                </div>
                              )}

                              <div className="flex-1 min-w-0">
                                <Link
                                  to={`/gestion/reclamos/${reclamo.id}`}
                                  className="font-semibold hover:underline line-clamp-2 transition-colors text-sm md:text-base"
                                  style={{ color: theme.text }}
                                  onClick={(e) => snapshot.isDragging && e.preventDefault()}
                                >
                                  {reclamo.titulo}
                                </Link>
                                <p
                                  className="text-xs md:text-sm mt-1 truncate flex items-center gap-1"
                                  style={{ color: theme.textSecondary }}
                                >
                                  <span className="inline-block w-1 h-1 rounded-full" style={{ backgroundColor: col.color }}></span>
                                  {reclamo.direccion}
                                </p>

                                <div className="flex items-center justify-between mt-3 gap-2 pt-2 border-t" style={{ borderColor: `${col.color}20` }}>
                                  <span className="text-xs font-medium" style={{ color: theme.textSecondary }}>
                                    {new Date(reclamo.created_at).toLocaleDateString('es-AR', {
                                      day: '2-digit',
                                      month: 'short'
                                    })}
                                  </span>
                                  {/* Si tiene dependencia asignada mostrar su nombre, sino la categoría */}
                                  {reclamo.dependencia_asignada ? (
                                    <span
                                      className="text-xs px-2 py-1 rounded-full text-white truncate max-w-[120px] font-medium"
                                      style={{
                                        background: `linear-gradient(135deg, ${reclamo.dependencia_asignada.color || col.color}, ${reclamo.dependencia_asignada.color || col.color}dd)`
                                      }}
                                      title={reclamo.dependencia_asignada.nombre}
                                    >
                                      {reclamo.dependencia_asignada.nombre}
                                    </span>
                                  ) : (
                                    <span
                                      className="text-xs px-2 py-1 rounded-full text-white truncate max-w-[120px] font-medium"
                                      style={{
                                        background: `linear-gradient(135deg, ${reclamo.categoria?.color || '#6b7280'}, ${reclamo.categoria?.color || '#6b7280'}dd)`
                                      }}
                                      title={reclamo.categoria?.nombre}
                                    >
                                      {reclamo.categoria?.nombre}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </Draggable>
                    ))}

                    {provided.placeholder}

                    {getReclamosPorEstado(col.id).length === 0 && (
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
                          <span style={{ color: col.color }}>📋</span>
                        </div>
                        <p className="text-sm font-medium">Sin reclamos</p>
                        {canDrag && (
                          <p className="text-xs mt-1 opacity-70 hidden md:block">Arrastra aquí para mover</p>
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

    </div>
  );
}
