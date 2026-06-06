import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Trash2, Plus, Save } from 'lucide-react';
import { toast } from 'sonner';
import { agendaApi, dependenciasApi } from '../lib/api';
import { useTheme } from '../contexts/ThemeContext';
import { ModernSelect, type SelectOption } from '../components/ui/ModernSelect';
import { Sheet } from '../components/ui/Sheet';

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
  const [deps, setDeps] = useState<DepItem[]>([]);
  const [depId, setDepId] = useState('');
  const [dias, setDias] = useState<DiaConfig[]>(defaultDias());
  const [excepciones, setExcepciones] = useState<Excepcion[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [nuevaFecha, setNuevaFecha] = useState('');
  const [nuevoTipo, setNuevoTipo] = useState('cierre');
  const [nuevoMotivo, setNuevoMotivo] = useState('');

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
    if (depId) cargar();
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
      toast.success('Agenda guardada');
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
      toast.success('Feriado agregado');
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
      cargar();
    } catch {
      toast.error('No se pudo borrar');
    }
  };

  const depOptions: SelectOption[] = useMemo(
    () => deps.map((d) => ({ value: String(d.id), label: d.nombre || `Dependencia ${d.id}` })),
    [deps],
  );

  const inputStyle = {
    backgroundColor: theme.card,
    color: theme.text,
    border: `1px solid ${theme.border}`,
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="flex items-center gap-2 mb-1" style={{ color: theme.text }}>
        <CalendarDays className="h-5 w-5" style={{ color: theme.primary }} />
        <h1 className="text-xl font-semibold">Configuración de agenda</h1>
      </div>
      <p className="text-sm mb-5" style={{ color: theme.textSecondary }}>
        Horarios de atención, cupos y feriados por dependencia. Las dependencias sin
        configurar usan el horario por defecto (lun–vie 08:30–13:00).
      </p>

      <div className="mb-5 max-w-xs">
        <ModernSelect value={depId} onChange={setDepId} options={depOptions} placeholder="Dependencia" label="Dependencia" />
      </div>

      {/* Grilla de dias */}
      <div className="rounded-xl overflow-hidden mb-6" style={{ border: `1px solid ${theme.border}` }}>
        {dias.map((d, i) => (
          <div
            key={d.dia_semana}
            className="flex items-center gap-3 px-3 py-2.5"
            style={{ borderBottom: i < 6 ? `1px solid ${theme.border}` : undefined, backgroundColor: d.activo ? theme.card : theme.backgroundSecondary }}
          >
            <label className="flex items-center gap-2 w-32 shrink-0 cursor-pointer">
              <input type="checkbox" checked={d.activo} onChange={(e) => setDia(i, { activo: e.target.checked })} />
              <span className="text-sm font-medium" style={{ color: theme.text }}>{DIAS[d.dia_semana]}</span>
            </label>
            <input type="time" value={d.hora_inicio} disabled={!d.activo} onChange={(e) => setDia(i, { hora_inicio: e.target.value })} className="px-2 py-1.5 rounded-md text-sm" style={inputStyle} />
            <span style={{ color: theme.textSecondary }}>a</span>
            <input type="time" value={d.hora_fin} disabled={!d.activo} onChange={(e) => setDia(i, { hora_fin: e.target.value })} className="px-2 py-1.5 rounded-md text-sm" style={inputStyle} />
            <div className="flex items-center gap-1.5 ml-auto">
              <span className="text-xs" style={{ color: theme.textSecondary }}>Cupo</span>
              <input
                type="number"
                min={1}
                value={d.cupo_max_por_slot}
                disabled={!d.activo}
                onChange={(e) => setDia(i, { cupo_max_por_slot: Math.max(1, Number(e.target.value) || 1) })}
                className="w-16 px-2 py-1.5 rounded-md text-sm"
                style={inputStyle}
              />
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={guardar}
        disabled={guardando || !depId}
        className="flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-white mb-8 disabled:opacity-60"
        style={{ backgroundColor: theme.primary }}
      >
        <Save className="h-4 w-4" /> {guardando ? 'Guardando...' : 'Guardar horarios'}
      </button>

      {/* Excepciones */}
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-semibold" style={{ color: theme.text }}>Feriados y cierres</h2>
        <button onClick={() => setSheetOpen(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium" style={{ backgroundColor: theme.primary + '22', color: theme.primary }}>
          <Plus className="h-4 w-4" /> Agregar
        </button>
      </div>
      {excepciones.length === 0 ? (
        <p className="text-sm" style={{ color: theme.textSecondary }}>Sin feriados cargados.</p>
      ) : (
        <div className="space-y-2">
          {excepciones.map((e) => (
            <div key={e.id} className="flex items-center justify-between px-3 py-2 rounded-lg" style={{ border: `1px solid ${theme.border}` }}>
              <div style={{ color: theme.text }}>
                <span className="font-medium">{e.fecha}</span>
                <span className="text-xs ml-2" style={{ color: theme.textSecondary }}>{e.tipo === 'cierre' ? 'Cierre' : 'Apertura especial'}{e.motivo ? ` · ${e.motivo}` : ''}</span>
              </div>
              <button onClick={() => borrarExcepcion(e.id)} style={{ color: '#ef4444' }}>
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Nuevo feriado / cierre">
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
