/**
 * Pantalla efimera para curar los gastos cargados desde los Excels de Bartolo
 * que cayeron en conceptos genericos (Compras varias, Otros gastos, etc.).
 *
 * Detecta los gastos con tag `[BARTOLO-DUDOSO]` en `observaciones` y permite
 * editarles el concepto rapidamente. Al confirmar, remueve el tag y los saca
 * de la lista.
 *
 * NO requiere modelo nuevo: usa `gastosApi.list()` con search y `gastosApi.update`.
 *
 * Cuando termine la curacion, esta pantalla se puede borrar (link en sidebar
 * y route).
 */
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Sparkles, CheckCircle2, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { ABMPage } from '../components/ui/ABMPage';
import { ModernSelect } from '../components/ui/ModernSelect';
import { gastosApi, conceptosAbmApi } from '../lib/api';
import type { Gasto, Concepto } from '../types';

const TAG = '[BARTOLO-DUDOSO]';

export default function TesoreriaCuracionBartolo() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [conceptos, setConceptos] = useState<Concepto[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [conceptoFiltro, setConceptoFiltro] = useState('');
  const [pendingConcepto, setPendingConcepto] = useState<Record<number, string>>({});

  if (user && user.rol !== 'admin' && user.rol !== 'supervisor') {
    return <div className="p-6"><p className="text-sm" style={{ color: theme.textSecondary }}>Solo gestores.</p></div>;
  }

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [g, c] = await Promise.all([
        gastosApi.list({ limit: 5000 }),
        conceptosAbmApi.list({ activo: true }),
      ]);
      // Filtrar SOLO los con tag dudoso
      const dudosos = (g.data || []).filter(
        (x: Gasto) => x.observaciones && x.observaciones.includes(TAG)
      );
      setGastos(dudosos);
      setConceptos(c.data || []);
    } catch {
      toast.error('Error cargando datos');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { fetchAll(); }, []);

  const conceptosOpts = useMemo(
    () => conceptos.map(c => ({ value: c.nombre, label: c.nombre })),
    [conceptos]
  );

  const conceptosFilter = useMemo(
    () => [{ value: '', label: 'Todos los conceptos' }, ...conceptosOpts],
    [conceptosOpts]
  );

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return gastos.filter(g => {
      if (conceptoFiltro && g.concepto !== conceptoFiltro) return false;
      if (s) {
        const t = [g.concepto, g.descripcion, g.observaciones]
          .filter(Boolean).join(' ').toLowerCase();
        if (!t.includes(s)) return false;
      }
      return true;
    });
  }, [gastos, search, conceptoFiltro]);

  const conceptosUsadosCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const g of gastos) m.set(g.concepto, (m.get(g.concepto) || 0) + 1);
    return m;
  }, [gastos]);

  const confirmar = async (g: Gasto) => {
    const nuevoConcepto = pendingConcepto[g.id] || g.concepto;
    setSavingId(g.id);
    try {
      // Remover el tag [BARTOLO-DUDOSO] de observaciones
      const obs = (g.observaciones || '')
        .split('|')
        .map(s => s.trim())
        .filter(s => !s.startsWith('[BARTOLO-DUDOSO]'))
        .join(' | ');
      await gastosApi.update(g.id, {
        concepto: nuevoConcepto,
        observaciones: obs,
      });
      // Quitar de la lista local
      setGastos(prev => prev.filter(x => x.id !== g.id));
      setPendingConcepto(prev => {
        const n = { ...prev };
        delete n[g.id];
        return n;
      });
      toast.success(`Curado: ${nuevoConcepto}`);
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Error guardando');
    } finally {
      setSavingId(null);
    }
  };

  const aplicarMasivo = async (concepto: string) => {
    if (!confirm(`¿Aplicar "${concepto}" a los ${filtered.length} gastos visibles y quitar el tag dudoso?`)) return;
    setSavingId(-1);
    let ok = 0;
    for (const g of filtered) {
      try {
        const obs = (g.observaciones || '')
          .split('|').map(s => s.trim())
          .filter(s => !s.startsWith('[BARTOLO-DUDOSO]'))
          .join(' | ');
        await gastosApi.update(g.id, { concepto, observaciones: obs });
        ok++;
      } catch {}
    }
    toast.success(`Aplicado a ${ok}/${filtered.length}`);
    setSavingId(null);
    fetchAll();
  };

  const tableView = (
    <div className="rounded-xl overflow-x-auto" style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}>
      <table className="w-full text-sm min-w-[900px]">
        <thead>
          <tr style={{ backgroundColor: theme.backgroundSecondary }}>
            <th className="text-left px-3 py-2 text-[11px] font-semibold uppercase" style={{ color: theme.textSecondary }}>Fecha</th>
            <th className="text-left px-3 py-2 text-[11px] font-semibold uppercase" style={{ color: theme.textSecondary }}>Contacto / Descripción</th>
            <th className="text-left px-3 py-2 text-[11px] font-semibold uppercase" style={{ color: theme.textSecondary }}>Concepto actual</th>
            <th className="text-left px-3 py-2 text-[11px] font-semibold uppercase" style={{ color: theme.textSecondary }}>Cambiar a...</th>
            <th className="text-right px-3 py-2 text-[11px] font-semibold uppercase w-28" style={{ color: theme.textSecondary }}>Monto</th>
            <th className="px-3 py-2 w-32" style={{ color: theme.textSecondary }}></th>
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 && (
            <tr><td colSpan={6} className="text-center p-6" style={{ color: theme.textSecondary }}>
              {gastos.length === 0 ? '🎉 No hay gastos dudosos. Todo curado.' : 'Sin resultados para ese filtro.'}
            </td></tr>
          )}
          {filtered.map((g, i) => {
            const obsLimpio = (g.observaciones || '')
              .split('|').map(s => s.trim())
              .filter(s => !s.startsWith('[BARTOLO]') && !s.startsWith('[BARTOLO-DUDOSO]'))
              .join(' · ');
            const pending = pendingConcepto[g.id] || '';
            return (
              <tr key={g.id} style={{
                borderTop: i > 0 ? `1px solid ${theme.border}` : undefined,
                backgroundColor: i % 2 === 0 ? 'transparent' : `${theme.backgroundSecondary}30`,
              }}>
                <td className="px-3 py-2 text-xs whitespace-nowrap" style={{ color: theme.textSecondary }}>
                  {new Date(g.fecha).toLocaleDateString('es-AR')}
                </td>
                <td className="px-3 py-2" style={{ color: theme.text }}>
                  <span className="font-medium block truncate max-w-[300px]">{g.descripcion || '(sin descripción)'}</span>
                  {obsLimpio && <span className="block text-[10px] truncate max-w-[300px]" style={{ color: theme.textSecondary }}>{obsLimpio}</span>}
                </td>
                <td className="px-3 py-2">
                  <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full inline-block"
                    style={{ backgroundColor: `${theme.primary}20`, color: theme.primary }}>
                    {g.concepto}
                  </span>
                </td>
                <td className="px-3 py-2 min-w-[200px]">
                  <ModernSelect
                    value={pending || g.concepto}
                    onChange={(v) => setPendingConcepto(p => ({ ...p, [g.id]: v }))}
                    options={conceptosOpts}
                    searchable
                    placeholder="Elegir concepto..."
                  />
                </td>
                <td className="px-3 py-2 text-right font-bold tabular-nums" style={{ color: theme.text }}>
                  ${parseFloat(g.monto_pesos).toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                </td>
                <td className="px-3 py-2 text-right">
                  <button
                    onClick={() => confirmar(g)}
                    disabled={savingId === g.id || (!pending && pending !== g.concepto)}
                    className="px-2 py-1 rounded-md text-[11px] font-semibold text-white inline-flex items-center gap-1 disabled:opacity-50"
                    style={{ backgroundColor: '#10b981' }}
                  >
                    {savingId === g.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                    Confirmar
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="px-4 py-3 space-y-3">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          to="/gestion/tesoreria"
          className="p-1.5 rounded-lg transition-all hover:scale-110 active:scale-95"
          style={{ backgroundColor: `${theme.primary}15`, color: theme.primary }}
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#f59e0b15' }}>
          <Sparkles className="h-5 w-5" style={{ color: '#f59e0b' }} />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold" style={{ color: theme.text }}>Curación de gastos (Bartolo)</h1>
          <p className="text-xs" style={{ color: theme.textSecondary }}>
            Cambiá el concepto sugerido por la IA cuando no haya quedado bien. Al confirmar se quita la marca dudoso.
          </p>
        </div>
        <div className="text-right">
          <span className="font-bold text-lg" style={{ color: '#f59e0b' }}>{gastos.length}</span>
          <span className="text-xs ml-1" style={{ color: theme.textSecondary }}>pendientes</span>
        </div>
      </div>

      {/* Stats por concepto sugerido */}
      {gastos.length > 0 && (
        <div className="rounded-xl p-3 flex flex-wrap gap-1.5" style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}>
          <span className="text-[10px] uppercase font-semibold mr-1 self-center" style={{ color: theme.textSecondary }}>
            Distribución:
          </span>
          {Array.from(conceptosUsadosCount.entries())
            .sort((a, b) => b[1] - a[1])
            .map(([nombre, count]) => (
              <button
                key={nombre}
                onClick={() => setConceptoFiltro(conceptoFiltro === nombre ? '' : nombre)}
                className="text-[11px] font-semibold px-2 py-0.5 rounded-full transition-all"
                style={{
                  backgroundColor: conceptoFiltro === nombre ? theme.primary : `${theme.primary}20`,
                  color: conceptoFiltro === nombre ? '#fff' : theme.primary,
                }}
              >
                {nombre} ({count})
              </button>
            ))}
          {conceptoFiltro && (
            <button
              onClick={() => setConceptoFiltro('')}
              className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
              style={{ backgroundColor: theme.backgroundSecondary, color: theme.textSecondary }}
            >
              Quitar filtro
            </button>
          )}
        </div>
      )}

      <ABMPage
        title=""
        searchPlaceholder="Buscar por descripción / proveedor..."
        searchValue={search}
        onSearchChange={setSearch}
        secondaryFilters={
          <div className="flex flex-wrap items-center gap-2">
            <div className="min-w-[260px]">
              <ModernSelect
                value={conceptoFiltro}
                onChange={setConceptoFiltro}
                options={conceptosFilter}
                placeholder="Todos los conceptos"
                searchable
              />
            </div>
            {filtered.length > 0 && filtered.length <= 200 && (
              <button
                onClick={() => {
                  const cand = prompt(`¿A qué concepto querés cambiar los ${filtered.length} gastos visibles? Escribí EXACTAMENTE el nombre del concepto`);
                  if (cand && conceptos.find(c => c.nombre === cand)) aplicarMasivo(cand);
                  else if (cand) toast.error('Concepto no existe');
                }}
                className="px-3 h-[34px] rounded-lg text-[12px] font-semibold text-white"
                style={{ backgroundColor: '#8b5cf6' }}
                disabled={savingId === -1}
              >
                Aplicar masivo a {filtered.length}
              </button>
            )}
          </div>
        }
        loading={loading}
        isEmpty={!loading && filtered.length === 0}
        emptyMessage={gastos.length === 0 ? '🎉 No hay gastos dudosos.' : 'Sin resultados.'}
        tableView={tableView}
        defaultViewMode="table"
      >
        {null}
      </ABMPage>
    </div>
  );
}
