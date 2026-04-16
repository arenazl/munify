import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock, Loader2, Receipt, Info } from 'lucide-react';
import { toast } from 'sonner';
import { tasasApi, pagosApi } from '../lib/api';
import { useTheme } from '../contexts/ThemeContext';
import { DynamicIcon } from '../components/ui/DynamicIcon';
import type { Partida, Deuda } from '../types';

/**
 * Mis Tasas — vista del vecino con sus partidas y deudas pendientes.
 *
 * Hoy es solo lectura. El boton 'Pagar' muestra un placeholder "Pronto vas a
 * poder pagar desde acá" porque todavía no integramos el módulo de Pagos
 * (MP / Aura / etc). Cuando este ese módulo, este botón abre el checkout.
 */
export default function MisTasas() {
  const { theme } = useTheme();
  const [partidas, setPartidas] = useState<Partida[]>([]);
  const [loading, setLoading] = useState(true);
  const [partidaExpandida, setPartidaExpandida] = useState<number | null>(null);
  const [deudas, setDeudas] = useState<Record<number, Deuda[]>>({});
  const [loadingDeudas, setLoadingDeudas] = useState<number | null>(null);

  useEffect(() => {
    cargar();
    // Si el vecino vuelve del checkout externo con ?pago=ok, mostramos toast.
    const params = new URLSearchParams(window.location.search);
    if (params.get('pago') === 'ok') {
      toast.success('Pago procesado correctamente', {
        description: 'Tu boleta se marcó como pagada.',
        duration: 4000,
      });
      // Limpiar el query param para que no re-dispare al refrescar
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const cargar = async () => {
    setLoading(true);
    try {
      const res = await tasasApi.misPartidas();
      setPartidas(res.data || []);
    } catch (err) {
      console.error(err);
      toast.error('No se pudieron cargar tus tasas');
    } finally {
      setLoading(false);
    }
  };

  const togglePartida = async (partidaId: number) => {
    if (partidaExpandida === partidaId) {
      setPartidaExpandida(null);
      return;
    }
    setPartidaExpandida(partidaId);
    if (!deudas[partidaId]) {
      setLoadingDeudas(partidaId);
      try {
        const res = await tasasApi.deudasDePartida(partidaId);
        setDeudas(prev => ({ ...prev, [partidaId]: res.data || [] }));
      } catch (err) {
        console.error(err);
        toast.error('Error cargando deudas');
      } finally {
        setLoadingDeudas(null);
      }
    }
  };

  const handlePagar = async (deuda: Deuda) => {
    try {
      // Crear sesion en el gateway externo (PayBridge / provider real)
      const res = await pagosApi.crearSesion(deuda.id, '/gestion/mis-tasas?pago=ok');
      const { checkout_url } = res.data;
      // Redirigir al checkout externo — visualmente es otra plataforma.
      window.location.href = checkout_url;
    } catch (err) {
      const e = err as { response?: { data?: { detail?: string } } };
      toast.error(e.response?.data?.detail || 'No se pudo iniciar el pago. Intentá de nuevo.');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: theme.primary }} />
      </div>
    );
  }

  const totalPendiente = partidas.reduce((acc, p) => acc + Number(p.monto_pendiente || 0), 0);
  const totalDeudas = partidas.reduce((acc, p) => acc + (p.deudas_pendientes || 0), 0);

  return (
    <div className="p-3 sm:p-6 space-y-4 max-w-3xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold" style={{ color: theme.text }}>Mis Tasas</h1>
        <p className="text-sm mt-1" style={{ color: theme.textSecondary }}>
          Tus tasas municipales y boletas asociadas a tu cuenta.
        </p>
      </div>

      {partidas.length === 0 ? (
        <EmptyState theme={theme} />
      ) : (
        <>
          {/* Resumen */}
          <div
            className="rounded-2xl p-4 flex items-center gap-4"
            style={{
              background: totalDeudas > 0
                ? `linear-gradient(135deg, #ef444415 0%, ${theme.card} 60%)`
                : `linear-gradient(135deg, #10b98115 0%, ${theme.card} 60%)`,
              border: `1px solid ${totalDeudas > 0 ? '#ef444440' : '#10b98140'}`,
            }}
          >
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{
                backgroundColor: totalDeudas > 0 ? '#ef444420' : '#10b98120',
                color: totalDeudas > 0 ? '#ef4444' : '#10b981',
              }}
            >
              {totalDeudas > 0 ? <AlertCircle className="h-6 w-6" /> : <CheckCircle2 className="h-6 w-6" />}
            </div>
            <div className="flex-1 min-w-0">
              {totalDeudas > 0 ? (
                <>
                  <p className="text-xs uppercase tracking-wider font-medium" style={{ color: theme.textSecondary }}>
                    Tenés pendiente
                  </p>
                  <p className="text-2xl font-bold" style={{ color: theme.text }}>
                    {fmtPlata(totalPendiente)}
                  </p>
                  <p className="text-xs" style={{ color: theme.textSecondary }}>
                    {totalDeudas} {totalDeudas === 1 ? 'boleta' : 'boletas'} en {partidas.length} {partidas.length === 1 ? 'partida' : 'partidas'}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm font-semibold" style={{ color: '#10b981' }}>¡Estás al día!</p>
                  <p className="text-xs" style={{ color: theme.textSecondary }}>
                    No tenés boletas pendientes en {partidas.length} {partidas.length === 1 ? 'partida' : 'partidas'}.
                  </p>
                </>
              )}
            </div>
          </div>

          {/* Lista de partidas */}
          <div className="space-y-2">
            {partidas.map(p => (
              <PartidaCard
                key={p.id}
                partida={p}
                expandida={partidaExpandida === p.id}
                onToggle={() => togglePartida(p.id)}
                deudas={deudas[p.id] || []}
                loadingDeudas={loadingDeudas === p.id}
                onPagar={handlePagar}
                theme={theme}
              />
            ))}
          </div>

          {/* Disclaimer: el pago se hace en una plataforma externa */}
          <div
            className="flex items-start gap-2 p-3 rounded-xl text-xs"
            style={{ backgroundColor: theme.backgroundSecondary, color: theme.textSecondary }}
          >
            <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <span>
              Al tocar <strong>Pagar</strong> te llevamos a <strong>PayBridge</strong>, nuestra plataforma de cobros externa. Tus datos de tarjeta no pasan por el municipio.
            </span>
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================

function EmptyState({ theme }: { theme: { text: string; textSecondary: string; backgroundSecondary: string; primary: string } }) {
  return (
    <div
      className="rounded-2xl p-8 text-center"
      style={{ backgroundColor: theme.backgroundSecondary }}
    >
      <Receipt className="h-12 w-12 mx-auto mb-3" style={{ color: theme.textSecondary }} />
      <h3 className="font-semibold" style={{ color: theme.text }}>No encontramos tasas asociadas a tu cuenta</h3>
      <p className="text-sm mt-1" style={{ color: theme.textSecondary }}>
        Cuando el municipio asocie una partida a tu DNI, aparecerá acá.
      </p>
    </div>
  );
}

function PartidaCard({
  partida, expandida, onToggle, deudas, loadingDeudas, onPagar, theme,
}: {
  partida: Partida;
  expandida: boolean;
  onToggle: () => void;
  deudas: Deuda[];
  loadingDeudas: boolean;
  onPagar: (deuda: Deuda) => void;
  theme: { text: string; textSecondary: string; card: string; border: string; primary: string; backgroundSecondary: string };
}) {
  const color = partida.tipo_tasa?.color || theme.primary;
  const icono = partida.tipo_tasa?.icono || 'Receipt';
  const tienePendientes = (partida.deudas_pendientes || 0) > 0;

  return (
    <div
      className="rounded-2xl overflow-hidden transition-all"
      style={{
        backgroundColor: theme.card,
        border: `1px solid ${tienePendientes ? color + '40' : theme.border}`,
        borderLeft: `4px solid ${color}`,
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        className="w-full p-4 flex items-center gap-3 text-left transition-all hover:scale-[1.005] active:scale-[0.995]"
      >
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: `linear-gradient(135deg, ${color} 0%, ${color}cc 100%)`, color: '#fff' }}
        >
          <DynamicIcon name={icono} className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-sm truncate" style={{ color: theme.text }}>
              {partida.tipo_tasa?.nombre || 'Tasa'}
            </p>
            <span
              className="text-[10px] font-medium px-2 py-0.5 rounded-full"
              style={{ backgroundColor: `${color}20`, color: color }}
            >
              {partida.identificador}
            </span>
          </div>
          <p className="text-xs truncate mt-0.5" style={{ color: theme.textSecondary }}>
            {getObjetoResumen(partida)}
          </p>
          {tienePendientes && (
            <p className="text-xs font-semibold mt-1" style={{ color: '#ef4444' }}>
              {partida.deudas_pendientes} {partida.deudas_pendientes === 1 ? 'boleta' : 'boletas'} · {fmtPlata(partida.monto_pendiente || 0)}
            </p>
          )}
        </div>
        <div className="flex-shrink-0 text-xs" style={{ color: theme.textSecondary }}>
          {expandida ? '▲' : '▼'}
        </div>
      </button>

      {/* Lista de deudas expandida */}
      {expandida && (
        <div className="border-t px-4 py-3 space-y-2" style={{ borderColor: theme.border, backgroundColor: theme.backgroundSecondary }}>
          {loadingDeudas ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin" style={{ color: theme.primary }} />
            </div>
          ) : deudas.length === 0 ? (
            <p className="text-xs italic text-center py-3" style={{ color: theme.textSecondary }}>
              Sin boletas emitidas.
            </p>
          ) : (
            deudas.map(d => <DeudaRow key={d.id} deuda={d} onPagar={onPagar} theme={theme} />)
          )}
        </div>
      )}
    </div>
  );
}

function DeudaRow({
  deuda, onPagar, theme,
}: {
  deuda: Deuda;
  onPagar: (deuda: Deuda) => void;
  theme: { text: string; textSecondary: string; card: string; border: string; primary: string };
}) {
  const [estadoColor, estadoIcon, estadoLabel] = getEstadoInfo(deuda.estado);
  const esPagable = deuda.estado === 'pendiente' || deuda.estado === 'vencida';

  return (
    <div
      className="flex items-center gap-3 p-3 rounded-xl"
      style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
    >
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: `${estadoColor}20`, color: estadoColor }}
      >
        {estadoIcon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold" style={{ color: theme.text }}>
          Periodo {deuda.periodo}
        </p>
        <p className="text-xs" style={{ color: theme.textSecondary }}>
          <span style={{ color: estadoColor, fontWeight: 600 }}>{estadoLabel}</span>
          {' · '}
          Vence {new Date(deuda.fecha_vencimiento).toLocaleDateString('es-AR')}
        </p>
      </div>
      <div className="text-right flex-shrink-0">
        <p className="text-sm font-bold" style={{ color: theme.text }}>{fmtPlata(deuda.importe)}</p>
        {esPagable && (
          <button
            type="button"
            onClick={() => onPagar(deuda)}
            className="mt-1 text-xs font-semibold px-3 py-1 rounded-lg transition-all hover:scale-105 active:scale-95"
            style={{
              background: `linear-gradient(135deg, ${theme.primary} 0%, ${theme.primary}cc 100%)`,
              color: '#fff',
            }}
          >
            Pagar
          </button>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Helpers
// ============================================================

function fmtPlata(v: string | number): string {
  const n = typeof v === 'number' ? v : parseFloat(String(v)) || 0;
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
  }).format(n);
}

function getObjetoResumen(partida: Partida): string {
  const obj = partida.objeto || {};
  if (obj.direccion) return String(obj.direccion);
  if (obj.dominio) return `${obj.marca || ''} ${obj.modelo || ''} · ${obj.dominio}`.trim();
  if (obj.infraccion) return String(obj.infraccion);
  if (obj.razon_social) return String(obj.razon_social);
  return partida.titular_nombre || '—';
}

function getEstadoInfo(estado: string): [string, React.ReactElement, string] {
  switch (estado) {
    case 'pagada': return ['#10b981', <CheckCircle2 className="h-4 w-4" />, 'Pagada'];
    case 'vencida': return ['#ef4444', <AlertCircle className="h-4 w-4" />, 'Vencida'];
    case 'en_plan_pago': return ['#f59e0b', <Clock className="h-4 w-4" />, 'En plan de pago'];
    case 'anulada': return ['#6b7280', <Clock className="h-4 w-4" />, 'Anulada'];
    case 'pendiente':
    default:
      return ['#3b82f6', <Clock className="h-4 w-4" />, 'Pendiente'];
  }
}
