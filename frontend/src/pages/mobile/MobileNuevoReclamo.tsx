import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../../contexts/ThemeContext';
import { MessageSquare, FileText, X, Sparkles, MapPin, HelpCircle } from 'lucide-react';
import { createPortal } from 'react-dom';

export default function MobileNuevoReclamo() {
  const { theme } = useTheme();
  const navigate = useNavigate();
  const [isVisible, setIsVisible] = useState(false);
  const [showOptions, setShowOptions] = useState(false);

  useEffect(() => {
    // Animación de entrada escalonada
    requestAnimationFrame(() => {
      setIsVisible(true);
      setTimeout(() => setShowOptions(true), 150);
    });
  }, []);

  const handleClose = () => {
    setShowOptions(false);
    setTimeout(() => setIsVisible(false), 100);
    setTimeout(() => {
      navigate('/app');
    }, 400);
  };

  const handleOption = (path: string) => {
    setShowOptions(false);
    setTimeout(() => setIsVisible(false), 100);
    setTimeout(() => {
      navigate(path);
    }, 300);
  };

  const options = [
    {
      id: 'reclamo',
      icon: MessageSquare,
      label: 'Reclamo',
      subtitle: 'Reportar problema',
      path: '/nuevo-reclamo',
      color: theme.primary,
      delay: 0,
    },
    {
      id: 'tramite',
      icon: FileText,
      label: 'Trámite',
      subtitle: 'Gestión municipal',
      path: '/app/tramites/nuevo',
      color: '#10b981',
      delay: 50,
    },
    {
      id: 'consulta',
      icon: HelpCircle,
      label: 'Consulta',
      subtitle: 'Asistente IA',
      path: '/app/consulta',
      color: '#8b5cf6',
      delay: 100,
    },
  ];

  const modalContent = (
    <>
      <style>{`
        @keyframes backdropFade {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes scaleIn {
          from {
            opacity: 0;
            transform: scale(0.3) translateY(20px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
        @keyframes floatUp {
          from {
            opacity: 0;
            transform: translateY(30px) scale(0.8);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
        @keyframes shimmer {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        .option-card {
          animation: floatUp 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
          opacity: 0;
        }
        .close-btn {
          animation: scaleIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
          animation-delay: 0.2s;
          opacity: 0;
        }
        .backdrop-blur {
          animation: backdropFade 0.3s ease-out forwards;
        }
        .backdrop-blur.closing {
          animation: backdropFade 0.2s ease-in reverse forwards;
        }
        .shimmer-effect {
          background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.1) 50%, transparent 100%);
          background-size: 200% 100%;
          animation: shimmer 2s infinite;
        }
      `}</style>

      {/* Backdrop con blur */}
      <div
        className={`fixed inset-0 z-[60] backdrop-blur ${!isVisible ? 'closing' : ''}`}
        style={{
          background: `radial-gradient(circle at 50% 100%, ${theme.primary}30 0%, rgba(0,0,0,0.85) 70%)`,
        }}
        onClick={handleClose}
      />

      {/* Contenido central */}
      <div className="fixed inset-0 z-[70] flex flex-col items-center justify-end pb-28 px-6">
        {/* Título animado */}
        <div
          className={`mb-8 text-center transition-all duration-500 ${showOptions ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
        >
          <div className="flex items-center justify-center gap-2 mb-2">
            <Sparkles className="h-5 w-5 text-amber-400" />
            <span className="text-sm font-medium text-amber-400">Crear nuevo</span>
          </div>
          <h2 className="text-2xl font-bold text-white">
            ¿Qué necesitás?
          </h2>
        </div>

        {/* Grid de opciones - diseño moderno */}
        <div className="w-full max-w-sm grid grid-cols-3 gap-3">
          {options.map((option, index) => (
            <button
              key={option.id}
              onClick={() => handleOption(option.path)}
              className="option-card flex flex-col items-center p-4 rounded-3xl transition-all active:scale-95 hover:scale-105 relative overflow-hidden group"
              style={{
                animationDelay: showOptions ? `${option.delay}ms` : '0ms',
                background: `linear-gradient(145deg, ${option.color}25, ${option.color}10)`,
                border: `1px solid ${option.color}40`,
                boxShadow: `0 8px 32px ${option.color}30, inset 0 1px 0 rgba(255,255,255,0.1)`,
              }}
            >
              {/* Shimmer effect on hover */}
              <div className="absolute inset-0 shimmer-effect opacity-0 group-hover:opacity-100 transition-opacity" />

              {/* Icono con glow */}
              <div
                className="relative w-14 h-14 rounded-2xl flex items-center justify-center mb-3 transition-transform group-hover:scale-110"
                style={{
                  background: `linear-gradient(135deg, ${option.color}, ${option.color}dd)`,
                  boxShadow: `0 4px 20px ${option.color}60`,
                }}
              >
                <option.icon className="h-7 w-7 text-white" />
              </div>

              {/* Label */}
              <span className="text-sm font-semibold text-white">
                {option.label}
              </span>
              <span className="text-[10px] mt-0.5" style={{ color: 'rgba(255,255,255,0.6)' }}>
                {option.subtitle}
              </span>
            </button>
          ))}
        </div>

        {/* Botón cerrar - moderno flotante */}
        <button
          onClick={handleClose}
          className="close-btn mt-8 w-14 h-14 rounded-full flex items-center justify-center transition-all active:scale-90 hover:scale-110"
          style={{
            background: 'linear-gradient(145deg, rgba(255,255,255,0.15), rgba(255,255,255,0.05))',
            border: '1px solid rgba(255,255,255,0.2)',
            backdropFilter: 'blur(10px)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.1)',
          }}
        >
          <X className="h-6 w-6 text-white" />
        </button>
      </div>
    </>
  );

  return createPortal(modalContent, document.body);
}
