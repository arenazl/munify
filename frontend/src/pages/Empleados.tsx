import { useEffect, useMemo, useState } from 'react';
import { Edit, Trash2, Star, X, Check, Clock, Shield, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { empleadosApi, zonasApi, categoriasApi, empleadosGestionApi, dependenciasApi, usersApi } from '../lib/api';
import { useTheme } from '../contexts/ThemeContext';
import { ABMSheetFooter, ABMInput, ABMTextarea } from '../components/ui/ABMPage';
import { Sheet } from '../components/ui/Sheet';
import { ModernSelect } from '../components/ui/ModernSelect';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { SemanticAbmPage } from '../components/abmv2/SemanticAbmPage';
import type { ChipCellData, DotCellData, EntityCellData } from '../components/abmv2/DataTable';
import type { ColumnSpec, RowAction, SelectSpec, StatusTab, ViewKind } from '../components/abmv2/types';
import { seg, type HeroFrase, type HeroKpi } from '../lib/semanticHero';
import { resolverUmbrales, veredictoMasEsPeor } from '../lib/veredictos';
import type { Empleado, Zona, Categoria, User } from '../types';

type VistaRol = 'admin' | 'supervisor' | 'empleado';

/**
 * Tabs del plantel (segmented de la FilterBar), tal como los muestra el canvas
 * `design/handoff-v2/references/personal-canvas.dc.html`: Todos · Operarios ·
 * Administrativos · Inactivos.
 *
 * OJO — mezclan DOS dimensiones a propósito (tipo de empleado y alta/baja),
 * igual que el diseño: "Todos" son los ACTIVOS (por eso su conteo empata con el
 * KPI "Activos" del hero) y "Inactivos" es la bolsa de bajas. Antes "Todos"
 * mezclaba activos y desactivados y no había forma de ver sólo las bajas.
 *
 * El tab "Supervisores" del canvas NO entra acá: en esta app un supervisor no
 * es un tipo de empleado de campo sino otro universo (tabla `users` con rol),
 * y ese switch ya vive en el select "Rol" de la misma barra.
 */
type TabPlantel = 'todos' | 'operario' | 'administrativo' | 'inactivo';

const ROL_LABELS: Record<VistaRol, string> = {
  admin: 'Administrador',
  supervisor: 'Supervisor',
  empleado: 'Empleado',
};

/** Opciones del select "Rol" de la FilterBar (reemplaza las pills viejas). */
const ROL_OPTIONS = [
  { value: 'empleado', label: 'Empleados' },
  { value: 'supervisor', label: 'Supervisores' },
  { value: 'admin', label: 'Administradores' },
];

/** Tamaño del bloque incremental del pie "Cargar más" (estándar plain). */
const PAGE_SIZE = 50;

const tipoDe = (e: Empleado): 'operario' | 'administrativo' =>
  ((e as { tipo?: string }).tipo || 'operario') === 'administrativo' ? 'administrativo' : 'operario';

const getNombreCompleto = (e: Empleado) => (e.apellido ? `${e.nombre} ${e.apellido}` : e.nombre);

/** Iniciales para el avatar de la fila (el canvas identifica a la persona por
 *  iniciales, no por un icono genérico de usuario). Sin apellido alcanza con
 *  la inicial del nombre; sin nada, un guion antes que un avatar vacío. */
const inicialesDe = (nombre?: string, apellido?: string): string =>
  `${nombre?.trim()?.[0] ?? ''}${apellido?.trim()?.[0] ?? ''}`.toUpperCase() || '—';

/**
 * View-model de fila del DataTable del estándar: cada campo matchea el `id`
 * de su columna para usar el render por defecto por `kind` (entity/chip/dot/
 * text). `origen*` guarda la entidad real para abrir el detalle (Sheet)
 * existente.
 */
interface PersonalRow {
  id: number;
  empleado: EntityCellData;
  tipo?: ChipCellData;
  /** Columna taxonómica: punto del color de la categoría + texto neutro. */
  especialidad?: DotCellData;
  zona?: DotCellData;
  dependencia?: DotCellData;
  email?: string;
  telefono?: string;
  dni?: string;
  estado: ChipCellData;
  origenEmpleado?: Empleado;
  origenUsuario?: User;
}

const DIAS_SEMANA = [
  { value: 0, label: 'Lunes', short: 'Lun' },
  { value: 1, label: 'Martes', short: 'Mar' },
  { value: 2, label: 'Miércoles', short: 'Mié' },
  { value: 3, label: 'Jueves', short: 'Jue' },
  { value: 4, label: 'Viernes', short: 'Vie' },
  { value: 5, label: 'Sábado', short: 'Sáb' },
  { value: 6, label: 'Domingo', short: 'Dom' },
];

type HorarioDia = { activo: boolean; hora_entrada: string; hora_salida: string };

const horariosDefault = (): Record<number, HorarioDia> => {
  const r: Record<number, HorarioDia> = {};
  DIAS_SEMANA.forEach(d => {
    r[d.value] = { activo: d.value < 5, hora_entrada: '08:00', hora_salida: '17:00' };
  });
  return r;
};

export default function Empleados() {
  const { theme } = useTheme();
  const [vistaRol, setVistaRol] = useState<VistaRol>('empleado');
  const [tabPlantel, setTabPlantel] = useState<TabPlantel>('todos');
  // Combos "Especialidad" y "Zona" de la barra de filtros (canvas Personal).
  const [filtroEspecialidad, setFiltroEspecialidad] = useState<number | null>(null);
  const [filtroZona, setFiltroZona] = useState<number | null>(null);
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [usuarios, setUsuarios] = useState<User[]>([]);
  const [zonas, setZonas] = useState<Zona[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [dependencias, setDependencias] = useState<Array<{ id: number; nombre: string; color?: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedEmpleado, setSelectedEmpleado] = useState<Empleado | null>(null);
  const [selectedUsuario, setSelectedUsuario] = useState<User | null>(null);
  const [formData, setFormData] = useState({
    nombre: '',
    apellido: '',
    email: '',
    password: '',
    telefono: '',
    dni: '',
    descripcion: '',
    especialidad: '',
    tipo: 'operario' as 'operario' | 'administrativo',
    capacidad_maxima: 10,
    zona_id: '',
    municipio_dependencia_id: '',
    categoria_principal_id: '',
    categoria_ids: [] as number[]
  });
  const [userFormData, setUserFormData] = useState({
    nombre: '',
    apellido: '',
    email: '',
    password: '',
    telefono: '',
    dni: '',
    direccion: '',
  });
  const [horariosSemana, setHorariosSemana] = useState<Record<number, HorarioDia>>(horariosDefault);
  // Carga incremental client-side (pie "Cargar más" del estándar)
  const [page, setPage] = useState(1);
  const [vista, setVista] = useState<ViewKind>('table');
  /** Baja pedida desde la fila: dar de baja a alguien no puede ser un click
   *  suelto. Antes la papelera desactivaba en el acto, sin preguntar nada. */
  const [aDesactivar, setADesactivar] = useState<PersonalRow | null>(null);

  const isEmpleadoView = vistaRol === 'empleado';

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vistaRol]);

  const fetchData = async () => {
    setLoading(true);
    try {
      if (vistaRol === 'empleado') {
        const [empleadosRes, zonasRes, categoriasRes, dependenciasRes] = await Promise.all([
          empleadosApi.getAll(),
          zonasApi.getAll(true),
          categoriasApi.getAll(true),
          dependenciasApi.getMunicipio({ activo: true }).catch(() => ({ data: [] })),
        ]);
        setEmpleados(empleadosRes.data);
        setZonas(zonasRes.data);
        setCategorias(categoriasRes.data);
        setDependencias((dependenciasRes.data || []).map((d: { id: number; dependencia?: { nombre: string; color?: string }; nombre?: string; color?: string }) => ({
          id: d.id,
          nombre: d.dependencia?.nombre || d.nombre || '',
          color: d.dependencia?.color || d.color,
        })));
      } else {
        const usersRes = await usersApi.getAll();
        setUsuarios((usersRes.data || []).filter((u: User) => u.rol === vistaRol));
      }
    } catch (error) {
      toast.error('Error al cargar datos');
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const openSheet = async (empleado: Empleado | null = null) => {
    if (empleado) {
      setFormData({
        nombre: empleado.nombre,
        apellido: empleado.apellido || '',
        email: '', // No mostramos email en edición
        password: '', // No mostramos password en edición
        telefono: empleado.telefono || '',
        dni: '',
        descripcion: empleado.descripcion || '',
        especialidad: empleado.especialidad || '',
        tipo: (empleado as { tipo?: 'operario' | 'administrativo' }).tipo || 'operario',
        capacidad_maxima: empleado.capacidad_maxima,
        zona_id: empleado.zona_id?.toString() || '',
        municipio_dependencia_id: empleado.municipio_dependencia_id?.toString() || '',
        categoria_principal_id: empleado.categoria_principal_id?.toString() || '',
        categoria_ids: empleado.categorias?.map(c => c.id) || []
      });
      setSelectedEmpleado(empleado);
      // Cargar horarios existentes del empleado
      try {
        const res = await empleadosGestionApi.getHorarios({ empleado_id: empleado.id });
        const semana = horariosDefault();
        (res.data || []).forEach((h: { dia_semana: number; hora_entrada: string; hora_salida: string; activo: boolean }) => {
          semana[h.dia_semana] = {
            activo: h.activo,
            hora_entrada: h.hora_entrada?.slice(0, 5) || '08:00',
            hora_salida: h.hora_salida?.slice(0, 5) || '17:00',
          };
        });
        setHorariosSemana(semana);
      } catch {
        setHorariosSemana(horariosDefault());
      }
    } else {
      setFormData({
        nombre: '',
        apellido: '',
        email: '',
        password: '',
        telefono: '',
        dni: '',
        descripcion: '',
        especialidad: '',
        tipo: 'operario',
        capacidad_maxima: 10,
        zona_id: '',
        municipio_dependencia_id: '',
        categoria_principal_id: '',
        categoria_ids: []
      });
      setHorariosSemana(horariosDefault());
      setSelectedEmpleado(null);
    }
    setSheetOpen(true);
  };

  const closeSheet = () => {
    setSheetOpen(false);
    setSelectedEmpleado(null);
    setSelectedUsuario(null);
  };

  const openUserSheet = (usuario: User | null = null) => {
    if (usuario) {
      setUserFormData({
        nombre: usuario.nombre,
        apellido: usuario.apellido || '',
        email: usuario.email,
        password: '',
        telefono: usuario.telefono || '',
        dni: usuario.dni || '',
        direccion: usuario.direccion || '',
      });
      setSelectedUsuario(usuario);
    } else {
      setUserFormData({
        nombre: '',
        apellido: '',
        email: '',
        password: '',
        telefono: '',
        dni: '',
        direccion: '',
      });
      setSelectedUsuario(null);
    }
    setSheetOpen(true);
  };

  const handleUserSubmit = async () => {
    if (!selectedUsuario && !userFormData.password) {
      toast.error('La contraseña es requerida');
      return;
    }
    setSaving(true);
    const payload: Record<string, unknown> = {
      nombre: userFormData.nombre,
      apellido: userFormData.apellido,
      email: userFormData.email,
      telefono: userFormData.telefono || null,
      dni: userFormData.dni || null,
      direccion: userFormData.direccion || null,
      rol: vistaRol,
    };
    if (!selectedUsuario && userFormData.password) {
      payload.password = userFormData.password;
    }
    try {
      if (selectedUsuario) {
        await usersApi.update(selectedUsuario.id, payload);
        toast.success('Usuario actualizado correctamente');
      } else {
        await usersApi.create(payload);
        toast.success('Usuario creado correctamente');
      }
      fetchData();
      closeSheet();
    } catch (error) {
      toast.error('Error al guardar el usuario');
      console.error('Error:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleUserDelete = async (id: number) => {
    try {
      await usersApi.delete(id);
      toast.success('Usuario desactivado');
      fetchData();
    } catch (error) {
      toast.error('Error al desactivar el usuario');
      console.error('Error:', error);
    }
  };

  const handleSubmit = async () => {
    // Validar email y password solo para nuevo empleado
    if (!selectedEmpleado) {
      if (!formData.email || !formData.password) {
        toast.error('Email y contraseña son requeridos');
        return;
      }
    }

    setSaving(true);
    const payload: Record<string, unknown> = {
      nombre: formData.nombre,
      apellido: formData.apellido || null,
      telefono: formData.telefono || null,
      descripcion: formData.descripcion || null,
      especialidad: formData.especialidad || null,
      tipo: formData.tipo,
      capacidad_maxima: formData.capacidad_maxima,
      zona_id: formData.zona_id ? parseInt(formData.zona_id) : null,
      municipio_dependencia_id: formData.municipio_dependencia_id ? parseInt(formData.municipio_dependencia_id) : null,
      categoria_principal_id: formData.categoria_principal_id ? parseInt(formData.categoria_principal_id) : null,
      categoria_ids: formData.categoria_ids
    };

    // Solo agregar email/password/dni para nuevo empleado
    if (!selectedEmpleado) {
      payload.email = formData.email;
      payload.password = formData.password;
      payload.dni = formData.dni || null;
    }

    try {
      let empleadoId: number;
      if (selectedEmpleado) {
        await empleadosApi.update(selectedEmpleado.id, payload);
        empleadoId = selectedEmpleado.id;
        toast.success('Empleado actualizado correctamente');
      } else {
        const res = await empleadosApi.create(payload);
        empleadoId = (res.data as { id: number }).id;
        toast.success('Empleado creado correctamente');
      }

      // Guardar horarios de la semana
      try {
        const horariosArray = DIAS_SEMANA.map(d => ({
          empleado_id: empleadoId,
          dia_semana: d.value,
          hora_entrada: horariosSemana[d.value].hora_entrada,
          hora_salida: horariosSemana[d.value].hora_salida,
          activo: horariosSemana[d.value].activo,
        }));
        await empleadosGestionApi.setHorariosSemana(empleadoId, horariosArray);
      } catch (e) {
        console.error('Error guardando horarios:', e);
        toast.error('Empleado guardado, pero falló guardar horarios');
      }

      fetchData();
      closeSheet();
    } catch (error) {
      toast.error('Error al guardar el empleado');
      console.error('Error:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await empleadosApi.delete(id);
      toast.success('Empleado desactivado');
      fetchData();
    } catch (error) {
      toast.error('Error al desactivar el empleado');
      console.error('Error:', error);
    }
  };

  const toggleCategoria = (categoriaId: number) => {
    setFormData(prev => {
      const ids = prev.categoria_ids.includes(categoriaId)
        ? prev.categoria_ids.filter(id => id !== categoriaId)
        : [...prev.categoria_ids, categoriaId];

      // Si quitamos la categoria principal, limpiarla
      if (!ids.includes(parseInt(prev.categoria_principal_id))) {
        return { ...prev, categoria_ids: ids, categoria_principal_id: '' };
      }
      return { ...prev, categoria_ids: ids };
    });
  };

  const setPrincipal = (categoriaId: number) => {
    // Si no esta seleccionada, agregarla primero
    if (!formData.categoria_ids.includes(categoriaId)) {
      setFormData(prev => ({
        ...prev,
        categoria_ids: [...prev.categoria_ids, categoriaId],
        categoria_principal_id: categoriaId.toString()
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        categoria_principal_id: categoriaId.toString()
      }));
    }
  };

  const filteredEmpleados = empleados.filter(c => {
    const q = search.toLowerCase();
    const matchSearch =
      c.nombre.toLowerCase().includes(q) ||
      (c.apellido?.toLowerCase().includes(q) ?? false) ||
      (c.especialidad?.toLowerCase().includes(q) ?? false) ||
      (c.categoria_principal?.nombre?.toLowerCase().includes(q) ?? false) ||
      (c.descripcion?.toLowerCase().includes(q) ?? false);
    // Ver la nota de `TabPlantel`: "Todos" son los activos; las bajas viven
    // en su propio tab y no se mezclan con el plantel en funciones.
    const matchTab =
      tabPlantel === 'inactivo'
        ? !c.activo
        : tabPlantel === 'todos'
          ? c.activo
          : c.activo && tipoDe(c) === tabPlantel;
    const matchEspecialidad =
      filtroEspecialidad === null || c.categoria_principal_id === filtroEspecialidad;
    const matchZona = filtroZona === null || c.zona_id === filtroZona;
    return matchSearch && matchTab && matchEspecialidad && matchZona;
  });

  const filteredUsuarios = usuarios.filter(u => {
    const q = search.toLowerCase();
    return (
      u.nombre.toLowerCase().includes(q) ||
      u.apellido.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      (u.dni?.toLowerCase().includes(q) ?? false)
    );
  });

  // Ventana visible de la lista activa; el pie "Cargar más" suma de a PAGE_SIZE
  const currentList = isEmpleadoView ? filteredEmpleados : filteredUsuarios;
  const visibles = useMemo(() => currentList.slice(0, page * PAGE_SIZE), [currentList, page]);

  // La ventana vuelve al principio cuando cambia LO QUE SE MIRA (universo,
  // tab, combos o búsqueda), no sólo cuando cambia el largo de la lista.
  useEffect(() => {
    setPage(1);
  }, [currentList.length, vistaRol, tabPlantel, filtroEspecialidad, filtroZona, search]);

  // Filas del DataTable (view-model): resuelve zona/dependencia y arma los
  // datos de celda que pinta el render por defecto según ColumnSpec.kind.
  const filas = useMemo<PersonalRow[]>(() => {
    if (isEmpleadoView) {
      return (visibles as Empleado[]).map((e): PersonalRow => {
        const zona = zonas.find(z => z.id === e.zona_id);
        const dep = dependencias.find(d => d.id === e.municipio_dependencia_id);
        const esOperario = tipoDe(e) === 'operario';
        // La especialidad sale de la categoría principal; si el empleado no
        // tiene ninguna, cae al campo libre `especialidad` antes de rendirse.
        const especialidad = e.categoria_principal?.nombre || e.especialidad || '';
        return {
          id: e.id,
          empleado: {
            initials: inicialesDe(e.nombre, e.apellido),
            tileColor: e.categoria_principal?.color,
            title: getNombreCompleto(e),
            subtitle: e.telefono || undefined,
          },
          tipo: esOperario
            ? { label: 'Operario', tone: 'gray' }
            : { label: 'Administrativo', tone: 'blue' },
          // Sin valor se deja `undefined` a propósito: el render por defecto
          // del DataTable pinta "—" en vez de un punto con la etiqueta vacía.
          especialidad: especialidad
            ? { label: especialidad, dotColor: e.categoria_principal?.color }
            : undefined,
          zona: zona ? { label: zona.nombre } : undefined,
          dependencia: dep ? { label: dep.nombre, dotColor: dep.color } : undefined,
          estado: e.activo
            ? { label: 'Activo', tone: 'green' }
            : { label: 'Inactivo', tone: 'gray' },
          origenEmpleado: e,
        };
      });
    }
    const RolIcon = vistaRol === 'admin' ? Shield : ShieldCheck;
    return (visibles as User[]).map((u): PersonalRow => ({
      id: u.id,
      empleado: {
        initials: inicialesDe(u.nombre, u.apellido),
        icon: RolIcon,
        title: `${u.nombre} ${u.apellido}`,
      },
      email: u.email,
      telefono: u.telefono || '',
      dni: u.dni || '',
      estado: u.activo
        ? { label: 'Activo', tone: 'green' }
        : { label: 'Inactivo', tone: 'gray' },
      origenUsuario: u,
    }));
  }, [visibles, isEmpleadoView, vistaRol, zonas, dependencias]);

  const rolLabel = ROL_LABELS[vistaRol];

  // Columnas del canvas Personal: EMPLEADO · TIPO · ESPECIALIDAD · ZONA ·
  // (CARGA) · ESTADO · ACCIONES. La columna CARGA del diseño NO se implementa:
  // hoy no existe el dato — `/empleados/disponibilidad` devuelve `carga_actual`
  // fijo en 0 (los dos cálculos están comentados como TODO en
  // `backend/api/empleados.py`) y las OTs formales excluyen las implícitas, así
  // que cualquier número saldría falso. En su lugar queda DEPENDENCIA, que sí
  // es dato real y ya se mostraba. Especialidad/zona/dependencia usan kind
  // 'dot' (punto de color + texto neutro), como pide el diseño.
  const columnas: ColumnSpec<PersonalRow>[] = isEmpleadoView
    ? [
        { id: 'empleado', header: 'EMPLEADO', width: 'minmax(190px, 1.6fr)', kind: 'entity' },
        { id: 'tipo', header: 'TIPO', width: 'minmax(110px, 0.8fr)', kind: 'chip' },
        { id: 'especialidad', header: 'ESPECIALIDAD', width: 'minmax(150px, 1.3fr)', kind: 'dot' },
        { id: 'zona', header: 'ZONA', width: 'minmax(110px, 1fr)', kind: 'dot' },
        { id: 'dependencia', header: 'DEPENDENCIA', width: 'minmax(140px, 1.2fr)', kind: 'dot' },
        { id: 'estado', header: 'ESTADO', width: 'minmax(96px, 0.7fr)', kind: 'chip' },
        { id: 'acciones', header: 'ACCIONES', width: 'minmax(76px, 0.5fr)', kind: 'actions', align: 'right' },
      ]
    : [
        { id: 'empleado', header: rolLabel.toUpperCase(), width: 'minmax(190px, 1.6fr)', kind: 'entity' },
        { id: 'email', header: 'EMAIL', width: 'minmax(190px, 1.5fr)', kind: 'text' },
        { id: 'telefono', header: 'TELÉFONO', width: 'minmax(120px, 1fr)', kind: 'text' },
        { id: 'dni', header: 'DNI', width: 'minmax(100px, 0.8fr)', kind: 'text' },
        { id: 'estado', header: 'ESTADO', width: 'minmax(96px, 0.7fr)', kind: 'chip' },
        { id: 'acciones', header: 'ACCIONES', width: 'minmax(76px, 0.5fr)', kind: 'actions', align: 'right' },
      ];

  // Detalle actual preservado: click en fila o "Editar" abren el Sheet existente
  const abrirDetalle = (r: PersonalRow) => {
    if (r.origenEmpleado) openSheet(r.origenEmpleado);
    else if (r.origenUsuario) openUserSheet(r.origenUsuario);
  };

  const accionesFila: RowAction<PersonalRow>[] = [
    { id: 'editar', label: 'Editar', icon: Edit, onClick: abrirDetalle },
    {
      id: 'eliminar',
      label: 'Desactivar',
      icon: Trash2,
      danger: true,
      // Nunca directo: la baja pasa por el ConfirmModal del kit.
      onClick: (r) => setADesactivar(r),
    },
  ];

  const confirmarDesactivacion = () => {
    const r = aDesactivar;
    setADesactivar(null);
    if (!r) return;
    if (r.origenEmpleado) handleDelete(r.origenEmpleado.id);
    else if (r.origenUsuario) handleUserDelete(r.origenUsuario.id);
  };

  // Combos taxonómicos de la barra de filtros. "Especialidad" y "Zona" son los
  // del canvas Personal; "Rol" es el switch de universo propio de esta app
  // (empleados de campo vs. usuarios del sistema), que el canvas no tiene.
  const selectRol: SelectSpec = {
    id: 'rol',
    label: 'Rol',
    value: vistaRol,
    options: ROL_OPTIONS,
    onChange: (v) => {
      setVistaRol(v as VistaRol);
      // Tabs y combos son del universo "empleados de campo". Al salir de ese
      // universo se limpian: si no, al volver seguirían filtrando en silencio
      // (sus controles no se ven mientras se miran usuarios del sistema).
      if (v !== 'empleado') {
        setTabPlantel('todos');
        setFiltroEspecialidad(null);
        setFiltroZona(null);
      }
    },
  };
  const selects: SelectSpec[] = isEmpleadoView
    ? [
        selectRol,
        {
          id: 'especialidad',
          label: 'Especialidad',
          value: filtroEspecialidad === null ? '' : String(filtroEspecialidad),
          options: [
            { value: '', label: 'Todas' },
            ...categorias.map(c => ({ value: String(c.id), label: c.nombre, color: c.color })),
          ],
          onChange: (v) => setFiltroEspecialidad(v ? parseInt(v, 10) : null),
        },
        {
          id: 'zona',
          label: 'Zona',
          value: filtroZona === null ? '' : String(filtroZona),
          options: [
            { value: '', label: 'Todas' },
            ...zonas.map(z => ({ value: String(z.id), label: z.nombre })),
          ],
          onChange: (v) => setFiltroZona(v ? parseInt(v, 10) : null),
        },
      ]
    : [selectRol];

  // Segmented del plantel con conteos reales del universo cargado. "Todos" son
  // los activos (empata con el KPI "Activos" del hero); las bajas van al tab
  // "Inactivos" — con 0 la FilterBar lo apaga sola.
  const empleadosActivos = empleados.filter(e => e.activo);
  const conteoOperarios = empleadosActivos.filter(e => tipoDe(e) === 'operario').length;
  const statusTabs: StatusTab[] = isEmpleadoView
    ? [
        { id: 'todos', label: 'Todos', count: empleadosActivos.length },
        { id: 'operario', label: 'Operarios', count: conteoOperarios },
        { id: 'administrativo', label: 'Administrativos', count: empleadosActivos.length - conteoOperarios },
        { id: 'inactivo', label: 'Inactivos', count: empleados.length - empleadosActivos.length },
      ]
    : [{ id: 'todos', label: 'Todos', count: usuarios.length }];

  /**
   * Radiografía del plantel que alimentan hero y KPIs. TODO sale de datos ya
   * cargados en la pantalla — nada se inventa ni se pide de más.
   *
   * "Especialidad" = la categoría principal del empleado. Una especialidad
   * cubierta por UNA sola persona es el riesgo que el canvas titula
   * "especialidad única": si esa persona falta, el rubro queda sin nadie.
   */
  const plantel = useMemo(() => {
    const activos = empleados.filter(e => e.activo);
    const operarios = activos.filter(e => tipoDe(e) === 'operario').length;
    const porEspecialidad = new Map<number, number>();
    activos.forEach(e => {
      if (e.categoria_principal_id) {
        porEspecialidad.set(
          e.categoria_principal_id,
          (porEspecialidad.get(e.categoria_principal_id) ?? 0) + 1,
        );
      }
    });
    return {
      activos: activos.length,
      inactivos: empleados.length - activos.length,
      operarios,
      administrativos: activos.length - operarios,
      cubiertas: porEspecialidad.size,
      unicas: Array.from(porEspecialidad.values()).filter(n => n === 1).length,
      sinZona: activos.filter(e => !e.zona_id).length,
    };
  }, [empleados]);

  /**
   * Strip de KPIs del hero (el estándar prohíbe tarjetas de KPI sueltas).
   *
   * El canvas propone ACTIVOS · CON TAREAS HOY · SOBRECARGADOS · SIN CARGA ·
   * ESPECIALIDAD ÚNICA. Los tres del medio se apoyan en la CARGA de trabajo por
   * persona, que hoy la app NO tiene (ver la nota de las columnas): se
   * reemplazan por los otros riesgos reales del plantel que el mismo hero ya
   * mira — cobertura de especialidades, especialidad sin respaldo, gente sin
   * zona y bajas. ACTIVOS y ESPECIALIDAD ÚNICA son los del diseño, tal cual.
   */
  const heroKpis = useMemo<HeroKpi[]>(() => {
    if (loading || !isEmpleadoView || empleados.length === 0) return [];
    const u = resolverUmbrales();
    const { activos, inactivos, operarios, administrativos, cubiertas, unicas, sinZona } = plantel;
    return [
      {
        etiqueta: 'ACTIVOS',
        valor: activos,
        sub: `${operarios} operario${operarios === 1 ? '' : 's'} · ${administrativos} administrativo${administrativos === 1 ? '' : 's'}`,
      },
      {
        etiqueta: 'ESPECIALIDADES',
        valor: cubiertas,
        sub: `de ${categorias.length} categoría${categorias.length === 1 ? '' : 's'}`,
      },
      {
        etiqueta: 'ESPECIALIDAD ÚNICA',
        valor: unicas,
        sub: 'sin respaldo si faltan',
        veredicto: veredictoMasEsPeor(unicas, u.sinAsignar),
      },
      {
        etiqueta: 'SIN ZONA',
        valor: sinZona,
        sub: `de ${zonas.length} zona${zonas.length === 1 ? '' : 's'}`,
        veredicto: veredictoMasEsPeor(sinZona, u.sinAsignar),
      },
      {
        etiqueta: 'INACTIVOS',
        valor: inactivos,
        sub: 'fuera del plantel',
      },
    ];
  }, [loading, isEmpleadoView, empleados.length, plantel, categorias.length, zonas.length]);

  // Hero semántico: solo datos reales ya cargados en la pantalla (sin inventar números)
  const heroFrases = useMemo<HeroFrase[]>(() => {
    if (loading || !isEmpleadoView || empleados.length === 0) return [];
    const u = resolverUmbrales();
    const { activos, operarios, administrativos, unicas, sinZona } = plantel;

    const frases: HeroFrase[] = [{
      segmentos: [
        seg('Tenés '),
        seg(
          `${activos} empleado${activos === 1 ? '' : 's'} activo${activos === 1 ? '' : 's'}`,
          activos > 0 ? 'bueno' : undefined,
        ),
        seg(`: ${operarios} operario${operarios === 1 ? '' : 's'} y ${administrativos} administrativo${administrativos === 1 ? '' : 's'}.`),
      ],
    }];

    if (activos > 0) {
      // La frase de riesgo del canvas ("tres especialidades dependen de una
      // sola persona"), con el número real del muni.
      frases.push({
        segmentos:
          unicas === 0
            ? [seg('Ninguna especialidad '), seg('depende de una sola persona', 'bueno'), seg('.')]
            : [
                seg('Hay '),
                seg(
                  `${unicas} especialidad${unicas === 1 ? '' : 'es'} que depende${unicas === 1 ? '' : 'n'} de una sola persona`,
                  veredictoMasEsPeor(unicas, u.sinAsignar),
                ),
                seg(unicas === 1 ? ' — si falta, nadie la cubre.' : ' — si faltan, nadie las cubre.'),
              ],
        acciones: [{ label: 'Ver categorías', to: '/gestion/categorias-reclamo' }],
      });

      frases.push({
        segmentos:
          sinZona === 0
            ? [seg('Cobertura de zonas al día: '), seg('todos con zona asignada', 'bueno'), seg('.')]
            : [
                seg('Hay '),
                seg(
                  `${sinZona} empleado${sinZona === 1 ? '' : 's'} sin zona asignada`,
                  veredictoMasEsPeor(sinZona, u.sinAsignar),
                ),
                seg(' — asignales una zona para que el despacho los tenga en cuenta.'),
              ],
        acciones: [
          { label: 'Cuadrillas', to: '/gestion/cuadrillas', primaria: true },
          { label: 'Zonas', to: '/gestion/zonas' },
        ],
      });
    }
    return frases;
  }, [loading, isEmpleadoView, empleados.length, plantel]);

  return (
    <>
      {/* Cabecera de módulo (v2.2, props eyebrow/title/description): el eyebrow
          nombra el módulo y el H1 el trabajo. Dos copys porque el select de Rol
          cambia el universo: empleados de campo vs. usuarios del sistema. */}
      <SemanticAbmPage<PersonalRow>
        moduleKey="personal"
        /* Los números del canvas viven en el strip del hero — la pantalla no
           tiene (ni debe tener) tarjetas de KPI sueltas. */
        hero={{ etiqueta: 'PERSONAL · CAMPO', frases: heroFrases, kpis: heroKpis }}
        eyebrow="Personal"
        title={isEmpleadoView
          ? 'Quién sale a la calle y con qué está equipado'
          : `Quién entra al sistema como ${rolLabel.toLowerCase()}`}
        description={isEmpleadoView
          ? 'Operarios y administrativos del municipio, con su especialidad, su zona y su dependencia. Desde acá se dan de alta, se editan y se desactivan.'
          : `Usuarios con rol de ${rolLabel.toLowerCase()} y acceso al sistema, con su contacto y su estado. Cambiá el rol en el filtro para ver otro universo.`}
        searchPlaceholder={isEmpleadoView
          ? 'Buscar por nombre, apellido o especialidad…'
          : 'Buscar por nombre, email o DNI…'}
        /* El canvas ofrece Tarjetas/Tabla; hoy esta pantalla sólo tiene tabla,
           así que el segmented no se muestra (ListToolbar pide 2+ vistas). */
        views={['table']}
        activeView={vista}
        onViewChange={setVista}
        primaryAction={{
          label: isEmpleadoView ? 'Nuevo empleado' : `Nuevo ${rolLabel.toLowerCase()}`,
          onClick: () => (isEmpleadoView ? openSheet() : openUserSheet()),
        }}
        selects={selects}
        /* El canvas muestra el segmented del plantel en la barra de filtros
           (pills), no como tabs subrayadas dentro de la tarjeta de la tabla. */
        statusTabs={statusTabs}
        activeStatus={isEmpleadoView ? tabPlantel : 'todos'}
        onStatusChange={(id) => setTabPlantel(id as TabPlantel)}
        search={search}
        onSearchChange={setSearch}
        kind="plain"
        columns={columnas}
        rows={filas}
        rowActions={accionesFila}
        rowKey={(r) => r.id}
        onRowClick={abrirDetalle}
        footer={{
          showing: `Mostrando ${filas.length} de ${currentList.length}`,
          action: filas.length < currentList.length
            ? { label: 'Cargar más', onClick: () => setPage(p => p + 1) }
            : undefined,
        }}
      />

      {/* Detalle/alta EXISTENTES preservados (piloto): mismo Sheet y formularios */}
      <Sheet
        open={sheetOpen}
        onClose={closeSheet}
        title={isEmpleadoView
          ? (selectedEmpleado ? 'Editar Empleado' : 'Nuevo Empleado')
          : (selectedUsuario ? `Editar ${rolLabel}` : `Nuevo ${rolLabel}`)}
        description={isEmpleadoView
          ? (selectedEmpleado ? 'Modifica los datos del empleado' : 'Completa los datos para crear un nuevo empleado')
          : (selectedUsuario ? `Modifica los datos del ${rolLabel.toLowerCase()}` : `Completa los datos para crear un nuevo ${rolLabel.toLowerCase()}`)}
        stickyFooter={
          <ABMSheetFooter
            onCancel={closeSheet}
            onSave={isEmpleadoView ? handleSubmit : handleUserSubmit}
            saving={saving}
          />
        }
      >
        {isEmpleadoView ? (
        <form className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <ABMInput
              label="Nombre"
              required
              value={formData.nombre}
              onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
              placeholder="Nombre"
            />
            <ABMInput
              label="Apellido"
              value={formData.apellido}
              onChange={(e) => setFormData({ ...formData, apellido: e.target.value })}
              placeholder="Apellido"
            />
          </div>

          {/* Campos de acceso - solo para nuevo empleado */}
          {!selectedEmpleado && (
            <>
              <ABMInput
                label="Email"
                type="email"
                required
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="email@ejemplo.com"
              />
              <div className="grid grid-cols-2 gap-4">
                <ABMInput
                  label="Contraseña"
                  type="password"
                  required
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="Contraseña"
                />
                <ABMInput
                  label="DNI"
                  value={formData.dni}
                  onChange={(e) => setFormData({ ...formData, dni: e.target.value })}
                  placeholder="DNI"
                />
              </div>
            </>
          )}

          <div className="grid grid-cols-2 gap-4">
            <ABMInput
              label="Teléfono"
              type="tel"
              value={formData.telefono}
              onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
              placeholder="Teléfono"
            />
            {/* Controles del kit: ModernSelect variant="v2". Antes eran
                ABMSelect, que por dentro es un <select> nativo (vetado). */}
            <ModernSelect
              variant="v2"
              label="Tipo de Empleado"
              value={formData.tipo}
              onChange={(v) => setFormData({ ...formData, tipo: v as 'operario' | 'administrativo' })}
              options={[
                { value: 'operario', label: 'Operario (Reclamos)' },
                { value: 'administrativo', label: 'Administrativo (Trámites)' }
              ]}
            />
          </div>

          <ABMTextarea
            label="Descripcion"
            value={formData.descripcion}
            onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
            placeholder="Descripcion del empleado"
            rows={2}
          />

          <div className="grid grid-cols-2 gap-4">
            <ABMInput
              label="Capacidad Maxima"
              type="number"
              value={formData.capacidad_maxima}
              onChange={(e) => setFormData({ ...formData, capacidad_maxima: Number(e.target.value) })}
              min={1}
              max={50}
            />
            <ModernSelect
              variant="v2"
              label="Zona Asignada"
              value={formData.zona_id}
              onChange={(v) => setFormData({ ...formData, zona_id: v })}
              placeholder="Sin zona asignada"
              options={[
                { value: '', label: 'Sin zona asignada' },
                ...zonas.map(z => ({ value: String(z.id), label: z.nombre })),
              ]}
            />
          </div>

          <ModernSelect
            variant="v2"
            label="Dependencia"
            value={formData.municipio_dependencia_id}
            onChange={(v) => setFormData({ ...formData, municipio_dependencia_id: v })}
            placeholder={dependencias.length === 0 ? 'Sin dependencias disponibles' : 'Sin dependencia asignada'}
            options={[
              // La opción vacía repite el copy del placeholder para no perder
              // el aviso de "el muni todavía no cargó dependencias".
              {
                value: '',
                label: dependencias.length === 0 ? 'Sin dependencias disponibles' : 'Sin dependencia asignada',
              },
              ...dependencias.map(d => ({ value: String(d.id), label: d.nombre, color: d.color })),
            ]}
          />

          {/* Selector de Especialidades (Categorias) */}
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: theme.text }}>
              Especialidades
            </label>
            <p className="text-xs mb-2" style={{ color: theme.textSecondary }}>
              Selecciona las categorias que puede atender. Haz clic en la estrella para marcar la principal.
            </p>
            <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto p-2 rounded-lg" style={{ backgroundColor: theme.backgroundSecondary }}>
              {categorias.map(cat => {
                const isSelected = formData.categoria_ids.includes(cat.id);
                const isPrincipal = formData.categoria_principal_id === cat.id.toString();
                return (
                  <div
                    key={cat.id}
                    className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-all ${
                      isSelected ? 'ring-2' : ''
                    }`}
                    style={{
                      backgroundColor: isSelected ? (cat.color ? `${cat.color}20` : theme.border) : theme.card,
                      borderColor: cat.color || theme.border,
                      ['--tw-ring-color' as string]: cat.color || theme.primary
                    }}
                    onClick={() => toggleCategoria(cat.id)}
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <div
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: cat.color || '#6b7280' }}
                      />
                      <span className="text-sm truncate">{cat.nombre}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      {isSelected && (
                        <>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPrincipal(cat.id);
                            }}
                            className={`p-1 rounded transition-colors ${isPrincipal ? 'text-yellow-500' : ''}`}
                            style={{ color: isPrincipal ? '#eab308' : theme.textSecondary }}
                            title={isPrincipal ? 'Categoria principal' : 'Marcar como principal'}
                          >
                            <Star className={`h-4 w-4 ${isPrincipal ? 'fill-current' : ''}`} />
                          </button>
                          <Check className="h-4 w-4 text-green-500" />
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {formData.categoria_ids.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {formData.categoria_ids.map(id => {
                  const cat = categorias.find(c => c.id === id);
                  if (!cat) return null;
                  const isPrincipal = formData.categoria_principal_id === id.toString();
                  return (
                    <span
                      key={id}
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full text-white"
                      style={{ backgroundColor: cat.color || '#6b7280' }}
                    >
                      {isPrincipal && <Star className="h-3 w-3 fill-current" />}
                      {cat.nombre}
                      <button
                        type="button"
                        onClick={() => toggleCategoria(id)}
                        className="ml-1 hover:bg-white/20 rounded-full p-0.5"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
          </div>

          {/* Horarios de trabajo por día */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium mb-2" style={{ color: theme.text }}>
              <Clock className="h-4 w-4" />
              Horarios de trabajo
            </label>
            <p className="text-xs mb-2" style={{ color: theme.textSecondary }}>
              Activá los días que trabaja y definí los horarios de entrada/salida.
            </p>
            <div className="rounded-lg p-2 space-y-1" style={{ backgroundColor: theme.backgroundSecondary }}>
              {DIAS_SEMANA.map(d => {
                const h = horariosSemana[d.value];
                return (
                  <div
                    key={d.value}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors"
                    style={{
                      backgroundColor: h.activo ? theme.card : 'transparent',
                      border: `1px solid ${h.activo ? theme.border : 'transparent'}`,
                    }}
                  >
                    <label className="flex items-center gap-2 w-24 cursor-pointer flex-shrink-0">
                      <input
                        type="checkbox"
                        checked={h.activo}
                        onChange={(e) => setHorariosSemana(prev => ({
                          ...prev,
                          [d.value]: { ...prev[d.value], activo: e.target.checked },
                        }))}
                        className="h-4 w-4 rounded cursor-pointer"
                        style={{ accentColor: theme.primary }}
                      />
                      <span className="text-sm" style={{ color: h.activo ? theme.text : theme.textSecondary }}>
                        {d.label}
                      </span>
                    </label>
                    <input
                      type="time"
                      value={h.hora_entrada}
                      disabled={!h.activo}
                      onChange={(e) => setHorariosSemana(prev => ({
                        ...prev,
                        [d.value]: { ...prev[d.value], hora_entrada: e.target.value },
                      }))}
                      className="flex-1 rounded px-2 py-1 text-sm transition-colors disabled:opacity-40 focus:outline-none"
                      style={{
                        backgroundColor: theme.background,
                        color: theme.text,
                        border: `1px solid ${theme.border}`,
                      }}
                    />
                    <span className="text-xs" style={{ color: theme.textSecondary }}>a</span>
                    <input
                      type="time"
                      value={h.hora_salida}
                      disabled={!h.activo}
                      onChange={(e) => setHorariosSemana(prev => ({
                        ...prev,
                        [d.value]: { ...prev[d.value], hora_salida: e.target.value },
                      }))}
                      className="flex-1 rounded px-2 py-1 text-sm transition-colors disabled:opacity-40 focus:outline-none"
                      style={{
                        backgroundColor: theme.background,
                        color: theme.text,
                        border: `1px solid ${theme.border}`,
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {selectedEmpleado && selectedEmpleado.miembros && selectedEmpleado.miembros.length > 0 && (
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: theme.textSecondary }}>
                Miembros Actuales
              </label>
              <div className="rounded-lg p-3 space-y-2" style={{ backgroundColor: theme.backgroundSecondary }}>
                {selectedEmpleado.miembros.map((m) => (
                  <div key={m.id} className="flex items-center text-sm">
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium mr-2"
                      style={{ backgroundColor: theme.border, color: theme.text }}
                    >
                      {(m.nombre?.[0] || '?')}{m.apellido?.[0] || ''}
                    </div>
                    <span>{m.nombre} {m.apellido}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </form>
      ) : (
        <form className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <ABMInput
              label="Nombre"
              required
              value={userFormData.nombre}
              onChange={(e) => setUserFormData({ ...userFormData, nombre: e.target.value })}
              placeholder="Nombre"
            />
            <ABMInput
              label="Apellido"
              required
              value={userFormData.apellido}
              onChange={(e) => setUserFormData({ ...userFormData, apellido: e.target.value })}
              placeholder="Apellido"
            />
          </div>
          <ABMInput
            label="Email"
            type="email"
            required
            value={userFormData.email}
            onChange={(e) => setUserFormData({ ...userFormData, email: e.target.value })}
            placeholder="email@ejemplo.com"
          />
          {!selectedUsuario && (
            <ABMInput
              label="Contraseña"
              type="password"
              required
              value={userFormData.password}
              onChange={(e) => setUserFormData({ ...userFormData, password: e.target.value })}
              placeholder="Contraseña"
            />
          )}
          <div className="grid grid-cols-2 gap-4">
            <ABMInput
              label="Teléfono"
              type="tel"
              value={userFormData.telefono}
              onChange={(e) => setUserFormData({ ...userFormData, telefono: e.target.value })}
              placeholder="Teléfono"
            />
            <ABMInput
              label="DNI"
              value={userFormData.dni}
              onChange={(e) => setUserFormData({ ...userFormData, dni: e.target.value })}
              placeholder="DNI"
            />
          </div>
          <ABMInput
            label="Dirección"
            value={userFormData.direccion}
            onChange={(e) => setUserFormData({ ...userFormData, direccion: e.target.value })}
            placeholder="Dirección"
          />
        </form>
      )}
      </Sheet>

      {/* Baja: confirmación explícita (ConfirmModal del kit, nunca
          window.confirm ni un click suelto en la papelera). */}
      <ConfirmModal
        isOpen={!!aDesactivar}
        onClose={() => setADesactivar(null)}
        onConfirm={confirmarDesactivacion}
        variant="danger"
        title="Dar de baja"
        message={
          aDesactivar
            ? `${aDesactivar.empleado.title} deja de figurar en el plantel activo y no se le puede asignar trabajo. Sus datos y su historial quedan guardados.`
            : ''
        }
        confirmText="Dar de baja"
        cancelText="Cancelar"
      />
    </>
  );
}
