import { CategoriaConfigBase } from '../components/config/CategoriaConfigBase';
import { categoriasTramiteApi } from '../lib/api';
import { useTheme } from '../contexts/ThemeContext';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Info } from 'lucide-react';

export default function CategoriasTramiteConfig() {
  const { theme } = useTheme();
  const navigate = useNavigate();

  return (
    <div className="h-full flex flex-col">
      {/* Banner de ayuda para UX */}
      <div 
        className="shrink-0 p-4" 
        style={{ 
          backgroundColor: `${theme.primary}10`, 
          borderBottom: `1px solid ${theme.primary}30` 
        }}
      >
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="mt-1 p-1.5 rounded-full" style={{ backgroundColor: `${theme.primary}20` }}>
              <Info className="h-5 w-5" style={{ color: theme.primary }} />
            </div>
            <div>
              <p className="font-semibold" style={{ color: theme.text }}>
                ¿Buscás dar de alta un Trámite y sus Documentos Requeridos?
              </p>
              <p className="text-sm" style={{ color: theme.textSecondary }}>
                Acá solo creás las "carpetas" generales (Categorías). Los trámites específicos y sus requisitos se administran en el Catálogo.
              </p>
            </div>
          </div>
          <button
            onClick={() => navigate('/gestion/tramites-config')}
            className="flex items-center shrink-0 gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all hover:scale-105 shadow-sm"
            style={{ 
              background: `linear-gradient(135deg, ${theme.primary} 0%, ${theme.primary}dd 100%)`, 
              color: 'white' 
            }}
          >
            Ir al Catálogo de Trámites
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 relative">
        <CategoriaConfigBase
          title="Categorías de Trámite"
          api={categoriasTramiteApi as any}
        />
      </div>
    </div>
  );
}
