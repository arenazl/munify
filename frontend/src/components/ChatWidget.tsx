import { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Send, Bot, User, Loader2, AlertCircle, Database, Maximize2, Minimize2, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Table2, Download, TrendingUp, TrendingDown, Star, Save, Play, Users, FileText, MapPin, Folder, Layers, AlertTriangle, LayoutGrid, List, BarChart3, Rows3, Plus, Sparkles, Pin, PinOff } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { chatApi } from '../lib/api';
import { useNavigate, useLocation } from 'react-router-dom';
import { parseMarkdown } from './parseMarkdown';
import { Modal } from './ui/Modal';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  rawData?: any[]; // Datos crudos del SQL (solo para consultas)
  sqlQuery?: string; // SQL ejecutado (solo para consultas)
}

// Cache global para mantener estado entre cierres del chat
const chatCache: {
  messages: Message[];
  isMaximized: boolean;
} = {
  messages: [],
  isMaximized: false
};

// Interfaces para el panel BI
interface KPIsData {
  reclamos: {
    total: number;
    pendientes: number;
    nuevos: number;
    asignados: number;
    en_curso: number;
    resueltos: number;
    hoy: number;
    esta_semana: number;
    este_mes: number;
  };
  tramites: {
    total: number;
    iniciados: number;
    en_revision: number;
    en_curso: number;
    aprobados: number;
    esta_semana: number;
  };
  empleados: {
    total: number;
    activos: number;
  };
  tendencias: {
    reclamos_cambio_semanal: number;
    reclamos_semana_pasada: number;
  };
}

interface Entity {
  nombre: string;
  tabla: string;
  icono: string;
  descripcion: string;
  campos: string[];
}

interface ConsultaGuardada {
  id: number;
  nombre: string;
  descripcion: string | null;
  pregunta_original: string;
  icono: string;
  color: string;
  veces_ejecutada: number;
  es_publica: boolean;
}

// Mapeo de iconos string a componentes
const iconMap: Record<string, React.ReactNode> = {
  'alert-triangle': <AlertTriangle className="h-4 w-4" />,
  'users': <Users className="h-4 w-4" />,
  'folder': <Folder className="h-4 w-4" />,
  'map-pin': <MapPin className="h-4 w-4" />,
  'file-text': <FileText className="h-4 w-4" />,
  'layers': <Layers className="h-4 w-4" />,
  'user': <User className="h-4 w-4" />,
  'database': <Database className="h-4 w-4" />,
  'star': <Star className="h-4 w-4" />,
};

// Fallback estático mientras se resuelve la generación dinámica con IA
const DEFAULT_QUICK_PROMPTS: string[] = [
  'Resumen de reclamos por estado',
  '¿Cuántos reclamos pendientes hay?',
  'Trámites activos esta semana',
  'Top categorías más reportadas',
  '¿Qué debería priorizar hoy?',
];

function ChatDataView({ data, theme }: { data: any[]; theme: any }) {
  if (!data || data.length === 0) return null;
  const keys = Object.keys(data[0]);
  const hasNumericCol = keys.some(k => /cant|count|total|cantidad|resueltos|pendientes/i.test(k));

  // Caso 1: dato único (ej: {total: 4}) → mostrar número grande
  if (data.length === 1 && keys.length <= 2 && hasNumericCol) {
    const numKey = keys.find(k => /cant|count|total|cantidad|resueltos|pendientes/i.test(k))!;
    const labelKey = keys.find(k => k !== numKey);
    return (
      <div className="text-center py-2">
        <div className="text-2xl font-bold" style={{ color: theme.primary }}>{data[0][numKey]}</div>
        <div className="text-[11px] mt-1" style={{ color: theme.textSecondary }}>
          {labelKey ? data[0][labelKey] : numKey.replace(/_/g, ' ')}
        </div>
      </div>
    );
  }

  // Caso 2: agrupados (nombre + cantidad) → filas compactas
  if (keys.length <= 3 && hasNumericCol) {
    const numKey = keys.find(k => /cant|count|total|cantidad|resueltos|pendientes/i.test(k))!;
    const labelKey = keys.find(k => k !== numKey && !/^id$/i.test(k)) || keys[0];
    const total = data.reduce((s, r) => s + (Number(r[numKey]) || 0), 0);
    return (
      <div className="space-y-1">
        {data.map((row, i) => (
          <div
            key={i}
            className="flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs"
            style={{ backgroundColor: `${theme.primary}10`, border: `1px solid ${theme.border}` }}
          >
            <span style={{ color: theme.text }}>{row[labelKey]}</span>
            <strong style={{ color: theme.primary }}>{row[numKey]}</strong>
          </div>
        ))}
        <p className="text-[10px] mt-1.5" style={{ color: theme.textSecondary }}>
          Total: {total} · {data.length} items
        </p>
      </div>
    );
  }

  // Caso 3: listado (reclamos, trámites, etc) → cards con border-left
  return (
    <div className="space-y-1.5">
      {data.slice(0, 10).map((row, i) => {
        const vals = Object.values(row).map(v => v != null ? String(v) : '');
        const id = row.id;
        const title = row.titulo || row.nombre || row.asunto || row.email || vals.find(v => v.length > 3 && !/^\d+$/.test(v)) || `Registro ${i + 1}`;
        const meta = Object.entries(row)
          .filter(([k, v]) => k !== 'id' && k !== 'titulo' && k !== 'nombre' && k !== 'asunto' && v != null)
          .map(([, v]) => {
            const s = String(v);
            if (s.match(/^\d{4}-\d{2}-\d{2}/)) return s.slice(0, 10);
            return s.length > 30 ? s.slice(0, 30) + '…' : s;
          })
          .slice(0, 3)
          .join(' · ');
        return (
          <div
            key={i}
            className="px-2.5 py-2 rounded-md text-xs"
            style={{ borderLeft: `3px solid ${theme.primary}`, backgroundColor: `${theme.primary}08` }}
          >
            <div className="font-semibold truncate" style={{ color: theme.text }}>
              {id != null && <span style={{ color: theme.textSecondary }}>#{id} </span>}
              {title}
            </div>
            {meta && <div className="truncate mt-0.5" style={{ color: theme.textSecondary }}>{meta}</div>}
          </div>
        );
      })}
      {data.length > 10 && (
        <p className="text-[10px]" style={{ color: theme.textSecondary }}>...y {data.length - 10} más</p>
      )}
    </div>
  );
}

export function ChatWidget() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Sugerencias dinámicas generadas por IA según ruta + rol (con cache backend)
  const [quickPrompts, setQuickPrompts] = useState<string[]>(DEFAULT_QUICK_PROMPTS);
  useEffect(() => {
    let alive = true;
    const rol = user?.rol || 'vecino';
    chatApi.getQuickPrompts(location.pathname, rol).then(prompts => {
      if (alive && prompts.length > 0) setQuickPrompts(prompts);
    });
    return () => { alive = false; };
  }, [location.pathname, user?.rol]);

  // Determinar si puede usar el asistente con datos (gestores)
  // Automáticamente activado para supervisores/admins
  const canUseDataAssistant = user && ['admin', 'supervisor', 'super_admin'].includes(user.rol);
  const [isMaximized, setIsMaximized] = useState(chatCache.isMaximized);

  const handleLinkClick = (url: string) => {
    setIsPinned(false);
    setIsHovered(false);
    navigate(url);
  };

  // Procesar HTML del backend para adaptar colores al tema
  const processHtml = (html: string): string => {
    return html
      // Cards: fondo claro con texto oscuro
      .replace(/background:#f8f9fa/g, `background:${theme.card}`)
      .replace(/background: #f8f9fa/g, `background:${theme.card}`)
      // Headers azules: usar primary del tema
      .replace(/background:#2563eb/g, `background:${theme.primary}`)
      .replace(/background: #2563eb/g, `background:${theme.primary}`)
      // Info boxes
      .replace(/background:#dbeafe/g, `background:${theme.primary}20`)
      .replace(/background: #dbeafe/g, `background:${theme.primary}20`)
      .replace(/border-left:4px solid #2563eb/g, `border-left:4px solid ${theme.primary}`)
      // Bordes de cards
      .replace(/border:1px solid #e2e8f0/g, `border:1px solid ${theme.border}`)
      // Links
      .replace(/color:#2563eb/g, `color:${theme.primary}`)
      .replace(/color: #2563eb/g, `color:${theme.primary}`)
      // Agregar color de texto a los contenidos de las cards
      .replace(/<div style="padding:12px 14px">/g, `<div style="padding:12px 14px;color:${theme.text}">`)
      .replace(/<p style="margin:8px 0">/g, `<p style="margin:8px 0;color:${theme.text}">`)
      .replace(/<li style="margin:6px 0">/g, `<li style="margin:6px 0;color:${theme.text}">`)
      .replace(/<ol style="margin:8px 0;padding-left:20px">/g, `<ol style="margin:8px 0;padding-left:20px;color:${theme.text}">`)
      .replace(/<ul style="margin:8px 0;padding-left:20px">/g, `<ul style="margin:8px 0;padding-left:20px;color:${theme.text}">`);
  };
  const isVecino = user?.rol === 'vecino';
  const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 1024;
  // Pin: el vecino ancla el panel y queda abierto aunque saque el mouse.
  // Persiste entre sesiones en localStorage.
  const [isPinned, setIsPinned] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('chat_pinned') === 'true';
  });
  // Hover: el panel se abre al pasar el mouse sobre la línea/panel y se
  // cierra al salir. El estado abierto efectivo = pinned OR hovered.
  const [isHovered, setIsHovered] = useState(false);
  const isOpen = isPinned || isHovered;
  // Legacy setter para el evento global munify:toggle-chat (lo invierte el pin).
  const setIsOpen = (v: boolean | ((o: boolean) => boolean)) => {
    setIsPinned(prev => (typeof v === 'function' ? v(prev) : v));
  };
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    if (typeof window === 'undefined') return 260;
    const saved = localStorage.getItem('chat_sidebar_width');
    return 240;
  });
  const isResizing = useRef(false);

  // Toggle desde topbar — ahora pisa el pin (forzar abrir/cerrar).
  useEffect(() => {
    const toggle = () => setIsPinned(o => !o);
    window.addEventListener('munify:toggle-chat', toggle);
    return () => window.removeEventListener('munify:toggle-chat', toggle);
  }, []);

  // Persistir pin en localStorage.
  useEffect(() => {
    localStorage.setItem('chat_pinned', isPinned ? 'true' : 'false');
  }, [isPinned]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isResizing.current) return;
      const w = Math.max(160, Math.min(720, window.innerWidth - e.clientX));
      setSidebarWidth(w);
    };
    const onUp = () => {
      if (isResizing.current) {
        isResizing.current = false;
        localStorage.setItem('chat_sidebar_width', String(sidebarWidth));
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [sidebarWidth]);
  const [messages, setMessages] = useState<Message[]>(chatCache.messages);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [showRawData, setShowRawData] = useState(false);
  const [lastRawData, setLastRawData] = useState<any[] | null>(null);
  const [lastSqlQuery, setLastSqlQuery] = useState<string | null>(null);

  // Formato de visualización seleccionado
  type DisplayFormat = 'auto' | 'cards' | 'table' | 'list' | 'grouped';
  const [displayFormat, setDisplayFormat] = useState<DisplayFormat>('auto');

  const formatOptions: { id: DisplayFormat; icon: React.ReactNode; label: string; hint: string }[] = [
    { id: 'auto', icon: <Star className="h-3.5 w-3.5" />, label: 'Auto', hint: 'La IA elige el mejor formato' },
    { id: 'cards', icon: <LayoutGrid className="h-3.5 w-3.5" />, label: 'Cards', hint: 'Paneles con KPIs destacados' },
    { id: 'table', icon: <Table2 className="h-3.5 w-3.5" />, label: 'Tabla', hint: 'Datos en filas y columnas' },
    { id: 'list', icon: <List className="h-3.5 w-3.5" />, label: 'Lista', hint: 'Items uno debajo del otro' },
    { id: 'grouped', icon: <Rows3 className="h-3.5 w-3.5" />, label: 'Agrupado', hint: 'Datos jerárquicos en secciones' },
  ];

  // Sincronizar cambios al cache global
  useEffect(() => {
    chatCache.messages = messages;
  }, [messages]);

  useEffect(() => {
    chatCache.isMaximized = isMaximized;
  }, [isMaximized]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const resetConversation = () => {
    setMessages([]);
    setInput('');
    setError(null);
    setLastRawData(null);
    setLastSqlQuery(null);
    setShowRawData(false);
  };

  const sendMessage = async (promptOverride?: string) => {
    const textToSend = promptOverride ?? input;
    if (!textToSend.trim() || loading) return;

    // Agregar sufijo de formato si no es 'auto'
    const formatSuffix = displayFormat !== 'auto' ? ` [formato: ${displayFormat}]` : '';
    const inputWithFormat = textToSend + formatSuffix;

    const userMessage: Message = { role: 'user', content: textToSend }; // Mostrar sin el sufijo
    const currentInput = inputWithFormat; // Enviar con el sufijo
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);
    setError(null);

    try {
      let response;

      let currentRawData: any[] | null = null;
      let currentSqlQuery: string | null = null;

      if (canUseDataAssistant) {
        // Para supervisores/admins: usar SQL dinámico con historial
        // Convertir messages al formato esperado por el API, incluyendo SQL ejecutado si existe
        const historial = messages.map(m => {
          // Si el mensaje tiene SQL, agregarlo al contenido para contexto
          if (m.sqlQuery) {
            return { role: m.role, content: m.content, sql: m.sqlQuery };
          }
          return { role: m.role, content: m.content };
        });
        const consultaResult = await chatApi.consulta(currentInput, 1, 50, historial);
        response = { response: consultaResult.response };
        // Guardar datos crudos y SQL para mostrar en panel expandible
        if (consultaResult.datos_crudos) {
          currentRawData = consultaResult.datos_crudos;
          setLastRawData(consultaResult.datos_crudos);
        }
        if (consultaResult.sql_ejecutado) {
          currentSqlQuery = consultaResult.sql_ejecutado;
          setLastSqlQuery(consultaResult.sql_ejecutado);
        }
      } else {
        // Para usuarios sin permisos: chat normal
        response = await chatApi.sendMessage(currentInput, messages);
      }

      const assistantMessage: Message = {
        role: 'assistant',
        content: response.response,
        rawData: currentRawData || undefined,
        sqlQuery: currentSqlQuery || undefined
      };
      setMessages(prev => [...prev, assistantMessage]);
    } catch (err: any) {
      const errorMsg = err.response?.data?.detail || 'Error al conectar con el asistente';
      setError(errorMsg);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: errorMsg.includes('Ollama')
          ? 'El asistente no está disponible. Asegurate de que Ollama esté corriendo (ejecutá "ollama serve").'
          : 'Lo siento, hubo un error. Por favor intenta de nuevo.'
      }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Barra colapsada del trigger: gradiente vertical + ícono de bot
          centrado arriba. Más visible que la línea fina anterior y deja
          claro qué hace al pasar el mouse. */}
      <div
        onMouseEnter={() => setIsHovered(true)}
        onClick={() => setIsPinned(true)}
        className="fixed right-0 top-0 bottom-0 transition-all flex flex-col items-center pt-4 group"
        style={{
          zIndex: isOpen ? 29 : 50,
          width: isOpen ? '4px' : '18px',
          background: isOpen
            ? theme.primary
            : `linear-gradient(180deg, ${theme.primary} 0%, ${theme.primary}cc 100%)`,
          opacity: isOpen ? 0 : 1,
          pointerEvents: isOpen ? 'none' : 'auto',
          cursor: 'pointer',
          boxShadow: isOpen ? 'none' : `-4px 0 12px ${theme.primary}40`,
        }}
        title="Asistente IA — click o hover para abrir"
      >
        {!isOpen && (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke={theme.primaryText || '#ffffff'}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4 transition-transform group-hover:scale-110"
          >
            <path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z" />
          </svg>
        )}
        {!isOpen && (
          <span
            className="mt-3 text-[10px] font-bold tracking-wider opacity-80"
            style={{
              color: theme.primaryText || '#ffffff',
              writingMode: 'vertical-rl',
              transform: 'rotate(180deg)',
              letterSpacing: '0.15em',
            }}
          >
            ASISTENTE IA
          </span>
        )}
      </div>


      {/* Panel lateral con slide-in desde la derecha. Siempre renderizado para
          que el CSS transition anime el transform. Si no está pinned y el
          mouse sale, se cierra con animación. */}
      <div
        className="flex flex-col overflow-hidden backdrop-blur-sm chat-overlay"
        style={{
          position: 'fixed',
          top: '56px',
          right: 0,
          bottom: 0,
          width: `${sidebarWidth}px`,
          zIndex: 30,
          transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 220ms cubic-bezier(0.22, 1, 0.36, 1), opacity 0.15s',
          backgroundColor: theme.card,
          borderLeft: `1px solid ${theme.border}`,
          boxShadow: isOpen ? '-8px 0 28px rgba(0, 0, 0, 0.18)' : 'none',
          pointerEvents: isOpen ? 'auto' : 'none',
          opacity: isOpen ? 1 : 0.98,
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Handle de resize — barra vertical en el borde izquierdo */}
        {isOpen && (
          <div
            onMouseDown={(e) => {
              e.preventDefault();
              isResizing.current = true;
              document.body.style.userSelect = 'none';
              document.body.style.cursor = 'col-resize';
            }}
            className="absolute top-0 left-0 bottom-0 w-1.5 cursor-col-resize hover:w-2 transition-all group"
            style={{ zIndex: 41 }}
            title="Arrastrar para cambiar ancho"
          >
            <div
              className="w-full h-full transition-colors group-hover:bg-[var(--color-primary)]"
              style={{ backgroundColor: 'transparent' }}
            />
          </div>
        )}

        {/* Barra de controles del panel */}
        {isOpen && (
          <div
            className="flex items-center justify-between flex-shrink-0 gap-2 px-3 py-2"
            style={{
              borderBottom: `1px solid ${theme.border}`,
              backgroundColor: theme.backgroundSecondary,
            }}
          >
            {/* PIN: botón grande y claro para anclar/desanclar */}
            <button
              onClick={() => setIsPinned(p => !p)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-all hover:scale-[1.03] active:scale-95 text-[11px] font-semibold"
              style={{
                color: isPinned ? theme.primaryText : theme.primary,
                backgroundColor: isPinned ? theme.primary : `${theme.primary}15`,
                border: `1px solid ${theme.primary}`,
              }}
              title={isPinned ? 'Desanclar (se cerrará al sacar el mouse)' : 'Anclar panel abierto'}
            >
              {isPinned ? <Pin className="h-3.5 w-3.5" /> : <PinOff className="h-3.5 w-3.5" />}
              <span>{isPinned ? 'Anclado' : 'Anclar'}</span>
            </button>

            {/* Nueva conversación (derecha) */}
            {messages.length > 0 && (
              <button
                onClick={resetConversation}
                className="px-2 py-1 rounded-md transition-all hover:bg-black/10 flex items-center gap-1"
                style={{ color: theme.textSecondary }}
                title="Nueva conversación"
              >
                <Plus className="h-3 w-3" />
                <span className="text-[10px] font-medium">Nueva</span>
              </button>
            )}
          </div>
        )}

        {/* Contenido principal - layout diferente según maximizado */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Área del chat */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Messages */}
            <div
              className="flex-1 overflow-y-auto p-4 space-y-4"
              style={{ '--chat-accent-color': theme.primary } as React.CSSProperties}
            >
              {messages.length === 0 && (
                <div className="text-center py-4" style={{ color: theme.textSecondary }}>
                  <Bot className="h-10 w-10 mx-auto mb-2 opacity-50" />
                  <p className="text-xs opacity-70 mb-3">Preguntame o tocá una sugerencia</p>
                  <div className="flex flex-wrap gap-1.5 justify-center px-2">
                    {quickPrompts.map((q, i) => (
                      <button
                        key={i}
                        onClick={() => { sendMessage(q); }}
                        className="px-2.5 py-1.5 rounded-full text-[11px] transition-all hover:scale-105 active:scale-95"
                        style={{
                          backgroundColor: `${theme.primary}15`,
                          color: theme.primary,
                          border: `1px solid ${theme.primary}30`
                        }}
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {messages.map((msg, i) => {
                const hasData = msg.role === 'assistant' && msg.rawData && msg.rawData.length > 0;

                // Para resultados de datos: bot arriba, cards abajo a todo el ancho
                if (hasData) {
                  return (
                    <div key={i} className="flex flex-col gap-2 w-full">
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: `${theme.primary}20` }}
                      >
                        <Bot className="h-4 w-4" style={{ color: theme.primary }} />
                      </div>
                      <div className="w-full min-w-0">
                        <ChatDataView data={msg.rawData!} theme={theme} />
                      </div>
                    </div>
                  );
                }

                // Mensajes de texto: layout horizontal clásico
                return (
                  <div
                    key={i}
                    className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    {msg.role === 'assistant' && (
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: `${theme.primary}20` }}
                      >
                        <Bot className="h-4 w-4" style={{ color: theme.primary }} />
                      </div>
                    )}
                    <div
                      className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm ${
                        msg.role === 'user' ? 'rounded-br-sm' : 'rounded-bl-sm'
                      } chat-message`}
                      style={{
                        backgroundColor: msg.role === 'user' ? theme.primary : theme.backgroundSecondary,
                        color: msg.role === 'user' ? theme.primaryText : theme.text
                      }}
                    >
                      {msg.role === 'user' ? (
                        msg.content
                      ) : (
                        <div dangerouslySetInnerHTML={{ __html: processHtml(msg.content) }} />
                      )}
                    </div>
                    {msg.role === 'user' && (
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: theme.backgroundSecondary }}
                      >
                        <User className="h-4 w-4" style={{ color: theme.textSecondary }} />
                      </div>
                    )}
                  </div>
                );
              })}
              {loading && (
                <div className="flex gap-2">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: `${theme.primary}20` }}
                  >
                    <Loader2 className="h-4 w-4 animate-spin" style={{ color: theme.primary }} />
                  </div>
                  <div
                    className="px-4 py-2 rounded-2xl rounded-bl-sm"
                    style={{ backgroundColor: theme.backgroundSecondary }}
                  >
                    <div className="flex gap-1">
                      <span className="w-2 h-2 rounded-full animate-bounce" style={{ backgroundColor: theme.textSecondary, animationDelay: '0ms' }} />
                      <span className="w-2 h-2 rounded-full animate-bounce" style={{ backgroundColor: theme.textSecondary, animationDelay: '150ms' }} />
                      <span className="w-2 h-2 rounded-full animate-bounce" style={{ backgroundColor: theme.textSecondary, animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Error banner */}
            {error && error.includes('Ollama') && (
              <div
                className="mx-4 mb-2 px-3 py-2 rounded-lg text-xs flex items-center gap-2"
                style={{ backgroundColor: `${theme.primary}15`, color: theme.primary }}
              >
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span>Ejecutá <code className="font-mono bg-black/10 px-1 rounded">ollama serve</code> para activar el chat</span>
              </div>
            )}


            {/* Input */}
            <div
              className="p-2 flex gap-1.5 flex-shrink-0 items-center min-w-0"
              style={{ borderTop: `1px solid ${theme.border}` }}
            >
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                placeholder="Consulta..."
                className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg text-xs focus:outline-none focus:ring-1 transition-all"
                style={{
                  backgroundColor: theme.backgroundSecondary,
                  color: theme.text,
                  border: `1px solid ${theme.border}`
                }}
              />
              <button
                onClick={() => sendMessage()}
                disabled={!input.trim() || loading}
                className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
                style={{
                  backgroundColor: theme.primary,
                  color: theme.primaryText
                }}
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
