import { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  FileText,
  User,
  CheckCircle2,
  Loader2,
  Mail,
  Phone,
  Lock,
  ShieldCheck,
  Search,
  Sparkles,
  FolderOpen,
  FileCheck,
  Clock,
  Users,
  ArrowLeft,
  ChevronRight,
  Lightbulb,
} from 'lucide-react';
import { toast } from 'sonner';
import { tramitesApi, authApi, chatApi } from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { WizardForm, WizardStep, WizardStepContent } from '../../components/ui/WizardForm';
import { DynamicIcon } from '../../components/ui/DynamicIcon';
import type { ServicioTramite } from '../../types';
import { StickyPageHeader } from '../../components/ui/StickyPageHeader';
import { Building2 } from 'lucide-react';

// Helper para renderizar iconos dinámicos
function getServicioIcon(icono?: string, className = "h-6 w-6") {
  return (
    <DynamicIcon
      name={icono || 'FileText'}
      className={className}
      fallback={<FileText className={className} />}
    />
  );
}

interface Rubro {
  nombre: string;
  icono: string;
  color: string;
  servicios: ServicioTramite[];
}

export default function MobileNuevoTramite() {
  const { theme } = useTheme();
  const { user, isLoading: authLoading, register, login, municipioActual } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const dataLoadedRef = useRef(false);

  // Detectar si estamos en /gestion para navegar correctamente después del submit
  const isInGestion = location.pathname.startsWith('/gestion');

  const [currentStep, setCurrentStep] = useState(0);
  const [servicios, setServicios] = useState<ServicioTramite[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [registerError, setRegisterError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRubro, setSelectedRubro] = useState<string | null>(null);

  // Form data
  const [formData, setFormData] = useState({
    servicio_id: '',
    asunto: '',
    descripcion: '',
    observaciones: '',
    barrio: '',
    direccion: '',
    nombre_solicitante: '',
    apellido_solicitante: '',
    email_solicitante: '',
    telefono_solicitante: '',
  });

  // Register data
  const [registerData, setRegisterData] = useState({
    nombre: '',
    email: '',
    password: '',
    telefono: '',
  });
  const [isAnonymous, setIsAnonymous] = useState(true);
  const [emailExists, setEmailExists] = useState<boolean | null>(null);
  const [checkingEmail, setCheckingEmail] = useState(false);
  const emailCheckTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // AI state
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResponse, setAiResponse] = useState('');

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
      country?: string;
    };
  }>>([]);
  const [userInputNumber, setUserInputNumber] = useState<string>('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchingAddress, setSearchingAddress] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showOnlyRegister = !authLoading && !user;

  // Cargar servicios
  useEffect(() => {
    const fetchData = async () => {
      if (dataLoadedRef.current) return;
      dataLoadedRef.current = true;

      try {
        const res = await tramitesApi.getServicios();
        setServicios(res.data);
        // Auto-seleccionar el primer rubro
        if (res.data.length > 0) {
          const rubrosTemp: Record<string, Rubro> = {};
          res.data.forEach((s: ServicioTramite) => {
            const match = s.descripcion?.match(/^\[([^\]]+)\]/);
            const rubroNombre = match ? match[1] : 'Otros';
            if (!rubrosTemp[rubroNombre]) {
              rubrosTemp[rubroNombre] = {
                nombre: rubroNombre,
                icono: s.icono || 'FileText',
                color: s.color || '#6b7280',
                servicios: []
              };
            }
            rubrosTemp[rubroNombre].servicios.push(s);
          });
          const rubrosArr = Object.values(rubrosTemp);
          if (rubrosArr.length > 0) {
            setSelectedRubro(rubrosArr[0].nombre);
          }
        }
      } catch (error) {
        console.error('Error cargando servicios:', error);
        toast.error('Error al cargar servicios');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // Agrupar servicios por rubro
  const rubrosMap: Record<string, Rubro> = {};
  servicios.forEach(s => {
    const match = s.descripcion?.match(/^\[([^\]]+)\]/);
    const rubroNombre = match ? match[1] : 'Otros';
    if (!rubrosMap[rubroNombre]) {
      rubrosMap[rubroNombre] = {
        nombre: rubroNombre,
        icono: s.icono || 'FileText',
        color: s.color || '#6b7280',
        servicios: []
      };
    }
    rubrosMap[rubroNombre].servicios.push(s);
  });
  const rubros: Rubro[] = Object.values(rubrosMap);

  const serviciosDelRubro: ServicioTramite[] = selectedRubro
    ? rubrosMap[selectedRubro]?.servicios || []
    : [];

  const filteredServicios = searchTerm.trim()
    ? servicios.filter(s =>
        s.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (s.descripcion && s.descripcion.toLowerCase().includes(searchTerm.toLowerCase()))
      )
    : [];

  const selectedServicio = servicios.find(s => s.id === Number(formData.servicio_id));

  // Buscar direcciones
  const searchAddress = useCallback(async (query: string) => {
    if (query.length < 3) {
      setAddressSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    setSearchingAddress(true);
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}, Argentina&limit=5&addressdetails=1`
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

  const handleAddressChange = (value: string) => {
    setFormData(prev => ({ ...prev, direccion: value }));

    // Extraer número de la dirección que escribe el usuario (ej: "San Martín 230" -> "230")
    const numberMatch = value.match(/\b(\d+)\b/);
    if (numberMatch) {
      setUserInputNumber(numberMatch[1]);
    }

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    searchTimeoutRef.current = setTimeout(() => searchAddress(value), 300);
  };

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

      // Provincia (solo si no es Buenos Aires que ya se sabe)
      if (addr.state && !addr.state.toLowerCase().includes('buenos aires')) {
        parts.push(addr.state);
      }

      direccion = parts.join(', ');
    }

    // Si no pudimos construir una dirección mejor, usar display_name pero más corto
    if (!direccion) {
      // Tomar solo las primeras 3-4 partes del display_name
      const parts = suggestion.display_name.split(', ').slice(0, 4);
      direccion = parts.join(', ');
    }

    setFormData(prev => ({ ...prev, direccion }));
    setShowSuggestions(false);
    setAddressSuggestions([]);
  };

  // Verificar email
  const checkEmail = async (email: string) => {
    if (!email || email.length < 5) {
      setEmailExists(null);
      return;
    }
    setCheckingEmail(true);
    try {
      const res = await authApi.checkEmail(email);
      setEmailExists(res.data.exists);
    } catch {
      setEmailExists(null);
    } finally {
      setCheckingEmail(false);
    }
  };

  const handleEmailChange = (email: string) => {
    setRegisterData(prev => ({ ...prev, email }));
    setEmailExists(null);
    if (emailCheckTimeoutRef.current) clearTimeout(emailCheckTimeoutRef.current);
    emailCheckTimeoutRef.current = setTimeout(() => checkEmail(email), 500);
  };

  // Registro/Login
  const handleRegisterOrLogin = async () => {
    setRegistering(true);
    setRegisterError('');
    try {
      if (emailExists) {
        await login(registerData.email, registerData.password);
        toast.success('¡Sesión iniciada!');
      } else {
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
        toast.success('¡Cuenta creada!');
      }
      setTimeout(() => {
        setCurrentStep(3);
      }, 0);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string } } };
      setRegisterError(error.response?.data?.detail || 'Error');
    } finally {
      setRegistering(false);
    }
  };

  // Submit trámite
  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      // Armar descripción completa con barrio si existe
      let descripcionCompleta = formData.descripcion || '';
      if (formData.barrio) {
        descripcionCompleta = `[Barrio: ${formData.barrio}] ${descripcionCompleta}`.trim();
      }

      const tramiteData: Record<string, unknown> = {
        servicio_id: Number(formData.servicio_id),
        asunto: formData.asunto,
        descripcion: descripcionCompleta || undefined,
        observaciones: formData.observaciones || undefined,
        direccion_solicitante: formData.direccion || undefined,
      };

      if (!user || isAnonymous) {
        tramiteData.nombre_solicitante = formData.nombre_solicitante || registerData.nombre;
        tramiteData.apellido_solicitante = formData.apellido_solicitante;
        tramiteData.email_solicitante = formData.email_solicitante || registerData.email;
        tramiteData.telefono_solicitante = formData.telefono_solicitante || registerData.telefono;
      }

      const res = await tramitesApi.create(tramiteData);
      toast.success(`Trámite ${res.data.numero_tramite} creado exitosamente`);

      // Navegar de vuelta (a la ruta correcta según dónde estemos)
      await new Promise(resolve => setTimeout(resolve, 500));
      navigate(isInGestion ? '/gestion/mis-tramites' : '/app', { replace: true });
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } } };
      toast.error(err.response?.data?.detail || 'Error al crear trámite');
    } finally {
      setSubmitting(false);
    }
  };

  // Validaciones
  const isStep1Valid = !!formData.servicio_id;
  const isStep2Valid = formData.asunto.trim().length >= 10;
  const isRegisterValid = (() => {
    if (!registerData.email || registerData.password.length < 6) return false;
    if (emailExists === true) return true;
    if (emailExists === false) return !!registerData.nombre;
    return false;
  })();
  const isStep3Valid = user ? true : (
    isAnonymous
      ? !!(formData.email_solicitante || formData.telefono_solicitante)
      : isRegisterValid
  );

  // Handle step change
  const handleStepChange = (newStep: number) => {
    const registerStepIndex = showOnlyRegister ? 2 : -1;
    if (showOnlyRegister && currentStep === registerStepIndex && newStep === registerStepIndex + 1) {
      if (!isAnonymous) {
        handleRegisterOrLogin();
        return;
      }
    }
    setCurrentStep(newStep);
  };

  // Loading state
  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: theme.background }}>
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin mx-auto mb-4" style={{ color: theme.primary }} />
          <p style={{ color: theme.textSecondary }}>Cargando...</p>
        </div>
      </div>
    );
  }

  // Step 1: Seleccionar servicio
  const ServicioStepContent = (
    <WizardStepContent title="¿Qué trámite necesitás?" description="Seleccioná el servicio que necesitás">
      <div className="flex flex-col gap-3 h-full">
        {/* Buscador */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: theme.textSecondary }} />
          <input
            type="text"
            placeholder="Buscar trámite..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-3 rounded-xl text-sm"
            style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}`, color: theme.text }}
          />
          {searchTerm.trim() && (
            <div className="absolute left-0 right-0 top-full mt-2 rounded-xl shadow-lg z-10 max-h-[200px] overflow-y-auto" style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}>
              {filteredServicios.length > 0 ? filteredServicios.map((s) => (
                <button
                  key={s.id}
                  onClick={() => { setFormData(prev => ({ ...prev, servicio_id: String(s.id) })); setSearchTerm(''); }}
                  className="w-full p-3 flex items-center gap-3 text-left active:bg-black/5"
                >
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${s.color || theme.primary}20`, color: s.color || theme.primary }}>
                    {getServicioIcon(s.icono)}
                  </div>
                  <div>
                    <p className="font-medium text-sm" style={{ color: theme.text }}>{s.nombre}</p>
                    <p className="text-xs" style={{ color: theme.textSecondary }}>{s.tiempo_estimado_dias}d · {s.costo ? `$${s.costo.toLocaleString()}` : 'Gratis'}</p>
                  </div>
                </button>
              )) : (
                <p className="p-4 text-center text-sm" style={{ color: theme.textSecondary }}>No se encontraron trámites</p>
              )}
            </div>
          )}
        </div>

        {/* Rubros - Grid de categorías 5x2 */}
        <div>
          <p className="text-xs font-medium mb-2" style={{ color: theme.textSecondary }}>Categorías</p>
          <div className="grid grid-cols-5 gap-1.5">
            {rubros.slice(0, 10).map((rubro) => {
              const isSelected = selectedRubro === rubro.nombre;
              return (
                <button
                  key={rubro.nombre}
                  onClick={() => setSelectedRubro(isSelected ? null : rubro.nombre)}
                  className="relative p-1.5 rounded-lg border transition-all active:scale-95"
                  style={{
                    backgroundColor: isSelected ? `${rubro.color}20` : theme.backgroundSecondary,
                    borderColor: isSelected ? rubro.color : theme.border
                  }}
                >
                  <div
                    className="w-7 h-7 rounded-lg mx-auto mb-0.5 flex items-center justify-center"
                    style={{ backgroundColor: isSelected ? rubro.color : `${rubro.color}30`, color: isSelected ? 'white' : rubro.color }}
                  >
                    <span className="scale-[0.6]">{getServicioIcon(rubro.icono)}</span>
                  </div>
                  <span className="text-[8px] font-medium block text-center line-clamp-2 leading-tight" style={{ color: theme.text }}>
                    {rubro.nombre}
                  </span>
                  <span
                    className="absolute -top-0.5 -right-0.5 text-[7px] font-bold w-3.5 h-3.5 flex items-center justify-center rounded-full"
                    style={{ backgroundColor: rubro.color, color: 'white' }}
                  >
                    {rubro.servicios.length}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Trámites del rubro seleccionado - Formato tabla */}
        {selectedRubro && (
          <div className="flex-1 flex flex-col min-h-0">
            <p className="text-xs font-medium mb-2" style={{ color: theme.text }}>
              Trámites de {selectedRubro}
            </p>
            <div className="rounded-xl overflow-hidden border flex-1 overflow-y-auto" style={{ borderColor: theme.border }}>
              {serviciosDelRubro.map((s, idx) => {
                const isSelected = formData.servicio_id === String(s.id);
                const color = s.color || theme.primary;
                return (
                  <button
                    key={s.id}
                    onClick={() => setFormData(prev => ({ ...prev, servicio_id: String(s.id) }))}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left active:bg-black/5 transition-all"
                    style={{
                      backgroundColor: isSelected ? `${color}15` : theme.backgroundSecondary,
                      borderBottom: idx < serviciosDelRubro.length - 1 ? `1px solid ${theme.border}` : 'none',
                    }}
                  >
                    <div
                      className="w-7 h-7 rounded-lg flex-shrink-0 flex items-center justify-center"
                      style={{ backgroundColor: isSelected ? color : `${color}20`, color: isSelected ? 'white' : color }}
                    >
                      <span className="scale-75">{getServicioIcon(s.icono)}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-xs leading-tight truncate" style={{ color: theme.text }}>{s.nombre}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-[10px]" style={{ color: theme.textSecondary }}>
                        {s.tiempo_estimado_dias}d
                      </span>
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded" style={{ backgroundColor: s.costo ? `${theme.primary}20` : '#10b98120', color: s.costo ? theme.primary : '#10b981' }}>
                        {s.costo ? `$${s.costo.toLocaleString()}` : 'Gratis'}
                      </span>
                      {isSelected && (
                        <CheckCircle2 className="h-4 w-4" style={{ color }} />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </WizardStepContent>
  );

  // Step 2: Detalle
  const DetalleStepContent = (
    <WizardStepContent title="Describí tu solicitud" description="Completá los detalles del trámite">
      <div className="space-y-4">
        {/* Info del servicio */}
        {selectedServicio && (
          <div className="p-4 rounded-xl" style={{ backgroundColor: `${selectedServicio.color || theme.primary}10`, border: `1px solid ${selectedServicio.color || theme.primary}30` }}>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${selectedServicio.color || theme.primary}20` }}>
                <span style={{ color: selectedServicio.color || theme.primary }}>{getServicioIcon(selectedServicio.icono)}</span>
              </div>
              <div>
                <p className="font-medium" style={{ color: theme.text }}>{selectedServicio.nombre}</p>
                <p className="text-xs" style={{ color: theme.textSecondary }}>{selectedServicio.tiempo_estimado_dias} días · {selectedServicio.costo ? `$${selectedServicio.costo.toLocaleString()}` : 'Gratuito'}</p>
              </div>
            </div>
            {selectedServicio.documentos_requeridos && (
              <p className="text-xs mt-2" style={{ color: theme.textSecondary }}><strong>Documentos:</strong> {selectedServicio.documentos_requeridos}</p>
            )}
          </div>
        )}

        {/* Asunto */}
        <div className="space-y-2">
          <label className="text-sm font-medium" style={{ color: theme.text }}>Asunto <span className="text-red-500">*</span></label>
          <input
            type="text"
            placeholder="Ej: Solicitud de habilitación comercial"
            value={formData.asunto}
            onChange={(e) => setFormData(prev => ({ ...prev, asunto: e.target.value }))}
            className="w-full px-4 py-3 rounded-xl text-sm"
            style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}`, color: theme.text }}
          />
          <p className="text-xs" style={{ color: theme.textSecondary }}>Mínimo 10 caracteres ({formData.asunto.length}/10)</p>
        </div>

        {/* Dirección */}
        <div className="space-y-2 relative">
          <label className="text-sm font-medium" style={{ color: theme.text }}>Dirección</label>
          <div className="relative">
            <input
              type="text"
              placeholder="Escribí para buscar..."
              value={formData.direccion}
              onChange={(e) => handleAddressChange(e.target.value)}
              onFocus={() => addressSuggestions.length > 0 && setShowSuggestions(true)}
              className="w-full px-4 py-3 rounded-xl text-sm"
              style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}`, color: theme.text }}
            />
            {searchingAddress && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <Loader2 className="h-4 w-4 animate-spin" style={{ color: theme.textSecondary }} />
              </div>
            )}
          </div>

          {showSuggestions && addressSuggestions.length > 0 && (
            <div
              className="absolute z-50 w-full mt-1 rounded-xl shadow-lg overflow-hidden max-h-48 overflow-y-auto"
              style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
            >
              {addressSuggestions.map((suggestion, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => selectAddressSuggestion(suggestion)}
                  className="w-full px-4 py-2.5 text-left text-sm active:bg-black/5 transition-colors"
                  style={{ color: theme.text }}
                >
                  {suggestion.display_name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Observaciones */}
        <div className="space-y-2">
          <label className="text-sm font-medium" style={{ color: theme.text }}>Observaciones</label>
          <textarea
            placeholder="Información adicional..."
            value={formData.observaciones}
            onChange={(e) => setFormData(prev => ({ ...prev, observaciones: e.target.value }))}
            rows={3}
            className="w-full px-4 py-3 rounded-xl text-sm resize-none"
            style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}`, color: theme.text }}
          />
        </div>
      </div>
    </WizardStepContent>
  );

  // Step 3: Contacto (o Registro si no hay usuario)
  const ContactoStepContent = (
    <WizardStepContent
      title={user ? 'Datos de contacto' : (emailExists ? '¡Hola de nuevo!' : '¿Cómo querés identificarte?')}
      description={user ? 'El trámite quedará asociado a tu cuenta' : (emailExists ? 'Ingresá tu contraseña' : 'Elegí cómo registrar tu trámite')}
    >
      {user ? (
        <div className="p-4 rounded-xl" style={{ backgroundColor: '#10b98110', border: '1px solid #10b98130' }}>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: '#10b98120' }}>
              <ShieldCheck className="h-5 w-5" style={{ color: '#10b981' }} />
            </div>
            <div>
              <p className="font-medium" style={{ color: theme.text }}>{user.nombre} {user.apellido}</p>
              <p className="text-xs" style={{ color: theme.textSecondary }}>{user.email}</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Toggle de privacidad */}
          {!emailExists && (
            <div className="flex gap-2 p-1 rounded-xl" style={{ backgroundColor: theme.backgroundSecondary }}>
              <button
                onClick={() => setIsAnonymous(true)}
                className="flex-1 py-2.5 px-3 rounded-lg text-sm font-medium transition-all"
                style={{ backgroundColor: isAnonymous ? theme.card : 'transparent', color: isAnonymous ? theme.primary : theme.textSecondary }}
              >
                Sin cuenta
              </button>
              <button
                onClick={() => setIsAnonymous(false)}
                className="flex-1 py-2.5 px-3 rounded-lg text-sm font-medium transition-all"
                style={{ backgroundColor: !isAnonymous ? theme.card : 'transparent', color: !isAnonymous ? theme.primary : theme.textSecondary }}
              >
                Crear cuenta
              </button>
            </div>
          )}

          {registerError && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-xl text-sm">
              {registerError}
            </div>
          )}

          {isAnonymous ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium mb-1 block" style={{ color: theme.textSecondary }}>Nombre</label>
                  <input
                    type="text"
                    placeholder="Tu nombre"
                    value={formData.nombre_solicitante}
                    onChange={(e) => setFormData(prev => ({ ...prev, nombre_solicitante: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-lg text-sm"
                    style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}`, color: theme.text }}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 block" style={{ color: theme.textSecondary }}>Apellido</label>
                  <input
                    type="text"
                    placeholder="Tu apellido"
                    value={formData.apellido_solicitante}
                    onChange={(e) => setFormData(prev => ({ ...prev, apellido_solicitante: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-lg text-sm"
                    style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}`, color: theme.text }}
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: theme.textSecondary }}>Email <span className="text-red-500">*</span></label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: theme.textSecondary }} />
                  <input
                    type="email"
                    placeholder="tu@email.com"
                    value={formData.email_solicitante}
                    onChange={(e) => setFormData(prev => ({ ...prev, email_solicitante: e.target.value }))}
                    className="w-full pl-10 pr-4 py-2.5 rounded-lg text-sm"
                    style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}`, color: theme.text }}
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: theme.textSecondary }}>Teléfono</label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: theme.textSecondary }} />
                  <input
                    type="tel"
                    placeholder="1123456789"
                    value={formData.telefono_solicitante}
                    onChange={(e) => setFormData(prev => ({ ...prev, telefono_solicitante: e.target.value }))}
                    className="w-full pl-10 pr-4 py-2.5 rounded-lg text-sm"
                    style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}`, color: theme.text }}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Email */}
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: theme.textSecondary }}>Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: theme.textSecondary }} />
                  <input
                    type="email"
                    placeholder="tu@email.com"
                    value={registerData.email}
                    onChange={(e) => handleEmailChange(e.target.value)}
                    className="w-full pl-10 pr-10 py-2.5 rounded-lg text-sm"
                    style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}`, color: theme.text }}
                  />
                  {checkingEmail && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin" style={{ color: theme.textSecondary }} />}
                </div>
                {emailExists === true && <p className="text-xs mt-1" style={{ color: theme.primary }}>Ya tenés cuenta. Ingresá tu contraseña.</p>}
                {emailExists === false && <p className="text-xs mt-1" style={{ color: '#10b981' }}>Email disponible.</p>}
              </div>

              {/* Nombre (solo registro) */}
              {emailExists === false && (
                <div>
                  <label className="text-xs font-medium mb-1 block" style={{ color: theme.textSecondary }}>Nombre</label>
                  <input
                    type="text"
                    placeholder="Tu nombre"
                    value={registerData.nombre}
                    onChange={(e) => setRegisterData(prev => ({ ...prev, nombre: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-lg text-sm"
                    style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}`, color: theme.text }}
                  />
                </div>
              )}

              {/* Contraseña */}
              {(emailExists === true || emailExists === false) && (
                <div>
                  <label className="text-xs font-medium mb-1 block" style={{ color: theme.textSecondary }}>Contraseña</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: theme.textSecondary }} />
                    <input
                      type="password"
                      placeholder={emailExists ? 'Tu contraseña' : 'Mínimo 6 caracteres'}
                      value={registerData.password}
                      onChange={(e) => setRegisterData(prev => ({ ...prev, password: e.target.value }))}
                      className="w-full pl-10 pr-4 py-2.5 rounded-lg text-sm"
                      style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}`, color: theme.text }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </WizardStepContent>
  );

  // Step 4: Confirmar
  const ConfirmarStepContent = (
    <WizardStepContent title="Confirmá tu trámite">
      <div className="space-y-3">
        {/* Usuario */}
        {user && (
          <div className="flex items-center gap-3 p-4 rounded-xl" style={{ backgroundColor: theme.backgroundSecondary }}>
            <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${theme.primary}20`, color: theme.primary }}>
              <User className="h-5 w-5" />
            </div>
            <div>
              <span className="text-xs" style={{ color: theme.textSecondary }}>Usuario</span>
              <p className="font-medium" style={{ color: theme.text }}>{user.nombre} {user.apellido}</p>
            </div>
          </div>
        )}

        {/* Servicio */}
        {selectedServicio && (
          <div className="flex items-center gap-3 p-4 rounded-xl" style={{ backgroundColor: theme.backgroundSecondary }}>
            <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${selectedServicio.color || theme.primary}20` }}>
              <span style={{ color: selectedServicio.color || theme.primary }}>{getServicioIcon(selectedServicio.icono)}</span>
            </div>
            <div>
              <span className="text-xs" style={{ color: theme.textSecondary }}>Servicio</span>
              <p className="font-medium" style={{ color: theme.text }}>{selectedServicio.nombre}</p>
            </div>
          </div>
        )}

        {/* Asunto */}
        <div className="p-4 rounded-xl" style={{ backgroundColor: theme.backgroundSecondary }}>
          <span className="text-xs" style={{ color: theme.textSecondary }}>Asunto</span>
          <p className="font-medium" style={{ color: theme.text }}>{formData.asunto || 'Sin asunto'}</p>
          {formData.observaciones && (
            <p className="text-sm mt-2" style={{ color: theme.textSecondary }}>{formData.observaciones}</p>
          )}
        </div>

        {/* Tip */}
        <div className="flex items-start gap-3 p-4 rounded-xl mt-4" style={{ backgroundColor: `${theme.primary}10`, border: `1px solid ${theme.primary}30` }}>
          <Lightbulb className="h-5 w-5 flex-shrink-0 mt-0.5" style={{ color: theme.primary }} />
          <p className="text-sm" style={{ color: theme.text }}>
            Una vez enviado, recibirás un número de seguimiento para consultar el estado de tu trámite.
          </p>
        </div>
      </div>
    </WizardStepContent>
  );

  // Define steps
  const baseSteps: WizardStep[] = [
    {
      id: 'servicio',
      label: 'Servicio',
      icon: <FolderOpen className="h-4 w-4" />,
      content: ServicioStepContent,
      isValid: isStep1Valid,
    },
    {
      id: 'detalle',
      label: 'Detalle',
      icon: <FileText className="h-4 w-4" />,
      content: DetalleStepContent,
      isValid: isStep2Valid,
    },
    {
      id: 'contacto',
      label: 'Contacto',
      icon: <User className="h-4 w-4" />,
      content: ContactoStepContent,
      isValid: isStep3Valid,
    },
    {
      id: 'confirmar',
      label: 'Confirmar',
      icon: <CheckCircle2 className="h-4 w-4" />,
      content: ConfirmarStepContent,
      isValid: true,
    },
  ];

  const steps = baseSteps;

  // Contexto para IA - solo municipio, categoría y trámite
  const aiContext = {
    tipo: 'tramite' as const,
    datos: {
      municipio: municipioActual?.nombre || 'Municipalidad',
      categoria: selectedRubro || '',
      tramite: selectedServicio?.nombre || '',
    }
  };

  // Nombre del municipio para el header
  const nombreMunicipio = municipioActual?.nombre?.replace('Municipalidad de ', '')
    || localStorage.getItem('municipio_nombre')?.replace('Municipalidad de ', '')
    || 'Mi Municipio';

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: theme.background }}>
      {/* Header sticky con municipio */}
      <StickyPageHeader
        icon={<Building2 className="h-5 w-5" />}
        title={`${nombreMunicipio} - Nuevo Trámite`}
        backLink={isInGestion ? '/gestion/tramites' : '/app'}
      />

      {/* Wizard */}
      <div className="flex-1 flex flex-col">
        <WizardForm
          steps={steps}
          currentStep={currentStep}
          onStepChange={handleStepChange}
          onComplete={handleSubmit}
          onCancel={() => navigate(-1)}
          saving={submitting || registering}
          title=""
          subtitle=""
          completeLabel="Enviar Trámite"
          aiContext={aiContext}
          showAIButton={true}
        />
      </div>
    </div>
  );
}
