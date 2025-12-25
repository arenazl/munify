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
  Lock
} from 'lucide-react';
import { toast } from 'sonner';
import { reclamosApi, publicoApi, clasificacionApi } from '../lib/api';
import { validationSchemas } from '../lib/validations';
import { Categoria, Zona } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { getDefaultRoute } from '../config/navigation';
import { MapPicker } from '../components/ui/MapPicker';
import { WizardForm, WizardStep, WizardStepContent } from '../components/ui/WizardForm';

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

// Colores por categoría
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
  'fumiga': '#dc2626',
  'edificio': '#a855f7',
  'semaforo': '#ef4444',
  'semáforo': '#ef4444',
  'vereda': '#78716c',
  'cordon': '#78716c',
  'mobiliario': '#6366f1',
  'ruido': '#f97316',
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

export default function NuevoReclamo() {
  const { theme } = useTheme();
  const { user, isLoading: authLoading, register } = useAuth();
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

  // Datos de registro (solo se usan si no hay usuario)
  const [registerData, setRegisterData] = useState({
    nombre: '',
    email: '',
    password: '',
  });

  // Esperar a que termine la carga de auth antes de decidir
  const showOnlyRegister = !authLoading && !user;

  // Si el usuario está logueado y está en /nuevo-reclamo (sin Layout), redirigir a /crear-reclamo (con Layout)
  useEffect(() => {
    if (user && !authLoading && window.location.pathname === '/nuevo-reclamo') {
      navigate('/crear-reclamo', { replace: true });
    }
  }, [user, authLoading, navigate]);

  // Autocompletado de direcciones
  const [addressSuggestions, setAddressSuggestions] = useState<Array<{
    display_name: string;
    lat: string;
    lon: string;
  }>>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchingAddress, setSearchingAddress] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Buscar direcciones con Nominatim (OpenStreetMap)
  const searchAddress = useCallback(async (query: string) => {
    if (query.length < 3) {
      setAddressSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    setSearchingAddress(true);
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=ar&limit=5&addressdetails=1`,
        {
          headers: {
            'Accept-Language': 'es',
          },
        }
      );
      const data = await response.json();
      setAddressSuggestions(data);
      setShowSuggestions(data.length > 0);
    } catch (error) {
      console.error('Error buscando direcciones:', error);
    } finally {
      setSearchingAddress(false);
    }
  }, []);

  // Debounce para la búsqueda de direcciones
  const handleAddressChange = (value: string) => {
    setFormData({ ...formData, direccion: value });

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(() => {
      searchAddress(value);
    }, 400);
  };

  // Seleccionar una sugerencia
  const selectAddressSuggestion = (suggestion: { display_name: string; lat: string; lon: string }) => {
    setFormData({
      ...formData,
      direccion: suggestion.display_name,
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
    }, 800);
  }, [categorias]);

  // Analizar cuando cambia el título o descripción
  const handleTituloChange = (value: string) => {
    setFormData({ ...formData, titulo: value });
    analyzeTextForCategory(value + ' ' + formData.descripcion);
  };

  const handleDescripcionChange = (value: string) => {
    setFormData({ ...formData, descripcion: value });
    analyzeTextForCategory(formData.titulo + ' ' + value);
  };

  // Aceptar una sugerencia de categoría
  const acceptSuggestedCategory = (categoria: Categoria) => {
    setFormData({ ...formData, categoria_id: String(categoria.id) });
    setSuggestedCategorias([]);
    setShowSuggestion(false);
    toast.success(`Categoría seleccionada: "${categoria.nombre}"`);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const data = {
        ...formData,
        categoria_id: Number(formData.categoria_id),
        zona_id: formData.zona_id ? Number(formData.zona_id) : undefined,
      };

      const response = await reclamosApi.create(data);
      const reclamoId = response.data.id;

      if (selectedFiles.length > 0) {
        for (const file of selectedFiles) {
          await reclamosApi.upload(reclamoId, file, 'creacion');
        }
      }

      toast.success('¡Reclamo creado exitosamente!');
      navigate(user ? getDefaultRoute(user.rol) : '/mis-reclamos');
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string } } };
      toast.error(error.response?.data?.detail || 'Error al crear el reclamo');
    } finally {
      setSubmitting(false);
    }
  };

  const selectedCategoria = categorias.find(c => c.id === Number(formData.categoria_id));
  const selectedZona = zonas.find(z => z.id === Number(formData.zona_id));

  // Función para manejar el registro
  const handleRegister = async () => {
    setRegistering(true);
    setRegisterError('');
    try {
      const partes = registerData.nombre.trim().split(' ');
      const nombre = partes[0] || '';
      const apellido = partes.slice(1).join(' ') || '-';

      await register({
        email: registerData.email,
        password: registerData.password,
        nombre,
        apellido,
      });

      toast.success('¡Cuenta creada! Continuá con tu reclamo');
      window.location.href = '/crear-reclamo';
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string } } };
      setRegisterError(error.response?.data?.detail || 'Error al registrarse');
      setRegistering(false);
    }
  };

  // Validaciones de steps usando el sistema centralizado
  const isRegisterValid = !!registerData.nombre && !!registerData.email && registerData.password.length >= 6;
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

  // Contenido del paso de Registro
  const RegistroStepContent = (
    <WizardStepContent title="Primero, creá tu cuenta" description="Solo necesitamos 3 datos para empezar">
      {registerError && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-xl text-sm mb-4">
          {registerError}
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-2" style={{ color: theme.text }}>
            Tu nombre
          </label>
          <div className="relative">
            <User className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5" style={{ color: theme.textSecondary }} />
            <input
              type="text"
              value={registerData.nombre}
              onChange={(e) => setRegisterData({ ...registerData, nombre: e.target.value })}
              placeholder="Juan Pérez"
              className="w-full pl-12 pr-4 py-3 rounded-xl focus:ring-2 focus:outline-none transition-all"
              style={{
                backgroundColor: theme.backgroundSecondary,
                color: theme.text,
                border: `1px solid ${theme.border}`,
              }}
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2" style={{ color: theme.text }}>
            Email / Usuario
          </label>
          <div className="relative">
            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5" style={{ color: theme.textSecondary }} />
            <input
              type="text"
              value={registerData.email}
              onChange={(e) => setRegisterData({ ...registerData, email: e.target.value })}
              placeholder="tu@email.com o usuario"
              className="w-full pl-12 pr-4 py-3 rounded-xl focus:ring-2 focus:outline-none transition-all"
              style={{
                backgroundColor: theme.backgroundSecondary,
                color: theme.text,
                border: `1px solid ${theme.border}`,
              }}
            />
          </div>
        </div>

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
              placeholder="Mínimo 6 caracteres"
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

        <p className="text-xs text-center mt-2" style={{ color: theme.textSecondary }}>
          ¿Ya tenés cuenta?{' '}
          <button
            onClick={() => navigate('/login')}
            className="font-medium"
            style={{ color: theme.primary }}
          >
            Iniciá sesión
          </button>
        </p>
      </div>
    </WizardStepContent>
  );

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
        <div
          className="grid gap-2 sm:gap-3"
          style={{
            gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
          }}
        >
          {categorias.map((cat) => {
            const isSelected = formData.categoria_id === String(cat.id);
            const catColor = cat.color || getCategoryColor(cat.nombre);

            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => {
                  setFormData({ ...formData, categoria_id: String(cat.id) });
                }}
                className="relative p-3 sm:p-4 rounded-xl border-2 transition-all duration-300 active:scale-95 touch-manipulation"
                style={{
                  backgroundColor: isSelected ? `${catColor}20` : theme.backgroundSecondary,
                  borderColor: isSelected ? catColor : theme.border,
                  color: theme.text,
                  minHeight: '100px',
                }}
              >
                <div
                  className="w-10 h-10 sm:w-12 sm:h-12 rounded-full mx-auto mb-2 sm:mb-3 flex items-center justify-center transition-all duration-300"
                  style={{
                    backgroundColor: isSelected ? catColor : `${catColor}30`,
                    color: isSelected ? 'white' : catColor,
                  }}
                >
                  {getCategoryIcon(cat.nombre)}
                </div>
                <span className="text-xs sm:text-sm font-medium block leading-tight">{cat.nombre}</span>

                {isSelected && (
                  <div
                    className="absolute top-1.5 right-1.5 sm:top-2 sm:right-2 w-5 h-5 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: catColor }}
                  >
                    <CheckCircle2 className="h-3 w-3 text-white" />
                  </div>
                )}
              </button>
            );
          })}
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
            >
              {addressSuggestions.map((suggestion, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => selectAddressSuggestion(suggestion)}
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

        <div>
          <label className="block text-sm font-medium mb-2" style={{ color: theme.text }}>
            Zona/Barrio
          </label>
          <select
            value={formData.zona_id}
            onChange={(e) => setFormData({ ...formData, zona_id: e.target.value })}
            className="w-full px-4 py-3 rounded-xl focus:ring-2 focus:outline-none transition-all"
            style={{
              backgroundColor: theme.backgroundSecondary,
              color: theme.text,
              border: `1px solid ${theme.border}`,
            }}
          >
            <option value="">Seleccionar zona</option>
            {zonas.map((zona) => (
              <option key={zona.id} value={zona.id}>{zona.nombre}</option>
            ))}
          </select>
        </div>

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
            onBlur={() => handleFieldBlur('descripcion')}
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
    <WizardStepContent title="Revisá tu reclamo antes de enviar">
      <div className="space-y-3">
        {/* Categoría */}
        <div
          className="flex items-center gap-3 p-4 rounded-xl"
          style={{ backgroundColor: theme.backgroundSecondary }}
        >
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center"
            style={{
              backgroundColor: selectedCategoria ? `${getCategoryColor(selectedCategoria.nombre)}20` : theme.border,
              color: selectedCategoria ? getCategoryColor(selectedCategoria.nombre) : theme.textSecondary,
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
      id: 'categoria',
      label: 'Categoría',
      icon: <FolderOpen className="h-4 w-4" />,
      content: CategoriaStepContent,
      isValid: isCategoriaValid,
    },
    {
      id: 'ubicacion',
      label: 'Ubicación',
      icon: <MapPin className="h-4 w-4" />,
      content: UbicacionStepContent,
      isValid: isUbicacionValid,
    },
    {
      id: 'detalles',
      label: 'Detalles',
      icon: <FileText className="h-4 w-4" />,
      content: DetallesStepContent,
      isValid: isDetallesValid,
    },
    {
      id: 'confirmar',
      label: 'Confirmar',
      icon: <CheckCircle2 className="h-4 w-4" />,
      content: ConfirmarStepContent,
      isValid: true,
    },
  ];

  // Si no hay usuario, agregar paso de registro al inicio
  const registerStep: WizardStep = {
    id: 'registro',
    label: 'Registro',
    icon: <User className="h-4 w-4" />,
    content: RegistroStepContent,
    isValid: isRegisterValid,
  };

  const steps = showOnlyRegister ? [registerStep, ...baseSteps] : baseSteps;

  // Manejar el cambio de step y posible registro
  const handleStepChange = (newStep: number) => {
    // Si estamos en el paso de registro y vamos al siguiente, primero registrar
    if (showOnlyRegister && currentStep === 0 && newStep === 1) {
      handleRegister();
      return;
    }
    setCurrentStep(newStep);
  };

  // AI suggestion contextual para cada paso del wizard
  const getAISuggestion = () => {
    // Obtener el ID del paso actual
    const currentStepId = steps[currentStep]?.id;

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
          message: 'Elegí la categoría que mejor describa el problema. Si no estás seguro, podés escribir una descripción en el paso de Detalles y te ayudaré a encontrar la correcta.',
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
      if (formData.direccion && formData.latitud && !formData.zona_id) {
        return {
          title: '¡Muy bien!',
          message: 'Si conocés el barrio o zona, seleccionalo del listado. Esto agiliza la asignación del reclamo.',
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

    // Paso de confirmación
    if (currentStepId === 'confirmar') {
      return {
        title: 'Revisá tu reclamo',
        message: 'Verificá que toda la información sea correcta antes de enviar. Si necesitás cambiar algo, podés volver a los pasos anteriores.',
      };
    }

    return undefined;
  };

  const aiSuggestion = getAISuggestion();

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: theme.background }}>
      {/* Top Bar - solo en /nuevo-reclamo (fuera del Layout) */}
      {showOnlyRegister && (
        <div
          className="sticky top-0 z-40 px-4 py-3 border-b"
          style={{ backgroundColor: theme.card, borderColor: theme.border }}
        >
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: theme.primary }}
              >
                <FileText className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-base font-semibold" style={{ color: theme.text }}>Nuevo Reclamo</h1>
                <p className="text-xs" style={{ color: theme.textSecondary }}>Reportá un problema</p>
              </div>
            </div>
            <button
              onClick={() => navigate('/login')}
              className="text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
              style={{ color: theme.primary, backgroundColor: `${theme.primary}15` }}
            >
              Iniciar Sesión
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 max-w-4xl mx-auto px-4 sm:px-6 py-4 w-full">
        <WizardForm
          steps={steps}
          currentStep={currentStep}
          onStepChange={handleStepChange}
          onComplete={handleSubmit}
          onCancel={() => navigate(-1)}
          saving={submitting || registering}
          title="Nuevo Reclamo"
          subtitle="Reportá un problema en tu barrio"
          completeLabel="Enviar Reclamo"
          aiSuggestion={aiSuggestion}
        />
      </div>
    </div>
  );
}
