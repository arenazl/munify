import { useEffect, useMemo, useState } from 'react';
import { Calendar, Check, X, User, CalendarClock, UserX, FileText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { turnosApi, dependenciasApi } from '../lib/api';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { ABMPage, ABMCard } from '../components/ui/ABMPage';
import type { KpiSpec } from '../components/ui/KpiCard';
import { ModernSelect, type SelectOption } from '../components/ui/ModernSelect';
import { DatePicker } from '../components/ui/DatePicker';

interface DepItem {
  id: number;
  nombre?: string;
}

interface TurnoAgenda {
  id: number;
  fecha_hora: string;
  estado: string;
  duracion_min: number;
  dependencia_nombre: string | null;
  nombre_solicitante: string | null;
  dni_solicitante: string | null;
  tramite_nombre: string | null;
  codigo: string | null;
  usuario_id: number | null;
  tramite_id: number | null;
  solicitud_id: number | null;
  notas: string | null;
}

interface StatsTurnero {
  total: number;
  por_estado: Record<string, number>;
  ausentismo_pct: number;
}

const ESTADO_COLOR: Record<string, string> = {
  reservado: '#3b82f6',
  cumplido: '#10b981',
  cancelado: '#ef4444',
  ausente: '#f59e0b',
};

function hhmm(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function AgendaTurnos() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [deps, setDeps] = useState<DepItem[]>([]);
  const [depId, setDepId] = useState('');
  const [fecha, setFecha] = useState(hoyISO());
  const [turnos, setTurnos] = useState<TurnoAgenda[]>([]);
  const [stats, setStats] = useState<StatsTurnero | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  // Reportes del turnero (últimos 30 días de la dependencia elegida)
  useEffect(() => {
    if (!depId) return;
    turnosApi.stats({ dependencia_id: Number(depId), dias: 30 })
      .then(res => setStats(res.data as StatsTurnero))
      .catch(() => setStats(null));
  }, [depId]);

  // Check-in → abrir expediente: el operador atiende el turno y levanta el
  // trámite pre-cargado actuando por el vecino (mismo contexto del Mostrador)
  const abrirExpediente = (t: TurnoAgenda) => {
    if (!t.usuario_id || !t.tramite_id) return;
    const [nombre, ...resto] = (t.nombre_solicitante || '').split(' ');
    sessionStorage.setItem('mostrador_ctx', JSON.stringify({
      user_id: t.usuario_id,
      dni: t.dni_solicitante,
      nombre: nombre || null,
      apellido: resto.join(' ') || null,
      email: null,
      telefono: null,
      kyc_session_id: null,
      operador_id: user?.id ?? 0,
      operador_nombre: `${user?.nombre ?? ''} ${user?.apellido ?? ''}`.trim(),
    }));
    navigate(`/gestion/crear-tramite?tramite_id=${t.tramite_id}&actuando_como=${t.usuario_id}`);
  };

  useEffect(() => {
    dependenciasApi
      .getMunicipio({ activo: true })
      .then((res) => {
        const list = (res.data as DepItem[]) || [];
        setDeps(list);
        if (list.length && !depId) setDepId(String(list[0].id));
      })
      .catch(() => toast.error('No se pudieron cargar las dependencias'));
  }, []);

  useEffect(() => {
    if (depId) fetchTurnos();
  }, [depId, fecha]);

  const fetchTurnos = async () => {
    try {
      setLoading(true);
      const res = await turnosApi.agenda({ dependencia_id: Number(depId), fecha });
      setTurnos((res.data as TurnoAgenda[]) || []);
    } catch {
      toast.error('No se pudo cargar la agenda');
    } finally {
      setLoading(false);
    }
  };

  const marcar = async (id: number, estado: string) => {
    try {
      await turnosApi.marcarEstado(id, estado);
      toast.success(estado === 'cumplido' ? 'Marcado presente' : 'Marcado ausente');
      await fetchTurnos();
    } catch {
      toast.error('No se pudo actualizar el turno');
    }
  };

  const depOptions: SelectOption[] = useMemo(
    () => deps.map((d) => ({ value: String(d.id), label: d.nombre || `Dependencia ${d.id}` })),
    [deps],
  );

  const filtrados = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return turnos;
    // Check-in: busca por nombre, DNI o código TRN ("TRN-00012" o "12")
    const soloDigitos = s.replace(/\D/g, '');
    return turnos.filter((t) =>
      (t.nombre_solicitante || '').toLowerCase().includes(s)
      || (soloDigitos && (t.dni_solicitante || '').replace(/\D/g, '').includes(soloDigitos))
      || (soloDigitos && String(t.id) === String(Number(soloDigitos)))
      || (t.codigo || '').toLowerCase().includes(s)
    );
  }, [turnos, search]);

  const kpisSpec: KpiSpec[] = useMemo(() => {
    if (!stats) return [];
    return [
      { label: 'Turnos (30 días)', value: `${stats.total}`, icon: CalendarClock, color: '#3b82f6' },
      { label: 'Cumplidos', value: `${stats.por_estado?.cumplido ?? 0}`, icon: Check, color: '#10b981' },
      { label: 'Ausentes', value: `${stats.por_estado?.ausente ?? 0}`, icon: UserX, color: '#f59e0b' },
      { label: 'Ausentismo', value: `${stats.ausentismo_pct}%`, icon: X, color: stats.ausentismo_pct > 25 ? '#ef4444' : '#8b5cf6', footnote: 'sobre atendibles' },
    ];
  }, [stats]);

  return (
    <ABMPage
      title="Agenda de turnos"
      searchPlaceholder="Buscar por nombre, DNI o código TRN..."
      searchValue={search}
      onSearchChange={setSearch}
      loading={loading}
      isEmpty={filtrados.length === 0}
      emptyMessage="No hay turnos para ese día"
      kpis={kpisSpec}
      extraFilters={
        <div className="flex items-center gap-2">
          <ModernSelect
            value={depId}
            onChange={setDepId}
            options={depOptions}
            placeholder="Dependencia"
            className="min-w-[180px]"
          />
          <DatePicker value={fecha} onChange={setFecha} />
        </div>
      }
    >
      {filtrados.map((t, i) => (
        <ABMCard key={t.id} index={i}>
          <div className="flex items-center justify-between gap-3 p-1">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className="px-2.5 py-1 rounded-lg font-semibold text-sm shrink-0"
                style={{ backgroundColor: theme.backgroundSecondary, color: theme.text }}
              >
                {hhmm(t.fecha_hora)}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5" style={{ color: theme.text }}>
                  <User className="h-3.5 w-3.5 shrink-0" style={{ color: theme.textSecondary }} />
                  <span className="font-medium truncate">{t.nombre_solicitante || 'Vecino'}</span>
                  {t.dni_solicitante && (
                    <span className="text-xs shrink-0" style={{ color: theme.textSecondary }}>
                      DNI {t.dni_solicitante}
                    </span>
                  )}
                </div>
                {t.tramite_nombre && (
                  <div className="text-xs truncate mt-0.5" style={{ color: theme.textSecondary }}>
                    {t.tramite_nombre}
                  </div>
                )}
                <span
                  className="inline-block mt-0.5 px-2 py-0.5 rounded-full text-xs font-medium"
                  style={{ backgroundColor: (ESTADO_COLOR[t.estado] || theme.primary) + '22', color: ESTADO_COLOR[t.estado] || theme.primary }}
                >
                  {t.estado}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {t.estado === 'reservado' && (
                <>
                  <button
                    onClick={() => marcar(t.id, 'cumplido')}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-white"
                    style={{ backgroundColor: ESTADO_COLOR.cumplido }}
                  >
                    <Check className="h-3.5 w-3.5" /> Presente
                  </button>
                  <button
                    onClick={() => marcar(t.id, 'ausente')}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium"
                    style={{ backgroundColor: ESTADO_COLOR.ausente + '22', color: ESTADO_COLOR.ausente }}
                  >
                    <X className="h-3.5 w-3.5" /> Ausente
                  </button>
                </>
              )}
              {/* Turno atendible sin expediente: abrirlo pre-cargado desde el turno */}
              {(t.estado === 'reservado' || t.estado === 'cumplido') && !t.solicitud_id
                && t.tramite_id && t.usuario_id && (
                <button
                  onClick={() => abrirExpediente(t)}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium"
                  style={{ backgroundColor: `${theme.primary}18`, color: theme.primary, border: `1px solid ${theme.primary}40` }}
                  title="Levantar el expediente del trámite actuando por este vecino"
                >
                  <FileText className="h-3.5 w-3.5" /> Expediente
                </button>
              )}
            </div>
          </div>
        </ABMCard>
      ))}
    </ABMPage>
  );
}
