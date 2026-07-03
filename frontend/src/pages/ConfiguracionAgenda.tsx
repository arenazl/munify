import { useEffect, useMemo, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Clock, Trash2, Plus, Save, Copy, CalendarClock, PartyPopper } from 'lucide-react';
import { toast } from 'sonner';
import { agendaApi, dependenciasApi } from '../lib/api';
import { useTheme } from '../contexts/ThemeContext';
import { ModernSelect, type SelectOption } from '../components/ui/ModernSelect';
import { Sheet } from '../components/ui/Sheet';
import { StickyPageHeader } from '../components/ui/StickyPageHeader';
import { ToggleSwitch } from '../components/ui/SectionHeader';

interface DepItem {
  id: number;
  nombre?: string;
}

interface DiaConfig {
  dia_semana: number;
  hora_inicio: string;
  hora_fin: string;
  cupo_max_por_slot: number;
  activo: boolean;
}

interface Excepcion {
  id: number;
  fecha: string;
  tipo: string;
  motivo: string | null;
}

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const DIAS_CORTO = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

function defaultDias(): DiaConfig[] {
  return DIAS.map((_, i) => ({
    dia_semana: i,
    hora_inicio: '08:30',
    hora_fin: '13:00',
    cupo_max_por_slot: 1,
    activo: i <= 4,
  }));
}

function hhmm(t: string): string {
  return (t || '').slice(0, 5);
}

export default function ConfiguracionAgenda() {
  const { theme } = useTheme();
  const [searchParams] = useSearchParams();
  const [deps, setDeps] = useState<DepItem[]>([]);
  const [depId, setDepId] = useState('');
  const [dias, setDias] = useState<DiaConfig[]>(defaultDias());
  const [excepciones, setExcepciones] = useState<Excepcion[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [nuevaFecha, setNuevaFecha] = useState('');
  const [nuevoTipo, setNuevoTipo] = useState('cierre');
  const [nuevoMotivo, setNuevoMotivo] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    dependenciasApi
      .getMunicipio({ activo: true })
      .then((res) => {
        const list = (res.data as DepItem[]) || [];
        setDeps(list);
        const desdeUrl = searchParams.get('dependencia_id');
        if (desdeUrl && list.some((d) => String(d.id) === desdeUrl)) {
          setDepId(desdeUrl);
        } else if (list.length) {
          setDepId(String(list[0].id));
        }
      })
      .catch(() => toast.error('No se pudieron cargar las dependencias'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (depId) cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depId]);

  const cargar = async () => {
    try {
      const [cfg, exc] = await Promise.all([
        agendaApi.getConfig(Number(depId)),
        agendaApi.getExcepciones(Number(depId)),
      ]);
      const filas = (cfg.data as DiaConfig[]) || [];
      const base = defaultDias();
      if (filas.length) {
        const byDia = new Map(filas.map((f) => [f.dia_semana, f]));
        base.forEach((d, i) => {
          const f = byDia.get(d.dia_semana);
          if (f) {
            base[i] = {
              dia_semana: d.dia_semana,
              hora_inicio: hhmm(f.hora_inicio),
              hora_fin: hhmm(f.hora_fin),
              cupo_max_por_slot: f.cupo_max_por_slot || 1,
              activo: true,
            };
          } else {
            base[i] = { ...d, activo: false };
          }
        });
      }
      setDias(base);
      setExcepciones((exc.data as Excepcion[]) || []);
    } catch {
      toast.error('No se pudo cargar la configuración');
    }
  };

  const setDia = (i: number, patch: Partial<DiaConfig>) => {
    setDias((prev) => prev.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));
  };

  const copiarLunesAHabiles = () => {
    const lunes = dias[0];
    setDias((prev) =>
      prev.map((d, i) =>
        i >= 1 && i <= 4
          ? { ...d, hora_inicio: lunes.hora_inicio, hora_fin: lunes.hora_fin, cupo_max_por_slot: lunes.cupo_max_por_slot, activo: true }
          : d,
      ),
    );
    toast.success('Horario de Lunes copiado a Martes–Viernes');
  };

  const guardar = async () => {
    try {
      setGuardando(true);
      const activos = dias.filter((d) => d.activo);
      for (const d of activos) {
        if (d.hora_inicio >= d.hora_fin) {
          toast.error(`${DIAS[d.dia_semana]}: la hora de inicio debe ser menor a la de fin`);
          setGuardando(false);
          return;
        }
      }
      await agendaApi.saveConfig(Number(depId), activos);
      toast.success('Horarios guardados');
    } catch {
      toast.error('No se pudo guardar');
    } finally {
      setGuardando(false);
    }
  };

  const agregarExcepcion = async () => {
    if (!nuevaFecha) {
      toast.error('Elegí una fecha');
      return;
    }
    try {
      await agendaApi.crearExcepcion({
        municipio_dependencia_id: Number(depId),
        fecha: nuevaFecha,
        tipo: nuevoTipo,
        motivo: nuevoMotivo || undefined,
      });
      toast.success(nuevoTipo === 'cierre' ? 'Feriado agregado' : 'Apertura especial agregada');
      setSheetOpen(false);
      setNuevaFecha('');
      setNuevoMotivo('');
      cargar();
    } catch {
      toast.error('No se pudo agregar');
    }
  };

  const borrarExcepcion = async (id: number) => {
    try {
      await agendaApi.borrarExcepcion(id);
      toast.success('Eliminado');
      cargar();
    } catch {
      toast.error('No se pudo borrar');
    }
  };

  const depOptions: SelectOption[] = useMemo(
    () => deps.map((d) => ({ value: String(d.id), label: d.nombre || `Dependencia ${d.id}` })),
    [deps],
  );

  const excepcionesFiltradas = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return excepciones;
    return excepciones.filter(
      (e) => (e.motivo || '').toLowerCase().includes(s) || e.fecha.includes(s),
    );
  }, [excepciones, search]);

  const inputStyle = {
    backgroundColor: theme.card,
    color: theme.text,
    border: `1px solid ${theme.border}`,
  };

  return (
    <div>
      <StickyPageHeader
        icon={<Clock className="h-5 w-5" />}
        title="Horarios"
        searchPlaceholder="Buscar feriado por motivo o fecha..."
        searchValue={search}
        onSearchChange={setSearch}
        buttonLabel="Agregar feriado"
        onButtonClick={() => {
          setNuevoTipo('cierre');
          setSheetOpen(true);
        }}
        filterPanel={
          <div className="flex items-center gap-2 flex-wrap">
            <div className="min-w-[220px]">
              <ModernSelect value={depId} onChange={setDepId} options={depOptions} placeholder="Dependencia" />
            </div>
            {depId && (
              <Link
                to={`/gestion/agenda-turnos?dependencia_id=${depId}`}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors"
                style={{ backgroundColor: `${theme.primary}15`, color: theme.primary, border: `1px solid ${theme.primary}40` }}
              >
                <CalendarClock className="h-3.5 w-3.5" /> Ver agenda de esta oficina
              </Link>
            )}
          </div>
        }
      />

      <div className="max-w-4xl mx-auto px-3 sm:px-6 py-5 space-y-6">
        <p className="text-sm" style={{ color: theme.textSecondary }}>
          Horarios de atención, cupos y feriados por dependencia. Las dependencias sin
          configurar usan el horario por defecto (lun–vie 08:30–13:00).
        </p>

        {/* Horario semanal */}
        <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${theme.border}`, backgroundColor: theme.card }}>
          <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${theme.border}` }}>
            <h2 className="font-semibold text-sm" style={{ color: theme.text }}>Horario semanal</h2>
            <button
              onClick={copiarLunesAHabiles}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors"
              style={{ backgroundColor: theme.backgroundSecondary, color: theme.textSecondary }}
              title="Copia el horario de Lunes a Martes, Miércoles, Jueves y Viernes"
            >
              <Copy className="h-3.5 w-3.5" /> Copiar Lunes a días hábiles
            </button>
          </div>
          {dias.map((d, i) => (
            <div
              key={d.dia_semana}
              className="flex items-center gap-3 px-4 py-2.5 flex-wrap sm:flex-nowrap"
              style={{
                borderBottom: i < 6 ? `1px solid ${theme.border}` : undefined,
                borderTop: i === 5 ? `1px dashed ${theme.border}` : undefined,
                backgroundColor: d.activo ? 'transparent' : theme.backgroundSecondary,
              }}
            >
              <div className="flex items-center gap-2.5 w-28 shrink-0">
                <ToggleSwitch checked={d.activo} onChange={(v) => setDia(i, { activo: v })} />
                <span className="text-sm font-medium" style={{ color: d.activo ? theme.text : theme.textSecondary }}>
                  {DIAS_CORTO[d.dia_semana]}
                </span>
              </div>
              <input
                type="time"
                value={d.hora_inicio}
                disabled={!d.activo}
                onChange={(e) => setDia(i, { hora_inicio: e.target.value })}
                className="px-2 py-1.5 rounded-md text-sm disabled:opacity-40"
                style={inputStyle}
              />
              <span style={{ color: theme.textSecondary }}>a</span>
              <input
                type="time"
                value={d.hora_fin}
                disabled={!d.activo}
                onChange={(e) => setDia(i, { hora_fin: e.target.value })}
                className="px-2 py-1.5 rounded-md text-sm disabled:opacity-40"
                style={inputStyle}
              />
              <div className="flex items-center gap-1.5 ml-auto">
                <span className="text-xs" style={{ color: theme.textSecondary }}>Cupo por turno</span>
                <input
                  type="number"
                  min={1}
                  value={d.cupo_max_por_slot}
                  disabled={!d.activo}
                  onChange={(e) => setDia(i, { cupo_max_por_slot: Math.max(1, Number(e.target.value) || 1) })}
                  className="w-16 px-2 py-1.5 rounded-md text-sm disabled:opacity-40"
                  style={inputStyle}
                />
              </div>
            </div>
          ))}
          <div className="px-4 py-3" style={{ borderTop: `1px solid ${theme.border}`, backgroundColor: theme.backgroundSecondary }}>
            <button
              onClick={guardar}
              disabled={guardando || !depId}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-white disabled:opacity-60"
              style={{ backgroundColor: theme.primary }}
            >
              <Save className="h-4 w-4" /> {guardando ? 'Guardando...' : 'Guardar horarios'}
            </button>
          </div>
        </div>

        {/* Feriados y aperturas especiales */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-sm" style={{ color: theme.text }}>
              Feriados y aperturas especiales
              {excepciones.length > 0 && (
                <span className="ml-2 text-xs font-normal px-2 py-0.5 rounded-full" style={{ backgroundColor: theme.backgroundSecondary, color: theme.textSecondary }}>
                  {excepciones.length}
                </span>
              )}
            </h2>
            <button
              onClick={() => {
                setNuevoTipo('cierre');
                setSheetOpen(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium"
              style={{ backgroundColor: theme.primary + '18', color: theme.primary }}
            >
              <Plus className="h-4 w-4" /> Agregar
            </button>
          </div>

          {excepcionesFiltradas.length === 0 ? (
            <div
              className="text-center py-10 rounded-xl flex flex-col items-center gap-2"
              style={{ backgroundColor: theme.backgroundSecondary, color: theme.textSecondary }}
            >
              <PartyPopper className="h-7 w-7" style={{ color: theme.textSecondary }} />
              <p className="text-sm">
                {search ? 'Sin resultados para la búsqueda.' : 'Sin feriados ni aperturas especiales cargadas para esta oficina.'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {excepcionesFiltradas.map((e) => {
                const d = new Date(`${e.fecha}T12:00:00`);
                const esCierre = e.tipo === 'cierre';
                const color = esCierre ? '#ef4444' : '#10b981';
                return (
                  <div
                    key={e.id}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                    style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
                  >
                    <div
                      className="w-12 text-center px-1 py-1 rounded-lg text-[10px] uppercase font-bold leading-tight shrink-0"
                      style={{ backgroundColor: theme.backgroundSecondary, color: theme.textSecondary }}
                    >
                      <div className="text-base font-bold" style={{ color }}>{d.getDate().toString().padStart(2, '0')}</div>
                      <div>{d.toLocaleDateString('es-AR', { month: 'short' }).replace('.', '')}</div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm capitalize" style={{ color: theme.text }}>
                          {d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ backgroundColor: `${color}20`, color }}>
                          {esCierre ? 'Cierre' : 'Apertura especial'}
                        </span>
                      </div>
                      {e.motivo && (
                        <p className="text-xs mt-0.5 truncate" style={{ color: theme.textSecondary }}>{e.motivo}</p>
                      )}
                    </div>
                    <button onClick={() => borrarExcepcion(e.id)} className="p-1.5 rounded-lg shrink-0" style={{ color: '#ef4444' }} title="Eliminar">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Nuevo feriado / apertura especial">
        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase mb-1" style={{ color: theme.textSecondary }}>Fecha</p>
            <input type="date" value={nuevaFecha} onChange={(e) => setNuevaFecha(e.target.value)} className="w-full px-3 py-2 rounded-lg" style={inputStyle} />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase mb-1" style={{ color: theme.textSecondary }}>Tipo</p>
            <ModernSelect
              value={nuevoTipo}
              onChange={setNuevoTipo}
              options={[
                { value: 'cierre', label: 'Cierre / Feriado' },
                { value: 'apertura_especial', label: 'Apertura especial' },
              ]}
            />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase mb-1" style={{ color: theme.textSecondary }}>Motivo (opcional)</p>
            <input type="text" value={nuevoMotivo} onChange={(e) => setNuevoMotivo(e.target.value)} placeholder="Feriado nacional, receso..." className="w-full px-3 py-2 rounded-lg" style={inputStyle} />
          </div>
          <button onClick={agregarExcepcion} className="w-full py-2.5 rounded-lg font-medium text-white" style={{ backgroundColor: theme.primary }}>
            Agregar
          </button>
        </div>
      </Sheet>
    </div>
  );
}
