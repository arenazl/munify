import { CategoriaConfigBase } from '../components/config/CategoriaConfigBase';
import { categoriasReclamoApi } from '../lib/api';

/**
 * Categorías de reclamo = una instancia del ABM de catálogo del kit. La
 * pantalla no maqueta nada: elige la API, qué campos extra aplican, y el copy
 * que el canvas define para esta entidad (eyebrow, bajada y la regla del pie).
 */
export default function CategoriasReclamoConfig() {
  return (
    <CategoriaConfigBase
      eyebrow="Atención al vecino · Catálogo"
      title="Categorías de reclamo"
      descripcion="Lo que el vecino puede elegir cuando carga un reclamo."
      api={categoriasReclamoApi}
      showReclamoFields
      enableSugerencias
      showInternaField
      regla="La categoría con reclamos cargados no se puede borrar: primero hay que reasignarlos a otra."
      pista={{
        titulo: 'El vecino elige por el nombre y la descripción',
        texto:
          'Dos categorías parecidas hacen que el mismo problema entre por dos lados y se atienda dos veces. Si ves nombres que se pisan, conviene fusionarlas antes de que se llenen de reclamos.',
      }}
    />
  );
}
