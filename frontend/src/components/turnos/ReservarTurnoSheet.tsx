import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { turnosApi, tramitesApi } from '../../lib/api';
import { useTheme } from '../../contexts/ThemeContext';
import { Sheet } from '../ui/Sheet';
import { ModernSelect, type SelectOption } from '../ui/ModernSelect';

interface SolicitudLite {
  id: number;
  numero?: string;
  numero_tramite?: string;
  nombre_tramite?: string;
  tramite_nombre?: string;
  estado?: string;
}

interface Slot {
  fecha_hora: string;
  disponible: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onReservado: () => void;
}

function diaLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
}

function hhmm(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

function nombreSolicitud(s: SolicitudLite): string {
  return s.nombre_tramite || s.tramite_nombre || s.numero_tramite || s.numero || `Solicitud ${s.id}`;
}

export default function ReservarTurnoSheet({ open, onClose, onReservado }: Props) {
  const { theme } = useTheme();
  const [solicitudes, setSolicitudes] = useState<SolicitudLite[]>([]);
  const [solId, setSolId] = useState('');
  const [slots, setSlots] = useState<Slot[]>([]);
  const [slotSel, setSlotSel] = useState('');
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [reservando, setReservando] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSolId('');
    setSlots([]);
    setSlotSel('');
    tramitesApi
      .getMisSolicitudes()
      .then((res) => setSolicitudes((res.data as SolicitudLite[]) || []))
      .catch(() => toast.error('No se pudieron cargar tus trámites'));
  }, [open]);

  useEffect(() => {
    if (!solId) {
      setSlots([]);
      return;
    }
    setLoadingSlots(true);
    setSlotSel('');
    turnosApi
      .disponibilidad({ solicitud_id: Number(solId) })
      .then((res) => {
        const data = res.data as { slots?: Slot[] };
        setSlots((data.slots || []).filter((s) => s.disponible));
      })
      .catch(() => toast.error('Esa solicitud no tiene turnos disponibles'))
      .finally(() => setLoadingSlots(false));
  }, [solId]);

  const porDia = useMemo(() => {
    const m: Record<string, Slot[]> = {};
    slots.forEach((s) => {
      const d = s.fecha_hora.slice(0, 10);
      (m[d] = m[d] || []).push(s);
    });
    return m;
  }, [slots]);

  const opciones: SelectOption[] = useMemo(
    () => solicitudes.map((s) => ({ value: String(s.id), label: nombreSolicitud(s) })),
    [solicitudes],
  );

  const reservar = async () => {
    if (!solId || !slotSel) return;
    try {
      setReservando(true);
      await turnosApi.reservar({ solicitud_id: Number(solId), fecha_hora: slotSel });
      toast.success('Turno reservado');
      onReservado();
      onClose();
    } catch {
      toast.error('No se pudo reservar el turno (¿ya está tomado?)');
    } finally {
      setReservando(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Reservar turno"
      description="Elegí el trámite y un horario disponible"
      stickyFooter={
        <button
          onClick={reservar}
          disabled={!solId || !slotSel || reservando}
          className="w-full py-2.5 rounded-lg font-medium text-white disabled:opacity-60"
          style={{ backgroundColor: theme.primary }}
        >
          {reservando ? 'Reservando...' : 'Confirmar turno'}
        </button>
      }
    >
      <div className="space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase mb-1" style={{ color: theme.textSecondary }}>Trámite</p>
          {opciones.length === 0 ? (
            <p className="text-sm" style={{ color: theme.textSecondary }}>No tenés trámites para reservar turno.</p>
          ) : (
            <ModernSelect value={solId} onChange={setSolId} options={opciones} placeholder="Elegí un trámite" searchable />
          )}
        </div>

        {solId && (
          <div>
            <p className="text-xs font-semibold uppercase mb-2" style={{ color: theme.textSecondary }}>Horarios disponibles</p>
            {loadingSlots ? (
              <p className="text-sm" style={{ color: theme.textSecondary }}>Buscando turnos...</p>
            ) : slots.length === 0 ? (
              <p className="text-sm" style={{ color: theme.textSecondary }}>No hay turnos disponibles próximamente.</p>
            ) : (
              <div className="space-y-3">
                {Object.entries(porDia).map(([dia, items]) => (
                  <div key={dia}>
                    <p className="text-sm font-medium capitalize mb-1.5" style={{ color: theme.text }}>{diaLabel(dia)}</p>
                    <div className="flex flex-wrap gap-2">
                      {items.map((s) => {
                        const sel = slotSel === s.fecha_hora;
                        return (
                          <button
                            key={s.fecha_hora}
                            onClick={() => setSlotSel(s.fecha_hora)}
                            className="px-3 py-1.5 rounded-lg text-sm font-medium"
                            style={
                              sel
                                ? { backgroundColor: theme.primary, color: theme.primaryText }
                                : { backgroundColor: theme.backgroundSecondary, color: theme.text, border: `1px solid ${theme.border}` }
                            }
                          >
                            {hhmm(s.fecha_hora)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Sheet>
  );
}
