import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { Search, GripVertical, Columns3, Calendar, X } from 'lucide-react';
import { reclamosApi } from '../lib/api';
import { Reclamo, EstadoReclamo } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { toast } from 'sonner';

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
    titulo: 'Pendiente Confirmación',
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

// Función helper para obtener fecha de hoy en formato YYYY-MM-DD
const getTodayDate = () => {
  const today = new Date();
  return today.toISOString().split('T')[0];
};

export default function Tablero() {
  const [reclamos, setReclamos] = useState<Reclamo[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [fechaDesde, setFechaDesde] = useState(getTodayDate());
  const [fechaHasta, setFechaHasta] = useState(getTodayDate());
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
      .filter(r =>
        searchTerm === '' ||
        r.titulo.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.direccion?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.categoria?.nombre?.toLowerCase().includes(searchTerm.toLowerCase())
      );
  };

  const limpiarFiltrosFecha = () => {
    setFechaDesde('');
    setFechaHasta('');
  };

  const canDrag = user?.rol === 'admin' || user?.rol === 'supervisor' || user?.rol === 'empleado';

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2" style={{ borderColor: theme.primary }}></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Sticky wrapper para header */}
      <div
        className="sticky top-16 z-40 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 pt-1 pb-3"
        style={{ backgroundColor: theme.background }}
      >
        {/* Header estilo ABMPage */}
        <div
          className="flex items-center gap-4 px-4 py-3 rounded-xl"
          style={{
            backgroundColor: theme.card,
            border: `1px solid ${theme.border}`,
          }}
        >
          {/* Título con icono */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: `${theme.primary}20` }}
            >
              <Columns3 className="h-4 w-4" style={{ color: theme.primary }} />
            </div>
            <h1 className="text-lg font-bold tracking-tight hidden sm:block" style={{ color: theme.text }}>
              Tablero
            </h1>
          </div>

          {/* Separador */}
          <div className="h-8 w-px hidden sm:block" style={{ backgroundColor: theme.border }} />

          {/* Filtros de fecha */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <Calendar className="w-4 h-4 hidden sm:block" style={{ color: theme.textSecondary }} />
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

          {/* Separador */}
          <div className="h-8 w-px hidden lg:block" style={{ backgroundColor: theme.border }} />

          {/* Buscador - ocupa espacio disponible */}
          <div className="relative flex-1 min-w-[150px]">
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
        </div>

        {/* Instrucciones de drag & drop */}
        {canDrag && (
          <p className="text-sm mt-2 px-1" style={{ color: theme.textSecondary }}>
            Arrastra las tarjetas entre columnas para cambiar el estado de los reclamos.
          </p>
        )}
      </div>

      {/* Tablero Kanban */}
      <DragDropContext onDragEnd={handleDragEnd}>
        {/* En móvil: scroll horizontal. En desktop: grid de 4 columnas */}
        <div className="flex md:grid md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 overflow-x-auto md:overflow-x-visible pb-4 md:pb-0 -mx-3 px-3 md:mx-0 md:px-0 snap-x snap-mandatory md:snap-none">
          {columnas.map((col) => (
            <Droppable droppableId={col.id} key={col.id} isDropDisabled={!canDrag}>
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className="rounded-xl overflow-hidden min-h-[350px] md:min-h-[400px] transition-all duration-300 flex-shrink-0 w-[85vw] md:w-auto snap-center"
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
                    <h2 className="font-semibold text-white flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-white/50"></span>
                      {col.titulo}
                    </h2>
                    <span className="bg-white/20 backdrop-blur-sm px-3 py-1 rounded-full text-xs font-bold text-white">
                      {getReclamosPorEstado(col.id).length}
                    </span>
                  </div>

                  {/* Lista de reclamos */}
                  <div className="p-4 space-y-3">
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
                              {/* Handle de drag con icono colorido */}
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
                                <Link
                                  to={`/reclamos/${reclamo.id}`}
                                  className="font-semibold hover:underline line-clamp-2 transition-colors"
                                  style={{ color: theme.text }}
                                  onClick={(e) => snapshot.isDragging && e.preventDefault()}
                                >
                                  {reclamo.titulo}
                                </Link>
                                <p
                                  className="text-sm mt-1 truncate flex items-center gap-1"
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
                                  <span
                                    className="text-xs px-2 py-1 rounded-full text-white truncate max-w-[120px] font-medium"
                                    style={{
                                      background: `linear-gradient(135deg, ${reclamo.categoria?.color || '#6b7280'}, ${reclamo.categoria?.color || '#6b7280'}dd)`
                                    }}
                                    title={reclamo.categoria?.nombre}
                                  >
                                    {reclamo.categoria?.nombre}
                                  </span>
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

      {/* Estilos para ocultar scrollbar en móvil */}
      <style>{`
        .overflow-x-auto::-webkit-scrollbar {
          display: none;
        }
        .overflow-x-auto {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </div>
  );
}
