import { Plus, Trash2, GripVertical } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';

export interface DocRequeridoDraft {
  id?: number;          // opcional: solo si ya existe en BD
  nombre: string;
  descripcion?: string;
  obligatorio: boolean;
  orden: number;
}

interface Props {
  items: DocRequeridoDraft[];
  onChange: (items: DocRequeridoDraft[]) => void;
}

export function DocumentosRequeridosEditor({ items, onChange }: Props) {
  const { theme } = useTheme();

  const agregar = () => {
    onChange([
      ...items,
      { nombre: '', descripcion: '', obligatorio: true, orden: items.length },
    ]);
  };

  const actualizar = (idx: number, patch: Partial<DocRequeridoDraft>) => {
    onChange(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };

  const eliminar = (idx: number) => {
    onChange(items.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium" style={{ color: theme.text }}>
          Documentos requeridos
        </label>
        <button
          type="button"
          onClick={agregar}
          className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-colors"
          style={{ backgroundColor: `${theme.primary}20`, color: theme.primary }}
        >
          <Plus className="h-3 w-3" />
          Agregar
        </button>
      </div>

      {items.length === 0 && (
        <p className="text-xs italic" style={{ color: theme.textSecondary }}>
          Sin documentos requeridos. Agregá los que el vecino debe presentar.
        </p>
      )}

      <div className="space-y-2">
        {items.map((item, idx) => (
          <div
            key={idx}
            className="flex items-start gap-2 p-3 rounded-xl"
            style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}` }}
          >
            <GripVertical className="h-4 w-4 mt-2.5 flex-shrink-0" style={{ color: theme.textSecondary }} />
            <div className="flex-1 space-y-2 min-w-0">
              <input
                type="text"
                placeholder="Nombre del documento (ej: DNI frente y dorso)"
                value={item.nombre}
                onChange={e => actualizar(idx, { nombre: e.target.value })}
                className="w-full px-2 py-1.5 rounded-lg text-sm"
                style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}`, color: theme.text }}
              />
              <input
                type="text"
                placeholder="Descripción (opcional)"
                value={item.descripcion || ''}
                onChange={e => actualizar(idx, { descripcion: e.target.value })}
                className="w-full px-2 py-1.5 rounded-lg text-xs"
                style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}`, color: theme.text }}
              />
              <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: theme.textSecondary }}>
                <input
                  type="checkbox"
                  checked={item.obligatorio}
                  onChange={e => actualizar(idx, { obligatorio: e.target.checked })}
                  className="rounded"
                />
                Obligatorio
              </label>
            </div>
            <button
              type="button"
              onClick={() => eliminar(idx)}
              className="p-1.5 rounded-lg hover:bg-red-500/10 transition-colors flex-shrink-0"
              style={{ color: '#ef4444' }}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
