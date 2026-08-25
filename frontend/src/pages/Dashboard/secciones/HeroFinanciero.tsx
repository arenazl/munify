/**
 * HeroFinanciero — la fila de CINCO KPIs del perfil financiero, con su título
 * de sección. Es la variante COMPLETA: se muestra cuando finanzas es el único
 * dominio del muni (San Pedro Norte). Conviviendo con reclamos/trámites, el
 * registry pone en su lugar a `FinanzasResumen`.
 *
 * Componente BOBO: qué dice cada tarjeta, con qué veredicto y qué redacción
 * usa cuando el número es cero lo decide `construirKpisFinancieros`
 * (armadoresFinanzas.ts). Acá sólo se compone el kit.
 */
import { useMemo } from 'react';
import { PiggyBank } from 'lucide-react';
import { KpiCardV2 } from '../../../components/dashboard/KpiCardV2';
import { SectionTitleV2 } from '../../../components/dashboard/SectionTitleV2';
import { construirKpisFinancieros, construirResumenFinanciero } from '../armadoresFinanzas';
import { useSemColors } from '../useSemColors';
import type { SeccionProps } from '../tipos';

export function HeroFinanciero({ datos, ctx }: SeccionProps) {
  const sem = useSemColors();
  const finanzas = datos.finanzas;
  const contaduriaActiva = ctx.esActivo('contaduria');

  const resumen = useMemo(() => construirResumenFinanciero(finanzas), [finanzas]);
  const kpis = useMemo(
    () => construirKpisFinancieros(resumen, finanzas, {
      contaduriaActiva,
      color: sem.bueno,
      colorNeutro: sem.neutro,
    }),
    [resumen, finanzas, contaduriaActiva, sem.bueno, sem.neutro],
  );

  return (
    <>
      <SectionTitleV2
        icon={PiggyBank}
        label="Finanzas"
        action={{ label: 'Ver los gastos', to: '/gestion/tesoreria' }}
      />
      <div className="dv2-grid-kpi dv2-grid-kpi--5">
        {kpis.map((k) => (
          <KpiCardV2 key={k.eyebrow} {...k} />
        ))}
      </div>
    </>
  );
}
