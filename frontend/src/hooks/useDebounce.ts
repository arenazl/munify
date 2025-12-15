import { useEffect, useState, useCallback, useRef } from 'react';

/**
 * Hook para debounce de valores
 * Útil para búsquedas que no deben ejecutarse en cada keystroke
 *
 * @param value - Valor a debounce
 * @param delay - Tiempo de espera en ms (default: 500)
 * @returns Valor debounced
 *
 * @example
 * const [search, setSearch] = useState('');
 * const debouncedSearch = useDebounce(search, 500);
 *
 * useEffect(() => {
 *   if (debouncedSearch) {
 *     fetchResults(debouncedSearch);
 *   }
 * }, [debouncedSearch]);
 */
export function useDebounce<T>(value: T, delay: number = 500): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

/**
 * Hook para debounce de funciones callback
 * Útil cuando necesitas debounce de una función en lugar de un valor
 *
 * @param callback - Función a debounce
 * @param delay - Tiempo de espera en ms (default: 500)
 * @returns Función debounced
 *
 * @example
 * const debouncedFetch = useDebouncedCallback((query: string) => {
 *   api.search(query);
 * }, 500);
 *
 * <input onChange={(e) => debouncedFetch(e.target.value)} />
 */
export function useDebouncedCallback<T extends (...args: unknown[]) => unknown>(
  callback: T,
  delay: number = 500
): T {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const debouncedCallback = useCallback(
    (...args: Parameters<T>) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        callback(...args);
      }, delay);
    },
    [callback, delay]
  ) as T;

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return debouncedCallback;
}
