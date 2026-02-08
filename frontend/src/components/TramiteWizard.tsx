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
  ClipboardList,
  FileStack,
  Info,
  Paperclip,
  X,
  Upload,
  File,
  Image,
  Bot,
  MessageCircle,
  ArrowRight,
  ScanFace,
  Camera,
} from 'lucide-react';
import { toast } from 'sonner';
import { tramitesApi, authApi, chatApi, clasificacionApi } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { WizardModal } from './ui/WizardModal';
import { VoiceInput } from './ui/VoiceInput';
import type { ServicioTramite, TipoTramite } from '../types';

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

// Función para formatear la respuesta de IA con íconos y secciones
function formatAIResponse(response: string, theme: { text: string; textSecondary: string; primary: string }) {
  // Detectar secciones por patrones comunes
  const lines = response.split('\n');
  const sections: { title: string; icon: React.ReactNode; items: string[] }[] = [];
  let currentSection: { title: string; icon: React.ReactNode; items: string[] } | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Detectar títulos de sección (con ** o sin)
    const titleMatch = trimmed.match(/^\*?\*?(Requisitos|Documentos|Tips?|Importante|Nota).*?\*?\*?:?$/i) ||
                       trimmed.match(/^\*?\*?(Requisitos|Documentos|Tips?|Importante|Nota)[^:]*:?\*?\*?$/i);

    if (titleMatch || trimmed.toLowerCase().includes('requisitos') && trimmed.includes('**')) {
      // Guardar sección anterior si existe
      if (currentSection && currentSection.items.length > 0) {
        sections.push(currentSection);
      }

      // Determinar ícono según tipo de sección
      let icon: React.ReactNode;
      const lowerTitle = trimmed.toLowerCase();
      if (lowerTitle.includes('requisito')) {
        icon = <ClipboardList className="h-3.5 w-3.5" />;
      } else if (lowerTitle.includes('documento')) {
        icon = <FileStack className="h-3.5 w-3.5" />;
      } else if (lowerTitle.includes('tip')) {
        icon = <Lightbulb className="h-3.5 w-3.5" />;
      } else {
        icon = <Info className="h-3.5 w-3.5" />;
      }

      currentSection = {
        title: trimmed.replace(/\*\*/g, '').replace(/:$/, ''),
        icon,
        items: []
      };
    } else if (trimmed.startsWith('-') || trimmed.startsWith('•')) {
      // Es un item de lista
      const itemText = trimmed.replace(/^[-•]\s*/, '');
      if (currentSection) {
        currentSection.items.push(itemText);
      } else {
        // Item sin sección, crear una genérica
        currentSection = {
          title: 'Información',
          icon: <Info className="h-3.5 w-3.5" />,
          items: [itemText]
        };
      }
    } else if (currentSection) {
      // Texto que no es item, agregarlo como item
      currentSection.items.push(trimmed);
    }
  }

  // Agregar última sección
  if (currentSection && currentSection.items.length > 0) {
    sections.push(currentSection);
  }

  // Si no se detectaron secciones, mostrar como texto simple
  if (sections.length === 0) {
    return (
      <p className="text-xs whitespace-pre-wrap" style={{ color: theme.text }}>
        {response}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {sections.map((section, idx) => (
        <div key={idx}>
          <div className="flex items-center gap-1.5 mb-1">
            <span style={{ color: theme.primary }}>{section.icon}</span>
            <span className="font-semibold text-xs" style={{ color: theme.text }}>{section.title}</span>
          </div>
          <ul className="space-y-0.5 ml-5">
            {section.items.map((item, itemIdx) => (
              <li key={itemIdx} className="text-xs flex items-start gap-1.5" style={{ color: theme.textSecondary }}>
                <span className="mt-1.5 w-1 h-1 rounded-full flex-shrink-0" style={{ backgroundColor: theme.primary }} />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

interface TramiteWizardProps {
  open: boolean;
  onClose: () => void;
  servicios: ServicioTramite[];
  tipos?: TipoTramite[];
  onSuccess?: () => void;
  servicioInicial?: ServicioTramite | null; // Pre-seleccionar un servicio (desde chat)
}

interface Rubro {
  id: number;
  nombre: string;
  icono: string;
  color: string;
  servicios: ServicioTramite[];
}

export function TramiteWizard({ open, onClose, servicios, tipos = [], onSuccess, servicioInicial }: TramiteWizardProps) {
  const { theme } = useTheme();
  const { user, register, login, municipioActual } = useAuth();

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

  // Si viene un servicio inicial, pre-seleccionarlo y saltar al paso de detalle
  useEffect(() => {
    if (open && servicioInicial && tipos.length > 0) {
      // Seleccionar el servicio
      setFormData(prev => ({
        ...prev,
        servicio_id: String(servicioInicial.id),
        asunto: `Solicitud: ${servicioInicial.nombre}`,
      }));

      // Seleccionar el rubro (tipo/categoría) correspondiente
      const tipoDelServicio = tipos.find(t => t.id === servicioInicial.tipo_tramite_id);
      if (tipoDelServicio) {
        setSelectedRubro(tipoDelServicio.nombre);
      }

      setWizardStep(1); // Ir al paso de selección (paso 1) para que vea el trámite pre-seleccionado
    }
  }, [open, servicioInicial, tipos]);

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

  // Chat del paso 0 (asistente IA para clasificar trámite)
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<Array<{role: 'assistant' | 'user', content: string}>>([
    { role: 'assistant', content: '¡Hola! 👋 Soy tu asistente virtual. Contame, ¿qué trámite necesitás hacer?' }
  ]);
  const [chatAnalyzing, setChatAnalyzing] = useState(false);
  const [chatSugerencias, setChatSugerencias] = useState<Array<{tramite_id: number, tramite_nombre: string, confianza: number, tipo_tramite_id?: number, tipo_tramite_nombre?: string}>>([]);
  const chatInputRef = useRef<HTMLInputElement>(null);
  const chatMessagesEndRef = useRef<HTMLDivElement>(null);

  // IA contextual basada en lo que escribe el usuario
  const [contextualAiResponse, setContextualAiResponse] = useState('');
  const [contextualAiLoading, setContextualAiLoading] = useState(false);
  const [contextualAiFailed, setContextualAiFailed] = useState(false);
  const contextualAiTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Autocompletado de direcciones
  const [addressSuggestions, setAddressSuggestions] = useState<Array<{
    display_name: string;
    lat: string;
    lon: string;
  }>>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchingAddress, setSearchingAddress] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Ref para scroll de trámites
  const tramitesScrollRef = useRef<HTMLDivElement>(null);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Documentos adjuntos
  const [documentos, setDocumentos] = useState<File[]>([]);
  const [uploadingDocs, setUploadingDocs] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Validación facial
  const [facialValidated, setFacialValidated] = useState(false);
  const [facialValidating, setFacialValidating] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [pendingStream, setPendingStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // useEffect para asignar stream al video cuando ambos estén disponibles
  useEffect(() => {
    if (pendingStream && videoRef.current && cameraActive) {
      const video = videoRef.current;
      video.srcObject = pendingStream;
      streamRef.current = pendingStream;

      video.onloadedmetadata = () => {
        video.play().then(() => {
          setCameraReady(true);
          setPendingStream(null);
        }).catch(err => {
          console.error('Error playing video:', err);
          setCameraError('No se pudo iniciar la reproducción del video.');
        });
      };
    }
  }, [pendingStream, cameraActive]);

  // Buscar direcciones con Nominatim (OpenStreetMap)
  const searchAddress = useCallback(async (query: string) => {
    if (query.length < 3) {
      setAddressSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    setSearchingAddress(true);
    try {
      // Usar el nombre del municipio para filtrar la búsqueda
      const locationFilter = municipioActual?.nombre
        ? `${municipioActual.nombre}, Buenos Aires, Argentina`
        : 'Buenos Aires, Argentina';

      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}, ${encodeURIComponent(locationFilter)}&limit=5&addressdetails=1`
      );
      const data = await response.json();
      setAddressSuggestions(data);
      setShowSuggestions(data.length > 0);
    } catch (error) {
      console.error('Error buscando direcciones:', error);
    } finally {
      setSearchingAddress(false);
    }
  }, [municipioActual]);

  const handleAddressChange = (value: string) => {
    setFormData(prev => ({ ...prev, direccion: value }));
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    searchTimeoutRef.current = setTimeout(() => searchAddress(value), 300);
  };

  const selectAddressSuggestion = (suggestion: { display_name: string }) => {
    // Extraer número de calle de lo que escribió el usuario
    const userInput = formData.direccion;
    const numberMatch = userInput.match(/\d+/);
    const userNumber = numberMatch ? numberMatch[0] : null;

    let finalAddress = suggestion.display_name;

    // Si el usuario escribió un número y la sugerencia no lo contiene, insertarlo
    if (userNumber && !suggestion.display_name.includes(userNumber)) {
      // Buscar el nombre de la calle en la sugerencia (primera parte antes de la coma)
      const parts = suggestion.display_name.split(',');
      if (parts.length > 0) {
        const streetName = parts[0].trim();
        // Reemplazar el nombre de calle por "Calle Número"
        parts[0] = `${streetName} ${userNumber}`;
        finalAddress = parts.join(',');
      }
    }

    setFormData(prev => ({ ...prev, direccion: finalAddress }));
    setShowSuggestions(false);
    setAddressSuggestions([]);
  };

  // Manejar selección de archivos
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp', 'image/gif', 'application/pdf'];
    const maxSize = 10 * 1024 * 1024; // 10MB

    const validFiles: File[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!allowedTypes.includes(file.type)) {
        toast.error(`${file.name}: Tipo de archivo no permitido`);
        continue;
      }
      if (file.size > maxSize) {
        toast.error(`${file.name}: El archivo excede 10MB`);
        continue;
      }
      validFiles.push(file);
    }

    if (validFiles.length > 0) {
      setDocumentos(prev => [...prev, ...validFiles]);
    }

    // Limpiar input para permitir seleccionar el mismo archivo
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeDocumento = (index: number) => {
    setDocumentos(prev => prev.filter((_, i) => i !== index));
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  // Agrupar servicios por tipo (categoría)
  const rubros: Rubro[] = tipos
    .sort((a, b) => a.orden - b.orden)
    .map(tipo => ({
      id: tipo.id,
      nombre: tipo.nombre,
      icono: tipo.icono || 'FileText',
      color: tipo.color || '#6b7280',
      servicios: servicios.filter(s => s.tipo_tramite_id === tipo.id)
    }))
    .filter(r => r.servicios.length > 0);

  // Mapa para acceso rápido por nombre
  const rubrosMap: Record<string, Rubro> = {};
  rubros.forEach(r => { rubrosMap[r.nombre] = r; });

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

  // Seleccionar trámite al hacer scroll (cuando para de scrollear)
  const handleTramitesScroll = useCallback(() => {
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }

    scrollTimeoutRef.current = setTimeout(() => {
      const container = tramitesScrollRef.current;
      if (!container || serviciosDelRubro.length === 0) return;

      // Usar el borde izquierdo del contenedor + un offset para detectar el primer item visible
      const containerLeft = container.getBoundingClientRect().left;

      let closestId: string | null = null;
      let closestDistance = Infinity;

      const buttons = container.querySelectorAll('button[data-tramite-id]');
      buttons.forEach((button) => {
        const rect = button.getBoundingClientRect();
        // Distancia desde el borde izquierdo del contenedor al inicio del botón
        const distance = Math.abs(rect.left - containerLeft - 8); // 8px de padding

        if (distance < closestDistance) {
          closestDistance = distance;
          closestId = button.getAttribute('data-tramite-id');
        }
      });

      if (closestId && closestId !== formData.servicio_id) {
        setFormData(prev => ({ ...prev, servicio_id: closestId! }));
      }
    }, 100);
  }, [serviciosDelRubro.length, formData.servicio_id]);

  const filteredServicios = searchTerm.trim()
    ? servicios.filter(s =>
        s.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (s.descripcion && s.descripcion.toLowerCase().includes(searchTerm.toLowerCase()))
      )
    : [];

  const selectedServicio = servicios.find(s => s.id === Number(formData.servicio_id));

  // Auto-cargar tip de IA cuando se selecciona un trámite
  useEffect(() => {
    const fetchAITip = async () => {
      if (!selectedServicio || wizardStep !== 1) return;

      setAiLoading(true);
      setAiResponse('');

      try {
        const municipioNombre = municipioActual?.nombre || 'la Municipalidad';
        const categoria = tipos.find(t => t.id === selectedServicio.tipo_tramite_id)?.nombre || '';
        const descripcionTramite = selectedServicio.descripcion?.replace(/^\[[^\]]+\]\s*/, '') || '';

        const prompt = `Sos asistente de ${municipioNombre}. Un vecino va a iniciar este trámite:

TRÁMITE: ${selectedServicio.nombre}
CATEGORÍA: ${categoria}
DESCRIPCIÓN: ${descripcionTramite}
TIEMPO ESTIMADO: ${selectedServicio.tiempo_estimado_dias} días
COSTO: ${selectedServicio.costo ? `$${selectedServicio.costo.toLocaleString()}` : 'Gratuito'}

En base a tu conocimiento sobre gestión municipal y este tipo de trámites específico, ¿tenés alguna recomendación práctica para el vecino?

IMPORTANTE:
- NO repitas documentos ni requisitos (ya los mostramos aparte)
- Enfocate en: errores comunes a evitar, tips para agilizar, qué esperar después de presentar
- Máximo 2-3 oraciones, tono amigable
- Si no tenés info útil específica, da un consejo general breve`;

        const response = await chatApi.askDynamic(prompt, {
          tramite: selectedServicio.nombre,
          categoria,
          descripcion: descripcionTramite,
          tiempo_estimado: `${selectedServicio.tiempo_estimado_dias} días`,
          costo: selectedServicio.costo ? `$${selectedServicio.costo.toLocaleString()}` : 'Gratuito',
          municipio: municipioNombre,
        }, 'tramite_tip');

        setAiResponse(response.response || response.message || '');
      } catch {
        setAiResponse('');
      } finally {
        setAiLoading(false);
      }
    };

    fetchAITip();
  }, [selectedServicio?.id, wizardStep]);

  // IA contextual: analiza lo que escribe el usuario en observaciones (3+ palabras)
  useEffect(() => {
    // Limpiar timeout anterior
    if (contextualAiTimeoutRef.current) {
      clearTimeout(contextualAiTimeoutRef.current);
    }

    const texto = formData.observaciones.trim();
    const palabras = texto.split(/\s+/).filter(p => p.length > 0);

    // Solo activar con 3+ palabras y servicio seleccionado
    if (palabras.length < 3 || !selectedServicio) {
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
          tramite: selectedServicio.nombre,
          categoria: selectedRubro || '',
          descripcion_tramite: selectedServicio.descripcion?.replace(/^\[[^\]]+\]\s*/, ''),
          texto_usuario: texto,
          documentos_requeridos: selectedServicio.documentos_requeridos,
        };

        // Construir info del municipio para la IA
        const municipioNombre = municipioActual?.nombre || 'la Municipalidad';
        const municipioDireccion = municipioActual?.direccion ? `Sede: ${municipioActual.direccion}` : '';
        const municipioTelefono = municipioActual?.telefono ? `Tel: ${municipioActual.telefono}` : '';
        const municipioInfo = [municipioDireccion, municipioTelefono].filter(Boolean).join(' | ');

        const response = await chatApi.askDynamic(
          `Sos empleada de ${municipioNombre}.${municipioInfo ? ` ${municipioInfo}.` : ''}

Vecino quiere hacer: "${selectedServicio.nombre}" (categoría: ${selectedRubro || 'general'}).
Escribió: "${texto}"

Respondé dando info útil basada SOLO en lo que sabés del trámite:
- Qué documentos suelen pedirse para este tipo de trámite
- Cuánto suele tardar aproximadamente
- Algún tip útil general

Si tenés datos de contacto del municipio, podés mencionarlos. NO inventes direcciones ni datos que no tengas.
Tono amigable, 2-3 oraciones máximo.`,
          contexto,
          'tramite_contextual'
        );
        console.log('[IA Contextual] Respuesta:', response);
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
  }, [formData.observaciones, selectedServicio?.id, selectedRubro]);

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
    setDocumentos([]);
    // Reset del chat
    setChatInput('');
    setChatMessages([
      { role: 'assistant', content: '¡Hola! 👋 Soy tu asistente virtual. Contame, ¿qué trámite necesitás hacer?' }
    ]);
    setChatSugerencias([]);
    // Reset validación facial
    setFacialValidated(false);
    setFacialValidating(false);
    setCameraActive(false);
    setCameraReady(false);
    setCapturedPhoto(null);
    setCameraError(null);
    setPendingStream(null);
    // Detener cámara si está activa
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  };

  // Scroll al final del chat cuando hay nuevos mensajes
  useEffect(() => {
    chatMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // Función para enviar mensaje del chat y clasificar con IA
  const handleChatSubmit = async () => {
    if (!chatInput.trim() || chatAnalyzing) return;

    const userMessage = chatInput.trim();
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setChatAnalyzing(true);
    setChatSugerencias([]);

    try {
      const municipioIdStr = localStorage.getItem('municipio_id');
      const municipioId = municipioIdStr ? parseInt(municipioIdStr) : 1;

      // Clasificar el texto con IA
      const resultado = await clasificacionApi.clasificarTramite(userMessage, municipioId);

      if (resultado.sugerencias && resultado.sugerencias.length > 0) {
        setChatSugerencias(resultado.sugerencias);

        const mejorSugerencia = resultado.sugerencias[0];
        const confianza = mejorSugerencia.confianza || 0;

        // Mensaje de respuesta con las sugerencias
        const confianzaTexto = confianza >= 80 ? '¡Perfecto!' : confianza >= 60 ? 'Entiendo.' : 'Creo que entendí.';

        if (resultado.sugerencias.length === 1) {
          setChatMessages(prev => [...prev, {
            role: 'assistant',
            content: `${confianzaTexto} Parece que necesitás "${mejorSugerencia.tramite_nombre}". ¿Es correcto? Podés seleccionarlo abajo o elegir otro trámite.`
          }]);
        } else {
          const tramitesTexto = resultado.sugerencias.slice(0, 3).map((s: {tramite_nombre: string}) => s.tramite_nombre).join(', ');
          setChatMessages(prev => [...prev, {
            role: 'assistant',
            content: `${confianzaTexto} Encontré estos trámites que podrían ser lo que buscás: ${tramitesTexto}. Seleccioná el que corresponda.`
          }]);
        }

        // Pre-guardar la descripción del usuario
        setFormData(prev => ({
          ...prev,
          observaciones: userMessage,
        }));
      } else {
        setChatMessages(prev => [...prev, {
          role: 'assistant',
          content: 'No encontré un trámite específico para tu consulta. Podés describirme con más detalle qué necesitás o ir al siguiente paso para buscar manualmente.'
        }]);
      }
    } catch {
      setChatMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Hubo un problema al analizar tu consulta. Podés intentar de nuevo o ir al siguiente paso para buscar el trámite manualmente.'
      }]);
    } finally {
      setChatAnalyzing(false);
    }
  };

  // Seleccionar un trámite sugerido desde el chat
  const selectSuggestedTramite = (sugerencia: {tramite_id: number, tramite_nombre: string, tipo_tramite_id?: number, tipo_tramite_nombre?: string}) => {
    setFormData(prev => ({
      ...prev,
      servicio_id: String(sugerencia.tramite_id),
      asunto: `Solicitud: ${sugerencia.tramite_nombre}`,
    }));

    // Seleccionar el rubro correspondiente
    if (sugerencia.tipo_tramite_nombre) {
      setSelectedRubro(sugerencia.tipo_tramite_nombre);
    }

    toast.success(`Trámite "${sugerencia.tramite_nombre}" seleccionado`);

    // Avanzar al siguiente paso (detalle)
    setWizardStep(2);
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
      const solicitudId = res.data.id;

      // Subir documentos si hay
      if (documentos.length > 0) {
        setUploadingDocs(true);
        for (const doc of documentos) {
          try {
            const formData = new FormData();
            formData.append('file', doc);
            await tramitesApi.uploadDocumento(solicitudId, formData);
          } catch (err) {
            console.error('Error subiendo documento:', err);
          }
        }
        setUploadingDocs(false);
      }

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
      const municipioNombre = municipioActual?.nombre || 'la Municipalidad';

      // Armar contexto dinámico con toda la info disponible
      const contexto: Record<string, unknown> = {
        municipio: municipioNombre,
        municipio_direccion: municipioActual?.direccion || '',
        municipio_telefono: municipioActual?.telefono || '',
      };

      if (servicio) {
        contexto.tramite = servicio.nombre;
        contexto.categoria = selectedRubro || '';
        contexto.tiempo_estimado = `${servicio.tiempo_estimado_dias} días`;
        contexto.costo = servicio.costo ? `$${servicio.costo.toLocaleString()}` : 'Gratuito';
      }

      // Prompt mejorado que evita repetir info que ya mostramos
      const systemPrompt = servicio
        ? `Sos asistente de ${municipioNombre}. El vecino está iniciando el trámite "${servicio.nombre}" (${selectedRubro || 'general'}).

IMPORTANTE: Ya le mostramos los documentos y requisitos, NO los repitas.

Respondé la pregunta del vecino dando valor agregado:
- Tips prácticos para agilizar el trámite
- Errores comunes que debe evitar
- Qué esperar después de presentar la solicitud
- Horarios o días recomendados para ir
- Información de contacto si la tenés

Tono amigable y conciso (2-3 oraciones máximo).`
        : `Sos asistente de ${municipioNombre}. Ayudá al vecino con su consulta sobre trámites. Tono amigable y conciso.`;

      const response = await chatApi.askDynamic(
        `${systemPrompt}\n\nPregunta del vecino: ${aiQuestion}`,
        contexto,
        'tramite_consulta'
      );
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
  // Validación facial: válido si ya validó o si el trámite no lo requiere
  const requiresFacialValidation = selectedServicio?.requiere_validacion_facial === true;
  const isStepFacialValid = !requiresFacialValidation || facialValidated;
  const isStep3Valid = user ? true : (
    isAnonymous
      ? !!(formData.email_solicitante || formData.telefono_solicitante)
      : !!(registerData.email && registerData.password && (emailExists === false ? registerData.nombre : true))
  );

  // Step 0: Chat con IA para identificar trámite
  const wizardStep0 = (
    <div className="space-y-4 h-full flex flex-col">
      {/* Chat messages */}
      <div className="flex-1 overflow-y-auto space-y-3 min-h-[200px] max-h-[300px] pr-2">
        {chatMessages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex items-start gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
          >
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
              style={{
                backgroundColor: msg.role === 'assistant' ? `${theme.primary}20` : theme.backgroundSecondary,
              }}
            >
              {msg.role === 'assistant' ? (
                <Bot className="h-4 w-4" style={{ color: theme.primary }} />
              ) : (
                <User className="h-4 w-4" style={{ color: theme.textSecondary }} />
              )}
            </div>
            <div
              className={`px-4 py-2.5 rounded-2xl max-w-[85%] ${
                msg.role === 'user'
                  ? 'rounded-tr-sm'
                  : 'rounded-tl-sm'
              }`}
              style={{
                backgroundColor: msg.role === 'assistant' ? theme.card : theme.primary,
                color: msg.role === 'assistant' ? theme.text : 'white',
              }}
            >
              <p className="text-sm leading-relaxed">{msg.content}</p>
            </div>
          </div>
        ))}

        {/* Indicador de carga */}
        {chatAnalyzing && (
          <div className="flex items-start gap-2">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center"
              style={{ backgroundColor: `${theme.primary}20` }}
            >
              <Bot className="h-4 w-4" style={{ color: theme.primary }} />
            </div>
            <div
              className="px-4 py-3 rounded-2xl rounded-tl-sm"
              style={{ backgroundColor: theme.card }}
            >
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" style={{ color: theme.primary }} />
                <span className="text-sm" style={{ color: theme.textSecondary }}>Analizando...</span>
              </div>
            </div>
          </div>
        )}

        <div ref={chatMessagesEndRef} />
      </div>

      {/* Sugerencias de trámites */}
      {chatSugerencias.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium" style={{ color: theme.textSecondary }}>
            Trámites sugeridos:
          </p>
          <div className="grid gap-2">
            {chatSugerencias.slice(0, 3).map((sug, idx) => {
              const tipo = tipos.find(t => t.id === sug.tipo_tramite_id);
              const color = tipo?.color || theme.primary;
              return (
                <button
                  key={idx}
                  onClick={() => selectSuggestedTramite(sug)}
                  className="flex items-center gap-3 p-3 rounded-xl transition-all hover:scale-[1.02]"
                  style={{
                    backgroundColor: `${color}10`,
                    border: `2px solid ${color}30`,
                  }}
                >
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: color, color: 'white' }}
                  >
                    {getServicioIcon(tipo?.icono)}
                  </div>
                  <div className="flex-1 text-left">
                    <p className="font-medium text-sm" style={{ color: theme.text }}>
                      {sug.tramite_nombre}
                    </p>
                    <p className="text-xs" style={{ color: theme.textSecondary }}>
                      {sug.tipo_tramite_nombre || 'General'} · {sug.confianza}% coincidencia
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 flex-shrink-0" style={{ color }} />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Input del chat */}
      <div
        className="flex items-center gap-2 p-3 rounded-xl"
        style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}` }}
      >
        <input
          ref={chatInputRef}
          type="text"
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleChatSubmit()}
          placeholder="Ej: Quiero abrir un local de comidas..."
          disabled={chatAnalyzing}
          className="flex-1 bg-transparent text-sm focus:outline-none disabled:opacity-50"
          style={{ color: theme.text }}
        />
        <button
          onClick={handleChatSubmit}
          disabled={!chatInput.trim() || chatAnalyzing}
          className="p-2 rounded-lg transition-colors disabled:opacity-50"
          style={{ backgroundColor: theme.primary, color: 'white' }}
        >
          {chatAnalyzing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </button>
      </div>

      {/* Botón para saltar */}
      <button
        onClick={() => setWizardStep(1)}
        className="text-xs py-2 px-4 rounded-lg transition-colors hover:opacity-80"
        style={{ color: theme.textSecondary }}
      >
        <span className="flex items-center justify-center gap-1">
          Prefiero buscar el trámite manualmente
          <ArrowRight className="h-3 w-3" />
        </span>
      </button>
    </div>
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
                style={{
                  backgroundColor: isSelected ? `${rubro.color}20` : theme.backgroundSecondary,
                  borderColor: isSelected ? rubro.color : theme.border,
                }}
              >
                <div className="w-8 h-8 rounded-full mx-auto mb-1 flex items-center justify-center" style={{ backgroundColor: isSelected ? rubro.color : `${rubro.color}30`, color: isSelected ? 'white' : rubro.color }}>
                  <span className="scale-90">{getServicioIcon(rubro.icono)}</span>
                </div>
                <span className="text-xs font-medium block text-center line-clamp-2 leading-tight" style={{ color: theme.text }}>{rubro.nombre}</span>
                {isSelected && (
                  <div className="absolute top-1 right-1 w-4 h-4 rounded-full flex items-center justify-center" style={{ backgroundColor: rubro.color }}>
                    <CheckCircle2 className="h-2.5 w-2.5 text-white" />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ height: '100px' }}>
        {selectedRubro ? (
          <div>
            <p className="text-xs font-medium mb-2" style={{ color: theme.text }}>Trámites de {selectedRubro}:</p>
            <div
              ref={tramitesScrollRef}
              onScroll={handleTramitesScroll}
              className="grid gap-2 pb-2"
              style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))' }}
            >
              {serviciosDelRubro.map((s) => {
                const isSelected = formData.servicio_id === String(s.id);
                const rubroColor = rubrosMap[selectedRubro]?.color || '#6b7280';
                const color = s.color || rubroColor;
                return (
                  <button
                    key={s.id}
                    data-tramite-id={String(s.id)}
                    onClick={() => setFormData(prev => ({ ...prev, servicio_id: String(s.id) }))}
                    className={`relative p-2 rounded-xl border-2 text-center transition-all hover:scale-105 ${isSelected ? 'border-current' : 'border-transparent'}`}
                    style={{
                      backgroundColor: isSelected ? `${color}20` : theme.backgroundSecondary,
                      borderColor: isSelected ? color : theme.border
                    }}
                  >
                    <div className="w-7 h-7 rounded-full mx-auto mb-1 flex items-center justify-center" style={{ backgroundColor: isSelected ? color : `${color}30`, color: isSelected ? 'white' : color }}>
                      <span className="scale-75">{getServicioIcon(s.icono)}</span>
                    </div>
                    <span className="text-[10px] font-medium block text-center truncate" style={{ color: theme.text }}>{s.nombre}</span>
                    {isSelected && (
                      <div className="absolute top-1 right-1 w-3.5 h-3.5 rounded-full flex items-center justify-center" style={{ backgroundColor: color }}>
                        <CheckCircle2 className="h-2 w-2 text-white" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <p className="text-xs text-center pt-8" style={{ color: theme.textSecondary }}>Selecciona una categoría para ver los trámites disponibles</p>
        )}
      </div>

      {/* Tip de IA para el trámite seleccionado */}
      {selectedServicio && (
        <div className="p-3 rounded-xl flex items-start gap-3" style={{ backgroundColor: `${theme.primary}10`, border: `1px solid ${theme.primary}20` }}>
          {aiLoading ? (
            <Loader2 className="h-5 w-5 flex-shrink-0 animate-spin" style={{ color: theme.primary }} />
          ) : (
            <Sparkles className="h-5 w-5 flex-shrink-0" style={{ color: theme.primary }} />
          )}
          <p className="text-sm leading-relaxed" style={{ color: theme.textSecondary }}>
            {aiLoading
              ? 'Analizando el trámite...'
              : aiResponse
                ? aiResponse
                : 'Mirá el panel de la derecha para ver los documentos y requisitos.'}
          </p>
        </div>
      )}
    </div>
  );

  // Step 2: Detalle
  const wizardStep2 = (
    <div className="space-y-4">
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
        <div className="flex items-start justify-between gap-2 mb-2">
          <label className="text-sm sm:text-base font-medium flex-1" style={{ color: theme.text }}>Contanos más sobre tu trámite</label>
          <div className="flex-shrink-0">
            <VoiceInput
              onTranscript={(text) => {
                const newObservaciones = formData.observaciones ?
                                        formData.observaciones + ' ' + text : text;
                setFormData(prev => ({ ...prev, observaciones: newObservaciones }));
              }}
              onError={(error) => toast.error(error)}
            />
          </div>
        </div>
        <textarea
          placeholder="Ej: Quiero abrir un local de comidas en Av. San Martín, ya tengo el contrato de alquiler firmado..."
          value={formData.observaciones}
          onChange={(e) => setFormData(prev => ({ ...prev, observaciones: e.target.value }))}
          rows={3}
          className="w-full px-3 py-2.5 sm:px-4 sm:py-3 rounded-xl resize-none text-sm sm:text-base"
          style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}`, color: theme.text }}
        />

        {/* IA contextual basada en lo que escribe el usuario */}
        {contextualAiLoading && (
          <div className="p-3 rounded-xl flex items-center gap-2" style={{ backgroundColor: `${theme.primary}10`, border: `1px solid ${theme.primary}30` }}>
            <Loader2 className="h-4 w-4 animate-spin" style={{ color: theme.primary }} />
            <span className="text-xs" style={{ color: theme.textSecondary }}>Analizando...</span>
          </div>
        )}

        {contextualAiResponse && !contextualAiLoading && (
          <div className="p-4 rounded-xl" style={{ backgroundColor: '#10b98115', border: '1px solid #10b98130' }}>
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="h-4 w-4" style={{ color: '#10b981' }} />
              <span className="text-xs font-medium" style={{ color: '#10b981' }}>Asistente Municipal</span>
            </div>
            <div className="space-y-2 text-sm leading-relaxed" style={{ color: theme.text }}>
              {contextualAiResponse.split(/(?<=[.!?])\s+/).reduce((acc: string[][], sentence, idx) => {
                const groupIdx = Math.floor(idx / 2);
                if (!acc[groupIdx]) acc[groupIdx] = [];
                acc[groupIdx].push(sentence);
                return acc;
              }, []).map((group, idx) => (
                <p key={idx} className="flex items-start gap-2">
                  <span className="mt-0.5" style={{ color: '#10b981' }}>
                    {idx === 0 ? <Map className="h-4 w-4" /> : idx === 1 ? <FileText className="h-4 w-4" /> : <Lightbulb className="h-4 w-4" />}
                  </span>
                  <span>{group.join(' ')}</span>
                </p>
              ))}
            </div>
          </div>
        )}

        {contextualAiFailed && !contextualAiResponse && !contextualAiLoading && (
          <div className="p-3 rounded-xl" style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}` }}>
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" style={{ color: theme.textSecondary }} />
              <span className="text-sm" style={{ color: theme.textSecondary }}>Recomendaciones no disponibles</span>
            </div>
          </div>
        )}
      </div>

      {/* Sección de documentos adjuntos */}
      <div className="space-y-2">
        <label className="text-sm font-medium flex items-center gap-2" style={{ color: theme.text }}>
          <Paperclip className="h-4 w-4" />
          Adjuntar documentos
        </label>
        <p className="text-xs" style={{ color: theme.textSecondary }}>
          Podés adjuntar imágenes o PDFs (máximo 10MB cada uno)
        </p>

        {/* Input oculto */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/jpg,image/webp,image/gif,application/pdf"
          multiple
          onChange={handleFileSelect}
          className="hidden"
        />

        {/* Botón de upload */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="w-full p-4 rounded-xl border-2 border-dashed flex flex-col items-center gap-2 transition-colors hover:border-current"
          style={{ borderColor: theme.border, color: theme.textSecondary }}
        >
          <Upload className="h-6 w-6" />
          <span className="text-sm">Click para seleccionar archivos</span>
        </button>

        {/* Lista de documentos adjuntos */}
        {documentos.length > 0 && (
          <div className="space-y-2 mt-3">
            {documentos.map((doc, index) => (
              <div
                key={index}
                className="flex items-center gap-3 p-3 rounded-xl"
                style={{ backgroundColor: theme.backgroundSecondary }}
              >
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: doc.type.startsWith('image/') ? '#3b82f620' : '#ef444420' }}
                >
                  {doc.type.startsWith('image/') ? (
                    <Image className="h-5 w-5" style={{ color: '#3b82f6' }} />
                  ) : (
                    <File className="h-5 w-5" style={{ color: '#ef4444' }} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: theme.text }}>
                    {doc.name}
                  </p>
                  <p className="text-xs" style={{ color: theme.textSecondary }}>
                    {formatFileSize(doc.size)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => removeDocumento(index)}
                  className="p-1.5 rounded-lg hover:bg-red-500/10 transition-colors"
                >
                  <X className="h-4 w-4" style={{ color: '#ef4444' }} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  // Step Facial: Validación facial con cámara real
  const startCamera = async () => {
    setCameraError(null);
    setCameraReady(false);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
      });

      // Primero activamos la cámara para que el video element se renderice
      setCameraActive(true);
      // Luego guardamos el stream pendiente, el useEffect lo asignará cuando el video esté listo
      setPendingStream(stream);

    } catch (err: unknown) {
      console.error('Error accessing camera:', err);
      const error = err as Error;
      if (error.name === 'NotFoundError') {
        setCameraError('No se encontró ninguna cámara en este dispositivo.');
      } else if (error.name === 'NotReadableError') {
        setCameraError('La cámara está siendo usada por otra aplicación. Cerrá otras apps y volvé a intentar.');
      } else if (error.name === 'NotAllowedError') {
        setCameraError('Permiso de cámara denegado. Habilitá el acceso en la configuración del navegador.');
      } else {
        setCameraError('No se pudo acceder a la cámara. Verificá los permisos del navegador.');
      }
    }
  };

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    // Clear pendingStream state - the stream itself is either moved to streamRef or will be garbage collected
    setPendingStream(null);
    setCameraActive(false);
    setCameraReady(false);
  }, []);

  const capturePhoto = () => {
    if (!cameraReady || !videoRef.current || !canvasRef.current) {
      console.warn('Camera not ready for capture');
      return;
    }
    const video = videoRef.current;
    const canvas = canvasRef.current;

    // Verificar que el video tenga dimensiones
    if (video.videoWidth === 0 || video.videoHeight === 0) {
      console.warn('Video dimensions not available');
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      // Espejo horizontal para selfie
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0);
      const photoData = canvas.toDataURL('image/jpeg', 0.8);
      setCapturedPhoto(photoData);
      stopCamera();
    }
  };

  const retakePhoto = () => {
    setCapturedPhoto(null);
    startCamera();
  };

  const confirmPhoto = () => {
    setFacialValidating(true);
    // Simular procesamiento de la foto (en producción enviar a API de validación)
    setTimeout(() => {
      setFacialValidated(true);
      setFacialValidating(false);
      toast.success('Identidad verificada correctamente');
    }, 1500);
  };

  const wizardStepFacial = (
    <div className="space-y-4 py-2">
      {/* Canvas oculto para captura */}
      <canvas ref={canvasRef} className="hidden" />

      {facialValidated ? (
        // Foto validada exitosamente
        <div className="text-center">
          <div className="w-20 h-20 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ backgroundColor: '#10b98120' }}>
            <CheckCircle2 className="h-10 w-10" style={{ color: '#10b981' }} />
          </div>
          <h3 className="text-lg font-semibold mb-2" style={{ color: theme.text }}>Identidad Verificada</h3>
          <p className="text-sm mb-4" style={{ color: theme.textSecondary }}>
            Tu identidad ha sido verificada correctamente. Podés continuar con el trámite.
          </p>
          {capturedPhoto && (
            <div className="mx-auto w-32 h-32 rounded-full overflow-hidden border-4" style={{ borderColor: '#10b981' }}>
              <img src={capturedPhoto} alt="Foto capturada" className="w-full h-full object-cover" />
            </div>
          )}
        </div>
      ) : capturedPhoto ? (
        // Foto capturada, confirmar o reintentar
        <div className="text-center space-y-4">
          <h3 className="text-lg font-semibold" style={{ color: theme.text }}>¿La foto se ve bien?</h3>
          <div className="mx-auto w-48 h-48 rounded-2xl overflow-hidden border-2" style={{ borderColor: theme.primary }}>
            <img src={capturedPhoto} alt="Foto capturada" className="w-full h-full object-cover" />
          </div>
          <div className="flex gap-3 justify-center">
            <button
              onClick={retakePhoto}
              className="px-6 py-3 rounded-xl font-medium flex items-center gap-2 transition-all"
              style={{ backgroundColor: theme.backgroundSecondary, color: theme.text }}
            >
              <Camera className="h-4 w-4" />
              Tomar otra
            </button>
            <button
              onClick={confirmPhoto}
              disabled={facialValidating}
              className="px-6 py-3 rounded-xl font-medium flex items-center gap-2 transition-all"
              style={{ backgroundColor: theme.primary, color: 'white', opacity: facialValidating ? 0.7 : 1 }}
            >
              {facialValidating ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              {facialValidating ? 'Verificando...' : 'Confirmar'}
            </button>
          </div>
        </div>
      ) : cameraActive ? (
        // Cámara activa, mostrar preview
        <div className="text-center space-y-4">
          <h3 className="text-lg font-semibold" style={{ color: theme.text }}>Mirá a la cámara</h3>
          <p className="text-sm" style={{ color: theme.textSecondary }}>Asegurate de tener buena iluminación y que tu rostro se vea claramente.</p>
          <div className="mx-auto w-64 h-64 rounded-2xl overflow-hidden bg-black relative">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
              style={{ transform: 'scaleX(-1)' }}
            />
            <div className="absolute inset-0 border-4 rounded-2xl pointer-events-none" style={{ borderColor: `${theme.primary}50` }} />
            {!cameraReady && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                <Loader2 className="h-8 w-8 animate-spin text-white" />
              </div>
            )}
          </div>
          <div className="flex gap-3 justify-center">
            <button
              onClick={stopCamera}
              className="px-4 py-3 rounded-xl font-medium transition-all"
              style={{ backgroundColor: theme.backgroundSecondary, color: theme.text }}
            >
              Cancelar
            </button>
            <button
              onClick={capturePhoto}
              disabled={!cameraReady}
              className="px-6 py-3 rounded-xl font-medium flex items-center gap-2 transition-all hover:scale-105 active:scale-95"
              style={{ backgroundColor: theme.primary, color: 'white', opacity: cameraReady ? 1 : 0.5 }}
            >
              {cameraReady ? <Camera className="h-5 w-5" /> : <Loader2 className="h-5 w-5 animate-spin" />}
              {cameraReady ? 'Capturar Foto' : 'Cargando...'}
            </button>
          </div>
        </div>
      ) : (
        // Estado inicial - botón para iniciar cámara
        <div className="text-center space-y-4">
          <div className="w-20 h-20 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ backgroundColor: `${theme.primary}20` }}>
            <ScanFace className="h-10 w-10" style={{ color: theme.primary }} />
          </div>
          <h3 className="text-lg font-semibold" style={{ color: theme.text }}>Verificación de Identidad</h3>
          <p className="text-sm" style={{ color: theme.textSecondary }}>
            Este trámite requiere verificar tu identidad mediante una foto de tu rostro.
          </p>

          {cameraError && (
            <div className="p-3 rounded-xl text-sm" style={{ backgroundColor: '#ef444420', color: '#ef4444' }}>
              {cameraError}
            </div>
          )}

          <div className="p-4 rounded-xl text-left" style={{ backgroundColor: theme.backgroundSecondary }}>
            <div className="flex items-start gap-3">
              <Info className="h-5 w-5 flex-shrink-0 mt-0.5" style={{ color: theme.primary }} />
              <div className="text-sm" style={{ color: theme.textSecondary }}>
                <p className="font-medium mb-1" style={{ color: theme.text }}>¿Cómo funciona?</p>
                <ul className="space-y-1 list-disc list-inside">
                  <li>Se activará tu cámara frontal</li>
                  <li>Mirá directamente a la cámara</li>
                  <li>Asegurate de tener buena iluminación</li>
                </ul>
              </div>
            </div>
          </div>

          <button
            onClick={startCamera}
            className="w-full py-4 rounded-xl font-medium flex items-center justify-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98]"
            style={{ backgroundColor: theme.primary, color: 'white' }}
          >
            <Camera className="h-5 w-5" />
            Activar Cámara
          </button>
        </div>
      )}
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
            {documentos.length > 0 && (
              <div>
                <p className="text-xs" style={{ color: theme.textSecondary }}>Documentos adjuntos:</p>
                <div className="flex flex-wrap gap-2 mt-1">
                  {documentos.map((doc, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs"
                      style={{ backgroundColor: theme.backgroundSecondary }}
                    >
                      {doc.type.startsWith('image/') ? (
                        <Image className="h-3 w-3" style={{ color: '#3b82f6' }} />
                      ) : (
                        <File className="h-3 w-3" style={{ color: '#ef4444' }} />
                      )}
                      <span className="truncate max-w-[100px]" style={{ color: theme.text }}>{doc.name}</span>
                    </div>
                  ))}
                </div>
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

  // Validación del paso 0: siempre válido (puede saltar)
  const isStep0Valid = true;

  // Construir los pasos dinámicamente según si requiere validación facial
  const baseSteps = [
    { id: 'asistente', title: 'Asistente', description: '¿Qué trámite necesitás?', icon: <MessageCircle className="h-5 w-5" />, content: wizardStep0, isValid: isStep0Valid },
    { id: 'servicio', title: selectedRubro && selectedServicio ? `${selectedRubro} · ${selectedServicio.nombre}` : selectedRubro || 'Categoría', description: '', icon: <FolderOpen className="h-5 w-5" />, content: wizardStep1, isValid: isStep1Valid },
    { id: 'detalle', title: selectedRubro && selectedServicio ? `${selectedRubro} · ${selectedServicio.nombre}` : selectedRubro || 'Detalle', description: '', icon: <FileText className="h-5 w-5" />, content: wizardStep2, isValid: isStep2Valid },
  ];

  // Agregar paso de validación facial si es requerido
  if (requiresFacialValidation) {
    baseSteps.push({
      id: 'validacion',
      title: 'Verificación',
      description: 'Validar identidad',
      icon: <ScanFace className="h-5 w-5" />,
      content: wizardStepFacial,
      isValid: isStepFacialValid
    });
  }

  // Agregar paso final de contacto
  baseSteps.push({
    id: 'contacto',
    title: 'Contacto',
    description: 'Datos de contacto',
    icon: <User className="h-5 w-5" />,
    content: wizardStep3,
    isValid: isStep3Valid
  });

  const wizardSteps = baseSteps;

  // Obtener el tipo de trámite (categoría) del servicio seleccionado
  const tipoDelServicioSeleccionado = selectedServicio
    ? tipos.find(t => t.id === selectedServicio.tipo_tramite_id)
    : null;

  const wizardAIPanel = (
    <div className="h-full flex flex-col">
      {/* Header con nombre del trámite y Asistente */}
      <div className="flex items-center gap-2 mb-3 min-w-0">
        <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${theme.primary}20` }}>
          <Sparkles className="h-3 w-3" style={{ color: theme.primary }} />
        </div>
        <span className="font-medium text-sm truncate" style={{ color: theme.text }}>
          {selectedServicio ? `${selectedServicio.nombre} · Asistente` : 'Asistente'}
        </span>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto">
        {/* Info dinámica del servicio seleccionado */}
        {selectedServicio && tipoDelServicioSeleccionado && (
          <div className="space-y-3">

            {/* Tiempo y costo - compacto en una línea */}
            <div className="flex items-center gap-3 py-2 px-3 rounded-lg" style={{ backgroundColor: theme.card }}>
              <div className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" style={{ color: theme.primary }} />
                <span className="text-xs font-medium" style={{ color: theme.text }}>{selectedServicio.tiempo_estimado_dias} días</span>
              </div>
              <div className="w-px h-4" style={{ backgroundColor: theme.border }} />
              <div className="flex items-center gap-1.5">
                <CreditCard className="h-3.5 w-3.5" style={{ color: selectedServicio.costo ? '#f59e0b' : '#10b981' }} />
                <span className="text-xs font-medium" style={{ color: theme.text }}>
                  {selectedServicio.costo ? `$${selectedServicio.costo.toLocaleString()}` : 'Gratis'}
                </span>
              </div>
            </div>

            {/* Documentos requeridos */}
            {selectedServicio.documentos_requeridos && (
              <div>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <FileText className="h-3.5 w-3.5" style={{ color: '#d88c0b' }} />
                  <span className="font-medium text-xs" style={{ color: theme.text }}>Documentación requerida</span>
                </div>
                <ul className="space-y-1 ml-1">
                  {selectedServicio.documentos_requeridos.split(/[|,]/).map((doc, idx) => (
                    <li key={idx} className="flex items-center gap-1.5 text-[11px] min-w-0" style={{ color: theme.textSecondary }}>
                      <CheckCircle2 className="h-3 w-3 flex-shrink-0" style={{ color: '#10b981' }} />
                      <span className="truncate">{doc.trim()}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Información / Operatoria del trámite */}
            {selectedServicio.requisitos && (
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <Info className="h-3.5 w-3.5" style={{ color: '#3b82f6' }} />
                  <span className="font-medium text-xs" style={{ color: theme.text }}>Información del trámite</span>
                </div>
                <ul className="space-y-1.5 ml-1">
                  {selectedServicio.requisitos.split(/\s*->\s*/).map((paso, idx) => {
                    // Quitar el número del paso si existe (ej: "1. Texto" -> "Texto")
                    const texto = paso.trim().replace(/^\d+\.\s*/, '');
                    if (!texto) return null;

                    return (
                      <li key={idx} className="flex items-center gap-1.5 text-[11px] min-w-0" style={{ color: theme.textSecondary }}>
                        <CheckCircle2 className="h-3 w-3 flex-shrink-0" style={{ color: '#3b82f6' }} />
                        <span className="truncate">{texto}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Mensaje para el paso 0 (Asistente IA) */}
        {wizardStep === 0 && (
          <div className="p-3 rounded-lg text-sm" style={{ backgroundColor: `${theme.primary}10`, border: `1px solid ${theme.primary}30` }}>
            <div className="flex items-start gap-2">
              <Bot className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: theme.primary }} />
              <div>
                <p className="font-medium text-xs mb-1" style={{ color: theme.text }}>Asistente inteligente</p>
                <p className="text-xs" style={{ color: theme.textSecondary }}>
                  Contale al asistente qué trámite necesitás y te sugerirá las opciones más relevantes.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Mensaje cuando no hay servicio seleccionado (paso 1) */}
        {!selectedServicio && wizardStep === 1 && (
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
      </div>

      {/* Input de chat IA - compacto */}
      <div className="mt-2 pt-2 border-t flex items-center gap-2" style={{ borderColor: theme.border }}>
        <Sparkles className="h-3 w-3 flex-shrink-0" style={{ color: theme.primary }} />
        <input
          type="text"
          value={aiQuestion}
          onChange={(e) => setAiQuestion(e.target.value)}
          onKeyDown={handleAiKeyDown}
          placeholder="Preguntá a la IA..."
          disabled={aiLoading}
          className="flex-1 bg-transparent text-xs focus:outline-none disabled:opacity-50"
          style={{ color: theme.text }}
        />
        <button
          onClick={askAI}
          disabled={!aiQuestion.trim() || aiLoading}
          className="p-1 rounded transition-colors disabled:opacity-50"
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
    />
  );
}

export default TramiteWizard;
