import { useState, useRef, useEffect, useCallback } from 'react';
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
  Store,
  Car,
  Map,
  TreeDeciduous,
  CalendarDays,
  CreditCard,
  HardHat,
  Heart,
  Lightbulb,
  Send,
  FolderOpen,
  Users,
  FileCheck,
  Clock,
} from 'lucide-react';
import { toast } from 'sonner';
import { tramitesApi, authApi, chatApi } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { WizardModal } from './ui/WizardModal';
import type { ServicioTramite } from '../types';

const servicioIcons: Record<string, React.ReactNode> = {
  'Store': <Store className="h-5 w-5" />,
  'FileCheck': <FileCheck className="h-5 w-5" />,
  'HardHat': <HardHat className="h-5 w-5" />,
  'Car': <Car className="h-5 w-5" />,
  'Map': <Map className="h-5 w-5" />,
  'TreeDeciduous': <TreeDeciduous className="h-5 w-5" />,
  'Users': <Users className="h-5 w-5" />,
  'CalendarDays': <CalendarDays className="h-5 w-5" />,
  'CreditCard': <CreditCard className="h-5 w-5" />,
  'Heart': <Heart className="h-5 w-5" />,
  'Lightbulb': <Lightbulb className="h-5 w-5" />,
  'default': <FileText className="h-5 w-5" />,
};

function getServicioIcon(icono?: string): React.ReactNode {
  if (!icono) return servicioIcons.default;
  return servicioIcons[icono] || servicioIcons.default;
}

interface TramiteWizardProps {
  open: boolean;
  onClose: () => void;
  servicios: ServicioTramite[];
  onSuccess?: () => void;
}

interface Rubro {
  nombre: string;
  icono: string;
  color: string;
  servicios: ServicioTramite[];
}

export function TramiteWizard({ open, onClose, servicios, onSuccess }: TramiteWizardProps) {
  const { theme } = useTheme();
  const { user, register, login } = useAuth();

  const [wizardStep, setWizardStep] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRubro, setSelectedRubro] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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

  const [aiLoading, setAiLoading] = useState(false);
  const [aiResponse, setAiResponse] = useState('');
  const [aiQuestion, setAiQuestion] = useState('');

  // Autocompletado de direcciones
  const [addressSuggestions, setAddressSuggestions] = useState<Array<{
    display_name: string;
    lat: string;
    lon: string;
  }>>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchingAddress, setSearchingAddress] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    searchTimeoutRef.current = setTimeout(() => searchAddress(value), 300);
  };

  const selectAddressSuggestion = (suggestion: { display_name: string }) => {
    setFormData(prev => ({ ...prev, direccion: suggestion.display_name }));
    setShowSuggestions(false);
    setAddressSuggestions([]);
  };

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

  // Auto-seleccionar el primer rubro cuando se abre el wizard
  useEffect(() => {
    if (open && rubros.length > 0 && !selectedRubro) {
      setSelectedRubro(rubros[0].nombre);
    }
  }, [open, rubros.length]);

  // Reset cuando se cierra
  useEffect(() => {
    if (!open) {
      setSelectedRubro(null);
    }
  }, [open]);

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

  const resetForm = () => {
    setFormData({
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
    setSearchTerm('');
    setWizardStep(0);
    setAiResponse('');
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleCreate = async () => {
    setSaving(true);
    try {
      if (!user && !isAnonymous) {
        if (emailExists === false) {
          await register({
            email: registerData.email,
            password: registerData.password,
            nombre: registerData.nombre,
            apellido: '',
            telefono: registerData.telefono,
          });
        } else if (emailExists === true) {
          await login(registerData.email, registerData.password);
        }
      }

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
      handleClose();
      onSuccess?.();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } } };
      toast.error(err.response?.data?.detail || 'Error al crear trámite');
    } finally {
      setSaving(false);
    }
  };

  const askAI = async () => {
    if (!aiQuestion.trim()) return;
    setAiLoading(true);
    try {
      const servicio = selectedServicio;

      // Armar contexto dinámico con toda la info disponible
      const contexto: Record<string, unknown> = {};

      if (servicio) {
        contexto.tramite = servicio.nombre;
        contexto.descripcion = servicio.descripcion?.replace(/^\[[^\]]+\]\s*/, '');
        contexto.documentos_requeridos = servicio.documentos_requeridos;
        contexto.requisitos = servicio.requisitos;
        contexto.tiempo_estimado = `${servicio.tiempo_estimado_dias} días`;
        contexto.costo = servicio.costo ? `$${servicio.costo.toLocaleString()}` : 'Gratuito';
      }

      if (selectedRubro) {
        contexto.categoria = selectedRubro;
      }

      if (wizardStep === 0) {
        contexto.paso = 'Selección de trámite';
      } else if (wizardStep === 1) {
        contexto.paso = 'Completando detalles';
        if (formData.asunto) contexto.asunto_ingresado = formData.asunto;
        if (formData.barrio) contexto.barrio = formData.barrio;
        if (formData.direccion) contexto.direccion = formData.direccion;
        if (formData.observaciones) contexto.observaciones = formData.observaciones;
      } else if (wizardStep === 2) {
        contexto.paso = 'Datos de contacto';
      }

      const response = await chatApi.askDynamic(aiQuestion, contexto, 'tramite');
      setAiResponse(response.response || response.message);
      setAiQuestion('');
    } catch {
      setAiResponse('Lo siento, no pude procesar tu consulta. Intenta de nuevo.');
    } finally {
      setAiLoading(false);
    }
  };

  const handleAiKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      askAI();
    }
  };

  const isStep1Valid = !!formData.servicio_id;
  const isStep2Valid = formData.asunto.trim().length >= 10;
  const isStep3Valid = user ? true : (
    isAnonymous
      ? !!(formData.email_solicitante || formData.telefono_solicitante)
      : !!(registerData.email && registerData.password && (emailExists === false ? registerData.nombre : true))
  );

  // Step 1: Seleccionar servicio
  const wizardStep1 = (
    <div className="space-y-4">
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
                className="w-full p-3 flex items-center gap-3 text-left hover:bg-black/5"
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

      <div>
        <p className="text-xs font-medium mb-2" style={{ color: theme.textSecondary }}>O selecciona por categoría:</p>
        <div className="grid grid-cols-5 gap-2">
          {rubros.slice(0, 10).map((rubro) => {
            const isSelected = selectedRubro === rubro.nombre;
            return (
              <button
                key={rubro.nombre}
                onClick={() => setSelectedRubro(isSelected ? null : rubro.nombre)}
                className={`relative p-2 rounded-xl border-2 transition-all hover:scale-105 ${isSelected ? 'border-current' : 'border-transparent'}`}
                style={{ backgroundColor: isSelected ? `${rubro.color}20` : theme.backgroundSecondary, borderColor: isSelected ? rubro.color : theme.border }}
              >
                <div className="w-8 h-8 rounded-full mx-auto mb-1 flex items-center justify-center" style={{ backgroundColor: isSelected ? rubro.color : `${rubro.color}30`, color: isSelected ? 'white' : rubro.color }}>
                  {getServicioIcon(rubro.icono)}
                </div>
                <span className="text-[10px] font-medium block text-center line-clamp-2" style={{ color: theme.text }}>{rubro.nombre}</span>
                {isSelected && (
                  <div className="absolute top-1 right-1 w-3 h-3 rounded-full flex items-center justify-center" style={{ backgroundColor: rubro.color }}>
                    <CheckCircle2 className="h-2 w-2 text-white" />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {selectedRubro && (
        <div>
          <p className="text-xs font-medium mb-2" style={{ color: theme.text }}>Trámites de {selectedRubro}:</p>
          <div className="flex gap-2 overflow-x-auto pb-2" style={{ scrollbarWidth: 'thin' }}>
            {serviciosDelRubro.map((s) => {
              const isSelected = formData.servicio_id === String(s.id);
              const color = s.color || theme.primary;
              return (
                <button
                  key={s.id}
                  onClick={() => setFormData(prev => ({ ...prev, servicio_id: String(s.id) }))}
                  className="relative flex-shrink-0 p-2 rounded-lg border-2 text-center"
                  style={{ backgroundColor: isSelected ? `${color}20` : theme.backgroundSecondary, borderColor: isSelected ? color : theme.border, width: '90px' }}
                >
                  <div className="w-7 h-7 rounded-full mx-auto mb-1 flex items-center justify-center" style={{ backgroundColor: isSelected ? color : `${color}30`, color: isSelected ? 'white' : color }}>
                    {getServicioIcon(s.icono)}
                  </div>
                  <span className="text-[9px] font-medium block line-clamp-2" style={{ color: theme.text }}>{s.nombre}</span>
                  <div className="text-[8px]" style={{ color: theme.textSecondary }}>{s.tiempo_estimado_dias}d · {s.costo ? `$${(s.costo/1000).toFixed(0)}k` : 'Gratis'}</div>
                  {isSelected && (
                    <div className="absolute top-0.5 right-0.5 w-3 h-3 rounded-full flex items-center justify-center" style={{ backgroundColor: color }}>
                      <CheckCircle2 className="h-2 w-2 text-white" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {selectedServicio && (
        <div className="p-3 rounded-xl" style={{ backgroundColor: `${selectedServicio.color || theme.primary}15`, border: `2px solid ${selectedServicio.color || theme.primary}` }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: selectedServicio.color || theme.primary }}>
              <span className="text-white">{getServicioIcon(selectedServicio.icono)}</span>
            </div>
            <div className="flex-1">
              <p className="font-semibold text-sm" style={{ color: theme.text }}>{selectedServicio.nombre}</p>
              <p className="text-xs" style={{ color: theme.textSecondary }}>{selectedServicio.tiempo_estimado_dias} días · {selectedServicio.costo ? `$${selectedServicio.costo.toLocaleString()}` : 'Gratis'}</p>
            </div>
            <CheckCircle2 className="h-5 w-5" style={{ color: selectedServicio.color || theme.primary }} />
          </div>
        </div>
      )}
    </div>
  );

  // Step 2: Detalle
  const wizardStep2 = (
    <div className="space-y-4">
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

      <div className="space-y-2">
        <label className="text-sm font-medium" style={{ color: theme.text }}>Asunto <span className="text-red-500">*</span></label>
        <input
          type="text"
          placeholder="Ej: Solicitud de habilitación comercial para local de comidas"
          value={formData.asunto}
          onChange={(e) => setFormData(prev => ({ ...prev, asunto: e.target.value }))}
          className="w-full px-4 py-3 rounded-xl text-sm"
          style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}`, color: theme.text }}
        />
        <p className="text-xs" style={{ color: theme.textSecondary }}>Mínimo 10 caracteres ({formData.asunto.length}/10)</p>
      </div>

      <div className="space-y-2 relative">
        <label className="text-sm font-medium" style={{ color: theme.text }}>Dirección</label>
        <div className="relative">
          <input
            type="text"
            placeholder="Escribí para buscar direcciones..."
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

        {/* Sugerencias de direcciones */}
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
                className="w-full px-4 py-2.5 text-left text-sm hover:bg-black/5 transition-colors"
                style={{ color: theme.text }}
              >
                {suggestion.display_name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium" style={{ color: theme.text }}>Observaciones para el trámite</label>
        <textarea
          placeholder="Información adicional que consideres relevante..."
          value={formData.observaciones}
          onChange={(e) => setFormData(prev => ({ ...prev, observaciones: e.target.value }))}
          rows={2}
          className="w-full px-4 py-3 rounded-xl text-sm resize-none"
          style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}`, color: theme.text }}
        />
      </div>
    </div>
  );

  // Step 3: Contacto
  const wizardStep3 = (
    <div className="space-y-4">
      {/* Resumen del trámite */}
      {selectedServicio && (
        <div className="p-4 rounded-xl" style={{ backgroundColor: `${selectedServicio.color || theme.primary}10`, border: `1px solid ${selectedServicio.color || theme.primary}30` }}>
          <p className="text-xs font-medium mb-2" style={{ color: theme.textSecondary }}>Resumen del trámite</p>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: selectedServicio.color || theme.primary, color: 'white' }}>
                {getServicioIcon(selectedServicio.icono)}
              </div>
              <div>
                <p className="font-medium text-sm" style={{ color: theme.text }}>{selectedServicio.nombre}</p>
                <p className="text-xs" style={{ color: theme.textSecondary }}>{selectedServicio.tiempo_estimado_dias} días · {selectedServicio.costo ? `$${selectedServicio.costo.toLocaleString()}` : 'Gratuito'}</p>
              </div>
            </div>
            <div className="pt-2 border-t" style={{ borderColor: theme.border }}>
              <p className="text-xs" style={{ color: theme.textSecondary }}>Asunto:</p>
              <p className="text-sm font-medium" style={{ color: theme.text }}>{formData.asunto}</p>
            </div>
            {formData.direccion && (
              <div>
                <p className="text-xs" style={{ color: theme.textSecondary }}>Dirección:</p>
                <p className="text-sm" style={{ color: theme.text }}>{formData.direccion}</p>
              </div>
            )}
            {formData.observaciones && (
              <div>
                <p className="text-xs" style={{ color: theme.textSecondary }}>Observaciones:</p>
                <p className="text-sm" style={{ color: theme.text }}>{formData.observaciones}</p>
              </div>
            )}
          </div>
        </div>
      )}

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
          <p className="text-sm" style={{ color: theme.textSecondary }}>El trámite quedará asociado a tu cuenta.</p>
        </div>
      ) : (
        <>
          <div className="flex gap-2 p-1 rounded-xl" style={{ backgroundColor: theme.backgroundSecondary }}>
            <button
              onClick={() => setIsAnonymous(true)}
              className="flex-1 py-2 px-3 rounded-lg text-sm font-medium"
              style={{ backgroundColor: isAnonymous ? theme.card : 'transparent', color: isAnonymous ? theme.primary : theme.textSecondary }}
            >
              Sin cuenta
            </button>
            <button
              onClick={() => setIsAnonymous(false)}
              className="flex-1 py-2 px-3 rounded-lg text-sm font-medium"
              style={{ backgroundColor: !isAnonymous ? theme.card : 'transparent', color: !isAnonymous ? theme.primary : theme.textSecondary }}
            >
              Crear cuenta
            </button>
          </div>

          {isAnonymous ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium mb-1 block" style={{ color: theme.textSecondary }}>Nombre</label>
                  <input type="text" placeholder="Tu nombre" value={formData.nombre_solicitante} onChange={(e) => setFormData(prev => ({ ...prev, nombre_solicitante: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg text-sm" style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}`, color: theme.text }} />
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 block" style={{ color: theme.textSecondary }}>Apellido</label>
                  <input type="text" placeholder="Tu apellido" value={formData.apellido_solicitante} onChange={(e) => setFormData(prev => ({ ...prev, apellido_solicitante: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg text-sm" style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}`, color: theme.text }} />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: theme.textSecondary }}>Email <span className="text-red-500">*</span></label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: theme.textSecondary }} />
                  <input type="email" placeholder="tu@email.com" value={formData.email_solicitante} onChange={(e) => setFormData(prev => ({ ...prev, email_solicitante: e.target.value }))} className="w-full pl-10 pr-4 py-2.5 rounded-lg text-sm" style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}`, color: theme.text }} />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: theme.textSecondary }}>Teléfono</label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: theme.textSecondary }} />
                  <input type="tel" placeholder="1123456789" value={formData.telefono_solicitante} onChange={(e) => setFormData(prev => ({ ...prev, telefono_solicitante: e.target.value }))} className="w-full pl-10 pr-4 py-2.5 rounded-lg text-sm" style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}`, color: theme.text }} />
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: theme.textSecondary }}>Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: theme.textSecondary }} />
                  <input type="email" placeholder="tu@email.com" value={registerData.email} onChange={(e) => handleEmailChange(e.target.value)} className="w-full pl-10 pr-10 py-2.5 rounded-lg text-sm" style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}`, color: theme.text }} />
                  {checkingEmail && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin" style={{ color: theme.textSecondary }} />}
                </div>
                {emailExists === true && <p className="text-xs mt-1" style={{ color: theme.primary }}>Ya tenés cuenta. Ingresá tu contraseña.</p>}
                {emailExists === false && <p className="text-xs mt-1" style={{ color: '#10b981' }}>Email disponible. Completá tus datos.</p>}
              </div>
              {emailExists === false && (
                <div>
                  <label className="text-xs font-medium mb-1 block" style={{ color: theme.textSecondary }}>Nombre</label>
                  <input type="text" placeholder="Tu nombre" value={registerData.nombre} onChange={(e) => setRegisterData(prev => ({ ...prev, nombre: e.target.value }))} className="w-full px-4 py-2.5 rounded-lg text-sm" style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}`, color: theme.text }} />
                </div>
              )}
              {(emailExists === true || emailExists === false) && (
                <div>
                  <label className="text-xs font-medium mb-1 block" style={{ color: theme.textSecondary }}>Contraseña</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: theme.textSecondary }} />
                    <input type="password" placeholder={emailExists ? 'Tu contraseña' : 'Crea una contraseña'} value={registerData.password} onChange={(e) => setRegisterData(prev => ({ ...prev, password: e.target.value }))} className="w-full pl-10 pr-4 py-2.5 rounded-lg text-sm" style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}`, color: theme.text }} />
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );

  const wizardSteps = [
    { id: 'servicio', title: 'Servicio', description: 'Selecciona el trámite', icon: <FolderOpen className="h-5 w-5" />, content: wizardStep1, isValid: isStep1Valid },
    { id: 'detalle', title: 'Detalle', description: 'Describe tu solicitud', icon: <FileText className="h-5 w-5" />, content: wizardStep2, isValid: isStep2Valid },
    { id: 'contacto', title: 'Contacto', description: 'Datos de contacto', icon: <User className="h-5 w-5" />, content: wizardStep3, isValid: isStep3Valid },
  ];

  const wizardAIPanel = (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: `${theme.primary}20` }}>
          <Sparkles className="h-4 w-4" style={{ color: theme.primary }} />
        </div>
        <span className="font-medium text-sm" style={{ color: theme.text }}>Asistente IA</span>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto">
        {/* Info dinámica del servicio seleccionado */}
        {selectedServicio && (
          <div className="space-y-3">
            {/* Header del servicio */}
            <div className="p-3 rounded-lg" style={{ backgroundColor: `${selectedServicio.color || theme.primary}15`, border: `1px solid ${selectedServicio.color || theme.primary}30` }}>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: selectedServicio.color || theme.primary, color: 'white' }}>
                  {getServicioIcon(selectedServicio.icono)}
                </div>
                <div className="flex-1">
                  <span className="font-medium text-sm block" style={{ color: theme.text }}>{selectedServicio.nombre}</span>
                  <span className="text-xs" style={{ color: theme.textSecondary }}>
                    {selectedServicio.descripcion?.replace(/^\[[^\]]+\]\s*/, '')}
                  </span>
                </div>
              </div>
            </div>

            {/* Tiempo y costo */}
            <div className="grid grid-cols-2 gap-2">
              <div className="p-2 rounded-lg text-center" style={{ backgroundColor: theme.card }}>
                <Clock className="h-4 w-4 mx-auto mb-1" style={{ color: theme.primary }} />
                <p className="text-xs font-medium" style={{ color: theme.text }}>{selectedServicio.tiempo_estimado_dias} días</p>
                <p className="text-[10px]" style={{ color: theme.textSecondary }}>Tiempo estimado</p>
              </div>
              <div className="p-2 rounded-lg text-center" style={{ backgroundColor: theme.card }}>
                <CreditCard className="h-4 w-4 mx-auto mb-1" style={{ color: selectedServicio.costo ? '#f59e0b' : '#10b981' }} />
                <p className="text-xs font-medium" style={{ color: theme.text }}>
                  {selectedServicio.costo ? `$${selectedServicio.costo.toLocaleString()}` : 'Gratis'}
                </p>
                <p className="text-[10px]" style={{ color: theme.textSecondary }}>Costo</p>
              </div>
            </div>

            {/* Documentos requeridos */}
            {selectedServicio.documentos_requeridos && (
              <div className="p-3 rounded-lg" style={{ backgroundColor: theme.card }}>
                <div className="flex items-center gap-2 mb-2">
                  <FileText className="h-4 w-4" style={{ color: theme.primary }} />
                  <span className="font-medium text-xs" style={{ color: theme.text }}>Documentación requerida</span>
                </div>
                <ul className="space-y-1">
                  {selectedServicio.documentos_requeridos.split(',').map((doc, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-xs" style={{ color: theme.textSecondary }}>
                      <CheckCircle2 className="h-3 w-3 mt-0.5 flex-shrink-0" style={{ color: '#10b981' }} />
                      {doc.trim()}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Requisitos */}
            {selectedServicio.requisitos && selectedServicio.requisitos !== `Rubro: ${selectedServicio.descripcion?.match(/^\[([^\]]+)\]/)?.[1]}` && (
              <div className="p-3 rounded-lg" style={{ backgroundColor: theme.card }}>
                <div className="flex items-center gap-2 mb-2">
                  <Lightbulb className="h-4 w-4" style={{ color: '#f59e0b' }} />
                  <span className="font-medium text-xs" style={{ color: theme.text }}>Requisitos</span>
                </div>
                <p className="text-xs" style={{ color: theme.textSecondary }}>{selectedServicio.requisitos}</p>
              </div>
            )}
          </div>
        )}

        {/* Mensaje cuando no hay servicio seleccionado */}
        {!selectedServicio && wizardStep === 0 && (
          <div className="p-3 rounded-lg text-sm" style={{ backgroundColor: theme.card }}>
            <div className="flex items-start gap-2">
              <Lightbulb className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: theme.primary }} />
              <div>
                <p className="font-medium text-xs mb-1" style={{ color: theme.text }}>Selecciona un trámite</p>
                <p className="text-xs" style={{ color: theme.textSecondary }}>
                  Elegí una categoría y luego el trámite que necesitás. Acá verás toda la información del trámite seleccionado.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Tips según el paso */}
        {wizardStep === 1 && selectedServicio && (
          <div className="p-3 rounded-lg" style={{ backgroundColor: `${theme.primary}10`, border: `1px solid ${theme.primary}30` }}>
            <div className="flex items-start gap-2">
              <Lightbulb className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: theme.primary }} />
              <div>
                <p className="font-medium text-xs mb-1" style={{ color: theme.text }}>Tip para el asunto</p>
                <p className="text-xs" style={{ color: theme.textSecondary }}>
                  Sé específico. Por ejemplo: "Solicitud de habilitación para local de comidas en Av. San Martín 1234"
                </p>
              </div>
            </div>
          </div>
        )}

        {wizardStep === 2 && (
          <div className="p-3 rounded-lg" style={{ backgroundColor: `${theme.primary}10`, border: `1px solid ${theme.primary}30` }}>
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 className="h-4 w-4" style={{ color: theme.primary }} />
              <span className="font-medium text-sm" style={{ color: theme.text }}>Último paso</span>
            </div>
            <p className="text-xs" style={{ color: theme.textSecondary }}>
              Completá tus datos de contacto para recibir actualizaciones sobre tu trámite.
            </p>
          </div>
        )}

        {aiResponse && (
          <div className="p-3 rounded-lg text-sm" style={{ backgroundColor: `${theme.primary}10`, border: `1px solid ${theme.primary}30` }}>
            <div className="flex items-start gap-2">
              <Sparkles className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: theme.primary }} />
              <p style={{ color: theme.text }}>{aiResponse}</p>
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 p-3 rounded-lg flex items-center gap-2" style={{ backgroundColor: theme.card }}>
        <input
          type="text"
          value={aiQuestion}
          onChange={(e) => setAiQuestion(e.target.value)}
          onKeyDown={handleAiKeyDown}
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
          {aiLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
        </button>
      </div>
    </div>
  );

  return (
    <WizardModal
      open={open}
      onClose={handleClose}
      title="Nuevo Trámite"
      steps={wizardSteps}
      currentStep={wizardStep}
      onStepChange={setWizardStep}
      onComplete={handleCreate}
      loading={saving}
      completeLabel="Enviar Trámite"
      aiPanel={wizardAIPanel}
      headerBadge={selectedServicio ? {
        icon: getServicioIcon(selectedServicio.icono),
        label: selectedServicio.nombre,
        color: selectedServicio.color || theme.primary,
      } : undefined}
    />
  );
}

export default TramiteWizard;
