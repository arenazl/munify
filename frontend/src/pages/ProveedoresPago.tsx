import { useEffect, useState } from 'react';
import { Wallet, CreditCard, Banknote, QrCode, RefreshCcw, Check, Loader2, Download, Sparkles, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { proveedoresPagoApi } from '../lib/api';
import { useTheme } from '../contexts/ThemeContext';
import { StickyPageHeader } from '../components/ui/StickyPageHeader';

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
    </div>
  );
}
