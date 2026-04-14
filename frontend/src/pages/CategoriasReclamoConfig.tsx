import { CategoriaConfigBase } from '../components/config/CategoriaConfigBase';
import { categoriasReclamoApi } from '../lib/api';

export default function CategoriasReclamoConfig() {
  return (
    <CategoriaConfigBase
      title="Categorías de Reclamo"
      api={categoriasReclamoApi as any}
      showReclamoFields
      enableSugerencias
    />
  );
}
