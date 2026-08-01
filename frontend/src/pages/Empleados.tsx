import { useEffect, useMemo, useState } from 'react';
import { Edit, Trash2, User as UserIcon, Star, X, Check, Clock, Shield, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { empleadosApi, zonasApi, categoriasApi, empleadosGestionApi, dependenciasApi, usersApi } from '../lib/api';
import { useTheme } from '../contexts/ThemeContext';
import { ABMSheetFooter, ABMInput, ABMTextarea, ABMSelect } from '../components/ui/ABMPage';
import { Sheet } from '../components/ui/Sheet';
import { SemanticAbmPage } from '../components/abmv2/SemanticAbmPage';
import type { ChipCellData, EntityCellData } from '../components/abmv2/DataTable';
import type { ColumnSpec, RowAction, SelectSpec, StatusTab, ViewKind } from '../components/abmv2/types';
import { seg, type HeroFrase } from '../lib/semanticHero';
import { resolverUmbrales, veredictoMasEsPeor } from '../lib/veredictos';
import type { Empleado, Zona, Categoria, User } from '../types';

type VistaRol = 'admin' | 'supervisor' | 'empleado';
type TipoEmpleado = 'todos' | 'administrativo' | 'operario';

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

/**
 * View-model de fila del DataTable del estándar: cada campo matchea el `id`
 * de su columna para usar el render por defecto por `kind` (entity/chip/text).
 * `origen*` guarda la entidad real para abrir el detalle (Sheet) existente.
 */
interface PersonalRow {
  id: number;
  empleado: EntityCellData;
  tipo?: ChipCellData;
  especialidad?: string;
  zona?: string;
  dependencia?: string;
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
  const [tipoFiltro, setTipoFiltro] = useState<TipoEmpleado>('todos');
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
      (c.descripcion?.toLowerCase().includes(q) ?? false);
    const tipoEmp = ((c as { tipo?: string }).tipo || 'operario');
    const matchTipo = tipoFiltro === 'todos' || tipoEmp === tipoFiltro;
    return matchSearch && matchTipo;
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

  useEffect(() => {
    setPage(1);
  }, [currentList.length, vistaRol]);

  // Filas del DataTable (view-model): resuelve zona/dependencia y arma los
  // datos de celda que pinta el render por defecto según ColumnSpec.kind.
  const filas = useMemo<PersonalRow[]>(() => {
    if (isEmpleadoView) {
      return (visibles as Empleado[]).map((e): PersonalRow => {
        const zona = zonas.find(z => z.id === e.zona_id);
        const dep = dependencias.find(d => d.id === e.municipio_dependencia_id);
        const esOperario = tipoDe(e) === 'operario';
        return {
          id: e.id,
          empleado: {
            icon: UserIcon,
            tileColor: e.categoria_principal?.color,
            title: getNombreCompleto(e),
            subtitle: e.telefono || undefined,
          },
          tipo: esOperario
            ? { label: 'Operario', tone: 'gray' }
            : { label: 'Administrativo', tone: 'blue' },
          especialidad: e.categoria_principal?.nombre ?? '',
          zona: zona?.nombre ?? '',
          dependencia: dep?.nombre ?? '',
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
      empleado: { icon: RolIcon, title: `${u.nombre} ${u.apellido}` },
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

  const columnas: ColumnSpec<PersonalRow>[] = isEmpleadoView
    ? [
        { id: 'empleado', header: 'EMPLEADO', width: 'minmax(190px, 1.6fr)', kind: 'entity' },
        { id: 'tipo', header: 'TIPO', width: 'minmax(110px, 0.8fr)', kind: 'chip' },
        { id: 'especialidad', header: 'ESPECIALIDAD', width: 'minmax(150px, 1.3fr)', kind: 'text' },
        { id: 'zona', header: 'ZONA', width: 'minmax(110px, 1fr)', kind: 'text' },
        { id: 'dependencia', header: 'DEPENDENCIA', width: 'minmax(140px, 1.2fr)', kind: 'text' },
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
      onClick: (r) => {
        if (r.origenEmpleado) handleDelete(r.origenEmpleado.id);
        else if (r.origenUsuario) handleUserDelete(r.origenUsuario.id);
      },
    },
  ];

  // El switch de rol de las pills viejas, en el vocabulario del estándar:
  // un select taxonómico de la FilterBar.
  const selects: SelectSpec[] = [
    {
      id: 'rol',
      label: 'Rol',
      value: vistaRol,
      options: ROL_OPTIONS,
      onChange: (v) => {
        setVistaRol(v as VistaRol);
        if (v !== 'empleado') setTipoFiltro('todos');
      },
    },
  ];

  // Segmented de estados con conteos reales del universo cargado
  const conteoOperarios = empleados.filter(e => tipoDe(e) === 'operario').length;
  const statusTabs: StatusTab[] = isEmpleadoView
    ? [
        { id: 'todos', label: 'Todos', count: empleados.length },
        { id: 'operario', label: 'Operarios', count: conteoOperarios },
        { id: 'administrativo', label: 'Administrativos', count: empleados.length - conteoOperarios },
      ]
    : [{ id: 'todos', label: 'Todos', count: usuarios.length }];

  // Hero semántico: solo datos reales ya cargados en la pantalla (sin inventar números)
  const heroFrases = useMemo<HeroFrase[]>(() => {
    if (loading || !isEmpleadoView || empleados.length === 0) return [];
    const u = resolverUmbrales();
    const activos = empleados.filter(e => e.activo);
    const operarios = activos.filter(e => ((e as { tipo?: string }).tipo || 'operario') === 'operario').length;
    const administrativos = activos.length - operarios;
    const sinZona = activos.filter(e => !e.zona_id).length;

    const frases: HeroFrase[] = [{
      segmentos: [
        seg('Tenés '),
        seg(
          `${activos.length} empleado${activos.length === 1 ? '' : 's'} activo${activos.length === 1 ? '' : 's'}`,
          activos.length > 0 ? 'bueno' : undefined,
        ),
        seg(`: ${operarios} operario${operarios === 1 ? '' : 's'} y ${administrativos} administrativo${administrativos === 1 ? '' : 's'}.`),
      ],
    }];

    if (activos.length > 0) {
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
        acciones: [{ label: 'Cuadrillas', to: '/gestion/cuadrillas', primaria: true }],
      });
    }
    return frases;
  }, [loading, isEmpleadoView, empleados]);

  return (
    <>
      {/* Cabecera de módulo (v2.2, props eyebrow/title/description): el eyebrow
          nombra el módulo y el H1 el trabajo. Dos copys porque el select de Rol
          cambia el universo: empleados de campo vs. usuarios del sistema. */}
      <SemanticAbmPage<PersonalRow>
        moduleKey="personal"
        hero={{ etiqueta: 'PERSONAL · CAMPO', frases: heroFrases }}
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
        views={['table']}
        activeView={vista}
        onViewChange={setVista}
        primaryAction={{
          label: isEmpleadoView ? 'Nuevo empleado' : `Nuevo ${rolLabel.toLowerCase()}`,
          onClick: () => (isEmpleadoView ? openSheet() : openUserSheet()),
        }}
        selects={selects}
        statusTabs={statusTabs}
        activeStatus={isEmpleadoView ? tipoFiltro : 'todos'}
        onStatusChange={(id) => setTipoFiltro(id as TipoEmpleado)}
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
            <ABMSelect
              label="Tipo de Empleado"
              value={formData.tipo}
              onChange={(e) => setFormData({ ...formData, tipo: e.target.value as 'operario' | 'administrativo' })}
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
            <ABMSelect
              label="Zona Asignada"
              value={formData.zona_id}
              onChange={(e) => setFormData({ ...formData, zona_id: e.target.value })}
              placeholder="Sin zona asignada"
              options={zonas.map(z => ({ value: z.id, label: z.nombre }))}
            />
          </div>

          <ABMSelect
            label="Dependencia"
            value={formData.municipio_dependencia_id}
            onChange={(e) => setFormData({ ...formData, municipio_dependencia_id: e.target.value })}
            placeholder={dependencias.length === 0 ? 'Sin dependencias disponibles' : 'Sin dependencia asignada'}
            options={dependencias.map(d => ({ value: d.id, label: d.nombre }))}
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
    </>
  );
}
