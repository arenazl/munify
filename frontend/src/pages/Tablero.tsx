import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { Search, GripVertical } from 'lucide-react';
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
    id: 'resuelto',
    titulo: 'Resueltos',
    color: '#22c55e',
    headerClass: 'column-header-green',
    cardClass: 'card-gradient-green',
    badgeClass: 'badge-gradient-green',
  },
];

export default function Tablero() {
  const [reclamos, setReclamos] = useState<Reclamo[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
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
      .filter(r =>
        searchTerm === '' ||
        r.titulo.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.direccion?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.categoria?.nombre?.toLowerCase().includes(searchTerm.toLowerCase())
      );
  };

  const canDrag = user?.rol === 'admin' || user?.rol === 'supervisor' || user?.rol === 'cuadrilla';

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2" style={{ borderColor: theme.primary }}></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header con título y buscador */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-bold gradient-text-rainbow">
          Vista Kanban
        </h1>

        {/* Buscador */}
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5" style={{ color: theme.textSecondary }} />
          <input
            type="text"
            placeholder="Buscar por título, dirección o categoría..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-lg border transition-colors focus:outline-none focus:ring-2"
            style={{
              backgroundColor: theme.card,
              borderColor: theme.border,
              color: theme.text,
            }}
          />
        </div>
      </div>

      {/* Instrucciones de drag & drop */}
      {canDrag && (
        <p className="text-sm" style={{ color: theme.textSecondary }}>
          Arrastra las tarjetas entre columnas para cambiar el estado de los reclamos.
        </p>
      )}

      {/* Tablero Kanban */}
      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {columnas.map((col) => (
            <Droppable droppableId={col.id} key={col.id} isDropDisabled={!canDrag}>
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className="rounded-xl overflow-hidden min-h-[400px] transition-all duration-300"
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
    </div>
  );
}
