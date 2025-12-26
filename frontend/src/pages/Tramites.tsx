import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
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
  Clock,
  DollarSign,
  FileCheck,
  AlertCircle,
  Sparkles,
  ChevronRight,
  Store,
  Car,
  Map,
  TreeDeciduous,
  Users,
  Trash2,
  CalendarDays,
  Hash,
  BadgePercent,
  CreditCard,
  AlertTriangle,
  HardHat,
  Megaphone,
  Dog,
  ClipboardList,
  ArrowLeft,
  Copy,
  ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';
import { tramitesApi, authApi, chatApi } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { WizardForm, WizardStep, WizardStepContent } from '../components/ui/WizardForm';
import type { ServicioTramite } from '../types';

// Iconos por nombre de servicio
const servicioIcons: Record<string, React.ReactNode> = {
  'Store': <Store className="h-6 w-6" />,
  'FileCheck': <FileCheck className="h-6 w-6" />,
  'HardHat': <HardHat className="h-6 w-6" />,
  'Car': <Car className="h-6 w-6" />,
  'Map': <Map className="h-6 w-6" />,
  'Dog': <Dog className="h-6 w-6" />,
  'Megaphone': <Megaphone className="h-6 w-6" />,
  'TreeDeciduous': <TreeDeciduous className="h-6 w-6" />,
  'Users': <Users className="h-6 w-6" />,
  'Trash2': <Trash2 className="h-6 w-6" />,
  'CalendarDays': <CalendarDays className="h-6 w-6" />,
  'Hash': <Hash className="h-6 w-6" />,
  'BadgePercent': <BadgePercent className="h-6 w-6" />,
  'AlertTriangle': <AlertTriangle className="h-6 w-6" />,
  'CreditCard': <CreditCard className="h-6 w-6" />,
  'default': <FileText className="h-6 w-6" />,
};

function getServicioIcon(icono?: string): React.ReactNode {
  if (!icono) return servicioIcons.default;
  return servicioIcons[icono] || servicioIcons.default;
}

export default function Tramites() {
  const { theme } = useTheme();
  const { user, isLoading: authLoading, register, login } = useAuth();
  const navigate = useNavigate();
  const dataLoadedRef = useRef(false);

  const [currentStep, setCurrentStep] = useState(0);
  const [servicios, setServicios] = useState<ServicioTramite[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [registering, setRegistering] = useState(false);
  const [registerError, setRegisterError] = useState('');
  const [tramiteCreado, setTramiteCreado] = useState<{ numero: string } | null>(null);

  // Estado para sugerencia de IA sobre documentación
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<string | null>(null);

  // Datos del formulario
  const [formData, setFormData] = useState({
    servicio_id: '',
    asunto: '',
    descripcion: '',
    nombre_solicitante: '',
    apellido_solicitante: '',
    dni_solicitante: '',
    email_solicitante: '',
    telefono_solicitante: '',
    direccion_solicitante: '',
  });

  // Datos de registro (solo se usan si no hay usuario)
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

  const showOnlyRegister = !authLoading && !user;

  // Cargar servicios
  useEffect(() => {
    const fetchData = async () => {
      if (dataLoadedRef.current) return;
      dataLoadedRef.current = true;

      try {
        const res = await tramitesApi.getServicios();
        setServicios(res.data);
      } catch (error) {
        console.error('Error cargando servicios:', error);
        toast.error('Error al cargar servicios de trámites');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // Cuando se selecciona un servicio, obtener sugerencia de IA sobre documentación
  useEffect(() => {
    const getAiSuggestion = async () => {
      if (!formData.servicio_id) {
        setAiSuggestion(null);
        return;
      }

      const servicio = servicios.find(s => s.id === Number(formData.servicio_id));
      if (!servicio) return;

      setAiLoading(true);
      try {
        // Usar el chat para obtener una explicación amigable de los requisitos
        const prompt = `El usuario quiere iniciar el trámite "${servicio.nombre}".
Requisitos oficiales: ${servicio.requisitos || 'No especificados'}
Documentos requeridos: ${servicio.documentos_requeridos || 'No especificados'}
Tiempo estimado: ${servicio.tiempo_estimado_dias} días
Costo: ${servicio.costo ? `$${servicio.costo}` : 'Gratuito'}

Explícale de forma breve y amigable qué documentación necesita preparar y qué esperar del trámite. Máximo 3 oraciones.`;

        const response = await chatApi.sendMessage(prompt, []);
        setAiSuggestion(response.response || response.message);
      } catch (error) {
        // Si falla el chat, mostrar los requisitos directamente
        console.error('Error obteniendo sugerencia IA:', error);
        if (servicio.requisitos || servicio.documentos_requeridos) {
          setAiSuggestion(`Documentos necesarios: ${servicio.documentos_requeridos || servicio.requisitos}`);
        }
      } finally {
        setAiLoading(false);
      }
    };

    getAiSuggestion();
  }, [formData.servicio_id, servicios]);

  // Verificar si email existe (para login/register)
  const checkEmail = async (email: string) => {
    if (!email || email.length < 5) {
      setEmailExists(null);
      return;
    }

    setCheckingEmail(true);
    try {
      const res = await authApi.checkEmail(email);
      setEmailExists(res.data.exists);
    } catch (error) {
      console.error('Error verificando email:', error);
      setEmailExists(null);
    } finally {
      setCheckingEmail(false);
    }
  };

  const handleEmailChange = (email: string) => {
    setRegisterData(prev => ({ ...prev, email }));
    setEmailExists(null);

    if (emailCheckTimeoutRef.current) {
      clearTimeout(emailCheckTimeoutRef.current);
    }

    emailCheckTimeoutRef.current = setTimeout(() => {
      checkEmail(email);
    }, 500);
  };

  // Servicios favoritos y no favoritos
  const serviciosFavoritos = servicios.filter(s => s.favorito);
  const serviciosNoFavoritos = servicios.filter(s => !s.favorito);

  // Filtrar servicios no favoritos por búsqueda
  const filteredServicios = searchTerm.trim()
    ? serviciosNoFavoritos.filter(s =>
        s.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (s.descripcion && s.descripcion.toLowerCase().includes(searchTerm.toLowerCase()))
      )
    : [];

  const selectedServicio = servicios.find(s => s.id === Number(formData.servicio_id));

  // Validaciones por paso
  const isStep1Valid = !!formData.servicio_id;
  const isStep2Valid = formData.asunto.trim().length >= 10;
  const isStep3Valid = user ? true : (
    isAnonymous
      ? !!(formData.email_solicitante || formData.telefono_solicitante)
      : !!(registerData.email && registerData.password && (emailExists === false ? registerData.nombre : true))
  );

  // Manejar envío
  const handleSubmit = async () => {
    setSubmitting(true);
    setRegisterError('');

    try {
      // Si no hay usuario y no es anónimo, registrar o loguear
      if (!user && !isAnonymous) {
        if (emailExists === false) {
          // Registrar nuevo usuario
          await register({
            email: registerData.email,
            password: registerData.password,
            nombre: registerData.nombre,
            apellido: '',
            telefono: registerData.telefono,
          });
        } else if (emailExists === true) {
          // Loguear usuario existente
          await login(registerData.email, registerData.password);
        }
      }

      // Preparar datos del trámite
      const tramiteData: Record<string, unknown> = {
        servicio_id: Number(formData.servicio_id),
        asunto: formData.asunto,
        descripcion: formData.descripcion || undefined,
      };

      // Si es anónimo o no hay usuario, agregar datos de contacto
      if (!user || isAnonymous) {
        tramiteData.nombre_solicitante = formData.nombre_solicitante || registerData.nombre;
        tramiteData.apellido_solicitante = formData.apellido_solicitante;
        tramiteData.dni_solicitante = formData.dni_solicitante;
        tramiteData.email_solicitante = formData.email_solicitante || registerData.email;
        tramiteData.telefono_solicitante = formData.telefono_solicitante || registerData.telefono;
        tramiteData.direccion_solicitante = formData.direccion_solicitante;
      }

      const res = await tramitesApi.create(tramiteData);
      setTramiteCreado({ numero: res.data.numero_tramite });
      toast.success('Trámite iniciado correctamente');
    } catch (error: unknown) {
      console.error('Error creando trámite:', error);
      const err = error as { response?: { data?: { detail?: string } } };
      const message = err.response?.data?.detail || 'Error al iniciar el trámite';
      setRegisterError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  // Si ya se creó el trámite, mostrar pantalla de éxito
  if (tramiteCreado) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: theme.background }}>
        <div
          className="max-w-md w-full rounded-2xl p-8 text-center"
          style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
        >
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6"
            style={{ backgroundColor: '#10b98120' }}
          >
            <CheckCircle2 className="h-10 w-10" style={{ color: '#10b981' }} />
          </div>
          <h2 className="text-2xl font-bold mb-2" style={{ color: theme.text }}>
            Trámite Iniciado
          </h2>
          <p className="text-sm mb-6" style={{ color: theme.textSecondary }}>
            Tu trámite ha sido registrado exitosamente
          </p>

          <div
            className="p-4 rounded-xl mb-6"
            style={{ backgroundColor: theme.backgroundSecondary }}
          >
            <p className="text-xs mb-1" style={{ color: theme.textSecondary }}>
              Número de trámite
            </p>
            <div className="flex items-center justify-center gap-2">
              <p className="text-xl font-mono font-bold" style={{ color: theme.primary }}>
                {tramiteCreado.numero}
              </p>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(tramiteCreado.numero);
                  toast.success('Número copiado');
                }}
                className="p-1.5 rounded-lg transition-all hover:scale-110"
                style={{ backgroundColor: `${theme.primary}15` }}
              >
                <Copy className="h-4 w-4" style={{ color: theme.primary }} />
              </button>
            </div>
          </div>

          <p className="text-sm mb-6" style={{ color: theme.textSecondary }}>
            Guardá este número para consultar el estado de tu trámite.
            Te notificaremos por email cuando haya novedades.
          </p>

          <div className="flex flex-col gap-3">
            <button
              onClick={() => navigate('/app')}
              className="w-full py-3 rounded-xl font-semibold transition-all hover:scale-105"
              style={{
                background: `linear-gradient(135deg, ${theme.primary}, ${theme.primaryHover})`,
                color: '#ffffff',
              }}
            >
              Volver al Inicio
            </button>
            <button
              onClick={() => {
                setTramiteCreado(null);
                setFormData({
                  servicio_id: '',
                  asunto: '',
                  descripcion: '',
                  nombre_solicitante: '',
                  apellido_solicitante: '',
                  dni_solicitante: '',
                  email_solicitante: '',
                  telefono_solicitante: '',
                  direccion_solicitante: '',
                });
                setCurrentStep(0);
              }}
              className="w-full py-3 rounded-xl font-medium transition-all"
              style={{ color: theme.textSecondary, border: `1px solid ${theme.border}` }}
            >
              Iniciar otro trámite
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: theme.background }}>
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: theme.primary }} />
      </div>
    );
  }

  // Definir los pasos del wizard
  const wizardSteps: WizardStep[] = [
    {
      id: 'servicio',
      label: 'Servicio',
      icon: <ClipboardList className="h-4 w-4" />,
      isValid: isStep1Valid,
      content: (
        <WizardStepContent
          title="Selecciona el trámite"
          description="Elige el tipo de trámite que necesitas realizar"
        >
          {/* Servicios favoritos como botones grandes */}
          {serviciosFavoritos.length > 0 && (
            <div className="mb-6">
              <p className="text-xs font-medium mb-3" style={{ color: theme.textSecondary }}>
                Trámites frecuentes
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {serviciosFavoritos.map((servicio) => (
                  <button
                    key={servicio.id}
                    onClick={() => {
                      setFormData(prev => ({ ...prev, servicio_id: String(servicio.id) }));
                      setSearchTerm('');
                    }}
                    className={`relative p-4 rounded-xl text-center transition-all hover:scale-[1.03] hover:shadow-lg ${
                      formData.servicio_id === String(servicio.id) ? 'ring-2 ring-offset-2' : ''
                    }`}
                    style={{
                      backgroundColor: formData.servicio_id === String(servicio.id)
                        ? `${servicio.color || theme.primary}20`
                        : theme.backgroundSecondary,
                      border: `2px solid ${formData.servicio_id === String(servicio.id)
                        ? servicio.color || theme.primary
                        : 'transparent'}`,
                      ['--tw-ring-color' as string]: servicio.color || theme.primary,
                    }}
                  >
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-2"
                      style={{
                        background: `linear-gradient(135deg, ${servicio.color || theme.primary}30, ${servicio.color || theme.primary}10)`,
                      }}
                    >
                      <span style={{ color: servicio.color || theme.primary }}>
                        {getServicioIcon(servicio.icono)}
                      </span>
                    </div>
                    <p className="font-medium text-sm line-clamp-2" style={{ color: theme.text }}>
                      {servicio.nombre}
                    </p>
                    <div className="flex items-center justify-center gap-2 mt-2 text-xs" style={{ color: theme.textSecondary }}>
                      <span className="flex items-center gap-0.5">
                        <Clock className="h-3 w-3" />
                        {servicio.tiempo_estimado_dias}d
                      </span>
                      {servicio.costo ? (
                        <span className="flex items-center gap-0.5">
                          <DollarSign className="h-3 w-3" />
                          ${servicio.costo.toLocaleString()}
                        </span>
                      ) : (
                        <span style={{ color: '#10b981' }}>Gratis</span>
                      )}
                    </div>
                    {formData.servicio_id === String(servicio.id) && (
                      <div
                        className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: servicio.color || theme.primary }}
                      >
                        <CheckCircle2 className="h-3 w-3 text-white" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Buscador para otros trámites */}
          <div className="relative">
            <p className="text-xs font-medium mb-2" style={{ color: theme.textSecondary }}>
              Buscar otros trámites
            </p>
            <div className="relative">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4"
                style={{ color: theme.textSecondary }}
              />
              <input
                type="text"
                placeholder="Escribí para buscar..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-3 rounded-xl text-sm transition-all"
                style={{
                  backgroundColor: theme.backgroundSecondary,
                  border: `1px solid ${theme.border}`,
                  color: theme.text,
                }}
              />
            </div>

            {/* Resultados de búsqueda (autocomplete) */}
            {searchTerm.trim() && (
              <div
                className="absolute left-0 right-0 top-full mt-2 rounded-xl shadow-lg z-10 max-h-[300px] overflow-y-auto"
                style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
              >
                {filteredServicios.length > 0 ? (
                  filteredServicios.map((servicio) => (
                    <button
                      key={servicio.id}
                      onClick={() => {
                        setFormData(prev => ({ ...prev, servicio_id: String(servicio.id) }));
                        setSearchTerm('');
                      }}
                      className="w-full p-3 flex items-center gap-3 text-left hover:bg-black/5 transition-colors first:rounded-t-xl last:rounded-b-xl"
                      style={{
                        backgroundColor: formData.servicio_id === String(servicio.id)
                          ? `${servicio.color || theme.primary}10`
                          : 'transparent',
                      }}
                    >
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: `${servicio.color || theme.primary}20` }}
                      >
                        <span style={{ color: servicio.color || theme.primary }}>
                          {getServicioIcon(servicio.icono)}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm" style={{ color: theme.text }}>
                          {servicio.nombre}
                        </p>
                        <div className="flex items-center gap-3 text-xs" style={{ color: theme.textSecondary }}>
                          <span>{servicio.tiempo_estimado_dias} días</span>
                          <span>{servicio.costo ? `$${servicio.costo.toLocaleString()}` : 'Gratis'}</span>
                        </div>
                      </div>
                      {formData.servicio_id === String(servicio.id) && (
                        <CheckCircle2 className="h-4 w-4" style={{ color: servicio.color || theme.primary }} />
                      )}
                    </button>
                  ))
                ) : (
                  <div className="p-4 text-center" style={{ color: theme.textSecondary }}>
                    <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No se encontraron trámites</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Servicio seleccionado (si no es favorito) */}
          {selectedServicio && !selectedServicio.favorito && (
            <div
              className="mt-4 p-4 rounded-xl"
              style={{
                backgroundColor: `${selectedServicio.color || theme.primary}10`,
                border: `1px solid ${selectedServicio.color || theme.primary}30`,
              }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: `${selectedServicio.color || theme.primary}20` }}
                >
                  <span style={{ color: selectedServicio.color || theme.primary }}>
                    {getServicioIcon(selectedServicio.icono)}
                  </span>
                </div>
                <div className="flex-1">
                  <p className="font-medium" style={{ color: theme.text }}>{selectedServicio.nombre}</p>
                  <div className="flex items-center gap-3 text-xs" style={{ color: theme.textSecondary }}>
                    <span>{selectedServicio.tiempo_estimado_dias} días</span>
                    <span>{selectedServicio.costo ? `$${selectedServicio.costo.toLocaleString()}` : 'Gratis'}</span>
                  </div>
                </div>
                <CheckCircle2 className="h-5 w-5" style={{ color: selectedServicio.color || theme.primary }} />
              </div>
            </div>
          )}
        </WizardStepContent>
      ),
    },
    {
      id: 'detalle',
      label: 'Detalle',
      icon: <FileText className="h-4 w-4" />,
      isValid: isStep2Valid,
      content: (
        <WizardStepContent
          title="Detalla tu solicitud"
          description={selectedServicio ? `Trámite: ${selectedServicio.nombre}` : 'Describe tu solicitud'}
        >
          {/* Info del servicio seleccionado */}
          {selectedServicio && (
            <div
              className="p-4 rounded-xl mb-4"
              style={{ backgroundColor: `${selectedServicio.color || theme.primary}10`, border: `1px solid ${selectedServicio.color || theme.primary}30` }}
            >
              <div className="flex items-center gap-3 mb-3">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: `${selectedServicio.color || theme.primary}20` }}
                >
                  <span style={{ color: selectedServicio.color || theme.primary }}>
                    {getServicioIcon(selectedServicio.icono)}
                  </span>
                </div>
                <div>
                  <p className="font-medium" style={{ color: theme.text }}>{selectedServicio.nombre}</p>
                  <p className="text-xs" style={{ color: theme.textSecondary }}>
                    {selectedServicio.tiempo_estimado_dias} días estimados
                    {selectedServicio.costo ? ` · $${selectedServicio.costo.toLocaleString()}` : ' · Gratuito'}
                  </p>
                </div>
              </div>

              {/* Requisitos */}
              {(selectedServicio.requisitos || selectedServicio.documentos_requeridos) && (
                <div className="text-xs space-y-1" style={{ color: theme.textSecondary }}>
                  {selectedServicio.documentos_requeridos && (
                    <p><strong>Documentos:</strong> {selectedServicio.documentos_requeridos}</p>
                  )}
                </div>
              )}

              {selectedServicio.url_externa && (
                <a
                  href={selectedServicio.url_externa}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs mt-2 hover:underline"
                  style={{ color: selectedServicio.color || theme.primary }}
                >
                  <ExternalLink className="h-3 w-3" />
                  Más información
                </a>
              )}
            </div>
          )}

          {/* Asunto */}
          <div className="space-y-2 mb-4">
            <label className="text-sm font-medium" style={{ color: theme.text }}>
              Asunto <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              placeholder="Ej: Solicitud de habilitación comercial para local de comidas"
              value={formData.asunto}
              onChange={(e) => setFormData(prev => ({ ...prev, asunto: e.target.value }))}
              className="w-full px-4 py-3 rounded-xl text-sm transition-all"
              style={{
                backgroundColor: theme.backgroundSecondary,
                border: `1px solid ${theme.border}`,
                color: theme.text,
              }}
            />
            <p className="text-xs" style={{ color: theme.textSecondary }}>
              Mínimo 10 caracteres ({formData.asunto.length}/10)
            </p>
          </div>

          {/* Descripción */}
          <div className="space-y-2">
            <label className="text-sm font-medium" style={{ color: theme.text }}>
              Descripción adicional (opcional)
            </label>
            <textarea
              placeholder="Agrega detalles adicionales sobre tu solicitud..."
              value={formData.descripcion}
              onChange={(e) => setFormData(prev => ({ ...prev, descripcion: e.target.value }))}
              rows={4}
              className="w-full px-4 py-3 rounded-xl text-sm transition-all resize-none"
              style={{
                backgroundColor: theme.backgroundSecondary,
                border: `1px solid ${theme.border}`,
                color: theme.text,
              }}
            />
          </div>
        </WizardStepContent>
      ),
    },
    {
      id: 'contacto',
      label: 'Contacto',
      icon: <User className="h-4 w-4" />,
      isValid: isStep3Valid,
      content: (
        <WizardStepContent
          title={user ? 'Confirmar datos' : 'Datos de contacto'}
          description={user ? 'Tu trámite quedará asociado a tu cuenta' : 'Para poder notificarte sobre el estado del trámite'}
        >
          {user ? (
            // Usuario logueado - mostrar sus datos
            <div
              className="p-4 rounded-xl"
              style={{ backgroundColor: '#10b98110', border: '1px solid #10b98130' }}
            >
              <div className="flex items-center gap-3 mb-3">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: '#10b98120' }}
                >
                  <ShieldCheck className="h-5 w-5" style={{ color: '#10b981' }} />
                </div>
                <div>
                  <p className="font-medium" style={{ color: theme.text }}>
                    {user.nombre} {user.apellido}
                  </p>
                  <p className="text-xs" style={{ color: theme.textSecondary }}>{user.email}</p>
                </div>
              </div>
              <p className="text-sm" style={{ color: theme.textSecondary }}>
                El trámite quedará asociado a tu cuenta y podrás seguir su estado desde "Mis Trámites".
              </p>
            </div>
          ) : (
            // Usuario no logueado - opción anónimo o registro
            <div className="space-y-4">
              {/* Toggle anónimo/registrarse */}
              <div className="flex gap-2 p-1 rounded-xl" style={{ backgroundColor: theme.backgroundSecondary }}>
                <button
                  onClick={() => setIsAnonymous(true)}
                  className="flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all"
                  style={{
                    backgroundColor: isAnonymous ? theme.card : 'transparent',
                    color: isAnonymous ? theme.primary : theme.textSecondary,
                    boxShadow: isAnonymous ? '0 2px 8px rgba(0,0,0,0.1)' : 'none',
                  }}
                >
                  Continuar sin cuenta
                </button>
                <button
                  onClick={() => setIsAnonymous(false)}
                  className="flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all"
                  style={{
                    backgroundColor: !isAnonymous ? theme.card : 'transparent',
                    color: !isAnonymous ? theme.primary : theme.textSecondary,
                    boxShadow: !isAnonymous ? '0 2px 8px rgba(0,0,0,0.1)' : 'none',
                  }}
                >
                  Crear cuenta
                </button>
              </div>

              {isAnonymous ? (
                // Formulario anónimo
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium mb-1 block" style={{ color: theme.textSecondary }}>
                        Nombre
                      </label>
                      <input
                        type="text"
                        placeholder="Tu nombre"
                        value={formData.nombre_solicitante}
                        onChange={(e) => setFormData(prev => ({ ...prev, nombre_solicitante: e.target.value }))}
                        className="w-full px-3 py-2.5 rounded-lg text-sm"
                        style={{
                          backgroundColor: theme.backgroundSecondary,
                          border: `1px solid ${theme.border}`,
                          color: theme.text,
                        }}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium mb-1 block" style={{ color: theme.textSecondary }}>
                        Apellido
                      </label>
                      <input
                        type="text"
                        placeholder="Tu apellido"
                        value={formData.apellido_solicitante}
                        onChange={(e) => setFormData(prev => ({ ...prev, apellido_solicitante: e.target.value }))}
                        className="w-full px-3 py-2.5 rounded-lg text-sm"
                        style={{
                          backgroundColor: theme.backgroundSecondary,
                          border: `1px solid ${theme.border}`,
                          color: theme.text,
                        }}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-medium mb-1 block" style={{ color: theme.textSecondary }}>
                      Email <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <Mail
                        className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4"
                        style={{ color: theme.textSecondary }}
                      />
                      <input
                        type="email"
                        placeholder="tu@email.com"
                        value={formData.email_solicitante}
                        onChange={(e) => setFormData(prev => ({ ...prev, email_solicitante: e.target.value }))}
                        className="w-full pl-10 pr-4 py-2.5 rounded-lg text-sm"
                        style={{
                          backgroundColor: theme.backgroundSecondary,
                          border: `1px solid ${theme.border}`,
                          color: theme.text,
                        }}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-medium mb-1 block" style={{ color: theme.textSecondary }}>
                      Teléfono
                    </label>
                    <div className="relative">
                      <Phone
                        className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4"
                        style={{ color: theme.textSecondary }}
                      />
                      <input
                        type="tel"
                        placeholder="1123456789"
                        value={formData.telefono_solicitante}
                        onChange={(e) => setFormData(prev => ({ ...prev, telefono_solicitante: e.target.value }))}
                        className="w-full pl-10 pr-4 py-2.5 rounded-lg text-sm"
                        style={{
                          backgroundColor: theme.backgroundSecondary,
                          border: `1px solid ${theme.border}`,
                          color: theme.text,
                        }}
                      />
                    </div>
                  </div>

                  <p className="text-xs" style={{ color: theme.textSecondary }}>
                    <AlertCircle className="h-3 w-3 inline mr-1" />
                    Necesitamos al menos email o teléfono para contactarte sobre tu trámite.
                  </p>
                </div>
              ) : (
                // Formulario de registro/login
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-medium mb-1 block" style={{ color: theme.textSecondary }}>
                      Email
                    </label>
                    <div className="relative">
                      <Mail
                        className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4"
                        style={{ color: theme.textSecondary }}
                      />
                      <input
                        type="email"
                        placeholder="tu@email.com"
                        value={registerData.email}
                        onChange={(e) => handleEmailChange(e.target.value)}
                        className="w-full pl-10 pr-10 py-2.5 rounded-lg text-sm"
                        style={{
                          backgroundColor: theme.backgroundSecondary,
                          border: `1px solid ${theme.border}`,
                          color: theme.text,
                        }}
                      />
                      {checkingEmail && (
                        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin" style={{ color: theme.textSecondary }} />
                      )}
                    </div>
                    {emailExists === true && (
                      <p className="text-xs mt-1" style={{ color: theme.primary }}>
                        <User className="h-3 w-3 inline mr-1" />
                        Ya tenés cuenta. Ingresá tu contraseña para continuar.
                      </p>
                    )}
                    {emailExists === false && (
                      <p className="text-xs mt-1" style={{ color: '#10b981' }}>
                        <CheckCircle2 className="h-3 w-3 inline mr-1" />
                        Email disponible. Completá tus datos para crear tu cuenta.
                      </p>
                    )}
                  </div>

                  {emailExists === false && (
                    <div>
                      <label className="text-xs font-medium mb-1 block" style={{ color: theme.textSecondary }}>
                        Nombre
                      </label>
                      <input
                        type="text"
                        placeholder="Tu nombre"
                        value={registerData.nombre}
                        onChange={(e) => setRegisterData(prev => ({ ...prev, nombre: e.target.value }))}
                        className="w-full px-4 py-2.5 rounded-lg text-sm"
                        style={{
                          backgroundColor: theme.backgroundSecondary,
                          border: `1px solid ${theme.border}`,
                          color: theme.text,
                        }}
                      />
                    </div>
                  )}

                  {(emailExists === true || emailExists === false) && (
                    <div>
                      <label className="text-xs font-medium mb-1 block" style={{ color: theme.textSecondary }}>
                        Contraseña
                      </label>
                      <div className="relative">
                        <Lock
                          className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4"
                          style={{ color: theme.textSecondary }}
                        />
                        <input
                          type="password"
                          placeholder={emailExists ? 'Tu contraseña' : 'Crea una contraseña'}
                          value={registerData.password}
                          onChange={(e) => setRegisterData(prev => ({ ...prev, password: e.target.value }))}
                          className="w-full pl-10 pr-4 py-2.5 rounded-lg text-sm"
                          style={{
                            backgroundColor: theme.backgroundSecondary,
                            border: `1px solid ${theme.border}`,
                            color: theme.text,
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {registerError && (
                    <p className="text-xs text-red-500">
                      <AlertCircle className="h-3 w-3 inline mr-1" />
                      {registerError}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </WizardStepContent>
      ),
    },
  ];

  return (
    <div className="min-h-screen p-4" style={{ backgroundColor: theme.background }}>
      <div className="max-w-2xl mx-auto">
        <WizardForm
          steps={wizardSteps}
          currentStep={currentStep}
          onStepChange={setCurrentStep}
          onComplete={handleSubmit}
          onCancel={() => navigate(-1)}
          saving={submitting}
          title="Iniciar Trámite"
          subtitle="Gestioná tus trámites municipales online"
          completeLabel="Enviar Trámite"
          aiSuggestion={
            aiLoading || aiSuggestion
              ? {
                  loading: aiLoading,
                  title: 'Asistente Municipal',
                  message: aiSuggestion || undefined,
                }
              : undefined
          }
        />
      </div>
    </div>
  );
}
