/**
 * abmv2/IconColorPicker — icono + color de una entidad (§ IconColorPickerProps).
 *
 * Origen: drawer de edición de "Configuracion.dc.html" (canvas Claude Design,
 * 2026-08-03).
 *
 * Los dos controles van JUNTOS a propósito: lo que el usuario elige no es "un
 * icono" ni "un color", es cómo se va a ver la fila en la app del vecino, y
 * eso sólo se juzga con la combinación puesta. Por eso arriba de los dos
 * grids hay una vista previa con el tile ya teñido.
 *
 * Los iconos son NOMBRES lucide que resuelve `DynamicIcon` — el catálogo lo
 * define la app (o la tabla de la base), no el componente. Los colores son
 * valores runtime que se guardan en el registro.
 *
 * `collapsible` existe porque en un formulario largo cuarenta iconos
 * desplegados tapan el resto de los campos: arranca cerrado y se abre con un
 * botón, que es como lo dibuja el canvas.
 */
import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Check } from 'lucide-react';
import { DynamicIcon } from '../ui/DynamicIcon';
import type { IconColorPickerProps } from './types';

export function IconColorPicker({
  icons,
  icon,
  onIconChange,
  colors,
  color,
  onColorChange,
  preview,
  note,
  collapsible = false,
}: IconColorPickerProps) {
  const [abierto, setAbierto] = useState(!collapsible);

  // Colores de la entidad = valores runtime que vienen de datos/config.
  const estiloTile: CSSProperties | undefined = color
    ? { color, background: `color-mix(in srgb, ${color} 14%, transparent)` }
    : undefined;

  return (
    <div className="av2-picker">
      {preview && (
        <div className="av2-picker-preview">
          <span className="av2-tile av2-tile--lg" style={estiloTile}>
            {icon && <DynamicIcon name={icon} size={18} strokeWidth={1.9} />}
          </span>
          <span className="av2-picker-preview-txt">
            <span className="av2-picker-preview-titulo">{preview.title}</span>
            {preview.subtitle && <span className="av2-picker-preview-sub">{preview.subtitle}</span>}
          </span>
          {collapsible && (
            <button type="button" className="av2-picker-toggle" onClick={() => setAbierto((v) => !v)}>
              {abierto ? 'Listo' : 'Cambiar'}
            </button>
          )}
        </div>
      )}

      {abierto && (
        <div className="av2-picker-cuerpo">
          <span className="av2-eyebrow">Icono</span>
          <div className="av2-picker-iconos">
            {icons.map((nombre) => (
              <button
                key={nombre}
                type="button"
                title={nombre}
                aria-label={nombre}
                aria-pressed={nombre === icon}
                className={`av2-picker-icono${nombre === icon ? ' av2-picker-icono--activo' : ''}`}
                onClick={() => onIconChange(nombre)}
              >
                <DynamicIcon name={nombre} size={17} strokeWidth={1.9} />
              </button>
            ))}
          </div>

          <span className="av2-eyebrow av2-picker-eyebrow-color">Color</span>
          <div className="av2-picker-colores">
            {colors.map((c) => (
              <button
                key={c.value}
                type="button"
                title={c.name}
                aria-label={c.name}
                aria-pressed={c.value === color}
                className={`av2-picker-color${c.value === color ? ' av2-picker-color--activo' : ''}`}
                // El color ofrecido ES el dato: va inline por definición.
                style={{ background: c.value }}
                onClick={() => onColorChange(c.value)}
              >
                {c.value === color && <Check size={14} strokeWidth={3.2} />}
              </button>
            ))}
          </div>

          {note && <p className="av2-picker-nota">{note}</p>}
        </div>
      )}
    </div>
  );
}

export default IconColorPicker;
