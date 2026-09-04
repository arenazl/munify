/**
 * /gestion/admin/demos — AUDITORÍA de las demos generadas (dueño, 2026-09-03).
 *
 * "Ahí hago yo una auditoría de lo que va creando" el generador de demos:
 * qué pudo crear bien cada una — el CONTORNO del municipio, los BARRIOS y
 * sus POLÍGONOS, la zona, los catálogos y los seeds — por país y provincia.
 *
 * SÓLO SUPER ADMIN y adentro del shell. El backend exige lo mismo
 * (require_super_admin) en la auditoría y en la purga.
 *
 * Es también una pantalla EJEMPLAR del ABM v3: SemanticAbmPage full por
 * props — roles semánticos, 3 vistas built-in, enfoque declarado por
 * veredicto, agrupada por nivel de integridad y CERO estilos propios.
 *
 * VOCABULARIO (lo que la pantalla mezclaba y el dueño pidió separar):
 *   - CONTORNO: la forma del municipio ENTERO. Vive en el polígono de la
 *     zona única (la zona es el municipio); el backend lo resuelve.
 *   - POLÍGONO: la forma de CADA barrio (o zona). "42 con polígono" son
 *     42 barrios dibujados de 43.
 *
 * NIVELES (dueño, 2026-09-03: "íntegro es con todo; tres o cuatro niveles").
 * Se decide por el ESLABÓN MÁS DÉBIL, no por un puntaje ponderado:
 *   Íntegra       contorno + zona con polígono + TODOS los barrios con
 *                 polígono + catálogos + usuarios + reclamos + trámites +
 *                 noticias. Con todo.
 *   Casi íntegra  lo mismo, con barrios sin polígono mientras el 80 % o más
 *                 lo tenga, o faltando sólo noticias.
 *   A medias      se entra y se opera (usuarios, catálogos, reclamos,
 *                 trámites) pero la geografía no está: sin contorno, menos
 *                 del 80 % de barrios con polígono, sin barrios, o falta
 *                 uno de los seeds operativos.
 *   Rota          no sirve como demo: sin usuarios, sin catálogos, sin
 *                 reclamos ni trámites, o sin contorno y sin un solo barrio
 *                 con polígono.
 *
 * BLINDADAS: `intocable` (asuncion, merlo) y la de muestra no tienen tacho
 * ni entran en "Eliminar estas N". El backend las rechaza igual.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ExternalLink, ShieldCheck, Trash2, Wrench } from 'lucide-react';
import { toast } from 'sonner';
import { SemanticAbmPage } from '../components/abmv2/SemanticAbmPage';
import { ChipEstado, EntityCell } from '../components/abmv2/DataTable';
import { MetricCell } from '../components/abmv2/Controls';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import type {
  Action,
  ChipTone,
  ColumnSpec,
  RolesSemanticos,
  SelectSpec,
  TableGroup,
  TildeSpec,
  ViewKind,
} from '../components/abmv2/types';
import { api } from '../lib/api';
import { seg } from '../lib/semanticHero';

interface DemoAudit {
  id: number;
  codigo: string;
  nombre: string;
  pais: string;
  provincia: string | null;
  activo: boolean;
  con_pin: boolean;
  de_muestra: boolean;
  intocable: boolean;
  created_at: string | null;
  con_contorno: boolean;
  barrios_total: number;
  barrios_con_poligono: number;
  zonas_total: number;
  zonas_con_poligono: number;
  categorias_reclamo: number;
  categorias_tramite: number;
  usuarios: number;
  reclamos: number;
  solicitudes: number;
  noticias: number;
}

interface Cobertura {
  pais: string;
  provincia: string | null;
  total: number;
  con_contorno: number;
}

interface Auditoria {
  demos: DemoAudit[];
  catalogo: Cobertura[];
}

type Nivel = 'integra' | 'casi' | 'a_medias' | 'rota';

const NIVEL_LABEL: Record<Nivel, string> = {
  integra: 'Íntegra',
  casi: 'Casi íntegra',
  a_medias: 'A medias',
  rota: 'Rota',
};
const NIVEL_TONO: Record<Nivel, ChipTone> = {
  integra: 'green',
  casi: 'blue',
  a_medias: 'amber',
  rota: 'red',
};
const NIVEL_VEREDICTO = {
  integra: 'bueno',
  casi: 'bueno',
  a_medias: 'advertencia',
  rota: 'malo',
} as const;
const NIVELES: Nivel[] = ['integra', 'casi', 'a_medias', 'rota'];

const PAIS_LABEL: Record<string, string> = {
  AR: 'Argentina',
  PY: 'Paraguay',
  UY: 'Uruguay',
  CL: 'Chile',
  BO: 'Bolivia',
  PE: 'Perú',
};
const PAIS_DEFAULT = 'AR';
const TODOS = 'todos';

/** Umbral de "casi": con este porcentaje de barrios dibujados o más, la
 *  geografía se considera casi completa. */
const UMBRAL_CASI = 80;

interface Evaluacion {
  nivel: Nivel;
  /** Qué le falta, en el orden en que se lee: geografía primero. */
  faltantes: string[];
  /** % de barrios con polígono (0 si no hay barrios). */
  pct: number;
}

function evaluar(d: DemoAudit): Evaluacion {
  const hayBarrios = d.barrios_total > 0;
  const pct = hayBarrios ? Math.round((100 * d.barrios_con_poligono) / d.barrios_total) : 0;
  const sinPoligono = d.barrios_total - d.barrios_con_poligono;
  const catalogos = d.categorias_reclamo > 0 && d.categorias_tramite > 0;
  const entrable = d.usuarios > 0;
  const operable = d.reclamos > 0 && d.solicitudes > 0;

  const faltantes: string[] = [];
  if (!d.con_contorno) faltantes.push('contorno');
  if (!hayBarrios) faltantes.push('barrios');
  else if (sinPoligono > 0) {
    faltantes.push(`${sinPoligono} ${sinPoligono === 1 ? 'barrio' : 'barrios'} sin polígono`);
  }
  if (d.zonas_total > 0 && d.zonas_con_poligono === 0) faltantes.push('polígono de la zona');
  if (!catalogos) faltantes.push('catálogos');
  if (!entrable) faltantes.push('usuarios');
  if (d.reclamos === 0) faltantes.push('reclamos');
  if (d.solicitudes === 0) faltantes.push('trámites');
  if (d.noticias === 0) faltantes.push('noticias');

  let nivel: Nivel;
  if (
    !entrable ||
    !catalogos ||
    (d.reclamos === 0 && d.solicitudes === 0) ||
    (!d.con_contorno && d.barrios_con_poligono === 0)
  ) {
    nivel = 'rota';
  } else if (!d.con_contorno || !hayBarrios || pct < UMBRAL_CASI || !operable) {
    nivel = 'a_medias';
  } else if (pct < 100 || d.noticias === 0) {
    nivel = 'casi';
  } else {
    nivel = 'integra';
  }
  return { nivel, faltantes, pct };
}

type Fila = DemoAudit & Evaluacion;

/** Las que la pantalla NO ofrece borrar (el backend las rechaza igual). */
const borrable = (d: DemoAudit) => !d.intocable && !d.de_muestra;

/* Tildes ADITIVAS: cada una es un recorte; se combinan con AND. */
const TILDES: { id: string; label: string; title: string; aplica: (d: Fila) => boolean }[] = [
  { id: 'sin_barrios', label: 'Sin barrios', title: 'Demos sin un solo barrio cargado', aplica: (d) => d.barrios_total === 0 },
  { id: 'sin_contorno', label: 'Sin contorno', title: 'Sin la forma del municipio entero', aplica: (d) => !d.con_contorno },
  {
    id: 'barrios_sin_poligono',
    label: 'Barrios sin polígono',
    title: 'Tienen barrios pero alguno sin su forma dibujada',
    aplica: (d) => d.barrios_total > 0 && d.barrios_con_poligono < d.barrios_total,
  },
  { id: 'sin_datos', label: 'Sin datos vivos', title: 'Sin reclamos o sin trámites sembrados', aplica: (d) => d.reclamos === 0 || d.solicitudes === 0 },
  { id: 'sin_usuarios', label: 'Sin usuarios', title: 'No se puede entrar: ningún perfil', aplica: (d) => d.usuarios === 0 },
  { id: 'con_pin', label: 'Con PIN', title: 'El quick-login pide la clave numérica', aplica: (d) => d.con_pin },
  { id: 'blindadas', label: 'Blindadas', title: 'No se borran desde ningún proceso', aplica: (d) => d.intocable || d.de_muestra },
];

const formatear = (n: number) => n.toLocaleString('es-AR');

export default function DemosListado() {
  const [demos, setDemos] = useState<DemoAudit[]>([]);
  const [catalogo, setCatalogo] = useState<Cobertura[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('todas');
  const [vista, setVista] = useState<ViewKind>('table');
  const [orden, setOrden] = useState('nivel');
  /* País por defecto Argentina (dueño): la cascada país → provincia. */
  const [pais, setPais] = useState(PAIS_DEFAULT);
  const [provincia, setProvincia] = useState(TODOS);
  const [tildes, setTildes] = useState<string[]>([]);

  const cargar = useCallback(() => {
    setLoading(true);
    api.get<Auditoria>('/demos/auditoria')
      .then(({ data }) => {
        setDemos(data.demos ?? []);
        setCatalogo(data.catalogo ?? []);
      })
      .catch(() => {
        setDemos([]);
        setCatalogo([]);
      })
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  /* --- PURGA (dueño, 2026-09-03): borrar una demo o el grupo entero desde
     la pantalla. Las blindadas y la de muestra nunca entran en la lista. --- */
  const [aBorrar, setABorrar] = useState<{ ids: number[]; titulo: string } | null>(null);
  const [purgando, setPurgando] = useState(false);

  const purgar = async () => {
    if (!aBorrar) return;
    setPurgando(true);
    try {
      const { data } = await api.post('/demos/purga', { municipio_ids: aBorrar.ids });
      const borradas = Number(data?.borradas ?? 0);
      const total = Number(data?.total ?? aBorrar.ids.length);
      if (borradas === total) toast.success(`${borradas} ${borradas === 1 ? 'demo eliminada' : 'demos eliminadas'}`);
      else toast.warning(`${borradas} de ${total} eliminadas; el resto quedó protegido`);
      cargar();
    } catch {
      toast.error('No se pudo purgar');
    } finally {
      setPurgando(false);
      setABorrar(null);
    }
  };

  const evaluadas = useMemo<Fila[]>(() => demos.map((d) => ({ ...d, ...evaluar(d) })), [demos]);

  /* Ámbito: país → provincia. Todo lo demás (tildes, tabs, hero, KPIs,
     cobertura del catálogo) se calcula ADENTRO del ámbito. */
  const enAmbito = useMemo(
    () =>
      evaluadas.filter((d) => {
        if (pais !== TODOS && d.pais !== pais) return false;
        if (provincia !== TODOS && (d.provincia ?? '') !== provincia) return false;
        return true;
      }),
    [evaluadas, pais, provincia],
  );

  const conTildes = useMemo(
    () => enAmbito.filter((d) => tildes.every((id) => TILDES.find((t) => t.id === id)?.aplica(d) ?? true)),
    [enAmbito, tildes],
  );

  const ordenadas = useMemo(() => {
    const rango: Record<Nivel, number> = { integra: 0, casi: 1, a_medias: 2, rota: 3 };
    return [...conTildes].sort((a, b) => {
      if (orden === 'barrios') return b.barrios_total - a.barrios_total;
      if (orden === 'poligono') return b.pct - a.pct;
      return rango[a.nivel] - rango[b.nivel] || b.pct - a.pct || a.nombre.localeCompare(b.nombre);
    });
  }, [conTildes, orden]);

  const visibles = useMemo(() => {
    const q = search.trim().toLowerCase();
    return ordenadas.filter((d) => {
      if (tab !== 'todas' && d.nivel !== tab) return false;
      if (!q) return true;
      return d.nombre.toLowerCase().includes(q) || d.codigo.toLowerCase().includes(q);
    });
  }, [ordenadas, search, tab]);

  const porNivel = useMemo(() => {
    const c: Record<Nivel, number> = { integra: 0, casi: 0, a_medias: 0, rota: 0 };
    conTildes.forEach((d) => { c[d.nivel] += 1; });
    return c;
  }, [conTildes]);

  /* Cobertura del CATÁLOGO en el ámbito: cuántos municipios enumera y
     cuántos tienen contorno oficial. El dueño lo quiere acá, por país. */
  const cobertura = useMemo(() => {
    const filas = catalogo.filter(
      (c) => (pais === TODOS || c.pais === pais) && (provincia === TODOS || (c.provincia ?? '') === provincia),
    );
    const total = filas.reduce((n, c) => n + c.total, 0);
    const con = filas.reduce((n, c) => n + c.con_contorno, 0);
    return { total, con, pct: total > 0 ? Math.round((100 * con) / total) : 0 };
  }, [catalogo, pais, provincia]);

  const nombreAmbito =
    pais === TODOS
      ? 'todos los países'
      : provincia === TODOS
        ? (PAIS_LABEL[pais] ?? pais)
        : `${provincia}, ${PAIS_LABEL[pais] ?? pais}`;

  /* --- Filtros: país (default Argentina) → provincia (cascada) --- */
  const paisesPresentes = useMemo(
    () => Array.from(new Set(evaluadas.map((d) => d.pais))).sort((a, b) => (PAIS_LABEL[a] ?? a).localeCompare(PAIS_LABEL[b] ?? b)),
    [evaluadas],
  );
  const provinciasPresentes = useMemo(
    () =>
      Array.from(
        new Set(evaluadas.filter((d) => pais === TODOS || d.pais === pais).map((d) => d.provincia ?? '').filter(Boolean)),
      ).sort((a, b) => a.localeCompare(b)),
    [evaluadas, pais],
  );

  const selects = useMemo<SelectSpec[]>(() => [
    {
      id: 'pais',
      label: 'País',
      value: pais,
      options: [
        { value: TODOS, label: 'Todos los países' },
        ...paisesPresentes.map((p) => ({ value: p, label: PAIS_LABEL[p] ?? p })),
      ],
      onChange: (v: string) => { setPais(v); setProvincia(TODOS); },
    },
    {
      id: 'provincia',
      label: 'Provincia',
      value: provincia,
      options: [
        { value: TODOS, label: 'Todas las provincias' },
        ...provinciasPresentes.map((p) => ({ value: p, label: p })),
      ],
      onChange: setProvincia,
      disabled: pais === TODOS,
      disabledReason: 'Elegí un país para filtrar por provincia',
    },
  ], [pais, provincia, paisesPresentes, provinciasPresentes]);

  const tildesSpec = useMemo(() => ({
    label: 'Sólo',
    opciones: TILDES.map<TildeSpec>((t) => ({
      id: t.id,
      label: t.label,
      title: t.title,
      count: enAmbito.filter(t.aplica).length,
      veredicto: t.id === 'blindadas' || t.id === 'con_pin' ? undefined : 'advertencia',
    })),
    activas: tildes,
    onChange: setTildes,
  }), [enAmbito, tildes]);

  const abrirDemo = (d: Fila) => {
    window.open(`/demo/${d.codigo}/login`, '_blank', 'noopener');
  };

  const heroFrases = useMemo(() => {
    const frases = [] as { segmentos: ReturnType<typeof seg>[] }[];
    if (enAmbito.length === 0) {
      frases.push({ segmentos: [seg(`No hay demos generadas en ${nombreAmbito}.`)] });
    } else {
      const total = porNivel.integra + porNivel.casi + porNivel.a_medias + porNivel.rota;
      frases.push({
        segmentos: [
          seg(`En ${nombreAmbito} hay ${total} ${total === 1 ? 'demo' : 'demos'}: `),
          seg(`${porNivel.integra} íntegras`, porNivel.integra > 0 ? 'bueno' : undefined),
          seg(', '),
          seg(`${porNivel.casi} casi`, porNivel.casi > 0 ? 'bueno' : undefined),
          seg(', '),
          seg(`${porNivel.a_medias} a medias`, porNivel.a_medias > 0 ? 'advertencia' : undefined),
          seg(' y '),
          seg(`${porNivel.rota} rotas`, porNivel.rota > 0 ? 'malo' : undefined),
          seg('.'),
        ],
      });
    }
    if (cobertura.total > 0) {
      frases.push({
        segmentos: [
          seg(`El catálogo enumera ${formatear(cobertura.total)} municipios de ${nombreAmbito}, `),
          seg(
            `${formatear(cobertura.con)} con contorno oficial (${cobertura.pct} %)`,
            cobertura.pct === 100 ? 'bueno' : cobertura.pct >= 85 ? 'advertencia' : 'malo',
          ),
          seg('.'),
        ],
      });
    }
    return frases;
  }, [enAmbito.length, porNivel, cobertura, nombreAmbito]);

  const heroKpis = useMemo(() => ([
    {
      etiqueta: 'Íntegras',
      valor: String(porNivel.integra),
      sub: 'con todo',
      ...(porNivel.integra > 0 ? { veredicto: 'bueno' as const } : {}),
    },
    {
      etiqueta: 'Casi íntegras',
      valor: String(porNivel.casi),
      sub: 'les falta poco',
      ...(porNivel.casi > 0 ? { veredicto: 'bueno' as const } : {}),
    },
    {
      etiqueta: 'A medias',
      valor: String(porNivel.a_medias),
      sub: 'geografía incompleta',
      ...(porNivel.a_medias > 0 ? { veredicto: 'advertencia' as const } : {}),
    },
    {
      etiqueta: 'Rotas',
      valor: String(porNivel.rota),
      sub: porNivel.rota > 0 ? 'no sirven para mostrar' : 'ninguna',
      ...(porNivel.rota > 0 ? { veredicto: 'malo' as const } : {}),
    },
    {
      etiqueta: 'Catálogo con contorno',
      valor: cobertura.total > 0 ? `${cobertura.pct} %` : '—',
      sub: cobertura.total > 0 ? `${formatear(cobertura.con)} de ${formatear(cobertura.total)} municipios` : 'sin catálogo',
      ...(cobertura.total > 0
        ? { veredicto: (cobertura.pct === 100 ? 'bueno' : cobertura.pct >= 85 ? 'advertencia' : 'malo') as 'bueno' | 'advertencia' | 'malo' }
        : {}),
    },
  ]), [porNivel, cobertura]);

  const roles = useMemo<RolesSemanticos<Fila>>(() => ({
    taxonomy: (d) => ({ label: PAIS_LABEL[d.pais] ?? d.pais, icon: 'Landmark' }),
    headline: (d) => d.nombre,
    identity: (d) => `${d.codigo}${d.provincia ? ` · ${d.provincia}` : ''}`,
    description: (d) =>
      `${d.con_contorno ? 'Con contorno' : 'SIN contorno del municipio'}, ` +
      `${d.barrios_total} barrios (${d.barrios_con_poligono} con polígono) y ` +
      `${d.zonas_total} ${d.zonas_total === 1 ? 'zona' : 'zonas'}${d.zonas_con_poligono > 0 ? ' con polígono' : ' sin polígono'}.`,
    badges: (d) => [
      ...(d.intocable ? [{ label: 'Blindada' }] : []),
      ...(d.de_muestra ? [{ label: 'Muestra' }] : []),
      ...(d.con_pin ? [{ label: 'Con PIN' }] : []),
      { label: `${d.categorias_reclamo + d.categorias_tramite} catálogos` },
      ...(d.activo ? [] : [{ label: 'Inactiva' }]),
    ],
    context: (d) => `${d.reclamos} reclamos · ${d.solicitudes} trámites · ${d.noticias} noticias · ${d.usuarios} usuarios`,
    due: (d) =>
      d.faltantes.length > 0
        ? { label: `Falta: ${d.faltantes.slice(0, 3).join(', ')}${d.faltantes.length > 3 ? '…' : ''}`, veredicto: NIVEL_VEREDICTO[d.nivel] }
        : null,
    amount: (d) => `${d.pct} %`,
    /* Sin el % en el label: agruparía por "A medias · 55%" y fragmentaría
       los grupos — el % ya vive en la columna Barrios. */
    state: (d) => ({ label: NIVEL_LABEL[d.nivel], tono: NIVEL_TONO[d.nivel] }),
    verdict: (d) => NIVEL_VEREDICTO[d.nivel],
  }), []);

  const columnas = useMemo<ColumnSpec<Fila>[]>(() => [
    {
      id: 'demo',
      header: 'Demo',
      width: 'minmax(200px, 1.5fr)',
      kind: 'entity',
      cell: (d) => (
        <EntityCell
          icon={undefined}
          title={d.nombre}
          subtitle={`${d.codigo} · ${d.provincia ? `${d.provincia} · ` : ''}${PAIS_LABEL[d.pais] ?? d.pais}`}
        />
      ),
    },
    {
      id: 'marcas',
      header: 'Marcas',
      width: 'minmax(110px, 0.7fr)',
      kind: 'chip',
      cell: (d) => (
        <>
          {d.intocable && <ChipEstado label="Blindada" tone="blue" />}
          {d.de_muestra && <ChipEstado label="Muestra" tone="blue" />}
          {d.con_pin && <ChipEstado label="Con PIN" tone="gray" />}
          {!d.activo && <ChipEstado label="Inactiva" tone="gray" />}
        </>
      ),
    },
    {
      id: 'contorno',
      header: 'Contorno',
      width: 'minmax(100px, 0.6fr)',
      kind: 'chip',
      cell: (d) => (
        <ChipEstado label={d.con_contorno ? 'Dibujado' : 'Falta'} tone={d.con_contorno ? 'green' : 'red'} />
      ),
    },
    {
      id: 'zona',
      header: 'Zona',
      width: 'minmax(110px, 0.7fr)',
      kind: 'metric',
      cell: (d) => (
        <MetricCell
          value={String(d.zonas_total)}
          note={
            d.zonas_total === 0
              ? 'sin zona'
              : d.zonas_total === 1
                ? d.zonas_con_poligono > 0 ? 'con polígono' : 'sin polígono'
                : `${d.zonas_con_poligono} con polígono`
          }
          veredicto={d.zonas_total === 0 || d.zonas_con_poligono === 0 ? 'malo' : d.zonas_con_poligono < d.zonas_total ? 'advertencia' : 'bueno'}
          muted={d.zonas_total === 0}
        />
      ),
    },
    {
      id: 'barrios',
      header: 'Barrios',
      width: 'minmax(130px, 0.9fr)',
      kind: 'metric',
      cell: (d) => (
        <MetricCell
          value={String(d.barrios_total)}
          note={d.barrios_total > 0 ? `${d.barrios_con_poligono} con polígono · ${d.pct} %` : 'sin barrios'}
          veredicto={d.barrios_total === 0 ? 'malo' : d.pct < 100 ? 'advertencia' : 'bueno'}
          muted={d.barrios_total === 0}
        />
      ),
    },
    {
      id: 'catalogos',
      header: 'Catálogos',
      width: 'minmax(120px, 0.8fr)',
      kind: 'text',
      cell: (d) => `${d.categorias_reclamo} reclamo · ${d.categorias_tramite} trámite`,
    },
    {
      id: 'seeds',
      header: 'Datos vivos',
      width: 'minmax(150px, 1fr)',
      kind: 'text',
      cell: (d) => `${d.reclamos} recl · ${d.solicitudes} trám · ${d.noticias} notas · ${d.usuarios} users`,
    },
    {
      id: 'integridad',
      header: 'Integridad',
      width: 'minmax(160px, 1fr)',
      align: 'right',
      kind: 'metric',
      cell: (d) => (
        <MetricCell
          value={NIVEL_LABEL[d.nivel]}
          note={d.faltantes.length > 0 ? `falta ${d.faltantes.slice(0, 2).join(', ')}${d.faltantes.length > 2 ? '…' : ''}` : 'con todo'}
          veredicto={NIVEL_VEREDICTO[d.nivel]}
        />
      ),
    },
  ], []);

  const purgarNivel = useCallback((nivel: Nivel) => {
    const filas = conTildes.filter((d) => d.nivel === nivel && borrable(d));
    if (filas.length === 0) return;
    setABorrar({
      ids: filas.map((d) => d.id),
      titulo: `las ${filas.length} demos "${NIVEL_LABEL[nivel]}"`,
    });
  }, [conTildes]);

  const accionPurgaNivel = useCallback((nivel: Nivel): Action | undefined => {
    const n = conTildes.filter((d) => d.nivel === nivel && borrable(d)).length;
    if (n === 0) return undefined;
    return { label: `Eliminar ${n}`, icon: Trash2, onClick: () => purgarNivel(nivel) };
  }, [conTildes, purgarNivel]);

  const enfoque = useMemo(() => ({
    resumen:
      porNivel.rota + porNivel.a_medias > 0
        ? `${porNivel.rota + porNivel.a_medias} demos piden una mirada`
        : 'todas las demos en orden',
    secciones: [
      {
        id: 'rota',
        titulo: 'Rotas — no sirven para mostrar',
        subtitulo: 'Sin usuarios, sin catálogos, sin reclamos ni trámites, o sin contorno y sin un barrio dibujado',
        icon: AlertTriangle,
        veredicto: 'malo' as const,
        match: (d: Fila) => d.nivel === 'rota',
        ctaLabel: 'Abrir la demo',
        emptyMessage: 'Ninguna demo rota.',
        headerAction: accionPurgaNivel('rota'),
      },
      {
        id: 'a_medias',
        titulo: 'A medias — la geografía no está',
        subtitulo: 'Se entra y se opera, pero falta el contorno, hay pocos barrios con polígono o falta un seed',
        icon: Wrench,
        veredicto: 'advertencia' as const,
        match: (d: Fila) => d.nivel === 'a_medias',
        ctaLabel: 'Abrir la demo',
        headerAction: accionPurgaNivel('a_medias'),
      },
      {
        id: 'casi',
        titulo: 'Casi íntegras — les falta poco',
        subtitulo: 'Contorno y zona dibujados, casi todos los barrios con polígono; a lo sumo faltan noticias',
        icon: ShieldCheck,
        veredicto: 'bueno' as const,
        match: (d: Fila) => d.nivel === 'casi',
        ctaLabel: 'Abrir la demo',
      },
      {
        id: 'integra',
        titulo: 'Íntegras — con todo',
        subtitulo: 'Contorno, zona, todos los barrios con polígono, catálogos y seeds completos',
        icon: CheckCircle2,
        veredicto: 'bueno' as const,
        match: () => true,
        colapsable: true,
      },
    ],
  }), [porNivel.rota, porNivel.a_medias, accionPurgaNivel]);

  const resumenFiltro = `${visibles.length} ${visibles.length === 1 ? 'demo' : 'demos'} · ${nombreAmbito}`;

  return (
    <>
      <SemanticAbmPage<Fila>
        moduleKey="demos-auditoria"
        eyebrow="Demos"
        title="Qué pudo crear bien el generador y qué quedó a medias"
        description="Cada demo con su contorno, sus barrios y polígonos, la zona, los catálogos y los seeds, por país y provincia. El nivel lo decide el eslabón más débil; los criterios están en el código, a la vista."
        hero={{ etiqueta: `DEMOS · ${nombreAmbito.toUpperCase()}`, frases: heroFrases, kpis: heroKpis }}
        pista={{
          titulo: 'Contorno no es lo mismo que polígono',
          texto:
            'El contorno es la forma del municipio entero, una sola por demo. Los polígonos son la forma de cada barrio. Íntegra es la demo que tiene el contorno, la zona dibujada, todos los barrios con polígono, catálogos y datos vivos. Las tildes se combinan: cada una suma un recorte.',
        }}
        searchPlaceholder="Buscar por nombre o código…"
        roles={roles}
        enfoque={enfoque}
        groupBy="state"
        activeView={vista}
        onViewChange={setVista}
        search={search}
        onSearchChange={setSearch}
        selects={selects}
        tildes={tildesSpec}
        sortSpec={{
          opciones: [
            { id: 'nivel', label: 'Nivel' },
            { id: 'barrios', label: 'Barrios' },
            { id: 'poligono', label: '% polígono' },
          ],
          activo: orden,
          onSort: setOrden,
        }}
        statusTabs={[
          { id: 'todas', label: 'Todas', count: conTildes.length },
          ...NIVELES.map((n) => ({ id: n, label: NIVEL_LABEL[n], count: porNivel[n] })),
        ]}
        activeStatus={tab}
        onStatusChange={setTab}
        filterSummary={resumenFiltro}
        kind="plain"
        columns={columnas}
        rows={visibles}
        rowKey={(d) => d.codigo}
        rowActions={[
          { id: 'abrir', label: 'Abrir la demo', icon: ExternalLink, onClick: abrirDemo },
          {
            id: 'del',
            label: 'Eliminar la demo',
            icon: Trash2,
            danger: true,
            visible: borrable,
            onClick: (d: Fila) => setABorrar({ ids: [d.id], titulo: `la demo "${d.nombre}"` }),
          },
        ]}
        groupAction={(g: TableGroup<Fila>) => {
          const borrables = g.rows.filter(borrable);
          return borrables.length > 0
            ? {
                label: `Eliminar estas ${borrables.length}`,
                icon: Trash2,
                onClick: () =>
                  setABorrar({
                    ids: borrables.map((d) => d.id),
                    titulo: `las ${borrables.length} demos "${g.title ?? g.key}"`,
                  }),
              }
            : null;
        }}
        onRowClick={abrirDemo}
        loading={loading}
        emptyMessage={
          search.trim() || tildes.length > 0
            ? 'Ninguna demo coincide con la búsqueda y las tildes.'
            : `No hay demos generadas en ${nombreAmbito}.`
        }
        footer={{ showing: `Mostrando ${visibles.length} de ${enAmbito.length} en ${nombreAmbito}` }}
      />

      <ConfirmModal
        isOpen={aBorrar !== null}
        onClose={() => setABorrar(null)}
        onConfirm={purgar}
        title="Eliminar demos"
        message={
          aBorrar
            ? `Se ${aBorrar.ids.length === 1 ? 'elimina' : 'eliminan'} ${aBorrar.titulo} con TODOS sus datos (borrado guiado por el esquema, sin vuelta atrás). Las blindadas, la de muestra y los municipios con usuarios reales quedan protegidos por el backend.${purgando ? ' Purgando…' : ''}`
            : ''
        }
      />
    </>
  );
}
