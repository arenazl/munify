import { useEffect, useState } from 'react';
import { Edit, Trash2, User as UserIcon, Mail, Phone, Users } from 'lucide-react';
import { toast } from 'sonner';
import { usersApi } from '../lib/api';
import { useTheme } from '../contexts/ThemeContext';
import { ABMPage, ABMCard, ABMBadge, ABMSheetFooter, ABMInput, ABMTable, ABMTableAction, ABMCardActions } from '../components/ui/ABMPage';
import type { User } from '../types';

export default function Usuarios() {
  const { theme } = useTheme();
  const [usuarios, setUsuarios] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedUsuario, setSelectedUsuario] = useState<User | null>(null);
  const [formData, setFormData] = useState({
    nombre: '',
    apellido: '',
    email: '',
    password: '',
    telefono: '',
    dni: '',
    direccion: '',
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const response = await usersApi.getAll();
      const soloVecinos = (response.data || []).filter((u: User) => u.rol === 'vecino');
      setUsuarios(soloVecinos);
    } catch (error) {
      toast.error('Error al cargar datos');
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const openSheet = (usuario: User | null = null) => {
    if (usuario) {
      setFormData({
        nombre: usuario.nombre,
        apellido: usuario.apellido,
        email: usuario.email,
        password: '',
        telefono: usuario.telefono || '',
        dni: usuario.dni || '',
        direccion: usuario.direccion || '',
      });
      setSelectedUsuario(usuario);
    } else {
      setFormData({
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

  const closeSheet = () => {
    setSheetOpen(false);
    setSelectedUsuario(null);
  };

  const handleSubmit = async () => {
    setSaving(true);

    const payload: Record<string, unknown> = {
      nombre: formData.nombre,
      apellido: formData.apellido,
      email: formData.email,
      telefono: formData.telefono || null,
      dni: formData.dni || null,
      direccion: formData.direccion || null,
      rol: 'vecino',
    };

    if (!selectedUsuario && formData.password) {
      payload.password = formData.password;
    }

    try {
      if (selectedUsuario) {
        await usersApi.update(selectedUsuario.id, payload);
        toast.success('Vecino actualizado correctamente');
      } else {
        await usersApi.create(payload);
        toast.success('Vecino creado correctamente');
      }
      fetchData();
      closeSheet();
    } catch (error) {
      toast.error('Error al guardar el vecino');
      console.error('Error:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await usersApi.delete(id);
      toast.success('Vecino desactivado');
      fetchData();
    } catch (error) {
      toast.error('Error al desactivar el vecino');
      console.error('Error:', error);
    }
  };

  const filteredUsuarios = usuarios.filter(u => {
    const q = search.toLowerCase();
    return (
      u.nombre.toLowerCase().includes(q) ||
      u.apellido.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.dni?.toLowerCase().includes(q)
    );
  });

  const tableColumns = [
    {
      key: 'nombre',
      header: 'Vecino',
      sortValue: (u: User) => `${u.nombre} ${u.apellido}`,
      render: (u: User) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gray-500 flex items-center justify-center">
            <UserIcon className="h-4 w-4 text-white" />
          </div>
          <div>
            <span className="font-medium">{u.nombre} {u.apellido}</span>
          </div>
        </div>
      ),
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

  return (
    <ABMPage
      title="Vecinos"
      icon={<Users className="h-5 w-5" />}
      backLink="/gestion/ajustes"
      buttonLabel="Nuevo Vecino"
      onAdd={() => openSheet()}
      searchPlaceholder="Buscar vecinos..."
      searchValue={search}
      onSearchChange={setSearch}
      loading={loading}
      isEmpty={filteredUsuarios.length === 0}
      emptyMessage="No se encontraron vecinos en el padrón"
      sheetOpen={sheetOpen}
      sheetTitle={selectedUsuario ? 'Editar Vecino' : 'Nuevo Vecino'}
      sheetDescription={selectedUsuario ? 'Modifica los datos del vecino' : 'Completa los datos para registrar un nuevo vecino'}
      onSheetClose={closeSheet}
      tableView={
        <ABMTable
          data={filteredUsuarios}
          columns={tableColumns}
          keyExtractor={(u) => u.id}
          onRowClick={(u) => openSheet(u)}
          actions={(u) => (
            <>
              <ABMTableAction
                icon={<Edit className="h-4 w-4" />}
                onClick={() => openSheet(u)}
                title="Editar"
              />
              <ABMTableAction
                icon={<Trash2 className="h-4 w-4" />}
                onClick={() => handleDelete(u.id)}
                title="Desactivar"
                variant="danger"
              />
            </>
          )}
        />
      }
      sheetFooter={
        <ABMSheetFooter
          onCancel={closeSheet}
          onSave={handleSubmit}
          saving={saving}
        />
      }
      sheetContent={
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
              required
              value={formData.apellido}
              onChange={(e) => setFormData({ ...formData, apellido: e.target.value })}
              placeholder="Apellido"
            />
          </div>

          <ABMInput
            label="Email"
            type="email"
            required
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            placeholder="email@ejemplo.com"
          />

          {!selectedUsuario && (
            <ABMInput
              label="Contraseña"
              type="password"
              required
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              placeholder="Contraseña"
            />
          )}

          <div className="grid grid-cols-2 gap-4">
            <ABMInput
              label="Teléfono"
              type="tel"
              value={formData.telefono}
              onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
              placeholder="Teléfono"
            />
            <ABMInput
              label="DNI"
              value={formData.dni}
              onChange={(e) => setFormData({ ...formData, dni: e.target.value })}
              placeholder="DNI"
            />
          </div>

          <ABMInput
            label="Dirección"
            value={formData.direccion}
            onChange={(e) => setFormData({ ...formData, direccion: e.target.value })}
            placeholder="Dirección"
          />
        </form>
      }
    >
      {filteredUsuarios.map((u) => (
        <ABMCard key={u.id} onClick={() => openSheet(u)}>
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="w-10 h-10 rounded-full bg-gray-500 flex items-center justify-center">
                <UserIcon className="h-5 w-5 text-white" />
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
              onEdit={() => openSheet(u)}
              onDelete={() => handleDelete(u.id)}
            />
          </div>
        </ABMCard>
      ))}
    </ABMPage>
  );
}
