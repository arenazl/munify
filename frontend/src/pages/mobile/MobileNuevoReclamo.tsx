import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import NuevoReclamo from '../NuevoReclamo';

export default function MobileNuevoReclamo() {
  const { theme } = useTheme();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen" style={{ backgroundColor: theme.background }}>
      <div
        className="sticky top-0 z-50 px-4 py-3 flex items-center gap-3"
        style={{
          backgroundColor: theme.card,
          borderBottom: `1px solid ${theme.border}`,
        }}
      >
        <button
          onClick={() => navigate('/app')}
          className="p-2 -ml-2 rounded-lg transition-colors"
          style={{ color: theme.text }}
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="font-semibold" style={{ color: theme.text }}>
          Nuevo Reclamo
        </h1>
      </div>

      <div className="pb-4">
        <NuevoReclamo />
      </div>
    </div>
  );
}
