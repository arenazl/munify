import { useEffect, useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  FileText,
  User,
  Users,
  CheckCircle2,
  Loader2,
  Mail,
  Phone,
  Lock,
  ShieldCheck,
  Search,
  Clock,
  Eye,
  Sparkles,
  ClipboardList,
  ExternalLink,
  Send,
  FolderOpen,
  Play,
  CheckCircle,
  XCircle,
  UserPlus,
  Tag,
  FileCheck,
  Calendar,
  ChevronRight,
  MessageCircle,
  ArrowUpDown,
  Lightbulb,
} from 'lucide-react';
import { toast } from 'sonner';
import { tramitesApi, authApi, chatApi, empleadosApi } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { ABMPage, ABMTextarea, ABMField, ABMInfoPanel, ABMCollapsible, ABMTable } from '../components/ui/ABMPage';
import { Sheet } from '../components/ui/Sheet';
import { WizardModal } from '../components/ui/WizardModal';
import { ModernSelect } from '../components/ui/ModernSelect';
import { ABMCardSkeleton } from '../components/ui/Skeleton';
import { DynamicIcon } from '../components/ui/DynamicIcon';
import type { TipoTramite, Tramite, Solicitud, Empleado, ServicioTramite } from '../types';

// Helper para renderizar iconos dinámicos
function getServicioIcon(icono?: string, className = "h-5 w-5") {
  return (
    <DynamicIcon
      name={icono || 'FileText'}
      className={className}
      fallback={<FileText className={className} />}
    />
  );
}

// Estado de trámites
const estadoColors: Record<string, { bg: string; text: string }> = {
  iniciado: { bg: '#6366f1', text: '#ffffff' },
  en_revision: { bg: '#3b82f6', text: '#ffffff' },
  requiere_documentacion: { bg: '#f59e0b', text: '#ffffff' },
  en_proceso: { bg: '#8b5cf6', text: '#ffffff' },
  aprobado: { bg: '#10b981', text: '#ffffff' },
  rechazado: { bg: '#ef4444', text: '#ffffff' },
  finalizado: { bg: '#22c55e', text: '#ffffff' },
};

const estadoLabels: Record<string, string> = {
  iniciado: 'Iniciado',
  en_revision: 'En Revisión',
  requiere_documentacion: 'Requiere Doc.',
  en_proceso: 'En Proceso',
  aprobado: 'Aprobado',
  rechazado: 'Rechazado',
  finalizado: 'Finalizado',
};

// Función para obtener el icono del estado
const getEstadoIcon = (estado: string): React.ReactNode => {
  switch (estado) {
    case 'iniciado': return <Sparkles className="h-3 w-3" />;
    case 'en_revision': return <UserPlus className="h-3 w-3" />;
    case 'en_proceso': return <Play className="h-3 w-3" />;
    case 'aprobado': return <CheckCircle className="h-3 w-3" />;
    case 'finalizado': return <CheckCircle className="h-3 w-3" />;
    case 'rechazado': return <XCircle className="h-3 w-3" />;
    default: return null;
  }
};

type SheetMode = 'closed' | 'view';

interface HistorialTramite {
  id: number;
  tramite_id: number;
  usuario_id?: number;
  usuario?: { nombre: string; apellido: string };
  estado_anterior?: string;
  estado_nuevo?: string;
  accion: string;
  comentario?: string;
  created_at: string;
}

export default function Tramites() {
  const { theme } = useTheme();
  const { user, register, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const dataLoadedRef = useRef(false);

  // Detectar si venimos de la ruta de creación directa
  const isCrearTramiteRoute = location.pathname === '/gestion/crear-tramite' ||
                              location.pathname === '/app/tramites/nuevo';

  // Estado principal
  const [tramites, setTramites] = useState<Tramite[]>([]);
  const [servicios, setServicios] = useState<ServicioTramite[]>([]);
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<string>('');
  const [filterLoading, setFilterLoading] = useState<string | null>(null); // Track which filter is loading
  const [tiposTramite, setTiposTramite] = useState<TipoTramite[]>([]);
  const [ordenamiento, setOrdenamiento] = useState<'reciente' | 'vencimiento'>('reciente');

  // Sheet states
  const [sheetMode, setSheetMode] = useState<SheetMode>('closed');
  const [selectedTramite, setSelectedTramite] = useState<Tramite | null>(null);
  const [historial, setHistorial] = useState<HistorialTramite[]>([]);
  const [loadingHistorial, setLoadingHistorial] = useState(false);

  // Asignación states
  const [empleadoSeleccionado, setEmpleadoSeleccionado] = useState<string>('');
  const [comentarioAsignacion, setComentarioAsignacion] = useState('');
  const [loadingSugerencias, setLoadingSugerencias] = useState(false);
  const [sugerenciaEmpleado, setSugerenciaEmpleado] = useState<{
    sugerencia: { id: number; nombre: string; carga_actual: number } | null;
    mensaje: string;
    empleados: { id: number; nombre: string; carga_actual: number }[];
  } | null>(null);

  // Wizard state
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRubro, setSelectedRubro] = useState<string | null>(null);

  // Estado para paso de descripción inicial
  const [descripcionInput, setDescripcionInput] = useState('');
  const [clasificando, setClasificando] = useState(false);
  const [servicioSugerido, setServicioSugerido] = useState<ServicioTramite | null>(null);

  // Form data
  const [formData, setFormData] = useState({
    servicio_id: '',
    asunto: '',
    descripcion: '',
    nombre_solicitante: '',
    apellido_solicitante: '',
    email_solicitante: '',
    telefono_solicitante: '',
  });

  // Register data (si no hay usuario)
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

  // AI State
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResponse, setAiResponse] = useState('');
  const [aiQuestion, setAiQuestion] = useState('');

  // Conteos por estado y por tipo
  const [conteosEstados, setConteosEstados] = useState<Record<string, number>>({});
  const [conteosTipos, setConteosTipos] = useState<Record<number, number>>({});
  const [filtroTipo, setFiltroTipo] = useState<number | null>(null);
  const [loadingFilters, setLoadingFilters] = useState(true);

  // Filtro por dependencia
  const [filtroDependencia, setFiltroDependencia] = useState<number | null>(null);
  const [conteosDependencias, setConteosDependencias] = useState<Record<number, number>>({});
  const [dependenciasDisponibles, setDependenciasDisponibles] = useState<Array<{
    id: number;
    nombre: string;
    color?: string;
    icono?: string;
  }>>([]);

  // Verificar si el usuario es supervisor/admin (para mostrar panel de gestión)
  const isSupervisorOrAdmin = user?.rol === 'supervisor' || user?.rol === 'admin';

  // Cargar conteos de filtros (tipos + estados) con endpoints optimizados (COUNT en DB)
  // Solo para supervisores/admins - vecinos no necesitan estos datos
  useEffect(() => {
    if (!isSupervisorOrAdmin) {
      setLoadingFilters(false);
      return;
    }

    const fetchConteos = async () => {
      try {
        const [conteosTiposRes, conteosEstadosRes] = await Promise.all([
          tramitesApi.getConteoTipos().catch(() => ({ data: [] })),
          tramitesApi.getConteoEstados().catch(() => ({ data: {} })),
        ]);

        // Procesar tipos
        const tiposData = conteosTiposRes.data || [];
        const tipos: TipoTramite[] = tiposData.map((item: { id: number; nombre: string; icono: string; color: string; cantidad: number }) => ({
          id: item.id,
          nombre: item.nombre,
          icono: item.icono,
          color: item.color,
        }));
        setTiposTramite(tipos);

        const conteosTipoMap: Record<number, number> = {};
        tiposData.forEach((item: { id: number; cantidad: number }) => {
          conteosTipoMap[item.id] = item.cantidad;
        });
        setConteosTipos(conteosTipoMap);

        // Procesar estados
        setConteosEstados(conteosEstadosRes.data || {});
      } catch (error) {
        console.error('Error cargando conteos:', error);
      } finally {
        setLoadingFilters(false);
      }
    };
    fetchConteos();
  }, [isSupervisorOrAdmin]);

  // Cargar datos principales
  // Supervisores: cargan tramites de gestión + empleados
  // Vecinos: solo cargan servicios (para el wizard)
  useEffect(() => {
    const fetchData = async () => {
      if (dataLoadedRef.current) return;
      dataLoadedRef.current = true;

      try {
        if (isSupervisorOrAdmin) {
          // Supervisor/Admin: cargar datos de gestión
          const [tramitesRes, serviciosRes, empleadosRes] = await Promise.all([
            tramitesApi.getGestionTodos().catch(() => ({ data: [] })),
            tramitesApi.getServicios().catch((e) => { console.error('Error getServicios:', e); return { data: [] }; }),
            empleadosApi.getAll(true).catch(() => ({ data: [] })),
          ]);
          setTramites(tramitesRes.data);
          setServicios(serviciosRes.data);
          setEmpleados(empleadosRes.data);
        } else {
          // Vecino: solo cargar servicios para el wizard
          const serviciosRes = await tramitesApi.getServicios().catch((e) => {
            console.error('Error getServicios:', e);
            return { data: [] };
          });
          setServicios(serviciosRes.data);
        }
      } catch (error) {
        console.error('Error cargando datos:', error);
        toast.error('Error al cargar datos');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [isSupervisorOrAdmin]);

  // Refetch tramites cuando cambia filtro (solo para supervisores/admins)
  const fetchTramites = async () => {
    if (!isSupervisorOrAdmin) return;

    try {
      const params: Record<string, unknown> = {};
      if (filtroEstado) params.estado = filtroEstado;

      const res = tramitesApi.getGestionTodos
        ? await tramitesApi.getGestionTodos(params).catch(() => ({ data: [] }))
        : await tramitesApi.getAll(params).catch(() => ({ data: [] }));
      setTramites(res.data);
    } catch (error) {
      console.error('Error refetching tramites:', error);
    } finally {
      setFilterLoading(null); // Clear filter loading state
    }
  };

  useEffect(() => {
    if (dataLoadedRef.current && isSupervisorOrAdmin) {
      fetchTramites();
    }
  }, [filtroEstado, isSupervisorOrAdmin]);

  // Calcular dependencias y conteos desde los trámites cargados
  useEffect(() => {
    if (tramites.length === 0) return;

    const depsMap = new Map<number, { id: number; nombre: string; color?: string; icono?: string; count: number }>();

    tramites.forEach(t => {
      if (t.dependencia_asignada?.id) {
        const dep = t.dependencia_asignada;
        const existing = depsMap.get(dep.id);
        if (existing) {
          existing.count++;
        } else {
          depsMap.set(dep.id, {
            id: dep.id,
            nombre: dep.nombre || 'Sin nombre',
            color: dep.color,
            icono: dep.icono,
            count: 1
          });
        }
      }
    });

    const deps = Array.from(depsMap.values()).sort((a, b) => a.nombre.localeCompare(b.nombre));
    setDependenciasDisponibles(deps.map(d => ({ id: d.id, nombre: d.nombre, color: d.color, icono: d.icono })));

    const conteos: Record<number, number> = {};
    deps.forEach(d => { conteos[d.id] = d.count; });
    setConteosDependencias(conteos);
  }, [tramites]);

  // Abrir wizard automáticamente si venimos de la ruta de creación
  useEffect(() => {
    if (isCrearTramiteRoute && !loading && servicios.length > 0) {
      setWizardOpen(true);
    }
  }, [isCrearTramiteRoute, loading, servicios.length]);

  // Usar tipos de trámite como rubros (categorías)
  interface Rubro {
    id: number;
    nombre: string;
    icono: string;
    color: string;
    servicios: ServicioTramite[];
  }

  // Construir rubros desde tiposTramite y filtrar servicios por tipo_tramite_id
  const rubros: Rubro[] = tiposTramite
    .sort((a, b) => a.orden - b.orden)
    .map(tipo => ({
      id: tipo.id,
      nombre: tipo.nombre,
      icono: tipo.icono || 'FileText',
      color: tipo.color || '#6b7280',
      servicios: servicios.filter(s => s.tipo_tramite_id === tipo.id)
    }))
    .filter(r => r.servicios.length > 0); // Solo mostrar tipos que tienen trámites

  const serviciosDelRubro: ServicioTramite[] = selectedRubro
    ? rubros.find(r => r.nombre === selectedRubro)?.servicios || []
    : [];

  const filteredServicios = searchTerm.trim()
    ? servicios.filter(s =>
        s.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (s.descripcion && s.descripcion.toLowerCase().includes(searchTerm.toLowerCase()))
      )
    : [];

  const selectedServicio = servicios.find(s => s.id === Number(formData.servicio_id));

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

  // Abrir wizard
  const openWizard = () => {
    setFormData({
      servicio_id: '',
      asunto: '',
      descripcion: '',
      nombre_solicitante: '',
      apellido_solicitante: '',
      email_solicitante: '',
      telefono_solicitante: '',
    });
    setSearchTerm('');
    setSelectedRubro(null);
    setWizardStep(0);
    setAiResponse('');
    setDescripcionInput('');
    setServicioSugerido(null);
    setClasificando(false);
    setWizardOpen(true);
  };

  const closeWizard = () => {
    setWizardOpen(false);
    setDescripcionInput('');
    setServicioSugerido(null);
    // Si venimos de la ruta de creación, navegar hacia atrás
    if (isCrearTramiteRoute) {
      navigate(-1);
    }
  };

  // Buscar servicio sugerido basado en palabras clave
  const handleDescripcionSubmit = () => {
    if (!descripcionInput.trim() || clasificando) return;

    setClasificando(true);

    // Buscar servicio por coincidencia de palabras clave
    const texto = descripcionInput.toLowerCase();
    let mejorServicio: ServicioTramite | null = null;
    let mejorScore = 0;

    for (const servicio of servicios) {
      let score = 0;
      const nombreLower = servicio.nombre.toLowerCase();
      const descripcionLower = (servicio.descripcion || '').toLowerCase();

      // Buscar coincidencias de palabras
      const palabras = texto.split(/\s+/);
      for (const palabra of palabras) {
        if (palabra.length > 2) {
          if (nombreLower.includes(palabra)) score += 3;
          if (descripcionLower.includes(palabra)) score += 1;
        }
      }

      if (score > mejorScore) {
        mejorScore = score;
        mejorServicio = servicio;
      }
    }

    if (mejorServicio && mejorScore >= 3) {
      setServicioSugerido(mejorServicio);
      setFormData(prev => ({
        ...prev,
        descripcion: descripcionInput.trim(),
        asunto: `Consulta sobre ${mejorServicio!.nombre}`,
      }));
    } else {
      // Guardar la descripción aunque no encontremos servicio
      setFormData(prev => ({
        ...prev,
        descripcion: descripcionInput.trim(),
      }));
    }

    setClasificando(false);
  };

  // Aceptar servicio sugerido
  const aceptarServicioSugerido = () => {
    if (servicioSugerido) {
      setFormData(prev => ({ ...prev, servicio_id: String(servicioSugerido.id) }));
      setWizardStep(2); // Ir directamente a detalle (saltando servicio)
    }
  };

  // Sheet functions
  const openViewSheet = async (tramite: Tramite) => {
    setSelectedTramite(tramite);
    setEmpleadoSeleccionado(tramite.municipio_dependencia_id?.toString() || '');
    setComentarioAsignacion('');
    setSugerenciaEmpleado(null);
    setSheetMode('view');

    // Cargar historial
    setLoadingHistorial(true);
    try {
      const res = await tramitesApi.getHistorial(tramite.id);
      setHistorial(res.data);
    } catch (error) {
      console.error('Error cargando historial:', error);
      setHistorial([]);
    } finally {
      setLoadingHistorial(false);
    }

    // Cargar sugerencia de empleado si está en estado inicial
    if (tramite.estado === 'iniciado') {
      setLoadingSugerencias(true);
      try {
        const res = await tramitesApi.sugerirEmpleado(tramite.id);
        setSugerenciaEmpleado(res.data);
      } catch (error) {
        console.error('Error cargando sugerencias:', error);
      } finally {
        setLoadingSugerencias(false);
      }
    }
  };

  const closeSheet = () => {
    setSheetMode('closed');
    setSelectedTramite(null);
    setHistorial([]);
    setEmpleadoSeleccionado('');
    setComentarioAsignacion('');
    setSugerenciaEmpleado(null);
  };

  // Enviar trámite
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

      const tramiteData: Record<string, unknown> = {
        servicio_id: Number(formData.servicio_id),
        asunto: formData.asunto,
        descripcion: formData.descripcion || undefined,
      };

      if (!user || isAnonymous) {
        tramiteData.nombre_solicitante = formData.nombre_solicitante || registerData.nombre;
        tramiteData.apellido_solicitante = formData.apellido_solicitante;
        tramiteData.email_solicitante = formData.email_solicitante || registerData.email;
        tramiteData.telefono_solicitante = formData.telefono_solicitante || registerData.telefono;
      }

      const res = await tramitesApi.create(tramiteData);
      toast.success(`Trámite ${res.data.numero_tramite} creado exitosamente`);
      closeWizard();
      fetchTramites();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } } };
      toast.error(err.response?.data?.detail || 'Error al crear trámite');
    } finally {
      setSaving(false);
    }
  };

  // Asignar empleado
  const handleAsignar = async () => {
    if (!selectedTramite || !empleadoSeleccionado) return;
    setSaving(true);
    try {
      await tramitesApi.asignar(selectedTramite.id, {
        municipio_dependencia_id: Number(empleadoSeleccionado),
        comentario: comentarioAsignacion || undefined,
      });
      toast.success('Trámite asignado correctamente');
      fetchTramites();
      closeSheet();
    } catch (error) {
      toast.error('Error al asignar trámite');
      console.error('Error:', error);
    } finally {
      setSaving(false);
    }
  };

  // Cambiar estado
  const handleCambiarEstado = async (nuevoEstado: string) => {
    if (!selectedTramite) return;
    setSaving(true);
    try {
      await tramitesApi.update(selectedTramite.id, { estado: nuevoEstado });
      toast.success(`Estado cambiado a ${estadoLabels[nuevoEstado]}`);
      fetchTramites();
      closeSheet();
    } catch (error) {
      toast.error('Error al cambiar estado');
      console.error('Error:', error);
    } finally {
      setSaving(false);
    }
  };

  // AI Chat
  const askAI = async () => {
    if (!aiQuestion.trim()) return;
    setAiLoading(true);
    try {
      const servicio = selectedServicio;
      const prompt = servicio
        ? `El usuario está iniciando el trámite "${servicio.nombre}". Requisitos: ${servicio.requisitos || 'No especificados'}. Documentos: ${servicio.documentos_requeridos || 'No especificados'}. Pregunta del usuario: ${aiQuestion}`
        : `Pregunta sobre trámites municipales: ${aiQuestion}`;

      const response = await chatApi.sendMessage(prompt, []);
      setAiResponse(response.response || response.message);
      setAiQuestion('');
    } catch {
      setAiResponse('Lo siento, no pude procesar tu consulta. Intenta de nuevo.');
    } finally {
      setAiLoading(false);
    }
  };

  const handleAiKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      askAI();
    }
  };

  // Validaciones
  const isStep1Valid = !!formData.servicio_id;
  const isStep2Valid = formData.asunto.trim().length >= 10;
  const isStep3Valid = user ? true : (
    isAnonymous
      ? !!(formData.email_solicitante || formData.telefono_solicitante)
      : !!(registerData.email && registerData.password && (emailExists === false ? registerData.nombre : true))
  );

  // Filtrar trámites
  // Función para calcular fecha de vencimiento
  const calcularVencimiento = (t: Tramite) => {
    const tiempoEstimado = t.servicio?.tiempo_estimado_dias || 0;
    if (!tiempoEstimado) return null;
    const fechaCreacion = new Date(t.created_at);
    const fechaVencimiento = new Date(fechaCreacion);
    fechaVencimiento.setDate(fechaVencimiento.getDate() + tiempoEstimado);
    return fechaVencimiento;
  };

  const filteredTramites = tramites.filter(t => {
    // Filtro por tipo
    if (filtroTipo) {
      const servicio = servicios.find(s => s.id === t.servicio_id);
      if (servicio?.tipo_tramite_id !== filtroTipo) return false;
    }
    // Filtro por dependencia
    if (filtroDependencia) {
      if (t.dependencia_asignada?.id !== filtroDependencia) return false;
    }
    // Filtro por búsqueda - buscar en todas las columnas visibles
    if (!search || !search.trim()) return true;
    const s = search.trim().toLowerCase();
    const servicio = servicios.find(sv => sv.id === t.servicio_id);
    const tipoTramite = tiposTramite.find(tipo => tipo.id === servicio?.tipo_tramite_id);
    return (
      // Número de trámite e ID
      t.numero_tramite?.toLowerCase().includes(s) ||
      String(t.id).includes(s) ||
      // Estado (nombre visible)
      t.estado?.toLowerCase().includes(s) ||
      estadoLabels[t.estado]?.toLowerCase().includes(s) ||
      // Asunto y descripción
      t.asunto?.toLowerCase().includes(s) ||
      t.descripcion?.toLowerCase().includes(s) ||
      // Datos del solicitante
      t.nombre_solicitante?.toLowerCase().includes(s) ||
      t.apellido_solicitante?.toLowerCase().includes(s) ||
      `${t.nombre_solicitante || ''} ${t.apellido_solicitante || ''}`.toLowerCase().includes(s) ||
      t.dni_solicitante?.toLowerCase().includes(s) ||
      t.email_solicitante?.toLowerCase().includes(s) ||
      t.telefono_solicitante?.includes(s) ||
      t.direccion_solicitante?.toLowerCase().includes(s) ||
      // Dependencia asignada
      t.dependencia_asignada?.nombre?.toLowerCase().includes(s) ||
      // Servicio y tipo de trámite
      servicio?.nombre?.toLowerCase().includes(s) ||
      tipoTramite?.nombre?.toLowerCase().includes(s) ||
      // Respuesta y observaciones
      t.respuesta?.toLowerCase().includes(s) ||
      t.observaciones?.toLowerCase().includes(s) ||
      // Fechas (formato dd/mm/yyyy)
      (t.created_at && new Date(t.created_at).toLocaleDateString('es-AR').includes(s))
    );
  }).sort((a, b) => {
    if (ordenamiento === 'reciente') {
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    } else {
      // Por vencimiento - los que vencen más pronto primero
      const vencA = calcularVencimiento(a);
      const vencB = calcularVencimiento(b);
      if (!vencA && !vencB) return 0;
      if (!vencA) return 1;
      if (!vencB) return -1;
      return vencA.getTime() - vencB.getTime();
    }
  });

  // Obtener info del servicio para un trámite
  const getServicioInfo = (tramite: Tramite) => {
    const servicio = servicios.find(s => s.id === tramite.servicio_id);
    return {
      nombre: servicio?.nombre || 'Trámite',
      icono: servicio?.icono || 'FileText',
      color: servicio?.color || '#6366f1',
    };
  };

  // Wizard Step 0: Describir consulta
  const wizardStep0 = (
    <div className="space-y-4">
      <p className="text-sm" style={{ color: theme.textSecondary }}>
        Describí qué trámite necesitás y te sugeriremos la opción más adecuada:
      </p>

      {/* Input de descripción */}
      <div className="flex gap-2">
        <input
          type="text"
          value={descripcionInput}
          onChange={(e) => setDescripcionInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleDescripcionSubmit()}
          placeholder="Ej: Necesito sacar una habilitación comercial..."
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

      {/* Sugerencia de servicio */}
      {servicioSugerido && !clasificando && (
        <div
          className="p-4 rounded-xl flex items-center justify-between"
          style={{
            backgroundColor: `${servicioSugerido.color || theme.primary}15`,
            border: `2px solid ${servicioSugerido.color || theme.primary}`,
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center"
              style={{
                backgroundColor: servicioSugerido.color || theme.primary,
                color: 'white',
              }}
            >
              {getServicioIcon(servicioSugerido.icono)}
            </div>
            <div>
              <p className="text-xs" style={{ color: theme.textSecondary }}>Servicio sugerido</p>
              <p className="font-semibold" style={{ color: theme.text }}>
                {servicioSugerido.nombre}
              </p>
            </div>
          </div>
          <button
            onClick={aceptarServicioSugerido}
            className="px-4 py-2 rounded-lg font-medium text-sm transition-all hover:scale-105 active:scale-95"
            style={{ backgroundColor: theme.primary, color: 'white' }}
          >
            Confirmar
          </button>
        </div>
      )}

      {/* Tip */}
      <p className="text-xs text-center" style={{ color: theme.textSecondary }}>
        Tip: Describí tu necesidad con detalle para obtener una mejor sugerencia
      </p>
    </div>
  );

  // Wizard Step 1: Seleccionar servicio
  const wizardStep1 = (
    <div className="space-y-4">
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
                onClick={() => { setFormData(prev => ({ ...prev, servicio_id: String(s.id) })); setSearchTerm(''); setTimeout(() => setWizardStep(2), 300); }}
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

      {/* Rubros - cada uno ocupa todo el ancho */}
      <div>
        <p className="text-sm font-medium mb-4" style={{ color: theme.textSecondary }}>O selecciona por categoría:</p>
        <div className="grid grid-cols-1 gap-4">
          {rubros.map((rubro) => {
            const isSelected = selectedRubro === rubro.nombre;
            return (
              <button
                key={rubro.nombre}
                onClick={() => setSelectedRubro(isSelected ? null : rubro.nombre)}
                className={`w-full flex items-center gap-4 p-5 rounded-2xl border-2 transition-all hover:shadow-lg ${isSelected ? 'shadow-xl' : ''}`}
                style={{ backgroundColor: isSelected ? `${rubro.color}20` : theme.backgroundSecondary, borderColor: isSelected ? rubro.color : theme.border }}
              >
                <div className="relative">
                  <div
                    className="w-14 h-14 rounded-2xl flex items-center justify-center"
                    style={{ backgroundColor: isSelected ? rubro.color : `${rubro.color}30`, color: isSelected ? 'white' : rubro.color }}
                  >
                    <span className="scale-125">{getServicioIcon(rubro.icono)}</span>
                  </div>
                  <span
                    className="absolute -top-2 -right-2 text-xs font-bold px-2 py-1 rounded-full"
                    style={{ backgroundColor: rubro.color, color: 'white' }}
                  >
                    {rubro.servicios.length}
                  </span>
                </div>
                <div className="flex-1 text-left min-w-0">
                  <span className="text-lg font-bold block" style={{ color: theme.text }}>{rubro.nombre}</span>
                  <span className="text-sm" style={{ color: theme.textSecondary }}>{rubro.servicios.length} trámites disponibles</span>
                </div>
                {isSelected ? (
                  <CheckCircle2 className="h-6 w-6 flex-shrink-0" style={{ color: rubro.color }} />
                ) : (
                  <ChevronRight className="h-6 w-6 flex-shrink-0" style={{ color: theme.textSecondary }} />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Trámites del rubro - lista horizontal de una fila */}
      {selectedRubro && (
        <div>
          <p className="text-sm font-medium mb-3" style={{ color: theme.text }}>Trámites de {selectedRubro}:</p>
          <div className="flex flex-wrap gap-3">
            {serviciosDelRubro.map((s) => {
              const isSelected = formData.servicio_id === String(s.id);
              const color = s.color || theme.primary;
              return (
                <button
                  key={s.id}
                  onClick={() => { setFormData(prev => ({ ...prev, servicio_id: String(s.id) })); setTimeout(() => setWizardStep(2), 300); }}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all hover:shadow-md ${isSelected ? 'shadow-lg' : ''}`}
                  style={{
                    backgroundColor: isSelected ? `${color}20` : theme.backgroundSecondary,
                    borderColor: isSelected ? color : theme.border,
                  }}
                >
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: isSelected ? color : `${color}30`, color: isSelected ? 'white' : color }}
                  >
                    {getServicioIcon(s.icono)}
                  </div>
                  <div className="text-left">
                    <span className="text-sm font-medium block" style={{ color: theme.text }}>{s.nombre}</span>
                    <span className="text-xs" style={{ color: theme.textSecondary }}>{s.tiempo_estimado_dias}d · {s.costo ? `$${s.costo.toLocaleString()}` : 'Gratis'}</span>
                  </div>
                  {isSelected && (
                    <CheckCircle2 className="h-5 w-5 flex-shrink-0" style={{ color }} />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Servicio seleccionado */}
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

  // Wizard Step 2: Detalle
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

      <div className="space-y-2">
        <label className="text-sm font-medium" style={{ color: theme.text }}>Descripción adicional (opcional)</label>
        <textarea
          placeholder="Agrega detalles adicionales..."
          value={formData.descripcion}
          onChange={(e) => setFormData(prev => ({ ...prev, descripcion: e.target.value }))}
          rows={4}
          className="w-full px-4 py-3 rounded-xl text-sm resize-none"
          style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}`, color: theme.text }}
        />
      </div>
    </div>
  );

  // Wizard Step 3: Contacto
  const wizardStep3 = (
    <div className="space-y-4">
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

  // Wizard steps array
  const wizardSteps = [
    { id: 'describir', title: 'Describir', description: 'Contanos qué necesitás', icon: <MessageCircle className="h-5 w-5" />, content: wizardStep0, isValid: true },
    { id: 'servicio', title: 'Servicio', description: 'Selecciona el trámite', icon: <FolderOpen className="h-5 w-5" />, content: wizardStep1, isValid: isStep1Valid },
    { id: 'detalle', title: 'Detalle', description: 'Describe tu solicitud', icon: <FileText className="h-5 w-5" />, content: wizardStep2, isValid: isStep2Valid },
    { id: 'contacto', title: 'Contacto', description: 'Datos de contacto', icon: <User className="h-5 w-5" />, content: wizardStep3, isValid: isStep3Valid },
  ];

  // AI Panel
  const wizardAIPanel = (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: `${theme.primary}20` }}>
          <Sparkles className="h-4 w-4" style={{ color: theme.primary }} />
        </div>
        <span className="font-medium text-sm" style={{ color: theme.text }}>Asistente IA</span>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto">
        {/* Paso 0: Describir */}
        {wizardStep === 0 && (
          <div className="p-3 rounded-lg text-sm" style={{ backgroundColor: theme.card }}>
            <div className="flex items-start gap-2">
              <Lightbulb className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: theme.primary }} />
              <p style={{ color: theme.textSecondary }}>
                Contanos qué necesitás hacer y te sugeriremos el trámite más adecuado.
              </p>
            </div>
          </div>
        )}

        {/* Paso 1: Info del servicio */}
        {wizardStep === 1 && selectedServicio && (
          <div className="space-y-3">
            <div className="p-3 rounded-lg" style={{ backgroundColor: `${selectedServicio.color || theme.primary}15`, border: `1px solid ${selectedServicio.color || theme.primary}30` }}>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ backgroundColor: selectedServicio.color || theme.primary, color: 'white' }}>
                  {getServicioIcon(selectedServicio.icono)}
                </div>
                <span className="font-medium text-sm" style={{ color: theme.text }}>{selectedServicio.nombre}</span>
              </div>
            </div>
            {selectedServicio.requisitos && (
              <div className="p-3 rounded-lg text-sm" style={{ backgroundColor: theme.card }}>
                <p className="font-medium mb-1" style={{ color: theme.text }}>Requisitos:</p>
                <p className="text-xs" style={{ color: theme.textSecondary }}>{selectedServicio.requisitos}</p>
              </div>
            )}
            <div className="p-3 rounded-lg text-sm" style={{ backgroundColor: theme.card }}>
              <div className="flex items-start gap-2">
                <Lightbulb className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: '#f59e0b' }} />
                <p style={{ color: theme.textSecondary }}>
                  <span className="font-medium" style={{ color: theme.text }}>Tip: </span>
                  Tené a mano los documentos requeridos antes de continuar.
                </p>
              </div>
            </div>
          </div>
        )}

        {wizardStep === 1 && !selectedServicio && (
          <div className="p-3 rounded-lg text-sm" style={{ backgroundColor: theme.card }}>
            <div className="flex items-start gap-2">
              <Lightbulb className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: theme.primary }} />
              <p style={{ color: theme.textSecondary }}>Selecciona el trámite que necesitas realizar. Podés buscar o navegar por categoría.</p>
            </div>
          </div>
        )}

        {wizardStep === 2 && (
          <div className="p-3 rounded-lg text-sm" style={{ backgroundColor: theme.card }}>
            <div className="flex items-start gap-2">
              <Lightbulb className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: theme.primary }} />
              <p style={{ color: theme.textSecondary }}>Describe claramente el motivo de tu solicitud. Un buen asunto ayuda a procesar más rápido tu trámite.</p>
            </div>
          </div>
        )}

        {wizardStep === 3 && (
          <div className="space-y-3">
            <div className="p-3 rounded-lg" style={{ backgroundColor: `${theme.primary}10`, border: `1px solid ${theme.primary}30` }}>
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="h-4 w-4" style={{ color: theme.primary }} />
                <span className="font-medium text-sm" style={{ color: theme.text }}>Casi listo</span>
              </div>
              <p className="text-xs" style={{ color: theme.textSecondary }}>Completá tus datos de contacto para poder notificarte sobre el estado del trámite.</p>
            </div>
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

      {/* Input para preguntar */}
      <div className="mt-4 p-3 rounded-lg flex items-center gap-2" style={{ backgroundColor: theme.card }}>
        <input
          type="text"
          value={aiQuestion}
          onChange={(e) => setAiQuestion(e.target.value)}
          onKeyDown={handleAiKeyPress}
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

  // Sheet View Content
  const renderViewContent = () => {
    if (!selectedTramite) return null;

    const servicioInfo = getServicioInfo(selectedTramite);

    return (
      <div className="space-y-4">
        {/* Info del servicio */}
        <ABMInfoPanel
          title="Servicio"
          icon={<ClipboardList className="h-4 w-4" />}
          variant="default"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${servicioInfo.color}20` }}>
              <span style={{ color: servicioInfo.color }}>{getServicioIcon(servicioInfo.icono)}</span>
            </div>
            <div>
              <p className="font-medium" style={{ color: theme.text }}>{servicioInfo.nombre}</p>
              <p className="text-xs" style={{ color: theme.textSecondary }}>#{selectedTramite.numero_tramite}</p>
            </div>
          </div>
        </ABMInfoPanel>

        {/* Descripción */}
        {selectedTramite.descripcion && (
          <ABMCollapsible
            title="Descripción"
            icon={<FileText className="h-4 w-4" />}
            defaultOpen={true}
          >
            <p className="text-sm leading-relaxed" style={{ color: theme.text }}>
              {selectedTramite.descripcion}
            </p>
          </ABMCollapsible>
        )}

        {/* Datos del solicitante */}
        <ABMInfoPanel
          title="Solicitante"
          icon={<User className="h-4 w-4" />}
          variant="default"
        >
          <ABMField
            label="Nombre"
            value={`${selectedTramite.nombre_solicitante || ''} ${selectedTramite.apellido_solicitante || ''}`.trim() || 'No especificado'}
          />
          {selectedTramite.email_solicitante && (
            <ABMField
              label="Email"
              value={selectedTramite.email_solicitante}
              icon={<Mail className="h-4 w-4" style={{ color: theme.textSecondary }} />}
            />
          )}
          {selectedTramite.telefono_solicitante && (
            <ABMField
              label="Teléfono"
              value={selectedTramite.telefono_solicitante}
              icon={<Phone className="h-4 w-4" style={{ color: theme.textSecondary }} />}
            />
          )}
        </ABMInfoPanel>

        {/* Dependencia asignada */}
        {selectedTramite.dependencia_asignada && (
          <ABMInfoPanel
            title="Dependencia Asignada"
            icon={<Users className="h-4 w-4" />}
            variant="info"
          >
            <ABMField
              label="Nombre"
              value={selectedTramite.dependencia_asignada.nombre || 'Sin nombre'}
            />
          </ABMInfoPanel>
        )}

        {/* Asignar empleado (solo para estado iniciado) */}
        {selectedTramite.estado === 'iniciado' && (
          <ABMCollapsible
            title="Asignar Empleado"
            icon={<UserPlus className="h-4 w-4" />}
            defaultOpen={true}
          >
            <div className="space-y-3">
              {/* Sugerencia IA */}
              {loadingSugerencias ? (
                <div className="rounded-xl p-4 flex items-center gap-3" style={{ backgroundColor: `${theme.primary}10`, border: `1px solid ${theme.primary}30` }}>
                  <div className="h-5 w-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: theme.primary, borderTopColor: 'transparent' }} />
                  <span className="text-sm" style={{ color: theme.textSecondary }}>Analizando mejor empleado...</span>
                </div>
              ) : sugerenciaEmpleado?.sugerencia && (
                <div className="rounded-xl p-4 space-y-3" style={{ backgroundColor: `${theme.primary}08`, border: `1px solid ${theme.primary}20` }}>
                  <div className="flex items-center gap-2 mb-2">
                    <Lightbulb className="h-4 w-4" style={{ color: theme.primary }} />
                    <span className="text-sm font-medium" style={{ color: theme.text }}>Sugerencia IA</span>
                  </div>
                  <button
                    onClick={() => setEmpleadoSeleccionado(String(sugerenciaEmpleado.sugerencia!.id))}
                    className={`w-full p-3 rounded-lg text-left transition-all hover:scale-[1.01] ${empleadoSeleccionado === String(sugerenciaEmpleado.sugerencia.id) ? 'ring-2' : ''}`}
                    style={{
                      backgroundColor: empleadoSeleccionado === String(sugerenciaEmpleado.sugerencia.id) ? `${theme.primary}20` : theme.card,
                      border: `1px solid ${empleadoSeleccionado === String(sugerenciaEmpleado.sugerencia.id) ? theme.primary : theme.border}`,
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold" style={{ backgroundColor: '#10b981', color: '#ffffff' }}>
                          1
                        </div>
                        <div>
                          <span className="font-medium block" style={{ color: theme.text }}>{sugerenciaEmpleado.sugerencia.nombre}</span>
                          <span className="text-xs" style={{ color: theme.textSecondary }}>{sugerenciaEmpleado.mensaje}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs" style={{ color: theme.textSecondary }}>{sugerenciaEmpleado.sugerencia.carga_actual} pendientes</div>
                      </div>
                    </div>
                  </button>
                </div>
              )}

              {/* Selector de empleado */}
              <ModernSelect
                label="Empleado"
                value={empleadoSeleccionado}
                onChange={setEmpleadoSeleccionado}
                placeholder="Seleccionar empleado..."
                searchable={empleados.length > 5}
                options={empleados.map(emp => ({
                  value: String(emp.id),
                  label: emp.apellido ? `${emp.nombre} ${emp.apellido}` : emp.nombre,
                  description: emp.especialidad || 'Sin especialidad',
                  icon: <User className="h-4 w-4" />,
                  color: '#6b7280',
                }))}
              />

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
                      <span className="font-medium">{h.usuario?.nombre || 'Sistema'} {h.usuario?.apellido || ''}</span>
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

  // Sheet Sticky Header
  const renderSheetStickyHeader = () => {
    if (!selectedTramite) return null;

    const servicioInfo = getServicioInfo(selectedTramite);

    return (
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-full"
            style={{
              backgroundColor: estadoColors[selectedTramite.estado]?.bg || '#6b7280',
              color: estadoColors[selectedTramite.estado]?.text || '#ffffff'
            }}
          >
            {getEstadoIcon(selectedTramite.estado)}
            {estadoLabels[selectedTramite.estado] || selectedTramite.estado}
          </span>
          <span
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg"
            style={{
              backgroundColor: `${servicioInfo.color}15`,
              color: servicioInfo.color,
              border: `1px solid ${servicioInfo.color}30`
            }}
          >
            <Tag className="h-3.5 w-3.5" />
            {servicioInfo.nombre}
          </span>
        </div>
        <span className="text-xs font-medium whitespace-nowrap" style={{ color: theme.textSecondary }}>
          {new Date(selectedTramite.created_at).toLocaleString()}
        </span>
      </div>
    );
  };

  // Sheet Footer
  const renderSheetFooter = () => {
    if (!selectedTramite) return null;

    const canAsignar = selectedTramite.estado === 'iniciado';
    const canProcesar = selectedTramite.estado === 'en_revision';
    const canFinalizar = selectedTramite.estado === 'en_proceso' || selectedTramite.estado === 'aprobado';

    return (
      <div className="space-y-2">
        <button
          onClick={() => {
            closeSheet();
            navigate(`/gestion/tramites/${selectedTramite.id}`);
          }}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl font-medium transition-all duration-200 hover:scale-105 active:scale-95"
          style={{ backgroundColor: theme.backgroundSecondary, color: theme.text, border: `1px solid ${theme.border}` }}
        >
          <ExternalLink className="h-4 w-4" />
          Ver Detalle Completo
        </button>

        <div className="flex gap-2">
          {canAsignar && (
            <button
              onClick={handleAsignar}
              disabled={saving || !empleadoSeleccionado}
              className="flex-1 px-4 py-2.5 rounded-xl font-medium transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100"
              style={{ backgroundColor: theme.primary, color: '#ffffff' }}
            >
              {saving ? 'Asignando...' : 'Asignar'}
            </button>
          )}

          {canProcesar && (
            <button
              onClick={() => handleCambiarEstado('en_proceso')}
              disabled={saving}
              className="flex-1 px-4 py-2.5 rounded-xl font-medium transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-50"
              style={{ backgroundColor: '#8b5cf6', color: '#ffffff' }}
            >
              {saving ? 'Procesando...' : 'Pasar a En Proceso'}
            </button>
          )}

          {canFinalizar && (
            <button
              onClick={() => handleCambiarEstado('finalizado')}
              disabled={saving}
              className="flex-1 px-4 py-2.5 rounded-xl font-medium transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-50"
              style={{ backgroundColor: '#22c55e', color: '#ffffff' }}
            >
              {saving ? 'Finalizando...' : 'Finalizar'}
            </button>
          )}

          {(selectedTramite.estado === 'finalizado' || selectedTramite.estado === 'rechazado') && (
            <div
              className="flex-1 px-4 py-2.5 rounded-xl font-medium text-center"
              style={{
                backgroundColor: theme.card,
                color: theme.textSecondary,
                border: `1px solid ${theme.border}`
              }}
            >
              {selectedTramite.estado === 'finalizado' ? '✓ Finalizado' : '✗ Rechazado'}
            </div>
          )}
        </div>
      </div>
    );
  };

  // Estados disponibles para filtros
  const estadosDisponibles = [
    { id: 'iniciado', label: 'Iniciado', color: '#6366f1', icon: Sparkles },
    { id: 'en_revision', label: 'Revisión', color: '#3b82f6', icon: Eye },
    { id: 'requiere_documentacion', label: 'Req. Doc.', color: '#f59e0b', icon: FileText },
    { id: 'en_proceso', label: 'En Proceso', color: '#8b5cf6', icon: Play },
    { id: 'aprobado', label: 'Aprobado', color: '#10b981', icon: CheckCircle },
    { id: 'finalizado', label: 'Finalizado', color: '#22c55e', icon: CheckCircle2 },
    { id: 'rechazado', label: 'Rechazado', color: '#ef4444', icon: XCircle },
  ];

  return (
    <>
      <ABMPage
        title="Trámites"
        buttonLabel="Nuevo Trámite"
        onAdd={openWizard}
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Buscar por número, asunto o solicitante..."
        loading={false}
        isEmpty={!loading && filteredTramites.length === 0}
        emptyMessage="No hay trámites. Iniciá el primer trámite municipal."
        defaultViewMode="cards"
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
              onClick={() => setOrdenamiento('vencimiento')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all hover:scale-105 active:scale-95 whitespace-nowrap"
              style={{
                backgroundColor: ordenamiento === 'vencimiento' ? `${theme.primary}15` : theme.backgroundSecondary,
                border: `1px solid ${ordenamiento === 'vencimiento' ? theme.primary : theme.border}`,
                color: ordenamiento === 'vencimiento' ? theme.primary : theme.textSecondary,
              }}
            >
              <Calendar className="h-3 w-3" />
              Por vencer
            </button>
          </div>
        }
        stickyHeader={user?.rol === 'supervisor' || user?.rol === 'admin'}
        secondaryFilters={
          <div className="w-full flex flex-col gap-1">
            {/* Tipos de trámite - botón Todos fijo + scroll horizontal */}
            <div className="flex gap-1">
              {/* Botón Todos fijo - outlined */}
              <button
                onClick={() => setFiltroTipo(null)}
                className="flex items-center gap-1 px-2 py-1 rounded-md transition-all h-[28px] flex-shrink-0"
                style={{
                  background: 'transparent',
                  border: `1.5px solid ${filtroTipo === null ? theme.primary : theme.border}`,
                }}
              >
                <Tag className="h-3 w-3" style={{ color: filtroTipo === null ? theme.primary : theme.textSecondary }} />
                <span className="text-[10px] font-medium whitespace-nowrap" style={{ color: filtroTipo === null ? theme.primary : theme.textSecondary }}>
                  Todos
                </span>
              </button>

              {/* Scroll de tipos */}
              <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide flex-1 min-w-0">
              {/* Skeleton completo mientras cargan los tipos */}
              {loadingFilters ? (
                <>
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <div
                      key={`skeleton-tipo-${i}`}
                      className="h-[28px] w-[50px] rounded-md animate-pulse flex-shrink-0"
                      style={{ background: `${theme.border}40` }}
                    />
                  ))}
                </>
              ) : (
              <>
              {/* Chips por tipo de trámite (solo los que tienen al menos 1) */}
              {tiposTramite.filter((tipo) => (conteosTipos[tipo.id] || 0) > 0).map((tipo) => {
                const isSelected = filtroTipo === tipo.id;
                const tipoColor = tipo.color || '#6b7280';
                const count = conteosTipos[tipo.id] || 0;
                return (
                  <button
                    key={tipo.id}
                    onClick={() => setFiltroTipo(isSelected ? null : tipo.id)}
                    title={tipo.nombre}
                    className="flex items-center gap-1 px-2 py-1 rounded-md transition-all h-[28px] flex-shrink-0"
                    style={{
                      background: isSelected ? tipoColor : theme.backgroundSecondary,
                      border: `1px solid ${isSelected ? tipoColor : theme.border}`,
                    }}
                  >
                    <span className="[&>svg]:h-3 [&>svg]:w-3" style={{ color: isSelected ? '#ffffff' : tipoColor }}>
                      {getServicioIcon(tipo.icono)}
                    </span>
                    <span className="text-[10px] font-medium whitespace-nowrap" style={{ color: isSelected ? '#ffffff' : theme.text }}>
                      {tipo.nombre.split(' ')[0]}
                    </span>
                    <span
                      className="text-[9px] font-bold px-1 rounded-full"
                      style={{
                        backgroundColor: isSelected ? 'rgba(255,255,255,0.3)' : `${tipoColor}30`,
                        color: isSelected ? '#ffffff' : tipoColor,
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

            {/* Dependencias - solo si hay dependencias disponibles */}
            {dependenciasDisponibles.length > 0 && (
            <div className="flex gap-1">
              {/* Botón Todos fijo */}
              <button
                onClick={() => setFiltroDependencia(null)}
                className="flex items-center gap-1 px-2 py-1 rounded-md transition-all h-[26px] flex-shrink-0"
                style={{
                  background: 'transparent',
                  border: `1.5px solid ${filtroDependencia === null ? theme.primary : theme.border}`,
                }}
              >
                <Users className="h-3 w-3" style={{ color: filtroDependencia === null ? theme.primary : theme.textSecondary }} />
                <span className="text-[10px] font-medium whitespace-nowrap" style={{ color: filtroDependencia === null ? theme.primary : theme.textSecondary }}>
                  Todas
                </span>
              </button>

              {/* Scroll de dependencias */}
              <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide flex-1 min-w-0">
                {dependenciasDisponibles.map((dep) => {
                  const isSelected = filtroDependencia === dep.id;
                  const depColor = dep.color || '#6b7280';
                  const count = conteosDependencias[dep.id] || 0;
                  return (
                    <button
                      key={dep.id}
                      onClick={() => setFiltroDependencia(isSelected ? null : dep.id)}
                      title={dep.nombre}
                      className="flex items-center gap-1 px-2 py-1 rounded-md transition-all h-[26px] flex-shrink-0"
                      style={{
                        background: isSelected ? depColor : `${depColor}15`,
                        border: `1px solid ${isSelected ? depColor : `${depColor}40`}`,
                      }}
                    >
                      <span className="[&>svg]:h-3 [&>svg]:w-3" style={{ color: isSelected ? '#ffffff' : depColor }}>
                        {getServicioIcon(dep.icono)}
                      </span>
                      <span
                        className="text-[10px] font-medium whitespace-nowrap max-w-[80px] truncate"
                        style={{ color: isSelected ? '#ffffff' : theme.text }}
                      >
                        {dep.nombre.replace('Dirección de ', '').replace('Secretaría de ', '').split(' ')[0]}
                      </span>
                      <span
                        className="text-[9px] font-bold px-1 rounded-full"
                        style={{
                          backgroundColor: isSelected ? 'rgba(255,255,255,0.3)' : `${depColor}30`,
                          color: isSelected ? '#ffffff' : depColor,
                        }}
                      >
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
            )}

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
              {loadingFilters ? (
                <>
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div
                      key={`skeleton-estado-${i}`}
                      className="h-[26px] w-[45px] rounded-md animate-pulse flex-shrink-0"
                      style={{ background: `${theme.border}40` }}
                    />
                  ))}
                </>
              ) : (
              estadosDisponibles.map((estado) => {
                const Icon = estado.icon;
                const isActive = filtroEstado === estado.id;
                const isLoadingThis = filterLoading === `estado-${estado.id}`;
                const count = conteosEstados[estado.id] || 0;
                return (
                  <button
                    key={estado.id}
                    onClick={() => {
                      setFilterLoading(`estado-${estado.id}`);
                      setFiltroEstado(filtroEstado === estado.id ? '' : estado.id);
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
                      {count}
                    </span>
                  </button>
                );
              }))}
              </div>
            </div>
          </div>
        }
        tableView={
          <ABMTable
            data={filteredTramites}
            columns={[
              { key: 'numero_tramite', header: '#', render: (t) => <span className="font-mono text-xs">{t.numero_tramite}</span> },
              { key: 'asunto', header: 'Asunto', render: (t) => <span className="text-sm font-medium">{t.asunto}</span> },
              { key: 'servicio', header: 'Servicio', render: (t) => {
                const info = getServicioInfo(t);
                return (
                  <span className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: info.color }}></span>
                    {info.nombre}
                  </span>
                );
              }},
              { key: 'estado', header: 'Estado', render: (t) => {
                const estado = estadoColors[t.estado] || { bg: '#6b7280', text: '#ffffff' };
                return (
                  <span
                    className="px-2 py-1 text-xs font-medium rounded-full"
                    style={{ backgroundColor: `${estado.bg}20`, color: estado.bg }}
                  >
                    {estadoLabels[t.estado] || t.estado}
                  </span>
                );
              }},
              { key: 'solicitante', header: 'Solicitante', render: (t) => (
                <div className="flex items-center gap-2">
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: `${theme.primary}15` }}
                  >
                    <User className="h-3 w-3" style={{ color: theme.primary }} />
                  </div>
                  <span className="truncate" style={{ color: theme.text }}>
                    {t.nombre_solicitante || '-'}
                  </span>
                </div>
              )},
              { key: 'created_at', header: 'Creación', render: (t) => new Date(t.created_at).toLocaleDateString() },
              { key: 'updated_at', header: 'Actualización', render: (t) => t.updated_at ? new Date(t.updated_at).toLocaleDateString() : '-' },
              { key: 'vencimiento', header: 'Por vencer', render: (t) => {
                // Calcular vencimiento basado en tiempo_estimado_dias desde created_at
                const tiempoEstimado = t.servicio?.tiempo_estimado_dias || t.tramite?.tiempo_estimado_dias || 0;
                if (!tiempoEstimado) {
                  return <span className="text-xs" style={{ color: theme.textSecondary }}>-</span>;
                }
                const fechaCreacion = new Date(t.created_at);
                const fechaVencimiento = new Date(fechaCreacion);
                fechaVencimiento.setDate(fechaVencimiento.getDate() + tiempoEstimado);

                const ahora = new Date();
                const diffMs = fechaVencimiento.getTime() - ahora.getTime();
                const diffHoras = Math.ceil(diffMs / (1000 * 60 * 60));
                const diffDias = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
                const diffSemanas = Math.ceil(diffDias / 7);

                let color = theme.textSecondary;
                let bgColor = 'transparent';
                let texto = '';

                if (diffHoras < 0) {
                  color = '#ef4444';
                  bgColor = '#ef444415';
                  const diasVencido = Math.abs(diffDias);
                  texto = diasVencido >= 7 ? `Vencido (${Math.floor(diasVencido/7)}sem)` : `Vencido (${diasVencido}d)`;
                } else if (diffHoras <= 24) {
                  color = '#f59e0b';
                  bgColor = '#f59e0b15';
                  texto = diffHoras <= 1 ? '1 hora' : `${diffHoras} horas`;
                } else if (diffDias <= 2) {
                  color = '#eab308';
                  bgColor = '#eab30815';
                  texto = diffDias === 1 ? 'Mañana' : `${diffDias} días`;
                } else if (diffDias <= 7) {
                  texto = `${diffDias} días`;
                } else {
                  texto = `${diffSemanas} sem`;
                }

                return (
                  <span
                    className="text-xs px-2 py-0.5 rounded font-medium"
                    style={{ color, backgroundColor: bgColor }}
                  >
                    {texto}
                  </span>
                );
              }},
            ]}
            keyExtractor={(t) => t.id}
            onRowClick={(t) => openViewSheet(t)}
          />
        }
      >
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <ABMCardSkeleton key={`skeleton-${i}`} index={i} />
          ))
        ) : (
          filteredTramites.map((tramite) => {
            const estado = estadoColors[tramite.estado] || { bg: '#6b7280', text: '#ffffff' };
            const servicioInfo = getServicioInfo(tramite);

            return (
              <div
                key={tramite.id}
                onClick={() => openViewSheet(tramite)}
                className="group relative rounded-2xl cursor-pointer overflow-hidden abm-card-hover transition-all duration-500"
                style={{
                  backgroundColor: theme.card,
                  border: `1px solid ${theme.border}`,
                }}
              >
                {/* Contenido principal */}
                <div className="relative z-10 p-5">
                  {/* Header con gradiente */}
                  <div
                    className="flex items-center justify-between -mx-5 -mt-5 mb-4 px-4 py-3 rounded-t-xl"
                    style={{
                      background: `linear-gradient(135deg, ${servicioInfo.color} 0%, ${servicioInfo.color}80 100%)`,
                      borderBottom: `1px solid ${servicioInfo.color}`
                    }}
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}
                      >
                        <span className="text-white">{getServicioIcon(servicioInfo.icono)}</span>
                      </div>
                      <span className="font-semibold text-sm line-clamp-1 text-white">
                        {tramite.asunto}
                      </span>
                    </div>
                    <span
                      className="px-3 py-1 text-xs font-semibold rounded-full shadow-sm flex-shrink-0 ml-2 flex items-center gap-1.5"
                      style={{
                        backgroundColor: theme.card,
                        color: estado.bg,
                        boxShadow: `0 2px 4px ${estado.bg}20`
                      }}
                    >
                      {getEstadoIcon(tramite.estado)}
                      {estadoLabels[tramite.estado] || tramite.estado}
                    </span>
                  </div>

                  {/* Badge de servicio */}
                  <div className="flex items-center gap-2 mb-3">
                    <div
                      className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
                      style={{
                        backgroundColor: `${servicioInfo.color}15`,
                        border: `1px solid ${servicioInfo.color}40`,
                      }}
                    >
                      <div
                        className="w-5 h-5 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: servicioInfo.color }}
                      >
                        <span className="text-white text-xs">{getServicioIcon(servicioInfo.icono)}</span>
                      </div>
                      <span className="text-xs font-semibold" style={{ color: servicioInfo.color }}>
                        {servicioInfo.nombre}
                      </span>
                    </div>
                    <span className="text-xs" style={{ color: theme.textSecondary }}>#{tramite.numero_tramite}</span>
                  </div>

                  {/* Descripción si existe */}
                  {tramite.descripcion && (
                    <p className="text-sm line-clamp-2" style={{ color: theme.textSecondary }}>
                      {tramite.descripcion}
                    </p>
                  )}

                  {/* Footer */}
                  <div
                    className="flex items-center justify-between mt-4 pt-4 text-xs"
                    style={{ borderTop: `1px solid ${theme.border}`, color: theme.textSecondary }}
                  >
                    <div className="flex items-center space-x-3">
                      <span className="flex items-center">
                        <Calendar className="h-3 w-3 mr-1" />
                        {new Date(tramite.created_at).toLocaleDateString()}
                      </span>
                      {tramite.nombre_solicitante && (
                        <span className="flex items-center">
                          <User className="h-3 w-3 mr-1" />
                          {tramite.nombre_solicitante}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {tramite.dependencia_asignada && (
                        <span style={{ color: theme.primary }} className="font-medium">{tramite.dependencia_asignada.nombre}</span>
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

      {/* Sheet para ver detalle */}
      <Sheet
        open={sheetMode === 'view'}
        onClose={closeSheet}
        title={`Trámite #${selectedTramite?.numero_tramite || ''}`}
        description={selectedTramite?.asunto}
        stickyHeader={renderSheetStickyHeader()}
        stickyFooter={renderSheetFooter()}
      >
        {renderViewContent()}
      </Sheet>

      {/* Wizard Modal */}
      <WizardModal
        open={wizardOpen}
        onClose={closeWizard}
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
    </>
  );
}
