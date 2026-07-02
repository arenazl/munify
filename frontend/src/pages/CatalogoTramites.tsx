import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, FileCheck, CalendarClock, Users, Globe, ChevronDown } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { API_URL } from '../lib/api';

/**
 * Catálogo PÚBLICO de trámites del municipio (sin login): el vecino consulta
 * qué trámites existen, CÓMO se atienden y qué tiene que llevar ANTES de ir
 * a la ventanilla o de sacar turno. Pieza del turnero consolidado (C.1).
 */

interface DocReq {
  id: number;
  nombre: string;
  obligatorio: boolean;
}

interface TramitePublico {
  id: number;
  nombre: string;
  descripcion?: string | null;
  categoria?: string | null;
  costo?: number | null;
  tiempo_estimado_dias: number;
  modo_atencion: string;
  documentos_requeridos: DocReq[];
}

const MODO_META: Record<string, { label: string; color: string; icon: typeof CalendarClock }> = {
  presencial_con_turno: { label: 'Con turno', color: '#f59e0b', icon: CalendarClock },
  presencial_sin_turno: { label: 'Por orden de llegada', color: '#8b5cf6', icon: Users },
  online: { label: '100% online', color: '#10b981', icon: Globe },
};

export default function CatalogoTramites() {
  const { theme } = useTheme();
  const navigate = useNavigate();
  const [tramites, setTramites] = useState<TramitePublico[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [abierto, setAbierto] = useState<number | null>(null);

  useEffect(() => {
    const municipioId = localStorage.getItem('municipio_actual_id');
    if (!municipioId) {
      navigate('/bienvenido');
      return;
    }
    fetch(`${API_URL}/publico/tramites?municipio_id=${municipioId}`)
      .then(r => r.json())
      .then(data => setTramites(Array.isArray(data) ? data : []))
      .catch(() => setTramites([]))
      .finally(() => setLoading(false));
  }, [navigate]);

  const filtrados = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tramites;
    return tramites.filter(t =>
      t.nombre.toLowerCase().includes(q) || (t.categoria || '').toLowerCase().includes(q)
    );
  }, [tramites, search]);

  const porCategoria = useMemo(() => {
    const m: Record<string, TramitePublico[]> = {};
    filtrados.forEach(t => {
      const c = t.categoria || 'Otros';
      (m[c] = m[c] || []).push(t);
    });
    return m;
  }, [filtrados]);

  return (
    <div className="min-h-screen pb-10" style={{ backgroundColor: theme.contentBackground }}>
      <div className="max-w-2xl mx-auto px-4 pt-4 space-y-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
          >
            <ArrowLeft className="h-4 w-4" style={{ color: theme.text }} />
          </button>
          <div>
            <h1 className="text-lg font-bold" style={{ color: theme.text }}>Trámites</h1>
            <p className="text-xs" style={{ color: theme.textSecondary }}>
              Qué necesitás y cómo se atiende cada uno
            </p>
          </div>
        </div>

        <div
          className="flex items-center gap-2 px-3 py-2.5 rounded-xl"
          style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
        >
          <Search className="h-4 w-4 flex-shrink-0" style={{ color: theme.textSecondary }} />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar trámite..."
            className="flex-1 bg-transparent outline-none text-sm"
            style={{ color: theme.text }}
          />
        </div>

        {loading ? (
          <p className="text-sm text-center py-8" style={{ color: theme.textSecondary }}>Cargando trámites...</p>
        ) : filtrados.length === 0 ? (
          <p className="text-sm text-center py-8" style={{ color: theme.textSecondary }}>
            No se encontraron trámites.
          </p>
        ) : (
          Object.entries(porCategoria).map(([cat, items]) => (
            <div key={cat}>
              <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: theme.textSecondary }}>
                {cat}
              </p>
              <div className="space-y-2">
                {items.map(t => {
                  const meta = MODO_META[t.modo_atencion] || MODO_META.online;
                  const ModoIcon = meta.icon;
                  const expandido = abierto === t.id;
                  return (
                    <div
                      key={t.id}
                      className="rounded-xl overflow-hidden"
                      style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
                    >
                      <button
                        onClick={() => setAbierto(expandido ? null : t.id)}
                        className="w-full flex items-center justify-between gap-2 p-3.5 text-left"
                      >
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate" style={{ color: theme.text }}>{t.nombre}</p>
                          <span
                            className="inline-flex items-center gap-1 mt-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                            style={{ backgroundColor: `${meta.color}18`, color: meta.color }}
                          >
                            <ModoIcon className="h-3 w-3" />
                            {meta.label}
                          </span>
                        </div>
                        <ChevronDown
                          className="h-4 w-4 flex-shrink-0 transition-transform"
                          style={{ color: theme.textSecondary, transform: expandido ? 'rotate(180deg)' : 'none' }}
                        />
                      </button>

                      {expandido && (
                        <div className="px-3.5 pb-3.5 space-y-3" style={{ borderTop: `1px solid ${theme.border}` }}>
                          {t.descripcion && (
                            <p className="text-sm pt-3" style={{ color: theme.textSecondary }}>{t.descripcion}</p>
                          )}
                          {t.documentos_requeridos.length > 0 && (
                            <div>
                              <p className="text-xs font-semibold uppercase mb-1.5 flex items-center gap-1.5 pt-2" style={{ color: theme.primary }}>
                                <FileCheck className="h-3.5 w-3.5" />
                                Qué tenés que llevar
                              </p>
                              <ul className="space-y-1">
                                {t.documentos_requeridos.map(d => (
                                  <li key={d.id} className="text-sm flex items-start gap-1.5" style={{ color: theme.text }}>
                                    <span style={{ color: theme.primary }}>•</span>
                                    {d.nombre}
                                    {!d.obligatorio && (
                                      <span className="text-xs" style={{ color: theme.textSecondary }}>(si corresponde)</span>
                                    )}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {t.costo != null && t.costo > 0 && (
                            <p className="text-sm" style={{ color: theme.text }}>
                              Costo: <strong>${Number(t.costo).toLocaleString('es-AR')}</strong>
                            </p>
                          )}
                          {t.modo_atencion === 'presencial_con_turno' && (
                            <button
                              onClick={() => navigate('/gestion/mis-turnos')}
                              className="w-full py-2.5 rounded-xl text-sm font-semibold text-white"
                              style={{ backgroundColor: meta.color }}
                            >
                              Sacar turno
                            </button>
                          )}
                          {t.modo_atencion === 'online' && (
                            <button
                              onClick={() => navigate(`/app/nuevo-tramite?tramite_id=${t.id}`)}
                              className="w-full py-2.5 rounded-xl text-sm font-semibold text-white"
                              style={{ backgroundColor: meta.color }}
                            >
                              Iniciar trámite online
                            </button>
                          )}
                          {t.modo_atencion === 'presencial_sin_turno' && (
                            <p className="text-xs" style={{ color: theme.textSecondary }}>
                              Acercate a la oficina con la documentación — se atiende por orden de llegada.
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
