/**
 * Sheet que muestra la cuenta corriente de un contacto (proveedor o
 * beneficiario): todas las Ordenes de Pago emitidas a su nombre + totales.
 *
 * Se abre con un contacto_id; cuando es null, no renderiza nada.
 */
import { useEffect, useState } from 'react';
import { Loader2, FileText, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Sheet } from '../ui/Sheet';
import { StatusPill } from '../ui/StatusPill';
import { useTheme } from '../../contexts/ThemeContext';
import { ordenesPagoApi } from '../../lib/api';
import { getEtapaInfo } from '../../lib/etapaContable';

interface OpItem {
  id: number;
  numero: string;
  fecha_emision: string | null;
  fecha_vencimiento: string | null;
  fecha_pago: string | null;
  concepto: string;
  monto_pesos: string;
  estado: string;
  etapa_contable: string;
  nro_factura: string | null;
  gasto_id: number | null;
}

interface CuentaCorriente {
  contacto: { id: number; nombre: string; dni: string | null; tipo: string | null };
  totales: {
    facturado: string;
    pagado: string;
    pendiente: string;
    devengado_no_pagado: string;
    cantidad_ops: number;
  };
  ops: OpItem[];
}

const ESTADO_COLOR: Record<string, string> = {
  pendiente: '#f59e0b',
  autorizada: '#3b82f6',
  pagada: '#10b981',
  anulada: '#6b7280',
};

function fmtMoney(v: string | number): string {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return `$${(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })}`;
}

interface Props {
  contactoId: number | null;
  onClose: () => void;
}

export function CuentaCorrienteSheet({ contactoId, onClose }: Props) {
  const { theme } = useTheme();
  const [data, setData] = useState<CuentaCorriente | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!contactoId) {
      setData(null);
      return;
    }
    setLoading(true);
    ordenesPagoApi.cuentaCorriente(contactoId)
      .then(r => setData(r.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [contactoId]);

  return (
    <Sheet
      open={contactoId !== null}
      onClose={onClose}
      title={data ? `Cuenta corriente · ${data.contacto.nombre}` : 'Cuenta corriente'}
      description="Resumen de Órdenes de Pago emitidas a este contacto."
    >
      {loading || !data ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin" style={{ color: theme.primary }} />
        </div>
      ) : (
        <div className="space-y-4">
          {/* Totales */}
          <div className="grid grid-cols-2 gap-2">
            <Tile label="Facturado" value={fmtMoney(data.totales.facturado)} sub={`${data.totales.cantidad_ops} OPs activas`} color={theme.primary} highlighted />
            <Tile label="Pagado" value={fmtMoney(data.totales.pagado)} sub="Salida efectiva" color="#10b981" />
            <Tile label="Pendiente" value={fmtMoney(data.totales.pendiente)} sub="Saldo a pagar" color="#f59e0b" />
            <Tile label="Devengado" value={fmtMoney(data.totales.devengado_no_pagado)} sub="Recibido sin pagar" color="#3b82f6" />
          </div>

          {/* Lista de OPs */}
          {data.ops.length === 0 ? (
            <div
              className="rounded-xl p-6 text-center text-sm"
              style={{ backgroundColor: theme.card, border: `1px dashed ${theme.border}`, color: theme.textSecondary }}
            >
              Este contacto no tiene Órdenes de Pago emitidas.
            </div>
          ) : (
            <div className="rounded-xl overflow-hidden" style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}>
              <div
                className="px-3 py-2 text-[11px] uppercase font-bold flex items-center gap-2"
                style={{ backgroundColor: theme.backgroundSecondary, color: theme.textSecondary }}
              >
                <FileText className="h-3.5 w-3.5" /> Órdenes de Pago ({data.ops.length})
              </div>
              {data.ops.map((op, i) => {
                const etapa = getEtapaInfo(op.etapa_contable);
                const EtapaIcon = etapa.icon;
                return (
                  <div
                    key={op.id}
                    className="px-3 py-2.5 flex items-center gap-3"
                    style={{ borderTop: i > 0 ? `1px solid ${theme.border}` : undefined }}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-semibold" style={{ color: theme.primary }}>{op.numero}</span>
                        <StatusPill
                          label={op.estado}
                          color={ESTADO_COLOR[op.estado] || theme.textSecondary}
                          size="xs"
                        />
                        <span
                          className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1 whitespace-nowrap"
                          style={{ backgroundColor: etapa.bg, color: etapa.color, border: `1px solid ${etapa.color}30` }}
                          title={etapa.hint}
                        >
                          <EtapaIcon className="h-3 w-3" />
                          {etapa.label}
                        </span>
                      </div>
                      <p className="text-sm font-medium truncate mt-0.5" style={{ color: theme.text }}>{op.concepto}</p>
                      <p className="text-[11px]" style={{ color: theme.textSecondary }}>
                        Emisión {op.fecha_emision ? new Date(op.fecha_emision).toLocaleDateString('es-AR') : '—'}
                        {op.fecha_pago && ` · Pago ${new Date(op.fecha_pago).toLocaleDateString('es-AR')}`}
                        {op.nro_factura && ` · Fact ${op.nro_factura}`}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="font-bold tabular-nums text-sm" style={{ color: theme.text }}>{fmtMoney(op.monto_pesos)}</p>
                      <Link
                        to={`/gestion/contaduria/ordenes-pago?search=${encodeURIComponent(op.numero)}`}
                        className="text-[10px] inline-flex items-center gap-1 mt-0.5"
                        style={{ color: theme.primary }}
                        onClick={onClose}
                      >
                        Ver <ExternalLink className="h-2.5 w-2.5" />
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}

function Tile({ label, value, sub, color, highlighted }: { label: string; value: string; sub?: string; color: string; highlighted?: boolean }) {
  const { theme } = useTheme();
  return (
    <div
      className="rounded-xl p-3"
      style={{
        backgroundColor: theme.card,
        border: `${highlighted ? 2 : 1}px solid ${color}`,
      }}
    >
      <p className="text-[10px] uppercase font-bold tracking-wider" style={{ color: theme.textSecondary }}>{label}</p>
      <p className="text-lg font-bold tabular-nums leading-none mt-1" style={{ color }}>{value}</p>
      {sub && <p className="text-[10px] mt-1" style={{ color: theme.textSecondary }}>{sub}</p>}
    </div>
  );
}
