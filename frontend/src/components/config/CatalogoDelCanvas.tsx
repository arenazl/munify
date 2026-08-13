/**
 * CatalogoDelCanvas — el cuerpo `tipo: 'catalogo'` del prototipo.
 *
 * Los siete catálogos simples (categorías de reclamo, tipos de POI, categorías
 * de inventario, conceptos, conceptos de liquidación, tipos de empleado y
 * parajes) son EL MISMO ABM con otra lista. El canvas dibujó uno; acá hay un
 * componente, no siete pantallas.
 *
 * Renderiza los datos del prototipo (`DATOS_CATALOGO`) con las piezas del kit.
 * Cuando una pantalla se engancha a su endpoint, le pasa sus `filas` y sus
 * `kpis` por props: la estructura —columnas, orden, copy y reglas— no cambia.
 *
 * Los cinco KPIs son los del canvas: EN EL CATÁLOGO · ACTIVAS · SIN USAR ·
 * MÁS USADA · SE PISAN.
 */
import { useMemo, useState, useEffect } from 'react';
import { icons as LucideIcons } from 'lucide-react';
import { SemanticAbmPage } from '../abmv2/SemanticAbmPage';
import { EntityCell } from '../abmv2/DataTable';
import { MetricCell, Switch } from '../abmv2/Controls';
import { seg } from '../../lib/semanticHero';
import type { HeroFrase, HeroKpi } from '../../lib/semanticHero';
import type { ColumnSpec, ViewKind } from '../abmv2/types';
import type { CatalogoSpec, FilaCatalogo } from '../../config/canvasConfigSpec';
import { CABLEADO_CATALOGO } from './datosDeAjuste';
import { useReportarTotal } from '../abmv2/useEmbed';

/** Plazo legible: en días cuando es múltiplo exacto, en horas cuando no. */
function plazo(hs?: number | null): string {
  if (!hs) return '—';
  if (hs % 24 === 0) {
    const d = hs / 24;
    return d === 1 ? '1 día' : `${d} días`;
  }
  return `${hs} h`;
}

export interface CatalogoDelCanvasProps {
  spec: CatalogoSpec;
  moduleKey: string;
  title: string;
  eyebrow: string;
  descripcion?: string;
  /** La regla del pie (por qué el sistema va a decir que no). */
  regla?: string;
  onNuevo?: () => void;
  onFila?: (fila: FilaCatalogo) => void;
  onAlternar?: (fila: FilaCatalogo, activo: boolean) => void;
  loading?: boolean;
}

export function CatalogoDelCanvas({
  spec,
  moduleKey,
  title,
  eyebrow,
  descripcion,
  regla,
  onNuevo,
  onFila,
  onAlternar,
  loading = false,
}: CatalogoDelCanvasProps) {
  const [busqueda, setBusqueda] = useState('');
  const [vista, setVista] = useState<ViewKind>('table');
  const [estado, setEstado] = useState('todos');

  const [filasVivo, setFilasVivo] = useState<FilaCatalogo[] | null>(null);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    const fetcher = CABLEADO_CATALOGO[moduleKey];
    if (fetcher) {
      setCargando(true);
      fetcher()
        .then((items) => setFilasVivo(items.length > 0 ? items : null))
        .catch(() => setFilasVivo(null))
        .finally(() => setCargando(false));
    } else {
      setFilasVivo(null);
    }
  }, [moduleKey]);

  /* Un catálogo CABLEADO nunca muestra las filas del prototipo: mientras
     carga va el skeleton con "—" — un número inventado se lee como real
     (misma regla que AbmDeConfiguracion). */
  const cableada = !!CABLEADO_CATALOGO[moduleKey];
  const filas = filasVivo ?? (cableada ? [] : spec.filas);
  const sinDatosAun = cableada && !filasVivo;
  // Sólo el número real llega al contador del riel; el de muestra no. */
  useReportarTotal(filasVivo ? filasVivo.length : undefined);
  const activas = filas.filter((f) => !f.off);
  const sePisan = filas.filter((f) => (f.pisa ?? '').trim()).length;
  /* El catálogo habla SÓLO del catálogo: cuántos reclamos usó cada entrada es
     dato OPERATIVO y vive en el módulo Reclamos, no acá (decisión del dueño,
     2026-08-07: "el catálogo lista, no cuenta operaciones"). */
  const conPlazo = filas.filter((f) => typeof f.hs === 'number' && f.hs);
  const masExigente = conPlazo.length
    ? conPlazo.slice().sort((a, b) => (a.hs ?? 0) - (b.hs ?? 0))[0]
    : undefined;

  const kpis = useMemo<HeroKpi[]>(() => {
    if (sinDatosAun) {
      return ['En el catálogo', 'Activas', 'Inactivas', 'Más exigente', 'Se pisan'].map((etiqueta) => ({
        etiqueta,
        valor: '—',
        sub: cargando ? 'cargando…' : 'sin datos',
      }));
    }
    return [
      { etiqueta: 'En el catálogo', valor: filas.length, sub: 'entradas cargadas' },
      { etiqueta: 'Activas', valor: activas.length, sub: 'se ofrecen en la app' },
      { etiqueta: 'Inactivas', valor: filas.length - activas.length, sub: 'ocultas para el vecino' },
      {
        etiqueta: 'Más exigente',
        valor: masExigente ? plazo(masExigente.hs) : '—',
        sub: masExigente?.nombre ?? 'sin plazos definidos',
      },
      {
        etiqueta: 'Se pisan',
        valor: sePisan,
        sub: sePisan ? 'nombres parecidos' : 'ninguna se repite',
        veredicto: sePisan > 0 ? 'advertencia' : undefined,
      },
    ];
  }, [filas.length, activas.length, masExigente, sePisan, sinDatosAun, cargando]);

  const frases = useMemo<HeroFrase[]>(() => {
    if (sinDatosAun) {
      return [{
        segmentos: [
          seg(cargando ? 'Trayendo el catálogo del municipio…' : 'No se pudieron traer los datos del catálogo.'),
        ],
      }];
    }
    const primera = [
      seg(`${filas.length} en el catálogo, ${activas.length} activas.`, 'bueno'),
      seg(' El orden de la lista es el que ve el vecino al elegir.'),
    ];
    const fs: HeroFrase[] = [{ segmentos: primera }];
    if (sePisan > 0) {
      fs.push({
        segmentos: [
          seg(`${sePisan} se solapan con otra entrada`, 'advertencia'),
          seg(': ahí el vecino elige mal y el mismo problema entra por dos lados.'),
        ],
      });
    }
    return fs;
  }, [filas.length, activas.length, sePisan, sinDatosAun, cargando]);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return filas.filter((f) => {
      if (estado === 'activos' && f.off) return false;
      if (estado === 'inactivos' && !f.off) return false;
      if (!q) return true;
      return f.nombre.toLowerCase().includes(q) || (f.desc ?? '').toLowerCase().includes(q);
    });
  }, [filas, busqueda, estado]);

  const columnas = useMemo<ColumnSpec<FilaCatalogo>[]>(() => {
    const cols: ColumnSpec<FilaCatalogo>[] = [
      {
        id: 'nombre',
        header: 'Nombre y descripción',
        width: 'minmax(220px, 2.2fr)',
        kind: 'entity',
        cell: (f) => {
          const rawGlifo = (f.glifo || '').trim();
          // SVG paths usually start with M or m. Lucide icon names are PascalCase (no spaces, letters and numbers).
          const isLucide = /^[A-Z][a-zA-Z0-9]*$/.test(rawGlifo);
          const LucideIcon = isLucide ? (LucideIcons as any)[rawGlifo] : null;
          
          return (
            <EntityCell
              icon={
                LucideIcon ? (
                  <LucideIcon size={16} color={f.color} strokeWidth={1.9} aria-hidden />
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={f.color}
                    strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d={rawGlifo} />
                  </svg>
                )
              }
              tileColor={f.color}
              title={f.nombre}
              subtitle={f.desc ?? (typeof f.nota === 'string' ? f.nota : undefined)}
            />
          );
        },
      },
    ];

    // La columna de respuesta sólo aparece si el catálogo tiene plazos: en
    // Parajes o Conceptos no existe, y una columna vacía promete un dato que
    // el catálogo no maneja.
    if (filas.some((f) => typeof f.hs === 'number' && f.hs)) {
      cols.push({
        id: 'respuesta',
        header: 'Respuesta comprometida',
        width: 'minmax(130px, 1fr)',
        align: 'right',
        kind: 'metric',
        cell: (f) => (
          <MetricCell
            value={plazo(f.hs)}
            note={f.prio ? `prioridad ${f.prio}` : undefined}
            veredicto={(f.prio ?? 0) >= 4 ? 'malo' : (f.prio ?? 0) === 3 ? 'advertencia' : undefined}
          />
        ),
      });
    }

    /* Sin columna "En uso": cuántas operaciones usó cada entrada es dato del
       módulo operativo, no del catálogo (decisión del dueño, 2026-08-07). */
    cols.push(
      {
        id: 'activo',
        header: 'Estado',
        width: 'minmax(76px, 0.5fr)',
        align: 'right',
        cell: (f) => (
          <Switch
            checked={!f.off}
            ariaLabel={f.off ? `Activar ${f.nombre}` : `Desactivar ${f.nombre}`}
            onChange={(v) => onAlternar?.(f, v)}
          />
        ),
      },
      { id: 'acciones', header: 'Acciones', width: 'minmax(76px, 0.5fr)', kind: 'actions', align: 'right' },
    );
    return cols;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filas]);

  return (
    <SemanticAbmPage<FilaCatalogo>
      moduleKey={moduleKey}
      eyebrow={eyebrow}
      title={title}
      description={descripcion}
      hero={{ etiqueta: eyebrow, frases, kpis }}
      searchPlaceholder="Buscar por nombre"
      views={['table']}
      activeView={vista}
      onViewChange={setVista}
      search={busqueda}
      onSearchChange={setBusqueda}
      primaryAction={onNuevo ? { label: spec.nuevo, onClick: onNuevo } : undefined}
      selects={[]}
      statusTabs={[
        { id: 'todos', label: 'Todas', count: filas.length },
        { id: 'activos', label: 'Activas', count: activas.length },
        { id: 'inactivos', label: 'Inactivas', count: filas.length - activas.length },
      ]}
      activeStatus={estado}
      onStatusChange={setEstado}
      kind="plain"
      columns={columnas}
      rows={visibles}
      rowKey={(f) => f.nombre}
      rowActions={[]}
      onRowClick={onFila}
      loading={loading || cargando}
      footer={{
        showing: `Mostrando ${visibles.length} de ${filas.length}`,
        note: regla,
      }}
    />
  );
}

export default CatalogoDelCanvas;
