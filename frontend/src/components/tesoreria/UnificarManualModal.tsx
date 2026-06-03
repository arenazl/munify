/**
 * Modal de UNIFICACION MANUAL de contactos.
 *
 * Caso de uso: el usuario sabe que "Juan Carlos" y "Pepe Carlos" son la
 * misma persona, pero la similaridad automatica del nombre no las matchea
 * (por ejemplo apellidos distintos o motes). El usuario los elige a mano
 * desde dos buscadores y aprieta Unificar.
 *
 * Se distingue del modal automatico (UnificarContactosModal) en que aca
 * no se sugieren grupos por algoritmo: el usuario controla totalmente cuales
 * dos contactos unificar.
 *
 * Backend: reutiliza el mismo endpoint POST /tesoreria/contactos/merge.
 */
import { useEffect, useState, useMemo } from 'react';
import { GitMerge, Loader2, ArrowDown, X, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Sheet } from '../ui/Sheet';
import { ModernSelect } from '../ui/ModernSelect';
import { PrimaryButton } from '../ui/PrimaryButton';
import { ConfirmModal } from '../ui/ConfirmModal';
import { contactosApi } from '../../lib/api';
import { useTheme } from '../../contexts/ThemeContext';
import type { Contacto, TipoContacto } from '../../types';
import { TIPO_CONTACTO_LABELS, TIPO_CONTACTO_COLORS } from '../../lib/contactoIcons';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Se dispara despues de cada merge exitoso, para que la pagina padre
   *  refresque la lista. */
  onMerged?: () => void;
}

export function UnificarManualModal({ open, onClose, onMerged }: Props) {
  const { theme } = useTheme();
  const [contactos, setContactos] = useState<Contacto[]>([]);
  const [loading, setLoading] = useState(false);
  const [merging, setMerging] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Ids elegidos por el usuario en los 2 combos
  const [keepId, setKeepId] = useState<number | null>(null);
  const [mergeId, setMergeId] = useState<number | null>(null);

  // Carga los contactos activos al abrir
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setKeepId(null);
    setMergeId(null);
    contactosApi.list({ activo: true, limit: 5000 })
      .then(r => setContactos(r.data || []))
      .catch(() => toast.error('Error cargando contactos'))
      .finally(() => setLoading(false));
  }, [open]);

  // Opciones del combo: solo contactos distintos al otro lado (evita unir A=A).
  // Y mostramos el TIPO al lado del nombre para que el user no se confunda.
  const opcionesPara = (excluirId: number | null) => {
    return contactos
      .filter(c => c.id !== excluirId)
      .map(c => {
        const tipo = c.tipo as TipoContacto;
        const label = `${c.nombre}${c.apellido ? ' ' + c.apellido : ''}` +
          (c.dni ? ` · DNI ${c.dni}` : '') +
          ` · ${TIPO_CONTACTO_LABELS[tipo] || c.tipo}`;
        return {
          value: String(c.id),
          label,
          color: TIPO_CONTACTO_COLORS[tipo] || theme.textSecondary,
        };
      });
  };

  const opcionesKeep = useMemo(() => opcionesPara(mergeId), [contactos, mergeId]);
  const opcionesMerge = useMemo(() => opcionesPara(keepId), [contactos, keepId]);

  const keep = contactos.find(c => c.id === keepId) || null;
  const merge = contactos.find(c => c.id === mergeId) || null;

  const canUnificar = keepId !== null && mergeId !== null && keepId !== mergeId;

  const handleUnificar = async () => {
    if (!canUnificar || !keep || !merge) return;
    setMerging(true);
    try {
      const res = await contactosApi.merge({
        keep_id: keep.id,
        merge_ids: [merge.id],
        tipo_final: keep.tipo as string,
      });
      const data = res.data as {
        gastos_reapuntados: number;
        pagos_prog_reapuntados: number;
        merged_count: number;
      };
      toast.success(
        `Se unificaron 2 contactos en ${keep.nombre}. ` +
        `${data.gastos_reapuntados} gastos y ${data.pagos_prog_reapuntados} pagos programados reapuntados.`
      );
      setConfirmOpen(false);
      onMerged?.();
      onClose();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Error unificando contactos');
    } finally {
      setMerging(false);
    }
  };

  const renderCard = (label: string, c: Contacto | null, isWinner: boolean) => {
    if (!c) {
      return (
        <div
          className="rounded-xl p-4 text-center text-xs"
          style={{
            backgroundColor: theme.card,
            border: `2px dashed ${theme.border}`,
            color: theme.textSecondary,
          }}
        >
          {label}
        </div>
      );
    }
    const tipo = c.tipo as TipoContacto;
    const color = TIPO_CONTACTO_COLORS[tipo] || theme.primary;
    return (
      <div
        className="rounded-xl p-3 transition-all"
        style={{
          backgroundColor: theme.card,
          border: `2px solid ${isWinner ? '#10b981' : color}`,
          boxShadow: isWinner ? '0 0 0 4px #10b98115' : undefined,
        }}
      >
        <div className="flex items-start gap-2 flex-wrap">
          <span
            className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full"
            style={{ backgroundColor: `${color}25`, color }}
          >
            {TIPO_CONTACTO_LABELS[tipo] || c.tipo}
          </span>
          {isWinner && (
            <span
              className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full"
              style={{ backgroundColor: '#10b98125', color: '#10b981' }}
            >
              Mantener (ganador)
            </span>
          )}
        </div>
        <p className="text-base font-bold mt-1.5" style={{ color: theme.text }}>
          {c.nombre} {c.apellido || ''}
        </p>
        <div className="text-[11px] mt-1 space-y-0.5" style={{ color: theme.textSecondary }}>
          {c.dni && <p>DNI: <span className="font-mono">{c.dni}</span></p>}
          {c.telefono && <p>Tel: {c.telefono}</p>}
          {c.email && <p>Email: {c.email}</p>}
          {c.alias_pago && <p>Alias: <span className="font-mono">{c.alias_pago}</span></p>}
          {c.subtipo && <p>Subtipo: {c.subtipo}</p>}
        </div>
      </div>
    );
  };

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        title="Unificar dos contactos manualmente"
        description="Elegí los dos contactos que son la misma persona aunque tengan distinto nombre. Vos decidís cuál se mantiene."
      >
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin" style={{ color: theme.primary }} />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Cartel explicativo */}
            <div
              className="rounded-xl p-3 text-[12px] leading-relaxed"
              style={{
                background: `linear-gradient(135deg, ${theme.primary}10, ${theme.card})`,
                border: `1px solid ${theme.primary}30`,
                color: theme.textSecondary,
              }}
            >
              <p>
                <b>Cuándo usar esta unificación:</b> cuando dos contactos son la misma persona
                pero el sistema NO los detecta como duplicados (porque el nombre, apellido o DNI difieren).
                Por ejemplo: <i>“Juan Carlos”</i> y <i>“Pepe Carlos”</i>.
              </p>
              <p className="mt-1.5">
                Los <b>gastos y pagos programados</b> del contacto que se fusiona se reapuntan al
                contacto ganador. Esta acción <b>no se puede deshacer</b>.
              </p>
            </div>

            {/* Buscador "Contacto ganador" */}
            <div>
              <label className="block text-xs font-semibold mb-1.5 inline-flex items-center gap-1.5" style={{ color: theme.text }}>
                <Search className="h-3.5 w-3.5" /> Contacto que se MANTIENE (ganador)
              </label>
              <ModernSelect
                value={keepId != null ? String(keepId) : ''}
                onChange={(v) => setKeepId(v ? Number(v) : null)}
                options={opcionesKeep}
                placeholder="Buscar contacto por nombre, DNI, tipo..."
                searchable
              />
              {keep && <div className="mt-2">{renderCard('Ganador', keep, true)}</div>}
            </div>

            {/* Flecha */}
            <div className="flex justify-center">
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center"
                style={{ backgroundColor: `${theme.primary}15`, color: theme.primary }}
              >
                <ArrowDown className="h-4 w-4" />
              </div>
            </div>

            {/* Buscador "Contacto que se absorbe" */}
            <div>
              <label className="block text-xs font-semibold mb-1.5 inline-flex items-center gap-1.5" style={{ color: theme.text }}>
                <Search className="h-3.5 w-3.5" /> Contacto que se ABSORBE (se borra)
              </label>
              <ModernSelect
                value={mergeId != null ? String(mergeId) : ''}
                onChange={(v) => setMergeId(v ? Number(v) : null)}
                options={opcionesMerge}
                placeholder="Buscar el otro contacto..."
                searchable
              />
              {merge && <div className="mt-2">{renderCard('Se absorbe en el ganador', merge, false)}</div>}
            </div>

            {/* CTA */}
            <div className="pt-2 flex justify-end gap-2">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-sm transition-all hover:scale-105 active:scale-95"
                style={{ border: `1px solid ${theme.border}`, color: theme.text }}
              >
                Cancelar
              </button>
              <PrimaryButton
                onClick={() => setConfirmOpen(true)}
                disabled={!canUnificar}
                icon={<GitMerge className="h-4 w-4" />}
              >
                Unificar
              </PrimaryButton>
            </div>
          </div>
        )}
      </Sheet>

      <ConfirmModal
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="¿Confirmar unificación?"
        message={
          keep && merge
            ? `Se va a fusionar "${merge.nombre} ${merge.apellido || ''}" dentro de "${keep.nombre} ${keep.apellido || ''}". Todos los gastos y pagos programados del segundo se reapuntarán al primero. Esta acción no se puede deshacer.`
            : ''
        }
        confirmText={merging ? 'Unificando...' : 'Sí, unificar'}
        cancelText="Cancelar"
        loading={merging}
        onConfirm={handleUnificar}
        variant="danger"
      />
    </>
  );
}
