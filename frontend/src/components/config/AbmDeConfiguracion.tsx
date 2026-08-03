/**
 * AbmDeConfiguracion — renderiza un ABM del canvas con las piezas del kit v2.
 *
 * Toma un `AbmSpec` (los datos que el diseño declaró para esa entidad:
 * eyebrow, veredicto, KPIs, pista, filtros, columnas, filas y la regla) y lo
 * pinta con `SemanticAbmPage`. UNA implementación para las 17 entidades.
 *
 * NO hay HTML del prototipo acá adentro: el `.dc` se usa como especificación,
 * no como markup. El veredicto viene del canvas como texto con `<strong>`, y
 * en vez de inyectarlo se PARSEA a los segmentos del hero (`seg()`), que es la
 * pieza que ya sabe pintar un tramo con veredicto. Por eso tampoco hace falta
 * `dangerouslySetInnerHTML` en ningún lado.
 *
 * Cómo se engancha una pantalla real: se le pasa `filas` y `kpis` propios por
 * `datos`. Lo que NO cambia nunca es la estructura —columnas, orden, copy y
 * reglas—, que es lo que hace que todas las pantallas se vean iguales al
 * prototipo aunque las escriban personas distintas.
 */
import { useMemo, useState } from 'react';
import { SemanticAbmPage } from '../abmv2/SemanticAbmPage';
import { ChipEstado, DotCell, EntityCell } from '../abmv2/DataTable';
import { MetricCell } from '../abmv2/Controls';
import { seg } from '../../lib/semanticHero';
import type { HeroFrase, HeroKpi, Veredicto } from '../../lib/semanticHero';
import type { ColumnSpec, ViewKind } from '../abmv2/types';
import type { AbmSpec, CeldaSpec, FilaSpec } from '../../config/canvasAbmSpec';

/**
 * El canvas marca la gravedad con COLOR (rojo, ámbar, verde). El kit la marca
 * con VEREDICTO, que es lo que después se traduce al token de cada marca. Esta
 * tabla es el puente entre los dos, y existe para que ningún hex del prototipo
 * llegue a la pantalla.
 */
function veredictoDeColor(color: string): Veredicto | undefined {
  const c = color.toUpperCase();
  if (!c) return undefined;
  if (['#C93A3E', '#E5484D'].includes(c)) return 'malo';
  if (['#B4560F', '#F59E0B'].includes(c)) return 'advertencia';
  if (['#00794F', '#00B37E'].includes(c)) return 'bueno';
  return undefined;
}

/**
 * Convierte el veredicto en prosa del canvas a segmentos del hero.
 *
 * Entra: `Tenés <strong>10 activos</strong>, y <strong style="color:#C93A3E">3
 * vencen hoy</strong>.` Sale: tres segmentos, el del medio con veredicto
 * 'malo'. Un `<strong>` sin color es énfasis sin gravedad.
 */
function frasesDeVeredicto(html: string): HeroFrase[] {
  if (!html.trim()) return [];
  const segmentos = [];
  const re = /<strong(?:\s+style="[^"]*color:\s*([^;"]+)[^"]*")?>(.*?)<\/strong>/gi;
  let ultimo = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    if (m.index > ultimo) {
      segmentos.push(seg(limpiar(html.slice(ultimo, m.index))));
    }
    segmentos.push(seg(limpiar(m[2]), veredictoDeColor((m[1] ?? '').trim())));
    ultimo = m.index + m[0].length;
  }
  if (ultimo < html.length) segmentos.push(seg(limpiar(html.slice(ultimo))));
  return segmentos.length ? [{ segmentos: segmentos.filter((s) => s.texto) }] : [];
}

/** Saca cualquier etiqueta suelta y normaliza espacios. */
const limpiar = (s: string) => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');

/** Una celda del spec, con la pieza del kit que le corresponde. */
function Celda({ celda }: { celda: CeldaSpec }) {
  if (celda.esChip) {
    // El chip del canvas trae su par de colores; el kit lo resuelve por tono.
    const tono = veredictoDeColor(celda.chipCol);
    return (
      <ChipEstado
        label={celda.texto}
        tone={tono === 'malo' ? 'red' : tono === 'advertencia' ? 'amber' : tono === 'bueno' ? 'green' : 'gray'}
      />
    );
  }
  if (celda.align === 'right') {
    return (
      <MetricCell
        value={celda.texto}
        note={celda.haySub ? celda.sub : undefined}
        veredicto={veredictoDeColor(celda.color)}
        muted={celda.color === '#98A3A0'}
      />
    );
  }
  if (celda.hayPunto) {
    return <DotCell label={celda.texto} dotColor={celda.punto} />;
  }
  return (
    <span className="av2-tabla-texto">
      {celda.texto}
      {celda.haySub && <span className="av2-celda-sub">{celda.sub}</span>}
    </span>
  );
}

export interface AbmDeConfiguracionProps {
  spec: AbmSpec;
  /** Clave del módulo (analytics y persistencia). */
  moduleKey: string;
  /** H1 de la pantalla. El eyebrow y la bajada salen del spec. */
  title: string;
  descripcion?: string;
  /** Datos REALES. Sin esto se pintan las filas del prototipo. */
  datos?: { filas?: FilaSpec[]; kpis?: HeroKpi[]; frases?: HeroFrase[] };
  /** Alta. Sin handler, el CTA no se renderiza (pantalla de sólo lectura). */
  onNuevo?: () => void;
  onFila?: (fila: FilaSpec, indice: number) => void;
  loading?: boolean;
}

export function AbmDeConfiguracion({
  spec,
  moduleKey,
  title,
  descripcion,
  datos,
  onNuevo,
  onFila,
  loading = false,
}: AbmDeConfiguracionProps) {
  const [busqueda, setBusqueda] = useState('');
  const [vista, setVista] = useState<ViewKind>('table');
  const [chipActivo, setChipActivo] = useState(spec.chips[0]?.[0] ?? 'todos');

  const filas = datos?.filas ?? spec.filas;

  const kpis = useMemo<HeroKpi[]>(
    () =>
      datos?.kpis ??
      spec.kpis.map(([etiqueta, valor, nota, color]) => ({
        etiqueta,
        valor,
        sub: nota,
        veredicto: veredictoDeColor(color),
      })),
    [datos?.kpis, spec.kpis],
  );

  const frases = useMemo<HeroFrase[]>(
    () => datos?.frases ?? frasesDeVeredicto(spec.ver),
    [datos?.frases, spec.ver],
  );

  // Las columnas salen de `heads` + `cols` del spec: mismo orden, mismos
  // anchos, misma alineación que el prototipo.
  const columnas = useMemo<ColumnSpec<FilaSpec>[]>(() => {
    const anchos = spec.cols.split(/\s+(?![^(]*\))/);
    return spec.heads.map(([header, align], i) => {
      const esPrimera = i === 0;
      const esUltima = i === spec.heads.length - 1;
      return {
        id: `col-${i}`,
        header,
        width: anchos[i] ?? 'minmax(100px, 1fr)',
        align: align === 'right' ? 'right' : 'left',
        kind: esPrimera ? 'entity' : esUltima ? 'actions' : 'text',
        cell: esPrimera
          ? (fila: FilaSpec) => (
              <EntityCell
                initials={fila.i}
                icon={fila.gl ? <GlifoTile path={fila.gl} color={fila.cc} /> : undefined}
                tileColor={fila.cc}
                title={fila.n}
                subtitle={fila.s}
              />
            )
          : esUltima
            ? undefined
            : (fila: FilaSpec) => {
                const celda = fila.cel[i - 1];
                return celda ? <Celda celda={celda} /> : null;
              },
      };
    });
  }, [spec.cols, spec.heads]);

  const chips = spec.chips.map(([label, count]) => ({ id: label, label, count }));
  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return filas;
    return filas.filter(
      (f) => f.n.toLowerCase().includes(q) || (f.s ?? '').toLowerCase().includes(q),
    );
  }, [filas, busqueda]);

  return (
    <SemanticAbmPage<FilaSpec>
      moduleKey={moduleKey}
      eyebrow={spec.eyebrow}
      title={title}
      description={descripcion}
      hero={{ etiqueta: spec.eyebrow, frases, kpis }}
      pista={
        spec.pista
          ? { titulo: spec.pista[0], texto: spec.pista[1] }
          : undefined
      }
      searchPlaceholder={spec.buscar}
      views={['table']}
      activeView={vista}
      onViewChange={setVista}
      search={busqueda}
      onSearchChange={setBusqueda}
      primaryAction={onNuevo && spec.modo !== 'lectura' ? { label: spec.cta, onClick: onNuevo } : undefined}
      selects={[]}
      statusTabs={chips}
      activeStatus={chipActivo}
      onStatusChange={setChipActivo}
      kind="plain"
      columns={columnas}
      rows={visibles}
      rowKey={(f) => f.n}
      rowActions={[]}
      onRowClick={onFila ? (f) => onFila(f, filas.indexOf(f)) : undefined}
      loading={loading}
      footer={{ showing: `Mostrando ${visibles.length} de ${filas.length}`, note: spec.pie }}
    />
  );
}

/** Tile con el glifo que declara el spec (path de 24×24). */
function GlifoTile({ path, color }: { path: string; color?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color ?? 'currentColor'}
      strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={path} />
    </svg>
  );
}

export default AbmDeConfiguracion;
