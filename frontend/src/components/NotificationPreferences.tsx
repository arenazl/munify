import { useState, useEffect } from 'react';
import { Bell, Loader2, ToggleLeft, ToggleRight, Info } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import api from '../lib/api';
import { toast } from 'sonner';

interface NotificationPreference {
  key: string;
  enabled: boolean;
  nombre: string;
  descripcion: string;
  destinatario: string;
}

interface PreferencesResponse {
  preferences: NotificationPreference[];
  defaults: Record<string, boolean>;
}

export default function NotificationPreferences() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [preferences, setPreferences] = useState<NotificationPreference[]>([]);

  useEffect(() => {
    fetchPreferences();
  }, []);

  const fetchPreferences = async () => {
    try {
      const response = await api.get<PreferencesResponse>('/push/preferences');
      setPreferences(response.data.preferences);
    } catch (error) {
      console.error('Error al cargar preferencias:', error);
      toast.error('Error al cargar preferencias de notificaciones');
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (key: string, currentValue: boolean) => {
    const newValue = !currentValue;

    // Actualizar UI optimistamente
    setPreferences(prev =>
      prev.map(p => p.key === key ? { ...p, enabled: newValue } : p)
    );

    setSaving(true);
    try {
      await api.put('/push/preferences', {
        preferences: { [key]: newValue }
      });
      toast.success('Preferencia actualizada');
    } catch (error) {
      // Revertir si falla
      setPreferences(prev =>
        prev.map(p => p.key === key ? { ...p, enabled: currentValue } : p)
      );
      toast.error('Error al actualizar preferencia');
    } finally {
      setSaving(false);
    }
  };

  // Agrupar por destinatario
  const groupedPreferences = preferences.reduce((acc, pref) => {
    const group = pref.destinatario || 'otros';
    if (!acc[group]) acc[group] = [];
    acc[group].push(pref);
    return acc;
  }, {} as Record<string, NotificationPreference[]>);

  // Filtrar grupos segun el rol del usuario
  const visibleGroups = Object.entries(groupedPreferences).filter(([group]) => {
    if (user?.rol === 'vecino') {
      return group === 'vecino';
    }
    // Admin y supervisor ven todo
    return true;
  });

  const groupLabels: Record<string, { label: string; color: string }> = {
    vecino: { label: 'Notificaciones de Reclamos', color: '#3b82f6' },
    supervisor: { label: 'Notificaciones para Supervisores', color: '#8b5cf6' },
    otros: { label: 'Otras Notificaciones', color: '#6b7280' },
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: theme.primary }} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Descripcion */}
      <div
        className="flex items-start gap-3 p-4 rounded-xl"
        style={{ backgroundColor: `${theme.primary}10` }}
      >
        <Info className="h-5 w-5 mt-0.5 flex-shrink-0" style={{ color: theme.primary }} />
        <div>
          <p className="text-sm font-medium" style={{ color: theme.text }}>
            Configura qué notificaciones push quieres recibir
          </p>
          <p className="text-xs mt-1" style={{ color: theme.textSecondary }}>
            Estas preferencias solo afectan a las notificaciones push. Las notificaciones por WhatsApp se configuran desde el panel de administracion.
          </p>
        </div>
      </div>

      {/* Grupos de preferencias */}
      {visibleGroups.map(([group, prefs]) => (
        <div
          key={group}
          className="rounded-xl overflow-hidden"
          style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
        >
          <div
            className="px-5 py-3 flex items-center gap-2"
            style={{ backgroundColor: theme.backgroundSecondary }}
          >
            <Bell className="h-4 w-4" style={{ color: groupLabels[group]?.color || theme.primary }} />
            <h3 className="font-medium text-sm" style={{ color: theme.text }}>
              {groupLabels[group]?.label || group}
            </h3>
          </div>

          <div className="divide-y" style={{ borderColor: theme.border }}>
            {prefs.map(pref => (
              <div
                key={pref.key}
                className="px-5 py-4 flex items-center justify-between gap-4"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium" style={{ color: theme.text }}>
                    {pref.nombre}
                  </p>
                  {pref.descripcion && (
                    <p className="text-xs mt-0.5" style={{ color: theme.textSecondary }}>
                      {pref.descripcion}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => handleToggle(pref.key, pref.enabled)}
                  disabled={saving}
                  className="flex-shrink-0 transition-opacity"
                  style={{ opacity: saving ? 0.5 : 1 }}
                >
                  {pref.enabled ? (
                    <ToggleRight className="h-7 w-7" style={{ color: theme.primary }} />
                  ) : (
                    <ToggleLeft className="h-7 w-7" style={{ color: theme.textSecondary }} />
                  )}
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}

      {visibleGroups.length === 0 && (
        <div className="text-center py-12">
          <Bell className="h-12 w-12 mx-auto mb-4" style={{ color: theme.textSecondary }} />
          <p style={{ color: theme.textSecondary }}>No hay preferencias disponibles</p>
        </div>
      )}
    </div>
  );
}
