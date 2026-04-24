import { useEffect, useState } from 'react';
import { Wallet, CreditCard, Banknote, QrCode, RefreshCcw, Check, Loader2, Download, Sparkles, AlertCircle, Key, ShieldCheck, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { proveedoresPagoApi } from '../lib/api';
import { useTheme } from '../contexts/ThemeContext';
import { StickyPageHeader } from '../components/ui/StickyPageHeader';
import { Modal } from '../components/ui/Modal';
import PageHint from '../components/ui/PageHint';

interface Proveedor {
  proveedor: string;
  nombre_display: string;
  descripcion: string;
  activo: boolean;
  productos_disponibles: string[];
  productos_activos: Record<string, boolean>;
  metadata_importada: Record<string, unknown> | null;
  requiere_importacion: boolean;
}

const PRODUCTO_META: Record<string, { label: string; icon: React.ReactNode; descripcion: string; color: string }> = {
  boton_pago: {
    label: 'Botón de Pago',
    icon: <CreditCard className="w-4 h-4" />,
    descripcion: 'Checkout web con tarjeta crédito/débito',
    color: '#3b82f6',
  },
  rapipago: {
    label: 'Rapipago',
    icon: <Banknote className="w-4 h-4" />,
    descripcion: 'Cupón con código de barras para pagar en sucursal',
    color: '#ef4444',
  },
  adhesion_debito: {
    label: 'Adhesión Débito',
    icon: <RefreshCcw className="w-4 h-4" />,
    descripcion: 'Débito automático recurrente vía CBU',
    color: '#10b981',
  },
  qr: {
    label: 'QR Interoperable',
    icon: <QrCode className="w-4 h-4" />,
    descripcion: 'QR estándar BCRA aceptado por todos los bancos',
    color: '#8b5cf6',
  },
};

const PROVEEDOR_COLOR: Record<string, string> = {
  gire: '#0066cc',
  mercadopago: '#00b1ea',
  modo: '#5b3ce0',
};

export default function ProveedoresPago() {
  const { theme } = useTheme();
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [importing, setImporting] = useState<string | null>(null);
  const [importProgress, setImportProgress] = useState<{ step: string; progress: number } | null>(null);
  const [credencialesProv, setCredencialesProv] = useState<Proveedor | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const r = await proveedoresPagoApi.list();
      setProveedores(r.data);
    } catch {
      toast.error('No se pudieron cargar los proveedores');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const toggleProveedor = async (prov: Proveedor) => {
    setSavingId(prov.proveedor);
    try {
      const nuevoActivo = !prov.activo;
      await proveedoresPagoApi.update(prov.proveedor, {
        activo: nuevoActivo,
        productos_activos: prov.productos_activos,
      });
      toast.success(`${prov.nombre_display} ${nuevoActivo ? 'activado' : 'desactivado'}`);
      await fetchData();
    } catch {
      toast.error('Error al actualizar el proveedor');
    } finally {
      setSavingId(null);
    }
  };

  const toggleProducto = async (prov: Proveedor, producto: string) => {
    setSavingId(prov.proveedor);
    try {
      const nuevos = { ...prov.productos_activos, [producto]: !prov.productos_activos[producto] };
      await proveedoresPagoApi.update(prov.proveedor, {
        activo: prov.activo,
        productos_activos: nuevos,
      });
      await fetchData();
    } catch {
      toast.error('Error al actualizar el producto');
    } finally {
      setSavingId(null);
    }
  };

  const importarPadron = async (prov: Proveedor) => {
    setImporting(prov.proveedor);
    setImportProgress({ step: 'Iniciando...', progress: 0 });
    try {
      await proveedoresPagoApi.importarPadron(prov.proveedor, (ev) => {
        setImportProgress({ step: ev.step, progress: ev.progress });
        if (ev.step === 'completed' && ev.resultado) {
          const r = ev.resultado as Record<string, unknown>;
          toast.success(`Importación completa: ${r.padron_cuentas} cuentas, ${r.categorias_tasa} categorías`);
        }
      });
      await fetchData();
    } catch (e) {
      toast.error(`Error en la importación: ${(e as Error).message}`);
    } finally {
      setTimeout(() => {
        setImporting(null);
        setImportProgress(null);
      }, 800);
    }
  };

  return (
    <div className="space-y-4">
      <StickyPageHeader
        backLink="/gestion/ajustes"
        icon={<Wallet className="h-5 w-5" />}
        title="Proveedores de Pago"
      />

      <PageHint pageId="proveedores-pago" />

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: theme.primary }} />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {proveedores.map((prov) => {
            const pColor = PROVEEDOR_COLOR[prov.proveedor] || theme.primary;
            const isImporting = importing === prov.proveedor;
            const isSaving = savingId === prov.proveedor;
            const meta = prov.metadata_importada as Record<string, unknown> | null;

            return (
              <div
                key={prov.proveedor}
                className="rounded-2xl overflow-hidden transition-all"
                style={{
                  backgroundColor: theme.card,
                  border: `1.5px solid ${prov.activo ? pColor : theme.border}`,
                  boxShadow: prov.activo ? `0 8px 24px ${pColor}25` : '0 2px 6px rgba(0,0,0,0.05)',
                }}
              >
                {/* Header del proveedor */}
                <div
                  className="px-5 py-4 flex items-center justify-between"
                  style={{
                    background: prov.activo
                      ? `linear-gradient(135deg, ${pColor} 0%, ${pColor}cc 100%)`
                      : `${pColor}10`,
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-lg"
                      style={{
                        backgroundColor: prov.activo ? 'rgba(255,255,255,0.2)' : pColor,
                        color: prov.activo ? '#ffffff' : '#ffffff',
                      }}
                    >
                      {prov.nombre_display.charAt(0)}
                    </div>
                    <div>
                      <h3 className="font-bold text-base" style={{ color: prov.activo ? '#ffffff' : theme.text }}>
                        {prov.nombre_display}
                      </h3>
                      <p className="text-xs" style={{ color: prov.activo ? 'rgba(255,255,255,0.85)' : theme.textSecondary }}>
                        {prov.activo ? 'Activo' : 'Desactivado'}
                      </p>
                    </div>
                  </div>

                  {/* Toggle activar */}
                  <button
                    onClick={() => toggleProveedor(prov)}
                    disabled={isSaving}
                    className="relative inline-flex h-6 w-11 rounded-full transition-colors disabled:opacity-50"
                    style={{
                      backgroundColor: prov.activo ? 'rgba(255,255,255,0.4)' : `${theme.textSecondary}40`,
                    }}
                    title={prov.activo ? 'Desactivar' : 'Activar'}
                  >
                    <span
                      className="inline-block h-5 w-5 rounded-full bg-white transition-transform"
                      style={{
                        transform: prov.activo ? 'translateX(22px)' : 'translateX(2px)',
                        marginTop: '2px',
                      }}
                    />
                  </button>
                </div>

                {/* Body */}
                <div className="p-5 space-y-4">
                  <p className="text-sm leading-relaxed" style={{ color: theme.textSecondary }}>
                    {prov.descripcion}
                  </p>

                  {/* Productos disponibles */}
                  <div>
                    <p className="text-[11px] uppercase tracking-wide font-semibold mb-2" style={{ color: theme.textSecondary }}>
                      Productos disponibles
                    </p>
                    <div className="space-y-1.5">
                      {prov.productos_disponibles.map((p) => {
                        const pmeta = PRODUCTO_META[p];
                        if (!pmeta) return null;
                        const activo = !!prov.productos_activos[p];
                        return (
                          <button
                            key={p}
                            onClick={() => toggleProducto(prov, p)}
                            disabled={!prov.activo || isSaving}
                            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-all hover:scale-[1.01] disabled:opacity-50 disabled:cursor-not-allowed"
                            style={{
                              backgroundColor: activo ? `${pmeta.color}15` : theme.backgroundSecondary,
                              border: `1px solid ${activo ? `${pmeta.color}50` : theme.border}`,
                            }}
                          >
                            <div
                              className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0"
                              style={{
                                backgroundColor: activo ? pmeta.color : `${pmeta.color}20`,
                                color: activo ? '#ffffff' : pmeta.color,
                              }}
                            >
                              {pmeta.icon}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold truncate" style={{ color: theme.text }}>
                                {pmeta.label}
                              </p>
                              <p className="text-[10px] truncate" style={{ color: theme.textSecondary }}>
                                {pmeta.descripcion}
                              </p>
                            </div>
                            {activo && (
                              <Check className="w-4 h-4 flex-shrink-0" style={{ color: pmeta.color }} />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Credenciales reales (Fase 2) — visible para todos los proveedores */}
                  <button
                    onClick={() => setCredencialesProv(prov)}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all hover:scale-[1.01] active:scale-95"
                    style={{
                      backgroundColor: theme.backgroundSecondary,
                      color: theme.text,
                      border: `1px solid ${theme.border}`,
                    }}
                  >
                    <Key className="w-3.5 h-3.5" />
                    Conectar credenciales reales
                  </button>

                  {/* Metadata importada / Botón importar */}
                  {prov.requiere_importacion && (
                    <div
                      className="p-3 rounded-lg"
                      style={{
                        backgroundColor: theme.backgroundSecondary,
                        border: `1px dashed ${theme.border}`,
                      }}
                    >
                      {isImporting && importProgress ? (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-xs font-medium" style={{ color: pColor }}>
                            <Loader2 className="w-3 h-3 animate-spin" />
                            <span className="truncate">{importProgress.step}</span>
                          </div>
                          <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: theme.border }}>
                            <div
                              className="h-full transition-all duration-300"
                              style={{
                                width: `${importProgress.progress}%`,
                                background: `linear-gradient(90deg, ${pColor}, ${pColor}aa)`,
                              }}
                            />
                          </div>
                          <p className="text-[10px] text-right" style={{ color: theme.textSecondary }}>
                            {importProgress.progress}%
                          </p>
                        </div>
                      ) : meta ? (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <Sparkles className="w-3.5 h-3.5" style={{ color: pColor }} />
                            <span className="text-xs font-semibold" style={{ color: theme.text }}>
                              Padrón sincronizado
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-[11px]">
                            {meta.padron_cuentas != null && (
                              <div>
                                <p style={{ color: theme.textSecondary }}>Cuentas</p>
                                <p className="font-bold" style={{ color: theme.text }}>
                                  {String(meta.padron_cuentas)}
                                </p>
                              </div>
                            )}
                            {meta.categorias_tasa != null && (
                              <div>
                                <p style={{ color: theme.textSecondary }}>Categorías</p>
                                <p className="font-bold" style={{ color: theme.text }}>
                                  {String(meta.categorias_tasa)}
                                </p>
                              </div>
                            )}
                          </div>
                          <button
                            onClick={() => importarPadron(prov)}
                            className="w-full flex items-center justify-center gap-1.5 mt-1 px-3 py-1.5 rounded-md text-[11px] font-medium transition-all hover:scale-[1.02]"
                            style={{
                              backgroundColor: `${pColor}15`,
                              color: pColor,
                              border: `1px solid ${pColor}30`,
                            }}
                          >
                            <RefreshCcw className="w-3 h-3" />
                            Re-sincronizar
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div className="flex items-start gap-2">
                            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: pColor }} />
                            <p className="text-xs leading-snug" style={{ color: theme.text }}>
                              Antes de cobrar, importá el padrón de cuentas desde {prov.nombre_display}
                            </p>
                          </div>
                          <button
                            onClick={() => importarPadron(prov)}
                            disabled={!prov.activo}
                            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed"
                            style={{
                              background: prov.activo ? `linear-gradient(135deg, ${pColor}, ${pColor}cc)` : theme.backgroundSecondary,
                              color: prov.activo ? '#ffffff' : theme.textSecondary,
                              boxShadow: prov.activo ? `0 4px 12px ${pColor}40` : 'none',
                            }}
                          >
                            <Download className="w-3.5 h-3.5" />
                            Importar padrón
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <CredencialesModal
        prov={credencialesProv}
        onClose={() => setCredencialesProv(null)}
      />
    </div>
  );
}

// ============================================================
// Modal: credenciales reales del provider
// ============================================================
interface CredencialesState {
  access_token: string;
  public_key: string;
  webhook_secret: string;
  cuit_cobranza: string;
  test_mode: boolean;
  tiene_access_token: boolean;
  webhook_secret_set: boolean;
}

function CredencialesModal({ prov, onClose }: { prov: Proveedor | null; onClose: () => void }) {
  const { theme } = useTheme();
  const [state, setState] = useState<CredencialesState | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (!prov) {
      setState(null);
      return;
    }
    const load = async () => {
      setLoading(true);
      try {
        const r = await proveedoresPagoApi.getCredenciales(prov.proveedor);
        setState({
          access_token: '',
          public_key: r.data.public_key || '',
          webhook_secret: '',
          cuit_cobranza: r.data.cuit_cobranza || '',
          test_mode: r.data.test_mode,
          tiene_access_token: r.data.tiene_access_token,
          webhook_secret_set: r.data.webhook_secret_set,
        });
      } catch {
        toast.error('No se pudieron cargar las credenciales');
        setState(null);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [prov]);

  if (!prov) return null;

  const handleProbar = async () => {
    if (!state?.access_token) {
      toast.error('Pegá el access token primero');
      return;
    }
    setTesting(true);
    try {
      const r = await proveedoresPagoApi.probarCredenciales(prov.proveedor, state.access_token, state.test_mode);
      if (r.data.ok) {
        toast.success(`Conectado como ${r.data.cuenta.nickname || r.data.cuenta.email || r.data.cuenta.id}`);
      }
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(msg || 'Credenciales inválidas');
    } finally {
      setTesting(false);
    }
  };

  const handleGuardar = async () => {
    if (!state) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        public_key: state.public_key,
        cuit_cobranza: state.cuit_cobranza,
        test_mode: state.test_mode,
      };
      if (state.access_token) body.access_token = state.access_token;
      if (state.webhook_secret) body.webhook_secret = state.webhook_secret;
      await proveedoresPagoApi.setCredenciales(prov.proveedor, body);
      toast.success('Credenciales guardadas');
      onClose();
    } catch {
      toast.error('Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={!!prov}
      onClose={onClose}
      title={`Conectar ${prov.nombre_display}`}
      description="Los secretos se cifran en DB con Fernet. Nunca se devuelven en claro al frontend."
      size="2xl"
      footer={
        <div className="flex items-center justify-between gap-2 w-full">
          <button
            onClick={handleProbar}
            disabled={testing || !state?.access_token}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
            style={{ backgroundColor: theme.backgroundSecondary, color: theme.text, border: `1px solid ${theme.border}` }}
          >
            <ShieldCheck className="w-4 h-4" />
            {testing ? 'Probando…' : 'Probar credenciales'}
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              disabled={saving}
              className="px-3 py-2 rounded-lg text-sm font-medium"
              style={{ color: theme.textSecondary }}
            >
              Cancelar
            </button>
            <button
              onClick={handleGuardar}
              disabled={saving || !state}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold text-white transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
              style={{ backgroundColor: theme.primary }}
            >
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      }
    >
      {loading || !state ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="w-5 h-5 animate-spin" style={{ color: theme.primary }} />
        </div>
      ) : (
        <div className="space-y-3">
          {/* Warning en producción */}
          {!state.test_mode && (
            <div
              className="flex items-start gap-2 p-3 rounded-lg"
              style={{ backgroundColor: '#fef3c7', border: '1px solid #f59e0b' }}
            >
              <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: '#d97706' }} />
              <div>
                <p className="text-sm font-semibold" style={{ color: '#92400e' }}>
                  Modo producción activo
                </p>
                <p className="text-xs" style={{ color: '#92400e' }}>
                  Los pagos se procesan con plata real. Asegurate de que el CUIT sea el correcto del municipio.
                </p>
              </div>
            </div>
          )}

          {/* Test mode toggle */}
          <div
            className="flex items-center justify-between p-3 rounded-lg"
            style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}` }}
          >
            <div>
              <p className="text-sm font-semibold">Modo sandbox (test_mode)</p>
              <p className="text-[11px]" style={{ color: theme.textSecondary }}>
                Recomendado hasta verificar flujo end-to-end en producción.
              </p>
            </div>
            <button
              onClick={() => setState({ ...state, test_mode: !state.test_mode })}
              className="relative inline-flex h-6 w-11 rounded-full transition-colors"
              style={{ backgroundColor: state.test_mode ? '#22c55e' : '#9ca3af' }}
            >
              <span
                className="inline-block h-5 w-5 rounded-full bg-white transition-transform"
                style={{ transform: state.test_mode ? 'translateX(22px)' : 'translateX(2px)', marginTop: '2px' }}
              />
            </button>
          </div>

          {/* Access token */}
          <div>
            <label className="block text-xs font-semibold mb-1.5">
              Access Token <span style={{ color: '#ef4444' }}>*</span>
              {state.tiene_access_token && (
                <span className="ml-2 text-[10px] font-normal" style={{ color: '#22c55e' }}>
                  ✓ Ya hay uno guardado (dejalo vacío para conservarlo)
                </span>
              )}
            </label>
            <input
              type="password"
              value={state.access_token}
              onChange={(e) => setState({ ...state, access_token: e.target.value })}
              placeholder={state.tiene_access_token ? 'Pegá uno nuevo para reemplazar…' : 'TEST-xxxxxxxxxxxxxxxxxxxx…'}
              className="w-full px-3 py-2 rounded-lg text-sm font-mono outline-none"
              style={{
                backgroundColor: theme.backgroundSecondary,
                color: theme.text,
                border: `1px solid ${theme.border}`,
              }}
            />
          </div>

          {/* Public key */}
          <div>
            <label className="block text-xs font-semibold mb-1.5">Public Key</label>
            <input
              type="text"
              value={state.public_key}
              onChange={(e) => setState({ ...state, public_key: e.target.value })}
              placeholder="APP_USR-xxxx…"
              className="w-full px-3 py-2 rounded-lg text-sm font-mono outline-none"
              style={{
                backgroundColor: theme.backgroundSecondary,
                color: theme.text,
                border: `1px solid ${theme.border}`,
              }}
            />
          </div>

          {/* CUIT */}
          <div>
            <label className="block text-xs font-semibold mb-1.5">CUIT del municipio (cobranza)</label>
            <input
              type="text"
              value={state.cuit_cobranza}
              onChange={(e) => setState({ ...state, cuit_cobranza: e.target.value.replace(/\D/g, '').slice(0, 11) })}
              placeholder="30710000000"
              maxLength={11}
              className="w-full px-3 py-2 rounded-lg text-sm font-mono outline-none"
              style={{
                backgroundColor: theme.backgroundSecondary,
                color: theme.text,
                border: `1px solid ${theme.border}`,
              }}
            />
          </div>

          {/* Webhook secret */}
          <div>
            <label className="block text-xs font-semibold mb-1.5">
              Webhook Secret
              {state.webhook_secret_set && (
                <span className="ml-2 text-[10px] font-normal" style={{ color: '#22c55e' }}>
                  ✓ Configurado
                </span>
              )}
            </label>
            <input
              type="password"
              value={state.webhook_secret}
              onChange={(e) => setState({ ...state, webhook_secret: e.target.value })}
              placeholder={state.webhook_secret_set ? 'Pegá uno nuevo para reemplazar…' : 'Secret del webhook MP'}
              className="w-full px-3 py-2 rounded-lg text-sm font-mono outline-none"
              style={{
                backgroundColor: theme.backgroundSecondary,
                color: theme.text,
                border: `1px solid ${theme.border}`,
              }}
            />
            <p className="text-[11px] mt-1" style={{ color: theme.textSecondary }}>
              Para validar la firma HMAC del webhook entrante. Configuralo en el dashboard del provider.
            </p>
          </div>
        </div>
      )}
    </Modal>
  );
}
