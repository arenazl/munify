/**
 * Semilla — qué hizo el generador de demos en cada creación, paso por paso.
 *
 * Pedido del dueño (2026-08-25): "una pantalla de log para el super admin para
 * ver exactamente qué hace en cada demo, para ver dónde está fallando".
 *
 * Backend: `backend/api/admin_seed_logs.py` (gate `require_super_admin`, sin
 * filtro por municipio a propósito — la gracia es comparar demos de munis
 * distintos). El listado NO trae los pasos; el detalle sí, y por eso el drawer
 * hace su propio fetch al abrirse.
 *
 * POR QUÉ SE FILTRA EN EL CLIENTE Y NO CON `?estado=`
 * ---------------------------------------------------
 * Las tabs tienen que decir CUÁNTAS demos degradaron y cuántas fallaron; con el
 * filtro en el servidor, cada tab necesitaría su propio COUNT. La bitácora es
 * de bajo volumen (una fila por demo creada), así que se traen las últimas 200
 * de una y se filtra acá. Si algún día esto crece, el cambio es agregar un
 * endpoint de conteos, no paginar a ciegas.
 *
 * REGLA DEL CERO (docs/dashboard/01-diseno-dashboard-modular.md §1.3): un cero
 * no se enuncia. Sin logs, la pantalla explica qué es y cuándo se llena; los
 * KPIs y las frases con número cero directamente no se dibujan.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Building2, Eye, Sprout } from 'lucide-react';
import { toast } from 'sonner';
import { seedLogsApi } from '../lib/api';
import type { SeedLogDetalle, SeedLogItem, SeedLogPaso } from '../lib/api';
import { SemanticAbmPage } from '../components/abmv2/SemanticAbmPage';
import { ChipEstado, EntityCell } from '../components/abmv2/DataTable';
import { MetricCell } from '../components/abmv2/Controls';
import { SideModal } from '../components/abmv2/SideModal';
import { seg } from '../lib/semanticHero';
import type { HeroFrase, HeroKpi } from '../lib/semanticHero';
import type { ChipTone, ColumnSpec, SectionSpec, ViewKind } from '../components/abmv2/types';
import './SeedLogs.css';

/* ============================================================
 * Formato
 * ============================================================ */

const TONO_ESTADO: Record<string, ChipTone> = {
  ok: 'green',
  degradado: 'amber',
  fallo: 'red',
};

const ETIQUETA_ESTADO: Record<string, string> = {
  ok: 'Completa',
  degradado: 'Degradada',
  fallo: 'Falló',
};

/**
 * `created_at` sale del server MySQL en UTC y SIN sufijo de zona. Sin la `Z`,
 * el navegador lo lee como hora local y muestra 3 horas de más.
 */
function fechaDeLog(iso: string | null): Date | null {
  if (!iso) return null;
  const tieneZona = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(iso);
  const d = new Date(tieneZona ? iso : `${iso}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

const OPCIONES_FECHA: Intl.DateTimeFormatOptions = {
  // Siempre en hora de Argentina: el server graba UTC y el super admin mira
  // desde acá. `hourCycle: h23` porque es-AR por defecto sale en 12 h
  // ("12:06 a. m.") y en una bitácora eso se lee mal al lado de duraciones.
  timeZone: 'America/Argentina/Buenos_Aires',
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
};

function formatearCuando(iso: string | null): string {
  const d = fechaDeLog(iso);
  if (!d) return 'sin fecha';
  return d.toLocaleString('es-AR', OPCIONES_FECHA).replace(',', '');
}

/** Duración legible. Nada de "12345 ms" en una lista que se lee de un golpe. */
function formatearDuracion(ms: number): string {
  if (!ms || ms < 0) return '—';
  if (ms < 1000) return `${ms} ms`;
  const s = ms / 1000;
  if (s < 60) {
    return `${s.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`;
  }
  const min = Math.floor(s / 60);
  return `${min} m ${Math.round(s - min * 60)} s`;
}

/** Nombres bonitos para las claves que la semilla usa hoy; el resto degrada a
 *  "snake_case" → "Snake case" sin que haya que mantener un diccionario. */
const ETIQUETAS_DETALLE: Record<string, string> = {
  nombres_zonas: 'Zonas',
  nombres_barrios: 'Barrios',
  calles_ejemplo: 'Calles de ejemplo',
  pasos_total: 'Pasos',
  pasos_ok: 'Pasos en verde',
  pasos_degradados: 'Pasos degradados',
  pasos_fallidos: 'Pasos fallidos',
};

function etiquetaDe(clave: string): string {
  const fija = ETIQUETAS_DETALLE[clave];
  if (fija) return fija;
  const legible = clave.replace(/_/g, ' ');
  return legible.charAt(0).toUpperCase() + legible.slice(1);
}

/** Frase de una línea para la columna "qué pasó": lo que hay que leer sin abrir. */
function resumenCorto(log: SeedLogItem): { texto: string; motivo?: string } {
  const r = log.resumen;
  if (!r) {
    return { texto: log.error_message ? 'El alta reventó antes de registrar pasos.' : 'Sin resumen.' };
  }
  const geo: string[] = [];
  if (r.barrios?.length) geo.push(`${r.barrios.length} barrios reales`);
  if (r.zonas?.length) geo.push(`${r.zonas.length} zonas`);
  if (r.calles_ejemplo?.length) geo.push('calles de la ciudad');

  const partes: string[] = [];
  partes.push(`${r.pasos_total} paso${r.pasos_total === 1 ? '' : 's'}`);
  if (r.pasos_fallidos > 0) partes.push(`${r.pasos_fallidos} fallado${r.pasos_fallidos === 1 ? '' : 's'}`);
  else if (r.pasos_degradados > 0) partes.push(`${r.pasos_degradados} a medias`);
  else partes.push('todos en verde');
  if (geo.length) partes.push(geo.join(' · '));
  else partes.push('sin geografía de la ciudad');

  const primera = r.degradaciones?.find((d) => d.motivo);
  return {
    texto: partes.join(' · '),
    motivo: primera ? `${primera.paso}: ${primera.motivo}` : undefined,
  };
}

/* ============================================================
 * Cuerpo del detalle — los datos de cada paso, formateados
 * ============================================================ */

const MAX_CHIPS = 12;

function ListaDeNombres({ label, valores }: { label: string; valores: string[] }) {
  const visibles = valores.slice(0, MAX_CHIPS);
  const resto = valores.length - visibles.length;
  return (
    <div className="sl-lista">
      <span className="sl-lista-label">
        {label} ({valores.length})
      </span>
      <div className="sl-chips">
        {visibles.map((v, i) => (
          <span className="sl-chip" key={`${v}-${i}`} title={v}>
            {v}
          </span>
        ))}
        {resto > 0 && <span className="sl-chip sl-chip--resto">+{resto} más</span>}
      </div>
    </div>
  );
}

/**
 * Traduce el `detalle` libre de un paso a algo que se lea como una historia:
 * los counts como pares etiqueta/valor, las listas de nombres como chips, y
 * SÓLO lo que no tiene forma conocida cae a texto monoespaciado.
 */
function DatosDelPaso({ detalle }: { detalle: Record<string, unknown> }) {
  const { pares, listas, crudos } = useMemo(() => {
    const pares: { clave: string; valor: string }[] = [];
    const listas: { clave: string; valores: string[] }[] = [];
    const crudos: { clave: string; valor: unknown }[] = [];

    for (const [clave, valor] of Object.entries(detalle)) {
      if (valor === null || valor === undefined || valor === '') continue;
      if (Array.isArray(valor)) {
        if (valor.length === 0) {
          pares.push({ clave, valor: 'ninguno' });
        } else if (valor.every((v) => typeof v === 'string' || typeof v === 'number')) {
          listas.push({ clave, valores: valor.map(String) });
        } else {
          crudos.push({ clave, valor });
        }
        continue;
      }
      if (typeof valor === 'object') {
        crudos.push({ clave, valor });
        continue;
      }
      pares.push({
        clave,
        valor: typeof valor === 'boolean' ? (valor ? 'sí' : 'no') : String(valor),
      });
    }
    return { pares, listas, crudos };
  }, [detalle]);

  if (!pares.length && !listas.length && !crudos.length) return null;

  return (
    <div className="sl-paso-datos">
      {pares.length > 0 && (
        <div className="sl-pares">
          {pares.map((p) => (
            <span className="sl-par" key={p.clave}>
              <span className="sl-par-label">{etiquetaDe(p.clave)}</span>
              <span className="sl-par-valor">{p.valor}</span>
            </span>
          ))}
        </div>
      )}
      {listas.map((l) => (
        <ListaDeNombres key={l.clave} label={etiquetaDe(l.clave)} valores={l.valores} />
      ))}
      {crudos.map((c) => (
        <div className="sl-lista" key={c.clave}>
          <span className="sl-lista-label">{etiquetaDe(c.clave)}</span>
          <pre className="sl-crudo">{JSON.stringify(c.valor, null, 2)}</pre>
        </div>
      ))}
    </div>
  );
}

function PasoDelPipeline({ paso }: { paso: SeedLogPaso }) {
  const clase =
    paso.estado === 'fallo'
      ? 'sl-paso sl-paso--fallo'
      : paso.estado === 'degradado'
        ? 'sl-paso sl-paso--degradado'
        : 'sl-paso';
  // El padre DECLARA si la tarjeta lleva datos: el CSS no tiene que
  // adivinarlo con un :not(:has(...)) (regla del dueño: nada de :not).
  const cab = paso.detalle ? 'sl-paso-cab' : 'sl-paso-cab sl-paso-cab--solo';
  return (
    <div className={clase}>
      <div className={cab}>
        <span className="sl-paso-nombre">{paso.nombre}</span>
        <span className="sl-paso-estado">{ETIQUETA_ESTADO[paso.estado] || paso.estado}</span>
        <span className="sl-paso-dur">{formatearDuracion(paso.duracion_ms)}</span>
      </div>
      {paso.motivo && <p className="sl-paso-motivo">{paso.motivo}</p>}
      {paso.detalle && <DatosDelPaso detalle={paso.detalle} />}
    </div>
  );
}

/* ============================================================
 * Pantalla
 * ============================================================ */

export default function SeedLogs() {
  const [logs, setLogs] = useState<SeedLogItem[]>([]);
  const [cargando, setCargando] = useState(true);

  const [busqueda, setBusqueda] = useState('');
  const [vista, setVista] = useState<ViewKind>('table');
  const [tabEstado, setTabEstado] = useState('todas');
  const [paisFiltro, setPaisFiltro] = useState('todos');

  const [abierto, setAbierto] = useState<SeedLogItem | null>(null);
  const [detalle, setDetalle] = useState<SeedLogDetalle | null>(null);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);

  const traer = useCallback(async () => {
    setCargando(true);
    try {
      const r = await seedLogsApi.list({ limit: 200 });
      setLogs(r.data?.items || []);
    } catch (e) {
      console.error('Error cargando la bitácora de la semilla:', e);
      toast.error('No se pudo leer la bitácora de la semilla');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    traer();
  }, [traer]);

  /* --- Detalle: el listado no trae los pasos, así que se pide al abrir --- */
  const abrirDetalle = useCallback(async (log: SeedLogItem) => {
    setAbierto(log);
    setDetalle(null);
    setCargandoDetalle(true);
    try {
      const r = await seedLogsApi.detail(log.id);
      setDetalle(r.data);
    } catch (e) {
      console.error('Error cargando el detalle del seed log:', e);
      toast.error('No se pudo leer el paso a paso de esta demo');
    } finally {
      setCargandoDetalle(false);
    }
  }, []);

  /* --- Derivados --- */

  const porEstado = useMemo(
    () => ({
      ok: logs.filter((l) => l.estado === 'ok').length,
      degradado: logs.filter((l) => l.estado === 'degradado').length,
      fallo: logs.filter((l) => l.estado === 'fallo').length,
    }),
    [logs],
  );

  const paises = useMemo(() => {
    const set = new Set(logs.map((l) => l.pais).filter((p): p is string => !!p));
    return Array.from(set).sort();
  }, [logs]);

  const conBarrios = useMemo(
    () => logs.filter((l) => (l.resumen?.barrios?.length ?? 0) > 0).length,
    [logs],
  );

  const duracionTipica = useMemo(() => {
    const ms = logs.map((l) => l.duracion_ms).filter((n) => n > 0).sort((a, b) => a - b);
    if (!ms.length) return null;
    return ms[Math.floor(ms.length / 2)];
  }, [logs]);

  const masLenta = useMemo(() => {
    if (!logs.length) return null;
    return logs.slice().sort((a, b) => b.duracion_ms - a.duracion_ms)[0];
  }, [logs]);

  const heroKpis = useMemo<HeroKpi[]>(() => {
    // Regla del cero: sin logs no hay strip. Cinco ceros no informan nada.
    if (cargando || logs.length === 0) return [];
    return [
      { etiqueta: 'Demos creadas', valor: logs.length, sub: 'las últimas registradas' },
      { etiqueta: 'Completas', valor: porEstado.ok, sub: 'terminaron enteras' },
      {
        etiqueta: 'A medias',
        valor: porEstado.degradado,
        sub: porEstado.degradado ? 'algún paso produjo de menos' : 'ningún paso quedó corto',
        veredicto: porEstado.degradado > 0 ? 'advertencia' : undefined,
      },
      {
        etiqueta: 'Fallidas',
        valor: porEstado.fallo,
        sub: porEstado.fallo ? 'se cortaron a mitad' : 'ninguna se cortó',
        veredicto: porEstado.fallo > 0 ? 'malo' : undefined,
      },
      {
        etiqueta: 'Con barrios reales',
        valor: conBarrios,
        sub: `de ${logs.length} demos`,
        veredicto: conBarrios < logs.length ? 'advertencia' : undefined,
      },
    ];
  }, [cargando, logs, porEstado, conBarrios]);

  const heroFrases = useMemo<HeroFrase[]>(() => {
    if (cargando) return [];
    if (logs.length === 0) {
      // El cero no se enuncia: se explica qué va a aparecer acá.
      return [
        {
          segmentos: [
            seg('La bitácora está esperando su primera demo'),
            seg(
              '. Cada alta desde la pantalla comercial deja acá su paso a paso: qué ciudad usó, qué barrios y calles reales encontró, y en qué etapa se quedó corta.',
            ),
          ],
        },
      ];
    }

    const frases: HeroFrase[] = [];
    if (porEstado.fallo > 0) {
      frases.push({
        segmentos: [
          seg(
            `${porEstado.fallo} de ${logs.length} demos se ${porEstado.fallo === 1 ? 'cortó' : 'cortaron'} a mitad`,
            'malo',
          ),
          seg(
            '. Abrí la fila para ver en qué paso reventó: el log se escribe igual aunque el alta se revierta.',
          ),
        ],
      });
    } else if (porEstado.degradado > 0) {
      frases.push({
        segmentos: [
          seg(
            `${porEstado.degradado} de ${logs.length} demos ${porEstado.degradado === 1 ? 'salió' : 'salieron'} a medias`,
            'advertencia',
          ),
          seg(
            `. ${porEstado.degradado === 1 ? 'Corrió entera' : 'Corrieron enteras'}, pero algún paso produjo menos de lo que debía — el motivo está en el detalle.`,
          ),
        ],
      });
    } else {
      frases.push({
        segmentos: [
          seg(
            `Las últimas ${logs.length} demo${logs.length === 1 ? '' : 's'} salieron completas`,
            'bueno',
          ),
          seg('. Ningún paso quedó corto ni se cortó a mitad.'),
        ],
      });
    }

    const sinBarrios = logs.length - conBarrios;
    if (sinBarrios > 0) {
      frases.push({
        segmentos: [
          seg(
            `${sinBarrios} demo${sinBarrios === 1 ? ' quedó' : 's quedaron'} sin barrios reales`,
            'advertencia',
          ),
          seg(
            ': la ciudad no trajo geografía y la app habla de zonas genéricas. Suele ser la ciudad que no está en el catálogo, o el país que no viajó en el alta.',
          ),
        ],
      });
    } else if (masLenta && masLenta.duracion_ms > 0) {
      frases.push({
        segmentos: [
          seg(`Todas trajeron barrios de su ciudad`),
          seg(
            `. La más lenta fue ${masLenta.municipio_nombre}, con ${formatearDuracion(masLenta.duracion_ms)}.`,
          ),
        ],
      });
    }
    return frases;
  }, [cargando, logs, porEstado, conBarrios, masLenta]);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return logs.filter((l) => {
      if (tabEstado !== 'todas' && l.estado !== tabEstado) return false;
      if (paisFiltro !== 'todos' && l.pais !== paisFiltro) return false;
      if (!q) return true;
      return (
        l.municipio_nombre.toLowerCase().includes(q) ||
        (l.codigo ?? '').toLowerCase().includes(q) ||
        (l.provincia ?? '').toLowerCase().includes(q) ||
        (l.pais ?? '').toLowerCase().includes(q)
      );
    });
  }, [logs, busqueda, tabEstado, paisFiltro]);

  const columnas = useMemo<ColumnSpec<SeedLogItem>[]>(
    () => [
      {
        id: 'municipio',
        header: 'Demo',
        width: 'minmax(190px, 1.4fr)',
        kind: 'entity',
        cell: (l) => (
          <EntityCell
            icon={Building2}
            title={l.municipio_nombre}
            subtitle={[l.provincia, l.pais, l.codigo].filter(Boolean).join(' · ') || undefined}
          />
        ),
      },
      {
        id: 'que',
        header: 'Qué hizo la semilla',
        width: 'minmax(230px, 2fr)',
        cell: (l) => {
          const { texto, motivo } = resumenCorto(l);
          return (
            <span className="sl-que">
              {texto}
              {motivo && (
                <>
                  <br />
                  <span className="sl-que-motivo">{motivo}</span>
                </>
              )}
            </span>
          );
        },
      },
      {
        id: 'pasos',
        header: 'Pasos',
        width: 'minmax(84px, 0.6fr)',
        align: 'right',
        kind: 'metric',
        cell: (l) => {
          const r = l.resumen;
          if (!r) return <MetricCell value="—" note="sin registro" muted />;
          const malos = r.pasos_fallidos + r.pasos_degradados;
          return (
            <MetricCell
              value={String(r.pasos_total)}
              note={malos === 0 ? 'en verde' : `${malos} con aviso`}
              veredicto={
                r.pasos_fallidos > 0 ? 'malo' : r.pasos_degradados > 0 ? 'advertencia' : undefined
              }
            />
          );
        },
      },
      {
        id: 'duracion',
        header: 'Tardó',
        width: 'minmax(84px, 0.6fr)',
        align: 'right',
        cell: (l) => <span className="av2-tnum">{formatearDuracion(l.duracion_ms)}</span>,
      },
      {
        id: 'cuando',
        header: 'Cuándo',
        width: 'minmax(110px, 0.8fr)',
        kind: 'date',
        cell: (l) => <span className="av2-tnum">{formatearCuando(l.created_at)}</span>,
      },
      {
        id: 'estado',
        header: 'Estado',
        width: 'minmax(104px, 0.7fr)',
        kind: 'chip',
        cell: (l) => (
          <ChipEstado
            label={ETIQUETA_ESTADO[l.estado] || l.estado}
            tone={TONO_ESTADO[l.estado] || 'gray'}
          />
        ),
      },
      {
        id: 'acciones',
        header: 'Acciones',
        width: 'minmax(70px, 0.45fr)',
        kind: 'actions',
        align: 'right',
      },
    ],
    [],
  );

  /* --- Secciones del drawer --- */

  const secciones = useMemo<SectionSpec[]>(() => {
    if (!abierto) return [];
    const log = detalle ?? abierto;
    const r = log.resumen;
    const secs: SectionSpec[] = [];

    secs.push({
      id: 'ciudad',
      label: 'La ciudad y lo que se encontró',
      content: (
        <div className="sl-ficha">
          <div className="sl-pares">
            <span className="sl-par">
              <span className="sl-par-label">Origen</span>
              <span className="sl-par-valor">
                {log.origen === 'endpoint' ? 'pantalla /demo' : log.origen}
              </span>
            </span>
            <span className="sl-par">
              <span className="sl-par-label">País</span>
              <span className="sl-par-valor">{log.pais || 'sin dato'}</span>
            </span>
            <span className="sl-par">
              <span className="sl-par-label">Provincia</span>
              <span className="sl-par-valor">{log.provincia || 'sin dato'}</span>
            </span>
            <span className="sl-par">
              <span className="sl-par-label">Código</span>
              <span className="sl-par-valor">{log.codigo || 'no se creó'}</span>
            </span>
            <span className="sl-par">
              <span className="sl-par-label">Tardó</span>
              <span className="sl-par-valor">{formatearDuracion(log.duracion_ms)}</span>
            </span>
          </div>
          {r?.zonas?.length ? <ListaDeNombres label="Zonas" valores={r.zonas} /> : null}
          {r?.barrios?.length ? <ListaDeNombres label="Barrios" valores={r.barrios} /> : null}
          {r?.calles_ejemplo?.length ? (
            <ListaDeNombres label="Calles de ejemplo" valores={r.calles_ejemplo} />
          ) : null}
          {!r?.zonas?.length && !r?.barrios?.length && !r?.calles_ejemplo?.length && (
            <p className="sl-nota">
              La semilla no registró nombres reales de esta ciudad: la demo quedó hablando de zonas
              genéricas. Revisá el paso de geografía acá abajo.
            </p>
          )}
        </div>
      ),
    });

    secs.push({
      id: 'pasos',
      label: 'El paso a paso',
      content: cargandoDetalle ? (
        <p className="sl-nota">Buscando el paso a paso…</p>
      ) : detalle?.pasos?.length ? (
        <div className="sl-pasos">
          {detalle.pasos.map((p, i) => (
            <PasoDelPipeline key={`${p.nombre}-${i}`} paso={p} />
          ))}
        </div>
      ) : (
        <p className="sl-nota">
          Esta creación no llegó a registrar ningún paso: se cortó antes de empezar el pipeline.
        </p>
      ),
    });

    if (log.error_message) {
      secs.push({
        id: 'error',
        label: 'El error que tumbó el alta',
        content: (
          <div className="sl-error">
            <p className="sl-error-txt">{log.error_message}</p>
          </div>
        ),
      });
    }

    return secs;
  }, [abierto, detalle, cargandoDetalle]);

  const sinDemo = !abierto?.codigo || !abierto?.municipio_id;

  return (
    <>
      <SemanticAbmPage<SeedLogItem>
        moduleKey="seed-logs"
        eyebrow="Super admin · Demos"
        title="Qué hizo la semilla en cada demo"
        description="Una fila por creación de demo, la más reciente primero. Sirve para ver dónde se está quedando corta: qué ciudad usó, qué geografía real trajo y en qué paso degradó o falló."
        hero={{
          etiqueta: 'SEMILLA · BITÁCORA',
          frases: heroFrases,
          kpis: heroKpis,
        }}
        pista={{
          titulo: 'Degradado no es lo mismo que falló',
          texto:
            'Una demo "a medias" corrió entera pero algún paso produjo menos de lo que debía (barrios sacados de nombres de calles porque el mapa no tenía barrios, tesorería salteada). Una demo "falló" se cortó: el log queda igual porque se escribe en su propia transacción.',
        }}
        searchPlaceholder="Buscar por municipio, código, provincia o país…"
        views={['table']}
        activeView={vista}
        onViewChange={setVista}
        search={busqueda}
        onSearchChange={setBusqueda}
        selects={
          paises.length > 1
            ? [
                {
                  id: 'pais',
                  label: 'País',
                  value: paisFiltro,
                  options: [
                    { value: 'todos', label: 'Todos' },
                    ...paises.map((p) => ({ value: p, label: p })),
                  ],
                  onChange: setPaisFiltro,
                },
              ]
            : []
        }
        statusTabs={
          logs.length === 0
            ? [{ id: 'todas', label: 'Todas' }]
            : [
                { id: 'todas', label: 'Todas', count: logs.length },
                { id: 'ok', label: 'Completas', count: porEstado.ok },
                { id: 'degradado', label: 'A medias', count: porEstado.degradado },
                { id: 'fallo', label: 'Fallidas', count: porEstado.fallo },
              ]
        }
        activeStatus={tabEstado}
        onStatusChange={setTabEstado}
        filterSummary={
          logs.length > 0 && duracionTipica
            ? `${visibles.length} de ${logs.length} · duración típica ${formatearDuracion(duracionTipica)}`
            : undefined
        }
        kind="plain"
        columns={columnas}
        rows={visibles}
        rowKey={(l) => l.id}
        rowActions={[
          { id: 'ver', label: 'Ver el paso a paso', icon: Eye, onClick: (l) => abrirDetalle(l) },
        ]}
        onRowClick={(l) => abrirDetalle(l)}
        loading={cargando}
        emptyMessage={
          busqueda.trim() || tabEstado !== 'todas' || paisFiltro !== 'todos'
            ? 'Ninguna creación coincide con lo que estás filtrando.'
            : 'Todavía no se creó ninguna demo con la bitácora encendida. En cuanto alguien arme una desde la pantalla comercial, acá va a quedar su paso a paso completo: la ciudad del catálogo que eligió, los barrios y calles que encontró en el mapa, cuánto tardó cada etapa y el motivo exacto si algo salió a medias.'
        }
        footer={{
          showing:
            logs.length === 0
              ? 'La bitácora todavía no tiene creaciones registradas'
              : `Mostrando ${visibles.length} de ${logs.length}`,
          note: 'El log se escribe en su propia transacción: una demo que revienta a mitad deja igual su fila acá, que es justo el caso que hay que poder mirar.',
        }}
      />

      {abierto && (
        <SideModal
          mode="detail"
          width={560}
          open
          onClose={() => {
            setAbierto(null);
            setDetalle(null);
          }}
          header={{
            id: `#${abierto.id}`,
            title: abierto.municipio_nombre,
            metaTop: (
              <>
                <Sprout size={13} strokeWidth={1.8} aria-hidden />
                {formatearCuando(abierto.created_at)} ·{' '}
                {abierto.origen === 'endpoint' ? 'desde la pantalla /demo' : `desde ${abierto.origen}`}
              </>
            ),
            metaBottom: (
              <>
                {[abierto.provincia, abierto.pais].filter(Boolean).join(' · ') || 'sin geografía'}
                {' · '}
                {formatearDuracion(abierto.duracion_ms)}
                {abierto.error_message && (
                  <>
                    {' · '}
                    <AlertTriangle size={13} strokeWidth={1.8} aria-hidden /> se cortó
                  </>
                )}
              </>
            ),
            statusChip: {
              label: ETIQUETA_ESTADO[abierto.estado] || abierto.estado,
              tone: TONO_ESTADO[abierto.estado] || 'gray',
            },
          }}
          sections={secciones}
          footer={{
            primary: {
              label: 'Abrir la demo',
              to: sinDemo ? undefined : `/${abierto.codigo}`,
              disabled: sinDemo,
              disabledReason: abierto.municipio_id
                ? 'Esta creación no dejó código de municipio.'
                : 'El alta no llegó a crear el municipio: no hay demo que abrir.',
            },
          }}
        />
      )}
    </>
  );
}
