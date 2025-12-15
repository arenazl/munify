import { useTheme } from '../../contexts/ThemeContext';

interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'circular' | 'rectangular' | 'rounded';
  width?: string | number;
  height?: string | number;
  animation?: 'pulse' | 'wave' | 'none';
}

/**
 * Componente Skeleton base para mostrar placeholder mientras carga
 */
export function Skeleton({
  className = '',
  variant = 'text',
  width,
  height,
  animation = 'wave',
}: SkeletonProps) {
  const { theme } = useTheme();

  const getVariantStyles = () => {
    switch (variant) {
      case 'circular':
        return 'rounded-full';
      case 'rectangular':
        return 'rounded-none';
      case 'rounded':
        return 'rounded-xl';
      case 'text':
      default:
        return 'rounded';
    }
  };

  const getAnimationClass = () => {
    switch (animation) {
      case 'pulse':
        return 'animate-pulse';
      case 'wave':
        return 'skeleton-wave';
      case 'none':
      default:
        return '';
    }
  };

  return (
    <>
      <div
        className={`${getVariantStyles()} ${getAnimationClass()} ${className}`}
        style={{
          backgroundColor: `${theme.textSecondary}15`,
          width: width,
          height: height || (variant === 'text' ? '1em' : undefined),
        }}
      />
      {animation === 'wave' && (
        <style>{`
          @keyframes skeleton-wave {
            0% {
              background-position: -200% 0;
            }
            100% {
              background-position: 200% 0;
            }
          }
          .skeleton-wave {
            background: linear-gradient(
              90deg,
              ${theme.textSecondary}10 0%,
              ${theme.textSecondary}20 50%,
              ${theme.textSecondary}10 100%
            );
            background-size: 200% 100%;
            animation: skeleton-wave 1.5s ease-in-out infinite;
          }
        `}</style>
      )}
    </>
  );
}

/**
 * Skeleton para ABMCard - replica la estructura de una card típica
 */
export function ABMCardSkeleton({ index = 0 }: { index?: number }) {
  const { theme } = useTheme();

  return (
    <div
      className="rounded-2xl p-5 animate-fade-in-up"
      style={{
        backgroundColor: theme.card,
        border: `1px solid ${theme.border}`,
        animationDelay: `${index * 50}ms`,
        animationFillMode: 'both',
      }}
    >
      {/* Header con icono y título */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <Skeleton variant="rounded" width={48} height={48} />
          <div className="space-y-2">
            <Skeleton width={120} height={16} />
            <Skeleton width={80} height={12} />
          </div>
        </div>
        <Skeleton variant="rounded" width={70} height={24} />
      </div>

      {/* Contenido */}
      <div className="space-y-3">
        <Skeleton width="100%" height={14} />
        <Skeleton width="85%" height={14} />
        <Skeleton width="60%" height={14} />
      </div>

      {/* Footer con acciones */}
      <div className="flex items-center justify-between mt-4 pt-4" style={{ borderTop: `1px solid ${theme.border}` }}>
        <Skeleton width={100} height={12} />
        <div className="flex gap-2">
          <Skeleton variant="circular" width={32} height={32} />
          <Skeleton variant="circular" width={32} height={32} />
        </div>
      </div>
    </div>
  );
}

/**
 * Grid de skeletons para ABMPage
 */
export function ABMGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
      {Array.from({ length: count }).map((_, i) => (
        <ABMCardSkeleton key={i} index={i} />
      ))}
    </div>
  );
}

/**
 * Skeleton para tabla
 */
export function TableRowSkeleton({ columns = 4 }: { columns?: number }) {
  const { theme } = useTheme();

  return (
    <tr style={{ backgroundColor: theme.card }}>
      {Array.from({ length: columns }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <Skeleton width={i === 0 ? '60%' : i === columns - 1 ? 60 : '80%'} height={14} />
        </td>
      ))}
    </tr>
  );
}

/**
 * Skeleton para ABMTable completa
 */
export function ABMTableSkeleton({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) {
  const { theme } = useTheme();

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
    >
      <table className="w-full">
        <thead>
          <tr style={{ backgroundColor: theme.backgroundSecondary }}>
            {Array.from({ length: columns }).map((_, i) => (
              <th key={i} className="px-4 py-3 text-left">
                <Skeleton width={80} height={12} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y" style={{ borderColor: theme.border }}>
          {Array.from({ length: rows }).map((_, i) => (
            <TableRowSkeleton key={i} columns={columns} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Skeleton para Dashboard stats
 */
export function DashboardStatSkeleton() {
  const { theme } = useTheme();

  return (
    <div
      className="rounded-xl p-5"
      style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
    >
      <div className="flex items-center justify-between mb-3">
        <Skeleton variant="rounded" width={40} height={40} />
        <Skeleton width={60} height={24} />
      </div>
      <Skeleton width={100} height={12} className="mb-2" />
      <Skeleton width="70%" height={10} />
    </div>
  );
}

/**
 * Skeleton para gráfico
 */
export function ChartSkeleton({ height = 300 }: { height?: number }) {
  const { theme } = useTheme();

  return (
    <div
      className="rounded-xl p-5"
      style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <Skeleton width={150} height={20} />
        <Skeleton width={100} height={32} variant="rounded" />
      </div>

      {/* Chart placeholder */}
      <div
        className="rounded-lg flex items-end justify-around gap-2 p-4"
        style={{ height, backgroundColor: theme.backgroundSecondary }}
      >
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton
            key={i}
            variant="rounded"
            width={40}
            height={`${30 + Math.random() * 60}%`}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Skeleton para formulario
 */
export function FormSkeleton({ fields = 4 }: { fields?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i}>
          <Skeleton width={100} height={14} className="mb-2" />
          <Skeleton variant="rounded" width="100%" height={44} />
        </div>
      ))}
    </div>
  );
}

/**
 * Skeleton para detalle de reclamo
 */
export function ReclamoDetailSkeleton() {
  const { theme } = useTheme();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Skeleton variant="rounded" width={64} height={64} />
        <div className="flex-1 space-y-2">
          <Skeleton width="70%" height={24} />
          <Skeleton width="40%" height={16} />
        </div>
        <Skeleton variant="rounded" width={80} height={28} />
      </div>

      {/* Info grid */}
      <div
        className="rounded-xl p-4"
        style={{ backgroundColor: theme.backgroundSecondary }}
      >
        <div className="grid grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton variant="rounded" width={32} height={32} />
              <div className="space-y-1">
                <Skeleton width={60} height={10} />
                <Skeleton width={100} height={14} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Descripción */}
      <div className="space-y-2">
        <Skeleton width={100} height={14} />
        <Skeleton width="100%" height={14} />
        <Skeleton width="90%" height={14} />
        <Skeleton width="75%" height={14} />
      </div>

      {/* Mapa placeholder */}
      <Skeleton variant="rounded" width="100%" height={200} />
    </div>
  );
}

/**
 * Skeleton para el Wizard de nuevo reclamo
 */
export function WizardFormSkeleton() {
  const { theme } = useTheme();

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
    >
      {/* Header */}
      <div
        className="px-6 py-4 flex items-center gap-4"
        style={{ borderBottom: `1px solid ${theme.border}` }}
      >
        <Skeleton variant="rounded" width={40} height={40} />
        <div className="flex-1 space-y-2">
          <Skeleton width={200} height={20} />
          <Skeleton width={150} height={14} />
        </div>
        <Skeleton width={100} height={16} />
      </div>

      {/* Tabs */}
      <div
        className="px-6 py-3 flex items-center gap-2"
        style={{ backgroundColor: theme.backgroundSecondary }}
      >
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} variant="rounded" width={120} height={40} />
        ))}
      </div>

      {/* Progress bar */}
      <Skeleton width="35%" height={4} />

      {/* Content */}
      <div className="p-6 space-y-6">
        {/* Step title */}
        <div className="flex items-center gap-3 mb-6">
          <Skeleton variant="rounded" width={32} height={32} />
          <div className="space-y-1">
            <Skeleton width={180} height={18} />
            <Skeleton width={250} height={14} />
          </div>
        </div>

        {/* Form fields */}
        <div className="space-y-4">
          <div>
            <Skeleton width={80} height={14} className="mb-2" />
            <Skeleton variant="rounded" width="100%" height={44} />
          </div>
          <div>
            <Skeleton width={100} height={14} className="mb-2" />
            <Skeleton variant="rounded" width="100%" height={100} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Skeleton width={70} height={14} className="mb-2" />
              <Skeleton variant="rounded" width="100%" height={44} />
            </div>
            <div>
              <Skeleton width={60} height={14} className="mb-2" />
              <Skeleton variant="rounded" width="100%" height={44} />
            </div>
          </div>
        </div>
      </div>

      {/* AI Suggestion panel */}
      <div className="mx-6 mb-4">
        <div
          className="p-4 rounded-xl flex items-start gap-3"
          style={{ backgroundColor: `${theme.primary}10`, border: `1px solid ${theme.primary}30` }}
        >
          <Skeleton variant="rounded" width={32} height={32} />
          <div className="flex-1 space-y-2">
            <Skeleton width={120} height={14} />
            <Skeleton width="90%" height={12} />
            <Skeleton width="70%" height={12} />
          </div>
        </div>
      </div>

      {/* Footer */}
      <div
        className="px-6 py-4 flex items-center justify-between"
        style={{ borderTop: `1px solid ${theme.border}`, backgroundColor: theme.backgroundSecondary }}
      >
        <Skeleton variant="rounded" width={100} height={40} />
        <div className="flex gap-3">
          <Skeleton variant="rounded" width={100} height={40} />
          <Skeleton variant="rounded" width={120} height={40} />
        </div>
      </div>
    </div>
  );
}

/**
 * Skeleton para lista de items (genérico)
 */
export function ListItemSkeleton({ count = 5 }: { count?: number }) {
  const { theme } = useTheme();

  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 p-3 rounded-xl"
          style={{
            backgroundColor: theme.card,
            border: `1px solid ${theme.border}`,
            animationDelay: `${i * 50}ms`,
          }}
        >
          <Skeleton variant="circular" width={40} height={40} />
          <div className="flex-1 space-y-1">
            <Skeleton width="60%" height={14} />
            <Skeleton width="40%" height={12} />
          </div>
          <Skeleton variant="rounded" width={24} height={24} />
        </div>
      ))}
    </div>
  );
}

/**
 * Skeleton para el mapa
 */
export function MapSkeleton({ height = 300 }: { height?: number }) {
  const { theme } = useTheme();

  return (
    <div
      className="rounded-xl overflow-hidden relative"
      style={{ height, backgroundColor: theme.backgroundSecondary }}
    >
      {/* Fake map grid */}
      <div className="absolute inset-0 opacity-20">
        <div
          className="w-full h-full"
          style={{
            backgroundImage: `
              linear-gradient(${theme.border} 1px, transparent 1px),
              linear-gradient(90deg, ${theme.border} 1px, transparent 1px)
            `,
            backgroundSize: '40px 40px',
          }}
        />
      </div>

      {/* Center marker placeholder */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
        <Skeleton variant="circular" width={48} height={48} animation="pulse" />
      </div>

      {/* Controls placeholder */}
      <div className="absolute top-4 right-4 space-y-2">
        <Skeleton variant="rounded" width={32} height={32} />
        <Skeleton variant="rounded" width={32} height={32} />
      </div>

      {/* Search bar placeholder */}
      <div className="absolute top-4 left-4 right-16">
        <Skeleton variant="rounded" width="100%" height={40} />
      </div>
    </div>
  );
}
