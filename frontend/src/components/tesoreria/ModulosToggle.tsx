import { useEffect, useState } from 'react';
import { Wallet, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { modulosApi } from '../../lib/api';
import { invalidateModulos } from '../../hooks/useModulo';

interface ModuloDef {
  key: string;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  color: string;
}

const MODULOS: ModuloDef[] = [
  {
    key: 'tesoreria',
    name: 'Tesorería',
    icon: Wallet,
    description: 'Control de gastos del intendente: registra pagos, cargá la agenda de contactos, ubicalos en el mapa y proyectá cobros futuros.',
    color: '#22c55e',
  },
  // Futuros modulos van acá.
];

/**
 * Toggle de activación de módulos del municipio. Solo admin.
 * Se renderiza dentro de la pantalla de Configuración.
 */
export function ModulosToggle() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const [estados, setEstados] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    modulosApi.list()
      .then(r => {
        const out: Record<string, boolean> = {};
        for (const m of r.data as any[]) out[m.modulo] = m.activo;
        setEstados(out);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (user?.rol !== 'admin' && user?.rol !== 'supervisor') return null;

  const toggle = async (key: string) => {
    const next = !estados[key];
    setSaving(key);
    try {
      await modulosApi.upsert(key, next);
      setEstados(s => ({ ...s, [key]: next }));
      invalidateModulos();
      toast.success(next ? 'Módulo activado. Recargá la página para verlo en el menú.' : 'Módulo desactivado.');
    } catch {
      toast.error('Error guardando');
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="rounded-xl p-5 mb-6" style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${theme.primary}20`, color: theme.primary }}>
          <Wallet className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold" style={{ color: theme.text }}>Módulos del Municipio</h2>
          <p className="text-sm" style={{ color: theme.textSecondary }}>
            Activá funcionalidades opcionales para este municipio
          </p>
        </div>
      </div>

      {loading ? (
        <p className="text-sm" style={{ color: theme.textSecondary }}>Cargando módulos...</p>
      ) : (
        <div className="space-y-3">
          {MODULOS.map(m => {
            const Icon = m.icon;
            const activo = !!estados[m.key];
            return (
              <div key={m.key} className="p-4 rounded-xl flex items-start gap-3"
                style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${activo ? m.color : theme.border}` }}>
                <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: `${m.color}20`, color: m.color }}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold" style={{ color: theme.text }}>{m.name}</p>
                  <p className="text-xs mt-1" style={{ color: theme.textSecondary }}>{m.description}</p>
                </div>
                <button
                  type="button"
                  onClick={() => toggle(m.key)}
                  disabled={saving === m.key}
                  className="px-4 py-2 rounded-lg text-sm font-bold transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50 min-w-[100px]"
                  style={{
                    backgroundColor: activo ? m.color : 'transparent',
                    color: activo ? '#fff' : m.color,
                    border: `2px solid ${m.color}`,
                  }}
                >
                  {saving === m.key
                    ? <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                    : (activo ? 'Activado' : 'Activar')}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
