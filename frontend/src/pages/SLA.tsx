import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Clock,
  Plus,
  Edit2,
  Trash2,
  Save,
  X,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sparkles,
  Timer,
  BarChart3,
  Bell
} from 'lucide-react';
import { toast } from 'sonner';
import { slaApi, categoriasApi } from '../lib/api';
import { useTheme } from '../contexts/ThemeContext';

interface SLAConfig {
  id: number;
  categoria_id: number | null;
  prioridad: number | null;
  tiempo_respuesta: number;
  tiempo_resolucion: number;
  tiempo_alerta_amarilla: number;
  activo: boolean;
  categoria?: { id: number; nombre: string };
}

interface Categoria {
  id: number;
  nombre: string;
}

interface SLAResumen {
  total_activos: number;
  en_tiempo: number;
  en_riesgo: number;
  vencidos: number;
  porcentaje_cumplimiento: number;
}

interface SLAAlerta {
  reclamo_id: number;
  titulo: string;
  categoria: string;
  estado_sla: string;
  horas_restantes: number;
  porcentaje_tiempo: number;
}

export default function SLA() {
  const { theme } = useTheme();
  const [configs, setConfigs] = useState<SLAConfig[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [resumen, setResumen] = useState<SLAResumen | null>(null);
  const [alertas, setAlertas] = useState<SLAAlerta[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    categoria_id: '' as string | number,
    prioridad: '' as string | number,
    tiempo_respuesta: 24,
    tiempo_resolucion: 72,
    tiempo_alerta_amarilla: 48,
    activo: true,
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      // Primero cargar datos básicos (configs y categorías)
      const [configsRes, categoriasRes] = await Promise.all([
        slaApi.getConfigs().catch(e => { console.error('Error configs:', e); return { data: [] }; }),
        categoriasApi.getAll(true).catch(e => { console.error('Error categorias:', e); return { data: [] }; }),
      ]);
      setConfigs(configsRes.data || []);
      setCategorias(categoriasRes.data || []);
      setLoading(false);

      // Después cargar datos de resumen (pueden tardar más)
      const [resumenRes, alertasRes] = await Promise.all([
        slaApi.getResumen().catch(e => { console.error('Error resumen:', e); return { data: null }; }),
        slaApi.getAlertas().catch(e => { console.error('Error alertas:', e); return { data: [] }; }),
      ]);
      setResumen(resumenRes.data);
      setAlertas(alertasRes.data || []);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Error al cargar datos SLA');
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      categoria_id: '',
      prioridad: '',
      tiempo_respuesta: 24,
      tiempo_resolucion: 72,
      tiempo_alerta_amarilla: 48,
      activo: true,
    });
    setEditingId(null);
    setShowForm(false);
  };

  const handleEdit = (config: SLAConfig) => {
    setFormData({
      categoria_id: config.categoria_id || '',
      prioridad: config.prioridad || '',
      tiempo_respuesta: config.tiempo_respuesta,
      tiempo_resolucion: config.tiempo_resolucion,
      tiempo_alerta_amarilla: config.tiempo_alerta_amarilla,
      activo: config.activo,
    });
    setEditingId(config.id);
    setShowForm(true);
  };

  const handleSubmit = async () => {
    setSaving(true);
    try {
      const data = {
        categoria_id: formData.categoria_id ? Number(formData.categoria_id) : undefined,
        prioridad: formData.prioridad ? Number(formData.prioridad) : undefined,
        tiempo_respuesta: formData.tiempo_respuesta,
        tiempo_resolucion: formData.tiempo_resolucion,
        tiempo_alerta_amarilla: formData.tiempo_alerta_amarilla,
        activo: formData.activo,
      };

      if (editingId) {
        await slaApi.updateConfig(editingId, data);
        toast.success('Configuración actualizada');
      } else {
        await slaApi.createConfig(data);
        toast.success('Configuración creada');
      }

      resetForm();
      fetchData();
    } catch (error) {
      console.error('Error saving:', error);
      toast.error('Error al guardar configuración');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('¿Eliminar esta configuración SLA?')) return;

    try {
      await slaApi.deleteConfig(id);
      toast.success('Configuración eliminada');
      fetchData();
    } catch (error) {
      console.error('Error deleting:', error);
      toast.error('Error al eliminar');
    }
  };

  const getPrioridadLabel = (prioridad: number | null) => {
    if (!prioridad) return 'Todas';
    const labels: Record<number, string> = {
      1: 'Baja',
      2: 'Media',
      3: 'Alta',
      4: 'Urgente',
      5: 'Crítica',
    };
    return labels[prioridad] || `P${prioridad}`;
  };

  const getEstadoSLAColor = (estado: string) => {
    switch (estado) {
      case 'en_tiempo': return '#22c55e';
      case 'en_riesgo': return '#f59e0b';
      case 'vencido': return '#ef4444';
      default: return theme.textSecondary;
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <div className="relative">
          <div
            className="animate-spin rounded-full h-12 w-12 border-4 border-t-transparent"
            style={{ borderColor: `${theme.primary}33`, borderTopColor: theme.primary }}
          />
          <Sparkles
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-5 w-5 animate-pulse"
            style={{ color: theme.primary }}
          />
        </div>
        <p className="text-sm animate-pulse" style={{ color: theme.textSecondary }}>Cargando SLA...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div
        className="rounded-xl px-5 py-4"
        style={{
          backgroundColor: theme.card,
          border: `1px solid ${theme.border}`,
        }}
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
              style={{ backgroundColor: `${theme.primary}20` }}
            >
              <Clock className="h-5 w-5" style={{ color: theme.primary }} />
            </div>
            <div>
              <h1 className="text-xl font-bold" style={{ color: theme.text }}>
                Gestión de SLA
              </h1>
              <p className="text-sm" style={{ color: theme.textSecondary }}>
                Acuerdos de nivel de servicio
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white transition-all hover:scale-105 w-full sm:w-auto"
            style={{ background: `linear-gradient(135deg, ${theme.primary} 0%, ${theme.primaryHover} 100%)` }}
          >
            <Plus className="h-4 w-4" />
            Nueva Configuración
          </button>
        </div>
      </div>

      {/* Resumen Cards */}
      {resumen && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div
            className="rounded-xl p-4"
            style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#3b82f620' }}>
                <BarChart3 className="h-5 w-5" style={{ color: '#3b82f6' }} />
              </div>
              <div>
                <p className="text-2xl font-bold" style={{ color: theme.text }}>{resumen.total_activos}</p>
                <p className="text-xs" style={{ color: theme.textSecondary }}>Reclamos activos</p>
              </div>
            </div>
          </div>

          <div
            className="rounded-xl p-4"
            style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#22c55e20' }}>
                <CheckCircle2 className="h-5 w-5" style={{ color: '#22c55e' }} />
              </div>
              <div>
                <p className="text-2xl font-bold" style={{ color: '#22c55e' }}>{resumen.en_tiempo}</p>
                <p className="text-xs" style={{ color: theme.textSecondary }}>En tiempo</p>
              </div>
            </div>
          </div>

          <div
            className="rounded-xl p-4"
            style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#f59e0b20' }}>
                <AlertTriangle className="h-5 w-5" style={{ color: '#f59e0b' }} />
              </div>
              <div>
                <p className="text-2xl font-bold" style={{ color: '#f59e0b' }}>{resumen.en_riesgo}</p>
                <p className="text-xs" style={{ color: theme.textSecondary }}>En riesgo</p>
              </div>
            </div>
          </div>

          <div
            className="rounded-xl p-4"
            style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#ef444420' }}>
                <AlertCircle className="h-5 w-5" style={{ color: '#ef4444' }} />
              </div>
              <div>
                <p className="text-2xl font-bold" style={{ color: '#ef4444' }}>{resumen.vencidos}</p>
                <p className="text-xs" style={{ color: theme.textSecondary }}>Vencidos</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cumplimiento */}
      {resumen && (
        <div
          className="rounded-xl p-5"
          style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium" style={{ color: theme.text }}>
              Cumplimiento SLA
            </span>
            <span
              className="text-lg font-bold"
              style={{ color: resumen.porcentaje_cumplimiento >= 80 ? '#22c55e' : resumen.porcentaje_cumplimiento >= 60 ? '#f59e0b' : '#ef4444' }}
            >
              {resumen.porcentaje_cumplimiento.toFixed(1)}%
            </span>
          </div>
          <div className="h-3 rounded-full overflow-hidden" style={{ backgroundColor: theme.backgroundSecondary }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${resumen.porcentaje_cumplimiento}%`,
                background: resumen.porcentaje_cumplimiento >= 80
                  ? 'linear-gradient(90deg, #22c55e 0%, #16a34a 100%)'
                  : resumen.porcentaje_cumplimiento >= 60
                    ? 'linear-gradient(90deg, #f59e0b 0%, #d97706 100%)'
                    : 'linear-gradient(90deg, #ef4444 0%, #dc2626 100%)',
              }}
            />
          </div>
        </div>
      )}

      {/* Alertas */}
      {alertas.length > 0 && (
        <div
          className="rounded-xl overflow-hidden"
          style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
        >
          <div className="px-5 py-3 flex items-center gap-2" style={{ backgroundColor: `${theme.primary}10` }}>
            <Bell className="h-4 w-4" style={{ color: theme.primary }} />
            <h3 className="text-sm font-semibold" style={{ color: theme.text }}>
              Alertas SLA ({alertas.length})
            </h3>
          </div>
          <div className="divide-y" style={{ borderColor: theme.border }}>
            {alertas.slice(0, 5).map((alerta) => (
              <div key={alerta.reclamo_id} className="px-5 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: getEstadoSLAColor(alerta.estado_sla) }}
                  />
                  <div>
                    <p className="text-sm font-medium" style={{ color: theme.text }}>
                      #{alerta.reclamo_id} - {alerta.titulo}
                    </p>
                    <p className="text-xs" style={{ color: theme.textSecondary }}>
                      {alerta.categoria}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p
                    className="text-sm font-semibold"
                    style={{ color: getEstadoSLAColor(alerta.estado_sla) }}
                  >
                    {alerta.horas_restantes > 0 ? `${alerta.horas_restantes}h restantes` : 'Vencido'}
                  </p>
                  <p className="text-xs" style={{ color: theme.textSecondary }}>
                    {alerta.porcentaje_tiempo}% del tiempo
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Configuraciones Table */}
      <div
        className="rounded-xl overflow-hidden"
        style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
      >
        <div className="px-5 py-3" style={{ backgroundColor: theme.backgroundSecondary }}>
          <h3 className="text-sm font-semibold" style={{ color: theme.text }}>
            Configuraciones SLA
          </h3>
        </div>

        {configs.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <Timer className="h-12 w-12 mx-auto mb-3 opacity-30" style={{ color: theme.textSecondary }} />
            <p className="text-sm" style={{ color: theme.textSecondary }}>
              No hay configuraciones SLA definidas
            </p>
            <button
              onClick={() => setShowForm(true)}
              className="mt-3 text-sm font-medium"
              style={{ color: theme.primary }}
            >
              Crear primera configuración
            </button>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr style={{ backgroundColor: theme.backgroundSecondary }}>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase" style={{ color: theme.textSecondary }}>
                  Categoría
                </th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase" style={{ color: theme.textSecondary }}>
                  Prioridad
                </th>
                <th className="px-5 py-3 text-center text-xs font-semibold uppercase" style={{ color: theme.textSecondary }}>
                  Respuesta
                </th>
                <th className="px-5 py-3 text-center text-xs font-semibold uppercase" style={{ color: theme.textSecondary }}>
                  Resolución
                </th>
                <th className="px-5 py-3 text-center text-xs font-semibold uppercase" style={{ color: theme.textSecondary }}>
                  Alerta
                </th>
                <th className="px-5 py-3 text-center text-xs font-semibold uppercase" style={{ color: theme.textSecondary }}>
                  Estado
                </th>
                <th className="px-5 py-3 text-right text-xs font-semibold uppercase w-24" style={{ color: theme.textSecondary }}>
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: theme.border }}>
              {configs.map((config, index) => (
                <tr
                  key={config.id}
                  style={{ backgroundColor: index % 2 === 0 ? 'transparent' : `${theme.backgroundSecondary}30` }}
                >
                  <td className="px-5 py-4">
                    <span className="text-sm font-medium" style={{ color: theme.text }}>
                      {config.categoria?.nombre || 'Todas las categorías'}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <span className="text-sm" style={{ color: theme.textSecondary }}>
                      {getPrioridadLabel(config.prioridad)}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-center">
                    <span className="text-sm font-medium" style={{ color: theme.text }}>
                      {config.tiempo_respuesta}h
                    </span>
                  </td>
                  <td className="px-5 py-4 text-center">
                    <span className="text-sm font-medium" style={{ color: theme.text }}>
                      {config.tiempo_resolucion}h
                    </span>
                  </td>
                  <td className="px-5 py-4 text-center">
                    <span className="text-sm" style={{ color: '#f59e0b' }}>
                      {config.tiempo_alerta_amarilla}h
                    </span>
                  </td>
                  <td className="px-5 py-4 text-center">
                    <span
                      className="px-2 py-1 rounded-full text-xs font-medium"
                      style={{
                        backgroundColor: config.activo ? '#22c55e20' : '#ef444420',
                        color: config.activo ? '#22c55e' : '#ef4444',
                      }}
                    >
                      {config.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleEdit(config)}
                        className="p-1.5 rounded-lg transition-colors"
                        style={{ color: theme.textSecondary }}
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(config.id)}
                        className="p-1.5 rounded-lg transition-colors hover:text-red-500"
                        style={{ color: theme.textSecondary }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Form Modal */}
      {showForm && createPortal(
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
            onClick={resetForm}
          />
          <div
            className="relative w-full max-w-md rounded-xl p-6 animate-in fade-in zoom-in-95 duration-200"
            style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold" style={{ color: theme.text }}>
                {editingId ? 'Editar Configuración SLA' : 'Nueva Configuración SLA'}
              </h3>
              <button onClick={resetForm} style={{ color: theme.textSecondary }}>
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: theme.textSecondary }}>
                  Categoría (opcional)
                </label>
                <select
                  value={formData.categoria_id}
                  onChange={(e) => setFormData({ ...formData, categoria_id: e.target.value })}
                  className="w-full rounded-lg px-3 py-2.5 text-sm"
                  style={{
                    backgroundColor: theme.backgroundSecondary,
                    border: `1px solid ${theme.border}`,
                    color: theme.text,
                  }}
                >
                  <option value="">Todas las categorías</option>
                  {categorias.map((cat) => (
                    <option key={cat.id} value={cat.id}>{cat.nombre}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: theme.textSecondary }}>
                  Prioridad (opcional)
                </label>
                <select
                  value={formData.prioridad}
                  onChange={(e) => setFormData({ ...formData, prioridad: e.target.value })}
                  className="w-full rounded-lg px-3 py-2.5 text-sm"
                  style={{
                    backgroundColor: theme.backgroundSecondary,
                    border: `1px solid ${theme.border}`,
                    color: theme.text,
                  }}
                >
                  <option value="">Todas las prioridades</option>
                  <option value="1">Baja</option>
                  <option value="2">Media</option>
                  <option value="3">Alta</option>
                  <option value="4">Urgente</option>
                  <option value="5">Crítica</option>
                </select>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: theme.textSecondary }}>
                    Respuesta (hs)
                  </label>
                  <input
                    type="number"
                    value={formData.tiempo_respuesta}
                    onChange={(e) => setFormData({ ...formData, tiempo_respuesta: Number(e.target.value) })}
                    className="w-full rounded-lg px-3 py-2.5 text-sm"
                    style={{
                      backgroundColor: theme.backgroundSecondary,
                      border: `1px solid ${theme.border}`,
                      color: theme.text,
                    }}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: theme.textSecondary }}>
                    Resolución (hs)
                  </label>
                  <input
                    type="number"
                    value={formData.tiempo_resolucion}
                    onChange={(e) => setFormData({ ...formData, tiempo_resolucion: Number(e.target.value) })}
                    className="w-full rounded-lg px-3 py-2.5 text-sm"
                    style={{
                      backgroundColor: theme.backgroundSecondary,
                      border: `1px solid ${theme.border}`,
                      color: theme.text,
                    }}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: '#f59e0b' }}>
                    Alerta (hs)
                  </label>
                  <input
                    type="number"
                    value={formData.tiempo_alerta_amarilla}
                    onChange={(e) => setFormData({ ...formData, tiempo_alerta_amarilla: Number(e.target.value) })}
                    className="w-full rounded-lg px-3 py-2.5 text-sm"
                    style={{
                      backgroundColor: theme.backgroundSecondary,
                      border: `1px solid ${theme.border}`,
                      color: theme.text,
                    }}
                  />
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => setFormData({ ...formData, activo: !formData.activo })}
                  className={`relative w-12 h-6 rounded-full transition-colors ${formData.activo ? '' : 'opacity-50'}`}
                  style={{ backgroundColor: formData.activo ? theme.primary : theme.backgroundSecondary }}
                >
                  <span
                    className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${formData.activo ? 'left-7' : 'left-1'}`}
                  />
                </button>
                <span className="text-sm" style={{ color: theme.text }}>
                  {formData.activo ? 'Activo' : 'Inactivo'}
                </span>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={resetForm}
                className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium"
                style={{
                  backgroundColor: theme.backgroundSecondary,
                  color: theme.textSecondary,
                }}
              >
                Cancelar
              </button>
              <button
                onClick={handleSubmit}
                disabled={saving}
                className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium text-white flex items-center justify-center gap-2"
                style={{ background: `linear-gradient(135deg, ${theme.primary} 0%, ${theme.primaryHover} 100%)` }}
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {editingId ? 'Guardar' : 'Crear'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
