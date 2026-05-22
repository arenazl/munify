import { HelpCircle } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';

/**
 * Botón "?" para volver a disparar un tour manualmente. Se ubica en el
 * header de una pantalla (ej. al lado del título). Al apretarlo, fuerza
 * el tour del `tourKey` indicado, ignorando el localStorage.
 *
 * Implementación: agrega `?tour=<key>` a la URL y recarga el componente.
 * El componente MunifyTour detecta el query param y arranca el tour
 * aunque el user ya lo haya visto.
 */
interface TourButtonProps {
  tourKey: string;
  title?: string;
}

export function TourButton({ tourKey, title = 'Ver tutorial' }: TourButtonProps) {
  const { theme } = useTheme();

  const onClick = () => {
    const url = new URL(window.location.href);
    url.searchParams.set('tour', tourKey);
    // Reemplazar la URL sin recargar y disparar un re-render.
    // Hack simple: forzar un soft reload con el query nuevo.
    window.location.href = url.toString();
  };

  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className="inline-flex items-center justify-center w-7 h-7 rounded-full transition-all hover:scale-110 active:scale-95"
      style={{
        backgroundColor: `${theme.primary}15`,
        color: theme.primary,
        border: `1px solid ${theme.primary}40`,
      }}
    >
      <HelpCircle className="h-4 w-4" />
    </button>
  );
}
