import { useEffect, useState } from 'react';
import { Sparkles, Save } from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from '../contexts/ThemeContext';
import { iaConfigApi, municipiosApi } from '../lib/api';
import { StickyPageHeader } from '../components/ui/StickyPageHeader';
import { ModernSelect } from '../components/ui/ModernSelect';

interface MuniOpt { id: number; nombre: string; codigo: string; }

/**
 * Configuración de IA por municipio (SOLO superadmin).
 *
 * Elegís un municipio y prendés/apagás su IA + elegís el modelo de Gemini.
 * Cuando está apagada, el front oculta todas las superficies de IA de ese muni
 * (gate central useIaHabilitada) y el backend cae a los fallbacks no-IA.
 * El intendente NO ve esta pantalla.
 */
export default function ConfiguracionIA() {
  const { theme } = useTheme();
  const [munis, setMunis] = useState<MuniOpt[]>([]);
  const [muniId, setMuniId] = useState<number | null>(null);
  const [habilitada, setHabilitada] = useState(false);
  const [tesoreria, setTesoreria] = useState(true);
  const [modelo, setModelo] = useState('gemini-2.5-flash');
  const [modelos, setModelos] = useState<string[]>(['gemini-2.5-flash']);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    municipiosApi.getAll()
      .then((r) => {
        const arr = (r.data as MuniOpt[]).map((m) => ({ id: m.id, nombre: m.nombre, codigo: m.codigo }));
        setMunis(arr.sort((a, b) => a.nombre.localeCompare(b.nombre)));
      })
      .catch(() => toast.error('No se pudieron cargar los municipios'));
    iaConfigApi.adminModelos().then((r) => setModelos(r.data || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!muniId) return;
    setLoading(true);
    iaConfigApi.adminGet(muniId)
      .then((r) => { setHabilitada(!!r.data.habilitada); setModelo(r.data.modelo || 'gemini-2.5-flash'); setTesoreria(r.data.tesoreria !== false); })
      .catch(() => { setHabilitada(false); setModelo('gemini-2.5-flash'); setTesoreria(true); })
      .finally(() => setLoading(false));
  }, [muniId]);

  const handleGuardar = async () => {
    if (!muniId) return;
    setSaving(true);
    try {
      await iaConfigApi.adminPut(muniId, { habilitada, provider: 'gemini', modelo, tesoreria });
      toast.success('Configuración de IA guardada');
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(msg || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <StickyPageHeader icon={<Sparkles className="h-5 w-5" />} title="Configuración de IA por municipio" />

      <div className="rounded-xl p-4" style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}>
        <div className="min-w-[280px] max-w-md">
          <label className="block text-[11px] font-semibold mb-1" style={{ color: theme.textSecondary }}>Municipio</label>
          <ModernSelect
            value={muniId === null ? '' : String(muniId)}
            onChange={(v) => setMuniId(v ? Number(v) : null)}
            options={munis.map((m) => ({ value: String(m.id), label: `${m.nombre} [${m.codigo}]` }))}
            placeholder="Seleccioná un municipio"
            searchable
          />
        </div>
      </div>

      {!muniId ? (
        <div className="rounded-xl p-12 text-center" style={{ backgroundColor: theme.card, border: `1px dashed ${theme.border}`, color: theme.textSecondary }}>
          Seleccioná un municipio para configurar su IA.
        </div>
      ) : loading ? (
        <div className="rounded-xl p-12 text-center" style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}`, color: theme.textSecondary }}>
          Cargando…
        </div>
      ) : (
        <div className="rounded-xl p-5 space-y-5" style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}>
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold" style={{ color: theme.text }}>Inteligencia Artificial</p>
              <p className="text-[11px]" style={{ color: theme.textSecondary }}>
                {habilitada
                  ? 'Activada: el municipio ve asistentes, clasificación automática y paneles de insights.'
                  : 'Desactivada: se ocultan TODAS las funciones de IA en este municipio.'}
              </p>
            </div>
            <button
              onClick={() => setHabilitada((v) => !v)}
              className="relative inline-flex h-7 w-12 rounded-full transition-colors flex-shrink-0"
              style={{ backgroundColor: habilitada ? '#22c55e' : '#9ca3af' }}
              title={habilitada ? 'IA activada — click para desactivar' : 'IA desactivada — click para activar'}
            >
              <span className="inline-block h-6 w-6 rounded-full bg-white transition-transform" style={{ transform: habilitada ? 'translateX(22px)' : 'translateX(2px)', marginTop: '2px' }} />
            </button>
          </div>

          <div className={habilitada ? '' : 'opacity-50 pointer-events-none'}>
            <label className="block text-[11px] font-semibold mb-1" style={{ color: theme.textSecondary }}>Modelo de Gemini</label>
            <div className="max-w-xs">
              <ModernSelect
                value={modelo}
                onChange={(v) => setModelo(v)}
                options={modelos.map((m) => ({ value: m, label: m }))}
                placeholder="Modelo"
              />
            </div>
            <p className="text-[11px] mt-1" style={{ color: theme.textSecondary }}>
              Modelo que usa este municipio para asistentes, clasificación e insights.
            </p>
          </div>

          <div className={habilitada ? '' : 'opacity-50 pointer-events-none'}>
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-semibold" style={{ color: theme.text }}>IA en Tesorería</p>
                <p className="text-[11px]" style={{ color: theme.textSecondary }}>
                  {tesoreria
                    ? 'Activada: muestra los paneles operativos y el banner de curación en Tesorería.'
                    : 'Desactivada: oculta los paneles de IA solo en Tesorería (el resto de la IA sigue).'}
                </p>
              </div>
              <button
                onClick={() => setTesoreria((v) => !v)}
                className="relative inline-flex h-7 w-12 rounded-full transition-colors flex-shrink-0"
                style={{ backgroundColor: tesoreria ? '#22c55e' : '#9ca3af' }}
                title={tesoreria ? 'IA de Tesorería activada — click para desactivar' : 'IA de Tesorería desactivada — click para activar'}
              >
                <span className="inline-block h-6 w-6 rounded-full bg-white transition-transform" style={{ transform: tesoreria ? 'translateX(22px)' : 'translateX(2px)', marginTop: '2px' }} />
              </button>
            </div>
          </div>

          <div className="pt-1">
            <button
              onClick={handleGuardar}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50"
              style={{ backgroundColor: theme.primary }}
            >
              <Save className="w-4 h-4" />
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
