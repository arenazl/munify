import { useCallback, useEffect, useRef, useState } from 'react';
import { MapPin, Loader2, Crosshair } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { api } from '../../lib/api';

/**
 * Componente de input con autocomplete de direcciones usando OpenStreetMap
 * (Nominatim). Reutilizable por NuevoReclamo, CrearSolicitudWizard y cualquier
 * otro formulario que necesite cargar una dirección.
 *
 * Features:
 * - Autocomplete con debounce (400ms) y 4 niveles de fallback para maximizar
 *   resultados dentro del municipio.
 * - Ordenamiento de sugerencias por distancia al centro del municipio.
 * - Botón de "usar mi ubicación actual" con reverse geocoding.
 * - Preserva el número de calle que escribió el usuario si Nominatim no lo
 *   trae en la respuesta.
 *
 * Props mínimas para que el caller decida qué hacer con el resultado:
 *  - `value`: texto del input (estado controlado).
 *  - `onChange(direccion, lat?, lon?)`: se llama tanto cuando el usuario tipea
 *    como cuando selecciona una sugerencia o usa la geolocalización. Las
 *    coordenadas vienen sólo cuando se seleccionó una sugerencia real.
 *  - `error`: mensaje de error a mostrar debajo (opcional).
 *  - `placeholder`, `disabled`, `maxLength`, `showCurrentLocationButton`: UI.
 */
interface DireccionSuggestion {
  display_name: string;
  lat: string;
  lon: string;
  address?: {
    house_number?: string;
    road?: string;
    neighbourhood?: string;
    suburb?: string;
    city?: string;
    town?: string;
    village?: string;
    state?: string;
  };
  _distancia?: number;
}

interface DireccionAutocompleteProps {
  value: string;
  onChange: (direccion: string, latitud?: number | null, longitud?: number | null) => void;
  onBlur?: () => void;
  placeholder?: string;
  disabled?: boolean;
  maxLength?: number;
  showCurrentLocationButton?: boolean;
  error?: string;
  label?: string;
  required?: boolean;
  /** className extra para el input (ej: "py-2" en lugar del "py-3" default) */
  inputClassName?: string;
}

function calcularDistancia(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function DireccionAutocomplete({
  value,
  onChange,
  onBlur,
  placeholder = 'Escribí para buscar direcciones...',
  disabled = false,
  maxLength = 120,
  showCurrentLocationButton = true,
  error,
  label,
  required = false,
  inputClassName = 'py-3',
}: DireccionAutocompleteProps) {
  const { theme } = useTheme();
  const { municipioActual } = useAuth();

  const [suggestions, setSuggestions] = useState<DireccionSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searching, setSearching] = useState(false);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [userInputNumber, setUserInputNumber] = useState<string>('');
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Abort controller para cancelar requests en vuelo cuando el usuario escribe
  // otra cosa. Si una nueva búsqueda sale antes de que termine la anterior, la
  // anterior se cancela para no mantener conexiones abiertas ni procesar un
  // response que ya no es relevante.
  const abortRef = useRef<AbortController | null>(null);

  // Cache client-side de queries ya resueltas. Evita que volver a escribir una
  // dirección ya consultada (backspace y re-tipear, por ejemplo) dispare otra
  // request. Clave: query en lowercase normalizado. Valor: array de sugerencias.
  const clientCacheRef = useRef<Map<string, DireccionSuggestion[]>>(new Map());

  // Guardamos la última query consultada. Cuando llegue un response viejo
  // (race condition), verificamos que sigue siendo la query actual antes de
  // pintar los resultados.
  const queryActualRef = useRef<string>('');

  // Cleanup del timeout y de requests en vuelo al desmontar
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, []);

  // ============ Búsqueda Nominatim (vía proxy backend) ============
  //
  // Flujo completo con todas las defensas para NO saturar Nominatim:
  //   1. Debounce de 3 segundos en handleInputChange (el usuario tiene que
  //      pausar 3s de escribir antes de disparar)
  //   2. Cache client-side en memoria (si ya busqué esa query en esta sesión,
  //      respondo instantáneo sin pegarle al backend)
  //   3. AbortController: si llega una nueva búsqueda antes de que termine la
  //      anterior, cancelo la anterior
  //   4. Obsolete check: cuando llega el response, verifico que el input no
  //      haya cambiado. Si cambió, descarto el resultado (evita race conditions
  //      que pintarían resultados viejos)
  //   5. Cache server-side en el backend (10 min TTL) para que múltiples users
  //      o pestañas compartan el mismo cache
  //   6. El backend pega a Nominatim server-to-server (evita CORS)

  const searchAddress = useCallback(
    async (query: string) => {
      const trimmed = query.trim();
      if (trimmed.length < 3) {
        setSuggestions([]);
        setShowSuggestions(false);
        return;
      }

      // Marcar esta query como la "actual" para obsolete check posterior
      queryActualRef.current = trimmed;

      // ==== CACHE HIT ====
      const cacheKey = trimmed.toLowerCase();
      const cached = clientCacheRef.current.get(cacheKey);
      if (cached) {
        setSuggestions(cached);
        setShowSuggestions(cached.length > 0);
        return;
      }

      // ==== CANCELAR REQUEST ANTERIOR ====
      if (abortRef.current) {
        abortRef.current.abort();
      }
      const controller = new AbortController();
      abortRef.current = controller;

      setSearching(true);
      try {
        // Resolver coordenadas del municipio desde localStorage o contexto
        let municipioLat = localStorage.getItem('municipio_lat');
        let municipioLon = localStorage.getItem('municipio_lon');

        if ((!municipioLat || !municipioLon) && municipioActual?.latitud && municipioActual?.longitud) {
          municipioLat = String(municipioActual.latitud);
          municipioLon = String(municipioActual.longitud);
          localStorage.setItem('municipio_lat', municipioLat);
          localStorage.setItem('municipio_lon', municipioLon);
        }

        const municipioNombre = localStorage.getItem('municipio_nombre') || '';
        const municipioSimple = municipioNombre.replace('Municipalidad de ', '').replace('Municipio de ', '');

        // Viewbox ±0.3° ≈ 30km para sesgar la búsqueda al área del municipio
        const centroLat = municipioLat ? parseFloat(municipioLat) : null;
        const centroLon = municipioLon ? parseFloat(municipioLon) : null;

        let viewbox: string | undefined;
        if (centroLat && centroLon) {
          const delta = 0.3;
          viewbox = `${centroLon - delta},${centroLat + delta},${centroLon + delta},${centroLat - delta}`;
        }

        // Helper: llamada al proxy con signal de abort
        const fetchFromProxy = async (params: Record<string, string | number>): Promise<DireccionSuggestion[]> => {
          const res = await api.get('/geocoding/search', {
            params,
            signal: controller.signal,
          });
          return Array.isArray(res.data) ? res.data : [];
        };

        const searchQuery = `${trimmed}, Buenos Aires, Argentina`;

        // 1) Primer intento: viewbox + bounded=1 (estrictamente dentro del área)
        let data: DireccionSuggestion[] = await fetchFromProxy({
          q: searchQuery,
          countrycodes: 'ar',
          limit: 15,
          ...(viewbox ? { viewbox, bounded: 1 } : {}),
        });

        // 2) Fallback: viewbox sin bounded (preferencia pero no estricto)
        if (data.length === 0 && viewbox) {
          data = await fetchFromProxy({
            q: searchQuery,
            countrycodes: 'ar',
            limit: 15,
            viewbox,
          });
        }

        // 3) Fallback: agregar nombre del municipio a la query
        if (data.length === 0 && municipioSimple) {
          data = await fetchFromProxy({
            q: `${trimmed}, ${municipioSimple}, Buenos Aires, Argentina`,
            countrycodes: 'ar',
            limit: 15,
          });
        }

        // 4) Fallback: sólo query + Argentina
        if (data.length === 0) {
          data = await fetchFromProxy({
            q: `${trimmed}, Argentina`,
            countrycodes: 'ar',
            limit: 15,
          });
        }

        // Ordenar por distancia al centro del municipio y quedarnos con las 8 mejores
        if (data.length > 0 && centroLat && centroLon) {
          data = data
            .map((item: DireccionSuggestion) => ({
              ...item,
              _distancia: calcularDistancia(centroLat, centroLon, parseFloat(item.lat), parseFloat(item.lon)),
            }))
            .sort((a: DireccionSuggestion, b: DireccionSuggestion) => (a._distancia ?? 0) - (b._distancia ?? 0))
            .slice(0, 8);
        }

        // ==== OBSOLETE CHECK ====
        // Si mientras esperábamos el response el usuario siguió escribiendo,
        // la query actual ya no es esta — descartamos el resultado para no
        // pintar sugerencias de una búsqueda vieja sobre un input distinto.
        if (queryActualRef.current !== trimmed) {
          return;
        }

        // Guardar en cache client-side antes de pintar
        clientCacheRef.current.set(cacheKey, data);

        setSuggestions(data);
        setShowSuggestions(data.length > 0);
      } catch (err: any) {
        // Las requests canceladas por AbortController NO son errores reales —
        // las ignoramos silenciosamente.
        if (err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED' || controller.signal.aborted) {
          return;
        }
        console.error('[DireccionAutocomplete] Error buscando direcciones:', err);
      } finally {
        // Solo apagamos el spinner si somos la última request activa
        if (abortRef.current === controller) {
          setSearching(false);
          abortRef.current = null;
        }
      }
    },
    [municipioActual],
  );

  // ============ Handlers ============

  const handleInputChange = (newValue: string) => {
    // Capturar número de calle que el usuario escribió a mano (para preservarlo
    // si Nominatim no lo devuelve en la respuesta)
    const numberMatch = newValue.match(/\b(\d+)\b/);
    if (numberMatch) {
      setUserInputNumber(numberMatch[1]);
    }

    // Al tipear, el usuario está editando la dirección → resetear las coords
    onChange(newValue, null, null);

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    searchTimeoutRef.current = setTimeout(() => {
      searchAddress(newValue);
    }, 600);
  };

  const selectSuggestion = (suggestion: DireccionSuggestion) => {
    let direccion = '';
    const addr = suggestion.address;

    if (addr) {
      const parts: string[] = [];
      if (addr.road) {
        const numero = addr.house_number || userInputNumber;
        parts.push(numero ? `${addr.road} ${numero}` : addr.road);
      }
      const locality = addr.neighbourhood || addr.suburb || addr.village || addr.town || addr.city;
      if (locality) parts.push(locality);
      if (addr.state && !addr.state.toLowerCase().includes('buenos aires')) {
        parts.push(addr.state);
      }
      direccion = parts.join(', ');
    }

    if (!direccion) {
      direccion = suggestion.display_name.split(', ').slice(0, 4).join(', ');
    }

    onChange(direccion, parseFloat(suggestion.lat), parseFloat(suggestion.lon));
    setShowSuggestions(false);
    setSuggestions([]);
  };

  const getCurrentLocation = async () => {
    if (!navigator.geolocation) {
      toast.error('Tu navegador no soporta geolocalización');
      return;
    }

    setGettingLocation(true);
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        });
      });

      const lat = position.coords.latitude;
      const lon = position.coords.longitude;

      // Reverse geocoding vía proxy del backend (mismo motivo: evitar CORS)
      const reverseRes = await api.get('/geocoding/reverse', { params: { lat, lon } });
      const data = reverseRes.data;
      const addr = data.address;

      let direccion = '';
      if (addr) {
        const parts: string[] = [];
        if (addr.road) {
          const numero = addr.house_number || '';
          parts.push(numero ? `${addr.road} ${numero}` : addr.road);
        }
        const locality = addr.neighbourhood || addr.suburb || addr.village || addr.town || addr.city;
        if (locality) parts.push(locality);
        if (addr.state && !addr.state.toLowerCase().includes('buenos aires')) {
          parts.push(addr.state);
        }
        direccion = parts.join(', ');
      }
      if (!direccion) {
        direccion = data.display_name.split(', ').slice(0, 4).join(', ');
      }

      onChange(direccion, lat, lon);
      toast.success('Ubicación detectada');
    } catch (err: any) {
      if (err?.code === 1) {
        toast.error('Permiso de ubicación denegado. Activalo en la configuración del navegador.');
      } else if (err?.code === 2) {
        toast.error('No se pudo obtener tu ubicación. Intentá de nuevo.');
      } else if (err?.code === 3) {
        toast.error('Tiempo de espera agotado. Intentá de nuevo.');
      } else {
        toast.error('Error al obtener la ubicación');
      }
    } finally {
      setGettingLocation(false);
    }
  };

  // ============ Render ============

  const hasError = !!error;

  return (
    <div className="relative">
      {label && (
        <label className="block text-sm font-medium mb-2" style={{ color: theme.text }}>
          {label}
          {required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
          onBlur={onBlur}
          disabled={disabled}
          placeholder={placeholder}
          maxLength={maxLength}
          className={`w-full px-4 ${inputClassName} ${showCurrentLocationButton ? 'pr-24' : 'pr-10'} rounded-xl focus:ring-2 focus:outline-none transition-all disabled:opacity-60`}
          style={{
            backgroundColor: theme.backgroundSecondary,
            color: theme.text,
            border: `1px solid ${hasError ? '#ef4444' : theme.border}`,
          }}
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
          {(searching || gettingLocation) && (
            <Loader2 className="h-5 w-5 animate-spin" style={{ color: theme.textSecondary }} />
          )}
          {showCurrentLocationButton && (
            <button
              type="button"
              onClick={getCurrentLocation}
              disabled={disabled || gettingLocation}
              className="p-1.5 rounded-lg transition-all hover:scale-110 active:scale-95 disabled:opacity-50"
              style={{
                backgroundColor: `${theme.primary}15`,
                color: theme.primary,
              }}
              title="Usar mi ubicación actual"
            >
              <Crosshair className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>

      {hasError && <p className="mt-1 text-xs text-red-500">{error}</p>}

      {/* Dropdown de sugerencias */}
      {showSuggestions && suggestions.length > 0 && (
        <div
          className="absolute z-50 w-full mt-1 rounded-xl shadow-lg overflow-hidden max-h-60 overflow-y-auto"
          style={{
            backgroundColor: theme.card,
            border: `1px solid ${theme.border}`,
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          {suggestions.map((suggestion, index) => (
            <button
              key={index}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                selectSuggestion(suggestion);
              }}
              className="w-full text-left px-4 py-3 flex items-start gap-3 transition-colors touch-manipulation"
              style={{ color: theme.text }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = theme.backgroundSecondary)}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              <MapPin className="h-5 w-5 flex-shrink-0 mt-0.5" style={{ color: theme.primary }} />
              <span className="text-sm line-clamp-2">{suggestion.display_name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
