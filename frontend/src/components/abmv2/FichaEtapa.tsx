/**
 * FichaEtapa — el segundo nivel de una obra, pieza del kit v3. Tres piezas:
 *
 *   <RenglonEtapa>  la etapa plegada: número, nombre, situación, sus tres relojes
 *                   en miniatura y la plata. Se lee de un vistazo, se toca y abre…
 *   <ModalEtapa>    …el detalle en un MODAL GRANDE del kit (`Modal size="full"`),
 *                   con paso a la etapa anterior y siguiente en el pie.
 *   <CuerpoEtapa>   el contenido: qué pasó y qué arrastra (frase del backend), los
 *                   tres relojes con sus números, en qué se fue la plata, quién
 *                   estuvo, y el libro de gastos, que es el expediente para rendir:
 *                   cada renglón abre el gasto en Tesorería.
 *
 * El detalle va en modal y NO desplegado abajo (dueño, 2026-09-13): desplegar movía
 * el largo de la página y el scroll saltaba a cualquier lado.
 *
 * Tonta: recibe la etapa ya diagnosticada y sus gastos; avisa al padre para confirmar
 * propuestas y abrir gastos.
 */
import { Check, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { TresRelojes } from './TresRelojes';
import { fechaCorta, RUBRO_COLOR, RUBRO_LABEL, SITUACION_LABEL, type EtapaObra, type GastoObra } from '../../lib/obras-tipos';

type Fmt = (n: number | string) => string;

export interface CuerpoEtapaProps {
  etapa: EtapaObra;
  gastos: GastoObra[];          // los de la etapa, más los propuestos para ella
  hoy: string;
  obraNombre?: string;          // para no repetirlo en cada renglón del libro
  onConfirmar: (imputacionIds: number[], etapaId: number) => void;
  onAbrirGasto: (gastoId: number) => void;
  fmtMoney: Fmt;
}

function relojesDeEtapa(e: EtapaObra, fmt: Fmt) {
  const desvio = e.desvio_fin_dias ?? 0;
  const tiempoSub = e.estado === 'terminada'
    ? (desvio > 0 ? `terminó ${desvio} días tarde` : desvio < 0 ? `terminó ${-desvio} días antes` : 'terminó en fecha')
    : (desvio > 0 ? `${desvio} días pasada de su fin` : e.fecha_fin_prevista ? `vence el ${fechaCorta(e.fecha_fin_prevista)}` : 'sin fin previsto');
  return {
    tiempo: {
      pct: e.pct_tiempo ?? null,
      valor: e.plazo_dias != null && e.dias_llevados != null ? `${e.dias_llevados} de ${e.plazo_dias} días` : e.dias_llevados != null ? `${e.dias_llevados} días` : '—',
      sub: tiempoSub,
      veredicto: (e.pct_tiempo ?? 0) > e.avance_pct + 15 && e.estado !== 'terminada' ? ('advertencia' as const) : undefined,
    },
    hecho: { pct: e.avance_pct, valor: `${e.avance_pct}%`, sub: e.estado === 'terminada' ? 'terminada' : e.estado === 'parada' ? 'parada' : e.estado === 'pendiente' ? 'por empezar' : 'en curso' },
    plata: {
      pct: e.pct_plata ?? null,
      valor: e.monto_previsto_efectivo ? `${fmt(e.ejecutado)} de ${fmt(e.monto_previsto_efectivo)}` : fmt(e.ejecutado),
      sub: Number(e.programado) > 0 ? `${fmt(e.programado)} programados` : e.monto_previsto_efectivo ? null : 'sin monto previsto',
      veredicto: (e.pct_plata ?? 0) > e.avance_pct + 15 ? ('malo' as const) : undefined,
    },
  };
}

const fechasDe = (e: EtapaObra) => e.estado === 'pendiente'
  ? `${fechaCorta(e.fecha_inicio_prevista)} a ${fechaCorta(e.fecha_fin_prevista)}, previsto`
  : `${fechaCorta(e.fecha_inicio_real || e.fecha_inicio_prevista)} a ${e.fecha_fin_real ? fechaCorta(e.fecha_fin_real) : 'hoy'}${e.fecha_fin_prevista && !e.fecha_fin_real ? ` · previsto hasta el ${fechaCorta(e.fecha_fin_prevista)}` : ''}`;

/** Dentro de una obra, repetir su nombre en cada gasto es ruido: se saca del texto. */
function queEs(g: GastoObra, obra?: string) {
  const partes = [g.concepto, g.descripcion].filter(Boolean).join(' · ');
  if (!obra) return partes;
  const limpio = partes
    .split(' · ')
    .filter((t) => t.trim() && !t.toLowerCase().includes(obra.toLowerCase()))
    .join(' · ');
  return limpio || partes;
}

export function TablaGastosObra({ gastos, hoy, etapaId, obraNombre, onConfirmar, onAbrirGasto, fmtMoney, conEtapas }: {
  gastos: GastoObra[]; hoy: string; etapaId?: number; obraNombre?: string; conEtapas: boolean;
  onConfirmar?: (ids: number[], etapaId: number) => void; onAbrirGasto: (gastoId: number) => void; fmtMoney: Fmt;
}) {
  if (gastos.length === 0) return <p className="fe-vacio">Todavía no hay gastos imputados acá.</p>;
  return (
    <div className="fe-gastos">
      {gastos.map((g) => {
        const programado = g.fecha > hoy;
        const vencido = !programado && g.estado_pago === 'pendiente';
        const propuesto = conEtapas && g.etapa_id == null;
        return (
          <div key={g.imputacion_id} className={`fe-gasto ${programado ? 'fe-gasto--prog' : ''} ${propuesto ? 'fe-gasto--prop' : ''}`}>
            <span className="fe-g-fecha">{fechaCorta(g.fecha)}</span>
            <span className="fe-g-quien">{g.destino?.nombre ?? <em>sin destino</em>}</span>
            <span className="fe-g-que">{queEs(g, obraNombre)}</span>
            <span className="fe-g-rubro"><i style={{ background: RUBRO_COLOR[g.rubro] ?? RUBRO_COLOR.otros }} />{RUBRO_LABEL[g.rubro] ?? g.rubro}</span>
            <span className={`fe-g-estado ${vencido ? 'av2-vered-malo' : ''}`}>{propuesto ? 'propuesto' : programado ? 'programado' : vencido ? 'vencido sin pagar' : 'pagado'}</span>
            <span className="fe-g-monto">{fmtMoney(g.monto)}</span>
            {propuesto && onConfirmar && etapaId != null
              ? <button type="button" className="fe-g-btn fe-g-btn--ok" title="Confirmar que es de esta etapa" onClick={() => onConfirmar([g.imputacion_id], etapaId)}><Check size={14} strokeWidth={2.5} /></button>
              : <button type="button" className="fe-g-btn" title="Abrir en Tesorería" onClick={() => onAbrirGasto(g.gasto_id)}><ExternalLink size={14} /></button>}
          </div>
        );
      })}
    </div>
  );
}

/** El renglón plegado de la lista "Etapa por etapa". */
export function RenglonEtapa({ etapa: e, activa, onAbrir, fmtMoney }: {
  etapa: EtapaObra; activa?: boolean; onAbrir: () => void; fmtMoney: Fmt;
}) {
  const relojes = relojesDeEtapa(e, fmtMoney);
  return (
    <button type="button" className={`fe fe--${e.veredicto} fe-cab ${activa ? 'fe--activa' : ''}`} onClick={onAbrir} id={`etapa-${e.id}`}>
      <span className="fe-num">{e.orden}</span>
      <span className="fe-titulo">
        <strong>{e.nombre}</strong>
        <span className="fe-fechas">{fechasDe(e)}</span>
      </span>
      <span className={`fe-sit av2-vered-${e.veredicto}`}>{SITUACION_LABEL[e.situacion] ?? e.situacion}</span>
      <span className="fe-mini"><TresRelojes {...relojes} tamano="mini" /></span>
      <span className="fe-plata">{fmtMoney(e.ejecutado)}{e.monto_previsto_efectivo ? <small> de {fmtMoney(e.monto_previsto_efectivo)}</small> : null}</span>
      <span className="fe-ver">Ver <ChevronRight size={14} /></span>
    </button>
  );
}

/** El contenido del detalle de una etapa: diagnóstico, relojes, rubros, gente y gastos. */
export function CuerpoEtapa({ etapa: e, gastos, hoy, obraNombre, onConfirmar, onAbrirGasto, fmtMoney }: CuerpoEtapaProps) {
  const relojes = relojesDeEtapa(e, fmtMoney);
  const propuestos = gastos.filter((g) => g.etapa_id == null);
  const partes: Array<[string, number]> = [['contratista', Number(e.contratista)], ['materiales', Number(e.materiales)], ['mano_de_obra', Number(e.mano_de_obra)], ['otros', Number(e.otros)]];
  const totalRubros = partes.reduce((a, [, v]) => a + v, 0);

  return (
    <div className={`fe-cuerpo fe--${e.veredicto}`}>
      <p className={`fe-frase av2-vered-${e.veredicto}`}>{e.frase}</p>
      {e.arrastre && <p className="fe-arrastre">{e.arrastre}</p>}

      <div className="fe-grid">
        <div className="fe-bloque">
          <h4>Los tres relojes de la etapa</h4>
          <TresRelojes {...relojes} tamano="grande" />
        </div>
        <div className="fe-bloque">
          <h4>En qué se fue la plata</h4>
          {totalRubros > 0 ? (
            <>
              <div className="fe-rubros">
                {partes.filter(([, v]) => v > 0).map(([k, v]) => <i key={k} style={{ width: `${(v / totalRubros) * 100}%`, background: RUBRO_COLOR[k] }} title={`${RUBRO_LABEL[k]} · ${fmtMoney(v)}`} />)}
              </div>
              <div className="fe-rubros-key">
                {partes.filter(([, v]) => v > 0).map(([k, v]) => <b key={k}><i style={{ background: RUBRO_COLOR[k] }} />{RUBRO_LABEL[k]} <span>{fmtMoney(v)} · {Math.round((v / totalRubros) * 100)}%</span></b>)}
              </div>
            </>
          ) : <p className="fe-vacio">Sin plata imputada todavía.</p>}
        </div>
        <div className="fe-bloque">
          <h4>Quién estuvo</h4>
          <p className="fe-gente">
            {e.gente.ordenes_trabajo > 0
              ? <>{e.gente.ordenes_trabajo} orden{e.gente.ordenes_trabajo === 1 ? '' : 'es'} de trabajo · {e.gente.horas} h{e.gente.cuadrillas.length ? <><br />{e.gente.cuadrillas.join(', ')}</> : ''}</>
              : 'Sin órdenes de trabajo cargadas en esta etapa.'}
            {Number(e.mano_de_obra) > 0 && <><br />{fmtMoney(e.mano_de_obra)} en sueldos y jornales</>}
          </p>
          {Number(e.programado) > 0 && <p className="fe-gente" style={{ marginTop: 8 }}>Quedan {fmtMoney(e.programado)} programados, con fecha futura y todavía sin pagar.</p>}
        </div>
      </div>

      <div className="fe-bloque">
        <div className="fe-libro-cab">
          <h4>El libro de gastos de la etapa <span>{gastos.length - propuestos.length} imputado{gastos.length - propuestos.length === 1 ? '' : 's'}{propuestos.length ? ` · ${propuestos.length} propuesto${propuestos.length === 1 ? '' : 's'}` : ''}</span></h4>
          {propuestos.length > 1 && <button type="button" className="av2-btn-secundario" onClick={() => onConfirmar(propuestos.map((g) => g.imputacion_id), e.id)}><Check size={14} /> Confirmar los {propuestos.length}</button>}
        </div>
        <TablaGastosObra gastos={gastos} hoy={hoy} etapaId={e.id} obraNombre={obraNombre} conEtapas onConfirmar={onConfirmar} onAbrirGasto={onAbrirGasto} fmtMoney={fmtMoney} />
      </div>
    </div>
  );
}

/** El detalle de la etapa en un modal grande, con paso a la anterior y la siguiente. */
export function ModalEtapa({ etapa: e, gastos, hoy, obraNombre, total, onCerrar, onIr, onConfirmar, onAbrirGasto, fmtMoney }: CuerpoEtapaProps & {
  total: number; onCerrar: () => void; onIr: (orden: number) => void;
}) {
  return (
    <Modal
      open
      onClose={onCerrar}
      size="panel"
      title={`Etapa ${e.orden} de ${total} · ${e.nombre}`}
      description={`${fechasDe(e)} · ${SITUACION_LABEL[e.situacion] ?? e.situacion}`}
      footer={(
        <div className="fe-modal-pie">
          <button type="button" className="av2-btn-secundario" disabled={e.orden <= 1} onClick={() => onIr(e.orden - 1)}><ChevronLeft size={14} /> Etapa anterior</button>
          <span className="fe-modal-pos">{e.orden} de {total}</span>
          <button type="button" className="av2-btn-secundario" disabled={e.orden >= total} onClick={() => onIr(e.orden + 1)}>Etapa siguiente <ChevronRight size={14} /></button>
        </div>
      )}
    >
      <CuerpoEtapa etapa={e} gastos={gastos} hoy={hoy} obraNombre={obraNombre} onConfirmar={onConfirmar} onAbrirGasto={onAbrirGasto} fmtMoney={fmtMoney} />
    </Modal>
  );
}

export default RenglonEtapa;
