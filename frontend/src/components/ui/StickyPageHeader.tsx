import { ReactNode } from 'react';
import { useTheme } from '../../contexts/ThemeContext';

interface StickyPageHeaderProps {
  /** Contenido del header (título, buscador, botones) */
  children: ReactNode;
  /** Panel de filtros debajo del header (opcional) */
  filterPanel?: ReactNode;
}

/**
 * Componente wrapper para crear headers sticky consistentes en todas las páginas.
 * Consta de 2 partes:
 * 1. Header principal (siempre visible): título, buscador, botones de acción
 * 2. Panel de filtros (opcional): chips de filtros, estados, categorías, etc.
 *
 * Uso básico (solo header):
 * <StickyPageHeader>
 *   <PageTitleIcon icon={<FileText />} />
 *   <PageTitle>Mi Página</PageTitle>
 *   <HeaderSeparator />
 *   <input placeholder="Buscar..." />
 *   <button>Acción</button>
 * </StickyPageHeader>
 *
 * Con panel de filtros:
 * <StickyPageHeader filterPanel={<MisFiltros />}>
 *   <PageTitleIcon icon={<FileText />} />
 *   <PageTitle>Mi Página</PageTitle>
 * </StickyPageHeader>
 */
export function StickyPageHeader({ children, filterPanel }: StickyPageHeaderProps) {
  const { theme } = useTheme();

  // Calcular altura del header para el spacer
  const headerHeight = filterPanel ? 130 : 70;

  // Usar position fixed - sticky no funciona por overflow en contenedores padre
  return (
    <>
      {/* Spacer para ocupar el espacio del header fijo */}
      <div style={{ height: `${headerHeight}px` }} />

      {/* Header fijo */}
      <div
        className="fixed z-30"
        style={{
          top: '64px',
          left: 'var(--sidebar-width, 0px)',
          width: 'calc(100vw - var(--sidebar-width, 0px))',
          backgroundColor: theme.background,
          padding: '4px 12px 8px 12px',
          boxSizing: 'border-box',
        }}
      >
        {/* Parte 1: Header principal */}
        <div
          className={`flex items-center gap-4 px-4 py-3 ${filterPanel ? 'rounded-t-xl' : 'rounded-xl'}`}
          style={{
            backgroundColor: theme.card,
            border: `1px solid ${theme.border}`,
            borderBottom: filterPanel ? 'none' : undefined,
          }}
        >
          {children}
        </div>

        {/* Parte 2: Panel de filtros (opcional) */}
        {filterPanel && (
          <div
            className="rounded-b-xl p-3"
            style={{
              backgroundColor: theme.card,
              border: `1px solid ${theme.border}`,
              borderTop: 'none',
            }}
          >
            {filterPanel}
          </div>
        )}
      </div>
    </>
  );
}

/**
 * Componente para el icono decorativo del título
 */
interface PageTitleIconProps {
  icon: ReactNode;
}

export function PageTitleIcon({ icon }: PageTitleIconProps) {
  const { theme } = useTheme();

  return (
    <div
      className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
      style={{ backgroundColor: `${theme.primary}20` }}
    >
      <span style={{ color: theme.primary }}>{icon}</span>
    </div>
  );
}

/**
 * Componente para el título de la página
 */
interface PageTitleProps {
  children: ReactNode;
  className?: string;
}

export function PageTitle({ children, className = '' }: PageTitleProps) {
  const { theme } = useTheme();

  return (
    <h1
      className={`text-lg font-bold tracking-tight hidden sm:block ${className}`}
      style={{ color: theme.text }}
    >
      {children}
    </h1>
  );
}

/**
 * Separador vertical para usar entre elementos del header
 */
export function HeaderSeparator() {
  const { theme } = useTheme();

  return (
    <div
      className="h-8 w-px hidden sm:block flex-shrink-0"
      style={{ backgroundColor: theme.border }}
    />
  );
}

export default StickyPageHeader;
