import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Building2, FolderKanban, FileText, Save, RefreshCw,
  Check, X, Plus, Trash2, GripVertical, Folder
} from 'lucide-react';
import { toast } from 'sonner';
import { direccionesApi } from '../lib/api';
import { useTheme } from '../contexts/ThemeContext';
import { DynamicIcon } from '../components/ui/DynamicIcon';
import type { Direccion, CategoriaDisponible, TipoTramiteDisponible } from '../types';

type TabType = 'categorias' | 'tipos_tramite';

interface AsignacionState {
  [direccionId: number]: {
    categorias: number[];
    tipos_tramite: number[];
  };
}

export default function DireccionesConfig() {
  const navigate = useNavigate();
  const { theme } = useTheme();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('categorias');

  const [direcciones, setDirecciones] = useState<Direccion[]>([]);
  const [categoriasDisponibles, setCategoriasDisponibles] = useState<CategoriaDisponible[]>([]);
  const [tiposTramiteDisponibles, setTiposTramiteDisponibles] = useState<TipoTramiteDisponible[]>([]);

  const [asignaciones, setAsignaciones] = useState<AsignacionState>({});
  const [asignacionesOriginales, setAsignacionesOriginales] = useState<AsignacionState>({});

  // Drag and drop state
  const [draggedItemId, setDraggedItemId] = useState<number | null>(null);
  const [dragOverDireccionId, setDragOverDireccionId] = useState<number | null>(null);

  // Dirección seleccionada para ver detalle
  const [selectedDireccion, setSelectedDireccion] = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [direccionesRes, categoriasRes, tiposRes] = await Promise.all([
        direccionesApi.getAll({ activo: true }),
        direccionesApi.getCategoriasDisponibles(),
        direccionesApi.getTiposTramiteDisponibles(),
      ]);

      const dirs = direccionesRes.data;
      setDirecciones(dirs);
      setCategoriasDisponibles(categoriasRes.data);
      setTiposTramiteDisponibles(tiposRes.data);

      // Construir estado inicial
      const asignacionesIniciales: AsignacionState = {};
      for (const cat of categoriasRes.data) {
        for (const dirId of cat.direcciones_asignadas || []) {
          if (!asignacionesIniciales[dirId]) {
            asignacionesIniciales[dirId] = { categorias: [], tipos_tramite: [] };
          }
          asignacionesIniciales[dirId].categorias.push(cat.id);
        }
      }
      for (const tipo of tiposRes.data) {
        for (const dirId of tipo.direcciones_asignadas || []) {
          if (!asignacionesIniciales[dirId]) {
            asignacionesIniciales[dirId] = { categorias: [], tipos_tramite: [] };
          }
          asignacionesIniciales[dirId].tipos_tramite.push(tipo.id);
        }
      }

      for (const dir of dirs) {
        if (!asignacionesIniciales[dir.id]) {
          asignacionesIniciales[dir.id] = { categorias: [], tipos_tramite: [] };
        }
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

  // Filtrar direcciones según el tab activo
  const direccionesFiltradas = direcciones.filter(d => {
    if (activeTab === 'categorias') {
      return d.tipo_gestion === 'reclamos' || d.tipo_gestion === 'ambos';
    } else {
      return d.tipo_gestion === 'tramites' || d.tipo_gestion === 'ambos';
    }
  });

  const hasChanges = () => {
    return JSON.stringify(asignaciones) !== JSON.stringify(asignacionesOriginales);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const promises: Promise<unknown>[] = [];

      for (const direccionId of Object.keys(asignaciones)) {
        const dirId = Number(direccionId);
        const current = asignaciones[dirId];
        const original = asignacionesOriginales[dirId] || { categorias: [], tipos_tramite: [] };

        if (JSON.stringify([...current.categorias].sort()) !== JSON.stringify([...original.categorias].sort())) {
          promises.push(direccionesApi.asignarCategorias(dirId, current.categorias));
        }

        if (JSON.stringify([...current.tipos_tramite].sort()) !== JSON.stringify([...original.tipos_tramite].sort())) {
          promises.push(direccionesApi.asignarTiposTramite(dirId, current.tipos_tramite));
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

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, itemId: number) => {
    setDraggedItemId(itemId);
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('text/plain', itemId.toString());
  };

  const handleDragEnd = () => {
    setDraggedItemId(null);
    setDragOverDireccionId(null);
  };

  const handleDragOver = (e: React.DragEvent, direccionId: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setDragOverDireccionId(direccionId);
  };

  const handleDragLeave = () => {
    setDragOverDireccionId(null);
  };

  const handleDrop = (e: React.DragEvent, direccionId: number) => {
    e.preventDefault();
    const itemId = draggedItemId;
    if (itemId === null) return;

    const key = activeTab === 'categorias' ? 'categorias' : 'tipos_tramite';
    const current = asignaciones[direccionId]?.[key] || [];

    if (!current.includes(itemId)) {
      setAsignaciones(prev => ({
        ...prev,
        [direccionId]: {
          ...prev[direccionId],
          [key]: [...current, itemId],
        },
      }));
      toast.success('Item asignado');
    }

    setDraggedItemId(null);
    setDragOverDireccionId(null);
  };

  const toggleAsignacion = (direccionId: number, itemId: number) => {
    const key = activeTab === 'categorias' ? 'categorias' : 'tipos_tramite';
    const current = asignaciones[direccionId]?.[key] || [];
    const newItems = current.includes(itemId)
      ? current.filter(id => id !== itemId)
      : [...current, itemId];

    setAsignaciones(prev => ({
      ...prev,
      [direccionId]: {
        ...prev[direccionId],
        [key]: newItems,
      },
    }));
  };

  const getAsignados = (direccionId: number) => {
    const key = activeTab === 'categorias' ? 'categorias' : 'tipos_tramite';
    return asignaciones[direccionId]?.[key] || [];
  };

  const asignarTodosADireccion = (direccionId: number) => {
    const items = activeTab === 'categorias' ? categoriasDisponibles : tiposTramiteDisponibles;
    const key = activeTab === 'categorias' ? 'categorias' : 'tipos_tramite';

    setAsignaciones(prev => ({
      ...prev,
      [direccionId]: {
        ...prev[direccionId],
        [key]: items.map(i => i.id),
      },
    }));
  };

  const quitarTodosDeDireccion = (direccionId: number) => {
    const key = activeTab === 'categorias' ? 'categorias' : 'tipos_tramite';

    setAsignaciones(prev => ({
      ...prev,
      [direccionId]: {
        ...prev[direccionId],
        [key]: [],
      },
    }));
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: theme.background }}>
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  const allItems = activeTab === 'categorias' ? categoriasDisponibles : tiposTramiteDisponibles;

  // Obtener IDs de items ya asignados a alguna dirección
  const itemsAsignadosIds = new Set<number>();
  for (const dirId of Object.keys(asignaciones)) {
    const key = activeTab === 'categorias' ? 'categorias' : 'tipos_tramite';
    const asignados = asignaciones[Number(dirId)]?.[key] || [];
    asignados.forEach(id => itemsAsignadosIds.add(id));
  }

  // Items disponibles para arrastrar (no asignados a ninguna dirección)
  const itemsDisponibles = allItems.filter(item => !itemsAsignadosIds.has(item.id));

  return (
    <div className="min-h-screen" style={{ backgroundColor: theme.background }}>
      {/* Header */}
      <div
        className="sticky top-0 z-20 backdrop-blur-xl border-b"
        style={{ backgroundColor: `${theme.background}95`, borderColor: theme.border }}
      >
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/gestion/direcciones')}
                className="p-2 rounded-lg transition-colors hover:scale-105"
                style={{ backgroundColor: theme.backgroundSecondary, color: theme.text }}
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div>
                <h1 className="text-2xl font-bold" style={{ color: theme.text }}>
                  Configurar Asignaciones
                </h1>
                <p className="text-sm" style={{ color: theme.textSecondary }}>
                  Arrastra items hacia las direcciones o haz clic para asignar
                </p>
              </div>
            </div>

            {hasChanges() && (
              <div className="flex items-center gap-3">
                <button
                  onClick={handleDiscard}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg transition-colors"
                  style={{
                    backgroundColor: theme.backgroundSecondary,
                    color: theme.textSecondary,
                    border: `1px solid ${theme.border}`
                  }}
                >
                  <X className="h-4 w-4" />
                  Descartar
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-white transition-colors disabled:opacity-50"
                  style={{ backgroundColor: '#10b981' }}
                >
                  {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Guardar
                </button>
              </div>
            )}
          </div>

          {/* Tabs */}
          <div className="flex gap-2 mt-4">
            <button
              onClick={() => setActiveTab('categorias')}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium transition-all ${
                activeTab === 'categorias' ? 'scale-105 shadow-lg' : ''
              }`}
              style={{
                backgroundColor: activeTab === 'categorias' ? '#ef4444' : theme.backgroundSecondary,
                color: activeTab === 'categorias' ? 'white' : theme.textSecondary,
              }}
            >
              <FolderKanban className="h-4 w-4" />
              Categorias (Reclamos)
            </button>
            <button
              onClick={() => setActiveTab('tipos_tramite')}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium transition-all ${
                activeTab === 'tipos_tramite' ? 'scale-105 shadow-lg' : ''
              }`}
              style={{
                backgroundColor: activeTab === 'tipos_tramite' ? '#3b82f6' : theme.backgroundSecondary,
                color: activeTab === 'tipos_tramite' ? 'white' : theme.textSecondary,
              }}
            >
              <FileText className="h-4 w-4" />
              Tipos de Tramite
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Panel izquierdo: Items arrastrables */}
          <div
            className="lg:col-span-1 rounded-2xl p-4 lg:sticky lg:top-40 lg:self-start lg:max-h-[calc(100vh-200px)] overflow-y-auto"
            style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
          >
            <h3 className="font-semibold mb-3 flex items-center gap-2" style={{ color: theme.text }}>
              {activeTab === 'categorias' ? (
                <FolderKanban className="h-5 w-5" style={{ color: '#ef4444' }} />
              ) : (
                <FileText className="h-5 w-5" style={{ color: '#3b82f6' }} />
              )}
              {activeTab === 'categorias' ? 'Categorias' : 'Tipos Tramite'}
            </h3>

            <p className="text-xs mb-4" style={{ color: theme.textSecondary }}>
              Arrastra hacia una direccion
            </p>

            <div className="space-y-2">
              {itemsDisponibles.map(item => (
                <div
                  key={item.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, item.id)}
                  onDragEnd={handleDragEnd}
                  className={`flex items-center gap-2 p-2.5 rounded-xl cursor-grab active:cursor-grabbing transition-all hover:scale-[1.02] ${
                    draggedItemId === item.id ? 'opacity-50 scale-95' : ''
                  }`}
                  style={{
                    backgroundColor: theme.backgroundSecondary,
                    border: `1px solid ${theme.border}`,
                  }}
                >
                  <GripVertical className="h-4 w-4 flex-shrink-0" style={{ color: theme.textSecondary }} />
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: item.color || '#3b82f6' }}
                  >
                    {item.icono ? (
                      <DynamicIcon name={item.icono} className="h-4 w-4 text-white" fallback={<Folder className="h-4 w-4 text-white" />} />
                    ) : (
                      <Folder className="h-4 w-4 text-white" />
                    )}
                  </div>
                  <span className="text-sm font-medium truncate" style={{ color: theme.text }}>
                    {item.nombre}
                  </span>
                </div>
              ))}

              {itemsDisponibles.length === 0 && (
                <p className="text-sm text-center py-4" style={{ color: theme.textSecondary }}>
                  {allItems.length === 0 ? 'No hay items disponibles' : 'Todos asignados ✓'}
                </p>
              )}
            </div>
          </div>

          {/* Panel derecho: Direcciones (drop targets) */}
          <div className="lg:col-span-3 space-y-4">
            {direccionesFiltradas.length === 0 ? (
              <div
                className="text-center py-16 rounded-2xl"
                style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
              >
                <Building2 className="h-16 w-16 mx-auto mb-4 opacity-30" style={{ color: theme.textSecondary }} />
                <p className="text-lg font-medium mb-2" style={{ color: theme.text }}>
                  No hay direcciones para {activeTab === 'categorias' ? 'reclamos' : 'tramites'}
                </p>
                <button
                  onClick={() => navigate('/gestion/direcciones')}
                  className="mt-4 px-4 py-2 rounded-lg text-white"
                  style={{ backgroundColor: '#3b82f6' }}
                >
                  Ir a Direcciones
                </button>
              </div>
            ) : (
              direccionesFiltradas.map(dir => {
                const isDragOver = dragOverDireccionId === dir.id;
                const asignados = getAsignados(dir.id);
                const isExpanded = selectedDireccion === dir.id;

                return (
                  <div
                    key={dir.id}
                    className={`rounded-2xl overflow-hidden transition-all ${
                      isDragOver ? 'scale-[1.01] ring-2 ring-green-500' : ''
                    }`}
                    style={{
                      backgroundColor: theme.card,
                      border: `2px solid ${isDragOver ? '#10b981' : theme.border}`,
                      boxShadow: isDragOver ? '0 0 20px rgba(16, 185, 129, 0.2)' : undefined,
                    }}
                    onDragOver={(e) => handleDragOver(e, dir.id)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, dir.id)}
                  >
                    {/* Header de la dirección */}
                    <div
                      className="flex items-center justify-between p-4 cursor-pointer"
                      onClick={() => setSelectedDireccion(isExpanded ? null : dir.id)}
                      style={{ backgroundColor: isDragOver ? 'rgba(16, 185, 129, 0.1)' : 'transparent' }}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="w-12 h-12 rounded-xl flex items-center justify-center"
                          style={{ backgroundColor: isDragOver ? '#10b981' : '#3b82f6' }}
                        >
                          <Building2 className="h-6 w-6 text-white" />
                        </div>
                        <div>
                          <p className="font-semibold" style={{ color: theme.text }}>
                            {dir.nombre}
                          </p>
                          <p className="text-xs" style={{ color: theme.textSecondary }}>
                            {dir.codigo} · {asignados.length} asignado{asignados.length !== 1 ? 's' : ''}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {isDragOver && (
                          <span className="text-xs font-medium px-2 py-1 rounded-full bg-green-500 text-white animate-pulse">
                            Soltar aqui
                          </span>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); asignarTodosADireccion(dir.id); }}
                          className="p-2 rounded-lg transition-colors"
                          style={{ color: '#10b981' }}
                          title="Asignar todos"
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); quitarTodosDeDireccion(dir.id); }}
                          className="p-2 rounded-lg transition-colors"
                          style={{ color: '#ef4444' }}
                          title="Quitar todos"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    {/* Items asignados (siempre visible en forma compacta, expandible) */}
                    {asignados.length > 0 && (
                      <div className="px-4 pb-4">
                        <div className={`flex flex-wrap gap-2 ${!isExpanded && asignados.length > 6 ? 'max-h-20 overflow-hidden' : ''}`}>
                          {asignados.map(itemId => {
                            const item = allItems.find(i => i.id === itemId);
                            if (!item) return null;

                            return (
                              <div
                                key={itemId}
                                className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg transition-all hover:scale-105 cursor-pointer"
                                style={{
                                  backgroundColor: 'rgba(16, 185, 129, 0.1)',
                                  border: '1px solid rgba(16, 185, 129, 0.3)',
                                }}
                                onClick={(e) => { e.stopPropagation(); toggleAsignacion(dir.id, itemId); }}
                                title="Clic para quitar"
                              >
                                <div
                                  className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0"
                                  style={{ backgroundColor: item.color || '#3b82f6' }}
                                >
                                  {item.icono ? (
                                    <DynamicIcon name={item.icono} className="h-3 w-3 text-white" fallback={<Folder className="h-3 w-3 text-white" />} />
                                  ) : (
                                    <Folder className="h-3 w-3 text-white" />
                                  )}
                                </div>
                                <span className="text-xs font-medium" style={{ color: theme.text }}>
                                  {item.nombre}
                                </span>
                                <X className="h-3 w-3" style={{ color: '#ef4444' }} />
                              </div>
                            );
                          })}
                        </div>
                        {!isExpanded && asignados.length > 6 && (
                          <p className="text-xs mt-2" style={{ color: theme.textSecondary }}>
                            +{asignados.length - 6} mas... (clic para expandir)
                          </p>
                        )}
                      </div>
                    )}

                    {/* Panel expandido para agregar items */}
                    {isExpanded && (
                      <div className="px-4 pb-4 pt-2 border-t" style={{ borderColor: theme.border }}>
                        <p className="text-xs mb-3" style={{ color: theme.textSecondary }}>
                          Clic en un item para asignarlo:
                        </p>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                          {allItems.filter(item => !asignados.includes(item.id)).map(item => (
                            <button
                              key={item.id}
                              onClick={() => toggleAsignacion(dir.id, item.id)}
                              className="flex items-center gap-2 p-2 rounded-lg transition-all hover:scale-[1.02]"
                              style={{
                                backgroundColor: theme.backgroundSecondary,
                                border: `1px solid ${theme.border}`,
                              }}
                            >
                              <div
                                className="w-6 h-6 rounded flex items-center justify-center flex-shrink-0"
                                style={{ backgroundColor: item.color || '#3b82f6' }}
                              >
                                {item.icono ? (
                                  <DynamicIcon name={item.icono} className="h-3.5 w-3.5 text-white" fallback={<Folder className="h-3.5 w-3.5 text-white" />} />
                                ) : (
                                  <Folder className="h-3.5 w-3.5 text-white" />
                                )}
                              </div>
                              <span className="text-xs font-medium truncate" style={{ color: theme.text }}>
                                {item.nombre}
                              </span>
                              <Check className="h-3 w-3 ml-auto" style={{ color: '#10b981' }} />
                            </button>
                          ))}
                        </div>
                        {allItems.filter(item => !asignados.includes(item.id)).length === 0 && (
                          <p className="text-xs text-center py-2" style={{ color: theme.textSecondary }}>
                            Todos los items ya estan asignados
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
