/**
 * TresRelojes — pieza del kit v3. La ley del control de obra en un solo vistazo:
 * TIEMPO consumido, HECHO (avance físico) y PLATA pagada, cada uno como porcentaje
 * de su vara. Cuando los tres caminan juntos la obra está sana; el que se adelanta
 * es el problema. Sobre las barras de tiempo y plata se marca dónde está lo hecho,
 * para que la comparación se vea sin leer números.
 *
 * Sirve para la obra entera (`tamano="grande"`, con la lectura en prosa) y para cada
 * etapa (`tamano="mini"`, tres barras en una fila). Tonta: recibe los números resueltos.
 */
import type { RelojDato } from '../../lib/obras-tipos';

export interface TresRelojesProps {
  tiempo: RelojDato;
  hecho: RelojDato;
  plata: RelojDato;
  lectura?: string | null;
  tamano?: 'grande' | 'mini';
}

const FILAS: Array<{ key: 'tiempo' | 'hecho' | 'plata'; label: string }> = [
  { key: 'tiempo', label: 'Tiempo' },
  { key: 'hecho', label: 'Hecho' },
  { key: 'plata', label: 'Plata' },
];

function Barra({ r, referencia, mini }: { r: RelojDato; referencia: number | null; mini: boolean }) {
  const pct = r.pct;
  const lleno = pct == null ? 0 : Math.min(100, Math.max(0, pct));
  const pasado = pct != null && pct > 100;
  return (
    <div className={`tr-barra ${pct == null ? 'tr-barra--vacia' : ''}`} title={pct == null ? 'sin dato' : `${pct}%`}>
      <i className={`tr-fill tr-fill--${r.veredicto ?? 'bueno'} ${pasado ? 'tr-fill--pasado' : ''}`} style={{ width: `${lleno}%` }} />
      {referencia != null && !mini && <i className="tr-ref" style={{ left: `${Math.min(100, referencia)}%` }} title={`lo hecho: ${referencia}%`} />}
      {pasado && <i className="tr-tope" />}
    </div>
  );
}

export function TresRelojes({ tiempo, hecho, plata, lectura, tamano = 'grande' }: TresRelojesProps) {
  const datos = { tiempo, hecho, plata };
  const mini = tamano === 'mini';
  const ref = hecho.pct;
  return (
    <div className={`tr tr--${tamano}`}>
      {FILAS.map(({ key, label }) => {
        const r = datos[key];
        return (
          <div key={key} className={`tr-fila tr-fila--${r.veredicto ?? 'bueno'}`}>
            <span className="tr-lab">{label}</span>
            <Barra r={r} referencia={key === 'hecho' ? null : ref} mini={mini} />
            <span className="tr-val">{r.pct == null ? '—' : `${r.pct}%`}</span>
            {!mini && <span className="tr-sub">{r.valor}{r.sub ? ` · ${r.sub}` : ''}</span>}
          </div>
        );
      })}
      {!mini && lectura && <p className="tr-lectura">{lectura}</p>}
    </div>
  );
}

export default TresRelojes;
