import { Toaster as SonnerToaster } from 'sonner';
import { useTheme } from '../contexts/ThemeContext';

export function ThemedToaster() {
  const { theme } = useTheme();

  return (
    <SonnerToaster
      position="top-right"
      closeButton
      toastOptions={{
        style: {
          background: theme.card,
          color: theme.text,
          border: `1px solid ${theme.border}`,
        },
        classNames: {
          toast: 'themed-toast',
          title: 'themed-toast-title',
          description: 'themed-toast-description',
          closeButton: 'themed-toast-close',
        },
      }}
    />
  );
}
