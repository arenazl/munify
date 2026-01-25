import { useEffect, useState, useRef } from 'react';
import { Edit, Clock, DollarSign, FileText, Plus, ChevronRight, EyeOff, RotateCcw, ChevronDown, BookOpen } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import { toast } from 'sonner';
import { tramitesApi } from '../lib/api';
import { useTheme } from '../contexts/ThemeContext';
import { useSuperAdmin } from '../hooks/useSuperAdmin';
import { ABMPage, ABMBadge, ABMSheetFooter, ABMInput, ABMTextarea, ABMTable, ABMTableAction, ABMCardActions } from '../components/ui/ABMPage';
import type { TramiteCatalogo, TipoTramite } from '../types';

// Iconos disponibles para trámites (organizados por categoría)
const ICONOS_DISPONIBLES = [
  // Documentos y Trámites
  'FileText', 'FileCheck', 'FilePlus', 'FileSearch', 'Files', 'FolderOpen', 'ClipboardList', 'ClipboardCheck',
  // Construcción y Obras
  'HardHat', 'Building', 'Building2', 'Home', 'Hammer', 'Wrench', 'Construction',
  // Comercio y Negocios
  'Store', 'ShoppingBag', 'ShoppingCart', 'Briefcase', 'CreditCard', 'Receipt', 'BadgePercent',
  // Vehículos y Transporte
  'Car', 'Truck', 'Bus', 'Bike', 'ParkingCircle', 'TrafficCone',
  // Naturaleza y Ambiente
  'TreeDeciduous', 'TreePine', 'Leaf', 'Flower2', 'Sun', 'Droplets',
  // Personas y Social
  'Users', 'UserPlus', 'UserCheck', 'Baby', 'Heart', 'HandHeart', 'Accessibility',
  // Salud
  'Stethoscope', 'Pill', 'Syringe', 'Activity', 'HeartPulse',
  // Educación
  'GraduationCap', 'BookOpen', 'School', 'Library',
  // Comunicación
  'Mail', 'Phone', 'MessageSquare', 'Megaphone', 'Bell',
  // Ubicación
  'MapPin', 'Map', 'Compass', 'Navigation',
  // Alertas y Estado
  'AlertTriangle', 'AlertCircle', 'CheckCircle', 'XCircle', 'Info', 'HelpCircle',
  // Tiempo
  'Clock', 'Calendar', 'CalendarDays', 'Timer', 'History',
  // Otros
  'Key', 'Lock', 'Shield', 'Award', 'Star', 'Flag', 'Zap', 'Lightbulb', 'Settings', 'Tool',
  // Animales
  'Dog', 'Cat', 'Bird', 'Fish', 'Bug',
];

function getIcon(iconName?: string, size: string = "h-5 w-5") {
  if (!iconName) return <FileText className={size} />;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Icon = (LucideIcons as any)[iconName];
  return Icon ? <Icon className={size} /> : <FileText className={size} />;
}

export default function TramitesCatalogo() {
  const { theme } = useTheme();
  const { isSuperAdmin } = useSuperAdmin();

  const [tramites, setTramites] = useState<TramiteCatalogo[]>([]);
  const [tipos, setTipos] = useState<TipoTramite[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedTramite, setSelectedTramite] = useState<TramiteCatalogo | null>(null);
  const [filtroTipo, setFiltroTipo] = useState<number | null>(null);
  // Estado para sección de deshabilitados
  const [showDeshabilitados, setShowDeshabilitados] = useState(false);
  const [filtroTipoDeshabilitados, setFiltroTipoDeshabilitados] = useState<number | null>(null);
  const disabledSectionRef = useRef<HTMLDivElement>(null);

  // Cambiar filtro de deshabilitados sin perder scroll
  const handleFiltroDeshabilitadosChange = (tipoId: number | null) => {
    // Guardar referencia al elemento antes del cambio
    const sectionElement = disabledSectionRef.current;
    if (sectionElement) {
      const rect = sectionElement.getBoundingClientRect();
      const offsetFromTop = rect.top;

      setFiltroTipoDeshabilitados(tipoId);

      // Restaurar posición después del render
      requestAnimationFrame(() => {
        const newRect = sectionElement.getBoundingClientRect();
        const scrollAdjustment = newRect.top - offsetFromTop;
        window.scrollBy(0, scrollAdjustment);
      });
    } else {
      setFiltroTipoDeshabilitados(tipoId);
    }
  };

  const [formData, setFormData] = useState({
    nombre: '',
    descripcion: '',
    tipo_tramite_id: 0,
    icono: 'FileText',
    color: '#6366f1',
    requisitos: '',
    documentos_requeridos: '',
    tiempo_estimado_dias: 15,
    costo: '',
    orden: 0,
    activo: true
  });

  useEffect(() => {
    fetchData();
  }, [isSuperAdmin]);

  const fetchData = async () => {
    try {
      // Superadmin: usa catálogo global (sin municipio_id)
      // Supervisor: usa tipos habilitados para su municipio
      const [tramitesRes, tiposRes] = await Promise.all([
        tramitesApi.getCatalogo({ solo_activos: false }),
        isSuperAdmin
          ? tramitesApi.getTiposCatalogo({ solo_activos: false })
          : tramitesApi.getTipos({ solo_activos: false })
      ]);
      setTramites(tramitesRes.data);
      setTipos(tiposRes.data);
    } catch (error) {
      toast.error('Error al cargar los datos');
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const openSheet = (tramite: TramiteCatalogo | null = null) => {
    if (tramite) {
      // Obtener color del tipo si el trámite no tiene color propio
      const tipo = tipos.find(t => t.id === tramite.tipo_tramite_id);
      setFormData({
        nombre: tramite.nombre,
        descripcion: tramite.descripcion || '',
        tipo_tramite_id: tramite.tipo_tramite_id,
        icono: tramite.icono || 'FileText',
        color: tramite.color || tipo?.color || '#6366f1',
        requisitos: tramite.requisitos || '',
        documentos_requeridos: tramite.documentos_requeridos || '',
        tiempo_estimado_dias: tramite.tiempo_estimado_dias,
        costo: tramite.costo?.toString() || '',
        orden: tramite.orden,
        activo: tramite.activo
      });
      setSelectedTramite(tramite);
    } else {
      // Obtener color del tipo seleccionado
      const tipoId = filtroTipo || tipos[0]?.id;
      const tipo = tipos.find(t => t.id === tipoId);
      setFormData({
        nombre: '',
        descripcion: '',
        tipo_tramite_id: tipoId || 0,
        icono: 'FileText',
        color: tipo?.color || '#6366f1',
        requisitos: '',
        documentos_requeridos: '',
        tiempo_estimado_dias: 15,
        costo: '',
        orden: tramites.filter(t => t.tipo_tramite_id === tipoId).length,
        activo: true
      });
      setSelectedTramite(null);
    }
    setSheetOpen(true);
  };

  const closeSheet = () => {
    setSheetOpen(false);
    setSelectedTramite(null);
  };

  const handleSubmit = async () => {
    if (!formData.nombre.trim()) {
      toast.error('El nombre es requerido');
      return;
    }
    if (!formData.tipo_tramite_id) {
      toast.error('Selecciona un tipo de trámite');
      return;
    }

    setSaving(true);
    try {
      const dataToSend = {
        ...formData,
        costo: formData.costo ? parseFloat(formData.costo) : null,
      };

      if (selectedTramite) {
        await tramitesApi.updateTramite(selectedTramite.id, dataToSend);
        toast.success('Trámite actualizado');
      } else {
        await tramitesApi.createTramite(dataToSend);
        toast.success('Trámite creado');
      }
      fetchData();
      closeSheet();
    } catch (error) {
      toast.error('Error al guardar');
      console.error('Error:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await tramitesApi.deleteTramite(id);
      toast.success('Trámite desactivado');
      fetchData();
    } catch (error) {
      toast.error('Error al desactivar');
      console.error('Error:', error);
    }
  };

  // Deshabilitar un trámite (soft delete - pone activo=false)
  const handleDeshabilitar = async (tramite: TramiteCatalogo) => {
    try {
      await tramitesApi.updateTramite(tramite.id, { ...tramite, activo: false });
      toast.success(`"${tramite.nombre}" deshabilitado`);
      fetchData();
    } catch (error) {
      toast.error('Error al deshabilitar');
      console.error('Error:', error);
    }
  };

  // Habilitar un trámite deshabilitado
  const handleHabilitar = async (tramite: TramiteCatalogo) => {
    try {
      await tramitesApi.updateTramite(tramite.id, { ...tramite, activo: true });
      toast.success(`"${tramite.nombre}" habilitado nuevamente`);
      fetchData();
    } catch (error) {
      toast.error('Error al habilitar');
      console.error('Error:', error);
    }
  };

  // Filtrar trámites
  const filteredTramites = tramites.filter(t => {
    const matchSearch = !search ||
      t.nombre.toLowerCase().includes(search.toLowerCase()) ||
      t.descripcion?.toLowerCase().includes(search.toLowerCase());
    const matchTipo = !filtroTipo || t.tipo_tramite_id === filtroTipo;
    return matchSearch && matchTipo;
  });

  // Separar trámites activos y deshabilitados
  const tramitesActivos = filteredTramites.filter(t => t.activo);
  const tramitesDeshabilitados = filteredTramites.filter(t => !t.activo);

  // Obtener tipo de un trámite
  const getTipo = (tipoId: number) => tipos.find(t => t.id === tipoId);

  const tableColumns = [
    {
      key: 'nombre',
      header: 'Nombre',
      sortValue: (t: TramiteCatalogo) => t.nombre,
      render: (t: TramiteCatalogo) => {
        const tipo = getTipo(t.tipo_tramite_id);
        return (
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center"
              style={{ backgroundColor: t.color || tipo?.color || '#6366f1' }}
            >
              <span className="text-white scale-75">{getIcon(t.icono || tipo?.icono)}</span>
            </div>
            <div>
              <span className="font-medium">{t.nombre}</span>
              {tipo && (
                <p className="text-xs" style={{ color: theme.textSecondary }}>
                  {tipo.nombre}
                </p>
              )}
            </div>
          </div>
        );
      },
    },
    {
      key: 'tiempo',
      header: 'Tiempo',
      sortValue: (t: TramiteCatalogo) => t.tiempo_estimado_dias,
      render: (t: TramiteCatalogo) => (
        <span className="flex items-center gap-1" style={{ color: theme.textSecondary }}>
          <Clock className="h-3.5 w-3.5" />
          {t.tiempo_estimado_dias} días
        </span>
      ),
    },
    {
      key: 'costo',
      header: 'Costo',
      sortValue: (t: TramiteCatalogo) => t.costo || 0,
      render: (t: TramiteCatalogo) => (
        <span style={{ color: t.costo ? theme.text : '#10b981' }}>
          {t.costo ? `$${t.costo.toLocaleString()}` : 'Gratis'}
        </span>
      ),
    },
    {
      key: 'activo',
      header: 'Estado',
      sortValue: (t: TramiteCatalogo) => t.activo,
      render: (t: TramiteCatalogo) => <ABMBadge active={t.activo} />,
    },
  ];

  // Filtros secundarios - chips de tipos (en segunda línea)
  const renderSecondaryFilters = () => (
    <div className="grid grid-cols-5 sm:flex gap-1.5 w-full">
      {/* Botón Todos */}
      <button
        onClick={() => setFiltroTipo(null)}
        className="flex flex-col items-center justify-center py-2 rounded-xl transition-all h-[68px] sm:flex-1 sm:min-w-0"
        style={{
          background: filtroTipo === null ? theme.primary : theme.backgroundSecondary,
          border: `1px solid ${filtroTipo === null ? theme.primary : theme.border}`,
        }}
      >
        <FileText className="h-5 w-5" style={{ color: filtroTipo === null ? '#ffffff' : theme.primary }} />
        <span className="text-[9px] font-semibold leading-tight text-center mt-1" style={{ color: filtroTipo === null ? '#ffffff' : theme.text }}>
          Todos
        </span>
      </button>

      {/* Chips por tipo de trámite */}
      {tipos.filter(t => t.activo).map(tipo => {
        const isSelected = filtroTipo === tipo.id;
        const count = tramites.filter(t => t.tipo_tramite_id === tipo.id).length;
        return (
          <button
            key={tipo.id}
            onClick={() => setFiltroTipo(isSelected ? null : tipo.id)}
            title={tipo.nombre}
            className="flex flex-col items-center justify-center py-1.5 rounded-xl transition-all h-[68px] sm:flex-1 sm:min-w-0"
            style={{
              background: isSelected ? tipo.color : theme.backgroundSecondary,
              border: `1px solid ${isSelected ? tipo.color : theme.border}`,
            }}
          >
            <span className="text-[10px] font-bold leading-none" style={{ color: isSelected ? '#ffffff' : tipo.color }}>
              {count}
            </span>
            <span className="[&>svg]:h-5 [&>svg]:w-5 my-1" style={{ color: isSelected ? '#ffffff' : tipo.color }}>
              {getIcon(tipo.icono)}
            </span>
            <span className="text-[9px] font-medium leading-none text-center w-full truncate px-1" style={{ color: isSelected ? '#ffffff' : theme.text }}>
              {tipo.nombre.split(' ')[0]}
            </span>
          </button>
        );
      })}
    </div>
  );

  return (
    <ABMPage
      title="Catálogo de Trámites"
      icon={<BookOpen className="h-5 w-5" />}
      backLink="/gestion/ajustes"
      buttonLabel="Nuevo Trámite"
      onAdd={() => openSheet()}
      searchPlaceholder="Buscar trámites..."
      searchValue={search}
      onSearchChange={setSearch}
      loading={loading}
      isEmpty={filteredTramites.length === 0}
      emptyMessage={filtroTipo ? "No hay trámites en esta categoría" : "No hay trámites. Creá el primero con el botón + Nuevo Trámite"}
      sheetOpen={sheetOpen}
      sheetTitle={selectedTramite ? 'Editar Trámite' : 'Nuevo Trámite'}
      sheetDescription={selectedTramite ? 'Modifica los datos del trámite' : 'Completa los datos para crear un nuevo trámite'}
      onSheetClose={closeSheet}
      secondaryFilters={renderSecondaryFilters()}
      tableView={
        <ABMTable
          data={tramitesActivos}
          columns={tableColumns}
          keyExtractor={(t) => t.id}
          onRowClick={(t) => openSheet(t)}
          actions={(t) => (
            <>
              <ABMTableAction
                icon={<Edit className="h-4 w-4" />}
                onClick={() => openSheet(t)}
                title="Editar"
              />
              <ABMTableAction
                icon={<EyeOff className="h-4 w-4" />}
                onClick={() => handleDeshabilitar(t)}
                title="Deshabilitar"
                variant="danger"
              />
            </>
          )}
        />
      }
      disabledSection={
        tramitesDeshabilitados.length > 0 && (
          <div className="mt-8" ref={disabledSectionRef}>
            {/* Header estilo ABMPage */}
            <div
              className="px-5 py-3 rounded-xl relative overflow-hidden"
              style={{
                backgroundColor: theme.card,
                border: `1px solid ${theme.border}`,
              }}
            >
              <div className="flex items-center gap-2 sm:gap-3 flex-wrap sm:flex-nowrap">
                {/* Título con icono */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: 'rgba(239, 68, 68, 0.15)' }}
                  >
                    <EyeOff className="h-4 w-4" style={{ color: '#ef4444' }} />
                  </div>
                  <div>
                    <h2 className="text-base font-bold" style={{ color: theme.text }}>
                      Deshabilitados
                    </h2>
                    <p className="text-xs" style={{ color: theme.textSecondary }}>
                      {tramitesDeshabilitados.length} trámite{tramitesDeshabilitados.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>

                {/* Separador */}
                <div className="h-8 w-px hidden sm:block" style={{ backgroundColor: theme.border }} />

                {/* Toggle expandir/colapsar */}
                <button
                  onClick={() => setShowDeshabilitados(!showDeshabilitados)}
                  className="ml-auto flex items-center gap-2 px-3 py-2 rounded-lg transition-all hover:scale-105"
                  style={{
                    backgroundColor: theme.backgroundSecondary,
                    border: `1px solid ${theme.border}`,
                    color: theme.text,
                  }}
                >
                  <span className="text-sm font-medium">
                    {showDeshabilitados ? 'Ocultar' : 'Mostrar'}
                  </span>
                  <ChevronDown
                    className="h-4 w-4 transition-transform"
                    style={{
                      transform: showDeshabilitados ? 'rotate(180deg)' : 'rotate(0deg)',
                    }}
                  />
                </button>
              </div>

              {/* Chips de tipos para deshabilitados */}
              {showDeshabilitados && (
                <div className="mt-3 pt-3" style={{ borderTop: `1px solid ${theme.border}` }}>
                  <div className="grid grid-cols-5 sm:flex gap-1.5 w-full">
                    {/* Botón Todos */}
                    <button
                      onClick={() => handleFiltroDeshabilitadosChange(null)}
                      className="flex flex-col items-center justify-center py-1.5 rounded-lg transition-all h-[52px] sm:flex-1 sm:min-w-0"
                      style={{
                        background: filtroTipoDeshabilitados === null ? theme.primary : theme.backgroundSecondary,
                        border: `1px solid ${filtroTipoDeshabilitados === null ? theme.primary : theme.border}`,
                      }}
                    >
                      <FileText className="h-4 w-4" style={{ color: filtroTipoDeshabilitados === null ? '#ffffff' : theme.primary }} />
                      <span className="text-[8px] font-semibold leading-tight text-center mt-0.5" style={{ color: filtroTipoDeshabilitados === null ? '#ffffff' : theme.text }}>
                        Todos
                      </span>
                    </button>

                    {/* Chips por tipo de trámite */}
                    {tipos.filter(t => t.activo).map(tipo => {
                      const isSelected = filtroTipoDeshabilitados === tipo.id;
                      const countDeshabilitados = tramitesDeshabilitados.filter(t => t.tipo_tramite_id === tipo.id).length;
                      if (countDeshabilitados === 0) return null;
                      return (
                        <button
                          key={tipo.id}
                          onClick={() => handleFiltroDeshabilitadosChange(isSelected ? null : tipo.id)}
                          title={tipo.nombre}
                          className="flex flex-col items-center justify-center py-1 rounded-lg transition-all h-[52px] sm:flex-1 sm:min-w-0"
                          style={{
                            background: isSelected ? tipo.color : theme.backgroundSecondary,
                            border: `1px solid ${isSelected ? tipo.color : theme.border}`,
                          }}
                        >
                          <span className="text-[9px] font-bold leading-none" style={{ color: isSelected ? '#ffffff' : tipo.color }}>
                            {countDeshabilitados}
                          </span>
                          <span className="[&>svg]:h-4 [&>svg]:w-4 my-0.5" style={{ color: isSelected ? '#ffffff' : tipo.color }}>
                            {getIcon(tipo.icono)}
                          </span>
                          <span className="text-[8px] font-medium leading-none text-center w-full truncate px-0.5" style={{ color: isSelected ? '#ffffff' : theme.text }}>
                            {tipo.nombre.split(' ')[0]}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Tabla de trámites deshabilitados */}
            {showDeshabilitados && (
              <div
                className="mt-2 rounded-xl overflow-hidden"
                style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
              >
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr style={{ backgroundColor: theme.backgroundSecondary }}>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: theme.textSecondary }}>
                          Nombre
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider hidden sm:table-cell" style={{ color: theme.textSecondary }}>
                          Tipo
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider hidden md:table-cell" style={{ color: theme.textSecondary }}>
                          Tiempo
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider" style={{ color: theme.textSecondary }}>
                          Acciones
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y" style={{ borderColor: theme.border }}>
                      {tramitesDeshabilitados.filter(t => !filtroTipoDeshabilitados || t.tipo_tramite_id === filtroTipoDeshabilitados).map((t, index) => {
                        const tipo = getTipo(t.tipo_tramite_id);
                        const tramiteColor = t.color || tipo?.color || '#6366f1';
                        const tramiteIcono = t.icono || tipo?.icono || 'FileText';

                        return (
                          <tr
                            key={t.id}
                            className="transition-colors hover:bg-opacity-50"
                            style={{
                              backgroundColor: index % 2 === 0 ? 'transparent' : `${theme.backgroundSecondary}50`,
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = `${theme.primary}10`;
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = index % 2 === 0 ? 'transparent' : `${theme.backgroundSecondary}50`;
                            }}
                          >
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <div
                                  className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 grayscale"
                                  style={{ backgroundColor: tramiteColor }}
                                >
                                  <span className="text-white text-sm">{getIcon(tramiteIcono)}</span>
                                </div>
                                <div>
                                  <p className="font-medium text-sm" style={{ color: theme.text }}>{t.nombre}</p>
                                  <p className="text-xs sm:hidden" style={{ color: theme.textSecondary }}>{tipo?.nombre}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 hidden sm:table-cell">
                              <span className="text-sm" style={{ color: tipo?.color }}>{tipo?.nombre}</span>
                            </td>
                            <td className="px-4 py-3 hidden md:table-cell">
                              <span className="text-sm" style={{ color: theme.textSecondary }}>
                                {t.tiempo_estimado_dias} días
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={() => handleHabilitar(t)}
                                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-all hover:scale-105 text-sm font-medium"
                                  style={{
                                    backgroundColor: 'rgba(16, 185, 129, 0.15)',
                                    color: '#10b981',
                                  }}
                                  title="Habilitar"
                                >
                                  <RotateCcw className="h-3.5 w-3.5" />
                                  <span className="hidden sm:inline">Habilitar</span>
                                </button>
                                <button
                                  onClick={() => openSheet(t)}
                                  className="p-2 rounded-lg transition-all hover:scale-110"
                                  style={{ color: theme.primary }}
                                  title="Editar"
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.backgroundColor = `${theme.primary}20`;
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor = 'transparent';
                                  }}
                                >
                                  <Edit className="h-4 w-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )
      }
      sheetFooter={
        <ABMSheetFooter
          onCancel={closeSheet}
          onSave={handleSubmit}
          saving={saving}
        />
      }
      sheetContent={
        <form className="space-y-4">
          {/* Tipo de trámite */}
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: theme.textSecondary }}>
              Tipo de Trámite <span className="text-red-500">*</span>
            </label>
            <select
              value={formData.tipo_tramite_id}
              onChange={(e) => setFormData({ ...formData, tipo_tramite_id: Number(e.target.value) })}
              className="w-full px-3 py-2 rounded-lg"
              style={{
                backgroundColor: theme.backgroundSecondary,
                border: `1px solid ${theme.border}`,
                color: theme.text,
              }}
            >
              <option value={0}>Seleccionar tipo...</option>
              {tipos.filter(t => t.activo).map(tipo => (
                <option key={tipo.id} value={tipo.id}>
                  {tipo.nombre}
                </option>
              ))}
            </select>
          </div>

          <ABMInput
            label="Nombre"
            required
            value={formData.nombre}
            onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
            placeholder="Ej: Habilitación comercial"
          />

          <ABMTextarea
            label="Descripción"
            value={formData.descripcion}
            onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
            placeholder="Descripción del trámite"
            rows={2}
          />

          {/* Selector de icono */}
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: theme.textSecondary }}>
              Icono
            </label>
            <div className="flex flex-wrap gap-1.5 max-h-[180px] overflow-y-auto p-2 rounded-lg" style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}` }}>
              {ICONOS_DISPONIBLES.map(iconName => (
                <button
                  key={iconName}
                  type="button"
                  onClick={() => setFormData({ ...formData, icono: iconName })}
                  className="w-9 h-9 rounded-lg flex items-center justify-center transition-all hover:scale-110"
                  style={{
                    backgroundColor: formData.icono === iconName ? formData.color : theme.card,
                    color: formData.icono === iconName ? '#fff' : theme.textSecondary,
                    border: formData.icono === iconName ? 'none' : `1px solid ${theme.border}`,
                    boxShadow: formData.icono === iconName ? `0 2px 8px ${formData.color}40` : 'none',
                  }}
                  title={iconName}
                >
                  {getIcon(iconName, "h-4 w-4")}
                </button>
              ))}
            </div>
          </div>

          {/* Selector de color */}
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: theme.textSecondary }}>
              Color
            </label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={formData.color}
                onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                className="w-12 h-12 rounded-lg cursor-pointer border-0"
              />
              <div
                className="flex-1 h-12 rounded-lg flex items-center justify-center gap-2"
                style={{ backgroundColor: formData.color }}
              >
                <span className="text-white">{getIcon(formData.icono)}</span>
                <span className="text-white font-medium text-sm">Vista previa</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <ABMInput
              label="Tiempo estimado (días)"
              type="number"
              value={formData.tiempo_estimado_dias}
              onChange={(e) => setFormData({ ...formData, tiempo_estimado_dias: Number(e.target.value) })}
              min={1}
            />
            <ABMInput
              label="Costo (opcional)"
              type="number"
              value={formData.costo}
              onChange={(e) => setFormData({ ...formData, costo: e.target.value })}
              placeholder="0 = Gratis"
              min={0}
              step={0.01}
            />
          </div>

          <ABMTextarea
            label="Requisitos"
            value={formData.requisitos}
            onChange={(e) => setFormData({ ...formData, requisitos: e.target.value })}
            placeholder="Lista de requisitos para el trámite..."
            rows={3}
          />

          <ABMTextarea
            label="Documentos requeridos"
            value={formData.documentos_requeridos}
            onChange={(e) => setFormData({ ...formData, documentos_requeridos: e.target.value })}
            placeholder="Lista de documentos necesarios..."
            rows={3}
          />

          <div className="grid grid-cols-2 gap-4">
            <ABMInput
              label="Orden"
              type="number"
              value={formData.orden}
              onChange={(e) => setFormData({ ...formData, orden: Number(e.target.value) })}
              min={0}
            />
            <div className="flex items-center pt-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.activo}
                  onChange={(e) => setFormData({ ...formData, activo: e.target.checked })}
                  className="w-4 h-4 rounded"
                />
                <span className="text-sm" style={{ color: theme.textSecondary }}>
                  Activo
                </span>
              </label>
            </div>
          </div>
        </form>
      }
    >
      {/* Vista de cards - Solo trámites activos */}
      {tramitesActivos.map((t) => {
        const tipo = getTipo(t.tipo_tramite_id);
        // Usar color del trámite si tiene, sino el del tipo
        const tramiteColor = t.color || tipo?.color || '#6366f1';
        // Usar icono del trámite si tiene, sino el del tipo
        const tramiteIcono = t.icono || tipo?.icono || 'FileText';

        return (
          <div
            key={t.id}
            onClick={() => openSheet(t)}
            className="group relative rounded-2xl cursor-pointer overflow-hidden abm-card-hover"
            style={{
              backgroundColor: theme.card,
              border: `1px solid ${theme.border}`,
            }}
          >
            {/* Fondo con gradiente sutil */}
            <div
              className="absolute inset-0 opacity-[0.08] group-hover:opacity-[0.15] transition-opacity duration-500"
              style={{
                background: `
                  radial-gradient(ellipse at top right, ${tramiteColor}60 0%, transparent 50%),
                  radial-gradient(ellipse at bottom left, ${tramiteColor}40 0%, transparent 50%)
                `,
              }}
            />

            {/* Contenido */}
            <div className="relative z-10 p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center shadow-lg transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3"
                    style={{
                      backgroundColor: tramiteColor,
                      boxShadow: `0 4px 14px ${tramiteColor}40`,
                    }}
                  >
                    <span className="text-white">{getIcon(tramiteIcono)}</span>
                  </div>
                  <div className="ml-4">
                    <p className="font-semibold text-lg" style={{ color: theme.text }}>
                      {t.nombre}
                    </p>
                    {tipo && (
                      <div className="flex items-center gap-1 text-sm" style={{ color: theme.textSecondary }}>
                        <span>{tipo.nombre}</span>
                      </div>
                    )}
                  </div>
                </div>
                <ABMBadge active={t.activo} />
              </div>

              {t.descripcion && (
                <p className="text-sm mt-3 line-clamp-2" style={{ color: theme.textSecondary }}>
                  {t.descripcion}
                </p>
              )}

              {/* Info */}
              <div className="flex items-center gap-4 mt-4 text-sm" style={{ color: theme.textSecondary }}>
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {t.tiempo_estimado_dias} días
                </span>
                {t.costo ? (
                  <span className="flex items-center gap-1">
                    <DollarSign className="h-3.5 w-3.5" />
                    ${t.costo.toLocaleString()}
                  </span>
                ) : (
                  <span className="text-green-600 font-medium">Gratis</span>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between mt-4 pt-3" style={{ borderTop: `1px solid ${theme.border}` }}>
                <span
                  className="text-xs px-2.5 py-1 rounded-full font-medium"
                  style={{
                    backgroundColor: `${tramiteColor}20`,
                    color: tramiteColor,
                  }}
                >
                  Orden: {t.orden}
                </span>
                <ABMCardActions
                  onEdit={() => openSheet(t)}
                  onDelete={() => handleDeshabilitar(t)}
                />
              </div>
            </div>
          </div>
        );
      })}
    </ABMPage>
  );
}
