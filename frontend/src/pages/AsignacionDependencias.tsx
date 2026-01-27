import { useEffect, useState, useCallback } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import {
  Building2, FolderKanban, FileText, Save, RefreshCw,
  AlertCircle, BookOpen, GripVertical, Check, ChevronDown, ChevronRight, Wand2, Trash2
} from 'lucide-react';
import { toast } from 'sonner';
import { dependenciasApi, categoriasApi, tramitesApi } from '../lib/api';
import { useTheme } from '../contexts/ThemeContext';
import { useSuperAdmin } from '../hooks/useSuperAdmin';
import { DynamicIcon } from '../components/ui/DynamicIcon';
import { StickyPageHeader, FilterChipRow, FilterChip } from '../components/ui/StickyPageHeader';

type TabType = 'reclamos' | 'tramites';

interface MunicipioDependencia {
  id: number;
  municipio_id: number;
  dependencia_id: number;
  nombre: string;
  codigo: string;
  tipo_gestion: 'RECLAMO' | 'TRAMITE' | 'AMBOS';
  activo: boolean;
  orden: number;
  color?: string;
  icono?: string;
  categorias_count: number;
  tipos_tramite_count: number;
  tramites_count: number;
  // Asignaciones incluidas con include_assignments=true
  categorias?: { id: number; nombre: string; icono?: string; color?: string }[];
  tipos_tramite?: { id: number; nombre: string; icono?: string; color?: string }[];
  tramites?: { id: number; nombre: string; tipo_tramite_id: number; icono?: string; color?: string }[];
}

interface Categoria {
  id: number;
  nombre: string;
  icono: string;
  color: string;
}

interface TipoTramite {
  id: number;
  nombre: string;
  icono: string;
  color: string;
}

interface Tramite {
  id: number;
  nombre: string;
  tipo_tramite_id: number;
  icono?: string;
  color?: string;
}

interface AsignacionState {
  [dependenciaId: number]: {
    categorias: number[];
    tipos_tramite: number[];
    tramites: number[];
  };
}

export default function AsignacionDependencias() {
  const { theme } = useTheme();
  const { isSuperAdmin } = useSuperAdmin();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('reclamos');

  const [dependencias, setDependencias] = useState<MunicipioDependencia[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [tiposTramite, setTiposTramite] = useState<TipoTramite[]>([]);
  const [tramitesCatalogo, setTramitesCatalogo] = useState<Tramite[]>([]);

  const [asignaciones, setAsignaciones] = useState<AsignacionState>({});
  const [asignacionesOriginales, setAsignacionesOriginales] = useState<AsignacionState>({});

  // Dependencia expandida para ver/editar trámites específicos
  const [expandedDepId, setExpandedDepId] = useState<number | null>(null);
  const [expandedTipoId, setExpandedTipoId] = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Una sola llamada con include_assignments=true trae todo
      const [depsRes, catsRes, tiposRes, tramitesRes] = await Promise.all([
        dependenciasApi.getMunicipio({ activo: true, include_assignments: true }),
        categoriasApi.getCatalogo(),
        tramitesApi.getTiposCatalogo(),
        tramitesApi.getCatalogo(),
      ]);

      const deps: MunicipioDependencia[] = depsRes.data;
      setDependencias(deps);
      setCategorias(catsRes.data);
      setTiposTramite(tiposRes.data);
      setTramitesCatalogo(tramitesRes.data);

      // Extraer asignaciones directamente de la respuesta (ya vienen incluidas)
      const asignacionesIniciales: AsignacionState = {};
      for (const dep of deps) {
        asignacionesIniciales[dep.id] = {
          categorias: dep.categorias?.map(c => c.id) || [],
          tipos_tramite: dep.tipos_tramite?.map(t => t.id) || [],
          tramites: dep.tramites?.map(t => t.id) || [],
        };
      }

      setAsignaciones(asignacionesIniciales);
      setAsignacionesOriginales(JSON.parse(JSON.stringify(asignacionesIniciales)));
    } catch (error) {
      console.error('Error al cargar datos:', error);
      toast.error('Error al cargar la configuración');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const dependenciasFiltradas = dependencias.filter(d => {
    if (activeTab === 'reclamos') {
      return d.tipo_gestion === 'RECLAMO' || d.tipo_gestion === 'AMBOS';
    } else {
      return d.tipo_gestion === 'TRAMITE' || d.tipo_gestion === 'AMBOS';
    }
  });

  const hasChanges = () => {
    return JSON.stringify(asignaciones) !== JSON.stringify(asignacionesOriginales);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const promises: Promise<unknown>[] = [];

      for (const dependenciaId of Object.keys(asignaciones)) {
        const depId = Number(dependenciaId);
        const current = asignaciones[depId];
        const original = asignacionesOriginales[depId] || { categorias: [], tipos_tramite: [], tramites: [] };
        const dep = dependencias.find(d => d.id === depId);

        if (dep && (dep.tipo_gestion === 'RECLAMO' || dep.tipo_gestion === 'AMBOS')) {
          if (JSON.stringify([...current.categorias].sort()) !== JSON.stringify([...original.categorias].sort())) {
            promises.push(dependenciasApi.asignarCategorias(depId, current.categorias));
          }
        }

        if (dep && (dep.tipo_gestion === 'TRAMITE' || dep.tipo_gestion === 'AMBOS')) {
          if (JSON.stringify([...current.tipos_tramite].sort()) !== JSON.stringify([...original.tipos_tramite].sort())) {
            promises.push(dependenciasApi.asignarTiposTramite(depId, current.tipos_tramite));
          }
          if (JSON.stringify([...current.tramites].sort()) !== JSON.stringify([...original.tramites].sort())) {
            promises.push(dependenciasApi.asignarTramites(depId, current.tramites));
          }
        }
      }

      await Promise.all(promises);
      setAsignacionesOriginales(JSON.parse(JSON.stringify(asignaciones)));
      toast.success('Configuración guardada correctamente');
    } catch (error) {
      console.error('Error al guardar:', error);
      toast.error('Error al guardar la configuración');
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = () => {
    setAsignaciones(JSON.parse(JSON.stringify(asignacionesOriginales)));
    toast.info('Cambios descartados');
  };

  // Items disponibles (no asignados a ninguna dependencia)
  const getItemsDisponibles = () => {
    if (activeTab === 'reclamos') {
      // Categorías no asignadas a ninguna dependencia
      const todasAsignadas = new Set<number>();
      dependenciasFiltradas.forEach(dep => {
        (asignaciones[dep.id]?.categorias || []).forEach(id => todasAsignadas.add(id));
      });
      return categorias.filter(c => !todasAsignadas.has(c.id));
    } else {
      // Tipos de trámite no asignados a ninguna dependencia
      const todosAsignados = new Set<number>();
      dependenciasFiltradas.forEach(dep => {
        (asignaciones[dep.id]?.tipos_tramite || []).forEach(id => todosAsignados.add(id));
      });
      return tiposTramite.filter(t => !todosAsignados.has(t.id));
    }
  };

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;

    const { source, destination, draggableId } = result;
    const itemId = parseInt(draggableId.split('-')[1]);

    // Identificar origen y destino
    const sourceDepId = source.droppableId === 'disponibles' ? null : parseInt(source.droppableId.replace('dep-', ''));
    const destDepId = destination.droppableId === 'disponibles' ? null : parseInt(destination.droppableId.replace('dep-', ''));

    // Si es el mismo lugar, no hacer nada
    if (sourceDepId === destDepId) return;

    setAsignaciones(prev => {
      const newState = JSON.parse(JSON.stringify(prev));

      if (activeTab === 'reclamos') {
        // Quitar del origen
        if (sourceDepId !== null && newState[sourceDepId]) {
          newState[sourceDepId].categorias = newState[sourceDepId].categorias.filter((id: number) => id !== itemId);
        }
        // Agregar al destino
        if (destDepId !== null) {
          if (!newState[destDepId]) {
            newState[destDepId] = { categorias: [], tipos_tramite: [], tramites: [] };
          }
          if (!newState[destDepId].categorias.includes(itemId)) {
            newState[destDepId].categorias.push(itemId);
          }
        }
      } else {
        // Quitar del origen (tipo)
        if (sourceDepId !== null && newState[sourceDepId]) {
          newState[sourceDepId].tipos_tramite = newState[sourceDepId].tipos_tramite.filter((id: number) => id !== itemId);
          // También quitar los trámites de ese tipo
          const tramitesDelTipo = tramitesCatalogo.filter(t => t.tipo_tramite_id === itemId).map(t => t.id);
          newState[sourceDepId].tramites = newState[sourceDepId].tramites.filter((id: number) => !tramitesDelTipo.includes(id));
        }
        // Agregar al destino
        if (destDepId !== null) {
          if (!newState[destDepId]) {
            newState[destDepId] = { categorias: [], tipos_tramite: [], tramites: [] };
          }
          if (!newState[destDepId].tipos_tramite.includes(itemId)) {
            newState[destDepId].tipos_tramite.push(itemId);
            // Activar todos los trámites del tipo por defecto
            const tramitesDelTipo = tramitesCatalogo.filter(t => t.tipo_tramite_id === itemId);
            tramitesDelTipo.forEach(t => {
              if (!newState[destDepId].tramites.includes(t.id)) {
                newState[destDepId].tramites.push(t.id);
              }
            });
          }
        }
      }

      return newState;
    });
  };

  const toggleTramite = (depId: number, tramiteId: number) => {
    setAsignaciones(prev => {
      const newState = JSON.parse(JSON.stringify(prev));
      if (!newState[depId]) {
        newState[depId] = { categorias: [], tipos_tramite: [], tramites: [] };
      }

      const index = newState[depId].tramites.indexOf(tramiteId);
      if (index > -1) {
        newState[depId].tramites.splice(index, 1);
      } else {
        newState[depId].tramites.push(tramiteId);
      }

      return newState;
    });
  };

  const getCategoriasAsignadas = (depId: number) => {
    const ids = asignaciones[depId]?.categorias || [];
    return categorias.filter(c => ids.includes(c.id));
  };

  const getTiposAsignados = (depId: number) => {
    const ids = asignaciones[depId]?.tipos_tramite || [];
    return tiposTramite.filter(t => ids.includes(t.id));
  };

  const getTramitesDelTipo = (tipoId: number) => {
    return tramitesCatalogo.filter(t => t.tipo_tramite_id === tipoId);
  };

  const isTramiteActivo = (depId: number, tramiteId: number) => {
    return asignaciones[depId]?.tramites?.includes(tramiteId) || false;
  };

  const getTramitesActivosCount = (depId: number, tipoId: number) => {
    const tramitesDelTipo = getTramitesDelTipo(tipoId);
    return tramitesDelTipo.filter(t => isTramiteActivo(depId, t.id)).length;
  };

  // Desasignar todo según el tab activo
  const desasignarTodo = async () => {
    try {
      if (activeTab === 'reclamos') {
        await dependenciasApi.limpiarAsignacionesCategorias();
        // Limpiar solo categorías del estado local
        setAsignaciones(prev => {
          const newState: AsignacionState = {};
          Object.keys(prev).forEach(depId => {
            newState[parseInt(depId)] = {
              ...prev[parseInt(depId)],
              categorias: []
            };
          });
          return newState;
        });
        toast.success('Se desasignaron todas las categorías');
      } else {
        await dependenciasApi.limpiarAsignacionesTiposTramite();
        // Limpiar tipos de trámite del estado local
        setAsignaciones(prev => {
          const newState: AsignacionState = {};
          Object.keys(prev).forEach(depId => {
            newState[parseInt(depId)] = {
              ...prev[parseInt(depId)],
              tipos_tramite: [],
              tramites: []
            };
          });
          return newState;
        });
        toast.success('Se desasignaron todos los tipos de trámite');
      }
      // Recargar datos
      fetchData();
    } catch (error) {
      console.error('Error al desasignar:', error);
      toast.error('Error al desasignar');
    }
  };

  // Auto-asignación inteligente usando IA
  const autoAsignar = async () => {
    try {
      toast.loading('Analizando con IA...');

      if (activeTab === 'reclamos') {
        // Obtener dependencias tipo RECLAMO o AMBOS
        const depsReclamo = dependencias.filter(d => d.tipo_gestion === 'RECLAMO' || d.tipo_gestion === 'AMBOS');

        const response = await dependenciasApi.autoAsignarCategoriasIA(
          categorias.map(c => ({ id: c.id, nombre: c.nombre })),
          depsReclamo.map(d => ({ id: d.dependencia_id, nombre: d.nombre, descripcion: undefined }))
        );

        toast.dismiss();
        toast.success(`IA asignó ${response.data.total} categorías automáticamente`);
      } else {
        // Obtener dependencias tipo TRAMITE o AMBOS
        const depsTramite = dependencias.filter(d => d.tipo_gestion === 'TRAMITE' || d.tipo_gestion === 'AMBOS');

        const response = await dependenciasApi.autoAsignarTiposTramiteIA(
          tiposTramite.map(t => ({ id: t.id, nombre: t.nombre })),
          depsTramite.map(d => ({ id: d.dependencia_id, nombre: d.nombre, descripcion: undefined }))
        );

        toast.dismiss();
        toast.success(`IA asignó ${response.data.total} tipos de trámite automáticamente`);
      }

      // Recargar datos para ver las nuevas asignaciones
      fetchData();
    } catch (error: unknown) {
      toast.dismiss();
      console.error('Error en auto-asignación:', error);
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
      toast.error(`Error al auto-asignar: ${errorMessage}`);
    }
  };

  const itemsDisponibles = getItemsDisponibles();

  // Calcular items sin asignar para cada tab (independiente del activeTab)
  const categoriasNoAsignadas = (() => {
    const depsReclamo = dependencias.filter(d => d.tipo_gestion === 'RECLAMO' || d.tipo_gestion === 'AMBOS');
    const todasAsignadas = new Set<number>();
    depsReclamo.forEach(dep => {
      (asignaciones[dep.id]?.categorias || []).forEach(id => todasAsignadas.add(id));
    });
    return categorias.filter(c => !todasAsignadas.has(c.id)).length;
  })();

  const tiposNoAsignados = (() => {
    const depsTramite = dependencias.filter(d => d.tipo_gestion === 'TRAMITE' || d.tipo_gestion === 'AMBOS');
    const todosAsignados = new Set<number>();
    depsTramite.forEach(dep => {
      (asignaciones[dep.id]?.tipos_tramite || []).forEach(id => todosAsignados.add(id));
    });
    return tiposTramite.filter(t => !todosAsignados.has(t.id)).length;
  })();

  const filterChips: FilterChip[] = [
    {
      key: 'reclamos',
      label: 'Reclamos',
      icon: <FolderKanban className="h-4 w-4" />,
      count: categoriasNoAsignadas,
    },
    {
      key: 'tramites',
      label: 'Trámites',
      icon: <FileText className="h-4 w-4" />,
      count: tiposNoAsignados,
    },
  ];

  if (isSuperAdmin) {
    return (
      <div className="min-h-screen p-6" style={{ backgroundColor: theme.background }}>
        <div
          className="max-w-2xl mx-auto p-8 rounded-2xl text-center"
          style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
        >
          <AlertCircle className="h-12 w-12 mx-auto mb-4" style={{ color: theme.primary }} />
          <h2 className="text-xl font-bold mb-2" style={{ color: theme.text }}>Acceso restringido</h2>
          <p style={{ color: theme.textSecondary }}>Esta pantalla es solo para supervisores de municipio.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: theme.background }}>
        <RefreshCw className="h-8 w-8 animate-spin" style={{ color: theme.primary }} />
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24" style={{ backgroundColor: theme.background }}>
      <StickyPageHeader
        icon={<BookOpen className="h-5 w-5" />}
        title="Asignación de Dependencias"
        backLink="/gestion/ajustes"
        filterPanel={
          <FilterChipRow
            chips={filterChips}
            activeKey={activeTab}
            onChipClick={(key) => {
              setActiveTab((key as TabType) || 'reclamos');
              setExpandedDepId(null);
              setExpandedTipoId(null);
            }}
            showAllButton={false}
          />
        }
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={desasignarTodo}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all hover:scale-105"
              style={{ backgroundColor: theme.backgroundSecondary, color: theme.textSecondary, border: `1px solid ${theme.border}` }}
            >
              <Trash2 className="h-4 w-4" />
              Desasignar
            </button>
            <button
              onClick={autoAsignar}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white transition-all hover:scale-105"
              style={{ backgroundColor: theme.primary }}
            >
              <Wand2 className="h-4 w-4" />
              Auto-asignar
            </button>
          </div>
        }
      />

      {hasChanges() && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-6 py-3 rounded-2xl shadow-2xl"
          style={{ backgroundColor: theme.card, border: `2px solid ${theme.primary}` }}
        >
          <span className="text-sm font-medium" style={{ color: theme.text }}>Hay cambios sin guardar</span>
          <button
            onClick={handleDiscard}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium"
            style={{ backgroundColor: theme.backgroundSecondary, color: theme.textSecondary }}
          >
            Descartar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium text-white"
            style={{ backgroundColor: theme.primary, opacity: saving ? 0.7 : 1 }}
          >
            {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      )}

      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="px-3 sm:px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Columna Izquierda: Items Disponibles */}
            <div
              className="rounded-2xl overflow-hidden"
              style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
            >
              <div
                className="p-4"
                style={{ borderBottom: `1px solid ${theme.border}` }}
              >
                <h3 className="font-bold" style={{ color: theme.text }}>
                  {activeTab === 'reclamos' ? 'Categorías' : 'Tipos de Trámite'} Disponibles
                </h3>
                <p className="text-xs" style={{ color: theme.textSecondary }}>
                  {itemsDisponibles.length} sin asignar - Arrastrá a una dependencia
                </p>
              </div>

              <Droppable droppableId="disponibles">
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className="p-3 space-y-2"
                    style={{
                      backgroundColor: snapshot.isDraggingOver ? `${theme.primary}10` : 'transparent',
                    }}
                  >
                    {itemsDisponibles.map((item, index) => (
                      <Draggable
                        key={`item-${item.id}`}
                        draggableId={`item-${item.id}`}
                        index={index}
                      >
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                            className="flex items-center gap-3 p-3 rounded-xl cursor-grab active:cursor-grabbing"
                            style={{
                              backgroundColor: snapshot.isDragging ? `${item.color}30` : theme.backgroundSecondary,
                              border: `1px solid ${snapshot.isDragging ? item.color : theme.border}`,
                              ...provided.draggableProps.style,
                            }}
                          >
                            <GripVertical className="h-4 w-4 flex-shrink-0" style={{ color: theme.textSecondary }} />
                            <div
                              className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                              style={{ backgroundColor: item.color }}
                            >
                              <DynamicIcon name={item.icono} className="h-4 w-4 text-white" />
                            </div>
                            <span className="font-medium text-sm truncate" style={{ color: theme.text }}>
                              {item.nombre}
                            </span>
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                    {itemsDisponibles.length === 0 && (
                      <div className="text-center py-8" style={{ color: theme.textSecondary }}>
                        Todos asignados
                      </div>
                    )}
                  </div>
                )}
              </Droppable>
            </div>

            {/* Columna Derecha: Dependencias con sus asignaciones */}
            <div className="space-y-3">
              {dependenciasFiltradas.map(dep => {
                const itemsAsignados = activeTab === 'reclamos'
                  ? getCategoriasAsignadas(dep.id)
                  : getTiposAsignados(dep.id);
                const isExpanded = expandedDepId === dep.id;

                return (
                  <Droppable key={dep.id} droppableId={`dep-${dep.id}`}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className="rounded-2xl transition-all flex-shrink-0"
                        style={{
                          backgroundColor: snapshot.isDraggingOver ? `${theme.primary}15` : theme.card,
                          border: snapshot.isDraggingOver
                            ? `2px solid ${theme.primary}`
                            : `1px solid ${theme.border}`,
                        }}
                      >
                        {/* Header de la dependencia */}
                        <div
                          className="p-4 flex items-center gap-3"
                          style={{ borderBottom: itemsAsignados.length > 0 ? `1px solid ${theme.border}` : 'none' }}
                        >
                          <div
                            className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                            style={{ backgroundColor: `${dep.color || theme.primary}20` }}
                          >
                            <DynamicIcon name={dep.icono || 'Building2'} className="h-5 w-5" style={{ color: dep.color || theme.primary }} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="font-bold truncate" style={{ color: theme.text }}>{dep.nombre}</h4>
                            <span
                              className="text-xs"
                              style={{ color: theme.textSecondary }}
                            >
                              {itemsAsignados.length} {activeTab === 'reclamos' ? 'categorías' : 'tipos'} asignados
                            </span>
                          </div>
                          {activeTab === 'tramites' && itemsAsignados.length > 0 && (
                            <button
                              onClick={() => setExpandedDepId(isExpanded ? null : dep.id)}
                              className="px-3 py-1 rounded-lg text-xs font-medium"
                              style={{ backgroundColor: theme.backgroundSecondary, color: theme.primary }}
                            >
                              {isExpanded ? 'Ocultar' : 'Ver trámites'}
                            </button>
                          )}
                        </div>

                        {/* Items asignados */}
                        {itemsAsignados.length > 0 && (
                          <div className="p-3 space-y-2">
                            {itemsAsignados.map((item, index) => {
                              const tramitesDelTipo = activeTab === 'tramites' ? getTramitesDelTipo(item.id) : [];
                              const tramitesActivos = activeTab === 'tramites' ? getTramitesActivosCount(dep.id, item.id) : 0;
                              const isTipoExpanded = expandedTipoId === item.id && expandedDepId === dep.id;

                              return (
                                <div key={item.id}>
                                  <Draggable
                                    draggableId={`item-${item.id}`}
                                    index={index}
                                  >
                                    {(provided, snapshot) => (
                                      <div
                                        ref={provided.innerRef}
                                        {...provided.draggableProps}
                                        {...provided.dragHandleProps}
                                        className="flex items-center gap-3 p-3 rounded-xl cursor-grab active:cursor-grabbing"
                                        style={{
                                          backgroundColor: snapshot.isDragging ? `${item.color}30` : `${item.color}15`,
                                          border: `2px solid ${item.color}`,
                                          ...provided.draggableProps.style,
                                        }}
                                      >
                                        <GripVertical className="h-4 w-4 flex-shrink-0" style={{ color: item.color }} />
                                        <div
                                          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                                          style={{ backgroundColor: item.color }}
                                        >
                                          <DynamicIcon name={item.icono} className="h-4 w-4 text-white" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                          <span className="font-medium text-sm block truncate" style={{ color: item.color }}>
                                            {item.nombre}
                                          </span>
                                          {activeTab === 'tramites' && (
                                            <span className="text-xs" style={{ color: theme.textSecondary }}>
                                              {tramitesActivos}/{tramitesDelTipo.length} trámites
                                            </span>
                                          )}
                                        </div>
                                        {activeTab === 'tramites' && isExpanded && (
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setExpandedTipoId(isTipoExpanded ? null : item.id);
                                            }}
                                            className="p-1"
                                          >
                                            {isTipoExpanded ? (
                                              <ChevronDown className="h-4 w-4" style={{ color: item.color }} />
                                            ) : (
                                              <ChevronRight className="h-4 w-4" style={{ color: item.color }} />
                                            )}
                                          </button>
                                        )}
                                      </div>
                                    )}
                                  </Draggable>

                                  {/* Trámites del tipo expandido */}
                                  {activeTab === 'tramites' && isExpanded && isTipoExpanded && (
                                    <div className="ml-6 mt-2 space-y-1">
                                      {tramitesDelTipo.map(tramite => {
                                        const isActivo = isTramiteActivo(dep.id, tramite.id);
                                        const color = tramite.color || item.color;

                                        return (
                                          <button
                                            key={tramite.id}
                                            onClick={() => toggleTramite(dep.id, tramite.id)}
                                            className="w-full flex items-center gap-2 p-2 rounded-lg transition-all text-left"
                                            style={{
                                              backgroundColor: isActivo ? `${color}15` : theme.backgroundSecondary,
                                              border: `1px solid ${isActivo ? color : theme.border}`,
                                            }}
                                          >
                                            <div
                                              className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0"
                                              style={{
                                                backgroundColor: isActivo ? color : 'transparent',
                                                border: `1px solid ${isActivo ? color : theme.border}`,
                                              }}
                                            >
                                              {isActivo && <Check className="h-3 w-3 text-white" />}
                                            </div>
                                            <span
                                              className="text-sm truncate"
                                              style={{ color: isActivo ? color : theme.text }}
                                            >
                                              {tramite.nombre}
                                            </span>
                                          </button>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* Placeholder para drop */}
                        {itemsAsignados.length === 0 && (
                          <div
                            className="p-4 text-center text-sm"
                            style={{ color: theme.textSecondary }}
                          >
                            Arrastrá {activeTab === 'reclamos' ? 'categorías' : 'tipos'} aquí
                          </div>
                        )}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                );
              })}

              {dependenciasFiltradas.length === 0 && (
                <div
                  className="p-8 rounded-2xl text-center"
                  style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
                >
                  <AlertCircle className="h-10 w-10 mx-auto mb-3" style={{ color: theme.textSecondary }} />
                  <p style={{ color: theme.textSecondary }}>
                    No hay dependencias de tipo "{activeTab === 'reclamos' ? 'Reclamo' : 'Trámite'}" habilitadas.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </DragDropContext>
    </div>
  );
}
