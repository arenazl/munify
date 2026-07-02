import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { FileCheck, ShieldCheck } from 'lucide-react';
import { turnosApi, tramitesApi } from '../../lib/api';
import { useTheme } from '../../contexts/ThemeContext';
import { Sheet } from '../ui/Sheet';
import { ModernSelect, type SelectOption } from '../ui/ModernSelect';

/**
 * Reserva de turno TURNO-FIRST (fase C del turnero consolidado):
 * el camino principal es elegir un trámite presencial del CATÁLOGO
 * (sin expediente previo), ver sus requisitos por adelantado y confirmar
 * un horario. Si el trámite exige validación biométrica y el vecino no
 * la tiene, el backend devuelve 403 kyc_insuficiente y se le explica.
 *
 * El camino histórico (turno sobre una solicitud ya iniciada) se mantiene
 * como pestaña secundaria.
 */

interface SolicitudLite {
  id: number;
  numero?: string;
  numero_tramite?: string;
  nombre_tramite?: string;
  tramite_nombre?: string;
  estado?: string;
}

interface TramiteCatalogo {
  id: number;
  nombre: string;
  modo_atencion?: string;
  duracion_turno_min?: number;
  requiere_kyc?: boolean;
}

interface DocRequerido {
  id: number;
  nombre: string;
  obligatorio: boolean;
}

interface Slot {
  fecha_hora: string;
  disponible: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onReservado: () => void;
  /** Mostrador: staff reservando en nombre de un vecino ya identificado */
  actuandoComoUserId?: number;
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

type Modo = 'tramite' | 'solicitud';

export default function ReservarTurnoSheet({ open, onClose, onReservado, actuandoComoUserId }: Props) {
  const { theme } = useTheme();
  const [modo, setModo] = useState<Modo>('tramite');

  // Camino principal: trámite del catálogo
  const [tramites, setTramites] = useState<TramiteCatalogo[]>([]);
  const [tramiteId, setTramiteId] = useState('');
  const [requisitos, setRequisitos] = useState<DocRequerido[]>([]);

  // Camino secundario: solicitud existente
  const [solicitudes, setSolicitudes] = useState<SolicitudLite[]>([]);
  const [solId, setSolId] = useState('');

  const [slots, setSlots] = useState<Slot[]>([]);
  const [slotSel, setSlotSel] = useState('');
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [reservando, setReservando] = useState(false);
  const [kycError, setKycError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setModo('tramite');
    setTramiteId('');
    setSolId('');
    setSlots([]);
    setSlotSel('');
    setRequisitos([]);
    setKycError(null);
    // Catálogo: solo trámites presenciales con turno
    tramitesApi
      .getAll({ activo: true })
      .then((res) => {
        const todos = (res.data as TramiteCatalogo[]) || [];
        setTramites(todos.filter(t => t.modo_atencion === 'presencial_con_turno'));
      })
      .catch(() => toast.error('No se pudo cargar el catálogo de trámites'));
    tramitesApi
      .getMisSolicitudes()
      .then((res) => setSolicitudes((res.data as SolicitudLite[]) || []))
      .catch(() => setSolicitudes([]));
  }, [open]);

  // Requisitos del trámite elegido (por adelantado: qué tiene que llevar)
  useEffect(() => {
    setRequisitos([]);
    if (!tramiteId) return;
    tramitesApi
      .getOne(Number(tramiteId))
      .then((res) => {
        const t = res.data as { documentos_requeridos?: DocRequerido[] };
        setRequisitos(t.documentos_requeridos || []);
      })
      .catch(() => setRequisitos([]));
  }, [tramiteId]);

  // Slots según el camino activo
  useEffect(() => {
    const params =
      modo === 'tramite' && tramiteId ? { tramite_id: Number(tramiteId) }
      : modo === 'solicitud' && solId ? { solicitud_id: Number(solId) }
      : null;
    if (!params) {
      setSlots([]);
      return;
    }
    setLoadingSlots(true);
    setSlotSel('');
    setKycError(null);
    turnosApi
      .disponibilidad(params)
      .then((res) => {
        const data = res.data as { slots?: Slot[] };
        setSlots((data.slots || []).filter((s) => s.disponible));
      })
      .catch((e: unknown) => {
        const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
        setSlots([]);
        toast.error(typeof detail === 'string' ? detail : 'No hay turnos disponibles');
      })
      .finally(() => setLoadingSlots(false));
  }, [modo, tramiteId, solId]);

  const porDia = useMemo(() => {
    const m: Record<string, Slot[]> = {};
    slots.forEach((s) => {
      const d = s.fecha_hora.slice(0, 10);
      (m[d] = m[d] || []).push(s);
    });
    return m;
  }, [slots]);

  const opcionesTramite: SelectOption[] = useMemo(
    () => tramites.map((t) => ({ value: String(t.id), label: t.nombre })),
    [tramites],
  );
  const opcionesSolicitud: SelectOption[] = useMemo(
    () => solicitudes.map((s) => ({ value: String(s.id), label: nombreSolicitud(s) })),
    [solicitudes],
  );

  const listo = (modo === 'tramite' ? !!tramiteId : !!solId) && !!slotSel;

  const reservar = async () => {
    if (!listo) return;
    setKycError(null);
    try {
      setReservando(true);
      if (modo === 'tramite') {
        await turnosApi.reservarDirecto({
          tramite_id: Number(tramiteId),
          fecha_hora: slotSel,
          ...(actuandoComoUserId ? { actuando_como_user_id: actuandoComoUserId } : {}),
        });
      } else {
        await turnosApi.reservar({ solicitud_id: Number(solId), fecha_hora: slotSel });
      }
      toast.success('Turno reservado');
      onReservado();
      onClose();
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: { code?: string; message?: string } | string } } })
        ?.response?.data?.detail;
      if (typeof detail === 'object' && detail?.code === 'kyc_insuficiente') {
        setKycError(detail.message || 'Este trámite requiere validar tu identidad.');
      } else {
        toast.error(typeof detail === 'string' ? detail : 'No se pudo reservar el turno (¿ya está tomado?)');
      }
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
          disabled={!listo || reservando}
          className="w-full py-2.5 rounded-lg font-medium text-white disabled:opacity-60"
          style={{ backgroundColor: theme.primary }}
        >
          {reservando ? 'Reservando...' : 'Confirmar turno'}
        </button>
      }
    >
      <div className="space-y-4">
        {/* Selector de camino: catálogo (principal) vs mis solicitudes */}
        {solicitudes.length > 0 && (
          <div className="flex gap-2">
            {([['tramite', 'Nuevo turno'], ['solicitud', 'Para un trámite ya iniciado']] as [Modo, string][]).map(([m, label]) => (
              <button
                key={m}
                onClick={() => { setModo(m); setSlotSel(''); setKycError(null); }}
                className="px-3 py-1.5 rounded-lg text-xs font-medium"
                style={
                  modo === m
                    ? { backgroundColor: theme.primary, color: theme.primaryText }
                    : { backgroundColor: theme.backgroundSecondary, color: theme.textSecondary, border: `1px solid ${theme.border}` }
                }
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {modo === 'tramite' ? (
          <div>
            <p className="text-xs font-semibold uppercase mb-1" style={{ color: theme.textSecondary }}>Trámite</p>
            {opcionesTramite.length === 0 ? (
              <p className="text-sm" style={{ color: theme.textSecondary }}>
                Este municipio todavía no habilitó trámites con turno online.
              </p>
            ) : (
              <ModernSelect value={tramiteId} onChange={setTramiteId} options={opcionesTramite} placeholder="Elegí un trámite" searchable />
            )}
          </div>
        ) : (
          <div>
            <p className="text-xs font-semibold uppercase mb-1" style={{ color: theme.textSecondary }}>Trámite iniciado</p>
            <ModernSelect value={solId} onChange={setSolId} options={opcionesSolicitud} placeholder="Elegí una solicitud" searchable />
          </div>
        )}

        {/* Requisitos por adelantado: qué llevar el día del turno */}
        {modo === 'tramite' && tramiteId && requisitos.length > 0 && (
          <div
            className="rounded-xl p-3"
            style={{ backgroundColor: `${theme.primary}08`, border: `1px solid ${theme.primary}25` }}
          >
            <p className="text-xs font-semibold uppercase mb-1.5 flex items-center gap-1.5" style={{ color: theme.primary }}>
              <FileCheck className="h-3.5 w-3.5" />
              Qué tenés que llevar
            </p>
            <ul className="space-y-1">
              {requisitos.map((d) => (
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

        {/* Identidad insuficiente para este trámite */}
        {kycError && (
          <div
            className="rounded-xl p-3 flex items-start gap-2"
            style={{ backgroundColor: '#f59e0b15', border: '1px solid #f59e0b50' }}
          >
            <ShieldCheck className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: '#d97706' }} />
            <div>
              <p className="text-sm font-medium" style={{ color: theme.text }}>{kycError}</p>
              <p className="text-xs mt-1" style={{ color: theme.textSecondary }}>
                Podés validar tu identidad (DNI + selfie) desde tu perfil, o directamente
                en el mostrador del municipio en un minuto.
              </p>
            </div>
          </div>
        )}

        {(modo === 'tramite' ? tramiteId : solId) && (
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
