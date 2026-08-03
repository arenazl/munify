import { CategoriaConfigBase } from '../components/config/CategoriaConfigBase';
import { categoriasReclamoApi } from '../lib/api';

export default function CategoriasReclamoConfig() {
  return (
    <div className="h-full flex flex-col">
      <div className="px-3 sm:px-6 pt-3">
      </div>
      <div className="flex-1 min-h-0">
        <CategoriaConfigBase
          title="Categorías de Reclamo"
          api={categoriasReclamoApi as any}
          showReclamoFields
          enableSugerencias
          showInternaField
        />
      </div>
    </div>
  );
}
