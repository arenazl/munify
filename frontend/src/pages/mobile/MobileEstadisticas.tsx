import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  TrendingUp,
  CheckCircle2,
  Clock,
  BarChart3,
  Loader2
} from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { publicoApi } from '../../lib/api';

interface EstadisticasMunicipio {
  total: number;
  nuevos: number;
  en_curso: number;
  resueltos: number;
  por_zona: { zona: string; cantidad: number }[];
  por_categoria: { categoria: string; color: string; cantidad: number }[];
}

export default function MobileEstadisticas() {
  const { theme } = useTheme();
  const navigate = useNavigate();
  const [stats, setStats] = useState<EstadisticasMunicipio | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadStats = async () => {
      try {
        const municipioId = localStorage.getItem('municipio_id');
        if (!municipioId) {
          setError('No se encontró el municipio');
          return;
        }
        const res = await publicoApi.getEstadisticasMunicipio(parseInt(municipioId));
        setStats(res.data);
      } catch (err) {
        setError('No se pudieron cargar las estadísticas');
      } finally {
        setLoading(false);
      }
    };
    loadStats();
  }, []);

  const municipioNombre = localStorage.getItem('municipio_nombre') || 'Municipio';

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: theme.primary }} />
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="p-4">
        <div
          className="rounded-xl p-6 text-center"
          style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
        >
          <BarChart3 className="h-12 w-12 mx-auto mb-3" style={{ color: theme.textSecondary }} />
          <p style={{ color: theme.text }}>{error || 'Error al cargar'}</p>
          <button
            onClick={() => navigate('/app')}
            className="mt-4 px-4 py-2 rounded-lg"
            style={{ backgroundColor: theme.primary, color: '#fff' }}
          >
            Volver
          </button>
        </div>
      </div>
    );
  }

  const tasaResolucion = stats.total > 0 ? Math.round((stats.resueltos / stats.total) * 100) : 0;

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: theme.background }}>
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 border-b"
        style={{ backgroundColor: theme.card, borderColor: theme.border }}
      >
        <button
          onClick={() => navigate('/app')}
          className="p-2 -ml-2 rounded-lg transition-colors"
          style={{ color: theme.text }}
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="font-semibold" style={{ color: theme.text }}>Estadísticas</h1>
          <p className="text-xs" style={{ color: theme.textSecondary }}>{municipioNombre}</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Cards de resumen */}
        <div className="grid grid-cols-2 gap-3">
          <div
            className="rounded-xl p-4"
            style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
          >
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="h-4 w-4" style={{ color: theme.primary }} />
              <span className="text-xs font-medium" style={{ color: theme.textSecondary }}>Total</span>
            </div>
            <p className="text-2xl font-bold" style={{ color: theme.text }}>{stats.total}</p>
            <p className="text-xs" style={{ color: theme.textSecondary }}>reclamos</p>
          </div>

          <div
            className="rounded-xl p-4"
            style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
          >
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 className="h-4 w-4" style={{ color: '#10b981' }} />
              <span className="text-xs font-medium" style={{ color: theme.textSecondary }}>Resueltos</span>
            </div>
            <p className="text-2xl font-bold" style={{ color: '#10b981' }}>{tasaResolucion}%</p>
            <p className="text-xs" style={{ color: theme.textSecondary }}>{stats.resueltos} de {stats.total}</p>
          </div>
        </div>

        {/* Estado actual */}
        <div
          className="rounded-xl p-4"
          style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
        >
          <h3 className="font-medium mb-3" style={{ color: theme.text }}>Estado actual</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#6b7280' }} />
                <span className="text-sm" style={{ color: theme.text }}>Nuevos</span>
              </div>
              <span className="font-medium" style={{ color: theme.text }}>{stats.nuevos}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#f59e0b' }} />
                <span className="text-sm" style={{ color: theme.text }}>En proceso</span>
              </div>
              <span className="font-medium" style={{ color: theme.text }}>{stats.en_curso}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#10b981' }} />
                <span className="text-sm" style={{ color: theme.text }}>Resueltos</span>
              </div>
              <span className="font-medium" style={{ color: theme.text }}>{stats.resueltos}</span>
            </div>
          </div>
        </div>

        {/* Por categoría */}
        {stats.por_categoria.length > 0 && (
          <div
            className="rounded-xl p-4"
            style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
          >
            <h3 className="font-medium mb-3" style={{ color: theme.text }}>Por categoría</h3>
            <div className="space-y-2">
              {stats.por_categoria.slice(0, 5).map((cat, i) => {
                const maxCant = stats.por_categoria[0]?.cantidad || 1;
                const width = Math.max((cat.cantidad / maxCant) * 100, 10);
                return (
                  <div key={i}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm truncate" style={{ color: theme.text }}>{cat.categoria}</span>
                      <span className="text-sm font-medium" style={{ color: theme.textSecondary }}>{cat.cantidad}</span>
                    </div>
                    <div
                      className="h-2 rounded-full"
                      style={{ backgroundColor: theme.backgroundSecondary }}
                    >
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${width}%`,
                          backgroundColor: cat.color || theme.primary
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Por zona */}
        {stats.por_zona.length > 0 && (
          <div
            className="rounded-xl p-4"
            style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
          >
            <h3 className="font-medium mb-3" style={{ color: theme.text }}>Por zona</h3>
            <div className="space-y-2">
              {stats.por_zona.slice(0, 5).map((zona, i) => {
                const maxCant = stats.por_zona[0]?.cantidad || 1;
                const width = Math.max((zona.cantidad / maxCant) * 100, 10);
                return (
                  <div key={i}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm truncate" style={{ color: theme.text }}>{zona.zona}</span>
                      <span className="text-sm font-medium" style={{ color: theme.textSecondary }}>{zona.cantidad}</span>
                    </div>
                    <div
                      className="h-2 rounded-full"
                      style={{ backgroundColor: theme.backgroundSecondary }}
                    >
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${width}%`, backgroundColor: theme.primary }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Footer informativo */}
        <p className="text-center text-xs py-2" style={{ color: theme.textSecondary }}>
          Datos en tiempo real del sistema de reclamos
        </p>
      </div>
    </div>
  );
}
