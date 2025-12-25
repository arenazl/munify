import { useEffect, useState, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { MapPin, Calendar, Tag, UserPlus, Play, CheckCircle, XCircle, Clock, Eye, FileText, User, Users, FileCheck, FolderOpen, AlertTriangle, Zap, Droplets, TreeDeciduous, Trash2, Building2, X, Camera, Sparkles, Send, Lightbulb, CheckCircle2, Car, Construction, Bug, Leaf, Signpost, Recycle, Brush, Phone, Mail, Bell, BellOff, MessageCircle, Loader2, Wrench, Timer, TrendingUp, Search, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { reclamosApi, empleadosApi, categoriasApi, zonasApi, usersApi } from '../lib/api';
import { useTheme } from '../contexts/ThemeContext';
import { ABMPage, ABMTextarea, ABMField, ABMFieldGrid, ABMInfoPanel, ABMCollapsible, ABMTable } from '../components/ui/ABMPage';
import { Sheet } from '../components/ui/Sheet';
import { WizardModal } from '../components/ui/WizardModal';
import { MapPicker } from '../components/ui/MapPicker';
import { ModernSelect } from '../components/ui/ModernSelect';
import type { Reclamo, Empleado, EstadoReclamo, HistorialReclamo, Categoria, Zona, User as UserType } from '../types';

const estadoColors: Record<EstadoReclamo, { bg: string; text: string }> = {
  nuevo: { bg: '#6366f1', text: '#ffffff' },
  asignado: { bg: '#3b82f6', text: '#ffffff' },
  en_proceso: { bg: '#f59e0b', text: '#ffffff' },
  resuelto: { bg: '#10b981', text: '#ffffff' },
  rechazado: { bg: '#ef4444', text: '#ffffff' },
};

const estadoLabels: Record<EstadoReclamo, string> = {
  nuevo: 'Nuevo',
  asignado: 'Asignado',
  en_proceso: 'En Proceso',
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

  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8002/api';
  const baseUrl = apiUrl.replace('/api', '');
  return `${baseUrl}/static/images/categorias/${safeName}.jpeg`;
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
  'default': <AlertTriangle className="h-5 w-5" />,
};

const categoryColors: Record<string, string> = {
  'alumbrado': '#f59e0b',
  'bache': '#ef4444',
  'calle': '#ef4444',
  'agua': '#3b82f6',
  'cloaca': '#0ea5e9',
  'desague': '#0ea5e9',
  'arbolado': '#22c55e',
  'espacio': '#10b981',
  'verde': '#10b981',
  'basura': '#6b7280',
  'residuo': '#78716c',
  'recolec': '#78716c',
  'limpieza': '#14b8a6',
  'transito': '#8b5cf6',
  'señal': '#f97316',
  'plaga': '#dc2626',
  'edificio': '#a855f7',
  'default': '#6366f1',
};

function getCategoryIcon(nombre: string): React.ReactNode {
  const key = nombre.toLowerCase();
  for (const [k, icon] of Object.entries(categoryIcons)) {
    if (key.includes(k)) return icon;
  }
  return categoryIcons.default;
}

function getCategoryColor(nombre: string): string {
  const key = nombre.toLowerCase();
  for (const [k, color] of Object.entries(categoryColors)) {
    if (key.includes(k)) return color;
  }
  return categoryColors.default;
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

export default function Reclamos() {
  const { theme } = useTheme();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [reclamos, setReclamos] = useState<Reclamo[]>([]);
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [zonas, setZonas] = useState<Zona[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<string>('');
  const [filtroCategoria, setFiltroCategoria] = useState<number | null>(null);
  // Estado para animación staggered - iniciar como completado para evitar parpadeo
  const [visibleCards] = useState<Set<number>>(new Set());
  const [animationDone] = useState(true);

  // Wizard states
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);

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
  const [empleadoSeleccionado, setEmpleadoSeleccionado] = useState<string>('');
  const [comentarioAsignacion, setComentarioAsignacion] = useState('');
  const [fechaProgramada, setFechaProgramada] = useState('');
  const [horaInicio, setHoraInicio] = useState('09:00');
  const [duracion, setDuracion] = useState('1');  // en horas (string para el select)
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

  // Búsqueda de usuarios para datos de contacto
  const [userSearchResults, setUserSearchResults] = useState<UserType[]>([]);
  const [allUsers, setAllUsers] = useState<UserType[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [showUserResults, setShowUserResults] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserType | null>(null);

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
  const [motivoRechazo, setMotivoRechazo] = useState('');
  const [descripcionRechazo, setDescripcionRechazo] = useState('');

  // AI Chat states
  const [aiQuestion, setAiQuestion] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  // AI Panel debounce state - mostrar sugerencias 3 segundos después de escribir descripción
  const [showAISuggestions, setShowAISuggestions] = useState(false);
  const [aiSuggestionsLoading, setAISuggestionsLoading] = useState(false);
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

  useEffect(() => {
    fetchData();
    fetchMunicipioData();
  }, [filtroEstado]);

  // Detectar parámetro ?crear=ID para abrir wizard desde chat
  useEffect(() => {
    const crearCategoriaId = searchParams.get('crear');
    if (crearCategoriaId && categorias.length > 0) {
      const categoriaExiste = categorias.find(c => c.id === parseInt(crearCategoriaId));
      if (categoriaExiste) {
        setFormData(prev => ({ ...prev, categoria_id: crearCategoriaId }));
        setWizardStep(1); // Saltar al paso de detalles
        setWizardOpen(true);
        setSearchParams({}); // Limpiar URL
      }
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
      const apiUrl = import.meta.env.VITE_API_URL;
      const municipioId = localStorage.getItem('municipio_id');
      const url = municipioId
        ? `${apiUrl}/configuracion/publica/municipio?municipio_id=${municipioId}`
        : `${apiUrl}/configuracion/publica/municipio`;
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
    // Solo aplicar debounce si estamos en el paso de detalles (paso 2)
    if (wizardStep !== 2) {
      setShowAISuggestions(false);
      setAISuggestionsLoading(false);
      return;
    }

    // Si no hay descripción, ocultar sugerencias
    if (!formData.descripcion.trim()) {
      setShowAISuggestions(false);
      setAISuggestionsLoading(false);
      if (aiDebounceRef.current) {
        clearTimeout(aiDebounceRef.current);
      }
      return;
    }

    // Limpiar timeout anterior
    if (aiDebounceRef.current) {
      clearTimeout(aiDebounceRef.current);
    }

    // Mostrar loading mientras espera
    setShowAISuggestions(false);
    setAISuggestionsLoading(true);

    // Esperar 3 segundos antes de mostrar las sugerencias
    aiDebounceRef.current = setTimeout(() => {
      setAISuggestionsLoading(false);
      setShowAISuggestions(true);
    }, 3000);

    return () => {
      if (aiDebounceRef.current) {
        clearTimeout(aiDebounceRef.current);
      }
    };
  }, [formData.descripcion, wizardStep]);

  const askAI = async () => {
    if (!aiQuestion.trim() || !selectedCategoria) return;

    setAiLoading(true);
    try {
      const apiUrl = import.meta.env.VITE_API_URL;
      const response = await fetch(`${apiUrl}/chat/categoria`, {
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

  // Address autocomplete with Nominatim (OpenStreetMap - free)
  const searchAddress = async (query: string) => {
    if (query.length < 3) {
      setAddressSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    setSearchingAddress(true);
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}, Buenos Aires, Argentina&limit=5&addressdetails=1`,
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

  const fetchData = async () => {
    try {
      const [reclamosRes, empleadosRes, categoriasRes, zonasRes] = await Promise.all([
        reclamosApi.getAll(filtroEstado ? { estado: filtroEstado } : {}),
        empleadosApi.getAll(true),
        categoriasApi.getAll(true),
        zonasApi.getAll(true),
      ]);
      setReclamos(reclamosRes.data);
      setEmpleados(empleadosRes.data);
      setCategorias(categoriasRes.data);
      setZonas(zonasRes.data);
    } catch (error) {
      toast.error('Error al cargar datos');
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  // Cargar usuarios para búsqueda
  const fetchUsers = async () => {
    setLoadingUsers(true);
    try {
      const response = await usersApi.getAll();
      // Filtrar solo vecinos activos
      const vecinos = response.data.filter((u: UserType) => u.rol === 'vecino' && u.activo);
      setAllUsers(vecinos);
    } catch (error) {
      console.error('Error cargando usuarios:', error);
    } finally {
      setLoadingUsers(false);
    }
  };

  // Buscar usuarios por nombre/apellido
  const handleUserSearch = (query: string) => {
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
        `${u.nombre} ${u.apellido}`.toLowerCase().includes(queryLower)
      ).slice(0, 10);
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
    setWizardOpen(true);
    // Cargar usuarios si no están cargados
    if (allUsers.length === 0) {
      fetchUsers();
    }
  };

  const closeWizard = () => {
    setWizardOpen(false);
    setWizardStep(0);
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
    setEmpleadoSeleccionado(reclamo.empleado_asignado?.id?.toString() || '');
    setComentarioAsignacion('');
    setResolucion('');
    setMotivoRechazo('');
    setDescripcionRechazo('');
    setSugerencias([]);
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
        const res = await reclamosApi.getSugerenciaAsignacion(reclamo.id);
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
    setEmpleadoSeleccionado('');
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
      fetchData();
      closeWizard();
    } catch (error) {
      toast.error('Error al crear el reclamo');
      console.error('Error:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleAsignar = async () => {
    if (!selectedReclamo || !empleadoSeleccionado) return;
    setSaving(true);
    try {
      await reclamosApi.asignar(selectedReclamo.id, {
        empleado_id: Number(empleadoSeleccionado),
        fecha_programada: fechaProgramada || undefined,
        hora_inicio: horaInicio || undefined,
        hora_fin: horaFin || undefined,
        comentario: comentarioAsignacion || undefined
      });
      toast.success('Reclamo asignado correctamente');
      fetchData();
      closeSheet();
    } catch (error) {
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
    setEmpleadoSeleccionado(empleadoId);
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
    setSaving(true);
    try {
      await reclamosApi.iniciar(selectedReclamo.id);
      toast.success('Trabajo iniciado');
      fetchData();
      closeSheet();
    } catch (error) {
      toast.error('Error al iniciar trabajo');
      console.error('Error:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleResolver = async () => {
    if (!selectedReclamo || !resolucion) return;
    setSaving(true);
    try {
      await reclamosApi.resolver(selectedReclamo.id, { resolucion });
      toast.success('Reclamo resuelto');
      fetchData();
      closeSheet();
    } catch (error) {
      toast.error('Error al resolver reclamo');
      console.error('Error:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleRechazar = async () => {
    if (!selectedReclamo || !motivoRechazo) return;
    setSaving(true);
    try {
      await reclamosApi.rechazar(selectedReclamo.id, {
        motivo: motivoRechazo,
        descripcion: descripcionRechazo || undefined
      });
      toast.success('Reclamo rechazado');
      fetchData();
      closeSheet();
    } catch (error) {
      toast.error('Error al rechazar reclamo');
      console.error('Error:', error);
    } finally {
      setSaving(false);
    }
  };

  const filteredReclamos = reclamos.filter(r => {
    // Filtro por texto de búsqueda
    const matchSearch = search === '' ||
      r.titulo.toLowerCase().includes(search.toLowerCase()) ||
      r.descripcion.toLowerCase().includes(search.toLowerCase()) ||
      r.direccion.toLowerCase().includes(search.toLowerCase()) ||
      r.categoria.nombre.toLowerCase().includes(search.toLowerCase());

    // Filtro por categoría
    const matchCategoria = filtroCategoria === null || r.categoria.id === filtroCategoria;

    return matchSearch && matchCategoria;
  });

  const selectedCategoria = categorias.find(c => c.id === Number(formData.categoria_id));
  const selectedZona = zonas.find(z => z.id === Number(formData.zona_id));

  // Wizard Step 1: Categoría
  const wizardStep1 = (
    <div className="space-y-3">
      <p className="text-sm" style={{ color: theme.textSecondary }}>
        Selecciona el tipo de problema que deseas reportar:
      </p>
      <div className="grid grid-cols-4 sm:grid-cols-5 lg:grid-cols-6 gap-3">
        {categorias.map((cat) => {
          const isSelected = formData.categoria_id === String(cat.id);
          const catColor = cat.color || getCategoryColor(cat.nombre);
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => { setFormData({ ...formData, categoria_id: String(cat.id) }); setTimeout(() => setWizardStep(1), 300); }}
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
          <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: selectedCategoria ? getCategoryColor(selectedCategoria.nombre) : theme.border, color: 'white' }}>
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
          <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: '#25D366', color: 'white' }}>
            <Phone className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <span className="text-xs" style={{ color: theme.textSecondary }}>Contacto</span>
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
          </div>
          {formData.recibir_notificaciones && (
            <div className="flex items-center gap-1 px-2 py-1 rounded-full text-xs" style={{ backgroundColor: '#25D36620', color: '#25D366' }}>
              <Bell className="h-3 w-3" />
              Notificaciones
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // Wizard Step 5: Datos de contacto
  const wizardStepContacto = (
    <div className="space-y-4">
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
            placeholder="Buscar o escribir nombre..."
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
            Escribí para buscar un vecino o completar manualmente
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
                    {user.telefono && <span>{user.telefono}</span>}
                    {user.telefono && user.email && <span> • </span>}
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

        {/* Paso 0: Categoría */}
        {wizardStep === 0 && selectedCategoria ? (
          <div className="space-y-3">
            <div className="p-3 rounded-lg" style={{ backgroundColor: `${getCategoryColor(selectedCategoria.nombre)}15`, border: `1px solid ${getCategoryColor(selectedCategoria.nombre)}30` }}>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ backgroundColor: getCategoryColor(selectedCategoria.nombre), color: 'white' }}>
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
                    <span style={{ color: getCategoryColor(selectedCategoria.nombre) }}>•</span>
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
        ) : wizardStep === 0 ? (
          <div className="p-3 rounded-lg text-sm" style={{ backgroundColor: theme.card }}>
            <div className="flex items-start gap-2">
              <Lightbulb className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: theme.primary }} />
              <p style={{ color: theme.textSecondary }}>
                Selecciona la categoría que mejor describa tu problema. Esto nos ayuda a asignarlo al equipo correcto.
              </p>
            </div>
          </div>
        ) : null}

        {/* Paso 1: Ubicación */}
        {wizardStep === 1 && (
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

        {/* Paso 2: Detalles - Panel con sugerencias basadas en categoría */}
        {wizardStep === 2 && selectedCategoria && (
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

            {/* Sugerencias mostradas después del debounce */}
            {showAISuggestions && formData.descripcion.trim() && (
              <>
                <div className="p-3 rounded-lg" style={{ backgroundColor: `${getCategoryColor(selectedCategoria.nombre)}10`, border: `1px solid ${getCategoryColor(selectedCategoria.nombre)}30` }}>
                  <div className="flex items-center gap-2 mb-2">
                    <Wrench className="h-4 w-4" style={{ color: getCategoryColor(selectedCategoria.nombre) }} />
                    <span className="font-medium text-sm" style={{ color: theme.text }}>Posibles soluciones</span>
                  </div>
                  <ul className="space-y-1 text-xs">
                    {selectedCategoria.nombre.toLowerCase().includes('alumbrado') && (
                      <>
                        <li style={{ color: theme.textSecondary }}>• Revisión de conexiones eléctricas</li>
                        <li style={{ color: theme.textSecondary }}>• Cambio de lámpara o luminaria</li>
                        <li style={{ color: theme.textSecondary }}>• Reparación de poste o brazo</li>
                      </>
                    )}
                    {(selectedCategoria.nombre.toLowerCase().includes('bache') || selectedCategoria.nombre.toLowerCase().includes('calle')) && (
                      <>
                        <li style={{ color: theme.textSecondary }}>• Bacheo con mezcla asfáltica</li>
                        <li style={{ color: theme.textSecondary }}>• Reparación de calzada</li>
                        <li style={{ color: theme.textSecondary }}>• Nivelación de terreno</li>
                      </>
                    )}
                    {(selectedCategoria.nombre.toLowerCase().includes('agua') || selectedCategoria.nombre.toLowerCase().includes('cloaca')) && (
                      <>
                        <li style={{ color: theme.textSecondary }}>• Reparación de cañerías</li>
                        <li style={{ color: theme.textSecondary }}>• Destape de conductos</li>
                        <li style={{ color: theme.textSecondary }}>• Cambio de válvulas</li>
                      </>
                    )}
                    {selectedCategoria.nombre.toLowerCase().includes('arbol') && (
                      <>
                        <li style={{ color: theme.textSecondary }}>• Poda de ramas</li>
                        <li style={{ color: theme.textSecondary }}>• Extracción de árbol seco</li>
                        <li style={{ color: theme.textSecondary }}>• Tratamiento fitosanitario</li>
                      </>
                    )}
                    {selectedCategoria.nombre.toLowerCase().includes('basura') && (
                      <>
                        <li style={{ color: theme.textSecondary }}>• Recolección extraordinaria</li>
                        <li style={{ color: theme.textSecondary }}>• Limpieza de microbasural</li>
                        <li style={{ color: theme.textSecondary }}>• Instalación de contenedor</li>
                      </>
                    )}
                  </ul>
                </div>

                <div className="p-3 rounded-lg" style={{ backgroundColor: theme.card }}>
                  <div className="flex items-center gap-2 mb-2">
                    <Timer className="h-4 w-4" style={{ color: '#f59e0b' }} />
                    <span className="font-medium text-sm" style={{ color: theme.text }}>Tiempo estimado</span>
                  </div>
                  <p className="text-xs" style={{ color: theme.textSecondary }}>
                    {selectedCategoria.nombre.toLowerCase().includes('alumbrado') && '24-72 horas para reparación'}
                    {(selectedCategoria.nombre.toLowerCase().includes('bache') || selectedCategoria.nombre.toLowerCase().includes('calle')) && '3-7 días según complejidad'}
                    {(selectedCategoria.nombre.toLowerCase().includes('agua') || selectedCategoria.nombre.toLowerCase().includes('cloaca')) && '24-48 horas (urgente)'}
                    {selectedCategoria.nombre.toLowerCase().includes('arbol') && '5-15 días según riesgo'}
                    {selectedCategoria.nombre.toLowerCase().includes('basura') && '24-72 horas'}
                    {!['alumbrado', 'bache', 'calle', 'agua', 'cloaca', 'arbol', 'basura'].some(k => selectedCategoria.nombre.toLowerCase().includes(k)) && '3-10 días según disponibilidad'}
                  </p>
                </div>

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

        {/* Paso 3: Contacto */}
        {wizardStep === 3 && (
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

        {/* Paso 4: Resumen */}
        {wizardStep === 4 && (
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
    { id: 'categoria', title: 'Categoría', description: 'Selecciona el tipo de problema', icon: <FolderOpen className="h-5 w-5" />, content: wizardStep1, isValid: !!formData.categoria_id },
    { id: 'ubicacion', title: 'Ubicación', description: 'Indica dónde está el problema', icon: <MapPin className="h-5 w-5" />, content: wizardStep2, isValid: !!formData.direccion },
    { id: 'detalles', title: 'Detalles', description: 'Describe el problema', icon: <FileText className="h-5 w-5" />, content: wizardStep3, isValid: !!formData.titulo && !!formData.descripcion },
    { id: 'contacto', title: 'Contacto', description: 'Tus datos para seguimiento', icon: <Phone className="h-5 w-5" />, content: wizardStepContacto, isValid: !!formData.nombre_contacto && !!formData.telefono_contacto },
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
      sortValue: (r: Reclamo) => r.titulo,
      render: (r: Reclamo) => (
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: getCategoryColor(r.categoria.nombre) + '20', color: getCategoryColor(r.categoria.nombre) }}
          >
            {getCategoryIcon(r.categoria.nombre)}
          </div>
          <div className="min-w-0">
            <span className="font-medium block truncate" style={{ color: theme.text }}>{r.titulo}</span>
            <span
              className="text-xs font-bold"
              style={{ color: getCategoryColor(r.categoria.nombre) }}
            >
              {r.categoria.nombre}
            </span>
          </div>
        </div>
      ),
    },
    {
      key: 'direccion',
      header: 'Ubicación',
      sortValue: (r: Reclamo) => r.direccion,
      render: (r: Reclamo) => (
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 flex-shrink-0" style={{ color: theme.textSecondary }} />
          <span className="truncate" style={{ color: theme.textSecondary }}>{r.direccion}</span>
        </div>
      ),
    },
    {
      key: 'estado',
      header: 'Estado',
      sortValue: (r: Reclamo) => r.estado,
      render: (r: Reclamo) => (
        <span
          className="px-3 py-1 text-xs font-semibold rounded-full"
          style={{
            backgroundColor: estadoColors[r.estado].bg,
            color: estadoColors[r.estado].text
          }}
        >
          {estadoLabels[r.estado]}
        </span>
      ),
    },
    {
      key: 'empleado',
      header: 'Empleado',
      sortValue: (r: Reclamo) => r.empleado_asignado?.nombre || '',
      render: (r: Reclamo) => (
        <span style={{ color: r.empleado_asignado ? theme.primary : theme.textSecondary }}>
          {r.empleado_asignado?.nombre || '-'}
        </span>
      ),
    },
    {
      key: 'fecha',
      header: 'Fecha',
      sortValue: (r: Reclamo) => new Date(r.created_at).getTime(),
      render: (r: Reclamo) => (
        <span className="text-xs" style={{ color: theme.textSecondary }}>
          {new Date(r.created_at).toLocaleDateString()}
        </span>
      ),
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
        <ABMField
          label="Creado por"
          value={`${selectedReclamo.creador.nombre} ${selectedReclamo.creador.apellido} · ${selectedReclamo.creador.email}`}
          icon={<User className="h-4 w-4" style={{ color: theme.textSecondary }} />}
          fullWidth
        />

        {/* Empleado asignado */}
        {selectedReclamo.empleado_asignado && (
          <ABMInfoPanel
            title="Empleado Asignado"
            icon={<Users className="h-4 w-4" />}
            variant="info"
          >
            <ABMField
              label="Nombre"
              value={`${selectedReclamo.empleado_asignado.nombre || ''}${selectedReclamo.empleado_asignado.apellido ? ' ' + selectedReclamo.empleado_asignado.apellido : ''}`.trim() || 'Sin nombre'}
            />
            {selectedReclamo.empleado_asignado.especialidad && (
              <ABMField
                label="Especialidad"
                value={selectedReclamo.empleado_asignado.especialidad}
              />
            )}
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
            title="Asignar Empleado"
            icon={<UserPlus className="h-4 w-4" />}
            defaultOpen={true}
          >
            <div className="space-y-3">
              {/* Panel de sugerencias IA */}
              {loadingSugerencias ? (
                <div
                  className="rounded-xl p-4 flex items-center gap-3"
                  style={{ backgroundColor: `${theme.primary}10`, border: `1px solid ${theme.primary}30` }}
                >
                  <div className="h-5 w-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: theme.primary, borderTopColor: 'transparent' }} />
                  <span className="text-sm" style={{ color: theme.textSecondary }}>Analizando mejor empleado...</span>
                </div>
              ) : sugerencias.length > 0 && (
                <div
                  className="rounded-xl p-4 space-y-3"
                  style={{ backgroundColor: `${theme.primary}08`, border: `1px solid ${theme.primary}20` }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Lightbulb className="h-4 w-4" style={{ color: theme.primary }} />
                    <span className="text-sm font-medium" style={{ color: theme.text }}>
                      Sugerencias de asignación
                    </span>
                  </div>
                  <div className="space-y-2">
                    {sugerencias.slice(0, 3).map((sug, idx) => (
                      <button
                        key={sug.empleado_id}
                        onClick={() => handleEmpleadoChange(String(sug.empleado_id))}
                        className={`w-full p-3 rounded-lg text-left transition-all hover:scale-[1.01] ${empleadoSeleccionado === String(sug.empleado_id) ? 'ring-2' : ''}`}
                        style={{
                          backgroundColor: empleadoSeleccionado === String(sug.empleado_id) ? `${theme.primary}20` : theme.card,
                          border: `1px solid ${empleadoSeleccionado === String(sug.empleado_id) ? theme.primary : theme.border}`,
                          ['--tw-ring-color' as string]: theme.primary,
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div
                              className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"
                              style={{
                                backgroundColor: idx === 0 ? '#10b981' : idx === 1 ? '#3b82f6' : '#6b7280',
                                color: '#ffffff'
                              }}
                            >
                              {idx + 1}
                            </div>
                            <div>
                              <span className="font-medium block" style={{ color: theme.text }}>
                                {sug.empleado_nombre}
                              </span>
                              <span className="text-xs" style={{ color: theme.textSecondary }}>
                                {sug.razon_principal}
                              </span>
                            </div>
                          </div>
                          <div className="text-right">
                            <div
                              className="text-lg font-bold"
                              style={{ color: sug.score_porcentaje >= 70 ? '#10b981' : sug.score_porcentaje >= 50 ? '#f59e0b' : theme.textSecondary }}
                            >
                              {sug.score_porcentaje}%
                            </div>
                            <div className="text-xs" style={{ color: theme.textSecondary }}>
                              {sug.detalles.carga_trabajo} pendientes
                            </div>
                          </div>
                        </div>
                        {/* Barra de progreso */}
                        <div className="mt-2 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: theme.border }}>
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${sug.score_porcentaje}%`,
                              backgroundColor: sug.score_porcentaje >= 70 ? '#10b981' : sug.score_porcentaje >= 50 ? '#f59e0b' : '#6b7280'
                            }}
                          />
                        </div>
                      </button>
                    ))}
                  </div>
                  {sugerencias.length === 0 && (
                    <p className="text-xs text-center py-2" style={{ color: theme.textSecondary }}>
                      No hay empleados disponibles para esta categoría
                    </p>
                  )}
                </div>
              )}

              {/* Selector de empleado - muestra todos pero indica especialidad */}
              <ModernSelect
                label="Empleado"
                value={empleadoSeleccionado}
                onChange={handleEmpleadoChange}
                placeholder="Seleccionar empleado..."
                searchable={empleados.length > 5}
                options={empleados.map(emp => {
                  const tieneEspecialidad = emp.categorias?.some(cat => cat.id === selectedReclamo.categoria.id);
                  return {
                    value: String(emp.id),
                    label: emp.apellido ? `${emp.nombre} ${emp.apellido}` : emp.nombre,
                    description: tieneEspecialidad
                      ? `✓ Especialista en ${selectedReclamo.categoria.nombre}`
                      : emp.categoria_principal?.nombre || emp.especialidad || 'Sin especialidad asignada',
                    icon: <User className="h-4 w-4" />,
                    color: tieneEspecialidad ? '#10b981' : (emp.categoria_principal?.color || '#6b7280'),
                  };
                })}
              />
              {empleadoSeleccionado && !empleados.find(c => c.id === Number(empleadoSeleccionado))?.categorias?.some(cat => cat.id === selectedReclamo.categoria.id) && (
                <p className="text-xs mt-1 flex items-center gap-1" style={{ color: '#f59e0b' }}>
                  <AlertTriangle className="h-3 w-3" />
                  Este empleado no tiene especialidad en {selectedReclamo.categoria.nombre}
                </p>
              )}

              {/* Programación - Solo se muestra cuando hay empleado seleccionado */}
              {empleadoSeleccionado && (
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
                            if (empleadoSeleccionado && e.target.value) {
                              fetchDisponibilidad(empleadoSeleccionado, e.target.value, true);
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
                label="Comentario"
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
            title="Marcar como Resuelto"
            icon={<CheckCircle className="h-4 w-4" />}
            defaultOpen={true}
            variant="success"
          >
            <div className="space-y-3">
              <ABMTextarea
                label=""
                value={resolucion}
                onChange={(e) => setResolucion(e.target.value)}
                placeholder="Describe cómo se resolvió el problema"
                rows={3}
                required
              />
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

        {/* Historial */}
        <ABMCollapsible
          title={`Historial (${historial.length})`}
          icon={<Clock className="h-4 w-4" />}
          defaultOpen={false}
        >
          {loadingHistorial ? (
            <div className="text-center py-4">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 mx-auto" style={{ borderColor: theme.primary }}></div>
            </div>
          ) : historial.length > 0 ? (
            <div className="space-y-3">
              {historial.map((h) => (
                <div key={h.id} className="flex items-start gap-3 text-sm">
                  <div className="w-2 h-2 mt-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: theme.primary }}></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{h.usuario.nombre} {h.usuario.apellido}</span>
                      <span style={{ color: theme.textSecondary }}>{h.accion}</span>
                    </div>
                    {h.comentario && (
                      <p className="mt-1 text-sm" style={{ color: theme.textSecondary }}>{h.comentario}</p>
                    )}
                    <p className="text-xs mt-1" style={{ color: theme.textSecondary }}>
                      {new Date(h.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm" style={{ color: theme.textSecondary }}>Sin historial</p>
          )}
        </ABMCollapsible>
      </div>
    );
  };

  // Renderizar sticky header para el Sheet (estado + categoría)
  const renderSheetStickyHeader = () => {
    if (!selectedReclamo) return null;

    return (
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {/* Estado con badge */}
          <span
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-full"
            style={{
              backgroundColor: estadoColors[selectedReclamo.estado].bg,
              color: estadoColors[selectedReclamo.estado].text
            }}
          >
            {getEstadoIcon(selectedReclamo.estado)}
            {estadoLabels[selectedReclamo.estado]}
          </span>
          {/* Categoría */}
          <span
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg"
            style={{
              backgroundColor: `${theme.primary}15`,
              color: theme.primary,
              border: `1px solid ${theme.primary}30`
            }}
          >
            <Tag className="h-3.5 w-3.5" />
            {selectedReclamo.categoria.nombre}
          </span>
        </div>
        {/* Fecha */}
        <span className="text-xs font-medium whitespace-nowrap" style={{ color: theme.textSecondary }}>
          {new Date(selectedReclamo.created_at).toLocaleString()}
        </span>
      </div>
    );
  };

  // Renderizar footer de acciones para el Sheet
  const renderSheetFooter = () => {
    if (!selectedReclamo) return null;

    const canAsignar = selectedReclamo.estado === 'nuevo';
    const canIniciar = selectedReclamo.estado === 'asignado';
    const canResolver = selectedReclamo.estado === 'en_proceso';

    return (
      <div className="space-y-2">
        {/* Botón Ver Historial Completo */}
        <button
          onClick={() => {
            closeSheet();
            navigate(`/reclamos/${selectedReclamo.id}`);
          }}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl font-medium transition-all duration-200 hover:scale-105 active:scale-95"
          style={{ backgroundColor: theme.backgroundSecondary, color: theme.text, border: `1px solid ${theme.border}` }}
        >
          <ExternalLink className="h-4 w-4" />
          Ver Historial Completo
        </button>

        <div className="flex gap-2">
        {/* Botón Asignar - para estado nuevo */}
        {canAsignar && (
          <>
            <button
              onClick={handleAsignar}
              disabled={saving || !empleadoSeleccionado || !!(disponibilidad && horaFin > disponibilidad.hora_fin_jornada.slice(0, 5))}
              className="flex-1 px-4 py-2.5 rounded-xl font-medium transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100 disabled:cursor-not-allowed"
              style={{ backgroundColor: theme.primary, color: '#ffffff' }}
            >
              {saving ? 'Asignando...' : 'Asignar'}
            </button>
            <button
              onClick={() => setMotivoRechazo('otro')}
              className="px-4 py-2.5 rounded-xl font-medium transition-all duration-200 hover:scale-105 active:scale-95"
              style={{ border: '1px solid #ef4444', color: '#ef4444' }}
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
            className="flex-1 px-4 py-2.5 rounded-xl font-medium transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100"
            style={{ backgroundColor: '#eab308', color: '#ffffff' }}
          >
            {saving ? 'Iniciando...' : 'Iniciar Trabajo'}
          </button>
        )}

        {/* Botón Resolver - para estado en_proceso */}
        {canResolver && (
          <button
            onClick={handleResolver}
            disabled={saving || !resolucion}
            className="flex-1 px-4 py-2.5 rounded-xl font-medium transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100 disabled:cursor-not-allowed"
            style={{ backgroundColor: '#16a34a', color: '#ffffff' }}
          >
            {saving ? 'Resolviendo...' : 'Marcar Resuelto'}
          </button>
        )}

        {/* Estados finales - solo info */}
        {(selectedReclamo.estado === 'resuelto' || selectedReclamo.estado === 'rechazado') && (
          <div
            className="flex-1 px-4 py-2.5 rounded-xl font-medium text-center"
            style={{
              backgroundColor: theme.card,
              color: theme.textSecondary,
              border: `1px solid ${theme.border}`
            }}
          >
            {selectedReclamo.estado === 'resuelto' ? '✓ Resuelto' : '✗ Rechazado'}
          </div>
        )}
        </div>
      </div>
    );
  };

  return (
    <>
      <ABMPage
        title="Reclamos"
        buttonLabel="Nuevo Reclamo"
        onAdd={openWizard}
        searchPlaceholder="Buscar reclamos..."
        searchValue={search}
        onSearchChange={setSearch}
        loading={loading}
        isEmpty={filteredReclamos.length === 0}
        emptyMessage="No se encontraron reclamos"
        sheetOpen={false}
        sheetTitle=""
        sheetDescription=""
        onSheetClose={() => {}}
        extraFilters={
          <div className="flex items-center gap-1.5 w-full">
            {/* Botón Todos */}
            <button
              onClick={() => setFiltroEstado('')}
              title="Todos"
              className="p-2 rounded-lg transition-all duration-200 flex-1 flex items-center justify-center"
              style={{
                background: filtroEstado === ''
                  ? `linear-gradient(135deg, ${theme.primary} 0%, ${theme.primary}80 100%)`
                  : theme.card,
                border: `1px solid ${filtroEstado === '' ? theme.primary : theme.border}`,
                color: filtroEstado === '' ? '#ffffff' : theme.textSecondary,
                opacity: filtroEstado === '' ? 1 : 0.6,
              }}
            >
              <Eye className="h-4 w-4" />
            </button>
            {/* Botón Nuevos */}
            <button
              onClick={() => setFiltroEstado(filtroEstado === 'nuevo' ? '' : 'nuevo')}
              title="Nuevos"
              className="p-2 rounded-lg transition-all duration-200 flex-1 flex items-center justify-center"
              style={{
                background: filtroEstado === 'nuevo'
                  ? `linear-gradient(135deg, ${estadoColors.nuevo.bg} 0%, ${estadoColors.nuevo.bg}80 100%)`
                  : theme.card,
                border: `1px solid ${filtroEstado === 'nuevo' ? estadoColors.nuevo.bg : theme.border}`,
                color: filtroEstado === 'nuevo' ? '#ffffff' : theme.textSecondary,
                opacity: filtroEstado === 'nuevo' ? 1 : 0.6,
              }}
            >
              <Sparkles className="h-4 w-4" />
            </button>
            {/* Botón Asignados */}
            <button
              onClick={() => setFiltroEstado(filtroEstado === 'asignado' ? '' : 'asignado')}
              title="Asignados"
              className="p-2 rounded-lg transition-all duration-200 flex-1 flex items-center justify-center"
              style={{
                background: filtroEstado === 'asignado'
                  ? 'linear-gradient(135deg, rgb(74 79 160 / 0%) 0%, rgba(59, 130, 246, 0.5) 100%)'
                  : theme.card,
                border: `1px solid ${filtroEstado === 'asignado' ? estadoColors.asignado.bg : theme.border}`,
                color: filtroEstado === 'asignado' ? '#ffffff' : theme.textSecondary,
                opacity: filtroEstado === 'asignado' ? 1 : 0.6,
              }}
            >
              <UserPlus className="h-4 w-4" />
            </button>
            {/* Botón En Proceso */}
            <button
              onClick={() => setFiltroEstado(filtroEstado === 'en_proceso' ? '' : 'en_proceso')}
              title="En Proceso"
              className="p-2 rounded-lg transition-all duration-200 flex-1 flex items-center justify-center"
              style={{
                background: filtroEstado === 'en_proceso'
                  ? `linear-gradient(135deg, ${estadoColors.en_proceso.bg} 0%, ${estadoColors.en_proceso.bg}80 100%)`
                  : theme.card,
                border: `1px solid ${filtroEstado === 'en_proceso' ? estadoColors.en_proceso.bg : theme.border}`,
                color: filtroEstado === 'en_proceso' ? '#ffffff' : theme.textSecondary,
                opacity: filtroEstado === 'en_proceso' ? 1 : 0.6,
              }}
            >
              <Play className="h-4 w-4" />
            </button>
            {/* Botón Resueltos */}
            <button
              onClick={() => setFiltroEstado(filtroEstado === 'resuelto' ? '' : 'resuelto')}
              title="Resueltos"
              className="p-2 rounded-lg transition-all duration-200 flex-1 flex items-center justify-center"
              style={{
                background: filtroEstado === 'resuelto'
                  ? `linear-gradient(135deg, ${estadoColors.resuelto.bg} 0%, ${estadoColors.resuelto.bg}80 100%)`
                  : theme.card,
                border: `1px solid ${filtroEstado === 'resuelto' ? estadoColors.resuelto.bg : theme.border}`,
                color: filtroEstado === 'resuelto' ? '#ffffff' : theme.textSecondary,
                opacity: filtroEstado === 'resuelto' ? 1 : 0.6,
              }}
            >
              <CheckCircle className="h-4 w-4" />
            </button>
            {/* Botón Rechazados */}
            <button
              onClick={() => setFiltroEstado(filtroEstado === 'rechazado' ? '' : 'rechazado')}
              title="Rechazados"
              className="p-2 rounded-lg transition-all duration-200 flex-1 flex items-center justify-center"
              style={{
                background: filtroEstado === 'rechazado'
                  ? `linear-gradient(135deg, ${estadoColors.rechazado.bg} 0%, ${estadoColors.rechazado.bg}80 100%)`
                  : theme.card,
                border: `1px solid ${filtroEstado === 'rechazado' ? estadoColors.rechazado.bg : theme.border}`,
                color: filtroEstado === 'rechazado' ? '#ffffff' : theme.textSecondary,
                opacity: filtroEstado === 'rechazado' ? 1 : 0.6,
              }}
            >
              <XCircle className="h-4 w-4" />
            </button>
          </div>
        }
        secondaryFilters={
          <div className="flex items-center gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
            {/* Botón Todas las categorías */}
            <button
              onClick={() => setFiltroCategoria(null)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-200 flex-shrink-0"
              style={{
                background: filtroCategoria === null
                  ? `linear-gradient(135deg, ${theme.primary} 0%, ${theme.primaryHover} 100%)`
                  : theme.backgroundSecondary,
                border: `1px solid ${filtroCategoria === null ? theme.primary : theme.border}`,
                color: filtroCategoria === null ? '#ffffff' : theme.textSecondary,
              }}
            >
              <Tag className="h-4 w-4" />
              <span className="text-sm font-medium whitespace-nowrap">Todas</span>
            </button>
            {/* Botones por categoría */}
            {categorias.map((cat) => {
              const isSelected = filtroCategoria === cat.id;
              const catColor = getCategoryColor(cat.nombre);
              const count = reclamos.filter(r => r.categoria.id === cat.id).length;
              return (
                <button
                  key={cat.id}
                  onClick={() => setFiltroCategoria(isSelected ? null : cat.id)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-200 flex-shrink-0"
                  style={{
                    background: isSelected
                      ? `linear-gradient(135deg, ${catColor} 0%, ${catColor}80 100%)`
                      : theme.backgroundSecondary,
                    border: `1px solid ${isSelected ? catColor : theme.border}`,
                    color: isSelected ? '#ffffff' : theme.textSecondary,
                  }}
                >
                  <span style={{ color: isSelected ? '#ffffff' : catColor }}>
                    {getCategoryIcon(cat.nombre)}
                  </span>
                  <span className="text-sm font-medium whitespace-nowrap">{cat.nombre}</span>
                  {count > 0 && (
                    <span
                      className="text-xs px-1.5 py-0.5 rounded-full"
                      style={{
                        backgroundColor: isSelected ? 'rgba(255,255,255,0.2)' : `${catColor}20`,
                        color: isSelected ? '#ffffff' : catColor,
                      }}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        }
        tableView={
          <ABMTable
            data={filteredReclamos}
            columns={tableColumns}
            keyExtractor={(r) => r.id}
            onRowClick={(r) => openViewSheet(r)}
          />
        }
        sheetContent={null}
      >
        {filteredReclamos.map((r) => {
          const estado = estadoColors[r.estado];
          const categoryColor = getCategoryColor(r.categoria.nombre);
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
                    backgroundColor: `${getCategoryColor(r.categoria.nombre)}15`,
                    border: `1px solid ${getCategoryColor(r.categoria.nombre)}40`,
                  }}
                >
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: getCategoryColor(r.categoria.nombre), color: 'white' }}
                  >
                    {getCategoryIcon(r.categoria.nombre)}
                  </div>
                  <span className="text-xs font-semibold" style={{ color: getCategoryColor(r.categoria.nombre) }}>
                    {r.categoria.nombre}
                  </span>
                </div>
                <span className="text-xs" style={{ color: theme.textSecondary }}>#{r.id}</span>
              </div>

              {/* Contenido */}
              <div>
                <p className="text-sm flex items-center" style={{ color: theme.textSecondary }}>
                  <MapPin className="h-3.5 w-3.5 mr-1.5 flex-shrink-0" />
                  <span className="line-clamp-1">{r.direccion}</span>
                </p>
              </div>

              <p className="text-sm mt-3 line-clamp-2" style={{ color: theme.textSecondary }}>
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
                </div>
                <div className="flex items-center gap-2">
                  {r.empleado_asignado && (
                    <span style={{ color: theme.primary }} className="font-medium">{r.empleado_asignado.nombre}</span>
                  )}
                  <Eye className="h-4 w-4" style={{ color: theme.primary }} />
                </div>
              </div>
              </div>
            </div>
          );
        })}
      </ABMPage>

      {/* Sheet separado para ver detalle */}
      <Sheet
        open={sheetMode === 'view'}
        onClose={closeSheet}
        title={`Reclamo #${selectedReclamo?.id || ''}`}
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
          color: getCategoryColor(selectedCategoria.nombre),
        } : undefined}
      />
    </>
  );
}
