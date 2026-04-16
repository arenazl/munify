import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, FileCheck, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../../contexts/ThemeContext';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function FabActionSheet({ open, onClose }: Props) {
  const { theme } = useTheme();
  const navigate = useNavigate();
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
    } else {
      setVisible(false);
      const t = setTimeout(() => setMounted(false), 260);
      return () => clearTimeout(t);
    }
  }, [open]);

  if (!mounted) return null;

  const go = (to: string) => {
    onClose();
    setTimeout(() => navigate(to), 120);
  };

  const css = `
    @keyframes fab-sheet-slide-up {
      from { transform: translateY(100%); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
    .fab-sheet-card {
      transition: transform 0.25s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.25s ease;
    }
  `;

  return createPortal(
    <>
      <style>{css}</style>

      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: visible ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0)',
          backdropFilter: visible ? 'blur(4px)' : 'blur(0)',
          WebkitBackdropFilter: visible ? 'blur(4px)' : 'blur(0)',
          transition: 'background-color 0.25s ease, backdrop-filter 0.25s ease',
          zIndex: 10000,
        }}
      />

      <div
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 10001,
          padding: '16px 16px calc(16px + env(safe-area-inset-bottom, 0px))',
          pointerEvents: 'none',
        }}
      >
        <div
          className="fab-sheet-card"
          style={{
            pointerEvents: 'auto',
            backgroundColor: theme.card,
            borderRadius: '24px 24px 20px 20px',
            boxShadow: '0 -10px 40px rgba(0,0,0,0.25)',
            border: `1px solid ${theme.border}`,
            padding: 20,
            transform: visible ? 'translateY(0)' : 'translateY(110%)',
            opacity: visible ? 1 : 0,
          }}
        >
          {/* Handle visual */}
          <div
            style={{
              width: 44,
              height: 5,
              borderRadius: 999,
              backgroundColor: theme.border,
              margin: '0 auto 14px',
            }}
          />

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: theme.text, margin: 0 }}>
                ¿Qué querés crear?
              </h3>
              <p style={{ fontSize: 12, color: theme.textSecondary, margin: '2px 0 0 0' }}>
                Elegí una opción para continuar
              </p>
            </div>
            <button
              onClick={onClose}
              aria-label="Cerrar"
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                border: 'none',
                backgroundColor: theme.backgroundSecondary,
                color: theme.textSecondary,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <X size={18} />
            </button>
          </div>

          {/* Opciones */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <button
              onClick={() => go('/app/nuevo')}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: 10,
                padding: 16,
                borderRadius: 18,
                border: `1px solid ${theme.primary}40`,
                backgroundColor: `${theme.primary}10`,
                color: theme.text,
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'transform 0.15s ease',
              }}
              onTouchStart={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.97)'; }}
              onTouchEnd={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'; }}
            >
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  backgroundColor: theme.primary,
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: `0 6px 16px ${theme.primary}55`,
                }}
              >
                <AlertCircle size={22} />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>Reclamo</div>
                <div style={{ fontSize: 12, color: theme.textSecondary, marginTop: 2 }}>
                  Reportar un problema
                </div>
              </div>
            </button>

            <button
              onClick={() => go('/app/nuevo-tramite')}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: 10,
                padding: 16,
                borderRadius: 18,
                border: '1px solid #8b5cf640',
                backgroundColor: '#8b5cf610',
                color: theme.text,
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'transform 0.15s ease',
              }}
              onTouchStart={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.97)'; }}
              onTouchEnd={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'; }}
            >
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  backgroundColor: '#8b5cf6',
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 6px 16px #8b5cf655',
                }}
              >
                <FileCheck size={22} />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>Trámite</div>
                <div style={{ fontSize: 12, color: theme.textSecondary, marginTop: 2 }}>
                  Iniciar una solicitud
                </div>
              </div>
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}
