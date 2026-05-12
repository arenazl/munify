import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, MapPin, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, CircleMarker } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { TesoreriaHint } from '../components/tesoreria/TesoreriaHint';
import { contactosApi, gastosApi } from '../lib/api';
import type { Contacto, Gasto, TipoContacto } from '../types';

// Fix leaflet default icon paths (vite no resuelve los assets por defecto)
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
});

const TIPO_COLORS: Record<TipoContacto, string> = {
  concejal: '#8b5cf6', empleado: '#3b82f6', profesional: '#f59e0b',
  proveedor: '#10b981', contratista: '#06b6d4', beneficiario: '#ec4899', otro: '#71717a',
};

const ARG_DEFAULT_CENTER: [number, number] = [-30.266, -64.125]; // San Pedro Norte aprox
const ARG_DEFAULT_ZOOM = 11;

export default function TesoreriaMapa() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const [contactos, setContactos] = useState<Contacto[]>([]);
  const [gastos, setGastos] = useState<Gasto[]>([]);

  if (user && user.rol !== 'admin' && user.rol !== 'supervisor') return <p className="p-6 text-sm">Sin permisos.</p>;

  useEffect(() => {
    (async () => {
      try {
        const [c, g] = await Promise.all([
          contactosApi.list({ limit: 500, activo: true }),
          gastosApi.list({ destino_tipo: 'contacto', limit: 500 }),
        ]);
        setContactos(c.data);
        setGastos(g.data);
      } catch (e) { console.error(e); }
    })();
  }, []);

  // Contactos con geo
  const geoContactos = useMemo(() => contactos.filter(c => c.latitud && c.longitud), [contactos]);

  // Total gastado por contacto
  const totalesPorContacto = useMemo(() => {
    const map: Record<number, number> = {};
    for (const g of gastos) {
      if (g.destino_contacto_id) {
        map[g.destino_contacto_id] = (map[g.destino_contacto_id] || 0) + parseFloat(g.monto_pesos);
      }
    }
    return map;
  }, [gastos]);

  // Centro: promedio de los puntos o default
  const center = useMemo(() => {
    if (geoContactos.length === 0) return ARG_DEFAULT_CENTER;
    const lat = geoContactos.reduce((s, c) => s + (c.latitud || 0), 0) / geoContactos.length;
    const lng = geoContactos.reduce((s, c) => s + (c.longitud || 0), 0) / geoContactos.length;
    return [lat, lng] as [number, number];
  }, [geoContactos]);

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <Link to="/gestion/tesoreria" className="text-sm inline-flex items-center gap-1 mb-3" style={{ color: theme.primary }}>
        <ArrowLeft className="h-4 w-4" /> Volver a Tesorería
      </Link>

      <TesoreriaHint titulo="Mapa de Contactos" storageKey="mapa">
        Cada pin es un contacto con ubicación cargada. El <b>tamaño</b> indica
        cuánto le pagaste en total (más grande = más plata). Tocá un pin para
        ver el detalle. Para sumar ubicaciones, importá un KMZ desde la
        sección Contactos.
      </TesoreriaHint>

      <div className="flex items-center justify-between mb-3">
        <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: theme.text }}>
          <MapPin className="h-6 w-6" /> Mapa
          <span className="text-sm font-normal opacity-70">
            ({geoContactos.length} con ubicación de {contactos.length} totales)
          </span>
        </h1>
      </div>

      {geoContactos.length === 0 ? (
        <div className="text-center py-16 rounded-xl" style={{ backgroundColor: theme.card, border: `1px dashed ${theme.border}` }}>
          <MapPin className="h-12 w-12 mx-auto mb-3" style={{ color: theme.textSecondary }} />
          <p className="font-semibold" style={{ color: theme.text }}>No hay contactos geolocalizados</p>
          <p className="text-sm mt-1" style={{ color: theme.textSecondary }}>
            Importá un KMZ desde <Link to="/gestion/tesoreria/contactos" className="underline" style={{ color: theme.primary }}>Contactos</Link>
            {' '}o cargá lat/lon manualmente al editar un contacto.
          </p>
        </div>
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${theme.border}`, height: 600 }}>
          <MapContainer center={center} zoom={ARG_DEFAULT_ZOOM} style={{ width: '100%', height: '100%' }}>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {geoContactos.map(c => {
              const total = totalesPorContacto[c.id] || 0;
              const radius = total > 0 ? Math.min(25, 6 + Math.log10(total + 1) * 3) : 8;
              const color = TIPO_COLORS[c.tipo];
              return (
                <CircleMarker
                  key={c.id}
                  center={[c.latitud!, c.longitud!]}
                  radius={radius}
                  pathOptions={{ color, fillColor: color, fillOpacity: 0.6, weight: 2 }}
                >
                  <Popup>
                    <div style={{ minWidth: 180 }}>
                      <p style={{ margin: 0, fontWeight: 'bold' }}>
                        {c.nombre} {c.apellido || ''}
                      </p>
                      <p style={{ margin: '4px 0 0', fontSize: 12, color: '#666' }}>
                        {c.tipo}
                      </p>
                      {total > 0 && (
                        <p style={{ margin: '6px 0 0', fontSize: 14, fontWeight: 600, color: '#22c55e' }}>
                          Total: ${total.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                        </p>
                      )}
                      {c.alias_pago && (
                        <p style={{ margin: '4px 0 0', fontSize: 11, color: '#999' }}>{c.alias_pago}</p>
                      )}
                    </div>
                  </Popup>
                </CircleMarker>
              );
            })}
          </MapContainer>
        </div>
      )}
    </div>
  );
}
