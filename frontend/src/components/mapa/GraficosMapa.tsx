/**
 * GraficosMapa — los DOS gráficos del panel del mapa, elegidos por la lente.
 *
 * De dónde salen: `docs/design-sync/Mapa de calor y reclamos/galeria-graficos.html`,
 * la galería que hizo Claude Design con treinta gráficos para leer reclamos.
 * El dueño la pidió justamente porque *"siempre usamos los mismos gráficos de
 * mierda"* — así que acá no hay ni una torta ni una barra apilada de relleno.
 *
 * El `.dc` se lee como ESPECIFICACIÓN, nunca se copia el markup (regla del
 * repo): de ahí vienen la geometría (520x210 con márgenes L/R/T/B), el paso
 * "lindo" del eje, la grilla tenue y la decisión de qué gráfico contesta qué
 * pregunta. El color sale de los tokens `--pl-*`, no de los hex de la galería.
 *
 * Dos por lente, y sólo dos: el panel mide 376px y el tercero ya obliga a
 * scrollear, que es lo que el dueño no quiere (2026-09-06).
 *
 *   repiten    → Cuándo entran los reclamos   + Categorías, de mayor a menor
 *   atrasado   → Lo que más frena             + Cuánto sobrevive sin cerrarse
 *   resolvimos → Ingresados y cerrados        + Cuánto tardamos, semana a semana
 *   sinllegar  → Quién está por debajo        + Cerrados contra sin cerrar
 *
 * Sin material, el gráfico NO se dibuja: una caja que dice "no hay datos" ocupa
 * el lugar de una que sí tiene algo para decir.
 */
import { useMemo, useState, type ReactNode } from 'react';
import type { Reclamo } from '../../types';
import { isResuelto, isAbierto } from '../../lib/mapaUtils';

/* ── geometría, igual que la galería ────────────────────────────────────── */
const W = 520;
// 168 y no 210: el panel mide 398px de alto y adentro entran el KPI semantico
// y DOS graficos. Con el lienzo original de la galeria —pensado para una pagina
// de catalogo, no para una columna— el segundo grafico caia siempre abajo del
// pliegue y habia que scrollear, que es justo lo que no se quiere.
// 140: el panel mide 400px y adentro entran el KPI semantico y DOS graficos.
const H = 140;
const L = 38;
const R = 8;
const T = 14;
const B = 24;
const IW = W - L - R;
const IH = H - T - B;

const DIA_MS = 86_400_000;

const px = (i: number, n: number) => L + IW * (n < 2 ? 0.5 : i / (n - 1));
const yv = (v: number, max: number) => T + IH - (max > 0 ? (v / max) * IH : 0);
const linea = (p: [number, number][]) =>
  p.map((q, i) => `${i ? 'L' : 'M'}${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join(' ');
const nfi = (n: number) => Math.round(n).toLocaleString('es-AR');

/** Paso "lindo" ENTERO: un eje de unidades enteras nunca muestra decimales. */
function pasoLindo(max: number, n = 4): number {
  const rough = max / n;
  const pot = Math.pow(10, Math.floor(Math.log10(rough || 1)));
  const cand = [1, 2, 2.5, 5, 10].map((m) => m * pot).filter(Number.isInteger);
  return cand.find((s) => s >= rough) ?? Math.max(1, Math.ceil(rough));
}

/** Alto de fila y offset para que N filas queden CENTRADAS en el lienzo.
 *  Sin esto, dos categorias se repartian 190px y quedaban dos barras flotando
 *  con un pozo de aire en el medio (dueño, 2026-09-06: "no quedan centro los
 *  datos"). El alto de fila tiene tope: una barra de 90px no es un grafico. */
function filasCentradas(n: number, alto = IH, topeFila = 30) {
  const rh = Math.min(topeFila, alto / Math.max(1, n));
  return { rh, y0: T + (alto - rh * n) / 2 };
}

/** Grilla horizontal + rótulos del eje Y. */
function EjeY({ max, fmt }: { max: number; fmt?: (v: number) => string }) {
  const paso = pasoLindo(max);
  const f = fmt ?? nfi;
  const filas: number[] = [];
  for (let v = 0; v <= max + 1e-9; v += paso) filas.push(v);
  return (
    <>
      {filas.map((v) => {
        const y = yv(v, max);
        return (
          <g key={v}>
            <line className="gm-gl" x1={L} y1={y} x2={W - R} y2={y} />
            <text className="gm-axv" x={L - 8} y={y + 3.5} textAnchor="end">
              {f(v)}
            </text>
          </g>
        );
      })}
    </>
  );
}

const Lienzo = ({ children }: { children: ReactNode }) => (
  <svg viewBox={`0 0 ${W} ${H}`} className="gm-svg" role="img">
    {children}
  </svg>
);

/** Leyenda de dos marcas. Va debajo del dibujo, no encima: el grafico primero.
 *  Un grafico de dos series sin leyenda obliga a adivinar cual es cual. */
function Leyenda({ items }: { items: { clase: string; label: string }[] }) {
  return (
    <div className="gm-leyenda">
      {items.map((i) => (
        <span key={i.label}>
          <i className={i.clase} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

/** El marco de cada gráfico: título, la pregunta que contesta, el dibujo. */
function Grafico({
  titulo,
  pregunta,
  pie,
  leyenda,
  children,
}: {
  titulo: string;
  pregunta: string;
  pie?: string;
  leyenda?: { clase: string; label: string }[];
  children: ReactNode;
}) {
  /* TITULO Y DIBUJO A LA VISTA; la explicacion, en el tooltip.
     Los dos parrafos (la pregunta y el pie) sumaban ~55px por grafico y el
     panel pedia 769px teniendo 400: el segundo grafico caia siempre abajo del
     pliegue. La narracion no se pierde —vive en el KPI semantico de arriba,
     que es el que la tiene que dar— y el detalle queda a un hover. */
  const ayuda = pie ? `${pregunta}

${pie}` : pregunta;
  return (
    <article className="gm-card" title={ayuda}>
      <h4 className="gm-titulo">{titulo}</h4>
      <Lienzo>{children}</Lienzo>
      {leyenda && <Leyenda items={leyenda} />}
    </article>
  );
}

/* ── utilidades de datos ────────────────────────────────────────────────── */
/* EL INSTANTE SE CAPTURA UNA VEZ Y SE PASA.
   `Date.now()` dentro del render es impuro: dos renders del mismo estado
   dibujarian graficos distintos, y el linter de reglas de React lo corta. El
   raiz lo toma con `useState` y todos los graficos leen EL MISMO ahora, que
   ademas es lo correcto: las dos lecturas de un panel tienen que hablar del
   mismo momento. */
const dias = (r: Reclamo, ahora: number) => (ahora - new Date(r.created_at).getTime()) / DIA_MS;
const diasHastaCierre = (r: Reclamo) =>
  r.fecha_resolucion
    ? (new Date(r.fecha_resolucion).getTime() - new Date(r.created_at).getTime()) / DIA_MS
    : null;

const MOTIVO_LABEL: Record<string, string> = {
  materiales: 'Materiales',
  clima: 'Clima',
  tercero: 'Un tercero',
  otra_obra: 'Otra obra',
  personal: 'Personal',
  sin_acceso: 'Sin acceso',
  presupuesto: 'Presupuesto',
  otro: 'Otro',
};

const DOW = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

/* ═══ 1 · CUÁNDO ENTRAN LOS RECLAMOS (día × franja horaria) ═════════════ */
function ChCuandoEntran({ rec }: { rec: Reclamo[] }) {
  const { celdas, max } = useMemo(() => {
    const g = Array.from({ length: 7 }, () => new Array<number>(12).fill(0));
    rec.forEach((r) => {
      const d = new Date(r.created_at);
      const dow = (d.getDay() + 6) % 7; // lunes = 0
      g[dow][Math.floor(d.getHours() / 2)] += 1;
    });
    return { celdas: g, max: Math.max(1, ...g.flat()) };
  }, [rec]);

  const LB = 34;
  const cw = (W - LB - R) / 12;
  const ch = (H - T - B) / 7;

  return (
    <Grafico
      titulo="Cuándo entran los reclamos"
      pregunta="Día de la semana contra franja horaria. Sirve para dimensionar guardias y turnos de atención."
    >
      {celdas.map((fila, d) => (
        <g key={d}>
          <text className="gm-axv" x={LB - 7} y={T + d * ch + ch / 2 + 3.5} textAnchor="end">
            {DOW[d]}
          </text>
          {fila.map((v, c) => (
            <rect
              key={c}
              x={LB + c * cw}
              y={T + d * ch}
              width={cw - 1.5}
              height={ch - 1.5}
              rx={2}
              className="gm-celda"
              style={{ opacity: 0.08 + (v / max) * 0.92 }}
            />
          ))}
        </g>
      ))}
      {[0, 3, 6, 9, 11].map((c) => (
        <text key={c} className="gm-ax" x={LB + c * cw + cw / 2} y={H - B + 16} textAnchor="middle">
          {c * 2}h
        </text>
      ))}
      {/* EL PICO, ESCRITO. Un heatmap sin un solo numero obliga a comparar
          intensidades a ojo, que es justo lo que el ojo hace mal. */}
      {max > 0 && (
        <text className="gm-valor" x={W - R} y={H - B + 16} textAnchor="end">
          pico: {max} en {DOW[celdas.findIndex((f) => f.includes(max))]}
        </text>
      )}
    </Grafico>
  );
}

/* ═══ 2 · CATEGORÍAS, DE MAYOR A MENOR (barras horizontales ordenadas) ══ */
function ChCategorias({ rec }: { rec: Reclamo[] }) {
  const filas = useMemo(() => {
    const g = new Map<string, number>();
    rec.forEach((r) => {
      const n = r.categoria?.nombre ?? 'Sin categoría';
      g.set(n, (g.get(n) ?? 0) + 1);
    });
    return [...g.entries()]
      .map(([n, v]) => ({ n, v }))
      .sort((a, b) => b.v - a.v)
      .slice(0, 6);
  }, [rec]);

  if (filas.length === 0) return null;
  const max = filas[0].v;
  const { rh, y0 } = filasCentradas(filas.length);
  const LB = 168;

  return (
    <Grafico
      titulo="Categorías, de mayor a menor"
      pregunta="Se lee de un vistazo y los nombres largos entran completos. Casi siempre le gana a una torta."
    >
      {filas.map((r, i) => {
        const y = y0 + i * rh;
        const bh = Math.min(18, Math.max(8, rh - 8));
        return (
          <g key={r.n}>
            <text className="gm-axv" x={LB - 10} y={y + bh / 2 + 3.5} textAnchor="end">
              {r.n}
            </text>
            <rect x={LB} y={y} width={W - LB - 34} height={bh} rx={3} className="gm-pista" />
            <rect
              x={LB}
              y={y}
              width={((W - LB - 34) * r.v) / max}
              height={bh}
              rx={3}
              className="gm-barra"
            />
            <text className="gm-valor" x={W - 4} y={y + bh / 2 + 4} textAnchor="end">
              {r.v}
            </text>
          </g>
        );
      })}
    </Grafico>
  );
}

/* ═══ 3 · LO QUE MÁS FRENA (lollipop por motivo de pausa) ═══════════════ */
function ChLoQueFrena({ rec, ahora }: { rec: Reclamo[]; ahora: number }) {
  const filas = useMemo(() => {
    const g = new Map<string, { dias: number; n: number }>();
    rec.forEach((r) => {
      if (!r.motivo_pausa) return;
      const desde = r.pausado_desde ? new Date(r.pausado_desde).getTime() : null;
      const d = desde ? (ahora - desde) / DIA_MS : 0;
      const acc = g.get(r.motivo_pausa) ?? { dias: 0, n: 0 };
      g.set(r.motivo_pausa, { dias: acc.dias + d, n: acc.n + 1 });
    });
    return [...g.entries()]
      .map(([k, v]) => ({ k, label: MOTIVO_LABEL[k] ?? k, ...v }))
      .sort((a, b) => b.dias - a.dias)
      .slice(0, 6);
  }, [rec, ahora]);

  if (filas.length === 0) return null;
  const max = Math.max(...filas.map((f) => f.dias));
  const maxN = Math.max(...filas.map((f) => f.n));
  const { rh, y0 } = filasCentradas(filas.length);
  const LB = 116;

  return (
    <Grafico
      titulo="Lo que más frena"
      pregunta="Días acumulados de espera por motivo. El tamaño del punto es cuántos trabajos están frenados por esa causa."
      pie="Un punto chico muy a la derecha es un caso eterno; uno grande al medio, un problema sistémico."
    >
      {filas.map((f, i) => {
        const y = y0 + i * rh + rh / 2;
        const x = LB + ((W - LB - 44) * f.dias) / max;
        return (
          <g key={f.k}>
            <text className="gm-axv" x={LB - 10} y={y + 3.5} textAnchor="end">
              {f.label}
            </text>
            <line className="gm-tallo" x1={LB} y1={y} x2={x} y2={y} />
            <circle className="gm-punto" cx={x} cy={y} r={4 + (f.n / maxN) * 6} />
            <text className="gm-valor" x={W - 4} y={y + 4} textAnchor="end">
              {Math.round(f.dias)}d
            </text>
          </g>
        );
      })}
    </Grafico>
  );
}

/* ═══ 4 · CUÁNTO SOBREVIVE SIN CERRARSE (curva de supervivencia) ════════ */
function ChSupervivencia({ rec, ahora }: { rec: Reclamo[]; ahora: number }) {
  const puntos = useMemo(() => {
    const hitos = [0, 7, 15, 30, 60, 90];
    const total = rec.length;
    if (total === 0) return [];
    return hitos.map((h) => {
      // Sigue abierto a los `h` días: o nunca cerró, o cerró después de `h`.
      const vivos = rec.filter((r) => {
        const c = diasHastaCierre(r);
        if (c == null) return dias(r, ahora) >= h;
        return c > h;
      }).length;
      return { h, pct: (vivos / total) * 100 };
    });
  }, [rec, ahora]);

  if (puntos.length === 0) return null;
  const pts: [number, number][] = puntos.map((p, i) => [px(i, puntos.length), yv(p.pct, 100)]);

  return (
    <Grafico
      titulo="Cuánto sobrevive sin cerrarse"
      pregunta="Del total que entra, qué porcentaje sigue abierto a los 7, 15, 30 y 60 días."
      pie="La caída de los primeros 15 días es tu capacidad de respuesta. La cola plana son los casos que nadie va a tocar."
    >
      <EjeY max={100} fmt={(v) => `${v}%`} />
      <path className="gm-curva" d={linea(pts)} />
      {puntos.map((p, i) => (
        <g key={p.h}>
          <circle className="gm-punto" cx={pts[i][0]} cy={pts[i][1]} r={3} />
          {i > 0 && (
            <>
              <text className="gm-ax" x={pts[i][0]} y={H - B + 16} textAnchor="middle">
                {p.h}d
              </text>
              <text className="gm-valor" x={pts[i][0] + 6} y={pts[i][1] - 7}>
                {Math.round(p.pct)}%
              </text>
            </>
          )}
        </g>
      ))}
    </Grafico>
  );
}

/* ═══ 5 · INGRESADOS Y CERRADOS POR SEMANA ══════════════════════════════ */
function ChEntranSalen({ rec, ahora }: { rec: Reclamo[]; ahora: number }) {
  const { semanas, max } = useMemo(() => {
    const N = 10;
    const hoy = ahora;
    const s = Array.from({ length: N }, () => ({ ent: 0, cer: 0 }));
    rec.forEach((r) => {
      const e = Math.floor((hoy - new Date(r.created_at).getTime()) / (7 * DIA_MS));
      if (e >= 0 && e < N) s[N - 1 - e].ent += 1;
      if (r.fecha_resolucion) {
        const c = Math.floor((hoy - new Date(r.fecha_resolucion).getTime()) / (7 * DIA_MS));
        if (c >= 0 && c < N) s[N - 1 - c].cer += 1;
      }
    });
    return { semanas: s, max: Math.max(1, ...s.map((x) => Math.max(x.ent, x.cer))) };
  }, [rec, ahora]);

  const bw = IW / semanas.length;

  return (
    <Grafico
      titulo="Ingresados y cerrados por semana"
      pregunta="El punto de partida: ¿entra más de lo que sale? Las barras verdes por debajo de las grises son semanas en las que perdiste terreno."
      leyenda={[
        { clase: 'gm-sw-pista', label: 'ingresados' },
        { clase: 'gm-sw-ok', label: 'cerrados' },
      ]}
    >
      <EjeY max={max} />
      {semanas.map((s, i) => {
        const x = L + i * bw;
        return (
          <g key={i}>
            <rect
              className="gm-pista"
              x={x + 2}
              y={yv(s.ent, max)}
              width={bw - 5}
              height={T + IH - yv(s.ent, max)}
              rx={2}
            />
            <rect
              className="gm-ok"
              x={x + 2}
              y={yv(s.cer, max)}
              width={bw - 5}
              height={T + IH - yv(s.cer, max)}
              rx={2}
            />
          </g>
        );
      })}
      <text className="gm-ax" x={L} y={H - B + 16}>
        hace 10 sem
      </text>
      <text className="gm-ax" x={W - R} y={H - B + 16} textAnchor="end">
        hoy
      </text>
      {/* La ULTIMA semana rotulada: es la que se mira. */}
      <text
        className="gm-valor"
        x={L + (semanas.length - 1) * bw + bw / 2}
        y={yv(Math.max(semanas[semanas.length - 1].ent, semanas[semanas.length - 1].cer), max) - 6}
        textAnchor="middle"
      >
        {semanas[semanas.length - 1].ent} / {semanas[semanas.length - 1].cer}
      </text>
    </Grafico>
  );
}

/* ═══ 6 · CUÁNTO TARDAMOS, SEMANA A SEMANA ══════════════════════════════ */
function ChTiempoCierre({ rec, ahora }: { rec: Reclamo[]; ahora: number }) {
  const { serie, max } = useMemo(() => {
    const N = 10;
    const hoy = ahora;
    const acc = Array.from({ length: N }, () => ({ suma: 0, n: 0 }));
    rec.forEach((r) => {
      const c = diasHastaCierre(r);
      if (c == null || !r.fecha_resolucion) return;
      const w = Math.floor((hoy - new Date(r.fecha_resolucion).getTime()) / (7 * DIA_MS));
      if (w < 0 || w >= N) return;
      const s = acc[N - 1 - w];
      s.suma += c;
      s.n += 1;
    });
    const s = acc.map((x) => (x.n ? x.suma / x.n : 0));
    return { serie: s, max: Math.max(1, ...s) };
  }, [rec, ahora]);

  if (serie.every((v) => v === 0)) return null;
  const pts: [number, number][] = serie.map((v, i) => [px(i, serie.length), yv(v, max)]);

  return (
    <Grafico
      titulo="Cuánto tardamos, semana a semana"
      pregunta="El promedio de días hasta el cierre, semana por semana. El ruido semanal no es una tendencia."
    >
      <EjeY max={max} fmt={(v) => `${Math.round(v)}d`} />
      <path className="gm-curva" d={linea(pts)} />
      {pts.map((p, i) => (
        <circle key={i} className="gm-punto" cx={p[0]} cy={p[1]} r={2.5} />
      ))}
      {/* El ultimo valor, escrito: sin el, la curva dice la forma pero no el
          numero, y el numero es la mitad de la respuesta. */}
      <text
        className="gm-valor"
        x={pts[pts.length - 1][0]}
        y={pts[pts.length - 1][1] - 8}
        textAnchor="end"
      >
        {Math.round(serie[serie.length - 1])}d
      </text>
    </Grafico>
  );
}

/* ═══ 7 · QUIÉN CIERRA MÁS Y QUIÉN MENOS (barras con su %) ═════════════ */
function ChDesvio({ rec }: { rec: Reclamo[] }) {
  const filas = useMemo(() => {
    const g = new Map<string, { tot: number; ok: number }>();
    rec.forEach((r) => {
      const n = r.barrio?.nombre ?? r.zona?.nombre;
      if (!n) return;
      const a = g.get(n) ?? { tot: 0, ok: 0 };
      a.tot += 1;
      if (isResuelto(r.estado)) a.ok += 1;
      g.set(n, a);
    });
    return [...g.entries()]
      .filter(([, v]) => v.tot >= 3)
      .map(([n, v]) => ({ n, pct: (v.ok / v.tot) * 100, tot: v.tot }))
      .sort((a, b) => a.pct - b.pct)
      .slice(0, 6);
  }, [rec]);

  if (filas.length === 0) return null;
  const prom = filas.reduce((s, f) => s + f.pct, 0) / filas.length;
  const { rh, y0 } = filasCentradas(filas.length);
  /* Columna FIJA para los nombres. La version anterior anclaba el rotulo al
     extremo de su propia barra, asi que en cuanto una barra crecia el nombre se
     iba fuera del viewBox y se veian pedazos de palabra cortados por la
     izquierda (dueño, 2026-09-06). Un rotulo nunca se posiciona relativo al
     dato que rotula. */
  const LB = 150;
  const largo = W - LB - 40;

  return (
    <Grafico
      titulo="Quién cierra menos"
      pregunta="El porcentaje cerrado de cada barrio, de peor a mejor. La línea es el promedio de los que se ven."
      pie="Los de arriba de la lista son a los que no estamos llegando."
    >
      {filas.map((f, i) => {
        const y = y0 + i * rh;
        const bh = Math.min(16, Math.max(8, rh - 8));
        return (
          <g key={f.n}>
            <text className="gm-axv" x={LB - 10} y={y + bh / 2 + 3.5} textAnchor="end">
              {f.n.length > 20 ? `${f.n.slice(0, 19)}…` : f.n}
            </text>
            <rect x={LB} y={y} width={largo} height={bh} rx={3} className="gm-pista" />
            <rect
              x={LB}
              y={y}
              width={(largo * f.pct) / 100}
              height={bh}
              rx={3}
              className={f.pct < prom ? 'gm-mal' : 'gm-ok'}
            />
            <text className="gm-valor" x={W - 4} y={y + bh / 2 + 4} textAnchor="end">
              {Math.round(f.pct)}%
            </text>
          </g>
        );
      })}
      {/* El promedio, como referencia vertical. Sin el, un 65% no se sabe si
          es bueno o malo en ESTE municipio. */}
      <line
        className="gm-gl"
        x1={LB + (largo * prom) / 100}
        y1={T}
        x2={LB + (largo * prom) / 100}
        y2={T + IH}
      />
      <text className="gm-ax" x={LB + (largo * prom) / 100} y={H - B + 16} textAnchor="middle">
        prom. {Math.round(prom)}%
      </text>
    </Grafico>
  );
}

/* ═══ 8 · CERRADOS CONTRA SIN CERRAR (dumbbell por barrio) ══════════════ */
function ChBrecha({ rec }: { rec: Reclamo[] }) {
  const filas = useMemo(() => {
    const g = new Map<string, { ok: number; ab: number }>();
    rec.forEach((r) => {
      const n = r.barrio?.nombre ?? r.zona?.nombre;
      if (!n) return;
      const a = g.get(n) ?? { ok: 0, ab: 0 };
      if (isResuelto(r.estado)) a.ok += 1;
      else if (isAbierto(r.estado)) a.ab += 1;
      g.set(n, a);
    });
    return [...g.entries()]
      .map(([n, v]) => ({ n, ...v }))
      .filter((f) => f.ok + f.ab >= 3)
      .sort((a, b) => b.ab - a.ab)
      .slice(0, 6);
  }, [rec]);

  if (filas.length === 0) return null;
  const max = Math.max(...filas.map((f) => Math.max(f.ok, f.ab)), 1);
  const { rh, y0 } = filasCentradas(filas.length);
  const LB = 128;
  const esc = (v: number) => LB + ((W - LB - 24) * v) / max;

  return (
    <Grafico
      titulo="Cerrados contra sin cerrar"
      pregunta="Dos puntos por barrio unidos por una línea. El largo de la línea es la brecha."
      pie="Donde el punto ámbar está a la derecha del verde, estamos perdiendo."
      leyenda={[
        { clase: 'gm-sw-ok', label: 'cerrados' },
        { clase: 'gm-sw-mal', label: 'sin cerrar' },
      ]}
    >
      {filas.map((f, i) => {
        const y = y0 + i * rh + rh / 2;
        return (
          <g key={f.n}>
            <text className="gm-axv" x={LB - 10} y={y + 3.5} textAnchor="end">
              {f.n}
            </text>
            <line className="gm-tallo" x1={esc(Math.min(f.ok, f.ab))} y1={y} x2={esc(Math.max(f.ok, f.ab))} y2={y} />
            <circle className="gm-punto-ok" cx={esc(f.ok)} cy={y} r={4.5} />
            <circle className="gm-punto-mal" cx={esc(f.ab)} cy={y} r={4.5} />
          </g>
        );
      })}
    </Grafico>
  );
}

/* ═══ el reparto por lente ══════════════════════════════════════════════ */
interface Props {
  /** 'repiten' | 'atrasado' | 'resolvimos' | 'sinllegar'. */
  pregunta: string;
  /** El recorte actual del mapa, ya filtrado. */
  reclamos: Reclamo[];
}

/**
 * SIEMPRE DOS. Esto es lo que arregla el bug que el dueño encontro mirando las
 * cuatro opciones (2026-09-06): *"primera sin KPI narrativo, segunda mapa sin
 * panel, tercera bien, cuarta un grafico solo"*.
 *
 * La causa era que cada grafico devolvia `null` cuando no encontraba material
 * —motivos de pausa sin cargar, nada cerrado en el periodo, un solo barrio con
 * volumen— y el panel quedaba con uno, o con ninguno. Que el panel cambie de
 * forma segun los datos hace que la pantalla parezca rota justo cuando el
 * municipio tiene poca carga, que es exactamente cuando hay que convencerlo.
 *
 * Ahora cada grafico declara si TIENE MATERIAL, se eligen los dos primeros de
 * la lista de su lente, y si la lente no llega a dos se completa con los
 * universales: "Categorias" y "Cuando entran" viven de `created_at` y
 * `categoria`, que todo reclamo tiene siempre.
 */
type Def = {
  id: string;
  hay: (rec: Reclamo[], ahora: number) => boolean;
  nodo: (rec: Reclamo[], ahora: number) => ReactNode;
};

const hayCierres = (rec: Reclamo[]) => rec.some((r) => r.fecha_resolucion);
const barriosConVolumen = (rec: Reclamo[]) => {
  const g = new Map<string, number>();
  rec.forEach((r) => {
    const n = r.barrio?.nombre ?? r.zona?.nombre;
    if (n) g.set(n, (g.get(n) ?? 0) + 1);
  });
  return [...g.values()].filter((v) => v >= 3).length;
};

const D: Record<string, Def> = {
  cuando: {
    id: 'cuando',
    hay: (rec) => rec.length > 0,
    nodo: (rec) => <ChCuandoEntran key="cuando" rec={rec} />,
  },
  categorias: {
    id: 'categorias',
    hay: (rec) => rec.length > 0,
    nodo: (rec) => <ChCategorias key="categorias" rec={rec} />,
  },
  frena: {
    id: 'frena',
    hay: (rec) => rec.some((r) => r.motivo_pausa),
    nodo: (rec, a) => <ChLoQueFrena key="frena" rec={rec} ahora={a} />,
  },
  supervivencia: {
    id: 'supervivencia',
    hay: (rec) => rec.length >= 4,
    nodo: (rec, a) => <ChSupervivencia key="supervivencia" rec={rec} ahora={a} />,
  },
  flujo: {
    id: 'flujo',
    hay: (rec) => hayCierres(rec),
    nodo: (rec, a) => <ChEntranSalen key="flujo" rec={rec} ahora={a} />,
  },
  cierre: {
    id: 'cierre',
    hay: (rec) => hayCierres(rec),
    nodo: (rec, a) => <ChTiempoCierre key="cierre" rec={rec} ahora={a} />,
  },
  desvio: {
    id: 'desvio',
    hay: (rec) => barriosConVolumen(rec) >= 1,
    nodo: (rec) => <ChDesvio key="desvio" rec={rec} />,
  },
  brecha: {
    id: 'brecha',
    hay: (rec) => barriosConVolumen(rec) >= 1,
    nodo: (rec) => <ChBrecha key="brecha" rec={rec} />,
  },
};

/** Preferidos por lente, y despues los universales como red. */
const POR_LENTE: Record<string, string[]> = {
  repiten: ['cuando', 'categorias', 'brecha', 'supervivencia'],
  atrasado: ['frena', 'supervivencia', 'categorias', 'cuando'],
  resolvimos: ['flujo', 'cierre', 'supervivencia', 'categorias'],
  sinllegar: ['desvio', 'brecha', 'categorias', 'cuando'],
};

export default function GraficosMapa({ pregunta, reclamos }: Props) {
  const [ahora] = useState(() => Date.now());

  const elegidos = useMemo(() => {
    const orden = POR_LENTE[pregunta] ?? POR_LENTE.repiten;
    const red = ['categorias', 'cuando', 'supervivencia', 'brecha'];
    // TRES por enfoque, no dos. Cada lente ya declara cuatro candidatos en
    // orden de relevancia: cortar en dos dejaba el tercero --- que suele ser el
    // que explica el porqué --- sin dibujar, y el panel a media asta (dueño,
    // 2026-09-06: "y 3 gráficos por enfoque").
    const salida: string[] = [];
    for (const id of [...orden, ...red]) {
      if (salida.length === 3) break;
      if (salida.includes(id)) continue;
      if (D[id]?.hay(reclamos, ahora)) salida.push(id);
    }
    return salida;
  }, [pregunta, reclamos, ahora]);

  if (reclamos.length === 0) return null;

  return <>{elegidos.map((id) => D[id].nodo(reclamos, ahora))}</>;
}
