import { useEffect, useState, useRef } from 'react';
import { Save, Settings, Sparkles, Check, X, MapPin, Loader2, Building2 } from 'lucide-react';
import { toast } from 'sonner';
import { configuracionApi } from '../lib/api';
import { useTheme } from '../contexts/ThemeContext';

// Claves que se muestran en la sección especial del Municipio
const MUNICIPIO_KEYS = ['nombre_municipio', 'direccion_municipio', 'latitud_municipio', 'longitud_municipio', 'telefono_contacto'];

interface Config {
  id: number;
  clave: string;
  valor: string | null;
  descripcion: string | null;
  tipo: string;
  editable: boolean;
}

interface AddressSuggestion {
  display_name: string;
  lat: string;
  lon: string;
}

export default function Configuracion() {
  const { theme } = useTheme();
  const [configs, setConfigs] = useState<Config[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [modified, setModified] = useState<Record<string, boolean>>({});

  // Estados para autocompletado de municipio (nombre)
  const [municipioSuggestions, setMunicipioSuggestions] = useState<AddressSuggestion[]>([]);
  const [showMunicipioSuggestions, setShowMunicipioSuggestions] = useState(false);
  const [searchingMunicipio, setSearchingMunicipio] = useState(false);
  const municipioTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Estados para autocompletado de dirección
  const [addressSuggestions, setAddressSuggestions] = useState<AddressSuggestion[]>([]);
  const [showAddressSuggestions, setShowAddressSuggestions] = useState(false);
  const [searchingAddress, setSearchingAddress] = useState(false);
  const addressTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetchConfigs();
  }, []);

  const fetchConfigs = async () => {
    try {
      const response = await configuracionApi.getAll();
      setConfigs(response.data);
      const vals: Record<string, string> = {};
      response.data.forEach((c: Config) => {
        vals[c.clave] = c.valor || '';
      });
      setValues(vals);
    } catch (error) {
      toast.error('Error al cargar configuración');
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (clave: string, valor: string) => {
    setValues({ ...values, [clave]: valor });
    const original = configs.find(c => c.clave === clave)?.valor || '';
    setModified({ ...modified, [clave]: valor !== original });
  };

  // Buscar municipios con Nominatim (ciudades/localidades de Argentina)
  const searchMunicipio = async (query: string) => {
    if (query.length < 3) {
      setMunicipioSuggestions([]);
      return;
    }

    setSearchingMunicipio(true);
    try {
      // Buscar ciudades/municipios en Argentina
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}, Argentina&limit=5&featuretype=city&addressdetails=1`,
        {
          headers: {
            'Accept-Language': 'es'
          }
        }
      );

      if (response.ok) {
        const data = await response.json();
        setMunicipioSuggestions(data);
        setShowMunicipioSuggestions(data.length > 0);
      }
    } catch (error) {
      console.error('Error buscando municipio:', error);
    } finally {
      setSearchingMunicipio(false);
    }
  };

  // Manejar cambio en nombre del municipio con debounce
  const handleMunicipioChange = (valor: string) => {
    handleChange('nombre_municipio', valor);

    if (municipioTimeoutRef.current) {
      clearTimeout(municipioTimeoutRef.current);
    }

    municipioTimeoutRef.current = setTimeout(() => {
      searchMunicipio(valor);
    }, 400);
  };

  // Seleccionar un municipio sugerido
  const selectMunicipio = (suggestion: AddressSuggestion) => {
    // Extraer nombre del municipio (primera parte antes de la coma)
    const parts = suggestion.display_name.split(',');
    const municipioName = parts[0].trim();

    // Simplificar dirección (primeras 3 partes)
    const simplifiedAddress = parts.slice(0, 3).join(',').trim();

    // Actualizar todos los campos del municipio
    setValues(prev => ({
      ...prev,
      nombre_municipio: `Municipalidad de ${municipioName}`,
      direccion_municipio: simplifiedAddress,
      latitud_municipio: suggestion.lat,
      longitud_municipio: suggestion.lon,
    }));

    setModified(prev => ({
      ...prev,
      nombre_municipio: true,
      direccion_municipio: true,
      latitud_municipio: true,
      longitud_municipio: true,
    }));

    setShowMunicipioSuggestions(false);
    setMunicipioSuggestions([]);
  };

  // Buscar direcciones con Nominatim (usando el municipio seleccionado como contexto)
  const searchAddress = async (query: string) => {
    if (query.length < 3) {
      setAddressSuggestions([]);
      return;
    }

    setSearchingAddress(true);
    try {
      // Extraer nombre del municipio para contextualizar la búsqueda
      const municipioNombre = values.nombre_municipio?.replace('Municipalidad de ', '') || '';
      const contexto = municipioNombre ? `${municipioNombre}, Argentina` : 'Argentina';

      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}, ${encodeURIComponent(contexto)}&limit=5&addressdetails=1`,
        {
          headers: {
            'Accept-Language': 'es'
          }
        }
      );

      if (response.ok) {
        const data = await response.json();
        setAddressSuggestions(data);
        setShowAddressSuggestions(data.length > 0);
      }
    } catch (error) {
      console.error('Error buscando dirección:', error);
    } finally {
      setSearchingAddress(false);
    }
  };

  // Manejar cambio en dirección con debounce
  const handleAddressChange = (valor: string) => {
    handleChange('direccion_municipio', valor);

    if (addressTimeoutRef.current) {
      clearTimeout(addressTimeoutRef.current);
    }

    addressTimeoutRef.current = setTimeout(() => {
      searchAddress(valor);
    }, 400);
  };

  // Seleccionar una dirección sugerida
  const selectAddress = (suggestion: AddressSuggestion) => {
    const parts = suggestion.display_name.split(',');
    const simplifiedAddress = parts.slice(0, 3).join(',').trim();

    // Actualizar dirección
    handleChange('direccion_municipio', simplifiedAddress);

    // Actualizar latitud y longitud
    setValues(prev => ({
      ...prev,
      direccion_municipio: simplifiedAddress,
      latitud_municipio: suggestion.lat,
      longitud_municipio: suggestion.lon
    }));

    // Marcar como modificados
    setModified(prev => ({
      ...prev,
      direccion_municipio: true,
      latitud_municipio: true,
      longitud_municipio: true
    }));

    setShowAddressSuggestions(false);
    setAddressSuggestions([]);
  };

  const handleSave = async (clave: string) => {
    setSaving(clave);
    try {
      await configuracionApi.update(clave, { valor: values[clave] });
      setModified({ ...modified, [clave]: false });
      // Actualizar el valor original en configs
      setConfigs(configs.map(c => c.clave === clave ? { ...c, valor: values[clave] } : c));
      toast.success('Configuración guardada');
    } catch (error) {
      toast.error('Error al guardar');
      console.error('Error:', error);
    } finally {
      setSaving(null);
    }
  };

  // Guardar todos los campos del municipio
  const handleSaveMunicipio = async () => {
    setSaving('municipio');
    try {
      const keysToSave = MUNICIPIO_KEYS.filter(key => modified[key]);
      for (const key of keysToSave) {
        await configuracionApi.update(key, { valor: values[key] });
      }
      // Limpiar modified para las claves guardadas
      const newModified = { ...modified };
      keysToSave.forEach(key => newModified[key] = false);
      setModified(newModified);
      // Actualizar configs
      setConfigs(configs.map(c => MUNICIPIO_KEYS.includes(c.clave) ? { ...c, valor: values[c.clave] } : c));
      toast.success('Datos del municipio guardados');
    } catch (error) {
      toast.error('Error al guardar');
      console.error('Error:', error);
    } finally {
      setSaving(null);
    }
  };

  // Verificar si hay cambios en el municipio
  const hasMunicipioChanges = MUNICIPIO_KEYS.some(key => modified[key]);

  // Filtrar configs para excluir las del municipio en la tabla general
  const otherConfigs = configs.filter(c => !MUNICIPIO_KEYS.includes(c.clave));

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <div className="relative">
          <div
            className="animate-spin rounded-full h-12 w-12 border-4 border-t-transparent"
            style={{ borderColor: `${theme.primary}33`, borderTopColor: theme.primary }}
          />
          <Sparkles
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-5 w-5 animate-pulse"
            style={{ color: theme.primary }}
          />
        </div>
        <p className="text-sm animate-pulse" style={{ color: theme.textSecondary }}>Cargando...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div
        className="rounded-xl px-5 py-4"
        style={{
          backgroundColor: theme.card,
          border: `1px solid ${theme.border}`,
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: `${theme.primary}20` }}
          >
            <Settings className="h-5 w-5" style={{ color: theme.primary }} />
          </div>
          <div>
            <h1 className="text-xl font-bold" style={{ color: theme.text }}>
              Configuración
            </h1>
            <p className="text-sm" style={{ color: theme.textSecondary }}>
              Parámetros del sistema
            </p>
          </div>
        </div>
      </div>

      {/* Sección Datos del Municipio */}
      <div
        className="rounded-xl p-5"
        style={{
          backgroundColor: theme.card,
          border: `1px solid ${theme.border}`,
        }}
      >
        <div className="flex items-center gap-3 mb-4">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: `${theme.primary}20` }}
          >
            <Building2 className="h-5 w-5" style={{ color: theme.primary }} />
          </div>
          <div>
            <h2 className="text-lg font-bold" style={{ color: theme.text }}>
              Datos del Municipio
            </h2>
            <p className="text-sm" style={{ color: theme.textSecondary }}>
              Nombre y ubicación de la municipalidad
            </p>
          </div>
        </div>

        <div className="space-y-4">
          {/* Nombre del Municipio con autocompletado */}
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: theme.text }}>
              Nombre del Municipio
            </label>
            <div className="relative">
              <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: theme.textSecondary }} />
              <input
                type="text"
                value={values.nombre_municipio || ''}
                onChange={(e) => handleMunicipioChange(e.target.value)}
                onFocus={() => municipioSuggestions.length > 0 && setShowMunicipioSuggestions(true)}
                onBlur={() => setTimeout(() => setShowMunicipioSuggestions(false), 200)}
                placeholder="Buscar municipio..."
                className="w-full rounded-lg pl-10 pr-10 py-3 text-sm transition-all duration-200 focus:ring-2 focus:outline-none"
                style={{
                  backgroundColor: theme.backgroundSecondary,
                  color: theme.text,
                  border: `1px solid ${modified.nombre_municipio ? '#f59e0b' : theme.border}`,
                }}
              />
              {searchingMunicipio && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin" style={{ color: theme.primary }} />
              )}

              {/* Sugerencias de municipio */}
              {showMunicipioSuggestions && municipioSuggestions.length > 0 && (
                <div
                  className="absolute z-50 w-full mt-1 rounded-lg shadow-lg overflow-hidden"
                  style={{
                    backgroundColor: theme.card,
                    border: `1px solid ${theme.border}`,
                  }}
                >
                  {municipioSuggestions.map((suggestion, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => selectMunicipio(suggestion)}
                      className="w-full px-4 py-3 text-left text-sm hover:opacity-80 transition-colors flex items-start gap-2"
                      style={{
                        backgroundColor: idx % 2 === 0 ? 'transparent' : theme.backgroundSecondary,
                        color: theme.text,
                      }}
                    >
                      <Building2 className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: theme.primary }} />
                      <span className="line-clamp-2">{suggestion.display_name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Dirección del Municipio con autocompletado */}
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: theme.text }}>
              Dirección de la Municipalidad
            </label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: theme.textSecondary }} />
              <input
                type="text"
                value={values.direccion_municipio || ''}
                onChange={(e) => handleAddressChange(e.target.value)}
                onFocus={() => addressSuggestions.length > 0 && setShowAddressSuggestions(true)}
                onBlur={() => setTimeout(() => setShowAddressSuggestions(false), 200)}
                placeholder="Buscar dirección..."
                className="w-full rounded-lg pl-10 pr-10 py-3 text-sm transition-all duration-200 focus:ring-2 focus:outline-none"
                style={{
                  backgroundColor: theme.backgroundSecondary,
                  color: theme.text,
                  border: `1px solid ${modified.direccion_municipio ? '#f59e0b' : theme.border}`,
                }}
              />
              {searchingAddress && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin" style={{ color: theme.primary }} />
              )}

              {/* Sugerencias de dirección */}
              {showAddressSuggestions && addressSuggestions.length > 0 && (
                <div
                  className="absolute z-50 w-full mt-1 rounded-lg shadow-lg overflow-hidden"
                  style={{
                    backgroundColor: theme.card,
                    border: `1px solid ${theme.border}`,
                  }}
                >
                  {addressSuggestions.map((suggestion, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => selectAddress(suggestion)}
                      className="w-full px-4 py-3 text-left text-sm hover:opacity-80 transition-colors flex items-start gap-2"
                      style={{
                        backgroundColor: idx % 2 === 0 ? 'transparent' : theme.backgroundSecondary,
                        color: theme.text,
                      }}
                    >
                      <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: theme.primary }} />
                      <span className="line-clamp-2">{suggestion.display_name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Teléfono de contacto */}
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: theme.text }}>
              Teléfono de contacto
            </label>
            <input
              type="text"
              value={values.telefono_contacto || ''}
              onChange={(e) => handleChange('telefono_contacto', e.target.value)}
              placeholder="Ej: 0800-123-4567"
              className="w-full rounded-lg px-4 py-3 text-sm transition-all duration-200 focus:ring-2 focus:outline-none"
              style={{
                backgroundColor: theme.backgroundSecondary,
                color: theme.text,
                border: `1px solid ${modified.telefono_contacto ? '#f59e0b' : theme.border}`,
              }}
            />
          </div>

          {/* Coordenadas (solo lectura, se actualizan al seleccionar dirección) */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: theme.textSecondary }}>
                Latitud
              </label>
              <input
                type="text"
                value={values.latitud_municipio || ''}
                readOnly
                className="w-full rounded-lg px-4 py-2 text-sm opacity-60"
                style={{
                  backgroundColor: theme.backgroundSecondary,
                  color: theme.textSecondary,
                  border: `1px solid ${theme.border}`,
                }}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: theme.textSecondary }}>
                Longitud
              </label>
              <input
                type="text"
                value={values.longitud_municipio || ''}
                readOnly
                className="w-full rounded-lg px-4 py-2 text-sm opacity-60"
                style={{
                  backgroundColor: theme.backgroundSecondary,
                  color: theme.textSecondary,
                  border: `1px solid ${theme.border}`,
                }}
              />
            </div>
          </div>

          {/* Botón guardar */}
          <div className="pt-2">
            <button
              onClick={handleSaveMunicipio}
              disabled={saving === 'municipio' || !hasMunicipioChanges}
              className="w-full py-3 rounded-lg text-sm font-medium transition-all duration-200 disabled:opacity-40 flex items-center justify-center gap-2"
              style={{
                background: hasMunicipioChanges
                  ? `linear-gradient(135deg, ${theme.primary} 0%, ${theme.primaryHover} 100%)`
                  : theme.backgroundSecondary,
                color: hasMunicipioChanges ? '#ffffff' : theme.textSecondary,
              }}
            >
              <Save className="h-4 w-4" />
              {saving === 'municipio' ? 'Guardando...' : 'Guardar datos del municipio'}
            </button>
          </div>
        </div>
      </div>

      {/* Tabla de otras configuraciones */}
      {otherConfigs.length > 0 && (
      <div
        className="rounded-xl overflow-hidden"
        style={{
          backgroundColor: theme.card,
          border: `1px solid ${theme.border}`,
        }}
      >
        <div className="px-5 py-3" style={{ backgroundColor: theme.backgroundSecondary }}>
          <h3 className="text-sm font-semibold" style={{ color: theme.text }}>Otras configuraciones</h3>
        </div>
        <table className="w-full">
          <thead>
            <tr style={{ backgroundColor: theme.backgroundSecondary }}>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: theme.textSecondary }}>
                Parámetro
              </th>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: theme.textSecondary }}>
                Valor
              </th>
              <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider w-32" style={{ color: theme.textSecondary }}>
                Acción
              </th>
            </tr>
          </thead>
          <tbody className="divide-y" style={{ borderColor: theme.border }}>
            {otherConfigs.map((config, index) => (
              <tr
                key={config.clave}
                className="transition-colors duration-200"
                style={{
                  backgroundColor: index % 2 === 0 ? 'transparent' : `${theme.backgroundSecondary}30`,
                }}
              >
                {/* Parámetro */}
                <td className="px-5 py-4">
                  <div>
                    <p className="font-medium text-sm" style={{ color: theme.text }}>
                      {config.clave}
                    </p>
                    {config.descripcion && (
                      <p className="text-xs mt-0.5" style={{ color: theme.textSecondary }}>
                        {config.descripcion}
                      </p>
                    )}
                  </div>
                </td>

                {/* Valor */}
                <td className="px-5 py-4">
                  {config.tipo === 'boolean' ? (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => config.editable && handleChange(config.clave, 'true')}
                        disabled={!config.editable}
                        className="px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200 disabled:opacity-50"
                        style={{
                          backgroundColor: values[config.clave] === 'true' ? '#22c55e' : theme.backgroundSecondary,
                          color: values[config.clave] === 'true' ? 'white' : theme.textSecondary,
                          border: `1px solid ${values[config.clave] === 'true' ? '#22c55e' : theme.border}`,
                        }}
                      >
                        <Check className="h-3 w-3 inline mr-1" />
                        Sí
                      </button>
                      <button
                        onClick={() => config.editable && handleChange(config.clave, 'false')}
                        disabled={!config.editable}
                        className="px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200 disabled:opacity-50"
                        style={{
                          backgroundColor: values[config.clave] === 'false' ? '#ef4444' : theme.backgroundSecondary,
                          color: values[config.clave] === 'false' ? 'white' : theme.textSecondary,
                          border: `1px solid ${values[config.clave] === 'false' ? '#ef4444' : theme.border}`,
                        }}
                      >
                        <X className="h-3 w-3 inline mr-1" />
                        No
                      </button>
                    </div>
                  ) : (
                    <input
                      type={config.tipo === 'number' ? 'number' : 'text'}
                      value={values[config.clave]}
                      onChange={(e) => handleChange(config.clave, e.target.value)}
                      disabled={!config.editable}
                      className="w-full max-w-sm rounded-lg px-3 py-2 text-sm transition-all duration-200 focus:ring-2 focus:outline-none disabled:opacity-50"
                      style={{
                        backgroundColor: theme.backgroundSecondary,
                        color: theme.text,
                        border: `1px solid ${modified[config.clave] ? '#f59e0b' : theme.border}`,
                      }}
                    />
                  )}
                </td>

                {/* Acción */}
                <td className="px-5 py-4 text-right">
                  {config.editable && (
                    <button
                      onClick={() => handleSave(config.clave)}
                      disabled={saving === config.clave || !modified[config.clave]}
                      className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 disabled:opacity-40"
                      style={{
                        background: modified[config.clave]
                          ? `linear-gradient(135deg, ${theme.primary} 0%, ${theme.primaryHover} 100%)`
                          : theme.backgroundSecondary,
                        color: modified[config.clave] ? '#ffffff' : theme.textSecondary,
                      }}
                    >
                      <Save className="h-3 w-3 mr-1" />
                      {saving === config.clave ? '...' : 'Guardar'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
    </div>
  );
}
