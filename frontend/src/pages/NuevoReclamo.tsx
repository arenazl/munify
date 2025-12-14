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
  Send,
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
  ChevronLeft,
  ChevronRight,
  Loader2,
  Check
} from 'lucide-react';
import { toast } from 'sonner';
import { reclamosApi, categoriasApi, zonasApi } from '../lib/api';
import { Categoria, Zona } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { getDefaultRoute } from '../config/navigation';
import { MapPicker } from '../components/ui/MapPicker';

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
  const { user } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [currentStep, setCurrentStep] = useState(0);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [zonas, setZonas] = useState<Zona[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);

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

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [categoriasRes, zonasRes] = await Promise.all([
          categoriasApi.getAll(true),
          zonasApi.getAll(true),
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
      // Buscar en Argentina, priorizando la localidad del municipio
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

    // Cancelar búsqueda anterior
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    // Nueva búsqueda con delay de 400ms
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

  const steps = [
    { id: 'categoria', title: 'Categoría', icon: <FolderOpen className="h-5 w-5" />, isValid: !!formData.categoria_id },
    { id: 'ubicacion', title: 'Ubicación', icon: <MapPin className="h-5 w-5" />, isValid: !!formData.direccion },
    { id: 'detalles', title: 'Detalles', icon: <FileText className="h-5 w-5" />, isValid: !!formData.titulo && !!formData.descripcion },
    { id: 'confirmar', title: 'Confirmar', icon: <CheckCircle2 className="h-5 w-5" />, isValid: true },
  ];

  const canProceed = steps[currentStep]?.isValid;
  const isLastStep = currentStep === steps.length - 1;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin mx-auto mb-4" style={{ color: theme.primary }} />
          <p style={{ color: theme.textSecondary }}>Cargando formulario...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-1 sm:px-0">
      {/* Header - más compacto en móvil */}
      <div className="mb-4 sm:mb-6">
        <h1 className="text-xl sm:text-2xl font-bold" style={{ color: theme.text }}>Nuevo Reclamo</h1>
        <p className="mt-1 text-sm sm:text-base" style={{ color: theme.textSecondary }}>
          Reportá un problema en tu barrio
        </p>
      </div>

      {/* Stepper - más compacto en móvil */}
      <div className="mb-4 sm:mb-8">
        <div className="flex items-center justify-between">
          {steps.map((step, index) => {
            const isCompleted = index < currentStep;
            const isCurrent = index === currentStep;

            return (
              <div key={step.id} className="flex items-center flex-1">
                <button
                  onClick={() => index < currentStep && setCurrentStep(index)}
                  disabled={index > currentStep}
                  className={`
                    flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 rounded-full transition-all duration-300
                    ${isCompleted ? 'cursor-pointer' : index > currentStep ? 'cursor-not-allowed' : ''}
                  `}
                  style={{
                    backgroundColor: isCompleted || isCurrent ? theme.primary : theme.backgroundSecondary,
                    border: `2px solid ${isCompleted || isCurrent ? theme.primary : theme.border}`,
                    color: isCompleted || isCurrent ? 'white' : theme.textSecondary,
                  }}
                >
                  {isCompleted ? <Check className="h-4 w-4 sm:h-5 sm:w-5" /> : <span className="[&>svg]:h-4 [&>svg]:w-4 sm:[&>svg]:h-5 sm:[&>svg]:w-5">{step.icon}</span>}
                </button>

                {index < steps.length - 1 && (
                  <div
                    className="flex-1 h-1 mx-1 sm:mx-2 rounded-full"
                    style={{
                      backgroundColor: isCompleted ? theme.primary : theme.border,
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
        <div className="flex justify-between mt-2">
          {steps.map((step, index) => (
            <span
              key={step.id}
              className="text-[10px] sm:text-xs font-medium text-center"
              style={{ color: index <= currentStep ? theme.text : theme.textSecondary }}
            >
              {step.title}
            </span>
          ))}
        </div>
      </div>

      {/* Content - padding reducido en móvil */}
      <div
        className="rounded-xl p-4 sm:p-6 mb-4 sm:mb-6"
        style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
      >
        {/* Step 1: Categoría */}
        {currentStep === 0 && (
          <div>
            <h2 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4" style={{ color: theme.text }}>
              ¿Qué problema querés reportar?
            </h2>

            {categorias.length === 0 ? (
              <div className="text-center py-8" style={{ color: theme.textSecondary }}>
                No hay categorías disponibles
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
                {categorias.map((cat) => {
                  const isSelected = formData.categoria_id === String(cat.id);
                  const catColor = cat.color || getCategoryColor(cat.nombre);

                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => {
                        setFormData({ ...formData, categoria_id: String(cat.id) });
                        // Avanzar automáticamente al siguiente paso
                        setTimeout(() => setCurrentStep(1), 150);
                      }}
                      className={`
                        relative p-3 sm:p-4 rounded-xl border-2 transition-all duration-300
                        active:scale-95 touch-manipulation
                      `}
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
          </div>
        )}

        {/* Step 2: Ubicación */}
        {currentStep === 1 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold mb-4" style={{ color: theme.text }}>
              ¿Dónde está el problema?
            </h2>

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
                  placeholder="Escribí para buscar direcciones..."
                  maxLength={120}
                  className="w-full px-4 py-3 rounded-xl focus:ring-2 focus:outline-none transition-all"
                  style={{
                    backgroundColor: theme.backgroundSecondary,
                    color: theme.text,
                    border: `1px solid ${theme.border}`,
                  }}
                />
                {searchingAddress && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <Loader2 className="h-5 w-5 animate-spin" style={{ color: theme.textSecondary }} />
                  </div>
                )}
              </div>

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
        )}

        {/* Step 3: Detalles */}
        {currentStep === 2 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold mb-4" style={{ color: theme.text }}>
              Contanos más detalles
            </h2>

            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: theme.text }}>
                Título del reclamo <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.titulo}
                onChange={(e) => setFormData({ ...formData, titulo: e.target.value })}
                placeholder="Ej: Bache peligroso en esquina"
                className="w-full px-4 py-3 rounded-xl focus:ring-2 focus:outline-none transition-all"
                style={{
                  backgroundColor: theme.backgroundSecondary,
                  color: theme.text,
                  border: `1px solid ${theme.border}`,
                }}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: theme.text }}>
                Descripción detallada <span className="text-red-500">*</span>
              </label>
              <textarea
                value={formData.descripcion}
                onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                placeholder="Describe el problema con el mayor detalle posible..."
                rows={4}
                className="w-full px-4 py-3 rounded-xl focus:ring-2 focus:outline-none transition-all resize-none"
                style={{
                  backgroundColor: theme.backgroundSecondary,
                  color: theme.text,
                  border: `1px solid ${theme.border}`,
                }}
              />
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
        )}

        {/* Step 4: Confirmar */}
        {currentStep === 3 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold mb-4" style={{ color: theme.text }}>
              Revisá tu reclamo antes de enviar
            </h2>

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
            </div>

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
        )}
      </div>

      {/* Footer - sticky en móvil para que siempre esté visible */}
      <div
        className="flex items-center justify-between gap-3 py-3 sm:py-0 sm:pb-4 sticky bottom-0 sm:static -mx-1 px-1 sm:mx-0 sm:px-0"
        style={{ backgroundColor: theme.background }}
      >
        <button
          onClick={() => currentStep > 0 ? setCurrentStep(currentStep - 1) : navigate(-1)}
          className="flex items-center justify-center gap-1 sm:gap-2 px-3 sm:px-4 py-3 sm:py-2 rounded-xl font-medium transition-all duration-200 active:scale-95 touch-manipulation flex-1 sm:flex-none"
          style={{
            backgroundColor: theme.card,
            color: theme.text,
            border: `1px solid ${theme.border}`,
          }}
        >
          <ChevronLeft className="h-5 w-5 sm:h-4 sm:w-4" />
          <span className="text-sm sm:text-base">{currentStep === 0 ? 'Cancelar' : 'Anterior'}</span>
        </button>

        <button
          onClick={isLastStep ? handleSubmit : () => setCurrentStep(currentStep + 1)}
          disabled={submitting || !canProceed}
          className="flex items-center justify-center gap-1 sm:gap-2 px-4 sm:px-5 py-3 sm:py-2 rounded-xl font-medium transition-all duration-200 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation flex-1 sm:flex-none"
          style={{
            backgroundColor: theme.primary,
            color: 'white',
            boxShadow: canProceed ? `0 4px 14px ${theme.primary}40` : 'none',
          }}
        >
          {submitting ? (
            <>
              <Loader2 className="h-5 w-5 sm:h-4 sm:w-4 animate-spin" />
              <span className="text-sm sm:text-base">Enviando...</span>
            </>
          ) : isLastStep ? (
            <>
              <Send className="h-5 w-5 sm:h-4 sm:w-4" />
              <span className="text-sm sm:text-base">Enviar</span>
            </>
          ) : (
            <>
              <span className="text-sm sm:text-base">Siguiente</span>
              <ChevronRight className="h-5 w-5 sm:h-4 sm:w-4" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}
