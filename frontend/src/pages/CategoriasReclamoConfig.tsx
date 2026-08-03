import { CategoriaConfigBase } from '../components/config/CategoriaConfigBase';
import { categoriasReclamoApi } from '../lib/api';

/**
 * Categorías de reclamo = una instancia del ABM de catálogo del kit. La
 * pantalla no maqueta nada: elige la API y qué campos extra aplican.
 */
export default function CategoriasReclamoConfig() {
  return (
    <CategoriaConfigBase
      title="Categorías de reclamo"
      api={categoriasReclamoApi}
      showReclamoFields
      enableSugerencias
      showInternaField
    />
  );
}
