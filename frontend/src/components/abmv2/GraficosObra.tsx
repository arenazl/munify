/**
 * GraficosObra — tres gráficos de la galería, portados como piezas del kit v3.
 *
 * Fuente de la gramática: docs/design-sync/Mapa de calor y reclamos/galeria-graficos.html
 * (tarjeta con título + "lectura" en prosa + leyenda + tip; SVG con grilla fina).
 * Dueño (2026-09-13): "esos gráficos así no van más; usá la librería de la galería".
 *
 *  - <ApiladaPorEtapa>   qué fue cada peso, etapa por etapa (chEtapas)
 *  - <DumbbellPrevistoReal>  previsto contra real, por etapa (chDumbbell)
 *  - <AreaAcumulado>     cómo se fue gastando, contra la curva prevista (chTendencia)
 *
 * Tontos: reciben números ya resueltos. Colores por token del tema; nada de hex.
 */

export interface EtapaGrafico {
  id: number;
  orden: number;
  nombre: string;
  contratista: number;
  materiales: number;
  mano_de_obra: number;
  otros: number;
  ejecutado: number;
  previsto?: number | null;
  activa?: boolean;
}

const C = {
  contratista: 'var(--pl-purple, #a855f7)',
  materiales: 'var(--pl-blue, #3b82f6)',
  mano_de_obra: 'var(--pl-green)',
  otros: 'var(--pl-amber-strong)',
  previsto: 'var(--pl-text-muted)',
  real: 'var(--pl-green)',
  malo: 'var(--pl-red)',
  bueno: 'var(--pl-green-700, var(--pl-green))',
  hoy: 'var(--pl-amber-strong)',
};

const W = 400;

function Card({ titulo, lectura, children, leyenda, tip }: {
  titulo: string; lectura: React.ReactNode; children: React.ReactNode;
  leyenda?: Array<[string, string]>; tip?: React.ReactNode;
}) {
  return (
    <article className="gr-card">
      <h3>{titulo}</h3>
      <p className="gr-q">{lectura}</p>
      {children}
      {leyenda && <div className="gr-key">{leyenda.map(([c, t]) => <b key={t}><i style={{ background: c }} />{t}</b>)}</div>}
      {tip && <p className="gr-tip">{tip}</p>}
    </article>
  );
}

const mm = (n: number) => `${(n / 1_000_000).toFixed(1).replace('.', ',')}`;

/** Qué fue cada peso, etapa por etapa: barra apilada horizontal por rubro. */
export function ApiladaPorEtapa({ etapas, fmtMoney }: { etapas: EtapaGrafico[]; fmtMoney: (n: number) => string }) {
  const LB = 126, rh = 34, T = 8;
  const H = T + etapas.length * rh + 22;
  const max = Math.max(1, ...etapas.map((e) => Math.max(e.ejecutado, e.previsto ?? 0))) * 1.06;
  const sw = (v: number) => ((W - LB - 44) * v) / max;
  const activa = etapas.find((e) => e.activa);
  return (
    <Card
      titulo="Qué fue cada peso, etapa por etapa"
      lectura={<>La plata de cada etapa partida en <b>contratista, materiales y mano de obra</b>. Separa el problema del contrato del problema de la cuadrilla.</>}
      leyenda={[[C.contratista, 'Contratista'], [C.materiales, 'Materiales'], [C.mano_de_obra, 'Mano de obra'], [C.otros, 'Otros']]}
      tip={activa ? <>En la etapa {activa.orden}: contratista <b>{fmtMoney(activa.contratista)}</b>, materiales <b>{fmtMoney(activa.materiales)}</b>, mano de obra <b>{fmtMoney(activa.mano_de_obra)}</b>.</> : undefined}
    >
      <svg viewBox={`0 0 ${W} ${H}`}>
        {etapas.map((e, i) => {
          const y = T + i * rh;
          let x = LB;
          const partes: Array<[number, string]> = [[e.contratista, C.contratista], [e.materiales, C.materiales], [e.mano_de_obra, C.mano_de_obra], [e.otros, C.otros]];
          return (
            <g key={e.id} opacity={activa && !e.activa ? 0.55 : 1}>
              {e.activa && <rect x={0} y={y - 5} width={W} height={rh - 8} rx={6} fill="color-mix(in srgb, var(--pl-green) 12%, transparent)" />}
              <text className="gr-axv" x={LB - 10} y={y + 12} textAnchor="end">{e.orden} · {e.nombre.length > 16 ? e.nombre.slice(0, 15) + '…' : e.nombre}</text>
              {e.previsto ? <rect x={LB} y={y} width={Math.max(0, sw(e.previsto))} height={16} rx={3} fill="none" stroke={C.previsto} strokeDasharray="3 2" /> : null}
              {partes.map(([v, c], k) => { const w = Math.max(0, sw(v)); const r = <rect key={k} x={x} y={y} width={w} height={16} rx={k === 0 || k === 3 ? 3 : 0} fill={c} />; x += w; return r; })}
              <text className="gr-val" x={W - 4} y={y + 12} textAnchor="end">{mm(e.ejecutado)}</text>
            </g>
          );
        })}
        <text className="gr-ax" x={LB} y={H - 4}>millones de pesos · punteado = previsto</text>
      </svg>
    </Card>
  );
}

/** Previsto contra real por etapa: dos puntos unidos por una línea; el largo es el desvío. */
export function DumbbellPrevistoReal({ etapas }: { etapas: EtapaGrafico[] }) {
  const LB = 118, RB = 34, rh = 34, T = 10;
  const H = T + etapas.length * rh + 26;
  const max = Math.max(1, ...etapas.map((e) => Math.max(e.ejecutado, e.previsto ?? 0))) * 1.08;
  const sx = (v: number) => LB + ((W - LB - RB) * v) / max;
  const paso = max / 4;
  return (
    <Card
      titulo="Previsto contra real, por etapa"
      lectura={<>Dos puntos por etapa unidos por una línea. <b>El largo de la línea es el desvío</b>: si lo gastado queda a la derecha de lo previsto, la etapa se pasó.</>}
      leyenda={[[C.previsto, 'Previsto'], [C.real, 'Gastado'], [C.malo, 'Se pasó']]}
    >
      <svg viewBox={`0 0 ${W} ${H}`}>
        {[0, 1, 2, 3, 4].map((k) => (
          <g key={k}>
            <line className="gr-gl" x1={sx(k * paso)} y1={T} x2={sx(k * paso)} y2={T + etapas.length * rh} />
            <text className="gr-ax" x={sx(k * paso)} y={H - 6} textAnchor="middle">{mm(k * paso)}{k === 4 ? ' M' : ''}</text>
          </g>
        ))}
        {etapas.map((e, i) => {
          const y = T + i * rh + rh / 2 - 2;
          const prev = e.previsto ?? 0;
          const seP = prev > 0 && e.ejecutado > prev;
          return (
            <g key={e.id} opacity={e.activa === false ? 0.6 : 1}>
              <text className="gr-axv" x={LB - 9} y={y + 3.5} textAnchor="end">{e.orden} · {e.nombre.length > 14 ? e.nombre.slice(0, 13) + '…' : e.nombre}</text>
              {prev > 0 && <line x1={sx(Math.min(prev, e.ejecutado))} y1={y} x2={sx(Math.max(prev, e.ejecutado))} y2={y} stroke="var(--pl-border-strong)" strokeWidth={2.5} />}
              {prev > 0 ? <circle cx={sx(prev)} cy={y} r={4.5} fill={C.previsto} /> : <circle cx={sx(0)} cy={y} r={4.5} fill="none" stroke={C.previsto} strokeDasharray="2 2" />}
              <circle cx={sx(e.ejecutado)} cy={y} r={4.5} fill={seP ? C.malo : C.real} />
            </g>
          );
        })}
      </svg>
    </Card>
  );
}

/** Cómo se fue gastando: área del acumulado contra la curva prevista (lineal entre inicio y fin). */
export function AreaAcumulado({ meses, presupuesto, fmtMoney }: {
  meses: Array<{ mes: string; acumulado: number; programado: boolean }>;
  presupuesto?: number | null;
  fmtMoney: (n: number) => string;
}) {
  const L = 44, R = 8, T = 12, B = 26, H = 168;
  const n = Math.max(1, meses.length - 1);
  const tope = Math.max(1, presupuesto ?? 0, ...meses.map((m) => m.acumulado)) * 1.05;
  const x = (i: number) => L + ((W - L - R) * i) / n;
  const y = (v: number) => T + (H - T - B) * (1 - v / tope);
  const reales = meses.filter((m) => !m.programado);
  const path = (ms: typeof meses, offset = 0) => ms.map((m, i) => `${i === 0 ? 'M' : 'L'}${x(i + offset).toFixed(1)} ${y(m.acumulado).toFixed(1)}`).join(' ');
  const ultimo = reales[reales.length - 1];
  const gid = 'gr-area-obra';
  return (
    <Card
      titulo="Cómo se fue gastando"
      lectura={<>El acumulado de la obra mes a mes{presupuesto ? <> contra la <b>curva prevista</b>. Cuando la línea sólida va por debajo de la punteada, se gasta más lento de lo planeado.</> : <>. Sin presupuesto cargado no hay curva prevista contra la que compararlo.</>}</>}
      leyenda={[[C.real, 'Gastado, acumulado'], ...(presupuesto ? [[C.previsto, 'Curva prevista'] as [string, string]] : []), [C.hoy, 'Hoy']]}
      tip={ultimo ? <>Al último mes cerrado: <b>{fmtMoney(ultimo.acumulado)}</b>{presupuesto ? <>, el {Math.round((ultimo.acumulado / presupuesto) * 100)}% del presupuesto</> : null}.</> : undefined}
    >
      <svg viewBox={`0 0 ${W} ${H}`}>
        <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--pl-green)" stopOpacity=".35" /><stop offset="1" stopColor="var(--pl-green)" stopOpacity="0" /></linearGradient></defs>
        {[0, 0.5, 1].map((k) => (
          <g key={k}>
            <line className="gr-gl" x1={L} y1={y(tope * k)} x2={W - R} y2={y(tope * k)} />
            <text className="gr-axv" x={L - 6} y={y(tope * k) + 4} textAnchor="end">{mm(tope * k)}</text>
          </g>
        ))}
        {meses.map((m, i) => (i % Math.max(1, Math.ceil(meses.length / 6)) === 0 || i === meses.length - 1) && (
          <text key={m.mes} className="gr-ax" x={x(i)} y={H - 8} textAnchor="middle">{m.mes.slice(5)}/{m.mes.slice(2, 4)}</text>
        ))}
        {presupuesto ? <path d={`M${x(0)} ${y(0)} L${x(n)} ${y(presupuesto)}`} fill="none" stroke={C.previsto} strokeWidth={1.5} strokeDasharray="4 3" /> : null}
        {reales.length > 0 && (
          <>
            <path d={`${path(reales)} L${x(reales.length - 1)} ${y(0)} L${x(0)} ${y(0)} Z`} fill={`url(#${gid})`} />
            <path d={path(reales)} fill="none" stroke={C.real} strokeWidth={2.5} />
          </>
        )}
        {meses.length > reales.length && reales.length > 0 && (
          <path d={path(meses.slice(reales.length - 1), reales.length - 1)} fill="none" stroke={C.real} strokeWidth={2} strokeDasharray="3 3" opacity={0.6} />
        )}
        {ultimo && (
          <>
            <line x1={x(reales.length - 1)} y1={T} x2={x(reales.length - 1)} y2={y(0)} stroke={C.hoy} strokeWidth={1.5} />
            <circle cx={x(reales.length - 1)} cy={y(ultimo.acumulado)} r={4} fill={C.real} />
          </>
        )}
      </svg>
    </Card>
  );
}
