import { useEffect, useState } from 'react';
import { Plus, Sparkles, Loader2, Star } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { tramitesSugeridosApi } from '../../lib/api';

interface DocumentoFrecuente {
  nombre: string;
  frecuencia: number;
  score: number;
  from_match: boolean;
}

interface Props {
  /** Nombre de la categoría de trámite del municipio (ej "Tránsito y Transporte") */
  rubro?: string;
  /** Nombre del trámite que está escribiendo el admin (boost de match) */
  nombreTramite?: string;
  /** Lista de nombres ya agregados al form — para marcar los chips como "usados" */
  nombresYaAgregados: string[];
  /** Callback cuando el admin toca un chip — se pasa el nombre del doc */
  onAgregar: (nombreDoc: string) => void;
}

/**
 * Chips de documentos sugeridos que se muestran arriba del editor de
 * documentos requeridos en el Step 3 del wizard.
 *
 * Consulta `GET /api/tramites-sugeridos/documentos-frecuentes` con el
 * rubro (categoría del municipio) y opcionalmente el nombre del trámite
 * que el admin está creando. El backend ranquea los docs por score:
 *
 *   - Los que vienen de un match por nombre reciben boost (+50)
 *   - Los que aparecen en muchos trámites del rubro reciben boost por frecuencia
 *   - Los que cumplen ambas condiciones van primero
 *
 * NO autocarga nada. El admin decide cuál agregar tocando el chip. Los
 * chips ya agregados se marcan con estado deshabilitado.
 */
export function ChipsDocumentosSugeridos({
  rubro,
  nombreTramite,
  nombresYaAgregados,
  onAgregar,
}: Props) {
  const { theme } = useTheme();
  const [items, setItems] = useState<DocumentoFrecuente[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const cargar = async () => {
      if (!rubro && !nombreTramite) {
        setItems([]);
        return;
      }
      setLoading(true);
      try {
        const res = await tramitesSugeridosApi.documentosFrecuentes(rubro, nombreTramite, 12);
        if (!cancelled) {
          setItems(res.data.items || []);
        }
      } catch (err) {
        console.error('Error cargando documentos frecuentes:', err);
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    cargar();
    return () => { cancelled = true; };
  }, [rubro, nombreTramite]);

  // Filtrar chips que ya están agregados al form (case-insensitive)
  const yaAgregadosSet = new Set(nombresYaAgregados.map(n => n.toLowerCase().trim()));
  const chipsDisponibles = items.filter(it => !yaAgregadosSet.has(it.nombre.toLowerCase().trim()));

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs" style={{ color: theme.textSecondary }}>
        <Loader2 className="h-3 w-3 animate-spin" />
        Buscando sugerencias del catálogo...
      </div>
    );
  }

  if (chipsDisponibles.length === 0) {
    return null;
  }

  return (
    <div
      className="p-3 rounded-xl"
      style={{
        backgroundColor: `${theme.primary}08`,
        border: `1px dashed ${theme.primary}40`,
      }}
    >
      <div className="flex items-center gap-1.5 mb-2">
        <Sparkles className="h-3.5 w-3.5" style={{ color: theme.primary }} />
        <span className="text-xs font-semibold" style={{ color: theme.text }}>
          Documentos sugeridos
        </span>
        <span className="text-[10px]" style={{ color: theme.textSecondary }}>
          · tocá para agregar (orden por relevancia)
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {chipsDisponibles.map((chip) => {
          const esTopMatch = chip.from_match;
          return (
            <button
              key={chip.nombre}
              type="button"
              onClick={() => onAgregar(chip.nombre)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium transition-all duration-150 hover:scale-105 active:scale-95"
              style={{
                backgroundColor: esTopMatch ? `${theme.primary}20` : theme.backgroundSecondary,
                border: `1px solid ${esTopMatch ? theme.primary : theme.border}`,
                color: theme.text,
              }}
              title={
                esTopMatch
                  ? `Recomendado por el trámite que estás creando · ${chip.frecuencia} en el catálogo`
                  : `Aparece en ${chip.frecuencia} trámites del rubro`
              }
            >
              {esTopMatch && <Star className="h-3 w-3 fill-current" style={{ color: theme.primary }} />}
              <Plus className="h-3 w-3" style={{ color: esTopMatch ? theme.primary : theme.textSecondary }} />
              <span>{chip.nombre}</span>
              <span className="text-[9px] opacity-60">×{chip.frecuencia}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
