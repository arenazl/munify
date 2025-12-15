import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Clock, MapPin, User, Users } from 'lucide-react';
import { reclamosApi } from '../lib/api';
import { Reclamo, HistorialReclamo, EstadoReclamo } from '../types';
import { useAuth } from '../contexts/AuthContext';

const estadoColors: Record<EstadoReclamo, string> = {
  nuevo: 'bg-gray-100 text-gray-800',
  asignado: 'bg-blue-100 text-blue-800',
  en_proceso: 'bg-yellow-100 text-yellow-800',
  resuelto: 'bg-green-100 text-green-800',
  rechazado: 'bg-red-100 text-red-800',
};

export default function ReclamoDetalle() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [reclamo, setReclamo] = useState<Reclamo | null>(null);
  const [historial, setHistorial] = useState<HistorialReclamo[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolucion, setResolucion] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [reclamoRes, historialRes] = await Promise.all([
          reclamosApi.getOne(Number(id)),
          reclamosApi.getHistorial(Number(id)),
        ]);
        setReclamo(reclamoRes.data);
        setHistorial(historialRes.data);
      } catch (error) {
        console.error('Error cargando reclamo:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id]);

  const handleIniciar = async () => {
    if (!reclamo) return;
    setSubmitting(true);
    try {
      await reclamosApi.iniciar(reclamo.id);
      const [reclamoRes, historialRes] = await Promise.all([
        reclamosApi.getOne(reclamo.id),
        reclamosApi.getHistorial(reclamo.id),
      ]);
      setReclamo(reclamoRes.data);
      setHistorial(historialRes.data);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleResolver = async () => {
    if (!reclamo || !resolucion) return;
    setSubmitting(true);
    try {
      await reclamosApi.resolver(reclamo.id, { resolucion });
      const [reclamoRes, historialRes] = await Promise.all([
        reclamosApi.getOne(reclamo.id),
        reclamosApi.getHistorial(reclamo.id),
      ]);
      setReclamo(reclamoRes.data);
      setHistorial(historialRes.data);
      setResolucion('');
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!reclamo) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Reclamo no encontrado</p>
      </div>
    );
  }

  const canModify = user?.rol === 'empleado' || user?.rol === 'supervisor' || user?.rol === 'admin';

  return (
    <div className="space-y-6">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center text-gray-600 hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        Volver
      </button>

      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b">
          <div className="flex justify-between items-start">
            <div>
              <span className={`px-2 py-1 text-xs rounded-full ${estadoColors[reclamo.estado]}`}>
                {reclamo.estado.replace('_', ' ')}
              </span>
              <h1 className="text-2xl font-bold text-gray-900 mt-2">{reclamo.titulo}</h1>
              <p className="text-sm text-gray-500 mt-1">Reclamo #{reclamo.id}</p>
            </div>
            <span
              className="px-3 py-1 text-sm rounded-full"
              style={{ backgroundColor: reclamo.categoria.color || '#gray' }}
            >
              {reclamo.categoria.nombre}
            </span>
          </div>
        </div>

        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-medium text-gray-500">Descripción</h3>
              <p className="mt-1 text-gray-900">{reclamo.descripcion}</p>
            </div>

            <div className="flex items-start">
              <MapPin className="h-5 w-5 text-gray-400 mr-2 mt-0.5" />
              <div>
                <p className="text-gray-900">{reclamo.direccion}</p>
                {reclamo.referencia && (
                  <p className="text-sm text-gray-500">{reclamo.referencia}</p>
                )}
                {reclamo.zona && (
                  <p className="text-sm text-gray-500">Zona: {reclamo.zona.nombre}</p>
                )}
              </div>
            </div>

            <div className="flex items-center">
              <User className="h-5 w-5 text-gray-400 mr-2" />
              <div>
                <p className="text-gray-900">{reclamo.creador.nombre} {reclamo.creador.apellido}</p>
                <p className="text-sm text-gray-500">{reclamo.creador.email}</p>
              </div>
            </div>

            {reclamo.empleado_asignado && (
              <div className="flex items-center">
                <Users className="h-5 w-5 text-gray-400 mr-2" />
                <div>
                  <p className="text-gray-900">{reclamo.empleado_asignado.nombre}</p>
                  <p className="text-sm text-gray-500">{reclamo.empleado_asignado.especialidad}</p>
                </div>
              </div>
            )}

            <div className="flex items-center">
              <Clock className="h-5 w-5 text-gray-400 mr-2" />
              <p className="text-gray-500">
                Creado el {new Date(reclamo.created_at).toLocaleString()}
              </p>
            </div>

            {reclamo.resolucion && (
              <div className="bg-green-50 p-4 rounded-md">
                <h3 className="text-sm font-medium text-green-800">Resolución</h3>
                <p className="mt-1 text-green-700">{reclamo.resolucion}</p>
              </div>
            )}

            {reclamo.motivo_rechazo && (
              <div className="bg-red-50 p-4 rounded-md">
                <h3 className="text-sm font-medium text-red-800">Motivo de rechazo</h3>
                <p className="mt-1 text-red-700">{reclamo.motivo_rechazo}</p>
                {reclamo.descripcion_rechazo && (
                  <p className="mt-1 text-red-600 text-sm">{reclamo.descripcion_rechazo}</p>
                )}
              </div>
            )}
          </div>

          <div>
            <h3 className="text-sm font-medium text-gray-500 mb-4">Historial</h3>
            <div className="space-y-4">
              {historial.map((item) => (
                <div key={item.id} className="border-l-2 border-gray-200 pl-4">
                  <p className="text-sm font-medium text-gray-900 capitalize">{item.accion}</p>
                  {item.comentario && (
                    <p className="text-sm text-gray-500">{item.comentario}</p>
                  )}
                  <p className="text-xs text-gray-400 mt-1">
                    {item.usuario.nombre} {item.usuario.apellido} - {new Date(item.created_at).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>

            {/* Acciones */}
            {canModify && reclamo.estado === 'asignado' && (
              <div className="mt-6">
                <button
                  onClick={handleIniciar}
                  disabled={submitting}
                  className="w-full px-4 py-2 bg-yellow-500 text-white rounded-md hover:bg-yellow-600 disabled:opacity-50"
                >
                  {submitting ? 'Procesando...' : 'Iniciar Trabajo'}
                </button>
              </div>
            )}

            {canModify && reclamo.estado === 'en_proceso' && (
              <div className="mt-6 space-y-4">
                <textarea
                  value={resolucion}
                  onChange={(e) => setResolucion(e.target.value)}
                  placeholder="Describe la resolución del reclamo..."
                  rows={3}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                />
                <button
                  onClick={handleResolver}
                  disabled={submitting || !resolucion}
                  className="w-full px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
                >
                  {submitting ? 'Procesando...' : 'Marcar como Resuelto'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
