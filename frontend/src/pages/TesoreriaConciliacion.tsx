/**
 * Conciliacion bancaria: subir CSV del extracto del banco, auto-matchear
 * contra movimientos de caja por (monto exacto + fecha +/- N dias + mismo
 * tipo), marcar matches como conciliados.
 */
import { useEffect, useState, useRef } from 'react';
import { FileSpreadsheet, Upload, CheckCircle2, AlertCircle, Loader2, Banknote, X } from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { ABMPage } from '../components/ui/ABMPage';
import PageHint from '../components/ui/PageHint';
import { ModernSelect } from '../components/ui/ModernSelect';
import { PrimaryButton } from '../components/ui/PrimaryButton';
import { cajasApi, conciliacionApi } from '../lib/api';
import type { Caja } from '../types';

interface LineaResultado {
  linea_csv: number;
  fecha: string | null;
  descripcion: string;
  monto: string | null;
  tipo: string | null;
  matched_movimiento_id: number | null;
  movimiento_concepto: string | null;
  razon_no_match: string | null;
}

interface ImportResponse {
  total_lineas: number;
  matched: number;
  unmatched: number;
  movimientos_marcados: number;
  lineas: LineaResultado[];
}

interface MovPendiente {
  id: number;
  tipo: 'ingreso' | 'egreso';
  fecha: string;
  monto: string;
  concepto: string;
}

function fmtMoney(v: string | number): string {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return `$${(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })}`;
}

export default function TesoreriaConciliacion() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const [cajas, setCajas] = useState<Caja[]>([]);
  const [cajaId, setCajaId] = useState<number>(0);
  const [diasTolerancia, setDiasTolerancia] = useState<number>(2);
  const [importing, setImporting] = useState(false);
  const [resultado, setResultado] = useState<ImportResponse | null>(null);
  const [pendientes, setPendientes] = useState<MovPendiente[]>([]);
  const [loadingPendientes, setLoadingPendientes] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  if (user && user.rol !== 'admin' && user.rol !== 'supervisor') {
    return <div className="p-6"><p className="text-sm" style={{ color: theme.textSecondary }}>Solo gestores.</p></div>;
  }

  useEffect(() => {
    cajasApi.list({ activo: true, include_saldos: false })
      .then(r => {
        setCajas(r.data || []);
        if ((r.data || []).length > 0 && !cajaId) setCajaId(r.data[0].id);
      })
      .catch(() => toast.error('Error cargando cajas'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchPendientes = async (cid: number) => {
    if (!cid) return;
    setLoadingPendientes(true);
    try {
      const r = await conciliacionApi.pendientes(cid);
      setPendientes(r.data || []);
    } catch { /* ok */ }
    finally { setLoadingPendientes(false); }
  };

  useEffect(() => { if (cajaId) fetchPendientes(cajaId); }, [cajaId]);

  const onFile = async (file: File) => {
    if (!cajaId) return toast.error('Elegí una caja primero');
    if (!file.name.toLowerCase().endsWith('.csv')) {
      return toast.error('Solo CSV. Si el extracto viene en Excel, exportalo como CSV primero.');
    }
    setImporting(true);
    try {
      const r = await conciliacionApi.importExtracto(file, cajaId, diasTolerancia);
      setResultado(r.data);
      toast.success(`${r.data.matched} de ${r.data.total_lineas} líneas conciliadas`);
      await fetchPendientes(cajaId);
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Error importando CSV');
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const cajaOptions = cajas.map(c => ({ value: String(c.id), label: c.nombre, color: c.color || undefined }));

  return (
    <>
    <PageHint pageId="tesoreria-conciliacion" />
    <ABMPage
      title="Conciliación Bancaria"
      icon={<Banknote className="h-5 w-5" />}
      backLink="/gestion/tesoreria"
      searchPlaceholder=""
      searchValue=""
      onSearchChange={() => {}}
      loading={false}
      isEmpty={false}
      emptyMessage=""
    >
      <div className="col-span-full space-y-4">
        {/* Banner explicativo */}
        <div
          className="rounded-xl p-4 flex items-start gap-3"
          style={{
            background: `linear-gradient(135deg, ${theme.primary}10 0%, ${theme.card} 60%)`,
            border: `1px solid ${theme.primary}30`,
          }}
        >
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: `${theme.primary}20`, color: theme.primary }}
          >
            <FileSpreadsheet className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-sm" style={{ color: theme.text }}>Subí el extracto del banco</h3>
            <p className="text-[11px] leading-relaxed" style={{ color: theme.textSecondary }}>
              Exportá el extracto como CSV desde el home-banking. El sistema busca los movimientos
              de la caja elegida que coincidan en monto exacto, mismo tipo (débito/crédito) y fecha
              dentro de la tolerancia, y los marca como conciliados automáticamente. Los que queden
              sin match podés conciliarlos manualmente.
            </p>
            <p className="text-[10px] mt-1.5" style={{ color: theme.textSecondary }}>
              <b>Columnas esperadas (insensible a mayúsculas y acentos):</b> fecha · descripcion · debe/haber o monto · referencia (opcional).
              Acepta `,` o `;` como separador, fechas YYYY-MM-DD / DD/MM/YYYY, montos con punto o coma decimal.
            </p>
          </div>
        </div>

        {/* Formulario */}
        <div
          className="rounded-xl p-4 grid grid-cols-1 sm:grid-cols-3 gap-3"
          style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
        >
          <div>
            <label className="block text-[10px] uppercase font-bold mb-1" style={{ color: theme.textSecondary }}>Caja</label>
            <ModernSelect
              value={cajaId ? String(cajaId) : ''}
              onChange={(v) => setCajaId(v ? Number(v) : 0)}
              options={cajaOptions}
              placeholder="Elegí la caja"
              searchable
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase font-bold mb-1" style={{ color: theme.textSecondary }}>Tolerancia (días)</label>
            <input
              type="number"
              min={0}
              max={15}
              value={diasTolerancia}
              onChange={(e) => setDiasTolerancia(Math.max(0, Math.min(15, Number(e.target.value) || 0)))}
              className="w-full px-3 py-2 rounded-lg text-sm tabular-nums"
              style={{ backgroundColor: theme.backgroundSecondary, color: theme.text, border: `1px solid ${theme.border}` }}
            />
          </div>
          <div className="flex items-end">
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
            />
            <PrimaryButton
              onClick={() => fileRef.current?.click()}
              disabled={!cajaId || importing}
              icon={importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            >
              {importing ? 'Procesando...' : 'Subir CSV'}
            </PrimaryButton>
          </div>
        </div>

        {/* Resultado de import */}
        {resultado && (
          <div className="rounded-xl overflow-hidden" style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}>
            <div
              className="px-4 py-3 flex items-center justify-between gap-3"
              style={{ backgroundColor: `${theme.primary}08`, borderBottom: `1px solid ${theme.border}` }}
            >
              <div className="flex items-center gap-4 flex-wrap">
                <span className="text-sm font-bold" style={{ color: theme.text }}>
                  Resultado de la importación
                </span>
                <span className="text-xs inline-flex items-center gap-1" style={{ color: '#10b981' }}>
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {resultado.matched} conciliadas
                </span>
                <span className="text-xs inline-flex items-center gap-1" style={{ color: '#f59e0b' }}>
                  <AlertCircle className="h-3.5 w-3.5" />
                  {resultado.unmatched} sin match
                </span>
              </div>
              <button onClick={() => setResultado(null)} className="text-xs" style={{ color: theme.textSecondary }}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="max-h-[400px] overflow-y-auto">
              {resultado.lineas.map((l, i) => {
                const ok = l.matched_movimiento_id != null;
                return (
                  <div
                    key={i}
                    className="px-4 py-2.5 flex items-center gap-3"
                    style={{
                      borderTop: i > 0 ? `1px solid ${theme.border}` : undefined,
                      backgroundColor: ok ? '#10b98108' : undefined,
                    }}
                  >
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: ok ? '#10b98120' : '#f59e0b20', color: ok ? '#10b981' : '#f59e0b' }}
                    >
                      {ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold truncate" style={{ color: theme.text }}>
                        {l.descripcion || <span style={{ color: theme.textSecondary }}>(sin descripción)</span>}
                      </p>
                      <p className="text-[10px]" style={{ color: theme.textSecondary }}>
                        Línea {l.linea_csv} · {l.fecha || '—'} · {l.tipo || '?'}
                        {ok && l.movimiento_concepto && ` · matched: ${l.movimiento_concepto}`}
                        {!ok && l.razon_no_match && ` · ${l.razon_no_match}`}
                      </p>
                    </div>
                    <span className="font-bold tabular-nums text-sm flex-shrink-0" style={{ color: theme.text }}>
                      {l.monto ? fmtMoney(l.monto) : '—'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Movimientos pendientes (no conciliados) */}
        <div className="rounded-xl overflow-hidden" style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}>
          <div
            className="px-4 py-3 flex items-center justify-between"
            style={{ backgroundColor: theme.backgroundSecondary, borderBottom: `1px solid ${theme.border}` }}
          >
            <span className="text-sm font-bold" style={{ color: theme.text }}>
              Movimientos pendientes de conciliar
            </span>
            <span className="text-xs" style={{ color: theme.textSecondary }}>
              {pendientes.length} sin conciliar
            </span>
          </div>
          {loadingPendientes ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin" style={{ color: theme.primary }} />
            </div>
          ) : pendientes.length === 0 ? (
            <div className="text-center py-8 text-sm" style={{ color: theme.textSecondary }}>
              Todos los movimientos de esta caja están conciliados.
            </div>
          ) : (
            <div className="max-h-[400px] overflow-y-auto">
              {pendientes.map((m, i) => (
                <div
                  key={m.id}
                  className="px-4 py-2.5 flex items-center gap-3"
                  style={{ borderTop: i > 0 ? `1px solid ${theme.border}` : undefined }}
                >
                  <span
                    className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full"
                    style={{
                      backgroundColor: m.tipo === 'ingreso' ? '#10b98120' : '#ef444420',
                      color: m.tipo === 'ingreso' ? '#10b981' : '#ef4444',
                    }}
                  >
                    {m.tipo}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold truncate" style={{ color: theme.text }}>{m.concepto}</p>
                    <p className="text-[10px]" style={{ color: theme.textSecondary }}>
                      {new Date(m.fecha).toLocaleDateString('es-AR')}
                    </p>
                  </div>
                  <span className="font-bold tabular-nums text-sm" style={{ color: theme.text }}>{fmtMoney(m.monto)}</span>
                  <button
                    onClick={async () => {
                      try {
                        await conciliacionApi.marcarManual(m.id, 'manual');
                        toast.success('Movimiento marcado como conciliado');
                        fetchPendientes(cajaId);
                      } catch { toast.error('Error'); }
                    }}
                    className="text-[11px] px-2.5 py-1 rounded-md transition-all hover:scale-105"
                    style={{ backgroundColor: `${theme.primary}15`, color: theme.primary, border: `1px solid ${theme.primary}40` }}
                  >
                    Conciliar
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </ABMPage>
    </>
  );
}
