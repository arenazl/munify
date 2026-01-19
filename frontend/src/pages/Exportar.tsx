import { useState } from 'react';
import {
  FileDown,
  FileSpreadsheet,
  Users,
  BarChart3,
  Clock,
  Download,
  Loader2,
  Calendar,
  Filter,
  Sparkles
} from 'lucide-react';
import { toast } from 'sonner';
import { exportarApi } from '../lib/api';
import { useTheme } from '../contexts/ThemeContext';
import { StickyPageHeader } from '../components/ui/StickyPageHeader';

interface ExportOption {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  hasFilters?: boolean;
  hasDays?: boolean;
}

const exportOptions: ExportOption[] = [
  {
    id: 'reclamos',
    title: 'Reclamos',
    description: 'Listado completo de reclamos con todos sus datos',
    icon: <FileSpreadsheet className="h-6 w-6" />,
    color: '#3b82f6',
    hasFilters: true,
  },
  {
    id: 'estadisticas',
    title: 'Estadísticas',
    description: 'Reporte de estadísticas por estado, categoría, zona y empleado',
    icon: <BarChart3 className="h-6 w-6" />,
    color: '#8b5cf6',
    hasDays: true,
  },
  {
    id: 'empleados',
    title: 'Empleados',
    description: 'Listado de empleados con sus categorías y zonas asignadas',
    icon: <Users className="h-6 w-6" />,
    color: '#22c55e',
  },
  {
    id: 'sla',
    title: 'Estado SLA',
    description: 'Reclamos activos con indicadores de cumplimiento SLA',
    icon: <Clock className="h-6 w-6" />,
    color: '#f59e0b',
  },
];

export default function Exportar() {
  const { theme } = useTheme();
  const [loading, setLoading] = useState<string | null>(null);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);

  // Filtros para reclamos
  const [filters, setFilters] = useState({
    estado: '',
    fecha_desde: '',
    fecha_hasta: '',
  });

  // Días para estadísticas
  const [dias, setDias] = useState(30);

  const downloadFile = (blob: Blob, filename: string) => {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  const handleExport = async (optionId: string) => {
    setLoading(optionId);

    try {
      let response;
      let filename = '';
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

      switch (optionId) {
        case 'reclamos':
          response = await exportarApi.reclamosCsv({
            estado: filters.estado || undefined,
            fecha_desde: filters.fecha_desde || undefined,
            fecha_hasta: filters.fecha_hasta || undefined,
          });
          filename = `reclamos_${timestamp}.csv`;
          break;
        case 'estadisticas':
          response = await exportarApi.estadisticasCsv(dias);
          filename = `estadisticas_${timestamp}.csv`;
          break;
        case 'empleados':
          response = await exportarApi.empleadosCsv();
          filename = `empleados_${timestamp}.csv`;
          break;
        case 'sla':
          response = await exportarApi.slaCsv();
          filename = `sla_estado_${timestamp}.csv`;
          break;
        default:
          throw new Error('Opción no válida');
      }

      downloadFile(response.data, filename);
      toast.success(`Archivo ${filename} descargado correctamente`);
      setSelectedOption(null);
    } catch (error) {
      console.error('Error exporting:', error);
      toast.error('Error al exportar el archivo');
    } finally {
      setLoading(null);
    }
  };

  const option = selectedOption ? exportOptions.find(o => o.id === selectedOption) : null;

  return (
    <div className="space-y-6">
      <StickyPageHeader
        icon={<FileDown className="h-5 w-5" />}
        title="Exportar Informes"
      />

      {/* Export Options Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {exportOptions.map((opt) => (
          <button
            key={opt.id}
            onClick={() => {
              if (opt.hasFilters || opt.hasDays) {
                setSelectedOption(opt.id);
              } else {
                handleExport(opt.id);
              }
            }}
            disabled={loading !== null}
            className="text-left rounded-xl p-5 transition-all duration-200 hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100"
            style={{
              backgroundColor: theme.card,
              border: `1px solid ${selectedOption === opt.id ? opt.color : theme.border}`,
              boxShadow: selectedOption === opt.id ? `0 0 0 2px ${opt.color}30` : 'none',
            }}
          >
            <div className="flex items-start gap-4">
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: `${opt.color}20`, color: opt.color }}
              >
                {loading === opt.id ? (
                  <Loader2 className="h-6 w-6 animate-spin" />
                ) : (
                  opt.icon
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-base" style={{ color: theme.text }}>
                  {opt.title}
                </h3>
                <p className="text-sm mt-1" style={{ color: theme.textSecondary }}>
                  {opt.description}
                </p>
                {(opt.hasFilters || opt.hasDays) && (
                  <div
                    className="mt-2 flex items-center gap-1.5 text-xs"
                    style={{ color: opt.color }}
                  >
                    <Filter className="h-3.5 w-3.5" />
                    <span>Click para configurar filtros</span>
                  </div>
                )}
              </div>
              <Download
                className="h-5 w-5 flex-shrink-0 opacity-40"
                style={{ color: theme.textSecondary }}
              />
            </div>
          </button>
        ))}
      </div>

      {/* Filters Panel */}
      {selectedOption && option && (
        <div
          className="rounded-xl p-5 animate-in fade-in slide-in-from-top-4 duration-300"
          style={{
            backgroundColor: theme.card,
            border: `1px solid ${option.color}50`,
          }}
        >
          <div className="flex items-center gap-3 mb-4">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: `${option.color}20`, color: option.color }}
            >
              <Filter className="h-4 w-4" />
            </div>
            <h3 className="font-semibold" style={{ color: theme.text }}>
              Configurar exportación de {option.title}
            </h3>
          </div>

          {/* Reclamos Filters */}
          {option.hasFilters && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label
                    className="block text-xs font-medium mb-1.5"
                    style={{ color: theme.textSecondary }}
                  >
                    Estado
                  </label>
                  <select
                    value={filters.estado}
                    onChange={(e) => setFilters({ ...filters, estado: e.target.value })}
                    className="w-full rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
                    style={{
                      backgroundColor: theme.backgroundSecondary,
                      border: `1px solid ${theme.border}`,
                      color: theme.text,
                    }}
                  >
                    <option value="">Todos los estados</option>
                    <option value="nuevo">Nuevo</option>
                    <option value="asignado">Asignado</option>
                    <option value="en_progreso">En Progreso</option>
                    <option value="resuelto">Resuelto</option>
                    <option value="rechazado">Rechazado</option>
                  </select>
                </div>
                <div>
                  <label
                    className="block text-xs font-medium mb-1.5"
                    style={{ color: theme.textSecondary }}
                  >
                    <Calendar className="h-3.5 w-3.5 inline mr-1" />
                    Fecha desde
                  </label>
                  <input
                    type="date"
                    value={filters.fecha_desde}
                    onChange={(e) => setFilters({ ...filters, fecha_desde: e.target.value })}
                    className="w-full rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
                    style={{
                      backgroundColor: theme.backgroundSecondary,
                      border: `1px solid ${theme.border}`,
                      color: theme.text,
                    }}
                  />
                </div>
                <div>
                  <label
                    className="block text-xs font-medium mb-1.5"
                    style={{ color: theme.textSecondary }}
                  >
                    <Calendar className="h-3.5 w-3.5 inline mr-1" />
                    Fecha hasta
                  </label>
                  <input
                    type="date"
                    value={filters.fecha_hasta}
                    onChange={(e) => setFilters({ ...filters, fecha_hasta: e.target.value })}
                    className="w-full rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
                    style={{
                      backgroundColor: theme.backgroundSecondary,
                      border: `1px solid ${theme.border}`,
                      color: theme.text,
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Days Filter for Statistics */}
          {option.hasDays && (
            <div>
              <label
                className="block text-xs font-medium mb-1.5"
                style={{ color: theme.textSecondary }}
              >
                Período de tiempo
              </label>
              <div className="flex gap-2 flex-wrap">
                {[7, 15, 30, 60, 90].map((d) => (
                  <button
                    key={d}
                    onClick={() => setDias(d)}
                    className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
                    style={{
                      backgroundColor: dias === d ? option.color : theme.backgroundSecondary,
                      color: dias === d ? 'white' : theme.text,
                      border: `1px solid ${dias === d ? option.color : theme.border}`,
                    }}
                  >
                    {d} días
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3 mt-5 pt-4" style={{ borderTop: `1px solid ${theme.border}` }}>
            <button
              onClick={() => setSelectedOption(null)}
              className="px-4 py-2.5 rounded-lg text-sm font-medium transition-all"
              style={{
                backgroundColor: theme.backgroundSecondary,
                color: theme.textSecondary,
                border: `1px solid ${theme.border}`,
              }}
            >
              Cancelar
            </button>
            <button
              onClick={() => handleExport(selectedOption)}
              disabled={loading !== null}
              className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2"
              style={{
                background: `linear-gradient(135deg, ${option.color} 0%, ${option.color}cc 100%)`,
                color: 'white',
              }}
            >
              {loading === selectedOption ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generando...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  Descargar CSV
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Info Card */}
      <div
        className="rounded-xl p-5"
        style={{
          backgroundColor: `${theme.primary}08`,
          border: `1px solid ${theme.primary}20`,
        }}
      >
        <div className="flex gap-3">
          <Sparkles className="h-5 w-5 flex-shrink-0 mt-0.5" style={{ color: theme.primary }} />
          <div>
            <h4 className="font-medium text-sm" style={{ color: theme.text }}>
              Formato de archivos
            </h4>
            <p className="text-sm mt-1" style={{ color: theme.textSecondary }}>
              Los archivos se exportan en formato CSV con codificación UTF-8 y separador punto y coma (;),
              compatible con Microsoft Excel y otras herramientas de análisis de datos.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
