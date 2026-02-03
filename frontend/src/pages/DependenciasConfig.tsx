import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Building2, FolderKanban, FileText, Save, RefreshCw,
  Check, X, Plus, ChevronDown, ChevronUp, AlertCircle, Pencil, MapPin,
  Eye, ClipboardList, FileCheck, BookOpen
} from 'lucide-react';
import { toast } from 'sonner';
import { dependenciasApi, categoriasApi, tramitesApi } from '../lib/api';
import { useTheme } from '../contexts/ThemeContext';
import { useSuperAdmin } from '../hooks/useSuperAdmin';
import { DynamicIcon } from '../components/ui/DynamicIcon';
import { StickyPageHeader, FilterChipRow, FilterChip } from '../components/ui/StickyPageHeader';
import { MapPicker } from '../components/ui/MapPicker';

interface Dependencia {
  id: number;
  nombre: string;
  codigo: string;
  descripcion: string;
  tipo_gestion: 'RECLAMO' | 'TRAMITE' | 'AMBOS';
  horario_atencion: string;
  direccion: string;
  latitud: number | null;
  longitud: number | null;
  activo: boolean;
  orden: number;
}

interface MunicipioDependencia {
  id: number;
  municipio_id: number;
  dependencia_id: number;
  nombre: string;
  codigo: string;
  tipo_gestion: string;
  activo: boolean;
  orden: number;
  categorias_count: number;
  tipos_tramite_count: number;
  // Campos locales (pueden venir del detalle)
  direccion_local?: string;
  localidad_local?: string;
  telefono_local?: string;
  email_local?: string;
  horario_atencion_local?: string;
  latitud_local?: number | null;
  longitud_local?: number | null;
}

interface MunicipioDependenciaDetail extends MunicipioDependencia {
  dependencia: Dependencia;
}

interface Categoria {
  id: number;
  nombre: string;
  icono: string;
  color: string;
  descripcion?: string;
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
  descripcion?: string;
  tipo_tramite_id: number;
  tipo_tramite?: TipoTramite;
  icono?: string;
  color?: string;
  activo: boolean;
}

// Tab principal: Dependencias | Categorías | Trámites
type MainTab = 'dependencias' | 'categorias' | 'tramites';

interface AsignacionCategoria {
  id: number;
  categoria_id: number;
  categoria: Categoria;
}

interface AsignacionTipoTramite {
  id: number;
  tipo_tramite_id: number;
  tipo_tramite: TipoTramite;
}

interface NominatimResult {
  display_name: string;
  lat: string;
  lon: string;
  address?: {
    road?: string;
    house_number?: string;
    suburb?: string;
    city?: string;
    town?: string;
    state?: string;
    postcode?: string;
  };
}

type FilterType = 'todos' | 'reclamos' | 'tramites';

export default function DependenciasConfig() {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const { isSuperAdmin } = useSuperAdmin();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Tab principal activo
  const [mainTab, setMainTab] = useState<MainTab>('dependencias');

  // Datos
  const [dependenciasMunicipio, setDependenciasMunicipio] = useState<MunicipioDependencia[]>([]);
  const [catalogoGlobal, setCatalogoGlobal] = useState<Dependencia[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [tiposTramite, setTiposTramite] = useState<TipoTramite[]>([]);
  const [tramitesCatalogo, setTramitesCatalogo] = useState<Tramite[]>([]);

  // IDs habilitados para el municipio
  const [categoriasHabilitadas, setCategoriasHabilitadas] = useState<Set<number>>(new Set());
  const [tramitesHabilitados, setTramitesHabilitados] = useState<Set<number>>(new Set());

  // Filtro activo
  const [filtroActivo, setFiltroActivo] = useState<FilterType>('todos');
  const [searchTerm, setSearchTerm] = useState('');

  // UI State
  const [expandedDep, setExpandedDep] = useState<number | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedToAdd, setSelectedToAdd] = useState<number[]>([]);
  const [editingDep, setEditingDep] = useState<MunicipioDependenciaDetail | null>(null);

  // Asignaciones para la dependencia expandida
  const [categoriasAsignadas, setCategoriasAsignadas] = useState<number[]>([]);
  const [tiposTramiteAsignados, setTiposTramiteAsignados] = useState<number[]>([]);

  // Form de edición
  const [editForm, setEditForm] = useState({
    direccion_local: '',
    localidad_local: '',
    telefono_local: '',
    email_local: '',
    horario_atencion_local: '',
    latitud_local: null as number | null,
    longitud_local: null as number | null,
  });

  // Búsqueda de direcciones con Nominatim
  const [addressSearch, setAddressSearch] = useState('');
  const [addressResults, setAddressResults] = useState<NominatimResult[]>([]);
  const [searchingAddress, setSearchingAddress] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      if (isSuperAdmin) {
        // Superadmin: solo cargar catálogo global (maestros)
        const [catalogoRes, categoriasRes, tiposRes, tramitesRes] = await Promise.all([
          dependenciasApi.getCatalogo(),
          categoriasApi.getCatalogo(),  // Catálogo maestro de categorías
          tramitesApi.getTiposCatalogo(),  // Catálogo maestro de tipos
          tramitesApi.getCatalogo(),  // Catálogo maestro de trámites
        ]);
        setCatalogoGlobal(catalogoRes.data);
        setCategorias(categoriasRes.data);
        setTiposTramite(tiposRes.data);
        setTramitesCatalogo(tramitesRes.data);
        setDependenciasMunicipio([]); // No aplica para superadmin
        // Superadmin no tiene habilitaciones
        setCategoriasHabilitadas(new Set());
        setTramitesHabilitados(new Set());
      } else {
        // Supervisor: cargar dependencias del municipio + catálogo para habilitar
        const [
          muniDepsRes, catalogoRes, categoriasRes, tiposRes, tramitesRes,
          catsHabilitadasRes, tramHabilitadosRes
        ] = await Promise.all([
          dependenciasApi.getMunicipio(),
          dependenciasApi.getCatalogo({ activo: true }),
          categoriasApi.getCatalogo(),  // Catálogo maestro (TODAS las categorías)
          tramitesApi.getTiposCatalogo(),  // Catálogo maestro de tipos de trámite
          tramitesApi.getCatalogo(),  // Catálogo maestro de trámites
          categoriasApi.getHabilitadas(),  // IDs de categorías habilitadas
          tramitesApi.getHabilitados(),  // IDs de trámites habilitados
        ]);
        setDependenciasMunicipio(muniDepsRes.data);
        setCatalogoGlobal(catalogoRes.data);
        setCategorias(categoriasRes.data);
        setTiposTramite(tiposRes.data);
        setTramitesCatalogo(tramitesRes.data);
        setCategoriasHabilitadas(new Set(catsHabilitadasRes.data));
        setTramitesHabilitados(new Set(tramHabilitadosRes.data));
      }
    } catch (error) {
      console.error('Error al cargar datos:', error);
      toast.error('Error al cargar la configuracion');
    } finally {
      setLoading(false);
    }
  }, [isSuperAdmin]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Búsqueda de direcciones con Nominatim
  const searchAddress = useCallback(async (query: string) => {
    if (query.length < 3) {
      setAddressResults([]);
      return;
    }

    setSearchingAddress(true);
    try {
      // Agregar contexto de Buenos Aires para mejores resultados
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}, Buenos Aires, Argentina&limit=5&addressdetails=1`,
        { headers: { 'Accept-Language': 'es' } }
      );
      const data = await response.json();
      setAddressResults(data);
    } catch (error) {
      console.error('Error buscando direccion:', error);
    } finally {
      setSearchingAddress(false);
    }
  }, []);

  // Debounce para búsqueda de direcciones
  useEffect(() => {
    const timer = setTimeout(() => {
      if (addressSearch) {
        searchAddress(addressSearch);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [addressSearch, searchAddress]);

  const selectAddress = (result: NominatimResult) => {
    const addr = result.address;
    let direccion = '';
    if (addr?.road) {
      direccion = addr.road;
      if (addr.house_number) direccion += ` ${addr.house_number}`;
    }

    setEditForm(prev => ({
      ...prev,
      direccion_local: direccion || result.display_name.split(',')[0],
      localidad_local: addr?.suburb || addr?.city || addr?.town || '',
      latitud_local: parseFloat(result.lat),
      longitud_local: parseFloat(result.lon),
    }));
    setAddressSearch('');
    setAddressResults([]);
  };

  // Cargar asignaciones cuando se expande una dependencia
  const loadAsignaciones = async (muniDepId: number) => {
    try {
      const [catRes, tiposRes] = await Promise.all([
        dependenciasApi.getCategorias(muniDepId),
        dependenciasApi.getTiposTramite(muniDepId),
      ]);
      setCategoriasAsignadas(catRes.data.map((a: AsignacionCategoria) => a.categoria_id));
      setTiposTramiteAsignados(tiposRes.data.map((a: AsignacionTipoTramite) => a.tipo_tramite_id));
    } catch (error) {
      console.error('Error al cargar asignaciones:', error);
    }
  };

  const toggleExpand = async (muniDepId: number) => {
    if (expandedDep === muniDepId) {
      setExpandedDep(null);
      setCategoriasAsignadas([]);
      setTiposTramiteAsignados([]);
    } else {
      setExpandedDep(muniDepId);
      await loadAsignaciones(muniDepId);
    }
  };

  const toggleCategoria = (catId: number) => {
    setCategoriasAsignadas(prev =>
      prev.includes(catId)
        ? prev.filter(id => id !== catId)
        : [...prev, catId]
    );
  };

  const toggleTipoTramite = (tipoId: number) => {
    setTiposTramiteAsignados(prev =>
      prev.includes(tipoId)
        ? prev.filter(id => id !== tipoId)
        : [...prev, tipoId]
    );
  };

  const saveAsignaciones = async () => {
    if (!expandedDep) return;

    setSaving(true);
    try {
      await Promise.all([
        dependenciasApi.asignarCategorias(expandedDep, categoriasAsignadas),
        dependenciasApi.asignarTiposTramite(expandedDep, tiposTramiteAsignados),
      ]);
      toast.success('Asignaciones guardadas');
      await fetchData();
    } catch (error) {
      console.error('Error al guardar:', error);
      toast.error('Error al guardar las asignaciones');
    } finally {
      setSaving(false);
    }
  };

  const habilitarDependencias = async () => {
    if (selectedToAdd.length === 0) return;

    setSaving(true);
    try {
      await dependenciasApi.habilitarDependencias(selectedToAdd);
      toast.success(`${selectedToAdd.length} dependencia(s) habilitada(s)`);
      setShowAddModal(false);
      setSelectedToAdd([]);
      await fetchData();
    } catch (error) {
      console.error('Error al habilitar:', error);
      toast.error('Error al habilitar dependencias');
    } finally {
      setSaving(false);
    }
  };

  // Abrir modal de edición
  const openEditModal = async (dep: MunicipioDependencia) => {
    try {
      // Cargar detalles completos
      const response = await dependenciasApi.getOneMunicipio(dep.id);
      const detail = response.data as MunicipioDependenciaDetail;
      setEditingDep(detail);

      // Inicializar form con datos existentes
      setEditForm({
        direccion_local: detail.direccion_local || '',
        localidad_local: detail.localidad_local || '',
        telefono_local: detail.telefono_local || '',
        email_local: detail.email_local || '',
        horario_atencion_local: detail.horario_atencion_local || '',
        latitud_local: detail.latitud_local || null,
        longitud_local: detail.longitud_local || null,
      });

      setShowEditModal(true);
    } catch (error) {
      console.error('Error al cargar detalles:', error);
      toast.error('Error al cargar la dependencia');
    }
  };

  const saveEdit = async () => {
    if (!editingDep) return;

    setSaving(true);
    try {
      await dependenciasApi.updateMunicipio(editingDep.id, editForm);
      toast.success('Dependencia actualizada');
      setShowEditModal(false);
      setEditingDep(null);
      await fetchData();
    } catch (error) {
      console.error('Error al guardar:', error);
      toast.error('Error al guardar los cambios');
    } finally {
      setSaving(false);
    }
  };

  const handleMapClick = (coords: { lat: number; lng: number }) => {
    setEditForm(prev => ({
      ...prev,
      latitud_local: coords.lat,
      longitud_local: coords.lng,
    }));
  };

  // Toggle categoría habilitada/deshabilitada
  const toggleCategoriaHabilitada = async (categoriaId: number) => {
    const isHabilitada = categoriasHabilitadas.has(categoriaId);
    setSaving(true);
    try {
      if (isHabilitada) {
        await categoriasApi.deshabilitar(categoriaId);
        setCategoriasHabilitadas(prev => {
          const next = new Set(prev);
          next.delete(categoriaId);
          return next;
        });
        toast.success('Categoría deshabilitada');
      } else {
        await categoriasApi.habilitar(categoriaId);
        setCategoriasHabilitadas(prev => new Set([...prev, categoriaId]));
        toast.success('Categoría habilitada');
      }
    } catch (error) {
      console.error('Error al cambiar estado:', error);
      toast.error('Error al cambiar el estado de la categoría');
    } finally {
      setSaving(false);
    }
  };

  // Toggle trámite habilitado/deshabilitado
  const toggleTramiteHabilitado = async (tramiteId: number) => {
    const isHabilitado = tramitesHabilitados.has(tramiteId);
    setSaving(true);
    try {
      if (isHabilitado) {
        await tramitesApi.deshabilitarTramite(tramiteId);
        setTramitesHabilitados(prev => {
          const next = new Set(prev);
          next.delete(tramiteId);
          return next;
        });
        toast.success('Trámite deshabilitado');
      } else {
        await tramitesApi.habilitarTramite(tramiteId);
        setTramitesHabilitados(prev => new Set([...prev, tramiteId]));
        toast.success('Trámite habilitado');
      }
    } catch (error) {
      console.error('Error al cambiar estado:', error);
      toast.error('Error al cambiar el estado del trámite');
    } finally {
      setSaving(false);
    }
  };

  // Habilitar todas las categorías
  const habilitarTodasCategorias = async () => {
    setSaving(true);
    try {
      await categoriasApi.habilitarTodas();
      // Recargar datos
      const res = await categoriasApi.getHabilitadas();
      setCategoriasHabilitadas(new Set(res.data));
      toast.success('Todas las categorías habilitadas');
    } catch (error) {
      console.error('Error:', error);
      toast.error('Error al habilitar categorías');
    } finally {
      setSaving(false);
    }
  };

  // Habilitar todos los trámites
  const habilitarTodosTramites = async () => {
    setSaving(true);
    try {
      await tramitesApi.habilitarTodosTramites();
      // Recargar datos
      const res = await tramitesApi.getHabilitados();
      setTramitesHabilitados(new Set(res.data));
      toast.success('Todos los trámites habilitados');
    } catch (error) {
      console.error('Error:', error);
      toast.error('Error al habilitar trámites');
    } finally {
      setSaving(false);
    }
  };

  // Agrupar trámites por tipo
  const tramitesPorTipo = tramitesCatalogo.reduce((acc, tramite) => {
    const tipoId = tramite.tipo_tramite_id;
    if (!acc[tipoId]) {
      acc[tipoId] = [];
    }
    acc[tipoId].push(tramite);
    return acc;
  }, {} as Record<number, Tramite[]>);

  // Dependencias del catálogo que no están habilitadas (solo para supervisor)
  const dependenciasNoHabilitadas = catalogoGlobal.filter(
    dep => !dependenciasMunicipio.some(md => md.dependencia_id === dep.id)
  );

  // Datos a mostrar: catálogo para superadmin, municipio para supervisor
  const datosParaMostrar = isSuperAdmin ? catalogoGlobal : dependenciasMunicipio;

  // Filtrar dependencias según el filtro activo y búsqueda
  const dependenciasFiltradas = datosParaMostrar.filter(dep => {
    // Filtro por tipo
    if (filtroActivo === 'reclamos' && dep.tipo_gestion !== 'RECLAMO' && dep.tipo_gestion !== 'AMBOS') {
      return false;
    }
    if (filtroActivo === 'tramites' && dep.tipo_gestion !== 'TRAMITE' && dep.tipo_gestion !== 'AMBOS') {
      return false;
    }
    // Filtro por búsqueda
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      return dep.nombre.toLowerCase().includes(term) ||
             (dep.codigo && dep.codigo.toLowerCase().includes(term));
    }
    return true;
  });

  // Conteos para los chips de filtro
  const conteos = {
    todos: datosParaMostrar.length,
    reclamos: datosParaMostrar.filter(d => d.tipo_gestion === 'RECLAMO' || d.tipo_gestion === 'AMBOS').length,
    tramites: datosParaMostrar.filter(d => d.tipo_gestion === 'TRAMITE' || d.tipo_gestion === 'AMBOS').length,
  };

  const filterChips: FilterChip[] = [
    { key: 'reclamos', label: 'Reclamos', icon: <AlertCircle />, count: conteos.reclamos, color: '#3b82f6' },
    { key: 'tramites', label: 'Trámites', icon: <FileCheck />, count: conteos.tramites, color: '#8b5cf6' },
  ];

  const getTipoGestionBadge = (tipo: string) => {
    const colors: Record<string, { bg: string; text: string }> = {
      RECLAMO: { bg: 'bg-blue-100', text: 'text-blue-700' },
      TRAMITE: { bg: 'bg-purple-100', text: 'text-purple-700' },
      AMBOS: { bg: 'bg-green-100', text: 'text-green-700' },
    };
    const style = colors[tipo] || colors.AMBOS;
    return (
      <span className={`px-2 py-0.5 rounded text-xs font-medium ${style.bg} ${style.text}`}>
        {tipo}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: theme.background }}>
        <RefreshCw className="h-8 w-8 animate-spin" style={{ color: theme.primary }} />
      </div>
    );
  }

  // Títulos y acciones según el tab activo
  const getTabTitle = () => {
    if (isSuperAdmin) return "Catálogo Global";
    switch (mainTab) {
      case 'dependencias': return "Configuración del Municipio";
      case 'categorias': return "Categorías de Reclamos";
      case 'tramites': return "Trámites Habilitados";
    }
  };

  const getTabButtonLabel = () => {
    if (isSuperAdmin) return "Nueva";
    switch (mainTab) {
      case 'dependencias': return "Habilitar";
      case 'categorias': return "Habilitar Todas";
      case 'tramites': return "Habilitar Todos";
    }
  };

  const handleTabButtonClick = () => {
    if (mainTab === 'dependencias') {
      setShowAddModal(true);
    } else if (mainTab === 'categorias') {
      habilitarTodasCategorias();
    } else if (mainTab === 'tramites') {
      habilitarTodosTramites();
    }
  };

  // Conteos para tabs principales
  const mainTabCounts = {
    dependencias: dependenciasMunicipio.length,
    categorias: categoriasHabilitadas.size,
    tramites: tramitesHabilitados.size,
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: theme.background }}>
      {/* Header sticky */}
      <StickyPageHeader
        icon={isSuperAdmin ? <BookOpen className="h-5 w-5" /> : <Building2 className="h-5 w-5" />}
        title={getTabTitle()}
        backLink="/gestion/ajustes"
        searchPlaceholder={mainTab === 'dependencias' ? "Buscar dependencia..." : mainTab === 'categorias' ? "Buscar categoría..." : "Buscar trámite..."}
        searchValue={searchTerm}
        onSearchChange={setSearchTerm}
        buttonLabel={!isSuperAdmin ? getTabButtonLabel() : undefined}
        onButtonClick={!isSuperAdmin ? handleTabButtonClick : undefined}
        filterPanel={
          mainTab === 'dependencias' ? (
            <FilterChipRow
              chips={filterChips}
              activeKey={filtroActivo === 'todos' ? null : filtroActivo}
              onChipClick={(key) => setFiltroActivo((key || 'todos') as FilterType)}
              allLabel="Todas"
              allIcon={<Eye />}
            />
          ) : undefined
        }
      />

      {/* Tabs principales (solo para supervisor, no superadmin) */}
      {!isSuperAdmin && (
        <div className="sticky top-[60px] z-30 px-3 sm:px-6 py-2" style={{ backgroundColor: theme.background }}>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {[
              { key: 'dependencias' as MainTab, label: 'Dependencias', icon: <Building2 className="h-4 w-4" />, count: mainTabCounts.dependencias },
              { key: 'categorias' as MainTab, label: 'Categorías', icon: <FolderKanban className="h-4 w-4" />, count: mainTabCounts.categorias },
              { key: 'tramites' as MainTab, label: 'Trámites', icon: <FileText className="h-4 w-4" />, count: mainTabCounts.tramites },
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => { setMainTab(tab.key); setSearchTerm(''); }}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all whitespace-nowrap ${
                  mainTab === tab.key ? 'shadow-sm' : 'hover:opacity-80'
                }`}
                style={{
                  backgroundColor: mainTab === tab.key ? theme.primary : theme.backgroundSecondary,
                  color: mainTab === tab.key ? '#fff' : theme.text,
                  border: `1px solid ${mainTab === tab.key ? theme.primary : theme.border}`,
                }}
              >
                {tab.icon}
                <span>{tab.label}</span>
                <span
                  className={`ml-1 px-2 py-0.5 rounded-full text-xs ${
                    mainTab === tab.key ? 'bg-white/20' : ''
                  }`}
                  style={{
                    backgroundColor: mainTab !== tab.key ? theme.primary + '20' : undefined,
                    color: mainTab !== tab.key ? theme.primary : undefined,
                  }}
                >
                  {tab.count}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Contenido principal */}
      <div className="p-3 sm:p-6 space-y-3">

        {/* ============================================ */}
        {/* TAB: DEPENDENCIAS */}
        {/* ============================================ */}
        {mainTab === 'dependencias' && (
          <>
            {/* Info banner si no hay dependencias */}
            {datosParaMostrar.length === 0 && (
              <div
                className="flex items-center gap-3 p-4 rounded-xl"
                style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}` }}
              >
                <AlertCircle className="h-5 w-5 text-amber-500" />
                <p style={{ color: theme.textSecondary }}>
                  {isSuperAdmin
                    ? 'No hay dependencias en el catálogo. Haz clic en "Nueva" para crear una.'
                    : 'No hay dependencias habilitadas. Haz clic en "Habilitar" para agregar del catálogo.'}
                </p>
              </div>
            )}

            {/* Información del modo para superadmin */}
            {isSuperAdmin && datosParaMostrar.length > 0 && (
              <div
                className="flex items-center gap-3 p-3 rounded-xl text-sm"
                style={{ backgroundColor: theme.primary + '15', border: `1px solid ${theme.primary}30` }}
              >
                <BookOpen className="h-4 w-4 flex-shrink-0" style={{ color: theme.primary }} />
                <p style={{ color: theme.text }}>
                  <strong>Modo Catálogo:</strong> Estás gestionando las dependencias maestras que estarán disponibles para todos los municipios.
                </p>
              </div>
            )}

            {/* Lista de dependencias */}
            {dependenciasFiltradas.map(dep => {
          // Detectar si es item del catálogo (Dependencia) o del municipio (MunicipioDependencia)
          const isCatalogoItem = isSuperAdmin;
          const muniDep = dep as MunicipioDependencia;
          const catDep = dep as Dependencia;

          return (
            <div
              key={dep.id}
              className="rounded-xl overflow-hidden transition-shadow"
              style={{
                backgroundColor: theme.backgroundSecondary,
                border: `1px solid ${expandedDep === dep.id ? theme.primary : theme.border}`,
              }}
            >
              {/* Header de dependencia */}
              <div className="flex items-center justify-between p-4">
                <div
                  className={`flex items-center gap-3 flex-1 ${!isCatalogoItem ? 'cursor-pointer' : ''}`}
                  onClick={() => !isCatalogoItem && toggleExpand(dep.id)}
                >
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: theme.primary + '20' }}
                  >
                    {isCatalogoItem ? (
                      <BookOpen className="h-5 w-5" style={{ color: theme.primary }} />
                    ) : (
                      <Building2 className="h-5 w-5" style={{ color: theme.primary }} />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold truncate" style={{ color: theme.text }}>{dep.nombre}</h3>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {getTipoGestionBadge(dep.tipo_gestion)}
                      {isCatalogoItem ? (
                        <span className="text-xs" style={{ color: theme.textSecondary }}>
                          {catDep.codigo} • {catDep.activo ? 'Activo' : 'Inactivo'}
                        </span>
                      ) : (
                        <span className="text-xs" style={{ color: theme.textSecondary }}>
                          {muniDep.categorias_count} categorías / {muniDep.tipos_tramite_count} trámites
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  {/* Botón editar */}
                  {!isCatalogoItem && (
                    <button
                      onClick={(e) => { e.stopPropagation(); openEditModal(muniDep); }}
                      className="p-2 rounded-lg transition-colors hover:scale-105"
                      style={{ backgroundColor: theme.primary + '15' }}
                      title="Editar ubicación"
                    >
                      <Pencil className="h-4 w-4" style={{ color: theme.primary }} />
                    </button>
                  )}

                  {/* Botón editar catálogo (superadmin) */}
                  {isCatalogoItem && (
                    <button
                      onClick={(e) => { e.stopPropagation(); /* TODO: openEditCatalogoModal(catDep); */ toast.info('Edición de catálogo próximamente'); }}
                      className="p-2 rounded-lg transition-colors hover:scale-105"
                      style={{ backgroundColor: theme.primary + '15' }}
                      title="Editar dependencia"
                    >
                      <Pencil className="h-4 w-4" style={{ color: theme.primary }} />
                    </button>
                  )}

                  {/* Chevron para expandir (solo supervisor) */}
                  {!isCatalogoItem && (
                    <button
                      onClick={() => toggleExpand(dep.id)}
                      className="p-2 rounded-lg transition-colors"
                      style={{ backgroundColor: theme.background }}
                    >
                      {expandedDep === dep.id ? (
                        <ChevronUp className="h-5 w-5" style={{ color: theme.textSecondary }} />
                      ) : (
                        <ChevronDown className="h-5 w-5" style={{ color: theme.textSecondary }} />
                      )}
                    </button>
                  )}
                </div>
              </div>

              {/* Panel expandido - Asignaciones (solo para supervisor) */}
              {!isCatalogoItem && expandedDep === dep.id && (
                <div className="border-t p-4" style={{ borderColor: theme.border }}>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Categorías (solo si tipo_gestion es RECLAMO o AMBOS) */}
                    {(dep.tipo_gestion === 'RECLAMO' || dep.tipo_gestion === 'AMBOS') && (
                      <div>
                        <h4 className="flex items-center gap-2 font-medium mb-3" style={{ color: theme.text }}>
                          <FolderKanban className="h-4 w-4" style={{ color: theme.primary }} />
                          Categorías de Reclamos
                        </h4>
                        <div className="space-y-2 max-h-64 overflow-y-auto">
                          {categorias.map(cat => (
                            <label
                              key={cat.id}
                              className="flex items-center gap-3 p-2 rounded-lg cursor-pointer hover:bg-opacity-50 transition-colors"
                              style={{
                                backgroundColor: categoriasAsignadas.includes(cat.id)
                                  ? theme.primary + '15'
                                  : 'transparent',
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={categoriasAsignadas.includes(cat.id)}
                                onChange={() => toggleCategoria(cat.id)}
                                className="w-4 h-4 rounded"
                                style={{ accentColor: theme.primary }}
                              />
                              <DynamicIcon name={cat.icono || 'Folder'} size={18} color={cat.color || theme.primary} />
                              <span style={{ color: theme.text }}>{cat.nombre}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Tipos de Trámite (solo si tipo_gestion es TRAMITE o AMBOS) */}
                    {(dep.tipo_gestion === 'TRAMITE' || dep.tipo_gestion === 'AMBOS') && (
                      <div>
                        <h4 className="flex items-center gap-2 font-medium mb-3" style={{ color: theme.text }}>
                          <FileText className="h-4 w-4" style={{ color: theme.primary }} />
                          Tipos de Trámite
                        </h4>
                        <div className="space-y-2 max-h-64 overflow-y-auto">
                          {tiposTramite.map(tipo => (
                            <label
                              key={tipo.id}
                              className="flex items-center gap-3 p-2 rounded-lg cursor-pointer hover:bg-opacity-50 transition-colors"
                              style={{
                                backgroundColor: tiposTramiteAsignados.includes(tipo.id)
                                  ? theme.primary + '15'
                                  : 'transparent',
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={tiposTramiteAsignados.includes(tipo.id)}
                                onChange={() => toggleTipoTramite(tipo.id)}
                                className="w-4 h-4 rounded"
                                style={{ accentColor: theme.primary }}
                              />
                              <DynamicIcon name={tipo.icono || 'FileText'} size={18} color={tipo.color || theme.primary} />
                              <span style={{ color: theme.text }}>{tipo.nombre}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Botón guardar */}
                  <div className="flex justify-end mt-4 pt-4 border-t" style={{ borderColor: theme.border }}>
                    <button
                      onClick={saveAsignaciones}
                      disabled={saving}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-white transition-colors disabled:opacity-50"
                      style={{ backgroundColor: theme.primary }}
                    >
                      {saving ? (
                        <RefreshCw className="h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4" />
                      )}
                      Guardar Asignaciones
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}

            {/* Mensaje si no hay resultados filtrados */}
            {dependenciasFiltradas.length === 0 && datosParaMostrar.length > 0 && (
              <div
                className="text-center py-8 rounded-xl"
                style={{ backgroundColor: theme.backgroundSecondary }}
              >
                <p style={{ color: theme.textSecondary }}>
                  No se encontraron dependencias con los filtros aplicados
                </p>
              </div>
            )}
          </>
        )}

        {/* ============================================ */}
        {/* TAB: CATEGORÍAS */}
        {/* ============================================ */}
        {mainTab === 'categorias' && !isSuperAdmin && (
          <>
            {/* Info */}
            <div
              className="flex items-center gap-3 p-3 rounded-xl text-sm"
              style={{ backgroundColor: theme.primary + '15', border: `1px solid ${theme.primary}30` }}
            >
              <FolderKanban className="h-4 w-4 flex-shrink-0" style={{ color: theme.primary }} />
              <p style={{ color: theme.text }}>
                Selecciona qué categorías de reclamos están disponibles para tu municipio.
                Los ciudadanos verán solo las categorías habilitadas.
              </p>
            </div>

            {/* Lista de categorías */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {categorias
                .filter(cat => {
                  if (!searchTerm) return true;
                  return cat.nombre.toLowerCase().includes(searchTerm.toLowerCase());
                })
                .map(cat => {
                  const isHabilitada = categoriasHabilitadas.has(cat.id);
                  return (
                    <div
                      key={cat.id}
                      className="flex items-center justify-between p-4 rounded-xl transition-all cursor-pointer hover:shadow-md"
                      style={{
                        backgroundColor: isHabilitada ? `${cat.color || theme.primary}10` : theme.backgroundSecondary,
                        border: `2px solid ${isHabilitada ? (cat.color || theme.primary) : theme.border}`,
                        opacity: saving ? 0.7 : 1,
                      }}
                      onClick={() => !saving && toggleCategoriaHabilitada(cat.id)}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="w-10 h-10 rounded-lg flex items-center justify-center"
                          style={{ backgroundColor: (cat.color || theme.primary) + '20' }}
                        >
                          <DynamicIcon name={cat.icono || 'Folder'} size={20} color={cat.color || theme.primary} />
                        </div>
                        <div>
                          <h4 className="font-medium" style={{ color: theme.text }}>{cat.nombre}</h4>
                          {cat.descripcion && (
                            <p className="text-xs mt-0.5 line-clamp-1" style={{ color: theme.textSecondary }}>
                              {cat.descripcion}
                            </p>
                          )}
                        </div>
                      </div>
                      <div
                        className={`w-12 h-6 rounded-full p-1 transition-colors ${isHabilitada ? 'justify-end' : 'justify-start'}`}
                        style={{
                          backgroundColor: isHabilitada ? (cat.color || theme.primary) : theme.border,
                          display: 'flex',
                          alignItems: 'center',
                        }}
                        title={isHabilitada ? 'Categoría habilitada' : 'Categoría deshabilitada'}
                      >
                        <div
                          className="w-4 h-4 rounded-full bg-white shadow transition-transform"
                          style={{ transform: isHabilitada ? 'translateX(24px)' : 'translateX(0)' }}
                        />
                      </div>
                    </div>
                  );
                })}
            </div>

            {/* Resumen */}
            <div className="text-center text-sm" style={{ color: theme.textSecondary }}>
              {categoriasHabilitadas.size} de {categorias.length} categorías habilitadas
            </div>
          </>
        )}

        {/* ============================================ */}
        {/* TAB: TRÁMITES */}
        {/* ============================================ */}
        {mainTab === 'tramites' && !isSuperAdmin && (
          <>
            {/* Info */}
            <div
              className="flex items-center gap-3 p-3 rounded-xl text-sm"
              style={{ backgroundColor: theme.primary + '15', border: `1px solid ${theme.primary}30` }}
            >
              <FileText className="h-4 w-4 flex-shrink-0" style={{ color: theme.primary }} />
              <p style={{ color: theme.text }}>
                Selecciona qué trámites están disponibles para tu municipio.
                Agrupa por tipo de trámite para mejor organización.
              </p>
            </div>

            {/* Lista de trámites agrupados por tipo */}
            {tiposTramite.map(tipo => {
              const tramitesDelTipo = tramitesPorTipo[tipo.id] || [];
              const tramitesFiltrados = tramitesDelTipo.filter(t => {
                if (!searchTerm) return true;
                return t.nombre.toLowerCase().includes(searchTerm.toLowerCase());
              });

              if (tramitesFiltrados.length === 0) return null;

              const habilitadosEnTipo = tramitesFiltrados.filter(t => tramitesHabilitados.has(t.id)).length;

              return (
                <div key={tipo.id} className="space-y-2">
                  {/* Header del tipo */}
                  <div className="flex items-center gap-2 pt-2">
                    <DynamicIcon name={tipo.icono || 'FileText'} size={18} color={tipo.color || theme.primary} />
                    <h3 className="font-semibold" style={{ color: theme.text }}>{tipo.nombre}</h3>
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: theme.primary + '20', color: theme.primary }}>
                      {habilitadosEnTipo}/{tramitesFiltrados.length}
                    </span>
                  </div>

                  {/* Trámites del tipo */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-6">
                    {tramitesFiltrados.map(tramite => {
                      const isHabilitado = tramitesHabilitados.has(tramite.id);
                      return (
                        <div
                          key={tramite.id}
                          className="flex items-center justify-between p-3 rounded-lg transition-all cursor-pointer hover:shadow-sm"
                          style={{
                            backgroundColor: isHabilitado ? `${tipo.color || theme.primary}10` : theme.backgroundSecondary,
                            border: `1px solid ${isHabilitado ? (tipo.color || theme.primary) : theme.border}`,
                            opacity: saving ? 0.7 : 1,
                          }}
                          onClick={() => !saving && toggleTramiteHabilitado(tramite.id)}
                        >
                          <div className="flex-1 min-w-0">
                            <h4 className="font-medium text-sm truncate" style={{ color: theme.text }}>
                              {tramite.nombre}
                            </h4>
                          </div>
                          <div
                            className={`w-10 h-5 rounded-full p-0.5 transition-colors ml-2 flex-shrink-0`}
                            style={{
                              backgroundColor: isHabilitado ? (tipo.color || theme.primary) : theme.border,
                              display: 'flex',
                              alignItems: 'center',
                            }}
                            title={isHabilitado ? 'Trámite habilitado' : 'Trámite deshabilitado'}
                          >
                            <div
                              className="w-4 h-4 rounded-full bg-white shadow transition-transform"
                              style={{ transform: isHabilitado ? 'translateX(20px)' : 'translateX(0)' }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* Resumen */}
            <div className="text-center text-sm pt-4" style={{ color: theme.textSecondary }}>
              {tramitesHabilitados.size} de {tramitesCatalogo.length} trámites habilitados
            </div>
          </>
        )}

      </div>

      {/* Modal para agregar/crear dependencias */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div
            className="w-full max-w-lg rounded-2xl p-6 max-h-[80vh] overflow-y-auto"
            style={{ backgroundColor: theme.backgroundSecondary }}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold" style={{ color: theme.text }}>
                {isSuperAdmin ? 'Nueva Dependencia (Catálogo)' : 'Habilitar Dependencias'}
              </h2>
              <button
                onClick={() => { setShowAddModal(false); setSelectedToAdd([]); }}
                className="p-2 rounded-lg hover:bg-opacity-80"
                style={{ backgroundColor: theme.background }}
              >
                <X className="h-5 w-5" style={{ color: theme.textSecondary }} />
              </button>
            </div>

            {isSuperAdmin ? (
              /* Formulario para crear nueva dependencia en el catálogo */
              <div className="space-y-4">
                <p className="text-sm" style={{ color: theme.textSecondary }}>
                  Crear una nueva dependencia en el catálogo maestro. Esta dependencia estará disponible para que todos los municipios la habiliten.
                </p>

                <div
                  className="flex items-center gap-2 p-3 rounded-lg text-sm"
                  style={{ backgroundColor: theme.primary + '10', border: `1px solid ${theme.primary}30` }}
                >
                  <AlertCircle className="h-4 w-4" style={{ color: theme.primary }} />
                  <span style={{ color: theme.text }}>
                    Funcionalidad de creación próximamente disponible.
                  </span>
                </div>

                <div className="flex justify-end gap-3 pt-4">
                  <button
                    onClick={() => setShowAddModal(false)}
                    className="px-4 py-2 rounded-lg font-medium"
                    style={{ backgroundColor: theme.background, color: theme.text }}
                  >
                    Cerrar
                  </button>
                </div>
              </div>
            ) : (
              /* Lista de selección para habilitar dependencias (supervisor) */
              <>
                {dependenciasNoHabilitadas.length === 0 ? (
                  <p className="text-center py-8" style={{ color: theme.textSecondary }}>
                    Todas las dependencias del catálogo ya están habilitadas
                  </p>
                ) : (
                  <>
                    <p className="text-sm mb-4" style={{ color: theme.textSecondary }}>
                      Selecciona las dependencias que deseas habilitar para tu municipio:
                    </p>

                    <div className="space-y-2 mb-6">
                      {dependenciasNoHabilitadas.map(dep => (
                        <label
                          key={dep.id}
                          className="flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors"
                          style={{
                            backgroundColor: selectedToAdd.includes(dep.id)
                              ? theme.primary + '15'
                              : theme.background,
                            border: `1px solid ${selectedToAdd.includes(dep.id) ? theme.primary : theme.border}`,
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={selectedToAdd.includes(dep.id)}
                            onChange={() => {
                              setSelectedToAdd(prev =>
                                prev.includes(dep.id)
                                  ? prev.filter(id => id !== dep.id)
                                  : [...prev, dep.id]
                              );
                            }}
                            className="w-4 h-4 mt-1 rounded"
                            style={{ accentColor: theme.primary }}
                          />
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium" style={{ color: theme.text }}>{dep.nombre}</span>
                              {getTipoGestionBadge(dep.tipo_gestion)}
                            </div>
                            {dep.descripcion && (
                              <p className="text-sm mt-1" style={{ color: theme.textSecondary }}>
                                {dep.descripcion.slice(0, 100)}...
                              </p>
                            )}
                          </div>
                        </label>
                      ))}
                    </div>

                    <div className="flex justify-end gap-3">
                      <button
                        onClick={() => { setShowAddModal(false); setSelectedToAdd([]); }}
                        className="px-4 py-2 rounded-lg font-medium"
                        style={{ backgroundColor: theme.background, color: theme.text }}
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={habilitarDependencias}
                        disabled={saving || selectedToAdd.length === 0}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-white disabled:opacity-50"
                        style={{ backgroundColor: theme.primary }}
                      >
                        {saving ? (
                          <RefreshCw className="h-4 w-4 animate-spin" />
                        ) : (
                          <Check className="h-4 w-4" />
                        )}
                        Habilitar ({selectedToAdd.length})
                      </button>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Modal de edición con geolocalización */}
      {showEditModal && editingDep && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div
            className="w-full max-w-2xl rounded-2xl p-6 max-h-[90vh] overflow-y-auto"
            style={{ backgroundColor: theme.backgroundSecondary }}
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-bold" style={{ color: theme.text }}>
                  Editar Dependencia
                </h2>
                <p className="text-sm" style={{ color: theme.textSecondary }}>
                  {editingDep.nombre}
                </p>
              </div>
              <button
                onClick={() => { setShowEditModal(false); setEditingDep(null); }}
                className="p-2 rounded-lg hover:bg-opacity-80"
                style={{ backgroundColor: theme.background }}
              >
                <X className="h-5 w-5" style={{ color: theme.textSecondary }} />
              </button>
            </div>

            <div className="space-y-4">
              {/* Búsqueda de dirección */}
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: theme.text }}>
                  Buscar dirección
                </label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: theme.textSecondary }} />
                  <input
                    type="text"
                    value={addressSearch}
                    onChange={(e) => setAddressSearch(e.target.value)}
                    placeholder="Escribe una dirección para buscar..."
                    className="w-full pl-10 pr-4 py-2 rounded-lg text-sm"
                    style={{
                      backgroundColor: theme.background,
                      color: theme.text,
                      border: `1px solid ${theme.border}`,
                    }}
                  />
                  {searchingAddress && (
                    <RefreshCw className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin" style={{ color: theme.primary }} />
                  )}
                </div>

                {/* Resultados de búsqueda */}
                {addressResults.length > 0 && (
                  <div
                    className="mt-2 rounded-lg border max-h-48 overflow-y-auto"
                    style={{ backgroundColor: theme.background, borderColor: theme.border }}
                  >
                    {addressResults.map((result, idx) => (
                      <button
                        key={idx}
                        onClick={() => selectAddress(result)}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-opacity-50 transition-colors border-b last:border-b-0"
                        style={{ color: theme.text, borderColor: theme.border }}
                      >
                        {result.display_name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Campos de dirección manual */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: theme.text }}>
                    Dirección
                  </label>
                  <input
                    type="text"
                    value={editForm.direccion_local}
                    onChange={(e) => setEditForm(prev => ({ ...prev, direccion_local: e.target.value }))}
                    placeholder="Ej: Av. San Martín 123"
                    className="w-full px-3 py-2 rounded-lg text-sm"
                    style={{
                      backgroundColor: theme.background,
                      color: theme.text,
                      border: `1px solid ${theme.border}`,
                    }}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: theme.text }}>
                    Localidad
                  </label>
                  <input
                    type="text"
                    value={editForm.localidad_local}
                    onChange={(e) => setEditForm(prev => ({ ...prev, localidad_local: e.target.value }))}
                    placeholder="Ej: Centro"
                    className="w-full px-3 py-2 rounded-lg text-sm"
                    style={{
                      backgroundColor: theme.background,
                      color: theme.text,
                      border: `1px solid ${theme.border}`,
                    }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: theme.text }}>
                    Teléfono
                  </label>
                  <input
                    type="text"
                    value={editForm.telefono_local}
                    onChange={(e) => setEditForm(prev => ({ ...prev, telefono_local: e.target.value }))}
                    placeholder="Ej: (02352) 123456"
                    className="w-full px-3 py-2 rounded-lg text-sm"
                    style={{
                      backgroundColor: theme.background,
                      color: theme.text,
                      border: `1px solid ${theme.border}`,
                    }}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: theme.text }}>
                    Email
                  </label>
                  <input
                    type="email"
                    value={editForm.email_local}
                    onChange={(e) => setEditForm(prev => ({ ...prev, email_local: e.target.value }))}
                    placeholder="Ej: dependencia@municipio.gob.ar"
                    className="w-full px-3 py-2 rounded-lg text-sm"
                    style={{
                      backgroundColor: theme.background,
                      color: theme.text,
                      border: `1px solid ${theme.border}`,
                    }}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: theme.text }}>
                  Horario de atención
                </label>
                <input
                  type="text"
                  value={editForm.horario_atencion_local}
                  onChange={(e) => setEditForm(prev => ({ ...prev, horario_atencion_local: e.target.value }))}
                  placeholder="Ej: Lunes a Viernes de 8:00 a 14:00"
                  className="w-full px-3 py-2 rounded-lg text-sm"
                  style={{
                    backgroundColor: theme.background,
                    color: theme.text,
                    border: `1px solid ${theme.border}`,
                  }}
                />
              </div>

              {/* Coordenadas */}
              {editForm.latitud_local && editForm.longitud_local && (
                <div
                  className="flex items-center gap-2 p-3 rounded-lg"
                  style={{ backgroundColor: theme.primary + '10' }}
                >
                  <MapPin className="h-4 w-4" style={{ color: theme.primary }} />
                  <span className="text-sm" style={{ color: theme.text }}>
                    Ubicación: {editForm.latitud_local.toFixed(6)}, {editForm.longitud_local.toFixed(6)}
                  </span>
                </div>
              )}

              {/* Mapa */}
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: theme.text }}>
                  Ubicación en el mapa (clic para marcar)
                </label>
                <MapPicker
                  value={
                    editForm.latitud_local && editForm.longitud_local
                      ? { lat: editForm.latitud_local, lng: editForm.longitud_local }
                      : null
                  }
                  onChange={handleMapClick}
                  center={{ lat: -34.6373, lng: -60.4719 }} // Default: Chacabuco
                  zoom={14}
                  height="256px"
                />
              </div>
            </div>

            {/* Botones */}
            <div className="flex justify-end gap-3 mt-6 pt-4 border-t" style={{ borderColor: theme.border }}>
              <button
                onClick={() => { setShowEditModal(false); setEditingDep(null); }}
                className="px-4 py-2 rounded-lg font-medium"
                style={{ backgroundColor: theme.background, color: theme.text }}
              >
                Cancelar
              </button>
              <button
                onClick={saveEdit}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-white disabled:opacity-50"
                style={{ backgroundColor: theme.primary }}
              >
                {saving ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
