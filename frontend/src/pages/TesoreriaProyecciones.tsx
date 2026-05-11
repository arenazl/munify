import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, TrendingUp, Calendar } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { TesoreriaHint } from '../components/tesoreria/TesoreriaHint';
import { gastosApi } from '../lib/api';
import type { ProyeccionResponse } from '../types';

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export default function TesoreriaProyecciones() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const [data, setData] = useState<ProyeccionResponse | null>(null);
  const [loading, setLoading] = useState(true);

  if (user && user.rol !== 'admin') return <p className="p-6 text-sm">Solo Admin.</p>;

  useEffect(() => {
    (async () => {
      try {
        const res = await gastosApi.proyecciones({});
        setData(res.data);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, []);

  const maxTotal = useMemo(() => {
    if (!data) return 0;
    return Math.max(...data.por_mes.map(m => parseFloat(m.total_pesos)), 1);
  }, [data]);

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <Link to="/gestion/tesoreria" className="text-sm inline-flex items-center gap-1 mb-3" style={{ color: theme.primary }}>
        <ArrowLeft className="h-4 w-4" /> Volver a Tesorería
      </Link>

      <TesoreriaHint titulo="Proyección de Pagos" storageKey="proyecciones">
        Te mostramos cuánto vas a tener que pagar mes a mes según las
        cuotas pendientes que cargaste (sueldos recurrentes, préstamos,
        etc). Útil para planificar el flujo de caja.
      </TesoreriaHint>

      <h1 className="text-2xl font-bold flex items-center gap-2 mb-4" style={{ color: theme.text }}>
        <TrendingUp className="h-6 w-6" /> Proyección de Pagos
      </h1>

      {loading ? (
        <p className="text-center py-12" style={{ color: theme.textSecondary }}>Cargando...</p>
      ) : !data || data.por_mes.length === 0 ? (
        <div className="text-center py-16 rounded-xl" style={{ backgroundColor: theme.card, border: `1px dashed ${theme.border}` }}>
          <Calendar className="h-12 w-12 mx-auto mb-3" style={{ color: theme.textSecondary }} />
          <p className="font-semibold" style={{ color: theme.text }}>No hay cuotas futuras</p>
          <p className="text-sm mt-1" style={{ color: theme.textSecondary }}>
            Cargá gastos con tipo "cuotas" o "recurrente" para verlos acá.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
            <div className="p-4 rounded-xl" style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}>
              <p className="text-xs uppercase font-bold" style={{ color: theme.textSecondary }}>Total proyectado</p>
              <p className="text-2xl font-bold mt-1" style={{ color: theme.primary }}>
                ${parseFloat(data.total_pesos).toLocaleString('es-AR', { maximumFractionDigits: 0 })}
              </p>
            </div>
            <div className="p-4 rounded-xl" style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}>
              <p className="text-xs uppercase font-bold" style={{ color: theme.textSecondary }}>Cuotas pendientes</p>
              <p className="text-2xl font-bold mt-1" style={{ color: theme.text }}>{data.cantidad_cuotas}</p>
            </div>
            <div className="p-4 rounded-xl" style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}>
              <p className="text-xs uppercase font-bold" style={{ color: theme.textSecondary }}>Período</p>
              <p className="text-sm font-bold mt-1" style={{ color: theme.text }}>
                {new Date(data.desde).toLocaleDateString('es-AR')} → {new Date(data.hasta).toLocaleDateString('es-AR')}
              </p>
            </div>
          </div>

          <div className="rounded-xl p-4" style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}>
            <h3 className="font-semibold mb-3" style={{ color: theme.text }}>Por mes</h3>
            <div className="space-y-2">
              {data.por_mes.map((m) => {
                const total = parseFloat(m.total_pesos);
                const pct = (total / maxTotal) * 100;
                return (
                  <div key={`${m.anio}-${m.mes}`} className="flex items-center gap-3">
                    <div className="w-32 text-sm" style={{ color: theme.text }}>
                      {MESES[m.mes - 1]} {m.anio}
                    </div>
                    <div className="flex-1 h-6 rounded-md relative overflow-hidden" style={{ backgroundColor: theme.backgroundSecondary }}>
                      <div className="h-full rounded-md transition-all" style={{
                        width: `${pct}%`,
                        background: `linear-gradient(90deg, ${theme.primary} 0%, ${theme.primary}cc 100%)`,
                      }} />
                      <span className="absolute inset-0 flex items-center px-2 text-xs font-bold" style={{ color: pct > 30 ? '#fff' : theme.text }}>
                        ${total.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                      </span>
                    </div>
                    <div className="text-xs w-16 text-right" style={{ color: theme.textSecondary }}>
                      {m.cantidad_cuotas} cuotas
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
