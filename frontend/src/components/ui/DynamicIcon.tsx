import { lazy, Suspense } from 'react';
import { LucideProps } from 'lucide-react';
import dynamicIconImports from 'lucide-react/dynamicIconImports';

interface DynamicIconProps extends Omit<LucideProps, 'ref'> {
  name: string;
  fallback?: React.ReactNode;
}

/**
 * Componente que renderiza iconos de Lucide dinámicamente basado en el nombre.
 * El nombre debe ser en formato kebab-case (ej: "hard-hat", "file-check")
 * o PascalCase (ej: "HardHat", "FileCheck") - se convierte automáticamente.
 */
export function DynamicIcon({ name, fallback, ...props }: DynamicIconProps) {
  // Convertir PascalCase a kebab-case si es necesario
  const kebabName = name
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();

  // Verificar si el icono existe
  if (!(kebabName in dynamicIconImports)) {
    return fallback ? <>{fallback}</> : null;
  }

  const LucideIcon = lazy(dynamicIconImports[kebabName as keyof typeof dynamicIconImports]);

  return (
    <Suspense fallback={<div className={props.className} />}>
      <LucideIcon {...props} />
    </Suspense>
  );
}

export default DynamicIcon;
