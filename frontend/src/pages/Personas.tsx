/**
 * Personas — la libreta única de la app (kit v3, `SemanticAbmPage`).
 *
 * Reemplaza a tres listados de gente que mostraban poblaciones distintas:
 * Contactos de Tesorería, Empleados y la lista de Sueldos. Una persona es una
 * sola fila con uno o varios TIPOS (empleado, proveedor, contratista...) y,
 * si es empleado, su ficha laboral; si tiene acceso, su login.
 *
 * Plan: docs/tesoreria/04-plan-integral-persona-y-obras.md (F1) y 05 (subtipos).
 * La ficha se abre en `SideModal` y muestra SÓLO las secciones que la persona tiene.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Pencil, UserPlus, Wallet } from 'lucide-react';
import SemanticAbmPage from '../components/abmv2/SemanticAbmPage';
import { EntityCell, DotCell } from '../components/abmv2/DataTable';
import { SideModal, SideModalField } from '../components/abmv2/SideModal';
import { TildesAditivas } from '../components/abmv2/TildesAditivas';
import { SelectorAdaptativo } from '../components/abmv2/SelectorAdaptativo';
import type { ColumnSpec, RolesSemanticos, StatusTab, ViewKind } from '../components/abmv2/types';
import { seg } from '../lib/semanticHero';
import type { Veredicto } from '../lib/semanticHero';
import { personasApi } from '../lib/api';

/* ---------- tipos que devuelve /api/personas ---------- */

export interface PersonaRol { tipo_id: number; codigo: string; nombre: string; padre_codigo?: string | null; principal: boolean }
export interface PersonaTipo {
  id: number; codigo: string; nombre: string; color?: string | null; activo: boolean; cobra: boolean;
  padre_id?: number | null; cantidad: number; subtipos: PersonaTipo[];
}
export interface PersonaResumen {
  id: number; nombre: string; apellido?: string | null; nombre_completo: string;
  dni?: string | null; cuit?: string | null; telefono?: string | null; email?: string | null;
  tipo_legacy: string; roles: PersonaRol[]; tiene_ficha_laboral: boolean; tiene_login: boolean; activo: boolean;
}
export interface PersonaFicha extends PersonaResumen {
  direccion?: string | null; alias_pago?: string | null; cuit?: string | null; condicion_iva?: string | null; notas?: string | null;
  laboral?: { empleado_id: number; modalidad?: string | null; dependencia?: string | null; zona?: string | null; cuadrillas: string[]; activo: boolean } | null;
  economica?: { gastos: number; total_gastos: string; pagos_programados_activos: number; ultimo_pago?: string | null } | null;
  acceso?: { usuario_id: number; email?: string | null; rol: string; activo: boolean } | null;
}
interface Listado {
  items: PersonaResumen[]; total: number; page: number; page_size: number;
  total_personas: number; cobran_este_mes: number; trabajan: number; sin_documento: number; sin_tipo: number;
}

const MODALIDADES = [
  { value: 'planta', label: 'Planta' },
  { value: 'a_prueba', label: 'A prueba' },
  { value: 'contratado', label: 'Contratado' },
  { value: 'jornalizado', label: 'Jornalizado' },
  { value: 'jubilado', label: 'Jubilado' },
];
const MODALIDAD_LABEL: Record<string, string> = Object.fromEntries(MODALIDADES.map((m) => [m.value, m.label]));

// Tonos por tipo raíz: señalan, no gritan. Van por token del tema, nunca hex.
const TONO_TIPO: Record<string, string> = {
  empleado: 'var(--pl-green)',
  proveedor: 'var(--pl-blue, #3b82f6)',
  contratista: 'var(--pl-teal, #0d9488)',
  profesional: 'var(--pl-amber-strong)',
  concejal: 'var(--pl-purple, #7c3aed)',
  beneficiario: 'var(--pl-pink, #db2777)',
  otro: 'var(--pl-text-muted)',
};

const fmtMoney = (v: string | number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(Number(v));

type Form = {
  nombre: string; apellido: string; dni: string; cuit: string; telefono: string; email: string;
  direccion: string; alias_pago: string; notas: string; tipo_ids: number[]; modalidad: string;
};
const FORM_VACIO: Form = {
  nombre: '', apellido: '', dni: '', cuit: '', telefono: '', email: '', direccion: '', alias_pago: '', notas: '',
  tipo_ids: [], modalidad: '',
};

/** Iniciales para el avatar de `EntityCell`: primera de nombre y de apellido. */
const iniciales = (nombre: string): string =>
  nombre.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';

export default function Personas() {
  const [tipos, setTipos] = useState<PersonaTipo[]>([]);
  const [datos, setDatos] = useState<Listado | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('todos');
  const [vista, setVista] = useState<ViewKind>('table');
  const [page, setPage] = useState(1);

  const [abierta, setAbierta] = useState<PersonaFicha | null>(null);
  const [modo, setModo] = useState<'detail' | 'edit' | 'create'>('detail');
  const [form, setForm] = useState<Form>(FORM_VACIO);
  const [guardando, setGuardando] = useState(false);

  const cargarTipos = useCallback(async () => {
    const r = await personasApi.tipos(true);
    setTipos(r.data);
  }, []);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const r = await personasApi.list({
        q: search.trim() || undefined,
        tipo: tab === 'todos' ? undefined : tab,
        page,
        page_size: 100,
      });
      setDatos(r.data);
    } catch {
      toast.error('No se pudo cargar el padrón');
    } finally {
      setLoading(false);
    }
  }, [search, tab, page]);

  useEffect(() => { void cargarTipos(); }, [cargarTipos]);
  useEffect(() => { const t = setTimeout(() => { void cargar(); }, 250); return () => clearTimeout(t); }, [cargar]);
  useEffect(() => { setPage(1); }, [search, tab]);

  /* ---------- hero: la frase la arma el algoritmo con los cinco números ---------- */
  const kpis = datos;
  const frases = useMemo(() => {
    if (!kpis) return [{ segmentos: [seg('Cargando el padrón…')] }];
    if (kpis.total_personas === 0) {
      return [{ segmentos: [seg('Todavía no hay personas cargadas:'), seg('todo lo que se paga o trabaja va a necesitar una.', 'advertencia')] }];
    }
    const partes = [seg(`${kpis.total_personas.toLocaleString('es-AR')} personas en la libreta;`)];
    if (kpis.sin_tipo > 0) partes.push(seg(`${kpis.sin_tipo} sin decir qué son`, 'advertencia'), seg('(tipo "otro").'));
    else partes.push(seg('todas con su tipo.', 'bueno'));
    if (kpis.sin_documento > 0) partes.push(seg(`${kpis.sin_documento} sin documento, que es lo que impide detectar repetidas.`));
    return [{ segmentos: partes }];
  }, [kpis]);

  const heroKpis = useMemo(() => kpis ? [
    { etiqueta: 'Personas', valor: kpis.total_personas.toLocaleString('es-AR'), sub: 'en la libreta' },
    { etiqueta: 'Cobran este mes', valor: String(kpis.cobran_este_mes), sub: 'con pago programado' },
    { etiqueta: 'Trabajan', valor: String(kpis.trabajan), sub: 'con ficha laboral' },
    { etiqueta: 'Sin documento', valor: String(kpis.sin_documento), sub: 'ni DNI ni CUIT', veredicto: kpis.sin_documento > 0 ? ('advertencia' as const) : undefined },
    { etiqueta: 'Sin tipo', valor: String(kpis.sin_tipo), sub: kpis.sin_tipo > 0 ? 'para curar' : 'nada pendiente', veredicto: kpis.sin_tipo > 0 ? ('advertencia' as const) : ('bueno' as const) },
  ] : [], [kpis]);

  /* ---------- filtros: el tipo como solapa, el subtipo como píldora ---------- */
  const statusTabs: StatusTab[] = useMemo(() => [
    { id: 'todos', label: 'Todas', count: datos?.total_personas },
    ...tipos.map((t) => ({ id: t.codigo, label: t.nombre, count: t.cantidad })),
  ], [tipos, datos?.total_personas]);

  const tipoActivo = tipos.find((t) => t.codigo === tab);
  const selects = useMemo(() => tipoActivo && tipoActivo.subtipos.length > 0 ? [{
    id: 'subtipo',
    label: `Subtipo de ${tipoActivo.nombre.toLowerCase()}`,
    value: tab,
    options: [{ value: tipoActivo.codigo, label: 'Todos' }, ...tipoActivo.subtipos.map((s) => ({ value: s.codigo, label: `${s.nombre} (${s.cantidad})` }))],
    onChange: (v: string) => setTab(v),
  }] : [], [tipoActivo, tab]);

  /* ---------- roles semánticos: tarjetas y tabla salen de acá ---------- */
  const roles: RolesSemanticos<PersonaResumen> = useMemo(() => ({
    identity: (p) => p.dni ? `DNI ${p.dni}` : p.cuit ? `CUIT ${p.cuit}` : null,
    taxonomy: (p) => {
      const principal = p.roles.find((r) => r.principal) ?? p.roles[0];
      if (!principal) return { label: 'Sin tipo', color: TONO_TIPO.otro };
      return { label: principal.nombre, color: TONO_TIPO[principal.padre_codigo ?? principal.codigo] ?? TONO_TIPO.otro };
    },
    headline: (p) => p.nombre_completo,
    context: (p) => [p.telefono, p.email].filter(Boolean).join(' · ') || null,
    badges: (p) => [
      ...(p.tiene_ficha_laboral ? [{ label: 'Ficha laboral' }] : []),
      ...(p.tiene_login ? [{ label: 'Con acceso' }] : []),
      ...p.roles.filter((r) => !r.principal).map((r) => ({ label: r.nombre })),
    ],
    verdict: (p): Veredicto | null => (p.tipo_legacy === 'otro' ? 'advertencia' : null),
  }), []);

  /* Columnas sobre los KINDS del kit, no dibujadas a mano (LEY 0 del README:
     acá no se toman decisiones artísticas). Antes estas cuatro celdas eran
     `<div>` con `fontWeight` y `fontSize` propios, y de ahí salían las cuatro
     tipografías distintas que el dueño marcó el 2026-09-14. La anatomía
     —avatar + nombre + subtítulo con punto de color— la pone `EntityCell`,
     igual que en Trámites y Tesorería. */
  const columns: ColumnSpec<PersonaResumen>[] = useMemo(() => [
    {
      id: 'nombre', header: 'Persona', width: '2fr', kind: 'entity',
      sortValue: (p) => p.nombre_completo,
      cell: (p) => {
        const principal = p.roles.find((r) => r.principal) ?? p.roles[0];
        return (
          <EntityCell
            initials={iniciales(p.nombre_completo)}
            title={p.nombre_completo}
            subtitle={p.roles.map((r) => r.nombre).join(' · ') || 'sin tipo'}
            dotColor={principal ? (TONO_TIPO[principal.padre_codigo ?? principal.codigo] ?? TONO_TIPO.otro) : undefined}
          />
        );
      },
    },
    {
      id: 'doc', header: 'Documento', width: '1fr', kind: 'text',
      cell: (p) => p.dni || p.cuit || '—',
    },
    {
      id: 'contacto', header: 'Contacto', width: '1.4fr', kind: 'text',
      cell: (p) => [p.telefono, p.email].filter(Boolean).join(' · ') || '—',
    },
    {
      id: 'perfiles', header: 'Perfiles', width: '1fr', kind: 'dot',
      cell: (p) => {
        const que = [p.tiene_ficha_laboral && 'laboral', p.tiene_login && 'acceso'].filter(Boolean).join(' · ');
        return <DotCell label={que || '—'} dotColor={que ? 'var(--pl-green)' : undefined} />;
      },
    },
  ], []);

  /* ---------- ficha / alta / edición ---------- */
  const abrir = useCallback(async (p: PersonaResumen) => {
    try {
      const r = await personasApi.get(p.id);
      setAbierta(r.data);
      setModo('detail');
    } catch {
      toast.error('No se pudo abrir la ficha');
    }
  }, []);

  const formDe = (f: PersonaFicha): Form => ({
    nombre: f.nombre, apellido: f.apellido ?? '', dni: f.dni ?? '', cuit: f.cuit ?? '', telefono: f.telefono ?? '',
    email: f.email ?? '', direccion: f.direccion ?? '', alias_pago: f.alias_pago ?? '', notas: f.notas ?? '',
    tipo_ids: f.roles.map((r) => r.tipo_id), modalidad: f.laboral?.modalidad ?? '',
  });

  const nueva = () => { setAbierta(null); setForm(FORM_VACIO); setModo('create'); };
  const editar = () => { if (abierta) { setForm(formDe(abierta)); setModo('edit'); } };
  const cerrar = () => { setAbierta(null); setModo('detail'); };

  const opcionesTipo = useMemo(() => tipos.flatMap((t) => [
    { id: String(t.id), label: t.nombre },
    ...t.subtipos.map((s) => ({ id: String(s.id), label: `${t.nombre} › ${s.nombre}` })),
  ]), [tipos]);

  const esEmpleado = useMemo(() => {
    const ids = new Set(form.tipo_ids);
    return tipos.some((t) => t.codigo === 'empleado' && (ids.has(t.id) || t.subtipos.some((s) => ids.has(s.id))));
  }, [form.tipo_ids, tipos]);

  const guardar = async () => {
    if (!form.nombre.trim()) return toast.error('El nombre es obligatorio');
    if (form.tipo_ids.length === 0) return toast.error('Decí qué es esta persona: al menos un tipo');
    setGuardando(true);
    try {
      const payload = { ...form, modalidad: esEmpleado && form.modalidad ? form.modalidad : undefined };
      const r = modo === 'create' ? await personasApi.create(payload) : await personasApi.update(abierta!.id, payload);
      toast.success(modo === 'create' ? 'Persona creada' : 'Persona guardada');
      setAbierta(r.data);
      setModo('detail');
      void cargar();
      void cargarTipos();
    } catch (e) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : 'No se pudo guardar');
    } finally {
      setGuardando(false);
    }
  };

  /* El input lo viste el KIT (`av2-campo-input`), no esta pantalla. Acá había
     un `style` propio con `theme.backgroundSecondary` de fondo: gris, que se
     lee como deshabilitado, y siete campos seguidos parecían de sólo lectura.
     LEY 0 del kit: acá no se toman decisiones artísticas. */
  const campo = (label: string, key: keyof Form, placeholder = '', full = false) => (
    <SideModalField label={label} full={full}>
      <input
        type="text"
        value={form[key] as string}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        placeholder={placeholder}
        className="av2-campo-input"
      />
    </SideModalField>
  );

  const seccionesForm = [
    { id: 'identidad', label: 'Quién es', content: (
      <div className="av2-form-grid">
        {campo('Nombre', 'nombre', 'Nombre o razón social')}
        {campo('Apellido', 'apellido')}
        {campo('DNI', 'dni')}
        {campo('CUIT', 'cuit')}
        {campo('Teléfono', 'telefono')}
        {campo('Email', 'email')}
        {campo('Domicilio', 'direccion', '', true)}
      </div>
    ) },
    { id: 'que-es', label: 'Qué es', content: (
      <div className="space-y-3">
        <p className="av2-campo-nota">Una persona puede ser varias cosas a la vez. La primera que marques es la principal.</p>
        <TildesAditivas
          opciones={opcionesTipo}
          activas={form.tipo_ids.map(String)}
          onChange={(ids) => setForm({ ...form, tipo_ids: ids.map(Number) })}
        />
        {esEmpleado && (
          <SelectorAdaptativo
            label="Modalidad"
            value={form.modalidad}
            onChange={(v) => setForm({ ...form, modalidad: v })}
            options={MODALIDADES}
          />
        )}
      </div>
    ) },
    { id: 'pago', label: 'Cómo cobra', content: (
      <div className="av2-form-grid">
        {campo('Alias o CBU', 'alias_pago', 'alias.mp o CBU', true)}
        <SideModalField label="Notas" full>
          <textarea className="av2-sheet-nota" rows={2} value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
        </SideModalField>
      </div>
    ) },
  ];

  const fila = (k: string, v: React.ReactNode) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '7px 0', borderTop: '1px solid var(--pl-border)', fontSize: 'var(--pl-fs-body-sm)' }}>
      <span style={{ color: 'var(--pl-text-muted)' }}>{k}</span><span style={{ textAlign: 'right' }}>{v}</span>
    </div>
  );

  const seccionesFicha = abierta ? [
    { id: 'identidad', label: 'Quién es', content: (
      <div>
        {fila('Documento', abierta.dni || abierta.cuit || 'sin documento')}
        {fila('Teléfono', abierta.telefono || '—')}
        {fila('Email', abierta.email || '—')}
        {fila('Domicilio', abierta.direccion || '—')}
        {fila('Qué es', abierta.roles.map((r) => r.nombre).join(' · ') || 'sin tipo')}
      </div>
    ) },
    ...(abierta.laboral ? [{ id: 'laboral', label: 'Ficha laboral', content: (
      <div>
        {fila('Modalidad', abierta.laboral.modalidad ? MODALIDAD_LABEL[abierta.laboral.modalidad] ?? abierta.laboral.modalidad : 'sin definir')}
        {fila('Dependencia', abierta.laboral.dependencia || '—')}
        {fila('Zona', abierta.laboral.zona || '—')}
        {fila('Cuadrillas', abierta.laboral.cuadrillas.join(', ') || '—')}
      </div>
    ) }] : []),
    ...(abierta.economica ? [{ id: 'economica', label: 'Plata', content: (
      <div>
        {fila('Gastos', `${abierta.economica.gastos} · ${fmtMoney(abierta.economica.total_gastos)}`)}
        {fila('Pagos programados', String(abierta.economica.pagos_programados_activos))}
        {fila('Último pago', abierta.economica.ultimo_pago ? new Date(abierta.economica.ultimo_pago).toLocaleDateString('es-AR') : '—')}
        {fila('Alias o CBU', abierta.alias_pago || '—')}
      </div>
    ) }] : []),
    ...(abierta.acceso ? [{ id: 'acceso', label: 'Acceso', content: (
      <div>
        {fila('Usuario', abierta.acceso.email || '—')}
        {fila('Rol', abierta.acceso.rol)}
        {fila('Estado', abierta.acceso.activo ? 'activo' : 'inactivo')}
      </div>
    ) }] : []),
  ] : [];

  const items = datos?.items ?? [];

  return (
    <>
      <SemanticAbmPage<PersonaResumen>
        moduleKey="personas"
        eyebrow="Configuración · Personas"
        title="Personas"
        description="Todos los que cobran, trabajan o tienen acceso, en una sola libreta. Una persona puede ser varias cosas: la ficha muestra sólo lo que tiene."
        hero={{ etiqueta: 'PERSONAS', frases, kpis: heroKpis }}
        accentColor={kpis && kpis.sin_tipo > 0 ? 'var(--pl-amber-strong)' : undefined}
        searchPlaceholder="Buscar por nombre, DNI, CUIT o alias…"
        views={['table', 'cards']}
        primaryAction={{ label: 'Nueva persona', icon: UserPlus, onClick: nueva }}
        selects={selects}
        statusTabs={statusTabs}
        activeStatus={tab}
        onStatusChange={setTab}
        filterSummary={datos ? `${items.length} de ${datos.total}` : undefined}
        kind="plain"
        columns={columns}
        roles={roles}
        groupBy="none"
        rows={items}
        rowKey={(p) => p.id}
        /* Abre DIRECTO en editar (dueño, 2026-09-15: "que venga en editar
           directamente"). La ficha de sólo lectura mostraba cuatro datos, la
           mitad guiones, y media hoja en blanco debajo: para mirar eso ya está
           la grilla. Al panel se entra para cambiar algo. */
        onRowClick={(p) => { void abrir(p).then(() => setModo('edit')); }}
        /* Sin lápiz en la grilla: la fila entera ya abre en editar, y un botón
           que hace lo mismo que el click sólo suma una columna. */
        rowActions={[]}
        loading={loading}
        emptyMessage="No hay personas con esos filtros."
        footer={{ showing: datos ? `Mostrando ${items.length} de ${datos.total}` : 'Cargando…' }}
        search={search}
        onSearchChange={setSearch}
        activeView={vista}
        onViewChange={setVista}
      />

      {(abierta || modo === 'create') && (
        <SideModal
          mode={modo}
          width={560}
          open
          onClose={cerrar}
          header={{
            id: abierta ? `#${abierta.id}` : undefined,
            title: modo === 'create' ? 'Nueva persona' : abierta!.nombre_completo,
            metaTop: modo === 'create'
              ? 'Quién es, qué es, y cómo cobra si cobra'
              : (abierta!.roles.map((r) => r.nombre).join(' · ') || 'sin tipo'),
            statusChip: abierta && abierta.tipo_legacy === 'otro' ? { label: 'Sin tipo', tone: 'amber' } : undefined,
          }}
          sections={modo === 'detail' ? seccionesFicha : seccionesForm}
          footer={modo === 'detail'
            ? { primary: { label: 'Editar', icon: Pencil, onClick: editar },
                info: abierta?.economica ? `${abierta.economica.gastos} gastos · ${fmtMoney(abierta.economica.total_gastos)}` : undefined }
            : { primary: { label: guardando ? 'Guardando…' : 'Guardar', icon: Wallet, onClick: () => { void guardar(); }, disabled: guardando },
                secondary: [{ label: 'Cancelar', onClick: modo === 'create' ? cerrar : () => setModo('detail') }] }}
        />
      )}
    </>
  );
}
