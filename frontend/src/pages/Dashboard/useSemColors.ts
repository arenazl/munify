/**
 * Matices del puente de tokens (--pl-*), leídos del :root: recharts y las
 * sparklines necesitan colores concretos, así que los sacamos de los MISMOS
 * tokens que usa el CSS (patrón polimórfico: funciona en los 12 themes, cero
 * hex fijos).
 *
 * Salió del monolito `pages/Dashboard.tsx` para que lo compartan las secciones
 * que pintan series (KpisReclamos / KpisTramites).
 */
import { useMemo } from 'react';
import { useTheme } from '../../contexts/ThemeContext';

export interface SemColors {
  bueno: string;
  advertencia: string;
  malo: string;
  azul: string;
  neutro: string;
  /** Última posición de la rampa de datos: serie secundaria (resueltos). */
  data5: string;
  /** Riel de las barras / grilla de los charts. */
  track: string;
}

export function useSemColors(): SemColors {
  const { theme } = useTheme();
  return useMemo(() => {
    const cs = getComputedStyle(document.documentElement);
    const read = (token: string, fallback: string) => cs.getPropertyValue(token).trim() || fallback;
    return {
      bueno: read('--pl-green', theme.primary),
      advertencia: read('--pl-amber-strong', theme.primary),
      malo: read('--pl-red', theme.primary),
      azul: read('--pl-blue', theme.primary),
      neutro: read('--pl-border-strong', theme.textSecondary),
      data5: read('--pl-data-5', theme.textSecondary),
      track: read('--pl-track', theme.textSecondary),
    };
  }, [theme.primary, theme.textSecondary]);
}
