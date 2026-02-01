import { useEffect, useState } from 'react';
import { Settings, Eye, EyeOff, GripVertical, Save, Loader2, User, Wrench, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { configuracionApi } from '../lib/api';
import { useTheme } from '../contexts/ThemeContext';
import { StickyPageHeader } from '../components/ui/StickyPageHeader';

interface ComponenteConfig {
  id: string;
  nombre: string;
  visible: boolean;
  orden: number;
}

interface DashboardConfig {
  componentes: ComponenteConfig[];
}

type RolTab = 'vecino' | 'supervisor';

export default function ConfigDashboard() {
  const { theme } = useTheme();
  const [activeTab, setActiveTab] = useState<RolTab>('vecino');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [configVecino, setConfigVecino] = useState<DashboardConfig>({ componentes: [] });
  const [configSupervisor, setConfigSupervisor] = useState<DashboardConfig>({ componentes: [] });
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    loadConfigs();
  }, []);

  const loadConfigs = async () => {
    setLoading(true);
    try {
      const [vecinoRes, supervisorRes] = await Promise.all([
        configuracionApi.getDashboardConfig('vecino'),
        configuracionApi.getDashboardConfig('supervisor'),
      ]);

      setConfigVecino(vecinoRes.data.config);
      setConfigSupervisor(supervisorRes.data.config);
    } catch (error) {
      console.error('Error cargando configuración:', error);
      toast.error('Error al cargar la configuración');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleVisibility = (rol: RolTab, componenteId: string) => {
    const setConfig = rol === 'vecino' ? setConfigVecino : setConfigSupervisor;
    setConfig((prev) => ({
      ...prev,
      componentes: prev.componentes.map((c) =>
        c.id === componenteId ? { ...c, visible: !c.visible } : c
      ),
    }));
    setHasChanges(true);
  };

  const handleMoveComponent = (rol: RolTab, index: number, direction: 'up' | 'down') => {
    const setConfig = rol === 'vecino' ? setConfigVecino : setConfigSupervisor;
    const config = rol === 'vecino' ? configVecino : configSupervisor;

    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= config.componentes.length) return;

    const newComponentes = [...config.componentes];
    const temp = newComponentes[index];
    newComponentes[index] = newComponentes[newIndex];
    newComponentes[newIndex] = temp;

    // Actualizar orden
    newComponentes.forEach((c, i) => {
      c.orden = i + 1;
    });

    setConfig({ componentes: newComponentes });
    setHasChanges(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await Promise.all([
        configuracionApi.updateDashboardConfig('vecino', configVecino),
        configuracionApi.updateDashboardConfig('supervisor', configSupervisor),
      ]);
      toast.success('Configuración guardada correctamente');
      setHasChanges(false);
    } catch (error) {
      console.error('Error guardando configuración:', error);
      toast.error('Error al guardar la configuración');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!confirm('¿Estás seguro de restablecer la configuración por defecto?')) return;
    await loadConfigs();
    setHasChanges(false);
    toast.success('Configuración restablecida');
  };

  const currentConfig = activeTab === 'vecino' ? configVecino : configSupervisor;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: theme.primary }} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <StickyPageHeader
        icon={<Settings className="h-5 w-5" />}
        title="Configuración del Dashboard"
        backLink="/gestion/ajustes"
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={handleReset}
              disabled={saving}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors text-sm"
              style={{ color: theme.textSecondary }}
            >
              <RotateCcw className="h-4 w-4" />
              <span className="hidden sm:inline">Restablecer</span>
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !hasChanges}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg font-medium transition-all disabled:opacity-50 text-sm"
              style={{ backgroundColor: theme.primary, color: '#fff' }}
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Guardar
            </button>
          </div>
        }
      />

      {/* Tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setActiveTab('vecino')}
          className={`flex items-center gap-2 px-4 py-3 rounded-xl font-medium transition-all ${
            activeTab === 'vecino' ? 'scale-[1.02]' : 'opacity-70 hover:opacity-100'
          }`}
          style={{
            backgroundColor: activeTab === 'vecino' ? theme.primary : theme.card,
            color: activeTab === 'vecino' ? '#fff' : theme.text,
            border: `1px solid ${activeTab === 'vecino' ? theme.primary : theme.border}`,
          }}
        >
          <User className="h-5 w-5" />
          Dashboard Vecino
        </button>
        <button
          onClick={() => setActiveTab('supervisor')}
          className={`flex items-center gap-2 px-4 py-3 rounded-xl font-medium transition-all ${
            activeTab === 'supervisor' ? 'scale-[1.02]' : 'opacity-70 hover:opacity-100'
          }`}
          style={{
            backgroundColor: activeTab === 'supervisor' ? theme.primary : theme.card,
            color: activeTab === 'supervisor' ? '#fff' : theme.text,
            border: `1px solid ${activeTab === 'supervisor' ? theme.primary : theme.border}`,
          }}
        >
          <Wrench className="h-5 w-5" />
          Dashboard Supervisor
        </button>
      </div>

      {/* Lista de componentes */}
      <div
        className="rounded-xl p-5"
        style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
      >
        <h3 className="font-semibold mb-4" style={{ color: theme.text }}>
          Componentes del Dashboard - {activeTab === 'vecino' ? 'Vecino' : 'Supervisor'}
        </h3>
        <p className="text-sm mb-4" style={{ color: theme.textSecondary }}>
          Activa o desactiva los componentes y ordénalos como prefieras.
        </p>

        <div className="space-y-2">
          {currentConfig.componentes
            .sort((a, b) => a.orden - b.orden)
            .map((componente, index) => (
              <div
                key={componente.id}
                className="flex items-center gap-3 p-4 rounded-xl transition-all"
                style={{
                  backgroundColor: componente.visible
                    ? theme.backgroundSecondary
                    : `${theme.backgroundSecondary}80`,
                  border: `1px solid ${theme.border}`,
                  opacity: componente.visible ? 1 : 0.6,
                }}
              >
                {/* Drag handle */}
                <div className="flex flex-col gap-1">
                  <button
                    onClick={() => handleMoveComponent(activeTab, index, 'up')}
                    disabled={index === 0}
                    className="p-1 rounded hover:bg-white/10 disabled:opacity-30"
                    style={{ color: theme.textSecondary }}
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                    </svg>
                  </button>
                  <button
                    onClick={() => handleMoveComponent(activeTab, index, 'down')}
                    disabled={index === currentConfig.componentes.length - 1}
                    className="p-1 rounded hover:bg-white/10 disabled:opacity-30"
                    style={{ color: theme.textSecondary }}
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                </div>

                {/* Grip */}
                <GripVertical className="h-5 w-5 flex-shrink-0" style={{ color: theme.textSecondary }} />

                {/* Info */}
                <div className="flex-1">
                  <p className="font-medium" style={{ color: theme.text }}>
                    {componente.nombre}
                  </p>
                  <p className="text-xs" style={{ color: theme.textSecondary }}>
                    Orden: {componente.orden}
                  </p>
                </div>

                {/* Toggle visibility */}
                <button
                  onClick={() => handleToggleVisibility(activeTab, componente.id)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg transition-all"
                  style={{
                    backgroundColor: componente.visible ? '#10b98120' : '#ef444420',
                    color: componente.visible ? '#10b981' : '#ef4444',
                  }}
                >
                  {componente.visible ? (
                    <>
                      <Eye className="h-4 w-4" />
                      <span className="text-sm font-medium">Visible</span>
                    </>
                  ) : (
                    <>
                      <EyeOff className="h-4 w-4" />
                      <span className="text-sm font-medium">Oculto</span>
                    </>
                  )}
                </button>
              </div>
            ))}
        </div>
      </div>

      {/* Preview info */}
      <div
        className="rounded-xl p-4"
        style={{ backgroundColor: `${theme.primary}10`, border: `1px solid ${theme.primary}30` }}
      >
        <div className="flex items-start gap-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: `${theme.primary}20` }}
          >
            <Eye className="h-4 w-4" style={{ color: theme.primary }} />
          </div>
          <div>
            <p className="font-medium" style={{ color: theme.text }}>
              Vista previa
            </p>
            <p className="text-sm" style={{ color: theme.textSecondary }}>
              Los cambios se aplicarán cuando los usuarios accedan a su dashboard.
              Los componentes ocultos no se mostrarán, y el orden se respetará de arriba hacia abajo.
            </p>
          </div>
        </div>
      </div>

      {/* Unsaved changes indicator */}
      {hasChanges && (
        <div
          className="fixed bottom-4 right-4 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg"
          style={{ backgroundColor: '#f59e0b', color: '#000' }}
        >
          <span className="font-medium">Hay cambios sin guardar</span>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-3 py-1 bg-white/20 rounded-lg font-medium hover:bg-white/30 transition-colors"
          >
            {saving ? 'Guardando...' : 'Guardar ahora'}
          </button>
        </div>
      )}
    </div>
  );
}
