import { useEffect, useMemo, useState } from 'react';
import { Calendar, Check, X, User } from 'lucide-react';
import { toast } from 'sonner';
import { turnosApi, dependenciasApi } from '../lib/api';
import { useTheme } from '../contexts/ThemeContext';
import { ABMPage, ABMCard } from '../components/ui/ABMPage';
import { ModernSelect, type SelectOption } from '../components/ui/ModernSelect';

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
  notas: string | null;
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
  const [deps, setDeps] = useState<DepItem[]>([]);
  const [depId, setDepId] = useState('');
  const [fecha, setFecha] = useState(hoyISO());
  const [turnos, setTurnos] = useState<TurnoAgenda[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

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
    return turnos.filter((t) => (t.nombre_solicitante || '').toLowerCase().includes(s));
  }, [turnos, search]);

  return (
    <ABMPage
      title="Agenda de turnos"
      searchPlaceholder="Buscar por vecino..."
      searchValue={search}
      onSearchChange={setSearch}
      loading={loading}
      isEmpty={filtrados.length === 0}
      emptyMessage="No hay turnos para ese día"
      extraFilters={
        <div className="flex items-center gap-2">
          <ModernSelect
            value={depId}
            onChange={setDepId}
            options={depOptions}
            placeholder="Dependencia"
            className="min-w-[180px]"
          />
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="px-3 py-2 rounded-lg text-sm"
            style={{ backgroundColor: theme.card, color: theme.text, border: `1px solid ${theme.border}` }}
          />
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
                </div>
                <span
                  className="inline-block mt-0.5 px-2 py-0.5 rounded-full text-xs font-medium"
                  style={{ backgroundColor: (ESTADO_COLOR[t.estado] || theme.primary) + '22', color: ESTADO_COLOR[t.estado] || theme.primary }}
                >
                  {t.estado}
                </span>
              </div>
            </div>
            {t.estado === 'reservado' && (
              <div className="flex items-center gap-2 shrink-0">
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
              </div>
            )}
          </div>
        </ABMCard>
      ))}
    </ABMPage>
  );
}
