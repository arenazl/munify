import { useEffect, useMemo, useState } from 'react';
import { Calendar, Building2 } from 'lucide-react';
import { toast } from 'sonner';
import { turnosApi } from '../lib/api';
import { useTheme } from '../contexts/ThemeContext';
import { ABMPage, ABMCard } from '../components/ui/ABMPage';
import { Sheet } from '../components/ui/Sheet';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { PullToRefresh } from '../components/ui/PullToRefresh';
import ReservarTurnoSheet from '../components/turnos/ReservarTurnoSheet';

interface Turno {
  id: number;
  solicitud_id: number | null;
  municipio_dependencia_id: number;
  fecha_hora: string;
  duracion_min: number;
  estado: string;
  dependencia_nombre: string | null;
  notas: string | null;
  motivo_tipo: string | null;
  nombre_solicitante: string | null;
}

const ESTADO_LABEL: Record<string, string> = {
  reservado: 'Reservado',
  cumplido: 'Cumplido',
  cancelado: 'Cancelado',
  ausente: 'Ausente',
};

// El theme no expone colores de estado; los de turno viven acá (single source).
const ESTADO_COLOR: Record<string, string> = {
  reservado: '#3b82f6',
  cumplido: '#10b981',
  cancelado: '#ef4444',
  ausente: '#f59e0b',
};

function formatFechaHora(iso: string): string {
  const d = new Date(iso);
  const fecha = d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
  const hora = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  return `${fecha} · ${hora}`;
}

export default function MisTurnos() {
  const { theme } = useTheme();
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Turno | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [reservaOpen, setReservaOpen] = useState(false);

  // Deep-link del wizard: /gestion/mis-turnos?reservar_solicitud=N abre el
  // sheet con esa solicitud preseleccionada (turno-first tras crear trámite)
  const [solicitudInicial, setSolicitudInicial] = useState<number | undefined>(undefined);

  useEffect(() => {
    fetchData();
    const params = new URLSearchParams(window.location.search);
    const rid = params.get('reservar_solicitud');
    if (rid) {
      setSolicitudInicial(Number(rid));
      setReservaOpen(true);
      window.history.replaceState({}, '', window.location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await turnosApi.misTurnos();
      setTurnos(res.data as Turno[]);
    } catch {
      toast.error('No se pudieron cargar tus turnos');
    } finally {
      setLoading(false);
    }
  };

  const filtrados = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return turnos;
    return turnos.filter(
      (t) =>
        (t.dependencia_nombre || '').toLowerCase().includes(s) ||
        formatFechaHora(t.fecha_hora).toLowerCase().includes(s),
    );
  }, [turnos, search]);

  const colorEstado = (estado: string): string => ESTADO_COLOR[estado] || theme.primary;

  const handleCancelar = async () => {
    if (!selected) return;
    try {
      setCancelando(true);
      await turnosApi.cancelar(selected.id);
      toast.success('Turno cancelado');
      setConfirmCancel(false);
      setSelected(null);
      await fetchData();
    } catch {
      toast.error('No se pudo cancelar el turno');
    } finally {
      setCancelando(false);
    }
  };

  return (
    <>
      <PullToRefresh onRefresh={fetchData}>
        <ABMPage
          title="Mis Turnos"
          searchPlaceholder="Buscar por dependencia o fecha..."
          searchValue={search}
          onSearchChange={setSearch}
          loading={loading}
          isEmpty={filtrados.length === 0}
          emptyMessage="No tenés turnos reservados"
          buttonLabel="Reservar turno"
          onAdd={() => setReservaOpen(true)}
        >
          {filtrados.map((t, i) => (
            <ABMCard key={t.id} index={i} onClick={() => setSelected(t)}>
              <div className="flex items-start justify-between gap-3 p-1">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 mb-1" style={{ color: theme.text }}>
                    <Calendar className="h-4 w-4 shrink-0" style={{ color: theme.primary }} />
                    <span className="font-medium truncate">{formatFechaHora(t.fecha_hora)}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-sm" style={{ color: theme.textSecondary }}>
                    <Building2 className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{t.dependencia_nombre || 'Dependencia'}</span>
                  </div>
                </div>
                <span
                  className="shrink-0 px-2 py-0.5 rounded-full text-xs font-medium"
                  style={{ backgroundColor: colorEstado(t.estado) + '22', color: colorEstado(t.estado) }}
                >
                  {ESTADO_LABEL[t.estado] || t.estado}
                </span>
              </div>
            </ABMCard>
          ))}
        </ABMPage>
      </PullToRefresh>

      <Sheet
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected ? `Turno #${selected.id}` : ''}
        stickyFooter={
          selected && selected.estado === 'reservado' ? (
            <button
              onClick={() => setConfirmCancel(true)}
              className="w-full py-2.5 rounded-lg font-medium text-white"
              style={{ backgroundColor: ESTADO_COLOR.cancelado }}
            >
              Cancelar turno
            </button>
          ) : undefined
        }
      >
        {selected && (
          <div className="space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase" style={{ color: theme.textSecondary }}>Cuándo</p>
              <p style={{ color: theme.text }}>{formatFechaHora(selected.fecha_hora)}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase" style={{ color: theme.textSecondary }}>Dónde</p>
              <p style={{ color: theme.text }}>{selected.dependencia_nombre || 'Dependencia'}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase" style={{ color: theme.textSecondary }}>Estado</p>
              <span
                className="inline-block px-2 py-0.5 rounded-full text-xs font-medium"
                style={{ backgroundColor: colorEstado(selected.estado) + '22', color: colorEstado(selected.estado) }}
              >
                {ESTADO_LABEL[selected.estado] || selected.estado}
              </span>
            </div>
            {selected.notas && (
              <div>
                <p className="text-xs font-semibold uppercase" style={{ color: theme.textSecondary }}>Notas</p>
                <p style={{ color: theme.text }}>{selected.notas}</p>
              </div>
            )}
          </div>
        )}
      </Sheet>

      <ConfirmModal
        isOpen={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        onConfirm={handleCancelar}
        title="Cancelar turno"
        message={selected ? `¿Seguro que cancelás el turno del ${formatFechaHora(selected.fecha_hora)}?` : ''}
        confirmText="Cancelar turno"
        cancelText="Volver"
        variant="danger"
        loading={cancelando}
      />

      <ReservarTurnoSheet
        open={reservaOpen}
        onClose={() => { setReservaOpen(false); setSolicitudInicial(undefined); }}
        onReservado={fetchData}
        solicitudInicial={solicitudInicial}
      />
    </>
  );
}
