import { useEffect, useMemo, useState } from 'react';
import { TrendingUp } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { TesoreriaHint } from '../components/tesoreria/TesoreriaHint';
import { ABMPage } from '../components/ui/ABMPage';
import { gastosApi } from '../lib/api';
import type { ProyeccionResponse } from '../types';

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export default function TesoreriaProyecciones() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const [data, setData] = useState<ProyeccionResponse | null>(null);
  const [loading, setLoading] = useState(true);

  if (user && user.rol !== 'admin' && user.rol !== 'supervisor') return <p className="p-6 text-sm">Sin permisos.</p>;

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
    <>
      <div className="px-4 pt-3">
        <TesoreriaHint titulo="Proyección de Pagos" storageKey="proyecciones">
          Te mostramos cuánto vas a tener que pagar mes a mes según las
          cuotas pendientes que cargaste (sueldos recurrentes, préstamos,
          etc). Útil para planificar el flujo de caja.
        </TesoreriaHint>
      </div>

      <ABMPage
        title="Proyección de Pagos"
        icon={<TrendingUp className="h-5 w-5" />}
        backLink="/gestion/tesoreria"
        searchValue=""
        onSearchChange={() => {}}
        loading={loading}
        isEmpty={!loading && (!data || data.por_mes.length === 0)}
        emptyMessage="No hay cuotas futuras. Cargá gastos con tipo 'cuotas' o 'recurrente' para verlas acá."
      >
        {data && data.por_mes.length > 0 && (
          <div className="col-span-full space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
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
                        <span className="absolute inset-0 flex items-center px-2 text-xs font-bold" style={{ color: pct > 30 ? theme.card : theme.text }}>
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
          </div>
        )}
      </ABMPage>
    </>
  );
}
