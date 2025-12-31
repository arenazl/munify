import { useEffect, useState } from 'react';
import { Edit, Trash2, Clock, Calendar, Save } from 'lucide-react';
import { toast } from 'sonner';
import { empleadosApi, empleadosGestionApi } from '../lib/api';
import { useTheme } from '../contexts/ThemeContext';
import {
  ABMPage, ABMBadge, ABMSheetFooter, ABMInput,
  ABMSelect, ABMTable, ABMTableAction
} from '../components/ui/ABMPage';

interface Empleado {
  id: number;
  nombre: string;
  apellido?: string;
}

interface Horario {
  id: number;
  empleado_id: number;
  dia_semana: number;
  hora_entrada: string;
  hora_salida: string;
  activo: boolean;
  empleado?: Empleado;
}

const DIAS_SEMANA = [
  { value: 0, label: 'Lunes', short: 'Lun' },
  { value: 1, label: 'Martes', short: 'Mar' },
  { value: 2, label: 'Miercoles', short: 'Mie' },
  { value: 3, label: 'Jueves', short: 'Jue' },
  { value: 4, label: 'Viernes', short: 'Vie' },
  { value: 5, label: 'Sabado', short: 'Sab' },
  { value: 6, label: 'Domingo', short: 'Dom' },
];

export default function GestionHorarios() {
  const { theme } = useTheme();
  const [horarios, setHorarios] = useState<Horario[]>([]);
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedEmpleado, setSelectedEmpleado] = useState<Empleado | null>(null);

  // Estado para edición masiva de horarios de un empleado
  const [horariosSemana, setHorariosSemana] = useState<{
    [dia: number]: { activo: boolean; hora_entrada: string; hora_salida: string }
  }>({});

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [horariosRes, empleadosRes] = await Promise.all([
        empleadosGestionApi.getHorarios(),
        empleadosApi.getAll(true)
      ]);
      setHorarios(horariosRes.data);
      setEmpleados(empleadosRes.data);
    } catch (error) {
      toast.error('Error al cargar datos');
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const openSheet = (empleado: Empleado) => {
    setSelectedEmpleado(empleado);

    // Cargar horarios existentes del empleado
    const horariosEmpleado = horarios.filter(h => h.empleado_id === empleado.id);
    const semana: typeof horariosSemana = {};

    DIAS_SEMANA.forEach(dia => {
      const horario = horariosEmpleado.find(h => h.dia_semana === dia.value);
      semana[dia.value] = horario
        ? { activo: horario.activo, hora_entrada: horario.hora_entrada, hora_salida: horario.hora_salida }
        : { activo: dia.value < 5, hora_entrada: '08:00', hora_salida: '17:00' }; // L-V por defecto
    });

    setHorariosSemana(semana);
    setSheetOpen(true);
  };

  const closeSheet = () => {
    setSheetOpen(false);
    setSelectedEmpleado(null);
  };

  const handleSubmit = async () => {
    if (!selectedEmpleado) return;

    setSaving(true);
    try {
      const horariosArray = DIAS_SEMANA.map(dia => ({
        empleado_id: selectedEmpleado.id,
        dia_semana: dia.value,
        hora_entrada: horariosSemana[dia.value].hora_entrada,
        hora_salida: horariosSemana[dia.value].hora_salida,
        activo: horariosSemana[dia.value].activo
      }));

      await empleadosGestionApi.setHorariosSemana(selectedEmpleado.id, horariosArray);
      toast.success('Horarios actualizados');
      fetchData();
      closeSheet();
    } catch (error) {
      toast.error('Error al guardar horarios');
      console.error('Error:', error);
    } finally {
      setSaving(false);
    }
  };

  const getNombreCompleto = (e?: Empleado) => {
    if (!e) return '-';
    return e.apellido ? `${e.nombre} ${e.apellido}` : e.nombre;
  };

  const getDiaLabel = (dia: number) => {
    return DIAS_SEMANA.find(d => d.value === dia)?.label || '-';
  };

  // Agrupar horarios por empleado
  const horariosPorEmpleado = empleados.map(emp => ({
    empleado: emp,
    horarios: horarios.filter(h => h.empleado_id === emp.id).sort((a, b) => a.dia_semana - b.dia_semana)
  }));

  const filteredEmpleados = horariosPorEmpleado.filter(h =>
    getNombreCompleto(h.empleado).toLowerCase().includes(search.toLowerCase())
  );

  const tableColumns = [
    {
      key: 'empleado',
      header: 'Empleado',
      sortValue: (h: Horario) => getNombreCompleto(h.empleado),
      render: (h: Horario) => (
        <span className="font-medium">{getNombreCompleto(h.empleado)}</span>
      ),
    },
    {
      key: 'dia',
      header: 'Dia',
      sortValue: (h: Horario) => h.dia_semana,
      render: (h: Horario) => getDiaLabel(h.dia_semana),
    },
    {
      key: 'horario',
      header: 'Horario',
      sortValue: (h: Horario) => h.hora_entrada,
      render: (h: Horario) => `${h.hora_entrada} - ${h.hora_salida}`,
    },
    {
      key: 'activo',
      header: 'Estado',
      sortValue: (h: Horario) => h.activo,
      render: (h: Horario) => <ABMBadge active={h.activo} activeLabel="Trabaja" inactiveLabel="No trabaja" />,
    },
  ];

  return (
    <ABMPage
      title="Horarios"
      buttonLabel=""
      onAdd={() => {}}
      searchPlaceholder="Buscar empleado..."
      searchValue={search}
      onSearchChange={setSearch}
      loading={loading}
      isEmpty={filteredEmpleados.length === 0}
      emptyMessage="No hay empleados"
      sheetOpen={sheetOpen}
      sheetTitle={`Horarios de ${getNombreCompleto(selectedEmpleado || undefined)}`}
      sheetDescription="Configura el horario de trabajo para cada dia de la semana"
      onSheetClose={closeSheet}
      tableView={
        <ABMTable
          data={horarios}
          columns={tableColumns}
          keyExtractor={(h) => h.id}
          onRowClick={(h) => {
            const emp = empleados.find(e => e.id === h.empleado_id);
            if (emp) openSheet(emp);
          }}
          actions={(h) => (
            <ABMTableAction
              icon={<Edit className="h-4 w-4" />}
              onClick={() => {
                const emp = empleados.find(e => e.id === h.empleado_id);
                if (emp) openSheet(emp);
              }}
              title="Editar horarios"
            />
          )}
        />
      }
      sheetFooter={
        <ABMSheetFooter
          onCancel={closeSheet}
          onSave={handleSubmit}
          saving={saving}
          saveLabel="Guardar Horarios"
        />
      }
      sheetContent={
        <div className="space-y-3">
          {DIAS_SEMANA.map(dia => (
            <div
              key={dia.value}
              className="flex items-center gap-3 p-3 rounded-xl"
              style={{
                backgroundColor: horariosSemana[dia.value]?.activo ? theme.backgroundSecondary : `${theme.backgroundSecondary}50`,
                opacity: horariosSemana[dia.value]?.activo ? 1 : 0.6
              }}
            >
              <input
                type="checkbox"
                checked={horariosSemana[dia.value]?.activo || false}
                onChange={(e) => setHorariosSemana({
                  ...horariosSemana,
                  [dia.value]: { ...horariosSemana[dia.value], activo: e.target.checked }
                })}
                className="w-4 h-4 rounded"
              />
              <span className="w-24 font-medium" style={{ color: theme.text }}>
                {dia.label}
              </span>
              <input
                type="time"
                value={horariosSemana[dia.value]?.hora_entrada || '08:00'}
                onChange={(e) => setHorariosSemana({
                  ...horariosSemana,
                  [dia.value]: { ...horariosSemana[dia.value], hora_entrada: e.target.value }
                })}
                disabled={!horariosSemana[dia.value]?.activo}
                className="px-2 py-1 rounded-lg text-sm"
                style={{
                  backgroundColor: theme.card,
                  border: `1px solid ${theme.border}`,
                  color: theme.text
                }}
              />
              <span style={{ color: theme.textSecondary }}>-</span>
              <input
                type="time"
                value={horariosSemana[dia.value]?.hora_salida || '17:00'}
                onChange={(e) => setHorariosSemana({
                  ...horariosSemana,
                  [dia.value]: { ...horariosSemana[dia.value], hora_salida: e.target.value }
                })}
                disabled={!horariosSemana[dia.value]?.activo}
                className="px-2 py-1 rounded-lg text-sm"
                style={{
                  backgroundColor: theme.card,
                  border: `1px solid ${theme.border}`,
                  color: theme.text
                }}
              />
            </div>
          ))}
        </div>
      }
    >
      {/* Vista Cards por empleado */}
      {filteredEmpleados.map(({ empleado, horarios: horariosEmp }) => (
        <div
          key={empleado.id}
          onClick={() => openSheet(empleado)}
          className="group rounded-2xl p-5 cursor-pointer abm-card-hover animate-fade-in-up"
          style={{
            backgroundColor: theme.card,
            border: `1px solid ${theme.border}`,
          }}
        >
          <div className="flex items-center gap-3 mb-4">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: '#06b6d420' }}
            >
              <Clock className="h-5 w-5" style={{ color: '#06b6d4' }} />
            </div>
            <div>
              <p className="font-semibold" style={{ color: theme.text }}>
                {getNombreCompleto(empleado)}
              </p>
              <p className="text-xs" style={{ color: theme.textSecondary }}>
                {horariosEmp.filter(h => h.activo).length} dias laborales
              </p>
            </div>
          </div>

          {/* Mini calendario semanal */}
          <div className="grid grid-cols-7 gap-1">
            {DIAS_SEMANA.map(dia => {
              const horario = horariosEmp.find(h => h.dia_semana === dia.value);
              const trabaja = horario?.activo;
              return (
                <div
                  key={dia.value}
                  className="text-center p-2 rounded-lg"
                  style={{
                    backgroundColor: trabaja ? '#10b98120' : theme.backgroundSecondary,
                  }}
                >
                  <div
                    className="text-xs font-medium"
                    style={{ color: trabaja ? '#10b981' : theme.textSecondary }}
                  >
                    {dia.short}
                  </div>
                  {trabaja && horario && (
                    <div className="text-[10px] mt-1" style={{ color: theme.textSecondary }}>
                      {horario.hora_entrada?.slice(0, 5)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex justify-end mt-4 pt-3" style={{ borderTop: `1px solid ${theme.border}` }}>
            <button
              onClick={(e) => { e.stopPropagation(); openSheet(empleado); }}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
              style={{ backgroundColor: `${theme.primary}20`, color: theme.primary }}
            >
              <Edit className="h-3 w-3" />
              Editar horarios
            </button>
          </div>
        </div>
      ))}
    </ABMPage>
  );
}
