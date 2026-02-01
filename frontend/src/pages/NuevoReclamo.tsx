import { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FolderOpen,
  MapPin,
  FileText,
  CheckCircle2,
  Zap,
  Droplets,
  TreeDeciduous,
  Trash2,
  Building2,
  MoreHorizontal,
  X,
  Camera,
  Lightbulb,
  Construction,
  Car,
  Bug,
  Leaf,
  Signpost,
  Recycle,
  Brush,
  TrafficCone,
  Footprints,
  Lamp,
  VolumeX,
  Loader2,
  User,
  Mail,
  Lock,
  ShieldCheck,
  Phone,
  MessageCircle,
  Send,
  Bot,
  Sparkles,
  Clock,
  Search
} from 'lucide-react';
import { toast } from 'sonner';
import { reclamosApi, publicoApi, clasificacionApi, authApi, chatApi, dependenciasApi } from '../lib/api';
import { validationSchemas } from '../lib/validations';
import { Categoria, Zona } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { getDefaultRoute } from '../config/navigation';
import { MapPicker } from '../components/ui/MapPicker';
import { WizardModal, WizardStep } from '../components/ui/WizardModal';
import { WizardStepContent } from '../components/ui/WizardForm';
import { ReclamosSimilares } from '../components/ReclamosSimilares';
import { StickyPageHeader } from '../components/ui/StickyPageHeader';
import { DynamicIcon } from '../components/ui/DynamicIcon';

// Iconos por categoría
const categoryIcons: Record<string, React.ReactNode> = {
  'alumbrado': <Zap className="h-6 w-6" />,
  'bache': <Construction className="h-6 w-6" />,
  'calle': <Construction className="h-6 w-6" />,
  'agua': <Droplets className="h-6 w-6" />,
  'cloaca': <Droplets className="h-6 w-6" />,
  'desague': <Droplets className="h-6 w-6" />,
  'arbolado': <TreeDeciduous className="h-6 w-6" />,
  'espacio': <Leaf className="h-6 w-6" />,
  'verde': <Leaf className="h-6 w-6" />,
  'basura': <Trash2 className="h-6 w-6" />,
  'residuo': <Recycle className="h-6 w-6" />,
  'recolec': <Recycle className="h-6 w-6" />,
  'limpieza': <Brush className="h-6 w-6" />,
  'transito': <Car className="h-6 w-6" />,
  'señal': <Signpost className="h-6 w-6" />,
  'plaga': <Bug className="h-6 w-6" />,
  'fumiga': <Bug className="h-6 w-6" />,
  'edificio': <Building2 className="h-6 w-6" />,
  'semaforo': <TrafficCone className="h-6 w-6" />,
  'semáforo': <TrafficCone className="h-6 w-6" />,
  'vereda': <Footprints className="h-6 w-6" />,
  'cordon': <Footprints className="h-6 w-6" />,
  'mobiliario': <Lamp className="h-6 w-6" />,
  'ruido': <VolumeX className="h-6 w-6" />,
  'default': <MoreHorizontal className="h-6 w-6" />,
};

// Color por defecto - los colores reales vienen de la DB
const DEFAULT_CATEGORY_COLOR = '#64748b';

function getCategoryIcon(nombre: string): React.ReactNode {
  const key = nombre.toLowerCase();
  for (const [k, icon] of Object.entries(categoryIcons)) {
    if (key.includes(k)) return icon;
  }
  return categoryIcons.default;
}

export default function NuevoReclamo() {
  const { theme } = useTheme();
  const { user, isLoading: authLoading, register, login, municipioActual } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [currentStep, setCurrentStep] = useState(0);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [zonas, setZonas] = useState<Zona[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [registering, setRegistering] = useState(false);
  const [registerError, setRegisterError] = useState('');
  const [suggestedCategorias, setSuggestedCategorias] = useState<Array<{categoria: Categoria, confianza: number}>>([]);
  const [showSuggestion, setShowSuggestion] = useState(false);
  const [searchCategoria, setSearchCategoria] = useState('');
  const [showSimilaresAlert, setShowSimilaresAlert] = useState(false);
  const [ignorarSimilares, setIgnorarSimilares] = useState(false);
  const [similaresCargados, setSimilaresCargados] = useState(false);
  const dataLoadedRef = useRef(false); // Prevenir carga múltiple de datos

  // Dependencia encargada basada en la categoría seleccionada
  const [dependenciaEncargada, setDependenciaEncargada] = useState<{
    id: number;
    nombre: string;
    codigo?: string;
    color?: string;
    icono?: string;
  } | null>(null);

  // Estado para el chat inicial (Step 0)
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<Array<{role: 'assistant' | 'user', content: string}>>([
    { role: 'assistant', content: '¡Hola! 👋 Soy tu asistente virtual. Contame, ¿qué problema querés reportar?' }
  ]);
  const [chatAnalyzing, setChatAnalyzing] = useState(false);
  const [chatCategoriaSugerida, setChatCategoriaSugerida] = useState<{categoria: Categoria, confianza: number} | null>(null);
  const [consejoAmigable, setConsejoAmigable] = useState<string>('');
  const chatInputRef = useRef<HTMLInputElement>(null);
  const chatMessagesEndRef = useRef<HTMLDivElement>(null);

  // IA contextual basada en lo que escribe el usuario (igual que TramiteWizard)
  const [contextualAiResponse, setContextualAiResponse] = useState('');
  const [contextualAiLoading, setContextualAiLoading] = useState(false);
  const [contextualAiFailed, setContextualAiFailed] = useState(false);
  const contextualAiTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Datos de registro (solo se usan si no hay usuario)
  const [registerData, setRegisterData] = useState({
    nombre: '',
    email: '',
    password: '',
    telefono: '',
  });
  const [isAnonymous, setIsAnonymous] = useState(true); // Por defecto anónimo
  const [emailExists, setEmailExists] = useState<boolean | null>(null); // null = no verificado, true = existe, false = nuevo
  const [checkingEmail, setCheckingEmail] = useState(false);
  const emailCheckTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Esperar a que termine la carga de auth antes de decidir
  const showOnlyRegister = !authLoading && !user;

  // Si el usuario está logueado y está en /nuevo-reclamo (sin Layout), redirigir a /gestion/crear-reclamo (con Layout)
  useEffect(() => {
    if (user && !authLoading && window.location.pathname === '/nuevo-reclamo') {
      navigate('/gestion/crear-reclamo', { replace: true });
    }
  }, [user, authLoading, navigate]);

  // Autocompletado de direcciones
  const [addressSuggestions, setAddressSuggestions] = useState<Array<{
    display_name: string;
    lat: string;
    lon: string;
    address?: {
      house_number?: string;
      road?: string;
      neighbourhood?: string;
      suburb?: string;
      city?: string;
      town?: string;
      village?: string;
      state?: string;
    };
  }>>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchingAddress, setSearchingAddress] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [userInputNumber, setUserInputNumber] = useState<string>('');

  const [formData, setFormData] = useState({
    titulo: '',
    descripcion: '',
    direccion: '',
    referencia: '',
    categoria_id: '',
    zona_id: '',
    latitud: null as number | null,
    longitud: null as number | null,
  });

  // Estado para campos tocados (para mostrar errores de validación)
  const [fieldsTouched, setFieldsTouched] = useState({
    titulo: false,
    descripcion: false,
    direccion: false,
  });

  const handleFieldBlur = (field: 'titulo' | 'descripcion' | 'direccion') => {
    setFieldsTouched(t => ({ ...t, [field]: true }));
  };

  useEffect(() => {
    const fetchData = async () => {
      // Evitar carga múltiple (React Strict Mode ejecuta efectos 2 veces)
      if (dataLoadedRef.current) return;
      dataLoadedRef.current = true;

      try {
        const municipioId = localStorage.getItem('municipio_id');
        const [categoriasRes, zonasRes] = await Promise.all([
          publicoApi.getCategorias(municipioId ? parseInt(municipioId) : undefined),
          publicoApi.getZonas(municipioId ? parseInt(municipioId) : undefined),
        ]);
        setCategorias(categoriasRes.data);
        setZonas(zonasRes.data);
      } catch (error) {
        console.error('Error cargando datos:', error);
        toast.error('Error al cargar datos');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // Buscar reclamos similares cuando cambia categoría o ubicación
  useEffect(() => {
    const buscarSimilares = async () => {
      // Solo buscar si tenemos categoría Y coordenadas Y usuario logueado
      if (!formData.categoria_id || !formData.latitud || !formData.longitud || !user) {
        setSimilaresCargados(false);
        return;
      }

      try {
        const response = await reclamosApi.getSimilares({
          categoria_id: Number(formData.categoria_id),
          latitud: formData.latitud,
          longitud: formData.longitud,
          radio_metros: 100,
          dias_atras: 30,
          limit: 5,
        });

        // Si hay similares, mostrar la alerta automáticamente
        if (response.data.length > 0 && !ignorarSimilares) {
          setShowSimilaresAlert(true);
        }
        setSimilaresCargados(true);
      } catch (err) {
        console.error('Error buscando similares:', err);
      }
    };

    buscarSimilares();
  }, [formData.categoria_id, formData.latitud, formData.longitud, user, ignorarSimilares]);

  // Auto-detectar zona basada en coordenadas
  useEffect(() => {
    if (!formData.latitud || !formData.longitud || zonas.length === 0) return;

    // Calcular distancia entre dos puntos (fórmula de Haversine simplificada)
    const calcularDistancia = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
      const R = 6371; // Radio de la Tierra en km
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLon = (lon2 - lon1) * Math.PI / 180;
      const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                Math.sin(dLon / 2) * Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c;
    };

    // Encontrar la zona más cercana
    let zonaMasCercana: Zona | null = null;
    let distanciaMinima = Infinity;

    for (const zona of zonas) {
      if (zona.latitud_centro && zona.longitud_centro) {
        const distancia = calcularDistancia(
          formData.latitud,
          formData.longitud,
          zona.latitud_centro,
          zona.longitud_centro
        );
        if (distancia < distanciaMinima) {
          distanciaMinima = distancia;
          zonaMasCercana = zona;
        }
      }
    }

    // Auto-seleccionar la zona más cercana (si está dentro de 20km)
    if (zonaMasCercana && distanciaMinima < 20) {
      setFormData(prev => ({ ...prev, zona_id: String(zonaMasCercana!.id) }));
    }
  }, [formData.latitud, formData.longitud, zonas]);

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

  // Calcular distancia entre dos puntos (Haversine simplificado)
  const calcularDistancia = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371; // Radio de la Tierra en km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  };

  // Buscar direcciones con Nominatim (OpenStreetMap) - con fallback si no encuentra
  const searchAddress = useCallback(async (query: string) => {
    if (query.length < 3) {
      setAddressSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    setSearchingAddress(true);
    try {
      // Obtener datos del municipio para limitar la búsqueda
      // Primero intentar localStorage, luego el contexto
      let municipioLat = localStorage.getItem('municipio_lat');
      let municipioLon = localStorage.getItem('municipio_lon');

      // Si no hay en localStorage, usar del contexto y guardarlas
      if ((!municipioLat || !municipioLon) && municipioActual?.latitud && municipioActual?.longitud) {
        municipioLat = String(municipioActual.latitud);
        municipioLon = String(municipioActual.longitud);
        localStorage.setItem('municipio_lat', municipioLat);
        localStorage.setItem('municipio_lon', municipioLon);
      }

      const municipioNombre = localStorage.getItem('municipio_nombre') || '';
      const municipioSimple = municipioNombre.replace('Municipalidad de ', '').replace('Municipio de ', '');

      // Construir el viewbox si tenemos coordenadas del municipio (±0.3 grados ≈ 30km)
      let viewboxParam = '';
      const centroLat = municipioLat ? parseFloat(municipioLat) : null;
      const centroLon = municipioLon ? parseFloat(municipioLon) : null;

      if (centroLat && centroLon) {
        const delta = 0.3; // ~30km para capturar más resultados
        viewboxParam = `&viewbox=${centroLon - delta},${centroLat + delta},${centroLon + delta},${centroLat - delta}`;
      }

      // Construir query de búsqueda - NO agregar el nombre del municipio porque
      // puede haber múltiples localidades (ej: Padua, Rawson dentro de Chacabuco)
      // Usamos viewbox para filtrar geográficamente y solo agregamos la provincia
      const searchQuery = `${query}, Buenos Aires, Argentina`;

      // Primero intentar con viewbox y bounded=1 (SOLO resultados dentro del municipio)
      let url = viewboxParam
        ? `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&countrycodes=ar&limit=15&addressdetails=1${viewboxParam}&bounded=1`
        : `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&countrycodes=ar&limit=15&addressdetails=1`;

      let response = await fetch(url, {
        headers: { 'Accept-Language': 'es' },
      });
      let data = await response.json();

      // Si no hay resultados con bounded, intentar solo con viewbox (preferencia pero no estricto)
      if (data.length === 0 && viewboxParam) {
        console.log('[Address Search] Sin resultados con bounded, intentando viewbox sin bounded');
        url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&countrycodes=ar&limit=15&addressdetails=1${viewboxParam}`;
        response = await fetch(url, {
          headers: { 'Accept-Language': 'es' },
        });
        data = await response.json();
      }

      // Si aún no hay resultados, buscar agregando el nombre del municipio
      if (data.length === 0 && municipioSimple) {
        console.log('[Address Search] Intentando con nombre del municipio');
        url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query + ', ' + municipioSimple + ', Buenos Aires, Argentina')}&countrycodes=ar&limit=15&addressdetails=1`;
        response = await fetch(url, {
          headers: { 'Accept-Language': 'es' },
        });
        data = await response.json();
      }

      // Si aún no hay resultados, probar búsqueda más simple (solo Argentina)
      if (data.length === 0) {
        console.log('[Address Search] Sin resultados, probando búsqueda simple');
        url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query + ', Argentina')}&countrycodes=ar&limit=15&addressdetails=1`;
        response = await fetch(url, {
          headers: { 'Accept-Language': 'es' },
        });
        data = await response.json();
      }

      // Último intento: búsqueda estructurada con street parameter
      if (data.length === 0) {
        console.log('[Address Search] Último intento con búsqueda estructurada');
        // Extraer posible calle y número
        const streetMatch = query.match(/^(.+?)\s+(\d+)/);
        if (streetMatch) {
          const street = streetMatch[1] + ' ' + streetMatch[2];
          url = `https://nominatim.openstreetmap.org/search?format=json&street=${encodeURIComponent(street)}&state=Buenos%20Aires&country=Argentina&limit=15&addressdetails=1`;
          response = await fetch(url, {
            headers: { 'Accept-Language': 'es' },
          });
          data = await response.json();
        }
      }

      // Ordenar resultados por distancia al centro del municipio (más cercanos primero)
      if (data.length > 0 && centroLat && centroLon) {
        data = data.map((item: any) => ({
          ...item,
          _distancia: calcularDistancia(centroLat, centroLon, parseFloat(item.lat), parseFloat(item.lon))
        })).sort((a: any, b: any) => a._distancia - b._distancia);

        // Limitar a 8 resultados después de ordenar
        data = data.slice(0, 8);
      }

      setAddressSuggestions(data);
      setShowSuggestions(data.length > 0);
    } catch (error) {
      console.error('Error buscando direcciones:', error);
    } finally {
      setSearchingAddress(false);
    }
  }, [municipioActual]);

  // Debounce para la búsqueda de direcciones
  const handleAddressChange = (value: string) => {
    setFormData({ ...formData, direccion: value });

    // Extraer número de la dirección que escribe el usuario (ej: "San Martín 230" -> "230")
    const numberMatch = value.match(/\b(\d+)\b/);
    if (numberMatch) {
      setUserInputNumber(numberMatch[1]);
    }

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(() => {
      searchAddress(value);
    }, 400);
  };

  // Seleccionar una sugerencia - construye dirección limpia preservando el número
  const selectAddressSuggestion = (suggestion: typeof addressSuggestions[0]) => {
    // Construir dirección más limpia usando addressdetails
    let direccion = '';
    const addr = suggestion.address;

    if (addr) {
      const parts: string[] = [];

      // Calle con número
      if (addr.road) {
        // Usar el número de Nominatim si existe, sino el que escribió el usuario
        const numero = addr.house_number || userInputNumber;
        parts.push(numero ? `${addr.road} ${numero}` : addr.road);
      }

      // Barrio/Localidad
      const locality = addr.neighbourhood || addr.suburb || addr.village || addr.town || addr.city;
      if (locality) {
        parts.push(locality);
      }

      // Provincia (solo si no es Buenos Aires)
      if (addr.state && !addr.state.toLowerCase().includes('buenos aires')) {
        parts.push(addr.state);
      }

      direccion = parts.join(', ');
    }

    // Si no pudimos construir una dirección mejor, usar display_name pero más corto
    if (!direccion) {
      const parts = suggestion.display_name.split(', ').slice(0, 4);
      direccion = parts.join(', ');
    }

    setFormData({
      ...formData,
      direccion,
      latitud: parseFloat(suggestion.lat),
      longitud: parseFloat(suggestion.lon),
    });
    setShowSuggestions(false);
    setAddressSuggestions([]);
  };

  // Cerrar sugerencias al hacer click afuera
  useEffect(() => {
    const handleClickOutside = () => setShowSuggestions(false);
    if (showSuggestions) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [showSuggestions]);

  const removeFile = (index: number) => {
    const newFiles = selectedFiles.filter((_, i) => i !== index);
    const newUrls = previewUrls.filter((_, i) => i !== index);
    URL.revokeObjectURL(previewUrls[index]);
    setSelectedFiles(newFiles);
    setPreviewUrls(newUrls);
  };

  // Referencia para el timeout de análisis de texto
  const analyzeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  // Función para analizar texto y sugerir categorías usando el backend (IA)
  const analyzeTextForCategory = useCallback(async (text: string) => {
    if (!text || text.length < 10 || categorias.length === 0) {
      setSuggestedCategorias([]);
      setShowSuggestion(false);
      return;
    }

    if (analyzeTimeoutRef.current) {
      clearTimeout(analyzeTimeoutRef.current);
    }

    analyzeTimeoutRef.current = setTimeout(async () => {
      try {
        setAnalyzing(true);
        const municipioIdStr = localStorage.getItem('municipio_id');
        const municipioId = municipioIdStr ? parseInt(municipioIdStr) : 1;

        const resultado = await clasificacionApi.clasificar(text, municipioId);

        if (resultado.sugerencias && resultado.sugerencias.length > 0) {
          const top3 = resultado.sugerencias
            .slice(0, 3)
            .map((sug: { categoria_id: number; confianza?: number; score?: number }) => {
              const cat = categorias.find(c => c.id === sug.categoria_id);
              return cat ? { categoria: cat, confianza: sug.confianza || sug.score || 0 } : null;
            })
            .filter((x: { categoria: Categoria; confianza: number } | null): x is { categoria: Categoria; confianza: number } => x !== null);

          if (top3.length > 0) {
            setSuggestedCategorias(top3);
            setShowSuggestion(true);
          } else {
            setSuggestedCategorias([]);
            setShowSuggestion(false);
          }
        } else {
          setSuggestedCategorias([]);
          setShowSuggestion(false);
        }
      } catch {
        // Silent fail - classification is optional
      } finally {
        setAnalyzing(false);
      }
    }, 5000); // 5 segundos de debounce para no interrumpir mientras escribe
  }, [categorias]);

  // Analizar cuando cambia el título o descripción
  const handleTituloChange = (value: string) => {
    setFormData({ ...formData, titulo: value });
    // Solo analizar con debounce largo mientras escribe
    analyzeTextForCategory(value + ' ' + formData.descripcion);
  };

  const handleDescripcionChange = (value: string) => {
    setFormData({ ...formData, descripcion: value });
    // Solo analizar con debounce largo mientras escribe
    analyzeTextForCategory(formData.titulo + ' ' + value);
  };

  // Analizar inmediatamente al salir del campo (blur)
  const handleDescripcionBlur = () => {
    handleFieldBlur('descripcion');
    // Cancelar el timeout pendiente y analizar inmediatamente
    if (analyzeTimeoutRef.current) {
      clearTimeout(analyzeTimeoutRef.current);
    }
    const text = formData.titulo + ' ' + formData.descripcion;
    if (text.length >= 10 && categorias.length > 0) {
      // Análisis inmediato al hacer blur
      (async () => {
        try {
          setAnalyzing(true);
          const municipioIdStr = localStorage.getItem('municipio_id');
          const municipioId = municipioIdStr ? parseInt(municipioIdStr) : 1;
          const resultado = await clasificacionApi.clasificar(text, municipioId);
          if (resultado.sugerencias && resultado.sugerencias.length > 0) {
            const top3 = resultado.sugerencias
              .slice(0, 3)
              .map((sug: { categoria_id: number; confianza?: number; score?: number }) => {
                const cat = categorias.find(c => c.id === sug.categoria_id);
                return cat ? { categoria: cat, confianza: sug.confianza || sug.score || 0 } : null;
              })
              .filter((x: { categoria: Categoria; confianza: number } | null): x is { categoria: Categoria; confianza: number } => x !== null);
            if (top3.length > 0) {
              setSuggestedCategorias(top3);
              setShowSuggestion(true);
            }
          }
        } catch {
          // Silent fail
        } finally {
          setAnalyzing(false);
        }
      })();
    }
  };

  // Aceptar una sugerencia de categoría
  const acceptSuggestedCategory = (categoria: Categoria) => {
    setFormData({ ...formData, categoria_id: String(categoria.id) });
    setSuggestedCategorias([]);
    setShowSuggestion(false);
    toast.success(`Categoría seleccionada: "${categoria.nombre}"`);
  };

  // Buscar dependencia encargada cuando cambia la categoría
  useEffect(() => {
    const fetchDependencia = async () => {
      if (!formData.categoria_id) {
        setDependenciaEncargada(null);
        return;
      }

      // Obtener municipio_id del usuario o del localStorage
      const municipioId = user?.municipio_id || parseInt(localStorage.getItem('municipio_id') || '0');
      if (!municipioId) {
        console.warn('No hay municipio_id disponible para buscar dependencia');
        setDependenciaEncargada(null);
        return;
      }

      try {
        // Usar endpoint público que no requiere autenticación
        const categoriaId = Number(formData.categoria_id);
        const response = await dependenciasApi.getDependenciaByCategoria(municipioId, categoriaId);

        if (response.data) {
          setDependenciaEncargada({
            id: response.data.id,
            nombre: response.data.nombre,
            codigo: response.data.codigo,
            color: response.data.color,
            icono: response.data.icono,
          });
        } else {
          setDependenciaEncargada(null);
        }
      } catch (error) {
        console.error('Error buscando dependencia:', error);
        setDependenciaEncargada(null);
      }
    };

    fetchDependencia();
  }, [formData.categoria_id, user?.municipio_id]);

  // Scroll al final del chat cuando hay nuevos mensajes
  useEffect(() => {
    chatMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // IA contextual: analiza lo que escribe el usuario en descripción (3+ palabras)
  // Se dispara 3 segundos después de que el usuario deja de escribir
  useEffect(() => {
    // Limpiar timeout anterior
    if (contextualAiTimeoutRef.current) {
      clearTimeout(contextualAiTimeoutRef.current);
    }

    const texto = formData.descripcion.trim();
    const palabras = texto.split(/\s+/).filter(p => p.length > 0);

    // Obtener categoría seleccionada dentro del efecto
    const catSeleccionada = categorias.find(c => c.id === Number(formData.categoria_id));

    // Solo activar con 3+ palabras y categoría seleccionada
    if (palabras.length < 3 || !catSeleccionada) {
      setContextualAiResponse('');
      setContextualAiFailed(false);
      return;
    }

    // Debounce de 3 segundos - solo cuando el usuario realmente frena
    contextualAiTimeoutRef.current = setTimeout(async () => {
      setContextualAiLoading(true);
      setContextualAiFailed(false);

      try {
        const contexto: Record<string, unknown> = {
          categoria: catSeleccionada.nombre,
          descripcion_problema: texto,
          direccion: formData.direccion || '',
        };

        const response = await chatApi.askDynamic(
          `Vecino quiere reportar: "${catSeleccionada.nombre}".
Escribió: "${texto}"
${formData.direccion ? `Dirección: ${formData.direccion}` : ''}

Respondé como empleada municipal dando info útil y específica:
- Qué área se encarga de esto
- Tiempo estimado de resolución
- Si hay algo que el vecino deba saber
- Si la dirección está en zona céntrica o alejada, mencionalo

Tono amigable, 3-4 oraciones máximo.`,
          contexto,
          'reclamo_contextual'
        );
        console.log('[IA Contextual Reclamo] Respuesta:', response);
        const aiText = response.response || response.message || '';
        setContextualAiResponse(aiText);
        if (!aiText) {
          setContextualAiFailed(true);
        }
      } catch {
        setContextualAiResponse('');
        setContextualAiFailed(true);
      } finally {
        setContextualAiLoading(false);
      }
    }, 3000);

    return () => {
      if (contextualAiTimeoutRef.current) {
        clearTimeout(contextualAiTimeoutRef.current);
      }
    };
  }, [formData.descripcion, formData.categoria_id, formData.direccion, categorias]);

  // Función para enviar mensaje del chat y clasificar con IA
  const handleChatSubmit = async () => {
    if (!chatInput.trim() || chatAnalyzing) return;

    const userMessage = chatInput.trim();
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setChatAnalyzing(true);

    try {
      const municipioIdStr = localStorage.getItem('municipio_id');
      const municipioId = municipioIdStr ? parseInt(municipioIdStr) : 1;

      // Clasificar el texto con IA
      const resultado = await clasificacionApi.clasificar(userMessage, municipioId);

      if (resultado.sugerencias && resultado.sugerencias.length > 0) {
        const mejorSugerencia = resultado.sugerencias[0];
        const cat = categorias.find(c => c.id === mejorSugerencia.categoria_id);

        if (cat) {
          const confianza = mejorSugerencia.confianza || mejorSugerencia.score || 0;
          setChatCategoriaSugerida({ categoria: cat, confianza });

          // Guardar la descripción del usuario Y la categoría seleccionada automáticamente
          setFormData(prev => ({
            ...prev,
            descripcion: userMessage,
            titulo: `Problema de ${cat.nombre.toLowerCase()}`,
            categoria_id: String(cat.id),  // Auto-seleccionar la categoría
          }));

          // Consejos amigables según la categoría
          const consejosPorCategoria: Record<string, string> = {
            'alumbrado': 'Si podés, anotá el número del poste o una referencia cercana. Eso ayuda mucho a que lo ubiquen rápido.',
            'bache': 'Te recomiendo que en el siguiente paso marques bien la ubicación en el mapa. Si es grande o peligroso, mencionalo así le dan prioridad.',
            'agua': 'Si es una pérdida grande, llamá también al teléfono de emergencias del municipio. Mientras tanto, este reclamo queda registrado.',
            'cloaca': 'Estos temas suelen atenderse con prioridad. Incluí si hay malos olores o si afecta la vereda.',
            'basura': 'Indicá si es un problema recurrente o puntual. Si pasa seguido, mencioná los días que notás el problema.',
            'residuo': 'Detallá qué tipo de residuos son (escombros, poda, etc.). Eso ayuda a enviar el equipo correcto.',
            'verde': 'Si es un árbol que representa peligro, mencionalo así lo priorizan. Incluí si hay cables cerca.',
            'semaforo': 'Este tipo de problemas se atienden rápido por seguridad. Mencioná si está en una esquina muy transitada.',
            'señal': 'Describí qué señal es o debería haber. Una foto ayuda mucho en estos casos.',
            'vereda': 'Indicá si representa riesgo para peatones, especialmente si hay adultos mayores o personas con movilidad reducida en la zona.',
            'ruido': 'Mencioná los horarios en que ocurre el problema. Eso es clave para que puedan actuar.',
            'zoonosis': 'Si hay riesgo para personas (perros agresivos, plagas), mencionalo para que le den prioridad.',
            'animal': 'Describí la situación del animal y si representa algún riesgo. El área de Zoonosis se encargará.',
          };

          // Buscar consejo relevante
          let consejo = '';
          const catLower = cat.nombre.toLowerCase();
          for (const [key, tip] of Object.entries(consejosPorCategoria)) {
            if (catLower.includes(key)) {
              consejo = tip;
              break;
            }
          }
          if (!consejo) {
            consejo = 'Cuantos más detalles incluyas (ubicación exacta, fotos, horarios), más rápido van a poder atenderte.';
          }

          // Guardar el consejo para mostrarlo en el panel derecho
          setConsejoAmigable(consejo);

          // Mensaje de respuesta amigable (sin el consejo, que va al panel)
          const intro = confianza >= 80
            ? '¡Perfecto, te entendí!'
            : confianza >= 60
              ? 'Entendido.'
              : 'Creo que entendí tu problema.';

          setChatMessages(prev => [...prev, {
            role: 'assistant',
            content: `${intro} Esto parece ser un tema de "${cat.nombre}". Te llevo directo a indicar la ubicación.`
          }]);

          // Auto-avanzar a ubicación (paso 2) después de un breve delay
          setTimeout(() => {
            setCurrentStep(2); // Saltear paso de categoría, ir directo a ubicación
          }, 1500);
        } else {
          setChatMessages(prev => [...prev, {
            role: 'assistant',
            content: 'Gracias por tu descripción. En el siguiente paso podés seleccionar la categoría que mejor describa el problema.'
          }]);
        }
      } else {
        setChatMessages(prev => [...prev, {
          role: 'assistant',
          content: 'Entendido. En el siguiente paso podés seleccionar la categoría que mejor describa el problema.'
        }]);
      }
    } catch {
      setChatMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Gracias por tu descripción. Continuá al siguiente paso para seleccionar la categoría.'
      }]);
    } finally {
      setChatAnalyzing(false);
    }
  };

  // Aceptar categoría sugerida por el chat
  const acceptChatSuggestedCategory = () => {
    if (chatCategoriaSugerida) {
      setFormData(prev => ({
        ...prev,
        categoria_id: String(chatCategoriaSugerida.categoria.id),
      }));
      toast.success(`Categoría "${chatCategoriaSugerida.categoria.nombre}" seleccionada`);
      // Avanzar al paso de categoría para confirmar/ver opciones (no saltarlo)
      setCurrentStep(1);
    }
  };

  const handleSubmit = async () => {
    // Si hay alerta de similares mostrándose, no hacer nada (esperar decisión del usuario)
    if (showSimilaresAlert) {
      return;
    }

    setSubmitting(true);
    try {
      console.log('Creando reclamo...', formData);
      const data: Record<string, unknown> = {
        ...formData,
        categoria_id: Number(formData.categoria_id),
        zona_id: formData.zona_id ? Number(formData.zona_id) : undefined,
      };

      const response = await reclamosApi.create(data);
      console.log('Reclamo creado:', response.data);
      const reclamoId = response.data.id;

      if (selectedFiles.length > 0) {
        console.log('Subiendo archivos...');
        for (const file of selectedFiles) {
          await reclamosApi.upload(reclamoId, file, 'creacion');
        }
        console.log('Archivos subidos');
      }

      toast.success('¡Reclamo creado exitosamente!');

      // Esperar un momento para que el toast se muestre antes de navegar
      await new Promise(resolve => setTimeout(resolve, 500));

      // Si viene de mobile (/app/nuevo), volver a /app. Si no, ir a la ruta por defecto
      const isMobile = window.location.pathname.startsWith('/app');
      const destino = isMobile ? '/app' : (user ? getDefaultRoute(user.rol, !!user.dependencia) : '/mis-reclamos');
      console.log('Navegando a:', destino);
      navigate(destino, { replace: true });
    } catch (err: unknown) {
      console.error('Error al crear reclamo:', err);
      const error = err as { response?: { data?: { detail?: string } } };
      toast.error(error.response?.data?.detail || 'Error al crear el reclamo');
    } finally {
      setSubmitting(false);
    }
  };

  const selectedCategoria = categorias.find(c => c.id === Number(formData.categoria_id));
  const selectedZona = zonas.find(z => z.id === Number(formData.zona_id));

  // Función para verificar si el email existe (con debounce)
  const checkEmailExists = useCallback(async (email: string) => {
    if (!email || email.length < 3) {
      setEmailExists(null);
      return;
    }

    if (emailCheckTimeoutRef.current) {
      clearTimeout(emailCheckTimeoutRef.current);
    }

    emailCheckTimeoutRef.current = setTimeout(async () => {
      setCheckingEmail(true);
      try {
        const res = await authApi.checkEmail(email);
        setEmailExists(res.data.exists);
      } catch {
        setEmailExists(null);
      } finally {
        setCheckingEmail(false);
      }
    }, 500);
  }, []);

  // Handler para cambio de email
  const handleEmailChange = (email: string) => {
    setRegisterData({ ...registerData, email });
    setRegisterError('');
    checkEmailExists(email);
  };

  // Función para manejar el registro o login
  const handleRegisterOrLogin = async () => {
    setRegistering(true);
    setRegisterError('');
    try {
      if (emailExists) {
        // Usuario existe - hacer login
        await login(registerData.email, registerData.password);
        toast.success('¡Sesión iniciada! Continuá con tu reclamo');
      } else {
        // Usuario nuevo - registrar
        const partes = registerData.nombre.trim().split(' ');
        const nombre = partes[0] || '';
        const apellido = partes.slice(1).join(' ') || '-';

        await register({
          email: registerData.email,
          password: registerData.password,
          nombre,
          apellido,
          es_anonimo: isAnonymous,
          telefono: !isAnonymous && registerData.telefono ? registerData.telefono : undefined,
        });

        toast.success(isAnonymous
          ? '¡Cuenta anónima creada! Continuá con tu reclamo'
          : '¡Cuenta creada! Continuá con tu reclamo'
        );
      }
      // Después del login, el array steps se regenera sin el paso de registro
      // Necesitamos esperar un tick para que React actualice el array
      // y luego ir al paso de "Confirmar" (que estará en baseSteps[4])
      setTimeout(() => {
        setCurrentStep(4); // Paso "Confirmar" en baseSteps
      }, 0);
      setRegistering(false);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string } } };
      setRegisterError(error.response?.data?.detail || (emailExists ? 'Contraseña incorrecta' : 'Error al registrarse'));
      setRegistering(false);
    }
  };

  // Validaciones de steps usando el sistema centralizado
  // - emailExists === true: login (solo email + password)
  // - emailExists === false: registro (nombre + email + password)
  // - emailExists === null: aún no verificado, requiere que escriba email primero
  const isRegisterValid = (() => {
    // Siempre requiere email y password
    if (!registerData.email || registerData.password.length < 6) return false;

    // Si el email existe (login), con email + password alcanza
    if (emailExists === true) return true;

    // Si el email no existe (registro), requiere nombre
    if (emailExists === false) return !!registerData.nombre;

    // Si aún no se verificó (null), no es válido todavía
    return false;
  })();
  const categoriaValidation = validationSchemas.reclamo.categoria_id(formData.categoria_id);
  const direccionValidation = validationSchemas.reclamo.direccion(formData.direccion);
  const tituloValidation = validationSchemas.reclamo.titulo(formData.titulo);
  const descripcionValidation = validationSchemas.reclamo.descripcion(formData.descripcion);

  const isCategoriaValid = categoriaValidation.isValid;
  const isUbicacionValid = direccionValidation.isValid;
  const isDetallesValid = tituloValidation.isValid && descripcionValidation.isValid;

  // Mostrar loading mientras se verifica autenticación
  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin mx-auto mb-4" style={{ color: theme.primary }} />
          <p style={{ color: theme.textSecondary }}>Verificando sesión...</p>
        </div>
      </div>
    );
  }

  // Contenido del paso de Registro - Flujo unificado login/registro
  const RegistroStepContent = (
    <WizardStepContent
      title={emailExists ? '¡Hola de nuevo!' : '¿Cómo querés identificarte?'}
      description={emailExists ? 'Ingresá tu contraseña para continuar' : 'Elegí cómo querés que se registre tu reclamo'}
    >
      {/* Toggle de privacidad - solo si es usuario nuevo */}
      {!emailExists && (
        <div className="space-y-3 mb-6">
          {/* Opción Anónimo */}
          <button
            type="button"
            onClick={() => setIsAnonymous(true)}
            className="w-full p-4 rounded-xl text-left transition-all"
            style={{
              backgroundColor: isAnonymous ? `${theme.primary}15` : theme.backgroundSecondary,
              border: `2px solid ${isAnonymous ? theme.primary : theme.border}`,
            }}
          >
            <div className="flex items-start gap-3">
              <div
                className="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5"
                style={{ borderColor: isAnonymous ? theme.primary : theme.border }}
              >
                {isAnonymous && (
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: theme.primary }} />
                )}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4" style={{ color: theme.primary }} />
                  <span className="font-medium" style={{ color: theme.text }}>Reclamo anónimo</span>
                </div>
                <p className="text-xs mt-1" style={{ color: theme.textSecondary }}>
                  Tu identidad será privada para el municipio. Solo vos podrás ver y dar seguimiento a tu reclamo.
                </p>
              </div>
            </div>
          </button>

          {/* Opción Con datos */}
          <button
            type="button"
            onClick={() => setIsAnonymous(false)}
            className="w-full p-4 rounded-xl text-left transition-all"
            style={{
              backgroundColor: !isAnonymous ? `${theme.primary}15` : theme.backgroundSecondary,
              border: `2px solid ${!isAnonymous ? theme.primary : theme.border}`,
            }}
          >
            <div className="flex items-start gap-3">
              <div
                className="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5"
                style={{ borderColor: !isAnonymous ? theme.primary : theme.border }}
              >
                {!isAnonymous && (
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: theme.primary }} />
                )}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4" style={{ color: theme.primary }} />
                  <span className="font-medium" style={{ color: theme.text }}>Con mis datos</span>
                </div>
                <p className="text-xs mt-1" style={{ color: theme.textSecondary }}>
                  El municipio podrá contactarte directamente para resolver tu reclamo más rápido.
                </p>
              </div>
            </div>
          </button>
        </div>
      )}

      {registerError && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-xl text-sm mb-4">
          {registerError}
        </div>
      )}

      <div className="space-y-4">
        {/* Campo de email - PRIMERO para verificar si existe */}
        <div>
          <label className="block text-sm font-medium mb-2" style={{ color: theme.text }}>
            {isAnonymous ? 'Usuario (para ingresar)' : 'Email'}
          </label>
          <div className="relative">
            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5" style={{ color: theme.textSecondary }} />
            <input
              type={isAnonymous ? 'text' : 'email'}
              value={registerData.email}
              onChange={(e) => handleEmailChange(e.target.value)}
              placeholder={isAnonymous ? 'mi_usuario' : 'tu@email.com'}
              className="w-full pl-12 pr-4 py-3 rounded-xl focus:ring-2 focus:outline-none transition-all"
              style={{
                backgroundColor: theme.backgroundSecondary,
                color: theme.text,
                border: `1px solid ${emailExists ? theme.primary : theme.border}`,
              }}
            />
            {checkingEmail && (
              <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 h-5 w-5 animate-spin" style={{ color: theme.textSecondary }} />
            )}
          </div>
          {/* Mensaje de usuario encontrado */}
          {emailExists && (
            <p className="text-xs mt-1 flex items-center gap-1" style={{ color: theme.primary }}>
              <CheckCircle2 className="h-3 w-3" />
              ¡Te encontramos! Ingresá tu contraseña para continuar.
            </p>
          )}
          {emailExists === false && registerData.email.length > 3 && (
            <p className="text-xs mt-1" style={{ color: theme.textSecondary }}>
              {isAnonymous ? 'Usá un nombre de usuario que puedas recordar' : 'Usuario nuevo - completá los datos para registrarte'}
            </p>
          )}
        </div>

        {/* Campo de nombre - solo para registro nuevo (después de verificar email) */}
        {emailExists === false && (
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: theme.text }}>
              {isAnonymous ? 'Apodo o nombre' : 'Tu nombre completo'}
            </label>
            <div className="relative">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5" style={{ color: theme.textSecondary }} />
              <input
                type="text"
                value={registerData.nombre}
                onChange={(e) => setRegisterData({ ...registerData, nombre: e.target.value })}
                placeholder={isAnonymous ? 'Vecino123' : 'Juan Pérez'}
                className="w-full pl-12 pr-4 py-3 rounded-xl focus:ring-2 focus:outline-none transition-all"
                style={{
                  backgroundColor: theme.backgroundSecondary,
                  color: theme.text,
                  border: `1px solid ${theme.border}`,
                }}
              />
            </div>
          </div>
        )}

        {/* Campo de contraseña */}
        <div>
          <label className="block text-sm font-medium mb-2" style={{ color: theme.text }}>
            Contraseña
          </label>
          <div className="relative">
            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5" style={{ color: theme.textSecondary }} />
            <input
              type="password"
              value={registerData.password}
              onChange={(e) => setRegisterData({ ...registerData, password: e.target.value })}
              placeholder={emailExists ? 'Tu contraseña' : 'Mínimo 6 caracteres'}
              minLength={6}
              className="w-full pl-12 pr-4 py-3 rounded-xl focus:ring-2 focus:outline-none transition-all"
              style={{
                backgroundColor: theme.backgroundSecondary,
                color: theme.text,
                border: `1px solid ${theme.border}`,
              }}
            />
          </div>
        </div>

        {/* Campo de teléfono - solo si NO es anónimo y es registro nuevo */}
        {!isAnonymous && !emailExists && (
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: theme.text }}>
              Teléfono (opcional)
            </label>
            <div className="relative">
              <Phone className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5" style={{ color: theme.textSecondary }} />
              <input
                type="tel"
                value={registerData.telefono}
                onChange={(e) => setRegisterData({ ...registerData, telefono: e.target.value })}
                placeholder="Ej: 11 2345-6789"
                className="w-full pl-12 pr-4 py-3 rounded-xl focus:ring-2 focus:outline-none transition-all"
                style={{
                  backgroundColor: theme.backgroundSecondary,
                  color: theme.text,
                  border: `1px solid ${theme.border}`,
                }}
              />
            </div>
            <p className="text-xs mt-1" style={{ color: theme.textSecondary }}>
              Para que el municipio pueda contactarte más rápido
            </p>
          </div>
        )}

        {/* Enlace a login externo - solo si no encontró el email */}
        {!emailExists && (
          <p className="text-xs text-center mt-2" style={{ color: theme.textSecondary }}>
            ¿Ya tenés cuenta? Ingresá tu email arriba y te reconoceremos.
          </p>
        )}

        {/* Si el email existe, mostrar opción de cambiar email */}
        {emailExists && (
          <p className="text-xs text-center mt-2" style={{ color: theme.textSecondary }}>
            ¿No sos vos?{' '}
            <button
              onClick={() => {
                setRegisterData({ ...registerData, email: '', password: '' });
                setEmailExists(null);
              }}
              className="font-medium"
              style={{ color: theme.primary }}
            >
              Usar otro email
            </button>
          </p>
        )}
      </div>
    </WizardStepContent>
  );

  // Validación del paso de chat (tiene al menos una descripción del usuario)
  const isChatValid = chatMessages.some(m => m.role === 'user') && !chatAnalyzing;

  // Contenido del paso de Chat inicial (Step 0)
  const ChatStepContent = (
    <WizardStepContent
      title="Contanos tu problema"
      description="Describí lo que querés reportar y te ayudaremos a clasificarlo"
    >
      <div className="flex flex-col h-[400px]">
        {/* Área de mensajes */}
        <div
          className="flex-1 overflow-y-auto space-y-3 p-3 rounded-xl mb-3"
          style={{ backgroundColor: theme.backgroundSecondary }}
        >
          {chatMessages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] p-3 rounded-2xl ${
                  msg.role === 'user' ? 'rounded-br-md' : 'rounded-bl-md'
                }`}
                style={{
                  backgroundColor: msg.role === 'user' ? theme.primary : theme.card,
                  color: msg.role === 'user' ? 'white' : theme.text,
                }}
              >
                {msg.role === 'assistant' && (
                  <div className="flex items-center gap-2 mb-1">
                    <Bot className="h-4 w-4" style={{ color: theme.primary }} />
                    <span className="text-xs font-medium" style={{ color: theme.primary }}>Asistente</span>
                  </div>
                )}
                <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
              </div>
            </div>
          ))}

          {/* Indicador de análisis */}
          {chatAnalyzing && (
            <div className="flex justify-start">
              <div
                className="p-3 rounded-2xl rounded-bl-md"
                style={{ backgroundColor: theme.card }}
              >
                <div className="flex items-center gap-2">
                  <Bot className="h-4 w-4" style={{ color: theme.primary }} />
                  <div className="flex gap-1">
                    <span className="w-2 h-2 rounded-full animate-bounce" style={{ backgroundColor: theme.primary, animationDelay: '0ms' }} />
                    <span className="w-2 h-2 rounded-full animate-bounce" style={{ backgroundColor: theme.primary, animationDelay: '150ms' }} />
                    <span className="w-2 h-2 rounded-full animate-bounce" style={{ backgroundColor: theme.primary, animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            </div>
          )}

          <div ref={chatMessagesEndRef} />
        </div>

        {/* Sugerencia de categoría */}
        {chatCategoriaSugerida && !chatAnalyzing && (
          <div
            className="p-3 rounded-xl mb-3 flex items-center justify-between"
            style={{
              backgroundColor: `${chatCategoriaSugerida.categoria.color || DEFAULT_CATEGORY_COLOR}15`,
              border: `1px solid ${chatCategoriaSugerida.categoria.color || DEFAULT_CATEGORY_COLOR}40`,
            }}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center"
                style={{
                  backgroundColor: chatCategoriaSugerida.categoria.color || DEFAULT_CATEGORY_COLOR,
                  color: 'white',
                }}
              >
                {getCategoryIcon(chatCategoriaSugerida.categoria.nombre)}
              </div>
              <div>
                <p className="text-xs" style={{ color: theme.textSecondary }}>Categoría sugerida</p>
                <p className="font-medium" style={{ color: theme.text }}>
                  {chatCategoriaSugerida.categoria.nombre}
                </p>
              </div>
            </div>
            <button
              onClick={acceptChatSuggestedCategory}
              className="px-4 py-2 rounded-lg font-medium text-sm transition-all hover:scale-105 active:scale-95"
              style={{ backgroundColor: theme.primary, color: 'white' }}
            >
              Confirmar
            </button>
          </div>
        )}

        {/* Input de chat */}
        <div className="flex gap-2">
          <input
            ref={chatInputRef}
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleChatSubmit()}
            placeholder="Escribí tu problema aquí..."
            disabled={chatAnalyzing}
            className="flex-1 px-4 py-3 rounded-xl focus:ring-2 focus:outline-none transition-all"
            style={{
              backgroundColor: theme.backgroundSecondary,
              color: theme.text,
              border: `1px solid ${theme.border}`,
            }}
          />
          <button
            onClick={handleChatSubmit}
            disabled={!chatInput.trim() || chatAnalyzing}
            className="px-4 py-3 rounded-xl transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100"
            style={{ backgroundColor: theme.primary, color: 'white' }}
          >
            {chatAnalyzing ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Send className="h-5 w-5" />
            )}
          </button>
        </div>

        {/* Respuesta IA o Tip */}
        {chatMessages.length > 1 ? (
          <div className="mt-3 p-3 rounded-lg text-sm" style={{ backgroundColor: `${theme.primary}10`, border: `1px solid ${theme.primary}20` }}>
            <div className="flex items-start gap-2">
              <Bot className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: theme.primary }} />
              <p style={{ color: theme.text }}>
                {chatMessages.filter(m => m.role === 'assistant').slice(-1)[0]?.content}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-xs text-center mt-3" style={{ color: theme.textSecondary }}>
            Ejemplo: "Hay un bache grande en la esquina de mi casa que es peligroso para los autos"
          </p>
        )}
      </div>
    </WizardStepContent>
  );

  // Filtrar categorías
  const categoriasFiltradas = searchCategoria.trim()
    ? categorias.filter(c =>
        c.nombre.toLowerCase().includes(searchCategoria.toLowerCase()) ||
        (c.descripcion && c.descripcion.toLowerCase().includes(searchCategoria.toLowerCase()))
      )
    : categorias;

  // Contenido del paso de Categoría
  const CategoriaStepContent = (
    <WizardStepContent title="¿Qué problema querés reportar?" description="Seleccioná la categoría que mejor describe el problema">
      {loading ? (
        <div className="text-center py-8">
          <Loader2 className="h-8 w-8 animate-spin mx-auto" style={{ color: theme.primary }} />
        </div>
      ) : categorias.length === 0 ? (
        <div className="text-center py-8" style={{ color: theme.textSecondary }}>
          No hay categorías disponibles
        </div>
      ) : (
        <div className="space-y-4">
          {/* Buscador de categorías */}
          <div className="relative">
            <input
              type="text"
              placeholder="Buscar categoría..."
              value={searchCategoria}
              onChange={(e) => setSearchCategoria(e.target.value)}
              className="w-full pl-10 pr-4 py-3 rounded-xl text-sm"
              style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}`, color: theme.text }}
            />
            <FolderOpen className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: theme.textSecondary }} />
          </div>

          {/* Sugerencia de IA destacada si existe */}
          {chatCategoriaSugerida && !formData.categoria_id && (() => {
            const suggestedColor = chatCategoriaSugerida.categoria.color || DEFAULT_CATEGORY_COLOR;
            return (
            <div
              className="p-3 rounded-xl flex items-center justify-between"
              style={{
                backgroundColor: `${suggestedColor}15`,
                border: `2px solid ${suggestedColor}`,
              }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center"
                  style={{
                    backgroundColor: suggestedColor,
                    color: 'white',
                  }}
                >
                  {getCategoryIcon(chatCategoriaSugerida.categoria.nombre)}
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <Lightbulb className="h-3.5 w-3.5" style={{ color: suggestedColor }} />
                    <span className="text-xs font-medium" style={{ color: suggestedColor }}>
                      Sugerida por IA ({Math.round(chatCategoriaSugerida.confianza)}%)
                    </span>
                  </div>
                  <p className="font-semibold" style={{ color: theme.text }}>
                    {chatCategoriaSugerida.categoria.nombre}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setFormData({
                    ...formData,
                    categoria_id: String(chatCategoriaSugerida.categoria.id),
                    titulo: formData.titulo || `Problema de ${chatCategoriaSugerida.categoria.nombre.toLowerCase()}`,
                  });
                }}
                className="px-4 py-2 rounded-lg font-medium text-sm transition-all hover:scale-105"
                style={{ backgroundColor: suggestedColor, color: 'white' }}
              >
                Usar esta
              </button>
            </div>
            );
          })()}

          {/* Grid de categorías */}
          <div
            className="grid gap-2 sm:gap-3"
            style={{
              gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
            }}
          >
            {categoriasFiltradas.map((cat) => {
              const isSelected = formData.categoria_id === String(cat.id);
              const isSuggested = chatCategoriaSugerida?.categoria.id === cat.id && !formData.categoria_id;
              const catColor = cat.color || DEFAULT_CATEGORY_COLOR;

              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => {
                    setFormData({
                      ...formData,
                      categoria_id: String(cat.id),
                      titulo: formData.titulo || `Problema de ${cat.nombre.toLowerCase()}`,
                    });
                  }}
                  className="relative p-2 sm:p-3 rounded-xl border-2 transition-all duration-300 active:scale-95 touch-manipulation"
                  style={{
                    backgroundColor: isSelected ? `${catColor}20` : isSuggested ? `${catColor}10` : theme.backgroundSecondary,
                    borderColor: isSelected ? catColor : isSuggested ? `${catColor}60` : theme.border,
                    color: theme.text,
                    minHeight: '90px',
                  }}
                >
                  <div
                    className="w-9 h-9 sm:w-10 sm:h-10 rounded-full mx-auto mb-1.5 sm:mb-2 flex items-center justify-center transition-all duration-300"
                    style={{
                      backgroundColor: isSelected ? catColor : `${catColor}30`,
                      color: isSelected ? 'white' : catColor,
                    }}
                  >
                    {getCategoryIcon(cat.nombre)}
                  </div>
                  <span className="text-[10px] sm:text-xs font-medium block leading-tight text-center line-clamp-2">{cat.nombre}</span>

                  {isSelected && (
                    <div
                      className="absolute top-1 right-1 w-4 h-4 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: catColor }}
                    >
                      <CheckCircle2 className="h-2.5 w-2.5 text-white" />
                    </div>
                  )}

                  {isSuggested && !isSelected && (
                    <div
                      className="absolute top-1 right-1 w-4 h-4 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: catColor }}
                    >
                      <Lightbulb className="h-2.5 w-2.5 text-white" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Categoría seleccionada */}
          {selectedCategoria && (() => {
            const selColor = selectedCategoria.color || DEFAULT_CATEGORY_COLOR;
            return (
            <div
              className="p-3 rounded-xl"
              style={{
                backgroundColor: `${selColor}15`,
                border: `2px solid ${selColor}`,
              }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: selColor }}
                >
                  <span className="text-white">{getCategoryIcon(selectedCategoria.nombre)}</span>
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-sm" style={{ color: theme.text }}>{selectedCategoria.nombre}</p>
                  {selectedCategoria.descripcion && (
                    <p className="text-xs" style={{ color: theme.textSecondary }}>{selectedCategoria.descripcion}</p>
                  )}
                </div>
                <CheckCircle2 className="h-5 w-5" style={{ color: selColor }} />
              </div>
            </div>
            );
          })()}
        </div>
      )}
    </WizardStepContent>
  );

  // Contenido del paso de Ubicación
  const UbicacionStepContent = (
    <WizardStepContent title="¿Dónde está el problema?" description="Indicá la dirección y ubicación del reclamo">
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
              onBlur={() => handleFieldBlur('direccion')}
              placeholder="Escribí para buscar direcciones..."
              maxLength={120}
              className="w-full px-4 py-3 rounded-xl focus:ring-2 focus:outline-none transition-all"
              style={{
                backgroundColor: theme.backgroundSecondary,
                color: theme.text,
                border: `1px solid ${fieldsTouched.direccion && !direccionValidation.isValid ? '#ef4444' : theme.border}`,
              }}
            />
            {searchingAddress && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <Loader2 className="h-5 w-5 animate-spin" style={{ color: theme.textSecondary }} />
              </div>
            )}
          </div>
          {fieldsTouched.direccion && !direccionValidation.isValid && (
            <p className="mt-1 text-xs text-red-500">{direccionValidation.error}</p>
          )}

          {/* Sugerencias de direcciones */}
          {showSuggestions && addressSuggestions.length > 0 && (
            <div
              className="absolute z-50 w-full mt-1 rounded-xl shadow-lg overflow-hidden max-h-60 overflow-y-auto"
              style={{
                backgroundColor: theme.card,
                border: `1px solid ${theme.border}`,
              }}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              {addressSuggestions.map((suggestion, index) => (
                <button
                  key={index}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    selectAddressSuggestion(suggestion);
                  }}
                  className="w-full text-left px-4 py-3 flex items-start gap-3 transition-colors touch-manipulation"
                  style={{ color: theme.text }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = theme.backgroundSecondary}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <MapPin className="h-5 w-5 flex-shrink-0 mt-0.5" style={{ color: theme.primary }} />
                  <span className="text-sm line-clamp-2">{suggestion.display_name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Zona/Barrio se detecta automáticamente de la dirección */}

        <div>
          <label className="block text-sm font-medium mb-2" style={{ color: theme.text }}>
            Ubicación en el mapa (opcional)
          </label>
          <MapPicker
            value={formData.latitud && formData.longitud ? { lat: formData.latitud, lng: formData.longitud } : null}
            onChange={(coords) => setFormData({ ...formData, latitud: coords.lat, longitud: coords.lng })}
            height="250px"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2" style={{ color: theme.text }}>
            Referencia (opcional)
          </label>
          <input
            type="text"
            value={formData.referencia}
            onChange={(e) => setFormData({ ...formData, referencia: e.target.value })}
            placeholder="Ej: Frente a la plaza, cerca del hospital"
            className="w-full px-4 py-3 rounded-xl focus:ring-2 focus:outline-none transition-all"
            style={{
              backgroundColor: theme.backgroundSecondary,
              color: theme.text,
              border: `1px solid ${theme.border}`,
            }}
          />
        </div>
      </div>
    </WizardStepContent>
  );

  // Contenido del paso de Detalles
  const DetallesStepContent = (
    <WizardStepContent title="Contanos más detalles" description="Describí el problema con la mayor precisión posible">
      {/* Mostrar categoría seleccionada */}
      {selectedCategoria && (() => {
        const selColor = selectedCategoria.color || DEFAULT_CATEGORY_COLOR;
        return (
        <div
          className="flex items-center gap-3 p-3 rounded-xl mb-4"
          style={{ backgroundColor: `${selColor}15`, border: `1px solid ${selColor}30` }}
        >
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: `${selColor}25`, color: selColor }}
          >
            {getCategoryIcon(selectedCategoria.nombre)}
          </div>
          <div>
            <p className="text-xs" style={{ color: theme.textSecondary }}>Categoría seleccionada</p>
            <p className="font-medium" style={{ color: theme.text }}>{selectedCategoria.nombre}</p>
          </div>
        </div>
        );
      })()}

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-2" style={{ color: theme.text }}>
            Título del reclamo <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={formData.titulo}
            onChange={(e) => handleTituloChange(e.target.value)}
            onBlur={() => handleFieldBlur('titulo')}
            placeholder="Ej: Bache peligroso en esquina"
            maxLength={100}
            className="w-full px-4 py-3 rounded-xl focus:ring-2 focus:outline-none transition-all"
            style={{
              backgroundColor: theme.backgroundSecondary,
              color: theme.text,
              border: `1px solid ${fieldsTouched.titulo && !tituloValidation.isValid ? '#ef4444' : theme.border}`,
            }}
          />
          {fieldsTouched.titulo && !tituloValidation.isValid && (
            <p className="mt-1 text-xs text-red-500">{tituloValidation.error}</p>
          )}
          <p className="mt-1 text-xs" style={{ color: theme.textSecondary }}>
            {formData.titulo.length}/100 caracteres
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2" style={{ color: theme.text }}>
            Descripción detallada <span className="text-red-500">*</span>
          </label>
          <textarea
            value={formData.descripcion}
            onChange={(e) => handleDescripcionChange(e.target.value)}
            onBlur={handleDescripcionBlur}
            placeholder="Describe el problema con el mayor detalle posible..."
            rows={4}
            maxLength={2000}
            className="w-full px-4 py-3 rounded-xl focus:ring-2 focus:outline-none transition-all resize-none"
            style={{
              backgroundColor: theme.backgroundSecondary,
              color: theme.text,
              border: `1px solid ${fieldsTouched.descripcion && !descripcionValidation.isValid ? '#ef4444' : theme.border}`,
            }}
          />
          {fieldsTouched.descripcion && !descripcionValidation.isValid && (
            <p className="mt-1 text-xs text-red-500">{descripcionValidation.error}</p>
          )}
          <p className="mt-1 text-xs" style={{ color: theme.textSecondary }}>
            {formData.descripcion.length}/2000 caracteres (mínimo 10)
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2" style={{ color: theme.text }}>
            Fotos (opcional)
          </label>
          <p className="text-xs mb-3" style={{ color: theme.textSecondary }}>
            Agrega hasta 5 fotos del problema
          </p>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />

          <div className="flex flex-wrap gap-3">
            {previewUrls.map((url, index) => (
              <div
                key={index}
                className="relative w-20 h-20 rounded-xl overflow-hidden group"
                style={{ border: `1px solid ${theme.border}` }}
              >
                <img src={url} alt={`Preview ${index + 1}`} className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => removeFile(index)}
                  className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                >
                  <X className="h-5 w-5 text-white" />
                </button>
              </div>
            ))}

            {selectedFiles.length < 5 && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-20 h-20 rounded-xl flex flex-col items-center justify-center gap-1 transition-all hover:scale-105 active:scale-95"
                style={{
                  backgroundColor: theme.backgroundSecondary,
                  border: `2px dashed ${theme.border}`,
                  color: theme.textSecondary,
                }}
              >
                <Camera className="h-5 w-5" />
                <span className="text-xs">Agregar</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </WizardStepContent>
  );

  // Contenido del paso de Confirmar
  const ConfirmarStepContent = (
    <WizardStepContent title="Confirmá los datos">
      <div className="space-y-3">
        {/* Dependencia Encargada */}
        <div
          className="flex items-center gap-3 p-4 rounded-xl"
          style={{
            backgroundColor: `${dependenciaEncargada?.color || theme.primary}15`,
            border: `1px solid ${dependenciaEncargada?.color || theme.primary}30`
          }}
        >
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center"
            style={{
              backgroundColor: dependenciaEncargada?.color || theme.primary,
              color: 'white'
            }}
          >
            <DynamicIcon name={dependenciaEncargada?.icono || 'Building2'} className="h-5 w-5" />
          </div>
          <div>
            <span className="text-xs" style={{ color: theme.textSecondary }}>Será derivado a</span>
            <p className="font-medium" style={{ color: theme.text }}>
              {dependenciaEncargada?.nombre || 'Área correspondiente'}
            </p>
          </div>
        </div>

        {/* Usuario */}
        {user && (
          <div
            className="flex items-center gap-3 p-4 rounded-xl"
            style={{ backgroundColor: theme.backgroundSecondary }}
          >
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: `${theme.primary}20`, color: theme.primary }}
            >
              <User className="h-5 w-5" />
            </div>
            <div>
              <span className="text-xs" style={{ color: theme.textSecondary }}>Usuario</span>
              <p className="font-medium" style={{ color: theme.text }}>
                {user.nombre} {user.apellido}
              </p>
              <p className="text-xs" style={{ color: theme.textSecondary }}>
                {user.email}
              </p>
            </div>
          </div>
        )}

        {/* Categoría */}
        <div
          className="flex items-center gap-3 p-4 rounded-xl"
          style={{ backgroundColor: theme.backgroundSecondary }}
        >
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center"
            style={{
              backgroundColor: selectedCategoria ? `${selectedCategoria.color || DEFAULT_CATEGORY_COLOR}20` : theme.border,
              color: selectedCategoria ? (selectedCategoria.color || DEFAULT_CATEGORY_COLOR) : theme.textSecondary,
            }}
          >
            {selectedCategoria ? getCategoryIcon(selectedCategoria.nombre) : <FolderOpen className="h-5 w-5" />}
          </div>
          <div>
            <span className="text-xs" style={{ color: theme.textSecondary }}>Categoría</span>
            <p className="font-medium" style={{ color: theme.text }}>
              {selectedCategoria?.nombre || 'No seleccionada'}
            </p>
          </div>
        </div>

        {/* Ubicación */}
        <div
          className="flex items-center gap-3 p-4 rounded-xl"
          style={{ backgroundColor: theme.backgroundSecondary }}
        >
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: '#10b98120', color: '#10b981' }}
          >
            <MapPin className="h-5 w-5" />
          </div>
          <div>
            <span className="text-xs" style={{ color: theme.textSecondary }}>Ubicación</span>
            <p className="font-medium" style={{ color: theme.text }}>
              {formData.direccion || 'No especificada'}
            </p>
            {selectedZona && (
              <p className="text-xs" style={{ color: theme.textSecondary }}>
                {selectedZona.nombre}
              </p>
            )}
          </div>
        </div>

        {/* Detalles */}
        <div
          className="p-4 rounded-xl"
          style={{ backgroundColor: theme.backgroundSecondary }}
        >
          <div className="flex items-center gap-3 mb-2">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: '#6366f120', color: '#6366f1' }}
            >
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <span className="text-xs" style={{ color: theme.textSecondary }}>Título</span>
              <p className="font-medium" style={{ color: theme.text }}>
                {formData.titulo || 'Sin título'}
              </p>
            </div>
          </div>
          {formData.descripcion && (
            <p className="text-sm mt-2 ml-13" style={{ color: theme.textSecondary, marginLeft: '52px' }}>
              {formData.descripcion}
            </p>
          )}
        </div>

        {/* Fotos */}
        {selectedFiles.length > 0 && (
          <div
            className="p-4 rounded-xl"
            style={{ backgroundColor: theme.backgroundSecondary }}
          >
            <div className="flex items-center gap-3 mb-3">
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: '#f59e0b20', color: '#f59e0b' }}
              >
                <Camera className="h-5 w-5" />
              </div>
              <div>
                <span className="text-xs" style={{ color: theme.textSecondary }}>Fotos adjuntas</span>
                <p className="font-medium" style={{ color: theme.text }}>
                  {selectedFiles.length} {selectedFiles.length === 1 ? 'archivo' : 'archivos'}
                </p>
              </div>
            </div>
            <div className="flex gap-2" style={{ marginLeft: '52px' }}>
              {previewUrls.map((url, index) => (
                <div
                  key={index}
                  className="w-12 h-12 rounded-lg overflow-hidden"
                  style={{ border: `2px solid ${theme.border}` }}
                >
                  <img src={url} alt={`Preview ${index + 1}`} className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tip */}
        <div
          className="flex items-start gap-3 p-4 rounded-xl mt-4"
          style={{ backgroundColor: `${theme.primary}10`, border: `1px solid ${theme.primary}30` }}
        >
          <Lightbulb className="h-5 w-5 flex-shrink-0 mt-0.5" style={{ color: theme.primary }} />
          <p className="text-sm" style={{ color: theme.text }}>
            Una vez enviado, recibirás un número de seguimiento para consultar el estado de tu reclamo.
          </p>
        </div>
      </div>
    </WizardStepContent>
  );

  // Definir los steps del wizard
  const baseSteps: WizardStep[] = [
    {
      id: 'chat',
      title: 'Describir',
      description: 'Contanos tu problema',
      icon: <MessageCircle className="h-5 w-5" />,
      content: ChatStepContent,
      isValid: isChatValid,
    },
    {
      id: 'categoria',
      title: 'Categoría',
      description: 'Seleccioná el tipo de reclamo',
      icon: <FolderOpen className="h-5 w-5" />,
      content: CategoriaStepContent,
      isValid: isCategoriaValid,
    },
    {
      id: 'ubicacion',
      title: 'Ubicación',
      description: 'Indicá dónde está el problema',
      icon: <MapPin className="h-5 w-5" />,
      content: UbicacionStepContent,
      isValid: isUbicacionValid,
    },
    {
      id: 'detalles',
      title: 'Detalles',
      description: 'Agregá fotos y más información',
      icon: <FileText className="h-5 w-5" />,
      content: DetallesStepContent,
      isValid: isDetallesValid,
    },
    {
      id: 'confirmar',
      title: 'Confirmar',
      description: 'Revisá y enviá tu reclamo',
      icon: <CheckCircle2 className="h-5 w-5" />,
      content: ConfirmarStepContent,
      isValid: true,
    },
  ];

  // Si no hay usuario, agregar paso de registro ANTES de confirmar (al final del flujo)
  const registerStep: WizardStep = {
    id: 'registro',
    title: 'Cuenta',
    description: 'Identificate para continuar',
    icon: <User className="h-5 w-5" />,
    content: RegistroStepContent,
    isValid: isRegisterValid,
  };

  // Flujo para público: Chat -> Categoría -> Ubicación -> Detalles -> [Registro si no logueado] -> Confirmar
  let steps: WizardStep[];
  if (showOnlyRegister) {
    steps = [...baseSteps.slice(0, 4), registerStep, baseSteps[4]];
  } else {
    steps = baseSteps;
  }

  // Índice del paso de registro (si existe)
  const registerStepIndex = showOnlyRegister ? 4 : -1;

  // Manejar el cambio de step y posible registro/login
  const handleStepChange = (newStep: number) => {
    // Si estamos en el paso de registro y vamos al siguiente (confirmar), primero registrar/login
    if (showOnlyRegister && currentStep === registerStepIndex && newStep === registerStepIndex + 1) {
      handleRegisterOrLogin();
      return;
    }
    setCurrentStep(newStep);
  };

  // AI suggestion contextual para cada paso del wizard
  const getAISuggestion = () => {
    // Obtener el ID del paso actual
    const currentStepId = steps[currentStep]?.id;

    // Paso de chat - no necesita AI suggestion externa porque el chat es la IA
    if (currentStepId === 'chat') {
      return undefined;
    }

    // Paso de registro (solo para usuarios no autenticados)
    if (currentStepId === 'registro') {
      if (!registerData.nombre && !registerData.email) {
        return {
          title: '¡Hola! Soy tu asistente',
          message: 'Completá tus datos para crear una cuenta. Solo necesitamos tu nombre, email y una contraseña segura.',
        };
      }
      if (registerData.nombre && !registerData.email) {
        return {
          title: `¡Hola ${registerData.nombre.split(' ')[0]}!`,
          message: 'Ahora ingresá tu email o nombre de usuario para poder contactarte sobre tu reclamo.',
        };
      }
      if (registerData.nombre && registerData.email && registerData.password.length < 6) {
        return {
          title: 'Casi listo',
          message: 'Elegí una contraseña de al menos 6 caracteres para proteger tu cuenta.',
        };
      }
      if (isRegisterValid) {
        return {
          title: '¡Perfecto!',
          message: 'Ya podés continuar al siguiente paso para comenzar con tu reclamo.',
        };
      }
    }

    // Paso de categoría
    if (currentStepId === 'categoria') {
      // Si ya hay una categoría sugerida por el chat
      if (chatCategoriaSugerida && !formData.categoria_id) {
        return {
          title: 'Categoría sugerida',
          message: `Basado en tu descripción, sugerimos "${chatCategoriaSugerida.categoria.nombre}". ¿Es correcto o preferís elegir otra?`,
          actions: [{
            label: `Usar ${chatCategoriaSugerida.categoria.nombre}`,
            onClick: () => acceptSuggestedCategory(chatCategoriaSugerida.categoria),
            variant: 'primary' as const,
          }],
        };
      }
      // Si hay sugerencias de IA basadas en el texto
      if (analyzing) {
        return {
          loading: true,
          title: 'Analizando tu descripción',
          message: 'Estoy buscando la categoría más adecuada...',
        };
      }
      if (showSuggestion && suggestedCategorias.length > 0) {
        return {
          title: 'Categorías sugeridas',
          message: `Basado en tu descripción, te sugiero estas opciones:`,
          actions: suggestedCategorias.map((sug) => ({
            label: `${sug.categoria.nombre} (${sug.confianza}%)`,
            onClick: () => acceptSuggestedCategory(sug.categoria),
            variant: 'primary' as const,
          })),
        };
      }
      if (!formData.categoria_id) {
        return {
          title: 'Seleccioná una categoría',
          message: 'Elegí la categoría que mejor describa el problema.',
        };
      }
      const cat = categorias.find(c => c.id === Number(formData.categoria_id));
      if (cat) {
        return {
          title: `${cat.nombre} seleccionado`,
          message: 'Excelente elección. Ahora vamos a indicar dónde está ubicado el problema.',
        };
      }
    }

    // Paso de ubicación
    if (currentStepId === 'ubicacion') {
      if (!formData.direccion) {
        return {
          title: 'Ubicación del problema',
          message: 'Escribí la dirección y te mostraré sugerencias. También podés marcar el punto exacto en el mapa.',
        };
      }
      if (formData.direccion && !formData.latitud) {
        return {
          title: 'Tip: Usá el mapa',
          message: 'Podés hacer clic en el mapa para marcar la ubicación exacta. Esto ayuda al equipo a encontrar el problema más rápido.',
        };
      }
      if (isUbicacionValid) {
        return {
          title: 'Ubicación completa',
          message: 'La ubicación está lista. Continuá para agregar más detalles sobre el problema.',
        };
      }
    }

    // Paso de detalles
    if (currentStepId === 'detalles') {
      // Si está analizando para sugerir categorías
      if (analyzing) {
        return {
          loading: true,
          title: 'Analizando tu descripción...',
          message: 'Buscando la mejor categoría para tu reclamo.',
        };
      }
      // Si hay sugerencias de categoría (mostrar siempre que haya, igual que desktop)
      if (showSuggestion && suggestedCategorias.length > 0) {
        // Verificar si la mejor sugerencia es diferente a la seleccionada
        const mejorSugerencia = suggestedCategorias[0];
        const esDiferente = !selectedCategoria || mejorSugerencia.categoria.id !== selectedCategoria.id;

        if (esDiferente) {
          return {
            title: 'Categoría sugerida por IA',
            message: `Basado en tu descripción, te sugiero:`,
            actions: suggestedCategorias.slice(0, 2).map((sug) => ({
              label: `${sug.categoria.nombre} (${Math.round(sug.confianza)}%)`,
              onClick: () => acceptSuggestedCategory(sug.categoria),
              variant: 'primary' as const,
            })),
          };
        } else {
          // La categoría seleccionada coincide con la sugerencia
          return {
            title: '¡Buena elección!',
            message: `La IA confirma que "${selectedCategoria.nombre}" es la categoría correcta para tu descripción.`,
          };
        }
      }
      if (!formData.titulo && !formData.descripcion) {
        return {
          title: 'Describí el problema',
          message: 'Un buen título y descripción ayudan a priorizar y resolver tu reclamo más rápido.',
        };
      }
      if (formData.titulo && !formData.descripcion) {
        return {
          title: 'Agregá más detalles',
          message: 'Describí el problema con precisión: ¿desde cuándo ocurre? ¿representa un peligro? Cuantos más detalles, mejor.',
        };
      }
      if (formData.titulo && formData.descripcion && selectedFiles.length === 0) {
        return {
          title: 'Tip: Agregá fotos',
          message: 'Las imágenes ayudan muchísimo. Podés agregar hasta 5 fotos del problema.',
        };
      }
      if (isDetallesValid) {
        return {
          title: '¡Excelente descripción!',
          message: selectedFiles.length > 0
            ? `Tenés ${selectedFiles.length} foto${selectedFiles.length > 1 ? 's' : ''} adjunta${selectedFiles.length > 1 ? 's' : ''}. Revisá el resumen en el siguiente paso.`
            : 'Ya podés revisar el resumen de tu reclamo en el siguiente paso.',
        };
      }
    }

    // Paso de confirmación - sin AI suggestion

    return undefined;
  };

  const aiSuggestion = getAISuggestion();

  // Obtener la categoría seleccionada
  const selectedCategoriaObj = categorias.find(c => String(c.id) === formData.categoria_id);

  // Obtener el último mensaje del usuario del chat (la descripción del problema)
  const userProblemDescription = chatMessages.filter(m => m.role === 'user').slice(-1)[0]?.content;
  // Obtener la última respuesta del asistente
  const lastAssistantResponse = chatMessages.filter(m => m.role === 'assistant').slice(-1)[0]?.content;

  // Panel de IA para el wizard
  const wizardAIPanel = (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: `${theme.primary}20` }}>
          <Sparkles className="h-4 w-4" style={{ color: theme.primary }} />
        </div>
        <span className="font-medium text-sm" style={{ color: theme.text }}>Asistente IA</span>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto">
        {/* Descripción del problema ingresada por el usuario */}
        {userProblemDescription && (
          <div className="p-3 rounded-lg" style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}>
            <div className="flex items-center gap-2 mb-2">
              <MessageCircle className="h-4 w-4" style={{ color: theme.textSecondary }} />
              <span className="font-medium text-xs" style={{ color: theme.textSecondary }}>Tu problema</span>
            </div>
            <p className="text-sm" style={{ color: theme.text }}>"{userProblemDescription}"</p>
          </div>
        )}

        {/* Categoría sugerida por la IA */}
        {chatCategoriaSugerida && (
          <div
            className="p-3 rounded-lg animate-fade-in-up"
            style={{
              backgroundColor: `${chatCategoriaSugerida.categoria.color || theme.primary}15`,
              border: `1px solid ${chatCategoriaSugerida.categoria.color || theme.primary}40`,
            }}
          >
            <div className="flex items-center gap-2 mb-2">
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center"
                style={{ backgroundColor: `${chatCategoriaSugerida.categoria.color || theme.primary}30` }}
              >
                <div style={{ color: chatCategoriaSugerida.categoria.color || theme.primary }}>
                  {getCategoryIcon(chatCategoriaSugerida.categoria.nombre)}
                </div>
              </div>
              <span className="font-medium text-xs" style={{ color: theme.text }}>Categoría asignada</span>
            </div>
            <p className="text-sm font-semibold" style={{ color: chatCategoriaSugerida.categoria.color || theme.primary }}>
              {chatCategoriaSugerida.categoria.nombre}
            </p>
          </div>
        )}

        {/* Recomendación - color amber/naranja para consejos amigables */}
        {consejoAmigable && chatCategoriaSugerida && (
          <div
            className="p-3 rounded-lg animate-fade-in-up"
            style={{
              backgroundColor: '#f59e0b12',
              border: '1px solid #f59e0b30',
              animationDelay: '150ms'
            }}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <Lightbulb className="h-3.5 w-3.5" style={{ color: '#f59e0b' }} />
              <span className="text-xs font-medium" style={{ color: '#d97706' }}>Recomendación</span>
            </div>
            <p className="text-xs leading-relaxed" style={{ color: theme.text }}>
              {consejoAmigable}
            </p>
          </div>
        )}

        {/* Tiempo estimado - neutro */}
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-lg animate-fade-in-up"
          style={{
            backgroundColor: theme.card,
            border: `1px solid ${theme.border}`,
            animationDelay: '200ms'
          }}
        >
          <Clock className="h-3.5 w-3.5" style={{ color: theme.textSecondary }} />
          <span className="text-xs" style={{ color: theme.textSecondary }}>
            Tiempo estimado: <span style={{ color: theme.text, fontWeight: 500 }}>2-3 min</span>
          </span>
        </div>

        {/* Asistente Municipal - color azul para IA */}
        {(contextualAiResponse || contextualAiLoading) && (
          <div
            className="p-3 rounded-lg animate-fade-in-up"
            style={{
              backgroundColor: '#3b82f612',
              border: '1px solid #3b82f630',
              animationDelay: '250ms'
            }}
          >
            <div className="flex items-center gap-2 mb-2">
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center"
                style={{ backgroundColor: '#3b82f620' }}
              >
                <Bot className="h-3.5 w-3.5" style={{ color: '#3b82f6' }} />
              </div>
              <span className="text-xs font-medium" style={{ color: '#2563eb' }}>Asistente Municipal</span>
              {contextualAiLoading && (
                <Loader2 className="h-3 w-3 animate-spin" style={{ color: '#3b82f6' }} />
              )}
            </div>
            {contextualAiResponse && !contextualAiLoading && (
              <p className="text-xs leading-relaxed" style={{ color: theme.text }}>
                {contextualAiResponse}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );

  // Nombre del municipio para el header
  const nombreMunicipio = municipioActual?.nombre?.replace('Municipalidad de ', '')
    || localStorage.getItem('municipio_nombre')?.replace('Municipalidad de ', '')
    || 'Mi Municipio';

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: theme.background }}>
      {/* Header sticky con municipio */}
      <StickyPageHeader
        icon={<Building2 className="h-5 w-5" />}
        title={`${nombreMunicipio} - Nuevo Reclamo`}
        backLink={user ? '/gestion/reclamos' : '/bienvenido'}
        actions={
          showOnlyRegister ? (
            <button
              onClick={() => navigate('/login')}
              className="text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
              style={{ color: theme.primary, backgroundColor: `${theme.primary}15` }}
            >
              Iniciar Sesión
            </button>
          ) : undefined
        }
      />

      <div className="flex-1 max-w-5xl mx-auto px-4 sm:px-6 pt-2 pb-4 w-full">
        <WizardModal
          open={true}
          onClose={() => navigate(-1)}
          title=""
          steps={steps}
          currentStep={currentStep}
          onStepChange={handleStepChange}
          onComplete={handleSubmit}
          loading={submitting || registering}
          completeLabel="Enviar Reclamo"
          aiPanel={wizardAIPanel}
          embedded={true}
        />
      </div>

      {/* Modal de reclamos similares */}
      {showSimilaresAlert && (
        <ReclamosSimilares
          categoriaId={formData.categoria_id ? Number(formData.categoria_id) : null}
          latitud={formData.latitud}
          longitud={formData.longitud}
          onClose={() => {
            setShowSimilaresAlert(false);
            setIgnorarSimilares(false);
          }}
          onContinueAnyway={() => {
            setShowSimilaresAlert(false);
            setIgnorarSimilares(true);
            // Llamar a handleSubmit nuevamente ahora que ignorarSimilares es true
            setTimeout(() => handleSubmit(), 100);
          }}
          onViewSimilar={(id) => {
            // Navegar al detalle del reclamo similar
            const isMobile = window.location.pathname.startsWith('/app');
            const route = isMobile ? `/app/reclamo/${id}` : `/gestion/reclamos/${id}`;
            window.open(route, '_blank');
          }}
        />
      )}
    </div>
  );
}
