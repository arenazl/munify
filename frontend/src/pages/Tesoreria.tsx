import { useEffect, useMemo, useState } from 'react';
import { Plus, Wallet, Users, Map as MapIcon, TrendingUp, Search, Trash2 } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { TesoreriaHint } from '../components/tesoreria/TesoreriaHint';
import { CrearGastoWizard } from '../components/tesoreria/CrearGastoWizard';
import { gastosApi } from '../lib/api';
import type { Gasto } from '../types';

/**
 * Landing del modulo Tesoreria. Tabla simple de gastos del municipio,
 * con CTA grande para cargar uno nuevo. Pensado para que el intendente
 * lo use sin trabarse: pocos filtros visibles, lo avanzado abajo.
 */
export default function Tesoreria() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [wizardOpen, setWizardOpen] = useState(false);

  // Solo admin
  if (user && user.rol !== 'admin') {
    return (
      <div className="p-6">
        <p className="text-sm" style={{ color: theme.textSecondary }}>
          El módulo Tesorería es exclusivo del Administrador del municipio.
        </p>
      </div>
    );
  }

  const fetchGastos = async () => {
    setLoading(true);
    try {
      const res = await gastosApi.list({ limit: 100 });
      setGastos(res.data);
    } catch (e) {
      console.error(e);
      toast.error('Error cargando gastos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchGastos(); }, []);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return gastos;
    return gastos.filter(g =>
      g.concepto.toLowerCase().includes(s) ||
      (g.descripcion?.toLowerCase().includes(s) ?? false)
    );
  }, [gastos, search]);

  const totalMes = useMemo(() => {
    const ahora = new Date();
    return filtered
      .filter(g => {
        const d = new Date(g.fecha);
        return d.getMonth() === ahora.getMonth() && d.getFullYear() === ahora.getFullYear();
      })
      .reduce((acc, g) => acc + parseFloat(g.monto_pesos), 0);
  }, [filtered]);

  const handleDelete = async (id: number) => {
    if (!confirm('¿Eliminar este gasto?')) return;
    try {
      await gastosApi.delete(id);
      toast.success('Gasto eliminado');
      fetchGastos();
    } catch {
      toast.error('Error eliminando');
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      {/* Banner-guía */}
      <TesoreriaHint titulo="Bienvenido a Tesorería" storageKey="home">
        Acá cargás los gastos del municipio: sueldos, pagos a proveedores,
        préstamos, subsidios. Cada gasto se asigna a una <b>Secretaría</b> o
        a un <b>Contacto</b> (persona). Tocá el botón verde grande para
        cargar uno nuevo.
      </TesoreriaHint>

      {/* Header con CTA grande + accesos rápidos */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: theme.text }}>
            <Wallet className="h-7 w-7 inline mr-2" />
            Tesorería
          </h1>
          <p className="text-sm mt-1" style={{ color: theme.textSecondary }}>
            Total gastos este mes:{' '}
            <span className="font-bold" style={{ color: theme.primary }}>
              ${totalMes.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
            </span>
          </p>
        </div>
        <button
          type="button"
          onClick={() => setWizardOpen(true)}
          className="flex items-center gap-2 px-6 py-3 rounded-xl text-base font-bold transition-all hover:scale-[1.02] active:scale-95 shadow-lg"
          style={{
            background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
            color: '#fff',
            boxShadow: '0 6px 20px rgba(34, 197, 94, 0.35)',
          }}
        >
          <Plus className="h-5 w-5" /> Cargar nuevo gasto
        </button>
      </div>

      {/* Accesos rápidos */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
        <Link to="/gestion/tesoreria/contactos" className="p-4 rounded-xl flex items-center gap-3 transition-all hover:scale-[1.02]"
          style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}>
          <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${theme.primary}20`, color: theme.primary }}>
            <Users className="h-5 w-5" />
          </div>
          <div>
            <p className="font-semibold text-sm" style={{ color: theme.text }}>Contactos</p>
            <p className="text-xs" style={{ color: theme.textSecondary }}>Agenda de personas</p>
          </div>
        </Link>
        <Link to="/gestion/tesoreria/mapa" className="p-4 rounded-xl flex items-center gap-3 transition-all hover:scale-[1.02]"
          style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}>
          <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#8b5cf620', color: '#8b5cf6' }}>
            <MapIcon className="h-5 w-5" />
          </div>
          <div>
            <p className="font-semibold text-sm" style={{ color: theme.text }}>Mapa</p>
            <p className="text-xs" style={{ color: theme.textSecondary }}>Contactos geolocalizados</p>
          </div>
        </Link>
        <Link to="/gestion/tesoreria/proyecciones" className="p-4 rounded-xl flex items-center gap-3 transition-all hover:scale-[1.02]"
          style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}>
          <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#f59e0b20', color: '#f59e0b' }}>
            <TrendingUp className="h-5 w-5" />
          </div>
          <div>
            <p className="font-semibold text-sm" style={{ color: theme.text }}>Proyecciones</p>
            <p className="text-xs" style={{ color: theme.textSecondary }}>Cuánto vas a pagar/cobrar</p>
          </div>
        </Link>
      </div>

      {/* Buscador */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: theme.textSecondary }} />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por concepto o descripción..."
          className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm"
          style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}`, color: theme.text }}
        />
      </div>

      {/* Tabla */}
      {loading ? (
        <p className="text-center py-12" style={{ color: theme.textSecondary }}>Cargando...</p>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 rounded-xl" style={{ backgroundColor: theme.card, border: `1px dashed ${theme.border}` }}>
          <Wallet className="h-12 w-12 mx-auto mb-3" style={{ color: theme.textSecondary }} />
          <p className="font-semibold" style={{ color: theme.text }}>Todavía no hay gastos cargados</p>
          <p className="text-sm mt-1" style={{ color: theme.textSecondary }}>Tocá "Cargar nuevo gasto" arriba para empezar.</p>
        </div>
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}>
          <table className="w-full text-sm">
            <thead style={{ backgroundColor: theme.backgroundSecondary }}>
              <tr>
                <th className="text-left p-3" style={{ color: theme.textSecondary }}>Fecha</th>
                <th className="text-left p-3" style={{ color: theme.textSecondary }}>Concepto</th>
                <th className="text-left p-3" style={{ color: theme.textSecondary }}>Destino</th>
                <th className="text-right p-3" style={{ color: theme.textSecondary }}>Monto</th>
                <th className="text-center p-3" style={{ color: theme.textSecondary }}>Tipo</th>
                <th className="text-center p-3" style={{ color: theme.textSecondary }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(g => (
                <tr key={g.id} className="border-t" style={{ borderColor: theme.border }}>
                  <td className="p-3" style={{ color: theme.text }}>{new Date(g.fecha).toLocaleDateString('es-AR')}</td>
                  <td className="p-3 font-medium" style={{ color: theme.text }}>{g.concepto}</td>
                  <td className="p-3" style={{ color: theme.textSecondary }}>
                    {g.destino_tipo === 'contacto' ? 'Contacto' : 'Secretaría'}
                  </td>
                  <td className="p-3 text-right font-bold" style={{ color: theme.text }}>
                    ${parseFloat(g.monto_pesos).toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                  </td>
                  <td className="p-3 text-center">
                    <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: `${theme.primary}20`, color: theme.primary }}>
                      {g.tipo_financiacion}
                    </span>
                  </td>
                  <td className="p-3 text-center">
                    <button
                      type="button"
                      onClick={() => handleDelete(g.id)}
                      className="p-1.5 rounded-lg transition-all hover:scale-110"
                      style={{ color: '#ef4444' }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CrearGastoWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onSuccess={() => { setWizardOpen(false); fetchGastos(); }}
      />
    </div>
  );
}
