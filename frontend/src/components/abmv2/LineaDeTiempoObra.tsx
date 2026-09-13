/**
 * LineaDeTiempoObra — pieza del kit v3 para el detalle de una obra.
 *
 * Dos niveles, nada más (dueño, 2026-09-13):
 *   1. La obra ENTERA, siempre entra en la pantalla: meses de izquierda a derecha,
 *      hitos arriba, las etapas nombradas como segmentos sobre los meses, el cursor de hoy.
 *   2. Se toca una etapa y se EXPLOTA abajo: plazo previsto contra real, cada gasto como
 *      una barrita el día que se pagó (alto = monto), los programados en punteado.
 *      Un botón vuelve a la macro. Tres niveles sólo si los datos vienen segmentados.
 *
 * Tonta: el padre le pasa los datos ya resueltos; no llama a la API ni conoce rutas.
 * Colores por token del tema; los veredictos por clase.
 */
import { ChevronLeft } from 'lucide-react';

export interface LtEtapa {
  id: number;
  orden: number;
  nombre: string;
  estado: string;                 // pendiente | en_curso | terminada | parada
  avance_pct: number;
  ejecutado: number;
  monto_previsto?: number | null;
  fecha_inicio_prevista?: string | null;
  fecha_fin_prevista?: string | null;
  fecha_inicio_real?: string | null;
  fecha_fin_real?: string | null;
}
export interface LtGasto {
  id: number;
  fecha: string;
  monto: number;
  etiqueta: string;               // "Hidronorte · Deporte"
  rubro: string;                  // contratista | materiales | mano_de_obra | otros
  programado: boolean;
  etapa_id?: number | null;
  sin_etapa?: boolean;
}
export interface LtHito {
  fecha: string;
  label: string;
  tono?: 'primario' | 'bueno' | 'neutro' | 'previsto';
}
export interface LineaDeTiempoObraProps {
  desde: string;                  // ISO date
  hasta: string;
  etapas: LtEtapa[];
  gastos: LtGasto[];
  hitos?: LtHito[];
  hoy?: string;
  etapaActivaId: number | null;
  onEtapa: (id: number | null) => void;
  fmtMoney: (n: number) => string;
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const d = (s: string) => new Date(s + (s.length === 10 ? 'T00:00:00' : ''));
const TONO_RUBRO: Record<string, string> = {
  contratista: 'var(--pl-purple, #a855f7)',
  materiales: 'var(--pl-blue, #3b82f6)',
  mano_de_obra: 'var(--pl-green)',
  otros: 'var(--pl-amber-strong)',
};

export function LineaDeTiempoObra({
  desde, hasta, etapas, gastos, hitos = [], hoy, etapaActivaId, onEtapa, fmtMoney,
}: LineaDeTiempoObraProps) {
  const t0 = d(desde).getTime();
  const t1 = Math.max(d(hasta).getTime(), t0 + 86400000 * 30);
  const span = t1 - t0;
  const pct = (iso: string) => Math.min(100, Math.max(0, ((d(iso).getTime() - t0) / span) * 100));
  const hoyIso = hoy ?? new Date().toISOString().slice(0, 10);

  // Los meses que cubre la línea, para el eje.
  const meses: { key: string; label: string; left: number }[] = [];
  {
    const cur = new Date(t0); cur.setDate(1);
    while (cur.getTime() <= t1) {
      const iso = cur.toISOString().slice(0, 10);
      meses.push({ key: iso, label: `${MESES[cur.getMonth()]}${cur.getMonth() === 0 || meses.length === 0 ? ` ${String(cur.getFullYear()).slice(2)}` : ''}`, left: pct(iso) });
      cur.setMonth(cur.getMonth() + 1);
    }
  }

  const activa = etapas.find((e) => e.id === etapaActivaId) ?? null;
  const maxMonto = Math.max(1, ...gastos.map((g) => g.monto));

  // Explosión: el tramo de la etapa activa, con sus gastos.
  const tramo = activa ? {
    ini: activa.fecha_inicio_real || activa.fecha_inicio_prevista || desde,
    fin: activa.fecha_fin_real || activa.fecha_fin_prevista || hasta,
  } : null;
  const gastosTramo = activa ? gastos.filter((g) => g.etapa_id === activa.id || (g.sin_etapa && tramo && g.fecha >= tramo.ini && g.fecha <= tramo.fin)) : [];
  const tt0 = tramo ? d(tramo.ini).getTime() : 0;
  const tt1 = tramo ? Math.max(d(tramo.fin).getTime(), tt0 + 86400000 * 14) : 1;
  const pctTramo = (iso: string) => Math.min(100, Math.max(0, ((d(iso).getTime() - tt0) / (tt1 - tt0)) * 100));
  const maxTramo = Math.max(1, ...gastosTramo.map((g) => g.monto));

  const claseEstado = (e: LtEtapa) => e.estado === 'terminada' ? 'lt-seg--ok' : e.estado === 'en_curso' ? 'lt-seg--curso' : e.estado === 'parada' ? 'lt-seg--mal' : 'lt-seg--pend';

  return (
    <div className="lt">
      {/* Nivel 1: la obra entera */}
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
              <span className="lt-seg-m">la película de la plata, nada más</span>
            </div>
          )}
          {etapas.map((e) => {
            const ini = e.fecha_inicio_real || e.fecha_inicio_prevista;
            const fin = e.fecha_fin_real || e.fecha_fin_prevista;
            if (!ini || !fin) return null;
            const left = pct(ini); const width = Math.max(4, pct(fin) - left);
            return (
              <button
                key={e.id}
                type="button"
                className={`lt-seg ${claseEstado(e)} ${e.id === etapaActivaId ? 'lt-seg--activa' : ''}`}
                style={{ left: `${left}%`, width: `${width}%` }}
                onClick={() => onEtapa(e.id === etapaActivaId ? null : e.id)}
                title={`${e.orden} · ${e.nombre}`}
              >
                <span className="lt-seg-n">{e.orden} · {e.nombre}</span>
                <span className="lt-seg-m">{fmtMoney(e.ejecutado)} · {e.estado === 'terminada' ? 'terminada' : e.estado === 'en_curso' ? `en curso · ${e.avance_pct}%` : e.estado === 'parada' ? 'parada' : 'por empezar'}</span>
              </button>
            );
          })}
        </div>
        <div className="lt-hoy" style={{ left: `${pct(hoyIso)}%` }}><span>HOY</span></div>
        <div className="lt-eje">
          {meses.map((m) => <span key={m.key} style={{ left: `${m.left}%` }}>{m.label}</span>)}
        </div>
      </div>

      {/* Nivel 2: la etapa explotada */}
      {activa && tramo && (
        <div className="lt-zoom">
          <div className="lt-zoom-cab">
            <div>
              <strong>Etapa {activa.orden} · {activa.nombre}</strong>
              <span className="lt-zoom-sub"> · {tramo.ini} a {tramo.fin}</span>
            </div>
            <button type="button" className="av2-btn-secundario" onClick={() => onEtapa(null)}>
              <ChevronLeft size={14} strokeWidth={2.2} /> Volver a toda la obra
            </button>
          </div>
          <div className="lt-zoom-plazo">
            <span className="lt-zoom-lab">Plazo</span>
            {activa.fecha_inicio_prevista && activa.fecha_fin_prevista && (
              <div className="lt-zoom-prev" style={{ left: `${pctTramo(activa.fecha_inicio_prevista)}%`, width: `${Math.max(2, pctTramo(activa.fecha_fin_prevista) - pctTramo(activa.fecha_inicio_prevista))}%` }} title="previsto" />
            )}
            <div className="lt-zoom-real" style={{ left: `${pctTramo(tramo.ini)}%`, width: `${Math.max(2, pctTramo(tramo.fin) - pctTramo(tramo.ini))}%` }} />
          </div>
          <div className="lt-zoom-plata">
            <span className="lt-zoom-lab">Plata</span>
            {gastosTramo.map((g) => (
              <div
                key={g.id}
                className={`lt-tick ${g.programado ? 'lt-tick--prog' : ''} ${g.sin_etapa ? 'lt-tick--sin' : ''}`}
                style={{ left: `${pctTramo(g.fecha)}%`, height: `${20 + (g.monto / maxTramo) * 60}%`, background: g.sin_etapa ? 'var(--pl-amber-strong)' : TONO_RUBRO[g.rubro] ?? TONO_RUBRO.otros }}
                title={`${g.fecha} · ${g.etiqueta} · ${fmtMoney(g.monto)}${g.programado ? ' · programado' : ''}${g.sin_etapa ? ' · sin etapa, propuesto' : ''}`}
              />
            ))}
            {gastosTramo.length === 0 && <span className="lt-zoom-vacio">Sin gastos en este tramo.</span>}
            {hoyIso >= tramo.ini && hoyIso <= tramo.fin && <div className="lt-hoy lt-hoy--zoom" style={{ left: `${pctTramo(hoyIso)}%` }}><span>HOY</span></div>}
          </div>
          <div className="lt-leyenda">
            <span><i style={{ background: TONO_RUBRO.contratista }} />contratista</span>
            <span><i style={{ background: TONO_RUBRO.materiales }} />materiales</span>
            <span><i style={{ background: TONO_RUBRO.mano_de_obra }} />mano de obra</span>
            <span><i style={{ background: 'var(--pl-amber-strong)' }} />sin etapa, propuesto</span>
            <span><i className="lt-leyenda-prog" />programado</span>
          </div>
        </div>
      )}
      {!activa && etapas.length > 0 && (
        <p className="lt-pista">Tocá una etapa para explotarla: plazo previsto contra real y cada gasto el día que se pagó.</p>
      )}
      {/* Sin etapas: la película de la plata, un tick por gasto sobre toda la obra */}
      {etapas.length === 0 && gastos.length > 0 && (
        <div className="lt-zoom">
          <div className="lt-zoom-plata">
            <span className="lt-zoom-lab">Plata</span>
            {gastos.map((g) => (
              <div key={g.id} className={`lt-tick ${g.programado ? 'lt-tick--prog' : ''}`}
                style={{ left: `${pct(g.fecha)}%`, height: `${20 + (g.monto / maxMonto) * 60}%`, background: TONO_RUBRO[g.rubro] ?? TONO_RUBRO.otros }}
                title={`${g.fecha} · ${g.etiqueta} · ${fmtMoney(g.monto)}${g.programado ? ' · programado' : ''}`} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default LineaDeTiempoObra;
