import { useEffect, useState } from 'react';
import { Wrench } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

/**
 * Cartel de mantenimiento. Se muestra cuando el backend responde 503 con
 * `detail: "mantenimiento"` (MAINTENANCE_MODE=true, sólo durante la noche de
 * migración de producción: docs/tesoreria/03-revision-fable-y-plan-contingencia.md §6).
 *
 * No hace falta deployar el front para que aparezca: el interceptor de `lib/api.ts`
 * dispara el evento `munify:mantenimiento` y este componente, montado en la raíz,
 * lo escucha. Reintenta /health cada 30 segundos y se va solo cuando vuelve.
 */
export function MantenimientoCartel() {
  const { theme } = useTheme();
  const [mensaje, setMensaje] = useState<string | null>(null);

  useEffect(() => {
    const onMantenimiento = (e: Event) => {
      const detail = (e as CustomEvent<string | undefined>).detail;
      setMensaje(detail || 'Munify está en mantenimiento programado. Volvemos en minutos.');
    };
    window.addEventListener('munify:mantenimiento', onMantenimiento);
    return () => window.removeEventListener('munify:mantenimiento', onMantenimiento);
  }, []);

  useEffect(() => {
    if (!mensaje) return;
    const id = window.setInterval(async () => {
      try {
        // /health es lo único que el backend contesta con el cartel puesto; cuando
        // cualquier otra ruta vuelve a responder, el mantenimiento terminó.
        const r = await fetch('/api/auth/me', { method: 'HEAD' });
        if (r.status !== 503) window.location.reload();
      } catch {
        // sin red: se sigue esperando
      }
    }, 30000);
    return () => window.clearInterval(id);
  }, [mensaje]);

  if (!mensaje) return null;

  return (
    <div
      role="alertdialog"
      aria-live="assertive"
      className="fixed inset-0 z-[9999] flex items-center justify-center p-6"
      style={{ background: theme.background }}
    >
      <div
        className="max-w-md w-full rounded-2xl p-8 text-center"
        style={{ background: theme.card, border: `1px solid ${theme.border}`, color: theme.text }}
      >
        <div
          className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full"
          style={{ background: theme.primary, color: theme.background }}
        >
          <Wrench size={28} />
        </div>
        <h1 className="text-xl font-semibold mb-2">Mantenimiento programado</h1>
        <p className="text-sm opacity-80">{mensaje}</p>
        <p className="text-xs opacity-60 mt-4">Esta pantalla se actualiza sola cuando volvemos.</p>
      </div>
    </div>
  );
}
