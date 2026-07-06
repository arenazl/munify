import { Sparkles, Loader2, Gauge, CalendarOff, CheckCircle2, Clock, AlertTriangle, UserCheck, MapPin, Tag } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { DatePicker } from '../ui/DatePicker';

// ── Contratos con el backend F4 ────────────────────────────────────────────
// GET /reclamos/{id}/sugerencia-asignacion → { sugerencias: SugerenciaAsignacion[] }
export interface SugerenciaAsignacion {
  empleado_id: number;
  empleado_nombre: string;
  categoria_principal: string | null;
  zona: string | null;
  score: number;
  score_porcentaje: number;
  detalles: {
    categoria_match: boolean;
    zona_match: boolean;
    carga_trabajo: number;
    disponibilidad_horas: number;
    proximo_disponible: string | null;
    // El backend agrega este campo SOLO cuando el empleado está ausente hoy.
    ausente?: string | null;
  };
  razon_principal: string;
}

// GET /reclamos/empleado/{id}/disponibilidad/{fecha} (jornada real + bloques)
export interface CandidatoDisponibilidad {
  fecha: string;
  bloques_ocupados: { inicio: string | null; fin: string | null; titulo: string }[];
  proximo_disponible: string; // HH:MM:SS
  hora_fin_jornada: string; // HH:MM:SS
  dia_lleno: boolean;
  carga_dia: number;
  capacidad: number;
  ausente: string | null;
}

interface Props {
  sugerencias: SugerenciaAsignacion[];
  loading: boolean;
  /** Empleado actualmente seleccionado (de empleadoSeleccionadoId "empleado:<id>"). */
  selectedEmpleadoId: number | null;
  onSelect: (empleadoId: number) => void;
  onAutoAsignar: () => void;
  autoAsignando: boolean;
  // Preview de disponibilidad del candidato seleccionado
  disp: CandidatoDisponibilidad | null;
  dispLoading: boolean;
  fecha: string; // YYYY-MM-DD
  onFechaChange: (iso: string) => void;
  /** Cuando el módulo de OT NO está activo, este widget ofrece el botón directo
   *  de asignación (mismo resultado que PUT /reclamos/{id}/empleado). Con OT
   *  activo, la finalización sigue por el combo de orden de trabajo (sin cambios). */
  mostrarBotonAsignar: boolean;
  onAsignar: () => void;
  asignando: boolean;
}

const hhmm = (s?: string | null): string => (s ? s.slice(0, 5) : '');

export function CandidatosAsignacion({
  sugerencias,
  loading,
  selectedEmpleadoId,
  onSelect,
  onAutoAsignar,
  autoAsignando,
  disp,
  dispLoading,
  fecha,
  onFechaChange,
  mostrarBotonAsignar,
  onAsignar,
  asignando,
}: Props) {
  const { theme } = useTheme();
  const hoy = new Date().toISOString().split('T')[0];

  const seleccionado = sugerencias.find((s) => s.empleado_id === selectedEmpleadoId) || null;

  return (
    <div className="space-y-2.5">
      {/* Encabezado + Auto-asignar */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: theme.textSecondary }}>
          Candidatos sugeridos
        </span>
        <button
          type="button"
          onClick={onAutoAsignar}
          disabled={autoAsignando || sugerencias.length === 0}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all hover:scale-105 active:scale-95 disabled:opacity-50 flex-shrink-0"
          style={{
            backgroundColor: `${theme.primary}15`,
            color: theme.primary,
            border: `1px solid ${theme.primary}40`,
          }}
          title="Asigna automáticamente el candidato con mejor match (especialidad + zona + carga)"
        >
          <Sparkles className="h-3.5 w-3.5" />
          {autoAsignando ? 'Asignando…' : 'Auto-asignar'}
        </button>
      </div>

      {/* Estado de carga */}
      {loading && (
        <div className="flex items-center gap-2 py-3 px-1">
          <Loader2 className="h-4 w-4 animate-spin" style={{ color: theme.primary }} />
          <span className="text-sm" style={{ color: theme.textSecondary }}>
            Analizando carga y disponibilidad…
          </span>
        </div>
      )}

      {/* Sin candidatos automáticos */}
      {!loading && sugerencias.length === 0 && (
        <p className="text-xs px-1 py-2" style={{ color: theme.textSecondary }}>
          No hay candidatos sugeridos para este reclamo. Podés elegir de la lista completa más abajo.
        </p>
      )}

      {/* Tarjetas de candidatos (ya vienen ordenadas por score desde el backend) */}
      {!loading && sugerencias.length > 0 && (
        <div className="space-y-1.5">
          {sugerencias.map((s) => {
            const activo = s.empleado_id === selectedEmpleadoId;
            const ausente = !!s.detalles?.ausente;
            const carga = s.detalles?.carga_trabajo ?? 0;
            const pct = Math.max(0, Math.min(100, s.score_porcentaje ?? s.score ?? 0));
            return (
              <button
                key={s.empleado_id}
                type="button"
                onClick={() => onSelect(s.empleado_id)}
                className="w-full text-left rounded-xl px-3 py-2.5 transition-all"
                style={{
                  backgroundColor: activo ? `${theme.primary}12` : theme.backgroundSecondary,
                  border: `1px solid ${activo ? theme.primary : theme.border}`,
                  opacity: ausente && !activo ? 0.72 : 1,
                }}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    {/* Nombre + badge ausente */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold truncate" style={{ color: theme.text }}>
                        {s.empleado_nombre}
                      </span>
                      {ausente && (
                        <span
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium"
                          style={{ backgroundColor: `${theme.textSecondary}20`, color: theme.textSecondary }}
                        >
                          <CalendarOff className="h-3 w-3" />
                          Ausente hoy
                        </span>
                      )}
                    </div>
                    {/* Razón principal */}
                    {s.razon_principal && (
                      <p className="text-[11px] mt-0.5 truncate" style={{ color: theme.textSecondary }}>
                        {s.razon_principal}
                      </p>
                    )}
                    {/* Meta: carga + categoría + zona */}
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <span
                        className="inline-flex items-center gap-1 text-[11px]"
                        style={{ color: theme.textSecondary }}
                        title="Trabajos activos asignados a este empleado (carga real)"
                      >
                        <Gauge className="h-3 w-3" />
                        {carga} {carga === 1 ? 'trabajo' : 'trabajos'}
                      </span>
                      {s.categoria_principal && (
                        <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: theme.textSecondary }}>
                          <Tag className="h-3 w-3" />
                          {s.categoria_principal}
                        </span>
                      )}
                      {s.zona && (
                        <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: theme.textSecondary }}>
                          <MapPin className="h-3 w-3" />
                          {s.zona}
                        </span>
                      )}
                    </div>
                  </div>
                  {/* Medidor de score */}
                  <div className="flex flex-col items-end gap-1 flex-shrink-0 w-16">
                    <span className="text-sm font-bold leading-none" style={{ color: theme.primary }}>
                      {pct}
                      <span className="text-[10px] font-medium" style={{ color: theme.textSecondary }}>
                        {' '}pts
                      </span>
                    </span>
                    <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: theme.border }}>
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: theme.primary }} />
                    </div>
                    <span className="text-[10px]" style={{ color: theme.textSecondary }}>
                      match
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Preview de disponibilidad del candidato seleccionado */}
      {seleccionado && (
        <div
          className="rounded-xl p-3 space-y-2.5 mt-1"
          style={{ backgroundColor: `${theme.primary}08`, border: `1px solid ${theme.primary}30` }}
        >
          <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: theme.textSecondary }}>
            Disponibilidad de {seleccionado.empleado_nombre}
          </p>

          <DatePicker
            label="Día programado"
            value={fecha || hoy}
            minDate={hoy}
            onChange={onFechaChange}
            placeholder="Elegí un día"
          />

          {dispLoading && (
            <div className="flex items-center gap-2 py-1">
              <Loader2 className="h-4 w-4 animate-spin" style={{ color: theme.primary }} />
              <span className="text-xs" style={{ color: theme.textSecondary }}>
                Buscando disponibilidad…
              </span>
            </div>
          )}

          {!dispLoading && disp && (
            <>
              {/* Aviso principal: ausente / día lleno / disponible */}
              {disp.ausente ? (
                <div
                  className="flex items-center gap-2 rounded-lg px-2.5 py-2"
                  style={{ backgroundColor: `${theme.textSecondary}18`, border: `1px solid ${theme.textSecondary}40` }}
                >
                  <CalendarOff className="h-4 w-4 flex-shrink-0" style={{ color: theme.textSecondary }} />
                  <span className="text-xs" style={{ color: theme.text }}>
                    Ausente ese día{typeof disp.ausente === 'string' ? ` (${disp.ausente})` : ''}. Elegí otro día u otro candidato.
                  </span>
                </div>
              ) : disp.dia_lleno ? (
                <div
                  className="flex items-center gap-2 rounded-lg px-2.5 py-2"
                  style={{ backgroundColor: `${theme.primary}14`, border: `1px solid ${theme.primary}45` }}
                >
                  <AlertTriangle className="h-4 w-4 flex-shrink-0" style={{ color: theme.primary }} />
                  <span className="text-xs" style={{ color: theme.text }}>
                    Día lleno — {disp.carga_dia}/{disp.capacidad} trabajos. Probá otro día.
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 flex-shrink-0" style={{ color: theme.primary }} />
                  <span className="text-xs" style={{ color: theme.text }}>
                    Disponible · {disp.carga_dia}/{disp.capacidad} trabajos ese día · desde {hhmm(disp.proximo_disponible)} hs
                  </span>
                </div>
              )}

              {/* Franjas ya ocupadas ese día */}
              {disp.bloques_ocupados.length > 0 && (
                <div className="rounded-lg px-2.5 py-2" style={{ backgroundColor: theme.backgroundSecondary }}>
                  <p className="flex items-center gap-1 text-[11px] font-medium mb-1" style={{ color: theme.textSecondary }}>
                    <Clock className="h-3 w-3" />
                    Ocupado ese día
                  </p>
                  <div className="space-y-0.5">
                    {disp.bloques_ocupados.map((b, idx) => (
                      <div key={idx} className="text-[11px] pl-4" style={{ color: theme.textSecondary }}>
                        {hhmm(b.inicio)}{b.fin ? ` - ${hhmm(b.fin)}` : ''}{b.titulo ? `: ${b.titulo}` : ''}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Botón de asignación directa (solo cuando NO se usa el circuito de OT) */}
          {mostrarBotonAsignar && (
            <button
              type="button"
              onClick={onAsignar}
              disabled={asignando}
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90 active:scale-[0.99] disabled:opacity-50"
              style={{ backgroundColor: theme.primary, color: theme.primaryText }}
            >
              {asignando ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4" />}
              {asignando ? 'Asignando…' : `Asignar a ${seleccionado.empleado_nombre.split(' ')[0]}`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
