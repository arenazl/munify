import { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Send, Bot, User, Loader2, AlertCircle } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { chatApi } from '../lib/api';
import { useNavigate } from 'react-router-dom';
import { parseMarkdown } from './parseMarkdown';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export function ChatWidget() {
  const { theme } = useTheme();
  const navigate = useNavigate();

  const handleLinkClick = (url: string) => {
    setIsOpen(false);
    navigate(url);
  };
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const userMessage: Message = { role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);
    setError(null);

    try {
      const response = await chatApi.sendMessage(input, messages);
      const assistantMessage: Message = { role: 'assistant', content: response.response };
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
      {/* Botón flotante - esquina inferior derecha */}
      <button
        onClick={() => setIsOpen(true)}
        className={`
          w-14 h-14 rounded-full
          flex items-center justify-center
          shadow-lg transition-all duration-300
          hover:scale-110 active:scale-95
          ${isOpen ? 'opacity-0 pointer-events-none scale-0' : 'opacity-100 scale-100'}
        `}
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          zIndex: 9999,
          background: `linear-gradient(135deg, ${theme.primary} 0%, ${theme.primaryHover} 100%)`,
          boxShadow: `0 4px 20px ${theme.primary}50`
        }}
      >
        <MessageCircle className="h-6 w-6 text-white" />
      </button>

      {/* Modal de chat */}
      <div
        className={`
          w-96 h-[500px] rounded-2xl shadow-2xl
          flex flex-col overflow-hidden
          transition-all duration-300 ease-out
          ${isOpen ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-4 pointer-events-none'}
        `}
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          zIndex: 9999,
          backgroundColor: theme.card,
          border: `1px solid ${theme.border}`
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3 flex-shrink-0"
          style={{
            background: `linear-gradient(135deg, ${theme.primary} 0%, ${theme.primaryHover} 100%)`
          }}
        >
          <div className="flex items-center gap-2 text-white">
            <Bot className="h-5 w-5" />
            <span className="font-semibold">Asistente Municipal</span>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="p-1 rounded-lg hover:bg-white/20 transition-colors"
          >
            <X className="h-5 w-5 text-white" />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="text-center py-8" style={{ color: theme.textSecondary }}>
              <Bot className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p className="text-sm">Hola! Soy tu asistente virtual.</p>
              <p className="text-sm">En qué puedo ayudarte?</p>
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
                className={`max-w-[80%] px-4 py-2 rounded-2xl text-sm ${
                  msg.role === 'user' ? 'rounded-br-sm' : 'rounded-bl-sm'
                }`}
                style={{
                  backgroundColor: msg.role === 'user' ? theme.primary : theme.backgroundSecondary,
                  color: msg.role === 'user' ? '#ffffff' : theme.text
                }}
              >
                {msg.role === 'assistant' ? parseMarkdown(msg.content, handleLinkClick, theme.primary) : msg.content}
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
          className="p-4 flex gap-2 flex-shrink-0"
          style={{ borderTop: `1px solid ${theme.border}` }}
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
            placeholder="Escribe tu mensaje..."
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
              color: '#ffffff'
            }}
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </>
  );
}
