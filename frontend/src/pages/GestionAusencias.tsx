import { useEffect, useState } from 'react';
import { Edit, Trash2, CalendarOff, Check, X, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { empleadosApi, empleadosGestionApi } from '../lib/api';
import { useTheme } from '../contexts/ThemeContext';
import {
  ABMPage, ABMBadge, ABMSheetFooter, ABMInput, ABMTextarea,
  ABMSelect, ABMTable, ABMTableAction, ABMCardActions
} from '../components/ui/ABMPage';

interface Empleado {
  id: number;
  nombre: string;
  apellido?: string;
}

interface Ausencia {
  id: number;
  empleado_id: number;
  tipo: string;
  fecha_inicio: string;
  fecha_fin: string;
  motivo?: string;
  aprobado: boolean;
  aprobado_por_id?: number;
  fecha_aprobacion?: string;
  empleado?: Empleado;
}

const TIPOS_AUSENCIA = [
  { value: 'vacaciones', label: 'Vacaciones', color: '#3b82f6' },
  { value: 'licencia_medica', label: 'Licencia Medica', color: '#ef4444' },
  { value: 'licencia_personal', label: 'Licencia Personal', color: '#8b5cf6' },
  { value: 'capacitacion', label: 'Capacitacion', color: '#10b981' },
  { value: 'franco_compensatorio', label: 'Franco Compensatorio', color: '#f59e0b' },
  { value: 'otro', label: 'Otro', color: '#6b7280' },
];

export default function GestionAusencias() {
  const { theme } = useTheme();
  const [ausencias, setAusencias] = useState<Ausencia[]>([]);
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [filterAprobado, setFilterAprobado] = useState<string>('');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedAusencia, setSelectedAusencia] = useState<Ausencia | null>(null);
  const [formData, setFormData] = useState({
    empleado_id: '',
    tipo: 'vacaciones',
    fecha_inicio: '',
    fecha_fin: '',
    motivo: ''
  });

  useEffect(() => {
    fetchData();
  }, [filterAprobado]);

  const fetchData = async () => {
    try {
      const params: { aprobado?: boolean } = {};
      if (filterAprobado === 'pendientes') params.aprobado = false;
      if (filterAprobado === 'aprobadas') params.aprobado = true;

      const [ausenciasRes, empleadosRes] = await Promise.all([
        empleadosGestionApi.getAusencias(params),
        empleadosApi.getAll(true)
      ]);
      setAusencias(ausenciasRes.data);
      setEmpleados(empleadosRes.data);
    } catch (error) {
      toast.error('Error al cargar datos');
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const openSheet = (ausencia: Ausencia | null = null) => {
    if (ausencia) {
      setFormData({
        empleado_id: ausencia.empleado_id.toString(),
        tipo: ausencia.tipo,
        fecha_inicio: ausencia.fecha_inicio,
        fecha_fin: ausencia.fecha_fin,
        motivo: ausencia.motivo || ''
      });
      setSelectedAusencia(ausencia);
    } else {
      setFormData({
        empleado_id: '',
        tipo: 'vacaciones',
        fecha_inicio: '',
        fecha_fin: '',
        motivo: ''
      });
      setSelectedAusencia(null);
    }
    setSheetOpen(true);
  };

  const closeSheet = () => {
    setSheetOpen(false);
    setSelectedAusencia(null);
  };

  const handleSubmit = async () => {
    if (!formData.empleado_id || !formData.fecha_inicio || !formData.fecha_fin) {
      toast.error('Completa los campos requeridos');
      return;
    }

    setSaving(true);
    try {
      if (selectedAusencia) {
        await empleadosGestionApi.updateAusencia(selectedAusencia.id, {
          tipo: formData.tipo,
          fecha_inicio: formData.fecha_inicio,
          fecha_fin: formData.fecha_fin,
          motivo: formData.motivo || undefined
        });
        toast.success('Ausencia actualizada');
      } else {
        await empleadosGestionApi.createAusencia({
          empleado_id: parseInt(formData.empleado_id),
          tipo: formData.tipo,
          fecha_inicio: formData.fecha_inicio,
          fecha_fin: formData.fecha_fin,
          motivo: formData.motivo || undefined
        });
        toast.success('Ausencia registrada');
      }
      fetchData();
      closeSheet();
    } catch (error) {
      toast.error('Error al guardar');
      console.error('Error:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleAprobar = async (ausencia: Ausencia, aprobar: boolean) => {
    try {
      await empleadosGestionApi.updateAusencia(ausencia.id, { aprobado: aprobar });
      toast.success(aprobar ? 'Ausencia aprobada' : 'Ausencia rechazada');
      fetchData();
    } catch (error) {
      toast.error('Error al actualizar');
      console.error('Error:', error);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await empleadosGestionApi.deleteAusencia(id);
      toast.success('Ausencia eliminada');
      fetchData();
    } catch (error) {
      toast.error('Error al eliminar');
      console.error('Error:', error);
    }
  };

  const getNombreCompleto = (e?: Empleado) => {
    if (!e) return '-';
    return e.apellido ? `${e.nombre} ${e.apellido}` : e.nombre;
  };

  const getTipoConfig = (tipo: string) => {
    return TIPOS_AUSENCIA.find(t => t.value === tipo) || TIPOS_AUSENCIA[5];
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const filteredAusencias = ausencias.filter(a =>
    getNombreCompleto(a.empleado).toLowerCase().includes(search.toLowerCase()) ||
    a.tipo.toLowerCase().includes(search.toLowerCase())
  );

  const tableColumns = [
    {
      key: 'empleado',
      header: 'Empleado',
      sortValue: (a: Ausencia) => getNombreCompleto(a.empleado),
      render: (a: Ausencia) => (
        <span className="font-medium">{getNombreCompleto(a.empleado)}</span>
      ),
    },
    {
      key: 'tipo',
      header: 'Tipo',
      sortValue: (a: Ausencia) => a.tipo,
      render: (a: Ausencia) => {
        const config = getTipoConfig(a.tipo);
        return (
          <span
            className="px-2 py-1 text-xs rounded-full"
            style={{ backgroundColor: `${config.color}20`, color: config.color }}
          >
            {config.label}
          </span>
        );
      },
    },
    {
      key: 'fechas',
      header: 'Periodo',
      sortValue: (a: Ausencia) => a.fecha_inicio,
      render: (a: Ausencia) => (
        <span className="text-sm">
          {formatDate(a.fecha_inicio)} - {formatDate(a.fecha_fin)}
        </span>
      ),
    },
    {
      key: 'aprobado',
      header: 'Estado',
      sortValue: (a: Ausencia) => a.aprobado,
      render: (a: Ausencia) => (
        <span
          className="px-2 py-1 text-xs rounded-full flex items-center gap-1 w-fit"
          style={{
            backgroundColor: a.aprobado ? '#10b98120' : '#f59e0b20',
            color: a.aprobado ? '#10b981' : '#f59e0b'
          }}
        >
          {a.aprobado ? <Check className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
          {a.aprobado ? 'Aprobada' : 'Pendiente'}
        </span>
      ),
    },
  ];

  return (
    <ABMPage
      title="Ausencias"
      buttonLabel="Nueva Ausencia"
      onAdd={() => openSheet()}
      searchPlaceholder="Buscar por empleado o tipo..."
      searchValue={search}
      onSearchChange={setSearch}
      loading={loading}
      isEmpty={filteredAusencias.length === 0}
      emptyMessage="No hay ausencias registradas"
      sheetOpen={sheetOpen}
      sheetTitle={selectedAusencia ? 'Editar Ausencia' : 'Nueva Ausencia'}
      sheetDescription={selectedAusencia ? 'Modifica los datos de la ausencia' : 'Registra vacaciones, licencias o permisos'}
      onSheetClose={closeSheet}
      filters={
        <ABMSelect
          value={filterAprobado}
          onChange={(e) => setFilterAprobado(e.target.value)}
          placeholder="Todos los estados"
          options={[
            { value: '', label: 'Todos' },
            { value: 'pendientes', label: 'Pendientes' },
            { value: 'aprobadas', label: 'Aprobadas' }
          ]}
        />
      }
      tableView={
        <ABMTable
          data={filteredAusencias}
          columns={tableColumns}
          keyExtractor={(a) => a.id}
          onRowClick={(a) => openSheet(a)}
          actions={(a) => (
            <>
              {!a.aprobado && (
                <ABMTableAction
                  icon={<Check className="h-4 w-4" />}
                  onClick={() => handleAprobar(a, true)}
                  title="Aprobar"
                />
              )}
              <ABMTableAction
                icon={<Edit className="h-4 w-4" />}
                onClick={() => openSheet(a)}
                title="Editar"
              />
              <ABMTableAction
                icon={<Trash2 className="h-4 w-4" />}
                onClick={() => handleDelete(a.id)}
                title="Eliminar"
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
            disabled={!!selectedAusencia}
          />

          <ABMSelect
            label="Tipo de Ausencia"
            required
            value={formData.tipo}
            onChange={(e) => setFormData({ ...formData, tipo: e.target.value })}
            options={TIPOS_AUSENCIA}
          />

          <div className="grid grid-cols-2 gap-4">
            <ABMInput
              label="Fecha Inicio"
              type="date"
              required
              value={formData.fecha_inicio}
              onChange={(e) => setFormData({ ...formData, fecha_inicio: e.target.value })}
            />
            <ABMInput
              label="Fecha Fin"
              type="date"
              required
              value={formData.fecha_fin}
              onChange={(e) => setFormData({ ...formData, fecha_fin: e.target.value })}
            />
          </div>

          <ABMTextarea
            label="Motivo"
            value={formData.motivo}
            onChange={(e) => setFormData({ ...formData, motivo: e.target.value })}
            placeholder="Descripcion o justificacion (opcional)"
            rows={3}
          />
        </form>
      }
    >
      {/* Vista Cards */}
      {filteredAusencias.map((a) => {
        const config = getTipoConfig(a.tipo);
        return (
          <div
            key={a.id}
            onClick={() => openSheet(a)}
            className="group relative rounded-2xl p-5 cursor-pointer overflow-hidden abm-card-hover animate-fade-in-up"
            style={{
              backgroundColor: theme.card,
              border: `1px solid ${theme.border}`,
            }}
          >
            {/* Linea de color */}
            <div
              className="absolute top-0 left-0 right-0 h-1"
              style={{ backgroundColor: config.color }}
            />

            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ backgroundColor: `${config.color}20` }}
                >
                  <CalendarOff className="h-5 w-5" style={{ color: config.color }} />
                </div>
                <div>
                  <p className="font-semibold" style={{ color: theme.text }}>
                    {getNombreCompleto(a.empleado)}
                  </p>
                  <span
                    className="text-xs px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: `${config.color}20`, color: config.color }}
                  >
                    {config.label}
                  </span>
                </div>
              </div>

              <span
                className="px-2 py-1 text-xs rounded-full flex items-center gap-1"
                style={{
                  backgroundColor: a.aprobado ? '#10b98120' : '#f59e0b20',
                  color: a.aprobado ? '#10b981' : '#f59e0b'
                }}
              >
                {a.aprobado ? <Check className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                {a.aprobado ? 'Aprobada' : 'Pendiente'}
              </span>
            </div>

            <div className="mt-4 flex items-center gap-2 text-sm" style={{ color: theme.textSecondary }}>
              <Clock className="h-4 w-4" />
              {formatDate(a.fecha_inicio)} - {formatDate(a.fecha_fin)}
            </div>

            {a.motivo && (
              <p className="mt-2 text-sm line-clamp-2" style={{ color: theme.textSecondary }}>
                {a.motivo}
              </p>
            )}

            <div className="flex items-center justify-between mt-4 pt-3" style={{ borderTop: `1px solid ${theme.border}` }}>
              {!a.aprobado && (
                <button
                  onClick={(e) => { e.stopPropagation(); handleAprobar(a, true); }}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                  style={{ backgroundColor: '#10b98120', color: '#10b981' }}
                >
                  <Check className="h-3 w-3" />
                  Aprobar
                </button>
              )}
              <div className="flex-1" />
              <ABMCardActions
                onEdit={() => openSheet(a)}
                onDelete={() => handleDelete(a.id)}
              />
            </div>
          </div>
        );
      })}
    </ABMPage>
  );
}
