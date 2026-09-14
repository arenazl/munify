/**
 * Horarios — la pantalla OPERATIVA del horario de la gente, sobre el kit v3.
 *
 * Por qué existe (dueño, 2026-09-14): sin horario asignado no hay vara contra
 * la cual medir la asistencia, así que Presentismo no puede afirmar nada. La
 * carga del horario ya existía, pero enterrada en el Sheet de la ficha de
 * `Empleados.tsx` (Configuración → Usuarios y Empleados): para cargarlo había
 * que adivinar dónde estaba.
 *
 * No duplica esa ficha ni la reemplaza: la nota de `navigation.ts` deja los
 * ABM de ficha fuera del sidebar y manda lo OPERACIONAL a su propia pantalla.
 * Esto es lo operacional — quién tiene horario, quién no, y asignarlo en lote,
 * que es el caso real de un municipio chico (media planta con el mismo turno).
 *
 * Backend: ya existía, no se agregó nada — `empleadosGestionApi.getHorarios`
 * y `setHorariosSemana` (tabla `empleado_horarios`, día 0=lunes a 6=domingo).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Users } from 'lucide-react';
import SemanticAbmPage from '../components/abmv2/SemanticAbmPage';
import SideModal from '../components/abmv2/SideModal';
import type { ColumnSpec, RolesSemanticos, StatusTab, ViewKind } from '../components/abmv2/types';
import { seg, type Veredicto } from '../lib/semanticHero';
import { useTheme } from '../contexts/ThemeContext';
import { empleadosApi, empleadosGestionApi } from '../lib/api';

const DIAS = [
  { value: 0, label: 'Lunes', short: 'L' },
  { value: 1, label: 'Martes', short: 'M' },
  { value: 2, label: 'Miércoles', short: 'X' },
  { value: 3, label: 'Jueves', short: 'J' },
  { value: 4, label: 'Viernes', short: 'V' },
  { value: 5, label: 'Sábado', short: 'S' },
  { value: 6, label: 'Domingo', short: 'D' },
];

type Dia = { activo: boolean; hora_entrada: string; hora_salida: string };
type Semana = Record<number, Dia>;

interface Persona {
  id: number;
  nombre: string;
  puesto: string;
  semana: Semana;
  diasActivos: number;
  horasSemana: number;
  tieneHorario: boolean;
  resumen: string;
}

const semanaVacia = (): Semana => {
  const s: Semana = {};
  DIAS.forEach((d) => { s[d.value] = { activo: false, hora_entrada: '08:00', hora_salida: '14:00' }; });
  return s;
};

const semanaEstandar = (): Semana => {
  const s = semanaVacia();
  DIAS.forEach((d) => { if (d.value < 5) s[d.value] = { activo: true, hora_entrada: '07:00', hora_salida: '13:00' }; });
  return s;
};

/** Horas de un tramo, tolerando que la salida sea del día siguiente (turno noche). */
const horasDe = (entrada: string, salida: string): number => {
  const [he, me] = entrada.split(':').map(Number);
  const [hs, ms] = salida.split(':').map(Number);
  if ([he, me, hs, ms].some((n) => Number.isNaN(n))) return 0;
  let min = (hs * 60 + ms) - (he * 60 + me);
  if (min < 0) min += 24 * 60;
  return min / 60;
};

const horasSemanales = (s: Semana): number =>
  DIAS.reduce((a, d) => a + (s[d.value]?.activo ? horasDe(s[d.value].hora_entrada, s[d.value].hora_salida) : 0), 0);

/** "Lunes a viernes de 07:00 a 13:00" cuando todos los días activos comparten tramo. */
const describir = (s: Semana): string => {
  const activos = DIAS.filter((d) => s[d.value]?.activo);
  if (!activos.length) return 'sin horario cargado';
  const tramos = new Set(activos.map((d) => `${s[d.value].hora_entrada}-${s[d.value].hora_salida}`));
  const dias = activos.length === 5 && activos.every((d) => d.value < 5)
    ? 'Lunes a viernes'
    : activos.map((d) => d.short).join(' ');
  if (tramos.size === 1) {
    const { hora_entrada, hora_salida } = s[activos[0].value];
    return `${dias} de ${hora_entrada} a ${hora_salida}`;
  }
  return `${dias} · horarios distintos por día`;
};

export default function Horarios() {
  const { theme } = useTheme();
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'todos' | 'sin' | 'con'>('todos');
  const [search, setSearch] = useState('');
  const [vista, setVista] = useState<ViewKind>('table');
  const [editando, setEditando] = useState<Persona | null>(null);
  const [semanaEdit, setSemanaEdit] = useState<Semana>(semanaVacia);
  const [lote, setLote] = useState(false);
  const [semanaLote, setSemanaLote] = useState<Semana>(semanaEstandar);
  const [elegidos, setElegidos] = useState<number[]>([]);
  const [guardando, setGuardando] = useState(false);

  const inputStyle = useMemo(() => ({
    backgroundColor: theme.backgroundSecondary,
    border: `1px solid ${theme.border}`,
    color: theme.text,
  }), [theme]);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const [emps, hors] = await Promise.all([
        empleadosApi.getAll(true),
        empleadosGestionApi.getHorarios({}),
      ]);
      const porEmpleado = new Map<number, Semana>();
      (hors.data ?? []).forEach((h: { empleado_id: number; dia_semana: number; hora_entrada: string; hora_salida: string; activo?: boolean }) => {
        if (!porEmpleado.has(h.empleado_id)) porEmpleado.set(h.empleado_id, semanaVacia());
        const s = porEmpleado.get(h.empleado_id)!;
        s[h.dia_semana] = {
          activo: h.activo !== false,
          hora_entrada: (h.hora_entrada ?? '08:00').slice(0, 5),
          hora_salida: (h.hora_salida ?? '14:00').slice(0, 5),
        };
      });
      const lista: Persona[] = (emps.data ?? []).map((e: Record<string, unknown>) => {
        const id = Number(e.id);
        const semana = porEmpleado.get(id) ?? semanaVacia();
        const diasActivos = DIAS.filter((d) => semana[d.value]?.activo).length;
        return {
          id,
          nombre: [e.apellido, e.nombre].filter(Boolean).join(', ') || String(e.nombre ?? `Empleado ${id}`),
          puesto: String(e.puesto ?? e.especialidad ?? e.tipo ?? '—'),
          semana,
          diasActivos,
          horasSemana: horasSemanales(semana),
          tieneHorario: diasActivos > 0,
          resumen: describir(semana),
        };
      });
      lista.sort((a, b) => Number(a.tieneHorario) - Number(b.tieneHorario) || a.nombre.localeCompare(b.nombre));
      setPersonas(lista);
    } catch {
      toast.error('No se pudieron cargar los horarios');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);

  const sinHorario = personas.filter((p) => !p.tieneHorario).length;
  const conHorario = personas.length - sinHorario;
  const horasComprometidas = personas.reduce((a, p) => a + p.horasSemana, 0);
  const trabajanFinde = personas.filter((p) => p.semana[5]?.activo || p.semana[6]?.activo).length;
  const jornadaComun = useMemo(() => {
    const cuenta = new Map<string, number>();
    personas.filter((p) => p.tieneHorario).forEach((p) => cuenta.set(p.resumen, (cuenta.get(p.resumen) ?? 0) + 1));
    const top = [...cuenta.entries()].sort((a, b) => b[1] - a[1])[0];
    return top ? { texto: top[0], n: top[1] } : null;
  }, [personas]);

  const frases = useMemo(() => {
    if (loading) return [{ segmentos: [seg('Cargando…')] }];
    if (!personas.length) return [{ segmentos: [seg('Todavía no hay personal cargado. Se carga desde Configuración → Usuarios y Empleados.')] }];
    const v: Veredicto = sinHorario > 0 ? 'malo' : 'bueno';
    const texto = sinHorario > 0
      ? `${sinHorario} de ${personas.length} personas no tienen horario cargado: a ellas el presentismo no les puede exigir nada. Las otras ${conHorario} suman ${Math.round(horasComprometidas)} horas por semana.`
      : `Las ${personas.length} personas tienen su horario cargado, ${Math.round(horasComprometidas)} horas por semana en total. El presentismo ya puede medir contra algo.`;
    return [{ segmentos: [seg(texto, v)] }];
  }, [loading, personas, sinHorario, conHorario, horasComprometidas]);

  const heroKpis = useMemo(() => [
    { etiqueta: 'Sin horario', valor: String(sinHorario), sub: sinHorario ? 'no se les puede medir asistencia' : 'todos tienen el suyo', veredicto: (sinHorario ? 'malo' : 'bueno') as Veredicto },
    { etiqueta: 'Con horario', valor: String(conHorario), sub: `de ${personas.length} personas` },
    { etiqueta: 'Horas por semana', valor: String(Math.round(horasComprometidas)), sub: 'comprometidas por el plantel' },
    { etiqueta: 'Trabajan fin de semana', valor: String(trabajanFinde), sub: trabajanFinde ? 'sábado o domingo' : 'ninguno' },
    { etiqueta: 'Jornada más común', valor: jornadaComun ? String(jornadaComun.n) : '—', sub: jornadaComun ? jornadaComun.texto : 'sin horarios cargados' },
  ], [sinHorario, conHorario, personas.length, horasComprometidas, trabajanFinde, jornadaComun]);

  const statusTabs: StatusTab[] = [
    { id: 'todos', label: 'Todos', count: personas.length },
    { id: 'sin', label: 'Sin horario', count: sinHorario },
    { id: 'con', label: 'Con horario', count: conHorario },
  ];

  const items = useMemo(() => {
    const q = search.trim().toLowerCase();
    return personas.filter((p) =>
      (tab === 'todos' || (tab === 'sin' ? !p.tieneHorario : p.tieneHorario)) &&
      (!q || p.nombre.toLowerCase().includes(q) || p.puesto.toLowerCase().includes(q)));
  }, [personas, tab, search]);

  const tiraSemana = useCallback((p: Persona) => (
    <div style={{ display: 'flex', gap: 4 }}>
      {DIAS.map((d) => {
        const on = p.semana[d.value]?.activo;
        return (
          <span
            key={d.value}
            title={on ? `${d.label} de ${p.semana[d.value].hora_entrada} a ${p.semana[d.value].hora_salida}` : `${d.label}: no trabaja`}
            style={{
              width: 22, height: 22, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 700,
              background: on ? 'var(--pl-green)' : 'transparent',
              color: on ? 'var(--pl-on-brand)' : 'var(--pl-text-muted)',
              border: on ? 'none' : `1px dashed ${theme.border}`,
            }}
          >{d.short}</span>
        );
      })}
    </div>
  ), [theme.border]);

  const columns: ColumnSpec<Persona>[] = useMemo(() => [
    { id: 'nombre', header: 'Persona', width: '1.6fr', cell: (p) => (
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 600 }}>{p.nombre}</div>
        <div style={{ fontSize: 'var(--pl-fs-caption)', color: 'var(--pl-text-muted)' }}>{p.puesto}</div>
      </div>
    ) },
    { id: 'semana', header: 'Su semana', width: '1fr', cell: tiraSemana },
    { id: 'resumen', header: 'Horario', width: '1.6fr', cell: (p) => (
      <span className={p.tieneHorario ? undefined : 'av2-vered-malo'}>{p.resumen}</span>
    ) },
    { id: 'horas', header: 'Horas', width: '0.6fr', align: 'right', cell: (p) => (
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{p.tieneHorario ? `${Math.round(p.horasSemana)} h` : '—'}</span>
    ) },
  ], [tiraSemana]);

  const roles: RolesSemanticos<Persona> = useMemo(() => ({
    identity: (p) => p.puesto,
    headline: (p) => p.nombre,
    description: (p) => p.resumen,
    context: (p) => p.tieneHorario ? `${p.diasActivos} días por semana` : 'nadie le cargó el horario',
    priority: (p) => p.tieneHorario ? { label: `${Math.round(p.horasSemana)} h por semana` } : null,
    state: (p) => ({ label: p.tieneHorario ? 'con horario' : 'sin horario', tono: (p.tieneHorario ? 'bueno' : 'malo') as Veredicto }),
    verdict: (p) => (p.tieneHorario ? 'bueno' : 'malo') as Veredicto,
    badges: () => [],
  }), []);

  const abrirEdicion = (p: Persona) => { setEditando(p); setSemanaEdit(JSON.parse(JSON.stringify(p.semana))); };

  const guardarUno = async () => {
    if (!editando) return;
    setGuardando(true);
    try {
      await empleadosGestionApi.setHorariosSemana(editando.id, DIAS.map((d) => ({
        empleado_id: editando.id,
        dia_semana: d.value,
        hora_entrada: semanaEdit[d.value].hora_entrada,
        hora_salida: semanaEdit[d.value].hora_salida,
        activo: semanaEdit[d.value].activo,
      })));
      toast.success(`Horario de ${editando.nombre} guardado`);
      setEditando(null);
      await cargar();
    } catch {
      toast.error('No se pudo guardar el horario');
    } finally {
      setGuardando(false);
    }
  };

  const guardarLote = async () => {
    if (!elegidos.length) { toast.error('Elegí al menos una persona'); return; }
    setGuardando(true);
    try {
      for (const id of elegidos) {
        await empleadosGestionApi.setHorariosSemana(id, DIAS.map((d) => ({
          empleado_id: id,
          dia_semana: d.value,
          hora_entrada: semanaLote[d.value].hora_entrada,
          hora_salida: semanaLote[d.value].hora_salida,
          activo: semanaLote[d.value].activo,
        })));
      }
      toast.success(`Horario aplicado a ${elegidos.length} persona${elegidos.length === 1 ? '' : 's'}`);
      setLote(false);
      setElegidos([]);
      await cargar();
    } catch {
      toast.error('No se pudo aplicar el horario en lote');
    } finally {
      setGuardando(false);
    }
  };

  /** Editor de una semana: un renglón por día, con su tramo. */
  const editorSemana = (semana: Semana, set: (s: Semana) => void) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {DIAS.map((d) => {
        const dia = semana[d.value];
        return (
          <div key={d.value} style={{ display: 'grid', gridTemplateColumns: '26px 96px 1fr 1fr', gap: 10, alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={dia.activo}
              aria-label={`Trabaja ${d.label}`}
              onChange={(e) => set({ ...semana, [d.value]: { ...dia, activo: e.target.checked } })}
            />
            <span style={{ fontSize: 'var(--pl-fs-body)', fontWeight: dia.activo ? 600 : 400, color: dia.activo ? undefined : 'var(--pl-text-muted)' }}>{d.label}</span>
            <input
              type="time" value={dia.hora_entrada} disabled={!dia.activo}
              onChange={(e) => set({ ...semana, [d.value]: { ...dia, hora_entrada: e.target.value } })}
              className="w-full px-3 py-2 rounded-xl text-sm" style={{ ...inputStyle, opacity: dia.activo ? 1 : 0.5 }}
            />
            <input
              type="time" value={dia.hora_salida} disabled={!dia.activo}
              onChange={(e) => set({ ...semana, [d.value]: { ...dia, hora_salida: e.target.value } })}
              className="w-full px-3 py-2 rounded-xl text-sm" style={{ ...inputStyle, opacity: dia.activo ? 1 : 0.5 }}
            />
          </div>
        );
      })}
      <div style={{ fontSize: 'var(--pl-fs-caption)', color: 'var(--pl-text-muted)' }}>
        {describir(semana)} · {Math.round(horasSemanales(semana))} horas por semana
      </div>
    </div>
  );

  return (
    <>
      <SemanticAbmPage<Persona>
        moduleKey="presentismo"
        eyebrow="Recursos · Personal"
        title="Horarios"
        description="El horario de cada persona es la vara del presentismo: sin esto, la asistencia no se puede medir contra nada."
        hero={{ etiqueta: 'HORARIO DEL PLANTEL', frases, kpis: heroKpis }}
        accentColor={sinHorario > 0 ? 'var(--pl-red)' : undefined}
        searchPlaceholder="Buscar por nombre o puesto…"
        views={['table', 'cards']}
        primaryAction={{ label: 'Asignar en lote', icon: Users, onClick: () => { setElegidos(personas.filter((p) => !p.tieneHorario).map((p) => p.id)); setLote(true); } }}
        statusTabs={statusTabs}
        activeStatus={tab}
        onStatusChange={(id) => setTab(id as 'todos' | 'sin' | 'con')}
        kind="plain"
        columns={columns}
        roles={roles}
        groupBy="none"
        rows={items}
        rowKey={(p) => p.id}
        rowActions={[]}
        onRowClick={abrirEdicion}
        loading={loading}
        emptyMessage={tab === 'sin' ? 'Todas las personas tienen su horario cargado.' : 'No hay personal cargado. Se carga desde Configuración → Usuarios y Empleados.'}
        footer={{ showing: `${items.length} de ${personas.length} personas` }}
        search={search}
        onSearchChange={setSearch}
        activeView={vista}
        onViewChange={setVista}
      />

      {editando && (
        <SideModal
          mode="edit"
          width={480}
          open
          onClose={() => setEditando(null)}
          header={{
            title: editando.nombre,
            metaTop: editando.puesto,
            metaBottom: 'Los días destildados son días que no trabaja. El presentismo no le exige nada esos días.',
          }}
          sections={[{ id: 'semana', label: 'Su semana', content: editorSemana(semanaEdit, setSemanaEdit) }]}
          footer={{
            primary: { label: guardando ? 'Guardando…' : 'Guardar horario', onClick: () => { void guardarUno(); }, disabled: guardando },
            secondary: [{ label: 'Cancelar', onClick: () => setEditando(null) }],
          }}
        />
      )}

      {lote && (
        <SideModal
          mode="edit"
          width={560}
          open
          onClose={() => setLote(false)}
          header={{
            title: 'Asignar el mismo horario a varias personas',
            metaTop: 'Definí la semana una vez y elegí a quiénes se la aplicás',
            metaBottom: `${elegidos.length} persona${elegidos.length === 1 ? '' : 's'} seleccionada${elegidos.length === 1 ? '' : 's'} · pisa el horario que tuvieran cargado`,
          }}
          sections={[
            { id: 'semana', label: 'La jornada', content: editorSemana(semanaLote, setSemanaLote) },
            { id: 'quienes', label: 'A quiénes', content: (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                  <button type="button" className="av2-btn-secundario" onClick={() => setElegidos(personas.map((p) => p.id))}>Todos</button>
                  <button type="button" className="av2-btn-secundario" onClick={() => setElegidos(personas.filter((p) => !p.tieneHorario).map((p) => p.id))}>Sólo los que no tienen</button>
                  <button type="button" className="av2-btn-secundario" onClick={() => setElegidos([])}>Ninguno</button>
                </div>
                {personas.map((p) => (
                  <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={elegidos.includes(p.id)}
                      onChange={(e) => setElegidos(e.target.checked ? [...elegidos, p.id] : elegidos.filter((x) => x !== p.id))}
                    />
                    <span style={{ fontSize: 'var(--pl-fs-body)', fontWeight: 600 }}>{p.nombre}</span>
                    <span style={{ fontSize: 'var(--pl-fs-caption)', color: p.tieneHorario ? 'var(--pl-text-muted)' : 'var(--pl-red)' }}>
                      {p.tieneHorario ? p.resumen : 'sin horario'}
                    </span>
                  </label>
                ))}
              </div>
            ) },
          ]}
          footer={{
            primary: { label: guardando ? 'Aplicando…' : `Aplicar a ${elegidos.length}`, onClick: () => { void guardarLote(); }, disabled: guardando || !elegidos.length },
            secondary: [{ label: 'Cancelar', onClick: () => setLote(false) }],
          }}
        />
      )}
    </>
  );
}
