import { MapPin, Calendar, Clock, AlertTriangle, MessageCircle, Building2 } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import type { Reclamo, EstadoReclamo } from '../../types';
import * as LucideIcons from 'lucide-react';

// Colores sólidos para estados (compartidos entre vecino y supervisor)
export const estadoColors: Record<EstadoReclamo, { bg: string; text: string }> = {
  recibido: { bg: '#0891b2', text: '#ffffff' },
  en_curso: { bg: '#f59e0b', text: '#ffffff' },
  finalizado: { bg: '#10b981', text: '#ffffff' },
  pospuesto: { bg: '#f97316', text: '#ffffff' },
  rechazado: { bg: '#ef4444', text: '#ffffff' },
  // Legacy
  nuevo: { bg: '#6366f1', text: '#ffffff' },
  asignado: { bg: '#3b82f6', text: '#ffffff' },
  en_proceso: { bg: '#f59e0b', text: '#ffffff' },
  pendiente_confirmacion: { bg: '#8b5cf6', text: '#ffffff' },
  resuelto: { bg: '#10b981', text: '#ffffff' },
};

export const estadoLabels: Record<EstadoReclamo, string> = {
  recibido: 'Recibido',
  en_curso: 'En Curso',
  finalizado: 'Finalizado',
  pospuesto: 'Pospuesto',
  rechazado: 'Rechazado',
  // Legacy
  nuevo: 'Nuevo',
  asignado: 'Asignado',
  en_proceso: 'En Proceso',
  pendiente_confirmacion: 'Pend. Confirmación',
  resuelto: 'Resuelto',
};

// Componente para iconos dinámicos
export function DynamicIcon({ name, className, style }: { name: string; className?: string; style?: React.CSSProperties }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const IconComponent = (LucideIcons as any)[name];
  if (!IconComponent) {
    return <Building2 className={className} style={style} />;
  }
  return <IconComponent className={className} style={style} />;
}

interface ReclamoCardProps {
  reclamo: Reclamo;
  onClick?: () => void;
  // Datos adicionales para supervisor
  similaresCount?: number;
  // Mostrar nombre del creador (solo supervisor)
  showCreador?: boolean;
  // Personalización de animaciones
  isVisible?: boolean;
  animationDelay?: number;
}

export function ReclamoCard({
  reclamo: r,
  onClick,
  similaresCount = 0,
  showCreador = false,
  isVisible = true,
  animationDelay = 0,
}: ReclamoCardProps) {
  const { theme } = useTheme();
  const estado = estadoColors[r.estado] || estadoColors.recibido;

  // Detectar actividad reciente (updated_at > created_at + 1 minuto)
  const tieneActividadReciente = r.updated_at &&
    new Date(r.updated_at).getTime() > new Date(r.created_at).getTime() + 60000;

  // Calcular si está por vencer basado en fecha_programada
  const calcularVencimiento = () => {
    if (!r.fecha_programada || r.estado === 'finalizado' || r.estado === 'rechazado' || r.estado === 'resuelto') {
      return null;
    }
    const fechaProgramada = new Date(r.fecha_programada);
    const hoy = new Date();
    const diasRestantes = Math.ceil((fechaProgramada.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));

    if (diasRestantes < 0) {
      return { texto: 'Vencido', color: '#ef4444' };
    } else if (diasRestantes === 0) {
      return { texto: 'Hoy', color: '#f59e0b' };
    } else if (diasRestantes <= 3) {
      return { texto: `${diasRestantes}d`, color: '#f59e0b' };
    }
    return null;
  };

  const vencimiento = calcularVencimiento();

  return (
    <div
      onClick={onClick}
      className={`group relative rounded-2xl cursor-pointer overflow-hidden transition-all duration-500 hover:shadow-lg active:scale-[0.98] ${
        isVisible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-8 scale-95'
      }`}
      style={{
        backgroundColor: theme.card,
        border: `1px solid ${theme.border}`,
        transitionDelay: `${animationDelay}ms`,
      }}
    >
      <div className="p-4">
        {/* Header: Icono + Contenido */}
        <div className="flex gap-3">
          {/* Icono de categoría */}
          <div
            className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: `${r.categoria?.color || theme.primary}15` }}
          >
            {r.imagenes && r.imagenes.length > 0 ? (
              <img
                src={r.imagenes[0]}
                alt=""
                className="w-full h-full object-cover rounded-xl"
              />
            ) : (
              <MapPin
                className="h-8 w-8"
                style={{ color: r.categoria?.color || theme.primary }}
              />
            )}
          </div>

          {/* Contenido */}
          <div className="flex-1 min-w-0">
            {/* Línea 1: Título completo */}
            <p className="font-semibold line-clamp-2 leading-tight" style={{ color: theme.text }}>
              {r.titulo}
            </p>

            {/* Línea 2: Categoría + Fecha */}
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span
                className="text-xs font-medium px-2 py-0.5 rounded-md"
                style={{ backgroundColor: `${r.categoria?.color || theme.primary}15`, color: r.categoria?.color || theme.primary }}
              >
                {r.categoria?.nombre || 'Sin categoría'}
              </span>
              <span className="text-xs flex items-center gap-1" style={{ color: theme.textSecondary }}>
                <Calendar className="h-3 w-3 flex-shrink-0" />
                <div className="flex flex-col leading-tight">
                  <span>{new Date(r.created_at).toLocaleDateString('es-AR')}</span>
                  <span className="text-[9px] opacity-70">
                    {new Date(r.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </span>
              {/* Nombre del creador (solo supervisor) */}
              {showCreador && r.creador && !r.es_anonimo && (
                <span className="text-xs font-medium" style={{ color: theme.text }}>
                  {r.creador.nombre} {r.creador.apellido?.charAt(0)}.
                </span>
              )}
            </div>

            {/* Línea 3: Dependencia asignada */}
            {r.dependencia_asignada?.nombre && (
              <div className="mt-1.5">
                <span
                  className="text-xs font-medium px-2 py-0.5 rounded-md inline-flex items-center gap-1"
                  style={{
                    backgroundColor: `${r.dependencia_asignada.color || theme.primary}20`,
                    color: r.dependencia_asignada.color || theme.primary
                  }}
                >
                  <DynamicIcon name={r.dependencia_asignada.icono || 'Building2'} className="h-3 w-3" />
                  {r.dependencia_asignada.nombre}
                </span>
              </div>
            )}

            {/* Línea 4: Descripción */}
            <p className="text-sm mt-2 line-clamp-2" style={{ color: theme.textSecondary }}>
              {r.descripcion}
            </p>
          </div>
        </div>

        {/* Footer con dirección, badges y estado */}
        <div
          className="flex items-center justify-between mt-3 pt-3 text-xs"
          style={{ borderTop: `1px solid ${theme.border}` }}
        >
          {/* Dirección */}
          <span className="flex items-center truncate flex-1 min-w-0" style={{ color: theme.textSecondary }}>
            <MapPin className="h-3 w-3 mr-1 flex-shrink-0" />
            <span className="truncate">{r.direccion}</span>
          </span>

          {/* Badges y estado */}
          <div className="flex items-center gap-2 flex-shrink-0 ml-2">
            {/* Última actualización */}
            {r.updated_at && r.updated_at !== r.created_at && (
              <span className="flex items-center gap-1 hidden sm:flex" style={{ color: theme.textSecondary }}>
                <Clock className="h-3 w-3 flex-shrink-0" />
                <div className="flex flex-col leading-tight text-[10px]">
                  <span>{new Date(r.updated_at).toLocaleDateString('es-AR')}</span>
                  <span className="text-[8px] opacity-70">
                    {new Date(r.updated_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </span>
            )}

            {/* Por vencer */}
            {vencimiento && (
              <span className="flex items-center gap-1 font-medium" style={{ color: vencimiento.color }}>
                <AlertTriangle className="h-3 w-3" />
                {vencimiento.texto}
              </span>
            )}

            {/* Similares badge (solo supervisor) */}
            {similaresCount > 0 && (
              <span
                className="flex items-center gap-1 px-1.5 py-0.5 rounded-full font-medium"
                style={{
                  backgroundColor: '#f59e0b20',
                  color: '#d97706',
                  border: '1px solid #f59e0b40'
                }}
              >
                +{similaresCount}
              </span>
            )}

            {/* Indicador de actividad reciente - sutil y orgánico */}
            {tieneActividadReciente && (
              <span
                className="flex items-center gap-1 text-[10px] font-medium"
                style={{ color: theme.primary }}
                title="Actividad reciente"
              >
                <MessageCircle className="h-3 w-3" />
              </span>
            )}

            {/* #ID del reclamo */}
            <span
              className="font-mono text-[10px] px-1.5 py-0.5 rounded"
              style={{ backgroundColor: theme.backgroundSecondary, color: theme.textSecondary }}
            >
              #{r.id}
            </span>

            {/* Estado con color sólido */}
            <span
              className="px-2 py-0.5 text-[10px] font-semibold rounded-md"
              style={{ backgroundColor: estado.bg, color: estado.text }}
            >
              {estadoLabels[r.estado]}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
