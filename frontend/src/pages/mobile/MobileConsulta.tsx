import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Send, Bot, User, Loader2, ArrowLeft, HelpCircle, Sparkles } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { publicApi } from '../../lib/api';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

// Parsear markdown simple (links y bold)
function parseMarkdown(text: string, onLinkClick?: (url: string) => void) {
  const parts: (string | React.ReactElement)[] = [];
  let lastIndex = 0;
  let keyCounter = 0;

  // Regex para links markdown: [texto](url)
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  let match;

  while ((match = linkRegex.exec(text)) !== null) {
    // Agregar texto antes del link
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    // Agregar el link como botón
    const linkText = match[1];
    const linkUrl = match[2];

    parts.push(
      <button
        key={keyCounter++}
        onClick={() => onLinkClick?.(linkUrl)}
        className="text-blue-400 underline hover:text-blue-300 font-medium"
      >
        {linkText}
      </button>
    );

    lastIndex = match.index + match[0].length;
  }

  // Agregar el resto del texto
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : text;
}

// Preguntas sugeridas
const suggestedQuestions = [
  '¿Cómo reporto un bache?',
  '¿Qué pasa si hay una luz rota?',
  '¿Cómo hago un reclamo de basura?',
  '¿Cuánto tarda en resolverse?',
];

export default function MobileConsulta() {
  const { theme } = useTheme();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleLinkClick = (url: string) => {
    // Convertir urls del formato /reclamos?crear=X a /app/nuevo?categoria=X
    if (url.includes('/reclamos?crear=')) {
      const categoriaId = url.split('crear=')[1];
      navigate(`/app/nuevo?categoria=${categoriaId}`);
    } else if (url.startsWith('/')) {
      navigate(url.replace('/reclamos', '/app/nuevo'));
    } else {
      navigate(url);
    }
  };

  const sendMessage = async (messageText?: string) => {
    const text = messageText || input.trim();
    if (!text || loading) return;

    const userMessage: Message = { role: 'user', content: text };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      // Usar endpoint público de chat (sin auth)
      const municipioId = localStorage.getItem('municipio_id');
      const response = await publicApi.chatConsulta(text, messages, municipioId ? parseInt(municipioId) : undefined);
      const assistantMessage: Message = { role: 'assistant', content: response.data.response };
      setMessages(prev => [...prev, assistantMessage]);
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Lo siento, hubo un error. Por favor intentá de nuevo más tarde.'
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: theme.background }}>
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 border-b"
        style={{ backgroundColor: theme.card, borderColor: theme.border }}
      >
        <button
          onClick={() => navigate('/app')}
          className="p-2 -ml-2 rounded-lg transition-colors"
          style={{ color: theme.text }}
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center"
          style={{ backgroundColor: `${theme.primary}20` }}
        >
          <Sparkles className="h-5 w-5" style={{ color: theme.primary }} />
        </div>
        <div>
          <h1 className="font-semibold" style={{ color: theme.text }}>Asistente Virtual</h1>
          <p className="text-xs" style={{ color: theme.textSecondary }}>Preguntá lo que necesites</p>
        </div>
      </div>

      {/* Mensajes */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-4">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
              style={{ backgroundColor: `${theme.primary}15` }}
            >
              <HelpCircle className="h-8 w-8" style={{ color: theme.primary }} />
            </div>
            <h2 className="text-lg font-semibold mb-2" style={{ color: theme.text }}>
              ¿En qué puedo ayudarte?
            </h2>
            <p className="text-sm mb-6" style={{ color: theme.textSecondary }}>
              Preguntame sobre cómo hacer reclamos, qué tipos de problemas podés reportar, o cualquier duda que tengas.
            </p>

            {/* Preguntas sugeridas */}
            <div className="w-full space-y-2">
              <p className="text-xs font-medium" style={{ color: theme.textSecondary }}>
                Preguntas frecuentes:
              </p>
              {suggestedQuestions.map((question, i) => (
                <button
                  key={i}
                  onClick={() => sendMessage(question)}
                  className="w-full text-left p-3 rounded-xl text-sm transition-all active:scale-[0.98]"
                  style={{
                    backgroundColor: theme.card,
                    border: `1px solid ${theme.border}`,
                    color: theme.text,
                  }}
                >
                  {question}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg, index) => (
              <div
                key={index}
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
                  className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                    msg.role === 'user'
                      ? 'rounded-tr-md'
                      : 'rounded-tl-md'
                  }`}
                  style={{
                    backgroundColor: msg.role === 'user' ? theme.primary : theme.card,
                    color: msg.role === 'user' ? '#fff' : theme.text,
                    border: msg.role === 'assistant' ? `1px solid ${theme.border}` : 'none',
                  }}
                >
                  <p className="text-sm whitespace-pre-wrap">
                    {msg.role === 'assistant'
                      ? parseMarkdown(msg.content, handleLinkClick)
                      : msg.content}
                  </p>
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
            ))}
            {loading && (
              <div className="flex gap-2">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: `${theme.primary}20` }}
                >
                  <Bot className="h-4 w-4" style={{ color: theme.primary }} />
                </div>
                <div
                  className="rounded-2xl rounded-tl-md px-4 py-3"
                  style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
                >
                  <Loader2 className="h-5 w-5 animate-spin" style={{ color: theme.primary }} />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input - fijo abajo */}
      <div
        className="sticky bottom-0 p-4 border-t"
        style={{
          backgroundColor: theme.card,
          borderColor: theme.border,
          paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
        }}
      >
        <div
          className="flex items-center gap-2 rounded-2xl px-4 py-2"
          style={{ backgroundColor: theme.backgroundSecondary }}
        >
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Escribí tu consulta..."
            className="flex-1 bg-transparent outline-none text-sm"
            style={{ color: theme.text }}
            disabled={loading}
          />
          <button
            onClick={() => sendMessage()}
            disabled={!input.trim() || loading}
            className="p-2 rounded-full transition-all disabled:opacity-50"
            style={{
              backgroundColor: input.trim() ? theme.primary : 'transparent',
              color: input.trim() ? '#fff' : theme.textSecondary,
            }}
          >
            <Send className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
