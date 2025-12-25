import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTheme } from '../../contexts/ThemeContext';
import NuevoReclamo from '../NuevoReclamo';

export default function MobileNuevoReclamo() {
  const { theme } = useTheme();
  const [searchParams] = useSearchParams();

  // Si viene con categoria preseleccionada, guardarla en sessionStorage
  useEffect(() => {
    const categoriaId = searchParams.get('categoria');
    if (categoriaId) {
      sessionStorage.setItem('preselected_categoria', categoriaId);
    }
  }, [searchParams]);

  return (
    <div className="min-h-screen" style={{ backgroundColor: theme.background }}>
      <NuevoReclamo />
    </div>
  );
}
