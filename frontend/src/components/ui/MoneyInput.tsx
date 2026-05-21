import { ChangeEvent, CSSProperties, useMemo } from 'react';

/**
 * Input enmascarado de moneda (formato AR). Muestra el separador de miles
 * con punto y el decimal con coma mientras el user tipea. Internamente
 * trabaja con un value en formato US (punto decimal, sin separadores) para
 * ser compatible con APIs / parseFloat / Decimal del backend.
 *
 * Ejemplo:
 *   value (interno/externo): "45454544"        -> display: "45.454.544"
 *   value (interno/externo): "45454544.5"      -> display: "45.454.544,5"
 *   value (interno/externo): "45454544.50"     -> display: "45.454.544,50"
 *
 * API:
 *   <MoneyInput value={montoPesos} onChange={setMontoPesos} ... />
 *
 * onChange devuelve siempre el value SIN formato (con punto decimal),
 * listo para mandar al backend o convertir a Number.
 *
 * Source-of-truth canonica: APP_GUIDE/components/ui/MoneyInput.tsx
 * (cuando se modifique algo estable, portar alla).
 */
interface MoneyInputProps {
  /** Value sin formato, formato US: "1234.56" (no "1.234,56"). */
  value: string;
  /** Callback con el value sin formato (US: "1234.56"). */
  onChange: (raw: string) => void;
  placeholder?: string;
  className?: string;
  style?: CSSProperties;
  disabled?: boolean;
  /** Permitir decimales con coma. Default true. Si false, solo enteros. */
  allowDecimals?: boolean;
  /** Cantidad maxima de decimales (default 2 para pesos). */
  maxDecimals?: number;
  /** Permitir valores negativos. Default false. */
  allowNegative?: boolean;
  /** Atajos pasthrough */
  onBlur?: () => void;
  onFocus?: () => void;
  autoFocus?: boolean;
  id?: string;
  name?: string;
  /** ARIA */
  'aria-label'?: string;
}

/** Convierte un string en formato US (punto decimal) o sin formato a la
 *  representacion AR con separadores de miles. Tolera entrada vacia, '-'
 *  parcial, comas, etc. */
function toDisplay(raw: string, maxDecimals: number): string {
  if (raw === '' || raw === '-' || raw == null) return raw || '';
  // Acepta tanto US como AR como input
  const normalized = raw.replace(/\./g, '_PUNTO_').replace(/,/g, '.').replace(/_PUNTO_/g, '');
  // Si raw es formato US ya, normalized va a tener el punto decimal correcto.
  // Si raw es formato AR ya, normalized swap los puntos por nada y la coma por punto.
  // Para no perder el caso US: si raw NO tiene coma, asumimos US y solo respetamos
  // el primer punto como decimal.
  let withDot = raw.replace(/,/g, '.');
  // Si hay mas de un punto, solo el ULTIMO se considera decimal (para tolerar
  // "1.234.56" que es claramente AR mal escrito o US sin formato).
  const lastDot = withDot.lastIndexOf('.');
  if (lastDot !== -1) {
    const intPart = withDot.slice(0, lastDot).replace(/\./g, '');
    const decPart = withDot.slice(lastDot + 1).replace(/\D/g, '').slice(0, maxDecimals);
    withDot = intPart + (decPart !== '' ? '.' + decPart : '.');
  }
  void normalized; // not used, mantenido para futura extension

  const isNeg = withDot.startsWith('-');
  const unsigned = isNeg ? withDot.slice(1) : withDot;
  const [intRaw, decRaw] = unsigned.split('.');
  const intDigits = (intRaw || '').replace(/\D/g, '');
  const intFmt = intDigits === '' ? '' : intDigits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  let out = (isNeg ? '-' : '') + intFmt;
  if (decRaw !== undefined) {
    out += ',' + decRaw;
  }
  return out;
}

/** Convierte el display AR ("1.234,56") al value interno US ("1234.56"). */
function toRaw(masked: string, allowDecimals: boolean, maxDecimals: number, allowNegative: boolean): string {
  if (!masked) return '';
  let s = masked;
  if (!allowNegative) s = s.replace(/-/g, '');
  // Sacar todo lo que no sea digito, coma o signo
  s = s.replace(/[^\d,-]/g, '');
  if (!allowDecimals) {
    s = s.replace(/,/g, '');
  } else {
    // Solo la PRIMERA coma cuenta como decimal
    const firstComma = s.indexOf(',');
    if (firstComma !== -1) {
      const before = s.slice(0, firstComma);
      const after = s.slice(firstComma + 1).replace(/,/g, '');
      s = before + ',' + after;
    }
  }
  // Limitar negativos al primer caracter
  if (allowNegative) {
    const isNeg = s.startsWith('-');
    s = (isNeg ? '-' : '') + s.replace(/-/g, '');
  }
  // A US (punto decimal)
  const [intStr, decStr] = s.split(',');
  const intClean = (intStr || '').replace(/\D/g, '');
  if (decStr === undefined) {
    return (s.startsWith('-') ? '-' : '') + intClean;
  }
  const decClean = decStr.replace(/\D/g, '').slice(0, maxDecimals);
  return (s.startsWith('-') ? '-' : '') + intClean + '.' + decClean;
}

export function MoneyInput({
  value,
  onChange,
  placeholder,
  className,
  style,
  disabled,
  allowDecimals = true,
  maxDecimals = 2,
  allowNegative = false,
  onBlur,
  onFocus,
  autoFocus,
  id,
  name,
  'aria-label': ariaLabel,
}: MoneyInputProps) {
  const display = useMemo(() => toDisplay(value || '', maxDecimals), [value, maxDecimals]);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const masked = e.target.value;
    const raw = toRaw(masked, allowDecimals, maxDecimals, allowNegative);
    onChange(raw);
  };

  return (
    <input
      type="text"
      inputMode={allowDecimals ? 'decimal' : 'numeric'}
      value={display}
      onChange={handleChange}
      onBlur={onBlur}
      onFocus={onFocus}
      placeholder={placeholder}
      className={className}
      style={style}
      disabled={disabled}
      autoFocus={autoFocus}
      id={id}
      name={name}
      aria-label={ariaLabel}
    />
  );
}
