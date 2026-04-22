import { ShieldCheck, Shield, UserCog } from 'lucide-react';

/**
 * Badge de verificación biométrica del vecino.
 *
 * Props:
 *  - nivel: 0 | 1 | 2  (0 = no verificado, 1 = email, 2 = biometría completa)
 *  - modo:  'self_service' | 'assisted' | null
 *  - compact: versión pequeña (sin texto)
 */
export function KycBadge({
  nivel,
  modo,
  compact = false,
}: {
  nivel?: number | null;
  modo?: 'self_service' | 'assisted' | null;
  compact?: boolean;
}) {
  const n = nivel ?? 0;
  if (n < 2) {
    if (compact) {
      return (
        <span
          className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded"
          style={{ backgroundColor: '#f3f4f6', color: '#6b7280' }}
          title="No verificado biométricamente"
        >
          <Shield className="w-3 h-3" />
        </span>
      );
    }
    return (
      <span
        className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full"
        style={{ backgroundColor: '#f3f4f6', color: '#6b7280' }}
      >
        <Shield className="w-3 h-3" />
        Sin verificar
      </span>
    );
  }

  const isAssisted = modo === 'assisted';
  const color = isAssisted ? '#8b5cf6' : '#22c55e';
  const label = isAssisted ? 'Verificado en ventanilla' : 'Verificado';
  const Icon = isAssisted ? UserCog : ShieldCheck;

  if (compact) {
    return (
      <span
        className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded"
        style={{ backgroundColor: `${color}20`, color }}
        title={label}
      >
        <Icon className="w-3 h-3" />
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full"
      style={{ backgroundColor: `${color}20`, color }}
      title={isAssisted ? 'Validado presencialmente por un operador de ventanilla' : 'Verificado biométricamente desde la app'}
    >
      <Icon className="w-3 h-3" />
      {label}
    </span>
  );
}
