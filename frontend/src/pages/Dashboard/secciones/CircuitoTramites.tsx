/**
 * CircuitoTramites — el bloque de TRÁMITES del tablero: tres preguntas en
 * prosa sobre el mostrador.
 *
 * Hasta ahora los trámites tenían un tramo de cinta ("83 en total, 5 hoy") y
 * una frase del hero, y nada más: ni dónde se traban, ni si la gente va a los
 * turnos, ni qué tipo de trámite tarda. Esta sección es la foto que faltaba,
 * y es el espejo exacto de `FinanzasResumen` — mismo `SectionTitleV2` + fila
 * de `KpiSemantico`, misma composición, otro dominio.
 *
 * Componente BOBO: las preguntas, sus respuestas, sus veredictos y su
 * gramática los arma `construirPreguntasTramites` (armadoresTramites.ts). Acá
 * no hay un solo número ni un solo `if` de copy.
 *
 * Sin preguntas no dibuja nada (ni el título): pasa cuando el circuito no
 * llegó, cuando el GET falló, o cuando el muni tiene trámites pero ninguna de
 * las tres preguntas tiene base para contestarse.
 */
import { Fragment, useMemo } from 'react';
import { FileText } from 'lucide-react';
import { SectionTitleV2 } from '../../../components/dashboard/SectionTitleV2';
import { KpiSemantico } from '../../../components/ui/KpiSemantico';
import { construirPreguntasTramites } from '../armadoresTramites';
import type { SeccionProps } from '../tipos';

export function CircuitoTramites({ datos }: SeccionProps) {
  const circuito = datos.tramites.circuito;
  const preguntas = useMemo(() => construirPreguntasTramites(circuito), [circuito]);

  if (preguntas.length === 0) return null;

  return (
    <>
      {/* `blue` es el matiz del dominio trámites en todo el tablero: el mismo
          que lleva su tramo en la cinta de conteos. */}
      <SectionTitleV2
        icon={FileText}
        label="Trámites"
        tone="blue"
        action={{ label: 'Ver los trámites', to: '/gestion/tramites' }}
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
