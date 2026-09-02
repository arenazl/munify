/**
 * PRESENTISMO — módulo Recursos, Etapa 2.
 *
 * UNA pantalla con dos caras, según quién entra:
 *  - **El empleado** ve un botón grande para fichar y cómo viene su día. Está
 *    en la calle, con el celular en la mano: no le podemos pedir que elija
 *    entre "entrada" y "salida" ni que interprete una tabla.
 *  - **El gestor** ve el mes entero: quién faltó, quién tiene licencia y
 *    quién dejó una jornada abierta. Es lo que mira antes de liquidar.
 *
 * Dos pantallas separadas serían el mismo dato dos veces. El rol decide qué
 * cara se dibuja, no una ruta distinta.
 *
 * Ver docs/recursos/01-modulo-recursos.md
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, LogIn, LogOut, UserCheck } from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { SemanticAbmPage } from '../components/abmv2/SemanticAbmPage';
import { EntityCell, ChipEstado } from '../components/abmv2/DataTable';
import { MetricCell } from '../components/abmv2/Controls';
import type { ColumnSpec } from '../components/abmv2/types';
import { seg } from '../lib/semanticHero';
import { presentismoApi } from '../lib/api';

interface FilaPresentismo {
  empleado_id: number;
  nombre: string;
  esperadas: number;
  justificadas: number;
  trabajadas: number;
  faltas: number;
  abiertas: number;
  porcentaje: number | null;
}

interface MiJornada {
  fecha: string;
  entrada_at: string | null;
  salida_at: string | null;
  abierta: boolean;
}

const hora = (iso: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** La ubicación es opcional a propósito: si el navegador la niega o tarda, se
 *  ficha igual. Un fichaje que no se puede hacer porque falla el GPS es peor
 *  que un fichaje sin coordenada. */
function pedirUbicacion(): Promise<{ lat?: number; lng?: number }> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve({});
    const listo = setTimeout(() => resolve({}), 4000);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(listo);
        resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => {
        clearTimeout(listo);
        resolve({});
      },
      { timeout: 4000, maximumAge: 60000 },
    );
  });
}

// ============================================================
// La cara del EMPLEADO: un botón y su día
// ============================================================

function FichajeDelDia() {
  const { theme } = useTheme();
  const [jornada, setJornada] = useState<MiJornada | null>(null);
  const [cargando, setCargando] = useState(true);
  const [fichando, setFichando] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const { data } = await presentismoApi.miJornada();
      setJornada((data as MiJornada) || null);
    } catch {
      setJornada(null);
    } finally {
      setCargando(false);
    }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const fichar = async () => {
    setFichando(true);
    try {
      const coords = await pedirUbicacion();
      const { data } = await presentismoApi.fichar(coords);
      const j = data as MiJornada;
      setJornada(j);
      toast.success(j.abierta ? `Entrada registrada a las ${hora(j.entrada_at)}` : `Salida registrada a las ${hora(j.salida_at)}`);
    } catch (e) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(msg || 'No se pudo fichar');
    } finally {
      setFichando(false);
    }
  };

  const cerrado = jornada !== null && !jornada.abierta && jornada.salida_at !== null;
  const abierta = jornada?.abierta ?? false;

  if (cargando) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: theme.primary }} />
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-4 py-8 grid gap-5">
      <div className="text-center">
        <h1 className="text-2xl font-bold" style={{ color: theme.text }}>Tu jornada</h1>
        <p className="text-sm mt-1" style={{ color: theme.textSecondary }}>
          {cerrado ? 'Ya cerraste el día. Buen trabajo.'
            : abierta ? 'Estás trabajando. Cuando termines, cerrá la jornada.'
            : 'Todavía no fichaste hoy.'}
        </p>
      </div>

      {/* El botón es el 80% de la pantalla: es lo único que el empleado
          necesita hacer acá, y lo hace con una mano, en la calle. */}
      <button
        type="button"
        onClick={fichar}
        disabled={fichando || cerrado}
        className="w-full rounded-3xl py-10 flex flex-col items-center gap-3 transition-transform active:scale-[0.98] disabled:opacity-60"
        style={{
          backgroundColor: cerrado ? theme.backgroundSecondary : theme.primary,
          color: cerrado ? theme.textSecondary : 'var(--pl-on-accent)',
        }}
      >
        {fichando ? <Loader2 className="h-9 w-9 animate-spin" />
          : abierta ? <LogOut className="h-9 w-9" />
          : <LogIn className="h-9 w-9" />}
        <span className="text-lg font-bold">
          {fichando ? 'Registrando...' : cerrado ? 'Jornada cerrada' : abierta ? 'Cerrar la jornada' : 'Comenzar la jornada'}
        </span>
      </button>

      {jornada && (
        <div
          className="rounded-2xl p-4 grid grid-cols-2 gap-3"
          style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
        >
          <div>
            <p className="text-[11px] uppercase tracking-wider font-semibold" style={{ color: theme.textSecondary }}>
              Entrada
            </p>
            <p className="text-xl font-bold mt-0.5" style={{ color: theme.text }}>
              {hora(jornada.entrada_at) || '—'}
            </p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wider font-semibold" style={{ color: theme.textSecondary }}>
              Salida
            </p>
            <p className="text-xl font-bold mt-0.5" style={{ color: theme.text }}>
              {hora(jornada.salida_at) || '—'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// La cara del GESTOR: el mes, antes de liquidar
// ============================================================

export default function Presentismo() {
  const { user } = useAuth();
  const [filas, setFilas] = useState<FilaPresentismo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('todos');

  const esGestor = user?.rol === 'admin' || user?.rol === 'supervisor';

  useEffect(() => {
    if (!esGestor) { setLoading(false); return; }
    (async () => {
      try {
        const { data } = await presentismoApi.mes();
        setFilas((data as FilaPresentismo[]) || []);
      } catch {
        toast.error('No se pudo cargar el presentismo');
      } finally {
        setLoading(false);
      }
    })();
  }, [esGestor]);

  const conFaltas = useMemo(() => filas.filter((f) => f.faltas > 0), [filas]);
  const conAbiertas = useMemo(() => filas.filter((f) => f.abiertas > 0), [filas]);
  const sinHorario = useMemo(() => filas.filter((f) => f.porcentaje === null), [filas]);

  const visibles = useMemo(() => {
    const s = search.trim().toLowerCase();
    return filas.filter((f) => {
      if (tab === 'faltas' && f.faltas === 0) return false;
      if (tab === 'abiertas' && f.abiertas === 0) return false;
      if (tab === 'sin-horario' && f.porcentaje !== null) return false;
      return !s || f.nombre.toLowerCase().includes(s);
    });
  }, [filas, search, tab]);

  const heroFrases = useMemo(() => {
    if (filas.length === 0) {
      return [{ segmentos: [seg('Todavía no hay empleados cargados en el municipio.')] }];
    }
    if (conFaltas.length > 0) {
      return [{ segmentos: [
        seg(`${conFaltas.length} ${conFaltas.length === 1 ? 'empleado tiene faltas' : 'empleados tienen faltas'} este mes`, 'malo'),
        seg('sin justificar.'),
      ] }];
    }
    if (sinHorario.length === filas.length) {
      return [{ segmentos: [
        seg('Ningún empleado tiene horario cargado:'),
        seg('sin saber qué días debe venir, no se puede medir el presentismo.', 'advertencia'),
      ] }];
    }
    return [{ segmentos: [
      seg('Nadie faltó sin aviso este mes.', 'bueno'),
      seg('El presentismo se puede liquidar tal cual.'),
    ] }];
  }, [filas.length, conFaltas.length, sinHorario.length]);

  const heroKpis = useMemo(() => ([
    { etiqueta: 'Empleados', valor: String(filas.length) },
    { etiqueta: 'Con faltas', valor: String(conFaltas.length) },
    { etiqueta: 'Jornadas abiertas', valor: String(conAbiertas.reduce((s, f) => s + f.abiertas, 0)) },
    { etiqueta: 'Sin horario', valor: String(sinHorario.length) },
  ]), [filas.length, conFaltas.length, conAbiertas, sinHorario.length]);

  const columnas = useMemo<ColumnSpec<FilaPresentismo>[]>(() => [
    {
      id: 'empleado',
      header: 'Empleado',
      width: 'minmax(180px, 1.6fr)',
      kind: 'entity',
      cell: (f) => <EntityCell icon={UserCheck} title={f.nombre} />,
    },
    {
      id: 'presentismo',
      header: 'Presentismo',
      width: 'minmax(130px, 1fr)',
      align: 'right',
      kind: 'metric',
      cell: (f) => (
        <MetricCell
          value={f.porcentaje !== null ? `${f.porcentaje}%` : '—'}
          note={f.porcentaje !== null
            ? `${f.trabajadas} de ${f.esperadas - f.justificadas}`
            : 'sin horario cargado'}
          veredicto={f.porcentaje === null ? undefined
            : f.porcentaje >= 95 ? 'bueno'
            : f.porcentaje >= 80 ? 'advertencia' : 'malo'}
        />
      ),
    },
    {
      id: 'faltas',
      header: 'Faltas',
      width: 'minmax(90px, 0.6fr)',
      align: 'right',
      kind: 'text',
      cell: (f) => (f.faltas > 0 ? String(f.faltas) : '—'),
    },
    {
      id: 'licencia',
      header: 'Con aviso',
      width: 'minmax(100px, 0.7fr)',
      align: 'right',
      kind: 'text',
      cell: (f) => (f.justificadas > 0 ? `${f.justificadas} días` : '—'),
    },
    {
      id: 'estado',
      header: 'Estado',
      width: 'minmax(130px, 0.9fr)',
      kind: 'chip',
      cell: (f) => {
        if (f.porcentaje === null) return <ChipEstado label="Sin horario" tone="gray" />;
        if (f.abiertas > 0) return <ChipEstado label={`${f.abiertas} sin cerrar`} tone="amber" />;
        if (f.faltas > 0) return <ChipEstado label={`${f.faltas} sin aviso`} tone="red" />;
        return <ChipEstado label="Al día" tone="green" />;
      },
    },
  ], []);

  // El empleado no ve la tabla del municipio: ve su propio día.
  if (!esGestor) return <FichajeDelDia />;

  return (
    <SemanticAbmPage<FilaPresentismo>
      moduleKey="presentismo"
      eyebrow="Recursos"
      title="Presentismo"
      description="Quién vino, quién avisó y quién no — el mes en curso."
      hero={{ etiqueta: 'RECURSOS · PRESENTISMO', frases: heroFrases, kpis: heroKpis }}
      pista={{
        titulo: 'El número sale de tres fuentes',
        texto:
          'Lo que el empleado debía trabajar (su horario), lo que estaba justificado que no trabajara (sus licencias) y lo que fichó desde el celular. Sin horario cargado no hay porcentaje: no se puede medir contra algo que no está definido.',
      }}
      searchPlaceholder="Buscar empleado…"
      views={['table']}
      activeView="table"
      onViewChange={() => {}}
      search={search}
      onSearchChange={setSearch}
      selects={[]}
      statusTabs={[
        { id: 'todos', label: 'Todos', count: filas.length },
        { id: 'faltas', label: 'Con faltas', count: conFaltas.length },
        { id: 'abiertas', label: 'Sin cerrar', count: conAbiertas.length },
        { id: 'sin-horario', label: 'Sin horario', count: sinHorario.length },
      ]}
      activeStatus={tab}
      onStatusChange={setTab}
      kind="plain"
      columns={columnas}
      rows={visibles}
      rowKey={(f) => f.empleado_id}
      // Sin acciones por fila: esta pantalla se MIRA antes de liquidar. Editar
      // una jornada ajena es otra cosa y va con su propio permiso.
      rowActions={[]}
      loading={loading}
      emptyMessage={
        search.trim()
          ? `Ningún empleado coincide con "${search.trim()}".`
          : 'Todavía no hay empleados con jornadas registradas este mes.'
      }
      footer={{
        showing: `Mostrando ${visibles.length} de ${filas.length}`,
        note: 'Los días que todavía no llegaron no cuentan como falta. Las licencias aprobadas se descuentan de lo esperado.',
      }}
    />
  );
}
