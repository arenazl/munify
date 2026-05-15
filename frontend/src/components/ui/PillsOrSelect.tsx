import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import { ModernSelect, SelectOption } from './ModernSelect';

// PillsOrSelect — render adaptativo: muestra las opciones como pildoras
// horizontales cuando entran en el ancho disponible, y colapsa a un
// ModernSelect cuando el contenedor las cortaria (overflow detectado via
// ResizeObserver). Pensado para filtros de pocos estados (3-6 items).
//
// Cada opcion puede tener `color` para tintar la pildora cuando esta
// inactiva (bg = color15) y cuando esta activa (bg = color solido). Si no
// se pasa color, se usa theme.primary.
//
// Uso:
//   <PillsOrSelect
//     value={estadoFiltro}
//     onChange={setEstadoFiltro}
//     options={[
//       { value: '', label: 'Todos' },
//       { value: 'al_dia', label: 'Al dia', color: '#22c55e' },
//       ...
//     ]}
//   />

export interface PillsOrSelectOption extends SelectOption {
  color?: string;
}

interface PillsOrSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: PillsOrSelectOption[];
  /** Placeholder para el modo combo. */
  placeholder?: string;
  /** Tamano de las pildoras. 'sm' = h-7 text-[11px], 'md' = h-9 text-sm. */
  size?: 'sm' | 'md';
  /** Class del wrapper. */
  className?: string;
}

export function PillsOrSelect({
  value,
  onChange,
  options,
  placeholder = 'Filtrar',
  size = 'sm',
  className = '',
}: PillsOrSelectProps) {
  const { theme } = useTheme();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(false);

  // Mide si las pildoras (renderizadas off-screen en measureRef) entran en
  // el ancho disponible del wrapper. Si scrollWidth > clientWidth -> collapse.
  // Usamos un nodo "fantasma" para medir sin causar saltos visuales.
  useLayoutEffect(() => {
    const wrapper = wrapperRef.current;
    const measure = measureRef.current;
    if (!wrapper || !measure) return;

    const check = () => {
      const available = wrapper.clientWidth;
      const needed = measure.scrollWidth;
      // Margen de 4px para evitar flicker en bordes
      setCollapsed(needed > available - 4);
    };

    check();
    const ro = new ResizeObserver(check);
    ro.observe(wrapper);
    return () => ro.disconnect();
  }, [options]);

  // Re-check cuando cambian fuentes / theme (afecta ancho del texto)
  useEffect(() => {
    const id = window.requestAnimationFrame(() => {
      const wrapper = wrapperRef.current;
      const measure = measureRef.current;
      if (!wrapper || !measure) return;
      setCollapsed(measure.scrollWidth > wrapper.clientWidth - 4);
    });
    return () => window.cancelAnimationFrame(id);
  }, [theme]);

  const pillSize = size === 'md'
    ? 'px-3 py-1.5 text-sm h-9'
    : 'px-2.5 py-1 text-[11px] h-7';

  const renderPills = (visible: boolean) => (
    <div
      ref={visible ? undefined : measureRef}
      className="inline-flex items-center gap-1.5"
      style={visible ? undefined : {
        position: 'absolute',
        visibility: 'hidden',
        pointerEvents: 'none',
        whiteSpace: 'nowrap',
        left: 0,
        top: 0,
      }}
      aria-hidden={visible ? undefined : true}
    >
      {options.map(o => {
        const isActive = value === o.value;
        const color = o.color || theme.primary;
        return (
          <button
            key={o.value || '__all__'}
            type="button"
            onClick={() => visible && onChange(o.value)}
            className={`${pillSize} rounded-md font-semibold transition-all whitespace-nowrap`}
            style={{
              backgroundColor: isActive ? color : `${color}15`,
              color: isActive ? '#fff' : color,
              border: `1px solid ${color}40`,
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );

  return (
    <div ref={wrapperRef} className={`relative min-w-0 ${className}`}>
      {/* Ghost node: siempre presente para medir scrollWidth real */}
      {renderPills(false)}

      {collapsed ? (
        <div className="min-w-[160px]">
          <ModernSelect
            value={value}
            onChange={onChange}
            options={options}
            placeholder={placeholder}
          />
        </div>
      ) : (
        renderPills(true)
      )}
    </div>
  );
}

export default PillsOrSelect;
