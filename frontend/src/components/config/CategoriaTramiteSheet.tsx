/**
 * CategoriaTramiteSheet — alta y edición de una categoría de trámite, para
 * abrirse DESDE el árbol de Trámites de Configuración.
 *
 * Es el drawer del canvas en su forma mínima: nombre, descripción y el picker
 * de icono+color. Los trámites de la categoría se gestionan en el árbol, no
 * acá. Comparte paleta con `CategoriaConfigBase` (misma entidad, mismos
 * colores posibles); cuando el drawer de esa base se extraiga a una pieza
 * propia, este sheet debería consumirla.
 */
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Sheet } from '../ui/Sheet';
import { IconColorPicker } from '../abmv2/IconColorPicker';
import { useTheme } from '../../contexts/ThemeContext';
import { categoriasTramiteApi } from '../../lib/api';
import { ICONOS_DISPONIBLES, COLORES_DISPONIBLES } from './CategoriaConfigBase';

export interface CategoriaTramiteSheetProps {
  open: boolean;
  /** null = alta; con objeto = edición (shape RAW de /api/categorias-tramite). */
  categoria: { id: number; nombre: string; descripcion?: string | null; icono?: string | null; color?: string | null } | null;
  onClose: () => void;
  onGuardado: () => void;
}

const FORM_VACIO = { nombre: '', descripcion: '', icono: 'Folder', color: '#3b82f6' };

export function CategoriaTramiteSheet({ open, categoria, onClose, onGuardado }: CategoriaTramiteSheetProps) {
  const { theme } = useTheme();
  const [form, setForm] = useState(FORM_VACIO);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(
      categoria
        ? {
            nombre: categoria.nombre ?? '',
            descripcion: categoria.descripcion ?? '',
            icono: categoria.icono || 'Folder',
            color: categoria.color || '#3b82f6',
          }
        : FORM_VACIO,
    );
  }, [open, categoria]);

  const guardar = async () => {
    if (!form.nombre.trim()) {
      toast.error('La categoría necesita un nombre');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        nombre: form.nombre.trim(),
        descripcion: form.descripcion.trim() || null,
        icono: form.icono,
        color: form.color,
      };
      if (categoria) {
        await categoriasTramiteApi.update(categoria.id, payload);
        toast.success('Categoría actualizada');
      } else {
        await categoriasTramiteApi.create(payload);
        toast.success('Categoría creada');
      }
      onClose();
      onGuardado();
    } catch {
      toast.error('No se pudo guardar la categoría');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={categoria ? 'Editar categoría de trámite' : 'Nueva categoría de trámite'}
      description={
        categoria
          ? 'Modificá los datos y guardá'
          : 'La carpeta general; los trámites y sus documentos se cargan en el árbol'
      }
      stickyFooter={
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-medium"
            style={{ backgroundColor: theme.backgroundSecondary, color: theme.text }}
          >
            Cancelar
          </button>
          <button
            onClick={guardar}
            disabled={saving}
            className="px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2 disabled:opacity-50"
            style={{ backgroundColor: theme.primary, color: '#fff' }}
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Guardar
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1" style={{ color: theme.text }}>
            Nombre <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={form.nombre}
            onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
            placeholder='Ej: "Obras Particulares", "Catastro"…'
            className="w-full px-3 py-2 rounded-xl text-sm"
            style={{
              backgroundColor: theme.backgroundSecondary,
              border: `1px solid ${theme.border}`,
              color: theme.text,
            }}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1" style={{ color: theme.text }}>
            Descripción
          </label>
          <textarea
            value={form.descripcion}
            onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
            rows={3}
            placeholder="Es el texto que el vecino lee al elegir la categoría"
            className="w-full px-3 py-2 rounded-xl text-sm resize-none"
            style={{
              backgroundColor: theme.backgroundSecondary,
              border: `1px solid ${theme.border}`,
              color: theme.text,
            }}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2" style={{ color: theme.text }}>
            Cómo se ve en la app
          </label>
          <IconColorPicker
            icons={ICONOS_DISPONIBLES}
            icon={form.icono}
            onIconChange={(n) => setForm((f) => ({ ...f, icono: n }))}
            colors={COLORES_DISPONIBLES}
            color={form.color}
            onColorChange={(c) => setForm((f) => ({ ...f, color: c }))}
            preview={{ title: form.nombre || 'Sin nombre', subtitle: 'Icono y color' }}
            collapsible
          />
        </div>
      </div>
    </Sheet>
  );
}

export default CategoriaTramiteSheet;
