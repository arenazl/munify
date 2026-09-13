/**
 * LineaDeTiempoObra — el mapa del calendario de una obra, pieza del kit v3.
 *
 * UN solo nivel (dueño, 2026-09-13): la obra ENTERA, siempre entra en la pantalla.
 * Meses de izquierda a derecha, los hitos arriba (inicio, fin previsto, fin proyectado),
 * las etapas como segmentos nombrados y coloreados por cómo vienen, el cursor de hoy.
 * Tocar una etapa abre su ficha abajo (el segundo nivel vive en `FichaEtapa`, que es
 * diagnóstico y libro de gastos, no otro dibujo).
 *
 * Tonta: el padre le pasa los datos ya resueltos; no llama a la API ni conoce rutas.
 */
import type { Veredicto } from '../../lib/semanticHero';

export interface LtEtapa {
  id: number;
  orden: number;
  nombre: string;
  estado: string;                 // pendiente | en_curso | terminada | parada
  situacion: string;              // por_empezar | en_ritmo | lenta | cara | parada | terminada …
  veredicto: Veredicto;
  avance_pct: number;
  ejecutado: number;
  fecha_inicio_prevista?: string | null;
  fecha_fin_prevista?: string | null;
  fecha_inicio_real?: string | null;
  fecha_fin_real?: string | null;
}
export interface LtHito {
  fecha: string;
  label: string;
  tono?: 'primario' | 'bueno' | 'neutro' | 'previsto' | 'malo';
}
export interface LineaDeTiempoObraProps {
  desde: string;                  // ISO date
  hasta: string;
  etapas: LtEtapa[];
  hitos?: LtHito[];
  hoy?: string;
  etapaActivaId: number | null;
  onEtapa: (id: number) => void;   // tocar siempre abre (y lleva a) la ficha; cerrar se hace desde la ficha
  fmtMoney: (n: number) => string;
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const d = (s: string) => new Date(s + (s.length === 10 ? 'T00:00:00' : ''));

const SITUACION_CORTA: Record<string, string> = {
  por_empezar: 'por empezar', por_empezar_atrasada: 'debía empezar', en_ritmo: 'en ritmo', lenta: 'lenta', cara: 'cara', parada: 'parada', terminada: 'terminada',
};

export function LineaDeTiempoObra({ desde, hasta, etapas, hitos = [], hoy, etapaActivaId, onEtapa, fmtMoney }: LineaDeTiempoObraProps) {
  const t0 = d(desde).getTime();
  const t1 = Math.max(d(hasta).getTime(), t0 + 86400000 * 30);
  const span = t1 - t0;
  const pct = (iso: string) => Math.min(100, Math.max(0, ((d(iso).getTime() - t0) / span) * 100));
  const hoyIso = hoy ?? new Date().toISOString().slice(0, 10);

  const meses: { key: string; label: string; left: number }[] = [];
  {
    const cur = new Date(t0); cur.setDate(1);
    while (cur.getTime() <= t1) {
      const iso = cur.toISOString().slice(0, 10);
      meses.push({ key: iso, label: `${MESES[cur.getMonth()]}${cur.getMonth() === 0 || meses.length === 0 ? ` ${String(cur.getFullYear()).slice(2)}` : ''}`, left: pct(iso) });
      cur.setMonth(cur.getMonth() + 1);
    }
  }

  const clase = (e: LtEtapa) => e.estado === 'pendiente' ? 'lt-seg--pend' : e.veredicto === 'malo' ? 'lt-seg--mal' : e.veredicto === 'advertencia' ? 'lt-seg--adv' : e.estado === 'terminada' ? 'lt-seg--ok' : 'lt-seg--curso';

  return (
    <div className="lt">
      <div className="lt-macro">
        <div className="lt-hitos">
          {hitos.map((h, i) => (
            <div key={i} className={`lt-hito lt-hito--${h.tono ?? 'neutro'}`} style={{ left: `${pct(h.fecha)}%` }}>
              <span className="lt-hito-l">{h.label}</span><span className="lt-hito-d" />
            </div>
          ))}
        </div>
        <div className="lt-carril">
          {etapas.length === 0 && (
            <div className="lt-seg lt-seg--pend" style={{ left: 0, width: '100%' }}>
              <span className="lt-seg-n">Sin etapas cargadas</span>
              <span className="lt-seg-m">cargalas y la obra se lee sola</span>
            </div>
          )}
          {etapas.map((e) => {
            const ini = e.fecha_inicio_real || e.fecha_inicio_prevista;
            const fin = e.fecha_fin_real || (e.estado === 'en_curso' || e.estado === 'parada' ? (e.fecha_fin_prevista && e.fecha_fin_prevista > hoyIso ? e.fecha_fin_prevista : hoyIso) : e.fecha_fin_prevista);
            if (!ini || !fin) return null;
            const left = pct(ini); const width = Math.max(4, pct(fin) - left);
            return (
              <button
                key={e.id}
                type="button"
                className={`lt-seg ${clase(e)} ${e.id === etapaActivaId ? 'lt-seg--activa' : ''}`}
                style={{ left: `${left}%`, width: `${width}%` }}
                onClick={() => onEtapa(e.id)}
                title={`${e.orden} · ${e.nombre}`}
              >
                <span className="lt-seg-n">{e.orden} · {e.nombre}</span>
                <span className="lt-seg-m">{fmtMoney(e.ejecutado)} · {SITUACION_CORTA[e.situacion] ?? e.situacion}{e.estado === 'en_curso' ? ` ${e.avance_pct}%` : ''}</span>
              </button>
            );
          })}
        </div>
        <div className="lt-hoy" style={{ left: `${pct(hoyIso)}%` }}><span>HOY</span></div>
        <div className="lt-eje">
          {meses.map((m) => <span key={m.key} style={{ left: `${m.left}%` }}>{m.label}</span>)}
        </div>
      </div>
      {etapas.length > 0 && <p className="lt-pista">Tocá una etapa y se abre su ficha abajo: qué pasó, sus tres relojes y sus gastos.</p>}
    </div>
  );
}

export default LineaDeTiempoObra;
