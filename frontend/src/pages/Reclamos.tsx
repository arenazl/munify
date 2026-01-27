import { useEffect, useState, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { MapPin, Calendar, Tag, UserPlus, Play, CheckCircle, XCircle, Clock, Eye, FileText, User, Users, FileCheck, FolderOpen, AlertTriangle, Zap, Droplets, TreeDeciduous, Trash2, Building2, X, Camera, Sparkles, Send, Lightbulb, CheckCircle2, Car, Construction, Bug, Leaf, Signpost, Recycle, Brush, Phone, Mail, Bell, BellOff, MessageCircle, Loader2, Wrench, Timer, TrendingUp, Search, ExternalLink, ShieldCheck, TrafficCone, CloudRain, Volume2, Dog, Fence, Home, PaintBucket, Footprints, Info, ArrowUpDown, CalendarDays } from 'lucide-react';
import { toast } from 'sonner';
import { reclamosApi, empleadosApi, categoriasApi, zonasApi, usersApi, dashboardApi, API_URL, API_BASE_URL, chatApi, clasificacionApi, dependenciasApi } from '../lib/api';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { ABMPage, ABMTextarea, ABMField, ABMFieldGrid, ABMInfoPanel, ABMCollapsible, ABMTable, FilterRowSkeleton } from '../components/ui/ABMPage';
import { Sheet } from '../components/ui/Sheet';
import { WizardModal } from '../components/ui/WizardModal';
import { MapPicker } from '../components/ui/MapPicker';
import { ModernSelect } from '../components/ui/ModernSelect';
import { ABMCardSkeleton } from '../components/ui/Skeleton';
import type { Reclamo, Empleado, EstadoReclamo, HistorialReclamo, Categoria, Zona, User as UserType } from '../types';

const estadoColors: Record<EstadoReclamo, { bg: string; text: string }> = {
  nuevo: { bg: '#6366f1', text: '#ffffff' },
  recibido: { bg: '#0891b2', text: '#ffffff' },
  asignado: { bg: '#3b82f6', text: '#ffffff' },
  en_proceso: { bg: '#f59e0b', text: '#ffffff' },
  pendiente_confirmacion: { bg: '#8b5cf6', text: '#ffffff' },
  resuelto: { bg: '#10b981', text: '#ffffff' },
  rechazado: { bg: '#ef4444', text: '#ffffff' },
};

const estadoLabels: Record<EstadoReclamo, string> = {
  nuevo: 'Nuevo',
  recibido: 'Recibido',
  asignado: 'Asignado',
  en_proceso: 'En Proceso',
  pendiente_confirmacion: 'Pendiente Confirmación',
  resuelto: 'Resuelto',
  rechazado: 'Rechazado',
};

// Helper para generar URL de imagen local basada en el nombre de la categoría
const getCategoryImageUrl = (nombre: string): string | null => {
  // Convertir nombre a filename seguro (igual que en el backend)
  const safeName = nombre.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Quitar acentos
    .replace(/[^\w\s-]/g, '')
    .replace(/[-\s]+/g, '_')
    .trim();

  return `${API_BASE_URL}/static/images/categorias/${safeName}.jpeg`;
};

// Función para obtener el icono del estado
const getEstadoIcon = (estado: EstadoReclamo): React.ReactNode => {
  switch (estado) {
    case 'nuevo': return <Sparkles className="h-3 w-3" />;
    case 'asignado': return <UserPlus className="h-3 w-3" />;
    case 'en_proceso': return <Play className="h-3 w-3" />;
    case 'resuelto': return <CheckCircle className="h-3 w-3" />;
    case 'rechazado': return <XCircle className="h-3 w-3" />;
    default: return null;
  }
};

// Iconos por categoría
const categoryIcons: Record<string, React.ReactNode> = {
  'alumbrado': <Zap className="h-5 w-5" />,
  'bache': <Construction className="h-5 w-5" />,
  'calle': <Construction className="h-5 w-5" />,
  'agua': <Droplets className="h-5 w-5" />,
  'cloaca': <Droplets className="h-5 w-5" />,
  'desague': <Droplets className="h-5 w-5" />,
  'arbolado': <TreeDeciduous className="h-5 w-5" />,
  'espacio': <Leaf className="h-5 w-5" />,
  'verde': <Leaf className="h-5 w-5" />,
  'basura': <Trash2 className="h-5 w-5" />,
  'residuo': <Recycle className="h-5 w-5" />,
  'recolec': <Recycle className="h-5 w-5" />,
  'limpieza': <Brush className="h-5 w-5" />,
  'transito': <Car className="h-5 w-5" />,
  'señal': <Signpost className="h-5 w-5" />,
  'plaga': <Bug className="h-5 w-5" />,
  'edificio': <Building2 className="h-5 w-5" />,
  'semaforo': <TrafficCone className="h-5 w-5" />,
  'inundacion': <CloudRain className="h-5 w-5" />,
  'ruido': <Volume2 className="h-5 w-5" />,
  'animal': <Dog className="h-5 w-5" />,
  'obra': <Construction className="h-5 w-5" />,
  'terreno': <Fence className="h-5 w-5" />,
  'usurpacion': <Home className="h-5 w-5" />,
  'vandalismo': <PaintBucket className="h-5 w-5" />,
  'vereda': <Footprints className="h-5 w-5" />,
  'default': <AlertTriangle className="h-5 w-5" />,
};

const DEFAULT_CATEGORY_COLOR = '#64748b'; // Color por defecto - los colores reales vienen de la DB

function getCategoryIcon(nombre: string): React.ReactNode {
  const key = nombre.toLowerCase();
  for (const [k, icon] of Object.entries(categoryIcons)) {
    if (key.includes(k)) return icon;
  }
  return categoryIcons.default;
}

// Placeholders dinámicos según categoría
const categoryPlaceholders: Record<string, { titulo: string; descripcion: string }> = {
  'alumbrado': { titulo: 'Ej: Luminaria apagada en esquina', descripcion: 'Ej: La luminaria frente a mi casa lleva 3 días sin funcionar. Es el poste #1234.' },
  'bache': { titulo: 'Ej: Bache peligroso en calle principal', descripcion: 'Ej: Hay un bache profundo de aprox. 50cm que ya dañó varios autos.' },
  'agua': { titulo: 'Ej: Pérdida de agua en vereda', descripcion: 'Ej: Hay agua saliendo de una cañería rota hace 2 días, se está formando un charco grande.' },
  'cloaca': { titulo: 'Ej: Desborde de cloaca en esquina', descripcion: 'Ej: La cloaca está desbordando y hay mal olor. Sucede cada vez que llueve.' },
  'arbolado': { titulo: 'Ej: Árbol a punto de caer', descripcion: 'Ej: Un árbol grande está inclinado hacia la calle y sus ramas rozan los cables de luz.' },
  'espacio': { titulo: 'Ej: Plaza con juegos rotos', descripcion: 'Ej: Los juegos infantiles de la plaza están oxidados y hay partes sueltas, es peligroso.' },
  'basura': { titulo: 'Ej: Contenedor desbordando hace días', descripcion: 'Ej: El contenedor de la cuadra no se vacía hace una semana y hay basura en la vereda.' },
  'limpieza': { titulo: 'Ej: Calle sin barrer hace semanas', descripcion: 'Ej: La cuadra está llena de hojas y residuos, no pasa la barredora hace mucho.' },
  'transito': { titulo: 'Ej: Semáforo no funciona', descripcion: 'Ej: El semáforo de la intersección está apagado, hay mucha confusión vehicular.' },
  'señal': { titulo: 'Ej: Cartel de PARE caído', descripcion: 'Ej: El cartel de señalización está tirado en la vereda, los autos no frenan.' },
  'plaga': { titulo: 'Ej: Roedores en terreno baldío', descripcion: 'Ej: Hay ratas saliendo de un terreno abandonado, se las ve a toda hora.' },
  'semaforo': { titulo: 'Ej: Semáforo mal sincronizado', descripcion: 'Ej: El semáforo peatonal da muy poco tiempo para cruzar, es peligroso para ancianos.' },
  'vereda': { titulo: 'Ej: Vereda rota y peligrosa', descripcion: 'Ej: Las baldosas están levantadas por raíces, ya hubo gente que se cayó.' },
  'mobiliario': { titulo: 'Ej: Banco de plaza destruido', descripcion: 'Ej: Los bancos de la plaza tienen las maderas rotas, no se puede sentar nadie.' },
  'ruido': { titulo: 'Ej: Local con música alta de noche', descripcion: 'Ej: Un bar pone música muy fuerte después de las 23hs, no nos deja dormir.' },
  'default': { titulo: 'Ej: Describí brevemente el problema', descripcion: 'Ej: Explica qué sucede, desde cuándo, y cualquier detalle relevante.' }
};

function getCategoryPlaceholders(nombre: string) {
  const key = nombre.toLowerCase();
  for (const [k, p] of Object.entries(categoryPlaceholders)) {
    if (key.includes(k)) return p;
  }
  return categoryPlaceholders.default;
}


type SheetMode = 'closed' | 'view';

interface ReclamosProps {
  soloMisTrabajos?: boolean;
  soloMiArea?: boolean;
}

export default function Reclamos({ soloMisTrabajos = false, soloMiArea = false }: ReclamosProps) {
  const { theme } = useTheme();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [reclamos, setReclamos] = useState<Reclamo[]>([]);
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [dependenciasDisponibles, setDependenciasDisponibles] = useState<any[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [zonas, setZonas] = useState<Zona[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<string>('');
  const [filtroCategoria, setFiltroCategoria] = useState<number | null>(null);
  const [filterLoading, setFilterLoading] = useState<string | null>(null); // Track which filter is loading
  const [ordenamiento, setOrdenamiento] = useState<'reciente' | 'programado'>('reciente'); // Ordenar por fecha de creación o programada
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const ITEMS_PER_PAGE = 50;
  const [conteosCategorias, setConteosCategorias] = useState<Record<number, number>>({});
  const [conteosEstados, setConteosEstados] = useState<Record<string, number>>({});
  const observerTarget = useRef<HTMLDivElement>(null);
  // Estado para animación staggered - iniciar como completado para evitar parpadeo
  const [visibleCards] = useState<Set<number>>(new Set());
  const [animationDone] = useState(true);

  // Wizard states
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);

  // Estado para paso de descripción inicial
  const [descripcionInput, setDescripcionInput] = useState('');
  const [clasificando, setClasificando] = useState(false);
  const [categoriaSugerida, setCategoriaSugerida] = useState<{categoria: Categoria; confianza: number} | null>(null);

  // Sheet states (solo para ver detalle)
  const [sheetMode, setSheetMode] = useState<SheetMode>('closed');
  const [selectedReclamo, setSelectedReclamo] = useState<Reclamo | null>(null);
  const [historial, setHistorial] = useState<HistorialReclamo[]>([]);
  const [loadingHistorial, setLoadingHistorial] = useState(false);

  // Form state for create
  const [formData, setFormData] = useState({
    titulo: '',
    descripcion: '',
    direccion: '',
    referencia: '',
    categoria_id: '',
    zona_id: '',
    latitud: null as number | null,
    longitud: null as number | null,
    // Datos de contacto
    nombre_contacto: '',
    telefono_contacto: '',
    email_contacto: '',
    recibir_notificaciones: true,
  });


  // Action states for view
  const [dependenciaSeleccionada, setDependenciaSeleccionada] = useState<string>('');
  const [comentarioAsignacion, setComentarioAsignacion] = useState('');
  const [fechaProgramada, setFechaProgramada] = useState('');
  const [horaInicio, setHoraInicio] = useState('09:00');
  const [duracion, setDuracion] = useState('1');  // en horas (string para el select)
  // Tiempo estimado de resolución (para aceptar reclamos)
  const [tiempoEstimadoDias, setTiempoEstimadoDias] = useState(1);
  const [tiempoEstimadoHoras, setTiempoEstimadoHoras] = useState(0);
  const [loadingDisponibilidad, setLoadingDisponibilidad] = useState(false);
  const [disponibilidad, setDisponibilidad] = useState<{
    fecha: string;
    bloques_ocupados: { reclamo_id: number; titulo: string; hora_inicio: string; hora_fin: string }[];
    proximo_disponible: string;
    hora_fin_jornada: string;
    dia_lleno: boolean;
  } | null>(null);

  // Sugerencias de asignación automática
  const [sugerencias, setSugerencias] = useState<{
    empleado_id: number;
    empleado_nombre: string;
    categoria_principal: string | null;
    zona: string | null;
    score: number;
    score_porcentaje: number;
    detalles: {
      categoria_match: boolean;
      zona_match: boolean;
      carga_trabajo: number;
      disponibilidad_horas: number;
      proximo_disponible: string | null;
    };
    razon_principal: string;
  }[]>([]);
  const [loadingSugerencias, setLoadingSugerencias] = useState(false);
  const [sugerenciasColapsadas, setSugerenciasColapsadas] = useState(false);

  // Búsqueda de usuarios para datos de contacto
  const [userSearchResults, setUserSearchResults] = useState<UserType[]>([]);
  const [allUsers, setAllUsers] = useState<UserType[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [showUserResults, setShowUserResults] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserType | null>(null);

  // Estado para reclamo anónimo
  const [esAnonimo, setEsAnonimo] = useState(false);

  // Opciones de duración
  const duracionOptions = [
    { value: '0.5', label: '30 min' },
    { value: '1', label: '1 hora' },
    { value: '1.5', label: '1:30 hs' },
    { value: '2', label: '2 horas' },
    { value: '2.5', label: '2:30 hs' },
    { value: '3', label: '3 horas' },
    { value: '3.5', label: '3:30 hs' },
    { value: '4', label: '4 horas' },
    { value: '5', label: '5 horas' },
    { value: '6', label: '6 horas' },
    { value: '8', label: '8 horas' },
  ];

  // Calcular hora fin basado en hora inicio y duración
  const calcularHoraFin = (inicio: string, duracionHoras: string): string => {
    const [h, m] = inicio.split(':').map(Number);
    const duracionNum = parseFloat(duracionHoras);
    const totalMinutos = h * 60 + m + duracionNum * 60;
    const horaFin = Math.floor(totalMinutos / 60);
    const minFin = totalMinutos % 60;
    return `${String(horaFin).padStart(2, '0')}:${String(minFin).padStart(2, '0')}`;
  };

  const horaFin = calcularHoraFin(horaInicio, duracion);
  const [resolucion, setResolucion] = useState('');
  const [tipoFinalizacion, setTipoFinalizacion] = useState<'resuelto' | 'no_finalizado'>('resuelto');
  const [motivoNoFinalizado, setMotivoNoFinalizado] = useState('');
  const [motivoRechazo, setMotivoRechazo] = useState('');
  const [descripcionRechazo, setDescripcionRechazo] = useState('');


  // AI Chat states
  const [aiQuestion, setAiQuestion] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  // AI Panel debounce state - mostrar sugerencias 3 segundos después de escribir descripción
  const [showAISuggestions, setShowAISuggestions] = useState(false);
  const [aiSuggestionsLoading, setAISuggestionsLoading] = useState(false);
  const [contextualAiResponse, setContextualAiResponse] = useState('');
  const aiDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Address autocomplete states
  const [addressSuggestions, setAddressSuggestions] = useState<Array<{ display_name: string; lat: string; lon: string }>>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchingAddress, setSearchingAddress] = useState(false);
  const addressTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Municipalidad data for distance calculation
  const [municipioData, setMunicipioData] = useState<{
    nombre_municipio?: string;
    direccion_municipio?: string;
    latitud_municipio?: string;
    longitud_municipio?: string;
    telefono_contacto?: string;
  } | null>(null);
  const [distanciaAlMunicipio, setDistanciaAlMunicipio] = useState<number | null>(null);

  // Estado para conteos de reclamos similares (por reclamo_id)
  const [similaresCounts, setSimilaresCounts] = useState<Record<number, number>>({});

  // Derivados de estado (deben estar antes de los useEffect que los usan)
  const selectedCategoria = categorias.find(c => c.id === Number(formData.categoria_id));
  const selectedZona = zonas.find(z => z.id === Number(formData.zona_id));

  // Cargar datos del municipio y conteos UNA SOLA VEZ al montar
  useEffect(() => {
    fetchMunicipioData();

    // Cargar conteos UNA SOLA VEZ (GROUP BY optimizado) - solo para admin/supervisor
    if (!soloMisTrabajos) {
      Promise.all([
        dashboardApi.getConteoEstados(),
        dashboardApi.getConteoCategorias(),
      ]).then(([estadosRes, categoriasRes]) => {
        const estadosMap: Record<string, number> = {};
        estadosRes.data.forEach((item: any) => {
          estadosMap[item.estado] = item.cantidad;
        });
        setConteosEstados(estadosMap);

        const categoriasMap: Record<number, number> = {};
        categoriasRes.data.forEach((item: any) => {
          categoriasMap[item.categoria_id] = item.cantidad;
        });
        setConteosCategorias(categoriasMap);
      }).catch(error => {
        console.error('Error cargando conteos:', error);
      });
    }

    // Cargar datos básicos (categorías, zonas) UNA SOLA VEZ
    Promise.all([
      categoriasApi.getAll(true),
      zonasApi.getAll(true),
    ]).then(([categoriasRes, zonasRes]) => {
      setCategorias(categoriasRes.data);
      setZonas(zonasRes.data);
    }).catch(error => {
      console.error('Error cargando categorías/zonas:', error.response?.status, error.response?.data || error.message);
    });

    // Cargar empleados por separado (solo admin/supervisor tienen acceso)
    // No intentar si es modo empleado (soloMisTrabajos) para evitar error 403 en consola
    if (!soloMisTrabajos) {
      empleadosApi.getAll(true).then((empleadosRes) => {
        setEmpleados(empleadosRes.data || []);
      }).catch(() => {
        // Silenciar error - usuarios sin permisos no necesitan ver empleados
        setEmpleados([]);
      });

      // Cargar dependencias del municipio para asignación
      dependenciasApi.getMunicipio({ activo: true, tipo_gestion: 'reclamos' }).then((dependenciasRes) => {
        setDependenciasDisponibles(dependenciasRes.data || []);
      }).catch(() => {
        setDependenciasDisponibles([]);
      });
    }
  }, [soloMisTrabajos]);

  // Para empleados: calcular conteos desde los reclamos cargados
  useEffect(() => {
    if (soloMisTrabajos && reclamos.length > 0) {
      // Calcular conteos de estados
      const estadosMap: Record<string, number> = {};
      reclamos.forEach(r => {
        estadosMap[r.estado] = (estadosMap[r.estado] || 0) + 1;
      });
      setConteosEstados(estadosMap);

      // Calcular conteos de categorías
      const categoriasMap: Record<number, number> = {};
      reclamos.forEach(r => {
        if (r.categoria?.id) {
          categoriasMap[r.categoria.id] = (categoriasMap[r.categoria.id] || 0) + 1;
        }
      });
      setConteosCategorias(categoriasMap);
    }
  }, [soloMisTrabajos, reclamos]);

  // Búsqueda: se activa al presionar espacio, Enter, o después de 1.5s de inactividad
  useEffect(() => {
    // Si termina en espacio o tiene al menos 3 caracteres, buscar inmediatamente
    if (search.endsWith(' ') && search.trim().length >= 2) {
      setDebouncedSearch(search.trim());
      return;
    }
    // Si está vacío, limpiar la búsqueda inmediatamente
    if (search === '') {
      setDebouncedSearch('');
      return;
    }
    // Si no, esperar 1.5 segundos de inactividad
    const timer = setTimeout(() => {
      if (search.trim().length >= 2) {
        setDebouncedSearch(search.trim());
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, [search]);

  // Cargar reclamos cuando cambia el filtro de estado, categoría o búsqueda (con debounce)
  useEffect(() => {
    fetchReclamos(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroEstado, filtroCategoria, debouncedSearch]);

  // Cargar más cuando cambia la página
  useEffect(() => {
    if (page > 1) {
      fetchReclamos(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  // Intersection Observer para scroll infinito - usar refs para evitar recrear el observer
  const hasMoreRef = useRef(hasMore);
  const loadingMoreRef = useRef(loadingMore);
  const loadingRef = useRef(loading);

  // Mantener refs actualizados
  useEffect(() => {
    hasMoreRef.current = hasMore;
    loadingMoreRef.current = loadingMore;
    loadingRef.current = loading;
  }, [hasMore, loadingMore, loading]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore && !loading) {
          setPage(prev => prev + 1);
        }
      },
      { threshold: 0.1, rootMargin: '100px' }
    );

    const currentTarget = observerTarget.current;
    if (currentTarget) {
      observer.observe(currentTarget);
    }

    return () => {
      if (currentTarget) {
        observer.unobserve(currentTarget);
      }
    };
  }, [hasMore, loadingMore, loading]);

  // Detectar parámetro ?crear=ID o ?categoria=NOMBRE para abrir wizard desde chat
  useEffect(() => {
    if (categorias.length === 0) return;

    const crearCategoriaId = searchParams.get('crear');
    const categoriaNombre = searchParams.get('categoria');

    let categoriaEncontrada: Categoria | undefined;

    if (crearCategoriaId) {
      categoriaEncontrada = categorias.find(c => c.id === parseInt(crearCategoriaId));
    } else if (categoriaNombre) {
      // Buscar por nombre (case insensitive)
      const nombreLower = decodeURIComponent(categoriaNombre).toLowerCase();
      categoriaEncontrada = categorias.find(c => c.nombre.toLowerCase() === nombreLower);
    }

    if (categoriaEncontrada) {
      setFormData(prev => ({ ...prev, categoria_id: String(categoriaEncontrada!.id) }));
      setWizardStep(2); // Saltar al paso de ubicación (después de describir y categoría)
      setWizardOpen(true);
      setSearchParams({}); // Limpiar URL
    }
  }, [searchParams, categorias, setSearchParams]);

  // Calcular distancia cuando cambian las coordenadas
  useEffect(() => {
    if (formData.latitud && formData.longitud && municipioData?.latitud_municipio && municipioData?.longitud_municipio) {
      const dist = calcularDistancia(
        formData.latitud,
        formData.longitud,
        parseFloat(municipioData.latitud_municipio),
        parseFloat(municipioData.longitud_municipio)
      );
      setDistanciaAlMunicipio(dist);
    } else {
      setDistanciaAlMunicipio(null);
    }
  }, [formData.latitud, formData.longitud, municipioData]);

  // Función para calcular distancia usando fórmula de Haversine
  const calcularDistancia = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371; // Radio de la Tierra en km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  // Cargar datos de la Municipalidad (multi-tenant)
  const fetchMunicipioData = async () => {
    try {
      const municipioId = localStorage.getItem('municipio_id');
      const url = municipioId
        ? `${API_URL}/configuracion/publica/municipio?municipio_id=${municipioId}`
        : `${API_URL}/configuracion/publica/municipio`;
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        setMunicipioData(data);
      }
    } catch (error) {
      console.error('Error cargando datos del municipio:', error);
    }
  };

  // Reset AI response when category changes
  useEffect(() => {
    setAiResponse('');
    setAiQuestion('');
  }, [formData.categoria_id]);

  // Debounce para mostrar sugerencias de IA - 3 segundos después de escribir
  useEffect(() => {
    // Solo aplicar debounce si estamos en el paso de detalles (paso 3)
    if (wizardStep !== 3) {
      setShowAISuggestions(false);
      setAISuggestionsLoading(false);
      setContextualAiResponse('');
      return;
    }

    // Si no hay descripción o categoría, ocultar sugerencias
    if (!formData.descripcion.trim() || !selectedCategoria) {
      setShowAISuggestions(false);
      setAISuggestionsLoading(false);
      setContextualAiResponse('');
      if (aiDebounceRef.current) {
        clearTimeout(aiDebounceRef.current);
      }
      return;
    }

    const texto = formData.descripcion.trim();
    const palabras = texto.split(/\s+/).filter(p => p.length > 0);

    // Solo activar con 3+ palabras
    if (palabras.length < 3) {
      setShowAISuggestions(false);
      setAISuggestionsLoading(false);
      setContextualAiResponse('');
      return;
    }

    // Limpiar timeout anterior
    if (aiDebounceRef.current) {
      clearTimeout(aiDebounceRef.current);
    }

    // Mostrar loading mientras espera
    setShowAISuggestions(false);
    setAISuggestionsLoading(true);

    // Esperar 3 segundos antes de llamar a la IA
    aiDebounceRef.current = setTimeout(async () => {
      try {
        const contexto: Record<string, unknown> = {
          categoria: selectedCategoria.nombre,
          descripcion_usuario: texto,
          titulo: formData.titulo || '',
          direccion: formData.direccion || '',
        };

        const response = await chatApi.askDynamic(
          `Vecino reporta problema en categoría "${selectedCategoria.nombre}".
Descripción: "${texto}"
${formData.direccion ? `Ubicación: ${formData.direccion}` : ''}

Respondé como empleado municipal dando info útil:
- Qué área se encarga de este tipo de reclamos
- Tiempo estimado de resolución típico
- Si necesita algún dato adicional para procesar mejor el reclamo
- Un tip útil relacionado

Tono amigable, 3-4 oraciones máximo. Sin saludos ni despedidas.`,
          contexto,
          'reclamo_contextual'
        );

        setContextualAiResponse(response.response || response.message || '');
        setShowAISuggestions(true);
      } catch (error) {
        console.error('Error llamando a IA:', error);
        setContextualAiResponse('');
        setShowAISuggestions(true); // Mostrar fallback estático si falla
      } finally {
        setAISuggestionsLoading(false);
      }
    }, 3000);

    return () => {
      if (aiDebounceRef.current) {
        clearTimeout(aiDebounceRef.current);
      }
    };
  }, [formData.descripcion, formData.titulo, formData.direccion, wizardStep, selectedCategoria]);

  const askAI = async () => {
    if (!aiQuestion.trim() || !selectedCategoria) return;

    setAiLoading(true);
    try {
      const response = await fetch(`${API_URL}/chat/categoria`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoria: selectedCategoria.nombre,
          pregunta: aiQuestion
        })
      });

      if (response.ok) {
        const data = await response.json();
        setAiResponse(data.response);
      } else {
        setAiResponse('No pude procesar tu pregunta. Intentá de nuevo.');
      }
    } catch (error) {
      setAiResponse('Error al conectar con el asistente. Verificá que el servidor esté corriendo.');
    } finally {
      setAiLoading(false);
      setAiQuestion('');
    }
  };

  const handleAiKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      askAI();
    }
  };

  // Cargar conteos de reclamos similares para los reclamos visibles
  // NOTA: Deshabilitado temporalmente porque el endpoint no existe en el backend
  // useEffect(() => {
  //   const loadSimilaresCounts = async () => {
  //     if (reclamos.length === 0) return;
  //
  //     // Solo cargar para reclamos que no tienen conteo aún
  //     const reclamosToFetch = reclamos.filter(r => similaresCounts[r.id] === undefined);
  //     if (reclamosToFetch.length === 0) return;
  //
  //     // Cargar en paralelo (máximo 10 a la vez para no saturar)
  //     const batch = reclamosToFetch.slice(0, 10);
  //     const results = await Promise.all(
  //       batch.map(async (r) => {
  //         try {
  //           const res = await reclamosApi.getCantidadSimilares(r.id);
  //           return { id: r.id, count: res.data.cantidad || 0 };
  //         } catch {
  //           return { id: r.id, count: 0 };
  //         }
  //       })
  //     );
  //
  //     // Actualizar estado con los nuevos conteos
  //     setSimilaresCounts(prev => {
  //       const newCounts = { ...prev };
  //       results.forEach(r => {
  //         newCounts[r.id] = r.count;
  //       });
  //       return newCounts;
  //     });
  //   };
  //
  //   loadSimilaresCounts();
  // }, [reclamos]);

  // Address autocomplete with Nominatim (OpenStreetMap - free)
  const searchAddress = async (query: string) => {
    if (query.length < 3) {
      setAddressSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    setSearchingAddress(true);
    try {
      // Usar el nombre del municipio para filtrar la búsqueda, o Buenos Aires por defecto
      const locationFilter = municipioData?.nombre_municipio
        ? `${municipioData.nombre_municipio}, Buenos Aires, Argentina`
        : 'Buenos Aires, Argentina';

      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}, ${encodeURIComponent(locationFilter)}&limit=5&addressdetails=1`,
        {
          headers: {
            'Accept-Language': 'es',
          }
        }
      );

      if (response.ok) {
        const data = await response.json();
        setAddressSuggestions(data);
        setShowSuggestions(data.length > 0);
      }
    } catch (error) {
      console.error('Error buscando dirección:', error);
    } finally {
      setSearchingAddress(false);
    }
  };

  const handleAddressChange = (value: string) => {
    setFormData({ ...formData, direccion: value });

    // Debounce search
    if (addressTimeoutRef.current) {
      clearTimeout(addressTimeoutRef.current);
    }

    addressTimeoutRef.current = setTimeout(() => {
      searchAddress(value);
    }, 400);
  };

  const selectAddress = (suggestion: { display_name: string; lat: string; lon: string }) => {
    // Extraer número de calle del input del usuario (si existe)
    const userInput = formData.direccion.trim();

    // Buscar patrones como "cochabamba 150" o "av. mitre 1234"
    // El número debe estar entre palabras (nombre calle + número + localidad opcional)
    const numberMatch = userInput.match(/^[a-zA-ZáéíóúÁÉÍÓÚñÑ.\s]+?\s+(\d{1,5})(?:\s|$)/i);
    const streetNumber = numberMatch ? numberMatch[1] : '';

    // Simplificar el nombre de la dirección de la sugerencia
    const parts = suggestion.display_name.split(',').map(p => p.trim());

    // La primera parte es el nombre de la calle (puede incluir número de Nominatim)
    let streetName = parts[0];
    // Si la calle de Nominatim tiene número, quitarlo para usar el del usuario
    if (streetNumber) {
      streetName = streetName.replace(/\s+\d+$/, '').trim();
    }

    // Filtrar partes que no queremos
    const locationParts = parts.slice(1).filter(part => {
      // Excluir códigos postales (4-5 dígitos solos)
      if (/^\d{4,5}$/.test(part)) return false;
      // Excluir "Argentina"
      if (part.toLowerCase() === 'argentina') return false;
      // Excluir provincias comunes
      if (/^(buenos aires|provincia de buenos aires|caba)$/i.test(part)) return false;
      return true;
    });

    // Tomar las primeras 2 partes de ubicación (localidad, partido)
    const locality = locationParts.slice(0, 2).join(', ');

    // Construir dirección final: "Calle 123, Localidad, Partido" o "Calle, Localidad, Partido"
    const finalAddress = streetNumber
      ? `${streetName} ${streetNumber}, ${locality}`
      : `${streetName}, ${locality}`;

    // Buscar zona/barrio que coincida con la dirección
    const addressLower = suggestion.display_name.toLowerCase();
    let matchedZonaId = '';

    for (const zona of zonas) {
      const zonaNombre = zona.nombre.toLowerCase();
      if (addressLower.includes(zonaNombre)) {
        matchedZonaId = String(zona.id);
        break;
      }
    }

    setFormData({
      ...formData,
      direccion: finalAddress,
      latitud: parseFloat(suggestion.lat),
      longitud: parseFloat(suggestion.lon),
      zona_id: matchedZonaId || formData.zona_id
    });
    setShowSuggestions(false);
    setAddressSuggestions([]);
  };

  // Función simplificada: SOLO carga reclamos con paginación
  const fetchReclamos = async (resetPage = false) => {
    try {
      const currentPage = resetPage ? 1 : page;
      const skip = (currentPage - 1) * ITEMS_PER_PAGE;

      if (resetPage) {
        setLoadingMore(false);
        setLoading(true);
      } else {
        setLoadingMore(true);
      }

      // Construir params para la API con paginación
      const params: Record<string, string | number> = {
        skip,
        limit: ITEMS_PER_PAGE,
      };
      if (filtroEstado) {
        params.estado = filtroEstado;
      }
      if (filtroCategoria) {
        params.categoria_id = filtroCategoria;
      }
      if (debouncedSearch && debouncedSearch.trim()) {
        params.search = debouncedSearch.trim();
      }
      // Filtrar por dependencia del usuario si es modo "soloMiArea"
      if (soloMiArea && user?.dependencia?.id) {
        params.municipio_dependencia_id = user.dependencia.id;
      }

      const reclamosRes = await reclamosApi.getAll(params);
      const newReclamos = reclamosRes.data;

      if (resetPage) {
        setReclamos(newReclamos);
        if (page !== 1) {
          setPage(1);
        }
      } else {
        setReclamos(prev => {
          const existingIds = new Set(prev.map(r => r.id));
          const uniqueNew = newReclamos.filter((r: Reclamo) => !existingIds.has(r.id));
          return [...prev, ...uniqueNew];
        });
      }

      setHasMore(newReclamos.length === ITEMS_PER_PAGE);
    } catch (error) {
      toast.error('Error al cargar reclamos');
      console.error('Error:', error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
      setFilterLoading(null); // Clear filter loading state
    }
  };

  // Cargar usuarios para búsqueda
  const fetchUsers = async () => {
    setLoadingUsers(true);
    try {
      const response = await usersApi.getAll();
      console.log('[fetchUsers] Response:', response.data?.length, 'usuarios');
      // Filtrar solo vecinos activos
      const vecinos = response.data.filter((u: UserType) => u.rol === 'vecino' && u.activo);
      console.log('[fetchUsers] Vecinos activos:', vecinos.length);
      setAllUsers(vecinos);
    } catch (error) {
      console.error('[fetchUsers] Error cargando usuarios:', error);
    } finally {
      setLoadingUsers(false);
    }
  };

  // Buscar usuarios por nombre, apellido, DNI o teléfono
  const handleUserSearch = (query: string) => {
    console.log('[handleUserSearch] Query:', query, 'allUsers:', allUsers.length);
    if (query.length < 2) {
      setUserSearchResults([]);
      setShowUserResults(false);
      setSearchingUsers(false);
      return;
    }
    setSearchingUsers(true);
    // Simular pequeño delay para mostrar el spinner
    setTimeout(() => {
      const queryLower = query.toLowerCase();
      const results = allUsers.filter(u =>
        u.nombre.toLowerCase().includes(queryLower) ||
        u.apellido.toLowerCase().includes(queryLower) ||
        `${u.nombre} ${u.apellido}`.toLowerCase().includes(queryLower) ||
        (u.dni && u.dni.toLowerCase().includes(queryLower)) ||
        (u.telefono && u.telefono.includes(query))
      ).slice(0, 10);
      console.log('[handleUserSearch] Results:', results.length);
      setUserSearchResults(results);
      setShowUserResults(results.length > 0);
      setSearchingUsers(false);
    }, 300);
  };

  // Seleccionar usuario y cargar datos
  const selectUser = (user: UserType) => {
    setSelectedUser(user);
    setFormData({
      ...formData,
      nombre_contacto: `${user.nombre} ${user.apellido}`,
      telefono_contacto: user.telefono || '',
      email_contacto: user.email || '',
    });
    setShowUserResults(false);
    toast.success(`Datos de ${user.nombre} cargados`);
  };

  // Limpiar selección de usuario
  const clearUserSelection = () => {
    setSelectedUser(null);
    setFormData({
      ...formData,
      nombre_contacto: '',
      telefono_contacto: '',
      email_contacto: '',
    });
  };

  const openWizard = () => {
    setFormData({
      titulo: '',
      descripcion: '',
      direccion: '',
      referencia: '',
      categoria_id: '',
      zona_id: '',
      latitud: null,
      longitud: null,
      nombre_contacto: '',
      telefono_contacto: '',
      email_contacto: '',
      recibir_notificaciones: true,
    });
    setSelectedFiles([]);
    setPreviewUrls([]);
    setWizardStep(0);
    setSelectedUser(null);
    setUserSearchResults([]);
    setDescripcionInput('');
    setCategoriaSugerida(null);
    setClasificando(false);
    setWizardOpen(true);
    // Cargar usuarios si no están cargados
    if (allUsers.length === 0) {
      fetchUsers();
    }
  };

  const closeWizard = () => {
    setWizardOpen(false);
    setWizardStep(0);
    setEsAnonimo(false);
    setDescripcionInput('');
    setCategoriaSugerida(null);
  };

  // Clasificar descripción con IA
  const handleDescripcionSubmit = async () => {
    if (!descripcionInput.trim() || clasificando) return;

    setClasificando(true);
    try {
      const municipioId = user?.municipio_id || 1;
      const resultado = await clasificacionApi.clasificar(descripcionInput.trim(), municipioId);

      if (resultado.sugerencias && resultado.sugerencias.length > 0) {
        const mejorSugerencia = resultado.sugerencias[0];
        const cat = categorias.find(c => c.id === mejorSugerencia.categoria_id);

        if (cat) {
          const confianza = mejorSugerencia.confianza || mejorSugerencia.score || 0;
          setCategoriaSugerida({ categoria: cat, confianza });
          setFormData(prev => ({
            ...prev,
            descripcion: descripcionInput.trim(),
            titulo: `Problema de ${cat.nombre.toLowerCase()}`,
          }));
        }
      }
    } catch (error) {
      console.error('Error clasificando:', error);
    } finally {
      setClasificando(false);
    }
  };

  // Aceptar categoría sugerida
  const aceptarCategoriaSugerida = () => {
    if (categoriaSugerida) {
      setFormData(prev => ({ ...prev, categoria_id: String(categoriaSugerida.categoria.id) }));
      setWizardStep(2); // Ir directamente a ubicación (saltando categoría ya que está seleccionada)
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length + selectedFiles.length > 5) {
      toast.error('Máximo 5 archivos permitidos');
      return;
    }
    const newFiles = [...selectedFiles, ...files].slice(0, 5);
    setSelectedFiles(newFiles);
    const urls = newFiles.map(file => URL.createObjectURL(file));
    setPreviewUrls(urls);
  };

  const removeFile = (index: number) => {
    const newFiles = selectedFiles.filter((_, i) => i !== index);
    const newUrls = previewUrls.filter((_, i) => i !== index);
    URL.revokeObjectURL(previewUrls[index]);
    setSelectedFiles(newFiles);
    setPreviewUrls(newUrls);
  };

  const openViewSheet = async (reclamo: Reclamo) => {
    setSelectedReclamo(reclamo);
    setDependenciaSeleccionada(''); // TODO: Migrar a dependencia_asignada
    setComentarioAsignacion('');
    setResolucion('');
    setMotivoRechazo('');
    setDescripcionRechazo('');
    setSugerencias([]);
    setSugerenciasColapsadas(false);
    setSheetMode('view');

    // Cargar historial
    setLoadingHistorial(true);
    try {
      const res = await reclamosApi.getHistorial(reclamo.id);
      setHistorial(res.data);
    } catch (error) {
      console.error('Error cargando historial:', error);
    } finally {
      setLoadingHistorial(false);
    }

    // Si el reclamo es nuevo, cargar sugerencias de asignación
    if (reclamo.estado === 'nuevo') {
      setLoadingSugerencias(true);
      try {
        console.log('[DEBUG] Cargando sugerencias para reclamo:', reclamo.id);
        const res = await reclamosApi.getSugerenciaAsignacion(reclamo.id);
        console.log('[DEBUG] Sugerencias recibidas:', res.data);
        setSugerencias(res.data.sugerencias || []);
      } catch (error) {
        console.error('Error cargando sugerencias:', error);
      } finally {
        setLoadingSugerencias(false);
      }
    }
  };

  const closeSheet = () => {
    setSheetMode('closed');
    setSelectedReclamo(null);
    setHistorial([]);
    // Reset asignación states
    setDependenciaSeleccionada('');
    setFechaProgramada('');
    setHoraInicio('09:00');
    setDuracion('1');
    setDisponibilidad(null);
    setComentarioAsignacion('');
  };

  const handleCreate = async () => {
    setSaving(true);
    try {
      const payload = {
        titulo: formData.titulo,
        descripcion: formData.descripcion,
        direccion: formData.direccion,
        referencia: formData.referencia || null,
        categoria_id: Number(formData.categoria_id),
        zona_id: formData.zona_id ? Number(formData.zona_id) : null,
        latitud: formData.latitud,
        longitud: formData.longitud,
        // Datos de contacto del ciudadano
        nombre_contacto: formData.nombre_contacto || null,
        telefono_contacto: formData.telefono_contacto || null,
        email_contacto: formData.email_contacto || null,
        recibir_notificaciones: formData.recibir_notificaciones,
      };
      const response = await reclamosApi.create(payload);
      const reclamoId = response.data.id;

      // Upload files if any
      if (selectedFiles.length > 0) {
        for (const file of selectedFiles) {
          await reclamosApi.upload(reclamoId, file, 'creacion');
        }
      }

      toast.success('Reclamo creado correctamente');
      fetchReclamos();
      closeWizard();
    } catch (error) {
      toast.error('Error al crear el reclamo');
      console.error('Error:', error);
    } finally {
      setSaving(false);
    }
  };

  // Aceptar reclamo que ya está asignado a mi dependencia
  const handleAceptar = async () => {
    if (!selectedReclamo || !selectedReclamo.dependencia_asignada) return;

    // Validar que se haya ingresado tiempo estimado
    if (tiempoEstimadoDias === 0 && tiempoEstimadoHoras === 0) {
      toast.error('Ingresá un tiempo estimado de resolución');
      return;
    }

    // Validar comentario obligatorio
    if (!comentarioAsignacion.trim()) {
      toast.error('Ingresá un comentario');
      return;
    }

    // Actualización optimista
    const reclamoActualizado = {
      ...selectedReclamo,
      estado: 'recibido' as const,
      tiempo_estimado_dias: tiempoEstimadoDias,
      tiempo_estimado_horas: tiempoEstimadoHoras,
    };
    setReclamos(prev => prev.map(r => r.id === selectedReclamo.id ? reclamoActualizado : r));
    closeSheet();
    toast.success('Reclamo aceptado correctamente');

    setSaving(true);
    try {
      await reclamosApi.asignar(selectedReclamo.id, {
        dependencia_id: selectedReclamo.dependencia_asignada.id,
        tiempo_estimado_dias: tiempoEstimadoDias,
        tiempo_estimado_horas: tiempoEstimadoHoras,
        comentario: comentarioAsignacion.trim(),
      });
      fetchReclamos();
      // Limpiar campos
      setComentarioAsignacion('');
      setTiempoEstimadoDias(1);
      setTiempoEstimadoHoras(0);
    } catch (error) {
      setReclamos(prev => prev.map(r => r.id === selectedReclamo.id ? selectedReclamo : r));
      toast.error('Error al aceptar reclamo');
      console.error('Error:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleAsignar = async () => {
    if (!selectedReclamo || !dependenciaSeleccionada) return;

    // Encontrar la dependencia seleccionada para la actualización optimista
    const dependenciaData = dependenciasDisponibles.find(d => d.id === Number(dependenciaSeleccionada));

    // Actualización optimista
    const reclamoActualizado = {
      ...selectedReclamo,
      estado: 'asignado' as const,
      municipio_dependencia_id: Number(dependenciaSeleccionada),
      dependencia_asignada: dependenciaData ? {
        id: dependenciaData.id,
        dependencia_id: dependenciaData.dependencia_id,
        nombre: dependenciaData.dependencia?.nombre || dependenciaData.nombre,
        color: dependenciaData.dependencia?.color,
        icono: dependenciaData.dependencia?.icono
      } : selectedReclamo.dependencia_asignada,
      fecha_programada: fechaProgramada || selectedReclamo.fecha_programada
    };
    setReclamos(prev => prev.map(r => r.id === selectedReclamo.id ? reclamoActualizado : r));
    closeSheet();
    toast.success('Reclamo asignado correctamente');

    setSaving(true);
    try {
      await reclamosApi.asignar(selectedReclamo.id, {
        dependencia_id: Number(dependenciaSeleccionada),
        fecha_programada: fechaProgramada || undefined,
        hora_inicio: horaInicio || undefined,
        hora_fin: horaFin || undefined,
        comentario: comentarioAsignacion || undefined
      });
      fetchReclamos();
    } catch (error) {
      setReclamos(prev => prev.map(r => r.id === selectedReclamo.id ? selectedReclamo : r));
      toast.error('Error al asignar reclamo');
      console.error('Error:', error);
    } finally {
      setSaving(false);
    }
  };

  // Cargar disponibilidad cuando cambia empleado o fecha
  const fetchDisponibilidad = async (empleadoId: string, fecha: string, buscarSiguiente: boolean = false) => {
    if (!empleadoId || !fecha) {
      setDisponibilidad(null);
      return;
    }
    setLoadingDisponibilidad(true);
    try {
      const response = await reclamosApi.getDisponibilidadEmpleado(Number(empleadoId), fecha, buscarSiguiente);
      setDisponibilidad(response.data);
      // Auto-setear hora de inicio al próximo disponible
      const proximoDisponible = response.data.proximo_disponible.slice(0, 5); // HH:MM
      setHoraInicio(proximoDisponible);
      // Si la fecha cambió (porque buscó el siguiente día disponible), actualizar
      if (response.data.fecha !== fecha) {
        setFechaProgramada(response.data.fecha);
      }
    } catch (error) {
      console.error('Error al obtener disponibilidad:', error);
      setDisponibilidad(null);
      setHoraInicio('09:00');
    } finally {
      setLoadingDisponibilidad(false);
    }
  };

  // Auto-cargar fecha y disponibilidad cuando se selecciona un empleado
  const handleEmpleadoChange = async (empleadoId: string) => {
    setDependenciaSeleccionada(empleadoId);
    if (empleadoId) {
      // Usar fecha de hoy como punto de partida y buscar el próximo día disponible
      const hoy = new Date().toISOString().split('T')[0];
      setFechaProgramada(hoy);
      await fetchDisponibilidad(empleadoId, hoy, true); // buscar siguiente si está lleno
    } else {
      setFechaProgramada('');
      setDisponibilidad(null);
    }
  };

  const handleIniciar = async () => {
    if (!selectedReclamo) return;

    // Toast de advertencia para supervisores/admins
    if (user?.rol === 'supervisor' || user?.rol === 'admin') {
      toast.warning('Atención: Estás iniciando el trabajo como supervisor.', {
        duration: 4000,
      });
    }

    // Actualización optimista: actualizar UI inmediatamente
    const reclamoActualizado = { ...selectedReclamo, estado: 'en_proceso' as const };
    setReclamos(prev => prev.map(r => r.id === selectedReclamo.id ? reclamoActualizado : r));
    closeSheet();
    toast.success('Trabajo iniciado');

    setSaving(true);
    try {
      await reclamosApi.iniciar(selectedReclamo.id);
      // Refrescar en background para sincronizar datos completos
      fetchReclamos();
    } catch (error) {
      // Revertir cambio optimista si falla
      setReclamos(prev => prev.map(r => r.id === selectedReclamo.id ? selectedReclamo : r));
      toast.error('Error al iniciar trabajo');
      console.error('Error:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleResolver = async () => {
    if (!selectedReclamo || !resolucion) return;

    // Toast de advertencia para supervisores/admins
    if (user?.rol === 'supervisor' || user?.rol === 'admin') {
      toast.warning('Atención: Estás resolviendo este reclamo directamente como supervisor.', {
        duration: 4000,
      });
    }

    // Actualización optimista
    const reclamoActualizado = { ...selectedReclamo, estado: 'resuelto' as const, resolucion };
    setReclamos(prev => prev.map(r => r.id === selectedReclamo.id ? reclamoActualizado : r));
    closeSheet();
    toast.success('Reclamo resuelto');

    setSaving(true);
    try {
      await reclamosApi.resolver(selectedReclamo.id, { resolucion });
      fetchReclamos();
    } catch (error) {
      setReclamos(prev => prev.map(r => r.id === selectedReclamo.id ? selectedReclamo : r));
      toast.error('Error al resolver reclamo');
      console.error('Error:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleRechazar = async () => {
    if (!selectedReclamo || !motivoRechazo) return;

    // Actualización optimista
    const reclamoActualizado = { ...selectedReclamo, estado: 'rechazado' as const };
    setReclamos(prev => prev.map(r => r.id === selectedReclamo.id ? reclamoActualizado : r));
    closeSheet();
    toast.success('Reclamo rechazado');

    setSaving(true);
    try {
      await reclamosApi.rechazar(selectedReclamo.id, {
        motivo: motivoRechazo,
        descripcion: descripcionRechazo || undefined
      });
      fetchReclamos();
    } catch (error) {
      setReclamos(prev => prev.map(r => r.id === selectedReclamo.id ? selectedReclamo : r));
      toast.error('Error al rechazar reclamo');
      console.error('Error:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleNoFinalizado = async () => {
    if (!selectedReclamo || !motivoNoFinalizado) return;
    setSaving(true);
    try {
      // Volver a estado asignado con comentario
      const comentario = `Trabajo no finalizado: ${motivoNoFinalizado}${resolucion ? `. ${resolucion}` : ''}`;
      await reclamosApi.cambiarEstado(selectedReclamo.id, 'asignado', comentario);
      toast.success('Reclamo vuelto a asignado para reprogramar');
      fetchReclamos();
      closeSheet();
      // Reset estados
      setTipoFinalizacion('resuelto');
      setMotivoNoFinalizado('');
      setResolucion('');
    } catch (error) {
      toast.error('Error al procesar el reclamo');
      console.error('Error:', error);
    } finally {
      setSaving(false);
    }
  };

  // Búsqueda del servidor + filtro local para refinamiento en tiempo real
  const filteredReclamos = reclamos.filter(r => {
    // Si no hay búsqueda o la búsqueda ya fue enviada al servidor, mostrar todos
    if (!search || search.trim() === debouncedSearch) return true;

    // Filtro local para refinar mientras el usuario sigue escribiendo
    const searchLower = search.trim().toLowerCase();
    return (
      // ID
      String(r.id).includes(searchLower) ||
      // Título y descripción
      r.titulo?.toLowerCase().includes(searchLower) ||
      r.descripcion?.toLowerCase().includes(searchLower) ||
      // Ubicación
      r.direccion?.toLowerCase().includes(searchLower) ||
      r.referencia?.toLowerCase().includes(searchLower) ||
      // Categoría y zona
      r.categoria?.nombre?.toLowerCase().includes(searchLower) ||
      r.zona?.nombre?.toLowerCase().includes(searchLower) ||
      r.zona?.codigo?.toLowerCase().includes(searchLower) ||
      // Creador (nombre, apellido, email, teléfono)
      r.creador?.nombre?.toLowerCase().includes(searchLower) ||
      r.creador?.apellido?.toLowerCase().includes(searchLower) ||
      `${r.creador?.nombre || ''} ${r.creador?.apellido || ''}`.toLowerCase().includes(searchLower) ||
      r.creador?.email?.toLowerCase().includes(searchLower) ||
      r.creador?.telefono?.includes(searchLower) ||
      // Dependencia asignada
      r.dependencia_asignada?.nombre?.toLowerCase().includes(searchLower) ||
      // Resolución y rechazo
      r.resolucion?.toLowerCase().includes(searchLower) ||
      r.descripcion_rechazo?.toLowerCase().includes(searchLower)
    );
  }).sort((a, b) => {
    if (ordenamiento === 'programado') {
      // Ordenar por fecha programada (más próxima primero), los sin fecha al final
      const fechaA = a.fecha_programada ? new Date(a.fecha_programada).getTime() : Infinity;
      const fechaB = b.fecha_programada ? new Date(b.fecha_programada).getTime() : Infinity;
      return fechaA - fechaB;
    } else {
      // Ordenar por fecha de creación (más reciente primero)
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    }
  });

  // Wizard Step 0: Describir problema
  const wizardStep0 = (
    <div className="space-y-4">
      <p className="text-sm" style={{ color: theme.textSecondary }}>
        Describí el problema y te sugeriremos la categoría más adecuada:
      </p>

      {/* Input de descripción */}
      <div className="flex gap-2">
        <input
          type="text"
          value={descripcionInput}
          onChange={(e) => setDescripcionInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleDescripcionSubmit()}
          placeholder="Ej: Hay un bache grande en la esquina..."
          disabled={clasificando}
          className="flex-1 px-4 py-3 rounded-xl focus:ring-2 focus:outline-none transition-all"
          style={{
            backgroundColor: theme.backgroundSecondary,
            color: theme.text,
            border: `1px solid ${theme.border}`,
          }}
        />
        <button
          onClick={handleDescripcionSubmit}
          disabled={!descripcionInput.trim() || clasificando}
          className="px-4 py-3 rounded-xl transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
          style={{ backgroundColor: theme.primary, color: 'white' }}
        >
          {clasificando ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
        </button>
      </div>

      {/* Sugerencia de categoría */}
      {categoriaSugerida && !clasificando && (() => {
        const sugColor = categoriaSugerida.categoria.color || DEFAULT_CATEGORY_COLOR;
        return (
        <div
          className="p-4 rounded-xl flex items-center justify-between"
          style={{
            backgroundColor: `${sugColor}15`,
            border: `2px solid ${sugColor}`,
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center"
              style={{
                backgroundColor: sugColor,
                color: 'white',
              }}
            >
              {getCategoryIcon(categoriaSugerida.categoria.nombre)}
            </div>
            <div>
              <p className="text-xs" style={{ color: theme.textSecondary }}>Categoría sugerida</p>
              <p className="font-semibold" style={{ color: theme.text }}>
                {categoriaSugerida.categoria.nombre}
              </p>
              <p className="text-xs" style={{ color: theme.textSecondary }}>
                {categoriaSugerida.confianza >= 80 ? 'Alta confianza' : categoriaSugerida.confianza >= 60 ? 'Confianza media' : 'Baja confianza'}
              </p>
            </div>
          </div>
          <button
            onClick={aceptarCategoriaSugerida}
            className="px-4 py-2 rounded-lg font-medium text-sm transition-all hover:scale-105 active:scale-95"
            style={{ backgroundColor: theme.primary, color: 'white' }}
          >
            Confirmar
          </button>
        </div>
        );
      })()}

      {/* Tip */}
      <p className="text-xs text-center" style={{ color: theme.textSecondary }}>
        Tip: Describí el problema con detalle para obtener una mejor sugerencia
      </p>
    </div>
  );

  // Wizard Step 1: Categoría
  const wizardStep1 = (
    <div className="space-y-3">
      <p className="text-sm" style={{ color: theme.textSecondary }}>
        Selecciona el tipo de problema que deseas reportar:
      </p>
      <div className="grid grid-cols-4 sm:grid-cols-5 lg:grid-cols-6 gap-3">
        {categorias.map((cat) => {
          const isSelected = formData.categoria_id === String(cat.id);
          const catColor = cat.color || DEFAULT_CATEGORY_COLOR;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => { setFormData({ ...formData, categoria_id: String(cat.id) }); setTimeout(() => setWizardStep(2), 300); }}
              className={`relative p-3 rounded-xl border-2 transition-all duration-300 hover:scale-105 active:scale-95 ${isSelected ? 'border-current' : 'border-transparent'}`}
              style={{
                backgroundColor: isSelected ? `${catColor}20` : theme.backgroundSecondary,
                borderColor: isSelected ? catColor : theme.border,
                color: theme.text,
              }}
            >
              <div
                className="w-10 h-10 rounded-full mx-auto mb-2 flex items-center justify-center transition-all duration-300"
                style={{
                  backgroundColor: isSelected ? catColor : `${catColor}30`,
                  color: isSelected ? 'white' : catColor,
                  transform: isSelected ? 'scale(1.1)' : 'scale(1)',
                  boxShadow: isSelected ? `0 4px 14px ${catColor}40` : 'none',
                }}
              >
                {getCategoryIcon(cat.nombre)}
              </div>
              <span className="text-xs font-medium block leading-tight">{cat.nombre}</span>
              {isSelected && (
                <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full flex items-center justify-center" style={{ backgroundColor: catColor }}>
                  <CheckCircle2 className="h-2.5 w-2.5 text-white" />
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );

  // Wizard Step 2: Ubicación
  const wizardStep2 = (
    <div className="space-y-4">
      <div className="relative">
        <label className="block text-sm font-medium mb-2" style={{ color: theme.text }}>
          Dirección <span className="text-red-500">*</span>
        </label>
        <div className="relative">
          <input
            type="text"
            value={formData.direccion}
            onChange={(e) => handleAddressChange(e.target.value)}
            onFocus={() => addressSuggestions.length > 0 && setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
            placeholder="Ej: Av. San Martín 1234"
            className="w-full px-4 py-3 rounded-xl focus:ring-2 focus:outline-none transition-all"
            style={{ backgroundColor: theme.backgroundSecondary, color: theme.text, border: `1px solid ${theme.border}` }}
          />
          {searchingAddress && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <div className="h-4 w-4 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: theme.primary, borderTopColor: 'transparent' }} />
            </div>
          )}
        </div>
        {/* Dropdown de sugerencias */}
        {showSuggestions && addressSuggestions.length > 0 && (
          <div
            className="absolute z-50 w-full mt-1 rounded-xl shadow-lg overflow-hidden"
            style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
          >
            {addressSuggestions.map((suggestion, index) => (
              <button
                key={index}
                type="button"
                onClick={() => selectAddress(suggestion)}
                className="w-full px-4 py-3 text-left text-sm hover:bg-opacity-50 transition-colors flex items-start gap-2"
                style={{ color: theme.text }}
                onMouseOver={(e) => e.currentTarget.style.backgroundColor = `${theme.primary}15`}
                onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: theme.primary }} />
                <span className="line-clamp-2">{suggestion.display_name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div>
        <label className="block text-sm font-medium mb-2" style={{ color: theme.text }}>Zona/Barrio</label>
        <select
          value={formData.zona_id}
          onChange={(e) => setFormData({ ...formData, zona_id: e.target.value })}
          className="w-full px-4 py-3 rounded-xl focus:ring-2 focus:outline-none transition-all"
          style={{ backgroundColor: theme.backgroundSecondary, color: theme.text, border: `1px solid ${theme.border}` }}
        >
          <option value="">Seleccionar zona</option>
          {zonas.map((zona) => (
            <option key={zona.id} value={zona.id}>{zona.nombre}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium mb-2" style={{ color: theme.text }}>Ubicación en el mapa</label>
        <p className="text-xs mb-2" style={{ color: theme.textSecondary }}>Haz clic en el mapa para marcar la ubicación exacta</p>
        <MapPicker
          value={formData.latitud && formData.longitud ? { lat: formData.latitud, lng: formData.longitud } : null}
          onChange={(coords) => setFormData({ ...formData, latitud: coords.lat, longitud: coords.lng })}
          height="200px"
        />
      </div>

      {/* Mostrar distancia a la Municipalidad */}
      {distanciaAlMunicipio !== null && municipioData && (
        <div
          className="rounded-xl p-4 flex items-center gap-3"
          style={{
            backgroundColor: `${theme.primary}10`,
            border: `1px solid ${theme.primary}30`,
          }}
        >
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: `${theme.primary}20` }}
          >
            <Building2 className="h-5 w-5" style={{ color: theme.primary }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm" style={{ color: theme.text }}>
              Distancia a {municipioData.nombre_municipio || 'la Municipalidad'}
            </p>
            <p className="text-lg font-bold" style={{ color: theme.primary }}>
              {distanciaAlMunicipio < 1
                ? `${Math.round(distanciaAlMunicipio * 1000)} metros`
                : `${distanciaAlMunicipio.toFixed(2)} km`}
            </p>
            {municipioData.telefono_contacto && (
              <p className="text-xs mt-1" style={{ color: theme.textSecondary }}>
                Tel: {municipioData.telefono_contacto}
              </p>
            )}
          </div>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium mb-2" style={{ color: theme.text }}>Referencia (opcional)</label>
        <input
          type="text"
          value={formData.referencia}
          onChange={(e) => setFormData({ ...formData, referencia: e.target.value })}
          placeholder="Ej: Frente a la plaza, cerca del hospital"
          className="w-full px-4 py-3 rounded-xl focus:ring-2 focus:outline-none transition-all"
          style={{ backgroundColor: theme.backgroundSecondary, color: theme.text, border: `1px solid ${theme.border}` }}
        />
      </div>
    </div>
  );

  // Wizard Step 3: Detalles
  const wizardStep3 = (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-2" style={{ color: theme.text }}>
          Título del reclamo <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={formData.titulo}
          onChange={(e) => setFormData({ ...formData, titulo: e.target.value })}
          placeholder={selectedCategoria ? getCategoryPlaceholders(selectedCategoria.nombre).titulo : 'Ej: Describí brevemente el problema'}
          className="w-full px-4 py-3 rounded-xl focus:ring-2 focus:outline-none transition-all"
          style={{ backgroundColor: theme.backgroundSecondary, color: theme.text, border: `1px solid ${theme.border}` }}
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-2" style={{ color: theme.text }}>
          Descripción detallada <span className="text-red-500">*</span>
        </label>
        <textarea
          value={formData.descripcion}
          onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
          placeholder={selectedCategoria ? getCategoryPlaceholders(selectedCategoria.nombre).descripcion : 'Ej: Explica qué sucede, desde cuándo, y cualquier detalle relevante.'}
          rows={4}
          className="w-full px-4 py-3 rounded-xl focus:ring-2 focus:outline-none transition-all resize-none"
          style={{ backgroundColor: theme.backgroundSecondary, color: theme.text, border: `1px solid ${theme.border}` }}
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-2" style={{ color: theme.text }}>Fotos (opcional)</label>
        <p className="text-xs mb-3" style={{ color: theme.textSecondary }}>Agrega hasta 5 fotos del problema</p>
        <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleFileSelect} className="hidden" />
        <div className="flex flex-wrap gap-3">
          {previewUrls.map((url, index) => (
            <div key={index} className="relative w-20 h-20 rounded-xl overflow-hidden group" style={{ border: `1px solid ${theme.border}` }}>
              <img src={url} alt={`Preview ${index + 1}`} className="w-full h-full object-cover" />
              <button type="button" onClick={() => removeFile(index)} className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <X className="h-5 w-5 text-white" />
              </button>
            </div>
          ))}
          {selectedFiles.length < 5 && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-20 h-20 rounded-xl flex flex-col items-center justify-center gap-1 transition-all hover:scale-105 active:scale-95"
              style={{ backgroundColor: theme.backgroundSecondary, border: `2px dashed ${theme.border}`, color: theme.textSecondary }}
            >
              <Camera className="h-5 w-5" />
              <span className="text-xs">Agregar</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );

  // Wizard Step 4: Resumen
  const wizardStep4 = (
    <div className="space-y-4">
      <div className="p-4 rounded-xl" style={{ backgroundColor: `${theme.primary}10`, border: `1px solid ${theme.primary}30` }}>
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="h-5 w-5" style={{ color: theme.primary }} />
          <span className="font-medium" style={{ color: theme.primary }}>Resumen del reclamo</span>
        </div>
        <p className="text-sm" style={{ color: theme.textSecondary }}>Revisa los datos antes de enviar</p>
      </div>
      <div className="space-y-3">
        <div className="flex items-center gap-3 p-3 rounded-xl" style={{ backgroundColor: theme.backgroundSecondary }}>
          <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: selectedCategoria ? (selectedCategoria.color || DEFAULT_CATEGORY_COLOR) : theme.border, color: 'white' }}>
            {selectedCategoria ? getCategoryIcon(selectedCategoria.nombre) : <FolderOpen className="h-5 w-5" />}
          </div>
          <div>
            <span className="text-xs" style={{ color: theme.textSecondary }}>Categoría</span>
            <p className="font-medium" style={{ color: theme.text }}>{selectedCategoria?.nombre || 'No seleccionada'}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 p-3 rounded-xl" style={{ backgroundColor: theme.backgroundSecondary }}>
          <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: '#10b981', color: 'white' }}>
            <MapPin className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <span className="text-xs" style={{ color: theme.textSecondary }}>Ubicación</span>
            <p className="font-medium" style={{ color: theme.text }}>{formData.direccion || 'No especificada'}</p>
            {selectedZona && <p className="text-xs" style={{ color: theme.textSecondary }}>{selectedZona.nombre}</p>}
          </div>
        </div>
        <div className="p-3 rounded-xl" style={{ backgroundColor: theme.backgroundSecondary }}>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: '#6366f1', color: 'white' }}>
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <span className="text-xs" style={{ color: theme.textSecondary }}>Detalles</span>
              <p className="font-medium" style={{ color: theme.text }}>{formData.titulo || 'Sin título'}</p>
            </div>
          </div>
          {formData.descripcion && (
            <p className="text-sm" style={{ color: theme.textSecondary, marginLeft: '52px' }}>
              {formData.descripcion.slice(0, 150)}{formData.descripcion.length > 150 && '...'}
            </p>
          )}
        </div>
        {selectedFiles.length > 0 && (
          <div className="p-3 rounded-xl" style={{ backgroundColor: theme.backgroundSecondary }}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: '#f59e0b', color: 'white' }}>
                <Camera className="h-5 w-5" />
              </div>
              <div>
                <span className="text-xs" style={{ color: theme.textSecondary }}>Fotos adjuntas</span>
                <p className="font-medium" style={{ color: theme.text }}>{selectedFiles.length} {selectedFiles.length === 1 ? 'archivo' : 'archivos'}</p>
              </div>
            </div>
            <div className="flex gap-2" style={{ marginLeft: '52px' }}>
              {previewUrls.map((url, index) => (
                <div key={index} className="w-12 h-12 rounded-lg overflow-hidden" style={{ border: `1px solid ${theme.border}` }}>
                  <img src={url} alt={`Preview ${index + 1}`} className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
          </div>
        )}
        {/* Datos de contacto */}
        <div className="flex items-center gap-3 p-3 rounded-xl" style={{ backgroundColor: theme.backgroundSecondary }}>
          <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: esAnonimo ? theme.primary : '#25D366', color: 'white' }}>
            {esAnonimo ? <ShieldCheck className="h-5 w-5" /> : <Phone className="h-5 w-5" />}
          </div>
          <div className="flex-1">
            <span className="text-xs" style={{ color: theme.textSecondary }}>Contacto</span>
            {esAnonimo ? (
              <>
                <p className="font-medium" style={{ color: theme.text }}>Reclamo anónimo</p>
                <p className="text-xs mt-1" style={{ color: theme.textSecondary }}>Sin datos de contacto</p>
              </>
            ) : (
              <>
                <p className="font-medium" style={{ color: theme.text }}>{formData.nombre_contacto || 'No especificado'}</p>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-xs flex items-center gap-1" style={{ color: theme.textSecondary }}>
                    <MessageCircle className="h-3 w-3" />
                    {formData.telefono_contacto || 'Sin WhatsApp'}
                  </span>
                  {formData.email_contacto && (
                    <span className="text-xs flex items-center gap-1" style={{ color: theme.textSecondary }}>
                      <Mail className="h-3 w-3" />
                      {formData.email_contacto}
                    </span>
                  )}
                </div>
              </>
            )}
          </div>
          {!esAnonimo && formData.recibir_notificaciones && (
            <div className="flex items-center gap-1 px-2 py-1 rounded-full text-xs" style={{ backgroundColor: '#25D36620', color: '#25D366' }}>
              <Bell className="h-3 w-3" />
              Notificaciones
            </div>
          )}
          {esAnonimo && (
            <div className="flex items-center gap-1 px-2 py-1 rounded-full text-xs" style={{ backgroundColor: `${theme.primary}20`, color: theme.primary }}>
              <ShieldCheck className="h-3 w-3" />
              Anónimo
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // Wizard Step 5: Datos de contacto
  const wizardStepContacto = (
    <div className="space-y-4">
      {/* Toggle entre anónimo y con datos */}
      <div className="space-y-3">
        {/* Opción Anónimo */}
        <button
          type="button"
          onClick={() => {
            setEsAnonimo(true);
            setFormData({
              ...formData,
              nombre_contacto: '',
              telefono_contacto: '',
              email_contacto: '',
              recibir_notificaciones: false,
            });
            setSelectedUser(null);
          }}
          className="w-full p-4 rounded-xl text-left transition-all"
          style={{
            backgroundColor: esAnonimo ? `${theme.primary}15` : theme.backgroundSecondary,
            border: `2px solid ${esAnonimo ? theme.primary : theme.border}`,
          }}
        >
          <div className="flex items-start gap-3">
            <div
              className="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5"
              style={{ borderColor: esAnonimo ? theme.primary : theme.border }}
            >
              {esAnonimo && (
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: theme.primary }} />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4" style={{ color: theme.primary }} />
                <span className="font-medium" style={{ color: theme.text }}>Reclamo anónimo</span>
              </div>
              <p className="text-xs mt-1" style={{ color: theme.textSecondary }}>
                No se requieren datos personales. El reclamo se registra sin identificar al vecino.
              </p>
            </div>
          </div>
        </button>

        {/* Opción Con datos */}
        <button
          type="button"
          onClick={() => setEsAnonimo(false)}
          className="w-full p-4 rounded-xl text-left transition-all"
          style={{
            backgroundColor: !esAnonimo ? `${theme.primary}15` : theme.backgroundSecondary,
            border: `2px solid ${!esAnonimo ? theme.primary : theme.border}`,
          }}
        >
          <div className="flex items-start gap-3">
            <div
              className="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5"
              style={{ borderColor: !esAnonimo ? theme.primary : theme.border }}
            >
              {!esAnonimo && (
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: theme.primary }} />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <User className="h-4 w-4" style={{ color: theme.primary }} />
                <span className="font-medium" style={{ color: theme.text }}>Con datos de contacto</span>
              </div>
              <p className="text-xs mt-1" style={{ color: theme.textSecondary }}>
                Proporciona tus datos para recibir actualizaciones sobre el estado del reclamo.
              </p>
            </div>
          </div>
        </button>
      </div>

      {/* Formulario de contacto - solo si NO es anónimo */}
      {!esAnonimo && (
        <>
          <div className="p-4 rounded-xl" style={{ backgroundColor: `${theme.primary}10`, border: `1px solid ${theme.primary}30` }}>
            <div className="flex items-center gap-2 mb-2">
              <MessageCircle className="h-5 w-5" style={{ color: theme.primary }} />
              <span className="font-medium" style={{ color: theme.primary }}>Datos de contacto para seguimiento</span>
            </div>
            <p className="text-sm" style={{ color: theme.textSecondary }}>
              Ingresa tus datos para recibir actualizaciones sobre el estado de tu reclamo por WhatsApp.
            </p>
          </div>

          {/* Nombre completo con búsqueda integrada */}
          <div className="relative">
        <label className="block text-sm font-medium mb-2" style={{ color: theme.text }}>
          Nombre completo <span className="text-red-500">*</span>
        </label>
        <div className="relative">
          {selectedUser ? (
            <User className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5" style={{ color: theme.primary }} />
          ) : (
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5" style={{ color: theme.textSecondary }} />
          )}
          <input
            type="text"
            value={formData.nombre_contacto}
            onChange={(e) => {
              setFormData({ ...formData, nombre_contacto: e.target.value });
              handleUserSearch(e.target.value);
            }}
            onFocus={() => {
              if (formData.nombre_contacto.length >= 2 && !selectedUser) {
                handleUserSearch(formData.nombre_contacto);
              }
            }}
            placeholder="Buscar por nombre, DNI o teléfono..."
            className="w-full pl-11 pr-10 py-3 rounded-xl focus:ring-2 focus:outline-none transition-all"
            style={{
              backgroundColor: theme.backgroundSecondary,
              color: theme.text,
              border: `1px solid ${selectedUser ? theme.primary : theme.border}`
            }}
          />
          {(loadingUsers || searchingUsers) && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 animate-spin" style={{ color: theme.textSecondary }} />
          )}
          {selectedUser && !loadingUsers && !searchingUsers && (
            <button
              type="button"
              onClick={clearUserSelection}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-red-500/20 transition-colors"
              title="Limpiar selección"
            >
              <X className="h-4 w-4 text-red-500" />
            </button>
          )}
        </div>
        {selectedUser ? (
          <p className="text-xs mt-1" style={{ color: theme.primary }}>
            Usuario encontrado - datos cargados automáticamente
          </p>
        ) : (
          <p className="text-xs mt-1" style={{ color: theme.textSecondary }}>
            Buscá por nombre, apellido, DNI o teléfono
          </p>
        )}

        {/* Resultados de búsqueda */}
        {showUserResults && userSearchResults.length > 0 && !selectedUser && (
          <div
            className="absolute z-50 w-full mt-1 rounded-xl shadow-lg overflow-hidden max-h-60 overflow-y-auto"
            style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
          >
            {userSearchResults.map((user) => (
              <button
                key={user.id}
                type="button"
                onClick={() => selectUser(user)}
                className="w-full text-left px-4 py-3 flex items-center gap-3 transition-colors hover:opacity-90"
                style={{ color: theme.text }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = theme.backgroundSecondary}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: `${theme.primary}20` }}>
                  <User className="h-4 w-4" style={{ color: theme.primary }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{user.nombre} {user.apellido}</p>
                  <p className="text-xs truncate" style={{ color: theme.textSecondary }}>
                    {user.dni && <span>DNI: {user.dni}</span>}
                    {user.dni && user.telefono && <span> • </span>}
                    {user.telefono && <span>{user.telefono}</span>}
                    {(user.dni || user.telefono) && user.email && <span> • </span>}
                    {user.email && <span>{user.email}</span>}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium mb-2" style={{ color: theme.text }}>
          WhatsApp <span className="text-red-500">*</span>
        </label>
        <div className="relative">
          <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5" style={{ color: theme.textSecondary }} />
          <input
            type="tel"
            value={formData.telefono_contacto}
            onChange={(e) => setFormData({ ...formData, telefono_contacto: e.target.value })}
            placeholder="Ej: 11 1234-5678"
            className="w-full pl-11 pr-4 py-3 rounded-xl focus:ring-2 focus:outline-none transition-all"
            style={{ backgroundColor: theme.backgroundSecondary, color: theme.text, border: `1px solid ${theme.border}` }}
          />
        </div>
        <p className="text-xs mt-1" style={{ color: theme.textSecondary }}>
          Recibirás notificaciones cuando tu reclamo cambie de estado
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2" style={{ color: theme.text }}>
          Email (opcional)
        </label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5" style={{ color: theme.textSecondary }} />
          <input
            type="email"
            value={formData.email_contacto}
            onChange={(e) => setFormData({ ...formData, email_contacto: e.target.value })}
            placeholder="Ej: juan@email.com"
            className="w-full pl-11 pr-4 py-3 rounded-xl focus:ring-2 focus:outline-none transition-all"
            style={{ backgroundColor: theme.backgroundSecondary, color: theme.text, border: `1px solid ${theme.border}` }}
          />
        </div>
      </div>

      <div
        className="p-4 rounded-xl cursor-pointer transition-all"
        style={{
          backgroundColor: formData.recibir_notificaciones ? `${theme.primary}10` : theme.backgroundSecondary,
          border: `1px solid ${formData.recibir_notificaciones ? theme.primary : theme.border}`,
        }}
        onClick={() => setFormData({ ...formData, recibir_notificaciones: !formData.recibir_notificaciones })}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {formData.recibir_notificaciones ? (
              <Bell className="h-5 w-5" style={{ color: theme.primary }} />
            ) : (
              <BellOff className="h-5 w-5" style={{ color: theme.textSecondary }} />
            )}
            <div>
              <p className="font-medium" style={{ color: theme.text }}>
                Recibir notificaciones por WhatsApp
              </p>
              <p className="text-xs" style={{ color: theme.textSecondary }}>
                Te avisaremos cuando el reclamo sea asignado, esté en proceso o se resuelva
              </p>
            </div>
          </div>
          <div
            className="w-12 h-6 rounded-full p-1 transition-all"
            style={{
              backgroundColor: formData.recibir_notificaciones ? theme.primary : theme.border,
            }}
          >
            <div
              className="w-4 h-4 rounded-full bg-white transition-transform"
              style={{
                transform: formData.recibir_notificaciones ? 'translateX(24px)' : 'translateX(0)',
              }}
            />
          </div>
        </div>
      </div>
        </>
      )}

      {/* Mensaje de confirmación para reclamo anónimo */}
      {esAnonimo && (
        <div className="p-4 rounded-xl" style={{ backgroundColor: `${theme.primary}10`, border: `1px solid ${theme.primary}30` }}>
          <div className="flex items-center gap-2 mb-2">
            <ShieldCheck className="h-5 w-5" style={{ color: theme.primary }} />
            <span className="font-medium" style={{ color: theme.primary }}>Reclamo anónimo</span>
          </div>
          <p className="text-sm" style={{ color: theme.textSecondary }}>
            Tu reclamo será registrado sin datos de contacto. No podrás recibir actualizaciones sobre el estado del mismo, pero igualmente será atendido por el municipio.
          </p>
        </div>
      )}
    </div>
  );

  // Descripciones de categorías para el asistente IA
  const categoryDescriptions: Record<string, { title: string; examples: string[]; tip: string }> = {
    'alumbrado': {
      title: 'Alumbrado Público',
      examples: ['Luminarias quemadas o parpadeantes', 'Postes de luz dañados o inclinados', 'Cables colgando', 'Zonas oscuras sin iluminación'],
      tip: 'Indica el número de poste si es visible'
    },
    'bache': {
      title: 'Baches y Calles',
      examples: ['Baches en calzada', 'Hundimientos en el asfalto', 'Calles en mal estado', 'Roturas por obras'],
      tip: 'Una foto del bache ayuda a evaluar la urgencia'
    },
    'agua': {
      title: 'Agua y Cloacas',
      examples: ['Pérdidas de agua en vía pública', 'Falta de presión de agua', 'Desborde de cloacas', 'Tapas de registro rotas'],
      tip: 'Si hay olor fuerte, mencionalo en la descripción'
    },
    'cloaca': {
      title: 'Cloacas y Desagües',
      examples: ['Desborde de cloacas', 'Malos olores', 'Tapas rotas o faltantes', 'Obstrucciones'],
      tip: 'Indicá si el problema es recurrente'
    },
    'arbolado': {
      title: 'Arbolado Urbano',
      examples: ['Árboles caídos o a punto de caer', 'Ramas que obstaculizan', 'Raíces que levantan veredas', 'Poda necesaria'],
      tip: 'Si hay riesgo de caída, indicalo como urgente'
    },
    'espacio': {
      title: 'Espacios Verdes',
      examples: ['Plazas descuidadas', 'Pasto muy alto', 'Juegos rotos', 'Bancos dañados', 'Falta de riego'],
      tip: 'Especificá qué área de la plaza está afectada'
    },
    'basura': {
      title: 'Residuos',
      examples: ['Basura acumulada', 'Contenedores llenos', 'Microbasurales', 'Residuos voluminosos abandonados'],
      tip: 'Si son residuos peligrosos, mencionalo'
    },
    'limpieza': {
      title: 'Limpieza',
      examples: ['Calles sucias', 'Grafitis', 'Desechos en vía pública', 'Necesidad de barrido'],
      tip: 'Indicá si es un problema recurrente'
    },
    'transito': {
      title: 'Tránsito',
      examples: ['Semáforos fallando', 'Señales caídas o vandalizadas', 'Problemas de estacionamiento', 'Calles mal señalizadas'],
      tip: 'Si afecta el flujo vehicular, indicá los horarios'
    },
    'señal': {
      title: 'Señalización',
      examples: ['Carteles rotos o caídos', 'Señales ilegibles', 'Falta de señalización', 'Nombres de calles borrosos'],
      tip: 'Describí qué tipo de señal falta o está dañada'
    },
    'plaga': {
      title: 'Plagas',
      examples: ['Roedores en vía pública', 'Mosquitos en exceso', 'Nidos de insectos peligrosos', 'Animales muertos'],
      tip: 'Si hay riesgo sanitario, se prioriza la atención'
    },
    'semaforo': {
      title: 'Semáforos',
      examples: ['Semáforo apagado', 'Tiempos desincronizados', 'Luces quemadas', 'Semáforo peatonal fallando'],
      tip: 'Indicá la intersección exacta'
    },
    'vereda': {
      title: 'Veredas',
      examples: ['Veredas rotas', 'Baldosas sueltas', 'Desniveles peligrosos', 'Obstáculos para discapacitados'],
      tip: 'Si hay riesgo de caída, mencionalo'
    },
    'mobiliario': {
      title: 'Mobiliario Urbano',
      examples: ['Bancos rotos', 'Cestos de basura dañados', 'Bebederos sin funcionar', 'Paradas de colectivo vandalizadas'],
      tip: 'Especificá qué elemento está dañado'
    },
    'ruido': {
      title: 'Ruidos Molestos',
      examples: ['Fiestas o eventos ruidosos', 'Obras fuera de horario', 'Locales con música alta', 'Alarmas que suenan constantemente'],
      tip: 'Indicá los horarios en que ocurre'
    },
    'default': {
      title: 'Otros Reclamos',
      examples: ['Cualquier problema no listado', 'Situaciones especiales', 'Consultas generales'],
      tip: 'Describí el problema con el mayor detalle posible'
    }
  };



  // Función para obtener descripción de categoría
  const getCategoryDescription = (nombre: string) => {
    const key = nombre.toLowerCase();
    for (const [k, desc] of Object.entries(categoryDescriptions)) {
      if (key.includes(k)) return desc;
    }
    return categoryDescriptions.default;
  };

  // AI Panel para el wizard
  const wizardAIPanel = (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: `${theme.primary}20` }}>
          <Sparkles className="h-4 w-4" style={{ color: theme.primary }} />
        </div>
        <span className="font-medium text-sm" style={{ color: theme.text }}>Asistente IA</span>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto">
        {/* Contenido dinámico según el paso */}

        {/* Paso 0: Describir - info general */}
        {wizardStep === 0 && (
          <div className="p-3 rounded-lg text-sm" style={{ backgroundColor: theme.card }}>
            <div className="flex items-start gap-2">
              <Lightbulb className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: theme.primary }} />
              <p style={{ color: theme.textSecondary }}>
                Describí el problema con detalle y te sugeriremos la categoría más adecuada automáticamente.
              </p>
            </div>
          </div>
        )}

        {/* Paso 1: Categoría */}
        {wizardStep === 1 && selectedCategoria ? (() => {
          const selColor = selectedCategoria.color || DEFAULT_CATEGORY_COLOR;
          return (
          <div className="space-y-3">
            <div className="p-3 rounded-lg" style={{ backgroundColor: `${selColor}15`, border: `1px solid ${selColor}30` }}>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ backgroundColor: selColor, color: 'white' }}>
                  {getCategoryIcon(selectedCategoria.nombre)}
                </div>
                <span className="font-medium text-sm" style={{ color: theme.text }}>
                  {getCategoryDescription(selectedCategoria.nombre).title}
                </span>
              </div>
            </div>

            <div className="p-3 rounded-lg text-sm" style={{ backgroundColor: theme.card }}>
              <p className="font-medium mb-2" style={{ color: theme.text }}>Ejemplos de reclamos:</p>
              <ul className="space-y-1">
                {getCategoryDescription(selectedCategoria.nombre).examples.map((example, i) => (
                  <li key={i} className="flex items-start gap-2" style={{ color: theme.textSecondary }}>
                    <span style={{ color: selColor }}>•</span>
                    {example}
                  </li>
                ))}
              </ul>
            </div>

            <div className="p-3 rounded-lg text-sm" style={{ backgroundColor: theme.card }}>
              <div className="flex items-start gap-2">
                <Lightbulb className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: '#f59e0b' }} />
                <p style={{ color: theme.textSecondary }}>
                  <span className="font-medium" style={{ color: theme.text }}>Tip: </span>
                  {getCategoryDescription(selectedCategoria.nombre).tip}
                </p>
              </div>
            </div>
          </div>
          );
        })() : wizardStep === 1 ? (
          <div className="p-3 rounded-lg text-sm" style={{ backgroundColor: theme.card }}>
            <div className="flex items-start gap-2">
              <Lightbulb className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: theme.primary }} />
              <p style={{ color: theme.textSecondary }}>
                Selecciona la categoría que mejor describa tu problema. Esto nos ayuda a asignarlo al equipo correcto.
              </p>
            </div>
          </div>
        ) : null}

        {/* Paso 2: Ubicación */}
        {wizardStep === 2 && (
          <div className="space-y-3">
            <div className="p-3 rounded-lg text-sm" style={{ backgroundColor: theme.card }}>
              <div className="flex items-start gap-2">
                <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: theme.primary }} />
                <p style={{ color: theme.textSecondary }}>
                  Escribe la dirección y selecciona del autocompletado. Luego ajusta el punto en el mapa si es necesario.
                </p>
              </div>
            </div>
            {formData.direccion && (
              <div className="p-3 rounded-lg text-sm" style={{ backgroundColor: `${theme.primary}10`, border: `1px solid ${theme.primary}30` }}>
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className="h-4 w-4" style={{ color: '#22c55e' }} />
                  <span className="font-medium" style={{ color: theme.text }}>Ubicación detectada</span>
                </div>
                <p style={{ color: theme.textSecondary }}>{formData.direccion}</p>
              </div>
            )}
          </div>
        )}

        {/* Paso 3: Detalles - Panel con sugerencias basadas en categoría */}
        {wizardStep === 3 && selectedCategoria && (
          <div className="space-y-3">
            {/* Estado inicial: esperando que escriba descripción */}
            {!formData.descripcion.trim() && !aiSuggestionsLoading && (
              <div className="p-3 rounded-lg text-sm" style={{ backgroundColor: theme.card }}>
                <div className="flex items-start gap-2">
                  <Lightbulb className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: theme.primary }} />
                  <p style={{ color: theme.textSecondary }}>
                    Escribí una descripción del problema y te daré sugerencias personalizadas.
                  </p>
                </div>
              </div>
            )}

            {/* Estado: analizando (debounce loading) */}
            {aiSuggestionsLoading && (
              <div className="p-3 rounded-lg" style={{ backgroundColor: `${theme.primary}10`, border: `1px solid ${theme.primary}30` }}>
                <div className="flex items-center gap-3">
                  <Loader2 className="h-4 w-4 animate-spin" style={{ color: theme.primary }} />
                  <div>
                    <span className="font-medium text-sm" style={{ color: theme.text }}>Analizando descripción...</span>
                    <p className="text-xs mt-1" style={{ color: theme.textSecondary }}>
                      Preparando sugerencias personalizadas
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Sugerencias de IA mostradas después del debounce */}
            {showAISuggestions && formData.descripcion.trim() && (
              <>
                {/* Respuesta de IA contextual */}
                {contextualAiResponse ? (
                  <div className="p-4 rounded-lg" style={{ backgroundColor: '#10b98115', border: '1px solid #10b98130' }}>
                    <div className="flex items-center gap-2 mb-3">
                      <Sparkles className="h-4 w-4" style={{ color: '#10b981' }} />
                      <span className="text-xs font-medium" style={{ color: '#10b981' }}>Asistente Municipal</span>
                    </div>
                    <p className="text-sm leading-relaxed" style={{ color: theme.text }}>
                      {contextualAiResponse}
                    </p>
                  </div>
                ) : (
                  /* Mensaje si la IA no está disponible */
                  <div className="p-3 rounded-lg" style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}` }}>
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4" style={{ color: theme.textSecondary }} />
                      <span className="text-sm" style={{ color: theme.textSecondary }}>Recomendaciones no disponibles</span>
                    </div>
                  </div>
                )}

                {formData.titulo && formData.descripcion && (
                  <div className="p-3 rounded-lg" style={{ backgroundColor: '#22c55e15', border: '1px solid #22c55e30' }}>
                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-4 w-4" style={{ color: '#22c55e' }} />
                      <span className="font-medium text-sm" style={{ color: '#22c55e' }}>Reclamo bien detallado</span>
                    </div>
                    <p className="text-xs mt-1" style={{ color: theme.textSecondary }}>
                      Los reclamos con buena descripción se resuelven hasta 40% más rápido.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Paso 4: Contacto */}
        {wizardStep === 4 && (
          <div className="space-y-3">
            <div className="p-3 rounded-lg text-sm" style={{ backgroundColor: '#25D36610', border: '1px solid #25D36630' }}>
              <div className="flex items-center gap-2 mb-2">
                <MessageCircle className="h-4 w-4" style={{ color: '#25D366' }} />
                <span className="font-medium" style={{ color: '#25D366' }}>WhatsApp</span>
              </div>
              <p style={{ color: theme.textSecondary }}>
                Te notificaremos automáticamente cuando:
              </p>
              <ul className="mt-2 space-y-1 text-xs" style={{ color: theme.textSecondary }}>
                <li>• Se asigne un empleado a tu reclamo</li>
                <li>• El trabajo esté en proceso</li>
                <li>• Tu reclamo sea resuelto</li>
              </ul>
            </div>

            <div className="p-3 rounded-lg text-sm" style={{ backgroundColor: theme.card }}>
              <div className="flex items-start gap-2">
                <Lightbulb className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: '#f59e0b' }} />
                <p style={{ color: theme.textSecondary }}>
                  Usa el formato <strong style={{ color: theme.text }}>11 1234-5678</strong> para tu número de WhatsApp (código de área + número).
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Paso 5: Resumen */}
        {wizardStep === 5 && (
          <div className="space-y-3">
            <div className="p-3 rounded-lg" style={{ backgroundColor: `${theme.primary}10`, border: `1px solid ${theme.primary}30` }}>
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="h-4 w-4" style={{ color: theme.primary }} />
                <span className="font-medium text-sm" style={{ color: theme.text }}>Casi listo</span>
              </div>
              <p className="text-xs" style={{ color: theme.textSecondary }}>
                Revisa que toda la información sea correcta y presiona "Enviar Reclamo".
              </p>
            </div>

            <div className="p-3 rounded-lg text-sm" style={{ backgroundColor: theme.card }}>
              <p className="font-medium mb-2" style={{ color: theme.text }}>¿Qué sigue?</p>
              <ol className="space-y-2 text-xs" style={{ color: theme.textSecondary }}>
                <li className="flex items-start gap-2">
                  <span className="w-4 h-4 rounded-full bg-blue-500 text-white text-xs flex items-center justify-center flex-shrink-0">1</span>
                  Tu reclamo será registrado
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-4 h-4 rounded-full bg-blue-500 text-white text-xs flex items-center justify-center flex-shrink-0">2</span>
                  Se asignará al equipo correspondiente
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-4 h-4 rounded-full bg-blue-500 text-white text-xs flex items-center justify-center flex-shrink-0">3</span>
                  Recibirás notificaciones del avance
                </li>
              </ol>
            </div>
          </div>
        )}

        {/* Respuesta de la IA */}
        {aiResponse && (
          <div className="p-3 rounded-lg text-sm" style={{ backgroundColor: `${theme.primary}10`, border: `1px solid ${theme.primary}30` }}>
            <div className="flex items-start gap-2">
              <Sparkles className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: theme.primary }} />
              <p style={{ color: theme.text }}>{aiResponse}</p>
            </div>
          </div>
        )}
      </div>

      {/* Input para preguntar */}
      <div className="mt-4 p-3 rounded-lg flex items-center gap-2" style={{ backgroundColor: theme.card }}>
        <input
          type="text"
          value={aiQuestion}
          onChange={(e) => setAiQuestion(e.target.value)}
          onKeyPress={handleAiKeyPress}
          placeholder="Hacé una pregunta..."
          disabled={aiLoading}
          className="flex-1 bg-transparent text-sm focus:outline-none disabled:opacity-50"
          style={{ color: theme.text }}
        />
        <button
          onClick={askAI}
          disabled={!aiQuestion.trim() || aiLoading}
          className="p-1.5 rounded-lg transition-colors disabled:opacity-50"
          style={{ backgroundColor: theme.primary, color: 'white' }}
        >
          {aiLoading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Send className="h-3 w-3" />
          )}
        </button>
      </div>
    </div>
  );

  const wizardSteps = [
    { id: 'describir', title: 'Describir', description: 'Contanos el problema', icon: <MessageCircle className="h-5 w-5" />, content: wizardStep0, isValid: !!descripcionInput.trim() },
    { id: 'categoria', title: 'Categoría', description: 'Selecciona el tipo de problema', icon: <FolderOpen className="h-5 w-5" />, content: wizardStep1, isValid: !!formData.categoria_id },
    { id: 'ubicacion', title: 'Ubicación', description: 'Indica dónde está el problema', icon: <MapPin className="h-5 w-5" />, content: wizardStep2, isValid: !!formData.direccion },
    { id: 'detalles', title: 'Detalles', description: 'Agregá más información', icon: <FileText className="h-5 w-5" />, content: wizardStep3, isValid: !!formData.titulo && !!formData.descripcion },
    { id: 'contacto', title: 'Contacto', description: 'Tus datos para seguimiento', icon: <Phone className="h-5 w-5" />, content: wizardStepContacto, isValid: esAnonimo || (!!formData.nombre_contacto && !!formData.telefono_contacto) },
    { id: 'resumen', title: 'Confirmar', description: 'Revisa y envía', icon: <CheckCircle2 className="h-5 w-5" />, content: wizardStep4, isValid: true },
  ];

  // Columnas para la vista de tabla
  const tableColumns = [
    {
      key: 'id',
      header: '#',
      sortValue: (r: Reclamo) => r.id,
      render: (r: Reclamo) => (
        <span className="font-mono text-xs" style={{ color: theme.textSecondary }}>#{r.id}</span>
      ),
    },
    {
      key: 'titulo',
      header: 'Título',
      width: '280px',
      sortValue: (r: Reclamo) => r.titulo,
      render: (r: Reclamo) => {
        const catColor = r.categoria.color || DEFAULT_CATEGORY_COLOR;
        return (
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: catColor + '20', color: catColor }}
          >
            {getCategoryIcon(r.categoria.nombre)}
          </div>
          <div className="min-w-0">
            <span className="text-sm font-medium block truncate" style={{ color: theme.text }}>{r.titulo}</span>
            <span
              className="text-[11px]"
              style={{ color: catColor }}
            >
              {r.categoria.nombre}
            </span>
          </div>
        </div>
        );
      },
    },
    {
      key: 'direccion',
      header: 'Ubicación',
      sortValue: (r: Reclamo) => r.direccion,
      render: (r: Reclamo) => (
        <div className="flex items-center gap-2 max-w-[200px]" title={r.direccion}>
          <MapPin className="h-4 w-4 flex-shrink-0" style={{ color: theme.textSecondary }} />
          <span className="truncate" style={{ color: theme.textSecondary }}>{r.direccion}</span>
        </div>
      ),
    },
    {
      key: 'estado',
      header: 'Estado',
      sortValue: (r: Reclamo) => r.estado,
      render: (r: Reclamo) => {
        const color = estadoColors[r.estado].bg;
        return (
          <span
            className="px-2.5 py-1 text-[11px] font-medium rounded-md whitespace-nowrap inline-flex items-center gap-1.5 shadow-sm"
            style={{
              backgroundColor: `${color}18`,
              color: color,
              border: `1px solid ${color}40`,
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: color }}
            />
            {estadoLabels[r.estado]}
          </span>
        );
      },
    },
    {
      key: 'vecino',
      header: 'Vecino',
      sortValue: (r: Reclamo) => `${r.creador?.nombre || ''} ${r.creador?.apellido || ''}`,
      render: (r: Reclamo) => (
        <div className="flex items-center gap-2">
          <div
            className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: `${theme.primary}15` }}
          >
            <User className="h-3 w-3" style={{ color: theme.primary }} />
          </div>
          <span className="truncate" style={{ color: theme.text }}>
            {r.creador ? `${r.creador.nombre} ${r.creador.apellido}` : r.es_anonimo ? 'Anónimo' : '-'}
          </span>
        </div>
      ),
    },
    {
      key: 'dependencia',
      header: 'Asignado',
      sortValue: (r: Reclamo) => r.dependencia_asignada?.nombre || '',
      render: (r: Reclamo) => {
        if (!r.dependencia_asignada?.nombre) return null;
        return (
          <span className="text-xs" style={{ color: theme.text }}>
            {r.dependencia_asignada.nombre}
          </span>
        );
      },
    },
    {
      key: 'creacion',
      header: 'Creación',
      sortValue: (r: Reclamo) => new Date(r.created_at).getTime(),
      render: (r: Reclamo) => (
        <span className="text-[10px]" style={{ color: theme.textSecondary }}>
          {new Date(r.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })}
        </span>
      ),
    },
    {
      key: 'modificacion',
      header: 'Modif.',
      sortValue: (r: Reclamo) => new Date(r.updated_at || r.created_at).getTime(),
      render: (r: Reclamo) => (
        <span className="text-[10px]" style={{ color: theme.text }}>
          {new Date(r.updated_at || r.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })}
        </span>
      ),
    },
    {
      key: 'vencimiento',
      header: 'Vence',
      sortValue: (r: Reclamo) => r.fecha_programada ? new Date(r.fecha_programada).getTime() : Infinity,
      render: (r: Reclamo) => {
        if (!r.fecha_programada) return null;
        const fechaProg = new Date(r.fecha_programada);
        const ahora = new Date();
        const diffMs = fechaProg.getTime() - ahora.getTime();
        const diffDias = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

        const vencido = diffDias < 0;
        const porVencer = !vencido && diffDias <= 3;
        const color = vencido ? '#ef4444' : porVencer ? '#f59e0b' : '#10b981';
        const bg = vencido ? '#ef444420' : porVencer ? '#f59e0b20' : '#10b98120';

        const diasAbs = Math.abs(diffDias);
        let texto: string;
        if (diffDias === 0) {
          texto = 'Hoy';
        } else if (diasAbs < 30) {
          texto = vencido ? `-${diasAbs} días` : `${diasAbs} días`;
        } else {
          const meses = Math.floor(diasAbs / 30);
          texto = vencido ? `-${meses} ${meses > 1 ? 'meses' : 'mes'}` : `${meses} ${meses > 1 ? 'meses' : 'mes'}`;
        }

        return (
          <span
            className="text-[10px] font-medium px-1.5 py-0.5 rounded-full whitespace-nowrap"
            style={{ color, backgroundColor: bg }}
          >
            {texto}
          </span>
        );
      },
    },
  ];

  // Renderizar contenido del Sheet de ver
  const renderViewContent = () => {
    if (!selectedReclamo) return null;

    return (
      <div className="space-y-4">
        {/* Zona si existe */}
        {selectedReclamo.zona && (
          <ABMField
            label="Zona"
            value={selectedReclamo.zona.nombre}
            icon={<MapPin className="h-4 w-4" style={{ color: theme.textSecondary }} />}
          />
        )}

        <ABMField
          label="Dirección"
          value={selectedReclamo.referencia ? `${selectedReclamo.direccion} (Ref: ${selectedReclamo.referencia})` : selectedReclamo.direccion}
          icon={<MapPin className="h-4 w-4" style={{ color: theme.textSecondary }} />}
          fullWidth
        />

        {/* Descripción en su propio panel colapsable */}
        <ABMCollapsible
          title="Descripción del Reclamo"
          icon={<FileText className="h-4 w-4" />}
          defaultOpen={true}
        >
          <p className="text-sm leading-relaxed" style={{ color: theme.text }}>
            {selectedReclamo.descripcion}
          </p>
        </ABMCollapsible>

        {/* Creador */}
        <ABMInfoPanel
          title="Datos del Vecino"
          icon={<User className="h-4 w-4" />}
          variant="default"
        >
          <ABMField
            label="Nombre"
            value={`${selectedReclamo.creador.nombre} ${selectedReclamo.creador.apellido}`}
          />
          <ABMField
            label="Email"
            value={selectedReclamo.creador.email}
            icon={<Mail className="h-4 w-4" style={{ color: theme.textSecondary }} />}
          />
          {selectedReclamo.creador.telefono && (
            <ABMField
              label="Teléfono"
              value={selectedReclamo.creador.telefono}
              icon={<Phone className="h-4 w-4" style={{ color: theme.textSecondary }} />}
            />
          )}
        </ABMInfoPanel>

        {/* Dependencia asignada */}
        {selectedReclamo.dependencia_asignada?.nombre && (
          <ABMInfoPanel
            title="Asignado a"
            icon={<Building2 className="h-4 w-4" />}
            variant="info"
          >
            <ABMField
              label="Dependencia"
              value={selectedReclamo.dependencia_asignada.nombre}
            />
            {/* Mostrar tiempo estimado si ya fue recibido */}
            {selectedReclamo.estado === 'recibido' && selectedReclamo.fecha_estimada_resolucion && (
              <ABMField
                label="Resolución estimada"
                value={new Date(selectedReclamo.fecha_estimada_resolucion).toLocaleString('es-AR', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
                icon={<Clock className="h-4 w-4" style={{ color: theme.primary }} />}
              />
            )}
          </ABMInfoPanel>
        )}

        {/* Tiempo estimado de resolución - Solo para aceptar reclamos nuevos */}
        {selectedReclamo.estado === 'nuevo' && selectedReclamo.dependencia_asignada && !dependenciaSeleccionada && (
          <ABMInfoPanel
            title="Tiempo estimado de resolución"
            icon={<Clock className="h-4 w-4" />}
            variant="default"
          >
            <div className="space-y-3">
              <p className="text-sm" style={{ color: theme.textSecondary }}>
                Indicá en cuánto tiempo estimás resolver este reclamo
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: theme.textSecondary }}>
                    Días
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="365"
                    value={tiempoEstimadoDias}
                    onChange={(e) => setTiempoEstimadoDias(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full rounded-xl px-4 py-3 focus:ring-2 focus:outline-none transition-all"
                    style={{
                      backgroundColor: theme.backgroundSecondary,
                      color: theme.text,
                      border: `1px solid ${theme.border}`,
                    }}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: theme.textSecondary }}>
                    Horas
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="23"
                    value={tiempoEstimadoHoras}
                    onChange={(e) => setTiempoEstimadoHoras(Math.max(0, Math.min(23, parseInt(e.target.value) || 0)))}
                    className="w-full rounded-xl px-4 py-3 focus:ring-2 focus:outline-none transition-all"
                    style={{
                      backgroundColor: theme.backgroundSecondary,
                      color: theme.text,
                      border: `1px solid ${theme.border}`,
                    }}
                  />
                </div>
              </div>
              {(tiempoEstimadoDias > 0 || tiempoEstimadoHoras > 0) && (
                <div
                  className="rounded-xl p-3 flex items-center gap-2"
                  style={{ backgroundColor: `${theme.primary}15`, border: `1px solid ${theme.primary}30` }}
                >
                  <Clock className="h-4 w-4" style={{ color: theme.primary }} />
                  <span className="text-sm" style={{ color: theme.text }}>
                    Resolución estimada: {' '}
                    <strong>
                      {new Date(Date.now() + (tiempoEstimadoDias * 24 + tiempoEstimadoHoras) * 60 * 60 * 1000).toLocaleString('es-AR', {
                        weekday: 'long',
                        day: 'numeric',
                        month: 'long',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </strong>
                  </span>
                </div>
              )}

              {/* Comentario obligatorio */}
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: theme.textSecondary }}>
                  Comentario <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <textarea
                  value={comentarioAsignacion}
                  onChange={(e) => setComentarioAsignacion(e.target.value)}
                  placeholder="Indicá cómo se va a resolver este reclamo..."
                  rows={3}
                  className="w-full rounded-xl px-4 py-3 focus:ring-2 focus:outline-none transition-all resize-none"
                  style={{
                    backgroundColor: theme.backgroundSecondary,
                    color: theme.text,
                    border: `1px solid ${theme.border}`,
                  }}
                />
              </div>
            </div>
          </ABMInfoPanel>
        )}

        {/* Resolución */}
        {selectedReclamo.resolucion && (
          <ABMInfoPanel
            title="Resolución"
            icon={<FileCheck className="h-4 w-4" />}
            variant="success"
          >
            <p className="text-sm mb-2">{selectedReclamo.resolucion}</p>
            {selectedReclamo.fecha_resolucion && (
              <p className="text-xs opacity-80">
                {new Date(selectedReclamo.fecha_resolucion).toLocaleString()}
              </p>
            )}
          </ABMInfoPanel>
        )}

        {/* Rechazo */}
        {selectedReclamo.motivo_rechazo && (
          <ABMInfoPanel
            title="Motivo de Rechazo"
            icon={<XCircle className="h-4 w-4" />}
            variant="danger"
          >
            <p className="text-sm font-medium mb-1">{selectedReclamo.motivo_rechazo}</p>
            {selectedReclamo.descripcion_rechazo && (
              <p className="text-sm opacity-90">{selectedReclamo.descripcion_rechazo}</p>
            )}
          </ABMInfoPanel>
        )}

        {/* Acciones según estado */}
        {selectedReclamo.estado === 'nuevo' && (
          <ABMCollapsible
            title={selectedReclamo.dependencia_asignada ? "Reasignar a otra dependencia" : "Asignar Dependencia"}
            icon={<Building2 className="h-4 w-4" />}
            defaultOpen={!selectedReclamo.dependencia_asignada}
          >
            <div className="space-y-3">
              {/* Info: Los reclamos se asignan a dependencias basándose en la categoría */}
              {selectedReclamo?.dependencia_asignada && !dependenciaSeleccionada && (
                <div
                  className="rounded-xl p-3 flex items-center gap-2"
                  style={{ backgroundColor: `${theme.primary}10`, border: `1px solid ${theme.border}` }}
                >
                  <span className="text-sm" style={{ color: theme.textSecondary }}>
                    Selecciona una dependencia diferente si deseas reasignar
                  </span>
                </div>
              )}

              {/* Selector de dependencia */}
              {dependenciasDisponibles.length > 0 ? (
                <ModernSelect
                  value={dependenciaSeleccionada}
                  onChange={(value) => setDependenciaSeleccionada(value || '')}
                  placeholder={selectedReclamo.dependencia_asignada ? "Seleccionar otra dependencia..." : "Seleccionar dependencia..."}
                  searchable={dependenciasDisponibles.length > 5}
                  onOpen={() => setSugerenciasColapsadas(true)}
                  onClose={(selectedValue) => {
                    if (selectedValue === null && !dependenciaSeleccionada) {
                      setSugerenciasColapsadas(false);
                    }
                  }}
                  options={dependenciasDisponibles.map(dep => ({
                    value: String(dep.id),
                    label: dep.dependencia?.nombre || dep.nombre || `Dependencia #${dep.id}`,
                    description: dep.dependencia?.descripcion || 'Área municipal',
                    icon: <Building2 className="h-4 w-4" />,
                    color: dep.dependencia?.color || '#6366f1',
                  }))}
                />
              ) : (
                <div className="text-sm py-2 px-3 rounded-lg" style={{ backgroundColor: theme.card, color: theme.textSecondary }}>
                  No hay dependencias disponibles
                </div>
              )}

              {/* Botón para cancelar reasignación */}
              {dependenciaSeleccionada && selectedReclamo.dependencia_asignada && (
                <button
                  onClick={() => setDependenciaSeleccionada('')}
                  className="text-sm px-3 py-1.5 rounded-lg transition-all hover:opacity-80"
                  style={{ backgroundColor: `${theme.primary}15`, color: theme.primary }}
                >
                  Cancelar reasignación
                </button>
              )}

              {/* Programación - Solo se muestra cuando hay empleado seleccionado */}
              {dependenciaSeleccionada && (
                <div className="space-y-3">
                  {/* Loading de disponibilidad */}
                  {loadingDisponibilidad && (
                    <div className="flex items-center justify-center py-3">
                      <div className="h-5 w-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: theme.primary, borderTopColor: 'transparent' }} />
                      <span className="ml-2 text-sm" style={{ color: theme.textSecondary }}>Buscando disponibilidad...</span>
                    </div>
                  )}

                  {/* Mostrar fecha y horarios cuando hay disponibilidad */}
                  {!loadingDisponibilidad && disponibilidad && (
                    <>
                      {/* Fecha programada - renglón completo */}
                      <div>
                        <label className="block text-xs font-medium mb-1.5" style={{ color: theme.textSecondary }}>
                          Fecha programada
                        </label>
                        <input
                          type="date"
                          value={fechaProgramada}
                          min={new Date().toISOString().split('T')[0]}
                          onChange={(e) => {
                            setFechaProgramada(e.target.value);
                            if (dependenciaSeleccionada && e.target.value) {
                              fetchDisponibilidad(dependenciaSeleccionada, e.target.value, true);
                            }
                          }}
                          className="w-full rounded-xl px-4 py-3 focus:ring-2 focus:outline-none transition-all"
                          style={{
                            backgroundColor: theme.backgroundSecondary,
                            color: theme.text,
                            border: `1px solid ${theme.border}`,
                          }}
                        />
                      </div>

                      {/* Hora inicio y Duración - divididos */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium mb-1.5" style={{ color: theme.textSecondary }}>
                            Hora inicio
                          </label>
                          <input
                            type="time"
                            value={horaInicio}
                            onChange={(e) => setHoraInicio(e.target.value)}
                            className="w-full rounded-xl px-4 py-3 focus:ring-2 focus:outline-none transition-all"
                            style={{
                              backgroundColor: theme.backgroundSecondary,
                              color: theme.text,
                              border: `1px solid ${theme.border}`,
                            }}
                          />
                        </div>
                        <ModernSelect
                          label="Duración"
                          value={duracion}
                          onChange={setDuracion}
                          options={duracionOptions.map(opt => ({
                            value: opt.value,
                            label: opt.label,
                            icon: <Clock className="h-4 w-4" />,
                          }))}
                        />
                      </div>

                      {/* Info de horario */}
                      {horaFin <= disponibilidad.hora_fin_jornada.slice(0, 5) ? (
                        <p className="text-xs" style={{ color: theme.textSecondary }}>
                          Horario: {horaInicio} - {horaFin}
                          <span className="ml-2" style={{ color: theme.primary }}>
                            (Jornada: 09:00 - {disponibilidad.hora_fin_jornada.slice(0, 5)})
                          </span>
                        </p>
                      ) : (
                        <div
                          className="rounded-lg p-3 text-sm flex items-center gap-2"
                          style={{ backgroundColor: '#ef444420', border: '1px solid #ef4444' }}
                        >
                          <AlertTriangle className="h-4 w-4 flex-shrink-0" style={{ color: '#ef4444' }} />
                          <span style={{ color: '#ef4444' }}>
                            El horario {horaInicio} - {horaFin} excede la jornada laboral (hasta {disponibilidad.hora_fin_jornada.slice(0, 5)})
                          </span>
                        </div>
                      )}

                      {/* Mostrar horarios ocupados si los hay */}
                      {disponibilidad.bloques_ocupados.length > 0 && (
                        <div
                          className="rounded-lg p-3 text-sm"
                          style={{ backgroundColor: `${theme.primary}10`, border: `1px solid ${theme.primary}30` }}
                        >
                          <p className="font-medium mb-2" style={{ color: theme.text }}>
                            <Clock className="h-4 w-4 inline mr-1" />
                            Horarios ocupados ese día:
                          </p>
                          {disponibilidad.bloques_ocupados.map((bloque, idx) => (
                            <div key={idx} className="text-xs pl-5 py-0.5" style={{ color: theme.textSecondary }}>
                              • {bloque.hora_inicio.slice(0, 5)} - {bloque.hora_fin.slice(0, 5)}: {bloque.titulo}
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              <ABMTextarea
                value={comentarioAsignacion}
                onChange={(e) => setComentarioAsignacion(e.target.value)}
                placeholder="Comentario (opcional)"
                rows={2}
              />
            </div>
          </ABMCollapsible>
        )}

        {selectedReclamo.estado === 'asignado' && (
          <ABMInfoPanel
            title="Iniciar Trabajo"
            icon={<Play className="h-4 w-4" />}
            variant="warning"
          >
            <p className="text-sm" style={{ color: theme.textSecondary }}>
              Marcar que el empleado ha comenzado a trabajar en este reclamo.
            </p>
          </ABMInfoPanel>
        )}

        {selectedReclamo.estado === 'en_proceso' && (
          <ABMCollapsible
            title="Finalizar Trabajo"
            icon={<CheckCircle className="h-4 w-4" />}
            defaultOpen={true}
            variant={tipoFinalizacion === 'resuelto' ? 'success' : 'warning'}
          >
            <div className="space-y-4">
              {/* Selector de tipo de finalización */}
              <div className="flex gap-2">
                <button
                  onClick={() => setTipoFinalizacion('resuelto')}
                  className="flex-1 p-3 rounded-xl text-sm font-medium transition-all"
                  style={{
                    backgroundColor: tipoFinalizacion === 'resuelto' ? '#22c55e20' : theme.backgroundSecondary,
                    border: `2px solid ${tipoFinalizacion === 'resuelto' ? '#22c55e' : 'transparent'}`,
                    color: tipoFinalizacion === 'resuelto' ? '#22c55e' : theme.textSecondary,
                  }}
                >
                  <CheckCircle className="h-5 w-5 mx-auto mb-1" />
                  Trabajo Exitoso
                </button>
                <button
                  onClick={() => setTipoFinalizacion('no_finalizado')}
                  className="flex-1 p-3 rounded-xl text-sm font-medium transition-all"
                  style={{
                    backgroundColor: tipoFinalizacion === 'no_finalizado' ? '#f59e0b20' : theme.backgroundSecondary,
                    border: `2px solid ${tipoFinalizacion === 'no_finalizado' ? '#f59e0b' : 'transparent'}`,
                    color: tipoFinalizacion === 'no_finalizado' ? '#f59e0b' : theme.textSecondary,
                  }}
                >
                  <XCircle className="h-5 w-5 mx-auto mb-1" />
                  No Finalizado
                </button>
              </div>

              {/* Campos según tipo */}
              {tipoFinalizacion === 'resuelto' ? (
                <ABMTextarea
                  label=""
                  value={resolucion}
                  onChange={(e) => setResolucion(e.target.value)}
                  placeholder="Describe cómo se resolvió el problema"
                  rows={3}
                  required
                />
              ) : (
                <>
                  <select
                    value={motivoNoFinalizado}
                    onChange={(e) => setMotivoNoFinalizado(e.target.value)}
                    className="w-full rounded-xl px-4 py-2.5 focus:ring-2 focus:outline-none transition-all duration-200"
                    style={{
                      backgroundColor: theme.card,
                      color: theme.text,
                      border: `1px solid ${theme.border}`
                    }}
                  >
                    <option value="">Seleccionar motivo...</option>
                    <option value="falta_materiales">Falta de materiales</option>
                    <option value="falta_herramientas">Falta de herramientas</option>
                    <option value="acceso_imposible">No se pudo acceder al lugar</option>
                    <option value="clima">Condiciones climáticas</option>
                    <option value="requiere_mas_personal">Requiere más personal</option>
                    <option value="requiere_otra_area">Requiere intervención de otra área</option>
                    <option value="vecino_ausente">Vecino ausente</option>
                    <option value="otro">Otro motivo</option>
                  </select>
                  <ABMTextarea
                    label=""
                    value={resolucion}
                    onChange={(e) => setResolucion(e.target.value)}
                    placeholder="Describe por qué no se pudo finalizar el trabajo..."
                    rows={2}
                  />
                  <p className="text-xs" style={{ color: theme.textSecondary }}>
                    El reclamo volverá a estado "Asignado" para reprogramar el trabajo.
                  </p>
                </>
              )}
            </div>
          </ABMCollapsible>
        )}

        {motivoRechazo && selectedReclamo.estado === 'nuevo' && (
          <ABMInfoPanel
            title="Rechazar Reclamo"
            icon={<XCircle className="h-4 w-4" />}
            variant="danger"
          >
            <div className="space-y-3">
              <select
                value={motivoRechazo}
                onChange={(e) => setMotivoRechazo(e.target.value)}
                className="w-full rounded-xl px-4 py-2.5 focus:ring-2 focus:outline-none transition-all duration-200"
                style={{
                  backgroundColor: theme.card,
                  color: theme.text,
                  border: `1px solid ${theme.border}`
                }}
              >
                <option value="no_competencia">No es competencia municipal</option>
                <option value="duplicado">Reclamo duplicado</option>
                <option value="info_insuficiente">Información insuficiente</option>
                <option value="fuera_jurisdiccion">Fuera de jurisdicción</option>
                <option value="otro">Otro motivo</option>
              </select>
              <ABMTextarea
                label=""
                value={descripcionRechazo}
                onChange={(e) => setDescripcionRechazo(e.target.value)}
                placeholder="Descripción del rechazo (opcional)"
                rows={2}
              />
              <div className="flex gap-2">
                <button
                  onClick={() => setMotivoRechazo('')}
                  className="flex-1 px-4 py-2.5 rounded-xl font-medium transition-all duration-200 hover:scale-105 active:scale-95"
                  style={{
                    backgroundColor: theme.card,
                    color: theme.text,
                    border: `1px solid ${theme.border}`
                  }}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleRechazar}
                  disabled={saving}
                  className="flex-1 px-4 py-2.5 rounded-xl font-medium transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100"
                  style={{ backgroundColor: '#dc2626', color: '#ffffff' }}
                >
                  {saving ? 'Rechazando...' : 'Confirmar Rechazo'}
                </button>
              </div>
            </div>
          </ABMInfoPanel>
        )}

      </div>
    );
  };

  // Renderizar sticky header para el Sheet (estado + categoría + botón historial)
  const renderSheetStickyHeader = () => {
    if (!selectedReclamo) return null;

    const categoryColor = selectedReclamo.categoria.color || DEFAULT_CATEGORY_COLOR;
    const estadoColor = estadoColors[selectedReclamo.estado].bg;

    return (
      <div className="flex items-center gap-2">
        {/* Estado */}
        <span
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-full"
          style={{
            backgroundColor: estadoColor,
            color: '#ffffff'
          }}
        >
          {getEstadoIcon(selectedReclamo.estado)}
          {estadoLabels[selectedReclamo.estado]}
        </span>
        {/* Categoría */}
        <span
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg"
          style={{
            backgroundColor: `${categoryColor}15`,
            color: categoryColor,
            border: `1px solid ${categoryColor}40`
          }}
        >
          {getCategoryIcon(selectedReclamo.categoria.nombre)}
          {selectedReclamo.categoria.nombre}
        </span>
        {/* Historial */}
        <button
          onClick={() => {
            closeSheet();
            navigate(`/gestion/reclamos/${selectedReclamo.id}`);
          }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors hover:opacity-80"
          style={{
            backgroundColor: theme.backgroundSecondary,
            color: theme.primary,
            border: `1px solid ${theme.border}`
          }}
          title="Ver historial completo"
        >
          <Clock className="h-3.5 w-3.5" />
          Historial
        </button>
      </div>
    );
  };

  // Renderizar footer de acciones para el Sheet
  const renderSheetFooter = () => {
    if (!selectedReclamo) return null;

    const canAsignar = selectedReclamo.estado === 'nuevo';
    const canIniciar = selectedReclamo.estado === 'asignado';
    const canResolver = selectedReclamo.estado === 'en_proceso';
    // Puede aceptar si ya tiene dependencia asignada y no quiere reasignar
    const canAceptar = canAsignar && selectedReclamo.dependencia_asignada && !dependenciaSeleccionada;

    return (
      <div className="flex gap-2">
        {/* Botón Aceptar - para estado nuevo con dependencia ya asignada */}
        {canAceptar && (
          <>
            <button
              onClick={handleAceptar}
              disabled={saving}
              className="flex-1 px-4 py-2.5 rounded-xl font-medium transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100 shadow-lg"
              style={{
                backgroundColor: '#16a34a',
                color: '#ffffff',
                boxShadow: '0 4px 14px rgba(22, 163, 74, 0.4)'
              }}
            >
              {saving ? 'Aceptando...' : 'Aceptar'}
            </button>
            <button
              onClick={() => setMotivoRechazo('otro')}
              className="px-4 py-2.5 rounded-xl font-medium transition-all duration-200 hover:scale-105 active:scale-95"
              style={{
                backgroundColor: '#ef444415',
                border: '1px solid #ef444450',
                color: '#ef4444'
              }}
            >
              Rechazar
            </button>
          </>
        )}

        {/* Botón Asignar/Reasignar - para estado nuevo sin dependencia o queriendo reasignar */}
        {canAsignar && !canAceptar && (
          <>
            <button
              onClick={handleAsignar}
              disabled={saving || !dependenciaSeleccionada || !!(disponibilidad && horaFin > disponibilidad.hora_fin_jornada.slice(0, 5))}
              className="flex-1 px-4 py-2.5 rounded-xl font-medium transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100 disabled:cursor-not-allowed shadow-lg"
              style={{
                backgroundColor: theme.primary,
                color: '#ffffff',
                boxShadow: `0 4px 14px ${theme.primary}40`
              }}
            >
              {saving ? 'Asignando...' : selectedReclamo.dependencia_asignada ? 'Reasignar' : 'Asignar'}
            </button>
            <button
              onClick={() => setMotivoRechazo('otro')}
              className="px-4 py-2.5 rounded-xl font-medium transition-all duration-200 hover:scale-105 active:scale-95"
              style={{
                backgroundColor: '#ef444415',
                border: '1px solid #ef444450',
                color: '#ef4444'
              }}
            >
              Rechazar
            </button>
          </>
        )}

        {/* Botón Iniciar - para estado asignado */}
        {canIniciar && (
          <button
            onClick={handleIniciar}
            disabled={saving}
            className="flex-1 px-4 py-2.5 rounded-xl font-medium transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100 shadow-lg"
            style={{
              backgroundColor: theme.primary,
              color: '#ffffff',
              boxShadow: `0 4px 14px ${theme.primary}40`
            }}
          >
            {saving ? 'Iniciando...' : 'Iniciar Trabajo'}
          </button>
        )}

        {/* Botón Resolver/No Finalizar - para estado en_proceso */}
        {canResolver && tipoFinalizacion === 'resuelto' && (
          <button
            onClick={handleResolver}
            disabled={saving || !resolucion}
            className="flex-1 px-4 py-2.5 rounded-xl font-medium transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100 disabled:cursor-not-allowed shadow-lg"
            style={{
              backgroundColor: '#16a34a',
              color: '#ffffff',
              boxShadow: '0 4px 14px rgba(22, 163, 74, 0.4)'
            }}
          >
            {saving ? 'Resolviendo...' : 'Marcar Resuelto'}
          </button>
        )}
        {canResolver && tipoFinalizacion === 'no_finalizado' && (
          <button
            onClick={handleNoFinalizado}
            disabled={saving || !motivoNoFinalizado}
            className="flex-1 px-4 py-2.5 rounded-xl font-medium transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100 disabled:cursor-not-allowed"
            style={{
              backgroundColor: `${theme.primary}20`,
              color: theme.primary,
              border: `1px solid ${theme.primary}50`
            }}
          >
            {saving ? 'Procesando...' : 'Volver a Asignado'}
          </button>
        )}

        {/* Estados finales - solo info */}
        {(selectedReclamo.estado === 'resuelto' || selectedReclamo.estado === 'rechazado') && (
          <div
            className="flex-1 px-4 py-2.5 rounded-xl font-medium text-center"
            style={{
              backgroundColor: selectedReclamo.estado === 'resuelto' ? '#16a34a20' : '#ef444420',
              color: selectedReclamo.estado === 'resuelto' ? '#16a34a' : '#ef4444',
              border: `1px solid ${selectedReclamo.estado === 'resuelto' ? '#16a34a50' : '#ef444450'}`
            }}
          >
            {selectedReclamo.estado === 'resuelto' ? '✓ Resuelto' : '✗ Rechazado'}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <ABMPage
        title={soloMiArea ? "Reclamos del Área" : (soloMisTrabajos ? "Mis Trabajos" : "Reclamos")}
        buttonLabel={soloMisTrabajos || soloMiArea || user?.rol === 'empleado' ? undefined : "Nuevo Reclamo"}
        onAdd={soloMisTrabajos || soloMiArea || user?.rol === 'empleado' ? undefined : openWizard}
        searchPlaceholder="Buscar reclamos..."
        searchValue={search}
        onSearchChange={setSearch}
        loading={false}
        isEmpty={!loading && filteredReclamos.length === 0}
        emptyMessage={debouncedSearch ? `No se encontraron reclamos para "${debouncedSearch}"` : "No se encontraron reclamos"}
        sheetOpen={false}
        sheetTitle=""
        sheetDescription=""
        onSheetClose={() => {}}
        extraFilters={undefined}
        headerActions={
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setOrdenamiento('reciente')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all hover:scale-105 active:scale-95 whitespace-nowrap"
              style={{
                backgroundColor: ordenamiento === 'reciente' ? `${theme.primary}15` : theme.backgroundSecondary,
                border: `1px solid ${ordenamiento === 'reciente' ? theme.primary : theme.border}`,
                color: ordenamiento === 'reciente' ? theme.primary : theme.textSecondary,
              }}
            >
              <ArrowUpDown className="h-3 w-3" />
              Más recientes
            </button>
            <button
              onClick={() => setOrdenamiento('programado')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all hover:scale-105 active:scale-95 whitespace-nowrap"
              style={{
                backgroundColor: ordenamiento === 'programado' ? `${theme.primary}15` : theme.backgroundSecondary,
                border: `1px solid ${ordenamiento === 'programado' ? theme.primary : theme.border}`,
                color: ordenamiento === 'programado' ? theme.primary : theme.textSecondary,
              }}
            >
              <Calendar className="h-3 w-3" />
              Por vencer
            </button>
          </div>
        }
        stickyHeader={user?.rol === 'supervisor' || user?.rol === 'admin' || user?.rol === 'empleado'}
        secondaryFilters={
          <div className="w-full flex flex-col gap-1">
            {/* Categorías - botón Todas fijo + scroll horizontal */}
            <div className="flex gap-1">
              {/* Botón Todas fijo - outlined */}
              <button
                onClick={() => {
                  setFilterLoading('cat-all');
                  setFiltroCategoria(null);
                }}
                className="flex items-center gap-1 px-2 py-1 rounded-md transition-all h-[28px] flex-shrink-0"
                style={{
                  background: 'transparent',
                  border: `1.5px solid ${filtroCategoria === null ? theme.primary : theme.border}`,
                }}
              >
                <Tag className={`h-3 w-3 ${filterLoading === 'cat-all' ? 'animate-pulse-fade' : ''}`} style={{ color: filtroCategoria === null ? theme.primary : theme.textSecondary }} />
                <span className={`text-[10px] font-medium whitespace-nowrap ${filterLoading === 'cat-all' ? 'animate-pulse-fade' : ''}`} style={{ color: filtroCategoria === null ? theme.primary : theme.textSecondary }}>
                  Todas
                </span>
              </button>

              {/* Scroll de categorías */}
              <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide flex-1 min-w-0">
              {/* Skeleton solo si no hay categorías cargadas (carga inicial) */}
              {categorias.length === 0 || Object.keys(conteosCategorias).length === 0 ? (
                <FilterRowSkeleton count={6} height={28} widths={[50, 65, 80, 50, 65, 80]} />
              ) : (
              <>
              {/* Mostrar categorías con conteo > 0 O que tengan reclamos cargados en la lista actual */}
              {categorias.filter((cat) => (conteosCategorias[cat.id] || 0) > 0 || reclamos.some(r => r.categoria.id === cat.id)).map((cat) => {
                const isSelected = filtroCategoria === cat.id;
                const catColor = cat.color || DEFAULT_CATEGORY_COLOR;
                const count = conteosCategorias[cat.id] || 0;
                const isLoadingThis = filterLoading === `cat-${cat.id}`;
                return (
                  <button
                    key={cat.id}
                    onClick={() => {
                      setFilterLoading(`cat-${cat.id}`);
                      setFiltroCategoria(isSelected ? null : cat.id);
                    }}
                    title={cat.nombre}
                    className="flex items-center gap-1 px-2 py-1 rounded-md transition-all h-[28px] flex-shrink-0"
                    style={{
                      background: isSelected ? catColor : theme.backgroundSecondary,
                      border: `1px solid ${isSelected ? catColor : theme.border}`,
                    }}
                  >
                    <span className={`[&>svg]:h-3 [&>svg]:w-3 ${isLoadingThis ? 'animate-pulse-fade' : ''}`} style={{ color: isSelected ? '#ffffff' : catColor }}>
                      {getCategoryIcon(cat.nombre)}
                    </span>
                    <span className={`text-[10px] font-medium whitespace-nowrap ${isLoadingThis ? 'animate-pulse-fade' : ''}`} style={{ color: isSelected ? '#ffffff' : theme.text }}>
                      {cat.nombre.split(' ')[0]}
                    </span>
                    <span
                      className={`text-[9px] font-bold px-1 rounded-full ${isLoadingThis ? 'animate-pulse-fade' : ''}`}
                      style={{
                        backgroundColor: isSelected ? 'rgba(255,255,255,0.3)' : `${catColor}30`,
                        color: isSelected ? '#ffffff' : catColor,
                      }}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
              </>
              )}
              </div>
            </div>

            {/* Estados - botón Todos fijo + scroll horizontal */}
            <div className="flex gap-1">
              {/* Botón Todos fijo - outlined */}
              <button
                onClick={() => {
                  setFilterLoading('estado-');
                  setFiltroEstado('');
                }}
                className="flex items-center gap-1 px-2 py-1 rounded-md transition-all h-[26px] flex-shrink-0"
                style={{
                  background: 'transparent',
                  border: `1.5px solid ${filtroEstado === '' ? theme.primary : theme.border}`,
                }}
              >
                <Eye className={`h-3 w-3 ${filterLoading === 'estado-' ? 'animate-pulse-fade' : ''}`} style={{ color: filtroEstado === '' ? theme.primary : theme.textSecondary }} />
                <span className={`text-[10px] font-medium whitespace-nowrap ${filterLoading === 'estado-' ? 'animate-pulse-fade' : ''}`} style={{ color: filtroEstado === '' ? theme.primary : theme.textSecondary }}>
                  Todos
                </span>
                <span className={`text-[9px] font-bold ${filterLoading === 'estado-' ? 'animate-pulse-fade' : ''}`} style={{ color: filtroEstado === '' ? theme.primary : theme.textSecondary }}>
                  {Object.values(conteosEstados).reduce((a, b) => a + b, 0)}
                </span>
              </button>

              {/* Scroll de estados */}
              <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide flex-1 min-w-0">
              {/* Skeleton solo si no hay conteos cargados (carga inicial) */}
              {Object.keys(conteosEstados).length === 0 ? (
                <FilterRowSkeleton count={5} height={26} widths={[45, 55, 65, 45, 55]} />
              ) : (
                [
                  { key: 'nuevo', label: 'Nuevo', icon: Sparkles, color: estadoColors.NUEVO.bg, count: conteosEstados['nuevo'] || 0 },
                  { key: 'asignado', label: 'Asig.', icon: UserPlus, color: estadoColors.ASIGNADO.bg, count: conteosEstados['asignado'] || 0 },
                  { key: 'en_proceso', label: 'Proc.', icon: Play, color: estadoColors.EN_PROCESO.bg, count: conteosEstados['en_proceso'] || 0 },
                  { key: 'resuelto', label: 'Resu.', icon: CheckCircle, color: estadoColors.RESUELTO.bg, count: conteosEstados['resuelto'] || 0 },
                  { key: 'rechazado', label: 'Rech.', icon: XCircle, color: estadoColors.RECHAZADO.bg, count: conteosEstados['rechazado'] || 0 },
                ].map((estado) => {
                  const Icon = estado.icon;
                  const isActive = filtroEstado === estado.key;
                  const isLoadingThis = filterLoading === `estado-${estado.key}`;
                  return (
                    <button
                      key={estado.key}
                      onClick={() => {
                        setFilterLoading(`estado-${estado.key}`);
                        setFiltroEstado(filtroEstado === estado.key ? '' : estado.key);
                      }}
                      className="flex items-center gap-1 px-2 py-1 rounded-md transition-all h-[26px] flex-shrink-0"
                      style={{
                        background: isActive ? estado.color : `${estado.color}15`,
                        border: `1px solid ${isActive ? estado.color : `${estado.color}40`}`,
                      }}
                    >
                      <Icon
                        className={`h-3 w-3 flex-shrink-0 ${isLoadingThis ? 'animate-pulse-fade' : ''}`}
                        style={{ color: isActive ? '#ffffff' : estado.color }}
                      />
                      <span
                        className={`text-[10px] font-medium whitespace-nowrap ${isLoadingThis ? 'animate-pulse-fade' : ''}`}
                        style={{ color: isActive ? '#ffffff' : estado.color }}
                      >
                        {estado.label}
                      </span>
                      <span
                        className={`text-[9px] font-bold ${isLoadingThis ? 'animate-pulse-fade' : ''}`}
                        style={{ color: isActive ? '#ffffff' : estado.color }}
                      >
                        {estado.count}
                      </span>
                    </button>
                  );
                })
              )}
              </div>
            </div>

          </div>
        }
        tableView={
          <ABMTable
            key={`table-${ordenamiento}`}
            data={filteredReclamos}
            columns={tableColumns}
            keyExtractor={(r) => r.id}
            onRowClick={(r) => openViewSheet(r)}
            defaultSortKey={ordenamiento === 'programado' ? 'fecha_programada' : 'creacion'}
            defaultSortDirection={ordenamiento === 'programado' ? 'asc' : 'desc'}
          />
        }
        sheetContent={null}
      >
        {loading ? (
          // Mostrar skeletons mientras carga
          Array.from({ length: 6 }).map((_, i) => (
            <ABMCardSkeleton key={`skeleton-${i}`} index={i} />
          ))
        ) : (
          filteredReclamos.map((r) => {
            const estado = estadoColors[r.estado];
            const categoryColor = r.categoria.color || DEFAULT_CATEGORY_COLOR;
            const bgImage = getCategoryImageUrl(r.categoria.nombre);
            // Si la animación terminó, siempre visible
            const isVisible = animationDone || visibleCards.has(r.id);
            return (
            <div
              key={r.id}
              onClick={() => openViewSheet(r)}
              className={`group relative rounded-2xl cursor-pointer overflow-hidden abm-card-hover transition-all duration-500 ${
                isVisible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-8 scale-95'
              }`}
              style={{
                backgroundColor: theme.card,
                border: `1px solid ${theme.border}`,
              }}
            >
              {/* Imagen de fondo basada en la categoría */}
              {bgImage && (
                <div className="absolute inset-0">
                  <img
                    src={bgImage}
                    alt=""
                    className="w-full h-full object-cover opacity-10 group-hover:opacity-20 group-hover:scale-105 transition-all duration-700"
                  />
                  {/* Overlay con gradiente del color de la categoría */}
                  <div
                    className="absolute inset-0"
                    style={{
                      background: `linear-gradient(135deg, ${theme.card}F8 0%, ${theme.card}F0 50%, ${categoryColor}20 100%)`,
                    }}
                  />
                </div>
              )}

              {/* Contenido principal */}
              <div className="relative z-10 p-5">
              {/* Header con gradiente */}
              <div
                className="flex items-center justify-between -mx-5 -mt-5 mb-4 px-4 py-3 rounded-t-xl"
                style={{
                  background: r.estado === 'asignado'
                    ? 'linear-gradient(135deg, rgb(74 79 160 / 0%) 0%, rgba(59, 130, 246, 0.5) 100%)'
                    : `linear-gradient(135deg, ${estado.bg} 0%, ${estado.bg}80 100%)`,
                  borderBottom: r.estado === 'asignado'
                    ? '1px solid rgb(59 130 246 / 0%)'
                    : `1px solid ${estado.bg}`
                }}
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: `${estado.text}15` }}
                  >
                    <FileText className="h-4 w-4" style={{ color: estado.text }} />
                  </div>
                  <span className="font-semibold text-sm line-clamp-1" style={{ color: estado.text }}>
                    {r.titulo}
                  </span>
                </div>
                <span
                  className="px-3 py-1 text-xs font-semibold rounded-full shadow-sm flex-shrink-0 ml-2 flex items-center gap-1.5"
                  style={{
                    backgroundColor: theme.card,
                    color: estado.text,
                    boxShadow: `0 2px 4px ${estado.text}20`
                  }}
                >
                  {getEstadoIcon(r.estado)}
                  {estadoLabels[r.estado]}
                </span>
              </div>

              {/* Badge de categoría destacado */}
              <div className="flex items-center gap-2 mb-3">
                <div
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
                  style={{
                    backgroundColor: `${categoryColor}15`,
                    border: `1px solid ${categoryColor}40`,
                  }}
                >
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: categoryColor }}
                  >
                    <span style={{ color: '#ffffff' }}>
                      {getCategoryIcon(r.categoria.nombre)}
                    </span>
                  </div>
                  <span className="text-xs font-semibold" style={{ color: categoryColor }}>
                    {r.categoria.nombre}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {r.creador && !r.es_anonimo && (
                    <span className="text-sm font-medium" style={{ color: theme.text }}>
                      {r.creador.nombre} {r.creador.apellido?.charAt(0)}.
                    </span>
                  )}
                  <span className="text-xs" style={{ color: theme.textSecondary }}>#{r.id}</span>
                </div>
              </div>

              {/* Contenido */}
              <div className="flex items-center">
                <p className="text-sm flex items-center flex-1 min-w-0" style={{ color: theme.textSecondary }}>
                  <MapPin className="h-3.5 w-3.5 mr-1.5 flex-shrink-0" />
                  <span className="line-clamp-1">{r.direccion}</span>
                </p>
              </div>

              <p className="text-sm mt-2 line-clamp-2" style={{ color: theme.textSecondary }}>
                {r.descripcion}
              </p>

              <div
                className="flex items-center justify-between mt-4 pt-4 text-xs"
                style={{ borderTop: `1px solid ${theme.border}`, color: theme.textSecondary }}
              >
                <div className="flex items-center space-x-3">
                  <span className="flex items-center">
                    <Calendar className="h-3 w-3 mr-1" />
                    {new Date(r.created_at).toLocaleDateString()}
                  </span>
                  {/* Badge de reclamos similares */}
                  {similaresCounts[r.id] > 0 && (
                    <span
                      className="flex items-center gap-1 px-2 py-0.5 rounded-full font-medium"
                      style={{
                        backgroundColor: '#f59e0b20',
                        color: '#d97706',
                        border: '1px solid #f59e0b40'
                      }}
                    >
                      <Users className="h-3 w-3" />
                      {similaresCounts[r.id]} {similaresCounts[r.id] === 1 ? 'vecino' : 'vecinos'}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {r.dependencia_asignada?.nombre && (
                    <span style={{ color: theme.primary }} className="font-medium">{r.dependencia_asignada.nombre}</span>
                  )}
                  <Eye className="h-4 w-4" style={{ color: theme.primary }} />
                </div>
              </div>
              </div>
            </div>
          );
        })
        )}
      </ABMPage>

      {/* Sentinel para infinite scroll + spinner de carga */}
      <div ref={observerTarget} className="py-4">
        {loadingMore && (
          <div className="flex items-center justify-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin" style={{ color: theme.primary }} />
            <span className="text-sm" style={{ color: theme.textSecondary }}>
              Cargando más reclamos...
            </span>
          </div>
        )}
        {!hasMore && reclamos.length > 0 && !loadingMore && (
          <p className="text-center text-sm" style={{ color: theme.textSecondary }}>
            No hay más reclamos para mostrar
          </p>
        )}
      </div>

      {/* Sheet separado para ver detalle */}
      <Sheet
        open={sheetMode === 'view'}
        onClose={closeSheet}
        title={`Reclamo #${selectedReclamo?.id || ''} · ${selectedReclamo ? new Date(selectedReclamo.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : ''}`}
        description={selectedReclamo?.titulo}
        stickyHeader={renderSheetStickyHeader()}
        stickyFooter={renderSheetFooter()}
      >
        {renderViewContent()}
      </Sheet>

      {/* Wizard Modal para crear nuevo reclamo */}
      <WizardModal
        open={wizardOpen}
        onClose={closeWizard}
        title="Nuevo Reclamo"
        steps={wizardSteps}
        currentStep={wizardStep}
        onStepChange={setWizardStep}
        onComplete={handleCreate}
        loading={saving}
        completeLabel="Enviar Reclamo"
        aiPanel={wizardAIPanel}
        headerBadge={selectedCategoria ? {
          icon: getCategoryIcon(selectedCategoria.nombre),
          label: selectedCategoria.nombre,
          color: selectedCategoria.color || DEFAULT_CATEGORY_COLOR,
        } : undefined}
      />

    </>
  );
}
