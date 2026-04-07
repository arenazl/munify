import { CategoriaConfigBase } from '../components/config/CategoriaConfigBase';
import { categoriasTramiteApi } from '../lib/api';

export default function CategoriasTramiteConfig() {
  return (
    <CategoriaConfigBase
      title="Categorías de Trámite"
      api={categoriasTramiteApi as any}
    />
  );
}
