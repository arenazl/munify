import { useEffect, useMemo, useState } from 'react';
import { CreditCard, Loader2, CheckCircle2 } from 'lucide-react';
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
  return `$${n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Última caja usada para pagar. Es una comodidad del navegador, no un dato del
 *  municipio: si se pierde, el combo simplemente arranca vacío. */
const CLAVE_ULTIMA_CAJA = 'tesoreria.pagarTarjeta.ultimaCaja';

/**
 * Pago de una tarjeta de crédito.
 *
 * Registra los DOS movimientos de una: ingreso en la caja-tarjeta (cancela la
 * deuda y libera crédito) y egreso en la caja real de donde sale la plata.
 * NO crea un gasto: el gasto ya quedó registrado cuando se compró con la
 * tarjeta — esto sólo salda lo que se debe.
 *
 * VACÍO = PAGA TODO (dueño, 2026-09-10). El caso real del cliente es pagar el
 * resumen entero: entra, le da grabar, y la tarjeta queda en cero. Antes tenía
 * que tipear 6.247.510,07 a mano o encontrar un link de 11px debajo del input;
 * en producción el resultado fue que en cuatro meses y 26 compras no registró un
 * solo pago — el endpoint nunca se llamó una vez.
 *
 * Y NADA SE DEDUCE: el renglón bajo el monto dice siempre, en vivo, qué va a
 * pasar al grabar — "pagás todo y queda en cero", o "pagás $300 y sigue debiendo
 * $X". El monto del pago total lo calcula el BACKEND en el momento de grabar
 * (por eso no se manda `monto`): si entró un gasto mientras el modal estaba
 * abierto, la tarjeta igual queda en cero exacto y no con un resto suelto.
 */
export function PagarTarjetaModal({ tarjeta, cajas, onClose, onDone }: Props) {
  const { theme } = useTheme();
  const [cajaOrigenId, setCajaOrigenId] = useState('');
  const [monto, setMonto] = useState('');
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [guardando, setGuardando] = useState(false);

  const deuda = parseFloat(tarjeta?.deuda_actual || '0') || 0;
  const cajasReales = useMemo(
    () => cajas.filter(c => !c.es_tarjeta && c.activo),
    [cajas],
  );

  /* La caja de origen no se puede adivinar, pero casi siempre es la misma. Si
     hay una sola, se elige sola; si no, se recuerda la última. Un campo menos
     entre el cliente y el botón. */
  useEffect(() => {
    if (!tarjeta || cajaOrigenId) return;
    if (cajasReales.length === 1) { setCajaOrigenId(String(cajasReales[0].id)); return; }
    let ultima: string | null = null;
    try { ultima = localStorage.getItem(CLAVE_ULTIMA_CAJA); } catch { /* modo privado */ }
    if (ultima && cajasReales.some(c => String(c.id) === ultima)) setCajaOrigenId(ultima);
  }, [tarjeta, cajasReales, cajaOrigenId]);

  const parcial = parseFloat(monto) || 0;
  const esTotal = monto.trim() === '' || parcial >= deuda;
  const restante = esTotal ? 0 : deuda - parcial;

  const cerrar = () => {
    setCajaOrigenId('');
    setMonto('');
    onClose();
  };

  const pagar = async () => {
    if (!tarjeta) return;
    if (!cajaOrigenId) { toast.error('Elegí de qué caja sale el pago'); return; }
    if (!esTotal && parcial <= 0) { toast.error('El monto tiene que ser mayor a cero'); return; }

    setGuardando(true);
    try {
      await cajasApi.pagarTarjeta({
        tarjeta_caja_id: tarjeta.id,
        caja_origen_id: parseInt(cajaOrigenId, 10),
        // Sin monto = pagá todo. Lo resuelve el backend con la deuda del momento.
        ...(esTotal ? {} : { monto }),
        fecha,
      });
      try { localStorage.setItem(CLAVE_ULTIMA_CAJA, cajaOrigenId); } catch { /* modo privado */ }
      toast.success(
        esTotal
          ? 'Tarjeta paga: el saldo quedó en cero'
          : `Pago de ${fmt(parcial)} registrado. Queda debiendo ${fmt(restante)}`,
      );
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
        {/* Lo que se debe hoy. Es el número del que sale todo lo demás. */}
        <div
          className="rounded-xl p-3"
          style={{ backgroundColor: `${theme.primary}10`, border: `1px solid ${theme.primary}30` }}
        >
          <p className="text-[10px] uppercase font-bold" style={{ color: theme.textSecondary }}>
            Gastado con esta tarjeta, sin pagar
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
            Monto a pagar{' '}
            <span style={{ color: theme.textSecondary }}>— dejalo vacío para pagar todo</span>
          </label>
          <MoneyInput
            value={monto}
            onChange={setMonto}
            placeholder={`Pagar todo (${fmt(deuda)})`}
            className="w-full px-4 py-3 rounded-xl text-lg font-bold"
            style={{ backgroundColor: theme.backgroundSecondary, border: `2px solid ${theme.border}`, color: theme.text }}
          />

          {/* EL RENGLÓN QUE EVITA LA DEDUCCIÓN: dice en vivo qué va a pasar al
              grabar, tanto con el campo vacío como con un número escrito. */}
          <div
            className="mt-2 rounded-lg px-3 py-2 text-[12px] leading-snug flex items-start gap-2"
            style={{
              backgroundColor: esTotal
                ? 'color-mix(in srgb, var(--pl-green-strong, #16a34a) 12%, transparent)'
                : theme.backgroundSecondary,
              border: `1px solid ${esTotal
                ? 'color-mix(in srgb, var(--pl-green-strong, #16a34a) 35%, transparent)'
                : theme.border}`,
              color: theme.text,
            }}
          >
            {esTotal && (
              <CheckCircle2
                className="h-4 w-4 flex-shrink-0 mt-px"
                style={{ color: 'var(--pl-green-strong, #16a34a)' }}
              />
            )}
            <span>
              {esTotal ? (
                <>
                  Vas a pagar <strong>todo: {fmt(deuda)}</strong>. La tarjeta queda en cero.
                </>
              ) : (
                <>
                  Pagás <strong>{fmt(parcial)}</strong> y la tarjeta sigue debiendo{' '}
                  <strong>{fmt(restante)}</strong>.
                </>
              )}
            </span>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold mb-1" style={{ color: theme.text }}>
            Fecha del pago
          </label>
          <DatePicker value={fecha} onChange={setFecha} />
        </div>

        <PrimaryButton fullWidth disabled={guardando} onClick={pagar}>
          {guardando ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Registrando...
            </>
          ) : (
            <>
              <CreditCard className="h-4 w-4" />{' '}
              {esTotal ? `Pagar todo (${fmt(deuda)})` : `Pagar ${fmt(parcial)}`}
            </>
          )}
        </PrimaryButton>
      </div>
    </Sheet>
  );
}
