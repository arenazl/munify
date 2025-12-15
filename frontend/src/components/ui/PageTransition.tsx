import { ReactNode, useEffect, useState, useRef } from 'react';
import { useLocation } from 'react-router-dom';

interface PageTransitionProps {
  children: ReactNode;
}

export function PageTransition({ children }: PageTransitionProps) {
  const location = useLocation();
  const [phase, setPhase] = useState<'enter' | 'exit' | 'idle'>('idle');
  const [displayChildren, setDisplayChildren] = useState(children);
  const prevPathRef = useRef(location.pathname);

  useEffect(() => {
    if (prevPathRef.current !== location.pathname) {
      // Comenzar animación de salida
      setPhase('exit');

      // Después de la salida, actualizar contenido y animar entrada
      const exitTimer = setTimeout(() => {
        setDisplayChildren(children);
        setPhase('enter');
        prevPathRef.current = location.pathname;

        // Volver a idle después de la entrada
        const enterTimer = setTimeout(() => {
          setPhase('idle');
        }, 400);

        return () => clearTimeout(enterTimer);
      }, 200);

      return () => clearTimeout(exitTimer);
    } else {
      setDisplayChildren(children);
    }
  }, [location.pathname, children]);

  // Initial mount animation
  useEffect(() => {
    setPhase('enter');
    const timer = setTimeout(() => setPhase('idle'), 400);
    return () => clearTimeout(timer);
  }, []);

  const getTransformStyle = () => {
    switch (phase) {
      case 'exit':
        return {
          opacity: 0,
          transform: 'translateX(-30px) scale(0.98)',
          filter: 'blur(4px)',
        };
      case 'enter':
        return {
          opacity: 1,
          transform: 'translateX(0) scale(1)',
          filter: 'blur(0px)',
        };
      case 'idle':
      default:
        return {
          opacity: 1,
          transform: 'translateX(0) scale(1)',
          filter: 'blur(0px)',
        };
    }
  };

  return (
    <div
      style={{
        ...getTransformStyle(),
        transition: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)'
        
      }}
    >
      {displayChildren}
    </div>
  );
}
