import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../../contexts/ThemeContext';
import { MessageSquare, FileText, X, ChevronRight } from 'lucide-react';
import { createPortal } from 'react-dom';

export default function MobileNuevoReclamo() {
  const { theme } = useTheme();
  const navigate = useNavigate();
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Animación de entrada
    requestAnimationFrame(() => {
      setIsVisible(true);
    });
  }, []);

  const handleClose = () => {
    setIsVisible(false);
    setTimeout(() => {
      navigate('/app');
    }, 300);
  };

  const handleOption = (path: string) => {
    setIsVisible(false);
    setTimeout(() => {
      navigate(path);
    }, 200);
  };

  const modalContent = (
    <>
      <style>{`
        @keyframes slideUp {
          from {
            transform: translateY(100%);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        .modal-backdrop {
          animation: fadeIn 0.3s ease-out;
        }
        .modal-content {
          animation: slideUp 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .modal-backdrop.closing {
          animation: fadeIn 0.3s ease-out reverse;
        }
        .modal-content.closing {
          animation: slideUp 0.3s ease-in reverse;
        }
      `}</style>

      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm modal-backdrop ${!isVisible ? 'closing' : ''}`}
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="fixed inset-x-0 bottom-0 z-[70] flex items-end justify-center">
        <div
          className={`w-full max-w-lg rounded-t-3xl modal-content ${!isVisible ? 'closing' : ''}`}
          style={{
            backgroundColor: theme.card,
            boxShadow: '0 -10px 40px rgba(0, 0, 0, 0.3)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: theme.border }}>
            <div>
              <h2 className="text-lg font-bold" style={{ color: theme.text }}>
                ¿Qué querés crear?
              </h2>
              <p className="text-sm" style={{ color: theme.textSecondary }}>
                Elegí una opción
              </p>
            </div>
            <button
              onClick={handleClose}
              className="p-2 rounded-full transition-all hover:scale-110 active:scale-95"
              style={{ backgroundColor: `${theme.textSecondary}15` }}
            >
              <X className="h-5 w-5" style={{ color: theme.textSecondary }} />
            </button>
          </div>

          {/* Opciones */}
          <div className="p-4 space-y-3 pb-safe">
            {/* Nuevo Reclamo */}
            <button
              onClick={() => handleOption('/gestion/crear-reclamo')}
              className="w-full flex items-center gap-4 p-4 rounded-2xl transition-all active:scale-[0.98] hover:scale-[1.02]"
              style={{
                backgroundColor: `${theme.primary}15`,
                border: `2px solid ${theme.primary}30`,
              }}
            >
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
                style={{
                  backgroundColor: theme.primary,
                  boxShadow: `0 4px 14px ${theme.primary}40`,
                }}
              >
                <MessageSquare className="h-7 w-7 text-white" />
              </div>
              <div className="flex-1 text-left">
                <h3 className="text-base font-semibold" style={{ color: theme.text }}>
                  Nuevo Reclamo
                </h3>
                <p className="text-sm" style={{ color: theme.textSecondary }}>
                  Reportá un problema en tu zona
                </p>
              </div>
              <ChevronRight className="h-5 w-5" style={{ color: theme.primary }} />
            </button>

            {/* Nuevo Trámite */}
            <button
              onClick={() => handleOption('/gestion/tramites/nuevo')}
              className="w-full flex items-center gap-4 p-4 rounded-2xl transition-all active:scale-[0.98] hover:scale-[1.02]"
              style={{
                backgroundColor: '#10b98115',
                border: '2px solid #10b98130',
              }}
            >
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
                style={{
                  backgroundColor: '#10b981',
                  boxShadow: '0 4px 14px #10b98140',
                }}
              >
                <FileText className="h-7 w-7 text-white" />
              </div>
              <div className="flex-1 text-left">
                <h3 className="text-base font-semibold" style={{ color: theme.text }}>
                  Nuevo Trámite
                </h3>
                <p className="text-sm" style={{ color: theme.textSecondary }}>
                  Iniciá un trámite municipal
                </p>
              </div>
              <ChevronRight className="h-5 w-5" style={{ color: '#10b981' }} />
            </button>
          </div>
        </div>
      </div>
    </>
  );

  return createPortal(modalContent, document.body);
}
