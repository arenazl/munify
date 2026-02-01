import { useEffect, useState } from 'react';
import { BarChart3, CheckCircle, Clock, TrendingUp, Calendar, Award, Target } from 'lucide-react';
import { reclamosApi } from '../lib/api';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { StickyPageHeader } from '../components/ui/StickyPageHeader';

interface EstadisticasEmpleado {
  total_asignados: number;
  resueltos: number;
  en_curso: number;
  pendientes: number;
  resueltos_este_mes: number;
  tiempo_promedio_resolucion: number; // en días
  por_categoria: Array<{ categoria: string; cantidad: number }>;
  ultimos_resueltos: Array<{
    id: number;
    titulo: string;
    categoria: string;
    fecha_resolucion: string;
  }>;
}

export default function MiRendimiento() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const [stats, setStats] = useState<EstadisticasEmpleado | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const response = await reclamosApi.getMisEstadisticas();
      setStats(response.data);
    } catch (error) {
      console.error('Error cargando estadísticas:', error);
      // Datos de ejemplo si falla
      setStats({
        total_asignados: 0,
        resueltos: 0,
        en_curso: 0,
        pendientes: 0,
        resueltos_este_mes: 0,
        tiempo_promedio_resolucion: 0,
        por_categoria: [],
        ultimos_resueltos: [],
      });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2" style={{ borderColor: theme.primary }} />
      </div>
    );
  }

  const porcentajeResueltos = stats && stats.total_asignados > 0
    ? Math.round((stats.resueltos / stats.total_asignados) * 100)
    : 0;

  return (
    <div className="space-y-6">
      <StickyPageHeader
        icon={<BarChart3 className="h-5 w-5" />}
        title="Mi Rendimiento"
      />

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div
          className="rounded-xl p-4"
          style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: '#3b82f620' }}
            >
              <Target className="h-5 w-5" style={{ color: '#3b82f6' }} />
            </div>
            <div>
              <p className="text-2xl font-bold" style={{ color: theme.text }}>
                {stats?.total_asignados || 0}
              </p>
              <p className="text-xs" style={{ color: theme.textSecondary }}>
                Total asignados
              </p>
            </div>
          </div>
        </div>

        <div
          className="rounded-xl p-4"
          style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: '#10b98120' }}
            >
              <CheckCircle className="h-5 w-5" style={{ color: '#10b981' }} />
            </div>
            <div>
              <p className="text-2xl font-bold" style={{ color: theme.text }}>
                {stats?.resueltos || 0}
              </p>
              <p className="text-xs" style={{ color: theme.textSecondary }}>
                Resueltos
              </p>
            </div>
          </div>
        </div>

        <div
          className="rounded-xl p-4"
          style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: '#f59e0b20' }}
            >
              <Clock className="h-5 w-5" style={{ color: '#f59e0b' }} />
            </div>
            <div>
              <p className="text-2xl font-bold" style={{ color: theme.text }}>
                {stats?.en_curso || 0}
              </p>
              <p className="text-xs" style={{ color: theme.textSecondary }}>
                En proceso
              </p>
            </div>
          </div>
        </div>

        <div
          className="rounded-xl p-4"
          style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: '#8b5cf620' }}
            >
              <TrendingUp className="h-5 w-5" style={{ color: '#8b5cf6' }} />
            </div>
            <div>
              <p className="text-2xl font-bold" style={{ color: theme.text }}>
                {porcentajeResueltos}%
              </p>
              <p className="text-xs" style={{ color: theme.textSecondary }}>
                Tasa resolución
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Segunda fila de stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Este mes */}
        <div
          className="rounded-xl p-5"
          style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
        >
          <div className="flex items-center gap-3 mb-4">
            <Calendar className="h-5 w-5" style={{ color: theme.primary }} />
            <h3 className="font-semibold" style={{ color: theme.text }}>Este Mes</h3>
          </div>
          <p className="text-4xl font-bold mb-1" style={{ color: theme.primary }}>
            {stats?.resueltos_este_mes || 0}
          </p>
          <p className="text-sm" style={{ color: theme.textSecondary }}>
            reclamos resueltos
          </p>
        </div>

        {/* Tiempo promedio */}
        <div
          className="rounded-xl p-5"
          style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
        >
          <div className="flex items-center gap-3 mb-4">
            <Clock className="h-5 w-5" style={{ color: theme.primary }} />
            <h3 className="font-semibold" style={{ color: theme.text }}>Tiempo Promedio</h3>
          </div>
          <p className="text-4xl font-bold mb-1" style={{ color: theme.primary }}>
            {stats?.tiempo_promedio_resolucion?.toFixed(1) || '0'}
          </p>
          <p className="text-sm" style={{ color: theme.textSecondary }}>
            días por reclamo
          </p>
        </div>

        {/* Logro */}
        <div
          className="rounded-xl p-5"
          style={{
            backgroundColor: theme.card,
            border: `1px solid ${theme.border}`,
            background: `linear-gradient(135deg, ${theme.card} 0%, ${theme.primary}10 100%)`
          }}
        >
          <div className="flex items-center gap-3 mb-4">
            <Award className="h-5 w-5" style={{ color: theme.primary }} />
            <h3 className="font-semibold" style={{ color: theme.text }}>Rendimiento</h3>
          </div>
          <p className="text-lg font-bold mb-1" style={{ color: theme.primary }}>
            {porcentajeResueltos >= 80 ? 'Excelente' :
             porcentajeResueltos >= 60 ? 'Muy Bueno' :
             porcentajeResueltos >= 40 ? 'Bueno' : 'En progreso'}
          </p>
          <div className="w-full h-2 rounded-full mt-2" style={{ backgroundColor: theme.backgroundSecondary }}>
            <div
              className="h-2 rounded-full transition-all duration-500"
              style={{
                width: `${porcentajeResueltos}%`,
                backgroundColor: theme.primary
              }}
            />
          </div>
        </div>
      </div>

      {/* Reclamos por categoría */}
      {stats?.por_categoria && stats.por_categoria.length > 0 && (
        <div
          className="rounded-xl p-5"
          style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
        >
          <h3 className="font-semibold mb-4" style={{ color: theme.text }}>
            Reclamos por Categoría
          </h3>
          <div className="space-y-3">
            {stats.por_categoria.slice(0, 5).map((cat, i) => {
              const maxCantidad = Math.max(...stats.por_categoria.map(c => c.cantidad));
              const porcentaje = (cat.cantidad / maxCantidad) * 100;
              return (
                <div key={i}>
                  <div className="flex justify-between text-sm mb-1">
                    <span style={{ color: theme.text }}>{cat.categoria}</span>
                    <span style={{ color: theme.textSecondary }}>{cat.cantidad}</span>
                  </div>
                  <div
                    className="h-2 rounded-full"
                    style={{ backgroundColor: theme.backgroundSecondary }}
                  >
                    <div
                      className="h-2 rounded-full transition-all duration-500"
                      style={{
                        width: `${porcentaje}%`,
                        backgroundColor: theme.primary
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Últimos resueltos */}
      {stats?.ultimos_resueltos && stats.ultimos_resueltos.length > 0 && (
        <div
          className="rounded-xl p-5"
          style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
        >
          <h3 className="font-semibold mb-4" style={{ color: theme.text }}>
            Últimos Reclamos Resueltos
          </h3>
          <div className="space-y-3">
            {stats.ultimos_resueltos.slice(0, 5).map((reclamo) => (
              <div
                key={reclamo.id}
                className="flex items-center justify-between p-3 rounded-lg"
                style={{ backgroundColor: theme.backgroundSecondary }}
              >
                <div className="flex items-center gap-3">
                  <CheckCircle className="h-4 w-4" style={{ color: '#10b981' }} />
                  <div>
                    <p className="text-sm font-medium" style={{ color: theme.text }}>
                      {reclamo.titulo}
                    </p>
                    <p className="text-xs" style={{ color: theme.textSecondary }}>
                      {reclamo.categoria}
                    </p>
                  </div>
                </div>
                <span className="text-xs" style={{ color: theme.textSecondary }}>
                  {reclamo.fecha_resolucion}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Mensaje si no hay datos */}
      {(!stats || stats.total_asignados === 0) && (
        <div
          className="rounded-xl p-8 text-center"
          style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
        >
          <BarChart3 className="h-12 w-12 mx-auto mb-3 opacity-50" style={{ color: theme.textSecondary }} />
          <p style={{ color: theme.textSecondary }}>
            Aún no tenés reclamos asignados. Las estadísticas aparecerán cuando comiences a trabajar.
          </p>
        </div>
      )}
    </div>
  );
}
