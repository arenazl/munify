// Boton reutilizable que abre el recorrido guiado del producto
// (PresentacionLive). Encapsula el estado + el modal, asi cada pagina
// solo agrega <PresentacionLaunchButton /> donde lo quiera.
import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import PresentacionLive from './PresentacionLive';

interface Props {
  label?: string;
  className?: string;
  style?: React.CSSProperties;
}

export default function PresentacionLaunchButton({ label = 'Conocé Munify', className = '', style }: Props) {
  const { theme } = useTheme();
  const [open, setOpen] = useState(false);
  const accent = theme.primary || '#f5a623';
  const accent2 = theme.primaryHover || '#e08a12';

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`pres-launch ${className}`}
        title="Recorrido guiado del producto"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '10px 18px', borderRadius: 999, fontWeight: 800, fontSize: 14,
          color: '#fff', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
          background: `linear-gradient(135deg, ${accent}, ${accent2})`,
          boxShadow: `0 8px 22px ${accent}55`,
          ...style,
        }}
      >
        <Sparkles size={16} />
        {label}
      </button>
      <PresentacionLive open={open} onClose={() => setOpen(false)} />

      <style>{`
        .pres-launch { position: relative; overflow: hidden; transition: transform .15s ease, box-shadow .15s ease; }
        .pres-launch:hover { transform: translateY(-1px) scale(1.02); }
        .pres-launch:active { transform: scale(0.98); }
        .pres-launch::after {
          content: ''; position: absolute; inset: 0;
          background: linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.35) 50%, transparent 70%);
          transform: translateX(-120%); animation: presLaunchShine 3.2s ease-in-out infinite;
        }
        @keyframes presLaunchShine { 0%,60% { transform: translateX(-120%); } 100% { transform: translateX(120%); } }
      `}</style>
    </>
  );
}
