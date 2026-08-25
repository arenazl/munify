/**
 * KpisReclamos — la fila de cuatro KpiCardV2 del dominio reclamos
 * (total / nuevos hoy / esta semana / resolución promedio) con su
 * SectionTitleV2. Sale del monolito `pages/Dashboard.tsx` :944-954, sin
 * tocar markup ni clases.
 *
 * Componente BOBO: todo el criterio de copy y de deltas vive en
 * `buildKpisPeriodo` (armadores.ts).
 */
import { useMemo } from 'react';
import { ClipboardList } from 'lucide-react';
import { KpiCardV2 } from '../../../components/dashboard/KpiCardV2';
import { SectionTitleV2 } from '../../../components/dashboard/SectionTitleV2';
import { buildKpisPeriodo } from '../armadores';
import { useSemColors } from '../useSemColors';
import type { SeccionProps } from '../tipos';

export function KpisReclamos({ datos }: SeccionProps) {
  const sem = useSemColors();
  const { stats, tendencias } = datos.reclamos;

  // Serie diaria REAL de ingresos (tendencia de 90 días ya cargada).
  const serieDiaria = useMemo(() => tendencias.map((t) => t.cantidad), [tendencias]);

  const kpis = useMemo(
    () =>
      stats
        ? buildKpisPeriodo({
            stats,
            etiquetaTotal: 'Total reclamos',
            iconoTotal: ClipboardList,
            serieDiaria,
            color: sem.bueno,
            colorNeutro: sem.neutro,
            msgSinCierres: 'Sin cierres en los últimos 30 días',
          })
        : null,
    [stats, serieDiaria, sem.bueno, sem.neutro],
  );

  if (!kpis) return null;

  return (
    <>
      <SectionTitleV2
        icon={ClipboardList}
        label="Reclamos"
        action={{ label: 'Ver todos', to: '/gestion/reclamos' }}
      />
      <div className="dv2-grid-kpi">
        {kpis.map((k) => (
          <KpiCardV2 key={k.eyebrow} {...k} />
        ))}
      </div>
    </>
  );
}
