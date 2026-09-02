/**
 * FinanzasResumen — la variante RESUMEN del perfil financiero: TRES preguntas
 * en prosa, cero grillas.
 *
 * Se muestra cuando finanzas CONVIVE con reclamos o trámites (un muni full
 * como Merlo). Ahí el tablero ya habló de la calle y del mostrador: la plata
 * entra como un cierre de tres frases, no como otro bloque de tarjetas y
 * colas. La variante completa (`HeroFinanciero` + `ColasPagos` +
 * `TendenciaGastos`) es para el muni que SÓLO tiene finanzas.
 *
 * Quién de las dos se dibuja lo decide el registry por `soloSiDominioSolo` —
 * acá no hay un solo `if` de convivencia.
 *
 * Componente BOBO: las preguntas, sus respuestas y sus veredictos los arma
 * `construirPreguntasFinanzas` (armadoresFinanzas.ts).
 */
import { Fragment, useMemo } from 'react';
import { PiggyBank } from 'lucide-react';
import { SectionTitleV2 } from '../../../components/dashboard/SectionTitleV2';
import { KpiSemantico } from '../../../components/ui/KpiSemantico';
import { construirPreguntasFinanzas, construirResumenFinanciero } from '../armadoresFinanzas';
import type { SeccionProps } from '../tipos';

export function FinanzasResumen({ datos, ctx }: SeccionProps) {
  const finanzas = datos.finanzas;
  const contaduriaActiva = ctx.esActivo('contaduria');

  const preguntas = useMemo(() => {
    const resumen = construirResumenFinanciero(finanzas);
    return construirPreguntasFinanzas(resumen, finanzas, { contaduriaActiva });
  }, [finanzas, contaduriaActiva]);

  return (
    <>
      <SectionTitleV2
        icon={PiggyBank}
        label="Tesorería"
        action={{ label: 'Ver los gastos', to: '/gestion/tesoreria' }}
      />
      <div className="kse-fila-3">
        {preguntas.map((p) => (
          <KpiSemantico
            key={p.id}
            pregunta={p.pregunta}
            icono={p.icono}
            tono={p.tono}
            valor={p.valor}
            unidad={p.unidad}
            detalle={p.detalle.map((parte, i) => (
              <Fragment key={i}>
                {parte.fuerte ? <strong>{parte.texto}</strong> : parte.texto}
              </Fragment>
            ))}
            pie={p.pie}
            accion={p.accion}
          />
        ))}
      </div>
    </>
  );
}
