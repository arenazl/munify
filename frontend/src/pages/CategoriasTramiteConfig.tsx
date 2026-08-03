import { useNavigate } from 'react-router-dom';
import { ArrowRight, Sparkles } from 'lucide-react';
import { CategoriaConfigBase } from '../components/config/CategoriaConfigBase';
import { categoriasTramiteApi } from '../lib/api';

/**
 * Categorías de trámite = la misma instancia del ABM de catálogo, sin los
 * campos de reclamo.
 *
 * Arriba va una nota del kit (`av2-nota`, la misma pieza que usa el panel de
 * Configuración) porque el nombre confunde: acá se crean las "carpetas", no
 * los trámites con sus requisitos. Antes era un banner con estilos inline y
 * colores derivados a mano del theme.
 */
export default function CategoriasTramiteConfig() {
  const navigate = useNavigate();

  return (
    <>
      <div className="av2-nota av2-nota--ok av2-nota--con-accion">
        <Sparkles className="av2-nota-ico" aria-hidden />
        <span className="av2-nota-txt">
          <span className="av2-nota-eyebrow">¿Venías a dar de alta un trámite?</span>
          Acá se crean las <strong>carpetas generales</strong>. Los trámites y sus documentos
          requeridos se administran en el catálogo.
        </span>
        <button
          type="button"
          className="av2-btn-secundario"
          onClick={() => navigate('/gestion/tramites-config')}
        >
          Ir al catálogo de trámites
          <ArrowRight size={15} strokeWidth={2} />
        </button>
      </div>

      <CategoriaConfigBase
        title="Categorías de trámite"
        api={categoriasTramiteApi}
        entidad="categoría"
      />
    </>
  );
}
