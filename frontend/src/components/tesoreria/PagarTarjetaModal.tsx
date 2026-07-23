import { useState } from 'react';
import { CreditCard, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Sheet } from '../ui/Sheet';
import { ModernSelect } from '../ui/ModernSelect';
import { MoneyInput } from '../ui/MoneyInput';
import { DatePicker } from '../ui/DatePicker';
import { PrimaryButton } from '../ui/PrimaryButton';
import { useTheme } from '../../contexts/ThemeContext';
import { cajasApi } from '../../lib/api';
import type { Caja } from '../../types';

interface Props {
  /** Tarjeta a pagar. Si es null, el sheet queda cerrado. */
  tarjeta: Caja | null;
  /** Todas las cajas (para elegir de dónde sale la plata). */
  cajas: Caja[];
  onClose: () => void;
  onDone: () => void;
}

function fmt(n: number): string {
  return `$${n.toLocaleString('es-AR', { maximumFractionDigits: 2 })}`;
}

/**
 * Pago de una tarjeta de crédito.
 *
 * Registra los DOS movimientos de una: ingreso en la caja-tarjeta (cancela la
 * deuda y libera crédito) y egreso en la caja real de donde sale la plata.
 * NO crea un gasto: el gasto ya quedó registrado cuando se compró con la
 * tarjeta — esto sólo salda lo que se debe.
 */
export function PagarTarjetaModal({ tarjeta, cajas, onClose, onDone }: Props) {
  const { theme } = useTheme();
  const [cajaOrigenId, setCajaOrigenId] = useState('');
  const [monto, setMonto] = useState('');
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [guardando, setGuardando] = useState(false);

  const deuda = parseFloat(tarjeta?.deuda_actual || '0') || 0;
  const cajasReales = cajas.filter(c => !c.es_tarjeta && c.activo);

  const cerrar = () => {
    setCajaOrigenId('');
    setMonto('');
    onClose();
  };

  const pagar = async () => {
    if (!tarjeta) return;
    const m = parseFloat(monto);
    if (!cajaOrigenId) { toast.error('Elegí de qué caja sale el pago'); return; }
    if (!m || m <= 0) { toast.error('Ingresá el monto a pagar'); return; }

    setGuardando(true);
    try {
      await cajasApi.pagarTarjeta({
        tarjeta_caja_id: tarjeta.id,
        caja_origen_id: parseInt(cajaOrigenId, 10),
        monto,
        fecha,
      });
      toast.success(`Pago de ${fmt(m)} registrado`);
      onDone();
      cerrar();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(msg || 'No se pudo registrar el pago');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Sheet
      open={!!tarjeta}
      onClose={cerrar}
      title="Pagar tarjeta"
      description={tarjeta?.nombre || ''}
    >
      <div className="space-y-4">
        {/* Deuda actual */}
        <div
          className="rounded-xl p-3"
          style={{ backgroundColor: `${theme.primary}10`, border: `1px solid ${theme.primary}30` }}
        >
          <p className="text-[10px] uppercase font-bold" style={{ color: theme.textSecondary }}>
            Deuda actual de la tarjeta
          </p>
          <p className="text-2xl font-bold tabular-nums" style={{ color: deuda > 0 ? '#ef4444' : theme.text }}>
            {fmt(deuda)}
          </p>
          <p className="text-[11px] mt-1" style={{ color: theme.textSecondary }}>
            Al registrar el pago, la plata sale de la caja que elijas y la tarjeta
            recupera ese crédito.
          </p>
        </div>

        <ModernSelect
          label="¿De qué caja sale el pago?"
          value={cajaOrigenId}
          onChange={setCajaOrigenId}
          options={cajasReales.map(c => ({
            value: String(c.id),
            label: `${c.nombre} — ${fmt(parseFloat(c.saldo_actual || '0') || 0)}`,
          }))}
          placeholder="Elegí la caja..."
          searchable
        />

        <div>
          <label className="block text-xs font-semibold mb-1" style={{ color: theme.text }}>
            Monto a pagar
          </label>
          <MoneyInput
            value={monto}
            onChange={setMonto}
            placeholder="0"
            className="w-full px-4 py-3 rounded-xl text-lg font-bold"
            style={{ backgroundColor: theme.backgroundSecondary, border: `2px solid ${theme.border}`, color: theme.text }}
          />
          {deuda > 0 && (
            <button
              type="button"
              onClick={() => setMonto(String(deuda))}
              className="mt-1.5 text-[11px] font-semibold underline"
              style={{ color: theme.primary }}
            >
              Pagar el total ({fmt(deuda)})
            </button>
          )}
        </div>

        <div>
          <label className="block text-xs font-semibold mb-1" style={{ color: theme.text }}>
            Fecha del pago
          </label>
          <DatePicker value={fecha} onChange={setFecha} />
        </div>

        <PrimaryButton fullWidth disabled={guardando} onClick={pagar}>
          {guardando ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Registrando...</>
          ) : (
            <><CreditCard className="h-4 w-4" /> Registrar pago</>
          )}
        </PrimaryButton>
      </div>
    </Sheet>
  );
}
