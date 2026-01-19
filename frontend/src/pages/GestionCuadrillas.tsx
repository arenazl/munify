import { useEffect, useState } from 'react';
import { Edit, Trash2, UsersRound, Star, Crown, UserPlus, Users } from 'lucide-react';
import { toast } from 'sonner';
import { empleadosApi, empleadosGestionApi } from '../lib/api';
import { useTheme } from '../contexts/ThemeContext';
import {
  ABMPage, ABMBadge, ABMSheetFooter, ABMInput,
  ABMSelect, ABMTable, ABMTableAction, ABMCardActions
} from '../components/ui/ABMPage';

interface Cuadrilla {
  id: number;
  nombre: string;
  descripcion?: string;
  activo: boolean;
  capacidad_maxima: number;
}

interface Empleado {
  id: number;
  nombre: string;
  apellido?: string;
}

interface EmpleadoCuadrilla {
  id: number;
  empleado_id: number;
  cuadrilla_id: number;
  es_lider: boolean;
  activo: boolean;
  empleado?: Empleado;
  cuadrilla?: Cuadrilla;
}

export default function GestionCuadrillas() {
  const { theme } = useTheme();
  const [cuadrillas, setCuadrillas] = useState<Cuadrilla[]>([]);
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [asignaciones, setAsignaciones] = useState<EmpleadoCuadrilla[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedAsignacion, setSelectedAsignacion] = useState<EmpleadoCuadrilla | null>(null);
  const [formData, setFormData] = useState({
    empleado_id: '',
    cuadrilla_id: '',
    es_lider: false
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [cuadrillasRes, empleadosRes, asignacionesRes] = await Promise.all([
        empleadosGestionApi.getCuadrillasAll({ activo: true }),
        empleadosApi.getAll(true),
        empleadosGestionApi.getCuadrillas({ activo: true })
      ]);
      setCuadrillas(cuadrillasRes.data);
      setEmpleados(empleadosRes.data);
      setAsignaciones(asignacionesRes.data);
    } catch (error) {
      toast.error('Error al cargar datos');
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const openSheet = (asignacion: EmpleadoCuadrilla | null = null) => {
    if (asignacion) {
      setFormData({
        empleado_id: asignacion.empleado_id.toString(),
        cuadrilla_id: asignacion.cuadrilla_id.toString(),
        es_lider: asignacion.es_lider
      });
      setSelectedAsignacion(asignacion);
    } else {
      setFormData({
        empleado_id: '',
        cuadrilla_id: '',
        es_lider: false
      });
      setSelectedAsignacion(null);
    }
    setSheetOpen(true);
  };

  const closeSheet = () => {
    setSheetOpen(false);
    setSelectedAsignacion(null);
  };

  const handleSubmit = async () => {
    if (!formData.empleado_id || !formData.cuadrilla_id) {
      toast.error('Selecciona empleado y cuadrilla');
      return;
    }

    setSaving(true);
    try {
      if (selectedAsignacion) {
        await empleadosGestionApi.updateAsignacionCuadrilla(selectedAsignacion.id, {
          es_lider: formData.es_lider
        });
        toast.success('Asignacion actualizada');
      } else {
        await empleadosGestionApi.asignarCuadrilla({
          empleado_id: parseInt(formData.empleado_id),
          cuadrilla_id: parseInt(formData.cuadrilla_id),
          es_lider: formData.es_lider
        });
        toast.success('Empleado asignado a cuadrilla');
      }
      fetchData();
      closeSheet();
    } catch (error: unknown) {
      const axiosError = error as { response?: { data?: { detail?: string } } };
      toast.error(axiosError.response?.data?.detail || 'Error al guardar');
      console.error('Error:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await empleadosGestionApi.desasignarCuadrilla(id);
      toast.success('Empleado removido de la cuadrilla');
      fetchData();
    } catch (error) {
      toast.error('Error al remover asignacion');
      console.error('Error:', error);
    }
  };

  const getNombreCompleto = (e?: Empleado) => {
    if (!e) return '-';
    return e.apellido ? `${e.nombre} ${e.apellido}` : e.nombre;
  };

  const filteredAsignaciones = asignaciones.filter(a =>
    getNombreCompleto(a.empleado).toLowerCase().includes(search.toLowerCase()) ||
    a.cuadrilla?.nombre?.toLowerCase().includes(search.toLowerCase())
  );

  // Agrupar por cuadrilla para la vista cards
  const asignacionesPorCuadrilla = cuadrillas.map(c => ({
    cuadrilla: c,
    miembros: filteredAsignaciones.filter(a => a.cuadrilla_id === c.id)
  })).filter(g => g.miembros.length > 0 || search === '');

  const tableColumns = [
    {
      key: 'empleado',
      header: 'Empleado',
      sortValue: (a: EmpleadoCuadrilla) => getNombreCompleto(a.empleado),
      render: (a: EmpleadoCuadrilla) => (
        <div className="flex items-center gap-2">
          {a.es_lider && <Crown className="h-4 w-4 text-yellow-500" />}
          <span className="font-medium">{getNombreCompleto(a.empleado)}</span>
        </div>
      ),
    },
    {
      key: 'cuadrilla',
      header: 'Cuadrilla',
      sortValue: (a: EmpleadoCuadrilla) => a.cuadrilla?.nombre || '',
      render: (a: EmpleadoCuadrilla) => a.cuadrilla?.nombre || '-',
    },
    {
      key: 'es_lider',
      header: 'Rol',
      sortValue: (a: EmpleadoCuadrilla) => a.es_lider,
      render: (a: EmpleadoCuadrilla) => (
        <span
          className="px-2 py-1 text-xs rounded-full"
          style={{
            backgroundColor: a.es_lider ? '#fef3c720' : theme.backgroundSecondary,
            color: a.es_lider ? '#f59e0b' : theme.textSecondary
          }}
        >
          {a.es_lider ? 'Lider' : 'Miembro'}
        </span>
      ),
    },
    {
      key: 'activo',
      header: 'Estado',
      sortValue: (a: EmpleadoCuadrilla) => a.activo,
      render: (a: EmpleadoCuadrilla) => <ABMBadge active={a.activo} />,
    },
  ];

  return (
    <ABMPage
      title="Cuadrillas"
      icon={<Users className="h-5 w-5" />}
      buttonLabel="Asignar Empleado"
      buttonIcon={<UserPlus className="h-4 w-4" />}
      onAdd={() => openSheet()}
      searchPlaceholder="Buscar por empleado o cuadrilla..."
      searchValue={search}
      onSearchChange={setSearch}
      loading={loading}
      isEmpty={asignacionesPorCuadrilla.length === 0}
      emptyMessage="No hay asignaciones de cuadrilla"
      sheetOpen={sheetOpen}
      sheetTitle={selectedAsignacion ? 'Editar Asignacion' : 'Asignar a Cuadrilla'}
      sheetDescription={selectedAsignacion ? 'Modifica el rol del empleado' : 'Selecciona empleado y cuadrilla'}
      onSheetClose={closeSheet}
      tableView={
        <ABMTable
          data={filteredAsignaciones}
          columns={tableColumns}
          keyExtractor={(a) => a.id}
          onRowClick={(a) => openSheet(a)}
          actions={(a) => (
            <>
              <ABMTableAction
                icon={<Edit className="h-4 w-4" />}
                onClick={() => openSheet(a)}
                title="Editar"
              />
              <ABMTableAction
                icon={<Trash2 className="h-4 w-4" />}
                onClick={() => handleDelete(a.id)}
                title="Remover"
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
          <ABMSelect
            label="Empleado"
            required
            value={formData.empleado_id}
            onChange={(e) => setFormData({ ...formData, empleado_id: e.target.value })}
            placeholder="Seleccionar empleado"
            options={empleados.map(e => ({
              value: e.id,
              label: getNombreCompleto(e)
            }))}
            disabled={!!selectedAsignacion}
          />

          <ABMSelect
            label="Cuadrilla"
            required
            value={formData.cuadrilla_id}
            onChange={(e) => setFormData({ ...formData, cuadrilla_id: e.target.value })}
            placeholder="Seleccionar cuadrilla"
            options={cuadrillas.map(c => ({
              value: c.id,
              label: c.nombre
            }))}
            disabled={!!selectedAsignacion}
          />

          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="es_lider"
              checked={formData.es_lider}
              onChange={(e) => setFormData({ ...formData, es_lider: e.target.checked })}
              className="w-4 h-4 rounded"
            />
            <label htmlFor="es_lider" className="flex items-center gap-2" style={{ color: theme.text }}>
              <Crown className="h-4 w-4 text-yellow-500" />
              Es lider de la cuadrilla
            </label>
          </div>
        </form>
      }
    >
      {/* Vista Cards agrupada por cuadrilla */}
      {asignacionesPorCuadrilla.map(({ cuadrilla, miembros }) => (
        <div
          key={cuadrilla.id}
          className="rounded-2xl p-5 animate-fade-in-up"
          style={{
            backgroundColor: theme.card,
            border: `1px solid ${theme.border}`,
          }}
        >
          {/* Header Cuadrilla */}
          <div className="flex items-center gap-3 mb-4 pb-3" style={{ borderBottom: `1px solid ${theme.border}` }}>
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: '#10b98120' }}
            >
              <UsersRound className="h-5 w-5" style={{ color: '#10b981' }} />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold" style={{ color: theme.text }}>
                {cuadrilla.nombre}
              </h3>
              <p className="text-xs" style={{ color: theme.textSecondary }}>
                {miembros.length} miembro{miembros.length !== 1 ? 's' : ''}
              </p>
            </div>
            <ABMBadge active={cuadrilla.activo} />
          </div>

          {/* Miembros */}
          {miembros.length > 0 ? (
            <div className="space-y-2">
              {miembros.map(m => (
                <div
                  key={m.id}
                  className="flex items-center justify-between p-3 rounded-xl cursor-pointer transition-colors hover:opacity-80"
                  style={{ backgroundColor: theme.backgroundSecondary }}
                  onClick={() => openSheet(m)}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                      style={{
                        backgroundColor: m.es_lider ? '#fef3c7' : theme.border,
                        color: m.es_lider ? '#f59e0b' : theme.text
                      }}
                    >
                      {m.empleado?.nombre?.[0]}{m.empleado?.apellido?.[0]}
                    </div>
                    <div>
                      <span className="font-medium text-sm" style={{ color: theme.text }}>
                        {getNombreCompleto(m.empleado)}
                      </span>
                      {m.es_lider && (
                        <div className="flex items-center gap-1 text-xs" style={{ color: '#f59e0b' }}>
                          <Crown className="h-3 w-3" />
                          Lider
                        </div>
                      )}
                    </div>
                  </div>
                  <ABMCardActions
                    onEdit={() => openSheet(m)}
                    onDelete={() => handleDelete(m.id)}
                  />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-center py-4" style={{ color: theme.textSecondary }}>
              Sin miembros asignados
            </p>
          )}
        </div>
      ))}
    </ABMPage>
  );
}
