import { useEffect, useMemo, useState, useCallback } from 'react';
import { Blocks, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from '../../contexts/ThemeContext';
import { StickyPageHeader } from '../../components/ui/StickyPageHeader';
import { ModernSelect, type SelectOption } from '../../components/ui/ModernSelect';
import { municipiosApi, modulosAdminApi } from '../../lib/api';
import { MODULOS, moduloEfectivo, type ModuloDef } from '../../lib/enums/modulos';

interface MunicipioMini {
  id: number;
  nombre: string;
  codigo: string;
  activo: boolean;
  es_demo?: boolean;
}

interface FilaModulo {
  modulo: string;
  activo: boolean;
}

// Verde semántico "módulo activo" (mismo verde de estados finalizados de la app)
const COLOR_ACTIVO = '#10b981';

export default function ModulosMunicipio() {
  const { theme } = useTheme();
  const [municipios, setMunicipios] = useState<MunicipioMini[]>([]);
  const [muniId, setMuniId] = useState<number | null>(null);
  const [filas, setFilas] = useState<FilaModulo[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await municipiosApi.getAll();
        setMunicipios((res.data as MunicipioMini[]).filter(m => m.activo));
      } catch {
        toast.error('Error cargando municipios');
      }
    })();
  }, []);

  const cargarModulos = useCallback(async (id: number) => {
    setLoading(true);
    try {
      const res = await modulosAdminApi.list(id);
      setFilas(res.data || []);
    } catch {
      toast.error('Error cargando módulos del municipio');
      setFilas([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (muniId) cargarModulos(muniId);
  }, [muniId, cargarModulos]);

  const toggle = async (def: ModuloDef) => {
    if (!muniId) return;
    const actual = moduloEfectivo(def, filas);
    setSavingKey(def.key);
    try {
      await modulosAdminApi.upsert(muniId, def.key, !actual);
      toast.success(`${def.label}: ${!actual ? 'activado' : 'desactivado'}`);
      await cargarModulos(muniId);
    } catch {
      toast.error(`No se pudo cambiar ${def.label}`);
    } finally {
      setSavingKey(null);
    }
  };

  const muniOptions: SelectOption[] = useMemo(() => {
    const demos = municipios.filter(m => m.es_demo !== false);
    const productivos = municipios.filter(m => m.es_demo === false);
    return [
      ...productivos.map(m => ({ value: String(m.id), label: `${m.nombre} (productivo)` })),
      ...demos.map(m => ({ value: String(m.id), label: m.nombre })),
    ];
  }, [municipios]);

  return (
    <div className="space-y-6">
      <StickyPageHeader
        icon={<Blocks className="h-5 w-5" />}
        title="Módulos por municipio"
      />

      <div className="max-w-md">
        <p className="text-xs font-semibold uppercase mb-1" style={{ color: theme.textSecondary }}>
          Municipio
        </p>
        <ModernSelect
          value={muniId ? String(muniId) : ''}
          onChange={(v) => setMuniId(v ? Number(v) : null)}
          options={muniOptions}
          placeholder="Elegí un municipio..."
          searchable
        />
      </div>

      {muniId && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3" style={{ opacity: loading ? 0.5 : 1 }}>
          {MODULOS.map(def => {
            const activo = moduloEfectivo(def, filas);
            const Icon = def.icon;
            const color = activo ? COLOR_ACTIVO : theme.textSecondary;
            return (
              <button
                key={def.key}
                onClick={() => toggle(def)}
                disabled={savingKey !== null || loading}
                className="text-left rounded-xl p-4 transition-all duration-200 hover:scale-[1.01] disabled:opacity-60"
                style={{
                  backgroundColor: theme.card,
                  border: `1px solid ${activo ? `${color}60` : theme.border}`,
                }}
              >
                <div className="flex items-start gap-3">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: `${color}18`, color }}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-sm" style={{ color: theme.text }}>{def.label}</h3>
                      {def.optIn && (
                        <span
                          className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full uppercase"
                          style={{ backgroundColor: `${theme.primary}15`, color: theme.primary }}
                          title="Módulo opt-in: sin configurar arranca oculto"
                        >
                          opt-in
                        </span>
                      )}
                    </div>
                    <p className="text-xs mt-0.5" style={{ color: theme.textSecondary }}>{def.descripcion}</p>
                  </div>
                  <span
                    className="flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full flex-shrink-0"
                    style={{ backgroundColor: `${color}18`, color }}
                  >
                    {activo ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                    {savingKey === def.key ? '...' : activo ? 'Activo' : 'Apagado'}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {muniId && (
        <p className="text-xs" style={{ color: theme.textSecondary }}>
          Los cambios impactan al instante en el sidebar y las rutas de los usuarios de ese
          municipio (al recargar la app). Los módulos opt-in (Tesorería, Órdenes de trabajo)
          arrancan ocultos hasta activarlos acá.
        </p>
      )}
    </div>
  );
}
