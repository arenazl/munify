import { useEffect, useState } from 'react';
import { Edit, Trash2, User as UserIcon, Star, X, Check, Users, Clock, Shield, Mail, Phone, Wrench, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { empleadosApi, zonasApi, categoriasApi, empleadosGestionApi, dependenciasApi, usersApi } from '../lib/api';
import { useTheme } from '../contexts/ThemeContext';
import { ABMPage, ABMCard, ABMBadge, ABMSheetFooter, ABMInput, ABMTextarea, ABMSelect, ABMTable, ABMTableAction, ABMCardActions } from '../components/ui/ABMPage';
import PageHint from '../components/ui/PageHint';
import type { Empleado, Zona, Categoria, User } from '../types';

type VistaRol = 'admin' | 'supervisor' | 'empleado';
type TipoEmpleado = 'todos' | 'administrativo' | 'operario';

const VISTA_PILLS: Array<{ value: VistaRol; label: string; icon: typeof UserIcon; color: string }> = [
  { value: 'admin', label: 'Administrador', icon: Shield, color: '#8b5cf6' },
  { value: 'supervisor', label: 'Supervisor', icon: ShieldCheck, color: '#eab308' },
  { value: 'empleado', label: 'Empleado', icon: Wrench, color: '#3b82f6' },
];

const TIPO_PILLS: Array<{ value: TipoEmpleado; label: string }> = [
  { value: 'todos', label: 'Todos' },
  { value: 'administrativo', label: 'Administrativo' },
  { value: 'operario', label: 'Técnico' },
];

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
        tipo: (empleado as any).tipo || 'operario',
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

  const getNombreCompleto = (e: Empleado) => {
    if (e.apellido) {
      return `${e.nombre} ${e.apellido}`;
    }
    return e.nombre;
  };

  const tableColumns = [
    {
      key: 'nombre',
      header: 'Empleado',
      sortValue: (c: Empleado) => getNombreCompleto(c),
      render: (c: Empleado) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center">
            <UserIcon className="h-4 w-4 text-purple-600" />
          </div>
          <span className="font-medium">{getNombreCompleto(c)}</span>
        </div>
      ),
    },
    {
      key: 'tipo',
      header: 'Tipo',
      sortValue: (c: Empleado) => (c as any).tipo || 'operario',
      render: (c: Empleado) => {
        const tipo = (c as any).tipo || 'operario';
        const isOperario = tipo === 'operario';
        return (
          <span
            className="inline-flex items-center px-2 py-0.5 text-xs rounded-full font-medium"
            style={{
              backgroundColor: isOperario ? '#f59e0b20' : '#3b82f620',
              color: isOperario ? '#f59e0b' : '#3b82f6',
            }}
          >
            {isOperario ? 'Operario' : 'Administrativo'}
          </span>
        );
      },
    },
    {
      key: 'funcion',
      header: 'Función',
      sortValue: (c: Empleado) => c.categoria_principal?.nombre || '',
      render: (c: Empleado) => {
        if (!c.categoria_principal) {
          return <span className="text-xs" style={{ color: theme.textSecondary }}>—</span>;
        }
        const color = c.categoria_principal.color || '#6b7280';
        return (
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full font-medium"
            style={{
              backgroundColor: `${color}20`,
              color: color,
            }}
          >
            <Star className="h-3 w-3 fill-current" />
            {c.categoria_principal.nombre}
          </span>
        );
      },
    },
    {
      key: 'especialidades',
      header: 'Especialidades',
      sortValue: (c: Empleado) => c.categorias?.length || 0,
      render: (c: Empleado) => (
        <div className="flex flex-wrap gap-1">
          {c.categorias && c.categorias.length > 0 ? (
            c.categorias.slice(0, 3).map(cat => (
              <span
                key={cat.id}
                className="px-2 py-0.5 text-xs rounded-full text-white"
                style={{ backgroundColor: cat.color || '#6b7280' }}
              >
                {cat.nombre}
              </span>
            ))
          ) : (
            <span style={{ color: theme.textSecondary }}>-</span>
          )}
          {c.categorias && c.categorias.length > 3 && (
            <span className="px-2 py-0.5 text-xs rounded-full" style={{ backgroundColor: theme.border }}>
              +{c.categorias.length - 3}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'zona',
      header: 'Zona',
      sortValue: (c: Empleado) => {
        const zona = zonas.find(z => z.id === c.zona_id);
        return zona?.nombre || '';
      },
      render: (c: Empleado) => {
        const zona = zonas.find(z => z.id === c.zona_id);
        return zona ? (
          <span className="text-xs" style={{ color: theme.text }}>{zona.nombre}</span>
        ) : (
          <span className="text-xs" style={{ color: theme.textSecondary }}>—</span>
        );
      },
    },
    {
      key: 'activo',
      header: 'Estado',
      sortValue: (c: Empleado) => c.activo,
      render: (c: Empleado) => <ABMBadge active={c.activo} />,
    },
  ];

  const userTableColumns = [
    {
      key: 'nombre',
      header: vistaRol === 'admin' ? 'Administrador' : 'Supervisor',
      sortValue: (u: User) => `${u.nombre} ${u.apellido}`,
      render: (u: User) => {
        const Icon = vistaRol === 'admin' ? Shield : ShieldCheck;
        const bg = vistaRol === 'admin' ? 'bg-purple-500' : 'bg-yellow-500';
        return (
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-full ${bg} flex items-center justify-center`}>
              <Icon className="h-4 w-4 text-white" />
            </div>
            <span className="font-medium">{u.nombre} {u.apellido}</span>
          </div>
        );
      },
    },
    {
      key: 'email',
      header: 'Email',
      sortValue: (u: User) => u.email,
      render: (u: User) => (
        <div className="flex items-center gap-1" style={{ color: theme.textSecondary }}>
          <Mail className="h-3 w-3" />
          {u.email}
        </div>
      ),
    },
    {
      key: 'telefono',
      header: 'Teléfono',
      sortValue: (u: User) => u.telefono || '',
      render: (u: User) => (
        <div className="flex items-center gap-1" style={{ color: theme.textSecondary }}>
          {u.telefono ? (
            <>
              <Phone className="h-3 w-3" />
              {u.telefono}
            </>
          ) : '-'}
        </div>
      ),
    },
    {
      key: 'dni',
      header: 'DNI',
      sortValue: (u: User) => u.dni || '',
      render: (u: User) => u.dni || '-',
    },
    {
      key: 'activo',
      header: 'Estado',
      sortValue: (u: User) => u.activo,
      render: (u: User) => <ABMBadge active={u.activo} />,
    },
  ];

  const vistaActual = VISTA_PILLS.find(p => p.value === vistaRol)!;

  const pillsBar = (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex flex-wrap gap-1.5">
        {VISTA_PILLS.map(p => {
          const active = vistaRol === p.value;
          const Icon = p.icon;
          return (
            <button
              key={p.value}
              type="button"
              onClick={() => {
                setVistaRol(p.value);
                if (p.value !== 'empleado') setTipoFiltro('todos');
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all active:scale-95"
              style={{
                backgroundColor: active ? p.color : 'transparent',
                color: active ? '#ffffff' : theme.textSecondary,
                border: `1px solid ${active ? p.color : theme.border}`,
              }}
            >
              <Icon className="h-3.5 w-3.5" />
              {p.label}
            </button>
          );
        })}
      </div>
      {vistaRol === 'empleado' && (
        <>
          <span className="text-xs px-1" style={{ color: theme.textSecondary }}>·</span>
          <div className="flex flex-wrap gap-1.5">
            {TIPO_PILLS.map(t => {
              const active = tipoFiltro === t.value;
              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setTipoFiltro(t.value)}
                  className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium transition-all active:scale-95"
                  style={{
                    backgroundColor: active ? `${vistaActual.color}20` : 'transparent',
                    color: active ? vistaActual.color : theme.textSecondary,
                    border: `1px solid ${active ? vistaActual.color : theme.border}`,
                  }}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );

  return (
    <>
      <PageHint pageId="empleados" />
      <ABMPage
      title="Empleados"
      icon={<Users className="h-5 w-5" />}
      backLink="/gestion/ajustes"
      buttonLabel={isEmpleadoView ? 'Nuevo Empleado' : `Nuevo ${vistaActual.label}`}
      onAdd={() => (isEmpleadoView ? openSheet() : openUserSheet())}
      searchPlaceholder={isEmpleadoView ? 'Buscar empleados...' : `Buscar ${vistaActual.label.toLowerCase()}es...`}
      searchValue={search}
      onSearchChange={setSearch}
      loading={loading}
      isEmpty={isEmpleadoView ? filteredEmpleados.length === 0 : filteredUsuarios.length === 0}
      emptyMessage={isEmpleadoView ? 'No se encontraron empleados' : `No se encontraron ${vistaActual.label.toLowerCase()}es`}
      sheetOpen={sheetOpen}
      sheetTitle={
        isEmpleadoView
          ? (selectedEmpleado ? 'Editar Empleado' : 'Nuevo Empleado')
          : (selectedUsuario ? `Editar ${vistaActual.label}` : `Nuevo ${vistaActual.label}`)
      }
      sheetDescription={
        isEmpleadoView
          ? (selectedEmpleado ? 'Modifica los datos del empleado' : 'Completa los datos para crear un nuevo empleado')
          : (selectedUsuario ? `Modifica los datos del ${vistaActual.label.toLowerCase()}` : `Completa los datos para crear un nuevo ${vistaActual.label.toLowerCase()}`)
      }
      onSheetClose={closeSheet}
      extraFilters={pillsBar}
      tableView={
        isEmpleadoView ? (
          <ABMTable
            data={filteredEmpleados}
            columns={tableColumns}
            keyExtractor={(c) => c.id}
            onRowClick={(c) => openSheet(c)}
            actions={(c) => (
              <>
                <ABMTableAction
                  icon={<Edit className="h-4 w-4" />}
                  onClick={() => openSheet(c)}
                  title="Editar"
                />
                <ABMTableAction
                  icon={<Trash2 className="h-4 w-4" />}
                  onClick={() => handleDelete(c.id)}
                  title="Desactivar"
                  variant="danger"
                />
              </>
            )}
          />
        ) : (
          <ABMTable
            data={filteredUsuarios}
            columns={userTableColumns}
            keyExtractor={(u) => u.id}
            onRowClick={(u) => openUserSheet(u)}
            actions={(u) => (
              <>
                <ABMTableAction
                  icon={<Edit className="h-4 w-4" />}
                  onClick={() => openUserSheet(u)}
                  title="Editar"
                />
                <ABMTableAction
                  icon={<Trash2 className="h-4 w-4" />}
                  onClick={() => handleUserDelete(u.id)}
                  title="Desactivar"
                  variant="danger"
                />
              </>
            )}
          />
        )
      }
      sheetFooter={
        <ABMSheetFooter
          onCancel={closeSheet}
          onSave={isEmpleadoView ? handleSubmit : handleUserSubmit}
          saving={saving}
        />
      }
      sheetContent={isEmpleadoView ? (
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
                      {m.nombre[0]}{m.apellido[0]}
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
    >
      {isEmpleadoView ? filteredEmpleados.map((c) => {
        // Usar el color de la categoría principal, o un gradiente morado por defecto
        const mainColor = c.categoria_principal?.color || '#8B5CF6';
        const zona = zonas.find(z => z.id === c.zona_id);

        return (
          <div
            key={c.id}
            onClick={() => openSheet(c)}
            className="group relative rounded-2xl p-5 cursor-pointer overflow-hidden abm-card-hover animate-fade-in-up"
            style={{
              backgroundColor: theme.card,
              border: `1px solid ${theme.border}`,
              ['--card-primary' as string]: mainColor,
            }}
          >
            {/* Fondo con gradiente sutil del color principal */}
            <div
              className="absolute inset-0 opacity-[0.06] group-hover:opacity-[0.12] transition-opacity duration-500"
              style={{
                background: `
                  radial-gradient(ellipse at top left, ${mainColor}50 0%, transparent 50%),
                  radial-gradient(ellipse at bottom right, ${mainColor}30 0%, transparent 50%)
                `,
              }}
            />

            {/* Línea decorativa superior con el color */}
            <div
              className="absolute top-0 left-0 right-0 h-1 opacity-60 group-hover:opacity-100 transition-opacity duration-300"
              style={{
                background: `linear-gradient(90deg, ${mainColor}, ${mainColor}50, transparent)`,
              }}
            />

            {/* Contenido */}
            <div className="relative z-10">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  {/* Avatar con gradiente */}
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center shadow-lg transition-all duration-300 group-hover:scale-110 group-hover:rotate-3"
                    style={{
                      background: `linear-gradient(135deg, ${mainColor}, ${mainColor}CC)`,
                      boxShadow: `0 4px 14px ${mainColor}40`,
                    }}
                  >
                    <UserIcon className="h-6 w-6 text-white" />
                  </div>
                  <div className="ml-4">
                    <p className="font-semibold text-lg" style={{ color: theme.text }}>
                      {getNombreCompleto(c)}
                    </p>
                    {c.categoria_principal && (
                      <p className="text-sm flex items-center gap-1.5" style={{ color: mainColor }}>
                        <Star className="h-3.5 w-3.5 fill-current" />
                        {c.categoria_principal.nombre}
                      </p>
                    )}
                  </div>
                </div>
                <ABMBadge active={c.activo} />
              </div>

              {/* Especialidades con chips */}
              {c.categorias && c.categorias.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-4">
                  {c.categorias.map(cat => (
                    <span
                      key={cat.id}
                      className="px-2.5 py-1 text-xs rounded-full font-medium transition-transform duration-200 hover:scale-105"
                      style={{
                        backgroundColor: `${cat.color || '#6b7280'}20`,
                        color: cat.color || '#6b7280',
                        border: `1px solid ${cat.color || '#6b7280'}30`,
                      }}
                    >
                      {cat.nombre}
                    </span>
                  ))}
                </div>
              )}

              {c.descripcion && (
                <p className="text-sm mt-4 line-clamp-2" style={{ color: theme.textSecondary }}>
                  {c.descripcion}
                </p>
              )}

              <div className="flex items-center justify-between mt-4 pt-4" style={{ borderTop: `1px solid ${theme.border}` }}>
                <div className="flex items-center gap-2">
                  {zona ? (
                    <span
                      className="text-xs px-2.5 py-1 rounded-full font-medium flex items-center gap-1"
                      style={{
                        backgroundColor: `${mainColor}10`,
                        color: theme.textSecondary,
                      }}
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      {zona.nombre}
                    </span>
                  ) : (
                    <span className="text-xs" style={{ color: theme.textSecondary }}>Sin zona</span>
                  )}
                  <span
                    className="text-xs px-2 py-0.5 rounded-full"
                    style={{
                      backgroundColor: theme.backgroundSecondary,
                      color: theme.textSecondary,
                    }}
                  >
                    Cap. {c.capacidad_maxima}
                  </span>
                </div>
                <ABMCardActions
                  onEdit={() => openSheet(c)}
                  onDelete={() => handleDelete(c.id)}
                />
              </div>
            </div>
          </div>
        );
      }) : filteredUsuarios.map((u) => {
        const Icon = vistaRol === 'admin' ? Shield : ShieldCheck;
        const bg = vistaRol === 'admin' ? 'bg-purple-500' : 'bg-yellow-500';
        return (
          <ABMCard key={u.id} onClick={() => openUserSheet(u)}>
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <div className={`w-10 h-10 rounded-full ${bg} flex items-center justify-center`}>
                  <Icon className="h-5 w-5 text-white" />
                </div>
                <div className="ml-3">
                  <p className="font-medium">{u.nombre} {u.apellido}</p>
                  <p className="text-sm flex items-center" style={{ color: theme.textSecondary }}>
                    <Mail className="h-3 w-3 mr-1" />
                    {u.email}
                  </p>
                </div>
              </div>
              <ABMBadge active={u.activo} />
            </div>

            <div className="mt-3 space-y-1">
              {u.telefono && (
                <p className="text-sm flex items-center" style={{ color: theme.textSecondary }}>
                  <Phone className="h-3 w-3 mr-1" />
                  {u.telefono}
                </p>
              )}
              {u.dni && (
                <p className="text-sm" style={{ color: theme.textSecondary }}>
                  DNI: {u.dni}
                </p>
              )}
            </div>

            <div className="flex items-center justify-end mt-4 pt-4" style={{ borderTop: `1px solid ${theme.border}` }}>
              <ABMCardActions
                onEdit={() => openUserSheet(u)}
                onDelete={() => handleUserDelete(u.id)}
              />
            </div>
          </ABMCard>
        );
      })}
    </ABMPage>
    </>
  );
}
