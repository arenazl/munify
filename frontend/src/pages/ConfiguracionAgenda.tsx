/**
 * Horarios (configuración de agenda de turnos) — alineada al lenguaje v2 del kit.
 *
 * ORIGEN DEL DISEÑO: `design/handoff-v2/references/horarios-canvas.dc.html`
 * (canónico, bajado del proyecto de Claude Design). Estructura que manda:
 *
 *   hero semántico (eyebrow HORARIOS · <OFICINA> + veredicto + strip de KPIs
 *                   + acciones)
 *   H1 "Horarios" · select Oficina · [Copiar lunes a hábiles] [Guardar cambios]
 *   tabla semanal   DÍA | DESDE | a | HASTA | CUPO | (derivado, a la derecha)
 *                   pie: nota del horario por defecto + "Total semanal"
 *   panel "Feriados y aperturas especiales" (título + conteo + Agregar excepción)
 *                   filas: insignia de fecha + título/motivo + chip + quitar
 *
 * OJO — el canvas contradice a `STANDARD-Cuando-hero-semantico.md` §3, que
 * ubicaba Horarios en el grupo "sin hero". Manda el canvas (es posterior y es
 * la fuente de verdad de esta pantalla), así que el hero VA.
 *
 * Referencias de implementación: pages/Reclamos.tsx (composición manual de las
 * piezas abmv2) y pages/GestionTramites.tsx (sheet con customHeader `rs-*`).
 *
 * DESVIACIONES CONSCIENTES respecto del canvas, todas anotadas donde ocurren:
 *  1. Los KPIs "CUPOS OFRECIDOS" y "DEMANDA" NO se pintan: el primero exige la
 *     duración del turno, que en este producto es POR TRÁMITE
 *     (`tramite.duracion_turno_min`, fallback 30 — ver
 *     backend/services/turnos_agenda.py) y no viaja en `/agenda-config`; el
 *     segundo necesita una métrica de pedidos que esta pantalla no consulta.
 *     La regla de datos del estándar (§4) prohíbe rellenarlos con un número
 *     inventado, así que se reemplazan por dos KPIs que SÍ salen de la
 *     pantalla (cupo por turno y fechas especiales).
 *  2. Por lo mismo, la última columna y el total del pie hablan de HORAS de
 *     atención en vez de "24 cupos" / "60 cupos".
 *  3. El `ListToolbar` del kit siempre renderiza su buscador y no se puede
 *     apagar por props (y no se tocan componentes compartidos). El canvas no
 *     lo tiene; acá queda, filtrando las fechas especiales.
 *  4. El H1 "Horarios" va en el `PageHeader` (arriba del hero), que es su lugar
 *     desde la v2.2 del kit; el canvas todavía lo dibuja dentro de la fila de
 *     controles, como en la v2.1.
 *  5. "Copiar a otra dependencia" (3ra acción del hero del canvas) no existe en
 *     el backend: no se pinta un botón muerto.
 */
import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CalendarPlus, Copy, Save, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { agendaApi, dependenciasApi } from '../lib/api';
// Suite del estándar SemanticAbmPage (rediseño v2). Composición manual de las
// piezas —igual que Reclamos— porque el orquestador `SemanticAbmPage` asume UNA
// grilla por pantalla y acá hay dos superficies distintas (semana + fechas).
import { PageHeader } from '../components/abmv2/PageHeader';
import { ListToolbar } from '../components/abmv2/ListToolbar';
import { FilterBar } from '../components/abmv2/FilterBar';
import { DataTable, Insignia } from '../components/abmv2/DataTable';
import type { ChipTone, ColumnSpec } from '../components/abmv2/types';
import { SemanticHero } from '../components/ui/SemanticHero';
import { seg, type HeroFrase, type HeroKpi } from '../lib/semanticHero';
import { ModernSelect, type SelectOption } from '../components/ui/ModernSelect';
import { DatePicker } from '../components/ui/DatePicker';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { Sheet } from '../components/ui/Sheet';
import { ToggleSwitch } from '../components/ui/SectionHeader';

interface DepItem {
  id: number;
  nombre?: string;
}

interface DiaConfig {
  dia_semana: number;
  hora_inicio: string;
  hora_fin: string;
  cupo_max_por_slot: number;
  activo: boolean;
}

interface Excepcion {
  id: number;
  fecha: string;
  tipo: string;
  motivo: string | null;
}

/** Fila de fecha especial ya formateada (la página formatea, la vista pinta). */
interface FeriadoVista {
  id: number;
  fechaIso: string;
  dia: string;
  mes: string;
  titulo: string;
  motivo: string;
  chip: { label: string; tone: ChipTone };
  futura: boolean;
  esCierre: boolean;
}

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

/** Tipos de excepción: label del chip, tono y copy del alta, en un solo lugar. */
const TIPOS_EXCEPCION: Record<string, { label: string; chip: string; tone: ChipTone; exito: string }> = {
  cierre: { label: 'Cierre / Feriado', chip: 'Cierre', tone: 'red', exito: 'Feriado agregado' },
  apertura_especial: {
    label: 'Apertura especial',
    chip: 'Apertura',
    tone: 'green',
    exito: 'Apertura especial agregada',
  },
};
const tipoInfo = (tipo: string) =>
  TIPOS_EXCEPCION[tipo] || { label: tipo, chip: tipo, tone: 'gray' as ChipTone, exito: 'Fecha agregada' };

function defaultDias(): DiaConfig[] {
  return DIAS.map((_, i) => ({
    dia_semana: i,
    hora_inicio: '08:30',
    hora_fin: '13:00',
    cupo_max_por_slot: 1,
    activo: i <= 4,
  }));
}

function hhmm(t: string): string {
  return (t || '').slice(0, 5);
}

/* ------------------------------------------------------------------
 * Grilla horaria de los combos de franja.
 *
 * Reemplaza a los `<input type="time">` nativos (rompen el theme y cada
 * navegador dibuja su propio reloj). Paso de 15 minutos entre las 05:00 y las
 * 23:00 — cubre cualquier horario de atención municipal. Si la oficina tiene
 * guardada una hora fuera de la grilla (dato viejo, p. ej. 07:47) se INYECTA
 * como opción, así el valor se ve y no se pierde al guardar.
 * ------------------------------------------------------------------ */
const PASO_MINUTOS = 15;
const HORAS_GRILLA: string[] = (() => {
  const out: string[] = [];
  for (let m = 5 * 60; m <= 23 * 60; m += PASO_MINUTOS) {
    out.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
  }
  return out;
})();
const OPCIONES_HORA: SelectOption[] = HORAS_GRILLA.map((h) => ({ value: h, label: h }));

const opcionesHora = (valor: string): SelectOption[] =>
  !valor || HORAS_GRILLA.includes(valor)
    ? OPCIONES_HORA
    : [...OPCIONES_HORA, { value: valor, label: valor }].sort((a, b) => a.value.localeCompare(b.value));

const enMinutos = (t: string): number => {
  const [h, m] = (t || '').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

const duracionDia = (d: DiaConfig): number => Math.max(0, enMinutos(d.hora_fin) - enMinutos(d.hora_inicio));

/** "7 h 30" · "4 h" · "45 min" · "—". Minutos reales, sin redondeos inventados. */
const formatearDuracion = (min: number): string => {
  if (min <= 0) return '—';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m}` : `${h} h`;
};

/** Fecha ISO a Date sin corrimiento de día (el mediodía evita el shift UTC). */
const fechaLocal = (iso: string): Date => new Date(`${iso}T12:00:00`);

/** "lunes a viernes" si los días abiertos son contiguos; si no, la lista corta. */
const rangoDeDias = (activos: DiaConfig[]): string => {
  if (!activos.length) return 'ningún día abierto';
  const idx = activos.map((d) => d.dia_semana).sort((a, b) => a - b);
  const contiguos = idx.every((n, i) => i === 0 || n === idx[i - 1] + 1);
  const nombre = (n: number) => DIAS[n].toLowerCase();
  if (idx.length === 1) return nombre(idx[0]);
  if (contiguos) return `${nombre(idx[0])} a ${nombre(idx[idx.length - 1])}`;
  return idx.map((n) => nombre(n).slice(0, 3)).join(' · ');
};

/* Inputs sin componente propio en el kit (el cupo es un entero chico). Cero
   hex: todos los valores salen de tokens --pl-*. */
const ESTILO_CUPO: CSSProperties = {
  width: 46,
  height: 32,
  textAlign: 'center',
  background: 'var(--pl-surface)',
  border: '1px solid var(--pl-border-strong)',
  borderRadius: 9,
  color: 'var(--pl-text)',
  fontFamily: 'inherit',
  fontSize: 13,
  fontWeight: 600,
  fontVariantNumeric: 'tabular-nums',
};

const ESTILO_INPUT_TEXTO: CSSProperties = {
  width: '100%',
  minWidth: 0,
  height: 32,
  padding: '0 10px',
  background: 'var(--pl-surface)',
  border: '1px solid var(--pl-border-strong)',
  borderRadius: 'var(--pl-radius-md)',
  color: 'var(--pl-text)',
  fontFamily: 'inherit',
  fontSize: 'var(--pl-fs-body-sm)',
};

export default function ConfiguracionAgenda() {
  const [searchParams] = useSearchParams();
  const [deps, setDeps] = useState<DepItem[]>([]);
  const [depId, setDepId] = useState('');
  const [dias, setDias] = useState<DiaConfig[]>(defaultDias());
  const [excepciones, setExcepciones] = useState<Excepcion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [nuevaFecha, setNuevaFecha] = useState('');
  const [nuevoTipo, setNuevoTipo] = useState('cierre');
  const [nuevoMotivo, setNuevoMotivo] = useState('');
  const [agregando, setAgregando] = useState(false);
  const [search, setSearch] = useState('');
  // Borrado con confirmación (antes se ejecutaba de una, sin red de seguridad).
  const [aBorrar, setABorrar] = useState<FeriadoVista | null>(null);
  const [borrando, setBorrando] = useState(false);

  useEffect(() => {
    dependenciasApi
      .getMunicipio({ activo: true })
      .then((res) => {
        const list = (res.data as DepItem[]) || [];
        setDeps(list);
        const desdeUrl = searchParams.get('dependencia_id');
        if (desdeUrl && list.some((d) => String(d.id) === desdeUrl)) {
          setDepId(desdeUrl);
        } else if (list.length) {
          setDepId(String(list[0].id));
        } else {
          setCargando(false);
        }
      })
      .catch(() => {
        setCargando(false);
        toast.error('No se pudieron cargar las dependencias');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (depId) cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depId]);

  const cargar = async () => {
    try {
      setCargando(true);
      const [cfg, exc] = await Promise.all([
        agendaApi.getConfig(Number(depId)),
        agendaApi.getExcepciones(Number(depId)),
      ]);
      const filas = (cfg.data as DiaConfig[]) || [];
      const base = defaultDias();
      if (filas.length) {
        const byDia = new Map(filas.map((f) => [f.dia_semana, f]));
        base.forEach((d, i) => {
          const f = byDia.get(d.dia_semana);
          if (f) {
            base[i] = {
              dia_semana: d.dia_semana,
              hora_inicio: hhmm(f.hora_inicio),
              hora_fin: hhmm(f.hora_fin),
              cupo_max_por_slot: f.cupo_max_por_slot || 1,
              activo: true,
            };
          } else {
            base[i] = { ...d, activo: false };
          }
        });
      }
      setDias(base);
      setExcepciones((exc.data as Excepcion[]) || []);
    } catch {
      toast.error('No se pudo cargar la configuración');
    } finally {
      setCargando(false);
    }
  };

  /* Se identifica el día por `dia_semana`, no por su posición en el array: si
     mañana el backend devuelve las filas en otro orden, la edición sigue
     cayendo en el día correcto (antes se editaba por índice). */
  const setDia = (diaSemana: number, patch: Partial<DiaConfig>) => {
    setDias((prev) => prev.map((d) => (d.dia_semana === diaSemana ? { ...d, ...patch } : d)));
  };

  const copiarLunesAHabiles = () => {
    const lunes = dias.find((d) => d.dia_semana === 0);
    if (!lunes) return;
    setDias((prev) =>
      prev.map((d) =>
        d.dia_semana >= 1 && d.dia_semana <= 4
          ? {
              ...d,
              hora_inicio: lunes.hora_inicio,
              hora_fin: lunes.hora_fin,
              cupo_max_por_slot: lunes.cupo_max_por_slot,
              activo: true,
            }
          : d,
      ),
    );
    toast.success('Horario de Lunes copiado a Martes–Viernes');
  };

  const guardar = async () => {
    try {
      setGuardando(true);
      const activos = dias.filter((d) => d.activo);
      for (const d of activos) {
        if (d.hora_inicio >= d.hora_fin) {
          toast.error(`${DIAS[d.dia_semana]}: la hora de inicio debe ser menor a la de fin`);
          setGuardando(false);
          return;
        }
      }
      await agendaApi.saveConfig(Number(depId), activos);
      toast.success('Horarios guardados');
    } catch {
      toast.error('No se pudo guardar');
    } finally {
      setGuardando(false);
    }
  };

  const abrirAlta = () => {
    setNuevaFecha('');
    setNuevoTipo('cierre');
    setNuevoMotivo('');
    setSheetOpen(true);
  };

  const agregarExcepcion = async () => {
    if (!nuevaFecha) {
      toast.error('Elegí una fecha');
      return;
    }
    try {
      setAgregando(true);
      await agendaApi.crearExcepcion({
        municipio_dependencia_id: Number(depId),
        fecha: nuevaFecha,
        tipo: nuevoTipo,
        motivo: nuevoMotivo || undefined,
      });
      toast.success(tipoInfo(nuevoTipo).exito);
      setSheetOpen(false);
      setNuevaFecha('');
      setNuevoMotivo('');
      cargar();
    } catch {
      toast.error('No se pudo agregar');
    } finally {
      setAgregando(false);
    }
  };

  const borrarExcepcion = async () => {
    if (!aBorrar) return;
    try {
      setBorrando(true);
      await agendaApi.borrarExcepcion(aBorrar.id);
      toast.success('Eliminado');
      setABorrar(null);
      cargar();
    } catch {
      toast.error('No se pudo borrar');
    } finally {
      setBorrando(false);
    }
  };

  /* --------------------------------------------------------------
   * Derivados — TODO sale de la data real de la pantalla
   * -------------------------------------------------------------- */

  const depOptions = useMemo(
    () => deps.map((d) => ({ value: String(d.id), label: d.nombre || `Dependencia ${d.id}` })),
    [deps],
  );

  const nombreOficina = useMemo(
    () => deps.find((d) => String(d.id) === depId)?.nombre || 'la oficina',
    [deps, depId],
  );

  const diasAbiertos = useMemo(() => dias.filter((d) => d.activo), [dias]);
  const minutosSemana = diasAbiertos.reduce((acc, d) => acc + duracionDia(d), 0);

  /** Franja común a todos los días abiertos, si la hay ("14:00 a 17:00"). */
  const franjaUniforme = useMemo(() => {
    if (!diasAbiertos.length) return null;
    const { hora_inicio, hora_fin } = diasAbiertos[0];
    return diasAbiertos.every((d) => d.hora_inicio === hora_inicio && d.hora_fin === hora_fin)
      ? `${hora_inicio} a ${hora_fin}`
      : null;
  }, [diasAbiertos]);

  /** Cupo común a todos los días abiertos, si lo hay. */
  const cupoUniforme = useMemo(() => {
    if (!diasAbiertos.length) return null;
    const c = diasAbiertos[0].cupo_max_por_slot;
    return diasAbiertos.every((d) => d.cupo_max_por_slot === c) ? c : null;
  }, [diasAbiertos]);

  /** Buscador: filtra las fechas especiales por motivo o fecha. */
  const feriados: FeriadoVista[] = useMemo(() => {
    const hoy = new Date().toISOString().slice(0, 10);
    const s = search.trim().toLowerCase();
    return excepciones
      .filter((e) => !s || (e.motivo || '').toLowerCase().includes(s) || e.fecha.includes(s))
      .sort((a, b) => a.fecha.localeCompare(b.fecha))
      .map((e) => {
        const d = fechaLocal(e.fecha);
        const info = tipoInfo(e.tipo);
        const titulo = d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
        return {
          id: e.id,
          fechaIso: e.fecha,
          dia: String(d.getDate()).padStart(2, '0'),
          mes: d.toLocaleDateString('es-AR', { month: 'short' }).replace('.', ''),
          titulo: titulo.charAt(0).toUpperCase() + titulo.slice(1),
          motivo: e.motivo || '',
          chip: { label: info.chip, tone: info.tone },
          futura: e.fecha >= hoy,
          esCierre: e.tipo === 'cierre',
        };
      });
  }, [excepciones, search]);

  /** Próximo cierre a futuro: el dato accionable del strip y de la frase. */
  const proximoCierre = useMemo(
    () => feriados.find((f) => f.futura && f.esCierre) || null,
    [feriados],
  );

  const fechaCorta = (iso: string) =>
    fechaLocal(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'numeric' });

  /* --------------------------------------------------------------
   * Hero semántico — frase + strip, con los números de esta pantalla
   * -------------------------------------------------------------- */

  const heroKpis: HeroKpi[] = [
    {
      etiqueta: 'DÍAS ABIERTOS',
      valor: diasAbiertos.length,
      sub: rangoDeDias(diasAbiertos),
      veredicto: diasAbiertos.length ? undefined : 'malo',
    },
    {
      etiqueta: 'HORAS SEMANALES',
      valor: formatearDuracion(minutosSemana),
      sub: franjaUniforme ? `${franjaUniforme} todos los días` : 'franjas distintas por día',
    },
    {
      etiqueta: 'CUPO POR TURNO',
      valor: cupoUniforme ?? '—',
      sub: cupoUniforme ? 'turnos en simultáneo' : 'varía según el día',
    },
    {
      etiqueta: 'FECHAS ESPECIALES',
      valor: excepciones.length,
      sub: proximoCierre
        ? `próximo cierre ${fechaCorta(proximoCierre.fechaIso)}`
        : 'sin cierres a futuro',
      veredicto: proximoCierre ? 'advertencia' : undefined,
    },
  ];

  const heroFrases: HeroFrase[] = useMemo(() => {
    const acciones = [
      ...(depId
        ? [{ label: 'Ver la agenda', to: `/gestion/agenda-turnos?dependencia_id=${depId}`, primaria: true }]
        : []),
      { label: 'Agregar excepción', onClick: abrirAlta },
    ];
    if (!diasAbiertos.length) {
      return [
        {
          segmentos: [
            seg('Esta oficina '),
            seg('no tiene ningún día abierto', 'malo'),
            seg(': la agenda cae al horario por defecto del municipio (lunes a viernes de 08:30 a 13:00). Encendé los días que atiende para que los turnos salgan de acá.'),
          ],
          acciones,
        },
      ];
    }
    return [
      {
        segmentos: [
          seg('Esta oficina atiende '),
          seg(`${formatearDuracion(minutosSemana)} por semana`, 'bueno'),
          seg(' repartidas en '),
          seg(`${diasAbiertos.length} ${diasAbiertos.length === 1 ? 'día' : 'días'}`),
          seg(cupoUniforme ? `, con ${cupoUniforme} ${cupoUniforme === 1 ? 'turno' : 'turnos'} en simultáneo por franja.` : ', con un cupo por turno distinto según el día.'),
          ...(proximoCierre
            ? [
                seg(' El '),
                seg(fechaCorta(proximoCierre.fechaIso), 'advertencia'),
                seg(` no se dan turnos${proximoCierre.motivo ? `: ${proximoCierre.motivo}` : ''}.`),
              ]
            : []),
        ],
        acciones,
      },
    ];
  }, [depId, diasAbiertos, minutosSemana, cupoUniforme, proximoCierre]);

  /* --------------------------------------------------------------
   * Columnas de la grilla semanal (espejo del canvas)
   * -------------------------------------------------------------- */

  const columnasSemana: ColumnSpec<DiaConfig>[] = [
    {
      id: 'dia',
      header: 'Día',
      width: 'minmax(120px, 150px)',
      cell: (d) => (
        <span className="av2-entidad">
          <ToggleSwitch checked={d.activo} onChange={(v) => setDia(d.dia_semana, { activo: v })} />
          <span className={d.activo ? 'av2-entidad-titulo' : 'av2-tabla-texto'}>{DIAS[d.dia_semana]}</span>
        </span>
      ),
    },
    {
      id: 'desde',
      header: 'Desde',
      width: 'minmax(104px, 1fr)',
      cell: (d) => (
        <ModernSelect
          variant="v2"
          value={d.hora_inicio}
          onChange={(v) => setDia(d.dia_semana, { hora_inicio: v })}
          options={opcionesHora(d.hora_inicio)}
          disabled={!d.activo}
          searchable
          placeholder="Desde"
        />
      ),
    },
    {
      // Columna separadora del canvas: la "a" entre los dos horarios.
      id: 'sep',
      header: '',
      width: '22px',
      align: 'center',
      cell: () => <span className="av2-tabla-texto">a</span>,
    },
    {
      id: 'hasta',
      header: 'Hasta',
      width: 'minmax(104px, 1fr)',
      cell: (d) => (
        <ModernSelect
          variant="v2"
          value={d.hora_fin}
          onChange={(v) => setDia(d.dia_semana, { hora_fin: v })}
          options={opcionesHora(d.hora_fin)}
          disabled={!d.activo}
          searchable
          placeholder="Hasta"
        />
      ),
    },
    {
      id: 'cupo',
      header: 'Cupo',
      width: 'minmax(150px, 168px)',
      cell: (d) => (
        <span className="flex items-center gap-2 min-w-0">
          <span className="av2-tabla-texto">Cupo por turno</span>
          <input
            type="number"
            min={1}
            value={d.cupo_max_por_slot}
            disabled={!d.activo}
            aria-label={`Cupo por turno de ${DIAS[d.dia_semana]}`}
            onChange={(e) =>
              setDia(d.dia_semana, { cupo_max_por_slot: Math.max(1, Number(e.target.value) || 1) })
            }
            style={ESTILO_CUPO}
          />
        </span>
      ),
    },
    {
      /* En el canvas esta columna dice "24 cupos". El total de cupos exige la
         duración del turno, que es por TRÁMITE y no viaja en /agenda-config
         (ver cabecera del archivo): se muestra la duración real de la franja,
         que sí es un dato de esta pantalla. */
      id: 'atencion',
      header: 'Atención',
      width: 'minmax(90px, 120px)',
      align: 'right',
      cell: (d) => (
        <span className="av2-tabla-fecha av2-tnum">
          {d.activo ? formatearDuracion(duracionDia(d)) : 'Cerrado'}
        </span>
      ),
    },
  ];

  /* --------------------------------------------------------------
   * Sheet de alta — header propio con el lenguaje `rs-*` del kit
   * -------------------------------------------------------------- */

  const headerSheet = (
    <div className="rs-head">
      <div className="rs-head-fila">
        <span className="rs-eyebrow">Agenda · {nombreOficina}</span>
        <span className="rs-head-icos">
          <button
            type="button"
            className="rs-ico-btn"
            title="Cerrar"
            aria-label="Cerrar"
            onClick={() => setSheetOpen(false)}
          >
            <X className="h-4 w-4" />
          </button>
        </span>
      </div>
      <h2 className="rs-titulo">Nueva excepción</h2>
      {/* `rs-parrafo` y no `rs-meta`: la meta del sheet fuerza `nowrap` en sus
          spans (está pensada para chips cortos) y una frase larga se saldría
          del ancho del drawer. */}
      <p className="rs-parrafo">
        Un cierre saca los turnos de ese día; una apertura especial los habilita fuera del horario semanal.
      </p>
    </div>
  );

  const footerSheet = (
    <button
      type="button"
      className="rs-cta w-full justify-center"
      onClick={agregarExcepcion}
      disabled={agregando || !nuevaFecha}
      title={!nuevaFecha ? 'Falta elegir la fecha' : undefined}
    >
      <CalendarPlus className="h-4 w-4" />
      {agregando ? 'Agregando…' : 'Agregar la fecha'}
    </button>
  );

  return (
    <div className="av2-page" data-module="horarios">
      {/* 1. Cabecera de módulo (v2.2: el H1 vive acá, arriba del hero). */}
      <PageHeader
        eyebrow="Trámites"
        title="Horarios"
        description="Días y franjas de atención, cupo por turno y fechas especiales de cada oficina. Lo que se guarda acá es lo que la agenda ofrece al vecino."
      />

      {/* 2. Hero semántico: la lectura del horario de la oficina elegida, con
          el strip de KPIs adentro (nada de tarjetas de KPI sueltas). */}
      <div className="av2-hero-wrap">
        <SemanticHero
          etiqueta={depId ? `HORARIOS · ${nombreOficina.toUpperCase()}` : 'HORARIOS'}
          frases={heroFrases}
          kpis={heroKpis}
          className="av2-hero"
        />
      </div>

      {/* 3+4. Toolbar y filtros: UNA sola tarjeta partida por una línea. */}
      <div className="av2-controles">
        <ListToolbar
          searchPlaceholder="Buscar fecha especial por motivo o fecha…"
          search={search}
          onSearchChange={setSearch}
          views={['table']}
          activeView="table"
          onViewChange={() => {}}
          secondaryAction={{
            label: 'Copiar lunes a hábiles',
            icon: Copy,
            onClick: copiarLunesAHabiles,
            disabled: !depId,
            disabledReason: 'Elegí primero la oficina',
          }}
          primaryAction={{
            label: guardando ? 'Guardando…' : 'Guardar cambios',
            icon: Save,
            onClick: guardar,
            disabled: guardando || !depId,
            disabledReason: 'Elegí primero la oficina',
          }}
        />

        <FilterBar
          selects={[
            {
              id: 'dependencia',
              label: 'Oficina',
              value: depId,
              options: depOptions,
              onChange: setDepId,
            },
          ]}
          statusTabs={[]}
          activeStatus=""
          onStatusChange={() => {}}
        />
      </div>

      {/* 5. Grilla semanal */}
      <DataTable<DiaConfig>
        kind="plain"
        columns={columnasSemana}
        rows={dias}
        rowKey={(d) => d.dia_semana}
        rowActions={[]}
        loading={cargando}
        tableMinWidth={860}
        footer={{
          showing: 'Sin configurar, se usa el horario por defecto del municipio (lun–vie 08:30–13:00).',
          total: { label: 'Total semanal', value: formatearDuracion(minutosSemana) },
        }}
      />

      {/* 6. Feriados y aperturas especiales */}
      <section className="av2-panel mt-3">
        <div className="av2-panel-head flex-wrap">
          <h2 className="av2-panel-titulo min-w-0">Feriados y aperturas especiales</h2>
          <span className="av2-chip-estado av2-chip-estado--gray av2-tnum">{excepciones.length}</span>
          <button
            type="button"
            className="av2-btn-secundario ml-auto"
            onClick={abrirAlta}
            disabled={!depId}
            title={!depId ? 'Elegí primero la oficina' : undefined}
          >
            <CalendarPlus size={14} strokeWidth={2} aria-hidden />
            Agregar excepción
          </button>
        </div>

        {feriados.length === 0 ? (
          <div className="av2-panel-vacio">
            {search
              ? 'Ninguna fecha especial coincide con la búsqueda.'
              : 'Sin feriados ni aperturas especiales cargados para esta oficina. Los días de la grilla de arriba valen todo el año.'}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {feriados.map((f) => (
              <div
                key={f.id}
                className="flex items-center gap-3 px-3 py-2.5 rounded-[10px] min-w-0"
                /* Tinte por tipo: tokens semánticos del theme, cero hex. */
                style={{ background: f.esCierre ? 'var(--pl-red-100)' : 'var(--pl-green-100)' }}
              >
                <Insignia top={f.dia} bottom={f.mes} />
                <span className="flex-1 min-w-0">
                  <span className="av2-entidad-titulo">{f.titulo}</span>
                  <span className="av2-tabla-texto">{f.motivo || 'Sin motivo cargado'}</span>
                </span>
                <span className={`av2-chip-estado av2-chip-estado--${f.chip.tone}`}>{f.chip.label}</span>
                <button
                  type="button"
                  className="av2-tabla-accion av2-tabla-accion--peligro"
                  title="Quitar"
                  aria-label={`Quitar ${f.chip.label.toLowerCase()} del ${f.titulo}`}
                  onClick={() => setABorrar(f)}
                >
                  <Trash2 size={16} strokeWidth={1.8} />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Alta de excepción — drawer del kit con header propio `rs-*`. */}
      <Sheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Nueva excepción"
        description={`Agenda de ${nombreOficina}`}
        customHeader={headerSheet}
        stickyFooter={footerSheet}
      >
        <div className="av2-form-grid">
          <div className="av2-field av2-field--full">
            <span className="av2-field-label">
              Fecha
              <span className="av2-field-req" aria-hidden>
                *
              </span>
            </span>
            <DatePicker value={nuevaFecha} onChange={setNuevaFecha} placeholder="Elegí el día" allowClear />
          </div>

          <div className="av2-field av2-field--full">
            <span className="av2-field-label">Tipo</span>
            <ModernSelect
              variant="v2"
              value={nuevoTipo}
              onChange={setNuevoTipo}
              options={Object.entries(TIPOS_EXCEPCION).map(([value, info]) => ({
                value,
                label: info.label,
              }))}
            />
          </div>

          <div className="av2-field av2-field--full">
            <span className="av2-field-label">Motivo</span>
            <input
              type="text"
              value={nuevoMotivo}
              onChange={(e) => setNuevoMotivo(e.target.value)}
              placeholder="Feriado nacional, receso administrativo…"
              aria-label="Motivo de la fecha especial"
              style={ESTILO_INPUT_TEXTO}
            />
            <p className="av2-field-ayuda">Opcional. Se muestra en la agenda del día.</p>
          </div>
        </div>
      </Sheet>

      {/* Borrado con confirmación (antes se ejecutaba de una). */}
      <ConfirmModal
        isOpen={!!aBorrar}
        onClose={() => setABorrar(null)}
        onConfirm={borrarExcepcion}
        title="Quitar la fecha especial"
        message={
          aBorrar
            ? `Se va a quitar la excepción del ${aBorrar.titulo} (${aBorrar.chip.label}${aBorrar.motivo ? ` · ${aBorrar.motivo}` : ''}). Ese día vuelve a regirse por el horario semanal.`
            : ''
        }
        confirmText="Quitar"
        variant="danger"
        loading={borrando}
      />
    </div>
  );
}
