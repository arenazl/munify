/**
 * KpisTramites — la misma fila de cuatro KpiCardV2 que reclamos, con los
 * datos del dominio trámites. Sale del monolito `pages/Dashboard.tsx`
 * :956-971, sin tocar markup ni clases.
 *
 * Para trámites no hay serie diaria cargada: cada card usa la evolución real
 * de dos puntos (período previo → actual) de `stats.tendencias`.
 */
import { useMemo } from 'react';
import { FileCheck, FileText } from 'lucide-react';
import { KpiCardV2 } from '../../../components/dashboard/KpiCardV2';
import { SectionTitleV2 } from '../../../components/dashboard/SectionTitleV2';
import { buildKpisPeriodo } from '../armadores';
import { useSemColors } from '../useSemColors';
import type { SeccionProps } from '../tipos';

export function KpisTramites({ datos }: SeccionProps) {
  const sem = useSemColors();
  const { stats } = datos.tramites;

  const kpis = useMemo(
    () =>
      stats
        ? buildKpisPeriodo({
            stats,
            etiquetaTotal: 'Total trámites',
            iconoTotal: FileText,
            color: sem.azul,
            colorNeutro: sem.neutro,
            msgSinCierres: 'Sin trámites cerrados todavía',
          })
        : null,
    [stats, sem.azul, sem.neutro],
  );

  if (!kpis) return null;

  return (
    <>
      <SectionTitleV2
        icon={FileCheck}
        label="Trámites"
        tone="blue"
        action={{ label: 'Ver todos', to: '/gestion/tramites' }}
      />
      <div className="dv2-grid-kpi">
        {kpis.map((k) => (
          <KpiCardV2 key={k.eyebrow} {...k} />
        ))}
      </div>
    </>
  );
}
