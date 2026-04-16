import { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Send, Bot, User, Loader2, AlertCircle, Database, Maximize2, Minimize2, ChevronDown, ChevronUp, Table2, Download, TrendingUp, TrendingDown, Star, Save, Play, Users, FileText, MapPin, Folder, Layers, AlertTriangle, LayoutGrid, List, BarChart3, Rows3 } from 'lucide-react';
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

// Sugerencias rápidas según la ruta actual
const getQuickPromptsForRoute = (pathname: string): string[] => {
  if (pathname.includes('/reclamos')) {
    return [
      '¿Cuántos reclamos pendientes hay?',
      'Reclamos más atrasados',
      'Reclamos de esta semana por categoría',
    ];
  }
  if (pathname.includes('/tramites') || pathname.includes('/solicitudes')) {
    return [
      '¿Cuántos trámites activos hay?',
      'Trámites pendientes por tipo',
      'Solicitudes de esta semana',
    ];
  }
  if (pathname.includes('/empleados')) {
    return [
      'Top 5 empleados con más reclamos resueltos',
      'Carga de trabajo por empleado',
      'Empleados activos',
    ];
  }
  if (pathname.includes('/dashboard') || pathname === '/' || pathname.includes('/gestion')) {
    return [
      'Resumen de reclamos por estado',
      '¿Cuántos vecinos tenemos?',
      'Trámites pendientes esta semana',
    ];
  }
  return [
    '¿Cuántos reclamos hay?',
    'Resumen general',
    'Top categorías',
  ];
};

export function ChatWidget() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const quickPrompts = getQuickPromptsForRoute(location.pathname);

  // Determinar si puede usar el asistente con datos (gestores)
  // Automáticamente activado para supervisores/admins
  const canUseDataAssistant = user && ['admin', 'supervisor', 'super_admin'].includes(user.rol);
  const [isMaximized, setIsMaximized] = useState(chatCache.isMaximized);

  const handleLinkClick = (url: string) => {
    setIsOpen(false);
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
  const [isOpen, setIsOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
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

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    // Agregar sufijo de formato si no es 'auto'
    const formatSuffix = displayFormat !== 'auto' ? ` [formato: ${displayFormat}]` : '';
    const inputWithFormat = input + formatSuffix;

    const userMessage: Message = { role: 'user', content: input }; // Mostrar sin el sufijo
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
      {/* Backdrop oscuro (solo cuando está maximizado) */}
      {isOpen && isMaximized && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-300"
          style={{ zIndex: 9998 }}
          onClick={() => setIsMaximized(false)}
        />
      )}

      {/* Chat footer / modal */}
      <div
        className={`
          flex flex-col overflow-hidden
          ${isMaximized ? 'rounded-2xl shadow-2xl' : ''}
          transition-all duration-300 ease-out
        `}
        style={{
          position: 'fixed',
          ...(isMaximized ? {
            // Estilo modal centrado (como los wizards)
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 'min(1200px, 90vw)',
            height: 'min(700px, 85vh)',
            borderRadius: '16px',
          } : {
            // Sidebar derecho slim: 40px colapsado, 320px al hover o click
            top: '0',
            right: '0',
            width: (isOpen || isHovered) ? '320px' : '40px',
            height: '100vh',
            borderRadius: '0',
          }),
          zIndex: 40,
          backgroundColor: theme.card,
          borderTop: !isMaximized ? `1px solid ${theme.border}` : undefined,
          border: isMaximized ? `1px solid ${theme.border}` : undefined,
          boxShadow: isMaximized ? '0 25px 50px -12px rgba(0, 0, 0, 0.5)' : `0 -4px 12px rgba(0, 0, 0, 0.06)`
        }}
        onMouseEnter={() => !isMaximized && setIsHovered(true)}
        onMouseLeave={() => !isOpen && setIsHovered(false)}
      >
        {/* Rail slim colapsado (cuando NO está expandido ni maximizado) */}
        {!isOpen && !isHovered && !isMaximized && (
          <div
            className="flex flex-col items-center justify-center gap-3 flex-1 cursor-pointer select-none"
            style={{ color: theme.textSecondary }}
          >
            {canUseDataAssistant ? <Database className="h-5 w-5" /> : <Bot className="h-5 w-5" />}
            <span
              className="text-[11px] font-medium tracking-wide"
              style={{
                writingMode: 'vertical-rl',
                transform: 'rotate(180deg)',
                color: theme.textSecondary,
              }}
            >
              {canUseDataAssistant ? 'Asistente con Datos' : 'Asistente'}
            </span>
          </div>
        )}

        {/* Header completo (solo cuando expandido o maximizado) */}
        {(isOpen || isHovered || isMaximized) && (
          <div
            className="flex items-center justify-between flex-shrink-0 cursor-pointer select-none"
            style={{
              padding: '10px 16px',
              background: `linear-gradient(135deg, ${theme.primary} 0%, ${theme.primaryHover} 100%)`,
            }}
            onClick={() => !isMaximized && setIsOpen(!isOpen)}
          >
            <div className="flex items-center gap-2" style={{ color: theme.primaryText }}>
              {canUseDataAssistant ? <Database className="h-5 w-5" /> : <Bot className="h-5 w-5" />}
              <span className="font-semibold text-sm">
                {isMaximized && canUseDataAssistant ? 'Panel de Consultas' : canUseDataAssistant ? 'Asistente con Datos' : 'Asistente Municipal'}
              </span>
            </div>
            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
              {/* Botón maximizar */}
              {canUseDataAssistant && (
                <button
                  onClick={() => setIsMaximized(!isMaximized)}
                  className="p-1.5 rounded-lg transition-colors hover:bg-white/20"
                  style={{ color: theme.primaryText }}
                  title={isMaximized ? 'Minimizar' : 'Maximizar panel'}
                >
                  {isMaximized ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                </button>
              )}
              {/* Pin/Unpin - si está fijo muestra X para desfijar */}
              {!isMaximized && (
                <button
                  onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }}
                  className="p-1.5 rounded-lg transition-colors hover:bg-white/20"
                  style={{ color: theme.primaryText }}
                  title={isOpen ? 'Desfijar (se oculta al salir)' : 'Fijar abierto'}
                >
                  {isOpen ? <X className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                </button>
              )}
              {/* Cerrar maximizado */}
              {isMaximized && (
                <button
                  onClick={() => setIsMaximized(false)}
                  className="p-1.5 rounded-lg transition-colors hover:bg-white/20"
                  style={{ color: theme.primaryText }}
                >
                  <X className="h-5 w-5" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Contenido principal - layout diferente según maximizado */}
        <div className={`flex-1 flex ${isMaximized ? 'flex-row' : 'flex-col'} overflow-hidden`}>

          {/* Panel lateral de sugerencias (solo maximizado y usuarios con datos) */}
          {isMaximized && canUseDataAssistant && (
            <div
              className="w-72 flex-shrink-0 p-4 overflow-y-auto"
              style={{ borderRight: `1px solid ${theme.border}`, backgroundColor: theme.backgroundSecondary }}
            >
              <h3 className="font-semibold text-sm mb-3" style={{ color: theme.text }}>
                Consultas rápidas
              </h3>

              {/* Categoría: Reclamos */}
              <div className="mb-4">
                <p className="text-xs font-medium mb-2 uppercase tracking-wide" style={{ color: theme.textSecondary }}>
                  📋 Reclamos
                </p>
                <div className="space-y-1.5">
                  {[
                    '¿Cuántos reclamos pendientes hay?',
                    '¿Cuáles son los reclamos más atrasados?',
                    'Reclamos de esta semana por categoría',
                    'Reclamos nuevos sin asignar',
                  ].map((q, i) => (
                    <button
                      key={i}
                      onClick={() => { setInput(q); }}
                      className="w-full text-left px-3 py-2 rounded-lg text-xs transition-colors hover:scale-[1.02]"
                      style={{
                        backgroundColor: theme.card,
                        color: theme.text,
                        border: `1px solid ${theme.border}`
                      }}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>

              {/* Categoría: Empleados */}
              <div className="mb-4">
                <p className="text-xs font-medium mb-2 uppercase tracking-wide" style={{ color: theme.textSecondary }}>
                  👥 Empleados
                </p>
                <div className="space-y-1.5">
                  {[
                    'Ranking de empleados por resueltos',
                    '¿Qué empleados tienen más carga?',
                    'Efectividad de cada empleado',
                  ].map((q, i) => (
                    <button
                      key={i}
                      onClick={() => { setInput(q); }}
                      className="w-full text-left px-3 py-2 rounded-lg text-xs transition-colors hover:scale-[1.02]"
                      style={{
                        backgroundColor: theme.card,
                        color: theme.text,
                        border: `1px solid ${theme.border}`
                      }}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>

              {/* Categoría: Análisis */}
              <div className="mb-4">
                <p className="text-xs font-medium mb-2 uppercase tracking-wide" style={{ color: theme.textSecondary }}>
                  📊 Análisis
                </p>
                <div className="space-y-1.5">
                  {[
                    'Reclamos por zona',
                    'Reclamos rechazados y motivos',
                    'Vecinos con más reclamos',
                    'Categorías más problemáticas',
                  ].map((q, i) => (
                    <button
                      key={i}
                      onClick={() => { setInput(q); }}
                      className="w-full text-left px-3 py-2 rounded-lg text-xs transition-colors hover:scale-[1.02]"
                      style={{
                        backgroundColor: theme.card,
                        color: theme.text,
                        border: `1px solid ${theme.border}`
                      }}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>

              {/* Categoría: Resumen */}
              <div>
                <p className="text-xs font-medium mb-2 uppercase tracking-wide" style={{ color: theme.textSecondary }}>
                  🎯 Resumen
                </p>
                <div className="space-y-1.5">
                  {[
                    'Dame un resumen general',
                    '¿Qué debería priorizar hoy?',
                  ].map((q, i) => (
                    <button
                      key={i}
                      onClick={() => { setInput(q); }}
                      className="w-full text-left px-3 py-2 rounded-lg text-xs transition-colors hover:scale-[1.02]"
                      style={{
                        backgroundColor: theme.card,
                        color: theme.text,
                        border: `1px solid ${theme.border}`
                      }}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Área del chat */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Messages */}
            <div
              className="flex-1 overflow-y-auto p-4 space-y-4"
              style={{ '--chat-accent-color': theme.primary } as React.CSSProperties}
            >
              {messages.length === 0 && (
                <div className="text-center py-4" style={{ color: theme.textSecondary }}>
                  {canUseDataAssistant ? (
                    <>
                      <Database className="h-10 w-10 mx-auto mb-2 opacity-50" />
                      <p className="text-sm font-medium">Asistente con Datos</p>
                      <p className="text-xs mt-1 mb-3">Preguntame lo que quieras sobre reclamos, trámites y empleados</p>

                      {/* Consultas rápidas como chips */}
                      {!isMaximized && (
                        <div className="flex flex-wrap gap-1.5 justify-center px-2">
                          {[
                            '¿Cuántos reclamos pendientes?',
                            'Empleados sin asignaciones',
                            'Reclamos de esta semana',
                            'Categoría con más reclamos',
                            'Ranking de empleados',
                            'Reclamos atrasados',
                            'Trámites en proceso',
                            'Resumen general',
                            'Zonas más problemáticas',
                            '¿Qué priorizar hoy?',
                          ].map((q, i) => (
                            <button
                              key={i}
                              onClick={() => { setInput(q); }}
                              className="px-2.5 py-1.5 rounded-full text-[11px] transition-all hover:scale-105"
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
                      )}
                      {isMaximized && (
                        <p className="text-xs opacity-70">Usá las consultas rápidas de la izquierda o escribí tu pregunta</p>
                      )}
                    </>
                  ) : (
                    <>
                      <Bot className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p className="text-sm">Hola! Soy tu asistente virtual.</p>
                      <p className="text-sm">En qué puedo ayudarte?</p>
                    </>
                  )}
                </div>
              )}
              {messages.map((msg, i) => (
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
                    className={`${isMaximized ? 'max-w-[70%]' : 'max-w-[80%]'} px-4 py-2 rounded-2xl text-sm ${
                      msg.role === 'user' ? 'rounded-br-sm' : 'rounded-bl-sm'
                    } chat-message`}
                    style={{
                      backgroundColor: msg.role === 'user' ? theme.primary : theme.backgroundSecondary,
                      color: msg.role === 'user' ? theme.primaryText : theme.text
                    }}
                    {...(msg.role === 'assistant'
                      ? { dangerouslySetInnerHTML: { __html: processHtml(msg.content) } }
                      : { children: msg.content }
                    )}
                  />
                  {msg.role === 'user' && (
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: theme.backgroundSecondary }}
                    >
                      <User className="h-4 w-4" style={{ color: theme.textSecondary }} />
                    </div>
                  )}
                </div>
              ))}
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

            {/* Panel de datos crudos (solo maximizado y con datos) */}
            {isMaximized && lastRawData && lastRawData.length > 0 && (
              <div
                className="mx-4 mb-2"
                style={{ borderTop: `1px solid ${theme.border}` }}
              >
                <button
                  onClick={() => setShowRawData(!showRawData)}
                  className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium hover:bg-black/5 transition-colors"
                  style={{ color: theme.textSecondary }}
                >
                  <span className="flex items-center gap-2">
                    <Table2 className="h-4 w-4" />
                    Ver datos ({lastRawData.length} registros)
                  </span>
                  {showRawData ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>

                {showRawData && (
                  <div className="pb-2">
                    {/* SQL ejecutado */}
                    {lastSqlQuery && (
                      <div
                        className="mx-3 mb-2 p-2 rounded text-xs font-mono overflow-x-auto"
                        style={{ backgroundColor: theme.backgroundSecondary, color: theme.textSecondary }}
                      >
                        <span style={{ color: theme.primary }}>SQL:</span> {lastSqlQuery.slice(0, 200)}{lastSqlQuery.length > 200 ? '...' : ''}
                      </div>
                    )}

                    {/* Tabla de datos */}
                    <div className="mx-3 overflow-auto max-h-48 rounded" style={{ border: `1px solid ${theme.border}` }}>
                      <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ backgroundColor: theme.backgroundSecondary }}>
                            {Object.keys(lastRawData[0]).map((col) => (
                              <th
                                key={col}
                                className="px-2 py-1.5 text-left font-semibold whitespace-nowrap"
                                style={{ borderBottom: `1px solid ${theme.border}`, color: theme.text }}
                              >
                                {col}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {lastRawData.slice(0, 20).map((row, idx) => (
                            <tr key={idx} style={{ borderBottom: `1px solid ${theme.border}` }}>
                              {Object.values(row).map((val: any, colIdx) => (
                                <td
                                  key={colIdx}
                                  className="px-2 py-1 whitespace-nowrap"
                                  style={{ color: theme.text }}
                                >
                                  {val === null ? <span style={{ color: theme.textSecondary }}>null</span> : String(val)}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Botón exportar */}
                    <div className="mx-3 mt-2 flex justify-end">
                      <button
                        onClick={() => {
                          const csv = [
                            Object.keys(lastRawData[0]).join(','),
                            ...lastRawData.map(row => Object.values(row).map(v => `"${v}"`).join(','))
                          ].join('\n');
                          const blob = new Blob([csv], { type: 'text/csv' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `consulta_${new Date().toISOString().slice(0,10)}.csv`;
                          a.click();
                        }}
                        className="flex items-center gap-1 px-2 py-1 text-xs rounded"
                        style={{ backgroundColor: theme.primary, color: theme.primaryText }}
                      >
                        <Download className="h-3 w-3" />
                        Exportar CSV
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Sugerencias rápidas contextuales (sidebar mode, solo gestores) */}
            {!isMaximized && canUseDataAssistant && messages.length === 0 && (
              <div
                className="px-3 py-2 flex flex-wrap gap-1.5 flex-shrink-0"
                style={{ borderTop: `1px solid ${theme.border}` }}
              >
                <span className="w-full text-[10px] uppercase tracking-wide opacity-60" style={{ color: theme.textSecondary }}>
                  Sugerencias para esta pantalla
                </span>
                {quickPrompts.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => setInput(q)}
                    className="text-xs px-2.5 py-1 rounded-full transition-colors hover:opacity-80"
                    style={{
                      backgroundColor: theme.backgroundSecondary,
                      color: theme.text,
                      border: `1px solid ${theme.border}`,
                    }}
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}

            {/* Input */}
            <div
              className="p-4 flex gap-2 flex-shrink-0"
              style={{ borderTop: `1px solid ${theme.border}` }}
            >
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                placeholder={isMaximized ? "Escribí tu consulta o seleccioná una de la izquierda..." : "Escribe tu mensaje..."}
                className="flex-1 px-4 py-2 rounded-xl text-sm focus:outline-none focus:ring-2 transition-all duration-200"
                style={{
                  backgroundColor: theme.backgroundSecondary,
                  color: theme.text,
                  border: `1px solid ${theme.border}`
                }}
              />
              <button
                onClick={sendMessage}
                disabled={!input.trim() || loading}
                className="w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100"
                style={{
                  backgroundColor: theme.primary,
                  color: theme.primaryText
                }}
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
