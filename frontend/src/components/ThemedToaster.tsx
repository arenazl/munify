import { Toaster as SonnerToaster } from 'sonner';
import { useTheme } from '../contexts/ThemeContext';

export function ThemedToaster() {
  const { theme } = useTheme();

  return (
    <>
      <SonnerToaster
        position="bottom-right"
        closeButton
        richColors
        expand
        toastOptions={{
          style: {
            background: theme.card,
            color: theme.text,
            border: `1px solid ${theme.border}`,
            boxShadow: `0 10px 40px -10px rgba(0,0,0,0.4)`,
            borderRadius: '12px',
            padding: '16px',
          },
          classNames: {
            toast: 'themed-toast',
            title: 'themed-toast-title font-semibold',
            description: 'themed-toast-description text-sm opacity-80',
            closeButton: 'themed-toast-close',
            success: 'toast-success',
            error: 'toast-error',
            warning: 'toast-warning',
            info: 'toast-info',
          },
        }}
      />
      <style>{`
        .themed-toast {
          backdrop-filter: blur(12px);
        }
        .toast-success {
          border-left: 4px solid #10b981 !important;
        }
        .toast-error {
          border-left: 4px solid #ef4444 !important;
        }
        .toast-warning {
          border-left: 4px solid #f59e0b !important;
        }
        .toast-info {
          border-left: 4px solid #3b82f6 !important;
        }
      `}</style>
    </>
  );
}
