// Vista comercial del superadmin: municipios reales de la plataforma con su
// tipo (productivo/demo), uso y módulos activos.
//
// NOTA: hasta 2026-07 esta pantalla mostraba 6 municipios FICTICIOS con
// facturación inventada (SUSCRIPCIONES_DEMO). Hoy consume datos reales de
// GET /municipios/admin/resumen. Facturación/planes quedan para cuando exista
// billing de verdad — acá no se inventa ningún número.
import { useEffect, useMemo, useState } from 'react';
import { Building2, CheckCircle2, FlaskConical, Activity, Users, ClipboardList, Calendar } from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from '../../contexts/ThemeContext';
import { ABMPage } from '../../components/ui/ABMPage';
import type { KpiSpec } from '../../components/ui/KpiCard';
import { PillsOrSelect } from '../../components/ui/PillsOrSelect';
import { municipiosApi } from '../../lib/api';
import { MODULOS, moduloEfectivo } from '../../lib/enums/modulos';

interface ResumenMuni {
  id: number;
  nombre: string;
  codigo: string;
  activo: boolean;
  es_demo: boolean;
  alta: string | null;
  usuarios_activos: number;
  reclamos_total: number;
  ultima_actividad: string | null;
  modulos: { modulo: string; activo: boolean }[];
}

type TipoFiltro = '' | 'productivo' | 'demo';

const COLOR_PRODUCTIVO = '#10b981';
const COLOR_DEMO = '#3b82f6';

function formatFecha(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function diasDesde(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
}

export default function Suscripciones() {
  const { theme } = useTheme();
  const [munis, setMunis] = useState<ResumenMuni[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tipoFiltro, setTipoFiltro] = useState<TipoFiltro>('');

  useEffect(() => {
    (async () => {
      try {
        const res = await municipiosApi.adminResumen();
        setMunis(res.data || []);
      } catch {
        toast.error('Error cargando el resumen de municipios');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    return munis.filter(m => {
      if (tipoFiltro === 'productivo' && m.es_demo) return false;
      if (tipoFiltro === 'demo' && !m.es_demo) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!m.nombre.toLowerCase().includes(q) && !m.codigo.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [munis, search, tipoFiltro]);

  const totales = useMemo(() => {
    const productivos = munis.filter(m => !m.es_demo && m.activo).length;
    const demos = munis.filter(m => m.es_demo && m.activo).length;
    const conActividadReciente = munis.filter(m => {
      const d = diasDesde(m.ultima_actividad);
      return d !== null && d <= 7;
    }).length;
    const vecinos = munis.reduce((acc, m) => acc + m.usuarios_activos, 0);
    return { productivos, demos, conActividadReciente, vecinos, total: munis.length };
  }, [munis]);

  const kpisSpec: KpiSpec[] = [
    {
      label: 'Productivos',
      value: `${totales.productivos}`,
      icon: CheckCircle2,
      color: COLOR_PRODUCTIVO,
      footnote: 'clientes reales',
      highlighted: true,
    },
    {
      label: 'Demos',
      value: `${totales.demos}`,
      icon: FlaskConical,
      color: COLOR_DEMO,
      footnote: 'prospectos / pruebas',
    },
    {
      label: 'Activos esta semana',
      value: `${totales.conActividadReciente}`,
      icon: Activity,
      color: '#f59e0b',
      footnote: 'con actividad en 7 días',
    },
    {
      label: 'Usuarios activos',
      value: `${totales.vecinos.toLocaleString('es-AR')}`,
      icon: Users,
      color: '#8b5cf6',
      footnote: 'en toda la plataforma',
    },
  ];

  const tipoOptions = [
    { value: '', label: 'Todos' },
    { value: 'productivo', label: 'Productivos', color: COLOR_PRODUCTIVO },
    { value: 'demo', label: 'Demos', color: COLOR_DEMO },
  ];

  const extraFilters = (
    <PillsOrSelect
      value={tipoFiltro}
      onChange={(v) => setTipoFiltro(v as TipoFiltro)}
      options={tipoOptions}
      placeholder="Tipo"
      size="sm"
    />
  );

  return (
    <ABMPage
      title="Suscripciones"
      icon={<Building2 className="h-5 w-5" />}
      searchValue={search}
      onSearchChange={setSearch}
      searchPlaceholder="Buscar municipio..."
      headerActions={extraFilters}
      loading={loading}
      isEmpty={filtered.length === 0}
      emptyMessage="No hay municipios que coincidan con el filtro."
      kpis={kpisSpec}
    >
      {filtered.map(m => {
        const tipoColor = m.es_demo ? COLOR_DEMO : COLOR_PRODUCTIVO;
        const diasAct = diasDesde(m.ultima_actividad);
        const modulosOn = MODULOS.filter(def => moduloEfectivo(def, m.modulos));
        return (
          <div
            key={m.id}
            className="rounded-xl p-4 transition-all hover:shadow-md"
            style={{
              backgroundColor: theme.card,
              border: `1px solid ${theme.border}`,
              opacity: m.activo ? 1 : 0.55,
            }}
          >
            <div className="flex items-start justify-between gap-2 mb-3">
              <div className="min-w-0">
                <div className="font-bold text-base truncate" style={{ color: theme.text }}>
                  {m.nombre}
                </div>
                <div className="text-[11px] font-mono" style={{ color: theme.textSecondary }}>
                  {m.codigo}
                </div>
              </div>
              <span
                className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: `${tipoColor}15`, color: tipoColor, border: `1px solid ${tipoColor}40` }}
              >
                {m.es_demo ? 'Demo' : 'Productivo'}
              </span>
            </div>

            <div className="flex items-center gap-4 mb-3 text-xs" style={{ color: theme.textSecondary }}>
              <span className="flex items-center gap-1">
                <Users className="h-3.5 w-3.5" />
                <strong style={{ color: theme.text }}>{m.usuarios_activos}</strong> usuarios
              </span>
              <span className="flex items-center gap-1">
                <ClipboardList className="h-3.5 w-3.5" />
                <strong style={{ color: theme.text }}>{m.reclamos_total.toLocaleString('es-AR')}</strong> reclamos
              </span>
            </div>

            {modulosOn.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-3">
                {modulosOn.map(def => (
                  <span
                    key={def.key}
                    className="text-[10px] px-1.5 py-0.5 rounded-md"
                    style={{ backgroundColor: `${theme.primary}12`, color: theme.primary }}
                  >
                    {def.label}
                  </span>
                ))}
              </div>
            )}

            <div
              className="text-xs flex items-center gap-1.5 pt-3"
              style={{ color: theme.textSecondary, borderTop: `1px solid ${theme.border}` }}
            >
              <Calendar className="h-3.5 w-3.5" />
              <span>Alta: <strong style={{ color: theme.text }}>{formatFecha(m.alta)}</strong></span>
              {diasAct !== null && (
                <span
                  className="ml-auto text-[10px] font-semibold"
                  style={{ color: diasAct <= 7 ? COLOR_PRODUCTIVO : theme.textSecondary }}
                >
                  {diasAct === 0 ? 'activo hoy' : `última actividad hace ${diasAct}d`}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </ABMPage>
  );
}
